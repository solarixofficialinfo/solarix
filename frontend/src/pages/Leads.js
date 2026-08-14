import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useEmployeeList } from "@/hooks/useTeam";
import { Card, CardContent } from "@/components/ui/card";
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
  PhoneCall, Plus, Search, Filter, Phone, Calendar, Clock, UserCheck, CheckCircle2,
  AlertTriangle, ArrowRight, Eye, Pencil, Trash2, Zap, MapPin, Building, Sparkles,
  Check, RefreshCw, Layers, ChevronRight, User, AlertCircle, ExternalLink, MessageSquare
} from "lucide-react";

import PageHeader from "@/components/PageHeader";
import ManagementBar from "@/components/ManagementBar";
import TableSkeleton from "@/components/TableSkeleton";

const LEAD_STAGES = [
  "NEW", "CONTACTED", "FOLLOW-UP", "INTERESTED", "SITE VISIT",
  "QUOTATION", "NEGOTIATION", "FINAL", "ONBOARDING", "CONVERTED",
  "LOST", "NOT INTERESTED", "NOT REACHABLE", "DUPLICATE"
];

const CALL_OUTCOMES = [
  "Connected", "No Answer", "Busy", "Call Back", "Interested",
  "Not Interested", "Wrong Number", "Follow-up Required",
  "Site Visit Required", "Quotation Required", "Final"
];

const LEAD_SOURCES = [
  "Meta Ads", "Google Ads", "Website", "WhatsApp", "Referral",
  "Existing Customer", "Walk-in", "Calling", "Other"
];

const CONSUMER_TYPES = [
  "Residential", "Commercial", "Industrial", "Agricultural", "Institutional", "Other"
];

const STAGE_BADGES = {
  "NEW": "bg-blue-50 text-blue-700 border-blue-200",
  "CONTACTED": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "FOLLOW-UP": "bg-amber-50 text-amber-700 border-amber-200",
  "INTERESTED": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "SITE VISIT": "bg-teal-50 text-teal-700 border-teal-200",
  "QUOTATION": "bg-violet-50 text-violet-700 border-violet-200",
  "NEGOTIATION": "bg-purple-50 text-purple-700 border-purple-200",
  "FINAL": "bg-emerald-600 text-white font-semibold",
  "ONBOARDING": "bg-cyan-600 text-white font-semibold",
  "CONVERTED": "bg-emerald-700 text-white font-semibold",
  "LOST": "bg-rose-50 text-rose-700 border-rose-200",
  "NOT INTERESTED": "bg-slate-100 text-slate-600 border-slate-200",
  "NOT REACHABLE": "bg-orange-50 text-orange-700 border-orange-200",
  "DUPLICATE": "bg-slate-200 text-slate-700 border-slate-300",
};

