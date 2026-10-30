import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api, { formatApiError, fileUrl } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  FileSpreadsheet, Upload, Clipboard, CheckCircle2, ArrowLeft, X,
  Plus, Camera, AlertTriangle, AlertCircle, Search, User, Loader2
} from "lucide-react";
import { fetchProductsDeduplicated, getCachedProducts } from "@/lib/productCache";
import {
  normalizeSizeForMatching,
  ControlledAutocompleteInput,
  ProductAutocompleteInput,
  VendorAutocompleteInput,
  ClientAutocompleteInput,
  B2BCustomerAutocompleteInput,
} from "./Inventory/_shared";
import { UNIT_OPTIONS, formatUnit, normalizeUnit, getStandardizedUnitOptions } from "@/lib/units";

const MODE_CONFIG = {
  inward: {
    title: "Manual Bulk Import — Inward Inventory",
    subtitle: "Upload CSV/Excel or paste tabular text, then review and import inward stock rows manually.",
    bulkEndpoint: "/inventory/bulk-inward",
    extraFields: ["bill_number"],
  },
  outward: {
    title: "Manual Bulk Import — Outward Dispatch",
    subtitle: "Upload CSV/Excel or paste tabular text, then review and import outward dispatch rows manually.",
    bulkEndpoint: "/inventory/bulk-outward",
    extraFields: ["client_name", "project_name", "outward_challan_no", "status"],
  },
};

const INWARD_REF_TYPES = ["Challan Number", "Purchase Invoice", "Delivery Note", "Stock Transfer"];
const OUTWARD_REF_TYPES = ["Challan Number", "Book Number", "Other"];
const INWARD_SRC_TYPES = [
  "Supplier Supply",
  "Client Return",
  "B2B Return",
  "Internal / Warehouse",
  "Repair Return",
  "Other",
];
const OUTWARD_TYPES = [
  "Client Sale",
  "B2B Sale",
  "Return to Supplier",
];
const STATUS_OPTIONS = ["Dispatched", "Pending", "Cancelled"];

const isNumeric = (value) => {
  if (value === undefined || value === null) return false;
  const cleaned = String(value).replace(/,/g, "").trim();
  return cleaned !== "" && !Number.isNaN(Number(cleaned));
};

const parseCsvLine = (line) => {
  const row = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      row.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  row.push(current.trim());
  return row;
};

const detectDelimiter = (lines) => {
  const tabLines = lines.filter((line) => line.includes("\t")).length;
  if (tabLines > 0 && tabLines >= lines.length / 2) return "\t";
  if (lines.some((line) => line.includes("\t"))) return "\t";
  if (lines.every((line) => line.includes("|"))) return "|";
  if (lines.every((line) => line.includes(";"))) return ";";
  const commaCount = lines[0].split(",").length;
  if (commaCount > 1 && lines.every((line) => line.split(",").length === commaCount)) return ",";
  if (lines.some((line) => /\s{2,}/.test(line))) return /\s{2,}/;
  return "\t";
};

const splitLine = (line, delimiter) => {
  if (delimiter === ",") return parseCsvLine(line);
  if (typeof delimiter === "string") return line.split(delimiter).map((cell) => cell.trim());
  return line.split(delimiter).map((cell) => cell.trim());
};

const normalizeHeader = (text) => String(text || "").trim().toLowerCase();
const hasHeaderRow = (row) => row.some((cell) => {
  const text = normalizeHeader(cell);
  return /product|item|description|size|spec|qty|quantity|unit|vendor|supplier|source|client|project|challan|invoice|bill|remarks|status|date/.test(text);
});

const inferFieldMap = (headerRow) => {
  const map = {};
  let productIdx, sizeIdx, quantityIdx, unitIdx;

  (headerRow || []).forEach((cell, index) => {
    const name = normalizeHeader(cell);
    if (productIdx === undefined && /product|item|description|material/.test(name)) {
      productIdx = index;
    } else if (sizeIdx === undefined && /size|spec|specification|dimensions|rating|capacity|wp/.test(name)) {
      sizeIdx = index;
    } else if (quantityIdx === undefined && /qty|quantity|count|nos|amount|pieces/.test(name)) {
      quantityIdx = index;
    } else if (unitIdx === undefined && (/^unit\b|uom|measure/.test(name) || name === "unit")) {
      unitIdx = index;
    }
  });

  if (productIdx !== undefined) map.product = productIdx;
  if (sizeIdx !== undefined) map.size = sizeIdx;
  if (quantityIdx !== undefined) map.quantity = quantityIdx;
  if (unitIdx !== undefined) map.unit = unitIdx;

  // Strict 4-column fallback for positional data:
  // 0: product, 1: size, 2: quantity, 3: unit.
  // We NEVER map extra columns (4, 5, 6, etc.) to transaction metadata!
  const requiredFields = ["product", "size", "quantity", "unit"];
  requiredFields.forEach((field, index) => {
    if (map[field] === undefined) {
      map[field] = index;
    }
  });

  return map;
};

const findClient = (identifier, clientsList = []) => {
  if (!identifier) return null;
  const list = Array.isArray(clientsList) ? clientsList : (clientsList?.clients || clientsList?.items || []);
  const clean = String(identifier).trim().toLowerCase();
  let matched = list.find(c => String(c.full_name || "").trim().toLowerCase() === clean);
  if (matched) return matched;
  matched = list.find(c => String(c.sol_id || "").trim().toLowerCase() === clean);
  if (matched) return matched;
  matched = list.find(c => String(c.id || "").trim().toLowerCase() === clean);
  if (matched) return matched;
  matched = list.find(c => {
    const formatted = `${c.full_name || ""} (${c.sol_id || ""})`.trim().toLowerCase();
    return formatted === clean;
  });
  if (matched) return matched;
  return null;
};

const findVendor = (identifier, vendorsList = []) => {
  if (!identifier) return null;
  const list = Array.isArray(vendorsList) ? vendorsList : (vendorsList?.vendors || vendorsList?.items || []);
  const clean = String(identifier).trim().toLowerCase();
  let matched = list.find(v => String(v.name || "").trim().toLowerCase() === clean);
  if (matched) return matched;
  matched = list.find(v => String(v.id || "").trim().toLowerCase() === clean);
  if (matched) return matched;
  return null;
};

const findB2bCustomer = (identifier, b2bList = []) => {
  if (!identifier) return null;
  const list = Array.isArray(b2bList) ? b2bList : (b2bList?.customers || b2bList?.b2b_customers || b2bList?.items || []);
  const clean = String(identifier).trim().toLowerCase();
  let matched = list.find(b => String(b.name || b.full_name || "").trim().toLowerCase() === clean);
  if (matched) return matched;
  matched = list.find(b => String(b.id || "").trim().toLowerCase() === clean);
  if (matched) return matched;
  return null;
};

const getAvailableStock = (prodName, prodSize, productsList = []) => {
  if (!prodName) return 0;
  const cleanName = String(prodName).toUpperCase().trim();
  const cleanSize = normalizeSizeForMatching(prodSize);
  const list = Array.isArray(productsList) ? productsList : (productsList?.products || productsList?.items || []);
  const matched = list.find(
    (p) => (p.name || "").toUpperCase().trim() === cleanName && normalizeSizeForMatching(p.size) === cleanSize
  );
  if (matched) {
    return Number(matched.available_stock != null ? matched.available_stock : (matched.balance || 0));
  }
  return 0;
};

const autofillFromProductMaster = (row, productsList) => {
  if (!row || !row.product) return row;
  const cleanName = String(row.product).toUpperCase().trim();
  const cleanSize = normalizeSizeForMatching(row.size);
  const list = Array.isArray(productsList) ? productsList : (productsList?.products || productsList?.items || []);

  const sameName = list.filter((p) => (p.name || "").toUpperCase().trim() === cleanName);
  let matched = sameName.find((p) => normalizeSizeForMatching(p.size) === cleanSize);

  // If user provided no size, but catalog product has no size and exactly one item exists
  if (!matched && !cleanSize && sameName.length === 1 && !normalizeSizeForMatching(sameName[0].size)) {
    matched = sameName[0];
  }

  if (matched) {
    return {
      ...row,
      unit: row.unit ? formatUnit(row.unit) : formatUnit(matched.unit || "Nos"),
      size: row.size || matched.size || "",
      brand: row.brand || matched.brand || "",
      category: row.category || matched.category || "",
      master_product_id: matched.id || matched._id || row.master_product_id || "",
      product_id: matched.product_id || row.product_id || "",
      high_value_goods: row.high_value_goods != null ? row.high_value_goods : Boolean(matched.high_value_goods),
      serial_number_required: row.serial_number_required != null ? row.serial_number_required : Boolean(matched.serial_number_required),
    };
  }
  return {
    ...row,
    unit: row.unit ? formatUnit(row.unit) : "",
  };
};

const parseArraysToRows = (arrays, mode = "inward", clients = [], productsList = []) => {
  const cleanArrays = arrays
    .map((row) => row.map((cell) => String(cell ?? "").trim()))
    .filter((row) => row.some((cell) => cell !== ""));
  if (!cleanArrays.length) return { rows: [], hasExtraColumns: false };

  const header = cleanArrays[0];
  const useHeader = hasHeaderRow(header);
  const fieldMap = inferFieldMap(header);
  const body = cleanArrays.slice(useHeader ? 1 : 0);

  const maxColumns = Math.max(...cleanArrays.map((r) => r.length));
  const hasExtraColumns = maxColumns > 4 || (useHeader && header.length > 4);

  const parsedRows = body.map((row, index) => {
    const get = (field) => {
      const idx = fieldMap[field];
      return idx !== undefined && idx < row.length ? String(row[idx] ?? "").trim() : "";
    };

    const rawProduct = get("product").toUpperCase();
    const rawSize = get("size"); // Preserve cable size format exactly including * symbol
    const rawQty = get("quantity");
    const rawUnit = get("unit");

    // Accurately parse decimal quantities
    const cleanQtyStr = String(rawQty || "").replace(/,/g, "").trim();
    let parsedQty = "";
    if (cleanQtyStr !== "") {
      const num = parseFloat(cleanQtyStr);
      parsedQty = isNaN(num) ? "" : num;
    }

    // Normalize unit using formatUnit
    const unitVal = rawUnit ? formatUnit(rawUnit) : "";

    let rowObj = {
      _id: index,
      _selected: true,
      product: rawProduct,
      size: rawSize,
      quantity: parsedQty,
      unit: unitVal,
      source_type: "",
      source_name: "",
      vendor_id: "",
      party_type: "",
      outward_type: "",
      reference_number: "",
      challan_number: "",
      outward_challan_no: "",
      reference_type: "",
      bill_number: "",
      client_id: "",
      client_name: "",
      project_name: "",
      project_id: "",
      status: mode === "outward" ? "Dispatched" : "",
      remarks: "",
      date: "",
      high_value_goods: false,
      _overrides: {},
    };

    const safeProducts = Array.isArray(productsList) ? productsList : (productsList?.products || []);
    if (safeProducts.length > 0) {
      rowObj = autofillFromProductMaster(rowObj, safeProducts);
    }

    return rowObj;
  }).filter((row) => row.product || row.quantity !== "");

  return { rows: parsedRows, hasExtraColumns };
};

