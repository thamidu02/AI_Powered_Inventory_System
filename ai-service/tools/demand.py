"""
tools/demand.py
───────────────
Central AI tools for the Restaurant Inventory AI Service.

Consolidates:
- Backend authentication & HTTP helpers
- Inventory management & stock tools
- Component 3 Sales, Consumption, and Waste read-only tools
- Guided UI workflow navigation tools
- Machine Learning Demand Forecasting tools
- Unified tool declarations and dispatch registry
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import httpx
import google.generativeai as genai
from google.generativeai.types import FunctionDeclaration, Tool

from .guided_workflows import (
    get_available_guided_workflows,
    plan_guided_workflow,
    validate_guided_workflow_plan,
)
from ml.model import forecast_pipeline

logger = logging.getLogger("ai_service.tools")

# ─── Configuration ────────────────────────────────────────────────────────────

BACKEND = os.getenv("BACKEND_BASE_URL", "http://localhost:5066")
MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
SERVICE_EMAIL = os.getenv("SERVICE_ACCOUNT_EMAIL", "inventory@restaurant.com")
SERVICE_PASSWORD = os.getenv("SERVICE_ACCOUNT_PASSWORD", "Restaurant@123")

# ─── Token cache (in-memory, refreshed on 401) ───────────────────────────────

_token_cache: dict[str, Any] = {"token": None, "expires_at": None}


def _date_range_query(days: int) -> dict[str, str]:
    """Build exact UTC RFC3339 query parameters expected by ASP.NET DateTime."""
    to_date = datetime.now(timezone.utc).replace(microsecond=0)
    from_date = (to_date - timedelta(days=days)).replace(microsecond=0)
    return {
        "from": from_date.isoformat().replace("+00:00", "Z"),
        "to": to_date.isoformat().replace("+00:00", "Z"),
    }


def _with_query(path: str, params: dict[str, str | int]) -> str:
    return f"{path}?{urlencode(params)}"


async def _get_token() -> str:
    """Login with the service account and return a cached Bearer token."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if _token_cache["token"] and _token_cache["expires_at"] and now < _token_cache["expires_at"]:
        return str(_token_cache["token"])

    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            f"{BACKEND}/api/auth/login",
            json={"email": SERVICE_EMAIL, "password": SERVICE_PASSWORD},
        )
        r.raise_for_status()
        data = r.json()

    _token_cache["token"] = data["token"]
    expires_str = data.get("expiresAt")
    if expires_str:
        exp = datetime.fromisoformat(expires_str.replace("Z", "+00:00")).replace(tzinfo=None)
        _token_cache["expires_at"] = exp - timedelta(minutes=5)
    else:
        _token_cache["expires_at"] = now + timedelta(hours=1)

    return str(_token_cache["token"])


async def _get(path: str, params: dict | None = None) -> Any:
    """Authenticated GET request to the .NET backend."""
    token = await _get_token()
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(
                f"{BACKEND}{path}",
                params=params or {},
                headers={"Authorization": f"Bearer {token}"},
            )
            r.raise_for_status()
            return r.json()
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 401:
            _token_cache["token"] = None
            token = await _get_token()
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.get(
                    f"{BACKEND}{path}",
                    params=params or {},
                    headers={"Authorization": f"Bearer {token}"},
                )
                r.raise_for_status()
                return r.json()
        raise


async def _safe_get(path: str, params: dict[str, Any] | None = None) -> Any:
    """Safely fetch from backend, returning structured error instead of failing silently."""
    try:
        return await _get(path, params)
    except httpx.HTTPStatusError as exc:
        return {
            "error": f"Backend returned HTTP {exc.response.status_code}.",
            "status_code": exc.response.status_code,
            "endpoint": path,
        }
    except (httpx.RequestError, KeyError, ValueError) as exc:
        return {"error": f"Backend data request failed: {exc}", "endpoint": path}


async def _post(path: str, body: dict) -> Any:
    """Authenticated POST request to the .NET backend."""
    token = await _get_token()
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{BACKEND}{path}",
            json=body,
            headers={"Authorization": f"Bearer {token}"},
        )
        r.raise_for_status()
        return r.json()


# ═══════════════════════════════════════════════════════════════════════════════
# INVENTORY TOOLS
# ═══════════════════════════════════════════════════════════════════════════════

async def get_all_stock_levels() -> dict:
    """Return current stock levels for all ingredients, highlighting low-stock items."""
    data = await _get("/api/inventory")
    result = []
    for item in data:
        current = item.get("currentStock", item.get("totalQuantity", 0))
        result.append({
            "ingredient_id": item["ingredientId"],
            "name": item["ingredientName"],
            "unit": item["unit"],
            "current_stock": current,
            "minimum_stock": item["minimumStockLevel"],
            "maximum_stock": item["maximumStockLevel"],
            "is_low": item.get("isLowStock", False),
            "deficit": max(0, item["minimumStockLevel"] - current),
        })
    low_count = sum(1 for r in result if r["is_low"])
    return {"items": result, "total": len(result), "low_stock_count": low_count}


