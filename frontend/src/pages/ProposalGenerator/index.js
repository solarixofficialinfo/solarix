import React, { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api, { formatApiError, downloadFile } from "@/lib/api";
import { useCompany, useClientList } from "@/hooks/useClients";
import { useAuth } from "@/context/AuthContext";
import { useSalesDocuments } from "@/hooks/useSalesDocuments";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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
  Shield, Compass, BatteryCharging, Wrench, ChevronLeft
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
  { id: 2, key: "step2", title: "STEP 2 — SOLAR SYSTEM", subtitle: "Solar modules, string inverters, battery storage & mounting system", icon: "⚡", short: "2. System" },
  { id: 3, key: "step3", title: "STEP 3 — SITE / DESIGN", subtitle: "3D Solar Designer integration, roof area, pitch, tilt, azimuth & snapshot", icon: "📐", short: "3. Site" },
  { id: 4, key: "step4", title: "STEP 4 — ENERGY & FINANCIALS", subtitle: "Energy consumption, power bill savings, self-consumption vs export %, ROI & payback", icon: "📊", short: "4. Financials" },
  { id: 5, key: "step5", title: "STEP 5 — COMPONENTS & WARRANTY", subtitle: "Hardware inclusions summary & dedicated 6-point equipment warranty", icon: "🛡️", short: "5. Warranty" },
  { id: 6, key: "step6", title: "STEP 6 — QUOTATION", subtitle: "Pricing breakdown, GST, PM Surya Ghar subsidy, discounts & payment milestones", icon: "💰", short: "6. Quote" },
  { id: 7, key: "step7", title: "STEP 7 — REVIEW & GENERATE", subtitle: "Executive summary, dual template selection, instant preview & PDF generation", icon: "✨", short: "7. Review" },
];

