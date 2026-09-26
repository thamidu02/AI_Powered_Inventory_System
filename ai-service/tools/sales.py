"""Read-only Component 3 tools for sales, consumption and waste analysis."""

from __future__ import annotations

import asyncio
import math
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from google.generativeai.types import FunctionDeclaration, Tool

from .inventory import _date_range_query, _get


def _date_params(
    days: int,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict[str, str]:
    if date_from and date_to:
        return {"from": date_from, "to": date_to}
    return _date_range_query(days)


async def _safe_get(path: str, params: dict[str, Any] | None = None) -> Any:
    """Return a structured error instead of hiding an unavailable data source."""
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


async def get_sales_summary(
    days: int = 30,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict:
    days = max(1, min(int(days), 366))
    data = await _safe_get("/api/sales/summary", _date_params(days, date_from, date_to))
    expected = ("totalSales", "totalRevenue", "averageOrderValue", "totalItemsSold")
    if not isinstance(data, dict):
        return {"error": "Sales summary endpoint returned an unexpected response shape."}
    if "error" not in data and not all(key in data for key in expected):
        return {"error": "Sales summary response is missing required metrics."}
    return data


async def get_sales_records(
    days: int = 30,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict:
    days = max(1, min(int(days), 366))
    params = _date_params(days, date_from, date_to)
    records = []
    page = 1
    page_size = 100
    while page <= 1000:
        data = await _safe_get("/api/sales", {
            **params,
            "page": page,
            "pageSize": page_size,
        })
        if isinstance(data, dict) and "error" in data:
            return data
        if not isinstance(data, list):
            return {"error": "Sales endpoint returned an unexpected response shape."}
        if any(not isinstance(row, dict) for row in data):
            return {"error": "Sales endpoint returned an invalid record."}
        records.extend(data)
        if len(data) < page_size:
            return {"days": days, "records": records, "count": len(records)}
        page += 1
    return {
        "error": "Sales record pagination exceeded the safety limit.",
        "incomplete": True,
        "days": days,
        "records": records,
        "count": len(records),
    }


async def get_menu_items() -> dict:
    data = await _safe_get("/api/menuitems")
    if isinstance(data, dict) and "error" in data:
        return data
    if not isinstance(data, list):
        return {"error": "Menu items endpoint returned an unexpected response shape."}
    return {"items": data, "count": len(data)}


async def get_component3_inventory() -> dict:
    data = await _safe_get("/api/inventory")
    if isinstance(data, dict) and "error" in data:
        return data
    if not isinstance(data, list):
        return {"error": "Inventory endpoint returned an unexpected response shape."}
    return {"items": data, "count": len(data)}


async def get_sales_period_comparison(
    days: int = 7,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict:
    """Fetch current and immediately preceding equal-duration periods."""
    days = max(1, min(int(days), 366))
    current_to = (
        datetime.fromisoformat(date_to.replace("Z", "+00:00"))
        if date_to else datetime.now(timezone.utc).replace(microsecond=0)
    )
    current_from = (
        datetime.fromisoformat(date_from.replace("Z", "+00:00"))
        if date_from else current_to - timedelta(days=days)
    )
    previous_to = current_from - timedelta(microseconds=1)
    previous_from = previous_to - timedelta(days=days) + timedelta(microseconds=1)

    def query(start: datetime, end: datetime) -> dict[str, str]:
        return {
            "from": start.isoformat().replace("+00:00", "Z"),
            "to": end.isoformat().replace("+00:00", "Z"),
        }

    current = await _safe_get("/api/sales/summary", query(current_from, current_to))
    previous = await _safe_get("/api/sales/summary", query(previous_from, previous_to))
    if (
        not isinstance(current, dict)
        or not isinstance(previous, dict)
        or "error" in current
        or "error" in previous
    ):
        return {
            "error": "Unable to compare both sales periods.",
            "current": current,
            "previous": previous,
        }
    metrics = ("totalSales", "totalRevenue", "averageOrderValue", "totalItemsSold")
    difference = {}
    for metric in metrics:
        current_value = current.get(metric)
        previous_value = previous.get(metric)
        delta = current_value - previous_value
        difference[metric] = {
            "absolute": delta,
            "percentage": (
                (delta / previous_value) * 100
                if previous_value
                else None
            ),
        }
    return {
        "days": days,
        "current": current,
        "previous": previous,
        "difference": difference,
    }


async def get_component3_waste_summary(
    days: int = 30,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict:
    days = max(1, min(int(days), 366))
    data = await _safe_get(
        "/api/wasterecords/summary",
        _date_params(days, date_from, date_to),
    )
    if not isinstance(data, dict):
        return {"error": "Waste summary endpoint returned an unexpected response shape."}
    if "error" not in data and not all(
        key in data for key in ("totalWasteRecords", "totalWasteQuantity")
    ):
        return {"error": "Waste summary response is missing required metrics."}
    return data


async def get_component3_waste_period_comparison(
    days: int = 7,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict:
    """Compare waste summaries for adjacent equal-duration periods."""
    days = max(1, min(int(days), 366))
    current_to = (
        datetime.fromisoformat(date_to.replace("Z", "+00:00"))
        if date_to else datetime.now(timezone.utc).replace(microsecond=0)
    )
    current_from = (
        datetime.fromisoformat(date_from.replace("Z", "+00:00"))
        if date_from else current_to - timedelta(days=days)
    )
    previous_to = current_from - timedelta(microseconds=1)
    previous_from = previous_to - timedelta(days=days) + timedelta(microseconds=1)

    def query(start: datetime, end: datetime) -> dict[str, str]:
        return {
            "from": start.isoformat().replace("+00:00", "Z"),
            "to": end.isoformat().replace("+00:00", "Z"),
        }

    current, previous = await asyncio.gather(
        _safe_get("/api/wasterecords/summary", query(current_from, current_to)),
        _safe_get("/api/wasterecords/summary", query(previous_from, previous_to)),
    )
    required = ("totalWasteRecords", "totalWasteQuantity")
    if any(
        not isinstance(period, dict)
        or "error" in period
        or not all(
            isinstance(period.get(key), (int, float))
            and not isinstance(period.get(key), bool)
            and math.isfinite(period[key])
            for key in required
        )
        for period in (current, previous)
    ):
        return {
            "error": "Unable to compare both waste periods because a summary is unavailable or malformed.",
            "current": current,
            "previous": previous,
        }
    difference = {}
    for metric in required:
        current_value = current[metric]
        previous_value = previous[metric]
        delta = current_value - previous_value
        difference[metric] = {
            "absolute": delta,
            "percentage": (delta / previous_value * 100) if previous_value else None,
        }
    return {
        "days": days,
        "current": current,
        "previous": previous,
        "difference": difference,
    }


async def get_component3_waste_records(
    days: int = 30,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict:
    """Read all waste history pages for the requested UTC date window."""
    days = max(1, min(int(days), 366))
    params = _date_params(days, date_from, date_to)
    records = []
    page = 1
    page_size = 100
    while page <= 1000:
        data = await _safe_get("/api/wasterecords", {
            **params,
            "page": page,
            "pageSize": page_size,
        })
        if isinstance(data, dict) and "error" in data:
            return data
        if not isinstance(data, list):
            return {"error": "Waste records endpoint returned an unexpected response shape."}
        if any(not isinstance(row, dict) for row in data):
            return {"error": "Waste records endpoint returned an invalid record."}
        records.extend(data)
        if len(data) < page_size:
            return {"days": days, "records": records, "count": len(records)}
        page += 1
    return {
        "error": "Waste record pagination exceeded the safety limit.",
        "incomplete": True,
        "days": days,
        "records": records,
        "count": len(records),
    }


async def get_recipes() -> dict:
    data = await _safe_get("/api/recipes")
    if isinstance(data, dict) and "error" in data:
        return data
    if not isinstance(data, list):
        return {"error": "Recipes endpoint returned an unexpected response shape."}
    return {"recipes": data, "count": len(data)}


async def get_consumption_movements(
    days: int = 30,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict:
    days = max(1, min(int(days), 366))
    data = await _safe_get(
        "/api/inventory/movements",
        {"movementType": "CONSUME", **_date_params(days, date_from, date_to)},
    )
    if isinstance(data, dict) and "error" in data:
        return data
    if not isinstance(data, list):
        return {"error": "Stock movements endpoint returned an unexpected response shape."}
    if any(not isinstance(row, dict) for row in data):
        return {"error": "Stock movements endpoint returned an invalid record."}
    movements = data
    for movement in movements:
        if not isinstance(movement, dict):
            return {"error": "Stock movements endpoint returned an invalid record."}
        required_fields = ("id", "ingredientId", "ingredientName", "unit", "quantity", "movementType", "createdAt")
        if any(field not in movement for field in required_fields):
            return {"error": "Stock movement response is missing required fields."}
    return {
        "days": days,
        "from": date_from,
        "to": date_to,
        "movements": movements,
        "count": len(movements),
    }


async def get_component3_all_movements(
    days: int = 30,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict:
    """Read all dated movement types for classification in combined reports."""
    days = max(1, min(int(days), 366))
    data = await _safe_get(
        "/api/inventory/movements",
        _date_params(days, date_from, date_to),
    )
    if isinstance(data, dict) and "error" in data:
        return data
    if not isinstance(data, list):
        return {"error": "Stock movements endpoint returned an unexpected response shape."}
    return {"days": days, "movements": data, "count": len(data)}


def build_component3_report(
    sales_summary: dict,
    waste_summary: dict,
    consumption: dict,
    recipes: dict,
    waste_records: dict | None = None,
    focus: str = "combined",
) -> dict:
    """Build a deterministic report without inventing unavailable data."""
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
    return {
        "report_type": "SALES_CONSUMPTION_WASTE",
        "sales": sales_summary,
        "waste": waste_summary,
        "consumption": consumption,
        "recipes": recipes,
        "status": "READ_ONLY",
        "waste_records": waste_records or {},
        "focus": focus,
        "recommendations": [],
        "impact_level": "LOW",
        "confidence": 0.7,
        "requires_approval": False,
        "approval_required": False,
    }


TOOL_DEFINITIONS = Tool(function_declarations=[
    FunctionDeclaration(
        name="get_sales_summary",
        description="Read backend-calculated sales and revenue totals for a bounded period.",
        parameters={"type": "object", "properties": {
            "days": {"type": "integer", "description": "Look-back period, maximum 366 days"},
        }, "required": []},
    ),
    FunctionDeclaration(
        name="get_sales_records",
        description="Read recorded sales for a bounded period; never create or change sales.",
        parameters={"type": "object", "properties": {
            "days": {"type": "integer", "description": "Look-back period, maximum 366 days"},
        }, "required": []},
    ),
    FunctionDeclaration(
        name="get_component3_waste_summary",
        description="Read backend-calculated waste totals for a bounded period.",
        parameters={"type": "object", "properties": {
            "days": {"type": "integer", "description": "Look-back period, maximum 366 days"},
        }, "required": []},
    ),
    FunctionDeclaration(
        name="get_component3_waste_records",
        description="Read waste history for a bounded period, including ingredient and reason fields.",
        parameters={"type": "object", "properties": {
            "days": {"type": "integer", "description": "Look-back period, maximum 366 days"},
        }, "required": []},
    ),
    FunctionDeclaration(
        name="get_recipes",
        description="Read menu item recipes and ingredient quantities.",
        parameters={"type": "object", "properties": {}, "required": []},
    ),
    FunctionDeclaration(
        name="get_consumption_movements",
        description="Read stock movements caused by consumption; never issue stock.",
        parameters={"type": "object", "properties": {
            "days": {"type": "integer", "description": "Look-back period, maximum 366 days"},
        }, "required": []},
    ),
    FunctionDeclaration(
        name="build_component3_report",
        description="Build a deterministic read-only sales, consumption and waste report.",
        parameters={"type": "object", "properties": {
            "sales_summary": {"type": "object"},
            "waste_summary": {"type": "object"},
            "consumption": {"type": "object"},
            "recipes": {"type": "object"},
            "waste_records": {"type": "object"},
            "focus": {"type": "string"},
        }, "required": ["sales_summary", "waste_summary", "consumption", "recipes"]},
    ),
])

TOOL_DISPATCH = {
    "get_sales_summary": get_sales_summary,
    "get_sales_records": get_sales_records,
    "get_sales_period_comparison": get_sales_period_comparison,
    "get_menu_items": get_menu_items,
    "get_component3_inventory": get_component3_inventory,
    "get_component3_all_movements": get_component3_all_movements,
    "get_component3_waste_summary": get_component3_waste_summary,
    "get_component3_waste_period_comparison": get_component3_waste_period_comparison,
    "get_component3_waste_records": get_component3_waste_records,
    "get_recipes": get_recipes,
    "get_consumption_movements": get_consumption_movements,
    "build_component3_report": build_component3_report,
}

COMPONENT3_READ_ONLY_TOOLS = frozenset(TOOL_DISPATCH)
