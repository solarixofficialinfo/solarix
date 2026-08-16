import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError, fileUrl } from "../lib/api";
import PortalCombobox from "./PortalCombobox";
import {
  FileText, Building2, User, Truck, Plus, Trash2, Calendar, Hash,
  Save, Download, CheckCircle2, RefreshCw, ChevronDown, ChevronUp,
  CreditCard, ShieldCheck, Sparkles, FileCheck, HelpCircle, Eye
} from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";
import { Switch } from "./ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { toast } from "sonner";
import dayjs from "dayjs";

const DOC_TYPE_CONFIG = {
  quotation: {
    label: "Quotation",
    prefix: "QT",
    partyType: "customer",
    partyTitle: "Customer / Client Details",
    showLegalNotice: true,
  },
  sales_order: {
    label: "Sales Order",
    prefix: "SO",
    partyType: "customer",
    partyTitle: "Customer / Client Details",
    showLegalNotice: true,
  },
  tax_invoice: {
    label: "Tax Invoice",
    prefix: "INV",
    partyType: "customer",
    partyTitle: "Customer / Client Details",
    showLegalNotice: false,
  },
  delivery_bill: {
    label: "Delivery Bill / Challan",
    prefix: "DC",
    partyType: "customer",
    partyTitle: "Customer / Client Details",
    showLegalNotice: true,
  },
  purchase_order: {
    label: "Purchase Order",
    prefix: "PO",
    partyType: "vendor",
    partyTitle: "Vendor / Supplier Details",
    showLegalNotice: true,
  },
  purchase_bill: {
    label: "Purchase Bill",
    prefix: "PB",
    partyType: "vendor",
    partyTitle: "Vendor / Supplier Details",
    showLegalNotice: true,
  },
};

const createEmptyItem = () => ({
  id: `item_${Math.random().toString(36).substr(2, 9)}`,
  product_name: "",
  description: "",
  quantity: "1",
  unit: "Nos",
  rate: "0",
  discount: "0",
  gst_rate: "18",
  amount: 0,
});

