"""
tools/guided_workflows.py
─────────────────────────
Agentic UI Navigation and Guided Workflow Planning Module.
Provides verified workflow templates, target element allow-list registry,
and schema validation for in-app interactive UI guidance.
"""

from __future__ import annotations
import uuid
from typing import Any

# ─── Allowed Routes & Tabs ──────────────────────────────────────────────────

ALLOWED_ROUTES = [
    "/inventory",
    "/operations",
    "/masterData",
    "/menuRecipes",
    "/salesWaste",
    "/procurement",
    "/planning",
    "/kitchenOrder",
    "/aiAssistant",
]

# ─── UI Target Element Registry ──────────────────────────────────────────────

TARGET_REGISTRY: dict[str, dict[str, Any]] = {
    # Navigation
    "nav-inventory": {
        "route": "/inventory",
        "tab": "inventory",
        "description": "Stock & Batches navigation tab",
        "allowedRoles": ["SYSTEM_ADMIN", "RESTAURANT_MANAGER", "INVENTORY_MANAGER", "PROCUREMENT_OFFICER", "SALES_KITCHEN_STAFF"],
    },
    "nav-operations": {
        "route": "/operations",
        "tab": "operations",
        "description": "Operations Hub navigation tab",
        "allowedRoles": ["SYSTEM_ADMIN", "RESTAURANT_MANAGER", "INVENTORY_MANAGER", "SALES_KITCHEN_STAFF"],
    },
    "nav-master-catalog": {
        "route": "/masterData",
        "tab": "masterData",
        "description": "Master Catalog navigation tab",
        "allowedRoles": ["SYSTEM_ADMIN", "RESTAURANT_MANAGER", "INVENTORY_MANAGER"],
    },
    "nav-procurement": {
        "route": "/procurement",
        "tab": "procurement",
        "description": "Procurement & Suppliers navigation tab",
        "allowedRoles": ["SYSTEM_ADMIN", "RESTAURANT_MANAGER", "PROCUREMENT_OFFICER"],
    },
    "nav-planning": {
        "route": "/planning",
        "tab": "planning",
        "description": "Demand & Planning navigation tab",
        "allowedRoles": ["SYSTEM_ADMIN", "RESTAURANT_MANAGER", "INVENTORY_MANAGER", "PROCUREMENT_OFFICER"],
    },
    "nav-kitchen-order": {
        "route": "/kitchenOrder",
        "tab": "kitchenOrder",
        "description": "Kitchen Orders navigation tab",
        "allowedRoles": ["SYSTEM_ADMIN", "RESTAURANT_MANAGER", "SALES_KITCHEN_STAFF"],
    },
    "nav-ai-assistant": {
        "route": "/aiAssistant",
        "tab": "aiAssistant",
        "description": "AI Assistant chat navigation tab",
        "allowedRoles": ["INVENTORY_MANAGER"],
    },

    # Inventory View Action Controls
    "receive-stock-button": {
        "route": "/inventory",
        "tab": "inventory",
        "description": "Receive Inward Stock button (opens receipt modal)",
        "allowedRoles": ["SYSTEM_ADMIN", "RESTAURANT_MANAGER", "INVENTORY_MANAGER"],
    },
    "consume-stock-button": {
        "route": "/inventory",
        "tab": "inventory",
        "description": "Consume Stock (FEFO) button (opens consumption modal)",
        "allowedRoles": ["SYSTEM_ADMIN", "RESTAURANT_MANAGER", "INVENTORY_MANAGER", "SALES_KITCHEN_STAFF"],
    },
    "filter-low-stock-button": {
        "route": "/inventory",
        "tab": "inventory",
        "description": "Toggle Low & Out of Stock Filter button",
        "allowedRoles": ["SYSTEM_ADMIN", "RESTAURANT_MANAGER", "INVENTORY_MANAGER", "PROCUREMENT_OFFICER", "SALES_KITCHEN_STAFF"],
    },
    "inventory-search-input": {
        "route": "/inventory",
        "tab": "inventory",
        "description": "Ingredient search input box",
        "allowedRoles": ["SYSTEM_ADMIN", "RESTAURANT_MANAGER", "INVENTORY_MANAGER", "PROCUREMENT_OFFICER", "SALES_KITCHEN_STAFF"],
    },
    "inventory-table": {
        "route": "/inventory",
        "tab": "inventory",
        "description": "Inventory stock items table",
        "allowedRoles": ["SYSTEM_ADMIN", "RESTAURANT_MANAGER", "INVENTORY_MANAGER", "PROCUREMENT_OFFICER", "SALES_KITCHEN_STAFF"],
    },

    # Operations Hub Action Cards
    "ops-receive-button": {
        "route": "/operations",
        "tab": "operations",
        "description": "Receive Inward Stock form launcher in Operations Hub",
        "allowedRoles": ["SYSTEM_ADMIN", "RESTAURANT_MANAGER", "INVENTORY_MANAGER"],
    },
    "ops-consume-button": {
        "route": "/operations",
        "tab": "operations",
        "description": "FEFO Consume launcher in Operations Hub",
        "allowedRoles": ["SYSTEM_ADMIN", "RESTAURANT_MANAGER", "INVENTORY_MANAGER", "SALES_KITCHEN_STAFF"],
    },
    "ops-waste-button": {
        "route": "/operations",
        "tab": "operations",
        "description": "Record Waste launcher in Operations Hub",
        "allowedRoles": ["SYSTEM_ADMIN", "RESTAURANT_MANAGER", "INVENTORY_MANAGER", "SALES_KITCHEN_STAFF"],
    },
    "ops-adjust-button": {
        "route": "/operations",
        "tab": "operations",
        "description": "Stock Discrepancy Adjustment launcher in Operations Hub",
        "allowedRoles": ["SYSTEM_ADMIN", "RESTAURANT_MANAGER", "INVENTORY_MANAGER"],
    },

    # Receive Stock Modal Form Fields
    "receive-ingredient-select": {
        "route": "/inventory",
        "tab": "inventory",
        "description": "Select incoming ingredient dropdown",
        "allowedRoles": ["SYSTEM_ADMIN", "RESTAURANT_MANAGER", "INVENTORY_MANAGER"],
    },
    "receive-location-select": {
        "route": "/inventory",
        "tab": "inventory",
        "description": "Storage location selector dropdown",
        "allowedRoles": ["SYSTEM_ADMIN", "RESTAURANT_MANAGER", "INVENTORY_MANAGER"],
    },
    "receive-batch-input": {
        "route": "/inventory",
        "tab": "inventory",
        "description": "Lot / Batch number input field",
        "allowedRoles": ["SYSTEM_ADMIN", "RESTAURANT_MANAGER", "INVENTORY_MANAGER"],
    },
    "receive-quantity-input": {
        "route": "/inventory",
        "tab": "inventory",
        "description": "Received stock quantity input",
        "allowedRoles": ["SYSTEM_ADMIN", "RESTAURANT_MANAGER", "INVENTORY_MANAGER"],
    },
    "receive-unit-cost-input": {
        "route": "/inventory",
        "tab": "inventory",
        "description": "Unit purchase price ($) input",
        "allowedRoles": ["SYSTEM_ADMIN", "RESTAURANT_MANAGER", "INVENTORY_MANAGER"],
    },
    "receive-expiry-input": {
        "route": "/inventory",
        "tab": "inventory",
        "description": "Batch expiration date picker",
        "allowedRoles": ["SYSTEM_ADMIN", "RESTAURANT_MANAGER", "INVENTORY_MANAGER"],
    },
    "receive-submit-button": {
        "route": "/inventory",
        "tab": "inventory",
        "description": "Submit Receive Stock button",
        "allowedRoles": ["SYSTEM_ADMIN", "RESTAURANT_MANAGER", "INVENTORY_MANAGER"],
    },

    # Consume Stock Modal Form Fields
    "consume-ingredient-select": {
        "route": "/inventory",
        "tab": "inventory",
        "description": "Select ingredient to consume",
        "allowedRoles": ["SYSTEM_ADMIN", "RESTAURANT_MANAGER", "INVENTORY_MANAGER", "SALES_KITCHEN_STAFF"],
    },
    "consume-quantity-input": {
        "route": "/inventory",
        "tab": "inventory",
        "description": "Quantity to consume input",
        "allowedRoles": ["SYSTEM_ADMIN", "RESTAURANT_MANAGER", "INVENTORY_MANAGER", "SALES_KITCHEN_STAFF"],
    },
    "consume-reason-input": {
        "route": "/inventory",
        "tab": "inventory",
        "description": "Consumption reason input",
        "allowedRoles": ["SYSTEM_ADMIN", "RESTAURANT_MANAGER", "INVENTORY_MANAGER", "SALES_KITCHEN_STAFF"],
    },
    "consume-submit-button": {
        "route": "/inventory",
        "tab": "inventory",
        "description": "Confirm FEFO Consumption button",
        "allowedRoles": ["SYSTEM_ADMIN", "RESTAURANT_MANAGER", "INVENTORY_MANAGER", "SALES_KITCHEN_STAFF"],
    },
}