const buildCsvArrays = (text) => {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  if (!lines.length) return [];
  const delimiter = detectDelimiter(lines);
  return lines.map((line) => splitLine(line, delimiter));
};

const getBlankRow = (mode) => ({
  _id: Date.now() + Math.random(),
  _selected: true,
  product: "",
  size: "",
  quantity: 1,
  unit: "Nos",
  source_type: "",
  source_name: "",
  vendor_id: "",
  party_type: "",
  outward_type: "",
  reference_number: "",
  reference_type: "",
  challan_number: "",
  bill_number: "",
  client_id: "",
  client_name: "",
  project_name: "",
  project_id: "",
  outward_challan_no: "",
  status: mode === "outward" ? "Dispatched" : "",
  remarks: "",
  date: "",
  high_value_goods: false,
  _overrides: {},
});

const getRefHeaderLabel = (refType) => {
  if (!refType) return "Challan Number";
  const lower = refType.toLowerCase();
  if (lower.includes("challan")) return "Challan Number";
  if (lower.includes("bill")) return "Bill Number";
  if (lower.includes("invoice")) return "Invoice Number";
  if (lower.includes("grn")) return "GRN Number";
  return refType;
};

const getRowValidationErrors = (row, mode, productsList = [], isFinalReview = true) => {
  const errs = [];
  if (!row.product?.trim()) errs.push("Product required");
  if (!row.unit?.trim()) errs.push("Unit required");
  const qty = Number(row.quantity);
  if (row.quantity === "" || row.quantity === null || qty <= 0 || isNaN(qty)) {
    errs.push("Invalid quantity");
  }
  if (mode === "outward") {
    const avail = getAvailableStock(row.product, row.size, productsList);
    if (qty > avail) {
      errs.push(`Max stock: ${avail}`);
    }
    if (isFinalReview) {
      if (!row.client_name?.trim() && !row.client_id && !row.source_name?.trim()) {
        errs.push("Party required");
      }
    }
  } else {
    // Inward
    if (isFinalReview) {
      if (row.source_type === "Client Return" && !row.client_name?.trim() && !row.client_id) {
        errs.push("Client required");
      }
    }
  }
  return errs;
};

const isRowValid = (row, mode, productsList = [], isFinalReview = true) => getRowValidationErrors(row, mode, productsList, isFinalReview).length === 0;

const propagateDefaults = (currentRows, defaults, mode) => {
  return (currentRows || []).map((row) => {
    const overrides = row._overrides || {};

    const resolvedChallan = overrides.reference_number
      ? (row.reference_number || row.challan_number || row.outward_challan_no || "")
      : ((defaults.reference_number || "").trim() || row.reference_number || row.challan_number || row.outward_challan_no || "");

    const resolvedDate = overrides.date
      ? (row.date || "")
      : ((defaults.date || "").trim() || row.date || new Date().toISOString().split("T")[0]);

    const resolvedRemarks = overrides.remarks
      ? (row.remarks || "")
      : ((defaults.remarks || "").trim() || row.remarks || "");

    const resolvedRefType = overrides.reference_type
      ? (row.reference_type || "")
      : (defaults.reference_type || row.reference_type || "Challan Number");

    if (mode === "inward") {
      const resolvedSourceType = overrides.source_type && row.source_type
        ? row.source_type
        : (defaults.source_type || "Supplier Supply");

      let client_name = row.client_name || "";
      let client_id = row.client_id || "";
      let source_name = row.source_name || "";
      let vendor_id = row.vendor_id || "";
      let project_name = row.project_name || "";
      let project_id = row.project_id || "";

      if (resolvedSourceType === "Client Return") {
        if (!overrides.client_name && !overrides.client_supplier) {
          client_name = defaults.client_name || "";
          client_id = defaults.client_id || "";
          source_name = defaults.client_name || "";
        } else {
          source_name = client_name;
        }
        if (!overrides.project_name) {
          project_name = defaults.project_name || "";
          project_id = defaults.project_id || "";
        }
      } else if (resolvedSourceType === "Supplier Supply") {
        if (!overrides.source_name && !overrides.client_supplier) {
          source_name = defaults.source_name || "";
          vendor_id = defaults.vendor_id || "";
          client_name = "";
          client_id = "";
        }
      } else if (resolvedSourceType === "B2B Return") {
        if (!overrides.client_name && !overrides.client_supplier) {
          client_name = defaults.client_name || "";
          client_id = defaults.client_id || "";
          source_name = defaults.client_name || "";
        } else {
          source_name = client_name;
        }
      } else {
        if (!overrides.source_name && !overrides.client_supplier) {
          source_name = defaults.source_name || "";
        }
      }

      const resolvedHighValue = overrides.high_value_goods != null
        ? Boolean(row.high_value_goods)
        : Boolean(defaults.high_value_goods);

      return {
        ...row,
        reference_number: resolvedChallan,
        challan_number: resolvedChallan,
        outward_challan_no: resolvedChallan,
        bill_number: row.bill_number || (resolvedRefType === "Bill Number" || resolvedRefType === "Purchase Invoice" ? resolvedChallan : ""),
        date: resolvedDate,
        remarks: resolvedRemarks,
        reference_type: resolvedRefType,
        source_type: resolvedSourceType,
        source_name,
        vendor_id,
        client_name,
        client_id,
        project_name,
        project_id,
        high_value_goods: resolvedHighValue,
        high_value_asset: resolvedHighValue,
        _overrides: overrides,
      };
    } else {
      // Outward
      const resolvedPartyType = overrides.party_type && row.party_type
        ? row.party_type
        : (defaults.party_type || "Client Sale");

      let client_name = row.client_name || "";
      let client_id = row.client_id || "";
      let source_name = row.source_name || "";
      let vendor_id = row.vendor_id || "";
      let project_name = row.project_name || "";
      let project_id = row.project_id || "";

      if (resolvedPartyType === "Client Sale") {
        if (!overrides.client_name && !overrides.client_supplier) {
          client_name = defaults.client_name || "";
          client_id = defaults.client_id || "";
          source_name = defaults.client_name || "";
        }
        if (!overrides.project_name) {
          project_name = defaults.project_name || "";
          project_id = defaults.project_id || "";
        }
      } else if (resolvedPartyType === "Return to Supplier") {
        if (!overrides.client_name && !overrides.client_supplier) {
          client_name = defaults.client_name || defaults.source_name || "";
          source_name = client_name;
          vendor_id = defaults.vendor_id || "";
          client_id = "";
        }
      } else if (resolvedPartyType === "B2B Sale") {
        if (!overrides.client_name && !overrides.client_supplier) {
          client_name = defaults.client_name || "";
          client_id = defaults.client_id || "";
          source_name = defaults.client_name || "";
          vendor_id = "";
        }
      }

      const resolvedStatus = overrides.status
        ? (row.status || "Dispatched")
        : (defaults.status || row.status || "Dispatched");

      return {
        ...row,
        reference_number: resolvedChallan,
        challan_number: resolvedChallan,
        outward_challan_no: resolvedChallan,
        bill_number: row.bill_number || "",
        date: resolvedDate,
        remarks: resolvedRemarks,
        reference_type: resolvedRefType,
        party_type: resolvedPartyType,
        outward_type: resolvedPartyType,
        client_name,
        client_id,
        source_name,
        vendor_id,
        project_name,
        project_id,
        status: resolvedStatus,
        _overrides: overrides,
      };
    }
  });
};

