"""
ml/dataset.py
─────────────
Extracts historical daily ingredient demand dataset from the database/backend API.
Calculates ingredient consumption = SaleItem.Quantity * RecipeIngredient.QuantityRequired.
Aggregates by date and ingredient into a continuous daily time-series DataFrame.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import pandas as pd

logger = logging.getLogger("ai_service.ml.dataset")


async def fetch_historical_demand_data(
    get_fn: Any,
    days: int = 60,
    ingredient_id: str | None = None,
) -> pd.DataFrame:
    """
    Fetch historical sales & recipe mappings to construct the daily ingredient demand dataset.
    
    Tries the optimized backend demand-history endpoint first; falls back to sales + recipe joins.
    """
    to_date = datetime.now(timezone.utc).replace(microsecond=0)
    from_date = (to_date - timedelta(days=days)).replace(microsecond=0)
    
    # Attempt 1: Call /api/Planning/demand-history if available
    try:
        params: dict[str, Any] = {
            "from": from_date.isoformat().replace("+00:00", "Z"),
            "to": to_date.isoformat().replace("+00:00", "Z"),
        }
        if ingredient_id:
            params["ingredientId"] = ingredient_id

        data = await get_fn("/api/Planning/demand-history", params)
        if isinstance(data, list) and len(data) > 0:
            records = []
            for row in data:
                raw_date = row.get("date") or row.get("saleDate")
                dt = pd.to_datetime(raw_date).tz_localize(None).floor("D")
                records.append({
                    "date": dt,
                    "ingredient_id": str(row["ingredientId"]),
                    "ingredient_name": str(row.get("ingredientName", "")),
                    "unit": str(row.get("unit", "")),
                    "demand": float(row.get("demand", row.get("quantityConsumed", 0.0))),
                })
            df = pd.DataFrame(records)
            return _fill_missing_dates(df, from_date, to_date)
    except Exception as exc:
        logger.debug("demand-history endpoint fallback: %s", exc)

    # Attempt 2: Fallback to /api/recipes, /api/sales, and /api/inventory
    try:
        recipes_resp = await get_fn("/api/recipes")
        recipes = recipes_resp if isinstance(recipes_resp, list) else recipes_resp.get("recipes", [])
        
        # Build mapping: menuItemId -> list of {ingredientId, ingredientName, unit, quantityRequired}
        recipe_map: dict[str, list[dict]] = {}
        for r in recipes:
            if not r.get("isActive", True):
                continue
            m_id = str(r.get("menuItemId"))
            ingredients = r.get("ingredients", [])
            recipe_map[m_id] = [
                {
                    "ingredient_id": str(ing.get("ingredientId")),
                    "ingredient_name": str(ing.get("ingredientName", "")),
                    "unit": str(ing.get("unit", "")),
                    "quantity_required": float(ing.get("quantityRequired", 0.0)),
                }
                for ing in ingredients
            ]

        # Fetch sales records (bounded to lookback days)
        sales_resp = await get_fn("/api/sales", {
            "from": from_date.isoformat().replace("+00:00", "Z"),
            "to": to_date.isoformat().replace("+00:00", "Z"),
            "page": 1,
            "pageSize": 500,
        })
        sales_records = sales_resp if isinstance(sales_resp, list) else sales_resp.get("records", sales_resp.get("items", []))

        # Fetch all ingredients to ensure catalog names and units are accurate
        try:
            inv_data = await get_fn("/api/inventory")
            inv_items = inv_data if isinstance(inv_data, list) else []
            ingredient_info = {
                str(i["ingredientId"]): {
                    "name": i.get("ingredientName", ""),
                    "unit": i.get("unit", ""),
                }
                for i in inv_items
            }
        except Exception:
            ingredient_info = {}

        raw_consumption: list[dict] = []
        for sale in sales_records:
            sale_date_raw = sale.get("saleDate") or sale.get("createdAt")
            if not sale_date_raw:
                continue
            sale_dt = pd.to_datetime(sale_date_raw).tz_localize(None).floor("D")

            for item in sale.get("items", []):
                menu_id = str(item.get("menuItemId"))
                qty_sold = float(item.get("quantity", 0.0))
                req_ingredients = recipe_map.get(menu_id, [])

                for ri in req_ingredients:
                    ing_id = ri["ingredient_id"]
                    if ingredient_id and ing_id != ingredient_id:
                        continue
                    consumed = qty_sold * ri["quantity_required"]
                    info = ingredient_info.get(ing_id, {})
                    raw_consumption.append({
                        "date": sale_dt,
                        "ingredient_id": ing_id,
                        "ingredient_name": info.get("name") or ri.get("ingredient_name", ""),
                        "unit": info.get("unit") or ri.get("unit", ""),
                        "demand": consumed,
                    })

        if not raw_consumption:
            return pd.DataFrame(columns=["date", "ingredient_id", "ingredient_name", "unit", "demand"])

        df = pd.DataFrame(raw_consumption)
        # Group by date and ingredient to get daily total demand
        df = df.groupby(["date", "ingredient_id", "ingredient_name", "unit"], as_index=False)["demand"].sum()
        return _fill_missing_dates(df, from_date, to_date)

    except Exception as exc:
        logger.error("Failed to build historical demand dataset: %s", exc)
        return pd.DataFrame(columns=["date", "ingredient_id", "ingredient_name", "unit", "demand"])


def _fill_missing_dates(df: pd.DataFrame, from_date: datetime, to_date: datetime) -> pd.DataFrame:
    """
    Ensure every active ingredient has a row for every day in the time window.
    Zero-consumption days are filled with 0.0 demand to enable proper lag/rolling computation.
    """
    if df.empty:
        return df

    start_dt = pd.to_datetime(from_date).tz_localize(None).floor("D")
    end_dt = pd.to_datetime(to_date).tz_localize(None).floor("D")
    full_dates = pd.date_range(start=start_dt, end=end_dt, freq="D")

    all_dfs = []
    for ing_id, group in df.groupby("ingredient_id"):
        name = group["ingredient_name"].iloc[0]
        unit = group["unit"].iloc[0]

        temp_df = pd.DataFrame({"date": full_dates})
        temp_df["ingredient_id"] = ing_id
        temp_df["ingredient_name"] = name
        temp_df["unit"] = unit

        merged = pd.merge(temp_df, group[["date", "demand"]], on="date", how="left")
        merged["demand"] = merged["demand"].fillna(0.0)
        all_dfs.append(merged)

    if not all_dfs:
        return df

    final_df = pd.concat(all_dfs, ignore_index=True)
    final_df = final_df.sort_values(by=["ingredient_id", "date"]).reset_index(drop=True)
    return final_df
