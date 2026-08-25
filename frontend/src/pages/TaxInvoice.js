import React, { useEffect, useMemo, useState, useCallback } from "react";
import api, { formatApiError, fileUrl, downloadFile } from "@/lib/api";
import { useClientList, useCompany } from "@/hooks/useClients";
import { useSalesDocuments, useDeleteSalesDocument } from "@/hooks/useSalesDocuments";
import { useProductList } from "@/hooks/useInventory";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, FileText, Download, Sparkles } from "lucide-react";
import { toast } from "sonner";
import dayjs from "dayjs";
import { ProductAutocompleteInput } from "@/components/Inventory/_shared";

const newId = () => window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
const EMPTY_ROW = () => ({ id: newId(), product_id: "", product: "", size: "", unit: "Nos", quantity: "", rate: "", gst: "18", isCustomGst: false, serial_numbers: "", discount: "0" });

const formatMoney = (value) => {
  const n = Number(value) || 0;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const parseNumber = (value) => {
  const num = Number(String(value).replace(/[^0-9.]/g, ""));
  return Number.isNaN(num) ? 0 : num;
};

const amountInWords = (amount) => {
  const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const convert = (num) => {
    if (num < 20) return words[num];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ` ${words[num % 10]}` : "");
    if (num < 1000) return `${words[Math.floor(num / 100)]} hundred${num % 100 ? ` ${convert(num % 100)}` : ""}`;
    if (num < 100000) return `${convert(Math.floor(num / 1000))} thousand${num % 1000 ? ` ${convert(num % 1000)}` : ""}`;
    return `${convert(Math.floor(num / 100000))} lakh${num % 100000 ? ` ${convert(num % 100000)}` : ""}`;
  };
  const integerPart = Math.floor(amount);
  const paise = Math.round((amount - integerPart) * 100);
  let result = `${convert(integerPart)} rupees`;
  if (paise > 0) {
    result += ` and ${convert(paise)} paise`;
  }
  return result.charAt(0).toUpperCase() + result.slice(1) + " only";
};

const taxableValue = (row) => {
  const qty = parseNumber(row.quantity);
  const rate = parseNumber(row.rate);
  const discount = parseNumber(row.discount);
  return Math.max(0, qty * rate - discount);
};

const gstAmounts = (row, isInterState, applyGstGlobal) => {
  if (!applyGstGlobal) return { cgst: 0, sgst: 0, igst: 0 };
  const taxVal = taxableValue(row);
  const gstRate = parseNumber(row.gst);
  const totalGst = taxVal * gstRate / 100;
  if (isInterState) {
    return { cgst: 0, sgst: 0, igst: totalGst };
  } else {
    return { cgst: totalGst / 2, sgst: totalGst / 2, igst: 0 };
  }
};

const rowAmount = (row, isInterState, applyGstGlobal) => {
  const tax = gstAmounts(row, isInterState, applyGstGlobal);
  return taxableValue(row) + tax.cgst + tax.sgst + tax.igst;
};

