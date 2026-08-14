import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError, fileUrl } from "@/lib/api";
import { useClientDataDetail, useLedger } from "@/hooks/useClientDataHooks";
import { useDeleteClient } from "@/hooks/useClients";
import { queryKeys, invalidateAllClientQueries } from "@/lib/queryKeys";
import { usePermission } from "@/lib/permissions";
import { useEmployeeList } from "@/hooks/useTeam";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {
  ArrowLeft, Phone, MessageCircle, Download, MapPin, User, FileImage, Image as ImageIcon,
  Plus, Save, Eye, ExternalLink, Calendar, Wrench, AlertTriangle, Paperclip,
  Clock, CheckCircle2, ChevronRight, Activity, Megaphone, ClipboardList,
  Truck, FileText, Gauge, Package, ScrollText, Check, Trash2, Edit3, Wifi, WifiOff,
  Settings, AlertCircle, Zap, ShieldCheck, ChevronDown, ChevronUp, Sparkles, Filter, RefreshCw, Layers, DollarSign, TrendingUp, Calculator
} from "lucide-react";

import RaiseComplaintDialog from "@/components/RaiseComplaintDialog";
import TemplateGenerateDialog from "@/components/TemplateGenerateDialog";

dayjs.extend(relativeTime);

const STAGES = [
  "Onboarding",
  "Survey",
  "Quotation",
  "Material Delivery",
  "Installation",
  "Document Making",
  "Document Signed",
  "Meter Testing Request",
  "Meter Testing Completed",
  "PM Surya Ghar Upload",
  "MSEDCL Upload",
  "Verification",
  "Handover",
];

const OFFICIAL_DOC_TYPES = [
  { key: "WCR", label: "Work Completion Report (WCR)", icon: FileText },
  { key: "SLDR", label: "Single Line Diagram (SLDR)", icon: Zap },
  { key: "Annexure", label: "Annexure Document", icon: ScrollText },
  { key: "Vendor Agreement", label: "Vendor Agreement", icon: FileText },
  { key: "Net Meter Agreement", label: "Net Meter Agreement", icon: Gauge },
  { key: "Meter Testing", label: "Meter Testing Report", icon: CheckCircle2 },
  { key: "Quotation", label: "Quotation", icon: ScrollText },
  { key: "Delivery Bill", label: "Delivery Bill / Chalan", icon: Truck },
];

