import React, { useState } from "react";
import { Link, useLocation, useNavigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  ShieldAlert, LayoutDashboard, Building2, CreditCard, ToggleRight,
  TrendingUp, MessageSquare, Bell, Activity, ScrollText, Settings, Menu, X, ArrowLeft, LogOut, BarChart3
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function ControlCenterLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { to: "/control-center/dashboard", label: "Overview", icon: LayoutDashboard, title: "Super Admin Platform Overview" },
    { to: "/control-center/customers", label: "Users / Clients", icon: Building2, title: "Customer Workspaces & Users Directory" },
    { to: "/control-center/plans", label: "Plans & Entitlements", icon: CreditCard, title: "Plan Matrix & Feature Entitlements" },
    { to: "/control-center/notifications", label: "Notifications", icon: Bell, title: "Platform Notification Center" },
    { to: "/control-center/feedback", label: "Feedback / Problems", icon: MessageSquare, title: "Customer Reports & Feedback Inbox" },
    { to: "/control-center/performance", label: "Performance", icon: TrendingUp, title: "Product Usage & Adoption Performance" },
    { to: "/control-center/pages", label: "Page Analytics", icon: Activity, title: "Module Visit Telemetry & Page Analytics" },
    { to: "/control-center/metrics", label: "SaaS Economics", icon: BarChart3, title: "SaaS Financial Economics & MRR Metrics" },
    { to: "/control-center/audit-logs", label: "Activity / Audit Logs", icon: ScrollText, title: "Immutable Platform Admin Audit Logs" },
    { to: "/control-center/settings", label: "Admin Settings", icon: Settings, title: "Super Admin Security & System Settings" },
  ];

  const currentItem = navItems.find((it) => location.pathname.startsWith(it.to)) || navItems[0];

  return (
    <div className="fixed inset-0 w-screen h-screen bg-slate-900 text-slate-100 flex font-sans overflow-hidden z-50">
      {/* DESKTOP SIDEBAR */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-slate-800 bg-slate-950/90 p-4 space-y-6 h-screen shrink-0">
        <div className="flex items-center justify-between px-2 pt-2">
          <div className="flex items-center gap-2 font-bold text-white tracking-wider text-sm font-mono">
            <ShieldAlert className="w-5 h-5 text-blue-500 shrink-0" />
            <span>SOLARIX CONTROL CENTER</span>
          </div>
        </div>

        <div className="px-3 py-1.5 bg-blue-950/40 rounded-xl border border-blue-800/40 text-[11px] text-blue-300 font-mono flex items-center justify-between">
          <span className="font-semibold">SUPER ADMIN</span>
          <Badge variant="outline" className="bg-blue-500/20 text-blue-300 border-blue-400/30 text-[9px] uppercase font-mono">ROOT ACCESS</Badge>
        </div>

        <nav className="flex-1 space-y-1.5 overflow-y-auto pr-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  active
                    ? "bg-blue-600 text-white shadow-md shadow-blue-950"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100"
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? "text-white" : "text-slate-400"}`} />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="pt-3 border-t border-slate-800 space-y-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/dashboard")}
            className="w-full justify-start text-xs text-slate-400 hover:text-white hover:bg-slate-800/60 gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> Exit to App Workspace
          </Button>
        </div>
      </aside>

      {/* MOBILE DRAWER OVERLAY */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 lg:hidden flex">
          <div className="w-72 bg-slate-950 p-4 flex flex-col space-y-6 h-full border-r border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 font-bold text-xs text-white font-mono">
                <ShieldAlert className="w-4 h-4 text-blue-500" /> SOLARIX CONTROL CENTER
              </div>
              <button onClick={() => setMobileOpen(false)} className="text-slate-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1.5 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = location.pathname.startsWith(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold ${
                      active ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-slate-900"
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" /> {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="pt-2 border-t border-slate-800">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setMobileOpen(false); navigate("/dashboard"); }}
                className="w-full justify-start text-xs text-slate-400 hover:text-white gap-2"
              >
                <ArrowLeft className="w-4 h-4" /> Exit to App Workspace
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN ADMIN SHELL CONTAINER */}
      <div className="flex-1 flex flex-col min-w-0 h-screen bg-slate-900 overflow-hidden">
        {/* FIXED ADMIN HEADER */}
        <header className="h-16 border-b border-slate-800 bg-slate-950/80 px-4 lg:px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="lg:hidden text-slate-400 hover:text-white p-1">
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="font-bold text-sm lg:text-base text-white tracking-tight">
                {currentItem.title}
              </h1>
              <div className="text-[11px] text-slate-400 font-mono hidden sm:block">
                SOLARIX SaaS Platform Administration
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="font-bold text-xs text-white">{user?.name || "Platform Admin"}</div>
              <div className="text-[10px] text-slate-400 font-mono">{user?.email || "solarixoffcial.info@gmail.com"}</div>
            </div>
            <Button
              size="xs"
              variant="outline"
              onClick={logout}
              className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white text-xs font-semibold"
            >
              <LogOut className="w-3.5 h-3.5 mr-1.5" /> Logout
            </Button>
          </div>
        </header>

        {/* SCROLLING ADMIN CONTENT */}
        <main className="flex-1 p-4 lg:p-8 overflow-y-auto bg-slate-900">
          <div className="max-w-[1600px] mx-auto w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
