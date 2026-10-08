import React, { useEffect, useMemo, useState, useRef } from "react";
import api, { formatApiError } from "@/lib/api";
import { useInwardList } from "@/hooks/useInventory";
import { useClientList } from "@/hooks/useClients";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invalidateFrontendProductCache } from "@/lib/productCache";
import { ProductAutocompleteInput, VendorAutocompleteInput, B2BCustomerAutocompleteInput, ClientAutocompleteInput, UNIT_OPTIONS, formatUnit, getStandardizedUnitOptions } from "./_shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Save, RotateCcw, Pencil, Trash2, Paperclip,
  Wand2, FileSpreadsheet, Settings
} from "lucide-react";
import { toast } from "sonner";
import dayjs from "dayjs";
import ManualBulkImport from "@/components/ManualBulkImport";
import { usePermission } from "@/lib/permissions";
import { useAuth } from "@/context/AuthContext";
import { useEntitlements } from "@/hooks/useEntitlements";

const SOURCE_TYPE_OPTIONS = ["Supplier Supply", "Client Return", "B2B Return", "Internal / Warehouse", "Repair Return", "Other"];

const INWARD_CARRY_OPTIONS = [
  { key: "date", label: "Date" },
  { key: "reference_type", label: "Reference Type" },
  { key: "reference_number", label: "Challan No." },
  { key: "bill_number", label: "Bill No." },
  { key: "source_type", label: "Source Type" },
  { key: "source_name", label: "Party / Source Name" },
  { key: "unit", label: "Unit" },
  { key: "remarks", label: "Remarks" },
];

const DEFAULT_INWARD_CARRY_KEYS = ["date", "reference_type", "reference_number", "bill_number", "source_type", "source_name", "unit", "remarks"];

const EMPTY_FORM = () => ({
  date: dayjs().format("YYYY-MM-DD"),
  reference_type: "Challan Number",
  reference_number: "",
  bill_number: "",
  source_type: "Supplier Supply",
  source_name: "",
  source_id: "",
  client_id: "",
  client_name: "",
  vendor_id: "",
  original_entry_id: "",
  original_challan_no: "",
  product: "",
  product_id: "",
  size: "",
  quantity: "",
  unit: "Nos",
  high_value_asset: false,
  serial_number_required: false,
  serial_numbers: [],
  serial_text: "",
  remarks: "",
  attachment_file_id: "",
  attachment_filename: "",
});

