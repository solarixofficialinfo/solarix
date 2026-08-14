import React, { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, CheckCircle2, Clock, AlertCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";

export default function FeedbackInbox() {
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");

  useEffect(() => {
    fetchFeedback();
  }, []);

  const fetchFeedback = async () => {
    setLoading(true);
    try {
      const res = await api.get("/platform-owner/feedback");
      setFeedback(res.data);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (id, newStatus) => {
    try {
      await api.put(`/platform-owner/feedback/${id}`, { status: newStatus });
      toast.success("Feedback status updated");
      fetchFeedback();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const filtered = filterStatus === "all" ? feedback : feedback.filter((f) => f.status === filterStatus);

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-blue-400" /> Feedback Inbox
          </h2>
          <p className="text-xs text-slate-400">Review feedback submitted by workspace owners and team members.</p>
        </div>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36 h-9 text-xs bg-slate-950 border-slate-800 text-white"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-800 text-white text-xs">
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="New">New</SelectItem>
            <SelectItem value="Reviewing">Reviewing</SelectItem>
            <SelectItem value="Planned">Planned</SelectItem>
            <SelectItem value="Completed">Completed</SelectItem>
            <SelectItem value="Rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {loading && <div className="p-8 text-center text-slate-400 font-mono text-xs">Loading feedback inbox...</div>}
        {!loading && filtered.length === 0 && (
          <Card className="bg-slate-950/60 border-slate-800 p-8 text-center text-slate-500 font-mono text-xs">
            No feedback entries match the selected status filter.
          </Card>
        )}
        {!loading && filtered.map((fb) => (
          <Card key={fb.id} className="bg-slate-950/60 border-slate-800 p-4 text-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-blue-500/10 text-blue-300 border-blue-500/30 uppercase text-[10px]">
                  {fb.feedback_type}
                </Badge>
                <span className="font-bold text-white">{fb.user_name || "User"}</span>
                <span className="text-[11px] text-slate-400 font-mono">({fb.user_email})</span>
              </div>

              <div className="flex items-center gap-2">
                <Select value={fb.status || "New"} onValueChange={(val) => handleUpdateStatus(fb.id, val)}>
                  <SelectTrigger className="h-7 text-[11px] bg-slate-900 border-slate-700 text-slate-200 w-32"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-white text-xs">
                    <SelectItem value="New">New</SelectItem>
                    <SelectItem value="Reviewing">Reviewing</SelectItem>
                    <SelectItem value="Planned">Planned</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                    <SelectItem value="Rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <p className="text-slate-200 text-sm font-medium bg-slate-900/80 p-3 rounded-xl border border-slate-800/80">
              "{fb.message}"
            </p>

            <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
              <span>Page: {fb.page || "/"}</span>
              <span>Submitted: {fb.created_at ? new Date(fb.created_at).toLocaleString() : "Recent"}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
