"""
tools/__init__.py
─────────────────
Unified tool registry for the AI service.
Exports TOOL_DEFINITIONS, TOOL_DISPATCH, COMPONENT3_READ_ONLY_TOOLS, and call_tool from .demand.
"""

from google.generativeai.types import Tool

from .demand import (
    BACKEND,
    COMPONENT3_READ_ONLY_TOOLS,
    TOOL_DEFINITIONS as DEMAND_TOOL_DEFINITIONS,
    TOOL_DISPATCH,
    call_tool,
    evaluate_purchase_requirement,
    explain_demand_forecast,
    get_all_stock_levels,
    get_demand_forecast,
    get_ingredient_details,
    get_planning_context,
    get_stock_details,
    list_all_ingredients,
    list_all_stocks,
)
from .inventory import (
    TOOL_DEFINITIONS as INVENTORY_TOOL_DEFINITIONS,
    TOOL_DISPATCH as INVENTORY_TOOL_DISPATCH,
)
from .sales import (
    TOOL_DEFINITIONS as SALES_TOOL_DEFINITIONS,
    TOOL_DISPATCH as SALES_TOOL_DISPATCH,
)
from .procurement_compliance import (
    TOOL_DEFINITIONS as PROCUREMENT_TOOL_DEFINITIONS,
    TOOL_DISPATCH as PROCUREMENT_TOOL_DISPATCH,
)

_COMPONENT_TOOL_REGISTRIES = (
    INVENTORY_TOOL_DEFINITIONS,
    SALES_TOOL_DEFINITIONS,
    PROCUREMENT_TOOL_DEFINITIONS,
)
_COMPONENT_TOOL_NAMES = {
    declaration.name
    for registry in _COMPONENT_TOOL_REGISTRIES
    for declaration in registry.function_declarations
}

TOOL_DEFINITIONS = Tool(function_declarations=[
    *(
        declaration
        for declaration in DEMAND_TOOL_DEFINITIONS.function_declarations
        if declaration.name not in _COMPONENT_TOOL_NAMES
    ),
    *(
        declaration
        for registry in _COMPONENT_TOOL_REGISTRIES
        for declaration in registry.function_declarations
    ),
])

for _component_dispatch in (
    INVENTORY_TOOL_DISPATCH,
    SALES_TOOL_DISPATCH,
    PROCUREMENT_TOOL_DISPATCH,
):
    TOOL_DISPATCH.update(_component_dispatch)

__all__ = [
    "BACKEND",
    "COMPONENT3_READ_ONLY_TOOLS",
    "TOOL_DEFINITIONS",
    "TOOL_DISPATCH",
    "call_tool",
    "evaluate_purchase_requirement",
    "explain_demand_forecast",
    "get_all_stock_levels",
    "get_demand_forecast",
    "get_ingredient_details",
    "get_planning_context",
    "get_stock_details",
    "list_all_ingredients",
    "list_all_stocks",
]
