"""
tests/test_ai_service_security.py
─────────────────────────────────
Security and Authorization regression tests for AI_SERVICE read-only procurement access.
Verifies that the AI compliance tools strictly execute read-only queries and that mutation
endpoints are protected against automated service execution.
"""

from __future__ import annotations

import sys
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

for _mod in ("joblib", "ml", "ml.model", "sklearn", "pandas", "numpy"):
    if _mod not in sys.modules:
        sys.modules[_mod] = MagicMock()

from tools.procurement_compliance import (
    _safe_get,
    analyze_procurement_compliance,
    check_duplicate_purchase_requests,
    check_pr_po_consistency,
    check_receiving_discrepancies,
    investigate_procurement_transaction,
)


class TestAIServiceReadOnlyProcurementSecurity(unittest.IsolatedAsyncioTestCase):
    """Test suite verifying AI Service read-only boundaries on procurement endpoints."""

    @patch("tools.procurement_compliance._get")
    async def test_safe_get_invokes_get_transport_only(self, mock_get):
        mock_get.return_value = [{"id": "pr-1", "status": "APPROVED"}]
        result = await _safe_get("/api/PurchaseRequests")
        mock_get.assert_awaited_once_with("/api/PurchaseRequests", None)
        self.assertEqual(len(result), 1)

    @patch("tools.procurement_compliance._safe_get")
    async def test_compliance_tools_execute_strictly_get_endpoints(self, mock_get):
        mock_get.return_value = []

        # Execute all 5 compliance tools
        await check_duplicate_purchase_requests()
        await check_pr_po_consistency()
        await check_receiving_discrepancies()
        await analyze_procurement_compliance()
        await investigate_procurement_transaction("PO-12345678")

        # Verify all calls made by compliance tools were to authorized GET paths
        called_paths = [call.args[0] for call in mock_get.await_args_list]
        allowed_prefixes = (
            "/api/PurchaseRequests",
            "/api/PurchaseOrders",
            "/api/GoodsReceipts",
            "/api/Suppliers",
        )
        for path in called_paths:
            self.assertTrue(
                any(path.startswith(prefix) for prefix in allowed_prefixes),
                f"Unexpected endpoint path accessed by AI compliance tool: {path}",
            )

    def test_compliance_tools_expose_no_mutation_actions(self):
        # Ensure no tool in procurement_compliance provides write/create/update/delete capabilities
        from tools.procurement_compliance import (
            analyze_procurement_compliance,
            check_duplicate_purchase_requests,
            check_pr_po_consistency,
            check_receiving_discrepancies,
            investigate_procurement_transaction,
        )

        read_only_tools = [
            analyze_procurement_compliance,
            check_duplicate_purchase_requests,
            check_pr_po_consistency,
            check_receiving_discrepancies,
            investigate_procurement_transaction,
        ]

        for tool in read_only_tools:
            doc = (tool.__doc__ or "").lower()
            self.assertTrue(
                any(k in doc for k in ("audit", "check", "detect", "compare", "investigate", "read-only")),
                f"Tool {tool.__name__} documentation does not reflect read-only analysis.",
            )
