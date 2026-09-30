"""
tests/test_procurement_compliance.py
────────────────────────────────────
Unit tests for AI-Powered Procurement Compliance and Investigation Tool.
Component 2 — Supplier & Procurement Management.
"""

from __future__ import annotations

import sys
import unittest
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


if __name__ == "__main__":
    unittest.main()
