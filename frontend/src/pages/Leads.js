import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
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
  PhoneCall, ShieldAlert, Sparkles, Check, ArrowRight
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

  const isAdmin = user?.role === "Admin" || user?.role === "Super Admin" || user?.role === "Platform Owner";

  const [activeTab, setActiveTab] = useState("leads"); // TAB 1: leads, followups
  const [scope, setScope] = useState(isAdmin ? "team" : "mine");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);

  // Filters
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [assignedFilter, setAssignedFilter] = useState("all");
  const [followupFilter, setFollowupFilter] = useState("all");

  // Modals
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);

  // Load Leads Data
  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const [leadsRes, statsRes] = await Promise.all([
        api.get("/leads", {
          params: {
            scope,
            stage: stageFilter !== "all" ? stageFilter : undefined,
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
  }, [scope, stageFilter, assignedFilter, followupFilter, search, page]);

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
            {isAdmin && (
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-xs">
                <button
                  type="button"
                  onClick={() => { setScope("mine"); setPage(1); }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${scope === "mine" ? "bg-blue-600 text-white font-semibold" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  My Leads
                </button>
                <button
                  type="button"
                  onClick={() => { setScope("team"); setPage(1); }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${scope === "team" ? "bg-blue-600 text-white font-semibold" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  All Team Leads
                </button>
              </div>
            )}
            {canCreate && (
              <Button
                onClick={() => { setSelectedLead(null); setFormModalOpen(true); }}
                className="bg-blue-600 hover:bg-blue-700 shadow-xs"
                data-testid="add-lead-btn"
              >
                <Plus className="w-4 h-4 mr-1.5" /> Add Lead
              </Button>
            )}
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

                {isAdmin && (
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
                            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                              <span>{lead.name}</span>
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
                              {lead.consumer_type || "Rooftop Solar"}
                            </div>
                          </td>

                          {/* Offer / Proposed Price */}
                          <td className="py-3 px-3 font-semibold text-slate-900 tabular-nums">
                            {lead.proposed_price || lead.offer_price
                              ? `₹${Number(lead.proposed_price || lead.offer_price).toLocaleString("en-IN")}`
                              : "—"}
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
                              {canEdit && (
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
                              {canDelete && (
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

      {/* 2-TAB ADD / EDIT LEAD MODAL */}
      {formModalOpen && (
        <AddEditLeadModal
          initial={selectedLead}
          employees={employees}
          onClose={() => { setFormModalOpen(false); setSelectedLead(null); }}
          onSaved={() => {
            setFormModalOpen(false);
            setSelectedLead(null);
            queryClient.invalidateQueries(queryKeys.leads.all());
            loadLeads();
          }}
        />
      )}
    </div>
  );
}


// ─── 2-TAB ADD / EDIT LEAD MODAL ─────────────────────────────────────────────
function AddEditLeadModal({ initial, employees, onClose, onSaved }) {
  const [activeModalTab, setActiveModalTab] = useState("basic");
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState(() => {
    if (initial) {
      return {
        name: initial.name || "",
        mobile: initial.mobile || "",
        alt_mobile: initial.alt_mobile || "",
        address: initial.address || "",
        city: initial.city || "",
        system_kw: initial.system_kw || initial.estimated_kw || "",
        proposed_price: initial.proposed_price || initial.offer_price || "",
        stage: initial.stage || "New Lead",
        quotation_no: initial.quotation_no || "",
        quotation_status: initial.quotation_status || "Not Sent",
        solar_meter_required: initial.solar_meter_required || "No",
        other_requirement: initial.other_requirement || "",
        remarks: initial.remarks || "",
        followup_date: initial.followup_date || (initial.next_followup_at ? initial.next_followup_at.slice(0, 10) : ""),
        followup_time: initial.followup_time || "10:00",
        assigned_to: initial.assigned_to || "",
        assigned_to_name: initial.assigned_to_name || "",
        followup_type: initial.followup_type || "Call",
        other_note: initial.other_note || "",
      };
    }
    return {
      name: "",
      mobile: "",
      alt_mobile: "",
      address: "",
      city: "",
      system_kw: "",
      proposed_price: "",
      stage: "New Lead",
      quotation_no: "",
      quotation_status: "Not Sent",
      solar_meter_required: "No",
      other_requirement: "",
      remarks: "",
      followup_date: dayjs().format("YYYY-MM-DD"), // default today
      followup_time: "10:00",
      assigned_to: "",
      assigned_to_name: "",
      followup_type: "Call",
      other_note: "",
    };
  });

  const setF = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

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
        proposed_price: Number(form.proposed_price || 0),
        offer_price: Number(form.proposed_price || 0),
        followup_date: form.followup_date || null, // null when no follow-up, never 'Infinity'
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

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
            {initial ? `Edit Lead: ${initial.name} (${initial.lead_no || "Draft"})` : "Add New Solar Lead"}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            {initial ? "Modify lead details or schedule plan. Changes save directly to this existing lead." : "Record solar lead requirements and schedule the follow-up plan."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* 2-TAB FORM SELECTOR */}
          <Tabs value={activeModalTab} onValueChange={setActiveModalTab}>
            <TabsList className="grid grid-cols-2 bg-slate-100 p-1 rounded-xl">
              <TabsTrigger value="basic" className="text-xs font-semibold">
                TAB 1 — BASIC DETAILS
              </TabsTrigger>
              <TabsTrigger value="schedule" className="text-xs font-semibold">
                TAB 2 — SCHEDULE / PLAN
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: BASIC DETAILS */}
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
                  <Label className="text-xs font-semibold text-slate-700">City / District</Label>
                  <Input
                    value={form.city}
                    onChange={(e) => setF("city", e.target.value)}
                    placeholder="e.g. Pune"
                    className="mt-1 text-xs"
                  />
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

              <div>
                <Label className="text-xs font-semibold text-slate-700">Site Address</Label>
                <Textarea
                  rows={2}
                  value={form.address}
                  onChange={(e) => setF("address", e.target.value)}
                  placeholder="Plot/house number, building, landmark, village/area"
                  className="mt-1 text-xs"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">Other Requirement</Label>
                <Textarea
                  rows={2}
                  value={form.other_requirement}
                  onChange={(e) => setF("other_requirement", e.target.value)}
                  placeholder="Structure height, battery backup, specific brand preference..."
                  className="mt-1 text-xs"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">Remarks</Label>
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
              {/* Quick schedule preset buttons */}
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

              <div>
                <Label className="text-xs font-semibold text-slate-700">Remarks</Label>
                <Textarea
                  rows={2}
                  value={form.remarks}
                  onChange={(e) => setF("remarks", e.target.value)}
                  placeholder="Additional planning notes..."
                  className="mt-1 text-xs"
                />
              </div>
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
