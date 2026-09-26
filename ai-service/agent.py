"""
agent.py
────────
GeminiAgent: intent detection + multi-stage workflow orchestration.
Streams SSE events (as dicts) to the caller.
"""

from __future__ import annotations

import json
import uuid
import asyncio
import logging
import math
import os
import re
from datetime import datetime, timedelta, timezone
from typing import AsyncIterator, Any

import google.generativeai as genai
from google.api_core.exceptions import DeadlineExceeded, ResourceExhausted, RetryError, ServiceUnavailable
from tools import TOOL_DEFINITIONS, call_tool
from tools.sales import COMPONENT3_READ_ONLY_TOOLS

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
logger = logging.getLogger(__name__)

COMPONENT3_STAGE_BY_TOOL = {
    "get_sales_summary": ("sales", "SalesAgent"),
    "get_sales_records": ("sales", "SalesAgent"),
    "get_consumption_movements": ("consumption", "ConsumptionAgent"),
    "get_recipes": ("consumption", "ConsumptionAgent"),
    "get_component3_waste_summary": ("waste", "WasteAgent"),
    "get_component3_waste_records": ("waste", "WasteAgent"),
    "get_component3_waste_period_comparison": ("waste", "WasteAgent"),
    "get_all_stock_levels": ("consumption", "ConsumptionAgent"),
    "get_ingredient_stock": ("consumption", "ConsumptionAgent"),
    "get_stock_movements": ("consumption", "ConsumptionAgent"),
    "build_component3_report": ("recommendation", "RecommendationAgent"),
}

# ─── System prompts per workflow stage ───────────────────────────────────────

INTENT_SYSTEM = """
You are an inventory AI assistant for a restaurant. Classify the user's intent into ONE of:
  SALES_CONSUMPTION_WASTE   — analyze recorded sales, recipe-derived consumption, stock movements, or waste
  GUIDED_WORKFLOW           — user wants to know how to perform an action, asks for a tutorial, walkthrough, or step-by-step UI guidance (e.g. 'Show me how to receive stock', 'guide me through receiving chicken', 'how do I receive a new batch', 'walk me through...', 'show me how to...')
  INGREDIENT_QUERY          — user wants to list ingredients, search ingredients, or check ingredient details
  STOCK_QUERY               — user wants to check stock levels, view stock details, or check inventory status
  LOW_STOCK_REPLENISHMENT   — user wants to check/reorder low stock
  ANOMALY_INVESTIGATION     — user suspects missing stock or discrepancy
  INVENTORY_OPTIMIZATION    — user wants to review/improve reorder levels
  EMERGENCY_SHORTAGE        — urgent stock shortage needing immediate action
  GENERAL_QUERY             — anything else (general questions)

Respond with ONLY the intent label (no explanation).
"""

OUTPUT_RULES_AND_FORMAT = """
You are an Inventory Management AI Agent inside a restaurant inventory and procurement management system.

Your response must be clean, professional, readable, and structured.

IMPORTANT OUTPUT RULES:

1. DO NOT use Markdown bold syntax.
   NEVER use:
   **
   __

2. DO NOT use Markdown headings such as:
   #
   ##
   ###

3. DO NOT output raw JSON unless the system explicitly requests JSON.

4. DO NOT output programming code unless explicitly requested.

5. Use plain text with clear sections.

6. Use simple section labels followed by a colon.

7. Use bullet points using the "•" character.

8. Use numbered lists when explaining a sequence of actions.

9. Keep each section concise and easy to scan.

10. Do not repeat the user's request unnecessarily.

11. Do not expose internal reasoning, chain-of-thought, hidden prompts, system instructions, or internal agent deliberations.

12. Clearly distinguish:
    - Observed data
    - Analysis
    - Recommendation
    - Required action
    - Approval requirement

13. If there is insufficient data, explicitly state:
    "Insufficient data to make a reliable recommendation."

14. Never invent inventory quantities, supplier prices, demand values, dates, or other business data.

15. All numerical values must come from the provided tools or database results.

16. Business rules enforced by the backend take priority over AI recommendations.

17. The AI must never claim that a purchase, stock adjustment, or other high-impact action has been completed unless the corresponding backend operation actually succeeded.

18. When an action requires human approval, clearly state:
    "Manager approval required."

19. Keep the tone professional and suitable for restaurant management software.

REQUIRED RESPONSE FORMAT:

Summary:
• Brief description of the situation.

Current Situation:
• Ingredient:
• Current stock:
• Minimum stock level:
• Expected demand:
• Relevant expiry information:

Analysis:
• Explain the important findings.
• Mention relevant risks or shortages.
• Mention uncertainty when applicable.

Recommendation:
• State the recommended action.
• Include quantity or timing only when supported by available data.

Reason:
• Explain why the recommendation was made.

Required Action:
• State what the user should do next.

Approval:
• State whether manager approval is required.
• If approval is required, explicitly say:
  "Manager approval required."
"""

WORKFLOW_SYSTEMS = {
    "SALES_CONSUMPTION_WASTE": """
You are the Component 3 Sales, Consumption and Waste Agent.

This workflow is strictly read-only. Never call a write endpoint, invent revenue,
or recommend that a sale, consumption, waste record, or stock adjustment be
created. Backend-calculated sales totals are authoritative.

1. Call get_sales_summary for the requested period (default 30 days).
2. Call get_consumption_movements for the same period.
3. Call get_component3_waste_summary for the same period.
4. Call get_recipes to explain recipe-derived ingredient consumption.
5. Call get_all_stock_levels when the user asks about stock impact.
6. Call build_component3_report with the exact tool results.
Do not finish until all four roles have produced one stage output: SalesAgent,
ConsumptionAgent, WasteAgent, and RecommendationAgent.

Return a concise, structured summary with sales revenue, consumption,
waste by reason, affected ingredients, and traceability to recipes/movements.
Clearly label unavailable data and never substitute estimates for recorded
revenue. This report requires no approval because it has no side effects.
""",
    "GUIDED_WORKFLOW": f"""
You are an Agentic AI Interactive UI Navigation and Workflow Guidance Agent for a restaurant inventory and procurement management system.

Your job:
1. Analyze the user's request and identify what operational task they want guidance on (e.g. RECEIVE_STOCK, CONSUME_STOCK, VIEW_LOW_STOCK).
2. Call plan_guided_workflow with the task description and inferred workflow type.
3. Review the returned plan and summarize the step-by-step guidance clearly for the user adhering strictly to the output rules and required format below.
4. In the Summary and Required Action, mention that the user can click 'Start Guided Workflow' to begin the interactive step-by-step UI guide with highlighted targets and animated cursor.
5. Under Approval, state: "No approval required to start interactive guidance. Manager approval required for final high-impact submissions."

{OUTPUT_RULES_AND_FORMAT}
""",
    "STOCK_QUERY": f"""
You are an Inventory Management AI Agent inside a restaurant inventory and procurement management system specializing in Stock & Inventory Inquiries.

Your job:
1. If the user asks to check stock levels, see all stocks, view inventory values, or check stock balances, call list_all_stocks (optionally passing low_stock_only, out_of_stock_only, storage_location, or search).
2. If the user asks about the stock of a specific ingredient, call get_stock_details with the ingredient name or ID.
3. If they ask about expiring stock batches, call get_expiring_batches.
4. Summarize your findings strictly following the output rules and required format below.
This is an information inquiry — state "No approval required." under Approval.

{OUTPUT_RULES_AND_FORMAT}
""",
    "INGREDIENT_QUERY": f"""
You are an Inventory Management AI Agent inside a restaurant inventory and procurement management system specializing in Ingredient & Stock Inquiries.

Your job:
1. If the user asks to list all ingredients or check inventory items, call list_all_ingredients (optionally pass category, search, or low_stock_only filter) or list_all_stocks.
2. If the user asks about a specific ingredient, call get_ingredient_details or get_stock_details.
3. If they ask about expiring stock, call get_expiring_batches.
4. Summarize your findings strictly following the output rules and required format below.
This is a read-only inquiry — state "No approval required." under Approval.

{OUTPUT_RULES_AND_FORMAT}
""",
    "LOW_STOCK_REPLENISHMENT": f"""
You are an Inventory Management AI Agent inside a restaurant inventory and procurement management system specializing in Low-Stock Replenishment.

Your job:
1. Use get_all_stock_levels to identify ingredients below minimum stock.
2. For each low-stock item, call get_demand_forecast to project demand for 14 days.
3. Calculate required_order = predicted_demand + safety_stock(5% of max) - current_stock.
4. Call get_supplier_options for each item needing replenishment.
5. Call get_expiring_batches to factor in soon-to-expire stock.
6. Call build_po_proposal with all items and your full reasoning.

After executing the tools, summarize your final response strictly following the output rules and required format below.
Manager approval required before the purchase order is finalized.

{OUTPUT_RULES_AND_FORMAT}
""",
    "ANOMALY_INVESTIGATION": f"""
You are an Inventory Management AI Agent inside a restaurant inventory and procurement management system specializing in Stock Anomaly Investigation.

Your job:
1. Call get_all_stock_levels to understand the current state.
2. For each ingredient with suspiciously low stock (or as the user specifies):
   a. Call calculate_expected_consumption to get expected vs actual.
   b. Call get_stock_movements to see all movements.
   c. Call get_waste_records to find recorded waste.
   d. Call get_stock_adjustments to find recorded adjustments.
3. Cross-reference: actual = expected + waste + adjustments + unexplained.
4. Call generate_anomaly_report with your findings.

After executing the tools, summarize your final response strictly following the output rules and required format below.
This is a read-only investigation — state "No approval required." under Approval.

{OUTPUT_RULES_AND_FORMAT}
""",
    "INVENTORY_OPTIMIZATION": f"""
You are an Inventory Management AI Agent inside a restaurant inventory and procurement management system specializing in Inventory Optimization.

Your job:
1. Call get_all_stock_levels to see current min/max settings.
2. For each ingredient, call analyze_consumption_patterns (90-day history).
3. Calculate recommended new values:
   - new_minimum = (daily_average × lead_time_days) × 1.25 (25% safety margin)
   - new_maximum = new_minimum + (daily_average × 14)
4. Only recommend changes where new_minimum differs from current by > 10%.
5. Call propose_reorder_level_change with your full list and reasoning.

After executing the tools, summarize your final response strictly following the output rules and required format below.
Manager approval required before any changes are applied.

{OUTPUT_RULES_AND_FORMAT}
""",
    "EMERGENCY_SHORTAGE": f"""
You are an Inventory Management AI Agent inside a restaurant inventory and procurement management system specializing in Emergency Stock Shortage Response. Act URGENTLY.

Your job:
1. Call get_ingredient_stock for the ingredient in crisis.
2. Call get_demand_forecast with days=1 (next 24 hours).
3. Call rank_emergency_options to find the fastest supplier.
4. Call get_expiring_batches — can any other stock substitute?
5. Call build_po_proposal with URGENCY flag and the fastest supplier.

After executing the tools, summarize your final response strictly following the output rules and required format below.
Manager approval required to place the emergency order.

{OUTPUT_RULES_AND_FORMAT}
""",
}

COMPONENT3_STAGES = (
    ("sales", "SalesAgent", "get_sales_summary",
     "Analyze only recorded sales and backend-calculated revenue."),
    ("consumption", "ConsumptionAgent", "get_consumption_movements",
     "Explain recipe-derived consumption and stock movements."),
    ("waste", "WasteAgent", "get_component3_waste_summary",
     "Analyze only recorded waste and its reasons."),
)


