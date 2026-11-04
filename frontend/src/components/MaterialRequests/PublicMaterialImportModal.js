import React, { useState, useMemo, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatUnit, normalizeUnit, getStandardizedUnitOptions } from "@/lib/units";
import {
  FileSpreadsheet,
  Upload,
  Clipboard,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Plus,
  Trash2,
  FileText,
  Boxes,
  ArrowRight,
  HelpCircle,
  ListPlus
} from "lucide-react";

function generateUUID() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Delimiter detection
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

// CSV line parser supporting quoted cells
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

const splitLine = (line, delimiter) => {
  if (delimiter === ",") return parseCsvLine(line);
  if (typeof delimiter === "string") return line.split(delimiter).map((cell) => cell.trim());
  return line.split(delimiter).map((cell) => cell.trim());
};

const normalizeHeader = (text) => String(text || "").trim().toLowerCase();

const isSerialNumberCell = (text) => {
  const t = normalizeHeader(text);
  return /^(sr|s\.?no|#|sn|sl\.?no|sr_no|item_no)$/i.test(t);
};

const hasHeaderRow = (row) => {
  if (!row || !row.length) return false;
  return row.some((cell) => {
    const text = normalizeHeader(cell);
    return /^(product|product[\s_]*name|item|item[\s_]*name|item[\s_]*desc|description|material|material[\s_]*name|size|spec|specification|specs|qty|quantity|unit|uom|measure)$/i.test(text);
  });
};

const inferFieldMap = (headerRow, hasHeaders = true) => {
  if (!hasHeaders) {
    const rowLen = headerRow.length;
    const firstIsSr = isSerialNumberCell(headerRow[0]) || /^\d+$/.test(String(headerRow[0] || "").trim());
    if (rowLen >= 5 && firstIsSr) {
      return { product: 1, size: 2, quantity: 3, unit: 4 };
    }
    if (rowLen === 4) {
      return { product: 0, size: 1, quantity: 2, unit: 3 };
    }
    if (rowLen === 3) {
      const col1IsNum = !isNaN(parseFloat(String(headerRow[1]).replace(/,/g, ""))) && !/[a-zA-Z]/.test(String(headerRow[1]));
      if (col1IsNum) {
        return { product: 0, size: -1, quantity: 1, unit: 2 };
      }
      return { product: 0, size: 1, quantity: 2, unit: -1 };
    }
    if (rowLen === 2) {
      return { product: 0, size: -1, quantity: 1, unit: -1 };
    }
    return { product: 0, size: 1, quantity: 2, unit: 3 };
  }

  let productIdx, sizeIdx, quantityIdx, unitIdx;

  headerRow.forEach((cell, index) => {
    const name = normalizeHeader(cell);
    if (isSerialNumberCell(name)) {
      return;
    }
    // Match unit BEFORE quantity so headers like "Nos", "Unit (Nos)" are assigned to unitIdx
    if (unitIdx === undefined && (/^unit\b|^uom\b|^measure\b|^units\b|^nos\b/i.test(name) || name === "unit" || name === "uom")) {
      unitIdx = index;
    } else if (quantityIdx === undefined && (/^qty\b|^quantity\b|^count\b|^req.*qty|^order.*qty/i.test(name) || name === "qty" || name === "quantity")) {
      quantityIdx = index;
    } else if (sizeIdx === undefined && (/^size\b|^spec\b|^specification\b|^dimensions\b|^rating\b|^capacity\b/i.test(name) || name === "size" || name === "spec")) {
      sizeIdx = index;
    } else if (productIdx === undefined && (/^product\b|^item\b|^description\b|^material\b|^name\b/i.test(name) || name === "product" || name === "item")) {
      productIdx = index;
    }
  });

  return {
    product: productIdx !== undefined ? productIdx : 0,
    size: sizeIdx !== undefined ? sizeIdx : 1,
    quantity: quantityIdx !== undefined ? quantityIdx : 2,
    unit: unitIdx !== undefined ? unitIdx : 3,
  };
};

export default function PublicMaterialImportModal({
  open,
  onOpenChange,
  productsCatalog = [],
  onImportRows
}) {
  const [activeTab, setActiveTab] = useState("bulk"); // "bulk" | "manual"

  // ── Pre-indexed Catalog Cache (O(1) Map lookups for instant responsiveness) ──
  const { catalogMapByNameAndSize, catalogMapByName, searchCatalog } = useMemo(() => {
    const byNameAndSize = new Map();
    const byName = new Map();
    const searchList = [];

    for (const p of productsCatalog || []) {
      const name = (p.name || "").trim().toUpperCase();
      const size = (p.size || "").trim().toUpperCase();
      const unit = formatUnit(p.unit || "Nos");
      const item = { ...p, name: p.name || "", size: p.size || "", unit };

      if (name && size) {
        byNameAndSize.set(`${name}:::${size}`, item);
      }
      if (name && !byName.has(name)) {
        byName.set(name, item);
      }

      searchList.push({
        ...item,
        _searchKey: `${name} ${size} ${unit}`.toLowerCase()
      });
    }

    return {
      catalogMapByNameAndSize: byNameAndSize,
      catalogMapByName: byName,
      searchCatalog: searchList
    };
  }, [productsCatalog]);

  // Try matching product against catalog in O(1) without modifying user input
  const matchCatalogProduct = useCallback((prodName, prodSize) => {
    if (!prodName || !prodName.trim()) return { product_id: null, isCatalogProduct: false };
    const cleanName = prodName.trim().toUpperCase();
    const cleanSize = (prodSize || "").trim().toUpperCase();

    // 1. Exact Name + Size match (O(1))
    if (cleanSize) {
      const exact = catalogMapByNameAndSize.get(`${cleanName}:::${cleanSize}`);
      if (exact) {
        return { product_id: exact.id, isCatalogProduct: true, catalogUnit: exact.unit, catalogSize: exact.size };
      }
    }

    // 2. Exact Name match only (O(1))
    const nameMatch = catalogMapByName.get(cleanName);
    if (nameMatch) {
      return { product_id: nameMatch.id, isCatalogProduct: true, catalogUnit: nameMatch.unit, catalogSize: nameMatch.size };
    }

    return { product_id: null, isCatalogProduct: false };
  }, [catalogMapByNameAndSize, catalogMapByName]);

  // ── Bulk Mode State ──
  const [bulkInputType, setBulkInputType] = useState("paste"); // "paste" | "file"
  const [pastedText, setPastedText] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState(null);
  const [previewRows, setPreviewRows] = useState([]);
  const [hasParsed, setHasParsed] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const fileInputRef = useRef(null);

  // ── Manual Mode State ──
  const [manualRows, setManualRows] = useState([
    { id: generateUUID(), product: "", product_id: null, isCatalogProduct: false, size: "", quantity: "1", unit: "Nos", remarks: "", showSuggestions: false },
    { id: generateUUID(), product: "", product_id: null, isCatalogProduct: false, size: "", quantity: "1", unit: "Nos", remarks: "", showSuggestions: false },
    { id: generateUUID(), product: "", product_id: null, isCatalogProduct: false, size: "", quantity: "1", unit: "Nos", remarks: "", showSuggestions: false },
  ]);

  // Focused row suggestion state for optimal performance
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(null);
  const [suggestionQuery, setSuggestionQuery] = useState("");

  const activeSuggestions = useMemo(() => {
    if (activeSuggestionIdx === null || !suggestionQuery.trim()) return [];
    const q = suggestionQuery.trim().toLowerCase();
    const tokens = q.split(/\s+/).filter(Boolean);
    const matches = [];
    for (const p of searchCatalog) {
      if (tokens.every((t) => p._searchKey.includes(t))) {
        matches.push(p);
        if (matches.length >= 8) break;
      }
    }
    return matches;
  }, [activeSuggestionIdx, suggestionQuery, searchCatalog]);

  // Parse raw text into structured preview rows
  const parseRawArrays = (arrays) => {
    const cleanArrays = arrays
      .map((r) => r.map((c) => String(c ?? "").trim()))
      .filter((r) => r.some((c) => c !== ""));

    if (!cleanArrays.length) {
      throw new Error("No data found to parse. Please check your text or file.");
    }

    const firstRow = cleanArrays[0];
    const isHeader = hasHeaderRow(firstRow);
    const fieldMap = inferFieldMap(firstRow, isHeader);
    const bodyRows = cleanArrays.slice(isHeader ? 1 : 0);

    if (!bodyRows.length) {
      throw new Error("Input contains only headers but no data rows.");
    }

    return bodyRows.map((row, index) => {
      const rawProduct = fieldMap.product >= 0 ? (row[fieldMap.product] || "").trim() : "";
      // CRITICAL: Preserve exact size without altering cable notations like 4C*0.75
      const rawSize = fieldMap.size >= 0 ? (row[fieldMap.size] || "").trim() : "";
      const rawQtyCell = fieldMap.quantity >= 0 ? row[fieldMap.quantity] : "";
      const rawQtyStr = String(rawQtyCell ?? "").replace(/,/g, "").trim();
      const qty = parseFloat(rawQtyStr) || 0;
      const rawUnitCell = fieldMap.unit >= 0 ? (row[fieldMap.unit] || "").trim() : "";
      const finalUnit = formatUnit(rawUnitCell || "Nos");

      // Optional Catalog Lookup
      const catalogMatch = matchCatalogProduct(rawProduct, rawSize);
      const effectiveUnit = catalogMatch.catalogUnit ? formatUnit(catalogMatch.catalogUnit) : finalUnit;

      const isValid = rawProduct.length > 0 && qty > 0;
      let errorReason = "";
      if (!rawProduct) {
        errorReason = "Product Name is missing";
      } else if (qty <= 0) {
        errorReason = "Quantity must be greater than 0";
      }

      return {
        id: generateUUID(),
        _index: index + 1,
        _selected: isValid,
        product: rawProduct,
        size: rawSize,
        quantity: qty > 0 ? String(qty) : (rawQtyStr || "0"),
        unit: effectiveUnit || "Nos",
        product_id: catalogMatch.product_id,
        isCatalogProduct: catalogMatch.isCatalogProduct,
        isValid,
        errorReason,
      };
    });
  };

  // Handle Parse Trigger for Bulk Mode
  const handleParseBulk = async () => {
    setParsing(true);
    setParseError(null);

    try {
      let arrays = [];
      if (bulkInputType === "file") {
        if (!selectedFile) throw new Error("Please select a CSV or Excel file first.");
        const ext = (selectedFile.name || "").split(".").pop().toLowerCase();
        if (["csv", "txt"].includes(ext)) {
          const text = await selectedFile.text();
          const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim() !== "");
          const delimiter = detectDelimiter(lines);
          arrays = lines.map((l) => splitLine(l, delimiter));
        } else if (["xls", "xlsx"].includes(ext)) {
          const XLSX = await import("xlsx");
          const buffer = await selectedFile.arrayBuffer();
          const workbook = XLSX.read(buffer, { type: "array" });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          arrays = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
        } else {
          throw new Error("Unsupported file format. Please upload .xlsx, .xls, or .csv.");
        }
      } else {
        if (!pastedText.trim()) throw new Error("Please paste table rows or CSV text in the area below.");
        const lines = pastedText.replace(/\r/g, "").split("\n").filter((l) => l.trim() !== "");
        const delimiter = detectDelimiter(lines);
        arrays = lines.map((l) => splitLine(l, delimiter));
      }

      const parsed = parseRawArrays(arrays);
      setPreviewRows(parsed);
      setHasParsed(true);

      const validCount = parsed.filter((r) => r.isValid).length;
      const invalidCount = parsed.length - validCount;
      if (invalidCount > 0) {
        toast.info(`Parsed ${parsed.length} rows (${validCount} valid, ${invalidCount} invalid). Review before importing.`);
      } else {
        toast.success(`Parsed ${parsed.length} valid rows successfully.`);
      }
    } catch (err) {
      setParseError(err.message || "Unable to parse input data.");
      toast.error(err.message || "Failed to parse input.");
    } finally {
      setParsing(false);
    }
  };

  // Update a single cell in Bulk Preview
  const handleUpdatePreviewCell = (index, field, value) => {
    setPreviewRows((prev) => {
      const next = [...prev];
      const row = { ...next[index], [field]: value };

      // Re-evaluate validation
      const qty = parseFloat(row.quantity) || 0;
      const hasProd = (row.product || "").trim().length > 0;
      const isValid = hasProd && qty > 0;

      row.isValid = isValid;
      if (!hasProd) row.errorReason = "Product Name is missing";
      else if (qty <= 0) row.errorReason = "Quantity must be greater than 0";
      else row.errorReason = "";

      // Re-evaluate catalog match on product/size edit
      if (field === "product" || field === "size") {
        const catalogMatch = matchCatalogProduct(row.product, row.size);
        row.product_id = catalogMatch.product_id;
        row.isCatalogProduct = catalogMatch.isCatalogProduct;
      }

      next[index] = row;
      return next;
    });
  };

  const handleDeletePreviewRow = (index) => {
    setPreviewRows((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleAddPreviewRow = () => {
    setPreviewRows((prev) => [
      ...prev,
      {
        id: generateUUID(),
        _index: prev.length + 1,
        _selected: true,
        product: "",
        size: "",
        quantity: "1",
        unit: "Nos",
        product_id: null,
        isCatalogProduct: false,
        isValid: false,
        errorReason: "Product Name is missing",
      }
    ]);
  };

  // Toggle selection for Bulk Preview
  const handleToggleSelectRow = (index) => {
    setPreviewRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], _selected: !next[index]._selected };
      return next;
    });
  };

  const handleSelectAllPreview = (select) => {
    setPreviewRows((prev) => prev.map((r) => ({ ...r, _selected: select })));
  };

  // ── Manual Import Helpers ──
  const handleManualRowChange = (index, field, value) => {
    setManualRows((prev) => {
      const copy = [...prev];
      const updated = { ...copy[index], [field]: value };
      if (field === "product") {
        const match = matchCatalogProduct(value, updated.size);
        updated.product_id = match.product_id;
        updated.isCatalogProduct = match.isCatalogProduct;
        if (match.catalogUnit) {
          updated.unit = formatUnit(match.catalogUnit);
        }
      }
      if (field === "size") {
        const match = matchCatalogProduct(updated.product, value);
        updated.product_id = match.product_id;
        updated.isCatalogProduct = match.isCatalogProduct;
      }
      copy[index] = updated;
      return copy;
    });
  };

  const handleSelectManualProduct = (index, prod) => {
    setManualRows((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        product: prod.name || "",
        product_id: prod.id || null,
        isCatalogProduct: true,
        size: prod.size || copy[index].size || "",
        unit: formatUnit(prod.unit || copy[index].unit || "Nos"),
      };
      return copy;
    });
    setActiveSuggestionIdx(null);
    setSuggestionQuery("");
  };

  const addManualRow = () => {
    setManualRows((prev) => [
      ...prev,
      { id: generateUUID(), product: "", product_id: null, isCatalogProduct: false, size: "", quantity: "1", unit: "Nos", remarks: "", showSuggestions: false }
    ]);
  };

  const removeManualRow = (index) => {
    if (manualRows.length <= 1) {
      setManualRows([{ id: generateUUID(), product: "", product_id: null, isCatalogProduct: false, size: "", quantity: "1", unit: "Nos", remarks: "", showSuggestions: false }]);
      return;
    }
    setManualRows((prev) => prev.filter((_, idx) => idx !== index));
  };

  // ── Final Commit Actions ──
  const handleCommitBulkImport = () => {
    if (isImporting) return; // Prevent duplicate clicks
    const toImport = previewRows.filter((r) => r._selected && r.isValid);
    if (!toImport.length) {
      toast.error("No valid items selected for import.");
      return;
    }

    setIsImporting(true);

    const formattedItems = toImport.map((r) => ({
      id: generateUUID(),
      product: r.product.trim(),
      product_id: r.product_id || null,
      isCatalogProduct: Boolean(r.isCatalogProduct && r.product_id),
      size: (r.size || "").trim(),
      unit: formatUnit(r.unit || "Nos"),
      quantity: String(r.quantity || "1"),
      remarks: "",
      showSuggestions: false,
    }));

    const skippedCount = previewRows.length - toImport.length;
    onImportRows(formattedItems);

    toast.success(`Successfully imported ${formattedItems.length} items to requested materials!`);
    if (skippedCount > 0) {
      toast.info(`${skippedCount} rows were skipped (unselected or invalid).`);
    }

    handleCloseModal();
  };

  const handleCommitManualImport = () => {
    if (isImporting) return;
    const filledRows = manualRows.filter((r) => (r.product || "").trim().length > 0);

    if (!filledRows.length) {
      toast.error("Please enter at least one product name before importing.");
      return;
    }

    const validRows = [];
    let invalidCount = 0;

    filledRows.forEach((r) => {
      const q = parseFloat(r.quantity) || 0;
      if (q > 0) {
        validRows.push({
          id: generateUUID(),
          product: r.product.trim(),
          product_id: r.product_id || null,
          isCatalogProduct: Boolean(r.isCatalogProduct && r.product_id),
          size: (r.size || "").trim(),
          unit: formatUnit(r.unit || "Nos"),
          quantity: String(r.quantity || q),
          remarks: (r.remarks || "").trim(),
          showSuggestions: false,
        });
      } else {
        invalidCount += 1;
      }
    });

    if (!validRows.length) {
      toast.error("All entered products had invalid quantities (must be > 0).");
      return;
    }

    setIsImporting(true);
    onImportRows(validRows);

    toast.success(`Successfully added ${validRows.length} items to requested materials!`);
    if (invalidCount > 0) {
      toast.info(`${invalidCount} rows were skipped due to zero or negative quantity.`);
    }

    handleCloseModal();
  };

  const handleCloseModal = () => {
    setHasParsed(false);
    setPreviewRows([]);
    setPastedText("");
    setSelectedFile(null);
    setParseError(null);
    setIsImporting(false);
    onOpenChange(false);
  };

  const validPreviewCount = previewRows.filter((r) => r.isValid && r._selected).length;
  const invalidPreviewCount = previewRows.filter((r) => !r.isValid).length;

  return (
    <Dialog open={open} onOpenChange={(val) => !val && handleCloseModal()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col bg-white p-0 gap-0 overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 bg-slate-50/70">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold text-base">
                <FileSpreadsheet className="w-5 h-5 text-blue-600" /> Import Materials to Request
              </DialogTitle>
              <Badge variant="outline" className="text-xs bg-white text-slate-600 border-slate-200">
                Product Master Matching Optional
              </Badge>
            </div>
            <DialogDescription className="text-xs text-slate-500 mt-1">
              Add multiple materials via Excel/CSV file, tabular clipboard paste, or quick manual multi-row entry.
            </DialogDescription>
          </DialogHeader>

          {/* Mode Tabs */}
          <div className="mt-4">
            <Tabs value={activeTab} onValueChange={(t) => { setActiveTab(t); setParseError(null); }}>
              <TabsList className="bg-slate-200/70 p-1 rounded-lg">
                <TabsTrigger value="bulk" className="text-xs font-semibold px-4 py-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                  <Clipboard className="w-3.5 h-3.5 mr-1.5 text-blue-600" /> Bulk Import (Excel / CSV / Paste)
                </TabsTrigger>
                <TabsTrigger value="manual" className="text-xs font-semibold px-4 py-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                  <ListPlus className="w-3.5 h-3.5 mr-1.5 text-indigo-600" /> Manual Multi-Row Entry
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === "bulk" ? (
            <div>
              {!hasParsed ? (
                <div className="space-y-4">
                  {/* Sub-mode switch: File vs Paste */}
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={bulkInputType === "paste" ? "default" : "outline"}
                      onClick={() => setBulkInputType("paste")}
                      className={`text-xs h-8 ${bulkInputType === "paste" ? "bg-blue-600" : ""}`}
                    >
                      <Clipboard className="w-3.5 h-3.5 mr-1.5" /> Paste Tabular Text
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={bulkInputType === "file" ? "default" : "outline"}
                      onClick={() => setBulkInputType("file")}
                      className={`text-xs h-8 ${bulkInputType === "file" ? "bg-blue-600" : ""}`}
                    >
                      <Upload className="w-3.5 h-3.5 mr-1.5" /> Upload File (.xlsx, .xls, .csv)
                    </Button>
                  </div>

                  {bulkInputType === "paste" ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold text-slate-700">
                          Paste Material Rows from Excel / Google Sheets / CSV
                        </Label>
                        <span className="text-[11px] text-slate-400">
                          Tab or comma separated
                        </span>
                      </div>
                      <Textarea
                        rows={8}
                        value={pastedText}
                        onChange={(e) => setPastedText(e.target.value)}
                        placeholder={"Product Name\tSize / Spec\tQuantity\tUnit\nSolar Cable 4 sq mm\t4 sq mm\t100\tMtr\nMC4 Connectors\tMale/Female\t25\tPairs\nEarthing Strip\t25x3 mm GI\t50\tMtr"}
                        className="text-xs font-mono bg-white border-slate-300 resize-y"
                      />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-8 text-center bg-slate-50 hover:bg-blue-50/40 transition-colors cursor-pointer"
                      >
                        <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-3">
                          <Upload className="w-6 h-6" />
                        </div>
                        <h4 className="text-xs font-bold text-slate-800">
                          {selectedFile ? selectedFile.name : "Click to select or drag and drop an Excel / CSV file"}
                        </h4>
                        <p className="text-[11px] text-slate-500 mt-1">
                          Supported formats: .xlsx, .xls, .csv, .txt (Max 5 MB)
                        </p>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".xlsx,.xls,.csv,.txt"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              setSelectedFile(e.target.files[0]);
                            }
                          }}
                          className="hidden"
                        />
                      </div>
                      {selectedFile && (
                        <div className="flex items-center justify-between p-2.5 bg-blue-50 rounded-lg border border-blue-200 text-xs">
                          <div className="flex items-center gap-2 text-blue-900 font-medium">
                            <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                            <span>{selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedFile(null)}
                            className="text-slate-400 hover:text-red-600 text-xs font-bold"
                          >
                            ✕ Remove
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Format Guidelines Box */}
                  <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-lg text-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold text-amber-900">
                      <HelpCircle className="w-3.5 h-3.5 text-amber-600" /> Expected 4 Columns Format:
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-amber-800 pt-1 font-mono">
                      <div className="bg-white p-1.5 rounded border border-amber-200">1. Product Name *</div>
                      <div className="bg-white p-1.5 rounded border border-amber-200">2. Size / Spec</div>
                      <div className="bg-white p-1.5 rounded border border-amber-200">3. Quantity *</div>
                      <div className="bg-white p-1.5 rounded border border-amber-200">4. Unit</div>
                    </div>
                    <p className="text-[11px] text-amber-700 pt-1">
                      Header row is optional and will be detected automatically. Exact cable codes (e.g. <code>4C*0.75</code>) are preserved.
                    </p>
                  </div>

                  {parseError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <div>{parseError}</div>
                    </div>
                  )}

                  <Button
                    type="button"
                    onClick={handleParseBulk}
                    disabled={parsing || (bulkInputType === "paste" ? !pastedText.trim() : !selectedFile)}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-9 gap-1.5"
                  >
                    <ArrowRight className="w-4 h-4" /> {parsing ? "Parsing File / Text..." : "Parse & Preview Data"}
                  </Button>
                </div>
              ) : (
                /* Editable Bulk Preview Table */
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-blue-50/70 border border-blue-100 rounded-xl text-xs">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-blue-600 text-white text-[11px]">
                        {previewRows.length} Rows Parsed
                      </Badge>
                      <span className="text-slate-600">
                        ({validPreviewCount} valid, {invalidPreviewCount} invalid)
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => handleSelectAllPreview(true)}
                        className="text-xs h-7 px-2 text-blue-700 hover:bg-blue-100"
                      >
                        Select All
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => handleSelectAllPreview(false)}
                        className="text-xs h-7 px-2 text-slate-600 hover:bg-slate-200"
                      >
                        Deselect All
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setHasParsed(false)}
                        className="text-xs h-7 px-2.5 text-slate-600"
                      >
                        ← Back to Upload
                      </Button>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                    <div className="max-h-72 overflow-y-auto">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead className="bg-slate-100 text-slate-600 font-semibold sticky top-0 z-10 border-b border-slate-200 text-[11px]">
                          <tr>
                            <th className="p-2 w-10 text-center">Sel</th>
                            <th className="p-2">Product Name <span className="text-red-500">*</span></th>
                            <th className="p-2 w-32">Size / Spec</th>
                            <th className="p-2 w-24">Qty <span className="text-red-500">*</span></th>
                            <th className="p-2 w-24">Unit</th>
                            <th className="p-2 w-32">Match Type</th>
                            <th className="p-2 w-10 text-center">Del</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {previewRows.map((row, idx) => (
                            <tr
                              key={row.id}
                              className={`hover:bg-slate-50 transition-colors ${
                                !row.isValid ? "bg-red-50/40" : row._selected ? "bg-white" : "bg-slate-50/60 opacity-60"
                              }`}
                            >
                              <td className="p-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={row._selected}
                                  onChange={() => handleToggleSelectRow(idx)}
                                  className="w-3.5 h-3.5 text-blue-600 rounded cursor-pointer"
                                />
                              </td>
                              <td className="p-2">
                                <Input
                                  value={row.product}
                                  onChange={(e) => handleUpdatePreviewCell(idx, "product", e.target.value)}
                                  placeholder="Product name"
                                  className={`text-xs h-7 ${!row.product.trim() ? "border-red-300 bg-red-50/50" : "bg-white"}`}
                                />
                                {row.errorReason && (
                                  <span className="text-[10px] text-red-600 font-medium block mt-0.5">
                                    {row.errorReason}
                                  </span>
                                )}
                              </td>
                              <td className="p-2">
                                <Input
                                  value={row.size}
                                  onChange={(e) => handleUpdatePreviewCell(idx, "size", e.target.value)}
                                  placeholder="Size"
                                  className="text-xs h-7 bg-white font-mono"
                                />
                              </td>
                              <td className="p-2">
                                <Input
                                  type="number"
                                  step="any"
                                  min="0.01"
                                  value={row.quantity}
                                  onChange={(e) => handleUpdatePreviewCell(idx, "quantity", e.target.value)}
                                  placeholder="Qty"
                                  className={`text-xs h-7 font-bold ${parseFloat(row.quantity) <= 0 ? "border-red-300 bg-red-50" : "bg-white"}`}
                                />
                              </td>
                              <td className="p-2">
                                <select
                                  value={formatUnit(row.unit)}
                                  onChange={(e) => handleUpdatePreviewCell(idx, "unit", e.target.value)}
                                  className="text-xs h-7 bg-white border border-slate-200 rounded px-1.5 text-slate-700 w-full"
                                >
                                  {getStandardizedUnitOptions(row.unit).map((u) => (
                                    <option key={u} value={u}>
                                      {u}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="p-2">
                                {row.isCatalogProduct && row.product_id ? (
                                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] py-0 px-1.5 flex items-center gap-1 w-max">
                                    <CheckCircle2 className="w-2.5 h-2.5" /> Catalog
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-slate-500 border-slate-200 text-[10px] py-0 px-1.5 w-max">
                                    Manual
                                  </Badge>
                                )}
                              </td>
                              <td className="p-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeletePreviewRow(idx)}
                                  className="text-slate-400 hover:text-red-600 p-1 rounded"
                                  title="Remove row"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="p-2 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-xs">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleAddPreviewRow}
                        className="text-xs h-7 gap-1 border-dashed"
                      >
                        <Plus className="w-3 h-3" /> Add Row to Preview
                      </Button>
                      <span className="text-[11px] text-slate-500">
                        {validPreviewCount} of {previewRows.length} items selected for import
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Manual Multi-Row Entry Tab */
            <div className="space-y-4">
              <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-indigo-950">Quick Multi-Item Entry Grid</h4>
                  <p className="text-[11px] text-indigo-800">
                    Type rows manually. Catalog matching is optional; custom and non-catalog products are accepted.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setManualRows([
                    { id: generateUUID(), product: "", product_id: null, isCatalogProduct: false, size: "", quantity: "1", unit: "Nos", remarks: "", showSuggestions: false }
                  ])}
                  className="text-xs h-7 text-slate-600"
                >
                  Clear All
                </Button>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-100 text-slate-600 font-semibold sticky top-0 z-10 border-b border-slate-200 text-[11px]">
                      <tr>
                        <th className="p-2 w-8 text-center">#</th>
                        <th className="p-2">Product Name <span className="text-red-500">*</span></th>
                        <th className="p-2 w-36">Size / Spec</th>
                        <th className="p-2 w-24">Qty <span className="text-red-500">*</span></th>
                        <th className="p-2 w-24">Unit</th>
                        <th className="p-2 w-28">Type</th>
                        <th className="p-2 w-10 text-center">Del</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {manualRows.map((row, idx) => {
                        const isThisRowActive = activeSuggestionIdx === idx;

                        return (
                          <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-2 text-center text-slate-400 font-mono text-[11px]">
                              {idx + 1}
                            </td>
                            <td className="p-2 relative">
                              <Input
                                value={row.product}
                                placeholder="Product name (search or manual)"
                                onFocus={() => {
                                  setActiveSuggestionIdx(idx);
                                  setSuggestionQuery(row.product);
                                }}
                                onBlur={() => setTimeout(() => {
                                  setActiveSuggestionIdx((curr) => curr === idx ? null : curr);
                                }, 250)}
                                onChange={(e) => {
                                  handleManualRowChange(idx, "product", e.target.value);
                                  setActiveSuggestionIdx(idx);
                                  setSuggestionQuery(e.target.value);
                                }}
                                className="text-xs h-7 bg-white"
                              />

                              {isThisRowActive && activeSuggestions.length > 0 && (
                                <div className="absolute z-30 top-full left-2 right-2 mt-1 max-h-40 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-xl p-1 text-xs divide-y divide-slate-100">
                                  <div className="px-2 py-1 text-[10px] font-semibold text-blue-600 bg-blue-50/60 rounded">
                                    Product Master Suggestions (Optional)
                                  </div>
                                  {activeSuggestions.map((prod) => (
                                    <button
                                      type="button"
                                      key={prod.id || `${prod.name}-${prod.size}`}
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        handleSelectManualProduct(idx, prod);
                                      }}
                                      className="w-full text-left p-1.5 rounded hover:bg-blue-50 text-slate-800 transition-colors flex items-center justify-between text-xs"
                                    >
                                      <span className="font-medium text-slate-900">{prod.name}</span>
                                      <div className="text-right">
                                        {prod.size && <span className="text-[10px] text-slate-400 font-mono block">{prod.size}</span>}
                                        {prod.unit && <span className="text-[10px] text-blue-600 font-semibold block">{formatUnit(prod.unit)}</span>}
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="p-2">
                              <Input
                                value={row.size}
                                onChange={(e) => handleManualRowChange(idx, "size", e.target.value)}
                                placeholder="Size / spec"
                                className="text-xs h-7 bg-white font-mono"
                              />
                            </td>
                            <td className="p-2">
                              <Input
                                type="number"
                                min="0.01"
                                step="any"
                                value={row.quantity}
                                onChange={(e) => handleManualRowChange(idx, "quantity", e.target.value)}
                                placeholder="1"
                                className="text-xs h-7 bg-white font-bold"
                              />
                            </td>
                            <td className="p-2">
                              <select
                                value={formatUnit(row.unit)}
                                onChange={(e) => handleManualRowChange(idx, "unit", e.target.value)}
                                className="text-xs h-7 bg-white border border-slate-200 rounded px-1.5 text-slate-700 w-full"
                              >
                                {getStandardizedUnitOptions(row.unit).map((u) => (
                                  <option key={u} value={u}>
                                    {u}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="p-2">
                              {row.isCatalogProduct && row.product_id ? (
                                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] py-0 px-1.5 flex items-center gap-1 w-max">
                                  <CheckCircle2 className="w-2.5 h-2.5" /> Catalog
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-slate-500 border-slate-200 text-[10px] py-0 px-1.5 w-max">
                                  Manual
                                </Badge>
                              )}
                            </td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => removeManualRow(idx)}
                                className="text-slate-400 hover:text-red-600 p-1 rounded"
                                title="Remove row"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="p-2 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-xs">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={addManualRow}
                    className="text-xs h-7 gap-1 border-dashed"
                  >
                    <Plus className="w-3 h-3" /> Add Another Row
                  </Button>
                  <span className="text-[11px] text-slate-500">
                    {manualRows.filter((r) => r.product.trim()).length} items entered
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCloseModal}
            className="text-xs"
          >
            Cancel
          </Button>

          <div className="flex items-center gap-2">
            {activeTab === "bulk" && hasParsed && (
              <Button
                type="button"
                onClick={handleCommitBulkImport}
                disabled={isImporting || validPreviewCount === 0}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-9 px-4 gap-1.5 shadow-sm"
              >
                <CheckCircle2 className="w-4 h-4" /> Import {validPreviewCount} Selected Items
              </Button>
            )}

            {activeTab === "manual" && (
              <Button
                type="button"
                onClick={handleCommitManualImport}
                disabled={isImporting || manualRows.filter((r) => r.product.trim()).length === 0}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-9 px-4 gap-1.5 shadow-sm"
              >
                <CheckCircle2 className="w-4 h-4" /> Import Entered Items
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

