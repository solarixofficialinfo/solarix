import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Truck, Plus, Search, RefreshCw, Eye, Package, Boxes, Layers, Phone, Mail } from "lucide-react";
import { toast } from "sonner";

export default function SupplyView({ globalSearch = "", onChanged }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [addSupplierOpen, setAddSupplierOpen] = useState(false);
  const [busyAdd, setBusyAdd] = useState(false);

  const [newSupplier, setNewSupplier] = useState({
    name: "",
    contact_person: "",
    phone: "",
    email: "",
    category: "Modules / Panels",
    products_supplied: ""
  });

  // Query Supply Summary
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["inventory-supply-summary"],
    queryFn: async () => {
      const res = await api.get("/inventory/supply-summary");
      return res.data?.suppliers || [];
    },
    staleTime: 1000 * 30,
  });

  const rawSuppliers = data;
  const suppliers = useMemo(() => (Array.isArray(rawSuppliers) ? rawSuppliers : []), [rawSuppliers]);

  // Query Supplier Inward History when supplier selected
  const { data: supplierHistoryData, isLoading: loadingHistory } = useQuery({
    queryKey: ["inventory-supplier-history", selectedSupplier?.id],
    queryFn: async () => {
      if (!selectedSupplier?.id) return null;
      const res = await api.get(`/inventory/supplier-history/${selectedSupplier.id}`);
      return res.data;
    },
    enabled: Boolean(selectedSupplier?.id && historyOpen),
  });

  const supplies = supplierHistoryData?.supplies || [];

  // Filtered suppliers
  const activeSearch = (search || globalSearch || "").trim().toLowerCase();
  const filteredSuppliers = useMemo(() => {
    if (!activeSearch) return suppliers;
    return suppliers.filter((s) =>
      (s.name || "").toLowerCase().includes(activeSearch) ||
      (s.contact_person || "").toLowerCase().includes(activeSearch) ||
      (s.phone || "").toLowerCase().includes(activeSearch) ||
      (s.email || "").toLowerCase().includes(activeSearch) ||
      (s.category || "").toLowerCase().includes(activeSearch) ||
      (s.products_supplied || []).some(p => p.toLowerCase().includes(activeSearch))
    );
  }, [suppliers, activeSearch]);

  // Aggregate stats
  const stats = useMemo(() => {
    let totInwards = 0;
    const allProds = new Set();
    suppliers.forEach((s) => {
      totInwards += Number(s.inward_count || 0);
      (s.products_supplied || []).forEach(p => allProds.add(p));
    });
    return {
      totalSuppliers: suppliers.length,
      totalInwards: totInwards,
      distinctProducts: allProds.size
    };
  }, [suppliers]);

  // Handle Add Supplier
  const handleCreateSupplier = async (e) => {
    e?.preventDefault();
    if (!newSupplier.name.trim()) {
      toast.error("Supplier Name is required!");
      return;
    }

    // Check if supplier already exists
    const existing = suppliers.find(
      (s) => (s.name || "").trim().toLowerCase() === newSupplier.name.trim().toLowerCase()
    );
    if (existing) {
      toast.warning(`A supplier named "${existing.name}" already exists! Reusing existing master record.`);
      setAddSupplierOpen(false);
      setSelectedSupplier(existing);
      setHistoryOpen(true);
      return;
    }

    setBusyAdd(true);
    try {
      await api.post("/vendors", {
        name: newSupplier.name.trim(),
        contact_person: newSupplier.contact_person.trim(),
        phone: newSupplier.phone.trim(),
        email: newSupplier.email.trim(),
        category: newSupplier.category.trim(),
        products_supplied: newSupplier.products_supplied.trim()
      });
      toast.success("Supplier added successfully!");
      setAddSupplierOpen(false);
      setNewSupplier({ name: "", contact_person: "", phone: "", email: "", category: "Modules / Panels", products_supplied: "" });
      queryClient.invalidateQueries({ queryKey: ["inventory-supply-summary"] });
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      onChanged?.();
      refetch();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusyAdd(false);
    }
  };

  const openSupplierHistory = (supplier) => {
    setSelectedSupplier(supplier);
    setHistoryOpen(true);
  };

  return (
    <div className="space-y-5" data-testid="supply-view">
      {/* Top Banner & Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
              Supply & Vendor Master
            </h2>
            <Badge variant="outline" className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border-emerald-200">
              Procurement Inwards
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage procurement suppliers, receipt transaction counts, and supplier product catalogs derived from inward records.
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search supplier or product..."
              className="pl-8 h-9 text-xs bg-slate-50/70 border-slate-200 rounded-xl"
              data-testid="supply-search-input"
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
            onClick={() => setAddSupplierOpen(true)}
            className="h-9 px-3.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-1.5 shadow-2xs shrink-0"
            data-testid="supply-add-supplier-btn"
          >
            <Plus className="w-3.5 h-3.5" /> + Add Supplier
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border-slate-200 shadow-2xs bg-white rounded-xl">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <span>Active Suppliers</span>
              <Truck className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums" style={{ fontFamily: "Outfit" }}>
              {stats.totalSuppliers}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Procurement vendors</div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-2xs bg-white rounded-xl">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <span>Supply Transactions</span>
              <Package className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-blue-700 mt-1 tabular-nums" style={{ fontFamily: "Outfit" }}>
              {stats.totalInwards}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Inward shipments received</div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-2xs bg-white rounded-xl">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <span>Catalog Products</span>
              <Boxes className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="text-2xl font-bold text-indigo-700 mt-1 tabular-nums" style={{ fontFamily: "Outfit" }}>
              {stats.distinctProducts}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Distinct items supplied</div>
          </CardContent>
        </Card>
      </div>

      {/* Suppliers Table */}
      <Card className="border-slate-200 shadow-2xs bg-white rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Truck className="w-4 h-4 text-slate-500" /> Supplier Directory ({filteredSuppliers.length})
          </h3>
          <span className="text-[11px] text-slate-400">Click any supplier row to inspect inward shipment log</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Supplier Name</th>
                <th className="py-3 px-4 text-center">Inward Count</th>
                <th className="py-3 px-4 text-center">Last Supply</th>
                <th className="py-3 px-4">Products Supplied</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    Loading suppliers data...
                  </td>
                </tr>
              ) : filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    No suppliers found. Click "+ Add Supplier" to register one.
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map((supplier) => (
                  <tr
                    key={supplier.id}
                    onClick={() => openSupplierHistory(supplier)}
                    className="hover:bg-emerald-50/40 cursor-pointer transition-colors group"
                    data-testid={`supply-row-${supplier.id}`}
                  >
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900 group-hover:text-emerald-700 transition-colors">
                        {supplier.name}
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-2">
                        {supplier.category && <span className="text-slate-500">{supplier.category}</span>}
                        {supplier.phone && <span>• {supplier.phone}</span>}
                        {supplier.email && <span>• {supplier.email}</span>}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center tabular-nums">
                      <Badge variant="outline" className="text-[10px] font-mono bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold">
                        {supplier.inward_count} Inwards
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-slate-600 text-[11px]">
                      {supplier.last_supply}
                    </td>
                    <td className="py-3 px-4">
                      {supplier.products_supplied && supplier.products_supplied.length > 0 ? (
                        <div className="flex flex-wrap gap-1 max-w-md">
                          {supplier.products_supplied.slice(0, 3).map((p, idx) => (
                            <Badge key={idx} variant="secondary" className="text-[10px] py-0 px-1.5 font-normal text-slate-700 bg-slate-100">
                              {p}
                            </Badge>
                          ))}
                          {supplier.products_supplied.length > 3 && (
                            <span className="text-[10px] text-slate-400 self-center">
                              +{supplier.products_supplied.length - 3} more
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">No shipments yet</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openSupplierHistory(supplier);
                        }}
                        className="h-7 px-2.5 text-xs text-emerald-700 hover:text-emerald-900 hover:bg-emerald-100/60 rounded-lg gap-1"
                        data-testid={`supply-view-history-${supplier.id}`}
                      >
                        <Eye className="w-3.5 h-3.5" /> Shipments
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Supplier Inward History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-6 rounded-2xl">
          <DialogHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-lg font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                  {selectedSupplier?.name} · Inward Shipments
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  {selectedSupplier?.contact_person ? `Contact: ${selectedSupplier.contact_person} · ` : ""}
                  {selectedSupplier?.phone ? `Phone: ${selectedSupplier.phone} · ` : ""}
                  {selectedSupplier?.email ? `Email: ${selectedSupplier.email}` : ""}
                </DialogDescription>
              </div>
              <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                {selectedSupplier?.inward_count} Total Inward Records
              </Badge>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-3">
            {loadingHistory ? (
              <div className="py-16 text-center text-slate-400 text-xs">Loading shipment history...</div>
            ) : supplies.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-xs">
                No inward stock shipments recorded from this supplier yet.
              </div>
            ) : (
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Product Name</th>
                    <th className="py-2.5 px-3">Size / Spec</th>
                    <th className="py-2.5 px-3 text-right">Quantity</th>
                    <th className="py-2.5 px-3">Challan No.</th>
                    <th className="py-2.5 px-3">Bill No.</th>
                    <th className="py-2.5 px-3">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {supplies.map((inw) => (
                    <tr key={inw.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3 font-mono text-slate-600">{(inw.date || inw.created_at || "").slice(0, 10)}</td>
                      <td className="py-2.5 px-3 font-medium text-slate-900">{inw.product}</td>
                      <td className="py-2.5 px-3 text-slate-600">{inw.size || "—"}</td>
                      <td className="py-2.5 px-3 text-right font-bold tabular-nums text-emerald-800">
                        {inw.quantity} {inw.unit || "Nos"}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">{inw.reference_number || inw.challan_no || "—"}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">{inw.bill_number || "—"}</td>
                      <td className="py-2.5 px-3 text-slate-500 max-w-xs truncate">{inw.remarks || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <DialogFooter className="pt-3 border-t border-slate-100">
            <Button variant="outline" size="sm" onClick={() => setHistoryOpen(false)} className="rounded-xl text-xs">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Supplier Dialog */}
      <Dialog open={addSupplierOpen} onOpenChange={setAddSupplierOpen}>
        <DialogContent className="max-w-md p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
              Add Supplier
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Register a procurement supplier or vendor in the master catalog.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSupplier} className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold text-slate-700">Supplier / Company Name *</Label>
              <Input
                value={newSupplier.name}
                onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
                placeholder="e.g. Waaree Energies Ltd."
                className="mt-1 h-9 text-xs rounded-xl"
                required
                data-testid="add-supplier-name"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">Contact Person</Label>
              <Input
                value={newSupplier.contact_person}
                onChange={(e) => setNewSupplier({ ...newSupplier, contact_person: e.target.value })}
                placeholder="e.g. Rajesh Sharma"
                className="mt-1 h-9 text-xs rounded-xl"
                data-testid="add-supplier-contact"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-slate-700">Phone</Label>
                <Input
                  value={newSupplier.phone}
                  onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                  placeholder="e.g. 9876543210"
                  className="mt-1 h-9 text-xs rounded-xl"
                  data-testid="add-supplier-phone"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-700">Email</Label>
                <Input
                  value={newSupplier.email}
                  onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })}
                  placeholder="e.g. sales@vendor.com"
                  className="mt-1 h-9 text-xs rounded-xl"
                  data-testid="add-supplier-email"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">Category</Label>
              <Input
                value={newSupplier.category}
                onChange={(e) => setNewSupplier({ ...newSupplier, category: e.target.value })}
                placeholder="e.g. Modules / Inverters / Structure"
                className="mt-1 h-9 text-xs rounded-xl"
                data-testid="add-supplier-category"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAddSupplierOpen(false)}
                className="rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={busyAdd}
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold"
                data-testid="save-new-supplier-btn"
              >
                {busyAdd ? "Saving..." : "Save Supplier"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
