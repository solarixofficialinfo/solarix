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
  Building2,
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
} from "lucide-react";
import { toast } from "sonner";
import dayjs from "dayjs";

export default function B2B() {
  const queryClient = useQueryClient();
  const location = useLocation();

  // Tab: "customers" | "sales" | "ledger"
  const [tab, setTab] = useState("customers");
  const [search, setSearch] = useState("");

  // When navigated with ?tab=sales or ?tab=ledger
  useEffect(() => {
    const qTab = new URLSearchParams(location.search).get("tab");
    if (qTab && ["customers", "sales", "ledger"].includes(qTab)) {
      setTab(qTab);
    }
  }, [location.search]);

  // Modals & form state
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

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // New B2B Sale State
  const [newSaleOpen, setNewSaleOpen] = useState(false);
  const [savingSale, setSavingSale] = useState(false);
  const [saleForm, setSaleForm] = useState({
    customer_id: "",
    customer_name: "",
    bill_number: "",
    date: dayjs().format("YYYY-MM-DD"),
    product: "",
    product_id: "",
    size: "",
    quantity: "",
    unit: "Nos",
    remarks: "",
  });

  // Selected customer for Ledger
  const [selectedLedgerCustomerId, setSelectedLedgerCustomerId] = useState("");

  // Product Master list for Autocomplete
  const { data: productList = [] } = useProductList();

  // 1. Fetch B2B Business Customers Master
  const {
    data: customersData,
    isLoading: loadingCustomers,
    refetch: refetchCustomers,
    isFetching: fetchingCustomers,
  } = useQuery({
    queryKey: ["inventory-b2b-customers"],
    queryFn: async () => {
      const res = await api.get("/inventory/b2b-customers");
      return res.data?.customers || [];
    },
    staleTime: 1000 * 30,
  });
  const customers = useMemo(() => (Array.isArray(customersData) ? customersData : []), [customersData]);

  // 2. Fetch B2B Summary (Aggregated totals per B2B Business Customer)
  const {
    data: summaryData,
    isLoading: loadingSummary,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ["inventory-b2b-summary"],
    queryFn: async () => {
      const res = await api.get("/inventory/b2b-summary");
      return res.data?.customers || res.data?.clients || [];
    },
    staleTime: 1000 * 30,
  });
  const customerSummaries = useMemo(() => (Array.isArray(summaryData) ? summaryData : []), [summaryData]);

  // Combine customers with their aggregated stats
  const enrichedCustomers = useMemo(() => {
    const summaryMap = new Map();
    customerSummaries.forEach((s) => {
      if (s.id) summaryMap.set(s.id, s);
    });
    return customers.map((c) => {
      const sum = summaryMap.get(c.id) || {};
      return {
        ...c,
        total_outward: sum.total_outward || 0,
        total_return: sum.total_return || 0,
        net_quantity: sum.net_quantity || 0,
        transaction_count: sum.transaction_count || 0,
        last_transaction: sum.last_transaction || "—",
      };
    });
  }, [customers, customerSummaries]);

  // 3. Fetch B2B Sales (Outward dispatches to B2B Business Customers)
  const {
    data: salesData,
    isLoading: loadingSales,
    refetch: refetchSales,
    isFetching: fetchingSales,
  } = useQuery({
    queryKey: ["inventory-b2b-sales"],
    queryFn: async () => {
      const res = await api.get("/inventory/b2b-sales");
      return res.data?.sales || [];
    },
    staleTime: 1000 * 30,
  });
  const sales = useMemo(() => (Array.isArray(salesData) ? salesData : []), [salesData]);

  // 4. Fetch Ledger History for Selected Customer
  const {
    data: ledgerHistoryData,
    isLoading: loadingLedger,
    refetch: refetchLedger,
  } = useQuery({
    queryKey: ["inventory-b2b-client-history", selectedLedgerCustomerId],
    queryFn: async () => {
      if (!selectedLedgerCustomerId) return null;
      const res = await api.get(`/inventory/b2b-client-history/${selectedLedgerCustomerId}`);
      return res.data;
    },
    enabled: Boolean(selectedLedgerCustomerId),
  });
  const ledgerTransactions = ledgerHistoryData?.transactions || [];
  const ledgerCustomer = ledgerHistoryData?.customer || ledgerHistoryData?.client || enrichedCustomers.find((c) => c.id === selectedLedgerCustomerId);

  // Auto-select first customer for ledger if none selected
  useEffect(() => {
    if (!selectedLedgerCustomerId && enrichedCustomers.length > 0) {
      setSelectedLedgerCustomerId(enrichedCustomers[0].id);
    }
  }, [selectedLedgerCustomerId, enrichedCustomers]);

  // Filtered lists
  const activeSearch = (search || "").trim().toLowerCase();

  const filteredCustomers = useMemo(() => {
    if (!activeSearch) return enrichedCustomers;
    return enrichedCustomers.filter((c) =>
      (c.name || c.full_name || "").toLowerCase().includes(activeSearch) ||
      (c.contact_person || "").toLowerCase().includes(activeSearch) ||
      (c.mobile || "").toLowerCase().includes(activeSearch) ||
      (c.city || "").toLowerCase().includes(activeSearch) ||
      (c.gstin || "").toLowerCase().includes(activeSearch)
    );
  }, [enrichedCustomers, activeSearch]);

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

  // Aggregate stats across B2B
  const stats = useMemo(() => {
    let totUnits = 0;
    sales.forEach((s) => {
      totUnits += Number(s.quantity || 0);
    });
    let totOut = 0;
    let totRet = 0;
    enrichedCustomers.forEach((c) => {
      totOut += Number(c.total_outward || 0);
      totRet += Number(c.total_return || 0);
    });
    return {
      totalCustomers: enrichedCustomers.length,
      totalSalesCount: sales.length,
      totalUnits: Math.round(totUnits * 100) / 100,
      totalOutward: Math.round(totOut * 100) / 100,
      totalReturn: Math.round(totRet * 100) / 100,
      netSoldQuantity: Math.round((totOut - totRet) * 100) / 100,
    };
  }, [sales, enrichedCustomers]);

  // Handlers
  const handleOpenAddCustomer = () => {
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
    setAddCustomerOpen(true);
  };

  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    if (!customerForm.name?.trim()) {
      toast.error("Please enter Business Name");
      return;
    }
    if (!customerForm.mobile?.trim()) {
      toast.error("Please enter Mobile Number");
      return;
    }
    setSavingCustomer(true);
    try {
      await api.post("/inventory/b2b-customers", {
        name: customerForm.name.trim(),
        contact_person: customerForm.contact_person?.trim() || "",
        mobile: customerForm.mobile.trim(),
        alt_mobile: customerForm.alt_mobile?.trim() || "",
        email: customerForm.email?.trim() || "",
        gstin: customerForm.gstin?.trim() || "",
        address: customerForm.address?.trim() || "",
        city: customerForm.city?.trim() || "",
        state: customerForm.state?.trim() || "",
        notes: customerForm.notes?.trim() || "",
      });
      queryClient.invalidateQueries({ queryKey: ["inventory-b2b-customers"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-b2b-summary"] });
      await refetchCustomers();
      await refetchSummary();
      setAddCustomerOpen(false);
      toast.success(`B2B Business Customer "${customerForm.name}" created successfully`);
    } catch (err) {
      toast.error(formatApiError(err, "Failed to create B2B customer"));
    } finally {
      setSavingCustomer(false);
    }
  };

  const handleOpenEditCustomer = (cust, e) => {
    if (e) e.stopPropagation();
    setEditingCustomer(cust);
    setCustomerForm({
      name: cust.name || cust.full_name || "",
      contact_person: cust.contact_person === "—" ? "" : cust.contact_person || "",
      mobile: cust.mobile === "—" ? "" : cust.mobile || "",
      alt_mobile: cust.alt_mobile || "",
      email: cust.email === "—" ? "" : cust.email || "",
      gstin: cust.gstin === "—" ? "" : cust.gstin || "",
      address: cust.address || "",
      city: cust.city === "—" ? "" : cust.city || "",
      state: cust.state || "",
      notes: cust.notes || "",
    });
    setEditCustomerOpen(true);
  };

  const handleUpdateCustomer = async (e) => {
    e.preventDefault();
    if (!customerForm.name?.trim()) {
      toast.error("Please enter Business Name");
      return;
    }
    setUpdatingCustomer(true);
    try {
      await api.put(`/inventory/b2b-customers/${editingCustomer.id}`, {
        name: customerForm.name.trim(),
        contact_person: customerForm.contact_person?.trim() || "",
        mobile: customerForm.mobile?.trim() || "",
        alt_mobile: customerForm.alt_mobile?.trim() || "",
        email: customerForm.email?.trim() || "",
        gstin: customerForm.gstin?.trim() || "",
        address: customerForm.address?.trim() || "",
        city: customerForm.city?.trim() || "",
        state: customerForm.state?.trim() || "",
        notes: customerForm.notes?.trim() || "",
      });
      queryClient.invalidateQueries({ queryKey: ["inventory-b2b-customers"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-b2b-summary"] });
      await refetchCustomers();
      await refetchSummary();
      setEditCustomerOpen(false);
      toast.success(`B2B Business Customer "${customerForm.name}" updated successfully`);
    } catch (err) {
      toast.error(formatApiError(err, "Failed to update B2B customer"));
    } finally {
      setUpdatingCustomer(false);
    }
  };

  const handleOpenDeleteCustomer = (cust, e) => {
    if (e) e.stopPropagation();
    setCustomerToDelete(cust);
    setDeleteDialogOpen(true);
  };

  const handleDeleteCustomer = async () => {
    if (!customerToDelete) return;
    setIsDeleting(true);
    try {
      const res = await api.delete(`/inventory/b2b-customers/${customerToDelete.id}`);
      queryClient.invalidateQueries({ queryKey: ["inventory-b2b-customers"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-b2b-summary"] });
      await refetchCustomers();
      await refetchSummary();
      setDeleteDialogOpen(false);
      if (res.data?.archived) {
        toast.info(`Customer "${customerToDelete.name || customerToDelete.full_name}" has transactions and was safely archived.`);
      } else {
        toast.success(`Customer "${customerToDelete.name || customerToDelete.full_name}" deleted.`);
      }
    } catch (err) {
      toast.error(formatApiError(err, "Failed to delete customer"));
    } finally {
      setIsDeleting(false);
    }
  };

  // Open New Sale Modal
  const handleOpenNewSale = () => {
    // Generate suggested bill number if possible
    const existingNums = sales
      .map((s) => s.bill_number)
      .filter((b) => b && b.startsWith("B2B-"))
      .map((b) => parseInt(b.replace("B2B-", ""), 10))
      .filter((n) => !isNaN(n));
    const nextNum = existingNums.length ? Math.max(...existingNums) + 1 : sales.length + 1;
    const suggestedBill = `B2B-${String(nextNum).padStart(3, "0")}`;

    const defaultCust = enrichedCustomers.length > 0 ? enrichedCustomers[0] : null;

    setSaleForm({
      customer_id: defaultCust?.id || "",
      customer_name: defaultCust?.name || defaultCust?.full_name || "",
      bill_number: suggestedBill,
      date: dayjs().format("YYYY-MM-DD"),
      product: "",
      product_id: "",
      size: "",
      quantity: "",
      unit: "Nos",
      remarks: "",
    });
    setNewSaleOpen(true);
  };

  const handleSelectCustomerForSale = (customerId) => {
    const selected = enrichedCustomers.find((c) => c.id === customerId);
    if (selected) {
      setSaleForm((prev) => ({
        ...prev,
        customer_id: selected.id,
        customer_name: selected.name || selected.full_name,
      }));
    }
  };

  const handleCreateSale = async (e) => {
    e.preventDefault();
    if (!saleForm.customer_id || !saleForm.customer_name) {
      toast.error("Please select a B2B Business Customer");
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
      // Uses existing Outward transaction engine without duplicate engines
      const payload = {
        client_id: saleForm.customer_id,
        client_name: saleForm.customer_name,
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
        party_type: "B2B Customer",
      };

      await api.post("/inventory/outward", payload);

      queryClient.invalidateQueries({ queryKey: ["inventory-b2b-sales"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-b2b-summary"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-b2b-client-history", saleForm.customer_id] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });

      await refetchSales();
      await refetchSummary();
      setNewSaleOpen(false);
      toast.success(`B2B Sale "${billNo}" to ${saleForm.customer_name} recorded! Stock decreased.`);
    } catch (err) {
      toast.error(formatApiError(err, "Failed to record B2B sale"));
    } finally {
      setSavingSale(false);
    }
  };

  const openCustomerLedger = (cust, e) => {
    if (e) e.stopPropagation();
    setSelectedLedgerCustomerId(cust.id);
    setTab("ledger");
  };

  return (
    <div className="space-y-6" data-testid="b2b-page-container">
      {/* Page Header */}
      <PageHeader
        title="B2B Management"
        subtitle="Business-to-Business material sales, dealer dispatches & customer ledger."
        actions={
          <div className="flex items-center gap-2.5">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search business, phone, bill no..."
                className="pl-9 h-9 text-xs bg-white border-slate-200"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="b2b-search-input"
              />
            </div>
            {tab === "customers" ? (
              <Button
                onClick={handleOpenAddCustomer}
                data-testid="b2b-btn-add-customer"
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9 shadow-xs gap-1.5 shrink-0"
              >
                <Plus className="w-4 h-4" /> Add Business Customer
              </Button>
            ) : tab === "sales" ? (
              <Button
                onClick={handleOpenNewSale}
                data-testid="b2b-btn-new-sale"
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9 shadow-xs gap-1.5 shrink-0"
              >
                <Plus className="w-4 h-4" /> New B2B Sale
              </Button>
            ) : null}
          </div>
        }
      />

      {/* High-Level Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5" data-testid="b2b-stats-grid">
        <Card className="border-slate-200 shadow-2xs bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Business Customers</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{stats.totalCustomers}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Commercial dealers & firms</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-2xs bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">B2B Sales Recorded</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{stats.totalSalesCount}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Outward dispatches</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ShoppingCart className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-2xs bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Dispatched</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{stats.totalOutward.toLocaleString()}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Units moved outward</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <ArrowUpFromLine className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-2xs bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Net B2B Sold Qty</p>
              <h3 className="text-2xl font-bold text-blue-600 mt-1">{stats.netSoldQuantity.toLocaleString()}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Total sold minus returns</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tab Navigation Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="inline-flex items-center p-1 bg-slate-100 rounded-xl">
          <button
            type="button"
            onClick={() => setTab("customers")}
            data-testid="b2b-tab-customers"
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              tab === "customers"
                ? "bg-white text-blue-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Business Customers</span>
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 h-4 bg-slate-200/60 text-slate-700">
              {enrichedCustomers.length}
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => setTab("sales")}
            data-testid="b2b-tab-sales"
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              tab === "sales"
                ? "bg-white text-blue-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>B2B Sales</span>
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 h-4 bg-slate-200/60 text-slate-700">
              {sales.length}
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => setTab("ledger")}
            data-testid="b2b-tab-ledger"
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              tab === "ledger"
                ? "bg-white text-blue-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>B2B Ledger</span>
          </button>
        </div>

        <div className="text-[11px] text-slate-500 pr-3 hidden sm:flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
          <span>Independent B2B Master — Installation clients strictly segregated</span>
        </div>
      </div>

      {/* ============================================================== */}
      {/* TAB 1: BUSINESS CUSTOMERS MASTER                              */}
      {/* ============================================================== */}
      {tab === "customers" && (
        <Card className="border-slate-200 shadow-2xs bg-white overflow-hidden" data-testid="b2b-customers-panel">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-slate-900 text-sm">Business Customer Master</h4>
              <p className="text-xs text-slate-500 mt-0.5">Manage commercial business firms, dealers, and electrical contractors.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refetchCustomers();
                refetchSummary();
              }}
              className="text-xs h-8 gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${fetchingCustomers ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Business Name</th>
                  <th className="py-3 px-3">Contact Person & Phone</th>
                  <th className="py-3 px-3">City / State</th>
                  <th className="py-3 px-3">GSTIN</th>
                  <th className="py-3 px-3 text-right">Dispatched</th>
                  <th className="py-3 px-3 text-right">Returns</th>
                  <th className="py-3 px-3 text-right font-bold text-slate-900">Net Qty</th>
                  <th className="py-3 px-3 text-center">Last Tx</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadingCustomers ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      Loading B2B Business Customers...
                    </td>
                  </tr>
                ) : filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center">
                      <div className="max-w-xs mx-auto space-y-2">
                        <Building2 className="w-9 h-9 text-slate-300 mx-auto" />
                        <p className="font-medium text-slate-700">No Business Customers found</p>
                        <p className="text-xs text-slate-400">
                          {activeSearch
                            ? "Try adjusting your search criteria"
                            : "Add your first B2B Business Customer to start recording B2B material sales."}
                        </p>
                        {!activeSearch && (
                          <Button onClick={handleOpenAddCustomer} size="sm" className="mt-2 text-xs bg-blue-600 hover:bg-blue-700">
                            + Add Business Customer
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-blue-50/30 transition-colors cursor-pointer group"
                      onClick={(e) => openCustomerLedger(c, e)}
                      data-testid={`b2b-customer-row-${c.id}`}
                    >
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 font-bold text-xs">
                            {(c.name || c.full_name || "B")[0].toUpperCase()}
                          </div>
                          <div>
                            <span className="text-slate-900 font-semibold">{c.name || c.full_name}</span>
                            {c.notes && <p className="text-[10px] text-slate-400 truncate max-w-[200px]">{c.notes}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="text-slate-700 font-medium">{c.contact_person || "—"}</div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" /> {c.mobile || "—"}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-600">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          <span>{c.city || "—"}</span>
                          {c.state && <span className="text-slate-400">, {c.state}</span>}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-600 font-mono text-[11px]">
                        {c.gstin && c.gstin !== "—" ? (
                          <Badge variant="outline" className="bg-slate-50 text-slate-700 font-mono text-[10px]">
                            {c.gstin}
                          </Badge>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-medium text-amber-700">
                        {Number(c.total_outward || 0).toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right font-medium text-emerald-700">
                        {Number(c.total_return || 0) > 0 ? Number(c.total_return).toLocaleString() : "—"}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-blue-700">
                        {Number(c.net_quantity || 0).toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-center text-[11px] text-slate-500 whitespace-nowrap">
                        {c.last_transaction || "—"}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            onClick={(e) => openCustomerLedger(c, e)}
                            title="View Customer Ledger"
                            data-testid={`btn-ledger-${c.id}`}
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                            onClick={(e) => handleOpenEditCustomer(c, e)}
                            title="Edit Customer"
                            data-testid={`btn-edit-${c.id}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={(e) => handleOpenDeleteCustomer(c, e)}
                            title="Delete Customer"
                            data-testid={`btn-delete-${c.id}`}
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
      {/* TAB 2: B2B SALES ENTRIES (OUTWARDS)                           */}
      {/* ============================================================== */}
      {tab === "sales" && (
        <Card className="border-slate-200 shadow-2xs bg-white overflow-hidden" data-testid="b2b-sales-panel">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-slate-900 text-sm">B2B Material Sales</h4>
              <p className="text-xs text-slate-500 mt-0.5">Authoritative outward transactions to commercial customers.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchSales()}
              className="text-xs h-8 gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${fetchingSales ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-3">Bill / Ref No.</th>
                  <th className="py-3 px-4">B2B Business Customer</th>
                  <th className="py-3 px-4">Product</th>
                  <th className="py-3 px-3">Size / Spec</th>
                  <th className="py-3 px-3 text-right">Quantity</th>
                  <th className="py-3 px-3 text-center">Unit</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-4">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadingSales ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      Loading B2B Sales transactions...
                    </td>
                  </tr>
                ) : filteredSales.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center">
                      <div className="max-w-xs mx-auto space-y-2">
                        <ShoppingCart className="w-9 h-9 text-slate-300 mx-auto" />
                        <p className="font-medium text-slate-700">No B2B Sales recorded</p>
                        <p className="text-xs text-slate-400">
                          {activeSearch
                            ? "No sales match your search"
                            : "Click '+ New B2B Sale' to dispatch stock to a commercial customer."}
                        </p>
                        {!activeSearch && (
                          <Button onClick={handleOpenNewSale} size="sm" className="mt-2 text-xs bg-blue-600 hover:bg-blue-700">
                            + New B2B Sale
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredSales.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50 transition-colors" data-testid={`b2b-sale-row-${s.id}`}>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                        {s.date || "—"}
                      </td>
                      <td className="py-3 px-3 font-mono font-semibold text-blue-700">
                        {s.bill_number || s.reference_number || "—"}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span>{s.client_name || "—"}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800">
                        {s.product || "—"}
                      </td>
                      <td className="py-3 px-3 text-slate-600">
                        {s.size || "—"}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-slate-900">
                        {Number(s.quantity || 0).toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-center text-slate-500 font-mono text-[11px]">
                        {s.unit || "Nos"}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-semibold">
                          {s.status || "Dispatched"}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-slate-500 text-[11px] truncate max-w-[200px]">
                        {s.remarks || "—"}
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
      {/* TAB 3: B2B CUSTOMER LEDGER                                    */}
      {/* ============================================================== */}
      {tab === "ledger" && (
        <div className="space-y-4" data-testid="b2b-ledger-panel">
          {/* Customer Selection Banner */}
          <Card className="border-slate-200 shadow-2xs bg-white p-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block">
                  Select B2B Business Customer
                </label>
                <div className="w-full sm:w-80">
                  <Select
                    value={selectedLedgerCustomerId}
                    onValueChange={setSelectedLedgerCustomerId}
                    data-testid="b2b-ledger-customer-select"
                  >
                    <SelectTrigger className="h-9 text-xs bg-slate-50 border-slate-200">
                      <SelectValue placeholder="Choose a Business Customer..." />
                    </SelectTrigger>
                    <SelectContent>
                      {enrichedCustomers.map((c) => (
                        <SelectItem key={c.id} value={c.id} className="text-xs">
                          {c.name || c.full_name} {c.city ? `(${c.city})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {ledgerCustomer && (
                <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200/60 text-xs">
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Contact</span>
                    <span className="font-semibold text-slate-800">{ledgerCustomer.contact_person || "—"}</span>
                  </div>
                  <div className="h-6 w-px bg-slate-200" />
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Phone</span>
                    <span className="font-semibold text-slate-800">{ledgerCustomer.mobile || "—"}</span>
                  </div>
                  <div className="h-6 w-px bg-slate-200" />
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">GSTIN</span>
                    <span className="font-mono text-[11px] text-slate-700">{ledgerCustomer.gstin || "—"}</span>
                  </div>
                  <div className="h-6 w-px bg-slate-200" />
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Net Outward Balance</span>
                    <span className="font-bold text-blue-700 text-sm">
                      {Number(ledgerCustomer.net_quantity || 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Ledger Transactions Table */}
          <Card className="border-slate-200 shadow-2xs bg-white overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-slate-900 text-sm">
                  Transaction Ledger: {ledgerCustomer ? ledgerCustomer.name || ledgerCustomer.full_name : "Customer"}
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">Authoritative sales outward dispatches and inward customer returns.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchLedger()}
                disabled={!selectedLedgerCustomerId}
                className="text-xs h-8 gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingLedger ? "animate-spin" : ""}`} /> Refresh Ledger
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-3">Bill / Ref No.</th>
                    <th className="py-3 px-3 text-center">Type</th>
                    <th className="py-3 px-4">Product Name</th>
                    <th className="py-3 px-3">Size / Spec</th>
                    <th className="py-3 px-3 text-right">Quantity</th>
                    <th className="py-3 px-3 text-center">Unit</th>
                    <th className="py-3 px-4">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingLedger ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        Loading transaction ledger...
                      </td>
                    </tr>
                  ) : ledgerTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        No transactions recorded for this B2B Business Customer yet.
                      </td>
                    </tr>
                  ) : (
                    ledgerTransactions.map((tx) => {
                      const isReturn = tx.type === "INWARD_RETURN" || tx.type === "Return" || String(tx.label || "").toLowerCase().includes("return");
                      return (
                        <tr key={tx.id || Math.random()} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                            {tx.date || "—"}
                          </td>
                          <td className="py-3 px-3 font-mono font-semibold text-blue-700">
                            {tx.bill_number || tx.reference_number || "—"}
                          </td>
                          <td className="py-3 px-3 text-center">
                            {isReturn ? (
                              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-semibold gap-1">
                                <ArrowDownToLine className="w-2.5 h-2.5" /> Return
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] font-semibold gap-1">
                                <ArrowUpFromLine className="w-2.5 h-2.5" /> Sale
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-800">
                            {tx.product || "—"}
                          </td>
                          <td className="py-3 px-3 text-slate-600">
                            {tx.size || "—"}
                          </td>
                          <td className={`py-3 px-3 text-right font-bold ${isReturn ? "text-emerald-700" : "text-slate-900"}`}>
                            {isReturn ? `-${Number(tx.quantity || 0).toLocaleString()}` : `+${Number(tx.quantity || 0).toLocaleString()}`}
                          </td>
                          <td className="py-3 px-3 text-center text-slate-500 font-mono text-[11px]">
                            {tx.unit || "Nos"}
                          </td>
                          <td className="py-3 px-4 text-slate-500 text-[11px] truncate max-w-[220px]">
                            {tx.remarks || "—"}
                          </td>
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

      {/* ============================================================== */}
      {/* MODAL 1: ADD BUSINESS CUSTOMER                                */}
      {/* ============================================================== */}
      <Dialog open={addCustomerOpen} onOpenChange={setAddCustomerOpen}>
        <DialogContent className="max-w-lg" data-testid="modal-add-b2b-customer">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Building2 className="w-5 h-5 text-blue-600" />
              <span>Add B2B Business Customer</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Create a dedicated B2B Business Customer master. This customer is strictly isolated from solar installation clients.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateCustomer} className="space-y-3.5 py-1">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Business Name <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="e.g. ABC Industries, NIKI FABRIC, ARVIND MILL"
                value={customerForm.name}
                onChange={(e) => setCustomerForm((p) => ({ ...p, name: e.target.value }))}
                required
                className="text-xs bg-white"
                data-testid="input-customer-name"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Contact Person</label>
                <Input
                  placeholder="Manager / Owner Name"
                  value={customerForm.contact_person}
                  onChange={(e) => setCustomerForm((p) => ({ ...p, contact_person: e.target.value }))}
                  className="text-xs bg-white"
                  data-testid="input-customer-contact"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Mobile Number <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="10-digit mobile"
                  value={customerForm.mobile}
                  onChange={(e) => setCustomerForm((p) => ({ ...p, mobile: e.target.value }))}
                  required
                  className="text-xs bg-white"
                  data-testid="input-customer-mobile"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Email Address</label>
                <Input
                  placeholder="business@example.com"
                  type="email"
                  value={customerForm.email}
                  onChange={(e) => setCustomerForm((p) => ({ ...p, email: e.target.value }))}
                  className="text-xs bg-white"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">GSTIN / Tax Details</label>
                <Input
                  placeholder="27AAAAA0000A1Z5"
                  value={customerForm.gstin}
                  onChange={(e) => setCustomerForm((p) => ({ ...p, gstin: e.target.value.toUpperCase() }))}
                  className="text-xs bg-white font-mono"
                  data-testid="input-customer-gstin"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">City</label>
                <Input
                  placeholder="e.g. Surat, Mumbai"
                  value={customerForm.city}
                  onChange={(e) => setCustomerForm((p) => ({ ...p, city: e.target.value }))}
                  className="text-xs bg-white"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">State</label>
                <Input
                  placeholder="e.g. Gujarat, Maharashtra"
                  value={customerForm.state}
                  onChange={(e) => setCustomerForm((p) => ({ ...p, state: e.target.value }))}
                  className="text-xs bg-white"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Address</label>
              <Input
                placeholder="Factory / Office Address"
                value={customerForm.address}
                onChange={(e) => setCustomerForm((p) => ({ ...p, address: e.target.value }))}
                className="text-xs bg-white"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Notes / Terms</label>
              <Input
                placeholder="Optional dealer remarks or payment terms"
                value={customerForm.notes}
                onChange={(e) => setCustomerForm((p) => ({ ...p, notes: e.target.value }))}
                className="text-xs bg-white"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAddCustomerOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={savingCustomer}
                className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
                data-testid="btn-submit-add-customer"
              >
                {savingCustomer ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Save Business Customer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ============================================================== */}
      {/* MODAL 2: EDIT BUSINESS CUSTOMER                               */}
      {/* ============================================================== */}
      <Dialog open={editCustomerOpen} onOpenChange={setEditCustomerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Pencil className="w-5 h-5 text-blue-600" />
              <span>Edit B2B Business Customer</span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleUpdateCustomer} className="space-y-3.5 py-1">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Business Name *</label>
              <Input
                value={customerForm.name}
                onChange={(e) => setCustomerForm((p) => ({ ...p, name: e.target.value }))}
                required
                className="text-xs bg-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Contact Person</label>
                <Input
                  value={customerForm.contact_person}
                  onChange={(e) => setCustomerForm((p) => ({ ...p, contact_person: e.target.value }))}
                  className="text-xs bg-white"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Mobile Number *</label>
                <Input
                  value={customerForm.mobile}
                  onChange={(e) => setCustomerForm((p) => ({ ...p, mobile: e.target.value }))}
                  required
                  className="text-xs bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Email Address</label>
                <Input
                  type="email"
                  value={customerForm.email}
                  onChange={(e) => setCustomerForm((p) => ({ ...p, email: e.target.value }))}
                  className="text-xs bg-white"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">GSTIN</label>
                <Input
                  value={customerForm.gstin}
                  onChange={(e) => setCustomerForm((p) => ({ ...p, gstin: e.target.value.toUpperCase() }))}
                  className="text-xs bg-white font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">City</label>
                <Input
                  value={customerForm.city}
                  onChange={(e) => setCustomerForm((p) => ({ ...p, city: e.target.value }))}
                  className="text-xs bg-white"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">State</label>
                <Input
                  value={customerForm.state}
                  onChange={(e) => setCustomerForm((p) => ({ ...p, state: e.target.value }))}
                  className="text-xs bg-white"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Address</label>
              <Input
                value={customerForm.address}
                onChange={(e) => setCustomerForm((p) => ({ ...p, address: e.target.value }))}
                className="text-xs bg-white"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditCustomerOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={updatingCustomer} className="bg-blue-600 hover:bg-blue-700 text-white">
                {updatingCustomer ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ============================================================== */}
      {/* MODAL 3: DELETE CONFIRMATION                                  */}
      {/* ============================================================== */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <span>Delete B2B Business Customer</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 pt-1">
              Are you sure you want to delete{" "}
              <strong className="text-slate-800">
                "{customerToDelete?.name || customerToDelete?.full_name}"
              </strong>
              ? If the customer has existing transactions, they will be safely archived without deleting historical transactions.
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
              onClick={handleDeleteCustomer}
              className="gap-1.5"
            >
              {isDeleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Confirm Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================== */}
      {/* MODAL 4: NEW B2B SALE                                         */}
      {/* ============================================================== */}
      <Dialog open={newSaleOpen} onOpenChange={setNewSaleOpen}>
        <DialogContent className="max-w-lg" data-testid="modal-new-b2b-sale">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <ShoppingCart className="w-5 h-5 text-blue-600" />
              <span>Record New B2B Sale</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Dispatches materials to a B2B Business Customer. Stocks will decrease automatically in inventory.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSale} className="space-y-3.5 py-1">
            {/* Dedicated B2B Business Customer Selector (STRICT SEPARATION) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700">
                  B2B Business Customer <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setNewSaleOpen(false);
                    handleOpenAddCustomer();
                  }}
                  className="text-[11px] text-blue-600 hover:text-blue-700 font-semibold"
                >
                  + Add New Customer
                </button>
              </div>

              {enrichedCustomers.length === 0 ? (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 space-y-1.5">
                  <p className="font-semibold">No B2B Business Customers available</p>
                  <p className="text-[11px]">
                    B2B is strictly separated from CRM installation clients. Please add a B2B Business Customer first.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs bg-white text-amber-900 border-amber-300"
                    onClick={() => {
                      setNewSaleOpen(false);
                      handleOpenAddCustomer();
                    }}
                  >
                    + Add Business Customer
                  </Button>
                </div>
              ) : (
                <Select
                  value={saleForm.customer_id}
                  onValueChange={handleSelectCustomerForSale}
                  data-testid="select-b2b-customer"
                >
                  <SelectTrigger className="h-9 text-xs bg-white border-slate-200" data-testid="b2b-customer-dropdown-trigger">
                    <SelectValue placeholder="Select B2B Business Customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {enrichedCustomers.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs" data-testid={`option-b2b-customer-${c.id}`}>
                        <span className="font-semibold text-slate-900">{c.name || c.full_name}</span>
                        {c.city ? ` — ${c.city}` : ""}
                        {c.gstin && c.gstin !== "—" ? ` [${c.gstin}]` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-[10px] text-slate-400 mt-1">
                Only commercial B2B Business Customers appear here. Solar installation / CRM clients are strictly excluded.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Bill / Invoice No. <span className="text-red-500">*</span>
                </label>
                <Input
                  value={saleForm.bill_number}
                  onChange={(e) => setSaleForm((p) => ({ ...p, bill_number: e.target.value }))}
                  required
                  placeholder="e.g. B2B-001"
                  className="text-xs bg-white font-mono"
                  data-testid="input-b2b-bill-no"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Date <span className="text-red-500">*</span>
                </label>
                <Input
                  type="date"
                  value={saleForm.date}
                  onChange={(e) => setSaleForm((p) => ({ ...p, date: e.target.value }))}
                  required
                  className="text-xs bg-white"
                  data-testid="input-b2b-sale-date"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Product <span className="text-red-500">*</span>
              </label>
              <ProductAutocompleteInput
                value={saleForm.product}
                onChange={(val) => setSaleForm((p) => ({ ...p, product: val }))}
                onSelectProduct={(prod) => {
                  setSaleForm((p) => ({
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
                data-testid="input-b2b-product"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Size / Spec</label>
                <Input
                  value={saleForm.size}
                  onChange={(e) => setSaleForm((p) => ({ ...p, size: e.target.value }))}
                  placeholder="e.g. 540W, 25*8"
                  className="text-xs bg-white"
                  data-testid="input-b2b-size"
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
                  value={saleForm.quantity}
                  onChange={(e) => setSaleForm((p) => ({ ...p, quantity: e.target.value }))}
                  required
                  placeholder="Qty"
                  className="text-xs bg-white"
                  data-testid="input-b2b-quantity"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Unit</label>
                <Select
                  value={saleForm.unit}
                  onValueChange={(val) => setSaleForm((p) => ({ ...p, unit: val }))}
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
                value={saleForm.remarks}
                onChange={(e) => setSaleForm((p) => ({ ...p, remarks: e.target.value }))}
                placeholder="Optional delivery details or PO notes"
                className="text-xs bg-white"
                data-testid="input-b2b-remarks"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setNewSaleOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={savingSale || enrichedCustomers.length === 0}
                className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
                data-testid="btn-submit-b2b-sale"
              >
                {savingSale ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Save B2B Sale
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
