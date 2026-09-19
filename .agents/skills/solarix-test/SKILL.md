---
name: solarix-test
description: Automatically verifies Solarix feature behavior after implementation using targeted unit, integration, API, and browser tests.
---

# SOLARIX AUTOMATIC TESTING

Every code change must produce an automated test plan automatically.

Never claim "tested" without actually executing the tests and capturing verifiable results.

---

## 1. Risk Classification

| Risk Level | Scope of Change | Required Verification Pipeline |
| :--- | :--- | :--- |
| **LOW** | Isolated UI/text/style changes, CSS adjustments, static labels | Targeted component test + Production build (`craco build`) |
| **MEDIUM** | Component behavior, API handlers, calculations, shared utilities, hooks | Targeted test + Impacted workflow test + Production build |
| **HIGH** | Database models, inventory transactions, balances, permissions, authentication, routing, Solar Designer geometry, payments, document/PDF generation | Targeted tests + Complete impacted workflow test suite + Production build + Full regression suite (`scripts/verify-solarix.sh`) |

---

## 2. Testing Frameworks & Tooling
- **Pure Logic & Calculations**: Run targeted Python tests with `backend/.venv/bin/python <test_file>.py` or Jest via `craco test`.
- **API & Integration Flows**: Use backend integration test suites (`backend/test_*.py`).
- **UI & Browser End-to-End**:
  - If Playwright is installed, reuse Playwright test suites.
  - For browser workflow verification in environments without external heavy runners, use native headless Chrome / CDP runner scripts (`scratch/verify_*.mjs`) via Node 24.
- **Production Build Integrity**: Run `npm run build` (`craco build`) to verify bundle compilation, JSX syntax, and ESLint rule compliance.

---

## 3. Core Testing Principles
1. **Assert RESULTS, not implementation details**: Tests must verify user-observable behavior, API responses, and database state transitions.
2. **Deterministic execution**: Tests must not rely on unmanaged sleep intervals; use polling or event listeners with timeouts.
3. **Regression tests for every bug**: When fixing a bug, add or run a test that reproduces the defect and asserts the resolution.
4. **Automated runner**: Execute tests via `scripts/verify-solarix.sh` with the target feature name.
