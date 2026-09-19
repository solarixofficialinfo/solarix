---
name: solarix-regression
description: Runs risk-based regression checks after Solarix changes so existing workflows are automatically verified instead of relying on manual testing.
---

# SOLARIX REGRESSION

Maintain and follow the feature dependency map across all Solarix engineering workflows.

DO NOT run every test for every tiny CSS change.
DO NOT skip regression tests when shared systems are touched.

Run tests strictly based on affected dependencies. If a shared dependency is touched, expand the regression scope automatically.

---

## 1. Feature Dependency Matrix

| Feature / Workflow | Primary Source Files | Shared Dependencies | Required Regression Tests |
| :--- | :--- | :--- | :--- |
| **AUTH** | `frontend/src/pages/Login.js`, `frontend/src/context/AuthContext.js`, `backend/server.py` (`login`, `auth_me`) | Supabase Auth, JWT verification, `plan_config.py` | `backend/test_access_hierarchy.py` (Tests E, F, P, Q), Auth token lifecycle |
| **DASHBOARD** | `frontend/src/pages/Dashboard.js`, `frontend/src/components/Dashboard/*` | Company multi-tenant context, KPI aggregation | `backend/test_access_hierarchy.py`, `backend/test_leads_management.py` |
| **LEADS** | `frontend/src/pages/Leads.js`, `frontend/src/components/Leads/*`, `frontend/src/hooks/useLeads.js`, `backend/server.py` | Team permissions, Client linking, Supabase `leads` | `backend/test_leads_management.py` (13 tests), `backend/test_realtime_entitlement_leads.py` (8 tests) |
| **CLIENTS** | `frontend/src/pages/Clients.js`, `frontend/src/components/Clients/*`, `frontend/src/hooks/useClients.js`, `backend/server.py` | Bidirectional lead link (`sol_id`), Document generation | `backend/test_leads_management.py` (Tests 5, 6, 7: Client Onboarding & Lead Linking) |
| **PROJECT EXECUTION** | `frontend/src/pages/ProjectExecution.js`, `frontend/src/components/ProjectExecution/*`, `backend/server.py` | Client project linking, Milestones, Stage management | Project stage transition validation |
| **TASK PORTAL** | `frontend/src/pages/TaskPortal.js`, `frontend/src/components/TaskPortal/*`, `backend/server.py` | Team assignment, notification triggers | User assignment & task status validation |
| **INWARD** | `frontend/src/components/Inventory/InwardTab.js`, `backend/server.py` (`save_inward_entry_logic`) | Product Master (`product_id`), `_PRODUCTS_CACHE`, `_apply_transaction_balance_delta`, `high-value-ledger` | `backend/test_inventory_intelligence.py` (Tests 3, 4, 5), Invariant calculation test |
| **OUTWARD** | `frontend/src/components/Inventory/OutwardTab.js`, `backend/server.py` (`save_outward_entry_logic`) | Product Master (`product_id`), `_PRODUCTS_CACHE`, `_apply_transaction_balance_delta`, `high-value-ledger` | `backend/test_inventory_intelligence.py` (Tests 3, 4, 5), Invariant calculation test |
| **PRODUCT MASTER** | `frontend/src/components/Inventory/ProductMasterTab.js`, `backend/server.py` (`/inventory/products/*`) | Normalization (`norm_str`), canonical identity (`25*8` vs `25X8`), category tree | `backend/test_inventory_intelligence.py` (Tests 3, 7), canonical size test |
| **BALANCE** | `frontend/src/components/Inventory/BalanceTab.js`, `frontend/src/hooks/useInventory.js`, `backend/server.py` | Inward/Outward movements, `_PRODUCTS_CACHE`, React Query `["inventory"]` | `backend/test_inventory_intelligence.py` (Test 3) |
| **HISTORY** | `frontend/src/components/Inventory/HistoryTab.js`, `frontend/src/components/Inventory/EditTransactionDialog.js`, `backend/server.py` | Inward/Outward records, server-side pagination, query pushdown | `backend/test_inventory_intelligence.py`, History pagination test |
| **HIGH VALUE GOODS** | `frontend/src/components/Inventory/HighValueGoodsTab.js`, `frontend/src/hooks/useInventory.js`, `backend/server.py` | Serialized asset status (`In Stock`, `Issued`, `Installed`, `Damaged`), `["high-value-ledger"]` | `backend/test_inventory_intelligence.py` (Tests 5, 7) |
| **MATERIAL REQUESTS** | `frontend/src/pages/MaterialRequests.js`, `frontend/src/components/MaterialRequests/*`, `backend/server.py` | Product Master, Outward issue pipeline | Material request stock deduction check |
| **CLIENT DATA** | `frontend/src/pages/ClientData.js`, `backend/server.py` | Supabase clients table, Excel export | Data export integrity check |
| **REPORTS** | `frontend/src/pages/Reports.js`, `backend/server.py` | Aggregate analytics views | Reporting balance check |
| **RECEIVABLES & COLLECTION** | `frontend/src/pages/Receivables.js`, `backend/server.py` | Project milestone invoices, payment receipts | Receivables summation check |
| **SALES DOCUMENTS** | `frontend/src/pages/SalesDocuments.js`, `backend/server.py` (`/documents/*`) | Jinja2, docxtpl, reportlab, Client data | Document generation validation |
| **PROPOSAL GENERATOR** | `frontend/src/pages/ProposalGenerator.js`, `backend/server.py` (`/proposals/*`) | System pricing, solar capacity formulas, PDF output | Proposal generation calculation test |
| **SOLAR DESIGNER** | `frontend/src/pages/SolarDesigner.js`, `frontend/src/components/SolarDesigner/*` | Leaflet engine, roof polygon math, obstacle collision | Roof placement & panel layout verification |
| **3D VIEWER** | `frontend/src/components/SolarDesigner/ThreeDViewer.js` | Three.js scene graph, canvas animation loop | 3D render loop start/stop, canvas unmount |
| **PERMISSIONS & CONTROL CENTER** | `frontend/src/pages/ControlCenter.js`, `backend/plan_config.py`, `backend/server.py` | Tier entitlement (Starter, Growth, Pro), Feature flags, Quotas | `backend/test_access_hierarchy.py` (17 tests), `backend/test_realtime_entitlement_leads.py` (8 tests) |

---

## 2. Regression Selection Rules
- **Product Master change** $\longrightarrow$ Verify: Product Master, Inward search, Outward search, Balance, History, High Value Goods.
- **Inventory balance change** $\longrightarrow$ Verify: Inward, Outward, Product Master, Balance, History, High Value Goods, and Material Requests if product stock is shared.
- **Solar Designer map change** $\longrightarrow$ Verify: Location, Roof, Obstacles, PV Module, Auto Layout, Manual Layout, 3D Mode, Save/Reload Design.
- **Document/PDF change** $\longrightarrow$ Verify: Relevant document flow, PDF generation, and download/open validation.
- **Authentication change** $\longrightarrow$ Verify: Login, logout, permissions, protected routes, and session persistence.
- **Shared dependency change** $\longrightarrow$ Automatically expand regression scope to all dependent features.
