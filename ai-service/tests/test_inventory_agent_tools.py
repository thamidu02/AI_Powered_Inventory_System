"""
tests/test_inventory_agent_tools.py
───────────────────────────────────
Comprehensive Unit & Regression Test Suite for Component 1:
Inventory AI Agent & Interactive Guided Workflows Subsystem.

Validates:
1. Guided Workflow Planning & Deterministic UI Schema Validation
2. Target Registry & Allowed Routes Enforcement
3. Core Inventory MCP Tools (Stock Levels, Ingredients, Batches, Horizons)
4. Token Caching, Safe Tool Dispatching & Error Boundary Resilience
"""

from __future__ import annotations

import sys
import unittest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timedelta, timezone

# Mock heavy ML dependencies if running in lightweight testing environments
for _mod in ("joblib", "ml", "ml.model", "sklearn", "pandas", "numpy"):
    if _mod not in sys.modules:
        sys.modules[_mod] = MagicMock()

from tools.guided_workflows import (
    ALLOWED_ROUTES,
    TARGET_REGISTRY,
    WORKFLOW_TEMPLATES,
    get_available_guided_workflows,
    plan_guided_workflow,
    validate_guided_workflow_plan,
)
from tools.inventory import (
    TOOL_DISPATCH,
    call_tool,
    get_all_stock_levels,
    list_all_ingredients,
    get_stock_details,
    get_expiring_batches,
    get_stock_movements,
    _get_token,
    _token_cache,
)


class TestGuidedWorkflowsAgent(unittest.TestCase):
    """Test suite for Interactive Agentic Guided Workflow Planning and Schema Guardrails."""

    def test_get_available_guided_workflows_returns_registered_workflows(self):
        """Verify returning all pre-defined interactive guided workflows with required metadata."""
        result = get_available_guided_workflows()
        self.assertIn("workflows", result)
        self.assertGreaterEqual(result["total"], 3)

        types = [wf["workflow_type"] for wf in result["workflows"]]
        self.assertIn("RECEIVE_STOCK", types)
        self.assertIn("CONSUME_STOCK", types)
        self.assertIn("VIEW_LOW_STOCK", types)

        for wf in result["workflows"]:
            self.assertTrue(len(wf["title"]) > 0)
            self.assertTrue(len(wf["allowed_roles"]) > 0)
            self.assertGreater(wf["total_steps"], 0)

    def test_plan_guided_workflow_maps_receive_intent(self):
        """Verify natural language request for incoming goods resolves to RECEIVE_STOCK plan."""
        result = plan_guided_workflow("I have a new shipment of tomatoes arriving at the loading dock")
        self.assertEqual(result.get("status"), "VALIDATED")
        plan = result["plan"]
        self.assertEqual(plan["workflowType"], "RECEIVE_STOCK")
        self.assertGreater(plan["totalSteps"], 0)

        first_step = plan["steps"][0]
        self.assertIn(first_step["target"], TARGET_REGISTRY)
        self.assertIn(first_step["route"], ALLOWED_ROUTES)

    def test_plan_guided_workflow_maps_consume_intent(self):
        """Verify user intent for dish preparation resolves to CONSUME_STOCK plan."""
        result = plan_guided_workflow("Kitchen prep needs to consume cheese for pizza recipes")
        self.assertEqual(result.get("status"), "VALIDATED")
        plan = result["plan"]
        self.assertEqual(plan["workflowType"], "CONSUME_STOCK")
        self.assertEqual(plan["steps"][0]["target"], "nav-inventory")

    def test_plan_guided_workflow_maps_low_stock_intent(self):
        """Verify queries regarding depleted ingredients map to VIEW_LOW_STOCK plan."""
        result = plan_guided_workflow("Show me all out of stock ingredients that need immediate reorder")
        self.assertEqual(result.get("status"), "VALIDATED")
        self.assertEqual(result["plan"]["workflowType"], "VIEW_LOW_STOCK")

    def test_plan_guided_workflow_explicit_type_takes_precedence(self):
        """Verify passing explicit workflow_type override takes precedence over ambiguous description."""
        result = plan_guided_workflow("Arbitrary user text", workflow_type="CONSUME_STOCK")
        self.assertEqual(result.get("status"), "VALIDATED")
        self.assertEqual(result["plan"]["workflowType"], "CONSUME_STOCK")

    def test_validate_guided_workflow_plan_accepts_valid_schema(self):
        """Verify schema validation passes for structurally valid plans using allow-listed targets."""
        valid_plan = {
            "steps": [
                {"stepNumber": 1, "route": "/inventory", "target": "nav-inventory"},
                {"stepNumber": 2, "route": "/inventory", "target": "receive-stock-button"},
            ]
        }
        validation = validate_guided_workflow_plan(valid_plan)
        self.assertTrue(validation["valid"])
        self.assertEqual(validation["step_count"], 2)

    def test_validate_guided_workflow_plan_rejects_unregistered_target(self):
        """Deterministic safety: reject plans referencing unapproved DOM target IDs."""
        invalid_plan = {
            "steps": [
                {"stepNumber": 1, "route": "/inventory", "target": "malicious-script-injection-button"}
            ]
        }
        validation = validate_guided_workflow_plan(invalid_plan)
        self.assertFalse(validation["valid"])
        self.assertIn("not registered in TARGET_REGISTRY", validation["error"])

    def test_validate_guided_workflow_plan_rejects_disallowed_route(self):
        """Deterministic safety: reject plans directing user to unapproved routes."""
        invalid_plan = {
            "steps": [
                {"stepNumber": 1, "route": "/admin/danger-zone", "target": "nav-inventory"}
            ]
        }
        validation = validate_guided_workflow_plan(invalid_plan)
        self.assertFalse(validation["valid"])
        self.assertIn("not in ALLOWED_ROUTES", validation["error"])

    def test_validate_guided_workflow_plan_rejects_empty_steps(self):
        """Verify validation rejects malformed plans missing step arrays."""
        self.assertFalse(validate_guided_workflow_plan({})["valid"])
        self.assertFalse(validate_guided_workflow_plan({"steps": []})["valid"])
        self.assertFalse(validate_guided_workflow_plan("not-a-dict")["valid"])


