import asyncio
import os
import sys
import uuid
import re
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(__file__))

import server
from server import (
    LeadIn,
    ClientIn,
    create_lead,
    update_lead,
    delete_lead,
    confirm_lead,
    link_client_to_lead,
    list_leads,
    get_lead_stats,
    create_client,
    check_user_access,
    _cache_invalidate_company
)
from plan_config import (
    REAL_APPLICATION_PAGES,
    PLANS
)

class EnhancedMockCursor:
    def __init__(self, docs):
        self._docs = docs

    def sort(self, *args, **kwargs):
        return self

    def skip(self, n):
        self._docs = self._docs[n:]
        return self

    def limit(self, n):
        self._docs = self._docs[:n]
        return self

    async def to_list(self, length=None):
        if length is not None:
            return self._docs[:length]
        return self._docs

class EnhancedMockCollection:
    def __init__(self):
        self.docs = {}
        self.seq = 0

    async def find_one(self, query, projection=None):
        for doc in self.docs.values():
            match = True
            for k, v in query.items():
                if k == "$or" and isinstance(v, list):
                    or_match = False
                    for cond in v:
                        c_match = True
                        for ck, cv in cond.items():
                            if doc.get(ck) != cv:
                                c_match = False
                        if c_match:
                            or_match = True; break
                    if not or_match:
                        match = False; break
                elif doc.get(k) != v:
                    match = False
                    break
            if match:
                res = dict(doc)
                if projection and projection.get("_id") == 0:
                    res.pop("_id", None)
                return res
        return None

    def find(self, query=None, projection=None):
        query = query or {}
        matched = []
        for doc in self.docs.values():
            match = True
            for k, v in query.items():
                if k == "company_id" and doc.get("company_id") != v:
                    match = False; break
                elif k == "stage" and isinstance(v, dict) and "$regex" in v:
                    if not re.search(v["$regex"], str(doc.get("stage", "")), re.IGNORECASE):
                        match = False; break
                elif k == "is_deleted" and isinstance(v, dict) and "$ne" in v:
                    if doc.get("is_deleted") == v["$ne"]: match = False; break
                elif isinstance(v, str) and doc.get(k) != v:
                    match = False; break
            if match:
                d = dict(doc)
                if projection and projection.get("_id") == 0:
                    d.pop("_id", None)
                matched.append(d)
        return EnhancedMockCursor(matched)

    async def insert_one(self, doc):
        cid = doc.get("id") or str(uuid.uuid4())
        d = dict(doc)
        d["id"] = cid
        self.docs[cid] = d
        return type("InsertResult", (), {"inserted_id": cid})()

    async def update_one(self, query, update, upsert=False):
        doc = await self.find_one(query)
        cid = query.get("id") or query.get("company_id") or str(uuid.uuid4())
        if not doc:
            if upsert:
                doc = {"id": cid, **query}
                self.docs[cid] = doc
            else:
                return type("UpdateResult", (), {"modified_count": 0, "matched_count": 0})()
        if "$set" in update:
            doc.update(update["$set"])
        self.docs[cid] = doc
        return type("UpdateResult", (), {"modified_count": 1, "matched_count": 1})()

    async def find_one_and_update(self, query, update, upsert=False, return_document=True):
        doc = await self.find_one(query)
        cid = query.get("id") or f"{query.get('company_id')}_{query.get('type')}"
        if not doc:
            if upsert:
                doc = {"id": cid, **query, "seq": 0}
                self.docs[cid] = doc
            else:
                return None
        if "$inc" in update:
            for k, inc_val in update["$inc"].items():
                doc[k] = doc.get(k, 0) + inc_val
        if "$set" in update:
            doc.update(update["$set"])
        self.docs[cid] = doc
        return dict(doc)

    async def count_documents(self, query=None):
        query = query or {}
        count = 0
        for doc in self.docs.values():
            match = True
            for k, v in query.items():
                if k == "company_id" and doc.get("company_id") != v:
                    match = False; break
                elif k == "is_deleted" and isinstance(v, dict) and "$ne" in v:
                    if doc.get("is_deleted") == v["$ne"]: match = False; break
                elif isinstance(v, str) and doc.get(k) != v:
                    match = False; break
            if match: count += 1
        return count

    async def delete_one(self, query):
        doc = await self.find_one(query)
        if doc and "id" in doc and doc["id"] in self.docs:
            del self.docs[doc["id"]]
            return type("DelResult", (), {"deleted_count": 1})()
        return type("DelResult", (), {"deleted_count": 0})()

    async def delete_many(self, query):
        to_del = []
        for cid, doc in self.docs.items():
            match = True
            for k, v in query.items():
                if doc.get(k) != v: match = False; break
            if match: to_del.append(cid)
        for cid in to_del:
            del self.docs[cid]
        return type("DelResult", (), {"deleted_count": len(to_del)})()

