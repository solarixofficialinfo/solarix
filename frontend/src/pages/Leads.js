import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api, { API, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { usePermission } from "@/lib/permissions";
import { useEmployeeList } from "@/hooks/useTeam";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import dayjs from "dayjs";
import {
  Plus, Search, Phone, Calendar, Clock, UserCheck, CheckCircle2,
  Pencil, Trash2, Zap, Layers, User, AlertCircle, ExternalLink,
  PhoneCall, ShieldAlert, Sparkles, Check, ArrowRight,
  Link as LinkIcon, Copy, RefreshCw, Paperclip, Download, Eye, Globe,
  FileText, X
} from "lucide-react";

import PageHeader from "@/components/PageHeader";
import ManagementBar from "@/components/ManagementBar";
import TableSkeleton from "@/components/TableSkeleton";

export const LEAD_STAGES = [
  "New Lead",
  "Contacted",
  "Interested",
  "Quotation Pending",
  "Quotation Sent",
  "Follow-up",
  "Confirmed",
  "Not Interested",
  "Lost"
];

export const QUOTATION_STATUSES = [
  "Not Sent",
  "Pending",
  "Sent",
  "Approved",
  "Revised",
  "Rejected"
];

export const FOLLOWUP_TYPES = [
  "Call",
  "Site Visit",
  "Meeting",
  "WhatsApp",
  "Email",
  "Other"
];

const STAGE_BADGES = {
  "New Lead": "bg-blue-50 text-blue-700 border-blue-200",
  "Contacted": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "Interested": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Quotation Pending": "bg-amber-50 text-amber-700 border-amber-200",
  "Quotation Sent": "bg-purple-50 text-purple-700 border-purple-200",
  "Follow-up": "bg-orange-50 text-orange-700 border-orange-200",
  "Confirmed": "bg-emerald-600 text-white font-semibold",
  "Not Interested": "bg-slate-100 text-slate-600 border-slate-200",
  "Lost": "bg-rose-50 text-rose-700 border-rose-200",
  // Legacy aliases
  "NEW": "bg-blue-50 text-blue-700 border-blue-200",
  "FINAL": "bg-emerald-600 text-white font-semibold",
  "ONBOARDING": "bg-emerald-600 text-white font-semibold",
  "CONVERTED": "bg-emerald-600 text-white font-semibold",
};

export default function Leads() {
  const { user } = useAuth();
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const { data: employees = [] } = useEmployeeList();

  const canView = usePermission("leads", "view");
  const canCreate = usePermission("leads", "create");
  const canEdit = usePermission("leads", "edit");
  const canDelete = usePermission("leads", "delete");
  const canConfirm = usePermission("leads", "approve");

  const isAdmin = user?.role === "Admin" || user?.role === "Super Admin" || user?.role === "Platform Owner" || user?.role === "Owner";
  const canViewTeam = isAdmin || canConfirm || user?.permissions?.leads?.approve === true;

  const [activeTab, setActiveTab] = useState("leads"); // TAB 1: leads, followups
  const [scope, setScope] = useState(canViewTeam ? "team" : "mine");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);

  // Filters
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [assignedFilter, setAssignedFilter] = useState("all");
  const [followupFilter, setFollowupFilter] = useState("all");

  // Modals
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [defaultModalTab, setDefaultModalTab] = useState("basic");

  // Public Sales Link State
  const [salesLink, setSalesLink] = useState(null);
  const [salesLinkModalOpen, setSalesLinkModalOpen] = useState(false);
  const [regeneratingToken, setRegeneratingToken] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Fetch Public Sales Link
  const fetchSalesLink = useCallback(async () => {
    try {
      const res = await api.get("/sales-link");
      setSalesLink(res.data);
    } catch (e) {
      console.warn("Failed to fetch sales link", e);
    }
  }, []);

  useEffect(() => {
    fetchSalesLink();
  }, [fetchSalesLink]);

  const handleRegenerateSalesLink = async () => {
    if (!window.confirm("Regenerating this link will immediately invalidate the previous public link. Any prospective customer who has the old URL will no longer be able to submit. Are you sure you want to regenerate?")) {
      return;
    }
    setRegeneratingToken(true);
    try {
      const res = await api.post("/sales-link/regenerate");
      setSalesLink(res.data);
      toast.success("Sales Link regenerated with new secure token!");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setRegeneratingToken(false);
    }
  };

  const handleCopySalesLink = () => {
    const activeToken = salesLink?.public_token || salesLink?.token || "";
    const url = `${window.location.origin}/s/${activeToken}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    toast.success("Public Sales Link copied to clipboard!");
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Load Leads Data
  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const [leadsRes, statsRes] = await Promise.all([
        api.get("/leads", {
          params: {
            scope,
            stage: stageFilter !== "all" ? stageFilter : undefined,
            source: sourceFilter !== "all" ? sourceFilter : undefined,
            assigned_to: assignedFilter !== "all" ? assignedFilter : undefined,
            followup_filter: followupFilter !== "all" ? followupFilter : undefined,
            search: search.trim() || undefined,
            page,
            page_size: 25,
          },
        }),
        api.get("/leads/stats", { params: { scope } }),
      ]);
      setLeads(leadsRes.data.items || []);
      setTotal(leadsRes.data.total || 0);
      setStats(statsRes.data || null);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [scope, stageFilter, sourceFilter, assignedFilter, followupFilter, search, page]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  // Handle Confirm Lead (IDEMPOTENT WORKFLOW INTEGRATION)
  const handleConfirmLead = async (lead) => {
    if (!canConfirm) {
      toast.error("You do not have permission to confirm leads.");
      return;
    }

    // 1. Check if lead is already converted and linked to a client
    const existingClientId = lead.converted_client_id || lead.client_id;
    if (existingClientId) {
      toast.info(`This lead is already confirmed & linked to Client (${lead.converted_sol_id || "SOL"}). Opening client profile...`);
      nav(`/clients/${existingClientId}`);
      return;
    }

    try {
      // 2. Mark lead as Confirmed on backend
      const res = await api.post(`/leads/${lead.id}/confirm`);
      const confirmedLead = res.data?.lead || lead;

      if (res.data?.already_converted && res.data?.client_id) {
        toast.info(`This lead is already converted to Client ${res.data.sol_id || ""}. Reopening client...`);
        nav(`/clients/${res.data.client_id}`);
        return;
      }

      toast.success("Lead marked as Confirmed! Opening Client Onboarding with pre-filled details...");
      queryClient.invalidateQueries(queryKeys.leads.all());

      // 3. Open EXISTING Client Onboarding (/clients/new) with pre-filled state
      nav("/clients/new", { state: { lead: confirmedLead } });
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  // Handle Delete Lead
  const handleDeleteLead = async (lead) => {
    if (!canDelete) {
      toast.error("You do not have permission to delete leads.");
      return;
    }
    if (!window.confirm(`Are you sure you want to delete lead "${lead.name}" (${lead.lead_no})?`)) {
      return;
    }
    try {
      await api.delete(`/leads/${lead.id}`);
      toast.success("Lead deleted successfully");
      queryClient.invalidateQueries(queryKeys.leads.all());
      loadLeads();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const statCards = [
    { label: "Total Leads", v: stats?.total_leads || total, icon: Layers, color: "blue" },
    { label: "New Leads", v: stats?.new_leads || 0, icon: Zap, color: "indigo" },
    { label: "In Follow-up", v: stats?.in_followup || 0, icon: Clock, color: "amber" },
    { label: "Confirmed", v: stats?.confirmed || 0, icon: CheckCircle2, color: "emerald" },
    { label: "Lost / Dropped", v: stats?.lost || 0, icon: AlertCircle, color: "rose" },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Top Page Header */}
      <PageHeader
        title="Leads Management"
        subtitle="Track solar sales prospects, schedule follow-ups, and convert qualified leads to the client onboarding workflow."
        badge={`${total} Leads`}
        actions={
          <div className="flex items-center gap-3 flex-wrap">
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-xs" data-testid="lead-scope-toggle">
              <button
                type="button"
                onClick={() => { setScope("mine"); setPage(1); }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${scope === "mine" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-50"}`}
                data-testid="scope-mine-btn"
              >
                My Leads {stats?.my_leads_total !== undefined ? `(${stats.my_leads_total})` : ""}
              </button>
              {canViewTeam && (
                <button
                  type="button"
                  onClick={() => { setScope("team"); setPage(1); }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${scope === "team" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-50"}`}
                  data-testid="scope-team-btn"
                >
                  All Team Leads {stats?.team_leads_total !== undefined ? `(${stats.team_leads_total})` : ""}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setSalesLinkModalOpen(true)}
                className="border-blue-200 text-blue-700 bg-blue-50/70 hover:bg-blue-100 shadow-xs text-xs font-semibold"
                data-testid="public-sales-link-btn"
                title="View and copy company-branded public sales inquiry link"
              >
                <LinkIcon className="w-3.5 h-3.5 mr-1.5 text-blue-600" /> Public Sales Link
              </Button>
              {canCreate && (
                <Button
                  onClick={() => { setSelectedLead(null); setDefaultModalTab("basic"); setFormModalOpen(true); }}
                  className="bg-blue-600 hover:bg-blue-700 shadow-xs"
                  data-testid="add-lead-btn"
                >
                  <Plus className="w-4 h-4 mr-1.5" /> Add Lead
                </Button>
              )}
            </div>
          </div>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3" data-testid="lead-stats-grid">
        {statCards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="p-4 border-slate-200 card-lift">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">{c.label}</div>
                <div className={`w-7 h-7 rounded-lg bg-${c.color}-50 text-${c.color}-600 flex items-center justify-center shrink-0`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-2xl font-semibold text-slate-900 tabular-nums" style={{ fontFamily: "Outfit" }}>{c.v}</div>
            </Card>
          );
        })}
      </div>

      {/* TAB 1 — LEADS */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-white border border-slate-200 p-1 rounded-xl shadow-xs">
          <TabsTrigger value="leads" className="text-xs font-semibold gap-1.5 px-4 py-2">
            <Layers className="w-4 h-4 text-blue-600" /> TAB 1 — LEADS
          </TabsTrigger>
          <TabsTrigger value="followups" className="text-xs font-semibold gap-1.5 px-4 py-2">
            <Clock className="w-4 h-4 text-amber-600" /> Follow-ups Schedule
            {stats?.followups_due > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-amber-500 text-white rounded-full text-[10px] font-bold">
                {stats.followups_due}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="leads" className="space-y-4">
          {/* Management Bar & Filters */}
          <ManagementBar
            searchQuery={search}
            onSearchChange={(v) => { setSearch(v); setPage(1); }}
            searchPlaceholder="Search by name, phone, city, or Lead ID..."
            itemCount={total}
            itemLabel="Leads"
            filters={
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={stageFilter} onValueChange={(v) => { setStageFilter(v); setPage(1); }}>
                  <SelectTrigger className="w-40 h-9 text-xs"><SelectValue placeholder="All Stages" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Stages</SelectItem>
                    {LEAD_STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>

                <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setPage(1); }}>
                  <SelectTrigger className="w-36 h-9 text-xs"><SelectValue placeholder="All Sources" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sources</SelectItem>
                    <SelectItem value="sales_link">Sales Link</SelectItem>
                    <SelectItem value="manual">Manual / Other</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={followupFilter} onValueChange={(v) => { setFollowupFilter(v); setPage(1); }}>
                  <SelectTrigger className="w-36 h-9 text-xs"><SelectValue placeholder="All Follow-ups" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Schedules</SelectItem>
                    <SelectItem value="today">Due Today</SelectItem>
                    <SelectItem value="tomorrow">Due Tomorrow</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="upcoming">Upcoming</SelectItem>
                    <SelectItem value="none">No Follow-up</SelectItem>
                  </SelectContent>
                </Select>

                {canViewTeam && (
                  <Select value={assignedFilter} onValueChange={(v) => { setAssignedFilter(v); setPage(1); }}>
                    <SelectTrigger className="w-40 h-9 text-xs"><SelectValue placeholder="Assigned Worker" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Team Members</SelectItem>
                      {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            }
          />

          {/* LEADS TABLE / CARDS */}
          {loading ? (
            <TableSkeleton rows={6} />
          ) : leads.length === 0 ? (
            <Card className="p-12 text-center border-slate-200 border-dashed bg-slate-50/50">
              <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
                <Search className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold text-slate-800">No Solar Leads Found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
                {search || stageFilter !== "all" || followupFilter !== "all"
                  ? "Try clearing filters to find matching leads."
                  : "Add your first prospect to initiate follow-ups and client onboarding."}
              </p>
              {canCreate && (
                <Button onClick={() => { setSelectedLead(null); setFormModalOpen(true); }} className="bg-blue-600 hover:bg-blue-700 text-xs">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add New Lead
                </Button>
              )}
            </Card>
          ) : (
            <Card className="border-slate-200 overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-3 px-3.5">Lead Name & ID</th>
                      <th className="py-3 px-3">Phone Number</th>
                      <th className="py-3 px-3">Req. System Size</th>
                      <th className="py-3 px-3">Offer / Proposed Price</th>
                      <th className="py-3 px-3">Stage</th>
                      <th className="py-3 px-3">Quotation Status</th>
                      <th className="py-3 px-3">Follow-up Status / Date</th>
                      <th className="py-3 px-3 text-center">Solar Meter</th>
                      <th className="py-3 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {leads.map((lead) => {
                      const isConfirmed = lead.stage === "Confirmed" || lead.converted_client_id;
                      const hasClientLink = !!lead.converted_client_id;
                      const fDate = lead.followup_date || (lead.next_followup_at ? lead.next_followup_at.slice(0, 10) : "");
                      const todayStr = dayjs().format("YYYY-MM-DD");
                      const isOverdue = fDate && fDate < todayStr && !isConfirmed;
                      const isToday = fDate === todayStr;

                      return (
                        <tr key={lead.id} className="hover:bg-slate-50/70 transition-colors">
                          {/* Lead Name & ID */}
                          <td className="py-3 px-3.5">
                            <div className="font-semibold text-slate-900 flex items-center gap-1.5 flex-wrap">
                              <span>{lead.name}</span>
                              {lead.source === "sales_link" && (
                                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] font-semibold py-0 px-1.5 flex items-center gap-1">
                                  <LinkIcon className="w-2.5 h-2.5" /> Sales Link
                                </Badge>
                              )}
                              {lead.documents && lead.documents.length > 0 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedLead(lead);
                                    setDefaultModalTab("documents");
                                    setFormModalOpen(true);
                                  }}
                                  className="bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 px-1.5 py-0.5 rounded text-[10px] font-semibold inline-flex items-center gap-1 transition"
                                  title="View uploaded documents"
                                >
                                  <Paperclip className="w-2.5 h-2.5" />
                                  {lead.documents.length} doc{lead.documents.length === 1 ? "" : "s"}
                                </button>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
                              <span>{lead.lead_no || "—"}</span>
                              {lead.city && (
                                <>
                                  <span>•</span>
                                  <span className="text-slate-500 font-sans">{lead.city}</span>
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-1 flex-wrap">
                              <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-medium">
                                Assigned: <strong className="font-semibold text-slate-900">{lead.assigned_to_name || "Unassigned"}</strong>
                              </span>
                              {lead.created_by_name && (
                                <span className="text-slate-400 text-[10px]">
                                  • Created by: {lead.created_by_name}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Phone Number */}
                          <td className="py-3 px-3">
                            <a
                              href={`tel:${lead.mobile}`}
                              className="font-mono text-slate-800 hover:text-blue-600 flex items-center gap-1"
                              title="Click to call"
                            >
                              <Phone className="w-3 h-3 text-slate-400" />
                              {lead.mobile}
                            </a>
                            {lead.alt_mobile && (
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                Alt: {lead.alt_mobile}
                              </div>
                            )}
                          </td>

                          {/* Requested System Size */}
                          <td className="py-3 px-3">
                            <div className="font-semibold text-slate-900 tabular-nums">
                              {lead.system_kw || lead.estimated_kw ? `${lead.system_kw || lead.estimated_kw} kW` : "—"}
                            </div>
                            <div className="text-[10px] text-slate-400 capitalize">
                              {lead.customer_type || lead.consumer_type || "Rooftop Solar"}
                              {lead.system_requirement && ` • ${lead.system_requirement === "KW System Only" ? "KW Only" : "Full EPC"}`}
                            </div>
                          </td>

                          {/* Offer / Proposed Price */}
                          <td className="py-3 px-3 font-semibold text-slate-900 tabular-nums">
                            <div>
                              {lead.proposed_price || lead.offer_price || lead.offering_amount
                                ? `₹${Number(lead.proposed_price || lead.offer_price || lead.offering_amount).toLocaleString("en-IN")}`
                                : "—"}
                            </div>
                            {lead.offering_amount && (lead.proposed_price || lead.offer_price) && (
                              <div className="text-[10px] text-slate-400 font-normal">
                                Target: ₹{Number(lead.offering_amount).toLocaleString("en-IN")}
                              </div>
                            )}
                            {lead.monthly_bill > 0 && (
                              <div className="text-[10px] text-slate-400 font-normal font-mono">
                                Bill: ₹{Number(lead.monthly_bill).toLocaleString("en-IN")}/mo
                              </div>
                            )}
                          </td>

                          {/* Stage */}
                          <td className="py-3 px-3">
                            <Badge
                              variant="outline"
                              className={`text-[11px] px-2 py-0.5 font-medium inline-flex items-center gap-1 ${STAGE_BADGES[lead.stage] || "bg-slate-100 text-slate-700 border-slate-200"}`}
                            >
                              {lead.stage}
                            </Badge>
                          </td>

                          {/* Quotation Status */}
                          <td className="py-3 px-3">
                            <div className="text-slate-800 font-medium">
                              {lead.quotation_status || "Not Sent"}
                            </div>
                            {lead.quotation_no && (
                              <div className="text-[10px] text-slate-400 font-mono">
                                Ref: {lead.quotation_no}
                              </div>
                            )}
                          </td>

                          {/* Follow-up Status / Date */}
                          <td className="py-3 px-3">
                            {fDate ? (
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1 text-slate-800 font-mono text-[11px]">
                                  <Calendar className="w-3 h-3 text-slate-400" />
                                  <span>{fDate}</span>
                                  {lead.followup_time && (
                                    <span className="text-slate-500 font-sans">({lead.followup_time})</span>
                                  )}
                                </div>
                                <div>
                                  {isOverdue ? (
                                    <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-[9px] py-0 px-1">
                                      Overdue
                                    </Badge>
                                  ) : isToday ? (
                                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[9px] py-0 px-1">
                                      Due Today
                                    </Badge>
                                  ) : (
                                    <span className="text-[10px] text-slate-400">Scheduled</span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">No follow-up</span>
                            )}
                          </td>

                          {/* Solar Meter Requirement */}
                          <td className="py-3 px-3 text-center">
                            {lead.solar_meter_required === "Yes" ? (
                              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-[10px] font-semibold">
                                Required
                              </Badge>
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Open/Edit Action */}
                              {canEdit && (canViewTeam || String(lead.assigned_to) === String(user?.id)) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => { setSelectedLead(lead); setFormModalOpen(true); }}
                                  className="h-8 px-2 text-slate-600 hover:text-slate-900"
                                  title="Open & Edit Lead"
                                >
                                  <Pencil className="w-3.5 h-3.5 mr-1 text-slate-500" /> Edit
                                </Button>
                              )}

                              {/* Confirm Lead Action */}
                              {hasClientLink ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => nav(`/clients/${lead.converted_client_id}`)}
                                  className="h-8 px-2.5 bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 font-semibold text-[11px]"
                                  title="Reopen Client Record"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                                  {lead.converted_sol_id || "Client"} →
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  onClick={() => handleConfirmLead(lead)}
                                  disabled={!canConfirm}
                                  className="h-8 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] shadow-xs"
                                  title="Confirm Lead and Open Client Onboarding"
                                >
                                  <UserCheck className="w-3.5 h-3.5 mr-1" />
                                  Confirm Lead
                                </Button>
                              )}

                              {/* Delete Action */}
                              {canDelete && (canViewTeam || String(lead.assigned_to) === String(user?.id)) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteLead(lead)}
                                  className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600"
                                  title="Delete Lead"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {total > 25 && (
                <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <div>
                    Showing {(page - 1) * 25 + 1}–{Math.min(page * 25, total)} of {total} leads
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                      className="h-7 px-2 text-xs"
                    >
                      Previous
                    </Button>
                    <span className="px-2 font-mono">Page {page}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page * 25 >= total}
                      onClick={() => setPage((p) => p + 1)}
                      className="h-7 px-2 text-xs"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}
        </TabsContent>

        {/* TAB: Follow-ups Schedule Center */}
        <TabsContent value="followups">
          <FollowupsCenter
            scope={scope}
            onOpenLead={(lId) => {
              const target = leads.find((l) => l.id === lId);
              if (target) {
                setSelectedLead(target);
                setFormModalOpen(true);
              }
            }}
          />
        </TabsContent>
      </Tabs>

      {/* 3-TAB ADD / EDIT LEAD MODAL */}
      {formModalOpen && (
        <AddEditLeadModal
          initial={selectedLead}
          employees={employees}
          defaultTab={defaultModalTab}
          onClose={() => { setFormModalOpen(false); setSelectedLead(null); setDefaultModalTab("basic"); }}
          onSaved={() => {
            setFormModalOpen(false);
            setSelectedLead(null);
            setDefaultModalTab("basic");
            queryClient.invalidateQueries(queryKeys.leads.all());
            loadLeads();
          }}
        />
      )}

      {/* PUBLIC SALES LINK MANAGEMENT MODAL */}
      {salesLinkModalOpen && (
        <SalesLinkModal
          salesLink={salesLink}
          regenerating={regeneratingToken}
          copied={copiedLink}
          onCopy={handleCopySalesLink}
          onRegenerate={handleRegenerateSalesLink}
          onClose={() => setSalesLinkModalOpen(false)}
        />
      )}
    </div>
  );
}


// ─── 3-TAB ADD / EDIT LEAD MODAL ─────────────────────────────────────────────
function AddEditLeadModal({ initial, employees, defaultTab = "basic", onClose, onSaved }) {
  const { user } = useAuth();
  const [activeModalTab, setActiveModalTab] = useState(defaultTab || "basic");
  const [saving, setSaving] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const docInputRef = useRef(null);

  const isAdmin = user?.role === "Admin" || user?.role === "Super Admin" || user?.role === "Platform Owner" || user?.role === "Owner";
  const canConfirm = usePermission("leads", "approve");
  const canAssign = isAdmin || canConfirm || user?.permissions?.leads?.approve === true;

  const [form, setForm] = useState(() => {
    if (initial) {
      return {
        name: initial.name || "",
        mobile: initial.mobile || "",
        alt_mobile: initial.alt_mobile || "",
        email: initial.email || "",
        address: initial.address || initial.project_address || "",
        city: initial.city || "",
        state: initial.state || "",
        pincode: initial.pincode || "",
        customer_type: initial.customer_type || "Residential",
        system_requirement: initial.system_requirement || "Full Solar System",
        system_kw: initial.system_kw || initial.estimated_kw || "",
        monthly_bill: initial.monthly_bill || "",
        consumer_number: initial.consumer_number || "",
        connection_type: initial.connection_type || "Single Phase",
        roof_type: initial.roof_type || "RCC Flat",
        offering_amount: initial.offering_amount || "",
        additional_message: initial.additional_message || "",
        proposed_price: initial.proposed_price || initial.offer_price || "",
        stage: initial.stage || "New Lead",
        quotation_no: initial.quotation_no || "",
        quotation_status: initial.quotation_status || "Not Sent",
        solar_meter_required: initial.solar_meter_required || "No",
        other_requirement: initial.other_requirement || "",
        remarks: initial.remarks || "",
        followup_date: initial.followup_date || (initial.next_followup_at ? initial.next_followup_at.slice(0, 10) : ""),
        followup_time: initial.followup_time || "10:00",
        assigned_to: initial.assigned_to || user?.id || "",
        assigned_to_name: initial.assigned_to_name || user?.name || "",
        followup_type: initial.followup_type || "Call",
        other_note: initial.other_note || "",
        documents: initial.documents || [],
        source: initial.source || "manual",
        sales_link_token: initial.sales_link_token || "",
      };
    }
    return {
      name: "",
      mobile: "",
      alt_mobile: "",
      email: "",
      address: "",
      city: "",
      state: "",
      pincode: "",
      customer_type: "Residential",
      system_requirement: "Full Solar System",
      system_kw: "",
      monthly_bill: "",
      consumer_number: "",
      connection_type: "Single Phase",
      roof_type: "RCC Flat",
      offering_amount: "",
      additional_message: "",
      proposed_price: "",
      stage: "New Lead",
      quotation_no: "",
      quotation_status: "Not Sent",
      solar_meter_required: "No",
      other_requirement: "",
      remarks: "",
      followup_date: dayjs().format("YYYY-MM-DD"), // default today
      followup_time: "10:00",
      assigned_to: user?.id || "",
      assigned_to_name: user?.name || "",
      followup_type: "Call",
      other_note: "",
      documents: [],
      source: "manual",
      sales_link_token: "",
    };
  });

  const setF = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

  // Ensure documents are authoritatively refreshed from get_lead_detail when viewing/editing existing lead
  useEffect(() => {
    let isMounted = true;
    if (initial?.id) {
      api.get(`/leads/${initial.id}`).then((res) => {
        if (isMounted && res.data?.lead?.documents) {
          setForm((prev) => ({
            ...prev,
            documents: res.data.lead.documents,
          }));
        }
      }).catch((err) => {
        console.warn("Could not refresh lead documents:", err);
      });
    }
    return () => { isMounted = false; };
  }, [initial?.id]);

  // Quick schedule handlers
  const handleScheduleToday = () => {
    setF("followup_date", dayjs().format("YYYY-MM-DD"));
  };
  const handleScheduleTomorrow = () => {
    setF("followup_date", dayjs().add(1, "day").format("YYYY-MM-DD"));
  };
  const handleScheduleNoFollowup = () => {
    setF("followup_date", "");
    setF("followup_time", "");
  };

  // Upload Document inside modal
  const handleDocUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploadingDoc(true);
    try {
      const newDocs = [...(form.documents || [])];
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        if (form.assigned_to) formData.append("assigned_to", form.assigned_to);
        const res = await api.post("/files", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        newDocs.push({
          id: res.data.id,
          original_filename: res.data.filename,
          filename: res.data.filename,
          size: res.data.size,
          content_type: res.data.content_type,
          created_at: new Date().toISOString(),
        });
      }
      setF("documents", newDocs);
      toast.success(`${files.length} document(s) uploaded successfully`);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setUploadingDoc(false);
      if (docInputRef.current) docInputRef.current.value = "";
    }
  };

  const handleRemoveDoc = (index) => {
    const updated = (form.documents || []).filter((_, i) => i !== index);
    setF("documents", updated);
  };

  const handleDocDownload = async (doc) => {
    const docId = doc.id || doc.file_id;
    const filename = doc.original_filename || doc.filename || `document_${docId?.slice(0, 8)}`;
    const token = localStorage.getItem("solarix_token");
    try {
      const res = await fetch(`${API}/files/${docId}?download=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        toast.error("Download failed: " + (await res.text()));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Download failed. Please try again.");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Lead name is required");
      setActiveModalTab("basic");
      return;
    }
    if (!form.mobile.trim() || form.mobile.trim().length < 10) {
      toast.error("Valid 10-digit mobile number is required");
      setActiveModalTab("basic");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        system_kw: Number(form.system_kw || 0),
        estimated_kw: Number(form.system_kw || 0),
        solar_capacity_kw: Number(form.system_kw || 0),
        proposed_price: Number(form.proposed_price || 0),
        offer_price: Number(form.proposed_price || 0),
        offering_amount: form.offering_amount ? Number(form.offering_amount) : undefined,
        monthly_bill: form.monthly_bill ? Number(form.monthly_bill) : undefined,
        followup_date: form.followup_date || null, // null when no follow-up, never 'Infinity'
        documents: form.documents || [],
      };

      if (initial?.id) {
        await api.put(`/leads/${initial.id}`, payload);
        toast.success(`Lead "${form.name}" updated successfully`);
      } else {
        await api.post("/leads", payload);
        toast.success(`New lead "${form.name}" created successfully`);
      }
      onSaved();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const authToken = localStorage.getItem("solarix_token");

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-6">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
            {initial ? `Edit Lead: ${initial.name} (${initial.lead_no || "Draft"})` : "Add New Solar Lead"}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            {initial ? "Review or modify customer details, requirements, documents, and follow-up plan." : "Record solar lead requirements and schedule the follow-up plan."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Public Sales Link Banner */}
          {form.source === "sales_link" && (
            <div className="bg-blue-50/80 border border-blue-200 rounded-2xl p-3.5 flex items-center justify-between shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                  <LinkIcon className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-blue-950 flex items-center gap-2">
                    Submitted via Company Public Sales Link
                    <Badge className="bg-blue-600 text-white text-[9px] px-1.5 py-0 font-semibold">Verified Source</Badge>
                  </div>
                  <div className="text-[11px] text-blue-700 mt-0.5">
                    Customer filled out your online inquiry form. All property specifications and uploaded bills are attached below.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 3-TAB FORM SELECTOR */}
          <Tabs value={activeModalTab} onValueChange={setActiveModalTab}>
            <TabsList className="grid grid-cols-3 bg-slate-100 p-1 rounded-xl">
              <TabsTrigger value="basic" className="text-xs font-semibold">
                TAB 1 — BASIC & SITE
              </TabsTrigger>
              <TabsTrigger value="schedule" className="text-xs font-semibold">
                TAB 2 — SCHEDULE / PLAN
              </TabsTrigger>
              <TabsTrigger value="documents" className="text-xs font-semibold flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5" />
                TAB 3 — DOCUMENTS
                {form.documents?.length > 0 && (
                  <span className="px-1.5 py-0.2 bg-emerald-600 text-white rounded-full text-[10px] font-bold">
                    {form.documents.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: BASIC & SITE DETAILS */}
            <TabsContent value="basic" className="space-y-4 pt-3">
              <div className="grid md:grid-cols-2 gap-3.5">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Lead Name *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setF("name", e.target.value)}
                    placeholder="e.g. Rajesh Sharma"
                    required
                    className="mt-1 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Phone Number * (10 Digits)</Label>
                  <Input
                    value={form.mobile}
                    onChange={(e) => setF("mobile", e.target.value)}
                    placeholder="e.g. 9876543210"
                    maxLength={14}
                    required
                    className="mt-1 text-xs font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Alternate Phone</Label>
                  <Input
                    value={form.alt_mobile}
                    onChange={(e) => setF("alt_mobile", e.target.value)}
                    placeholder="Optional secondary contact"
                    className="mt-1 text-xs font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Email Address</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setF("email", e.target.value)}
                    placeholder="e.g. client@example.com"
                    className="mt-1 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Customer / Property Type</Label>
                  <Select value={form.customer_type} onValueChange={(v) => setF("customer_type", v)}>
                    <SelectTrigger className="mt-1 text-xs font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Residential">Residential (Home, Villa, Housing)</SelectItem>
                      <SelectItem value="Business">Commercial / Business (Office, Hospital)</SelectItem>
                      <SelectItem value="Industry">Industrial (Factory, Plant, Warehouse)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Scope of Work</Label>
                  <Select value={form.system_requirement} onValueChange={(v) => setF("system_requirement", v)}>
                    <SelectTrigger className="mt-1 text-xs font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Full Solar System">Full Solar System (Turnkey EPC)</SelectItem>
                      <SelectItem value="KW System Only">KW System Only (Equipment Supply)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Requested System Size (kW)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    value={form.system_kw}
                    onChange={(e) => setF("system_kw", e.target.value)}
                    placeholder="e.g. 5"
                    className="mt-1 text-xs font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Offer / Proposed System Price (₹)</Label>
                  <Input
                    type="number"
                    step="1000"
                    min="0"
                    value={form.proposed_price}
                    onChange={(e) => setF("proposed_price", e.target.value)}
                    placeholder="e.g. 350000"
                    className="mt-1 text-xs font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Customer Target Budget / Offer (₹)</Label>
                  <Input
                    type="number"
                    step="1000"
                    min="0"
                    value={form.offering_amount}
                    onChange={(e) => setF("offering_amount", e.target.value)}
                    placeholder="e.g. 250000"
                    className="mt-1 text-xs font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Approx. Monthly Electricity Bill (₹)</Label>
                  <Input
                    type="number"
                    step="100"
                    min="0"
                    value={form.monthly_bill}
                    onChange={(e) => setF("monthly_bill", e.target.value)}
                    placeholder="e.g. 4500"
                    className="mt-1 text-xs font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Consumer / CA Number</Label>
                  <Input
                    value={form.consumer_number}
                    onChange={(e) => setF("consumer_number", e.target.value)}
                    placeholder="e.g. 012345678901"
                    className="mt-1 text-xs font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Connection Phase</Label>
                  <Select value={form.connection_type} onValueChange={(v) => setF("connection_type", v)}>
                    <SelectTrigger className="mt-1 text-xs font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Single Phase">Single Phase (1-Phase)</SelectItem>
                      <SelectItem value="Three Phase">Three Phase (3-Phase)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Roof / Site Construction</Label>
                  <Select value={form.roof_type} onValueChange={(v) => setF("roof_type", v)}>
                    <SelectTrigger className="mt-1 text-xs font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RCC Flat">RCC Flat Concrete Roof</SelectItem>
                      <SelectItem value="Metal Sheet">Metal / Tin Sheet Roof</SelectItem>
                      <SelectItem value="Slanted Tile">Slanted Tile / Pitched Roof</SelectItem>
                      <SelectItem value="Open Ground">Open Ground Mount</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Stage</Label>
                  <Select value={form.stage} onValueChange={(v) => setF("stage", v)}>
                    <SelectTrigger className="mt-1 text-xs font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_STAGES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Quotation No. / Ref</Label>
                  <Input
                    value={form.quotation_no}
                    onChange={(e) => setF("quotation_no", e.target.value)}
                    placeholder="e.g. QUOT-2026-0042"
                    className="mt-1 text-xs font-mono"
                  />
                </div>
              </div>

              {/* Separate Solar Meter Requirement */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs font-semibold text-slate-800">Solar Meter Requirement</Label>
                    <p className="text-[11px] text-slate-500">
                      Indicate whether bidirectional / net meter is required for this installation.
                    </p>
                  </div>
                  <Select
                    value={form.solar_meter_required}
                    onValueChange={(v) => setF("solar_meter_required", v)}
                  >
                    <SelectTrigger className="w-36 text-xs font-semibold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Yes">Yes — Required</SelectItem>
                      <SelectItem value="No">No — Not Required</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-3">
                <div className="md:col-span-3">
                  <Label className="text-xs font-semibold text-slate-700">Site Installation Address</Label>
                  <Textarea
                    rows={2}
                    value={form.address}
                    onChange={(e) => setF("address", e.target.value)}
                    placeholder="Plot/house number, building, landmark, village/area"
                    className="mt-1 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">City / District</Label>
                  <Input
                    value={form.city}
                    onChange={(e) => setF("city", e.target.value)}
                    placeholder="e.g. Pune"
                    className="mt-1 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">State</Label>
                  <Input
                    value={form.state}
                    onChange={(e) => setF("state", e.target.value)}
                    placeholder="e.g. Maharashtra"
                    className="mt-1 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">PIN Code</Label>
                  <Input
                    value={form.pincode}
                    onChange={(e) => setF("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="e.g. 411001"
                    maxLength={6}
                    className="mt-1 text-xs font-mono"
                  />
                </div>
              </div>

              {form.additional_message && (
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl">
                  <Label className="text-xs font-bold text-amber-900 block mb-1">
                    Customer Online Inquiry Message
                  </Label>
                  <p className="text-xs text-amber-800 italic">{form.additional_message}</p>
                </div>
              )}

              <div>
                <Label className="text-xs font-semibold text-slate-700">Internal Remarks / Notes</Label>
                <Textarea
                  rows={2}
                  value={form.remarks}
                  onChange={(e) => setF("remarks", e.target.value)}
                  placeholder="Customer discussions, budget constraints, internal notes..."
                  className="mt-1 text-xs"
                />
              </div>
            </TabsContent>

            {/* TAB 2: SCHEDULE / PLAN */}
            <TabsContent value="schedule" className="space-y-4 pt-3">
              <div>
                <Label className="text-xs font-semibold text-slate-700 mb-1.5 block">Schedule Options</Label>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleScheduleToday}
                    className={`text-xs ${form.followup_date === dayjs().format("YYYY-MM-DD") ? "bg-blue-50 text-blue-700 border-blue-300 font-semibold" : ""}`}
                  >
                    Today
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleScheduleTomorrow}
                    className={`text-xs ${form.followup_date === dayjs().add(1, "day").format("YYYY-MM-DD") ? "bg-blue-50 text-blue-700 border-blue-300 font-semibold" : ""}`}
                  >
                    Tomorrow
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!form.followup_date) {
                        setF("followup_date", dayjs().add(2, "day").format("YYYY-MM-DD"));
                      }
                    }}
                    className="text-xs"
                  >
                    Custom Date
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleScheduleNoFollowup}
                    className={`text-xs ${!form.followup_date ? "bg-slate-200 text-slate-800 font-semibold" : ""}`}
                  >
                    No Follow-up / None
                  </Button>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-3.5">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Follow-up Date</Label>
                  <Input
                    type="date"
                    value={form.followup_date || ""}
                    onChange={(e) => setF("followup_date", e.target.value)}
                    className="mt-1 text-xs font-mono"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    {form.followup_date ? `Scheduled for ${dayjs(form.followup_date).format("DD MMM YYYY")}` : "No scheduled follow-up date (stored as null)"}
                  </span>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">Follow-up Time</Label>
                  <Input
                    type="time"
                    value={form.followup_time || ""}
                    onChange={(e) => setF("followup_time", e.target.value)}
                    className="mt-1 text-xs font-mono"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">Assigned Worker / Executive</Label>
                  {canAssign ? (
                    <Select
                      value={form.assigned_to}
                      onValueChange={(v) => {
                        const emp = employees.find((e) => e.id === v);
                        setForm((prev) => ({
                          ...prev,
                          assigned_to: v,
                          assigned_to_name: emp?.name || "",
                        }));
                      }}
                    >
                      <SelectTrigger className="mt-1 text-xs">
                        <SelectValue placeholder="Select team member" />
                      </SelectTrigger>
                      <SelectContent>
                        {employees.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.name} ({e.role})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="mt-1 p-2.5 bg-slate-100 border border-slate-200 rounded-md text-xs font-medium text-slate-700 flex items-center justify-between">
                      <span>{form.assigned_to_name || user?.name || "Assigned to You"}</span>
                      <span className="text-[10px] text-slate-500 font-normal">Auto-assigned</span>
                    </div>
                  )}
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">Follow-up Type</Label>
                  <Select
                    value={form.followup_type}
                    onValueChange={(v) => setF("followup_type", v)}
                  >
                    <SelectTrigger className="mt-1 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FOLLOWUP_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">Quotation Status</Label>
                  <Select
                    value={form.quotation_status}
                    onValueChange={(v) => setF("quotation_status", v)}
                  >
                    <SelectTrigger className="mt-1 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {QUOTATION_STATUSES.map((qs) => (
                        <SelectItem key={qs} value={qs}>
                          {qs}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">Other Note</Label>
                <Textarea
                  rows={2}
                  value={form.other_note}
                  onChange={(e) => setF("other_note", e.target.value)}
                  placeholder="Notes for the assigned worker, specific agenda for the follow-up..."
                  className="mt-1 text-xs"
                />
              </div>
            </TabsContent>

            {/* TAB 3: DOCUMENTS & ATTACHMENTS */}
            <TabsContent value="documents" className="space-y-4 pt-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-bold text-slate-800">
                    Lead Documents & Photos ({form.documents?.length || 0})
                  </Label>
                  <p className="text-[11px] text-slate-500">
                    Customer uploaded electricity bills, sanction letters, and site photos.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploadingDoc}
                  onClick={() => docInputRef.current?.click()}
                  className="text-xs font-semibold h-8 border-slate-200"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  {uploadingDoc ? "Uploading..." : "Attach Document"}
                </Button>
                <input
                  ref={docInputRef}
                  type="file"
                  multiple
                  onChange={handleDocUpload}
                  className="hidden"
                />
              </div>

              {/* Document List */}
              {(!form.documents || form.documents.length === 0) ? (
                <div className="border border-dashed border-slate-200 rounded-2xl p-8 text-center bg-slate-50/50">
                  <Paperclip className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <div className="text-xs font-semibold text-slate-700">No Documents Attached</div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Click "Attach Document" to add electricity bills or site survey photos.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {form.documents.map((doc, idx) => {
                    const docId = doc.id || doc.file_id;
                    const docName = doc.original_filename || doc.filename || `Document-${idx + 1}`;
                    const isPdf = (doc.content_type || "").includes("pdf") || /\.pdf$/i.test(docName);
                    const isImage = (doc.content_type || "").startsWith("image/") || /\.(jpg|jpeg|png|webp)$/i.test(docName);
                    const ext = docName.includes(".") ? docName.split(".").pop().toUpperCase() : (isPdf ? "PDF" : isImage ? "IMG" : "DOC");
                    const sizeStr = doc.size ? (doc.size < 1048576 ? `${(doc.size / 1024).toFixed(1)} KB` : `${(doc.size / 1048576).toFixed(1)} MB`) : null;
                    const previewUrl = `${API}/files/${docId}?download=0&auth=${authToken}`;
                    const downloadUrl = `${API}/files/${docId}?download=1&auth=${authToken}`;

                    return (
                      <div
                        key={docId || idx}
                        className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between hover:border-slate-300 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            isPdf ? "bg-rose-50 text-rose-600" : isImage ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-700"
                          }`}>
                            <FileText className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-xs text-slate-900 truncate block">
                                {docName}
                              </span>
                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 font-mono font-bold uppercase bg-slate-50 text-slate-600 border-slate-200">
                                {ext}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                              {sizeStr && <span>{sizeStr}</span>}
                              {doc.created_at && (
                                <>
                                  <span>•</span>
                                  <span>{dayjs(doc.created_at).format("DD MMM YYYY, HH:mm")}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <a
                            href={previewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 text-slate-700 hover:text-emerald-700 bg-slate-50 hover:bg-emerald-50/60 border border-slate-200 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors"
                            title="Preview document"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Preview</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => handleDocDownload(doc)}
                            className="px-2.5 py-1 text-slate-700 hover:text-blue-700 bg-slate-50 hover:bg-blue-50/60 border border-slate-200 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors"
                            title="Download document"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download</span>
                          </button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveDoc(idx)}
                            className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            title="Unattach document"
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <Button variant="outline" type="button" onClick={onClose} className="text-xs">
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-xs">
              {saving ? "Saving..." : initial ? "Save Changes" : "Create Lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


// ─── PUBLIC SALES LINK MANAGEMENT MODAL ──────────────────────────────────────
function SalesLinkModal({ salesLink, regenerating, copied, onCopy, onRegenerate, onClose }) {
  const publicToken = salesLink?.public_token || salesLink?.token || "";
  const publicUrl = publicToken ? `${window.location.origin}/s/${publicToken}` : "";
  const branding = salesLink?.branding || {};
  const companyName = branding.company_name || branding.name || "Your Company";
  const [previewLogoFailed, setPreviewLogoFailed] = useState(false);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl p-6">
        <DialogHeader>
          <div className="flex items-center justify-between mb-1">
            <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px] font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
              Status: Active & Secure
            </Badge>
            <span className="text-[10px] text-slate-400 font-mono">Public Portal Token</span>
          </div>
          <DialogTitle className="text-xl font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
            Company-Branded Sales Link
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 leading-relaxed">
            Share this dedicated link with prospective solar customers via WhatsApp, email, or your social media pages. Customers can submit project specifications and bills directly into your Solarix Leads module.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* URL Box */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
            <Label className="text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>Your Public Sales Link URL</span>
              <span className="text-[10px] text-slate-400 font-normal">Zero Solarix branding</span>
            </Label>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={publicUrl}
                className="h-10 text-xs font-mono bg-white border-slate-200 rounded-xl"
              />
              <Button
                type="button"
                onClick={onCopy}
                className={`h-10 px-3.5 text-xs font-semibold rounded-xl shrink-0 transition ${
                  copied
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 mr-1" /> Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 mr-1" /> Copy Link
                  </>
                )}
              </Button>
            </div>
            <div className="flex items-center justify-between pt-1 text-[11px]">
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline inline-flex items-center gap-1 font-medium"
              >
                <ExternalLink className="w-3 h-3" /> Open Public Page in New Tab
              </a>
              <span className="text-slate-400">Tokens never expire until regenerated</span>
            </div>
          </div>

          {/* Customer View Preview Card */}
          <div className="border border-slate-200 rounded-2xl p-4 bg-white shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-blue-600" />
                Customer Portal Branding Preview
              </span>
              <Badge variant="outline" className="bg-slate-50 text-slate-600 text-[10px]">
                100% White-Labeled
              </Badge>
            </div>

            <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-100 flex items-center gap-3">
              {!previewLogoFailed && branding.has_logo && publicToken ? (
                <img
                  src={`${API}/public/sales/${publicToken}/logo`}
                  alt={companyName}
                  onError={() => setPreviewLogoFailed(true)}
                  className="w-12 h-12 object-contain rounded-xl bg-white border border-slate-200 p-1 shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-base shadow-xs shrink-0">
                  {companyName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="font-bold text-sm text-slate-900 truncate">{companyName}</div>
                <div className="text-[11px] text-slate-500 truncate">
                  {[branding.phone, branding.email, branding.city].filter(Boolean).join(" • ") || "Authorized Solar EPC Partner"}
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              When prospective buyers visit this link, they see your company name, logo, and contact info. No Solarix branding is visible anywhere on the public page.
            </p>
          </div>

          {/* Token Regeneration Section */}
          <div className="p-3 rounded-xl bg-rose-50/50 border border-rose-100 flex items-center justify-between">
            <div className="min-w-0 pr-2">
              <div className="text-xs font-bold text-rose-900">Regenerate Link Token</div>
              <div className="text-[10px] text-rose-700 mt-0.5">
                Instantly invalidates the current link. Past customers will need your new link.
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={regenerating}
              onClick={onRegenerate}
              className="border-rose-200 text-rose-700 hover:bg-rose-100 text-xs font-semibold h-8 shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${regenerating ? "animate-spin" : ""}`} />
              {regenerating ? "Regenerating..." : "Regenerate"}
            </Button>
          </div>
        </div>

        <DialogFooter className="pt-3 border-t border-slate-100">
          <Button type="button" onClick={onClose} className="text-xs w-full sm:w-auto">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ─── FOLLOW-UPS SCHEDULE COMPONENT ──────────────────────────────────────────
function FollowupsCenter({ scope, onOpenLead }) {
  const [filterType, setFilterType] = useState("today");
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);

  const loadFollowups = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/leads/followups/list", {
        params: { filter_type: filterType, scope },
      });
      setItems(data || []);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [filterType, scope]);

  useEffect(() => {
    loadFollowups();
  }, [loadFollowups]);

  const handleMarkComplete = async (fId) => {
    try {
      await api.post(`/leads/followups/${fId}/complete`, { status: "completed" });
      toast.success("Follow-up marked as completed");
      loadFollowups();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  return (
    <Card className="border-slate-200 p-5 space-y-4 shadow-2xs">
      <div className="flex items-center justify-between gap-4 flex-wrap border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={filterType === "today" ? "default" : "outline"}
            className={filterType === "today" ? "bg-amber-600 hover:bg-amber-700 text-white" : ""}
            onClick={() => setFilterType("today")}
          >
            Due Today
          </Button>
          <Button
            size="sm"
            variant={filterType === "overdue" ? "default" : "outline"}
            className={filterType === "overdue" ? "bg-rose-600 hover:bg-rose-700 text-white" : ""}
            onClick={() => setFilterType("overdue")}
          >
            Overdue
          </Button>
          <Button
            size="sm"
            variant={filterType === "upcoming" ? "default" : "outline"}
            className={filterType === "upcoming" ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}
            onClick={() => setFilterType("upcoming")}
          >
            Upcoming
          </Button>
        </div>
        <div className="text-xs text-slate-500 font-medium">
          Showing {items.length} follow-up appointments
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={4} />
      ) : items.length === 0 ? (
        <div className="py-12 text-center text-xs text-slate-400 italic">
          No {filterType} follow-ups found.
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {items.map((it) => (
            <div key={it.id} className="py-3 flex items-center justify-between gap-4 flex-wrap hover:bg-slate-50/60 p-2 rounded-lg transition-colors">
              <div>
                <div className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                  <span className="cursor-pointer hover:text-blue-600 hover:underline" onClick={() => onOpenLead(it.lead_id)}>
                    {it.lead_name}
                  </span>
                  <Badge variant="outline" className="text-[10px] font-normal">{it.stage}</Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                  <span className="font-mono">{it.mobile}</span>
                  {it.city && <span>• {it.city}</span>}
                  <span>• Scheduled: <span className="font-mono font-medium text-slate-700">{dayjs(it.followup_at).format("DD MMM YYYY, hh:mm A")}</span></span>
                  {it.assigned_to_name && <span>• Assigned: {it.assigned_to_name}</span>}
                </div>
                {it.notes && (
                  <div className="text-xs text-slate-600 mt-1 italic">
                    "{it.notes}"
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onOpenLead(it.lead_id)}
                  className="text-xs h-8"
                >
                  Open Lead
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleMarkComplete(it.id)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8"
                >
                  <Check className="w-3.5 h-3.5 mr-1" /> Complete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
