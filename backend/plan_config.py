from typing import Dict, Any, Optional, List

# Plan Definitions
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
            "api_integrations": False,
            "custom_branding": False,
            "dedicated_support": False,
        }
    },
    "pro": {
        "id": "pro",
        "name": "PRO",
        "tagline": "Established EPC companies",
        "target_turnover": "For businesses with annual turnover above ₹50 lakh",
        "monthly_price": 9999,
        "yearly_price": 99990,
        "max_users": 25,
        "max_clients": 9999999, # Unlimited
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
        for k in ["name", "tagline", "target_turnover", "monthly_price", "yearly_price", "max_users", "max_clients", "badge"]:
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
    from datetime import datetime, timezone
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

def get_plan_limits(plan_id: str, is_trial: bool = False, db_override: Optional[Dict[str, Any]] = None) -> Dict[str, int]:
    """Return max users and max clients allowed."""
    plan = get_plan_details(plan_id, db_override=db_override)
    if is_trial:
        # Full access during trial if not explicitly capped by plan override
        return {"max_users": max(25, plan["max_users"]), "max_clients": max(9999999, plan["max_clients"])}
    return {
        "max_users": plan["max_users"],
        "max_clients": plan["max_clients"]
    }
