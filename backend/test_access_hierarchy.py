#!/usr/bin/env python3
"""
Test Suite for SOLARIX 5-Tier Access Hierarchy:
Account Subscription -> Plan Feature Entitlement -> Resource Limits -> Team Permissions -> Actual Access
Tests Cases A through Q as specified in Section 22.
"""
import sys
import os
import asyncio
from datetime import datetime, timezone, timedelta

# Ensure backend path is in sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from plan_config import (
    PLANS,
    get_company_entitlement,
    check_page_access,
    check_feature_access,
    check_plan_limit,
    REAL_APPLICATION_PAGES
)
from server import (
    is_super_admin_user,
    is_owner,
    has_team_permission,
    check_user_access,
    has_perm,
    _cache_put_company,
    _cache_invalidate_company,
    SUPER_ADMIN_EMAILS
)

# Mock in-memory database
class MockCursor:
    def __init__(self, docs):
        self._docs = docs

    async def to_list(self, length=10000):
        return self._docs

class MockCollection:
    def __init__(self, data=None):
        self.docs = {doc.get("id", str(i)): dict(doc) for i, doc in enumerate(data or [])}

    def find(self, query=None, projection=None):
        docs = []
        for doc in self.docs.values():
            match = True
            if query:
                for k, v in query.items():
                    if k == "company_id" and doc.get("company_id") != v:
                        match = False; break
            if match:
                res = dict(doc)
                if projection and "_id" in projection and projection["_id"] == 0:
                    res.pop("_id", None)
                docs.append(res)
        return MockCursor(docs)

    async def find_one(self, query, projection=None):
        for doc in self.docs.values():
            match = True
            for k, v in query.items():
                if k == "company_id" and doc.get("company_id") != v:
                    match = False; break
                elif k == "id" and doc.get("id") != v:
                    match = False; break
                elif k == "name" and doc.get("name") != v:
                    match = False; break
                elif k == "plan_id" and doc.get("plan_id") != v:
                    match = False; break
            if match:
                res = dict(doc)
                if projection and "_id" in projection and projection["_id"] == 0:
                    res.pop("_id", None)
                return res
        return None

    async def update_one(self, query, update, upsert=False):
        doc = await self.find_one(query)
        cid = query.get("id") or query.get("company_id") or "mock_id"
        if not doc:
            if upsert:
                doc = {"id": cid, **query}
                self.docs[cid] = doc
            else:
                return MockUpdateResult(0)
        if "$set" in update:
            doc.update(update["$set"])
        self.docs[cid] = doc
        return MockUpdateResult(1)

    async def count_documents(self, query):
        count = 0
        for doc in self.docs.values():
            match = True
            for k, v in query.items():
                if k == "company_id" and doc.get("company_id") != v:
                    match = False; break
                elif k == "is_deleted" and isinstance(v, dict) and "$ne" in v:
                    if doc.get("is_deleted") == v["$ne"]: match = False; break
            if match: count += 1
        return count

class MockUpdateResult:
    def __init__(self, count):
        self.modified_count = count
        self.matched_count = count

class MockDB:
    def __init__(self):
        self.companies = MockCollection()
        self.users = MockCollection()
        self.plans_config = MockCollection()
        self.clients = MockCollection()
        self.products = MockCollection()
        self.files = MockCollection()
        self.usage_counters = MockCollection()

