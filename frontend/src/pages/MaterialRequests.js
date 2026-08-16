import React, { useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import api, { formatApiError, fileUrl } from "@/lib/api";
import { useMaterialRequestList, useInvalidateMaterialRequests } from "@/hooks/useMaterialRequests";
import { useProductList } from "@/hooks/useInventory";
import { useClientList } from "@/hooks/useClients";
import { usePermission } from "@/lib/permissions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  PackageSearch,
  CheckCircle2,
  Clock,
  XCircle,
  History,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Truck,
  FileText,
  Camera,
  RefreshCw,
  Search,
  ExternalLink,
  ShieldAlert,
  Calendar,
  User,
  Building2,
  Layers,
  ArrowRight
} from "lucide-react";
import dayjs from "dayjs";
import PageHeader from "@/components/PageHeader";
import { MaterialRequest } from "./TaskPortal";

export default function MaterialRequests() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDateRange, setSelectedDateRange] = useState("all");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedClientForNew, setSelectedClientForNew] = useState("");

  // Permissions
  const canApproval = usePermission("project_execution", "approval");
  const canReject = usePermission("project_execution", "reject");
  const canRetry = usePermission("project_execution", "retry");

  // Data fetching
  const { data: requests = [], isLoading } = useMaterialRequestList();
  const { data: clients = [] } = useClientList();
  const invalidateMatReqs = useInvalidateMaterialRequests();

  // Filter requests
  const matchesDateRange = (dateStr, range) => {
    if (!range || range === "all" || !dateStr) return true;
    const d = dayjs(dateStr);
    if (!d.isValid()) return true;
    const now = dayjs();
    if (range === "today") return d.isSame(now, "day");
    if (range === "7days") return d.isAfter(now.subtract(7, "day"));
    if (range === "30days") return d.isAfter(now.subtract(30, "day"));
    return true;
  };

  const filteredRequests = useMemo(() => {
    return requests.filter((m) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const nameMatch = (m.client_name || "").toLowerCase().includes(q);
        const solMatch = (m.sol_id || "").toLowerCase().includes(q);
        const reqNoMatch = (m.request_no || "").toLowerCase().includes(q);
        const prodMatch = (m.items || []).some((it) => (it.product || "").toLowerCase().includes(q));
        if (!nameMatch && !solMatch && !reqNoMatch && !prodMatch) return false;
      }
      if (!matchesDateRange(m.created_at || m.updated_at, selectedDateRange)) return false;
      return true;
    });
  }, [requests, searchQuery, selectedDateRange]);

  // Tab subsets
  const pendingRequests = useMemo(
    () => filteredRequests.filter((r) => r.status === "pending" || r.status === "submitted" || r.status === "draft"),
    [filteredRequests]
  );
  const approvedRequests = useMemo(
    () => filteredRequests.filter((r) => r.status === "approved" || r.status === "partial_approved"),
    [filteredRequests]
  );
  const rejectedRequests = useMemo(
    () => filteredRequests.filter((r) => r.status === "rejected"),
    [filteredRequests]
  );
  const historyRequests = filteredRequests;

  // Stats calculation
  const totalCount = requests.length;
  const pendingCount = requests.filter((r) => r.status === "pending" || r.status === "submitted").length;
  const approvedCount = requests.filter((r) => r.status === "approved" || r.status === "partial_approved").length;
  const rejectedCount = requests.filter((r) => r.status === "rejected").length;

  // Actions
  const handleApprove = async (id, payload) => {
    try {
      await api.patch(`/material-requests/${id}`, payload);
      toast.success("Material request approved successfully");
      invalidateMatReqs();
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const handleReject = async (id, reason) => {
    try {
      await api.patch(`/material-requests/${id}`, {
        status: "rejected",
        remarks: reason || "Request rejected by administrator",
      });
      toast.success("Material request rejected");
      invalidateMatReqs();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const handleRetry = async (id) => {
    try {
      await api.post(`/material-requests/${id}/retry`);
      toast.success("Retry request created successfully");
      invalidateMatReqs();
      setTab("pending");
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader
          title="Material Management"
          subtitle="Centralized material requests, approvals, dispatch tracking, and audit history."
          badge={`${totalCount} Total Requests`}
        />
        <Button
          onClick={() => setCreateModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-sm self-start sm:self-auto gap-1.5"
          data-testid="new-material-request-page-btn"
        >
          <Plus className="w-4 h-4" /> New Material Request
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 border-slate-200 bg-white card-lift">
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <PackageSearch className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">All Requests</span>
          </div>
          <div className="text-2xl font-bold tabular-nums text-slate-900 mt-2">{totalCount}</div>
          <div className="text-xs text-slate-500 mt-0.5">Total logged in system</div>
        </Card>

        <Card className="p-4 border-slate-200 bg-white card-lift">
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">Pending</span>
          </div>
          <div className="text-2xl font-bold tabular-nums text-amber-700 mt-2">{pendingCount}</div>
          <div className="text-xs text-slate-500 mt-0.5">Awaiting review / approval</div>
        </Card>

        <Card className="p-4 border-slate-200 bg-white card-lift">
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">Approved</span>
          </div>
          <div className="text-2xl font-bold tabular-nums text-emerald-700 mt-2">{approvedCount}</div>
          <div className="text-xs text-slate-500 mt-0.5">Ready for dispatch / Issued</div>
        </Card>

        <Card className="p-4 border-slate-200 bg-white card-lift">
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
              <XCircle className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-semibold text-red-700 uppercase tracking-wider">Rejected</span>
          </div>
          <div className="text-2xl font-bold tabular-nums text-red-700 mt-2">{rejectedCount}</div>
          <div className="text-xs text-slate-500 mt-0.5">Available for retry/rework</div>
        </Card>
      </div>

      {/* Filter Bar */}
      <Card className="p-3 border-slate-200 bg-slate-50/60">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
          <div className="relative sm:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <Input
              placeholder="Search by Client Name, Sol ID, Request #, or Product..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-xs bg-white"
            />
          </div>
          <div>
            <Select value={selectedDateRange} onValueChange={setSelectedDateRange}>
              <SelectTrigger className="text-xs bg-white">
                <SelectValue placeholder="Date Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Dates</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="7days">Last 7 Days</SelectItem>
                <SelectItem value="30days">Last 30 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Main Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-slate-100 p-1 rounded-xl flex gap-1">
          <TabsTrigger value="pending" className="text-xs font-semibold px-4 py-2 gap-1.5" data-testid="tab-mr-pending">
            <Clock className="w-3.5 h-3.5 text-amber-600" /> Pending Requests
            {pendingCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-amber-200 text-amber-900 rounded-full text-[10px] font-bold">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved" className="text-xs font-semibold px-4 py-2 gap-1.5" data-testid="tab-mr-approved">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Approved & Material Ready
            {approvedCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-bold">
                {approvedCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="rejected" className="text-xs font-semibold px-4 py-2 gap-1.5" data-testid="tab-mr-rejected">
            <XCircle className="w-3.5 h-3.5 text-red-600" /> Rejected
            {rejectedCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-red-100 text-red-800 rounded-full text-[10px] font-bold">
                {rejectedCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs font-semibold px-4 py-2 gap-1.5" data-testid="tab-mr-history">
            <History className="w-3.5 h-3.5 text-indigo-600" /> Material History ({historyRequests.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Pending */}
        <TabsContent value="pending" className="space-y-4">
          <MaterialRequestList
            requests={pendingRequests}
            isLoading={isLoading}
            canApproval={canApproval}
            canReject={canReject}
            canRetry={canRetry}
            onApprove={handleApprove}
            onReject={handleReject}
            onRetry={handleRetry}
            emptyMessage="No pending material requests found."
          />
        </TabsContent>

        {/* Tab 2: Approved / Ready */}
        <TabsContent value="approved" className="space-y-4">
          <MaterialRequestList
            requests={approvedRequests}
            isLoading={isLoading}
            canApproval={canApproval}
            canReject={canReject}
            canRetry={canRetry}
            onApprove={handleApprove}
            onReject={handleReject}
            onRetry={handleRetry}
            emptyMessage="No approved material requests found."
          />
        </TabsContent>

        {/* Tab 3: Rejected */}
        <TabsContent value="rejected" className="space-y-4">
          <MaterialRequestList
            requests={rejectedRequests}
            isLoading={isLoading}
            canApproval={canApproval}
            canReject={canReject}
            canRetry={canRetry}
            onApprove={handleApprove}
            onReject={handleReject}
            onRetry={handleRetry}
            emptyMessage="No rejected material requests."
          />
        </TabsContent>

        {/* Tab 4: History */}
        <TabsContent value="history" className="space-y-4">
          <MaterialRequestList
            requests={historyRequests}
            isLoading={isLoading}
            canApproval={canApproval}
            canReject={canReject}
            canRetry={canRetry}
            onApprove={handleApprove}
            onReject={handleReject}
            onRetry={handleRetry}
            emptyMessage="No material request history logged yet."
          />
        </TabsContent>
      </Tabs>

      {/* Modal: New Material Request */}
      {createModalOpen && (
        <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold">
                <PackageSearch className="w-5 h-5 text-blue-600" /> Create Material Request
              </DialogTitle>
              <DialogDescription className="text-xs">
                Select a client project to submit required materials for inventory allocation and approval.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              <div>
                <Label className="text-xs font-semibold">Select Client / Project *</Label>
                <Select value={selectedClientForNew} onValueChange={setSelectedClientForNew}>
                  <SelectTrigger className="mt-1 text-xs">
                    <SelectValue placeholder="Choose a client..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.full_name} ({c.sol_id || c.consumer_number || "—"}) — {c.system_kw ? `${c.system_kw} kW` : "System"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedClientForNew ? (
                <div className="border-t pt-4">
                  <MaterialRequest
                    clientId={selectedClientForNew}
                    onDone={() => {
                      setCreateModalOpen(false);
                      setSelectedClientForNew("");
                      invalidateMatReqs();
                    }}
                  />
                </div>
              ) : (
                <div className="p-6 text-center text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed">
                  Please pick a client above to open the material item list.
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponent: Material Request List & Card
// ─────────────────────────────────────────────────────────────────────────────
function MaterialRequestList({
  requests,
  isLoading,
  canApproval,
  canReject,
  canRetry,
  onApprove,
  onReject,
  onRetry,
  emptyMessage,
}) {
  if (isLoading) {
    return (
      <Card className="border-slate-200 p-6 space-y-4 animate-pulse">
        {[1, 2, 3].map((x) => (
          <div key={x} className="flex justify-between items-center py-4 border-b border-slate-100 last:border-none">
            <div className="space-y-2 flex-1">
              <div className="h-4 w-32 bg-slate-200 rounded" />
              <div className="h-3 w-64 bg-slate-100 rounded" />
            </div>
            <div className="h-8 w-24 bg-slate-200 rounded" />
          </div>
        ))}
      </Card>
    );
  }

  if (requests.length === 0) {
    return (
      <Card className="border-slate-200 p-12 text-center text-slate-400 text-sm">
        <PackageSearch className="w-10 h-10 mx-auto text-slate-300 mb-2" />
        {emptyMessage}
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 divide-y divide-slate-100 overflow-hidden">
      {requests.map((m) => (
        <MaterialRequestItem
          key={m.id}
          request={m}
          canApproval={canApproval}
          canReject={canReject}
          canRetry={canRetry}
          onApprove={onApprove}
          onReject={onReject}
          onRetry={onRetry}
        />
      ))}
    </Card>
  );
}

function MaterialRequestItem({
  request: m,
  canApproval,
  canReject,
  canRetry,
  onApprove,
  onReject,
  onRetry,
}) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const submitReject = async () => {
    if (!rejectReason.trim()) {
      toast.error("Please provide a reason for rejection");
      return;
    }
    setRejecting(true);
    try {
      await onReject(m.id, rejectReason);
      setRejectOpen(false);
    } finally {
      setRejecting(false);
    }
  };

  return (
    <div className="p-5 flex flex-col md:flex-row items-start justify-between gap-4 hover:bg-slate-50/40 transition-colors">
      <div className="flex-1 min-w-0 space-y-3">
        {/* Header line */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs bg-slate-100 text-slate-800 px-2 py-0.5 rounded font-semibold">
            {m.request_no || "MR-REQ"}
          </span>
          <Link
            to={`/client-data/${m.client_id}`}
            className="font-bold text-slate-900 text-sm hover:text-blue-600 flex items-center gap-1"
          >
            {m.client_name || "Client"}
            <ExternalLink className="w-3 h-3 text-slate-400" />
          </Link>
          <span className="text-xs text-slate-500 font-mono">({m.sol_id || m.client_id})</span>
          {m.system_kw && (
            <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
              {m.system_kw} kW
            </Badge>
          )}
          <Badge
            variant="outline"
            className={`text-[10px] font-bold ${
              m.status === "approved"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : m.status === "partial_approved"
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : m.status === "rejected"
                ? "bg-red-50 text-red-700 border-red-200"
                : "bg-slate-100 text-slate-700 border-slate-200"
            }`}
          >
            {(m.status || "pending").replace("_", " ").toUpperCase()}
          </Badge>
        </div>

        {/* Metadata subline */}
        <div className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
          <span>
            Requested by: <strong className="text-slate-700">{m.requested_by_name || "Staff"}</strong>
          </span>
          <span>•</span>
          <span>Date: {dayjs(m.created_at).format("MMM D, YYYY h:mm A")}</span>
          {m.approval?.by && (
            <>
              <span>•</span>
              <span className="text-emerald-700">
                Approved by: <strong>{m.approval.by}</strong> ({dayjs(m.approval.at).format("MMM D, YYYY")})
              </span>
            </>
          )}
        </div>

        {/* Remarks / Rejection Reason */}
        {m.remarks && (
          <div className="text-xs bg-slate-50 p-2 rounded border text-slate-600 italic">
            <strong>Remarks:</strong> {m.remarks}
          </div>
        )}

        {/* Items Table */}
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 border-b">
              <tr>
                <th className="py-2 px-3">Product Name</th>
                <th className="py-2 px-2">Size / Spec</th>
                <th className="py-2 px-2 text-right">Requested</th>
                <th className="py-2 px-2 text-right">Available Stock</th>
                <th className="py-2 px-2 text-right">Approved</th>
                <th className="py-2 px-3 text-right">Pending</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(m.items || []).map((it, idx) => {
                const requested = Number(it.quantity || 0);
                const available = Number(it.available_stock || 0);
                const approved = it.approved_quantity != null ? Number(it.approved_quantity) : (m.status === "approved" ? requested : 0);
                const pending = m.status === "pending" ? requested : Math.max(0, requested - approved);

                return (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="py-2 px-3 font-semibold text-slate-800">
                      {it.product} {it.variant ? `(${it.variant})` : ""}
                    </td>
                    <td className="py-2 px-2 text-slate-600">{it.size || "—"}</td>
                    <td className="py-2 px-2 text-right font-medium">{requested} {it.unit || "Nos"}</td>
                    <td className="py-2 px-2 text-right">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        available >= requested ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                      }`}>
                        {available} {it.unit || "Nos"}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right font-bold text-emerald-700">
                      {approved > 0 ? `${approved} ${it.unit || "Nos"}` : "—"}
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-slate-600">
                      {pending > 0 ? `${pending} ${it.unit || "Nos"}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Delivery Details when available */}
        {m.delivery && (
          <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-lg text-xs grid sm:grid-cols-3 gap-2">
            <div>
              <span className="text-[10px] uppercase font-semibold text-emerald-800">Challan No:</span>
              <div className="font-mono font-bold text-slate-800">{m.delivery.challan_number || "—"}</div>
            </div>
            <div>
              <span className="text-[10px] uppercase font-semibold text-emerald-800">Vehicle / Driver:</span>
              <div className="font-medium text-slate-800">{m.delivery.vehicle_number || "—"} ({m.delivery.driver_name || "—"})</div>
            </div>
            <div>
              <span className="text-[10px] uppercase font-semibold text-emerald-800">Delivery Date:</span>
              <div className="font-medium text-slate-800">{m.delivery.delivery_date ? dayjs(m.delivery.delivery_date).format("MMM D, YYYY") : "—"}</div>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex sm:flex-col gap-2 shrink-0 self-end sm:self-start pt-2 sm:pt-0">
        {(m.status === "pending" || m.status === "submitted" || m.status === "draft") && (
          <>
            {canApproval && (
              <MaterialApprovalDialog
                request={m}
                onSubmit={(payload) => onApprove(m.id, payload)}
              />
            )}
            {canReject && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRejectOpen(true)}
                className="text-red-600 hover:bg-red-50 text-xs font-semibold"
                data-testid={`mr-reject-btn-${m.id}`}
              >
                <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
              </Button>
            )}
          </>
        )}

        {m.status === "rejected" && canRetry && (
          <Button
            size="sm"
            onClick={() => onRetry(m.id)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold gap-1"
            data-testid={`mr-retry-btn-${m.id}`}
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry Request
          </Button>
        )}
      </div>

      {/* Rejection Dialog */}
      {rejectOpen && (
        <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600 font-bold">
                <XCircle className="w-5 h-5" /> Reject Material Request
              </DialogTitle>
              <DialogDescription className="text-xs">
                Provide a reason for rejecting this material request. This will be preserved in history for audit and retry.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2">
              <Label className="text-xs font-semibold">Rejection Reason *</Label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Out of stock, duplicate request, wrong panel specifications..."
                className="mt-1 text-xs"
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setRejectOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={submitReject}
                disabled={rejecting}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold text-xs"
              >
                {rejecting ? "Rejecting..." : "Confirm Rejection"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponent: Approval Dialog with Material Editing & Dispatch info
// ─────────────────────────────────────────────────────────────────────────────
function MaterialApprovalDialog({ request, onSubmit }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [delivery, setDelivery] = useState({
    challan_number: "",
    vehicle_number: "",
    driver_name: "",
    delivery_date: dayjs().format("YYYY-MM-DD"),
    remarks: "",
  });
  const [items, setItems] = useState(() =>
    (request?.items || []).map((it) => ({
      product: it.product || "",
      size: it.size || "",
      unit: it.unit || "Nos",
      variant: it.variant || "",
      quantity: Number(it.quantity || 1),
      approved_quantity: it.approved_quantity != null ? Number(it.approved_quantity) : Number(it.quantity || 1),
    }))
  );

  const updateItem = (idx, field, value) => {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const removeItem = (idx) => {
    if (items.length <= 1) {
      toast.error("At least one item line is required");
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const addItem = () => {
    setItems((prev) => [...prev, { product: "", size: "", unit: "Nos", variant: "", quantity: 1, approved_quantity: 1 }]);
  };

  const handleApproveSubmit = async () => {
    const formatted = items.map((it) => ({
      product: String(it.product || "").trim(),
      size: String(it.size || "").trim(),
      unit: String(it.unit || "Nos").trim(),
      variant: String(it.variant || "").trim(),
      quantity: Number(it.quantity || 0),
      approved_quantity: Number(it.approved_quantity || 0),
    }));

    const isPartial = formatted.some((it) => Number(it.approved_quantity) < Number(it.quantity || 0));
    const status = isPartial ? "partial_approved" : "approved";

    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({
        status,
        items: formatted,
        challan_number: delivery.challan_number,
        vehicle_number: delivery.vehicle_number,
        driver_name: delivery.driver_name,
        delivery_date: delivery.delivery_date,
        remarks: delivery.remarks,
      });
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold gap-1"
        data-testid={`mr-approve-btn-${request?.id}`}
      >
        <CheckCircle2 className="w-3.5 h-3.5" /> Approve & Dispatch
      </Button>

      {open && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" /> Approve Material & Schedule Dispatch
              </DialogTitle>
              <DialogDescription className="text-xs">
                Review, modify quantities/products, and optionally log Challan & Vehicle info. Approved items will auto-update project execution status.
              </DialogDescription>
            </DialogHeader>

            {/* Editable Items */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Item Quantities to Approve</Label>
                <Button type="button" size="xs" variant="outline" onClick={addItem} className="text-xs">
                  <Plus className="w-3 h-3 mr-1" /> Add Line
                </Button>
              </div>

              <div className="rounded-lg border border-slate-200 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase text-slate-500 border-b">
                    <tr>
                      <th className="py-2 px-3 text-left">Product Name *</th>
                      <th className="py-2 px-2 text-left">Size / Spec</th>
                      <th className="py-2 px-2 text-left">Unit</th>
                      <th className="py-2 px-2 text-right">Req Qty</th>
                      <th className="py-2 px-2 text-right">Approve Qty *</th>
                      <th className="py-2 px-2 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((it, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-1.5 px-3">
                          <Input
                            value={it.product}
                            onChange={(e) => updateItem(idx, "product", e.target.value)}
                            placeholder="Product name"
                            className="h-8 text-xs"
                          />
                        </td>
                        <td className="py-1.5 px-2">
                          <Input
                            value={it.size}
                            onChange={(e) => updateItem(idx, "size", e.target.value)}
                            placeholder="Size / Spec"
                            className="h-8 text-xs"
                          />
                        </td>
                        <td className="py-1.5 px-2">
                          <Select value={it.unit} onValueChange={(v) => updateItem(idx, "unit", v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Nos">Nos</SelectItem>
                              <SelectItem value="Meter">Meter</SelectItem>
                              <SelectItem value="Set">Set</SelectItem>
                              <SelectItem value="Kg">Kg</SelectItem>
                              <SelectItem value="Pcs">Pcs</SelectItem>
                              <SelectItem value="Box">Box</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          <Input
                            type="number"
                            value={it.quantity}
                            onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                            className="h-8 text-right text-xs"
                          />
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          <Input
                            type="number"
                            value={it.approved_quantity}
                            onChange={(e) => updateItem(idx, "approved_quantity", e.target.value)}
                            className="h-8 text-right text-xs font-bold text-emerald-700"
                          />
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItem(idx)}
                            disabled={items.length <= 1}
                            className="h-7 w-7 text-red-500 hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Delivery / Challan Info */}
              <div className="pt-2">
                <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Dispatch / Challan Information (Optional)</Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                  <div>
                    <Label className="text-[11px] text-slate-500">Challan Number</Label>
                    <Input
                      value={delivery.challan_number}
                      onChange={(e) => setDelivery({ ...delivery, challan_number: e.target.value })}
                      placeholder="e.g. CH-2026-0042"
                      className="mt-1 h-8 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-slate-500">Vehicle Number</Label>
                    <Input
                      value={delivery.vehicle_number}
                      onChange={(e) => setDelivery({ ...delivery, vehicle_number: e.target.value })}
                      placeholder="e.g. MH-12-AB-1234"
                      className="mt-1 h-8 text-xs uppercase font-mono"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-slate-500">Driver Name</Label>
                    <Input
                      value={delivery.driver_name}
                      onChange={(e) => setDelivery({ ...delivery, driver_name: e.target.value })}
                      placeholder="e.g. Ramesh Kumar"
                      className="mt-1 h-8 text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="pt-4">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleApproveSubmit}
                disabled={submitting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs"
              >
                {submitting ? "Approving..." : "Confirm Approval & Ready Material"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
