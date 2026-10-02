import React, { useState, useEffect } from "react";
import api from "@/lib/api";
import {
  Users,
  Search,
  Filter,
  Download,
  Upload,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Check,
  ShieldCheck,
  Tag
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function WhatsAppContacts() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [optInFilter, setOptInFilter] = useState("all");
  const [search, setSearch] = useState("");

  const fetchContacts = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/whatsapp/contacts?opt_in=${optInFilter}&search=${encodeURIComponent(search)}`);
      setContacts(res.data?.contacts || []);
    } catch (e) {
      console.error("Failed to load contacts", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optInFilter]);

  const handleToggleOptIn = async (contactId, currentStatus) => {
    const nextStatus = currentStatus === "opted_in" ? "opted_out" : "opted_in";
    try {
      await api.put(`/whatsapp/contacts/${contactId}/opt-in`, { opt_in_status: nextStatus });
      toast.success(`Contact opt-in changed to ${nextStatus === "opted_in" ? "Opted In" : "Opted Out"}`);
      setContacts((prev) =>
        prev.map((c) => (c.id === contactId ? { ...c, opt_in_status: nextStatus } : c))
      );
    } catch (e) {
      toast.error("Failed to update opt-in status");
    }
  };

  const handleExportCSV = () => {
    const headers = ["Name", "Phone", "City", "Solar KW", "Customer Type", "Opt-in Status", "Last Contacted"];
    const rows = contacts.map((c) => [
      `"${c.name}"`,
      `"${c.phone}"`,
      `"${c.city}"`,
      `"${c.solar_kw}"`,
      `"${c.customer_type}"`,
      `"${c.opt_in_status}"`,
      `"${c.last_contacted}"`,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `solarix_whatsapp_contacts_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Contacts exported to CSV");
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
            WhatsApp Contacts Directory
          </h2>
          <p className="text-xs text-slate-500">
            Unified Solarix CRM customer database with WhatsApp consent and opt-in tracking.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleExportCSV} className="text-xs h-9 gap-1.5 bg-white">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </Button>
          <Button size="sm" variant="outline" onClick={fetchContacts} className="text-xs h-9">
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
            <Input
              placeholder="Search by customer name or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchContacts()}
              className="pl-8 text-xs h-9 bg-slate-50 border-slate-200"
            />
          </div>

          <div className="w-40">
            <select
              value={optInFilter}
              onChange={(e) => setOptInFilter(e.target.value)}
              className="w-full text-xs h-9 px-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700"
            >
              <option value="all">All Opt-in Statuses</option>
              <option value="opted_in">Opted In Only</option>
              <option value="opted_out">Opted Out</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>
        </div>

        <div className="text-xs text-slate-500 font-medium">
          Showing <span className="font-bold text-slate-900">{contacts.length}</span> verified contacts
        </div>
      </div>

      {/* Contacts Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-3.5">Customer Name</th>
                <th className="p-3.5">Phone Number</th>
                <th className="p-3.5">City</th>
                <th className="p-3.5">Solar kW</th>
                <th className="p-3.5">Customer Type</th>
                <th className="p-3.5">Last Message</th>
                <th className="p-3.5">Opt-in Status</th>
                <th className="p-3.5">Last Contacted</th>
                <th className="p-3.5">Tags</th>
                <th className="p-3.5 text-right">Consent Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="p-3.5 font-bold text-slate-900">{c.name}</td>
                  <td className="p-3.5 font-mono text-slate-600">{c.phone}</td>
                  <td className="p-3.5 text-slate-600">{c.city}</td>
                  <td className="p-3.5 font-semibold text-slate-800">{c.solar_kw}</td>
                  <td className="p-3.5">
                    <Badge variant="outline" className="text-[10px]">
                      {c.customer_type}
                    </Badge>
                  </td>
                  <td className="p-3.5 text-slate-500 truncate max-w-[150px]">{c.last_message}</td>
                  <td className="p-3.5">
                    {c.opt_in_status === "opted_in" ? (
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px] gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Opted In
                      </Badge>
                    ) : c.opt_in_status === "opted_out" ? (
                      <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px] gap-1">
                        <XCircle className="w-3 h-3" /> Opted Out
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-slate-500 text-[10px]">
                        Unknown
                      </Badge>
                    )}
                  </td>
                  <td className="p-3.5 text-slate-500">{c.last_contacted}</td>
                  <td className="p-3.5">
                    <div className="flex flex-wrap gap-1">
                      {(c.tags || []).map((tag, i) => (
                        <span key={i} className="px-1.5 py-0.5 rounded text-[9px] bg-slate-100 text-slate-600 font-medium">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-3.5 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleToggleOptIn(c.id, c.opt_in_status)}
                      className={`h-7 px-2 text-xs font-semibold ${
                        c.opt_in_status === "opted_in"
                          ? "text-red-600 hover:text-red-700 hover:bg-red-50"
                          : "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                      }`}
                    >
                      {c.opt_in_status === "opted_in" ? "Revoke Opt-in" : "Grant Opt-in"}
                    </Button>
                  </td>
                </tr>
              ))}
              {contacts.length === 0 && !loading && (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-400 italic">
                    No contacts found. Solarix syncs verified contacts directly from your Clients and Leads.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
