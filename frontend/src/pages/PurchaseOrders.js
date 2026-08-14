import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError, fileUrl } from "../lib/api";
import PortalCombobox from "../components/PortalCombobox";
import { ProductAutocompleteInput, UNIT_OPTIONS } from "../components/Inventory/_shared";
import {
  FileText, Plus, Search, ArrowLeft, Download, Trash2, Pencil, Save,
  Truck, Building2, Package, Eye, UserPlus, Edit3, Check
} from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { toast } from "sonner";
import dayjs from "dayjs";

const createEmptyPoItem = () => ({
  id: `po_item_${Math.random().toString(36).substr(2, 9)}`,
  product_name: "",
  size: "",
  quantity: "",
  unit: "Nos",
  unit_price: "",
  amount: 0
});

const generateDefaultPoNumber = () => {
  return `PO${dayjs().format("YY")}-${dayjs().format("MMM").toUpperCase()}${Math.floor(100 + Math.random() * 900)}`;
};

export default function PurchaseOrders() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState("list"); // "list" | "form"
  const [searchTerm, setSearchTerm] = useState("");
  const [editingPoId, setEditingPoId] = useState(null);

  // New Vendor Modal State
  const [newVendorModalOpen, setNewVendorModalOpen] = useState(false);
  const [newVendorForm, setNewVendorForm] = useState({
    name: "",
    address: "",
    gstin: "",
    phone: "",
    email: "",
    notes: ""
  });

  // Edit Vendor Modal State
  const [editVendorModalOpen, setEditVendorModalOpen] = useState(false);
  const [editVendorForm, setEditVendorForm] = useState({
    id: "",
    name: "",
    address: "",
    gstin: "",
    phone: "",
    email: "",
    notes: ""
  });

  // Form State
  const [saveVendorMaster, setSaveVendorMaster] = useState(false);
  const [poForm, setPoForm] = useState({
    id: "",
    po_number: generateDefaultPoNumber(),
    po_date: dayjs().format("YYYY-MM-DD"),
    vendor_id: "",
    vendor_name: "",
    vendor_address: "",
    vendor_phone: "",
    vendor_email: "",
    vendor_gstin: "",
    ship_via: "FOR",
    shipping_method: "PAID",
    shipping_term: "DOOR DELIVERY",
    delivery_date: dayjs().add(14, "day").format("YYYY-MM-DD"),
    items: [createEmptyPoItem()],
    notes: "DELIVERY WILL BE F.O.R. ON-SITE\nLOCATION OF SITE WILL BE PROVIDED AT THE TIME OF DISPATCH",
    cgst_rate: "2.5",
    sgst_rate: "2.5",
    igst_rate: "0",
    freight: "0",
    status: "Created"
  });

  // ── Fetch Master Vendors ───────────────────────────────────────────────
  const { data: vendorsData, refetch: refetchVendors } = useQuery({
    queryKey: ["vendors"],
    queryFn: async () => {
      const res = await api.get("/vendors");
      return res.data?.vendors || (Array.isArray(res.data) ? res.data : []);
    }
  });
  const vendors = useMemo(() => {
    if (Array.isArray(vendorsData)) return vendorsData;
    if (vendorsData?.vendors && Array.isArray(vendorsData.vendors)) return vendorsData.vendors;
    return [];
  }, [vendorsData]);

  // ── Fetch Master Products ──────────────────────────────────────────────
  const { data: productsData } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const res = await api.get("/inventory/products");
      return res.data?.products || (Array.isArray(res.data) ? res.data : []);
    }
  });
  const products = useMemo(() => {
    if (Array.isArray(productsData)) return productsData;
    if (productsData?.products && Array.isArray(productsData.products)) return productsData.products;
    return [];
  }, [productsData]);

  // ── Fetch Company Profile ──────────────────────────────────────────────
  const { data: company = {} } = useQuery({
    queryKey: ["company"],
    queryFn: async () => {
      const res = await api.get("/company");
      return res.data || {};
    }
  });

  // ── Fetch Purchase Orders List ─────────────────────────────────────────
  const { data: poResponse, refetch: refetchPoList, isLoading: loadingPo } = useQuery({
    queryKey: ["purchase_orders"],
    queryFn: async () => {
      const res = await api.get("/purchase-orders");
      return res.data?.purchase_orders || [];
    }
  });
  const poListData = useMemo(() => (Array.isArray(poResponse) ? poResponse : []), [poResponse]);

  // Options for Vendor PortalCombobox
  const vendorOptions = useMemo(() => {
    if (!Array.isArray(vendors)) return [];
    return vendors.map((v) => ({
      label: v.name || v.vendor_name || String(v),
      value: v.id || v.name,
      subtext: `GSTIN: ${v.gstin || "N/A"} · ${v.phone || "No Phone"}`,
      raw: v
    }));
  }, [vendors]);

  // Handle Vendor Selection (Auto-populates Vendor Master fields)
  const handleSelectVendor = (vId) => {
    let matched = null;
    if (typeof vId === "object" && vId !== null) {
      matched = vId;
    } else {
      const searchVal = String(vId || "").trim().toLowerCase();
      matched = vendors.find(
        (x) =>
          (x.id && String(x.id).toLowerCase() === searchVal) ||
          (x.name && String(x.name).toLowerCase() === searchVal) ||
          (x.vendor_name && String(x.vendor_name).toLowerCase() === searchVal)
      );
    }

    if (matched) {
      setPoForm((prev) => ({
        ...prev,
        vendor_id: matched.id || String(vId),
        vendor_name: matched.name || matched.vendor_name || String(vId),
        vendor_address: matched.address || matched.address_line_1 || matched.vendor_address || "",
        vendor_phone: matched.phone || matched.contact_person_phone || matched.mobile || matched.phone_number || "",
        vendor_email: matched.email || matched.vendor_email || "",
        vendor_gstin: matched.gstin || matched.gst_number || matched.vendor_gstin || ""
      }));
    } else {
      setPoForm((prev) => ({
        ...prev,
        vendor_name: typeof vId === "string" ? vId : prev.vendor_name,
        vendor_id: typeof vId === "string" ? vId : prev.vendor_id
      }));
    }
  };

  // Create New Vendor Mutation
  const createVendorMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.post("/vendors", payload);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success("New vendor saved to Vendor Master!");
      refetchVendors();
      const newV = data.vendor || {};
      if (newV.id) {
        setPoForm((prev) => ({
          ...prev,
          vendor_id: newV.id,
          vendor_name: newV.name || prev.vendor_name,
          vendor_address: newV.address || "",
          vendor_phone: newV.phone || "",
          vendor_email: newV.email || "",
          vendor_gstin: newV.gstin || ""
        }));
      }
      setNewVendorModalOpen(false);
      setNewVendorForm({ name: "", address: "", gstin: "", phone: "", email: "", notes: "" });
    },
    onError: (err) => toast.error(formatApiError(err))
  });

  // Edit Vendor Mutation
  const updateVendorMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.put(`/vendors/${payload.id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success("Vendor Master updated!");
      refetchVendors();
      setPoForm((prev) => ({
        ...prev,
        vendor_name: editVendorForm.name,
        vendor_address: editVendorForm.address,
        vendor_phone: editVendorForm.phone,
        vendor_email: editVendorForm.email,
        vendor_gstin: editVendorForm.gstin
      }));
      setEditVendorModalOpen(false);
    },
    onError: (err) => toast.error(formatApiError(err))
  });

  // Line Item Calculations
  const updateItem = (idx, field, val) => {
    const newItems = [...poForm.items];
    newItems[idx] = { ...newItems[idx], [field]: val };

    if (field === "product_name") {
      let pName = "";
      if (typeof val === "object" && val !== null) {
        pName = (val.name || "").toUpperCase();
        newItems[idx].size = val.size || newItems[idx].size;
        newItems[idx].unit = val.unit || newItems[idx].unit || "Nos";
        if (val.selling_price || val.rate) {
          newItems[idx].unit_price = String(val.selling_price || val.rate);
        }
      } else {
        pName = String(val || "").toUpperCase();
        const matched = products.find((p) => (p.name || "").toUpperCase() === pName);
        if (matched) {
          newItems[idx].size = matched.size || newItems[idx].size;
          newItems[idx].unit = matched.unit || newItems[idx].unit || "Nos";
          if (matched.selling_price || matched.rate) {
            newItems[idx].unit_price = String(matched.selling_price || matched.rate);
          }
        }
      }
      newItems[idx].product_name = pName;
    }

    const q = Number(newItems[idx].quantity || 0);
    const r = Number(newItems[idx].unit_price || 0);
    newItems[idx].amount = q * r;

    setPoForm((prev) => ({ ...prev, items: newItems }));
  };

  const addItem = () => {
    setPoForm((prev) => ({ ...prev, items: [...prev.items, createEmptyPoItem()] }));
  };

  const removeItem = (idx) => {
    if (poForm.items.length === 1) {
      toast.error("Purchase Order must contain at least one line item");
      return;
    }
    setPoForm((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
  };

  // Calculations Summary
  const subtotal = useMemo(() => {
    return poForm.items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  }, [poForm.items]);

  const cgstAmount = useMemo(() => {
    const rate = Number(poForm.cgst_rate || 0);
    return subtotal * (rate / 100);
  }, [subtotal, poForm.cgst_rate]);

  const sgstAmount = useMemo(() => {
    const rate = Number(poForm.sgst_rate || 0);
    return subtotal * (rate / 100);
  }, [subtotal, poForm.sgst_rate]);

  const igstAmount = useMemo(() => {
    const rate = Number(poForm.igst_rate || 0);
    return subtotal * (rate / 100);
  }, [subtotal, poForm.igst_rate]);

  const grandTotal = useMemo(() => {
    return subtotal + cgstAmount + sgstAmount + igstAmount + Number(poForm.freight || 0);
  }, [subtotal, cgstAmount, sgstAmount, igstAmount, poForm.freight]);

  // Save Purchase Order Mutation
  const savePoMutation = useMutation({
    mutationFn: async () => {
      if (!poForm.vendor_name?.trim()) {
        throw new Error("Vendor name is required");
      }
      if (!poForm.po_number?.trim()) {
        throw new Error("PO number is required");
      }
      const validItems = poForm.items.filter((i) => i.product_name?.trim());
      if (validItems.length === 0) {
        throw new Error("At least one product item with a valid name is required");
      }

      const payload = {
        ...poForm,
        save_vendor_master: saveVendorMaster,
        subtotal,
        grand_total: grandTotal,
        items: validItems
      };
      const res = await api.post("/purchase-orders", payload);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success("Purchase Order saved to database successfully!");
      refetchPoList();
      refetchVendors();
      setViewMode("list");
    },
    onError: (err) => toast.error(formatApiError(err))
  });

  // Generate PO PDF Mutation
  const generatePoMutation = useMutation({
    mutationFn: async (format = "pdf") => {
      if (!poForm.vendor_name?.trim()) {
        throw new Error("Vendor name is required");
      }
      const validItems = poForm.items.filter((i) => i.product_name?.trim());
      if (validItems.length === 0) {
        throw new Error("At least one item is required");
      }

      const payload = {
        doc_type: "purchase_order",
        format: format,
        doc_data: {
          po_number: poForm.po_number,
          document_number: poForm.po_number,
          document_date: poForm.po_date,
          vendor_id: poForm.vendor_id,
          ship_via: poForm.ship_via,
          shipping_method: poForm.shipping_method,
          shipping_term: poForm.shipping_term,
          delivery_date: poForm.delivery_date,
          prepared_by: company.owner_name || company.company_name || "Manager",
          vendor: {
            name: poForm.vendor_name,
            address: poForm.vendor_address,
            phone: poForm.vendor_phone,
            email: poForm.vendor_email,
            gstin: poForm.vendor_gstin
          },
          items: validItems.map((i) => ({
            product_name: i.product_name,
            product: i.product_name,
            size: i.size || "",
            quantity: Number(i.quantity || 0),
            unit: i.unit || "Nos",
            unit_price: Number(i.unit_price || 0),
            rate: Number(i.unit_price || 0),
            amount: Number(i.amount || 0)
          })),
          notes: poForm.notes,
          cgst_rate: poForm.cgst_rate,
          sgst_rate: poForm.sgst_rate,
          igst_rate: poForm.igst_rate,
          freight: poForm.freight,
          subtotal,
          grand_total: grandTotal
        }
      };
      const res = await api.post("/documents/generate", payload);
      return { data: res.data, format };
    },
    onSuccess: ({ data, format }) => {
      const isDocx = format === "docx";
      const fmtLabel = isDocx ? "Word document" : "PDF";
      toast.success(`Purchase Order ${fmtLabel} generated!`);
      const fileId = data?.id || data?.file_id;
      const filename = data?.filename || (isDocx ? "PurchaseOrder.docx" : "PurchaseOrder.pdf");
      if (fileId) {
        if (isDocx) {
          const a = document.createElement("a");
          a.href = `${fileUrl(fileId)}&download=1`;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else {
          const win = window.open(fileUrl(fileId), "_blank");
          if (!win || win.closed || typeof win.closed === "undefined") {
            const a = document.createElement("a");
            a.href = fileUrl(fileId);
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }
        }
      } else {
        toast.error("Failed to retrieve document file ID");
      }
      refetchPoList();
    },
    onError: (err) => toast.error(formatApiError(err))
  });

  // Direct PDF Generation helper for saved POs
  const generatePdfForPo = async (po) => {
    try {
      toast.info("Generating Purchase Order PDF...");
      const payload = {
        doc_type: "purchase_order",
        format: "pdf",
        doc_data: {
          po_number: po.po_number || po.id,
          document_number: po.po_number || po.id,
          document_date: po.po_date || dayjs().format("YYYY-MM-DD"),
          vendor_id: po.vendor_id,
          ship_via: po.ship_via,
          shipping_method: po.shipping_method,
          shipping_term: po.shipping_term,
          delivery_date: po.delivery_date,
          prepared_by: company.owner_name || company.company_name || "Manager",
          vendor: {
            name: po.vendor_name,
            address: po.vendor_address,
            phone: po.vendor_phone,
            email: po.vendor_email,
            gstin: po.vendor_gstin
          },
          items: (po.items || []).map((i) => ({
            product_name: i.product_name || i.product || "",
            product: i.product_name || i.product || "",
            size: i.size || "",
            quantity: Number(i.quantity || 0),
            unit: i.unit || "Nos",
            unit_price: Number(i.unit_price || i.rate || 0),
            rate: Number(i.unit_price || i.rate || 0),
            amount: Number(i.amount || 0)
          })),
          notes: po.notes,
          cgst_rate: po.cgst_rate || "2.5",
          sgst_rate: po.sgst_rate || "2.5",
          igst_rate: po.igst_rate || "0",
          freight: po.freight || "0",
          subtotal: po.subtotal,
          grand_total: po.grand_total
        }
      };
      const res = await api.post("/documents/generate", payload);
      const fileId = res.data?.id || res.data?.file_id;
      if (fileId) {
        toast.success("Purchase Order PDF generated!");
        const win = window.open(fileUrl(fileId), "_blank");
        if (!win || win.closed || typeof win.closed === "undefined") {
          const a = document.createElement("a");
          a.href = fileUrl(fileId);
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      } else {
        toast.error("Failed to retrieve generated PDF ID");
      }
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  // Direct Word (.docx) Generation helper for saved POs
  const generateWordForPo = async (po) => {
    try {
      toast.info("Generating Purchase Order Word document...");
      const payload = {
        doc_type: "purchase_order",
        format: "docx",
        doc_data: {
          po_number: po.po_number || po.id,
          document_number: po.po_number || po.id,
          document_date: po.po_date || dayjs().format("YYYY-MM-DD"),
          vendor_id: po.vendor_id,
          ship_via: po.ship_via,
          shipping_method: po.shipping_method,
          shipping_term: po.shipping_term,
          delivery_date: po.delivery_date,
          prepared_by: company.owner_name || company.company_name || "Manager",
          vendor: {
            name: po.vendor_name,
            address: po.vendor_address,
            phone: po.vendor_phone,
            email: po.vendor_email,
            gstin: po.vendor_gstin
          },
          items: (po.items || []).map((i) => ({
            product_name: i.product_name || i.product || "",
            product: i.product_name || i.product || "",
            size: i.size || "",
            quantity: Number(i.quantity || 0),
            unit: i.unit || "Nos",
            unit_price: Number(i.unit_price || i.rate || 0),
            rate: Number(i.unit_price || i.rate || 0),
            amount: Number(i.amount || 0)
          })),
          notes: po.notes,
          cgst_rate: po.cgst_rate || "2.5",
          sgst_rate: po.sgst_rate || "2.5",
          igst_rate: po.igst_rate || "0",
          freight: po.freight || "0",
          subtotal: po.subtotal,
          grand_total: po.grand_total
        }
      };
      const res = await api.post("/documents/generate", payload);
      const fileId = res.data?.id || res.data?.file_id;
      if (fileId) {
        toast.success("Purchase Order Word document generated!");
        window.open(fileUrl(fileId), "_blank");
      } else {
        toast.error("Failed to retrieve generated Word document ID");
      }
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  // Filter Purchase Orders
  const filteredPos = useMemo(() => {
    if (!searchTerm) return poListData;
    const s = searchTerm.toLowerCase();
    return poListData.filter((po) =>
      (po.po_number || "").toLowerCase().includes(s) ||
      (po.vendor_name || "").toLowerCase().includes(s) ||
      (po.items || []).some((i) => (i.product_name || i.product || "").toLowerCase().includes(s))
    );
  }, [poListData, searchTerm]);

  const startCreatePo = () => {
    setPoForm({
      id: "",
      po_number: generateDefaultPoNumber(),
      po_date: dayjs().format("YYYY-MM-DD"),
      vendor_id: "",
      vendor_name: "",
      vendor_address: "",
      vendor_phone: "",
      vendor_email: "",
      vendor_gstin: "",
      ship_via: "FOR",
      shipping_method: "PAID",
      shipping_term: "DOOR DELIVERY",
      delivery_date: dayjs().add(14, "day").format("YYYY-MM-DD"),
      items: [createEmptyPoItem()],
      notes: "DELIVERY WILL BE F.O.R. ON-SITE\nLOCATION OF SITE WILL BE PROVIDED AT THE TIME OF DISPATCH",
      cgst_rate: "2.5",
      sgst_rate: "2.5",
      igst_rate: "0",
      freight: "0",
      status: "Created"
    });
    setSaveVendorMaster(false);
    setEditingPoId(null);
    setViewMode("form");
  };

  const startEditPo = (po) => {
    setEditingPoId(po.id);
    setPoForm({
      id: po.id || "",
      po_number: po.po_number || generateDefaultPoNumber(),
      po_date: po.po_date || dayjs().format("YYYY-MM-DD"),
      vendor_id: po.vendor_id || "",
      vendor_name: po.vendor_name || "",
      vendor_address: po.vendor_address || "",
      vendor_phone: po.vendor_phone || "",
      vendor_email: po.vendor_email || "",
      vendor_gstin: po.vendor_gstin || "",
      ship_via: po.ship_via || "FOR",
      shipping_method: po.shipping_method || "PAID",
      shipping_term: po.shipping_term || "DOOR DELIVERY",
      delivery_date: po.delivery_date || dayjs().add(14, "day").format("YYYY-MM-DD"),
      items: Array.isArray(po.items) && po.items.length > 0 ? po.items.map(i => ({
        id: i.id || `po_item_${Math.random().toString(36).substr(2, 9)}`,
        product_name: i.product_name || i.product || "",
        size: i.size || "",
        quantity: String(i.quantity || ""),
        unit: i.unit || "Nos",
        unit_price: String(i.unit_price || i.rate || ""),
        amount: Number(i.amount || 0)
      })) : [createEmptyPoItem()],
      notes: po.notes || "DELIVERY WILL BE F.O.R. ON-SITE",
      cgst_rate: String(po.cgst_rate ?? "2.5"),
      sgst_rate: String(po.sgst_rate ?? "2.5"),
      igst_rate: String(po.igst_rate ?? "0"),
      freight: String(po.freight ?? "0"),
      status: po.status || "Created"
    });
    setSaveVendorMaster(false);
    setViewMode("form");
  };

  const handleDeletePo = async (poId) => {
    if (!window.confirm("Delete this Purchase Order?")) return;
    try {
      await api.delete(`/purchase-orders/${poId}`);
      toast.success("Purchase Order deleted");
      refetchPoList();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // VIEW MODE 1: PURCHASE ORDERS LIST & SEARCH
  // ──────────────────────────────────────────────────────────────────────────
  if (viewMode === "list") {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2" style={{ fontFamily: "Outfit" }}>
              <FileText className="w-7 h-7 text-indigo-600" /> Purchase Orders
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Create, view, and manage supplier Purchase Orders (POs) for procurement.
            </p>
          </div>

          <Button
            onClick={startCreatePo}
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs gap-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4" /> + New Purchase Order
          </Button>
        </div>

        {/* Search Toolbar */}
        <Card className="border-slate-200 shadow-2xs bg-white">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="relative w-full sm:w-96">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <Input
                placeholder="Search PO number, vendor, product, date..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 text-xs h-9 bg-white"
              />
            </div>
            <div className="text-xs text-slate-500 font-semibold">
              Total POs: {filteredPos.length}
            </div>
          </CardContent>
        </Card>

        {/* Purchase Orders Table */}
        <Card className="border-slate-200 shadow-2xs bg-white">
          <CardContent className="p-0">
            {loadingPo ? (
              <div className="p-8 text-center text-xs text-slate-400 italic">Loading purchase orders...</div>
            ) : filteredPos.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No Purchase Orders found. Click <strong>"+ New Purchase Order"</strong> to create one.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b">
                    <tr>
                      <th className="p-3 font-mono">PO No.</th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Vendor</th>
                      <th className="p-3">Line Items</th>
                      <th className="p-3 text-right font-mono">Total (₹)</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {filteredPos.map((po) => (
                      <tr key={po.id} className="hover:bg-slate-50">
                        <td className="p-3 font-bold text-indigo-600">{po.po_number || po.id}</td>
                        <td className="p-3 font-sans text-slate-700">{po.po_date || "—"}</td>
                        <td className="p-3 font-sans font-bold text-slate-900">{po.vendor_name || "—"}</td>
                        <td className="p-3 font-sans text-slate-600">
                          {(po.items || []).map((i) => i.product_name || i.product).join(", ") || "Solar Material"}
                        </td>
                        <td className="p-3 text-right font-bold text-slate-900">
                          ₹{Number(po.grand_total || po.subtotal || 0).toLocaleString("en-IN")}
                        </td>
                        <td className="p-3 text-center font-sans">
                          <Badge variant="outline" className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200">
                            {po.status || "Created"}
                          </Badge>
                        </td>
                        <td className="p-3 text-center font-sans">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => startEditPo(po)}
                              className="text-[11px] border-slate-300 gap-1"
                              title="Edit PO"
                            >
                              <Pencil className="w-3.5 h-3.5 text-blue-600" /> Edit
                            </Button>
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => generatePdfForPo(po)}
                              className="text-[11px] border-slate-300 gap-1 text-indigo-700 hover:bg-indigo-50"
                              title="Download PDF"
                            >
                              <Download className="w-3.5 h-3.5 text-indigo-600" /> PDF
                            </Button>
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => generateWordForPo(po)}
                              className="text-[11px] border-slate-300 gap-1 text-blue-700 hover:bg-blue-50"
                              title="Download Word (.docx)"
                            >
                              <FileText className="w-3.5 h-3.5 text-blue-600" /> Word
                            </Button>
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => handleDeletePo(po.id)}
                              className="text-[11px] border-slate-300 text-rose-600 hover:bg-rose-50"
                              title="Delete PO"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // VIEW MODE 2: NEW / EDIT PURCHASE ORDER FORM
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto pb-12 font-sans">
      {/* Back Button & Top Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setViewMode("list")}
          className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 font-bold"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Purchase Orders
        </button>
        <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200 text-xs font-semibold">
          {editingPoId ? "EDIT PURCHASE ORDER" : "NEW PURCHASE ORDER"}
        </Badge>
      </div>

      {/* Main PO Document Container */}
      <Card className="border-slate-300 shadow-md bg-white rounded-2xl overflow-hidden">
        {/* Header Title Bar */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {company.logo_url ? (
              <img src={company.logo_url} alt="Logo" className="h-8 object-contain" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white font-bold flex items-center justify-center text-xs">
                GVP
              </div>
            )}
            <div>
              <h2 className="font-bold text-base tracking-tight text-white" style={{ fontFamily: "Outfit" }}>
                {company.company_name || company.name || "SOLAR EPC SUPPLIER MANAGEMENT"}
              </h2>
              <div className="text-[10px] text-slate-300 font-mono">
                GSTIN: {company.gst_number || company.gstin || "27AKMPD5407A1ZM"}
              </div>
            </div>
          </div>

          <div className="text-right font-mono">
            <h3 className="text-lg font-bold text-indigo-300 uppercase">PURCHASE ORDER</h3>
            <div className="text-xs text-slate-300">Date: {poForm.po_date}</div>
          </div>
        </div>

        <CardContent className="p-6 space-y-6 text-xs">
          {/* Header Metadata Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <Label className="text-[11px] font-semibold">PO Number *</Label>
              <Input
                value={poForm.po_number}
                onChange={(e) => setPoForm({ ...poForm, po_number: e.target.value })}
                className="h-8 text-xs bg-white font-mono font-bold text-indigo-700 mt-1"
                required
              />
            </div>
            <div>
              <Label className="text-[11px] font-semibold">PO Date *</Label>
              <Input
                type="date"
                value={poForm.po_date}
                onChange={(e) => setPoForm({ ...poForm, po_date: e.target.value })}
                className="h-8 text-xs bg-white font-mono mt-1"
                required
              />
            </div>
            <div>
              <Label className="text-[11px] font-semibold">Vendor ID</Label>
              <Input
                value={poForm.vendor_id}
                onChange={(e) => setPoForm({ ...poForm, vendor_id: e.target.value })}
                placeholder="e.g. VEN-001"
                className="h-8 text-xs bg-white font-mono uppercase mt-1"
              />
            </div>
          </div>

          {/* Party & Shipping Boxes */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Vendor Details Box */}
            <div className="lg:col-span-6 space-y-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-indigo-600" /> Vendor Information *
                </Label>
                <div className="flex items-center gap-1.5">
                  {poForm.vendor_id && (
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => {
                        const v = vendors.find((x) => x.id === poForm.vendor_id);
                        setEditVendorForm({
                          id: poForm.vendor_id,
                          name: poForm.vendor_name || v?.name || "",
                          address: poForm.vendor_address || v?.address || "",
                          gstin: poForm.vendor_gstin || v?.gstin || "",
                          phone: poForm.vendor_phone || v?.phone || "",
                          email: poForm.vendor_email || v?.email || "",
                          notes: v?.notes || ""
                        });
                        setEditVendorModalOpen(true);
                      }}
                      className="h-6 text-[11px] text-blue-600 hover:bg-blue-50 gap-1 px-1.5"
                    >
                      <Edit3 className="w-3 h-3" /> Edit Vendor
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => setNewVendorModalOpen(true)}
                    className="h-6 text-[11px] border-indigo-200 text-indigo-700 hover:bg-indigo-50 gap-1 px-2"
                  >
                    <UserPlus className="w-3 h-3" /> + New Vendor
                  </Button>
                </div>
              </div>

              {/* Vendor Search Dropdown */}
              <div>
                <Label className="text-[11px] font-semibold text-slate-600">Search Saved Vendor Master</Label>
                <PortalCombobox
                  value={poForm.vendor_id || poForm.vendor_name}
                  onChange={handleSelectVendor}
                  options={vendorOptions}
                  placeholder="Search saved vendor name, GSTIN..."
                  searchPlaceholder="Search vendor name, GSTIN..."
                  className="w-full mt-1 text-xs"
                />
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100 font-mono text-xs">
                <div>
                  <Label className="text-[10px] font-semibold font-sans">Vendor Company Name *</Label>
                  <Input
                    value={poForm.vendor_name}
                    onChange={(e) => setPoForm({ ...poForm, vendor_name: e.target.value })}
                    placeholder="Vendor company name"
                    className="h-8 text-xs bg-white font-semibold"
                    required
                  />
                </div>
                <div>
                  <Label className="text-[10px] font-semibold font-sans">Address</Label>
                  <Input
                    value={poForm.vendor_address}
                    onChange={(e) => setPoForm({ ...poForm, vendor_address: e.target.value })}
                    placeholder="Vendor address"
                    className="h-8 text-xs bg-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] font-semibold font-sans">GSTIN</Label>
                    <Input
                      value={poForm.vendor_gstin}
                      onChange={(e) => setPoForm({ ...poForm, vendor_gstin: e.target.value })}
                      placeholder="GSTIN"
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] font-semibold font-sans">Phone</Label>
                    <Input
                      value={poForm.vendor_phone}
                      onChange={(e) => setPoForm({ ...poForm, vendor_phone: e.target.value })}
                      placeholder="Contact phone"
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-[10px] font-semibold font-sans">Email</Label>
                  <Input
                    type="email"
                    value={poForm.vendor_email}
                    onChange={(e) => setPoForm({ ...poForm, vendor_email: e.target.value })}
                    placeholder="vendor@company.com"
                    className="h-8 text-xs bg-white"
                  />
                </div>

                {/* Save to Vendor Master Checkbox */}
                <div className="pt-2 flex items-center gap-2 font-sans text-xs">
                  <input
                    type="checkbox"
                    id="save_vendor_master_check"
                    checked={saveVendorMaster}
                    onChange={(e) => setSaveVendorMaster(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <label htmlFor="save_vendor_master_check" className="font-semibold text-slate-800 cursor-pointer">
                    Save/Update this vendor for next time in Vendor Master
                  </label>
                </div>
              </div>
            </div>

            {/* Ship To Box */}
            <div className="lg:col-span-6 space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <Label className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-indigo-600" /> Ship To (Company Details)
              </Label>

              <div className="space-y-1.5 text-xs text-slate-700 font-mono">
                <div className="font-bold text-slate-900 text-sm">{company.company_name || company.name || "GVP SOLAR ENERGY"}</div>
                <div>{company.address || "No 1-2, Building No 1 Kapad Market, Ichalkaranji, Maharashtra 416115"}</div>
                <div>GSTIN: {company.gst_number || company.gstin || "27AKMPD5407A1ZM"}</div>
                <div>Email: {company.email || "info@gvpsolutions.org"}</div>
                <div>Phone: {company.mobile || company.phone || "7665 165 666"}</div>
              </div>
            </div>
          </div>

          {/* Shipping Terms Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-100 p-3 rounded-xl border border-slate-200 text-xs">
            <div>
              <Label className="text-[10px] font-semibold uppercase">SHIP VIA</Label>
              <Input
                value={poForm.ship_via}
                onChange={(e) => setPoForm({ ...poForm, ship_via: e.target.value })}
                placeholder="FOR"
                className="h-8 text-xs bg-white mt-1"
              />
            </div>
            <div>
              <Label className="text-[10px] font-semibold uppercase">SHIPPING METHOD</Label>
              <Input
                value={poForm.shipping_method}
                onChange={(e) => setPoForm({ ...poForm, shipping_method: e.target.value })}
                placeholder="PAID"
                className="h-8 text-xs bg-white mt-1"
              />
            </div>
            <div>
              <Label className="text-[10px] font-semibold uppercase">SHIPPING TERM</Label>
              <Input
                value={poForm.shipping_term}
                onChange={(e) => setPoForm({ ...poForm, shipping_term: e.target.value })}
                placeholder="DOOR DELIVERY"
                className="h-8 text-xs bg-white mt-1"
              />
            </div>
            <div>
              <Label className="text-[10px] font-semibold uppercase">DELIVERY DATE</Label>
              <Input
                type="date"
                value={poForm.delivery_date}
                onChange={(e) => setPoForm({ ...poForm, delivery_date: e.target.value })}
                className="h-8 text-xs bg-white font-mono mt-1"
              />
            </div>
          </div>

          {/* Line Items Table */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Package className="w-4 h-4 text-indigo-600" /> Line Items
              </Label>
              <Button
                type="button"
                size="sm"
                onClick={addItem}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold gap-1"
              >
                <Plus className="w-4 h-4" /> Add Item
              </Button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-900 text-white font-semibold text-[11px]">
                  <tr>
                    <th className="p-2.5 w-12 text-center">CODE</th>
                    <th className="p-2.5 min-w-[280px]">PRODUCT NAME / DESCRIPTION</th>
                    <th className="p-2.5 w-24 text-center">QTY</th>
                    <th className="p-2.5 w-24 text-center">UNIT</th>
                    <th className="p-2.5 w-32 text-right">UNIT PRICE (₹)</th>
                    <th className="p-2.5 w-36 text-right">TOTAL (₹)</th>
                    <th className="p-2.5 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {poForm.items.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="p-2 text-center font-bold text-slate-400">{idx + 1}</td>
                      <td className="p-2 font-sans">
                        <ProductAutocompleteInput
                          value={item.product_name}
                          onChange={(v) => updateItem(idx, "product_name", v)}
                          products={products}
                          placeholder="Search Product Master or enter custom description..."
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                          placeholder="0"
                          className="h-8 text-xs text-center font-bold bg-white"
                        />
                      </td>
                      <td className="p-2 font-sans">
                        <Select
                          value={item.unit || "Nos"}
                          onValueChange={(v) => updateItem(idx, "unit", v)}
                        >
                          <SelectTrigger className="h-8 text-xs bg-white"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {UNIT_OPTIONS.map((u) => (
                              <SelectItem key={u} value={u}>{u}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          value={item.unit_price}
                          onChange={(e) => updateItem(idx, "unit_price", e.target.value)}
                          placeholder="0.00"
                          className="h-8 text-xs text-right font-bold bg-white"
                        />
                      </td>
                      <td className="p-2 text-right font-bold text-slate-900">
                        ₹{Number(item.amount || 0).toLocaleString("en-IN")}
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          className="text-slate-400 hover:text-rose-600 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes & Summary Totals */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-4 border-t border-slate-200">
            <div className="lg:col-span-7 space-y-2">
              <Label className="text-xs font-bold text-slate-900 uppercase">NOTES AND INSTRUCTION</Label>
              <Textarea
                value={poForm.notes}
                onChange={(e) => setPoForm({ ...poForm, notes: e.target.value })}
                placeholder="Enter notes and delivery instructions..."
                className="h-28 text-xs bg-white"
              />
            </div>

            <div className="lg:col-span-5 bg-slate-50 p-4 rounded-xl border border-slate-200 font-mono text-xs space-y-2">
              <div className="flex justify-between text-slate-600">
                <span>SUBTOTAL:</span>
                <span className="font-bold text-slate-900">₹{subtotal.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span className="flex items-center gap-1 font-sans text-[11px]">
                  CGST (%):
                  <Input
                    type="number"
                    value={poForm.cgst_rate}
                    onChange={(e) => setPoForm({ ...poForm, cgst_rate: e.target.value })}
                    className="w-14 h-6 text-xs text-center p-1 bg-white font-mono"
                  />
                </span>
                <span>₹{cgstAmount.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span className="flex items-center gap-1 font-sans text-[11px]">
                  SGST (%):
                  <Input
                    type="number"
                    value={poForm.sgst_rate}
                    onChange={(e) => setPoForm({ ...poForm, sgst_rate: e.target.value })}
                    className="w-14 h-6 text-xs text-center p-1 bg-white font-mono"
                  />
                </span>
                <span>₹{sgstAmount.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span className="flex items-center gap-1 font-sans text-[11px]">
                  IGST (%):
                  <Input
                    type="number"
                    value={poForm.igst_rate}
                    onChange={(e) => setPoForm({ ...poForm, igst_rate: e.target.value })}
                    className="w-14 h-6 text-xs text-center p-1 bg-white font-mono"
                  />
                </span>
                <span>₹{igstAmount.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between items-center text-slate-600 border-b border-slate-200 pb-2">
                <span className="flex items-center gap-1 font-sans text-[11px]">
                  FREIGHT / S & H (₹):
                  <Input
                    type="number"
                    value={poForm.freight}
                    onChange={(e) => setPoForm({ ...poForm, freight: e.target.value })}
                    className="w-20 h-6 text-xs text-right p-1 bg-white font-mono"
                  />
                </span>
                <span>₹{Number(poForm.freight || 0).toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between items-center text-sm font-bold text-slate-900 pt-1">
                <span>GRAND TOTAL:</span>
                <span className="text-indigo-700 text-base">₹{grandTotal.toLocaleString("en-IN")}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-6 border-t border-slate-200">
            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <Button variant="outline" size="sm" onClick={() => setViewMode("list")} className="text-xs">
                Cancel
              </Button>
              <Button
                onClick={() => savePoMutation.mutate()}
                disabled={savePoMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 h-9 shadow-sm gap-1.5"
              >
                <Save className="w-4 h-4" />
                {savePoMutation.isPending ? "Saving..." : "Save Purchase Order"}
              </Button>
              <Button
                onClick={() => generatePoMutation.mutate("pdf")}
                disabled={generatePoMutation.isPending}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 h-9 shadow-sm gap-1.5"
              >
                <Download className="w-4 h-4" />
                {generatePoMutation.isPending ? "Generating..." : "Generate PDF"}
              </Button>
              <Button
                onClick={() => generatePoMutation.mutate("docx")}
                disabled={generatePoMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 h-9 shadow-sm gap-1.5"
              >
                <FileText className="w-4 h-4" />
                {generatePoMutation.isPending ? "Generating..." : "Generate Word"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── NEW VENDOR MODAL ─────────────────────────────────────────────── */}
      {newVendorModalOpen && (
        <Dialog open={newVendorModalOpen} onOpenChange={setNewVendorModalOpen}>
          <DialogContent className="max-w-md rounded-xl p-5 font-sans">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold text-base">
                <UserPlus className="w-5 h-5 text-indigo-600" /> Create New Vendor
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Save vendor details into Master Vendor directory.
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newVendorForm.name.trim()) {
                  toast.error("Vendor Name is required");
                  return;
                }
                createVendorMutation.mutate(newVendorForm);
              }}
              className="py-2 text-xs space-y-3"
            >
              <div>
                <Label className="text-xs font-semibold">Vendor Name *</Label>
                <Input
                  value={newVendorForm.name}
                  onChange={(e) => setNewVendorForm({ ...newVendorForm, name: e.target.value })}
                  placeholder="e.g. VRL Solar Supplies"
                  className="mt-1 text-xs"
                  required
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">GSTIN</Label>
                <Input
                  value={newVendorForm.gstin}
                  onChange={(e) => setNewVendorForm({ ...newVendorForm, gstin: e.target.value })}
                  placeholder="27AKMPD5407A1ZM"
                  className="mt-1 font-mono text-xs uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-semibold">Phone</Label>
                  <Input
                    value={newVendorForm.phone}
                    onChange={(e) => setNewVendorForm({ ...newVendorForm, phone: e.target.value })}
                    placeholder="9876543210"
                    className="mt-1 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Email</Label>
                  <Input
                    type="email"
                    value={newVendorForm.email}
                    onChange={(e) => setNewVendorForm({ ...newVendorForm, email: e.target.value })}
                    placeholder="vendor@company.com"
                    className="mt-1 text-xs"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold">Address</Label>
                <Textarea
                  value={newVendorForm.address}
                  onChange={(e) => setNewVendorForm({ ...newVendorForm, address: e.target.value })}
                  placeholder="Full office/warehouse address"
                  className="mt-1 text-xs"
                  rows={2}
                />
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setNewVendorModalOpen(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={createVendorMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs">
                  {createVendorMutation.isPending ? "Saving..." : "Save Vendor"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* ─── EDIT VENDOR MODAL ────────────────────────────────────────────── */}
      {editVendorModalOpen && (
        <Dialog open={editVendorModalOpen} onOpenChange={setEditVendorModalOpen}>
          <DialogContent className="max-w-md rounded-xl p-5 font-sans">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold text-base">
                <Edit3 className="w-5 h-5 text-blue-600" /> Edit Vendor Master Details
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Update saved details for future POs. Existing saved PO snapshots remain unchanged.
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!editVendorForm.name.trim()) {
                  toast.error("Vendor Name is required");
                  return;
                }
                updateVendorMutation.mutate(editVendorForm);
              }}
              className="py-2 text-xs space-y-3"
            >
              <div>
                <Label className="text-xs font-semibold">Vendor Name *</Label>
                <Input
                  value={editVendorForm.name}
                  onChange={(e) => setEditVendorForm({ ...editVendorForm, name: e.target.value })}
                  className="mt-1 text-xs font-semibold"
                  required
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">GSTIN</Label>
                <Input
                  value={editVendorForm.gstin}
                  onChange={(e) => setEditVendorForm({ ...editVendorForm, gstin: e.target.value })}
                  className="mt-1 font-mono text-xs uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-semibold">Phone</Label>
                  <Input
                    value={editVendorForm.phone}
                    onChange={(e) => setEditVendorForm({ ...editVendorForm, phone: e.target.value })}
                    className="mt-1 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Email</Label>
                  <Input
                    type="email"
                    value={editVendorForm.email}
                    onChange={(e) => setEditVendorForm({ ...editVendorForm, email: e.target.value })}
                    className="mt-1 text-xs"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold">Address</Label>
                <Textarea
                  value={editVendorForm.address}
                  onChange={(e) => setEditVendorForm({ ...editVendorForm, address: e.target.value })}
                  className="mt-1 text-xs"
                  rows={2}
                />
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setEditVendorModalOpen(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={updateVendorMutation.isPending} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs">
                  {updateVendorMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
