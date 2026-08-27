from datetime import datetime, timezone, timedelta
import math
from typing import Dict, Any, Optional, List

def parse_iso(dt_str: Optional[str]) -> Optional[datetime]:
    if not dt_str:
        return None
    try:
        dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None

def get_current_period() -> str:
    """Returns YYYY-MM period identifier for monthly quota reset."""
    return datetime.now(timezone.utc).strftime("%Y-%m")

# Verified Real Solarix Application Pages
REAL_APPLICATION_PAGES = [
    {"key": "dashboard", "name": "Dashboard", "route": "/dashboard", "section": "WORKSPACE"},
    {"key": "leads", "name": "Leads", "route": "/leads", "section": "WORKSPACE"},
    {"key": "clients", "name": "Clients", "route": "/clients", "section": "WORKSPACE"},
    {"key": "project_execution", "name": "Project Execution", "route": "/projects", "section": "WORKSPACE"},
    {"key": "task_portal", "name": "Task Portal", "route": "/tasks", "section": "WORKSPACE"},
    {"key": "receivables", "name": "Receivables & Collection", "route": "/receivables", "section": "OPERATIONS"},
    {"key": "data_management", "name": "Data Management", "route": "/inventory", "section": "OPERATIONS"},
    {"key": "material_requests", "name": "Material Requests", "route": "/material", "section": "OPERATIONS"},
    {"key": "client_data", "name": "Client Data", "route": "/client-data", "section": "OPERATIONS"},
    {"key": "reports", "name": "Reports", "route": "/reports", "section": "OPERATIONS"},
    {"key": "sales_documents", "name": "Sales Documents", "route": "/sales-documents", "section": "DOCUMENTS"},
    {"key": "documents", "name": "Document Templates", "route": "/templates", "section": "DOCUMENTS"},
    {"key": "purchase_orders", "name": "Purchase Orders", "route": "/purchase-orders", "section": "DOCUMENTS"},
    {"key": "complaints", "name": "Complaint Center", "route": "/complaints", "section": "ADMINISTRATION"},
    {"key": "team", "name": "Team & Access", "route": "/team", "section": "ADMINISTRATION"},
    {"key": "settings", "name": "Company Details", "route": "/profile", "section": "ADMINISTRATION"},
    {"key": "activity_log", "name": "Activity Log", "route": "/activity", "section": "ADMINISTRATION"},
    {"key": "billing", "name": "Billing & Subscription", "route": "/billing", "section": "ADMINISTRATION"},
]

