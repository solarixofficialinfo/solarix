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
  ExternalLink,
  Code2,
  Terminal,
  Zap,
  Activity,
  Wifi,
  Power,
  CheckCircle2,
  AlertCircle,
  Clock,
  Send,
  Radio,
  HelpCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

export default function WhatsAppSettings() {
  const [activeTab, setActiveTab] = useState("connection"); // "connection" | "diagnostics" | "config"
  
  // Connection State (Step 5)
  const [connLoading, setConnLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [connectionData, setConnectionData] = useState({
    provider: "Evolution Go",
    status: "disconnected",
    connected: false,
    phone_number: null,
    evolution_url_masked: "********",
    instance_masked: "********",
    instance_name: "solarix_primary",
    error: null,
    uptime_seconds: 0
  });

  // QR Modal State
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrCodeData, setQrCodeData] = useState(null);
  const [fetchingQr, setFetchingQr] = useState(false);

  // Diagnostics State (Step 8)
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagData, setDiagData] = useState(null);
  const [testingApi, setTestingApi] = useState(false);
  const [testingAuth, setTestingAuth] = useState(false);
  const [testingInstance, setTestingInstance] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Single Test Message State (Step 9)
  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("Hello from Solarix CRM Evolution Go test!");
  const [sendingTest, setSendingTest] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  // General Provider Settings State
  const [providerType, setProviderType] = useState("evolution_go");
  const [name, setName] = useState("Evolution Go Gateway");
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [clientApiKey, setClientApiKey] = useState("");
  const [instanceName, setInstanceName] = useState("solarix_primary");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [rateLimitPerMin, setRateLimitPerMin] = useState(60);
  const [delayMs, setDelayMs] = useState(150);
  const [enforceOptIn, setEnforceOptIn] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  // ─── 1. FETCH EVOLUTION STATUS (STEP 5) ──────────────────────────────────
  const fetchEvolutionStatus = async (showToast = false) => {
    try {
      setRefreshingStatus(true);
      const res = await api.get("/whatsapp/evolution/status");
      setConnectionData(res.data);
      if (showToast) {
        if (res.data.connected) {
          toast.success("Status: Connected to WhatsApp!");
        } else {
          toast.info("Status: Disconnected. Review diagnostic details below.");
        }
      }
      return res.data;
    } catch (err) {
      console.error("Error fetching evolution status:", err);
      const msg = err.response?.data?.error || err.response?.data?.detail || "Could not reach backend proxy";
      setConnectionData(prev => ({
        ...prev,
        status: "disconnected",
        connected: false,
        error: msg
      }));
      if (showToast) toast.error(msg);
      return null;
    } finally {
      setRefreshingStatus(false);
      setConnLoading(false);
    }
  };

  // ─── 2. CONNECT WHATSAPP & QR FLOW (STEP 6) ──────────────────────────────
  const handleConnectWhatsApp = async () => {
    try {
      setConnecting(true);
      const res = await api.post("/whatsapp/evolution/connect");
      if (res.data?.success) {
        if (res.data.qr_code) {
          setQrCodeData(res.data.qr_code);
          setQrModalOpen(true);
          toast.info("Scan the QR code with WhatsApp (Linked Devices).");
        } else if (res.data.status === "connected") {
          toast.success("WhatsApp is already connected!");
          await fetchEvolutionStatus();
        } else {
          toast.info("Connection initiated. Fetching QR code...");
          await handleGenerateQr();
        }
      } else {
        const errorMsg = res.data?.error || "Failed to initialize connection";
        toast.error(errorMsg);
        await fetchEvolutionStatus();
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || "Failed to connect to Evolution Go";
      toast.error(msg);
      await fetchEvolutionStatus();
    } finally {
      setConnecting(false);
    }
  };

  const handleGenerateQr = async () => {
    try {
      setFetchingQr(true);
      const res = await api.get("/whatsapp/evolution/qr");
      if (res.data?.qr_code) {
        setQrCodeData(res.data.qr_code);
        setQrModalOpen(true);
        toast.success("QR code generated! Scan with WhatsApp.");
      } else if (res.data?.status === "connected") {
        toast.success("WhatsApp is already connected.");
        setQrModalOpen(false);
        await fetchEvolutionStatus();
      } else {
        toast.error(res.data?.error || "No QR code available. Service might still be generating it.");
      }
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to fetch QR code");
    } finally {
      setFetchingQr(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm("Are you sure you want to disconnect this WhatsApp instance?")) {
      return;
    }
    try {
      setDisconnecting(true);
      const res = await api.post("/whatsapp/evolution/disconnect");
      if (res.data?.success) {
        toast.success("WhatsApp instance disconnected successfully.");
      }
      await fetchEvolutionStatus();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to disconnect instance");
    } finally {
      setDisconnecting(false);
    }
  };

  // Auto-poll QR status while modal is open
  useEffect(() => {
    let interval;
    if (qrModalOpen) {
      interval = setInterval(async () => {
        const st = await fetchEvolutionStatus();
        if (st && st.connected) {
          setQrModalOpen(false);
          toast.success("WhatsApp connected successfully!");
        }
      }, 2500);
    }
    return () => clearInterval(interval);
  }, [qrModalOpen]);

  // ─── 3. FETCH DIAGNOSTICS (STEP 8) ────────────────────────────────────────
  const fetchDiagnostics = async () => {
    try {
      setDiagLoading(true);
      const res = await api.get("/whatsapp/evolution/diagnostics");
      setDiagData(res.data);
    } catch (err) {
      console.error("Failed to load diagnostics:", err);
    } finally {
      setDiagLoading(false);
    }
  };

  const runTestApi = async () => {
    try {
      setTestingApi(true);
      const res = await api.post("/whatsapp/evolution/test-api");
      setTestResult({ test: "API Probe", ...res.data });
      if (res.data.pass) {
        toast.success(res.data.message);
      } else {
        toast.error(res.data.message);
      }
      fetchDiagnostics();
    } catch (err) {
      toast.error("Failed to execute API test");
    } finally {
      setTestingApi(false);
    }
  };

  const runTestAuth = async () => {
    try {
      setTestingAuth(true);
      const res = await api.post("/whatsapp/evolution/test-auth");
      setTestResult({ test: "Authentication Test", ...res.data });
      if (res.data.pass) {
        toast.success(res.data.message);
      } else {
        toast.error(res.data.message);
      }
      fetchDiagnostics();
    } catch (err) {
      toast.error("Failed to execute Auth test");
    } finally {
      setTestingAuth(false);
    }
  };

  const runTestInstance = async () => {
    try {
      setTestingInstance(true);
      const res = await api.post("/whatsapp/evolution/test-instance");
      setTestResult({ test: "Instance Check", ...res.data });
      if (res.data.pass) {
        toast.success(res.data.message);
      } else {
        toast.warning(res.data.message);
      }
      fetchDiagnostics();
    } catch (err) {
      toast.error("Failed to execute Instance test");
    } finally {
      setTestingInstance(false);
    }
  };

  const runTestWebhook = async () => {
    try {
      setTestingWebhook(true);
      const res = await api.post("/whatsapp/evolution/test-webhook");
      setTestResult({ test: "Webhook Simulator", ...res.data });
      toast.success(res.data.message);
      fetchDiagnostics();
    } catch (err) {
      toast.error("Failed to execute Webhook test");
    } finally {
      setTestingWebhook(false);
    }
  };

  // ─── 4. SEND TEST MESSAGE (STEP 9) ────────────────────────────────────────
  const handleSendTestMessage = async (e) => {
    e.preventDefault();
    const clean = testPhone.replace(/[^0-9]/g, "");
    if (!clean || clean.length < 10) {
      toast.error("Please enter a valid mobile number with country code (e.g. 919876543210)");
      return;
    }
    if (!testMessage.trim()) {
      toast.error("Please enter message content");
      return;
    }
    try {
      setSendingTest(true);
      setSendResult(null);
      const res = await api.post("/whatsapp/evolution/send", {
        number: clean,
        text: testMessage
      });
      setSendResult(res.data);
      if (res.data.success) {
        toast.success(`Message dispatched! ID: ${res.data.provider_message_id}`);
      } else {
        toast.error(res.data.error || "Failed to dispatch message via Evolution Go");
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || "Failed to send message";
      setSendResult({ success: false, error: msg });
      toast.error(msg);
    } finally {
      setSendingTest(false);
    }
  };

  // ─── 5. PROVIDER SETTINGS ────────────────────────────────────────────────
  const fetchProviderSettings = async () => {
    try {
      const res = await api.get("/whatsapp/providers/settings");
      const d = res.data;
      setProviderType(d.provider_type || "evolution_go");
      setName(d.name || "Evolution Go Gateway");
      setApiUrl(d.api_url || "");
      setApiKey(d.api_key || d.api_key_masked || "");
      setClientApiKey(d.api_key || d.api_key_masked || "");
      setInstanceName(d.instance_name || "solarix_primary");
      setPhoneNumber(d.phone_number || "");
      setWebhookUrl(d.webhook_url || "");
      if (d.settings) {
        setRateLimitPerMin(d.settings.rate_limit_per_min || 60);
        setDelayMs(d.settings.delay_between_messages_ms || 150);
        setEnforceOptIn(d.settings.enforce_opt_in !== false);
      }
    } catch (e) {
      console.error("Failed to load settings", e);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setSaving(true);
      await api.post("/whatsapp/providers/settings", {
        provider_type: providerType,
        name,
        api_url: apiUrl,
        api_key: apiKey,
        instance_name: instanceName,
        phone_number: phoneNumber,
        rate_limit_per_min: Number(rateLimitPerMin) || 60,
        delay_between_messages_ms: Number(delayMs) || 150,
        enforce_opt_in: enforceOptIn,
      });
      toast.success("WhatsApp Provider configuration saved securely!");
      fetchProviderSettings();
      fetchEvolutionStatus();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetchEvolutionStatus();
    fetchDiagnostics();
    fetchProviderSettings();
  }, []);

  return (
    <div className="space-y-6 max-w-5xl pb-12">
      {/* Page Title & Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
            WhatsApp & Evolution Go Integration
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Enterprise WhatsApp connectivity powered by Evolution Go backend proxy.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs">
          <button
            onClick={() => { setActiveTab("connection"); fetchEvolutionStatus(); }}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === "connection"
                ? "bg-white text-blue-700 shadow-xs border border-slate-200/80"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            Connection
          </button>
          <button
            onClick={() => { setActiveTab("diagnostics"); fetchDiagnostics(); }}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === "diagnostics"
                ? "bg-white text-blue-700 shadow-xs border border-slate-200/80"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            Admin Diagnostics
          </button>
          <button
            onClick={() => setActiveTab("config")}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === "config"
                ? "bg-white text-blue-700 shadow-xs border border-slate-200/80"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            Provider Settings
          </button>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* TAB 1: CONNECTION (STEP 5 MANDATORY SCREEN)                           */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      {activeTab === "connection" && (
        <div className="space-y-6">
          {/* Main Connection Status Card */}
          <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Provider:</span>
                    <span className="text-sm font-bold text-slate-900">{connectionData.provider || "Evolution Go"}</span>
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">
                      Go + whatsmeow
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Status:</span>
                    {connectionData.connected ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                        ● Connected
                        {connectionData.phone_number && (
                          <span className="text-slate-600 font-normal">({connectionData.phone_number})</span>
                        )}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                        ● Disconnected
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons (Connect WhatsApp, Generate QR, Refresh Status, Disconnect) */}
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  onClick={handleConnectWhatsApp}
                  disabled={connecting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 gap-1.5 shadow-xs"
                >
                  <Power className="w-3.5 h-3.5" />
                  {connecting ? "Connecting..." : "Connect WhatsApp"}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleGenerateQr}
                  disabled={fetchingQr}
                  className="border-slate-300 text-slate-700 hover:bg-slate-50 text-xs h-9 gap-1.5"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  {fetchingQr ? "Generating..." : "Generate QR"}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fetchEvolutionStatus(true)}
                  disabled={refreshingStatus}
                  className="border-slate-300 text-slate-700 hover:bg-slate-50 text-xs h-9 gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshingStatus ? "animate-spin" : ""}`} />
                  Refresh Status
                </Button>

                {connectionData.connected && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:border-rose-300 text-xs h-9 gap-1.5"
                  >
                    Disconnect
                  </Button>
                )}
              </div>
            </div>

            {/* Masked Configuration Details (Step 5 requirement: Evolution URL: ********, Instance: ********) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50/70 p-4 rounded-xl border border-slate-100">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 block mb-1">
                  Evolution URL
                </span>
                <div className="font-mono text-xs bg-white px-3 py-2 rounded-lg border border-slate-200 text-slate-700">
                  {connectionData.evolution_url_masked || "********"}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Protected server-side endpoint. Hidden from client.</p>
              </div>

              <div>
                <span className="text-[11px] font-semibold text-slate-500 block mb-1">
                  Instance
                </span>
                <div className="font-mono text-xs bg-white px-3 py-2 rounded-lg border border-slate-200 text-slate-700">
                  {connectionData.instance_masked || "********"}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Tenant instance mapped to company ID.</p>
              </div>
            </div>

            {/* Actual Backend Error Display (Never generic "Something went wrong") */}
            {!connectionData.connected && connectionData.error && (
              <div className="p-4 bg-rose-50/80 border border-rose-200 rounded-xl space-y-1.5">
                <div className="flex items-center gap-2 text-rose-800 font-semibold text-xs">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Evolution Go Backend Connection Error:</span>
                </div>
                <div className="font-mono text-xs text-rose-700 bg-white/80 p-2.5 rounded-lg border border-rose-100 leading-relaxed whitespace-pre-wrap">
                  {connectionData.error}
                </div>
                <div className="text-[11px] text-rose-600 pt-1 flex items-center gap-1">
                  <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    To resolve this, ensure Evolution Go is running in your deployment or configure remote EVOLUTION_API_URL in <code>backend/.env</code>.
                  </span>
                </div>
              </div>
            )}

            {/* If Connected: Show Status Info */}
            {connectionData.connected && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-800 text-xs">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <span className="font-bold">Active WhatsApp Link:</span> Connected to mobile number{" "}
                  <strong>{connectionData.phone_number || "Device Linked"}</strong>. Outbound messages and incoming webhooks are operational.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* TAB 2: ADMIN DIAGNOSTICS PANEL (STEP 8 & STEP 9)                      */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      {activeTab === "diagnostics" && (
        <div className="space-y-6">
          <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-600" />
                  Evolution Go Real-Time Diagnostic Telemetry
                </h3>
                <p className="text-xs text-slate-500">
                  Backend-to-Evolution Go connectivity status, auth checks, latency, and webhook monitoring.
                </p>
              </div>

              {/* Action Test Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={runTestApi}
                  disabled={testingApi}
                  className="text-xs h-8 gap-1 border-slate-300"
                >
                  <Wifi className="w-3 h-3 text-blue-600" />
                  {testingApi ? "Testing..." : "Test API"}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={runTestAuth}
                  disabled={testingAuth}
                  className="text-xs h-8 gap-1 border-slate-300"
                >
                  <Key className="w-3 h-3 text-amber-600" />
                  {testingAuth ? "Testing..." : "Test Authentication"}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={runTestInstance}
                  disabled={testingInstance}
                  className="text-xs h-8 gap-1 border-slate-300"
                >
                  <Smartphone className="w-3 h-3 text-emerald-600" />
                  {testingInstance ? "Testing..." : "Test Instance"}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={runTestWebhook}
                  disabled={testingWebhook}
                  className="text-xs h-8 gap-1 border-slate-300"
                >
                  <Zap className="w-3 h-3 text-purple-600" />
                  {testingWebhook ? "Testing..." : "Test Webhook"}
                </Button>
              </div>
            </div>

            {/* Diagnostic Metrics Grid (Step 8 specifications) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Evolution Go URL</span>
                <span className="text-xs font-mono text-slate-800 font-semibold">{diagData?.evolution_url_masked || "********"}</span>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">API Reachability</span>
                {diagData?.api_reachable ? (
                  <Badge className="bg-emerald-500/20 text-emerald-700 border-emerald-300 text-[11px]">PASS (Online)</Badge>
                ) : (
                  <Badge className="bg-rose-500/20 text-rose-700 border-rose-300 text-[11px]">FAIL (Unreachable)</Badge>
                )}
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Authentication</span>
                <Badge variant="outline" className={`text-[11px] ${
                  diagData?.auth_status === "PASS"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                    : diagData?.auth_status === "FAIL"
                    ? "bg-rose-50 text-rose-700 border-rose-300"
                    : "bg-slate-100 text-slate-600"
                }`}>
                  {diagData?.auth_status || "UNCHECKED"}
                </Badge>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Response Time</span>
                <span className="text-xs font-mono text-slate-800 font-semibold flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-400" />
                  {diagData?.response_time_ms ? `${diagData.response_time_ms} ms` : "—"}
                </span>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Instance Status</span>
                <Badge variant="outline" className="text-[11px] bg-slate-100 text-slate-700">
                  {diagData?.instance_status || "UNKNOWN"}
                </Badge>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">WhatsApp Connection</span>
                {diagData?.whatsapp_connection === "CONNECTED" ? (
                  <Badge className="bg-emerald-500/20 text-emerald-700 border-emerald-300 text-[11px]">CONNECTED</Badge>
                ) : (
                  <Badge className="bg-amber-500/20 text-amber-700 border-amber-300 text-[11px]">DISCONNECTED</Badge>
                )}
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Webhook Status</span>
                <Badge variant="outline" className="text-[11px] bg-purple-50 text-purple-700 border-purple-200">
                  {diagData?.webhook_status || "WAITING"}
                </Badge>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Target Instance</span>
                <span className="text-xs font-mono text-slate-800 font-semibold">{diagData?.instance_masked || "********"}</span>
              </div>
            </div>

            {/* Last Webhook Received Box */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-purple-600" />
                Last Webhook Received:
              </span>
              {diagData?.last_webhook_received ? (
                <div className="bg-white p-3 rounded-lg border border-slate-200 font-mono text-[11px] space-y-1">
                  <div><strong>Time:</strong> {diagData.last_webhook_received.time}</div>
                  <div><strong>Event:</strong> {diagData.last_webhook_received.event}</div>
                  <div><strong>Payload Preview:</strong> {diagData.last_webhook_received.preview}</div>
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">No webhooks received yet. Click 'Test Webhook' above to send a test event.</p>
              )}
            </div>

            {/* Last API Error Box */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                Last API Error Recorded:
              </span>
              {diagData?.last_api_error ? (
                <div className="bg-rose-50/70 p-3 rounded-lg border border-rose-100 font-mono text-[11px] text-rose-800 space-y-1">
                  <div><strong>Time:</strong> {diagData.last_api_error.time}</div>
                  <div><strong>Message:</strong> {diagData.last_api_error.message}</div>
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">No recent API errors recorded.</p>
              )}
            </div>

            {/* Active Test Output Modal/Box */}
            {testResult && (
              <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl space-y-1">
                <span className="text-xs font-bold text-blue-900">Result for {testResult.test}:</span>
                <div className="font-mono text-xs text-blue-800 bg-white/80 p-2.5 rounded-lg border border-blue-100">
                  {testResult.message}
                  {testResult.latency_ms && ` (Latency: ${testResult.latency_ms} ms)`}
                </div>
              </div>
            )}

            {/* ─── STEP 9: SEND ONE TEST MESSAGE SECTION ─── */}
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <Send className="w-4 h-4 text-emerald-600" />
                Step 9: Single WhatsApp Message Verification
              </h4>
              <p className="text-xs text-slate-500">
                Verify end-to-end delivery by sending a single message through Evolution Go before enabling bulk campaigns.
              </p>

              <form onSubmit={handleSendTestMessage} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input
                  placeholder="Mobile (e.g. 919876543210)"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  className="text-xs h-9 font-mono"
                />
                <Input
                  placeholder="Message text"
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  className="text-xs h-9"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={sendingTest}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9 gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  {sendingTest ? "Sending..." : "Send Test Message"}
                </Button>
              </form>

              {sendResult && (
                <div className={`p-3 rounded-lg border text-xs font-mono ${
                  sendResult.success ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-rose-50 text-rose-800 border-rose-200"
                }`}>
                  {sendResult.success
                    ? `✓ Message dispatched successfully! Provider ID: ${sendResult.provider_message_id}`
                    : `✗ Message failed: ${sendResult.error}`}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* TAB 3: PROVIDER CONFIGURATION                                         */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      {activeTab === "config" && (
        <div className="space-y-6">
          <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Server className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">Evolution Go Server & Security Settings</h3>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
              <strong>Security Protocol (Step 3 & 10):</strong> API Keys and secrets are strictly stored server-side in{" "}
              <code>backend/.env</code> and never exposed to the frontend bundle.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Evolution API URL</label>
                <Input
                  placeholder="http://127.0.0.1:8080 or https://evolution.yourdomain.com"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  className="text-xs h-9 font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-1">Default local port is 8080.</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Evolution Instance Name</label>
                <Input
                  placeholder="solarix_primary"
                  value={instanceName}
                  onChange={(e) => setInstanceName(e.target.value)}
                  className="text-xs h-9 font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-1">Identifier passed to Evolution Go.</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Evolution API Token / Key</label>
                <Input
                  type="password"
                  placeholder="Enter GLOBAL_API_KEY or instance token"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="text-xs h-9 font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-1">Stored securely on Solarix backend.</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Webhook Receiver URL</label>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={`${window.location.origin}/api/whatsapp/evolution/webhook`}
                    className="text-xs h-9 font-mono bg-slate-50 text-slate-600"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/api/whatsapp/evolution/webhook`);
                      setCopiedWebhook(true);
                      setTimeout(() => setCopiedWebhook(false), 2000);
                      toast.success("Webhook URL copied");
                    }}
                    className="text-xs h-9"
                  >
                    {copiedWebhook ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <Button
                onClick={handleSaveSettings}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9 gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? "Saving..." : "Save Configuration"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* QR CODE CONNECTION MODAL (STEP 6)                                    */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      <Dialog open={qrModalOpen} onOpenChange={setQrModalOpen}>
        <DialogContent className="max-w-md text-center p-6 bg-white rounded-2xl shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center justify-center gap-2">
              <QrCode className="w-5 h-5 text-emerald-600" />
              Scan QR Code with WhatsApp
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Open WhatsApp on your mobile phone &gt; Settings &gt; Linked Devices &gt; Link a Device.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 flex flex-col items-center justify-center">
            {qrCodeData ? (
              <div className="p-4 bg-white rounded-2xl border-2 border-slate-800 shadow-md">
                <img
                  src={qrCodeData.startsWith("data:") ? qrCodeData : `data:image/png;base64,${qrCodeData}`}
                  alt="WhatsApp Evolution QR Code"
                  className="w-64 h-64 object-contain rounded-lg"
                />
              </div>
            ) : (
              <div className="w-64 h-64 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col items-center justify-center text-slate-400 gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                <span className="text-xs">Generating QR Code from Evolution Go...</span>
              </div>
            )}
            <p className="text-[11px] text-slate-400 mt-3 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Auto-detecting scan... This modal will close automatically once paired.
            </p>
          </div>

          <div className="flex items-center justify-center gap-2 pt-2 border-t border-slate-100">
            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerateQr}
              disabled={fetchingQr}
              className="text-xs h-8 gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${fetchingQr ? "animate-spin" : ""}`} />
              Refresh QR
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setQrModalOpen(false)}
              className="text-xs h-8 text-slate-500"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
