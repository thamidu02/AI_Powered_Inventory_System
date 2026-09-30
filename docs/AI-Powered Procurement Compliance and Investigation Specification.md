# Component 2: AI-Powered Procurement Compliance and Investigation Tool

## 1. Executive Summary

The **AI-Powered Procurement Compliance and Investigation Tool** is the specialized artificial intelligence component for **Component 2 — Supplier & Procurement Management** in the Restaurant Inventory and Management System.

Its primary mission is to provide **authoritative, explainable, and strictly read-only** auditing across the entire procurement lifecycle. The tool audits historical and active transactions, verifies alignment between commercial documents, detects operational compliance breaches, calculates financial cost variances, and traces complete transaction lifecycles from Purchase Request (PR) to Purchase Order (PO) to Goods Receipt (GR).

---

## 2. System Architecture & Component Boundaries

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 FRONTEND CLIENT                                        │
│  - Floating AI Chat Widget (`FloatingAiChatWidget.tsx`)                                │
│  - AI Assistant Interface (`AiAssistantChat.tsx`)                                      │
│  - Dedicated Procurement Compliance Quick Actions & Capability Discovery Cards         │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ Natural Language / Quick Actions (SSE)
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              FASTAPI AI SERVICE                                        │
│  - Intent Classifier & Pre-Formatter (`agent.py`)                                      │
│    └─ Route: `PROCUREMENT_COMPLIANCE_INVESTIGATION`                                    │
│  - Multi-Turn Gemini Generative Model (`gemini-2.5-flash`)                             │
│  - Explainability & Governance Citation Engine                                         │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ Read-Only Function Calling
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        PROCUREMENT COMPLIANCE TOOL SUITE                               │
│                         (`tools/procurement_compliance.py`)                            │
│                                                                                        │
│  1. `check_duplicate_purchase_requests`     -> Temporal & requester similarity         │
│  2. `check_pr_po_consistency`               -> Line item & financial variance audit    │
│  3. `check_workflow_compliance`             -> Approval governance rule verification   │
│  4. `check_receiving_discrepancies`         -> Over/short receipt & damage tracking    │
│  5. `analyze_procurement_compliance`        -> Weighted multi-factor risk scoring      │
│  6. `investigate_procurement_transaction`   -> End-to-end chronological lifecycle trace │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ HTTP GET (Strictly Read-Only)
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              .NET 10 BACKEND REST API                                  │
│  - `GET /api/PurchaseRequests`                                                         │
│  - `GET /api/PurchaseOrders`                                                           │
│  - `GET /api/GoodsReceipts`                                                            │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Strict Boundary Distinction: Component 2 vs. Component 4

| Responsibility Area | Component 2 (Procurement Compliance) | Component 4 (Demand Planning) |
| :--- | :--- | :--- |
| **Primary Focus** | Governance, Audit, Compliance, Investigation | Future Forecasting & Stock Optimization |
| **Data Scope** | PRs, POs, Goods Receipts, Approval Logs | Historical Consumption, POS Sales, Weather |
| **Functionality** | • Duplicate PR detection<br>• PR-to-PO consistency & spend variance<br>• Workflow governance verification<br>• Receiving discrepancy & damage audit<br>• PR → PO → GR chronological traceability | • Multi-horizon demand forecasting<br>• Weather-aware consumption modeling<br>• Automated reorder point suggestions<br>• Predictive supplier lead-time analysis |
| **System Role** | **Strictly Read-Only Auditor** | **Predictive Planning Specialist** |

Component 2 **never** generates future demand forecasts or purchasing quantity recommendations.

---

## 3. Strict Read-Only Governance & Procurement Business Rules

### Role & Approval Governance
1. **Purchase Requests (PR)**:
   - Created by Kitchen/Floor Staff.
   - **Restaurant Manager approval is MANDATORY** before any procurement commitment can be authorized.
2. **Purchase Orders (PO)**:
   - Created by the Procurement Officer (starting in `DRAFT` status).
   - **Manager approval is NOT required on POs**.
   - The Procurement Officer reviews the draft and **explicitly executes the order** to transmit it to the supplier (`DRAFT` → `ORDERED`).
