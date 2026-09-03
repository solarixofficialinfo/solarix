import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api, { formatApiError, downloadFile } from "@/lib/api";
import { useCompany, useClientList } from "@/hooks/useClients";
import { useAuth } from "@/context/AuthContext";
import { useSalesDocuments } from "@/hooks/useSalesDocuments";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import dayjs from "dayjs";
import {
  FileText, Sparkles, Sun, Zap, CheckCircle2, ArrowRight, ArrowLeft,
  Download, Printer, Share2, Eye, RefreshCw, Layers, UserPlus, Users2,
  Edit3, ShieldCheck, TreePine, Leaf, DollarSign, Calendar, Clock,
  MapPin, Phone, Mail, Building2, Check, AlertCircle, Save, Trash2,
  Plus, CheckSquare, X, Copy, ExternalLink, SlidersHorizontal, Maximize2
} from "lucide-react";

import {
  calculateSolarMetrics,
  calculateSubsidy,
  calculatePaymentMilestones,
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
import LiveProposalPreviewCard from "./components/LiveProposalPreviewCard";

const DRAFT_STORAGE_KEY = "solarix_proposal_generator_draft_v2";

export default function ProposalGenerator() {
  const location = useLocation();
  const nav = useNavigate();
  const { user } = useAuth();

  // Queries
  const { data: companyData } = useCompany();
  const { data: clients = [] } = useClientList();
  const { data: history = [], refetch: refetchHistory } = useSalesDocuments("proposal");

  // Step Management: 1: Customer, 2: System, 3: Equipment, 4: Scope, 5: Financial, 6: Review
  const [currentStep, setCurrentStep] = useState(1);
  const [sourceType, setSourceType] = useState("manual"); // 'lead' | 'client' | 'design' | 'manual'
  const [isSavedDraft, setIsSavedDraft] = useState(true);
  const [showMobilePreview, setShowMobilePreview] = useState(false);

  // Async selector data
  const [leadsList, setLeadsList] = useState([]);
  const [designsList, setDesignsList] = useState([]);
  const [loadingSources, setLoadingSources] = useState(false);

  // Selected entities
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedDesignId, setSelectedDesignId] = useState("");

  // Edit modals state
  const [editingEquipmentType, setEditingEquipmentType] = useState(null); // 'panel' | 'inverter' | 'structure' | 'cables' | 'custom'
  const [customItemForm, setCustomItemForm] = useState({ name: "", spec: "", qty: "1 Nos" });
  const [showAddScopeModal, setShowAddScopeModal] = useState(false);
  const [scopeTargetType, setScopeTargetType] = useState("our"); // 'our' | 'customer'
  const [newScopeText, setNewScopeText] = useState("");
  const [showAddMilestoneModal, setShowAddMilestoneModal] = useState(false);
  const [newMilestoneForm, setNewMilestoneForm] = useState({ stage: "Milestone", label: "", pct: 10 });

  // Primary Proposal Form State
  const [form, setForm] = useState(() => {
    const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }

    const todayStr = dayjs().format("YYYY-MM-DD");
    const refNum = `PROP-${dayjs().format("YYMMDD")}-${Math.floor(1000 + Math.random() * 9000)}`;

    return {
      // Step 1: Customer & Project
      proposal_number: refNum,
      proposal_date: todayStr,
      customer_name: "",
      mobile: "",
      email: "",
      site_address: "",
      city: "",
      state: "Maharashtra",
      pincode: "",
      system_kw: 10.0,
      project_type: "Residential",
      solar_system_type: "Grid Connected / On Grid",
      prepared_by: user?.name || "Solar Solutions Engineer",
      linked_design_name: "",
      linked_design_id: "",

      // Step 2: System Design Specs
      roof_area_sqm: 41.4,
      tilt_deg: 15,
      azimuth_deg: 180,
      mounting_clearance_m: 1.8,
      snapshot_2d: "",
      snapshot_3d: "",

      // Step 3: Equipment & Warranty
      panel: { ...DEFAULT_PANEL_DATA, quantity: 18 },
      inverter: { ...DEFAULT_INVERTER_DATA, capacity: "10.0 kW", quantity: 1 },
      structure: { ...DEFAULT_STRUCTURE_DATA },
      cables: { ...DEFAULT_CABLES_DATA },
      bos: [...DEFAULT_BOS_COMPONENTS],
      warranties: [...DEFAULT_WARRANTIES],

      // Step 4: Scope & Delivery
      timeline: [...DEFAULT_TIMELINE_STAGES],
      our_scope: [...DEFAULT_OUR_SCOPE],
      customer_scope: [...DEFAULT_CUSTOMER_SCOPE],
      terms: [...DEFAULT_TERMS],

      // Step 5: Financials
      system_price: 500000,
      additional_charges: 0,
      net_meter_charges: 0,
      gst_pct: 13.8,
      subsidy_applicable: false,
      subsidy_amount: 0,
      tariff_rate: 8.5,
      milestones: [
        { stage: "Milestone 1", label: "20% Advance with Order Confirmation", pct: 20 },
        { stage: "Milestone 2", label: "70% Upon Material Readiness & Site Dispatch", pct: 70 },
        { stage: "Milestone 3", label: "5% Upon Complete Installation & Wiring", pct: 5 },
        { stage: "Milestone 4", label: "5% Upon Net-Meter Installation & Commissioning", pct: 5 },
      ],
    };
  });

  // Generated document state & full preview viewer
  const [generating, setGenerating] = useState(false);
  const [generatedDoc, setGeneratedDoc] = useState(null);
  const [showFullViewerModal, setShowFullViewerModal] = useState(false);

  // Autosave draft to localStorage
  useEffect(() => {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(form));
    setIsSavedDraft(true);
  }, [form]);

  // Load Leads and Designs on mount
  useEffect(() => {
    let mounted = true;
    async function loadSources() {
      setLoadingSources(true);
      try {
        const [leadsRes, designsRes] = await Promise.all([
          api.get("/leads", { params: { page: 1, page_size: 50 } }).catch(() => ({ data: { items: [] } })),
          api.get("/solar-designer/designs").catch(() => ({ data: { designs: [] } })),
        ]);
        if (mounted) {
          setLeadsList(leadsRes.data?.items || []);
          setDesignsList(designsRes.data?.designs || []);
        }
      } catch (e) {
      } finally {
        if (mounted) setLoadingSources(false);
      }
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

    const sysKw = Number(cl.system_kw || 10.0);
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
        quantity: Math.max(1, Math.round((sysKw * 1000) / (prev.panel.wattage || 555))),
      },
      inverter: {
        ...prev.inverter,
        capacity: `${sysKw.toFixed(1)} kW`,
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

  // Sync net_customer_cost into form state for consistent preview
  useEffect(() => {
    if (metrics.netCustomerCost) {
      setForm((prev) => ({
        ...prev,
        net_customer_cost: metrics.netCustomerCost,
        gross_cost: metrics.grossCost,
        gst_amount: metrics.gstAmount,
      }));
    }
  }, [metrics.netCustomerCost, metrics.grossCost, metrics.gstAmount]);

  // Payment milestone percentage sum validation
  const milestoneTotalPct = useMemo(() => {
    return (form.milestones || []).reduce((sum, m) => sum + (Number(m.pct) || 0), 0);
  }, [form.milestones]);

  // Proposal Readiness Validation
  const readiness = useMemo(() => {
    const checks = [
      { id: "customer", label: "Customer details", step: 1, ok: Boolean(form.customer_name?.trim() && form.mobile?.trim()) },
      { id: "site", label: "Site address & city", step: 1, ok: Boolean(form.site_address?.trim()) },
      { id: "system", label: "Solar system capacity", step: 2, ok: Number(form.system_kw) > 0 },
      { id: "equipment", label: "Equipment specifications", step: 3, ok: Boolean(form.panel?.make && form.inverter?.make) },
      { id: "warranty", label: "Warranty terms", step: 3, ok: Array.isArray(form.warranties) && form.warranties.length > 0 },
      { id: "financials", label: "Financial pricing", step: 5, ok: Number(form.system_price) > 0 },
      { id: "milestones", label: "Payment milestones (100%)", step: 5, ok: Math.abs(milestoneTotalPct - 100) < 0.1 },
      { id: "scope", label: "Project scope checklist", step: 4, ok: Array.isArray(form.our_scope) && form.our_scope.length > 0 },
    ];
    const isReady = checks.every((c) => c.ok);
    const missingCount = checks.filter((c) => !c.ok).length;
    return { checks, isReady, missingCount };
  }, [form, milestoneTotalPct]);

  // Save Draft Action
  const handleSaveDraft = () => {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(form));
    setIsSavedDraft(true);
    toast.success("Proposal draft saved locally ✓");
  };

  // Reset Draft Action
  const handleResetDraft = () => {
    if (window.confirm("Are you sure you want to clear and reset this proposal draft?")) {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      window.location.reload();
    }
  };

  // Generate Proposal PDF
  const handleGenerateProposal = async () => {
    if (!readiness.isReady) {
      toast.warning(`Please complete all required fields (${readiness.missingCount} item(s) pending).`);
      setCurrentStep(readiness.checks.find((c) => !c.ok)?.step || 1);
      return;
    }

    setGenerating(true);
    try {
      const payload = {
        doc_type: "proposal",
        client_id: selectedClientId || undefined,
        doc_data: {
          ...form,
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
      setGeneratedDoc(res.data);
      refetchHistory();
      toast.success("11-Page Customer Proposal generated successfully!");

      if (res.data?.id) {
        downloadFile(`/documents/${res.data.id}/download`, res.data.filename || "Solar_Proposal.pdf");
      }
    } catch (err) {
      toast.error("Proposal generation failed: " + formatApiError(err));
    } finally {
      setGenerating(false);
    }
  };

  // Steps Definition
  const steps = [
    { num: 1, title: "Customer & Project", sub: "01 Customer" },
    { num: 2, title: "Solar System Design", sub: "02 System" },
    { num: 3, title: "Equipment & Warranty", sub: "03 Equipment" },
    { num: 4, title: "Scope & Project Delivery", sub: "04 Scope" },
    { num: 5, title: "Commercial & Financial", sub: "05 Financial" },
    { num: 6, title: "Review Proposal", sub: "06 Review" },
  ];

  return (
    <div className="space-y-4 select-none pb-16 max-w-7xl mx-auto px-2 sm:px-4">

      {/* ── 1. TOP HEADER BAR ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 text-white px-4 py-3 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => nav(-1)}
            className="h-8 w-8 p-0 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>

          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md">
              <Sun className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-white tracking-tight" style={{ fontFamily: "Outfit" }}>
                  SOLARIX PROPOSAL GENERATOR
                </span>
                <Badge
                  variant="outline"
                  className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${
                    isSavedDraft ? "bg-emerald-950/70 text-emerald-400 border-emerald-800" : "bg-amber-950/70 text-amber-400 border-amber-800"
                  }`}
                >
                  {isSavedDraft ? "Draft Saved" : "Unsaved Changes"}
                </Badge>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-2">
                <span>Ref: <b className="font-mono text-slate-200">{form.proposal_number}</b></span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(form.proposal_number);
                    toast.success("Copied proposal number");
                  }}
                  className="hover:text-white transition"
                  title="Copy reference number"
                >
                  <Copy className="w-3 h-3 inline" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Mobile Preview Toggle */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowMobilePreview(!showMobilePreview)}
            className="lg:hidden h-8 text-xs font-semibold rounded-xl bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 gap-1.5"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{showMobilePreview ? "Show Form" : "Preview"}</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowFullViewerModal(true)}
            className="h-8 text-xs font-semibold rounded-xl bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 gap-1.5 hidden sm:flex"
            title="Open 11-Page Customer Proposal Viewer"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Preview</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleSaveDraft}
            className="h-8 text-xs font-semibold rounded-xl bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Draft</span>
          </Button>

          <Button
            size="sm"
            onClick={handleGenerateProposal}
            disabled={generating}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-8 px-3.5 rounded-xl shadow-xs gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{generating ? "Generating…" : "Generate Proposal"}</span>
          </Button>
        </div>
      </div>

      {/* ── 2. STEP PROGRESS STEPPER (6 Steps) ─────────────────────────────── */}
      <div className="bg-white p-2.5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {steps.map((s) => {
            const isActive = currentStep === s.num;
            const isDone = currentStep > s.num;
            return (
              <button
                key={s.num}
                onClick={() => setCurrentStep(s.num)}
                className={`flex items-center gap-2 p-2 rounded-xl text-left transition-all ${
                  isActive
                    ? "bg-blue-50/90 border border-blue-500/80 shadow-xs"
                    : isDone
                    ? "bg-slate-50/80 hover:bg-slate-100/80 text-slate-700"
                    : "text-slate-400 hover:bg-slate-50/60"
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 ${
                    isActive
                      ? "bg-blue-600 text-white shadow-xs"
                      : isDone
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {isDone ? <Check className="w-3.5 h-3.5" /> : s.num}
                </div>
                <div className="min-w-0">
                  <span className={`text-[11px] font-bold block truncate ${isActive ? "text-blue-900" : isDone ? "text-slate-900" : "text-slate-500"}`}>
                    {s.sub}
                  </span>
                  <span className="text-[9px] text-slate-400 hidden xl:block truncate">
                    {s.title}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 3. TWO-COLUMN WORKSPACE: LEFT FORM, RIGHT LIVE PREVIEW ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">

        {/* LEFT COLUMN: ACTIVE STEP INPUT WIZARD (7 cols) */}
        <div className={`lg:col-span-7 space-y-4 ${showMobilePreview ? "hidden lg:block" : "block"}`}>

          {/* ───────────────────────────────────────────────────────────────── */}
          {/* STEP 1: CUSTOMER & PROJECT                                       */}
          {/* ───────────────────────────────────────────────────────────────── */}
          {currentStep === 1 && (
            <div className="space-y-4 animate-in fade-in">
              {/* Step Header */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">
                    STEP 01
                  </span>
                  <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                    Customer & Project Information
                  </h2>
                </div>

                {/* Source Select Dropdown */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 hidden sm:inline">Use existing:</span>
                  <Select
                    value={sourceType}
                    onValueChange={(val) => {
                      setSourceType(val);
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs rounded-xl bg-slate-50 border-slate-200 w-[140px]">
                      <SelectValue placeholder="Autofill from…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual Entry</SelectItem>
                      <SelectItem value="lead">From Lead CRM</SelectItem>
                      <SelectItem value="client">From Client Master</SelectItem>
                      <SelectItem value="design">From 3D Design</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Source Picker Banners */}
              {sourceType === "lead" && (
                <div className="p-3 bg-blue-50/80 rounded-xl border border-blue-200 text-xs space-y-2">
                  <div className="font-bold text-blue-900 flex items-center gap-1.5">
                    <UserPlus className="w-3.5 h-3.5" /> Select Lead to Populate
                  </div>
                  <Select value={selectedLeadId} onValueChange={handleSelectLead}>
                    <SelectTrigger className="bg-white border-blue-300 text-xs h-9 rounded-lg">
                      <SelectValue placeholder="Choose a lead from CRM…" />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      {leadsList.map((lead) => (
                        <SelectItem key={lead.id} value={lead.id} className="text-xs">
                          {lead.name} · {lead.mobile || "No Mobile"} ({lead.system_kw || 5} kW)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {sourceType === "client" && (
                <div className="p-3 bg-blue-50/80 rounded-xl border border-blue-200 text-xs space-y-2">
                  <div className="font-bold text-blue-900 flex items-center gap-1.5">
                    <Users2 className="w-3.5 h-3.5" /> Select Client Record
                  </div>
                  <Select value={selectedClientId} onValueChange={handleSelectClient}>
                    <SelectTrigger className="bg-white border-blue-300 text-xs h-9 rounded-lg">
                      <SelectValue placeholder="Choose an onboarded client…" />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id} className="text-xs">
                          {c.full_name} · {c.mobile || "No Mobile"} · {c.city || "Site"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {sourceType === "design" && (
                <div className="p-3 bg-blue-50/80 rounded-xl border border-blue-200 text-xs space-y-2">
                  <div className="font-bold text-blue-900 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" /> Select 3D Solar Project
                  </div>
                  <Select value={selectedDesignId} onValueChange={handleSelectDesign}>
                    <SelectTrigger className="bg-white border-blue-300 text-xs h-9 rounded-lg">
                      <SelectValue placeholder="Choose a 3D Solar Designer project…" />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      {designsList.map((d) => (
                        <SelectItem key={d.id} value={d.id} className="text-xs">
                          {d.site_name || d.name} · {d.system_kw || 0} kWp ({d.panel_count || 0} Modules)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* TWO-COLUMN CARDS */}
              <div className="grid sm:grid-cols-2 gap-4">
                {/* CARD 1: Customer Information */}
                <Card className="rounded-2xl border-slate-200 shadow-2xs">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2 text-slate-800 font-bold text-xs pb-2 border-b border-slate-100">
                      <Building2 className="w-3.5 h-3.5 text-blue-600" />
                      <span>Customer Information</span>
                    </div>

                    <div>
                      <Label className="text-[11px] font-semibold text-slate-600">Client / Customer Name *</Label>
                      <Input
                        value={form.customer_name}
                        onChange={(e) => { setForm({ ...form, customer_name: e.target.value }); setIsSavedDraft(false); }}
                        placeholder="e.g. Shubham Jadhav"
                        className="h-8 text-xs mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-[11px] font-semibold text-slate-600">Phone Number *</Label>
                      <Input
                        value={form.mobile}
                        onChange={(e) => { setForm({ ...form, mobile: e.target.value }); setIsSavedDraft(false); }}
                        placeholder="e.g. +91 98765 43210"
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

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[11px] font-semibold text-slate-600">City</Label>
                        <Input
                          value={form.city}
                          onChange={(e) => { setForm({ ...form, city: e.target.value }); setIsSavedDraft(false); }}
                          placeholder="e.g. Ichalkaranji"
                          className="h-8 text-xs mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] font-semibold text-slate-600">Pincode</Label>
                        <Input
                          value={form.pincode}
                          onChange={(e) => { setForm({ ...form, pincode: e.target.value }); setIsSavedDraft(false); }}
                          placeholder="416115"
                          className="h-8 text-xs mt-1"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* CARD 2: Project Information */}
                <Card className="rounded-2xl border-slate-200 shadow-2xs">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2 text-slate-800 font-bold text-xs pb-2 border-b border-slate-100">
                      <MapPin className="w-3.5 h-3.5 text-blue-600" />
                      <span>Project Information</span>
                    </div>

                    <div>
                      <Label className="text-[11px] font-semibold text-slate-600">Project Type</Label>
                      <Select
                        value={form.project_type}
                        onValueChange={(val) => { setForm({ ...form, project_type: val }); setIsSavedDraft(false); }}
                      >
                        <SelectTrigger className="h-8 text-xs mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Residential">Residential Rooftop</SelectItem>
                          <SelectItem value="Commercial">Commercial & Institutional</SelectItem>
                          <SelectItem value="Industrial">Industrial High-Tension</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-[11px] font-semibold text-slate-600">Site Address *</Label>
                      <Input
                        value={form.site_address}
                        onChange={(e) => { setForm({ ...form, site_address: e.target.value }); setIsSavedDraft(false); }}
                        placeholder="e.g. Ganesh Nagar, Near Water Tank"
                        className="h-8 text-xs mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-[11px] font-semibold text-slate-600">Grid Connection</Label>
                      <Select
                        value={form.solar_system_type}
                        onValueChange={(val) => { setForm({ ...form, solar_system_type: val }); setIsSavedDraft(false); }}
                      >
                        <SelectTrigger className="h-8 text-xs mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Grid Connected / On Grid">Grid Connected / On Grid</SelectItem>
                          <SelectItem value="Off Grid Battery Storage">Off Grid with Battery Bank</SelectItem>
                          <SelectItem value="Hybrid Solar System">Hybrid Bi-Directional</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
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
                        <Label className="text-[11px] font-semibold text-slate-600">Prepared By</Label>
                        <Input
                          value={form.prepared_by}
                          onChange={(e) => { setForm({ ...form, prepared_by: e.target.value }); setIsSavedDraft(false); }}
                          placeholder="Solar Engineer"
                          className="h-8 text-xs mt-1"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Navigation Footer */}
              <div className="flex justify-end pt-2">
                <Button
                  onClick={() => setCurrentStep(2)}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold h-9 px-5 rounded-xl shadow-xs gap-1.5"
                >
                  <span>Next: Solar System Design</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────────── */}
          {/* STEP 2: SOLAR SYSTEM DESIGN                                      */}
          {/* ───────────────────────────────────────────────────────────────── */}
          {currentStep === 2 && (
            <div className="space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">
                    STEP 02
                  </span>
                  <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                    Solar System Design & 3D Engineering
                  </h2>
                </div>

                {form.linked_design_id && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => nav(`/solar-designer/${form.linked_design_id}`)}
                    className="h-8 text-xs text-blue-700 border-blue-300 rounded-xl gap-1"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Edit in Solar Designer
                  </Button>
                )}
              </div>

              {/* System Capacity Quick Slider */}
              <Card className="rounded-2xl border-slate-200 shadow-2xs">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase block">Total System Size</span>
                      <div className="text-2xl font-black text-slate-900" style={{ fontFamily: "Outfit" }}>
                        {form.system_kw} kWp
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-slate-600 font-semibold">Quick Set:</Label>
                      {[3, 5, 10, 15, 25].map((kw) => (
                        <button
                          key={kw}
                          onClick={() => {
                            const pCount = Math.max(1, Math.round((kw * 1000) / (form.panel?.wattage || 555)));
                            setForm((prev) => ({
                              ...prev,
                              system_kw: kw,
                              system_price: kw * 50000,
                              panel: { ...prev.panel, quantity: pCount },
                              inverter: { ...prev.inverter, capacity: `${kw}.0 kW` },
                            }));
                            setIsSavedDraft(false);
                          }}
                          className={`px-2 py-1 rounded-lg text-xs font-bold transition ${
                            form.system_kw === kw
                              ? "bg-blue-600 text-white shadow-xs"
                              : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                          }`}
                        >
                          {kw}kW
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100">
                    <div>
                      <Label className="text-[10px] text-slate-500 font-bold uppercase">Capacity (kWp)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={form.system_kw}
                        onChange={(e) => {
                          const kw = parseFloat(e.target.value) || 1;
                          setForm({ ...form, system_kw: kw });
                          setIsSavedDraft(false);
                        }}
                        className="h-8 text-xs font-bold mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-slate-500 font-bold uppercase">Module Count</Label>
                      <Input
                        type="number"
                        value={form.panel?.quantity || 18}
                        onChange={(e) => {
                          const q = parseInt(e.target.value) || 1;
                          setForm({ ...form, panel: { ...form.panel, quantity: q } });
                          setIsSavedDraft(false);
                        }}
                        className="h-8 text-xs font-bold mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-slate-500 font-bold uppercase">Tilt Angle (°)</Label>
                      <Input
                        type="number"
                        value={form.tilt_deg || 15}
                        onChange={(e) => {
                          setForm({ ...form, tilt_deg: parseFloat(e.target.value) || 15 });
                          setIsSavedDraft(false);
                        }}
                        className="h-8 text-xs font-bold mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-slate-500 font-bold uppercase">Roof Area (m²)</Label>
                      <Input
                        type="number"
                        value={form.roof_area_sqm || 41.4}
                        onChange={(e) => {
                          setForm({ ...form, roof_area_sqm: parseFloat(e.target.value) || 40 });
                          setIsSavedDraft(false);
                        }}
                        className="h-8 text-xs font-bold mt-1"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Design Snapshot / Visual Preview Card */}
              <Card className="rounded-2xl border-slate-200 shadow-2xs">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-slate-800 font-bold text-xs">
                      <Layers className="w-3.5 h-3.5 text-blue-600" />
                      <span>Rooftop Layout & 3D Engineering Model</span>
                    </div>
                    {form.linked_design_name && (
                      <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">
                        Linked: {form.linked_design_name}
                      </Badge>
                    )}
                  </div>

                  {form.snapshot_2d || form.snapshot_3d ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-950 aspect-video relative group">
                        <img src={form.snapshot_2d} alt="2D Roof Plan" className="w-full h-full object-cover" />
                        <span className="absolute bottom-2 left-2 bg-black/70 text-white text-[9px] px-2 py-0.5 rounded font-mono">
                          2D Satellite Plan
                        </span>
                      </div>
                      <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-950 aspect-video relative group">
                        <img src={form.snapshot_3d} alt="3D Model" className="w-full h-full object-cover" />
                        <span className="absolute bottom-2 left-2 bg-black/70 text-white text-[9px] px-2 py-0.5 rounded font-mono">
                          3D Simulation
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-50 rounded-xl p-6 text-center border border-dashed border-slate-300 space-y-2">
                      <Sun className="w-8 h-8 text-amber-500 mx-auto" />
                      <div className="text-xs font-bold text-slate-800">No 3D Simulation Snapshot Attached</div>
                      <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                        Open this proposal from the 3D Solar Designer to attach high-resolution 2D and 3D rooftop renderings.
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => nav("/solar-designer")}
                        className="text-xs text-blue-600 border-blue-200 rounded-lg h-7"
                      >
                        Open 3D Solar Designer
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Navigation Footer */}
              <div className="flex justify-between pt-2">
                <Button variant="ghost" onClick={() => setCurrentStep(1)} className="text-xs text-slate-600 h-9 rounded-xl">
                  <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Customer Info
                </Button>
                <Button
                  onClick={() => setCurrentStep(3)}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold h-9 px-5 rounded-xl shadow-xs gap-1.5"
                >
                  <span>Next: Equipment & Warranty</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────────── */}
          {/* STEP 3: EQUIPMENT & WARRANTY                                     */}
          {/* ───────────────────────────────────────────────────────────────── */}
          {currentStep === 3 && (
            <div className="space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">
                    STEP 03
                  </span>
                  <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                    Equipment Specifications & Warranties
                  </h2>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setCustomItemForm({ name: "", spec: "", qty: "1 Nos" });
                    setEditingEquipmentType("custom");
                  }}
                  className="h-8 text-xs text-blue-700 border-blue-300 rounded-xl gap-1 font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Equipment
                </Button>
              </div>

              {/* EQUIPMENT CARDS GRID */}
              <div className="grid sm:grid-cols-2 gap-3">
                {/* 1. Solar Module Card */}
                <Card className="rounded-2xl border-slate-200 shadow-2xs hover:border-blue-300 transition">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge className="bg-blue-100 text-blue-800 text-[10px] font-bold">SOLAR MODULE</Badge>
                      <button
                        onClick={() => setEditingEquipmentType("panel")}
                        className="text-[11px] text-blue-600 hover:text-blue-800 font-bold"
                      >
                        Edit
                      </button>
                    </div>
                    <div className="text-xs font-bold text-slate-900">{form.panel?.make || "INA Solar"}</div>
                    <div className="text-[11px] text-slate-600">{form.panel?.model || "555 WP DCR TOPCon Bifacial"}</div>
                    <div className="grid grid-cols-2 gap-1 text-[10px] pt-1 text-slate-600 border-t border-slate-100">
                      <div>Quantity: <b>{form.panel?.quantity || 18} Nos</b></div>
                      <div>Wattage: <b>{form.panel?.wattage || 555} Wp</b></div>
                    </div>
                    <div className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md font-medium">
                      🛡️ Warranty: {form.panel?.warrantyProductYears || 12}Y Product / {form.panel?.warrantyPerformanceYears || 30}Y Linear
                    </div>
                  </CardContent>
                </Card>

                {/* 2. Solar Inverter Card */}
                <Card className="rounded-2xl border-slate-200 shadow-2xs hover:border-blue-300 transition">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge className="bg-amber-100 text-amber-800 text-[10px] font-bold">SOLAR INVERTER</Badge>
                      <button
                        onClick={() => setEditingEquipmentType("inverter")}
                        className="text-[11px] text-blue-600 hover:text-blue-800 font-bold"
                      >
                        Edit
                      </button>
                    </div>
                    <div className="text-xs font-bold text-slate-900">{form.inverter?.make || "UTL Solar"}</div>
                    <div className="text-[11px] text-slate-600">{form.inverter?.model || "Smart Grid-Tied Inverter"}</div>
                    <div className="grid grid-cols-2 gap-1 text-[10px] pt-1 text-slate-600 border-t border-slate-100">
                      <div>Capacity: <b>{form.inverter?.capacity || "10.0 kW"}</b></div>
                      <div>Phase: <b>{form.inverter?.phase || "Three Phase"}</b></div>
                    </div>
                    <div className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md font-medium">
                      🛡️ Warranty: {form.inverter?.warrantyYears || 10} Years Manufacturer
                    </div>
                  </CardContent>
                </Card>

                {/* 3. Mounting Structure Card */}
                <Card className="rounded-2xl border-slate-200 shadow-2xs hover:border-blue-300 transition">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge className="bg-slate-100 text-slate-800 text-[10px] font-bold">MOUNTING STRUCTURE</Badge>
                      <button
                        onClick={() => setEditingEquipmentType("structure")}
                        className="text-[11px] text-blue-600 hover:text-blue-800 font-bold"
                      >
                        Edit
                      </button>
                    </div>
                    <div className="text-xs font-bold text-slate-900">{form.structure?.type || "Elevated Super Structure"}</div>
                    <div className="text-[11px] text-slate-600">{form.structure?.material || "Aluminium 6063 & HDGI"}</div>
                    <div className="grid grid-cols-2 gap-1 text-[10px] pt-1 text-slate-600 border-t border-slate-100">
                      <div>Clearance: <b>{form.structure?.height || "1.8m"}</b></div>
                      <div>Wind Rating: <b>150 km/h</b></div>
                    </div>
                    <div className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md font-medium">
                      🛡️ Warranty: {form.structure?.warrantyYears || 5} Years Structural
                    </div>
                  </CardContent>
                </Card>

                {/* 4. Cabling & Electricals */}
                <Card className="rounded-2xl border-slate-200 shadow-2xs hover:border-blue-300 transition">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge className="bg-purple-100 text-purple-800 text-[10px] font-bold">CABLING & HARNESS</Badge>
                      <button
                        onClick={() => setEditingEquipmentType("cables")}
                        className="text-[11px] text-blue-600 hover:text-blue-800 font-bold"
                      >
                        Edit
                      </button>
                    </div>
                    <div className="text-xs font-bold text-slate-900">Polycab / Havells / Siechem</div>
                    <div className="text-[11px] text-slate-600">{form.cables?.dcCable || "4/6 sq.mm Tinned Copper DC Cable"}</div>
                    <div className="text-[10px] text-slate-500">AC: {form.cables?.acCable || "4-Core Armoured Cable"}</div>
                    <div className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md font-medium">
                      🛡️ Warranty: 1 Year Workmanship Guarantee
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Balance of System (BOS) Table Card */}
              <Card className="rounded-2xl border-slate-200 shadow-2xs">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-slate-800 font-bold text-xs">
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                      <span>Balance of System (BOS) & Safety Protection</span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">{(form.bos || []).length} Components</span>
                  </div>

                  <div className="divide-y divide-slate-100 text-xs">
                    {(form.bos || []).map((item, idx) => (
                      <div key={idx} className="py-2 flex items-center justify-between gap-2">
                        <div>
                          <div className="font-bold text-slate-900 text-[11px]">{item.name}</div>
                          <div className="text-[10px] text-slate-500">{item.spec}</div>
                        </div>
                        <Badge variant="outline" className="text-[9px] font-mono shrink-0">
                          {item.qty}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Navigation Footer */}
              <div className="flex justify-between pt-2">
                <Button variant="ghost" onClick={() => setCurrentStep(2)} className="text-xs text-slate-600 h-9 rounded-xl">
                  <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Solar Design
                </Button>
                <Button
                  onClick={() => setCurrentStep(4)}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold h-9 px-5 rounded-xl shadow-xs gap-1.5"
                >
                  <span>Next: Scope & Delivery</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────────── */}
          {/* STEP 4: SCOPE & PROJECT DELIVERY                                 */}
          {/* ───────────────────────────────────────────────────────────────── */}
          {currentStep === 4 && (
            <div className="space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">
                    STEP 04
                  </span>
                  <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                    Scope Matrix & Project Delivery
                  </h2>
                </div>
              </div>

              {/* TWO LARGE CARDS: EPC SCOPE VS CUSTOMER RESPONSIBILITY */}
              <div className="grid sm:grid-cols-2 gap-4">
                {/* CARD 1: EPC Turnkey Scope */}
                <Card className="rounded-2xl border-slate-200 shadow-2xs">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <div className="font-bold text-xs text-emerald-800 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>EPC Scope (Included)</span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setScopeTargetType("our");
                          setNewScopeText("");
                          setShowAddScopeModal(true);
                        }}
                        className="h-6 text-[10px] text-blue-600 px-1.5 rounded-lg"
                      >
                        + Add Item
                      </Button>
                    </div>

                    <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                      {(form.our_scope || []).map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between p-1.5 rounded-lg bg-emerald-50/50 border border-emerald-100 text-xs">
                          <div className="flex items-center gap-2 truncate">
                            <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                            <span className="text-slate-800 text-[11px] truncate">{item}</span>
                          </div>
                          <button
                            onClick={() => {
                              setForm({ ...form, our_scope: form.our_scope.filter((_, i) => i !== idx) });
                              setIsSavedDraft(false);
                            }}
                            className="text-slate-400 hover:text-red-500 p-0.5"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* CARD 2: Customer Responsibility */}
                <Card className="rounded-2xl border-slate-200 shadow-2xs">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <div className="font-bold text-xs text-amber-800 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span>Customer Deliverables</span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setScopeTargetType("customer");
                          setNewScopeText("");
                          setShowAddScopeModal(true);
                        }}
                        className="h-6 text-[10px] text-blue-600 px-1.5 rounded-lg"
                      >
                        + Add Item
                      </Button>
                    </div>

                    <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                      {(form.customer_scope || []).map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between p-1.5 rounded-lg bg-amber-50/50 border border-amber-100 text-xs">
                          <div className="flex items-center gap-2 truncate">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                            <span className="text-slate-800 text-[11px] truncate">{item}</span>
                          </div>
                          <button
                            onClick={() => {
                              setForm({ ...form, customer_scope: form.customer_scope.filter((_, i) => i !== idx) });
                              setIsSavedDraft(false);
                            }}
                            className="text-slate-400 hover:text-red-500 p-0.5"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Project Delivery Timeline Card */}
              <Card className="rounded-2xl border-slate-200 shadow-2xs">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-blue-600" />
                      <span>Project Execution Timeline</span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-semibold">Turnkey in ~45 Days</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    {(form.timeline || []).map((t, idx) => (
                      <div key={idx} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                        <div className="flex justify-between items-center text-[10px] text-blue-700 font-bold uppercase">
                          <span>{t.stage}</span>
                          <span className="font-mono text-slate-500">{t.days} Days</span>
                        </div>
                        <div className="font-bold text-slate-900 text-[11px] leading-tight">{t.title}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Navigation Footer */}
              <div className="flex justify-between pt-2">
                <Button variant="ghost" onClick={() => setCurrentStep(3)} className="text-xs text-slate-600 h-9 rounded-xl">
                  <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Equipment
                </Button>
                <Button
                  onClick={() => setCurrentStep(5)}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold h-9 px-5 rounded-xl shadow-xs gap-1.5"
                >
                  <span>Next: Commercial & Financial</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────────── */}
          {/* STEP 5: COMMERCIAL & FINANCIAL                                   */}
          {/* ───────────────────────────────────────────────────────────────── */}
          {currentStep === 5 && (
            <div className="space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">
                    STEP 05
                  </span>
                  <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                    Commercial Offer & Financial Returns
                  </h2>
                </div>
              </div>

              {/* LARGE FINANCIAL SUMMARY CARDS */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-900 text-white p-3.5 rounded-2xl border border-slate-800 shadow-md">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase block">Project Cost</span>
                  <div className="text-lg sm:text-xl font-black text-white" style={{ fontFamily: "Outfit" }}>
                    {formatINR(form.system_price)}
                  </div>
                  <span className="text-[9px] text-slate-400">Base System Pricing</span>
                </div>

                <div className="bg-blue-50/90 text-blue-950 p-3.5 rounded-2xl border border-blue-200 shadow-xs">
                  <span className="text-[10px] font-bold text-blue-700 uppercase block">GST ({form.gst_pct}%)</span>
                  <div className="text-lg sm:text-xl font-black text-blue-950" style={{ fontFamily: "Outfit" }}>
                    {formatINR(metrics.gstAmount)}
                  </div>
                  <span className="text-[9px] text-blue-600">Standard Solar GST</span>
                </div>

                <div className="bg-emerald-50/90 text-emerald-950 p-3.5 rounded-2xl border border-emerald-200 shadow-xs">
                  <span className="text-[10px] font-bold text-emerald-700 uppercase block">Central Subsidy</span>
                  <div className="text-lg sm:text-xl font-black text-emerald-950" style={{ fontFamily: "Outfit" }}>
                    {form.subsidy_applicable ? formatINR(form.subsidy_amount) : "₹0"}
                  </div>
                  <span className="text-[9px] text-emerald-700">PM Surya Ghar Scheme</span>
                </div>

                <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-3.5 rounded-2xl shadow-md">
                  <span className="text-[10px] font-bold text-blue-100 uppercase block">Net Customer Cost</span>
                  <div className="text-lg sm:text-xl font-black text-white" style={{ fontFamily: "Outfit" }}>
                    {formatINR(metrics.netCustomerCost)}
                  </div>
                  <span className="text-[9px] text-blue-200">Post-Subsidy Net</span>
                </div>
              </div>

              {/* Pricing & Subsidy Inputs Card */}
              <Card className="rounded-2xl border-slate-200 shadow-2xs">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-xs font-bold text-slate-800">Commercial Pricing Adjustments</span>
                    <div className="flex items-center gap-2">
                      <Label className="text-[11px] font-semibold text-slate-600">Apply Central Subsidy:</Label>
                      <Switch
                        checked={form.subsidy_applicable}
                        onCheckedChange={(val) => {
                          const subAmt = val ? calculateSubsidy(form.system_kw, form.project_type) : 0;
                          setForm({ ...form, subsidy_applicable: val, subsidy_amount: subAmt });
                          setIsSavedDraft(false);
                        }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <Label className="text-[10px] text-slate-500 font-bold uppercase">Base Price (₹)</Label>
                      <Input
                        type="number"
                        step="1000"
                        value={form.system_price}
                        onChange={(e) => {
                          setForm({ ...form, system_price: parseFloat(e.target.value) || 0 });
                          setIsSavedDraft(false);
                        }}
                        className="h-8 text-xs font-bold mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-slate-500 font-bold uppercase">DISCOM / Net-Meter (₹)</Label>
                      <Input
                        type="number"
                        step="500"
                        value={form.net_meter_charges || 0}
                        onChange={(e) => {
                          setForm({ ...form, net_meter_charges: parseFloat(e.target.value) || 0 });
                          setIsSavedDraft(false);
                        }}
                        className="h-8 text-xs font-bold mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-slate-500 font-bold uppercase">Grid Tariff (₹/kWh)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={form.tariff_rate || 8.5}
                        onChange={(e) => {
                          setForm({ ...form, tariff_rate: parseFloat(e.target.value) || 8.5 });
                          setIsSavedDraft(false);
                        }}
                        className="h-8 text-xs font-bold mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-slate-500 font-bold uppercase">GST Rate (%)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={form.gst_pct || 13.8}
                        onChange={(e) => {
                          setForm({ ...form, gst_pct: parseFloat(e.target.value) || 13.8 });
                          setIsSavedDraft(false);
                        }}
                        className="h-8 text-xs font-bold mt-1"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Payment Milestones Card with 100% validation */}
              <Card className="rounded-2xl border-slate-200 shadow-2xs">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-3.5 h-3.5 text-blue-600" />
                      <span className="text-xs font-bold text-slate-800">Payment Terms & Milestones</span>
                      <Badge
                        variant="outline"
                        className={`text-[9px] font-bold ${
                          Math.abs(milestoneTotalPct - 100) < 0.1
                            ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                            : "bg-amber-50 text-amber-700 border-amber-300"
                        }`}
                      >
                        Total: {milestoneTotalPct}%
                      </Badge>
                    </div>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setNewMilestoneForm({ stage: `Milestone ${(form.milestones || []).length + 1}`, label: "", pct: 10 });
                        setShowAddMilestoneModal(true);
                      }}
                      className="h-6 text-[10px] text-blue-600 px-1.5 rounded-lg"
                    >
                      + Add Milestone
                    </Button>
                  </div>

                  {/* Percentage Progress Bar */}
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full transition-all ${Math.abs(milestoneTotalPct - 100) < 0.1 ? "bg-emerald-500" : "bg-amber-500"}`}
                      style={{ width: `${Math.min(100, milestoneTotalPct)}%` }}
                    />
                  </div>

                  <div className="space-y-2 text-xs">
                    {(form.milestones || []).map((m, idx) => {
                      const amount = metrics.netCustomerCost * (Number(m.pct) / 100);
                      return (
                        <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200 gap-2">
                          <div className="min-w-0">
                            <span className="text-[10px] font-bold text-blue-700 uppercase block">{m.stage}</span>
                            <div className="font-semibold text-slate-800 text-[11px] truncate">{m.label}</div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right">
                              <span className="font-bold text-slate-900 text-xs">{formatINR(amount)}</span>
                              <div className="text-[9px] text-slate-500">{m.pct}%</div>
                            </div>
                            <button
                              onClick={() => {
                                setForm({ ...form, milestones: form.milestones.filter((_, i) => i !== idx) });
                                setIsSavedDraft(false);
                              }}
                              className="text-slate-400 hover:text-red-500 p-1"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Navigation Footer */}
              <div className="flex justify-between pt-2">
                <Button variant="ghost" onClick={() => setCurrentStep(4)} className="text-xs text-slate-600 h-9 rounded-xl">
                  <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Scope & Delivery
                </Button>
                <Button
                  onClick={() => setCurrentStep(6)}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold h-9 px-5 rounded-xl shadow-xs gap-1.5"
                >
                  <span>Next: Review Proposal</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────────── */}
          {/* STEP 6: REVIEW PROPOSAL                                          */}
          {/* ───────────────────────────────────────────────────────────────── */}
          {currentStep === 6 && (
            <div className="space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">
                    STEP 06
                  </span>
                  <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                    Proposal Final Review & Generation
                  </h2>
                </div>
              </div>

              {/* Proposal Readiness Checklist Card */}
              <Card className="rounded-2xl border-slate-200 shadow-2xs">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span className="font-bold text-xs text-slate-900">Proposal Readiness Audit</span>
                    </div>
                    <Badge
                      className={`text-[10px] font-bold ${
                        readiness.isReady
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {readiness.isReady ? "Ready to Generate" : `${readiness.missingCount} Incomplete Items`}
                    </Badge>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-2 text-xs">
                    {readiness.checks.map((c) => (
                      <div
                        key={c.id}
                        className={`flex items-center justify-between p-2 rounded-xl border ${
                          c.ok
                            ? "bg-emerald-50/50 border-emerald-100 text-slate-800"
                            : "bg-amber-50/70 border-amber-200 text-amber-900"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {c.ok ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          ) : (
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          )}
                          <span className="font-medium text-[11px]">{c.label}</span>
                        </div>
                        {!c.ok && (
                          <button
                            onClick={() => setCurrentStep(c.step)}
                            className="text-[10px] font-bold text-blue-600 hover:text-blue-800 bg-white px-2 py-0.5 rounded border border-blue-200"
                          >
                            Fix →
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Executive Review Cards with [Edit] Jump Links */}
              <div className="space-y-3">
                {/* 1. Customer & Site Review Card */}
                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Customer & Site</span>
                    <div className="text-xs font-bold text-slate-900">{form.customer_name || "—"} ({form.mobile || "—"})</div>
                    <div className="text-[10px] text-slate-500">{form.site_address || "—"}, {form.city}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setCurrentStep(1)} className="text-xs text-blue-600 h-7">
                    Edit
                  </Button>
                </div>

                {/* 2. System Design Review Card */}
                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Solar System</span>
                    <div className="text-xs font-bold text-slate-900">{form.system_kw} kWp · {form.panel?.quantity || 18} Modules ({form.panel?.wattage || 555}W)</div>
                    <div className="text-[10px] text-slate-500">{form.inverter?.capacity || "10 kW"} Inverter · {form.structure?.type || "Elevated"}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setCurrentStep(2)} className="text-xs text-blue-600 h-7">
                    Edit
                  </Button>
                </div>

                {/* 3. Commercials Review Card */}
                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Commercial Offer</span>
                    <div className="text-xs font-bold text-slate-900">Net Customer Cost: {formatINR(metrics.netCustomerCost)}</div>
                    <div className="text-[10px] text-emerald-700 font-medium">
                      Est. Payback: {metrics.paybackYears} Years · Lifetime Savings: {formatINR(metrics.lifetimeSavings)}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setCurrentStep(5)} className="text-xs text-blue-600 h-7">
                    Edit
                  </Button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                <Button variant="ghost" onClick={() => setCurrentStep(5)} className="text-xs text-slate-600 h-9 rounded-xl">
                  <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Financials
                </Button>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowFullViewerModal(true)}
                    className="flex-1 sm:flex-none h-10 text-xs font-bold rounded-xl border-slate-300"
                  >
                    <Eye className="w-4 h-4 mr-1.5" /> Open Full Document
                  </Button>

                  <Button
                    size="sm"
                    onClick={handleGenerateProposal}
                    disabled={generating}
                    className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs h-10 px-6 rounded-xl shadow-md gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>{generating ? "Building PDF…" : "Generate Proposal PDF"}</span>
                  </Button>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* RIGHT COLUMN: STICKY LIVE PROPOSAL PREVIEW CARD (5 cols on desktop) */}
        <div className={`lg:col-span-5 ${showMobilePreview ? "block" : "hidden lg:block"}`}>
          <LiveProposalPreviewCard
            form={form}
            metrics={metrics}
            companyData={companyData}
            onOpenFullViewer={() => setShowFullViewerModal(true)}
            onGenerateProposal={handleGenerateProposal}
            generating={generating}
          />
        </div>

      </div>

      {/* ── 4. FULL 11-PAGE PROPOSAL DOCUMENT VIEWER MODAL ────────────────── */}
      <Dialog open={showFullViewerModal} onOpenChange={setShowFullViewerModal}>
        <DialogContent className="max-w-6xl w-[95vw] h-[90vh] p-0 bg-slate-950 border-slate-800 text-white overflow-hidden flex flex-col">
          <ProposalDocumentViewer
            proposalData={form}
            companyData={companyData}
            metrics={metrics}
            onClose={() => setShowFullViewerModal(false)}
            onDownloadPdf={handleGenerateProposal}
            downloading={generating}
          />
        </DialogContent>
      </Dialog>

      {/* ── 5. EQUIPMENT EDIT / ADD MODAL ──────────────────────────────────── */}
      <Dialog open={Boolean(editingEquipmentType)} onOpenChange={(o) => !o && setEditingEquipmentType(null)}>
        <DialogContent className="max-w-md bg-white text-slate-900 border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-blue-600" />
              <span>
                {editingEquipmentType === "panel" && "Edit Solar PV Module"}
                {editingEquipmentType === "inverter" && "Edit Solar Inverter"}
                {editingEquipmentType === "structure" && "Edit Mounting Structure"}
                {editingEquipmentType === "cables" && "Edit Cabling & Harness"}
                {editingEquipmentType === "custom" && "Add Custom Equipment Item"}
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            {editingEquipmentType === "panel" && (
              <>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600">Module Make / Brand</Label>
                  <Input
                    value={form.panel?.make || ""}
                    onChange={(e) => setForm({ ...form, panel: { ...form.panel, make: e.target.value } })}
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600">Model Specification</Label>
                  <Input
                    value={form.panel?.model || ""}
                    onChange={(e) => setForm({ ...form, panel: { ...form.panel, model: e.target.value } })}
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px] font-semibold text-slate-600">Wattage (Wp)</Label>
                    <Input
                      type="number"
                      value={form.panel?.wattage || 555}
                      onChange={(e) => setForm({ ...form, panel: { ...form.panel, wattage: parseInt(e.target.value) || 555 } })}
                      className="h-8 text-xs mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold text-slate-600">Product Warranty (Yrs)</Label>
                    <Input
                      type="number"
                      value={form.panel?.warrantyProductYears || 12}
                      onChange={(e) => setForm({ ...form, panel: { ...form.panel, warrantyProductYears: parseInt(e.target.value) || 12 } })}
                      className="h-8 text-xs mt-1"
                    />
                  </div>
                </div>
              </>
            )}

            {editingEquipmentType === "inverter" && (
              <>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600">Inverter Make / Brand</Label>
                  <Input
                    value={form.inverter?.make || ""}
                    onChange={(e) => setForm({ ...form, inverter: { ...form.inverter, make: e.target.value } })}
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600">Capacity Rating</Label>
                  <Input
                    value={form.inverter?.capacity || ""}
                    onChange={(e) => setForm({ ...form, inverter: { ...form.inverter, capacity: e.target.value } })}
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600">Warranty (Years)</Label>
                  <Input
                    type="number"
                    value={form.inverter?.warrantyYears || 10}
                    onChange={(e) => setForm({ ...form, inverter: { ...form.inverter, warrantyYears: parseInt(e.target.value) || 10 } })}
                    className="h-8 text-xs mt-1"
                  />
                </div>
              </>
            )}

            {editingEquipmentType === "custom" && (
              <>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600">Component Name</Label>
                  <Input
                    value={customItemForm.name}
                    onChange={(e) => setCustomItemForm({ ...customItemForm, name: e.target.value })}
                    placeholder="e.g. Remote Monitoring Gateway"
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600">Specification Details</Label>
                  <Input
                    value={customItemForm.spec}
                    onChange={(e) => setCustomItemForm({ ...customItemForm, spec: e.target.value })}
                    placeholder="e.g. 4G/Wi-Fi Dual Mode IoT Gateway"
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600">Quantity</Label>
                  <Input
                    value={customItemForm.qty}
                    onChange={(e) => setCustomItemForm({ ...customItemForm, qty: e.target.value })}
                    placeholder="e.g. 1 Set"
                    className="h-8 text-xs mt-1"
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setEditingEquipmentType(null)} className="text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (editingEquipmentType === "custom") {
                  if (customItemForm.name) {
                    setForm({ ...form, bos: [...(form.bos || []), customItemForm] });
                    toast.success(`Added ${customItemForm.name}`);
                  }
                } else {
                  toast.success("Equipment updated");
                }
                setIsSavedDraft(false);
                setEditingEquipmentType(null);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
            >
              Save Equipment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 6. ADD SCOPE MODAL ──────────────────────────────────────────────── */}
      <Dialog open={showAddScopeModal} onOpenChange={setShowAddScopeModal}>
        <DialogContent className="max-w-sm bg-white text-slate-900 border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">
              Add {scopeTargetType === "our" ? "EPC Scope Item" : "Customer Deliverable"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2 text-xs">
            <Label className="text-slate-600">Scope Deliverable Description</Label>
            <Input
              value={newScopeText}
              onChange={(e) => setNewScopeText(e.target.value)}
              placeholder="e.g. 24x7 App-Based Remote Monitoring"
              className="h-8 text-xs"
            />
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setShowAddScopeModal(false)} className="text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (!newScopeText.trim()) return;
                if (scopeTargetType === "our") {
                  setForm({ ...form, our_scope: [...(form.our_scope || []), newScopeText.trim()] });
                } else {
                  setForm({ ...form, customer_scope: [...(form.customer_scope || []), newScopeText.trim()] });
                }
                setIsSavedDraft(false);
                setShowAddScopeModal(false);
                toast.success("Scope item added ✓");
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
            >
              Add Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 7. ADD MILESTONE MODAL ──────────────────────────────────────────── */}
      <Dialog open={showAddMilestoneModal} onOpenChange={setShowAddMilestoneModal}>
        <DialogContent className="max-w-sm bg-white text-slate-900 border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">Add Payment Milestone</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2 text-xs">
            <div>
              <Label className="text-slate-600">Stage Label</Label>
              <Input
                value={newMilestoneForm.stage}
                onChange={(e) => setNewMilestoneForm({ ...newMilestoneForm, stage: e.target.value })}
                className="h-8 text-xs mt-1"
              />
            </div>
            <div>
              <Label className="text-slate-600">Milestone Condition</Label>
              <Input
                value={newMilestoneForm.label}
                onChange={(e) => setNewMilestoneForm({ ...newMilestoneForm, label: e.target.value })}
                placeholder="e.g. Upon Net-Meter Activation"
                className="h-8 text-xs mt-1"
              />
            </div>
            <div>
              <Label className="text-slate-600">Percentage (%)</Label>
              <Input
                type="number"
                value={newMilestoneForm.pct}
                onChange={(e) => setNewMilestoneForm({ ...newMilestoneForm, pct: parseFloat(e.target.value) || 0 })}
                className="h-8 text-xs mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setShowAddMilestoneModal(false)} className="text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (!newMilestoneForm.label.trim()) return;
                setForm({ ...form, milestones: [...(form.milestones || []), newMilestoneForm] });
                setIsSavedDraft(false);
                setShowAddMilestoneModal(false);
                toast.success("Milestone added ✓");
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
            >
              Add Milestone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
