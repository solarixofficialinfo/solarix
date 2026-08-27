import asyncio
import sys
import uuid
import jwt
import time
from pathlib import Path
from fastapi.testclient import TestClient

ROOT_DIR = Path(__file__).parent
sys.path.insert(0, str(ROOT_DIR))

import server

# Separate clients to simulate independent browser sessions
admin_client = TestClient(server.app)
guest_client = TestClient(server.app)

SUPER_ADMIN = {
    "id": "sa_control_center_test",
    "email": "solarixofficial.info@gmail.com",
    "role": "Platform Owner",
    "is_super_admin": True,
}

def get_super_admin_headers():
    payload = {
        "sub": SUPER_ADMIN["id"],
        "email": SUPER_ADMIN["email"],
        "role": "Platform Owner",
        "is_super_admin": True,
        "exp": int(time.time() + 7200)
    }
    token = jwt.encode(payload, server.JWT_SECRET, algorithm=server.JWT_ALGORITHM)
    return {"Authorization": f"Bearer {token}"}

def get_user_headers(user):
    payload = {
        "sub": user["id"],
        "email": user["email"],
        "role": user.get("role", "Admin"),
        "company_id": user.get("company_id"),
        "is_super_admin": False,
        "exp": int(time.time() + 7200)
    }
    token = jwt.encode(payload, server.JWT_SECRET, algorithm=server.JWT_ALGORITHM)
    return {"Authorization": f"Bearer {token}"}

