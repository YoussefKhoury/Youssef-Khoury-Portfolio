from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / ".deps"))

import pandas as pd


def close(left: float, right: float, tolerance: float = 1e-9) -> bool:
    return abs(float(left) - float(right)) <= tolerance


def main() -> None:
    source = ROOT / "data" / "raw" / "olist_delivery_joined.parquet"
    results_path = ROOT / "outputs" / "results.json"
    database = ROOT / "outputs" / "analysis.sqlite"
    artifact_path = ROOT / "artifact.json"

    items = pd.read_parquet(source, engine="fastparquet")
    unique_orders = items.drop_duplicates("order_id").copy()
    unique_orders["late"] = unique_orders["delivery_delay_hours"] > 0
    unique_orders["late_24h"] = unique_orders["delivery_delay_hours"] > 24
    review_variants = items.groupby("order_id")["review_score"].nunique(dropna=False)
    seller_pairs = items.drop_duplicates(["order_id", "seller_id"]).copy()
    sellers_per_order = seller_pairs.groupby("order_id")["seller_id"].nunique()
    single_seller_orders = int((sellers_per_order == 1).sum())

    results = json.loads(results_path.read_text(encoding="utf-8"))
    artifact = json.loads(artifact_path.read_text(encoding="utf-8"))
    summary = results["summary"]

    checks = {
        "raw_item_rows_match": len(items) == summary["source_rows_item_level"],
        "unique_order_count_match": items["order_id"].nunique() == summary["analyzed_orders"],
        "late_order_count_match": int(unique_orders["late"].sum()) == summary["late_orders"],
        "late_rate_recomputed": close(unique_orders["late"].mean(), summary["late_rate"]),
        "material_late_rate_recomputed": close(unique_orders["late_24h"].mean(), summary["late_24h_rate"]),
        "conflicting_review_count_match": int((review_variants > 1).sum())
        == results["quality"]["inconsistent_order_counts"]["review_score"],
        "ship_band_orders_reconcile": sum(row["orders"] for row in results["ship_speed"])
        == summary["analyzed_orders"],
        "ship_band_late_orders_reconcile": sum(row["late_orders"] for row in results["ship_speed"])
        == summary["late_orders"],
        "single_seller_order_count_reconciles": single_seller_orders
        == summary["single_seller_orders"],
        "seller_analysis_coverage_recomputed": close(
            single_seller_orders / summary["analyzed_orders"],
            summary["seller_analysis_coverage"],
        ),
        "all_rates_bounded": all(
            0 <= row[field] <= 1
            for dataset, fields in {
                "monthly": ["late_rate", "late_24h_rate"],
                "ship_speed": ["late_rate", "low_review_rate"],
                "state_detail": ["late_rate", "low_review_rate"],
            }.items()
            for row in results[dataset]
            for field in fields
        ),
        "state_excess_formula_recomputed": all(
            close(
                row["excess_late_orders"],
                row["late_orders"] - row["orders"] * summary["late_rate"],
                tolerance=0.001,
            )
            for row in results["state_detail"]
        ),
        "seller_excess_formula_recomputed": all(
            close(
                row["excess_late_orders"],
                row["late_orders"] - row["orders"] * summary["late_rate"],
                tolerance=0.001,
            )
            for row in results["seller_detail"]
        ),
        "route_excess_formula_recomputed": all(
            close(
                row["excess_late_orders"],
                row["late_orders"] - row["orders"] * summary["late_rate"],
                tolerance=0.001,
            )
            for row in results["route_opportunity"]
        ),
        "seller_threshold_applied": all(row["orders"] >= 100 for row in results["seller_detail"]),
        "route_threshold_applied": all(row["orders"] >= 200 for row in results["route_opportunity"]),
        "clean_seller_labels": all("_" not in row["seller"] for row in results["seller_detail"]),
        "clean_route_labels": all("_" not in row["route"] for row in results["route_opportunity"]),
        "clean_category_labels": all(
            "_" not in row["product_category"] for row in results["category_opportunity"]
        ),
        "artifact_ready": artifact["snapshot"]["status"] == "ready",
        "artifact_has_seven_charts": len(artifact["manifest"]["charts"]) == 7,
        "artifact_has_two_detail_tables": len(artifact["manifest"]["tables"]) == 2,
        "artifact_has_source_for_every_card": all(
            bool(card.get("sourceId") or card.get("source")) for card in artifact["manifest"]["cards"]
        ),
        "artifact_has_source_for_every_chart": all(
            bool(chart.get("sourceId") or chart.get("source")) for chart in artifact["manifest"]["charts"]
        ),
        "artifact_has_source_for_every_table": all(
            bool(table.get("sourceId") or table.get("source")) for table in artifact["manifest"]["tables"]
        ),
    }

    visible_strings = [
        artifact["manifest"]["title"],
        artifact["manifest"]["description"],
        *(card.get("description", "") for card in artifact["manifest"]["cards"]),
        *(metric["label"] for card in artifact["manifest"]["cards"] for metric in card["metrics"]),
        *(chart["title"] for chart in artifact["manifest"]["charts"]),
        *(chart.get("subtitle", "") for chart in artifact["manifest"]["charts"]),
        *(table["title"] for table in artifact["manifest"]["tables"]),
        *(table.get("subtitle", "") for table in artifact["manifest"]["tables"]),
        *(column["label"] for table in artifact["manifest"]["tables"] for column in table["columns"]),
        *(block.get("body", "") for block in artifact["manifest"]["blocks"] if block["type"] == "markdown"),
    ]
    checks["visible_dashboard_copy_has_no_underscores"] = all(
        "_" not in value for value in visible_strings
    )
    checks["visible_dashboard_copy_has_no_ai_disclosure"] = not any(
        phrase in "\n".join(visible_strings).lower()
        for phrase in ["ai-generated", "generated by ai", "artificial intelligence", "chatgpt", "codex"]
    )

    with sqlite3.connect(database) as connection:
        database_summary = connection.execute(
            "SELECT analyzed_orders, late_orders, late_rate FROM dashboard_summary"
        ).fetchone()
    checks["sqlite_summary_reconciles"] = (
        database_summary[0] == summary["analyzed_orders"]
        and database_summary[1] == summary["late_orders"]
        and close(database_summary[2], summary["late_rate"])
    )

    failed = [name for name, passed in checks.items() if not passed]
    report = {
        "status": "passed" if not failed else "failed",
        "checks": checks,
        "failed_checks": failed,
        "note": "MCP artifact schema validation is performed separately through the Data Analytics validator.",
    }
    output = ROOT / "outputs" / "validation.json"
    output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