async def run_all_tests():
    print("=" * 70)
    print("SOLARIX ACCESS HIERARCHY & PLAN ENTITLEMENT VERIFICATION SUITE")
    print("=" * 70)

    passed_count = 0
    total_count = 17

    db = MockDB()
    now = datetime.now(timezone.utc)

    # -------------------------------------------------------------------------
    # TEST A: Starter active + permission ON -> Allowed within quota
    # -------------------------------------------------------------------------
    company_a = {
        "id": "comp_starter_a",
        "name": "Starter Solar Ltd",
        "plan_id": "starter",
        "subscription_status": "active",
        "subscription_started_at": (now - timedelta(days=5)).isoformat(),
        "subscription_expires_at": (now + timedelta(days=25)).isoformat(),
        "created_at": (now - timedelta(days=5)).isoformat(),
    }
    await db.companies.update_one({"id": "comp_starter_a"}, {"$set": company_a}, upsert=True)
    _cache_put_company("comp_starter_a", company_a)

    user_a = {
        "id": "user_a",
        "company_id": "comp_starter_a",
        "role": "Staff",
        "name": "Alice Staff",
        "permissions": {
            "clients": {"view": True, "create": True, "edit": True, "delete": False}
        }
    }
    ok_a, msg_a, code_a = await check_user_access(user_a, "clients", "create", db=db)
    assert ok_a is True, f"Test A failed: {msg_a}"
    assert has_perm(user_a, "clients", "create") is True
    print("✓ Test A PASSED: Starter active + permission ON -> Allowed within quota")
    passed_count += 1

    # -------------------------------------------------------------------------
    # TEST B: Starter active + permission OFF -> Blocked (Missing permission)
    # -------------------------------------------------------------------------
    user_b = {
        "id": "user_b",
        "company_id": "comp_starter_a",
        "role": "Staff",
        "name": "Bob Staff",
        "permissions": {
            "clients": {"view": True, "create": False, "edit": False, "delete": False}
        }
    }
    ok_b, msg_b, code_b = await check_user_access(user_b, "clients", "create", db=db)
    assert ok_b is False and code_b == 403, f"Test B failed: {ok_b}, {msg_b}"
    assert "Missing permission: clients.create" in msg_b
    assert has_perm(user_b, "clients", "create") is False
    print("✓ Test B PASSED: Starter active + permission OFF -> Blocked (Missing permission)")
    passed_count += 1

    # -------------------------------------------------------------------------
    # TEST C: Starter feature OFF (purchase_orders) + permission ON -> Blocked (PAGE_NOT_ENTITLED)
    # -------------------------------------------------------------------------
    user_c = {
        "id": "user_c",
        "company_id": "comp_starter_a",
        "role": "Staff",
        "name": "Charlie Staff",
        "permissions": {
            "purchase_orders": {"view": True, "create": True, "edit": True, "delete": True}
        }
    }
    ok_c, msg_c, code_c = await check_user_access(user_c, "purchase_orders", "view", db=db)
    assert ok_c is False and code_c == 403, f"Test C failed: {ok_c}, {msg_c}"
    assert "PAGE_NOT_ENTITLED" in msg_c
    assert has_perm(user_c, "purchase_orders", "view") is False
    print("✓ Test C PASSED: Starter feature OFF + permission ON -> Blocked (PAGE_NOT_ENTITLED)")
    passed_count += 1

    # -------------------------------------------------------------------------
    # TEST D: Starter quota exhausted -> Blocked (PLAN_LIMIT_REACHED)
    # -------------------------------------------------------------------------
    # Starter max_clients is 100
    for i in range(100):
        db.clients.docs[f"client_{i}"] = {"id": f"client_{i}", "company_id": "comp_starter_a", "deleted": False}
    chk_quota = await check_plan_limit("comp_starter_a", "clients", increment=1, db=db)
    assert chk_quota["allowed"] is False, "Test D failed: quota not blocked"
    assert "PLAN_LIMIT_REACHED" in chk_quota["message"]
    print("✓ Test D PASSED: Starter quota exhausted -> Blocked (PLAN_LIMIT_REACHED)")
    passed_count += 1

    # -------------------------------------------------------------------------
    # TEST E: Trial active + allowed feature -> Allowed according to trial policy
    # -------------------------------------------------------------------------
    company_e = {
        "id": "comp_trial_e",
        "name": "Trial Company",
        "plan_id": "starter",
        "subscription_status": "trialing",
        "trial_started_at": (now - timedelta(days=3)).isoformat(),
        "trial_ends_at": (now + timedelta(days=12)).isoformat(),
        "created_at": (now - timedelta(days=3)).isoformat(),
    }
    await db.companies.update_one({"id": "comp_trial_e"}, {"$set": company_e}, upsert=True)
    _cache_put_company("comp_trial_e", company_e)

    user_e = {
        "id": "user_e",
        "company_id": "comp_trial_e",
        "role": "Admin",
        "name": "Emma Admin"
    }
    ok_e, msg_e, code_e = await check_user_access(user_e, "clients", "create", db=db)
    assert ok_e is True, f"Test E failed: {msg_e}"
    ent_e = await get_company_entitlement("comp_trial_e", db=db)
    assert ent_e["is_trial"] is True
    assert ent_e["days_remaining"] == 12
    assert ent_e["can_write"] is True
    print("✓ Test E PASSED: Trial active + allowed feature -> Allowed (12 days remaining)")
    passed_count += 1

    # -------------------------------------------------------------------------
    # TEST F: Trial expired + permission ON -> Write Blocked (SUBSCRIPTION_EXPIRED)
    # -------------------------------------------------------------------------
    company_f = {
        "id": "comp_expired_f",
        "name": "Expired Trial Co",
        "plan_id": "starter",
        "subscription_status": "trialing",
        "trial_started_at": (now - timedelta(days=20)).isoformat(),
        "trial_ends_at": (now - timedelta(days=5)).isoformat(),
        "created_at": (now - timedelta(days=20)).isoformat(),
    }
    await db.companies.update_one({"id": "comp_expired_f"}, {"$set": company_f}, upsert=True)
    _cache_invalidate_company("comp_expired_f")

    user_f = {
        "id": "user_f",
        "company_id": "comp_expired_f",
        "role": "Staff",
        "name": "Frank Staff",
        "permissions": {
            "clients": {"view": True, "create": True, "edit": True, "delete": True}
        }
    }
    # Write action (create) MUST be blocked
    ok_f_write, msg_f_write, code_f_write = await check_user_access(user_f, "clients", "create", db=db)
    assert ok_f_write is False and code_f_write == 403, f"Test F write failed: {ok_f_write}, {msg_f_write}"
    assert "SUBSCRIPTION_EXPIRED" in msg_f_write

    # Read action (view) on allowed page remains readable (no silent deletion)
    ok_f_read, msg_f_read, code_f_read = await check_user_access(user_f, "clients", "view", db=db)
    assert ok_f_read is True, f"Test F read failed: {msg_f_read}"
    print("✓ Test F PASSED: Trial expired + permission ON -> Write blocked (SUBSCRIPTION_EXPIRED), Read preserved")
    passed_count += 1

    # -------------------------------------------------------------------------
    # TEST G: Growth active + Growth feature (purchase_orders) + permission ON -> Allowed
    # -------------------------------------------------------------------------
    company_g = {
        "id": "comp_growth_g",
        "name": "Growth Solar Corp",
        "plan_id": "growth",
        "subscription_status": "active",
        "subscription_started_at": (now - timedelta(days=2)).isoformat(),
        "subscription_expires_at": (now + timedelta(days=28)).isoformat(),
        "created_at": (now - timedelta(days=2)).isoformat(),
    }
    await db.companies.update_one({"id": "comp_growth_g"}, {"$set": company_g}, upsert=True)
    _cache_put_company("comp_growth_g", company_g)

    user_g = {
        "id": "user_g",
        "company_id": "comp_growth_g",
        "role": "Staff",
        "name": "Grace Staff",
        "permissions": {
            "purchase_orders": {"view": True, "create": True, "edit": True, "delete": False}
        }
    }
    ok_g, msg_g, code_g = await check_user_access(user_g, "purchase_orders", "create", db=db)
    assert ok_g is True, f"Test G failed: {msg_g}"
    print("✓ Test G PASSED: Growth active + Growth feature (purchase_orders) + permission ON -> Allowed")
    passed_count += 1

    # -------------------------------------------------------------------------
    # TEST H: Growth active + unentitled/disabled feature + permission ON -> Blocked
    # -------------------------------------------------------------------------
    # If a page is not entitled on Growth (e.g. disabled in plans_config)
    await db.plans_config.update_one(
        {"id": "growth"},
        {"$set": {"id": "growth", "pages": {"complaints": False}}},
        upsert=True
    )
    _cache_invalidate_company("comp_growth_g")

    user_h = {
        "id": "user_h",
        "company_id": "comp_growth_g",
        "role": "Staff",
        "name": "Hank Staff",
        "permissions": {
            "complaints": {"view": True, "create": True}
        }
    }
    ok_h, msg_h, code_h = await check_user_access(user_h, "complaints", "view", db=db)
    assert ok_h is False and code_h == 403, f"Test H failed: {ok_h}, {msg_h}"
    assert "PAGE_NOT_ENTITLED" in msg_h
    print("✓ Test H PASSED: Growth active + unentitled/disabled feature + permission ON -> Blocked")
    passed_count += 1

    # -------------------------------------------------------------------------
    # TEST I: Pro active + Pro feature + permission OFF -> Blocked (Missing permission)
    # -------------------------------------------------------------------------
    company_i = {
        "id": "comp_pro_i",
        "name": "Pro Solar Mega",
        "plan_id": "pro",
        "subscription_status": "active",
        "subscription_started_at": (now - timedelta(days=1)).isoformat(),
        "subscription_expires_at": (now + timedelta(days=29)).isoformat(),
        "created_at": (now - timedelta(days=1)).isoformat(),
    }
    await db.companies.update_one({"id": "comp_pro_i"}, {"$set": company_i}, upsert=True)
    _cache_put_company("comp_pro_i", company_i)

    user_i = {
        "id": "user_i",
        "company_id": "comp_pro_i",
        "role": "Staff",
        "name": "Ian Staff",
        "permissions": {
            "purchase_orders": {"view": False, "create": False, "edit": False, "delete": False}
        }
    }
    ok_i, msg_i, code_i = await check_user_access(user_i, "purchase_orders", "view", db=db)
    assert ok_i is False and code_i == 403, f"Test I failed: {ok_i}, {msg_i}"
    assert "Missing permission: purchase_orders.view" in msg_i
    print("✓ Test I PASSED: Pro active + Pro feature + permission OFF -> Blocked (Missing permission)")
    passed_count += 1

    # -------------------------------------------------------------------------
    # TEST J: Pro -> Starter plan downgrade -> Pro-only effective access removed, team perms preserved
    # -------------------------------------------------------------------------
    # Save team member with purchase_orders=True in Pro
    user_j = {
        "id": "user_j",
        "company_id": "comp_pro_i",
        "role": "Staff",
        "name": "Jack Staff",
        "permissions": {
            "purchase_orders": {"view": True, "create": True, "edit": True, "delete": False}
        }
    }
    # Before downgrade: Allowed
    ok_j1, msg_j1, _ = await check_user_access(user_j, "purchase_orders", "view", db=db)
    assert ok_j1 is True

    # Downgrade company to Starter
    await db.companies.update_one({"id": "comp_pro_i"}, {"$set": {"plan_id": "starter"}})
    _cache_invalidate_company("comp_pro_i")

    # After downgrade: Blocked by Plan Entitlement
    ok_j2, msg_j2, code_j2 = await check_user_access(user_j, "purchase_orders", "view", db=db)
    assert ok_j2 is False and code_j2 == 403
    assert "PAGE_NOT_ENTITLED" in msg_j2
    # Saved permission is STILL intact in user document!
    assert user_j["permissions"]["purchase_orders"]["view"] is True
    print("✓ Test J PASSED: Pro -> Starter downgrade -> Pro access blocked, saved permissions preserved in DB")
    passed_count += 1

    # -------------------------------------------------------------------------
    # TEST K: Starter -> Pro plan upgrade -> Pro features become eligible, respecting existing team permissions
    # -------------------------------------------------------------------------
    # Upgrade back to Pro
    await db.companies.update_one({"id": "comp_pro_i"}, {"$set": {"plan_id": "pro"}})
    _cache_invalidate_company("comp_pro_i")

    # Now Jack's preserved permission immediately takes effect without re-configuration!
    ok_k, msg_k, _ = await check_user_access(user_j, "purchase_orders", "view", db=db)
    assert ok_k is True, f"Test K failed: {msg_k}"
    print("✓ Test K PASSED: Starter -> Pro upgrade -> Restores access automatically using preserved permissions")
    passed_count += 1

    # -------------------------------------------------------------------------
    # TEST L: Change team permission OFF -> ON -> Effective access updates immediately
    # -------------------------------------------------------------------------
    user_j["permissions"]["purchase_orders"]["delete"] = True
    ok_l, msg_l, _ = await check_user_access(user_j, "purchase_orders", "delete", db=db)
    assert ok_l is True
    print("✓ Test L PASSED: Change team permission OFF -> ON -> Effective access updates immediately")
    passed_count += 1

    # -------------------------------------------------------------------------
    # TEST M: Change team permission ON -> OFF -> Effective access updates immediately
    # -------------------------------------------------------------------------
    user_j["permissions"]["purchase_orders"]["delete"] = False
    ok_m, msg_m, code_m = await check_user_access(user_j, "purchase_orders", "delete", db=db)
    assert ok_m is False and code_m == 403
    assert "Missing permission: purchase_orders.delete" in msg_m
    print("✓ Test M PASSED: Change team permission ON -> OFF -> Effective access updates immediately")
    passed_count += 1

    # -------------------------------------------------------------------------
    # TEST N: Change plan quota in Control Center -> Immediately enforced
    # -------------------------------------------------------------------------
    # Override starter max_clients to 50 in db.plans_config
    await db.plans_config.update_one(
        {"id": "starter"},
        {"$set": {"id": "starter", "max_clients": 50, "updated_at": now.isoformat()}},
        upsert=True
    )
    ent_n = await get_company_entitlement("comp_starter_a", db=db)
    assert ent_n["limits"]["max_clients"] == 50, f"Expected 50, got {ent_n['limits']['max_clients']}"
    print("✓ Test N PASSED: Change plan quota -> Authoritative limits update dynamically in real time")
    passed_count += 1

    # -------------------------------------------------------------------------
    # TEST O: Extend trial with extra days -> Correct remaining days everywhere
    # -------------------------------------------------------------------------
    # Extend trial for comp_trial_e by 7 extra days
    new_trial_end = now + timedelta(days=19)
    await db.companies.update_one(
        {"id": "comp_trial_e"},
        {"$set": {
            "extra_days": 7,
            "trial_ends_at": new_trial_end.isoformat(),
            "subscription_status": "trialing"
        }}
    )
    _cache_invalidate_company("comp_trial_e")
    ent_o = await get_company_entitlement("comp_trial_e", db=db)
    assert ent_o["days_remaining"] == 19
    assert ent_o["is_trial"] is True
    print("✓ Test O PASSED: Extend trial -> Remaining days correctly calculated from authoritative DB")
    passed_count += 1

    # -------------------------------------------------------------------------
    # TEST P: Super Admin bypass -> Platform owner retains full access across all operations
    # -------------------------------------------------------------------------
    super_admin_user = {
        "id": "super_admin_1",
        "company_id": "comp_starter_a",
        "email": "solarixofficial.info@gmail.com",
        "role": "Super Admin",
        "is_super_admin": True,
        "is_platform_owner": True
    }
    assert is_super_admin_user(super_admin_user) is True
    # Can access unentitled page on Starter
    ok_p1, _, _ = await check_user_access(super_admin_user, "purchase_orders", "create", db=db)
    assert ok_p1 is True
    # Can perform write on expired company
    super_admin_expired = {**super_admin_user, "company_id": "comp_expired_f"}
    ok_p2, _, _ = await check_user_access(super_admin_expired, "clients", "create", db=db)
    assert ok_p2 is True
    print("✓ Test P PASSED: Super Admin bypass -> Platform owner retains full access across all operations")
    passed_count += 1

    # -------------------------------------------------------------------------
    # TEST Q: Normal Company Admin -> Strictly subject to subscription state and plan entitlement (no bypass)
    # -------------------------------------------------------------------------
    company_admin = {
        "id": "comp_admin_q",
        "company_id": "comp_starter_a",
        "email": "owner@solarepc.com",
        "role": "Admin",
        "user_type": "owner",
        "is_owner": True,
        "is_super_admin": False
    }
    # 1. Company Admin on Starter cannot access Pro-only / unentitled page (purchase_orders)
    ok_q1, msg_q1, code_q1 = await check_user_access(company_admin, "purchase_orders", "view", db=db)
    assert ok_q1 is False and code_q1 == 403, f"Test Q1 failed: Company admin bypassed plan entitlement! {msg_q1}"
    assert "PAGE_NOT_ENTITLED" in msg_q1

    # 2. Company Admin on Expired account cannot perform write operations
    company_admin_expired = {**company_admin, "company_id": "comp_expired_f"}
    ok_q2, msg_q2, code_q2 = await check_user_access(company_admin_expired, "clients", "create", db=db)
    assert ok_q2 is False and code_q2 == 403, f"Test Q2 failed: Company admin bypassed subscription expiry! {msg_q2}"
    assert "SUBSCRIPTION_EXPIRED" in msg_q2
    print("✓ Test Q PASSED: Normal Company Admin -> Strictly subject to subscription state & plan entitlement")
    passed_count += 1

    print("=" * 70)
    print(f"ALL {passed_count}/{total_count} TEST CASES PASSED WITH 100% SUCCESS!")
    print("=" * 70)

if __name__ == "__main__":
    asyncio.run(run_all_tests())