async def run_tests():
    print("=" * 70)
    print("SOLARIX CONTROL CENTER — NEW USER / CLIENT VISIBILITY VERIFICATION")
    print("=" * 70)

    sa_headers = get_super_admin_headers()

    # Capture initial list of existing customers
    init_res = admin_client.get("/api/platform-owner/customers", headers=sa_headers)
    assert init_res.status_code == 200, f"Failed to list customers: {init_res.status_code} {init_res.text}"
    existing_companies = init_res.json()
    initial_count = len(existing_companies)
    initial_ids = {c["id"] for c in existing_companies}
    print(f"✓ Baseline check PASSED: {initial_count} existing workspaces loaded cleanly with status 200")

    # -------------------------------------------------------------
    # TEST 1: Single New Customer Signup & Immediate Appearance in CC
    # -------------------------------------------------------------
    uid1 = uuid.uuid4().hex[:6]
    c1_data = {
        "company_name": f"Solar Enterprise One {uid1}",
        "owner_name": f"Owner One {uid1}",
        "email": f"owner_one_{uid1}@solarixtest.com",
        "mobile": "9811122233",
        "password": "Password@123",
        "address": "101 Sun Road",
        "city": "Mumbai",
        "state": "Maharashtra",
        "pincode": "400001",
        "business_type": "Solar EPC"
    }
    r1 = guest_client.post("/api/auth/register", json=c1_data)
    assert r1.status_code == 200, f"Signup 1 failed: {r1.status_code} {r1.text}"
    c1_id = r1.json()["company"]["id"]
    c1_user = r1.json()["user"]

    # Verify immediate visibility in Control Center (simulating open CC query)
    cc_res1 = admin_client.get("/api/platform-owner/customers", headers=sa_headers)
    assert cc_res1.status_code == 200
    cc_list1 = cc_res1.json()
    found_c1 = next((c for c in cc_list1 if c["id"] == c1_id), None)
    assert found_c1 is not None, "TEST 1 FAILED: Newly registered customer did not appear in Control Center!"
    assert found_c1["company_name"] == c1_data["company_name"]
    assert found_c1["owner_name"] == c1_data["owner_name"]
    assert found_c1["email"] == c1_data["email"]
    assert found_c1["plan_id"] == "starter"
    assert found_c1["subscription_status"] in ("trialing", "active")
    print(f"✓ Test 1 PASSED: New customer '{c1_data['company_name']}' immediately appears in Control Center")

    # -------------------------------------------------------------
    # TEST 2: Multi-Customer Signup (Customer A, B, C) — No Duplicates
    # -------------------------------------------------------------
    created_multi = []
    for idx, tag in enumerate(["Alpha", "Beta", "Gamma"]):
        sub_uid = uuid.uuid4().hex[:6]
        phone_num = f"987{idx}5{int(time.time()) % 10000:04d}{idx}"
        c_sub_data = {
            "company_name": f"Customer {tag} Solar {sub_uid}",
            "owner_name": f"Owner {tag} {sub_uid}",
            "email": f"customer_{tag.lower()}_{sub_uid}@solarixtest.com",
            "mobile": phone_num,
            "password": "Password@123",
            "address": f"{tag} St",
            "city": "Bengaluru",
            "state": "Karnataka",
            "pincode": "560001",
            "business_type": "Installer"
        }
        # Use a fresh client for each customer signup
        cust_client = TestClient(server.app)
        rx = cust_client.post("/api/auth/register", json=c_sub_data)
        assert rx.status_code == 200, f"Signup for {tag} failed: {rx.text}"
        c_id = rx.json()["company"]["id"]
        created_multi.append((c_id, c_sub_data))

    cc_res2 = admin_client.get("/api/platform-owner/customers", headers=sa_headers)
    assert cc_res2.status_code == 200
    cc_list2 = cc_res2.json()

    # Verify each appears exactly once
    cc_ids = [c["id"] for c in cc_list2]
    for m_id, m_data in created_multi:
        count_in_cc = cc_ids.count(m_id)
        assert count_in_cc == 1, f"TEST 2 FAILED: Expected customer {m_id} exactly once, got {count_in_cc}"
        item = next(c for c in cc_list2 if c["id"] == m_id)
        assert item["company_name"] == m_data["company_name"]
    print("✓ Test 2 PASSED: Customers A, B, C created; all appear uniquely in Control Center with zero duplicates")

    # -------------------------------------------------------------
    # TEST 3: Trial State Correctness & Customer Workspace Alignment
    # -------------------------------------------------------------
    c1_detail_res = admin_client.get(f"/api/platform-owner/customers/{c1_id}", headers=sa_headers)
    assert c1_detail_res.status_code == 200, f"Customer detail failed: {c1_detail_res.text}"
    c1_detail = c1_detail_res.json()
    assert c1_detail["company"]["plan_id"] == "starter"
    assert c1_detail["company"]["subscription_status"] in ("trialing", "active")
    assert c1_detail["entitlement"]["plan_id"] == "starter"
    assert c1_detail["entitlement"]["is_trial"] is True or c1_detail["entitlement"]["has_active_subscription"] is True

    # Customer workspace check via dedicated customer client
    c1_client = TestClient(server.app)
    c1_user_headers = get_user_headers(c1_user)
    ws_sub_res = c1_client.get("/api/billing/subscription", headers=c1_user_headers)
    assert ws_sub_res.status_code == 200, f"Workspace subscription failed: {ws_sub_res.text}"
    ws_sub = ws_sub_res.json()
    assert ws_sub.get("plan_id") == "starter"
    print("✓ Test 3 PASSED: Trial state in Control Center perfectly matches customer workspace state")

    # -------------------------------------------------------------
    # TEST 4: Plan Change in Control Center Propagates Instantly
    # -------------------------------------------------------------
    upgrade_payload = {
        "plan_id": "growth",
        "billing_cycle": "monthly",
        "status": "active",
        "access_type": "paid",
        "reason": "Customer upgraded to Growth"
    }
    up_res = admin_client.post(f"/api/platform-owner/customers/{c1_id}/subscription", json=upgrade_payload, headers=sa_headers)
    assert up_res.status_code == 200, f"Upgrade failed: {up_res.text}"

    # Customer workspace should immediately resolve GROWTH plan
    ws_after_upgrade = c1_client.get("/api/billing/subscription", headers=c1_user_headers)
    assert ws_after_upgrade.status_code == 200
    assert ws_after_upgrade.json().get("plan_id") == "growth", f"Expected growth, got {ws_after_upgrade.json().get('plan_id')}"

    # Verify a subsequent new customer still gets the DEFAULT starter plan
    sub_uid_new = uuid.uuid4().hex[:6]
    c_new_data = {
        "company_name": f"Default Plan Verify {sub_uid_new}",
        "owner_name": f"Default Owner {sub_uid_new}",
        "email": f"default_{sub_uid_new}@solarixtest.com",
        "mobile": "9833344455",
        "password": "Password@123",
        "address": "456 Solar Ave",
        "city": "Nagpur",
        "state": "Maharashtra",
        "pincode": "440001",
        "business_type": "Installer"
    }
    r_new = guest_client.post("/api/auth/register", json=c_new_data)
    assert r_new.status_code == 200
    assert r_new.json()["company"]["plan_id"] == "starter"
    print("✓ Test 4 PASSED: Plan change propagates instantly to workspace; new signup inherits correct default plan")

    # -------------------------------------------------------------
    # TEST 5: Control Center Filters (Status & Plan) Work Accurately
    # -------------------------------------------------------------
    filter_trial_res = admin_client.get("/api/platform-owner/customers?status=trialing", headers=sa_headers)
    assert filter_trial_res.status_code == 200
    filter_plan_res = admin_client.get("/api/platform-owner/customers?plan=growth", headers=sa_headers)
    assert filter_plan_res.status_code == 200
    growth_companies = filter_plan_res.json()
    assert any(c["id"] == c1_id for c in growth_companies), "Upgraded company not found in growth plan filter!"
    print("✓ Test 5 PASSED: Control Center status and plan filters query database accurately without 500/400 errors")

    # -------------------------------------------------------------
    # TEST 6: Existing Accounts Preserved & Multi-Tenant Isolation
    # -------------------------------------------------------------
    final_res = admin_client.get("/api/platform-owner/customers", headers=sa_headers)
    assert final_res.status_code == 200
    final_list = final_res.json()
    final_ids = {c["id"] for c in final_list}

    # All initial companies still exist
    for init_id in initial_ids:
        assert init_id in final_ids, f"Existing company {init_id} vanished from list!"

    # Multi-tenant check: Normal customer token CANNOT access Control Center customers API
    unauthorized_res = c1_client.get("/api/platform-owner/customers", headers=c1_user_headers)
    assert unauthorized_res.status_code == 403, f"Expected 403 Forbidden for non-super-admin, got {unauthorized_res.status_code}"
    print("✓ Test 6 PASSED: All pre-existing accounts preserved; multi-tenant isolation strictly enforced (403 for tenants)")

    print("=" * 70)
    print("ALL 6/6 CONTROL CENTER VERIFICATION TESTS PASSED WITH 100% SUCCESS!")
    print("=" * 70)

if __name__ == "__main__":
    asyncio.run(run_tests())
