import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import api, { formatApiError, fileUrl, downloadFile } from "@/lib/api";
import { useClientList, useCompany } from "@/hooks/useClients";
import { useSalesDocuments, useDeleteSalesDocument } from "@/hooks/useSalesDocuments";
import { useProductList, useOutwardList } from "@/hooks/useInventory";
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
const EMPTY_ROW = () => ({ id: newId(), product_id: "", product: "", size: "", unit: "Nos", dispatch_qty: "", rate: "", serial_numbers: "" });
const formatMoney = (value) => {
  const n = Number(value) || 0;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const parseNumber = (value) => {
  const num = Number(String(value).replace(/[^0-9.]/g, ""));
  return Number.isNaN(num) ? 0 : num;
};

export default function DeliveryBill() {
  const [clientSource, setClientSource] = useState("existing");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientForm, setClientForm] = useState({ full_name: "", address: "", mobile: "", site_address: "", gst_number: "", project: "" });
  const [challanNumber, setChallanNumber] = useState(`DC-${dayjs().format("YYMMDD-HHmm")}`);
  const [selectedChallans, setSelectedChallans] = useState([]);
  const [challanDropdownOpen, setChallanDropdownOpen] = useState(false);
  const [challanSearch, setChallanSearch] = useState("");
  const challanContainerRef = useRef(null);
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [preparedBy, setPreparedBy] = useState("");
  const [items, setItems] = useState([EMPTY_ROW()]);
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("Goods received in good condition. Subject to local jurisdiction.");
  const [generatedFiles, setGeneratedFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [showRate, setShowRate] = useState(true);
  const [showAmount, setShowAmount] = useState(true);
  const [showOwner, setShowOwner] = useState(() => {
    const saved = localStorage.getItem("solarix_show_owner");
    return saved === null ? true : saved === "true";
  });

  const handleShowOwnerChange = (val) => {
    setShowOwner(val);
    localStorage.setItem("solarix_show_owner", String(val));
  };

  const { data: history = [], isLoading: loadingHistory, refetch: fetchHistory } = useSalesDocuments("delivery_bill");
  const deleteDocMutation = useDeleteSalesDocument("delivery_bill");

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
  const { data: outwardEntriesData } = useOutwardList();
  const outwardEntries = useMemo(() => outwardEntriesData || [], [outwardEntriesData]);
  const { data: companyData } = useCompany();
  const company = companyData || null;

  const clientChallans = useMemo(() => {
    let entries = outwardEntries;
    if (clientSource === "existing" && selectedClientId) {
      entries = outwardEntries.filter(e => e.client_id === selectedClientId);
    }
    const map = new Map();
    entries.forEach((entry) => {
      const ch = entry.outward_challan_no || entry.reference_number;
      if (ch && !map.has(ch)) {
        map.set(ch, {
          challan_no: ch,
          client_name: entry.client_name || "",
          client_id: entry.client_id || "",
          project_name: entry.project_name || "",
          project_id: entry.project_id || "",
          date: entry.date || entry.created_at || "",
          entries: [],
        });
      }
      if (ch) {
        map.get(ch).entries.push(entry);
      }
    });
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [outwardEntries, clientSource, selectedClientId]);

  const filteredChallans = useMemo(() => {
    const q = (challanSearch || "").toLowerCase();
    return clientChallans.filter(c => 
      c.challan_no.toLowerCase().includes(q) || 
      c.client_name.toLowerCase().includes(q)
    );
  }, [clientChallans, challanSearch]);

  const handleToggleChallan = (challanNo) => {
    setSelectedChallans((prev) => {
      const isSelected = prev.includes(challanNo);
      const next = isSelected ? prev.filter((x) => x !== challanNo) : [...prev, challanNo];

      if (!isSelected && prev.length === 0) {
        const challanObj = clientChallans.find(c => c.challan_no === challanNo);
        if (challanObj) {
          const firstEntry = challanObj.entries[0];
          const client = clients.find(c => c.id === challanObj.client_id);

          const updatedClientForm = {
            full_name: client?.full_name || firstEntry?.client_name || "",
            address: client ? [client.address, client.city, client.state, client.pincode].filter(Boolean).join(", ") : "",
            mobile: client?.mobile || "",
            gst_number: client?.gst_number || "",
            site_address: client?.address || "",
            project: firstEntry?.project_name || client?.project_name || ""
          };
          setClientForm(updatedClientForm);

          if (challanObj.client_id && clients.some(c => c.id === challanObj.client_id)) {
            setClientSource("existing");
            setSelectedClientId(challanObj.client_id);
          } else {
            setClientSource("manual");
            setSelectedClientId("");
          }
        }
      }
      return next;
    });
  };

  useEffect(() => {
    function handleClickOutside(event) {
      if (challanContainerRef.current && !challanContainerRef.current.contains(event.target)) {
        setChallanDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
        mobile: client.mobile || "",
        site_address: client.address || "",
        gst_number: client.gst_number || "",
        project: client.project_name || "",
      });
    }
  }, [clientSource, selectedClientId, clients]);

  useEffect(() => {
    if (selectedChallans.length > 0) {
      const matchingEntries = outwardEntries.filter((entry) => {
        const ch = entry.outward_challan_no || entry.reference_number;
        return ch && selectedChallans.includes(ch);
      });

      if (matchingEntries.length > 0) {
        const mergedMap = new Map();
        matchingEntries.forEach((entry) => {
          const key = `${entry.product.toUpperCase()}::${(entry.size || "").toUpperCase()}::${(entry.unit || "Nos").toUpperCase()}`;
          if (!mergedMap.has(key)) {
            mergedMap.set(key, {
              product: entry.product,
              size: entry.size || "",
              unit: entry.unit || "Nos",
              quantity: 0,
              serial_numbers: [],
              rate: entry.rate,
            });
          }
          const item = mergedMap.get(key);
          item.quantity += entry.quantity || 0;
          if (entry.serial_numbers) {
            item.serial_numbers.push(...entry.serial_numbers);
          }
        });

        const hvKeywords = ["SOLAR PANEL", "INVERTER", "ACDB", "DCDB", "METER", "BATTERY"];
        const mapped = Array.from(mergedMap.values())
          .map((row) => {
            const p = products.find((prod) => prod.name.toUpperCase() === row.product.toUpperCase());
            return {
              id: newId(),
              product_id: p ? p.id : "",
              product: row.product,
              size: row.size,
              unit: row.unit,
              dispatch_qty: String(row.quantity),
              rate: row.rate !== undefined && row.rate !== null ? String(row.rate) : (p && p.rate !== undefined && p.rate !== null ? String(p.rate) : ""),
              serial_numbers: row.serial_numbers.join(", ")
            };
          })
          .sort((a, b) => {
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
        setItems(mapped);
      } else {
        setItems([EMPTY_ROW()]);
      }
      return;
    }

    if (clientSource === "existing" && selectedClientId) {
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
                  dispatch_qty: String(row.current_balance),
                  rate: p && p.rate !== undefined && p.rate !== null ? String(p.rate) : "",
                  serial_numbers: ""
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
    }
  }, [clientSource, selectedClientId, selectedChallans, outwardEntries, products]);

  useEffect(() => {
    if (clientSource === "existing" && selectedClientId) {
      const client = clients.find((c) => c.id === selectedClientId);
      if (client) {
        setClientForm({
          full_name: client.full_name || "",
          address: client.address || "",
          mobile: client.mobile || "",
          site_address: client.address || "",
          gst_number: client.gst_number || "",
          project: client.system_kw ? `${client.system_kw} kW Solar System` : "",
        });
      }
    }
  }, [clientSource, selectedClientId, clients]);

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
            next.rate = (matched.selling_price !== undefined && matched.selling_price !== null) ? String(matched.selling_price) : (matched.rate ? String(matched.rate) : "");
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
  const rowAmount = (row) => parseNumber(row.dispatch_qty) * parseNumber(row.rate);
  const totals = useMemo(() => ({ total: items.reduce((sum, row) => sum + rowAmount(row), 0) }), [items]);

  const saveBill = async () => {
    if (busy) return;
    if (!challanNumber.trim()) { toast.error("Delivery Challan number is required"); return; }
    if (items.length === 0 || items.every((row) => !row.product?.trim())) { toast.error("Add at least one delivery row"); return; }
    setBusy(true);
    try {
      const docData = {
        challan_number: challanNumber,
        date,
        prepared_by: preparedBy,
        show_owner: showOwner,
        notes,
        terms,
        show_rate: showRate,
        show_amount: showAmount,
        client: clientSource === "manual" ? clientForm : undefined,
        items: items.map((row) => ({
          product: row.product,
          size: row.size,
          unit: row.unit,
          dispatch_qty: parseNumber(row.dispatch_qty),
          rate: parseNumber(row.rate),
          serial_numbers: row.serial_numbers || "",
          amount: rowAmount(row),
        })),
        total_amount: totals.total,
      };
      const payload = { doc_type: "delivery_bill", doc_data: docData, client_id: selectedClientId || undefined };
      const { data } = await api.post("/documents/generate", payload);
      const files = data?.files ?? (data?.id ? [{ id: data.id, filename: data.filename, label: data.label }] : []);
      setGeneratedFiles(files);
      toast.success("Delivery Bill generated successfully");
      fetchHistory();
      if (files[0] && files[0].id) {
        await downloadFile(files[0].id, files[0].filename || files[0].original_filename || "Delivery_Bill.pdf");
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
            Delivery Bill / Challan
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Create material delivery challans synced with central inventory outward entries
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {generatedFiles.length > 0 && (
            <Button variant="outline" className="border-slate-300 text-slate-700 h-10 text-xs font-semibold rounded-xl" onClick={() => window.open(fileUrl(generatedFiles[0].id), "_blank")}>
              Open PDF
            </Button>
          )}
          <Button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-10 px-5 rounded-xl shadow-xs transition gap-2" onClick={saveBill} disabled={busy}>
            <Sparkles className="w-4 h-4" />
            {busy ? "Generating Bill…" : "Generate Bill"}
          </Button>
        </div>
      </div>

      <Card className="border-slate-200/80 shadow-2xs bg-white rounded-2xl">
        <CardContent className="p-5 sm:p-6 grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="text-xs font-bold text-blue-900 uppercase tracking-wider font-mono border-b border-slate-100 pb-2">
              1. RECIPIENT & CLIENT DETAILS
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
                    <SelectContent>{clients.map((client) => (<SelectItem key={client.id} value={client.id}>{client.full_name}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
              ) : <div />}

              <div className="sm:col-span-2 relative" ref={challanContainerRef}>
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Select Outward Challan Number</Label>
                <div className="relative mt-1">
                  <button
                    type="button"
                    onClick={() => setChallanDropdownOpen(!challanDropdownOpen)}
                    className="flex h-10 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 text-left hover:bg-slate-50"
                  >
                    <span className="truncate">
                      {selectedChallans.length === 0 ? "Select Challan Numbers..." : `Selected (${selectedChallans.length})`}
                    </span>
                    <span className="text-slate-400 font-normal text-xs">▼</span>
                  </button>
                  {challanDropdownOpen && (
                    <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                      <Input
                        placeholder="Search challan..."
                        value={challanSearch}
                        onChange={(e) => setChallanSearch(e.target.value)}
                        className="h-8 text-xs mb-2 rounded-lg"
                      />
                      <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                        {filteredChallans.length === 0 ? (
                          <div className="p-2 text-xs text-slate-400 italic text-center">No challans found</div>
                        ) : (
                          filteredChallans.map((c) => (
                            <label key={c.challan_no} className="flex items-center gap-2 px-2 py-2 text-xs hover:bg-slate-50 cursor-pointer">
                              <input type="checkbox" checked={selectedChallans.includes(c.challan_no)} onChange={() => handleToggleChallan(c.challan_no)} />
                              {c.challan_no} {c.client_name && `(${c.client_name})`}
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {selectedChallans.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {selectedChallans.map((ch) => (
                      <span key={ch} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                        {ch} <button onClick={() => handleToggleChallan(ch)}>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <Label className="text-[11px] font-semibold text-slate-700">Client Name *</Label>
                <Input value={clientForm.full_name} onChange={(e) => setClientForm({ ...clientForm, full_name: e.target.value })} className="h-10 text-xs bg-white mt-1 rounded-xl" />
              </div>
              <div>
                <Label className="text-[11px] font-semibold text-slate-700">Mobile</Label>
                <Input value={clientForm.mobile} onChange={(e) => setClientForm({ ...clientForm, mobile: e.target.value })} className="h-10 text-xs bg-white mt-1 rounded-xl" />
              </div>
              <div>
                <Label className="text-[11px] font-semibold text-slate-700">GSTIN</Label>
                <Input value={clientForm.gst_number || ""} onChange={(e) => setClientForm({ ...clientForm, gst_number: e.target.value })} className="h-10 text-xs font-mono bg-white mt-1 rounded-xl" />
              </div>
              <div>
                <Label className="text-[11px] font-semibold text-slate-700">Project</Label>
                <Input value={clientForm.project || ""} onChange={(e) => setClientForm({ ...clientForm, project: e.target.value })} className="h-10 text-xs bg-white mt-1 rounded-xl" />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-[11px] font-semibold text-slate-700">Address</Label>
                <Textarea value={clientForm.address} onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })} rows={2} className="text-xs bg-white mt-1 rounded-xl" />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-[11px] font-semibold text-slate-700">Site Address</Label>
                <Input value={clientForm.site_address} onChange={(e) => setClientForm({ ...clientForm, site_address: e.target.value })} className="h-10 text-xs bg-white mt-1 rounded-xl" />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="text-xs font-bold text-blue-900 uppercase tracking-wider font-mono border-b border-slate-100 pb-2">
              2. CHALLAN SETTINGS & DETAILS
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-[11px] font-semibold text-slate-700">Delivery Challan No *</Label>
                <Input value={challanNumber} onChange={(e) => setChallanNumber(e.target.value)} className="h-10 text-xs font-mono font-bold text-blue-700 bg-white mt-1 rounded-xl" />
              </div>
              <div>
                <Label className="text-[11px] font-semibold text-slate-700">Date *</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-10 text-xs bg-white mt-1 rounded-xl" />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-[11px] font-semibold text-slate-700">Prepared By</Label>
                <Input value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} className="h-10 text-xs bg-white mt-1 rounded-xl" />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-100">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
                <input type="checkbox" checked={showRate} onChange={(e) => setShowRate(e.target.checked)} /> Show Rate
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
                <input type="checkbox" checked={showAmount} onChange={(e) => setShowAmount(e.target.checked)} /> Show Amount
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
                <input type="checkbox" checked={showOwner} onChange={(e) => handleShowOwnerChange(e.target.checked)} /> Show Owner Name
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200/80 shadow-2xs bg-white rounded-2xl">
        <CardContent className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-3 pb-2 border-b border-slate-100">
            <div>
              <div className="text-xs font-bold text-blue-900 uppercase tracking-wider font-mono">3. MATERIAL DISPATCH ITEMS TABLE</div>
              <div className="text-xs text-slate-500">Select items from master list or import from outward entries</div>
            </div>
            <Button variant="outline" size="sm" className="border-blue-200 text-blue-700 bg-blue-50/70 hover:bg-blue-100 font-semibold text-xs h-8 px-3 rounded-xl gap-1.5" onClick={addRow}>
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
                  <th className="p-3 w-24 text-right">Dispatch Qty</th>
                  {showRate && <th className="p-3 w-28 text-right">Rate (₹)</th>}
                  {showAmount && <th className="p-3 w-32 text-right">Amount (₹)</th>}
                  <th className="p-3 w-12 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-900 font-medium">
                {items.map((row) => (
                  <tr key={row.id}>
                    <td className="p-2.5 align-top">
                      <ProductAutocompleteInput value={row.product} onChange={(v) => handleRowChange(row.id, "product", v)} products={products} placeholder="Type or select product..." className="h-9 text-xs bg-white rounded-xl" />
                      <input type="text" className="text-[10px] text-slate-600 mt-1 w-full border-b border-slate-200 outline-none bg-transparent" placeholder="Enter serial numbers..." value={row.serial_numbers || ""} onChange={(e) => handleRowChange(row.id, "serial_numbers", e.target.value)} />
                    </td>
                    <td className="p-2.5 align-top"><Input value={row.size} onChange={(e) => handleRowChange(row.id, "size", e.target.value)} className="h-9 text-xs bg-white rounded-xl" /></td>
                    <td className="p-2.5 align-top"><Input value={row.unit} onChange={(e) => handleRowChange(row.id, "unit", e.target.value)} className="h-9 text-xs bg-white rounded-xl" /></td>
                    <td className="p-2.5 align-top"><Input type="number" value={row.dispatch_qty} onChange={(e) => handleRowChange(row.id, "dispatch_qty", e.target.value)} className="h-9 text-xs font-bold text-right bg-white rounded-xl dispatch-no-spinner" /></td>
                    {showRate && <td className="p-2.5 align-top"><Input type="number" value={row.rate} onChange={(e) => handleRowChange(row.id, "rate", e.target.value)} className="h-9 text-xs font-semibold text-right bg-white rounded-xl dispatch-no-spinner" /></td>}
                    {showAmount && <td className="p-2.5 align-top text-right font-bold tabular-nums text-xs pt-4">{formatMoney(rowAmount(row))}</td>}
                    <td className="p-2.5 align-top text-center pt-3"><button type="button" onClick={() => removeRow(row.id)} className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50"><Trash2 className="w-4 h-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-[1fr_260px] pt-2">
            <div className="space-y-4">
              <div><Label className="text-[11px] font-semibold text-slate-700">Notes / Remarks</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="text-xs bg-white mt-1 rounded-xl" /></div>
              <div><Label className="text-[11px] font-semibold text-slate-700">Terms & Conditions</Label><Textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={2} className="text-xs bg-white mt-1 rounded-xl" /></div>
            </div>
            {showAmount && (
              <div className="space-y-2 rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 text-xs flex flex-col justify-center">
                <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500 font-semibold">Total Dispatch Amount</div>
                <div className="text-xl font-bold text-slate-900 font-mono">₹ {formatMoney(totals.total)}</div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200/80 shadow-2xs bg-white rounded-2xl">
        <CardContent className="p-5 sm:p-6 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>Generated Documents History</h3>
            <p className="text-xs text-slate-500">Recent delivery bill PDF records generated for clients</p>
          </div>
          {loadingHistory ? (
            <div className="text-xs text-slate-500 py-6 text-center italic">Loading history...</div>
          ) : history.length === 0 ? (
            <div className="text-xs text-slate-400 py-8 text-center italic">No generated delivery bill documents yet.</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/90 text-slate-800 font-mono text-[11px] uppercase tracking-wider font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Doc Number</th>
                    <th className="p-3">Client Name</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Prepared By</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-900 font-medium">
                  {history.map((doc) => (
                    <tr key={doc.id}>
                      <td className="p-3 font-mono font-bold text-blue-700">{doc.document_number}</td>
                      <td className="p-3 font-semibold">{doc.client_name}</td>
                      <td className="p-3 text-slate-500 font-mono">{doc.created_at ? dayjs(doc.created_at).format("YYYY-MM-DD HH:mm") : "—"}</td>
                      <td className="p-3 text-slate-600">{doc.prepared_by || "—"}</td>
                      <td className="p-3"><span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">{doc.status || "Active"}</span></td>
                      <td className="p-3 text-right space-x-1.5 whitespace-nowrap">
                        <Button variant="outline" size="sm" onClick={() => window.open(fileUrl(doc.id), "_blank")} className="h-8 text-xs rounded-lg border-slate-200">View</Button>
                        <Button variant="outline" size="sm" className="h-8 text-xs rounded-lg border-slate-200 text-slate-700" onClick={() => downloadFile(doc.id, doc.filename || "Delivery_Bill.pdf")}>Download</Button>
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