async def list_all_ingredients(
    category: str | None = None,
    low_stock_only: bool = False,
    search: str | None = None,
) -> dict:
    """
    List all ingredients with master details, categories, current inventory stock levels,
    thresholds, low stock status, and active batch breakdown.
    """
    try:
        ing_data, inv_data = await asyncio.gather(
            _get("/api/ingredients"),
            _get("/api/inventory"),
        )
    except Exception as exc:
        return {"error": f"Failed to fetch ingredient data: {str(exc)}"}

    if not isinstance(ing_data, list) or not isinstance(inv_data, list):
        return {"error": "Invalid data format received from backend"}

    inv_map = {item.get("ingredientId"): item for item in inv_data}
    category_filter = category.strip().lower() if category else None
    search_filter = search.strip().lower() if search else None

    result = []
    for ing in ing_data:
        name = ing.get("name", "")
        sku = ing.get("sku", "")
        cat_name = ing.get("categoryName") or ing.get("category", {}).get("name", "")

        if category_filter and category_filter not in cat_name.lower():
            continue
        if search_filter and (search_filter not in name.lower() and search_filter not in sku.lower()):
            continue

        inv = inv_map.get(ing.get("id"), {})
        current = inv.get("currentStock", 0)
        min_stock = ing.get("minimumStockLevel", 0)
        max_stock = ing.get("maximumStockLevel", 0)
        is_low = current < min_stock or inv.get("isLowStock", False)

        if low_stock_only and not is_low:
            continue

        batches = [
            {
                "batch_number": b.get("batchNumber"),
                "quantity": b.get("quantity"),
                "unit_cost": b.get("unitCost"),
                "expiry_date": b.get("expiryDate"),
                "status": b.get("status"),
                "location": b.get("storageLocationName", "Unknown"),
            }
            for b in inv.get("batches", [])
            if b.get("quantity", 0) > 0 or b.get("status") != "DEPLETED"
        ]

        result.append({
            "ingredient_id": ing.get("id"),
            "name": name,
            "sku": sku,
            "category": cat_name,
            "category_id": ing.get("categoryId"),
            "unit": ing.get("unit", ""),
            "current_stock": current,
            "minimum_stock": min_stock,
            "maximum_stock": max_stock,
            "is_low_stock": is_low,
            "reorder_deficit": max(0, min_stock - current),
            "batch_count": len(batches),
            "batches": batches,
        })

    low_count = sum(1 for r in result if r["is_low_stock"])
    return {
        "ingredients": result,
        "total_count": len(result),
        "low_stock_count": low_count,
    }


async def get_ingredient_details(ingredient_id_or_name: str) -> dict:
    """Get detailed master and stock information for a specific ingredient."""
    all_data = await list_all_ingredients()
    if "error" in all_data:
        return all_data

    target = None
    query = ingredient_id_or_name.strip().lower()
    for ing in all_data.get("ingredients", []):
        if str(ing["ingredient_id"]).lower() == query or ing["name"].lower() == query or ing["sku"].lower() == query:
            target = ing
            break
        if not target and query in ing["name"].lower():
            target = ing

    if not target:
        return {"error": f"Ingredient '{ingredient_id_or_name}' not found."}

    return target


async def get_ingredient_stock(ingredient_id: str) -> dict:
    """Return detailed stock information for a single ingredient including all batches."""
    data = None
    try:
        data = await _get(f"/api/inventory/{ingredient_id}")
    except Exception:
        pass

    if not data:
        details = await get_ingredient_details(ingredient_id)
        if "error" not in details and details.get("ingredient_id"):
            try:
                data = await _get(f"/api/inventory/{details['ingredient_id']}")
            except Exception:
                pass

    if not data:
        return {"error": f"Ingredient {ingredient_id} not found"}

    batches = [
        {
            "batch_number": b["batchNumber"],
            "quantity": b["quantity"],
            "unit_cost": b["unitCost"],
            "received_date": b["receivedDate"],
            "expiry_date": b.get("expiryDate"),
            "status": b["status"],
            "location": b.get("storageLocationName", "Unknown"),
        }
        for b in data.get("batches", [])
    ]
    return {
        "ingredient_id": data["ingredientId"],
        "name": data["ingredientName"],
        "unit": data["unit"],
        "current_stock": data.get("currentStock", data.get("totalQuantity", 0)),
        "minimum_stock": data["minimumStockLevel"],
        "maximum_stock": data["maximumStockLevel"],
        "is_low": data.get("isLowStock", False),
        "batches": batches,
        "batch_count": len(batches),
    }


async def list_all_stocks(
    low_stock_only: bool = False,
    out_of_stock_only: bool = False,
    storage_location: str | None = None,
    search: str | None = None,
) -> dict:
    """List stock levels and valuation for all ingredients."""
    try:
        inv_data = await _get("/api/inventory")
    except Exception as exc:
        return {"error": f"Failed to fetch stock data: {str(exc)}"}

    if not isinstance(inv_data, list):
        return {"error": "Invalid inventory response from backend"}

    search_filter = search.strip().lower() if search else None
    loc_filter = storage_location.strip().lower() if storage_location else None

    stocks = []
    total_val = 0.0
    low_count = 0
    out_count = 0
    over_count = 0
    optimal_count = 0

    for item in inv_data:
        name = item.get("ingredientName", "")
        sku = item.get("sku", "")

        if search_filter and (search_filter not in name.lower() and search_filter not in sku.lower()):
            continue

        current = float(item.get("currentStock", item.get("totalQuantity", 0)))
        min_level = float(item.get("minimumStockLevel", 0))
        max_level = float(item.get("maximumStockLevel", 0))
        is_low = bool(item.get("isLowStock", False) or current < min_level)
        is_out = current <= 0
        is_over = max_level > 0 and current > max_level

        if is_out:
            status = "OUT_OF_STOCK"
            out_count += 1
        elif is_low:
            status = "LOW_STOCK"
            low_count += 1
        elif is_over:
            status = "OVERSTOCKED"
            over_count += 1
        else:
            status = "OPTIMAL"
            optimal_count += 1

        if low_stock_only and not is_low:
            continue
        if out_of_stock_only and not is_out:
            continue

        raw_batches = item.get("batches", [])
        active_batches = []
        item_val = 0.0
        locations = set()

        for b in raw_batches:
            b_qty = float(b.get("quantity", 0))
            b_cost = float(b.get("unitCost", 0))
            loc = b.get("storageLocationName", "Unknown")
            if loc:
                locations.add(loc)

            if loc_filter and loc_filter not in loc.lower():
                continue

            if b_qty > 0 or b.get("status") != "DEPLETED":
                batch_val = round(b_qty * b_cost, 2)
                item_val += batch_val
                active_batches.append({
                    "batch_number": b.get("batchNumber"),
                    "quantity": b_qty,
                    "unit_cost": b_cost,
                    "batch_value": batch_val,
                    "expiry_date": b.get("expiryDate"),
                    "status": b.get("status"),
                    "location": loc,
                })

        if loc_filter and not active_batches:
            continue

        item_val = round(item_val, 2)
        total_val += item_val

        stocks.append({
            "ingredient_id": item.get("ingredientId"),
            "name": name,
            "sku": sku,
            "unit": item.get("unit", ""),
            "current_stock": current,
            "minimum_stock": min_level,
            "maximum_stock": max_level,
            "stock_status": status,
            "is_low_stock": is_low,
            "is_out_of_stock": is_out,
            "deficit": round(max(0.0, min_level - current), 2),
            "surplus": round(max(0.0, current - max_level), 2) if max_level > 0 else 0.0,
            "stock_value": item_val,
            "batch_count": len(active_batches),
            "storage_locations": list(locations),
            "batches": active_batches,
        })

    return {
        "stocks": stocks,
        "total_items": len(stocks),
        "total_inventory_value": round(total_val, 2),
        "low_stock_count": low_count,
        "out_of_stock_count": out_count,
        "overstocked_count": over_count,
        "optimal_count": optimal_count,
    }


