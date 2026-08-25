"""
SOLARIX — Subscription, Pricing, Trial, Razorpay & Billing APIs
"""
import os
import hmac
import hashlib
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Depends, Request, Header, Response
from pydantic import BaseModel
import httpx

from plan_config import (
    get_all_plans, get_plan_details, get_plan_limits, check_feature_access,
    get_company_entitlement, parse_iso
)

logger = logging.getLogger("solarix_billing")

billing_router = APIRouter(prefix="/api/billing", tags=["billing"])

RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "rzp_live_TQhcb9xdCCZClE")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "N26Rl7vSjMPMFd9F6Lz1j7Jq")
RAZORPAY_WEBHOOK_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "rzp_test_webhook_secret")

def get_razorpay_key_id() -> str:
    return os.environ.get("RAZORPAY_KEY_ID") or RAZORPAY_KEY_ID or "rzp_live_TQhcb9xdCCZClE"

def get_razorpay_key_secret() -> str:
    return os.environ.get("RAZORPAY_KEY_SECRET") or RAZORPAY_KEY_SECRET or "N26Rl7vSjMPMFd9F6Lz1j7Jq"

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

# Helper to access main database from server module
def get_db():
    from server import db
    return db

def get_current_user_dep():
    from server import get_current_user
    return get_current_user

# Models
class CreateSubscriptionIn(BaseModel):
    plan_id: str
    billing_cycle: str = "monthly"  # "monthly" | "yearly"
    coupon_code: Optional[str] = None

class VerifySubscriptionIn(BaseModel):
    razorpay_payment_id: str
    razorpay_order_id: Optional[str] = ""
    razorpay_subscription_id: Optional[str] = ""
    razorpay_signature: Optional[str] = ""
    plan_id: str
    billing_cycle: str = "monthly"

class ApplyCouponIn(BaseModel):
    coupon_code: str
    plan_id: str

class CancelSubscriptionIn(BaseModel):
    reason: Optional[str] = "User requested cancellation"


@billing_router.get("/plans")
async def list_plans():
    """Return available subscription plans with dynamic annual savings."""
    db = get_db()
    db_plans = await db.plans_config.find({}, {"_id": 0}).to_list(100)
    return {"plans": get_all_plans(db_plans_list=db_plans)}


@billing_router.get("/subscription")
async def get_company_subscription(user=Depends(get_current_user_dep())):
    """Return authoritative subscription status, trial details, comprehensive limit usage, and payment history."""
    db = get_db()
    company_id = user.get("company_id")
    if not company_id:
        raise HTTPException(status_code=404, detail="Company not found")

    company = await db.companies.find_one({"id": company_id}, {"_id": 0})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    entitlement = await get_company_entitlement(company_id, db=db)
    from plan_config import get_company_usage
    usage = await get_company_usage(company_id, db=db)

    # Payment history
    history_cursor = db.payment_history.find({"company_id": company_id}, {"_id": 0}).sort("paid_at", -1)
    history = await history_cursor.to_list(100)

    limits = entitlement.get("limits", {})
    storage_limit_gb = limits.get("storage_gb", 5)
    storage_used_gb = usage.get("storage_gb", 0)

    percentages = {
        "users": min(100, int((usage.get("active_users", 0) / max(1, limits.get("max_users", 1))) * 100)),
        "clients": min(100, int((usage.get("active_clients", 0) / max(1, limits.get("max_clients", 1))) * 100)),
        "products": min(100, int((usage.get("products", 0) / max(1, limits.get("max_products", 1))) * 100)),
        "storage": min(100, int((storage_used_gb / max(0.1, storage_limit_gb)) * 100)),
        "monthly_documents": min(100, int((usage.get("monthly_documents", 0) / max(1, limits.get("monthly_documents", 1))) * 100)),
        "monthly_pdf_docx": min(100, int((usage.get("monthly_pdf_docx", 0) / max(1, limits.get("monthly_pdf_docx", 1))) * 100)),
        "monthly_exports": min(100, int((usage.get("monthly_exports", 0) / max(1, limits.get("monthly_exports", 1))) * 100)),
        "monthly_material_requests": min(100, int((usage.get("monthly_material_requests", 0) / max(1, limits.get("monthly_material_requests", 1))) * 100)),
        "monthly_inventory_transactions": min(100, int((usage.get("monthly_inventory_transactions", 0) / max(1, limits.get("monthly_inventory_transactions", 1))) * 100)),
        "monthly_api_requests": min(100, int((usage.get("monthly_api_requests", 0) / max(1, limits.get("monthly_api_requests", 1))) * 100)),
    }

    # Warnings for UI proactive banners
    warnings = []
    for k, pct in percentages.items():
        if pct >= 90:
            warnings.append({"resource": k, "percentage": pct, "level": "danger", "message": f"You are using {pct}% of your plan limit for {k.replace('_', ' ')}."})
        elif pct >= 80:
            warnings.append({"resource": k, "percentage": pct, "level": "warning", "message": f"You are using {pct}% of your plan limit for {k.replace('_', ' ')}."})

    return {
        **entitlement,
        "usage": {
            "users": usage.get("active_users", 0),
            "clients": usage.get("active_clients", 0),
            "products": usage.get("products", 0),
            "storage_bytes": usage.get("storage_bytes", 0),
            "storage_gb": storage_used_gb,
            "monthly_documents": usage.get("monthly_documents", 0),
            "monthly_pdf_docx": usage.get("monthly_pdf_docx", 0),
            "monthly_exports": usage.get("monthly_exports", 0),
            "monthly_material_requests": usage.get("monthly_material_requests", 0),
            "monthly_inventory_transactions": usage.get("monthly_inventory_transactions", 0),
            "monthly_api_requests": usage.get("monthly_api_requests", 0),
            "period": usage.get("period")
        },
        "percentages": percentages,
        "warnings": warnings,
        "history": history
    }