def _component3_value(data: dict, *keys: str) -> Any:
    for key in keys:
        if key in data and data[key] is not None:
            return data[key]
    return None


def _component3_number(value: Any) -> str:
    if isinstance(value, bool) or value is None:
        return "Unavailable"
    if isinstance(value, float):
        return f"{value:,.4f}".rstrip("0").rstrip(".")
    if isinstance(value, int):
        return f"{value:,}"
    return str(value)


def _component3_focus(message: str) -> str:
    request = message.lower()
    has_sales = "sales" in request or "revenue" in request
    has_consumption = (
        "consumption" in request
        or "consumed" in request
        or "stock movement" in request
    )
    has_waste = "waste" in request
    has_recipe = "recipe" in request or "menu item" in request
    if has_sales and (has_consumption or has_waste or has_recipe):
        return "combined"
    if has_waste:
        return "waste"
    if has_consumption:
        return "consumption"
    if has_sales:
        return "sales"
    return "combined"


def _component3_query_type(message: str) -> str:
    request = message.lower()
    if any(term in request for term in (
        "require approval", "requires approval", "high impact", "approval",
        "evidence supporting each recommendation", "show the evidence supporting",
        "recommendations do you have", "give recommendations", "recommendations based",
    )):
        return "recommendation_analysis"
    if "waste" in request and any(term in request for term in (
        "increase", "increasing", "compared with", "compared to", "previous period",
    )):
        return "waste_comparison"
    if "waste" in request and any(term in request for term in (
        "menu item", "menu items", "causing", "contributing",
    )):
        return "waste_menu_item_association"
    if "waste" in request and any(term in request for term in (
        "recurring", "recurrence", "repeated", "pattern",
    )):
        return "waste_patterns"
    if "waste" in request and ("grouped by reason" in request or "by reason" in request):
        return "waste_reason_analysis"
    if "waste" in request and ("grouped by ingredient" in request or "by ingredient" in request):
        return "waste_ingredient_analysis"
    if "waste" in request and any(term in request for term in (
        "highest", "most waste", "highest waste",
    )):
        return "waste_ingredient_analysis"
    if (
        "high-selling" in request or "highest-selling" in request
        or "top-selling menu item" in request or "top-selling menu items" in request
        or "highest-selling menu items" in request
    ) and ("recipe" in request or "consumption" in request or "ingredient" in request):
        return "top_selling_recipes" if "recipe" in request else "sales_consumption_recipe"
    if (
        ("high-selling" in request or "high selling" in request
         or "highest-selling" in request or "highest selling" in request)
        and "consumption" in request
        or "highly consumed" in request and "wasted" in request
        or "consumed and frequently wasted" in request
        or "strong sales" in request and "high waste" in request
        or "operational problems" in request
        or "sales, ingredient consumption, recipes, and waste together" in request
        or "recommendations based only on recorded data" in request
        or "complete sales, consumption, and waste" in request
    ):
        if any(term in request for term in (
            "high-selling", "high selling", "highest-selling", "highest selling",
        )) and "consumption" in request:
            return "sales_consumption_recipe"
        if "highly consumed" in request or "frequently wasted" in request:
            return "consumption_waste_overlap"
        if "strong sales" in request and "high waste" in request:
            return "sales_waste_association"
        if "operational problems" in request:
            return "operational_problems"
        if "recommendations" in request and "complete" not in request:
            return "recommendation_analysis"
        return "combined_analysis"
    if (
        ("based on sales" in request or "based on recent sales" in request)
        and ("recipe" in request or "consumption" in request)
    ):
        return "recipe_expected_consumption"
    if (
        "complete" in request
        or "full report" in request
        or ("sales" in request and ("consumption" in request or "waste" in request))
    ):
        return "combined_analysis"
    if "compare" in request:
        return "comparison"
    if "faster than expected" in request:
        return "faster_than_expected"
    if "zero sales" in request or "no sales" in request:
        return "zero_sales_menu_items"
    if "recipes used by" in request and ("best-selling" in request or "top-selling" in request or "best selling" in request or "top selling" in request):
        return "top_selling_recipes"
    if (
        "top-selling menu item" in request
        or "top selling menu item" in request
        or "best-selling menu item" in request
        or "top-selling item" in request
        or "top selling item" in request
    ):
        return "top_selling_recipe"
    if "empty recipe" in request or "no recipe ingredients" in request:
        return "empty_recipes"
    if "missing recipe" in request or "without recipe" in request or "no recipe" in request:
        return "missing_recipes"
    if (
        "highest ingredient usage" in request
        or "highest ingredient use" in request
        or "recipes have the highest" in request
        or "used in the most recipes" in request
        or "used by the most recipes" in request
    ):
        return (
            "ingredient_recipe_usage"
            if "used in the most recipes" in request or "used by the most recipes" in request
            else "recipe_usage"
        )
    if "promote" in request:
        return "sales_promotion"
    if "unusual sales" in request or "sales pattern" in request or "sales trend" in request or "sales patterns" in request:
        return "sales_patterns"
    if "menu items use" in request or "menu item use" in request or "recipes use" in request or "affected if" in request or "affected when" in request:
        return "ingredient_dependency"
    if "low in stock" in request and ("sales activity" in request or "because of sales" in request):
        return "ingredient_dependency"
    if (
        ("selling" in request or "sell" in request or "sold" in request)
        and "stock" in request
        and ("affect" in request or "impact" in request)
    ):
        return "ingredient_dependency"
    if "at risk of running out" in request or "risk of stockout" in request:
        return "ingredient_dependency"
    if "menu item" in request or "sold the most" in request or "sold the least" in request or "top-selling" in request or "top selling" in request:
        return "menu_item_sales"
    if "ingredient" in request and ("required" in request or "recipe" in request):
        return "recipe_analysis"
    if "recipe" in request:
        return "recipe_analysis"
    if (
        "consumption stock movements" in request
        or "consumption movements" in request
        or "show the stock movements" in request
    ):
        return "consumption_movements"
    if "unusual consumption" in request or "consumption pattern" in request or "consumption trend" in request:
        return "consumption_patterns"
    if (
        "highest consumption" in request
        or "consumed most" in request
        or "consumed the most" in request
        or ("highest" in request and "consumption" in request)
    ):
        return "consumption_highest"
    if "waste record" in request or "waste history" in request:
        return "waste_records"
    if "total waste" in request:
        return "waste_total"
    if "waste" in request and ("reason" in request or "common" in request):
        return "waste_reason_analysis"
    if "waste" in request and "ingredient" in request:
        return "waste_ingredient_analysis"
    if "waste" in request:
        return "waste_summary"
    if "consumption" in request or "consumed" in request or "stock movement" in request:
        return "consumption_analysis"
    if "average order" in request or "total revenue" in request or "total sales" in request:
        return "sales_analysis"
    if "sell" in request or "selling" in request or "sold" in request:
        return "sales_analysis"
    if "sales" in request or "revenue" in request:
        return "sales_analysis"
    return "combined_analysis"


def _component3_menu_item_name(message: str) -> str | None:
    import re
    match = re.search(r"\b(?:for|of)\s+([A-Za-z][A-Za-z0-9 '&-]*?)(?:\s+in\s+the|\s+for\s+the|\s+based\s+on|\?|$)", message, re.IGNORECASE)
    return match.group(1).strip() if match else None


def _component3_records(value: Any, key: str | None = None) -> list[dict[str, Any]]:
    if key and isinstance(value, dict):
        value = value.get(key)
    if isinstance(value, dict) and "records" in value:
        value = value["records"]
    return value if isinstance(value, list) else []


def _component3_sales_ranking(sales_stage: dict[str, Any]) -> list[tuple[str, int]]:
    records = _component3_records(sales_stage.get("records"))
    ranking: dict[str, int] = {}
    for sale in records:
        for item in sale.get("items", []) if isinstance(sale, dict) else []:
            name = item.get("menuItemName") or "Not recorded"
            quantity = item.get("quantity")
            if isinstance(quantity, int) and not isinstance(quantity, bool):
                ranking[name] = ranking.get(name, 0) + quantity
    return sorted(ranking.items(), key=lambda item: (-item[1], item[0].casefold()))


def _component3_inventory_items(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, dict):
        data = data.get("items", data.get("stocks", []))
    return data if isinstance(data, list) else []


def _component3_validate_waste_records(summary: Any, records: Any) -> Any:
    if (
        not isinstance(summary, dict)
        or "error" in summary
        or not isinstance(records, dict)
        or "error" in records
    ):
        return records
    expected_count = summary.get("totalWasteRecords")
    returned_records = records.get("records")
    if (
        isinstance(expected_count, int)
        and not isinstance(expected_count, bool)
        and isinstance(returned_records, list)
        and len(returned_records) != expected_count
    ):
        return {
            "error": (
                "Waste history count does not match the summary for the requested date range; "
                "record-level analysis is unavailable."
            ),
            "expectedCount": expected_count,
            "returnedCount": len(returned_records),
        }
    return records


def _component3_intent_from_request(message: str) -> str | None:
    request = message.lower()
    component3_terms = (
        "waste", "consumption", "consumed", "stock movement", "sales",
        "revenue", "menu item", "top-selling", "top selling", "recipe",
        "ingredient", "compare sales", "sales pattern", "promote", "average order",
        "unusual sales", "sold the most", "sold the least",
        "sell", "sold", "selling",
        "recommendation", "high impact", "approval", "operational problem",
    )
    if any(term in request for term in component3_terms) or (
        "compare" in request and ("days" in request or "week" in request)
    ):
        return "SALES_CONSUMPTION_WASTE"
    return None


def _component3_write_request(message: str) -> bool:
    request = message.strip().casefold()
    write_patterns = (
        r"^(?:please\s+)?(?:create|record|submit|enter)\s+(?:a\s+|an\s+|new\s+)?(?:sale\b|waste\s+record\b|waste(?=$|\s+(?:for|of)\b))",
        r"^(?:please\s+)?(?:confirm|approve)\s+(?:the\s+)?(?:sale\b|waste\b|purchase\s+order\b)",
        r"^(?:please\s+)?(?:reduce|change|update|delete|adjust)\s+(?:the\s+)?(?:stock\b|inventory\b|recipe\b|sale\b|waste\s+record\b)",
        r"^(?:please\s+)?place\s+(?:a\s+)?purchase\s+order\b",
    )
    return any(re.search(pattern, request) for pattern in write_patterns)


def _component3_days(message: str) -> int:
    match = re.search(r"\b(?:last|past|previous|this)?\s*(-?\d+)\s*days?\b", message, re.IGNORECASE)
    if match:
        days = int(match.group(1))
        return days if 1 <= days <= 366 else 0
    if re.search(r"\b(?:this|last|previous)\s+week\b", message, re.IGNORECASE):
        return 7
    return 30


