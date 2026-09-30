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
    """Safely fetch backend data with structured error handling and graceful degradation."""
    try:
        return await _get(path, params)
    except httpx.HTTPStatusError as exc:
        return {
            "error": f"Backend returned HTTP {exc.response.status_code} for {path}.",
            "status_code": exc.response.status_code,
            "endpoint": path,
            "is_backend_error": True,
        }
    except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout, httpx.NetworkError) as exc:
        return {
            "error": f"Backend service unreachable at {path} ({type(exc).__name__}).",
            "endpoint": path,
            "is_backend_error": True,
        }
    except Exception as exc:
        return {
            "error": f"Backend data request to {path} failed: {type(exc).__name__}: {exc}",
            "endpoint": path,
            "is_backend_error": True,
        }


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
            base_score = (item_similarity * 0.6) + (avg_qty_sim * 0.4)

            # Requester match bonus: if both PRs originate from the same user, increase similarity score
            same_requester = (
                pr1.get("requestedById") and pr1.get("requestedById") == pr2.get("requestedById")
            ) or (
                pr1.get("requestedByName") and pr1.get("requestedByName") == pr2.get("requestedByName")
            )
            overall_score = min(1.0, base_score + (0.10 if same_requester else 0.0))

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

                # Determine if either PR is actively pending approval
                is_active_risk = (
                    pr1.get("status") in ("PENDING_APPROVAL", "APPROVED") and
                    pr2.get("status") in ("PENDING_APPROVAL", "APPROVED")
                )

                requester_note = " by the same requester" if same_requester else ""
                duplicate_groups.append({
                    "primary_pr_id": pr1.get("id"),
                    "primary_pr_code": f"PR-{pr1.get('id', '')[:8].upper()}",
                    "primary_pr_status": pr1.get("status"),
                    "primary_requester": pr1.get("requestedByName") or "Staff",
                    "primary_date": str(pr1.get("requestedAt"))[:10],
                    "similar_pr_id": pr2.get("id"),
                    "similar_pr_code": f"PR-{pr2.get('id', '')[:8].upper()}",
                    "similar_pr_status": pr2.get("status"),
                    "similar_requester": pr2.get("requestedByName") or "Staff",
                    "similar_date": str(pr2.get("requestedAt"))[:10],
                    "days_apart": round(diff_days, 1),
                    "similarity_score": round(overall_score * 100, 1),
                    "base_item_score": round(base_score * 100, 1),
                    "same_requester": bool(same_requester),
                    "active_duplicate_risk": is_active_risk,
                    "matched_items": matched_items,
                    "explanation": (
                        f"{pr2.get('id', '')[:8].upper()} ({pr2.get('status')}) requested items matching "
                        f"{pr1.get('id', '')[:8].upper()} ({pr1.get('status')}){requester_note}, submitted {round(diff_days, 1)} days apart "
                        f"with {round(overall_score * 100, 1)}% confidence."
                    ),
                })

    active_risks = [g for g in duplicate_groups if g.get("active_duplicate_risk")]
    risk_level = "HIGH" if len(active_risks) >= 2 else ("MEDIUM" if len(duplicate_groups) >= 1 else "LOW")

    return {
        "window_days": window_days,
        "total_requests_analyzed": len(prs),
        "duplicate_count": len(duplicate_groups),
        "active_risk_count": len(active_risks),
        "duplicate_groups": duplicate_groups,
        "risk_level": risk_level,
        "summary": (
            f"Detected {len(duplicate_groups)} potential duplicate Purchase Request pairs "
            f"({len(active_risks)} active) within a {window_days}-day window."
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
        po_extra_spend = 0.0

        # Check if PR was approved
        if pr_status != "APPROVED":
            issues.append(f"PO is linked to PR {pr_code} which is '{pr_status}' (not APPROVED).")

        # Compare items in PR
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
                    "ordered_value": 0.0,
                    "financial_variance": 0.0,
                    "variance": -req_qty,
                    "variance_percentage": -100.0,
                    "status": "OMITTED_IN_PO",
                })
            else:
                ord_qty = float(po_item.get("orderedQuantity", 0))
                unit_price = float(po_item.get("unitPrice", 0))
                variance = ord_qty - req_qty
                var_pct = round((variance / req_qty) * 100, 1) if req_qty > 0 else 0.0
                ordered_value = round(ord_qty * unit_price, 2)
                item_fin_var = round(variance * unit_price, 2)

                comp_status = "MATCH"
                if abs(variance) > 0.001:
                    if ord_qty > req_qty:
                        comp_status = "PO_QUANTITY_EXCEEDS_PR"
                        po_extra_spend += max(0.0, item_fin_var)
                        issues.append(
                            f"Quantity mismatch for '{ing_name}': Approved PR requested {req_qty} {pr_item.get('ingredientUnit', '')}, "
                            f"but PO ordered {ord_qty} (+{var_pct}%, cost impact: +${item_fin_var:,.2f})."
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
                    "ordered_value": ordered_value,
                    "financial_variance": item_fin_var,
                    "variance": round(variance, 2),
                    "variance_percentage": var_pct,
                    "status": comp_status,
                })

        # Check for extra items in PO not in PR
        for ing_id, po_item in po_item_map.items():
            if ing_id not in pr_item_map:
                ing_name = po_item.get("ingredientName") or "Ingredient"
                ord_qty = float(po_item.get("orderedQuantity", 0))
                unit_price = float(po_item.get("unitPrice", 0))
                ordered_value = round(ord_qty * unit_price, 2)
                po_extra_spend += ordered_value

                issues.append(f"Extra item '{ing_name}' ({ord_qty} units @ ${unit_price:,.2f} = ${ordered_value:,.2f}) in PO was never requested in approved PR {pr_code}.")
                item_comparisons.append({
                    "ingredient_id": ing_id,
                    "ingredient_name": ing_name,
                    "requested_quantity": 0.0,
                    "ordered_quantity": ord_qty,
                    "unit_price": unit_price,
                    "ordered_value": ordered_value,
                    "financial_variance": ordered_value,
                    "variance": ord_qty,
                    "variance_percentage": 100.0,
                    "status": "EXTRA_ITEM_IN_PO",
                })

        has_discrepancy = len(issues) > 0
        if has_discrepancy:
            total_mismatches += 1

        po_risk = "HIGH" if pr_status != "APPROVED" or po_extra_spend > 500 or any(c.get("variance_percentage", 0) > 30 for c in item_comparisons) else ("MEDIUM" if has_discrepancy else "LOW")

        reports.append({
            "purchase_order_id": po_id,
            "purchase_order_code": po_code,
            "status": po_status,
            "supplier_name": po.get("supplierName") or "Vendor",
            "linked_pr_id": pr_id,
            "linked_pr_code": pr_code,
            "linked_pr_status": pr_status,
            "linked_pr_approver": pr.get("approvedByName"),
            "is_linked_to_pr": True,
            "has_discrepancies": has_discrepancy,
            "unauthorized_spend_variance": round(po_extra_spend, 2),
            "total_po_amount": float(po.get("totalAmount", 0)),
            "issues": issues,
            "item_comparisons": item_comparisons,
            "risk_level": po_risk,
        })

    overall_risk = "HIGH" if any(r["risk_level"] == "HIGH" for r in reports) else ("MEDIUM" if total_mismatches > 0 else "LOW")
    total_unauthorized_variance = sum(r.get("unauthorized_spend_variance", 0.0) for r in reports)

    return {
        "total_orders_analyzed": len(reports),
        "inconsistent_orders_count": total_mismatches,
        "total_unauthorized_variance": round(total_unauthorized_variance, 2),
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
            # Normal pending state
            pass

        if pr_issues:
            violations.append({
                "entity_type": "PURCHASE_REQUEST",
                "entity_id": pr_id,
                "entity_code": pr_code,
                "status": pr_status,
                "violations": pr_issues,
                "severity": "HIGH",
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

        if pr_id:
            pr = prs_map.get(pr_id)
            if pr:
                pr_code = f"PR-{pr.get('id', '')[:8].upper()}"
                if pr.get("status") != "APPROVED":
                    po_issues.append(
                        f"{po_code} was created from {pr_code} which is currently in '{pr.get('status')}' status (Requires APPROVED PR)."
                    )
            else:
                po_issues.append(f"{po_code} references nonexistent PR ID {pr_id[:8].upper()}.")

        # Validate direct POs without PR link
        if not pr_id:
            # Direct POs are permitted for direct purchasing by Procurement Officer, but noted for governance
            if po_status == "DRAFT":
                po_issues.append(f"{po_code} is a Direct PO in DRAFT status without linked PR requisition (Awaiting Procurement Officer order placement).")
            else:
                compliant_records.append({"entity_type": "PURCHASE_ORDER", "entity_code": po_code, "note": "Direct PO placed by Procurement Officer."})

        # Validate order lifecycle states
        if po_status in ("ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "COMPLETED"):
            if not po.get("orderDate") and not po.get("createdAt"):
                po_issues.append(f"{po_code} is in status '{po_status}' but lacks recorded supplier placement orderDate.")

        if po_status in ("PARTIALLY_RECEIVED", "RECEIVED", "COMPLETED"):
            # Check receiving items have recorded quantities
            total_rcv = sum(float(it.get("receivedQuantity", 0)) for it in po.get("items", []))
            if total_rcv <= 0 and po_status in ("RECEIVED", "COMPLETED"):
                po_issues.append(f"{po_code} is marked '{po_status}' but has 0 recorded received items.")

        if po_issues:
            violations.append({
                "entity_type": "PURCHASE_ORDER",
                "entity_id": po_id,
                "entity_code": po_code,
                "status": po_status,
                "violations": po_issues,
                "severity": "HIGH" if any("Requires APPROVED" in v or "nonexistent PR" in v for v in po_issues) else "MEDIUM",
            })
        else:
            compliant_records.append({"entity_type": "PURCHASE_ORDER", "entity_code": po_code})

    risk_level = "HIGH" if any(v.get("severity") == "HIGH" for v in violations) else ("MEDIUM" if violations else "LOW")

    return {
        "workflow_rules_enforced": [
            "Staff creates and submits Purchase Request (PR)",
            "Restaurant Manager reviews and approves Purchase Request (MANDATORY APPROVAL)",
            "Procurement Officer creates PO as DRAFT from approved PR",
            "Procurement Officer reviews and explicitly places PO (NO Manager approval on PO)",
            "Receiving Staff records incoming Goods Receipts against PO",
        ],
        "total_entities_checked": len(prs) + len(pos),
        "total_violations": len(violations),
        "compliant_count": len(compliant_records),
        "violations": violations,
        "risk_level": risk_level,
        "summary": (
            f"Detected {len(violations)} procurement workflow governance violation(s) across {len(prs)} PRs and {len(pos)} POs."
            if violations
            else f"Full workflow compliance verified: All {len(prs)} PRs and {len(pos)} POs adhere strictly to restaurant governance."
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

        # Check for overdue fulfillment on open orders
        is_overdue = False
        exp_delivery_raw = po.get("expectedDeliveryDate")
        if po_status == "ORDERED" and exp_delivery_raw:
            try:
                exp_dt = datetime.fromisoformat(str(exp_delivery_raw).replace("Z", "+00:00"))
                if exp_dt.tzinfo is None:
                    exp_dt = exp_dt.replace(tzinfo=timezone.utc)
                now_utc = datetime.now(timezone.utc)
                if exp_dt.date() < now_utc.date():
                    days_overdue = (now_utc.date() - exp_dt.date()).days
                    is_overdue = True
                    issues.append(
                        f"Overdue delivery: {po_code} was expected on {str(exp_delivery_raw)[:10]} "
                        f"({days_overdue} day(s) overdue) with no goods receipts recorded."
                    )
            except (ValueError, TypeError):
                pass

        # Check receipt notes and items for damage/defect mentions
        damaged_items = []
        for rc in po_receipts:
            rc_notes = (rc.get("notes") or "").lower()
            rc_code = f"GR-{rc.get('id', '')[:8].upper()}"
            if any(kw in rc_notes for kw in ("damag", "broken", "spoil", "leak", "reject", "defect", "poor quality")):
                issues.append(f"Goods receipt {rc_code} notes contain quality/damage warning: \"{rc.get('notes')}\"")
                damaged_items.append({
                    "receipt_id": rc.get("id"),
                    "receipt_code": rc_code,
                    "receipt_date": str(rc.get("receiptDate") or rc.get("createdAt"))[:10],
                    "notes": rc.get("notes"),
                    "issue_type": "DAMAGE_OR_QUALITY_NOTE",
                })

        if issues:
            total_discrepancies += 1

        po_risk = "HIGH" if is_overdue or any(v["variance_type"] == "OVER_RECEIVED" and v["variance_percentage"] > 25 for v in item_variances) else ("MEDIUM" if issues else "LOW")

        if issues or po_status in ("ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "COMPLETED"):
            discrepancy_reports.append({
                "purchase_order_id": po_id,
                "purchase_order_code": po_code,
                "status": po_status,
                "supplier_name": po.get("supplierName") or "Vendor",
                "goods_receipt_count": len(po_receipts),
                "has_discrepancies": len(issues) > 0,
                "is_overdue": is_overdue,
                "expected_delivery_date": str(exp_delivery_raw)[:10] if exp_delivery_raw else None,
                "issues": issues,
                "item_variances": item_variances,
                "damaged_or_quality_notes": damaged_items,
                "risk_level": po_risk,
            })

    overall_risk = "HIGH" if any(r["risk_level"] == "HIGH" for r in discrepancy_reports) else ("MEDIUM" if total_discrepancies > 0 else "LOW")

    return {
        "total_orders_evaluated": len(discrepancy_reports),
        "discrepant_orders_count": total_discrepancies,
        "discrepancy_reports": discrepancy_reports,
        "risk_level": overall_risk,
        "summary": (
            f"Found {total_discrepancies} Purchase Order(s) with receiving discrepancies or delivery quantity variances."
            if total_discrepancies > 0
            else "All received goods quantities reconcile accurately against commercial Purchase Orders."
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
    - PR -> PO Consistency
    - Duplicate PR Checks
    - Workflow Compliance
    - Receiving Discrepancies
    Computes an authoritative explainable Procurement Compliance Risk Score.
    """
    duplicates_res = await check_duplicate_purchase_requests(window_days=14)
    consistency_res = await check_pr_po_consistency(purchase_order_id, purchase_request_id)
    workflow_res = await check_workflow_compliance(purchase_order_id, purchase_request_id)
    receiving_res = await check_receiving_discrepancies(purchase_order_id)

    key_findings = []
    high_count = 0
    medium_count = 0
    system_diagnostics = []

    # Check for endpoint or upstream retrieval errors across sub-checks
    for sub_name, sub_res in [
        ("Duplicate PR Check", duplicates_res),
        ("PR-PO Consistency Check", consistency_res),
        ("Workflow Compliance Check", workflow_res),
        ("Receiving Discrepancy Check", receiving_res),
    ]:
        if isinstance(sub_res, dict) and "error" in sub_res:
            system_diagnostics.append(f"{sub_name}: {sub_res.get('error')}")

    # Multi-factor score calculations with explicit weights:
    # 1. Workflow Governance (Weight: 35%)
    # 2. PR-PO Consistency & Financial (Weight: 25%)
    # 3. Receiving Reconciliation (Weight: 25%)
    # 4. Duplicate PR Prevention (Weight: 15%)

    # Factor 1: Duplicate PRs (15%)
    dup_score = 0.0
    if isinstance(duplicates_res, dict):
        dup_cnt = duplicates_res.get("duplicate_count", 0)
        if dup_cnt > 0:
            dup_score = min(100.0, dup_cnt * 35.0)
            for g in duplicates_res.get("duplicate_groups", []):
                key_findings.append(f"Duplicate PR: {g['primary_pr_code']} is similar to {g['similar_pr_code']} ({g['similarity_score']}% match).")

    # Factor 2: PR/PO Consistency (25%)
    consistency_score = 0.0
    if isinstance(consistency_res, dict):
        for rep in consistency_res.get("consistency_reports", []):
            if rep.get("has_discrepancies"):
                rep_risk = rep.get("risk_level", "MEDIUM")
                if rep_risk == "HIGH":
                    high_count += 1
                    consistency_score += 40.0
                else:
                    medium_count += 1
                    consistency_score += 20.0
                for issue in rep.get("issues", []):
                    key_findings.append(f"PR/PO Consistency [{rep['purchase_order_code']}]: {issue}")
    consistency_score = min(100.0, consistency_score)

    # Factor 3: Workflow Compliance (35%)
    workflow_score = 0.0
    if isinstance(workflow_res, dict):
        for viol in workflow_res.get("violations", []):
            sev = viol.get("severity", "MEDIUM")
            if sev == "HIGH":
                high_count += 1
                workflow_score += 45.0
            else:
                medium_count += 1
                workflow_score += 20.0
            for v_msg in viol.get("violations", []):
                key_findings.append(f"Workflow Breach [{viol['entity_code']}]: {v_msg}")
    workflow_score = min(100.0, workflow_score)

    # Factor 4: Receiving Reconciliation (25%)
    receiving_score = 0.0
    if isinstance(receiving_res, dict):
        for rec in receiving_res.get("discrepancy_reports", []):
            if rec.get("has_discrepancies"):
                rec_risk = rec.get("risk_level", "MEDIUM")
                if rec_risk == "HIGH":
                    high_count += 1
                    receiving_score += 40.0
                else:
                    medium_count += 1
                    receiving_score += 20.0
                for r_msg in rec.get("issues", []):
                    key_findings.append(f"Receiving Variance [{rec['purchase_order_code']}]: {r_msg}")
    receiving_score = min(100.0, receiving_score)

    # Weighted composite risk score (0 - 100)
    composite_risk_score = round(
        (workflow_score * 0.35) +
        (consistency_score * 0.25) +
        (receiving_score * 0.25) +
        (dup_score * 0.15),
        1
    )

    has_retrieval_error = len(system_diagnostics) > 0

    if has_retrieval_error:
        overall_risk = "AUDIT_INCOMPLETE"
        effective_risk_score = None
    elif composite_risk_score >= 60.0 or high_count >= 2:
        overall_risk = "HIGH"
        effective_risk_score = composite_risk_score
    elif composite_risk_score >= 25.0 or medium_count >= 1 or high_count == 1:
        overall_risk = "MEDIUM"
        effective_risk_score = composite_risk_score
    else:
        overall_risk = "LOW"
        effective_risk_score = composite_risk_score

    # Categorized recommendations by operational role and issue type
    manager_actions = []
    officer_actions = []
    dock_actions = []

    if has_retrieval_error:
        manager_actions.append(
            "Audit Incomplete: Could not fully verify procurement records due to backend retrieval errors. "
            "Please verify backend service availability and service account permissions."
        )

    if workflow_score > 0:
        manager_actions.append("Review unapproved PR progressions and direct PO creations to enforce standard Restaurant Manager sign-off.")
    if consistency_score > 0:
        officer_actions.append("Audit line item quantities and unit price variances between approved PRs and commercial POs.")
    if dup_score > 0:
        manager_actions.append("Review pending Purchase Requests for potential duplicates before approving new inventory commitments.")
        officer_actions.append("Consolidate overlapping ingredient requests into unified supplier purchase orders.")
    if receiving_score > 0:
        dock_actions.append("Cross-reference Goods Receipt notes against delivered quantities for damaged goods or over-shipments.")
        officer_actions.append("Follow up with suppliers on overdue open purchase orders or disputed delivery notes.")

    if not manager_actions and not officer_actions and not dock_actions:
        manager_actions.append("No active compliance risks detected. Procurement workflow operating within normal governance thresholds.")

    all_recommendations = list(dict.fromkeys(manager_actions + officer_actions + dock_actions))

    return {
        "overall_risk_level": overall_risk,
        "risk_score": effective_risk_score,
        "total_issues_found": len(key_findings),
        "high_severity_count": high_count,
        "medium_severity_count": medium_count,
        "key_findings": key_findings,
        "recommended_review_actions": all_recommendations,
        "system_diagnostics": system_diagnostics,
        "categorized_recommendations": {
            "restaurant_manager_actions": manager_actions,
            "procurement_officer_actions": officer_actions,
            "receiving_dock_actions": dock_actions,
        },
        "scoring_breakdown": {
            "workflow_governance": {"score": workflow_score, "weight": 0.35, "weighted_points": round(workflow_score * 0.35, 2)},
            "pr_po_consistency": {"score": consistency_score, "weight": 0.25, "weighted_points": round(consistency_score * 0.25, 2)},
            "receiving_reconciliation": {"score": receiving_score, "weight": 0.25, "weighted_points": round(receiving_score * 0.25, 2)},
            "duplicate_pr_control": {"score": dup_score, "weight": 0.15, "weighted_points": round(dup_score * 0.15, 2)},
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
        elif rcv_qty < ord_qty and matched_po and matched_po.get("status") in ("RECEIVED", "COMPLETED"):
            status_flags.append(f"SHORT_DELIVERY (-{round(ord_qty - rcv_qty, 2)})")

        line_items_trace.append({
            "ingredient_id": ing_id,
            "ingredient_name": ing_name,
            "unit": unit,
            "requested_quantity": req_qty,
            "ordered_quantity": ord_qty,
            "received_quantity": rcv_qty,
            "unit_price": unit_price,
            "line_subtotal": round(ord_qty * unit_price, 2),
            "status_flags": status_flags if status_flags else ["MATCH_OK"],
        })

    # Build Chronological Lifecycle Timeline Audit Trail
    timeline_events = []

    if matched_pr:
        req_at = matched_pr.get("requestedAt") or matched_pr.get("createdAt")
        timeline_events.append({
            "timestamp": str(req_at)[:19] if req_at else None,
            "stage": "PURCHASE_REQUEST_CREATED",
            "actor": matched_pr.get("requestedByName") or "Staff Member",
            "status": "COMPLETED",
            "visual_flag": "[PR CREATED]",
            "description": f"PR {matched_pr.get('id', '')[:8].upper()} created with reason: '{matched_pr.get('reason') or 'Inventory Replenishment'}'.",
        })

        if matched_pr.get("status") in ("APPROVED", "REJECTED") or matched_pr.get("approvedAt"):
            app_at = matched_pr.get("approvedAt") or req_at
            timeline_events.append({
                "timestamp": str(app_at)[:19] if app_at else None,
                "stage": f"PURCHASE_REQUEST_{matched_pr.get('status', 'APPROVED')}",
                "actor": matched_pr.get("approvedByName") or "Restaurant Manager",
                "status": "COMPLETED" if matched_pr.get("status") == "APPROVED" else "REJECTED",
                "visual_flag": "[APPROVED]" if matched_pr.get("status") == "APPROVED" else "[REJECTED]",
                "description": f"PR was {matched_pr.get('status', 'reviewed')} by Restaurant Manager {matched_pr.get('approvedByName') or ''}.",
            })
        elif matched_pr.get("status") == "PENDING_APPROVAL":
            timeline_events.append({
                "timestamp": None,
                "stage": "PURCHASE_REQUEST_PENDING_APPROVAL",
                "actor": "Pending Restaurant Manager",
                "status": "PENDING",
                "visual_flag": "[AWAITING APPROVAL]",
                "description": "PR is currently pending Restaurant Manager review and authorization.",
            })

    if matched_po:
        po_created_at = matched_po.get("createdAt") or matched_po.get("orderDate")
        timeline_events.append({
            "timestamp": str(po_created_at)[:19] if po_created_at else None,
            "stage": "PURCHASE_ORDER_CREATED",
            "actor": matched_po.get("createdByName") or "Procurement Officer",
            "status": "COMPLETED",
            "visual_flag": "[PO CREATED]",
            "description": f"PO {matched_po.get('id', '')[:8].upper()} created for supplier '{matched_po.get('supplierName') or 'Vendor'}'.",
        })

        if matched_po.get("status") in ("ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "COMPLETED"):
            timeline_events.append({
                "timestamp": str(matched_po.get("orderDate") or po_created_at)[:19],
                "stage": "PURCHASE_ORDER_ORDERED",
                "actor": matched_po.get("createdByName") or "Procurement Officer",
                "status": "COMPLETED",
                "visual_flag": "[ORDER PLACED]",
                "description": f"Commercial order officially transmitted to supplier on {str(matched_po.get('orderDate'))[:10]}.",
            })
        elif matched_po.get("status") == "DRAFT":
            timeline_events.append({
                "timestamp": None,
                "stage": "PURCHASE_ORDER_DRAFT",
                "actor": matched_po.get("createdByName") or "Procurement Officer",
                "status": "DRAFT",
                "visual_flag": "[DRAFT PO]",
                "description": "PO is currently in DRAFT status and has not yet been ordered from the supplier.",
            })

    for idx, rc in enumerate(po_receipts, 1):
        rc_at = rc.get("receiptDate") or rc.get("receivedAt") or rc.get("createdAt")
        timeline_events.append({
            "timestamp": str(rc_at)[:19] if rc_at else None,
            "stage": f"GOODS_RECEIPT_{idx}",
            "actor": rc.get("receivedByName") or "Receiving Staff",
            "status": "COMPLETED",
            "visual_flag": "[GOODS RECEIVED]",
            "description": f"Receipt GR-{rc.get('id', '')[:8].upper()} logged ({len(rc.get('items', []))} items). Notes: '{rc.get('notes') or 'Delivered as ordered'}'.",
        })

    # Sort events chronologically where timestamp exists
    dated_events = [e for e in timeline_events if e.get("timestamp")]
    undated_events = [e for e in timeline_events if not e.get("timestamp")]
    dated_events.sort(key=lambda x: str(x.get("timestamp")))
    sorted_timeline = dated_events + undated_events

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
        "lifecycle_timeline": sorted_timeline,
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
