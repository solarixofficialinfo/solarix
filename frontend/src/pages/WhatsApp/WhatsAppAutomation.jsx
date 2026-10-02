import React, { useState, useEffect } from "react";
import api from "@/lib/api";
import {
  Zap,
  Plus,
  Play,
  Trash2,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  Sparkles,
  ArrowRight,
  Settings2,
  Calendar
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

export default function WhatsAppAutomation() {
  const [automations, setAutomations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [templates, setTemplates] = useState([]);

  // Form State
  const [name, setName] = useState("");
  const [triggerEvent, setTriggerEvent] = useState("service_due");
  const [templateId, setTemplateId] = useState("");
  const [delayMinutes, setDelayMinutes] = useState(0);

  const fetchAutomations = async () => {
    try {
      setLoading(true);
      const res = await api.get("/whatsapp/automations");
      setAutomations(res.data?.automations || []);
    } catch (e) {
      console.error("Failed to load automations", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const res = await api.get("/whatsapp/templates");
      setTemplates(res.data?.templates || []);
    } catch (e) {
      console.error("Failed to load templates", e);
    }
  };

  useEffect(() => {
    fetchAutomations();
    fetchTemplates();
  }, []);

  const handleToggle = async (autoId) => {
    try {
      const res = await api.put(`/whatsapp/automations/${autoId}/toggle`);
      setAutomations((prev) =>
        prev.map((a) => (a.id === autoId ? { ...a, is_active: res.data.is_active } : a))
      );
      toast.success("Automation status updated");
    } catch (e) {
      toast.error("Failed to toggle automation");
    }
  };

  const handleTestRun = async (autoId) => {
    try {
      const res = await api.post(`/whatsapp/automations/${autoId}/test-run`);
      toast.success(res.data?.message || "Automation triggered successfully!");
      fetchAutomations();
    } catch (e) {
      toast.error("Failed to run test automation");
    }
  };

  const handleDelete = async (autoId) => {
    if (!window.confirm("Delete this automation rule?")) return;
    try {
      await api.delete(`/whatsapp/automations/${autoId}`);
      toast.success("Automation rule deleted");
      fetchAutomations();
    } catch (e) {
      toast.error("Failed to delete automation rule");
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Please enter an automation rule name");
      return;
    }
    try {
      await api.post("/whatsapp/automations", {
        name,
        trigger_event: triggerEvent,
        action_type: "send_template",
        template_id: templateId || null,
        delay_minutes: Number(delayMinutes) || 0,
        is_active: true,
      });
      toast.success("Automation rule created!");
      setModalOpen(false);
      setName("");
      fetchAutomations();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to create automation rule");
    }
  };

  const getTriggerLabel = (event) => {
    switch (event) {
      case "installation_completed":
        return "Installation Completed";
      case "service_due":
        return "Service Due (7 Days Before)";
      case "payment_due":
        return "Milestone Payment Due";
      case "new_lead":
        return "New CRM Lead Ingestion";
      case "campaign_completed":
        return "Campaign Completed";
      default:
        return event;
    }
  };

  return (
    <div className="space-y-6">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
            WhatsApp CRM Automation Rules
          </h2>
          <p className="text-xs text-slate-500">
            Automatically trigger personalized WhatsApp messages when solar lifecycle events happen in Solarix CRM.
          </p>
        </div>

        <Button
          size="sm"
          onClick={() => setModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9 gap-1.5 shadow-sm font-semibold"
        >
          <Plus className="w-4 h-4" /> New Automation Rule
        </Button>
      </div>

      {/* Rules List */}
      <div className="space-y-3">
        {automations.map((auto) => (
          <div
            key={auto.id}
            className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-slate-300 transition"
          >
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">{auto.name}</h3>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${auto.is_active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500"}`}
                  >
                    {auto.is_active ? "Active" : "Disabled"}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <span className="font-semibold text-slate-700">WHEN:</span>
                  <Badge variant="outline" className="bg-slate-50 text-slate-800 text-[11px]">
                    {getTriggerLabel(auto.trigger_event)}
                  </Badge>
                  <ArrowRight className="w-3 h-3 text-slate-400" />
                  <span className="font-semibold text-slate-700">THEN:</span>
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[11px]">
                    Send WhatsApp Template
                  </Badge>
                  {auto.delay_minutes > 0 && (
                    <span className="text-slate-400 text-[11px]">
                      (Delay: {auto.delay_minutes} mins)
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-slate-400 pt-1">
                  Triggered: <span className="font-semibold text-slate-700">{auto.execution_count || 0} times</span> • Last run: {auto.last_run_at ? auto.last_run_at.slice(0, 10) : "Never"}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 self-end md:self-center">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleTestRun(auto.id)}
                className="h-8 text-xs text-blue-600 border-blue-200 hover:bg-blue-50 gap-1"
              >
                <Play className="w-3 h-3" /> Test Run
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleToggle(auto.id)}
                className="h-8 text-xs text-slate-700"
              >
                {auto.is_active ? "Pause" : "Activate"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDelete(auto.id)}
                className="h-8 text-xs text-red-500 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {automations.length === 0 && !loading && (
        <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl">
          <Zap className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="font-bold text-slate-900 text-sm">No Automations Active</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Create automated triggers for lead follow-ups, DISCOM meter installations, and service checks.
          </p>
          <Button size="sm" onClick={() => setModalOpen(true)} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-xs">
            + New Automation Rule
          </Button>
        </div>
      )}

      {/* New Rule Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              Create Automation Rule
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Set triggers based on CRM customer lifecycle events.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-2">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Rule Name *</label>
              <Input
                placeholder="e.g. Service Due 7 Days Advance Notice"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="text-xs h-9"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">CRM Trigger Event *</label>
              <select
                value={triggerEvent}
                onChange={(e) => setTriggerEvent(e.target.value)}
                className="w-full text-xs h-9 px-2.5 rounded-lg border border-slate-200 bg-white"
              >
                <option value="service_due">Service Due (7 Days Before Routine Date)</option>
                <option value="installation_completed">Installation Completed (Commissioned Stage)</option>
                <option value="payment_due">Payment Due Reminder</option>
                <option value="new_lead">New Lead Ingested into CRM</option>
                <option value="campaign_completed">Campaign Completed</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">WhatsApp Template to Dispatch</label>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="w-full text-xs h-9 px-2.5 rounded-lg border border-slate-200 bg-white"
              >
                <option value="">Default Recommended Template</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.category})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Delay (Minutes after event)</label>
              <Input
                type="number"
                placeholder="0 for immediate dispatch"
                value={delayMinutes}
                onChange={(e) => setDelayMinutes(e.target.value)}
                className="text-xs h-9"
              />
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" size="sm" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreate} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold">
              Save Automation Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
