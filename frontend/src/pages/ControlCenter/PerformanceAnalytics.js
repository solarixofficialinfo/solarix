import React, { useState, useEffect } from "react";
import api from "@/lib/api";
import { TrendingUp, Users, UserPlus, Flame, ArrowUpRight, BarChart3, PieChart, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function PerformanceAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPerformance();
  }, []);

  const fetchPerformance = async () => {
    try {
      setLoading(true);
      const res = await api.get("/platform-owner/analytics/performance");
      setData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-400 font-mono text-xs">Loading performance & usage analytics...</div>;
  }

  const { dau = 0, wau = 0, mau = 0, signups_30d = 0, most_used_features = [], least_used_features = [], usage_by_plan = {} } = data || {};

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2" style={{ fontFamily: "Outfit" }}>
            <TrendingUp className="w-5 h-5 text-blue-400" /> Product Usage & Performance Analytics
          </h1>
          <p className="text-xs text-slate-400">
            Real-time insights on active user retention (DAU/WAU/MAU), feature adoption, and usage breakdown by plan.
          </p>
        </div>
        <button onClick={fetchPerformance} className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white transition-all text-xs flex items-center gap-1.5 font-mono">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh Metrics
        </button>
      </div>

      {/* USER RETENTION CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-slate-950 border-slate-800 text-slate-100 p-4 space-y-1">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Daily Active (DAU)</div>
          <div className="text-3xl font-extrabold text-white font-mono">{dau}</div>
          <div className="text-[10px] text-emerald-400 flex items-center gap-1">
            <ArrowUpRight className="w-3 h-3" /> Live Users (24h)
          </div>
        </Card>

        <Card className="bg-slate-950 border-slate-800 text-slate-100 p-4 space-y-1">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Weekly Active (WAU)</div>
          <div className="text-3xl font-extrabold text-blue-400 font-mono">{wau}</div>
          <div className="text-[10px] text-slate-400">Past 7 Days Retention</div>
        </Card>

        <Card className="bg-slate-950 border-slate-800 text-slate-100 p-4 space-y-1">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Monthly Active (MAU)</div>
          <div className="text-3xl font-extrabold text-indigo-400 font-mono">{mau}</div>
          <div className="text-[10px] text-slate-400">Past 30 Days Active</div>
        </Card>

        <Card className="bg-slate-950 border-slate-800 text-slate-100 p-4 space-y-1">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">30-Day Signups</div>
          <div className="text-3xl font-extrabold text-emerald-400 font-mono">+{signups_30d}</div>
          <div className="text-[10px] text-emerald-400 flex items-center gap-1">
            <UserPlus className="w-3 h-3" /> New Companies
          </div>
        </Card>
      </div>

      {/* FEATURE ADOPTION RANKINGS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* TOP MOST USED FEATURES */}
        <Card className="bg-slate-950 border-slate-800 text-slate-100 shadow-lg">
          <CardHeader className="border-b border-slate-800 pb-3">
            <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
              <Flame className="w-4 h-4 text-amber-500" /> Top Most Adopted & Used Features
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Ranked by aggregate customer action volume.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {most_used_features.length === 0 ? (
              <div className="text-xs text-slate-500 italic p-4 text-center">Insufficient event data recorded yet.</div>
            ) : (
              most_used_features.map((feat, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-200">
                      {idx + 1}. {feat.feature}
                    </span>
                    <span className="font-mono text-blue-400 font-bold">{feat.count} events</span>
                  </div>
                  <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                    <div
                      className="bg-gradient-to-r from-blue-600 to-indigo-500 h-full rounded-full"
                      style={{
                        width: `${Math.min(100, Math.max(10, (feat.count / (most_used_features[0]?.count || 1)) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* FEATURE USAGE BY PLAN */}
        <Card className="bg-slate-950 border-slate-800 text-slate-100 shadow-lg">
          <CardHeader className="border-b border-slate-800 pb-3">
            <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
              <PieChart className="w-4 h-4 text-indigo-400" /> Activity Distribution by Subscription Plan
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Total system events executed per plan tier.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            {Object.entries(usage_by_plan).map(([planKey, eventCount]) => (
              <div key={planKey} className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                <div>
                  <Badge variant="outline" className="bg-blue-950/60 text-blue-300 border-blue-800 uppercase font-mono text-[10px]">
                    {planKey}
                  </Badge>
                  <div className="text-xs text-slate-400 mt-1 font-medium">Activity Volume</div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-white font-mono">{eventCount}</div>
                  <div className="text-[10px] text-slate-500">actions logged</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