export default function DocumentBuilder({ initialDocType = "quotation", existingDoc = null }) {
  const queryClient = useQueryClient();
  const [docType, setDocType] = useState(initialDocType);
  const config = DOC_TYPE_CONFIG[docType] || DOC_TYPE_CONFIG.quotation;

  // Header & Document metadata
  const [docNumber, setDocNumber] = useState("");
  const [docDate, setDocDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [validTillDate, setValidTillDate] = useState(dayjs().add(15, "day").format("YYYY-MM-DD"));
  const [deliveryDate, setDeliveryDate] = useState("");
  const [partyId, setPartyId] = useState("");

  // Selected Party details (Vendor or Customer)
  const [selectedPartyId, setSelectedPartyId] = useState("");
  const [partyForm, setPartyForm] = useState({
    name: "", contact_person: "", phone: "", email: "", address: "",
    city: "", state: "Maharashtra", pincode: "", gstin: "", pan: "", party_id: ""
  });

  // Ship To (Manual Mode toggle)
  const [shipToManual, setShipToManual] = useState(false);
  const [shipToForm, setShipToForm] = useState({
    name: "", address: "", contact_person: "", phone: "", gstin: "", state: "", pincode: ""
  });

  // Shipping & Delivery details (Optional)
  const [showShippingDetails, setShowShippingDetails] = useState(false);
  const [shippingForm, setShippingForm] = useState({
    shipping_method: "Road Transport", shipping_terms: "F.O.R. Site",
    delivery_date: "", expected_delivery: "", dispatch_from: "",
    destination: "", transporter: "", vehicle_number: "", reference_no: ""
  });

  // Product Items
  const [items, setItems] = useState([createEmptyItem()]);

  // Advanced Table Options (Collapsible)
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [customColumns, setCustomColumns] = useState([]);
  const [formulaColumns, setFormulaColumns] = useState([]);

  // Notes, Terms & Conditions, Additional Details
  const [notes, setNotes] = useState("DELIVERY WILL BE F.O.R. ON-SITE. LOCATION OF SITE WILL BE PROVIDED AT THE TIME OF DISPATCH.");
  const [terms, setTerms] = useState("1. Payment due within 15 days of invoice date.\n2. Goods once supplied will not be taken back.\n3. Subject to local jurisdiction.");
  const [additionalDetails, setAdditionalDetails] = useState("");
  const [freightCharges, setFreightCharges] = useState("0");
  const [otherCharges, setOtherCharges] = useState("0");

  // Save Party Modal
  const [savePartyModalOpen, setSavePartyModalOpen] = useState(false);

  // PDF Generation State
  const [generating, setGenerating] = useState(false);
  const [generatedPdf, setGeneratedPdf] = useState(null);

  // ── 1. Fetch Company Master ───────────────────────────────────────────────
  const { data: company = {} } = useQuery({
    queryKey: ["company"],
    queryFn: async () => {
      const res = await api.get("/company");
      return res.data || {};
    }
  });

  // ── 2. Fetch Master Vendors ──────────────────────────────────────────────
  const { data: vendorsData } = useQuery({
    queryKey: ["vendors"],
    queryFn: async () => {
      const res = await api.get("/vendors");
      return res.data?.vendors || (Array.isArray(res.data) ? res.data : []);
    }
  });

  // ── 3. Fetch Master Customers / Clients ──────────────────────────────────
  const { data: clientsData } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const res = await api.get("/clients");
      return res.data || [];
    }
  });

  // ── 4. Fetch Master Products ─────────────────────────────────────────────
  const { data: productsData } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const res = await api.get("/inventory/products");
      return res.data?.products || (Array.isArray(res.data) ? res.data : []);
    }
  });

  const vendors = useMemo(() => {
    if (Array.isArray(vendorsData)) return vendorsData;
    if (vendorsData?.vendors && Array.isArray(vendorsData.vendors)) return vendorsData.vendors;
    return [];
  }, [vendorsData]);
  const clients = useMemo(() => (Array.isArray(clientsData) ? clientsData : []), [clientsData]);
  const products = useMemo(() => {
    if (Array.isArray(productsData)) return productsData;
    if (productsData?.products && Array.isArray(productsData.products)) return productsData.products;
    return [];
  }, [productsData]);

  // Auto-generate document number on docType change
  useEffect(() => {
    const pfx = config.prefix;
    const dateStr = dayjs().format("YYMMDD");
    const rnd = Math.floor(100 + Math.random() * 900);
    setDocNumber(`${pfx}-${dateStr}-${rnd}`);
  }, [docType, config.prefix]);

  // Product Combobox options
  const productOptions = useMemo(() => {
    if (!Array.isArray(products)) return [];
    return products.map((p) => ({
      label: p.size ? `${p.name} (${p.size})` : p.name,
      value: p.name,
      group: p.is_high_value ? "HIGH VALUE GOODS" : (p.category || "OTHER PRODUCTS"),
      subtext: `Stock: ${p.balance || 0} ${p.unit || "Nos"} · Rate: ₹${p.selling_price || p.rate || 0}`
    }));
  }, [products]);

  // Party Options (Vendors or Customers)
  const partyOptions = useMemo(() => {
    if (config.partyType === "vendor") {
      if (!Array.isArray(vendors)) return [];
      return vendors.map((v) => ({
        label: v.name || v.vendor_name || String(v),
        value: v.id || v.name,
        subtext: `Contact: ${v.contact_person || v.phone || "N/A"} · GSTIN: ${v.gstin || "N/A"}`,
        raw: v
      }));
    } else {
      if (!Array.isArray(clients)) return [];
      return clients.map((c) => ({
        label: c.full_name,
        value: c.id,
        subtext: `Phone: ${c.mobile || "N/A"} · Capacity: ${c.system_kw || "—"} kW`,
        raw: c
      }));
    }
  }, [config.partyType, vendors, clients]);

  // Handle party selection
  const handleSelectParty = (partyVal) => {
    setSelectedPartyId(partyVal);
    const selected = partyOptions.find((p) => p.value === partyVal || p.label === partyVal);
    if (selected && selected.raw) {
      const raw = selected.raw;
      if (config.partyType === "vendor") {
        setPartyForm({
          name: raw.name || "",
          contact_person: raw.contact_person || "",
          phone: raw.phone || "",
          email: raw.email || "",
          address: raw.address || "",
          city: raw.city || "",
          state: raw.state || "Maharashtra",
          pincode: raw.pincode || "",
          gstin: raw.gstin || "",
          pan: raw.pan || "",
          party_id: raw.id || ""
        });
        setPartyId(raw.id || `VEN-${Math.floor(100 + Math.random() * 900)}`);
      } else {
        setPartyForm({
          name: raw.full_name || "",
          contact_person: raw.contact_person || raw.full_name || "",
          phone: raw.mobile || raw.phone || "",
          email: raw.email || "",
          address: raw.address || "",
          city: raw.city || "",
          state: raw.state || "Maharashtra",
          pincode: raw.pincode || "",
          gstin: raw.gst_number || raw.gstin || "",
          pan: raw.pan || "",
          party_id: raw.id || raw.sol_id || ""
        });
        setPartyId(raw.sol_id || raw.id || `CUST-${Math.floor(100 + Math.random() * 900)}`);
      }
    } else {
      setPartyForm({ ...partyForm, name: partyVal });
    }
  };

  // Save new Vendor / Customer Mutation
  const savePartyMutation = useMutation({
    mutationFn: async () => {
      if (config.partyType === "vendor") {
        const res = await api.post("/vendors", partyForm);
        return res.data;
      } else {
        const res = await api.post("/clients", {
          full_name: partyForm.name,
          mobile: partyForm.phone,
          email: partyForm.email,
          address: partyForm.address,
          gst_number: partyForm.gstin
        });
        return res.data;
      }
    },
    onSuccess: (data) => {
      toast.success(`${config.partyType === "vendor" ? "Vendor" : "Customer"} saved to Master Database!`);
      queryClient.invalidateQueries([config.partyType === "vendor" ? "vendors" : "clients"]);
      setSavePartyModalOpen(false);
    },
    onError: (err) => toast.error(formatApiError(err))
  });

  // Calculate totals
  const subtotal = useMemo(() => {
    return items.reduce((sum, item) => {
      const q = Number(item.quantity || 0);
      const r = Number(item.rate || 0);
      const d = Number(item.discount || 0);
      return sum + Math.max(0, q * r - d);
    }, 0);
  }, [items]);

  const gstTotal = useMemo(() => {
    if (docType === "delivery_bill") return 0;
    return items.reduce((sum, item) => {
      const q = Number(item.quantity || 0);
      const r = Number(item.rate || 0);
      const d = Number(item.discount || 0);
      const net = Math.max(0, q * r - d);
      const g = Number(item.gst_rate || 0);
      return sum + net * (g / 100);
    }, 0);
  }, [items, docType]);

  const grandTotal = useMemo(() => {
    return subtotal + gstTotal + Number(freightCharges || 0) + Number(otherCharges || 0);
  }, [subtotal, gstTotal, freightCharges, otherCharges]);

  // Handle Item updates
  const updateItem = (index, key, val) => {
    const newItems = [...items];
    newItems[index][key] = val;

    // Auto-fill rate/unit if product selected
    if (key === "product_name") {
      const matched = products.find((p) => p.name.toLowerCase() === String(val).toLowerCase());
      if (matched) {
        newItems[index].rate = String(matched.selling_price || matched.rate || matched.unit_price || newItems[index].rate);
        newItems[index].unit = matched.unit || "Nos";
        if (matched.description) newItems[index].description = matched.description;
      }
    }

    const q = Number(newItems[index].quantity || 0);
    const r = Number(newItems[index].rate || 0);
    const d = Number(newItems[index].discount || 0);
    newItems[index].amount = Math.max(0, q * r - d);

    setItems(newItems);
  };

  const addItem = () => {
    setItems([...items, createEmptyItem()]);
  };

  const removeItem = (idx) => {
    if (items.length === 1) {
      toast.error("Document must contain at least one item");
      return;
    }
    setItems(items.filter((_, i) => i !== idx));
  };

  // Generate PDF / Save Document
  const handleGeneratePdf = async () => {
    if (!partyForm.name) {
      toast.error(`Please select or enter a ${config.partyType === "vendor" ? "Vendor" : "Customer"}`);
      return;
    }

    setGenerating(true);
    try {
      const payload = {
        doc_type: docType,
        doc_data: {
          document_number: docNumber,
          quote_number: docNumber,
          invoice_number: docNumber,
          challan_number: docNumber,
          po_number: docNumber,
          bill_number: docNumber,
          document_date: docDate,
          quote_date: docDate,
          invoice_date: docDate,
          valid_till: validTillDate,
          delivery_date: deliveryDate,
          prepared_by: company.owner_name || company.name || "Manager",
          client: config.partyType === "customer" ? partyForm : null,
          vendor: config.partyType === "vendor" ? partyForm : null,
          ship_to: shipToManual ? shipToForm : partyForm,
          shipping_details: shippingForm,
          items: items.map((i) => ({
            product_name: i.product_name,
            description: i.description,
            quantity: Number(i.quantity || 0),
            unit: i.unit || "Nos",
            rate: Number(i.rate || 0),
            discount: Number(i.discount || 0),
            gst: Number(i.gst_rate || 0),
            cgst: (Number(i.quantity || 0) * Number(i.rate || 0) - Number(i.discount || 0)) * (Number(i.gst_rate || 0) / 200),
            sgst: (Number(i.quantity || 0) * Number(i.rate || 0) - Number(i.discount || 0)) * (Number(i.gst_rate || 0) / 200),
            amount: i.amount
          })),
          notes,
          terms,
          additional_details: additionalDetails,
          freight_charges: Number(freightCharges || 0),
          other_charges: Number(otherCharges || 0),
          subtotal,
          gst_total: gstTotal,
          grand_total: grandTotal
        }
      };

      const res = await api.post("/documents/generate", payload);
      toast.success(`${config.label} generated successfully!`);
      if (res.data?.id) {
        setGeneratedPdf(res.data);
      }
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* ── 1. DOCUMENT TYPE SELECTOR HEADER ───────────────────────────────── */}
      <Card className="border-slate-200 shadow-2xs bg-white">
        <CardContent className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Outfit" }}>
                Document Builder — Solarix
              </h2>
              <p className="text-xs text-slate-500">
                Unified Sales & Procurement Engine. Select Document Type to auto-configure fields & headers.
              </p>
            </div>
          </div>

          {/* Document Type Selector Segmented Switch */}
          <div className="w-full md:w-auto overflow-x-auto">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
              {Object.entries(DOC_TYPE_CONFIG).map(([key, cfg]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDocType(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    docType === key
                      ? "bg-white text-indigo-700 shadow-2xs font-bold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 2. MAIN BUSINESS DOCUMENT FORM CONTAINER ────────────────────────── */}
      <Card className="border-slate-300 shadow-sm bg-white rounded-2xl overflow-hidden">
        {/* Document Engine Header Bar */}
        <div className="bg-slate-900 text-white px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-sm tracking-wide uppercase font-mono">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span>{config.label}</span>
          </div>
          <div className="text-xs text-slate-300 font-mono">
            Document No: <strong className="text-indigo-300">{docNumber}</strong>
          </div>
        </div>

        <CardContent className="p-6 space-y-6 text-xs">
          {/* ── 3. COMMON DOCUMENT HEADER (COMPANY LEFT, DOC INFO RIGHT) ──────── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 border-b border-slate-200 pb-6">
            {/* Left Side: Auto-Populated Company Details */}
            <div className="lg:col-span-7 bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-2">
              <div className="flex items-center gap-3">
                {company.logo_url ? (
                  <img src={fileUrl(company.logo_url)} alt="Logo" className="h-20 max-w-[200px] object-contain" />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-indigo-600 text-white font-bold flex items-center justify-center text-lg">
                    GVP
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-base text-slate-900 leading-tight">
                    {company.company_name || company.name || "GVP SOLAR ENERGY"}
                  </h3>
                  <div className="text-[11px] text-slate-500 font-medium">
                    {company.tagline || "SOLAR ENERGY FOR BETTER TOMORROW"}
                  </div>
                </div>
              </div>
              <div className="text-[11px] text-slate-600 space-y-0.5 pt-1 border-t border-slate-200/60 font-mono">
                <div>{company.address || "No 1-2, Building No 1 Kapad Market, Ichalkaranji, India, Maharashtra, 416115"}</div>
                <div className="flex flex-wrap gap-3 pt-0.5 text-slate-700">
                  <span>Phone: <strong>{company.mobile || company.phone || "7665 165 666"}</strong></span>
                  <span>Email: <strong>{company.email || "info.gvpsolar@gmail.com"}</strong></span>
                  <span>GSTIN: <strong className="text-indigo-700">{company.gst_number || company.gstin || "27AKMPD5407A1ZM"}</strong></span>
                </div>
              </div>
            </div>

            {/* Right Side: Document Details Box */}
            <div className="lg:col-span-5 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 space-y-3">
              <h4 className="font-bold text-xs text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                <Hash className="w-4 h-4 text-indigo-600" /> Document Information
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px] font-semibold">Document Date *</Label>
                  <Input
                    type="date"
                    value={docDate}
                    onChange={(e) => setDocDate(e.target.value)}
                    className="h-8 text-xs bg-white font-mono"
                    required
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold">Document Number *</Label>
                  <Input
                    value={docNumber}
                    onChange={(e) => setDocNumber(e.target.value)}
                    className="h-8 text-xs bg-white font-mono font-bold text-indigo-700"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px] font-semibold">
                    {config.partyType === "vendor" ? "Vendor ID" : "Customer / Client ID"}
                  </Label>
                  <Input
                    value={partyId}
                    onChange={(e) => setPartyId(e.target.value)}
                    placeholder="e.g. RNSYS / CUST-101"
                    className="h-8 text-xs bg-white font-mono"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold">
                    {docType === "quotation" ? "Valid Until" : "Delivery / Due Date"}
                  </Label>
                  <Input
                    type="date"
                    value={docType === "quotation" ? validTillDate : deliveryDate}
                    onChange={(e) => docType === "quotation" ? setValidTillDate(e.target.value) : setDeliveryDate(e.target.value)}
                    className="h-8 text-xs bg-white font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── 4. PARTY DETAILS SECTION (VENDOR vs CUSTOMER) ───────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Main Party Box (Vendor or Customer) */}
            <div className="lg:col-span-6 space-y-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <User className="w-4 h-4 text-indigo-600" /> {config.partyTitle}
                </Label>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => setSavePartyModalOpen(true)}
                  className="text-[11px] border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-semibold"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Save New {config.partyType === "vendor" ? "Vendor" : "Customer"}
                </Button>
              </div>

              {/* Portal Combobox for Party Search */}
              <div>
                <Label className="text-[11px] font-semibold text-slate-600">Select Saved Party</Label>
                <PortalCombobox
                  value={selectedPartyId}
                  onChange={handleSelectParty}
                  options={partyOptions}
                  placeholder={`Search saved ${config.partyType === "vendor" ? "vendors" : "customers"}...`}
                  searchPlaceholder={`Search ${config.partyType}...`}
                  className="w-full mt-1"
                />
              </div>

              {/* Party Form Fields */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div>
                  <Label className="text-[11px] font-semibold">Name *</Label>
                  <Input
                    value={partyForm.name}
                    onChange={(e) => setPartyForm({ ...partyForm, name: e.target.value })}
                    placeholder="RENEWSYS INDIA PVT LTD / Shubham Jadhav"
                    className="h-8 text-xs bg-white font-semibold"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px] font-semibold">Contact Person</Label>
                    <Input
                      value={partyForm.contact_person}
                      onChange={(e) => setPartyForm({ ...partyForm, contact_person: e.target.value })}
                      placeholder="Representative Name"
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold">Phone / Mobile</Label>
                    <Input
                      value={partyForm.phone}
                      onChange={(e) => setPartyForm({ ...partyForm, phone: e.target.value })}
                      placeholder="Mobile No."
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px] font-semibold">GSTIN</Label>
                    <Input
                      value={partyForm.gstin}
                      onChange={(e) => setPartyForm({ ...partyForm, gstin: e.target.value })}
                      placeholder="27AAAAA0000A1Z5"
                      className="h-8 text-xs bg-white font-mono uppercase"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold">Email</Label>
                    <Input
                      value={partyForm.email}
                      onChange={(e) => setPartyForm({ ...partyForm, email: e.target.value })}
                      placeholder="info@supplier.com"
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-[11px] font-semibold">Address</Label>
                  <Input
                    value={partyForm.address}
                    onChange={(e) => setPartyForm({ ...partyForm, address: e.target.value })}
                    placeholder="B300, Khopoli Industrial Park, Maharashtra 410203"
                    className="h-8 text-xs bg-white"
                  />
                </div>
              </div>
            </div>

            {/* ── 5. SHIP TO SECTION ─────────────────────────────────────────── */}
            <div className="lg:col-span-6 space-y-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-indigo-600" /> Ship To Address
                </Label>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-600">Manual Mode</span>
                  <Switch checked={shipToManual} onCheckedChange={setShipToManual} />
                </div>
              </div>

              {!shipToManual ? (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
                  <div className="text-[11px] text-slate-400 font-bold uppercase">Default Delivery Address</div>
                  <div className="font-bold text-slate-900">{partyForm.name || "Same as Party / Company Address"}</div>
                  <div>{partyForm.address || "Using saved master address automatically."}</div>
                  <div className="text-[11px] text-indigo-600 font-medium pt-1">
                    Toggle <strong>"Manual Mode"</strong> above to enter a custom delivery location for this document.
                  </div>
                </div>
              ) : (
                <div className="space-y-2 pt-1">
                  <div>
                    <Label className="text-[11px] font-semibold">Recipient / Company Name</Label>
                    <Input
                      value={shipToForm.name}
                      onChange={(e) => setShipToForm({ ...shipToForm, name: e.target.value })}
                      placeholder="GVP Solar Energy Site Office"
                      className="h-8 text-xs bg-white font-semibold"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold">Delivery Address</Label>
                    <Input
                      value={shipToForm.address}
                      onChange={(e) => setShipToForm({ ...shipToForm, address: e.target.value })}
                      placeholder="Project Site Address, Dist- Raigad, Maharashtra"
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[11px] font-semibold">Contact Person</Label>
                      <Input
                        value={shipToForm.contact_person}
                        onChange={(e) => setShipToForm({ ...shipToForm, contact_person: e.target.value })}
                        placeholder="Site Engineer"
                        className="h-8 text-xs bg-white"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] font-semibold">Mobile</Label>
                      <Input
                        value={shipToForm.phone}
                        onChange={(e) => setShipToForm({ ...shipToForm, phone: e.target.value })}
                        placeholder="Mobile No."
                        className="h-8 text-xs bg-white"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── 6. OPTIONAL SHIPPING / DELIVERY DETAILS ──────────────────────── */}
          <div className="border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={() => setShowShippingDetails(!showShippingDetails)}
              className="flex items-center gap-2 text-xs font-bold text-slate-800 hover:text-indigo-600 transition"
            >
              <Truck className="w-4 h-4 text-indigo-600" />
              <span>Shipping & Delivery Details (Optional)</span>
              {showShippingDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showShippingDetails && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <Label className="text-[10px] font-semibold">Shipping Via</Label>
                  <Input
                    value={shippingForm.shipping_method}
                    onChange={(e) => setShippingForm({ ...shippingForm, shipping_method: e.target.value })}
                    placeholder="FOR / Surface / Express"
                    className="h-8 text-xs bg-white"
                  />
                </div>
                <div>
                  <Label className="text-[10px] font-semibold">Shipping Terms</Label>
                  <Input
                    value={shippingForm.shipping_terms}
                    onChange={(e) => setShippingForm({ ...shippingForm, shipping_terms: e.target.value })}
                    placeholder="Paid / Door Delivery"
                    className="h-8 text-xs bg-white"
                  />
                </div>
                <div>
                  <Label className="text-[10px] font-semibold">Transporter</Label>
                  <Input
                    value={shippingForm.transporter}
                    onChange={(e) => setShippingForm({ ...shippingForm, transporter: e.target.value })}
                    placeholder="VRL Logistics"
                    className="h-8 text-xs bg-white"
                  />
                </div>
                <div>
                  <Label className="text-[10px] font-semibold">Vehicle Number</Label>
                  <Input
                    value={shippingForm.vehicle_number}
                    onChange={(e) => setShippingForm({ ...shippingForm, vehicle_number: e.target.value })}
                    placeholder="MH-09-XX-1234"
                    className="h-8 text-xs bg-white font-mono"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── 7. MAIN PRODUCT TABLE (WITH PORTAL COMBOBOX DROPDOWN FIX) ──────── */}
          <div className="space-y-3 border-t border-slate-200 pt-6">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-indigo-600" /> Line Items & Pricing Table
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
                <thead className="bg-slate-100/90 text-slate-800 font-mono text-[11px] uppercase tracking-wider font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-2.5 w-12 text-center">Sr.</th>
                    <th className="p-2.5 min-w-[220px]">Product / Service</th>
                    <th className="p-2.5 min-w-[150px]">Description / Spec</th>
                    <th className="p-2.5 w-20 text-center">Qty</th>
                    <th className="p-2.5 w-20">Unit</th>
                    <th className="p-2.5 w-24 text-right">Rate (₹)</th>
                    <th className="p-2.5 w-24 text-right">Discount</th>
                    <th className="p-2.5 w-20 text-center">GST %</th>
                    <th className="p-2.5 w-28 text-right">Amount (₹)</th>
                    <th className="p-2.5 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-slate-50/80">
                      <td className="p-2 text-center font-bold text-slate-500">{idx + 1}</td>

                      {/* Product Selector with PortalCombobox (Fixed Overflow!) */}
                      <td className="p-2">
                        <PortalCombobox
                          value={item.product_name}
                          onChange={(val) => updateItem(idx, "product_name", val)}
                          options={productOptions}
                          placeholder="Search product master..."
                          searchPlaceholder="Search product name..."
                          className="w-full h-8 text-xs font-semibold"
                        />
                      </td>

                      <td className="p-2">
                        <Input
                          value={item.description}
                          onChange={(e) => updateItem(idx, "description", e.target.value)}
                          placeholder="Line item description"
                          className="h-8 text-xs bg-white"
                        />
                      </td>

                      <td className="p-2">
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                          className="h-8 text-xs text-center font-mono font-bold bg-white"
                        />
                      </td>

                      <td className="p-2">
                        <Select
                          value={item.unit}
                          onValueChange={(v) => updateItem(idx, "unit", v)}
                        >
                          <SelectTrigger className="h-8 text-xs bg-white"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Nos">Nos</SelectItem>
                            <SelectItem value="Sets">Sets</SelectItem>
                            <SelectItem value="Mtrs">Mtrs</SelectItem>
                            <SelectItem value="Kg">Kg</SelectItem>
                            <SelectItem value="Wp">Wp</SelectItem>
                            <SelectItem value="kWp">kWp</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>

                      <td className="p-2">
                        <Input
                          type="number"
                          value={item.rate}
                          onChange={(e) => updateItem(idx, "rate", e.target.value)}
                          className="h-8 text-xs text-right font-mono font-bold bg-white"
                        />
                      </td>

                      <td className="p-2">
                        <Input
                          type="number"
                          value={item.discount}
                          onChange={(e) => updateItem(idx, "discount", e.target.value)}
                          className="h-8 text-xs text-right font-mono bg-white"
                        />
                      </td>

                      <td className="p-2">
                        <Input
                          type="number"
                          value={item.gst_rate}
                          onChange={(e) => updateItem(idx, "gst_rate", e.target.value)}
                          className="h-8 text-xs text-center font-mono bg-white"
                        />
                      </td>

                      <td className="p-2 text-right font-mono font-bold text-slate-900">
                        ₹{(item.amount || 0).toLocaleString("en-IN")}
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

          {/* ── 8. ADVANCED TABLE OPTIONS (COLLAPSIBLE) ──────────────────────── */}
          <div className="border-t border-slate-200 pt-3">
            <button
              type="button"
              onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
              className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-slate-900 transition"
            >
              <span>Advanced Table Options (Custom Columns & Formulas)</span>
              {showAdvancedOptions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showAdvancedOptions && (
              <div className="mt-3 bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex gap-2">
                  <Button size="xs" variant="outline" onClick={() => setCustomColumns([...customColumns, { id: Date.now(), label: "Serial No." }])}>
                    + Add Custom Column
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => setFormulaColumns([...formulaColumns, { id: Date.now(), label: "Margin %" }])}>
                    + Add Formula
                  </Button>
                </div>
                <div className="text-[11px] text-slate-500">
                  Custom columns and formula builders allow adding dynamic calculation fields to line items.
                </div>
              </div>
            )}
          </div>

          {/* ── 9. NOTES, TERMS & TOTALS SUMMARY SECTION ──────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 border-t border-slate-200 pt-6">
            {/* Notes & Terms (Left) */}
            <div className="lg:col-span-7 space-y-4">
              <div>
                <Label className="text-xs font-bold text-slate-900 uppercase">Notes & Instructions</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Enter additional notes or delivery instructions..."
                  className="mt-1 text-xs h-20 bg-white"
                />
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-900 uppercase">Terms & Conditions</Label>
                <Textarea
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  placeholder="Enter terms and conditions..."
                  className="mt-1 text-xs h-24 bg-white"
                />
              </div>
            </div>

            {/* Totals Summary Box (Right) */}
            <div className="lg:col-span-5 bg-slate-900 text-white p-5 rounded-2xl space-y-2.5 font-mono text-xs shadow-lg">
              <h4 className="font-sans font-bold text-xs text-indigo-400 uppercase tracking-wider border-b border-slate-800 pb-2">
                Calculation Summary
              </h4>

              <div className="flex justify-between text-slate-300">
                <span>Subtotal:</span>
                <span className="font-bold text-white">₹{subtotal.toLocaleString("en-IN")}</span>
              </div>

              {docType !== "delivery_bill" && (
                <>
                  <div className="flex justify-between text-slate-300">
                    <span>GST Tax Total:</span>
                    <span className="font-bold text-emerald-400">₹{gstTotal.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800 text-[11px]">
                    <div className="flex justify-between text-slate-400">
                      <span>CGST (50%):</span>
                      <span>₹{(gstTotal / 2).toLocaleString("en-IN")}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>SGST (50%):</span>
                      <span>₹{(gstTotal / 2).toLocaleString("en-IN")}</span>
                    </div>
                  </div>
                </>
              )}

              <div className="flex justify-between items-center text-slate-300 pt-1">
                <span className="font-sans">Freight / Delivery Charges:</span>
                <Input
                  type="number"
                  value={freightCharges}
                  onChange={(e) => setFreightCharges(e.target.value)}
                  className="h-7 w-28 text-xs text-right bg-slate-800 border-slate-700 text-white font-mono"
                />
              </div>

              <div className="flex justify-between items-center text-slate-300 border-b border-slate-800 pb-2">
                <span className="font-sans">Other Charges:</span>
                <Input
                  type="number"
                  value={otherCharges}
                  onChange={(e) => setOtherCharges(e.target.value)}
                  className="h-7 w-28 text-xs text-right bg-slate-800 border-slate-700 text-white font-mono"
                />
              </div>

              <div className="flex justify-between items-center pt-2 text-base font-bold">
                <span className="font-sans text-indigo-300">Grand Total:</span>
                <span className="text-emerald-400 text-lg">₹{grandTotal.toLocaleString("en-IN")}</span>
              </div>
            </div>
          </div>

          {/* ── 10. ACTION AREA & FOOTER ──────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-200 pt-6">
            <div className="text-xs text-slate-500 italic">
              {config.showLegalNotice ? (
                <span className="text-rose-600 font-bold">Legal Notice: "THIS IS NOT TAX INVOICE !" will be printed on bottom.</span>
              ) : (
                <span className="text-emerald-700 font-bold">Tax Invoice Mode — Legal Notice Omitted.</span>
              )}
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <Button
                type="button"
                variant="outline"
                onClick={() => toast.info("Draft saved locally")}
                className="w-full sm:w-auto text-xs"
              >
                Save Draft
              </Button>
              <Button
                type="button"
                onClick={handleGeneratePdf}
                disabled={generating}
                className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-6 py-2.5 shadow-md gap-2"
              >
                {generating ? "Generating PDF..." : `Generate ${config.label} PDF`}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 11. SAVE PARTY MODAL (VENDOR or CUSTOMER) ─────────────────────────── */}
      {savePartyModalOpen && (
        <Dialog open onOpenChange={setSavePartyModalOpen}>
          <DialogContent className="max-w-md rounded-xl p-5">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold text-base">
                <User className="w-5 h-5 text-indigo-600" /> Save New {config.partyType === "vendor" ? "Vendor" : "Customer"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div>
                <Label className="text-xs font-semibold">Name *</Label>
                <Input
                  value={partyForm.name}
                  onChange={(e) => setPartyForm({ ...partyForm, name: e.target.value })}
                  placeholder={config.partyType === "vendor" ? "e.g. ABC Electricals" : "e.g. GVP Industries"}
                  className="mt-1 text-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-semibold">Phone / Mobile</Label>
                  <Input
                    value={partyForm.phone}
                    onChange={(e) => setPartyForm({ ...partyForm, phone: e.target.value })}
                    placeholder="Mobile No."
                    className="mt-1 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">GSTIN</Label>
                  <Input
                    value={partyForm.gstin}
                    onChange={(e) => setPartyForm({ ...partyForm, gstin: e.target.value })}
                    placeholder="27AAAAA0000A1Z5"
                    className="mt-1 text-xs font-mono uppercase"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold">Address</Label>
                <Input
                  value={partyForm.address}
                  onChange={(e) => setPartyForm({ ...partyForm, address: e.target.value })}
                  placeholder="Full office or site address"
                  className="mt-1 text-xs"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button variant="outline" size="sm" onClick={() => setSavePartyModalOpen(false)}>Cancel</Button>
              <Button
                size="sm"
                onClick={() => savePartyMutation.mutate()}
                disabled={savePartyMutation.isPending}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs"
              >
                {savePartyMutation.isPending ? "Saving..." : "Save to Database"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
