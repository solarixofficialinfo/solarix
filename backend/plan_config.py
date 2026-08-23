from datetime import datetime, timezone, timedelta
import math
from typing import Dict, Any, Optional, List

def parse_iso(dt_str: Optional[str]) -> Optional[datetime]:
    if not dt_str:
        return None
    try:
        dt = datetime.fromisoformat(str(dt_str).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None

def get_current_period() -> str:
    """Returns YYYY-MM period identifier for monthly quota reset."""
    return datetime.now(timezone.utc).strftime("%Y-%m")

# Plan Definitions with Real Solar EPC Limits
PLANS: Dict[str, Dict[str, Any]] = {
    "starter": {
        "id": "starter",
        "name": "STARTER",
        "tagline": "Small installers & small EPC teams",
        "target_turnover": "For businesses with annual turnover up to ₹15 lakh",
        "monthly_price": 2999,
        "yearly_price": 29990,
        "max_users": 3,
        "max_clients": 100,
        "max_products": 1000,
        "storage_gb": 5,
        "monthly_documents": 500,
        "monthly_pdf_docx": 200,
        "monthly_exports": 50,
        "monthly_material_requests": 1000,
        "monthly_inventory_transactions": 2500,
        "monthly_api_requests": 0,
        "badge": None,
        "features": {
            "core_crm": True,
            "client_onboarding": True,
            "project_management": True,
            "task_portal": True,
            "material_requests": True,
            "basic_inventory": True,
            "inward": True,
            "outward": True,
            "product_master": True,
            "balance_report": True,
            "history": True,
            "basic_documents": True,
            "basic_reports": True,
            "basic_notifications": True,
            "basic_import_export": True,
            "advanced_inventory": False,
            "high_value_goods": False,
            "serial_tracking": False,
            "procurement": False,
            "advanced_documents": False,
            "receivables": False,
            "loan_finance": False,
            "expenses": False,
            "project_profitability": False,
            "advanced_reports": False,
            "advanced_permissions": False,
            "priority_support": False,
            "multi_branch": False,
            "api_integrations": False,
            "custom_branding": False,
            "dedicated_support": False,
        }
    },
    "growth": {
        "id": "growth",
        "name": "GROWTH",
        "tagline": "Growing solar EPC companies",
        "target_turnover": "For businesses with annual turnover above ₹15 lakh and up to ₹50 lakh",
        "monthly_price": 5999,
        "yearly_price": 59990,
        "max_users": 10,
        "max_clients": 500,
        "max_products": 5000,
        "storage_gb": 25,
        "monthly_documents": 2000,
        "monthly_pdf_docx": 1000,
        "monthly_exports": 250,
        "monthly_material_requests": 5000,
        "monthly_inventory_transactions": 10000,
        "monthly_api_requests": 5000,
        "badge": "MOST POPULAR",
        "features": {
            "core_crm": True,
            "client_onboarding": True,
            "project_management": True,
            "task_portal": True,
            "material_requests": True,
            "basic_inventory": True,
            "inward": True,
            "outward": True,
            "product_master": True,
            "balance_report": True,
            "history": True,
            "basic_documents": True,
            "basic_reports": True,
            "basic_notifications": True,
            "basic_import_export": True,
            "advanced_inventory": True,
            "high_value_goods": True,
            "serial_tracking": True,
            "procurement": True,
            "advanced_documents": True,
            "receivables": True,
            "loan_finance": True,
            "expenses": True,
            "project_profitability": True,
            "advanced_reports": True,
            "advanced_permissions": True,
            "priority_support": True,
            "multi_branch": False,
            "api_integrations": True,
            "custom_branding": False,
            "dedicated_support": False,
        }
    },
    "pro": {
        "id": "pro",
        "name": "PRO",
        "tagline": "Established EPC companies",
        "target_turnover": "For businesses with annual turnover above ₹50 lakh",
        "monthly_price": 3499,
        "yearly_price": 34990,
        "max_users": 25,
        "max_clients": 2500,
        "max_products": 15000,
        "storage_gb": 100,
        "monthly_documents": 10000,
        "monthly_pdf_docx": 5000,
        "monthly_exports": 1000,
        "monthly_material_requests": 20000,
        "monthly_inventory_transactions": 50000,
        "monthly_api_requests": 50000,
        "badge": "FULL POWER",
        "features": {
            "core_crm": True,
            "client_onboarding": True,
            "project_management": True,
            "task_portal": True,
            "material_requests": True,
            "basic_inventory": True,
            "inward": True,
            "outward": True,
            "product_master": True,
            "balance_report": True,
            "history": True,
            "basic_documents": True,
            "basic_reports": True,
            "basic_notifications": True,
            "basic_import_export": True,
            "advanced_inventory": True,
            "high_value_goods": True,
            "serial_tracking": True,
            "procurement": True,
            "advanced_documents": True,
            "receivables": True,
            "loan_finance": True,
            "expenses": True,
            "project_profitability": True,
            "advanced_reports": True,
            "advanced_permissions": True,
            "priority_support": True,
            "multi_branch": True,
            "api_integrations": True,
            "custom_branding": True,
            "dedicated_support": True,
        }
    }
}

def get_plan_details(plan_id: str, db_override: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Get plan metadata or fallback to Starter, merging optional database overrides."""
    pid = (plan_id or "starter").lower()
    if pid not in PLANS:
        pid = "starter"
    plan = PLANS[pid].copy()
    
    if db_override and isinstance(db_override, dict):
        for k in [
            "name", "tagline", "target_turnover", "monthly_price", "yearly_price",
            "max_users", "max_clients", "max_products", "storage_gb",
            "monthly_documents", "monthly_pdf_docx", "monthly_exports",
            "monthly_material_requests", "monthly_inventory_transactions",
            "monthly_api_requests", "badge"
        ]:
            if k in db_override and db_override[k] is not None:
                plan[k] = db_override[k]
        if "features" in db_override and isinstance(db_override["features"], dict):
            plan["features"] = {**plan.get("features", {}), **db_override["features"]}
    
    # Dynamic annual calculation
    normal_annual_equivalent = plan["monthly_price"] * 12
    annual_savings = normal_annual_equivalent - plan["yearly_price"]
    savings_percentage = round((annual_savings / normal_annual_equivalent) * 100) if normal_annual_equivalent > 0 else 0
    
    plan["normal_annual_equivalent"] = normal_annual_equivalent
    plan["annual_savings"] = annual_savings
    plan["savings_percentage"] = savings_percentage
    return plan

def get_all_plans(db_plans_list: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Dict[str, Any]]:
    """Return dictionary of all plans with calculated savings and database overrides."""
    db_map = {}
    if db_plans_list and isinstance(db_plans_list, list):
        db_map = {p["id"]: p for p in db_plans_list if isinstance(p, dict) and "id" in p}
    return {pid: get_plan_details(pid, db_override=db_map.get(pid)) for pid in PLANS}

def check_feature_access(target: Any, feature_key: str, is_trial: bool = False, db_override: Optional[Dict[str, Any]] = None) -> bool:
    """
    Check if a feature is accessible for a company or plan.
    Supports passing a company_doc dict or plan_id string.
    Order of Evaluation:
    1. Temporary feature entitlement with expiry date
    2. Explicit workspace feature entitlement overrides
    3. Active trial status
    4. Plan definition features matrix
    """
    company_doc = target if isinstance(target, dict) else {}
    plan_id = target if isinstance(target, str) else company_doc.get("plan_id", "starter")

    # 1. Temporary feature entitlement with expiry date check
    temp_features = company_doc.get("temporary_features")
    if isinstance(temp_features, dict) and feature_key in temp_features:
        expiry_val = temp_features[feature_key]
        if isinstance(expiry_val, str) and expiry_val:
            try:
                now_str = datetime.now(timezone.utc).isoformat()
                if expiry_val > now_str:
                    return True
            except Exception:
                pass
        elif isinstance(expiry_val, bool):
            return expiry_val

    # 2. Explicit workspace entitlement override takes priority
    entitlements = company_doc.get("feature_entitlements")
    if isinstance(entitlements, dict) and feature_key in entitlements:
        return bool(entitlements[feature_key])

    # 3. Trial status grants full access
    if is_trial or company_doc.get("subscription_status") == "trialing":
        return True

    # 4. Fallback to plan definition
    plan = get_plan_details(plan_id, db_override=db_override)
    return bool(plan.get("features", {}).get(feature_key, False))

def get_plan_limits(plan_id: str, is_trial: bool = False, db_override: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Return complete EPC resource limits dictionary for plan."""
    plan = get_plan_details(plan_id, db_override=db_override)
    limits = {
        "max_users": plan.get("max_users", 3),
        "max_clients": plan.get("max_clients", 100),
        "max_products": plan.get("max_products", 1000),
        "storage_gb": plan.get("storage_gb", 5),
        "storage_bytes": plan.get("storage_gb", 5) * 1024 * 1024 * 1024,
        "monthly_documents": plan.get("monthly_documents", 500),
        "monthly_pdf_docx": plan.get("monthly_pdf_docx", 200),
        "monthly_exports": plan.get("monthly_exports", 50),
        "monthly_material_requests": plan.get("monthly_material_requests", 1000),
        "monthly_inventory_transactions": plan.get("monthly_inventory_transactions", 2500),
        "monthly_api_requests": plan.get("monthly_api_requests", 0),
    }
    if is_trial:
        # Full Pro limits during trial
        pro_plan = get_plan_details("pro", db_override=db_override)
        return {
            "max_users": pro_plan.get("max_users", 25),
            "max_clients": pro_plan.get("max_clients", 2500),
            "max_products": pro_plan.get("max_products", 15000),
            "storage_gb": pro_plan.get("storage_gb", 100),
            "storage_bytes": pro_plan.get("storage_gb", 100) * 1024 * 1024 * 1024,
            "monthly_documents": pro_plan.get("monthly_documents", 10000),
            "monthly_pdf_docx": pro_plan.get("monthly_pdf_docx", 5000),
            "monthly_exports": pro_plan.get("monthly_exports", 1000),
            "monthly_material_requests": pro_plan.get("monthly_material_requests", 20000),
            "monthly_inventory_transactions": pro_plan.get("monthly_inventory_transactions", 50000),
            "monthly_api_requests": pro_plan.get("monthly_api_requests", 50000),
        }
    return limits

async def get_company_usage(company_id: str, db=None) -> Dict[str, Any]:
    """
    Calculate and return complete usage metrics for a company:
    - State counts: Active Users, Active Clients, Products, Storage Bytes
    - Monthly counters: Uploaded Docs, PDF/DOCX Generations, Exports, Material Requests, Inventory Transactions, API Calls
    """
    if db is None:
        from server import db as app_db
        db = app_db

    period = get_current_period()

    # 1. State Counts (Non-resetting)
    active_users = await db.users.count_documents({
        "company_id": company_id,
        "status": "Active"
    })

    active_clients = await db.clients.count_documents({
        "company_id": company_id,
        "status": {"$nin": ["Archived", "Deleted", "archived", "deleted"]}
    })

    products_count = await db.products.count_documents({
        "company_id": company_id,
        "is_deleted": {"$ne": True}
    })

    files_cursor = db.files.find(
        {"company_id": company_id, "is_deleted": {"$ne": True}},
        {"size": 1}
    )
    all_files = await files_cursor.to_list(100000)
    storage_bytes = sum(int(f.get("size") or 0) for f in all_files)
    storage_gb = round(storage_bytes / (1024 ** 3), 3)

    # 2. Monthly Resetting Counters from usage_counters collection
    counter_doc = await db.usage_counters.find_one({
        "company_id": company_id,
        "period": period
    }) or {}

    monthly_documents = int(counter_doc.get("uploaded_documents") or 0)
    monthly_pdf_docx = int(counter_doc.get("document_generations") or 0)
    monthly_exports = int(counter_doc.get("exports") or 0)
    monthly_material_requests = int(counter_doc.get("material_requests") or 0)
    monthly_inventory_transactions = int(counter_doc.get("inventory_transactions") or 0)
    monthly_api_requests = int(counter_doc.get("api_requests") or 0)

    return {
        "company_id": company_id,
        "period": period,
        "active_users": active_users,
        "active_clients": active_clients,
        "products": products_count,
        "storage_bytes": storage_bytes,
        "storage_gb": storage_gb,
        "monthly_documents": monthly_documents,
        "monthly_pdf_docx": monthly_pdf_docx,
        "monthly_exports": monthly_exports,
        "monthly_material_requests": monthly_material_requests,
        "monthly_inventory_transactions": monthly_inventory_transactions,
        "monthly_api_requests": monthly_api_requests,
    }

async def check_plan_limit(company_id: str, resource_key: str, increment: int = 1, db=None) -> Dict[str, Any]:
    """
    Authoritative backend check for a specific plan limit.
    Returns {
        'allowed': bool,
        'current_usage': float,
        'limit': float,
        'warning_level': None | 'warning' (80%) | 'danger' (90%) | 'exhausted' (100%),
        'percentage': int,
        'message': str,
        'plan_id': str,
        'resource_key': str
    }
    """
    if db is None:
        from server import db as app_db
        db = app_db

    company = await db.companies.find_one({"id": company_id}) or {}
    plan_id = (company.get("plan_id") or "starter").lower()
    is_trial = company.get("subscription_status") == "trialing"

    db_plan_override = await db.plans_config.find_one({"id": plan_id}, {"_id": 0})
    limits = get_plan_limits(plan_id, is_trial=is_trial, db_override=db_plan_override)
    usage = await get_company_usage(company_id, db=db)

    RESOURCE_MAP = {
        "active_clients": ("max_clients", "active clients/projects", usage.get("active_clients", 0)),
        "clients": ("max_clients", "active clients/projects", usage.get("active_clients", 0)),
        "users": ("max_users", "active team members", usage.get("active_users", 0)),
        "products": ("max_products", "product master items", usage.get("products", 0)),
        "storage": ("storage_bytes", "storage capacity", usage.get("storage_bytes", 0)),
        "storage_bytes": ("storage_bytes", "storage capacity", usage.get("storage_bytes", 0)),
        "uploaded_documents": ("monthly_documents", "uploaded documents this month", usage.get("monthly_documents", 0)),
        "document_generations": ("monthly_pdf_docx", "PDF/DOCX generations this month", usage.get("monthly_pdf_docx", 0)),
        "pdf_docx": ("monthly_pdf_docx", "PDF/DOCX generations this month", usage.get("monthly_pdf_docx", 0)),
        "exports": ("monthly_exports", "report/data exports this month", usage.get("monthly_exports", 0)),
        "material_requests": ("monthly_material_requests", "material requests this month", usage.get("monthly_material_requests", 0)),
        "inventory_transactions": ("monthly_inventory_transactions", "inventory transactions this month", usage.get("monthly_inventory_transactions", 0)),
        "api_requests": ("monthly_api_requests", "API requests this month", usage.get("monthly_api_requests", 0)),
    }

    if resource_key not in RESOURCE_MAP:
        return {"allowed": True, "current_usage": 0, "limit": 999999, "warning_level": None, "percentage": 0, "message": "", "plan_id": plan_id, "resource_key": resource_key}

    limit_field, label, curr_val = RESOURCE_MAP[resource_key]
    max_val = limits.get(limit_field, 999999)

    new_val = curr_val + increment
    pct = int((new_val / max_val) * 100) if max_val > 0 else 100

    warning_level = None
    if pct >= 100:
        warning_level = "exhausted"
    elif pct >= 90:
        warning_level = "danger"
    elif pct >= 80:
        warning_level = "warning"

    allowed = new_val <= max_val
    if max_val <= 0:
        allowed = False
        warning_level = "exhausted"

    display_limit = max_val
    display_curr = curr_val
    if resource_key in ("storage", "storage_bytes"):
        display_limit = f"{limits.get('storage_gb', 5)} GB"
        display_curr = f"{round(curr_val / (1024**3), 2)} GB"

    msg = ""
    if not allowed:
        msg = f"PLAN_LIMIT_REACHED: You've reached your {plan_id.upper()} plan limit of {display_limit} {label}. Upgrade your plan to add more."
    elif warning_level == "danger":
        msg = f"PLAN_LIMIT_WARNING: You are using {pct}% of your {plan_id.upper()} plan limit for {label} ({display_curr} / {display_limit})."
    elif warning_level == "warning":
        msg = f"PLAN_LIMIT_NOTICE: You are using {pct}% of your {plan_id.upper()} plan limit for {label}."

    return {
        "allowed": allowed,
        "current_usage": curr_val,
        "limit": max_val,
        "percentage": min(100, pct),
        "warning_level": warning_level,
        "message": msg,
        "plan_id": plan_id,
        "resource_key": resource_key
    }

async def increment_usage(company_id: str, resource_key: str, amount: int = 1, db=None) -> None:
    """Atomically increment monthly usage counter for current period."""
    if db is None:
        from server import db as app_db
        db = app_db

    period = get_current_period()
    COUNTER_FIELD_MAP = {
        "uploaded_documents": "uploaded_documents",
        "document_generations": "document_generations",
        "pdf_docx": "document_generations",
        "exports": "exports",
        "material_requests": "material_requests",
        "inventory_transactions": "inventory_transactions",
        "api_requests": "api_requests",
    }
    field = COUNTER_FIELD_MAP.get(resource_key, resource_key)
    try:
        await db.usage_counters.update_one(
            {"company_id": company_id, "period": period},
            {"$inc": {field: amount}, "$setOnInsert": {"created_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True
        )
    except Exception as e:
        import logging
        logging.getLogger("solarix_usage").warning(f"Failed to increment usage for {company_id} - {resource_key}: {e}")

async def get_company_entitlement(company_id: str, db=None) -> Dict[str, Any]:
    """
    Authoritative centralized subscription & entitlement calculation service.
    Calculates trial countdown, expiration, plan limits, and write permission.
    Idempotently transitions expired trials/plans to expired status in DB.
    """
    if db is None:
        from server import db as app_db
        db = app_db

    company = await db.companies.find_one({"id": company_id})
    if not company:
        return {
            "company_id": company_id,
            "company_name": "Unknown",
            "plan_id": "starter",
            "plan_name": "STARTER",
            "subscription_status": "expired",
            "is_trial": False,
            "is_active": False,
            "is_expired": True,
            "days_remaining": 0,
            "can_write": False,
            "limits": get_plan_limits("starter", is_trial=False)
        }

    now = datetime.now(timezone.utc)
    now_iso_str = now.isoformat()

    status = (company.get("subscription_status") or company.get("plan") or "trialing").lower()
    plan_id = (company.get("plan_id") or "starter").lower()

    # Trial dates
    trial_start_str = company.get("trial_started_at") or company.get("created_at") or now_iso_str
    trial_start = parse_iso(trial_start_str) or now
    trial_end = parse_iso(company.get("trial_ends_at"))
    if not trial_end:
        trial_end = trial_start + timedelta(days=15)

    # Subscription dates
    sub_start = parse_iso(company.get("subscription_started_at"))
    sub_end = parse_iso(company.get("subscription_expires_at"))

    is_trial = False
    is_expired = False
    days_remaining = 0

    if status == "trialing":
        is_trial = True
        if now > trial_end:
            status = "expired"
            is_trial = False
            is_expired = True
            days_remaining = 0
            # Persist expired state in database
            await db.companies.update_one(
                {"id": company_id},
                {"$set": {"subscription_status": "expired", "updated_at": now_iso_str}}
            )
            try:
                from server import _cache_invalidate_company
                _cache_invalidate_company(company_id)
            except Exception:
                pass
        else:
            diff = trial_end - now
            sec_rem = diff.total_seconds()
            days_remaining = max(1, math.ceil(sec_rem / 86400)) if sec_rem > 0 else 0

    elif status == "active":
        if sub_end:
            if now > sub_end:
                status = "expired"
                is_expired = True
                days_remaining = 0
                await db.companies.update_one(
                    {"id": company_id},
                    {"$set": {"subscription_status": "expired", "updated_at": now_iso_str}}
                )
                try:
                    from server import _cache_invalidate_company
                    _cache_invalidate_company(company_id)
                except Exception:
                    pass
            else:
                diff = sub_end - now
                sec_rem = diff.total_seconds()
                days_remaining = max(1, math.ceil(sec_rem / 86400)) if sec_rem > 0 else 0
        else:
            # Active plan with auto-renewal / open-ended period
            days_remaining = 365

    elif status in ("expired", "cancelled", "past_due", "suspended"):
        is_expired = (status == "expired")
        days_remaining = 0

    plan_info = get_plan_details(plan_id)
    can_write = (status in ("active", "trialing"))

    db_plan_override = await db.plans_config.find_one({"id": plan_id}, {"_id": 0})
    limits = get_plan_limits(plan_id, is_trial=is_trial, db_override=db_plan_override)

    return {
        "company_id": company_id,
        "company_name": company.get("company_name"),
        "plan_id": plan_id,
        "plan_name": plan_info["name"],
        "subscription_status": status,
        "billing_cycle": company.get("billing_cycle", "monthly"),
        "is_trial": is_trial,
        "is_active": (status in ("active", "trialing")),
        "is_expired": is_expired,
        "trial_started_at": trial_start.isoformat(),
        "trial_ends_at": trial_end.isoformat(),
        "subscription_started_at": sub_start.isoformat() if sub_start else None,
        "subscription_expires_at": sub_end.isoformat() if sub_end else None,
        "days_remaining": days_remaining,
        "can_write": can_write,
        "razorpay_subscription_id": company.get("razorpay_subscription_id"),
        "cancel_at_period_end": bool(company.get("cancel_at_period_end", False)),
        "feature_entitlements": company.get("feature_entitlements", {}),
        "temporary_features": company.get("temporary_features", {}),
        "limits": limits
    }


