import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError } from "@/lib/api";
import { useProductList } from "@/hooks/useInventory";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ProductAutocompleteInput, getStandardizedUnitOptions } from "@/components/Inventory/_shared";
import { Truck, Plus, Search, RefreshCw, Eye, Package, Pencil, Trash2, AlertTriangle, BookOpen, MapPin, Phone, Mail, Building2 } from "lucide-react";
import { toast } from "sonner";
import dayjs from "dayjs";

export default function SupplyView({ globalSearch = "", onChanged }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  // Modals state
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Add Supplier State
  const [addSupplierOpen, setAddSupplierOpen] = useState(false);
  const [busyAdd, setBusyAdd] = useState(false);
  const [newSupplier, setNewSupplier] = useState({
    name: "",
    contact_person: "",
    phone: "",
    email: "",
    address: "",
    category: "Modules / Panels",
    products_supplied: "",
    notes: ""
  });

  // Edit Supplier State
  const [editSupplierOpen, setEditSupplierOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [editSupplierForm, setEditSupplierForm] = useState({
    name: "",
    contact_person: "",
    phone: "",
    email: "",
    address: "",
    category: "Modules / Panels",
    products_supplied: "",
    notes: ""
  });
  const [updatingSupplier, setUpdatingSupplier] = useState(false);

  // Delete Supplier State
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [supplierToDelete, setSupplierToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // New Supply Entry State
  const [newSupplyOpen, setNewSupplyOpen] = useState(false);
  const [supplyForm, setSupplyForm] = useState({
    vendor_id: "",
    supplier_name: "",
    bill_number: "",
    date: dayjs().format("YYYY-MM-DD"),
    product: "",
    product_id: "",
    size: "",
    quantity: "",
    unit: "Nos",
    remarks: ""
  });
  const [savingSupply, setSavingSupply] = useState(false);

  // Product List for Supply Entry
  const { data: productList = [] } = useProductList();

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

  // Query Supplier Ledger when selected
  const { data: supplierHistoryData, isLoading: loadingHistory } = useQuery({
    queryKey: ["inventory-supplier-history", selectedSupplier?.id],
    queryFn: async () => {
      if (!selectedSupplier?.id) return null;
      const res = await api.get(`/inventory/supplier-history/${selectedSupplier.id}`);
      return res.data;
    },
    enabled: Boolean(selectedSupplier?.id && ledgerOpen),
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
      (s.products_supplied || []).some((p) => p.toLowerCase().includes(activeSearch))
    );
  }, [suppliers, activeSearch]);

  // Aggregate stats
  const stats = useMemo(() => {
    let totInwards = 0;
    const allProds = new Set();
    suppliers.forEach((s) => {
      totInwards += Number(s.inward_count || 0);
      (s.products_supplied || []).forEach((p) => allProds.add(p));
    });
    return {
      totalSuppliers: suppliers.length,
      totalInwards: totInwards,
      distinctProducts: allProds.size
    };
  }, [suppliers]);

  // Handlers: Supplier Registration
  const handleCreateSupplier = async (e) => {
    e?.preventDefault();
    if (!newSupplier.name.trim()) {
      toast.error("Supplier Name is required!");
      return;
    }

    const existing = suppliers.find(
      (s) => (s.name || "").trim().toLowerCase() === newSupplier.name.trim().toLowerCase()
    );
    if (existing) {
      toast.warning(`A supplier named "${existing.name}" already exists! Reusing existing master record.`);
      setAddSupplierOpen(false);
      setSelectedSupplier(existing);
      setLedgerOpen(true);
      return;
    }

    setBusyAdd(true);
    try {
      await api.post("/vendors", {
        name: newSupplier.name.trim(),
        contact_person: newSupplier.contact_person?.trim() || "",
        phone: newSupplier.phone?.trim() || "",
        email: newSupplier.email?.trim() || "",
        address: newSupplier.address?.trim() || "",
        category: newSupplier.category || "Modules / Panels",
        products_supplied: newSupplier.products_supplied?.trim() || "",
        notes: newSupplier.notes?.trim() || ""
      });
      toast.success("Supplier added successfully!");
      setAddSupplierOpen(false);
      setNewSupplier({
        name: "",
        contact_person: "",
        phone: "",
        email: "",
        address: "",
        category: "Modules / Panels",
        products_supplied: "",
        notes: ""
      });
      queryClient.invalidateQueries({ queryKey: ["inventory-supply-summary"] });
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      onChanged?.();
      refetch();
    } catch (err) {
      toast.error(formatApiError(err, "Failed to create supplier"));
    } finally {
      setBusyAdd(false);
    }
  };

  // Handlers: Edit Supplier
  const handleOpenEditSupplier = (supplier, e) => {
    if (e) e.stopPropagation();
    setEditingSupplier(supplier);
    setEditSupplierForm({
      name: supplier.name || "",
      contact_person: supplier.contact_person || "",
      phone: supplier.phone || "",
      email: supplier.email || "",
      address: supplier.address || "",
      category: supplier.category || "General Supplier",
      products_supplied: Array.isArray(supplier.products_supplied) ? supplier.products_supplied.join(", ") : supplier.products_supplied || "",
      notes: supplier.notes || ""
    });
    setEditSupplierOpen(true);
  };

  const handleUpdateSupplier = async (e) => {
    e.preventDefault();
    if (!editSupplierForm.name?.trim()) {
      toast.error("Supplier Name is required");
      return;
    }
    setUpdatingSupplier(true);
    try {
      await api.put(`/vendors/${editingSupplier.id}`, {
        name: editSupplierForm.name.trim(),
        contact_person: editSupplierForm.contact_person?.trim() || "",
        phone: editSupplierForm.phone?.trim() || "",
        email: editSupplierForm.email?.trim() || "",
        address: editSupplierForm.address?.trim() || "",
        category: editSupplierForm.category || "General Supplier",
        products_supplied: editSupplierForm.products_supplied?.trim() || "",
        notes: editSupplierForm.notes?.trim() || ""
      });
      queryClient.invalidateQueries({ queryKey: ["inventory-supply-summary"] });
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      await refetch();
      setEditSupplierOpen(false);
      toast.success(`Supplier "${editSupplierForm.name}" updated successfully`);
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(formatApiError(err, "Failed to update supplier"));
    } finally {
      setUpdatingSupplier(false);
    }
  };

  // Handlers: Safe Delete Supplier
  const handleOpenDeleteSupplier = (supplier, e) => {
    if (e) e.stopPropagation();
    setSupplierToDelete(supplier);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDeleteSupplier = async () => {
    if (!supplierToDelete) return;
    setIsDeleting(true);
    try {
      const res = await api.delete(`/vendors/${supplierToDelete.id}`);
      queryClient.invalidateQueries({ queryKey: ["inventory-supply-summary"] });
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      await refetch();
      setDeleteDialogOpen(false);
      setSupplierToDelete(null);
      toast.success(res.data?.message || `Supplier "${supplierToDelete.name}" removed`);
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(formatApiError(err, "Failed to delete supplier"));
    } finally {
      setIsDeleting(false);
    }
  };

  // Handlers: New Supply Entry (increases stock via Inward)
  const handleOpenNewSupply = () => {
    setSupplyForm({
      vendor_id: "",
      supplier_name: "",
      bill_number: "",
      date: dayjs().format("YYYY-MM-DD"),
      product: "",
      product_id: "",
      size: "",
      quantity: "",
      unit: "Nos",
      remarks: ""
    });
    setNewSupplyOpen(true);
  };

  const handleSelectSupplierForSupply = (supplierId) => {
    const s = suppliers.find((sup) => sup.id === supplierId);
    if (s) {
      setSupplyForm((prev) => ({
        ...prev,
        vendor_id: s.id,
        supplier_name: s.name
      }));
    }
  };

  const handleCreateSupply = async (e) => {
    e.preventDefault();
    if (!supplyForm.vendor_id || !supplyForm.supplier_name) {
      toast.error("Please select a Supplier");
      return;
    }
    if (!supplyForm.bill_number?.trim()) {
      toast.error("Please enter a Bill Number / Invoice #");
      return;
    }
    if (!supplyForm.product?.trim()) {
      toast.error("Please enter a Product Name");
      return;
    }
    if (!supplyForm.quantity || Number(supplyForm.quantity) <= 0) {
      toast.error("Please enter a valid Quantity greater than 0");
      return;
    }

    setSavingSupply(true);
    try {
      const billNo = supplyForm.bill_number.trim();
      const payload = {
        source_type: "Supplier",
        source_name: supplyForm.supplier_name,
        vendor_id: supplyForm.vendor_id,
        bill_number: billNo,
        reference_number: billNo,
        date: supplyForm.date || dayjs().format("YYYY-MM-DD"),
        product: supplyForm.product.trim().toUpperCase(),
        product_id: supplyForm.product_id || "",
        size: supplyForm.size?.trim() || "",
        quantity: parseFloat(supplyForm.quantity),
        unit: supplyForm.unit || "Nos",
        remarks: supplyForm.remarks?.trim() || "",
        status: "Received"
      };

      await api.post("/inventory/inward", payload);
      queryClient.invalidateQueries({ queryKey: ["inventory-supply-summary"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-supplier-history", supplyForm.vendor_id] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });

      await refetch();
      setNewSupplyOpen(false);
      toast.success(`Supply Bill "${billNo}" from ${supplyForm.supplier_name} received. Stock increased!`);
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(formatApiError(err, "Failed to record supply"));
    } finally {
      setSavingSupply(false);
    }
  };

  const openSupplierLedger = (supplier, e) => {
    if (e) e.stopPropagation();
    setSelectedSupplier(supplier);
    setLedgerOpen(true);
  };

  const openSupplierDetails = (supplier, e) => {
    if (e) e.stopPropagation();
    setSelectedSupplier(supplier);
    setDetailsOpen(true);
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
              Procurement Inward
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Supplier directory & inventory receipts. Record new material shipments to increase warehouse stock and track supplier ledgers.
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
            variant="outline"
            size="sm"
            onClick={() => setAddSupplierOpen(true)}
            className="h-9 px-3.5 text-xs text-slate-700 rounded-xl gap-1.5 shadow-2xs shrink-0 font-medium"
            data-testid="supply-add-supplier-btn"
          >
            <Plus className="w-3.5 h-3.5" /> Add Supplier
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleOpenNewSupply}
            className="h-9 px-3.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-1.5 shadow-2xs shrink-0 font-medium"
            data-testid="new-supply-btn"
          >
            <Truck className="w-3.5 h-3.5" /> New Supply
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
              <span>Total Supplies Inward</span>
              <Package className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums" style={{ fontFamily: "Outfit" }}>
              {stats.totalInwards}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Recorded shipments received</div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-2xs bg-white rounded-xl">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <span>Distinct Products</span>
              <Building2 className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums" style={{ fontFamily: "Outfit" }}>
              {stats.distinctProducts}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Catalog varieties supplied</div>
          </CardContent>
        </Card>
      </div>

      {/* Suppliers Table */}
      <Card className="border-slate-200 shadow-2xs bg-white rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <Truck className="w-4 h-4 text-slate-500" /> Supplier Directory ({filteredSuppliers.length})
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
                <th className="py-3 px-4">Supplier Name</th>
                <th className="py-3 px-4 text-center">Inward Count</th>
                <th className="py-3 px-4 text-center">Last Supply</th>
                <th className="py-3 px-4">Products Supplied</th>
                <th className="py-3 px-4 text-right">Actions</th>
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
                    No suppliers found. Click &ldquo;+ Add Supplier&rdquo; above to register one.
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map((supplier) => (
                  <tr
                    key={supplier.id}
                    className="hover:bg-emerald-50/30 transition-colors group"
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
                    <td className="py-3 px-4 text-right space-x-1 whitespace-nowrap">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => openSupplierDetails(supplier, e)}
                        className="h-7 px-2 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg gap-1"
                        title="View Supplier Details"
                        data-testid={`supply-view-btn-${supplier.id}`}
                      >
                        <Eye className="w-3.5 h-3.5 text-slate-500" /> View
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => handleOpenEditSupplier(supplier, e)}
                        className="h-7 px-2 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg gap-1"
                        title="Edit Supplier"
                        data-testid={`supply-edit-btn-${supplier.id}`}
                      >
                        <Pencil className="w-3.5 h-3.5 text-slate-500" /> Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => handleOpenDeleteSupplier(supplier, e)}
                        className="h-7 px-2 text-xs text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg gap-1"
                        title="Delete Supplier"
                        data-testid={`supply-delete-btn-${supplier.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={(e) => openSupplierLedger(supplier, e)}
                        className="h-7 px-2.5 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50 rounded-lg gap-1 font-medium"
                        title="View Supplier Ledger"
                        data-testid={`supply-ledger-btn-${supplier.id}`}
                      >
                        <BookOpen className="w-3.5 h-3.5" /> Ledger
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add Supplier Modal */}
      <Dialog open={addSupplierOpen} onOpenChange={setAddSupplierOpen}>
        <DialogContent className="max-w-lg p-6 rounded-2xl">
          <form onSubmit={handleCreateSupplier} className="space-y-4">
            <DialogHeader className="pb-3 border-b border-slate-100">
              <DialogTitle className="text-lg font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                Add Supplier / Vendor
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Register a new supplier. Once registered, materials can be received directly into inventory.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
              <div className="md:col-span-2 space-y-1">
                <label className="font-semibold text-slate-700">Supplier / Company Name *</label>
                <Input
                  required
                  value={newSupplier.name}
                  onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
                  placeholder="e.g. WAAREE ENERGIES LTD, HAVELLS"
                  className="h-9 text-xs"
                  data-testid="supplier-input-name"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Contact Person</label>
                <Input
                  value={newSupplier.contact_person}
                  onChange={(e) => setNewSupplier({ ...newSupplier, contact_person: e.target.value })}
                  placeholder="e.g. Rajesh Sharma"
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Phone / Mobile</label>
                <Input
                  value={newSupplier.phone}
                  onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                  placeholder="e.g. 9876543210"
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Email Address</label>
                <Input
                  type="email"
                  value={newSupplier.email}
                  onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })}
                  placeholder="sales@supplier.com"
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Category</label>
                <Select
                  value={newSupplier.category}
                  onValueChange={(val) => setNewSupplier({ ...newSupplier, category: val })}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Modules / Panels">Modules / Panels</SelectItem>
                    <SelectItem value="Inverters">Inverters</SelectItem>
                    <SelectItem value="Batteries">Batteries</SelectItem>
                    <SelectItem value="Electrical Cables">Electrical Cables</SelectItem>
                    <SelectItem value="Structures">Structures</SelectItem>
                    <SelectItem value="General Supplier">General Supplier</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2 space-y-1">
                <label className="font-semibold text-slate-700">Business Address</label>
                <Input
                  value={newSupplier.address}
                  onChange={(e) => setNewSupplier({ ...newSupplier, address: e.target.value })}
                  placeholder="Factory / Warehouse / City"
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <DialogFooter className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAddSupplierOpen(false)}
                className="h-9 px-4 text-xs rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={busyAdd}
                className="h-9 px-4 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs"
                data-testid="save-supplier-btn"
              >
                {busyAdd ? "Saving..." : "Save Supplier"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Supplier Modal */}
      <Dialog open={editSupplierOpen} onOpenChange={setEditSupplierOpen}>
        <DialogContent className="max-w-lg p-6 rounded-2xl">
          <form onSubmit={handleUpdateSupplier} className="space-y-4">
            <DialogHeader className="pb-3 border-b border-slate-100">
              <DialogTitle className="text-lg font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                Edit Supplier
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Update supplier contact and business details.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
              <div className="md:col-span-2 space-y-1">
                <label className="font-semibold text-slate-700">Supplier Name *</label>
                <Input
                  required
                  value={editSupplierForm.name}
                  onChange={(e) => setEditSupplierForm({ ...editSupplierForm, name: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Contact Person</label>
                <Input
                  value={editSupplierForm.contact_person}
                  onChange={(e) => setEditSupplierForm({ ...editSupplierForm, contact_person: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Phone</label>
                <Input
                  value={editSupplierForm.phone}
                  onChange={(e) => setEditSupplierForm({ ...editSupplierForm, phone: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Email Address</label>
                <Input
                  type="email"
                  value={editSupplierForm.email}
                  onChange={(e) => setEditSupplierForm({ ...editSupplierForm, email: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Category</label>
                <Select
                  value={editSupplierForm.category}
                  onValueChange={(val) => setEditSupplierForm({ ...editSupplierForm, category: val })}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Modules / Panels">Modules / Panels</SelectItem>
                    <SelectItem value="Inverters">Inverters</SelectItem>
                    <SelectItem value="Batteries">Batteries</SelectItem>
                    <SelectItem value="Electrical Cables">Electrical Cables</SelectItem>
                    <SelectItem value="Structures">Structures</SelectItem>
                    <SelectItem value="General Supplier">General Supplier</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2 space-y-1">
                <label className="font-semibold text-slate-700">Business Address</label>
                <Input
                  value={editSupplierForm.address}
                  onChange={(e) => setEditSupplierForm({ ...editSupplierForm, address: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <DialogFooter className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditSupplierOpen(false)}
                className="h-9 px-4 text-xs rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={updatingSupplier}
                className="h-9 px-4 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs"
              >
                {updatingSupplier ? "Updating..." : "Update Supplier"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Supplier Details Modal */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-md p-6 rounded-2xl" data-testid="supplier-details-dialog">
          <DialogHeader className="pb-3 border-b border-slate-100">
            <DialogTitle className="text-lg font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
              Supplier Details
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Procurement vendor profile from Supplier Master.
            </DialogDescription>
          </DialogHeader>

          {selectedSupplier && (
            <div className="space-y-3.5 py-2 text-xs">
              <div className="bg-emerald-50/60 p-4 rounded-xl border border-emerald-100">
                <div className="font-bold text-slate-900 text-sm">{selectedSupplier.name}</div>
                <div className="text-[11px] text-emerald-800 font-medium mt-0.5">{selectedSupplier.category || "General Supplier"}</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-slate-400 font-medium">Contact Person</span>
                  <div className="font-medium text-slate-800">{selectedSupplier.contact_person || "—"}</div>
                </div>
                <div className="space-y-1">
                  <span className="text-slate-400 font-medium">Phone</span>
                  <div className="font-medium text-slate-800 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    {selectedSupplier.phone || "—"}
                  </div>
                </div>
                <div className="space-y-1 col-span-2">
                  <span className="text-slate-400 font-medium">Email Address</span>
                  <div className="font-medium text-slate-800 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    {selectedSupplier.email || "—"}
                  </div>
                </div>
                <div className="space-y-1 col-span-2">
                  <span className="text-slate-400 font-medium">Address</span>
                  <div className="font-medium text-slate-800">{selectedSupplier.address || "—"}</div>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-2 gap-2 text-center">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Total Inward Shipments</div>
                  <div className="text-base font-bold text-slate-800">{selectedSupplier.inward_count}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Last Supply</div>
                  <div className="text-sm font-semibold text-slate-700 font-mono mt-0.5">{selectedSupplier.last_supply || "—"}</div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setDetailsOpen(false);
                setLedgerOpen(true);
              }}
              className="h-8 px-3 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50 rounded-xl gap-1.5 font-medium"
            >
              <BookOpen className="w-3.5 h-3.5" /> View Supplier Ledger
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setDetailsOpen(false)}
              className="h-8 px-4 text-xs rounded-xl"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Supplier Confirmation Modal */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md p-6 rounded-2xl" data-testid="delete-supplier-dialog">
          <DialogHeader className="pb-3 border-b border-slate-100">
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2" style={{ fontFamily: "Outfit" }}>
              <Trash2 className="w-5 h-5 text-rose-600" /> Delete Supplier?
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Confirm deletion of this procurement vendor record.
            </DialogDescription>
          </DialogHeader>

          {supplierToDelete && (
            <div className="space-y-3 py-2">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div className="font-bold text-slate-900 text-sm">
                  {supplierToDelete.name}
                </div>
                <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                  {supplierToDelete.category && <span>{supplierToDelete.category}</span>}
                  {supplierToDelete.phone && <span>• {supplierToDelete.phone}</span>}
                </div>
              </div>

              <div className="text-xs">
                {Number(supplierToDelete.inward_count || 0) > 0 ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 space-y-1.5">
                    <div className="font-semibold flex items-center gap-1.5 text-amber-900">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      This supplier has {supplierToDelete.inward_count} historical inward shipment(s).
                    </div>
                    <p className="text-[11px] text-amber-700 leading-relaxed">
                      To preserve warehouse inventory receipts and historical stock integrity, all inward shipment records remain intact in the database. The supplier will be archived and removed from active selection.
                    </p>
                  </div>
                ) : (
                  <p className="text-slate-600 leading-relaxed">
                    This supplier has 0 inward shipments. Deleting will permanently remove this supplier record.
                  </p>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
              className="h-9 px-4 text-xs rounded-xl"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmDeleteSupplier}
              disabled={isDeleting}
              className="h-9 px-4 text-xs bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Supply Entry Modal (Increases Stock via Inward) */}
      <Dialog open={newSupplyOpen} onOpenChange={setNewSupplyOpen}>
        <DialogContent className="max-w-lg p-6 rounded-2xl" data-testid="new-supply-dialog">
          <form onSubmit={handleCreateSupply} className="space-y-4">
            <DialogHeader className="pb-3 border-b border-slate-100">
              <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2" style={{ fontFamily: "Outfit" }}>
                <Truck className="w-5 h-5 text-emerald-600" /> New Supply Entry
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Receive material from a supplier into inventory. Directly increases stock and adds to Supplier Ledger.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
              {/* Select Supplier */}
              <div className="md:col-span-2 space-y-1">
                <label className="font-semibold text-slate-700">Supplier *</label>
                <Select value={supplyForm.vendor_id} onValueChange={handleSelectSupplierForSupply}>
                  <SelectTrigger className="h-9 text-xs" data-testid="supply-vendor-select">
                    <SelectValue placeholder="Select existing supplier..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(suppliers || []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} {s.category ? `(${s.category})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Bill Number */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Bill Number / Invoice # *</label>
                <Input
                  required
                  value={supplyForm.bill_number}
                  onChange={(e) => setSupplyForm({ ...supplyForm, bill_number: e.target.value })}
                  placeholder="e.g. SUP-101, INV-4491"
                  className="h-9 text-xs font-mono font-medium"
                  data-testid="supply-bill-number"
                />
              </div>

              {/* Date */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Date *</label>
                <Input
                  type="date"
                  required
                  value={supplyForm.date}
                  onChange={(e) => setSupplyForm({ ...supplyForm, date: e.target.value })}
                  className="h-9 text-xs"
                  data-testid="supply-date"
                />
              </div>

              {/* Product */}
              <div className="md:col-span-2 space-y-1">
                <label className="font-semibold text-slate-700">Product Name *</label>
                <ProductAutocompleteInput
                  value={supplyForm.product}
                  onChange={(val) => {
                    if (typeof val === "object" && val !== null) {
                      setSupplyForm((prev) => ({
                        ...prev,
                        product: (val.name || "").toUpperCase(),
                        product_id: val.id || "",
                        size: val.size || prev.size,
                        unit: val.unit || prev.unit
                      }));
                    } else {
                      setSupplyForm((prev) => ({
                        ...prev,
                        product: String(val || "").toUpperCase()
                      }));
                    }
                  }}
                  products={productList}
                  placeholder="e.g. SOLAR PANEL 555 WP, DC CABLE"
                  testid="supply-product-input"
                  required
                />
              </div>

              {/* Size / Spec */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Size / Spec</label>
                <Input
                  value={supplyForm.size}
                  onChange={(e) => setSupplyForm({ ...supplyForm, size: e.target.value })}
                  placeholder="e.g. 555 WP, 4C*0.75"
                  className="h-9 text-xs"
                  data-testid="supply-size-input"
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
                    value={supplyForm.quantity}
                    onChange={(e) => setSupplyForm({ ...supplyForm, quantity: e.target.value })}
                    placeholder="e.g. 100"
                    className="h-9 text-xs font-bold"
                    data-testid="supply-qty-input"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Unit</label>
                  <Select
                    value={supplyForm.unit}
                    onValueChange={(val) => setSupplyForm({ ...supplyForm, unit: val })}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {getStandardizedUnitOptions(supplyForm.unit).map((u) => (
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
                  value={supplyForm.remarks}
                  onChange={(e) => setSupplyForm({ ...supplyForm, remarks: e.target.value })}
                  placeholder="Optional delivery details, batch #, challan info..."
                  className="h-9 text-xs"
                  data-testid="supply-remarks-input"
                />
              </div>
            </div>

            <DialogFooter className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setNewSupplyOpen(false)}
                className="h-9 px-4 text-xs rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={savingSupply}
                className="h-9 px-4 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs"
                data-testid="save-supply-btn"
              >
                {savingSupply ? "Saving Supply..." : "Save Supply (Inward)"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Supplier Ledger Modal */}
      <Dialog open={ledgerOpen} onOpenChange={setLedgerOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-6 rounded-2xl" data-testid="supplier-ledger-dialog">
          <DialogHeader className="pb-3 border-b border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2" style={{ fontFamily: "Outfit" }}>
                  <BookOpen className="w-5 h-5 text-emerald-600" /> Supplier Ledger: {selectedSupplier?.name}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  {selectedSupplier?.contact_person ? `Contact: ${selectedSupplier.contact_person} • ` : ""}
                  {selectedSupplier?.phone ? `Phone: ${selectedSupplier.phone} • ` : ""}
                  Authoritative receipt ledger from inward supply shipments.
                </DialogDescription>
              </div>
              <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                {selectedSupplier?.inward_count || supplies.length} Total Shipments
              </Badge>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-3">
            {loadingHistory ? (
              <div className="py-16 text-center text-slate-400 text-xs">Loading supplier ledger...</div>
            ) : supplies.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-xs">
                No inward supply records found for this supplier yet.
              </div>
            ) : (
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Bill No</th>
                    <th className="py-2.5 px-3">Product Name</th>
                    <th className="py-2.5 px-3">Size / Spec</th>
                    <th className="py-2.5 px-3 text-right">Quantity</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {supplies.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3 font-mono text-slate-600">{item.date}</td>
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-900">
                        {item.bill_number || item.reference_number || "—"}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-900">{item.product}</td>
                      <td className="py-2.5 px-3 text-slate-600">{item.size || "—"}</td>
                      <td className="py-2.5 px-3 text-right font-bold tabular-nums text-emerald-700">
                        +{item.quantity} {item.unit}
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium tabular-nums text-slate-700">
                        {item.amount ? `₹${Number(item.amount).toLocaleString("en-IN")}` : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 font-medium">
                        <Badge className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold">
                          {item.status || "Received"}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 max-w-xs truncate">{item.remarks || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <DialogFooter className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Total Inward Shipments: <strong className="text-slate-800 font-semibold">{supplies.length}</strong>
            </span>
            <Button variant="outline" size="sm" onClick={() => setLedgerOpen(false)} className="rounded-xl text-xs">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
