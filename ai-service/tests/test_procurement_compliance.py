"""
tests/test_procurement_compliance.py
────────────────────────────────────
Unit tests for AI-Powered Procurement Compliance and Investigation Tool.
Component 2 — Supplier & Procurement Management.
"""

from __future__ import annotations

import sys
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

for _mod in ("joblib", "ml", "ml.model", "sklearn", "pandas", "numpy"):
    if _mod not in sys.modules:
        sys.modules[_mod] = MagicMock()

from tools.procurement_compliance import (
    _clean_id,
    _id_matches,
    check_duplicate_purchase_requests,
    check_pr_po_consistency,
    check_workflow_compliance,
    check_receiving_discrepancies,
    analyze_procurement_compliance,
    investigate_procurement_transaction,
)


class TestDuplicatePurchaseRequestDetection(unittest.IsolatedAsyncioTestCase):
    """Test suite for duplicate PR detection algorithm."""

    @patch("tools.procurement_compliance._safe_get")
    async def test_exact_duplicate_pr_detection(self, mock_get):
        mock_get.return_value = [
            {
                "id": "11111111-0000-0000-0000-000000000001",
                "status": "PENDING_APPROVAL",
                "requestedByName": "Chef Mario",
                "requestedById": "user-1",
                "requestedAt": "2026-03-01T10:00:00Z",
                "items": [
                    {"ingredientId": "ing-tom", "ingredientName": "Tomato", "requestedQuantity": 10.0},
                    {"ingredientId": "ing-oni", "ingredientName": "Onion", "requestedQuantity": 5.0},
                ],
            },
            {
                "id": "11111111-0000-0000-0000-000000000002",
                "status": "PENDING_APPROVAL",
                "requestedByName": "Chef Mario",
                "requestedById": "user-1",
                "requestedAt": "2026-03-02T11:00:00Z",
                "items": [
                    {"ingredientId": "ing-tom", "ingredientName": "Tomato", "requestedQuantity": 10.0},
                    {"ingredientId": "ing-oni", "ingredientName": "Onion", "requestedQuantity": 5.0},
                ],
            },
        ]

        result = await check_duplicate_purchase_requests(window_days=7, similarity_threshold=0.75)
        self.assertIsInstance(result, dict)
        self.assertEqual(result.get("duplicate_count"), 1)
        self.assertGreaterEqual(result.get("risk_level"), "MEDIUM")
        groups = result.get("duplicate_groups", [])
        self.assertEqual(len(groups), 1)
        self.assertGreaterEqual(groups[0]["similarity_score"], 90.0)

    @patch("tools.procurement_compliance._safe_get")
    async def test_similar_pr_with_quantity_variation(self, mock_get):
        mock_get.return_value = [
            {
                "id": "22222222-0000-0000-0000-000000000001",
                "status": "PENDING_APPROVAL",
                "requestedByName": "Chef Luigi",
                "requestedAt": "2026-03-01T08:00:00Z",
                "items": [
                    {"ingredientId": "ing-beef", "ingredientName": "Ground Beef", "requestedQuantity": 20.0},
                ],
            },
            {
                "id": "22222222-0000-0000-0000-000000000002",
                "status": "APPROVED",
                "requestedByName": "Chef Luigi",
                "requestedAt": "2026-03-03T09:00:00Z",
                "items": [
                    {"ingredientId": "ing-beef", "ingredientName": "Ground Beef", "requestedQuantity": 22.0},
                ],
            },
        ]

        result = await check_duplicate_purchase_requests(window_days=7, similarity_threshold=0.75)
        self.assertEqual(result.get("duplicate_count"), 1)
        groups = result.get("duplicate_groups", [])
        self.assertGreaterEqual(groups[0]["similarity_score"], 80.0)

    @patch("tools.procurement_compliance._safe_get")
    async def test_different_ingredients_no_duplicate(self, mock_get):
        mock_get.return_value = [
            {
                "id": "33333333-0000-0000-0000-000000000001",
                "status": "APPROVED",
                "requestedAt": "2026-03-01T10:00:00Z",
                "items": [{"ingredientId": "ing-flour", "ingredientName": "Flour", "requestedQuantity": 50.0}],
            },
            {
                "id": "33333333-0000-0000-0000-000000000002",
                "status": "APPROVED",
                "requestedAt": "2026-03-02T10:00:00Z",
                "items": [{"ingredientId": "ing-sugar", "ingredientName": "Sugar", "requestedQuantity": 25.0}],
            },
        ]

        result = await check_duplicate_purchase_requests(window_days=7)
        self.assertEqual(result.get("duplicate_count"), 0)
        self.assertEqual(result.get("risk_level"), "LOW")

    @patch("tools.procurement_compliance._safe_get")
    async def test_cancelled_pr_handling(self, mock_get):
        # Two cancelled PRs should not generate an active duplicate alarm
        mock_get.return_value = [
            {
                "id": "44444444-0000-0000-0000-000000000001",
                "status": "CANCELLED",
                "requestedAt": "2026-03-01T10:00:00Z",
                "items": [{"ingredientId": "ing-oil", "ingredientName": "Olive Oil", "requestedQuantity": 5.0}],
            },
            {
                "id": "44444444-0000-0000-0000-000000000002",
                "status": "CANCELLED",
                "requestedAt": "2026-03-02T10:00:00Z",
                "items": [{"ingredientId": "ing-oil", "ingredientName": "Olive Oil", "requestedQuantity": 5.0}],
            },
        ]

        result = await check_duplicate_purchase_requests(window_days=7)
        self.assertEqual(result.get("duplicate_count"), 0)

    @patch("tools.procurement_compliance._safe_get")
    async def test_outside_temporal_window_not_flagged(self, mock_get):
        mock_get.return_value = [
            {
                "id": "55555555-0000-0000-0000-000000000001",
                "status": "APPROVED",
                "requestedAt": "2026-01-01T10:00:00Z",
                "items": [{"ingredientId": "ing-rice", "ingredientName": "Rice", "requestedQuantity": 100.0}],
            },
            {
                "id": "55555555-0000-0000-0000-000000000002",
                "status": "APPROVED",
                "requestedAt": "2026-03-01T10:00:00Z",
                "items": [{"ingredientId": "ing-rice", "ingredientName": "Rice", "requestedQuantity": 100.0}],
            },
        ]

        result = await check_duplicate_purchase_requests(window_days=7)
        self.assertEqual(result.get("duplicate_count"), 0)

    @patch("tools.procurement_compliance._safe_get")
    async def test_empty_or_failed_pr_response(self, mock_get):
        mock_get.return_value = {"error": "Backend offline"}
        result = await check_duplicate_purchase_requests()
        self.assertIn("error", result)

        mock_get.return_value = []
        result2 = await check_duplicate_purchase_requests()
        self.assertEqual(result2.get("total_requests_analyzed"), 0)
        self.assertEqual(result2.get("duplicate_count"), 0)