export default function ProposalGenerator() {
  const location = useLocation();
  const nav = useNavigate();
  const { user } = useAuth();

  // Master queries
  const { data: companyData } = useCompany();
  const { data: clients = [] } = useClientList();
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
  const [editingEquipmentType, setEditingEquipmentType] = useState(null); // 'panel' | 'inverter' | 'structure' | 'cables' | 'custom'
  const [customItemForm, setCustomItemForm] = useState({ name: "", spec: "", qty: "1 Nos" });
  const [showAddScopeModal, setShowAddScopeModal] = useState(false);
  const [scopeTargetType, setScopeTargetType] = useState("our"); // 'our' | 'customer'
  const [newScopeText, setNewScopeText] = useState("");
  const [showAddMilestoneModal, setShowAddMilestoneModal] = useState(false);
  const [newMilestoneForm, setNewMilestoneForm] = useState({ stage: "Milestone", label: "", pct: 10 });

  // Full PDF document preview viewer modal
  const [showFullViewerModal, setShowFullViewerModal] = useState(false);
  const [generating, setGenerating] = useState(false);

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
      post_solar_quarterly_bill: 29000,
      self_consumption_pct: 47,
      grid_export_pct: 53,
      tariff_rate: 8.5,
      bos: [...DEFAULT_BOS_COMPONENTS],
      warranty_panel_product: "10 Years Product & Material Warranty",
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
    const defaultPrice = Math.round(Number(lead.proposed_price) || sysKw * 50000);

    setForm((prev) => ({
      ...prev,
      customer_name: lead.name || prev.customer_name,
      mobile: lead.mobile || prev.mobile,
      site_address: lead.address || prev.site_address,
      city: lead.city || prev.city,
      system_kw: sysKw,
      system_price: defaultPrice,
      subsidy_amount: subAmt,
      panel: {
        ...prev.panel,
        quantity: Math.max(1, Math.round((sysKw * 1000) / (prev.panel.wattage || 555))),
      },
      inverter: {
        ...prev.inverter,
        capacity: `${sysKw.toFixed(1)} kW`,
        phase: sysKw <= 5 ? "Single Phase" : "Three Phase",
      },
    }));

    toast.success(`Loaded customer details for lead "${lead.name}"`);
  };

  // Handle Client Selection
  const handleSelectClient = (clientId) => {
    setSelectedClientId(clientId);
    if (!clientId) return;
    const cl = clients.find((c) => c.id === clientId);
    if (!cl) return;

    const ob = (cl.stages && cl.stages.onboarding_data) || {};
    const sysKw = Number(cl.system_kw || ob.system_kw || 10.0);
    const subAmt = calculateSubsidy(sysKw, "residential");

    setForm((prev) => ({
      ...prev,
      customer_name: cl.full_name || prev.customer_name,
      mobile: cl.mobile || prev.mobile,
      email: cl.email || prev.email,
      site_address: cl.address || prev.site_address,
      city: cl.city || prev.city,
      state: cl.state || prev.state,
      pincode: cl.pincode || prev.pincode,
      system_kw: sysKw,
      subsidy_applicable: cl.subsidy_eligible ?? true,
      subsidy_amount: subAmt,
      system_price: Math.round(sysKw * 50000),
      panel: {
        ...prev.panel,
        make: ob.panel_brand || ob.panel_make || prev.panel.make,
        wattage: Number(ob.panel_wattage) || prev.panel.wattage || 555,
        quantity: Math.max(1, Math.round((sysKw * 1000) / (prev.panel.wattage || 555))),
      },
      inverter: {
        ...prev.inverter,
        make: ob.inverter_brand || ob.inverter_make || prev.inverter.make,
        model: ob.inverter_model || prev.inverter.model,
        capacity: ob.inverter_capacity || `${sysKw.toFixed(1)} kW`,
        phase: sysKw <= 5 ? "Single Phase" : "Three Phase",
      },
    }));

    toast.success(`Loaded client details for "${cl.full_name}"`);
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

  // Payment milestone percentage sum validation
  const milestoneTotalPct = useMemo(() => {
    return (form.milestones || []).reduce((sum, m) => sum + (Number(m.pct) || 0), 0);
  }, [form.milestones]);

  // Save Draft Action
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
          annual_kwh: metrics.annualKwh,
          annual_savings: metrics.annualSavings,
          payback_years: metrics.paybackYears,
          lifetime_savings: metrics.lifetimeSavings,
          co2_tons: metrics.co2Tons,
          trees_count: metrics.treesCount,
          net_customer_cost: metrics.netCustomerCost,
          gross_cost: metrics.grossCost,
          gst_amount: metrics.gstAmount,
          monthly_data: metrics.monthlyData,
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

  return (
    <div className="min-h-screen bg-slate-50/80 p-3 sm:p-6 space-y-4 max-w-7xl mx-auto pb-24">
      {/* ── TOP HEADER BAR ─────────────────────────────────────────────────── */}
      <div className="bg-white px-4 py-3 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-wrap items-center justify-between gap-3 sticky top-2 z-30 backdrop-blur-md bg-white/95">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => nav(-1)}
            className="h-8 w-8 p-0 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-slate-900 text-base tracking-tight" style={{ fontFamily: "Outfit" }}>
                SOLARIX PROPOSAL GENERATOR
              </span>
              <Badge
                variant="outline"
                className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                  isSavedDraft ? "bg-emerald-50 text-emerald-700 border-emerald-300" : "bg-amber-50 text-amber-700 border-amber-300"
                }`}
              >
                {isSavedDraft ? "Draft Saved" : "Unsaved Changes"}
              </Badge>
            </div>
            <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
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
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowFullViewerModal(true)}
            className="h-8 text-xs font-semibold rounded-xl border-slate-300 text-slate-700 hover:bg-slate-50 gap-1.5"
            title="Open Complete Proposal Document Viewer"
          >
            <Eye className="w-3.5 h-3.5 text-blue-600" />
            <span>Preview Document</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleSaveDraft}
            className="h-8 text-xs font-semibold rounded-xl border-slate-300 text-slate-700 hover:bg-slate-50 gap-1.5"
          >
            <Save className="w-3.5 h-3.5 text-slate-500" />
            <span>Save Draft</span>
          </Button>

          <Button
            size="sm"
            onClick={handleGenerateProposal}
            disabled={generating}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-8 px-4 rounded-xl shadow-xs gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{generating ? "Generating…" : "Generate Proposal"}</span>
          </Button>
        </div>
      </div>

      {/* ── STEP WIZARD NAVIGATOR & EXPAND/COLLAPSE CONTROLS ─────────────────── */}
      <div className="bg-white p-2 sm:p-2.5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-2">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 overflow-x-auto scrollbar-none py-0.5">
            <span className="font-semibold text-slate-600 shrink-0">Autofill:</span>
            <Select value={sourceType} onValueChange={setSourceType}>
              <SelectTrigger className="h-7 text-xs rounded-lg bg-slate-50 border-slate-200 w-[130px]">
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
                <SelectTrigger className="h-7 text-xs rounded-lg bg-white border-blue-300 w-[180px]">
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
                <SelectTrigger className="h-7 text-xs rounded-lg bg-white border-blue-300 w-[180px]">
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
                <SelectTrigger className="h-7 text-xs rounded-lg bg-white border-blue-300 w-[180px]">
                  <SelectValue placeholder="Select 3D Project…" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {designsList.map((d) => (
                    <SelectItem key={d.id} value={d.id} className="text-xs">
                      {d.site_name || d.name} ({d.system_kw || 0} kWp)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500 shrink-0">
            <button onClick={expandAll} className="hover:text-blue-600 font-medium">
              Expand All
            </button>
            <span>•</span>
            <button onClick={collapseAll} className="hover:text-blue-600 font-medium">
              Collapse All
            </button>
          </div>
        </div>

        {/* 7-Step Horizontal Pills */}
        <div className="flex items-center justify-between overflow-x-auto gap-1 sm:gap-1.5 scrollbar-none pt-0.5">
          {STEP_CONFIG.map((step) => {
            const isCurrent = activeStep === step.id;
            return (
              <button
                key={step.id}
                onClick={() => {
                  setActiveStep(step.id);
                  setExpandedSections((prev) => ({ ...prev, [step.key]: true }));
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  isCurrent
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 bg-slate-50/70 border border-slate-200/60"
                }`}
              >
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  isCurrent ? "bg-white text-blue-600" : "bg-slate-200 text-slate-700"
                }`}>
                  {step.id}
                </span>
                <span className="hidden lg:inline">{step.title}</span>
                <span className="lg:hidden">{step.short}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* STEP 1 — BASIC DETAILS                                                */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      <Card className="rounded-2xl border-slate-200/90 shadow-2xs overflow-hidden">
        <div
          onClick={() => toggleSection("step1")}
          className="p-3.5 sm:p-4 bg-slate-50/70 hover:bg-slate-100/70 flex items-center justify-between cursor-pointer transition select-none"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs">
              1
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <span>STEP 1 — BASIC DETAILS</span>
                {form.customer_name && (
                  <span className="text-[11px] font-normal text-slate-500">· {form.customer_name}</span>
                )}
              </h3>
              <p className="text-[10.5px] text-slate-500">Customer contact information, site address, proposal metadata and representative</p>
            </div>
          </div>
          {expandedSections.step1 ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>

        {expandedSections.step1 && (
          <CardContent className="p-4 pt-3 border-t border-slate-100 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              <div>
                <Label className="text-[11px] font-semibold text-slate-600">Customer Name *</Label>
                <Input
                  value={form.customer_name}
                  onChange={(e) => { setForm({ ...form, customer_name: e.target.value }); setIsSavedDraft(false); }}
                  placeholder="e.g. Billy Bines"
                  className="h-8 text-xs mt-1"
                />
              </div>

              <div>
                <Label className="text-[11px] font-semibold text-slate-600">Phone Number *</Label>
                <Input
                  value={form.mobile}
                  onChange={(e) => { setForm({ ...form, mobile: e.target.value }); setIsSavedDraft(false); }}
                  placeholder="e.g. 0444 444 444"
                  className="h-8 text-xs mt-1"
                />
              </div>

              <div>
                <Label className="text-[11px] font-semibold text-slate-600">Email Address</Label>
                <Input
                  value={form.email}
                  onChange={(e) => { setForm({ ...form, email: e.target.value }); setIsSavedDraft(false); }}
                  placeholder="e.g. customer@example.com"
                  className="h-8 text-xs mt-1"
                />
              </div>

              <div className="sm:col-span-2">
                <Label className="text-[11px] font-semibold text-slate-600">Site Installation Address</Label>
                <Input
                  value={form.site_address}
                  onChange={(e) => { setForm({ ...form, site_address: e.target.value }); setIsSavedDraft(false); }}
                  placeholder="e.g. 222 Margaret Street, Brisbane City, QLD, 4000"
                  className="h-8 text-xs mt-1"
                />
              </div>

              <div>
                <Label className="text-[11px] font-semibold text-slate-600">City / Suburb</Label>
                <Input
                  value={form.city}
                  onChange={(e) => { setForm({ ...form, city: e.target.value }); setIsSavedDraft(false); }}
                  placeholder="e.g. Brisbane / Pune"
                  className="h-8 text-xs mt-1"
                />
              </div>

              <div>
                <Label className="text-[11px] font-semibold text-slate-600">State / Territory</Label>
                <Input
                  value={form.state}
                  onChange={(e) => { setForm({ ...form, state: e.target.value }); setIsSavedDraft(false); }}
                  placeholder="e.g. QLD / Maharashtra"
                  className="h-8 text-xs mt-1"
                />
              </div>

              <div>
                <Label className="text-[11px] font-semibold text-slate-600">PIN / Postal Code</Label>
                <Input
                  value={form.pincode}
                  onChange={(e) => { setForm({ ...form, pincode: e.target.value }); setIsSavedDraft(false); }}
                  placeholder="e.g. 4000"
                  className="h-8 text-xs mt-1"
                />
              </div>

              <div>
                <Label className="text-[11px] font-semibold text-slate-600">Project Classification</Label>
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
                <Label className="text-[11px] font-semibold text-slate-600">Proposal Date</Label>
                <Input
                  type="date"
                  value={form.proposal_date}
                  onChange={(e) => { setForm({ ...form, proposal_date: e.target.value }); setIsSavedDraft(false); }}
                  className="h-8 text-xs mt-1"
                />
              </div>

              <div>
                <Label className="text-[11px] font-semibold text-slate-600">Valid Until</Label>
                <Input
                  type="date"
                  value={form.valid_until}
                  onChange={(e) => { setForm({ ...form, valid_until: e.target.value }); setIsSavedDraft(false); }}
                  className="h-8 text-xs mt-1"
                />
              </div>

              <div>
                <Label className="text-[11px] font-semibold text-slate-600">Sales Representative</Label>
                <Input
                  value={form.prepared_by}
                  onChange={(e) => { setForm({ ...form, prepared_by: e.target.value }); setIsSavedDraft(false); }}
                  placeholder="e.g. Chris Taeni"
                  className="h-8 text-xs mt-1"
                />
              </div>

              <div>
                <Label className="text-[11px] font-semibold text-slate-600">Representative Phone</Label>
                <Input
                  value={form.representative_phone}
                  onChange={(e) => { setForm({ ...form, representative_phone: e.target.value }); setIsSavedDraft(false); }}
                  placeholder="e.g. 0411 549 054"
                  className="h-8 text-xs mt-1"
                />
              </div>

              <div>
                <Label className="text-[11px] font-semibold text-slate-600">Representative Email</Label>
                <Input
                  value={form.representative_email}
                  onChange={(e) => { setForm({ ...form, representative_email: e.target.value }); setIsSavedDraft(false); }}
                  placeholder="e.g. rep@solarix.energy"
                  className="h-8 text-xs mt-1"
                />
              </div>

              <div>
                <Label className="text-[11px] font-semibold text-slate-600">Energy Retailer / DISCOM</Label>
                <Input
                  value={form.customer_retailer}
                  onChange={(e) => { setForm({ ...form, customer_retailer: e.target.value }); setIsSavedDraft(false); }}
                  placeholder="e.g. Origin Energy / MSEDCL"
                  className="h-8 text-xs mt-1"
                />
              </div>

              <div>
                <Label className="text-[11px] font-semibold text-slate-600">Distributor / NMI / Consumer No.</Label>
                <Input
                  value={form.customer_nmi}
                  onChange={(e) => { setForm({ ...form, customer_nmi: e.target.value }); setIsSavedDraft(false); }}
                  placeholder="e.g. Essential Energy / 4001292991"
                  className="h-8 text-xs mt-1"
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* STEP 2 — SOLAR SYSTEM                                                 */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      <Card className="rounded-2xl border-slate-200/90 shadow-2xs overflow-hidden">
        <div
          onClick={() => toggleSection("step2")}
          className="p-3.5 sm:p-4 bg-slate-50/70 hover:bg-slate-100/70 flex items-center justify-between cursor-pointer transition select-none"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs">
              2
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <span>STEP 2 — SOLAR SYSTEM</span>
                <span className="text-[11px] font-normal text-slate-500">· {form.system_kw} kWp DC</span>
              </h3>
              <p className="text-[10.5px] text-slate-500">Solar panels, string inverter, optional battery storage and mounting structure</p>
            </div>
          </div>
          {expandedSections.step2 ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>

        {expandedSections.step2 && (
          <CardContent className="p-4 pt-3 border-t border-slate-100 space-y-4">
            {/* System Capacity Quick Bar */}
            <div className="flex flex-wrap items-center justify-between p-3 bg-blue-50/60 rounded-xl border border-blue-100 gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-blue-900 uppercase">System Capacity (kWp):</span>
                <Input
                  type="number"
                  step="0.1"
                  value={form.system_kw}
                  onChange={(e) => {
                    const kw = parseFloat(e.target.value) || 0;
                    const watt = form.panel?.wattage || 555;
                    const count = Math.max(1, Math.round((kw * 1000) / watt));
                    setForm({
                      ...form,
                      system_kw: kw,
                      panel: { ...form.panel, quantity: count },
                      inverter: { ...form.inverter, capacity: `${kw.toFixed(1)} kW` },
                    });
                    setIsSavedDraft(false);
                  }}
                  className="w-24 h-7 text-xs font-bold bg-white"
                />
              </div>
              <div className="text-[11px] text-slate-600 flex items-center gap-3">
                <span>Modules: <b className="text-slate-900">{form.panel?.quantity || 18} Nos</b></span>
                <span>Inverter: <b className="text-slate-900">{form.inverter?.capacity || `${form.system_kw} kW`}</b></span>
                <span>Battery: <b className={form.battery_included ? "text-emerald-700" : "text-slate-500"}>{form.battery_included ? "Included" : "Not Included"}</b></span>
              </div>
            </div>

            {/* Equipment Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              {/* Solar Panels */}
              <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                  <span className="font-bold text-slate-800 text-[11px] flex items-center gap-1">
                    <Sun className="w-3.5 h-3.5 text-amber-500" /> Solar Panels
                  </span>
                  <Badge className="bg-slate-100 text-slate-700 text-[9.5px]">Tier-1 PV</Badge>
                </div>
                <div>
                  <Label className="text-[10.5px] text-slate-600">Manufacturer / Brand</Label>
                  <Input
                    value={form.panel?.make}
                    onChange={(e) => { setForm({ ...form, panel: { ...form.panel, make: e.target.value } }); setIsSavedDraft(false); }}
                    className="h-7 text-xs mt-0.5"
                    placeholder="e.g. SunPower / Waaree"
                  />
                </div>
                <div>
                  <Label className="text-[10.5px] text-slate-600">Model / Type</Label>
                  <Input
                    value={form.panel?.model}
                    onChange={(e) => { setForm({ ...form, panel: { ...form.panel, model: e.target.value } }); setIsSavedDraft(false); }}
                    className="h-7 text-xs mt-0.5"
                    placeholder="e.g. SPR-E19-320 / Mono Bifacial"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10.5px] text-slate-600">Wattage (Wp)</Label>
                    <Input
                      type="number"
                      value={form.panel?.wattage}
                      onChange={(e) => {
                        const watt = parseInt(e.target.value) || 0;
                        const qty = form.panel?.quantity || 1;
                        setForm({
                          ...form,
                          panel: { ...form.panel, wattage: watt },
                          system_kw: parseFloat(((watt * qty) / 1000).toFixed(2)),
                        });
                        setIsSavedDraft(false);
                      }}
                      className="h-7 text-xs mt-0.5"
                    />
                  </div>
                  <div>
                    <Label className="text-[10.5px] text-slate-600">Quantity (Nos)</Label>
                    <Input
                      type="number"
                      value={form.panel?.quantity}
                      onChange={(e) => {
                        const qty = parseInt(e.target.value) || 0;
                        const watt = form.panel?.wattage || 555;
                        setForm({
                          ...form,
                          panel: { ...form.panel, quantity: qty },
                          system_kw: parseFloat(((watt * qty) / 1000).toFixed(2)),
                        });
                        setIsSavedDraft(false);
                      }}
                      className="h-7 text-xs mt-0.5"
                    />
                  </div>
                </div>
              </div>

              {/* Inverter */}
              <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                  <span className="font-bold text-slate-800 text-[11px] flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-blue-500" /> Solar Inverter
                  </span>
                  <Badge className="bg-slate-100 text-slate-700 text-[9.5px]">String On-Grid</Badge>
                </div>
                <div>
                  <Label className="text-[10.5px] text-slate-600">Inverter Manufacturer</Label>
                  <Input
                    value={form.inverter?.make}
                    onChange={(e) => { setForm({ ...form, inverter: { ...form.inverter, make: e.target.value } }); setIsSavedDraft(false); }}
                    className="h-7 text-xs mt-0.5"
                    placeholder="e.g. ABB / Growatt / SolarEdge"
                  />
                </div>
                <div>
                  <Label className="text-[10.5px] text-slate-600">Inverter Model</Label>
                  <Input
                    value={form.inverter?.model}
                    onChange={(e) => { setForm({ ...form, inverter: { ...form.inverter, model: e.target.value } }); setIsSavedDraft(false); }}
                    className="h-7 text-xs mt-0.5"
                    placeholder="e.g. PVI-10.0-TL-OUTD-FS"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10.5px] text-slate-600">Rated Capacity</Label>
                    <Input
                      value={form.inverter?.capacity}
                      onChange={(e) => { setForm({ ...form, inverter: { ...form.inverter, capacity: e.target.value } }); setIsSavedDraft(false); }}
                      className="h-7 text-xs mt-0.5"
                      placeholder="e.g. 10kW"
                    />
                  </div>
                  <div>
                    <Label className="text-[10.5px] text-slate-600">Phase</Label>
                    <Select
                      value={form.inverter?.phase}
                      onValueChange={(val) => { setForm({ ...form, inverter: { ...form.inverter, phase: val } }); setIsSavedDraft(false); }}
                    >
                      <SelectTrigger className="h-7 text-xs mt-0.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Single Phase">Single Phase</SelectItem>
                        <SelectItem value="Three Phase">Three Phase</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Battery Storage */}
              <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                  <span className="font-bold text-slate-800 text-[11px] flex items-center gap-1">
                    <BatteryCharging className="w-3.5 h-3.5 text-emerald-600" /> Battery Storage
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500">{form.battery_included ? "Included" : "Not Included"}</span>
                    <Switch
                      checked={form.battery_included}
                      onCheckedChange={(val) => { setForm({ ...form, battery_included: val }); setIsSavedDraft(false); }}
                    />
                  </div>
                </div>

                {form.battery_included ? (
                  <>
                    <div>
                      <Label className="text-[10.5px] text-slate-600">Battery Manufacturer</Label>
                      <Input
                        value={form.battery?.make}
                        onChange={(e) => { setForm({ ...form, battery: { ...form.battery, make: e.target.value } }); setIsSavedDraft(false); }}
                        className="h-7 text-xs mt-0.5"
                        placeholder="e.g. Tesla / BYD / Pylontech"
                      />
                    </div>
                    <div>
                      <Label className="text-[10.5px] text-slate-600">Model / Usable Capacity</Label>
                      <Input
                        value={form.battery?.capacity}
                        onChange={(e) => { setForm({ ...form, battery: { ...form.battery, capacity: e.target.value } }); setIsSavedDraft(false); }}
                        className="h-7 text-xs mt-0.5"
                        placeholder="e.g. 5.0 kWh LiFePO4"
                      />
                    </div>
                  </>
                ) : (
                  <div className="p-4 text-center rounded-lg bg-slate-50 border border-dashed border-slate-200 text-slate-400 text-[11px]">
                    Battery storage is marked as <b>Not Included</b> for this grid-tied solar system.
                  </div>
                )}
              </div>
            </div>

            {/* Mounting System & Proposal Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
              <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
                <span className="font-bold text-slate-800 text-[11px] block border-b border-slate-100 pb-1.5">
                  Mounting & Structural Framework
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10.5px] text-slate-600">Mounting Type</Label>
                    <Input
                      value={form.structure?.type}
                      onChange={(e) => { setForm({ ...form, structure: { ...form.structure, type: e.target.value } }); setIsSavedDraft(false); }}
                      className="h-7 text-xs mt-0.5"
                      placeholder="e.g. Clenergy / Elevated GI"
                    />
                  </div>
                  <div>
                    <Label className="text-[10.5px] text-slate-600">Height / Clearance</Label>
                    <Input
                      value={form.structure?.height}
                      onChange={(e) => { setForm({ ...form, structure: { ...form.structure, height: e.target.value } }); setIsSavedDraft(false); }}
                      className="h-7 text-xs mt-0.5"
                      placeholder="e.g. 1.8m Clearance"
                    />
                  </div>
                </div>
              </div>

              <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
                <span className="font-bold text-slate-800 text-[11px] block border-b border-slate-100 pb-1.5">
                  Installation / Project Notes
                </span>
                <textarea
                  value={form.proposal_notes}
                  onChange={(e) => { setForm({ ...form, proposal_notes: e.target.value }); setIsSavedDraft(false); }}
                  rows={2}
                  className="w-full text-xs p-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
                  placeholder="Special instructions or site constraints..."
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* STEP 3 — SITE / DESIGN                                                */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      <Card className="rounded-2xl border-slate-200/90 shadow-2xs overflow-hidden">
        <div
          onClick={() => toggleSection("step3")}
          className="p-3.5 sm:p-4 bg-slate-50/70 hover:bg-slate-100/70 flex items-center justify-between cursor-pointer transition select-none"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
              3
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <span>STEP 3 — SITE / DESIGN</span>
                {form.linked_design_name && (
                  <span className="text-[11px] font-normal text-slate-500">· {form.linked_design_name}</span>
                )}
              </h3>
              <p className="text-[10.5px] text-slate-500">3D Solar Designer integration, roof area, pitch, tilt angle, azimuth and rooftop layout snapshot</p>
            </div>
          </div>
          {expandedSections.step3 ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>

        {expandedSections.step3 && (
          <CardContent className="p-4 pt-3 border-t border-slate-100 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <Label className="text-[11px] font-semibold text-slate-600">Total Roof Area (m²)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.roof_area_sqm}
                  onChange={(e) => { setForm({ ...form, roof_area_sqm: parseFloat(e.target.value) || 0 }); setIsSavedDraft(false); }}
                  className="h-8 text-xs mt-1"
                />
              </div>

              <div>
                <Label className="text-[11px] font-semibold text-slate-600">Usable Solar Area (m²)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.usable_area_sqm || 35.0}
                  onChange={(e) => { setForm({ ...form, usable_area_sqm: parseFloat(e.target.value) || 0 }); setIsSavedDraft(false); }}
                  className="h-8 text-xs mt-1"
                />
              </div>

              <div>
                <Label className="text-[11px] font-semibold text-slate-600">Tilt Angle (°)</Label>
                <Input
                  type="number"
                  value={form.tilt_deg}
                  onChange={(e) => { setForm({ ...form, tilt_deg: parseFloat(e.target.value) || 0 }); setIsSavedDraft(false); }}
                  className="h-8 text-xs mt-1"
                />
              </div>

              <div>
                <Label className="text-[11px] font-semibold text-slate-600">Direction from North / Azimuth (°)</Label>
                <Input
                  type="number"
                  value={form.azimuth_deg}
                  onChange={(e) => { setForm({ ...form, azimuth_deg: parseFloat(e.target.value) || 0 }); setIsSavedDraft(false); }}
                  className="h-8 text-xs mt-1"
                />
              </div>
            </div>

            {/* Design Snapshot Visual Preview */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-800 text-[11px] flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-blue-600" /> Rooftop Layout & 3D Design Snapshot
                </span>
                {form.linked_design_id && (
                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-300 text-[9.5px]">
                    Linked to 3D Designer
                  </Badge>
                )}
              </div>

              {form.snapshot_2d || form.snapshot_3d ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {form.snapshot_2d && (
                    <div className="relative rounded-lg overflow-hidden border border-slate-300 bg-white aspect-video max-h-48 flex items-center justify-center">
                      <img src={form.snapshot_2d} alt="2D Roof Layout" className="w-full h-full object-contain" />
                      <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded">2D Array Layout</span>
                    </div>
                  )}
                  {form.snapshot_3d && (
                    <div className="relative rounded-lg overflow-hidden border border-slate-300 bg-white aspect-video max-h-48 flex items-center justify-center">
                      <img src={form.snapshot_3d} alt="3D Solar Visualization" className="w-full h-full object-contain" />
                      <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded">3D Satellite Model</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-6 text-center border-2 border-dashed border-slate-200 rounded-lg text-slate-400 text-xs">
                  No 3D snapshot attached yet. Select an existing project from the "Autofill: 3D Solar Design" dropdown above to attach real satellite rooftop rendering.
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* STEP 4 — ENERGY & FINANCIALS                                          */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      <Card className="rounded-2xl border-slate-200/90 shadow-2xs overflow-hidden">
        <div
          onClick={() => toggleSection("step4")}
          className="p-3.5 sm:p-4 bg-slate-50/70 hover:bg-slate-100/70 flex items-center justify-between cursor-pointer transition select-none"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-800 flex items-center justify-center font-bold text-xs">
              4
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <span>STEP 4 — ENERGY & FINANCIALS</span>
                <span className="text-[11px] font-normal text-slate-500">· ~{formatNumberIN(metrics.annualKwh)} kWh/year</span>
              </h3>
              <p className="text-[10.5px] text-slate-500">Daily/annual energy usage, quarterly bill before & after solar, production yield and payback</p>
            </div>
          </div>
          {expandedSections.step4 ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>

        {expandedSections.step4 && (
          <CardContent className="p-4 pt-3 border-t border-slate-100 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <Label className="text-[11px] font-semibold text-slate-600">Daily Consumption (kWh/day)</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={form.daily_usage_kwh || 20.0}
                  onChange={(e) => {
                    const d = parseFloat(e.target.value) || 0;
                    setForm({ ...form, daily_usage_kwh: d, annual_usage_kwh: Math.round(d * 365) });
                    setIsSavedDraft(false);
                  }}
                  className="h-8 text-xs mt-1"
                />
              </div>

              <div>
                <Label className="text-[11px] font-semibold text-slate-600">Annual Energy Use (kWh)</Label>
                <Input
                  type="number"
                  value={form.annual_usage_kwh || 7300}
                  onChange={(e) => { setForm({ ...form, annual_usage_kwh: parseInt(e.target.value) || 0 }); setIsSavedDraft(false); }}
                  className="h-8 text-xs mt-1"
                />
              </div>

              <div>
                <Label className="text-[11px] font-semibold text-slate-600">Electricity Tariff (₹ / kWh)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.tariff_rate}
                  onChange={(e) => { setForm({ ...form, tariff_rate: parseFloat(e.target.value) || 0 }); setIsSavedDraft(false); }}
                  className="h-8 text-xs mt-1"
                />
              </div>

              <div>
                <Label className="text-[11px] font-semibold text-slate-600">Self-Consumption (%)</Label>
                <Input
                  type="number"
                  value={form.self_consumption_pct || 47}
                  onChange={(e) => {
                    const sc = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                    setForm({ ...form, self_consumption_pct: sc, grid_export_pct: 100 - sc });
                    setIsSavedDraft(false);
                  }}
                  className="h-8 text-xs mt-1"
                />
              </div>

              <div>
                <Label className="text-[11px] font-semibold text-slate-600">Current Power Bill (₹/qtr)</Label>
                <Input
                  type="number"
                  value={form.current_quarterly_bill || 68000}
                  onChange={(e) => { setForm({ ...form, current_quarterly_bill: parseInt(e.target.value) || 0 }); setIsSavedDraft(false); }}
                  className="h-8 text-xs mt-1"
                />
              </div>

              <div>
                <Label className="text-[11px] font-semibold text-slate-600">Bill After Solar (₹/qtr)</Label>
                <Input
                  type="number"
                  value={form.post_solar_quarterly_bill || 29000}
                  onChange={(e) => { setForm({ ...form, post_solar_quarterly_bill: parseInt(e.target.value) || 0 }); setIsSavedDraft(false); }}
                  className="h-8 text-xs mt-1"
                />
              </div>
            </div>

            {/* Calculated Financial Metric Highlights */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 text-center">
              <div className="p-2.5 bg-blue-50/70 rounded-xl border border-blue-100">
                <span className="text-[9.5px] font-bold text-blue-700 uppercase block">YEAR 1 ESTIMATED SAVINGS</span>
                <span className="text-base font-extrabold text-slate-900">{formatINR(metrics.annualSavings)}</span>
              </div>
              <div className="p-2.5 bg-emerald-50/70 rounded-xl border border-emerald-100">
                <span className="text-[9.5px] font-bold text-emerald-700 uppercase block">25-YEAR LIFETIME SAVINGS</span>
                <span className="text-base font-extrabold text-slate-900">{formatINR(metrics.lifetimeSavings)}</span>
              </div>
              <div className="p-2.5 bg-amber-50/70 rounded-xl border border-amber-100">
                <span className="text-[9.5px] font-bold text-amber-700 uppercase block">RETURN ON INVESTMENT</span>
                <span className="text-base font-extrabold text-slate-900">
                  {(metrics.netCustomerCost > 0 ? ((metrics.annualSavings / metrics.netCustomerCost) * 100).toFixed(1) : 19.8)}% p.a.
                </span>
              </div>
              <div className="p-2.5 bg-purple-50/70 rounded-xl border border-purple-100">
                <span className="text-[9.5px] font-bold text-purple-700 uppercase block">CAPITAL PAYBACK PERIOD</span>
                <span className="text-base font-extrabold text-slate-900">{metrics.paybackYears} Years</span>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* STEP 5 — COMPONENTS & WARRANTY                                        */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      <Card className="rounded-2xl border-slate-200/90 shadow-2xs overflow-hidden">
        <div
          onClick={() => toggleSection("step5")}
          className="p-3.5 sm:p-4 bg-slate-50/70 hover:bg-slate-100/70 flex items-center justify-between cursor-pointer transition select-none"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-xs">
              5
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">STEP 5 — COMPONENTS & WARRANTY</h3>
              <p className="text-[10.5px] text-slate-500">Bill of materials, balance of system and comprehensive 6-point equipment warranties</p>
            </div>
          </div>
          {expandedSections.step5 ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>

        {expandedSections.step5 && (
          <CardContent className="p-4 pt-3 border-t border-slate-100 space-y-4">
            {/* 6 Dedicated Warranty Inputs */}
            <div>
              <span className="font-bold text-slate-800 text-[11.5px] block mb-2">
                Comprehensive 6-Point Warranty Protection
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-xs">
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <Label className="text-[10.5px] font-bold text-slate-700">Solar Panels — Product Warranty</Label>
                  <Input
                    value={form.warranty_panel_product || "10 Years Product & Material Warranty"}
                    onChange={(e) => { setForm({ ...form, warranty_panel_product: e.target.value }); setIsSavedDraft(false); }}
                    className="h-7 text-xs mt-1 bg-white"
                  />
                </div>

                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <Label className="text-[10.5px] font-bold text-slate-700">Solar Panels — Performance Warranty</Label>
                  <Input
                    value={form.warranty_panel_performance || "25 Years 80% Performance Warranty"}
                    onChange={(e) => { setForm({ ...form, warranty_panel_performance: e.target.value }); setIsSavedDraft(false); }}
                    className="h-7 text-xs mt-1 bg-white"
                  />
                </div>

                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <Label className="text-[10.5px] font-bold text-slate-700">Solar Inverter Warranty</Label>
                  <Input
                    value={form.warranty_inverter || "10 Years Replacement Warranty"}
                    onChange={(e) => { setForm({ ...form, warranty_inverter: e.target.value }); setIsSavedDraft(false); }}
                    className="h-7 text-xs mt-1 bg-white"
                  />
                </div>

                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <Label className="text-[10.5px] font-bold text-slate-700">Battery Storage Warranty</Label>
                  <Input
                    value={form.warranty_battery || "10 Years Limited Warranty"}
                    onChange={(e) => { setForm({ ...form, warranty_battery: e.target.value }); setIsSavedDraft(false); }}
                    className="h-7 text-xs mt-1 bg-white"
                  />
                </div>

                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <Label className="text-[10.5px] font-bold text-slate-700">Mounting / Racking Warranty</Label>
                  <Input
                    value={form.warranty_mounting || "10 Years Structural & Racking Warranty"}
                    onChange={(e) => { setForm({ ...form, warranty_mounting: e.target.value }); setIsSavedDraft(false); }}
                    className="h-7 text-xs mt-1 bg-white"
                  />
                </div>

                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <Label className="text-[10.5px] font-bold text-slate-700">Workmanship & Installation Warranty</Label>
                  <Input
                    value={form.warranty_workmanship || "5 Years Complete Workmanship Warranty"}
                    onChange={(e) => { setForm({ ...form, warranty_workmanship: e.target.value }); setIsSavedDraft(false); }}
                    className="h-7 text-xs mt-1 bg-white"
                  />
                </div>
              </div>
            </div>

            {/* BOS Components */}
            <div>
              <span className="font-bold text-slate-800 text-[11.5px] block mb-2">
                Balance of System (BOS) Hardware Inclusions
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {(form.bos || []).map((item, idx) => (
                  <div key={idx} className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="font-bold text-slate-800 text-[11px] block">{item.name}</span>
                    <span className="text-[10px] text-slate-500">{item.spec} ({item.qty})</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* STEP 6 — QUOTATION                                                    */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      <Card className="rounded-2xl border-slate-200/90 shadow-2xs overflow-hidden">
        <div
          onClick={() => toggleSection("step6")}
          className="p-3.5 sm:p-4 bg-slate-50/70 hover:bg-slate-100/70 flex items-center justify-between cursor-pointer transition select-none"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
              6
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <span>STEP 6 — QUOTATION</span>
                <span className="text-[11px] font-normal text-slate-500">· Net: {formatINR(metrics.netCustomerCost)}</span>
              </h3>
              <p className="text-[10.5px] text-slate-500">Commercial offer, GST, central subsidy, custom discounts and payment milestones</p>
            </div>
          </div>
          {expandedSections.step6 ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>

        {expandedSections.step6 && (
          <CardContent className="p-4 pt-3 border-t border-slate-100 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <Label className="text-[11px] font-semibold text-slate-600">Base System Price (₹)</Label>
                <Input
                  type="number"
                  step="1000"
                  value={form.system_price}
                  onChange={(e) => { setForm({ ...form, system_price: parseFloat(e.target.value) || 0 }); setIsSavedDraft(false); }}
                  className="h-8 text-xs font-bold mt-1"
                />
              </div>

              <div>
                <Label className="text-[11px] font-semibold text-slate-600">Additional Civil / Structural (₹)</Label>
                <Input
                  type="number"
                  step="500"
                  value={form.additional_charges || 0}
                  onChange={(e) => { setForm({ ...form, additional_charges: parseFloat(e.target.value) || 0 }); setIsSavedDraft(false); }}
                  className="h-8 text-xs mt-1"
                />
              </div>

              <div>
                <Label className="text-[11px] font-semibold text-slate-600">DISCOM / Net-Metering (₹)</Label>
                <Input
                  type="number"
                  step="500"
                  value={form.net_meter_charges || 0}
                  onChange={(e) => { setForm({ ...form, net_meter_charges: parseFloat(e.target.value) || 0 }); setIsSavedDraft(false); }}
                  className="h-8 text-xs mt-1"
                />
              </div>

              <div>
                <Label className="text-[11px] font-semibold text-slate-600">Special Custom Discount (₹)</Label>
                <Input
                  type="number"
                  step="500"
                  value={form.custom_discount || 0}
                  onChange={(e) => { setForm({ ...form, custom_discount: parseFloat(e.target.value) || 0 }); setIsSavedDraft(false); }}
                  className="h-8 text-xs mt-1"
                  placeholder="0"
                />
              </div>

              <div>
                <Label className="text-[11px] font-semibold text-slate-600">GST Percentage (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.gst_pct}
                  onChange={(e) => { setForm({ ...form, gst_pct: parseFloat(e.target.value) || 0 }); setIsSavedDraft(false); }}
                  className="h-8 text-xs mt-1"
                />
              </div>

              <div className="sm:col-span-2 p-2.5 bg-emerald-50/60 rounded-xl border border-emerald-200 flex items-center justify-between">
                <div>
                  <span className="font-bold text-emerald-900 text-xs block">Govt. Central Subsidy (PM Surya Ghar / STC)</span>
                  <span className="text-[10px] text-emerald-700">Central financial incentive directly credited to customer</span>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.subsidy_applicable}
                    onCheckedChange={(val) => {
                      const amt = val ? calculateSubsidy(form.system_kw, form.project_type) : 0;
                      setForm({ ...form, subsidy_applicable: val, subsidy_amount: amt });
                      setIsSavedDraft(false);
                    }}
                  />
                  {form.subsidy_applicable && (
                    <span className="text-xs font-bold text-emerald-900">₹{formatNumberIN(form.subsidy_amount)}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Quotation Summary Table */}
            <div className="bg-slate-900 text-white p-4 rounded-xl space-y-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">QUOTATION BREAKDOWN</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1 border-t border-slate-800">
                <div>
                  <span className="text-slate-400 text-[10px] block">Gross Project Cost</span>
                  <span className="text-sm font-bold text-white">{formatINR(metrics.grossCost)}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Applicable GST ({form.gst_pct}%)</span>
                  <span className="text-sm font-bold text-amber-300">+{formatINR(metrics.gstAmount)}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Govt Subsidy Benefit</span>
                  <span className="text-sm font-bold text-emerald-400">-{formatINR(form.subsidy_applicable ? form.subsidy_amount : 0)}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Net Upfront Balance</span>
                  <span className="text-base font-extrabold text-white">{formatINR(metrics.netCustomerCost - (form.custom_discount || 0))}</span>
                </div>
              </div>
            </div>

            {/* Payment Milestones */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="font-bold text-slate-800 text-[11.5px]">Milestone Payment Schedule</span>
                <span className={`text-[10.5px] font-bold ${milestoneTotalPct === 100 ? "text-emerald-700" : "text-amber-600"}`}>
                  Total: {milestoneTotalPct}% {milestoneTotalPct === 100 ? "✓" : "(!)"}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {(form.milestones || []).map((m, idx) => (
                  <div key={idx} className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1">
                      <span>{m.stage}</span>
                      <span>{m.pct}%</span>
                    </div>
                    <div className="font-semibold text-slate-900 text-[11px] leading-tight">{m.label}</div>
                    <div className="text-[10px] text-blue-700 font-bold mt-1">
                      {formatINR((metrics.netCustomerCost * m.pct) / 100)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* STEP 7 — REVIEW & GENERATE                                            */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      <Card className="rounded-2xl border-slate-200/90 shadow-2xs overflow-hidden">
        <div
          onClick={() => toggleSection("step7")}
          className="p-3.5 sm:p-4 bg-slate-50/70 hover:bg-slate-100/70 flex items-center justify-between cursor-pointer transition select-none"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-800 flex items-center justify-center font-bold text-xs">
              7
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">STEP 7 — REVIEW & GENERATE</h3>
              <p className="text-[10.5px] text-slate-500">Choose proposal presentation template, preview complete 8-page document, and download PDF</p>
            </div>
          </div>
          {expandedSections.step7 ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>

        {expandedSections.step7 && (
          <CardContent className="p-4 pt-3 border-t border-slate-100 space-y-4">
            {/* Dual Template Selection Cards */}
            <div>
              <span className="font-bold text-slate-800 text-[11.5px] block mb-2">
                Select Proposal Design Template / Theme
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Template 01: Solarix Premium */}
                <div
                  onClick={() => {
                    setForm((prev) => ({ ...prev, template_id: "template1" }));
                    setIsSavedDraft(false);
                  }}
                  className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3.5 ${
                    (form.template_id || "template1") === "template1"
                      ? "border-blue-600 bg-blue-50/50 shadow-xs"
                      : "border-slate-200 hover:border-slate-300 bg-white"
                  }`}
                >
                  <div className="w-12 h-16 rounded-lg bg-gradient-to-b from-slate-950 via-slate-900 to-indigo-950 text-white flex flex-col justify-between p-1.5 shadow-xs shrink-0 border border-slate-800">
                    <div className="w-full h-1 bg-amber-400 rounded-full" />
                    <div className="text-[7.5px] font-bold text-center text-amber-400">PREMIUM</div>
                    <div className="w-4 h-4 bg-blue-600 text-white text-[8px] font-bold rounded-xs flex items-center justify-center self-end">P1</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">Template 01 · Solarix Premium</span>
                      {(form.template_id || "template1") === "template1" && (
                        <Badge className="bg-blue-600 text-white text-[9px] px-1.5 py-0">✓ Selected</Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                      Modern solar visual language: deep navy & slate palette with subtle solar amber accents, framed metric cards, and clean typography.
                    </p>
                  </div>
                </div>

                {/* Template 02: Solarix Corporate */}
                <div
                  onClick={() => {
                    setForm((prev) => ({ ...prev, template_id: "template2" }));
                    setIsSavedDraft(false);
                  }}
                  className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3.5 ${
                    form.template_id === "template2"
                      ? "border-sky-600 bg-sky-50/50 shadow-xs"
                      : "border-slate-200 hover:border-slate-300 bg-white"
                  }`}
                >
                  <div className="w-12 h-16 rounded-lg bg-sky-500 text-white flex flex-col justify-between p-1.5 shadow-xs shrink-0">
                    <div className="w-full h-1 bg-white/50 rounded-full" />
                    <div className="text-[7.5px] font-bold text-center">CORP</div>
                    <div className="w-4 h-4 bg-white text-sky-700 text-[8px] font-bold rounded-xs flex items-center justify-center self-end">P2</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">Template 02 · Solarix Corporate</span>
                      {form.template_id === "template2" && (
                        <Badge className="bg-sky-600 text-white text-[9px] px-1.5 py-0">✓ Selected</Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                      Modeled directly after the SolarProof reference PDF: clean white canvas, cyan/blue accents, Page 1 Investment Summary block, and solid blue numbered page tabs.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Proposal Executive Summary Card */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <span className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider block">PROPOSAL SUMMARY SNAPSHOT</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 text-[10px] block">Customer</span>
                  <span className="font-bold text-slate-900">{form.customer_name || "Valued Customer"}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">System Capacity</span>
                  <span className="font-bold text-slate-900">{form.system_kw} kWp DC</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Net Upfront Balance</span>
                  <span className="font-bold text-slate-900">{formatINR(metrics.netCustomerCost - (form.custom_discount || 0))}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Est. Payback</span>
                  <span className="font-bold text-emerald-700">{metrics.paybackYears} Years</span>
                </div>
              </div>
            </div>

            {/* Actions Toolbar */}
            <div className="flex flex-wrap items-center justify-between pt-2 border-t border-slate-100 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveStep(Math.max(1, activeStep - 1))}
                className="text-xs h-8"
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Previous Step
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowFullViewerModal(true)}
                  className="h-8 text-xs font-semibold rounded-xl border-slate-300 text-slate-700 hover:bg-slate-50 gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5 text-blue-600" />
                  <span>Preview Proposal</span>
                </Button>

                <Button
                  size="sm"
                  onClick={handleGenerateProposal}
                  disabled={generating}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-8 px-5 rounded-xl shadow-xs gap-1.5"
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
    </div>
  );
}
