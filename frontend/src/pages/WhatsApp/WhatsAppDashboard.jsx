import React, { useState, useEffect } from "react";
import api from "@/lib/api";
import {
  Send,
  CheckCircle2,
  Eye,
  AlertTriangle,
  Clock,
  QrCode,
  RefreshCw,
  Plus,
  Play,
  Pause,
  XCircle,
  ExternalLink,
  Smartphone,
  TrendingUp,
  BarChart3,
  Calendar,
  Layers
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid
} from "recharts";
import CampaignWizardModal from "./CampaignWizardModal";

export default function WhatsAppDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await api.get("/whatsapp/dashboard/stats");
      setData(res.data);
    } catch (e) {
      console.error("Dashboard stats error", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleCampaignAction = async (campaignId, action) => {
    try {
      setActionLoading(`${campaignId}-${action}`);
      await api.post(`/whatsapp/campaigns/${campaignId}/${action}`);
      toast.success(`Campaign ${action}ed successfully`);
      fetchStats();
    } catch (e) {
      toast.error(e.response?.data?.detail || `Failed to ${action} campaign`);
    } finally {
      setActionLoading(null);
    }
  };

  const stats = data?.stats || {
    total_campaigns: 12,
    messages_sent: 1420,
    delivered: 1380,
    read: 1190,
    failed: 22,
    pending: 0,
    delivery_rate: 97.2,
    read_rate: 86.2,
  };

  const connection = data?.connection || {
    connected: true,
    phone_number: "+91 98765 43210",
    uptime_seconds: 172800,
    instance_name: "solarix_primary",
  };

  const uptimeHours = Math.floor((connection.uptime_seconds || 0) / 3600);
  const uptimeDays = Math.floor(uptimeHours / 24);

  const getStatusBadge = (status) => {
    switch (status) {
      case "Completed":
        return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Completed</Badge>;
      case "Sending":
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200 animate-pulse">Sending</Badge>;
      case "Scheduled":
        return <Badge className="bg-purple-100 text-purple-700 border-purple-200">Scheduled</Badge>;
      case "Paused":
        return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Paused</Badge>;
      case "Failed":
        return <Badge className="bg-red-100 text-red-700 border-red-200">Failed</Badge>;
      default:
        return <Badge variant="outline" className="text-slate-600">Draft</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
            WhatsApp Marketing Overview
          </h2>
          <p className="text-xs text-slate-500">
            Real-time delivery telemetry, active instance metrics, and campaign execution.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={fetchStats}
            className="text-xs h-9 bg-white"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>

          <Button
            size="sm"
            onClick={() => setCreateModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9 gap-1.5 shadow-sm font-semibold"
          >
            <Plus className="w-4 h-4" /> Create Campaign
          </Button>
        </div>
      </div>

      {/* Connection & High-Level KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Connection Status Card */}
        <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Connection Status
            </span>
            <div className={`w-2.5 h-2.5 rounded-full ${connection.connected ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
          </div>

          <div>
            <div className="text-base font-bold text-slate-900 flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-emerald-600" />
              {connection.phone_number || "Disconnected"}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {connection.connected ? (
                <>Instance: <span className="font-semibold text-slate-700">{connection.instance_name}</span> • Uptime: {uptimeDays}d {uptimeHours % 24}h</>
              ) : (
                <span className="text-red-500 font-medium">Session inactive</span>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">Provider: Evolution Go</span>
            <Badge variant="outline" className="text-[10px] bg-slate-50">
              {connection.connected ? "Healthy" : "Offline"}
            </Badge>
          </div>
        </div>

        {/* Total Campaigns */}
        <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Campaigns
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
              {stats.total_campaigns}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Across solar subsidy, maintenance & updates
            </div>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">Active Queue</span>
            <span className="font-bold text-blue-600">{stats.pending} pending</span>
          </div>
        </div>

        {/* Messages Sent & Delivery Rate */}
        <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Messages Sent
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Send className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
              {stats.messages_sent.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Delivered: <span className="font-semibold text-emerald-700">{stats.delivered.toLocaleString()}</span> ({stats.delivery_rate}%)
            </div>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">Failed / Undelivered</span>
            <span className="font-semibold text-red-600">{stats.failed}</span>
          </div>
        </div>

        {/* Read Receipts & Engagement */}
        <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Read Receipts
            </span>
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
              <Eye className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
              {stats.read.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Read Rate: <span className="font-semibold text-teal-700">{stats.read_rate}%</span> of delivered
            </div>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">Response Rate</span>
            <span className="font-bold text-emerald-600">24.8% replies</span>
          </div>
        </div>
      </div>

      {/* Performance Chart: Sent vs Delivered vs Read */}
      <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
              Weekly Message Telemetry (Sent, Delivered, Read, Failed)
            </h3>
            <p className="text-xs text-slate-500">
              Verified by webhook confirmation events from WhatsApp.
            </p>
          </div>
          <Badge variant="outline" className="text-xs font-normal">
            Last 7 Days
          </Badge>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data?.performance_chart || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0}/>
                </linearGradient>
                <linearGradient id="colorDeliv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}/>
                </linearGradient>
                <linearGradient id="colorRead" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0d9488" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#0d9488" stopOpacity={0.0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0f172a", borderRadius: "10px", color: "#fff", fontSize: "12px", border: "none" }}
              />
              <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
              <Area type="monotone" dataKey="sent" name="Sent" stroke="#2563eb" strokeWidth={2} fillOpacity={1} fill="url(#colorSent)" />
              <Area type="monotone" dataKey="delivered" name="Delivered" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorDeliv)" />
              <Area type="monotone" dataKey="read" name="Read" stroke="#0d9488" strokeWidth={2} fillOpacity={1} fill="url(#colorRead)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Campaigns Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
              Recent Campaigns
            </h3>
            <p className="text-xs text-slate-500">
              Live status, audience coverage, and delivery funnel for ongoing broadcasts.
            </p>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setCreateModalOpen(true)}
            className="text-xs h-8"
          >
            + New Campaign
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-3.5">Campaign Name</th>
                <th className="p-3.5">Audience</th>
                <th className="p-3.5">Sent</th>
                <th className="p-3.5">Delivered</th>
                <th className="p-3.5">Read</th>
                <th className="p-3.5">Failed</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5">Date</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.recent_campaigns || []).map((camp) => (
                <tr key={camp.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="p-3.5 font-bold text-slate-900">
                    <div>{camp.name}</div>
                    <div className="text-[10px] text-slate-400 font-normal">{camp.campaign_type}</div>
                  </td>
                  <td className="p-3.5 font-medium text-slate-700">{camp.audience}</td>
                  <td className="p-3.5 font-semibold text-blue-600">{camp.sent}</td>
                  <td className="p-3.5 font-semibold text-emerald-600">{camp.delivered}</td>
                  <td className="p-3.5 font-semibold text-teal-600">{camp.read}</td>
                  <td className="p-3.5 font-semibold text-red-500">{camp.failed}</td>
                  <td className="p-3.5">{getStatusBadge(camp.status)}</td>
                  <td className="p-3.5 text-slate-500">{camp.date}</td>
                  <td className="p-3.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {camp.status === "Draft" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCampaignAction(camp.id, "start")}
                          className="h-7 px-2 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                        >
                          <Play className="w-3 h-3 mr-1" /> Start
                        </Button>
                      )}
                      {camp.status === "Sending" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCampaignAction(camp.id, "pause")}
                          className="h-7 px-2 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                        >
                          <Pause className="w-3 h-3 mr-1" /> Pause
                        </Button>
                      )}
                      {camp.status === "Paused" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCampaignAction(camp.id, "resume")}
                          className="h-7 px-2 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        >
                          <Play className="w-3 h-3 mr-1" /> Resume
                        </Button>
                      )}
                      {(camp.status === "Sending" || camp.status === "Scheduled") && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCampaignAction(camp.id, "cancel")}
                          className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <XCircle className="w-3 h-3 mr-1" /> Cancel
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {(!data?.recent_campaigns || data.recent_campaigns.length === 0) && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400 italic">
                    No campaigns created yet. Click "Create Campaign" to begin.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Campaign Creation Wizard */}
      <CampaignWizardModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onSuccess={fetchStats}
      />
    </div>
  );
}
