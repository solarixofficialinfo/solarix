import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { AlertTriangle } from "lucide-react";
import { getCachedProducts, fetchProductsDeduplicated } from "@/lib/productCache";
import { useProductList } from "@/hooks/useInventory";
export const UNIT_OPTIONS = ["Nos", "Pair", "Mtr", "Set", "Box", "Pcs", "Kg", "Ltr", "Roll"];
export const CATEGORY_OPTIONS = ["Solar Panel", "Inverter", "Battery", "BoS", "Cable", "Structure", "MC4 / Connector", "Earthing", "Net Meter", "Tools", "Other"];
export const REF_TYPES = ["Challan Number", "Invoice Number", "Book Number", "GRN Number", "Transport Number"];
export const OUTWARD_REF_TYPES = ["Challan Number", "Book Number", "Other"];
export const SRC_TYPES = ["Supplier", "Vendor", "Return From Client", "Manual Entry"];

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

  // ── Unified Product Source ────────────────────────────────────────────────
  const sourceList = useMemo(() => {
    return (products && products.length > 0) ? products : hookProducts;
  }, [products, hookProducts]);

  // ── Pre-index: builds searchKey once when sourceList changes ───────────
  const { highValueProducts, otherProducts } = useMemo(() => {
    const hvKeywords = ["SOLAR PANEL", "PANEL", "INVERTER", "ACDB", "DCDB", "METER", "BATTERY", "MODULE", "TRANSFORMER"];
    const hv = [];
    const other = [];

    for (const p of sourceList) {
      const nameUpper = (p.name || "").toUpperCase();
      const rawSize = (p.size || "").toUpperCase();
      const cleanSize = normalizeSizeForMatching(p.size);
      const _searchKey = `${nameUpper} ${cleanSize} ${rawSize}`;
      const item = { ...p, _searchKey };

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

  const handleSelect = useCallback((p) => {
    onChange(p);
    setInputVal("");
    setDebouncedSearch("");
    setOpen(false);
  }, [onChange]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div ref={containerRef} className="relative w-full">
          <Input
            value={value}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={() => {
              setOpen(true);
              const v = value || "";
              setInputVal(v);
              setDebouncedSearch(v);
            }}
            placeholder={placeholder}
            className={className}
            data-testid={testid}
            required={required}
            ref={inputRef}
          />
        </div>
      </PopoverTrigger>
      {open && (
        <PopoverContent
          className="p-0 border border-slate-200 bg-white rounded-xl shadow-2xl z-[99999] min-w-[280px] w-[var(--radix-popover-trigger-width)] max-h-64 overflow-y-auto text-xs py-1 text-left"
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="px-2.5 py-1 text-[10px] font-bold text-blue-600 uppercase tracking-wider bg-slate-50 flex items-center justify-between sticky top-0 z-10 border-b border-slate-100">
            <span>HIGH VALUE GOODS</span>
            {filteredHighValue.length > 50 && <span className="text-[9px] text-slate-400 font-normal">Showing 50 of {filteredHighValue.length}</span>}
          </div>
          {displayedHighValue.length === 0 ? (
            <div className="px-4 py-1.5 text-slate-400 italic">No high value goods found</div>
          ) : (
            displayedHighValue.map((p) => (
              <button
                key={p.id || `${p.name}-${p.size}`}
                type="button"
                className="w-full text-left px-4 py-2 hover:bg-blue-50/80 font-semibold text-slate-800 transition-colors border-b border-slate-50 last:border-0"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(p);
                }}
              >
                <div className="flex flex-col">
                  <span className="font-semibold text-slate-900">{p.name}</span>
                  {p.size && <span className="text-[10px] text-slate-500 font-normal mt-0.5">{p.size}</span>}
                </div>
              </button>
            ))
          )}

          {!highValueOnly && (
            <>
              <div className="border-t border-slate-100 my-1"></div>

              <div className="px-2.5 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50 flex items-center justify-between sticky top-0 z-10 border-b border-slate-100">
                <span>OTHER PRODUCTS (A-Z)</span>
                {filteredOther.length > 100 && <span className="text-[9px] text-slate-400 font-normal">Showing 100 of {filteredOther.length}</span>}
              </div>
              {displayedOther.length === 0 ? (
                <div className="px-4 py-1.5 text-slate-400 italic">No other products found</div>
              ) : (
                displayedOther.map((p) => (
                  <button
                    key={p.id || `${p.name}-${p.size}`}
                    type="button"
                    className="w-full text-left px-4 py-2 hover:bg-slate-100 text-slate-700 transition-colors border-b border-slate-50 last:border-0"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(p);
                    }}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium text-slate-800">{p.name}</span>
                      {p.size && <span className="text-[10px] text-slate-500 font-normal mt-0.5">{p.size}</span>}
                    </div>
                  </button>
                ))
              )}
            </>
          )}
        </PopoverContent>
      )}
    </Popover>
  );
}

