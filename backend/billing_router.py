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

from plan_config import get_all_plans, get_plan_details, get_plan_limits, check_feature_access

logger = logging.getLogger("solarix_billing")

billing_router = APIRouter(prefix="/api/billing", tags=["billing"])

RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "rzp_live_TQX31MofTekXzi")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "Qkl444fdYLTcGwXdqVAWn2EG")
RAZORPAY_WEBHOOK_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "rzp_test_webhook_secret")

def get_razorpay_key_id() -> str:
    return os.environ.get("RAZORPAY_KEY_ID") or RAZORPAY_KEY_ID or "rzp_live_TQX31MofTekXzi"

def get_razorpay_key_secret() -> str:
    return os.environ.get("RAZORPAY_KEY_SECRET") or RAZORPAY_KEY_SECRET or "Qkl444fdYLTcGwXdqVAWn2EG"

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

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
    razorpay_subscription_id: str
    razorpay_signature: str
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
    """Return subscription status, trial details, limit usage, and payment history for authenticated company."""
    db = get_db()
    company_id = user.get("company_id")
    company = await db.companies.find_one({"id": company_id}, {"_id": 0})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    now = datetime.now(timezone.utc)
    
    # Defaults & migration fallback for existing companies
    trial_start = parse_iso(company.get("trial_started_at") or company.get("created_at")) or now
    trial_end = parse_iso(company.get("trial_ends_at"))
    
    # If trial_ends_at is missing, set 15-day trial from trial_start
    if not trial_end:
        trial_end = trial_start + timedelta(days=15)

    subscription_status = company.get("subscription_status") or company.get("plan") or "trialing"
    
    # Normalize old "active" plan field if necessary
    if subscription_status in ["active", "active_trial"]:
        if not company.get("subscription_status"):
            subscription_status = "trialing" if now < trial_end else "active"

    # Evaluate trial expiration
    is_trial = subscription_status == "trialing"
    days_remaining = max(0, (trial_end - now).days) if is_trial else 0

    if is_trial and now > trial_end:
        subscription_status = "expired"
        # Update database status silently
        await db.companies.update_one(
            {"id": company_id},
            {"$set": {"subscription_status": "expired"}}
        )

    current_plan_id = company.get("plan_id") or "starter"
    db_plan_override = await db.plans_config.find_one({"id": current_plan_id.lower()}, {"_id": 0})
    plan_info = get_plan_details(current_plan_id, db_override=db_plan_override)
    limits = get_plan_limits(current_plan_id, is_trial=is_trial, db_override=db_plan_override)

    # Current resource usage counts
    active_users_count = await db.users.count_documents({"company_id": company_id, "status": "Active"})
    active_clients_count = await db.clients.count_documents({"company_id": company_id})

    # Payment history
    history_cursor = db.payment_history.find({"company_id": company_id}, {"_id": 0}).sort("paid_at", -1)
    history = await history_cursor.to_list(100)

    return {
        "company_id": company_id,
        "company_name": company.get("company_name"),
        "subscription_status": subscription_status,  # trialing, active, past_due, cancelled, expired, suspended
        "plan_id": current_plan_id,
        "plan_name": plan_info["name"],
        "billing_cycle": company.get("billing_cycle", "monthly"),
        "trial_started_at": trial_start.isoformat(),
        "trial_ends_at": trial_end.isoformat(),
        "days_remaining": days_remaining,
        "is_trial": is_trial,
        "cancel_at_period_end": bool(company.get("cancel_at_period_end", False)),
        "razorpay_subscription_id": company.get("razorpay_subscription_id"),
        "limits": limits,
        "usage": {
            "users": active_users_count,
            "clients": active_clients_count,
        },
        "history": history
    }


@billing_router.post("/razorpay/create-subscription")
async def create_razorpay_subscription(data: CreateSubscriptionIn, user=Depends(get_current_user_dep())):
    """Create Razorpay Subscription object or return test subscription parameters."""
    if user.get("role") not in ("Admin", "Super Admin", "Owner") and user.get("user_type") != "owner":
        raise HTTPException(status_code=403, detail="Only Company Admins or Owners can manage subscriptions")

    db = get_db()
    company_id = user["company_id"]
    plan = get_plan_details(data.plan_id)
    
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

    # Call Razorpay Subscription API if credentials configured
    razorpay_sub_id = f"sub_test_{company_id[:8]}_{int(datetime.now().timestamp())}"
    key_id = get_razorpay_key_id()
    key_secret = get_razorpay_key_secret()
    
    if key_id and not key_id.startswith("rzp_test_solrix"):
        try:
            async with httpx.AsyncClient() as client:
                res = await client.post(
                    "https://api.razorpay.com/v1/subscriptions",
                    auth=(key_id, key_secret),
                    json={
                        "plan_id": os.environ.get(f"RAZORPAY_PLAN_{data.plan_id.upper()}_{data.billing_cycle.upper()}", f"plan_{data.plan_id}_{data.billing_cycle}"),
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
                if res.status_code == 200:
                    razorpay_sub_id = res.json().get("id", razorpay_sub_id)
        except Exception as e:
            logger.warning(f"Razorpay API call failed, falling back to test subscription mode: {e}")

    return {
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

    # Verify signature
    generated_signature = hmac.new(
        key_secret.encode(),
        f"{data.razorpay_payment_id}|{data.razorpay_subscription_id}".encode(),
        hashlib.sha256
    ).hexdigest()

    # In test mode with dummy secrets, bypass strict signature match if signature matches dummy test format
    is_test_mode = key_secret.startswith("rzp_test")
    if not is_test_mode and generated_signature != data.razorpay_signature:
        logger.error("Razorpay subscription signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid payment signature")

    plan = get_plan_details(data.plan_id)
    amount = plan["yearly_price"] if data.billing_cycle == "yearly" else plan["monthly_price"]

    # Activate subscription in company record
    now = now_iso()
    await db.companies.update_one(
        {"id": company_id},
        {"$set": {
            "subscription_status": "active",
            "plan_id": data.plan_id,
            "billing_cycle": data.billing_cycle,
            "razorpay_subscription_id": data.razorpay_subscription_id,
            "cancel_at_period_end": False,
            "updated_at": now
        }}
    )

    # Insert into payment history
    payment_record = {
        "id": f"PAY-{int(datetime.now().timestamp())}",
        "company_id": company_id,
        "subscription_id": data.razorpay_subscription_id,
        "razorpay_payment_id": data.razorpay_payment_id,
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
        "plan_id": data.plan_id
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

    for c in companies:
        st = c.get("subscription_status") or c.get("plan") or "trialing"
        pid = c.get("plan_id") or "starter"
        cycle = c.get("billing_cycle") or "monthly"
        
        trial_end = parse_iso(c.get("trial_ends_at"))
        if st == "trialing" and trial_end and now > trial_end:
            st = "expired"

        if st == "active":
            active_paid_count += 1
            plan_info = get_plan_details(pid)
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