async def get_stock_details(ingredient_id_or_name: str) -> dict:
    """Get stock details including batch breakdown and movements for an ingredient."""
    query = ingredient_id_or_name.strip()
    all_stocks = await list_all_stocks()
    if "error" in all_stocks:
        return all_stocks

    target = None
    query_lower = query.lower()
    for s in all_stocks.get("stocks", []):
        if str(s["ingredient_id"]).lower() == query_lower or s["name"].lower() == query_lower or s["sku"].lower() == query_lower:
            target = s
            break
        if not target and query_lower in s["name"].lower():
            target = s

    if not target:
        return {"error": f"Stock details for '{ingredient_id_or_name}' not found."}

    recent_movements = []
    try:
        moves = await _get("/api/inventory/movements", {"ingredientId": target["ingredient_id"]})
        if isinstance(moves, list):
            for m in moves[:5]:
                recent_movements.append({
                    "type": m.get("movementType"),
                    "quantity": m.get("quantity"),
                    "reason": m.get("reason"),
                    "batch_number": m.get("batchNumber"),
                    "date": m.get("createdAt"),
                })
    except Exception:
        pass

    target_copy = dict(target)
    target_copy["recent_movements"] = recent_movements
    return target_copy


async def get_expiring_batches(days_ahead: int = 7) -> dict:
    """Find stock batches expiring within the specified number of days."""
    days_ahead = int(days_ahead)
    data = await _get("/api/inventory/expiring", {"days": days_ahead})
    result = []
    for b in data:
        result.append({
            "ingredient_id": b["ingredientId"],
            "ingredient_name": b["ingredientName"],
            "batch_number": b["batchNumber"],
            "quantity": b["quantity"],
            "expiry_date": b.get("expiryDate"),
            "days_until_expiry": b.get("daysUntilExpiry", days_ahead),
            "location": b.get("storageLocationName", "Unknown"),
        })
    return {"expiring_batches": result, "count": len(result), "days_ahead": days_ahead}


async def get_supplier_options(ingredient_id: str, required_quantity: float) -> dict:
    """Get ranked supplier options for an ingredient based on price and lead time."""
    try:
        data = await _get("/api/suppliers/options", {
            "ingredientId": ingredient_id,
            "quantity": required_quantity,
        })
    except Exception:
        try:
            all_suppliers = await _get("/api/suppliers")
            data = [
                {
                    "supplierId": s["id"],
                    "supplierName": s["name"],
                    "unitPrice": 0,
                    "leadTimeDays": s.get("leadTimeDays", 3),
                    "minimumOrderQuantity": s.get("minimumOrderQuantity", 0),
                    "isPreferred": s.get("isPreferred", False),
                }
                for s in all_suppliers
            ]
        except Exception:
            return {"suppliers": [], "count": 0, "required_quantity": required_quantity,
                    "note": "Supplier options endpoint unavailable."}

    suppliers = []
    for s in data:
        can_fulfill = s.get("minimumOrderQuantity", 0) <= required_quantity
        score = 0.0
        if s.get("isPreferred"):
            score += 0.4
        if s.get("leadTimeDays", 99) <= 2:
            score += 0.35
        if can_fulfill:
            score += 0.25
        suppliers.append({
            "supplier_id": s["supplierId"],
            "supplier_name": s["supplierName"],
            "unit_price": s.get("unitPrice", 0),
            "lead_time_days": s.get("leadTimeDays", 3),
            "minimum_order_qty": s.get("minimumOrderQuantity", 0),
            "is_preferred": s.get("isPreferred", False),
            "can_fulfill": can_fulfill,
            "score": round(score, 2),
        })
    suppliers.sort(key=lambda x: -x["score"])
    return {"suppliers": suppliers, "count": len(suppliers), "required_quantity": required_quantity}


