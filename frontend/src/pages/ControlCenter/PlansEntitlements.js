import React, { useState, useEffect, useCallback, useMemo } from "react";
import api, { formatApiError } from "@/lib/api";
import {
  CreditCard,
  Save,
  Briefcase,
  Boxes,
  PackageSearch,
  FileText,
  DollarSign,
  ScrollText,
  ShieldAlert,
  Sparkles,
  LayoutDashboard,
  Users2,
  ClipboardList,
  LifeBuoy,
  Megaphone,
  UserCog,
  Building2,
  ChevronDown,
  ChevronUp,
  Lock,
  CheckCircle2,
  Sliders,
  AlertCircle,
  UserPlus,
  Search,
  Layers,
  Bell,
  Truck,
  X,
  Filter
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import PlanBadge from "@/components/PlanBadge";

const REAL_APP_PAGE_DEFINITIONS = [
  {
    section: "WORKSPACE",
    pages: [
      {
        key: "dashboard",
        name: "Dashboard",
        route: "/dashboard",
        icon: LayoutDashboard,
        desc: "High-level metrics, active client pipeline, revenue cards, and recent activities.",
        features: [],
        limits: []
      },
      {
        key: "leads",
        name: "Leads Management",
        route: "/leads",
        icon: UserPlus,
        desc: "Solar sales leads, call logging, follow-up scheduling, and client onboarding conversion.",
        features: [],
        limits: []
      },
      {
        key: "clients",
        name: "Clients",
        route: "/clients",
        icon: Users2,
        desc: "Solar client master records, consumer numbers, contact details, and subsidy status.",
        features: [
          { key: "client_onboarding", label: "Client Creation & Onboarding", desc: "Allow creating new solar clients via onboarding form" },
        ],
        limits: [
          { key: "max_clients", label: "Maximum Active Clients / Projects", desc: "Enforced at POST /clients", unit: "Clients" }
        ]
      },
      {
        key: "solar_designer",
        name: "3D Solar Designer",
        route: "/solar-designer",
        icon: Layers,
        desc: "3D solar layout, rooftop raycasting, azimuth/tilt simulation, and automated BOM generator.",
        features: [
          { key: "solar_designer", label: "3D Studio & Simulation Engine", desc: "Interactive 3D rooftop designer, irradiance modeling & CAD layout" }
        ],
        limits: []
      },
      {
        key: "project_execution",
        name: "Project Execution",
        route: "/projects",
        icon: Briefcase,
        desc: "Project assignment, verification queue, rework, retry, and stage progression.",
        features: [
          { key: "project_assignment", label: "Project Assignment Tab", desc: "Assign EPC tasks to engineers and staff" },
          { key: "verification", label: "Stage Verification Queue", desc: "Review uploaded site photos and solar proof" },
          { key: "rework_retry", label: "Rework & Retry Workflow", desc: "Handle rejected verifications and re-submissions" }
        ],
        limits: []
      },
      {
        key: "task_portal",
        name: "Task Portal",
        route: "/tasks",
        icon: ClipboardList,
        desc: "Assignee workspace for field engineers, survey tasks, installation, and inspection.",
        features: [
          { key: "task_portal", label: "My Tasks & Execution", desc: "View assigned tasks and checklist progress" }
        ],
        limits: []
      },
      {
        key: "notifications",
        name: "Notifications",
        route: "/notifications",
        icon: Bell,
        desc: "System alerts, company broadcast notifications, task updates, and reminder logs.",
        features: [],
        limits: []
      }
    ]
  },
  {
    section: "B2B & SUPPLY",
    pages: [
      {
        key: "b2b_supply",
        name: "B2B & Supply",
        route: "/b2b-supply",
        icon: Building2,
        desc: "B2B commercial sales, tax invoices, supplier procurement bills, and corporate client directory.",
        features: [
          { key: "b2b_sales", label: "B2B Sales & Invoicing", desc: "Generate B2B commercial tax invoices and track outstanding receivables" },
          { key: "b2b_procurement", label: "Supplier Procurement & Bills", desc: "Record inward purchase bills from suppliers with purchase tax ledgers" },
          { key: "b2b_customers", label: "B2B Customer Directory", desc: "Manage corporate clients, contacts, GSTIN, and credit limits" }
        ],
        limits: []
      }
    ]
  },
  {
    section: "OPERATIONS & INVENTORY",
    pages: [
      {
        key: "receivables",
        name: "Receivables & Collection",
        route: "/receivables",
        icon: DollarSign,
        desc: "Solar project receivables, client payment plans, tax invoices, and expense tracking.",
        features: [
          { key: "invoices", label: "Project Invoices Tab", desc: "Generate and manage customer project invoices" },
          { key: "payments", label: "Payment Records Tab", desc: "Log client payments and outstanding collection balances" },
          { key: "loan_finance", label: "Loan & Subsidy Finance Tab", desc: "Track bank loan disbursements and DISCOM subsidies" },
          { key: "expenses", label: "Direct Project Expenses Tab", desc: "Record project-specific site and labour expenses" }
        ],
        limits: []
      },
      {
        key: "data_management",
        name: "Data Management (Inventory)",
        route: "/inventory",
        icon: Boxes,
        desc: "Complete solar warehouse stock tracking, inwards, outward challans, and product master.",
        features: [
          { key: "inward", label: "Inward Stock Entry", desc: "Receive materials from vendors into warehouse stock" },
          { key: "outward", label: "Outward Dispatch Entry", desc: "Dispatch materials against client projects" },
          { key: "product_master", label: "Product Master & Catalog", desc: "Manage solar product SKUs, units, and categories" },
          { key: "balance_report", label: "Stock Balance Report", desc: "View real-time stock on hand and reorder levels" },
          { key: "history", label: "Transaction History", desc: "Searchable log of inward and outward stock movements" },
          { key: "high_value_goods", label: "High Value Goods & Challans", desc: "Track solar panels, inverters, and battery serials" },
          { key: "serial_tracking", label: "Serial Number Tracking", desc: "Scan and trace equipment by serial numbers" },
          { key: "inventory_intelligence", label: "Inventory Intelligence", desc: "Pro-only advanced material utilization, serial tracking analytics & site consumption reports" },
          { key: "manual_import", label: "Manual Bulk Import", desc: "Bulk Excel/CSV inward and outward stock import" },
          { key: "export", label: "Export", desc: "Excel, CSV, and PDF inventory reports export" }
        ],
        limits: [
          { key: "max_products", label: "Maximum Product Master Items", desc: "Enforced at POST /inventory/products", unit: "Products" },
          { key: "monthly_inventory_transactions", label: "Monthly Inventory Transactions", desc: "Enforced on Inward/Outward creation", unit: "Txns / mo" },
          { key: "monthly_manual_imports", label: "Monthly Manual Imports", desc: "Enforced on bulk inward/outward imports", unit: "Imports / mo" },
          { key: "monthly_exports", label: "Monthly Exports", desc: "Enforced on CSV/PDF reports exports", unit: "Exports / mo" }
        ]
      },
      {
        key: "material_requests",
        name: "Material Requests",
        route: "/material",
        icon: PackageSearch,
        desc: "Engineer site material requisition, warehouse approval, and dispatch workflow.",
        features: [
          { key: "material_requests", label: "Material Request Workflow", desc: "Raise requisitions for project execution BOM" }
        ],
        limits: [
          { key: "monthly_material_requests", label: "Monthly Material Requests", desc: "Enforced at POST /material-requests", unit: "Requests / mo" }
        ]
      },
      {
        key: "client_data",
        name: "Client Data",
        route: "/client-data",
        icon: LifeBuoy,
        desc: "Client system parameters, inverter telemetry status, files, and maintenance tickets.",
        features: [
          { key: "inverter_monitoring", label: "Inverter Telemetry Status", desc: "Track online/offline status of customer inverters" },
          { key: "client_document_storage", label: "Client Document Vault", desc: "Upload and organize consumer Aadhaar, bills, and agreements" }
        ],
        limits: [
          { key: "storage_gb", label: "Cloud Document Storage (GB)", desc: "Enforced at document upload endpoint", unit: "GB" },
          { key: "monthly_documents", label: "Monthly Uploaded Documents", desc: "Enforced at document upload endpoint", unit: "Docs / mo" }
        ]
      },
      {
        key: "reports",
        name: "Reports",
        route: "/reports",
        icon: ScrollText,
        desc: "Client-wise material ledger, consumption audit, and data export downloads.",
        features: [
          { key: "client_ledger", label: "Client Material Ledger", desc: "Detailed breakdown of equipment dispatched per client" },
          { key: "ledger_export", label: "Excel / CSV / PDF Exports", desc: "Download material and financial report spreadsheets" }
        ],
        limits: [
          { key: "monthly_exports", label: "Monthly Report & Data Exports", desc: "Enforced on PDF/Excel/CSV export endpoints", unit: "Exports / mo" }
        ]
      }
    ]
  },
  {
    section: "DOCUMENTS",
    pages: [
      {
        key: "sales_documents",
        name: "Sales Documents",
        route: "/sales-documents",
        icon: FileText,
        desc: "Solar quotation builder, commercial tax invoices, and delivery bill documents.",
        features: [
          { key: "quotations", label: "Solar Quotations", desc: "Generate multi-kW system proposals and pricing quotes" },
          { key: "tax_invoices", label: "Sales Tax Invoices", desc: "Generate GST compliant sales tax invoices" },
          { key: "delivery_bills", label: "Delivery Bills", desc: "Generate site dispatch delivery challans" }
        ],
        limits: []
      },
      {
        key: "documents",
        name: "Document Templates",
        route: "/templates",
        icon: FileText,
        desc: "DISCOM compliance reports, WCR, SLDR diagrams, Net Meter agreements, and Annexures.",
        features: [
          { key: "pdf_generation", label: "PDF Document Generation", desc: "Generate 3-Page WCR, SLDR, and agreement PDFs" },
          { key: "docx_generation", label: "DOCX Editable Document Export", desc: "Download editable Word documents for DISCOM submission" },
          { key: "discom_mapping", label: "DISCOM Format Mapping", desc: "Configure state DISCOM document formats" }
        ],
        limits: [
          { key: "monthly_pdf_docx", label: "Monthly PDF / DOCX Generations", desc: "Enforced at template generation endpoints", unit: "Docs / mo" }
        ]
      },
      {
        key: "purchase_orders",
        name: "Purchase Orders",
        route: "/purchase-orders",
        icon: FileText,
        desc: "Vendor procurement orders, line item pricing, and vendor master directory.",
        features: [
          { key: "purchase_orders", label: "Purchase Order Creation", desc: "Issue official POs to manufacturers and suppliers" },
          { key: "vendor_master", label: "Vendor Master Directory", desc: "Maintain supplier contacts, GSTIN, and payment terms" }
        ],
        limits: []
      },
      {
        key: "vendors",
        name: "Vendor Master Directory",
        route: "/vendors",
        icon: Truck,
        desc: "Supplier directory, bank details, GSTIN compliance, and manufacturer procurement terms.",
        features: [],
        limits: []
      }
    ]
  },
  {
    section: "ADMINISTRATION",
    pages: [
      {
        key: "complaints",
        name: "Complaint Center",
        route: "/complaints",
        icon: Megaphone,
        desc: "Post-installation solar complaints, ticket assignment, and SLA escalation tracking.",
        features: [
          { key: "complaint_management", label: "Ticket Lifecycle Management", desc: "Track complaint aging, statuses, and resolution" }
        ],
        limits: []
      },
      {
        key: "team",
        name: "Team & Access",
        route: "/team",
        icon: UserCog,
        desc: "Employee accounts, role assignment (Admin, Manager, Staff, Installer), and page permissions.",
        features: [
          { key: "role_permissions", label: "Custom Role & Page Permissions", desc: "Configure individual view/create/edit/delete/approve access" }
        ],
        limits: [
          { key: "max_users", label: "Maximum Active Team Users", desc: "Enforced at POST /employees", unit: "Users" }
        ]
      },
      {
        key: "settings",
        name: "Company Details",
        route: "/profile",
        icon: Building2,
        desc: "Workspace company profile, logo branding, digital stamps, and bank account setup.",
        features: [],
        limits: []
      },
      {
        key: "activity_log",
        name: "Activity Log",
        route: "/activity",
        icon: ScrollText,
        desc: "Immutable audit trail of employee actions, data changes, and security events.",
        features: [],
        limits: []
      }
    ]
  },
  {
    section: "BILLING & SUBSCRIPTION",
    pages: [
      {
        key: "billing",
        name: "Billing & Subscription",
        route: "/billing",
        icon: CreditCard,
        desc: "Tenant subscription status, live quota consumption meters, and plan upgrade.",
        features: [],
        limits: []
      }
    ]
  }
];

export default function PlansEntitlements() {
  const [plans, setPlans] = useState({});
  const [activePlan, setActivePlan] = useState("starter");
  const [loading, setLoading] = useState(true);
  const [savingPlan, setSavingPlan] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSection, setSelectedSection] = useState("ALL");
  const [expandedPages, setExpandedPages] = useState({
    b2b_supply: true,
    receivables: true,
    data_management: true,
    documents: true,
    clients: true
  });

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

  const togglePageAccordion = (key) => {
    setExpandedPages((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const toggleExpandAll = () => {
    const isAnyCollapsed = REAL_APP_PAGE_DEFINITIONS.some((grp) =>
      grp.pages.some((p) => (p.features.length > 0 || p.limits.length > 0) && !expandedPages[p.key])
    );
    const nextState = {};
    REAL_APP_PAGE_DEFINITIONS.forEach((grp) => {
      grp.pages.forEach((p) => {
        nextState[p.key] = isAnyCollapsed;
      });
    });
    setExpandedPages(nextState);
  };

  const filteredGroups = useMemo(() => {
    return REAL_APP_PAGE_DEFINITIONS.map((group) => {
      if (selectedSection !== "ALL" && group.section !== selectedSection) {
        return null;
      }
      const q = searchQuery.trim().toLowerCase();
      if (!q) return group;
      const matchingPages = group.pages.filter((page) => {
        if (
          page.name.toLowerCase().includes(q) ||
          page.route.toLowerCase().includes(q) ||
          page.desc.toLowerCase().includes(q)
        ) {
          return true;
        }
        if (
          page.features?.some(
            (f) =>
              f.label.toLowerCase().includes(q) ||
              f.key.toLowerCase().includes(q) ||
              f.desc.toLowerCase().includes(q)
          )
        ) {
          return true;
        }
        if (
          page.limits?.some(
            (l) =>
              l.label.toLowerCase().includes(q) ||
              l.key.toLowerCase().includes(q) ||
              l.desc.toLowerCase().includes(q)
          )
        ) {
          return true;
        }
        return false;
      });
      if (matchingPages.length === 0) return null;
      return { ...group, pages: matchingPages };
    }).filter(Boolean);
  }, [searchQuery, selectedSection]);

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

  const togglePageAccess = (pid, pageKey) => {
    setPlans((prev) => {
      const currPlan = prev[pid] || {};
      const currPages = currPlan.pages || {};
      const isCurrentlyEnabled = currPages[pageKey] !== false; // default true
      return {
        ...prev,
        [pid]: {
          ...currPlan,
          pages: {
            ...currPages,
            [pageKey]: !isCurrentlyEnabled,
          },
        },
      };
    });
  };

  const toggleFeature = (pid, featureKey) => {
    setPlans((prev) => {
      const currPlan = prev[pid] || {};
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

  const saveCurrentPlan = async () => {
    const pid = activePlan;
    const planData = plans[pid];
    if (!planData) return;

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
      setSavingPlan(true);
      const res = await api.put(`/platform-owner/plans/${pid}`, {
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
        monthly_manual_imports: Number(planData.monthly_manual_imports) || 100,
        monthly_material_requests: Number(planData.monthly_material_requests) || 1000,
        monthly_inventory_transactions: Number(planData.monthly_inventory_transactions) || 2500,
        monthly_api_requests: Number(planData.monthly_api_requests) || 0,
        active: planData.active !== false,
        pages: planData.pages || {},
        features: planData.features || {},
      });

      if (res.data?.all_plans) {
        setPlans(res.data.all_plans);
      } else if (res.data?.plan) {
        setPlans((prev) => ({ ...prev, [pid]: res.data.plan }));
      }

      toast.success(`✓ Changes saved! Plan '${planData.name}' updated successfully.`);
      window.dispatchEvent(new Event("solarix:plan-config-updated"));
      window.dispatchEvent(new Event("solarix:subscription-updated"));
      window.dispatchEvent(new Event("solarix:auth-refresh"));
      try {
        localStorage.setItem("solarix:plan-config-updated", Date.now().toString());
        localStorage.setItem("solarix:subscription-updated", Date.now().toString());
      } catch (e) {}
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSavingPlan(false);
    }
  };

  const currentPlan = plans[activePlan] || {};
  const currentPages = currentPlan.pages || {};
  const currentFeatures = currentPlan.features || {};

  return (
    <div className="space-y-6 pb-20 font-sans">
      {/* HEADER WITH SINGLE ATOMIC SAVE BUTTON */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <Sliders className="w-6 h-6 text-blue-400" /> Plan & Feature Control Matrix
            </h1>
            <Badge variant="outline" className="bg-blue-500/10 text-blue-300 border-blue-500/30 text-xs">
              Live Architecture
            </Badge>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Control real application page access, granular feature toggles, and measurable quota limits strictly bound to the Solarix platform.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={saveCurrentPlan}
            disabled={savingPlan || loading}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-10 px-5 gap-2 shadow-sm"
          >
            <Save className="w-4 h-4" />
            <span>{savingPlan ? "Saving Changes..." : "SAVE CHANGES"}</span>
          </Button>
        </div>
      </div>

      {loading && (
        <div className="p-12 text-center text-slate-500 font-mono text-xs animate-pulse">
          Loading live application plan configurations...
        </div>
      )}

      {!loading && (
        <>
          {/* PLAN SELECTOR TABS */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/60 p-2 rounded-xl border border-slate-800">
            <Tabs value={activePlan} onValueChange={setActivePlan} className="w-full sm:w-auto">
              <TabsList className="bg-slate-900 border border-slate-800 text-slate-400 h-10">
                {Object.keys(plans).map((pid) => (
                  <TabsTrigger
                    key={pid}
                    value={pid}
                    className="data-[state=active]:bg-blue-600 data-[state=active]:text-white uppercase font-bold text-xs px-4 gap-2"
                  >
                    <span>{plans[pid]?.name || pid}</span>
                    <span className="text-[10px] font-normal opacity-80">
                      ₹{(plans[pid]?.monthly_price || 0).toLocaleString("en-IN")}/mo
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div className="flex items-center gap-2 px-2">
              <PlanBadge planId={activePlan} size="sm" />
              <span className="text-xs text-slate-400 font-mono">
                Annual Price: ₹{(currentPlan.yearly_price || 0).toLocaleString("en-IN")}
              </span>
            </div>
          </div>

          {/* SECTION: PLAN CORE PRICING & IDENTITY */}
          <Card className="bg-slate-950/60 border-slate-800">
            <CardHeader className="border-b border-slate-800/80 pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-blue-400" /> Plan Pricing & Identity (Single Source of Truth)
                </CardTitle>
                <Badge variant="outline" className="bg-slate-900 border-slate-700 text-slate-300 text-[10px]">
                  Exactly One Price Per Cycle
                </Badge>
              </div>
              <CardDescription className="text-xs text-slate-400">
                Updates here replace the active price everywhere across the application and checkout flows.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="text-slate-300 font-medium block mb-1">Monthly Billing Price (₹)</label>
                <Input
                  type="number"
                  min="0"
                  value={currentPlan.monthly_price ?? ""}
                  onChange={(e) => handlePriceChange(activePlan, "monthly_price", e.target.value)}
                  className="bg-slate-900 border-slate-700 text-white font-mono h-9"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">Charged every 30 days</span>
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">Annual / Yearly Billing Price (₹)</label>
                <Input
                  type="number"
                  min="0"
                  value={currentPlan.yearly_price ?? ""}
                  onChange={(e) => handlePriceChange(activePlan, "yearly_price", e.target.value)}
                  className="bg-slate-900 border-slate-700 text-white font-mono h-9"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Charged yearly ({currentPlan.monthly_price ? Math.round(((currentPlan.monthly_price * 12 - currentPlan.yearly_price) / (currentPlan.monthly_price * 12)) * 100) : 0}% annual discount)
                </span>
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">Plan Tagline / Subtitle</label>
                <Input
                  type="text"
                  value={currentPlan.tagline || ""}
                  onChange={(e) =>
                    setPlans((prev) => ({
                      ...prev,
                      [activePlan]: { ...prev[activePlan], tagline: e.target.value },
                    }))
                  }
                  placeholder="e.g. Small installers & small EPC teams"
                  className="bg-slate-900 border-slate-700 text-white h-9"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">Displayed on public pricing page</span>
              </div>
            </CardContent>
          </Card>

          {/* SEARCH, FILTER & EXPAND CONTROLS */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* Search input */}
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  type="text"
                  placeholder="Filter pages, routes, features, or limits..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-slate-900 border-slate-800 text-white pl-9 pr-8 text-xs h-9 focus-visible:ring-blue-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Section Filters & Expand All */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-lg border border-slate-800 text-xs flex-wrap">
                  {[
                    { id: "ALL", label: "All Modules" },
                    { id: "WORKSPACE", label: "Workspace" },
                    { id: "OPERATIONS & INVENTORY", label: "Operations & Inventory" },
                    { id: "B2B & SUPPLY", label: "B2B & Supply" },
                    { id: "DOCUMENTS", label: "Documents" },
                    { id: "ADMINISTRATION", label: "Administration" },
                    { id: "BILLING & SUBSCRIPTION", label: "Billing" }
                  ].map((sec) => (
                    <button
                      key={sec.id}
                      onClick={() => setSelectedSection(sec.id)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                        selectedSection === sec.id
                          ? "bg-blue-600 text-white shadow-xs"
                          : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                      }`}
                    >
                      {sec.label}
                    </button>
                  ))}
                </div>

                <Button
                  variant="outline"
                  size="xs"
                  onClick={toggleExpandAll}
                  className="border-slate-800 text-slate-300 hover:bg-slate-900 text-xs h-8 px-3"
                >
                  Expand / Collapse All
                </Button>
              </div>
            </div>
          </div>

          {/* APPLICATION PAGES MATRIX */}
          <div className="space-y-6">
            {filteredGroups.length === 0 ? (
              <div className="p-12 text-center bg-slate-950/40 rounded-xl border border-slate-800 text-slate-400 text-xs">
                No application pages or features found matching "{searchQuery}".
              </div>
            ) : (
              filteredGroups.map((group) => (
                <div key={group.section} className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      {group.section} MODULES
                    </span>
                    <Badge variant="outline" className="text-[10px] bg-slate-900 border-slate-800 text-slate-400">
                      {group.pages.length} Real Pages
                    </Badge>
                  </div>

                  <div className="space-y-3">
                    {group.pages.map((page) => {
                      const PageIcon = page.icon;
                      const isPageEnabled = currentPages[page.key] !== false; // default true
                      const isExpanded = expandedPages[page.key];

                      return (
                        <Card
                          key={page.key}
                          className={`border transition-colors ${
                            isPageEnabled
                              ? "bg-slate-950/60 border-slate-800"
                              : "bg-slate-950/30 border-rose-900/40 opacity-80"
                          }`}
                        >
                          {/* PAGE HEADER ROW WITH PAGE ACCESS TOGGLE */}
                          <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-start gap-3">
                              <div
                                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                                  isPageEnabled
                                    ? "bg-blue-600/10 text-blue-400 border border-blue-500/20"
                                    : "bg-rose-600/10 text-rose-400 border border-rose-500/20"
                                }`}
                              >
                                <PageIcon className="w-5 h-5" />
                              </div>

                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-white text-sm">{page.name}</span>
                                  <Badge variant="outline" className="bg-slate-900 border-slate-700 text-slate-400 text-[10px] font-mono">
                                    {page.route}
                                  </Badge>
                                  {!isPageEnabled && (
                                    <Badge className="bg-rose-950/80 text-rose-300 border-rose-800 text-[10px] gap-1">
                                      <Lock className="w-3 h-3" /> Page Blocked
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-slate-400 mt-0.5">{page.desc}</p>
                              </div>
                            </div>

                            {/* MASTER PAGE ACCESS SWITCH & EXPAND BUTTON */}
                            <div className="flex items-center gap-4 self-end sm:self-center shrink-0">
                              <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-lg">
                                <span className="text-[11px] font-semibold text-slate-300">PAGE ACCESS</span>
                                <Switch
                                  checked={isPageEnabled}
                                  onCheckedChange={() => togglePageAccess(activePlan, page.key)}
                                  className="data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-slate-700"
                                />
                                <span
                                  className={`text-[10px] font-bold font-mono ${
                                    isPageEnabled ? "text-emerald-400" : "text-rose-400"
                                  }`}
                                >
                                  {isPageEnabled ? "ON" : "OFF"}
                                </span>
                              </div>

                              {(page.features.length > 0 || page.limits.length > 0) && (
                                <Button
                                  variant="outline"
                                  size="xs"
                                  onClick={() => togglePageAccordion(page.key)}
                                  className="border-slate-800 text-slate-300 hover:bg-slate-900 text-xs h-8 gap-1"
                                >
                                  <span>{isExpanded ? "Collapse" : "Features & Limits"}</span>
                                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* ACCORDION CONTENT: FEATURES INSIDE PAGE + MEASURABLE LIMITS */}
                          {isExpanded && (page.features.length > 0 || page.limits.length > 0) && (
                            <div className="border-t border-slate-800/80 bg-slate-900/40 p-4 space-y-5 text-xs">
                              {/* PAGE FEATURES TOGGLES */}
                              {page.features.length > 0 && (
                                <div className="space-y-3">
                                  <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5">
                                    <Sliders className="w-3 h-3 text-blue-400" /> Features inside {page.name}
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {page.features.map((feat) => {
                                      const featEnabled = currentFeatures[feat.key] ?? true;
                                      return (
                                        <div
                                          key={feat.key}
                                          className={`p-3 rounded-xl border transition ${
                                            featEnabled
                                              ? "bg-slate-900 border-slate-800 text-slate-200"
                                              : "bg-slate-950/60 border-slate-800/60 text-slate-500"
                                          }`}
                                        >
                                          <div className="flex items-center justify-between gap-2 mb-1">
                                            <span className="font-semibold text-xs text-white">{feat.label}</span>
                                            <Switch
                                              checked={Boolean(featEnabled)}
                                              onCheckedChange={() => toggleFeature(activePlan, feat.key)}
                                              disabled={!isPageEnabled}
                                              className="data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-slate-700"
                                            />
                                          </div>
                                          <p className="text-[11px] text-slate-400 leading-snug">{feat.desc}</p>
                                          {!isPageEnabled && (
                                            <span className="text-[10px] text-amber-400 mt-1 block">
                                              (Disabled because page is OFF)
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* MEASURABLE RESOURCE LIMITS */}
                              {page.limits.length > 0 && (
                                <div className="space-y-3 pt-2 border-t border-slate-800/60">
                                  <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5">
                                    <AlertCircle className="w-3 h-3 text-amber-400" /> Real Measurable Quotas Enforced on {page.name}
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {page.limits.map((lim) => (
                                      <div
                                        key={lim.key}
                                        className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1.5"
                                      >
                                        <div className="flex items-center justify-between">
                                          <span className="font-semibold text-xs text-white">{lim.label}</span>
                                          <div className="flex items-center gap-1.5">
                                            <Badge variant="outline" className="text-[10px] font-mono text-emerald-400 border-emerald-500/30 bg-emerald-500/10 gap-1">
                                              <CheckCircle2 className="w-2.5 h-2.5" /> Backend Enforced
                                            </Badge>
                                            <Badge variant="outline" className="text-[10px] font-mono text-slate-400 bg-slate-950">
                                              {lim.unit}
                                            </Badge>
                                          </div>
                                        </div>
                                        <Input
                                          type="number"
                                          min="0"
                                          value={currentPlan[lim.key] ?? ""}
                                          onChange={(e) => handleLimitChange(activePlan, lim.key, e.target.value)}
                                          className="bg-slate-950 border-slate-700 text-white font-mono text-xs h-9"
                                        />
                                        <p className="text-[10px] text-slate-400">{lim.desc}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* BOTTOM FLOATING SAVE BAR */}
          <div className="sticky bottom-4 z-20 bg-slate-900/95 backdrop-blur border border-slate-800 p-4 rounded-xl shadow-2xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Configuring <strong>{currentPlan.name} Plan</strong>. Changes apply immediately to all customer workspaces upon saving.</span>
            </div>

            <Button
              onClick={saveCurrentPlan}
              disabled={savingPlan || loading}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-10 px-6 gap-2 shrink-0 shadow-md"
            >
              <Save className="w-4 h-4" />
              <span>{savingPlan ? "Saving Changes..." : "SAVE CHANGES"}</span>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
