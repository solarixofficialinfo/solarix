import React, { useCallback, useEffect, useRef, useState } from "react";
import api, { formatApiError, fileUrl } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  FileSpreadsheet, Upload, Clipboard, CheckCircle2, ArrowLeft, X,
  Plus, Camera, AlertTriangle, AlertCircle
} from "lucide-react";
import { fetchProductsDeduplicated, getCachedProducts } from "@/lib/productCache";
import { normalizeSizeForMatching } from "./Inventory/_shared";
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

const REF_TYPES = ["Challan Number", "Invoice Number", "Book Number", "GRN Number", "Transport Number"];
const SRC_TYPES = ["Supplier", "Vendor", "Client Return", "Other"];
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
  if (lines.every((line) => line.includes("\t"))) return "\t";
  if (lines.every((line) => line.includes("|"))) return "|";
  if (lines.every((line) => line.includes(";"))) return ";";
  const commaCount = lines[0].split(",").length;
  if (commaCount > 1 && lines.every((line) => line.split(",").length === commaCount)) return ",";
  if (/\s{2,}/.test(lines[0])) return /\s{2,}/;
  return /\s+/;
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

const inferFieldMap = (headerRow, mode) => {
  const map = {};
  headerRow.forEach((cell, index) => {
    const name = normalizeHeader(cell);
    if (/product|item|description/.test(name)) {
      map.product = index;
    } else if (/size|spec/.test(name)) {
      map.size = index;
    } else if (/qty|quantity/.test(name)) {
      map.quantity = index;
    } else if (/^unit\b|unit/.test(name)) {
      map.unit = index;
    } else if (/client\s*[\/\&]\s*supplier|supplier\s*[\/\&]\s*client|client.*supplier/.test(name)) {
      map.client_supplier = index;
      if (mode === "inward") {
        map.source_name = index;
      } else {
        map.client_name = index;
      }
    } else if (/vendor|supplier|source name|source/.test(name)) {
      map.source_name = index;
    } else if (/source.*type|type/.test(name)) {
      map.source_type = index;
    } else if (/client/.test(name)) {
      map.client_name = index;
    } else if (/project/.test(name)) {
      map.project_name = index;
    } else if (/challan|reference|ref\s*no|ref.*number/.test(name)) {
      map.reference_number = index;
      map.outward_challan_no = index;
      map.challan_number = index;
      map.challan = index;
    } else if (/bill.*number|invoice.*number|bill no|invoice no|bill|invoice/.test(name)) {
      map.bill_number = index;
      if (map.reference_number === undefined) {
        map.reference_number = index;
      }
    } else if (/remarks|note/.test(name)) {
      map.remarks = index;
    } else if (/status/.test(name)) {
      map.status = index;
    } else if (/date/.test(name)) {
      map.date = index;
    }
  });

  const fallback = mode === "outward"
    ? ["product", "size", "quantity", "unit", "outward_challan_no", "client_name", "date", "remarks"]
    : ["product", "size", "quantity", "unit", "reference_number", "source_name", "date", "remarks"];

  fallback.forEach((field, index) => {
    if (map[field] === undefined) map[field] = index;
  });
  return map;
};

const findClient = (identifier, clientsList = []) => {
  if (!identifier) return null;
  const clean = String(identifier).trim().toLowerCase();
  let matched = clientsList.find(c => String(c.full_name || "").trim().toLowerCase() === clean);
  if (matched) return matched;
  matched = clientsList.find(c => String(c.sol_id || "").trim().toLowerCase() === clean);
  if (matched) return matched;
  matched = clientsList.find(c => String(c.id || "").trim().toLowerCase() === clean);
  if (matched) return matched;
  matched = clientsList.find(c => String(c.full_name || "").trim().toLowerCase().includes(clean));
  if (matched) return matched;
  return null;
};