@billing_router.post("/razorpay/create-subscription")
async def create_razorpay_subscription(data: CreateSubscriptionIn, user=Depends(get_current_user_dep())):
    """Create Razorpay Subscription object or return test subscription parameters."""
    if user.get("role") not in ("Admin", "Super Admin", "Owner") and user.get("user_type") != "owner":
        raise HTTPException(status_code=403, detail="Only Company Admins or Owners can manage subscriptions")

    db = get_db()
    company_id = user["company_id"]
    db_plan = await db.plans_config.find_one({"id": data.plan_id.lower()}, {"_id": 0})
    plan = get_plan_details(data.plan_id, db_override=db_plan)
    
    amount = plan["yearly_price"] if data.billing_cycle == "yearly" else plan["monthly_price"]
    
    # Handle optional discount code
    discount_amount = 0
    if data.coupon_code:
        coupon = await db.coupons.find_one({"code": data.coupon_code.upper(), "active": True})
        if coupon:
            if coupon.get("discount_type") == "percentage":
                discount_amount = int((amount * coupon.get("discount_value", 0)) / 100)
            elif coupon.get("discount_type") == "fixed":
                discount_amount = coupon.get("discount_value", 0)

    final_amount = max(0, amount - discount_amount)
    amount_paise = int(final_amount * 100)

    # Initialize order and subscription identifiers
    razorpay_order_id = ""
    razorpay_sub_id = ""
    key_id = get_razorpay_key_id()
    key_secret = get_razorpay_key_secret()

    if key_id and not key_id.startswith("rzp_test_solrix"):
        try:
            async with httpx.AsyncClient() as client:
                # 1. Create standard Razorpay Order for reliable checkout across all payment methods
                order_res = await client.post(
                    "https://api.razorpay.com/v1/orders",
                    auth=(key_id, key_secret),
                    json={
                        "amount": amount_paise,
                        "currency": "INR",
                        "receipt": f"rcpt_{company_id[:8]}_{int(datetime.now().timestamp())}",
                        "notes": {
                            "company_id": company_id,
                            "plan_id": data.plan_id,
                            "billing_cycle": data.billing_cycle
                        }
                    },
                    timeout=10.0
                )
                if order_res.status_code == 200:
                    razorpay_order_id = order_res.json().get("id", "")
                    logger.info(f"Created Razorpay Order {razorpay_order_id} for plan {data.plan_id}")
                else:
                    logger.warning(f"Razorpay order creation status={order_res.status_code}: {order_res.text}")

                # 2. Attempt subscription creation if plan id configured
                plan_id_env = os.environ.get(f"RAZORPAY_PLAN_{data.plan_id.upper()}_{data.billing_cycle.upper()}")
                if plan_id_env:
                    sub_res = await client.post(
                        "https://api.razorpay.com/v1/subscriptions",
                        auth=(key_id, key_secret),
                        json={
                            "plan_id": plan_id_env,
                            "total_count": 12 if data.billing_cycle == "monthly" else 1,
                            "quantity": 1,
                            "customer_notify": 1,
                            "notes": {
                                "company_id": company_id,
                                "plan_id": data.plan_id,
                                "billing_cycle": data.billing_cycle
                            }
                        },
                        timeout=10.0
                    )
                    if sub_res.status_code == 200:
                        razorpay_sub_id = sub_res.json().get("id", "")
        except Exception as e:
            logger.error(f"Razorpay order/subscription API call failed: {e}")

    return {
        "order_id": razorpay_order_id,
        "subscription_id": razorpay_sub_id,
        "key_id": key_id,
        "amount": final_amount,
        "currency": "INR",
        "plan_name": plan["name"],
        "billing_cycle": data.billing_cycle,
        "company_name": user.get("name")
    }


