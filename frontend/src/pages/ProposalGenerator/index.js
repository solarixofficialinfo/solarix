import React, { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api, { formatApiError, downloadFile } from "@/lib/api";
import { useCompany, useClientList } from "@/hooks/useClients";
import { useAuth } from "@/context/AuthContext";
import { useSalesDocuments } from "@/hooks/useSalesDocuments";
import { useProductList } from "@/hooks/useInventory";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import dayjs from "dayjs";
import {
  FileText, Sparkles, Sun, Zap, CheckCircle2, ArrowLeft,
  Download, Eye, RefreshCw, Layers, UserPlus, Users2,
  ShieldCheck, TreePine, Leaf, DollarSign, Calendar, Clock,
  MapPin, Phone, Mail, Building2, Check, AlertCircle, Save,
  Plus, X, Copy, ExternalLink, SlidersHorizontal, ChevronDown,
  ChevronUp, ChevronRight, FileCheck, Layers3, CheckSquare,
  Shield, Compass, BatteryCharging, Wrench, ChevronLeft, Percent
} from "lucide-react";

import {
  calculateSolarMetrics,
  calculateSubsidy,
  formatINR,
  formatNumberIN,
} from "./utils/proposalCalculations";

import {
  DEFAULT_PANEL_DATA,
  DEFAULT_INVERTER_DATA,
  DEFAULT_STRUCTURE_DATA,
  DEFAULT_CABLES_DATA,
  DEFAULT_BOS_COMPONENTS,
  DEFAULT_WARRANTIES,
  DEFAULT_TIMELINE_STAGES,
  DEFAULT_OUR_SCOPE,
  DEFAULT_CUSTOMER_SCOPE,
  DEFAULT_TERMS,
} from "./utils/defaultProposalData";

import ProposalDocumentViewer from "./components/ProposalDocumentViewer";

const DRAFT_STORAGE_KEY = "solarix_proposal_generator_draft_v2";

const STEP_CONFIG = [
  { id: 1, key: "step1", title: "STEP 1 — BASIC DETAILS", subtitle: "Customer, project classification & sales representative info", icon: "👤", short: "1. Basic" },
  { id: 2, key: "step2", title: "STEP 2 — SOLAR SYSTEM", subtitle: "Solar modules, string inverter, battery storage & mounting system", icon: "⚡", short: "2. System" },
  { id: 3, key: "step3", title: "STEP 3 — SITE / DESIGN", subtitle: "3D Solar Designer integration, roof area, usable area, tilt, azimuth & snapshot", icon: "📐", short: "3. Site" },
  { id: 4, key: "step4", title: "STEP 4 — ENERGY NEEDS", subtitle: "Daily & annual energy consumption, tariff rate, current power bill & bill after solar", icon: "⚡", short: "4. Energy" },
  { id: 5, key: "step5", title: "STEP 5 — SOLAR GENERATION", subtitle: "Average daily & annual solar generation, self-consumption vs export %, shade losses & carbon impact", icon: "☀️", short: "5. Generation" },
  { id: 6, key: "step6", title: "STEP 6 — FINANCIALS", subtitle: "System cost, GST, subsidy, net investment, 25-yr savings, ROI % p.a. & payback period", icon: "💰", short: "6. Financials" },
  { id: 7, key: "step7", title: "STEP 7 — COMPONENTS & WARRANTY", subtitle: "Hardware inclusions, customer/site information, project notes & dedicated equipment warranties", icon: "🛡️", short: "7. Warranty" },
  { id: 8, key: "step8", title: "STEP 8 — QUOTATION & REVIEW", subtitle: "Quotation breakdown, payment milestones, proposal validity, acceptance sign-off, dual templates & PDF export", icon: "✨", short: "8. Review" },
];

export default function ProposalGenerator() {
  const location = useLocation();
  const nav = useNavigate();
  const { user } = useAuth();

  // Master queries
  const { data: companyData } = useCompany();
  const { data: clients = [] } = useClientList();
  const { data: productsData = [] } = useProductList();
  const { refetch: refetchHistory } = useSalesDocuments("proposal");

  // Step state
  const [activeStep, setActiveStep] = useState(1);
  const [expandedSections, setExpandedSections] = useState({
    step1: true,
    step2: true,
    step3: true,
    step4: true,
    step5: true,
    step6: true,
    step7: true,
    step8: true,
  });

  const toggleSection = (stepKey) => {
    setExpandedSections((prev) => ({ ...prev, [stepKey]: !prev[stepKey] }));
  };

  const expandAll = () => {
    setExpandedSections({
      step1: true,
      step2: true,
      step3: true,
      step4: true,
      step5: true,
      step6: true,
      step7: true,
      step8: true,
    });
  };

  const collapseAll = () => {
    setExpandedSections({
      step1: false,
      step2: false,
      step3: false,
      step4: false,
      step5: false,
      step6: false,
      step7: false,
      step8: false,
    });
  };

  // Source selection & entity autofill
  const [sourceType, setSourceType] = useState("manual"); // 'lead' | 'client' | 'design' | 'manual'
  const [leadsList, setLeadsList] = useState([]);
  const [designsList, setDesignsList] = useState([]);
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedDesignId, setSelectedDesignId] = useState("");
  const [isSavedDraft, setIsSavedDraft] = useState(true);

  // Edit modals state
  const [customItemForm, setCustomItemForm] = useState({ name: "", spec: "", qty: "1 Nos" });
  const [showAddMilestoneModal, setShowAddMilestoneModal] = useState(false);
  const [newMilestoneForm, setNewMilestoneForm] = useState({ stage: "Milestone", label: "", pct: 10 });

  // Full PDF document preview viewer modal
  const [showFullViewerModal, setShowFullViewerModal] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Filter products from Product Master
  const solarPanelProducts = useMemo(() => {
    return Array.isArray(productsData)
      ? productsData.filter((p) => {
          const cat = (p.category || "").toLowerCase();
          const name = (p.name || "").toLowerCase();
          return cat.includes("solar") || cat.includes("panel") || cat.includes("module") || name.includes("panel") || name.includes("watt") || name.includes("wp") || name.includes("mono");
        })
      : [];
  }, [productsData]);

  const inverterProducts = useMemo(() => {
    return Array.isArray(productsData)
      ? productsData.filter((p) => {
          const cat = (p.category || "").toLowerCase();
          const name = (p.name || "").toLowerCase();
          return cat.includes("inverter") || name.includes("inverter") || name.includes("grid-tied") || name.includes("hybrid");
        })
      : [];
  }, [productsData]);

  const batteryProducts = useMemo(() => {
    return Array.isArray(productsData)
      ? productsData.filter((p) => {
          const cat = (p.category || "").toLowerCase();
          const name = (p.name || "").toLowerCase();
          return cat.includes("battery") || name.includes("battery") || name.includes("storage") || name.includes("lifepo4");
        })
      : [];
  }, [productsData]);

  // Primary Form State
  const [form, setForm] = useState(() => {
    const todayStr = dayjs().format("YYYY-MM-DD");
    const refNum = `PROP-${dayjs().format("YYMMDD")}-${Math.floor(1000 + Math.random() * 9000)}`;

    const defaultForm = {
      template_id: "template1",
      proposal_number: refNum,
      proposal_date: todayStr,
      valid_until: dayjs().add(15, "day").format("YYYY-MM-DD"),
      customer_name: "",
      mobile: "",
      email: "",
      site_address: "",
      city: "",
      state: "Maharashtra",
      pincode: "",
      project_type: "Residential",
      solar_system_type: "Grid Connected / On Grid",
      prepared_by: user?.name || "Solar Solutions Engineer",
      representative_phone: user?.phone || companyData?.mobile || companyData?.phone || "+91 98765 43210",
      representative_email: user?.email || companyData?.email || "info@solarix.energy",
      customer_retailer: "Origin Energy / DISCOM",
      customer_nmi: "",
      system_kw: 10.0,
      panel: { ...DEFAULT_PANEL_DATA, quantity: 18 },
      inverter: { ...DEFAULT_INVERTER_DATA, capacity: "10.0 kW", quantity: 1 },
      battery_included: false,
      battery: {
        make: "Lithium-Ion Storage",
        model: "Smart LiFePO4 Energy Wall",
        capacity: "5.0 kWh",
        quantity: 1,
      },
      structure: { ...DEFAULT_STRUCTURE_DATA },
      cables: { ...DEFAULT_CABLES_DATA },
      proposal_notes: "Standard rooftop installation. Inverter to be positioned with minimum 300mm clearance on internal wall. Full smartphone monitoring setup included.",
      roof_area_sqm: 41.4,
      usable_area_sqm: 35.0,
      roof_type: "RCC Flat Roof",
      roof_pitch: "10°",
      tilt_deg: 15,
      azimuth_deg: 180,
      mounting_clearance_m: 1.8,
      snapshot_2d: "",
      snapshot_3d: "",
      linked_design_id: "",
      linked_design_name: "",
      daily_usage_kwh: 20.0,
      annual_usage_kwh: 7300,
      current_quarterly_bill: 68000,
      bill_frequency: "Quarterly",
      post_solar_quarterly_bill: 29000,
      self_consumption_pct: 47,
      grid_export_pct: 53,
      shade_losses_pct: 3.0,
      tariff_rate: 8.5,
      bos: [...DEFAULT_BOS_COMPONENTS],
      warranty_panel_product: "12 Years Product & Material Warranty",
      warranty_panel_performance: "25 Years 80% Performance Warranty",
      warranty_inverter: "10 Years Replacement Warranty",
      warranty_battery: "10 Years Limited Warranty",
      warranty_mounting: "10 Years Structural & Racking Warranty",
      warranty_workmanship: "5 Years Complete Workmanship Warranty",
      warranties: [...DEFAULT_WARRANTIES],
      system_price: 500000,
      additional_charges: 0,
      net_meter_charges: 0,
      gst_pct: 13.8,
      subsidy_applicable: false,
      subsidy_amount: 0,
      custom_discount: 0,
      milestones: [
        { stage: "Milestone 1", label: "20% Advance with Order Confirmation", pct: 20 },
        { stage: "Milestone 2", label: "70% Upon Material Readiness & Site Dispatch", pct: 70 },
        { stage: "Milestone 3", label: "5% Upon Complete Installation & Wiring", pct: 5 },
        { stage: "Milestone 4", label: "5% Upon Net-Meter Installation & Commissioning", pct: 5 },
      ],
      timeline: [...DEFAULT_TIMELINE_STAGES],
      our_scope: [...DEFAULT_OUR_SCOPE],
      customer_scope: [...DEFAULT_CUSTOMER_SCOPE],
      terms: [...DEFAULT_TERMS],
    };

    const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...defaultForm,
          ...parsed,
          panel: { ...defaultForm.panel, ...(parsed.panel || {}) },
          inverter: { ...defaultForm.inverter, ...(parsed.inverter || {}) },
          battery: { ...defaultForm.battery, ...(parsed.battery || {}) },
          structure: { ...defaultForm.structure, ...(parsed.structure || {}) },
          cables: { ...defaultForm.cables, ...(parsed.cables || {}) },
          bos: Array.isArray(parsed.bos) && parsed.bos.length > 0 ? parsed.bos : defaultForm.bos,
          milestones: Array.isArray(parsed.milestones) && parsed.milestones.length > 0 ? parsed.milestones : defaultForm.milestones,
        };
      } catch (e) {}
    }

    return defaultForm;
  });

  // Autosave to localStorage
  useEffect(() => {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(form));
    setIsSavedDraft(true);
  }, [form]);

  // Load Leads and Designs on mount
  useEffect(() => {
    let mounted = true;
    async function loadSources() {
      try {
        const [leadsRes, designsRes] = await Promise.all([
          api.get("/leads", { params: { page: 1, page_size: 50 } }).catch(() => ({ data: { items: [] } })),
          api.get("/solar-designer/designs").catch(() => ({ data: { designs: [] } })),
        ]);
        if (mounted) {
          setLeadsList(leadsRes.data?.items || []);
          setDesignsList(designsRes.data?.designs || []);
        }
      } catch (e) {}
    }
    loadSources();
    return () => { mounted = false; };
  }, []);

  // Sync prepared_by with user or company owner once loaded
  useEffect(() => {
    if (!form.prepared_by) {
      setForm((prev) => ({
        ...prev,
        prepared_by: user?.name || companyData?.owner_name || "Solar Solutions Engineer",
        representative_phone: user?.phone || companyData?.mobile || companyData?.phone || "+91 98765 43210",
        representative_email: user?.email || companyData?.email || "info@solarix.energy",
      }));
    }
  }, [user, companyData, form.prepared_by]);

  // Handle incoming transfer from Solar Designer (via router state)
  useEffect(() => {
    if (location.state?.transferFromSolarDesigner || location.state?.designData) {
      const d = location.state.designData || location.state;
      const pWatt = Number(d.panel_wattage || 555);
      const pCount = Number(d.panel_count || (d.panels || []).filter((p) => !p.hidden).length || 18);
      const sysKw = Number(d.system_kw || ((pCount * pWatt) / 1000.0).toFixed(2));
      const subAmt = calculateSubsidy(sysKw, d.project_type || "residential");

      setForm((prev) => ({
        ...prev,
        customer_name: d.client_name || prev.customer_name,
        site_address: d.formatted_address || d.address || prev.site_address,
        system_kw: sysKw,
        linked_design_id: d.id || "",
        linked_design_name: d.site_name || d.name || "3D Rooftop Layout",
        snapshot_2d: d.layout_snapshot_2d || d.snapshot_2d || prev.snapshot_2d,
        snapshot_3d: d.layout_snapshot_3d || d.snapshot_3d || prev.snapshot_3d,
        roof_area_sqm: d.roof_area_sqm || prev.roof_area_sqm,
        usable_area_sqm: d.usable_area_sqm || prev.usable_area_sqm,
        tilt_deg: d.structure?.tilt_deg || prev.tilt_deg,
        azimuth_deg: d.structure?.azimuth || prev.azimuth_deg,
        mounting_clearance_m: d.structure?.height_m || prev.mounting_clearance_m,
        panel: {
          ...prev.panel,
          make: d.panel_make || prev.panel.make,
          model: d.panel_model || prev.panel.model,
          wattage: pWatt,
          quantity: pCount,
        },
        structure: {
          ...prev.structure,
          type: d.structure?.type === "flush" ? "Flush Rooftop Mount" : "Elevated Super Structure",
          height: d.structure?.height_m ? `${d.structure.height_m}m Clearance` : prev.structure.height,
        },
        subsidy_amount: subAmt,
        system_price: Math.round(sysKw * 50000),
      }));

      setSourceType("design");
      if (d.id) setSelectedDesignId(d.id);
      toast.success(`Imported ${sysKw} kWp design from 3D Solar Designer!`);
    }
  }, [location.state]);

  // Handle Lead Selection
  const handleSelectLead = (leadId) => {
    setSelectedLeadId(leadId);
    if (!leadId) return;
    const lead = leadsList.find((l) => l.id === leadId);
    if (!lead) return;

    const sysKw = Number(lead.system_kw || 10.0);
    const subAmt = calculateSubsidy(sysKw, "residential");
    const watt = form.panel?.wattage || 555;
    const count = Math.max(1, Math.round((sysKw * 1000) / watt));

    setForm((prev) => ({
      ...prev,
      customer_name: lead.name || prev.customer_name,
      mobile: lead.phone || prev.mobile,
      email: lead.email || prev.email,
      site_address: lead.address || prev.site_address,
      city: lead.city || prev.city,
      state: lead.state || prev.state,
      pincode: lead.pincode || prev.pincode,
      system_kw: sysKw,
      panel: { ...prev.panel, quantity: count },
      subsidy_amount: subAmt,
      system_price: Math.round(sysKw * 50000),
    }));

    toast.success(`Loaded details for lead "${lead.name}"`);
  };

  // Handle Client Selection
  const handleSelectClient = (clientId) => {
    setSelectedClientId(clientId);
    if (!clientId) return;
    const client = clients.find((c) => c.id === clientId);
    if (!client) return;

    setForm((prev) => ({
      ...prev,
      customer_name: client.full_name || client.name || prev.customer_name,
      mobile: client.phone || client.mobile || prev.mobile,
      email: client.email || prev.email,
      site_address: client.address || client.site_address || prev.site_address,
      city: client.city || prev.city,
      state: client.state || prev.state,
      pincode: client.pincode || prev.pincode,
      customer_retailer: client.discom || prev.customer_retailer,
      customer_nmi: client.consumer_number || prev.customer_nmi,
    }));

    toast.success(`Loaded client details for "${client.full_name || client.name}"`);
  };

  // Handle Design Selection
  const handleSelectDesign = (designId) => {
    setSelectedDesignId(designId);
    if (!designId) return;
    const d = designsList.find((item) => item.id === designId);
    if (!d) return;

    const pWatt = Number(d.panel_wattage || 555);
    const pCount = Number(d.panel_count || (d.panels || []).filter((p) => !p.hidden).length || 18);
    const sysKw = Number(d.system_kw || ((pCount * pWatt) / 1000.0).toFixed(2));
    const subAmt = calculateSubsidy(sysKw, d.project_type || "residential");

    setForm((prev) => ({
      ...prev,
      customer_name: d.client_name || prev.customer_name,
      site_address: d.formatted_address || d.address || prev.site_address,
      system_kw: sysKw,
      linked_design_id: d.id,
      linked_design_name: d.site_name || d.name || "3D Rooftop Layout",
      snapshot_2d: d.layout_snapshot_2d || d.snapshot_2d || prev.snapshot_2d,
      snapshot_3d: d.layout_snapshot_3d || d.snapshot_3d || prev.snapshot_3d,
      roof_area_sqm: d.roof_area_sqm || prev.roof_area_sqm,
      usable_area_sqm: d.usable_area_sqm || prev.usable_area_sqm,
      tilt_deg: d.structure?.tilt_deg || prev.tilt_deg,
      azimuth_deg: d.structure?.azimuth || prev.azimuth_deg,
      mounting_clearance_m: d.structure?.height_m || prev.mounting_clearance_m,
      panel: {
        ...prev.panel,
        make: d.panel_make || prev.panel.make,
        model: d.panel_model || prev.panel.model,
        wattage: pWatt,
        quantity: pCount,
      },
      structure: {
        ...prev.structure,
        type: d.structure?.type === "flush" ? "Flush Rooftop Mount" : "Elevated Super Structure",
        height: d.structure?.height_m ? `${d.structure.height_m}m Clearance` : prev.structure.height,
      },
      subsidy_amount: subAmt,
      system_price: Math.round(sysKw * 50000),
    }));

    toast.success(`Imported 3D Design "${d.site_name || "Project"}"`);
  };

  // Product Master quick selects
  const handleSelectPanelProduct = (productId) => {
    const prod = solarPanelProducts.find((p) => p.id === productId);
    if (!prod) return;
    const wattMatch = (prod.name || "").match(/(\d{3,4})\s*(?:w|wp|watt)/i);
    const watt = prod.wattage || (wattMatch ? parseInt(wattMatch[1]) : form.panel?.wattage || 555);
    const count = form.panel?.quantity || Math.max(1, Math.round((form.system_kw * 1000) / watt));
    const sysKw = parseFloat(((count * watt) / 1000.0).toFixed(2));
    const subAmt = calculateSubsidy(sysKw, form.project_type);

    setForm((prev) => ({
      ...prev,
      system_kw: sysKw,
      subsidy_amount: subAmt,
      system_price: Math.round(sysKw * 50000),
      panel: {
        ...prev.panel,
        make: prod.brand || prod.make || prod.name,
        model: prod.model || prod.name,
        wattage: watt,
        quantity: count,
      },
      warranty_panel_product: prod.warranty || prev.warranty_panel_product,
    }));
    setIsSavedDraft(false);
    toast.success(`Selected Panel: ${prod.name}`);
  };

  const handleSelectInverterProduct = (productId) => {
    const prod = inverterProducts.find((p) => p.id === productId);
    if (!prod) return;
    setForm((prev) => ({
      ...prev,
      inverter: {
        ...prev.inverter,
        make: prod.brand || prod.make || prod.name,
        model: prod.model || prod.name,
        capacity: prod.capacity || `${prev.system_kw} kW`,
      },
      warranty_inverter: prod.warranty || prev.warranty_inverter,
    }));
    setIsSavedDraft(false);
    toast.success(`Selected Inverter: ${prod.name}`);
  };

  const handleSelectBatteryProduct = (productId) => {
    const prod = batteryProducts.find((p) => p.id === productId);
    if (!prod) return;
    setForm((prev) => ({
      ...prev,
      battery: {
        ...prev.battery,
        make: prod.brand || prod.make || prod.name,
        model: prod.model || prod.name,
        capacity: prod.capacity || prev.battery?.capacity || "5.0 kWh",
      },
      warranty_battery: prod.warranty || prev.warranty_battery,
    }));
    setIsSavedDraft(false);
    toast.success(`Selected Battery: ${prod.name}`);
  };

  // Live Calculated Metrics
  const metrics = useMemo(() => {
    return calculateSolarMetrics({
      systemKw: form.system_kw,
      systemPrice: form.system_price,
      tariffRate: form.tariff_rate,
      subsidyAmount: form.subsidy_applicable ? form.subsidy_amount : 0,
      additionalCharges: form.additional_charges,
      netMeterCharges: form.net_meter_charges,
      gstPct: form.gst_pct,
    });
  }, [
    form.system_kw,
    form.system_price,
    form.tariff_rate,
    form.subsidy_applicable,
    form.subsidy_amount,
    form.additional_charges,
    form.net_meter_charges,
    form.gst_pct,
  ]);

  // Save draft locally
  const handleSaveDraft = () => {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(form));
    setIsSavedDraft(true);
    toast.success("Proposal draft saved locally ✓");
  };

  // Generate Proposal Action
  const handleGenerateProposal = async () => {
    if (!form.customer_name?.trim() || !form.mobile?.trim()) {
      toast.warning("Please enter Customer Name and Phone Number.");
      setExpandedSections((prev) => ({ ...prev, step1: true }));
      setActiveStep(1);
      return;
    }

    setGenerating(true);
    try {
      const payload = {
        doc_type: "proposal",
        client_id: selectedClientId || undefined,
        doc_data: {
          ...form,
          template_id: form.template_id || "template1",
          system_kw: parseFloat(form.system_kw) || 10.0,
          annual_kwh: metrics.annualKwh,
          annual_savings: metrics.annualSavings,
          payback_years: metrics.paybackYears,
          lifetime_savings: metrics.lifetimeSavings,
          co2_tons: metrics.co2Tons,
          trees_count: metrics.treesCount,
          net_customer_cost: metrics.netCustomerCost - (form.custom_discount || 0),
          gross_cost: metrics.grossCost,
          gst_amount: metrics.gstAmount,
          monthly_data: metrics.monthlyData,
          self_consumption_pct: form.self_consumption_pct || 47,
          grid_export_pct: form.grid_export_pct || 53,
        },
      };

      const res = await api.post("/documents/generate", payload);
      refetchHistory();
      toast.success("Customer Proposal PDF generated successfully!");

      if (res.data?.id) {
        await downloadFile(res.data.id, res.data.filename || "Solar_Proposal.pdf");
      }
    } catch (err) {
      toast.error(formatApiError(err) || "Failed to generate proposal PDF");
    } finally {
      setGenerating(false);
    }
  };

  // Jump to specific step and expand it
  const jumpToStep = (stepId) => {
    setActiveStep(stepId);
    const key = `step${stepId}`;
    setExpandedSections((prev) => ({ ...prev, [key]: true }));
    const el = document.getElementById(`proposal-${key}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/80 p-2.5 sm:p-5 space-y-3.5 max-w-7xl mx-auto pb-20 text-slate-800">
      {/* ── TOP HEADER BAR ─────────────────────────────────────────────────── */}
      <div className="bg-white px-3.5 py-2.5 rounded-xl border border-slate-200/90 shadow-2xs flex flex-wrap items-center justify-between gap-2.5 sticky top-2 z-30 backdrop-blur-md bg-white/95">
        <div className="flex items-center gap-2.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => nav(-1)}
            className="h-7 w-7 p-0 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-slate-900 text-sm sm:text-base tracking-tight" style={{ fontFamily: "Outfit" }}>
                SOLARIX PROPOSAL GENERATOR
              </span>
              <Badge
                variant="outline"
                className={`text-[9px] font-bold px-1.5 py-0 rounded-full ${
                  isSavedDraft ? "bg-emerald-50 text-emerald-700 border-emerald-300" : "bg-amber-50 text-amber-700 border-amber-300"
                }`}
              >
                {isSavedDraft ? "Draft Saved" : "Unsaved Changes"}
              </Badge>
            </div>
            <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
              <span>Proposal Ref: <b className="font-mono text-slate-800">{form.proposal_number}</b></span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(form.proposal_number);
                  toast.success("Copied proposal number");
                }}
                className="hover:text-blue-600 transition text-slate-400"
                title="Copy reference number"
              >
                <Copy className="w-3 h-3 inline" />
              </button>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowFullViewerModal(true)}
            className="h-7 text-xs font-semibold rounded-lg border-slate-300 text-slate-700 hover:bg-slate-50 gap-1"
            title="Open Complete Proposal Document Viewer"
          >
            <Eye className="w-3.5 h-3.5 text-blue-600" />
            <span>Preview Document</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleSaveDraft}
            className="h-7 text-xs font-semibold rounded-lg border-slate-300 text-slate-700 hover:bg-slate-50 gap-1"
          >
            <Save className="w-3.5 h-3.5 text-slate-500" />
            <span>Save Draft</span>
          </Button>

          <Button
            size="sm"
            onClick={handleGenerateProposal}
            disabled={generating}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-7 px-3.5 rounded-lg shadow-xs gap-1"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{generating ? "Generating…" : "Generate Proposal"}</span>
          </Button>
        </div>
      </div>

      {/* ── STEP WIZARD NAVIGATOR & EXPAND/COLLAPSE CONTROLS ─────────────────── */}
      <div className="bg-white p-2.5 rounded-xl border border-slate-200/90 shadow-2xs space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 overflow-x-auto scrollbar-none py-0.5">
            <span className="font-semibold text-slate-600 shrink-0 text-[11px]">Autofill Source:</span>
            <Select value={sourceType} onValueChange={setSourceType}>
              <SelectTrigger className="h-6 text-xs rounded-md bg-slate-50 border-slate-200 w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual Entry</SelectItem>
                <SelectItem value="lead">Existing Lead</SelectItem>
                <SelectItem value="client">Client Record</SelectItem>
                <SelectItem value="design">3D Solar Design</SelectItem>
              </SelectContent>
            </Select>

            {sourceType === "lead" && (
              <Select value={selectedLeadId} onValueChange={handleSelectLead}>
                <SelectTrigger className="h-6 text-xs rounded-md bg-white border-blue-300 w-[170px]">
                  <SelectValue placeholder="Select Lead…" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {leadsList.map((lead) => (
                    <SelectItem key={lead.id} value={lead.id} className="text-xs">
                      {lead.name} ({lead.system_kw || 5} kW)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {sourceType === "client" && (
              <Select value={selectedClientId} onValueChange={handleSelectClient}>
                <SelectTrigger className="h-6 text-xs rounded-md bg-white border-blue-300 w-[170px]">
                  <SelectValue placeholder="Select Client…" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">
                      {c.full_name} ({c.city || "Site"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {sourceType === "design" && (
              <Select value={selectedDesignId} onValueChange={handleSelectDesign}>
                <SelectTrigger className="h-6 text-xs rounded-md bg-white border-blue-300 w-[170px]">
                  <SelectValue placeholder="Select 3D Project…" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {designsList.map((d) => (
                    <SelectItem key={d.id} value={d.id} className="text-xs">
                      {d.site_name || "Solar Project"} ({d.system_kw || 10} kWp)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={expandAll}
              className="h-6 text-[11px] px-2 text-slate-500 hover:text-slate-800"
            >
              Expand All
            </Button>
            <span className="text-slate-300">·</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={collapseAll}
              className="h-6 text-[11px] px-2 text-slate-500 hover:text-slate-800"
            >
              Collapse All
            </Button>
          </div>
        </div>

        {/* 8-Step Navigation Pills */}
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 pt-0.5">
          {STEP_CONFIG.map((step) => {
            const isCurrent = activeStep === step.id;
            return (
              <button
                key={step.id}
                onClick={() => jumpToStep(step.id)}
                className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition truncate text-center ${
                  isCurrent
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-600"
                }`}
              >
                <span>{step.icon}</span>
                <span className="truncate">{step.short}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* STEP 1 — BASIC DETAILS                                                */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      <Card id="proposal-step1" className="rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div
          onClick={() => toggleSection("step1")}
          className="p-3 bg-slate-50/80 hover:bg-slate-100/80 flex items-center justify-between cursor-pointer transition select-none"
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
              1
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">STEP 1 — BASIC DETAILS</h3>
              <p className="text-[10px] text-slate-500">Customer, project classification & sales representative info (Maps to PDF Pages 1 & 2)</p>
            </div>
          </div>
          {expandedSections.step1 ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>

        {expandedSections.step1 && (
          <CardContent className="p-3.5 pt-3 border-t border-slate-100 space-y-3">
            {/* Customer Information (3-col) */}
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">CUSTOMER CONTACT INFORMATION</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                <div>
                  <Label className="text-[11px] font-semibold text-slate-700">Customer / Entity Name *</Label>
                  <Input
                    value={form.customer_name}
                    onChange={(e) => { setForm({ ...form, customer_name: e.target.value }); setIsSavedDraft(false); }}
                    placeholder="e.g. Ramesh Patil / Green Energy Pvt Ltd"
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-700">Mobile Phone *</Label>
                  <Input
                    value={form.mobile}
                    onChange={(e) => { setForm({ ...form, mobile: e.target.value }); setIsSavedDraft(false); }}
                    placeholder="+91 98765 43210"
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-700">Email Address</Label>
                  <Input
                    value={form.email}
                    onChange={(e) => { setForm({ ...form, email: e.target.value }); setIsSavedDraft(false); }}
                    placeholder="customer@domain.com"
                    className="h-8 text-xs mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Site Address (3-col) */}
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">SITE LOCATION</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                <div className="md:col-span-1">
                  <Label className="text-[11px] font-semibold text-slate-700">Site Address (Street)</Label>
                  <Input
                    value={form.site_address}
                    onChange={(e) => { setForm({ ...form, site_address: e.target.value }); setIsSavedDraft(false); }}
                    placeholder="Plot 42, Sunrise Industrial Area"
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-700">City / District</Label>
                  <Input
                    value={form.city}
                    onChange={(e) => { setForm({ ...form, city: e.target.value }); setIsSavedDraft(false); }}
                    placeholder="Pune"
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <Label className="text-[11px] font-semibold text-slate-700">State</Label>
                    <Input
                      value={form.state}
                      onChange={(e) => { setForm({ ...form, state: e.target.value }); setIsSavedDraft(false); }}
                      className="h-8 text-xs mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold text-slate-700">Pincode</Label>
                    <Input
                      value={form.pincode}
                      onChange={(e) => { setForm({ ...form, pincode: e.target.value }); setIsSavedDraft(false); }}
                      placeholder="411001"
                      className="h-8 text-xs mt-1"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Project Classification & Proposal Dates (3-col) */}
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">PROJECT CLASSIFICATION & DATES</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                <div>
                  <Label className="text-[11px] font-semibold text-slate-700">Project Type</Label>
                  <Select
                    value={form.project_type}
                    onValueChange={(val) => { setForm({ ...form, project_type: val }); setIsSavedDraft(false); }}
                  >
                    <SelectTrigger className="h-8 text-xs mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Residential">Residential Solar Rooftop</SelectItem>
                      <SelectItem value="Commercial">Commercial & Industrial (C&I)</SelectItem>
                      <SelectItem value="Agricultural">Agricultural / Solar Pump</SelectItem>
                      <SelectItem value="Institutional">Institutional / Non-Profit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-700">Grid Connection</Label>
                  <Select
                    value={form.solar_system_type}
                    onValueChange={(val) => { setForm({ ...form, solar_system_type: val }); setIsSavedDraft(false); }}
                  >
                    <SelectTrigger className="h-8 text-xs mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Grid Connected / On Grid">Grid Connected / On-Grid</SelectItem>
                      <SelectItem value="Hybrid with Battery Storage">Hybrid with Battery Storage</SelectItem>
                      <SelectItem value="Off-Grid Standalone">Off-Grid Standalone</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-700">Proposal Date</Label>
                  <Input
                    type="date"
                    value={form.proposal_date}
                    onChange={(e) => { setForm({ ...form, proposal_date: e.target.value }); setIsSavedDraft(false); }}
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-700">Valid Until</Label>
                  <Input
                    type="date"
                    value={form.valid_until}
                    onChange={(e) => { setForm({ ...form, valid_until: e.target.value }); setIsSavedDraft(false); }}
                    className="h-8 text-xs mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Sales Representative / Prepared By (Auto-filled) */}
            <div className="p-2.5 bg-slate-50/80 rounded-lg border border-slate-200">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                SALES REPRESENTATIVE / PREPARED BY (PAGE 2 ABOUT US AUTO-FILL)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <Label className="text-[10.5px] font-medium text-slate-600">Prepared By</Label>
                  <Input
                    value={form.prepared_by}
                    onChange={(e) => { setForm({ ...form, prepared_by: e.target.value }); setIsSavedDraft(false); }}
                    className="h-7 text-xs mt-1 bg-white"
                  />
                </div>
                <div>
                  <Label className="text-[10.5px] font-medium text-slate-600">Representative Phone</Label>
                  <Input
                    value={form.representative_phone}
                    onChange={(e) => { setForm({ ...form, representative_phone: e.target.value }); setIsSavedDraft(false); }}
                    className="h-7 text-xs mt-1 bg-white"
                  />
                </div>
                <div>
                  <Label className="text-[10.5px] font-medium text-slate-600">Representative Email</Label>
                  <Input
                    value={form.representative_email}
                    onChange={(e) => { setForm({ ...form, representative_email: e.target.value }); setIsSavedDraft(false); }}
                    className="h-7 text-xs mt-1 bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Step Navigation */}
            <div className="flex justify-end pt-1">
              <Button
                size="sm"
                onClick={() => jumpToStep(2)}
                className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-1"
              >
                <span>Next: Solar System</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* STEP 2 — SOLAR SYSTEM                                                 */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      <Card id="proposal-step2" className="rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div
          onClick={() => toggleSection("step2")}
          className="p-3 bg-slate-50/80 hover:bg-slate-100/80 flex items-center justify-between cursor-pointer transition select-none"
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs">
              2
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">STEP 2 — SOLAR SYSTEM</h3>
              <p className="text-[10px] text-slate-500">Solar modules, string inverter, battery storage & mounting system (Maps to PDF Page 5)</p>
            </div>
          </div>
          {expandedSections.step2 ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>

        {expandedSections.step2 && (
          <CardContent className="p-3.5 pt-3 border-t border-slate-100 space-y-3.5">
            {/* 1. Solar Modules / Panels */}
            <div className="p-2.5 rounded-lg border border-slate-200 bg-white space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
                <div className="flex items-center gap-2">
                  <Sun className="w-4 h-4 text-amber-500" />
                  <span className="font-bold text-slate-800 text-xs">Solar Modules (PV Panels)</span>
                  <Badge className="bg-blue-100 text-blue-800 border-none text-[10px] font-bold">
                    Total DC: {form.system_kw} kWp
                  </Badge>
                </div>

                {solarPanelProducts.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-[10px] text-slate-500">Auto-fill from Master:</span>
                    <Select onValueChange={handleSelectPanelProduct}>
                      <SelectTrigger className="h-6 text-xs bg-slate-50 border-slate-300 w-[180px]">
                        <SelectValue placeholder="Select from Master…" />
                      </SelectTrigger>
                      <SelectContent className="max-h-56">
                        {solarPanelProducts.map((p) => (
                          <SelectItem key={p.id} value={p.id} className="text-xs">
                            {p.name} ({p.wattage || "550"}W)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                <div>
                  <Label className="text-[11px] font-semibold text-slate-700">Manufacturer / Brand</Label>
                  <Input
                    value={form.panel?.make}
                    onChange={(e) => {
                      setForm({ ...form, panel: { ...form.panel, make: e.target.value } });
                      setIsSavedDraft(false);
                    }}
                    placeholder="e.g. INA Solar / Tier-1"
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-700">Model / Type</Label>
                  <Input
                    value={form.panel?.model}
                    onChange={(e) => {
                      setForm({ ...form, panel: { ...form.panel, model: e.target.value } });
                      setIsSavedDraft(false);
                    }}
                    placeholder="e.g. 555 WP DCR TOPCon Bifacial"
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-700">Wattage per Panel (Wp)</Label>
                  <Input
                    type="number"
                    value={form.panel?.wattage}
                    onChange={(e) => {
                      const w = parseInt(e.target.value) || 550;
                      const count = form.panel?.quantity || 18;
                      const kw = parseFloat(((count * w) / 1000).toFixed(2));
                      setForm({
                        ...form,
                        system_kw: kw,
                        subsidy_amount: calculateSubsidy(kw, form.project_type),
                        system_price: Math.round(kw * 50000),
                        panel: { ...form.panel, wattage: w },
                      });
                      setIsSavedDraft(false);
                    }}
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-700">Panel Quantity (Nos)</Label>
                  <Input
                    type="number"
                    value={form.panel?.quantity}
                    onChange={(e) => {
                      const count = Math.max(1, parseInt(e.target.value) || 1);
                      const w = form.panel?.wattage || 550;
                      const kw = parseFloat(((count * w) / 1000).toFixed(2));
                      setForm({
                        ...form,
                        system_kw: kw,
                        subsidy_amount: calculateSubsidy(kw, form.project_type),
                        system_price: Math.round(kw * 50000),
                        panel: { ...form.panel, quantity: count },
                      });
                      setIsSavedDraft(false);
                    }}
                    className="h-8 text-xs mt-1"
                  />
                </div>
              </div>
            </div>

            {/* 2. String Inverters */}
            <div className="p-2.5 rounded-lg border border-slate-200 bg-white space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-blue-500" />
                  <span className="font-bold text-slate-800 text-xs">Solar String Inverter</span>
                </div>

                {inverterProducts.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-[10px] text-slate-500">Auto-fill from Master:</span>
                    <Select onValueChange={handleSelectInverterProduct}>
                      <SelectTrigger className="h-6 text-xs bg-slate-50 border-slate-300 w-[180px]">
                        <SelectValue placeholder="Select from Master…" />
                      </SelectTrigger>
                      <SelectContent className="max-h-56">
                        {inverterProducts.map((p) => (
                          <SelectItem key={p.id} value={p.id} className="text-xs">
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                <div>
                  <Label className="text-[11px] font-semibold text-slate-700">Manufacturer / Brand</Label>
                  <Input
                    value={form.inverter?.make}
                    onChange={(e) => {
                      setForm({ ...form, inverter: { ...form.inverter, make: e.target.value } });
                      setIsSavedDraft(false);
                    }}
                    placeholder="e.g. UTL Solar / Growatt"
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-700">Inverter Model</Label>
                  <Input
                    value={form.inverter?.model}
                    onChange={(e) => {
                      setForm({ ...form, inverter: { ...form.inverter, model: e.target.value } });
                      setIsSavedDraft(false);
                    }}
                    placeholder="Smart Grid-Tied Inverter"
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-700">Rated AC Capacity</Label>
                  <Input
                    value={form.inverter?.capacity}
                    onChange={(e) => {
                      setForm({ ...form, inverter: { ...form.inverter, capacity: e.target.value } });
                      setIsSavedDraft(false);
                    }}
                    placeholder={`${form.system_kw} kW`}
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-700">Phase & Quantity</Label>
                  <div className="grid grid-cols-2 gap-1 mt-1">
                    <Select
                      value={form.inverter?.phase}
                      onValueChange={(val) => {
                        setForm({ ...form, inverter: { ...form.inverter, phase: val } });
                        setIsSavedDraft(false);
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Single Phase">Single Phase</SelectItem>
                        <SelectItem value="Three Phase">Three Phase</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      value={form.inverter?.quantity || 1}
                      onChange={(e) => {
                        setForm({ ...form, inverter: { ...form.inverter, quantity: parseInt(e.target.value) || 1 } });
                        setIsSavedDraft(false);
                      }}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Battery Storage Option */}
            <div className="p-2.5 rounded-lg border border-slate-200 bg-white space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BatteryCharging className="w-4 h-4 text-emerald-500" />
                  <span className="font-bold text-slate-800 text-xs">Battery Energy Storage (Optional)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{form.battery_included ? "Included in Proposal" : "Not Required"}</span>
                  <Switch
                    checked={form.battery_included}
                    onCheckedChange={(val) => {
                      setForm({ ...form, battery_included: val });
                      setIsSavedDraft(false);
                    }}
                  />
                </div>
              </div>

              {form.battery_included && (
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  {batteryProducts.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-[10px] text-slate-500">Auto-fill from Master:</span>
                      <Select onValueChange={handleSelectBatteryProduct}>
                        <SelectTrigger className="h-6 text-xs bg-slate-50 border-slate-300 w-[180px]">
                          <SelectValue placeholder="Select from Master…" />
                        </SelectTrigger>
                        <SelectContent className="max-h-56">
                          {batteryProducts.map((p) => (
                            <SelectItem key={p.id} value={p.id} className="text-xs">
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                    <div>
                      <Label className="text-[11px] font-semibold text-slate-700">Battery Manufacturer</Label>
                      <Input
                        value={form.battery?.make}
                        onChange={(e) => {
                          setForm({ ...form, battery: { ...form.battery, make: e.target.value } });
                          setIsSavedDraft(false);
                        }}
                        placeholder="LiFePO4 Storage"
                        className="h-8 text-xs mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] font-semibold text-slate-700">Model</Label>
                      <Input
                        value={form.battery?.model}
                        onChange={(e) => {
                          setForm({ ...form, battery: { ...form.battery, model: e.target.value } });
                          setIsSavedDraft(false);
                        }}
                        placeholder="Smart Energy Wall"
                        className="h-8 text-xs mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] font-semibold text-slate-700">Capacity (kWh)</Label>
                      <Input
                        value={form.battery?.capacity}
                        onChange={(e) => {
                          setForm({ ...form, battery: { ...form.battery, capacity: e.target.value } });
                          setIsSavedDraft(false);
                        }}
                        placeholder="5.0 kWh"
                        className="h-8 text-xs mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] font-semibold text-slate-700">Quantity (Units)</Label>
                      <Input
                        type="number"
                        value={form.battery?.quantity || 1}
                        onChange={(e) => {
                          setForm({ ...form, battery: { ...form.battery, quantity: parseInt(e.target.value) || 1 } });
                          setIsSavedDraft(false);
                        }}
                        className="h-8 text-xs mt-1"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 4. Mounting Structure */}
            <div className="p-2.5 rounded-lg border border-slate-200 bg-white space-y-2">
              <span className="font-bold text-slate-800 text-xs block">Mounting Framework & Structure</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <Label className="text-[11px] font-semibold text-slate-700">Structure Type</Label>
                  <Select
                    value={form.structure?.type}
                    onValueChange={(val) => {
                      setForm({ ...form, structure: { ...form.structure, type: val } });
                      setIsSavedDraft(false);
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Elevated Super Structure">Elevated Super Structure (HDGI)</SelectItem>
                      <SelectItem value="Flush Rooftop Mount">Flush Rooftop Mount (Sheet Roof)</SelectItem>
                      <SelectItem value="Ballasted Non-Penetrating">Ballasted Non-Penetrating Racking</SelectItem>
                      <SelectItem value="Fixed Tilt Ground / Flat Mount">Fixed Tilt Rooftop Framework</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-700">Height / Clearance</Label>
                  <Input
                    value={form.structure?.height}
                    onChange={(e) => {
                      setForm({ ...form, structure: { ...form.structure, height: e.target.value } });
                      setIsSavedDraft(false);
                    }}
                    placeholder="1.8m Clearance"
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-700">Structural Material</Label>
                  <Input
                    value={form.structure?.material || "Aluminium 6063-T6 & Hot-Dip Galvanized Iron"}
                    onChange={(e) => {
                      setForm({ ...form, structure: { ...form.structure, material: e.target.value } });
                      setIsSavedDraft(false);
                    }}
                    className="h-8 text-xs mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Step Navigation */}
            <div className="flex justify-between pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => jumpToStep(1)}
                className="h-7 text-xs"
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Back to Step 1
              </Button>
              <Button
                size="sm"
                onClick={() => jumpToStep(3)}
                className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-1"
              >
                <span>Next: Site / Design</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* STEP 3 — SITE / DESIGN                                                */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      <Card id="proposal-step3" className="rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div
          onClick={() => toggleSection("step3")}
          className="p-3 bg-slate-50/80 hover:bg-slate-100/80 flex items-center justify-between cursor-pointer transition select-none"
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-purple-100 text-purple-800 flex items-center justify-center font-bold text-xs">
              3
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">STEP 3 — SITE / DESIGN</h3>
              <p className="text-[10px] text-slate-500">3D Solar Designer integration, roof area, usable area, tilt, azimuth & snapshot (Maps to PDF Page 3)</p>
            </div>
          </div>
          {expandedSections.step3 ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>

        {expandedSections.step3 && (
          <CardContent className="p-3.5 pt-3 border-t border-slate-100 space-y-3">
            {/* 3D Designer Integration Toolbar */}
            <div className="p-2.5 bg-blue-50/60 rounded-lg border border-blue-200/80 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-bold text-blue-900">3D Solar Designer Integration</span>
                {form.linked_design_id && (
                  <Badge className="bg-blue-600 text-white text-[9.5px]">Linked: {form.linked_design_name}</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => nav("/solar-designer")}
                  className="h-7 text-xs bg-white text-blue-700 hover:bg-blue-50 border-blue-300 gap-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open 3D Designer</span>
                </Button>
              </div>
            </div>

            {/* Roof Geometry & Dimensions (3-col) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              <div>
                <Label className="text-[11px] font-semibold text-slate-700">Total Roof Area (m²)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.roof_area_sqm}
                  onChange={(e) => {
                    const ra = parseFloat(e.target.value) || 0;
                    setForm({ ...form, roof_area_sqm: ra, usable_area_sqm: Math.round(ra * 0.85 * 10) / 10 });
                    setIsSavedDraft(false);
                  }}
                  className="h-8 text-xs mt-1"
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-semibold text-slate-700">Usable Solar Area (m²)</Label>
                  <button
                    onClick={() => {
                      const auto = Math.round(form.roof_area_sqm * 0.85 * 10) / 10;
                      setForm({ ...form, usable_area_sqm: auto });
                      setIsSavedDraft(false);
                    }}
                    className="text-[10px] text-blue-600 hover:underline"
                  >
                    85% of roof
                  </button>
                </div>
                <Input
                  type="number"
                  step="0.1"
                  value={form.usable_area_sqm}
                  onChange={(e) => { setForm({ ...form, usable_area_sqm: parseFloat(e.target.value) || 0 }); setIsSavedDraft(false); }}
                  className="h-8 text-xs mt-1"
                />
              </div>
              <div>
                <Label className="text-[11px] font-semibold text-slate-700">Roof Surface Type</Label>
                <Select
                  value={form.roof_type}
                  onValueChange={(val) => { setForm({ ...form, roof_type: val }); setIsSavedDraft(false); }}
                >
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RCC Flat Roof">RCC Flat Roof</SelectItem>
                    <SelectItem value="Trapezoidal Metal Sheet">Trapezoidal Metal Sheet</SelectItem>
                    <SelectItem value="Standing Seam Metal">Standing Seam Metal</SelectItem>
                    <SelectItem value="Mangalore / Clay Tiled Roof">Mangalore / Clay Tiled Roof</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-[11px] font-semibold text-slate-700">Tilt Angle (°)</Label>
                <Input
                  type="number"
                  value={form.tilt_deg}
                  onChange={(e) => { setForm({ ...form, tilt_deg: parseFloat(e.target.value) || 0 }); setIsSavedDraft(false); }}
                  className="h-8 text-xs mt-1"
                />
              </div>
              <div>
                <Label className="text-[11px] font-semibold text-slate-700">Azimuth / Direction from North (°)</Label>
                <Input
                  type="number"
                  value={form.azimuth_deg}
                  onChange={(e) => { setForm({ ...form, azimuth_deg: parseFloat(e.target.value) || 180 }); setIsSavedDraft(false); }}
                  className="h-8 text-xs mt-1"
                />
              </div>
              <div>
                <Label className="text-[11px] font-semibold text-slate-700">Mounting Clearance (m)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.mounting_clearance_m}
                  onChange={(e) => { setForm({ ...form, mounting_clearance_m: parseFloat(e.target.value) || 1.8 }); setIsSavedDraft(false); }}
                  className="h-8 text-xs mt-1"
                />
              </div>
            </div>

            {/* Design Snapshot Preview */}
            <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-12 h-12 rounded-lg bg-slate-200 overflow-hidden border border-slate-300 flex items-center justify-center shrink-0">
                  {form.snapshot_3d || form.snapshot_2d ? (
                    <img src={form.snapshot_3d || form.snapshot_2d} alt="Rooftop layout preview" className="w-full h-full object-cover" />
                  ) : (
                    <Compass className="w-6 h-6 text-slate-400" />
                  )}
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    {form.snapshot_3d || form.snapshot_2d ? "Rooftop Layout Diagram Attached" : "No 3D/2D Layout Attached"}
                  </span>
                  <p className="text-[10.5px] text-slate-500">
                    {form.snapshot_3d || form.snapshot_2d
                      ? "This visual snapshot will be rendered directly on Page 3 (Site Analysis) of the proposal."
                      : "Open 3D Solar Designer to draw the roof and place panels for automatic high-resolution diagram export."}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => nav("/solar-designer")}
                className="h-7 text-xs shrink-0"
              >
                {form.snapshot_3d || form.snapshot_2d ? "Update Layout" : "Create Layout"}
              </Button>
            </div>

            {/* Step Navigation */}
            <div className="flex justify-between pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => jumpToStep(2)}
                className="h-7 text-xs"
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Back to Step 2
              </Button>
              <Button
                size="sm"
                onClick={() => jumpToStep(4)}
                className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-1"
              >
                <span>Next: Energy Needs</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* STEP 4 — ENERGY NEEDS                                                 */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      <Card id="proposal-step4" className="rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div
          onClick={() => toggleSection("step4")}
          className="p-3 bg-slate-50/80 hover:bg-slate-100/80 flex items-center justify-between cursor-pointer transition select-none"
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs">
              4
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">STEP 4 — ENERGY NEEDS</h3>
              <p className="text-[10px] text-slate-500">Daily & annual energy consumption, tariff rate, current power bill & bill after solar (Maps to PDF Page 4)</p>
            </div>
          </div>
          {expandedSections.step4 ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>

        {expandedSections.step4 && (
          <CardContent className="p-3.5 pt-3 border-t border-slate-100 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              <div>
                <Label className="text-[11px] font-semibold text-slate-700">Daily Energy Consumption (kWh/day)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.daily_usage_kwh}
                  onChange={(e) => {
                    const d = parseFloat(e.target.value) || 0;
                    setForm({ ...form, daily_usage_kwh: d, annual_usage_kwh: Math.round(d * 365) });
                    setIsSavedDraft(false);
                  }}
                  className="h-8 text-xs mt-1"
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-semibold text-slate-700">Annual Energy Use (kWh)</Label>
                  <span className="text-[10px] text-slate-400">Daily × 365</span>
                </div>
                <Input
                  type="number"
                  value={form.annual_usage_kwh}
                  onChange={(e) => { setForm({ ...form, annual_usage_kwh: parseInt(e.target.value) || 0 }); setIsSavedDraft(false); }}
                  className="h-8 text-xs mt-1"
                />
              </div>
              <div>
                <Label className="text-[11px] font-semibold text-slate-700">Grid Electricity Tariff (₹ / kWh)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.tariff_rate}
                  onChange={(e) => { setForm({ ...form, tariff_rate: parseFloat(e.target.value) || 0 }); setIsSavedDraft(false); }}
                  className="h-8 text-xs mt-1"
                />
              </div>

              <div>
                <Label className="text-[11px] font-semibold text-slate-700">Current Power Bill (₹)</Label>
                <Input
                  type="number"
                  value={form.current_quarterly_bill}
                  onChange={(e) => { setForm({ ...form, current_quarterly_bill: parseInt(e.target.value) || 0 }); setIsSavedDraft(false); }}
                  className="h-8 text-xs mt-1"
                />
              </div>
              <div>
                <Label className="text-[11px] font-semibold text-slate-700">Bill Cycle Frequency</Label>
                <Select
                  value={form.bill_frequency || "Quarterly"}
                  onValueChange={(val) => { setForm({ ...form, bill_frequency: val }); setIsSavedDraft(false); }}
                >
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Quarterly">Quarterly (/quarter)</SelectItem>
                    <SelectItem value="Monthly">Monthly (/month)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px] font-semibold text-slate-700">Estimated Bill After Solar (₹)</Label>
                <Input
                  type="number"
                  value={form.post_solar_quarterly_bill}
                  onChange={(e) => { setForm({ ...form, post_solar_quarterly_bill: parseInt(e.target.value) || 0 }); setIsSavedDraft(false); }}
                  className="h-8 text-xs mt-1"
                />
              </div>
            </div>

            {/* Calculated Highlights */}
            <div className="grid grid-cols-2 gap-2 pt-1 text-center">
              <div className="p-2 bg-blue-50/70 rounded-lg border border-blue-100">
                <span className="text-[9px] font-bold text-blue-700 uppercase block">ESTIMATED YEAR-1 SAVINGS</span>
                <span className="text-sm font-black text-slate-900">{formatINR(metrics.annualSavings)}</span>
              </div>
              <div className="p-2 bg-emerald-50/70 rounded-lg border border-emerald-100">
                <span className="text-[9px] font-bold text-emerald-700 uppercase block">25-YEAR OVERALL POWER BILL SAVINGS</span>
                <span className="text-sm font-black text-emerald-700">{formatINR(metrics.lifetimeSavings)}</span>
              </div>
            </div>

            {/* Step Navigation */}
            <div className="flex justify-between pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => jumpToStep(3)}
                className="h-7 text-xs"
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Back to Step 3
              </Button>
              <Button
                size="sm"
                onClick={() => jumpToStep(5)}
                className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-1"
              >
                <span>Next: Solar Generation</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* STEP 5 — SOLAR GENERATION                                             */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      <Card id="proposal-step5" className="rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div
          onClick={() => toggleSection("step5")}
          className="p-3 bg-slate-50/80 hover:bg-slate-100/80 flex items-center justify-between cursor-pointer transition select-none"
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs">
              5
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">STEP 5 — SOLAR GENERATION</h3>
              <p className="text-[10px] text-slate-500">Average daily & annual solar generation, self-consumption vs export %, shade losses & carbon impact (Maps to PDF Page 5)</p>
            </div>
          </div>
          {expandedSections.step5 ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>

        {expandedSections.step5 && (
          <CardContent className="p-3.5 pt-3 border-t border-slate-100 space-y-3.5">
            {/* Generation Estimates (Calculated) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">AVERAGE DAILY GENERATION</span>
                <span className="text-base font-extrabold text-slate-900 mt-0.5 block">
                  {(metrics.annualKwh / 365).toFixed(1)} <span className="text-xs font-normal text-slate-500">kWh/day</span>
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">ESTIMATED YEAR-1 PRODUCTION</span>
                <span className="text-base font-extrabold text-slate-900 mt-0.5 block">
                  {formatNumberIN(metrics.annualKwh)} <span className="text-xs font-normal text-slate-500">kWh/year</span>
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">SHADE LOSSES ESTIMATE</span>
                  <span className="text-xs font-bold text-slate-700">{form.shade_losses_pct || 3.0}%</span>
                </div>
                <Input
                  type="number"
                  step="0.5"
                  value={form.shade_losses_pct || 3.0}
                  onChange={(e) => { setForm({ ...form, shade_losses_pct: parseFloat(e.target.value) || 0 }); setIsSavedDraft(false); }}
                  className="h-7 text-xs mt-1 bg-white"
                />
              </div>
            </div>

            {/* Self-Consumption vs Export */}
            <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-200 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800">Energy Consumption Split</span>
                <span className="font-mono text-[11px] text-slate-600">
                  Self-Consumed: <b>{form.self_consumption_pct}%</b> · Grid Export: <b>{form.grid_export_pct}%</b>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <div>
                  <Label className="text-[11px] font-semibold text-slate-700">Self-Consumption (%)</Label>
                  <Input
                    type="number"
                    value={form.self_consumption_pct}
                    onChange={(e) => {
                      const sc = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                      setForm({ ...form, self_consumption_pct: sc, grid_export_pct: 100 - sc });
                      setIsSavedDraft(false);
                    }}
                    className="h-8 text-xs mt-1 bg-white"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-700">Grid Exported (%)</Label>
                  <Input
                    type="number"
                    value={form.grid_export_pct}
                    onChange={(e) => {
                      const ge = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                      setForm({ ...form, grid_export_pct: ge, self_consumption_pct: 100 - ge });
                      setIsSavedDraft(false);
                    }}
                    className="h-8 text-xs mt-1 bg-white"
                  />
                </div>
              </div>

              {/* Progress Bar Visualizer */}
              <div className="h-2 w-full bg-blue-500 rounded-full overflow-hidden flex">
                <div style={{ width: `${form.self_consumption_pct}%` }} className="bg-emerald-500 h-full" title={`Self-Consumed: ${form.self_consumption_pct}%`} />
                <div style={{ width: `${form.grid_export_pct}%` }} className="bg-sky-500 h-full" title={`Grid Export: ${form.grid_export_pct}%`} />
              </div>
            </div>

            {/* Environmental Impact Badges */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-100">
                <Leaf className="w-3.5 h-3.5 text-emerald-600 mx-auto mb-0.5" />
                <span className="text-[9px] font-bold text-emerald-700 block">CARBON MITIGATION</span>
                <span className="text-xs font-extrabold text-slate-900">{metrics.co2Tons} Tons/yr</span>
              </div>
              <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-100">
                <TreePine className="w-3.5 h-3.5 text-emerald-600 mx-auto mb-0.5" />
                <span className="text-[9px] font-bold text-emerald-700 block">EQUIVALENT TREES</span>
                <span className="text-xs font-extrabold text-slate-900">{metrics.treesCount} Trees</span>
              </div>
              <div className="p-2 bg-slate-100 rounded-lg border border-slate-200">
                <ShieldCheck className="w-3.5 h-3.5 text-slate-600 mx-auto mb-0.5" />
                <span className="text-[9px] font-bold text-slate-700 block">COAL CONSERVED</span>
                <span className="text-xs font-extrabold text-slate-900">{Math.round(metrics.annualKwh * 0.4).toLocaleString()} kg/yr</span>
              </div>
            </div>

            {/* Step Navigation */}
            <div className="flex justify-between pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => jumpToStep(4)}
                className="h-7 text-xs"
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Back to Step 4
              </Button>
              <Button
                size="sm"
                onClick={() => jumpToStep(6)}
                className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-1"
              >
                <span>Next: Financials</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* STEP 6 — FINANCIALS                                                   */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      <Card id="proposal-step6" className="rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div
          onClick={() => toggleSection("step6")}
          className="p-3 bg-slate-50/80 hover:bg-slate-100/80 flex items-center justify-between cursor-pointer transition select-none"
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
              6
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">STEP 6 — FINANCIALS</h3>
              <p className="text-[10px] text-slate-500">System cost, GST, subsidy, net investment, 25-yr savings, ROI % p.a. & payback period (Maps to PDF Page 6)</p>
            </div>
          </div>
          {expandedSections.step6 ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>

        {expandedSections.step6 && (
          <CardContent className="p-3.5 pt-3 border-t border-slate-100 space-y-3.5">
            {/* Cost & GST Inputs (3-col) */}
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">INVESTMENT BREAKDOWN</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <Label className="text-[11px] font-semibold text-slate-700">Base System Cost (₹)</Label>
                  <Input
                    type="number"
                    value={form.system_price}
                    onChange={(e) => { setForm({ ...form, system_price: parseFloat(e.target.value) || 0 }); setIsSavedDraft(false); }}
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-700">Additional Charges / Net-Meter (₹)</Label>
                  <Input
                    type="number"
                    value={form.additional_charges}
                    onChange={(e) => { setForm({ ...form, additional_charges: parseFloat(e.target.value) || 0 }); setIsSavedDraft(false); }}
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-semibold text-slate-700">GST Rate (%)</Label>
                    <span className="text-[10px] font-bold text-blue-600">+{formatINR(metrics.gstAmount)}</span>
                  </div>
                  <Input
                    type="number"
                    step="0.1"
                    value={form.gst_pct}
                    onChange={(e) => { setForm({ ...form, gst_pct: parseFloat(e.target.value) || 0 }); setIsSavedDraft(false); }}
                    className="h-8 text-xs mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Subsidy & Discounts */}
            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge className="bg-emerald-600 text-white text-[9.5px]">Govt Incentive</Badge>
                  <span className="text-xs font-bold text-slate-800">PM Surya Ghar: Muft Bijli Yojana Subsidy</span>
                </div>
                <Switch
                  checked={form.subsidy_applicable}
                  onCheckedChange={(val) => {
                    const sub = val ? calculateSubsidy(form.system_kw, form.project_type) : 0;
                    setForm({ ...form, subsidy_applicable: val, subsidy_amount: sub });
                    setIsSavedDraft(false);
                  }}
                />
              </div>

              {form.subsidy_applicable && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <div>
                    <Label className="text-[11px] font-semibold text-slate-700">Calculated Central Subsidy (₹)</Label>
                    <Input
                      type="number"
                      value={form.subsidy_amount}
                      onChange={(e) => { setForm({ ...form, subsidy_amount: parseFloat(e.target.value) || 0 }); setIsSavedDraft(false); }}
                      className="h-8 text-xs mt-1 bg-white font-bold text-emerald-700"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold text-slate-700">Custom Customer Discount (₹)</Label>
                    <Input
                      type="number"
                      value={form.custom_discount || 0}
                      onChange={(e) => { setForm({ ...form, custom_discount: parseFloat(e.target.value) || 0 }); setIsSavedDraft(false); }}
                      placeholder="0"
                      className="h-8 text-xs mt-1 bg-white"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Prominent Net Investment Highlight */}
            <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-300/80 flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wide block">NET PROJECT INVESTMENT</span>
                <span className="text-xl font-black text-emerald-950">
                  {formatINR(metrics.netCustomerCost - (form.custom_discount || 0))}
                </span>
                <span className="text-[11px] text-slate-600 block mt-0.5">
                  Gross: {formatINR(metrics.grossCost)}
                  {form.subsidy_applicable && ` · Subsidy: -${formatINR(form.subsidy_amount)}`}
                  {form.custom_discount > 0 && ` · Discount: -${formatINR(form.custom_discount)}`}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-right">
                <div>
                  <span className="text-[9px] font-bold text-slate-500 uppercase block">RETURN ON INVESTMENT</span>
                  <span className="text-sm font-extrabold text-slate-900">
                    {((metrics.annualSavings / Math.max(1, metrics.netCustomerCost - (form.custom_discount || 0))) * 100).toFixed(1)}% p.a.
                  </span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-500 uppercase block">PAYBACK PERIOD</span>
                  <span className="text-sm font-extrabold text-slate-900">
                    {metrics.paybackYears} Years
                  </span>
                </div>
              </div>
            </div>

            {/* Step Navigation */}
            <div className="flex justify-between pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => jumpToStep(5)}
                className="h-7 text-xs"
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Back to Step 5
              </Button>
              <Button
                size="sm"
                onClick={() => jumpToStep(7)}
                className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-1"
              >
                <span>Next: Components & Warranty</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* STEP 7 — COMPONENTS & WARRANTY                                        */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      <Card id="proposal-step7" className="rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div
          onClick={() => toggleSection("step7")}
          className="p-3 bg-slate-50/80 hover:bg-slate-100/80 flex items-center justify-between cursor-pointer transition select-none"
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-xs">
              7
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">STEP 7 — COMPONENTS & WARRANTY</h3>
              <p className="text-[10px] text-slate-500">Hardware inclusions, customer/site information, project notes & dedicated equipment warranties (Maps to PDF Page 7)</p>
            </div>
          </div>
          {expandedSections.step7 ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>

        {expandedSections.step7 && (
          <CardContent className="p-3.5 pt-3 border-t border-slate-100 space-y-3.5">
            {/* Customer Site & DISCOM Utility Information (3-col) */}
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">CUSTOMER & SITE INFORMATION</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                <div>
                  <Label className="text-[11px] font-semibold text-slate-700">Energy Retailer / State DISCOM</Label>
                  <Input
                    value={form.customer_retailer}
                    onChange={(e) => { setForm({ ...form, customer_retailer: e.target.value }); setIsSavedDraft(false); }}
                    placeholder="e.g. Origin Energy / MSEDCL"
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-700">Consumer Account / NMI Number</Label>
                  <Input
                    value={form.customer_nmi}
                    onChange={(e) => { setForm({ ...form, customer_nmi: e.target.value }); setIsSavedDraft(false); }}
                    placeholder="e.g. Essential Energy / 4001292991"
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-700">Project / Site Installation Notes</Label>
                  <Input
                    value={form.proposal_notes}
                    onChange={(e) => { setForm({ ...form, proposal_notes: e.target.value }); setIsSavedDraft(false); }}
                    placeholder="Standard rooftop installation. Inverter to have 300mm clearance..."
                    className="h-8 text-xs mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Comprehensive 6-Point Warranty Schedule (3-col) */}
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                COMPREHENSIVE 6-POINT WARRANTY SCHEDULE (PAGE 7 EXACT PDF SECTION)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                  <Label className="text-[10.5px] font-bold text-slate-700">Solar Panels — Product Warranty</Label>
                  <Input
                    value={form.warranty_panel_product}
                    onChange={(e) => { setForm({ ...form, warranty_panel_product: e.target.value }); setIsSavedDraft(false); }}
                    className="h-7 text-xs mt-1 bg-white"
                  />
                </div>
                <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                  <Label className="text-[10.5px] font-bold text-slate-700">Solar Panels — Linear Performance</Label>
                  <Input
                    value={form.warranty_panel_performance}
                    onChange={(e) => { setForm({ ...form, warranty_panel_performance: e.target.value }); setIsSavedDraft(false); }}
                    className="h-7 text-xs mt-1 bg-white"
                  />
                </div>
                <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                  <Label className="text-[10.5px] font-bold text-slate-700">Solar Inverter Warranty</Label>
                  <Input
                    value={form.warranty_inverter}
                    onChange={(e) => { setForm({ ...form, warranty_inverter: e.target.value }); setIsSavedDraft(false); }}
                    className="h-7 text-xs mt-1 bg-white"
                  />
                </div>

                <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                  <Label className="text-[10.5px] font-bold text-slate-700">Battery Storage Warranty</Label>
                  <Input
                    value={form.warranty_battery}
                    onChange={(e) => { setForm({ ...form, warranty_battery: e.target.value }); setIsSavedDraft(false); }}
                    className="h-7 text-xs mt-1 bg-white"
                  />
                </div>
                <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                  <Label className="text-[10.5px] font-bold text-slate-700">Mounting Framework Warranty</Label>
                  <Input
                    value={form.warranty_mounting}
                    onChange={(e) => { setForm({ ...form, warranty_mounting: e.target.value }); setIsSavedDraft(false); }}
                    className="h-7 text-xs mt-1 bg-white"
                  />
                </div>
                <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                  <Label className="text-[10.5px] font-bold text-slate-700">Workmanship Warranty</Label>
                  <Input
                    value={form.warranty_workmanship}
                    onChange={(e) => { setForm({ ...form, warranty_workmanship: e.target.value }); setIsSavedDraft(false); }}
                    className="h-7 text-xs mt-1 bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Step Navigation */}
            <div className="flex justify-between pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => jumpToStep(6)}
                className="h-7 text-xs"
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Back to Step 6
              </Button>
              <Button
                size="sm"
                onClick={() => jumpToStep(8)}
                className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-1"
              >
                <span>Next: Quotation & Review</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* STEP 8 — QUOTATION & REVIEW                                           */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      <Card id="proposal-step8" className="rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div
          onClick={() => toggleSection("step8")}
          className="p-3 bg-slate-50/80 hover:bg-slate-100/80 flex items-center justify-between cursor-pointer transition select-none"
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-indigo-100 text-indigo-800 flex items-center justify-center font-bold text-xs">
              8
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">STEP 8 — QUOTATION & REVIEW</h3>
              <p className="text-[10px] text-slate-500">Commercial quotation, payment milestones, template selection & PDF generation (Maps to PDF Page 8)</p>
            </div>
          </div>
          {expandedSections.step8 ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>

        {expandedSections.step8 && (
          <CardContent className="p-3.5 pt-3 border-t border-slate-100 space-y-3.5">
            {/* Quotation Table Preview */}
            <div className="border border-slate-200 rounded-lg overflow-hidden bg-white text-xs">
              <div className="bg-slate-50 px-3 py-2 font-bold text-slate-700 border-b border-slate-200 flex justify-between">
                <span>COMMERCIAL QUOTATION SCHEDULE</span>
                <span>AMOUNT (INR)</span>
              </div>
              <div className="divide-y divide-slate-100">
                <div className="px-3 py-2 flex justify-between">
                  <span>Complete Solar System Package ({form.system_kw} kWp DC)</span>
                  <span className="font-semibold">{formatINR(form.system_price)}</span>
                </div>
                {form.additional_charges > 0 && (
                  <div className="px-3 py-2 flex justify-between text-slate-600">
                    <span>Additional Site Charges & Net-Metering</span>
                    <span>+{formatINR(form.additional_charges)}</span>
                  </div>
                )}
                <div className="px-3 py-2 flex justify-between text-slate-600">
                  <span>Goods and Services Tax (GST @ {form.gst_pct}%)</span>
                  <span>+{formatINR(metrics.gstAmount)}</span>
                </div>
                {form.subsidy_applicable && (
                  <div className="px-3 py-2 flex justify-between text-emerald-700 font-medium bg-emerald-50/50">
                    <span>PM Surya Ghar Government Subsidy (Direct Benefit Transfer)</span>
                    <span>-{formatINR(form.subsidy_amount)}</span>
                  </div>
                )}
                {form.custom_discount > 0 && (
                  <div className="px-3 py-2 flex justify-between text-blue-700 font-medium">
                    <span>Promotional / Custom Discount</span>
                    <span>-{formatINR(form.custom_discount)}</span>
                  </div>
                )}
                <div className="px-3 py-2 flex justify-between bg-slate-50 font-bold text-slate-900 border-t border-slate-200">
                  <span>TOTAL NET PROJECT INVESTMENT</span>
                  <span className="text-emerald-700 font-extrabold">{formatINR(metrics.netCustomerCost - (form.custom_discount || 0))}</span>
                </div>
              </div>
            </div>

            {/* Payment Milestones */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">PAYMENT MILESTONES</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAddMilestoneModal(true)}
                  className="h-6 text-[10px] text-blue-600 hover:text-blue-800 gap-1 p-0"
                >
                  <Plus className="w-3 h-3" /> Add Stage
                </Button>
              </div>

              <div className="space-y-1.5">
                {(form.milestones || []).map((m, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-slate-50/50 text-xs gap-2">
                    <span className="font-semibold text-slate-800 w-24 shrink-0">{m.stage}</span>
                    <span className="text-slate-600 flex-1 truncate">{m.label}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-[10px] font-bold bg-white">{m.pct}%</Badge>
                      <span className="font-bold text-slate-800">{formatINR(((metrics.netCustomerCost - (form.custom_discount || 0)) * m.pct) / 100)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Dual Proposal Template Selector */}
            <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200 space-y-2">
              <span className="text-xs font-bold text-slate-900 block">SELECT PROPOSAL DESIGN TEMPLATE</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Template 1 */}
                <div
                  onClick={() => { setForm({ ...form, template_id: "template1" }); setIsSavedDraft(false); }}
                  className={`p-3 rounded-lg border-2 cursor-pointer transition flex items-center gap-3 ${
                    form.template_id === "template1"
                      ? "border-blue-600 bg-blue-50/70 shadow-xs"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                    T1
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900">Solarix Premium</span>
                      {form.template_id === "template1" && (
                        <Check className="w-4 h-4 text-blue-600" />
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500">Modern vibrant solar EPC design with executive cards & charts</p>
                  </div>
                </div>

                {/* Template 2 */}
                <div
                  onClick={() => { setForm({ ...form, template_id: "template2" }); setIsSavedDraft(false); }}
                  className={`p-3 rounded-lg border-2 cursor-pointer transition flex items-center gap-3 ${
                    form.template_id === "template2"
                      ? "border-sky-600 bg-sky-50/70 shadow-xs"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-sky-700 text-white flex items-center justify-center font-bold text-xs shrink-0">
                    T2
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900">Solarix Corporate</span>
                      {form.template_id === "template2" && (
                        <Check className="w-4 h-4 text-sky-600" />
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500">Exact layout inspired by official SolarProof reference PDF</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions Toolbar */}
            <div className="flex flex-wrap items-center justify-between pt-2 border-t border-slate-100 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => jumpToStep(7)}
                className="h-7 text-xs"
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Back to Step 7
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowFullViewerModal(true)}
                  className="h-8 text-xs font-semibold rounded-lg border-slate-300 text-slate-700 hover:bg-slate-50 gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5 text-blue-600" />
                  <span>Preview Proposal</span>
                </Button>

                <Button
                  size="sm"
                  onClick={handleGenerateProposal}
                  disabled={generating}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-8 px-5 rounded-lg shadow-xs gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{generating ? "Building PDF…" : "Generate Proposal PDF"}</span>
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── COMPLETE PROPOSAL DOCUMENT VIEWER MODAL ─────────────────────────── */}
      <Dialog open={showFullViewerModal} onOpenChange={setShowFullViewerModal}>
        <DialogContent className="max-w-6xl w-[95vw] h-[90vh] p-0 bg-slate-950 border-slate-800 text-white overflow-hidden flex flex-col">
          {showFullViewerModal && (
            <ProposalDocumentViewer
              proposalData={form}
              companyData={companyData}
              metrics={metrics}
              onClose={() => setShowFullViewerModal(false)}
              onDownloadPdf={handleGenerateProposal}
              onSelectTemplate={(tid) => {
                setForm((prev) => ({ ...prev, template_id: tid }));
                setIsSavedDraft(false);
              }}
              downloading={generating}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── MODAL: ADD MILESTONE ────────────────────────────────────────────── */}
      <Dialog open={showAddMilestoneModal} onOpenChange={setShowAddMilestoneModal}>
        <DialogContent className="max-w-sm p-4 bg-white rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-slate-900">Add Payment Milestone</DialogTitle>
          </DialogHeader>
          <div className="space-y-2.5 pt-2">
            <div>
              <Label className="text-[11px] font-semibold text-slate-700">Stage Name</Label>
              <Input
                value={newMilestoneForm.stage}
                onChange={(e) => setNewMilestoneForm({ ...newMilestoneForm, stage: e.target.value })}
                className="h-8 text-xs mt-1"
              />
            </div>
            <div>
              <Label className="text-[11px] font-semibold text-slate-700">Description</Label>
              <Input
                value={newMilestoneForm.label}
                onChange={(e) => setNewMilestoneForm({ ...newMilestoneForm, label: e.target.value })}
                placeholder="e.g. 10% Upon DISCOM Sanction"
                className="h-8 text-xs mt-1"
              />
            </div>
            <div>
              <Label className="text-[11px] font-semibold text-slate-700">Percentage (%)</Label>
              <Input
                type="number"
                value={newMilestoneForm.pct}
                onChange={(e) => setNewMilestoneForm({ ...newMilestoneForm, pct: parseInt(e.target.value) || 0 })}
                className="h-8 text-xs mt-1"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setShowAddMilestoneModal(false)} className="h-7 text-xs">Cancel</Button>
              <Button
                size="sm"
                onClick={() => {
                  if (!newMilestoneForm.label) return;
                  setForm({ ...form, milestones: [...(form.milestones || []), newMilestoneForm] });
                  setShowAddMilestoneModal(false);
                  setNewMilestoneForm({ stage: "Milestone", label: "", pct: 10 });
                  setIsSavedDraft(false);
                }}
                className="h-7 text-xs bg-blue-600 text-white font-semibold"
              >
                Add Milestone
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