# ─── Predefined Workflow Templates ──────────────────────────────────────────

WORKFLOW_TEMPLATES: dict[str, dict[str, Any]] = {
    "RECEIVE_STOCK": {
        "workflowType": "RECEIVE_STOCK",
        "title": "Receive Inward Stock Batch",
        "description": "Step-by-step guidance for recording an incoming shipment, assigning a batch number, and setting storage location and expiration date.",
        "allowedRoles": ["SYSTEM_ADMIN", "RESTAURANT_MANAGER", "INVENTORY_MANAGER"],
        "steps": [
            {
                "stepNumber": 1,
                "action": "NAVIGATE",
                "route": "/inventory",
                "tab": "inventory",
                "target": "nav-inventory",
                "instruction": "Open the Stock & Batches inventory page.",
                "waitForUserAction": True,
            },
            {
                "stepNumber": 2,
                "action": "CLICK",
                "route": "/inventory",
                "tab": "inventory",
                "target": "receive-stock-button",
                "instruction": "Click 'Receive Stock' to open the incoming shipment receiving form.",
                "waitForUserAction": True,
            },
            {
                "stepNumber": 3,
                "action": "SELECT",
                "route": "/inventory",
                "tab": "inventory",
                "target": "receive-ingredient-select",
                "instruction": "Select the ingredient you are receiving from the dropdown list.",
                "waitForUserAction": True,
            },
            {
                "stepNumber": 4,
                "action": "SELECT",
                "route": "/inventory",
                "tab": "inventory",
                "target": "receive-location-select",
                "instruction": "Choose the appropriate storage location (e.g., Cold Storage or Freezer).",
                "waitForUserAction": True,
            },
            {
                "stepNumber": 5,
                "action": "INPUT",
                "route": "/inventory",
                "tab": "inventory",
                "target": "receive-batch-input",
                "instruction": "Verify or enter the unique supplier Lot/Batch number.",
                "waitForUserAction": True,
            },
            {
                "stepNumber": 6,
                "action": "INPUT",
                "route": "/inventory",
                "tab": "inventory",
                "target": "receive-quantity-input",
                "instruction": "Enter the quantity of units received.",
                "waitForUserAction": True,
            },
            {
                "stepNumber": 7,
                "action": "INPUT",
                "route": "/inventory",
                "tab": "inventory",
                "target": "receive-unit-cost-input",
                "instruction": "Enter the unit cost per package or unit.",
                "waitForUserAction": True,
            },
            {
                "stepNumber": 8,
                "action": "INPUT",
                "route": "/inventory",
                "tab": "inventory",
                "target": "receive-expiry-input",
                "instruction": "Set the batch expiration date for FEFO stock rotation tracking.",
                "waitForUserAction": True,
            },
            {
                "stepNumber": 9,
                "action": "SUBMIT",
                "route": "/inventory",
                "tab": "inventory",
                "target": "receive-submit-button",
                "instruction": "Review the details and click 'Receive Stock' to record the inventory batch.",
                "waitForUserAction": True,
            },
        ],
    },

    "CONSUME_STOCK": {
        "workflowType": "CONSUME_STOCK",
        "title": "Consume Stock via FEFO",
        "description": "Guides you through recording ingredient consumption using First-Expired, First-Out (FEFO) automated allocation.",
        "allowedRoles": ["SYSTEM_ADMIN", "RESTAURANT_MANAGER", "INVENTORY_MANAGER", "SALES_KITCHEN_STAFF"],
        "steps": [
            {
                "stepNumber": 1,
                "action": "NAVIGATE",
                "route": "/inventory",
                "tab": "inventory",
                "target": "nav-inventory",
                "instruction": "Open the Stock & Batches page.",
                "waitForUserAction": True,
            },
            {
                "stepNumber": 2,
                "action": "CLICK",
                "route": "/inventory",
                "tab": "inventory",
                "target": "consume-stock-button",
                "instruction": "Click 'Consume Stock (FEFO)' to open the kitchen prep consumption dialog.",
                "waitForUserAction": True,
            },
            {
                "stepNumber": 3,
                "action": "SELECT",
                "route": "/inventory",
                "tab": "inventory",
                "target": "consume-ingredient-select",
                "instruction": "Select the ingredient needed for meal preparation.",
                "waitForUserAction": True,
            },
            {
                "stepNumber": 4,
                "action": "INPUT",
                "route": "/inventory",
                "tab": "inventory",
                "target": "consume-quantity-input",
                "instruction": "Enter the quantity consumed.",
                "waitForUserAction": True,
            },
            {
                "stepNumber": 5,
                "action": "INPUT",
                "route": "/inventory",
                "tab": "inventory",
                "target": "consume-reason-input",
                "instruction": "Enter the operational reason (e.g. Lunch Service or Prep).",
                "waitForUserAction": True,
            },
            {
                "stepNumber": 6,
                "action": "SUBMIT",
                "route": "/inventory",
                "tab": "inventory",
                "target": "consume-submit-button",
                "instruction": "Click 'Consume Stock' to finalize. The backend will automatically deplete earliest-expiring batches first.",
                "waitForUserAction": True,
            },
        ],
    },

    "VIEW_LOW_STOCK": {
        "workflowType": "VIEW_LOW_STOCK",
        "title": "Inspect Low Stock & Reorder Alerts",
        "description": "Shows you how to identify ingredients operating below safety thresholds.",
        "allowedRoles": ["SYSTEM_ADMIN", "RESTAURANT_MANAGER", "INVENTORY_MANAGER", "PROCUREMENT_OFFICER", "SALES_KITCHEN_STAFF"],
        "steps": [
            {
                "stepNumber": 1,
                "action": "NAVIGATE",
                "route": "/inventory",
                "tab": "inventory",
                "target": "nav-inventory",
                "instruction": "Open the Stock & Batches page.",
                "waitForUserAction": True,
            },
            {
                "stepNumber": 2,
                "action": "CLICK",
                "route": "/inventory",
                "tab": "inventory",
                "target": "filter-low-stock-button",
                "instruction": "Click the 'Low / Out of Stock' filter toggle button to isolate items requiring attention.",
                "waitForUserAction": True,
            },
            {
                "stepNumber": 3,
                "action": "HIGHLIGHT",
                "route": "/inventory",
                "tab": "inventory",
                "target": "inventory-table",
                "instruction": "Review the items displayed in red or amber badges showing current stock vs minimum safety thresholds.",
                "waitForUserAction": True,
            },
        ],
    },
}


