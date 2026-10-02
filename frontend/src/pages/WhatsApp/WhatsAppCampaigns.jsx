import React, { useState, useEffect } from "react";
import api from "@/lib/api";
import {
  Send,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Play,
  Pause,
  XCircle,
  Calendar,
  Users,
  Eye,
  CheckCheck,
  AlertCircle,
  Clock,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import CampaignWizardModal from "./CampaignWizardModal";

export default function WhatsAppCampaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/whatsapp/campaigns?status=${statusFilter}&search=${encodeURIComponent(search)}`);
      setCampaigns(res.data?.campaigns || []);
    } catch (e) {
      console.error("Failed to load campaigns", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const handleCampaignAction = async (campaignId, action) => {
    try {
      await api.post(`/whatsapp/campaigns/${campaignId}/${action}`);
      toast.success(`Campaign ${action}ed`);
      fetchCampaigns();
    } catch (e) {
      toast.error(e.response?.data?.detail || `Failed to ${action} campaign`);
    }
  };

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
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
            WhatsApp Marketing Campaigns
          </h2>
          <p className="text-xs text-slate-500">
            Create, schedule, and track customer broadcast messages with CRM variables.
          </p>
        </div>

        <Button
          size="sm"
          onClick={() => setCreateModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9 gap-1.5 shadow-sm font-semibold"
        >
          <Plus className="w-4 h-4" /> New Campaign
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
            <Input
              placeholder="Search campaigns..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchCampaigns()}
              className="pl-8 text-xs h-9 bg-slate-50 border-slate-200"
            />
          </div>

          <div className="w-36">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full text-xs h-9 px-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700"
            >
              <option value="all">All Statuses</option>
              <option value="Draft">Draft</option>
              <option value="Scheduled">Scheduled</option>
              <option value="Sending">Sending</option>
              <option value="Completed">Completed</option>
              <option value="Paused">Paused</option>
              <option value="Failed">Failed</option>
            </select>
          </div>
        </div>

        <Button size="sm" variant="outline" onClick={fetchCampaigns} className="text-xs h-9">
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Campaigns Grid / List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {campaigns.map((camp) => {
          const total = camp.total_audience || 0;
          const sent = camp.sent_count || 0;
          const delivered = camp.delivered_count || 0;
          const read = camp.read_count || 0;
          const failed = camp.failed_count || 0;
          const percent = total > 0 ? Math.round((sent / total) * 100) : 0;

          return (
            <div
              key={camp.id}
              className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-4 hover:border-slate-300 transition-all flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-slate-900 text-sm line-clamp-1">
                    {camp.name}
                  </h3>
                  {getStatusBadge(camp.status)}
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Badge variant="outline" className="text-[10px] bg-slate-50">
                    {camp.campaign_type}
                  </Badge>
                  <span>•</span>
                  <span>{(camp.created_at || "").slice(0, 10)}</span>
                </div>

                <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100 font-mono text-[11px]">
                  {camp.message_text}
                </p>
              </div>

              {/* Progress & Metrics */}
              <div className="space-y-3 pt-2 border-t border-slate-100 text-xs">
                <div className="flex items-center justify-between text-slate-600">
                  <span className="flex items-center gap-1 font-medium">
                    <Users className="w-3.5 h-3.5 text-blue-600" /> Audience: {total}
                  </span>
                  <span className="font-bold text-slate-900">{percent}% Complete</span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, percent)}%` }}
                  />
                </div>

                {/* Micro Funnel Counts */}
                <div className="grid grid-cols-4 gap-1 text-center py-1 bg-slate-50 rounded-lg text-[11px]">
                  <div>
                    <div className="text-slate-400 font-medium">Sent</div>
                    <div className="font-bold text-blue-600">{sent}</div>
                  </div>
                  <div>
                    <div className="text-slate-400 font-medium">Deliv</div>
                    <div className="font-bold text-emerald-600">{delivered}</div>
                  </div>
                  <div>
                    <div className="text-slate-400 font-medium">Read</div>
                    <div className="font-bold text-teal-600">{read}</div>
                  </div>
                  <div>
                    <div className="text-slate-400 font-medium">Fail</div>
                    <div className="font-bold text-red-500">{failed}</div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-1.5 pt-1">
                  {camp.status === "Draft" && (
                    <Button
                      size="sm"
                      onClick={() => handleCampaignAction(camp.id, "start")}
                      className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                    >
                      <Play className="w-3 h-3 mr-1" /> Start Sending
                    </Button>
                  )}
                  {camp.status === "Sending" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCampaignAction(camp.id, "pause")}
                      className="h-8 text-xs text-amber-600 hover:bg-amber-50"
                    >
                      <Pause className="w-3 h-3 mr-1" /> Pause
                    </Button>
                  )}
                  {camp.status === "Paused" && (
                    <Button
                      size="sm"
                      onClick={() => handleCampaignAction(camp.id, "resume")}
                      className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <Play className="w-3 h-3 mr-1" /> Resume
                    </Button>
                  )}
                  {camp.status === "Failed" && (
                    <Button
                      size="sm"
                      onClick={() => handleCampaignAction(camp.id, "start")}
                      className="h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                    >
                      <RefreshCw className="w-3 h-3 mr-1" /> Retry Campaign
                    </Button>
                  )}
                  {(camp.status === "Sending" || camp.status === "Scheduled") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCampaignAction(camp.id, "cancel")}
                      className="h-8 text-xs text-red-600 hover:bg-red-50"
                    >
                      <XCircle className="w-3 h-3 mr-1" /> Cancel
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {campaigns.length === 0 && !loading && (
        <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl">
          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
            <Send className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-slate-900 text-sm">No campaigns found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Get started by launching your first CRM-targeted WhatsApp broadcast.
          </p>
          <Button
            size="sm"
            onClick={() => setCreateModalOpen(true)}
            className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-xs"
          >
            + Create Campaign
          </Button>
        </div>
      )}

      {/* Campaign Wizard Modal */}
      <CampaignWizardModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onSuccess={fetchCampaigns}
      />
    </div>
  );
}
