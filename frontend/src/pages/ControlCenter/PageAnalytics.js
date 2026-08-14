import React, { useState, useEffect } from "react";
import api from "@/lib/api";
import { Activity, Clock, Eye, Users, Search, RefreshCw, BarChart2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function PageAnalytics() {
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchPageAnalytics();
  }, []);

  const fetchPageAnalytics = async () => {
    try {
      setLoading(true);
      const res = await api.get("/platform-owner/analytics/pages");
      setPages(res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = pages.filter(
    (p) => (p.name || "").toLowerCase().includes(search.toLowerCase()) || (p.path || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2" style={{ fontFamily: "Outfit" }}>
            <Activity className="w-5 h-5 text-emerald-400" /> Application Page & Module Analytics
          </h1>
          <p className="text-xs text-slate-400">
            Granular traffic breakdown showing total visits, unique visitors, and average user dwell time per page.
          </p>
        </div>
        <button onClick={fetchPageAnalytics} className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white transition-all text-xs flex items-center gap-1.5 font-mono">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh Analytics
        </button>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="relative w-full max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <Input
            placeholder="Search module or page path..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-slate-950 border-slate-800 text-xs text-white"
          />
        </div>
      </div>

      <Card className="bg-slate-950 border-slate-800 text-slate-100 shadow-lg overflow-hidden">
        <CardHeader className="border-b border-slate-800 pb-3">
          <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-emerald-400" /> Module Usage & Engagement Table
          </CardTitle>
          <CardDescription className="text-xs text-slate-400">
            Automatically captured non-blocking client navigation telemetry.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-slate-400 font-mono text-xs">Loading page visit telemetry...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-slate-400 font-mono text-xs">No page visit logs captured yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/80 text-slate-400 font-mono uppercase text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="p-3 font-semibold">Page Module</th>
                    <th className="p-3 font-semibold">Path URL</th>
                    <th className="p-3 font-semibold">Total Visits</th>
                    <th className="p-3 font-semibold">Unique Visitors</th>
                    <th className="p-3 font-semibold">Avg Duration (sec)</th>
                    <th className="p-3 font-semibold">Last Used</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filtered.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-900/50 transition-colors">
                      <td className="p-3 font-bold text-white flex items-center gap-2">
                        <Eye className="w-3.5 h-3.5 text-emerald-400" /> {item.name || item.path}
                      </td>
                      <td className="p-3 font-mono text-slate-400 text-[11px]">{item.path}</td>
                      <td className="p-3 font-mono font-bold text-blue-400">{item.visits}</td>
                      <td className="p-3 font-mono text-indigo-300">{item.unique_users}</td>
                      <td className="p-3 font-mono text-emerald-400">{item.avg_time_sec}s</td>
                      <td className="p-3 text-slate-400 text-[11px]">
                        {item.last_used ? new Date(item.last_used).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
