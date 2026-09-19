---
name: solarix-debug
description: Use for bugs, broken buttons, incorrect calculations, runtime errors, stale data, and unexpected UI behavior in Solarix.
---

# SOLARIX DEBUGGING

Use this sequence for all defects:

$$\text{REPRODUCE} \longrightarrow \text{OBSERVE} \longrightarrow \text{LOCALIZE} \longrightarrow \text{ROOT CAUSE} \longrightarrow \text{MINIMAL FIX} \longrightarrow \text{VERIFY}$$

Never guess from the symptom.

---

## 1. Domain-Specific Debugging Protocols

### UI Bugs & Broken Buttons
- Check browser console for uncaught exceptions, React hydration errors, or unhandled Promise rejections.
- Inspect Network tab: Check endpoint URLs, HTTP status codes, request payloads, and response JSON.
- Verify React component lifecycle: Inspect DOM mounts, re-renders, useEffect dependencies, and hook execution orders.
- Inspect React Query / SWR cache states: Verify whether queries are fetching, stale, cached, or missing required invalidation keys.

### API & Backend Bugs
- Trace the complete path:
  $$\text{UI Action} \longrightarrow \text{HTTP Request} \longrightarrow \text{FastAPI Endpoint} \longrightarrow \text{Database Query (Supabase/Mongo)} \longrightarrow \text{Serialization} \longrightarrow \text{UI State}$$
- Check route decorators, Pydantic schema validation errors (422), permission middleware (403), and exception handlers (500).
- Inspect database execution logs and PostgREST error messages.

### Calculation & Math Bugs
- Trace:
  $$\text{Source Inputs} \longrightarrow \text{Transformation / Type Coercion} \longrightarrow \text{Calculation Formula} \longrightarrow \text{Displayed Result}$$
- Verify float precision, string-to-number conversions (`parseFloat`, `Number`), and currency/unit rounding rules.
- Test edge cases: Zero values, negative values, empty arrays, null/undefined inputs, and non-standard symbols (`*`, `X`, `x`, `×`).

### Stale Data & Refresh Bugs
- Trace:
  $$\text{Mutation (POST/PATCH/DELETE)} \longrightarrow \text{Persistence (DB Commit)} \longrightarrow \text{Cache Invalidation} \longrightarrow \text{Refetch} \longrightarrow \text{Re-render}$$
- Verify React Query cache keys: Exact prefix matching is required (e.g., `["inventory"]` matches `["inventory", "products"]`, whereas `["products"]` will not).
- Check multi-tier caching: Local file cache, in-memory caches (`_PRODUCTS_CACHE`), session storage (`gvp_products_cache_v1`), and browser caches.

### Runtime Errors
- Identify the original source symbol, not the minified bundle variable (e.g., source maps or unminified development trace).
- Check null/undefined property accesses (`?.` optional chaining vs guaranteed non-null fields).

---

## 2. Anti-Patterns to Avoid
- **Never patch the symptom while leaving the cause unchanged** (e.g., adding an arbitrary `setTimeout`, forcing a full window reload, or ignoring error promises).
- **Never hide data inconsistency with an artificial frontend refresh**.
- **Never swallow errors in empty catch blocks**.

---

## 3. Mandatory Bug Fix Checklist
- [ ] Issue reproduced with empirical evidence.
- [ ] Root cause documented.
- [ ] Fix touches the minimal change budget (1–3 files for local bugs).
- [ ] Automated regression test added or executed.
- [ ] Verification script (`scripts/verify-solarix.sh`) passes with 0 errors.