class TestInventoryAgentTools(unittest.IsolatedAsyncioTestCase):
    """Test suite for Inventory AI Agent Tools wrapping the ASP.NET Core REST API."""

    @patch("tools.inventory._get")
    async def test_get_all_stock_levels_aggregates_and_flags_low_stock(self, mock_get):
        """Verify get_all_stock_levels correctly calculates deficits and low-stock counts."""
        mock_get.return_value = [
            {
                "ingredientId": "ing-1",
                "ingredientName": "Whole Milk",
                "unit": "L",
                "currentStock": 8,
                "minimumStockLevel": 15,
                "maximumStockLevel": 50,
                "isLowStock": True,
            },
            {
                "ingredientId": "ing-2",
                "ingredientName": "Flour",
                "unit": "kg",
                "currentStock": 35,
                "minimumStockLevel": 10,
                "maximumStockLevel": 100,
                "isLowStock": False,
            }
        ]

        result = await get_all_stock_levels()
        self.assertEqual(result["total"], 2)
        self.assertEqual(result["low_stock_count"], 1)

        milk = next(item for item in result["items"] if item["ingredient_id"] == "ing-1")
        self.assertTrue(milk["is_low"])
        self.assertEqual(milk["deficit"], 7)  # 15 - 8 = 7

        flour = next(item for item in result["items"] if item["ingredient_id"] == "ing-2")
        self.assertFalse(flour["is_low"])
        self.assertEqual(flour["deficit"], 0)

    @patch("tools.inventory._get")
    async def test_list_all_ingredients_filters_category_and_search(self, mock_get):
        """Verify list_all_ingredients filtering by category, search substring, and low stock."""
        async def mock_endpoint(path, params=None):
            if path == "/api/ingredients":
                return [
                    {"id": "ing-1", "name": "Cheddar Cheese", "categoryName": "Dairy", "unit": "kg"},
                    {"id": "ing-2", "name": "Roma Tomatoes", "categoryName": "Produce", "unit": "kg"},
                    {"id": "ing-3", "name": "Whole Milk", "categoryName": "Dairy", "unit": "L"},
                ]
            if path == "/api/inventory":
                return [
                    {"ingredientId": "ing-1", "currentStock": 12, "minimumStockLevel": 10, "isLowStock": False},
                    {"ingredientId": "ing-2", "currentStock": 4, "minimumStockLevel": 15, "isLowStock": True},
                    {"ingredientId": "ing-3", "currentStock": 5, "minimumStockLevel": 10, "isLowStock": True},
                ]
            return []

        mock_get.side_effect = mock_endpoint

        # Filter category = Dairy
        dairy = await list_all_ingredients(category="Dairy")
        self.assertEqual(dairy["total_count"], 2)
        self.assertTrue(all(item["category"] == "Dairy" for item in dairy["ingredients"]))

        # Filter search = "Tomatoes"
        produce = await list_all_ingredients(search="Tomatoes")
        self.assertEqual(produce["total_count"], 1)
        self.assertEqual(produce["ingredients"][0]["name"], "Roma Tomatoes")

        # Filter low_stock_only = True
        low_stock = await list_all_ingredients(low_stock_only=True)
        self.assertEqual(low_stock["total_count"], 2)

    @patch("tools.inventory._get")
    async def test_get_expiring_batches_within_horizon(self, mock_get):
        """Verify get_expiring_batches captures batches expiring within horizon."""
        mock_get.return_value = [
            {
                "ingredientId": "ing-dairy",
                "ingredientName": "Heavy Cream",
                "batchNumber": "BATCH-EXP-SOON",
                "quantity": 10,
                "expiryDate": "2026-10-10T12:00:00Z",
                "daysUntilExpiry": 3,
                "storageLocationName": "Cold Room A",
            }
        ]

        # 7-day horizon call
        res = await get_expiring_batches(days_ahead=7)
        mock_get.assert_awaited_once_with("/api/inventory/expiring", {"days": 7})
        self.assertEqual(res["count"], 1)
        self.assertEqual(res["expiring_batches"][0]["batch_number"], "BATCH-EXP-SOON")
        self.assertEqual(res["days_ahead"], 7)

    @patch("tools.inventory.list_all_stocks")
    @patch("tools.inventory._get")
    async def test_get_stock_details_matches_by_id_and_case_insensitive_name(self, mock_get, mock_stocks):
        """Verify get_stock_details resolves items by UUID or case-insensitive ingredient name."""
        mock_stocks.return_value = {
            "stocks": [
                {"ingredient_id": "1111-2222-3333", "name": "Extra Virgin Olive Oil", "sku": "OIL-01", "current_stock": 18},
                {"ingredient_id": "4444-5555-6666", "name": "Basmati Rice", "sku": "GRN-02", "current_stock": 60},
            ]
        }
        mock_get.return_value = []

        # By UUID
        res_id = await get_stock_details("1111-2222-3333")
        self.assertNotIn("error", res_id)
        self.assertEqual(res_id["name"], "Extra Virgin Olive Oil")

        # By Name (mixed case)
        res_name = await get_stock_details("basmati rice")
        self.assertNotIn("error", res_name)
        self.assertEqual(res_name["ingredient_id"], "4444-5555-6666")

        # Not found
        res_missing = await get_stock_details("Non-Existent Ingredient")
        self.assertIn("error", res_missing)

    @patch("tools.inventory._get")
    async def test_get_stock_movements_filters_by_cutoff_window(self, mock_get):
        """Verify get_stock_movements filters movements according to requested temporal window."""
        now = datetime.utcnow()
        recent_date = (now - timedelta(days=5)).isoformat()
        old_date = (now - timedelta(days=45)).isoformat()

        mock_get.return_value = [
            {"movementType": "RECEIVE", "quantity": 20, "createdAt": recent_date},
            {"movementType": "CONSUME", "quantity": -5, "createdAt": old_date},
        ]

        # 30-day window should include recent_date (5 days ago) and exclude old_date (45 days ago)
        res = await get_stock_movements("ing-1", days=30)
        mock_get.assert_awaited_once_with("/api/inventory/movements", {"ingredientId": "ing-1"})
        self.assertEqual(len(res["movements"]), 1)
        self.assertEqual(res["movements"][0]["quantity"], 20)

    @patch("tools.inventory.httpx.AsyncClient")
    async def test_token_cache_avoids_redundant_login(self, mock_client_cls):
        """Verify in-memory token cache prevents repeated HTTP POST authentication round-trips."""
        _token_cache["token"] = None
        _token_cache["expires_at"] = None

        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "token": "cached-test-bearer-token-12345",
            "expiresAt": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
        }
        mock_client.post.return_value = mock_resp

        # First retrieval should invoke HTTP POST
        token1 = await _get_token()
        self.assertEqual(token1, "cached-test-bearer-token-12345")
        self.assertEqual(mock_client.post.await_count, 1)

        # Immediate second retrieval must use memory cache without calling HTTP POST
        token2 = await _get_token()
        self.assertEqual(token2, "cached-test-bearer-token-12345")
        self.assertEqual(mock_client.post.await_count, 1)

    async def test_call_tool_dispatcher_and_safety_boundaries(self):
        """Verify tool execution router validates allow-lists and reports unknown tool errors."""
        # Safe execution of registered tool
        result = await call_tool("get_available_guided_workflows", {})
        self.assertIn("workflows", result)

        # Execution of unregistered tool name
        err = await call_tool("execute_arbitrary_shell_command", {})
        self.assertIn("error", err)
        self.assertIn("Unknown tool", err["error"])

        # Execution blocked by explicit allow-list
        restricted = await call_tool(
            "get_available_guided_workflows",
            {},
            allowed_tools=frozenset(["get_all_stock_levels"]),
        )
        self.assertIn("error", restricted)
        self.assertIn("not allowed in this workflow", restricted["error"])


if __name__ == "__main__":
    unittest.main()
