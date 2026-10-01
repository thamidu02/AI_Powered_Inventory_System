"""
tests/test_demand_agentic_planning.py
─────────────────────────────────────
Unit tests for Component 4 Demand Forecasting & Planning Agentic AI Integration:
- Intent detection for natural-language planning queries & quick actions
- evaluate_purchase_requirement calculation and comparison logic
- get_planning_context aggregation
- explain_demand_forecast explanations
- Tool registrations and exports
"""

import asyncio
import unittest
from unittest.mock import AsyncMock, patch

import agent
from tools import (
    TOOL_DEFINITIONS,
    TOOL_DISPATCH,
    evaluate_purchase_requirement,
    explain_demand_forecast,
    get_planning_context,
)


class DemandAgenticPlanningIntentTests(unittest.TestCase):
    def test_demand_intent_detection(self):
        cases = [
            ("Do we need to purchase 90 kg of chicken for next week?", "DEMAND_FORECAST_AND_PLANNING"),
            ("How much chicken will we need next week?", "DEMAND_FORECAST_AND_PLANNING"),
            ("Which ingredients are likely to run short next week?", "DEMAND_FORECAST_AND_PLANNING"),
            ("Should I increase the purchase quantity for chicken?", "DEMAND_FORECAST_AND_PLANNING"),
            ("What ingredients should I purchase for next week based on predicted demand?", "DEMAND_FORECAST_AND_PLANNING"),
            ("Check next week demand", "DEMAND_FORECAST_AND_PLANNING"),
            ("Analyze demand forecasts and current stock levels", "DEMAND_FORECAST_AND_PLANNING"),
            ("Explain forecast for chicken breast", "DEMAND_FORECAST_AND_PLANNING"),
            ("Why is chicken demand expected to increase?", "DEMAND_FORECAST_AND_PLANNING"),
        ]
        for query, expected in cases:
            detected = next((d(query) for d in agent.PRIORITY_INTENT_DETECTORS if d(query)), None)
            self.assertEqual(detected, expected, f"Query '{query}' expected '{expected}' but got '{detected}'")

    def test_other_intents_preserved(self):
        cases = [
            ("Audit PO-102", "PROCUREMENT_COMPLIANCE_INVESTIGATION"),
            ("Check duplicate PRs", "PROCUREMENT_COMPLIANCE_INVESTIGATION"),
            ("Analyze recorded sales for the last 30 days", "SALES_CONSUMPTION_WASTE"),
            ("Emergency shortage of tomatoes", "EMERGENCY_SHORTAGE"),
            ("Investigate stock discrepancy on beef", "ANOMALY_INVESTIGATION"),
            ("Optimize reorder levels", "INVENTORY_OPTIMIZATION"),
        ]
        for query, expected in cases:
            detected = next((d(query) for d in agent.PRIORITY_INTENT_DETECTORS if d(query)), None)
            self.assertEqual(detected, expected, f"Query '{query}' expected '{expected}' but got '{detected}'")