3. **Goods Receiving (GR)**:
   - Received and recorded by Receiving Dock staff against the open Purchase Order.

### AI Safety Hard Boundaries
- **Strictly Read-Only**: The AI operates exclusively on a `Detect → Analyze → Explain → Report` model.
- **Never Auto-Approve / Reject**: AI cannot approve or reject Purchase Requests.
- **Never Auto-Order**: AI cannot order Purchase Orders or place orders with suppliers.
- **Never Auto-Receive**: AI cannot modify physical inventory balances or create Goods Receipts.
- **Human In The Loop**: All corrective actions recommend explicit review by the Restaurant Manager, Procurement Officer, or Receiving Staff.

---

## 4. Core Compliance Tools & Algorithmic Design

### 4.1 Duplicate Purchase Request Detection (`check_duplicate_purchase_requests`)
- **Temporal Window**: Evaluates PRs within a configurable sliding window (default: 14 days).
- **Ingredient & Quantity Comparison**: Uses Jaccard overlap and quantity symmetry ratios:
  $$\text{Quantity Similarity} = 1.0 - \frac{|\text{Qty}_1 - \text{Qty}_2|}{\max(\text{Qty}_1, \text{Qty}_2)}$$
- **Requester Signal**: Adds a 10% bonus when consecutive similar requests originate from the same user.
- **Active Filtering**: Automatically excludes paired inactive/cancelled/rejected requests to prevent false alarms.

### 4.2 PR-to-PO Consistency & Financial Impact Analysis (`check_pr_po_consistency`)
- **Quantity Reconciliation**: Compares requested quantities on approved PRs against ordered quantities on commercial POs.
- **Financial Variance Calculation**: Quantifies unauthorized spend resulting from excess order quantities or extra unapproved items:
  $$\text{Unauthorized Extra Spend} = \sum (\text{Ordered Qty} - \text{Approved Qty}) \times \text{Unit Price}$$
- **Omission & Extra Item Detection**: Identifies approved ingredients omitted from POs and unrequested items added to commercial orders.

### 4.3 Approval Workflow Validation (`check_workflow_compliance`)
- **Pre-requisite Validation**: Flags commercial POs placed against PRs that remain in `PENDING_APPROVAL`, `REJECTED`, or `CANCELLED` status ([Rule WF-01]).
- **Identity & Timestamp Verification**: Verifies manager signature and approval timestamps on approved requests ([Rule PR-01]).
- **Direct PO Handling**: Audits direct purchase orders created without a linked PR requisition.

### 4.4 Receiving Discrepancy & Quality Audit (`check_receiving_discrepancies`)
- **Over-Receipt & Short Delivery**: Compares PO ordered quantities against cumulative Goods Receipt quantities.
- **Damage & Defect Signal Detection**: Inspects Goods Receipt notes for quality keywords (`damaged`, `broken`, `spoiled`, `rejected`, `leaking`) ([Rule QA-01]).
- **Overdue Delivery Tracking**: Flags open purchase orders where `expectedDeliveryDate` has passed without receiving logs using strict calendar-day boundary comparison (`expected_date < today_date`). Same-day expected deliveries are not prematurely marked overdue.

### 4.5 Transparent Multi-Factor Risk Scoring (`analyze_procurement_compliance`)
Computes an explainable composite Procurement Compliance Risk Score ($0 - 100$) using clearly documented factor weights:

$$\text{Risk Score} = 0.35 \times S_{\text{workflow}} + 0.25 \times S_{\text{consistency}} + 0.25 \times S_{\text{receiving}} + 0.15 \times S_{\text{duplicate}}$$

| Risk Tier | Score Range | Operational Meaning |
| :--- | :--- | :--- |
| **LOW** | $0.0 - 24.9$ | Fully compliant operations; minor or no variances. |
| **MEDIUM** | $25.0 - 59.9$ | Moderate discrepancies; advisory review recommended. |
| **HIGH** | $60.0 - 100.0$ | Severe workflow breach, significant extra spend, or quality damage. |

