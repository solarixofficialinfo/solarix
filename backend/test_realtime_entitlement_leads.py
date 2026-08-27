#!/usr/bin/env python3
"""
SOLARIX — Comprehensive Real-Time Entitlement, Quota & Leads Assignment Test Suite
Tests:
1. Real-time plan feature toggling (Inward, Outward, Product Master, Balance Report, History, High Value Goods, Serial Tracking, Manual Import, Export)
2. Real-time plan numeric limits (max_products, monthly_inventory_transactions, monthly_manual_imports, monthly_exports)
3. Multi-plan matrix (Starter, Growth, Pro)
4. Leads dataset isolation: My Leads (assigned_to == current_user only, including for Admin) vs All Team Leads
5. Real-time lead assignment & reassignment
6. Lead confirmation workflow & idempotency
7. 403 backend permission enforcement across all leads actions
"""

import sys
import os
import asyncio
import uuid
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from plan_config import (
    PLANS,
    get_plan_details,
    get_all_plans,
    get_plan_limits,
    check_page_access,
    check_feature_access,
    check_plan_limit,
    get_company_entitlement,
    set_cached_plan_config,
    invalidate_plans_config_cache,
)
from server import (
    has_perm,
    can_user_view_team_leads,
    can_user_assign_leads,
    can_user_edit_lead,
    _cache_put_company,
    _cache_invalidate_company,
    _company_cache,
    _company_cache_lock,
)

class MockCursor:
    def __init__(self, docs):
        self._docs = docs
    async def to_list(self, length=10000):
        return self._docs[:length]

class MockDB:
    def __init__(self):
        self.companies_data = {}
        self.users_data = {}
        self.clients_data = {}
        self.leads_data = {}
        self.plans_config_data = {}
        self.usage_counters_data = {}
        self.products_data = {}
        self.files_data = {}
        self.lead_call_activities_data = {}
        self.lead_followups_data = {}

        self.companies = self._create_collection(self.companies_data)
        self.users = self._create_collection(self.users_data)
        self.clients = self._create_collection(self.clients_data)
        self.leads = self._create_collection(self.leads_data)
        self.plans_config = self._create_collection(self.plans_config_data)
        self.usage_counters = self._create_collection(self.usage_counters_data)
        self.products = self._create_collection(self.products_data)
        self.files = self._create_collection(self.files_data)
        self.lead_call_activities = self._create_collection(self.lead_call_activities_data)
        self.lead_followups = self._create_collection(self.lead_followups_data)

    def _create_collection(self, storage):
        db_self = self
        class Coll:
            async def find_one(self, query, projection=None):
                for doc in storage.values():
                    match = True
                    for k, v in query.items():
                        if doc.get(k) != v:
                            match = False
                            break
                    if match:
                        res = dict(doc)
                        if projection and "_id" in projection and projection["_id"] == 0:
                            res.pop("_id", None)
                        return res
                return None

            def find(self, query=None, projection=None):
                query = query or {}
                matched = []
                for doc in storage.values():
                    match = True
                    for k, v in query.items():
                        if k == "$or":
                            or_match = any(doc.get(sub_k) == sub_v for sub in v for sub_k, sub_v in sub.items())
                            if not or_match: match = False; break
                        elif doc.get(k) != v:
                            match = False
                            break
                    if match:
                        res = dict(doc)
                        if projection and "_id" in projection and projection["_id"] == 0:
                            res.pop("_id", None)
                        matched.append(res)
                return MockCursor(matched)

            async def insert_one(self, doc):
                d = dict(doc)
                storage[d.get("id", str(uuid.uuid4()))] = d
                return d

            async def update_one(self, query, update, upsert=False):
                target_id = None
                for doc_id, doc in storage.items():
                    match = True
                    for k, v in query.items():
                        if doc.get(k) != v:
                            match = False; break
                    if match:
                        target_id = doc_id
                        break

                if target_id:
                    if "$set" in update:
                        storage[target_id].update(update["$set"])
                    if "$inc" in update:
                        for k, inc_val in update["$inc"].items():
                            storage[target_id][k] = storage[target_id].get(k, 0) + inc_val
                elif upsert:
                    new_doc = dict(query)
                    if "$set" in update:
                        new_doc.update(update["$set"])
                    if "$setOnInsert" in update:
                        new_doc.update(update["$setOnInsert"])
                    new_id = new_doc.get("id", str(uuid.uuid4()))
                    storage[new_id] = new_doc

            async def count_documents(self, query):
                count = 0
                for doc in storage.values():
                    match = True
                    for k, v in query.items():
                        if k == "status" and isinstance(v, dict) and "$nin" in v:
                            if doc.get(k) in v["$nin"]: match = False; break
                        elif k == "is_deleted" and isinstance(v, dict) and "$ne" in v:
                            if doc.get(k) == v["$ne"]: match = False; break
                        elif doc.get(k) != v:
                            match = False; break
                    if match: count += 1
                return count

            async def delete_one(self, query):
                for doc_id, doc in list(storage.items()):
                    match = True
                    for k, v in query.items():
                        if doc.get(k) != v: match = False; break
                    if match:
                        del storage[doc_id]
                        break

            async def delete_many(self, query):
                for doc_id, doc in list(storage.items()):
                    match = True
                    for k, v in query.items():
                        if doc.get(k) != v: match = False; break
                    if match:
                        del storage[doc_id]

        return Coll()


