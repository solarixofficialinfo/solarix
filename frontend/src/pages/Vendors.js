import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError } from "../lib/api";
import {
  Truck, Plus, Search, Building2, Phone, Mail, FileText, ShoppingBag,
  RefreshCw, ChevronRight, User, ArrowLeft, DollarSign, Package, Calendar,
  CreditCard, CheckCircle2, Clock, Upload, X, ShieldCheck, Layers, FileCheck
} from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { toast } from "sonner";

export default function Vendors() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedVendorId, setSelectedVendorId] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  // Modals state
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const [billDialogOpen, setBillDialogOpen] = useState(false);
  const [inwardDialogOpen, setInwardDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [activeBill, setActiveBill] = useState(null);

  // Vendor Form state
  const [vendorForm, setVendorForm] = useState({
    name: "", contact_person: "", phone: "", email: "", gstin: "",
    address: "", category: "Modules / Panels", products_supplied: "", payment_terms: "Net 30", notes: ""
  });

  // Purchase Bill Form state
  const [billForm, setBillForm] = useState({
    bill_number: "", bill_date: new Date().toISOString().split("T")[0], due_date: "",
    po_reference: "", payment_terms: "Net 30", notes: "", attachment_url: "", project_id: "",
    items: [{ product_name: "Solar Module 550Wp", quantity: "100", unit: "Nos", rate: "10000", gst_rate: "12", amount: 1000000 }],
    subtotal: 1000000, gst_total: 120000, freight_charges: "0", transport_charges: "0", other_charges: "0", grand_total: 1120000
  });

  // Material Inward Form state
  const [inwardForm, setInwardForm] = useState({
    bill_id: "", challan_number: "", challan_date: new Date().toISOString().split("T")[0],
    received_by: "", warehouse_id: "Main Warehouse", project_id: "", attachment_url: "",
    items: []
  });

  // Payment Form state
  const [paymentForm, setPaymentForm] = useState({
    bill_id: "", bill_number: "", amount: "", payment_method: "Bank Transfer", ref_number: "",
    payment_date: new Date().toISOString().split("T")[0], notes: ""
  });

  // Fetch Vendor List
  const { data: vendorsData, isLoading: loadingVendors, refetch: refetchVendors } = useQuery({
    queryKey: ["vendors"],
    queryFn: async () => {
      const res = await api.get("/vendors");
      return res.data?.vendors || (Array.isArray(res.data) ? res.data : []);
    }
  });

  // Fetch Vendor Detail when selected
  const { data: vendorDetailData, isLoading: loadingDetail, refetch: refetchDetail } = useQuery({
    queryKey: ["vendors", selectedVendorId],
    queryFn: async () => {
      if (!selectedVendorId) return null;
      const res = await api.get(`/vendors/${selectedVendorId}`);
      return res.data;
    },
    enabled: !!selectedVendorId
  });

  // Fetch Projects List for allocation dropdown
  const { data: clientsList = [] } = useQuery({
    queryKey: ["clients", "list"],
    queryFn: async () => {
      const res = await api.get("/clients");
      return res.data || [];
    }
  });

  // Mutations
  const createVendorMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.post("/vendors", payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success("Vendor created successfully");
      queryClient.invalidateQueries(["vendors"]);
      setVendorDialogOpen(false);
      setVendorForm({ name: "", contact_person: "", phone: "", email: "", gstin: "", address: "", category: "Modules / Panels", products_supplied: "", payment_terms: "Net 30", notes: "" });
    },
    onError: (err) => toast.error(formatApiError(err))
  });

  const toggleVendorStatusMutation = useMutation({
    mutationFn: async ({ vendorId, status }) => {
      const res = await api.patch(`/vendors/${vendorId}/status`, { status });
      return res.data;
    },
    onSuccess: () => {
      toast.success("Vendor status updated");
      queryClient.invalidateQueries(["vendors"]);
      if (selectedVendorId) queryClient.invalidateQueries(["vendors", selectedVendorId]);
    },
    onError: (err) => toast.error(formatApiError(err))
  });

  const createBillMutation = useMutation({
    mutationFn: async ({ vendorId, payload }) => {
      const res = await api.post(`/vendors/${vendorId}/purchase-bills`, payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success("Purchase Bill saved successfully");
      queryClient.invalidateQueries(["vendors"]);
      if (selectedVendorId) queryClient.invalidateQueries(["vendors", selectedVendorId]);
      setBillDialogOpen(false);
    },
    onError: (err) => toast.error(formatApiError(err))
  });

  const createInwardMutation = useMutation({
    mutationFn: async ({ billId, payload }) => {
      const res = await api.post(`/purchase-bills/${billId}/inward`, payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success("Material Inward confirmed & inventory updated!");
      queryClient.invalidateQueries(["vendors"]);
      if (selectedVendorId) queryClient.invalidateQueries(["vendors", selectedVendorId]);
      setInwardDialogOpen(false);
    },
    onError: (err) => toast.error(formatApiError(err))
  });

  const createPaymentMutation = useMutation({
    mutationFn: async ({ vendorId, payload }) => {
      const res = await api.post(`/vendors/${vendorId}/payments`, payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success("Vendor payment recorded successfully");
      queryClient.invalidateQueries(["vendors"]);
      if (selectedVendorId) queryClient.invalidateQueries(["vendors", selectedVendorId]);
      setPaymentDialogOpen(false);
    },
    onError: (err) => toast.error(formatApiError(err))
  });

  const rawVendorsList = Array.isArray(vendorsData)
    ? vendorsData
    : (vendorsData?.vendors && Array.isArray(vendorsData.vendors) ? vendorsData.vendors : []);

  const vendors = rawVendorsList.filter((v) =>
    (v.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (v.contact_person || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (v.gstin || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (v.category || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatLakhs = (amt) => {
    const val = Number(amt || 0);
    if (val >= 100000) {
      return `₹${(val / 100000).toFixed(2)}L`;
    }
    return `₹${val.toLocaleString("en-IN")}`;
  };

  const recalcBillTotals = (items, freight = 0, transport = 0, other = 0) => {
    let sub = 0;
    let gst = 0;
    items.forEach((item) => {
      const q = Number(item.quantity || 0);
      const r = Number(item.rate || 0);
      const g = Number(item.gst_rate || 0);
      const amt = q * r;
      item.amount = amt;
      sub += amt;
      gst += amt * (g / 100);
    });
    const grand = sub + gst + Number(freight || 0) + Number(transport || 0) + Number(other || 0);
    setBillForm((prev) => ({
      ...prev,
      items,
      subtotal: sub,
      gst_total: gst,
      grand_total: grand
    }));
  };

  const handleOpenAddBill = (vId) => {
    const v = vendors.find((x) => x.id === vId) || vendorDetailData?.vendor;
    setBillForm({
      bill_number: `VRL/${Math.floor(100 + Math.random() * 900)}`,
      bill_date: new Date().toISOString().split("T")[0],
      due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      po_reference: "",
      payment_terms: v?.payment_terms || "Net 30",
      notes: "",
      attachment_url: "",
      project_id: "",
      items: [
        { product_name: "Solar Module 550Wp", quantity: "100", unit: "Nos", rate: "10000", gst_rate: "12", amount: 1000000 }
      ],
      subtotal: 1000000,
      gst_total: 120000,
      freight_charges: "0",
      transport_charges: "0",
      other_charges: "0",
      grand_total: 1120000
    });
    setBillDialogOpen(true);
  };

  const handleOpenInwardModal = (bill) => {
    setActiveBill(bill);
    const inwardItems = (bill.items || []).map((item) => {
      const tot = Number(item.quantity || 0);
      const prevRec = Number(item.received_qty || 0);
      const rem = Math.max(0, tot - prevRec);
      return {
        product_name: item.product_name,
        bill_qty: tot,
        previously_received: prevRec,
        received_now: String(rem > 0 ? (rem > 60 ? 60 : rem) : 0),
        remaining_qty: rem,
        destination: "Main Warehouse",
        project_id: "",
        unit: item.unit || "Nos"
      };
    });
    setInwardForm({
      bill_id: bill.id,
      challan_number: `INW-${Math.floor(1000 + Math.random() * 9000)}`,
      challan_date: new Date().toISOString().split("T")[0],
      received_by: "Store Executive",
      warehouse_id: "Main Warehouse",
      project_id: bill.project_id || "",
      attachment_url: "",
      items: inwardItems
    });
    setInwardDialogOpen(true);
  };

  const handleOpenPaymentModal = (bill = null) => {
    setActiveBill(bill);
    const outstanding = bill ? Math.max(0, Number(bill.grand_total || 0) - Number(bill.paid_amount || 0)) : (vendorDetailData?.summary?.total_outstanding || 0);
    setPaymentForm({
      bill_id: bill ? bill.id : "",
      bill_number: bill ? bill.bill_number : "",
      amount: String(outstanding),
      payment_method: "Bank Transfer",
      ref_number: `PAY-${Math.floor(100 + Math.random() * 900)}`,
      payment_date: new Date().toISOString().split("T")[0],
      notes: bill ? `Payment against Bill #${bill.bill_number}` : "Vendor payment"
    });
    setPaymentDialogOpen(true);
  };

  // ──────────────────────────────────────────────────────────────────────────
  // VIEW MODE 1: VENDOR DIRECTORY LIST
  // ──────────────────────────────────────────────────────────────────────────
  if (!selectedVendorId) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2" style={{ fontFamily: "Outfit" }}>
              <Truck className="w-7 h-7 text-indigo-600" /> Vendor Management & Procurement History
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Supplier directory, Purchase Bills, Material Inward Receipts (GRN), and Vendor Ledger balances.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetchVendors()} className="gap-2 text-xs">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </Button>
            <Button onClick={() => setVendorDialogOpen(true)} size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5 text-xs font-semibold">
              <Plus className="w-4 h-4" /> Add Vendor
            </Button>
          </div>
        </div>

        {/* Search Toolbar */}
        <Card className="border-slate-200 shadow-2xs">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <Input
                placeholder="Search vendors by name, GSTIN, category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 text-xs h-9"
              />
            </div>
            <div className="text-xs text-slate-500 font-semibold">
              Total Vendors: {vendors.length}
            </div>
          </CardContent>
        </Card>

        {/* Simple & Clean Vendor Cards */}
        {loadingVendors ? (
          <div className="p-8 text-center text-xs text-slate-400 italic">Loading vendor directory...</div>
        ) : vendors.length === 0 ? (
          <Card className="border-slate-200 p-8 text-center text-slate-500 text-xs bg-white">
            No vendors found. Click <strong>"+ Add Vendor"</strong> to register a supplier.
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {vendors.map((v) => (
              <Card key={v.id} className="border-slate-200 shadow-2xs hover:shadow-xs transition card-lift bg-white">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-base text-slate-900 leading-tight">{v.name}</h3>
                      <Badge variant="outline" className="text-[10px] mt-1 bg-indigo-50 text-indigo-700 font-medium border-indigo-200">
                        {v.category || "Modules / Panels"}
                      </Badge>
                    </div>
                    <Building2 className="w-5 h-5 text-slate-400 shrink-0" />
                  </div>

                  <div className="space-y-1 text-xs text-slate-600 border-t border-b border-slate-100 py-2.5">
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>Contact: <strong>{v.contact_person || "—"}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>Phone: {v.phone || "—"}</span>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-[11px]">
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      <span>GSTIN: {v.gstin || "Unregistered"}</span>
                    </div>
                  </div>

                  {/* Financial Summary on Card */}
                  <div className="grid grid-cols-3 gap-1 bg-slate-50 p-2 rounded-lg font-mono text-xs text-center border border-slate-100">
                    <div>
                      <div className="text-[9px] text-slate-400 font-sans uppercase font-bold">Purchase</div>
                      <div className="font-bold text-slate-900 text-xs">{formatLakhs(v.total_purchases)}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-emerald-600 font-sans uppercase font-bold">Paid</div>
                      <div className="font-bold text-emerald-700 text-xs">{formatLakhs(v.total_paid)}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-amber-600 font-sans uppercase font-bold">Outstanding</div>
                      <div className="font-bold text-amber-700 text-xs">{formatLakhs(v.total_outstanding)}</div>
                    </div>
                  </div>

                  <div className="pt-1 text-right">
                    <Button
                      size="sm"
                      onClick={() => {
                        setSelectedVendorId(v.id);
                        setActiveTab("overview");
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold gap-1 w-full justify-between"
                    >
                      <span>View Vendor</span>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Add Vendor Dialog */}
        {vendorDialogOpen && (
          <Dialog open onOpenChange={setVendorDialogOpen}>
            <DialogContent className="max-w-md rounded-xl p-5">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold text-base">
                  <Truck className="w-5 h-5 text-indigo-600" /> Add New Vendor
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-3 py-2 text-xs">
                <div>
                  <Label className="text-xs font-semibold">Vendor Name *</Label>
                  <Input
                    value={vendorForm.name}
                    onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })}
                    placeholder="e.g. VRL Logistics / Rayzon Solar"
                    className="mt-1 text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs font-semibold">Category</Label>
                    <Select
                      value={vendorForm.category}
                      onValueChange={(v) => setVendorForm({ ...vendorForm, category: v })}
                    >
                      <SelectTrigger className="mt-1 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Modules / Panels">Modules / Panels</SelectItem>
                        <SelectItem value="Inverters">Inverters</SelectItem>
                        <SelectItem value="Structures & Mounting">Structures & Mounting</SelectItem>
                        <SelectItem value="Electrical & Cables">Electrical & Cables</SelectItem>
                        <SelectItem value="General Supplier">General Supplier</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">Contact Person</Label>
                    <Input
                      value={vendorForm.contact_person}
                      onChange={(e) => setVendorForm({ ...vendorForm, contact_person: e.target.value })}
                      placeholder="Representative Name"
                      className="mt-1 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs font-semibold">Phone</Label>
                    <Input
                      value={vendorForm.phone}
                      onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })}
                      placeholder="Mobile No."
                      className="mt-1 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">GSTIN</Label>
                    <Input
                      value={vendorForm.gstin}
                      onChange={(e) => setVendorForm({ ...vendorForm, gstin: e.target.value })}
                      placeholder="27AAAAA0000A1Z5"
                      className="mt-1 text-xs font-mono uppercase"
                    />
                  </div>
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button variant="outline" size="sm" onClick={() => setVendorDialogOpen(false)}>Cancel</Button>
                <Button
                  size="sm"
                  onClick={() => createVendorMutation.mutate(vendorForm)}
                  disabled={createVendorMutation.isPending}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs"
                >
                  {createVendorMutation.isPending ? "Saving..." : "Save Vendor"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // VIEW MODE 2: VENDOR DETAIL VIEW (Selected Vendor)
  // ──────────────────────────────────────────────────────────────────────────
  const vendor = vendorDetailData?.vendor || {};
  const summary = vendorDetailData?.summary || { total_purchases: 0, total_paid: 0, total_outstanding: 0 };
  const bills = vendorDetailData?.purchase_bills || [];
  const inwards = vendorDetailData?.inwards || [];
  const payments = vendorDetailData?.payments || [];
  const activity = vendorDetailData?.activity || [];
  const isInactive = vendor.status === "Inactive";

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Navigation & Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <button
            onClick={() => setSelectedVendorId(null)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 mb-2 font-medium"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to All Vendors
          </button>

          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Outfit" }}>
              {vendor.name}
            </h1>
            <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200 text-xs font-semibold">
              {vendor.category || "Modules / Panels"}
            </Badge>
          </div>

          <div className="text-xs text-slate-600 mt-1 space-x-3 font-mono">
            <span>GSTIN: <strong>{vendor.gstin || "N/A"}</strong></span>
            <span>·</span>
            <span>Phone: <strong>{vendor.phone || "N/A"}</strong></span>
            <span>·</span>
            <span>Email: <strong>{vendor.email || "N/A"}</strong></span>
          </div>

          <div className="flex items-center gap-3 mt-2 text-xs">
            <span className="flex items-center gap-1.5 font-semibold text-slate-700">
              Vendor Status:{" "}
              <span className={isInactive ? "text-rose-600 font-bold" : "text-emerald-600 font-bold"}>
                ● {vendor.status || "Active"}
              </span>
            </span>
            <Button
              size="xs"
              variant="outline"
              onClick={() => toggleVendorStatusMutation.mutate({ vendorId: selectedVendorId, status: isInactive ? "Active" : "Inactive" })}
              className="text-[11px] h-6 border-slate-300"
            >
              {isInactive ? "Mark as Active" : "Mark as Inactive"}
            </Button>
          </div>
        </div>

        {/* Action Buttons: + Purchase Bill, + Material Inward, + Payment */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={() => handleOpenAddBill(selectedVendorId)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold gap-1.5 shadow-2xs"
          >
            <Plus className="w-4 h-4" /> + Purchase Bill
          </Button>
          <Button
            size="sm"
            onClick={() => {
              if (bills.length === 0) {
                toast.error("Create a Purchase Bill first before receiving material!");
                handleOpenAddBill(selectedVendorId);
              } else {
                handleOpenInwardModal(bills[0]);
              }
            }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold gap-1.5 shadow-2xs"
          >
            <Plus className="w-4 h-4" /> + Material Inward
          </Button>
          <Button
            size="sm"
            onClick={() => handleOpenPaymentModal(bills[0] || null)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold gap-1.5 shadow-2xs"
          >
            <Plus className="w-4 h-4" /> + Payment
          </Button>
        </div>
      </div>

      {/* Small Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-4 space-y-1">
            <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Purchases</div>
            <div className="text-2xl font-bold text-slate-900 font-mono">
              {formatLakhs(summary.total_purchases)}
            </div>
            <div className="text-[11px] text-slate-400">Exact: ₹{summary.total_purchases.toLocaleString("en-IN")}</div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-emerald-50/40">
          <CardContent className="p-4 space-y-1">
            <div className="text-xs text-emerald-700 font-semibold uppercase tracking-wider">Paid</div>
            <div className="text-2xl font-bold text-emerald-800 font-mono">
              {formatLakhs(summary.total_paid)}
            </div>
            <div className="text-[11px] text-emerald-600">Exact: ₹{summary.total_paid.toLocaleString("en-IN")}</div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-amber-50/40">
          <CardContent className="p-4 space-y-1">
            <div className="text-xs text-amber-700 font-semibold uppercase tracking-wider">Outstanding</div>
            <div className="text-2xl font-bold text-amber-800 font-mono">
              {formatLakhs(summary.total_outstanding)}
            </div>
            <div className="text-[11px] text-amber-700 font-medium">Exact: ₹{summary.total_outstanding.toLocaleString("en-IN")}</div>
          </CardContent>
        </Card>
      </div>

      {/* 4 Clean Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-white border border-slate-200 p-1">
          <TabsTrigger value="overview" className="text-xs font-semibold px-4 py-2">Overview</TabsTrigger>
          <TabsTrigger value="bills" className="text-xs font-semibold px-4 py-2">Purchase Bills ({bills.length})</TabsTrigger>
          <TabsTrigger value="inward" className="text-xs font-semibold px-4 py-2">Material Inward ({inwards.length})</TabsTrigger>
          <TabsTrigger value="payments" className="text-xs font-semibold px-4 py-2">Payments ({payments.length})</TabsTrigger>
          <TabsTrigger value="ledger" className="text-xs font-semibold px-4 py-2">Ledger</TabsTrigger>
        </TabsList>

        {/* TAB 1: OVERVIEW & RECENT ACTIVITY */}
        <TabsContent value="overview" className="space-y-4">
          <Card className="border-slate-200">
            <CardContent className="p-5 space-y-4">
              <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2">Activity</h3>
              {activity.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs italic">
                  No activity recorded for this vendor yet. Click <strong>"+ Purchase Bill"</strong> to log your first supplier bill.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b">
                      <tr>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5">Type</th>
                        <th className="p-2.5">Reference</th>
                        <th className="p-2.5 text-right">Amount</th>
                        <th className="p-2.5 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {activity.map((act) => (
                        <tr key={act.id} className="hover:bg-slate-50">
                          <td className="p-2.5 font-medium whitespace-nowrap">{act.date}</td>
                          <td className="p-2.5 font-semibold text-slate-800">{act.type}</td>
                          <td className="p-2.5 font-bold text-indigo-600">{act.reference}</td>
                          <td className="p-2.5 text-right font-bold text-slate-900">
                            {act.amount !== null && act.amount !== undefined ? `₹${act.amount.toLocaleString("en-IN")}` : "—"}
                          </td>
                          <td className="p-2.5 text-center">
                            <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-700">
                              {act.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: PURCHASE BILLS */}
        <TabsContent value="bills" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-sm text-slate-900">Supplier Invoices & Purchase Bills</h3>
            <Button size="sm" onClick={() => handleOpenAddBill(selectedVendorId)} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1 font-semibold">
              <Plus className="w-3.5 h-3.5" /> + Purchase Bill
            </Button>
          </div>

          {bills.length === 0 ? (
            <Card className="border-slate-200 p-8 text-center text-slate-400 text-xs">
              No purchase bills recorded for this vendor.
            </Card>
          ) : (
            <div className="space-y-3">
              {bills.map((bill) => (
                <Card key={bill.id} className="border-slate-200 shadow-2xs hover:border-indigo-200 transition">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                      <div>
                        <div className="font-bold text-base text-slate-900 flex items-center gap-2">
                          <span>Bill #{bill.bill_number}</span>
                          <Badge variant="outline" className="text-[10px] bg-indigo-50 text-indigo-700">
                            {bill.inward_status || "Bill Created"}
                          </Badge>
                          <Badge variant="outline" className={bill.status === "Paid" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}>
                            {bill.status || "Unpaid"}
                          </Badge>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Bill Date: {bill.bill_date} · Due Date: {bill.due_date || "N/A"} · PO Ref: {bill.po_reference || "None"}{(bill.challan_number || bill.challan_no || bill.reference_number) ? ` · Challan No: ${bill.challan_number || bill.challan_no || bill.reference_number}` : ""}
                        </div>
                      </div>
                      <div className="font-mono text-right">
                        <div className="text-[10px] text-slate-400 font-sans uppercase">Grand Total</div>
                        <div className="text-lg font-bold text-slate-900">₹{Number(bill.grand_total || 0).toLocaleString("en-IN")}</div>
                      </div>
                    </div>

                    {/* Items breakdown */}
                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-xs space-y-1.5 font-mono">
                      <div className="font-sans text-[10px] text-slate-500 font-bold uppercase tracking-wider">Line Items</div>
                      {(bill.items || []).map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center text-slate-700">
                          <div>
                            <strong className="text-slate-900">{item.product_name}</strong> (Qty: {item.quantity} {item.unit || "Nos"} @ ₹{item.rate})
                          </div>
                          <div>
                            Received: <span className="font-bold text-emerald-700">{item.received_qty || 0}</span> / {item.quantity}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Action buttons on Bill */}
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => handleOpenInwardModal(bill)}
                        className="text-xs border-emerald-300 text-emerald-800 hover:bg-emerald-50 gap-1 font-semibold"
                      >
                        <Package className="w-3.5 h-3.5 text-emerald-600" /> Receive Material
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => handleOpenPaymentModal(bill)}
                        className="text-xs border-blue-300 text-blue-800 hover:bg-blue-50 gap-1 font-semibold"
                      >
                        <CreditCard className="w-3.5 h-3.5 text-blue-600" /> Record Payment
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* TAB 3: MATERIAL INWARD (GRNs) */}
        <TabsContent value="inward" className="space-y-4">
          <h3 className="font-bold text-sm text-slate-900">Material Receipts & Goods Received Notes (GRN)</h3>
          {inwards.length === 0 ? (
            <Card className="border-slate-200 p-8 text-center text-slate-400 text-xs">
              No material receipt challans logged yet. Click <strong>"Receive Material"</strong> on a purchase bill to record inward stock.
            </Card>
          ) : (
            <div className="space-y-3">
              {inwards.map((inw) => (
                <Card key={inw.id} className="border-slate-200 shadow-2xs">
                  <CardContent className="p-4 space-y-2 text-xs font-mono">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <div>
                        <span className="font-bold text-sm text-slate-900 font-sans">Challan #{inw.challan_number}</span>
                        <span className="ml-2 text-slate-500 font-normal">(Bill #{inw.bill_number || "Direct"})</span>
                      </div>
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700">Received {inw.challan_date}</Badge>
                    </div>
                    <div className="text-slate-600 font-sans">
                      Received By: <strong>{inw.received_by || "Storekeeper"}</strong> · Destination: <strong>{inw.warehouse_id || "Main Warehouse"}</strong>
                    </div>
                    <div className="bg-slate-50 p-2 rounded border border-slate-100">
                      {(inw.items || []).map((item, i) => (
                        <div key={i} className="flex justify-between items-center text-slate-800">
                          <span>{item.product_name}</span>
                          <span className="font-bold text-emerald-700">+{item.received_now} {item.unit || "Nos"} (Dest: {item.destination || "Warehouse"})</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* TAB 4: PAYMENTS */}
        <TabsContent value="payments" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-sm text-slate-900">Vendor Payment Ledger</h3>
            <Button size="sm" onClick={() => handleOpenPaymentModal(bills[0] || null)} className="bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1 font-semibold">
              <Plus className="w-3.5 h-3.5" /> + Payment
            </Button>
          </div>

          {payments.length === 0 ? (
            <Card className="border-slate-200 p-8 text-center text-slate-400 text-xs">
              No payments recorded for this vendor.
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b">
                  <tr>
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5">Method</th>
                    <th className="p-2.5">Transaction / Ref</th>
                    <th className="p-2.5">Bill Ref</th>
                    <th className="p-2.5 text-right">Amount Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="p-2.5 font-medium whitespace-nowrap">{p.payment_date}</td>
                      <td className="p-2.5 font-semibold text-slate-800">{p.payment_method}</td>
                      <td className="p-2.5 text-indigo-600">{p.ref_number || "—"}</td>
                      <td className="p-2.5 text-slate-600">{p.bill_number ? `Bill #${p.bill_number}` : "General"}</td>
                      <td className="p-2.5 text-right font-bold text-emerald-700">
                        ₹{Number(p.amount || 0).toLocaleString("en-IN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* TAB 5: LEDGER */}
        <TabsContent value="ledger" className="space-y-4">
          <Card className="border-slate-200">
            <CardContent className="p-5 space-y-4">
              <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2">Accounting Ledger</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-600 font-semibold">
                    <tr>
                      <th className="p-2.5">Date</th>
                      <th className="p-2.5">Transaction</th>
                      <th className="p-2.5">Ref No.</th>
                      <th className="p-2.5 text-right">Billed (Debit)</th>
                      <th className="p-2.5 text-right">Paid (Credit)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {activity.map((act) => (
                      <tr key={act.id} className="hover:bg-slate-50">
                        <td className="p-2.5 font-medium">{act.date}</td>
                        <td className="p-2.5 font-semibold">{act.type}</td>
                        <td className="p-2.5 text-slate-600">{act.reference}</td>
                        <td className="p-2.5 text-right font-bold text-slate-900">
                          {act.type === "Purchase Bill" ? `₹${Number(act.amount).toLocaleString("en-IN")}` : "—"}
                        </td>
                        <td className="p-2.5 text-right font-bold text-emerald-700">
                          {act.type === "Payment" ? `₹${Number(act.amount).toLocaleString("en-IN")}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─── MODAL 1: CREATE PURCHASE BILL DIALOG ──────────────────────────── */}
      {billDialogOpen && (
        <Dialog open onOpenChange={setBillDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl p-5">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold text-base">
                <FileCheck className="w-5 h-5 text-indigo-600" /> Create Purchase Bill — {vendor.name}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs font-semibold">Vendor</Label>
                  <Input value={vendor.name} disabled className="mt-1 text-xs bg-slate-100 font-semibold" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Bill No. *</Label>
                  <Input
                    value={billForm.bill_number}
                    onChange={(e) => setBillForm({ ...billForm, bill_number: e.target.value })}
                    placeholder="e.g. VRL/245"
                    className="mt-1 text-xs font-mono font-bold text-blue-600"
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">PO / Reference (Optional)</Label>
                  <Input
                    value={billForm.po_reference}
                    onChange={(e) => setBillForm({ ...billForm, po_reference: e.target.value })}
                    placeholder="PO-8821"
                    className="mt-1 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold">Bill Date *</Label>
                  <Input
                    type="date"
                    value={billForm.bill_date}
                    onChange={(e) => setBillForm({ ...billForm, bill_date: e.target.value })}
                    className="mt-1 text-xs"
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Due Date</Label>
                  <Input
                    type="date"
                    value={billForm.due_date}
                    onChange={(e) => setBillForm({ ...billForm, due_date: e.target.value })}
                    className="mt-1 text-xs"
                  />
                </div>
              </div>

              {/* Items Table */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-slate-800 uppercase tracking-wider">Line Items</Label>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => {
                      const newItems = [
                        ...billForm.items,
                        { product_name: "Solar Structure", quantity: "1", unit: "Sets", rate: "15000", gst_rate: "18", amount: 15000 }
                      ];
                      recalcBillTotals(newItems, billForm.freight_charges, billForm.transport_charges, billForm.other_charges);
                    }}
                    className="text-xs border-indigo-300 text-indigo-700"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Item
                  </Button>
                </div>

                <div className="space-y-2">
                  {billForm.items.map((item, idx) => (
                    <div key={idx} className="bg-slate-50 p-3 rounded-lg border border-slate-200 grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-4">
                        <Label className="text-[10px] font-semibold text-slate-500">Product Name</Label>
                        <Input
                          value={item.product_name}
                          onChange={(e) => {
                            const newItems = [...billForm.items];
                            newItems[idx].product_name = e.target.value;
                            recalcBillTotals(newItems, billForm.freight_charges, billForm.transport_charges, billForm.other_charges);
                          }}
                          placeholder="e.g. Solar Module 550Wp"
                          className="h-8 text-xs bg-white font-semibold"
                        />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-[10px] font-semibold text-slate-500">Qty</Label>
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => {
                            const newItems = [...billForm.items];
                            newItems[idx].quantity = e.target.value;
                            recalcBillTotals(newItems, billForm.freight_charges, billForm.transport_charges, billForm.other_charges);
                          }}
                          className="h-8 text-xs bg-white font-mono"
                        />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-[10px] font-semibold text-slate-500">Rate (₹)</Label>
                        <Input
                          type="number"
                          value={item.rate}
                          onChange={(e) => {
                            const newItems = [...billForm.items];
                            newItems[idx].rate = e.target.value;
                            recalcBillTotals(newItems, billForm.freight_charges, billForm.transport_charges, billForm.other_charges);
                          }}
                          className="h-8 text-xs bg-white font-mono"
                        />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-[10px] font-semibold text-slate-500">GST %</Label>
                        <Input
                          type="number"
                          value={item.gst_rate}
                          onChange={(e) => {
                            const newItems = [...billForm.items];
                            newItems[idx].gst_rate = e.target.value;
                            recalcBillTotals(newItems, billForm.freight_charges, billForm.transport_charges, billForm.other_charges);
                          }}
                          className="h-8 text-xs bg-white font-mono"
                        />
                      </div>
                      <div className="col-span-2 text-right pt-3 font-mono font-bold text-slate-900 text-xs">
                        ₹{Number(item.amount || 0).toLocaleString("en-IN")}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bill Totals Summary */}
              <div className="bg-slate-100 p-3 rounded-lg border border-slate-300 space-y-1 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="font-sans text-slate-600">Subtotal:</span>
                  <span>₹{billForm.subtotal.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-slate-600">GST Total:</span>
                  <span>₹{billForm.gst_total.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200 text-sm font-bold text-slate-900">
                  <span className="font-sans">Grand Total:</span>
                  <span className="text-indigo-700">₹{billForm.grand_total.toLocaleString("en-IN")}</span>
                </div>
              </div>

              {/* Optional Project Allocation */}
              <div>
                <Label className="text-xs font-semibold">Optional Project Allocation</Label>
                <Select
                  value={billForm.project_id}
                  onValueChange={(v) => setBillForm({ ...billForm, project_id: v })}
                >
                  <SelectTrigger className="mt-1 text-xs"><SelectValue placeholder="Allocate directly to a Project (Optional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Main Warehouse / General Stock</SelectItem>
                    {clientsList.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.full_name} ({c.sol_id || c.system_kw + " kW"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button variant="outline" size="sm" onClick={() => setBillDialogOpen(false)}>Cancel</Button>
              <Button
                size="sm"
                onClick={() => createBillMutation.mutate({ vendorId: selectedVendorId, payload: billForm })}
                disabled={createBillMutation.isPending}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs"
              >
                {createBillMutation.isPending ? "Saving..." : "Save Purchase Bill"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ─── MODAL 2: RECEIVE MATERIAL (INWARD / GRN) DIALOG ────────────────── */}
      {inwardDialogOpen && activeBill && (
        <Dialog open onOpenChange={setInwardDialogOpen}>
          <DialogContent className="max-w-2xl rounded-xl p-5">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold text-base">
                <Package className="w-5 h-5 text-emerald-600" /> New Material Inward — Bill #{activeBill.bill_number}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold">Challan / GRN No. *</Label>
                  <Input
                    value={inwardForm.challan_number}
                    onChange={(e) => setInwardForm({ ...inwardForm, challan_number: e.target.value })}
                    placeholder="VRL-CH-125"
                    className="mt-1 text-xs font-mono font-bold text-emerald-700"
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Challan Date *</Label>
                  <Input
                    type="date"
                    value={inwardForm.challan_date}
                    onChange={(e) => setInwardForm({ ...inwardForm, challan_date: e.target.value })}
                    className="mt-1 text-xs"
                    required
                  />
                </div>
              </div>

              {/* Items Received Now input table */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <Label className="text-xs font-bold text-slate-800 uppercase tracking-wider">Item Receipt & Destination Allocation</Label>
                <div className="space-y-2">
                  {inwardForm.items.map((item, idx) => (
                    <div key={idx} className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
                      <div className="flex justify-between items-center font-semibold text-slate-900">
                        <span>{item.product_name}</span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          Bill Qty: {item.bill_qty} · Prev: {item.previously_received} · Remaining: <strong className="text-amber-700">{item.remaining_qty}</strong>
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] font-semibold text-slate-500">Received Now Qty *</Label>
                          <Input
                            type="number"
                            value={item.received_now}
                            onChange={(e) => {
                              const newItems = [...inwardForm.items];
                              newItems[idx].received_now = e.target.value;
                              setInwardForm({ ...inwardForm, items: newItems });
                            }}
                            placeholder="60"
                            className="h-8 text-xs bg-white font-mono font-bold text-emerald-700"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] font-semibold text-slate-500">Destination</Label>
                          <Select
                            value={item.destination}
                            onValueChange={(v) => {
                              const newItems = [...inwardForm.items];
                              newItems[idx].destination = v;
                              setInwardForm({ ...inwardForm, items: newItems });
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs bg-white"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Main Warehouse">Main Warehouse</SelectItem>
                              {clientsList.map((c) => (
                                <SelectItem key={c.id} value={`Project: ${c.full_name}`}>
                                  {c.full_name} ({c.sol_id || "Project"})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button variant="outline" size="sm" onClick={() => setInwardDialogOpen(false)}>Cancel</Button>
              <Button
                size="sm"
                onClick={() => createInwardMutation.mutate({ billId: activeBill.id, payload: inwardForm })}
                disabled={createInwardMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs"
              >
                {createInwardMutation.isPending ? "Confirming..." : "Confirm Inward"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ─── MODAL 3: RECORD PAYMENT DIALOG ─────────────────────────────────── */}
      {paymentDialogOpen && (
        <Dialog open onOpenChange={setPaymentDialogOpen}>
          <DialogContent className="max-w-md rounded-xl p-5">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold text-base">
                <CreditCard className="w-5 h-5 text-blue-600" /> Record Vendor Payment
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              {activeBill && (
                <div className="bg-blue-50 p-2.5 rounded-lg border border-blue-200 font-mono text-xs flex justify-between">
                  <div>
                    <div className="text-[10px] text-blue-600 font-sans">Bill #{activeBill.bill_number}</div>
                    <div className="font-bold text-slate-900">Grand Total: ₹{Number(activeBill.grand_total || 0).toLocaleString("en-IN")}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-blue-600 font-sans">Paid Previously</div>
                    <div className="font-bold text-emerald-700">₹{Number(activeBill.paid_amount || 0).toLocaleString("en-IN")}</div>
                  </div>
                </div>
              )}

              <div>
                <Label className="text-xs font-semibold">Payment Amount (₹) *</Label>
                <Input
                  type="number"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  placeholder="150000"
                  className="mt-1 h-9 text-sm font-bold font-mono text-emerald-700"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-semibold">Payment Method</Label>
                  <Select
                    value={paymentForm.payment_method}
                    onValueChange={(v) => setPaymentForm({ ...paymentForm, payment_method: v })}
                  >
                    <SelectTrigger className="mt-1 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                      <SelectItem value="UPI">UPI</SelectItem>
                      <SelectItem value="Cheque">Cheque</SelectItem>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Online">Online</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold">Payment Date</Label>
                  <Input
                    type="date"
                    value={paymentForm.payment_date}
                    onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                    className="mt-1 text-xs"
                    required
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold">Transaction / UTR / Cheque Ref</Label>
                <Input
                  value={paymentForm.ref_number}
                  onChange={(e) => setPaymentForm({ ...paymentForm, ref_number: e.target.value })}
                  placeholder="e.g. PAY-501 / UTR8812903"
                  className="mt-1 text-xs font-mono"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Notes / Remarks</Label>
                <Input
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  placeholder="Payment remarks"
                  className="mt-1 text-xs"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button variant="outline" size="sm" onClick={() => setPaymentDialogOpen(false)}>Cancel</Button>
              <Button
                size="sm"
                onClick={() => createPaymentMutation.mutate({ vendorId: selectedVendorId || activeBill?.vendor_id, payload: paymentForm })}
                disabled={createPaymentMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs"
              >
                {createPaymentMutation.isPending ? "Saving..." : "Save Payment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