### 4.6 Chronological Lifecycle Audit Trail (`investigate_procurement_transaction`)
Constructs an end-to-end chronological timeline tracing milestones across:
$$\text{PR Created} \longrightarrow \text{PR Reviewed/Approved} \longrightarrow \text{PO Created} \longrightarrow \text{PO Ordered} \longrightarrow \text{Goods Received}$$
Decorated with visual status badges (`[PR CREATED]`, `[APPROVED]`, `[PO CREATED]`, `[ORDER PLACED]`, `[GOODS RECEIVED]`).

---

## 5. Explainable Reasoning & Governance Citations

All AI findings are formatted with explicit citations to restaurant governance rules:
- **[Rule PR-01]**: Purchase Requests require Restaurant Manager approval before procurement authorization.
- **[Rule PO-01]**: Purchase Orders do NOT require Manager approval; Procurement Officer orders directly.
- **[Rule PO-02]**: PO ordering is an explicit manual action by the Procurement Officer (`DRAFT` → `ORDERED`).
- **[Rule WF-01]**: Creating a commercial PO against an unapproved or pending PR is an unauthorized workflow breach.
- **[Rule QA-01]**: Goods receipt items with damage notes or quantity variances require dock quarantine and supplier reconciliation.

Every discrepancy is analyzed across a 5-point explainability framework:
1. **What Was Detected** (Document IDs, line items, variance metrics, linked vs. direct order breakdown).
2. **Evidence Used** (Concrete quantities, unit prices, timestamps).
3. **Why It Matters** (Financial impact, excess inventory, unauthorized liability).
4. **Governance Rule Cited** (Explicit rule reference).
5. **Recommended Human Follow-up** (Categorized actions for Restaurant Manager, Procurement Officer, and Receiving Staff).

---

## 6. Security, Authorization & Error Degradation

### 6.1 Role-Based Access Control (RBAC) & Service Isolation
- **Role Identity**: The AI Service authenticates against the .NET API as a service account with the dedicated role `AI_SERVICE`.
- **Read-Only Authorization**: `AI_SERVICE` is granted `HTTP GET` permissions for:
  - `/api/Suppliers`
  - `/api/PurchaseRequests`
  - `/api/PurchaseOrders`
  - `/api/GoodsReceipts`
- **Mutation Blockade**: All mutating endpoints (`POST`, `PUT`, `DELETE`) across procurement controllers reject `AI_SERVICE` requests with `403 Forbidden`. The AI service has zero write privileges.

### 6.2 Degraded Backend Error Handling
- All internal GET operations wrap backend HTTP calls via `_safe_get`.
- Network timeouts, HTTP 500/502/503 responses, and connection refusals are intercepted and converted into structured diagnostic errors without crashing the AI assistant or throwing unhandled exceptions.
- Compliance reports return `AUDIT_INCOMPLETE` with clear system diagnostics when upstream backend services are degraded.

---

## 7. Testing Strategy & Validation

The test suite is implemented using Python's standard `unittest` framework with isolated async test cases (`unittest.IsolatedAsyncioTestCase`):

| Test Suite Class | File | Focus Area | Test Count |
| :--- | :--- | :--- | :--- |
| `TestDuplicatePurchaseRequestDetection` | `test_procurement_compliance.py` | Temporal similarity, requester bonus, unordered item matching, zero quantity handling, inactive PR filtering | 9 |
| `TestPRtoPOConsistency` | `test_procurement_compliance.py` | Quantity mismatch, financial spend variance, omitted items, extra items, linked/direct breakdown counts | 6 |
| `TestWorkflowCompliance` | `test_procurement_compliance.py` | Approved PR flow, unapproved PR progression, missing approver metadata, direct POs | 4 |
| `TestReceivingDiscrepanciesAndInvestigation` | `test_procurement_compliance.py` | Over/under-delivery, same-day delivery boundary, damaged goods notes, full PR→PO→GR lifecycle tracing | 8 |
| `TestDegradedBackendErrorHandling` | `test_procurement_compliance.py` | HTTP 500, network timeouts, degraded compliance fallbacks | 4 |
| `TestAIServiceReadOnlyProcurementSecurity` | `test_ai_service_security.py` | Read-only transport verification, mutation isolation, endpoint scope validation | 3 |
| **Total Test Coverage** | | **Comprehensive Component 2 Compliance Suite** | **34 Tests** |