# ─── Tool Functions ──────────────────────────────────────────────────────────

def get_available_guided_workflows() -> dict:
    """Return all registered interactive guided workflows available in the system."""
    workflows = []
    for wf in WORKFLOW_TEMPLATES.values():
        workflows.append({
            "workflow_type": wf["workflowType"],
            "title":         wf["title"],
            "description":   wf["description"],
            "total_steps":   len(wf["steps"]),
            "allowed_roles": wf["allowedRoles"],
        })
    return {"workflows": workflows, "total": len(workflows)}


def plan_guided_workflow(task_description: str, workflow_type: str | None = None) -> dict:
    """
    Generate or retrieve a validated structured UI guided workflow plan based on user intent.
    Validates targets against TARGET_REGISTRY and routes against ALLOWED_ROUTES.
    """
    # Intent mapping
    key = (workflow_type or "").strip().upper()
    if not key or key not in WORKFLOW_TEMPLATES:
        desc = task_description.lower()
        if any(w in desc for w in ["receive", "receipt", "incoming", "shipment", "inward", "new batch"]):
            key = "RECEIVE_STOCK"
        elif any(w in desc for w in ["consume", "fefo", "usage", "prep", "kitchen use"]):
            key = "CONSUME_STOCK"
        elif any(w in desc for w in ["low stock", "reorder", "alert", "depleted", "out of stock"]):
            key = "VIEW_LOW_STOCK"
        else:
            key = "RECEIVE_STOCK"  # Default primary workflow

    template = WORKFLOW_TEMPLATES.get(key)
    if not template:
        return {"error": f"Unknown workflow type: {workflow_type}"}

    workflow_id = str(uuid.uuid4())

    # Build validated plan
    validated_steps = []
    for step in template["steps"]:
        target_id = step["target"]
        if target_id not in TARGET_REGISTRY:
            return {"error": f"Invalid UI target in step {step['stepNumber']}: '{target_id}' is not in registry."}

        target_info = TARGET_REGISTRY[target_id]
        route = step.get("route", target_info["route"])
        if route not in ALLOWED_ROUTES:
            return {"error": f"Invalid route in step {step['stepNumber']}: '{route}' is not allowed."}

        validated_steps.append({
            "stepNumber":        step["stepNumber"],
            "action":            step["action"],
            "route":             route,
            "tab":               step.get("tab", target_info.get("tab", "inventory")),
            "target":            target_id,
            "instruction":       step["instruction"],
            "waitForUserAction": step.get("waitForUserAction", True),
            "targetDescription": target_info.get("description", ""),
        })

    plan = {
        "workflowId":   workflow_id,
        "workflowType": template["workflowType"],
        "title":        template["title"],
        "description":  template["description"],
        "allowedRoles": template["allowedRoles"],
        "totalSteps":   len(validated_steps),
        "steps":        validated_steps,
    }

    return {"plan": plan, "status": "VALIDATED"}


def validate_guided_workflow_plan(plan: dict) -> dict:
    """Validate a client-provided or LLM-generated plan against route allowlist and target registry."""
    if not isinstance(plan, dict):
        return {"valid": False, "error": "Plan must be a JSON object."}

    steps = plan.get("steps")
    if not isinstance(steps, list) or len(steps) == 0:
        return {"valid": False, "error": "Plan must contain a non-empty 'steps' array."}

    for idx, s in enumerate(steps, 1):
        target = s.get("target")
        if not target or target not in TARGET_REGISTRY:
            return {"valid": False, "error": f"Step {idx} target '{target}' is not registered in TARGET_REGISTRY."}

        route = s.get("route")
        if not route or route not in ALLOWED_ROUTES:
            return {"valid": False, "error": f"Step {idx} route '{route}' is not in ALLOWED_ROUTES."}

    return {"valid": True, "step_count": len(steps)}
