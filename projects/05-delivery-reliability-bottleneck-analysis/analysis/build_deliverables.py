from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parent
RESULTS_PATH = ROOT / "outputs" / "results.json"
ARTIFACT_PATH = ROOT / "artifact.json"
DB_PATH = ROOT / "outputs" / "analysis.sqlite"


def pct(value: float, digits: int = 1) -> str:
    return f"{value * 100:.{digits}f}%"


def number(value: float, digits: int = 1) -> str:
    return f"{value:,.{digits}f}"


def sqlite_type(values: list[object]) -> str:
    non_null = [value for value in values if value is not None]
    if non_null and all(isinstance(value, bool | int) for value in non_null):
        return "INTEGER"
    if non_null and all(isinstance(value, bool | int | float) for value in non_null):
        return "REAL"
    return "TEXT"


def write_table(connection: sqlite3.Connection, table: str, rows: list[dict]) -> None:
    if not rows:
        raise ValueError(f"Cannot write empty table: {table}")
    columns = list(rows[0])
    connection.execute(f'DROP TABLE IF EXISTS "{table}"')
    definitions = ", ".join(
        f'"{column}" {sqlite_type([row.get(column) for row in rows])}' for column in columns
    )
    connection.execute(f'CREATE TABLE "{table}" ({definitions})')
    placeholders = ", ".join("?" for _ in columns)
    column_sql = ", ".join(f'"{column}"' for column in columns)
    connection.executemany(
        f'INSERT INTO "{table}" ({column_sql}) VALUES ({placeholders})',
        [[row.get(column) for column in columns] for row in rows],
    )


def query_rows(connection: sqlite3.Connection, sql: str) -> list[dict]:
    cursor = connection.execute(sql)
    columns = [description[0] for description in cursor.description]
    return [dict(zip(columns, row, strict=True)) for row in cursor.fetchall()]