function ClientReturnSelector({
  value,
  clientId,
  clients = [],
  onSelect,
  onClear,
  onClientsLoaded,
}) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchingApi, setIsSearchingApi] = useState(false);
  const searchInputRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // Identify currently selected client
  const selectedClient = useMemo(() => {
    const list = Array.isArray(clients) ? clients : (clients?.clients || []);
    if (clientId) {
      const match = list.find((c) => String(c.id) === String(clientId));
      if (match) return match;
    }
    if (value) {
      const cleanVal = String(value).trim().toLowerCase();
      const match = list.find((c) => String(c.full_name || "").trim().toLowerCase() === cleanVal);
      if (match) return match;
      const matchSol = list.find((c) => String(c.sol_id || "").trim().toLowerCase() === cleanVal);
      if (matchSol) return matchSol;
    }
    return null;
  }, [clients, clientId, value]);

  // Debounced API search for full workspace coverage
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      try {
        setIsSearchingApi(true);
        const res = await api.get("/clients", { params: { search: q, limit: 100 } });
        const list = Array.isArray(res?.data) ? res.data : (res?.data?.clients || res?.data?.items || []);
        if (list.length > 0 && onClientsLoaded) {
          onClientsLoaded(list);
        }
      } catch (e) {
        // Ignore background search errors
      } finally {
        setIsSearchingApi(false);
      }
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchQuery, onClientsLoaded]);

  // Filter clients locally
  const filteredClients = useMemo(() => {
    const list = Array.isArray(clients) ? clients : (clients?.clients || []);
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return list.slice(0, 100);
    }
    return list.filter((c) => {
      const name = String(c.full_name || "").toLowerCase();
      const sol = String(c.sol_id || "").toLowerCase();
      const phone = String(c.mobile || c.phone || "").toLowerCase();
      const proj = String(c.project_name || "").toLowerCase();
      const consumer = String(c.consumer_number || "").toLowerCase();
      return name.includes(q) || sol.includes(q) || phone.includes(q) || proj.includes(q) || consumer.includes(q);
    }).slice(0, 100);
  }, [clients, searchQuery]);

  const handleSelectClient = (c) => {
    onSelect(c);
    setSearchQuery("");
    setOpen(false);
  };

  const handleClear = (e) => {
    e?.stopPropagation?.();
    onClear();
    setSearchQuery("");
    setOpen(false);
  };

  const hasSelection = Boolean(value || clientId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {hasSelection ? (
        <div className="flex items-center justify-between p-2.5 bg-blue-50/70 border border-blue-200/90 rounded-2xl transition shadow-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <User className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-900 text-xs sm:text-sm truncate">
                  {selectedClient?.full_name || value}
                </span>
                {(selectedClient?.sol_id || selectedClient?.id) && (
                  <Badge variant="outline" className="bg-white text-blue-700 border-blue-200 text-[10px] font-mono font-medium px-1.5 py-0">
                    {selectedClient?.sol_id || `ID: ${String(selectedClient.id).slice(0, 8)}`}
                  </Badge>
                )}
              </div>
              <div className="text-[11px] text-slate-500 truncate mt-0.5">
                {selectedClient?.project_name ? `Project: ${selectedClient.project_name}` : ""}
                {selectedClient?.project_name && (selectedClient?.mobile || selectedClient?.phone) ? " · " : ""}
                {selectedClient?.mobile || selectedClient?.phone ? `Mobile: ${selectedClient.mobile || selectedClient.phone}` : ""}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-100/70 h-8 px-2.5 rounded-lg"
              >
                Change
              </Button>
            </PopoverTrigger>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleClear}
              className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
              title="Clear client selection"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      ) : (
        <PopoverTrigger asChild>
          <div className="relative w-full cursor-pointer">
            <Input
              readOnly
              value=""
              placeholder="Search and select client by name or SOL ID..."
              className="pl-9 pr-8 h-10 text-xs bg-white border-slate-200 rounded-xl cursor-pointer"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </PopoverTrigger>
      )}

      <PopoverContent
        className="p-2 border border-slate-200 bg-white rounded-2xl shadow-2xl z-[99999] w-[var(--radix-popover-trigger-width)] min-w-[320px] max-w-[500px]"
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          setTimeout(() => searchInputRef.current?.focus(), 50);
        }}
      >
        <div className="relative mb-2">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Type name, SOL ID, mobile..."
            className="h-8 text-xs pl-8 pr-7 bg-slate-50 border-slate-200 rounded-lg"
            autoFocus
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="max-h-60 overflow-y-auto space-y-0.5 divide-y divide-slate-100">
          {isSearchingApi && (
            <div className="flex items-center justify-center gap-1.5 py-2 text-xs text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Searching clients...</span>
            </div>
          )}

          {filteredClients.length === 0 && !isSearchingApi ? (
            <div className="text-center py-6 text-xs text-slate-400">
              No matching clients found
              {searchQuery && <span className="block text-[11px] text-slate-400 mt-0.5">Try searching with a different name or SOL ID</span>}
            </div>
          ) : (
            filteredClients.map((c) => (
              <button
                key={c.id || c.sol_id || c.full_name}
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-blue-50/80 rounded-xl transition flex items-center justify-between gap-2"
                onClick={() => handleSelectClient(c)}
              >
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 text-xs truncate">
                    {c.full_name}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate mt-0.5">
                    {c.project_name ? `Project: ${c.project_name}` : ""}
                    {c.project_name && (c.mobile || c.phone) ? " · " : ""}
                    {c.mobile || c.phone ? `Mobile: ${c.mobile || c.phone}` : ""}
                  </div>
                </div>
                {c.sol_id && (
                  <Badge variant="outline" className="bg-slate-50 text-blue-700 border-blue-200 text-[10px] font-mono font-medium shrink-0">
                    {c.sol_id}
                  </Badge>
                )}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const EMPTY_PRODUCTS = [];

export default function ManualBulkImport({
  open,
  onOpenChange,
  onClose,
  onImported,
  onImportSuccess,
  mode: propMode,
  type,
  products = EMPTY_PRODUCTS,
}) {
  const mode = propMode || type || "inward";
  const handleOpenChange = useCallback(
    (val) => {
      if (onOpenChange) onOpenChange(val);
      if (!val && onClose) onClose();
    },
    [onOpenChange, onClose]
  );
  const handleImported = onImported || onImportSuccess;

  const cfg = MODE_CONFIG[mode] || MODE_CONFIG.inward;
  const [step, setStep] = useState("input");
  const [inputMode, setInputMode] = useState("text");
  const [rawText, setRawText] = useState("");
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [errors, setErrors] = useState("");
  const [processing, setProcessing] = useState(false);
  const [hasExtraColumnsWarning, setHasExtraColumnsWarning] = useState(false);
  const [previewPage, setPreviewPage] = useState(1);
  const [importProgress, setImportProgress] = useState(0);
  const [cancelImport, setCancelImport] = useState(false);
  const cancelImportRef = useRef(false);
  const [clients, setClients] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [b2bCustomers, setB2bCustomers] = useState([]);
  const [productsList, setProductsList] = useState(
    Array.isArray(products) ? products : (products?.products || [])
  );
  const [globalDefaults, setGlobalDefaults] = useState({
    date: new Date().toISOString().split("T")[0],
    reference_type: "Challan Number",
    reference_number: "",
    source_type: "Supplier Supply",
    source_name: "",
    vendor_id: "",
    party_type: "Client Sale",
    outward_type: "Client Sale",
    client_id: "",
    client_name: "",
    project_id: "",
    project_name: "",
    remarks: "",
    status: "Dispatched",
    high_value_goods: false,
  });
  const fileInputRef = useRef(null);
  const photoInputRef = useRef(null);

  const resetState = useCallback(() => {
    setStep("input");
    setInputMode("text");
    setRawText("");
    setFile(null);
    setFileName("");
    setRows([]);
    setAttachments([]);
    setErrors("");
    setProcessing(false);
    setHasExtraColumnsWarning(false);
    setPreviewPage(1);
    setImportProgress(0);
    setCancelImport(false);
    cancelImportRef.current = false;
    setGlobalDefaults({
      date: new Date().toISOString().split("T")[0],
      reference_type: "Challan Number",
      reference_number: "",
      source_type: "Supplier Supply",
      source_name: "",
      vendor_id: "",
      party_type: "Client Sale",
      outward_type: "Client Sale",
      client_id: "",
      client_name: "",
      project_id: "",
      project_name: "",
      remarks: "",
      status: "Dispatched",
      high_value_goods: false,
    });
  }, []);

  useEffect(() => {
    if (products) {
      const arr = Array.isArray(products) ? products : (products?.products || []);
      if (arr.length > 0) {
        setProductsList(arr);
      }
    }
  }, [products]);

  useEffect(() => {
    if (!open) {
      resetState();
      return;
    }
    resetState();

    Promise.allSettled([
      api.get("/clients", { params: { limit: 500 } }),
      api.get("/vendors"),
      api.get("/inventory/b2b-customers"),
    ]).then(([resClients, resVendors, resB2b]) => {
      if (resClients.status === "fulfilled") {
        const d = resClients.value?.data;
        const list = Array.isArray(d) ? d : (d?.clients || d?.items || []);
        setClients(list);
      }
      if (resVendors.status === "fulfilled") {
        const d = resVendors.value?.data;
        const list = Array.isArray(d) ? d : (d?.vendors || d?.items || []);
        setVendors(list);
      }
      if (resB2b.status === "fulfilled") {
        const d = resB2b.value?.data;
        const list = Array.isArray(d) ? d : (d?.customers || d?.b2b_customers || d?.items || []);
        setB2bCustomers(list);
      }
    });

    const hasPassedProducts = Array.isArray(products) ? products.length > 0 : Boolean(products?.products?.length);
    if (!hasPassedProducts) {
      const cached = getCachedProducts();
      if (cached && Array.isArray(cached) && cached.length > 0) {
        setProductsList(cached);
      }
      fetchProductsDeduplicated()
        .then((list) => {
          const arr = Array.isArray(list) ? list : (list?.products || []);
          setProductsList(arr);
        })
        .catch(() => {});
    } else {
      setProductsList(Array.isArray(products) ? products : (products?.products || []));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const matchProduct = (name, size) => {
    if (!name) return "empty";
    const cleanName = name.toUpperCase().trim();
    const cleanSize = normalizeSizeForMatching(size);
    const list = Array.isArray(productsList) ? productsList : (productsList?.products || []);

    const sameName = list.filter((p) => (p.name || "").toUpperCase().trim() === cleanName);
    if (sameName.length > 0) {
      if (sameName.some(p => normalizeSizeForMatching(p.size) === cleanSize)) return "matched";
    }

    if (list.find((p) => (p.name || "").toUpperCase().trim().includes(cleanName))) return "fuzzy";
    return "new";
  };

  const loadRowsFromText = async (text) => {
    const arrays = buildCsvArrays(text);
    return parseArraysToRows(arrays, mode, clients, productsList);
  };

  const loadRowsFromFile = async (selected) => {
    const ext = (selected.name || "").split(".").pop().toLowerCase();
    if (["csv", "txt"].includes(ext)) {
      const text = await selected.text();
      return loadRowsFromText(text);
    }
    if (["xls", "xlsx"].includes(ext)) {
      const XLSX = await import("xlsx");
      const data = await selected.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const arrays = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false });
      return parseArraysToRows(arrays, mode, clients, productsList);
    }
    throw new Error("Unsupported file format. Use CSV, XLS, or XLSX.");
  };

  const handleParse = async () => {
    setProcessing(true);
    setErrors("");
    try {
      let result = { rows: [], hasExtraColumns: false };
      if (inputMode === "file") {
        if (!file) throw new Error("Select a CSV or Excel file first.");
        result = await loadRowsFromFile(file);
      } else {
        if (!rawText.trim()) throw new Error("Paste tabular text into the editor first.");
        result = await loadRowsFromText(rawText);
      }
      const parsed = result.rows || [];
      if (!parsed.length) throw new Error("No rows could be parsed from the input.");

      const enriched = parsed.map((row, index) => {
        const withMaster = autofillFromProductMaster(row, productsList);
        return { ...withMaster, _id: index, _selected: true };
      });

      setRows(enriched);
      setHasExtraColumnsWarning(Boolean(result.hasExtraColumns));
      setStep("input");
      if (result.hasExtraColumns) {
        toast.warning("Extra columns detected and ignored. Only Product, Size, Quantity, and Unit are imported.");
      } else {
        toast.success(`Parsed ${enriched.length} rows. Review and edit them below before proceeding.`);
      }
    } catch (err) {
      setErrors(err?.message || "Unable to parse the input.");
    } finally {
      setProcessing(false);
    }
  };

  const updateCell = (rowIndex, field, value, extraObj = null) => {
    setRows((prev) => {
      const next = [...prev];
      let row = { ...next[rowIndex] };
      const overrides = { ...(row._overrides || {}), [field]: true };
      row._overrides = overrides;

      if (field === "reference_value" || field === "reference_number" || field === "challan" || field === "outward_challan_no") {
        const cleanVal = String(value ?? "").trim();
        row.reference_number = cleanVal;
        row.challan_number = cleanVal;
        row.outward_challan_no = cleanVal;
        if (row.reference_type === "Bill Number" || globalDefaults.reference_type === "Bill Number" || row.reference_type === "Purchase Invoice") {
          row.bill_number = cleanVal;
        }
      } else if (field === "client_supplier") {
        if (mode === "inward") {
          row.source_name = value;
          if (row.source_type === "Client Return") {
            const matched = extraObj?.client || findClient(value, clients);
            row.client_name = extraObj?.name || (matched ? matched.full_name : value);
            row.client_id = extraObj?.id || (matched ? matched.id : "");
            row.source_name = row.client_name;
            if (matched?.project_name) row.project_name = matched.project_name;
            if (matched?.id) row.project_id = matched.id;
          } else if (row.source_type === "B2B Return") {
            const matched = extraObj?.client || findB2bCustomer(value, b2bCustomers);
            row.client_name = extraObj?.name || (matched ? (matched.name || matched.full_name) : value);
            row.client_id = extraObj?.id || (matched ? matched.id : "");
            row.source_name = row.client_name;
          } else {
            const matched = extraObj?.vendor || findVendor(value, vendors);
            row.vendor_id = extraObj?.id || (matched ? matched.id : "");
            row.source_name = extraObj?.name || (matched ? matched.name : value);
            row.client_name = "";
            row.client_id = "";
          }
        } else {
          // Outward
          if (row.party_type === "Return to Supplier") {
            const matched = extraObj?.vendor || findVendor(value, vendors);
            row.client_name = extraObj?.name || (matched ? matched.name : value);
            row.source_name = row.client_name;
            row.vendor_id = extraObj?.id || (matched ? matched.id : "");
            row.client_id = "";
          } else if (row.party_type === "B2B Sale") {
            const matched = extraObj?.client || findB2bCustomer(value, b2bCustomers);
            row.client_name = extraObj?.name || (matched ? (matched.name || matched.full_name) : value);
            row.source_name = row.client_name;
            row.client_id = extraObj?.id || (matched ? matched.id : "");
            row.vendor_id = "";
          } else {
            const matched = extraObj?.client || findClient(value, clients);
            row.client_name = extraObj?.name || (matched ? matched.full_name : value);
            row.source_name = row.client_name;
            row.client_id = extraObj?.id || (matched ? matched.id : "");
            row.project_name = extraObj?.project_name || (matched ? (matched.project_name || matched.full_name) : (row.project_name || value));
            row.project_id = extraObj?.project_id || (matched ? matched.id : "");
            row.vendor_id = "";
          }
        }
      } else if (field === "client_name") {
        const matched = extraObj?.client || findClient(value, clients);
        row.client_name = extraObj?.name || (matched ? matched.full_name : value);
        row.client_id = extraObj?.id || (matched ? matched.id : "");
        row.source_name = row.client_name;
        if (extraObj?.project_name || matched?.project_name) {
          row.project_name = extraObj?.project_name || matched.project_name;
          row.project_id = extraObj?.project_id || matched?.id || "";
        }
      } else if (field === "source_name") {
        row.source_name = value;
        if (row.source_type === "Client Return") {
          const matched = extraObj?.client || findClient(value, clients);
          row.client_name = extraObj?.name || (matched ? matched.full_name : value);
          row.client_id = extraObj?.id || (matched ? matched.id : "");
        } else if (row.source_type === "B2B Return") {
          const matched = extraObj?.client || findB2bCustomer(value, b2bCustomers);
          row.client_name = extraObj?.name || (matched ? (matched.name || matched.full_name) : value);
          row.client_id = extraObj?.id || (matched ? matched.id : "");
        } else {
          const matched = extraObj?.vendor || findVendor(value, vendors);
          row.vendor_id = extraObj?.id || (matched ? matched.id : "");
        }
      } else if (field === "source_type") {
        row.source_type = value;
      } else if (field === "party_type") {
        row.party_type = value;
        row.outward_type = value;
      } else if (field === "reference_type") {
        row.reference_type = value;
      } else if (field === "unit") {
        row.unit = formatUnit(value);
      } else if (field === "product") {
        row.product = String(value).toUpperCase();
        if (extraObj) {
          if (extraObj.size && (!row.size || row.size === "N/A" || !overrides.size)) row.size = extraObj.size;
          if (extraObj.unit && (!row.unit || row.unit === "PCS" || !overrides.unit)) row.unit = formatUnit(extraObj.unit);
          if (extraObj.category && !row.category) row.category = extraObj.category;
          if (extraObj.product_id) row.product_id = extraObj.product_id;
          if (extraObj.id) row.master_product_id = extraObj.id;
        }
        row = autofillFromProductMaster(row, productsList);
      } else if (field === "size") {
        row.size = value;
        row = autofillFromProductMaster(row, productsList);
      } else {
        row[field] = value;
      }

      next[rowIndex] = row;
      return next;
    });
  };

  const goToDefaultsStep = () => {
    if (!rows.length) return;
    setGlobalDefaults((prev) => {
      const next = { ...prev };
      if (!next.date || next.date === "") {
        next.date = new Date().toISOString().split("T")[0];
      }
      return next;
    });
    setStep("defaults");
  };

  const handleReviewTransition = () => {
    setRows((prevRows) => propagateDefaults(prevRows, globalDefaults, mode));
    setStep("review");
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/files/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const newAtt = {
        id: data.id,
        filename: data.filename || data.original_filename || file.name,
        isImage: file.type.startsWith("image/"),
      };
      setAttachments((prev) => [...prev, newAtt]);
      toast.success("Photo attached");
    } catch (err) {
      toast.error("Photo upload failed: " + formatApiError(err));
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const handleRemovePhoto = (id) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const toggleSelectRow = (index) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], _selected: !next[index]._selected };
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allSelected = rows.every((row) => row._selected);
    setRows((prev) => prev.map((row) => ({ ...row, _selected: !allSelected })));
  };

  const deleteRow = (index) => {
    setRows((prev) => prev.filter((_, idx) => idx !== index).map((row, idx) => ({ ...row, _id: idx })));
  };

  const deleteSelectedRows = () => {
    setRows((prev) => prev.filter((row) => !row._selected).map((row, idx) => ({ ...row, _id: idx })));
  };

  const addBlankRow = () => {
    setRows((prev) => [...prev, { ...getBlankRow(mode), _id: prev.length }]);
  };

  const selectedRows = rows.filter((row) => row._selected);
  const isFinalStep = step === "review";
  const invalidRowsCount = selectedRows.filter((row) => !isRowValid(row, mode, productsList, isFinalStep)).length;

  const handleFinalImport = async () => {
    const validRows = selectedRows.filter((r) => isRowValid(r, mode, productsList, true));
    if (!validRows.length) {
      toast.error("Select at least one valid row to import.");
      return;
    }
    setStep("importing");
    setImportProgress(0);
    setCancelImport(false);
    cancelImportRef.current = false;
    setProcessing(true);

    const CHUNK_SIZE = 25;
    const totalRows = validRows.length;
    let importedCount = 0;

    const attId = attachments.length > 0 ? attachments[0].id : "";
    const attFilename = attachments.length > 0 ? attachments[0].filename : "";
    const attIds = attachments.map((a) => a.id);

    try {
      const totalBatches = Math.ceil(totalRows / CHUNK_SIZE);
      for (let i = 0; i < totalRows; i += CHUNK_SIZE) {
        if (cancelImportRef.current) {
          toast.warning("Import cancelled by user.");
          break;
        }
        const batchNum = Math.floor(i / CHUNK_SIZE) + 1;
        const chunk = validRows.slice(i, i + CHUNK_SIZE).map((r) => ({
          ...r,
          quantity: Number(r.quantity),
          attachment_file_id: attId,
          attachment_filename: attFilename,
          attachment_file_ids: attIds,
        }));

        await api.post(
          cfg.bulkEndpoint,
          {
            rows: chunk,
            global_defaults: {
              ...globalDefaults,
              attachment_file_id: attId,
              attachment_filename: attFilename,
              attachment_file_ids: attIds,
            },
            attachment_file_id: attId,
            attachment_filename: attFilename,
            attachment_file_ids: attIds,
            source: "manual-bulk-import",
          },
          { timeout: 120000 }
        );
        importedCount += chunk.length;
        const progressPct = Math.round((importedCount / totalRows) * 100);
        setImportProgress(progressPct);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      if (!cancelImportRef.current) {
        setImportProgress(100);

        if (handleImported) {
          try {
            await Promise.resolve(handleImported());
          } catch (refreshErr) {
            console.error("[IMPORT] Post-import refresh error:", refreshErr);
          }
        }

        const totalRowsCount = rows.length;
        const skippedCount = totalRowsCount - importedCount;
        toast.success(`Import complete: ${importedCount} imported${skippedCount > 0 ? `, ${skippedCount} skipped` : ""}.`);
        resetState();
        handleOpenChange(false);
        return;
      } else {
        setStep("review");
      }
    } catch (err) {
      toast.error("Import failed: " + formatApiError(err));
      setStep("review");
    } finally {
      setProcessing(false);
    }
  };

  const handleFileSelection = (selected) => {
    setFile(selected);
    setFileName(selected?.name || "");
  };

  const handleClearFile = () => {
    setFile(null);
    setFileName("");
  };

  const safeProductsList = Array.isArray(productsList) ? productsList : (productsList?.products || []);
  const safeClients = Array.isArray(clients) ? clients : (clients?.clients || []);
  const safeVendors = Array.isArray(vendors) ? vendors : (vendors?.vendors || []);
  const safeB2b = Array.isArray(b2bCustomers) ? b2bCustomers : (b2bCustomers?.customers || []);


  const uniqueChallans = Array.from(new Set(
    (rows || []).map((r) => (r.reference_number || r.outward_challan_no || r.challan_number || r.bill_number || "").trim()).filter(Boolean)
  ));
  const hasMultipleChallans = uniqueChallans.length > 1;

  const uniqueClientSuppliers = Array.from(new Set(
    (rows || []).map((r) => ((mode === "inward" ? (r.source_name || r.client_name) : (r.client_name || r.source_name)) || "").trim()).filter(Boolean)
  ));
  const hasMultipleClients = uniqueClientSuppliers.length > 1;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-7xl w-full h-[95vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-slate-200 flex flex-row items-center justify-between shrink-0">
          <div>
            <DialogTitle className="text-lg font-bold">{cfg.title}</DialogTitle>
            <DialogDescription className="text-xs text-slate-500 mt-0.5">{cfg.subtitle}</DialogDescription>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className={`px-2.5 py-1 rounded-full font-semibold transition ${step === "input" ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-600"}`}>
              1. Import
            </div>
            <div className={`px-2.5 py-1 rounded-full font-semibold transition ${step === "defaults" ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-600"}`}>
              2. Defaults
            </div>
            <div className={`px-2.5 py-1 rounded-full font-semibold transition ${step === "review" ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-600"}`}>
              3. Review
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/70">
          {step === "input" && rows.length === 0 && (
            <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-3xl border shadow-sm">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Choose input method</div>
                      <p className="text-xs text-slate-500 mt-1">Paste structured rows or upload a file with your data.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant={inputMode === "text" ? "secondary" : "outline"} size="sm" onClick={() => setInputMode("text")}>Paste Text</Button>
                      <Button variant={inputMode === "file" ? "secondary" : "outline"} size="sm" onClick={() => setInputMode("file")}>Upload File</Button>
                    </div>
                  </div>

                  {inputMode === "text" ? (
                    <div className="mt-5">
                      <Label htmlFor="manual-import-text" className="text-[11px] uppercase tracking-wider text-slate-500">Tabular text input</Label>
                      <Textarea
                        id="manual-import-text"
                        value={rawText}
                        onChange={(e) => setRawText(e.target.value)}
                        rows={12}
                        className="mt-2 font-mono text-xs"
                        placeholder={`Paste rows with 4 product columns (Product, Size, Quantity, Unit):\nProduct\tSize\tQty\tUnit\n\nExample:\nWAAREE PANEL\t550W\t10\tNos\nDC CABLE\t4 SQ MM\t50\tMtr\nCABLE TIE\t200MM\t100\tPkt\n\n(Common transaction details like Date, Party, Challan & Remarks are set in Step 2)`}
                      />
                    </div>
                  ) : (
                    <div className="mt-5 space-y-4">
                      <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                        <Upload className="mx-auto mb-3 w-10 h-10 text-slate-400" />
                        <div className="text-sm font-semibold text-slate-900">Upload CSV or Excel file</div>
                        <p className="text-xs text-slate-500 mt-1">Supported: .csv, .xls, .xlsx</p>
                        <Button className="mt-4" onClick={() => fileInputRef.current?.click()}>Select File</Button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".csv,.xls,.xlsx"
                          className="hidden"
                          onChange={(e) => {
                            const selected = e.target.files?.[0];
                            if (selected) handleFileSelection(selected);
                          }}
                        />
                      </div>

                      {fileName && (
                        <div className="rounded-3xl border border-slate-200 bg-white p-4 flex items-center justify-between gap-4 text-sm text-slate-700">
                          <div className="flex items-center gap-3">
                            <FileSpreadsheet className="w-4 h-4 text-slate-400" />
                            <div>
                              <div className="font-semibold">{fileName}</div>
                              <div className="text-[11px] text-slate-500">Ready to parse</div>
                            </div>
                          </div>
                          <button type="button" onClick={handleClearFile} className="text-slate-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="bg-white p-6 rounded-3xl border shadow-sm">
                  <div className="flex items-center gap-3 text-slate-700">
                    <Clipboard className="w-5 h-5 text-slate-500" />
                    <div>
                      <div className="text-sm font-semibold">Step 1: Product Data Columns (4 Fields)</div>
                      <p className="text-xs text-slate-500">The parser extracts exactly four product columns. Extra columns are ignored.</p>
                    </div>
                  </div>
                  <ul className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <li>• <strong>Product Name</strong> (e.g. WAAREE 540W)</li>
                    <li>• <strong>Size / Specification</strong> (e.g. 540W, 4C*0.75)</li>
                    <li>• <strong>Quantity</strong> (e.g. 10, 12.5)</li>
                    <li>• <strong>Unit</strong> (Nos, Mtr, Kg, Pack, etc.)</li>
                  </ul>
                  <div className="mt-3 text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    ℹ️ <strong>Transaction details</strong> (Date, {mode === "inward" ? "Supplier / Client" : "Client / Vendor"}, Challan No, Project & Remarks) are configured in <strong>Step 2</strong>.
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-3xl border border-slate-200 bg-white p-6 text-slate-700">
                  <div className="text-sm font-semibold">Example Data</div>
                  <div className="mt-3 text-[11px] font-mono leading-6 text-slate-600 whitespace-pre-wrap bg-slate-50 p-3 rounded-xl border">
                    Product,Size,Qty,Unit{"\n"}
                    WAAREE PANEL,550W,10,Nos{"\n"}
                    DC CABLE,4 SQ MM,50,Mtr{"\n"}
                    FLEXIBLE CABLE,4C*0.75,25.5,Mtr
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">
                    Comma, tab, or pipe delimiters are automatically supported.
                  </p>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 text-slate-700">
                  <div className="text-sm font-semibold">Product Master Autofill</div>
                  <p className="text-xs text-slate-500 mt-2">When product & size match your Product Master, missing units and specifications are automatically retrieved.</p>
                </div>
              </div>
            </div>
          )}

          {step === "input" && rows.length > 0 && (() => {
            const itemsPerPage = 50;
            const totalPages = Math.ceil(rows.length / itemsPerPage);
            const startIdx = (previewPage - 1) * itemsPerPage;
            const endIdx = startIdx + itemsPerPage;
            const visibleRows = rows.slice(startIdx, endIdx);

            return (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white p-4 rounded-3xl border shadow-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-slate-100 text-slate-800 border-slate-300 font-semibold text-xs px-2.5 py-1">
                      {rows.length} rows imported
                    </Badge>
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold text-xs px-2.5 py-1">
                      {selectedRows.filter((r) => isRowValid(r, mode, productsList, false)).length} valid
                    </Badge>
                    {selectedRows.filter((r) => !isRowValid(r, mode, productsList, false)).length > 0 && (
                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 font-semibold text-xs px-2.5 py-1">
                        {selectedRows.filter((r) => !isRowValid(r, mode, productsList, false)).length} invalid
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRows([])}
                      className="text-slate-600 border-slate-300 hover:bg-slate-100 text-xs"
                    >
                      <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Re-import / Change Input
                    </Button>
                    <Button variant="outline" size="sm" onClick={toggleSelectAll} className="text-xs">
                      Toggle Select All
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 border-red-200 hover:bg-red-50 text-xs"
                      onClick={deleteSelectedRows}
                    >
                      Delete Selected
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-blue-600 border-blue-200 hover:bg-blue-50 text-xs"
                      onClick={addBlankRow}
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" /> Add Row
                    </Button>
                  </div>
                </div>

                {hasExtraColumnsWarning && (
                  <div className="flex items-center gap-2.5 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-800 shadow-sm">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span><strong>Extra columns detected and ignored:</strong> Only <strong>Product Name</strong>, <strong>Size</strong>, <strong>Quantity</strong>, and <strong>Unit</strong> are imported. Common transaction details (Date, Supplier/Client, Project, Challan) will be configured in Step 2.</span>
                  </div>
                )}

                <div className="overflow-x-auto bg-white border rounded-3xl shadow-sm">
                  <table className="min-w-full text-left text-xs text-slate-600">
                    <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="px-3 py-2.5 w-8">☑</th>
                        <th className="px-3 py-2.5">Product Name</th>
                        <th className="px-3 py-2.5">Size / Specification</th>
                        {mode === "outward" && <th className="px-3 py-2.5">Stock</th>}
                        <th className="px-3 py-2.5">Qty</th>
                        <th className="px-3 py-2.5">Unit</th>
                        <th className="px-3 py-2.5">Match Status</th>
                        <th className="px-3 py-2.5 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row) => {
                        const originalIndex = rows.findIndex((r) => r._id === row._id);
                        if (originalIndex === -1) return null;
                        const status = matchProduct(row.product, row.size);
                        const rowErrors = getRowValidationErrors(row, mode, productsList, false);
                        const availStock = getAvailableStock(row.product, row.size, productsList);

                        return (
                          <tr key={row._id} className={`${!row._selected ? "opacity-60" : ""} border-t border-slate-100 hover:bg-slate-50/50`}>
                            <td className="px-3 py-2.5 align-top">
                              <input
                                type="checkbox"
                                checked={row._selected}
                                onChange={() => toggleSelectRow(originalIndex)}
                                className="mt-2 accent-blue-600 w-4 h-4 cursor-pointer"
                              />
                            </td>
                            <td className="px-3 py-2.5 align-top min-w-[220px]">
                              <ProductAutocompleteInput
                                value={row.product || ""}
                                products={productsList}
                                placeholder="Search or enter product..."
                                className="text-xs h-8 bg-white border-slate-200"
                                onChange={(valOrObj) => {
                                  if (typeof valOrObj === "object" && valOrObj !== null) {
                                    updateCell(originalIndex, "product", valOrObj.name || valOrObj.product_name, valOrObj);
                                  } else {
                                    updateCell(originalIndex, "product", valOrObj);
                                  }
                                }}
                              />
                              {rowErrors.length > 0 && (
                                <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
                                  {rowErrors.map((err) => (
                                    <span key={err} className="text-red-600 font-semibold bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-md">{err}</span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2.5 align-top">
                              <Input
                                value={row.size || ""}
                                onChange={(e) => updateCell(originalIndex, "size", e.target.value)}
                                className="text-xs h-8 bg-white border-slate-200 w-28"
                                placeholder="Size/Spec"
                              />
                            </td>
                            {mode === "outward" && (
                              <td className="px-3 py-2.5 align-top">
                                <span className={`inline-flex items-center px-2 py-1 rounded text-[11px] font-semibold mt-1 ${Number(row.quantity) > availStock ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
                                  {availStock}
                                </span>
                              </td>
                            )}
                            <td className="px-3 py-2.5 align-top">
                              <Input
                                type="number"
                                step="any"
                                value={row.quantity ?? ""}
                                onChange={(e) => updateCell(originalIndex, "quantity", e.target.value)}
                                className="text-xs h-8 bg-white border-slate-200 w-24"
                                placeholder="Qty"
                              />
                            </td>
                            <td className="px-3 py-2.5 align-top">
                              <Select
                                value={row.unit || ""}
                                onValueChange={(value) => updateCell(originalIndex, "unit", value)}
                              >
                                <SelectTrigger className="h-8 text-xs bg-white border-slate-200 min-w-[80px]">
                                  <SelectValue placeholder="Select unit" />
                                </SelectTrigger>
                                <SelectContent>
                                  {getStandardizedUnitOptions(row.unit).map((unit) => (
                                    <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-3 py-2.5 align-top">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold mt-1.5 ${
                                status === "matched" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                                status === "fuzzy" ? "bg-amber-50 text-amber-700 border border-amber-200" :
                                "bg-blue-50 text-blue-700 border border-blue-200"
                              }`}>
                                {status === "matched" ? "Matched" : status === "fuzzy" ? "Partial" : "New"}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 align-top text-center">
                              <button
                                type="button"
                                onClick={() => deleteRow(originalIndex)}
                                className="text-slate-400 hover:text-red-600 mt-2 p-1 rounded"
                                title="Delete row"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {rows.length > itemsPerPage && (
                  <div className="flex items-center justify-between mt-4 bg-white border border-slate-200 rounded-3xl p-4 shadow-sm">
                    <div className="text-xs text-slate-500 font-medium">
                      Showing {startIdx + 1}–{Math.min(endIdx, rows.length)} of {rows.length} rows
                    </div>
                    <div className="flex items-center gap-3">
                      <Button variant="outline" size="sm" onClick={() => setPreviewPage((p) => Math.max(1, p - 1))} disabled={previewPage <= 1}>Previous</Button>
                      <span className="text-xs font-semibold text-slate-700">Page {previewPage} of {totalPages}</span>
                      <Button variant="outline" size="sm" onClick={() => setPreviewPage((p) => Math.min(totalPages, p + 1))} disabled={previewPage >= totalPages}>Next</Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {step === "defaults" && (
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="bg-white p-6 rounded-3xl border shadow-sm">
                <div className="text-sm font-semibold text-slate-900 mb-1">Common Transaction Defaults</div>
                <p className="text-xs text-slate-500 mb-4">Values derived automatically from imported rows. Values entered here will apply to rows without explicit values.</p>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={globalDefaults.date}
                      onChange={(e) => setGlobalDefaults({ ...globalDefaults, date: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Challan / Reference Number</Label>
                    <Input
                      value={globalDefaults.reference_number}
                      onChange={(e) => setGlobalDefaults({ ...globalDefaults, reference_number: e.target.value })}
                      placeholder="e.g. IN-1045"
                    />
                    {hasMultipleChallans && (
                      <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1 mt-1 font-medium flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>Multiple challan numbers detected (row-level values will be preserved)</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label>Reference Type</Label>
                    <Select
                      value={globalDefaults.reference_type}
                      onValueChange={(value) => setGlobalDefaults({ ...globalDefaults, reference_type: value })}
                    >
                      <SelectTrigger><SelectValue placeholder="Select reference type" /></SelectTrigger>
                      <SelectContent>
                        {(mode === "inward" ? INWARD_REF_TYPES : OUTWARD_REF_TYPES).map((type) => (
                          <SelectItem key={type} value={type}>{type}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {mode === "inward" ? (
                    <>
                      <div className="space-y-1.5">
                        <Label>Source Type</Label>
                        <Select
                          value={globalDefaults.source_type}
                          onValueChange={(value) => {
                            setGlobalDefaults({
                              ...globalDefaults,
                              source_type: value,
                              source_name: "",
                              client_name: "",
                              client_id: "",
                              project_name: "",
                              project_id: "",
                              vendor_id: "",
                            });
                          }}
                        >
                          <SelectTrigger><SelectValue placeholder="Select source type" /></SelectTrigger>
                          <SelectContent>
                            {INWARD_SRC_TYPES.map((st) => (
                              <SelectItem key={st} value={st}>{st}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {globalDefaults.source_type === "Client Return" ? (
                        <>
                          <div className="space-y-1.5">
                            <Label className="flex items-center justify-between">
                              <span>Client <span className="text-slate-400 font-normal">(Client Return)</span></span>
                              {globalDefaults.client_id && (
                                <span className="text-[11px] text-emerald-600 font-medium">Selected</span>
                              )}
                            </Label>
                            <ClientReturnSelector
                              value={globalDefaults.client_name}
                              clientId={globalDefaults.client_id}
                              clients={clients}
                              onSelect={(client) => {
                                setGlobalDefaults((prev) => ({
                                  ...prev,
                                  client_name: client.full_name || "",
                                  client_id: client.id || "",
                                  source_name: client.full_name || "",
                                  project_name: client.project_name || client.sol_id || client.full_name || "",
                                  project_id: client.id || "",
                                }));
                              }}
                              onClear={() => {
                                setGlobalDefaults((prev) => ({
                                  ...prev,
                                  client_name: "",
                                  client_id: "",
                                  source_name: "",
                                  project_name: "",
                                  project_id: "",
                                }));
                              }}
                              onClientsLoaded={(newClients) => {
                                setClients((prev) => {
                                  const existingIds = new Set(prev.map((c) => String(c.id)));
                                  const toAdd = newClients.filter((c) => !existingIds.has(String(c.id)));
                                  return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
                                });
                              }}
                            />
                            {hasMultipleClients && (
                              <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1 mt-1 font-medium flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                <span>Multiple supplier / client values detected (row-level values will be preserved)</span>
                              </div>
                            )}
                          </div>

                          <div className="space-y-1.5">
                            <Label>Project / Site Name</Label>
                            <Input
                              value={globalDefaults.project_name || ""}
                              onChange={(e) => setGlobalDefaults((prev) => ({ ...prev, project_name: e.target.value }))}
                              placeholder="Project name or site identifier"
                            />
                          </div>
                        </>
                      ) : (
                        <div className="space-y-1.5">
                          <Label>
                            {globalDefaults.source_type === "B2B Return"
                              ? "B2B Customer Name"
                              : globalDefaults.source_type === "Supplier Supply"
                              ? "Vendor / Supplier Name"
                              : "Source / Location Name"}
                          </Label>
                          {globalDefaults.source_type === "B2B Return" ? (
                            <B2BCustomerAutocompleteInput
                              value={globalDefaults.client_name || globalDefaults.source_name || ""}
                              customers={b2bCustomers}
                              placeholder="Search and select B2B customer"
                              onChange={(label, cust) => {
                                setGlobalDefaults((prev) => ({
                                  ...prev,
                                  client_name: label,
                                  source_name: label,
                                  client_id: cust ? cust.id : "",
                                  vendor_id: "",
                                }));
                              }}
                              onClear={() => {
                                setGlobalDefaults((prev) => ({
                                  ...prev,
                                  client_name: "",
                                  source_name: "",
                                  client_id: "",
                                }));
                              }}
                            />
                          ) : globalDefaults.source_type === "Supplier Supply" ? (
                            <VendorAutocompleteInput
                              value={globalDefaults.source_name || ""}
                              vendors={vendors}
                              placeholder="Search and select supplier / vendor"
                              onChange={(label, vendor) => {
                                setGlobalDefaults((prev) => ({
                                  ...prev,
                                  source_name: label,
                                  vendor_id: vendor ? vendor.id : "",
                                  client_name: "",
                                  client_id: "",
                                }));
                              }}
                              onClear={() => {
                                setGlobalDefaults((prev) => ({
                                  ...prev,
                                  source_name: "",
                                  vendor_id: "",
                                }));
                              }}
                            />
                          ) : (
                            <Input
                              value={globalDefaults.source_name || ""}
                              onChange={(e) => setGlobalDefaults((prev) => ({ ...prev, source_name: e.target.value }))}
                              placeholder="e.g. Main Warehouse"
                            />
                          )}
                          {hasMultipleClients && (
                            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1 mt-1 font-medium flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span>Multiple supplier / client values detected (row-level values will be preserved)</span>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="space-y-1.5">
                        <Label>Dispatch Type</Label>
                        <Select
                          value={globalDefaults.party_type || globalDefaults.outward_type || "Client Sale"}
                          onValueChange={(value) => {
                            setGlobalDefaults({
                              ...globalDefaults,
                              party_type: value,
                              outward_type: value,
                              client_name: "",
                              client_id: "",
                              vendor_id: "",
                            });
                          }}
                        >
                          <SelectTrigger><SelectValue placeholder="Select dispatch type" /></SelectTrigger>
                          <SelectContent>
                            {OUTWARD_TYPES.map((ot) => (
                              <SelectItem key={ot} value={ot}>{ot}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label>
                          {globalDefaults.party_type === "Return to Supplier"
                            ? "Supplier / Vendor Name"
                            : globalDefaults.party_type === "B2B Sale"
                            ? "B2B Customer Name"
                            : "Client Name"}
                        </Label>
                        {globalDefaults.party_type === "Return to Supplier" ? (
                          <VendorAutocompleteInput
                            value={globalDefaults.client_name || globalDefaults.source_name || ""}
                            vendors={vendors}
                            placeholder="Search and select vendor"
                            onChange={(label, vendor) => {
                              setGlobalDefaults((prev) => ({
                                ...prev,
                                client_name: label,
                                source_name: label,
                                vendor_id: vendor ? vendor.id : "",
                                client_id: "",
                              }));
                            }}
                            onClear={() => {
                              setGlobalDefaults((prev) => ({
                                ...prev,
                                client_name: "",
                                source_name: "",
                                vendor_id: "",
                                client_id: "",
                              }));
                            }}
                          />
                        ) : globalDefaults.party_type === "B2B Sale" ? (
                          <B2BCustomerAutocompleteInput
                            value={globalDefaults.client_name || ""}
                            customers={b2bCustomers}
                            placeholder="Search and select B2B customer"
                            onChange={(label, cust) => {
                              setGlobalDefaults((prev) => ({
                                ...prev,
                                client_name: label,
                                client_id: cust ? cust.id : "",
                                vendor_id: "",
                              }));
                            }}
                            onClear={() => {
                              setGlobalDefaults((prev) => ({
                                ...prev,
                                client_name: "",
                                client_id: "",
                              }));
                            }}
                          />
                        ) : (
                          <ClientAutocompleteInput
                            value={globalDefaults.client_name || ""}
                            clients={clients}
                            placeholder="Search and select client by name or SOL ID..."
                            onChange={(label, client) => {
                              setGlobalDefaults((prev) => ({
                                ...prev,
                                client_name: label,
                                client_id: client ? client.id : "",
                                source_name: label,
                                project_name: client?.project_name || client?.sol_id || prev.project_name || "",
                                project_id: client?.id || prev.project_id || "",
                                vendor_id: "",
                              }));
                            }}
                            onClear={() => {
                              setGlobalDefaults((prev) => ({
                                ...prev,
                                client_name: "",
                                client_id: "",
                                project_name: "",
                                project_id: "",
                                vendor_id: "",
                              }));
                            }}
                          />
                        )}
                        {hasMultipleClients && (
                          <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1 mt-1 font-medium flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>Multiple party values detected (row-level values will be preserved)</span>
                          </div>
                        )}
                      </div>

                      {(!globalDefaults.party_type || globalDefaults.party_type === "Client Sale") && (
                        <div className="space-y-1.5">
                          <Label>Project / Site Name</Label>
                          <Input
                            value={globalDefaults.project_name}
                            onChange={(e) => setGlobalDefaults({ ...globalDefaults, project_name: e.target.value })}
                            placeholder="Project name"
                          />
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <Label>Status</Label>
                        <Select
                          value={globalDefaults.status}
                          onValueChange={(value) => setGlobalDefaults({ ...globalDefaults, status: value })}
                        >
                          <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}

                  {mode === "inward" && (
                    <div className="col-span-1 lg:col-span-2 space-y-1.5 flex items-center pt-2">
                      <Label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                        <input
                          type="checkbox"
                          checked={globalDefaults.high_value_goods || false}
                          onChange={(e) => setGlobalDefaults({ ...globalDefaults, high_value_goods: e.target.checked })}
                          className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                        />
                        High Value Goods Tracking (Apply to all rows)
                      </Label>
                    </div>
                  )}

                  <div className="col-span-1 lg:col-span-2 space-y-1.5">
                    <Label>Remarks</Label>
                    <Textarea
                      value={globalDefaults.remarks}
                      onChange={(e) => setGlobalDefaults({ ...globalDefaults, remarks: e.target.value })}
                      rows={3}
                      placeholder="Optional remarks for this batch"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === "review" && (() => {
            const itemsPerPage = 50;
            const totalPages = Math.ceil(rows.length / itemsPerPage);
            const startIdx = (previewPage - 1) * itemsPerPage;
            const endIdx = startIdx + itemsPerPage;
            const visibleRows = rows.slice(startIdx, endIdx);

            return (
              <div className="space-y-4">
                {/* Compact Photo / Attachment Section */}
                <div className="bg-white border rounded-3xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0">
                      <Camera className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-900">Transaction Photos & Attachments</div>
                      <div className="text-[11px] text-slate-500">Attach supporting challans, receipts, or photos to this import batch.</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {attachments.map((att) => (
                      <div
                        key={att.id}
                        className="relative flex items-center gap-1.5 bg-slate-100 border border-slate-200 rounded-xl pl-2 pr-1.5 py-1 text-xs text-slate-700 shadow-sm"
                      >
                        {att.isImage ? (
                          <img src={fileUrl(att.id)} alt={att.filename} className="w-5 h-5 rounded object-cover border border-slate-300" />
                        ) : (
                          <FileSpreadsheet className="w-4 h-4 text-slate-500" />
                        )}
                        <span className="max-w-[120px] truncate text-[11px] font-medium" title={att.filename}>{att.filename}</span>
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(att.id)}
                          className="text-slate-400 hover:text-red-600 p-0.5 rounded ml-0.5"
                          title="Remove attachment"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => photoInputRef.current?.click()}
                      disabled={uploadingPhoto}
                      className="h-8 text-xs font-semibold rounded-xl border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50 text-slate-700 gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" /> {uploadingPhoto ? "Uploading..." : "+ Add Photo"}
                    </Button>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={handlePhotoUpload}
                    />
                  </div>
                </div>

                {/* Import Summary & Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-3xl border shadow-sm">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="bg-slate-100 text-slate-800 border-slate-300 font-semibold text-xs px-2.5 py-1">
                      Rows: {rows.length}
                    </Badge>
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold text-xs px-2.5 py-1">
                      Valid: {selectedRows.filter((r) => isRowValid(r, mode, productsList, true)).length}
                    </Badge>
                    {rows.length - selectedRows.filter((r) => isRowValid(r, mode, productsList, true)).length > 0 && (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 font-semibold text-xs px-2.5 py-1">
                        Skipped: {rows.length - selectedRows.filter((r) => isRowValid(r, mode, productsList, true)).length}
                      </Badge>
                    )}
                    {selectedRows.filter((r) => !isRowValid(r, mode, productsList, true)).length > 0 && (
                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 font-semibold text-xs px-2.5 py-1">
                        Invalid: {selectedRows.filter((r) => !isRowValid(r, mode, productsList, true)).length}
                      </Badge>
                    )}
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-semibold text-xs px-2.5 py-1">
                      Photos: {attachments.length}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={toggleSelectAll} className="text-xs">
                      Toggle Select All
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 border-red-200 hover:bg-red-50 text-xs"
                      onClick={deleteSelectedRows}
                    >
                      Delete Selected
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-blue-600 border-blue-200 hover:bg-blue-50 text-xs"
                      onClick={addBlankRow}
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" /> Add Row
                    </Button>
                  </div>
                </div>

                {/* Complete Final Data Review Table */}
                <div className="overflow-x-auto bg-white border rounded-3xl shadow-sm">
                  <table className="min-w-full text-left text-xs text-slate-600">
                    <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="px-3 py-2.5 w-8">☑</th>
                        <th className="px-3 py-2.5">Product</th>
                        <th className="px-3 py-2.5">Size</th>
                        {mode === "outward" && <th className="px-3 py-2.5">Stock</th>}
                        <th className="px-3 py-2.5">Qty</th>
                        <th className="px-3 py-2.5">Unit</th>
                        {mode === "inward" ? (
                          <>
                            <th className="px-3 py-2.5">Source Type</th>
                            <th className="px-3 py-2.5">Vendor / Source</th>
                          </>
                        ) : (
                          <>
                            <th className="px-3 py-2.5">Dispatch Type</th>
                            <th className="px-3 py-2.5">Party Name</th>
                            <th className="px-3 py-2.5">Project</th>
                          </>
                        )}
                        <th className="px-3 py-2.5">{getRefHeaderLabel(globalDefaults.reference_type)}</th>
                        <th className="px-3 py-2.5">Date</th>
                        <th className="px-3 py-2.5">Remarks</th>
                        <th className="px-3 py-2.5">{mode === "inward" ? "High Value" : "Status"}</th>
                        <th className="px-3 py-2.5 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 ? (
                        <tr><td colSpan={13} className="px-3 py-10 text-center text-slate-500">No rows to review yet.</td></tr>
                      ) : (
                        visibleRows.map((row) => {
                          const originalIndex = rows.findIndex((r) => r._id === row._id);
                          if (originalIndex === -1) return null;
                          const status = matchProduct(row.product, row.size);
                          const rowErrors = getRowValidationErrors(row, mode, productsList, true);
                          const availStock = getAvailableStock(row.product, row.size, productsList);

                          return (
                            <tr key={row._id} className={`${!row._selected ? "opacity-60" : ""} border-t border-slate-100 hover:bg-slate-50/50`}>
                              <td className="px-3 py-2.5 align-top">
                                <input
                                  type="checkbox"
                                  checked={row._selected}
                                  onChange={() => toggleSelectRow(originalIndex)}
                                  className="mt-2 accent-blue-600 w-4 h-4 cursor-pointer"
                                />
                              </td>
                              <td className="px-3 py-2.5 align-top min-w-[200px]">
                                <ProductAutocompleteInput
                                  value={row.product || ""}
                                  products={productsList}
                                  placeholder="Search product..."
                                  className="text-xs h-8 bg-white border-slate-200"
                                  onChange={(valOrProduct) => {
                                    if (typeof valOrProduct === "object" && valOrProduct !== null) {
                                      updateCell(originalIndex, "product", valOrProduct.name || valOrProduct.product_name, valOrProduct);
                                    } else {
                                      updateCell(originalIndex, "product", valOrProduct);
                                    }
                                  }}
                                />
                                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                                  <span className={`font-semibold ${status === "matched" ? "text-emerald-600" : status === "fuzzy" ? "text-amber-600" : "text-blue-600"}`}>
                                    {status === "matched" ? "Matched" : status === "fuzzy" ? "Partial" : "New"}
                                  </span>
                                  {rowErrors.map((err) => (
                                    <span key={err} className="text-red-600 font-semibold bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-md">{err}</span>
                                  ))}
                                </div>
                              </td>
                              <td className="px-3 py-2.5 align-top">
                                <Input
                                  value={row.size || ""}
                                  onChange={(e) => updateCell(originalIndex, "size", e.target.value)}
                                  className="text-xs h-8 bg-white border-slate-200 w-24"
                                />
                              </td>
                              {mode === "outward" && (
                                <td className="px-3 py-2.5 align-top">
                                  <span className={`inline-flex items-center px-2 py-1 rounded text-[11px] font-semibold mt-1 ${Number(row.quantity) > availStock ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
                                    {availStock}
                                  </span>
                                </td>
                              )}
                              <td className="px-3 py-2.5 align-top">
                                <Input
                                  type="number"
                                  step="any"
                                  value={row.quantity ?? ""}
                                  onChange={(e) => updateCell(originalIndex, "quantity", e.target.value)}
                                  className="text-xs h-8 bg-white border-slate-200 w-20"
                                />
                              </td>
                              <td className="px-3 py-2.5 align-top">
                                <Select
                                  value={row.unit || ""}
                                  onValueChange={(value) => updateCell(originalIndex, "unit", value)}
                                >
                                  <SelectTrigger className="h-8 text-xs bg-white border-slate-200 min-w-[80px]">
                                    <SelectValue placeholder="Unit" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {getStandardizedUnitOptions(row.unit).map((unit) => (
                                      <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>
                              {mode === "inward" ? (
                                <>
                                  <td className="px-3 py-2.5 align-top">
                                    <Select
                                      value={row.source_type || "Supplier Supply"}
                                      onValueChange={(val) => updateCell(originalIndex, "source_type", val)}
                                    >
                                      <SelectTrigger className="h-8 text-xs bg-white border-slate-200 min-w-[130px]">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {INWARD_SRC_TYPES.map((st) => (
                                          <SelectItem key={st} value={st}>{st}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </td>
                                  <td className="px-3 py-2.5 align-top min-w-[150px]">
                                    {row.source_type === "Client Return" ? (
                                      <ClientAutocompleteInput
                                        value={row.source_name || row.client_name || ""}
                                        clients={clients}
                                        placeholder="Select client"
                                        className="text-xs h-8 bg-white border-slate-200"
                                        onChange={(label, client) => {
                                          updateCell(originalIndex, "client_supplier", label, client ? { client, id: client.id, name: client.full_name, project_name: client.project_name, project_id: client.id } : null);
                                        }}
                                        onClear={() => updateCell(originalIndex, "client_supplier", "")}
                                      />
                                    ) : row.source_type === "B2B Return" ? (
                                      <B2BCustomerAutocompleteInput
                                        value={row.client_name || row.source_name || ""}
                                        customers={b2bCustomers}
                                        placeholder="Select B2B customer"
                                        className="text-xs h-8 bg-white border-slate-200"
                                        onChange={(label, cust) => {
                                          updateCell(originalIndex, "client_supplier", label, cust ? { client: cust, id: cust.id, name: cust.name || cust.full_name } : null);
                                        }}
                                        onClear={() => updateCell(originalIndex, "client_supplier", "")}
                                      />
                                    ) : row.source_type === "Supplier Supply" ? (
                                      <VendorAutocompleteInput
                                        value={row.source_name || ""}
                                        vendors={vendors}
                                        placeholder="Supplier / Vendor"
                                        className="text-xs h-8 bg-white border-slate-200"
                                        onChange={(label, vendor) => {
                                          updateCell(originalIndex, "client_supplier", label, vendor ? { vendor, id: vendor.id, name: vendor.name } : null);
                                        }}
                                        onClear={() => updateCell(originalIndex, "client_supplier", "")}
                                      />
                                    ) : (
                                      <Input
                                        value={row.source_name || ""}
                                        onChange={(e) => updateCell(originalIndex, "source_name", e.target.value)}
                                        className="text-xs h-8 bg-white border-slate-200"
                                        placeholder="Source name"
                                      />
                                    )}
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className="px-3 py-2.5 align-top">
                                    <Select
                                      value={row.party_type || row.outward_type || "Client Sale"}
                                      onValueChange={(val) => updateCell(originalIndex, "party_type", val)}
                                    >
                                      <SelectTrigger className="h-8 text-xs bg-white border-slate-200 min-w-[130px]">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {OUTWARD_TYPES.map((ot) => (
                                          <SelectItem key={ot} value={ot}>{ot}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </td>
                                  <td className="px-3 py-2.5 align-top min-w-[150px]">
                                    {row.party_type === "Return to Supplier" ? (
                                      <VendorAutocompleteInput
                                        value={row.client_name || row.source_name || ""}
                                        vendors={vendors}
                                        placeholder="Select vendor"
                                        className="text-xs h-8 bg-white border-slate-200"
                                        onChange={(label, vendor) => {
                                          updateCell(originalIndex, "client_supplier", label, vendor ? { vendor, id: vendor.id, name: vendor.name } : null);
                                        }}
                                        onClear={() => updateCell(originalIndex, "client_supplier", "")}
                                      />
                                    ) : row.party_type === "B2B Sale" ? (
                                      <B2BCustomerAutocompleteInput
                                        value={row.client_name || row.source_name || ""}
                                        customers={b2bCustomers}
                                        placeholder="Select B2B customer"
                                        className="text-xs h-8 bg-white border-slate-200"
                                        onChange={(label, cust) => {
                                          updateCell(originalIndex, "client_supplier", label, cust ? { client: cust, id: cust.id, name: cust.name || cust.full_name } : null);
                                        }}
                                        onClear={() => updateCell(originalIndex, "client_supplier", "")}
                                      />
                                    ) : (
                                      <ClientAutocompleteInput
                                        value={row.client_name || row.source_name || ""}
                                        clients={clients}
                                        placeholder="Select client"
                                        className="text-xs h-8 bg-white border-slate-200"
                                        onChange={(label, client) => {
                                          updateCell(originalIndex, "client_supplier", label, client ? { client, id: client.id, name: client.full_name, project_name: client.project_name, project_id: client.id } : null);
                                        }}
                                        onClear={() => updateCell(originalIndex, "client_supplier", "")}
                                      />
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5 align-top">
                                    <Input
                                      value={row.project_name || ""}
                                      onChange={(e) => updateCell(originalIndex, "project_name", e.target.value)}
                                      className="text-xs h-8 bg-white border-slate-200 min-w-[110px]"
                                    />
                                  </td>
                                </>
                              )}
                              <td className="px-3 py-2.5 align-top">
                                <Input
                                  value={row.reference_number || row.challan_number || row.outward_challan_no || ""}
                                  onChange={(e) => updateCell(originalIndex, "reference_value", e.target.value)}
                                  className="text-xs h-8 bg-white border-slate-200 font-mono w-28"
                                  placeholder="Challan"
                                />
                              </td>
                              <td className="px-3 py-2.5 align-top">
                                <Input
                                  type="date"
                                  value={row.date ? row.date.slice(0, 10) : ""}
                                  onChange={(e) => updateCell(originalIndex, "date", e.target.value)}
                                  className="text-xs h-8 bg-white border-slate-200 w-32"
                                />
                              </td>
                              <td className="px-3 py-2.5 align-top">
                                <Input
                                  value={row.remarks || ""}
                                  onChange={(e) => updateCell(originalIndex, "remarks", e.target.value)}
                                  className="text-xs h-8 bg-white border-slate-200 min-w-[100px]"
                                />
                              </td>
                              <td className="px-3 py-2.5 align-top">
                                {mode === "inward" ? (
                                  <label className="flex items-center gap-1.5 text-[11px] text-slate-700 font-medium cursor-pointer mt-2">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(row.high_value_goods)}
                                      onChange={(e) => updateCell(originalIndex, "high_value_goods", e.target.checked)}
                                      className="w-3.5 h-3.5 rounded border-slate-300 text-slate-900"
                                    />
                                    High Value
                                  </label>
                                ) : (
                                  <Select
                                    value={row.status || "Dispatched"}
                                    onValueChange={(value) => updateCell(originalIndex, "status", value)}
                                  >
                                    <SelectTrigger className="h-7 text-[11px] bg-white border-slate-200 min-w-[95px]">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {STATUS_OPTIONS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                )}
                              </td>
                              <td className="px-3 py-2.5 align-top text-center">
                                <button
                                  type="button"
                                  onClick={() => deleteRow(originalIndex)}
                                  className="text-slate-400 hover:text-red-600 mt-2 p-1 rounded"
                                  title="Delete row"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {rows.length > itemsPerPage && (
                  <div className="flex items-center justify-between mt-4 bg-white border border-slate-200 rounded-3xl p-4 shadow-sm">
                    <div className="text-xs text-slate-500 font-medium">
                      Showing {startIdx + 1}–{Math.min(endIdx, rows.length)} of {rows.length} rows
                    </div>
                    <div className="flex items-center gap-3">
                      <Button variant="outline" size="sm" onClick={() => setPreviewPage((p) => Math.max(1, p - 1))} disabled={previewPage <= 1}>Previous</Button>
                      <span className="text-xs font-semibold text-slate-700">Page {previewPage} of {totalPages}</span>
                      <Button variant="outline" size="sm" onClick={() => setPreviewPage((p) => Math.min(totalPages, p + 1))} disabled={previewPage >= totalPages}>Next</Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {step === "importing" && (
            <div className="py-20 flex flex-col items-center justify-center space-y-6 max-w-md mx-auto">
              <Upload className="animate-spin w-12 h-12 text-blue-600" />
              <div className="w-full text-center space-y-2">
                <p className="text-sm font-semibold text-slate-700">Importing rows: {importProgress}%</p>
                <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden shadow-inner">
                  <div className="bg-blue-600 h-full transition-all duration-300" style={{ width: `${importProgress}%` }}></div>
                </div>
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="rounded-xl px-6"
                onClick={() => { cancelImportRef.current = true; setCancelImport(true); }}
              >
                Cancel Import
              </Button>
            </div>
          )}

          {step === "done" && (
            <div className="py-16 text-center space-y-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
              <h3 className="text-lg font-bold">Import Completed</h3>
              <p className="text-xs text-slate-500">Your manual bulk rows were saved successfully.</p>
            </div>
          )}

          {errors && step !== "done" && (
            <div className="mt-4 rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errors}</div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t flex flex-wrap gap-2 justify-end shrink-0">
          {step === "input" && (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
              {rows.length === 0 ? (
                <Button onClick={handleParse} disabled={processing}>{processing ? "Parsing…" : "Parse rows"}</Button>
              ) : (
                <Button onClick={goToDefaultsStep} disabled={selectedRows.length === 0}>Next: Defaults →</Button>
              )}
            </>
          )}
          {step === "defaults" && (
            <>
              <Button variant="outline" onClick={() => setStep("input")}><ArrowLeft className="w-4 h-4 mr-1.5" /> Back</Button>
              <Button onClick={handleReviewTransition}>Next: Review rows →</Button>
            </>
          )}
          {step === "review" && (
            <>
              <Button variant="outline" onClick={() => setStep("defaults")}><ArrowLeft className="w-4 h-4 mr-1.5" /> Back</Button>
              <Button
                onClick={handleFinalImport}
                disabled={processing || selectedRows.filter((r) => isRowValid(r, mode, productsList, true)).length === 0}
              >
                {processing
                  ? "Importing…"
                  : invalidRowsCount > 0
                  ? `Import ${selectedRows.filter((r) => isRowValid(r, mode, productsList, true)).length} Valid Rows (${invalidRowsCount} skipped)`
                  : `Import ${selectedRows.length} Rows`}
              </Button>
            </>
          )}
          {step === "done" && (
            <Button onClick={() => handleOpenChange(false)}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
