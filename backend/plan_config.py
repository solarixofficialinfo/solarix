"""
SOLRIX WORK — Centralized Plan & Pricing Configuration
"""
from typing import Dict, Any, Optional

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

def get_plan_details(plan_id: str) -> Dict[str, Any]:
    """Get plan metadata or fallback to Starter."""
    pid = (plan_id or "starter").lower()
    if pid not in PLANS:
        pid = "starter"
    plan = PLANS[pid].copy()
    
    # Dynamic annual calculation
    normal_annual_equivalent = plan["monthly_price"] * 12
    annual_savings = normal_annual_equivalent - plan["yearly_price"]
    savings_percentage = round((annual_savings / normal_annual_equivalent) * 100) if normal_annual_equivalent > 0 else 0
    
    plan["normal_annual_equivalent"] = normal_annual_equivalent
    plan["annual_savings"] = annual_savings
    plan["savings_percentage"] = savings_percentage
    return plan

def get_all_plans() -> Dict[str, Dict[str, Any]]:
    """Return dictionary of all plans with calculated savings."""
    return {pid: get_plan_details(pid) for pid in PLANS}

def check_feature_access(target: Any, feature_key: str, is_trial: bool = False) -> bool:
    """
    Check if a feature is accessible for a company or plan.
    Supports passing a company_doc dict or plan_id string.
    Explicit workspace feature entitlement overrides in company_doc.get("feature_entitlements", {}) take precedence.
    """
    company_doc = target if isinstance(target, dict) else {}
    plan_id = target if isinstance(target, str) else company_doc.get("plan_id", "starter")

    # 1. Explicit workspace entitlement override takes priority
    entitlements = company_doc.get("feature_entitlements")
    if isinstance(entitlements, dict) and feature_key in entitlements:
        return bool(entitlements[feature_key])

    # 2. Trial status grants access
    if is_trial or company_doc.get("subscription_status") == "trialing":
        return True

    # 3. Fallback to plan definition
    plan = get_plan_details(plan_id)
    return bool(plan.get("features", {}).get(feature_key, False))

def get_plan_limits(plan_id: str, is_trial: bool = False) -> Dict[str, int]:
    """Return max users and max clients allowed."""
    if is_trial:
        # Full access during trial
        return {"max_users": 25, "max_clients": 9999999}
    plan = get_plan_details(plan_id)
    return {
        "max_users": plan["max_users"],
        "max_clients": plan["max_clients"]
    }
