import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { useProductList } from "@/hooks/useInventory";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ProductAutocompleteInput, getStandardizedUnitOptions } from "@/components/Inventory/_shared";
import {
  Truck,
  PackageCheck,
  BookOpen,
  Plus,
  Search,
  RefreshCw,
  Eye,
  Pencil,
  Trash2,
  AlertTriangle,
  Phone,
  Mail,
  MapPin,
  Calendar,
  CheckCircle2,
  ArrowDownToLine,
  Layers,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import dayjs from "dayjs";

export default function Supply() {
  const queryClient = useQueryClient();
  const location = useLocation();

  // Tab: "suppliers" | "entries" | "ledger"
  const [tab, setTab] = useState("suppliers");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const qTab = new URLSearchParams(location.search).get("tab");
    if (qTab && ["suppliers", "entries", "ledger"].includes(qTab)) {
      setTab(qTab);
    }
  }, [location.search]);

  // Modals state
  const [addSupplierOpen, setAddSupplierOpen] = useState(false);
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [supplierForm, setSupplierForm] = useState({
    name: "",
    contact_person: "",
    phone: "",
    email: "",
    gstin: "",
    category: "Modules / Panels",
    address: "",
    products_supplied: "",
    notes: "",
  });

  const [editSupplierOpen, setEditSupplierOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [updatingSupplier, setUpdatingSupplier] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [supplierToDelete, setSupplierToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // New Supply Entry Modal State
  const [newSupplyOpen, setNewSupplyOpen] = useState(false);
  const [savingSupply, setSavingSupply] = useState(false);
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
    remarks: "",
  });

  // Selected supplier for Ledger
  const [selectedLedgerSupplierId, setSelectedLedgerSupplierId] = useState("");

  const { data: productList = [] } = useProductList();

  // 1. Fetch Suppliers Summary (from /inventory/supply-summary)
  const {
    data: supplySummaryData,
    isLoading: loadingSuppliers,
    refetch: refetchSuppliers,
    isFetching: fetchingSuppliers,
  } = useQuery({
    queryKey: ["inventory-supply-summary"],
    queryFn: async () => {
      const res = await api.get("/inventory/supply-summary");
      return res.data?.suppliers || [];
    },
    staleTime: 1000 * 30,
  });
  const suppliers = useMemo(() => (Array.isArray(supplySummaryData) ? supplySummaryData : []), [supplySummaryData]);

  // 2. Fetch Supplier Ledger for Selected Supplier
  const {
    data: supplierHistoryData,
    isLoading: loadingLedger,
    refetch: refetchLedger,
  } = useQuery({
    queryKey: ["inventory-supplier-history", selectedLedgerSupplierId],
    queryFn: async () => {
      if (!selectedLedgerSupplierId) return null;
      const res = await api.get(`/inventory/supplier-history/${selectedLedgerSupplierId}`);
      return res.data;
    },
    enabled: Boolean(selectedLedgerSupplierId),
  });
  const supplies = supplierHistoryData?.supplies || [];
  const currentLedgerVendor = supplierHistoryData?.vendor || suppliers.find((s) => s.id === selectedLedgerSupplierId);

  // 3. Fetch All Inward Supply Entries (from /inventory/history with source_type=Supplier)
  const {
    data: allInwardsData,
    isLoading: loadingEntries,
    refetch: refetchEntries,
  } = useQuery({
    queryKey: ["inventory-supply-entries"],
    queryFn: async () => {
      const res = await api.get("/inventory/history", {
        params: { type: "Inward", source_type: "Supplier", page_size: 1000 },
      });
      return res.data?.items || [];
    },
    staleTime: 1000 * 30,
  });
  const supplyEntries = useMemo(() => (Array.isArray(allInwardsData) ? allInwardsData : []), [allInwardsData]);

  // Auto-select first supplier for ledger
  useEffect(() => {
    if (!selectedLedgerSupplierId && suppliers.length > 0) {
      setSelectedLedgerSupplierId(suppliers[0].id);
    }
  }, [selectedLedgerSupplierId, suppliers]);

  // Filtered lists
  const activeSearch = (search || "").trim().toLowerCase();

  const filteredSuppliers = useMemo(() => {
    if (!activeSearch) return suppliers;
    return suppliers.filter((s) =>
      (s.name || "").toLowerCase().includes(activeSearch) ||
      (s.contact_person || "").toLowerCase().includes(activeSearch) ||
      (s.phone || "").toLowerCase().includes(activeSearch) ||
      (s.category || "").toLowerCase().includes(activeSearch)
    );
  }, [suppliers, activeSearch]);

  const filteredEntries = useMemo(() => {
    if (!activeSearch) return supplyEntries;
    return supplyEntries.filter((e) =>
      (e.source_name || "").toLowerCase().includes(activeSearch) ||
      (e.bill_number || e.reference_number || "").toLowerCase().includes(activeSearch) ||
      (e.product || "").toLowerCase().includes(activeSearch) ||
      (e.size || "").toLowerCase().includes(activeSearch) ||
      (e.date || "").includes(activeSearch)
    );
  }, [supplyEntries, activeSearch]);

  // High-level stats
  const stats = useMemo(() => {
    let totQty = 0;
    supplyEntries.forEach((e) => {
      totQty += Number(e.quantity || 0);
    });
    return {
      totalSuppliers: suppliers.length,
      totalEntries: supplyEntries.length,
      totalReceivedQty: Math.round(totQty * 100) / 100,
    };
  }, [suppliers, supplyEntries]);

  // Handlers
  const handleOpenAddSupplier = () => {
    setSupplierForm({
      name: "",
      contact_person: "",
      phone: "",
      email: "",
      gstin: "",
      category: "Modules / Panels",
      address: "",
      products_supplied: "",
      notes: "",
    });
    setAddSupplierOpen(true);
  };

  const handleCreateSupplier = async (e) => {
    e.preventDefault();
    if (!supplierForm.name?.trim()) {
      toast.error("Please enter Supplier Name");
      return;
    }
    setSavingSupplier(true);
    try {
      await api.post("/vendors", {
        name: supplierForm.name.trim(),
        contact_person: supplierForm.contact_person?.trim() || "",
        phone: supplierForm.phone?.trim() || "",
        email: supplierForm.email?.trim() || "",
        gstin: supplierForm.gstin?.trim() || "",
        category: supplierForm.category || "General Supplier",
        address: supplierForm.address?.trim() || "",
        products_supplied: supplierForm.products_supplied?.trim() || "",
        notes: supplierForm.notes?.trim() || "",
      });
      queryClient.invalidateQueries({ queryKey: ["inventory-supply-summary"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-vendors"] });
      await refetchSuppliers();
      setAddSupplierOpen(false);
      toast.success(`Supplier "${supplierForm.name}" created successfully`);
    } catch (err) {
      toast.error(formatApiError(err, "Failed to create supplier"));
    } finally {
      setSavingSupplier(false);
    }
  };

  const handleOpenEditSupplier = (supp, e) => {
    if (e) e.stopPropagation();
    setEditingSupplier(supp);
    setSupplierForm({
      name: supp.name || "",
      contact_person: supp.contact_person === "—" ? "" : supp.contact_person || "",
      phone: supp.phone === "—" ? "" : supp.phone || "",
      email: supp.email === "—" ? "" : supp.email || "",
      gstin: supp.gstin === "—" ? "" : supp.gstin || "",
      category: supp.category || "General Supplier",
      address: supp.address || "",
      products_supplied: supp.products_supplied || "",
      notes: supp.notes || "",
    });
    setEditSupplierOpen(true);
  };

  const handleUpdateSupplier = async (e) => {
    e.preventDefault();
    if (!supplierForm.name?.trim()) {
      toast.error("Please enter Supplier Name");
      return;
    }
    setUpdatingSupplier(true);
    try {
      await api.put(`/vendors/${editingSupplier.id}`, {
        name: supplierForm.name.trim(),
        contact_person: supplierForm.contact_person?.trim() || "",
        phone: supplierForm.phone?.trim() || "",
        email: supplierForm.email?.trim() || "",
        gstin: supplierForm.gstin?.trim() || "",
        category: supplierForm.category || "General Supplier",
        address: supplierForm.address?.trim() || "",
        products_supplied: supplierForm.products_supplied?.trim() || "",
        notes: supplierForm.notes?.trim() || "",
      });
      queryClient.invalidateQueries({ queryKey: ["inventory-supply-summary"] });
      await refetchSuppliers();
      setEditSupplierOpen(false);
      toast.success(`Supplier "${supplierForm.name}" updated successfully`);
    } catch (err) {
      toast.error(formatApiError(err, "Failed to update supplier"));
    } finally {
      setUpdatingSupplier(false);
    }
  };

  const handleOpenDeleteSupplier = (supp, e) => {
    if (e) e.stopPropagation();
    setSupplierToDelete(supp);
    setDeleteDialogOpen(true);
  };

  const handleDeleteSupplier = async () => {
    if (!supplierToDelete) return;
    setIsDeleting(true);
    try {
      const res = await api.delete(`/vendors/${supplierToDelete.id}`);
      queryClient.invalidateQueries({ queryKey: ["inventory-supply-summary"] });
      await refetchSuppliers();
      setDeleteDialogOpen(false);
      if (res.data?.archived) {
        toast.info(`Supplier "${supplierToDelete.name}" has transactions and was safely archived.`);
      } else {
        toast.success(`Supplier "${supplierToDelete.name}" deleted.`);
      }
    } catch (err) {
      toast.error(formatApiError(err, "Failed to delete supplier"));
    } finally {
      setIsDeleting(false);
    }
  };

  // Open New Supply Modal
  const handleOpenNewSupply = () => {
    const defaultSupp = suppliers.length > 0 ? suppliers[0] : null;
    setSupplyForm({
      vendor_id: defaultSupp?.id || "",
      supplier_name: defaultSupp?.name || "",
      bill_number: "",
      date: dayjs().format("YYYY-MM-DD"),
      product: "",
      product_id: "",
      size: "",
      quantity: "",
      unit: "Nos",
      remarks: "",
    });
    setNewSupplyOpen(true);
  };

  const handleSelectSupplierForSupply = (suppId) => {
    const selected = suppliers.find((s) => s.id === suppId);
    if (selected) {
      setSupplyForm((prev) => ({
        ...prev,
        vendor_id: selected.id,
        supplier_name: selected.name,
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
      toast.error("Please enter Bill / Challan No.");
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
      // Uses existing Inward transaction engine without duplicate engines
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
        status: "Received",
      };

      await api.post("/inventory/inward", payload);

      queryClient.invalidateQueries({ queryKey: ["inventory-supply-summary"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-supply-entries"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-supplier-history", supplyForm.vendor_id] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });

      await refetchSuppliers();
      await refetchEntries();
      setNewSupplyOpen(false);
      toast.success(`Supply Bill "${billNo}" from ${supplyForm.supplier_name} recorded! Stock increased.`);
    } catch (err) {
      toast.error(formatApiError(err, "Failed to record supply receipt"));
    } finally {
      setSavingSupply(false);
    }
  };

  const openSupplierLedger = (supp, e) => {
    if (e) e.stopPropagation();
    setSelectedLedgerSupplierId(supp.id);
    setTab("ledger");
  };

  return (
    <div className="space-y-6" data-testid="supply-page-container">
      {/* Page Header */}
      <PageHeader
        title="Supply Management"
        subtitle="Supplier procurement, purchase deliveries & inventory inward."
        actions={
          <div className="flex items-center gap-2.5">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search supplier, phone, bill no..."
                className="pl-9 h-9 text-xs bg-white border-slate-200"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="supply-search-input"
              />
            </div>
            {tab === "suppliers" ? (
              <Button
                onClick={handleOpenAddSupplier}
                data-testid="supply-btn-add-supplier"
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9 shadow-xs gap-1.5 shrink-0"
              >
                <Plus className="w-4 h-4" /> Add Supplier
              </Button>
            ) : tab === "entries" ? (
              <Button
                onClick={handleOpenNewSupply}
                data-testid="supply-btn-new-supply"
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9 shadow-xs gap-1.5 shrink-0"
              >
                <Plus className="w-4 h-4" /> New Supply
              </Button>
            ) : null}
          </div>
        }
      />

      {/* High-Level Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3.5" data-testid="supply-stats-grid">
        <Card className="border-slate-200 shadow-2xs bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Active Suppliers</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{stats.totalSuppliers}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Vendors & manufacturers</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Truck className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-2xs bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Supply Receipts</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{stats.totalEntries}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Inward deliveries recorded</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <PackageCheck className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-2xs bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Received Qty</p>
              <h3 className="text-2xl font-bold text-blue-600 mt-1">{stats.totalReceivedQty.toLocaleString()}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Units inwarded into inventory</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <ArrowDownToLine className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tab Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="inline-flex items-center p-1 bg-slate-100 rounded-xl">
          <button
            type="button"
            onClick={() => setTab("suppliers")}
            data-testid="supply-tab-suppliers"
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              tab === "suppliers"
                ? "bg-white text-blue-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            <span>Suppliers</span>
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 h-4 bg-slate-200/60 text-slate-700">
              {suppliers.length}
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => setTab("entries")}
            data-testid="supply-tab-entries"
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              tab === "entries"
                ? "bg-white text-blue-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <PackageCheck className="w-3.5 h-3.5" />
            <span>Supply Entries</span>
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 h-4 bg-slate-200/60 text-slate-700">
              {supplyEntries.length}
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => setTab("ledger")}
            data-testid="supply-tab-ledger"
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              tab === "ledger"
                ? "bg-white text-blue-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Supplier Ledger</span>
          </button>
        </div>

        <div className="text-[11px] text-slate-500 pr-3 hidden sm:flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
          <span>Procurement entries directly increase warehouse stock</span>
        </div>
      </div>

      {/* ============================================================== */}
      {/* TAB 1: SUPPLIERS MASTER                                       */}
      {/* ============================================================== */}
      {tab === "suppliers" && (
        <Card className="border-slate-200 shadow-2xs bg-white overflow-hidden" data-testid="supply-suppliers-panel">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-slate-900 text-sm">Suppliers & Vendors Master</h4>
              <p className="text-xs text-slate-500 mt-0.5">Manage manufacturers, suppliers and distributor contacts.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchSuppliers()}
              className="text-xs h-8 gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${fetchingSuppliers ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Supplier Name</th>
                  <th className="py-3 px-3">Category</th>
                  <th className="py-3 px-3">Contact Person & Phone</th>
                  <th className="py-3 px-3">Email</th>
                  <th className="py-3 px-3 text-center">Inward Bills</th>
                  <th className="py-3 px-3 text-center">Last Supply</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadingSuppliers ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      Loading Suppliers...
                    </td>
                  </tr>
                ) : filteredSuppliers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center">
                      <div className="max-w-xs mx-auto space-y-2">
                        <Truck className="w-9 h-9 text-slate-300 mx-auto" />
                        <p className="font-medium text-slate-700">No Suppliers found</p>
                        <p className="text-xs text-slate-400">
                          {activeSearch
                            ? "Try adjusting your search query"
                            : "Add a supplier to record purchase receipts."}
                        </p>
                        {!activeSearch && (
                          <Button onClick={handleOpenAddSupplier} size="sm" className="mt-2 text-xs bg-blue-600 hover:bg-blue-700">
                            + Add Supplier
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredSuppliers.map((s) => (
                    <tr
                      key={s.id}
                      className="hover:bg-blue-50/30 transition-colors cursor-pointer group"
                      onClick={(e) => openSupplierLedger(s, e)}
                      data-testid={`supplier-row-${s.id}`}
                    >
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 font-bold text-xs">
                            {(s.name || "S")[0].toUpperCase()}
                          </div>
                          <span>{s.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <Badge variant="outline" className="bg-slate-50 text-slate-700 text-[10px]">
                          {s.category || "Supplier"}
                        </Badge>
                      </td>
                      <td className="py-3 px-3">
                        <div className="text-slate-800 font-medium">{s.contact_person || "—"}</div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" /> {s.phone || "—"}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                        {s.email || "—"}
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-blue-700">
                        {s.inward_count || 0}
                      </td>
                      <td className="py-3 px-3 text-center text-slate-500 text-[11px] whitespace-nowrap">
                        {s.last_supply || "—"}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            onClick={(e) => openSupplierLedger(s, e)}
                            title="View Supplier Ledger"
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                            onClick={(e) => handleOpenEditSupplier(s, e)}
                            title="Edit Supplier"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={(e) => handleOpenDeleteSupplier(s, e)}
                            title="Delete Supplier"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ============================================================== */}
      {/* TAB 2: SUPPLY ENTRIES (INWARDS)                               */}
      {/* ============================================================== */}
      {tab === "entries" && (
        <Card className="border-slate-200 shadow-2xs bg-white overflow-hidden" data-testid="supply-entries-panel">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-slate-900 text-sm">Purchase Supply Entries</h4>
              <p className="text-xs text-slate-500 mt-0.5">Authoritative inward receipts from suppliers into inventory.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchEntries()}
              className="text-xs h-8 gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-3">Bill / Challan No.</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4">Product</th>
                  <th className="py-3 px-3">Size / Spec</th>
                  <th className="py-3 px-3 text-right">Quantity</th>
                  <th className="py-3 px-3 text-center">Unit</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-4">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadingEntries ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      Loading Supply receipts...
                    </td>
                  </tr>
                ) : filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center">
                      <div className="max-w-xs mx-auto space-y-2">
                        <PackageCheck className="w-9 h-9 text-slate-300 mx-auto" />
                        <p className="font-medium text-slate-700">No Supply receipts recorded</p>
                        <p className="text-xs text-slate-400">
                          {activeSearch
                            ? "No receipts match your search"
                            : "Click '+ New Supply' to record goods received from a supplier."}
                        </p>
                        {!activeSearch && (
                          <Button onClick={handleOpenNewSupply} size="sm" className="mt-2 text-xs bg-blue-600 hover:bg-blue-700">
                            + New Supply
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredEntries.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                        {e.date || "—"}
                      </td>
                      <td className="py-3 px-3 font-mono font-semibold text-blue-700">
                        {e.bill_number || e.reference_number || "—"}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <Truck className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span>{e.source_name || "—"}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800">
                        {e.product || "—"}
                      </td>
                      <td className="py-3 px-3 text-slate-600">
                        {e.size || "—"}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-emerald-700">
                        +{Number(e.quantity || 0).toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-center text-slate-500 font-mono text-[11px]">
                        {e.unit || "Nos"}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-semibold">
                          {e.status || "Received"}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-slate-500 text-[11px] truncate max-w-[200px]">
                        {e.remarks || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ============================================================== */}
      {/* TAB 3: SUPPLIER LEDGER                                        */}
      {/* ============================================================== */}
      {tab === "ledger" && (
        <div className="space-y-4" data-testid="supply-ledger-panel">
          {/* Supplier Selector Banner */}
          <Card className="border-slate-200 shadow-2xs bg-white p-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block">
                  Select Supplier
                </label>
                <div className="w-full sm:w-80">
                  <Select
                    value={selectedLedgerSupplierId}
                    onValueChange={setSelectedLedgerSupplierId}
                    data-testid="supplier-ledger-select"
                  >
                    <SelectTrigger className="h-9 text-xs bg-slate-50 border-slate-200">
                      <SelectValue placeholder="Choose a Supplier..." />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id} className="text-xs">
                          {s.name} ({s.category || "Supplier"})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {currentLedgerVendor && (
                <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200/60 text-xs">
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Contact</span>
                    <span className="font-semibold text-slate-800">{currentLedgerVendor.contact_person || "—"}</span>
                  </div>
                  <div className="h-6 w-px bg-slate-200" />
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Phone</span>
                    <span className="font-semibold text-slate-800">{currentLedgerVendor.phone || "—"}</span>
                  </div>
                  <div className="h-6 w-px bg-slate-200" />
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Category</span>
                    <span className="font-medium text-slate-700">{currentLedgerVendor.category || "General"}</span>
                  </div>
                  <div className="h-6 w-px bg-slate-200" />
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Total Inward Bills</span>
                    <span className="font-bold text-blue-700 text-sm">
                      {supplies.length}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Supplier History Table */}
          <Card className="border-slate-200 shadow-2xs bg-white overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-slate-900 text-sm">
                  Procurement History: {currentLedgerVendor ? currentLedgerVendor.name : "Supplier"}
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">Authoritative inward supply transactions recorded in inventory.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchLedger()}
                disabled={!selectedLedgerSupplierId}
                className="text-xs h-8 gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingLedger ? "animate-spin" : ""}`} /> Refresh
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-3">Bill / Ref No.</th>
                    <th className="py-3 px-4">Product Name</th>
                    <th className="py-3 px-3">Size / Spec</th>
                    <th className="py-3 px-3 text-right">Quantity Received</th>
                    <th className="py-3 px-3 text-center">Unit</th>
                    <th className="py-3 px-3 text-center">Status</th>
                    <th className="py-3 px-4">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingLedger ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        Loading supplier ledger...
                      </td>
                    </tr>
                  ) : supplies.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        No supply receipts recorded for this vendor yet.
                      </td>
                    </tr>
                  ) : (
                    supplies.map((s) => (
                      <tr key={s.id || Math.random()} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                          {s.date || "—"}
                        </td>
                        <td className="py-3 px-3 font-mono font-semibold text-blue-700">
                          {s.bill_number || s.reference_number || "—"}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-800">
                          {s.product || "—"}
                        </td>
                        <td className="py-3 px-3 text-slate-600">
                          {s.size || "—"}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-emerald-700">
                          +{Number(s.quantity || 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-center text-slate-500 font-mono text-[11px]">
                          {s.unit || "Nos"}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-semibold">
                            {s.status || "Received"}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-slate-500 text-[11px] truncate max-w-[220px]">
                          {s.remarks || "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 1: ADD SUPPLIER                                         */}
      {/* ============================================================== */}
      <Dialog open={addSupplierOpen} onOpenChange={setAddSupplierOpen}>
        <DialogContent className="max-w-lg" data-testid="modal-add-supplier">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Truck className="w-5 h-5 text-blue-600" />
              <span>Add New Supplier</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Register a vendor or manufacturer into the Supplier directory.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSupplier} className="space-y-3.5 py-1">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Supplier Name <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="e.g. ABC Electricals, Waree Solar Supplies Ltd"
                value={supplierForm.name}
                onChange={(e) => setSupplierForm((p) => ({ ...p, name: e.target.value }))}
                required
                className="text-xs bg-white"
                data-testid="input-supplier-name"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Contact Person</label>
                <Input
                  placeholder="Sales Rep / Contact"
                  value={supplierForm.contact_person}
                  onChange={(e) => setSupplierForm((p) => ({ ...p, contact_person: e.target.value }))}
                  className="text-xs bg-white"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Phone Number</label>
                <Input
                  placeholder="Phone / Mobile"
                  value={supplierForm.phone}
                  onChange={(e) => setSupplierForm((p) => ({ ...p, phone: e.target.value }))}
                  className="text-xs bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Email</label>
                <Input
                  type="email"
                  placeholder="supplier@company.com"
                  value={supplierForm.email}
                  onChange={(e) => setSupplierForm((p) => ({ ...p, email: e.target.value }))}
                  className="text-xs bg-white"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">GSTIN</label>
                <Input
                  placeholder="GST Number"
                  value={supplierForm.gstin}
                  onChange={(e) => setSupplierForm((p) => ({ ...p, gstin: e.target.value.toUpperCase() }))}
                  className="text-xs bg-white font-mono"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Category</label>
              <Select
                value={supplierForm.category}
                onValueChange={(val) => setSupplierForm((p) => ({ ...p, category: val }))}
              >
                <SelectTrigger className="h-9 text-xs bg-white border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Modules / Panels" className="text-xs">Modules / Panels</SelectItem>
                  <SelectItem value="Inverters" className="text-xs">Inverters</SelectItem>
                  <SelectItem value="Structures / Hardware" className="text-xs">Structures / Hardware</SelectItem>
                  <SelectItem value="Electricals & Cables" className="text-xs">Electricals & Cables</SelectItem>
                  <SelectItem value="General Supplier" className="text-xs">General Supplier</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Address</label>
              <Input
                placeholder="Warehouse / Office address"
                value={supplierForm.address}
                onChange={(e) => setSupplierForm((p) => ({ ...p, address: e.target.value }))}
                className="text-xs bg-white"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAddSupplierOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={savingSupplier}
                className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
                data-testid="btn-submit-add-supplier"
              >
                {savingSupplier ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Save Supplier
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ============================================================== */}
      {/* MODAL 2: EDIT SUPPLIER                                        */}
      {/* ============================================================== */}
      <Dialog open={editSupplierOpen} onOpenChange={setEditSupplierOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Pencil className="w-5 h-5 text-blue-600" />
              <span>Edit Supplier</span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleUpdateSupplier} className="space-y-3.5 py-1">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Supplier Name *</label>
              <Input
                value={supplierForm.name}
                onChange={(e) => setSupplierForm((p) => ({ ...p, name: e.target.value }))}
                required
                className="text-xs bg-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Contact Person</label>
                <Input
                  value={supplierForm.contact_person}
                  onChange={(e) => setSupplierForm((p) => ({ ...p, contact_person: e.target.value }))}
                  className="text-xs bg-white"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Phone</label>
                <Input
                  value={supplierForm.phone}
                  onChange={(e) => setSupplierForm((p) => ({ ...p, phone: e.target.value }))}
                  className="text-xs bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Email</label>
                <Input
                  type="email"
                  value={supplierForm.email}
                  onChange={(e) => setSupplierForm((p) => ({ ...p, email: e.target.value }))}
                  className="text-xs bg-white"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">GSTIN</label>
                <Input
                  value={supplierForm.gstin}
                  onChange={(e) => setSupplierForm((p) => ({ ...p, gstin: e.target.value.toUpperCase() }))}
                  className="text-xs bg-white font-mono"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditSupplierOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={updatingSupplier} className="bg-blue-600 hover:bg-blue-700 text-white">
                {updatingSupplier ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ============================================================== */}
      {/* MODAL 3: DELETE SUPPLIER                                      */}
      {/* ============================================================== */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <span>Delete Supplier</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 pt-1">
              Are you sure you want to delete <strong className="text-slate-800">"{supplierToDelete?.name}"</strong>?
              If this supplier has inward transactions, they will be safely archived to preserve inventory audit history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={isDeleting}
              onClick={handleDeleteSupplier}
              className="gap-1.5"
            >
              {isDeleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Confirm Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================== */}
      {/* MODAL 4: NEW SUPPLY ENTRY                                     */}
      {/* ============================================================== */}
      <Dialog open={newSupplyOpen} onOpenChange={setNewSupplyOpen}>
        <DialogContent className="max-w-lg" data-testid="modal-new-supply-entry">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <PackageCheck className="w-5 h-5 text-blue-600" />
              <span>Record New Supply (Inward)</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Receive goods into inventory from a registered supplier. Stock increases automatically.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSupply} className="space-y-3.5 py-1">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700">
                  Supplier / Vendor <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setNewSupplyOpen(false);
                    handleOpenAddSupplier();
                  }}
                  className="text-[11px] text-blue-600 hover:text-blue-700 font-semibold"
                >
                  + Add New Supplier
                </button>
              </div>

              {suppliers.length === 0 ? (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 space-y-1.5">
                  <p className="font-semibold">No Suppliers registered</p>
                  <p className="text-[11px]">Please add a supplier before recording supply inward.</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs bg-white text-amber-900 border-amber-300"
                    onClick={() => {
                      setNewSupplyOpen(false);
                      handleOpenAddSupplier();
                    }}
                  >
                    + Add Supplier
                  </Button>
                </div>
              ) : (
                <Select
                  value={supplyForm.vendor_id}
                  onValueChange={handleSelectSupplierForSupply}
                  data-testid="select-supplier"
                >
                  <SelectTrigger className="h-9 text-xs bg-white border-slate-200">
                    <SelectValue placeholder="Select Supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id} className="text-xs">
                        <span className="font-semibold">{s.name}</span>
                        {s.category ? ` — ${s.category}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Bill / Challan No. <span className="text-red-500">*</span>
                </label>
                <Input
                  value={supplyForm.bill_number}
                  onChange={(e) => setSupplyForm((p) => ({ ...p, bill_number: e.target.value }))}
                  required
                  placeholder="e.g. SUP-101"
                  className="text-xs bg-white font-mono"
                  data-testid="input-supply-bill-no"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Date <span className="text-red-500">*</span>
                </label>
                <Input
                  type="date"
                  value={supplyForm.date}
                  onChange={(e) => setSupplyForm((p) => ({ ...p, date: e.target.value }))}
                  required
                  className="text-xs bg-white"
                  data-testid="input-supply-date"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Product <span className="text-red-500">*</span>
              </label>
              <ProductAutocompleteInput
                value={supplyForm.product}
                onChange={(val) => setSupplyForm((p) => ({ ...p, product: val }))}
                onSelectProduct={(prod) => {
                  setSupplyForm((p) => ({
                    ...p,
                    product: prod.name,
                    product_id: prod.id || "",
                    size: prod.size || p.size,
                    unit: prod.unit || p.unit,
                  }));
                }}
                products={productList}
                placeholder="Search or enter product..."
                className="text-xs bg-white"
                data-testid="input-supply-product"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Size / Spec</label>
                <Input
                  value={supplyForm.size}
                  onChange={(e) => setSupplyForm((p) => ({ ...p, size: e.target.value }))}
                  placeholder="e.g. 540W"
                  className="text-xs bg-white"
                  data-testid="input-supply-size"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Quantity <span className="text-red-500">*</span>
                </label>
                <Input
                  type="number"
                  step="any"
                  min="0.01"
                  value={supplyForm.quantity}
                  onChange={(e) => setSupplyForm((p) => ({ ...p, quantity: e.target.value }))}
                  required
                  placeholder="Qty"
                  className="text-xs bg-white"
                  data-testid="input-supply-quantity"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Unit</label>
                <Select
                  value={supplyForm.unit}
                  onValueChange={(val) => setSupplyForm((p) => ({ ...p, unit: val }))}
                >
                  <SelectTrigger className="h-9 text-xs bg-white border-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getStandardizedUnitOptions().map((u) => (
                      <SelectItem key={u} value={u} className="text-xs">
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Remarks</label>
              <Input
                value={supplyForm.remarks}
                onChange={(e) => setSupplyForm((p) => ({ ...p, remarks: e.target.value }))}
                placeholder="Optional supplier shipment remarks"
                className="text-xs bg-white"
                data-testid="input-supply-remarks"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setNewSupplyOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={savingSupply || suppliers.length === 0}
                className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
                data-testid="btn-submit-new-supply"
              >
                {savingSupply ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Save Supply Entry
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
