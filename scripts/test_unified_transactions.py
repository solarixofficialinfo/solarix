import asyncio
import os
import sys

# Ensure backend directory is in python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from server import (
    db,
    save_inward_entry_logic,
    save_outward_entry_logic,
    update_outward,
    update_inward,
    delete_outward,
    delete_inward,
    _compute_inventory_balances,
    get_b2b_client_history,
    get_supplier_history,
    get_b2b_sales,
    inv_history,
    InwardIn,
    OutwardIn,
    now_iso
)

async def run_tests():
    print("=" * 70)
    print("SOLARIX — UNIFIED TRANSACTION ENTRY INTEGRATION & CONSISTENCY TEST")
    print("=" * 70)

    company_id = "test_comp_unified_tx"
    user_id = "user_test_admin"
    user_name = "Unified Test User"

    # Clean up test company data
    await db.products.delete_many({"company_id": company_id})
    await db.inward_entries.delete_many({"company_id": company_id})
    await db.outward_entries.delete_many({"company_id": company_id})
    await db.b2b_customers.delete_many({"company_id": company_id})
    await db.vendors.delete_many({"company_id": company_id})
    await db.clients.delete_many({"company_id": company_id})

    # Setup Masters
    # 1. Product Master
    prod_id = "prod_unified_panel_540"
    prod_name = "TEST ADANI SOLAR 540W"
    prod_size = "540W MONO"
    await db.products.insert_one({
        "id": prod_id,
        "company_id": company_id,
        "name": prod_name,
        "size": prod_size,
        "unit": "Nos",
        "category": "Solar Panel",
        "status": "Active",
        "created_at": now_iso()
    })

    # Initial Opening Stock Inward of 100 Nos
    init_inw_payload = InwardIn(
        product=prod_name,
        product_id=prod_id,
        size=prod_size,
        quantity=100.0,
        unit="Nos",
        source_type="Internal / Warehouse",
        source_name="Opening Stock / Warehouse Intake",
        reference_number="INIT-100",
        date="2026-10-01",
        remarks="Opening Stock Balance"
    )
    await save_inward_entry_logic(init_inw_payload, company_id, user_id, user_name)

    # 2. Client Master (CRM Installation Client)
    client_id = "cli_sunil_patel"
    client_name = "SUNIL PATEL"
    await db.clients.insert_one({
        "id": client_id,
        "company_id": company_id,
        "full_name": client_name,
        "mobile": "9876543210",
        "status": "Active",
        "created_at": now_iso()
    })

    # 3. B2B Customer Master
    b2b_id = "b2b_tata_power_dist"
    b2b_name = "TATA POWER SOLAR DISTRIBUTOR"
    await db.b2b_customers.insert_one({
        "id": b2b_id,
        "company_id": company_id,
        "name": b2b_name,
        "full_name": b2b_name,
        "contact_person": "Vikram Seth",
        "mobile": "9822001122",
        "status": "Active",
        "created_at": now_iso()
    })

    # 4. Supplier Master
    supplier_id = "ven_adani_solar_hq"
    supplier_name = "ADANI SOLAR MANUFACTURING HQ"
    await db.vendors.insert_one({
        "id": supplier_id,
        "company_id": company_id,
        "name": supplier_name,
        "contact_person": "Rajesh Kumar",
        "phone": "9811223344",
        "status": "Active",
        "created_at": now_iso()
    })

    # Verify initial balance = 100
    balances, _, _, _ = await _compute_inventory_balances(company_id)
    p_bal = next(p for p in balances if p["id"] == prod_id)
    assert p_bal["balance"] == 100.0, f"Expected 100.0, got {p_bal['balance']}"
    print(f"[✓] Initial Product Stock: {p_bal['balance']} Nos (Expected: 100.0)")

    # -------------------------------------------------------------
    # STEP 1: B2B Sale (Outward: -10)
    # -------------------------------------------------------------
    b2b_sale_payload = OutwardIn(
        product=prod_name,
        product_id=prod_id,
        size=prod_size,
        quantity=10.0,
        unit="Nos",
        party_type="B2B Customer",
        client_id=b2b_id,
        client_name=b2b_name,
        outward_challan_no="B2B-CH-001",
        bill_number="B2B-CH-001",
        date="2026-10-07",
        remarks="B2B Sale Outward Dispatch",
        status="Dispatched"
    )
    b2b_sale_doc = await save_outward_entry_logic(b2b_sale_payload, company_id, user_id, user_name)
    assert b2b_sale_doc["client_id"] == b2b_id
    assert b2b_sale_doc["party_type"] == "B2B Customer"

    balances, _, _, _ = await _compute_inventory_balances(company_id)
    p_bal = next(p for p in balances if p["id"] == prod_id)
    assert p_bal["balance"] == 90.0, f"Expected 90.0, got {p_bal['balance']}"
    print(f"[✓] After B2B Sale (-10): Stock = {p_bal['balance']} (Expected: 90.0)")

    # -------------------------------------------------------------
    # STEP 2: B2B Return (Inward: +3)
    # -------------------------------------------------------------
    b2b_ret_payload = InwardIn(
        product=prod_name,
        product_id=prod_id,
        size=prod_size,
        quantity=3.0,
        unit="Nos",
        source_type="B2B Return",
        source_name=b2b_name,
        source_id=b2b_id,
        client_id=b2b_id,
        client_name=b2b_name,
        reference_number="B2B-RET-001",
        bill_number="B2B-RET-001",
        date="2026-10-07",
        remarks="Damaged box return from B2B customer"
    )
    b2b_ret_doc = await save_inward_entry_logic(b2b_ret_payload, company_id, user_id, user_name)
    assert b2b_ret_doc["client_id"] == b2b_id
    assert b2b_ret_doc["source_type"] == "B2B Return"

    balances, _, _, _ = await _compute_inventory_balances(company_id)
    p_bal = next(p for p in balances if p["id"] == prod_id)
    assert p_bal["balance"] == 93.0, f"Expected 93.0, got {p_bal['balance']}"
    print(f"[✓] After B2B Return (+3): Stock = {p_bal['balance']} (Expected: 93.0)")

    # -------------------------------------------------------------
    # STEP 3: Supplier Supply / Inward (Inward: +20)
    # -------------------------------------------------------------
    sup_inw_payload = InwardIn(
        product=prod_name,
        product_id=prod_id,
        size=prod_size,
        quantity=20.0,
        unit="Nos",
        source_type="Supplier",
        source_name=supplier_name,
        source_id=supplier_id,
        vendor_id=supplier_id,
        reference_number="SUP-BILL-5544",
        bill_number="SUP-BILL-5544",
        date="2026-10-07",
        remarks="New stock supply from manufacturer"
    )
    sup_inw_doc = await save_inward_entry_logic(sup_inw_payload, company_id, user_id, user_name)
    assert sup_inw_doc["vendor_id"] == supplier_id
    assert sup_inw_doc["source_type"] == "Supplier"

    balances, _, _, _ = await _compute_inventory_balances(company_id)
    p_bal = next(p for p in balances if p["id"] == prod_id)
    assert p_bal["balance"] == 113.0, f"Expected 113.0, got {p_bal['balance']}"
    print(f"[✓] After Supplier Supply (+20): Stock = {p_bal['balance']} (Expected: 113.0)")

    # -------------------------------------------------------------
    # STEP 4: Supplier Return (Outward: -5)
    # -------------------------------------------------------------
    sup_ret_payload = OutwardIn(
        product=prod_name,
        product_id=prod_id,
        size=prod_size,
        quantity=5.0,
        unit="Nos",
        party_type="Supplier Return",
        vendor_id=supplier_id,
        client_name=supplier_name,
        outward_challan_no="SUP-RET-009",
        bill_number="SUP-RET-009",
        date="2026-10-07",
        remarks="Supplier Return: Defective batch returned to manufacturer",
        status="Dispatched"
    )
    sup_ret_doc = await save_outward_entry_logic(sup_ret_payload, company_id, user_id, user_name)
    assert sup_ret_doc["vendor_id"] == supplier_id
    assert sup_ret_doc["party_type"] == "Supplier Return"

    balances, _, _, _ = await _compute_inventory_balances(company_id)
    p_bal = next(p for p in balances if p["id"] == prod_id)
    assert p_bal["balance"] == 108.0, f"Expected 108.0, got {p_bal['balance']}"
    print(f"[✓] After Supplier Return (-5): Stock = {p_bal['balance']} (Expected: 108.0)")

    # -------------------------------------------------------------
    # STEP 5: Client Sale (Outward: -8)
    # -------------------------------------------------------------
    cli_sale_payload = OutwardIn(
        product=prod_name,
        product_id=prod_id,
        size=prod_size,
        quantity=8.0,
        unit="Nos",
        party_type="Client Sale",
        client_id=client_id,
        client_name=client_name,
        project_id=client_id,
        project_name=f"{client_name} - 5kW Rooftop",
        outward_challan_no="CLI-CH-1008",
        bill_number="CLI-CH-1008",
        date="2026-10-07",
        remarks="Material dispatch for residential solar installation",
        status="Dispatched"
    )
    cli_sale_doc = await save_outward_entry_logic(cli_sale_payload, company_id, user_id, user_name)
    assert cli_sale_doc["client_id"] == client_id
    assert cli_sale_doc["project_name"] == f"{client_name} - 5kW Rooftop"

    balances, _, _, _ = await _compute_inventory_balances(company_id)
    p_bal = next(p for p in balances if p["id"] == prod_id)
    assert p_bal["balance"] == 100.0, f"Expected 100.0, got {p_bal['balance']}"
    print(f"[✓] After Client Sale (-8): Stock = {p_bal['balance']} (Expected: 100.0)")

    # -------------------------------------------------------------
    # STEP 6: VERIFY B2B LEDGER
    # -------------------------------------------------------------
    user_context = {"company_id": company_id, "id": user_id, "name": user_name, "role": "admin"}
    b2b_ledger = await get_b2b_client_history(b2b_id, user=user_context)
    b2b_txs = b2b_ledger["transactions"]
    assert len(b2b_txs) == 2, f"Expected 2 B2B txs, got {len(b2b_txs)}"
    b2b_sale_tx = next(t for t in b2b_txs if t["type"] == "OUTWARD")
    b2b_ret_tx = next(t for t in b2b_txs if t["type"] == "INWARD_RETURN")
    assert b2b_sale_tx["quantity"] == 10.0
    assert b2b_ret_tx["quantity"] == 3.0
    print(f"[✓] B2B Ledger verified: 1 Sale (10.0 Nos) + 1 Return (3.0 Nos)")

    # -------------------------------------------------------------
    # STEP 7: VERIFY SUPPLIER LEDGER
    # -------------------------------------------------------------
    sup_ledger = await get_supplier_history(supplier_id, user=user_context)
    sup_txs = sup_ledger["transactions"]
    assert len(sup_txs) == 2, f"Expected 2 Supplier txs, got {len(sup_txs)}"
    sup_inw_tx = next(t for t in sup_txs if t["type"] == "INWARD")
    sup_ret_tx = next(t for t in sup_txs if t["type"] == "OUTWARD_RETURN")
    assert sup_inw_tx["quantity"] == 20.0
    assert sup_ret_tx["quantity"] == 5.0
    print(f"[✓] Supplier Ledger verified: 1 Supply (20.0 Nos) + 1 Return (5.0 Nos)")

    # -------------------------------------------------------------
    # STEP 8: VERIFY HISTORY RETRIEVAL WITH SPECIFIC TRANSACTION TYPES
    # -------------------------------------------------------------
    hist_res = await inv_history(
        user=user_context,
        product=prod_name
    )
    hist_rows = hist_res["rows"]
    assert len(hist_rows) == 6, f"Expected 6 history rows, got {len(hist_rows)}"
    
    # Check party_type and source_type on all rows
    found_types = set()
    for r in hist_rows:
        if r["type"] == "Inward":
            found_types.add(r.get("source_type"))
        else:
            found_types.add(r.get("party_type"))
    
    assert "B2B Customer" in found_types or "B2B Sale" in found_types
    assert "B2B Return" in found_types
    assert "Supplier" in found_types
    assert "Supplier Return" in found_types
    assert "Client Sale" in found_types
    print(f"[✓] History verified: All 5 transaction types present ({found_types})")

    # -------------------------------------------------------------
    # STEP 10: EDIT B2B SALE (Update Qty 10 -> 12, Stock 100 -> 98)
    # -------------------------------------------------------------
    user_admin = {"company_id": company_id, "id": user_id, "name": user_name, "role": "Admin", "user_type": "owner"}
    b2b_sale_edit_payload = OutwardIn(
        product=prod_name,
        product_id=prod_id,
        size=prod_size,
        quantity=12.0,
        unit="Nos",
        party_type="B2B Sale",
        client_id=b2b_id,
        client_name=b2b_name,
        outward_challan_no="B2B-CH-001-REV",
        bill_number="B2B-CH-001-REV",
        date="2026-10-07",
        remarks="B2B Sale Outward Dispatch - Edited Qty",
        status="Dispatched"
    )
    await update_outward(b2b_sale_doc["id"], b2b_sale_edit_payload, user=user_admin)
    balances, _, _, _ = await _compute_inventory_balances(company_id)
    p_bal = next(p for p in balances if p["id"] == prod_id)
    assert p_bal["balance"] == 98.0, f"Expected 98.0 after editing B2B Sale, got {p_bal['balance']}"
    
    b2b_ledger = await get_b2b_client_history(b2b_id, user=user_context)
    b2b_sale_tx = next(t for t in b2b_ledger["transactions"] if t["type"] == "OUTWARD")
    assert b2b_sale_tx["quantity"] == 12.0
    print(f"[✓] Step 10: B2B Sale Edited (10 -> 12 Nos): Stock = {p_bal['balance']} (Expected: 98.0), B2B Ledger Qty = 12.0")

    # -------------------------------------------------------------
    # STEP 11: EDIT SUPPLIER SUPPLY (Update Qty 20 -> 22, Stock 98 -> 100)
    # -------------------------------------------------------------
    sup_inw_edit_payload = InwardIn(
        product=prod_name,
        product_id=prod_id,
        size=prod_size,
        quantity=22.0,
        unit="Nos",
        source_type="Supplier",
        source_name=supplier_name,
        source_id=supplier_id,
        vendor_id=supplier_id,
        reference_number="SUP-BILL-5544-REV",
        bill_number="SUP-BILL-5544-REV",
        date="2026-10-07",
        remarks="New stock supply from manufacturer - Edited Qty"
    )
    await update_inward(sup_inw_doc["id"], sup_inw_edit_payload, user=user_admin)
    balances, _, _, _ = await _compute_inventory_balances(company_id)
    p_bal = next(p for p in balances if p["id"] == prod_id)
    assert p_bal["balance"] == 100.0, f"Expected 100.0 after editing Supplier Supply, got {p_bal['balance']}"
    
    sup_ledger = await get_supplier_history(supplier_id, user=user_context)
    sup_inw_tx = next(t for t in sup_ledger["transactions"] if t["type"] == "INWARD")
    assert sup_inw_tx["quantity"] == 22.0
    print(f"[✓] Step 11: Supplier Supply Edited (20 -> 22 Nos): Stock = {p_bal['balance']} (Expected: 100.0), Supplier Ledger Qty = 22.0")

    # -------------------------------------------------------------
    # STEP 12: DELETE SUPPLIER RETURN (-5 Nos reverted -> Stock 100 -> 105)
    # -------------------------------------------------------------
    await delete_outward(sup_ret_doc["id"], user=user_admin)
    balances, _, _, _ = await _compute_inventory_balances(company_id)
    p_bal = next(p for p in balances if p["id"] == prod_id)
    assert p_bal["balance"] == 105.0, f"Expected 105.0 after deleting Supplier Return, got {p_bal['balance']}"
    
    sup_ledger = await get_supplier_history(supplier_id, user=user_context)
    assert len(sup_ledger["transactions"]) == 1, f"Expected 1 Supplier tx after deletion, got {len(sup_ledger['transactions'])}"
    print(f"[✓] Step 12: Supplier Return Deleted: Stock = {p_bal['balance']} (Expected: 105.0), Supplier Ledger entries = 1")

    # -------------------------------------------------------------
    # STEP 13: DELETE B2B RETURN (+3 Nos reverted -> Stock 105 -> 102)
    # -------------------------------------------------------------
    await delete_inward(b2b_ret_doc["id"], user=user_admin)
    balances, _, _, _ = await _compute_inventory_balances(company_id)
    p_bal = next(p for p in balances if p["id"] == prod_id)
    assert p_bal["balance"] == 102.0, f"Expected 102.0 after deleting B2B Return, got {p_bal['balance']}"
    
    b2b_ledger = await get_b2b_client_history(b2b_id, user=user_context)
    assert len(b2b_ledger["transactions"]) == 1, f"Expected 1 B2B tx after deletion, got {len(b2b_ledger['transactions'])}"
    print(f"[✓] Step 13: B2B Return Deleted: Stock = {p_bal['balance']} (Expected: 102.0), B2B Ledger entries = 1")

    # -------------------------------------------------------------
    # STEP 14: DATA CONSISTENCY RECONCILIATION SUMMARY
    # -------------------------------------------------------------
    print("\n" + "=" * 70)
    print("FINAL RECONCILIATION RESULT AFTER EDITS & DELETIONS:")
    print("  Initial Opening Stock : 100.0 Nos")
    print("  - B2B Sale (Edited)   : -12.0 Nos")
    print("  + Supplier Supply (Ed): +22.0 Nos")
    print("  - Client Sale         :  -8.0 Nos")
    print(f"  Authoritative Balance : {p_bal['balance']} Nos (100.0% RECONCILED)")
    print("=" * 70)

    # Clean up test data
    await db.products.delete_many({"company_id": company_id})
    await db.inward_entries.delete_many({"company_id": company_id})
    await db.outward_entries.delete_many({"company_id": company_id})
    await db.b2b_customers.delete_many({"company_id": company_id})
    await db.vendors.delete_many({"company_id": company_id})
    await db.clients.delete_many({"company_id": company_id})

    print("ALL TESTS COMPLETED SUCCESSFULLY WITH ZERO ERRORS!")

if __name__ == "__main__":
    asyncio.run(run_tests())