export default function InwardTab({ products = [], onChanged, globalSearch = "" }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canCreate = usePermission("data_management", "create");
  const canEdit = usePermission("data_management", "edit");
  const canDelete = usePermission("data_management", "delete");
  const { hasFeature } = useEntitlements();

  const [form, setForm] = useState(EMPTY_FORM());
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [autoContinue, setAutoContinue] = useState(() => localStorage.getItem("inward_auto_continue") === "true");
  const [carryFields, setCarryFields] = useState(() => {
    try {
      const saved = localStorage.getItem("inward_carry_fields");
      return saved ? JSON.parse(saved) : DEFAULT_INWARD_CARRY_KEYS;
    } catch {
      return DEFAULT_INWARD_CARRY_KEYS;
    }
  });
  const [settingsOpen, setSettingsOpen] = useState(false);

  const toggleCarryField = (key, checked) => {
    setCarryFields((prev) => {
      const next = checked ? [...prev, key] : prev.filter((k) => k !== key);
      localStorage.setItem("inward_carry_fields", JSON.stringify(next));
      return next;
    });
  };
  const fileRef = useRef(null);

  // Fetch Inward List
  const { data: entries = [], refetch: refetchInward } = useInwardList();

  // Fetch Master Vendors List
  const { data: vendorsData } = useQuery({
    queryKey: ["vendors"],
    queryFn: async () => {
      const res = await api.get("/vendors");
      return res.data?.vendors || (Array.isArray(res.data) ? res.data : []);
    },
    staleTime: 5000,
  });

  const vendors = useMemo(() => {
    if (Array.isArray(vendorsData)) return vendorsData;
    if (vendorsData?.vendors && Array.isArray(vendorsData.vendors)) return vendorsData.vendors;
    return [];
  }, [vendorsData]);

  // Fetch B2B Customers for B2B Return inward entries
  const { data: b2bCustomersData } = useQuery({
    queryKey: ["inventory-b2b-customers"],
    queryFn: async () => {
      const res = await api.get("/inventory/b2b-customers");
      return res.data?.customers || [];
    },
    staleTime: 5000,
  });

  const b2bCustomers = useMemo(() => {
    return Array.isArray(b2bCustomersData) ? b2bCustomersData : [];
  }, [b2bCustomersData]);

  const { data: clients = [] } = useClientList();

  const isVendorSource = form.source_type === "Supplier Supply" || form.source_type === "Supplier" || form.source_type === "Vendor / Supplier" || form.source_type === "Supply";
  const isClientReturn = form.source_type === "Client Return" || form.source_type === "Return From Client";
  const isB2bReturn = form.source_type === "B2B Return";
  const isRepairSource = form.source_type === "Repair Return";

  // Eligible returns queries for Client Return and B2B Return
  const { data: eligibleClientReturnsData } = useQuery({
    queryKey: ["eligible-returns-client", form.client_id, form.client_name, form.source_name, editing?.id],
    queryFn: async () => {
      const entId = form.client_id;
      const entName = form.client_name || form.source_name;
      if (!entId && !entName) return { transactions: [], total_eligible: 0 };
      const res = await api.get("/inventory/eligible-returns", {
        params: {
          return_type: "client_return",
          entity_id: entId || undefined,
          entity_name: entName || undefined,
          exclude_entry_id: editing?.id || undefined,
        }
      });
      return res.data || { transactions: [], total_eligible: 0 };
    },
    enabled: isClientReturn && Boolean(form.client_id || form.source_name || form.client_name),
    staleTime: 5000,
  });
  const eligibleClientOutwards = eligibleClientReturnsData?.transactions || [];
  const selectedOriginalClientOutward = eligibleClientOutwards.find((o) => o.id === form.original_entry_id);

  const { data: eligibleB2bReturnsData } = useQuery({
    queryKey: ["eligible-returns-b2b", form.client_id, form.source_name, editing?.id],
    queryFn: async () => {
      const entId = form.client_id;
      const entName = form.source_name;
      if (!entId && !entName) return { transactions: [], total_eligible: 0 };
      const res = await api.get("/inventory/eligible-returns", {
        params: {
          return_type: "b2b_return",
          entity_id: entId || undefined,
          entity_name: entName || undefined,
          exclude_entry_id: editing?.id || undefined,
        }
      });
      return res.data || { transactions: [], total_eligible: 0 };
    },
    enabled: isB2bReturn && Boolean(form.client_id || form.source_name),
    staleTime: 5000,
  });
  const eligibleB2bSales = eligibleB2bReturnsData?.transactions || [];
  const selectedOriginalB2bSale = eligibleB2bSales.find((o) => o.id === form.original_entry_id);

  // Sync URL query param ?type=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const typeParam = params.get("type");
    if (typeParam) {
      const low = typeParam.toLowerCase();
      if (low.includes("b2b")) {
        setForm((f) => ({ ...f, source_type: "B2B Return" }));
      } else if (low.includes("client")) {
        setForm((f) => ({ ...f, source_type: "Client Return" }));
      } else if (low.includes("supplier") || low.includes("supply")) {
        setForm((f) => ({ ...f, source_type: "Supplier Supply" }));
      }
    }
  }, []);

  // Options for Vendor Dropdown
  const vendorOptions = useMemo(() => {
    if (!Array.isArray(vendors)) return [];
    return vendors.map((v) => ({
      label: v.name || v.vendor_name || String(v),
      value: v.name || v.vendor_name || String(v),
      subtext: `Contact: ${v.contact_person || v.phone || "N/A"} · GSTIN: ${v.gstin || "N/A"}`,
      raw: v
    }));
  }, [vendors]);

  // Auto suggest next challan number
  const suggestNextChallan = async () => {
    try {
      const { data } = await api.get("/inventory/next-challan", { params: { type: "inward", prefix: "" } });
      setForm((f) => ({ ...f, reference_number: data.suggested }));
      toast.success(`Next challan: ${data.suggested}`);
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  // Upload attachment
  const handleFileUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/files/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setForm((f) => ({
        ...f,
        attachment_file_id: data.id,
        attachment_filename: data.original_filename || file.name
      }));
      toast.success("Attachment uploaded");
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setUploading(false);
    }
  };

  // Select Product and Auto-fill Size / Spec & Unit
  const handleProductSelect = (v) => {
    let pName = "";
    let sizeVal = form.size || "";
    let unitVal = form.unit || "Nos";
    let isHighValue = form.high_value_asset || false;

    if (typeof v === "object" && v !== null) {
      pName = (v.name || "").toUpperCase();
      sizeVal = v.size || "";
      unitVal = formatUnit(v.unit || form.unit || "Nos");
      isHighValue = Boolean(form.high_value_asset || v.high_value_goods || v.high_value_asset);
    } else {
      pName = String(v || "").toUpperCase();
      const matched = (Array.isArray(products) ? products : []).find((p) => (p.name || "").toUpperCase() === pName);
      if (matched) {
        isHighValue = Boolean(form.high_value_asset || matched.high_value_goods || matched.high_value_asset);
        sizeVal = matched.size || "";
        unitVal = formatUnit(matched.unit || form.unit || "Nos");
      } else if (!form.high_value_asset) {
        const highValueKeywords = ["SOLAR PANEL", "PANEL", "INVERTER", "ACDB", "DCDB", "NET METER", "BATTERY"];
        isHighValue = highValueKeywords.some((keyword) => pName.includes(keyword));
      }
    }

    setForm((prev) => ({
      ...prev,
      product: pName,
      product_id: (typeof v === "object" && v?.id) || prev.product_id || "",
      size: sizeVal,
      unit: unitVal,
      high_value_asset: isHighValue
    }));
  };

  // Execute Save Inward Entry (Original Basic Inward Logic)
  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (submittingRef.current || busy) return;

    if (isClientReturn) {
      if (!form.source_name?.trim() && !form.client_name?.trim()) {
        toast.error("Please select a Client!");
        return;
      }
    } else if (isB2bReturn) {
      if (!form.source_name?.trim()) {
        toast.error("Please select a B2B Business Customer!");
        return;
      }
    } else if (isVendorSource) {
      if (!form.source_name?.trim()) {
        toast.error("Please select a Supplier / Vendor!");
        return;
      }
    } else if (!form.source_name?.trim()) {
      toast.error("Party / Source Name is required!");
      return;
    }

    if (!form.product?.trim() || !form.quantity || Number(form.quantity) <= 0) {
      toast.error("Product name and valid quantity > 0 are required!");
      return;
    }

    // Return ceiling validation
    if (isClientReturn && selectedOriginalClientOutward && Number(form.quantity) > selectedOriginalClientOutward.available_quantity) {
      toast.error(`Return quantity (${form.quantity}) exceeds remaining available return quantity (${selectedOriginalClientOutward.available_quantity}) for selected outward dispatch!`);
      return;
    }
    if (isB2bReturn && selectedOriginalB2bSale && Number(form.quantity) > selectedOriginalB2bSale.available_quantity) {
      toast.error(`Return quantity (${form.quantity}) exceeds remaining available return quantity (${selectedOriginalB2bSale.available_quantity}) for selected B2B sale!`);
      return;
    }

    submittingRef.current = true;
    setBusy(true);
    try {
      const matchedVendor = isVendorSource ? vendors.find((v) => (v.name || "").trim().toLowerCase() === (form.source_name || "").trim().toLowerCase()) : null;
      const vendorId = matchedVendor?.id || form.vendor_id || (isVendorSource ? form.source_id : "") || "";

      let clientId = "";
      let clientName = "";
      if (isClientReturn) {
        const matchedClient = clients.find((c) => (c.full_name || "").trim().toLowerCase() === (form.client_name || form.source_name || "").trim().toLowerCase());
        clientId = matchedClient?.id || form.client_id || "";
        clientName = matchedClient?.full_name || form.client_name || form.source_name;
      } else if (isB2bReturn) {
        const matchedCust = b2bCustomers.find((c) => (c.name || c.full_name || "").trim().toLowerCase() === (form.source_name || "").trim().toLowerCase());
        clientId = matchedCust?.id || form.client_id || form.source_id || "";
        clientName = matchedCust?.name || matchedCust?.full_name || form.client_name || form.source_name;
      }

      const sns = form.serial_number_required
        ? (form.serial_text || "").split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)
        : (form.serial_numbers || []);

      const payload = {
        date: form.date,
        bill_type: "Product Bill",
        reference_type: form.reference_type,
        reference_number: form.reference_number,
        bill_number: form.bill_number,
        source_type: form.source_type,
        source_name: isClientReturn ? clientName : form.source_name,
        source_id: isVendorSource ? vendorId : (isB2bReturn || isClientReturn ? clientId : form.source_id),
        vendor_id: isVendorSource ? vendorId : "",
        client_id: (isB2bReturn || isClientReturn) ? clientId : "",
        client_name: (isB2bReturn || isClientReturn) ? clientName : "",
        original_entry_id: form.original_entry_id || "",
        original_challan_no: form.original_challan_no || "",
        product: form.product.trim(),
        product_id: form.product_id || "",
        size: (form.size || "").trim(),
        quantity: Number(form.quantity),
        unit: formatUnit(form.unit || "Nos"),
        unit_price: 0.0,
        line_total: 0.0,
        total_amount: 0.0,
        payment_status: "Unpaid",
        high_value_asset: Boolean(form.high_value_asset),
        serial_number_required: Boolean(form.serial_number_required || sns.length > 0),
        serial_numbers: sns,
        remarks: form.remarks,
        attachment_file_id: form.attachment_file_id,
        attachment_filename: form.attachment_filename
      };

      if (editing) {
        await api.patch(`/inventory/inward/${editing.id}`, payload);
      } else {
        await api.post("/inventory/inward", payload);
      }

      toast.success(editing ? "Inward entry updated!" : "Inward entry saved & inventory stock updated!");
      refetchInward();
      invalidateFrontendProductCache();
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["high-value-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-b2b-summary"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-b2b-history"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-supply-summary"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-supplier-history"] });
      queryClient.invalidateQueries({ queryKey: ["high-value-assets"] });
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      queryClient.invalidateQueries({ queryKey: ["eligible-returns-client"] });
      queryClient.invalidateQueries({ queryKey: ["eligible-returns-b2b"] });
      onChanged?.();

      if (autoContinue && !editing) {
        setForm((prev) => ({
          ...EMPTY_FORM(),
          date: carryFields.includes("date") ? prev.date : dayjs().format("YYYY-MM-DD"),
          reference_type: carryFields.includes("reference_type") ? prev.reference_type : "Challan Number",
          reference_number: carryFields.includes("reference_number") ? prev.reference_number : "",
          bill_number: carryFields.includes("bill_number") ? prev.bill_number : "",
          source_type: carryFields.includes("source_type") ? prev.source_type : "Supplier Supply",
          source_name: carryFields.includes("source_name") ? prev.source_name : "",
          source_id: carryFields.includes("source_name") ? prev.source_id : "",
          unit: carryFields.includes("unit") ? prev.unit : "Nos",
          remarks: carryFields.includes("remarks") ? prev.remarks : "",
          // Product/transaction specific inventory fields NEVER carry forward by default:
          product: "",
          product_id: "",
          size: "",
          quantity: "",
          high_value_asset: false,
          serial_number_required: false,
          serial_numbers: [],
          serial_text: "",
          attachment_file_id: "",
          attachment_filename: ""
        }));
      } else {
        setForm(EMPTY_FORM());
        setEditing(null);
      }
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  };

  // Reset form
  const handleReset = () => {
    setForm(EMPTY_FORM());
    setEditing(null);
  };

  // Edit existing entry
  const startEdit = (entry) => {
    setEditing(entry);
    const origId = entry.original_entry_id || (entry.remarks && (entry.remarks.match(/\[orig_id:([^\]]+)\]/) || [])[1]) || "";
    const origCh = entry.original_challan_no || (entry.remarks && (entry.remarks.match(/\[orig_ch:([^\]]+)\]/) || [])[1]) || "";
    let sType = entry.source_type || "Supplier Supply";
    if (sType === "Supplier" || sType === "Supply" || sType === "Vendor / Supplier") {
      sType = "Supplier Supply";
    }
    setForm({
      date: (entry.date || "").slice(0, 10),
      reference_type: entry.reference_type || "Challan Number",
      reference_number: entry.reference_number || entry.challan_no || "",
      bill_number: entry.bill_number || entry.bill_no || "",
      source_type: sType,
      source_name: entry.source_name || entry.client_name || "",
      source_id: entry.source_id || entry.vendor_id || entry.client_id || "",
      client_id: entry.client_id || "",
      client_name: entry.client_name || entry.source_name || "",
      vendor_id: entry.vendor_id || "",
      original_entry_id: origId,
      original_challan_no: origCh,
      product: entry.product || "",
      product_id: entry.product_id || "",
      size: entry.size || "",
      quantity: String(entry.quantity || ""),
      unit: formatUnit(entry.unit || "Nos"),
      high_value_asset: Boolean(entry.high_value_asset),
      serial_number_required: (entry.serial_numbers || []).length > 0 || Boolean(entry.serial_number_required),
      serial_numbers: entry.serial_numbers || [],
      serial_text: (entry.serial_numbers || []).join("\n"),
      remarks: entry.remarks || "",
      attachment_file_id: entry.attachment_file_id || "",
      attachment_filename: entry.attachment_filename || ""
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Delete entry
  const doDelete = async () => {
    if (!confirmDel) return;
    try {
      await api.delete(`/inventory/inward/${confirmDel.id}`);
      toast.success("Inward entry deleted & stock adjusted");
      setConfirmDel(null);
      refetchInward();
      invalidateFrontendProductCache();
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["high-value-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["high-value-assets"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-b2b-summary"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-b2b-history"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-supply-summary"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-supplier-history"] });
      queryClient.invalidateQueries({ queryKey: ["eligible-returns-client"] });
      queryClient.invalidateQueries({ queryKey: ["eligible-returns-b2b"] });
      onChanged?.();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  // Filtered List for Recent Entries
  const filteredEntries = useMemo(() => {
    const list = Array.isArray(entries) ? entries : [];
    if (!globalSearch) return list;
    const s = globalSearch.toLowerCase();
    return list.filter((e) =>
      (e.product || "").toLowerCase().includes(s) ||
      (e.source_name || "").toLowerCase().includes(s) ||
      (e.reference_number || "").toLowerCase().includes(s) ||
      (e.bill_number || "").toLowerCase().includes(s) ||
      (e.remarks || "").toLowerCase().includes(s)
    );
  }, [entries, globalSearch]);

  return (
    <div className="space-y-4">
      {/* ── QUICK INWARD ENTRY CARD (CLEAN SIMPLE INWARD) ───────────── */}
      <Card className="border-slate-200 shadow-2xs bg-white rounded-2xl">
        <CardContent className="p-5 space-y-5">
          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                {editing ? `Editing Inward Entry · ${editing.product || editing.reference_number}` : "Quick Inward Entry"}
              </h2>
              <p className="text-xs text-slate-500">
                {editing ? `#${editing.reference_number || editing.id.slice(0, 8)}` : "Receive material from a supplier or vendor"}
              </p>
            </div>

            <div className="flex items-center gap-2 relative">
              <label className="inline-flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200/80 px-3 py-1.5 rounded-lg transition border border-slate-200/60" data-testid="inward-auto-continue-toggle">
                <input
                  type="checkbox"
                  checked={autoContinue}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setAutoContinue(checked);
                    localStorage.setItem("inward_auto_continue", String(checked));
                  }}
                  className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 border-slate-300 accent-blue-600"
                />
                <span>Auto-continue</span>
              </label>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSettingsOpen(!settingsOpen)}
                className="h-8 px-2.5 text-xs border-slate-200 text-slate-700 gap-1.5 bg-white hover:bg-slate-50 rounded-lg shadow-2xs"
                title="Configure Auto-continue carry forward fields"
                data-testid="inward-auto-continue-settings-btn"
              >
                <Settings className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-[11px] font-medium">Fields ({carryFields.length})</span>
              </Button>

              {settingsOpen && (
                <div className="absolute right-0 top-10 z-50 w-64 p-3 bg-white rounded-xl shadow-xl border border-slate-200 space-y-2 font-sans text-xs animate-in fade-in zoom-in-95 duration-100">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="font-bold text-slate-800 text-[11px] uppercase tracking-wider">Carry Forward Fields</span>
                    <button type="button" onClick={() => setSettingsOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold px-1">✕</button>
                  </div>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {INWARD_CARRY_OPTIONS.map((opt) => (
                      <label key={opt.key} className="flex items-center gap-2 cursor-pointer select-none text-slate-700 hover:bg-slate-50 p-1 rounded transition">
                        <input
                          type="checkbox"
                          checked={carryFields.includes(opt.key)}
                          onChange={(e) => toggleCarryField(opt.key, e.target.checked)}
                          className="w-3.5 h-3.5 rounded text-blue-600 accent-blue-600"
                        />
                        <span className="text-xs">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 text-xs">
            {/* TRANSACTION DETAILS */}
            <div className="space-y-3">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                TRANSACTION DETAILS
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Date *</Label>
                  <Input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="h-10 text-xs bg-white mt-1 rounded-xl"
                    required
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Reference Type</Label>
                  <Select
                    value={form.reference_type}
                    onValueChange={(v) => setForm({ ...form, reference_type: v })}
                  >
                    <SelectTrigger className="h-10 text-xs bg-white mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Challan Number">Challan Number</SelectItem>
                      <SelectItem value="Purchase Invoice">Purchase Invoice</SelectItem>
                      <SelectItem value="Delivery Note">Delivery Note</SelectItem>
                      <SelectItem value="Stock Transfer">Stock Transfer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Challan No.</Label>
                  <div className="flex gap-1 mt-1">
                    <Input
                      value={form.reference_number}
                      onChange={(e) => setForm({ ...form, reference_number: e.target.value })}
                      placeholder="00001"
                      className="h-10 text-xs font-mono font-bold text-slate-800 bg-white rounded-xl"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={suggestNextChallan}
                      className="h-10 w-10 shrink-0 border-slate-200 rounded-xl"
                      title="Auto-suggest next challan"
                    >
                      <Wand2 className="w-4 h-4 text-blue-600" />
                    </Button>
                  </div>
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Bill Number</Label>
                  <Input
                    value={form.bill_number}
                    onChange={(e) => setForm({ ...form, bill_number: e.target.value })}
                    placeholder="00001"
                    className="h-10 text-xs font-mono bg-white mt-1 rounded-xl"
                  />
                </div>
              </div>
            </div>

            {/* SOURCE DETAILS */}
            <div className="space-y-3 pt-2">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                SOURCE DETAILS
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Source Type *</Label>
                  <Select
                    value={form.source_type}
                    onValueChange={(v) => setForm({ ...form, source_type: v, source_name: "", source_id: "", client_id: "", client_name: "", vendor_id: "", original_entry_id: "", original_challan_no: "" })}
                  >
                    <SelectTrigger className="h-10 text-xs bg-white mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SOURCE_TYPE_OPTIONS.map((st) => (
                        <SelectItem key={st} value={st}>
                          {st === "Supplier Supply" ? "Supplier Supply (Stock +)" :
                           st === "Client Return" ? "Client Return (Stock +)" :
                           st === "B2B Return" ? "B2B Return (Stock +)" : st}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                    {isVendorSource ? "Supplier *" : isClientReturn ? "Client *" : isB2bReturn ? "B2B Business Customer *" : isRepairSource ? "Repair Party *" : "Source Name *"}
                  </Label>
                  {isVendorSource ? (
                    <VendorAutocompleteInput
                      value={form.source_name}
                      onChange={(val, matchedVendor) => {
                        setForm((prev) => ({
                          ...prev,
                          source_name: val,
                          source_id: matchedVendor?.id || "",
                          vendor_id: matchedVendor?.id || "",
                          client_id: "",
                          client_name: ""
                        }));
                      }}
                      vendors={vendors}
                      placeholder="Select existing supplier..."
                      className="h-10 text-xs bg-white mt-1 rounded-xl"
                      testid="inw-vendor-input"
                    />
                  ) : isClientReturn ? (
                    <div className="space-y-2">
                      <ClientAutocompleteInput
                        value={form.client_name || form.source_name || ""}
                        onChange={(val, matchedClient) => {
                          setForm((prev) => ({
                            ...prev,
                            client_id: matchedClient?.id || "",
                            client_name: matchedClient?.full_name || val,
                            source_name: matchedClient?.full_name || val,
                            source_id: matchedClient?.id || "",
                            vendor_id: "",
                            original_entry_id: "",
                            original_challan_no: "",
                          }));
                        }}
                        clients={clients}
                        placeholder="Search client to match outward..."
                        className="h-10 text-xs bg-white mt-1 rounded-xl"
                        testid="inw-client-input"
                        required
                      />

                      {/* Original Client Outward Matcher */}
                      <div>
                        <Label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                          Original Client Outward <span className="text-slate-400 font-normal">(Match against dispatch)</span>
                        </Label>
                        {eligibleClientOutwards.length > 0 ? (
                          <Select
                            value={form.original_entry_id || "none"}
                            onValueChange={(val) => {
                              if (val === "none") {
                                setForm((prev) => ({ ...prev, original_entry_id: "", original_challan_no: "" }));
                                return;
                              }
                              const item = eligibleClientOutwards.find((o) => o.id === val);
                              if (item) {
                                setForm((prev) => ({
                                  ...prev,
                                  original_entry_id: item.id,
                                  original_challan_no: item.challan_no || item.reference_number || "",
                                  product: item.product || prev.product,
                                  product_id: item.product_id || prev.product_id,
                                  size: item.size || prev.size,
                                  unit: formatUnit(item.unit || prev.unit || "Nos"),
                                  quantity: prev.quantity ? prev.quantity : String(item.available_quantity),
                                }));
                              }
                            }}
                          >
                            <SelectTrigger className="h-10 text-xs bg-white mt-1 rounded-xl" data-testid="inw-orig-client-select">
                              <SelectValue placeholder="Select original outward dispatch..." />
                            </SelectTrigger>
                            <SelectContent className="max-h-60">
                              <SelectItem value="none">-- Select original outward dispatch --</SelectItem>
                              {eligibleClientOutwards.map((o) => (
                                <SelectItem key={o.id} value={o.id}>
                                  {o.date} · Ref #{o.challan_no} · {o.product} ({o.size || "Standard"}) — Available: {o.available_quantity} {o.unit} (Orig: {o.original_quantity})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="mt-1.5 px-3 py-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md">
                            {form.client_id || form.client_name || form.source_name
                              ? "No prior outward dispatches with returnable quantity found for this client."
                              : "Select a client first to view eligible outward dispatches."}
                          </div>
                        )}

                        {selectedOriginalClientOutward && (
                          <div className="mt-2 p-2.5 bg-purple-50/70 border border-purple-200 rounded-lg text-xs space-y-1">
                            <div className="font-semibold text-purple-900 flex items-center justify-between">
                              <span>Linked Outward: Ref #{selectedOriginalClientOutward.challan_no} ({selectedOriginalClientOutward.date})</span>
                              <span className="font-mono bg-purple-100 text-purple-800 px-2 py-0.5 rounded text-[11px]">
                                Available to return: {selectedOriginalClientOutward.available_quantity} {selectedOriginalClientOutward.unit}
                              </span>
                            </div>
                            <div className="text-purple-700 text-[11px]">
                              Original Dispatched: {selectedOriginalClientOutward.original_quantity} {selectedOriginalClientOutward.unit} · Already Returned: {selectedOriginalClientOutward.already_returned} {selectedOriginalClientOutward.unit}
                            </div>
                            {Number(form.quantity) > selectedOriginalClientOutward.available_quantity && (
                              <div className="text-red-600 font-semibold text-[11px] mt-1 flex items-center gap-1">
                                ⚠️ Return quantity ({form.quantity}) exceeds remaining available return quantity ({selectedOriginalClientOutward.available_quantity})!
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : isB2bReturn ? (
                    <div className="space-y-2">
                      <B2BCustomerAutocompleteInput
                        value={form.source_name}
                        onChange={(val, matchedCustomer) => {
                          setForm((prev) => ({
                            ...prev,
                            source_name: val,
                            source_id: matchedCustomer?.id || "",
                            client_id: matchedCustomer?.id || "",
                            client_name: val,
                            vendor_id: "",
                            original_entry_id: "",
                            original_challan_no: "",
                          }));
                        }}
                        customers={b2bCustomers}
                        placeholder="Select B2B customer..."
                        className="h-10 text-xs bg-white mt-1 rounded-xl"
                        testid="inw-b2b-input"
                      />

                      {/* Original B2B Sale Matcher */}
                      <div>
                        <Label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                          Original B2B Sale <span className="text-slate-400 font-normal">(Match against outward sale)</span>
                        </Label>
                        {eligibleB2bSales.length > 0 ? (
                          <Select
                            value={form.original_entry_id || "none"}
                            onValueChange={(val) => {
                              if (val === "none") {
                                setForm((prev) => ({ ...prev, original_entry_id: "", original_challan_no: "" }));
                                return;
                              }
                              const item = eligibleB2bSales.find((o) => o.id === val);
                              if (item) {
                                setForm((prev) => ({
                                  ...prev,
                                  original_entry_id: item.id,
                                  original_challan_no: item.challan_no || item.reference_number || "",
                                  product: item.product || prev.product,
                                  product_id: item.product_id || prev.product_id,
                                  size: item.size || prev.size,
                                  unit: formatUnit(item.unit || prev.unit || "Nos"),
                                  quantity: prev.quantity ? prev.quantity : String(item.available_quantity),
                                }));
                              }
                            }}
                          >
                            <SelectTrigger className="h-10 text-xs bg-white mt-1 rounded-xl" data-testid="inw-orig-b2b-select">
                              <SelectValue placeholder="Select original B2B sale..." />
                            </SelectTrigger>
                            <SelectContent className="max-h-60">
                              <SelectItem value="none">-- Select original B2B sale transaction --</SelectItem>
                              {eligibleB2bSales.map((o) => (
                                <SelectItem key={o.id} value={o.id}>
                                  {o.date} · Ref #{o.challan_no} · {o.product} ({o.size || "Standard"}) — Available: {o.available_quantity} {o.unit} (Orig: {o.original_quantity})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="mt-1.5 px-3 py-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md">
                            {form.client_id || form.source_name
                              ? "No prior B2B sales with returnable quantity found for this customer."
                              : "Select a B2B customer first to view eligible sale transactions."}
                          </div>
                        )}

                        {selectedOriginalB2bSale && (
                          <div className="mt-2 p-2.5 bg-teal-50/70 border border-teal-200 rounded-lg text-xs space-y-1">
                            <div className="font-semibold text-teal-900 flex items-center justify-between">
                              <span>Linked Sale: Ref #{selectedOriginalB2bSale.challan_no} ({selectedOriginalB2bSale.date})</span>
                              <span className="font-mono bg-teal-100 text-teal-800 px-2 py-0.5 rounded text-[11px]">
                                Available to return: {selectedOriginalB2bSale.available_quantity} {selectedOriginalB2bSale.unit}
                              </span>
                            </div>
                            <div className="text-teal-700 text-[11px]">
                              Original Sale: {selectedOriginalB2bSale.original_quantity} {selectedOriginalB2bSale.unit} · Already Returned: {selectedOriginalB2bSale.already_returned} {selectedOriginalB2bSale.unit}
                            </div>
                            {Number(form.quantity) > selectedOriginalB2bSale.available_quantity && (
                              <div className="text-red-600 font-semibold text-[11px] mt-1 flex items-center gap-1">
                                ⚠️ Return quantity ({form.quantity}) exceeds remaining available return quantity ({selectedOriginalB2bSale.available_quantity})!
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : isRepairSource ? (
                    <VendorAutocompleteInput
                      value={form.source_name}
                      onChange={(val, matchedVendor) => {
                        setForm((prev) => ({
                          ...prev,
                          source_name: val,
                          source_id: matchedVendor?.id || "",
                          vendor_id: matchedVendor?.id || "",
                          client_id: "",
                          client_name: ""
                        }));
                      }}
                      vendors={vendors}
                      placeholder="Select repair party / service center..."
                      className="h-10 text-xs bg-white mt-1 rounded-xl"
                      testid="inw-repair-input"
                    />
                  ) : (
                    <Input
                      value={form.source_name}
                      onChange={(e) => setForm({ ...form, source_name: e.target.value, source_id: "", client_id: "", client_name: "" })}
                      placeholder="Enter source / warehouse / party name..."
                      className="h-10 text-xs bg-white mt-1 rounded-xl"
                      data-testid="inw-source-input"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* ITEM DETAILS */}
            <div className="space-y-3 pt-2">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                ITEM DETAILS
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 items-end">
                {/* Product Name Autocomplete */}
                <div className="md:col-span-2">
                  <Label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Product Name *</Label>
                  <div className="mt-1">
                    <ProductAutocompleteInput
                      value={form.product}
                      onChange={handleProductSelect}
                      products={products}
                      highValueOnly={form.high_value_asset || false}
                      placeholder="e.g. WAAREE PANEL 540W"
                      required
                    />
                  </div>
                </div>

                {/* Size / Spec */}
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Size / Spec</Label>
                  <Input
                    value={form.size}
                    onChange={(e) => setForm({ ...form, size: e.target.value })}
                    placeholder="e.g. 540W Mono PERC"
                    className="h-10 text-xs bg-white mt-1 rounded-xl"
                  />
                </div>

                {/* Quantity */}
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Quantity *</Label>
                  <Input
                    type="number"
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    placeholder="10"
                    className="h-10 text-xs bg-white font-bold mt-1 rounded-xl"
                    required
                  />
                </div>

                {/* Unit */}
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Unit</Label>
                  <Select
                    value={form.unit}
                    onValueChange={(v) => setForm({ ...form, unit: v })}
                  >
                    <SelectTrigger className="h-10 text-xs bg-white mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {getStandardizedUnitOptions(form.unit).map((u) => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* High Value Asset & Serial Number Tracking Controls */}
              <div className="pt-2 flex flex-wrap items-center gap-6">
                <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.high_value_asset}
                    onChange={(e) => setForm({ ...form, high_value_asset: e.target.checked })}
                    className="w-4 h-4 accent-blue-600 rounded"
                  />
                  High Value Asset
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.serial_number_required}
                    onChange={(e) => setForm({ ...form, serial_number_required: e.target.checked })}
                    className="w-4 h-4 accent-blue-600 rounded"
                    data-testid="inw-serial-number-toggle"
                  />
                  <span className="font-semibold text-slate-800">Serial No. (ON / OFF)</span>
                </label>
              </div>

              {form.serial_number_required && (
                <div className="p-3 bg-blue-50/50 border border-blue-200 rounded-xl space-y-2 mt-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-blue-900 uppercase tracking-wider text-[11px]">Enter / Paste Serial Numbers</span>
                    <span className="text-[11px] font-mono text-slate-600">
                      Entered: <strong className="text-blue-700">{(form.serial_text || "").split(/[\n,]+/).filter(s => s.trim()).length}</strong> / <strong>{Math.floor(Number(form.quantity) || 0)}</strong>
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    value={form.serial_text || ""}
                    onChange={(e) => {
                      const text = e.target.value;
                      const parsed = text.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
                      setForm(prev => ({ ...prev, serial_text: text, serial_numbers: parsed }));
                    }}
                    placeholder="Enter or scan serial numbers (1 per line or comma separated)&#10;e.g.&#10;SN001&#10;SN002"
                    className="w-full text-xs font-mono p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    data-testid="inw-serial-textarea"
                  />
                </div>
              )}
            </div>

            {/* 4. ADDITIONAL INFORMATION */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <Label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Remarks</Label>
                <Textarea
                  value={form.remarks}
                  onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                  placeholder="Enter remarks..."
                  className="h-20 text-xs bg-white mt-1 rounded-xl resize-none p-3"
                />
              </div>

              <div>
                <Label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Attachment</Label>
                <div className="mt-1 space-y-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="h-10 text-xs gap-2 w-full sm:w-auto px-4 bg-white rounded-xl border-slate-200 text-slate-700"
                  >
                    <Paperclip className="w-4 h-4 text-slate-500" />
                    {uploading ? "Uploading…" : form.attachment_filename ? "Change Attachment" : "Attach challan / bill"}
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e.target.files[0])}
                  />
                  {form.attachment_filename && (
                    <div className="text-[11px] text-blue-700 font-medium flex items-center gap-1">
                      <span>📎</span> {form.attachment_filename}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* FORM FOOTER ACTIONS */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button
                  type="submit"
                  disabled={busy || !canCreate}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-10 px-6 rounded-xl shadow-xs transition gap-2 w-full sm:w-auto"
                >
                  <Save className="w-4 h-4" />
                  {busy ? "Saving Inward…" : editing ? "Update Inward Entry" : "Save Inward"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleReset}
                  className="h-10 text-xs gap-1.5 text-slate-700 border-slate-200 rounded-xl"
                >
                  <RotateCcw className="w-4 h-4" /> Reset
                </Button>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (!hasFeature("manual_import")) {
                    toast.error("Manual Bulk Import is not included in your current plan.");
                    return;
                  }
                  setManualOpen(true);
                }}
                disabled={!hasFeature("manual_import")}
                className="h-10 text-xs gap-2 text-slate-700 border-slate-200 rounded-xl w-full sm:w-auto"
                data-testid="manual-import-inward-btn"
              >
                <FileSpreadsheet className="w-4 h-4 text-slate-600" />
                Manual Bulk Import
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ── RECENT INWARD ENTRIES TABLE ──────────────── */}
      <Card className="border-slate-200 shadow-2xs bg-white rounded-2xl">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
              Recent Inward Entries
            </h3>

            <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 text-xs font-mono font-bold">
              {filteredEntries.length} / {entries.length}
            </Badge>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3">DATE</th>
                  <th className="p-3">PRODUCT</th>
                  <th className="p-3 text-right">QTY</th>
                  <th className="p-3">VENDOR</th>
                  <th className="p-3">CHALLAN / BILL</th>
                  <th className="p-3">BY</th>
                  <th className="p-3 text-center">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
                {filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-xs text-slate-400 italic">
                      No inward transactions recorded yet. Fill out the form above to add a stock entry.
                    </td>
                  </tr>
                ) : (
                  filteredEntries.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                        {(e.date || "").slice(0, 10)}
                      </td>
                      <td className="p-3">
                        <div className="font-semibold text-slate-900">{e.product}</div>
                        {e.size && <div className="text-[10px] text-slate-500 font-normal">Spec: {e.size}</div>}
                      </td>
                      <td className="p-3 text-right font-bold text-slate-900 whitespace-nowrap">
                        {`${e.quantity} ${formatUnit(e.unit)}`}
                      </td>
                      <td className="p-3 whitespace-nowrap font-semibold">
                        {e.source_name || "—"}
                      </td>
                      <td className="p-3 font-mono font-bold text-blue-700 whitespace-nowrap">
                        {e.reference_number || e.bill_number || "—"}
                      </td>
                      <td className="p-3 whitespace-nowrap text-slate-500">
                        {e.created_by_name || user?.name || "Admin"}
                      </td>
                      <td className="p-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          {canEdit && (
                            <Button variant="ghost" size="icon" onClick={() => startEdit(e)} className="h-7 w-7 text-slate-500 hover:text-blue-600">
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button variant="ghost" size="icon" onClick={() => setConfirmDel(e)} className="h-7 w-7 text-slate-500 hover:text-rose-600">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Modal */}
      {confirmDel && (
        <Dialog open={Boolean(confirmDel)} onOpenChange={() => setConfirmDel(null)}>
          <DialogContent className="sm:max-w-md bg-white rounded-2xl p-6 border-slate-200">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-slate-900">Confirm Delete Inward Entry</DialogTitle>
              <DialogDescription className="text-xs text-slate-600">
                Are you sure you want to delete inward entry for <strong>{confirmDel.product}</strong> ({confirmDel.quantity} {formatUnit(confirmDel.unit)})? This will deduct the received quantity from central stock.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setConfirmDel(null)} className="text-xs h-9 rounded-xl">Cancel</Button>
              <Button onClick={doDelete} className="bg-rose-600 hover:bg-rose-700 text-white text-xs h-9 px-4 rounded-xl font-semibold">Delete Entry</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Manual Bulk Import Modal */}
      {manualOpen && (
        <ManualBulkImport
          open={manualOpen}
          onOpenChange={setManualOpen}
          onClose={() => setManualOpen(false)}
          mode="inward"
          products={products}
          onImported={() => { refetchInward(); onChanged?.(); }}
        />
      )}
    </div>
  );
}
