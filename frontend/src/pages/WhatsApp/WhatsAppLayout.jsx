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
  ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

export default function WhatsAppLayout({ children }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [statusData, setStatusData] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const fetchStatus = async () => {
    try {
      setLoadingStatus(true);
      const res = await api.get("/whatsapp/instance/status");
      setStatusData(res.data);
    } catch (e) {
      console.error("Failed to load WhatsApp status", e);
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleConnect = async () => {
    try {
      setConnecting(true);
      const res = await api.post("/whatsapp/instance/connect");
      if (res.data && res.data.qr_code) {
        setStatusData((prev) => ({
          ...prev,
          qr_code: res.data.qr_code,
          status: res.data.status || "qr_ready",
        }));
        setQrModalOpen(true);
        toast.info("Scan the QR code in WhatsApp > Linked Devices to connect.");
      } else {
        toast.success("WhatsApp is successfully connected!");
        fetchStatus();
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
                  Solarix CRM Engine
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
                  <>Connected: <span className="text-white font-semibold">{statusData?.phone_number || "+91 98765 43210"}</span></>
                ) : (
                  <span className="text-amber-300">Disconnected</span>
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
              <QrCode className="w-5 h-5 text-emerald-600" /> Connect Solarix WhatsApp
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Open WhatsApp on your phone → Settings / Menu → Linked Devices → Link a Device, then point your phone camera at this screen.
            </DialogDescription>
          </DialogHeader>

          <div className="my-5 flex flex-col items-center justify-center">
            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-inner inline-block">
              {statusData?.qr_code ? (
                statusData.qr_code.startsWith("data:") ? (
                  <img src={statusData.qr_code} alt="WhatsApp QR Code" className="w-48 h-48 object-contain" />
                ) : (
                  <img src={`data:image/png;base64,${statusData.qr_code}`} alt="WhatsApp QR Code" className="w-48 h-48 object-contain" />
                )
              ) : (
                <div className="w-48 h-48 flex flex-col items-center justify-center bg-slate-50 text-slate-400 text-xs">
                  <RefreshCw className="w-6 h-6 animate-spin text-emerald-600 mb-2" />
                  Generating fresh session...
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center gap-2 text-xs text-slate-600 font-medium bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200">
              <Smartphone className="w-3.5 h-3.5 text-blue-600" />
              Instance: <span className="font-semibold text-slate-900">{statusData?.instance_name || "solarix_primary"}</span>
            </div>
          </div>

          <div className="flex gap-2 justify-center">
            <Button variant="outline" size="sm" onClick={() => setQrModalOpen(false)}>
              Close
            </Button>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleConnect}>
              Refresh QR
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
