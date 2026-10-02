import React, { useState, useEffect, useMemo } from "react";
import api from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Send,
  Users,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Sparkles,
  Search,
  Filter,
  Paperclip,
  Image as ImageIcon,
  Clock,
  ArrowRight,
  ArrowLeft,
  Upload,
  CheckCheck,
  Smartphone,
  Eye
} from "lucide-react";
import { toast } from "sonner";

export default function CampaignWizardModal({ open, onOpenChange, onSuccess }) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Step 1: Campaign Details
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [campaignType, setCampaignType] = useState("Promotional");

  // Step 2: Audience Selection
  const [contacts, setContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [selectedContactIds, setSelectedContactIds] = useState(new Set());
  const [cityFilter, setCityFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [minKw, setMinKw] = useState("");
  const [maxKw, setMaxKw] = useState("");
  const [customerTypeFilter, setCustomerTypeFilter] = useState("all");
  const [availableCities, setAvailableCities] = useState([]);

  // Step 3: Message Composer
  const [messageText, setMessageText] = useState(
    "Hello {{customer_name}},\n\nYour {{solar_capacity}} solar system installed by {{company_name}} in {{city}} is due for its periodic maintenance inspection.\n\nRegular checkups ensure peak generation and subsidy compliance. For assistance, please reply to our team."
  );
  const [mediaType, setMediaType] = useState("none");
  const [mediaUrl, setMediaUrl] = useState("");
  const [templates, setTemplates] = useState([]);
  const [previewCustomerIndex, setPreviewCustomerIndex] = useState(0);

  // Step 4: Preview & Scheduling
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("10:00");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [testMobile, setTestMobile] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectedPhone, setConnectedPhone] = useState("");

  const fetchConnectionStatus = async () => {
    try {
      const res = await api.get("/whatsapp/instance/status");
      setIsConnected(Boolean(res.data?.connected));
      setConnectedPhone(res.data?.phone_number || "");
    } catch (e) {
      console.error("Connection check failed", e);
    }
  };

  // Load audience, templates & connection status
  useEffect(() => {
    if (open) {
      fetchAudience();
      fetchTemplates();
      fetchConnectionStatus();
    }
  }, [open]);

  const fetchAudience = async () => {
    try {
      setLoadingContacts(true);
      const res = await api.get("/whatsapp/audience/contacts");
      const list = res.data?.contacts || [];
      setContacts(list);
      setAvailableCities(res.data?.available_cities || []);
      // Default: select all eligible contacts
      setSelectedContactIds(new Set(list.map((c) => c.id)));
    } catch (e) {
      console.error("Audience load failed", e);
    } finally {
      setLoadingContacts(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const res = await api.get("/whatsapp/templates");
      setTemplates(res.data?.templates || []);
    } catch (e) {
      console.error("Templates load failed", e);
    }
  };

  // Filtered contacts in Step 2
  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      if (cityFilter !== "all" && c.city !== cityFilter) return false;
      if (customerTypeFilter !== "all" && c.customer_type !== customerTypeFilter) return false;
      if (minKw && Number(c.solar_kw) < Number(minKw)) return false;
      if (maxKw && Number(c.solar_kw) > Number(maxKw)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchName = (c.name || "").toLowerCase().includes(q);
        const matchPhone = (c.phone_number || "").includes(q);
        if (!matchName && !matchPhone) return false;
      }
      return true;
    });
  }, [contacts, cityFilter, customerTypeFilter, minKw, maxKw, searchQuery]);

  const handleSelectAll = () => {
    setSelectedContactIds(new Set(filteredContacts.map((c) => c.id)));
  };

  const handleDeselectAll = () => {
    setSelectedContactIds(new Set());
  };

  const toggleContact = (id) => {
    const next = new Set(selectedContactIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedContactIds(next);
  };

  const insertVariable = (tag) => {
    setMessageText((prev) => prev + " " + tag);
  };

  const applyTemplate = (tmpl) => {
    setMessageText(tmpl.body_text);
    if (tmpl.media_url) {
      setMediaUrl(tmpl.media_url);
      setMediaType(tmpl.media_type || "image");
    }
    toast.success(`Template "${tmpl.name}" applied`);
  };

  // Dynamic preview interpolation using real CRM customer
  const previewCustomer = useMemo(() => {
    return contacts[previewCustomerIndex] || {
      name: "Rajesh Sharma",
      phone_number: "+91 98220 54321",
      city: "Pune",
      solar_kw: "6.0",
      installation_date: "14 Jan 2026",
    };
  }, [contacts, previewCustomerIndex]);

  const interpolatedPreview = useMemo(() => {
    let text = messageText;
    text = text.replace(/{{customer_name}}/g, previewCustomer.name || "Customer");
    text = text.replace(/{{name}}/g, previewCustomer.name || "Customer");
    text = text.replace(/{{mobile}}/g, previewCustomer.phone_number || "");
    text = text.replace(/{{city}}/g, previewCustomer.city || "Pune");
    text = text.replace(/{{solar_capacity}}/g, `${previewCustomer.solar_kw || 5} kW`);
    text = text.replace(/{{installation_date}}/g, previewCustomer.installation_date || "Recent");
    text = text.replace(/{{company_name}}/g, "GVP Solar Energy");
    return text;
  }, [messageText, previewCustomer]);

  const handleSendTest = async () => {
    if (!testMobile.trim()) {
      toast.error("Please enter a test mobile number");
      return;
    }
    try {
      setSendingTest(true);
      const res = await api.post("/whatsapp/campaigns/send-test", {
        phone_number: testMobile,
        message_text: messageText,
        media_url: mediaUrl || null,
        media_type: mediaType,
      });
      if (res.data?.success) {
        toast.success(`Test message sent successfully to ${testMobile}!`);
      } else {
        toast.error("Test send failed: " + (res.data?.error || "Unknown error"));
      }
    } catch (e) {
      toast.error("Test message failed: " + (e.response?.data?.detail || e.message));
    } finally {
      setSendingTest(false);
    }
  };

  const handleFinalSubmit = async (status = "Draft") => {
    if (!name.trim()) {
      toast.error("Please enter a campaign name");
      setStep(1);
      return;
    }
    if (selectedContactIds.size === 0) {
      toast.error("Please select at least one contact in audience");
      setStep(2);
      return;
    }
    if (!messageText.trim()) {
      toast.error("Please enter a message body");
      setStep(3);
      return;
    }

    if (status === "Sending" && !isConnected) {
      toast.error("Cannot start campaign: WhatsApp is not connected. Please scan QR Code or link phone in the top banner first, or save as Draft.");
      setConfirmModalOpen(false);
      return;
    }

    try {
      setSubmitting(true);
      let scheduledAtIso = null;
      if (status === "Scheduled" && scheduledDate) {
        scheduledAtIso = new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString();
      }

      const payload = {
        name,
        description,
        campaign_type: campaignType,
        message_text: messageText,
        media_url: mediaUrl || null,
        media_type: mediaType,
        scheduled_at: scheduledAtIso,
        timezone,
        contact_ids: Array.from(selectedContactIds),
      };

      const res = await api.post("/whatsapp/campaigns", payload);
      const campId = res.data?.campaign_id;

      if (status === "Sending" && campId) {
        await api.post(`/whatsapp/campaigns/${campId}/start`);
        toast.success(`Campaign "${name}" queued and started sending to ${selectedContactIds.size} contacts!`);
      } else if (status === "Scheduled") {
        toast.success(`Campaign "${name}" scheduled for ${scheduledDate} ${scheduledTime}`);
      } else {
        toast.success(`Campaign "${name}" saved as Draft`);
      }

      setConfirmModalOpen(false);
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to create campaign");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-0 rounded-2xl">
          {/* Header */}
          <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-400/30 flex items-center justify-center font-bold">
                  {step}/4
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold text-white" style={{ fontFamily: "Outfit" }}>
                    Create WhatsApp Campaign
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-300">
                    Step {step}: {step === 1 && "Campaign Details"}
                    {step === 2 && "Select Audience from CRM"}
                    {step === 3 && "Message Composer & Real CRM Preview"}
                    {step === 4 && "Campaign Preview & Verification"}
                  </DialogDescription>
                </div>
              </div>

              {/* Step indicator pills */}
              <div className="hidden sm:flex items-center gap-2 text-xs">
                {[1, 2, 3, 4].map((s) => (
                  <div
                    key={s}
                    className={`px-3 py-1 rounded-full font-medium transition ${
                      step === s
                        ? "bg-emerald-500 text-white shadow-xs font-semibold"
                        : step > s
                        ? "bg-white/20 text-emerald-300"
                        : "bg-white/10 text-slate-400"
                    }`}
                  >
                    Step {s}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Body Content by Step */}
          <div className="p-6">
            {/* STEP 1: CAMPAIGN DETAILS */}
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1.5">Campaign Name *</label>
                  <Input
                    placeholder="e.g. Diwali Rooftop Subsidy Blast 2026"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="text-sm h-10"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1.5">Campaign Description</label>
                  <Input
                    placeholder="Brief objective or note for your marketing team"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="text-sm h-10"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-2">Campaign Type *</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {[
                      { type: "Promotional", desc: "Special offers & seasonal solar discounts" },
                      { type: "Customer Update", desc: "DISCOM policy, net meter, & subsidy news" },
                      { type: "Service Reminder", desc: "Routine cleaning & preventive maintenance" },
                      { type: "Payment Reminder", desc: "Structure / meter milestone dues" },
                      { type: "Solar Maintenance", desc: "Inverter diagnostics & panel care" },
                      { type: "Festival / Greeting", desc: "Diwali, New Year, Gudi Padwa solar wishes" },
                      { type: "Custom", desc: "General targeted broadcast" },
                    ].map((item) => (
                      <button
                        key={item.type}
                        type="button"
                        onClick={() => setCampaignType(item.type)}
                        className={`p-3 text-left rounded-xl border transition-all ${
                          campaignType === item.type
                            ? "border-blue-600 bg-blue-50/70 shadow-xs"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <div className="text-xs font-bold text-slate-900">{item.type}</div>
                        <div className="text-[10px] text-slate-500 mt-1 line-clamp-1">{item.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: SELECT AUDIENCE */}
            {step === 2 && (
              <div className="space-y-4">
                {/* Filters Row */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[200px]">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                        <Input
                          placeholder="Search customer name or mobile..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-8 text-xs h-9 bg-white"
                        />
                      </div>
                    </div>

                    <div className="w-36">
                      <select
                        value={cityFilter}
                        onChange={(e) => setCityFilter(e.target.value)}
                        className="w-full text-xs h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-slate-700"
                      >
                        <option value="all">All Cities</option>
                        {availableCities.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    <div className="w-32">
                      <select
                        value={customerTypeFilter}
                        onChange={(e) => setCustomerTypeFilter(e.target.value)}
                        className="w-full text-xs h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-slate-700"
                      >
                        <option value="all">All Types</option>
                        <option value="Residential">Residential</option>
                        <option value="Commercial">Commercial</option>
                        <option value="Industrial">Industrial</option>
                        <option value="Prospective">Prospective Lead</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-1 text-xs text-slate-600">
                      <span>kW:</span>
                      <Input
                        placeholder="Min"
                        value={minKw}
                        onChange={(e) => setMinKw(e.target.value)}
                        className="w-14 text-xs h-9 bg-white"
                        type="number"
                      />
                      <span>-</span>
                      <Input
                        placeholder="Max"
                        value={maxKw}
                        onChange={(e) => setMaxKw(e.target.value)}
                        className="w-14 text-xs h-9 bg-white"
                        type="number"
                      />
                    </div>
                  </div>

                  {/* Actions & Count */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs">
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={handleSelectAll} className="h-7 text-xs px-2.5">
                        Select All
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleDeselectAll} className="h-7 text-xs px-2.5">
                        Deselect All
                      </Button>
                      <span className="text-slate-500">
                        Showing {filteredContacts.length} contacts
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge className="bg-emerald-600 text-white font-bold text-xs px-3 py-1">
                        Selected Contacts: {selectedContactIds.size}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Contacts List Table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[300px] overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="p-3 w-10">
                          <input
                            type="checkbox"
                            checked={filteredContacts.length > 0 && filteredContacts.every((c) => selectedContactIds.has(c.id))}
                            onChange={(e) => (e.target.checked ? handleSelectAll() : handleDeselectAll())}
                            className="rounded text-blue-600 focus:ring-blue-500"
                          />
                        </th>
                        <th className="p-3">Customer Name</th>
                        <th className="p-3">Mobile</th>
                        <th className="p-3">City</th>
                        <th className="p-3">Solar kW</th>
                        <th className="p-3">Type</th>
                        <th className="p-3">Opt-in Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredContacts.map((c) => {
                        const selected = selectedContactIds.has(c.id);
                        return (
                          <tr
                            key={c.id}
                            onClick={() => toggleContact(c.id)}
                            className={`cursor-pointer transition-colors ${selected ? "bg-blue-50/50" : "hover:bg-slate-50"}`}
                          >
                            <td className="p-3">
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => {}}
                                className="rounded text-blue-600 focus:ring-blue-500"
                              />
                            </td>
                            <td className="p-3 font-semibold text-slate-900">{c.name}</td>
                            <td className="p-3 text-slate-600">{c.phone_number}</td>
                            <td className="p-3 text-slate-600">{c.city}</td>
                            <td className="p-3 font-medium text-slate-700">{c.solar_kw} kW</td>
                            <td className="p-3">
                              <Badge variant="outline" className="text-[10px]">
                                {c.customer_type}
                              </Badge>
                            </td>
                            <td className="p-3">
                              <Badge className="bg-emerald-100 text-emerald-700 text-[10px] border-emerald-200">
                                Opted In
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredContacts.length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                            No CRM contacts match your current filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* STEP 3: MESSAGE COMPOSER & CRM PREVIEW */}
            {step === 3 && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left: Composer */}
                <div className="lg:col-span-7 space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-700">Message Body *</label>
                      {templates.length > 0 && (
                        <div className="flex items-center gap-1 text-xs">
                          <span className="text-slate-500">Insert Template:</span>
                          <select
                            onChange={(e) => {
                              const tmpl = templates.find((t) => t.id === e.target.value);
                              if (tmpl) applyTemplate(tmpl);
                            }}
                            className="text-xs h-7 px-2 border rounded-md bg-white text-slate-700"
                            defaultValue=""
                          >
                            <option value="" disabled>Choose Template...</option>
                            {templates.map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    <textarea
                      rows={7}
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      placeholder="Type your WhatsApp message. Use variables like {{customer_name}}, {{city}}, {{solar_capacity}}..."
                      className="w-full text-xs font-mono p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-hidden leading-relaxed resize-none"
                    />
                  </div>

                  {/* CRM Variable Pills */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                      Click to insert CRM variables:
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { tag: "{{customer_name}}", label: "Customer Name" },
                        { tag: "{{mobile}}", label: "Mobile Number" },
                        { tag: "{{city}}", label: "City" },
                        { tag: "{{solar_capacity}}", label: "Solar Capacity" },
                        { tag: "{{installation_date}}", label: "Installation Date" },
                        { tag: "{{company_name}}", label: "Company Name" },
                      ].map((item) => (
                        <button
                          key={item.tag}
                          type="button"
                          onClick={() => insertVariable(item.tag)}
                          className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition"
                        >
                          + {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Attachment Media */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                      <Paperclip className="w-3.5 h-3.5 text-slate-500" /> Media Attachment (Optional)
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={mediaType}
                        onChange={(e) => setMediaType(e.target.value)}
                        className="text-xs h-9 px-2 rounded-lg border border-slate-200 bg-white"
                      >
                        <option value="none">No Attachment</option>
                        <option value="image">Image (JPEG/PNG)</option>
                        <option value="document">PDF / Document</option>
                        <option value="video">Video</option>
                      </select>
                      {mediaType !== "none" && (
                        <Input
                          placeholder="Paste public media URL (e.g. https://.../solar-brochure.pdf)"
                          value={mediaUrl}
                          onChange={(e) => setMediaUrl(e.target.value)}
                          className="text-xs h-9 flex-1 bg-white"
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Live WhatsApp Phone Simulator Preview */}
                <div className="lg:col-span-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-emerald-600" /> Live WhatsApp Preview
                    </span>
                    {contacts.length > 1 && (
                      <select
                        value={previewCustomerIndex}
                        onChange={(e) => setPreviewCustomerIndex(Number(e.target.value))}
                        className="text-[11px] h-6 px-1.5 border rounded bg-white text-slate-600"
                      >
                        {contacts.slice(0, 5).map((c, idx) => (
                          <option key={c.id} value={idx}>Preview: {c.name}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Phone Device Shell */}
                  <div className="border-[3px] border-slate-800 rounded-3xl overflow-hidden shadow-md bg-[#efeae2] relative min-h-[380px] flex flex-col justify-between">
                    {/* WhatsApp Top Header */}
                    <div className="bg-[#075e54] text-white p-3 flex items-center gap-2.5 shadow-sm">
                      <div className="w-8 h-8 rounded-full bg-emerald-700 flex items-center justify-center font-bold text-xs text-white">
                        {previewCustomer.name?.[0] || "C"}
                      </div>
                      <div className="flex-1 truncate">
                        <div className="text-xs font-semibold truncate leading-tight">{previewCustomer.name}</div>
                        <div className="text-[10px] text-emerald-200">Online via WhatsApp</div>
                      </div>
                    </div>

                    {/* Chat Bubble Area */}
                    <div className="p-3.5 space-y-2 flex-1 overflow-y-auto">
                      <div className="text-center my-1">
                        <span className="bg-[#e1f3fb] text-slate-600 text-[10px] px-2.5 py-0.5 rounded-full font-medium shadow-2xs">
                          Today
                        </span>
                      </div>

                      {/* Outgoing Message Bubble */}
                      <div className="flex justify-end">
                        <div className="max-w-[85%] bg-[#dcf8c6] text-slate-900 text-xs p-3 rounded-2xl rounded-tr-xs shadow-xs space-y-1.5 border border-emerald-200/50">
                          {mediaType !== "none" && mediaUrl && (
                            <div className="rounded-lg bg-black/5 p-2 text-center text-[11px] font-medium text-slate-700 border border-slate-200">
                              📎 [{mediaType.toUpperCase()} Attachment]
                            </div>
                          )}
                          <p className="whitespace-pre-line leading-relaxed text-[11.5px] text-slate-800">
                            {interpolatedPreview}
                          </p>
                          <div className="flex items-center justify-end gap-1 text-[9px] text-slate-500 pt-0.5">
                            <span>10:30 AM</span>
                            <CheckCheck className="w-3.5 h-3.5 text-blue-500" />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Fake WhatsApp Input */}
                    <div className="bg-[#f0f2f5] p-2 flex items-center gap-2 border-t border-slate-200 text-slate-400 text-xs">
                      <div className="bg-white rounded-full px-3 py-1.5 flex-1 text-[11px] text-slate-400">
                        Type a message...
                      </div>
                      <div className="w-7 h-7 rounded-full bg-[#00a884] text-white flex items-center justify-center">
                        <Send className="w-3 h-3" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: PREVIEW & VERIFICATION */}
            {step === 4 && (
              <div className="space-y-5">
                {/* WhatsApp Connection State Banner */}
                {!isConnected ? (
                  <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-xl flex items-start gap-3 text-rose-900">
                    <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    <div className="text-xs space-y-1">
                      <div className="font-bold text-rose-900">WhatsApp Device Is Not Connected</div>
                      <p className="text-rose-700 leading-relaxed">
                        Your WhatsApp number is not linked yet. Messages cannot be dispatched until you link your WhatsApp account.
                        Please use the <strong>"Connect / QR Code"</strong> or <strong>"Link Phone Code"</strong> in the top banner, or save this campaign as <strong>Draft</strong> for now.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-900">
                    <span className="flex items-center gap-2 font-bold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" /> WhatsApp Connected & Ready to Broadcast
                    </span>
                    <span className="font-mono text-emerald-950 font-bold bg-emerald-100/60 px-2.5 py-1 rounded">
                      {connectedPhone || "Connected"}
                    </span>
                  </div>
                )}

                {/* Campaign Summary Card */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="text-[10px] uppercase font-bold text-slate-500">Campaign Name</div>
                    <div className="text-xs font-bold text-slate-900 mt-1 truncate">{name}</div>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="text-[10px] uppercase font-bold text-slate-500">Audience Size</div>
                    <div className="text-xs font-bold text-emerald-700 mt-1">{selectedContactIds.size} Contacts</div>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="text-[10px] uppercase font-bold text-slate-500">Estimated Messages</div>
                    <div className="text-xs font-bold text-blue-700 mt-1">{selectedContactIds.size} WhatsApp Messages</div>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="text-[10px] uppercase font-bold text-slate-500">Sender Number</div>
                    <div className={`text-xs font-bold mt-1 truncate ${isConnected ? "text-emerald-700" : "text-amber-600"}`}>
                      {connectedPhone || "Not Connected"}
                    </div>
                  </div>
                </div>

                {/* Send Real Test Message */}
                <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2">
                  <div className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5 text-blue-600" /> Send a Single Real Test to Your Phone
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter test phone number with country code, e.g. +919876543210"
                      value={testMobile}
                      onChange={(e) => setTestMobile(e.target.value)}
                      className="text-xs h-9 bg-white flex-1"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSendTest}
                      disabled={sendingTest}
                      className="h-9 text-xs bg-white text-blue-700 hover:bg-blue-100 border-blue-300 font-semibold"
                    >
                      {sendingTest ? "Sending Test..." : "Send Test"}
                    </Button>
                  </div>
                </div>

                {/* Scheduling Option */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-slate-600" />
                      <span className="text-xs font-bold text-slate-900">Schedule for Later</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={isScheduled}
                      onChange={(e) => setIsScheduled(e.target.checked)}
                      className="rounded text-blue-600 h-4 w-4"
                    />
                  </div>

                  {isScheduled && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                      <div>
                        <label className="text-[11px] text-slate-500 block mb-1">Date</label>
                        <Input
                          type="date"
                          value={scheduledDate}
                          onChange={(e) => setScheduledDate(e.target.value)}
                          className="text-xs h-9 bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-500 block mb-1">Time</label>
                        <Input
                          type="time"
                          value={scheduledTime}
                          onChange={(e) => setScheduledTime(e.target.value)}
                          className="text-xs h-9 bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-500 block mb-1">Timezone</label>
                        <Input
                          value={timezone}
                          disabled
                          className="text-xs h-9 bg-slate-100 text-slate-600"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Wizard Footer Controls */}
          <div className="p-5 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
            {step > 1 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep(step - 1)}
                className="text-xs gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="text-xs">
                Cancel
              </Button>
            )}

            <div className="flex items-center gap-2">
              {step < 4 ? (
                <Button
                  size="sm"
                  onClick={() => {
                    if (step === 1 && !name.trim()) {
                      toast.error("Please enter a campaign name");
                      return;
                    }
                    if (step === 2 && selectedContactIds.size === 0) {
                      toast.error("Please select at least 1 contact");
                      return;
                    }
                    setStep(step + 1);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1.5"
                >
                  Next Step <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleFinalSubmit("Draft")}
                    disabled={submitting}
                    className="text-xs"
                  >
                    Save Draft
                  </Button>

                  {isScheduled ? (
                    <Button
                      size="sm"
                      onClick={() => handleFinalSubmit("Scheduled")}
                      disabled={submitting || !scheduledDate}
                      className="bg-purple-600 hover:bg-purple-700 text-white text-xs gap-1.5 font-bold"
                    >
                      <Calendar className="w-3.5 h-3.5" /> Schedule Campaign
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => setConfirmModalOpen(true)}
                      disabled={submitting}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 font-bold shadow-md shadow-emerald-600/20"
                    >
                      <Send className="w-3.5 h-3.5" /> Start Campaign
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Explicit Confirmation Dialog before Start Campaign */}
      <Dialog open={confirmModalOpen} onOpenChange={setConfirmModalOpen}>
        <DialogContent className="max-w-md p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
            <Send className="w-6 h-6" />
          </div>
          <DialogTitle className="text-base font-bold text-slate-900">
            Confirm WhatsApp Campaign Launch
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-600 mt-2 leading-relaxed">
            You are about to launch <span className="font-semibold text-slate-900">"{name}"</span> to{" "}
            <span className="font-bold text-emerald-700">{selectedContactIds.size} verified customers</span>.
            <br /><br />
            Messages will be queued and sent via the rate-limited background worker. Are you sure you want to proceed?
          </DialogDescription>
          {!isConnected && (
            <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs text-left flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>
                <strong>WhatsApp Disconnected:</strong> You must connect your WhatsApp device via QR code or Pairing Code before starting. You can save as <strong>Draft</strong> instead.
              </span>
            </div>
          )}

          <div className="flex gap-2 justify-center mt-5">
            <Button variant="outline" size="sm" onClick={() => setConfirmModalOpen(false)}>
              Back to Review
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-50"
              onClick={() => handleFinalSubmit("Sending")}
              disabled={submitting || !isConnected}
            >
              {submitting ? "Starting..." : (!isConnected ? "Connect WhatsApp First" : "Yes, Start Campaign")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
