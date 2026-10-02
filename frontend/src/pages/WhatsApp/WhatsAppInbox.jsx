import React, { useState, useEffect, useRef } from "react";
import api from "@/lib/api";
import { Link } from "react-router-dom";
import {
  Search,
  Send,
  Paperclip,
  Check,
  CheckCheck,
  Smartphone,
  Users,
  FileText,
  User,
  Calendar,
  Building,
  Zap,
  ExternalLink,
  RefreshCw,
  Image as ImageIcon,
  Smile,
  ShieldCheck,
  ChevronRight,
  Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function WhatsAppInbox() {
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [crmProfile, setCrmProfile] = useState(null);
  const [loadingConv, setLoadingConv] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [search, setSearch] = useState("");
  const [templates, setTemplates] = useState([]);
  const [mediaUrlInput, setMediaUrlInput] = useState("");
  const [showMediaInput, setShowMediaInput] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef(null);

  const fetchConversations = async () => {
    try {
      setLoadingConv(true);
      const res = await api.get(`/whatsapp/inbox/conversations?search=${encodeURIComponent(search)}`);
      const list = res.data?.conversations || [];
      setConversations(list);
      if (list.length > 0 && !activeConvId) {
        setActiveConvId(list[0].id);
      }
    } catch (e) {
      console.error("Failed to load conversations", e);
    } finally {
      setLoadingConv(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const res = await api.get("/whatsapp/templates");
      setTemplates(res.data?.templates || []);
    } catch (e) {
      console.error("Templates load error", e);
    }
  };

  const fetchActiveThread = async (convId) => {
    if (!convId) return;
    try {
      setLoadingMessages(true);
      const [msgRes, crmRes] = await Promise.all([
        api.get(`/whatsapp/inbox/conversations/${convId}/messages`),
        api.get(`/whatsapp/inbox/conversations/${convId}/customer-crm`),
      ]);
      setMessages(msgRes.data?.messages || []);
      setCrmProfile(crmRes.data || null);
    } catch (e) {
      console.error("Error loading chat thread", e);
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    fetchConversations();
    fetchTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeConvId) {
      fetchActiveThread(activeConvId);
    }
  }, [activeConvId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const activeConv = conversations.find((c) => c.id === activeConvId);

  const handleSendReply = async () => {
    if (!replyText.trim() && !mediaUrlInput.trim()) return;
    try {
      setSending(true);
      const payload = {
        text: replyText.trim(),
        media_url: mediaUrlInput.trim() || null,
        media_type: mediaUrlInput.trim() ? "image" : "text",
      };
      const res = await api.post(`/whatsapp/inbox/conversations/${activeConvId}/messages`, payload);
      setMessages((prev) => [...prev, res.data?.message]);
      setReplyText("");
      setMediaUrlInput("");
      setShowMediaInput(false);
      // Refresh conversation list to update last message
      fetchConversations();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const handleSelectTemplate = async (tmpl) => {
    setReplyText(tmpl.body_text);
    setShowTemplatePicker(false);
    toast.success(`Template "${tmpl.name}" loaded into message composer`);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden h-[740px] flex">
      {/* 1. LEFT PANE: CONVERSATION LIST */}
      <div className="w-80 sm:w-88 border-r border-slate-200 flex flex-col bg-slate-50/50 shrink-0">
        {/* Search header */}
        <div className="p-3.5 border-b border-slate-200 bg-white">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
            <Input
              placeholder="Search chats, phone, or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchConversations()}
              className="pl-8 text-xs h-9 bg-slate-50 border-slate-200"
            />
          </div>
        </div>

        {/* Conversation list items */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {conversations.map((conv) => {
            const active = conv.id === activeConvId;
            const timeStr = conv.last_message_time ? conv.last_message_time.slice(11, 16) : "";

            return (
              <div
                key={conv.id}
                onClick={() => setActiveConvId(conv.id)}
                className={`p-3.5 flex items-start gap-3 cursor-pointer transition-all ${
                  active ? "bg-blue-50/80 border-l-4 border-l-blue-600" : "hover:bg-slate-100/60"
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                  {conv.customer_name?.[0] || "C"}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <h4 className="text-xs font-bold text-slate-900 truncate">
                      {conv.customer_name}
                    </h4>
                    <span className="text-[10px] text-slate-400 shrink-0">{timeStr}</span>
                  </div>

                  <div className="text-[11px] text-slate-500 font-mono mt-0.5 truncate">
                    {conv.phone_number}
                  </div>

                  <div className="flex items-center justify-between gap-2 mt-1">
                    <p className="text-[11px] text-slate-600 truncate leading-tight flex-1">
                      {conv.last_message_text}
                    </p>
                    {conv.unread_count > 0 && (
                      <span className="w-4 h-4 rounded-full bg-emerald-600 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {conversations.length === 0 && !loadingConv && (
            <div className="p-8 text-center text-slate-400 text-xs italic">
              No conversations yet. When customers reply to campaigns, chats appear here.
            </div>
          )}
        </div>
      </div>

      {/* 2. MIDDLE PANE: ACTIVE CHAT THREAD */}
      <div className="flex-1 flex flex-col bg-[#efeae2]/30 min-w-0 border-r border-slate-200">
        {activeConv ? (
          <>
            {/* Chat Header */}
            <div className="p-3.5 bg-white border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-xs">
                  {activeConv.customer_name?.[0] || "C"}
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 leading-tight">
                    {activeConv.customer_name}
                  </h3>
                  <div className="text-[10px] text-slate-500 flex items-center gap-1.5 font-medium">
                    <span>{activeConv.phone_number}</span>
                    <span>•</span>
                    <span className="text-emerald-600 font-semibold">Active WhatsApp Thread</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowTemplatePicker(!showTemplatePicker)}
                  className="text-xs h-8 text-blue-600 border-blue-200 hover:bg-blue-50"
                >
                  <FileText className="w-3.5 h-3.5 mr-1" /> Quick Templates
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => fetchActiveThread(activeConvId)}
                  className="text-xs h-8 text-slate-500 hover:text-slate-900"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* Quick Templates Drawer / Popup */}
            {showTemplatePicker && (
              <div className="p-3 bg-blue-50/90 border-b border-blue-200 max-h-48 overflow-y-auto space-y-1.5">
                <div className="text-[11px] font-bold text-blue-900 uppercase tracking-wider mb-1">
                  Choose a template to reply:
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleSelectTemplate(t)}
                      className="p-2 text-left bg-white border border-blue-200 rounded-lg text-xs hover:bg-blue-50 transition"
                    >
                      <div className="font-semibold text-slate-900 truncate">{t.name}</div>
                      <div className="text-[10px] text-slate-500 line-clamp-1">{t.body_text}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages Scroll Area */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#efeae2]/40">
              <div className="text-center my-1">
                <span className="bg-white/80 backdrop-blur-xs text-slate-500 text-[10px] px-3 py-1 rounded-full border border-slate-200 shadow-2xs">
                  🔒 WhatsApp End-to-End Encrypted via Solarix Gateway
                </span>
              </div>

              {messages.map((msg) => {
                const isOut = msg.direction === "outbound";
                const timeStr = msg.created_at ? msg.created_at.slice(11, 16) : "";

                return (
                  <div key={msg.id} className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[75%] rounded-2xl p-3 shadow-xs space-y-1.5 text-xs leading-relaxed ${
                        isOut
                          ? "bg-[#dcf8c6] text-slate-900 rounded-tr-xs border border-emerald-200/50"
                          : "bg-white text-slate-900 rounded-tl-xs border border-slate-200"
                      }`}
                    >
                      {msg.media_url && (
                        <div className="rounded-lg bg-black/5 p-2 text-center text-[11px] text-slate-700 font-medium">
                          📎 Attached {msg.message_type || "Media"}
                        </div>
                      )}
                      <p className="whitespace-pre-line text-[12px]">{msg.text_body}</p>
                      <div className="flex items-center justify-end gap-1 text-[9px] text-slate-500 pt-0.5">
                        <span>{timeStr}</span>
                        {isOut && (
                          msg.status === "read" ? (
                            <CheckCheck className="w-3.5 h-3.5 text-blue-500" />
                          ) : msg.status === "delivered" ? (
                            <CheckCheck className="w-3.5 h-3.5 text-slate-400" />
                          ) : (
                            <Check className="w-3.5 h-3.5 text-slate-400" />
                          )
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Optional Media URL Bar */}
            {showMediaInput && (
              <div className="p-2.5 bg-slate-100 border-t border-slate-200 flex items-center gap-2">
                <Input
                  placeholder="Paste image/PDF URL to attach..."
                  value={mediaUrlInput}
                  onChange={(e) => setMediaUrlInput(e.target.value)}
                  className="text-xs h-8 bg-white flex-1"
                />
                <Button size="sm" variant="ghost" onClick={() => setShowMediaInput(false)} className="text-xs h-8">
                  Cancel
                </Button>
              </div>
            )}

            {/* Bottom Input Bar */}
            <div className="p-3 bg-white border-t border-slate-200 flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowMediaInput(!showMediaInput)}
                className="text-slate-500 hover:text-slate-800 p-2 h-9 w-9"
                title="Attach Document or Image"
              >
                <Paperclip className="w-4 h-4" />
              </Button>

              <Input
                placeholder="Type your WhatsApp reply..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendReply()}
                className="text-xs h-10 bg-slate-50 border-slate-200 rounded-full px-4 flex-1 focus:bg-white"
              />

              <Button
                size="sm"
                onClick={handleSendReply}
                disabled={sending || (!replyText.trim() && !mediaUrlInput.trim())}
                className="bg-[#00a884] hover:bg-[#008f6f] text-white rounded-full h-10 w-10 p-0 flex items-center justify-center shrink-0 shadow-sm"
              >
                <Send className="w-4 h-4 ml-0.5" />
              </Button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
            <Smartphone className="w-12 h-12 text-slate-300 mb-3" />
            <h3 className="font-bold text-slate-800 text-sm">No Conversation Selected</h3>
            <p className="text-xs text-slate-500 mt-1">Select a customer from the left list to start chatting.</p>
          </div>
        )}
      </div>

      {/* 3. RIGHT PANE: SOLARIX CRM CUSTOMER INSPECTOR */}
      <div className="w-72 lg:w-80 p-5 bg-slate-50 border-l border-slate-200 flex flex-col justify-between overflow-y-auto shrink-0 hidden md:flex">
        {crmProfile ? (
          <div className="space-y-4">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" /> Solarix CRM Context
            </div>

            {/* Profile Avatar & Name */}
            <div className="p-4 bg-white border border-slate-200 rounded-xl text-center shadow-xs">
              <div className="w-14 h-14 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-lg font-bold mx-auto mb-2">
                {crmProfile.full_name?.[0] || "C"}
              </div>
              <h4 className="font-bold text-slate-900 text-sm">{crmProfile.full_name}</h4>
              <div className="text-xs text-slate-500 font-mono">{crmProfile.mobile}</div>
              <Badge variant="outline" className="mt-2 text-[10px] bg-slate-50">
                {crmProfile.sol_id}
              </Badge>
            </div>

            {/* Solar Installation Data */}
            <div className="space-y-2 text-xs">
              <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
                <div className="flex justify-between items-center text-slate-600">
                  <span>Solar Capacity:</span>
                  <span className="font-bold text-slate-900">{crmProfile.solar_capacity}</span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>Installation Date:</span>
                  <span className="font-medium text-slate-800">{crmProfile.installation_date}</span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>City / Location:</span>
                  <span className="font-medium text-slate-800">{crmProfile.city}</span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>Service Status:</span>
                  <Badge className="bg-emerald-100 text-emerald-700 text-[10px] border-emerald-200">
                    {crmProfile.service_status}
                  </Badge>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>Assigned Staff:</span>
                  <span className="font-medium text-slate-800 text-[11px] truncate max-w-[130px]">
                    {crmProfile.assigned_staff}
                  </span>
                </div>
              </div>
            </div>

            {/* Direct Link to Solarix Client Profile */}
            {crmProfile.customer_id && (
              <Link to={`/client-data/${crmProfile.customer_id}`} target="_blank">
                <Button size="sm" variant="outline" className="w-full text-xs gap-1.5 bg-white text-blue-600 border-blue-200 hover:bg-blue-50 font-semibold">
                  Open CRM Client Profile <ExternalLink className="w-3 h-3" />
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="p-6 text-center text-slate-400 text-xs italic">
            Select a conversation to inspect linked CRM solar project details.
          </div>
        )}

        <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 text-[11px] text-blue-900 leading-relaxed">
          ⚡ Solarix syncs every WhatsApp conversation with customer tickets, tasks, and quotation history.
        </div>
      </div>
    </div>
  );
}