class TestPRtoPOConsistency(unittest.IsolatedAsyncioTestCase):
    """Test suite for PR-to-PO consistency and financial variance audit."""

    @patch("tools.procurement_compliance._safe_get")
    async def test_matching_pr_po_consistency(self, mock_get):
        # PO matching PR exactly
        mock_get.side_effect = [
            [
                {
                    "id": "po-11111111-0000-0000-0000-000000000001",
                    "purchaseRequestId": "pr-11111111-0000-0000-0000-000000000001",
                    "status": "ORDERED",
                    "supplierName": "Fresh Farms Ltd",
                    "items": [
                        {"ingredientId": "ing-tom", "ingredientName": "Tomato", "orderedQuantity": 10.0, "unitPrice": 2.50},
                    ],
                }
            ],
            [
                {
                    "id": "pr-11111111-0000-0000-0000-000000000001",
                    "status": "APPROVED",
                    "items": [
                        {"ingredientId": "ing-tom", "ingredientName": "Tomato", "requestedQuantity": 10.0},
                    ],
                }
            ],
        ]

        result = await check_pr_po_consistency()
        self.assertIsInstance(result, dict)
        self.assertEqual(result.get("inconsistent_orders_count"), 0)
        self.assertEqual(result.get("risk_level"), "LOW")
        self.assertEqual(result.get("total_unauthorized_variance"), 0.0)

    @patch("tools.procurement_compliance._safe_get")
    async def test_quantity_and_financial_variance(self, mock_get):
        # PO orders 20 units at $5.00 ($100), but PR only authorized 10 units ($50 authorized, +$50 extra spend)
        mock_get.side_effect = [
            [
                {
                    "id": "po-22222222-0000-0000-0000-000000000001",
                    "purchaseRequestId": "pr-22222222-0000-0000-0000-000000000001",
                    "status": "ORDERED",
                    "supplierName": "Meat Wholesaler",
                    "items": [
                        {"ingredientId": "ing-beef", "ingredientName": "Beef", "orderedQuantity": 20.0, "unitPrice": 5.00},
                    ],
                }
            ],
            [
                {
                    "id": "pr-22222222-0000-0000-0000-000000000001",
                    "status": "APPROVED",
                    "items": [
                        {"ingredientId": "ing-beef", "ingredientName": "Beef", "requestedQuantity": 10.0},
                    ],
                }
            ],
        ]

        result = await check_pr_po_consistency()
        self.assertEqual(result.get("inconsistent_orders_count"), 1)
        reports = result.get("consistency_reports", [])
        self.assertEqual(len(reports), 1)
        rep = reports[0]
        self.assertTrue(rep.get("has_discrepancies"))
        self.assertEqual(rep.get("unauthorized_spend_variance"), 50.0)
        self.assertEqual(rep.get("risk_level"), "HIGH")

    @patch("tools.procurement_compliance._safe_get")
    async def test_omitted_and_unrequested_extra_items(self, mock_get):
        mock_get.side_effect = [
            [
                {
                    "id": "po-33333333-0000-0000-0000-000000000001",
                    "purchaseRequestId": "pr-33333333-0000-0000-0000-000000000001",
                    "status": "ORDERED",
                    "items": [
                        {"ingredientId": "ing-unreq", "ingredientName": "Caviar", "orderedQuantity": 5.0, "unitPrice": 20.0},
                    ],
                }
            ],
            [
                {
                    "id": "pr-33333333-0000-0000-0000-000000000001",
                    "status": "APPROVED",
                    "items": [
                        {"ingredientId": "ing-flour", "ingredientName": "Flour", "requestedQuantity": 50.0},
                    ],
                }
            ],
        ]

        result = await check_pr_po_consistency()
        self.assertEqual(result.get("inconsistent_orders_count"), 1)
        rep = result.get("consistency_reports", [])[0]
        issues = rep.get("issues", [])
        self.assertTrue(any("omitted" in i.lower() for i in issues))
        self.assertTrue(any("extra item" in i.lower() for i in issues))

    @patch("tools.procurement_compliance._safe_get")
    async def test_missing_linked_pr_relationship(self, mock_get):
        mock_get.side_effect = [
            [
                {
                    "id": "po-44444444-0000-0000-0000-000000000001",
                    "purchaseRequestId": "pr-non-existent-guid",
                    "status": "ORDERED",
                    "items": [],
                }
            ],
            [],  # Empty PR list
            {"error": "Not found"},  # Fallback single PR fetch
        ]

        result = await check_pr_po_consistency()
        self.assertEqual(result.get("inconsistent_orders_count"), 1)
        self.assertEqual(result.get("consistency_reports", [])[0].get("risk_level"), "HIGH")

    @patch("tools.procurement_compliance._safe_get")
    async def test_direct_po_without_pr(self, mock_get):
        mock_get.side_effect = [
            [
                {
                    "id": "po-55555555-0000-0000-0000-000000000001",
                    "purchaseRequestId": None,
                    "status": "ORDERED",
                    "items": [{"ingredientId": "ing-salt", "ingredientName": "Salt", "orderedQuantity": 10.0, "unitPrice": 1.0}],
                }
            ],
            [],
        ]

        result = await check_pr_po_consistency()
        self.assertEqual(len(result.get("consistency_reports", [])), 1)
        self.assertFalse(result.get("consistency_reports", [])[0].get("is_linked_to_pr"))

    @patch("tools.procurement_compliance._safe_get")
    async def test_pr_po_consistency_breakdown_counts(self, mock_get):
        mock_pos = [
            {"id": "po-1", "purchaseRequestId": "pr-1", "status": "DRAFT", "items": []},
            {"id": "po-2", "purchaseRequestId": "pr-2", "status": "DRAFT", "items": []},
            {"id": "po-3", "purchaseRequestId": None, "status": "DRAFT", "items": []},
        ]
        mock_prs = [
            {"id": "pr-1", "status": "APPROVED", "items": []},
            {"id": "pr-2", "status": "APPROVED", "items": []},
        ]
        mock_get.side_effect = [mock_pos, mock_prs]

        result = await check_pr_po_consistency()
        self.assertEqual(result.get("total_orders_analyzed"), 3)
        self.assertEqual(result.get("linked_orders_count"), 2)
        self.assertEqual(result.get("direct_orders_count"), 1)
        self.assertEqual(
            result.get("linked_orders_count") + result.get("direct_orders_count"),
            result.get("total_orders_analyzed")
        )