async def get_stock_movements(ingredient_id: str, days: int = 30) -> dict:
    """Get stock movement history for an ingredient over the past N days."""
    data = await _get("/api/inventory/movements", {"ingredientId": ingredient_id})
    cutoff = (datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)).isoformat()
    movements = []
    total_consumed = 0.0
    total_received = 0.0
    total_wasted = 0.0
    for m in data if isinstance(data, list) else []:
        if m.get("createdAt", "") >= cutoff:
            qty = m.get("quantity", 0)
            mtype = m.get("movementType", "")
            movements.append({
                "type": mtype,
                "quantity": qty,
                "date": m.get("createdAt"),
                "reason": m.get("reason"),
                "reference_type": m.get("referenceType"),
            })
            if mtype in ("CONSUMPTION", "CONSUME"):
                total_consumed += qty
            elif mtype == "RECEIPT":
                total_received += qty
            elif mtype == "WASTE":
                total_wasted += qty
    return {
        "ingredient_id": ingredient_id,
        "days": days,
        "total_movements": len(movements),
        "total_consumed": total_consumed,
        "total_received": total_received,
        "total_wasted": total_wasted,
        "movements": movements[:100],
    }


async def get_waste_records(ingredient_id: str | None = None, days: int = 30) -> dict:
    """Get waste records, optionally filtered by ingredient."""
    params: dict = {}
    if ingredient_id:
        params["ingredientId"] = ingredient_id
    try:
        data = await _get("/api/wasterecords", params)
    except Exception:
        try:
            data = await _get("/api/waste", params)
        except Exception:
            return {"waste_records": [], "total_waste": 0, "days": days, "note": "Waste records endpoint unavailable."}

    cutoff = (datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)).isoformat()
    records = [
        {
            "ingredient_id": r.get("ingredientId"),
            "ingredient_name": r.get("ingredientName"),
            "quantity": r.get("quantity", 0),
            "reason": r.get("reason"),
            "date": r.get("wastedAt") or r.get("recordedAt"),
        }
        for r in (data if isinstance(data, list) else [])
        if (r.get("wastedAt") or r.get("recordedAt", "")) >= cutoff
    ]
    total_waste = sum(r["quantity"] for r in records)
    return {"waste_records": records, "total_waste": total_waste, "days": days}


async def get_stock_adjustments(ingredient_id: str | None = None) -> dict:
    """Get stock adjustment records."""
    data = await _get("/api/inventory/adjustments")
    adjustments = []
    for a in data if isinstance(data, list) else []:
        if ingredient_id and a.get("ingredientId") != ingredient_id:
            continue
        adjustments.append({
            "ingredient_id": a.get("ingredientId"),
            "ingredient_name": a.get("ingredientName"),
            "quantity_change": a.get("quantityChange", 0),
            "reason": a.get("reason"),
            "status": a.get("status"),
            "date": a.get("createdAt"),
        })
    total_adj = sum(abs(a["quantity_change"]) for a in adjustments)
    return {"adjustments": adjustments, "count": len(adjustments), "total_adjusted": total_adj}


async def calculate_expected_consumption(ingredient_id: str, days: int = 7) -> dict:
    """Calculate expected vs actual consumption from sales + recipes."""
    try:
        data = await _get("/api/planning/expected-consumption", {
            "ingredientId": ingredient_id,
            "days": days,
        })
        return {
            "ingredient_id": ingredient_id,
            "days": days,
            "expected_consumption": data.get("expectedConsumption", 0),
            "actual_consumption": data.get("actualConsumption", 0),
            "discrepancy": data.get("discrepancy", 0),
            "discrepancy_percent": data.get("discrepancyPercent", 0),
        }
    except Exception:
        movements = await get_stock_movements(ingredient_id, days=days)
        daily_avg = movements["total_consumed"] / days if movements["total_consumed"] else 0
        return {
            "ingredient_id": ingredient_id,
            "days": days,
            "expected_consumption": round(daily_avg * days, 3),
            "actual_consumption": movements["total_consumed"],
            "discrepancy": 0,
            "discrepancy_percent": 0,
            "note": "Expected consumption endpoint unavailable; using movement history.",
        }


async def analyze_consumption_patterns(ingredient_id: str) -> dict:
    """Analyze 90-day consumption patterns for an ingredient."""
    movements = await get_stock_movements(ingredient_id, days=90)
    daily_avg = movements["total_consumed"] / 90 if movements["total_consumed"] else 0
    return {
        "ingredient_id": ingredient_id,
        "analysis_days": 90,
        "daily_average": round(daily_avg, 3),
        "total_consumed": movements["total_consumed"],
        "total_received": movements["total_received"],
        "total_wasted": movements["total_wasted"],
        "waste_rate_pct": round(
            movements["total_wasted"] / movements["total_consumed"] * 100, 1
        ) if movements["total_consumed"] else 0,
    }


async def build_po_proposal(items: list[dict], workflow_id: str, reasoning: str) -> dict:
    """Build a purchase order proposal."""
    total_cost = sum(i.get("quantity", 0) * i.get("unit_price", 0) for i in items)
    return {
        "workflow_id": workflow_id,
        "proposal_type": "PURCHASE_REQUEST",
        "items": items,
        "total_cost": round(total_cost, 2),
        "item_count": len(items),
        "reasoning": reasoning,
        "status": "PENDING_APPROVAL",
        "purchase_request": {
            "items": [
                {
                    "ingredient_id": i["ingredient_id"],
                    "supplier_id": i["supplier_id"],
                    "quantity": i["quantity"],
                    "unit_price": i["unit_price"],
                    "reasoning": i.get("reasoning", ""),
                }
                for i in items
            ]
        },
    }


async def propose_reorder_level_change(optimizations: list[dict], reasoning: str) -> dict:
    """Propose new min/max stock levels."""
    return {
        "proposal_type": "OPTIMIZATION",
        "optimizations": optimizations,
        "ingredient_count": len(optimizations),
        "reasoning": reasoning,
        "status": "PENDING_APPROVAL",
    }


async def rank_emergency_options(ingredient_id: str, required_quantity: float) -> dict:
    """Rank suppliers for emergency procurement."""
    opts = await get_supplier_options(ingredient_id, required_quantity)
    suppliers = opts["suppliers"]
    suppliers.sort(key=lambda x: (x["lead_time_days"], -x["is_preferred"]))
    return {
        "ingredient_id": ingredient_id,
        "required_quantity": required_quantity,
        "ranked_by": "lead_time_asc",
        "emergency_options": suppliers,
    }


