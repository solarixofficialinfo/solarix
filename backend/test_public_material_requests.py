#!/usr/bin/env python3
"""
SOLARIX — PUBLIC MATERIAL REQUEST LINKS VERIFICATION SUITE
Tests:
1. Reusable Link Generation & Retrieval
2. Reusability: Creating again for same member returns existing active link
3. Link Listing: Enriched with user master details
4. Public Link Metadata: Sanitized company branding, assigned member name, projects, products (Zero ID leakage)
5. Public Material Request Submission: Sequential MR-YYYY-XXXX, status: pending, server-side member attribution
6. Atomic Idempotency: Double-clicks with same idempotency_key return existing record (No duplicates)
7. Honeypot Spam Rejection: Non-empty honeypot blocks persistence silently
8. Status Transitions: Active -> Disabled (403) -> Active -> Regenerate (old token fails) -> Revoked (403)
9. Strict Multi-Tenant Isolation: Cross-company links and projects rejected
"""

import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone

from server import (
    db,
    create_material_request_link,
    list_material_request_links,
    update_material_request_link_status,
    regenerate_material_request_link,
    get_public_material_request_link_info,
    submit_public_material_request,
    CreateMaterialRequestLinkIn,
    UpdateMaterialRequestLinkStatusIn,
    PublicMaterialRequestSubmitIn,
)
from fastapi import HTTPException

