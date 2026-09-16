"""Tool registry shared by the Component 1 and Component 3 agents."""

import asyncio
from typing import Any

from google.generativeai.types import Tool

from .inventory import TOOL_DEFINITIONS as INVENTORY_TOOL_DEFINITIONS
from .inventory import TOOL_DISPATCH as INVENTORY_TOOL_DISPATCH
from .sales import (
    COMPONENT3_READ_ONLY_TOOLS,
    TOOL_DEFINITIONS as SALES_TOOL_DEFINITIONS,
    TOOL_DISPATCH as SALES_TOOL_DISPATCH,
)

TOOL_DEFINITIONS = Tool(function_declarations=[
    *INVENTORY_TOOL_DEFINITIONS.function_declarations,
    *SALES_TOOL_DEFINITIONS.function_declarations,
])
TOOL_DISPATCH: dict[str, Any] = {
    **INVENTORY_TOOL_DISPATCH,
    **SALES_TOOL_DISPATCH,
}

async def call_tool(
    name: str,
    args: dict,
    allowed_tools: frozenset[str] | None = None,
) -> Any:
    """Dispatch only explicitly registered tools."""
    if allowed_tools is not None and name not in allowed_tools:
        return {"error": f"Tool '{name}' is not allowed in this workflow."}
    fn = TOOL_DISPATCH.get(name)
    if not fn:
        return {"error": f"Unknown tool: {name}"}
    try:
        if asyncio.iscoroutinefunction(fn):
            return await fn(**args)
        return fn(**args)
    except Exception as exc:
        return {"error": str(exc)}
