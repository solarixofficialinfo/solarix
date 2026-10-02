import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import {
  MessageSquare,
  LayoutDashboard,
  Send,
  Users,
  FileText,
  Inbox,
  Zap,
  Settings,
  History,
  QrCode,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  ExternalLink,
  KeyRound,
  Copy,
  Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

export default function WhatsAppLayout({ children }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [statusData, setStatusData] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectTab, setConnectTab] = useState("qr"); // "qr" | "code"
  const [pairingPhone, setPairingPhone] = useState("");
  const [pairingCode, setPairingCode] = useState(null);
  const [requestingCode, setRequestingCode] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const handleRequestPairingCode = async (e) => {
    if (e) e.preventDefault();
    const clean = (pairingPhone || "").replace(/[^0-9]/g, "");
    if (!clean || clean.length < 10) {
      toast.error("Please enter a valid mobile number with country code (e.g. 919876543210)");
      return;
    }
    try {
      setRequestingCode(true);
      const res = await api.post("/whatsapp/instance/pairing-code", { phone_number: clean });
      if (res.data?.success && res.data?.pairing_code) {
        setPairingCode(res.data.pairing_code);
        toast.success("Pairing code generated! Enter this code in your WhatsApp app.");
      } else {
        toast.error(res.data?.error || "Failed to generate pairing code");
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || err.response?.data?.error || "Failed to request pairing code");
    } finally {
      setRequestingCode(false);
    }
  };

  const copyPairingCode = () => {
    if (!pairingCode) return;
    navigator.clipboard.writeText(pairingCode);
    setCopiedCode(true);
    toast.success("Pairing code copied to clipboard!");
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const fetchStatus = async () => {
    try {
      setLoadingStatus(true);
      const res = await api.get("/whatsapp/instance/status");
      setStatusData(res.data);
      return res.data;
    } catch (e) {
      console.error("Failed to load WhatsApp status", e);
      return null;
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Fast polling (2s) while QR modal is open to instantly detect phone scan
    const intervalTime = qrModalOpen ? 2000 : 12000;
    const interval = setInterval(async () => {
      try {
        const res = await api.get("/whatsapp/instance/status");
        if (res.data) {
          setStatusData(res.data);
          if (qrModalOpen && (res.data.connected || res.data.status === "connected")) {
            setQrModalOpen(false);
            toast.success(`WhatsApp Linked Successfully! Connected to ${res.data.phone_number || "Device"}`);
          }
        }
      } catch (e) {}
    }, intervalTime);
    return () => clearInterval(interval);
  }, [qrModalOpen]);

  const handleConnect = async (force = false) => {
    try {
      setConnecting(true);
      const isForced = force === true;
      const res = await api.post("/whatsapp/instance/connect", { force: isForced });
      if (res.data?.status === "connected" && res.data?.phone_number) {
        setStatusData(res.data);
        setQrModalOpen(false);
        toast.success(`WhatsApp is already connected to ${res.data.phone_number}!`);
      } else if (res.data && res.data.qr_code) {
        setStatusData((prev) => ({
          ...prev,
          ...res.data,
          qr_code: res.data.qr_code,
          status: "qr_ready",
        }));
        setQrModalOpen(true);
        toast.info("Point WhatsApp > Linked Devices at the QR code to pair your phone.");
      } else {
        await fetchStatus();
        setQrModalOpen(true);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to initiate WhatsApp connection");
    } finally {
      setConnecting(false);
    }
  };

  const navTabs = [
    { to: "/whatsapp/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/whatsapp/campaigns", label: "Campaigns", icon: Send },
    { to: "/whatsapp/contacts", label: "Contacts", icon: Users },
    { to: "/whatsapp/templates", label: "Templates", icon: FileText },
    { to: "/whatsapp/inbox", label: "Inbox", icon: Inbox },
    { to: "/whatsapp/automation", label: "Automation", icon: Zap },
    { to: "/whatsapp/activity", label: "Activity Log", icon: History },
    { to: "/whatsapp/settings", label: "Settings", icon: Settings },
  ];

  const isConnected = statusData?.connected === true || statusData?.status === "connected";

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-5 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-500/20 text-white ring-2 ring-white/10 shrink-0">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold tracking-tight text-white" style={{ fontFamily: "Outfit" }}>
                  WhatsApp Marketing
                </h1>
                <Badge variant="outline" className="bg-emerald-500/20 text-emerald-300 border-emerald-400/30 text-[11px] font-medium">
                  {statusData?.engine || "Multi-Device Gateway"}
                </Badge>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Send CRM-powered campaigns, manage live customer chats & automate solar follow-ups.
              </p>
            </div>
          </div>

          {/* Connection status pill & action */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 backdrop-blur-md border border-white/10 text-xs text-slate-200">
              <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
              <span className="font-medium">
                {isConnected ? (
                  <>Connected: <span className="text-white font-semibold">{statusData?.phone_number || "Device Linked"}</span></>
                ) : (
                  <span className="text-amber-300 font-semibold">Disconnected</span>
                )}
              </span>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={handleConnect}
              disabled={connecting}
              className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs h-9 gap-1.5"
            >
              {isConnected ? (
                <>
                  <RefreshCw className={`w-3.5 h-3.5 ${connecting ? "animate-spin" : ""}`} />
                  Reconnect / QR
                </>
              ) : (
                <>
                  <QrCode className="w-3.5 h-3.5" />
                  Connect WhatsApp
                </>
              )}
            </Button>

            <Link to="/whatsapp-marketing" target="_blank">
              <Button size="sm" variant="ghost" className="text-xs text-slate-300 hover:text-white hover:bg-white/10 h-9 gap-1">
                Public Page <ExternalLink className="w-3 h-3" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 px-4 py-2 bg-slate-50/80 border-t border-slate-100 overflow-x-auto no-scrollbar">
          {navTabs.map((tab) => {
            const Icon = tab.icon;
            const active = pathname === tab.to || (tab.to === "/whatsapp/dashboard" && pathname === "/whatsapp");
            return (
              <button
                key={tab.to}
                onClick={() => navigate(tab.to)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  active
                    ? "bg-white text-blue-700 shadow-xs border border-slate-200/80"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? "text-blue-600" : "text-slate-400"}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="min-h-[500px]">{children}</div>

      {/* QR Code / Reconnect Dialog */}
      <Dialog open={qrModalOpen} onOpenChange={setQrModalOpen}>
        <DialogContent className="max-w-md text-center p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center justify-center gap-2">
              <QrCode className="w-5 h-5 text-emerald-600" /> Connect WhatsApp
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Link your WhatsApp business or personal mobile number with Solarix CRM.
            </DialogDescription>
          </DialogHeader>

          {/* Toggle between QR Scan and Pairing Code */}
          <div className="flex rounded-xl bg-slate-100 p-1 mt-3 mb-2 text-xs">
            <button
              type="button"
              onClick={() => setConnectTab("qr")}
              className={`flex-1 py-1.5 px-3 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-all ${
                connectTab === "qr" ? "bg-white text-emerald-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <QrCode className="w-3.5 h-3.5" /> Scan QR Code
            </button>
            <button
              type="button"
              onClick={() => setConnectTab("code")}
              className={`flex-1 py-1.5 px-3 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-all ${
                connectTab === "code" ? "bg-white text-blue-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" /> Link with Phone Code
            </button>
          </div>

          {connectTab === "qr" ? (
            /* TAB 1: QR CODE */
            <div className="my-3 flex flex-col items-center justify-center">
              <div className="p-3 bg-white border-2 border-slate-200/90 rounded-2xl shadow-md inline-block relative">
                {statusData?.qr_code ? (
                  statusData.qr_code.startsWith("data:") ? (
                    <img src={statusData.qr_code} alt="Official WhatsApp Multi-Device QR" className="w-52 h-52 object-contain rounded-lg" />
                  ) : (
                    <img src={`data:image/png;base64,${statusData.qr_code}`} alt="Official WhatsApp Multi-Device QR" className="w-52 h-52 object-contain rounded-lg" />
                  )
                ) : (
                  <div className="w-52 h-52 flex flex-col items-center justify-center bg-slate-50 text-slate-500 text-xs gap-2 rounded-lg">
                    <RefreshCw className="w-7 h-7 animate-spin text-emerald-600" />
                    <span className="font-semibold text-slate-700">Connecting to WhatsApp...</span>
                    <span className="text-[11px] text-slate-400">Fetching live multi-device pairing key</span>
                  </div>
                )}
              </div>

              {/* Instruction Steps */}
              <div className="mt-3.5 w-full text-left bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-1 text-xs text-slate-700">
                <div className="font-bold text-slate-900 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-emerald-700">
                  <Smartphone className="w-3.5 h-3.5" /> How to scan with phone:
                </div>
                <ol className="list-decimal list-inside space-y-0.5 text-[11px] text-slate-600 leading-relaxed">
                  <li>Open <strong className="text-slate-900">WhatsApp</strong> on your mobile phone</li>
                  <li>Tap <strong className="text-slate-900">Settings</strong> (iOS) or <strong className="text-slate-900">3 Dots Menu</strong> (Android)</li>
                  <li>Select <strong className="text-slate-900">Linked Devices</strong> → <strong className="text-slate-900">Link a Device</strong></li>
                  <li>Point your phone camera at this QR code.</li>
                </ol>
              </div>

              <div className="mt-2.5 flex items-center gap-2 text-[11px] text-emerald-700 font-medium bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Listening for phone link... Auto-connects on scan
              </div>
            </div>
          ) : (
            /* TAB 2: PAIRING CODE (BY PHONE NUMBER) */
            <div className="my-3 space-y-3.5 text-left">
              <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-xl text-xs text-blue-800 leading-relaxed">
                <strong>No camera needed!</strong> Enter your WhatsApp phone number to generate an official 8-digit link code.
              </div>

              <form onSubmit={handleRequestPairingCode} className="space-y-2.5">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    WhatsApp Mobile Number (With Country Code)
                  </label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g. 919876543210 (without +)"
                      value={pairingPhone}
                      onChange={(e) => setPairingPhone(e.target.value)}
                      className="text-xs h-10 font-mono tracking-wide"
                    />
                    <Button
                      type="submit"
                      disabled={requestingCode}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-10 px-4 shrink-0 font-semibold"
                    >
                      {requestingCode ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        "Get Code"
                      )}
                    </Button>
                  </div>
                  <span className="text-[11px] text-slate-400 block mt-1">
                    Example: India ➔ <strong>919876543210</strong> (do not include + or spaces)
                  </span>
                </div>
              </form>

              {pairingCode && (
                <div className="p-4 bg-slate-900 text-white rounded-xl text-center space-y-2 border border-slate-800 shadow-md">
                  <div className="text-[11px] uppercase tracking-wider text-emerald-400 font-semibold">
                    Your Official WhatsApp Link Code
                  </div>
                  <div className="text-2xl font-black font-mono tracking-widest text-white py-1">
                    {pairingCode.length === 8 ? `${pairingCode.slice(0, 4)} - ${pairingCode.slice(4)}` : pairingCode}
                  </div>
                  <div className="flex justify-center">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={copyPairingCode}
                      className="text-xs h-8 bg-white/10 hover:bg-white/20 text-white border-white/20 gap-1.5"
                    >
                      {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedCode ? "Copied!" : "Copy Code"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Pairing Instructions */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-1 text-xs text-slate-700">
                <div className="font-bold text-slate-900 text-[11px] uppercase tracking-wider text-blue-700">
                  How to enter code on WhatsApp:
                </div>
                <ol className="list-decimal list-inside space-y-0.5 text-[11px] text-slate-600 leading-relaxed">
                  <li>Open <strong className="text-slate-900">WhatsApp</strong> on your phone</li>
                  <li>Tap <strong className="text-slate-900">Settings / 3 Dots</strong> ➔ <strong className="text-slate-900">Linked Devices</strong> ➔ <strong className="text-slate-900">Link a Device</strong></li>
                  <li>At the bottom of the camera screen, tap <strong className="text-blue-700">"Link with phone number instead"</strong></li>
                  <li>Enter the 8-digit code shown above. Connection completes instantly!</li>
                </ol>
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-center pt-2">
            <Button variant="outline" size="sm" onClick={() => setQrModalOpen(false)}>
              Close
            </Button>
            {connectTab === "qr" && (
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleConnect(true)}>
                Refresh QR
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