@billing_router.post("/razorpay/verify-subscription")
async def verify_razorpay_subscription(data: VerifySubscriptionIn, user=Depends(get_current_user_dep())):
    """Server-side HMAC verification of checkout response and activation of paid subscription."""
    if user.get("role") not in ("Admin", "Super Admin", "Owner") and user.get("user_type") != "owner":
        raise HTTPException(status_code=403, detail="Only Company Admins or Owners can manage subscriptions")

    db = get_db()
    company_id = user["company_id"]
    key_secret = get_razorpay_key_secret()
    is_test_mode = key_secret.startswith("rzp_test")
    sig_valid = False

    # Check Order signature: HMAC SHA256 of f"{order_id}|{payment_id}"
    if data.razorpay_order_id and data.razorpay_signature:
        expected_order_sig = hmac.new(
            key_secret.encode(),
            f"{data.razorpay_order_id}|{data.razorpay_payment_id}".encode(),
            hashlib.sha256
        ).hexdigest()
        if expected_order_sig == data.razorpay_signature:
            sig_valid = True

    # Check Subscription signature: HMAC SHA256 of f"{payment_id}|{subscription_id}"
    if not sig_valid and data.razorpay_subscription_id and data.razorpay_signature:
        expected_sub_sig = hmac.new(
            key_secret.encode(),
            f"{data.razorpay_payment_id}|{data.razorpay_subscription_id}".encode(),
            hashlib.sha256
        ).hexdigest()
        if expected_sub_sig == data.razorpay_signature:
            sig_valid = True

    # Fallback: Query payment status directly from Razorpay API to confirm capture
    if not is_test_mode and not sig_valid and data.razorpay_payment_id:
        try:
            async with httpx.AsyncClient() as client:
                pay_res = await client.get(
                    f"https://api.razorpay.com/v1/payments/{data.razorpay_payment_id}",
                    auth=(get_razorpay_key_id(), key_secret),
                    timeout=8.0
                )
                if pay_res.status_code == 200 and pay_res.json().get("status") in ("captured", "authorized"):
                    sig_valid = True
        except Exception as e:
            logger.warning(f"Direct payment verification fallback error: {e}")

    if not is_test_mode and not sig_valid:
        logger.error("Razorpay signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid payment signature")

    db_plan = await db.plans_config.find_one({"id": data.plan_id.lower()}, {"_id": 0})
    plan = get_plan_details(data.plan_id, db_override=db_plan)
    amount = plan["yearly_price"] if data.billing_cycle == "yearly" else plan["monthly_price"]

    # Activate subscription in company record with explicit start and expiration timestamps
    now = now_iso()
    sub_days = 365 if data.billing_cycle == "yearly" else 30
    sub_expires = (datetime.now(timezone.utc) + timedelta(days=sub_days)).isoformat()
    sub_ref = data.razorpay_subscription_id or data.razorpay_order_id or data.razorpay_payment_id

    await db.companies.update_one(
        {"id": company_id},
        {"$set": {
            "subscription_status": "active",
            "plan_id": data.plan_id,
            "plan": data.plan_id,
            "billing_cycle": data.billing_cycle,
            "subscription_started_at": now,
            "subscription_expires_at": sub_expires,
            "razorpay_subscription_id": sub_ref,
            "cancel_at_period_end": False,
            "updated_at": now
        }}
    )

    try:
        from server import _cache_invalidate_company
        _cache_invalidate_company(company_id)
    except Exception:
        pass

    # Insert into payment history
    payment_record = {
        "id": f"PAY-{int(datetime.now().timestamp())}",
        "company_id": company_id,
        "subscription_id": sub_ref,
        "razorpay_payment_id": data.razorpay_payment_id,
        "razorpay_order_id": data.razorpay_order_id,
        "amount": amount,
        "currency": "INR",
        "status": "success",
        "plan_id": data.plan_id,
        "billing_cycle": data.billing_cycle,
        "paid_at": now
    }
    await db.payment_history.insert_one(payment_record)

    # Log activity
    from server import log_activity
    await log_activity(company_id, user["id"], user["name"], "Upgraded Subscription Plan", f"Plan: {plan['name']} ({data.billing_cycle})")

    return {
        "status": "success",
        "message": f"Successfully subscribed to {plan['name']} plan!",
        "subscription_status": "active",
        "plan_id": data.plan_id,
        "subscription_expires_at": sub_expires
    }


