import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Building2, User, CreditCard, ToggleRight, Users, Activity,
  ArrowLeft, ShieldCheck, Clock, CheckCircle2, AlertTriangle, Key, ExternalLink,
  Gift, Calendar, Sparkles, Plus, Check
} from "lucide-react";

import PlanBadge from "@/components/PlanBadge";

const ALL_FEATURES = [
  { key: "core_crm", label: "Core CRM & Leads" },
  { key: "clients", label: "Clients Directory & Details" },
  { key: "project_execution", label: "Project Execution & Stages" },
  { key: "task_portal", label: "Task Portal & Workflow" },
  { key: "material_requests", label: "Material Requests" },
  { key: "inward", label: "Inventory — Inward Entries" },
  { key: "outward", label: "Inventory — Outward Entries" },
  { key: "product_master", label: "Inventory — Product Master" },
  { key: "balance_report", label: "Inventory — Balance Report" },
  { key: "history", label: "Inventory — History Logs" },
  { key: "high_value_goods", label: "Inventory — High Value Goods" },
  { key: "serial_tracking", label: "Serial No. Tracking" },
  { key: "receivables", label: "Receivables & Invoicing" },
  { key: "loan_finance", label: "Loan & Finance Lifecycle" },
  { key: "expenses", label: "Direct Project Expenses" },
  { key: "purchase_orders", label: "Purchase Orders" },
  { key: "sales_documents", label: "Sales Documents & Quotations" },
  { key: "documents", label: "Document Templates" },
  { key: "reports", label: "Reports & Financial Summary" },
  { key: "multi_branch", label: "Multi-Branch Management" },
  { key: "api_access", label: "Developer REST API Access" },
];

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("company");

  // Unified Subscription Edit Dialog state
  const [subOpen, setSubOpen] = useState(false);
  const [subForm, setSubForm] = useState({
    plan_id: "starter",
    billing_cycle: "monthly",
    status: "active",
    access_type: "paid", // "paid" | "trial" | "free_grant"
    extra_days: 0,
    free_grant_days: 365,
    start_date: new Date().toISOString().slice(0, 10),
    custom_expiry: "",
    reason: ""
  });
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [submittingSub, setSubmittingSub] = useState(false);

  // Features & Temporary Feature Expiries State
  const [features, setFeatures] = useState({});
  const [tempFeatures, setTempFeatures] = useState({});
  const [savingFeatures, setSavingFeatures] = useState(false);

  const syncSubForm = useCallback((company) => {
    if (!company) return;
    const isFree = Boolean(company.is_free);
    const isTrial = company.subscription_status === "trialing" || Boolean(company.is_trial);
    const accessType = isFree ? "free_grant" : (isTrial ? "trial" : "paid");

    setSubForm({
      plan_id: (company.plan_id || "starter").toLowerCase(),
      billing_cycle: (company.billing_cycle || "monthly").toLowerCase(),
      status: company.subscription_status || (isTrial ? "trialing" : "active"),
      access_type: accessType,
      extra_days: 0,
      free_grant_days: company.free_grant_days || 365,
      start_date: company.free_grant_started_at ? company.free_grant_started_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
      custom_expiry: "",
      reason: ""
    });
  }, []);

  const fetchCustomerDetail = useCallback(async () => {
    try {
      const res = await api.get(`/platform-owner/customers/${id}`);
      setData(res.data);
      if (res.data?.company) {
        syncSubForm(res.data.company);
      }
      setFeatures(res.data?.company?.feature_entitlements || {});
      setTempFeatures(res.data?.company?.temporary_features || {});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id, syncSubForm]);

  useEffect(() => {
    setLoading(true);
    fetchCustomerDetail();

    // Auto-refresh customer details every 15s
    const interval = setInterval(fetchCustomerDetail, 15000);
    const handleFocus = () => fetchCustomerDetail();
    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [fetchCustomerDetail]);

  const handleSubSubmit = async (e) => {
    e.preventDefault();
    setSubmittingSub(true);
    try {
      await api.post(`/platform-owner/customers/${id}/subscription`, {
        action: "save_subscription",
        plan_id: subForm.plan_id,
        billing_cycle: subForm.billing_cycle,
        status: subForm.status,
        access_type: subForm.access_type,
        extra_days: parseInt(subForm.extra_days || 0, 10),
        free_grant_days: subForm.access_type === "free_grant" ? parseInt(subForm.free_grant_days || 365, 10) : 0,
        start_date: subForm.access_type === "free_grant" && subForm.start_date ? subForm.start_date : undefined,
        expiry_date: subForm.custom_expiry || undefined,
        reason: subForm.reason || "Super Admin unified subscription update",
        notify: notifyCustomer
      });

      if (notifyCustomer) {
        await api.post("/platform-owner/notifications", {
          target_type: "company",
          target_company_id: id,
          title: "Subscription Plan Updated",
          message: `Your SOLRIX workspace subscription has been updated (${subForm.plan_id.toUpperCase()} • ${subForm.billing_cycle.toUpperCase()}).`,
          type: "info"
        }).catch(() => {});
      }

      toast.success(`Subscription updated to ${subForm.plan_id.toUpperCase()} (${subForm.billing_cycle.toUpperCase()}) successfully!`);
      window.dispatchEvent(new Event("solarix:subscription-updated"));
      window.dispatchEvent(new Event("solarix:plan-config-updated"));
      window.dispatchEvent(new Event("solarix:auth-refresh"));
      setSubOpen(false);
      fetchCustomerDetail();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSubmittingSub(false);
    }
  };

  const handleToggleFeature = (featKey) => {
    setFeatures((prev) => ({
      ...prev,
      [featKey]: prev[featKey] !== undefined ? !prev[featKey] : false
    }));
  };

  const handleSaveFeatures = async () => {
    setSavingFeatures(true);
    try {
      await api.post(`/platform-owner/customers/${id}/features`, {
        feature_entitlements: features,
        temporary_features: tempFeatures,
        reason: "Manual feature override by Super Admin"
      });
      toast.success("Feature entitlements & temporary expiries saved successfully");
      window.dispatchEvent(new Event("solarix:plan-config-updated"));
      window.dispatchEvent(new Event("solarix:auth-refresh"));
      fetchCustomerDetail();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSavingFeatures(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-400 font-mono text-xs animate-pulse">Loading Customer Workspace Profile...</div>;
  }

  if (!data || !data.company) {
    return <div className="p-8 text-center text-rose-400 font-mono text-xs">Customer workspace not found.</div>;
  }

  const { company, owner, team_users = [], usage = {}, recent_activity = [] } = data;

  return (
    <div className="space-y-6 font-sans">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <Button size="xs" variant="outline" onClick={() => navigate("/control-center/customers")} className="border-slate-700 text-slate-300">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-400" /> {company.company_name}
            </h2>
            <div className="text-xs text-slate-400 font-mono">Workspace ID: {company.id}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button size="xs" variant="outline" onClick={() => setSubOpen(true)} className="border-slate-700 text-slate-200 gap-1 text-xs">
            <CreditCard className="w-3.5 h-3.5 text-blue-400" /> Manage Subscription
          </Button>
        </div>
      </div>

      {/* WORKSPACE OVERVIEW TABS */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-2 md:grid-cols-5 w-full bg-slate-950/80 p-1 rounded-xl border border-slate-800">
          <TabsTrigger value="company" className="text-xs font-semibold rounded-lg text-slate-300 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            Company Profile
          </TabsTrigger>
          <TabsTrigger value="subscription" className="text-xs font-semibold rounded-lg text-slate-300 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            Subscription & Limits
          </TabsTrigger>
          <TabsTrigger value="features" className="text-xs font-semibold rounded-lg text-slate-300 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            Feature Entitlements
          </TabsTrigger>
          <TabsTrigger value="team" className="text-xs font-semibold rounded-lg text-slate-300 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            Team Users ({team_users.length})
          </TabsTrigger>
          <TabsTrigger value="usage" className="text-xs font-semibold rounded-lg text-slate-300 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            Resource Usage & Activity
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: COMPANY PROFILE */}
        <TabsContent value="company" className="space-y-4">
          <Card className="bg-slate-950/60 border-slate-800 p-5 space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <span className="text-slate-400 font-semibold uppercase text-[10px]">Company Name</span>
                <div className="text-sm font-bold text-white mt-0.5">{company.company_name || "Not available"}</div>
              </div>

              <div>
                <span className="text-slate-400 font-semibold uppercase text-[10px]">Owner / Admin</span>
                <div className="text-sm font-bold text-white mt-0.5">{owner.name || company.owner_name || "Not available"}</div>
              </div>

              <div>
                <span className="text-slate-400 font-semibold uppercase text-[10px]">Work Email</span>
                <div className="text-xs text-slate-200 font-mono mt-0.5">{owner.email || company.email || "Not available"}</div>
              </div>

              <div>
                <span className="text-slate-400 font-semibold uppercase text-[10px]">Mobile Number</span>
                <div className="text-xs text-slate-200 font-mono mt-0.5">{owner.mobile || company.mobile || "Not available"}</div>
              </div>

              <div>
                <span className="text-slate-400 font-semibold uppercase text-[10px]">Alternate Mobile</span>
                <div className="text-xs text-slate-200 font-mono mt-0.5">{company.alt_mobile || "Not available"}</div>
              </div>

              <div>
                <span className="text-slate-400 font-semibold uppercase text-[10px]">GSTIN</span>
                <div className="text-xs text-slate-200 font-mono mt-0.5">{company.gst_number || "Not available"}</div>
              </div>

              <div>
                <span className="text-slate-400 font-semibold uppercase text-[10px]">Business Type</span>
                <div className="text-xs text-slate-200 mt-0.5">{company.business_type || "Not available"}</div>
              </div>

              <div>
                <span className="text-slate-400 font-semibold uppercase text-[10px]">Website</span>
                <div className="text-xs text-slate-200 mt-0.5">{company.website || "Not available"}</div>
              </div>

              <div>
                <span className="text-slate-400 font-semibold uppercase text-[10px]">Address</span>
                <div className="text-xs text-slate-200 mt-0.5">{company.address || "Not available"}</div>
              </div>

              <div>
                <span className="text-slate-400 font-semibold uppercase text-[10px]">City / State / PIN</span>
                <div className="text-xs text-slate-200 mt-0.5">
                  {company.city || company.state ? `${company.city || ""}, ${company.state || ""}` : "Not available"} {company.pincode ? `(${company.pincode})` : ""}
                </div>
              </div>

              <div>
                <span className="text-slate-400 font-semibold uppercase text-[10px]">Registration Date</span>
                <div className="text-xs text-slate-200 font-mono mt-0.5">
                  {company.created_at ? new Date(company.created_at).toLocaleString() : "Not available"}
                </div>
              </div>

              <div>
                <span className="text-slate-400 font-semibold uppercase text-[10px]">Last Login</span>
                <div className="text-xs text-slate-200 font-mono mt-0.5">
                  {owner.last_login ? new Date(owner.last_login).toLocaleString() : "Not available"}
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* TAB 2: SUBSCRIPTION */}
        <TabsContent value="subscription" className="space-y-4">
          <Card className="bg-slate-950/60 border-slate-800 p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="font-bold text-sm text-white">Current Subscription & Plan Details</span>
                <p className="text-[11px] text-slate-400">Canonical subscription state and real-time database quotas.</p>
              </div>
              <Button size="sm" onClick={() => setSubOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-xs gap-1.5 font-semibold">
                <CreditCard className="w-3.5 h-3.5" /> Edit Subscription
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 font-mono">
              <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
                <span className="text-slate-400 text-[10px] uppercase font-semibold">CURRENT PLAN</span>
                <div className="pt-1">
                  <PlanBadge planId={company.plan_id} size="md" />
                </div>
                <div className="text-[11px] text-slate-400 pt-1 font-sans">
                  {company.plan_name || company.plan_id?.toUpperCase() || "STARTER"} Plan
                </div>
              </div>

              <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
                <span className="text-slate-400 text-[10px] uppercase font-semibold">SUBSCRIPTION STATUS</span>
                <div className={`text-lg font-bold uppercase pt-1 ${company.subscription_status === "active" ? "text-emerald-400" : company.subscription_status === "trialing" ? "text-blue-400" : "text-rose-400"}`}>
                  {company.subscription_status || "Active"}
                </div>
                <div className="text-[10px] text-slate-400 font-sans">
                  Cycle: <strong className="uppercase text-slate-300">{company.billing_cycle || "monthly"}</strong>
                </div>
              </div>

              <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
                <span className="text-slate-400 text-[10px] uppercase font-semibold">ACCESS TYPE</span>
                <div className="pt-1">
                  {company.is_free ? (
                    <Badge className="bg-purple-950/80 text-purple-300 border-purple-800 font-mono text-[10px] gap-1">
                      <Gift className="w-3 h-3 text-purple-400" /> Free Admin Grant
                    </Badge>
                  ) : company.subscription_status === "trialing" ? (
                    <Badge className="bg-blue-950/80 text-blue-300 border-blue-800 font-mono text-[10px] gap-1">
                      <Clock className="w-3 h-3 text-blue-400" /> 15-Day Trial
                    </Badge>
                  ) : (
                    <Badge className="bg-emerald-950/80 text-emerald-300 border-emerald-800 font-mono text-[10px] gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Paid Subscription
                    </Badge>
                  )}
                </div>
                {company.extra_days > 0 && (
                  <div className="text-[10px] text-indigo-400 font-sans">
                    Includes +{company.extra_days} extra days
                  </div>
                )}
              </div>

              <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
                <span className="text-slate-400 text-[10px] uppercase font-semibold">EFFECTIVE EXPIRY</span>
                <div className="text-sm font-bold text-amber-300 pt-1">
                  {company.subscription_expires_at ? new Date(company.subscription_expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : company.trial_ends_at ? new Date(company.trial_ends_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "No Expiry"}
                </div>
                <div className="text-[10px] text-slate-400 font-sans">
                  {data?.entitlement?.days_remaining !== undefined ? `${data.entitlement.days_remaining} days remaining` : "Active"}
                </div>
              </div>
            </div>

            {/* LIVE PLAN LIMITS & USAGE METRICS */}
            <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-[10px] uppercase font-semibold">LIVE RESOURCE USAGE & PLAN LIMITS</span>
                <span className="text-slate-500 text-[10px]">Real-time Database Quotas</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-2.5 bg-slate-950/80 rounded-lg border border-slate-800/60">
                  <span className="text-[10px] text-slate-400 block">Team Users</span>
                  <span className="text-sm font-bold text-white font-mono">
                    {data?.usage?.users || 0} / {data?.entitlement?.limits?.max_users || 3}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-950/80 rounded-lg border border-slate-800/60">
                  <span className="text-[10px] text-slate-400 block">Clients & Projects</span>
                  <span className="text-sm font-bold text-white font-mono">
                    {data?.usage?.clients || 0} / {data?.entitlement?.limits?.max_clients || 100}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-950/80 rounded-lg border border-slate-800/60">
                  <span className="text-[10px] text-slate-400 block">Product Master</span>
                  <span className="text-sm font-bold text-white font-mono">
                    {data?.usage?.products || 0} / {data?.entitlement?.limits?.max_products || 1000}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-950/80 rounded-lg border border-slate-800/60">
                  <span className="text-[10px] text-slate-400 block">Storage Quota</span>
                  <span className="text-sm font-bold text-white font-mono">
                    {data?.detailed_usage?.storage_gb || 0} / {data?.entitlement?.limits?.storage_gb || 5} GB
                  </span>
                </div>
                <div className="p-2.5 bg-slate-950/80 rounded-lg border border-slate-800/60">
                  <span className="text-[10px] text-slate-400 block">Monthly PDF/DOCX</span>
                  <span className="text-sm font-bold text-white font-mono">
                    {data?.detailed_usage?.monthly_pdf_docx || 0} / {data?.entitlement?.limits?.monthly_pdf_docx || 200}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-950/80 rounded-lg border border-slate-800/60">
                  <span className="text-[10px] text-slate-400 block">Monthly Exports</span>
                  <span className="text-sm font-bold text-white font-mono">
                    {data?.detailed_usage?.monthly_exports || 0} / {data?.entitlement?.limits?.monthly_exports || 50}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-950/80 rounded-lg border border-slate-800/60">
                  <span className="text-[10px] text-slate-400 block">Material Requests</span>
                  <span className="text-sm font-bold text-white font-mono">
                    {data?.detailed_usage?.monthly_material_requests || 0} / {data?.entitlement?.limits?.monthly_material_requests || 1000}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-950/80 rounded-lg border border-slate-800/60">
                  <span className="text-[10px] text-slate-400 block">Inventory Txns</span>
                  <span className="text-sm font-bold text-white font-mono">
                    {data?.detailed_usage?.monthly_inventory_transactions || 0} / {data?.entitlement?.limits?.monthly_inventory_transactions || 2500}
                  </span>
                </div>
              </div>
            </div>

            {/* BILLING & PAYMENT GATEWAY RECORD */}
            <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800/80 space-y-2">
              <span className="text-slate-400 text-[10px] uppercase font-semibold">PAYMENT & GATEWAY DETAILS</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-300 font-mono pt-1">
                <div>
                  <span className="text-slate-500 text-[10px] block">GATEWAY REF ID</span>
                  <span>{company.razorpay_subscription_id || "Manual Super Admin / Direct"}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">TRIAL STARTED</span>
                  <span>{company.trial_started_at ? new Date(company.trial_started_at).toLocaleDateString() : "—"}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">SUBSCRIPTION STARTED</span>
                  <span>{company.subscription_started_at ? new Date(company.subscription_started_at).toLocaleDateString() : "—"}</span>
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* TAB 3: FEATURE ENTITLEMENTS */}
        <TabsContent value="features" className="space-y-4">
          <Card className="bg-slate-950/60 border-slate-800 p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="font-bold text-sm text-white">Workspace Feature Entitlements</span>
                <p className="text-[11px] text-slate-400">Override features specifically for this customer workspace.</p>
              </div>
              <Button size="xs" onClick={handleSaveFeatures} disabled={savingFeatures} className="bg-blue-600 hover:bg-blue-700 text-xs">
                {savingFeatures ? "Saving..." : "Save Feature Overrides"}
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {ALL_FEATURES.map((f) => {
                const isEnabled = features[f.key] !== undefined ? !!features[f.key] : true;
                return (
                  <div key={f.key} className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 flex items-center justify-between">
                    <span className="font-semibold text-slate-200">{f.label}</span>
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={() => handleToggleFeature(f.key)}
                    />
                  </div>
                );
              })}
            </div>
          </Card>
        </TabsContent>

        {/* TAB 4: TEAM USERS */}
        <TabsContent value="team" className="space-y-4">
          <Card className="bg-slate-950/60 border-slate-800 overflow-hidden">
            <div className="p-3 bg-slate-900 font-bold text-xs text-white border-b border-slate-800">
              Customer Team Members ({team_users.length})
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-900/50 text-slate-400 font-semibold border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-2.5">User</th>
                    <th className="px-4 py-2.5">Email</th>
                    <th className="px-4 py-2.5">Mobile</th>
                    <th className="px-4 py-2.5">Role</th>
                    <th className="px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-200 font-mono">
                  {team_users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-800/30">
                      <td className="px-4 py-2.5 font-bold text-white font-sans">{u.name}</td>
                      <td className="px-4 py-2.5">{u.email}</td>
                      <td className="px-4 py-2.5">{u.mobile}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-300 border-blue-500/30">
                          {u.role}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5">{u.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* TAB 5: RESOURCE USAGE & ACTIVITY */}
        <TabsContent value="usage" className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <span className="text-slate-400 text-[10px]">CLIENTS</span>
              <div className="text-xl font-bold text-white">{usage.clients || 0}</div>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <span className="text-slate-400 text-[10px]">PROJECTS</span>
              <div className="text-xl font-bold text-white">{usage.projects || 0}</div>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <span className="text-slate-400 text-[10px]">INVOICES</span>
              <div className="text-xl font-bold text-white">{usage.invoices || 0}</div>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <span className="text-slate-400 text-[10px]">PRODUCTS</span>
              <div className="text-xl font-bold text-white">{usage.products || 0}</div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* UNIFIED SUBSCRIPTION MANAGEMENT MODAL */}
      <Dialog open={subOpen} onOpenChange={setSubOpen}>
        <DialogContent className="bg-slate-950 border-slate-800 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-blue-400" /> Manage Customer Plan & Subscription
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubSubmit} className="space-y-4 text-xs py-2">
            {/* WORKSPACE BANNER */}
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Workspace</div>
                <div className="font-bold text-white text-sm mt-0.5">{company.company_name}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Current Plan</div>
                <div className="pt-1"><PlanBadge planId={company.plan_id} /></div>
              </div>
            </div>

            {/* 1. CORE SUBSCRIPTION SETTINGS */}
            <div className="p-4 bg-slate-900/80 rounded-xl border border-slate-800 space-y-3">
              <span className="text-slate-300 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-400" /> 1. Plan & Billing Settings
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-slate-300 text-[11px]">Target Plan</Label>
                  <Select value={subForm.plan_id} onValueChange={(v) => setSubForm({ ...subForm, plan_id: v })}>
                    <SelectTrigger className="mt-1 bg-slate-900 border-slate-700 text-white h-9"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-slate-900 text-white border-slate-700">
                      <SelectItem value="starter">STARTER</SelectItem>
                      <SelectItem value="growth">GROWTH</SelectItem>
                      <SelectItem value="pro">PRO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-slate-300 text-[11px]">Billing Cycle</Label>
                  <Select value={subForm.billing_cycle} onValueChange={(v) => setSubForm({ ...subForm, billing_cycle: v })}>
                    <SelectTrigger className="mt-1 bg-slate-900 border-slate-700 text-white h-9"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-slate-900 text-white border-slate-700">
                      <SelectItem value="monthly">Monthly Cycle</SelectItem>
                      <SelectItem value="yearly">Yearly / Annual Cycle</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-slate-300 text-[11px]">Subscription Status</Label>
                  <Select value={subForm.status} onValueChange={(v) => setSubForm({ ...subForm, status: v })}>
                    <SelectTrigger className="mt-1 bg-slate-900 border-slate-700 text-white h-9"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-slate-900 text-white border-slate-700">
                      <SelectItem value="active">Active (Full Access)</SelectItem>
                      <SelectItem value="trialing">Trialing (Free Trial)</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                      <SelectItem value="past_due">Past Due</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-slate-300 text-[11px]">Access Type</Label>
                  <Select value={subForm.access_type} onValueChange={(v) => setSubForm({ ...subForm, access_type: v })}>
                    <SelectTrigger className="mt-1 bg-slate-900 border-slate-700 text-white h-9"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-slate-900 text-white border-slate-700">
                      <SelectItem value="paid">Paid Subscription</SelectItem>
                      <SelectItem value="trial">15-Day Free Trial</SelectItem>
                      <SelectItem value="free_grant">Free Admin Grant (₹0 / Custom Period)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* 2. FREE ADMIN GRANT CONFIGURATION (Shown when Free Grant is selected) */}
            {subForm.access_type === "free_grant" && (
              <div className="p-4 bg-purple-950/40 rounded-xl border border-purple-800/60 space-y-3">
                <span className="text-purple-300 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                  <Gift className="w-3.5 h-3.5 text-purple-400" /> 2. Free Admin Access Grant (₹0 Charged)
                </span>

                <div className="p-2.5 bg-purple-900/30 border border-purple-800/40 rounded-lg text-purple-200 text-[11px]">
                  <strong>100% Free Plan Access:</strong> The customer receives all features and limits of <strong>{subForm.plan_id.toUpperCase()}</strong> at ₹0 price. Standard plan pricing in configuration is untouched.
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-300 text-[11px]">Free Grant Duration Presets</Label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: "15 Days", days: 15 },
                      { label: "30 Days (1 Mo)", days: 30 },
                      { label: "90 Days (3 Mo)", days: 90 },
                      { label: "180 Days (6 Mo)", days: 180 },
                      { label: "365 Days (1 Yr)", days: 365 },
                    ].map((p) => (
                      <button
                        key={p.days}
                        type="button"
                        onClick={() => setSubForm({ ...subForm, free_grant_days: p.days })}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition ${
                          subForm.free_grant_days === p.days
                            ? "bg-purple-600 text-white border-purple-500 shadow-sm"
                            : "bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <Label className="text-slate-300 text-[11px]">Custom Duration (Days)</Label>
                    <Input
                      type="number"
                      min="1"
                      value={subForm.free_grant_days}
                      onChange={(e) => setSubForm({ ...subForm, free_grant_days: Math.max(1, parseInt(e.target.value || 1, 10)) })}
                      className="mt-1 bg-slate-900 border-slate-700 text-white h-9 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-300 text-[11px]">Start Date</Label>
                    <Input
                      type="date"
                      value={subForm.start_date}
                      onChange={(e) => setSubForm({ ...subForm, start_date: e.target.value })}
                      className="mt-1 bg-slate-900 border-slate-700 text-white h-9 text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 3. ADMIN ADJUSTMENT: EXTRA EXTENSION DAYS (Shown for Paid / Trial) */}
            {subForm.access_type !== "free_grant" && (
              <div className="p-4 bg-slate-900/80 rounded-xl border border-slate-800 space-y-3">
                <span className="text-slate-300 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-indigo-400" /> 2. Administrative Extension (Extra Days)
                </span>

                <div className="space-y-2">
                  <Label className="text-slate-300 text-[11px]">Quick Extension Presets</Label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: "+7 Days", days: 7 },
                      { label: "+15 Days (Training)", days: 15 },
                      { label: "+30 Days (1 Mo)", days: 30 },
                      { label: "+60 Days (2 Mo)", days: 60 },
                      { label: "+90 Days (3 Mo)", days: 90 },
                      { label: "+365 Days (1 Yr)", days: 365 },
                    ].map((p) => (
                      <button
                        key={p.days}
                        type="button"
                        onClick={() => setSubForm({ ...subForm, extra_days: p.days })}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition ${
                          subForm.extra_days === p.days
                            ? "bg-indigo-600 text-white border-indigo-500 shadow-sm"
                            : "bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                    {subForm.extra_days > 0 && (
                      <button
                        type="button"
                        onClick={() => setSubForm({ ...subForm, extra_days: 0 })}
                        className="px-2 py-1 rounded-md text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700 hover:text-white"
                      >
                        Reset to 0
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <Label className="text-slate-300 text-[11px]">Extra Extension Days</Label>
                  <Input
                    type="number"
                    min="0"
                    value={subForm.extra_days}
                    onChange={(e) => setSubForm({ ...subForm, extra_days: Math.max(0, parseInt(e.target.value || 0, 10)) })}
                    placeholder="Enter extra days (e.g. 15, 30, 60)"
                    className="mt-1 bg-slate-900 border-slate-700 text-white h-9 text-xs"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Adds days directly to the existing expiration without changing billing price or plan.
                  </span>
                </div>
              </div>
            )}

            {/* 4. OPTIONAL CUSTOM EXPIRY OVERRIDE */}
            <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800/80 space-y-1.5">
              <Label className="text-slate-300 text-[11px]">Custom Expiry Override (Optional)</Label>
              <Input
                type="date"
                value={subForm.custom_expiry}
                onChange={(e) => setSubForm({ ...subForm, custom_expiry: e.target.value })}
                className="bg-slate-900 border-slate-700 text-white h-8 text-xs"
              />
              <span className="text-[10px] text-slate-500">
                Leave blank to let the system automatically compute the effective expiry date.
              </span>
            </div>

            {/* 5. EFFECTIVE SUBSCRIPTION LIVE PREVIEW */}
            <div className="p-4 bg-blue-950/30 rounded-xl border border-blue-800/60 space-y-2.5">
              <div className="text-[10px] text-blue-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" /> Effective Subscription Preview
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-[11px]">
                {/* Current */}
                <div className="p-3 bg-slate-900/90 rounded-lg border border-slate-800 space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">CURRENT STATE</div>
                  <div className="font-bold text-white text-xs">{company.plan_id?.toUpperCase() || "STARTER"} ({company.billing_cycle || "monthly"})</div>
                  <div className="text-slate-400">Status: <span className="text-slate-200 uppercase">{company.subscription_status || "Active"}</span></div>
                  <div className="text-slate-400">
                    Expires: <span className="text-amber-300">
                      {company.subscription_expires_at ? new Date(company.subscription_expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : company.trial_ends_at ? new Date(company.trial_ends_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "No Expiry"}
                    </span>
                  </div>
                </div>

                {/* After Save */}
                <div className="p-3 bg-blue-900/20 rounded-lg border border-blue-700/50 space-y-1">
                  <div className="text-[10px] text-blue-300 uppercase font-semibold">AFTER SAVE (TARGET)</div>
                  <div className="font-bold text-blue-200 text-xs">{subForm.plan_id.toUpperCase()} ({subForm.billing_cycle.toUpperCase()})</div>
                  <div className="text-blue-300/80">Status: <span className="text-white uppercase font-bold">{subForm.status}</span> ({subForm.access_type === "free_grant" ? "Free Grant ₹0" : subForm.access_type})</div>
                  <div className="text-blue-300/80">
                    Effective Expiry: <strong className="text-emerald-400">
                      {(() => {
                        if (subForm.custom_expiry) return subForm.custom_expiry;
                        const now = new Date();
                        if (subForm.access_type === "free_grant") {
                          const start = subForm.start_date ? new Date(subForm.start_date) : now;
                          const exp = new Date(start.getTime() + (parseInt(subForm.free_grant_days || 365, 10)) * 86400000);
                          return exp.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
                        }
                        const baseExpiryStr = subForm.access_type === "trial" ? company.trial_ends_at : company.subscription_expires_at;
                        let baseDate = baseExpiryStr ? new Date(baseExpiryStr) : now;
                        if (isNaN(baseDate.getTime()) || baseDate < now) baseDate = now;
                        const addedDays = parseInt(subForm.extra_days || 0, 10);
                        const cycleDays = (!baseExpiryStr && subForm.access_type === "paid") ? (subForm.billing_cycle === "yearly" ? 365 : 30) : 0;
                        const finalDate = new Date(baseDate.getTime() + (addedDays + cycleDays) * 86400000);
                        return finalDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
                      })()}
                    </strong>
                    {subForm.extra_days > 0 && <span className="text-[10px] text-indigo-300 ml-1">(+{subForm.extra_days} extra)</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* 6. AUDIT TRAIL REASON & NOTIFY */}
            <div className="space-y-2">
              <div>
                <Label className="text-slate-300 text-[11px]">Reason for Change (Audit Trail)</Label>
                <Input
                  value={subForm.reason}
                  onChange={(e) => setSubForm({ ...subForm, reason: e.target.value })}
                  placeholder="e.g. Added 30 training days / Free trial extension / Owner upgrade request"
                  className="mt-1 bg-slate-900 border-slate-700 text-white h-9 text-xs"
                  required
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="notify_customer_check"
                  checked={notifyCustomer}
                  onChange={(e) => setNotifyCustomer(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0"
                />
                <label htmlFor="notify_customer_check" className="text-[11px] text-slate-300 font-medium cursor-pointer">
                  Notify customer workspace via in-app notification banner
                </label>
              </div>
            </div>

            <DialogFooter className="pt-3 border-t border-slate-800 gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setSubOpen(false)} className="border-slate-700 text-slate-300">
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={submittingSub} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4">
                {submittingSub ? "Saving Changes..." : "SAVE CHANGES"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
