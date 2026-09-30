"""
tools/procurement_compliance.py
──────────────────────────────
AI-Powered Procurement Compliance, Audit, and Investigation Tool.

Audits existing procurement transactions across:
1. Duplicate Purchase Request Detection (temporal, item, requester similarity)
2. PR → PO Consistency & Quantity Verification
3. Approval Workflow Compliance & Governance Rules
4. Receiving Discrepancy & Variance Detection
5. Overall Procurement Compliance Risk Analysis (LOW / MEDIUM / HIGH)
6. Transaction Investigation Chain & Traceability

Strictly read-only analysis: Detect → Analyze → Explain → Report.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from google.generativeai.types import FunctionDeclaration, Tool

from .inventory import _get


async def _safe_get(path: str, params: dict[str, Any] | None = None) -> Any:
    """Safely fetch backend data with structured error handling."""
    try:
        return await _get(path, params)
    except httpx.HTTPStatusError as exc:
        return {
            "error": f"Backend returned HTTP {exc.response.status_code}.",
            "status_code": exc.response.status_code,
            "endpoint": path,
        }
    except Exception as exc:
        return {"error": f"Backend data request failed: {exc}", "endpoint": path}


def _clean_id(raw_id: str | None) -> str:
    """Normalize user input ID by stripping prefixes like PR-, PO-, spaces, and casing."""
    if not raw_id:
        return ""
    cleaned = raw_id.strip()
    if cleaned.upper().startswith("PR-"):
        cleaned = cleaned[3:]
    elif cleaned.upper().startswith("PO-"):
        cleaned = cleaned[3:]
    elif cleaned.upper().startswith("GR-"):
        cleaned = cleaned[3:]
    return cleaned.strip().lower()


def _id_matches(target_id: str, candidate_id: str | None) -> bool:
    """Check if target_id matches candidate_id either as full GUID or prefix."""
    if not candidate_id or not target_id:
        return False
    t = _clean_id(target_id)
    c = _clean_id(candidate_id)
    return t == c or c.startswith(t) or t.startswith(c)


# ═══════════════════════════════════════════════════════════════════════════════
# 1. DUPLICATE PURCHASE REQUEST DETECTION
# ═══════════════════════════════════════════════════════════════════════════════

async def check_duplicate_purchase_requests(
    window_days: int = 7,
    similarity_threshold: float = 0.75,
) -> dict[str, Any]:
    """
    Detect potentially duplicated Purchase Requests within a temporal window.
    Compares requested ingredients, quantities, requester, and submission timing.
    """
    window_days = max(1, min(int(window_days), 90))
    prs = await _safe_get("/api/PurchaseRequests")
    if isinstance(prs, dict) and "error" in prs:
        return prs

    if not isinstance(prs, list) or len(prs) == 0:
        return {
            "window_days": window_days,
            "total_requests_analyzed": 0,
            "duplicate_groups": [],
            "duplicate_count": 0,
            "risk_level": "LOW",
            "summary": "No purchase requests available in the system for duplicate analysis.",
        }

    # Parse requested dates
    parsed_prs = []
    for pr in prs:
        req_at = None
        raw_dt = pr.get("requestedAt") or pr.get("createdAt")
        if raw_dt:
            try:
                req_at = datetime.fromisoformat(str(raw_dt).replace("Z", "+00:00"))
            except (ValueError, TypeError):
                req_at = None
        parsed_prs.append({"raw": pr, "requested_at": req_at})

    duplicate_groups = []
    checked_pairs = set()

    for i in range(len(parsed_prs)):
        for j in range(i + 1, len(parsed_prs)):
            pr1_info = parsed_prs[i]
            pr2_info = parsed_prs[j]
            pr1 = pr1_info["raw"]
            pr2 = pr2_info["raw"]

            pair_key = tuple(sorted([pr1.get("id"), pr2.get("id")]))
            if pair_key in checked_pairs:
                continue
            checked_pairs.add(pair_key)

            # Skip comparing two cancelled or rejected requests
            if pr1.get("status") in ("CANCELLED", "REJECTED") and pr2.get("status") in ("CANCELLED", "REJECTED"):
                continue

            # Check temporal window if dates available
            if pr1_info["requested_at"] and pr2_info["requested_at"]:
                diff_days = abs((pr1_info["requested_at"] - pr2_info["requested_at"]).total_seconds()) / 86400.0
                if diff_days > window_days:
                    continue
            else:
                diff_days = 0.0

            # Compare items
            items1 = {it.get("ingredientId"): float(it.get("requestedQuantity", 0)) for it in pr1.get("items", [])}
            items2 = {it.get("ingredientId"): float(it.get("requestedQuantity", 0)) for it in pr2.get("items", [])}

            if not items1 or not items2:
                continue

            common_ings = set(items1.keys()).intersection(set(items2.keys()))
            if not common_ings:
                continue

            # Calculate Jaccard item similarity
            all_ings = set(items1.keys()).union(set(items2.keys()))
            item_similarity = len(common_ings) / len(all_ings)

            # Calculate quantity similarity for common ingredients
            qty_similarities = []
            for ing_id in common_ings:
                q1 = items1[ing_id]
                q2 = items2[ing_id]
                max_q = max(q1, q2)
                if max_q > 0:
                    qty_sim = min(q1, q2) / max_q
                    qty_similarities.append(qty_sim)
                else:
                    qty_similarities.append(1.0)

            avg_qty_sim = sum(qty_similarities) / len(qty_similarities) if qty_similarities else 0.0
            raw_score = (item_similarity * 0.6) + (avg_qty_sim * 0.4)

            # Requester match bonus
            same_requester = bool(
                (pr1.get("requestedById") and pr1.get("requestedById") == pr2.get("requestedById"))
                or (pr1.get("requestedByName") and pr1.get("requestedByName") == pr2.get("requestedByName"))
            )

            # Apply +0.10 bonus (capped at 1.0) when submitted by the same requester
            overall_score = min(1.0, raw_score + (0.10 if same_requester else 0.0))

            pr1_active = pr1.get("status") in ("PENDING_APPROVAL", "APPROVED", "DRAFT")
            pr2_active = pr2.get("status") in ("PENDING_APPROVAL", "APPROVED", "DRAFT")
            has_active_risk = pr1_active or pr2_active

            if overall_score >= similarity_threshold or (item_similarity == 1.0 and avg_qty_sim >= 0.8):
                # Build item breakdown description
                matched_items = []
                for it in pr1.get("items", []):
                    ing_id = it.get("ingredientId")
                    if ing_id in items2:
                        matched_items.append({
                            "ingredient_name": it.get("ingredientName") or "Ingredient",
                            "pr1_quantity": items1[ing_id],
                            "pr2_quantity": items2[ing_id],
                            "unit": it.get("ingredientUnit") or "units",
                        })

                pr1_code = f"PR-{pr1.get('id', '')[:8].upper()}"
                pr2_code = f"PR-{pr2.get('id', '')[:8].upper()}"
                explanation = (
                    f"{pr2_code} ({pr2.get('status', 'UNKNOWN')}) requested items matching "
                    f"{pr1_code} ({pr1.get('status', 'UNKNOWN')}) submitted {round(diff_days, 1)} days apart "
                    f"with {round(overall_score * 100, 1)}% similarity"
                    + (" by the same requester." if same_requester else ".")
                )

                duplicate_groups.append({
                    "primary_pr_id": pr1.get("id"),
                    "primary_pr_code": pr1_code,
                    "primary_pr_status": pr1.get("status"),
                    "primary_requester": pr1.get("requestedByName") or "Staff",
                    "primary_date": str(pr1.get("requestedAt"))[:10],
                    "similar_pr_id": pr2.get("id"),
                    "similar_pr_code": pr2_code,
                    "similar_pr_status": pr2.get("status"),
                    "similar_requester": pr2.get("requestedByName") or "Staff",
                    "similar_date": str(pr2.get("requestedAt"))[:10],
                    "days_apart": round(diff_days, 1),
                    "similarity_score": round(overall_score * 100, 1),
                    "same_requester": same_requester,
                    "is_active_risk": has_active_risk,
                    "matched_items": matched_items,
                    "explanation": explanation,
                })

    risk_level = "HIGH" if len(duplicate_groups) >= 3 else ("MEDIUM" if len(duplicate_groups) >= 1 else "LOW")

    return {
        "window_days": window_days,
        "total_requests_analyzed": len(prs),
        "duplicate_count": len(duplicate_groups),
        "duplicate_groups": duplicate_groups,
        "risk_level": risk_level,
        "summary": (
            f"Detected {len(duplicate_groups)} potential duplicate Purchase Request pairs "
            f"within a {window_days}-day window."
            if duplicate_groups
            else f"No duplicate Purchase Requests detected across {len(prs)} analyzed requisitions."
        ),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# 2. PR → PO CONSISTENCY CHECK
# ═══════════════════════════════════════════════════════════════════════════════

async def check_pr_po_consistency(
    purchase_order_id: str = "",
    purchase_request_id: str = "",
) -> dict[str, Any]:
    """
    Compare Purchase Orders against their linked Purchase Requests.
    Detects quantity discrepancies, missing/extra line items, and unapproved sources.
    """
    pos_data = await _safe_get("/api/PurchaseOrders")
    if isinstance(pos_data, dict) and "error" in pos_data:
        return pos_data

    prs_data = await _safe_get("/api/PurchaseRequests")
    if isinstance(prs_data, dict) and "error" in prs_data:
        return prs_data

    pos = pos_data if isinstance(pos_data, list) else []
    prs_map = {pr["id"]: pr for pr in prs_data if isinstance(pr, dict) and "id" in pr}

    # Filter POs if specific ID provided
    if purchase_order_id:
        pos = [p for p in pos if _id_matches(purchase_order_id, p.get("id"))]

    # Filter by PR ID if provided
    if purchase_request_id:
        pos = [p for p in pos if _id_matches(purchase_request_id, p.get("purchaseRequestId"))]

    if not pos:
        return {
            "total_orders_analyzed": 0,
            "inconsistent_orders_count": 0,
            "consistency_reports": [],
            "risk_level": "LOW",
            "summary": "No matching purchase orders found for consistency verification.",
        }

    reports = []
    total_mismatches = 0

    for po in pos:
        po_id = po.get("id", "")
        po_code = f"PO-{po_id[:8].upper()}"
        pr_id = po.get("purchaseRequestId")
        po_items = po.get("items", [])
        po_status = po.get("status")

        po_item_map = {it.get("ingredientId"): it for it in po_items}

        if not pr_id:
            # Direct PO without linked PR
            reports.append({
                "purchase_order_id": po_id,
                "purchase_order_code": po_code,
                "status": po_status,
                "supplier_name": po.get("supplierName") or "Vendor",
                "linked_pr_id": None,
                "linked_pr_code": None,
                "is_linked_to_pr": False,
                "has_discrepancies": False,
                "issues": ["Direct PO placed without a referenced Purchase Request requisition."],
                "item_comparisons": [],
                "risk_level": "LOW",
            })
            continue

        pr = prs_map.get(pr_id)
        if not pr:
            # Attempt fetching single PR directly
            pr = await _safe_get(f"/api/PurchaseRequests/{pr_id}")
            if isinstance(pr, dict) and "error" in pr:
                pr = None

        if not pr:
            total_mismatches += 1
            reports.append({
                "purchase_order_id": po_id,
                "purchase_order_code": po_code,
                "status": po_status,
                "supplier_name": po.get("supplierName") or "Vendor",
                "linked_pr_id": pr_id,
                "linked_pr_code": f"PR-{pr_id[:8].upper()}",
                "is_linked_to_pr": True,
                "has_discrepancies": True,
                "issues": [f"Linked Purchase Request {pr_id[:8].upper()} could not be found in active records."],
                "item_comparisons": [],
                "risk_level": "HIGH",
            })
            continue

        pr_code = f"PR-{pr.get('id', '')[:8].upper()}"
        pr_status = pr.get("status")
        pr_items = pr.get("items", [])
        pr_item_map = {it.get("ingredientId"): it for it in pr_items}

        issues = []
        item_comparisons = []

        # Check if PR was approved
        if pr_status != "APPROVED":
            issues.append(f"PO is linked to PR {pr_code} which is '{pr_status}' (not APPROVED).")

        # Compare items in PR
        total_po_amount = float(po.get("totalAmount", 0)) or sum(
            float(it.get("orderedQuantity", 0)) * float(it.get("unitPrice", 0)) for it in po_items
        )
        unauthorized_variance_cost = 0.0

        for ing_id, pr_item in pr_item_map.items():
            ing_name = pr_item.get("ingredientName") or "Ingredient"
            req_qty = float(pr_item.get("requestedQuantity", 0))
            po_item = po_item_map.get(ing_id)

            if po_item is None:
                issues.append(f"PR item '{ing_name}' ({req_qty} {pr_item.get('ingredientUnit', '')}) was omitted from the Purchase Order.")
                item_comparisons.append({
                    "ingredient_id": ing_id,
                    "ingredient_name": ing_name,
                    "requested_quantity": req_qty,
                    "ordered_quantity": 0.0,
                    "unit_price": 0.0,
                    "variance": -req_qty,
                    "variance_percentage": -100.0,
                    "cost_impact": 0.0,
                    "status": "OMITTED_IN_PO",
                })
            else:
                ord_qty = float(po_item.get("orderedQuantity", 0))
                unit_price = float(po_item.get("unitPrice", 0))
                variance = ord_qty - req_qty
                var_pct = round((variance / req_qty) * 100, 1) if req_qty > 0 else 0.0

                comp_status = "MATCH"
                item_cost_impact = 0.0
                if abs(variance) > 0.001:
                    if ord_qty > req_qty:
                        comp_status = "PO_QUANTITY_EXCEEDS_PR"
                        item_cost_impact = round((ord_qty - req_qty) * unit_price, 2)
                        unauthorized_variance_cost += item_cost_impact
                        issues.append(
                            f"Quantity mismatch for '{ing_name}': Approved PR requested {req_qty} {pr_item.get('ingredientUnit', '')}, "
                            f"but PO ordered {ord_qty} (+{var_pct}%). Financial delta: +${item_cost_impact:,.2f}."
                        )
                    else:
                        comp_status = "PO_QUANTITY_LESS_THAN_PR"
                        issues.append(
                            f"Quantity mismatch for '{ing_name}': Approved PR requested {req_qty} {pr_item.get('ingredientUnit', '')}, "
                            f"but PO ordered {ord_qty} ({var_pct}%)."
                        )

                item_comparisons.append({
                    "ingredient_id": ing_id,
                    "ingredient_name": ing_name,
                    "requested_quantity": req_qty,
                    "ordered_quantity": ord_qty,
                    "unit_price": unit_price,
                    "variance": round(variance, 2),
                    "variance_percentage": var_pct,
                    "cost_impact": item_cost_impact,
                    "status": comp_status,
                })

        # Check for extra items in PO not in PR
        for ing_id, po_item in po_item_map.items():
            if ing_id not in pr_item_map:
                ing_name = po_item.get("ingredientName") or "Ingredient"
                ord_qty = float(po_item.get("orderedQuantity", 0))
                unit_price = float(po_item.get("unitPrice", 0))
                extra_item_cost = round(ord_qty * unit_price, 2)
                unauthorized_variance_cost += extra_item_cost
                issues.append(
                    f"Extra item '{ing_name}' ({ord_qty} units @ ${unit_price:,.2f}) in PO was never requested in approved PR {pr_code}. "
                    f"Cost impact: +${extra_item_cost:,.2f}."
                )
                item_comparisons.append({
                    "ingredient_id": ing_id,
                    "ingredient_name": ing_name,
                    "requested_quantity": 0.0,
                    "ordered_quantity": ord_qty,
                    "unit_price": unit_price,
                    "variance": ord_qty,
                    "variance_percentage": 100.0,
                    "cost_impact": extra_item_cost,
                    "status": "EXTRA_ITEM_IN_PO",
                })

        if unauthorized_variance_cost > 0:
            issues.append(
                f"Financial variance on {po_code}: ${unauthorized_variance_cost:,.2f} in unauthorized or inflated spend compared to approved requisition."
            )

        has_discrepancy = len(issues) > 0
        if has_discrepancy:
            total_mismatches += 1

        po_risk = "HIGH" if (pr_status != "APPROVED" or unauthorized_variance_cost > 100 or any(c.get("variance_percentage", 0) > 30 for c in item_comparisons)) else ("MEDIUM" if has_discrepancy else "LOW")

        reports.append({
            "purchase_order_id": po_id,
            "purchase_order_code": po_code,
            "status": po_status,
            "supplier_name": po.get("supplierName") or "Vendor",
            "total_ordered_amount": round(total_po_amount, 2),
            "unauthorized_spend_variance": round(unauthorized_variance_cost, 2),
            "has_financial_variance": unauthorized_variance_cost > 0,
            "linked_pr_id": pr_id,
            "linked_pr_code": pr_code,
            "linked_pr_status": pr_status,
            "linked_pr_approver": pr.get("approvedByName"),
            "is_linked_to_pr": True,
            "has_discrepancies": has_discrepancy,
            "issues": issues,
            "item_comparisons": item_comparisons,
            "risk_level": po_risk,
        })

    overall_risk = "HIGH" if any(r["risk_level"] == "HIGH" for r in reports) else ("MEDIUM" if total_mismatches > 0 else "LOW")

    return {
        "total_orders_analyzed": len(reports),
        "inconsistent_orders_count": total_mismatches,
        "consistency_reports": reports,
        "risk_level": overall_risk,
        "summary": (
            f"Identified {total_mismatches} Purchase Order(s) with PR consistency issues or quantity variances."
            if total_mismatches > 0
            else f"All {len(reports)} analyzed Purchase Orders match their approved Purchase Requests consistently."
        ),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# 3. APPROVAL WORKFLOW COMPLIANCE
# ═══════════════════════════════════════════════════════════════════════════════

async def check_workflow_compliance(
    purchase_order_id: str = "",
    purchase_request_id: str = "",
) -> dict[str, Any]:
    """
    Validate the restaurant procurement governance flow:
    1. Staff creates PR -> Submits PR
    2. Manager Approves PR (Manager Approval is REQUIRED on PR)
    3. Procurement creates PO as DRAFT from approved PR
    4. Procurement Officer reviews & explicitly clicks 'Order PO' -> ORDERED (No PO Manager approval!)
    5. Goods receiving -> PARTIALLY_RECEIVED / COMPLETED
    """
    prs_data = await _safe_get("/api/PurchaseRequests")
    pos_data = await _safe_get("/api/PurchaseOrders")

    prs = prs_data if isinstance(prs_data, list) else []
    pos = pos_data if isinstance(pos_data, list) else []

    prs_map = {p["id"]: p for p in prs if isinstance(p, dict) and "id" in p}

    if purchase_order_id:
        pos = [p for p in pos if _id_matches(purchase_order_id, p.get("id"))]

    if purchase_request_id:
        prs = [p for p in prs if _id_matches(purchase_request_id, p.get("id"))]
        pos = [p for p in pos if _id_matches(purchase_request_id, p.get("purchaseRequestId"))]

    violations = []
    compliant_records = []

    # Check Purchase Requests workflow
    for pr in prs:
        pr_id = pr.get("id", "")
        pr_code = f"PR-{pr_id[:8].upper()}"
        pr_status = pr.get("status")

        pr_issues = []
        if pr_status == "APPROVED":
            if not pr.get("approvedByName") and not pr.get("approvedById"):
                pr_issues.append(f"{pr_code} is marked APPROVED but lacks manager approver signature/identity.")
            if not pr.get("approvedAt"):
                pr_issues.append(f"{pr_code} is marked APPROVED but lacks approval timestamp.")
        elif pr_status == "PENDING_APPROVAL":
            # Check for aging pending requests (> 7 days without manager action)
            raw_dt = pr.get("requestedAt") or pr.get("createdAt")
            if raw_dt:
                try:
                    req_date = datetime.fromisoformat(str(raw_dt).replace("Z", "+00:00"))
                    now_utc = datetime.now(timezone.utc)
                    if (now_utc - req_date).total_seconds() > (7 * 86400):
                        pr_issues.append(
                            f"{pr_code} has been in PENDING_APPROVAL status for over 7 days without Restaurant Manager review."
                        )
                except (ValueError, TypeError):
                    pass

        if pr_issues:
            violations.append({
                "entity_type": "PURCHASE_REQUEST",
                "entity_id": pr_id,
                "entity_code": pr_code,
                "status": pr_status,
                "violations": pr_issues,
                "severity": "HIGH" if any("lacks manager" in i for i in pr_issues) else "MEDIUM",
            })
        else:
            compliant_records.append({"entity_type": "PURCHASE_REQUEST", "entity_code": pr_code})

    # Check Purchase Orders workflow
    for po in pos:
        po_id = po.get("id", "")
        po_code = f"PO-{po_id[:8].upper()}"
        po_status = po.get("status")
        pr_id = po.get("purchaseRequestId")

        po_issues = []

        if not pr_id:
            # Direct PO placed without referencing an approved PR requisition
            po_issues.append(
                f"{po_code} was created as a Direct PO without a linked Purchase Request requisition. "
                "Ensure emergency or direct purchasing policies are documented."
            )
        else:
            pr = prs_map.get(pr_id)
            if pr:
                pr_code = f"PR-{pr.get('id', '')[:8].upper()}"
                if pr.get("status") != "APPROVED":
                    po_issues.append(
                        f"CRITICAL: {po_code} was generated from {pr_code} which is in '{pr.get('status')}' status. "
                        "Governance violation: Purchase Orders can only be generated from APPROVED Purchase Requests."
                    )
            else:
                po_issues.append(f"{po_code} references nonexistent or deleted PR ID {pr_id[:8].upper()}.")

        # Validate order lifecycle states
        if po_status in ("ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "COMPLETED"):
            if not po.get("orderDate"):
                po_issues.append(f"{po_code} is in status '{po_status}' but lacks recorded supplier placement orderDate.")

        if po_status in ("PARTIALLY_RECEIVED", "RECEIVED", "COMPLETED"):
            # Check receiving items have recorded quantities
            total_rcv = sum(float(it.get("receivedQuantity", 0)) for it in po.get("items", []))
            if total_rcv <= 0 and po_status in ("RECEIVED", "COMPLETED"):
                po_issues.append(f"{po_code} is marked '{po_status}' but has 0 recorded received items.")

        if po_issues:
            has_critical = any("CRITICAL" in v or "nonexistent" in v for v in po_issues)
            violations.append({
                "entity_type": "PURCHASE_ORDER",
                "entity_id": po_id,
                "entity_code": po_code,
                "status": po_status,
                "violations": po_issues,
                "severity": "HIGH" if has_critical else "MEDIUM",
            })
        else:
            compliant_records.append({"entity_type": "PURCHASE_ORDER", "entity_code": po_code})

    risk_level = "HIGH" if any(v.get("severity") == "HIGH" for v in violations) else ("MEDIUM" if violations else "LOW")

    return {
        "workflow_rules_enforced": [
            "Staff creates and submits Purchase Request (PR)",
            "Restaurant Manager reviews and approves Purchase Request (MANDATORY APPROVAL)",
            "Procurement Officer creates Purchase Order (PO) from approved PR (DRAFT)",
            "Procurement Officer reviews and orders PO directly with vendor (NO PO Manager Approval)",
            "Inventory / Warehouse staff receives goods against active ORDERED PO",
        ],
        "governance_note": (
            "Purchase Requests strictly require Restaurant Manager approval. "
            "Purchase Orders are ordered directly by the Procurement Officer without a second manager approval step."
        ),
        "total_entities_checked": len(prs) + len(pos),
        "compliant_records_count": len(compliant_records),
        "violation_count": len(violations),
        "violations": violations,
        "risk_level": risk_level,
        "summary": (
            f"Detected {len(violations)} workflow compliance issue(s) across procurement transactions."
            if violations
            else f"All {len(compliant_records)} evaluated transactions strictly adhere to the restaurant procurement governance flow."
        ),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# 4. RECEIVING DISCREPANCY DETECTION
# ═══════════════════════════════════════════════════════════════════════════════

async def check_receiving_discrepancies(
    purchase_order_id: str = "",
) -> dict[str, Any]:
    """
    Compare ordered line items with received line items from Goods Receipts.
    Identifies over-receiving, under-receiving, damaged goods, and fulfillment variances.
    """
    pos_data = await _safe_get("/api/PurchaseOrders")
    receipts_data = await _safe_get("/api/GoodsReceipts")

    if isinstance(pos_data, dict) and "error" in pos_data:
        return pos_data

    pos = pos_data if isinstance(pos_data, list) else []
    receipts = receipts_data if isinstance(receipts_data, list) else []

    if purchase_order_id:
        pos = [p for p in pos if _id_matches(purchase_order_id, p.get("id"))]

    discrepancy_reports = []
    total_discrepancies = 0
    total_overdue = 0
    total_damaged = 0
    now_utc = datetime.now(timezone.utc)

    damage_keywords = ("damag", "broken", "spoil", "leak", "crush", "substandard", "defect", "torn", "reject", "rot")

    for po in pos:
        po_id = po.get("id", "")
        po_code = f"PO-{po_id[:8].upper()}"
        po_status = po.get("status")

        # Receipts for this PO
        po_receipts = [r for r in receipts if _id_matches(po_id, r.get("purchaseOrderId"))]

        # Aggregate received quantities across all goods receipts for this PO by ingredientId
        receipt_received_by_ing = {}
        for rc in po_receipts:
            for r_it in rc.get("items", []):
                ing_id = r_it.get("ingredientId")
                qty = float(r_it.get("receivedQuantity", 0)) or float(r_it.get("quantity", 0))
                receipt_received_by_ing[ing_id] = receipt_received_by_ing.get(ing_id, 0.0) + qty

        item_variances = []
        issues = []
        is_overdue = False
        days_overdue = 0

        # Check for overdue/unresolved delivery timeline
        if po_status in ("ORDERED", "PARTIALLY_RECEIVED"):
            expected_delivery_raw = po.get("expectedDeliveryDate")
            if expected_delivery_raw:
                try:
                    exp_dt = datetime.fromisoformat(str(expected_delivery_raw).replace("Z", "+00:00"))
                    if now_utc > exp_dt:
                        is_overdue = True
                        days_overdue = max(1, (now_utc - exp_dt).days)
                        issues.append(
                            f"DELIVERY OVERDUE: {po_code} expected by {exp_dt.strftime('%Y-%m-%d')} "
                            f"is overdue by {days_overdue} day(s) in '{po_status}' status."
                        )
                        total_overdue += 1
                except (ValueError, TypeError):
                    pass
            else:
                # If no expected date, check if ordered/created > 14 days ago
                placed_raw = po.get("orderDate") or po.get("createdAt")
                if placed_raw:
                    try:
                        placed_dt = datetime.fromisoformat(str(placed_raw).replace("Z", "+00:00"))
                        age_days = (now_utc - placed_dt).days
                        if age_days > 14:
                            is_overdue = True
                            days_overdue = age_days
                            issues.append(
                                f"UNRESOLVED ORDER: {po_code} was placed {age_days} days ago "
                                f"without recorded delivery completion."
                            )
                            total_overdue += 1
                    except (ValueError, TypeError):
                        pass

        for item in po.get("items", []):
            ing_id = item.get("ingredientId")
            ing_name = item.get("ingredientName") or "Ingredient"
            ord_qty = float(item.get("orderedQuantity", 0)) or float(item.get("quantity", 0))
            rcv_qty_po = float(item.get("receivedQuantity", 0))
            rcv_qty_receipts = receipt_received_by_ing.get(ing_id, 0.0)
            rcv_qty = max(rcv_qty_po, rcv_qty_receipts)
            diff = rcv_qty - ord_qty

            if ord_qty > 0:
                pct = round((diff / ord_qty) * 100, 1)
            else:
                pct = 0.0

            status_label = "MATCH"
            if rcv_qty > ord_qty:
                status_label = "OVER_RECEIVED"
                issues.append(
                    f"Over-receiving on '{ing_name}': Ordered {ord_qty} {item.get('ingredientUnit', '')}, "
                    f"but received {rcv_qty} (+{pct}% over-delivery)."
                )
            elif rcv_qty < ord_qty and po_status in ("COMPLETED", "RECEIVED"):
                status_label = "UNDER_RECEIVED_COMPLETED"
                issues.append(
                    f"Under-receiving on completed PO for '{ing_name}': Ordered {ord_qty}, "
                    f"only received {rcv_qty} ({pct}% deficit)."
                )
            elif rcv_qty < ord_qty and po_status == "PARTIALLY_RECEIVED":
                status_label = "PARTIALLY_FULFILLED"

            item_variances.append({
                "ingredient_id": item.get("ingredientId"),
                "ingredient_name": ing_name,
                "ingredient_unit": item.get("ingredientUnit"),
                "ordered_quantity": ord_qty,
                "received_quantity": rcv_qty,
                "variance": round(diff, 2),
                "variance_percentage": pct,
                "unit_price": float(item.get("unitPrice", 0)),
                "cost_impact": round(diff * float(item.get("unitPrice", 0)), 2),
                "variance_type": status_label,
            })

        # Check receipt items and notes for damaged/rejected goods
        damaged_items = []
        for rc in po_receipts:
            rc_notes = str(rc.get("notes") or "")
            rc_id = rc.get("id", "")
            rc_code = f"GR-{rc_id[:8].upper()}" if rc_id else "GR"

            # Check receipt-level notes for damage indications
            if any(k in rc_notes.lower() for k in damage_keywords):
                damaged_items.append({
                    "receipt_id": rc_id,
                    "receipt_code": rc_code,
                    "source": "RECEIPT_NOTES",
                    "ingredient_name": "General Delivery Goods",
                    "rejected_quantity": 0,
                    "rejection_reason": rc_notes,
                })
                issues.append(
                    f"Receipt {rc_code} notes indicate damaged/compromised shipment: '{rc_notes}'"
                )

            # Check individual item rejections
            for r_it in rc.get("items", []):
                rej_qty = float(r_it.get("rejectedQuantity", 0))
                item_reason = str(r_it.get("rejectionReason") or "")
                if rej_qty > 0 or any(k in item_reason.lower() for k in damage_keywords):
                    ing_n = r_it.get("ingredientName") or "Ingredient"
                    damaged_items.append({
                        "receipt_id": rc_id,
                        "receipt_code": rc_code,
                        "source": "ITEM_REJECTION",
                        "ingredient_name": ing_n,
                        "rejected_quantity": rej_qty,
                        "rejection_reason": item_reason or "Damaged / Substandard Delivery",
                    })
                    issues.append(
                        f"Receipt {rc_code}: {rej_qty or 'Unspecified'} units of '{ing_n}' flagged damaged/rejected "
                        f"({item_reason or 'Failed Quality Check'})."
                    )

        if damaged_items:
            total_damaged += len(damaged_items)

        if issues:
            total_discrepancies += 1

        po_risk = (
            "HIGH"
            if (
                any(v["variance_type"] == "OVER_RECEIVED" and v["variance_percentage"] > 25 for v in item_variances)
                or is_overdue
                or len(damaged_items) > 0
            )
            else ("MEDIUM" if issues else "LOW")
        )

        if issues or po_status in ("ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "COMPLETED"):
            discrepancy_reports.append({
                "purchase_order_id": po_id,
                "purchase_order_code": po_code,
                "status": po_status,
                "supplier_name": po.get("supplierName") or "Vendor",
                "goods_receipt_count": len(po_receipts),
                "is_overdue": is_overdue,
                "days_overdue": days_overdue,
                "has_discrepancies": len(issues) > 0,
                "issues": issues,
                "item_variances": item_variances,
                "damaged_or_rejected_items": damaged_items,
                "has_damaged_goods": len(damaged_items) > 0,
                "risk_level": po_risk,
            })

    overall_risk = "HIGH" if any(r["risk_level"] == "HIGH" for r in discrepancy_reports) else ("MEDIUM" if total_discrepancies > 0 else "LOW")

    return {
        "total_orders_evaluated": len(discrepancy_reports),
        "discrepant_orders_count": total_discrepancies,
        "overdue_orders_count": total_overdue,
        "damaged_goods_incidents_count": total_damaged,
        "discrepancy_reports": discrepancy_reports,
        "risk_level": overall_risk,
        "summary": (
            f"Found {total_discrepancies} Purchase Order(s) with receiving discrepancies: "
            f"{total_overdue} overdue delivery order(s), {total_damaged} damaged/rejected goods incident(s)."
            if total_discrepancies > 0
            else "All received goods quantities reconcile accurately against commercial Purchase Orders with no delivery variances or damaged goods."
        ),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# 5. OVERALL PROCUREMENT COMPLIANCE RISK ANALYSIS
# ═══════════════════════════════════════════════════════════════════════════════

async def analyze_procurement_compliance(
    purchase_order_id: str = "",
    purchase_request_id: str = "",
) -> dict[str, Any]:
    """
    Comprehensive compliance audit consolidating:
    - PR -> PO Consistency (Financial & Quantity)
    - Duplicate PR Checks (Requisition Governance)
    - Workflow Compliance (Approval Hierarchy)
    - Receiving Discrepancies (Dock & Fulfillment)
    Computes an authoritative, explainable Weighted Multi-Factor Procurement Compliance Score.
    """
    duplicates_res = await check_duplicate_purchase_requests(window_days=14)
    consistency_res = await check_pr_po_consistency(purchase_order_id, purchase_request_id)
    workflow_res = await check_workflow_compliance(purchase_order_id, purchase_request_id)
    receiving_res = await check_receiving_discrepancies(purchase_order_id)

    key_findings = []
    categorized_recommendations = {
        "management_governance": [],
        "procurement_operations": [],
        "warehouse_receiving": [],
        "preventive_controls": [],
    }

    # 1. Factor: Workflow Governance (Weight: 35%)
    workflow_viol_count = 0
    workflow_critical_count = 0
    if isinstance(workflow_res, dict):
        for viol in workflow_res.get("violations", []):
            workflow_viol_count += 1
            if viol.get("severity") == "HIGH":
                workflow_critical_count += 1
            for v_msg in viol.get("violations", []):
                key_findings.append(f"Workflow Governance [{viol.get('entity_code', 'ENTITY')}]: {v_msg}")

        if workflow_critical_count > 0:
            categorized_recommendations["management_governance"].append(
                "Immediate Restaurant Manager review: Resolve POs linked to unapproved PRs and expedite aged pending approvals."
            )
        elif workflow_viol_count > 0:
            categorized_recommendations["management_governance"].append(
                "Verify justification documentation for direct Purchase Orders without PR requisition links."
            )

    workflow_factor = min(100.0, (workflow_critical_count * 50.0) + (workflow_viol_count * 20.0))

    # 2. Factor: Financial & PR/PO Consistency (Weight: 25%)
    consistency_issues_count = 0
    consistency_high_count = 0
    if isinstance(consistency_res, dict):
        for rep in consistency_res.get("consistency_reports", []):
            if rep.get("has_discrepancies"):
                consistency_issues_count += 1
                if rep.get("risk_level") == "HIGH":
                    consistency_high_count += 1
                for issue in rep.get("issues", []):
                    key_findings.append(f"PR/PO Consistency [{rep.get('purchase_order_code', 'PO')}]: {issue}")

        if consistency_issues_count > 0:
            categorized_recommendations["procurement_operations"].append(
                "Procurement Officer audit: Reconcile price and quantity variances against original Restaurant Manager approved PRs."
            )

    consistency_factor = min(100.0, (consistency_high_count * 40.0) + (consistency_issues_count * 20.0))

    # 3. Factor: Receiving & Delivery Reconciliation (Weight: 25%)
    receiving_issues_count = 0
    overdue_count = 0
    damaged_count = 0
    if isinstance(receiving_res, dict):
        overdue_count = receiving_res.get("overdue_orders_count", 0)
        damaged_count = receiving_res.get("damaged_goods_incidents_count", 0)
        for rec in receiving_res.get("discrepancy_reports", []):
            if rec.get("has_discrepancies"):
                receiving_issues_count += 1
                for r_msg in rec.get("issues", []):
                    key_findings.append(f"Receiving Variance [{rec.get('purchase_order_code', 'PO')}]: {r_msg}")

        if damaged_count > 0:
            categorized_recommendations["warehouse_receiving"].append(
                f"Dock Receiving Alert: Process vendor credit requests or returns for {damaged_count} damaged/rejected goods incident(s)."
            )
        if overdue_count > 0:
            categorized_recommendations["procurement_operations"].append(
                f"Expedite Deliveries: Contact suppliers regarding {overdue_count} overdue Purchase Order(s)."
            )
        if receiving_issues_count > (overdue_count + damaged_count):
            categorized_recommendations["warehouse_receiving"].append(
                "Verify receiving count logs against commercial Purchase Order quantities to prevent over-invoicing."
            )

    receiving_factor = min(100.0, (damaged_count * 30.0) + (overdue_count * 25.0) + (receiving_issues_count * 15.0))

    # 4. Factor: Duplicate Requisitions (Weight: 15%)
    dup_count = 0
    if isinstance(duplicates_res, dict) and duplicates_res.get("duplicate_count", 0) > 0:
        dup_count = duplicates_res["duplicate_count"]
        for g in duplicates_res.get("duplicate_groups", []):
            key_findings.append(
                f"Duplicate Requisition: {g.get('primary_pr_code')} is {g.get('similarity_score')}% similar to "
                f"{g.get('similar_pr_code')} ({g.get('duplicate_reason', 'overlapping items')})."
            )

        categorized_recommendations["preventive_controls"].append(
            f"Consolidate or reject {dup_count} duplicate Purchase Request(s) to avoid unnecessary capital expenditure."
        )

    duplicate_factor = min(100.0, dup_count * 35.0)

    # Calculate Explainable Weighted Risk Score (0 = Fully Compliant, 100 = Critical Non-Compliance)
    weighted_risk_score = round(
        (workflow_factor * 0.35)
        + (consistency_factor * 0.25)
        + (receiving_factor * 0.25)
        + (duplicate_factor * 0.15),
        1,
    )

    # Determine overall compliance risk level
    if weighted_risk_score >= 60.0 or workflow_critical_count >= 1:
        overall_risk = "HIGH"
    elif weighted_risk_score >= 25.0 or len(key_findings) >= 2:
        overall_risk = "MEDIUM"
    else:
        overall_risk = "LOW"

    # Flattened actionable recommendation list for quick display
    flat_recommendations = []
    for cat_list in categorized_recommendations.values():
        flat_recommendations.extend(cat_list)
    if not flat_recommendations:
        flat_recommendations.append(
            "Procurement operations fully adhere to restaurant governance policies with zero compliance anomalies."
        )

    return {
        "overall_risk_level": overall_risk,
        "risk_score": weighted_risk_score,
        "compliance_score": round(100.0 - weighted_risk_score, 1),
        "total_issues_found": len(key_findings),
        "key_findings": key_findings,
        "categorized_recommendations": categorized_recommendations,
        "recommended_review_actions": flat_recommendations,
        "scoring_methodology": {
            "formula": "Risk Score = (Workflow * 0.35) + (PR/PO Consistency * 0.25) + (Receiving * 0.25) + (Duplicate PR * 0.15)",
            "governance_rule": "Purchase Requests require Restaurant Manager approval; Purchase Orders are placed directly by Procurement Officer.",
        },
        "factor_breakdown": {
            "workflow_governance": {
                "weight_pct": 35,
                "raw_score": workflow_factor,
                "weighted_points": round(workflow_factor * 0.35, 1),
                "violations_count": workflow_viol_count,
                "status": "COMPLIANT" if workflow_viol_count == 0 else "DEFICIENT",
            },
            "financial_pr_po_consistency": {
                "weight_pct": 25,
                "raw_score": consistency_factor,
                "weighted_points": round(consistency_factor * 0.25, 1),
                "issues_count": consistency_issues_count,
                "status": "COMPLIANT" if consistency_issues_count == 0 else "DEFICIENT",
            },
            "receiving_reconciliation": {
                "weight_pct": 25,
                "raw_score": receiving_factor,
                "weighted_points": round(receiving_factor * 0.25, 1),
                "issues_count": receiving_issues_count,
                "overdue_count": overdue_count,
                "damaged_count": damaged_count,
                "status": "COMPLIANT" if (receiving_issues_count + overdue_count + damaged_count) == 0 else "DEFICIENT",
            },
            "duplicate_requisitions": {
                "weight_pct": 15,
                "raw_score": duplicate_factor,
                "weighted_points": round(duplicate_factor * 0.15, 1),
                "duplicates_count": dup_count,
                "status": "COMPLIANT" if dup_count == 0 else "DEFICIENT",
            },
        },
        "component_breakdown": {
            "duplicate_pr_risk": duplicates_res.get("risk_level", "LOW") if isinstance(duplicates_res, dict) else "UNKNOWN",
            "pr_po_consistency_risk": consistency_res.get("risk_level", "LOW") if isinstance(consistency_res, dict) else "UNKNOWN",
            "workflow_governance_risk": workflow_res.get("risk_level", "LOW") if isinstance(workflow_res, dict) else "UNKNOWN",
            "receiving_reconciliation_risk": receiving_res.get("risk_level", "LOW") if isinstance(receiving_res, dict) else "UNKNOWN",
        },
    }


# ═══════════════════════════════════════════════════════════════════════════════
# 6. TRANSACTION INVESTIGATION CHAIN TRACE
# ═══════════════════════════════════════════════════════════════════════════════

async def investigate_procurement_transaction(
    query_or_id: str,
) -> dict[str, Any]:
    """
    Universal investigation tool for the AI Assistant.
    Traces the entire lifecycle chain of a Purchase Order or Purchase Request:
    PO -> Linked PR -> PR Approvals -> Line Item Quantities -> Goods Receipts -> Compliance Audit.
    """
    target = _clean_id(query_or_id)
    if not target:
        return {"error": "Please provide a valid Purchase Order ID, Purchase Request ID, or search term to investigate."}

    pos_data = await _safe_get("/api/PurchaseOrders")
    prs_data = await _safe_get("/api/PurchaseRequests")
    receipts_data = await _safe_get("/api/GoodsReceipts")

    pos = pos_data if isinstance(pos_data, list) else []
    prs = prs_data if isinstance(prs_data, list) else []
    receipts = receipts_data if isinstance(receipts_data, list) else []

    # Find matching PO
    matched_po = next((p for p in pos if _id_matches(target, p.get("id"))), None)

    # Find matching PR
    matched_pr = next((r for r in prs if _id_matches(target, r.get("id"))), None)

    if not matched_po and not matched_pr:
        # Check by supplier name or requester name
        matched_po = next((p for p in pos if target in (p.get("supplierName") or "").lower()), None)
        if not matched_po:
            matched_pr = next((r for r in prs if target in (r.get("requestedByName") or "").lower()), None)

    if not matched_po and not matched_pr:
        return {
            "found": False,
            "search_query": query_or_id,
            "message": f"No Purchase Order or Purchase Request matching '{query_or_id}' was found in the system.",
        }

    # If we found PR first, see if a PO is linked
    if matched_pr and not matched_po:
        matched_po = next((p for p in pos if _id_matches(matched_pr.get("id"), p.get("purchaseRequestId"))), None)

    # If we found PO, get its linked PR
    if matched_po and not matched_pr and matched_po.get("purchaseRequestId"):
        matched_pr = next((r for r in prs if _id_matches(matched_po.get("purchaseRequestId"), r.get("id"))), None)

    # Get Goods Receipts for this PO
    po_id = matched_po.get("id") if matched_po else ""
    po_receipts = [r for r in receipts if _id_matches(po_id, r.get("purchaseOrderId"))] if po_id else []

    # Aggregate received quantities from receipts
    receipt_received_by_ing = {}
    for rc in po_receipts:
        for r_it in rc.get("items", []):
            ing_id = r_it.get("ingredientId")
            qty = float(r_it.get("receivedQuantity", 0)) or float(r_it.get("quantity", 0))
            receipt_received_by_ing[ing_id] = receipt_received_by_ing.get(ing_id, 0.0) + qty

    # Build Line Item Comparison
    pr_items_map = {it.get("ingredientId"): it for it in (matched_pr.get("items", []) if matched_pr else [])}
    po_items_map = {it.get("ingredientId"): it for it in (matched_po.get("items", []) if matched_po else [])}
    all_ing_ids = set(pr_items_map.keys()).union(set(po_items_map.keys()))

    line_items_trace = []
    for ing_id in all_ing_ids:
        pr_it = pr_items_map.get(ing_id)
        po_it = po_items_map.get(ing_id)

        ing_name = (pr_it.get("ingredientName") if pr_it else None) or (po_it.get("ingredientName") if po_it else None) or "Ingredient"
        unit = (pr_it.get("ingredientUnit") if pr_it else None) or (po_it.get("ingredientUnit") if po_it else None) or "units"

        req_qty = float(pr_it.get("requestedQuantity", 0)) if pr_it else 0.0
        ord_qty = float(po_it.get("orderedQuantity", 0)) if po_it else 0.0
        rcv_qty = max(float(po_it.get("receivedQuantity", 0)) if po_it else 0.0, receipt_received_by_ing.get(ing_id, 0.0))
        unit_price = float(po_it.get("unitPrice", 0)) if po_it else 0.0

        status_flags = []
        if pr_it and not po_it:
            status_flags.append("OMITTED_FROM_PO")
        elif po_it and not pr_it:
            status_flags.append("UNREQUESTED_EXTRA_ITEM")
        elif ord_qty > req_qty:
            status_flags.append(f"PO_EXCEEDS_PR (+{round(ord_qty - req_qty, 2)})")
        elif ord_qty < req_qty:
            status_flags.append(f"PO_LESS_THAN_PR ({round(ord_qty - req_qty, 2)})")

        if rcv_qty > ord_qty:
            status_flags.append(f"OVER_RECEIVED (+{round(rcv_qty - ord_qty, 2)})")

        line_items_trace.append({
            "ingredient_id": ing_id,
            "ingredient_name": ing_name,
            "unit": unit,
            "requested_quantity": req_qty,
            "ordered_quantity": ord_qty,
            "received_quantity": rcv_qty,
            "unit_price": unit_price,
            "line_subtotal": round(ord_qty * unit_price, 2),
            "status_flags": status_flags if status_flags else ["NORMAL_MATCH"],
        })

    # Run specific compliance check for this pair
    compliance_report = await analyze_procurement_compliance(
        purchase_order_id=matched_po.get("id") if matched_po else "",
        purchase_request_id=matched_pr.get("id") if matched_pr else "",
    )

    return {
        "found": True,
        "investigation_target": query_or_id,
        "purchase_request": {
            "id": matched_pr.get("id") if matched_pr else None,
            "code": f"PR-{matched_pr.get('id', '')[:8].upper()}" if matched_pr else None,
            "status": matched_pr.get("status") if matched_pr else "NO_LINKED_PR",
            "requested_by": matched_pr.get("requestedByName") if matched_pr else None,
            "requested_at": str(matched_pr.get("requestedAt"))[:19] if matched_pr else None,
            "approved_by": matched_pr.get("approvedByName") if matched_pr else None,
            "approved_at": str(matched_pr.get("approvedAt"))[:19] if matched_pr else None,
            "reason": matched_pr.get("reason") if matched_pr else None,
        } if matched_pr else None,
        "purchase_order": {
            "id": matched_po.get("id") if matched_po else None,
            "code": f"PO-{matched_po.get('id', '')[:8].upper()}" if matched_po else None,
            "status": matched_po.get("status") if matched_po else "NO_PO_CREATED",
            "supplier_name": matched_po.get("supplierName") if matched_po else None,
            "created_by": matched_po.get("createdByName") if matched_po else None,
            "created_at": str(matched_po.get("createdAt"))[:19] if matched_po else None,
            "order_date": str(matched_po.get("orderDate"))[:19] if matched_po else None,
            "expected_delivery_date": str(matched_po.get("expectedDeliveryDate"))[:10] if matched_po else None,
            "total_amount": float(matched_po.get("totalAmount", 0)) if matched_po else 0.0,
        } if matched_po else None,
        "goods_receipts": [
            {
                "id": rc.get("id"),
                "code": f"GR-{rc.get('id', '')[:8].upper()}",
                "received_by": rc.get("receivedByName") or "Staff",
                "received_at": str(rc.get("receivedAt"))[:19],
                "item_count": len(rc.get("items", [])),
                "notes": rc.get("notes"),
            }
            for rc in po_receipts
        ],
        "line_items_comparison": line_items_trace,
        "compliance_summary": {
            "overall_risk_level": compliance_report.get("overall_risk_level", "LOW"),
            "risk_score": compliance_report.get("risk_score", 0),
            "key_findings": compliance_report.get("key_findings", []),
            "recommendations": compliance_report.get("recommended_review_actions", []),
        },
    }


# ═══════════════════════════════════════════════════════════════════════════════
# GEMINI FUNCTION DECLARATIONS & TOOL REGISTRY
# ═══════════════════════════════════════════════════════════════════════════════

TOOL_DEFINITIONS = Tool(function_declarations=[
    FunctionDeclaration(
        name="investigate_procurement_transaction",
        description="Audit and investigate a specific Purchase Order or Purchase Request by ID or search term. Returns the full lifecycle trace (PR approval -> PO order -> Goods receipt) and compliance findings.",
        parameters={
            "type": "object",
            "properties": {
                "query_or_id": {
                    "type": "string",
                    "description": "Purchase Order ID (e.g. PO-EE1E95F7 or GUID), Purchase Request ID (e.g. PR-5A8F853C), or search keyword.",
                },
            },
            "required": ["query_or_id"],
        },
    ),
    FunctionDeclaration(
        name="analyze_procurement_compliance",
        description="Run an overall compliance and risk analysis across procurement transactions. Evaluates duplicate PRs, PR-PO consistency, workflow governance, and receiving discrepancies.",
        parameters={
            "type": "object",
            "properties": {
                "purchase_order_id": {
                    "type": "string",
                    "description": "Optional specific Purchase Order ID to audit.",
                },
                "purchase_request_id": {
                    "type": "string",
                    "description": "Optional specific Purchase Request ID to audit.",
                },
            },
        },
    ),
    FunctionDeclaration(
        name="check_duplicate_purchase_requests",
        description="Identify potentially duplicated Purchase Requests based on ingredient overlap, quantities, requester, and temporal closeness.",
        parameters={
            "type": "object",
            "properties": {
                "window_days": {
                    "type": "integer",
                    "description": "Time window in days to check for similar PRs (default: 7 days).",
                },
                "similarity_threshold": {
                    "type": "number",
                    "description": "Similarity threshold between 0.0 and 1.0 (default: 0.75).",
                },
            },
        },
    ),
    FunctionDeclaration(
        name="check_pr_po_consistency",
        description="Compare Purchase Orders with their approved source Purchase Requests to detect quantity mismatches, missing items, or unrequested extra items.",
        parameters={
            "type": "object",
            "properties": {
                "purchase_order_id": {
                    "type": "string",
                    "description": "Optional specific PO ID (or short code like PO-XXXX) to verify.",
                },
                "purchase_request_id": {
                    "type": "string",
                    "description": "Optional specific PR ID to verify.",
                },
            },
        },
    ),
    FunctionDeclaration(
        name="check_workflow_compliance",
        description="Validate adherence to the procurement workflow rules (PR created -> PR submitted -> PR approved by Manager -> PO created as DRAFT -> PO ordered by Procurement Officer -> Goods received). Flags unapproved PRs and governance violations.",
        parameters={
            "type": "object",
            "properties": {
                "purchase_order_id": {
                    "type": "string",
                    "description": "Optional specific PO ID to verify.",
                },
                "purchase_request_id": {
                    "type": "string",
                    "description": "Optional specific PR ID to verify.",
                },
            },
        },
    ),
    FunctionDeclaration(
        name="check_receiving_discrepancies",
        description="Audit goods receipt records against commercial Purchase Orders to detect over-receiving, under-receiving, and damaged goods.",
        parameters={
            "type": "object",
            "properties": {
                "purchase_order_id": {
                    "type": "string",
                    "description": "Optional specific PO ID to check for receiving variances.",
                },
            },
        },
    ),
])

TOOL_DISPATCH: dict[str, Any] = {
    "investigate_procurement_transaction": investigate_procurement_transaction,
    "analyze_procurement_compliance": analyze_procurement_compliance,
    "check_duplicate_purchase_requests": check_duplicate_purchase_requests,
    "check_pr_po_consistency": check_pr_po_consistency,
    "check_workflow_compliance": check_workflow_compliance,
    "check_receiving_discrepancies": check_receiving_discrepancies,
}