@billing_router.post("/razorpay/webhook")
async def razorpay_webhook(request: Request, x_razorpay_signature: Optional[str] = Header(None, alias="X-Razorpay-Signature")):
    """Idempotent secure Razorpay Webhook listener."""
    raw_body = await request.body()
    
    # Verify HMAC-SHA256 signature
    if RAZORPAY_WEBHOOK_SECRET and not RAZORPAY_WEBHOOK_SECRET.startswith("rzp_test"):
        if not x_razorpay_signature:
            raise HTTPException(status_code=400, detail="Missing X-Razorpay-Signature header")
        computed_sig = hmac.new(
            RAZORPAY_WEBHOOK_SECRET.encode(),
            raw_body,
            hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(computed_sig, x_razorpay_signature):
            logger.error("Razorpay webhook signature mismatch")
            raise HTTPException(status_code=400, detail="Invalid webhook signature")

    try:
        payload = json.loads(raw_body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    event_id = payload.get("event_id") or payload.get("created_at")
    event_type = payload.get("event", "")

    db = get_db()

    # Idempotency check: Skip if event already processed
    if event_id and await db.billing_webhooks.find_one({"event_id": str(event_id)}):
        return {"status": "already_processed"}

    # Save event record
    if event_id:
        await db.billing_webhooks.insert_one({
            "event_id": str(event_id),
            "event_type": event_type,
            "received_at": now_iso()
        })

    # Handle lifecycle events
    entity = payload.get("payload", {}).get("subscription", {}).get("entity", {})
    sub_id = entity.get("id")
    notes = entity.get("notes", {})
    company_id = notes.get("company_id")

    if not company_id and sub_id:
        company = await db.companies.find_one({"razorpay_subscription_id": sub_id})
        if company:
            company_id = company.get("id")

    if company_id:
        if event_type in ["subscription.authenticated", "subscription.activated", "subscription.charged"]:
            await db.companies.update_one(
                {"id": company_id},
                {"$set": {"subscription_status": "active", "updated_at": now_iso()}}
            )
        elif event_type in ["payment.failed"]:
            # Grace period -> status past_due
            await db.companies.update_one(
                {"id": company_id},
                {"$set": {"subscription_status": "past_due", "updated_at": now_iso()}}
            )
        elif event_type in ["subscription.cancelled"]:
            await db.companies.update_one(
                {"id": company_id},
                {"$set": {"subscription_status": "cancelled", "cancel_at_period_end": True, "updated_at": now_iso()}}
            )
        elif event_type in ["subscription.completed", "subscription.expired"]:
            await db.companies.update_one(
                {"id": company_id},
                {"$set": {"subscription_status": "expired", "updated_at": now_iso()}}
            )
        try:
            from server import _cache_invalidate_company
            _cache_invalidate_company(company_id)
        except Exception:
            pass

    return {"status": "success", "event": event_type}


@billing_router.post("/apply-coupon")
async def apply_coupon(data: ApplyCouponIn, user=Depends(get_current_user_dep())):
    """Validate discount coupon code."""
    db = get_db()
    code = data.coupon_code.strip().upper()
    
    # Built-in Founding Customer offer: FOUNDING20
    if code == "FOUNDING20":
        founding_count = await db.companies.count_documents({"used_coupon": "FOUNDING20"})
        if founding_count >= 20:
            raise HTTPException(status_code=400, detail="Founding customer 20% discount offer limit has been reached.")
        return {
            "valid": True,
            "code": "FOUNDING20",
            "discount_type": "percentage",
            "discount_value": 20,
            "description": "20% Founding Customer Discount (valid for 12 months)"
        }

    coupon = await db.coupons.find_one({"code": code, "active": True})
    if not coupon:
        raise HTTPException(status_code=404, detail="Invalid or expired coupon code")

    return {
        "valid": True,
        "code": coupon["code"],
        "discount_type": coupon.get("discount_type", "percentage"),
        "discount_value": coupon.get("discount_value", 0),
        "description": coupon.get("description", "Discount applied")
    }


@billing_router.post("/cancel-subscription")
async def cancel_subscription(data: CancelSubscriptionIn, user=Depends(get_current_user_dep())):
    """Cancel subscription auto-renewal at period end."""
    if user.get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Only Company Admins can manage subscriptions")

    db = get_db()
    company_id = user["company_id"]
    
    await db.companies.update_one(
        {"id": company_id},
        {"$set": {
            "cancel_at_period_end": True,
            "cancelled_at": now_iso(),
            "subscription_status": "cancelled"
        }}
    )

    from server import log_activity
    await log_activity(company_id, user["id"], user["name"], "Cancelled Auto-Renewal", data.reason or "")

    return {"status": "success", "message": "Subscription auto-renewal has been cancelled. Access continues until period end."}


async def get_super_admin_user(request: Request):
    from server import get_current_user, is_super_admin_user
    user = await get_current_user(request)
    if not is_super_admin_user(user):
        raise HTTPException(status_code=403, detail="Admin access required. Only authorized SOLRIX Super Admin can view SaaS economics metrics.")
    return user

# ---------- ADMIN SAAS METRICS ----------
@billing_router.get("/admin/metrics")
async def get_admin_metrics(
    gateway_fee_percent: float = 2.0,
    infra_cost_per_company: float = 250.0,
    user=Depends(get_super_admin_user)
):
    """Super-Admin SaaS Business Metrics & Customer Economics Calculator."""

    db = get_db()
    companies = await db.companies.find({}, {"_id": 0}).to_list(10000)

    now = datetime.now(timezone.utc)
    
    total_companies = len(companies)
    active_paid_count = 0
    trialing_count = 0
    expired_count = 0
    past_due_count = 0
    cancelled_count = 0

    starter_count = 0
    growth_count = 0
    pro_count = 0

    mrr = 0.0

    db_plans = await db.plans_config.find({}, {"_id": 0}).to_list(100)
    all_plans_map = get_all_plans(db_plans_list=db_plans)

    for c in companies:
        st = c.get("subscription_status", "trialing")
        cycle = c.get("billing_cycle", "monthly")
        pid = c.get("plan_id", "starter").lower()
        
        trial_end = parse_iso(c.get("trial_ends_at"))
        if st == "trialing" and trial_end and now > trial_end:
            st = "expired"

        if st == "active":
            active_paid_count += 1
            plan_info = all_plans_map.get(pid, get_plan_details(pid))
            plan_mrr = (plan_info["yearly_price"] / 12.0) if cycle == "yearly" else float(plan_info["monthly_price"])
            mrr += plan_mrr

            if pid == "starter": starter_count += 1
            elif pid == "growth": growth_count += 1
            elif pid == "pro": pro_count += 1

        elif st == "trialing": trialing_count += 1
        elif st == "expired": expired_count += 1
        elif st == "past_due": past_due_count += 1
        elif st == "cancelled": cancelled_count += 1

    arr = mrr * 12.0
    conversion_rate = round((active_paid_count / total_companies * 100), 1) if total_companies > 0 else 0.0
    churn_rate = round((cancelled_count / (active_paid_count + cancelled_count) * 100), 1) if (active_paid_count + cancelled_count) > 0 else 0.0
    arpu = round(mrr / active_paid_count, 2) if active_paid_count > 0 else 0.0

    # Economics calculation per customer
    gateway_cost_avg = round(arpu * (gateway_fee_percent / 100.0), 2)
    gross_contribution_avg = round(arpu - gateway_cost_avg - infra_cost_per_company, 2)
    gross_margin_percent = round((gross_contribution_avg / arpu * 100), 1) if arpu > 0 else 0.0

    return {
        "total_companies": total_companies,
        "mrr": mrr,
        "arr": arr,
        "arpu": arpu,
        "active_paid_count": active_paid_count,
        "trialing_count": trialing_count,
        "expired_count": expired_count,
        "past_due_count": past_due_count,
        "cancelled_count": cancelled_count,
        "conversion_rate": conversion_rate,
        "churn_rate": churn_rate,
        "plan_breakdown": {
            "starter": starter_count,
            "growth": growth_count,
            "pro": pro_count,
        },
        "economics": {
            "gateway_fee_percent": gateway_fee_percent,
            "infra_cost_per_company": infra_cost_per_company,
            "estimated_gateway_cost": gateway_cost_avg,
            "estimated_gross_contribution": gross_contribution_avg,
            "gross_margin_percent": gross_margin_percent
        }
    }