class EnhancedMockDB:
    def __init__(self):
        self._collections = {}

    def __getattr__(self, name):
        if name not in self._collections:
            self._collections[name] = EnhancedMockCollection()
        return self._collections[name]

async def run_leads_verification_suite():
    print("\n" + "=" * 70)
    print("SOLARIX LEADS MANAGEMENT & ONBOARDING INTEGRATION VERIFICATION SUITE")
    print("=" * 70)

    db = EnhancedMockDB()
    server.db = db

    now = datetime.now(timezone.utc)
    today_str = now.strftime("%Y-%m-%d")
    tomorrow_str = (now + timedelta(days=1)).strftime("%Y-%m-%d")

    # Company setup
    comp_id = "comp_leads_test"
    db.companies.docs[comp_id] = {
        "id": comp_id,
        "company_name": "SunPower EPC Solutions",
        "plan_id": "growth",
        "subscription_status": "active",
        "subscription_started_at": now.isoformat(),
        "extra_days": 0,
    }

    # Users
    admin_user = {
        "id": "admin_usr",
        "name": "Arun Kumar (Admin)",
        "company_id": comp_id,
        "role": "Admin",
        "user_type": "owner",
        "permissions": {}
    }

    manager_user = {
        "id": "mgr_usr",
        "name": "Sunita Patil (Manager)",
        "company_id": comp_id,
        "role": "Manager",
        "permissions": {
            "leads": {"view": True, "create": True, "edit": True, "delete": True, "approve": True},
            "clients": {"view": True, "create": True, "edit": True, "delete": True}
        }
    }

    restricted_staff = {
        "id": "staff_usr",
        "name": "Karan Sharma (Staff)",
        "company_id": comp_id,
        "role": "Staff",
        "permissions": {
            "leads": {"view": True, "create": False, "edit": False, "delete": False, "approve": False}
        }
    }

    passed_count = 0

    # -------------------------------------------------------------------------
    # TEST 1: Leads module registered in REAL_APPLICATION_PAGES and Plan config
    # -------------------------------------------------------------------------
    lead_page = next((p for p in REAL_APPLICATION_PAGES if p["key"] == "leads"), None)
    assert lead_page is not None, "Test 1 failed: leads not in REAL_APPLICATION_PAGES"
    assert lead_page["section"] == "WORKSPACE", "Test 1 failed: leads not in WORKSPACE section"
    assert PLANS["starter"]["pages"].get("leads") is True, "Test 1 failed: starter missing leads"
    assert PLANS["growth"]["pages"].get("leads") is True, "Test 1 failed: growth missing leads"
    assert PLANS["pro"]["pages"].get("leads") is True, "Test 1 failed: pro missing leads"
    print("✓ Test 1 PASSED: Leads module registered in REAL_APPLICATION_PAGES and all Plan tiers")
    passed_count += 1

    # -------------------------------------------------------------------------
    # TEST 2: Create Lead (Tab 1 Basic Details + Tab 2 Schedule)
    # -------------------------------------------------------------------------
    lead_input = LeadIn(
        name="Vikramaditya Solar Mills",
        mobile="9876543210",
        alt_mobile="9876543211",
        address="Survey 104, Industrial Estate, Baramati",
        city="Baramati",
        system_kw=25.0,
        proposed_price=1250000.0,
        stage="New Lead",
        quotation_no="QUOT-2026-001",
        quotation_status="Pending",
        solar_meter_required="Yes",
        other_requirement="Need high-efficiency mono-perc panels and net meter",
        remarks="Client is ready for site visit next Tuesday",
        followup_date=today_str,
        followup_time="11:30",
        assigned_to=manager_user["id"],
        assigned_to_name=manager_user["name"],
        followup_type="Site Visit",
        other_note="Bring quotation printout",
    )

    created_lead = await create_lead(lead_input, user=admin_user)
    assert created_lead["id"], "Test 2 failed: missing id"
    assert created_lead["lead_no"].startswith("LEAD-"), f"Test 2 failed: invalid lead_no {created_lead['lead_no']}"
    assert created_lead["name"] == "Vikramaditya Solar Mills"
    assert created_lead["mobile"] == "9876543210"
    assert created_lead["system_kw"] == 25.0
    assert created_lead["proposed_price"] == 1250000.0
    assert created_lead["solar_meter_required"] == "Yes"
    assert created_lead["stage"] == "New Lead"
    assert created_lead["followup_date"] == today_str
    assert created_lead["assigned_to"] == manager_user["id"]
    print("✓ Test 2 PASSED: Create Lead saves all Tab 1 Basic & Tab 2 Schedule fields with sequential lead_no")
    passed_count += 1

    # -------------------------------------------------------------------------
    # TEST 3: Edit Lead (Must update existing record without creating duplicate)
    # -------------------------------------------------------------------------
    initial_count = await db.leads.count_documents({"company_id": comp_id})
    lead_id = created_lead["id"]

    edit_input = LeadIn(
        name="Vikramaditya Solar Mills Pvt Ltd",
        mobile="9876543210",
        alt_mobile="9876543211",
        address="Survey 104, Industrial Estate, Baramati, Maharashtra",
        city="Baramati",
        system_kw=30.0, # revised kW
        proposed_price=1450000.0, # revised price
        stage="Contacted",
        quotation_no="QUOT-2026-001-R1",
        quotation_status="Sent",
        solar_meter_required="Yes",
        other_requirement="Upgraded to 30 kW requirement",
        remarks="Client requested additional panels for north shed",
        followup_date=tomorrow_str,
        followup_time="15:00",
        assigned_to=manager_user["id"],
        assigned_to_name=manager_user["name"],
        followup_type="Call",
        other_note="Confirm revised commercial terms",
    )

    updated_lead = await update_lead(lead_id, edit_input, user=manager_user)
    final_count = await db.leads.count_documents({"company_id": comp_id})

    assert initial_count == final_count, "Test 3 failed: edit created duplicate lead record!"
    assert updated_lead["id"] == lead_id, "Test 3 failed: lead ID changed during edit"
    assert updated_lead["name"] == "Vikramaditya Solar Mills Pvt Ltd"
    assert updated_lead["system_kw"] == 30.0
    assert updated_lead["proposed_price"] == 1450000.0
    assert updated_lead["stage"] == "Contacted"
    assert updated_lead["followup_date"] == tomorrow_str
    print("✓ Test 3 PASSED: Open/Edit updates existing lead in place without creating duplicates")
    passed_count += 1

    # -------------------------------------------------------------------------
    # TEST 4: Schedule Presets (Today, Tomorrow, Custom, and No Follow-up / null)
    # -------------------------------------------------------------------------
    # Test No Follow-up (null, not "Infinity")
    edit_no_followup = LeadIn(
        name="Vikramaditya Solar Mills Pvt Ltd",
        mobile="9876543210",
        system_kw=30.0,
        proposed_price=1450000.0,
        stage="Contacted",
        followup_date=None, # no followup
        followup_time="",
    )
    lead_no_f = await update_lead(lead_id, edit_no_followup, user=admin_user)
    assert lead_no_f["followup_date"] is None or lead_no_f["followup_date"] == "", "Test 4 failed: followup_date not cleared"
    assert lead_no_f["followup_date"] != "Infinity", "Test 4 failed: stored 'Infinity' string"
    print("✓ Test 4 PASSED: Schedule presets correctly save dates and store null for 'No Follow-up'")
    passed_count += 1

    # -------------------------------------------------------------------------
    # TEST 5: Confirm Lead (Idempotent, Traceable, Prepares Onboarding)
    # -------------------------------------------------------------------------
    conf_res = await confirm_lead(lead_id, user=manager_user)
    assert conf_res["ok"] is True
    assert conf_res["already_converted"] is False
    c_lead = conf_res["lead"]
    assert c_lead["stage"] == "Confirmed"
    assert c_lead["status"] == "Confirmed / Onboarding"
    assert c_lead["confirmed_at"] != ""
    assert c_lead["confirmed_by"] == manager_user["id"]
    print("✓ Test 5 PASSED: Confirm Lead marks lead as Confirmed, preserves record, and tracks confirmation metadata")
    passed_count += 1

    # -------------------------------------------------------------------------
    # TEST 6: Client Creation from Confirmed Lead (Existing Onboarding Save Flow)
    # -------------------------------------------------------------------------
    # In ClientNew, the prefilled lead data is submitted to POST /clients with lead_id
    client_payload = ClientIn(
        lead_id=lead_id,
        full_name=c_lead["name"],
        mobile=c_lead["mobile"],
        address=c_lead["address"],
        city=c_lead["city"],
        system_kw=c_lead["system_kw"],
        contract_value=c_lead["proposed_price"],
        quotation_value=c_lead["proposed_price"],
        solar_meter_required=c_lead["solar_meter_required"],
        consumer_type="Commercial",
        status="Approved"
    )

    created_client = await create_client(client_payload, user=admin_user)
    assert created_client["id"], "Test 6 failed: client creation failed"
    assert created_client["sol_id"].startswith("SOL-"), "Test 6 failed: invalid sol_id"

    # Verify bidirectional link in DB
    refreshed_lead = await db.leads.find_one({"id": lead_id, "company_id": comp_id}, {"_id": 0})
    assert refreshed_lead["converted_client_id"] == created_client["id"], "Test 6 failed: lead not linked to client id"
    assert refreshed_lead["converted_sol_id"] == created_client["sol_id"], "Test 6 failed: lead not linked to sol_id"
    assert refreshed_lead["stage"] == "Confirmed"
    print("✓ Test 6 PASSED: Existing Client Onboarding saves client and links lead bidirectionally")
    passed_count += 1

    # -------------------------------------------------------------------------
    # TEST 7: Idempotency (Clicking Confirm Lead Twice Does NOT Duplicate Clients)
    # -------------------------------------------------------------------------
    clients_before = await db.clients.count_documents({"company_id": comp_id})
    conf_res_2 = await confirm_lead(lead_id, user=manager_user)
    clients_after = await db.clients.count_documents({"company_id": comp_id})

    assert conf_res_2["already_converted"] is True, "Test 7 failed: did not detect already-converted lead"
    assert conf_res_2["client_id"] == created_client["id"], "Test 7 failed: returned wrong client_id"
    assert clients_before == clients_after, "Test 7 failed: duplicate client was created!"
    print("✓ Test 7 PASSED: Confirm Lead is idempotent and reopens existing client without duplicates")
    passed_count += 1

    # -------------------------------------------------------------------------
    # TEST 8: Permission Enforcement (View, Create, Edit, Delete, Confirm)
    # -------------------------------------------------------------------------
    # Restricted staff has view=True, but create=False, edit=False, delete=False, approve=False
    ok_v, _, _ = await check_user_access(restricted_staff, "leads", "view", db=db)
    assert ok_v is True, "Test 8 failed: view access denied"

    ok_c, msg_c, code_c = await check_user_access(restricted_staff, "leads", "create", db=db)
    assert ok_c is False and code_c == 403, "Test 8 failed: unauthorized create allowed"
    assert "Missing permission: leads.create" in msg_c

    ok_e, msg_e, code_e = await check_user_access(restricted_staff, "leads", "edit", db=db)
    assert ok_e is False and code_e == 403, "Test 8 failed: unauthorized edit allowed"
    assert "Missing permission: leads.edit" in msg_e

    ok_d, msg_d, code_d = await check_user_access(restricted_staff, "leads", "delete", db=db)
    assert ok_d is False and code_d == 403, "Test 8 failed: unauthorized delete allowed"
    assert "Missing permission: leads.delete" in msg_d

    ok_a, msg_a, code_a = await check_user_access(restricted_staff, "leads", "approve", db=db)
    assert ok_a is False and code_a == 403, "Test 8 failed: unauthorized confirm allowed"
    assert "Missing permission: leads.approve" in msg_a
    print("✓ Test 8 PASSED: Backend strictly enforces leads permissions (View, Create, Edit, Delete, Confirm)")
    passed_count += 1

    # -------------------------------------------------------------------------
    # TEST 9: Expired Subscription Blocks Lead Write Operations
    # -------------------------------------------------------------------------
    # Set company subscription to expired
    db.companies.docs[comp_id]["subscription_status"] = "expired"
    _cache_invalidate_company(comp_id)

    # Manager has permissions, but company subscription is expired
    ok_exp_v, _, _ = await check_user_access(manager_user, "leads", "view", db=db)
    assert ok_exp_v is True, "Test 9 failed: expired account read blocked"

    ok_exp_w, msg_exp_w, code_exp_w = await check_user_access(manager_user, "leads", "create", db=db)
    assert ok_exp_w is False and code_exp_w == 403, "Test 9 failed: expired account write allowed"
    assert "SUBSCRIPTION_EXPIRED" in msg_exp_w
    print("✓ Test 9 PASSED: Expired subscription write-locks leads operations while preserving read access")
    passed_count += 1

    print("=" * 70)
    print(f"ALL {passed_count}/{passed_count} TEST CASES PASSED WITH 100% SUCCESS!")
    print("=" * 70 + "\n")

if __name__ == "__main__":
    asyncio.run(run_leads_verification_suite())
