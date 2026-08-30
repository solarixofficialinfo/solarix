import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Layers, Plus, Search, MapPin, Sun, Zap, Calendar, ArrowRight,
  FileDown, Trash2, Edit3, Sparkles, Building2, User, RefreshCw, Box
} from "lucide-react";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";

export default function SolarDesignerIndex() {
  const nav = useNavigate();
  const [designs, setDesigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  const fetchDesigns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/solar-designer/designs${search ? `?search=${encodeURIComponent(search)}` : ""}`);
      setDesigns(res.data?.designs || []);
    } catch (err) {
      toast.error("Failed to fetch designs: " + formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(fetchDesigns, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchDesigns, search]);

  const handleDelete = async (id, name, e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete Solar Design "${name}"?\n\nThis action cannot be undone.`)) {
      return;
    }
    setDeletingId(id);
    try {
      await api.delete(`/solar-designer/designs/${id}`);
      setDesigns((prev) => prev.filter((d) => d.id !== id));
      toast.success("Solar design deleted successfully.");
    } catch (err) {
      toast.error("Delete failed: " + formatApiError(err));
    } finally {
      setDeletingId(null);
    }
  };

  const handleExportPdf = async (d, e) => {
    e.stopPropagation();
    try {
      const res = await api.post(`/solar-designer/designs/${d.id}/export-pdf`, d, {
        responseType: "blob",
      });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Solar_Design_${(d.site_name || "Report").replace(/\s+/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      toast.success("PDF exported successfully!");
    } catch (err) {
      toast.error("Export error: " + formatApiError(err));
    }
  };

  const totalKw = designs.reduce((acc, d) => acc + (Number(d.system_kw) || 0), 0);
  const totalPanels = designs.reduce((acc, d) => acc + (Number(d.panel_count) || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Outfit" }}>
                3D Solar Designer
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Geospatial rooftop modeling, automated panel layout, 3D simulation, and preliminary engineering reports.
              </p>
            </div>
          </div>
        </div>

        <Button
          onClick={() => nav("/solar-designer/new")}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-10 rounded-xl shadow-xs gap-2 px-4 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>+ New 3D Design</span>
        </Button>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="rounded-2xl border-slate-200 shadow-2xs bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Total Designs</span>
              <span className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>{designs.length}</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-2xs bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Total DC Capacity</span>
              <span className="text-2xl font-bold text-blue-700" style={{ fontFamily: "Outfit" }}>{totalKw.toFixed(1)} kWp</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Sun className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-2xs bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Total PV Modules</span>
              <span className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>{totalPanels.toLocaleString()}</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Zap className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-2xs bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Engineering Engine</span>
              <span className="text-base font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>3D WebGL / GPS</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Box className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search designs by site name, client, address, or ref number..."
          className="h-10 pl-10 pr-4 text-xs font-medium bg-white rounded-xl shadow-xs"
        />
      </div>

      {/* Designs Grid */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[30vh] text-slate-400 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin mr-2 text-blue-600" /> Loading solar rooftop designs...
        </div>
      ) : designs.length === 0 ? (
        <Card className="rounded-2xl border-dashed border-2 border-slate-200 bg-slate-50/50 p-12 text-center">
          <div className="max-w-md mx-auto space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mx-auto shadow-xs">
              <Layers className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>No Solar Designs Yet</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Create your first rooftop solar project. Search site address, draw boundary on satellite view, auto-place panels, and generate 3D simulations.
            </p>
            <Button
              onClick={() => nav("/solar-designer/new")}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-9 rounded-xl shadow-sm gap-2 mt-2"
            >
              <Plus className="w-4 h-4" /> Create First 3D Rooftop Design
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {designs.map((d) => (
            <Card
              key={d.id}
              onClick={() => nav(`/solar-designer/${d.id}`)}
              className="group rounded-2xl border-slate-200 bg-white hover:border-blue-300 hover:shadow-md transition-all cursor-pointer overflow-hidden flex flex-col justify-between"
            >
              <div className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition" style={{ fontFamily: "Outfit" }}>
                      {d.site_name || "Solar Rooftop Design"}
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5 mt-0.5">
                      <User className="w-3 h-3 text-slate-400" />
                      <span>{d.client_name || "Direct Client"}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200 shrink-0 font-semibold">
                    {d.design_number || `v${d.version || 1}`}
                  </Badge>
                </div>

                <div className="text-xs text-slate-600 line-clamp-1 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{d.formatted_address || d.address || "Location set"}</span>
                </div>

                {/* Metric Badges */}
                <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200/70 text-center text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block">CAPACITY</span>
                    <span className="font-bold text-blue-700">{Number(d.system_kw || 0).toFixed(2)} kWp</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">PANELS</span>
                    <span className="font-bold text-slate-900">{d.panel_count || (d.panels || []).length} Nos</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">ROOF AREA</span>
                    <span className="font-bold text-slate-900">{Number(d.roof_area_sqm || 0).toFixed(0)} m²</span>
                  </div>
                </div>
              </div>

              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs">
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {(d.updated_at || d.created_at || "").slice(0, 10)}
                </span>

                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => handleExportPdf(d, e)}
                    className="h-7 px-2 text-slate-600 hover:text-blue-600 rounded-lg text-xs"
                    title="Export PDF Report"
                  >
                    <FileDown className="w-3.5 h-3.5 text-red-600 mr-1" /> PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => handleDelete(d.id, d.site_name, e)}
                    disabled={deletingId === d.id}
                    className="h-7 w-7 p-0 text-slate-400 hover:text-red-600 rounded-lg"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