const autofillFromProductMaster = (row, productsList) => {
  if (!row || !row.product) return row;
  const cleanName = String(row.product).toUpperCase().trim();
  const cleanSize = normalizeSizeForMatching(row.size);

  const sameName = (productsList || []).filter((p) => (p.name || "").toUpperCase().trim() === cleanName);
  let matched = sameName.find((p) => normalizeSizeForMatching(p.size) === cleanSize);
  if (!matched && sameName.length === 1) {
    matched = sameName[0];
  }

  if (matched) {
    return {
      ...row,
      unit: row.unit ? formatUnit(row.unit) : formatUnit(matched.unit || "Nos"),
      size: row.size || matched.size || "",
      brand: row.brand || matched.brand || "",
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
  if (!cleanArrays.length) return [];

  const header = cleanArrays[0];
  const useHeader = hasHeaderRow(header);
  const fieldMap = inferFieldMap(header, mode);
  const body = cleanArrays.slice(useHeader ? 1 : 0);

  return body.map((row, index) => {
    const get = (field) => {
      const idx = fieldMap[field];
      return idx !== undefined ? String(row[idx] ?? "").trim() : "";
    };

    const rawProduct = get("product").toUpperCase();
    const rawSize = get("size");
    const rawQty = get("quantity");
    const rawUnit = get("unit");
    const rawChallan = get("reference_number") || get("challan_number") || get("outward_challan_no") || get("challan") || get("bill_number") || "";
    const rawSupplier = get("source_name") || "";
    const rawClient = get("client_name") || "";
    const rawClientSupplier = get("client_supplier") || "";

    const clientSupplierVal = rawClientSupplier || (mode === "inward" ? (rawSupplier || rawClient) : (rawClient || rawSupplier));
    const matchedClient = findClient(clientSupplierVal, clients);

    let unitVal = rawUnit ? formatUnit(rawUnit) : "";

    let rowObj = {
      _id: index,
      _selected: true,
      product: rawProduct,
      size: rawSize,
      quantity: rawQty !== "" ? (Number(rawQty.replace(/,/g, "")) || 0) : "",
      unit: unitVal,
      source_type: mode === "inward" ? "Supplier" : "",
      source_name: mode === "inward" ? (rawSupplier || clientSupplierVal) : "",
      reference_number: rawChallan,
      challan_number: rawChallan,
      outward_challan_no: rawChallan,
      reference_type: "Challan Number",
      bill_number: get("bill_number") || "",
      client_id: matchedClient ? matchedClient.id : "",
      client_name: matchedClient ? matchedClient.full_name : (mode === "outward" ? clientSupplierVal : (rawClient || "")),
      project_name: get("project_name") || (matchedClient ? (matchedClient.project_name || matchedClient.full_name) : ""),
      project_id: matchedClient ? matchedClient.id : "",
      status: get("status") || (mode === "outward" ? "Dispatched" : ""),
      remarks: get("remarks") || "",
      date: get("date") || "",
    };

    if (productsList && productsList.length > 0) {
      rowObj = autofillFromProductMaster(rowObj, productsList);
    }

    return rowObj;
  }).filter((row) => row.product || row.quantity);
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
  _id: Date.now(),
  _selected: true,
  product: "",
  size: "",
  quantity: 1,
  unit: "Nos",
  source_type: "Supplier",
  source_name: "",
  reference_number: "",
  reference_type: "Challan Number",
  challan_number: "",
  bill_number: "",
  client_id: "",
  client_name: "",
  project_name: "",
  outward_challan_no: "",
  status: "Dispatched",
  remarks: "",
  date: "",
  high_value_goods: false,
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

const getRowValidationErrors = (row, mode) => {
  const errs = [];
  if (!row.product?.trim()) errs.push("Product required");
  if (!row.unit?.trim()) errs.push("Unit required");
  if (row.quantity === "" || row.quantity === null || Number(row.quantity) <= 0 || isNaN(Number(row.quantity))) {
    errs.push("Invalid quantity");
  }
  if (mode === "outward" && !row.client_name?.trim() && !row.client_id) {
    errs.push("Client required");
  }
  return errs;
};

const isRowValid = (row, mode) => getRowValidationErrors(row, mode).length === 0;

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
  const [previewPage, setPreviewPage] = useState(1);
  const [importProgress, setImportProgress] = useState(0);
  const [cancelImport, setCancelImport] = useState(false);
  const cancelImportRef = useRef(false);
  const [clients, setClients] = useState([]);
  const [productsList, setProductsList] = useState(products || []);
  const [globalDefaults, setGlobalDefaults] = useState({
    date: new Date().toISOString().split("T")[0],
    reference_type: "Challan Number",
    reference_number: "",
    source_type: "Supplier",
    source_name: "",
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
    setPreviewPage(1);
    setImportProgress(0);
    setCancelImport(false);
    cancelImportRef.current = false;
    setGlobalDefaults({
      date: new Date().toISOString().split("T")[0],
      reference_type: "Challan Number",
      reference_number: "",
      source_type: "Supplier",
      source_name: "",
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
    if (!open) {
      resetState();
      return;
    }
    resetState();

    api.get("/clients").then((r) => setClients(r.data || [])).catch(() => {});
    if (!products || products.length === 0) {
      const cached = getCachedProducts();
      if (cached && cached.length > 0) {
        setProductsList(cached);
      }
      fetchProductsDeduplicated().then((list) => setProductsList(list || [])).catch(() => {});
    } else {
      setProductsList(products);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const matchProduct = (name, size) => {
    if (!name) return "empty";
    const cleanName = name.toUpperCase().trim();
    const cleanSize = normalizeSizeForMatching(size);

    const sameName = productsList.filter((p) => (p.name || "").toUpperCase().trim() === cleanName);
    if (sameName.length > 0) {
      if (sameName.some(p => normalizeSizeForMatching(p.size) === cleanSize)) return "matched";
    }

    if (productsList.find((p) => (p.name || "").toUpperCase().trim().includes(cleanName))) return "fuzzy";
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
      let parsed = [];
      if (inputMode === "file") {
        if (!file) throw new Error("Select a CSV or Excel file first.");
        parsed = await loadRowsFromFile(file);
      } else {
        if (!rawText.trim()) throw new Error("Paste tabular text into the editor first.");
        parsed = await loadRowsFromText(rawText);
      }
      if (!parsed.length) throw new Error("No rows could be parsed from the input.");

      const enriched = parsed.map((row, index) => {
        const withMaster = autofillFromProductMaster(row, productsList);
        return { ...withMaster, _id: index, _selected: true };
      });

      setRows(enriched);
      // Stay on Step 1 ("input") so user can review and edit parsed rows before continuing
      setStep("input");
      toast.success(`Parsed ${enriched.length} rows. You can review and edit them below before proceeding.`);
    } catch (err) {
      setErrors(err?.message || "Unable to parse the input.");
    } finally {
      setProcessing(false);
    }
  };

  const updateCell = (rowIndex, field, value) => {
    setRows((prev) => {
      const next = [...prev];
      let row = { ...next[rowIndex] };

      if (field === "reference_value" || field === "reference_number" || field === "challan" || field === "outward_challan_no") {
        const cleanVal = String(value ?? "").trim();
        row.reference_number = cleanVal;
        row.challan_number = cleanVal;
        row.outward_challan_no = cleanVal;
        if (row.reference_type === "Bill Number" || globalDefaults.reference_type === "Bill Number") {
          row.bill_number = cleanVal;
        }
      } else if (field === "client_supplier") {
        if (mode === "inward") {
          row.source_name = value;
          const matched = findClient(value, clients);
          if (matched) {
            row.client_name = matched.full_name;
            row.client_id = matched.id;
          }
        } else {
          const matched = findClient(value, clients);
          row.client_name = matched ? matched.full_name : value;
          row.client_id = matched ? matched.id : "";
          row.project_name = matched ? (matched.project_name || matched.full_name) : (row.project_name || value);
          row.project_id = matched ? matched.id : "";
        }
      } else if (field === "client_name") {
        const matched = findClient(value, clients);
        row.client_name = matched ? matched.full_name : value;
        row.client_id = matched ? matched.id : "";
        row.project_name = matched ? (matched.project_name || matched.full_name) : (row.project_name || value);
        row.project_id = matched ? matched.id : "";
      } else if (field === "source_name") {
        row.source_name = value;
        const matched = findClient(value, clients);
        if (matched) {
          row.client_name = matched.full_name;
          row.client_id = matched.id;
        }
      } else if (field === "unit") {
        row.unit = formatUnit(value);
      } else if (field === "product") {
        row.product = String(value).toUpperCase();
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
    
    // Extract unique non-empty challans
    const challans = Array.from(new Set(
      rows.map((r) => (r.reference_number || r.outward_challan_no || r.challan_number || r.bill_number || "").trim()).filter(Boolean)
    ));
    
    // Extract unique non-empty client/suppliers
    const clientSuppliers = Array.from(new Set(
      rows.map((r) => ((mode === "inward" ? (r.source_name || r.client_name) : (r.client_name || r.source_name)) || "").trim()).filter(Boolean)
    ));
    
    // Extract unique non-empty dates
    const dates = Array.from(new Set(rows.map((r) => (r.date || "").trim()).filter(Boolean)));

    setGlobalDefaults((prev) => {
      const next = { ...prev };
      if (!next.date || next.date === "") {
        next.date = dates.length === 1 ? dates[0] : (prev.date || new Date().toISOString().split("T")[0]);
      } else if (dates.length === 1) {
        next.date = dates[0];
      }
      
      if (challans.length === 1) {
        next.reference_number = challans[0];
      }
      
      if (clientSuppliers.length === 1) {
        if (mode === "inward") {
          next.source_name = clientSuppliers[0];
        } else {
          const matched = findClient(clientSuppliers[0], clients);
          next.client_name = matched ? matched.full_name : clientSuppliers[0];
          next.client_id = matched ? matched.id : "";
        }
      }
      return next;
    });
    
    setStep("defaults");
  };

  const handleReviewTransition = () => {
    setRows((prevRows) => {
      return prevRows.map((row) => {
        // Precedence 1: Explicit row value, Precedence 2: Step 2 default, Precedence 3: System default
        const rowChallan = (row.reference_number || row.outward_challan_no || row.challan_number || "").trim();
        const defaultChallan = (globalDefaults.reference_number || "").trim();
        const resolvedChallan = rowChallan || defaultChallan;

        const rowDate = (row.date || "").trim();
        const defaultDate = (globalDefaults.date || "").trim();
        const resolvedDate = rowDate || defaultDate || new Date().toISOString().split("T")[0];

        const rowRemarks = (row.remarks || "").trim();
        const defaultRemarks = (globalDefaults.remarks || "").trim();
        const resolvedRemarks = rowRemarks || defaultRemarks;

        const resolvedStatus = row.status || globalDefaults.status || "Dispatched";
        const resolvedHighValue = row.high_value_goods != null ? row.high_value_goods : Boolean(globalDefaults.high_value_goods);

        let client_name = (row.client_name || "").trim();
        let client_id = row.client_id || "";
        let source_name = (row.source_name || "").trim();
        let source_type = row.source_type || globalDefaults.source_type || "Supplier";

        if (mode === "inward") {
          if (!source_name) {
            source_name = (globalDefaults.source_name || "").trim();
          }
          if (!client_name && globalDefaults.client_name) {
            client_name = globalDefaults.client_name;
            client_id = globalDefaults.client_id;
          }
        } else {
          if (!client_name) {
            client_name = (globalDefaults.client_name || "").trim();
            client_id = globalDefaults.client_id || "";
          }
        }

        return {
          ...row,
          date: resolvedDate,
          reference_number: resolvedChallan,
          challan_number: resolvedChallan,
          outward_challan_no: resolvedChallan,
          bill_number: row.bill_number || (globalDefaults.reference_type === "Bill Number" ? resolvedChallan : ""),
          source_name,
          source_type,
          client_name,
          client_id,
          project_name: row.project_name || globalDefaults.project_name || (client_name ? client_name : ""),
          project_id: row.project_id || globalDefaults.project_id || client_id || "",
          remarks: resolvedRemarks,
          status: resolvedStatus,
          high_value_goods: resolvedHighValue,
          high_value_asset: resolvedHighValue,
        };
      });
    });
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
  const invalidRowsCount = selectedRows.filter((row) => !isRowValid(row, mode)).length;

  const handleFinalImport = async () => {
    const validRows = selectedRows.filter((r) => isRowValid(r, mode));
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

        toast.success(`Successfully imported ${validRows.length} ${mode} entries.`);
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

  const productOptions = productsList.map((item) => item.name).filter(Boolean);
  const clientOptions = clients.map((client) => client.full_name).filter(Boolean);

  const uniqueChallans = Array.from(new Set(
    rows.map((r) => (r.reference_number || r.outward_challan_no || r.challan_number || r.bill_number || "").trim()).filter(Boolean)
  ));
  const hasMultipleChallans = uniqueChallans.length > 1;

  const uniqueClientSuppliers = Array.from(new Set(
    rows.map((r) => ((mode === "inward" ? (r.source_name || r.client_name) : (r.client_name || r.source_name)) || "").trim()).filter(Boolean)
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
                        placeholder={`Paste rows with columns like:\nProduct\tSize\tQty\tUnit\t${mode === "inward" ? "Supplier" : "Client"}\tChallan\tRemarks\n\nExample:\nWAAREE PANEL\t550W\t10\tNos\tABC Supplier\tIN-1045\tIn stock\nDC CABLE\t4 SQ MM\t50\tMtr\tABC Supplier\tIN-1045\tFresh batch`}
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
                      <div className="text-sm font-semibold">Supported Columns</div>
                      <p className="text-xs text-slate-500">Headers are recognized automatically in any order (comma, tab, or pipe separated):</p>
                    </div>
                  </div>
                  <ul className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <li>• <strong>Product</strong> (or Product Name)</li>
                    <li>• <strong>Size</strong> (or Spec, Size / Spec)</li>
                    <li>• <strong>Qty</strong> (or Quantity)</li>
                    <li>• <strong>Unit</strong> (Nos, Mtr, Kg, Pack, etc.)</li>
                    <li>• <strong>{mode === "inward" ? "Supplier Name" : "Client Name"}</strong> (Client / Supplier)</li>
                    <li>• <strong>Challan Number</strong> (or Reference No)</li>
                  </ul>
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-3xl border border-slate-200 bg-white p-6 text-slate-700">
                  <div className="text-sm font-semibold">Example Data</div>
                  <div className="mt-3 text-[11px] font-mono leading-6 text-slate-500 whitespace-pre-wrap bg-slate-50 p-3 rounded-xl border">
                    Product,Size,Qty,Unit,{mode === "inward" ? "Supplier" : "Client"},Challan Number,Remarks{"\n"}
                    WAAREE PANEL,550W,10,Nos,ABC Solar,IN-1045,In stock{"\n"}
                    DC CABLE,4 SQ MM,50,Mtr,ABC Solar,IN-1045,Roll
                  </div>
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
                      {selectedRows.filter((r) => isRowValid(r, mode)).length} valid
                    </Badge>
                    {invalidRowsCount > 0 && (
                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 font-semibold text-xs px-2.5 py-1">
                        {invalidRowsCount} invalid
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

                <div className="overflow-x-auto bg-white border rounded-3xl shadow-sm">
                  <table className="min-w-full text-left text-xs text-slate-600">
                    <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="px-3 py-2.5 w-8">☑</th>
                        <th className="px-3 py-2.5">Product</th>
                        <th className="px-3 py-2.5">Size</th>
                        <th className="px-3 py-2.5">Qty</th>
                        <th className="px-3 py-2.5">Unit</th>
                        <th className="px-3 py-2.5">{mode === "inward" ? "Client / Supplier" : "Client"}</th>
                        <th className="px-3 py-2.5">Challan Number</th>
                        <th className="px-3 py-2.5">Remarks</th>
                        <th className="px-3 py-2.5">Status</th>
                        <th className="px-3 py-2.5 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row) => {
                        const originalIndex = rows.findIndex((r) => r._id === row._id);
                        if (originalIndex === -1) return null;
                        const status = matchProduct(row.product, row.size);
                        const rowErrors = getRowValidationErrors(row, mode);

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
                              <Textarea
                                value={row.product}
                                onChange={(e) => updateCell(originalIndex, "product", e.target.value)}
                                rows={2}
                                className="text-xs bg-white border border-slate-200 rounded p-1 w-full text-slate-800"
                                list="manual-product-list"
                              />
                              <datalist id="manual-product-list">{productOptions.map((name) => <option key={name} value={name} />)}</datalist>
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
                                className="text-xs h-8 bg-white border-slate-200"
                              />
                            </td>
                            <td className="px-3 py-2.5 align-top">
                              <Input
                                type="number"
                                value={row.quantity ?? ""}
                                onChange={(e) => updateCell(originalIndex, "quantity", e.target.value === "" ? "" : (Number(e.target.value) || 0))}
                                className="text-xs h-8 bg-white border-slate-200 w-20"
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
                              <Input
                                list="manual-client-list"
                                value={mode === "inward" ? (row.source_name || row.client_name || "") : (row.client_name || "")}
                                onChange={(e) => updateCell(originalIndex, "client_supplier", e.target.value)}
                                className="text-xs h-8 bg-white border-slate-200"
                                placeholder={mode === "inward" ? "Supplier / Vendor" : "Client name"}
                              />
                            </td>
                            <td className="px-3 py-2.5 align-top">
                              <Input
                                value={row.reference_number || row.challan_number || row.outward_challan_no || ""}
                                onChange={(e) => updateCell(originalIndex, "reference_value", e.target.value)}
                                className="text-xs h-8 bg-white border-slate-200 font-mono"
                                placeholder="e.g. IN-1045"
                              />
                            </td>
                            <td className="px-3 py-2.5 align-top">
                              <Input
                                value={row.remarks || ""}
                                onChange={(e) => updateCell(originalIndex, "remarks", e.target.value)}
                                className="text-xs h-8 bg-white border-slate-200"
                              />
                            </td>
                            <td className="px-3 py-2.5 align-top">
                              <Select
                                value={row.status || "Dispatched"}
                                onValueChange={(value) => updateCell(originalIndex, "status", value)}
                              >
                                <SelectTrigger className="h-8 text-xs bg-white border-slate-200">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {STATUS_OPTIONS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                                </SelectContent>
                              </Select>
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
                        {REF_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  {mode === "inward" && (
                    <div className="space-y-1.5">
                      <Label>Source Type</Label>
                      <Select
                        value={globalDefaults.source_type}
                        onValueChange={(value) => {
                          const nextDefaults = { ...globalDefaults, source_type: value };
                          if (value === "Return From Client") {
                            nextDefaults.source_name = "";
                          }
                          setGlobalDefaults(nextDefaults);
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="Select source type" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Supplier">Supplier</SelectItem>
                          <SelectItem value="Vendor">Vendor</SelectItem>
                          <SelectItem value="Return From Client">Client Return</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {mode === "inward" && globalDefaults.source_type !== "Return From Client" && (
                    <div className="space-y-1.5">
                      <Label>Vendor / Source Name</Label>
                      <Input
                        value={globalDefaults.source_name}
                        onChange={(e) => setGlobalDefaults({ ...globalDefaults, source_name: e.target.value })}
                        placeholder="Supplier or vendor name"
                      />
                      {hasMultipleClients && (
                        <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1 mt-1 font-medium flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>Multiple supplier values detected (row-level values will be preserved)</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label>Client Name</Label>
                    <Input
                      list="manual-client-list"
                      value={globalDefaults.client_name}
                      onChange={(e) => {
                        const val = e.target.value;
                        const matched = findClient(val, clients);
                        setGlobalDefaults({
                          ...globalDefaults,
                          client_name: matched ? matched.full_name : val,
                          client_id: matched ? matched.id : "",
                          project_name: matched ? (matched.sol_id || matched.full_name) : globalDefaults.project_name,
                          project_id: matched ? matched.id : ""
                        });
                      }}
                      placeholder="Search and select client"
                    />
                    {mode === "outward" && hasMultipleClients && (
                      <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1 mt-1 font-medium flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>Multiple client values detected (row-level values will be preserved)</span>
                      </div>
                    )}
                  </div>

                  {(mode === "outward" || globalDefaults.source_type === "Return From Client") && (
                    <div className="space-y-1.5">
                      <Label>Project / Site Name</Label>
                      <Input
                        value={globalDefaults.project_name}
                        onChange={(e) => setGlobalDefaults({ ...globalDefaults, project_name: e.target.value })}
                        placeholder="Project name"
                      />
                    </div>
                  )}

                  {mode === "outward" && (
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
                  )}

                  <datalist id="manual-client-list">{clientOptions.map((name) => <option key={name} value={name} />)}</datalist>

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
                      Valid: {selectedRows.filter((r) => isRowValid(r, mode)).length}
                    </Badge>
                    {invalidRowsCount > 0 && (
                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 font-semibold text-xs px-2.5 py-1">
                        Invalid: {invalidRowsCount}
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
                        <th className="px-3 py-2.5">Qty</th>
                        <th className="px-3 py-2.5">Unit</th>
                        <th className="px-3 py-2.5">
                          {mode === "inward"
                            ? (globalDefaults.source_type === "Return From Client" ? "Client" : "Client / Supplier")
                            : "Client"}
                        </th>
                        {(mode === "outward" || (mode === "inward" && globalDefaults.source_type === "Return From Client")) && (
                          <th className="px-3 py-2.5">Project</th>
                        )}
                        <th className="px-3 py-2.5">{getRefHeaderLabel(globalDefaults.reference_type)}</th>
                        <th className="px-3 py-2.5">Date</th>
                        <th className="px-3 py-2.5">Remarks</th>
                        <th className="px-3 py-2.5">{mode === "inward" ? "Status / High Value" : "Status"}</th>
                        <th className="px-3 py-2.5 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 ? (
                        <tr><td colSpan={12} className="px-3 py-10 text-center text-slate-500">No rows to review yet.</td></tr>
                      ) : (
                        visibleRows.map((row) => {
                          const originalIndex = rows.findIndex((r) => r._id === row._id);
                          if (originalIndex === -1) return null;
                          const status = matchProduct(row.product, row.size);
                          const rowErrors = getRowValidationErrors(row, mode);

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
                              <td className="px-3 py-2.5 align-top min-w-[180px]">
                                <Textarea
                                  value={row.product}
                                  onChange={(e) => updateCell(originalIndex, "product", e.target.value)}
                                  rows={2}
                                  className="text-xs bg-white border border-slate-200 rounded p-1 w-full text-slate-800"
                                  list="manual-product-list"
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
                                  className="text-xs h-8 bg-white border-slate-200"
                                />
                              </td>
                              <td className="px-3 py-2.5 align-top">
                                <Input
                                  type="number"
                                  value={row.quantity ?? ""}
                                  onChange={(e) => updateCell(originalIndex, "quantity", e.target.value === "" ? "" : (Number(e.target.value) || 0))}
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
                              <td className="px-3 py-2.5 align-top">
                                <Input
                                  list="manual-client-list"
                                  value={mode === "inward" ? (row.source_name || row.client_name || "") : (row.client_name || "")}
                                  onChange={(e) => updateCell(originalIndex, "client_supplier", e.target.value)}
                                  className="text-xs h-8 bg-white border-slate-200"
                                  placeholder={mode === "inward" ? "Supplier name" : "Client name"}
                                />
                              </td>
                              {(mode === "outward" || (mode === "inward" && globalDefaults.source_type === "Return From Client")) && (
                                <td className="px-3 py-2.5 align-top">
                                  <Input
                                    value={row.project_name || ""}
                                    onChange={(e) => updateCell(originalIndex, "project_name", e.target.value)}
                                    className="text-xs h-8 bg-white border-slate-200"
                                  />
                                </td>
                              )}
                              <td className="px-3 py-2.5 align-top">
                                <Input
                                  value={row.reference_number || row.challan_number || row.outward_challan_no || ""}
                                  onChange={(e) => updateCell(originalIndex, "reference_value", e.target.value)}
                                  className="text-xs h-8 bg-white border-slate-200 font-mono"
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
                                  className="text-xs h-8 bg-white border-slate-200"
                                />
                              </td>
                              <td className="px-3 py-2.5 align-top">
                                <div className="space-y-1">
                                  <Select
                                    value={row.status || "Dispatched"}
                                    onValueChange={(value) => updateCell(originalIndex, "status", value)}
                                  >
                                    <SelectTrigger className="h-7 text-[11px] bg-white border-slate-200">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {STATUS_OPTIONS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                  {mode === "inward" && (
                                    <label className="flex items-center gap-1.5 text-[10px] text-slate-600 font-medium cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={Boolean(row.high_value_goods)}
                                        onChange={(e) => updateCell(originalIndex, "high_value_goods", e.target.checked)}
                                        className="w-3.5 h-3.5 rounded border-slate-300 text-slate-900"
                                      />
                                      High Value
                                    </label>
                                  )}
                                </div>
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
              <Button onClick={handleFinalImport} disabled={processing || selectedRows.length === 0 || invalidRowsCount > 0}>
                {processing ? "Importing…" : `Import ${selectedRows.length} rows`}
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
