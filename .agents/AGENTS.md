# SOLARIX OPERATIONAL PROTOCOLS & GOVERNANCE

The following 6 mandatory operational protocols govern all engineering work on the Solarix codebase. Every change must strictly comply with these rules.

---

## 1. SOLARIX SAFE CHANGE (`solarix-safe-change`)
**Mandatory for every Solarix production code change.**
- **Live Production App**: Never start by editing code.
- **Workflow**: 
  1. Reproduce the issue.
  2. Locate the exact source.
  3. Identify the exact function/component/endpoint.
  4. Find every caller.
  5. Inspect current data/schema when relevant.
  6. Determine why the current behavior occurs.
- **Change Budget**:
  - Fix the smallest possible surface (prefer 1–3 files for a small bug).
  - Do not rewrite an entire component for a local bug.
  - Do not refactor working code.
  - Do not introduce a new service when an existing one can be safely fixed.
  - Do not create duplicate calculation systems.
  - Do not rename public/shared functions unless required.
  - Do not change API response shapes or DB schema unless explicitly required.
  - Do not change unrelated UI.
- **Stop & Reassess** when the diff becomes much larger than the original problem, unrelated modules change, or shared services need modification.
- **Internal Analysis Requirement**: Record ROOT CAUSE, AFFECTED FILES, AFFECTED CALLERS, and MINIMAL PATCH before coding.
- **Post-Change**: Review `git diff` and remove unrelated changes. A successful build alone does NOT mean the task is fixed.

---

## 2. SOLARIX DEBUGGING (`solarix-debug`)
**For bugs, broken buttons, incorrect calculations, runtime errors, stale data, and unexpected UI behavior.**
- **Sequence**: REPRODUCE → OBSERVE → LOCALIZE → ROOT CAUSE → MINIMAL FIX → VERIFY.
- Never guess from the symptom.
- **UI Bugs**: Check browser console, network tab, DOM/state lifecycle.
- **API Bugs**: Trace UI → request → backend → database → response → UI state.
- **Calculation Bugs**: Trace source inputs → transformation → calculation → displayed result.
- **Stale-Data Bugs**: Trace mutation → persistence → cache invalidation → refetch → render.
- **Runtime Errors**: Identify the original source symbol, not the minified browser variable.
- Do not patch the symptom while leaving the cause unchanged.

---

## 3. SOLARIX AUTOMATIC TESTING (`solarix-test`)
**Automatically verifies Solarix feature behavior after implementation.**
- Every code change must produce a test plan automatically.
- **Risk Classification**:
  - **LOW** (isolated UI/text/style change): targeted component test + build.
  - **MEDIUM** (component behavior, API handler, calculation, shared utility): targeted test + impacted workflow test + build.
  - **HIGH** (database, inventory, permissions, authentication, shared service, routing, Solar Designer geometry, payment, document generation): targeted tests + complete impacted workflow + production build + relevant regression suite.
- Never claim "tested" without actually running the test.
- Use Playwright for real browser E2E flows, Testing Library for components, Vitest/pytest for pure logic/calculations.
- Tests must assert **RESULTS**, not implementation details. Add regression tests for every bug.

---

## 4. SOLARIX REGRESSION (`solarix-regression`)
**Runs risk-based regression checks after Solarix changes.**
- Maintain and follow the feature dependency map across core workflows:
  - AUTH, DASHBOARD, LEADS, CLIENTS, PROJECT EXECUTION, TASK PORTAL, INWARD, OUTWARD, PRODUCT MASTER, BALANCE, HISTORY, HIGH VALUE GOODS, MATERIAL REQUESTS, CLIENT DATA, REPORTS, RECEIVABLES & COLLECTION, SALES DOCUMENTS, PROPOSAL GENERATOR, SOLAR DESIGNER, 3D VIEWER, PERMISSIONS.
- Run tests based on affected dependencies. If a shared dependency is touched, expand the regression scope automatically.

---

## 5. SOLARIX DATA INTEGRITY (`solarix-data-integrity`)
**Mandatory for inventory, transactions, balances, product identity, edits, history, and assets.**
- Never trust displayed UI state as the source of truth.
- Trace: INPUT → VALIDATION → API → DATABASE → DERIVED DATA → CACHE → UI.
- Every mutation must be tested for: CREATE, EDIT, DELETE/VOID (where supported), REFRESH, RELOAD.
- **Inventory Invariant**:
  `BALANCE = authoritative inward movements - authoritative outward movements + approved adjustments`
- Use one authoritative calculation path. Never create duplicate balance engines.
- Product identity must use stable Product Master identity where available (`product_id`).
- Display formatting must not accidentally create a new logical product (e.g., `25*8`, `25X8`, `25×8` share canonical identity, but `25*8` vs `25*10` remain distinct).
- All views must agree: Product Master, Balance, History, High Value Goods.
- **Quantity Edit Formula**:
  `OLD BALANCE - OLD MOVEMENT + NEW MOVEMENT = NEW BALANCE`
- Never hide data inconsistency with a frontend refresh.

---

## 6. SOLARIX PERFORMANCE (`solarix-performance`)
**Applies when pages/APIs are slow, rendering is expensive, large datasets fail, or heavy features affect performance.**
- Measure before optimizing (profile slow APIs, slow queries, large payloads, duplicate requests, unneeded renders).
- Never load an entire dataset to render one page.
- Never calculate millions of rows in React when database aggregation is appropriate.
- Never reload the whole application after one mutation.
- Never recreate map/3D engines unnecessarily; stop Three.js animation loops while 3D is inactive.
- Never run heavy calculations on `mousemove`.
- Use route/feature lazy loading and server-side pagination for large datasets.
- Use targeted cache invalidation.
- Performance optimizations must never alter business logic or change input/output contracts.