class DemandAgenticToolsTests(unittest.TestCase):
    def test_tool_registry_contains_demand_tools(self):
        registered_names = {d.name for d in TOOL_DEFINITIONS.function_declarations}
        expected_tools = {
            "get_demand_forecast",
            "evaluate_purchase_requirement",
            "get_planning_context",
            "explain_demand_forecast",
            "train_demand_model",
            "evaluate_demand_model",
        }
        for tool in expected_tools:
            self.assertIn(tool, registered_names, f"Tool '{tool}' missing from TOOL_DEFINITIONS")
            self.assertIn(tool, TOOL_DISPATCH, f"Tool '{tool}' missing from TOOL_DISPATCH")

    def test_evaluate_purchase_requirement_surplus(self):
        mock_details = {
            "ingredient_id": "ing-1",
            "name": "Chicken Breast",
            "unit": "kg",
            "current_stock": 15.0,
            "minimum_stock": 20.0,
            "maximum_stock": 120.0,
        }
        mock_forecast = {
            "ingredientId": "ing-1",
            "weeklyForecast": 82.0,
            "dailyAverageDemand": 11.71,
            "predictionSource": "ML_MODEL",
        }

        with patch("tools.demand.get_ingredient_details", new=AsyncMock(return_value=mock_details)), \
             patch("tools.demand.get_demand_forecast", new=AsyncMock(return_value=mock_forecast)):
            
            # User asks: "Do we need to purchase 90 kg of chicken for next week?"
            # Predicted: 82 kg, Min stock: 20 kg, Current: 15 kg -> Net required: 82 + 20 - 15 = 87 kg
            # Proposed: 90 kg -> Surplus of 3 kg
            result = asyncio.run(evaluate_purchase_requirement("Chicken Breast", 90.0, period_days=7))

            self.assertEqual(result["ingredient_name"], "Chicken Breast")
            self.assertEqual(result["predicted_demand"], 82.0)
            self.assertEqual(result["current_stock"], 15.0)
            self.assertEqual(result["net_required_quantity"], 87.0)
            self.assertEqual(result["proposed_quantity"], 90.0)
            self.assertEqual(result["quantity_variance"], 3.0)
            self.assertEqual(result["verdict"], "SURPLUS_ORDER")
            self.assertEqual(result["recommended_purchase_quantity"], 87.0)

    def test_evaluate_purchase_requirement_deficit(self):
        mock_details = {
            "ingredient_id": "ing-1",
            "name": "Chicken Breast",
            "unit": "kg",
            "current_stock": 10.0,
            "minimum_stock": 20.0,
            "maximum_stock": 150.0,
        }
        mock_forecast = {
            "ingredientId": "ing-1",
            "weeklyForecast": 80.0,
            "dailyAverageDemand": 11.43,
            "predictionSource": "ML_MODEL",
        }

        with patch("tools.demand.get_ingredient_details", new=AsyncMock(return_value=mock_details)), \
             patch("tools.demand.get_demand_forecast", new=AsyncMock(return_value=mock_forecast)):
            
            # Net required: 80 + 20 - 10 = 90 kg. Proposed: 50 kg -> Deficit of 40 kg
            result = asyncio.run(evaluate_purchase_requirement("Chicken Breast", 50.0, period_days=7))

            self.assertEqual(result["net_required_quantity"], 90.0)
            self.assertEqual(result["proposed_quantity"], 50.0)
            self.assertEqual(result["verdict"], "DEFICIT_ORDER")

    def test_get_planning_context(self):
        mock_ingredients = {
            "ingredients": [
                {
                    "ingredient_id": "ing-1",
                    "name": "Chicken Breast",
                    "sku": "CHK-001",
                    "category": "Meat",
                    "unit": "kg",
                    "current_stock": 5.0,
                    "minimum_stock": 20.0,
                    "maximum_stock": 100.0,
                },
                {
                    "ingredient_id": "ing-2",
                    "name": "Rice",
                    "sku": "RIC-001",
                    "category": "Grains",
                    "unit": "kg",
                    "current_stock": 80.0,
                    "minimum_stock": 30.0,
                    "maximum_stock": 100.0,
                }
            ]
        }
        mock_forecasts = {
            "forecasts": [
                {"ingredientId": "ing-1", "weeklyForecast": 70.0, "dailyAverageDemand": 10.0},
                {"ingredientId": "ing-2", "weeklyForecast": 20.0, "dailyAverageDemand": 2.86},
            ]
        }

        with patch("tools.demand.list_all_ingredients", new=AsyncMock(return_value=mock_ingredients)), \
             patch("tools.demand.get_demand_forecast", new=AsyncMock(return_value=mock_forecasts)):
            
            context = asyncio.run(get_planning_context(days=7))
            self.assertEqual(context["period_days"], 7)
            self.assertEqual(context["total_ingredients_evaluated"], 2)
            self.assertGreater(len(context["planning_items"]), 0)
            # Chicken Breast (current 5kg, daily avg 10kg -> 0.5 days remaining) should have HIGH or CRITICAL urgency
            self.assertIn(context["planning_items"][0]["reorder_urgency"], ("HIGH", "CRITICAL"))


if __name__ == "__main__":
    unittest.main()