export default function Leads() {
  const { user } = useAuth();
  const nav = useNavigate();
  const isAdmin = user?.role === "Admin" || user?.role === "Supervisor";
  const { data: employees = [] } = useEmployeeList();

  const [activeSubTab, setActiveSubTab] = useState("pipeline"); // pipeline, followups, calls
  const [scope, setScope] = useState(isAdmin ? "team" : "mine");
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
  const [callStatusFilter, setCallStatusFilter] = useState("all");
  const [followupFilter, setFollowupFilter] = useState("all");

  // Modals
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editLead, setEditLead] = useState(null);
  const [callModalLead, setCallModalLead] = useState(null);
  const [detailLeadId, setDetailLeadId] = useState(null);
  const [convertModalLead, setConvertModalLead] = useState(null);

  // Load Leads Data
  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const [leadsRes, statsRes] = await Promise.all([
        api.get("/leads", {
          params: {
            scope,
            stage: stageFilter,
            source: sourceFilter,
            assigned_to: assignedFilter,
            call_status: callStatusFilter,
            followup_filter: followupFilter !== "all" ? followupFilter : undefined,
            search,
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
  }, [scope, stageFilter, sourceFilter, assignedFilter, callStatusFilter, followupFilter, search, page]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const handleClearFilters = () => {
    setSearch("");
    setStageFilter("all");
    setSourceFilter("all");
    setAssignedFilter("all");
    setCallStatusFilter("all");
    setFollowupFilter("all");
    setPage(1);
  };

  const statCards = [
    { label: "Total Leads", v: stats?.total_leads ?? "—", color: "blue", icon: Layers },
    { label: "New Leads", v: stats?.new_leads ?? "—", color: "cyan", icon: Sparkles },
    { label: "Follow-ups Due", v: stats?.followups_due ?? "—", color: "amber", icon: Clock },
    { label: "Today's Calls", v: stats?.todays_calls ?? "—", color: "indigo", icon: PhoneCall },
    { label: "Interested", v: stats?.interested ?? "—", color: "teal", icon: Zap },
    { label: "Final / Won", v: stats?.final_won ?? "—", color: "emerald", icon: CheckCircle2 },
    { label: "Lost", v: stats?.lost ?? "—", color: "rose", icon: AlertTriangle },
  ];

  return (
    <div className="space-y-6">
      {/* Top Page Header */}
      <PageHeader
        title="Lead Management"
        subtitle="Track solar sales leads, record call outcomes, manage daily follow-ups, and convert qualified leads to onboarding."
        badge={`${total} Leads`}
        actions={
          <div className="flex items-center gap-3 flex-wrap">
            {isAdmin && (
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-xs" data-testid="lead-scope-toggle">
                <button
                  onClick={() => { setScope("mine"); setPage(1); }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${scope === "mine" ? "bg-blue-600 text-white font-semibold" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  My Leads
                </button>
                <button
                  onClick={() => { setScope("team"); setPage(1); }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${scope === "team" ? "bg-blue-600 text-white font-semibold" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  All Team Leads
                </button>
              </div>
            )}
            <Button onClick={() => setAddModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 shadow-xs" data-testid="add-lead-btn">
              <Plus className="w-4 h-4 mr-1.5" /> Add Lead
            </Button>
          </div>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3" data-testid="lead-stats-grid">
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

      {/* Navigation Sub-Tabs */}
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="space-y-4">
        <TabsList className="bg-white border border-slate-200 p-1 rounded-xl shadow-xs">
          <TabsTrigger value="pipeline" className="text-xs font-medium gap-1.5">
            <Layers className="w-3.5 h-3.5" /> Lead Pipeline & List
          </TabsTrigger>
          <TabsTrigger value="followups" className="text-xs font-medium gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-600" /> Follow-ups Center
            {stats?.followups_due > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[10px] font-bold">
                {stats.followups_due}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: Lead Pipeline & List */}
        <TabsContent value="pipeline" className="space-y-4">
          {/* Management Bar & Filters */}
          <ManagementBar
            searchQuery={search}
            onSearchChange={(v) => { setSearch(v); setPage(1); }}
            searchPlaceholder="Search name, mobile, city, or Lead ID..."
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
                    {LEAD_SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>

                {isAdmin && (
                  <Select value={assignedFilter} onValueChange={(v) => { setAssignedFilter(v); setPage(1); }}>
                    <SelectTrigger className="w-40 h-9 text-xs"><SelectValue placeholder="Assigned Person" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Team Members</SelectItem>
                      {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}

                <Select value={followupFilter} onValueChange={(v) => { setFollowupFilter(v); setPage(1); }}>
                  <SelectTrigger className="w-36 h-9 text-xs"><SelectValue placeholder="Follow-up Date" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Dates</SelectItem>
                    <SelectItem value="today">Today Due</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="upcoming">Upcoming</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            }
            onClearFilters={handleClearFilters}
          />

          {/* Main Lead Table */}
          <Card className="border-slate-200 overflow-hidden shadow-xs">
            {loading ? (
              <TableSkeleton cols={8} rows={6} />
            ) : leads.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-sm">
                <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                No solar leads found. Click <strong>"Add Lead"</strong> to add your first lead.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Lead Info</th>
                      <th className="px-4 py-3 font-semibold">Requirement</th>
                      <th className="px-4 py-3 font-semibold">Source / Assigned</th>
                      <th className="px-4 py-3 font-semibold text-center">Stage</th>
                      <th className="px-4 py-3 font-semibold">Last Contact</th>
                      <th className="px-4 py-3 font-semibold">Next Follow-up</th>
                      <th className="px-4 py-3 font-semibold text-right">Quick Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {leads.map((l) => {
                      const isOverdue = l.next_followup_at && dayjs(l.next_followup_at).isBefore(dayjs(), "day");
                      const isConverted = l.stage === "CONVERTED" || l.converted_client_id;
                      const isFinal = l.stage === "FINAL";

                      return (
                        <tr key={l.id} className="hover:bg-slate-50/70 transition-colors">
                          {/* Lead Info */}
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-900">{l.name}</span>
                              <span className="text-[10px] font-mono font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                {l.lead_no}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                              <span>📞 {l.mobile}</span>
                              {l.city && <span>• 📍 {l.city}</span>}
                            </div>
                          </td>

                          {/* Solar Requirement */}
                          <td className="px-4 py-3.5 text-xs text-slate-700">
                            <div className="font-medium text-slate-900">{l.estimated_kw ? `${l.estimated_kw} kW` : "—"}</div>
                            <div className="text-slate-500 text-[11px]">{l.consumer_type || "Commercial/Res"}</div>
                          </td>

                          {/* Source & Assigned */}
                          <td className="px-4 py-3.5 text-xs text-slate-700">
                            <div className="font-medium text-slate-900">{l.source}</div>
                            <div className="text-slate-500 text-[11px]">👤 {l.assigned_to_name || "Unassigned"}</div>
                          </td>

                          {/* Stage */}
                          <td className="px-4 py-3.5 text-center">
                            <Badge variant="outline" className={`text-xs px-2.5 py-0.5 ${STAGE_BADGES[l.stage] || "bg-slate-100 text-slate-700"}`}>
                              {l.stage}
                            </Badge>
                          </td>

                          {/* Last Contact */}
                          <td className="px-4 py-3.5 text-xs text-slate-600">
                            {l.last_contact_at ? (
                              <div>
                                <div>{dayjs(l.last_contact_at).format("D MMM YYYY, h:mm A")}</div>
                                {l.call_status && <div className="text-[11px] text-blue-600 font-medium">Outcome: {l.call_status}</div>}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">Not called yet</span>
                            )}
                          </td>

                          {/* Next Follow-up */}
                          <td className="px-4 py-3.5 text-xs">
                            {l.next_followup_at ? (
                              <span className={`font-medium ${isOverdue ? "text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200" : "text-slate-800"}`}>
                                {dayjs(l.next_followup_at).format("D MMM YYYY, h:mm A")}
                                {isOverdue && <span className="block text-[10px] font-bold">OVERDUE</span>}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          {/* Quick Actions */}
                          <td className="px-4 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1 flex-wrap">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                                onClick={() => setCallModalLead(l)}
                                data-testid={`call-lead-${l.id}`}
                              >
                                <PhoneCall className="w-3 h-3 mr-1" /> Log Call
                              </Button>

                              {(isFinal || isConverted) && (
                                isConverted ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs bg-emerald-50 text-emerald-700 border-emerald-200"
                                    onClick={() => nav(`/clients/${l.converted_client_id}`)}
                                  >
                                    <ExternalLink className="w-3 h-3 mr-1" /> Client
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                                    onClick={() => setConvertModalLead(l)}
                                    data-testid={`convert-lead-${l.id}`}
                                  >
                                    <Zap className="w-3 h-3 mr-1" /> Onboard
                                  </Button>
                                )
                              )}

                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-500" onClick={() => setDetailLeadId(l.id)}>
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-500" onClick={() => setEditLead(l)}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* TAB 2: Dedicated Follow-ups Center */}
        <TabsContent value="followups">
          <FollowupsCenter scope={scope} onLogCall={(lead) => setCallModalLead(lead)} />
        </TabsContent>
      </Tabs>

      {/* Add / Edit Lead Modal */}
      {(addModalOpen || editLead) && (
        <AddEditLeadModal
          initial={editLead}
          employees={employees}
          onClose={() => { setAddModalOpen(false); setEditLead(null); }}
          onSaved={() => { setAddModalOpen(false); setEditLead(null); loadLeads(); }}
        />
      )}

      {/* Log Call Modal */}
      {callModalLead && (
        <LogCallModal
          lead={callModalLead}
          employees={employees}
          onClose={() => setCallModalLead(null)}
          onSaved={() => { setCallModalLead(null); loadLeads(); }}
        />
      )}

      {/* Lead Detail View Modal */}
      {detailLeadId && (
        <LeadDetailModal
          leadId={detailLeadId}
          onClose={() => setDetailLeadId(null)}
          onConvertRequest={(lead) => { setDetailLeadId(null); setConvertModalLead(lead); }}
        />
      )}

      {/* Convert / Onboarding Integration Dialog */}
      {convertModalLead && (
        <ConvertLeadDialog
          lead={convertModalLead}
          onClose={() => setConvertModalLead(null)}
          onSuccess={() => { setConvertModalLead(null); loadLeads(); }}
        />
      )}
    </div>
  );
}


// ─── DEDICATED FOLLOW-UPS CENTER COMPONENT ──────────────────────────────────
function FollowupsCenter({ scope, onLogCall }) {
  const [filterType, setFilterType] = useState("today"); // today, overdue, upcoming
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
      toast.success("Follow-up marked complete");
      loadFollowups();
    } catch (err) { toast.error(formatApiError(err)); }
  };

  return (
    <Card className="border-slate-200 p-5 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={filterType === "today" ? "default" : "outline"}
            className={filterType === "today" ? "bg-amber-600 hover:bg-amber-700" : ""}
            onClick={() => setFilterType("today")}
          >
            Due Today
          </Button>
          <Button
            size="sm"
            variant={filterType === "overdue" ? "default" : "outline"}
            className={filterType === "overdue" ? "bg-rose-600 hover:bg-rose-700" : ""}
            onClick={() => setFilterType("overdue")}
          >
            Overdue
          </Button>
          <Button
            size="sm"
            variant={filterType === "upcoming" ? "default" : "outline"}
            className={filterType === "upcoming" ? "bg-blue-600 hover:bg-blue-700" : ""}
            onClick={() => setFilterType("upcoming")}
          >
            Upcoming
          </Button>
        </div>
        <div className="text-xs text-slate-500 font-medium">
          Showing {items.length} follow-up tasks
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-slate-500 text-sm">Loading follow-ups...</div>
      ) : items.length === 0 ? (
        <div className="p-12 text-center text-slate-500 text-sm">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          No pending follow-ups in this view!
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {items.map((f) => (
            <div key={f.id} className="py-3.5 flex items-center justify-between gap-4 flex-wrap hover:bg-slate-50 p-2 rounded-lg transition">
              <div className="space-y-1 min-w-[240px]">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900">{f.lead_name}</span>
                  <span className="text-xs text-slate-500">📞 {f.mobile}</span>
                  {f.city && <span className="text-xs text-slate-500">• 📍 {f.city}</span>}
                </div>
                <div className="text-xs text-slate-600 flex items-center gap-2">
                  <span className="font-medium text-slate-700">Scheduled: {dayjs(f.followup_at).format("D MMM YYYY, h:mm A")}</span>
                  {f.notes && <span className="italic text-slate-500">— "{f.notes}"</span>}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-8 text-xs bg-blue-50 text-blue-700 border-blue-200" onClick={() => onLogCall({ id: f.lead_id, name: f.lead_name, mobile: f.mobile })}>
                  <PhoneCall className="w-3.5 h-3.5 mr-1" /> Call Now
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50" onClick={() => handleMarkComplete(f.id)}>
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


// ─── ADD / EDIT LEAD MODAL ──────────────────────────────────────────────────
function AddEditLeadModal({ initial, employees, onClose, onSaved }) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => ({
    name: initial?.name || "",
    mobile: initial?.mobile || "",
    alt_mobile: initial?.alt_mobile || "",
    city: initial?.city || "",
    address: initial?.address || "",
    estimated_kw: initial?.estimated_kw || 0,
    consumer_type: initial?.consumer_type || "Residential",
    source: initial?.source || "Meta Ads",
    assigned_to: initial?.assigned_to || user?.id || "",
    assigned_to_name: initial?.assigned_to_name || user?.name || "",
    stage: initial?.stage || "NEW",
    status: initial?.status || "New Lead",
    next_followup_at: initial?.next_followup_at || "",
    remarks: initial?.remarks || "",
  }));

  const setF = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.mobile.trim()) {
      toast.error("Lead Name and Mobile Number are required");
      return;
    }
    setSaving(true);
    try {
      if (initial?.id) {
        await api.put(`/leads/${initial.id}`, form);
        toast.success("Lead updated successfully");
      } else {
        await api.post("/leads", form);
        toast.success("New solar lead created");
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? `Edit Lead: ${initial.name}` : "Add New Solar Sales Lead"}</DialogTitle>
          <DialogDescription>Quickly record prospect info for the solar sales pipeline.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-semibold">Lead Full Name *</Label>
              <Input value={form.name} onChange={(e) => setF("name", e.target.value)} placeholder="e.g. Ramesh Patil" required className="mt-1" />
            </div>
            <div>
              <Label className="text-xs font-semibold">Mobile Number *</Label>
              <Input value={form.mobile} onChange={(e) => setF("mobile", e.target.value)} placeholder="e.g. 9876543210" required className="mt-1" />
            </div>
            <div>
              <Label className="text-xs font-semibold">Alternate Mobile</Label>
              <Input value={form.alt_mobile} onChange={(e) => setF("alt_mobile", e.target.value)} placeholder="Optional" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs font-semibold">City / Location</Label>
              <Input value={form.city} onChange={(e) => setF("city", e.target.value)} placeholder="e.g. Pune" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs font-semibold">Estimated Solar Capacity (kW)</Label>
              <Input type="number" step="0.5" value={form.estimated_kw || ""} onChange={(e) => setF("estimated_kw", e.target.value)} placeholder="e.g. 5" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs font-semibold">Consumer Type</Label>
              <Select value={form.consumer_type} onValueChange={(v) => setF("consumer_type", v)}>
                <SelectTrigger className="mt-1 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONSUMER_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold">Lead Source</Label>
              <Select value={form.source} onValueChange={(v) => setF("source", v)}>
                <SelectTrigger className="mt-1 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAD_SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold">Assigned Sales Executive</Label>
              <Select
                value={form.assigned_to}
                onValueChange={(v) => {
                  const emp = employees.find((e) => e.id === v);
                  setForm((prev) => ({ ...prev, assigned_to: v, assigned_to_name: emp?.name || "" }));
                }}
              >
                <SelectTrigger className="mt-1 text-xs"><SelectValue placeholder="Select team member" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name} ({e.role})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold">Initial Pipeline Stage</Label>
              <Select value={form.stage} onValueChange={(v) => setF("stage", v)}>
                <SelectTrigger className="mt-1 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAD_STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold">Next Follow-up Date & Time</Label>
              <Input
                type="datetime-local"
                value={form.next_followup_at ? dayjs(form.next_followup_at).format("YYYY-MM-DDTHH:mm") : ""}
                onChange={(e) => setF("next_followup_at", e.target.value)}
                className="mt-1 text-xs"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold">Full Address / Site Details</Label>
            <Textarea rows={2} value={form.address} onChange={(e) => setF("address", e.target.value)} placeholder="Full street or village address" className="mt-1 text-xs" />
          </div>

          <div>
            <Label className="text-xs font-semibold">Remarks & Sales Notes</Label>
            <Textarea rows={2} value={form.remarks} onChange={(e) => setF("remarks", e.target.value)} placeholder="Client budget, specific solar requirement, remarks..." className="mt-1 text-xs" />
          </div>

          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700">
              {saving ? "Saving..." : initial ? "Save Changes" : "Create Lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


// ─── LOG CALL ACTIVITY MODAL ────────────────────────────────────────────────
function LogCallModal({ lead, employees, onClose, onSaved }) {
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState("Connected");
  const [notes, setNotes] = useState("");
  const [nextFollowup, setNextFollowup] = useState("");
  const [assignedTo, setAssignedTo] = useState(lead.assigned_to || user?.id || "");
  const [updateStage, setUpdateStage] = useState(lead.stage || "CONTACTED");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const emp = employees.find((e) => e.id === assignedTo);
      await api.post(`/leads/${lead.id}/calls`, {
        outcome,
        notes,
        next_followup_at: nextFollowup,
        assigned_to: assignedTo,
        assigned_to_name: emp?.name || user?.name || "",
        stage: updateStage,
      });
      toast.success("Call activity logged");
      onSaved();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PhoneCall className="w-5 h-5 text-blue-600" /> Log Call Activity
          </DialogTitle>
          <DialogDescription>Record outcome for <strong>{lead.name}</strong> ({lead.mobile})</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div>
            <Label className="text-xs font-semibold mb-2 block">Call Outcome *</Label>
            <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto p-1 border border-slate-200 rounded-lg">
              {CALL_OUTCOMES.map((o) => (
                <button
                  type="button"
                  key={o}
                  onClick={() => setOutcome(o)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md border text-left transition ${
                    outcome === o ? "bg-blue-600 text-white border-blue-600 shadow-xs" : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold">Call Discussion Notes *</Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What did the prospect say? Requirements discussed..."
              className="mt-1 text-xs"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold">Update Pipeline Stage</Label>
              <Select value={updateStage} onValueChange={setUpdateStage}>
                <SelectTrigger className="mt-1 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAD_STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold">Next Follow-up</Label>
              <Input
                type="datetime-local"
                value={nextFollowup}
                onChange={(e) => setNextFollowup(e.target.value)}
                className="mt-1 text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting} className="bg-blue-600 hover:bg-blue-700">
              {submitting ? "Saving..." : "Save Call Activity"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


// ─── LEAD DETAIL VIEW MODAL ─────────────────────────────────────────────────
function LeadDetailModal({ leadId, onClose, onConvertRequest }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDetail() {
      setLoading(true);
      try {
        const res = await api.get(`/leads/${leadId}`);
        setData(res.data);
      } catch (err) {
        toast.error(formatApiError(err));
      } finally {
        setLoading(false);
      }
    }
    fetchDetail();
  }, [leadId]);

  if (loading || !data) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-2xl"><div className="p-8 text-center text-slate-500">Loading Lead details...</div></DialogContent>
      </Dialog>
    );
  }

  const { lead, calls = [], followups = [] } = data;
  const isConverted = lead.stage === "CONVERTED" || lead.converted_client_id;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <DialogTitle className="text-2xl flex items-center gap-2">
                <span>{lead.name}</span>
                <Badge variant="outline" className="font-mono text-xs">{lead.lead_no}</Badge>
              </DialogTitle>
              <DialogDescription className="text-xs">Created on {dayjs(lead.created_at).format("D MMM YYYY")}</DialogDescription>
            </div>
            <Badge variant="outline" className={`text-xs px-3 py-1 ${STAGE_BADGES[lead.stage] || ""}`}>
              {lead.stage}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Key Info Cards */}
          <div className="grid md:grid-cols-3 gap-3 text-xs">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div className="font-semibold text-slate-500 uppercase tracking-wider text-[10px] mb-1">Contact Info</div>
              <div className="font-medium text-slate-900">📞 {lead.mobile}</div>
              {lead.alt_mobile && <div className="text-slate-600">Alt: {lead.alt_mobile}</div>}
              <div className="text-slate-600 mt-1">📍 {[lead.city, lead.address].filter(Boolean).join(", ") || "—"}</div>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div className="font-semibold text-slate-500 uppercase tracking-wider text-[10px] mb-1">Requirement</div>
              <div className="font-bold text-blue-600 text-sm">{lead.estimated_kw ? `${lead.estimated_kw} kW` : "—"}</div>
              <div className="text-slate-700 font-medium">{lead.consumer_type || "Commercial"}</div>
              <div className="text-slate-500 mt-1">Source: <strong>{lead.source}</strong></div>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div className="font-semibold text-slate-500 uppercase tracking-wider text-[10px] mb-1">Sales Info</div>
              <div className="text-slate-700">Assigned: <strong>{lead.assigned_to_name}</strong></div>
              <div className="text-slate-600 mt-1">Last Contact: {lead.last_contact_at ? dayjs(lead.last_contact_at).fromNow() : "Never"}</div>
              {isConverted && <div className="text-emerald-700 font-bold mt-1">✓ Converted to Client ({lead.converted_sol_id})</div>}
            </div>
          </div>

          {/* Action Convert bar if Final */}
          {!isConverted && lead.stage === "FINAL" && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center justify-between gap-4">
              <div>
                <div className="font-semibold text-emerald-900 text-xs">Lead is marked as FINAL / WON</div>
                <div className="text-[11px] text-emerald-700">Ready to convert into the main client onboarding workflow.</div>
              </div>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => onConvertRequest(lead)}>
                <Zap className="w-4 h-4 mr-1.5" /> Start Onboarding
              </Button>
            </div>
          )}

          {/* Call Timeline */}
          <div>
            <h4 className="font-semibold text-sm text-slate-900 mb-2 flex items-center gap-1.5">
              <PhoneCall className="w-4 h-4 text-blue-600" /> Call Activity History ({calls.length})
            </h4>
            {calls.length === 0 ? (
              <div className="text-xs text-slate-400 italic p-3 border border-dashed border-slate-200 rounded-lg">No calls logged yet.</div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {calls.map((c) => (
                  <div key={c.id} className="p-3 bg-white border border-slate-200 rounded-lg text-xs space-y-1">
                    <div className="flex items-center justify-between text-slate-500">
                      <span className="font-medium text-slate-900">{c.user_name}</span>
                      <span>{dayjs(c.created_at).format("D MMM YYYY, h:mm A")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">
                        {c.outcome}
                      </Badge>
                      {c.next_followup_at && (
                        <span className="text-[11px] text-amber-700 font-medium">Next: {dayjs(c.next_followup_at).format("D MMM YYYY, h:mm A")}</span>
                      )}
                    </div>
                    {c.notes && <div className="text-slate-700 bg-slate-50 p-2 rounded border border-slate-100 italic">{c.notes}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ─── CONVERT LEAD → EXISTING ONBOARDING DIALOG ──────────────────────────────
function ConvertLeadDialog({ lead, onClose, onSuccess }) {
  const nav = useNavigate();
  const [checking, setChecking] = useState(true);
  const [checkResult, setCheckResult] = useState(null);

  useEffect(() => {
    async function doCheck() {
      setChecking(true);
      try {
        const res = await api.post(`/leads/${lead.id}/convert-check`);
        setCheckResult(res.data);
      } catch (err) {
        toast.error(formatApiError(err));
      } finally {
        setChecking(false);
      }
    }
    doCheck();
  }, [lead.id]);

  const handleLinkExisting = async () => {
    if (!checkResult?.existing_client?.id) return;
    try {
      await api.post(`/leads/${lead.id}/link-client`, {
        client_id: checkResult.existing_client.id,
        sol_id: checkResult.existing_client.sol_id,
      });
      toast.success(`Lead linked to existing client ${checkResult.existing_client.sol_id}`);
      onSuccess();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const handleStartOnboardingNew = () => {
    onClose();
    // Navigate to existing onboarding page /clients/new with pre-filled state
    nav("/clients/new", { state: { lead } });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-emerald-600" /> Convert Lead to Client
          </DialogTitle>
          <DialogDescription>Convert <strong>{lead.name}</strong> into the existing client onboarding workflow.</DialogDescription>
        </DialogHeader>

        {checking ? (
          <div className="p-6 text-center text-slate-500 text-sm">Checking existing client database...</div>
        ) : (
          <div className="space-y-4 py-2 text-xs">
            {checkResult?.exists ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-amber-900 font-semibold text-sm">
                  <AlertTriangle className="w-4 h-4 text-amber-600" /> Existing Matching Client Found!
                </div>
                <div className="text-slate-700">
                  A client with mobile number <strong>{lead.mobile}</strong> already exists:
                </div>
                <div className="p-2 bg-white rounded border border-amber-200 font-medium">
                  <div>Name: <strong>{checkResult.existing_client.full_name}</strong></div>
                  <div>SOL ID: <span className="font-mono font-bold text-blue-600">{checkResult.existing_client.sol_id}</span></div>
                  <div>Stage: {checkResult.existing_client.status}</div>
                </div>
                <div className="text-slate-600">
                  To prevent creating a duplicate record, you can link this Lead to the existing client or proceed to create a new client.
                </div>
              </div>
            ) : (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-1">
                <div className="font-semibold text-emerald-900 text-sm">Ready for Onboarding</div>
                <div className="text-slate-700">
                  No existing client with mobile <strong>{lead.mobile}</strong> was found.
                </div>
                <div className="text-slate-600 mt-1">
                  Clicking <strong>"Continue to Onboarding"</strong> will open the existing onboarding form with lead details pre-filled.
                </div>
              </div>
            )}

            <DialogFooter className="gap-2">
              {checkResult?.exists && (
                <Button variant="outline" onClick={handleLinkExisting} className="border-amber-300 text-amber-900">
                  Link to Existing ({checkResult.existing_client.sol_id})
                </Button>
              )}
              <Button onClick={handleStartOnboardingNew} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                Continue to Onboarding →
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
