import React, { useEffect, useState } from "react";
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
  ArrowLeft, ShieldCheck, Clock, CheckCircle2, AlertTriangle, Key, ExternalLink
} from "lucide-react";

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
  { key: "receivables", label: "Receivables & Invoicing" },
  { key: "purchase_orders", label: "Purchase Orders" },
  { key: "sales_documents", label: "Sales Documents & Quotations" },
  { key: "documents", label: "Document Templates" },
  { key: "reports", label: "Reports & Financial Summary" },
];

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("company");

  // Subscription Edit Dialog state
  const [subOpen, setSubOpen] = useState(false);
  const [subForm, setSubForm] = useState({ plan_id: "starter", status: "active", trial_days: 15, reason: "" });
  const [submittingSub, setSubmittingSub] = useState(false);

  // Features State
  const [features, setFeatures] = useState({});
  const [savingFeatures, setSavingFeatures] = useState(false);

  useEffect(() => {
    fetchCustomerDetail();
  }, [id]);

  const fetchCustomerDetail = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/platform-owner/customers/${id}`);
      setData(res.data);
      setSubForm({
        plan_id: res.data?.company?.plan_id || "starter",
        status: res.data?.company?.subscription_status || "active",
        trial_days: 15,
        reason: ""
      });
      setFeatures(res.data?.company?.feature_entitlements || {});
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSubSubmit = async (e) => {
    e.preventDefault();
    setSubmittingSub(true);
    try {
      await api.post(`/platform-owner/customers/${id}/subscription`, {
        action: "assign_plan",
        plan_id: subForm.plan_id,
        status: subForm.status,
        reason: subForm.reason
      });
      toast.success("Subscription updated successfully");
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
        reason: "Manual feature toggle by Platform Owner"
      });
      toast.success("Feature entitlements saved successfully");
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className="text-slate-400 font-semibold uppercase text-[10px]">Company Name</span>
                <div className="text-sm font-bold text-white mt-0.5">{company.company_name}</div>
              </div>

              <div>
                <span className="text-slate-400 font-semibold uppercase text-[10px]">Owner / Admin</span>
                <div className="text-sm font-bold text-white mt-0.5">{owner.name || company.owner_name}</div>
              </div>

              <div>
                <span className="text-slate-400 font-semibold uppercase text-[10px]">Work Email</span>
                <div className="text-xs text-slate-200 font-mono mt-0.5">{owner.email || company.email}</div>
              </div>

              <div>
                <span className="text-slate-400 font-semibold uppercase text-[10px]">Mobile Number</span>
                <div className="text-xs text-slate-200 font-mono mt-0.5">{owner.mobile || company.mobile || "—"}</div>
              </div>

              <div>
                <span className="text-slate-400 font-semibold uppercase text-[10px]">GSTIN</span>
                <div className="text-xs text-slate-200 font-mono mt-0.5">{company.gst_number || "—"}</div>
              </div>

              <div>
                <span className="text-slate-400 font-semibold uppercase text-[10px]">Business Type</span>
                <div className="text-xs text-slate-200 mt-0.5">{company.business_type || "Solar EPC Installer"}</div>
              </div>

              <div>
                <span className="text-slate-400 font-semibold uppercase text-[10px]">Location / Address</span>
                <div className="text-xs text-slate-200 mt-0.5">
                  {company.city ? `${company.city}, ${company.state}` : "India"} {company.pincode ? `(${company.pincode})` : ""}
                </div>
              </div>

              <div>
                <span className="text-slate-400 font-semibold uppercase text-[10px]">Registration Date</span>
                <div className="text-xs text-slate-200 font-mono mt-0.5">
                  {company.created_at ? new Date(company.created_at).toLocaleString() : "—"}
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* TAB 2: SUBSCRIPTION */}
        <TabsContent value="subscription" className="space-y-4">
          <Card className="bg-slate-950/60 border-slate-800 p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="font-bold text-sm text-white">Current Subscription Details</span>
              <Button size="xs" onClick={() => setSubOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-xs">
                Edit Subscription
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono">
              <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
                <span className="text-slate-400 text-[10px]">CURRENT PLAN</span>
                <div className="text-lg font-bold text-white uppercase">{company.plan_id || "Starter"}</div>
              </div>

              <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
                <span className="text-slate-400 text-[10px]">STATUS</span>
                <div className="text-lg font-bold text-emerald-400 uppercase">{company.subscription_status || "Trialing"}</div>
              </div>

              <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
                <span className="text-slate-400 text-[10px]">TRIAL / EXPIRY ENDS</span>
                <div className="text-sm font-bold text-amber-300 mt-1">
                  {company.trial_ends_at ? new Date(company.trial_ends_at).toLocaleDateString() : "—"}
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

      {/* SUBSCRIPTION MODAL */}
      <Dialog open={subOpen} onOpenChange={setSubOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-md">
          <DialogHeader><DialogTitle>Edit Workspace Subscription</DialogTitle></DialogHeader>
          <form onSubmit={handleSubSubmit} className="space-y-3 text-xs py-2">
            <div>
              <Label className="text-slate-300">Target Plan</Label>
              <Select value={subForm.plan_id} onValueChange={(v) => setSubForm({ ...subForm, plan_id: v })}>
                <SelectTrigger className="mt-1 bg-slate-800 border-slate-700 text-white h-8"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 text-white border-slate-700">
                  <SelectItem value="starter">STARTER</SelectItem>
                  <SelectItem value="growth">GROWTH</SelectItem>
                  <SelectItem value="pro">PRO</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-slate-300">Subscription Status</Label>
              <Select value={subForm.status} onValueChange={(v) => setSubForm({ ...subForm, status: v })}>
                <SelectTrigger className="mt-1 bg-slate-800 border-slate-700 text-white h-8"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 text-white border-slate-700">
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="trialing">Trialing</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-slate-300">Reason for Change (Audit Trail)</Label>
              <Input
                value={subForm.reason}
                onChange={(e) => setSubForm({ ...subForm, reason: e.target.value })}
                placeholder="e.g. Manual plan upgrade requested"
                className="mt-1 bg-slate-800 border-slate-700 text-white h-8 text-xs"
                required
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setSubOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={submittingSub} className="bg-blue-600 hover:bg-blue-700">
                {submittingSub ? "Updating..." : "Save Subscription"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