export default function TaxInvoice() {
  const [clientSource, setClientSource] = useState("existing");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientForm, setClientForm] = useState({ full_name: "", address: "", gst_number: "", mobile: "", email: "", site_address: "" });
  const [invoiceNumber, setInvoiceNumber] = useState(`INV-${dayjs().format("YYMMDD-HHmm")}`);
  const [invoiceDate, setInvoiceDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [placeOfSupply, setPlaceOfSupply] = useState("");
  const [applyGst, setApplyGst] = useState(true);
  const [showOwner, setShowOwner] = useState(() => {
    const saved = localStorage.getItem("solarix_show_owner");
    return saved === null ? true : saved === "true";
  });
  const [customTitle, setCustomTitle] = useState(() => {
    return localStorage.getItem("solarix_custom_invoice_title") || "Tax Invoice";
  });

  const handleShowOwnerChange = (val) => {
    setShowOwner(val);
    localStorage.setItem("solarix_show_owner", String(val));
  };

  const handleCustomTitleChange = (val) => {
    setCustomTitle(val);
    localStorage.setItem("solarix_custom_invoice_title", val);
  };
  const [preparedBy, setPreparedBy] = useState("");
  const [items, setItems] = useState([EMPTY_ROW()]);
  const [notes, setNotes] = useState("Payment due within 30 days.");
  const [generatedFiles, setGeneratedFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const { data: history = [], isLoading: loadingHistory, refetch: fetchHistory } = useSalesDocuments("tax_invoice");
  const deleteDocMutation = useDeleteSalesDocument("tax_invoice");

  const handleDeleteHistory = async (fileId) => {
    if (!window.confirm("Delete Document?\n\nThis action will permanently delete the document and its PDF.\n\nThis action cannot be undone.")) {
      return;
    }
    deleteDocMutation.mutate(fileId);
  };

  // — React Query: served from shared cache, no network call if already loaded —
  const { data: clientsData } = useClientList();
  const clients = useMemo(() => clientsData || [], [clientsData]);
  const { data: productsData } = useProductList();
  const products = useMemo(() => productsData || [], [productsData]);
  const { data: companyData } = useCompany();
  const company = companyData || null;

  // Sync preparedBy from company when it first loads — runs only when companyData changes.
  // IMPORTANT: preparedBy must NOT be in the deps array or setState → dep change → re-run = infinite loop.
  useEffect(() => {
    if (companyData?.owner_name) {
      setPreparedBy((prev) => prev || companyData.owner_name);
    }
  }, [companyData]); // eslint-disable-line react-hooks/exhaustive-deps


  useEffect(() => {
    if (clientSource !== "existing") return;
    const client = clients.find((c) => c.id === selectedClientId);
    if (client) {
      setClientForm({
        full_name: client.full_name || "",
        address: [client.address, client.city, client.state, client.pincode].filter(Boolean).join(", "),
        gst_number: client.gst_number || "",
        mobile: client.mobile || "",
        email: client.email || "",
        site_address: client.address || "",
      });
      if (client.state) {
        setPlaceOfSupply(client.state);
      }
    }
  }, [clientSource, selectedClientId, clients]);

  useEffect(() => {
    if (clientSource !== "existing" || !selectedClientId) {
      setItems([EMPTY_ROW()]);
      return;
    }
    const loadLedger = async () => {
      try {
        const { data } = await api.get(`/inventory/ledger/${selectedClientId}`);
        if (data && data.items && data.items.length > 0) {
          const ledgerItems = data.items.filter(row => row.current_balance > 0);
          if (ledgerItems.length > 0) {
            const hvKeywords = ["SOLAR PANEL", "INVERTER", "ACDB", "DCDB", "METER", "BATTERY"];
            const sortedLedgerItems = [...ledgerItems].sort((a, b) => {
              const aName = (a.product || "").toUpperCase();
              const bName = (b.product || "").toUpperCase();
              const aMatched = products.find(p => p.name.toUpperCase() === aName);
              const bMatched = products.find(p => p.name.toUpperCase() === bName);
              const aIsHV = (aMatched?.high_value_goods) || hvKeywords.some(kw => aName.includes(kw));
              const bIsHV = (bMatched?.high_value_goods) || hvKeywords.some(kw => bName.includes(kw));
              if (aIsHV && !bIsHV) return -1;
              if (!aIsHV && bIsHV) return 1;
              return aName.localeCompare(bName);
            });
            const mapped = sortedLedgerItems.map((row) => {
              const p = products.find((prod) => prod.name.toUpperCase() === row.product.toUpperCase());
              return {
                id: newId(),
                product_id: p ? p.id : "",
                product: row.product,
                size: row.size || (p ? p.size : ""),
                unit: row.unit || (p ? p.unit : "Nos"),
                quantity: String(row.current_balance),
                rate: p && p.rate !== undefined && p.rate !== null ? String(p.rate) : "",
                gst: "18",
                isCustomGst: false,
                serial_numbers: "",
                discount: "0"
              };
            });
            setItems(mapped);
          } else {
            setItems([EMPTY_ROW()]);
          }
        } else {
          setItems([EMPTY_ROW()]);
        }
      } catch (err) {
        toast.error("Failed to load client ledger: " + formatApiError(err));
        setItems([EMPTY_ROW()]);
      }
    };
    loadLedger();
  }, [clientSource, selectedClientId, products]);

  const handleRowChange = (rowId, key, value) => {
    setItems((prev) => prev.map((row) => {
      if (row.id !== rowId) return row;
      const next = { ...row };

      if (key === "product") {
        if (typeof value === "object" && value !== null) {
          next.product = value.name || "";
          next.product_id = value.id || "";
          next.size = value.size || "";
          next.unit = value.unit || "Nos";
          next.rate = (value.selling_price !== undefined && value.selling_price !== null)
            ? String(value.selling_price)
            : (value.rate !== undefined && value.rate !== null ? String(value.rate) : "");
        } else {
          next.product = value;
          const matched = products.find((p) => p.name.toUpperCase() === value.toUpperCase());
          if (matched) {
            next.product_id = matched.id;
            next.size = matched.size || "";
            next.unit = matched.unit || "Nos";
            next.rate = (matched.selling_price !== undefined && matched.selling_price !== null)
              ? String(matched.selling_price)
              : (matched.rate !== undefined && matched.rate !== null ? String(matched.rate) : "");
          } else {
            next.product_id = "";
          }
        }
      } else {
        next[key] = value;
      }
      return next;
    }));
  };

  const addRow = () => setItems((prev) => [...prev, EMPTY_ROW()]);
  const removeRow = (rowId) => setItems((prev) => prev.filter((row) => row.id !== rowId));

  const companyState = useMemo(() => {
    if (!company) return "Maharashtra";
    return company.state || "Maharashtra";
  }, [company]);

  const isInterState = useMemo(() => {
    if (!placeOfSupply) return false;
    return companyState.trim().toLowerCase() !== placeOfSupply.trim().toLowerCase();
  }, [companyState, placeOfSupply]);

  const parseNumber = (val) => {
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
  };

  const taxableValue = useCallback((row) => parseNumber(row.quantity) * parseNumber(row.rate), []);

  const gstAmounts = useCallback((row, interState, enabled = true) => {
    if (!enabled) return { cgst: 0, sgst: 0, igst: 0, totalGst: 0 };
    const tv = taxableValue(row);
    const rate = parseNumber(row.gst);
    const totalGst = (tv * rate) / 100;
    if (interState) {
      return { cgst: 0, sgst: 0, igst: totalGst, totalGst };
    }
    const half = totalGst / 2;
    return { cgst: half, sgst: half, igst: 0, totalGst };
  }, [taxableValue]);

  const rowAmount = useCallback((row, interState, enabled = true) => {
    const tv = taxableValue(row);
    const { totalGst } = gstAmounts(row, interState, enabled);
    return tv + totalGst;
  }, [taxableValue, gstAmounts]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let gstTotal = 0;
    let grandTotal = 0;

    items.forEach((row) => {
      const tv = taxableValue(row);
      const { totalGst } = gstAmounts(row, isInterState, applyGst);
      subtotal += tv;
      gstTotal += totalGst;
      grandTotal += tv + totalGst;
    });

    return { subtotal, gstTotal, grandTotal };
  }, [items, isInterState, applyGst, taxableValue, gstAmounts]);

  const amountInWords = (amount) => {
    return `Rupees ${formatMoney(amount)} Only`;
  };

  const saveInvoice = async (format = "pdf") => {
    if (busy) return;
    if (!invoiceNumber.trim()) { toast.error("Invoice number is required"); return; }
    if (items.length === 0 || items.every((r) => !r.product?.trim())) { toast.error("Add at least one product row"); return; }
    setBusy(true);
    try {
      const docData = {
        invoice_number: invoiceNumber,
        date: invoiceDate,
        place_of_supply: placeOfSupply,
        prepared_by: preparedBy,
        apply_gst: applyGst,
        show_owner: showOwner,
        custom_title: customTitle,
        buyer: clientSource === "manual" ? clientForm : undefined,
        items: items.map((row) => {
          const tv = taxableValue(row);
          const tax = gstAmounts(row, isInterState, applyGst);
          return {
            product: row.product,
            size: row.size,
            unit: row.unit,
            quantity: parseNumber(row.quantity),
            rate: parseNumber(row.rate),
            taxable_value: tv,
            gst_rate: parseNumber(row.gst),
            cgst: tax.cgst,
            sgst: tax.sgst,
            igst: tax.igst,
            serial_numbers: row.serial_numbers || "",
            amount: tv + tax.totalGst,
          };
        }),
        subtotal: totals.subtotal,
        gst_total: totals.gstTotal,
        grand_total: totals.grandTotal,
        amount_in_words: amountInWords(totals.grandTotal),
        terms: notes,
      };

      const payload = {
        doc_type: "tax_invoice",
        format: format,
        doc_data: docData
      };
      payload.client_id = selectedClientId || undefined;
      if (clientSource === "manual" || !selectedClientId) payload.doc_data.buyer = clientForm;

      const { data } = await api.post("/documents/generate", payload);
      const files = data?.files ?? (data?.id ? [{ id: data.id, filename: data.filename, label: data.label }] : []);
      setGeneratedFiles(files);
      toast.success(format === "docx" ? "Tax Invoice Word (.docx) document generated successfully" : "Tax Invoice generated successfully");
      fetchHistory();
      if (files[0] && files[0].id) {
        const defaultName = files[0].filename || (format === "docx" ? `Invoice-${invoiceNumber}.docx` : `Invoice-${invoiceNumber}.pdf`);
        await downloadFile(files[0].id, defaultName);
      }
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-2 border-b border-slate-200/60">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>
            Tax Invoice Builder
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Create GST-compliant invoices using client and product master data
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto">
          {generatedFiles.length > 0 && (
            <Button variant="outline" className="flex-1 sm:flex-initial border-slate-300 text-slate-700 h-10 text-xs font-semibold rounded-xl" onClick={() => window.open(fileUrl(generatedFiles[0].id), "_blank")}>
              Open {generatedFiles[0].filename?.endsWith(".docx") ? "Document" : "PDF"}
            </Button>
          )}
          <Button
            variant="outline"
            className="flex-1 sm:flex-initial border-blue-300 text-blue-700 hover:bg-blue-50 font-semibold text-xs h-10 px-4 rounded-xl shadow-xs transition gap-1.5 whitespace-nowrap"
            onClick={() => saveInvoice("docx")}
            disabled={busy}
            data-testid="download-word-btn"
          >
            <FileText className="w-4 h-4 text-blue-600" />
            {busy ? "Generating…" : "Download Word"}
          </Button>
          <Button
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-10 px-5 rounded-xl shadow-xs transition gap-2 whitespace-nowrap"
            onClick={() => saveInvoice("pdf")}
            disabled={busy}
            data-testid="download-pdf-btn"
          >
            <Sparkles className="w-4 h-4" />
            {busy ? "Generating Invoice…" : "Download PDF"}
          </Button>
        </div>
      </div>

      <Card className="border-slate-200/80 shadow-2xs bg-white rounded-2xl">
        <CardContent className="p-5 sm:p-6 grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="text-xs font-bold text-blue-900 uppercase tracking-wider font-mono border-b border-slate-100 pb-2">
              1. BUYER & CLIENT DETAILS
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-[11px] font-semibold text-slate-700">Source</Label>
                <Select value={clientSource} onValueChange={setClientSource}>
                  <SelectTrigger className="h-10 text-xs bg-white mt-1 rounded-xl"><SelectValue placeholder="Client source" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="existing">Existing Client</SelectItem>
                    <SelectItem value="manual">Manual Entry</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {clientSource === "existing" ? (
                <div>
                  <Label className="text-[11px] font-semibold text-slate-700">Select Client</Label>
                  <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                    <SelectTrigger className="h-10 text-xs bg-white mt-1 rounded-xl"><SelectValue placeholder="Select existing client" /></SelectTrigger>
                    <SelectContent>
                      {clients.map((client) => (<SelectItem key={client.id} value={client.id}>{client.full_name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              ) : <div />}
              <div>
                <Label className="text-[11px] font-semibold text-slate-700">Buyer Name *</Label>
                <Input value={clientForm.full_name} onChange={(e) => setClientForm({ ...clientForm, full_name: e.target.value })} className="h-10 text-xs bg-white mt-1 rounded-xl" />
              </div>
              <div>
                <Label className="text-[11px] font-semibold text-slate-700">GSTIN</Label>
                <Input value={clientForm.gst_number} onChange={(e) => setClientForm({ ...clientForm, gst_number: e.target.value })} className="h-10 text-xs font-mono bg-white mt-1 rounded-xl" />
              </div>
              <div>
                <Label className="text-[11px] font-semibold text-slate-700">Mobile</Label>
                <Input value={clientForm.mobile} onChange={(e) => setClientForm({ ...clientForm, mobile: e.target.value })} className="h-10 text-xs bg-white mt-1 rounded-xl" />
              </div>
              <div>
                <Label className="text-[11px] font-semibold text-slate-700">Email</Label>
                <Input value={clientForm.email} onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })} className="h-10 text-xs bg-white mt-1 rounded-xl" />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-[11px] font-semibold text-slate-700">Address</Label>
                <Textarea value={clientForm.address} onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })} rows={2} className="text-xs bg-white mt-1 rounded-xl" />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-[11px] font-semibold text-slate-700">Site Address</Label>
                <Input value={clientForm.site_address} onChange={(e) => setClientForm({ ...clientForm, site_address: e.target.value })} placeholder="Site Address" className="h-10 text-xs bg-white mt-1 rounded-xl" />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="text-xs font-bold text-blue-900 uppercase tracking-wider font-mono border-b border-slate-100 pb-2">
              2. INVOICE SETTINGS & DETAILS
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-[11px] font-semibold text-slate-700">Document Title</Label>
                <Input value={customTitle} onChange={(e) => handleCustomTitleChange(e.target.value)} placeholder="Document Title" className="h-10 text-xs bg-white mt-1 rounded-xl font-bold text-blue-900" data-testid="custom-title-input" />
              </div>
              <div>
                <Label className="text-[11px] font-semibold text-slate-700">Invoice Number *</Label>
                <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Invoice Number" className="h-10 text-xs font-mono font-bold text-blue-700 bg-white mt-1 rounded-xl" />
              </div>
              <div>
                <Label className="text-[11px] font-semibold text-slate-700">Invoice Date *</Label>
                <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="h-10 text-xs bg-white mt-1 rounded-xl" />
              </div>
              <div>
                <Label className="text-[11px] font-semibold text-slate-700">Place of Supply (State)</Label>
                <Input value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value)} placeholder="Maharashtra" className="h-10 text-xs bg-white mt-1 rounded-xl" />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-[11px] font-semibold text-slate-700">Prepared By</Label>
                <Input value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} placeholder="Prepared By" className="h-10 text-xs bg-white mt-1 rounded-xl" />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-100">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  id="apply-gst-toggle"
                  checked={applyGst}
                  onChange={(e) => setApplyGst(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4 accent-blue-600"
                />
                <span>Apply GST</span>
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  id="show-owner-toggle"
                  checked={showOwner}
                  onChange={(e) => handleShowOwnerChange(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4 accent-blue-600"
                  data-testid="show-owner-checkbox"
                />
                <span>Show Owner Name</span>
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200/80 shadow-2xs bg-white rounded-2xl">
        <CardContent className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-3 pb-2 border-b border-slate-100">
            <div>
              <div className="text-xs font-bold text-blue-900 uppercase tracking-wider font-mono">
                3. TAX INVOICE ITEMS TABLE
              </div>
              <div className="text-xs text-slate-500">
                Select items from master list or custom inventory specifications
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-blue-200 text-blue-700 bg-blue-50/70 hover:bg-blue-100 font-semibold text-xs h-8 px-3 rounded-xl gap-1.5"
              onClick={addRow}
            >
              <Plus className="w-3.5 h-3.5" /> Add Item
            </Button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200/80">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100/90 text-slate-800 font-mono text-[11px] uppercase tracking-wider font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3 min-w-[240px]">Product Name</th>
                  <th className="p-3 min-w-[120px]">Size / Spec</th>
                  <th className="p-3 w-20">Unit</th>
                  <th className="p-3 w-24 text-right">Qty</th>
                  <th className="p-3 w-28 text-right">Rate (₹)</th>
                  <th className="p-3 w-28 text-right">Taxable Value</th>
                  {applyGst && (
                    <>
                      <th className="p-3 w-24 text-right">CGST</th>
                      <th className="p-3 w-24 text-right">SGST</th>
                      <th className="p-3 w-24 text-right">IGST</th>
                    </>
                  )}
                  <th className="p-3 w-32 text-right">Amount (₹)</th>
                  <th className="p-3 w-12 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-900 font-medium">
                {items.map((row) => {
                  const tax = gstAmounts(row, isInterState, applyGst);
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-2.5 align-top">
                        <ProductAutocompleteInput
                          value={row.product}
                          onChange={(v) => handleRowChange(row.id, "product", v)}
                          products={products}
                          placeholder="Type or select product..."
                          className="h-9 text-xs bg-white rounded-xl"
                        />
                        <input
                          type="text"
                          className="text-[10px] text-slate-600 mt-1 placeholder:text-slate-400 w-full border-b border-slate-200 hover:border-slate-400 focus:border-blue-600 outline-none p-0.5 bg-transparent"
                          placeholder="Enter serial numbers (comma separated)..."
                          value={row.serial_numbers || ""}
                          onChange={(e) => handleRowChange(row.id, "serial_numbers", e.target.value)}
                        />
                      </td>
                      <td className="p-2.5 align-top"><Input value={row.size} onChange={(e) => handleRowChange(row.id, "size", e.target.value)} className="h-9 text-xs bg-white rounded-xl" /></td>
                      <td className="p-2.5 align-top"><Input value={row.unit} onChange={(e) => handleRowChange(row.id, "unit", e.target.value)} className="h-9 text-xs bg-white rounded-xl" /></td>
                      <td className="p-2.5 align-top"><Input type="number" value={row.quantity} onChange={(e) => handleRowChange(row.id, "quantity", e.target.value)} className="h-9 text-xs font-bold text-right bg-white rounded-xl" /></td>
                      <td className="p-2.5 align-top"><Input type="number" value={row.rate} onChange={(e) => handleRowChange(row.id, "rate", e.target.value)} className="h-9 text-xs font-semibold text-right bg-white rounded-xl" /></td>
                      <td className="p-2.5 align-top text-right font-semibold text-slate-800 tabular-nums text-xs pt-4">{formatMoney(taxableValue(row))}</td>
                      {applyGst && (
                        <>
                          <td className="p-2.5 align-top text-right text-xs text-slate-600 tabular-nums pt-4">{formatMoney(tax.cgst)}</td>
                          <td className="p-2.5 align-top text-right text-xs text-slate-600 tabular-nums pt-4">{formatMoney(tax.sgst)}</td>
                          <td className="p-2.5 align-top text-right text-xs text-slate-600 tabular-nums pt-4">{formatMoney(tax.igst)}</td>
                        </>
                      )}
                      <td className="p-2.5 align-top text-right font-bold text-slate-900 tabular-nums text-xs pt-4">{formatMoney(rowAmount(row, isInterState, applyGst))}</td>
                      <td className="p-2.5 align-top text-center pt-3">
                        <button type="button" onClick={() => removeRow(row.id)} className="p-1.5 text-slate-400 hover:text-red-600 transition rounded-lg hover:bg-red-50" title="Remove item"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-[1fr_260px] pt-2">
            <div>
              <Label className="text-[11px] font-semibold text-slate-700">Amount in Words</Label>
              <Textarea value={amountInWords(totals.grandTotal)} readOnly rows={3} className="text-xs bg-slate-50 font-semibold text-slate-800 mt-1 rounded-xl" />
            </div>
            <div className="space-y-2 rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 text-xs">
              <div className="flex justify-between text-slate-600"><span>Subtotal</span><span className="font-semibold text-slate-900">₹ {formatMoney(totals.subtotal)}</span></div>
              {applyGst && <div className="flex justify-between text-slate-600"><span>GST Total</span><span className="font-semibold text-blue-700">₹ {formatMoney(totals.gstTotal)}</span></div>}
              <div className="flex justify-between font-bold text-slate-900 pt-2 border-t border-slate-200 text-sm"><span>Grand Total</span><span className="text-blue-900">₹ {formatMoney(totals.grandTotal)}</span></div>
            </div>
          </div>

          <div>
            <Label className="text-[11px] font-semibold text-slate-700">Terms & Conditions</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="text-xs bg-white mt-1 rounded-xl" />
          </div>
        </CardContent>
      </Card>

      {generatedFiles.length > 0 && (
        <Card className="border-slate-200/80 shadow-2xs bg-white rounded-2xl">
          <CardContent className="p-5 sm:p-6">
            <div className="text-sm font-bold text-slate-900 mb-3" style={{ fontFamily: "Outfit" }}>
              Generated Files
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {generatedFiles.map((file) => (
                <div key={file.id} className="rounded-xl border border-slate-200 p-4 bg-slate-50 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900 text-xs">{file.label}</div>
                    <div className="text-[11px] text-slate-500">{file.filename}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => window.open(fileUrl(file.id), "_blank")} className="h-8 text-xs rounded-lg border-slate-200">Open</Button>
                    <Button variant="outline" size="sm" onClick={() => downloadFile(file.id, file.filename || "Tax_Invoice.pdf")} className="h-8 text-xs rounded-lg border-slate-200 text-slate-700" title="Download">
                      <Download className="w-3.5 h-3.5 mr-1" /> Download
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-slate-200/80 shadow-2xs bg-white rounded-2xl">
        <CardContent className="p-5 sm:p-6 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
              Generated Documents History
            </h3>
            <p className="text-xs text-slate-500">
              Recent invoice PDF records generated for clients
            </p>
          </div>
          {loadingHistory ? (
            <div className="text-xs text-slate-500 py-6 text-center italic">Loading history...</div>
          ) : history.length === 0 ? (
            <div className="text-xs text-slate-400 py-8 text-center italic">No generated invoice documents yet.</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/90 text-slate-800 font-mono text-[11px] uppercase tracking-wider font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Document Type</th>
                    <th className="p-3">Document Number</th>
                    <th className="p-3">Client Name</th>
                    <th className="p-3">Generated Date & Time</th>
                    <th className="p-3">Prepared By</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-900 font-medium">
                  {history.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-50 transition">
                      <td className="p-3 font-semibold text-slate-900">{doc.doc_type === "quotation" ? "Quotation" : doc.doc_type === "tax_invoice" ? "Tax Invoice" : doc.doc_type === "delivery_bill" ? "Delivery Bill" : doc.doc_type}</td>
                      <td className="p-3 font-mono font-bold text-blue-700">{doc.document_number}</td>
                      <td className="p-3 font-semibold">{doc.client_name}</td>
                      <td className="p-3 text-slate-500 font-mono">{doc.created_at ? dayjs(doc.created_at).format("YYYY-MM-DD HH:mm") : "—"}</td>
                      <td className="p-3 text-slate-600">{doc.prepared_by || "—"}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {doc.status || "Active"}
                        </span>
                      </td>
                      <td className="p-3 text-right space-x-1.5 whitespace-nowrap">
                        <Button variant="outline" size="sm" onClick={() => window.open(fileUrl(doc.id), "_blank")} className="h-8 text-xs rounded-lg border-slate-200">View</Button>
                        <Button variant="outline" size="sm" className="h-8 text-xs rounded-lg border-slate-200 text-slate-700" onClick={() => downloadFile(doc.id, doc.filename || "Tax_Invoice.pdf")}>
                          <Download className="w-3.5 h-3.5 mr-1" /> Download
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 text-xs rounded-lg border-red-200 text-red-600 hover:bg-red-50" onClick={() => handleDeleteHistory(doc.id)}>Delete</Button>
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
