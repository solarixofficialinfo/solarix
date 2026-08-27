import React, { useState, useEffect, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Download,
  Eye,
  Hash,
  ArrowDownToLine,
  ArrowUpFromLine,
  Search,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check
} from "lucide-react";
import dayjs from "dayjs";
import { toast } from "sonner";
import { useEntitlements } from "@/hooks/useEntitlements";

export default function SerialTrackingTab({ globalSearch = "" }) {
  const { hasFeature } = useEntitlements();
  const [data, setData] = useState({ rows: [], total: 0, page: 1, pages: 1, page_size: 50 });
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState(globalSearch);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [copied, setCopied] = useState(false);

  // Debounce search
  useEffect(() => {
    setSearchQuery(globalSearch);
  }, [globalSearch]);

  const fetchSerials = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        page,
        page_size: pageSize,
        type: typeFilter !== "all" ? typeFilter : undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        search: searchQuery || undefined
      };
      const res = await api.get("/inventory/serial-tracking", { params });
      setData(res.data || { rows: [], total: 0, page: 1, pages: 1, page_size: pageSize });
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, typeFilter, statusFilter, searchQuery]);

  useEffect(() => {
    fetchSerials();
  }, [fetchSerials]);

  const handleExportCsv = async () => {
    if (!hasFeature("export")) {
      toast.error("Export is not included in your current plan.");
      return;
    }
    try {
      const params = {
        type: typeFilter !== "all" ? typeFilter : undefined,
        search: searchQuery || undefined
      };
      const res = await api.get("/inventory/serial-tracking.csv", {
        params,
        responseType: "blob"
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "solarix-serial-numbers-tracking.csv");
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      toast.success("Serial tracking CSV exported successfully");
    } catch (err) {
      toast.error("Failed to export CSV");
    }
  };

  const copySerialsToClipboard = () => {
    if (!selectedEntry || !selectedEntry.serial_numbers) return;
    const text = selectedEntry.serial_numbers.join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(`${selectedEntry.serial_numbers.length} serial numbers copied!`);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalPages = Math.max(1, Math.ceil((data.total || 0) / (pageSize || 50)));

  return (
    <div className="space-y-4">
      {/* Control / Filter Bar */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardContent className="p-3.5 space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-40">
                <Select
                  value={typeFilter}
                  onValueChange={(v) => {
                    setTypeFilter(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-9 text-xs bg-slate-50 border-slate-200" data-testid="serial-type-filter">
                    <SelectValue placeholder="All Transactions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="inward">Inward Only</SelectItem>
                    <SelectItem value="outward">Outward Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="w-36">
                <Select
                  value={statusFilter}
                  onValueChange={(v) => {
                    setStatusFilter(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-9 text-xs bg-slate-50 border-slate-200" data-testid="serial-status-filter">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="in_stock">IN STOCK</SelectItem>
                    <SelectItem value="out">OUT / ISSUED</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="relative flex-1 sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search product, vendor, client, serial no..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  className="pl-8 h-9 text-xs bg-slate-50 border-slate-200"
                  data-testid="serial-search-input"
                />
              </div>

              {(typeFilter !== "all" || statusFilter !== "all" || searchQuery) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setTypeFilter("all");
                    setStatusFilter("all");
                    setSearchQuery("");
                    setPage(1);
                  }}
                  className="h-9 text-xs text-slate-500 hover:text-slate-700"
                >
                  <RotateCcw className="w-3 h-3 mr-1" /> Reset
                </Button>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={!hasFeature("export")}
              className="h-9 text-xs border-slate-200 hover:bg-slate-50"
              data-testid="serial-export-csv-btn"
            >
              <Download className="w-3.5 h-3.5 mr-1.5 text-slate-600" />
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Main Table Card */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardContent className="p-0">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-base font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>
                Serial No. Tracking
              </div>
              <div className="text-xs text-slate-500">
                {data.total} transactions with tracked serial numbers {loading && "· loading…"}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[65vh]">
            <table className="w-full text-sm text-left" data-testid="serial-tracking-table">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 sticky top-0 z-10 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Product</th>
                  <th className="px-4 py-2.5 font-semibold">Vendor</th>
                  <th className="px-4 py-2.5 font-semibold">Client / Purchased By</th>
                  <th className="px-4 py-2.5 font-semibold text-center">Type</th>
                  <th className="px-4 py-2.5 font-semibold text-center">Quantity</th>
                  <th className="px-4 py-2.5 font-semibold">Date</th>
                  <th className="px-4 py-2.5 font-semibold">Reference</th>
                  <th className="px-4 py-2.5 font-semibold text-center">Status</th>
                  <th className="px-4 py-2.5 font-semibold text-center w-20">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {!loading && data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-16 text-center text-slate-400">
                      <Hash className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                      <div className="font-semibold text-slate-700">No serial tracked transactions found</div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        Inward or Outward entries with Serial Number Tracking enabled will appear here.
                      </div>
                    </td>
                  </tr>
                ) : (
                  data.rows.map((row) => {
                    const isInward = row.type === "Inward" || row.type === "IN";
                    const isStock = row.status === "IN STOCK" || row.status === "AVAILABLE";

                    return (
                      <tr
                        key={row.id}
                        className="hover:bg-slate-50/70 transition-colors"
                        data-testid={`serial-row-${row.id}`}
                      >
                        {/* Product */}
                        <td className="px-4 py-2.5 font-medium text-slate-900">
                          <div>{row.product}</div>
                          {row.size && <div className="text-[10px] text-slate-400">{row.size}</div>}
                        </td>

                        {/* Vendor */}
                        <td className="px-4 py-2.5 text-slate-600">{row.vendor || "—"}</td>

                        {/* Client / Purchased By */}
                        <td className="px-4 py-2.5 text-slate-600">{row.client_name || "—"}</td>

                        {/* Type */}
                        <td className="px-4 py-2.5 text-center">
                          <Badge
                            variant="outline"
                            className={
                              isInward
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]"
                                : "bg-amber-50 text-amber-700 border-amber-200 text-[10px]"
                            }
                          >
                            {isInward ? (
                              <ArrowDownToLine className="w-2.5 h-2.5 mr-1 inline" />
                            ) : (
                              <ArrowUpFromLine className="w-2.5 h-2.5 mr-1 inline" />
                            )}
                            {row.type}
                          </Badge>
                        </td>

                        {/* Quantity */}
                        <td className="px-4 py-2.5 text-center font-bold text-slate-800">
                          {row.quantity}
                        </td>

                        {/* Date */}
                        <td className="px-4 py-2.5 text-slate-600 tabular-nums">
                          {dayjs(row.date || row.created_at).format("DD MMM YYYY")}
                        </td>

                        {/* Reference */}
                        <td className="px-4 py-2.5 font-mono text-slate-700">{row.reference_number || "—"}</td>

                        {/* Status */}
                        <td className="px-4 py-2.5 text-center">
                          <Badge
                            variant="outline"
                            className={
                              isStock
                                ? "bg-emerald-50 text-emerald-700 border-emerald-300 text-[10px] font-semibold"
                                : row.status === "OUT / ISSUED"
                                ? "bg-slate-100 text-slate-600 border-slate-300 text-[10px] font-medium"
                                : "bg-blue-50 text-blue-700 border-blue-300 text-[10px] font-semibold"
                            }
                          >
                            {row.status}
                          </Badge>
                        </td>

                        {/* Action (ONLY One Eye Button to open serial details modal) */}
                        <td className="px-4 py-2.5 text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSelectedEntry(row)}
                            className="h-7 w-7 text-slate-600 hover:bg-blue-50 hover:text-blue-600"
                            title="View Serial Numbers"
                            data-testid={`reveal-btn-${row.id}`}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.total > pageSize && (
            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2 text-xs">
              <div className="text-slate-500">
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, data.total)} of {data.total}
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => {
                    setPageSize(Number(v));
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25 / page</SelectItem>
                    <SelectItem value="50">50 / page</SelectItem>
                    <SelectItem value="100">100 / page</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </Button>
                  <span className="px-2 font-mono">{page} / {totalPages}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Serial Numbers Viewing Dialog / Modal */}
      <Dialog open={Boolean(selectedEntry)} onOpenChange={(open) => !open && setSelectedEntry(null)}>
        <DialogContent className="max-w-md bg-white p-6 rounded-2xl shadow-2xl border border-slate-100">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
              Serial Numbers ({selectedEntry?.serial_numbers?.length || 0})
            </DialogTitle>
            <div className="text-xs text-slate-500 space-y-0.5 pt-1">
              <div className="font-semibold text-slate-800">
                {selectedEntry?.product} {selectedEntry?.size ? `(${selectedEntry?.size})` : ""}
              </div>
              <div className="text-[11px]">
                {selectedEntry?.type === "IN" ? `Vendor: ${selectedEntry?.vendor}` : `Client: ${selectedEntry?.client_name}`} · Ref: <span className="font-mono">{selectedEntry?.reference_number}</span> · Date: {selectedEntry?.date}
              </div>
            </div>
          </DialogHeader>

          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500 border-b border-slate-100 pb-2">
              <span className="font-semibold uppercase tracking-wider text-[10px]">Tracked Serial Number</span>
              <span className="font-semibold uppercase tracking-wider text-[10px]">Status</span>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
              {(selectedEntry?.detailed_serials && selectedEntry.detailed_serials.length > 0) ? (
                selectedEntry.detailed_serials.map((s, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg text-xs"
                  >
                    <span className="font-mono font-bold text-slate-800 select-all">
                      {s.serial_number}
                    </span>
                    <Badge
                      variant="outline"
                      className={
                        s.status === "IN STOCK"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-300 text-[10px] font-semibold"
                          : "bg-slate-100 text-slate-600 border-slate-300 text-[10px] font-medium"
                      }
                    >
                      {s.status}
                    </Badge>
                  </div>
                ))
              ) : (
                (selectedEntry?.serial_numbers || []).map((sn, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg text-xs"
                  >
                    <span className="font-mono font-bold text-slate-800 select-all">
                      {sn}
                    </span>
                    <Badge
                      variant="outline"
                      className="bg-emerald-50 text-emerald-700 border-emerald-300 text-[10px]"
                    >
                      {selectedEntry?.status || "IN STOCK"}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </div>

          <DialogFooter className="mt-5 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copySerialsToClipboard}
              className="text-xs h-8 gap-1.5 border-slate-200"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
              {copied ? "Copied" : "Copy All Serials"}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setSelectedEntry(null)}
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs h-8 px-4"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
