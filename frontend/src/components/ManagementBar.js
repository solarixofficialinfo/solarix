import React from "react";
import { Search, X, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function ManagementBar({
  search,
  onSearchChange,
  searchPlaceholder = "Search by name, ID, phone...",
  children,
  onClear,
  hasActiveFilters = false,
  totalCount,
  filteredCount,
  className = "",
  actions,
}) {
  return (
    <div className={`space-y-3 mb-5 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[260px]">
          {/* Search Box */}
          {onSearchChange && (
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={search || ""}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                className="pl-9 pr-8 h-9 text-xs border-slate-200 bg-slate-50/50 focus:bg-white transition-colors"
              />
              {search && (
                <button
                  onClick={() => onSearchChange("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Module-Specific Filters (Status, Priority, Assigned, Category, Date, etc.) */}
          {children}

          {/* Clear Filters Button */}
          {hasActiveFilters && onClear && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="h-9 px-2.5 text-xs text-slate-500 hover:text-slate-900 hover:bg-slate-100 gap-1.5"
            >
              <X className="w-3.5 h-3.5" /> Clear Filters
            </Button>
          )}
        </div>

        {/* Right side actions or result counts */}
        <div className="flex items-center gap-3 ml-auto text-xs text-slate-500">
          {(totalCount !== undefined || filteredCount !== undefined) && (
            <span className="font-medium shrink-0 bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md">
              {filteredCount !== undefined && totalCount !== undefined && filteredCount !== totalCount
                ? `${filteredCount} of ${totalCount} items`
                : `${totalCount ?? filteredCount} items`}
            </span>
          )}
          {actions}
        </div>
      </div>
    </div>
  );
}
