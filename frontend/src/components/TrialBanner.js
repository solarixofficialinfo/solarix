import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { Clock, AlertCircle, AlertTriangle, Sparkles, ArrowRight, ShieldAlert } from "lucide-react";

export default function TrialBanner() {
  const { user } = useAuth();
  const [sub, setSub] = useState(null);

  const fetchSub = useCallback(() => {
    if (!user) return;
    api.get("/billing/subscription")
      .then((res) => setSub(res.data))
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    fetchSub();

    // Re-fetch on global subscription or auth refresh events
    const handleRefresh = () => fetchSub();
    window.addEventListener("solarix:subscription-refresh", handleRefresh);
    window.addEventListener("solarix:auth-refresh", handleRefresh);
    window.addEventListener("focus", handleRefresh);

    // Light background refetch every 30s
    const interval = setInterval(fetchSub, 30000);

    return () => {
      window.removeEventListener("solarix:subscription-refresh", handleRefresh);
      window.removeEventListener("solarix:auth-refresh", handleRefresh);
      window.removeEventListener("focus", handleRefresh);
      clearInterval(interval);
    };
  }, [fetchSub]);

  if (!sub) return null;

  const isTrial = Boolean(sub.is_trial && sub.subscription_status === "trialing");
  const isExpired = sub.subscription_status === "expired" || Boolean(sub.is_expired);
  const isPastDue = sub.subscription_status === "past_due";
  const daysLeft = typeof sub.days_remaining === "number" ? sub.days_remaining : 0;

  // 1. EXPIRED TRIAL OR SUBSCRIPTION
  if (isExpired) {
    return (
      <div className="bg-red-600 text-white text-xs py-2 px-4 flex items-center justify-between shadow-sm z-50">
        <div className="flex items-center gap-2 font-medium">
          <ShieldAlert className="w-4 h-4 shrink-0 text-white animate-pulse" />
          <span>
            <strong className="font-bold">Trial Expired:</strong> Your trial/subscription has expired. Historical data is safely stored. Upgrade now to resume adding clients, generating quotations, and creating records.
          </span>
        </div>
        <Link
          to="/pricing"
          className="bg-white text-red-700 hover:bg-slate-100 font-bold px-3 py-1 rounded-md text-[11px] shrink-0 transition flex items-center gap-1 shadow-sm"
        >
          Upgrade Plan <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    );
  }

  // 2. PAST DUE PAYMENT
  if (isPastDue) {
    return (
      <div className="bg-amber-500 text-slate-950 text-xs py-2 px-4 flex items-center justify-between shadow-sm z-50">
        <div className="flex items-center gap-2 font-semibold">
          <AlertCircle className="w-4 h-4 shrink-0 text-slate-950" />
          <span>Payment past due. Your account is in a grace period. Please update your subscription payment method.</span>
        </div>
        <Link
          to="/billing"
          className="bg-slate-950 text-white hover:bg-slate-900 font-bold px-3 py-1 rounded-md text-[11px] shrink-0 transition"
        >
          Update Payment
        </Link>
      </div>
    );
  }

  // 3. TRIALING (DAY 1 TO 15)
  if (isTrial) {
    // 1-Day Remaining Warning (< 24h)
    if (daysLeft <= 1) {
      return (
        <div className="bg-gradient-to-r from-amber-600 to-orange-600 text-white text-xs py-2 px-4 flex items-center justify-between shadow-sm z-50">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-200" />
            <span>
              <strong className="font-bold uppercase tracking-wider">Free Trial — 1 day left:</strong> Your plan expires in 1 day. Upgrade to keep full access uninterrupted.
            </span>
          </div>
          <Link
            to="/pricing"
            className="bg-white text-orange-700 hover:bg-amber-50 font-bold px-3 py-1 rounded-md text-[11px] shrink-0 transition flex items-center gap-1 shadow-sm"
          >
            Upgrade Subscription <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      );
    }

    // Days 2 to 15 Countdown
    return (
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white text-xs py-2 px-4 flex items-center justify-between shadow-sm z-50">
        <div className="flex items-center gap-2 font-medium">
          <Clock className="w-4 h-4 shrink-0 text-blue-200" />
          <span>
            <strong className="font-bold">Free Trial — {daysLeft} days left:</strong> You have unlimited access to all features during your 15-day free trial.
          </span>
        </div>
        <Link
          to="/pricing"
          className="bg-white text-blue-700 hover:bg-blue-50 font-bold px-3 py-1 rounded-md text-[11px] shrink-0 transition flex items-center gap-1 shadow-sm"
        >
          <Sparkles className="w-3 h-3 text-amber-500" /> Upgrade Plan <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    );
  }

  // 4. ACTIVE PAID PLAN EXPIRING SOON (<= 7 DAYS)
  if (sub.subscription_status === "active" && sub.subscription_expires_at && daysLeft <= 7 && daysLeft > 0) {
    return (
      <div className="bg-gradient-to-r from-amber-600 to-orange-600 text-white text-xs py-2 px-4 flex items-center justify-between shadow-sm z-50">
        <div className="flex items-center gap-2 font-medium">
          <Clock className="w-4 h-4 shrink-0 text-amber-200" />
          <span>
            Your {sub.plan_name || "Pro"} plan expires in {daysLeft === 1 ? "1 day" : `${daysLeft} days`}.
          </span>
        </div>
        <Link
          to="/pricing"
          className="bg-white text-orange-700 hover:bg-amber-50 font-bold px-3 py-1 rounded-md text-[11px] shrink-0 transition flex items-center gap-1 shadow-sm"
        >
          Renew Subscription <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    );
  }

  return null;
}

