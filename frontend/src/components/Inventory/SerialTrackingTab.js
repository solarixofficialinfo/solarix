import React, { useState, useEffect, useMemo, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Filter
} from "lucide-react";
import dayjs from "dayjs";
import { toast } from "sonner";

export default function SerialTrackingTab({ globalSearch = "" }) {
  const [data, setData] = useState({ rows: [], total: 0, page: 1, pages: 1, page_size: 50 });
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState(globalSearch);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [revealedIds, setRevealedIds] = useState(new Set());

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

  const handleReveal = (rowId) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      next.add(rowId);
      return next;
    });
  };

  const handleExportCsv = async () => {
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
                  placeholder="Search serial no., product, vendor, client..."
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
                {data.total} tracked serial numbers {loading && "· loading…"}
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
                  <th className="px-4 py-2.5 font-semibold">Date</th>
                  <th className="px-4 py-2.5 font-semibold">Reference</th>
                  <th className="px-4 py-2.5 font-semibold">Serial No.</th>
                  <th className="px-4 py-2.5 font-semibold text-center">Status</th>
                  <th className="px-4 py-2.5 font-semibold text-center w-20">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {!loading && data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-16 text-center text-slate-400">
                      <Hash className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                      <div className="font-semibold text-slate-700">No serial numbers found</div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        Inward or Outward entries with Serial Number Tracking enabled will appear here automatically.
                      </div>
                    </td>
                  </tr>
                ) : (
                  data.rows.map((row) => {
                    const isRevealed = revealedIds.has(row.id);
                    const isInward = row.type === "Inward" || row.type === "IN";
                    const isStock = row.status === "IN STOCK" || row.status === "AVAILABLE" || (isInward && row.status !== "OUT / ISSUED");

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

                        {/* Date */}
                        <td className="px-4 py-2.5 text-slate-600 tabular-nums">
                          {dayjs(row.date || row.created_at).format("DD MMM YYYY")}
                        </td>

                        {/* Reference */}
                        <td className="px-4 py-2.5 font-mono text-slate-700">{row.reference_number || "—"}</td>

                        {/* Serial No. (Masked by default) */}
                        <td className="px-4 py-2.5">
                          <span className="font-mono font-bold tracking-wider text-slate-800 select-all">
                            {isRevealed ? row.serial_number : "••••••••••••"}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-2.5 text-center">
                          <Badge
                            variant="outline"
                            className={
                              isStock
                                ? "bg-emerald-50 text-emerald-700 border-emerald-300 text-[10px] font-semibold"
                                : "bg-slate-100 text-slate-600 border-slate-300 text-[10px] font-medium"
                            }
                          >
                            {row.status || (isStock ? "IN STOCK" : "OUT / ISSUED")}
                          </Badge>
                        </td>

                        {/* Action (Eye click to view) */}
                        <td className="px-4 py-2.5 text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleReveal(row.id)}
                            className={`h-7 w-7 ${isRevealed ? "text-blue-600 hover:bg-transparent cursor-default" : "text-slate-500 hover:bg-blue-50 hover:text-blue-600"}`}
                            title="View Serial Number"
                            data-testid={`reveal-btn-${row.id}`}
                          >
                            <Eye className="w-3.5 h-3.5" />
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
    </div>
  );
}
