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
from typing import AsyncIterator, Any

import google.generativeai as genai
from google.api_core.exceptions import ResourceExhausted, ServiceUnavailable
from tools import TOOL_DEFINITIONS, call_tool

# ─── System prompts per workflow stage ───────────────────────────────────────

INTENT_SYSTEM = """
You are an inventory AI assistant for a restaurant. Classify the user's intent into ONE of:
  LOW_STOCK_REPLENISHMENT   — user wants to check/reorder low stock
  ANOMALY_INVESTIGATION     — user suspects missing stock or discrepancy
  INVENTORY_OPTIMIZATION    — user wants to review/improve reorder levels
  EMERGENCY_SHORTAGE        — urgent stock shortage needing immediate action
  GENERAL_QUERY             — anything else (answer from context, no tools needed)

Respond with ONLY the intent label (no explanation).
"""

WORKFLOW_SYSTEMS = {
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
        model_name="gemini-3.5-flash-lite",
        system_instruction=INTENT_SYSTEM,
    )
    intent_response = intent_model.generate_content(message)
    intent = intent_response.text.strip().upper()

    # Guard unknown intents
    if intent not in WORKFLOW_SYSTEMS:
        intent = "GENERAL_QUERY"

    yield _sse("intent", {"intent": intent, "workflow_id": wf_id})

    if intent == "GENERAL_QUERY":
        yield _sse("thinking", {"text": "Answering your query…"})
        general_model = genai.GenerativeModel("gemini-3.5-flash-lite")
        resp = general_model.generate_content(
            f"You are an inventory management assistant. Answer concisely: {message}"
        )
        yield _sse("message", {"text": resp.text, "workflow_id": wf_id})
        yield _sse("done", {"workflow_id": wf_id})
        return

    # ── Step 2: Run the workflow agent (multi-turn function calling) ──────────
    system = WORKFLOW_SYSTEMS[intent]
    model  = genai.GenerativeModel(
        model_name="gemini-3.5-flash-lite",
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
                tool_result = await call_tool(tool_name, tool_args)

                yield _sse("tool_result", {
                    "step":   step_number,
                    "tool":   tool_name,
                    "output": tool_result,
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
