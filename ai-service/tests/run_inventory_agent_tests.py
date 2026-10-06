"""
tests/run_inventory_agent_tests.py
──────────────────────────────────
Automated Test Runner & Pipeline Verification for Component 1 AI:
Inventory AI Agent, MCP Tools, and Interactive Guided Workflow Subsystem.
"""

from __future__ import annotations

from pathlib import Path
import sys
import unittest
from unittest.mock import MagicMock

# Ensure ai-service root is in sys.path
_ai_root = Path(__file__).resolve().parent.parent
if str(_ai_root) not in sys.path:
    sys.path.insert(0, str(_ai_root))

# Mock heavy ML dependencies for lightweight pipeline environments
for _mod in ("joblib", "ml", "ml.model", "sklearn", "pandas", "numpy"):
    if _mod not in sys.modules:
        sys.modules[_mod] = MagicMock()

from tests.test_inventory_agent_tools import (
    TestGuidedWorkflowsAgent,
    TestInventoryAgentTools,
)


def run_all_component1_ai_tests() -> bool:
    """Run all Component 1 AI agent unit and schema verification tests."""
    suite = unittest.TestSuite()
    loader = unittest.TestLoader()

    suite.addTests(loader.loadTestsFromTestCase(TestGuidedWorkflowsAgent))
    suite.addTests(loader.loadTestsFromTestCase(TestInventoryAgentTools))

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    print("\n" + "=" * 70)
    print(f"Component 1 Inventory AI Agent Test Results:")
    print(f"  Total Tests Run : {result.testsRun}")
    print(f"  Failures        : {len(result.failures)}")
    print(f"  Errors          : {len(result.errors)}")
    print(f"  Success Rate    : {((result.testsRun - len(result.failures) - len(result.errors)) / result.testsRun) * 100:.1f}%")
    print("=" * 70)

    return result.wasSuccessful()


if __name__ == "__main__":
    success = run_all_component1_ai_tests()
    sys.exit(0 if success else 1)
