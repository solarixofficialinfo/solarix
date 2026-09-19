---
name: solarix-data-integrity
description: Use for inventory, transactions, balances, product identity, edits, history, assets, and any feature where data consistency matters.
---

# SOLARIX DATA INTEGRITY

Never trust displayed UI state as the source of truth.

Trace every data flow through the authoritative pipeline:
$$\text{INPUT} \longrightarrow \text{VALIDATION} \longrightarrow \text{API} \longrightarrow \text{DATABASE} \longrightarrow \text{DERIVED DATA} \longrightarrow \text{CACHE} \longrightarrow \text{UI}$$

---

## 1. Core Mathematical Invariants

### 1.1 The Inventory Balance Invariant
$$\text{BALANCE} = \sum (\text{Authoritative Inward Movements}) - \sum (\text{Authoritative Outward Movements}) + \sum (\text{Approved Adjustments})$$
- There is only ONE authoritative balance calculation path.
- **Never** create duplicate balance engines or divergent client-side balance aggregations.

### 1.2 The Quantity Edit Formula
When editing an existing transaction quantity:
$$\text{NEW BALANCE} = \text{OLD BALANCE} - \text{OLD MOVEMENT} + \text{NEW MOVEMENT}$$
$$\Delta = \text{NEW QUANTITY} - \text{OLD QUANTITY}$$
For an inward edit: $\text{NEW BALANCE} = \text{OLD BALANCE} + \Delta$
For an outward edit: $\text{NEW BALANCE} = \text{OLD BALANCE} - \Delta$
Every quantity edit implementation MUST be tested against this formula explicitly.

---

## 2. Product Identity & Normalization Rules
1. **Stable Product Master ID**: Transactions must store and link to `product_id` where available.
2. **Canonical Dimension Matching**:
   - Multiplier variations such as `25*8`, `25X8`, `25x8`, `25×8` share canonical identity when the underlying dimensions and product names are identical.
   - Distinct dimensions (e.g., `25*8` vs `25*10`) must **strictly remain distinct products**.
3. **Cross-View Agreement**: For every inventory mutation, verify that all four views agree:
   - Product Master
   - Balance Report
   - Transaction History
   - High Value Goods (where applicable)

---

## 3. Mutation Testing Requirements
Every data mutation must be explicitly validated across its complete lifecycle:
- **CREATE**: New record inserted, balance updated immediately, cache refreshed.
- **EDIT**: Delta applied, balance updated correctly, old movement reversed.
- **DELETE / VOID**: Transaction voided, balance reversed, audit trail preserved.
- **REFRESH**: In-memory and frontend caches reload consistent data from DB.
- **RELOAD**: Hard browser refresh renders exact identical state from persistent store.
