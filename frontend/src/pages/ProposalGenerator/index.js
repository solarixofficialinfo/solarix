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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import dayjs from "dayjs";
import {
  FileText, Sparkles, Sun, Zap, CheckCircle2, ArrowLeft,
  Download, Eye, RefreshCw, Layers, UserPlus, Users2,
  ShieldCheck, TreePine, Leaf, DollarSign, Calendar, Clock,
  MapPin, Phone, Mail, Building2, Check, AlertCircle, Save,
  Plus, X, Copy, ExternalLink, SlidersHorizontal, ChevronDown,
  ChevronUp, ChevronRight, FileCheck, Layers3, CheckSquare
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

const DRAFT_STORAGE_KEY = "solarix_proposal_generator_draft_v3";

export default function ProposalGenerator() {
  const location = useLocation();
  const nav = useNavigate();
  const { user } = useAuth();

  // Master queries
  const { data: companyData } = useCompany();
  const { data: clients = [] } = useClientList();
  const { refetch: refetchHistory } = useSalesDocuments("proposal");

  // Accordion Section Expansion State
  const [expandedSections, setExpandedSections] = useState({
    customer: true,
    system: true,
    equipment: true,
    commercial: true,
    roi: true,
    scope: false,
    terms: false,
  });

  const toggleSection = (sec) => {
    setExpandedSections((prev) => ({ ...prev, [sec]: !prev[sec] }));
  };

  const expandAll = () => {
    setExpandedSections({
      customer: true,
      system: true,
      equipment: true,
      commercial: true,
      roi: true,
      scope: true,
      terms: true,
    });
  };

  const collapseAll = () => {
    setExpandedSections({
      customer: false,
      system: false,
      equipment: false,
      commercial: false,
      roi: false,
      scope: false,
      terms: false,
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
    const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }

    const todayStr = dayjs().format("YYYY-MM-DD");
    const refNum = `PROP-${dayjs().format("YYMMDD")}-${Math.floor(1000 + Math.random() * 9000)}`;

    return {
      // 1. Customer & Project Details
      template_id: "template1", // 'template1' (Solar Professional) | 'template2' (Modern Solar)
      proposal_number: refNum,
      proposal_date: todayStr,
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

      // 2. Solar System Details
      system_kw: 10.0,
      roof_area_sqm: 41.4,
      tilt_deg: 15,
      azimuth_deg: 180,
      mounting_clearance_m: 1.8,
      snapshot_2d: "",
      snapshot_3d: "",
      linked_design_id: "",
      linked_design_name: "",

      // 3. Equipment & Warranty
      panel: { ...DEFAULT_PANEL_DATA, quantity: 18 },
      inverter: { ...DEFAULT_INVERTER_DATA, capacity: "10.0 kW", quantity: 1 },
      structure: { ...DEFAULT_STRUCTURE_DATA },
      cables: { ...DEFAULT_CABLES_DATA },
      bos: [...DEFAULT_BOS_COMPONENTS],
      warranties: [...DEFAULT_WARRANTIES],

      // 4. Commercial & Payment
      system_price: 500000,
      additional_charges: 0,
      net_meter_charges: 0,
      gst_pct: 13.8,
      subsidy_applicable: false,
      subsidy_amount: 0,
      milestones: [
        { stage: "Milestone 1", label: "20% Advance with Order Confirmation", pct: 20 },
        { stage: "Milestone 2", label: "70% Upon Material Readiness & Site Dispatch", pct: 70 },
        { stage: "Milestone 3", label: "5% Upon Complete Installation & Wiring", pct: 5 },
        { stage: "Milestone 4", label: "5% Upon Net-Meter Installation & Commissioning", pct: 5 },
      ],

      // 5. Energy Generation & ROI
      tariff_rate: 8.5,

      // 6. Scope & Timeline
      timeline: [...DEFAULT_TIMELINE_STAGES],
      our_scope: [...DEFAULT_OUR_SCOPE],
      customer_scope: [...DEFAULT_CUSTOMER_SCOPE],

      // 7. Terms & Conditions
      terms: [...DEFAULT_TERMS],
    };
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
      setExpandedSections((prev) => ({ ...prev, customer: true }));
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
      refetchHistory();
      toast.success("11-Page Customer Proposal PDF generated successfully!");

      if (res.data?.id) {
        downloadFile(`/documents/${res.data.id}/download`, res.data.filename || "Solar_Proposal.pdf");
      }
    } catch (err) {
      toast.error("Proposal generation failed: " + formatApiError(err));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto px-2 sm:px-4 pb-20 select-none">

      {/* ── TOP HEADER BAR ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs">
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
              <span>Proposal No: <b className="font-mono text-slate-800">{form.proposal_number}</b></span>
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
            title="Open Complete 11-Page Customer Proposal Document Viewer"
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

      {/* ── EXPAND / COLLAPSE TOOLBAR & QUICK AUTOFILL ─────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-600">Autofill from:</span>
          <Select value={sourceType} onValueChange={setSourceType}>
            <SelectTrigger className="h-7 text-xs rounded-lg bg-white border-slate-200 w-[150px]">
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
              <SelectTrigger className="h-7 text-xs rounded-lg bg-white border-blue-300 w-[200px]">
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
              <SelectTrigger className="h-7 text-xs rounded-lg bg-white border-blue-300 w-[200px]">
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
              <SelectTrigger className="h-7 text-xs rounded-lg bg-white border-blue-300 w-[200px]">
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

        <div className="flex items-center gap-2">
          <button onClick={expandAll} className="hover:text-blue-600 font-medium">
            Expand All
          </button>
          <span>•</span>
          <button onClick={collapseAll} className="hover:text-blue-600 font-medium">
            Collapse All
          </button>
        </div>
      </div>

      {/* ── PROPOSAL DESIGN TEMPLATE / THEME SELECTOR ──────────────────────── */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600" />
            <span>Proposal Design Template</span>
          </span>
          <span className="text-[10.5px] text-slate-500">
            Choose presentation theme before previewing or generating PDF
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Template 01 */}
          <div
            onClick={() => {
              setForm((prev) => ({ ...prev, template_id: "template1" }));
              setIsSavedDraft(false);
            }}
            className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 ${
              (form.template_id || "template1") === "template1"
                ? "border-blue-600 bg-blue-50/50 shadow-xs"
                : "border-slate-200 hover:border-slate-300 bg-white"
            }`}
          >
            <div className="w-10 h-12 rounded-lg bg-sky-500 text-white flex flex-col justify-between p-1 shadow-xs shrink-0">
              <div className="w-full h-1 bg-white/40 rounded-full" />
              <div className="text-[7px] font-bold text-center">PROOF</div>
              <div className="w-3 h-3 bg-white text-sky-700 text-[7px] font-bold rounded-xs flex items-center justify-center self-end">1</div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">Template 01 · Solar Professional</span>
                {(form.template_id || "template1") === "template1" && (
                  <Badge className="bg-blue-600 text-white text-[9px] px-1.5 py-0">✓ Selected</Badge>
                )}
              </div>
              <p className="text-[10.5px] text-slate-500 mt-0.5 leading-snug">
                Reference PDF style: clean white background, cyan/blue accents, structured investment summary and blue page tab.
              </p>
            </div>
          </div>

          {/* Template 02 */}
          <div
            onClick={() => {
              setForm((prev) => ({ ...prev, template_id: "template2" }));
              setIsSavedDraft(false);
            }}
            className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 ${
              form.template_id === "template2"
                ? "border-blue-600 bg-blue-50/50 shadow-xs"
                : "border-slate-200 hover:border-slate-300 bg-white"
            }`}
          >
            <div className="w-10 h-12 rounded-lg bg-slate-950 text-white flex flex-col justify-between p-1 shadow-xs shrink-0 border border-slate-800">
              <div className="w-full h-1 bg-amber-400 rounded-full" />
              <div className="text-[7px] font-bold text-center text-amber-400">SOLAR</div>
              <div className="w-3 h-3 bg-blue-600 text-white text-[7px] font-bold rounded-xs flex items-center justify-center self-end">2</div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">Template 02 · Modern Solar</span>
                {form.template_id === "template2" && (
                  <Badge className="bg-blue-600 text-white text-[9px] px-1.5 py-0">✓ Selected</Badge>
                )}
              </div>
              <p className="text-[10.5px] text-slate-500 mt-0.5 leading-snug">
                Modern solar visual language: deep navy & slate palette with solar amber accents and framed metric cards.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* SECTION 1: CUSTOMER & PROJECT DETAILS                                 */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      <Card className="rounded-2xl border-slate-200/90 shadow-2xs overflow-hidden">
        <div
          onClick={() => toggleSection("customer")}
          className="p-3.5 sm:p-4 bg-slate-50/70 hover:bg-slate-100/70 flex items-center justify-between cursor-pointer transition select-none"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs">
              👤
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <span>Customer & Project Details</span>
                {form.customer_name && (
                  <span className="text-[11px] font-normal text-slate-500">· {form.customer_name}</span>
                )}
              </h3>
              <p className="text-[10.5px] text-slate-500">Customer contact information, site address and project classification</p>
            </div>
          </div>
          {expandedSections.customer ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>

        {expandedSections.customer && (
          <CardContent className="p-4 pt-3 border-t border-slate-100 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <Label className="text-[11px] font-semibold text-slate-600">Customer Name *</Label>
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

              <div className="sm:col-span-2">
                <Label className="text-[11px] font-semibold text-slate-600">Site Address *</Label>
                <Input
                  value={form.site_address}
                  onChange={(e) => { setForm({ ...form, site_address: e.target.value }); setIsSavedDraft(false); }}
                  placeholder="Full site location / rooftop address"
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
                  placeholder="Solar Engineer Name"
                  className="h-8 text-xs mt-1"
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* SECTION 2: SOLAR SYSTEM DETAILS                                       */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      <Card className="rounded-2xl border-slate-200/90 shadow-2xs overflow-hidden">
        <div
          onClick={() => toggleSection("system")}
          className="p-3.5 sm:p-4 bg-slate-50/70 hover:bg-slate-100/70 flex items-center justify-between cursor-pointer transition select-none"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs">
              ☀
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <span>Solar System Details</span>
                <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] font-mono">
                  {form.system_kw} kWp
                </Badge>
              </h3>
              <p className="text-[10.5px] text-slate-500">System capacity, module count, orientation, roof area & 3D layout snapshots</p>
            </div>
          </div>
          {expandedSections.system ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>

        {expandedSections.system && (
          <CardContent className="p-4 pt-3 border-t border-slate-100 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div>
                <Label className="text-[10.5px] text-slate-600 font-semibold">Capacity (kWp) *</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.system_kw}
                  onChange={(e) => {
                    const kw = parseFloat(e.target.value) || 1;
                    const pCount = Math.max(1, Math.round((kw * 1000) / (form.panel?.wattage || 555)));
                    setForm({
                      ...form,
                      system_kw: kw,
                      panel: { ...form.panel, quantity: pCount },
                      inverter: { ...form.inverter, capacity: `${kw}.0 kW` },
                    });
                    setIsSavedDraft(false);
                  }}
                  className="h-8 text-xs font-bold mt-1"
                />
              </div>

              <div>
                <Label className="text-[10.5px] text-slate-600 font-semibold">Module Quantity</Label>
                <Input
                  type="number"
                  value={form.panel?.quantity || 18}
                  onChange={(e) => {
                    const q = parseInt(e.target.value) || 1;
                    setForm({ ...form, panel: { ...form.panel, quantity: q } });
                    setIsSavedDraft(false);
                  }}
                  className="h-8 text-xs mt-1"
                />
              </div>

              <div>
                <Label className="text-[10.5px] text-slate-600 font-semibold">Tilt Angle (°)</Label>
                <Input
                  type="number"
                  value={form.tilt_deg || 15}
                  onChange={(e) => { setForm({ ...form, tilt_deg: parseFloat(e.target.value) || 15 }); setIsSavedDraft(false); }}
                  className="h-8 text-xs mt-1"
                />
              </div>

              <div>
                <Label className="text-[10.5px] text-slate-600 font-semibold">Roof Area (m²)</Label>
                <Input
                  type="number"
                  value={form.roof_area_sqm || 41.4}
                  onChange={(e) => { setForm({ ...form, roof_area_sqm: parseFloat(e.target.value) || 40 }); setIsSavedDraft(false); }}
                  className="h-8 text-xs mt-1"
                />
              </div>
            </div>

            {/* Quick kW Presets */}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[10.5px] text-slate-500 font-medium">Quick Presets:</span>
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
                  className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition ${
                    form.system_kw === kw
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                  }`}
                >
                  {kw} kW
                </button>
              ))}
            </div>

            {/* 2D / 3D Layout Thumbnails */}
            {(form.snapshot_2d || form.snapshot_3d) && (
              <div className="pt-2 border-t border-slate-100">
                <span className="text-[10.5px] text-slate-500 font-semibold block mb-1.5">3D Solar Designer Snapshots:</span>
                <div className="grid grid-cols-2 gap-2">
                  {form.snapshot_2d && (
                    <div className="rounded-lg overflow-hidden border border-slate-200 aspect-video relative">
                      <img src={form.snapshot_2d} alt="2D Roof Plan" className="w-full h-full object-cover" />
                      <span className="absolute bottom-1 left-1 bg-black/70 text-white text-[8px] px-1.5 py-0.5 rounded font-mono">
                        2D Layout
                      </span>
                    </div>
                  )}
                  {form.snapshot_3d && (
                    <div className="rounded-lg overflow-hidden border border-slate-200 aspect-video relative">
                      <img src={form.snapshot_3d} alt="3D Simulation" className="w-full h-full object-cover" />
                      <span className="absolute bottom-1 left-1 bg-black/70 text-white text-[8px] px-1.5 py-0.5 rounded font-mono">
                        3D Simulation
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* SECTION 3: EQUIPMENT & WARRANTY                                       */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      <Card className="rounded-2xl border-slate-200/90 shadow-2xs overflow-hidden">
        <div
          onClick={() => toggleSection("equipment")}
          className="p-3.5 sm:p-4 bg-slate-50/70 hover:bg-slate-100/70 flex items-center justify-between cursor-pointer transition select-none"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
              ⚡
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">Equipment Specifications & Warranties</h3>
              <p className="text-[10.5px] text-slate-500">Tier-1 PV modules, inverters, mounting structures, cabling and Balance of System</p>
            </div>
          </div>
          {expandedSections.equipment ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>

        {expandedSections.equipment && (
          <CardContent className="p-4 pt-3 border-t border-slate-100 space-y-3">
            <div className="grid sm:grid-cols-2 gap-2.5 text-xs">
              {/* PV Module Card */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-blue-700 uppercase">Solar Module</span>
                  <button
                    onClick={() => setEditingEquipmentType("panel")}
                    className="text-[10.5px] text-blue-600 hover:text-blue-800 font-bold"
                  >
                    Edit
                  </button>
                </div>
                <div className="font-bold text-slate-900 text-[11.5px]">{form.panel?.make || "INA Solar"}</div>
                <div className="text-[10.5px] text-slate-600">{form.panel?.model || "555W DCR TOPCon Bifacial"}</div>
                <div className="flex justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-200/60">
                  <span>Qty: <b>{form.panel?.quantity || 18} Nos</b></span>
                  <span>Wattage: <b>{form.panel?.wattage || 555}W</b></span>
                </div>
                <div className="text-[9.5px] text-emerald-700 font-medium">
                  🛡️ {form.panel?.warrantyProductYears || 12}Y Product / {form.panel?.warrantyPerformanceYears || 30}Y Linear
                </div>
              </div>

              {/* Inverter Card */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-amber-700 uppercase">Solar Inverter</span>
                  <button
                    onClick={() => setEditingEquipmentType("inverter")}
                    className="text-[10.5px] text-blue-600 hover:text-blue-800 font-bold"
                  >
                    Edit
                  </button>
                </div>
                <div className="font-bold text-slate-900 text-[11.5px]">{form.inverter?.make || "UTL Solar"}</div>
                <div className="text-[10.5px] text-slate-600">{form.inverter?.model || "Smart Grid-Tied Inverter"}</div>
                <div className="flex justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-200/60">
                  <span>Rating: <b>{form.inverter?.capacity || "10.0 kW"}</b></span>
                  <span>Phase: <b>{form.inverter?.phase || "Three Phase"}</b></span>
                </div>
                <div className="text-[9.5px] text-emerald-700 font-medium">
                  🛡️ {form.inverter?.warrantyYears || 10} Years Comprehensive Warranty
                </div>
              </div>

              {/* Structure Card */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-slate-700 uppercase">Mounting Structure</span>
                  <button
                    onClick={() => setEditingEquipmentType("structure")}
                    className="text-[10.5px] text-blue-600 hover:text-blue-800 font-bold"
                  >
                    Edit
                  </button>
                </div>
                <div className="font-bold text-slate-900 text-[11.5px]">{form.structure?.type || "Elevated Super Structure"}</div>
                <div className="text-[10.5px] text-slate-600">{form.structure?.material || "Aluminium 6063-T6 & HDGI"}</div>
                <div className="flex justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-200/60">
                  <span>Clearance: <b>{form.structure?.height || "1.8m"}</b></span>
                  <span>Wind: <b>150 km/h</b></span>
                </div>
              </div>

              {/* Cables & BOS */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-purple-700 uppercase">Cabling & BOS</span>
                  <button
                    onClick={() => {
                      setCustomItemForm({ name: "", spec: "", qty: "1 Nos" });
                      setEditingEquipmentType("custom");
                    }}
                    className="text-[10.5px] text-blue-600 hover:text-blue-800 font-bold"
                  >
                    + Add BOS
                  </button>
                </div>
                <div className="font-bold text-slate-900 text-[11.5px]">Polycab / Havells / Siechem</div>
                <div className="text-[10.5px] text-slate-600 truncate">{form.cables?.dcCable || "4/6 sq.mm Tinned Copper DC Cable"}</div>
                <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-200/60">
                  BOS Items: <b>{(form.bos || []).length} safety components</b> (ACDB, DCDB, Chemical Earth, LA)
                </div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* SECTION 4: COMMERCIAL & PAYMENT MILESTONES                            */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      <Card className="rounded-2xl border-slate-200/90 shadow-2xs overflow-hidden">
        <div
          onClick={() => toggleSection("commercial")}
          className="p-3.5 sm:p-4 bg-slate-50/70 hover:bg-slate-100/70 flex items-center justify-between cursor-pointer transition select-none"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-800 flex items-center justify-center font-bold text-xs">
              💰
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <span>Commercial Cost & Payment Milestones</span>
                <span className="text-[11px] font-bold text-emerald-700">
                  · Net: {formatINR(metrics.netCustomerCost)}
                </span>
              </h3>
              <p className="text-[10.5px] text-slate-500">Project cost, GST, central subsidy calculation and milestone schedule</p>
            </div>
          </div>
          {expandedSections.commercial ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>

        {expandedSections.commercial && (
          <CardContent className="p-4 pt-3 border-t border-slate-100 space-y-4">
            {/* Commercial Breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="space-y-2">
                <div>
                  <Label className="text-[10.5px] text-slate-600 font-semibold">Base Package (₹)</Label>
                  <Input
                    type="number"
                    step="1000"
                    value={form.system_price}
                    onChange={(e) => { setForm({ ...form, system_price: parseFloat(e.target.value) || 0 }); setIsSavedDraft(false); }}
                    className="h-8 text-xs font-bold mt-1"
                  />
                </div>

                <div>
                  <Label className="text-[10.5px] text-slate-600 font-semibold">Additional Structural / Civil (₹)</Label>
                  <Input
                    type="number"
                    step="500"
                    value={form.additional_charges || 0}
                    onChange={(e) => { setForm({ ...form, additional_charges: parseFloat(e.target.value) || 0 }); setIsSavedDraft(false); }}
                    className="h-8 text-xs mt-1"
                  />
                </div>

                <div>
                  <Label className="text-[10.5px] text-slate-600 font-semibold">DISCOM / Net Metering (₹)</Label>
                  <Input
                    type="number"
                    step="500"
                    value={form.net_meter_charges || 0}
                    onChange={(e) => { setForm({ ...form, net_meter_charges: parseFloat(e.target.value) || 0 }); setIsSavedDraft(false); }}
                    className="h-8 text-xs mt-1"
                  />
                </div>
              </div>

              {/* Financial Summary Card */}
              <div className="bg-slate-900 text-white p-3.5 rounded-xl space-y-2 flex flex-col justify-between">
                <div>
                  <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider block">Financial Summary</span>
                  <div className="divide-y divide-slate-800 text-[11px] mt-1 space-y-1">
                    <div className="flex justify-between py-1 text-slate-300">
                      <span>Gross Project Cost</span>
                      <span className="font-bold text-white">{formatINR(metrics.grossCost)}</span>
                    </div>
                    <div className="flex justify-between py-1 text-slate-300">
                      <span>GST ({form.gst_pct}%)</span>
                      <span className="font-bold text-white">{formatINR(metrics.gstAmount)}</span>
                    </div>
                    <div className="flex justify-between py-1 text-emerald-400">
                      <span>Central Subsidy</span>
                      <span className="font-bold">{form.subsidy_applicable ? formatINR(form.subsidy_amount) : "₹0"}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-700 flex justify-between items-center">
                  <span className="text-[11px] font-bold text-slate-300 uppercase">Net Customer Cost</span>
                  <span className="text-base font-black text-white" style={{ fontFamily: "Outfit" }}>
                    {formatINR(metrics.netCustomerCost)}
                  </span>
                </div>
              </div>
            </div>

            {/* Subsidy Toggle */}
            <div className="flex items-center justify-between p-2.5 bg-blue-50/70 rounded-xl border border-blue-200 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-blue-950">Apply Central Subsidy (PM Surya Ghar):</span>
                <span className="text-blue-700 text-[11px]">
                  {form.subsidy_applicable ? `${formatINR(form.subsidy_amount)} eligible` : "Disabled"}
                </span>
              </div>
              <Switch
                checked={form.subsidy_applicable}
                onCheckedChange={(val) => {
                  const subAmt = val ? calculateSubsidy(form.system_kw, form.project_type) : 0;
                  setForm({ ...form, subsidy_applicable: val, subsidy_amount: subAmt });
                  setIsSavedDraft(false);
                }}
              />
            </div>

            {/* Payment Milestones */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">
                  Payment Milestones (Total: {milestoneTotalPct}%)
                </span>
                <button
                  onClick={() => {
                    setNewMilestoneForm({ stage: `Milestone ${(form.milestones || []).length + 1}`, label: "", pct: 10 });
                    setShowAddMilestoneModal(true);
                  }}
                  className="text-xs text-blue-600 hover:text-blue-800 font-bold"
                >
                  + Add Milestone
                </button>
              </div>

              <div className="grid sm:grid-cols-2 gap-2 text-xs">
                {(form.milestones || []).map((m, idx) => {
                  const amt = metrics.netCustomerCost * (Number(m.pct) / 100);
                  return (
                    <div key={idx} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex justify-between items-center gap-2">
                      <div className="min-w-0">
                        <span className="text-[9.5px] font-bold text-blue-700 uppercase block">{m.stage}</span>
                        <div className="font-semibold text-slate-800 text-[11px] truncate">{m.label}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-bold text-slate-900 text-xs">{formatINR(amt)}</div>
                        <div className="text-[9.5px] text-slate-500 font-medium">({m.pct}%)</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* SECTION 5: ENERGY GENERATION, SAVINGS & ROI                           */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      <Card className="rounded-2xl border-slate-200/90 shadow-2xs overflow-hidden">
        <div
          onClick={() => toggleSection("roi")}
          className="p-3.5 sm:p-4 bg-slate-50/70 hover:bg-slate-100/70 flex items-center justify-between cursor-pointer transition select-none"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-xs">
              📈
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">Energy Generation, Savings & ROI</h3>
              <p className="text-[10.5px] text-slate-500">Annual production, tariff electricity savings, payback period and CO₂ offset</p>
            </div>
          </div>
          {expandedSections.roi ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>

        {expandedSections.roi && (
          <CardContent className="p-4 pt-3 border-t border-slate-100 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
              <div className="p-2.5 bg-blue-50/80 rounded-xl border border-blue-200">
                <span className="text-[9.5px] font-bold text-blue-700 uppercase block">Annual Generation</span>
                <div className="text-base font-black text-blue-950 mt-0.5">{formatNumberIN(metrics.annualKwh)}</div>
                <span className="text-[9px] text-slate-500">kWh / Year</span>
              </div>

              <div className="p-2.5 bg-emerald-50/80 rounded-xl border border-emerald-200">
                <span className="text-[9.5px] font-bold text-emerald-700 uppercase block">Annual Savings</span>
                <div className="text-base font-black text-emerald-950 mt-0.5">{formatINR(metrics.annualSavings)}</div>
                <span className="text-[9px] text-slate-500">@ ₹{form.tariff_rate}/kWh</span>
              </div>

              <div className="p-2.5 bg-indigo-50/80 rounded-xl border border-indigo-200">
                <span className="text-[9.5px] font-bold text-indigo-700 uppercase block">Estimated Payback</span>
                <div className="text-base font-black text-indigo-950 mt-0.5">{metrics.paybackYears} Yrs</div>
                <span className="text-[9px] text-slate-500">Simple ROI</span>
              </div>

              <div className="p-2.5 bg-amber-50/80 rounded-xl border border-amber-200">
                <span className="text-[9.5px] font-bold text-amber-700 uppercase block">CO₂ Offset</span>
                <div className="text-base font-black text-amber-950 mt-0.5">{metrics.co2Tons} Tons</div>
                <span className="text-[9px] text-slate-500">~{metrics.treesCount} Trees/Yr</span>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between text-xs text-slate-600">
              <span className="font-medium">Electricity Grid Tariff:</span>
              <div className="flex items-center gap-1.5">
                <span className="font-bold">₹</span>
                <Input
                  type="number"
                  step="0.1"
                  value={form.tariff_rate || 8.5}
                  onChange={(e) => { setForm({ ...form, tariff_rate: parseFloat(e.target.value) || 8.5 }); setIsSavedDraft(false); }}
                  className="w-20 h-7 text-xs font-bold text-right"
                />
                <span className="text-[11px] text-slate-500">/ kWh</span>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* SECTION 6: SCOPE MATRIX & TIMELINE                                    */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      <Card className="rounded-2xl border-slate-200/90 shadow-2xs overflow-hidden">
        <div
          onClick={() => toggleSection("scope")}
          className="p-3.5 sm:p-4 bg-slate-50/70 hover:bg-slate-100/70 flex items-center justify-between cursor-pointer transition select-none"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-orange-100 text-orange-800 flex items-center justify-center font-bold text-xs">
              📋
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">Scope Matrix & Project Timeline</h3>
              <p className="text-[10.5px] text-slate-500">Scope of work checklist, customer deliverables and 4-phase delivery schedule</p>
            </div>
          </div>
          {expandedSections.scope ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>

        {expandedSections.scope && (
          <CardContent className="p-4 pt-3 border-t border-slate-100 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              {/* EPC Scope */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-emerald-800 text-[11px]">EPC Scope (Included)</span>
                  <button
                    onClick={() => {
                      setScopeTargetType("our");
                      setNewScopeText("");
                      setShowAddScopeModal(true);
                    }}
                    className="text-[10.5px] text-blue-600 hover:text-blue-800 font-bold"
                  >
                    + Add Item
                  </button>
                </div>
                <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                  {(form.our_scope || []).map((item, idx) => {
                    const text = typeof item === "string" ? item : item?.text || "";
                    return (
                      <div key={idx} className="flex justify-between items-center text-[10.5px] text-slate-700 py-0.5">
                        <span className="truncate pr-2">✓ {text}</span>
                        <button
                          onClick={() => setForm({ ...form, our_scope: form.our_scope.filter((_, i) => i !== idx) })}
                          className="text-slate-400 hover:text-red-500"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Customer Scope */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-amber-800 text-[11px]">Customer Deliverables</span>
                  <button
                    onClick={() => {
                      setScopeTargetType("customer");
                      setNewScopeText("");
                      setShowAddScopeModal(true);
                    }}
                    className="text-[10.5px] text-blue-600 hover:text-blue-800 font-bold"
                  >
                    + Add Item
                  </button>
                </div>
                <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                  {(form.customer_scope || []).map((item, idx) => {
                    const text = typeof item === "string" ? item : item?.text || "";
                    return (
                      <div key={idx} className="flex justify-between items-center text-[10.5px] text-slate-700 py-0.5">
                        <span className="truncate pr-2">• {text}</span>
                        <button
                          onClick={() => setForm({ ...form, customer_scope: form.customer_scope.filter((_, i) => i !== idx) })}
                          className="text-slate-400 hover:text-red-500"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div className="pt-2 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {(form.timeline || []).map((t, idx) => (
                <div key={idx} className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-[9.5px] font-bold text-blue-700 uppercase">{t.stage} ({t.days}d)</div>
                  <div className="font-semibold text-slate-800 text-[10.5px] truncate mt-0.5">{t.title}</div>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* SECTION 7: TERMS & ACCEPTANCE                                         */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      <Card className="rounded-2xl border-slate-200/90 shadow-2xs overflow-hidden">
        <div
          onClick={() => toggleSection("terms")}
          className="p-3.5 sm:p-4 bg-slate-50/70 hover:bg-slate-100/70 flex items-center justify-between cursor-pointer transition select-none"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-slate-200 text-slate-800 flex items-center justify-center font-bold text-xs">
              📄
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">Terms & Conditions & Acceptance</h3>
              <p className="text-[10.5px] text-slate-500">Commercial parameters, validity, civil grouting, DISCOM policies and signoff</p>
            </div>
          </div>
          {expandedSections.terms ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>

        {expandedSections.terms && (
          <CardContent className="p-4 pt-3 border-t border-slate-100 space-y-3">
            <div className="space-y-1.5 text-xs text-slate-600 max-h-56 overflow-y-auto pr-1">
              {(form.terms || []).map((term, idx) => (
                <div key={idx} className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-900 text-[11px] block">{idx + 1}. {term.title}</span>
                  <span className="text-[10px] text-slate-600">{term.desc}</span>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── BOTTOM ACTIONS ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (window.confirm("Clear all fields and reset draft?")) {
              localStorage.removeItem(DRAFT_STORAGE_KEY);
              window.location.reload();
            }
          }}
          className="h-9 text-xs text-slate-500 hover:text-red-600 rounded-xl"
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Reset Draft
        </Button>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowFullViewerModal(true)}
            className="h-9 text-xs font-bold rounded-xl border-slate-300 gap-1.5"
          >
            <Eye className="w-4 h-4 text-blue-600" /> Preview Full Proposal
          </Button>

          <Button
            size="sm"
            onClick={handleGenerateProposal}
            disabled={generating}
            className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs h-9 px-6 rounded-xl shadow-md gap-2"
          >
            <Sparkles className="w-4 h-4" />
            <span>{generating ? "Building PDF…" : "Generate Proposal PDF"}</span>
          </Button>
        </div>
      </div>

      {/* ── COMPLETE 11-PAGE PROPOSAL DOCUMENT VIEWER MODAL ────────────────── */}
      <Dialog open={showFullViewerModal} onOpenChange={setShowFullViewerModal}>
        <DialogContent className="max-w-6xl w-[95vw] h-[90vh] p-0 bg-slate-950 border-slate-800 text-white overflow-hidden flex flex-col">
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
        </DialogContent>
      </Dialog>

      {/* ── EQUIPMENT EDIT / ADD MODAL ─────────────────────────────────────── */}
      <Dialog open={Boolean(editingEquipmentType)} onOpenChange={(o) => !o && setEditingEquipmentType(null)}>
        <DialogContent className="max-w-md bg-white text-slate-900 border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-blue-600" />
              <span>
                {editingEquipmentType === "panel" && "Edit Solar PV Module"}
                {editingEquipmentType === "inverter" && "Edit Solar Inverter"}
                {editingEquipmentType === "structure" && "Edit Mounting Structure"}
                {editingEquipmentType === "custom" && "Add Custom BOS Equipment"}
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

            {editingEquipmentType === "structure" && (
              <>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600">Structure Type</Label>
                  <Input
                    value={form.structure?.type || ""}
                    onChange={(e) => setForm({ ...form, structure: { ...form.structure, type: e.target.value } })}
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600">Clearance Height</Label>
                  <Input
                    value={form.structure?.height || ""}
                    onChange={(e) => setForm({ ...form, structure: { ...form.structure, height: e.target.value } })}
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

      {/* ── ADD SCOPE MODAL ────────────────────────────────────────────────── */}
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
                  setForm({ ...form, our_scope: [...(form.our_scope || []), { text: newScopeText.trim(), checked: true }] });
                } else {
                  setForm({ ...form, customer_scope: [...(form.customer_scope || []), { text: newScopeText.trim(), checked: true }] });
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

      {/* ── ADD MILESTONE MODAL ────────────────────────────────────────────── */}
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
