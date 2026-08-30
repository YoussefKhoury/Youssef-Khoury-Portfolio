from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / ".deps"))

import numpy as np
import pandas as pd


SOURCE = ROOT / "data" / "raw" / "olist_delivery_joined.parquet"
OUTPUT = ROOT / "outputs"


def records(frame: pd.DataFrame) -> list[dict]:
    clean = frame.replace({np.nan: None})
    return clean.to_dict(orient="records")


def round_numeric(frame: pd.DataFrame, digits: int = 4) -> pd.DataFrame:
    result = frame.copy()
    numeric = result.select_dtypes(include=["number"]).columns
    result[numeric] = result[numeric].round(digits)
    return result


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    items = pd.read_parquet(SOURCE, engine="fastparquet")
    items["purchase_ts"] = pd.to_datetime(items["order_purchase_timestamp"], errors="coerce")

    required = [
        "order_id",
        "delivery_delay_hours",
        "customer_state",
        "time_to_ship_hours",
        "purchase_ts",
    ]
    missing_required = {column: int(items[column].isna().sum()) for column in required}

    consistency_fields = [
        "delivery_delay_hours",
        "customer_state",
        "review_score",
        "time_to_ship_hours",
        "purchase_ts",
    ]
    inconsistent_orders = {
        field: int((items.groupby("order_id", dropna=False)[field].nunique(dropna=False) > 1).sum())
        for field in consistency_fields
    }

    review_variants = items.groupby("order_id")["review_score"].nunique(dropna=False)
    orders = (
        items.sort_values(["order_id", "seller_id", "product_id"])
        .drop_duplicates("order_id")
        .copy()
    )
    orders = orders.dropna(subset=required).copy()
    orders["review_variant_count"] = orders["order_id"].map(review_variants)
    orders.loc[orders["review_variant_count"] > 1, "review_score"] = np.nan
    orders["late"] = orders["delivery_delay_hours"] > 0
    orders["late_24h"] = orders["delivery_delay_hours"] > 24
    orders["delay_days"] = orders["delivery_delay_hours"] / 24
    orders["ship_days"] = orders["time_to_ship_hours"] / 24
    orders["month"] = orders["purchase_ts"].dt.to_period("M").astype(str)
    orders["low_review"] = np.where(
        orders["review_score"].notna(), orders["review_score"] <= 2, np.nan
    )

    overall_late_rate = float(orders["late"].mean())
    overall_late_24h_rate = float(orders["late_24h"].mean())
    late_orders = orders.loc[orders["late"]]
    on_time_orders = orders.loc[~orders["late"]]
    review_orders = orders.dropna(subset=["review_score"])
    late_review_orders = review_orders.loc[review_orders["late"]]
    on_time_review_orders = review_orders.loc[~review_orders["late"]]

    summary = {
        "source_rows_item_level": int(len(items)),
        "analyzed_orders": int(len(orders)),
        "late_orders": int(orders["late"].sum()),
        "late_rate": overall_late_rate,
        "late_24h_rate": overall_late_24h_rate,
        "median_late_days": float(late_orders["delay_days"].median()),
        "p90_late_days": float(late_orders["delay_days"].quantile(0.90)),
        "review_eligible_orders": int(len(review_orders)),
        "late_review_eligible_orders": int(len(late_review_orders)),
        "on_time_review_eligible_orders": int(len(on_time_review_orders)),
        "avg_review_on_time": float(on_time_review_orders["review_score"].mean()),
        "avg_review_late": float(late_review_orders["review_score"].mean()),
        "review_score_gap": float(late_review_orders["review_score"].mean() - on_time_review_orders["review_score"].mean()),
        "low_review_rate_on_time": float(on_time_review_orders["low_review"].mean()),
        "low_review_rate_late": float(late_review_orders["low_review"].mean()),
        "median_ship_days_on_time": float(on_time_orders["ship_days"].median()),
        "median_ship_days_late": float(late_orders["ship_days"].median()),
        "min_purchase_date": orders["purchase_ts"].min().isoformat(),
        "max_purchase_date": orders["purchase_ts"].max().isoformat(),
    }

    monthly = (
        orders.groupby("month", as_index=False)
        .agg(
            orders=("order_id", "size"),
            late_orders=("late", "sum"),
            late_rate=("late", "mean"),
            late_24h_rate=("late_24h", "mean"),
            avg_review=("review_score", "mean"),
            median_ship_days=("ship_days", "median"),
        )
        .query("orders >= 500")
        .sort_values("month")
    )

    states = (
        orders.groupby("customer_state", as_index=False)
        .agg(
            orders=("order_id", "size"),
            late_orders=("late", "sum"),
            late_rate=("late", "mean"),
            avg_review=("review_score", "mean"),
            low_review_rate=("low_review", "mean"),
            median_ship_days=("ship_days", "median"),
        )
        .query("orders >= 200")
    )
    states["expected_late_orders_at_network_rate"] = states["orders"] * overall_late_rate
    states["excess_late_orders"] = states["late_orders"] - states["expected_late_orders_at_network_rate"]
    states = states.sort_values(["excess_late_orders", "late_orders"], ascending=False)
    state_opportunity = states.head(12).copy()
    state_opportunity["rank"] = np.arange(1, len(state_opportunity) + 1)

    ship_bins = [-np.inf, 48, 96, 168, np.inf]
    ship_labels = ["Within 2 days", "2-4 days", "4-7 days", "Over 7 days"]
    orders["ship_speed_band"] = pd.cut(
        orders["time_to_ship_hours"], bins=ship_bins, labels=ship_labels, right=True
    )
    ship_speed = (
        orders.groupby("ship_speed_band", observed=False, as_index=False)
        .agg(
            orders=("order_id", "size"),
            late_orders=("late", "sum"),
            late_rate=("late", "mean"),
            avg_review=("review_score", "mean"),
            low_review_rate=("low_review", "mean"),
        )
    )
    ship_speed["band_order"] = np.arange(1, len(ship_speed) + 1)
    ship_speed["share_of_orders"] = ship_speed["orders"] / len(orders)
    ship_speed["share_of_late_orders"] = ship_speed["late_orders"] / int(orders["late"].sum())
    ship_speed["expected_late_orders_at_network_rate"] = ship_speed["orders"] * overall_late_rate
    ship_speed["excess_late_orders"] = (
        ship_speed["late_orders"] - ship_speed["expected_late_orders_at_network_rate"]
    )

    seller_pairs = (
        items.sort_values(["order_id", "seller_id", "product_id"])
        .drop_duplicates(["order_id", "seller_id"])
        [["order_id", "seller_id", "seller_state", "customer_state", "time_to_ship_hours"]]
        .copy()
    )
    sellers_per_order = seller_pairs.groupby("order_id")["seller_id"].nunique()
    single_seller_order_ids = sellers_per_order.loc[sellers_per_order == 1].index
    seller_orders = seller_pairs.loc[
        seller_pairs["order_id"].isin(single_seller_order_ids)
    ].copy()
    seller_orders = seller_orders.merge(
        orders[["order_id", "late", "review_score", "low_review"]],
        on="order_id",
        how="inner",
        validate="one_to_one",
    )
    seller_orders = seller_orders.dropna(
        subset=["seller_id", "seller_state", "customer_state", "time_to_ship_hours"]
    ).copy()
    seller_orders["ship_days"] = seller_orders["time_to_ship_hours"] / 24
    seller_orders["slow_handoff"] = seller_orders["time_to_ship_hours"] > 96

    sellers = (
        seller_orders.groupby(["seller_id", "seller_state"], as_index=False)
        .agg(
            orders=("order_id", "nunique"),
            late_orders=("late", "sum"),
            late_rate=("late", "mean"),
            avg_review=("review_score", "mean"),
            low_review_rate=("low_review", "mean"),
            median_ship_days=("ship_days", "median"),
            slow_handoff_rate=("slow_handoff", "mean"),
        )
        .query("orders >= 100")
    )
    sellers["expected_late_orders_at_network_rate"] = sellers["orders"] * overall_late_rate
    sellers["excess_late_orders"] = sellers["late_orders"] - sellers["expected_late_orders_at_network_rate"]
    sellers["seller"] = "Seller " + sellers["seller_id"].str[:6].str.upper()
    sellers = sellers.sort_values(["excess_late_orders", "late_orders"], ascending=False)
    seller_opportunity = sellers.head(12).copy()
    seller_opportunity["rank"] = np.arange(1, len(seller_opportunity) + 1)
    seller_detail = sellers.sort_values(["late_rate", "orders"], ascending=False).copy()

    routes = (
        seller_orders.groupby(["seller_state", "customer_state"], as_index=False)
        .agg(
            orders=("order_id", "nunique"),
            late_orders=("late", "sum"),
            late_rate=("late", "mean"),
            avg_review=("review_score", "mean"),
            median_ship_days=("ship_days", "median"),
            slow_handoff_rate=("slow_handoff", "mean"),
        )
        .query("orders >= 200")
    )
    routes["expected_late_orders_at_network_rate"] = routes["orders"] * overall_late_rate
    routes["excess_late_orders"] = routes["late_orders"] - routes["expected_late_orders_at_network_rate"]
    routes["route"] = routes["seller_state"] + " to " + routes["customer_state"]
    route_opportunity = routes.sort_values(
        ["excess_late_orders", "late_orders"], ascending=False
    ).head(12)
    route_opportunity["rank"] = np.arange(1, len(route_opportunity) + 1)

    summary["single_seller_orders"] = int(len(seller_orders))
    summary["seller_analysis_coverage"] = float(len(seller_orders) / len(orders))
    summary["high_volume_sellers"] = int(len(sellers))

    item_categories = items[["order_id", "product_category_name_english"]].dropna().copy()
    item_categories["product_category"] = (
        item_categories["product_category_name_english"]
        .str.replace("_", " ", regex=False)
        .str.title()
    )
    item_categories = item_categories.drop_duplicates(["order_id", "product_category"])
    item_categories = item_categories.merge(
        orders[["order_id", "late", "review_score"]], on="order_id", how="inner", validate="many_to_one"
    )
    categories = (
        item_categories.groupby("product_category", as_index=False)
        .agg(
            orders=("order_id", "nunique"),
            late_orders=("late", "sum"),
            late_rate=("late", "mean"),
            avg_review=("review_score", "mean"),
        )
        .query("orders >= 500")
    )
    categories["expected_late_orders_at_network_rate"] = categories["orders"] * overall_late_rate
    categories["excess_late_orders"] = categories["late_orders"] - categories["expected_late_orders_at_network_rate"]
    category_opportunity = categories.sort_values(
        ["excess_late_orders", "late_orders"], ascending=False
    ).head(12)
    category_opportunity["rank"] = np.arange(1, len(category_opportunity) + 1)

    state_detail = states.sort_values(["late_rate", "orders"], ascending=False).copy()

    outputs = {
        "summary": summary,
        "monthly": records(round_numeric(monthly)),
        "state_opportunity": records(round_numeric(state_opportunity)),
        "state_detail": records(round_numeric(state_detail)),
        "ship_speed": records(round_numeric(ship_speed)),
        "seller_opportunity": records(round_numeric(seller_opportunity)),
        "seller_detail": records(round_numeric(seller_detail)),
        "route_opportunity": records(round_numeric(route_opportunity)),
        "category_opportunity": records(round_numeric(category_opportunity)),
        "quality": {
            "required_null_counts_before_order_filter": missing_required,
            "inconsistent_order_counts": inconsistent_orders,
            "item_rows": int(len(items)),
            "unique_order_ids": int(items["order_id"].nunique()),
            "analyzed_complete_orders": int(len(orders)),
            "order_seller_pairs": int(len(seller_pairs)),
            "multi_seller_orders_excluded_from_seller_analysis": int((sellers_per_order > 1).sum()),
            "single_seller_orders_analyzed": int(len(seller_orders)),
            "seller_state_conflicts": int(
                (items.groupby("seller_id")["seller_state"].nunique(dropna=False) > 1).sum()
            ),
            "duplicate_item_rows": int(items.duplicated().sum()),
            "source_sha256": sha256(SOURCE),
        },
    }

    for name, frame in {
        "monthly": monthly,
        "state_opportunity": state_opportunity,
        "state_detail": state_detail,
        "ship_speed": ship_speed,
        "seller_opportunity": seller_opportunity,
        "seller_detail": seller_detail,
        "route_opportunity": route_opportunity,
        "category_opportunity": category_opportunity,
    }.items():
        round_numeric(frame).to_csv(OUTPUT / f"{name}.csv", index=False)

    (OUTPUT / "results.json").write_text(
        json.dumps(outputs, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(json.dumps({"summary": summary, "quality": outputs["quality"]}, indent=2))


if __name__ == "__main__":
    main()
