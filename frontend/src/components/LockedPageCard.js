import React from "react";
import { useNavigate } from "react-router-dom";
import { Lock, ArrowRight, ArrowLeft, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import useEntitlements from "@/hooks/useEntitlements";

const PAGE_DISPLAY_NAMES = {
  dashboard: "Dashboard",
  clients: "Clients",
  project_execution: "Project Execution",
  task_portal: "Task Portal",
  receivables: "Receivables & Collection",
  data_management: "Data Management (Inventory)",
  material_requests: "Material Requests",
  client_data: "Client Data",
  reports: "Reports",
  sales_documents: "Sales Documents",
  documents: "Document Templates",
  purchase_orders: "Purchase Orders",
  complaints: "Complaint Center",
  team: "Team & Access",
  settings: "Company Details",
  activity_log: "Activity Log",
  billing: "Billing & Subscription",
};

export default function LockedPageCard({ pageKey, pageTitle, requiredPlan = "Growth / Pro" }) {
  const navigate = useNavigate();
  const { planName } = useEntitlements();

  const title = pageTitle || PAGE_DISPLAY_NAMES[pageKey] || (pageKey ? pageKey.replace(/_/g, " ").toUpperCase() : "This Page");

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center max-w-xl mx-auto my-8">
      <Card className="border-amber-200/80 bg-white/95 shadow-md overflow-hidden w-full">
        <div className="bg-amber-500/10 border-b border-amber-100 p-6 flex flex-col items-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 border border-amber-200 text-amber-700 flex items-center justify-center mb-3 shadow-inner">
            <Lock className="w-7 h-7" />
          </div>
          <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 font-mono text-[11px] uppercase tracking-wider mb-2">
            Plan Entitlement Required
          </Badge>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Outfit" }}>
            {title} Locked
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-md">
            This application page is not included in your workspace's current <strong className="text-slate-700">{planName}</strong> plan.
          </p>
        </div>

        <CardContent className="p-6 space-y-5">
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 text-left text-xs space-y-2">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Upgrade to unlock {title}</span>
            </div>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              To access <strong>{title}</strong> along with its modules and operational workflows, upgrade your subscription to the <strong>{requiredPlan}</strong> plan.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/dashboard")}
              className="w-full sm:w-auto text-xs text-slate-600 border-slate-300 hover:bg-slate-100 gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Dashboard</span>
            </Button>
            <Button
              size="sm"
              onClick={() => navigate("/pricing")}
              className="w-full sm:w-auto text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-1.5 shadow-sm"
            >
              <span>Upgrade Plan</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
