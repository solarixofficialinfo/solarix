import React, { useState, useEffect, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import {
  CreditCard,
  Save,
  Briefcase,
  Database,
  Truck,
  FileText,
  DollarSign,
  BarChart3,
  ShieldAlert,
  Sparkles,
  Layers
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import PlanBadge from "@/components/PlanBadge";

const CATEGORIES = [
  {
    id: "core",
    title: "1. Core Workspace",
    icon: Briefcase,
    description: "CRM, client onboarding, project execution & task portal",
    features: [
      { key: "core_crm", label: "Core CRM & Client Pipeline" },
      { key: "client_onboarding", label: "Client Onboarding Workflow" },
      { key: "project_management", label: "Project Execution & Tracking" },
      { key: "task_portal", label: "Task Portal & Assignee Workspace" }
    ],
    limits: [
      { key: "max_clients", label: "Max Clients / Projects", type: "count", placeholder: "100" }
    ]
  },
  {
    id: "data",
    title: "2. Data Management",
    icon: Database,
    description: "Inward, outward stock, product master, serials & high value goods",
    features: [
      { key: "basic_inventory", label: "Basic Inward / Outward Inventory" },
      { key: "product_master", label: "Product Master & Catalog" },
      { key: "balance_report", label: "Balance Report & Stock Levels" },
      { key: "history", label: "Inventory Transaction History" },
      { key: "high_value_goods", label: "High Value Goods Tracking" },
      { key: "serial_tracking", label: "Serial Number Tracking" },
      { key: "advanced_inventory", label: "Advanced Inventory & Assets" }
    ],
    limits: [
      { key: "max_products", label: "Max Product Master Items", type: "count", placeholder: "1000" },
      { key: "monthly_inventory_transactions", label: "Monthly Inventory Transactions", type: "monthly", placeholder: "2500" }
    ]
  },
  {
    id: "material",
    title: "3. Material Management",
    icon: Truck,
    description: "Material requests, approval workflows & procurement",
    features: [
      { key: "material_requests", label: "Material Requests Workflow" },
      { key: "procurement", label: "Purchase Orders & Procurement" }
    ],
    limits: [
      { key: "monthly_material_requests", label: "Monthly Material Requests", type: "monthly", placeholder: "1000", dependsOn: "material_requests" }
    ]
  },
  {
    id: "documents",
    title: "4. Documents & Storage",
    icon: FileText,
    description: "Document builder, PDF/DOCX generation & cloud storage",
    features: [
      { key: "basic_documents", label: "Basic Document Builder" },
      { key: "advanced_documents", label: "Annexure & Multi-Page Documents" }
    ],
    limits: [
      { key: "monthly_pdf_docx", label: "Monthly PDF / DOCX Generations", type: "monthly", placeholder: "200" },
      { key: "storage_gb", label: "Document Storage (GB)", type: "storage", placeholder: "5" },
      { key: "monthly_documents", label: "Monthly Uploaded Documents", type: "monthly", placeholder: "500" }
    ]
  },
  {
    id: "finance",
    title: "5. Sales & Finance",
    icon: DollarSign,
    description: "Tax invoicing, receivables, loan tracking & project profitability",
    features: [
      { key: "receivables", label: "Receivables & Financial Workspace" },
      { key: "loan_finance", label: "Loan & Subsidies Management" },
      { key: "expenses", label: "Project Profitability & Expenses" },
      { key: "project_profitability", label: "Financial Audits & Profitability Analysis" }
    ],
    limits: []
  },
  {
    id: "reports",
    title: "6. Reports & Analytics",
    icon: BarChart3,
    description: "Standard reports, advanced analytics & data export quotas",
    features: [
      { key: "basic_reports", label: "Standard Operating Reports" },
      { key: "advanced_reports", label: "Advanced Analytics & Audit Logs" }
    ],
    limits: [
      { key: "monthly_exports", label: "Monthly Excel / PDF Exports", type: "monthly", placeholder: "50" }
    ]
  },
  {
    id: "admin",
    title: "7. Admin & Advanced",
    icon: ShieldAlert,
    description: "Team size, custom roles, multi-branch, branding & API access",
    features: [
      { key: "advanced_permissions", label: "Custom Role & Page Permissions" },
      { key: "multi_branch", label: "Multi-Branch & State Support" },
      { key: "api_integrations", label: "API & External Integrations" },
      { key: "custom_branding", label: "Custom Branding & Whitelabel Docs" },
      { key: "priority_support", label: "Priority Customer Support" },
      { key: "dedicated_support", label: "Dedicated Account Manager" }
    ],
    limits: [
      { key: "max_users", label: "Max Active Team Users", type: "count", placeholder: "3" },
      { key: "monthly_api_requests", label: "Monthly API Requests", type: "monthly", placeholder: "0", dependsOn: "api_integrations" }
    ]
  }
];

export default function PlansEntitlements() {
  const [plans, setPlans] = useState({});
  const [activePlan, setActivePlan] = useState("starter");
  const [loading, setLoading] = useState(true);
  const [savingPlan, setSavingPlan] = useState(null);

  const fetchPlans = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get("/platform-owner/plans");
      const fetched = res.data || {};
      setPlans(fetched);
      if (!fetched[activePlan] && Object.keys(fetched).length > 0) {
        setActivePlan(Object.keys(fetched)[0]);
      }
    } catch (err) {
      toast.error("Failed to load plan configurations");
    } finally {
      setLoading(false);
    }
  }, [activePlan]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const handlePriceChange = (pid, field, val) => {
    const num = Math.max(0, Number(val) || 0);
    setPlans((prev) => ({
      ...prev,
      [pid]: {
        ...prev[pid],
        [field]: num,
      },
    }));
  };

  const handleLimitChange = (pid, field, val) => {
    const num = Math.max(0, Number(val) || 0);
    setPlans((prev) => ({
      ...prev,
      [pid]: {
        ...prev[pid],
        [field]: num,
      },
    }));
  };

  const toggleFeature = (pid, featureKey) => {
    setPlans((prev) => {
      const currPlan = prev[pid];
      const currFeatures = currPlan.features || {};
      const newEnabled = !currFeatures[featureKey];
      return {
        ...prev,
        [pid]: {
          ...currPlan,
          features: {
            ...currFeatures,
            [featureKey]: newEnabled,
          },
        },
      };
    });
  };

  const savePlan = async (pid) => {
    const planData = plans[pid];
    if (!planData) return;

    // Validation
    if ((planData.monthly_price ?? 0) < 0 || (planData.yearly_price ?? 0) < 0) {
      toast.error("Plan prices cannot be negative.");
      return;
    }
    if ((planData.max_users ?? 0) < 1) {
      toast.error("Max users must be at least 1.");
      return;
    }
    if ((planData.max_clients ?? 0) < 1) {
      toast.error("Max clients must be at least 1.");
      return;
    }

    try {
      setSavingPlan(pid);
      await api.put(`/platform-owner/plans/${pid}`, {
        name: planData.name,
        tagline: planData.tagline || "",
        monthly_price: Number(planData.monthly_price) || 0,
        yearly_price: Number(planData.yearly_price) || 0,
        max_users: Number(planData.max_users) || 1,
        max_clients: Number(planData.max_clients) || 1,
        max_products: Number(planData.max_products) || 1000,
        storage_gb: Number(planData.storage_gb) || 5,
        monthly_documents: Number(planData.monthly_documents) || 500,
        monthly_pdf_docx: Number(planData.monthly_pdf_docx) || 200,
        monthly_exports: Number(planData.monthly_exports) || 50,
        monthly_material_requests: Number(planData.monthly_material_requests) || 1000,
        monthly_inventory_transactions: Number(planData.monthly_inventory_transactions) || 2500,
        monthly_api_requests: Number(planData.monthly_api_requests) || 0,
        active: planData.active !== false,
        features: planData.features || {},
      });
      toast.success(`Plan '${planData.name}' entitlements & limits updated successfully!`);
      // Trigger live plan and auth / subscription refresh across open views
      window.dispatchEvent(new Event("solarix:plan-config-updated"));
      window.dispatchEvent(new Event("solarix:auth-refresh"));
      // Refetch saved canonical values directly from backend
      await fetchPlans();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSavingPlan(null);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-400 font-mono text-xs">Loading plans & entitlements configuration...</div>;
  }

  const planKeys = ["starter", "growth", "pro"];
  const currentPlanDoc = plans[activePlan] || {};
  const isSaving = savingPlan === activePlan;

  return (
    <div className="space-y-6 max-w-6xl pb-12">
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2" style={{ fontFamily: "Outfit" }}>
          <CreditCard className="w-5 h-5 text-blue-400" /> Plan & Entitlement Control Center
        </h1>
        <p className="text-xs text-slate-400">
          Canonical configuration for subscription pricing, smart quotas, monthly limits, and feature gating matrices.
        </p>
      </div>

      <Tabs value={activePlan} onValueChange={setActivePlan} className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-3">
          <TabsList className="bg-slate-900 border border-slate-800 p-1 rounded-xl">
            {planKeys.map((pid) => {
              const p = plans[pid] || {};
              return (
                <TabsTrigger
                  key={pid}
                  value={pid}
                  className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs font-bold px-5 py-2 rounded-lg transition-all"
                >
                  <span className="uppercase">{p.name || pid}</span>
                  {p.badge && (
                    <span className="ml-1.5 text-[9px] bg-slate-800 px-1.5 py-0.5 rounded text-amber-300">
                      {p.badge}
                    </span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <Button
            onClick={() => savePlan(activePlan)}
            disabled={isSaving}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-blue-600/20"
          >
            <Save className="w-3.5 h-3.5" />
            {isSaving ? "Saving..." : `Save ${currentPlanDoc.name || activePlan.toUpperCase()} Configuration`}
          </Button>
        </div>

        {planKeys.map((pid) => {
          const p = plans[pid] || {};
          return (
            <TabsContent key={pid} value={pid} className="space-y-6">
              {/* Pricing & High-Level Plan Card */}
              <Card className="bg-slate-950 border-slate-800 text-slate-100 shadow-xl">
                <CardHeader className="border-b border-slate-800/80 pb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <PlanBadge planId={pid} size="md" />
                        <CardTitle className="text-lg font-bold text-white">{p.name}</CardTitle>
                      </div>
                      <CardDescription className="text-xs text-slate-400 mt-1">
                        {p.tagline || "Configured Solar EPC Subscription Plan"}
                      </CardDescription>
                    </div>
                    {p.badge && <Badge className="bg-emerald-600 text-white text-xs px-2.5 py-1">{p.badge}</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-300 uppercase tracking-wide">
                        Monthly Price (₹)
                      </label>
                      <Input
                        type="number"
                        min="0"
                        value={p.monthly_price ?? 0}
                        onChange={(e) => handlePriceChange(pid, "monthly_price", e.target.value)}
                        className="bg-slate-900 border-slate-700 text-white font-mono text-sm font-bold"
                      />
                      <span className="text-[10px] text-slate-500">Live price rendered across app & billing</span>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-300 uppercase tracking-wide">
                        Yearly Price (₹)
                      </label>
                      <Input
                        type="number"
                        min="0"
                        value={p.yearly_price ?? 0}
                        onChange={(e) => handlePriceChange(pid, "yearly_price", e.target.value)}
                        className="bg-slate-900 border-slate-700 text-white font-mono text-sm font-bold"
                      />
                      <span className="text-[10px] text-slate-500">Discounted annual billing package</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 7 Grouped Entitlement Categories */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  return (
                    <Card key={cat.id} className="bg-slate-950/90 border-slate-800 text-slate-100 flex flex-col justify-between shadow-lg">
                      <CardHeader className="border-b border-slate-800/80 pb-3 bg-slate-900/40">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <CardTitle className="text-sm font-bold text-white">{cat.title}</CardTitle>
                            <CardDescription className="text-[11px] text-slate-400">{cat.description}</CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="p-4 space-y-4 flex-1">
                        {/* Feature Toggles */}
                        {cat.features.length > 0 && (
                          <div className="space-y-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                              Feature Access Matrix
                            </span>
                            <div className="space-y-1.5">
                              {cat.features.map((f) => {
                                const isEnabled = Boolean(p.features?.[f.key]);
                                return (
                                  <div
                                    key={f.key}
                                    onClick={() => toggleFeature(pid, f.key)}
                                    className={`flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                                      isEnabled
                                        ? "bg-blue-950/30 border-blue-800/50 text-blue-100"
                                        : "bg-slate-900/40 border-slate-800/80 text-slate-400 hover:border-slate-700"
                                    }`}
                                  >
                                    <span className="font-medium text-[11px]">{f.label}</span>
                                    <div className="flex items-center gap-2">
                                      <span className={`text-[10px] font-bold uppercase ${isEnabled ? "text-emerald-400" : "text-slate-500"}`}>
                                        {isEnabled ? "ON" : "OFF"}
                                      </span>
                                      <Switch checked={isEnabled} onCheckedChange={() => toggleFeature(pid, f.key)} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Quota & Resource Limits */}
                        {cat.limits.length > 0 && (
                          <div className="space-y-2 pt-2 border-t border-slate-800/60">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                              Resource Quotas & Numeric Limits
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              {cat.limits.map((lim) => {
                                const isFeatureGated = lim.dependsOn ? Boolean(p.features?.[lim.dependsOn]) : true;
                                return (
                                  <div
                                    key={lim.key}
                                    className={`p-2.5 bg-slate-900/80 rounded-lg border border-slate-800/80 space-y-1 ${
                                      !isFeatureGated ? "opacity-40" : ""
                                    }`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <label className="text-[10px] text-slate-300 font-semibold uppercase block truncate">
                                        {lim.label}
                                      </label>
                                      {!isFeatureGated && (
                                        <Badge variant="outline" className="text-[8px] text-rose-400 border-rose-500/30 px-1 py-0">
                                          Feature OFF
                                        </Badge>
                                      )}
                                    </div>
                                    <Input
                                      type="number"
                                      min="0"
                                      disabled={!isFeatureGated}
                                      placeholder={lim.placeholder}
                                      value={p[lim.key] ?? 0}
                                      onChange={(e) => handleLimitChange(pid, lim.key, e.target.value)}
                                      className="h-8 bg-slate-950 border-slate-700 text-white text-xs font-mono font-bold"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Bottom Sticky Save Bar */}
              <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl flex items-center justify-between shadow-2xl">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>
                    Saving changes to <strong className="text-white">{p.name}</strong> updates the canonical database and clears server caches immediately.
                  </span>
                </div>
                <Button
                  onClick={() => savePlan(pid)}
                  disabled={isSaving}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  {isSaving ? "Saving..." : `Save ${p.name}`}
                </Button>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