export function VendorAutocompleteInput({ value, onChange, vendors = [], placeholder = "Supplier company name", className, testid, required }) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState(value || "");

  useEffect(() => {
    setInputVal(value || "");
  }, [value]);

  const filtered = useMemo(() => {
    const q = (inputVal || "").trim().toLowerCase();
    if (!q) return vendors.slice(0, 50);
    return vendors.filter((v) => {
      const n = (v.name || "").toLowerCase();
      const g = (v.gstin || "").toLowerCase();
      const c = (v.contact_person || "").toLowerCase();
      return n.includes(q) || g.includes(q) || c.includes(q);
    }).slice(0, 50);
  }, [vendors, inputVal]);

  const handleTextChange = (val) => {
    setInputVal(val);
    const matched = vendors.find(v => (v.name || "").trim().toLowerCase() === val.trim().toLowerCase());
    onChange(val, matched);
  };

  const handleSelect = (v) => {
    setInputVal(v.name);
    onChange(v.name, v);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative w-full">
          <Input
            value={inputVal}
            onChange={(e) => handleTextChange(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className={className}
            data-testid={testid}
            required={required}
          />
        </div>
      </PopoverTrigger>
      {open && filtered.length > 0 && (
        <PopoverContent
          className="p-0 border border-slate-200 bg-white rounded-xl shadow-2xl z-[99999] min-w-[280px] w-[var(--radix-popover-trigger-width)] max-h-64 overflow-y-auto text-xs py-1 text-left"
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="px-2.5 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50 sticky top-0 z-10 border-b border-slate-100">
            EXISTING VENDORS
          </div>
          {filtered.map((v) => (
            <button
              key={v.id || v.name}
              type="button"
              className="w-full text-left px-4 py-2 hover:bg-blue-50/80 font-medium text-slate-800 transition-colors border-b border-slate-50 last:border-0"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(v);
              }}
            >
              <div className="flex flex-col">
                <span className="font-semibold text-slate-900">{v.name}</span>
                {(v.gstin || v.contact_person) && (
                  <span className="text-[10px] text-slate-400 font-normal mt-0.5">
                    {v.gstin ? `GST: ${v.gstin}` : ""} {v.contact_person ? `· ${v.contact_person}` : ""}
                  </span>
                )}
              </div>
            </button>
          ))}
        </PopoverContent>
      )}
    </Popover>
  );
}

export function ClientAutocompleteInput({ value, onChange, clients = [], placeholder = "Search client name...", className, testid, required }) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState(value || "");

  useEffect(() => {
    setInputVal(value || "");
  }, [value]);

  const filtered = useMemo(() => {
    const q = (inputVal || "").trim().toLowerCase();
    if (!q) return clients.slice(0, 50);
    return clients.filter((c) => {
      const n = (c.full_name || "").toLowerCase();
      const p = (c.mobile || c.phone || "").toLowerCase();
      const pr = (c.project_name || "").toLowerCase();
      return n.includes(q) || p.includes(q) || pr.includes(q);
    }).slice(0, 50);
  }, [clients, inputVal]);

  const handleTextChange = (val) => {
    setInputVal(val);
    const matched = clients.find(c => (c.full_name || "").trim().toLowerCase() === val.trim().toLowerCase());
    onChange(val, matched);
  };

  const handleSelect = (c) => {
    setInputVal(c.full_name);
    onChange(c.full_name, c);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative w-full">
          <Input
            value={inputVal}
            onChange={(e) => handleTextChange(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className={className}
            data-testid={testid}
            required={required}
          />
        </div>
      </PopoverTrigger>
      {open && filtered.length > 0 && (
        <PopoverContent
          className="p-0 border border-slate-200 bg-white rounded-xl shadow-2xl z-[99999] min-w-[280px] w-[var(--radix-popover-trigger-width)] max-h-64 overflow-y-auto text-xs py-1 text-left"
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="px-2.5 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50 sticky top-0 z-10 border-b border-slate-100">
            EXISTING CLIENTS
          </div>
          {filtered.map((c) => (
            <button
              key={c.id || c.full_name}
              type="button"
              className="w-full text-left px-4 py-2 hover:bg-blue-50/80 font-medium text-slate-800 transition-colors border-b border-slate-50 last:border-0"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(c);
              }}
            >
              <div className="flex flex-col">
                <span className="font-semibold text-slate-900">{c.full_name}</span>
                {(c.project_name || c.mobile) && (
                  <span className="text-[10px] text-slate-400 font-normal mt-0.5">
                    {c.project_name ? `Project: ${c.project_name}` : ""} {c.mobile ? `· ${c.mobile}` : ""}
                  </span>
                )}
              </div>
            </button>
          ))}
        </PopoverContent>
      )}
    </Popover>
  );
}