async def generate_anomaly_report(
    ingredient_id: str,
    ingredient_name: str,
    expected: float,
    actual: float,
    known_waste: float,
    known_adjustments: float,
    reasoning: str,
) -> dict:
    """Generate a structured stock anomaly report."""
    unexplained = max(0, actual - expected - known_waste - known_adjustments)
    verdict = "EXPLAINED" if unexplained < 0.5 else ("PARTIAL" if unexplained < actual * 0.1 else "SIGNIFICANT")
    recommendation = {
        "EXPLAINED": "All discrepancy accounted for. No action required.",
        "PARTIAL": "Minor unexplained discrepancy. Monitor for next 7 days.",
        "SIGNIFICANT": "Significant unexplained loss. Physical stock count required immediately.",
    }[verdict]
    return {
        "ingredient_id": ingredient_id,
        "ingredient_name": ingredient_name,
        "expected_consumption": expected,
        "actual_consumption": actual,
        "known_waste": known_waste,
        "known_adjustments": known_adjustments,
        "unexplained_difference": round(unexplained, 3),
        "verdict": verdict,
        "recommendation": recommendation,
        "reasoning": reasoning,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# COMPONENT 3 READ-ONLY SALES, CONSUMPTION & WASTE TOOLS
# ═══════════════════════════════════════════════════════════════════════════════

async def get_sales_summary(days: int = 30) -> dict:
    """Read backend-calculated sales and revenue totals for a bounded period."""
    days = max(1, min(int(days), 366))
    return await _safe_get("/api/sales/summary", _date_range_query(days))


async def get_sales_records(days: int = 30) -> dict:
    """Read recorded sales for a bounded period."""
    days = max(1, min(int(days), 366))
    data = await _safe_get("/api/sales", {
        **_date_range_query(days),
        "page": 1,
        "pageSize": 100,
    })
    return {"days": days, "records": data}


async def get_component3_waste_summary(days: int = 30) -> dict:
    """Read backend-calculated waste totals for a bounded period."""
    days = max(1, min(int(days), 366))
    return await _safe_get("/api/wasterecords/summary", _date_range_query(days))


async def get_component3_waste_records(days: int = 30) -> dict:
    """Read waste history for a bounded period."""
    days = max(1, min(int(days), 366))
    data = await _safe_get("/api/wasterecords")
    if isinstance(data, dict) and "error" in data:
        return data
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    records = []
    for record in (data if isinstance(data, list) else []):
        raw_date = record.get("recordedAt") or record.get("wastedAt")
        try:
            recorded_at = datetime.fromisoformat(str(raw_date).replace("Z", "+00:00"))
            if recorded_at.tzinfo is None:
                recorded_at = recorded_at.replace(tzinfo=timezone.utc)
        except (TypeError, ValueError):
            continue
        if recorded_at >= cutoff:
            records.append(record)
    return {"days": days, "records": records, "count": len(records)}


async def get_recipes() -> dict:
    """Read menu item recipes and ingredient quantities."""
    data = await _safe_get("/api/recipes")
    if isinstance(data, dict) and "error" in data:
        return data
    return {"recipes": data, "count": len(data) if isinstance(data, list) else 0}


async def get_consumption_movements(days: int = 30) -> dict:
    """Read stock movements caused by consumption."""
    days = max(1, min(int(days), 366))
    data = await _safe_get(
        "/api/inventory/movements",
        {"movementType": "CONSUME", **_date_range_query(days)},
    )
    if isinstance(data, dict) and "error" in data:
        return data
    movements = data if isinstance(data, list) else []
    return {"days": days, "movements": movements, "count": len(movements)}


def build_component3_report(
    sales_summary: dict,
    waste_summary: dict,
    consumption: dict,
    recipes: dict,
    waste_records: dict | None = None,
    focus: str = "combined",
) -> dict:
    """Build a deterministic read-only sales, consumption and waste report."""
    values = (sales_summary, waste_summary, consumption, recipes)
    if not all(isinstance(value, dict) for value in values):
        return {"error": "Component 3 report inputs must be objects."}
    errors = {
        name: value["error"]
        for name, value in (
            ("sales", sales_summary),
            ("waste", waste_summary),
            ("consumption", consumption),
            ("recipes", recipes),
        )
        if "error" in value
    }
    if errors:
        return {
            "report_type": "SALES_CONSUMPTION_WASTE",
            "status": "DATA_UNAVAILABLE",
            "errors": errors,
            "read_only": True,
            "requires_approval": False,
            "approval_required": False,
        }
    total_waste = waste_summary.get(
        "totalWasteQuantity",
        waste_summary.get("totalWaste", waste_summary.get("total_waste", 0)),
    )
    try:
        total_waste = float(total_waste or 0)
    except (TypeError, ValueError):
        total_waste = 0.0

    high_impact = focus in ("waste", "combined") and total_waste > 0
    recommendations = []
    if focus == "waste" and total_waste > 0:
        recommendations.append("Review the recorded waste by ingredient and reason.")
    elif focus == "sales":
        recommendations.append("Use the recorded sales totals and item performance to guide menu decisions.")
    elif focus == "consumption":
        recommendations.append("Review recorded consumption movements by source before changing stock levels.")
    elif focus == "combined" and total_waste > 0:
        recommendations.append("Review recorded waste alongside sales and consumption patterns.")
    else:
        recommendations.append("Continue monitoring the recorded data for actionable patterns.")

    return {
        "report_type": "SALES_CONSUMPTION_WASTE",
        "sales": sales_summary,
        "waste": waste_summary,
        "consumption": consumption,
        "recipes": recipes,
        "status": "READ_ONLY",
        "waste_records": waste_records or {},
        "focus": focus,
        "recommendations": recommendations,
        "impact_level": "HIGH" if high_impact else "LOW",
        "confidence": 0.9 if high_impact else 0.7,
        "requires_approval": high_impact,
        "approval_required": high_impact,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# AI/ML DEMAND FORECASTING TOOLS (Component 4)
# ═══════════════════════════════════════════════════════════════════════════════

async def get_demand_forecast(
    ingredient_id: str | None = None,
    days: int = 7,
) -> dict:
    """
    Get 7-day ML-driven ingredient demand forecast based on actual database sales & recipes and forecasted weather.
    Falls back safely to rule-based baseline if data is insufficient (< 7 daily records).
    """
    days = max(1, min(int(days), 30))
    try:
        # Check backend weather context
        weather_ctx = None
        try:
            w_resp = await _get("/api/weather/forecast")
            if isinstance(w_resp, dict) and "current" in w_resp:
                weather_ctx = w_resp
        except Exception:
            pass

        forecasts = await forecast_pipeline.generate_forecast(
            _get,
            days=days,
            ingredient_id=ingredient_id,
            weather_context=weather_ctx,
        )
        if forecasts:
            if ingredient_id:
                target = next((f for f in forecasts if f["ingredientId"] == ingredient_id), None)
                if target:
                    return target
            return {
                "forecast_days": days,
                "count": len(forecasts),
                "forecasts": forecasts,
                "model_status": forecast_pipeline.metadata.get("status", "AVAILABLE"),
                "model_type": forecast_pipeline.metadata.get("model_type", "RandomForestRegressor"),
                "mae": forecast_pipeline.metadata.get("mae"),
                "weather_aware": weather_ctx is not None,
            }
    except Exception as exc:
        logger.error("ML Demand forecast execution error: %s", exc)

    # Safe fallback to .NET Planning forecast endpoint if Python ML throws an unexpected error
    try:
        end_date = datetime.now(timezone.utc)
        start_date = end_date - timedelta(days=days)
        data = await _get("/api/Planning/forecast", {
            "periodStart": start_date.strftime("%Y-%m-%d"),
            "periodEnd": end_date.strftime("%Y-%m-%d"),
        })
        if isinstance(data, list):
            if ingredient_id:
                target_item = next((item for item in data if item.get("ingredientId") == ingredient_id), None)
                if target_item:
                    return {
                        "ingredientId": target_item.get("ingredientId"),
                        "ingredientName": target_item.get("ingredientName"),
                        "unit": target_item.get("unit"),
                        "forecastPeriodDays": days,
                        "weeklyForecast": target_item.get("weeklyForecast", 0),
                        "dailyAverageDemand": target_item.get("dailyAverageDemand", 0),
                        "predictionSource": "RULE_BASED",
                        "reason": target_item.get("reason", "Fallback rule-based demand"),
                    }
            return {
                "forecast_days": days,
                "count": len(data),
                "forecasts": data,
                "predictionSource": "RULE_BASED",
            }
    except Exception:
        pass

    return {
        "status": "INSUFFICIENT_DATA",
        "message": "Demand forecast unavailable due to insufficient history or offline backend.",
        "forecast_days": days,
        "forecasts": [],
    }


async def train_demand_model(lookback_days: int = 60) -> dict:
    """Manually train and chronologically validate the ML demand forecasting Random Forest model."""
    lookback_days = max(14, min(int(lookback_days), 365))
    return await forecast_pipeline.train_and_evaluate(_get, lookback_days=lookback_days, force=True)


async def evaluate_demand_model() -> dict:
    """Retrieve the latest model evaluation metrics (MAE, RMSE, baseline comparison)."""
    return {
        "model_metadata": forecast_pipeline.metadata,
        "is_stale": forecast_pipeline.is_stale(),
        "model_type": forecast_pipeline.metadata.get("model_type", "RandomForestRegressor"),
        "features": forecast_pipeline.metadata.get("features", []),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# GEMINI FUNCTION DECLARATIONS & DISPATCH
# ═══════════════════════════════════════════════════════════════════════════════

TOOL_DEFINITIONS = Tool(function_declarations=[
    FunctionDeclaration(
        name="list_all_ingredients",
        description="List all ingredients in the restaurant inventory with complete details: ingredient ID, name, SKU, category, unit, current stock, thresholds, and active batches.",
        parameters={
            "type": "object",
            "properties": {
                "category": {"type": "string", "description": "Optional category filter."},
                "low_stock_only": {"type": "boolean", "description": "Filter to items below minimum stock."},
                "search": {"type": "string", "description": "Search term for name or SKU."},
            },
            "required": [],
        },
    ),
    FunctionDeclaration(
        name="get_ingredient_details",
        description="Get master data and current stock details for a single ingredient by ID, name, or SKU.",
        parameters={
            "type": "object",
            "properties": {
                "ingredient_id_or_name": {"type": "string", "description": "UUID ID, name, or SKU of the ingredient."},
            },
            "required": ["ingredient_id_or_name"],
        },
    ),
    FunctionDeclaration(
        name="list_all_stocks",
        description="List current stock balances, valuation, and status for all ingredients.",
        parameters={
            "type": "object",
            "properties": {
                "low_stock_only": {"type": "boolean"},
                "out_of_stock_only": {"type": "boolean"},
                "storage_location": {"type": "string"},
                "search": {"type": "string"},
            },
            "required": [],
        },
    ),
    FunctionDeclaration(
        name="get_stock_details",
        description="Get stock details for an ingredient by name, ID, or SKU including active batches and movements.",
        parameters={
            "type": "object",
            "properties": {
                "ingredient_id_or_name": {"type": "string"},
            },
            "required": ["ingredient_id_or_name"],
        },
    ),
    FunctionDeclaration(
        name="plan_guided_workflow",
        description="Generate an interactive UI guided workflow plan for navigating the application.",
        parameters={
            "type": "object",
            "properties": {
                "task_description": {"type": "string"},
                "workflow_type": {"type": "string"},
            },
            "required": ["task_description"],
        },
    ),
    FunctionDeclaration(
        name="get_available_guided_workflows",
        description="Get list of all supported interactive UI guided workflows.",
        parameters={"type": "object", "properties": {}, "required": []},
    ),
    FunctionDeclaration(
        name="get_all_stock_levels",
        description="Get current stock levels for all ingredients.",
        parameters={"type": "object", "properties": {}, "required": []},
    ),
    FunctionDeclaration(
        name="get_ingredient_stock",
        description="Get detailed stock info for a single ingredient.",
        parameters={
            "type": "object",
            "properties": {
                "ingredient_id": {"type": "string"},
            },
            "required": ["ingredient_id"],
        },
    ),
    FunctionDeclaration(
        name="get_expiring_batches",
        description="Get stock batches expiring within N days.",
        parameters={
            "type": "object",
            "properties": {
                "days_ahead": {"type": "integer"},
            },
            "required": [],
        },
    ),
    FunctionDeclaration(
        name="get_demand_forecast",
        description="Get ML-driven or rule-based demand forecast for an ingredient or all ingredients over N days.",
        parameters={
            "type": "object",
            "properties": {
                "ingredient_id": {"type": "string", "description": "Optional ingredient UUID"},
                "days": {"type": "integer", "description": "Forecast horizon in days (default 7)"},
            },
            "required": [],
        },
    ),
    FunctionDeclaration(
        name="train_demand_model",
        description="Trigger retraining of the ML demand forecasting Random Forest model on historical sales and recipes.",
        parameters={
            "type": "object",
            "properties": {
                "lookback_days": {"type": "integer", "description": "Days of history to analyze (default 60)"},
            },
            "required": [],
        },
    ),
    FunctionDeclaration(
        name="evaluate_demand_model",
        description="Retrieve evaluation metrics (MAE, RMSE, baseline comparison) for the ML demand model.",
        parameters={"type": "object", "properties": {}, "required": []},
    ),
    FunctionDeclaration(
        name="get_supplier_options",
        description="Get ranked suppliers for an ingredient and required quantity.",
        parameters={
            "type": "object",
            "properties": {
                "ingredient_id": {"type": "string"},
                "required_quantity": {"type": "number"},
            },
            "required": ["ingredient_id", "required_quantity"],
        },
    ),
    FunctionDeclaration(
        name="get_stock_movements",
        description="Get stock movement history for an ingredient.",
        parameters={
            "type": "object",
            "properties": {
                "ingredient_id": {"type": "string"},
                "days": {"type": "integer"},
            },
            "required": ["ingredient_id"],
        },
    ),
    FunctionDeclaration(
        name="get_waste_records",
        description="Get waste records, optionally filtered by ingredient.",
        parameters={
            "type": "object",
            "properties": {
                "ingredient_id": {"type": "string"},
                "days": {"type": "integer"},
            },
            "required": [],
        },
    ),
    FunctionDeclaration(
        name="get_stock_adjustments",
        description="Get stock adjustment records.",
        parameters={
            "type": "object",
            "properties": {
                "ingredient_id": {"type": "string"},
            },
            "required": [],
        },
    ),
    FunctionDeclaration(
        name="calculate_expected_consumption",
        description="Calculate expected vs actual consumption from sales + recipes.",
        parameters={
            "type": "object",
            "properties": {
                "ingredient_id": {"type": "string"},
                "days": {"type": "integer"},
            },
            "required": ["ingredient_id"],
        },
    ),
    FunctionDeclaration(
        name="analyze_consumption_patterns",
        description="Analyze 90-day consumption patterns for an ingredient.",
        parameters={
            "type": "object",
            "properties": {
                "ingredient_id": {"type": "string"},
            },
            "required": ["ingredient_id"],
        },
    ),
    FunctionDeclaration(
        name="build_po_proposal",
        description="Build a purchase order proposal for manager approval.",
        parameters={
            "type": "object",
            "properties": {
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "ingredient_id": {"type": "string"},
                            "ingredient_name": {"type": "string"},
                            "supplier_id": {"type": "string"},
                            "supplier_name": {"type": "string"},
                            "quantity": {"type": "number"},
                            "unit": {"type": "string"},
                            "unit_price": {"type": "number"},
                            "total_price": {"type": "number"},
                            "estimated_days": {"type": "integer"},
                            "reasoning": {"type": "string"},
                        },
                        "required": ["ingredient_id", "supplier_id", "quantity", "unit_price"],
                    },
                },
                "workflow_id": {"type": "string"},
                "reasoning": {"type": "string"},
            },
            "required": ["items", "workflow_id", "reasoning"],
        },
    ),
    FunctionDeclaration(
        name="propose_reorder_level_change",
        description="Propose new min/max stock levels for one or more ingredients.",
        parameters={
            "type": "object",
            "properties": {
                "optimizations": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "ingredient_id": {"type": "string"},
                            "ingredient_name": {"type": "string"},
                            "current_min": {"type": "number"},
                            "current_max": {"type": "number"},
                            "new_minimum": {"type": "number"},
                            "new_maximum": {"type": "number"},
                            "reason": {"type": "string"},
                        },
                        "required": ["ingredient_id", "new_minimum", "new_maximum"],
                    },
                },
                "reasoning": {"type": "string"},
            },
            "required": ["optimizations", "reasoning"],
        },
    ),
    FunctionDeclaration(
        name="rank_emergency_options",
        description="Rank suppliers for emergency procurement (fastest first).",
        parameters={
            "type": "object",
            "properties": {
                "ingredient_id": {"type": "string"},
                "required_quantity": {"type": "number"},
            },
            "required": ["ingredient_id", "required_quantity"],
        },
    ),
    FunctionDeclaration(
        name="generate_anomaly_report",
        description="Generate a structured stock anomaly investigation report.",
        parameters={
            "type": "object",
            "properties": {
                "ingredient_id": {"type": "string"},
                "ingredient_name": {"type": "string"},
                "expected": {"type": "number"},
                "actual": {"type": "number"},
                "known_waste": {"type": "number"},
                "known_adjustments": {"type": "number"},
                "reasoning": {"type": "string"},
            },
            "required": ["ingredient_id", "ingredient_name", "expected", "actual", "known_waste", "known_adjustments", "reasoning"],
        },
    ),
    FunctionDeclaration(
        name="get_sales_summary",
        description="Read backend-calculated sales and revenue totals for a bounded period.",
        parameters={
            "type": "object",
            "properties": {
                "days": {"type": "integer", "description": "Look-back period, maximum 366 days"},
            },
            "required": [],
        },
    ),
    FunctionDeclaration(
        name="get_sales_records",
        description="Read recorded sales for a bounded period; never create or change sales.",
        parameters={
            "type": "object",
            "properties": {
                "days": {"type": "integer", "description": "Look-back period, maximum 366 days"},
            },
            "required": [],
        },
    ),
    FunctionDeclaration(
        name="get_component3_waste_summary",
        description="Read backend-calculated waste totals for a bounded period.",
        parameters={
            "type": "object",
            "properties": {
                "days": {"type": "integer", "description": "Look-back period, maximum 366 days"},
            },
            "required": [],
        },
    ),
    FunctionDeclaration(
        name="get_component3_waste_records",
        description="Read waste history for a bounded period, including ingredient and reason fields.",
        parameters={
            "type": "object",
            "properties": {
                "days": {"type": "integer", "description": "Look-back period, maximum 366 days"},
            },
            "required": [],
        },
    ),
    FunctionDeclaration(
        name="get_recipes",
        description="Read menu item recipes and ingredient quantities.",
        parameters={"type": "object", "properties": {}, "required": []},
    ),
    FunctionDeclaration(
        name="get_consumption_movements",
        description="Read stock movements caused by consumption; never issue stock.",
        parameters={
            "type": "object",
            "properties": {
                "days": {"type": "integer", "description": "Look-back period, maximum 366 days"},
            },
            "required": [],
        },
    ),
    FunctionDeclaration(
        name="build_component3_report",
        description="Build a deterministic read-only sales, consumption and waste report.",
        parameters={
            "type": "object",
            "properties": {
                "sales_summary": {"type": "object"},
                "waste_summary": {"type": "object"},
                "consumption": {"type": "object"},
                "recipes": {"type": "object"},
                "waste_records": {"type": "object"},
                "focus": {"type": "string"},
            },
            "required": ["sales_summary", "waste_summary", "consumption", "recipes"],
        },
    ),
])