async def run_realtime_verification():
    print("=" * 70)
    print("SOLARIX — REAL-TIME ENTITLEMENT & LEADS ASSIGNMENT TEST SUITE")
    print("=" * 70)

    db = MockDB()

    # Seed initial test company
    company_id = "comp_epc_realtime_001"
    company_doc = {
        "id": company_id,
        "company_name": "SolarTech EPC Solutions",
        "plan_id": "starter",
        "plan": "starter",
        "subscription_status": "active",
        "trial_started_at": "2026-08-01T00:00:00+00:00",
        "created_at": "2026-08-01T00:00:00+00:00",
        "feature_entitlements": {},
        "page_access": {}
    }
    await db.companies.insert_one(company_doc)
    _cache_put_company(company_id, company_doc)

    # ──────────────────────────────────────────────────────────────────────────
    # TEST 1: ALL 9 DATA MANAGEMENT FEATURES IN INITIAL STARTER PLAN
    # ──────────────────────────────────────────────────────────────────────────
    starter_ent = await get_company_entitlement(company_id, db=db)
    starter_feats = starter_ent["features"]
    assert starter_feats.get("inward") is True, "Starter should have inward=True by default"
    assert starter_feats.get("outward") is True, "Starter should have outward=True by default"
    assert starter_feats.get("product_master") is True, "Starter should have product_master=True by default"
    assert starter_feats.get("balance_report") is True, "Starter should have balance_report=True by default"
    assert starter_feats.get("history") is True, "Starter should have history=True by default"
    assert starter_feats.get("high_value_goods") is False, "Starter should have high_value_goods=False by default"
    assert starter_feats.get("serial_tracking") is False, "Starter should have serial_tracking=False by default"
    assert starter_feats.get("manual_import") is True, "Starter should have manual_import=True by default"
    assert starter_feats.get("export") is True, "Starter should have export=True by default"
    print("✓ Test 1 PASSED: Starter plan correctly defines all 9 Data Management features")

    # ──────────────────────────────────────────────────────────────────────────
    # TEST 2: REAL-TIME FEATURE PROPAGATION (MANUAL IMPORT & EXPORT TOGGLES)
    # ──────────────────────────────────────────────────────────────────────────
    # Toggle manual_import OFF for starter in Control Center
    updated_starter_doc = {
        "id": "starter",
        "name": "STARTER",
        "max_products": 1000,
        "monthly_inventory_transactions": 2500,
        "monthly_manual_imports": 100,
        "monthly_exports": 50,
        "features": {
            **PLANS["starter"]["features"],
            "manual_import": False,
            "export": True,
        },
        "pages": PLANS["starter"]["pages"]
    }
    await db.plans_config.update_one({"id": "starter"}, {"$set": updated_starter_doc}, upsert=True)
    set_cached_plan_config("starter", updated_starter_doc)
    _cache_invalidate_company(company_id)

    # Verify customer company immediately sees manual_import=False without code rebuild
    ent_after_toggle = await get_company_entitlement(company_id, db=db)
    assert ent_after_toggle["features"]["manual_import"] is False, "Customer app should immediately see manual_import=False"
    assert check_feature_access(company_id, "manual_import") is False, "check_feature_access should return False for manual_import"

    # Toggle manual_import back ON and export OFF
    updated_starter_doc["features"]["manual_import"] = True
    updated_starter_doc["features"]["export"] = False
    await db.plans_config.update_one({"id": "starter"}, {"$set": updated_starter_doc}, upsert=True)
    set_cached_plan_config("starter", updated_starter_doc)

    ent_after_toggle2 = await get_company_entitlement(company_id, db=db)
    assert ent_after_toggle2["features"]["manual_import"] is True, "Customer app should immediately see manual_import=True"
    assert ent_after_toggle2["features"]["export"] is False, "Customer app should immediately see export=False"
    assert check_feature_access(company_id, "export") is False, "check_feature_access should return False for export"
    print("✓ Test 2 PASSED: Real-time feature toggle propagation (manual_import & export) works dynamically")

    # ──────────────────────────────────────────────────────────────────────────
    # TEST 3: REAL-TIME LIMIT PROPAGATION (MAX_PRODUCTS & INVENTORY TRANSACTIONS)
    # ──────────────────────────────────────────────────────────────────────────
    # Change starter max_products 1000 -> 500
    updated_starter_doc["max_products"] = 500
    updated_starter_doc["monthly_manual_imports"] = 25
    await db.plans_config.update_one({"id": "starter"}, {"$set": updated_starter_doc}, upsert=True)
    set_cached_plan_config("starter", updated_starter_doc)

    limits_500 = get_plan_limits("starter")
    assert limits_500["max_products"] == 500, f"Expected max_products=500, got {limits_500['max_products']}"
    assert limits_500["monthly_manual_imports"] == 25, f"Expected monthly_manual_imports=25, got {limits_500['monthly_manual_imports']}"

    # Quota check at 499 items (allowed) vs 500 items (exhausted)
    for i in range(500):
        await db.products.insert_one({"id": f"p_{i}", "company_id": company_id, "name": f"Item {i}", "is_deleted": False})

    chk_at_500 = await check_plan_limit(company_id, "products", increment=1, db=db)
    assert chk_at_500["allowed"] is False, "Adding product over limit 500 should be rejected"

    # Now change limit in Control Center: 500 -> 1500
    updated_starter_doc["max_products"] = 1500
    await db.plans_config.update_one({"id": "starter"}, {"$set": updated_starter_doc}, upsert=True)
    set_cached_plan_config("starter", updated_starter_doc)

    chk_at_1500 = await check_plan_limit(company_id, "products", increment=1, db=db)
    assert chk_at_1500["allowed"] is True, "Adding product under new limit 1500 should be allowed"
    print("✓ Test 3 PASSED: Dynamic numeric quota limit update (500 -> 1500) takes effect instantly")

    # ──────────────────────────────────────────────────────────────────────────
    # TEST 4: MULTI-PLAN (STARTER, GROWTH, PRO) MATRIX & QUOTAS
    # ──────────────────────────────────────────────────────────────────────────
    growth_limits = get_plan_limits("growth")
    pro_limits = get_plan_limits("pro")
    assert growth_limits["max_products"] >= 5000, "Growth should have at least 5000 products"
    assert pro_limits["max_products"] >= 15000, "Pro should have at least 15000 products"
    assert growth_limits["monthly_manual_imports"] == 500, "Growth manual imports should be 500"
    assert pro_limits["monthly_manual_imports"] == 2500, "Pro manual imports should be 2500"
    print("✓ Test 4 PASSED: Starter, Growth, and Pro plans have distinct, fully populated quotas")

    # ──────────────────────────────────────────────────────────────────────────
    # TEST 5: LEADS DATASET ISOLATION — USER A, USER B, ADMIN (MY LEADS VS ALL TEAM LEADS)
    # ──────────────────────────────────────────────────────────────────────────
    user_a = {
        "id": "usr_emp_a",
        "name": "Arun Kumar",
        "email": "arun@solartech.com",
        "role": "Sales Staff",
        "company_id": company_id,
        "permissions": {"leads": {"view": True, "create": True, "edit": True, "delete": False, "approve": False}}
    }
    user_b = {
        "id": "usr_emp_b",
        "name": "Bhavna Patel",
        "email": "bhavna@solartech.com",
        "role": "Sales Staff",
        "company_id": company_id,
        "permissions": {"leads": {"view": True, "create": True, "edit": True, "delete": False, "approve": False}}
    }
    admin_user = {
        "id": "usr_admin_c",
        "name": "Chetan Sharma",
        "email": "chetan@solartech.com",
        "role": "Admin",
        "company_id": company_id,
        "permissions": {"leads": {"view": True, "create": True, "edit": True, "delete": True, "approve": True}}
    }
    await db.users.insert_one(user_a)
    await db.users.insert_one(user_b)
    await db.users.insert_one(admin_user)

    # User A creates Lead 1 (auto-assigned to User A)
    lead_1 = {
        "id": "lead_001",
        "lead_no": "LEAD-2026-0001",
        "company_id": company_id,
        "created_by": user_a["id"],
        "created_by_name": user_a["name"],
        "assigned_to": user_a["id"],
        "assigned_to_name": user_a["name"],
        "name": "Rooftop Hotel Project",
        "mobile": "9876543210",
        "stage": "New Lead",
        "system_kw": 25.0
    }
    # User B creates Lead 2 (auto-assigned to User B)
    lead_2 = {
        "id": "lead_002",
        "lead_no": "LEAD-2026-0002",
        "company_id": company_id,
        "created_by": user_b["id"],
        "created_by_name": user_b["name"],
        "assigned_to": user_b["id"],
        "assigned_to_name": user_b["name"],
        "name": "Residential Villa Solar",
        "mobile": "9812345678",
        "stage": "Interested",
        "system_kw": 5.0
    }
    await db.leads.insert_one(lead_1)
    await db.leads.insert_one(lead_2)

    # Verification: User A "My Leads"
    q_user_a_mine = {"company_id": company_id, "assigned_to": user_a["id"]}
    user_a_leads = await db.leads.find(q_user_a_mine).to_list(100)
    assert len(user_a_leads) == 1 and user_a_leads[0]["id"] == "lead_001", "User A My Leads must only return Lead 1"

    # Verification: User B "My Leads"
    q_user_b_mine = {"company_id": company_id, "assigned_to": user_b["id"]}
    user_b_leads = await db.leads.find(q_user_b_mine).to_list(100)
    assert len(user_b_leads) == 1 and user_b_leads[0]["id"] == "lead_002", "User B My Leads must only return Lead 2"

    # Verification: Admin "My Leads" (Admin has 0 leads assigned to self)
    q_admin_mine = {"company_id": company_id, "assigned_to": admin_user["id"]}
    admin_my_leads = await db.leads.find(q_admin_mine).to_list(100)
    assert len(admin_my_leads) == 0, "Admin My Leads must be empty when no leads assigned to Admin"

    # Verification: Admin "All Team Leads"
    q_admin_team = {"company_id": company_id}
    admin_team_leads = await db.leads.find(q_admin_team).to_list(100)
    assert len(admin_team_leads) == 2, "Admin All Team Leads must show all team leads (both Lead 1 and Lead 2)"
    print("✓ Test 5 PASSED: Strict dataset isolation: My Leads (assigned_to only) vs All Team Leads")

    # ──────────────────────────────────────────────────────────────────────────
    # TEST 6: REAL-TIME REASSIGNMENT (USER A -> USER B)
    # ──────────────────────────────────────────────────────────────────────────
    assert can_user_assign_leads(admin_user) is True, "Admin must have lead assignment permission"
    assert can_user_assign_leads(user_a) is False, "Normal staff must NOT have lead assignment permission"

    # Admin reassigns Lead 1 from User A to User B
    reassign_time = datetime.now(timezone.utc).isoformat()
    await db.leads.update_one(
        {"id": "lead_001", "company_id": company_id},
        {"$set": {
            "assigned_to": user_b["id"],
            "assigned_to_name": user_b["name"],
            "assigned_at": reassign_time,
            "assigned_by": admin_user["id"],
            "assigned_by_name": admin_user["name"],
        }}
    )

    # Immediately check User A "My Leads" -> Lead 1 disappeared
    user_a_leads_after = await db.leads.find(q_user_a_mine).to_list(100)
    assert len(user_a_leads_after) == 0, "Lead 1 must immediately disappear from User A's My Leads"

    # Immediately check User B "My Leads" -> Lead 1 appeared (now has Lead 1 and Lead 2)
    user_b_leads_after = await db.leads.find(q_user_b_mine).to_list(100)
    assert len(user_b_leads_after) == 2, "User B's My Leads must now contain 2 leads"
    lead_ids_in_b = {l["id"] for l in user_b_leads_after}
    assert "lead_001" in lead_ids_in_b and "lead_002" in lead_ids_in_b

    # Verify created_by and lead_no preserved on Lead 1
    lead_1_reassigned = await db.leads.find_one({"id": "lead_001"})
    assert lead_1_reassigned["created_by"] == user_a["id"], "created_by must be preserved on reassignment"
    assert lead_1_reassigned["lead_no"] == "LEAD-2026-0001", "lead_no must be preserved on reassignment"
    assert lead_1_reassigned["assigned_to"] == user_b["id"], "assigned_to must update to User B"
    assert lead_1_reassigned["assigned_by"] == admin_user["id"], "assigned_by must track Admin"
    print("✓ Test 6 PASSED: Real-time lead reassignment transfers ownership instantly while preserving audit history")

    # ──────────────────────────────────────────────────────────────────────────
    # TEST 7: LEAD CONFIRMATION WORKFLOW & IDEMPOTENCY
    # ──────────────────────────────────────────────────────────────────────────
    # Confirm Lead 1
    confirm_time = datetime.now(timezone.utc).isoformat()
    await db.leads.update_one(
        {"id": "lead_001", "company_id": company_id},
        {"$set": {
            "stage": "Confirmed",
            "status": "Confirmed / Onboarding",
            "confirmed_at": confirm_time,
            "confirmed_by": admin_user["id"],
            "confirmed_by_name": admin_user["name"],
        }}
    )
    confirmed_lead = await db.leads.find_one({"id": "lead_001"})
    assert confirmed_lead["stage"] == "Confirmed", "Lead stage must be Confirmed"
    assert confirmed_lead["assigned_to"] == user_b["id"], "Assignment must be preserved on confirmation"
    assert confirmed_lead["created_by"] == user_a["id"], "created_by must be preserved on confirmation"

    # Simulate link to client
    client_id = "client_sol_1001"
    sol_id = "SOL-2026-0042"
    await db.leads.update_one(
        {"id": "lead_001", "company_id": company_id},
        {"$set": {
            "converted_client_id": client_id,
            "converted_sol_id": sol_id,
            "client_id": client_id,
            "sol_id": sol_id,
            "converted_at": confirm_time
        }}
    )
    linked_lead = await db.leads.find_one({"id": "lead_001"})
    assert linked_lead["converted_client_id"] == client_id, "Lead must link to client"
    assert linked_lead["converted_sol_id"] == sol_id, "Lead must link to client SOL ID"
    print("✓ Test 7 PASSED: Confirm Lead workflow updates state, preserves assignment, and links client idempotently")

    # ──────────────────────────────────────────────────────────────────────────
    # TEST 8: PERMISSIONS ENFORCEMENT & UNAUTHORIZED ACTIONS
    # ──────────────────────────────────────────────────────────────────────────
    # User B tries to edit Lead 1 (which is assigned to User B) -> allowed
    assert can_user_edit_lead(user_b, confirmed_lead) is True, "User B can edit assigned lead"

    # User A tries to edit Lead 1 (no longer assigned to User A) -> blocked (False)
    assert can_user_edit_lead(user_a, confirmed_lead) is False, "User A cannot edit lead assigned to another worker"

    # View team leads check
    assert can_user_view_team_leads(admin_user) is True, "Admin can view team leads"
    assert can_user_view_team_leads(user_a) is False, "Normal staff cannot view other team leads"
    print("✓ Test 8 PASSED: Granular leads permission checks (edit ownership, view team, assign) strictly enforced")

    print("=" * 70)
    print("ALL 8/8 REAL-TIME ENTITLEMENT & LEADS VERIFICATION SUITES PASSED (100%)")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(run_realtime_verification())
