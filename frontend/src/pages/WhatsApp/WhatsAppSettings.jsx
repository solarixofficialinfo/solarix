import React, { useState, useEffect } from "react";
import api from "@/lib/api";
import {
  Settings,
  ShieldCheck,
  Key,
  Globe,
  Smartphone,
  Copy,
  Check,
  RefreshCw,
  QrCode,
  Save,
  Server,
  AlertTriangle,
  ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function WhatsAppSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Settings State
  const [providerType, setProviderType] = useState("native");
  const [name, setName] = useState("Live WhatsApp Multi-Device Gateway");
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [instanceName, setInstanceName] = useState("solarix_primary");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [rateLimitPerMin, setRateLimitPerMin] = useState(60);
  const [delayMs, setDelayMs] = useState(150);
  const [enforceOptIn, setEnforceOptIn] = useState(true);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await api.get("/whatsapp/providers/settings");
      const d = res.data;
      setProviderType(d.provider_type || "native");
      setName(d.name || "Live WhatsApp Multi-Device Gateway");
      setApiUrl(d.api_url || "");
      setApiKey(d.api_key_masked || "");
      setInstanceName(d.instance_name || "solarix_primary");
      setPhoneNumber(d.phone_number || "");
      setPhoneNumberId(d.phone_number_id || "");
      setAccessToken(d.access_token_masked || "");
      setWabaId(d.waba_id || "");
      setWebhookUrl(d.webhook_url || "");
      if (d.settings) {
        setRateLimitPerMin(d.settings.rate_limit_per_min || 60);
        setDelayMs(d.settings.delay_between_messages_ms || 150);
        setEnforceOptIn(d.settings.enforce_opt_in !== false);
      }
    } catch (e) {
      console.error("Failed to load settings", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      await api.post("/whatsapp/providers/settings", {
        provider_type: providerType,
        name,
        api_url: apiUrl,
        api_key: apiKey,
        instance_name: instanceName,
        phone_number: phoneNumber,
        phone_number_id: phoneNumberId,
        access_token: accessToken,
        waba_id: wabaId,
        rate_limit_per_min: Number(rateLimitPerMin) || 60,
        delay_between_messages_ms: Number(delayMs) || 150,
        enforce_opt_in: enforceOptIn,
      });
      toast.success("WhatsApp Provider configuration saved securely!");
      fetchSettings();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast.success("Webhook URL copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Title */}
      <div>
        <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
          WhatsApp Gateway & Provider Settings
        </h2>
        <p className="text-xs text-slate-500">
          Configure server-side credentials for Evolution Go, Meta WhatsApp Cloud API, and webhook security.
        </p>
      </div>

      {/* Provider Selector Cards */}
      <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-4">
        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
          Select Active WhatsApp Provider
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              id: "native",
              title: "WhatsApp Multi-Device Gateway",
              badge: "Official Linked Device",
              desc: "Direct WhatsApp Multi-Device connection with live QR code pairing via WhatsApp > Linked Devices.",
            },
            {
              id: "whatsapp_cloud",
              title: "WhatsApp Cloud API",
              badge: "Official Meta",
              desc: "Official Meta WhatsApp Business Graph API for enterprise accounts with approved templates.",
            },
            {
              id: "evolution_go",
              title: "Evolution Go",
              badge: "External Gateway",
              desc: "External Evolution API instance with remote webhook dispatch.",
            },
          ].map((p) => {
            const active = providerType === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setProviderType(p.id)}
                className={`p-4 text-left rounded-xl border transition-all ${
                  active
                    ? "border-blue-600 bg-blue-50/70 shadow-xs"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-slate-900 text-xs">{p.title}</span>
                  <Badge variant="outline" className={`text-[10px] ${active ? "bg-blue-600 text-white border-transparent" : "bg-slate-50 text-slate-600"}`}>
                    {p.badge}
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">{p.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Native Multi-Device Gateway Config */}
      {providerType === "native" && (
        <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Smartphone className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">Live WhatsApp Multi-Device Settings</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Instance Identifier</label>
              <Input
                placeholder="solarix_primary"
                value={instanceName}
                onChange={(e) => setInstanceName(e.target.value)}
                className="text-xs h-9"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Connected Phone Number</label>
              <Input
                readOnly
                placeholder="Not connected — Click Connect / QR in top banner"
                value={phoneNumber || ""}
                className="text-xs h-9 bg-slate-50 text-slate-700"
              />
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            Powered by Baileys Multi-Device Engine. Connects directly to web.whatsapp.com with multi-device encryption.
          </p>
        </div>
      )}

      {/* Evolution Go Specific Config */}
      {providerType === "evolution_go" && (
        <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Server className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">Evolution Go Connection Settings</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Evolution API URL *</label>
              <Input
                placeholder="https://api.evolution.example.com"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                className="text-xs h-9"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">API Key (Server-side Encrypted) *</label>
              <Input
                type="password"
                placeholder="Enter Evolution API token"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="text-xs h-9"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Instance Name *</label>
              <Input
                placeholder="solarix_primary"
                value={instanceName}
                onChange={(e) => setInstanceName(e.target.value)}
                className="text-xs h-9"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Connected WhatsApp Number</label>
              <Input
                placeholder="+91..."
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="text-xs h-9"
              />
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Cloud API Config */}
      {providerType === "whatsapp_cloud" && (
        <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Globe className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">Meta WhatsApp Cloud API Credentials</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Phone Number ID *</label>
              <Input
                placeholder="e.g. 104829104829104"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                className="text-xs h-9"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Permanent System User Access Token *</label>
              <Input
                type="password"
                placeholder="EAAG... token"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                className="text-xs h-9"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">WhatsApp Business Account (WABA) ID</label>
              <Input
                placeholder="e.g. 293840192840192"
                value={wabaId}
                onChange={(e) => setWabaId(e.target.value)}
                className="text-xs h-9"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Display Phone Number</label>
              <Input
                placeholder="+91 98765 43210"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="text-xs h-9"
              />
            </div>
          </div>
        </div>
      )}

      {/* Webhook Configuration */}
      <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">Delivery Status & Inbound Webhook URL</h3>
          </div>
          <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
            Active Listener
          </Badge>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          Configure this URL in your Evolution API instance or Meta App Webhook dashboard to receive delivery reports, read receipts, and inbound customer replies.
        </p>

        <div className="flex items-center gap-2">
          <Input
            value={webhookUrl}
            readOnly
            className="text-xs font-mono bg-slate-50 border-slate-200 text-slate-700 flex-1"
          />
          <Button size="sm" variant="outline" onClick={copyWebhook} className="text-xs h-9 gap-1.5 shrink-0">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied" : "Copy URL"}
          </Button>
        </div>
      </div>

      {/* Rate Limiting & Safety Pacing */}
      <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <h3 className="text-sm font-bold text-slate-900">Campaign Pacing & WhatsApp Safety Guards</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Rate Limit (Messages per minute)
            </label>
            <Input
              type="number"
              value={rateLimitPerMin}
              onChange={(e) => setRateLimitPerMin(e.target.value)}
              className="text-xs h-9"
            />
            <p className="text-[10px] text-slate-400 mt-1">Recommended: 60-120 msg/min to prevent carrier spam detection.</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Delay Between Messages (Milliseconds)
            </label>
            <Input
              type="number"
              value={delayMs}
              onChange={(e) => setDelayMs(e.target.value)}
              className="text-xs h-9"
            />
            <p className="text-[10px] text-slate-400 mt-1">Simulates human dispatch pacing (150ms recommended).</p>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-900">Enforce WhatsApp Opt-in Policy</div>
            <div className="text-[11px] text-slate-500">Only dispatch campaign broadcasts to contacts marked as Opted In.</div>
          </div>
          <input
            type="checkbox"
            checked={enforceOptIn}
            onChange={(e) => setEnforceOptIn(e.target.checked)}
            className="rounded text-blue-600 h-4 w-4"
          />
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9 px-5 gap-1.5 font-bold shadow-sm"
        >
          <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}
