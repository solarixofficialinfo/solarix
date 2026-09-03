import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api, { formatApiError, fileUrl, downloadFile } from "@/lib/api";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import dayjs from "dayjs";
import {
  FileText, Sparkles, Sun, Zap, CheckCircle2, ArrowRight, ArrowLeft,
  Download, Printer, Share2, Eye, RefreshCw, Layers, UserPlus, Users2,
  Edit3, ShieldCheck, TreePine, Leaf, DollarSign, Calendar, Clock,
  MapPin, Phone, Mail, Building2, Check, AlertCircle, Save, Trash2
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

const DRAFT_STORAGE_KEY = "solarix_proposal_generator_draft_v1";

export default function ProposalGenerator() {
  const location = useLocation();
  const nav = useNavigate();
  const { user } = useAuth();

  // Queries
  const { data: companyData } = useCompany();
  const { data: clients = [] } = useClientList();
  const { data: history = [], refetch: refetchHistory } = useSalesDocuments("proposal");

  // Step Management: 1: Basic, 2: Solar System, 3: Scope & Terms, 4: Financials, 5: Review
  const [currentStep, setCurrentStep] = useState(1);
  const [sourceType, setSourceType] = useState("manual"); // 'lead' | 'client' | 'design' | 'manual'

  // Async selector data
  const [leadsList, setLeadsList] = useState([]);
  const [designsList, setDesignsList] = useState([]);
  const [loadingSources, setLoadingSources] = useState(false);

  // Selected entities
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedDesignId, setSelectedDesignId] = useState("");

  // Primary Proposal Form State
  const [form, setForm] = useState(() => {
    const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // Fallback to default initial state
      }
    }

    const todayStr = dayjs().format("YYYY-MM-DD");
    const refNum = `PROP-${dayjs().format("YYMMDD")}-${Math.floor(1000 + Math.random() * 9000)}`;

    return {
      // Step 1: Basic Details
      proposal_number: refNum,
      proposal_date: todayStr,
      customer_name: "",
      mobile: "",
      email: "",
      site_address: "",
      city: "",
      state: "Maharashtra",
      pincode: "",
      system_kw: 5.0,
      project_type: "Residential",
      solar_system_type: "Grid Connected / On Grid",
      prepared_by: user?.name || "Solar Solutions Engineer",
      linked_design_name: "",
      linked_design_id: "",

      // Step 2: Equipment
      panel: { ...DEFAULT_PANEL_DATA, quantity: 9 },
      inverter: { ...DEFAULT_INVERTER_DATA, capacity: "5.0 kW", quantity: 1 },
      structure: { ...DEFAULT_STRUCTURE_DATA },
      cables: { ...DEFAULT_CABLES_DATA },
      bos: [...DEFAULT_BOS_COMPONENTS],
      warranties: [...DEFAULT_WARRANTIES],

      // Step 3: Scope & Terms
      timeline: [...DEFAULT_TIMELINE_STAGES],
      our_scope: [...DEFAULT_OUR_SCOPE],
      customer_scope: [...DEFAULT_CUSTOMER_SCOPE],
      terms: [...DEFAULT_TERMS],

      // Step 4: Financials
      system_price: 250000,
      additional_charges: 0,
      net_meter_charges: 0,
      gst_pct: 13.8,
      subsidy_applicable: true,
      subsidy_amount: 78000,
      tariff_rate: 8.5,
      milestones: [
        { stage: "Milestone 1", label: "20% Advance with Order Confirmation", pct: 20 },
        { stage: "Milestone 2", label: "70% Upon Material Readiness & Site Dispatch", pct: 70 },
        { stage: "Milestone 3", label: "5% Upon Complete Installation & Wiring", pct: 5 },
        { stage: "Milestone 4", label: "5% Upon Net-Meter Installation & Commissioning", pct: 5 },
      ],

      // Visuals from Solar Designer
      snapshot_2d: "",
      snapshot_3d: "",
    };
  });

  // Generated document state
  const [generating, setGenerating] = useState(false);
  const [generatedDoc, setGeneratedDoc] = useState(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Autosave draft to localStorage
  useEffect(() => {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(form));
  }, [form]);

  // Load Leads and Designs on mount for instant combobox selection
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
        // Silently handle
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
      const pCount = Number(d.panel_count || (d.panels || []).filter((p) => !p.hidden).length || 9);
      const sysKw = Number(d.system_kw || ((pCount * pWatt) / 1000.0).toFixed(2));
      const subAmt = calculateSubsidy(sysKw, "residential");

      setForm((prev) => ({
        ...prev,
        customer_name: d.client_name || prev.customer_name,
        site_address: d.formatted_address || d.address || prev.site_address,
        system_kw: sysKw,
        linked_design_id: d.id || "",
        linked_design_name: d.site_name || d.name || "3D Rooftop Layout",
        snapshot_2d: d.layout_snapshot_2d || d.snapshot_2d || prev.snapshot_2d,
        snapshot_3d: d.layout_snapshot_3d || d.snapshot_3d || prev.snapshot_3d,
        panel: {
          ...prev.panel,
          make: d.panel_make || prev.panel.make,
          model: d.panel_model || prev.panel.model,
          wattage: pWatt,
          quantity: pCount,
        },
        structure: {
          ...prev.structure,
          type: d.structure_type === "flush" ? "Flush Rooftop Mount" : "Elevated Super Structure",
          height: d.mounting_height_m ? `${d.mounting_height_m}m Clearance` : prev.structure.height,
        },
        subsidy_amount: subAmt,
        system_price: Math.round(sysKw * 50000), // Estimated base ₹50k/kW
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

    const sysKw = Number(lead.system_kw || 5.0);
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

    const sysKw = Number(cl.system_kw || 5.0);
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
    const pCount = Number(d.panel_count || (d.panels || []).filter((p) => !p.hidden).length || 9);
    const sysKw = Number(d.system_kw || ((pCount * pWatt) / 1000.0).toFixed(2));
    const subAmt = calculateSubsidy(sysKw, "residential");

    setForm((prev) => ({
      ...prev,
      customer_name: d.client_name || prev.customer_name,
      site_address: d.formatted_address || d.address || prev.site_address,
      system_kw: sysKw,
      linked_design_id: d.id,
      linked_design_name: d.site_name || d.name || "3D Rooftop Layout",
      snapshot_2d: d.layout_snapshot_2d || d.snapshot_2d || prev.snapshot_2d,
      snapshot_3d: d.layout_snapshot_3d || d.snapshot_3d || prev.snapshot_3d,
      system_price: Math.round(sysKw * 50000),
      subsidy_amount: subAmt,
      panel: {
        ...prev.panel,
        make: d.panel_make || prev.panel.make,
        model: d.panel_model || prev.panel.model,
        wattage: pWatt,
        quantity: pCount,
      },
      structure: {
        ...prev.structure,
        type: d.structure_type === "flush" ? "Flush Rooftop Mount" : "Elevated Super Structure",
        height: d.mounting_height_m ? `${d.mounting_height_m}m Clearance` : prev.structure.height,
      },
    }));

    toast.success(`Linked design "${d.site_name || d.name}" (${sysKw} kWp)`);
  };

  // Reactive calculations
  const grossCost = useMemo(() => {
    const base = Number(form.system_price) || 0;
    const add = Number(form.additional_charges) || 0;
    const netM = Number(form.net_meter_charges) || 0;
    const gstRate = Number(form.gst_pct) || 0;
    const gstAmt = Math.round((base * gstRate) / 100);
    return base + add + netM + gstAmt;
  }, [form.system_price, form.additional_charges, form.net_meter_charges, form.gst_pct]);

  const gstAmount = useMemo(() => {
    const base = Number(form.system_price) || 0;
    const gstRate = Number(form.gst_pct) || 0;
    return Math.round((base * gstRate) / 100);
  }, [form.system_price, form.gst_pct]);

  const netCustomerCost = useMemo(() => {
    const sub = form.subsidy_applicable ? (Number(form.subsidy_amount) || 0) : 0;
    return Math.max(0, grossCost - sub);
  }, [grossCost, form.subsidy_applicable, form.subsidy_amount]);

  const solarMetrics = useMemo(() => {
    return calculateSolarMetrics({
      systemKw: form.system_kw,
      tariffRate: form.tariff_rate,
      netCost: netCustomerCost,
    });
  }, [form.system_kw, form.tariff_rate, netCustomerCost]);

  const calculatedMilestones = useMemo(() => {
    return calculatePaymentMilestones(netCustomerCost, form.milestones);
  }, [netCustomerCost, form.milestones]);

  // System Capacity Change handler (keeps panel count & subsidy in sync)
  const handleSystemKwChange = (val) => {
    const kw = parseFloat(val) || 0;
    const pWatt = Number(form.panel?.wattage) || 555;
    const pCount = Math.max(1, Math.round((kw * 1000) / pWatt));
    const subAmt = calculateSubsidy(kw, form.project_type);

    setForm((prev) => ({
      ...prev,
      system_kw: kw,
      subsidy_amount: subAmt,
      system_price: Math.round(kw * 50000),
      panel: {
        ...prev.panel,
        quantity: pCount,
      },
      inverter: {
        ...prev.inverter,
        capacity: `${kw.toFixed(1)} kW`,
        phase: kw <= 5 ? "Single Phase" : "Three Phase",
      },
    }));
  };

  // Reset to Clean Draft
  const handleResetDraft = () => {
    if (window.confirm("Reset proposal builder and start a fresh draft? All unsaved edits will be cleared.")) {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      window.location.reload();
    }
  };

  // Generate Proposal PDF via API
  const handleGenerateProposal = async () => {
    if (!form.customer_name.trim()) {
      toast.error("Please enter the customer name");
      setCurrentStep(1);
      return;
    }
    if (!form.proposal_number.trim()) {
      toast.error("Proposal number is required");
      setCurrentStep(1);
      return;
    }

    setGenerating(true);
    try {
      const payloadDocData = {
        ...form,
        gross_cost: grossCost,
        gst_amount: gstAmount,
        net_customer_cost: netCustomerCost,
        annual_kwh: solarMetrics.annualKwh,
        annual_savings: solarMetrics.annualSavings,
        payback_years: solarMetrics.paybackYears,
        lifetime_savings: solarMetrics.lifetimeSavings,
        co2_tons: solarMetrics.co2Tons,
        trees_count: solarMetrics.treesEquivalent,
        milestones: calculatedMilestones,
      };

      const payload = {
        doc_type: "proposal",
        doc_data: payloadDocData,
        client_id: selectedClientId || undefined,
      };

      const res = await api.post("/documents/generate", payload);
      const generated = res.data;
      setGeneratedDoc(generated);
      refetchHistory();
      toast.success("Proposal generated successfully!");
      setShowPreviewModal(true);
    } catch (err) {
      toast.error("Failed to generate proposal: " + formatApiError(err));
    } finally {
      setGenerating(false);
    }
  };

  // Download PDF
  const handleDownloadPdf = async () => {
    if (generatedDoc?.id) {
      await downloadFile(generatedDoc.id, generatedDoc.filename || `Proposal_${form.customer_name}.pdf`);
    } else {
      await handleGenerateProposal();
    }
  };

  const steps = [
    { num: 1, label: "Basic Details", desc: "Customer & site information" },
    { num: 2, label: "Solar System", desc: "Modules, inverter & BOS" },
    { num: 3, label: "Scope & Terms", desc: "Timeline, execution & conditions" },
    { num: 4, label: "Financials", desc: "Investment, subsidy & payback" },
    { num: 5, label: "Review & Generate", desc: "Audit and publish proposal" },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* ── TOP HEADER ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-700 to-indigo-600 text-white flex items-center justify-center shadow-md">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>
                Proposal Generator
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Create high-impact, customer-ready Solar EPC proposals in minutes.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {generatedDoc && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPreviewModal(true)}
              className="border-slate-300 text-slate-700 text-xs font-semibold h-9 px-3 rounded-xl gap-1.5 shadow-2xs"
            >
              <Eye className="w-3.5 h-3.5 text-blue-600" /> View Document
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetDraft}
            className="text-slate-400 hover:text-slate-600 text-xs h-9 px-2.5 rounded-xl"
            title="Clear and reset draft"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button
            onClick={handleGenerateProposal}
            disabled={generating}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold h-9 px-4 rounded-xl shadow-xs transition gap-2"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {generating ? "Building Proposal…" : "Generate Proposal"}
          </Button>
        </div>
      </div>

      {/* ── STEP 0: SOURCE SELECTION BANNER ───────────────────────────────────── */}
      <Card className="rounded-2xl border-slate-200 shadow-2xs bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white p-4 sm:p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-300 block mb-1">
              STEP 0 · SOURCE SELECTION
            </span>
            <div className="text-base font-bold tracking-tight text-white" style={{ fontFamily: "Outfit" }}>
              How do you want to create this proposal?
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Pull data instantly from an existing record without duplicate data entry.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {[
              { key: "lead", label: "Existing Lead", icon: UserPlus },
              { key: "client", label: "Client Record", icon: Users2 },
              { key: "design", label: "3D Solar Design", icon: Layers },
              { key: "manual", label: "Manual Entry", icon: Edit3 },
            ].map((btn) => {
              const Icon = btn.icon;
              const active = sourceType === btn.key;
              return (
                <button
                  key={btn.key}
                  onClick={() => setSourceType(btn.key)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                    active
                      ? "bg-blue-600 text-white shadow-md shadow-blue-900/50 scale-102"
                      : "bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{btn.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Source Dropdowns */}
        {sourceType === "lead" && (
          <div className="mt-4 pt-4 border-t border-slate-700/80 grid sm:grid-cols-2 gap-3 items-center">
            <div>
              <Label className="text-[11px] text-slate-300 font-semibold mb-1 block">Choose a Lead to autofill</Label>
              <Select value={selectedLeadId} onValueChange={handleSelectLead}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white text-xs h-9 rounded-xl">
                  <SelectValue placeholder="Select lead from CRM…" />
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
            <div className="text-[11px] text-slate-400">
              Selected lead details (name, address, capacity) will populate Step 1 automatically.
            </div>
          </div>
        )}

        {sourceType === "client" && (
          <div className="mt-4 pt-4 border-t border-slate-700/80 grid sm:grid-cols-2 gap-3 items-center">
            <div>
              <Label className="text-[11px] text-slate-300 font-semibold mb-1 block">Choose a Client</Label>
              <Select value={selectedClientId} onValueChange={handleSelectClient}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white text-xs h-9 rounded-xl">
                  <SelectValue placeholder="Select onboarded client…" />
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
            <div className="text-[11px] text-slate-400">
              Customer contact, address, consumer details, and capacity loaded from Client Master.
            </div>
          </div>
        )}

        {sourceType === "design" && (
          <div className="mt-4 pt-4 border-t border-slate-700/80 grid sm:grid-cols-2 gap-3 items-center">
            <div>
              <Label className="text-[11px] text-slate-300 font-semibold mb-1 block">Choose 3D Solar Design</Label>
              <Select value={selectedDesignId} onValueChange={handleSelectDesign}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white text-xs h-9 rounded-xl">
                  <SelectValue placeholder="Select 3D Solar Project…" />
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
            <div className="text-[11px] text-slate-400">
              Syncs capacity, module count, orientation, structure, and 2D/3D design snapshots.
            </div>
          </div>
        )}
      </Card>

      {/* ── PROGRESS STEPPER ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto pb-2 scrollbar-none">
        {steps.map((s, idx) => {
          const isActive = currentStep === s.num;
          const isDone = currentStep > s.num;
          return (
            <button
              key={s.num}
              onClick={() => setCurrentStep(s.num)}
              className={`flex-1 min-w-[140px] text-left p-3 rounded-2xl border transition-all duration-150 ${
                isActive
                  ? "bg-blue-50/90 border-blue-500 shadow-xs"
                  : isDone
                  ? "bg-white border-slate-200 hover:bg-slate-50"
                  : "bg-slate-50/60 border-slate-200 text-slate-400 hover:bg-slate-100"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${isActive ? "text-blue-700" : isDone ? "text-emerald-600" : "text-slate-400"}`}>
                  {isDone ? `✓ 0${s.num}` : `0${s.num}`}
                </span>
                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />}
              </div>
              <div className={`text-xs font-bold truncate ${isActive ? "text-slate-900" : isDone ? "text-slate-800" : "text-slate-500"}`}>
                {s.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── STEP 1: BASIC DETAILS ────────────────────────────────────────────── */}
      {currentStep === 1 && (
        <Card className="rounded-2xl border-slate-200 shadow-2xs bg-white">
          <CardContent className="p-6 space-y-6">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                  01 — Basic Details
                </h2>
                <p className="text-xs text-slate-500">Tell us who the solar proposal is for and configure general site parameters.</p>
              </div>
              <Badge variant="outline" className="text-xs font-mono text-blue-700 bg-blue-50">
                {form.proposal_number}
              </Badge>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Left Column: Customer Details */}
              <div className="space-y-4">
                <div className="text-xs font-bold text-blue-900 uppercase tracking-wider">Customer & Contact Information</div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Customer Name *</Label>
                  <Input
                    value={form.customer_name}
                    onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                    placeholder="e.g. Ramesh Patil / Sunrise Enterprises"
                    className="mt-1 h-9 text-xs rounded-xl font-medium"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Mobile Number *</Label>
                    <Input
                      value={form.mobile}
                      onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                      placeholder="10-digit mobile"
                      className="mt-1 h-9 text-xs rounded-xl font-mono"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Email Address</Label>
                    <Input
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="client@gmail.com"
                      className="mt-1 h-9 text-xs rounded-xl"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">Site Installation Address</Label>
                  <Textarea
                    value={form.site_address}
                    onChange={(e) => setForm({ ...form, site_address: e.target.value })}
                    placeholder="Plot / Survey No, Building Name, Street / Landmark"
                    rows={2}
                    className="mt-1 text-xs rounded-xl resize-none"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">City</Label>
                    <Input
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                      placeholder="City"
                      className="mt-1 h-9 text-xs rounded-xl"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">State</Label>
                    <Input
                      value={form.state}
                      onChange={(e) => setForm({ ...form, state: e.target.value })}
                      placeholder="State"
                      className="mt-1 h-9 text-xs rounded-xl"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Pincode</Label>
                    <Input
                      value={form.pincode}
                      onChange={(e) => setForm({ ...form, pincode: e.target.value })}
                      placeholder="416001"
                      className="mt-1 h-9 text-xs rounded-xl font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Right Column: Project Details */}
              <div className="space-y-4">
                <div className="text-xs font-bold text-blue-900 uppercase tracking-wider">Proposal & System Parameters</div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Proposal Date</Label>
                    <Input
                      type="date"
                      value={form.proposal_date}
                      onChange={(e) => setForm({ ...form, proposal_date: e.target.value })}
                      className="mt-1 h-9 text-xs rounded-xl"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Prepared By</Label>
                    <Input
                      value={form.prepared_by}
                      onChange={(e) => setForm({ ...form, prepared_by: e.target.value })}
                      placeholder="Engineer name"
                      className="mt-1 h-9 text-xs rounded-xl"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Project Type</Label>
                    <Select
                      value={form.project_type}
                      onValueChange={(v) => {
                        const isComm = v.toLowerCase().includes("commercial");
                        setForm({
                          ...form,
                          project_type: v,
                          subsidy_applicable: !isComm,
                          subsidy_amount: isComm ? 0 : calculateSubsidy(form.system_kw, v),
                        });
                      }}
                    >
                      <SelectTrigger className="mt-1 h-9 text-xs rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Residential">Residential Rooftop</SelectItem>
                        <SelectItem value="Commercial">Commercial / Industrial</SelectItem>
                        <SelectItem value="Agricultural">Agricultural / Institutional</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Grid Tie Type</Label>
                    <Select
                      value={form.solar_system_type}
                      onValueChange={(v) => setForm({ ...form, solar_system_type: v })}
                    >
                      <SelectTrigger className="mt-1 h-9 text-xs rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Grid Connected / On Grid">Grid Connected / On Grid</SelectItem>
                        <SelectItem value="Hybrid Solar PV">Hybrid (Grid + Battery)</SelectItem>
                        <SelectItem value="Off-Grid Standalone">Off-Grid Standalone</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* System Capacity Slider & Input */}
                <div className="p-4 bg-blue-50/60 rounded-xl border border-blue-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-blue-950">System Capacity (kWp DC) *</Label>
                    <span className="text-sm font-extrabold text-blue-700 font-mono">
                      {form.system_kw} kWp
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="1"
                      max="50"
                      step="0.5"
                      value={form.system_kw}
                      onChange={(e) => handleSystemKwChange(e.target.value)}
                      className="flex-1 accent-blue-600 h-2 bg-blue-200 rounded-lg cursor-pointer"
                    />
                    <Input
                      type="number"
                      step="0.1"
                      min="0.5"
                      value={form.system_kw}
                      onChange={(e) => handleSystemKwChange(e.target.value)}
                      className="w-20 h-8 text-xs font-bold text-center bg-white rounded-lg font-mono"
                    />
                  </div>
                  <p className="text-[11px] text-blue-800">
                    Auto-calculates ~{form.panel?.quantity || 9} modules ({form.panel?.wattage || 555}W) and approx. {formatNumberIN(solarMetrics.annualKwh)} units/year.
                  </p>
                </div>

                {/* Linked Design Banner if active */}
                {form.linked_design_name && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-blue-600" />
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block uppercase">LINKED 3D DESIGN</span>
                        <span className="font-bold text-slate-800">{form.linked_design_name}</span>
                      </div>
                    </div>
                    <Badge className="bg-blue-100 text-blue-800 text-[10px]">Synced</Badge>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <Button
                onClick={() => setCurrentStep(2)}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold h-9 px-5 rounded-xl gap-2 shadow-xs"
              >
                Continue to Solar System <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 2: SOLAR SYSTEM & EQUIPMENT ─────────────────────────────────── */}
      {currentStep === 2 && (
        <Card className="rounded-2xl border-slate-200 shadow-2xs bg-white">
          <CardContent className="p-6 space-y-6">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                  02 — Solar System & Equipment
                </h2>
                <p className="text-xs text-slate-500">Configure Tier-1 PV modules, inverter, structure, and balance of system.</p>
              </div>
              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                {form.system_kw} kWp DC
              </Badge>
            </div>

            {/* Equipment Cards Grid */}
            <div className="grid md:grid-cols-2 gap-5">
              {/* PV MODULE CARD */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <Sun className="w-4 h-4 text-amber-500" />
                    <span className="font-bold text-slate-900 text-xs">Solar PV Modules</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] bg-white font-mono">
                    {form.panel?.quantity} Nos
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px] font-semibold text-slate-600">Brand / Make</Label>
                    <Input
                      value={form.panel?.make}
                      onChange={(e) => setForm({ ...form, panel: { ...form.panel, make: e.target.value } })}
                      placeholder="INA / Waaree / Tata"
                      className="mt-1 h-8 text-xs bg-white rounded-lg"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold text-slate-600">Wattage (Wp)</Label>
                    <Input
                      type="number"
                      value={form.panel?.wattage}
                      onChange={(e) => {
                        const w = Number(e.target.value) || 555;
                        const qty = Math.max(1, Math.round((form.system_kw * 1000) / w));
                        setForm({ ...form, panel: { ...form.panel, wattage: w, quantity: qty } });
                      }}
                      className="mt-1 h-8 text-xs bg-white rounded-lg font-mono"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px] font-semibold text-slate-600">Technology / Type</Label>
                    <Input
                      value={form.panel?.technology}
                      onChange={(e) => setForm({ ...form, panel: { ...form.panel, technology: e.target.value } })}
                      placeholder="TOPCon Bifacial"
                      className="mt-1 h-8 text-xs bg-white rounded-lg"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold text-slate-600">Quantity (Calculated)</Label>
                    <Input
                      type="number"
                      value={form.panel?.quantity}
                      onChange={(e) => setForm({ ...form, panel: { ...form.panel, quantity: Number(e.target.value) || 1 } })}
                      className="mt-1 h-8 text-xs bg-white rounded-lg font-mono font-bold text-blue-700"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600">Model Description</Label>
                  <Input
                    value={form.panel?.model}
                    onChange={(e) => setForm({ ...form, panel: { ...form.panel, model: e.target.value } })}
                    placeholder="555 WP DCR TOPCon Bifacial"
                    className="mt-1 h-8 text-xs bg-white rounded-lg"
                  />
                </div>
              </div>

              {/* INVERTER CARD */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-blue-600" />
                    <span className="font-bold text-slate-900 text-xs">Solar String Inverter</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] bg-white font-mono">
                    {form.inverter?.capacity}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px] font-semibold text-slate-600">Brand / Make</Label>
                    <Input
                      value={form.inverter?.make}
                      onChange={(e) => setForm({ ...form, inverter: { ...form.inverter, make: e.target.value } })}
                      placeholder="UTL / Growatt / Solis"
                      className="mt-1 h-8 text-xs bg-white rounded-lg"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold text-slate-600">Capacity (kW)</Label>
                    <Input
                      value={form.inverter?.capacity}
                      onChange={(e) => setForm({ ...form, inverter: { ...form.inverter, capacity: e.target.value } })}
                      placeholder="5.0 kW"
                      className="mt-1 h-8 text-xs bg-white rounded-lg font-mono"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px] font-semibold text-slate-600">Grid Phase</Label>
                    <Select
                      value={form.inverter?.phase}
                      onValueChange={(v) => setForm({ ...form, inverter: { ...form.inverter, phase: v } })}
                    >
                      <SelectTrigger className="mt-1 h-8 text-xs bg-white rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Single Phase">Single Phase (230V)</SelectItem>
                        <SelectItem value="Three Phase">Three Phase (415V)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold text-slate-600">Inverter Quantity</Label>
                    <Input
                      type="number"
                      value={form.inverter?.quantity || 1}
                      onChange={(e) => setForm({ ...form, inverter: { ...form.inverter, quantity: Number(e.target.value) || 1 } })}
                      className="mt-1 h-8 text-xs bg-white rounded-lg font-mono"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600">Inverter Model Spec</Label>
                  <Input
                    value={form.inverter?.model}
                    onChange={(e) => setForm({ ...form, inverter: { ...form.inverter, model: e.target.value } })}
                    placeholder="Smart On-Grid String Inverter with Wi-Fi"
                    className="mt-1 h-8 text-xs bg-white rounded-lg"
                  />
                </div>
              </div>

              {/* MOUNTING STRUCTURE CARD */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-indigo-600" />
                    <span className="font-bold text-slate-900 text-xs">Mounting Structure</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] bg-white font-mono">
                    {form.structure?.height}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px] font-semibold text-slate-600">Structure Type</Label>
                    <Input
                      value={form.structure?.type}
                      onChange={(e) => setForm({ ...form, structure: { ...form.structure, type: e.target.value } })}
                      placeholder="Elevated Super Structure"
                      className="mt-1 h-8 text-xs bg-white rounded-lg"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold text-slate-600">Clearance Height</Label>
                    <Input
                      value={form.structure?.height}
                      onChange={(e) => setForm({ ...form, structure: { ...form.structure, height: e.target.value } })}
                      placeholder="1.8m Clearance"
                      className="mt-1 h-8 text-xs bg-white rounded-lg"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600">Material Specification</Label>
                  <Input
                    value={form.structure?.material}
                    onChange={(e) => setForm({ ...form, structure: { ...form.structure, material: e.target.value } })}
                    placeholder="Aluminium 6063-T6 & HDGI"
                    className="mt-1 h-8 text-xs bg-white rounded-lg"
                  />
                </div>
              </div>

              {/* CABLES & CONDUITS CARD */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-emerald-600" />
                    <span className="font-bold text-slate-900 text-xs">Solar Cables & Brands</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] bg-white font-mono">
                    Certified
                  </Badge>
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600">Approved Cable Brand</Label>
                  <Input
                    value={form.cables?.brand}
                    onChange={(e) => setForm({ ...form, cables: { ...form.cables, brand: e.target.value } })}
                    placeholder="Polycab / Havells / Siechem"
                    className="mt-1 h-8 text-xs bg-white rounded-lg"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px] font-semibold text-slate-600">Solar DC Cable</Label>
                    <Input
                      value={form.cables?.dcCable}
                      onChange={(e) => setForm({ ...form, cables: { ...form.cables, dcCable: e.target.value } })}
                      className="mt-1 h-8 text-xs bg-white rounded-lg"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold text-slate-600">Armoured AC Cable</Label>
                    <Input
                      value={form.cables?.acCable}
                      onChange={(e) => setForm({ ...form, cables: { ...form.cables, acCable: e.target.value } })}
                      className="mt-1 h-8 text-xs bg-white rounded-lg"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* BALANCE OF SYSTEM (BOS) COMPONENT GRID */}
            <div className="space-y-3 pt-2">
              <div className="text-xs font-bold text-blue-900 uppercase tracking-wider">
                Balance of System (BOS) Package
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                {(form.bos || []).map((b, idx) => (
                  <div key={idx} className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <span className="font-bold text-slate-900 block truncate">{b.name}</span>
                    <span className="text-[10px] text-slate-500 block truncate mt-0.5">{b.spec}</span>
                    <Badge variant="secondary" className="text-[9px] mt-1.5 py-0">
                      {b.qty}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* WARRANTY TABLE */}
            <div className="space-y-3 pt-2">
              <div className="text-xs font-bold text-blue-900 uppercase tracking-wider">
                Comprehensive Warranty Matrix
              </div>
              <div className="rounded-xl border border-slate-200 overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 w-1/3">Component</th>
                      <th className="px-3 py-2">Warranty Period & Terms</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(form.warranties || []).map((w, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2 font-semibold text-slate-800">{w.component}</td>
                        <td className="px-3 py-2 text-blue-800 font-medium">{w.coverage}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-between pt-4 border-t border-slate-100">
              <Button
                variant="outline"
                onClick={() => setCurrentStep(1)}
                className="text-xs font-semibold h-9 rounded-xl"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
              </Button>
              <Button
                onClick={() => setCurrentStep(3)}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold h-9 px-5 rounded-xl gap-2 shadow-xs"
              >
                Continue to Scope & Terms <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 3: SCOPE & TERMS ────────────────────────────────────────────── */}
      {currentStep === 3 && (
        <Card className="rounded-2xl border-slate-200 shadow-2xs bg-white">
          <CardContent className="p-6 space-y-6">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                  03 — Project Scope, Timeline & Terms
                </h2>
                <p className="text-xs text-slate-500">Execution schedule, EPC boundary of work, customer responsibilities, and commercial terms.</p>
              </div>
              <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 text-xs">
                ~56 Days Turnkey
              </Badge>
            </div>

            {/* PROJECT TIMELINE STAGES */}
            <div className="space-y-3">
              <div className="text-xs font-bold text-blue-900 uppercase tracking-wider">
                Turnkey Project Delivery Timeline
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {(form.timeline || []).map((t, idx) => (
                  <div key={idx} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge className="bg-blue-600 text-white text-[10px] py-0">{t.stage}</Badge>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          value={t.days}
                          onChange={(e) => {
                            const next = [...form.timeline];
                            next[idx] = { ...next[idx], days: Number(e.target.value) || 0 };
                            setForm({ ...form, timeline: next });
                          }}
                          className="w-14 h-6 text-xs text-center font-bold font-mono bg-white rounded"
                        />
                        <span className="text-[10px] text-slate-500">Days</span>
                      </div>
                    </div>
                    <div className="font-bold text-slate-900 text-xs">{t.title}</div>
                    <p className="text-[10px] text-slate-500 leading-snug">{t.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* OUR SCOPE VS CUSTOMER SCOPE CHECKLISTS */}
            <div className="grid md:grid-cols-2 gap-6 pt-2">
              {/* Our Scope */}
              <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-200 space-y-3">
                <div className="font-bold text-blue-950 text-xs uppercase tracking-wider flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-600" />
                  Our Scope of Work (Turnkey EPC)
                </div>
                <div className="space-y-2">
                  {(form.our_scope || []).map((item, idx) => (
                    <label key={idx} className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={(e) => {
                          const next = [...form.our_scope];
                          next[idx] = { ...next[idx], checked: e.target.checked };
                          setForm({ ...form, our_scope: next });
                        }}
                        className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                      />
                      <span className={item.checked ? "font-medium" : "text-slate-400 line-through"}>
                        {item.text}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Customer Scope */}
              <div className="p-4 bg-amber-50/50 rounded-2xl border border-amber-200 space-y-3">
                <div className="font-bold text-amber-950 text-xs uppercase tracking-wider flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-amber-600" />
                  Customer Scope of Responsibility
                </div>
                <div className="space-y-2">
                  {(form.customer_scope || []).map((item, idx) => (
                    <label key={idx} className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={(e) => {
                          const next = [...form.customer_scope];
                          next[idx] = { ...next[idx], checked: e.target.checked };
                          setForm({ ...form, customer_scope: next });
                        }}
                        className="mt-0.5 rounded text-amber-600 focus:ring-amber-500 w-3.5 h-3.5"
                      />
                      <span className={item.checked ? "font-medium" : "text-slate-400 line-through"}>
                        {item.text}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* COMMERCIAL TERMS & CONDITIONS */}
            <div className="space-y-3 pt-2">
              <div className="text-xs font-bold text-blue-900 uppercase tracking-wider">
                Standard Commercial Terms & Conditions
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {(form.terms || []).map((t, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
                    <span className="font-bold text-slate-900 block">{t.title}</span>
                    <p className="text-[11px] text-slate-600 leading-relaxed">{t.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between pt-4 border-t border-slate-100">
              <Button
                variant="outline"
                onClick={() => setCurrentStep(2)}
                className="text-xs font-semibold h-9 rounded-xl"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
              </Button>
              <Button
                onClick={() => setCurrentStep(4)}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold h-9 px-5 rounded-xl gap-2 shadow-xs"
              >
                Continue to Financials <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 4: FINANCIALS & SUBSIDY ─────────────────────────────────────── */}
      {currentStep === 4 && (
        <Card className="rounded-2xl border-slate-200 shadow-2xs bg-white">
          <CardContent className="p-6 space-y-6">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                  04 — Commercial Offer & Financials
                </h2>
                <p className="text-xs text-slate-500">Transparent system pricing, PM Surya Ghar subsidy, and milestone schedule.</p>
              </div>
              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-bold">
                Net: {formatINR(netCustomerCost)}
              </Badge>
            </div>

            {/* Cost Breakdown Inputs */}
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="text-xs font-bold text-blue-900 uppercase tracking-wider">System Pricing Breakdown</div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">System Base Price (₹) *</Label>
                  <Input
                    type="number"
                    value={form.system_price}
                    onChange={(e) => setForm({ ...form, system_price: Number(e.target.value) || 0 })}
                    placeholder="250000"
                    className="mt-1 h-9 text-xs rounded-xl font-mono font-bold"
                  />
                  <span className="text-[10px] text-slate-400">Includes PV modules, inverter, structure, cables, and BOS.</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Additional Charges (₹)</Label>
                    <Input
                      type="number"
                      value={form.additional_charges}
                      onChange={(e) => setForm({ ...form, additional_charges: Number(e.target.value) || 0 })}
                      placeholder="0"
                      className="mt-1 h-9 text-xs rounded-xl font-mono"
                    />
                    <span className="text-[10px] text-slate-400">Civil/elevation works</span>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Net Metering / Liaisoning (₹)</Label>
                    <Input
                      type="number"
                      value={form.net_meter_charges}
                      onChange={(e) => setForm({ ...form, net_meter_charges: Number(e.target.value) || 0 })}
                      placeholder="0"
                      className="mt-1 h-9 text-xs rounded-xl font-mono"
                    />
                    <span className="text-[10px] text-slate-400">DISCOM fees</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 items-center">
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">GST Rate (%)</Label>
                    <Select
                      value={String(form.gst_pct)}
                      onValueChange={(v) => setForm({ ...form, gst_pct: Number(v) })}
                    >
                      <SelectTrigger className="mt-1 h-9 text-xs rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="13.8">13.8% (Solar EPC Composite)</SelectItem>
                        <SelectItem value="18">18% (Standard GST)</SelectItem>
                        <SelectItem value="5">5% (Goods Only)</SelectItem>
                        <SelectItem value="0">0% (Nil / Exempt)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">GST Amount (₹)</Label>
                    <div className="mt-1 h-9 bg-slate-100 rounded-xl flex items-center px-3 text-xs font-mono font-bold text-slate-700">
                      {formatINR(gstAmount)}
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-slate-100/80 rounded-xl flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800">Gross Project Cost (With GST):</span>
                  <span className="font-mono font-extrabold text-slate-900 text-sm">{formatINR(grossCost)}</span>
                </div>
              </div>

              {/* Subsidy & Cost to Customer Hero */}
              <div className="space-y-4">
                <div className="text-xs font-bold text-blue-900 uppercase tracking-wider">Government Subsidy & Customer Cost</div>

                {/* Subsidy Toggle & Input */}
                <div className="p-4 bg-emerald-50/70 rounded-2xl border border-emerald-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-emerald-950 text-xs">Central Govt. Subsidy (PM Surya Ghar)</div>
                      <div className="text-[11px] text-emerald-700">Directly credited to consumer bank account</div>
                    </div>
                    <Switch
                      checked={form.subsidy_applicable}
                      onCheckedChange={(v) => {
                        const amt = v ? calculateSubsidy(form.system_kw, form.project_type) : 0;
                        setForm({ ...form, subsidy_applicable: v, subsidy_amount: amt });
                      }}
                    />
                  </div>

                  {form.subsidy_applicable ? (
                    <div>
                      <Label className="text-[11px] font-semibold text-emerald-900">Subsidy Amount (₹)</Label>
                      <Input
                        type="number"
                        value={form.subsidy_amount}
                        onChange={(e) => setForm({ ...form, subsidy_amount: Number(e.target.value) || 0 })}
                        className="mt-1 h-9 text-xs bg-white rounded-xl font-mono font-bold text-emerald-700"
                      />
                      <span className="text-[10px] text-emerald-600 block mt-1">
                        Standard MNRE cap: ₹78,000 for 3kW+ residential plants.
                      </span>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 italic">
                      Subsidy not applicable for this project configuration.
                    </div>
                  )}
                </div>

                {/* PRIMARY HIGHLIGHT: COST TO CUSTOMER */}
                <div className="p-5 bg-gradient-to-br from-blue-900 to-indigo-950 text-white rounded-2xl shadow-md text-center space-y-1">
                  <span className="text-[11px] font-bold text-blue-300 uppercase tracking-wider block">
                    FINAL COST TO CUSTOMER
                  </span>
                  <div className="text-3xl sm:text-4xl font-black text-white tracking-tight" style={{ fontFamily: "Outfit" }}>
                    {formatINR(netCustomerCost)}
                  </div>
                  <p className="text-xs text-blue-200 pt-1">
                    Gross ({formatINR(grossCost)}) − Subsidy ({formatINR(form.subsidy_applicable ? form.subsidy_amount : 0)})
                  </p>
                </div>

                {/* Payback Metric Chip */}
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span className="text-amber-900 font-semibold">Estimated Payback Period:</span>
                  </div>
                  <Badge className="bg-amber-600 text-white font-bold text-xs font-mono">
                    ~{solarMetrics.paybackYears} Years
                  </Badge>
                </div>
              </div>
            </div>

            {/* MILESTONE PAYMENT SCHEDULE */}
            <div className="space-y-3 pt-2">
              <div className="text-xs font-bold text-blue-900 uppercase tracking-wider">
                Milestone Payment Schedule
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {calculatedMilestones.map((mItem, idx) => (
                  <div key={mItem.id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-blue-900 text-xs">{mItem.stage}</span>
                      <span className="text-xs font-bold font-mono text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                        {mItem.pct}%
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 leading-tight">{mItem.label}</div>
                    <div className="text-sm font-extrabold text-slate-900 font-mono pt-1">
                      {formatINR(mItem.amount)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between pt-4 border-t border-slate-100">
              <Button
                variant="outline"
                onClick={() => setCurrentStep(3)}
                className="text-xs font-semibold h-9 rounded-xl"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
              </Button>
              <Button
                onClick={() => setCurrentStep(5)}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold h-9 px-5 rounded-xl gap-2 shadow-xs"
              >
                Review Proposal <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 5: REVIEW & GENERATE ────────────────────────────────────────── */}
      {currentStep === 5 && (
        <Card className="rounded-2xl border-slate-200 shadow-2xs bg-white">
          <CardContent className="p-6 space-y-6">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                  05 — Review Proposal
                </h2>
                <p className="text-xs text-slate-500">Verify all customer, technical, and financial details before generating the final document.</p>
              </div>
              <Badge className="bg-blue-600 text-white text-xs">
                Ready to Generate
              </Badge>
            </div>

            {/* Review Cards Grid */}
            <div className="grid md:grid-cols-3 gap-4 text-xs">
              {/* Card 1: Customer & Site */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                  <span className="font-bold text-blue-900 uppercase text-[10px]">Customer & Site</span>
                  <button onClick={() => setCurrentStep(1)} className="text-blue-600 hover:underline text-[11px] font-semibold">
                    Edit
                  </button>
                </div>
                <div className="font-bold text-slate-900 text-sm">{form.customer_name || "—"}</div>
                <div className="text-slate-600">{form.site_address || "No address"}</div>
                <div className="text-slate-500">Ph: {form.mobile || "—"}</div>
                <div className="text-slate-500">{form.city}, {form.state}</div>
              </div>

              {/* Card 2: Solar System */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                  <span className="font-bold text-blue-900 uppercase text-[10px]">Solar Equipment</span>
                  <button onClick={() => setCurrentStep(2)} className="text-blue-600 hover:underline text-[11px] font-semibold">
                    Edit
                  </button>
                </div>
                <div className="font-bold text-slate-900 text-sm">{form.system_kw} kWp DC Plant</div>
                <div className="text-slate-600">{form.panel?.quantity} × {form.panel?.wattage}W {form.panel?.make}</div>
                <div className="text-slate-600">{form.inverter?.make} ({form.inverter?.capacity})</div>
                <div className="text-slate-500">{form.structure?.type}</div>
              </div>

              {/* Card 3: Financials & Cost */}
              <div className="p-4 bg-blue-50/60 rounded-2xl border border-blue-200 space-y-2">
                <div className="flex items-center justify-between border-b border-blue-200 pb-1.5">
                  <span className="font-bold text-blue-950 uppercase text-[10px]">Commercial Offer</span>
                  <button onClick={() => setCurrentStep(4)} className="text-blue-600 hover:underline text-[11px] font-semibold">
                    Edit
                  </button>
                </div>
                <div className="flex justify-between text-slate-600"><span>Gross Cost:</span> <span>{formatINR(grossCost)}</span></div>
                <div className="flex justify-between text-emerald-700 font-semibold"><span>Govt. Subsidy:</span> <span>- {formatINR(form.subsidy_applicable ? form.subsidy_amount : 0)}</span></div>
                <div className="pt-1 border-t border-blue-200 flex justify-between font-black text-blue-900 text-sm">
                  <span>Customer Cost:</span> <span>{formatINR(netCustomerCost)}</span>
                </div>
                <div className="text-[10px] text-blue-700">~{solarMetrics.paybackYears} Yrs Payback · {formatNumberIN(solarMetrics.annualKwh)} units/yr</div>
              </div>
            </div>

            {/* Review Action Card */}
            <div className="p-6 bg-slate-900 text-white rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
              <div>
                <div className="text-base font-bold" style={{ fontFamily: "Outfit" }}>Generate Final Customer Proposal</div>
                <p className="text-xs text-slate-300 mt-0.5">
                  Publishes the official 11-page A4 proposal, generates ReportLab PDF, and saves document record.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPreviewModal(true)}
                  className="border-slate-700 bg-slate-800 text-white text-xs h-9 px-4 rounded-xl"
                >
                  <Eye className="w-3.5 h-3.5 mr-1.5" /> Preview
                </Button>
                <Button
                  size="sm"
                  onClick={handleGenerateProposal}
                  disabled={generating}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold h-9 px-5 rounded-xl shadow-md gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  {generating ? "Generating Proposal…" : "Generate Proposal"}
                </Button>
              </div>
            </div>

            <div className="flex justify-between pt-4 border-t border-slate-100">
              <Button
                variant="outline"
                onClick={() => setCurrentStep(4)}
                className="text-xs font-semibold h-9 rounded-xl"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 11-PAGE PROPOSAL FULLSCREEN VIEWER / PREVIEW MODAL ──────────────── */}
      {showPreviewModal && (
        <Dialog open onOpenChange={() => setShowPreviewModal(false)}>
          <DialogContent className="max-w-6xl w-[96vw] h-[94vh] p-0 overflow-hidden bg-slate-950 border-slate-800 flex flex-col">
            <ProposalDocumentViewer
              proposalData={{
                ...form,
                gross_cost: grossCost,
                gst_amount: gstAmount,
                net_customer_cost: netCustomerCost,
                milestones: calculatedMilestones,
              }}
              companyData={companyData}
              metrics={solarMetrics}
              onClose={() => setShowPreviewModal(false)}
              onDownloadPdf={handleDownloadPdf}
              downloading={generating}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
