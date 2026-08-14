import React, { useState, useEffect, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { DollarSign, TrendingUp, Users, Building2, AlertCircle, Percent, PieChart, Calculator, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export default function AdminMetrics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gatewayFee, setGatewayFee] = useState(2.0);
  const [infraCost, setInfraCost] = useState(250.0);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/billing/admin/metrics?gateway_fee_percent=${gatewayFee}&infra_cost_per_company=${infraCost}`);
      setData(res.data);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, [gatewayFee, infraCost]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-slate-500 text-sm">Loading internal SaaS metrics…</div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Outfit" }}>
            Internal SaaS Business Metrics & Economics
          </h1>
          <p className="text-xs text-slate-500">
            Real-time normalized MRR, ARR, trial conversion rates, churn, and customer unit contribution calculator.
          </p>
        </div>
        <button
          onClick={fetchMetrics}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh Metrics
        </button>
      </div>

      {/* Metric Cards Row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border-slate-200 shadow-xs bg-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">MRR</span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 text-3xl font-extrabold text-slate-900" style={{ fontFamily: "Outfit" }}>
              ₹{(data?.mrr || 0).toLocaleString("en-IN")}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Monthly Recurring Revenue</div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-xs bg-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">ARR</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 text-3xl font-extrabold text-slate-900" style={{ fontFamily: "Outfit" }}>
              ₹{(data?.arr || 0).toLocaleString("en-IN")}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Annual Run-Rate (MRR × 12)</div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-xs bg-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Active Paid</span>
              <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                <Building2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 text-3xl font-extrabold text-slate-900" style={{ fontFamily: "Outfit" }}>
              {data?.active_paid_count || 0}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Active Paying Subscribers</div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-xs bg-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Trial Companies</span>
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 text-3xl font-extrabold text-slate-900" style={{ fontFamily: "Outfit" }}>
              {data?.trialing_count || 0}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">15-Day Active Trials</div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Conversion, Churn & Plan Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-slate-200 shadow-xs bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
              Conversion & Churn Rates
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
              <div className="text-xs text-slate-500 font-semibold uppercase">Trial Conversion Rate</div>
              <div className="text-2xl font-extrabold text-blue-600" style={{ fontFamily: "Outfit" }}>
                {data?.conversion_rate || 0}%
              </div>
              <div className="text-[11px] text-slate-400">Percentage of registered trials converting to paid</div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
              <div className="text-xs text-slate-500 font-semibold uppercase">Subscription Churn Rate</div>
              <div className="text-2xl font-extrabold text-red-600" style={{ fontFamily: "Outfit" }}>
                {data?.churn_rate || 0}%
              </div>
              <div className="text-[11px] text-slate-400">Percentage of accounts cancelled</div>
            </div>
          </CardContent>
        </Card>

        {/* Plan Breakdown */}
        <Card className="border-slate-200 shadow-xs bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2" style={{ fontFamily: "Outfit" }}>
              <PieChart className="w-4 h-4 text-purple-600" /> Plan Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-2">
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
              <span className="font-semibold text-slate-800">STARTER (₹2,999/mo)</span>
              <Badge className="bg-blue-100 text-blue-800">{data?.plan_breakdown?.starter || 0} Companies</Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
              <span className="font-semibold text-slate-800">GROWTH (₹5,999/mo)</span>
              <Badge className="bg-indigo-100 text-indigo-800">{data?.plan_breakdown?.growth || 0} Companies</Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
              <span className="font-semibold text-slate-800">PRO (₹9,999/mo)</span>
              <Badge className="bg-purple-100 text-purple-800">{data?.plan_breakdown?.pro || 0} Companies</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Account Lifecycle Status */}
        <Card className="border-slate-200 shadow-xs bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
              Account Lifecycle Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-2 text-xs">
            <div className="flex items-center justify-between p-2.5 border-b border-slate-100">
              <span className="text-slate-600">Total Registered Companies</span>
              <span className="font-bold text-slate-900">{data?.total_companies}</span>
            </div>
            <div className="flex items-center justify-between p-2.5 border-b border-slate-100">
              <span className="text-slate-600">Active Paid</span>
              <span className="font-bold text-emerald-600">{data?.active_paid_count}</span>
            </div>
            <div className="flex items-center justify-between p-2.5 border-b border-slate-100">
              <span className="text-slate-600">Active Trials</span>
              <span className="font-bold text-blue-600">{data?.trialing_count}</span>
            </div>
            <div className="flex items-center justify-between p-2.5 border-b border-slate-100">
              <span className="text-slate-600">Expired Trials</span>
              <span className="font-bold text-red-600">{data?.expired_count}</span>
            </div>
            <div className="flex items-center justify-between p-2.5">
              <span className="text-slate-600">Cancelled / Past Due</span>
              <span className="font-bold text-slate-600">{(data?.cancelled_count || 0) + (data?.past_due_count || 0)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Internal Unit Economics Calculator */}
      <Card className="border-slate-200 shadow-xs bg-white">
        <CardHeader className="border-b border-slate-100 pb-4">
          <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2" style={{ fontFamily: "Outfit" }}>
            <Calculator className="w-5 h-5 text-blue-600" /> Customer Unit Economics Calculator (Internal)
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Configure estimated payment gateway fees and infrastructure allocations to calculate average customer gross contribution.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Payment Gateway Fee (%)
              </Label>
              <Input
                type="number"
                step="0.1"
                value={gatewayFee}
                onChange={(e) => setGatewayFee(parseFloat(e.target.value) || 0)}
                className="mt-1.5 text-xs font-semibold"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Infrastructure Allocation / Company (₹)
              </Label>
              <Input
                type="number"
                step="10"
                value={infraCost}
                onChange={(e) => setInfraCost(parseFloat(e.target.value) || 0)}
                className="mt-1.5 text-xs font-semibold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs pt-2">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="text-slate-400 font-semibold uppercase text-[10px]">Average ARPU</div>
              <div className="text-xl font-bold text-slate-900 mt-1">₹{data?.arpu || 0}/mo</div>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="text-slate-400 font-semibold uppercase text-[10px]">Est. Gateway Fee / Cust</div>
              <div className="text-xl font-bold text-slate-700 mt-1">₹{data?.economics?.estimated_gateway_cost || 0}</div>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="text-slate-400 font-semibold uppercase text-[10px]">Est. Gross Contribution</div>
              <div className="text-xl font-bold text-emerald-600 mt-1">₹{data?.economics?.estimated_gross_contribution || 0}</div>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="text-slate-400 font-semibold uppercase text-[10px]">Gross Margin (%)</div>
              <div className="text-xl font-bold text-purple-600 mt-1">{data?.economics?.gross_margin_percent || 0}%</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
