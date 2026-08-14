import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CreditCard, ShieldCheck, AlertTriangle, Clock, ArrowUpRight, CheckCircle2, Ticket, Sparkles, XCircle } from "lucide-react";
import { toast } from "sonner";
import dayjs from "dayjs";

export default function Billing() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [couponCode, setCouponCode] = useState("");
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const fetchSubscription = useCallback(async () => {
    try {
      const res = await api.get("/billing/subscription");
      setData(res.data);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setApplyingCoupon(true);
    try {
      const res = await api.post("/billing/apply-coupon", {
        coupon_code: couponCode,
        plan_id: data?.plan_id || "growth"
      });
      setAppliedCoupon(res.data);
      toast.success(`Coupon applied: ${res.data.description}`);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setApplyingCoupon(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!window.confirm("Are you sure you want to cancel auto-renewal? You will retain access until your current billing period ends.")) return;
    setCancelling(true);
    try {
      const res = await api.post("/billing/cancel-subscription", { reason: "User requested cancellation in Billing settings" });
      toast.success(res.data.message);
      fetchSubscription();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-slate-500 text-sm">Loading billing details…</div>
      </div>
    );
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case "active":
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">Active Paid</Badge>;
      case "trialing":
        return <Badge className="bg-blue-100 text-blue-800 border-blue-300">15-Day Free Trial</Badge>;
      case "past_due":
        return <Badge className="bg-amber-100 text-amber-800 border-amber-300">Payment Past Due</Badge>;
      case "expired":
        return <Badge className="bg-red-100 text-red-800 border-red-300">Trial Expired</Badge>;
      case "suspended":
        return <Badge className="bg-slate-200 text-slate-800 border-slate-400">Suspended</Badge>;
      case "cancelled":
        return <Badge className="bg-slate-100 text-slate-600 border-slate-300">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const userUsagePercent = Math.min(100, Math.round(((data?.usage?.users || 0) / (data?.limits?.max_users || 1)) * 100));
  const clientUsagePercent = data?.limits?.max_clients >= 99999
    ? 0
    : Math.min(100, Math.round(((data?.usage?.clients || 0) / (data?.limits?.max_clients || 1)) * 100));

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Outfit" }}>
            Billing & Subscription Settings
          </h1>
          <p className="text-xs text-slate-500">
            Manage your organization's subscription plan, trial status, user/client limits, and payment invoices.
          </p>
        </div>
        <Button onClick={() => nav("/pricing")} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs gap-1.5" data-testid="upgrade-plan-btn">
          <ArrowUpRight className="w-4 h-4" /> Upgrade or Change Plan
        </Button>
      </div>

      {/* Warnings & Alerts */}
      {data?.is_trial && data?.days_remaining <= 7 && (
        <Alert className={`border ${data.days_remaining <= 3 ? "bg-amber-50 border-amber-300 text-amber-900" : "bg-blue-50 border-blue-200 text-blue-900"}`}>
          <Clock className="w-5 h-5 text-amber-600" />
          <AlertTitle className="font-bold text-sm">
            {data.days_remaining === 1 ? "1 Day Remaining in Free Trial!" : `${data.days_remaining} Days Remaining in Free Trial`}
          </AlertTitle>
          <AlertDescription className="text-xs mt-1">
            Your 15-day full-feature trial will end on <span className="font-semibold">{dayjs(data.trial_ends_at).format("MMMM D, YYYY")}</span>. Upgrade to a paid plan to ensure uninterrupted team access.
          </AlertDescription>
        </Alert>
      )}

      {data?.subscription_status === "expired" && (
        <Alert className="bg-red-50 border-red-300 text-red-900">
          <AlertTriangle className="w-5 h-5 text-red-600" />
          <AlertTitle className="font-bold text-sm">Free Trial Has Expired</AlertTitle>
          <AlertDescription className="text-xs mt-1">
            Your organization's trial ended. All stored historical data remains 100% safe. Upgrade to Starter, Growth, or Pro to resume operational updates.
          </AlertDescription>
        </Alert>
      )}

      {/* Main Grid: Plan Overview + Resource Usage */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Current Plan Card */}
        <Card className="md:col-span-2 border-slate-200 shadow-xs bg-white">
          <CardHeader className="border-b border-slate-100 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                  Current Plan: {data?.plan_name}
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Billing cycle: <span className="font-semibold uppercase text-slate-700">{data?.billing_cycle}</span>
                </CardDescription>
              </div>
              <div>{getStatusBadge(data?.subscription_status)}</div>
            </div>
          </CardHeader>

          <CardContent className="pt-6 space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="text-slate-400 uppercase font-semibold text-[10px]">Organization</div>
                <div className="font-bold text-slate-900 text-sm mt-0.5 truncate">{data?.company_name}</div>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="text-slate-400 uppercase font-semibold text-[10px]">Trial End Date</div>
                <div className="font-bold text-slate-900 text-sm mt-0.5">{dayjs(data?.trial_ends_at).format("MMM D, YYYY")}</div>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="text-slate-400 uppercase font-semibold text-[10px]">Auto Renewal</div>
                <div className="font-bold text-slate-900 text-sm mt-0.5">
                  {data?.cancel_at_period_end ? "Cancelled (Expires at end)" : "Active"}
                </div>
              </div>
            </div>

            {/* Plan Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button onClick={() => nav("/pricing")} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold">
                Change or Upgrade Plan
              </Button>
              {data?.subscription_status === "active" && !data?.cancel_at_period_end && (
                <Button variant="outline" onClick={handleCancelSubscription} disabled={cancelling} className="text-red-600 border-red-200 hover:bg-red-50 text-xs">
                  {cancelling ? "Cancelling..." : "Cancel Auto-Renewal"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Plan Limits & Usage */}
        <Card className="border-slate-200 shadow-xs bg-white">
          <CardHeader className="border-b border-slate-100 pb-4">
            <CardTitle className="text-sm font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
              Plan Limits & Usage
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            {/* Users Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">Team Users</span>
                <span className="text-slate-500 font-bold">
                  {data?.usage?.users} / {data?.limits?.max_users} Allowed
                </span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    userUsagePercent >= 100 ? "bg-red-500" : userUsagePercent >= 80 ? "bg-amber-500" : "bg-blue-600"
                  }`}
                  style={{ width: `${userUsagePercent}%` }}
                />
              </div>
            </div>

            {/* Clients Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">Active Clients / Projects</span>
                <span className="text-slate-500 font-bold">
                  {data?.usage?.clients} / {data?.limits?.max_clients >= 99999 ? "Unlimited" : data?.limits?.max_clients}
                </span>
              </div>
              {data?.limits?.max_clients < 99999 && (
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      clientUsagePercent >= 100 ? "bg-red-500" : clientUsagePercent >= 80 ? "bg-amber-500" : "bg-emerald-600"
                    }`}
                    style={{ width: `${clientUsagePercent}%` }}
                  />
                </div>
              )}
            </div>

            <div className="pt-2 text-[11px] text-slate-400">
              Limits are enforced on backend. Existing data is never deleted when plan limits are reached or changed.
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Coupon Code Section */}
      <Card className="border-slate-200 shadow-xs bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2" style={{ fontFamily: "Outfit" }}>
            <Ticket className="w-4 h-4 text-blue-600" /> Apply Discount / Coupon Code
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 max-w-md">
            <Input
              placeholder="Enter coupon code (e.g. FOUNDING20)"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value)}
              className="text-xs uppercase font-semibold"
              data-testid="coupon-code-input"
            />
            <Button onClick={handleApplyCoupon} disabled={applyingCoupon} className="bg-slate-900 hover:bg-slate-800 text-white text-xs shrink-0" data-testid="apply-coupon-btn">
              {applyingCoupon ? "Verifying..." : "Apply Coupon"}
            </Button>
          </div>

          {appliedCoupon && (
            <div className="mt-3 bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-lg text-xs flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <span className="font-bold">{appliedCoupon.code}</span>: {appliedCoupon.description}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment History Table */}
      <Card className="border-slate-200 shadow-xs bg-white">
        <CardHeader className="border-b border-slate-100 pb-4">
          <CardTitle className="text-base font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
            Payment & Subscription History
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Recorded receipts and subscription transactions for your company.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {(!data?.history || data.history.length === 0) ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No paid transactions yet. Currently operating on <span className="font-semibold text-slate-700">{data?.plan_name}</span>.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-xs font-semibold text-slate-600">Date</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600">Reference / ID</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600">Plan</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600">Amount</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.history.map((h) => (
                  <TableRow key={h.id || h.razorpay_payment_id}>
                    <TableCell className="text-xs text-slate-700">{dayjs(h.paid_at).format("MMM D, YYYY h:mm A")}</TableCell>
                    <TableCell className="text-xs font-mono text-slate-600">{h.razorpay_payment_id || h.id}</TableCell>
                    <TableCell className="text-xs font-medium text-slate-900 uppercase">{h.plan_id} ({h.billing_cycle})</TableCell>
                    <TableCell className="text-xs font-bold text-slate-900">₹{h.amount?.toLocaleString("en-IN")}</TableCell>
                    <TableCell>
                      <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">Success</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
