import json
import unittest
from unittest.mock import AsyncMock, Mock, patch

from google.api_core.exceptions import ResourceExhausted

from agent import (
    _component3_days,
    _component3_query_type,
    _component3_intent_from_request,
    _component3_validate_waste_records,
    _component3_write_request,
    _format_component3_response,
    run_agent,
)
from tools.sales import (
    build_component3_report,
    get_component3_waste_period_comparison,
    get_component3_waste_records,
    get_sales_records,
)


def make_outputs():
    return {
        "sales": {
            "data": {
                "summary": {
                    "totalSales": 10,
                    "totalRevenue": 1000,
                    "averageOrderValue": 100,
                    "totalItemsSold": 12,
                },
                "records": {
                    "records": [
                        {
                            "items": [
                                {"menuItemId": "m1", "menuItemName": "Pasta", "quantity": 10}
                            ]
                        }
                    ]
                },
                "menu_items": {
                    "items": [
                        {"id": "m1", "name": "Pasta", "isActive": True},
                        {"id": "m2", "name": "Soup", "isActive": True},
                    ]
                },
            }
        },
        "consumption": {
            "data": {
                "movements": {
                    "days": 30,
                    "count": 2,
                    "movements": [
                        {
                            "id": "c1",
                            "ingredientId": "i1",
                            "ingredientName": "Tomato",
                            "quantity": 3,
                            "unit": "kg",
                            "movementType": "CONSUME",
                            "referenceType": "SALE",
                            "createdAt": "2026-09-01T00:00:00Z",
                        },
                        {
                            "id": "c2",
                            "ingredientId": "i1",
                            "ingredientName": "Tomato",
                            "quantity": 2,
                            "unit": "kg",
                            "movementType": "CONSUME",
                            "referenceType": "MANUAL",
                            "createdAt": "2026-09-02T00:00:00Z",
                        },
                    ],
                },
                "recipes": {
                    "count": 1,
                    "recipes": [
                        {
                            "id": "r1",
                            "menuItemId": "m1",
                            "menuItemName": "Pasta",
                            "isActive": True,
                            "ingredients": [
                                {
                                    "ingredientId": "i1",
                                    "ingredientName": "Tomato",
                                    "quantityRequired": 0.5,
                                    "unit": "kg",
                                }
                            ],
                        }
                    ],
                },
                "inventory": {
                    "items": [
                        {
                            "ingredientId": "i1",
                            "ingredientName": "Tomato",
                            "currentStock": 2,
                            "minimumStockLevel": 5,
                            "unit": "kg",
                        }
                    ]
                },
            }
        },
        "waste": {
            "data": {
                "summary": {"totalWasteRecords": 2, "totalWasteQuantity": 4},
                "records": {
                    "records": [
                        {"ingredientName": "Tomato", "quantity": 3, "reason": "Spoiled"},
                        {"ingredientName": "Tomato", "quantity": 1, "reason": "Spoilage"},
                    ]
                },
            }
        },
    }


