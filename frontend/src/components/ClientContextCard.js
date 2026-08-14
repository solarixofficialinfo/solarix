import React from "react";
import { Link } from "react-router-dom";
import { User, Phone, MapPin, Zap, Hash, ShieldCheck, ArrowUpRight } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";

export default function ClientContextCard({ client, activeTab, onTabChange }) {
  if (!client) return null;

  const solId = client.sol_id || client.id || "SOL-N/A";
  const name = client.full_name || client.name || "Client";
  const mobile = client.mobile || "N/A";
  const city = client.city || client.address || "N/A";
  const capacity = client.system_kw ? `${client.system_kw} kW` : (client.capacity ? `${client.capacity} kW` : "N/A");
  const consumerNo = client.consumer_number || "N/A";
  const status = client.status || "Lead";

  const tabs = [
    { key: "overview", label: "Overview", link: `/clients/${client.id}` },
    { key: "project", label: "Project Execution", link: `/projects?client=${client.id}` },
    { key: "tasks", label: "Tasks", link: `/tasks?client=${client.id}` },
    { key: "clientData", label: "Client Data", link: `/client-data?id=${client.id}` },
    { key: "documents", label: "Documents", link: `/templates?client=${client.id}` },
    { key: "sales", label: "Sales & Invoices", link: `/sales-documents?client=${client.id}` },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs mb-6 space-y-4">
      {/* Header Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 bg-blue-50 text-blue-700 rounded-xl flex items-center justify-center font-bold text-lg border border-blue-100 shrink-0">
            {name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
                {name}
              </h2>
              <Badge variant="secondary" className="font-mono text-xs bg-slate-100 text-slate-700 font-semibold">
                {solId}
              </Badge>
              <StatusBadge status={status} />
            </div>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5 text-slate-400" /> {mobile}</span>
              <span className="text-slate-300">•</span>
              <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-slate-400" /> {city}</span>
              <span className="text-slate-300">•</span>
              <span className="flex items-center gap-1"><Zap className="w-3.5 h-3.5 text-blue-500" /> {capacity}</span>
              <span className="text-slate-300">•</span>
              <span className="flex items-center gap-1"><Hash className="w-3.5 h-3.5 text-slate-400" /> Consumer: {consumerNo}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <Link
            to={`/client-data?id=${client.id}`}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
          >
            Full Profile <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Contextual Navigation Bar */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 text-xs">
        {tabs.map((t) => {
          const isActive = activeTab === t.key;
          if (onTabChange) {
            return (
              <button
                key={t.key}
                onClick={() => onTabChange(t.key)}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
                  isActive
                    ? "bg-slate-900 text-white font-semibold shadow-xs"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {t.label}
              </button>
            );
          }
          return (
            <Link
              key={t.key}
              to={t.link}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
                isActive
                  ? "bg-slate-900 text-white font-semibold shadow-xs"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