def main() -> None:
    results = json.loads(RESULTS_PATH.read_text(encoding="utf-8"))
    summary = results["summary"]
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    ship_rows = results["ship_speed"]
    fast_ship = next(row for row in ship_rows if row["ship_speed_band"] == "Within 2 days")
    slow_ship = next(row for row in ship_rows if row["ship_speed_band"] == "Over 7 days")
    ship_risk_multiple = slow_ship["late_rate"] / fast_ship["late_rate"]

    state_rows = results["state_opportunity"]
    top_state = state_rows[0]
    category_rows = results["category_opportunity"]
    top_category = category_rows[0]
    seller_rows = results["seller_opportunity"]
    top_seller = seller_rows[0]
    route_rows = results["route_opportunity"]
    top_route = route_rows[0]
    monthly_rows = results["monthly"]
    worst_month = max(monthly_rows, key=lambda row: row["late_rate"])

    review_status = [
        {
            "delivery_status": "On time",
            "sort_order": 1,
            "review_eligible_orders": summary["on_time_review_eligible_orders"],
            "avg_review": round(summary["avg_review_on_time"], 4),
            "low_review_rate": round(summary["low_review_rate_on_time"], 4),
        },
        {
            "delivery_status": "Late",
            "sort_order": 2,
            "review_eligible_orders": summary["late_review_eligible_orders"],
            "avg_review": round(summary["avg_review_late"], 4),
            "low_review_rate": round(summary["low_review_rate_late"], 4),
        },
    ]

    table_rows = {
        "dashboard_summary": [summary],
        "monthly": monthly_rows,
        "ship_speed": ship_rows,
        "review_status": review_status,
        "seller_opportunity": seller_rows,
        "seller_detail": results["seller_detail"],
        "route_opportunity": route_rows,
        "state_opportunity": state_rows,
        "category_opportunity": category_rows,
        "state_detail": results["state_detail"],
    }
    sql_by_dataset = {
        "summary": "SELECT * FROM dashboard_summary",
        "monthly": "SELECT * FROM monthly ORDER BY month",
        "ship_speed": "SELECT * FROM ship_speed ORDER BY band_order",
        "review_status": "SELECT * FROM review_status ORDER BY sort_order",
        "seller_opportunity": "SELECT * FROM seller_opportunity ORDER BY excess_late_orders DESC LIMIT 12",
        "seller_detail": "SELECT * FROM seller_detail ORDER BY late_rate DESC, orders DESC",
        "route_opportunity": "SELECT * FROM route_opportunity ORDER BY excess_late_orders DESC LIMIT 12",
        "state_opportunity": "SELECT * FROM state_opportunity ORDER BY excess_late_orders DESC LIMIT 12",
        "category_opportunity": "SELECT * FROM category_opportunity ORDER BY excess_late_orders DESC LIMIT 12",
        "state_detail": "SELECT * FROM state_detail ORDER BY late_rate DESC, orders DESC",
    }
    with sqlite3.connect(DB_PATH) as connection:
        for table, rows in table_rows.items():
            write_table(connection, table, rows)
        connection.commit()
        snapshot_datasets = {
            dataset: query_rows(connection, sql) for dataset, sql in sql_by_dataset.items()
        }

    common_definitions = [
        "Late-delivery rate = orders with delivery_delay_hours > 0 / analyzed orders",
        "Material late rate = orders with delivery_delay_hours > 24 / analyzed orders",
        "Low-review rate = review-eligible orders with review_score <= 2 / review-eligible orders",
        "Excess late orders = observed late orders - (orders x network late-delivery rate)",
        "Purchase-to-carrier time = time_to_ship_hours / 24",
        "Seller metrics use complete single-seller orders so one final delivery outcome is not assigned to multiple sellers",
        "High-volume seller = at least 100 complete single-seller orders",
        "High-volume route = at least 200 complete single-seller orders",
    ]
    filters_by_dataset = {
        "summary": ["One row per complete order"],
        "monthly": ["Purchase months with at least 500 analyzed orders"],
        "ship_speed": ["One row per complete order"],
        "review_status": ["Orders with one consistent review score"],
        "seller_opportunity": ["Single-seller orders", "Sellers with at least 100 analyzed orders"],
        "seller_detail": ["Single-seller orders", "Sellers with at least 100 analyzed orders"],
        "route_opportunity": ["Single-seller orders", "Seller-to-customer state routes with at least 200 analyzed orders"],
        "state_opportunity": ["Customer states with at least 200 analyzed orders"],
        "category_opportunity": ["Product categories with at least 500 analyzed orders"],
        "state_detail": ["Customer states with at least 200 analyzed orders"],
    }

    def make_source(dataset: str, label: str) -> dict:
        table = "dashboard_summary" if dataset == "summary" else dataset
        return {
            "id": f"{dataset}_source",
            "label": label,
            "path": "outputs/analysis.sqlite",
            "href": "https://huggingface.co/datasets/miminmoons/olist-ecommerce-for-delivery-and-review-prediction",
            "query": {
                "engine": "SQLite",
                "sql": sql_by_dataset[dataset],
                "description": "Reviewed dashboard extract produced from an order-grain normalization of the cleaned Olist item-level parquet.",
                "executed_at": generated_at,
                "language": "sql",
                "filters": filters_by_dataset[dataset],
                "metric_definitions": common_definitions,
                "tables_used": [table],
            },
        }

    sources = {
        "summary": make_source("summary", "Delivery summary metrics"),
        "monthly": make_source("monthly", "Monthly delivery reliability"),
        "ship_speed": make_source("ship_speed", "Purchase-to-carrier speed bands"),
        "review_status": make_source("review_status", "Delivery status and review outcomes"),
        "seller_opportunity": make_source("seller_opportunity", "Seller opportunity ranking"),
        "seller_detail": make_source("seller_detail", "Seller delivery-risk detail"),
        "route_opportunity": make_source("route_opportunity", "Seller-to-customer route ranking"),
        "state_opportunity": make_source("state_opportunity", "State opportunity ranking"),
        "category_opportunity": make_source("category_opportunity", "Category opportunity ranking"),
        "state_detail": make_source("state_detail", "State delivery-risk detail"),
    }

    cards = [
        {
            "id": "orders_card",
            "description": "Unique orders after normalizing the item-level source to order grain.",
            "dataset": "summary",
            "sourceId": sources["summary"]["id"],
            "metrics": [{"label": "Orders analyzed", "field": "analyzed_orders", "format": "compact"}],
        },
        {
            "id": "late_rate_card",
            "description": "Share delivered after the estimated delivery timestamp.",
            "dataset": "summary",
            "sourceId": sources["summary"]["id"],
            "metrics": [
                {"label": "Late-delivery rate", "field": "late_rate", "format": "percent"},
                {"label": "Over 24h late", "field": "late_24h_rate", "format": "percent"},
            ],
        },
        {
            "id": "delay_card",
            "description": "Delay duration among late orders only.",
            "dataset": "summary",
            "sourceId": sources["summary"]["id"],
            "metrics": [
                {"label": "Median late days", "field": "median_late_days", "format": "number"},
                {"label": "90th percentile", "field": "p90_late_days", "format": "number"},
            ],
        },
        {
            "id": "review_gap_card",
            "description": "Late-order average rating minus on-time average rating; association, not causation.",
            "dataset": "summary",
            "sourceId": sources["summary"]["id"],
            "metrics": [
                {"label": "Review-score gap", "field": "review_score_gap", "format": "number", "signed": True},
                {"label": "Late-order average", "field": "avg_review_late", "format": "number"},
            ],
        },
    ]

    charts = [
        {
            "id": "monthly_late_rate",
            "title": "Monthly late-delivery rate",
            "subtitle": f"{worst_month['month']} peaked at {pct(worst_month['late_rate'])}; the full-period network rate was {pct(summary['late_rate'])}.",
            "intent": "trend",
            "question": "When did delivery reliability deteriorate?",
            "rationale": "A monthly line exposes sustained movement and operational spikes across 20 complete-volume periods.",
            "type": "line",
            "dataset": "monthly",
            "sourceId": sources["monthly"]["id"],
            "encodings": {
                "x": {"field": "month", "type": "temporal", "label": "Purchase month"},
                "y": {"field": "late_rate", "type": "quantitative", "format": "percent", "label": "Late-delivery rate"},
                "tooltip": [
                    {"field": "orders", "type": "quantitative", "format": "compact", "label": "Orders"},
                    {"field": "late_orders", "type": "quantitative", "format": "compact", "label": "Late orders"},
                    {"field": "avg_review", "type": "quantitative", "format": "number", "label": "Average review"},
                ],
            },
            "valueFormat": "percent",
            "layout": "full",
            "palette": {"kind": "sequential"},
            "referenceLines": [
                {"axis": "y", "value": summary["late_rate"], "label": "Network rate", "color": "neutral", "lineStyle": "dashed"}
            ],
            "settings": {"showPoints": "always"},
        },
        {
            "id": "ship_speed_late_rate",
            "title": "Late-delivery rate by purchase-to-carrier time",
            "subtitle": f"Orders handed to the carrier after seven days were {ship_risk_multiple:.1f}x as likely to arrive late as orders handed off within two days.",
            "intent": "comparison",
            "question": "Does slow carrier handoff identify higher delivery risk?",
            "rationale": "Ordered bars make the monotonic risk gradient easy to compare without implying causality.",
            "type": "bar",
            "dataset": "ship_speed",
            "sourceId": sources["ship_speed"]["id"],
            "encodings": {
                "x": {"field": "ship_speed_band", "type": "ordinal", "label": "Purchase-to-carrier time"},
                "y": {"field": "late_rate", "type": "quantitative", "format": "percent", "label": "Late-delivery rate"},
                "tooltip": [
                    {"field": "orders", "type": "quantitative", "format": "compact", "label": "Orders"},
                    {"field": "avg_review", "type": "quantitative", "format": "number", "label": "Average review"},
                    {"field": "low_review_rate", "type": "quantitative", "format": "percent", "label": "Low-review rate"},
                ],
            },
            "valueFormat": "percent",
            "layout": "half",
            "palette": {"kind": "sequential"},
            "labels": {"values": "all"},
            "settings": {"sort": "custom", "showValues": True},
        },
        {
            "id": "review_status",
            "title": "Low-review rate by delivery status",
            "subtitle": f"Low reviews occurred on {pct(summary['low_review_rate_late'])} of late orders versus {pct(summary['low_review_rate_on_time'])} of on-time orders.",
            "intent": "comparison",
            "question": "How strongly is lateness associated with poor customer ratings?",
            "rationale": "A two-category bar shows the observed satisfaction gap while retaining denominators in the tooltip.",
            "type": "bar",
            "dataset": "review_status",
            "sourceId": sources["review_status"]["id"],
            "encodings": {
                "x": {"field": "delivery_status", "type": "nominal", "label": "Delivery status"},
                "y": {"field": "low_review_rate", "type": "quantitative", "format": "percent", "label": "Reviews scored 1-2"},
                "tooltip": [
                    {"field": "review_eligible_orders", "type": "quantitative", "format": "compact", "label": "Review-eligible orders"},
                    {"field": "avg_review", "type": "quantitative", "format": "number", "label": "Average review"},
                ],
            },
            "valueFormat": "percent",
            "layout": "half",
            "palette": {"kind": "sequential"},
            "labels": {"values": "all"},
            "settings": {"showValues": True},
        },
        {
            "id": "seller_opportunity",
            "title": "Excess late orders by high-volume seller",
            "subtitle": f"{top_seller['seller']} recorded about {number(top_seller['excess_late_orders'], 0)} more late orders than expected at the network rate.",
            "intent": "comparison",
            "question": "Which high-volume sellers contribute the largest volume-adjusted delivery gap?",
            "rationale": "Excess late orders balances seller volume and reliability while excluding ambiguous multi-seller orders.",
            "type": "horizontalBar",
            "dataset": "seller_opportunity",
            "sourceId": sources["seller_opportunity"]["id"],
            "encodings": {
                "x": {"field": "seller", "type": "nominal", "label": "Anonymized seller"},
                "y": {"field": "excess_late_orders", "type": "quantitative", "format": "number", "label": "Excess late orders"},
                "tooltip": [
                    {"field": "seller_state", "type": "nominal", "label": "Seller state"},
                    {"field": "orders", "type": "quantitative", "format": "compact", "label": "Orders"},
                    {"field": "late_rate", "type": "quantitative", "format": "percent", "label": "Late-delivery rate"},
                    {"field": "median_ship_days", "type": "quantitative", "format": "number", "label": "Median handoff days"},
                    {"field": "slow_handoff_rate", "type": "quantitative", "format": "percent", "label": "Over four-day handoff"},
                ],
            },
            "layout": "half",
            "palette": {"kind": "sequential"},
            "labels": {"values": "all"},
            "settings": {"sort": "descending", "showValues": True, "limit": 10},
        },
        {
            "id": "route_opportunity",
            "title": "Excess late orders by seller-to-customer route",
            "subtitle": f"{top_route['route']} had the largest volume-adjusted route gap at about {number(top_route['excess_late_orders'], 0)} excess late orders.",
            "intent": "comparison",
            "question": "Which state-to-state routes concentrate delivery underperformance?",
            "rationale": "Route-level excess volume identifies operational lanes where seller origin and customer destination overlap with poor reliability.",
            "type": "horizontalBar",
            "dataset": "route_opportunity",
            "sourceId": sources["route_opportunity"]["id"],
            "encodings": {
                "x": {"field": "route", "type": "nominal", "label": "Seller state to customer state"},
                "y": {"field": "excess_late_orders", "type": "quantitative", "format": "number", "label": "Excess late orders"},
                "tooltip": [
                    {"field": "orders", "type": "quantitative", "format": "compact", "label": "Orders"},
                    {"field": "late_rate", "type": "quantitative", "format": "percent", "label": "Late-delivery rate"},
                    {"field": "median_ship_days", "type": "quantitative", "format": "number", "label": "Median handoff days"},
                    {"field": "slow_handoff_rate", "type": "quantitative", "format": "percent", "label": "Over four-day handoff"},
                ],
            },
            "layout": "half",
            "palette": {"kind": "sequential"},
            "labels": {"values": "all"},
            "settings": {"sort": "descending", "showValues": True, "limit": 10},
        },
        {
            "id": "state_opportunity",
            "title": "Excess late orders by customer state",
            "subtitle": f"{top_state['customer_state']} contributed about {number(top_state['excess_late_orders'], 0)} more late orders than expected at the network rate.",
            "intent": "comparison",
            "question": "Where does delivery underperformance create the largest recoverable volume?",
            "rationale": "Volume-adjusted excess late orders avoids prioritizing tiny states solely because of volatile rates.",
            "type": "horizontalBar",
            "dataset": "state_opportunity",
            "sourceId": sources["state_opportunity"]["id"],
            "encodings": {
                "x": {"field": "customer_state", "type": "nominal", "label": "Customer state"},
                "y": {"field": "excess_late_orders", "type": "quantitative", "format": "number", "label": "Excess late orders"},
                "tooltip": [
                    {"field": "orders", "type": "quantitative", "format": "compact", "label": "Orders"},
                    {"field": "late_rate", "type": "quantitative", "format": "percent", "label": "Late-delivery rate"},
                    {"field": "avg_review", "type": "quantitative", "format": "number", "label": "Average review"},
                ],
            },
            "layout": "half",
            "palette": {"kind": "sequential"},
            "labels": {"values": "all"},
            "settings": {"sort": "descending", "showValues": True, "limit": 10},
        },
        {
            "id": "category_opportunity",
            "title": "Excess late orders by product category",
            "subtitle": f"{top_category['product_category']} had the largest volume-adjusted excess among categories with at least 500 orders.",
            "intent": "comparison",
            "question": "Which large product categories warrant the first operational audit?",
            "rationale": "Excess volume balances exposure and rate instead of ranking categories by rate alone.",
            "type": "horizontalBar",
            "dataset": "category_opportunity",
            "sourceId": sources["category_opportunity"]["id"],
            "encodings": {
                "x": {"field": "product_category", "type": "nominal", "label": "Product category"},
                "y": {"field": "excess_late_orders", "type": "quantitative", "format": "number", "label": "Excess late orders"},
                "tooltip": [
                    {"field": "orders", "type": "quantitative", "format": "compact", "label": "Orders"},
                    {"field": "late_rate", "type": "quantitative", "format": "percent", "label": "Late-delivery rate"},
                    {"field": "avg_review", "type": "quantitative", "format": "number", "label": "Average review"},
                ],
            },
            "layout": "half",
            "palette": {"kind": "sequential"},
            "labels": {"values": "all"},
            "settings": {"sort": "descending", "showValues": True, "limit": 10},
        },
    ]

    tables = [
        {
            "id": "seller_detail",
            "title": "High-volume seller delivery detail",
            "subtitle": "Single-seller orders only; sellers with at least 100 analyzed orders.",
            "dataset": "seller_detail",
            "defaultSort": {"field": "excess_late_orders", "direction": "desc"},
            "density": "dense",
            "sourceId": sources["seller_detail"]["id"],
            "layout": "full",
            "columns": [
                {"field": "seller", "label": "Seller", "type": "text"},
                {"field": "seller_state", "label": "State", "type": "text"},
                {"field": "orders", "label": "Orders", "format": "compact", "type": "number"},
                {"field": "late_orders", "label": "Late orders", "format": "compact", "type": "number"},
                {"field": "late_rate", "label": "Late rate", "format": "percent", "type": "percent"},
                {"field": "excess_late_orders", "label": "Excess late orders", "format": "number", "type": "number", "movement": True},
                {"field": "median_ship_days", "label": "Median handoff days", "format": "number", "type": "number"},
                {"field": "slow_handoff_rate", "label": "Over four-day handoff", "format": "percent", "type": "percent"},
                {"field": "avg_review", "label": "Average review", "format": "number", "type": "number"},
            ],
        },
        {
            "id": "state_detail",
            "title": "State delivery-risk detail",
            "subtitle": "States with at least 200 analyzed orders; sorted by late-delivery rate.",
            "dataset": "state_detail",
            "defaultSort": {"field": "late_rate", "direction": "desc"},
            "density": "dense",
            "sourceId": sources["state_detail"]["id"],
            "layout": "full",
            "columns": [
                {"field": "customer_state", "label": "State", "type": "text"},
                {"field": "orders", "label": "Orders", "format": "compact", "type": "number"},
                {"field": "late_orders", "label": "Late orders", "format": "compact", "type": "number"},
                {"field": "late_rate", "label": "Late rate", "format": "percent", "type": "percent"},
                {"field": "excess_late_orders", "label": "Excess late orders", "format": "number", "type": "number", "movement": True},
                {"field": "avg_review", "label": "Average review", "format": "number", "type": "number"},
                {"field": "median_ship_days", "label": "Median ship days", "format": "number", "type": "number"},
            ],
        }
    ]

    caveat_body = (
        "### Where delay risk becomes visible\n"
        f"Purchase-to-carrier handoff is the only pre-delivery stage available in this source. Risk rises after four days and reaches {pct(slow_ship['late_rate'])} after seven days, versus {pct(fast_ship['late_rate'])} within two days. "
        f"The largest seller exception was {top_seller['seller']}; the largest route exception was {top_route['route']}. These are strong operational signals, not proof of fault.\n\n"
        "### Three actions\n"
        f"1. Review {top_seller['seller']} and the next highest excess-volume sellers; trigger follow-up at four days without carrier handoff and escalation at seven.\n"
        f"2. Audit {top_route['route']}, {top_state['customer_state']} deliveries, and the {top_category['product_category']} category together to isolate route, assortment, and seller overlap.\n"
        "3. Contact customers before a likely promise-date miss and apply service recovery to protect review scores.\n\n"
        "### Limits\n"
        "This is descriptive, not causal. The anonymized source covers Brazilian orders from 2016-2018 and does not include carrier scans, warehouse events, or last-mile checkpoints. "
        "Seller analysis excludes multi-seller orders to avoid assigning one delivery outcome to several sellers. Conflicting review scores are excluded from review comparisons."
    )

    manifest = {
        "version": 1,
        "surface": "dashboard",
        "title": "Delivery Reliability & Bottleneck Analysis",
        "description": "An operations dashboard identifying where late-delivery risk and customer impact are concentrated across sellers, routes, regions, and product categories.",
        "generatedAt": generated_at,
        "cards": cards,
        "charts": charts,
        "tables": tables,
        "sources": [
            *sources.values(),
            {
                "id": "olist_original",
                "label": "Brazilian E-Commerce Public Dataset by Olist",
                "href": "https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce",
            },
        ],
        "blocks": [
            {"id": "hero_metrics", "type": "metric-strip", "cardIds": [card["id"] for card in cards]},
            {"id": "monthly_block", "type": "chart", "chartId": "monthly_late_rate", "layout": "full"},
            {"id": "ship_speed_block", "type": "chart", "chartId": "ship_speed_late_rate", "layout": "half"},
            {"id": "review_status_block", "type": "chart", "chartId": "review_status", "layout": "half"},
            {"id": "seller_opportunity_block", "type": "chart", "chartId": "seller_opportunity", "layout": "half"},
            {"id": "route_opportunity_block", "type": "chart", "chartId": "route_opportunity", "layout": "half"},
            {"id": "state_opportunity_block", "type": "chart", "chartId": "state_opportunity", "layout": "half"},
            {"id": "category_opportunity_block", "type": "chart", "chartId": "category_opportunity", "layout": "half"},
            {"id": "seller_detail_block", "type": "table", "tableId": "seller_detail", "layout": "full"},
            {"id": "state_detail_block", "type": "table", "tableId": "state_detail", "layout": "full"},
            {"id": "action_caveats", "type": "markdown", "body": caveat_body, "layout": "full"},
        ],
    }

    snapshot = {
        "version": 1,
        "generatedAt": generated_at,
        "status": "ready",
        "datasets": snapshot_datasets,
    }

    artifact = {
        "surface": "dashboard",
        "manifest": manifest,
        "snapshot": snapshot,
        "sources": manifest["sources"],
    }
    ARTIFACT_PATH.write_text(json.dumps(artifact, indent=2, ensure_ascii=False), encoding="utf-8")

    case_study = f"""# Delivery Reliability & Bottleneck Analysis

## Executive summary

I analyzed {summary['source_rows_item_level']:,} item-level records from the public Olist marketplace dataset and normalized them to {summary['analyzed_orders']:,} unique orders. {pct(summary['late_rate'])} missed the estimated delivery timestamp; late orders were a median {summary['median_late_days']:.1f} days late. The strongest operational signal was purchase-to-carrier time: orders handed off after seven days had a {pct(slow_ship['late_rate'])} late rate versus {pct(fast_ship['late_rate'])} within two days.

## Business question

Where should operations focus first to reduce late deliveries and protect customer satisfaction?

## Method

1. Normalized the item-level source to one record per order to prevent multi-item orders from inflating delivery counts.
2. Defined a late order as `delivery_delay_hours > 0`, matching the source definition of actual minus estimated delivery time.
3. Excluded {results['quality']['inconsistent_order_counts']['review_score']:,} orders with conflicting review scores from satisfaction comparisons only.
4. Restricted seller and route analysis to {summary['single_seller_orders']:,} single-seller orders so one delivery outcome was not attributed to multiple sellers.
5. Ranked sellers, routes, states, and categories by excess late orders relative to the {pct(summary['late_rate'])} network rate, balancing volume and reliability.
6. Used descriptive comparisons only; no causal claims were made.

## Findings

- {summary['late_orders']:,} of {summary['analyzed_orders']:,} orders were late ({pct(summary['late_rate'])}); {pct(summary['late_24h_rate'])} were more than 24 hours late.
- Late orders averaged {summary['avg_review_late']:.2f}/5 versus {summary['avg_review_on_time']:.2f}/5 for on-time orders. Low reviews occurred on {pct(summary['low_review_rate_late'])} of late orders versus {pct(summary['low_review_rate_on_time'])} of on-time orders.
- Purchase-to-carrier handoff beyond seven days was associated with {ship_risk_multiple:.1f}x the late-delivery rate of handoff within two days.
- {top_seller['seller']} had the largest seller-level gap among sellers with at least 100 analyzed orders: roughly {number(top_seller['excess_late_orders'], 0)} excess late orders.
- {top_route['route']} was the largest volume-adjusted seller-to-customer state route gap at roughly {number(top_route['excess_late_orders'], 0)} excess late orders.
- {worst_month['month']} was the worst high-volume month at {pct(worst_month['late_rate'])} late.
- {top_state['customer_state']} had the largest volume-adjusted state opportunity: roughly {number(top_state['excess_late_orders'], 0)} excess late orders versus the network rate.
- {top_category['product_category']} had the largest excess late-order volume among categories with at least 500 orders.

## Recommendations

1. Review {top_seller['seller']} and the next highest excess-volume sellers; trigger follow-up at four days without carrier handoff and escalation at seven.
2. Audit {top_route['route']}, {top_state['customer_state']} deliveries, and the {top_category['product_category']} category together to isolate route, assortment, and seller overlap.
3. Contact customers before a likely promise-date miss and apply service recovery to protect review scores.

## Limitations

- The anonymized Brazilian data covers 2016-2018, so the findings demonstrate analytical method rather than current company performance.
- The source lacks carrier scans, warehouse events, and last-mile checkpoints; it cannot prove which party caused a delay.
- Seller analysis excludes multi-seller orders, retaining {pct(summary['seller_analysis_coverage'])} of complete orders for unambiguous seller attribution.
- Small positive delays can include deliveries later on the promised calendar date because the estimate is timestamp-based.
- Multi-category orders contribute once to each applicable category.

## Sources

- Original dataset: https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce
- Cleaned analytical derivative: https://huggingface.co/datasets/miminmoons/olist-ecommerce-for-delivery-and-review-prediction
"""
    (ROOT / "CASE_STUDY.md").write_text(case_study, encoding="utf-8")

    interview = f"""# Interview preparation

## Before you present it

Do not claim this as your work until you can reproduce the analysis, explain every metric, and defend the caveats. A dashboard you cannot explain makes you look worse, not better.

## 60-second explanation

I analyzed a public Brazilian e-commerce dataset to identify where delivery reliability was breaking down. The source had {summary['source_rows_item_level']:,} item-level rows, so I first normalized it to {summary['analyzed_orders']:,} unique orders to avoid double counting. I found an overall late rate of {pct(summary['late_rate'])}. Orders taking over seven days to reach the carrier had a {pct(slow_ship['late_rate'])} late rate versus {pct(fast_ship['late_rate'])} when handed off within two days. I then isolated single-seller orders and ranked sellers, routes, regions, and product categories by excess late orders relative to the network baseline. {top_seller['seller']} and {top_route['route']} were the largest seller and route exceptions. I recommended earlier handoff alerts, focused operational audits, and proactive customer recovery, while being explicit that the data identifies risk signals rather than proven causes.

## Questions you must be able to answer

1. Why did you aggregate to order level? Multi-item orders otherwise inflate delivery counts.
2. Why not rank only by late rate? Tiny regions can show unstable rates; excess late orders balances exposure and performance.
3. Does slow handoff cause late delivery? Not proven. It is an operational risk signal in descriptive data.
4. Why exclude some reviews? {results['quality']['inconsistent_order_counts']['review_score']:,} orders had conflicting scores; excluding them avoids arbitrary selection.
5. Why exclude multi-seller orders from seller rankings? One final delivery outcome should not be assigned to several sellers; the retained single-seller population covers {pct(summary['seller_analysis_coverage'])} of complete orders.
6. What would you request next? Carrier scans, warehouse events, promised-service tier, seller handoff deadlines, and last-mile timestamps.
7. What is the main caveat? The data is historical and anonymized; this demonstrates method, not current Olist performance.
"""
    (ROOT / "INTERVIEW_PREP.md").write_text(interview, encoding="utf-8")

    chart_map = f"""# Dashboard chart map

| Section | Question | Visual | Supported takeaway |
|---|---|---|---|
| Monthly reliability | When did reliability deteriorate? | Line | {worst_month['month']} was the worst high-volume month. |
| Handoff timing | Where does observable delay risk begin? | Ordered bar | Risk rises after four days and jumps after seven. |
| Customer impact | How is lateness associated with reviews? | Two-category bar | Late orders are strongly associated with low reviews. |
| Seller exceptions | Which sellers concentrate excess late orders? | Ranked horizontal bar | {top_seller['seller']} is the largest high-volume seller exception. |
| Route exceptions | Which state pairs concentrate underperformance? | Ranked horizontal bar | {top_route['route']} is the largest route exception. |
| Regional opportunity | Which customer states create the largest gap? | Ranked horizontal bar | {top_state['customer_state']} has the largest state-level excess volume. |
| Category opportunity | Which product categories warrant audit? | Ranked horizontal bar | {top_category['product_category']} has the largest category-level excess volume. |

Palette policy: one restrained sequential color root with neutral references. All comparisons use direct labels and no redundant legends.
"""
    (ROOT / "CHART_MAP.md").write_text(chart_map, encoding="utf-8")

    print(json.dumps({
        "artifact": str(ARTIFACT_PATH),
        "generated_at": generated_at,
        "top_state": top_state,
        "top_category": top_category,
        "top_seller": top_seller,
        "top_route": top_route,
        "worst_month": worst_month,
        "ship_risk_multiple": round(ship_risk_multiple, 3),
    }, indent=2))


if __name__ == "__main__":
    main()