class Component3AnalysisTests(unittest.TestCase):
    def test_date_range_extraction(self):
        self.assertEqual(_component3_days("Analyze sales for the last 2 days"), 2)
        self.assertEqual(_component3_days("Compare this week with previous week"), 7)
        self.assertEqual(_component3_days("Analyze sales"), 30)
        self.assertEqual(_component3_days("Analyze sales for the last 500 days"), 0)

    def test_specialist_intent_routing(self):
        self.assertEqual(
            _component3_query_type("Which menu items sold the least?"),
            "menu_item_sales",
        )
        self.assertEqual(
            _component3_query_type("Compare sales from the last 7 days with previous 7 days"),
            "comparison",
        )
        self.assertEqual(
            _component3_query_type("What was the average order value?"),
            "sales_analysis",
        )
        self.assertEqual(
            _component3_query_type("How much did we sell in the last 7 days?"),
            "sales_analysis",
        )
        self.assertEqual(
            _component3_query_type("How many items did we sell?"),
            "sales_analysis",
        )
        self.assertEqual(
            _component3_query_type("How does selling more affect stock?"),
            "ingredient_dependency",
        )
        self.assertEqual(
            _component3_query_type("Give me a sales and consumption report."),
            "combined_analysis",
        )
        self.assertEqual(_component3_query_type("Show consumption movements."), "consumption_movements")
        self.assertEqual(
            _component3_query_type("Which ingredients were consumed the most?"),
            "consumption_highest",
        )
        self.assertEqual(
            _component3_query_type("Which ingredients are used in the most recipes?"),
            "ingredient_recipe_usage",
        )
        self.assertEqual(_component3_query_type("Show waste records."), "waste_records")
        self.assertEqual(
            _component3_query_type("Show recipes used by the best-selling menu items"),
            "top_selling_recipes",
        )
        self.assertEqual(
            _component3_query_type("Which ingredients are being consumed faster than expected?"),
            "faster_than_expected",
        )
        self.assertEqual(
            _component3_query_type("Which menu items may be affected if Tomato stock is low?"),
            "ingredient_dependency",
        )
        self.assertEqual(
            _component3_query_type("Are there recipes with no recipe ingredients?"),
            "empty_recipes",
        )
        self.assertEqual(
            _component3_query_type("Compare waste in the last 7 days with the previous period."),
            "waste_comparison",
        )
        self.assertEqual(
            _component3_query_type("Group waste by ingredient."),
            "waste_ingredient_analysis",
        )
        self.assertEqual(
            _component3_query_type("Which waste reasons have the most records?"),
            "waste_reason_analysis",
        )
        self.assertEqual(
            _component3_query_type("Which ingredients are highly consumed and frequently wasted?"),
            "consumption_waste_overlap",
        )
        self.assertEqual(
            _component3_query_type("Give recommendations based only on recorded data."),
            "recommendation_analysis",
        )
        self.assertEqual(
            _component3_intent_from_request("Explain the recipe for Pasta"),
            "SALES_CONSUMPTION_WASTE",
        )
        self.assertEqual(
            _component3_intent_from_request("How much did we sell in the last 7 days?"),
            "SALES_CONSUMPTION_WASTE",
        )
        self.assertEqual(
            _component3_intent_from_request("Identify any unusual sales patterns."),
            "SALES_CONSUMPTION_WASTE",
        )
        self.assertEqual(
            _component3_intent_from_request("Which recipes have the highest ingredient usage?"),
            "SALES_CONSUMPTION_WASTE",
        )
        self.assertEqual(
            _component3_intent_from_request("Are there menu items with missing recipes?"),
            "SALES_CONSUMPTION_WASTE",
        )
        self.assertEqual(
            _component3_intent_from_request("Are there recipes with no recipe ingredients?"),
            "SALES_CONSUMPTION_WASTE",
        )
        self.assertEqual(
            _component3_intent_from_request("What is the weather today?"),
            None,
        )
        self.assertTrue(_component3_write_request("Create a sale for Pasta."))
        self.assertTrue(_component3_write_request("Record waste for Tomato."))
        self.assertTrue(_component3_write_request("Reduce stock for Tomato."))
        self.assertFalse(_component3_write_request("Create a sales report for this week."))
        self.assertFalse(_component3_write_request("Show the waste report."))

    def test_float_display_rounds_recipe_noise_but_preserves_useful_precision(self):
        from agent import _component3_number

        self.assertEqual(_component3_number(1.000001), "1")
        self.assertEqual(_component3_number(0.125), "0.125")

    def test_nested_consumption_is_aggregated_by_actual_quantity_and_unit(self):
        text = _format_component3_response(
            "What ingredients were consumed in the last 30 days?",
            make_outputs(),
            {"recommendations": [], "requires_approval": False},
            30,
        )
        self.assertIn("Recorded consumption movements: 2", text)
        self.assertIn("Tomato: 5 kg recorded", text)
        self.assertNotIn("Sales Performance", text)
        self.assertNotIn("No recorded consumption movements", text)

    def test_consumption_movement_query_includes_actual_movement_details(self):
        text = _format_component3_response(
            "Show the consumption stock movements for the last 7 days.",
            make_outputs(),
            {},
            7,
        )
        self.assertIn("2026-09-01", text)
        self.assertIn("Tomato", text)
        self.assertIn("3 kg", text)
        self.assertIn("SALE", text)

    def test_unusual_consumption_query_reports_baseline_limitation(self):
        text = _format_component3_response(
            "Are there any unusual consumption patterns?",
            make_outputs(),
            {},
            30,
        )
        self.assertIn("Fewer than three movements", text)
        self.assertIn("cannot be assessed reliably", text)
        self.assertNotIn("unusual consumption pattern detected", text.casefold())

    def test_zero_movements_message_is_not_contradictory(self):
        outputs = make_outputs()
        outputs["consumption"]["data"]["movements"] = {
            "days": 30,
            "count": 0,
            "movements": [],
        }
        text = _format_component3_response(
            "What ingredients were consumed?",
            outputs,
            {},
            30,
        )
        self.assertIn("Recorded consumption movements: 0", text)
        self.assertIn("No recorded consumption movements", text)

    def test_backend_error_is_not_reported_as_no_consumption(self):
        outputs = make_outputs()
        outputs["consumption"]["data"]["movements"] = {
            "error": "Backend returned HTTP 500.",
            "status_code": 500,
        }
        text = _format_component3_response(
            "What ingredients were consumed?",
            outputs,
            {},
            30,
        )
        self.assertIn("Backend returned HTTP 500.", text)
        self.assertNotIn("No recorded consumption movements", text)

    def test_movement_aggregation_keeps_incompatible_units_separate(self):
        outputs = make_outputs()
        outputs["consumption"]["data"]["movements"]["movements"][1]["unit"] = "g"
        text = _format_component3_response(
            "What ingredients were consumed?",
            outputs,
            {},
            30,
        )
        self.assertIn("Tomato: 3 kg recorded", text)
        self.assertIn("Tomato: 2 g recorded", text)

    def test_combined_report_classifies_only_known_reference_types(self):
        outputs = make_outputs()
        outputs["consumption"]["data"]["all_movements"] = {
            "movements": [
                {"movementType": "CONSUME", "referenceType": "SALE", "ingredientName": "Tomato", "quantity": 2, "unit": "kg"},
                {"movementType": "CONSUME", "referenceType": "KITCHEN_ORDER", "ingredientName": "Tomato", "quantity": 1, "unit": "kg"},
                {"movementType": "CONSUME", "ingredientName": "Flour", "quantity": 3, "unit": "kg"},
                {"movementType": "WASTE", "referenceType": "WASTE"},
                {"movementType": "RECEIVE", "referenceType": "GOODS_RECEIPT"},
            ],
            "count": 5,
        }
        text = _format_component3_response(
            "Give me a complete sales, consumption, and waste report",
            outputs,
            {},
            30,
        )
        self.assertIn("Total relevant stock movements: 3", text)
        self.assertIn("Sales-referenced consumption movements: 1", text)
        self.assertIn("Explicit operational consumption movements: 1", text)
        self.assertIn("Consumption movements with no recognized source: 1", text)
        self.assertIn("WASTE: 1", text)
        self.assertIn("RECEIVE: 1", text)

    def test_expected_consumption_uses_sales_times_recipe(self):
        text = _format_component3_response(
            "Explain ingredient consumption based on recent sales and recipes",
            make_outputs(),
            {},
            30,
        )
        self.assertIn("Tomato: 5 kg", text)
        self.assertIn("distinct measures", text)
        self.assertIn("sales multiplied by active recipe quantities", text)

    def test_expected_consumption_ignores_database_precision_noise_when_comparing(self):
        outputs = make_outputs()
        outputs["sales"]["data"]["records"]["records"][0]["items"][0]["quantity"] = 10
        outputs["consumption"]["data"]["movements"]["movements"][0]["quantity"] = 5
        outputs["consumption"]["data"]["recipes"]["recipes"][0]["ingredients"][0]["quantityRequired"] = 0.5000001
        text = _format_component3_response(
            "Which ingredients are being consumed faster than expected?",
            outputs,
            {},
            30,
        )
        self.assertIn("5 kg recorded; 5 kg expected", text)
        self.assertIn("recorded matches recipe expectation", text)

    def test_faster_than_expected_query_states_result_of_comparison(self):
        text = _format_component3_response(
            "Which ingredients are being consumed faster than expected?",
            make_outputs(),
            {},
            30,
        )
        self.assertIn(
            "No ingredient had matching recorded sales consumption above its recipe-derived expectation",
            text,
        )

    def test_missing_recipe_and_zero_sales_queries_use_actual_lists(self):
        text = _format_component3_response(
            "Which menu items had zero sales in the last 30 days?",
            make_outputs(),
            {},
            30,
        )
        self.assertIn("Soup", text)
        self.assertNotIn("Pasta", text)

    def test_menu_item_ranking_excludes_unsold_items(self):
        text = _format_component3_response(
            "Which menu items sold the least?",
            make_outputs(),
            {},
            30,
        )
        self.assertIn("Pasta: 10 sold", text)
        self.assertNotIn("Soup", text)

    def test_top_seller_recipe_lookup(self):
        text = _format_component3_response(
            "Explain the recipe for the top-selling menu item",
            make_outputs(),
            {},
            30,
        )
        self.assertIn("Pasta (10 sold)", text)
        self.assertIn("Tomato: 0.5 kg per portion", text)

    def test_sales_period_comparison_reports_both_periods_and_change(self):
        outputs = make_outputs()
        outputs["sales"]["data"]["comparison"] = {
            "current": {"totalSales": 4, "totalRevenue": 400, "averageOrderValue": 100, "totalItemsSold": 5},
            "previous": {"totalSales": 2, "totalRevenue": 180, "averageOrderValue": 90, "totalItemsSold": 2},
            "difference": {
                "totalSales": {"absolute": 2, "percentage": 100},
                "totalRevenue": {"absolute": 220, "percentage": 122.22},
                "averageOrderValue": {"absolute": 10, "percentage": 11.11},
                "totalItemsSold": {"absolute": 3, "percentage": 150},
            },
        }
        text = _format_component3_response(
            "Compare sales from the last 7 days with the previous 7 days",
            outputs,
            {},
            7,
        )
        self.assertIn("Current: 4", text)
        self.assertIn("Previous: 2", text)
        self.assertIn("Change: 2 (100%)", text)

    def test_ingredient_dependency_uses_recipe_and_inventory_records(self):
        text = _format_component3_response(
            "Which menu items use Tomato?",
            make_outputs(),
            {},
            30,
        )
        self.assertIn("Current stock: 2 kg", text)
        self.assertIn("Pasta: uses this ingredient", text)

    def test_low_stock_sales_impact_uses_sales_recipe_and_inventory_data(self):
        outputs = make_outputs()
        text = _format_component3_response(
            "Which ingredients may become low in stock because of sales activity?",
            outputs,
            {},
            30,
        )
        self.assertIn("Sales-Related Ingredient Stock Exposure", text)
        self.assertIn("Tomato", text)
        self.assertIn("recipe-derived period requirement 5 kg", text)
        self.assertIn("Pasta: 10 sold", text)
        self.assertIn("not a future stock forecast", text)

    def test_named_ingredient_dependencies_are_recipe_based(self):
        outputs = make_outputs()
        recipe = outputs["consumption"]["data"]["recipes"]["recipes"][0]
        recipe["ingredients"].append({
            "ingredientId": "i2",
            "ingredientName": "Coconut Oil",
            "quantityRequired": 0.25,
            "unit": "L",
        })
        outputs["consumption"]["data"]["inventory"]["items"].append({
            "ingredientId": "i2",
            "ingredientName": "Coconut Oil",
            "currentStock": 3,
            "minimumStockLevel": 1,
            "unit": "L",
        })
        text = _format_component3_response(
            "Which menu items use Coconut Oil?",
            outputs,
            {},
            30,
        )
        self.assertIn("Menu Item Dependency — Coconut Oil", text)
        self.assertIn("Pasta: uses this ingredient", text)
        self.assertNotIn("Sales Performance", text)

    def test_explicit_chicken_stock_risk_names_dependent_menu_items(self):
        outputs = make_outputs()
        outputs["consumption"]["data"]["recipes"]["recipes"][0]["ingredients"].append({
            "ingredientId": "chicken",
            "ingredientName": "Chicken Breast",
            "quantityRequired": 1,
            "unit": "kg",
        })
        outputs["consumption"]["data"]["inventory"]["items"].append({
            "ingredientId": "chicken",
            "ingredientName": "Chicken Breast",
            "currentStock": 8,
            "minimumStockLevel": 3,
            "unit": "kg",
        })
        text = _format_component3_response(
            "Which menu items may be affected if Chicken Breast stock becomes low?",
            outputs,
            {},
            30,
        )
        self.assertIn("Menu Item Dependency — Chicken Breast", text)
        self.assertIn("Pasta: uses this ingredient", text)

    def test_missing_and_empty_recipes_use_actual_recipe_relationships(self):
        outputs = make_outputs()
        outputs["sales"]["data"]["menu_items"]["items"].append({
            "id": "m3",
            "name": "Salad",
            "isActive": True,
        })
        outputs["consumption"]["data"]["recipes"]["recipes"].append({
            "id": "r2",
            "menuItemId": "m2",
            "menuItemName": "Soup",
            "isActive": True,
            "version": 1,
            "ingredients": [],
        })
        missing = _format_component3_response(
            "Are there menu items with missing recipes?",
            outputs,
            {},
            30,
        )
        empty = _format_component3_response(
            "Are there recipes with no recipe ingredients?",
            outputs,
            {},
            30,
        )
        self.assertIn("Salad", missing)
        self.assertIn("Active Recipes Without Ingredients", empty)
        self.assertIn("Soup", empty)
        self.assertNotIn("approval", empty.casefold())

    def test_best_seller_recipe_chaining_includes_recipe_ingredients(self):
        text = _format_component3_response(
            "Show the recipes used by the best-selling menu items.",
            make_outputs(),
            {},
            30,
        )
        self.assertIn("Pasta (10 sold)", text)
        self.assertIn("Tomato: 0.5 kg per portion", text)

    def test_recipe_usage_is_ranked_by_unit_and_defined(self):
        outputs = make_outputs()
        outputs["consumption"]["data"]["recipes"]["recipes"].append({
            "id": "r2",
            "menuItemId": "m2",
            "menuItemName": "Soup",
            "isActive": True,
            "version": 1,
            "ingredients": [
                {"ingredientId": "i2", "ingredientName": "Oil", "quantityRequired": 2, "unit": "kg"},
            ],
        })
        text = _format_component3_response(
            "Which recipes have the highest ingredient usage?",
            outputs,
            {},
            30,
        )
        self.assertIn("sum of required quantities", text)
        self.assertIn("kg:", text)
        self.assertIn("Pasta: 0.5 kg", text)
        self.assertIn("Soup: 2 kg", text)

    def test_waste_reason_query_is_focused_and_preserves_database_labels(self):
        text = _format_component3_response(
            "What are the most common waste reasons?",
            make_outputs(),
            {},
            30,
        )
        self.assertIn("Spoiled: 3", text)
        self.assertIn("Spoilage: 1", text)
        self.assertNotIn("Sales Performance", text)

    def test_waste_record_query_returns_record_details(self):
        text = _format_component3_response("Show waste records.", make_outputs(), {}, 30)
        self.assertIn("Waste Records — Last 30 Days", text)
        self.assertIn("Tomato", text)
        self.assertIn("Spoiled", text)
        self.assertIn("3", text)

    def test_waste_period_comparison_reports_quantities_and_zero_baseline(self):
        outputs = make_outputs()
        outputs["waste"]["data"]["comparison"] = {
            "current": {"totalWasteRecords": 3, "totalWasteQuantity": 5},
            "previous": {"totalWasteRecords": 2, "totalWasteQuantity": 0},
            "difference": {
                "totalWasteRecords": {"absolute": 1, "percentage": 50},
                "totalWasteQuantity": {"absolute": 5, "percentage": None},
            },
        }
        text = _format_component3_response(
            "Compare waste in the last 7 days with the previous period.",
            outputs,
            {},
            7,
        )
        self.assertIn("Current 7 Days vs Previous 7 Days", text)
        self.assertIn("Current: 5", text)
        self.assertIn("percentage unavailable (previous period was zero)", text)
        self.assertIn("Recorded waste quantity increased.", text)

    def test_waste_and_consumption_overlap_uses_explicit_data_criteria(self):
        text = _format_component3_response(
            "Which ingredients are highly consumed and frequently wasted?",
            make_outputs(),
            {},
            30,
        )
        self.assertIn("Tomato: 5 kg consumed", text)
        self.assertIn("2 waste records", text)
        self.assertIn("at least two recorded waste records", text)

    def test_recommendations_are_evidence_based_and_do_not_request_approval(self):
        text = _format_component3_response(
            "Give recommendations based only on recorded data.",
            make_outputs(),
            {},
            30,
        )
        self.assertIn("Tomato", text)
        self.assertIn("below its configured minimum", text)
        self.assertIn("read-only analysis", text)
        self.assertIn("no action approval is pending", text)

    def test_waste_to_recipe_association_disclaims_causation(self):
        text = _format_component3_response(
            "Which menu items use ingredients with the highest recorded waste?",
            make_outputs(),
            {},
            30,
        )
        self.assertIn("Pasta", text)
        self.assertIn("ingredient-to-recipe association only", text)
        self.assertIn("does not establish that a menu item caused the waste", text)

    def test_analysis_report_never_creates_approval_for_read_only_data(self):
        report = build_component3_report(
            {"totalSales": 1},
            {"totalWasteQuantity": 5},
            {"count": 1},
            {"count": 1},
            focus="waste",
        )
        self.assertFalse(report["requires_approval"])
        self.assertFalse(report["approval_required"])

    def test_waste_records_are_rejected_when_the_count_disagrees_with_summary(self):
        result = _component3_validate_waste_records(
            {"totalWasteRecords": 0, "totalWasteQuantity": 0},
            {"records": [{"ingredientName": "Tomato", "quantity": 5}], "count": 1},
        )
        self.assertIn("error", result)
        self.assertEqual(result["expectedCount"], 0)
        self.assertEqual(result["returnedCount"], 1)

    def test_complete_report_does_not_present_inconsistent_waste_breakdown(self):
        outputs = make_outputs()
        mismatch = _component3_validate_waste_records(
            outputs["waste"]["data"]["summary"],
            {"records": [{"ingredientName": "Old-period item", "quantity": 99}]},
        )
        report = {"waste_records": mismatch}
        text = _format_component3_response(
            "Give me a complete sales, consumption, and waste report.",
            outputs,
            report,
            7,
        )
        self.assertIn("Ingredient/reason breakdown unavailable", text)
        self.assertIn("does not match the summary", text)
        self.assertNotIn("Old-period item", text)


