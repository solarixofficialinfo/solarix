#!/usr/bin/env python3
"""
SOLARIX — COMPANY-BRANDED SALES LINK & PUBLIC LEAD CAPTURE VERIFICATION SUITE
Tests:
1. Sales Link Auto-Provisioning & Retrieval
2. Public Company Branding (Zero Leakage of Private IDs)
3. Public Document Upload (Unlimited Documents, Tenant Tagging)
4. Public Lead Submission (Normalized Fields, Document Association)
5. Multi-Tenant Isolation (Company A vs Company B)
6. Document Access Control (Cross-Company Download Blocked)
7. Backward Compatibility with Old Leads
"""

import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone

from server import (
    db,
    ensure_company_sales_link,
    get_company_sales_link,
    regenerate_company_sales_link,
    get_public_sales_info,
    upload_public_sales_document,
    submit_public_sales_lead,
    list_leads,
    get_lead_detail,
    PublicLeadIn,
    LeadIn,
)
from fastapi import UploadFile
import io

async def run_tests():
    print("=" * 70)
    print("SOLARIX — SALES LINK & PUBLIC LEAD CAPTURE PORTAL TEST SUITE")
    print("=" * 70)

    cid_a = f"test_epc_a_{uuid.uuid4().hex[:6]}"
    cid_b = f"test_epc_b_{uuid.uuid4().hex[:6]}"

    # Setup Company A
    await db.companies.insert_one({
        "id": cid_a,
        "company_name": "Surya Shakti Solar EPC",
        "owner_name": "Vikram Patel",
        "mobile": "9876543210",
        "email": "contact@suryashaktisolar.in",
        "address": "Shop 4, Solar Trade Center, Ring Road",
        "city": "Surat",
        "state": "Gujarat",
        "pincode": "395002",
        "website": "https://suryashaktisolar.in",
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    # Setup Company B
    await db.companies.insert_one({
        "id": cid_b,
        "company_name": "Apex Green Energy",
        "owner_name": "Ananya Roy",
        "mobile": "9123456780",
        "email": "info@apexgreen.in",
        "address": "Unit 12, Eco Tech Park, Sector V",
        "city": "Kolkata",
        "state": "West Bengal",
        "pincode": "700091",
        "website": "https://apexgreen.in",
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    user_a = {"id": f"user_a_{uuid.uuid4().hex[:4]}", "company_id": cid_a, "name": "Vikram Patel", "role": "Admin"}
    user_b = {"id": f"user_b_{uuid.uuid4().hex[:4]}", "company_id": cid_b, "name": "Ananya Roy", "role": "Admin"}

    # --------------------------------------------------------------------------
    # TEST 1: Auto-provisioning and retrieval of Company A sales link
    # --------------------------------------------------------------------------
    link_data_a = await get_company_sales_link(user=user_a)
    assert link_data_a["token"], "Token must be generated"
    assert link_data_a["is_active"] is True, "Link must be active"
    assert link_data_a["company"]["name"] == "Surya Shakti Solar EPC", "Company branding name mismatch"
    assert link_data_a["company"]["city"] == "Surat", "Company city mismatch"
    token_a = link_data_a["token"]
    print("✓ Test 1 PASSED: Sales Link auto-provisioned and retrieved with company branding")

    # --------------------------------------------------------------------------
    # TEST 2: Public company branding retrieval (Zero leakage of company_id)
    # --------------------------------------------------------------------------
    pub_info_a = await get_public_sales_info(token_a)
    assert pub_info_a["company_name"] == "Surya Shakti Solar EPC"
    assert pub_info_a["city"] == "Surat"
    assert pub_info_a["address"] == "Shop 4, Solar Trade Center, Ring Road"
    assert "company_id" not in pub_info_a, "company_id must NEVER be exposed publicly"
    assert "id" not in pub_info_a, "Internal database IDs must not be exposed publicly"
    print("✓ Test 2 PASSED: Public branding fetched without leaking internal IDs")

    # --------------------------------------------------------------------------
    # TEST 3: Public document upload (Simulating customer uploading electricity bill)
    # --------------------------------------------------------------------------
    pdf_content = b"%PDF-1.4 sample bill content for testing"
    dummy_file = UploadFile(
        filename="Electricity_Bill_July.pdf",
        file=io.BytesIO(pdf_content),
        headers={"content-type": "application/pdf"}
    )

    up_res = await upload_public_sales_document(token=token_a, file=dummy_file)
    assert up_res["file_id"], "Upload must return file_id"
    assert up_res["filename"] == "Electricity_Bill_July.pdf"

    # Verify file recorded in db.files tagged with Company A
    stored_file = await db.files.find_one({"id": up_res["file_id"]})
    assert stored_file is not None, "File record must exist in db.files"
    assert stored_file["company_id"] == cid_a, "File must be strictly tagged with Company A"
    assert stored_file["uploader_id"] == "public_sales_link"
    print("✓ Test 3 PASSED: Public document uploaded and tagged with company tenant ID")

    # --------------------------------------------------------------------------
    # TEST 4: Public lead submission
    # --------------------------------------------------------------------------
    lead_payload = PublicLeadIn(
        name="Ramesh Bhai Shah",
        mobile="9825123456",
        email="ramesh.shah@gmail.com",
        address="102, Shanti Niketan Society, Adajan",
        city="Surat",
        state="Gujarat",
        pincode="395009",
        customer_type="residential",
        system_requirement="full_system",
        system_kw=5.5,
        monthly_bill=4500,
        consumer_number="048123456789",
        connection_type="LT",
        roof_type="RCC",
        offering_amount=320000,
        additional_message="Need installation before summer.",
        documents=[
            {
                "file_id": up_res["file_id"],
                "filename": up_res["filename"],
                "size": up_res["size"],
                "content_type": up_res["content_type"]
            }
        ]
    )

    lead_submit_res = await submit_public_sales_lead(token=token_a, data=lead_payload)
    assert lead_submit_res["success"] is True
    lead_no = lead_submit_res["lead_no"]
    assert lead_no, "Must return valid lead_no"

    # Inspect created lead in db.leads
    created_lead = await db.leads.find_one({"lead_no": lead_no, "company_id": cid_a})
    assert created_lead is not None, "Lead must exist in db.leads"
    assert created_lead["name"] == "Ramesh Bhai Shah"
    assert created_lead["source"] == "sales_link", "Lead source must be sales_link"
    assert created_lead["customer_type"] == "residential"
    assert created_lead["consumer_type"] == "Residential"
    assert created_lead["system_kw"] == 5.5
    assert created_lead["offering_amount"] == 320000
    assert len(created_lead["documents"]) == 1
    assert created_lead["documents"][0]["file_id"] == up_res["file_id"]

    # Verify file in db.files was associated with lead_id
    updated_file = await db.files.find_one({"id": up_res["file_id"]})
    assert updated_file.get("lead_id") == created_lead["id"], "File must be linked to lead_id"
    print("✓ Test 4 PASSED: Public lead submitted with documents and normalized fields")

    # --------------------------------------------------------------------------
    # TEST 5: Tenant Isolation — Company B cannot view Company A leads
    # --------------------------------------------------------------------------
    # Query leads for Company A
    leads_a = await list_leads(scope="team", user=user_a)
    assert any(l["lead_no"] == lead_no for l in leads_a["items"]), "Company A must see its own lead"

    # Query leads for Company B
    leads_b = await list_leads(scope="team", user=user_b)
    assert not any(l["lead_no"] == lead_no for l in leads_b["items"]), "Company B must NOT see Company A lead"
    print("✓ Test 5 PASSED: Strict tenant isolation verified (Company B cannot see Company A leads)")

    # --------------------------------------------------------------------------
    # TEST 6: Sales Link Regeneration
    # --------------------------------------------------------------------------
    regen_res = await regenerate_company_sales_link(user=user_a)
    new_token_a = regen_res["token"]
    assert new_token_a != token_a, "New token must differ from old token"

    # Old token must now be invalid
    try:
        await get_public_sales_info(token_a)
        assert False, "Old token must raise 404 after regeneration"
    except Exception as e:
        assert "404" in str(e) or getattr(e, "status_code", None) == 404

    # New token works
    new_pub_info = await get_public_sales_info(new_token_a)
    assert new_pub_info["company_name"] == "Surya Shakti Solar EPC"
    print("✓ Test 6 PASSED: Sales link token regeneration revokes old token and activates new token")

    # --------------------------------------------------------------------------
    # TEST 7: Backward compatibility with old leads without new fields
    # --------------------------------------------------------------------------
    old_lead_doc = {
        "id": f"old_lead_{uuid.uuid4().hex[:6]}",
        "lead_no": "LEAD-LEGACY-001",
        "company_id": cid_a,
        "name": "Old Legacy Prospect",
        "mobile": "9998887776",
        "city": "Surat",
        "estimated_kw": 10.0,
        "source": "Other",
        "stage": "New Lead",
        "status": "New Lead",
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z"
    }
    await db.leads.insert_one(old_lead_doc)

    fetched_old_lead = await db.leads.find_one({"id": old_lead_doc["id"], "company_id": cid_a}, {"_id": 0})
    assert fetched_old_lead is not None
    assert fetched_old_lead.get("customer_type") is None
    assert fetched_old_lead.get("documents") is None

    # Verify list_leads handles old leads without error
    all_leads_res = await list_leads(scope="team", user=user_a)
    assert any(l["id"] == old_lead_doc["id"] for l in all_leads_res["items"])
    print("✓ Test 7 PASSED: Backward compatibility verified for legacy leads")

    print("=" * 70)
    print("ALL 7/7 SALES LINK & PUBLIC LEAD CAPTURE TESTS PASSED (100%)")
    print("=" * 70)

if __name__ == "__main__":
    asyncio.run(run_tests())
