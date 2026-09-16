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
import os
from typing import AsyncIterator, Any

import google.generativeai as genai
from google.api_core.exceptions import ResourceExhausted, ServiceUnavailable
from tools import TOOL_DEFINITIONS, call_tool
from tools.sales import COMPONENT3_READ_ONLY_TOOLS

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")

COMPONENT3_STAGE_BY_TOOL = {
    "get_sales_summary": ("sales", "SalesAgent"),
    "get_sales_records": ("sales", "SalesAgent"),
    "get_consumption_movements": ("consumption", "ConsumptionAgent"),
    "get_recipes": ("consumption", "ConsumptionAgent"),
    "get_component3_waste_summary": ("waste", "WasteAgent"),
    "get_all_stock_levels": ("consumption", "ConsumptionAgent"),
    "get_ingredient_stock": ("consumption", "ConsumptionAgent"),
    "get_stock_movements": ("consumption", "ConsumptionAgent"),
    "build_component3_report": ("recommendation", "RecommendationAgent"),
}

# ─── System prompts per workflow stage ───────────────────────────────────────

INTENT_SYSTEM = """
You are an inventory AI assistant for a restaurant. Classify the user's intent into ONE of:
  SALES_CONSUMPTION_WASTE   — analyze recorded sales, recipe-derived consumption, stock movements, or waste
  LOW_STOCK_REPLENISHMENT   — user wants to check/reorder low stock
  ANOMALY_INVESTIGATION     — user suspects missing stock or discrepancy
  INVENTORY_OPTIMIZATION    — user wants to review/improve reorder levels
  EMERGENCY_SHORTAGE        — urgent stock shortage needing immediate action
  GENERAL_QUERY             — anything else (answer from context, no tools needed)

Respond with ONLY the intent label (no explanation).
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
    "LOW_STOCK_REPLENISHMENT": """
You are a Low-Stock Replenishment Agent for a restaurant inventory system.

Your job:
1. Use get_all_stock_levels to identify ingredients below minimum stock.
2. For each low-stock item, call get_demand_forecast to project demand for 14 days.
3. Calculate required_order = predicted_demand + safety_stock(5% of max) - current_stock.
4. Call get_supplier_options for each item needing replenishment.
5. Call get_expiring_batches to factor in soon-to-expire stock.
6. Call build_po_proposal with all items and your full reasoning.

After build_po_proposal, summarize clearly for the manager:
- Which ingredients need replenishment and why
- Recommended suppliers with prices and lead times
- Total proposed spend
- State that manager approval is needed before any order is placed.
""",
    "ANOMALY_INVESTIGATION": """
You are a Stock Anomaly Investigation Agent.

Your job:
1. Call get_all_stock_levels to understand the current state.
2. For each ingredient with suspiciously low stock (or as the user specifies):
   a. Call calculate_expected_consumption to get expected vs actual.
   b. Call get_stock_movements to see all movements.
   c. Call get_waste_records to find recorded waste.
   d. Call get_stock_adjustments to find recorded adjustments.
3. Cross-reference: actual = expected + waste + adjustments + unexplained.
4. Call generate_anomaly_report with your findings.

Present findings clearly with tables where possible.
This is a read-only investigation — no approval needed.
""",
    "INVENTORY_OPTIMIZATION": """
You are an Inventory Optimization Agent.

Your job:
1. Call get_all_stock_levels to see current min/max settings.
2. For each ingredient, call analyze_consumption_patterns (90-day history).
3. Calculate recommended new values:
   - new_minimum = (daily_average × lead_time_days) × 1.25 (25% safety margin)
   - new_maximum = new_minimum + (daily_average × 14)
4. Only recommend changes where new_minimum differs from current by > 10%.
5. Call propose_reorder_level_change with your full list and reasoning.

Explain your methodology and the business benefit of each change.
Manager approval is required before any changes are applied.
""",
    "EMERGENCY_SHORTAGE": """
You are an Emergency Stock Shortage Response Agent. Act URGENTLY.

