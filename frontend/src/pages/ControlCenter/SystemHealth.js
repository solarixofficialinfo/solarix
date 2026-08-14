import React, { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SystemHealth() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHealth();
  }, []);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const res = await api.get("/platform-owner/health");
      setHealth(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" /> Live System Health & Diagnostics
          </h2>
          <p className="text-xs text-slate-400">Real-time connectivity and status checks for infrastructure services.</p>
        </div>

        <Button size="xs" variant="outline" onClick={fetchHealth} disabled={loading} className="border-slate-700 text-slate-300 gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh Status
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {health?.services?.map((s, i) => (
          <Card key={i} className="bg-slate-950/60 border-slate-800 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-sm">{s.name}</span>
              <Badge
                variant="outline"
                className={
                  s.status === "Healthy"
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : s.status === "Warning"
                    ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                    : "bg-slate-800 text-slate-400 border-slate-700"
                }
              >
                {s.status}
              </Badge>
            </div>

            <div className="flex items-center justify-between text-xs font-mono text-slate-400 pt-2 border-t border-slate-800/80">
              <span>Response Latency:</span>
              <span className="text-white font-bold">{s.latency}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
