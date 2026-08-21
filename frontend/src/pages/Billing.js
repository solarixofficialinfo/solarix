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
      {data?.warnings && data.warnings.length > 0 && (
        <div className="space-y-3">
          {data.warnings.map((w, idx) => (
            <Alert key={idx} className={`border ${w.level === "danger" ? "bg-rose-50 border-rose-300 text-rose-900" : "bg-amber-50 border-amber-300 text-amber-900"}`}>
              <AlertTriangle className={`w-5 h-5 ${w.level === "danger" ? "text-rose-600" : "text-amber-600"}`} />
              <AlertTitle className="font-bold text-sm">
                {w.level === "danger" ? "Approaching Plan Limit (90%+)" : "Resource Usage Notice (80%+)"}
              </AlertTitle>
              <AlertDescription className="text-xs mt-1 flex items-center justify-between gap-4">
                <span>{w.message} Upgrade your plan to increase limits seamlessly.</span>
                <Button size="xs" onClick={() => nav("/pricing")} className="bg-blue-600 hover:bg-blue-700 text-white font-bold shrink-0">
                  Upgrade Plan
                </Button>
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

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
        <Card className="md:col-span-1 border-slate-200 shadow-xs bg-white flex flex-col justify-between">
          <div>
            <CardHeader className="border-b border-slate-100 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                    {data?.plan_name} PLAN
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Cycle: <span className="font-semibold uppercase text-slate-700">{data?.billing_cycle}</span>
                  </CardDescription>
                </div>
                <div>{getStatusBadge(data?.subscription_status)}</div>
              </div>
            </CardHeader>

            <CardContent className="pt-4 space-y-4">
              <div className="space-y-2 text-xs">
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <div className="text-slate-400 uppercase font-semibold text-[10px]">Workspace</div>
                  <div className="font-bold text-slate-900 text-sm mt-0.5 truncate">{data?.company_name}</div>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <div className="text-slate-400 uppercase font-semibold text-[10px]">
                    {data?.subscription_status === "active" ? "Renewal / Expiry Date" : "Trial End Date"}
                  </div>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">
                    {dayjs(data?.subscription_expires_at || data?.trial_ends_at).format("MMM D, YYYY")}
                  </div>
                </div>
              </div>
            </CardContent>
          </div>

          <div className="p-5 pt-0 space-y-2">
            <Button onClick={() => nav("/pricing")} className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold">
              Change or Upgrade Plan
            </Button>
            {data?.subscription_status === "active" && !data?.cancel_at_period_end && (
              <Button variant="outline" onClick={handleCancelSubscription} disabled={cancelling} className="w-full text-red-600 border-red-200 hover:bg-red-50 text-xs">
                {cancelling ? "Cancelling..." : "Cancel Auto-Renewal"}
              </Button>
            )}
          </div>
        </Card>

        {/* Real-time Plan Limits & Usage Matrix */}
        <Card className="md:col-span-2 border-slate-200 shadow-xs bg-white">
          <CardHeader className="border-b border-slate-100 pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                Resource Usage & Smart Plan Limits
              </CardTitle>
              <CardDescription className="text-[11px] text-slate-500">
                Monthly quotas automatically reset on the 1st of each month (Current billing period: {data?.usage?.period || "current"}).
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-[10px] bg-slate-50 border-slate-200 text-slate-600 font-mono">
              Live DB Sync
            </Badge>
          </CardHeader>
          <CardContent className="pt-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Users */}
              <div className="p-3 rounded-lg border border-slate-100 bg-slate-50/60 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">Team Users</span>
                  <span className="font-mono text-slate-600 font-bold">
                    {data?.usage?.users || 0} / {data?.limits?.max_users || 3}
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-200/80 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      (data?.percentages?.users || 0) >= 100 ? "bg-rose-500" : (data?.percentages?.users || 0) >= 80 ? "bg-amber-500" : "bg-blue-600"
                    }`}
                    style={{ width: `${data?.percentages?.users || 0}%` }}
                  />
                </div>
              </div>

              {/* Active Clients */}
              <div className="p-3 rounded-lg border border-slate-100 bg-slate-50/60 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">Active Clients & Projects</span>
                  <span className="font-mono text-slate-600 font-bold">
                    {data?.usage?.clients || 0} / {data?.limits?.max_clients || 100}
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-200/80 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      (data?.percentages?.clients || 0) >= 100 ? "bg-rose-500" : (data?.percentages?.clients || 0) >= 80 ? "bg-amber-500" : "bg-emerald-600"
                    }`}
                    style={{ width: `${data?.percentages?.clients || 0}%` }}
                  />
                </div>
              </div>

              {/* Products */}
              <div className="p-3 rounded-lg border border-slate-100 bg-slate-50/60 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">Product Master</span>
                  <span className="font-mono text-slate-600 font-bold">
                    {data?.usage?.products || 0} / {data?.limits?.max_products || 1000}
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-200/80 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      (data?.percentages?.products || 0) >= 100 ? "bg-rose-500" : (data?.percentages?.products || 0) >= 80 ? "bg-amber-500" : "bg-indigo-600"
                    }`}
                    style={{ width: `${data?.percentages?.products || 0}%` }}
                  />
                </div>
              </div>

              {/* Storage */}
              <div className="p-3 rounded-lg border border-slate-100 bg-slate-50/60 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">Document & Photo Storage</span>
                  <span className="font-mono text-slate-600 font-bold">
                    {data?.usage?.storage_gb || 0} GB / {data?.limits?.storage_gb || 5} GB
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-200/80 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      (data?.percentages?.storage || 0) >= 100 ? "bg-rose-500" : (data?.percentages?.storage || 0) >= 80 ? "bg-amber-500" : "bg-purple-600"
                    }`}
                    style={{ width: `${data?.percentages?.storage || 0}%` }}
                  />
                </div>
              </div>

              {/* PDF/DOCX Generation */}
              <div className="p-3 rounded-lg border border-slate-100 bg-slate-50/60 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">PDF / DOCX Generation (Monthly)</span>
                  <span className="font-mono text-slate-600 font-bold">
                    {data?.usage?.monthly_pdf_docx || 0} / {data?.limits?.monthly_pdf_docx || 200}
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-200/80 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      (data?.percentages?.monthly_pdf_docx || 0) >= 100 ? "bg-rose-500" : (data?.percentages?.monthly_pdf_docx || 0) >= 80 ? "bg-amber-500" : "bg-cyan-600"
                    }`}
                    style={{ width: `${data?.percentages?.monthly_pdf_docx || 0}%` }}
                  />
                </div>
              </div>

              {/* Exports */}
              <div className="p-3 rounded-lg border border-slate-100 bg-slate-50/60 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">Excel / PDF Exports (Monthly)</span>
                  <span className="font-mono text-slate-600 font-bold">
                    {data?.usage?.monthly_exports || 0} / {data?.limits?.monthly_exports || 50}
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-200/80 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      (data?.percentages?.monthly_exports || 0) >= 100 ? "bg-rose-500" : (data?.percentages?.monthly_exports || 0) >= 80 ? "bg-amber-500" : "bg-teal-600"
                    }`}
                    style={{ width: `${data?.percentages?.monthly_exports || 0}%` }}
                  />
                </div>
              </div>

              {/* Material Requests */}
              <div className="p-3 rounded-lg border border-slate-100 bg-slate-50/60 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">Material Requests (Monthly)</span>
                  <span className="font-mono text-slate-600 font-bold">
                    {data?.usage?.monthly_material_requests || 0} / {data?.limits?.monthly_material_requests || 1000}
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-200/80 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      (data?.percentages?.monthly_material_requests || 0) >= 100 ? "bg-rose-500" : (data?.percentages?.monthly_material_requests || 0) >= 80 ? "bg-amber-500" : "bg-orange-600"
                    }`}
                    style={{ width: `${data?.percentages?.monthly_material_requests || 0}%` }}
                  />
                </div>
              </div>

              {/* Inventory Transactions */}
              <div className="p-3 rounded-lg border border-slate-100 bg-slate-50/60 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">Inward / Outward Stock (Monthly)</span>
                  <span className="font-mono text-slate-600 font-bold">
                    {data?.usage?.monthly_inventory_transactions || 0} / {data?.limits?.monthly_inventory_transactions || 2500}
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-200/80 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      (data?.percentages?.monthly_inventory_transactions || 0) >= 100 ? "bg-rose-500" : (data?.percentages?.monthly_inventory_transactions || 0) >= 80 ? "bg-amber-500" : "bg-emerald-600"
                    }`}
                    style={{ width: `${data?.percentages?.monthly_inventory_transactions || 0}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 text-[11px] text-slate-500 border-t border-slate-100 flex items-center justify-between">
              <span>All limits are strictly enforced on backend. Existing stored data is never deleted.</span>
              <span className="font-semibold text-slate-700">Isolated Quota Architecture</span>
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
