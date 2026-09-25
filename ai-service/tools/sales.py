"""Read-only Component 3 tools for sales, consumption and waste analysis."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from google.generativeai.types import FunctionDeclaration, Tool

from .inventory import _date_range_query, _get


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
    return await _safe_get("/api/sales/summary", _date_range_query(days))


async def get_sales_records(days: int = 30) -> dict:
    days = max(1, min(int(days), 366))
    data = await _safe_get("/api/sales", {
        **_date_range_query(days),
        "page": 1,
        "pageSize": 100,
    })
    return {"days": days, "records": data}


async def get_component3_waste_summary(days: int = 30) -> dict:
    days = max(1, min(int(days), 366))
    return await _safe_get("/api/wasterecords/summary", _date_range_query(days))


async def get_component3_waste_records(days: int = 30) -> dict:
    """Read waste history and apply the requested UTC date window locally."""
    days = max(1, min(int(days), 366))
    data = await _safe_get("/api/wasterecords")
    if isinstance(data, dict) and "error" in data:
        return data
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    records = []
    for record in data if isinstance(data, list) else []:
        raw_date = record.get("recordedAt")
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
    data = await _safe_get("/api/recipes")
    if isinstance(data, dict) and "error" in data:
        return data
    return {"recipes": data, "count": len(data) if isinstance(data, list) else 0}


async def get_consumption_movements(days: int = 30) -> dict:
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
    "get_component3_waste_summary": get_component3_waste_summary,
    "get_component3_waste_records": get_component3_waste_records,
    "get_recipes": get_recipes,
    "get_consumption_movements": get_consumption_movements,
    "build_component3_report": build_component3_report,
}

COMPONENT3_READ_ONLY_TOOLS = frozenset(TOOL_DISPATCH)
