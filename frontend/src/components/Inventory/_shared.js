import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { AlertTriangle, X } from "lucide-react";
import { getCachedProducts, fetchProductsDeduplicated } from "@/lib/productCache";
import { useProductList } from "@/hooks/useInventory";
export {
  STANDARDIZED_UNITS,
  UNIT_OPTIONS,
  normalizeUnit,
  formatUnit,
  getStandardizedUnitOptions,
} from "@/lib/units";
export const CATEGORY_OPTIONS = ["Solar Panel", "Inverter", "Battery", "BoS", "Cable", "Structure", "MC4 / Connector", "Earthing", "Net Meter", "Tools", "Other"];
export const REF_TYPES = ["Challan Number", "Invoice Number", "Book Number", "GRN Number", "Transport Number"];
export const OUTWARD_REF_TYPES = ["Challan Number", "Book Number", "Other"];
export const SRC_TYPES = ["Supplier Supply", "Supplier", "Vendor", "Client Return", "Return From Client", "B2B Return", "Internal / Warehouse", "Repair Return", "Manual Entry", "Other"];

// Strip all non-digit characters — used for Challan/Bill/Ref number inputs (Sprint 8)
export const digitsOnly = (v) => String(v ?? "").replace(/\D+/g, "");

// Unified size normalization for matching logic (must never modify original size strings)
export function normalizeSizeForMatching(size) {
  if (!size) return "";
  let s = String(size).toLowerCase();
  s = s.replace(/\s*[xX×\*]\s*/g, "*");
  s = s.replace(/\s+/g, "");
  return s;
}

export function Field({ label, value, onChange, type = "text", placeholder, full, testid, required, ...rest }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</Label>
      <Input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5"
        data-testid={testid}
        {...rest}
      />
    </div>
  );
}