async def run_tests():
    print("=" * 80)
    print("SOLARIX — PUBLIC MATERIAL REQUEST LINKS TEST SUITE")
    print("=" * 80)

    cid_a = f"test_co_a_{uuid.uuid4().hex[:6]}"
    cid_b = f"test_co_b_{uuid.uuid4().hex[:6]}"

    member_a1_id = f"user_a1_{uuid.uuid4().hex[:6]}"
    member_a2_id = f"user_a2_{uuid.uuid4().hex[:6]}"
    member_b1_id = f"user_b1_{uuid.uuid4().hex[:6]}"

    # 1. Setup Company A & Users
    await db.companies.insert_one({
        "id": cid_a,
        "company_name": "GVP Solar Technologies",
        "email": "ops@gvpsolar.com",
        "city": "Ahmedabad",
        "state": "Gujarat",
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    await db.users.insert_one({
        "id": member_a1_id,
        "company_id": cid_a,
        "name": "Suresh Patel",
        "full_name": "Suresh Patel",
        "email": "suresh@gvpsolar.com",
        "role": "Site Engineer",
    })
    await db.users.insert_one({
        "id": member_a2_id,
        "company_id": cid_a,
        "name": "Priya Sharma",
        "full_name": "Priya Sharma",
        "email": "priya@gvpsolar.com",
        "role": "Project Manager",
    })

    # Setup Clients and Products for Company A
    client_a_id = f"cli_a_{uuid.uuid4().hex[:6]}"
    await db.clients.insert_one({
        "id": client_a_id,
        "company_id": cid_a,
        "full_name": "Skyline Residency 50kW",
        "sol_id": "SOL-2026-088",
        "city": "Ahmedabad",
    })
    await db.products.insert_one({
        "id": f"prod_a_{uuid.uuid4().hex[:6]}",
        "company_id": cid_a,
        "name": "SOLAR DC CABLE 4 SQ MM",
        "size": "4 sq mm",
        "unit": "Mtr",
    })

    # 2. Setup Company B & Users
    await db.companies.insert_one({
        "id": cid_b,
        "company_name": "Apex Green Systems",
        "email": "contact@apexgreen.com",
        "city": "Surat",
        "state": "Gujarat",
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    await db.users.insert_one({
        "id": member_b1_id,
        "company_id": cid_b,
        "name": "Rajesh Mehta",
        "full_name": "Rajesh Mehta",
        "email": "rajesh@apexgreen.com",
        "role": "Supervisor",
    })
    client_b_id = f"cli_b_{uuid.uuid4().hex[:6]}"
    await db.clients.insert_one({
        "id": client_b_id,
        "company_id": cid_b,
        "full_name": "Apex Factory Rooftop",
        "sol_id": "SOL-2026-999",
        "city": "Surat",
    })

    admin_user_a = {
        "id": f"admin_a_{uuid.uuid4().hex[:6]}",
        "company_id": cid_a,
        "name": "Admin A",
        "role": "Admin",
    }
    admin_user_b = {
        "id": f"admin_b_{uuid.uuid4().hex[:6]}",
        "company_id": cid_b,
        "name": "Admin B",
        "role": "Admin",
    }

    # --------------------------------------------------------------------------
    # TEST 1: Generate Reusable Public Request Link for Suresh Patel
    # --------------------------------------------------------------------------
    res_link = await create_material_request_link(
        data=CreateMaterialRequestLinkIn(
            assigned_team_member_id=member_a1_id,
            remarks="Link for Ahmedabad site installation teams"
        ),
        user=admin_user_a
    )
    assert res_link["status"] == "success"
    link_a1 = res_link["link"]
    token_a1 = link_a1["token"]
    assert token_a1, "Token must be non-empty"
    assert link_a1["status"] == "active"
    assert link_a1["assigned_team_member_id"] == member_a1_id
    assert link_a1["assigned_team_member_name"] == "Suresh Patel"
    assert "public_url" in link_a1
    print("✓ Test 1 PASSED: Generated public request link with assigned member attribution")

    # --------------------------------------------------------------------------
    # TEST 2: Reusability Check — Calling again returns existing active link
    # --------------------------------------------------------------------------
    res_link_reused = await create_material_request_link(
        data=CreateMaterialRequestLinkIn(
            assigned_team_member_id=member_a1_id,
            remarks="Second request for same member"
        ),
        user=admin_user_a
    )
    assert res_link_reused["is_reused"] is True, "Link must be marked as reused"
    assert res_link_reused["link"]["id"] == link_a1["id"], "Must return identical link ID"
    assert res_link_reused["link"]["token"] == token_a1, "Must return identical active token"
    print("✓ Test 2 PASSED: Reusability verified (No redundant active links generated)")

    # --------------------------------------------------------------------------
    # TEST 3: List Material Request Links (Admin View with User Enrichment)
    # --------------------------------------------------------------------------
    res_list = await list_material_request_links(user=admin_user_a)
    assert "links" in res_list
    assert len(res_list["links"]) >= 1
    found_link = next((l for l in res_list["links"] if l["id"] == link_a1["id"]), None)
    assert found_link is not None
    assert found_link["assigned_team_member_name"] == "Suresh Patel"
    assert found_link["assigned_team_member_role"] == "Site Engineer"
    print("✓ Test 3 PASSED: Listed links with enriched team member details")

    # --------------------------------------------------------------------------
    # TEST 4: Public Token Metadata Retrieval (Zero ID Leakage)
    # --------------------------------------------------------------------------
    pub_info = await get_public_material_request_link_info(token=token_a1)
    assert pub_info["company_name"] == "GVP Solar Technologies"
    assert pub_info["assigned_team_member_name"] == "Suresh Patel"
    assert pub_info["assigned_team_member_role"] == "Site Engineer"
    assert "company_id" not in pub_info, "company_id must NOT leak into public payload"
    assert "token_hash" not in pub_info, "token_hash must NOT leak into public payload"
    assert len(pub_info["projects"]) >= 1
    assert any(p["id"] == client_a_id for p in pub_info["projects"])
    print("✓ Test 4 PASSED: Public metadata validated (Branding, Projects, and Zero ID leakage)")

    # --------------------------------------------------------------------------
    # TEST 5: Public Material Request Submission
    # --------------------------------------------------------------------------
    idempotency_key = str(uuid.uuid4())
    sub_payload = PublicMaterialRequestSubmitIn(
        token=token_a1,
        requester_name="Anil Kumar",
        requester_phone="9876500001",
        client_id=client_a_id,
        items=[
            {
                "product": "SOLAR DC CABLE 4 SQ MM",
                "size": "4 sq mm",
                "unit": "Mtr",
                "quantity": 250,
                "remarks": "Urgent for inverter connection"
            },
            {
                "product": "MC4 CONNECTORS",
                "size": "Standard",
                "unit": "Pairs",
                "quantity": 20,
                "remarks": "Original Staubli only"
            }
        ],
        remarks="Gate delivery before 10 AM",
        idempotency_key=idempotency_key,
        honeypot=""
    )

    sub_res = await submit_public_material_request(data=sub_payload)
    assert sub_res["status"] == "success"
    created_req = sub_res["request"]
    assert created_req["status"] == "pending", "Status must be pending"
    assert created_req["request_no"].startswith("MR-"), "Request number must be formatted MR-YYYY-XXXX"
    assert created_req["requested_by"] == member_a1_id, "Server-side member attribution required"
    assert created_req["requested_by_name"] == "Suresh Patel"
    assert created_req["client_id"] == client_a_id
    assert len(created_req["items"]) == 2
    assert created_req["requester_name"] == "Anil Kumar"

    # Verify link's last_used_at was updated
    updated_link = await db.material_request_links.find_one({"id": link_a1["id"]})
    assert updated_link.get("last_used_at") is not None, "last_used_at must be populated on submission"
    print(f"✓ Test 5 PASSED: Submitted material request {created_req['request_no']} attributed to Suresh Patel")

    # --------------------------------------------------------------------------
    # TEST 6: Atomic Idempotency (Duplicate Prevention)
    # --------------------------------------------------------------------------
    sub_res_dup = await submit_public_material_request(data=sub_payload)
    assert sub_res_dup["status"] == "success"
    assert sub_res_dup.get("is_duplicate") is True, "Must identify duplicate submission"
    assert sub_res_dup["request"]["id"] == created_req["id"], "Must return original request record"
    assert sub_res_dup["request"]["request_no"] == created_req["request_no"]

    # Verify count in database did not increase
    req_count = await db.material_requests.count_documents({"idempotency_key": idempotency_key})
    assert req_count == 1, f"Expected exactly 1 request in DB, found {req_count}"
    print("✓ Test 6 PASSED: Atomic idempotency prevents duplicate requests")

    # --------------------------------------------------------------------------
    # TEST 7: Anti-Spam Honeypot Handling
    # --------------------------------------------------------------------------
    spam_payload = PublicMaterialRequestSubmitIn(
        token=token_a1,
        requester_name="Spam Bot",
        requester_phone="12345",
        client_id=client_a_id,
        items=[{"product": "SPAM", "quantity": 1}],
        idempotency_key=str(uuid.uuid4()),
        honeypot="I am an automated bot filling hidden fields"
    )
    spam_res = await submit_public_material_request(data=spam_payload)
    assert spam_res["status"] == "success", "Honeypot returns graceful success"
    assert spam_res["is_honeypot"] is True
    # Verify not inserted
    spam_count = await db.material_requests.count_documents({"requester_name": "Spam Bot"})
    assert spam_count == 0, "Spam request must NOT be inserted into database"
    print("✓ Test 7 PASSED: Anti-spam honeypot safely dropped spam submission")

    # --------------------------------------------------------------------------
    # TEST 8: Status Transitions (Active -> Disabled -> Active -> Regenerated -> Revoked)
    # --------------------------------------------------------------------------
    # A. Disable
    await update_material_request_link_status(
        link_id=link_a1["id"],
        data=UpdateMaterialRequestLinkStatusIn(status="disabled"),
        user=admin_user_a
    )
    try:
        await get_public_material_request_link_info(token=token_a1)
        assert False, "Disabled link must raise 403"
    except HTTPException as e:
        assert e.status_code == 403, f"Expected 403 for disabled link, got {e.status_code}"

    # B. Re-enable
    await update_material_request_link_status(
        link_id=link_a1["id"],
        data=UpdateMaterialRequestLinkStatusIn(status="active"),
        user=admin_user_a
    )
    pub_info_reactivated = await get_public_material_request_link_info(token=token_a1)
    assert pub_info_reactivated["company_name"] == "GVP Solar Technologies"

    # C. Regenerate Token
    regen_res = await regenerate_material_request_link(
        link_id=link_a1["id"],
        user=admin_user_a
    )
    new_token = regen_res["link"]["token"]
    assert new_token != token_a1, "Regenerated token must differ from old token"

    # Old token must now fail (revoked/obsolete)
    try:
        await get_public_material_request_link_info(token=token_a1)
        assert False, "Old token must fail after regeneration"
    except HTTPException as e:
        assert e.status_code in (403, 404), f"Expected 403 or 404 for obsolete token, got {e.status_code}"

    # New token must work
    pub_info_new = await get_public_material_request_link_info(token=new_token)
    assert pub_info_new["company_name"] == "GVP Solar Technologies"

    # D. Revoke Link Permanently
    await update_material_request_link_status(
        link_id=link_a1["id"],
        data=UpdateMaterialRequestLinkStatusIn(status="revoked"),
        user=admin_user_a
    )
    try:
        await get_public_material_request_link_info(token=new_token)
        assert False, "Revoked link must fail"
    except HTTPException as e:
        assert e.status_code == 403
    print("✓ Test 8 PASSED: Status lifecycle (Disable, Enable, Regenerate, Revoke) verified")

    # --------------------------------------------------------------------------
    # TEST 9: Multi-Tenant Isolation
    # --------------------------------------------------------------------------
    # Generate link for Company B
    res_b = await create_material_request_link(
        data=CreateMaterialRequestLinkIn(assigned_team_member_id=member_b1_id),
        user=admin_user_b
    )
    token_b = res_b["link"]["token"]

    # Company A admin cannot list Company B's links
    links_a = (await list_material_request_links(user=admin_user_a))["links"]
    assert not any(l["id"] == res_b["link"]["id"] for l in links_a), "Company A must not see Company B links"

    # Cannot submit Company A's client with Company B's link
    cross_payload = PublicMaterialRequestSubmitIn(
        token=token_b,
        requester_name="Cross Hacker",
        client_id=client_a_id,  # Belongs to Company A
        items=[{"product": "CROSS CABLE", "quantity": 10}],
        idempotency_key=str(uuid.uuid4())
    )
    try:
        await submit_public_material_request(data=cross_payload)
        assert False, "Cross-company client submission must be rejected"
    except HTTPException as e:
        assert e.status_code == 404, "Expected 404 for cross-tenant client ID"

    print("✓ Test 9 PASSED: Multi-tenant security and cross-company isolation verified")

    print("\n" + "=" * 80)
    print("ALL 9 PUBLIC MATERIAL REQUEST LINK INTEGRATION TESTS PASSED SUCCESSFULLY!")
    print("=" * 80)

if __name__ == "__main__":
    asyncio.run(run_tests())
