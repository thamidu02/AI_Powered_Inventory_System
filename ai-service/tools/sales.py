"""Read-only Component 3 tools for sales, consumption and waste analysis."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from google.generativeai.types import FunctionDeclaration, Tool

from .inventory import _date_range_query, _get, _with_query


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


async def get_sales_summary(days: int = 30) -> dict:
    days = max(1, min(int(days), 366))
    return await _safe_get(
        _with_query("/api/sales/summary", _date_range_query(days))
    )


async def get_sales_records(days: int = 30) -> dict:
    days = max(1, min(int(days), 366))
    data = await _safe_get(_with_query("/api/sales", {
        **_date_range_query(days),
        "page": 1,
        "pageSize": 100,
    }))
    return {"days": days, "records": data}


async def get_component3_waste_summary(days: int = 30) -> dict:
    days = max(1, min(int(days), 366))
    return await _safe_get(
        _with_query("/api/wasterecords/summary", _date_range_query(days))
    )


async def get_recipes() -> dict:
    data = await _safe_get("/api/recipes")
    if isinstance(data, dict) and "error" in data:
        return data
    return {"recipes": data, "count": len(data) if isinstance(data, list) else 0}


async def get_consumption_movements(days: int = 30) -> dict:
    days = max(1, min(int(days), 366))
    data = await _safe_get("/api/inventory/movements", {"movementType": "CONSUME"})
    if isinstance(data, dict) and "error" in data:
        return data
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    movements = []
    for movement in data:
        raw_date = movement.get("createdAt")
        try:
            date = datetime.fromisoformat(str(raw_date).replace("Z", "+00:00"))
            if date.tzinfo is None:
                date = date.replace(tzinfo=timezone.utc)
        except (TypeError, ValueError):
            continue
        if date >= cutoff:
            movements.append(movement)
    return {"days": days, "movements": movements[:500], "count": len(movements)}


def build_component3_report(
    sales_summary: dict,
    waste_summary: dict,
    consumption: dict,
    recipes: dict,
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
    total_waste = waste_summary.get(
        "totalWasteQuantity",
        waste_summary.get("totalWaste", waste_summary.get("total_waste", 0)),
    )
    try:
        total_waste = float(total_waste or 0)
    except (TypeError, ValueError):
        total_waste = 0
    high_impact = total_waste > 0
    return {
        "report_type": "SALES_CONSUMPTION_WASTE",
        "sales": sales_summary,
        "waste": waste_summary,
        "consumption": consumption,
        "recipes": recipes,
        "status": "READ_ONLY",
        "recommendations": (
            ["Review recorded waste by reason and ingredient."]
            if high_impact
            else ["Continue monitoring recorded sales, consumption and waste."]
        ),
        "impact_level": "HIGH" if high_impact else "LOW",
        "confidence": 0.9 if high_impact else 0.7,
        "requires_approval": high_impact,
        "approval_required": high_impact,
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
        }, "required": ["sales_summary", "waste_summary", "consumption", "recipes"]},
    ),
])

TOOL_DISPATCH = {
    "get_sales_summary": get_sales_summary,
    "get_sales_records": get_sales_records,
    "get_component3_waste_summary": get_component3_waste_summary,
    "get_recipes": get_recipes,
    "get_consumption_movements": get_consumption_movements,
    "build_component3_report": build_component3_report,
}

COMPONENT3_READ_ONLY_TOOLS = frozenset(TOOL_DISPATCH)
