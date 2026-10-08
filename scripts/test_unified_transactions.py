import asyncio
import os
import sys
from fastapi import HTTPException

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
    get_eligible_returns,
    InwardIn,
    OutwardIn,
    now_iso
)

async def run_tests():
    print("=" * 80)
    print("SOLARIX — UNIFIED TRANSACTION ENTRY INTEGRATION & OVER-RETURN CEILING TEST")
    print("=" * 80)

    company_id = "test_comp_unified_tx"
    user_id = "user_test_admin"
    user_name = "Unified Test User"
    user_context = {"company_id": company_id, "id": user_id, "name": user_name, "role": "admin"}
    user_admin = {"company_id": company_id, "id": user_id, "name": user_name, "role": "Admin", "user_type": "owner"}

    # Clean up test company data
    await db.products.delete_many({"company_id": company_id})
    await db.inward_entries.delete_many({"company_id": company_id})
    await db.outward_entries.delete_many({"company_id": company_id})
    await db.b2b_customers.delete_many({"company_id": company_id})
    await db.vendors.delete_many({"company_id": company_id})
    await db.clients.delete_many({"company_id": company_id})

    # Setup Masters
    # 1. Product Master (Starting stock 0)
    prod_id = "prod_unified_panel_540"
    prod_name = "WAAREE 540W MONO SOLAR PANEL"
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

    # Initial check: Starting stock = 0
    balances, _, _, _ = await _compute_inventory_balances(company_id)
    p_bal = next(p for p in balances if p["id"] == prod_id)
    assert p_bal["balance"] == 0.0, f"Expected 0.0, got {p_bal['balance']}"
    print(f"[✓] Initial Starting Stock: {p_bal['balance']} Nos (Expected: 0.0)")

    # -------------------------------------------------------------------------
    # STEP 1: Supplier Supply 100 -> Stock 100
    # -------------------------------------------------------------------------
    sup_inw_payload = InwardIn(
        product=prod_name,
        product_id=prod_id,
        size=prod_size,
        quantity=100.0,
        unit="Nos",
        source_type="Supplier Supply",
        source_name=supplier_name,
        source_id=supplier_id,
        vendor_id=supplier_id,
        reference_number="SUP-BILL-100",
        bill_number="SUP-BILL-100",
        date="2026-10-01",
        remarks="Bulk shipment from supplier"
    )
    sup_inw_doc = await save_inward_entry_logic(sup_inw_payload, company_id, user_id, user_name)
    assert sup_inw_doc["vendor_id"] == supplier_id

    balances, _, _, _ = await _compute_inventory_balances(company_id)
    p_bal = next(p for p in balances if p["id"] == prod_id)
    assert p_bal["balance"] == 100.0, f"Expected 100.0, got {p_bal['balance']}"
    print(f"[✓] Step 1: Supplier Supply 100 -> Stock = {p_bal['balance']} (Expected: 100.0)")

    # -------------------------------------------------------------------------
    # STEP 2: B2B Sale 40 -> Stock 60
    # -------------------------------------------------------------------------
    b2b_sale_payload = OutwardIn(
        product=prod_name,
        product_id=prod_id,
        size=prod_size,
        quantity=40.0,
        unit="Nos",
        party_type="B2B Customer",
        client_id=b2b_id,
        client_name=b2b_name,
        outward_challan_no="B2B-CH-040",
        bill_number="B2B-CH-040",
        date="2026-10-02",
        remarks="B2B Sale Outward Dispatch",
        status="Dispatched"
    )
    b2b_sale_doc = await save_outward_entry_logic(b2b_sale_payload, company_id, user_id, user_name)
    assert b2b_sale_doc["client_id"] == b2b_id

    balances, _, _, _ = await _compute_inventory_balances(company_id)
    p_bal = next(p for p in balances if p["id"] == prod_id)
    assert p_bal["balance"] == 60.0, f"Expected 60.0, got {p_bal['balance']}"
    print(f"[✓] Step 2: B2B Sale 40 -> Stock = {p_bal['balance']} (Expected: 60.0)")

    # Check eligible returns for B2B Customer: should show 40 available
    el_b2b = await get_eligible_returns(return_type="b2b_return", entity_id=b2b_id, user=user_context)
    assert len(el_b2b["transactions"]) == 1
    assert el_b2b["transactions"][0]["available_quantity"] == 40.0
    print(f"[✓] Step 2b: Eligible B2B Returns: Available = {el_b2b['transactions'][0]['available_quantity']} (Expected: 40.0)")

    # -------------------------------------------------------------------------
    # STEP 3: B2B Return 10 -> Stock 70 (eligible remaining = 30; return 31 blocked)
    # -------------------------------------------------------------------------
    # First: Attempt Over-Return of 31 against B2B Sale (which only had 40, but let's test return 41 or after 10 return 31)
    over_b2b_payload = InwardIn(
        product=prod_name,
        product_id=prod_id,
        size=prod_size,
        quantity=41.0,  # Exceeds 40
        unit="Nos",
        source_type="B2B Return",
        source_name=b2b_name,
        source_id=b2b_id,
        client_id=b2b_id,
        client_name=b2b_name,
        original_entry_id=b2b_sale_doc["id"],
        original_challan_no=b2b_sale_doc["outward_challan_no"],
        reference_number="B2B-RET-OVER",
        date="2026-10-03",
        remarks="Attempted over-return"
    )
    over_blocked = False
    try:
        await save_inward_entry_logic(over_b2b_payload, company_id, user_id, user_name)
    except HTTPException as e:
        over_blocked = True
        assert e.status_code == 400
        print(f"[✓] Step 3a: Over-return 41 > 40 correctly blocked with 400: '{e.detail}'")
    assert over_blocked, "Over-return of 41 should have been rejected!"

    # Valid B2B Return: 10 Nos
    b2b_ret_payload = InwardIn(
        product=prod_name,
        product_id=prod_id,
        size=prod_size,
        quantity=10.0,
        unit="Nos",
        source_type="B2B Return",
        source_name=b2b_name,
        source_id=b2b_id,
        client_id=b2b_id,
        client_name=b2b_name,
        original_entry_id=b2b_sale_doc["id"],
        original_challan_no=b2b_sale_doc["outward_challan_no"],
        reference_number="B2B-RET-010",
        bill_number="B2B-RET-010",
        date="2026-10-03",
        remarks="Partial box return from B2B customer"
    )
    b2b_ret_doc = await save_inward_entry_logic(b2b_ret_payload, company_id, user_id, user_name)
    assert b2b_ret_doc["original_entry_id"] == b2b_sale_doc["id"]

    balances, _, _, _ = await _compute_inventory_balances(company_id)
    p_bal = next(p for p in balances if p["id"] == prod_id)
    assert p_bal["balance"] == 70.0, f"Expected 70.0, got {p_bal['balance']}"
    print(f"[✓] Step 3: B2B Return 10 -> Stock = {p_bal['balance']} (Expected: 70.0)")

    # Test remaining ceiling: eligible remaining is 30, returning 31 must be blocked!
    over_b2b_payload_2 = InwardIn(
        product=prod_name,
        product_id=prod_id,
        size=prod_size,
        quantity=31.0,  # 10 already returned, only 30 remaining
        unit="Nos",
        source_type="B2B Return",
        source_name=b2b_name,
        source_id=b2b_id,
        client_id=b2b_id,
        client_name=b2b_name,
        original_entry_id=b2b_sale_doc["id"],
        original_challan_no=b2b_sale_doc["outward_challan_no"],
        reference_number="B2B-RET-OVER2",
        date="2026-10-03",
        remarks="Attempted over-return 31 when 30 remain"
    )
    over_blocked_2 = False
    try:
        await save_inward_entry_logic(over_b2b_payload_2, company_id, user_id, user_name)
    except HTTPException as e:
        over_blocked_2 = True
        assert e.status_code == 400
        print(f"[✓] Step 3b: Over-return 31 > 30 remaining correctly blocked with 400: '{e.detail}'")
    assert over_blocked_2, "Over-return of 31 should have been rejected!"

    # -------------------------------------------------------------------------
    # STEP 4: Supplier Return 20 -> Stock 50 (eligible remaining = 80; return 81 blocked)
    # -------------------------------------------------------------------------
    # Test over-return attempt: Return 101 > 100 original supply
    over_sup_payload = OutwardIn(
        product=prod_name,
        product_id=prod_id,
        size=prod_size,
        quantity=101.0,
        unit="Nos",
        party_type="Return to Supplier",
        vendor_id=supplier_id,
        client_name=supplier_name,
        original_entry_id=sup_inw_doc["id"],
        original_challan_no=sup_inw_doc["reference_number"],
        outward_challan_no="SUP-RET-OVER",
        date="2026-10-04",
        remarks="Return to Supplier: Over-return test",
        status="Dispatched"
    )
    sup_over_blocked = False
    try:
        await save_outward_entry_logic(over_sup_payload, company_id, user_id, user_name)
    except HTTPException as e:
        sup_over_blocked = True
        assert e.status_code == 400
        print(f"[✓] Step 4a: Supplier Return 101 > 100 correctly blocked with 400: '{e.detail}'")
    assert sup_over_blocked, "Supplier return of 101 should have been rejected!"

    # Valid Supplier Return: 20 Nos
    sup_ret_payload = OutwardIn(
        product=prod_name,
        product_id=prod_id,
        size=prod_size,
        quantity=20.0,
        unit="Nos",
        party_type="Return to Supplier",
        vendor_id=supplier_id,
        client_name=supplier_name,
        original_entry_id=sup_inw_doc["id"],
        original_challan_no=sup_inw_doc["reference_number"],
        outward_challan_no="SUP-RET-020",
        bill_number="SUP-RET-020",
        date="2026-10-04",
        remarks="Return to Supplier: Defective batch returned",
        status="Dispatched"
    )
    sup_ret_doc = await save_outward_entry_logic(sup_ret_payload, company_id, user_id, user_name)
    assert sup_ret_doc["original_entry_id"] == sup_inw_doc["id"]

    balances, _, _, _ = await _compute_inventory_balances(company_id)
    p_bal = next(p for p in balances if p["id"] == prod_id)
    assert p_bal["balance"] == 50.0, f"Expected 50.0, got {p_bal['balance']}"
    print(f"[✓] Step 4: Supplier Return 20 -> Stock = {p_bal['balance']} (Expected: 50.0)")

    # Test remaining ceiling: 100 - 20 = 80 eligible remaining; return 81 must be blocked!
    over_sup_payload_2 = OutwardIn(
        product=prod_name,
        product_id=prod_id,
        size=prod_size,
        quantity=81.0,
        unit="Nos",
        party_type="Return to Supplier",
        vendor_id=supplier_id,
        client_name=supplier_name,
        original_entry_id=sup_inw_doc["id"],
        original_challan_no=sup_inw_doc["reference_number"],
        outward_challan_no="SUP-RET-OVER2",
        date="2026-10-04",
        remarks="Return to Supplier: Over-return 81 when 80 remain",
        status="Dispatched"
    )
    sup_over_blocked_2 = False
    try:
        await save_outward_entry_logic(over_sup_payload_2, company_id, user_id, user_name)
    except HTTPException as e:
        sup_over_blocked_2 = True
        assert e.status_code == 400
        print(f"[✓] Step 4b: Supplier Return 81 > 80 remaining correctly blocked with 400: '{e.detail}'")
    assert sup_over_blocked_2, "Supplier return of 81 should have been rejected!"

    # -------------------------------------------------------------------------
    # STEP 5: Client Outward 15 -> Stock 35
    # -------------------------------------------------------------------------
    cli_out_payload = OutwardIn(
        product=prod_name,
        product_id=prod_id,
        size=prod_size,
        quantity=15.0,
        unit="Nos",
        party_type="Client Sale",
        client_id=client_id,
        client_name=client_name,
        project_id=client_id,
        project_name=f"{client_name} - 5kW Rooftop",
        outward_challan_no="CLI-CH-015",
        bill_number="CLI-CH-015",
        date="2026-10-05",
        remarks="Material dispatch for residential solar installation",
        status="Dispatched"
    )
    cli_out_doc = await save_outward_entry_logic(cli_out_payload, company_id, user_id, user_name)
    assert cli_out_doc["client_id"] == client_id

    balances, _, _, _ = await _compute_inventory_balances(company_id)
    p_bal = next(p for p in balances if p["id"] == prod_id)
    assert p_bal["balance"] == 35.0, f"Expected 35.0, got {p_bal['balance']}"
    print(f"[✓] Step 5: Client Outward 15 -> Stock = {p_bal['balance']} (Expected: 35.0)")

    # Check eligible returns for client: should show 15 available
    el_cli = await get_eligible_returns(return_type="client_return", entity_id=client_id, user=user_context)
    assert len(el_cli["transactions"]) == 1
    assert el_cli["transactions"][0]["available_quantity"] == 15.0
    print(f"[✓] Step 5b: Eligible Client Returns: Available = {el_cli['transactions'][0]['available_quantity']} (Expected: 15.0)")

    # -------------------------------------------------------------------------
    # STEP 6: Client Return 5 -> Stock 40 (eligible remaining = 10; return 11 blocked)
    # -------------------------------------------------------------------------
    # Over-return attempt: Return 16 > 15 original outward
    over_cli_payload = InwardIn(
        product=prod_name,
        product_id=prod_id,
        size=prod_size,
        quantity=16.0,
        unit="Nos",
        source_type="Client Return",
        source_name=client_name,
        client_id=client_id,
        client_name=client_name,
        original_entry_id=cli_out_doc["id"],
        original_challan_no=cli_out_doc["outward_challan_no"],
        reference_number="CLI-RET-OVER",
        date="2026-10-06",
        remarks="Client Return: Over-return test"
    )
    cli_over_blocked = False
    try:
        await save_inward_entry_logic(over_cli_payload, company_id, user_id, user_name)
    except HTTPException as e:
        cli_over_blocked = True
        assert e.status_code == 400
        print(f"[✓] Step 6a: Client Return 16 > 15 correctly blocked with 400: '{e.detail}'")
    assert cli_over_blocked, "Client return of 16 should have been rejected!"

    # Valid Client Return: 5 Nos
    cli_ret_payload = InwardIn(
        product=prod_name,
        product_id=prod_id,
        size=prod_size,
        quantity=5.0,
        unit="Nos",
        source_type="Client Return",
        source_name=client_name,
        client_id=client_id,
        client_name=client_name,
        original_entry_id=cli_out_doc["id"],
        original_challan_no=cli_out_doc["outward_challan_no"],
        reference_number="CLI-RET-005",
        bill_number="CLI-RET-005",
        date="2026-10-06",
        remarks="Excess panels returned from rooftop site"
    )
    cli_ret_doc = await save_inward_entry_logic(cli_ret_payload, company_id, user_id, user_name)
    assert cli_ret_doc["original_entry_id"] == cli_out_doc["id"]

    balances, _, _, _ = await _compute_inventory_balances(company_id)
    p_bal = next(p for p in balances if p["id"] == prod_id)
    assert p_bal["balance"] == 40.0, f"Expected 40.0, got {p_bal['balance']}"
    print(f"[✓] Step 6: Client Return 5 -> Stock = {p_bal['balance']} (Expected: 40.0)")

    # Test remaining ceiling: 15 - 5 = 10 eligible remaining; return 11 must be blocked!
    over_cli_payload_2 = InwardIn(
        product=prod_name,
        product_id=prod_id,
        size=prod_size,
        quantity=11.0,
        unit="Nos",
        source_type="Client Return",
        source_name=client_name,
        client_id=client_id,
        client_name=client_name,
        original_entry_id=cli_out_doc["id"],
        original_challan_no=cli_out_doc["outward_challan_no"],
        reference_number="CLI-RET-OVER2",
        date="2026-10-06",
        remarks="Client Return: Over-return 11 when 10 remain"
    )
    cli_over_blocked_2 = False
    try:
        await save_inward_entry_logic(over_cli_payload_2, company_id, user_id, user_name)
    except HTTPException as e:
        cli_over_blocked_2 = True
        assert e.status_code == 400
        print(f"[✓] Step 6b: Client Return 11 > 10 remaining correctly blocked with 400: '{e.detail}'")
    assert cli_over_blocked_2, "Client return of 11 should have been rejected!"

    # -------------------------------------------------------------------------
    # STEP 7: RECONCILE FINAL STOCK ACROSS ALL LEDGERS & REPORTS
    # -------------------------------------------------------------------------
    print("\n" + "=" * 80)
    print("STEP 7: CROSS-MODULE RECONCILIATION AUDIT")
    print("=" * 80)

    # 1. Product Master & Balance Report
    balances, _, _, _ = await _compute_inventory_balances(company_id)
    p_bal = next(p for p in balances if p["id"] == prod_id)
    assert p_bal["balance"] == 40.0, f"Expected final balance 40.0, got {p_bal['balance']}"
    print(f"[✓] Product Balance Report: {p_bal['balance']} Nos (EXACT MATCH: 40.0)")

    # 2. Transaction History
    hist_res = await inv_history(user=user_context, product=prod_name)
    hist_rows = hist_res["rows"]
    assert len(hist_rows) == 6, f"Expected 6 transactions, got {len(hist_rows)}"
    
    # Calculate balance from history movements
    net_history = 0.0
    for r in hist_rows:
        q = float(r.get("quantity") or 0.0)
        if r["type"] == "Inward":
            net_history += q
        else:
            net_history -= q
    assert net_history == 40.0, f"Expected net history movement 40.0, got {net_history}"
    print(f"[✓] History Reconstruction: Net Inward - Outward = {net_history} Nos (EXACT MATCH: 40.0)")

    # 3. B2B Ledger
    b2b_ledger = await get_b2b_client_history(b2b_id, user=user_context)
    b2b_txs = b2b_ledger["transactions"]
    assert len(b2b_txs) == 2, f"Expected 2 B2B txs, got {len(b2b_txs)}"
    b2b_sale = next(t for t in b2b_txs if t["type"] == "OUTWARD")
    b2b_ret = next(t for t in b2b_txs if t["type"] == "INWARD_RETURN")
    assert b2b_sale["quantity"] == 40.0
    assert b2b_ret["quantity"] == 10.0
    print(f"[✓] B2B Customer Ledger: 1 Sale (40.0 Nos) - 1 Return (10.0 Nos) = Net Delivered 30.0 Nos")

    # 4. Supplier Ledger
    sup_ledger = await get_supplier_history(supplier_id, user=user_context)
    sup_txs = sup_ledger["transactions"]
    assert len(sup_txs) == 2, f"Expected 2 Supplier txs, got {len(sup_txs)}"
    sup_inw = next(t for t in sup_txs if t["type"] == "INWARD")
    sup_ret = next(t for t in sup_txs if t["type"] == "OUTWARD_RETURN")
    assert sup_inw["quantity"] == 100.0
    assert sup_ret["quantity"] == 20.0
    print(f"[✓] Supplier Ledger: 1 Supply (100.0 Nos) - 1 Return (20.0 Nos) = Net Received 80.0 Nos")

    # Final summary check
    print("\n" + "=" * 80)
    print("FINAL AUDIT VERIFICATION:")
    print("  Supplier Supply (+100) - B2B Sale (-40) + B2B Return (+10)")
    print("  - Supplier Return (-20) - Client Outward (-15) + Client Return (+5)")
    print("  = 100 - 40 + 10 - 20 - 15 + 5 = 40.0 Nos")
    print(f"  Final Authoritative Stock: {p_bal['balance']} Nos")
    print("=" * 80)

    # Clean up test data
    await db.products.delete_many({"company_id": company_id})
    await db.inward_entries.delete_many({"company_id": company_id})
    await db.outward_entries.delete_many({"company_id": company_id})
    await db.b2b_customers.delete_many({"company_id": company_id})
    await db.vendors.delete_many({"company_id": company_id})
    await db.clients.delete_many({"company_id": company_id})

    print("\n🎉 ALL TESTS PASSED SUCCESSFULLY WITH ZERO ERRORS!")

if __name__ == "__main__":
    asyncio.run(run_tests())