export function SelectField({ label, value, onChange, options, testid, allowEmpty = false, full, placeholder }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</Label>
      <Select value={value || (allowEmpty ? "__none__" : "")} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
        <SelectTrigger className="mt-1.5" data-testid={testid}>
          <SelectValue placeholder={placeholder || "Select…"} />
        </SelectTrigger>
        <SelectContent className="max-h-[300px]">
          {allowEmpty && <SelectItem value="__none__" className="italic text-slate-500">— None —</SelectItem>}
          {options.map((o) => typeof o === "string"
            ? <SelectItem key={o} value={o}>{o}</SelectItem>
            : <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export function TextareaField({ label, value, onChange, rows = 2, testid, full }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</Label>
      <Textarea value={value || ""} onChange={(e) => onChange(e.target.value)} rows={rows} className="mt-1.5" data-testid={testid} />
    </div>
  );
}

export function ConfirmDialog({ open, onOpenChange, title = "Are you sure?", description, confirmLabel = "Delete", onConfirm, danger = true, disabled }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" data-testid="confirm-dialog">
        <DialogHeader>
          <div className={`w-10 h-10 rounded-full ${danger ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"} flex items-center justify-center mb-2`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-sm text-slate-600">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="confirm-cancel" disabled={disabled}>Cancel</Button>
          <Button className={danger ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"} onClick={onConfirm} data-testid="confirm-yes" disabled={disabled}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const today = () => new Date().toISOString().slice(0, 10);

export function applyDefaults(target, defaults, alwaysKeep = []) {
  const out = { ...target };
  Object.keys(defaults || {}).forEach((k) => {
    if (alwaysKeep.includes(k) || !out[k]) out[k] = defaults[k];
  });
  return out;
}

export function ProductAutocompleteInput({ value, onChange, products, placeholder, className, testid, required, inputRef, highValueOnly = false }) {
  const { data: hookProducts = [] } = useProductList();
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState(value || "");
  const [debouncedSearch, setDebouncedSearch] = useState(value || "");
  const containerRef = useRef(null);
  const debounceRef = useRef(null);

  // Sync incoming value to input if controlled from outside
  useEffect(() => { setInputVal(value || ""); }, [value]);

  // ── Unified Product Source (strictly Product Master items only) ─────────────
  const sourceList = useMemo(() => {
    const rawList = (products && products.length > 0) ? products : hookProducts;
    if (!Array.isArray(rawList)) return [];
    return rawList.filter((p) => {
      if (!p || typeof p !== "object") return false;
      // Exclude client, user, employee, vendor, or project records
      if (p.full_name || p.contact_person || p.email || p.role || p.sol_id || p.gstin || p.is_client || p.is_vendor) {
        return false;
      }
      return Boolean(p.name || p.product_name);
    });
  }, [products, hookProducts]);

  // ── Pre-index: builds searchKey once when sourceList changes ───────────
  const { highValueProducts, otherProducts } = useMemo(() => {
    const hvKeywords = ["SOLAR PANEL", "PANEL", "INVERTER", "ACDB", "DCDB", "METER", "BATTERY", "MODULE", "TRANSFORMER"];
    const hv = [];
    const other = [];

    for (const p of sourceList) {
      const pName = p.name || p.product_name || "";
      const nameUpper = pName.toUpperCase();
      const rawSize = (p.size || "").toUpperCase();
      const cleanSize = normalizeSizeForMatching(p.size);
      const unit = (p.unit || "").toUpperCase();
      const category = (p.category || "").toUpperCase();
      const sku = (p.sku || p.product_code || "").toUpperCase();
      const _searchKey = `${nameUpper} ${cleanSize} ${rawSize} ${unit} ${category} ${sku}`;
      const item = { ...p, name: pName, _searchKey };

      const isHV = Boolean(p.high_value_goods || p.high_value_asset || hvKeywords.some(kw => nameUpper.includes(kw)));
      if (isHV) hv.push(item);
      else other.push(item);
    }
    return { highValueProducts: hv, otherProducts: other };
  }, [sourceList]);

  // ── Debounced search: typing updates inputVal instantly, filter runs 150ms later ──
  const handleInputChange = useCallback((val) => {
    setInputVal(val);
    onChange(val);  // notify parent immediately (value display)
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 150);
  }, [onChange]);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  // ── Fast token-based filter ──────────────────────────────────────────────
  const filterList = useCallback((list, query) => {
    if (!query) return list;
    const cleanSearch = query.toUpperCase().replace(/\s*[xX×*]\s*/g, "*");
    const tokens = cleanSearch.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return list;
    return list.filter(p => tokens.every(token => p._searchKey.includes(token)));
  }, []);

  const filteredHighValue = useMemo(
    () => filterList(highValueProducts, debouncedSearch),
    [highValueProducts, debouncedSearch, filterList]
  );
  const filteredOther = useMemo(
    () => filterList(otherProducts, debouncedSearch),
    [otherProducts, debouncedSearch, filterList]
  );

  // DOM slicing: max 50 HV + 100 other to prevent browser freeze
  const displayedHighValue = useMemo(() => filteredHighValue.slice(0, 50), [filteredHighValue]);
  const displayedOther = useMemo(() => filteredOther.slice(0, 100), [filteredOther]);
  const hasAnyMatches = displayedHighValue.length > 0 || (!highValueOnly && displayedOther.length > 0);
  const combinedList = useMemo(() => (highValueOnly ? displayedHighValue : [...displayedHighValue, ...displayedOther]), [highValueOnly, displayedHighValue, displayedOther]);

  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const handleSelect = useCallback((p) => {
    const pName = p.name || p.product_name || "";
    setInputVal(pName);
    setDebouncedSearch(pName);
    onChange(p);
    setOpen(false);
    setHighlightedIndex(-1);
  }, [onChange]);

  const handleClear = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setInputVal("");
    setDebouncedSearch("");
    onChange("");
    setOpen(false);
    setHighlightedIndex(-1);
  }, [onChange]);

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setHighlightedIndex(0);
      } else {
        setHighlightedIndex((prev) => (prev < combinedList.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setHighlightedIndex(combinedList.length - 1);
      } else {
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : combinedList.length - 1));
      }
    } else if (e.key === "Enter") {
      if (open && highlightedIndex >= 0 && combinedList[highlightedIndex]) {
        e.preventDefault();
        handleSelect(combinedList[highlightedIndex]);
      }
    } else if (e.key === "Escape" || e.key === "Tab") {
      setOpen(false);
      setHighlightedIndex(-1);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div ref={containerRef} className="relative w-full">
          <Input
            value={inputVal}
            onChange={(e) => {
              setHighlightedIndex(-1);
              handleInputChange(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              setOpen(true);
              const v = value || "";
              setInputVal(v);
              setDebouncedSearch(v);
            }}
            placeholder={placeholder}
            className={`${className} pr-7`}
            data-testid={testid}
            required={required}
            ref={inputRef}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            name="material_product_name_autocomplete"
          />
          {inputVal ? (
            <button
              type="button"
              tabIndex={-1}
              onClick={handleClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded transition"
              title="Clear product"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>
      </PopoverTrigger>
      {open && (
        <PopoverContent
          className="p-0 border border-slate-200 bg-white rounded-xl shadow-2xl z-[99999] min-w-[280px] w-[var(--radix-popover-trigger-width)] max-h-64 overflow-y-auto text-xs py-1 text-left"
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {!hasAnyMatches ? (
            <div className="px-4 py-3 text-slate-400 italic text-center">
              No materials/products found
              {inputVal && <div className="text-[11px] text-slate-500 font-normal not-italic mt-1">Using custom: <span className="font-semibold text-slate-700">"{inputVal}"</span></div>}
            </div>
          ) : (
            <>
              {displayedHighValue.length > 0 && (
                <>
                  <div className="px-2.5 py-1 text-[10px] font-bold text-blue-600 uppercase tracking-wider bg-slate-50 flex items-center justify-between sticky top-0 z-10 border-b border-slate-100">
                    <span>HIGH VALUE GOODS</span>
                    {filteredHighValue.length > 50 && <span className="text-[9px] text-slate-400 font-normal">Showing 50 of {filteredHighValue.length}</span>}
                  </div>
                  {displayedHighValue.map((p, idx) => {
                    const isHighlighted = idx === highlightedIndex;
                    return (
                      <button
                        key={p.id || `${p.name}-${p.size}`}
                        type="button"
                        className={`w-full text-left px-4 py-2 font-semibold transition-colors border-b border-slate-50 last:border-0 ${
                          isHighlighted ? "bg-blue-100/90 text-blue-900" : "hover:bg-blue-50/80 text-slate-800"
                        }`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelect(p);
                        }}
                        onMouseEnter={() => setHighlightedIndex(idx)}
                      >
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-900">{p.name}</span>
                          {p.size && <span className="text-[10px] text-slate-500 font-normal mt-0.5">{p.size}</span>}
                        </div>
                      </button>
                    );
                  })}
                </>
              )}

              {!highValueOnly && displayedOther.length > 0 && (
                <>
                  {displayedHighValue.length > 0 && <div className="border-t border-slate-100 my-1"></div>}
                  <div className="px-2.5 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50 flex items-center justify-between sticky top-0 z-10 border-b border-slate-100">
                    <span>OTHER PRODUCTS (A-Z)</span>
                    {filteredOther.length > 100 && <span className="text-[9px] text-slate-400 font-normal">Showing 100 of {filteredOther.length}</span>}
                  </div>
                  {displayedOther.map((p, idx) => {
                    const globalIdx = displayedHighValue.length + idx;
                    const isHighlighted = globalIdx === highlightedIndex;
                    return (
                      <button
                        key={p.id || `${p.name}-${p.size}`}
                        type="button"
                        className={`w-full text-left px-4 py-2 transition-colors border-b border-slate-50 last:border-0 ${
                          isHighlighted ? "bg-blue-100/90 text-blue-900 font-semibold" : "hover:bg-slate-100 text-slate-700"
                        }`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelect(p);
                        }}
                        onMouseEnter={() => setHighlightedIndex(globalIdx)}
                      >
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-800">{p.name}</span>
                          {p.size && <span className="text-[10px] text-slate-500 font-normal mt-0.5">{p.size}</span>}
                        </div>
                      </button>
                    );
                  })}
                </>
              )}
            </>
          )}
        </PopoverContent>
      )}
    </Popover>
  );
}

export function ControlledAutocompleteInput({
  value = "",
  onChange,
  options = [],
  filterItem,
  getItemKey,
  getItemLabel,
  renderItem,
  placeholder = "Search...",
  className = "",
  testid,
  required = false,
  emptyText = "No matches found",
  disabled = false,
  allowCustom = true,
  inputRef,
  onClear,
}) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value || "");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const internalInputRef = useRef(null);
  const listRef = useRef(null);
  const actualInputRef = inputRef || internalInputRef;

  useEffect(() => {
    setInputValue(value || "");
  }, [value]);

  const defaultGetLabel = useCallback((item) => {
    if (!item) return "";
    if (typeof item === "string") return item;
    return item.name || item.full_name || item.title || "";
  }, []);

  const getLabel = getItemLabel || defaultGetLabel;
  const getKey = getItemKey || ((item, idx) => item?.id || item?._id || getLabel(item) || idx);

  const filteredOptions = useMemo(() => {
    const q = (inputValue || "").trim().toLowerCase();
    const list = Array.isArray(options) ? options : (options?.items || options?.clients || options?.vendors || []);
    if (!q) {
      return list.slice(0, 50);
    }
    if (filterItem) {
      return list.filter((item) => filterItem(item, q)).slice(0, 50);
    }
    return list.filter((item) => {
      const label = String(getLabel(item) || "").toLowerCase();
      const sol = String(item?.sol_id || "").toLowerCase();
      const phone = String(item?.mobile || item?.phone || "").toLowerCase();
      const proj = String(item?.project_name || "").toLowerCase();
      const gstin = String(item?.gstin || "").toLowerCase();
      return label.includes(q) || sol.includes(q) || phone.includes(q) || proj.includes(q) || gstin.includes(q);
    }).slice(0, 50);
  }, [options, inputValue, filterItem, getLabel]);

  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const highlightedEl = listRef.current.children[highlightedIndex];
      if (highlightedEl && highlightedEl.scrollIntoView) {
        highlightedEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightedIndex]);

  const handleTextChange = (e) => {
    const val = e.target.value;
    setInputValue(val);
    setHighlightedIndex(-1);
    setOpen(true);
    if (onChange) {
      onChange(val, null);
    }
  };

  const handleSelect = (item) => {
    const label = getLabel(item);
    setInputValue(label);
    setOpen(false);
    setHighlightedIndex(-1);
    if (onChange) {
      onChange(label, item);
    }
  };

  const handleClear = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setInputValue("");
    setHighlightedIndex(-1);
    setOpen(false);
    if (onClear) {
      onClear();
    } else if (onChange) {
      onChange("", null);
    }
    actualInputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setHighlightedIndex(0);
      } else {
        setHighlightedIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setHighlightedIndex(filteredOptions.length - 1);
      } else {
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredOptions.length - 1));
      }
    } else if (e.key === "Enter") {
      if (open && highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
        e.preventDefault();
        handleSelect(filteredOptions[highlightedIndex]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlightedIndex(-1);
    } else if (e.key === "Tab") {
      setOpen(false);
      setHighlightedIndex(-1);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative w-full">
          <Input
            ref={actualInputRef}
            value={inputValue}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className={`${className} pr-7`}
            data-testid={testid}
            required={required}
            disabled={disabled}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {inputValue ? (
            <button
              type="button"
              tabIndex={-1}
              onClick={handleClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded transition"
              title="Clear text"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>
      </PopoverTrigger>

      {open && (
        <PopoverContent
          className="p-1 border border-slate-200 bg-white rounded-xl shadow-2xl z-[99999] min-w-[280px] w-[var(--radix-popover-trigger-width)] max-h-64 overflow-y-auto text-xs py-1 text-left"
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-3 text-slate-400 text-center italic">
              {emptyText}
              {allowCustom && inputValue && (
                <div className="text-[11px] text-slate-500 font-normal not-italic mt-1">
                  Using custom value: <span className="font-semibold text-slate-700">"{inputValue}"</span>
                </div>
              )}
            </div>
          ) : (
            <div ref={listRef} className="space-y-0.5">
              {filteredOptions.map((item, idx) => {
                const isHighlighted = idx === highlightedIndex;
                return (
                  <button
                    key={getKey(item, idx)}
                    type="button"
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors border-b border-slate-50 last:border-0 ${
                      isHighlighted ? "bg-blue-100/90 text-blue-900 font-semibold" : "hover:bg-blue-50/80 text-slate-800"
                    }`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(item);
                    }}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                  >
                    {renderItem ? (
                      renderItem(item, isHighlighted)
                    ) : (
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-900">{getLabel(item)}</span>
                        {(item.project_name || item.sol_id || item.mobile || item.gstin) && (
                          <span className="text-[10px] text-slate-400 font-normal mt-0.5">
                            {item.sol_id ? `[${item.sol_id}] ` : ""}
                            {item.project_name ? `Project: ${item.project_name} ` : ""}
                            {item.mobile ? `· ${item.mobile} ` : ""}
                            {item.gstin ? `· GST: ${item.gstin}` : ""}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </PopoverContent>
      )}
    </Popover>
  );
}

export function VendorAutocompleteInput({ value, onChange, vendors = [], placeholder = "Supplier company name", className, testid, required, onClear }) {
  return (
    <ControlledAutocompleteInput
      value={value}
      onChange={(label, item) => {
        onChange(label, item);
      }}
      onClear={onClear}
      options={vendors}
      getItemKey={(v) => v.id || v.name}
      getItemLabel={(v) => v.name || ""}
      filterItem={(v, q) => {
        const name = String(v.name || "").toLowerCase();
        const g = String(v.gstin || "").toLowerCase();
        const c = String(v.contact_person || "").toLowerCase();
        const p = String(v.mobile || v.phone || "").toLowerCase();
        return name.includes(q) || g.includes(q) || c.includes(q) || p.includes(q);
      }}
      renderItem={(v) => (
        <div className="flex flex-col">
          <span className="font-semibold text-slate-900">{v.name}</span>
          {(v.gstin || v.contact_person || v.mobile) && (
            <span className="text-[10px] text-slate-400 font-normal mt-0.5">
              {v.gstin ? `GST: ${v.gstin}` : ""} {v.contact_person ? `· ${v.contact_person}` : ""} {v.mobile ? `· ${v.mobile}` : ""}
            </span>
          )}
        </div>
      )}
      placeholder={placeholder}
      className={className}
      testid={testid}
      required={required}
      emptyText="No matching suppliers"
    />
  );
}

export function ClientAutocompleteInput({ value, onChange, clients = [], placeholder = "Search client name...", className, testid, required, onClear }) {
  return (
    <ControlledAutocompleteInput
      value={value}
      onChange={(label, item) => {
        onChange(label, item);
      }}
      onClear={onClear}
      options={clients}
      getItemKey={(c) => c.id || c.sol_id || c.full_name}
      getItemLabel={(c) => c.full_name || ""}
      filterItem={(c, q) => {
        const name = String(c.full_name || "").toLowerCase();
        const sol = String(c.sol_id || "").toLowerCase();
        const phone = String(c.mobile || c.phone || "").toLowerCase();
        const proj = String(c.project_name || "").toLowerCase();
        const consumer = String(c.consumer_number || "").toLowerCase();
        return name.includes(q) || sol.includes(q) || phone.includes(q) || proj.includes(q) || consumer.includes(q);
      }}
      renderItem={(c) => (
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-slate-900 truncate">{c.full_name}</span>
            {(c.project_name || c.mobile || c.phone) && (
              <span className="text-[10px] text-slate-400 font-normal mt-0.5 truncate">
                {c.project_name ? `Project: ${c.project_name}` : ""}
                {c.project_name && (c.mobile || c.phone) ? " · " : ""}
                {c.mobile || c.phone ? `Mobile: ${c.mobile || c.phone}` : ""}
              </span>
            )}
          </div>
          {c.sol_id && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded shrink-0">
              {c.sol_id}
            </span>
          )}
        </div>
      )}
      placeholder={placeholder}
      className={className}
      testid={testid}
      required={required}
      emptyText="No matching clients"
    />
  );
}

export function B2BCustomerAutocompleteInput({ value, onChange, customers = [], placeholder = "Select B2B customer...", className, testid, required, onClear }) {
  return (
    <ControlledAutocompleteInput
      value={value}
      onChange={(label, item) => {
        onChange(label, item);
      }}
      onClear={onClear}
      options={customers}
      getItemKey={(c) => c.id || c.name || c.full_name}
      getItemLabel={(c) => c.name || c.full_name || ""}
      filterItem={(c, q) => {
        const name = String(c.name || c.full_name || "").toLowerCase();
        const g = String(c.gstin || "").toLowerCase();
        const cp = String(c.contact_person || "").toLowerCase();
        const p = String(c.mobile || c.phone || "").toLowerCase();
        return name.includes(q) || g.includes(q) || cp.includes(q) || p.includes(q);
      }}
      renderItem={(c) => (
        <div className="flex flex-col">
          <span className="font-semibold text-slate-900">{c.name || c.full_name}</span>
          {(c.contact_person || c.mobile || c.gstin) && (
            <span className="text-[10px] text-slate-400 font-normal mt-0.5">
              {c.contact_person ? `Contact: ${c.contact_person}` : ""} {c.mobile ? `· ${c.mobile}` : ""} {c.gstin ? `· GSTIN: ${c.gstin}` : ""}
            </span>
          )}
        </div>
      )}
      placeholder={placeholder}
      className={className}
      testid={testid}
      required={required}
      emptyText="No matching B2B customers"
    />
  );
}