# Plan Definitions with Real Pages, Features, and Limits
PLANS: Dict[str, Dict[str, Any]] = {
    "starter": {
        "id": "starter",
        "name": "STARTER",
        "tagline": "Small installers & small EPC teams",
        "target_turnover": "For businesses with annual turnover up to ₹15 lakh",
        "monthly_price": 3999,
        "yearly_price": 29990,
        "max_users": 3,
        "max_clients": 100,
        "max_products": 1000,
        "storage_gb": 5,
        "monthly_documents": 500,
        "monthly_pdf_docx": 200,
        "monthly_exports": 50,
        "monthly_manual_imports": 100,
        "monthly_material_requests": 1000,
        "monthly_inventory_transactions": 2500,
        "monthly_api_requests": 0,
        "badge": None,
        "pages": {
            "dashboard": True,
            "leads": True,
            "clients": True,
            "project_execution": True,
            "task_portal": True,
            "receivables": False,
            "data_management": True,
            "material_requests": True,
            "client_data": True,
            "reports": True,
            "sales_documents": True,
            "documents": True,
            "purchase_orders": False,
            "complaints": True,
            "team": True,
            "settings": True,
            "activity_log": True,
            "billing": True,
        },
        "features": {
            "client_onboarding": True,
            "inward": True,
            "outward": True,
            "product_master": True,
            "balance_report": True,
            "history": True,
            "high_value_goods": False,
            "serial_tracking": False,
            "manual_import": True,
            "export": True,
            "inventory_intelligence": False,
            "material_requests": True,
            "invoices": False,
            "payments": False,
            "loan_finance": False,
            "expenses": False,
            "pdf_generation": True,
            "docx_generation": False,
            "discom_mapping": True,
            "quotations": True,
            "tax_invoices": True,
            "delivery_bills": True,
            "client_ledger": True,
            "ledger_export": True,
            "role_permissions": False,
            # Legacy compatibility aliases
            "core_crm": True,
            "project_management": True,
            "task_portal": True,
            "basic_inventory": True,
            "basic_documents": True,
            "basic_reports": True,
            "basic_notifications": True,
            "basic_import_export": True,
            "advanced_inventory": False,
            "procurement": False,
            "advanced_documents": False,
            "receivables": False,
            "advanced_permissions": False,
            "api_integrations": False,
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
        "monthly_manual_imports": 500,
        "monthly_material_requests": 5000,
        "monthly_inventory_transactions": 10000,
        "monthly_api_requests": 5000,
        "badge": "MOST POPULAR",
        "pages": {
            "dashboard": True,
            "leads": True,
            "clients": True,
            "project_execution": True,
            "task_portal": True,
            "receivables": True,
            "data_management": True,
            "material_requests": True,
            "client_data": True,
            "reports": True,
            "sales_documents": True,
            "documents": True,
            "purchase_orders": True,
            "complaints": True,
            "team": True,
            "settings": True,
            "activity_log": True,
            "billing": True,
        },
        "features": {
            "client_onboarding": True,
            "inward": True,
            "outward": True,
            "product_master": True,
            "balance_report": True,
            "history": True,
            "high_value_goods": True,
            "serial_tracking": True,
            "manual_import": True,
            "export": True,
            "inventory_intelligence": False,
            "material_requests": True,
            "invoices": True,
            "payments": True,
            "loan_finance": True,
            "expenses": True,
            "pdf_generation": True,
            "docx_generation": True,
            "discom_mapping": True,
            "quotations": True,
            "tax_invoices": True,
            "delivery_bills": True,
            "client_ledger": True,
            "ledger_export": True,
            "role_permissions": True,
            # Legacy compatibility aliases
            "core_crm": True,
            "project_management": True,
            "task_portal": True,
            "basic_inventory": True,
            "basic_documents": True,
            "basic_reports": True,
            "basic_notifications": True,
            "basic_import_export": True,
            "advanced_inventory": True,
            "procurement": True,
            "advanced_documents": True,
            "receivables": True,
            "advanced_permissions": True,
            "api_integrations": True,
        }
    },
    "pro": {
        "id": "pro",
        "name": "PRO",
        "tagline": "Established EPC companies",
        "target_turnover": "For businesses with annual turnover above ₹50 lakh",
        "monthly_price": 8999,
        "yearly_price": 79990,
        "max_users": 25,
        "max_clients": 2500,
        "max_products": 15000,
        "storage_gb": 100,
        "monthly_documents": 10000,
        "monthly_pdf_docx": 5000,
        "monthly_exports": 1000,
        "monthly_manual_imports": 2500,
        "monthly_material_requests": 20000,
        "monthly_inventory_transactions": 50000,
        "monthly_api_requests": 50000,
        "badge": "FULL POWER",
        "pages": {
            "dashboard": True,
            "leads": True,
            "clients": True,
            "project_execution": True,
            "task_portal": True,
            "receivables": True,
            "data_management": True,
            "material_requests": True,
            "client_data": True,
            "reports": True,
            "sales_documents": True,
            "documents": True,
            "purchase_orders": True,
            "complaints": True,
            "team": True,
            "settings": True,
            "activity_log": True,
            "billing": True,
        },
        "features": {
            "client_onboarding": True,
            "inward": True,
            "outward": True,
            "product_master": True,
            "balance_report": True,
            "history": True,
            "high_value_goods": True,
            "serial_tracking": True,
            "manual_import": True,
            "export": True,
            "inventory_intelligence": True,
            "material_requests": True,
            "invoices": True,
            "payments": True,
            "loan_finance": True,
            "expenses": True,
            "pdf_generation": True,
            "docx_generation": True,
            "discom_mapping": True,
            "quotations": True,
            "tax_invoices": True,
            "delivery_bills": True,
            "client_ledger": True,
            "ledger_export": True,
            "role_permissions": True,
            # Legacy compatibility aliases
            "core_crm": True,
            "project_management": True,
            "task_portal": True,
            "basic_inventory": True,
            "basic_documents": True,
            "basic_reports": True,
            "basic_notifications": True,
            "basic_import_export": True,
            "advanced_inventory": True,
            "procurement": True,
            "advanced_documents": True,
            "receivables": True,
            "advanced_permissions": True,
            "api_integrations": True,
        }
    }
}

def generate_plan_feature_bullets(plan: Dict[str, Any]) -> List[str]:
    """Dynamically generate human-readable feature bullet points based on active plan limits and features."""
    pid = plan.get("id", "starter").lower()
    bullets = []
    
    if pid == "starter":
        bullets.append(f"Up to {plan.get('max_users', 3)} users")
        bullets.append(f"Up to {plan.get('max_clients', 100):,} active clients/projects")
        bullets.append(f"{plan.get('storage_gb', 5)} GB secure document storage")
        bullets.append(f"{plan.get('monthly_pdf_docx', 200):,} PDF/DOCX generations/month")
        bullets.append(f"{plan.get('monthly_inventory_transactions', 2500):,} inventory transactions/month")
        bullets.append(f"{plan.get('monthly_material_requests', 1000):,} material requests/month")
        bullets.append("Core CRM & Client Onboarding")
        bullets.append("Project Management & Task Portal")
        bullets.append("Inward & Outward Stock Tracking")
        bullets.append("Basic Import / Export")
    elif pid == "growth":
        bullets.append("Everything in Starter, plus:")
        bullets.append(f"Up to {plan.get('max_users', 10)} users")
        bullets.append(f"Up to {plan.get('max_clients', 500):,} active clients/projects")
        bullets.append(f"{plan.get('storage_gb', 25)} GB secure document storage")
        bullets.append(f"{plan.get('monthly_pdf_docx', 1000):,} PDF/DOCX generations/month")
        bullets.append(f"{plan.get('monthly_inventory_transactions', 10000):,} inventory transactions/month")
        if plan.get("monthly_api_requests", 0) > 0:
            bullets.append(f"{plan.get('monthly_api_requests', 5000):,} API requests/month")
        feats = plan.get("features", {})
        if feats.get("advanced_inventory") or feats.get("high_value_goods"):
            bullets.append("Advanced Inventory & High Value Goods")
        if feats.get("serial_tracking") or feats.get("procurement"):
            bullets.append("Serial Number & Procurement Tracking")
        if feats.get("advanced_documents"):
            bullets.append("Advanced Documents & Sales Invoices")
        if feats.get("receivables") or feats.get("loan_finance"):
            bullets.append("Receivables & Loan Tracking")
        if feats.get("expenses") or feats.get("project_profitability"):
            bullets.append("Expenses & Project Profitability")
        if feats.get("advanced_reports") or feats.get("advanced_permissions"):
            bullets.append("Advanced Reports & Permissions")
    else:  # pro
        bullets.append("Everything in Growth, plus:")
        bullets.append(f"Up to {plan.get('max_users', 25)} users")
        bullets.append(f"Up to {plan.get('max_clients', 2500):,} active clients/projects")
        bullets.append(f"{plan.get('storage_gb', 100)} GB secure document storage")
        bullets.append(f"{plan.get('monthly_pdf_docx', 5000):,} PDF/DOCX generations/month")
        bullets.append(f"{plan.get('monthly_inventory_transactions', 50000):,} inventory transactions/month")
        if plan.get("monthly_api_requests", 0) > 0:
            bullets.append(f"{plan.get('monthly_api_requests', 50000):,} API requests/month")
        feats = plan.get("features", {})
        if feats.get("multi_branch"):
            bullets.append("Multi-branch Support")
        bullets.append("Advanced Financial & Operational Controls")
        if feats.get("advanced_permissions"):
            bullets.append("Advanced Role & Field Permissions")
        if feats.get("api_integrations"):
            bullets.append("API & External Integrations")
        if feats.get("custom_branding"):
            bullets.append("Custom Branding & Header Logo")
        if feats.get("dedicated_support") or feats.get("priority_support"):
            bullets.append("Dedicated Priority Account Manager")
            
    return bullets

_PLANS_CONFIG_CACHE: Dict[str, Dict[str, Any]] = {}

def set_cached_plan_config(plan_id: str, config: Dict[str, Any]) -> None:
    if plan_id and isinstance(config, dict):
        _PLANS_CONFIG_CACHE[plan_id.lower()] = dict(config)

def get_cached_plan_config(plan_id: str) -> Optional[Dict[str, Any]]:
    return _PLANS_CONFIG_CACHE.get(plan_id.lower()) if plan_id else None

def set_all_cached_plan_configs(configs: List[Dict[str, Any]]) -> None:
    if configs and isinstance(configs, list):
        for c in configs:
            if isinstance(c, dict) and c.get("id"):
                _PLANS_CONFIG_CACHE[c["id"].lower()] = dict(c)

def invalidate_plans_config_cache() -> None:
    _PLANS_CONFIG_CACHE.clear()

def get_plan_details(plan_id: str, db_override: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Get plan metadata or fallback to Starter, merging optional database overrides."""
    pid = (plan_id or "starter").lower()
    if pid not in PLANS:
        pid = "starter"
    plan = PLANS[pid].copy()
    
    effective_override = db_override if (db_override and isinstance(db_override, dict)) else _PLANS_CONFIG_CACHE.get(pid)
    
    if effective_override and isinstance(effective_override, dict):
        for k in [
            "name", "tagline", "target_turnover", "monthly_price", "yearly_price",
            "max_users", "max_clients", "max_products", "storage_gb",
            "monthly_documents", "monthly_pdf_docx", "monthly_exports",
            "monthly_manual_imports",
            "monthly_material_requests", "monthly_inventory_transactions",
            "monthly_api_requests", "badge"
        ]:
            if k in effective_override and effective_override[k] is not None:
                plan[k] = effective_override[k]
        if "pages" in effective_override and isinstance(effective_override["pages"], dict):
            plan["pages"] = {**plan.get("pages", {}), **effective_override["pages"]}
        if "features" in effective_override and isinstance(effective_override["features"], dict):
            plan["features"] = {**plan.get("features", {}), **effective_override["features"]}
    
    # Dynamic annual calculation
    normal_annual_equivalent = plan["monthly_price"] * 12
    annual_savings = normal_annual_equivalent - plan["yearly_price"]
    savings_percentage = round((annual_savings / normal_annual_equivalent) * 100) if normal_annual_equivalent > 0 else 0
    
    plan["normal_annual_equivalent"] = normal_annual_equivalent
    plan["annual_savings"] = annual_savings
    plan["savings_percentage"] = savings_percentage
    plan["feature_bullets"] = generate_plan_feature_bullets(plan)
    return plan

def get_all_plans(db_plans_list: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Dict[str, Any]]:
    """Return dictionary of all plans with calculated savings and database overrides."""
    db_map = {}
    if db_plans_list and isinstance(db_plans_list, list):
        db_map = {p["id"].lower(): p for p in db_plans_list if isinstance(p, dict) and "id" in p}
        set_all_cached_plan_configs(db_plans_list)
    return {pid: get_plan_details(pid, db_override=db_map.get(pid)) for pid in PLANS}

def check_page_access(target: Any, page_key: str, db_override: Optional[Dict[str, Any]] = None) -> bool:
    """
    Check if a real application page is accessible for a company or plan.
    Supports passing a company_doc dict or plan_id string or company_id string.
    Order of Evaluation:
    1. Explicit company-level page override in company_doc.get("page_access") or company_doc.get("pages")
    2. Assigned plan's pages configuration (Trial accounts use assigned plan, default 'starter')
    """
    company_doc = target if isinstance(target, dict) else {}
    if not company_doc and isinstance(target, str) and target.lower() not in ("starter", "growth", "pro"):
        try:
            from server import _cache_get_company
            cached_c = _cache_get_company(target)
            if cached_c and isinstance(cached_c, dict):
                company_doc = cached_c
        except Exception:
            pass

    # 1. Company level page access override
    custom_pages = company_doc.get("page_access") or company_doc.get("pages")
    if isinstance(custom_pages, dict) and page_key in custom_pages:
        return bool(custom_pages[page_key])
        
    # 2. Plan definition
    plan_id = (company_doc.get("plan_id") or company_doc.get("plan")) if company_doc else target
    plan_id = str(plan_id or "starter").lower()
    if plan_id not in ("starter", "growth", "pro"):
        plan_id = "starter"

    plan = get_plan_details(plan_id, db_override=db_override)
    return bool(plan.get("pages", {}).get(page_key, True))

def check_feature_access(target: Any, feature_key: str, is_trial: bool = False, db_override: Optional[Dict[str, Any]] = None) -> bool:
    """
    Check if a feature is accessible for a company or plan.
    Supports passing a company_doc dict or plan_id string or company_id string.
    Order of Evaluation:
    1. Temporary feature entitlement with expiry date
    2. Explicit workspace feature entitlement overrides
    3. Plan definition features matrix for the company's assigned plan (Trial uses assigned plan, default 'starter')
    """
    company_doc = target if isinstance(target, dict) else {}
    if not company_doc and isinstance(target, str) and target.lower() not in ("starter", "growth", "pro"):
        try:
            from server import _cache_get_company
            cached_c = _cache_get_company(target)
            if cached_c and isinstance(cached_c, dict):
                company_doc = cached_c
        except Exception:
            pass

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

    # 3. Fallback to assigned plan definition (Trial accounts use assigned plan, default 'starter')
    plan_id = (company_doc.get("plan_id") or company_doc.get("plan")) if company_doc else target
    plan_id = str(plan_id or "starter").lower()
    if plan_id not in ("starter", "growth", "pro"):
        plan_id = "starter"

    plan = get_plan_details(plan_id, db_override=db_override)
    return bool(plan.get("features", {}).get(feature_key, False))

def get_plan_limits(plan_id: str, is_trial: bool = False, db_override: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Return complete EPC resource limits dictionary for the assigned plan (Trial accounts strictly use their plan's limits)."""
    pid = (plan_id or "starter").lower()
    if pid not in ("starter", "growth", "pro"):
        pid = "starter"
    plan = get_plan_details(pid, db_override=db_override)
    limits = {
        "max_users": int(plan.get("max_users", 3)),
        "max_clients": int(plan.get("max_clients", 100)),
        "max_products": int(plan.get("max_products", 1000)),
        "storage_gb": int(plan.get("storage_gb", 5)),
        "storage_bytes": int(plan.get("storage_gb", 5)) * 1024 * 1024 * 1024,
        "monthly_documents": int(plan.get("monthly_documents", 500)),
        "monthly_pdf_docx": int(plan.get("monthly_pdf_docx", 200)),
        "monthly_exports": int(plan.get("monthly_exports", 50)),
        "monthly_manual_imports": int(plan.get("monthly_manual_imports", 100)),
        "monthly_material_requests": int(plan.get("monthly_material_requests", 1000)),
        "monthly_inventory_transactions": int(plan.get("monthly_inventory_transactions", 2500)),
        "monthly_api_requests": int(plan.get("monthly_api_requests", 0)),
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
    monthly_manual_imports = int(counter_doc.get("manual_imports") or counter_doc.get("monthly_manual_imports") or 0)
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
        "monthly_manual_imports": monthly_manual_imports,
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
    usage = await get_company_usage(company_id, db=db)

    plan_id = (company.get("plan_id") or "starter").lower()
    if plan_id not in ("starter", "growth", "pro"):
        plan_id = "starter"

    db_plan_override = await db.plans_config.find_one({"id": plan_id}, {"_id": 0})
    limits = get_plan_limits(plan_id, is_trial=False, db_override=db_plan_override)

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
        "export": ("monthly_exports", "report/data exports this month", usage.get("monthly_exports", 0)),
        "manual_imports": ("monthly_manual_imports", "manual bulk imports this month", usage.get("monthly_manual_imports", 0)),
        "monthly_manual_imports": ("monthly_manual_imports", "manual bulk imports this month", usage.get("monthly_manual_imports", 0)),
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

check_resource_limit = check_plan_limit

async def enforce_resource_limit(company_id: str, resource_key: str, increment: int = 1, db=None) -> None:
    """
    Enforce quota check. Raises HTTPException(403) with PLAN_LIMIT_REACHED if limit exceeded.
    """
    from fastapi import HTTPException
    check = await check_resource_limit(company_id, resource_key, increment=increment, db=db)
    if not check["allowed"]:
        raise HTTPException(
            status_code=403,
            detail=check["message"] or f"PLAN_LIMIT_REACHED: You have reached your {check['plan_id'].upper()} plan limit for this resource. Please upgrade your plan."
        )

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
        "export": "exports",
        "manual_imports": "manual_imports",
        "monthly_manual_imports": "manual_imports",
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
            "features": PLANS["starter"]["features"],
            "limits": get_plan_limits("starter", is_trial=False)
        }

    now = datetime.now(timezone.utc)
    now_iso_str = now.isoformat()

    status = (company.get("subscription_status") or "trialing").lower()
    plan_id = str(company.get("plan_id") or company.get("plan") or "starter").lower()
    if plan_id not in ("starter", "growth", "pro"):
        plan_id = "starter"

    # Trial dates
    trial_start_str = company.get("trial_started_at") or company.get("created_at") or now_iso_str
    trial_start = parse_iso(trial_start_str) or now
    trial_end = parse_iso(company.get("trial_ends_at"))
    if not trial_end:
        extra_d = int(company.get("extra_days", 0) or 0)
        trial_end = trial_start + timedelta(days=15 + extra_d)

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

    db_plan_override = await db.plans_config.find_one({"id": plan_id}, {"_id": 0})
    plan_info = get_plan_details(plan_id, db_override=db_plan_override)
    can_write = (status in ("active", "trialing")) and not is_expired

    plan_name = plan_info["name"]
    limits = get_plan_limits(plan_id, is_trial=False, db_override=db_plan_override)

    # Resolved pages (incorporating company-specific overrides)
    resolved_pages = dict(plan_info.get("pages", {}))
    custom_pages = company.get("page_access") or company.get("pages") or {}
    if isinstance(custom_pages, dict):
        resolved_pages.update(custom_pages)

    # Resolved features (incorporating temporary & explicit overrides)
    resolved_features = dict(plan_info.get("features", {}))
    custom_entitlements = company.get("feature_entitlements") or {}
    if isinstance(custom_entitlements, dict):
        resolved_features.update(custom_entitlements)
    temp_features = company.get("temporary_features") or {}
    if isinstance(temp_features, dict):
        for fk, exp_val in temp_features.items():
            if isinstance(exp_val, str) and exp_val > now_iso_str:
                resolved_features[fk] = True

    return {
        "company_id": company_id,
        "company_name": company.get("company_name"),
        "plan_id": plan_id,
        "plan_name": plan_name,
        "subscription_status": status,
        "billing_cycle": company.get("billing_cycle", "monthly"),
        "is_trial": is_trial,
        "is_active": (status in ("active", "trialing")) and not is_expired,
        "is_expired": is_expired,
        "trial_started_at": trial_start.isoformat(),
        "trial_ends_at": trial_end.isoformat(),
        "subscription_started_at": sub_start.isoformat() if sub_start else None,
        "subscription_expires_at": sub_end.isoformat() if sub_end else None,
        "effective_expiry_date": sub_end.isoformat() if sub_end else (trial_end.isoformat() if trial_end else None),
        "days_remaining": days_remaining,
        "is_free": bool(company.get("is_free", False)),
        "access_type": "free_grant" if company.get("is_free") else ("trial" if is_trial else "paid"),
        "extra_days": int(company.get("extra_days", 0) or 0),
        "free_grant_days": int(company.get("free_grant_days", 0) or 0),
        "free_grant_started_at": company.get("free_grant_started_at"),
        "can_write": can_write,
        "razorpay_subscription_id": company.get("razorpay_subscription_id"),
        "cancel_at_period_end": bool(company.get("cancel_at_period_end", False)),
        "page_access": resolved_pages,
        "pages": resolved_pages,
        "feature_entitlements": company.get("feature_entitlements", {}),
        "temporary_features": company.get("temporary_features", {}),
        "features": resolved_features,
        "limits": limits
    }


