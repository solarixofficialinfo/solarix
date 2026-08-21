import React, { useState, useEffect } from "react";
import api from "@/lib/api";
import { CreditCard, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import PlanBadge from "@/components/PlanBadge";

const ALL_FEATURES = [
  { key: "core_crm", label: "Core CRM & Client Pipeline" },
  { key: "client_onboarding", label: "Client Onboarding Workflow" },
  { key: "project_management", label: "Project Execution & Tracking" },
  { key: "task_portal", label: "Task Portal & Assignee Workspace" },
  { key: "material_requests", label: "Material Requests" },
  { key: "basic_inventory", label: "Basic Inward / Outward Inventory" },
  { key: "product_master", label: "Product Master & Catalog" },
  { key: "basic_documents", label: "Basic Document Builder" },
  { key: "procurement", label: "Purchase Orders & Procurement" },
  { key: "advanced_documents", label: "Annexure & Multi-Page Docs" },
  { key: "receivables", label: "Receivables & Financial Workspace" },
  { key: "loan_finance", label: "Loan & Subsidies Management" },
  { key: "expenses", label: "Project Profitability & Expenses" },
  { key: "advanced_reports", label: "Advanced Analytics & Audit Reports" },
  { key: "advanced_permissions", label: "Custom Role & Page Permissions" },
  { key: "multi_branch", label: "Multi-Branch & State Support" },
  { key: "api_integrations", label: "API & External Integrations" },
  { key: "custom_branding", label: "Custom Branding & Whitelabel Docs" },
];

export default function PlansEntitlements() {
  const [plans, setPlans] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingPlan, setSavingPlan] = useState(null);

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const res = await api.get("/platform-owner/plans");
      setPlans(res.data || {});
    } catch (err) {
      toast.error("Failed to load plan configurations");
    } finally {
      setLoading(false);
    }
  };

  const handlePriceChange = (pid, field, val) => {
    setPlans((prev) => ({
      ...prev,
      [pid]: {
        ...prev[pid],
        [field]: Number(val) || 0,
      },
    }));
  };

  const handleLimitChange = (pid, field, val) => {
    setPlans((prev) => ({
      ...prev,
      [pid]: {
        ...prev[pid],
        [field]: Number(val) || 0,
      },
    }));
  };

  const toggleFeature = (pid, featureKey) => {
    setPlans((prev) => {
      const currPlan = prev[pid];
      const currFeatures = currPlan.features || {};
      return {
        ...prev,
        [pid]: {
          ...currPlan,
          features: {
            ...currFeatures,
            [featureKey]: !currFeatures[featureKey],
          },
        },
      };
    });
  };

  const savePlan = async (pid) => {
    try {
      setSavingPlan(pid);
      const planData = plans[pid];
      await api.put(`/platform-owner/plans/${pid}`, {
        name: planData.name,
        tagline: planData.tagline || "",
        monthly_price: planData.monthly_price,
        yearly_price: planData.yearly_price,
        max_users: planData.max_users,
        max_clients: planData.max_clients,
        max_products: planData.max_products || 1000,
        storage_gb: planData.storage_gb || 5,
        monthly_documents: planData.monthly_documents || 500,
        monthly_pdf_docx: planData.monthly_pdf_docx || 200,
        monthly_exports: planData.monthly_exports || 50,
        monthly_material_requests: planData.monthly_material_requests || 1000,
        monthly_inventory_transactions: planData.monthly_inventory_transactions || 2500,
        monthly_api_requests: planData.monthly_api_requests || 0,
        active: planData.active !== false,
        features: planData.features || {},
      });
      toast.success(`Plan '${planData.name}' limits and entitlements saved successfully!`);
    } catch (err) {
      toast.error(`Failed to save plan '${pid}'`);
    } finally {
      setSavingPlan(null);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-400 font-mono text-xs">Loading plans & entitlements configuration...</div>;
  }

  const planKeys = Object.keys(plans);

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2" style={{ fontFamily: "Outfit" }}>
          <CreditCard className="w-5 h-5 text-blue-400" /> Plans, Smart Limits & Feature Entitlements
        </h1>
        <p className="text-xs text-slate-400">
          Configure subscription plan pricing, storage quotas, monthly document/export limits, and feature entitlement matrices.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {planKeys.map((pid) => {
          const p = plans[pid];
          const isSaving = savingPlan === pid;
          return (
            <Card key={pid} className="bg-slate-950 border-slate-800 text-slate-100 flex flex-col shadow-lg">
              <CardHeader className="border-b border-slate-800 pb-4">
                <div className="flex items-center justify-between">
                  <PlanBadge planId={pid} size="md" />
                  {p.badge && <Badge className="bg-emerald-600 text-white text-[9px]">{p.badge}</Badge>}
                </div>
                <CardTitle className="text-lg font-bold text-white mt-2">{p.name}</CardTitle>
                <CardDescription className="text-xs text-slate-400">{p.tagline || "Subscription Plan"}</CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-4 flex-1 flex flex-col justify-between">
                <div className="space-y-3">
                  {/* Pricing Inputs */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-400 font-semibold uppercase">Monthly (₹)</label>
                      <Input
                        type="number"
                        value={p.monthly_price || 0}
                        onChange={(e) => handlePriceChange(pid, "monthly_price", e.target.value)}
                        className="h-8 bg-slate-900 border-slate-700 text-white text-xs font-mono mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 font-semibold uppercase">Yearly (₹)</label>
                      <Input
                        type="number"
                        value={p.yearly_price || 0}
                        onChange={(e) => handlePriceChange(pid, "yearly_price", e.target.value)}
                        className="h-8 bg-slate-900 border-slate-700 text-white text-xs font-mono mt-1"
                      />
                    </div>
                  </div>

                  {/* Core State Limits */}
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
                    <div>
                      <label className="text-[10px] text-slate-400 font-semibold uppercase">Max Users</label>
                      <Input
                        type="number"
                        value={p.max_users || 0}
                        onChange={(e) => handleLimitChange(pid, "max_users", e.target.value)}
                        className="h-8 bg-slate-900 border-slate-700 text-white text-xs font-mono mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 font-semibold uppercase">Max Clients</label>
                      <Input
                        type="number"
                        value={p.max_clients || 0}
                        onChange={(e) => handleLimitChange(pid, "max_clients", e.target.value)}
                        className="h-8 bg-slate-900 border-slate-700 text-white text-xs font-mono mt-1"
                      />
                    </div>
                  </div>

                  {/* EPC Resource Limits */}
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
                    <div>
                      <label className="text-[10px] text-slate-400 font-semibold uppercase">Max Products</label>
                      <Input
                        type="number"
                        value={p.max_products || 1000}
                        onChange={(e) => handleLimitChange(pid, "max_products", e.target.value)}
                        className="h-8 bg-slate-900 border-slate-700 text-white text-xs font-mono mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 font-semibold uppercase">Storage (GB)</label>
                      <Input
                        type="number"
                        value={p.storage_gb || 5}
                        onChange={(e) => handleLimitChange(pid, "storage_gb", e.target.value)}
                        className="h-8 bg-slate-900 border-slate-700 text-white text-xs font-mono mt-1"
                      />
                    </div>
                  </div>

                  {/* Monthly Activity Limits */}
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
                    <div>
                      <label className="text-[10px] text-slate-400 font-semibold uppercase">Monthly PDFs</label>
                      <Input
                        type="number"
                        value={p.monthly_pdf_docx || 200}
                        onChange={(e) => handleLimitChange(pid, "monthly_pdf_docx", e.target.value)}
                        className="h-8 bg-slate-900 border-slate-700 text-white text-xs font-mono mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 font-semibold uppercase">Monthly Exports</label>
                      <Input
                        type="number"
                        value={p.monthly_exports || 50}
                        onChange={(e) => handleLimitChange(pid, "monthly_exports", e.target.value)}
                        className="h-8 bg-slate-900 border-slate-700 text-white text-xs font-mono mt-1"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
                    <div>
                      <label className="text-[10px] text-slate-400 font-semibold uppercase">Inventory Txns/mo</label>
                      <Input
                        type="number"
                        value={p.monthly_inventory_transactions || 2500}
                        onChange={(e) => handleLimitChange(pid, "monthly_inventory_transactions", e.target.value)}
                        className="h-8 bg-slate-900 border-slate-700 text-white text-xs font-mono mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 font-semibold uppercase">API Calls/mo</label>
                      <Input
                        type="number"
                        value={p.monthly_api_requests || 0}
                        onChange={(e) => handleLimitChange(pid, "monthly_api_requests", e.target.value)}
                        className="h-8 bg-slate-900 border-slate-700 text-white text-xs font-mono mt-1"
                      />
                    </div>
                  </div>

                  {/* Feature Entitlements Toggle Matrix */}
                  <div className="pt-3 border-t border-slate-800 space-y-2">
                    <div className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                      <span>Feature Entitlements</span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {Object.values(p.features || {}).filter(Boolean).length} / {ALL_FEATURES.length} Enabled
                      </span>
                    </div>

                    <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                      {ALL_FEATURES.map((feat) => {
                        const enabled = Boolean(p.features?.[feat.key]);
                        return (
                          <div
                            key={feat.key}
                            onClick={() => toggleFeature(pid, feat.key)}
                            className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition-all border ${
                              enabled ? "bg-blue-950/40 border-blue-800/40 text-blue-200" : "bg-slate-900/50 border-slate-800 text-slate-400"
                            }`}
                          >
                            <span className="text-[11px]">{feat.label}</span>
                            <Switch checked={enabled} onCheckedChange={() => toggleFeature(pid, feat.key)} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <Button
                  size="sm"
                  onClick={() => savePlan(pid)}
                  disabled={isSaving}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs mt-4"
                >
                  <Save className="w-3.5 h-3.5 mr-1.5" />
                  {isSaving ? "Saving..." : `Save ${p.name} Configuration`}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
