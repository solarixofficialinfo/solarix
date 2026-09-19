# SOLARIX FEATURE & TEST DEPENDENCY MAP

This map dictates which regression tests MUST run when files are modified.
Engineers and AI agents must automatically select the smallest relevant test set based on affected files.

---

## Dependency Routing Matrix

### 1. Inventory Engine (Inward, Outward, Product Master, Balance, History, High Value Goods)
- **Feature**: `INVENTORY`
- **Source Files**:
  - `backend/server.py` (`save_inward_entry_logic`, `save_outward_entry_logic`, `update_inward`, `update_outward`, `delete_inward`, `delete_outward`, `inv_history`, `_compute_inventory_balances`, `_apply_transaction_balance_delta`)
  - `frontend/src/components/Inventory/InwardTab.js`
  - `frontend/src/components/Inventory/OutwardTab.js`
  - `frontend/src/components/Inventory/ProductMasterTab.js`
  - `frontend/src/components/Inventory/BalanceTab.js`
  - `frontend/src/components/Inventory/HistoryTab.js`
  - `frontend/src/components/Inventory/HighValueGoodsTab.js`
  - `frontend/src/components/Inventory/EditTransactionDialog.js`
  - `frontend/src/hooks/useInventory.js`
  - `frontend/src/pages/Inventory.js`
- **Shared Dependencies**:
  - Product Master canonical identity (`product_id`, `norm_str`)
  - `_PRODUCTS_CACHE` in-memory store
  - React Query keys: `["inventory"]`, `["high-value-ledger"]`, `["high-value-assets"]`
  - Supabase tables: `inventory_inward`, `inventory_outward`, `products`, `high_value_goods`
- **Required Regression Tests**:
  - `backend/test_inventory_intelligence.py` (all 7 tests)
  - Mathematical balance invariant check: $\text{Balance} = \text{Inward} - \text{Outward} + \text{Adjustments}$
  - Quantity edit formula check: $\text{New Balance} = \text{Old Balance} - \text{Old Movement} + \text{New Movement}$

---

### 2. Leads Management & Onboarding
- **Feature**: `LEADS`
- **Source Files**:
  - `frontend/src/pages/Leads.js`
  - `frontend/src/components/Leads/*`
  - `frontend/src/hooks/useLeads.js`
  - `backend/server.py` (`/leads/*`, `/leads/{lead_id}/confirm`)
- **Shared Dependencies**:
  - Client conversion pipeline (`sol_id` generation)
  - Multi-tenant company isolation
  - Team assignment permissions
  - Supabase `leads` and `clients` tables
- **Required Regression Tests**:
  - `backend/test_leads_management.py` (13 tests)
  - `backend/test_realtime_entitlement_leads.py` (8 tests)

---

### 3. Clients & Customer Data
- **Feature**: `CLIENTS`
- **Source Files**:
  - `frontend/src/pages/Clients.js`
  - `frontend/src/components/Clients/*`
  - `frontend/src/hooks/useClients.js`
  - `frontend/src/pages/ClientData.js`
  - `backend/server.py` (`/clients/*`, `/client-data/*`)
- **Shared Dependencies**:
  - Bidirectional lead link (`sol_id`)
  - Project execution linking
  - Document generation inputs
- **Required Regression Tests**:
  - `backend/test_leads_management.py` (Tests 5, 6, 7: Client Onboarding & Lead Linking)

---

### 4. Authentication, Permissions & Control Center
- **Feature**: `AUTH_PERMISSIONS`
- **Source Files**:
  - `frontend/src/pages/Login.js`
  - `frontend/src/context/AuthContext.js`
  - `frontend/src/pages/ControlCenter.js`
  - `backend/plan_config.py`
  - `backend/server.py` (`login`, `auth_me`, token verification, entitlement middleware)
- **Shared Dependencies**:
  - JWT auth tokens
  - Plan tiers (Starter, Growth, Pro)
  - Feature entitlement flags & dynamic quotas
- **Required Regression Tests**:
  - `backend/test_access_hierarchy.py` (17 tests)
  - `backend/test_realtime_entitlement_leads.py` (Tests 1, 2, 3, 4)

---

### 5. Solar Designer & 3D Viewer
- **Feature**: `SOLAR_DESIGNER`
- **Source Files**:
  - `frontend/src/pages/SolarDesigner.js`
  - `frontend/src/components/SolarDesigner/*`
  - `frontend/src/components/SolarDesigner/ThreeDViewer.js`
- **Shared Dependencies**:
  - Leaflet map instance
  - Three.js WebGL canvas & render loop
  - Geometry & layout calculations (obstacles, azimuth, tilt)
- **Required Regression Tests**:
  - 2D/3D mode transition and canvas mount/unmount memory check
  - Roof polygon & auto-layout panel calculation verification
  - Headless Chrome visual layout validation (`scratch/verify_complete_workflow.mjs` or targeted runner)

---

### 6. Document Generation & Proposal Generator
- **Feature**: `DOCUMENTS`
- **Source Files**:
  - `frontend/src/pages/SalesDocuments.js`
  - `frontend/src/pages/ProposalGenerator.js`
  - `backend/server.py` (`/documents/*`, `/proposals/*`)
- **Shared Dependencies**:
  - Jinja2, docxtpl, reportlab
  - Client data, pricing calculations
- **Required Regression Tests**:
  - Document generation API status & PDF header check

---

### 7. Universal Build & Syntax Regression
- **Trigger**: Touched ANY file in `frontend/src` or `backend/`
- **Required Automated Steps**:
  1. Python syntax check: `python -m py_compile <file>`
  2. Python static lint: `pyflakes <file>`
  3. Production build check: `cd frontend && npm run build` (`craco build`)
  4. Git diff audit: `git diff --stat` ensuring no extraneous or accidental changes
