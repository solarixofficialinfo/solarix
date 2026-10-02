import React, { useState, useEffect } from "react";
import api from "@/lib/api";
import {
  History,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  User,
  Send,
  MessageCircle,
  FileText,
  Zap,
  Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default function WhatsAppActivityLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedLog, setSelectedLog] = useState(null);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const res = await api.get("/whatsapp/activity-logs");
      setLogs(res.data?.activity_logs || []);
    } catch (e) {
      console.error("Failed to load activity logs", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const getActionBadge = (action) => {
    switch (action) {
      case "campaign_created":
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[10px]">Campaign Created</Badge>;
      case "campaign_started":
        return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">Campaign Started</Badge>;
      case "campaign_completed":
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]">Campaign Completed</Badge>;
      case "customer_replied":
        return <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-[10px]">Customer Replied</Badge>;
      case "provider_connected":
        return <Badge className="bg-teal-100 text-teal-700 border-teal-200 text-[10px]">Provider Connected</Badge>;
      case "template_created":
        return <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-[10px]">Template Created</Badge>;
      case "automation_triggered":
        return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">Automation Triggered</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{action}</Badge>;
    }
  };

  const filtered = logs.filter((l) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (l.action || "").toLowerCase().includes(q) ||
      (l.user_name || "").toLowerCase().includes(q) ||
      (l.campaign_name || "").toLowerCase().includes(q) ||
      (l.customer_name || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
            WhatsApp Marketing Activity Log
          </h2>
          <p className="text-xs text-slate-500">
            Immutable audit record of all campaign dispatches, status callbacks, customer responses, and system triggers.
          </p>
        </div>

        <Button size="sm" variant="outline" onClick={fetchLogs} className="text-xs h-9 bg-white">
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
          <Input
            placeholder="Search activity by user, action, or campaign..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 text-xs h-9 bg-slate-50 border-slate-200"
          />
        </div>

        <div className="text-xs text-slate-500 font-medium">
          Total: <span className="font-bold text-slate-900">{filtered.length}</span> recorded events
        </div>
      </div>

      {/* Log Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-3.5">Timestamp</th>
                <th className="p-3.5">Action</th>
                <th className="p-3.5">Triggered By</th>
                <th className="p-3.5">Campaign</th>
                <th className="p-3.5">Customer / Target</th>
                <th className="p-3.5">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="p-3.5 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                    {(log.created_at || "").replace("T", " ").slice(0, 19)}
                  </td>
                  <td className="p-3.5">{getActionBadge(log.action)}</td>
                  <td className="p-3.5 font-medium text-slate-800 flex items-center gap-1.5">
                    <User className="w-3 h-3 text-slate-400" />
                    {log.user_name || "System Worker"}
                  </td>
                  <td className="p-3.5 font-semibold text-slate-900">
                    {log.campaign_name || "—"}
                  </td>
                  <td className="p-3.5 text-slate-600">
                    {log.customer_name || "—"}
                  </td>
                  <td className="p-3.5 text-slate-500 font-mono text-[10px] max-w-[200px] truncate">
                    {JSON.stringify(log.details || {})}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400 italic">
                    No activity logs recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
