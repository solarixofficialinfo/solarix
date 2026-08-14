import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollText, UserCheck, Shield } from "lucide-react";

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await api.get("/platform-owner/audit-logs");
      setLogs(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-blue-400" /> Platform Owner Audit Logs
          </h2>
          <p className="text-xs text-slate-400">Complete, tamper-evident log of all administrative actions performed across workspaces.</p>
        </div>
      </div>

      <Card className="bg-slate-950/60 border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Admin</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Target Customer</th>
                <th className="px-4 py-3">Reason / Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-200 font-mono">
              {loading && (
                <tr><td colSpan={5} className="p-8 text-center text-slate-400">Loading audit log entries...</td></tr>
              )}
              {!loading && logs.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-slate-500 font-sans">No platform owner audit logs recorded yet.</td></tr>
              )}
              {!loading && logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3 text-slate-400">{log.timestamp ? new Date(log.timestamp).toLocaleString() : "—"}</td>
                  <td className="px-4 py-3 font-sans font-semibold text-white">{log.admin_name}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="bg-blue-500/10 text-blue-300 border-blue-500/30">
                      {log.action}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-sans font-medium text-slate-200">{log.target_name || log.target_company_id}</td>
                  <td className="px-4 py-3 text-slate-400 font-sans text-xs">{log.reason || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
