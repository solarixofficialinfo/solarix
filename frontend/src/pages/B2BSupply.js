import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  Building2,
  Truck,
  ShoppingCart,
  BookOpen,
  Plus,
  Search,
  RefreshCw,
  Eye,
  Pencil,
  Trash2,
  AlertTriangle,
  MapPin,
  Phone,
  Mail,
  FileText,
  Calendar,
  CheckCircle2,
  ArrowUpFromLine,
  ArrowDownToLine,
  Layers,
  Sparkles,
  RotateCcw,
  Boxes,
  Activity,
  ArrowLeftRight
} from "lucide-react";
import { toast } from "sonner";
import dayjs from "dayjs";

export default function B2BSupply() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();

  // Section switcher: "b2b" | "supply"
  const [section, setSection] = useState("b2b");

  // Sub-tabs for each section
  // b2bTab: "customers" | "sales" | "ledger"
  const [b2bTab, setB2bTab] = useState("customers");
  // supplyTab: "suppliers" | "entries" | "ledger"
  const [supplyTab, setSupplyTab] = useState("suppliers");

  const [search, setSearch] = useState("");

  // Handle URL sync
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const sec = params.get("section");
    const tabParam = params.get("tab");

    if (location.pathname.startsWith("/supply")) {
      setSection("supply");
      if (tabParam && ["suppliers", "entries", "ledger"].includes(tabParam)) {
        setSupplyTab(tabParam);
      }
    } else if (location.pathname.startsWith("/b2b") || sec === "b2b") {
      setSection("b2b");
      if (tabParam && ["customers", "sales", "ledger"].includes(tabParam)) {
        setB2bTab(tabParam);
      }
    } else if (sec === "supply") {
      setSection("supply");
      if (tabParam && ["suppliers", "entries", "ledger"].includes(tabParam)) {
        setSupplyTab(tabParam);
      }
    }
  }, [location.pathname, location.search]);

  // ==========================================
  // B2B STATE & MUTATIONS
  // ==========================================
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [customerForm, setCustomerForm] = useState({
    name: "",
    contact_person: "",
    mobile: "",
    alt_mobile: "",
    email: "",
    gstin: "",
    address: "",
    city: "",
    state: "",
    notes: "",
  });

  const [editCustomerOpen, setEditCustomerOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [updatingCustomer, setUpdatingCustomer] = useState(false);

  const [deleteCustomerDialogOpen, setDeleteCustomerDialogOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState(null);
  const [isDeletingCustomer, setIsDeletingCustomer] = useState(false);

  const [selectedLedgerCustomerId, setSelectedLedgerCustomerId] = useState("");

  // 1. Fetch B2B Summary (Customers + transaction stats)
  const {
    data: b2bSummaryData,
    isLoading: loadingB2bSummary,
    refetch: refetchB2bSummary,
  } = useQuery({
    queryKey: ["inventory-b2b-summary"],
    queryFn: async () => {
      const res = await api.get("/inventory/b2b-summary");
      return res.data;
    },
    staleTime: 5000,
  });

  // 2. Fetch B2B Dedicated Customer Master
  const {
    data: b2bCustomersData,
    isLoading: loadingB2bCustomers,
    refetch: refetchB2bCustomers,
  } = useQuery({
    queryKey: ["inventory-b2b-customers"],
    queryFn: async () => {
      const res = await api.get("/inventory/b2b-customers");
      return res.data;
    },
    staleTime: 5000,
  });

  // 3. Fetch B2B Sales (Outwards)
  const {
    data: b2bSalesData,
    isLoading: loadingB2bSales,
    refetch: refetchB2bSales,
  } = useQuery({
    queryKey: ["inventory-b2b-sales"],
    queryFn: async () => {
      const res = await api.get("/inventory/b2b-sales");
      return res.data;
    },
    staleTime: 5000,
  });

  // 4. Fetch Ledger for Selected B2B Customer
  const {
    data: b2bLedgerData,
    isLoading: loadingB2bLedger,
    refetch: refetchB2bLedger,
  } = useQuery({
    queryKey: ["inventory-b2b-history", selectedLedgerCustomerId],
    queryFn: async () => {
      if (!selectedLedgerCustomerId) return null;
      const res = await api.get(`/inventory/b2b-client-history/${selectedLedgerCustomerId}`);
      return res.data;
    },
    enabled: Boolean(selectedLedgerCustomerId),
    staleTime: 5000,
  });

  // ==========================================
  // SUPPLY STATE & MUTATIONS
  // ==========================================
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

  const [deleteSupplierDialogOpen, setDeleteSupplierDialogOpen] = useState(false);
  const [supplierToDelete, setSupplierToDelete] = useState(null);
  const [isDeletingSupplier, setIsDeletingSupplier] = useState(false);

  const [selectedLedgerSupplierId, setSelectedLedgerSupplierId] = useState("");

  // 1. Fetch Suppliers Summary
  const {
    data: supplySummaryData,
    isLoading: loadingSuppliers,
    refetch: refetchSuppliers,
  } = useQuery({
    queryKey: ["inventory-supply-summary"],
    queryFn: async () => {
      const res = await api.get("/inventory/supply-summary");
      return res.data;
    },
    staleTime: 5000,
  });

  // 2. Fetch Supplier Ledger / History
  const {
    data: supplierHistoryData,
    isLoading: loadingSupplierHistory,
    refetch: refetchSupplierHistory,
  } = useQuery({
    queryKey: ["inventory-supplier-history", selectedLedgerSupplierId],
    queryFn: async () => {
      if (!selectedLedgerSupplierId) return null;
      const res = await api.get(`/inventory/supplier-history/${selectedLedgerSupplierId}`);
      return res.data;
    },
    enabled: Boolean(selectedLedgerSupplierId),
    staleTime: 5000,
  });

  // 3. Fetch Supply Entries (Inwards)
  const {
    data: supplyEntriesData,
    isLoading: loadingSupplyEntries,
    refetch: refetchSupplyEntries,
  } = useQuery({
    queryKey: ["inventory-supply-entries"],
    queryFn: async () => {
      const res = await api.get("/inventory/supply-entries");
      return res.data;
    },
    staleTime: 5000,
  });

  // Consolidated lists
  const b2bCustomers = useMemo(() => {
    return b2bSummaryData?.customers || b2bSummaryData?.clients || b2bCustomersData?.customers || [];
  }, [b2bSummaryData, b2bCustomersData]);

  const b2bSales = useMemo(() => {
    return b2bSalesData?.sales || [];
  }, [b2bSalesData]);

  const suppliers = useMemo(() => {
    return supplySummaryData?.suppliers || [];
  }, [supplySummaryData]);

  const supplyEntries = useMemo(() => {
    return supplyEntriesData?.entries || [];
  }, [supplyEntriesData]);

  // Global Invalidation Helper
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["inventory-b2b-summary"] });
    queryClient.invalidateQueries({ queryKey: ["inventory-b2b-customers"] });
    queryClient.invalidateQueries({ queryKey: ["inventory-b2b-sales"] });
    queryClient.invalidateQueries({ queryKey: ["inventory-b2b-history"] });
    queryClient.invalidateQueries({ queryKey: ["inventory-supply-summary"] });
    queryClient.invalidateQueries({ queryKey: ["inventory-supplier-history"] });
    queryClient.invalidateQueries({ queryKey: ["inventory-supply-entries"] });
    queryClient.invalidateQueries({ queryKey: ["inventory"] });
    queryClient.invalidateQueries({ queryKey: ["ledger"] });
  };

  // ==========================================
  // B2B HANDLERS
  // ==========================================
  const handleSaveCustomer = async (e) => {
    e.preventDefault();
    if (!customerForm.name.trim()) {
      toast.error("Please enter Business Name");
      return;
    }
    setSavingCustomer(true);
    try {
      await api.post("/inventory/b2b-customers", customerForm);
      toast.success(`B2B Business Customer "${customerForm.name}" created`);
      setAddCustomerOpen(false);
      setCustomerForm({
        name: "",
        contact_person: "",
        mobile: "",
        alt_mobile: "",
        email: "",
        gstin: "",
        address: "",
        city: "",
        state: "",
        notes: "",
      });
      invalidateAll();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSavingCustomer(false);
    }
  };

  const handleUpdateCustomer = async (e) => {
    e.preventDefault();
    if (!editingCustomer || !editingCustomer.id) return;
    setUpdatingCustomer(true);
    try {
      await api.put(`/inventory/b2b-customers/${editingCustomer.id}`, editingCustomer);
      toast.success("B2B Business Customer updated");
      setEditCustomerOpen(false);
      setEditingCustomer(null);
      invalidateAll();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setUpdatingCustomer(false);
    }
  };

  const handleDeleteCustomer = async () => {
    if (!customerToDelete) return;
    setIsDeletingCustomer(true);
    try {
      await api.delete(`/inventory/b2b-customers/${customerToDelete.id}`);
      toast.success("Customer removed / archived safely");
      setDeleteCustomerDialogOpen(false);
      setCustomerToDelete(null);
      invalidateAll();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setIsDeletingCustomer(false);
    }
  };

  // ==========================================
  // SUPPLY HANDLERS
  // ==========================================
  const handleSaveSupplier = async (e) => {
    e.preventDefault();
    if (!supplierForm.name.trim()) {
      toast.error("Please enter Supplier / Vendor Name");
      return;
    }
    setSavingSupplier(true);
    try {
      await api.post("/vendors", supplierForm);
      toast.success(`Supplier "${supplierForm.name}" created`);
      setAddSupplierOpen(false);
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
      invalidateAll();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSavingSupplier(false);
    }
  };

  const handleUpdateSupplier = async (e) => {
    e.preventDefault();
    if (!editingSupplier || !editingSupplier.id) return;
    setUpdatingSupplier(true);
    try {
      await api.put(`/vendors/${editingSupplier.id}`, editingSupplier);
      toast.success("Supplier updated");
      setEditSupplierOpen(false);
      setEditingSupplier(null);
      invalidateAll();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setUpdatingSupplier(false);
    }
  };

  const handleDeleteSupplier = async () => {
    if (!supplierToDelete) return;
    setIsDeletingSupplier(true);
    try {
      await api.delete(`/vendors/${supplierToDelete.id}`);
      toast.success("Supplier removed / archived safely");
      setDeleteSupplierDialogOpen(false);
      setSupplierToDelete(null);
      invalidateAll();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setIsDeletingSupplier(false);
    }
  };

  // ==========================================
  // FILTERED DATA CALCULATIONS
  // ==========================================
  const filteredB2bCustomers = useMemo(() => {
    if (!search.trim()) return b2bCustomers;
    const q = search.toLowerCase();
    return b2bCustomers.filter((c) =>
      (c.name || c.full_name || "").toLowerCase().includes(q) ||
      (c.contact_person || "").toLowerCase().includes(q) ||
      (c.mobile || "").includes(q) ||
      (c.gstin || "").toLowerCase().includes(q) ||
      (c.city || "").toLowerCase().includes(q)
    );
  }, [b2bCustomers, search]);

  const filteredB2bSales = useMemo(() => {
    if (!search.trim()) return b2bSales;
    const q = search.toLowerCase();
    return b2bSales.filter((s) =>
      (s.client_name || "").toLowerCase().includes(q) ||
      (s.bill_number || "").toLowerCase().includes(q) ||
      (s.product || "").toLowerCase().includes(q) ||
      (s.size || "").toLowerCase().includes(q)
    );
  }, [b2bSales, search]);

  const filteredSuppliers = useMemo(() => {
    if (!search.trim()) return suppliers;
    const q = search.toLowerCase();
    return suppliers.filter((s) =>
      (s.name || "").toLowerCase().includes(q) ||
      (s.contact_person || "").toLowerCase().includes(q) ||
      (s.phone || "").includes(q) ||
      (s.category || "").toLowerCase().includes(q)
    );
  }, [suppliers, search]);

  // Aggregate stats
  const b2bTotalOutward = useMemo(() => {
    return b2bCustomers.reduce((acc, c) => acc + (Number(c.total_outward) || 0), 0);
  }, [b2bCustomers]);

  const b2bTotalReturn = useMemo(() => {
    return b2bCustomers.reduce((acc, c) => acc + (Number(c.total_return) || 0), 0);
  }, [b2bCustomers]);

  const supplyTotalInward = useMemo(() => {
    return suppliers.reduce((acc, s) => acc + (Number(s.total_supplied) || Number(s.inward_count) || 0), 0);
  }, [suppliers]);

  const supplyTotalReturned = useMemo(() => {
    return suppliers.reduce((acc, s) => acc + (Number(s.total_returned) || 0), 0);
  }, [suppliers]);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <PageHeader
        title="B2B & Supply Management"
        subtitle="Manage B2B business customers, sales dispatches & client returns alongside supplier purchases & vendor returns with unified inventory stock synchronization."
        actions={
          <div className="flex items-center gap-2">
            <div className="relative w-64 md:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder={`Search ${section === "b2b" ? "B2B customers, sales..." : "suppliers, products..."}`}
                className="pl-9 h-9 text-xs bg-white border-slate-200"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={invalidateAll}
              className="h-9 px-3 text-xs bg-white text-slate-600 hover:text-slate-900"
              title="Refresh data"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
            </Button>
          </div>
        }
      />

      {/* Main Section Switcher: B2B vs Supply */}
      <div className="bg-slate-100 p-1.5 rounded-xl border border-slate-200/80 flex items-center justify-between gap-2 max-w-xl mx-auto shadow-inner">
        <button
          onClick={() => {
            setSection("b2b");
            setSearch("");
          }}
          className={`flex-1 flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-lg font-medium text-xs transition-all ${
            section === "b2b"
              ? "bg-white text-blue-700 shadow-sm font-semibold ring-1 ring-black/5"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
          }`}
        >
          <Building2 className={`w-4 h-4 ${section === "b2b" ? "text-blue-600" : "text-slate-400"}`} />
          <span>B2B Business Hub</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-blue-50 text-blue-700 border-blue-200">
            {b2bCustomers.length}
          </Badge>
        </button>

        <button
          onClick={() => {
            setSection("supply");
            setSearch("");
          }}
          className={`flex-1 flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-lg font-medium text-xs transition-all ${
            section === "supply"
              ? "bg-white text-emerald-700 shadow-sm font-semibold ring-1 ring-black/5"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
          }`}
        >
          <Truck className={`w-4 h-4 ${section === "supply" ? "text-emerald-600" : "text-slate-400"}`} />
          <span>Supply & Vendors</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-emerald-50 text-emerald-700 border-emerald-200">
            {suppliers.length}
          </Badge>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: B2B BUSINESS HUB */}
      {/* ========================================================================= */}
      {section === "b2b" && (
        <div className="space-y-6">
          {/* B2B Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Business Customers</div>
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Building2 className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold tabular-nums text-slate-900" style={{ fontFamily: "Outfit" }}>
                  {b2bCustomers.length}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Direct B2B parties</div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total Outward Sales</div>
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                    <ArrowUpFromLine className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold tabular-nums text-slate-900" style={{ fontFamily: "Outfit" }}>
                  {b2bTotalOutward.toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Dispatched units (Stock -)</div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">B2B Client Returns</div>
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <RotateCcw className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold tabular-nums text-slate-900" style={{ fontFamily: "Outfit" }}>
                  {b2bTotalReturn.toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Inward returns (Stock +)</div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Net B2B Volume</div>
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Layers className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold tabular-nums text-emerald-700" style={{ fontFamily: "Outfit" }}>
                  {(b2bTotalOutward - b2bTotalReturn).toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Sales minus Returns</div>
              </CardContent>
            </Card>
          </div>

          {/* Sub Tab Navigation & Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setB2bTab("customers")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  b2bTab === "customers" ? "bg-white text-blue-700 shadow-xs font-semibold" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Business Customers ({b2bCustomers.length})
              </button>
              <button
                onClick={() => setB2bTab("sales")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  b2bTab === "sales" ? "bg-white text-blue-700 shadow-xs font-semibold" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                B2B Sales ({b2bSales.length})
              </button>
              <button
                onClick={() => setB2bTab("ledger")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  b2bTab === "ledger" ? "bg-white text-blue-700 shadow-xs font-semibold" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                B2B Ledger
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="hidden md:inline-flex items-center text-[11px] text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-md">
                Enter transactions in <strong className="ml-1 text-slate-700">Data Management → Inward / Outward</strong>
              </span>
              <Button
                size="sm"
                onClick={() => setAddCustomerOpen(true)}
                className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> + Add Business Customer
              </Button>
            </div>
          </div>

          {/* TAB 1: B2B Business Customers */}
          {b2bTab === "customers" && (
            <Card className="border-slate-200 shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                      <th className="py-3 px-4">Business Customer</th>
                      <th className="py-3 px-4">Contact Person</th>
                      <th className="py-3 px-4">Phone / Email</th>
                      <th className="py-3 px-4">GSTIN</th>
                      <th className="py-3 px-4">Location</th>
                      <th className="py-3 px-4 text-right">Outward (Sale)</th>
                      <th className="py-3 px-4 text-right">Return (Inward)</th>
                      <th className="py-3 px-4 text-right">Net Qty</th>
                      <th className="py-3 px-4 text-center">Last Activity</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loadingB2bSummary && b2bCustomers.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="text-center py-10 text-slate-400">Loading B2B customers...</td>
                      </tr>
                    ) : filteredB2bCustomers.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="text-center py-12 text-slate-400">
                          <Building2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                          <p className="font-medium text-slate-600">No B2B Business Customers found</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">Click &quot;+ Add Business Customer&quot; above to create directly with zero onboarding.</p>
                        </td>
                      </tr>
                    ) : (
                      filteredB2bCustomers.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50/80 transition">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900">{c.name || c.full_name}</div>
                            {c.sol_id && <div className="text-[10px] text-blue-600 font-mono">{c.sol_id}</div>}
                          </td>
                          <td className="py-3 px-4 text-slate-700 font-medium">{c.contact_person || "—"}</td>
                          <td className="py-3 px-4 text-slate-600">
                            <div>{c.mobile || "—"}</div>
                            {c.email && <div className="text-[10px] text-slate-400">{c.email}</div>}
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-600">{c.gstin || "—"}</td>
                          <td className="py-3 px-4 text-slate-600">{c.city || c.address || "—"}</td>
                          <td className="py-3 px-4 text-right font-medium text-amber-700 tabular-nums">
                            {(c.total_outward || 0).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-indigo-700 tabular-nums">
                            {(c.total_return || 0).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-slate-900 tabular-nums">
                            {(c.net_quantity !== undefined ? c.net_quantity : (c.total_outward || 0) - (c.total_return || 0)).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-center text-slate-500 tabular-nums text-[11px]">
                            {c.last_transaction || "—"}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-blue-600 hover:bg-blue-50"
                                title="View Customer Ledger"
                                onClick={() => {
                                  setSelectedLedgerCustomerId(c.id);
                                  setB2bTab("ledger");
                                }}
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-slate-600 hover:bg-slate-100"
                                title="Edit Customer"
                                onClick={() => {
                                  setEditingCustomer(c);
                                  setEditCustomerOpen(true);
                                }}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-red-600 hover:bg-red-50"
                                title="Safe Remove / Archive"
                                onClick={() => {
                                  setCustomerToDelete(c);
                                  setDeleteCustomerDialogOpen(true);
                                }}
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

          {/* TAB 2: B2B Sales Dispatches */}
          {b2bTab === "sales" && (
            <Card className="border-slate-200 shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Bill / Invoice No.</th>
                      <th className="py-3 px-4">B2B Customer</th>
                      <th className="py-3 px-4">Product</th>
                      <th className="py-3 px-4">Size / Spec</th>
                      <th className="py-3 px-4 text-right">Quantity</th>
                      <th className="py-3 px-4">Unit</th>
                      <th className="py-3 px-4">Remarks</th>
                      <th className="py-3 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loadingB2bSales && b2bSales.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center py-10 text-slate-400">Loading B2B sales...</td>
                      </tr>
                    ) : filteredB2bSales.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center py-12 text-slate-400">
                          <ShoppingCart className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                          <p className="font-medium text-slate-600">No B2B sales recorded yet</p>
                          <p className="text-[11px] text-slate-400 mt-1">
                            Record outward dispatches via <strong className="text-slate-700">Data Management → Outward (B2B Sale)</strong>.
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate("/inventory?tab=outward&type=b2b")}
                            className="mt-3 text-xs h-7 border-slate-200 text-slate-700 hover:bg-slate-100"
                          >
                            Go to Data Management → Outward
                          </Button>
                        </td>
                      </tr>
                    ) : (
                      filteredB2bSales.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50/80 transition">
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-600">{s.date}</td>
                          <td className="py-3 px-4 font-semibold text-slate-900 font-mono">{s.bill_number}</td>
                          <td className="py-3 px-4 font-semibold text-blue-700">{s.client_name}</td>
                          <td className="py-3 px-4 text-slate-900 font-medium">{s.product}</td>
                          <td className="py-3 px-4 text-slate-600">{s.size || "—"}</td>
                          <td className="py-3 px-4 text-right font-bold text-amber-700 tabular-nums">
                            {Number(s.quantity).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-slate-500">{s.unit || "Nos"}</td>
                          <td className="py-3 px-4 text-slate-500 text-[11px] max-w-xs truncate">{s.remarks || "—"}</td>
                          <td className="py-3 px-4 text-center">
                            <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                              {s.status || "Dispatched"}
                            </Badge>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* TAB 3: B2B Customer Ledger */}
          {b2bTab === "ledger" && (
            <div className="space-y-4">
              <Card className="border-slate-200 p-4 bg-slate-50/60">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1 max-w-md">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">
                      Select B2B Business Customer
                    </label>
                    <Select
                      value={selectedLedgerCustomerId}
                      onValueChange={setSelectedLedgerCustomerId}
                    >
                      <SelectTrigger className="h-10 text-xs bg-white border-slate-200">
                        <SelectValue placeholder="Choose B2B Business Customer for statement..." />
                      </SelectTrigger>
                      <SelectContent>
                        {b2bCustomers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name || c.full_name} ({c.city || "B2B"})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {b2bLedgerData?.customer && (
                    <div className="flex items-center gap-4 bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
                      <div>
                        <div className="text-[10px] uppercase font-semibold text-slate-400">Total Outward</div>
                        <div className="text-sm font-bold text-amber-700 tabular-nums">
                          {(b2bLedgerData.transactions || [])
                            .filter((t) => t.type === "OUTWARD")
                            .reduce((acc, t) => acc + (t.quantity || 0), 0)
                            .toLocaleString()}
                        </div>
                      </div>
                      <div className="h-8 w-px bg-slate-200" />
                      <div>
                        <div className="text-[10px] uppercase font-semibold text-slate-400">Total Return</div>
                        <div className="text-sm font-bold text-indigo-700 tabular-nums">
                          {(b2bLedgerData.transactions || [])
                            .filter((t) => t.type === "INWARD_RETURN")
                            .reduce((acc, t) => acc + (t.quantity || 0), 0)
                            .toLocaleString()}
                        </div>
                      </div>
                      <div className="h-8 w-px bg-slate-200" />
                      <div>
                        <div className="text-[10px] uppercase font-semibold text-slate-400">Net Balance</div>
                        <div className="text-sm font-bold text-slate-900 tabular-nums">
                          {(
                            (b2bLedgerData.transactions || [])
                              .filter((t) => t.type === "OUTWARD")
                              .reduce((acc, t) => acc + (t.quantity || 0), 0) -
                            (b2bLedgerData.transactions || [])
                              .filter((t) => t.type === "INWARD_RETURN")
                              .reduce((acc, t) => acc + (t.quantity || 0), 0)
                          ).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </Card>

              {/* Ledger Statement Table */}
              <Card className="border-slate-200 shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Bill / Reference No.</th>
                        <th className="py-3 px-4">Transaction Flow</th>
                        <th className="py-3 px-4">Product</th>
                        <th className="py-3 px-4">Size / Spec</th>
                        <th className="py-3 px-4 text-right">Quantity</th>
                        <th className="py-3 px-4">Unit</th>
                        <th className="py-3 px-4">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {!selectedLedgerCustomerId ? (
                        <tr>
                          <td colSpan={8} className="text-center py-12 text-slate-400">
                            <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                            <p className="font-medium text-slate-600">Select a B2B Business Customer above</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">View combined chronological timeline of Sales and Returns.</p>
                          </td>
                        </tr>
                      ) : loadingB2bLedger ? (
                        <tr>
                          <td colSpan={8} className="text-center py-10 text-slate-400">Loading ledger timeline...</td>
                        </tr>
                      ) : (b2bLedgerData?.transactions || []).length === 0 ? (
                        <tr>
                          <td colSpan={8} className="text-center py-10 text-slate-400">
                            No transactions recorded for this business customer.
                          </td>
                        </tr>
                      ) : (
                        b2bLedgerData.transactions.map((t) => {
                          const isSale = t.type === "OUTWARD";
                          return (
                            <tr key={t.id} className="hover:bg-slate-50/80 transition">
                              <td className="py-3 px-4 font-mono text-[11px] text-slate-600">{t.date}</td>
                              <td className="py-3 px-4 font-semibold text-slate-900 font-mono">{t.bill_number}</td>
                              <td className="py-3 px-4">
                                {isSale ? (
                                  <Badge className="bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-50">
                                    <ArrowUpFromLine className="w-3 h-3 mr-1" /> B2B Sale (Outward)
                                  </Badge>
                                ) : (
                                  <Badge className="bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-50">
                                    <RotateCcw className="w-3 h-3 mr-1" /> B2B Return (Inward)
                                  </Badge>
                                )}
                              </td>
                              <td className="py-3 px-4 font-medium text-slate-900">{t.product}</td>
                              <td className="py-3 px-4 text-slate-600">{t.size || "—"}</td>
                              <td className={`py-3 px-4 text-right font-bold tabular-nums ${isSale ? "text-amber-700" : "text-indigo-700"}`}>
                                {isSale ? "-" : "+"}{Number(t.quantity).toLocaleString()}
                              </td>
                              <td className="py-3 px-4 text-slate-500">{t.unit || "Nos"}</td>
                              <td className="py-3 px-4 text-slate-500 text-[11px] max-w-xs truncate">{t.remarks || "—"}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 2: SUPPLY & VENDORS */}
      {/* ========================================================================= */}
      {section === "supply" && (
        <div className="space-y-6">
          {/* Supply Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total Suppliers</div>
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Truck className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold tabular-nums text-slate-900" style={{ fontFamily: "Outfit" }}>
                  {suppliers.length}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Active vendors / OEMs</div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total Supplied Stock</div>
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                    <ArrowDownToLine className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold tabular-nums text-slate-900" style={{ fontFamily: "Outfit" }}>
                  {supplyTotalInward.toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Inward receipts (Stock +)</div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Supplier Returns</div>
                  <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                    <ArrowUpFromLine className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold tabular-nums text-slate-900" style={{ fontFamily: "Outfit" }}>
                  {supplyTotalReturned.toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Outward returns (Stock -)</div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Net Inventory Inward</div>
                  <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
                    <Boxes className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold tabular-nums text-teal-700" style={{ fontFamily: "Outfit" }}>
                  {(supplyTotalInward - supplyTotalReturned).toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Net added to warehouse</div>
              </CardContent>
            </Card>
          </div>

          {/* Sub Tab Navigation & Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setSupplyTab("suppliers")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  supplyTab === "suppliers" ? "bg-white text-emerald-700 shadow-xs font-semibold" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Suppliers Master ({suppliers.length})
              </button>
              <button
                onClick={() => setSupplyTab("entries")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  supplyTab === "entries" ? "bg-white text-emerald-700 shadow-xs font-semibold" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Supply Entries (Inward)
              </button>
              <button
                onClick={() => setSupplyTab("ledger")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  supplyTab === "ledger" ? "bg-white text-emerald-700 shadow-xs font-semibold" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Supplier Ledger
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="hidden md:inline-flex items-center text-[11px] text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-md">
                Enter transactions in <strong className="ml-1 text-slate-700">Data Management → Inward / Outward</strong>
              </span>
              <Button
                size="sm"
                onClick={() => setAddSupplierOpen(true)}
                className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> + Add Supplier
              </Button>
            </div>
          </div>

          {/* TAB 1: Suppliers Master */}
          {supplyTab === "suppliers" && (
            <Card className="border-slate-200 shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                      <th className="py-3 px-4">Supplier / Vendor</th>
                      <th className="py-3 px-4">Contact Person</th>
                      <th className="py-3 px-4">Phone / Email</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4 text-right">Inward Receipts</th>
                      <th className="py-3 px-4 text-right">Returns</th>
                      <th className="py-3 px-4 text-right">Net Qty</th>
                      <th className="py-3 px-4 text-center">Last Supply</th>
                      <th className="py-3 px-4">Products Supplied</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loadingSuppliers && suppliers.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="text-center py-10 text-slate-400">Loading suppliers...</td>
                      </tr>
                    ) : filteredSuppliers.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="text-center py-12 text-slate-400">
                          <Truck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                          <p className="font-medium text-slate-600">No Suppliers found</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">Click &quot;+ Add Supplier&quot; above to register a new vendor/OEM.</p>
                        </td>
                      </tr>
                    ) : (
                      filteredSuppliers.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50/80 transition">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900">{s.name}</div>
                            {s.gstin && <div className="text-[10px] text-slate-400 font-mono">{s.gstin}</div>}
                          </td>
                          <td className="py-3 px-4 text-slate-700 font-medium">{s.contact_person || "—"}</td>
                          <td className="py-3 px-4 text-slate-600">
                            <div>{s.phone || "—"}</div>
                            {s.email && <div className="text-[10px] text-slate-400">{s.email}</div>}
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-700">
                              {s.category || "Supplier"}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-blue-700 tabular-nums">
                            {(s.total_supplied !== undefined ? s.total_supplied : s.inward_count || 0).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-rose-700 tabular-nums">
                            {(s.total_returned || 0).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-slate-900 tabular-nums">
                            {(s.net_quantity !== undefined ? s.net_quantity : (s.total_supplied || 0) - (s.total_returned || 0)).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-center text-slate-500 tabular-nums text-[11px]">
                            {s.last_supply || "—"}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {(s.products_supplied || []).slice(0, 2).map((p) => (
                                <Badge key={p} variant="secondary" className="text-[9px] py-0 px-1 bg-slate-100 text-slate-700">
                                  {p}
                                </Badge>
                              ))}
                              {(s.products_supplied || []).length > 2 && (
                                <Badge variant="secondary" className="text-[9px] py-0 px-1 bg-slate-100 text-slate-500">
                                  +{(s.products_supplied || []).length - 2}
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-emerald-600 hover:bg-emerald-50"
                                title="View Supplier Ledger"
                                onClick={() => {
                                  setSelectedLedgerSupplierId(s.id);
                                  setSupplyTab("ledger");
                                }}
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-slate-600 hover:bg-slate-100"
                                title="Edit Supplier"
                                onClick={() => {
                                  setEditingSupplier(s);
                                  setEditSupplierOpen(true);
                                }}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-red-600 hover:bg-red-50"
                                title="Safe Remove / Archive"
                                onClick={() => {
                                  setSupplierToDelete(s);
                                  setDeleteSupplierDialogOpen(true);
                                }}
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

          {/* TAB 2: Supply Entries (Inwards) */}
          {supplyTab === "entries" && (
            <Card className="border-slate-200 shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Bill / Ref No.</th>
                      <th className="py-3 px-4">Supplier / Vendor</th>
                      <th className="py-3 px-4">Product</th>
                      <th className="py-3 px-4">Size / Spec</th>
                      <th className="py-3 px-4 text-right">Quantity</th>
                      <th className="py-3 px-4">Unit</th>
                      <th className="py-3 px-4">Remarks</th>
                      <th className="py-3 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loadingSupplyEntries && supplyEntries.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center py-10 text-slate-400">Loading supply entries...</td>
                      </tr>
                    ) : supplyEntries.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center py-12 text-slate-400">
                          <Truck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                          <p className="font-medium text-slate-600">No supply entries recorded yet</p>
                          <p className="text-[11px] text-slate-400 mt-1">
                            Record incoming shipments via <strong className="text-slate-700">Data Management → Inward (Supplier Supply)</strong>.
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate("/inventory?tab=inward&type=supply")}
                            className="mt-3 text-xs h-7 border-slate-200 text-slate-700 hover:bg-slate-100"
                          >
                            Go to Data Management → Inward
                          </Button>
                        </td>
                      </tr>
                    ) : (
                      supplyEntries.map((e) => (
                        <tr key={e.id} className="hover:bg-slate-50/80 transition">
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-600">{e.date}</td>
                          <td className="py-3 px-4 font-semibold text-slate-900 font-mono">{e.bill_number}</td>
                          <td className="py-3 px-4 font-semibold text-emerald-700">{e.supplier_name}</td>
                          <td className="py-3 px-4 text-slate-900 font-medium">{e.product}</td>
                          <td className="py-3 px-4 text-slate-600">{e.size || "—"}</td>
                          <td className="py-3 px-4 text-right font-bold text-blue-700 tabular-nums">
                            {Number(e.quantity).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-slate-500">{e.unit || "Nos"}</td>
                          <td className="py-3 px-4 text-slate-500 text-[11px] max-w-xs truncate">{e.remarks || "—"}</td>
                          <td className="py-3 px-4 text-center">
                            <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                              {e.status || "Received"}
                            </Badge>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* TAB 3: Supplier Ledger */}
          {supplyTab === "ledger" && (
            <div className="space-y-4">
              <Card className="border-slate-200 p-4 bg-slate-50/60">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1 max-w-md">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">
                      Select Supplier / Vendor
                    </label>
                    <Select
                      value={selectedLedgerSupplierId}
                      onValueChange={setSelectedLedgerSupplierId}
                    >
                      <SelectTrigger className="h-10 text-xs bg-white border-slate-200">
                        <SelectValue placeholder="Choose Supplier for ledger statement..." />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} ({s.category || "Vendor"})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {supplierHistoryData?.vendor && (
                    <div className="flex items-center gap-4 bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
                      <div>
                        <div className="text-[10px] uppercase font-semibold text-slate-400">Total Supplied</div>
                        <div className="text-sm font-bold text-blue-700 tabular-nums">
                          {(supplierHistoryData.transactions || supplierHistoryData.supplies || [])
                            .filter((t) => t.type === "INWARD" || !t.type)
                            .reduce((acc, t) => acc + (t.quantity || 0), 0)
                            .toLocaleString()}
                        </div>
                      </div>
                      <div className="h-8 w-px bg-slate-200" />
                      <div>
                        <div className="text-[10px] uppercase font-semibold text-slate-400">Total Returned</div>
                        <div className="text-sm font-bold text-rose-700 tabular-nums">
                          {(supplierHistoryData.transactions || [])
                            .filter((t) => t.type === "OUTWARD_RETURN")
                            .reduce((acc, t) => acc + (t.quantity || 0), 0)
                            .toLocaleString()}
                        </div>
                      </div>
                      <div className="h-8 w-px bg-slate-200" />
                      <div>
                        <div className="text-[10px] uppercase font-semibold text-slate-400">Net Retained</div>
                        <div className="text-sm font-bold text-teal-700 tabular-nums">
                          {(
                            (supplierHistoryData.transactions || supplierHistoryData.supplies || [])
                              .filter((t) => t.type === "INWARD" || !t.type)
                              .reduce((acc, t) => acc + (t.quantity || 0), 0) -
                            (supplierHistoryData.transactions || [])
                              .filter((t) => t.type === "OUTWARD_RETURN")
                              .reduce((acc, t) => acc + (t.quantity || 0), 0)
                          ).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </Card>

              {/* Supplier Statement Table */}
              <Card className="border-slate-200 shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Bill / Reference No.</th>
                        <th className="py-3 px-4">Flow Type</th>
                        <th className="py-3 px-4">Product</th>
                        <th className="py-3 px-4">Size / Spec</th>
                        <th className="py-3 px-4 text-right">Quantity</th>
                        <th className="py-3 px-4">Unit</th>
                        <th className="py-3 px-4">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {!selectedLedgerSupplierId ? (
                        <tr>
                          <td colSpan={8} className="text-center py-12 text-slate-400">
                            <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                            <p className="font-medium text-slate-600">Select a Supplier above</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">View full supply receipts and return history.</p>
                          </td>
                        </tr>
                      ) : loadingSupplierHistory ? (
                        <tr>
                          <td colSpan={8} className="text-center py-10 text-slate-400">Loading supplier timeline...</td>
                        </tr>
                      ) : (supplierHistoryData?.transactions || supplierHistoryData?.supplies || []).length === 0 ? (
                        <tr>
                          <td colSpan={8} className="text-center py-10 text-slate-400">
                            No supply or return transactions found for this vendor.
                          </td>
                        </tr>
                      ) : (
                        (supplierHistoryData.transactions || supplierHistoryData.supplies || []).map((t) => {
                          const isReturn = t.type === "OUTWARD_RETURN";
                          return (
                            <tr key={t.id} className="hover:bg-slate-50/80 transition">
                              <td className="py-3 px-4 font-mono text-[11px] text-slate-600">{t.date}</td>
                              <td className="py-3 px-4 font-semibold text-slate-900 font-mono">{t.bill_number}</td>
                              <td className="py-3 px-4">
                                {isReturn ? (
                                  <Badge className="bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-50">
                                    <ArrowUpFromLine className="w-3 h-3 mr-1" /> Supplier Return (Outward)
                                  </Badge>
                                ) : (
                                  <Badge className="bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-50">
                                    <ArrowDownToLine className="w-3 h-3 mr-1" /> Supply Receipt (Inward)
                                  </Badge>
                                )}
                              </td>
                              <td className="py-3 px-4 font-medium text-slate-900">{t.product}</td>
                              <td className="py-3 px-4 text-slate-600">{t.size || "—"}</td>
                              <td className={`py-3 px-4 text-right font-bold tabular-nums ${isReturn ? "text-rose-700" : "text-blue-700"}`}>
                                {isReturn ? "-" : "+"}{Number(t.quantity).toLocaleString()}
                              </td>
                              <td className="py-3 px-4 text-slate-500">{t.unit || "Nos"}</td>
                              <td className="py-3 px-4 text-slate-500 text-[11px] max-w-xs truncate">{t.remarks || "—"}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODALS */}
      {/* ========================================================================= */}

      {/* 1. Add B2B Business Customer Modal */}
      <Dialog open={addCustomerOpen} onOpenChange={setAddCustomerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-600" />
              Add B2B Business Customer
            </DialogTitle>
            <DialogDescription>
              Register a business firm, dealer, or corporate customer. Direct creation with no client onboarding.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveCustomer} className="space-y-3.5 py-2">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 block mb-1">
                Business Name *
              </label>
              <Input
                placeholder="e.g. ABC Industries, NIKI FABRIC, ARVIND MILL"
                value={customerForm.name}
                onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                className="text-xs h-9"
                required
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 block mb-1">
                  Contact Person
                </label>
                <Input
                  placeholder="Manager / Director name"
                  value={customerForm.contact_person}
                  onChange={(e) => setCustomerForm({ ...customerForm, contact_person: e.target.value })}
                  className="text-xs h-9"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 block mb-1">
                  Mobile / Phone
                </label>
                <Input
                  placeholder="10-digit mobile"
                  value={customerForm.mobile}
                  onChange={(e) => setCustomerForm({ ...customerForm, mobile: e.target.value })}
                  className="text-xs h-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 block mb-1">
                  GSTIN (Tax ID)
                </label>
                <Input
                  placeholder="15-digit GSTIN"
                  value={customerForm.gstin}
                  onChange={(e) => setCustomerForm({ ...customerForm, gstin: e.target.value.toUpperCase() })}
                  className="text-xs h-9 uppercase font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 block mb-1">
                  Email
                </label>
                <Input
                  placeholder="accounts@business.com"
                  type="email"
                  value={customerForm.email}
                  onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                  className="text-xs h-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 block mb-1">
                  City
                </label>
                <Input
                  placeholder="e.g. Ahmedabad, Surat"
                  value={customerForm.city}
                  onChange={(e) => setCustomerForm({ ...customerForm, city: e.target.value })}
                  className="text-xs h-9"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 block mb-1">
                  State
                </label>
                <Input
                  placeholder="e.g. Gujarat, Maharashtra"
                  value={customerForm.state}
                  onChange={(e) => setCustomerForm({ ...customerForm, state: e.target.value })}
                  className="text-xs h-9"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 block mb-1">
                Address
              </label>
              <Input
                placeholder="Business plant / office address"
                value={customerForm.address}
                onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })}
                className="text-xs h-9"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddCustomerOpen(false)}
                className="text-xs h-9"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={savingCustomer}
                className="text-xs h-9 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {savingCustomer ? "Saving..." : "Save Business Customer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 2. Edit B2B Business Customer Modal */}
      <Dialog open={editCustomerOpen} onOpenChange={setEditCustomerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit B2B Business Customer</DialogTitle>
          </DialogHeader>
          {editingCustomer && (
            <form onSubmit={handleUpdateCustomer} className="space-y-3.5 py-2">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 block mb-1">
                  Business Name *
                </label>
                <Input
                  value={editingCustomer.name || editingCustomer.full_name || ""}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, name: e.target.value, full_name: e.target.value })}
                  className="text-xs h-9"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 block mb-1">
                    Contact Person
                  </label>
                  <Input
                    value={editingCustomer.contact_person || ""}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, contact_person: e.target.value })}
                    className="text-xs h-9"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 block mb-1">
                    Mobile / Phone
                  </label>
                  <Input
                    value={editingCustomer.mobile || ""}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, mobile: e.target.value })}
                    className="text-xs h-9"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 block mb-1">
                    GSTIN
                  </label>
                  <Input
                    value={editingCustomer.gstin || ""}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, gstin: e.target.value.toUpperCase() })}
                    className="text-xs h-9 uppercase font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 block mb-1">
                    City
                  </label>
                  <Input
                    value={editingCustomer.city || ""}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, city: e.target.value })}
                    className="text-xs h-9"
                  />
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setEditCustomerOpen(false)} className="text-xs h-9">
                  Cancel
                </Button>
                <Button type="submit" disabled={updatingCustomer} className="text-xs h-9 bg-blue-600 text-white">
                  {updatingCustomer ? "Updating..." : "Update Customer"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* 3. Delete / Archive Customer Dialog */}
      <Dialog open={deleteCustomerDialogOpen} onOpenChange={setDeleteCustomerDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="w-5 h-5" />
              Remove B2B Customer
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to remove <strong>{customerToDelete?.name || customerToDelete?.full_name}</strong>? If historical transactions exist, the customer will be safely archived without deleting past transaction history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setDeleteCustomerDialogOpen(false)} className="text-xs h-9">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteCustomer}
              disabled={isDeletingCustomer}
              className="text-xs h-9"
            >
              {isDeletingCustomer ? "Removing..." : "Confirm Removal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 6. Add Supplier Modal */}
      <Dialog open={addSupplierOpen} onOpenChange={setAddSupplierOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-emerald-600" />
              Add Supplier / Vendor
            </DialogTitle>
            <DialogDescription>
              Register a component manufacturer, distributor, or material supplier.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveSupplier} className="space-y-3.5 py-2">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 block mb-1">
                Supplier Name *
              </label>
              <Input
                placeholder="e.g. ABC Solar Distributors, Waree, Havells"
                value={supplierForm.name}
                onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                className="text-xs h-9"
                required
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 block mb-1">
                  Contact Person
                </label>
                <Input
                  placeholder="Sales executive / Contact"
                  value={supplierForm.contact_person}
                  onChange={(e) => setSupplierForm({ ...supplierForm, contact_person: e.target.value })}
                  className="text-xs h-9"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 block mb-1">
                  Phone / Mobile
                </label>
                <Input
                  placeholder="Contact phone number"
                  value={supplierForm.phone}
                  onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                  className="text-xs h-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 block mb-1">
                  GSTIN (Tax ID)
                </label>
                <Input
                  placeholder="15-digit GSTIN"
                  value={supplierForm.gstin}
                  onChange={(e) => setSupplierForm({ ...supplierForm, gstin: e.target.value.toUpperCase() })}
                  className="text-xs h-9 uppercase font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 block mb-1">
                  Category
                </label>
                <Select
                  value={supplierForm.category}
                  onValueChange={(val) => setSupplierForm({ ...supplierForm, category: val })}
                >
                  <SelectTrigger className="h-9 text-xs bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Modules / Panels">Modules / Solar Panels</SelectItem>
                    <SelectItem value="Inverters">Inverters & PCUs</SelectItem>
                    <SelectItem value="Batteries">Batteries & Storage</SelectItem>
                    <SelectItem value="Structures / GI">Structures & Metal Fabricators</SelectItem>
                    <SelectItem value="Electrical BOS / Cables">Electrical BOS & Cables</SelectItem>
                    <SelectItem value="General Supplier">General Vendor / Supplier</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 block mb-1">
                Office / Plant Address
              </label>
              <Input
                placeholder="Warehouse or office location"
                value={supplierForm.address}
                onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
                className="text-xs h-9"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setAddSupplierOpen(false)} className="text-xs h-9">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={savingSupplier}
                className="text-xs h-9 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {savingSupplier ? "Saving..." : "Save Supplier"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 7. Edit Supplier Modal */}
      <Dialog open={editSupplierOpen} onOpenChange={setEditSupplierOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Supplier</DialogTitle>
          </DialogHeader>
          {editingSupplier && (
            <form onSubmit={handleUpdateSupplier} className="space-y-3.5 py-2">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 block mb-1">
                  Supplier Name *
                </label>
                <Input
                  value={editingSupplier.name || ""}
                  onChange={(e) => setEditingSupplier({ ...editingSupplier, name: e.target.value })}
                  className="text-xs h-9"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 block mb-1">
                    Contact Person
                  </label>
                  <Input
                    value={editingSupplier.contact_person || ""}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, contact_person: e.target.value })}
                    className="text-xs h-9"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 block mb-1">
                    Phone
                  </label>
                  <Input
                    value={editingSupplier.phone || ""}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, phone: e.target.value })}
                    className="text-xs h-9"
                  />
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setEditSupplierOpen(false)} className="text-xs h-9">
                  Cancel
                </Button>
                <Button type="submit" disabled={updatingSupplier} className="text-xs h-9 bg-emerald-600 text-white">
                  {updatingSupplier ? "Updating..." : "Update Supplier"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* 8. Delete / Archive Supplier Dialog */}
      <Dialog open={deleteSupplierDialogOpen} onOpenChange={setDeleteSupplierDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="w-5 h-5" />
              Remove Supplier
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to remove <strong>{supplierToDelete?.name}</strong>? If historical inward supply records exist, the supplier will be safely archived without deleting past transaction history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setDeleteSupplierDialogOpen(false)} className="text-xs h-9">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteSupplier}
              disabled={isDeletingSupplier}
              className="text-xs h-9"
            >
              {isDeletingSupplier ? "Removing..." : "Confirm Removal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
