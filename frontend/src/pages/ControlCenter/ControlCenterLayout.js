import React, { useState } from "react";
import { Link, useLocation, useNavigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  ShieldAlert, LayoutDashboard, Building2, CreditCard, ToggleRight,
  TrendingUp, MessageSquare, Bell, Activity, ScrollText, Settings, Menu, X, ArrowLeft, LogOut
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function ControlCenterLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { to: "/control-center/dashboard", label: "Overview", icon: LayoutDashboard },
    { to: "/control-center/customers", label: "Customers", icon: Building2 },
    { to: "/control-center/subscriptions", label: "Subscriptions", icon: CreditCard },
    { to: "/control-center/features", label: "Feature Access", icon: ToggleRight },
    { to: "/control-center/analytics", label: "Usage Analytics", icon: TrendingUp },
    { to: "/control-center/feedback", label: "Feedback", icon: MessageSquare },
    { to: "/control-center/notifications", label: "Notifications", icon: Bell },
    { to: "/control-center/health", label: "System Health", icon: Activity },
    { to: "/control-center/audit-logs", label: "Audit Logs", icon: ScrollText },
    { to: "/control-center/settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex font-sans">
      {/* DESKTOP SIDEBAR */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-slate-800 bg-slate-950/80 p-4 space-y-6">
        <div className="flex items-center justify-between px-2 pt-2">
          <div className="flex items-center gap-2 font-bold text-white tracking-wider text-sm font-mono">
            <ShieldAlert className="w-5 h-5 text-blue-500 shrink-0" />
            <span>SOLRIX CONTROL CENTER</span>
          </div>
        </div>

        <div className="px-2 py-1 bg-blue-950/40 rounded-lg border border-blue-800/40 text-[11px] text-blue-300 font-mono flex items-center justify-between">
          <span>LEVEL 1 OWNER</span>
          <Badge variant="outline" className="bg-blue-500/20 text-blue-300 border-blue-400/30 text-[9px]">ROOT</Badge>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  active
                    ? "bg-blue-600 text-white shadow-md shadow-blue-900/30"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100"
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? "text-white" : "text-slate-400"}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="pt-4 border-t border-slate-800 space-y-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/dashboard")}
            className="w-full justify-start text-xs text-slate-400 hover:text-white hover:bg-slate-800/50 gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> Back to App
          </Button>
        </div>
      </aside>

      {/* MOBILE DRAWER */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 lg:hidden flex">
          <div className="w-64 bg-slate-950 p-4 flex flex-col space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="font-bold text-xs text-white">SOLRIX CONTROL CENTER</span>
              <button onClick={() => setMobileOpen(false)} className="text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            <nav className="flex-1 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = location.pathname.startsWith(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold ${
                      active ? "bg-blue-600 text-white" : "text-slate-400"
                    }`}
                  >
                    <Icon className="w-4 h-4" /> {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-900">
        <header className="h-16 border-b border-slate-800 bg-slate-950/60 px-4 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="lg:hidden text-slate-400 p-1">
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="font-bold text-sm lg:text-base text-white tracking-tight">
              Platform Administration & Customer Control
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="font-bold text-xs text-white">{user?.name || "Platform Admin"}</div>
              <div className="text-[10px] text-slate-400 font-mono">{user?.email}</div>
            </div>
            <Button size="xs" variant="outline" onClick={logout} className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs">
              <LogOut className="w-3.5 h-3.5 mr-1" /> Logout
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
