---
name: solarix-performance
description: Use when Solarix pages are slow, APIs are slow, rendering is expensive, large datasets fail, or heavy features affect unrelated pages.
---

# SOLARIX PERFORMANCE

Measure before optimizing. Never optimize by guessing.

---

## 1. Golden Performance Rules
1. **Never load an entire dataset to render one page**:
   - Always push down filters and pagination limits to the database query.
   - For 2M+ records, clamp initial fetch windows (e.g., `min(page * page_size + buffer, max_limit)`).
2. **Never calculate millions of rows in React**:
   - Perform aggregations in database queries or cached server-side projections.
3. **Never reload the entire application after a single mutation**:
   - Use targeted cache invalidation with exact query key scopes (e.g., `["inventory"]`).
4. **Never recreate a map or 3D engine unnecessarily**:
   - Cache map instances, layers, and WebGL canvases.
5. **Never run a Three.js render loop while 3D is inactive**:
   - Always stop `requestAnimationFrame` loops when switching to 2D views or navigating away.
6. **Never run heavy calculations on `mousemove`**:
   - Throttle/debounce pointer events with `requestAnimationFrame` or limit polygon intersection tests.
7. **Keep calculations pure and reusable**:
   - Performance optimizations must **never** alter business logic or change input/output contracts. Same inputs must produce identical outputs.

---

## 2. Profiling Checklist
Before writing an optimization, identify the bottleneck:
- [ ] Slow API endpoint (measure response time with timestamp tracing).
- [ ] Slow database query (inspect Supabase query plans and column projections).
- [ ] Large response payload (project only required fields, remove unused base64 or documents).
- [ ] Duplicate network requests (check React Query deduplication and staleTime).
- [ ] Unnecessary re-renders (inspect React component renders via React Profiler / why-did-you-render).
- [ ] Memory-heavy components (check event listener cleanup, canvas disposal).
