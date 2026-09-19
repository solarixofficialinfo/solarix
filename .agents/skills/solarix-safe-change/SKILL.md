---
name: solarix-safe-change
description: Mandatory for every Solarix production code change. Enforces root-cause-first investigation, minimal diff budgets (1–3 files for local bugs), backward compatibility, impact analysis, and prevents unnecessary rewrites.
---

# SOLARIX SAFE CHANGE

You are working on a LIVE, mission-critical production application.

Never start by editing code.

---

## 1. Mandatory Pre-Change Investigation Sequence
Before touching any source file:
1. **Reproduce the issue**: Confirm the unexpected behavior or failure state with concrete evidence (logs, error trace, reproduction script, or visual capture).
2. **Locate the exact source**: Pinpoint the precise file, line range, and execution context.
3. **Identify the exact function/component/endpoint**: Trace the specific handler or React component responsible.
4. **Find every caller and subscriber**: Search the entire codebase for all invocations, imports, API consumers, and event subscribers.
5. **Inspect current data/schema**: Verify database models, Supabase tables, and API request/response contracts.
6. **Determine why current behavior occurs**: Understand why the existing code was written that way before assuming it is simply "broken".

---

## 2. Mandatory Internal Analysis Requirement
Before writing any code, document internally:
- **ROOT CAUSE**: The exact underlying defect (not the symptom).
- **AFFECTED FILES**: Minimal list of files required to resolve the defect.
- **AFFECTED CALLERS**: All upstream components or downstream systems that call this code.
- **MINIMAL PATCH**: The smallest possible surgical edit that fixes the issue safely.

---

## 3. Strict Change Budget
- **Small bug**: Target **1–3 files**.
- **Medium bug**: Change **only files proven strictly necessary**.
- **Large refactor**: Prohibited unless accompanied by explicit justification and pre-approval in the implementation plan.
- **Do not rewrite** an entire component for a local bug.
- **Do not refactor** working code.
- **Do not introduce** a new service when an existing one can be safely fixed.
- **Do not create** duplicate calculation systems or parallel state managers.
- **Do not rename** public/shared functions or hooks unless required.
- **Do not change** API response shapes.
- **Do not change** database schema unless explicitly required and migrated.
- **Do not change** unrelated UI or styles.

---

## 4. Stop & Reassess Triggers
Immediately STOP and reassess your approach if:
- The diff becomes much larger than the original problem.
- Unrelated modules or shared utilities start changing.
- A shared foundational service needs breaking modifications.
- Multiple existing workflows become affected or show regressions.

---

## 5. Mandatory Workflow for Every Future Code Task
1. **Reproduce**: Verify the issue with empirical observation.
2. **Investigate**: Trace data flow, network calls, and execution stack.
3. **Find exact root cause**: Understand the fundamental reason for failure.
4. **Identify affected files/functions/callers**: Map the complete boundary of the change.
5. **Define minimal patch**: Formulate the smallest surgical solution.
6. **Implement**: Apply only the approved minimal changes.
7. **Run targeted automated test**: Execute focused unit/integration tests (`scripts/verify-solarix.sh <feature>`).
8. **Run impacted regression tests**: Execute tests for dependent workflows mapped in the dependency map.
9. **Run production build**: Ensure zero compiler/build errors (`npm run build`).
10. **Review git diff for unrelated changes**: Run `git diff` and strip any unintended formatting or accidental edits.
11. **Produce evidence-based report**: Provide concrete proof of results.

---

## 6. Definition of Done
A task is COMPLETE only when:
$$\text{Complete} = \text{Requested behavior works} + \text{Targeted test passes} + \text{Regression suite passes} + \text{Production build passes} + \text{Git diff clean \& justified}$$

A successful build alone does NOT mean the task is fixed.
