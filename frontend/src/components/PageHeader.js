import React from "react";
import { Badge } from "@/components/ui/badge";

export default function PageHeader({
  title,
  subtitle,
  badge,
  badgeVariant = "outline",
  children,
  className = "",
  actions,
}) {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 ${className}`}>
      <div>
        <div className="flex items-center gap-3">
          <h1
            className="text-2xl font-bold tracking-tight text-slate-900"
            style={{ fontFamily: "Outfit, sans-serif" }}
          >
            {title}
          </h1>
          {badge && (
            <Badge variant={badgeVariant} className="text-xs font-semibold px-2.5 py-0.5">
              {badge}
            </Badge>
          )}
        </div>
        {subtitle && (
          <p className="text-sm text-slate-500 mt-1 font-normal max-w-3xl">
            {subtitle}
          </p>
        )}
      </div>

      {(actions || children) && (
        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          {actions}
          {children}
        </div>
      )}
    </div>
  );
}