TOOL_DISPATCH: dict[str, Any] = {
    "plan_guided_workflow": plan_guided_workflow,
    "get_available_guided_workflows": get_available_guided_workflows,
    "validate_guided_workflow_plan": validate_guided_workflow_plan,
    "list_all_stocks": list_all_stocks,
    "get_all_stocks": list_all_stocks,
    "list_stocks": list_all_stocks,
    "get_stock_details": get_stock_details,
    "get_stock_by_ingredient": get_stock_details,
    "list_all_ingredients": list_all_ingredients,
    "get_all_ingredients": list_all_ingredients,
    "list_ingredients": list_all_ingredients,
    "get_ingredient_details": get_ingredient_details,
    "get_all_stock_levels": get_all_stock_levels,
    "get_ingredient_stock": get_ingredient_stock,
    "get_expiring_batches": get_expiring_batches,
    "get_demand_forecast": get_demand_forecast,
    "train_demand_model": train_demand_model,
    "evaluate_demand_model": evaluate_demand_model,
    "get_supplier_options": get_supplier_options,
    "get_stock_movements": get_stock_movements,
    "get_waste_records": get_waste_records,
    "get_stock_adjustments": get_stock_adjustments,
    "calculate_expected_consumption": calculate_expected_consumption,
    "analyze_consumption_patterns": analyze_consumption_patterns,
    "build_po_proposal": build_po_proposal,
    "propose_reorder_level_change": propose_reorder_level_change,
    "rank_emergency_options": rank_emergency_options,
    "generate_anomaly_report": generate_anomaly_report,
    "get_sales_summary": get_sales_summary,
    "get_sales_records": get_sales_records,
    "get_component3_waste_summary": get_component3_waste_summary,
    "get_component3_waste_records": get_component3_waste_records,
    "get_recipes": get_recipes,
    "get_consumption_movements": get_consumption_movements,
    "build_component3_report": build_component3_report,
}

COMPONENT3_READ_ONLY_TOOLS = frozenset({
    "get_sales_summary",
    "get_sales_records",
    "get_component3_waste_summary",
    "get_component3_waste_records",
    "get_recipes",
    "get_consumption_movements",
    "build_component3_report",
})


async def call_tool(
    name: str,
    args: dict,
    allowed_tools: frozenset[str] | None = None,
) -> Any:
    """Dispatch a tool call by name safely."""
    if allowed_tools is not None and name not in allowed_tools:
        return {"error": f"Tool '{name}' is not allowed in this workflow."}
    fn = TOOL_DISPATCH.get(name)
    if not fn:
        return {"error": f"Unknown tool: {name}"}
    try:
        if asyncio.iscoroutinefunction(fn):
            return await fn(**args)
        return fn(**args)
    except Exception as e:
        return {"error": str(e)}
