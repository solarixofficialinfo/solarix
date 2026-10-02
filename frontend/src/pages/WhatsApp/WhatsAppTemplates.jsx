import React, { useState, useEffect } from "react";
import api from "@/lib/api";
import {
  FileText,
  Plus,
  Copy,
  Trash2,
  Edit2,
  CheckCircle2,
  Clock,
  XCircle,
  Tag,
  Paperclip,
  Sparkles,
  RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

export default function WhatsAppTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);

  // Form State
  const [name, setName] = useState("");
  const [category, setCategory] = useState("MARKETING");
  const [bodyText, setBodyText] = useState("");
  const [mediaType, setMediaType] = useState("none");
  const [mediaUrl, setMediaUrl] = useState("");

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const res = await api.get("/whatsapp/templates");
      setTemplates(res.data?.templates || []);
    } catch (e) {
      console.error("Failed to load templates", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const openCreateModal = () => {
    setEditingTemplate(null);
    setName("");
    setCategory("MARKETING");
    setBodyText("");
    setMediaType("none");
    setMediaUrl("");
    setModalOpen(true);
  };

  const openEditModal = (tmpl) => {
    setEditingTemplate(tmpl);
    setName(tmpl.name);
    setCategory(tmpl.category || "MARKETING");
    setBodyText(tmpl.body_text);
    setMediaType(tmpl.media_type || "none");
    setMediaUrl(tmpl.media_url || "");
    setModalOpen(true);
  };

  const handleSaveTemplate = async () => {
    if (!name.trim() || !bodyText.trim()) {
      toast.error("Template name and message body are required");
      return;
    }

    try {
      const payload = {
        name,
        category,
        body_text: bodyText,
        media_type: mediaType,
        media_url: mediaUrl || null,
        status: "approved",
      };

      if (editingTemplate) {
        await api.put(`/whatsapp/templates/${editingTemplate.id}`, payload);
        toast.success("Template updated successfully");
      } else {
        await api.post("/whatsapp/templates", payload);
        toast.success("Template created successfully");
      }

      setModalOpen(false);
      fetchTemplates();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to save template");
    }
  };

  const handleDuplicate = async (tmplId) => {
    try {
      await api.post(`/whatsapp/templates/${tmplId}/duplicate`);
      toast.success("Template duplicated");
      fetchTemplates();
    } catch (e) {
      toast.error("Failed to duplicate template");
    }
  };

  const handleDelete = async (tmplId) => {
    if (!window.confirm("Are you sure you want to delete this template?")) return;
    try {
      await api.delete(`/whatsapp/templates/${tmplId}`);
      toast.success("Template deleted");
      fetchTemplates();
    } catch (e) {
      toast.error("Failed to delete template");
    }
  };

  const insertVariable = (tag) => {
    setBodyText((prev) => prev + " " + tag);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">Approved</Badge>;
      case "pending":
        return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">Pending Approval</Badge>;
      case "rejected":
        return <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]">Rejected</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">Draft</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
            WhatsApp Message Templates
          </h2>
          <p className="text-xs text-slate-500">
            Standardized and high-converting message templates with dynamic CRM customer variables.
          </p>
        </div>

        <Button
          size="sm"
          onClick={openCreateModal}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9 gap-1.5 shadow-sm font-semibold"
        >
          <Plus className="w-4 h-4" /> Create Template
        </Button>
      </div>

      {/* Templates Card Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((tmpl) => (
          <div
            key={tmpl.id}
            className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-3.5 flex flex-col justify-between hover:border-slate-300 transition"
          >
            <div className="space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 line-clamp-1">{tmpl.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-[10px] bg-slate-50">
                      {tmpl.category}
                    </Badge>
                    {getStatusBadge(tmpl.status)}
                  </div>
                </div>
              </div>

              {/* Message Body Box */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 font-mono text-[11px] text-slate-700 whitespace-pre-line leading-relaxed min-h-[90px] max-h-[140px] overflow-y-auto">
                {tmpl.body_text}
              </div>

              {/* Variables */}
              {tmpl.variables && tmpl.variables.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {tmpl.variables.map((v, i) => (
                    <span key={i} className="px-2 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 font-medium border border-blue-100">
                      {`{{${v}}}`}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Actions Bar */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-[11px] text-slate-400">
                Created: {(tmpl.created_at || "").slice(0, 10)}
              </span>

              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => openEditModal(tmpl)}
                  className="h-7 px-2 text-slate-600 hover:text-slate-900"
                  title="Edit"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDuplicate(tmpl.id)}
                  className="h-7 px-2 text-slate-600 hover:text-slate-900"
                  title="Duplicate"
                >
                  <Copy className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDelete(tmpl.id)}
                  className="h-7 px-2 text-red-500 hover:text-red-700 hover:bg-red-50"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {templates.length === 0 && !loading && (
        <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="font-bold text-slate-900 text-sm">No Templates Found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Create reusable templates for service reminders, PM Surya Ghar subsidy notifications, and follow-ups.
          </p>
          <Button size="sm" onClick={openCreateModal} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-xs">
            + Create Template
          </Button>
        </div>
      )}

      {/* Create / Edit Template Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              {editingTemplate ? "Edit Template" : "Create WhatsApp Template"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Use CRM tags like &#123;&#123;customer_name&#125;&#125;, &#123;&#123;solar_capacity&#125;&#125;, &#123;&#123;city&#125;&#125; to personalize messages.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-2">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Template Name *</label>
              <Input
                placeholder="e.g. Solar Maintenance Checkup"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="text-xs h-9"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Category *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full text-xs h-9 px-2.5 rounded-lg border border-slate-200 bg-white"
              >
                <option value="MARKETING">MARKETING (Subsidy, Promotions, Festive)</option>
                <option value="SERVICE">SERVICE (Routine Inspection, Maintenance)</option>
                <option value="UTILITY">UTILITY (Installation Milestone, Commissioning)</option>
                <option value="REMINDER">REMINDER (Payment Due, Meter Sync)</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700">Message Body *</label>
              </div>
              <textarea
                rows={5}
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                placeholder="Hello {{customer_name}}, your {{solar_capacity}} solar system in {{city}} is due for maintenance..."
                className="w-full text-xs font-mono p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-hidden resize-none leading-relaxed"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                Insert Variables:
              </label>
              <div className="flex flex-wrap gap-1">
                {[
                  "{{customer_name}}",
                  "{{mobile}}",
                  "{{city}}",
                  "{{solar_capacity}}",
                  "{{installation_date}}",
                  "{{company_name}}",
                ].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => insertVariable(tag)}
                    className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" size="sm" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveTemplate} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold">
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