class TestWorkflowCompliance(unittest.IsolatedAsyncioTestCase):
    """Test suite for procurement approval workflow and governance rules."""

    @patch("tools.procurement_compliance._safe_get")
    async def test_approved_pr_valid_po_workflow(self, mock_get):
        mock_get.side_effect = [
            [
                {
                    "id": "pr-11111111-0000-0000-0000-000000000001",
                    "status": "APPROVED",
                    "approvedByName": "Manager Jane",
                    "approvedById": "mgr-1",
                    "approvedAt": "2026-03-01T12:00:00Z",
                }
            ],
            [
                {
                    "id": "po-11111111-0000-0000-0000-000000000001",
                    "purchaseRequestId": "pr-11111111-0000-0000-0000-000000000001",
                    "status": "ORDERED",
                    "orderDate": "2026-03-02T10:00:00Z",
                    "items": [{"ingredientId": "ing-1", "orderedQuantity": 10.0}],
                }
            ],
        ]

        result = await check_workflow_compliance()
        self.assertIsInstance(result, dict)
        self.assertEqual(result.get("total_violations"), 0)
        self.assertEqual(result.get("risk_level"), "LOW")
        rules = " ".join(result.get("workflow_rules_enforced", []))
        self.assertTrue("MANDATORY APPROVAL" in rules or "reviews and approves" in rules)
        self.assertTrue("NO Manager approval on PO" in rules)

    @patch("tools.procurement_compliance._safe_get")
    async def test_po_from_unapproved_pr_flagged(self, mock_get):
        mock_get.side_effect = [
            [
                {
                    "id": "pr-22222222-0000-0000-0000-000000000001",
                    "status": "PENDING_APPROVAL",
                }
            ],
            [
                {
                    "id": "po-22222222-0000-0000-0000-000000000001",
                    "purchaseRequestId": "pr-22222222-0000-0000-0000-000000000001",
                    "status": "ORDERED",
                    "orderDate": "2026-03-02T10:00:00Z",
                }
            ],
        ]

        result = await check_workflow_compliance()
        self.assertGreaterEqual(result.get("total_violations"), 1)
        violations = result.get("violations", [])
        self.assertTrue(any("requires approved pr" in str(v.get("violations", [])).lower() for v in violations))

    @patch("tools.procurement_compliance._safe_get")
    async def test_approved_pr_missing_approver_identity(self, mock_get):
        mock_get.side_effect = [
            [
                {
                    "id": "pr-33333333-0000-0000-0000-000000000001",
                    "status": "APPROVED",
                    "approvedByName": None,
                    "approvedById": None,
                    "approvedAt": None,
                }
            ],
            [],
        ]

        result = await check_workflow_compliance()
        self.assertEqual(result.get("total_violations"), 1)
        viol = result.get("violations", [])[0]
        self.assertTrue(any("lacks manager approver" in msg.lower() for msg in viol.get("violations", [])))

    @patch("tools.procurement_compliance._safe_get")
    async def test_completed_po_with_zero_receipts(self, mock_get):
        mock_get.side_effect = [
            [],
            [
                {
                    "id": "po-44444444-0000-0000-0000-000000000001",
                    "status": "COMPLETED",
                    "orderDate": "2026-03-01T10:00:00Z",
                    "items": [{"ingredientId": "ing-1", "orderedQuantity": 10.0, "receivedQuantity": 0.0}],
                }
            ],
        ]

        result = await check_workflow_compliance()
        self.assertEqual(result.get("total_violations"), 1)
        viol = result.get("violations", [])[0]
        self.assertTrue(any("0 recorded received items" in msg.lower() for msg in viol.get("violations", [])))