class Component3ToolTests(unittest.IsolatedAsyncioTestCase):
    async def test_sales_record_pagination_fetches_all_pages(self):
        first_page = [{"items": []} for _ in range(100)]
        second_page = [{"items": []}]
        with patch(
            "tools.sales._safe_get",
            new=AsyncMock(side_effect=[first_page, second_page]),
        ) as safe_get:
            result = await get_sales_records(30)
        self.assertEqual(result["count"], 101)
        self.assertEqual(safe_get.await_count, 2)
        self.assertEqual(safe_get.await_args_list[0].args[1]["page"], 1)
        self.assertEqual(safe_get.await_args_list[1].args[1]["page"], 2)

    async def test_waste_record_pagination_requests_date_filtered_pages(self):
        with patch(
            "tools.sales._safe_get",
            new=AsyncMock(side_effect=[[{"id": str(i)} for i in range(100)], [{"id": "last"}]]),
        ) as safe_get:
            result = await get_component3_waste_records(
                7,
                "2026-09-01T00:00:00Z",
                "2026-09-08T00:00:00Z",
            )
        self.assertEqual(result["count"], 101)
        self.assertEqual(safe_get.await_count, 2)
        first_query = safe_get.await_args_list[0].args[1]
        self.assertEqual(first_query["from"], "2026-09-01T00:00:00Z")
        self.assertEqual(first_query["to"], "2026-09-08T00:00:00Z")
        self.assertEqual(first_query["pageSize"], 100)

    async def test_waste_period_comparison_uses_adjacent_windows(self):
        with patch(
            "tools.sales._safe_get",
            new=AsyncMock(side_effect=[
                {"totalWasteRecords": 4, "totalWasteQuantity": 8},
                {"totalWasteRecords": 2, "totalWasteQuantity": 3},
            ]),
        ) as safe_get:
            result = await get_component3_waste_period_comparison(
                7,
                "2026-09-08T00:00:00Z",
                "2026-09-15T00:00:00Z",
            )
        self.assertEqual(result["difference"]["totalWasteQuantity"]["absolute"], 5)
        self.assertEqual(result["difference"]["totalWasteQuantity"]["percentage"], 5 / 3 * 100)
        current_query, previous_query = [call.args[1] for call in safe_get.await_args_list]
        self.assertEqual(current_query["from"], "2026-09-08T00:00:00Z")
        self.assertEqual(current_query["to"], "2026-09-15T00:00:00Z")
        self.assertLess(previous_query["to"], current_query["from"])

    async def test_waste_period_comparison_rejects_malformed_metrics(self):
        with patch(
            "tools.sales._safe_get",
            new=AsyncMock(side_effect=[
                {"totalWasteRecords": "unknown", "totalWasteQuantity": 4},
                {"totalWasteRecords": 1, "totalWasteQuantity": 3},
            ]),
        ):
            result = await get_component3_waste_period_comparison(7)
        self.assertIn("error", result)


