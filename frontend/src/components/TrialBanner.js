import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { Clock, AlertCircle, Sparkles, ArrowRight } from "lucide-react";

export default function TrialBanner() {
  const { user } = useAuth();
  const [sub, setSub] = useState(null);

  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => {
      api.get("/billing/subscription")
        .then((res) => setSub(res.data))
        .catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, [user]);

  if (!sub) return null;

  const isTrial = sub.is_trial && sub.subscription_status === "trialing";
  const isExpired = sub.subscription_status === "expired";
  const isPastDue = sub.subscription_status === "past_due";

  if (!isTrial && !isExpired && !isPastDue) return null;

  if (isExpired) {
    return (
      <div className="bg-red-600 text-white text-xs py-2 px-4 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2 font-medium">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Your 15-day free trial has expired. Historical data is safely stored. Upgrade now to preserve write access.</span>
        </div>
        <Link to="/pricing" className="bg-white text-red-700 hover:bg-slate-100 font-bold px-3 py-1 rounded-md text-[11px] shrink-0 transition flex items-center gap-1">
          Choose Plan <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    );
  }

  if (isPastDue) {
    return (
      <div className="bg-amber-500 text-slate-900 text-xs py-2 px-4 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2 font-semibold">
          <AlertCircle className="w-4 h-4 shrink-0 text-slate-900" />
          <span>Payment past due. Your account is in a 7-day grace period. Please update your subscription payment method.</span>
        </div>
        <Link to="/billing" className="bg-slate-900 text-white hover:bg-slate-800 font-bold px-3 py-1 rounded-md text-[11px] shrink-0 transition">
          Update Payment
        </Link>
      </div>
    );
  }

  if (isTrial && sub.days_remaining <= 7) {
    return (
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs py-2 px-4 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2 font-medium">
          <Clock className="w-4 h-4 shrink-0" />
          <span>
            {sub.days_remaining === 1
              ? "Your 15-day free trial ends tomorrow!"
              : `Your 15-day free trial ends in ${sub.days_remaining} days.`}
          </span>
        </div>
        <Link to="/pricing" className="bg-white text-blue-700 hover:bg-blue-50 font-bold px-3 py-1 rounded-md text-[11px] shrink-0 transition flex items-center gap-1">
          Upgrade Now <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    );
  }

  return null;
}
