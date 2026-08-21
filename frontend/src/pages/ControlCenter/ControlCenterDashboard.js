import React, { useEffect, useState, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Building2, Users, Briefcase, DollarSign, Activity, AlertCircle,
  TrendingUp, Clock, CheckCircle2, ChevronRight, MessageSquare, RefreshCw
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

export default function ControlCenterDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();

  const fetchDashboard = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await api.get("/platform-owner/dashboard");
      setData(res.data);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();

    // Auto-refresh every 10 seconds for real-time updates without manual reload
    const interval = setInterval(() => {
      fetchDashboard(false);
    }, 10000);

    const handleFocus = () => fetchDashboard(false);
    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [fetchDashboard]);

  if (loading && !data) {
    return <div className="p-8 text-center text-slate-400 font-mono text-xs animate-pulse">Loading Platform Dashboard...</div>;
  }

  const kpis = data?.kpis || {};

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">SaaS Platform Overview</h2>
          <p className="text-xs text-slate-400">Live customer accounts, active subscriptions, and real-time platform activity.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchDashboard(true)}
            disabled={refreshing}
            className="border-slate-800 text-slate-300 hover:bg-slate-900 text-xs h-8 gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-blue-400" : ""}`} />
            <span>Refresh</span>
          </Button>
          <Button onClick={() => navigate("/control-center/customers")} className="bg-blue-600 hover:bg-blue-700 font-semibold text-xs h-8 gap-1.5">
            <Building2 className="w-4 h-4" /> View All Customers
          </Button>
        </div>
      </div>

      {/* KPI GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-slate-950/60 border-slate-800 text-slate-100 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Total Customers</span>
            <Building2 className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white font-mono">{kpis.total_customers || 0}</div>
          <div className="text-[11px] text-emerald-400 flex items-center gap-1 font-mono">
            <CheckCircle2 className="w-3 h-3" /> {kpis.active_customers || 0} Active Workspaces
          </div>
        </Card>

        <Card className="bg-slate-950/60 border-slate-800 text-slate-100 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Trial Workspaces</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white font-mono">{kpis.trial_customers || 0}</div>
          <div className="text-[11px] text-amber-400 flex items-center gap-1 font-mono">
            <AlertCircle className="w-3 h-3" /> {kpis.expiring_subscriptions || 0} Expiring Soon
          </div>
        </Card>

        <Card className="bg-slate-950/60 border-slate-800 text-slate-100 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Total SaaS Users</span>
            <Users className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-white font-mono">{kpis.total_users || 0}</div>
          <div className="text-[11px] text-slate-400 font-mono">Across all companies</div>
        </Card>

        <Card className="bg-slate-950/60 border-slate-800 text-slate-100 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Estimated MRR</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-sm font-bold text-slate-300 font-mono mt-1">{kpis.mrr_revenue}</div>
          <div className="text-[11px] text-slate-500 font-mono">Stripe/Razorpay billing status</div>
        </Card>
      </div>

      {/* TWO COLUMN GRID FOR RECENT ACTIVITY & SIGNUPS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* RECENT SIGNUPS */}
        <Card className="bg-slate-950/60 border-slate-800 p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-400" /> Recent Customer Signups
            </h3>
            <Link to="/control-center/customers" className="text-xs text-blue-400 hover:underline">View All</Link>
          </div>

          <div className="divide-y divide-slate-800/60 text-xs">
            {(!data?.recent_signups || data.recent_signups.length === 0) && (
              <div className="py-6 text-center text-slate-500">No customer signups recorded yet.</div>
            )}
            {data?.recent_signups?.map((c) => (
              <div key={c.id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-bold text-white text-sm">{c.company_name}</div>
                  <div className="text-[11px] text-slate-400 font-mono">ID: {c.id} • {c.city || "India"}</div>
                </div>
                <div className="text-right space-y-1">
                  <Badge variant="outline" className="bg-blue-500/10 text-blue-300 border-blue-500/30 uppercase text-[10px]">
                    {c.plan_id || "Starter"}
                  </Badge>
                  <div className="text-[10px] text-slate-500 font-mono">
                    {c.created_at ? new Date(c.created_at).toLocaleDateString() : "Recent"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* RECENT PLATFORM ACTIVITY & FEEDBACK */}
        <Card className="bg-slate-950/60 border-slate-800 p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-purple-400" /> Real-time Platform Activity
            </h3>
            <Link to="/control-center/audit-logs" className="text-xs text-blue-400 hover:underline">Audit Logs</Link>
          </div>

          <div className="divide-y divide-slate-800/60 text-xs max-h-80 overflow-y-auto pr-1">
            {(!data?.recent_activity || data.recent_activity.length === 0) && (
              <div className="py-6 text-center text-slate-500">No activity recorded yet.</div>
            )}
            {data?.recent_activity?.map((act, i) => (
              <div key={i} className="py-2.5 space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">{act.action}</span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {act.created_at ? new Date(act.created_at).toLocaleTimeString() : ""}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">
                  By {act.user_name || "User"} • {act.target || "System"}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