const INV_STATUS_STYLES = {
  "Online": { dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", icon: Wifi },
  "Offline": { dot: "bg-red-500", text: "text-red-700", bg: "bg-red-50 border-red-200", icon: WifiOff },
  "Error": { dot: "bg-orange-500", text: "text-orange-700", bg: "bg-orange-50 border-orange-200", icon: AlertCircle },
  "Maintenance": { dot: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-50 border-amber-200", icon: Wrench },
  "Not Configured": { dot: "bg-slate-300", text: "text-slate-500", bg: "bg-slate-50 border-slate-200", icon: Settings },
};

const InverterStatusBadge = ({ status, size = "md" }) => {
  const cfg = INV_STATUS_STYLES[status] || INV_STATUS_STYLES["Not Configured"];
  const Ic = cfg.icon;
  return (
    <Badge variant="outline" className={`${cfg.bg} ${cfg.text} ${size === "sm" ? "text-[10px]" : "text-xs"} gap-1 font-semibold`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${status === "Online" ? "animate-pulse" : ""}`} />
      <Ic className="w-3 h-3" />
      {status}
    </Badge>
  );
};

const cleanPhone = (v) => (v || "").replace(/\D/g, "");

export default function ClientDataDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState(params.get("tab") || "overview");
  const [zoom, setZoom] = useState(null); // file_id or image item
  const [complaintOpen, setComplaintOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [specsEditOpen, setSpecsEditOpen] = useState(false);
  const [specsForm, setSpecsForm] = useState(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [expandedStages, setExpandedStages] = useState({ Survey: true });

  const [paymentRecordOpen, setPaymentRecordOpen] = useState(false);
  const [expenseRecordOpen, setExpenseRecordOpen] = useState(false);
  const [warrantyDialogOpen, setWarrantyDialogOpen] = useState(false);
  const [serviceVisitDialogOpen, setServiceVisitDialogOpen] = useState(false);

  // Load full client details & related records in parallel
  const { data: clientData, isLoading: loading } = useClientDataDetail(id, "all");
  const { data: employees = [] } = useEmployeeList();
  const { data: ledger = null } = useLedger(id);

  const { data: financialsData } = useQuery({
    queryKey: ["client", id, "financials"],
    queryFn: async () => {
      const res = await api.get(`/clients/${id}/financials`);
      return res.data;
    },
    enabled: !!id
  });

  const { data: warrantiesData } = useQuery({
    queryKey: ["client", id, "warranties"],
    queryFn: async () => {
      const res = await api.get(`/clients/${id}/warranties`);
      return res.data;
    },
    enabled: !!id
  });

  const { data: serviceVisitsData } = useQuery({
    queryKey: ["client", id, "service-visits"],
    queryFn: async () => {
      const res = await api.get(`/clients/${id}/service-visits`);
      return res.data;
    },
    enabled: !!id
  });

  const canDelete = usePermission("clients", "delete");
  const deleteClientMutation = useDeleteClient();

  const c = clientData?.client || {};
  const monitoring = clientData?.monitoring;
  const inverter_status = clientData?.inverter_status;

  const surveys = clientData?.surveys || [];
  const materialDeliveries = clientData?.material_deliveries || [];
  const materialRequests = clientData?.material_requests || [];
  const documents = clientData?.documents || [];
  const meterTestings = clientData?.meter_testings || [];
  const installations = clientData?.installations || [];
  const verifications = clientData?.verifications || [];
  const handovers = clientData?.handovers || [];
  const assets = clientData?.assets || [];
  const highValueAssets = clientData?.high_value_assets || [];
  const tickets = clientData?.tickets || [];
  const tasks = clientData?.tasks || [];
  const outward = clientData?.outward || [];
  const activityLogs = clientData?.activity_logs || [];

  // Stage calculations
  const stagesObj = c.stages || {};
  const completedStagesCount = STAGES.filter((s) => stagesObj[s] === true).length;
  const totalStagesCount = STAGES.length;
  const progressPercent = Math.round((completedStagesCount / totalStagesCount) * 100);
  const currentStage = STAGES.find((s) => !stagesObj[s]) || STAGES[STAGES.length - 1];

  const toggleStageExpand = (stageName) => {
    setExpandedStages((prev) => ({ ...prev, [stageName]: !prev[stageName] }));
  };

  const handleToggleStageStatus = async (stageName) => {
    const nextState = !c?.stages?.[stageName];
    const newStages = { ...(c?.stages || {}), [stageName]: nextState };
    try {
      await api.patch(`/clients/${id}/stages`, { stages: newStages });
      invalidateAllClientQueries(queryClient, id);
      toast.success(`${stageName} marked as ${nextState ? "Completed" : "Reset"}`);
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const handleOpenEdit = () => {
    setEditForm({
      full_name: c.full_name || "",
      mobile: c.mobile || "",
      alt_mobile: c.alt_mobile || "",
      consumer_number: c.consumer_number || "",
      section_number: c.section_number || c.section_no || "",
      address: c.address || "",
      city: c.city || "",
      state: c.state || "",
      pincode: c.pincode || "",
      aadhaar: c.aadhaar || "",
      system_kw: c.system_kw || 0,
      panel_make: c.panel_make || c.panel_brand || "",
      panel_brand: c.panel_brand || c.panel_make || "",
      panel_technology: c.panel_technology || "",
      panel_wattage: c.panel_wattage || 0,
      num_panels: c.num_panels || 0,
      inverter_make: c.inverter_make || "",
      inverter_capacity: c.inverter_capacity || "",
      inverter_serial: c.inverter_serial || "",
      inverter_model: c.inverter_model || "",
      inverter_year: c.inverter_year || "",
      sanction_number: c.sanction_number || "",
      consumer_type: c.consumer_type || "",
      phase_type: c.phase_type || "Single Phase",
      subsidy_eligible: c.subsidy_eligible ?? false,
      status: c.status || "Lead",
      inverters: Array.isArray(c.inverters) && c.inverters.length > 0 ? c.inverters : [{ capacity: c.inverter_capacity || "", quantity: 1 }],
    });
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editForm) return;
    try {
      const payload = {
        ...editForm,
        system_kw: Number(editForm.system_kw) || 0,
        panel_wattage: Number(editForm.panel_wattage) || 0,
        num_panels: Number(editForm.num_panels) || 0,
        panel_brand: editForm.panel_brand || editForm.panel_make || "",
        panel_make: editForm.panel_make || editForm.panel_brand || "",
        section_number: editForm.section_number || editForm.section_no || "",
        section_no: editForm.section_number || editForm.section_no || "",
        consumer_category: editForm.consumer_type || "",
        consumer_type: editForm.consumer_type || "",
        inverters: Array.isArray(editForm.inverters) ? editForm.inverters : [],
      };
      const { data: updatedDoc } = await api.patch(`/clients/${id}`, payload);
      queryClient.setQueryData(queryKeys.clients.detail(id), updatedDoc);
      queryClient.setQueryData(queryKeys.clientData.detail(id), updatedDoc);
      invalidateAllClientQueries(queryClient, id);
      toast.success("Client workspace updated successfully");
      setEditOpen(false);
      setEditForm(null);
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const handleOpenSpecsEdit = () => {
    let initialInverters = [];
    if (Array.isArray(c.inverters) && c.inverters.length > 0) {
      initialInverters = c.inverters.map((inv) => {
        const qty = Math.max(1, Number(inv.quantity) || 1);
        let serials = Array.isArray(inv.serials) && inv.serials.length > 0
          ? [...inv.serials]
          : (inv.serial ? inv.serial.split(",").map(s => s.trim()) : []);
        while (serials.length < qty) serials.push("");
        serials = serials.slice(0, qty);
        return {
          brand: inv.brand || inv.inverter_make || "",
          capacity: inv.capacity || inv.inverter_capacity || "",
          quantity: qty,
          serials: serials,
          serial: serials.filter(Boolean).join(", ")
        };
      });
    } else {
      const fallbackBrand = c.inverter_brand || c.inverter_make || "";
      const fallbackCap = c.inverter_capacity || "";
      const fallbackSerials = c.inverter_serial ? c.inverter_serial.split(",").map(s => s.trim()) : [""];
      initialInverters = [{
        brand: fallbackBrand,
        capacity: fallbackCap,
        quantity: Math.max(1, fallbackSerials.length),
        serials: fallbackSerials,
        serial: fallbackSerials.filter(Boolean).join(", ")
      }];
    }

    setSpecsForm({
      system_kw: c.system_kw || 0,
      panel_brand: c.panel_brand || c.panel_make || "",
      panel_technology: c.panel_technology || "",
      panel_wattage: c.panel_wattage || 0,
      num_panels: c.num_panels || 0,
      inverters: initialInverters,
      phase_type: c.phase_type || "Single Phase",
      sanction_number: c.sanction_number || "",
    });
    setSpecsEditOpen(true);
  };

  const handleSaveSpecs = async () => {
    if (!specsForm) return;
    try {
      const cleanedInverters = (specsForm.inverters || []).map((inv) => {
        const qty = Math.max(1, Number(inv.quantity) || 1);
        const rawSerials = Array.isArray(inv.serials) ? inv.serials : (inv.serial ? inv.serial.split(",").map(s => s.trim()) : []);
        const serials = Array.from({ length: qty }).map((_, i) => (rawSerials[i] || "").trim());
        const serialStr = serials.filter(Boolean).join(", ");
        return {
          brand: (inv.brand || "").trim(),
          capacity: (inv.capacity || "").trim(),
          quantity: qty,
          serials: serials,
          serial: serialStr
        };
      });

      const firstInv = cleanedInverters[0] || {};
      const primaryBrand = firstInv.brand || "";
      const primaryCap = firstInv.capacity || "";
      const allSerials = cleanedInverters.flatMap(i => i.serials).filter(Boolean).join(", ");

      const payload = {
        system_kw: Number(specsForm.system_kw) || 0,
        panel_brand: specsForm.panel_brand || "",
        panel_make: specsForm.panel_brand || "",
        panel_technology: specsForm.panel_technology || "",
        panel_wattage: Number(specsForm.panel_wattage) || 0,
        num_panels: Number(specsForm.num_panels) || 0,
        inverters: cleanedInverters,
        inverter_brand: primaryBrand,
        inverter_make: primaryBrand,
        inverter_capacity: primaryCap,
        inverter_serial: allSerials,
        phase_type: specsForm.phase_type || "Single Phase",
        sanction_number: specsForm.sanction_number || "",
      };

      const { data: updatedDoc } = await api.patch(`/clients/${id}`, payload);
      queryClient.setQueryData(queryKeys.clients.detail(id), updatedDoc);
      queryClient.setQueryData(queryKeys.clientData.detail(id), updatedDoc);
      invalidateAllClientQueries(queryClient, id);
      toast.success("System Specifications updated successfully");
      setSpecsEditOpen(false);
      setSpecsForm(null);
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const handleDeleteClient = () => {
    if (!window.confirm("Are you sure you want to delete this client workspace? This action cannot be undone.")) return;
    deleteClientMutation.mutate(id, {
      onSuccess: () => navigate("/client-data"),
    });
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse p-4">
        <div className="h-8 w-48 bg-slate-200 rounded" />
        <div className="h-28 w-full bg-slate-200 rounded-2xl" />
        <div className="h-64 w-full bg-slate-100 rounded-2xl" />
      </div>
    );
  }

  if (!clientData || !c.id) {
    return (
      <div className="p-12 text-center space-y-4">
        <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
        <h2 className="text-xl font-bold text-slate-900">Client Workspace Not Found</h2>
        <Button onClick={() => navigate("/clients")} className="bg-blue-600">Return to Clients</Button>
      </div>
    );
  }

  const phone = cleanPhone(c.mobile);

  return (
    <div className="space-y-6 max-w-7xl mx-auto" data-testid="client-workspace">
      {/* Back Button */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 transition"
          data-testid="back-btn"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Clients / Operations
        </button>

        <div className="text-xs text-slate-500 flex items-center gap-2">
          <span>Client Workspace 360</span>
          <span>•</span>
          <span className="font-mono">{c.id}</span>
        </div>
      </div>

      {/* TOP HEADER: CLIENT HEADER CARD */}
      <Card className="border-slate-200 bg-white shadow-sm overflow-hidden" data-testid="client-header-card">
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            {/* Left Side: Client Info */}
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center text-2xl font-bold shadow-md shrink-0">
                {(c.full_name || "?").slice(0, 1).toUpperCase()}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>
                    {c.full_name}
                  </h1>
                  <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-md text-xs font-mono font-bold border border-blue-200">
                    {c.sol_id || c.client_code || "SOL-2026-XXXX"}
                  </span>
                  {c.subsidy_eligible && (
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md text-xs font-semibold border border-emerald-200">
                      Subsidy Eligible
                    </span>
                  )}
                </div>

                <div className="text-xs lg:text-sm text-slate-600 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span>📞 {c.mobile}</span>
                  {c.city && <span>📍 {c.city}</span>}
                  {c.consumer_number && <span>Consumer No: <strong className="text-slate-900 font-mono">{c.consumer_number}</strong></span>}
                  <span>⚡ <strong>{c.system_kw || 0} kW</strong></span>
                  <InverterStatusBadge status={inverter_status} size="sm" />
                </div>
              </div>
            </div>

            {/* Right Side: Stage & Progress Summary */}
            <div className="flex items-center gap-5 w-full lg:w-auto bg-slate-50 p-4 rounded-xl border border-slate-200/80 justify-between lg:justify-end">
              <div className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Current Stage</div>
                <Badge variant="outline" className="bg-blue-600 text-white font-bold text-xs px-3 py-1 shadow-xs border-0">
                  {currentStage}
                </Badge>
              </div>

              <div className="h-10 w-px bg-slate-200" />

              <div className="space-y-1 min-w-[120px]">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700">
                  <span>Progress</span>
                  <span className="font-bold text-blue-600">{progressPercent}%</span>
                </div>
                <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                  <div className="bg-blue-600 h-full transition-all duration-300" style={{ width: `${progressPercent}%` }} />
                </div>
                <div className="text-[10px] text-slate-500">
                  Completed: <strong className="text-slate-900">{completedStagesCount}</strong> / {totalStagesCount}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Action Buttons Row */}
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline" className="h-8 text-xs bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300" onClick={handleOpenEdit} data-testid="edit-client-btn">
                <Edit3 className="w-3.5 h-3.5 mr-1 text-slate-500" /> Edit
              </Button>
              {phone && (
                <>
                  <a href={`tel:${phone}`}>
                    <Button size="sm" variant="outline" className="h-8 text-xs bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100">
                      <Phone className="w-3.5 h-3.5 mr-1" /> Call
                    </Button>
                  </a>
                  <a href={`https://wa.me/91${phone.length === 10 ? phone : phone.slice(-10)}`} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="outline" className="h-8 text-xs bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100">
                      <MessageCircle className="w-3.5 h-3.5 mr-1" /> WhatsApp
                    </Button>
                  </a>
                </>
              )}
              <Button size="sm" variant="outline" className="h-8 text-xs bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100" onClick={() => setComplaintOpen(true)} data-testid="raise-complaint-btn">
                <Megaphone className="w-3.5 h-3.5 mr-1" /> Raise Complaint
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100" onClick={() => setTplOpen(true)}>
                <Sparkles className="w-3.5 h-3.5 mr-1" /> Generate Document
              </Button>
            </div>

            {canDelete && (
              <Button size="sm" variant="ghost" className="h-8 text-xs text-rose-600 hover:bg-rose-50" onClick={handleDeleteClient}>
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete Client
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 7 MAIN LOGICAL WORKSPACE SECTIONS */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-1.5 shadow-xs overflow-x-auto">
          <TabsList className="bg-slate-100/80 p-1 rounded-lg flex gap-1 min-w-max">
            <TabsTrigger value="overview" className="text-xs font-semibold px-4 py-2 gap-1.5">
              <User className="w-3.5 h-3.5 text-blue-600" /> Overview
            </TabsTrigger>
            <TabsTrigger value="financials" className="text-xs font-semibold px-4 py-2 gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-emerald-600" /> Financials & Payments
            </TabsTrigger>
            <TabsTrigger value="workflow" className="text-xs font-semibold px-4 py-2 gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-600" /> Workflow & Stages
            </TabsTrigger>
            <TabsTrigger value="tasks" className="text-xs font-semibold px-4 py-2 gap-1.5">
              <ClipboardList className="w-3.5 h-3.5 text-teal-600" /> Tasks ({tasks.length})
            </TabsTrigger>
            <TabsTrigger value="materials" className="text-xs font-semibold px-4 py-2 gap-1.5">
              <Truck className="w-3.5 h-3.5 text-amber-600" /> Materials ({materialDeliveries.length})
            </TabsTrigger>
            <TabsTrigger value="documents" className="text-xs font-semibold px-4 py-2 gap-1.5">
              <FileText className="w-3.5 h-3.5 text-violet-600" /> Documents ({documents.length})
            </TabsTrigger>
            <TabsTrigger value="photos" className="text-xs font-semibold px-4 py-2 gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-emerald-600" /> Photos ({assets.length})
            </TabsTrigger>
            <TabsTrigger value="warranties" className="text-xs font-semibold px-4 py-2 gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" /> Warranty & Service
            </TabsTrigger>
            <TabsTrigger value="activity" className="text-xs font-semibold px-4 py-2 gap-1.5">
              <Activity className="w-3.5 h-3.5 text-rose-600" /> Activity Log ({activityLogs.length})
            </TabsTrigger>
          </TabsList>
        </div>

        {/* SECTION 1: OVERVIEW */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid md:grid-cols-3 gap-5">
            {/* Card 1: Client Information */}
            <Card className="border-slate-200 card-lift">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="font-semibold text-sm text-slate-900 flex items-center gap-2">
                    <User className="w-4 h-4 text-blue-600" /> Client Information
                  </h3>
                  <Badge variant="outline" className="text-[10px] bg-slate-50">{c.consumer_type || "Residential"}</Badge>
                </div>
                <div className="space-y-2.5 text-xs">
                  <Row label="Full Name" val={c.full_name} bold />
                  <Row label="Mobile Number" val={c.mobile} />
                  <Row label="Alternate Mobile" val={c.alt_mobile} />
                  <Row label="Consumer Number" val={c.consumer_number} />
                  <Row label="Section Number" val={c.section_number || c.section_no} />
                  <Row label="Address" val={c.address} />
                  <Row label="City & Pincode" val={[c.city, c.pincode].filter(Boolean).join(", ")} />
                  <Row label="Aadhaar Number" val={c.aadhaar} />
                </div>
              </CardContent>
            </Card>

            {/* Card 2: Solar System Specifications */}
            <Card className="border-slate-200 card-lift">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="font-semibold text-sm text-slate-900 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-600" /> System Specifications
                  </h3>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 font-bold">{c.system_kw || 0} kW</Badge>
                    <button
                      onClick={handleOpenSpecsEdit}
                      className="p-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition cursor-pointer"
                      title="Edit System Specifications"
                      data-testid="edit-system-specs-btn"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="space-y-2.5 text-xs">
                  <Row label="Required Capacity" val={`${c.system_kw || 0} kW`} bold />
                  <Row label="Panel Make / Brand" val={c.panel_brand || c.panel_make} />
                  <Row label="Panel Tech & Wattage" val={c.panel_wattage ? `${c.panel_wattage}W (${c.panel_technology || "Mono PERC"})` : "—"} />
                  <Row label="Number of Panels" val={c.num_panels ? `${c.num_panels} Nos` : "—"} />
                  {Array.isArray(c.inverters) && c.inverters.length > 1 ? (
                    <div className="border-t border-b border-slate-100 py-2 my-1 space-y-2">
                      <div className="font-semibold text-slate-700 text-[11px] uppercase tracking-wider">Inverters ({c.inverters.length})</div>
                      {c.inverters.map((inv, i) => (
                        <div key={i} className="bg-slate-50 p-2 rounded border border-slate-100 space-y-1">
                          <div className="flex items-center justify-between font-semibold text-slate-800">
                            <span>Inverter {i + 1}: {inv.brand || "—"}</span>
                            <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded font-mono">{inv.capacity || "—"} × {inv.quantity || 1}</span>
                          </div>
                          <div className="text-slate-500 font-mono text-[10px]">
                            Serial(s): {(Array.isArray(inv.serials) ? inv.serials.filter(Boolean).join(", ") : inv.serial) || "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      <Row label="Inverter Brand" val={(c.inverters?.[0]?.brand) || c.inverter_brand || c.inverter_make} />
                      <Row label="Inverter Capacity" val={(c.inverters?.[0]?.capacity) || c.inverter_capacity} />
                      <Row label="Inverter Serials" val={(Array.isArray(c.inverters?.[0]?.serials) ? c.inverters[0].serials.filter(Boolean).join(", ") : c.inverters?.[0]?.serial) || c.inverter_serial} />
                    </>
                  )}
                  <Row label="Phase Type" val={c.phase_type} />
                  <Row label="Sanction Number" val={c.sanction_number} />
                </div>
              </CardContent>
            </Card>

            {/* Card 3: Team Assignment & Project Status */}
            <Card className="border-slate-200 card-lift">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="font-semibold text-sm text-slate-900 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" /> Team & Status
                  </h3>
                  <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 font-semibold">{c.status}</Badge>
                </div>
                <div className="space-y-2.5 text-xs">
                  <Row label="Current Stage" val={currentStage} bold />
                  <Row label="Progress Percentage" val={`${progressPercent}% (${completedStagesCount}/${totalStagesCount} Completed)`} />
                  <Row label="Assigned Team" val={c.assigned_team || "Team Solarix"} />
                  <Row label="Project Manager" val={c.project_manager || "Not Assigned"} />
                  <Row label="Lead Installer" val={c.installer_name || "Not Assigned"} />
                  <Row label="Created Date" val={c.created_at ? dayjs(c.created_at).format("D MMM YYYY") : "—"} />
                  <Row label="Last Updated" val={c.updated_at ? dayjs(c.updated_at).fromNow() : "—"} />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* FINANCIALS & PAYMENTS TAB */}
        <TabsContent value="financials" className="space-y-6">
          <div className="grid md:grid-cols-4 gap-4">
            <Card className="border-slate-200 bg-gradient-to-br from-blue-50/50 to-white">
              <CardContent className="p-4 space-y-1">
                <div className="text-xs text-slate-500 font-medium">Net Project Value</div>
                <div className="text-xl font-bold text-slate-900">
                  ₹{(financialsData?.commercial_summary?.net_project_value || 0).toLocaleString("en-IN")}
                </div>
                <div className="text-[10px] text-slate-500">Quotation: ₹{(financialsData?.commercial_summary?.quotation_value || 0).toLocaleString("en-IN")}</div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-gradient-to-br from-emerald-50/50 to-white">
              <CardContent className="p-4 space-y-1">
                <div className="text-xs text-slate-500 font-medium">Total Received</div>
                <div className="text-xl font-bold text-emerald-700">
                  ₹{(financialsData?.commercial_summary?.total_received || 0).toLocaleString("en-IN")}
                </div>
                <div className="text-[10px] text-emerald-600 font-medium">
                  {financialsData?.commercial_summary?.net_project_value > 0 ? Math.round(((financialsData?.commercial_summary?.total_received || 0) / financialsData?.commercial_summary?.net_project_value) * 100) : 0}% Collected
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-gradient-to-br from-amber-50/50 to-white">
              <CardContent className="p-4 space-y-1">
                <div className="text-xs text-slate-500 font-medium">Pending Outstanding</div>
                <div className="text-xl font-bold text-amber-700">
                  ₹{(financialsData?.commercial_summary?.total_pending || 0).toLocaleString("en-IN")}
                </div>
                <div className="text-[10px] text-amber-600 font-medium">Remaining Milestone</div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-gradient-to-br from-indigo-50/50 to-white">
              <CardContent className="p-4 space-y-1">
                <div className="text-xs text-slate-500 font-medium">Project Profitability</div>
                <div className="text-xl font-bold text-indigo-700">
                  {financialsData?.commercial_summary?.estimated_profit !== null && financialsData?.commercial_summary?.estimated_profit !== undefined
                    ? `₹${financialsData.commercial_summary.estimated_profit.toLocaleString("en-IN")}`
                    : "Not Recorded"}
                </div>
                <div className="text-[10px] text-indigo-600 font-medium">
                  {financialsData?.commercial_summary?.profit_margin !== null && financialsData?.commercial_summary?.profit_margin !== undefined
                    ? `${financialsData.commercial_summary.profit_margin.toFixed(1)}% Margin`
                    : "Cost unpopulated"}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="font-semibold text-sm text-slate-900 flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-emerald-600" /> Payment Milestones
                  </h3>
                  <Button size="sm" onClick={() => setPaymentRecordOpen(true)} className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1">
                    <Plus className="w-3 h-3" /> Record Payment
                  </Button>
                </div>

                <div className="space-y-2.5">
                  {(financialsData?.milestones || []).map((m, idx) => (
                    <div key={m.id || idx} className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-xs text-slate-900">{m.name}</div>
                        <div className="text-[11px] text-slate-500">
                          Amount: <strong className="text-slate-800">₹{(m.amount || 0).toLocaleString("en-IN")}</strong>
                        </div>
                      </div>
                      <Badge variant="outline" className={m.status === "Paid" ? "bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold" : "bg-amber-50 text-amber-700 border-amber-200"}>
                        {m.status}
                      </Badge>
                    </div>
                  ))}
                </div>

                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Payment Records ({(financialsData?.payments || []).length})</div>
                  {(financialsData?.payments || []).length === 0 ? (
                    <div className="text-xs text-slate-500 italic">No payments recorded yet.</div>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {financialsData.payments.map((p) => (
                        <div key={p.id} className="text-xs bg-white p-2.5 rounded border border-slate-200 flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-slate-800">{p.milestone_name || "Payment"}</div>
                            <div className="text-[11px] text-slate-500">{p.payment_date} · {p.payment_mode} {p.ref_number ? `(Ref: ${p.ref_number})` : ""}</div>
                          </div>
                          <span className="font-bold text-emerald-700 text-sm">₹{Number(p.amount).toLocaleString("en-IN")}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="font-semibold text-sm text-slate-900 flex items-center gap-2">
                    <Truck className="w-4 h-4 text-amber-600" /> Project Expenses & Cost Breakdown
                  </h3>
                  <Button size="sm" onClick={() => setExpenseRecordOpen(true)} className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white gap-1">
                    <Plus className="w-3 h-3" /> Log Expense
                  </Button>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded border border-slate-100 font-medium">
                    <span>Allocated Material Cost (Inventory)</span>
                    <span className="font-bold text-slate-900">
                      {financialsData?.commercial_summary?.allocated_material_cost !== null && financialsData?.commercial_summary?.allocated_material_cost !== undefined
                        ? `₹${financialsData.commercial_summary.allocated_material_cost.toLocaleString("en-IN")}`
                        : "Not Recorded"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded border border-slate-100 font-medium">
                    <span>Logged Direct Expenses</span>
                    <span className="font-bold text-slate-900">
                      {financialsData?.commercial_summary?.logged_expenses_cost !== null && financialsData?.commercial_summary?.logged_expenses_cost !== undefined
                        ? `₹${financialsData.commercial_summary.logged_expenses_cost.toLocaleString("en-IN")}`
                        : "Not Recorded"}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Logged Expenses ({(financialsData?.expenses || []).length})</div>
                  {(financialsData?.expenses || []).length === 0 ? (
                    <div className="text-xs text-slate-500 italic">No direct expenses logged for this project.</div>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {financialsData.expenses.map((e) => (
                        <div key={e.id} className="text-xs bg-white p-2.5 rounded border border-slate-200 flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-slate-800">{e.category}</div>
                            <div className="text-[11px] text-slate-500">{e.description || "No description"} · {e.created_by}</div>
                          </div>
                          <span className="font-bold text-amber-700 text-sm">₹{Number(e.amount).toLocaleString("en-IN")}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* SECTION 2: WORKFLOW & STAGES (LEVEL 2 & 3 CONTENT-FIRST) */}
        <TabsContent value="workflow" className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Project Execution Workflow</h3>
              <p className="text-xs text-slate-500">Track actual progress across all 13 execution stages.</p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Completed</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-600" /> Current</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-300" /> Not Started</span>
            </div>
          </div>

          <div className="space-y-3">
            {STAGES.map((st, idx) => {
              const isCompleted = c?.stages?.[st] === true;
              const isCurrent = st === currentStage;
              const isExpanded = expandedStages[st] || isCurrent;

              // Find stage-specific data
              const stageSurveys = st === "Survey" ? surveys : [];
              const stageDeliveries = st === "Material Delivery" ? materialDeliveries : [];
              const stageInstallations = st === "Installation" ? installations : [];
              const stageVerifications = st === "Verification" ? verifications : [];
              const stageHandovers = st === "Handover" ? handovers : [];
              const stageMeters = st.includes("Meter") ? meterTestings : [];

              return (
                <Card
                  key={st}
                  className={`border transition-all ${
                    isCompleted
                      ? "border-emerald-200 bg-emerald-50/20"
                      : isCurrent
                      ? "border-blue-300 bg-blue-50/30 shadow-xs"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <CardContent className="p-4 space-y-3">
                    {/* Header bar of stage card */}
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3 cursor-pointer" onClick={() => toggleStageExpand(st)}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                          isCompleted ? "bg-emerald-600 text-white" : isCurrent ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"
                        }`}>
                          {isCompleted ? <Check className="w-4 h-4" /> : idx + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-slate-900 text-sm">{st}</h4>
                            <Badge variant="outline" className={`text-[10px] ${
                              isCompleted ? "bg-emerald-50 text-emerald-700 border-emerald-200 font-bold" : isCurrent ? "bg-blue-600 text-white font-bold" : "bg-slate-100 text-slate-600"
                            }`}>
                              {isCompleted ? "✓ Completed" : isCurrent ? "● Current Stage" : "○ Not Started"}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-slate-600 hover:bg-slate-100"
                          onClick={() => handleToggleStageStatus(st)}
                        >
                          {isCompleted ? "Reset Stage" : "Mark Completed"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-slate-500"
                          onClick={() => toggleStageExpand(st)}
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>

                    {/* Level 3 Expanded Stage Content */}
                    {isExpanded && (
                      <div className="pt-3 border-t border-slate-200/60 space-y-3 text-xs">
                        {st === "Survey" && (
                          <SurveyStageDetails surveys={stageSurveys} onZoom={setZoom} />
                        )}
                        {st === "Material Delivery" && (
                          <DeliveryStageDetails deliveries={stageDeliveries} />
                        )}
                        {st === "Installation" && (
                          <InstallationStageDetails installations={stageInstallations} onZoom={setZoom} />
                        )}
                        {st === "Verification" && (
                          <VerificationStageDetails verifications={stageVerifications} onZoom={setZoom} />
                        )}
                        {st === "Handover" && (
                          <HandoverStageDetails handovers={stageHandovers} onZoom={setZoom} />
                        )}
                        {st.includes("Meter") && (
                          <MeterStageDetails meters={stageMeters} />
                        )}

                        {/* Generic details if stage specific details not defined */}
                        {!["Survey", "Material Delivery", "Installation", "Verification", "Handover"].includes(st) && !st.includes("Meter") && (
                          <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex items-center justify-between gap-4">
                            <div className="text-slate-600">
                              Status: <strong className="text-slate-900">{isCompleted ? "Completed" : "Pending"}</strong>
                            </div>
                            <Button size="sm" variant="outline" className="h-7 text-[11px] bg-white" onClick={() => setActiveTab("tasks")}>
                              View Tasks →
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* SECTION 3: TASKS (LINKED TO TASK PORTAL) */}
        <TabsContent value="tasks" className="space-y-4">
          <Card className="border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-teal-600" /> Client Execution Tasks ({tasks.length})
              </h3>
              <Button size="sm" className="bg-blue-600 text-xs" onClick={() => navigate("/tasks")}>
                View in Task Portal →
              </Button>
            </div>

            {tasks.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs italic">No execution tasks created for this client yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 border-b">
                    <tr>
                      <th className="p-3">Task Title</th>
                      <th className="p-3">Stage</th>
                      <th className="p-3">Assigned To</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Due Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {tasks.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50">
                        <td className="p-3 font-semibold text-slate-900">{t.title || t.name}</td>
                        <td className="p-3 text-slate-600">{t.stage || "Execution"}</td>
                        <td className="p-3 text-slate-700">{t.assigned_to_name || "Unassigned"}</td>
                        <td className="p-3">
                          <Badge variant="outline" className={`text-[10px] ${
                            t.status === "Completed" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"
                          }`}>
                            {t.status || "Pending"}
                          </Badge>
                        </td>
                        <td className="p-3 text-slate-500">{t.due_date ? dayjs(t.due_date).format("D MMM YYYY") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* SECTION 4: MATERIALS */}
        <TabsContent value="materials" className="space-y-4">
          <Card className="border-slate-200 p-5 space-y-4">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Truck className="w-4 h-4 text-amber-600" /> Project Materials & High Value Tracking
            </h3>

            {materialDeliveries.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs italic">No material deliveries logged.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 border-b">
                    <tr>
                      <th className="p-3">Product Name</th>
                      <th className="p-3">Quantity</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Delivery Date</th>
                      <th className="p-3">Serial Numbers</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {materialDeliveries.map((m, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="p-3 font-semibold text-slate-900">{m.product_name || m.product || "Solar Components"}</td>
                        <td className="p-3 font-bold text-slate-800">{m.quantity || 1} Nos</td>
                        <td className="p-3">
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 text-[10px]">Delivered</Badge>
                        </td>
                        <td className="p-3 text-slate-600">{m.created_at ? dayjs(m.created_at).format("D MMM YYYY") : "—"}</td>
                        <td className="p-3 font-mono text-[11px] text-slate-700">{m.serial_numbers?.join(", ") || m.serial_number || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* SECTION 5: DOCUMENTS */}
        <TabsContent value="documents" className="space-y-4">
          <Card className="border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-violet-600" /> Client Documents & Official Forms
              </h3>
              <Button size="sm" className="bg-indigo-600 text-xs" onClick={() => setTplOpen(true)}>
                + Generate Document
              </Button>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {OFFICIAL_DOC_TYPES.map((docType) => {
                const foundDoc = documents.find((d) => (d.doc_type || d.label || "").toLowerCase().includes(docType.key.toLowerCase()));
                const isAvailable = Boolean(foundDoc);
                const Icon = docType.icon;

                return (
                  <div key={docType.key} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 card-lift">
                    <div className="flex items-center justify-between">
                      <div className="w-8 h-8 rounded-lg bg-white text-indigo-600 flex items-center justify-center border shadow-xs">
                        <Icon className="w-4 h-4" />
                      </div>
                      <Badge variant="outline" className={`text-[10px] ${
                        isAvailable ? "bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold" : "bg-slate-100 text-slate-500"
                      }`}>
                        {isAvailable ? "Generated / Ready" : "Pending"}
                      </Badge>
                    </div>

                    <div>
                      <div className="font-bold text-slate-900 text-xs">{docType.label}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {foundDoc ? `Updated: ${dayjs(foundDoc.created_at || foundDoc.updated_at).format("D MMM YYYY")}` : "Not generated yet"}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200 flex items-center justify-end">
                      {foundDoc ? (
                        <a href={fileUrl(foundDoc.storage_path || foundDoc.url)} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="outline" className="h-7 text-xs bg-white text-blue-700 border-blue-200">
                            <Eye className="w-3 h-3 mr-1" /> View Doc
                          </Button>
                        </a>
                      ) : (
                        <Button size="sm" variant="outline" className="h-7 text-xs bg-white text-indigo-700 border-indigo-200" onClick={() => setTplOpen(true)}>
                          Generate →
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </TabsContent>

        {/* SECTION 6: PHOTOS */}
        <TabsContent value="photos" className="space-y-4">
          <Card className="border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-emerald-600" /> Project Photos Gallery ({assets.length})
              </h3>
              <Button
                size="sm"
                onClick={() => setUploadModalOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs gap-1.5 cursor-pointer shadow-xs"
                data-testid="upload-photo-btn"
              >
                <Plus className="w-3.5 h-3.5" /> Upload Photo
              </Button>
            </div>

            {assets.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs italic">No site or task photos uploaded yet.</div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                {assets.map((ast, idx) => (
                  <div
                    key={idx}
                    className="bg-white rounded-xl border border-slate-200 overflow-hidden group cursor-pointer shadow-2xs hover:shadow-xs transition"
                    onClick={() => setZoom(ast)}
                  >
                    <div className="aspect-square bg-slate-100 relative overflow-hidden">
                      <img
                        src={fileUrl(ast.file_id || ast.storage_path || ast.url)}
                        alt={ast.location || ast.label || "Photo"}
                        className="w-full h-full object-cover group-hover:scale-105 transition"
                      />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-xs font-semibold">
                        View Photo
                      </div>
                      {(ast.stage || ast.source) && (
                        <Badge className="absolute top-2 left-2 text-[10px] bg-slate-900/80 backdrop-blur-xs text-white border-0 px-1.5 py-0.5 font-semibold">
                          {ast.stage || ast.source}
                        </Badge>
                      )}
                    </div>
                    <div className="p-2 space-y-0.5 bg-white">
                      <div className="font-semibold text-xs text-slate-800 truncate" title={ast.location || ast.label}>
                        {ast.location || ast.label}
                      </div>
                      <div className="text-[10px] text-slate-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        {ast.created_at ? dayjs(ast.created_at).format("D MMM YYYY") : "—"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* WARRANTY & AMC SERVICE TAB */}
        <TabsContent value="warranties" className="space-y-6">
          <div className="grid md:grid-cols-2 gap-5">
            {/* Warranty Tracker */}
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="font-semibold text-sm text-slate-900 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" /> Equipment Warranty Tracker
                  </h3>
                  <Button size="sm" onClick={() => setWarrantyDialogOpen(true)} className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1">
                    <Plus className="w-3 h-3" /> Add Warranty
                  </Button>
                </div>

                <div className="space-y-2.5">
                  {(warrantiesData?.warranties || []).length === 0 ? (
                    <div className="text-xs text-slate-500 italic p-4 text-center">No warranty records created yet. Click "+ Add Warranty" to register panel or inverter warranties.</div>
                  ) : (
                    warrantiesData.warranties.map((w) => (
                      <div key={w.id} className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">{w.product_type} ({w.brand || "Standard"})</span>
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold text-[10px]">
                            {w.status || "Active"}
                          </Badge>
                        </div>
                        <div className="text-slate-600">Model/Serial: <span className="font-mono">{w.serial_number || "—"}</span></div>
                        <div className="text-[11px] text-slate-500">Warranty Period: {w.warranty_start} to {w.warranty_end || "25 Years"}</div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* AMC & Service Visit History */}
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="font-semibold text-sm text-slate-900 flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-blue-600" /> Service & Maintenance Schedule
                  </h3>
                  <Button size="sm" onClick={() => setServiceVisitDialogOpen(true)} className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1">
                    <Plus className="w-3 h-3" /> Log Service Visit
                  </Button>
                </div>

                <div className="space-y-2.5">
                  {(serviceVisitsData?.visits || []).length === 0 ? (
                    <div className="text-xs text-slate-500 italic p-4 text-center">No routine maintenance or service visits logged yet. Click "+ Log Service Visit" to log a visit.</div>
                  ) : (
                    serviceVisitsData.visits.map((v) => (
                      <div key={v.id} className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">{v.visit_type} ({v.visit_date})</span>
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-semibold text-[10px]">
                            {v.system_status}
                          </Badge>
                        </div>
                        <div className="text-slate-600">Technician: {v.technician_name} · Earth Resistance: {v.earth_resistance || "—"}</div>
                        <div className="text-[11px] text-slate-500">{v.technician_remarks || "Routine checkup completed clean."}</div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* SECTION 7: ACTIVITY */}
        <TabsContent value="activity" className="space-y-4">
          <Card className="border-slate-200 p-5 space-y-4">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Activity className="w-4 h-4 text-rose-600" /> Chronological Activity Log ({activityLogs.length})
            </h3>

            {activityLogs.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs italic">No recent activity logged.</div>
            ) : (
              <div className="space-y-3">
                {activityLogs.map((a, i) => (
                  <div key={i} className="flex items-start gap-3 text-xs bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <div className="w-2 h-2 rounded-full bg-blue-600 mt-1.5 shrink-0" />
                    <div className="space-y-0.5">
                      <div className="font-semibold text-slate-900">{a.action}</div>
                      <div className="text-slate-500">By <strong>{a.user_name || "System"}</strong> • {dayjs(a.created_at).format("D MMM YYYY, h:mm A")}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Client Modal */}
      {editOpen && editForm && (
        <EditClientDialog
          form={editForm}
          setForm={setEditForm}
          onClose={() => setEditOpen(false)}
          onSave={handleSaveEdit}
        />
      )}

      {/* Raise Complaint Modal */}
      {complaintOpen && (
        <RaiseComplaintDialog
          client={c}
          onClose={() => setComplaintOpen(false)}
        />
      )}

      {/* Generate Document Modal */}
      {tplOpen && (
        <TemplateGenerateDialog
          client={c}
          onClose={() => setTplOpen(false)}
          onGenerated={() => { setTplOpen(false); invalidateAllClientQueries(queryClient, id); }}
        />
      )}

      {/* Upload Photo Modal */}
      {uploadModalOpen && (
        <UploadPhotoDialog
          clientId={id}
          open={uploadModalOpen}
          onClose={() => setUploadModalOpen(false)}
          queryClient={queryClient}
        />
      )}

      {/* Record Payment Modal */}
      {paymentRecordOpen && (
        <RecordPaymentModal
          clientId={id}
          onClose={() => setPaymentRecordOpen(false)}
          onSuccess={() => setPaymentRecordOpen(false)}
        />
      )}

      {/* Record Expense Modal */}
      {expenseRecordOpen && (
        <RecordExpenseModal
          clientId={id}
          onClose={() => setExpenseRecordOpen(false)}
          onSuccess={() => setExpenseRecordOpen(false)}
        />
      )}

      {/* Create Warranty Modal */}
      {warrantyDialogOpen && (
        <CreateWarrantyModal
          clientId={id}
          onClose={() => setWarrantyDialogOpen(false)}
          onSuccess={() => setWarrantyDialogOpen(false)}
        />
      )}

      {/* Create Service Visit Modal */}
      {serviceVisitDialogOpen && (
        <CreateServiceVisitModal
          clientId={id}
          onClose={() => setServiceVisitDialogOpen(false)}
          onSuccess={() => setServiceVisitDialogOpen(false)}
        />
      )}

      {/* Edit System Specs Modal */}
      {specsEditOpen && specsForm && (
        <EditSystemSpecsDialog
          form={specsForm}
          setForm={setSpecsForm}
          onClose={() => setSpecsEditOpen(false)}
          onSave={handleSaveSpecs}
        />
      )}

      {/* Upload Photo Modal */}
      {uploadModalOpen && (
        <UploadPhotoDialog
          open={uploadModalOpen}
          onClose={() => setUploadModalOpen(false)}
          queryClient={queryClient}
          clientId={id}
        />
      )}

      {/* Lightbox Photo Zoom Modal */}
      {zoom && (
        <Dialog open onOpenChange={() => setZoom(null)}>
          <DialogContent className="max-w-4xl p-4 bg-slate-950 text-white border-slate-800">
            <DialogHeader className="pb-2 border-b border-slate-800">
              <DialogTitle className="text-white text-sm flex items-center justify-between">
                <span>{zoom.location || zoom.label || "Project Photo"}</span>
                {(zoom.stage || zoom.source) && (
                  <Badge className="bg-emerald-600 text-white text-[10px] font-semibold border-0">
                    {zoom.stage || zoom.source}
                  </Badge>
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="relative flex flex-col items-center justify-center p-2 space-y-3">
              <img
                src={fileUrl(zoom.file_id || zoom.storage_path || zoom.url)}
                alt={zoom.label || "Photo"}
                className="max-h-[65vh] object-contain rounded-lg shadow-lg"
              />
              <div className="w-full text-xs space-y-1 text-slate-300 bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                {zoom.location && <div><strong className="text-white">Location / Area:</strong> {zoom.location}</div>}
                {zoom.description && <div><strong className="text-white">Description:</strong> {zoom.description}</div>}
                {zoom.created_at && <div><strong className="text-white">Upload Date:</strong> {dayjs(zoom.created_at).format("D MMMM YYYY, h:mm A")}</div>}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── HELPER COMPONENTS FOR STAGE DETAILS ─────────────────────────────────────
function Row({ label, val, bold = false }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-slate-100/80 pb-1.5">
      <span className="text-slate-500 font-medium">{label}</span>
      <span className={`text-right ${bold ? "font-bold text-slate-900" : "text-slate-800"}`}>{val || "—"}</span>
    </div>
  );
}

function SurveyStageDetails({ surveys, onZoom }) {
  if (!surveys || surveys.length === 0) {
    return <div className="text-slate-500 italic">No survey data uploaded yet.</div>;
  }
  const s = surveys[0] || {};
  return (
    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 font-medium">
        <div>Roof Type: <strong className="text-slate-900">{s.roof_type || "RCC"}</strong></div>
        <div>Roof Area: <strong className="text-slate-900">{s.roof_area || "—"}</strong></div>
        <div>Structure Rec: <strong className="text-slate-900">{s.structure_recommendation || "—"}</strong></div>
        <div>Electrical Cond: <strong className="text-slate-900">{s.electrical_condition || "Good"}</strong></div>
      </div>
    </div>
  );
}

function DeliveryStageDetails({ deliveries }) {
  if (!deliveries || deliveries.length === 0) return <div className="text-slate-500 italic">No delivery records found.</div>;
  return (
    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 font-medium">
      <div>Delivered Items: {deliveries.map(d => d.product_name || d.product).join(", ")}</div>
    </div>
  );
}

function InstallationStageDetails({ installations, onZoom }) {
  if (!installations || installations.length === 0) return <div className="text-slate-500 italic">No installation records found.</div>;
  const inst = installations[0] || {};
  return (
    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1 font-medium">
      <div>Installer: <strong className="text-slate-900">{inst.installer_name || "Lead Installer"}</strong></div>
      <div>Wiring & Earthing Status: <strong className="text-slate-900">Completed</strong></div>
    </div>
  );
}

function VerificationStageDetails({ verifications, onZoom }) {
  if (!verifications || verifications.length === 0) return <div className="text-slate-500 italic">No verification records found.</div>;
  return <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">Verification Inspection Completed.</div>;
}

function HandoverStageDetails({ handovers, onZoom }) {
  if (!handovers || handovers.length === 0) return <div className="text-slate-500 italic">No handover records found.</div>;
  return <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">System Handed Over to Client.</div>;
}

function MeterStageDetails({ meters }) {
  if (!meters || meters.length === 0) return <div className="text-slate-500 italic">No meter testing records found.</div>;
  return <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">Meter Testing Submitted / Verified.</div>;
}

// ─── EDIT CLIENT DIALOG ──────────────────────────────────────────────────────
function EditClientDialog({ form, setForm, onClose, onSave }) {
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Client Workspace</DialogTitle>
          <DialogDescription>Update client and solar specification details.</DialogDescription>
        </DialogHeader>
        <div className="grid md:grid-cols-2 gap-3 py-2 text-xs">
          <div><Label className="text-xs">Full Name</Label><Input value={form.full_name} onChange={e => setF("full_name", e.target.value)} className="mt-1" /></div>
          <div><Label className="text-xs">Mobile Number</Label><Input value={form.mobile} onChange={e => setF("mobile", e.target.value)} className="mt-1" /></div>
          <div><Label className="text-xs">City</Label><Input value={form.city} onChange={e => setF("city", e.target.value)} className="mt-1" /></div>
          <div><Label className="text-xs">Consumer Number</Label><Input value={form.consumer_number} onChange={e => setF("consumer_number", e.target.value)} className="mt-1" /></div>
          <div><Label className="text-xs">Required Capacity (kW)</Label><Input type="number" value={form.system_kw} onChange={e => setF("system_kw", e.target.value)} className="mt-1" /></div>
          <div><Label className="text-xs">Panel Brand</Label><Input value={form.panel_make} onChange={e => setF("panel_make", e.target.value)} className="mt-1" /></div>
          <div><Label className="text-xs">Inverter Brand</Label><Input value={form.inverter_make} onChange={e => setF("inverter_make", e.target.value)} className="mt-1" /></div>
          <div><Label className="text-xs">Inverter Capacity</Label><Input value={form.inverter_capacity} onChange={e => setF("inverter_capacity", e.target.value)} className="mt-1" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} className="bg-blue-600">Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── EDIT SYSTEM SPECS DIALOG ────────────────────────────────────────────────
function EditSystemSpecsDialog({ form, setForm, onClose, onSave }) {
  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const addInverterRow = () => {
    setForm((prev) => ({
      ...prev,
      inverters: [...(prev.inverters || []), { brand: "", capacity: "", quantity: 1, serials: [""] }],
    }));
  };

  const updateInverterRow = (idx, field, val) => {
    setForm((prev) => {
      const list = [...(prev.inverters || [])];
      list[idx] = { ...list[idx], [field]: val };
      return { ...prev, inverters: list };
    });
  };

  const updateInverterQuantity = (idx, val) => {
    const qty = Math.max(1, parseInt(val) || 1);
    setForm((prev) => {
      const list = [...(prev.inverters || [])];
      const inv = list[idx] || {};
      const currentSerials = Array.isArray(inv.serials) ? inv.serials : (inv.serial ? inv.serial.split(",").map(s => s.trim()) : []);
      let newSerials = [...currentSerials];
      if (newSerials.length < qty) {
        while (newSerials.length < qty) newSerials.push("");
      } else if (newSerials.length > qty) {
        newSerials = newSerials.slice(0, qty);
      }
      list[idx] = {
        ...inv,
        quantity: qty,
        serials: newSerials,
        serial: newSerials.filter(Boolean).join(", ")
      };
      return { ...prev, inverters: list };
    });
  };

  const updateInverterSerial = (idx, sIdx, val) => {
    setForm((prev) => {
      const list = [...(prev.inverters || [])];
      const inv = list[idx] || {};
      const qty = Math.max(1, Number(inv.quantity) || 1);
      let serials = Array.isArray(inv.serials) ? [...inv.serials] : (inv.serial ? inv.serial.split(",").map(s => s.trim()) : []);
      while (serials.length < qty) serials.push("");
      serials[sIdx] = val;
      list[idx] = {
        ...inv,
        serials: serials,
        serial: serials.filter(Boolean).join(", ")
      };
      return { ...prev, inverters: list };
    });
  };

  const removeInverterRow = (idx) => {
    setForm((prev) => ({
      ...prev,
      inverters: (prev.inverters || []).filter((_, i) => i !== idx),
    }));
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900">
            <Zap className="w-5 h-5 text-amber-600" /> Edit System Specifications
          </DialogTitle>
          <DialogDescription>Update solar capacity, panel details, inverter configuration, and sanction details.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* General Solar System Parameters */}
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Required Capacity (kW)</Label>
              <Input type="number" step="0.1" value={form.system_kw} onChange={(e) => setF("system_kw", e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Panel Make / Brand</Label>
              <Input value={form.panel_brand} onChange={(e) => setF("panel_brand", e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Panel Technology</Label>
              <Input value={form.panel_technology} onChange={(e) => setF("panel_technology", e.target.value)} placeholder="e.g. Mono PERC, TopCon" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Panel Wattage (W)</Label>
              <Input type="number" value={form.panel_wattage} onChange={(e) => setF("panel_wattage", e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Number of Panels</Label>
              <Input type="number" value={form.num_panels} onChange={(e) => setF("num_panels", e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Phase Type</Label>
              <Select value={form.phase_type} onValueChange={(v) => setF("phase_type", v)}>
                <SelectTrigger className="mt-1 text-xs">
                  <SelectValue placeholder="Select Phase" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Single Phase">Single Phase</SelectItem>
                  <SelectItem value="Three Phase">Three Phase</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Sanction Number</Label>
              <Input value={form.sanction_number} onChange={(e) => setF("sanction_number", e.target.value)} className="mt-1" />
            </div>
          </div>

          {/* Inverter Configuration Section */}
          <div className="border-t border-slate-200 pt-3 mt-3">
            <div className="mb-2">
              <Label className="text-xs font-bold text-slate-900">Inverter Configuration</Label>
              <p className="text-[11px] text-slate-500">Configure inverter brands, capacities, quantities, and serial numbers</p>
            </div>

            <div className="space-y-3">
              {(form.inverters || []).map((inv, idx) => {
                const qty = Math.max(1, Number(inv.quantity) || 1);
                const serials = Array.isArray(inv.serials) && inv.serials.length === qty
                  ? inv.serials
                  : Array.from({ length: qty }).map((_, i) => (inv.serials?.[i] !== undefined ? inv.serials[i] : (i === 0 ? inv.serial || "" : "")));

                return (
                  <div key={idx} className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                      <span className="font-semibold text-xs text-slate-700">INVERTER {idx + 1}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeInverterRow(idx)}
                        className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 gap-1 px-2 cursor-pointer"
                        title="Delete Inverter Entry"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete Inverter
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <Label className="text-[10px] font-semibold text-slate-500">Brand</Label>
                        <Input
                          value={inv.brand || ""}
                          onChange={(e) => updateInverterRow(idx, "brand", e.target.value)}
                          placeholder="e.g. UTL / Growatt"
                          className="h-8 text-xs bg-white mt-0.5"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] font-semibold text-slate-500">Capacity (kW)</Label>
                        <Input
                          value={inv.capacity || ""}
                          onChange={(e) => updateInverterRow(idx, "capacity", e.target.value)}
                          placeholder="e.g. 5 kW"
                          className="h-8 text-xs bg-white mt-0.5"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] font-semibold text-slate-500">Quantity</Label>
                        <Input
                          type="number"
                          min="1"
                          value={inv.quantity || 1}
                          onChange={(e) => updateInverterQuantity(idx, e.target.value)}
                          placeholder="1"
                          className="h-8 text-xs bg-white mt-0.5"
                        />
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200/70">
                      <div className="text-[11px] font-semibold text-slate-600 mb-1.5">
                        Serial Numbers ({qty})
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {Array.from({ length: qty }).map((_, sIdx) => (
                          <Input
                            key={sIdx}
                            value={serials[sIdx] || ""}
                            onChange={(e) => updateInverterSerial(idx, sIdx, e.target.value)}
                            placeholder={`Serial #${sIdx + 1}`}
                            className="h-7 text-xs bg-white font-mono"
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addInverterRow}
                  className="text-xs border-amber-300 text-amber-800 hover:bg-amber-50 gap-1 font-semibold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Inverter
                </Button>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} className="bg-amber-600 hover:bg-amber-700 text-white">Save Specifications</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── UPLOAD PHOTO DIALOG ─────────────────────────────────────────────────────
function UploadPhotoDialog({ open, onClose, queryClient, clientId }) {
  const [file, setFile] = useState(null);
  const [stage, setStage] = useState("Survey");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(null);

  const reset = () => {
    setFile(null);
    setStage("Survey");
    setLocation("");
    setDescription("");
    setUploading(false);
    setProgress(null);
  };

  const handleClose = () => {
    if (uploading) return;
    reset();
    onClose();
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const compressImageFile = async (f) => {
    if (!f || !f.type || !f.type.startsWith("image/") || f.size <= 1024 * 1024) {
      return f;
    }
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(f);
      reader.onload = (e) => {
        const img = new Image();
        img.src = e.target.result;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let { width, height } = img;
          const maxDim = 2400;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (!blob) return resolve(f);
              const compressedFile = new File([blob], f.name, {
                type: "image/jpeg",
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            },
            "image/jpeg",
            0.85
          );
        };
        img.onerror = () => resolve(f);
      };
      reader.onerror = () => resolve(f);
    });
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error("Please select a photo to upload");
      return;
    }
    try {
      setUploading(true);
      setProgress(15);
      const processedFile = await compressImageFile(file);
      setProgress(30);

      const fd = new FormData();
      fd.append("file", processedFile);
      fd.append("category", "project_photos");

      const { data: uploadRes } = await api.post("/files/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (ev) => {
          if (ev.total) {
            const p = Math.round((ev.loaded * 100) / ev.total);
            setProgress(30 + Math.round(p * 0.6));
          }
        },
      });

      setProgress(95);
      await api.post(`/clients/${clientId}/photos`, {
        file_id: uploadRes.id,
        stage: stage || "Survey",
        location: location || "",
        description: description || "",
      });

      setProgress(100);
      toast.success("Photo uploaded successfully");
      invalidateAllClientQueries(queryClient, clientId);
      reset();
      onClose();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  if (!open) return null;

  return (
    <Dialog open onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900">
            <ImageIcon className="w-5 h-5 text-emerald-600" /> Upload Project Photo
          </DialogTitle>
          <DialogDescription>Add a new site photo to the project gallery.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 text-xs">
          <div>
            <Label className="text-xs">Select Photo</Label>
            <Input type="file" accept="image/*" onChange={handleFileChange} disabled={uploading} className="mt-1" />
            {file && (
              <div className="text-[11px] text-slate-500 mt-1">
                Selected: {file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs">Project Stage</Label>
            <Select value={stage} onValueChange={setStage} disabled={uploading}>
              <SelectTrigger className="mt-1 text-xs">
                <SelectValue placeholder="Select Stage" />
              </SelectTrigger>
              <SelectContent>
                {STAGES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Location / Area</Label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Roof Area, Inverter Wall, Meter Box"
              disabled={uploading}
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-xs">Description (Optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add optional notes about this photo"
              rows={2}
              disabled={uploading}
              className="mt-1 text-xs"
            />
          </div>

          {uploading && (
            <div className="space-y-1.5 pt-2">
              <div className="flex justify-between text-xs font-semibold text-slate-700">
                <span>{progress === 100 ? "Uploaded" : "Uploading..."}</span>
                <span>{progress !== null ? `${progress}%` : "Processing..."}</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-600 transition-all duration-200"
                  style={{ width: `${progress || 0}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={uploading}>Cancel</Button>
          <Button onClick={handleUpload} disabled={uploading || !file} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {uploading ? "Uploading..." : "Upload Photo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── RECORD PAYMENT MODAL ────────────────────────────────────────────────────
function RecordPaymentModal({ clientId, onClose, onSuccess }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    amount: "",
    milestone_name: "Advance Payment",
    payment_date: dayjs().format("YYYY-MM-DD"),
    payment_mode: "Bank Transfer / UTR",
    ref_number: "",
    notes: ""
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    try {
      setSaving(true);
      await api.post(`/clients/${clientId}/payments`, {
        amount: Number(form.amount),
        milestone_name: form.milestone_name,
        payment_date: form.payment_date,
        payment_mode: form.payment_mode,
        ref_number: form.ref_number,
        notes: form.notes
      });
      toast.success("Payment recorded successfully");
      queryClient.invalidateQueries(["client", clientId, "financials"]);
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900">
            <DollarSign className="w-5 h-5 text-emerald-600" /> Record Client Payment
          </DialogTitle>
          <DialogDescription>Log a milestone or advance payment for this project.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2 text-xs">
          <div>
            <Label className="text-xs">Milestone Name</Label>
            <Input value={form.milestone_name} onChange={(e) => setForm({ ...form, milestone_name: e.target.value })} placeholder="e.g. Advance Payment" className="mt-1 text-xs" />
          </div>
          <div>
            <Label className="text-xs">Amount Received (₹)</Label>
            <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="250000" className="mt-1 text-xs font-semibold" />
          </div>
          <div>
            <Label className="text-xs">Payment Date</Label>
            <Input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} className="mt-1 text-xs" />
          </div>
          <div>
            <Label className="text-xs">Payment Mode</Label>
            <Select value={form.payment_mode} onValueChange={(v) => setForm({ ...form, payment_mode: v })}>
              <SelectTrigger className="mt-1 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Bank Transfer / UTR">Bank Transfer / UTR</SelectItem>
                <SelectItem value="Cheque">Cheque</SelectItem>
                <SelectItem value="UPI">UPI</SelectItem>
                <SelectItem value="Cash">Cash</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">UTR / Ref Number</Label>
            <Input value={form.ref_number} onChange={(e) => setForm({ ...form, ref_number: e.target.value })} placeholder="Transaction UTR" className="mt-1 text-xs font-mono" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {saving ? "Saving..." : "Save Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── RECORD EXPENSE MODAL ────────────────────────────────────────────────────
function RecordExpenseModal({ clientId, onClose, onSuccess }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    category: "BOS Material",
    amount: "",
    description: "",
    vendor_name: "",
    payment_mode: "Cash/UPI",
    ref_number: ""
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error("Please enter a valid expense amount");
      return;
    }
    try {
      setSaving(true);
      await api.post(`/clients/${clientId}/expenses`, {
        category: form.category,
        amount: Number(form.amount),
        description: form.description,
        vendor_name: form.vendor_name,
        payment_mode: form.payment_mode,
        ref_number: form.ref_number
      });
      toast.success("Expense logged successfully");
      queryClient.invalidateQueries(["client", clientId, "financials"]);
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900">
            <Truck className="w-5 h-5 text-amber-600" /> Log Project Expense
          </DialogTitle>
          <DialogDescription>Log a direct expense item allocated to this project.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2 text-xs">
          <div>
            <Label className="text-xs">Expense Category</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger className="mt-1 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Solar Panels">Solar Panels</SelectItem>
                <SelectItem value="Inverters">Inverters</SelectItem>
                <SelectItem value="BOS Material">BOS Material</SelectItem>
                <SelectItem value="Structure">Structure</SelectItem>
                <SelectItem value="Electrical Material">Electrical Material</SelectItem>
                <SelectItem value="Labour">Labour</SelectItem>
                <SelectItem value="Installation">Installation</SelectItem>
                <SelectItem value="Transportation">Transportation</SelectItem>
                <SelectItem value="Gov/Doc charges">Gov/Doc charges</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Expense Amount (₹)</Label>
            <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="15000" className="mt-1 text-xs font-semibold" />
          </div>
          <div>
            <Label className="text-xs">Vendor Name (Optional)</Label>
            <Input value={form.vendor_name} onChange={(e) => setForm({ ...form, vendor_name: e.target.value })} placeholder="e.g. Local Transport / Hardware vendor" className="mt-1 text-xs" />
          </div>
          <div>
            <Label className="text-xs">Description / Remarks</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Expense description" className="mt-1 text-xs" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-amber-600 hover:bg-amber-700 text-white">
            {saving ? "Logging..." : "Log Expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── CREATE WARRANTY MODAL ───────────────────────────────────────────────────
function CreateWarrantyModal({ clientId, onClose, onSuccess }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    product_type: "Solar Panel",
    brand: "",
    model: "",
    serial_number: "",
    warranty_start: dayjs().format("YYYY-MM-DD"),
    warranty_end: dayjs().add(25, "year").format("YYYY-MM-DD"),
    provider: "Manufacturer"
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    try {
      setSaving(true);
      await api.post(`/clients/${clientId}/warranties`, form);
      toast.success("Warranty record created");
      queryClient.invalidateQueries(["client", clientId, "warranties"]);
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900">
            <ShieldCheck className="w-5 h-5 text-emerald-600" /> Create Equipment Warranty
          </DialogTitle>
          <DialogDescription>Register panel or inverter warranty details.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2 text-xs">
          <div>
            <Label className="text-xs">Product Type</Label>
            <Select value={form.product_type} onValueChange={(v) => setForm({ ...form, product_type: v })}>
              <SelectTrigger className="mt-1 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Solar Panel">Solar Panel</SelectItem>
                <SelectItem value="Inverter">Inverter</SelectItem>
                <SelectItem value="Structure & Mounting">Structure & Mounting</SelectItem>
                <SelectItem value="BOS Equipment">BOS Equipment</SelectItem>
                <SelectItem value="Workmanship">Workmanship</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Brand / Make</Label>
            <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="e.g. Rayzon / Growatt" className="mt-1 text-xs" />
          </div>
          <div>
            <Label className="text-xs">Serial Number</Label>
            <Input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} placeholder="Serial number" className="mt-1 text-xs font-mono" />
          </div>
          <div>
            <Label className="text-xs">Warranty Start Date</Label>
            <Input type="date" value={form.warranty_start} onChange={(e) => setForm({ ...form, warranty_start: e.target.value })} className="mt-1 text-xs" />
          </div>
          <div>
            <Label className="text-xs">Warranty End Date</Label>
            <Input type="date" value={form.warranty_end} onChange={(e) => setForm({ ...form, warranty_end: e.target.value })} className="mt-1 text-xs" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {saving ? "Saving..." : "Create Warranty"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── CREATE SERVICE VISIT MODAL ──────────────────────────────────────────────
function CreateServiceVisitModal({ clientId, onClose, onSuccess }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    visit_date: dayjs().format("YYYY-MM-DD"),
    technician_name: "",
    visit_type: "Routine Maintenance",
    system_status: "Operational",
    earth_resistance: "1.2 Ohms",
    fuses_status: "OK",
    inverter_condition: "Good",
    panel_condition: "Good",
    technician_remarks: ""
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    try {
      setSaving(true);
      await api.post(`/clients/${clientId}/service-visits`, form);
      toast.success("Service visit logged");
      queryClient.invalidateQueries(["client", clientId, "service-visits"]);
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900">
            <Wrench className="w-5 h-5 text-blue-600" /> Log Maintenance Service Visit
          </DialogTitle>
          <DialogDescription>Record AMC checkup, generation observation, and health checks.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2 text-xs">
          <div>
            <Label className="text-xs">Visit Date</Label>
            <Input type="date" value={form.visit_date} onChange={(e) => setForm({ ...form, visit_date: e.target.value })} className="mt-1 text-xs" />
          </div>
          <div>
            <Label className="text-xs">Technician Name</Label>
            <Input value={form.technician_name} onChange={(e) => setForm({ ...form, technician_name: e.target.value })} placeholder="Technician name" className="mt-1 text-xs" />
          </div>
          <div>
            <Label className="text-xs">Earth Resistance</Label>
            <Input value={form.earth_resistance} onChange={(e) => setForm({ ...form, earth_resistance: e.target.value })} placeholder="e.g. 1.5 Ohms" className="mt-1 text-xs" />
          </div>
          <div>
            <Label className="text-xs">Technician Remarks</Label>
            <Input value={form.technician_remarks} onChange={(e) => setForm({ ...form, technician_remarks: e.target.value })} placeholder="Checkup observations" className="mt-1 text-xs" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
            {saving ? "Logging..." : "Log Service Visit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