Your job:
1. Call get_ingredient_stock for the ingredient in crisis.
2. Call get_demand_forecast with days=1 (next 24 hours).
3. Call rank_emergency_options to find the fastest supplier.
4. Call get_expiring_batches — can any other stock substitute?
5. Call build_po_proposal with URGENCY flag and the fastest supplier.

Be concise and action-oriented. State:
- Current stock vs immediate need
- Best emergency supplier (fastest lead time first)
- Recommended order quantity
- Estimated delivery time
- Total emergency cost

Manager approval needed to place the emergency order.
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

async def run_component3_workflow(message: str, wf_id: str, days: int):
    """Run four separate role prompts, then a deterministic recommendation."""
    outputs = {}
    for stage, role, tool_name, instruction in COMPONENT3_STAGES:
        if stage == "consumption":
            data = {
                "movements": await call_tool(tool_name, {"days": days},
                    allowed_tools=COMPONENT3_READ_ONLY_TOOLS),
                "recipes": await call_tool("get_recipes", {},
                    allowed_tools=COMPONENT3_READ_ONLY_TOOLS),
            }
        else:
            data = await call_tool(tool_name, {"days": days},
                allowed_tools=COMPONENT3_READ_ONLY_TOOLS)
        response = genai.GenerativeModel(
            model_name=GEMINI_MODEL,
            system_instruction=f"You are the distinct {role}. Stay within your role."
        ).generate_content(
            f"{instruction} Do not invent values. Explain these facts concisely: "
            f"{json.dumps(data, default=str)}. User request: {message}"
        )
        outputs[stage] = {"tool": tool_name, "data": data,
                          "read_only": True, "summary": response.text}
        yield _sse("stage_output", {"workflow_id": wf_id, "stage": stage,
            "role": role, "output": outputs[stage]})

    consumption_data = outputs["consumption"]["data"]
    recipes = (
        consumption_data.get("recipes", {})
        if isinstance(consumption_data, dict)
        else {}
    )
    report = await call_tool("build_component3_report", {
        "sales_summary": outputs["sales"]["data"],
        "waste_summary": outputs["waste"]["data"],
        "consumption": consumption_data,
        "recipes": recipes,
    }, allowed_tools=COMPONENT3_READ_ONLY_TOOLS)
    response = genai.GenerativeModel(
        model_name=GEMINI_MODEL,
        system_instruction="You are the distinct RecommendationAgent; facts are authoritative."
    ).generate_content("Summarize this deterministic report without adding figures: "
                        + json.dumps(report, default=str))
    outputs["recommendation"] = {"tool": "build_component3_report", "data": report,
        "read_only": True, "summary": response.text,
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
    yield _sse("message", {"workflow_id": wf_id,
        "text": "\n\n".join(v["summary"] for v in outputs.values())})


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
        import re
        match = re.search(r"\b(\d{1,3})\s*days?\b", message, re.IGNORECASE)
        days = max(1, min(int(match.group(1)) if match else 30, 366))
        yield _sse("thinking", {"text": "Running four Component 3 specialist stages…"})
        async for event in run_component3_workflow(message, wf_id, days):
            yield event
        yield _sse("done", {"workflow_id": wf_id})
        return

    if intent == "GENERAL_QUERY":
        yield _sse("thinking", {"text": "Answering your query…"})
        general_model = genai.GenerativeModel(GEMINI_MODEL)
        resp = general_model.generate_content(
            f"You are an inventory management assistant. Answer concisely: {message}"
        )
        yield _sse("message", {"text": resp.text, "workflow_id": wf_id})
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
        yield _sse("message", {"text": final_text, "workflow_id": wf_id})

    # ── Step 4: Approval gate (if workflow produced a proposal) ──────────────
    if proposal and intent != "ANOMALY_INVESTIGATION":
        yield _sse("approval_required", {
            "workflow_id": wf_id,
            "workflow_type": intent,
            "proposal":    proposal,
        })

    yield _sse("done", {"workflow_id": wf_id})
