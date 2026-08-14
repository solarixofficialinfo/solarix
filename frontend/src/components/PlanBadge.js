import React from "react";
import { Package, TrendingUp, Crown, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const PLAN_ICONS = {
  starter: Package,
  growth: TrendingUp,
  pro: Crown,
};

export const PLAN_CONFIGS = {
  starter: {
    label: "STARTER",
    icon: Package,
    colorClass: "bg-slate-800/80 text-slate-300 border-slate-700",
    badgeColor: "bg-slate-900 text-slate-300 border-slate-700",
    iconColor: "text-slate-400",
  },
  growth: {
    label: "GROWTH",
    icon: TrendingUp,
    colorClass: "bg-blue-950/60 text-blue-300 border-blue-800",
    badgeColor: "bg-blue-950/80 text-blue-300 border-blue-700",
    iconColor: "text-blue-400",
  },
  pro: {
    label: "PRO",
    icon: Crown,
    colorClass: "bg-amber-950/60 text-amber-300 border-amber-800",
    badgeColor: "bg-amber-950/80 text-amber-300 border-amber-700",
    iconColor: "text-amber-400",
  },
};

export default function PlanBadge({ planId = "starter", size = "sm", className = "" }) {
  const pid = (planId || "starter").toLowerCase();
  const config = PLAN_CONFIGS[pid] || PLAN_CONFIGS.starter;
  const Icon = config.icon;

  const isSmall = size === "xs" || size === "sm";

  return (
    <Badge
      variant="outline"
      className={`inline-flex items-center gap-1 font-mono uppercase font-bold tracking-wider ${config.colorClass} ${
        isSmall ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1"
      } ${className}`}
    >
      <Icon className={`${isSmall ? "w-3 h-3" : "w-3.5 h-3.5"} ${config.iconColor} shrink-0`} />
      <span>{config.label}</span>
    </Badge>
  );
}
