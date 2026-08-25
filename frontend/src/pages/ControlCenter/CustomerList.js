import React, { useEffect, useState, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, Building2, User, Phone, Mail, Calendar, Eye, Filter, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import PlanBadge from "@/components/PlanBadge";

export default function CustomerList() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const navigate = useNavigate();

  const fetchCustomers = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else if (customers.length === 0) setLoading(true);
    try {
      const res = await api.get("/platform-owner/customers", {
        params: { search, status: statusFilter, plan: planFilter }
      });
      setCustomers(res.data || []);
    } catch (err) {
      console.error("Failed to fetch customers:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, statusFilter, planFilter, customers.length]);

  useEffect(() => {
    fetchCustomers(false);
  }, [statusFilter, planFilter, fetchCustomers]);

  useEffect(() => {
    // Auto-refresh every 12 seconds
    const interval = setInterval(() => {
      fetchCustomers(false);
    }, 12000);

    const handleFocus = () => fetchCustomers(false);
    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [fetchCustomers]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchCustomers(true);
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Customer Workspaces Directory</h2>
          <p className="text-xs text-slate-400">Manage all registered Solar EPC companies, subscriptions, and usage in real-time.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchCustomers(true)}
            disabled={refreshing}
            className="border-slate-800 text-slate-300 hover:bg-slate-900 text-xs h-8 gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-blue-400" : ""}`} />
            <span>Refresh</span>
          </Button>
          <Badge variant="outline" className="bg-blue-500/10 text-blue-300 border-blue-500/30 font-mono text-xs self-start sm:self-auto h-8 px-3 flex items-center">
            {customers.length} Workspaces
          </Badge>
        </div>
      </div>

      {/* SEARCH AND FILTERS BAR */}
      <Card className="bg-slate-950/60 border-slate-800 p-4">
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-2 relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Company, Owner, Email, Mobile, Workspace ID..."
              className="pl-9 h-9 text-xs bg-slate-900 border-slate-700 text-white placeholder-slate-500"
            />
          </div>

          <div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 text-xs bg-slate-900 border-slate-700 text-slate-200"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700 text-white text-xs">
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="trialing">Trialing</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="h-9 text-xs bg-slate-900 border-slate-700 text-slate-200"><SelectValue placeholder="Plan" /></SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700 text-white text-xs">
                <SelectItem value="all">All Plans</SelectItem>
                <SelectItem value="starter">STARTER</SelectItem>
                <SelectItem value="growth">GROWTH</SelectItem>
                <SelectItem value="pro">PRO</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </form>
      </Card>

      {/* CUSTOMERS TABLE */}
      <Card className="bg-slate-950/60 border-slate-800 overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Company / Workspace</th>
                <th className="px-4 py-3">Owner Contact</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-center">Users</th>
                <th className="px-4 py-3 text-center">Projects</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {loading && (
                <tr><td colSpan={8} className="p-8 text-center text-slate-400 font-mono">Loading customer records...</td></tr>
              )}
              {!loading && customers.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center text-slate-500 font-mono">No customers found matching current filters.</td></tr>
              )}
              {!loading && customers.map((c) => (
                <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3 font-semibold text-white">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-blue-400 shrink-0" />
                      <div>
                        <div>{c.company_name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{c.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-slate-200 font-medium">{c.owner_name}</div>
                    <div className="text-[11px] text-slate-400 font-mono">{c.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <PlanBadge planId={c.plan_id} />
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={
                        c.subscription_status === "active"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          : c.subscription_status === "suspended"
                          ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                          : "bg-amber-500/10 text-amber-300 border-amber-500/30"
                      }
                    >
                      {c.subscription_status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-center font-mono">{c.user_count}</td>
                  <td className="px-4 py-3 text-center font-mono">{c.project_count}</td>
                  <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">
                    {c.created_at ? new Date(c.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="xs"
                      onClick={() => navigate(`/control-center/customers/${c.id}`)}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" /> Details
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* MOBILE CARDS */}
        <div className="md:hidden divide-y divide-slate-800 p-3 space-y-3">
          {customers.map((c) => (
            <div key={c.id} className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-sm">{c.company_name}</span>
                <Badge variant="outline" className="bg-blue-500/10 text-blue-300 border-blue-500/30 text-[10px]">
                  {c.subscription_status}
                </Badge>
              </div>

              <div className="text-slate-400 font-mono text-[11px] space-y-0.5">
                <div>Owner: {c.owner_name}</div>
                <div>Email: {c.email}</div>
                <div>Plan: {c.plan_id.toUpperCase()}</div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                <span className="text-[10px] text-slate-500 font-mono">Users: {c.user_count} • Projects: {c.project_count}</span>
                <Button size="xs" onClick={() => navigate(`/control-center/customers/${c.id}`)} className="bg-blue-600 hover:bg-blue-700 text-xs">
                  View Workspace
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