class TestReceivingDiscrepanciesAndInvestigation(unittest.IsolatedAsyncioTestCase):
    """Test suite for receiving discrepancy audits and end-to-end transaction investigation."""

    @patch("tools.procurement_compliance._safe_get")
    async def test_receiving_discrepancy_over_and_under_receipt(self, mock_get):
        mock_get.side_effect = [
            [
                {
                    "id": "po-11111111-0000-0000-0000-000000000001",
                    "status": "RECEIVED",
                    "supplierName": "Produce Express",
                    "items": [
                        {"ingredientId": "ing-apple", "ingredientName": "Apple", "orderedQuantity": 50.0, "receivedQuantity": 60.0},
                        {"ingredientId": "ing-banana", "ingredientName": "Banana", "orderedQuantity": 40.0, "receivedQuantity": 30.0},
                    ],
                }
            ],
            [],  # Goods receipts
        ]

        result = await check_receiving_discrepancies()
        self.assertIsInstance(result, dict)
        self.assertEqual(result.get("discrepant_orders_count"), 1)
        rep = result.get("discrepancy_reports", [])[0]
        self.assertTrue(rep.get("has_discrepancies"))
        issues = rep.get("issues", [])
        self.assertTrue(any("over-receiving" in i.lower() for i in issues))
        self.assertTrue(any("under-receiving" in i.lower() for i in issues))

    @patch("tools.procurement_compliance._safe_get")
    async def test_receiving_discrepancy_damaged_goods_notes(self, mock_get):
        mock_get.side_effect = [
            [
                {
                    "id": "po-22222222-0000-0000-0000-000000000001",
                    "status": "PARTIALLY_RECEIVED",
                    "items": [{"ingredientId": "ing-eggs", "ingredientName": "Eggs", "orderedQuantity": 100.0, "receivedQuantity": 80.0}],
                }
            ],
            [
                {
                    "id": "gr-22222222-0000-0000-0000-000000000001",
                    "purchaseOrderId": "po-22222222-0000-0000-0000-000000000001",
                    "notes": "20 units damaged during transit / broken crates.",
                    "items": [{"ingredientId": "ing-eggs", "receivedQuantity": 80.0}],
                }
            ],
        ]

        result = await check_receiving_discrepancies()
        rep = result.get("discrepancy_reports", [])[0]
        self.assertTrue(len(rep.get("damaged_or_quality_notes", [])) > 0)
        self.assertTrue(any("damaged" in i.lower() for i in rep.get("issues", [])))

    @patch("tools.procurement_compliance._safe_get")
    async def test_receiving_due_today_not_overdue(self, mock_get):
        today_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT00:00:00Z")
        mock_get.side_effect = [
            [
                {
                    "id": "po-due-today-0000-0000-0000-000000000001",
                    "status": "ORDERED",
                    "expectedDeliveryDate": today_iso,
                    "items": [{"ingredientId": "ing-beans", "ingredientName": "Beans", "orderedQuantity": 15.0, "receivedQuantity": 0.0}],
                }
            ],
            [],
        ]

        result = await check_receiving_discrepancies()
        self.assertEqual(result.get("discrepant_orders_count"), 0)
        rep = result.get("discrepancy_reports", [])[0]
        self.assertFalse(rep.get("is_overdue"))
        self.assertFalse(rep.get("has_discrepancies"))

    @patch("tools.procurement_compliance._safe_get")
    async def test_receiving_past_expected_date_is_overdue(self, mock_get):
        yesterday_iso = (datetime.now(timezone.utc) - timedelta(days=2)).strftime("%Y-%m-%dT00:00:00Z")
        mock_get.side_effect = [
            [
                {
                    "id": "po-overdue-0000-0000-0000-000000000001",
                    "status": "ORDERED",
                    "expectedDeliveryDate": yesterday_iso,
                    "items": [{"ingredientId": "ing-beans", "ingredientName": "Beans", "orderedQuantity": 15.0, "receivedQuantity": 0.0}],
                }
            ],
            [],
        ]

        result = await check_receiving_discrepancies()
        self.assertEqual(result.get("discrepant_orders_count"), 1)
        rep = result.get("discrepancy_reports", [])[0]
        self.assertTrue(rep.get("is_overdue"))
        self.assertTrue(any("overdue" in i.lower() for i in rep.get("issues", [])))

    @patch("tools.procurement_compliance._safe_get")
    async def test_receiving_future_expected_date_not_overdue(self, mock_get):
        future_iso = (datetime.now(timezone.utc) + timedelta(days=5)).strftime("%Y-%m-%dT00:00:00Z")
        mock_get.side_effect = [
            [
                {
                    "id": "po-future-0000-0000-0000-000000000001",
                    "status": "ORDERED",
                    "expectedDeliveryDate": future_iso,
                    "items": [{"ingredientId": "ing-beans", "ingredientName": "Beans", "orderedQuantity": 15.0, "receivedQuantity": 0.0}],
                }
            ],
            [],
        ]

        result = await check_receiving_discrepancies()
        self.assertEqual(result.get("discrepant_orders_count"), 0)
        rep = result.get("discrepancy_reports", [])[0]
        self.assertFalse(rep.get("is_overdue"))
        self.assertFalse(rep.get("has_discrepancies"))

    @patch("tools.procurement_compliance._safe_get")
    async def test_complete_transaction_lifecycle_investigation(self, mock_get):
        # Full PR -> PO -> GR trace
        pr_id = "pr-33333333-0000-0000-0000-000000000001"
        po_id = "po-33333333-0000-0000-0000-000000000001"
        gr_id = "gr-33333333-0000-0000-0000-000000000001"

        mock_pos = [
            {
                "id": po_id,
                "purchaseRequestId": pr_id,
                "status": "RECEIVED",
                "supplierName": "Global Foods",
                "createdAt": "2026-03-02T10:00:00Z",
                "orderDate": "2026-03-02T11:00:00Z",
                "totalAmount": 250.0,
                "items": [{"ingredientId": "ing-cheese", "ingredientName": "Cheddar Cheese", "orderedQuantity": 10.0, "receivedQuantity": 10.0, "unitPrice": 25.0}],
            }
        ]
        mock_prs = [
            {
                "id": pr_id,
                "status": "APPROVED",
                "requestedByName": "Head Chef Gordon",
                "requestedAt": "2026-03-01T09:00:00Z",
                "approvedByName": "Manager Jane",
                "approvedAt": "2026-03-01T15:00:00Z",
                "reason": "Weekly dairy stock replenishment",
                "items": [{"ingredientId": "ing-cheese", "ingredientName": "Cheddar Cheese", "requestedQuantity": 10.0}],
            }
        ]
        mock_grs = [
            {
                "id": gr_id,
                "purchaseOrderId": po_id,
                "receivedByName": "Dock Clerk Sam",
                "receivedAt": "2026-03-04T14:00:00Z",
                "notes": "Delivered in good condition and temperature compliant.",
                "items": [{"ingredientId": "ing-cheese", "receivedQuantity": 10.0}],
            }
        ]

        mock_get.side_effect = [
            mock_pos, mock_prs, mock_grs,  # For investigate_procurement_transaction initial fetch
            mock_prs,                      # For duplicate PR check in compliance analysis
            mock_pos, mock_prs,            # For PR/PO consistency check
            mock_prs, mock_pos,            # For workflow compliance check
            mock_pos, mock_grs,            # For receiving discrepancy check
        ]

        result = await investigate_procurement_transaction(query_or_id=po_id)
        self.assertIsInstance(result, dict)
        self.assertTrue(result.get("found"))
        self.assertIsNotNone(result.get("purchase_request"))
        self.assertIsNotNone(result.get("purchase_order"))
        self.assertEqual(len(result.get("goods_receipts", [])), 1)

        # Timeline verification
        timeline = result.get("lifecycle_timeline", [])
        self.assertGreaterEqual(len(timeline), 4)
        stages = [e.get("stage") for e in timeline]
        self.assertIn("PURCHASE_REQUEST_CREATED", stages)
        self.assertIn("PURCHASE_REQUEST_APPROVED", stages)
        self.assertIn("PURCHASE_ORDER_CREATED", stages)
        self.assertIn("PURCHASE_ORDER_ORDERED", stages)

    @patch("tools.procurement_compliance._safe_get")
    async def test_investigation_not_found(self, mock_get):
        mock_get.side_effect = [[], [], []]
        result = await investigate_procurement_transaction(query_or_id="non-existent-po-999")
        self.assertFalse(result.get("found"))
        self.assertIn("No Purchase Order or Purchase Request", result.get("message"))

    @patch("tools.procurement_compliance._safe_get")
    async def test_analyze_procurement_compliance_with_backend_retrieval_failure(self, mock_get):
        # Simulate 403 Forbidden or network error on backend GET requests
        error_response = {
            "error": "Backend returned HTTP 403 for /api/PurchaseRequests.",
            "status_code": 403,
            "endpoint": "/api/PurchaseRequests",
            "is_backend_error": True,
        }
        mock_get.return_value = error_response

        result = await analyze_procurement_compliance()
        self.assertIsInstance(result, dict)
        self.assertEqual(result.get("overall_risk_level"), "AUDIT_INCOMPLETE")
        self.assertIsNone(result.get("risk_score"))
        self.assertGreaterEqual(len(result.get("system_diagnostics", [])), 1)
        self.assertTrue(any("Audit Incomplete" in r for r in result.get("recommended_review_actions", [])))


if __name__ == "__main__":
    unittest.main()

