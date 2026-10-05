import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError } from "@/lib/api";
import { useClientList } from "@/hooks/useClients";
import { useProductList } from "@/hooks/useInventory";
import { invalidateAllClientQueries } from "@/lib/queryKeys";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ProductAutocompleteInput, getStandardizedUnitOptions } from "@/components/Inventory/_shared";
import { TrendingUp, Plus, Search, RefreshCw, ShoppingCart, Users, Package, Calendar, FileText } from "lucide-react";
import { toast } from "sonner";
import dayjs from "dayjs";

export default function B2BSalesView({ globalSearch = "", onChanged }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  // New B2B Sale Modal State
  const [newSaleOpen, setNewSaleOpen] = useState(false);
  const [saleForm, setSaleForm] = useState({
    client_id: "",
    client_name: "",
    bill_number: "",
    date: dayjs().format("YYYY-MM-DD"),
    product: "",
    product_id: "",
    size: "",
    quantity: "",
    unit: "Nos",
    remarks: ""
  });
  const [savingSale, setSavingSale] = useState(false);

  // Queries
  const { data: clientList = [] } = useClientList();
  const { data: productList = [] } = useProductList();

  const { data: salesData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["inventory-b2b-sales"],
    queryFn: async () => {
      const res = await api.get("/inventory/b2b-sales");
      return res.data?.sales || [];
    },
    staleTime: 1000 * 30,
  });

  const rawSales = salesData;
  const sales = useMemo(() => (Array.isArray(rawSales) ? rawSales : []), [rawSales]);

  // Filtered sales
  const activeSearch = (search || globalSearch || "").trim().toLowerCase();
  const filteredSales = useMemo(() => {
    if (!activeSearch) return sales;
    return sales.filter((s) =>
      (s.client_name || "").toLowerCase().includes(activeSearch) ||
      (s.bill_number || "").toLowerCase().includes(activeSearch) ||
      (s.product || "").toLowerCase().includes(activeSearch) ||
      (s.size || "").toLowerCase().includes(activeSearch) ||
      (s.date || "").includes(activeSearch)
    );
  }, [sales, activeSearch]);

  // Aggregate stats
  const stats = useMemo(() => {
    let totUnits = 0;
    const uniqueClients = new Set();
    sales.forEach((s) => {
      totUnits += Number(s.quantity || 0);
      if (s.client_name && s.client_name !== "—") uniqueClients.add(s.client_name);
    });
    const dates = sales.map((s) => s.date).filter(Boolean);
    const lastDate = dates.length ? dates[0] : "—";

    return {
      totalSales: sales.length,
      totalUnits: Math.round(totUnits * 100) / 100,
      activeClients: uniqueClients.size,
      lastDate
    };
  }, [sales]);

  // Open New Sale modal with suggested bill number
  const handleOpenNewSale = () => {
    // Generate suggested bill number if possible
    const existingNums = sales
      .map((s) => s.bill_number)
      .filter((b) => b && b.startsWith("B2B-"))
      .map((b) => parseInt(b.replace("B2B-", ""), 10))
      .filter((n) => !isNaN(n));
    const nextNum = existingNums.length ? Math.max(...existingNums) + 1 : sales.length + 1;
    const suggestedBill = `B2B-${String(nextNum).padStart(3, "0")}`;

    setSaleForm({
      client_id: "",
      client_name: "",
      bill_number: suggestedBill,
      date: dayjs().format("YYYY-MM-DD"),
      product: "",
      product_id: "",
      size: "",
      quantity: "",
      unit: "Nos",
      remarks: ""
    });
    setNewSaleOpen(true);
  };

  const handleSelectClient = (clientId) => {
    const selected = (clientList || []).find((c) => c.id === clientId);
    if (selected) {
      setSaleForm((prev) => ({
        ...prev,
        client_id: selected.id,
        client_name: selected.full_name
      }));
    }
  };

  const handleCreateSale = async (e) => {
    e.preventDefault();
    if (!saleForm.client_id || !saleForm.client_name) {
      toast.error("Please select a B2B Client");
      return;
    }
    if (!saleForm.bill_number?.trim()) {
      toast.error("Please enter a Bill Number");
      return;
    }
    if (!saleForm.product?.trim()) {
      toast.error("Please enter a Product Name");
      return;
    }
    if (!saleForm.quantity || Number(saleForm.quantity) <= 0) {
      toast.error("Please enter a valid Quantity greater than 0");
      return;
    }

    setSavingSale(true);
    try {
      const billNo = saleForm.bill_number.trim();
      const payload = {
        client_id: saleForm.client_id,
        client_name: saleForm.client_name,
        product: saleForm.product.trim().toUpperCase(),
        product_id: saleForm.product_id || "",
        size: saleForm.size?.trim() || "",
        quantity: parseFloat(saleForm.quantity),
        unit: saleForm.unit || "Nos",
        bill_number: billNo,
        outward_challan_no: billNo,
        reference_number: billNo,
        date: saleForm.date || dayjs().format("YYYY-MM-DD"),
        remarks: saleForm.remarks?.trim() || "",
        status: "Dispatched",
        party_type: "B2B Client"
      };

      await api.post("/inventory/outward", payload);
      invalidateAllClientQueries(queryClient, saleForm.client_id);
      queryClient.invalidateQueries({ queryKey: ["inventory-b2b-sales"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-b2b-summary"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });

      await refetch();
      setNewSaleOpen(false);
      toast.success(`B2B Sale "${billNo}" to ${saleForm.client_name} saved. Stock updated!`);
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(formatApiError(err, "Failed to save B2B sale"));
    } finally {
      setSavingSale(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="b2b-sales-view">
      {/* Top Banner & Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
              B2B Sales
            </h2>
            <Badge variant="outline" className="text-[11px] font-semibold text-amber-700 bg-amber-50 border-amber-200">
              Outward Dispatches
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Material sold or issued to B2B clients. Every sale decreases stock and automatically links to the Client Ledger.
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by client, bill #, product..."
              className="pl-8 h-9 text-xs bg-slate-50/70 border-slate-200 rounded-xl"
              data-testid="b2b-sales-search"
            />
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-9 px-2.5 text-xs text-slate-600 rounded-xl"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleOpenNewSale}
            className="h-9 px-3.5 text-xs bg-amber-600 hover:bg-amber-700 text-white rounded-xl gap-1.5 shadow-2xs shrink-0 font-medium"
            title="Record New B2B Sale"
            data-testid="new-b2b-sale-btn"
          >
            <Plus className="w-3.5 h-3.5" /> New B2B Sale
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-slate-200 shadow-2xs bg-white rounded-xl">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>B2B Sales</span>
              <ShoppingCart className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-2" style={{ fontFamily: "Outfit" }}>
              {stats.totalSales}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Recorded dispatches</div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-2xs bg-white rounded-xl">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>Units Dispatched</span>
              <Package className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-2" style={{ fontFamily: "Outfit" }}>
              {stats.totalUnits}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Total sold quantity</div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-2xs bg-white rounded-xl">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>Active Buyers</span>
              <Users className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-2" style={{ fontFamily: "Outfit" }}>
              {stats.activeClients}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Distinct B2B clients</div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-2xs bg-white rounded-xl">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>Last Sale Date</span>
              <Calendar className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-2 font-mono text-base" style={{ fontFamily: "Outfit" }}>
              {stats.lastDate}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Most recent dispatch</div>
          </CardContent>
        </Card>
      </div>

      {/* B2B Sales Table */}
      <Card className="border-slate-200 shadow-2xs bg-white rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-slate-500" /> B2B Sales Dispatches ({filteredSales.length})
          </div>
          {activeSearch && (
            <span className="text-xs text-slate-400">
              Matching &ldquo;{activeSearch}&rdquo;
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Bill No</th>
                <th className="py-3 px-4">B2B Client</th>
                <th className="py-3 px-4">Product Name</th>
                <th className="py-3 px-4">Size / Spec</th>
                <th className="py-3 px-4 text-right">Quantity</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Loading B2B sales data...
                  </td>
                </tr>
              ) : filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    No B2B sales recorded yet. Click &ldquo;+ New B2B Sale&rdquo; above to record your first sale.
                  </td>
                </tr>
              ) : (
                filteredSales.map((sale) => (
                  <tr
                    key={sale.id}
                    className="hover:bg-slate-50/60 transition-colors"
                    data-testid={`b2b-sale-row-${sale.id}`}
                  >
                    <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                      {sale.date}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                      <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded-md border border-slate-200/60">
                        {sale.bill_number}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {sale.client_name}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">
                      {sale.product}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {sale.size || "—"}
                    </td>
                    <td className="py-3 px-4 text-right font-bold tabular-nums text-slate-900">
                      {sale.quantity} {sale.unit}
                    </td>
                    <td className="py-3 px-4">
                      <Badge className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold">
                        {sale.status || "Dispatched"}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-slate-500 max-w-xs truncate">
                      {sale.remarks || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* New B2B Sale Modal */}
      <Dialog open={newSaleOpen} onOpenChange={setNewSaleOpen}>
        <DialogContent className="max-w-lg p-6 rounded-2xl" data-testid="new-b2b-sale-dialog">
          <form onSubmit={handleCreateSale} className="space-y-4">
            <DialogHeader className="pb-3 border-b border-slate-100">
              <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2" style={{ fontFamily: "Outfit" }}>
                <Plus className="w-5 h-5 text-amber-600" /> New B2B Sale
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Record material sold / issued to a B2B client. Deducts from warehouse stock and posts to Client Ledger.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
              {/* Select Client */}
              <div className="md:col-span-2 space-y-1">
                <label className="font-semibold text-slate-700">B2B Client *</label>
                <Select value={saleForm.client_id} onValueChange={handleSelectClient}>
                  <SelectTrigger className="h-9 text-xs" data-testid="sale-client-select">
                    <SelectValue placeholder="Select existing B2B client..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(clientList || []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.full_name} {c.city ? `(${c.city})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Bill Number */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Bill Number *</label>
                <Input
                  required
                  value={saleForm.bill_number}
                  onChange={(e) => setSaleForm({ ...saleForm, bill_number: e.target.value })}
                  placeholder="e.g. B2B-001"
                  className="h-9 text-xs font-mono font-medium"
                  data-testid="sale-bill-number"
                />
              </div>

              {/* Date */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Date *</label>
                <Input
                  type="date"
                  required
                  value={saleForm.date}
                  onChange={(e) => setSaleForm({ ...saleForm, date: e.target.value })}
                  className="h-9 text-xs"
                  data-testid="sale-date"
                />
              </div>

              {/* Product */}
              <div className="md:col-span-2 space-y-1">
                <label className="font-semibold text-slate-700">Product Name *</label>
                <ProductAutocompleteInput
                  value={saleForm.product}
                  onChange={(val) => {
                    if (typeof val === "object" && val !== null) {
                      setSaleForm((prev) => ({
                        ...prev,
                        product: (val.name || "").toUpperCase(),
                        product_id: val.id || "",
                        size: val.size || prev.size,
                        unit: val.unit || prev.unit
                      }));
                    } else {
                      setSaleForm((prev) => ({
                        ...prev,
                        product: String(val || "").toUpperCase()
                      }));
                    }
                  }}
                  products={productList}
                  placeholder="e.g. SOLAR PANEL 540W"
                  testid="sale-product-input"
                  required
                />
              </div>

              {/* Size / Spec */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Size / Spec</label>
                <Input
                  value={saleForm.size}
                  onChange={(e) => setSaleForm({ ...saleForm, size: e.target.value })}
                  placeholder="e.g. 540W Mono PERC"
                  className="h-9 text-xs"
                  data-testid="sale-size-input"
                />
              </div>

              {/* Quantity & Unit */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Quantity *</label>
                  <Input
                    type="number"
                    step="any"
                    required
                    value={saleForm.quantity}
                    onChange={(e) => setSaleForm({ ...saleForm, quantity: e.target.value })}
                    placeholder="e.g. 10"
                    className="h-9 text-xs font-bold"
                    data-testid="sale-qty-input"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Unit</label>
                  <Select
                    value={saleForm.unit}
                    onValueChange={(val) => setSaleForm({ ...saleForm, unit: val })}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {getStandardizedUnitOptions(saleForm.unit).map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Remarks */}
              <div className="md:col-span-2 space-y-1">
                <label className="font-semibold text-slate-700">Remarks / Notes</label>
                <Input
                  value={saleForm.remarks}
                  onChange={(e) => setSaleForm({ ...saleForm, remarks: e.target.value })}
                  placeholder="Optional delivery details, transport info..."
                  className="h-9 text-xs"
                  data-testid="sale-remarks-input"
                />
              </div>
            </div>

            <DialogFooter className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setNewSaleOpen(false)}
                className="h-9 px-4 text-xs rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={savingSale}
                className="h-9 px-4 text-xs bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-xs"
                data-testid="save-b2b-sale-btn"
              >
                {savingSale ? "Saving Sale..." : "Save B2B Sale"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
