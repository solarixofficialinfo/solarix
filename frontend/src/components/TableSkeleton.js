import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div className="w-full bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <Skeleton className="h-5 w-32 bg-slate-100" />
        <Skeleton className="h-4 w-20 bg-slate-100" />
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, rIdx) => (
          <div key={rIdx} className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <Skeleton className="w-9 h-9 rounded-lg bg-slate-100 shrink-0" />
              <div className="space-y-1.5 flex-1 max-w-xs">
                <Skeleton className="h-4 w-3/4 bg-slate-100" />
                <Skeleton className="h-3 w-1/2 bg-slate-100" />
              </div>
            </div>
            {Array.from({ length: cols - 1 }).map((_, cIdx) => (
              <Skeleton key={cIdx} className="h-4 w-24 bg-slate-100 hidden sm:block" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