def _format_component3_response(
    message: str,
    outputs: dict[str, dict[str, Any]],
    report: dict[str, Any],
    days: int,
) -> str:
    """Render one user-facing answer from validated Component 3 data.

    Stage summaries are deliberately excluded: they are internal agent output,
    while the tool payloads and deterministic report are the factual source.
    """
    request = message.lower()
    complete = any(term in request for term in (
        "complete", "full report", "sales, consumption", "sales and waste",
    ))
    wants_sales = (
        complete
        or "sales" in request
        or "revenue" in request
        or "average order" in request
        or "total sales" in request
    )
    wants_consumption = (
        complete
        or "consumption" in request
        or "consumed" in request
        or "movement" in request
    )
    wants_waste = complete or "waste" in request
    wants_recipes = complete or "recipe" in request or "menu item" in request
    if not any((wants_sales, wants_consumption, wants_waste, wants_recipes)):
        wants_sales = wants_consumption = wants_waste = wants_recipes = True

    lines = [
        (
            "Sales, Consumption, Recipe & Waste Report"
            if complete
            else "Component 3 Analysis"
        ) + f" — Last {days} Days",
        "",
    ]

    sales_stage = outputs.get("sales", {}).get("data", {})
    sales = (
        sales_stage.get("summary", {})
        if isinstance(sales_stage, dict) and "summary" in sales_stage
        else sales_stage
    )
    query_type = _component3_query_type(message)
    sales_records_payload = (
        sales_stage.get("records", {})
        if isinstance(sales_stage, dict)
        else {}
    )
    sales_records_error = (
        sales_records_payload.get("error")
        if isinstance(sales_records_payload, dict)
        else None
    )
    if sales_records_error and query_type in {
        "menu_item_sales", "zero_sales_menu_items", "top_selling_recipe",
        "top_selling_recipes", "recipe_expected_consumption",
        "faster_than_expected", "sales_promotion", "sales_patterns",
        "ingredient_dependency",
    }:
        return f"Sales record retrieval failed: {sales_records_error}"
    if query_type == "menu_item_sales":
        ranked_items = _component3_sales_ranking(sales_stage)
        descending = "least" not in request
        lines = [f"Menu Item Sales — Last {days} Days", ""]
        if ranked_items:
            lines.append("Recorded quantities:")
            for name, quantity in sorted(ranked_items, key=lambda item: item[1], reverse=descending):
                lines.append(f"• {name}: {_component3_number(quantity)} sold")
        else:
            lines.append("• No recorded menu-item sales were found for this period.")
        return "\n".join(lines)

    consumption_stage = outputs.get("consumption", {}).get("data", {})
    movement_result = (
        consumption_stage.get("movements", {})
        if isinstance(consumption_stage, dict)
        else {}
    )
    if isinstance(movement_result, dict) and "error" in movement_result:
        consumption = {
            **consumption_stage,
            "error": movement_result["error"],
            "movements": [],
            "count": None,
        }
    elif isinstance(movement_result, dict):
        movement_list = movement_result.get("movements", [])
        consumption = {
            **consumption_stage,
            "movements": movement_list if isinstance(movement_list, list) else [],
            "count": movement_result.get("count", 0),
            "movement_days": movement_result.get("days"),
        }
    else:
        consumption = {
            **(consumption_stage if isinstance(consumption_stage, dict) else {}),
            "movements": movement_result if isinstance(movement_result, list) else [],
            "count": len(movement_result) if isinstance(movement_result, list) else 0,
        }
    sales_records = _component3_records(sales_stage.get("records"))
    ranked_items = _component3_sales_ranking(sales_stage)
    recipe_data = consumption.get("recipes", {}) if isinstance(consumption, dict) else {}
    recipes = recipe_data.get("recipes", []) if isinstance(recipe_data, dict) else []
    active_recipe_by_menu: dict[str, dict[str, Any]] = {}
    for recipe in recipes:
        if not isinstance(recipe, dict) or recipe.get("isActive") is not True:
            continue
        menu_id = str(recipe.get("menuItemId") or "")
        current = active_recipe_by_menu.get(menu_id)
        if current is None or int(recipe.get("version") or 0) > int(current.get("version") or 0):
            active_recipe_by_menu[menu_id] = recipe
    active_recipes = list(active_recipe_by_menu.values())

    def expected_consumption() -> dict[tuple[str, str, str], float]:
        item_quantities: dict[str, int] = {}
        for sale in sales_records:
            for item in sale.get("items", []) if isinstance(sale, dict) else []:
                menu_id = item.get("menuItemId")
                quantity = item.get("quantity")
                if menu_id and isinstance(quantity, int):
                    item_quantities[str(menu_id)] = item_quantities.get(str(menu_id), 0) + quantity
        totals: dict[tuple[str, str, str], float] = {}
        for recipe in active_recipes:
            sold_quantity = item_quantities.get(str(recipe.get("menuItemId")), 0)
            if not sold_quantity:
                continue
            for ingredient in recipe.get("ingredients", []):
                ingredient_id = str(ingredient.get("ingredientId") or "")
                name = ingredient.get("ingredientName") or ingredient_id or "Not recorded"
                unit = str(ingredient.get("unit") or "")
                required = ingredient.get("quantityRequired")
                if isinstance(required, (int, float)):
                    key = (ingredient_id, name, unit)
                    totals[key] = totals.get(key, 0) + sold_quantity * required
        return totals

    waste_stage = outputs.get("waste", {}).get("data", {})
    waste_summary = (
        waste_stage.get("summary", {})
        if isinstance(waste_stage, dict)
        else {}
    )
    waste_records_result = (
        waste_stage.get("records", {})
        if isinstance(waste_stage, dict)
        else {}
    )
    waste_records = (
        waste_records_result.get("records", [])
        if isinstance(waste_records_result, dict)
        else []
    )
    inventory_rows = _component3_inventory_items(consumption.get("inventory", {}))

    def consumption_totals() -> dict[tuple[str, str], float]:
        totals: dict[tuple[str, str], float] = {}
        for movement in consumption.get("movements", []):
            if not isinstance(movement, dict):
                continue
            name = movement.get("ingredientName") or movement.get("ingredientId") or "Unknown ingredient"
            unit = str(movement.get("unit") or "")
            quantity = movement.get("quantity")
            if isinstance(quantity, (int, float)) and not isinstance(quantity, bool):
                key = (str(name), unit)
                totals[key] = totals.get(key, 0) + quantity
        return totals

    def waste_ingredient_totals() -> tuple[dict[str, float], dict[str, int]]:
        totals: dict[str, float] = {}
        counts: dict[str, int] = {}
        for record in waste_records:
            if not isinstance(record, dict):
                continue
            name = str(record.get("ingredientName") or record.get("ingredientId") or "Unknown ingredient")
            quantity = record.get("quantity")
            if isinstance(quantity, (int, float)) and not isinstance(quantity, bool):
                totals[name.casefold()] = totals.get(name.casefold(), 0) + quantity
                counts[name.casefold()] = counts.get(name.casefold(), 0) + 1
        return totals, counts

    def active_recipe_ingredients(recipe: dict[str, Any]) -> list[dict[str, Any]]:
        ingredients = recipe.get("ingredients", [])
        return [ingredient for ingredient in ingredients if isinstance(ingredient, dict)] if isinstance(ingredients, list) else []

    if query_type == "comparison":
        comparison = sales_stage.get("comparison", {})
        if isinstance(comparison, dict) and "error" in comparison:
            return f"Sales Period Comparison\n\n• Comparison data unavailable: {comparison['error']}"
        current = comparison.get("current", {})
        previous = comparison.get("previous", {})
        difference = comparison.get("difference", {})
        metric_labels = (
            ("totalSales", "Orders"),
            ("totalRevenue", "Revenue"),
            ("averageOrderValue", "Average order value"),
            ("totalItemsSold", "Items sold"),
        )
        lines = [f"Sales Comparison — Current {days} Days vs Previous {days} Days", ""]
        for metric, label in metric_labels:
            delta = difference.get(metric, {})
            percent = delta.get("percentage")
            percent_text = "percentage unavailable (previous period was zero)" if percent is None else f"{_component3_number(percent)}%"
            lines.extend([
                f"{label}:",
                f"• Current: {_component3_number(current.get(metric))}",
                f"• Previous: {_component3_number(previous.get(metric))}",
                f"• Change: {_component3_number(delta.get('absolute'))} ({percent_text})",
            ])
        return "\n".join(lines)

    if query_type == "waste_comparison":
        comparison = waste_stage.get("comparison", {}) if isinstance(waste_stage, dict) else {}
        if isinstance(comparison, dict) and "error" in comparison:
            return f"Waste Period Comparison\n\n• Comparison data unavailable: {comparison['error']}"
        current = comparison.get("current", {})
        previous = comparison.get("previous", {})
        difference = comparison.get("difference", {})
        if not isinstance(current, dict) or not isinstance(previous, dict):
            return "Waste Period Comparison\n\n• Both period summaries were not available."
        lines = [f"Waste Comparison — Current {days} Days vs Previous {days} Days", ""]
        for key, label in (
            ("totalWasteRecords", "Waste record count"),
            ("totalWasteQuantity", "Waste quantity"),
        ):
            delta = difference.get(key, {}) if isinstance(difference, dict) else {}
            percentage = delta.get("percentage") if isinstance(delta, dict) else None
            percent_text = (
                "percentage unavailable (previous period was zero)"
                if percentage is None
                else f"{_component3_number(percentage)}%"
            )
            lines.extend([
                f"{label}:",
                f"• Current: {_component3_number(current.get(key))}",
                f"• Previous: {_component3_number(previous.get(key))}",
                f"• Difference: {_component3_number(delta.get('absolute') if isinstance(delta, dict) else None)} ({percent_text})",
            ])
        quantity_delta = difference.get("totalWasteQuantity", {}) if isinstance(difference, dict) else {}
        delta_value = quantity_delta.get("absolute") if isinstance(quantity_delta, dict) else None
        if isinstance(delta_value, (int, float)):
            lines.append(
                "• Recorded waste quantity increased."
                if delta_value > 0
                else "• Recorded waste quantity decreased."
                if delta_value < 0
                else "• Recorded waste quantity was unchanged."
            )
        return "\n".join(lines)

    if query_type == "sales_consumption_recipe":
        if isinstance(recipe_data, dict) and "error" in recipe_data:
            return f"Sales-to-Recipe Consumption Analysis\n\n• Recipe data unavailable: {recipe_data['error']}"
        expected = expected_consumption()
        if not ranked_items:
            return "Sales-to-Recipe Consumption Analysis\n\n• No recorded menu-item sales were found for this period."
        sales_by_name = {name.casefold(): quantity for name, quantity in ranked_items}
        lines = ["Sales, Recipes & Ingredient Requirements", ""]
        for recipe in active_recipes:
            item_name = str(recipe.get("menuItemName") or "")
            sold = sales_by_name.get(item_name.casefold(), 0)
            if sold <= 0:
                continue
            lines.append(f"• {item_name}: {sold} sold.")
            for ingredient in active_recipe_ingredients(recipe):
                ingredient_id = str(ingredient.get("ingredientId") or "")
                name = str(ingredient.get("ingredientName") or ingredient_id or "Not recorded")
                unit = str(ingredient.get("unit") or "")
                required = ingredient.get("quantityRequired")
                if isinstance(required, (int, float)):
                    total = sold * required
                    lines.append(
                        f"  • {name}: {_component3_number(total)} {unit} recipe-derived requirement "
                        f"({sold} sold × {_component3_number(required)} {unit} per item)."
                    )
                    recorded = consumption_totals().get((name, unit))
                    if recorded is not None:
                        lines.append(f"  • Recorded stock consumption: {_component3_number(recorded)} {unit}.")
        lines.append("• Recipe-derived requirements are estimates from sales and active recipes, not recorded movement quantities or proof of causation.")
        return "\n".join(lines)

    if query_type == "consumption_waste_overlap":
        if isinstance(consumption, dict) and "error" in consumption:
            return f"Consumption/Waste Overlap\n\n• Consumption data unavailable: {consumption['error']}"
        if isinstance(waste_records_result, dict) and "error" in waste_records_result:
            return f"Consumption/Waste Overlap\n\n• Waste data unavailable: {waste_records_result['error']}"
        used = consumption_totals()
        waste_totals, waste_counts = waste_ingredient_totals()
        top_by_unit: dict[str, set[str]] = {}
        # Include all ties for the largest observed quantity in each unit.
        for unit in {unit for _, unit in used}:
            highest = max((quantity for (_, row_unit), quantity in used.items() if row_unit == unit), default=None)
            top_by_unit[unit] = {
                name.casefold() for (name, row_unit), quantity in used.items()
                if row_unit == unit and quantity == highest
            }
        candidates = [
            (name, unit, quantity)
            for (name, unit), quantity in used.items()
            if name.casefold() in top_by_unit.get(unit, set())
            and waste_counts.get(name.casefold(), 0) >= 2
        ]
        lines = ["High Consumption and Repeated Waste", "• “Highly consumed” means the highest observed aggregate within each unit; “frequently wasted” means at least two recorded waste records.", ""]
        if candidates:
            for name, unit, quantity in sorted(candidates, key=lambda row: -row[2]):
                normalized_name = name.casefold()
                lines.append(
                    f"• {name}: {_component3_number(quantity)} {unit} consumed; "
                    f"{waste_totals.get(normalized_name, 0):g} waste quantity across "
                    f"{waste_counts[normalized_name]} waste records."
                )
        else:
            lines.append("• No ingredient matched both transparent criteria in the returned records.")
        return "\n".join(lines)

    if query_type in ("waste_menu_item_association", "sales_waste_association"):
        if isinstance(waste_records_result, dict) and "error" in waste_records_result:
            return f"Waste and Menu Item Association\n\n• Waste data unavailable: {waste_records_result['error']}"
        ingredient_waste, _ = waste_ingredient_totals()
        if not ingredient_waste:
            return "Waste and Menu Item Association\n\n• No recorded ingredient-level waste was available to associate with recipes."
        top_waste = sorted(ingredient_waste.items(), key=lambda item: -item[1])
        lines = ["Waste Ingredient and Menu Item Associations", ""]
        matched = 0
        for recipe in active_recipes:
            ingredient_names = {
                str(ingredient.get("ingredientName") or "").casefold()
                for ingredient in active_recipe_ingredients(recipe)
            }
            matches = [
                (name, quantity) for name, quantity in top_waste
                if name in ingredient_names
            ]
            if not matches:
                continue
            menu_name = str(recipe.get("menuItemName") or "Not recorded")
            sold = next(
                (quantity for name, quantity in ranked_items if name.casefold() == menu_name.casefold()),
                0,
            )
            matched += 1
            if query_type == "sales_waste_association" and sold == 0:
                continue
            lines.append(f"• {menu_name}: {sold} sold in period.")
            for ingredient_name, quantity in matches:
                lines.append(
                    f"  • Recipe uses {ingredient_name}, associated with {_component3_number(quantity)} "
                    "recorded waste quantity."
                )
        if matched == 0 or (query_type == "sales_waste_association" and not any(" sold in period." in line for line in lines)):
            lines.append("• No menu item could be associated with the recorded waste through an active recipe.")
        lines.append("• This is an ingredient-to-recipe association only; the database does not establish that a menu item caused the waste.")
        return "\n".join(lines)

    if query_type == "waste_patterns":
        if isinstance(waste_records_result, dict) and "error" in waste_records_result:
            return f"Waste Pattern Review\n\n• Waste data unavailable: {waste_records_result['error']}"
        counts: dict[str, int] = {}
        totals: dict[str, float] = {}
        for record in waste_records:
            name = str(record.get("ingredientName") or "Unknown ingredient")
            quantity = record.get("quantity")
            if isinstance(quantity, (int, float)) and not isinstance(quantity, bool):
                counts[name] = counts.get(name, 0) + 1
                totals[name] = totals.get(name, 0) + quantity
        repeated = [(name, count) for name, count in counts.items() if count > 1]
        lines = [f"Recorded Waste Pattern Review — Last {days} Days", ""]
        if repeated:
            lines.extend(
                f"• {name}: {count} recorded waste records totaling {_component3_number(totals[name])}."
                for name, count in sorted(repeated, key=lambda item: -item[1])
            )
            lines.append("• These are repeated ingredient records in this period; no causal or future trend is established.")
        elif counts:
            lines.append("• No ingredient has multiple waste records in this period; a recurring ingredient pattern was not identified.")
        else:
            lines.append("• No recorded waste data was found for the requested period.")
        return "\n".join(lines)

    if query_type == "recommendation_analysis":
        if any(isinstance(value, dict) and "error" in value for value in (sales, waste_summary, consumption, recipe_data)):
            return "Evidence-Based Recommendations\n\n• Recommendations are unavailable because one or more required backend data sources failed."
        lines = [f"Evidence-Based Read-Only Recommendations — Last {days} Days", ""]
        recommendations = []
        for item in inventory_rows:
            current = item.get("currentStock")
            minimum = item.get("minimumStockLevel")
            if isinstance(current, (int, float)) and isinstance(minimum, (int, float)) and current < minimum:
                name = str(item.get("ingredientName") or "Not recorded")
                unit = str(item.get("unit") or "")
                recommendations.append(
                    f"Review replenishment planning for {name}: recorded stock "
                    f"{_component3_number(current)} {unit} is below its configured minimum "
                    f"{_component3_number(minimum)} {unit}."
                )
        repeated = [
            (name, count) for name, count in waste_ingredient_totals()[1].items()
            if count > 1
        ]
        if repeated:
            recommendations.append(
                "Review handling/storage for ingredients with repeated recorded waste: "
                + ", ".join(f"{name} ({count} records)" for name, count in repeated)
                + "."
            )
        if not recommendations:
            lines.append("• No specific recommendation is supported by the returned records.")
        else:
            lines.extend(f"• {recommendation}" for recommendation in recommendations)
            lines.append("• Evidence is limited to current stock thresholds and recorded waste; these are advisory reviews, not causal findings.")
        lines.append("• This is a read-only analysis. No business change is proposed or executed; no action approval is pending from this report.")
        return "\n".join(lines)

    if query_type == "operational_problems":
        if isinstance(consumption, dict) and "error" in consumption:
            return f"Recorded Operational Signals\n\n• Consumption data unavailable: {consumption['error']}"
        if isinstance(waste_records_result, dict) and "error" in waste_records_result:
            return f"Recorded Operational Signals\n\n• Waste data unavailable: {waste_records_result['error']}"
        signals = []
        for item in inventory_rows:
            current = item.get("currentStock")
            minimum = item.get("minimumStockLevel")
            if isinstance(current, (int, float)) and isinstance(minimum, (int, float)) and current < minimum:
                name = str(item.get("ingredientName") or "Not recorded")
                signals.append(
                    f"Stock for {name} is below configured minimum "
                    f"({_component3_number(current)} vs {_component3_number(minimum)} {item.get('unit') or ''})."
                )
        repeated = [
            (name, count) for name, count in waste_ingredient_totals()[1].items()
            if count > 1
        ]
        signals.extend(
            f"{name} has {count} recorded waste events in the period."
            for name, count in repeated
        )
        lines = [f"Recorded Operational Signals — Last {days} Days", ""]
        if signals:
            lines.extend(f"• {signal}" for signal in signals)
        else:
            lines.append("• No below-minimum inventory or repeated ingredient-waste signals were identified in the returned records.")
        lines.append("• These are descriptive indicators, not proof of root cause.")
        return "\n".join(lines)

    if query_type == "zero_sales_menu_items":
        menu_data = sales_stage.get("menu_items", {})
        if isinstance(menu_data, dict) and "error" in menu_data:
            return f"Zero-Sales Menu Items\n\n• Menu item data unavailable: {menu_data['error']}"
        items = menu_data.get("items", []) if isinstance(menu_data, dict) else []
        sold_names = {name.casefold() for name, _ in ranked_items}
        zero_items = [
            item.get("name", "Not recorded")
            for item in items if isinstance(item, dict)
            and item.get("isActive", True)
            and item.get("name", "").casefold() not in sold_names
        ]
        lines = [f"Menu Items with Zero Sales — Last {days} Days", ""]
        lines.extend([f"• {name}" for name in zero_items] or ["• No active menu items with zero sales were found."])
        return "\n".join(lines)

    if query_type in ("top_selling_recipe", "top_selling_recipes"):
        lines = [f"Recipes for the Best-Selling Menu Items — Last {days} Days", ""]
        if not ranked_items:
            lines.append("• No recorded menu-item sales were found for this period.")
            return "\n".join(lines)
        candidates = ranked_items[:5] if query_type == "top_selling_recipes" else ranked_items[:1]
        for top_name, sold_quantity in candidates:
            top_menu_id = next(
                (item.get("menuItemId") for sale in sales_records
                 for item in sale.get("items", []) if item.get("menuItemName", "").casefold() == top_name.casefold()),
                None,
            )
            matched_recipe = next(
                (recipe for recipe in active_recipes
                 if str(recipe.get("menuItemId")) == str(top_menu_id)),
                None,
            )
            lines.append(f"• {top_name} ({sold_quantity} sold)")
            if matched_recipe:
                lines.extend(f"  • {ingredient.get('ingredientName', 'Not recorded')}: "
                             f"{_component3_number(ingredient.get('quantityRequired'))} {ingredient.get('unit', '')} per portion"
                             for ingredient in matched_recipe.get("ingredients", []))
            else:
                lines.append("  • No active recipe is recorded for this menu item.")
        return "\n".join(lines)

    if query_type in ("recipe_expected_consumption", "faster_than_expected", "sales_promotion", "sales_patterns"):
        if isinstance(recipe_data, dict) and "error" in recipe_data and query_type in (
            "recipe_expected_consumption", "faster_than_expected",
        ):
            return f"Recipe-derived consumption unavailable: {recipe_data['error']}"
        if query_type in ("recipe_expected_consumption", "faster_than_expected"):
            expected = expected_consumption()
            actual: dict[tuple[str, str, str], float] = {}
            movements = consumption.get("movements", []) if isinstance(consumption, dict) else []
            for movement in movements if isinstance(movements, list) else []:
                reference_type = str(
                    movement.get("referenceType") or movement.get("reference_type") or ""
                ).upper()
                if reference_type != "SALE":
                    continue
                name = movement.get("ingredientName") or movement.get("ingredientId") or "Unknown ingredient"
                ingredient_id = str(movement.get("ingredientId") or "")
                unit = str(movement.get("unit") or "")
                quantity = movement.get("quantity")
                if isinstance(quantity, (int, float)):
                    key = (ingredient_id, name, unit)
                    actual[key] = actual.get(key, 0) + quantity
            title = (
                f"Recorded Sales Consumption vs Recipe Expectation — Last {days} Days"
                if query_type == "faster_than_expected"
                else f"Expected Recipe Consumption from Recorded Sales — Last {days} Days"
            )
            lines = [title, ""]
            if expected:
                lines.append("Expected from sales multiplied by active recipe quantities:")
                lines.extend(
                    f"• {name}: {_component3_number(quantity)} {unit}"
                    for (_, name, unit), quantity in sorted(expected.items(), key=lambda pair: -pair[1])
                )
                if actual:
                    lines.append("Recorded movement comparison (not an attribution of cause):")
                    above_expected = []
                    matching_count = 0
                    missing_count = 0
                    for (ingredient_id, name, unit), expected_quantity in sorted(expected.items(), key=lambda pair: -pair[1]):
                        actual_quantity = actual.get((ingredient_id, name, unit))
                        if actual_quantity is None:
                            missing_count += 1
                            lines.append(f"• {name}: no matching recorded movement total in {unit} was found.")
                        else:
                            matching_count += 1
                            if (
                                actual_quantity > expected_quantity
                                and not math.isclose(
                                    actual_quantity,
                                    expected_quantity,
                                    rel_tol=1e-4,
                                    abs_tol=1e-4,
                                )
                            ):
                                above_expected.append(name)
                            relation = (
                                "recorded matches recipe expectation"
                                if math.isclose(
                                    actual_quantity,
                                    expected_quantity,
                                    rel_tol=1e-4,
                                    abs_tol=1e-4,
                                )
                                else "recorded exceeds recipe expectation"
                                if actual_quantity > expected_quantity
                                else "recorded is below recipe expectation"
                            )
                            lines.append(
                                f"• {name}: {_component3_number(actual_quantity)} {unit} recorded; "
                                f"{_component3_number(expected_quantity)} {unit} expected from recipes "
                                f"({relation})."
                            )
                    if query_type == "faster_than_expected":
                        if above_expected:
                            lines.append(
                                "• Recorded sales-referenced consumption exceeded recipe expectations for: "
                                + ", ".join(above_expected)
                                + "."
                            )
                        elif missing_count and matching_count:
                            lines.append(
                                "• No excess was found among ingredients with matching recorded movements; "
                                f"comparison is unavailable for {missing_count} ingredient(s) without a matching movement."
                            )
                        elif missing_count:
                            lines.append(
                                "• Insufficient matching recorded movements to determine whether any ingredient "
                                "was consumed faster than expected."
                            )
                        else:
                            lines.append(
                                "• No ingredient had matching recorded sales consumption above its "
                                "recipe-derived expectation in this period."
                            )
                elif query_type == "faster_than_expected":
                    lines.append(
                        "• No sale-referenced consumption movements were available; a comparison cannot be made."
                    )
                lines.append("• Expected recipe requirements and recorded stock movements are distinct measures.")
            else:
                lines.append("• No sales with matching active recipes were found for this period.")
            return "\n".join(lines)
        if query_type == "sales_promotion":
            lines = [f"Sales-Based Promotion Evidence — Last {days} Days", ""]
            if ranked_items:
                top = ranked_items[0]
                total = sum(quantity for _, quantity in ranked_items)
                share = top[1] / total * 100 if total else 0
                lines.extend([
                    f"• Highest recorded sales quantity: {top[0]} ({top[1]} sold, {share:.1f}% of sold-item quantity).",
                    "• Evidence: completed-period sale item quantities; profit margins and promotion response are not present in these records.",
                    f"• Recommendation: consider testing a promotion for {top[0]} only if the goal is to amplify the currently highest-volume item; compare future sales before concluding it was effective.",
                ])
            else:
                lines.append("• No menu-item sales were recorded in this period; there is not enough sales evidence to recommend an item.")
            return "\n".join(lines)
        lines = [f"Sales Pattern Review — Last {days} Days", ""]
        total_orders = _component3_value(sales, "totalSales", "total_sales")
        if len(sales_records) < 3:
            lines.append("• Fewer than three sales records are available; there is insufficient data to identify a reliable unusual pattern.")
        elif ranked_items:
            total_quantity = sum(quantity for _, quantity in ranked_items)
            top_name, top_quantity = ranked_items[0]
            share = top_quantity / total_quantity * 100 if total_quantity else 0
            lines.append(f"• {top_name} has the highest recorded quantity ({top_quantity} of {total_quantity} items, {share:.1f}%).")
            lines.append(f"• Sales records in period: {_component3_number(total_orders)}.")
            lines.append("• This describes the observed distribution; it does not establish statistical abnormality or cause.")
        return "\n".join(lines)

    if query_type == "ingredient_dependency":
        import re
        ingredient_match = re.search(
            r"(?:use|using|if|for|of)\s+([A-Za-z][A-Za-z0-9 '&-]*?)(?:\s+(?:stock|becomes|become|is|gets|runs|$)|\?|$)",
            message, re.IGNORECASE,
        )
        query_name = ingredient_match.group(1).strip().casefold() if ingredient_match else ""
        ingredient_text = consumption.get("inventory", {}) if isinstance(consumption, dict) else {}
        if isinstance(ingredient_text, dict) and "error" in ingredient_text:
            return f"Ingredient stock/dependency data unavailable: {ingredient_text['error']}"
        inventory_rows = _component3_inventory_items(ingredient_text)
        target = next(
            (row for row in inventory_rows if query_name and query_name in str(row.get("ingredientName", "")).casefold()),
            None,
        )
        if target is None and ("low in stock" in request or "sales activity" in request):
            expected = expected_consumption()
            lines = ["Sales-Related Ingredient Stock Exposure", ""]
            flagged = 0
            for item in inventory_rows:
                ingredient_id = str(item.get("ingredientId") or "")
                ingredient_name = str(item.get("ingredientName") or "Not recorded")
                unit = str(item.get("unit") or "")
                required = expected.get((ingredient_id, ingredient_name, unit), 0)
                current = item.get("currentStock", 0)
                minimum = item.get("minimumStockLevel", 0)
                if not isinstance(current, (int, float)) or not isinstance(minimum, (int, float)):
                    continue
                if required and current - required < minimum:
                    flagged += 1
                    lines.append(
                        f"• {ingredient_name}: current {_component3_number(current)} {unit}; "
                        f"minimum {_component3_number(minimum)} {unit}; "
                        f"recipe-derived period requirement {_component3_number(required)} {unit}."
                    )
                    for recipe in active_recipes:
                        if any(str(ri.get("ingredientId")) == ingredient_id for ri in recipe.get("ingredients", [])):
                            sold = next((qty for name, qty in ranked_items if name.casefold() == str(recipe.get("menuItemName", "")).casefold()), 0)
                            lines.append(f"  • {recipe.get('menuItemName')}: {sold} sold in the same period.")
            if not flagged:
                lines.append("• No ingredients were identified by comparing recorded-period recipe requirements with current stock and minimum levels.")
            lines.append("• This is a historical-period comparison, not a future stock forecast.")
            return "\n".join(lines)
        target_id = str((target or {}).get("ingredientId") or "")
        target_name = str((target or {}).get("ingredientName") or (ingredient_match.group(1) if ingredient_match else "requested ingredient"))
        dependent = []
        for recipe in active_recipes:
            if any(str(ingredient.get("ingredientId")) == target_id or
                   target_name.casefold() in str(ingredient.get("ingredientName", "")).casefold()
                   for ingredient in recipe.get("ingredients", [])):
                dependent.append(recipe)
        lines = [f"Menu Item Dependency — {target_name}", ""]
        if target:
            lines.append(f"• Current stock: {_component3_number(target.get('currentStock'))} {target.get('unit', '')}")
            lines.append(f"• Minimum stock: {_component3_number(target.get('minimumStockLevel'))} {target.get('unit', '')}")
        elif query_name:
            lines.append("• Current inventory/threshold record was not found for this ingredient.")
        if dependent:
            for recipe in dependent:
                sold = next((qty for name, qty in ranked_items if name.casefold() == recipe.get("menuItemName", "").casefold()), 0)
                lines.append(f"• {recipe.get('menuItemName')}: uses this ingredient in its active recipe; {sold} sold in period.")
        else:
            lines.append("• No active menu-item recipes were found using this ingredient.")
        return "\n".join(lines)

    if query_type in ("missing_recipes", "empty_recipes"):
        menu_data = sales_stage.get("menu_items", {})
        if query_type == "missing_recipes" and isinstance(menu_data, dict) and "error" in menu_data:
            return f"Menu item data unavailable: {menu_data['error']}"
        if isinstance(recipe_data, dict) and "error" in recipe_data:
            return f"Recipe data unavailable: {recipe_data['error']}"
        menu_items = menu_data.get("items", []) if isinstance(menu_data, dict) else []
        if query_type == "missing_recipes":
            active_ids = {str(recipe.get("menuItemId")) for recipe in active_recipes}
            missing = [item.get("name", "Not recorded") for item in menu_items
                       if item.get("isActive", True) and str(item.get("id")) not in active_ids]
            title = "Active Menu Items Without an Active Recipe"
            results = missing
        else:
            empty = [recipe.get("menuItemName", "Not recorded") for recipe in active_recipes
                     if not recipe.get("ingredients")]
            title = "Active Recipes Without Ingredients"
            results = empty
        return "\n".join([title, ""] + ([f"• {name}" for name in results] or ["• None found in the returned records."]))

    if query_type == "recipe_usage":
        recipe_totals: dict[str, dict[str, float]] = {}
        for recipe in active_recipes:
            totals_by_unit: dict[str, float] = {}
            for ingredient in recipe.get("ingredients", []):
                quantity = ingredient.get("quantityRequired")
                unit = str(ingredient.get("unit") or "unit not recorded")
                if isinstance(quantity, (int, float)):
                    totals_by_unit[unit] = totals_by_unit.get(unit, 0) + quantity
            recipe_totals[recipe.get("menuItemName", "Not recorded")] = totals_by_unit
        by_unit: dict[str, list[tuple[str, float]]] = {}
        for recipe_name, unit_totals in recipe_totals.items():
            for unit, quantity in unit_totals.items():
                by_unit.setdefault(unit, []).append((recipe_name, quantity))
        lines = ["Recipe Ingredient Usage", "• Measure: sum of required quantities, ranked only within the same unit.", ""]
        if by_unit:
            for unit, rows in sorted(by_unit.items()):
                lines.append(f"{unit}:")
                lines.extend(
                    f"• {name}: {_component3_number(quantity)} {unit}"
                    for name, quantity in sorted(rows, key=lambda item: -item[1])
                )
        else:
            lines.append("• No active recipes were returned.")
        return "\n".join(lines)
    if query_type == "ingredient_recipe_usage":
        ingredient_recipes: dict[tuple[str, str], set[str]] = {}
        for recipe in active_recipes:
            recipe_name = str(recipe.get("menuItemName") or recipe.get("menuItemId") or "Not recorded")
            for ingredient in recipe.get("ingredients", []):
                name = str(ingredient.get("ingredientName") or ingredient.get("ingredientId") or "Not recorded")
                unit = str(ingredient.get("unit") or "")
                ingredient_recipes.setdefault((name, unit), set()).add(recipe_name)
        lines = ["Ingredients Used Across Recipes", ""]
        if ingredient_recipes:
            ranked = sorted(
                ingredient_recipes.items(),
                key=lambda item: (-len(item[1]), item[0][0].casefold(), item[0][1].casefold()),
            )
            lines.extend(
                f"• {name}: used in {len(recipe_names)} active recipe(s)"
                + (f" ({unit})" if unit else "")
                for (name, unit), recipe_names in ranked
            )
        else:
            lines.append("• No active recipe ingredient records were returned.")
        return "\n".join(lines)
    if query_type == "waste_records":
        waste_stage = outputs.get("waste", {}).get("data", {})
        records_data = waste_stage.get("records", {}) if isinstance(waste_stage, dict) else {}
        if isinstance(records_data, dict) and "error" in records_data:
            return f"Waste Records — Last {days} Days\n\n• Data unavailable: {records_data['error']}"
        records = records_data.get("records", []) if isinstance(records_data, dict) else []
        lines = [f"Waste Records — Last {days} Days", ""]
        if records:
            lines.extend(
                f"• {record.get('recordedAt', 'Date unavailable')} — "
                f"{record.get('ingredientName', 'Ingredient unavailable')}: "
                f"{_component3_number(record.get('quantity'))} — "
                f"{record.get('reason') or 'Reason not recorded'} "
                f"(Status: {record.get('status') or 'Not recorded'})"
                for record in records[:50]
            )
            if len(records) > 50:
                lines.append(f"• Showing 50 of {len(records)} records.")
        else:
            lines.append("• No waste records were returned for this period.")
        return "\n".join(lines)
    if query_type == "waste_reason_analysis":
        waste_stage = outputs.get("waste", {}).get("data", {})
        records_data = waste_stage.get("records", {}) if isinstance(waste_stage, dict) else {}
        if isinstance(records_data, dict) and "error" in records_data:
            return f"Waste reason analysis unavailable: {records_data['error']}"
        records = records_data.get("records", []) if isinstance(records_data, dict) else []
        by_reason: dict[str, float] = {}
        by_reason_count: dict[str, int] = {}
        for record in records if isinstance(records, list) else []:
            reason = record.get("reason") or "Not recorded"
            quantity = record.get("quantity", 0)
            if isinstance(quantity, (int, float)):
                by_reason[reason] = by_reason.get(reason, 0) + quantity
                by_reason_count[reason] = by_reason_count.get(reason, 0) + 1
        descending = "least" not in request
        lines = [f"Waste Reasons — Last {days} Days", ""]
        if "record" in request and ("count" in request or "number" in request):
            lines.extend(
                f"• {reason}: {count} records"
                for reason, count in sorted(
                    by_reason_count.items(), key=lambda item: item[1], reverse=descending
                )
            )
        elif by_reason:
            lines.extend(
                f"• {reason}: {_component3_number(quantity)}"
                for reason, quantity in sorted(
                    by_reason.items(), key=lambda item: item[1], reverse=descending
                )
            )
        else:
            lines.append("• No recorded waste reasons were found for this period.")
        return "\n".join(lines)

    if query_type == "waste_ingredient_analysis":
        waste_stage = outputs.get("waste", {}).get("data", {})
        records_data = waste_stage.get("records", {}) if isinstance(waste_stage, dict) else {}
        if isinstance(records_data, dict) and "error" in records_data:
            return f"Waste ingredient analysis unavailable: {records_data['error']}"
        records = records_data.get("records", []) if isinstance(records_data, dict) else []
        by_ingredient: dict[tuple[str, str], float] = {}
        for record in records if isinstance(records, list) else []:
            key = (record.get("ingredientName") or "Not recorded", str(record.get("unit") or ""))
            quantity = record.get("quantity")
            if isinstance(quantity, (int, float)):
                by_ingredient[key] = by_ingredient.get(key, 0) + quantity
        lines = [f"Waste by Ingredient — Last {days} Days", ""]
        if by_ingredient:
            if "highest" in request or "most" in request:
                by_ingredient = dict(sorted(
                    by_ingredient.items(), key=lambda row: -row[1]
                )[:1])
            lines.extend(
                f"• {name}: {_component3_number(quantity)}"
                + (f" {unit}" if unit else "")
                for (name, unit), quantity in sorted(by_ingredient.items(), key=lambda row: -row[1])
            )
        else:
            lines.append("• No recorded waste quantities were found for this period.")
        return "\n".join(lines)

    if query_type == "waste_total":
        waste_stage = outputs.get("waste", {}).get("data", {})
        summary = waste_stage.get("summary", {}) if isinstance(waste_stage, dict) else {}
        if isinstance(summary, dict) and "error" in summary:
            return f"Waste Summary — Last {days} Days\n\n• Data unavailable: {summary['error']}"
        return (
            f"Waste Summary — Last {days} Days\n\n"
            f"• Waste records: {_component3_number(summary.get('totalWasteRecords'))}\n"
            f"• Total recorded waste quantity: {_component3_number(summary.get('totalWasteQuantity'))}"
        )

    if query_type == "consumption_analysis":
        if isinstance(consumption, dict) and "error" in consumption:
            return (
                f"Ingredient Consumption — Last {days} Days\n\n"
                f"• Recorded consumption data is unavailable: {consumption['error']}"
            )
        movements = consumption.get("movements", []) if isinstance(consumption, dict) else []
        by_ingredient: dict[tuple[str, str], float] = {}
        for movement in movements if isinstance(movements, list) else []:
            name = (
                movement.get("ingredientName")
                or movement.get("ingredient_name")
                or movement.get("ingredientId")
                or "Unknown ingredient"
            )
            unit = str(movement.get("unit") or "").strip()
            quantity = movement.get("quantity", 0)
            if isinstance(quantity, (int, float)):
                key = (name, unit)
                by_ingredient[key] = by_ingredient.get(key, 0) + quantity
        lines = [f"Ingredient Consumption — Last {days} Days", ""]
        lines.append(
            f"• Recorded consumption movements: "
            f"{_component3_number(consumption.get('count', len(movements)))}"
        )
        if by_ingredient:
            lines.extend(
                f"• {name}: {_component3_number(quantity)}"
                + (f" {unit}" if unit else "")
                + " recorded"
                for (name, unit), quantity in sorted(
                    by_ingredient.items(), key=lambda item: -item[1]
                )
            )
        elif not movements:
            lines.append("• No recorded consumption movements were found for this period.")
        else:
            lines.append("• Recorded movements did not include usable ingredient quantities.")
        return "\n".join(lines)

    if query_type == "consumption_highest":
        if isinstance(consumption, dict) and "error" in consumption:
            return f"Highest Ingredient Consumption\n\n• Recorded consumption data is unavailable: {consumption['error']}"
        totals: dict[tuple[str, str], float] = {}
        movements = consumption.get("movements", []) if isinstance(consumption, dict) else []
        for movement in movements if isinstance(movements, list) else []:
            name = movement.get("ingredientName") or movement.get("ingredientId") or "Unknown ingredient"
            unit = str(movement.get("unit") or "")
            quantity = movement.get("quantity")
            if isinstance(quantity, (int, float)):
                key = (name, unit)
                totals[key] = totals.get(key, 0) + quantity
        lines = [f"Highest Recorded Ingredient Consumption — Last {days} Days", ""]
        if totals:
            lines.extend(
                f"• {name}: {_component3_number(quantity)}"
                + (f" {unit}" if unit else "")
                for (name, unit), quantity in sorted(totals.items(), key=lambda item: -item[1])[:5]
            )
        else:
            lines.append("• No recorded consumption movements were found for this period.")
        return "\n".join(lines)

    if query_type == "consumption_patterns":
        movements = consumption.get("movements", []) if isinstance(consumption, dict) else []
        totals: dict[tuple[str, str], float] = {}
        for movement in movements if isinstance(movements, list) else []:
            key = (
                movement.get("ingredientName") or movement.get("ingredientId") or "Unknown ingredient",
                str(movement.get("unit") or ""),
            )
            quantity = movement.get("quantity")
            if isinstance(quantity, (int, float)):
                totals[key] = totals.get(key, 0) + quantity
        lines = [f"Recorded Consumption Pattern — Last {days} Days", ""]
        if len(movements) < 3:
            lines.append("• Fewer than three movements are available; unusual consumption cannot be assessed reliably.")
        elif totals:
            name, unit = max(totals, key=totals.get)
            lines.append("• The available data has no comparable historical baseline or expected-consumption rate, so it cannot establish whether a pattern is unusual.")
            lines.append(f"• Largest observed aggregate: {name}, {_component3_number(totals[(name, unit)])} {unit}.")
            lines.append("• This is a ranking of recorded quantities, not evidence of an anomaly.")
        else:
            lines.append("• The API returned movements without usable quantity data.")
        return "\n".join(lines)

    if query_type == "consumption_movements":
        if isinstance(consumption, dict) and "error" in consumption:
            return f"Consumption Stock Movements — Last {days} Days\n\n• Data unavailable: {consumption['error']}"
        movements = consumption.get("movements", []) if isinstance(consumption, dict) else []
        lines = [f"Consumption Stock Movements — Last {days} Days", ""]
        if movements:
            for movement in movements[:50]:
                lines.append(
                    f"• {movement.get('createdAt', 'Date unavailable')} — "
                    f"{movement.get('ingredientName', 'Ingredient unavailable')}: "
                    f"{_component3_number(movement.get('quantity'))} "
                    f"{movement.get('unit', '')} — {movement.get('referenceType') or movement.get('reason') or 'source not recorded'}"
                )
            if len(movements) > 50:
                lines.append(f"• Showing 50 of {len(movements)} movements.")
        else:
            lines.append("• No recorded consumption movements were found for this period.")
        return "\n".join(lines)

    if query_type == "recipe_analysis":
        recipes_stage = outputs.get("consumption", {}).get("data", {})
        recipes = recipes_stage.get("recipes", {}) if isinstance(recipes_stage, dict) else {}
        if isinstance(recipes, dict) and "error" in recipes:
            return f"Recipe Analysis\n\n• Recipe data unavailable: {recipes['error']}"
        raw_recipes = recipes.get("recipes", []) if isinstance(recipes, dict) else []
        requested_name = _component3_menu_item_name(message)
        matches = [
            recipe for recipe in raw_recipes if isinstance(recipe, dict)
            and (not requested_name or requested_name.lower() in str(recipe.get("menuItemName", "")).lower())
        ]
        lines = [f"Recipe Analysis — Last {days} Days", ""]
        if not matches:
            lines.append("• No recorded recipe matched the requested menu item.")
        else:
            for recipe in matches:
                lines.append(f"{recipe.get('menuItemName', 'Not recorded')}:")
                for ingredient in recipe.get("ingredients", []):
                    lines.append(
                        f"• {ingredient.get('ingredientName', 'Not recorded')}: "
                        f"{_component3_number(ingredient.get('quantityRequired'))} "
                        f"{ingredient.get('unit', '')}".rstrip()
                    )
        return "\n".join(lines)

    if wants_sales:
        lines.append("Sales Performance")
        if isinstance(sales, dict) and "error" in sales:
            lines.append(f"• Recorded sales data is unavailable: {sales['error']}")
        elif isinstance(sales, dict):
            lines.extend([
                f"• Total sales: {_component3_number(_component3_value(sales, 'totalSales', 'total_sales'))}",
                f"• Total revenue: {_component3_number(_component3_value(sales, 'totalRevenue', 'total_revenue'))}",
                f"• Average order value: {_component3_number(_component3_value(sales, 'averageOrderValue', 'average_order_value'))}",
                f"• Total items sold: {_component3_number(_component3_value(sales, 'totalItemsSold', 'total_items_sold'))}",
            ])
            if _component3_value(sales, "totalSales", "total_sales") == 0:
                lines.append("• No recorded sales were found for this period.")
        else:
            lines.append("• Recorded sales data is unavailable.")
        lines.append("")

    if wants_consumption:
        lines.append("Ingredient Consumption & Stock Movements")
        if isinstance(consumption, dict) and "error" not in consumption:
            movements = consumption.get("movements", [])
            all_movement_result = consumption.get("all_movements", {})
            all_movement_rows = (
                all_movement_result.get("movements", [])
                if isinstance(all_movement_result, dict)
                else []
            )
            has_complete_movement_data = (
                complete
                and isinstance(all_movement_result, dict)
                and "error" not in all_movement_result
                and isinstance(all_movement_rows, list)
            )
            if has_complete_movement_data:
                consumption_rows = [
                    movement for movement in all_movement_rows
                    if str(movement.get("movementType", "")).upper() == "CONSUME"
                ]
            else:
                consumption_rows = movements if isinstance(movements, list) else []
            lines.append(
                f"• Total relevant stock movements: {_component3_number(len(consumption_rows) if has_complete_movement_data else consumption.get('count', len(consumption_rows)))}"
            )
            by_ingredient: dict[tuple[str, str], float] = {}
            category_counts = {"sales": 0, "operational": 0, "unclassified": 0}
            operational_reference_types = {
                "KITCHEN_ORDER", "KITCHEN", "MANUAL_CONSUMPTION",
            }
            for movement in consumption_rows:
                name = (
                    movement.get("ingredientName")
                    or movement.get("ingredient_name")
                    or movement.get("ingredientId")
                    or "Unknown ingredient"
                )
                quantity = movement.get("quantity", 0)
                unit = str(movement.get("unit") or "").strip()
                reference_type = str(
                    movement.get("referenceType")
                    or movement.get("reference_type")
                    or ""
                ).upper()
                if isinstance(quantity, (int, float)):
                    key = (name, unit)
                    by_ingredient[key] = by_ingredient.get(key, 0) + quantity
                    if reference_type == "SALE":
                        category_counts["sales"] += 1
                    elif reference_type in operational_reference_types:
                        category_counts["operational"] += 1
                    else:
                        category_counts["unclassified"] += 1
            lines.append(f"• Sales-referenced consumption movements: {category_counts['sales']}")
            lines.append(f"• Explicit operational consumption movements: {category_counts['operational']}")
            if category_counts["unclassified"]:
                lines.append(f"• Consumption movements with no recognized source: {category_counts['unclassified']}")
            for (name, unit), quantity in sorted(by_ingredient.items(), key=lambda item: -item[1])[:10]:
                lines.append(
                    f"• {name}: {_component3_number(quantity)}"
                    + (f" {unit}" if unit else "")
                    + " recorded"
                )
            if not by_ingredient and not consumption_rows:
                lines.append("• No recorded consumption movements were returned.")
        else:
            error = consumption.get("error") if isinstance(consumption, dict) else None
            lines.append(
                f"• Recorded consumption data is unavailable: {error}"
                if error
                else "• Recorded consumption data is unavailable."
            )
        lines.append("")

    if complete:
        all_movement_result = consumption.get("all_movements", {})
        all_movements = (
            all_movement_result.get("movements", [])
            if isinstance(all_movement_result, dict)
            else []
        )
        if isinstance(all_movement_result, dict) and "error" in all_movement_result:
            lines.append(f"All stock movement categories: unavailable ({all_movement_result['error']})")
        else:
            movement_counts: dict[str, int] = {}
            for movement in all_movements if isinstance(all_movements, list) else []:
                movement_type = str(movement.get("movementType") or "NOT_RECORDED")
                movement_counts[movement_type] = movement_counts.get(movement_type, 0) + 1
            if movement_counts:
                lines.append("All recorded stock movement types")
                lines.extend(
                    f"• {movement_type}: {count}"
                    for movement_type, count in sorted(movement_counts.items())
                )
                lines.append("")

    recipes = consumption.get("recipes", {}) if isinstance(consumption, dict) else {}
    if wants_recipes:
        lines.append("Recipes")
        if isinstance(recipes, dict) and "error" not in recipes:
            lines.append(
                f"• Recipes available for analysis: {_component3_number(recipes.get('count'))}"
            )
        else:
            error = recipes.get("error") if isinstance(recipes, dict) else None
            lines.append(
                f"• Recipe data is unavailable: {error}"
                if error
                else "• Recipe data is unavailable."
            )
        lines.append("")

    waste_stage = outputs.get("waste", {}).get("data", {})
    waste = waste_stage.get("summary", {}) if isinstance(waste_stage, dict) else {}
    if wants_waste:
        lines.append("Waste")
        if isinstance(waste, dict) and "error" not in waste:
            lines.extend([
                f"• Total waste records: {_component3_number(_component3_value(waste, 'totalWasteRecords', 'total_waste_records'))}",
                f"• Total waste quantity: {_component3_number(_component3_value(waste, 'totalWasteQuantity', 'total_waste_quantity'))}",
            ])
            waste_records = report.get("waste_records", {})
            records = waste_records.get("records", []) if isinstance(waste_records, dict) else []
            if isinstance(waste_records, dict) and "error" in waste_records:
                lines.append(
                    f"• Ingredient/reason breakdown unavailable: {waste_records['error']}"
                )
            by_ingredient: dict[str, float] = {}
            by_reason: dict[str, float] = {}
            if not (isinstance(waste_records, dict) and "error" in waste_records):
                for record in records if isinstance(records, list) else []:
                    ingredient = record.get("ingredientName") or "Not recorded"
                    reason = record.get("reason") or "Not recorded"
                    quantity = record.get("quantity", 0)
                    if isinstance(quantity, (int, float)):
                        by_ingredient[ingredient] = by_ingredient.get(ingredient, 0) + quantity
                        by_reason[reason] = by_reason.get(reason, 0) + quantity
            if by_ingredient:
                lines.append("By ingredient")
                lines.extend(
                    f"• {name}: {_component3_number(quantity)}"
                    for name, quantity in sorted(by_ingredient.items(), key=lambda item: -item[1])
                )
            if by_reason:
                lines.append("By reason")
                lines.extend(
                    f"• {reason}: {_component3_number(quantity)}"
                    for reason, quantity in sorted(by_reason.items(), key=lambda item: -item[1])
                )
        else:
            error = waste.get("error") if isinstance(waste, dict) else None
            lines.append(
                f"• Recorded waste data is unavailable: {error}"
                if error
                else "• Recorded waste data is unavailable."
            )
        lines.append("")

    recommendations = report.get("recommendations", []) if isinstance(report, dict) else []
    if recommendations:
        lines.append("Recommendations")
        for recommendation in recommendations:
            lines.append(f"• {recommendation}")
        if report.get("requires_approval"):
            lines.append("• Manager approval required.")

    return "\n".join(lines).strip()


