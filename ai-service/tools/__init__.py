"""
tools/__init__.py
─────────────────
Unified tool registry for the AI service.
Exports TOOL_DEFINITIONS, TOOL_DISPATCH, COMPONENT3_READ_ONLY_TOOLS, and call_tool from .demand.
"""

from .demand import (
    BACKEND,
    COMPONENT3_READ_ONLY_TOOLS,
    TOOL_DEFINITIONS,
    TOOL_DISPATCH,
    call_tool,
    get_all_stock_levels,
    get_demand_forecast,
    get_ingredient_details,
    get_stock_details,
    list_all_ingredients,
    list_all_stocks,
)

__all__ = [
    "BACKEND",
    "COMPONENT3_READ_ONLY_TOOLS",
    "TOOL_DEFINITIONS",
    "TOOL_DISPATCH",
    "call_tool",
    "get_all_stock_levels",
    "get_demand_forecast",
    "get_ingredient_details",
    "get_stock_details",
    "list_all_ingredients",
    "list_all_stocks",
]
