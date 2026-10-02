"""
tests/run_procurement_tests.py
──────────────────────────────
End-to-End Regression Test Runner & Pipeline Verification for Component 2 AI.
Procurement Compliance, Audit, Governance, and Investigation.
"""

from __future__ import annotations

import os
from pathlib import Path
import sys
import unittest
from unittest.mock import MagicMock

# Ensure ai-service root is in sys.path
_ai_root = Path(__file__).resolve().parent.parent
if str(_ai_root) not in sys.path:
    sys.path.insert(0, str(_ai_root))

# Mock ML dependencies for lightweight pipeline environments
for _mod in ("joblib", "ml", "ml.model", "sklearn", "pandas", "numpy"):
    if _mod not in sys.modules:
        sys.modules[_mod] = MagicMock()

from agent import _procurement_intent_from_request, _normalize_procurement_query
from tests.test_procurement_compliance import (
    TestDuplicatePurchaseRequestDetection,
    TestPRtoPOConsistency,
    TestWorkflowCompliance,
    TestReceivingDiscrepanciesAndInvestigation,
)


class TestProcurementRoutingRegression(unittest.TestCase):
    """Verify natural language routing and query normalization for procurement AI."""

    def test_quick_action_phrase_routing(self):
        quick_actions = [
            "Audit overall procurement compliance across all active purchase requests and purchase orders.",
            "Check for duplicate purchase requests within the last 14 days and flag potential duplicate orders.",
            "Verify consistency between purchase orders and their linked purchase requests for quantity and item mismatches.",
            "Audit receiving discrepancies and delivery quantity variances between goods receipts and purchase orders.",
        ]
        for qa in quick_actions:
            intent = _procurement_intent_from_request(qa)
            self.assertEqual(intent, "PROCUREMENT_COMPLIANCE_INVESTIGATION", f"Failed for quick action: {qa}")

    def test_transaction_code_routing(self):
        codes = [
            "Investigate transaction PO-EE1E95F7",
            "What is the status of PR-5A8F853C?",
            "Audit PO-102 line items",
            "Show trace for GR-3F2A10B4",
        ]
        for c in codes:
            intent = _procurement_intent_from_request(c)
            self.assertEqual(intent, "PROCUREMENT_COMPLIANCE_INVESTIGATION", f"Failed for transaction code query: {c}")

    def test_query_normalization_directives(self):
        norm1 = _normalize_procurement_query("Audit procurement")
        self.assertIn("analyze_procurement_compliance", norm1)

        norm2 = _normalize_procurement_query("Check duplicate PRs")
        self.assertIn("check_duplicate_purchase_requests", norm2)

        norm3 = _normalize_procurement_query("Verify PR-PO match")
        self.assertIn("check_pr_po_consistency", norm3)

        norm4 = _normalize_procurement_query("Receiving variances")
        self.assertIn("check_receiving_discrepancies", norm4)

        norm5 = _normalize_procurement_query("Investigate PO-ABCD1234")
        self.assertIn("investigate_procurement_transaction", norm5)
        self.assertIn("PO-ABCD1234", norm5)


class TestReadOnlyGovernanceSafety(unittest.TestCase):
    """Verify strict read-only boundary constraints on Component 2 AI."""

    def test_tool_definitions_are_read_only(self):
        import tools.procurement_compliance as pc
        # Ensure no write endpoints (POST, PUT, DELETE, PATCH) are invoked in procurement compliance
        source_code = open(pc.__file__, "r", encoding="utf-8").read()
        self.assertNotIn("requests.post", source_code)
        self.assertNotIn("requests.delete", source_code)
        self.assertNotIn("requests.put", source_code)
        self.assertNotIn("requests.patch", source_code)
        self.assertNotIn("httpx.post", source_code)
        self.assertNotIn("httpx.delete", source_code)
        self.assertNotIn("httpx.put", source_code)
        self.assertNotIn("httpx.patch", source_code)


def main():
    print("=" * 80)
    print("  COMPONENT 2: AI PROCUREMENT COMPLIANCE & INVESTIGATION REGRESSION SUITE")
    print("=" * 80)

    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    # Add all test classes
    suite.addTests(loader.loadTestsFromTestCase(TestProcurementRoutingRegression))
    suite.addTests(loader.loadTestsFromTestCase(TestReadOnlyGovernanceSafety))
    suite.addTests(loader.loadTestsFromTestCase(TestDuplicatePurchaseRequestDetection))
    suite.addTests(loader.loadTestsFromTestCase(TestPRtoPOConsistency))
    suite.addTests(loader.loadTestsFromTestCase(TestWorkflowCompliance))
    suite.addTests(loader.loadTestsFromTestCase(TestReceivingDiscrepanciesAndInvestigation))

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    print("\n" + "=" * 80)
    print(f"  REGRESSION SUMMARY: Tests Run: {result.testsRun} | Failures: {len(result.failures)} | Errors: {len(result.errors)}")
    print("=" * 80)

    if not result.wasSuccessful():
        sys.exit(1)
    print("  [PASS] ALL COMPONENT 2 PROCUREMENT AI REGRESSION TESTS PASSED.")
    sys.exit(0)


if __name__ == "__main__":
    main()