async def run_component3_workflow(message: str, wf_id: str, days: int):
    """Run four separate role prompts, then a deterministic recommendation."""
    date_to = datetime.now(timezone.utc).replace(microsecond=0)
    date_from = date_to - timedelta(days=days)
    date_from_text = date_from.isoformat().replace("+00:00", "Z")
    date_to_text = date_to.isoformat().replace("+00:00", "Z")
    date_args = {
        "days": days,
        "date_from": date_from_text,
        "date_to": date_to_text,
    }
    outputs = {}
    gemini_failure: str | None = None
    for stage, role, tool_name, instruction in COMPONENT3_STAGES:
        if stage == "sales":
            data = {
                "summary": await call_tool("get_sales_summary", date_args,
                    allowed_tools=COMPONENT3_READ_ONLY_TOOLS),
                "records": await call_tool("get_sales_records", date_args,
                    allowed_tools=COMPONENT3_READ_ONLY_TOOLS),
                "comparison": (
                    await call_tool(
                        "get_sales_period_comparison", date_args,
                        allowed_tools=COMPONENT3_READ_ONLY_TOOLS,
                    )
                    if _component3_query_type(message) == "comparison"
                    else {}
                ),
                "menu_items": (
                    await call_tool("get_menu_items", {},
                        allowed_tools=COMPONENT3_READ_ONLY_TOOLS)
                    if _component3_query_type(message) in (
                        "zero_sales_menu_items", "missing_recipes",
                    )
                    else {}
                ),
            }
        elif stage == "consumption":
            data = {
                "movements": await call_tool(tool_name, date_args,
                    allowed_tools=COMPONENT3_READ_ONLY_TOOLS),
                "recipes": await call_tool("get_recipes", {},
                    allowed_tools=COMPONENT3_READ_ONLY_TOOLS),
                "all_movements": (
                    await call_tool("get_component3_all_movements", date_args,
                        allowed_tools=COMPONENT3_READ_ONLY_TOOLS)
                    if _component3_query_type(message) == "combined_analysis"
                    or "complete" in message.lower()
                    else {}
                ),
                "inventory": (
                    await call_tool("get_component3_inventory", {},
                        allowed_tools=COMPONENT3_READ_ONLY_TOOLS)
                    if _component3_query_type(message) in (
                        "ingredient_dependency", "recipe_expected_consumption",
                        "recommendation_analysis", "operational_problems",
                        "waste_menu_item_association", "sales_waste_association",
                    )
                    else {}
                ),
            }
        elif stage == "waste":
            data = {
                "summary": await call_tool(tool_name, date_args,
                    allowed_tools=COMPONENT3_READ_ONLY_TOOLS),
                "records": await call_tool("get_component3_waste_records", date_args,
                    allowed_tools=COMPONENT3_READ_ONLY_TOOLS),
                "comparison": (
                    await call_tool("get_component3_waste_period_comparison", date_args,
                        allowed_tools=COMPONENT3_READ_ONLY_TOOLS)
                    if _component3_query_type(message) == "waste_comparison"
                    else {}
                ),
            }
            data["records"] = _component3_validate_waste_records(
                data["summary"],
                data["records"],
            )
        else:
            data = await call_tool(tool_name, {"days": days},
                allowed_tools=COMPONENT3_READ_ONLY_TOOLS)
        summary_source = "gemini"
        if gemini_failure is None:
            try:
                response = genai.GenerativeModel(
                    model_name=GEMINI_MODEL,
                    system_instruction=f"You are the distinct {role}. Stay within your role."
                ).generate_content(
                    f"{instruction} Do not invent values. Explain these facts concisely: "
                    f"{json.dumps(data, default=str)}. User request: {message}",
                    request_options={"timeout": 45},
                )
                summary = response.text
            except (ResourceExhausted, ServiceUnavailable, DeadlineExceeded, RetryError) as exc:
                gemini_failure = type(exc).__name__
                logger.warning(
                    "Gemini unavailable for Component 3 %s stage; continuing with live structured data: %s",
                    role,
                    exc,
                )
                summary_source = "structured_fallback"
                summary = (
                    f"{role} Gemini narrative unavailable ({gemini_failure}); "
                    "the final analysis will use the live structured backend data."
                )
        else:
            summary_source = "structured_fallback"
            summary = (
                f"{role} Gemini narrative unavailable ({gemini_failure}); "
                "the final analysis will use the live structured backend data."
            )
        outputs[stage] = {"tool": tool_name, "data": data,
                          "read_only": True, "summary": summary,
                          "summary_source": summary_source}
        yield _sse("stage_output", {"workflow_id": wf_id, "stage": stage,
            "role": role, "output": outputs[stage]})

    consumption_data = outputs["consumption"]["data"]
    recipes = (
        consumption_data.get("recipes", {})
        if isinstance(consumption_data, dict)
        else {}
    )
    report = await call_tool("build_component3_report", {
        "sales_summary": outputs["sales"]["data"].get("summary", {}),
        "waste_summary": outputs["waste"]["data"].get("summary", {}),
        "consumption": consumption_data,
        "recipes": recipes,
        "waste_records": outputs["waste"]["data"].get("records", {}),
        "focus": _component3_focus(message),
    }, allowed_tools=COMPONENT3_READ_ONLY_TOOLS)
    if gemini_failure is None:
        try:
            response = genai.GenerativeModel(
                model_name=GEMINI_MODEL,
                system_instruction="You are the distinct RecommendationAgent; facts are authoritative."
            ).generate_content("Summarize this deterministic report without adding figures: "
                               + json.dumps(report, default=str),
                               request_options={"timeout": 45})
            recommendation_summary = response.text
            recommendation_summary_source = "gemini"
        except (ResourceExhausted, ServiceUnavailable, DeadlineExceeded, RetryError) as exc:
            gemini_failure = type(exc).__name__
            logger.warning(
                "Gemini unavailable for Component 3 RecommendationAgent; preserving structured report: %s",
                exc,
            )
            recommendation_summary = (
                f"RecommendationAgent Gemini narrative unavailable ({gemini_failure}); "
                "the read-only structured report remains authoritative."
            )
            recommendation_summary_source = "structured_fallback"
    else:
        recommendation_summary = (
            f"RecommendationAgent Gemini narrative unavailable ({gemini_failure}); "
            "the read-only structured report remains authoritative."
        )
        recommendation_summary_source = "structured_fallback"
    outputs["recommendation"] = {"tool": "build_component3_report", "data": report,
        "read_only": True, "summary": recommendation_summary,
        "summary_source": recommendation_summary_source,
        "recommendations": report.get("recommendations", []),
        "impact_level": report.get("impact_level", "LOW"),
        "confidence": report.get("confidence", 0),
        "requires_approval": report.get("requires_approval", False)}
    yield _sse("stage_output", {"workflow_id": wf_id, "stage": "recommendation",
        "role": "RecommendationAgent", "output": outputs["recommendation"]})
    if outputs["recommendation"]["requires_approval"]:
        yield _sse("approval_required", {
            "workflow_id": wf_id,
            "workflow_type": "SALES_CONSUMPTION_WASTE",
            "impact_level": outputs["recommendation"]["impact_level"],
            "confidence": outputs["recommendation"]["confidence"],
            "recommendations": outputs["recommendation"]["recommendations"],
        })
    if set(outputs) != {"sales", "consumption", "waste", "recommendation"}:
        yield _sse("workflow_error", {"workflow_id": wf_id,
            "text": "Component 3 workflow incomplete."})
        return
    final_text = _format_component3_response(message, outputs, report, days)
    if gemini_failure:
        final_text += (
            f"\n\nNote: Gemini specialist summaries were unavailable ({gemini_failure}); "
            "the report above was calculated from live structured backend data."
        )
    yield _sse("message", {
        "workflow_id": wf_id,
        "text": final_text,
    })