class Component3WorkflowTests(unittest.IsolatedAsyncioTestCase):
    async def test_waste_stage_rejects_records_outside_summary_window(self):
        async def dispatch(name, args, allowed_tools=None):
            if name == "get_sales_summary":
                return {
                    "totalSales": 0,
                    "totalRevenue": 0,
                    "averageOrderValue": 0,
                    "totalItemsSold": 0,
                }
            if name == "get_sales_records":
                return {"records": [], "count": 0}
            if name == "get_consumption_movements":
                return {"movements": [], "count": 0}
            if name == "get_component3_all_movements":
                return {"movements": [], "count": 0}
            if name == "get_recipes":
                return {"recipes": [], "count": 0}
            if name == "get_component3_waste_summary":
                return {"totalWasteRecords": 0, "totalWasteQuantity": 0}
            if name == "get_component3_waste_records":
                return {
                    "records": [{"ingredientName": "Old-period ingredient", "quantity": 9}],
                    "count": 1,
                }
            if name == "build_component3_report":
                return build_component3_report(**args)
            raise AssertionError(f"Unexpected Component 3 tool: {name}")

        failed_model = Mock()
        failed_model.generate_content.side_effect = ResourceExhausted("quota")
        with (
            patch("agent.call_tool", new=AsyncMock(side_effect=dispatch)),
            patch("agent.genai.GenerativeModel", return_value=failed_model),
        ):
            chunks = [
                chunk async for chunk in run_agent(
                    "Run a complete sales, consumption, recipe and waste report for the last 7 days.",
                    "user-1",
                    None,
                )
            ]

        payloads = [
            json.loads(line[6:])
            for chunk in chunks
            for line in chunk.splitlines()
            if line.startswith("data: ")
        ]
        waste_stage = next(
            event["output"]["data"]["records"]
            for event in payloads
            if event["type"] == "stage_output" and event["stage"] == "waste"
        )
        final = next(event["text"] for event in payloads if event["type"] == "message")
        self.assertIn("error", waste_stage)
        self.assertIn("Ingredient/reason breakdown unavailable", final)
        self.assertNotIn("Old-period ingredient", final)

    async def test_write_requests_are_refused_without_calling_tools(self):
        with patch("agent.call_tool", new=AsyncMock()) as call_tool:
            events = [
                chunk async for chunk in run_agent(
                    "Create a waste record for Tomato.",
                    "user-1",
                    None,
                )
            ]
        payloads = [
            json.loads(line[6:])
            for chunk in events
            for line in chunk.splitlines()
            if line.startswith("data: ")
        ]
        self.assertIn("did not create or change", next(
            event["text"] for event in payloads if event["type"] == "message"
        ))
        call_tool.assert_not_awaited()

    async def test_gemini_quota_falls_back_to_live_structured_component3_results(self):
        async def dispatch(name, args, allowed_tools=None):
            if name == "get_sales_summary":
                return {
                    "totalSales": 2,
                    "totalRevenue": 1300,
                    "averageOrderValue": 650,
                    "totalItemsSold": 2,
                }
            if name == "get_sales_records":
                return {
                    "records": [
                        {"items": [{"menuItemId": "m1", "menuItemName": "Pasta", "quantity": 2}]}
                    ],
                    "count": 1,
                }
            if name == "get_consumption_movements":
                return {
                    "days": 7,
                    "movements": [
                        {
                            "id": "c1", "ingredientId": "i1", "ingredientName": "Tomato",
                            "quantity": 1, "unit": "kg", "movementType": "CONSUME",
                            "createdAt": "2026-09-26T00:00:00Z",
                        }
                    ],
                    "count": 1,
                }
            if name == "get_recipes":
                return {
                    "recipes": [
                        {
                            "id": "r1", "menuItemId": "m1", "menuItemName": "Pasta",
                            "version": 1, "isActive": True,
                            "ingredients": [
                                {
                                    "ingredientId": "i1", "ingredientName": "Tomato",
                                    "quantityRequired": 0.5, "unit": "kg",
                                }
                            ],
                        }
                    ],
                    "count": 1,
                }
            if name == "get_component3_waste_summary":
                return {"totalWasteRecords": 0, "totalWasteQuantity": 0}
            if name == "get_component3_waste_records":
                return {"records": [], "count": 0}
            if name == "build_component3_report":
                return build_component3_report(**args)
            raise AssertionError(f"Unexpected Component 3 tool: {name}")

        failed_model = Mock()
        failed_model.generate_content.side_effect = ResourceExhausted("quota")
        with (
            patch("agent.call_tool", new=AsyncMock(side_effect=dispatch)),
            patch("agent.genai.GenerativeModel", return_value=failed_model) as model_factory,
        ):
            events = [
                chunk async for chunk in run_agent(
                    "Analyze sales for the last 7 days.",
                    "user-1",
                    None,
                )
            ]

        payloads = [
            json.loads(line[6:])
            for chunk in events
            for line in chunk.splitlines()
            if line.startswith("data: ")
        ]
        stages = [event["stage"] for event in payloads if event["type"] == "stage_output"]
        final = next(event["text"] for event in payloads if event["type"] == "message")
        stage_outputs = [event["output"] for event in payloads if event["type"] == "stage_output"]
        self.assertEqual(stages, ["sales", "consumption", "waste", "recommendation"])
        self.assertIn("Total revenue: 1,300", final)
        self.assertTrue(all(output["read_only"] for output in stage_outputs))
        self.assertTrue(all(output["summary_source"] == "structured_fallback" for output in stage_outputs))
        self.assertEqual(model_factory.call_count, 1)
        self.assertIn("Gemini specialist summaries were unavailable", final)
        self.assertIn("live structured backend data", final)


if __name__ == "__main__":
    unittest.main()
