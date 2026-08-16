import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { Sun, LayoutDashboard, Users2, UserCog, Building2, ScrollText, LogOut, Briefcase, ClipboardList, Boxes, FileText, LifeBuoy, Megaphone, Menu, X, Wrench, PhoneCall, DollarSign, Truck, Search, CreditCard, TrendingUp, ShieldAlert, Sparkles, PackageSearch } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import ProfileMenu from "@/components/ProfileMenu";
import TrialBanner from "@/components/TrialBanner";
import AppFeedback from "@/components/AppFeedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PlanBadge from "@/components/PlanBadge";

function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get(`/search/global?q=${encodeURIComponent(query)}`);
        setResults(res.data);
      } catch (e) {
        setResults(null);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-slate-100/90 hover:bg-slate-200/70 border border-slate-200 text-slate-500 text-xs px-3 py-1.5 rounded-lg transition"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="hidden md:inline">Global Search (Clients, Products, Serials, Tasks)...</span>
        <span className="md:hidden">Search</span>
      </button>

      {open && (
        <Dialog open onOpenChange={() => setOpen(false)}>
          <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900">
                <Search className="w-5 h-5 text-blue-600" /> Solarix Global Search
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <Input
                autoFocus
                placeholder="Search clients, mobile, SOL ID, inverter serials, products, vendors..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="text-xs h-10"
              />

              {loading && <div className="text-xs text-slate-500 italic p-4 text-center">Searching Solarix system...</div>}

              {results && (
                <div className="space-y-4 text-xs">
                  {(results.clients || []).length > 0 && (
                    <div className="space-y-2">
                      <div className="font-semibold text-slate-700 uppercase text-[10px] tracking-wider">Clients ({(results.clients).length})</div>
                      <div className="space-y-1">
                        {results.clients.map((c) => (
                          <Link
                            key={c.id}
                            to={`/client-data/${c.id}`}
                            onClick={() => setOpen(false)}
                            className="flex items-center justify-between bg-slate-50 p-2.5 rounded border border-slate-200 hover:bg-blue-50/50 hover:border-blue-200 transition"
                          >
                            <div>
                              <div className="font-semibold text-slate-900">{c.full_name}</div>
                              <div className="text-[11px] text-slate-500">{c.sol_id || "No SOL ID"} · {c.mobile} · {c.system_kw || 0} kW</div>
                            </div>
                            <Badge variant="outline" className="text-[10px] bg-white">{c.status || "Client"}</Badge>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {(results.products || []).length > 0 && (
                    <div className="space-y-2">
                      <div className="font-semibold text-slate-700 uppercase text-[10px] tracking-wider">Inventory Products ({(results.products).length})</div>
                      <div className="space-y-1">
                        {results.products.map((p) => (
                          <Link
                            key={p.id}
                            to="/inventory"
                            onClick={() => setOpen(false)}
                            className="flex items-center justify-between bg-slate-50 p-2.5 rounded border border-slate-200 hover:bg-blue-50/50 hover:border-blue-200 transition"
                          >
                            <div>
                              <div className="font-semibold text-slate-900">{p.name || p.product_name}</div>
                              <div className="text-[11px] text-slate-500">Category: {p.category || "General"} · Size: {p.size || "—"}</div>
                            </div>
                            <span className="font-semibold text-slate-700 text-xs">{p.stock_quantity || 0} {p.unit || "Nos"}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* {(results.vendors && Array.isArray(results.vendors) && results.vendors.length > 0) && (
                    <div className="space-y-2">
                      <div className="font-semibold text-slate-700 uppercase text-[10px] tracking-wider">Vendors ({results.vendors.length})</div>
                      <div className="space-y-1">
                        {(Array.isArray(results.vendors) ? results.vendors : []).map((v) => (
                          <Link
                            key={v.id}
                            to="/vendors"
                            onClick={() => setOpen(false)}
                            className="flex items-center justify-between bg-slate-50 p-2.5 rounded border border-slate-200 hover:bg-blue-50/50 hover:border-blue-200 transition"
                          >
                            <div>
                              <div className="font-semibold text-slate-900">{v.name}</div>
                              <div className="text-[11px] text-slate-500">Category: {v.category} · Phone: {v.phone || "—"}</div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )} */}

                  {(results.tasks || []).length > 0 && (
                    <div className="space-y-2">
                      <div className="font-semibold text-slate-700 uppercase text-[10px] tracking-wider">Tasks ({(results.tasks).length})</div>
                      <div className="space-y-1">
                        {results.tasks.map((t) => (
                          <Link
                            key={t.id}
                            to="/tasks"
                            onClick={() => setOpen(false)}
                            className="flex items-center justify-between bg-slate-50 p-2.5 rounded border border-slate-200 hover:bg-blue-50/50 hover:border-blue-200 transition"
                          >
                            <div>
                              <div className="font-semibold text-slate-900">{t.title}</div>
                              <div className="text-[11px] text-slate-500">Assigned To: {t.assigned_to || "Unassigned"}</div>
                            </div>
                            <Badge variant="outline" className="text-[10px] bg-white">{t.status}</Badge>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

export default function Layout({ children }) {
  const { user, company, logout } = useAuth();
  const { pathname } = useLocation();
  const nav = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isSuperAdmin = user?.user_type === "platform_owner" || user?.user_type === "super_admin" || user?.is_platform_owner || user?.is_super_admin || user?.role === "Platform Owner" || user?.role === "Super Admin";
  const isSuperOrAdmin = isSuperAdmin || user?.role === "Admin" || user?.user_type === "owner";
  const isAdmin = isSuperOrAdmin;
  const allowed = (page) => isSuperOrAdmin || (user?.permissions?.[page]?.view === true);
  const ALWAYS_VISIBLE = new Set(["complaints"]);

  const navSections = [
    {
      title: "WORKSPACE",
      items: [
        { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, key: "dashboard" },
        { to: "/clients", label: "Clients", icon: Users2, key: "clients" },
        { to: "/projects", label: "Project Execution", icon: Briefcase, key: "project_execution" },
        { to: "/tasks", label: "Task Portal", icon: ClipboardList, key: "task_portal" },
      ],
    },
    {
      title: "OPERATIONS",
      items: [
        { to: "/receivables", label: "Receivables & Collection", icon: DollarSign, key: "receivables" },
        { to: "/inventory", label: "Data Management", icon: Boxes, key: "data_management" },
        { to: "/material", label: "Material Requests", icon: PackageSearch, key: "data_management" },
        { to: "/client-data", label: "Client Data", icon: LifeBuoy, key: "client_data" },
        { to: "/reports", label: "Reports", icon: ScrollText, key: "reports" },
      ],
    },
    {
      title: "DOCUMENTS",
      items: [
        { to: "/sales-documents", label: "Sales Documents", icon: FileText, key: "sales_documents" },
        { to: "/templates", label: "Document Templates", icon: FileText, key: "documents" },
        { to: "/purchase-orders", label: "Purchase Orders", icon: FileText, key: "sales_documents" },
      ],
    },
    {
      title: "CONTROL",
      items: [
        { to: "/control-center", label: "SOLRIX Super Admin", icon: ShieldAlert, key: "super_admin", superAdminOnly: true },
        { to: "/billing", label: "Billing & Subscription", icon: CreditCard, key: "billing", adminOnly: true },
        { to: "/complaints", label: "Complaint Center", icon: Megaphone, key: "complaints" },
        { to: "/team", label: "Team & Access", icon: UserCog, key: "team", adminOnly: true },
        { to: "/profile", label: "Company Details", icon: Building2, key: "settings", adminOnly: true },
        { to: "/activity", label: "Activity Log", icon: ScrollText, key: "settings", adminOnly: true },
      ],
    },
  ];

  useEffect(() => {
    if (pathname && !pathname.startsWith("/control-center")) {
      api.post("/analytics/track-page", {
        page_path: pathname,
        page_name: navSections.flatMap(s => s.items).find(i => pathname.startsWith(i.to))?.label || pathname
      }).catch(() => {});
    }
  }, [pathname]);

  const sidebarContent = (
    <>
      <div className="p-5 border-b border-slate-200 flex items-center gap-3">
        <div className="w-9 h-9 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-sm">
          <Sun className="w-5 h-5" />
        </div>
        <div>
          <div className="font-semibold tracking-tight text-slate-900 flex items-center gap-1.5" style={{ fontFamily: "Outfit" }}>
            <span>SOLARIX</span>
            <PlanBadge planId={company?.plan_id} size="xs" />
          </div>
          <div className="text-[11px] text-slate-500 truncate max-w-[140px]">{company?.company_name || "Solar CRM"}</div>
        </div>
        <button
          className="ml-auto lg:hidden p-1.5 rounded-md text-slate-500 hover:bg-slate-100"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
        {navSections.map((sec) => {
          const visibleItems = sec.items.filter((it) => {
            if (it.superAdminOnly) return isSuperAdmin;
            if (it.adminOnly) return isAdmin;
            return ALWAYS_VISIBLE.has(it.key) || allowed(it.key);
          });

          if (visibleItems.length === 0) return null;

          return (
            <div key={sec.title} className="space-y-1">
              <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase px-3 pb-1">
                {sec.title}
              </div>
              {visibleItems.map((it) => {
                const Icon = it.icon;
                const active = pathname.startsWith(it.to);
                return (
                  <Link
                    key={it.to}
                    to={it.to}
                    data-testid={`nav-${it.key}`}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
                      active
                        ? "bg-blue-50 text-blue-700 font-semibold shadow-xs"
                        : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 font-medium"
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${active ? "text-blue-600" : "text-slate-400"}`} />
                    <span className="truncate">{it.label}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-200 bg-slate-50/50">
        <div className="px-3 py-2 text-xs text-slate-500">
          <div className="font-semibold text-slate-900 truncate">{user?.name}</div>
          <div className="truncate text-slate-500 font-medium">{user?.role}</div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-slate-600 hover:text-red-600 hover:bg-red-50 text-xs font-medium"
          onClick={async () => { await logout(); nav("/login"); }}
          data-testid="logout-btn"
        >
          <LogOut className="w-4 h-4" /> Logout
        </Button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — always visible on desktop, slide-in on mobile */}
      <aside
        className={`fixed lg:sticky top-0 z-40 h-screen w-64 bg-white border-r border-slate-200 flex flex-col transition-transform duration-300 ease-in-out ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
        data-testid="sidebar"
      >
        {sidebarContent}
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0">
        <TrialBanner />
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200">
          <div className="px-4 lg:px-8 py-3 flex items-center justify-between gap-4">
            {/* Hamburger — only shown on mobile */}
            <button
              className="lg:hidden p-2 rounded-md text-slate-600 hover:bg-slate-100"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Breadcrumb section indicator */}
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 font-medium">
              <span className="text-slate-400 font-semibold tracking-wider uppercase text-[10px]">
                {navSections.find(s => s.items.some(i => pathname.startsWith(i.to)))?.title || "SOLARIX 2.0"}
              </span>
              <span className="text-slate-300">/</span>
              <span className="text-slate-800 font-semibold truncate">
                {navSections.flatMap(s => s.items).find(i => pathname.startsWith(i.to))?.label || "Operations"}
              </span>
            </div>

            <div className="ml-auto flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => nav("/pricing")}
                className="bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200 font-semibold text-xs gap-1.5 rounded-xl shadow-2xs transition"
                data-testid="header-upgrade-btn"
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="hidden sm:inline">Upgrade / Change Plan</span>
                <span className="sm:hidden">Upgrade</span>
              </Button>
              <GlobalSearch />
              <NotificationBell />
              <ProfileMenu />
            </div>
          </div>
        </header>

        <div className="px-4 lg:px-8 py-4 lg:py-6 overflow-x-hidden">{children}</div>
        <AppFeedback />
      </main>
    </div>
  );
}