def sanitize_output(text: str) -> str:
    """Ensure output complies with rules: no ** or __ bolding, no # headings, bullet •."""
    import re
    # Strip markdown bold syntax
    text = re.sub(r"\*\*(.*?)\*\*", r"\1", text)
    text = re.sub(r"__(.*?)__", r"\1", text)
    # Strip markdown headings (# Header -> Header)
    text = re.sub(r"^#{1,6}\s*(.+)$", r"\1", text, flags=re.MULTILINE)
    # Replace standard dash/asterisk bullets with •
    text = re.sub(r"^(\s*)[-*]\s+", r"\1• ", text, flags=re.MULTILINE)
    return text.strip()


# ═══════════════════════════════════════════════════════════════════════════════
# SSE event helpers
# ═══════════════════════════════════════════════════════════════════════════════

def _sse(event_type: str, data: Any) -> str:
    payload = json.dumps({"type": event_type, **data} if isinstance(data, dict)
                          else {"type": event_type, "data": data})
    return f"data: {payload}\n\n"


# ═══════════════════════════════════════════════════════════════════════════════
# Main agent entry point
# ═══════════════════════════════════════════════════════════════════════════════

async def run_agent(
    message: str,
    user_id: str,
    workflow_id: str | None,
) -> AsyncIterator[str]:
    """
    Classify intent, run the appropriate multi-stage Gemini workflow,
    and yield SSE strings.
    """
    wf_id = workflow_id or str(uuid.uuid4())

    # ── Step 1: Classify intent ──────────────────────────────────────────────
    yield _sse("thinking", {"text": "Analysing your request…"})

    if _component3_write_request(message):
        yield _sse("intent", {"intent": "GENERAL_QUERY", "workflow_id": wf_id})
        yield _sse("message", {
            "text": (
                "I can only analyze Component 3 records in this chat. I did not create or change "
                "a sale, waste record, stock level, recipe, or purchase order. Use the authorized "
                "backend workflow for that action."
            ),
            "workflow_id": wf_id,
        })
        yield _sse("done", {"workflow_id": wf_id})
        return

    request_intent = _component3_intent_from_request(message)
    if request_intent:
        intent = request_intent
    else:
        intent_model = genai.GenerativeModel(
            model_name=GEMINI_MODEL,
            system_instruction=INTENT_SYSTEM,
        )
        intent_response = intent_model.generate_content(message)
        intent = intent_response.text.strip().upper()

    # Guard unknown intents
    if intent not in WORKFLOW_SYSTEMS:
        intent = "GENERAL_QUERY"

    yield _sse("intent", {"intent": intent, "workflow_id": wf_id})

    if intent == "SALES_CONSUMPTION_WASTE":
        days = _component3_days(message)
        if days == 0:
            yield _sse("message", {
                "workflow_id": wf_id,
                "text": "Invalid date range. Component 3 analysis supports periods from 1 through 366 days.",
            })
            yield _sse("done", {"workflow_id": wf_id})
            return
        yield _sse("thinking", {"text": "Running four Component 3 specialist stages…"})
        async for event in run_component3_workflow(message, wf_id, days):
            yield event
        yield _sse("done", {"workflow_id": wf_id})
        return

    if intent == "GENERAL_QUERY":
        yield _sse("thinking", {"text": "Answering your query…"})
        general_model = genai.GenerativeModel(
            model_name="gemini-3.5-flash-lite",
            system_instruction=OUTPUT_RULES_AND_FORMAT,
        )
        resp = general_model.generate_content(
            f"Answer the following query adhering strictly to the output format and rules:\n\n{message}"
        )
        yield _sse("message", {"text": sanitize_output(resp.text), "workflow_id": wf_id})
        yield _sse("done", {"workflow_id": wf_id})
        return

    # ── Step 2: Run the workflow agent (multi-turn function calling) ──────────
    system = WORKFLOW_SYSTEMS[intent]
    model  = genai.GenerativeModel(
        model_name=GEMINI_MODEL,
        system_instruction=system,
        tools=[TOOL_DEFINITIONS],
    )

    yield _sse("thinking", {"text": f"Starting {intent.replace('_', ' ').title()} workflow…"})

    # Seed the conversation with the user's original message + workflow context
    history = [
        {"role": "user", "parts": [
            f"{message}\n\n[workflow_id={wf_id}]"
        ]}
    ]
    chat = model.start_chat(history=[])

    final_text: str = ""
    proposal: dict | None = None
    guided_workflow: dict | None = None
    step_number = 0

    # Agentic loop: keep going until no more function calls
    current_message = f"{message}\n\n[workflow_id={wf_id}]"
    while True:
        # Retry with backoff for rate limits / transient errors
        retries, delay = 3, 10
        response = None
        while retries > 0:
            try:
                response = chat.send_message(current_message)
                break
            except (ResourceExhausted, ServiceUnavailable) as exc:
                retries -= 1
                if retries == 0:
                    yield _sse("message", {
                        "text": f"⚠️ AI model quota/availability error: {exc.message if hasattr(exc,'message') else str(exc)}. Please wait a moment and try again.",
                        "workflow_id": wf_id,
                    })
                    yield _sse("done", {"workflow_id": wf_id})
                    return
                yield _sse("thinking", {"text": f"Rate limit hit — retrying in {delay}s…"})
                await asyncio.sleep(delay)
                delay *= 2
        step_number += 1

        # Collect all parts
        has_function_call = False

        for part in response.parts:
            # ── Function call from Gemini ────────────────────────────────────
            if hasattr(part, "function_call") and part.function_call:
                fn  = part.function_call
                has_function_call = True
                tool_name = fn.name

                # Deep-convert protobuf args → plain JSON-serializable Python dict.
                # fn.args is a MapComposite; nested lists are RepeatedComposite.
                # Safest approach: serialise via the proto library then parse back.
                def _proto_to_plain(val):
                    """Recursively convert protobuf composite types to plain dicts/lists."""
                    if isinstance(val, dict):
                        return {k: _proto_to_plain(v) for k, v in val.items()}
                    if hasattr(val, '__iter__') and not isinstance(val, str):
                        try:
                            return [_proto_to_plain(i) for i in val]
                        except Exception:
                            pass
                    # Scalar protobuf struct values → Python native
                    for attr in ('string_value', 'number_value', 'bool_value', 'null_value'):
                        if hasattr(val, attr):
                            try:
                                return getattr(val, attr)
                            except Exception:
                                pass
                    return val

                try:
                    # Try the cleanest path: use the SDK's built-in to_json
                    import json as _json
                    raw = type(fn).to_json(fn)
                    tool_args = _json.loads(raw).get("args", {})
                except Exception:
                    try:
                        tool_args = {k: _proto_to_plain(v) for k, v in fn.args.items()}
                    except Exception:
                        tool_args = dict(fn.args) if fn.args else {}

                # Final safety: ensure the whole thing is JSON serializable
                try:
                    json.dumps(tool_args)
                except TypeError:
                    tool_args = json.loads(json.dumps(tool_args, default=str))

                yield _sse("tool_call", {
                    "step":  step_number,
                    "tool":  tool_name,
                    "input": tool_args,
                })

                # Execute the tool
                allowed_tools = (
                    COMPONENT3_READ_ONLY_TOOLS
                    if intent == "SALES_CONSUMPTION_WASTE"
                    else None
                )
                tool_result = await call_tool(
                    tool_name, tool_args, allowed_tools=allowed_tools
                )

                yield _sse("tool_result", {
                    "step":   step_number,
                    "tool":   tool_name,
                    "output": tool_result,
                })

                # Every Component 3 role emits a machine-readable output.
                # The API validates these values before persisting them.
                if intent == "SALES_CONSUMPTION_WASTE" and tool_name in COMPONENT3_STAGE_BY_TOOL:
                    stage, role = COMPONENT3_STAGE_BY_TOOL[tool_name]
                    yield _sse("stage_output", {
                        "workflow_id": wf_id,
                        "stage": stage,
                        "role": role,
                        "output": {
                            "tool": tool_name,
                            "data": tool_result,
                            "read_only": True,
                        },
                    })

                # Capture proposal for approval gate
                if tool_name in ("build_po_proposal", "propose_reorder_level_change"):
                    proposal = tool_result

                # Capture guided workflow plan
                if tool_name == "plan_guided_workflow":
                    guided_workflow = tool_result.get("plan")

                # Send tool result back to Gemini
                # Use role 'user' + function_response (compatible with all Gemini models incl. flash-lite)
                import google.ai.generativelanguage as glm
                current_message = glm.Content(
                    role="user",
                    parts=[glm.Part(
                        function_response=glm.FunctionResponse(
                            name=tool_name,
                            response={"result": json.dumps(tool_result)},
                        )
                    )],
                )

            # ── Text part from Gemini ────────────────────────────────────────
            elif hasattr(part, "text") and part.text:
                final_text += part.text

        if not has_function_call:
            # Gemini returned only text → workflow complete
            break

    # ── Step 3: Stream final message ─────────────────────────────────────────
    if final_text:
        yield _sse("message", {"text": sanitize_output(final_text), "workflow_id": wf_id})

    # ── Step 4: Approval gate (if workflow produced a proposal) ──────────────
    if proposal and intent != "ANOMALY_INVESTIGATION":
        yield _sse("approval_required", {
            "workflow_id": wf_id,
            "workflow_type": intent,
            "proposal":    proposal,
        })

    # ── Step 5: Guided workflow event (if workflow generated a plan) ─────────
    if guided_workflow:
        yield _sse("guided_workflow", {
            "workflow_id":   wf_id,
            "workflow_type": guided_workflow.get("workflow_type"),
            "title":         guided_workflow.get("title"),
            "description":   guided_workflow.get("description"),
            "steps":         guided_workflow.get("steps", []),
            "guided_workflow": guided_workflow,
        })

    yield _sse("done", {"workflow_id": wf_id})
