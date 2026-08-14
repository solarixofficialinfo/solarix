import React, { useState } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, ChevronsUpDown, Search, Package, User, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function PortalCombobox({
  value,
  onChange,
  options = [], // [{ label: '...', value: '...', group: '...' }]
  placeholder = "Select option...",
  searchPlaceholder = "Search...",
  className = "",
  width = "w-full",
  emptyText = "No items found",
  allowCustom = true,
  renderIcon = null,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedOption = options.find(
    (o) => String(o.value).toLowerCase() === String(value).toLowerCase() || String(o.label).toLowerCase() === String(value).toLowerCase()
  );

  const filteredOptions = options.filter(
    (o) =>
      o.label.toLowerCase().includes(query.toLowerCase()) ||
      (o.group && o.group.toLowerCase().includes(query.toLowerCase())) ||
      (o.subtext && o.subtext.toLowerCase().includes(query.toLowerCase()))
  );

  // Grouping logic if groups exist
  const grouped = filteredOptions.reduce((acc, opt) => {
    const grp = opt.group || "Items";
    if (!acc[grp]) acc[grp] = [];
    acc[grp].push(opt);
    return acc;
  }, {});

  const handleSelect = (val, label) => {
    onChange(val, label);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "justify-between text-left font-normal text-xs h-9 bg-white border-slate-200 hover:bg-slate-50 transition-colors",
            !value && "text-slate-400",
            className
          )}
        >
          <span className="truncate flex items-center gap-1.5">
            {renderIcon}
            {selectedOption ? selectedOption.label : value || placeholder}
          </span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50 text-slate-400" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="p-2 shadow-xl border border-slate-200 bg-white rounded-lg z-[99999] min-w-[240px] max-w-[420px]"
        align="start"
        sideOffset={6}
      >
        <div className="flex items-center border-b border-slate-100 pb-2 mb-2 px-1 gap-2">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <Input
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-7 text-xs border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-0 bg-transparent"
            autoFocus
          />
        </div>

        <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar text-xs">
          {Object.keys(grouped).length === 0 ? (
            <div className="p-3 text-center text-slate-400 text-xs italic">
              {emptyText}
              {allowCustom && query && (
                <div className="mt-2">
                  <Button
                    size="xs"
                    onClick={() => handleSelect(query, query)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold"
                  >
                    Use "{query}" as custom item
                  </Button>
                </div>
              )}
            </div>
          ) : (
            Object.entries(grouped).map(([groupName, groupItems]) => (
              <div key={groupName} className="space-y-0.5">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1 bg-slate-50 rounded">
                  {groupName}
                </div>
                {groupItems.map((opt) => {
                  const isSelected =
                    String(value).toLowerCase() === String(opt.value).toLowerCase() ||
                    String(value).toLowerCase() === String(opt.label).toLowerCase();
                  return (
                    <div
                      key={opt.value || opt.label}
                      onClick={() => handleSelect(opt.value, opt.label)}
                      className={cn(
                        "flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer transition-colors text-xs",
                        isSelected
                          ? "bg-indigo-50 text-indigo-900 font-semibold"
                          : "hover:bg-slate-100 text-slate-700"
                      )}
                    >
                      <div className="truncate">
                        <div className="font-medium text-slate-900">{opt.label}</div>
                        {opt.subtext && <div className="text-[10px] text-slate-400 truncate">{opt.subtext}</div>}
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0 ml-2" />}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
