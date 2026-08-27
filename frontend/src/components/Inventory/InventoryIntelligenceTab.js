import React, { useState, useEffect, useMemo, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Boxes,
  Layers,
  ArrowUpFromLine,
  Percent,
  Hash,
  AlertTriangle,
  AlertOctagon,
  Download,
  Filter,
  X,
  Search,
  CheckCircle2,
  Building2,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { toast } from "sonner";
import { useEntitlements } from "@/hooks/useEntitlements";

const TIME_RANGE_PRESETS = [
  { value: "all", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "last_3_months", label: "Last 3 Months" },
  { value: "this_year", label: "This Year" },
];

export default function InventoryIntelligenceTab({ globalSearch = "" }) {
  const { hasFeature } = useEntitlements();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [data, setData] = useState(null);

  // Filters State
  const [timeRange, setTimeRange] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedBrand, setSelectedBrand] = useState("all");
  const [selectedClient, setSelectedClient] = useState("all");
  const [selectedProject, setSelectedProject] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [serialSearch, setSerialSearch] = useState(globalSearch);

  // View switchers
  const [trendView, setTrendView] = useState("daily"); // daily | monthly
  const [siteMetric, setSiteMetric] = useState("quantity"); // quantity | products | serials

  // Drill-down Modal State
  const [drilldownProduct, setDrilldownProduct] = useState(null);

  useEffect(() => {
    if (globalSearch) {
      setSerialSearch(globalSearch);
    }
  }, [globalSearch]);

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        time_range: timeRange,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        product: selectedProduct !== "all" ? selectedProduct : undefined,
        category: selectedCategory !== "all" ? selectedCategory : undefined,
        brand: selectedBrand !== "all" ? selectedBrand : undefined,
        client: selectedClient !== "all" ? selectedClient : undefined,
        project: selectedProject !== "all" ? selectedProject : undefined,
        status: selectedStatus !== "all" ? selectedStatus : undefined,
        serial_number: serialSearch || undefined,
      };

      const res = await api.get("/inventory/intelligence", { params });
      setData(res.data);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [
    timeRange,
    fromDate,
    toDate,
    selectedProduct,
    selectedCategory,
    selectedBrand,
    selectedClient,
    selectedProject,
    selectedStatus,
    serialSearch,
  ]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleClearFilters = () => {
    setTimeRange("all");
    setFromDate("");
    setToDate("");
    setSelectedProduct("all");
    setSelectedCategory("all");
    setSelectedBrand("all");
    setSelectedClient("all");
    setSelectedProject("all");
    setSelectedStatus("all");
    setSerialSearch("");
  };

  const hasActiveFilters = useMemo(() => {
    return (
      timeRange !== "all" ||
      !!fromDate ||
      !!toDate ||
      selectedProduct !== "all" ||
      selectedCategory !== "all" ||
      selectedBrand !== "all" ||
      selectedClient !== "all" ||
      selectedProject !== "all" ||
      selectedStatus !== "all" ||
      !!serialSearch
    );
  }, [
    timeRange,
    fromDate,
    toDate,
    selectedProduct,
    selectedCategory,
    selectedBrand,
    selectedClient,
    selectedProject,
    selectedStatus,
    serialSearch,
  ]);

  const handleExportCsv = async () => {
    if (!hasFeature("export")) {
      toast.error("Export is not enabled in your current plan.");
      return;
    }
    try {
      setExporting(true);
      const params = {
        time_range: timeRange,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        product: selectedProduct !== "all" ? selectedProduct : undefined,
        category: selectedCategory !== "all" ? selectedCategory : undefined,
        brand: selectedBrand !== "all" ? selectedBrand : undefined,
        client: selectedClient !== "all" ? selectedClient : undefined,
        project: selectedProject !== "all" ? selectedProject : undefined,
        status: selectedStatus !== "all" ? selectedStatus : undefined,
        serial_number: serialSearch || undefined,
      };

      const res = await api.get("/inventory/intelligence/export-csv", {
        params,
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `solarix-inventory-intelligence-${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      toast.success("Intelligence analytics CSV exported successfully");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setExporting(false);
    }
  };

  const summary = data?.summary || {};
  const materialUtilization = data?.material_utilization || [];
  const productPerformance = data?.product_performance || [];
  const serialStatusDist = data?.serial_status_distribution || [];
  const serialItems = data?.serial_items || [];
  const sitePerformance = data?.site_performance || [];
  const movementTrends = trendView === "daily" ? (data?.movement_trend_daily || []) : (data?.movement_trend_monthly || []);
  const stockHealth = data?.stock_health || { healthy_count: 0, low_stock_count: 0, out_of_stock_count: 0, distribution: [] };
  const topRankings = data?.top_rankings || {};
  const slowMovingItems = data?.slow_moving_items || [];
  const anomaliesAlerts = data?.anomalies_alerts || [];
  const filterOptions = data?.filter_options || { categories: [], brands: [], products: [], clients: [], projects: [], statuses: [] };

  return (
    <div className="space-y-6 pb-12" data-testid="inventory-intelligence-tab">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-xl p-5 shadow-sm border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-300" /> Pro Enterprise Feature
            </span>
            <span className="text-xs text-slate-400">· Real-Time Operational Intelligence</span>
          </div>
          <h2 className="text-xl font-bold mt-1 text-white tracking-tight" style={{ fontFamily: "Outfit" }}>
            Inventory Intelligence & Asset Analytics
          </h2>
          <p className="text-xs text-slate-300 mt-0.5">
            Turn inventory movements and serial data into actionable operational insights for solar EPC operations.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAnalytics}
            disabled={loading}
            className="bg-white/10 hover:bg-white/20 text-white border-white/20 h-8 text-xs"
            data-testid="refresh-intelligence-btn"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={handleExportCsv}
            disabled={exporting || !hasFeature("export")}
            className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold h-8 text-xs shadow-sm"
            data-testid="export-intelligence-csv-btn"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            {exporting ? "Exporting…" : "Export Intelligence CSV"}
          </Button>
        </div>
      </div>

      {/* Top Filter Bar */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardContent className="p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Filter className="w-3.5 h-3.5 text-indigo-600" />
              <span>Multi-Dimensional Analytics Filters</span>
              {hasActiveFilters && (
                <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 text-[10px] ml-1">
                  Active Filters
                </Badge>
              )}
            </div>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                className="h-7 text-xs text-slate-500 hover:text-slate-900"
                data-testid="clear-intelligence-filters-btn"
              >
                <X className="w-3 h-3 mr-1" />
                Clear All Filters
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-2">
            {/* Date Preset */}
            <div>
              <label className="text-[10px] font-medium text-slate-500 block mb-1">Time Range</label>
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="h-8 text-xs bg-slate-50/70 border-slate-200">
                  <SelectValue placeholder="Range" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_RANGE_PRESETS.map((p) => (
                    <SelectItem key={p.value} value={p.value} className="text-xs">
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Category */}
            <div>
              <label className="text-[10px] font-medium text-slate-500 block mb-1">Category</label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="h-8 text-xs bg-slate-50/70 border-slate-200">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs font-semibold">All Categories</SelectItem>
                  {filterOptions.categories.map((c) => (
                    <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Product */}
            <div>
              <label className="text-[10px] font-medium text-slate-500 block mb-1">Product</label>
              <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                <SelectTrigger className="h-8 text-xs bg-slate-50/70 border-slate-200">
                  <SelectValue placeholder="All Products" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs font-semibold">All Products</SelectItem>
                  {filterOptions.products.map((p) => (
                    <SelectItem key={p.id} value={p.name} className="text-xs">
                      {p.name} {p.size ? `(${p.size})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Brand */}
            <div>
              <label className="text-[10px] font-medium text-slate-500 block mb-1">Brand</label>
              <Select value={selectedBrand} onValueChange={setSelectedBrand}>
                <SelectTrigger className="h-8 text-xs bg-slate-50/70 border-slate-200">
                  <SelectValue placeholder="All Brands" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs font-semibold">All Brands</SelectItem>
                  {filterOptions.brands.map((b) => (
                    <SelectItem key={b} value={b} className="text-xs">{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Client */}
            <div>
              <label className="text-[10px] font-medium text-slate-500 block mb-1">Client</label>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger className="h-8 text-xs bg-slate-50/70 border-slate-200">
                  <SelectValue placeholder="All Clients" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs font-semibold">All Clients</SelectItem>
                  {filterOptions.clients.map((c) => (
                    <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Project / Site */}
            <div>
              <label className="text-[10px] font-medium text-slate-500 block mb-1">Project / Site</label>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger className="h-8 text-xs bg-slate-50/70 border-slate-200">
                  <SelectValue placeholder="All Sites" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs font-semibold">All Sites</SelectItem>
                  {filterOptions.projects.map((pr) => (
                    <SelectItem key={pr} value={pr} className="text-xs">{pr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Serial Status */}
            <div>
              <label className="text-[10px] font-medium text-slate-500 block mb-1">Asset Status</label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="h-8 text-xs bg-slate-50/70 border-slate-200">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs font-semibold">All Statuses</SelectItem>
                  {filterOptions.statuses.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Serial Search */}
            <div>
              <label className="text-[10px] font-medium text-slate-500 block mb-1">Serial Number</label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Scan / Type SN"
                  value={serialSearch}
                  onChange={(e) => setSerialSearch(e.target.value)}
                  className="h-8 pl-8 text-xs bg-slate-50/70 border-slate-200"
                  data-testid="serial-filter-input"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SECTION 1: Executive KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="intelligence-kpi-grid">
        {/* Total Products */}
        <Card className="border-slate-200 hover:border-slate-300 transition-all bg-white shadow-sm">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[11px] font-medium uppercase tracking-wider">Master Items</span>
              <Boxes className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 tabular-nums" style={{ fontFamily: "Outfit" }}>
              {summary.total_products ?? 0}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Active SKUs cataloged</div>
          </CardContent>
        </Card>

        {/* Current Available Stock Units */}
        <Card className="border-slate-200 hover:border-slate-300 transition-all bg-white shadow-sm">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[11px] font-medium uppercase tracking-wider">Available Stock</span>
              <Layers className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold text-emerald-700 tabular-nums" style={{ fontFamily: "Outfit" }}>
              {Number(summary.total_units || 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Physical on-hand units</div>
          </CardContent>
        </Card>

        {/* Total Issued in Period */}
        <Card className="border-slate-200 hover:border-slate-300 transition-all bg-white shadow-sm">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[11px] font-medium uppercase tracking-wider">Issued / Outward</span>
              <ArrowUpFromLine className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl font-bold text-amber-700 tabular-nums" style={{ fontFamily: "Outfit" }}>
              {Number(summary.total_issued || 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Dispatched to sites</div>
          </CardContent>
        </Card>

        {/* Utilization Rate */}
        <Card className="border-slate-200 hover:border-slate-300 transition-all bg-white shadow-sm">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[11px] font-medium uppercase tracking-wider">Utilization %</span>
              <Percent className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="text-2xl font-bold text-indigo-700 tabular-nums" style={{ fontFamily: "Outfit" }}>
              {summary.utilization_pct ?? 0}%
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Dispatched vs received</div>
          </CardContent>
        </Card>

        {/* Serialized Assets */}
        <Card className="border-slate-200 hover:border-slate-300 transition-all bg-white shadow-sm">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[11px] font-medium uppercase tracking-wider">Tracked Serials</span>
              <Hash className="w-4 h-4 text-violet-600" />
            </div>
            <div className="text-2xl font-bold text-violet-700 tabular-nums" style={{ fontFamily: "Outfit" }}>
              {summary.total_serialized_assets ?? 0}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {summary.serials_in_stock ?? 0} stock · {summary.serials_issued ?? 0} out
            </div>
          </CardContent>
        </Card>

        {/* Stock Alerts / Low Stock */}
        <Card className="border-slate-200 hover:border-slate-300 transition-all bg-white shadow-sm">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[11px] font-medium uppercase tracking-wider">Attention Needed</span>
              <AlertTriangle className="w-4 h-4 text-red-600" />
            </div>
            <div className="text-2xl font-bold text-red-700 tabular-nums" style={{ fontFamily: "Outfit" }}>
              {(summary.low_stock_count || 0) + (summary.serials_damaged || 0)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {summary.low_stock_count ?? 0} low stock · {summary.serials_damaged ?? 0} damaged
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SECTION 2 & 8: Inventory Movement Trend & Material Utilization */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Movement Trend Chart (7 cols) */}
        <Card className="lg:col-span-7 border-slate-200 shadow-sm bg-white">
          <CardHeader className="p-4 pb-2 border-b border-slate-100 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>
                Inventory Movement Trend
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Inward receipts vs Outward site dispatches over time
              </CardDescription>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg">
              <Button
                variant={trendView === "daily" ? "default" : "ghost"}
                size="sm"
                onClick={() => setTrendView("daily")}
                className={`h-6 text-[11px] px-2.5 rounded-md ${trendView === "daily" ? "bg-white text-slate-900 shadow-xs hover:bg-white" : "text-slate-600"}`}
              >
                Daily (30D)
              </Button>
              <Button
                variant={trendView === "monthly" ? "default" : "ghost"}
                size="sm"
                onClick={() => setTrendView("monthly")}
                className={`h-6 text-[11px] px-2.5 rounded-md ${trendView === "monthly" ? "bg-white text-slate-900 shadow-xs hover:bg-white" : "text-slate-600"}`}
              >
                Monthly (6M)
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-4">
            {movementTrends.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-xs text-slate-400">
                No transaction data available for this timeframe
              </div>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={movementTrends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="inwardGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="outwardGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f172a", borderRadius: "8px", border: "none", color: "#fff", fontSize: "11px" }}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                    <Area type="monotone" dataKey="received" name="Received (Inward)" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#inwardGrad)" />
                    <Area type="monotone" dataKey="issued" name="Issued (Outward)" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#outwardGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Material Utilization Breakdown (5 cols) */}
        <Card className="lg:col-span-5 border-slate-200 shadow-sm bg-white">
          <CardHeader className="p-4 pb-2 border-b border-slate-100">
            <CardTitle className="text-sm font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>
              Material Category Utilization
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Dispatched vs Available by equipment category
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-3 space-y-3">
            {materialUtilization.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-xs text-slate-400">
                No material categories recorded
              </div>
            ) : (
              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {materialUtilization.map((mu) => (
                  <div key={mu.category} className="p-2 rounded-lg bg-slate-50/70 border border-slate-100">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-slate-800">{mu.category}</span>
                      <span className="font-bold text-indigo-700">{mu.utilization_pct}% utilized</span>
                    </div>
                    {/* Progress bar */}
                    <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full ${
                          mu.utilization_pct >= 75 ? "bg-emerald-500" : mu.utilization_pct >= 35 ? "bg-indigo-500" : "bg-amber-500"
                        }`}
                        style={{ width: `${Math.min(mu.utilization_pct, 100)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1">
                      <span>Received: {Number(mu.received).toLocaleString()}</span>
                      <span>Issued: {Number(mu.issued).toLocaleString()}</span>
                      <span className="font-medium text-slate-700">Available: {Number(mu.available).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* SECTION 3 & 5: Product Performance & Serial Status Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Product Performance Table (8 cols) */}
        <Card className="lg:col-span-8 border-slate-200 shadow-sm bg-white">
          <CardHeader className="p-4 pb-2 border-b border-slate-100 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>
                Product-Level Utilization & Performance
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Click any product row to view detailed serial analytics & project distributions
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-slate-600 text-xs font-normal">
              {productPerformance.length} items
            </Badge>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[380px]">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Product Name</th>
                    <th className="px-2 py-2.5 font-semibold">Brand</th>
                    <th className="px-2 py-2.5 font-semibold">Category</th>
                    <th className="px-2 py-2.5 text-right font-semibold">Received</th>
                    <th className="px-2 py-2.5 text-right font-semibold">Issued</th>
                    <th className="px-2 py-2.5 text-right font-semibold">Available</th>
                    <th className="px-2 py-2.5 text-center font-semibold">Utilization</th>
                    <th className="px-2 py-2.5 text-center font-semibold">Sites</th>
                    <th className="px-2 py-2.5 text-center font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {productPerformance.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-xs text-slate-400">
                        No product performance records match filters
                      </td>
                    </tr>
                  ) : (
                    productPerformance.map((p) => (
                      <tr
                        key={p.id || p.product}
                        onClick={() => setDrilldownProduct(p)}
                        className="hover:bg-indigo-50/50 cursor-pointer transition-colors"
                        data-testid={`product-perf-row-${p.id}`}
                      >
                        <td className="px-3 py-2">
                          <div className="font-semibold text-slate-900">{p.product}</div>
                          {p.size && <div className="text-[10px] text-slate-500">{p.size}</div>}
                        </td>
                        <td className="px-2 py-2 text-slate-600">{p.brand || "—"}</td>
                        <td className="px-2 py-2 text-slate-600">{p.category}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-slate-600">{Number(p.total_received).toLocaleString()}</td>
                        <td className="px-2 py-2 text-right tabular-nums font-semibold text-amber-700">{Number(p.total_issued).toLocaleString()}</td>
                        <td className="px-2 py-2 text-right tabular-nums font-bold text-emerald-700">{Number(p.available).toLocaleString()}</td>
                        <td className="px-2 py-2 text-center tabular-nums">
                          <span className="font-semibold text-indigo-700">{p.utilization_pct}%</span>
                        </td>
                        <td className="px-2 py-2 text-center text-slate-600">{p.projects_count}</td>
                        <td className="px-2 py-2 text-center">
                          <Badge
                            variant="secondary"
                            className={`text-[10px] px-1.5 py-0 ${
                              p.stock_status === "Normal"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : p.stock_status === "Low Stock"
                                ? "bg-amber-50 text-amber-700 border border-amber-200"
                                : "bg-red-50 text-red-700 border border-red-200"
                            }`}
                          >
                            {p.stock_status}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Serial Status Distribution (4 cols) */}
        <Card className="lg:col-span-4 border-slate-200 shadow-sm bg-white">
          <CardHeader className="p-4 pb-2 border-b border-slate-100">
            <CardTitle className="text-sm font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>
              Serialized Asset Distribution
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Current lifecycle status of serialized solar assets
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            {serialStatusDist.every((s) => s.count === 0) ? (
              <div className="h-64 flex items-center justify-center text-xs text-slate-400">
                No serialized equipment recorded
              </div>
            ) : (
              <div className="space-y-4">
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={serialStatusDist.filter((s) => s.count > 0)}
                        dataKey="count"
                        nameKey="status"
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={70}
                        paddingAngle={2}
                      >
                        {serialStatusDist.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: "#0f172a", borderRadius: "8px", border: "none", color: "#fff", fontSize: "11px" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  {serialStatusDist.map((st) => (
                    <div key={st.status} className="flex items-center justify-between p-1.5 rounded bg-slate-50 border border-slate-100">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: st.color }} />
                        <span className="text-slate-700 text-[11px] truncate">{st.status}</span>
                      </div>
                      <span className="font-semibold text-slate-900 text-[11px] tabular-nums">
                        {st.count} ({st.pct}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* SECTION 6 & 9: Site Consumption & Stock Health */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Site / Project Consumption (7 cols) */}
        <Card className="lg:col-span-7 border-slate-200 shadow-sm bg-white">
          <CardHeader className="p-4 pb-2 border-b border-slate-100 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>
                Site & Project Material Consumption
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Ranking sites consuming solar materials & serialized equipment
              </CardDescription>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg">
              <Button
                variant={siteMetric === "quantity" ? "default" : "ghost"}
                size="sm"
                onClick={() => setSiteMetric("quantity")}
                className={`h-6 text-[10px] px-2 rounded-md ${siteMetric === "quantity" ? "bg-white text-slate-900 shadow-xs hover:bg-white" : "text-slate-600"}`}
              >
                Quantity
              </Button>
              <Button
                variant={siteMetric === "products" ? "default" : "ghost"}
                size="sm"
                onClick={() => setSiteMetric("products")}
                className={`h-6 text-[10px] px-2 rounded-md ${siteMetric === "products" ? "bg-white text-slate-900 shadow-xs hover:bg-white" : "text-slate-600"}`}
              >
                Products
              </Button>
              <Button
                variant={siteMetric === "serials" ? "default" : "ghost"}
                size="sm"
                onClick={() => setSiteMetric("serials")}
                className={`h-6 text-[10px] px-2 rounded-md ${siteMetric === "serials" ? "bg-white text-slate-900 shadow-xs hover:bg-white" : "text-slate-600"}`}
              >
                Serials
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[300px]">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Site / Project</th>
                    <th className="px-2 py-2.5 font-semibold">Client</th>
                    <th className="px-2 py-2.5 text-right font-semibold">Qty Issued</th>
                    <th className="px-2 py-2.5 text-center font-semibold">Products</th>
                    <th className="px-2 py-2.5 text-center font-semibold">Serials</th>
                    <th className="px-2 py-2.5 text-right font-semibold">Last Activity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sitePerformance.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-400">
                        No site material dispatches recorded
                      </td>
                    </tr>
                  ) : (
                    sitePerformance.map((sp) => (
                      <tr key={sp.site_name} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-3 py-2 font-semibold text-slate-900 flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span className="truncate">{sp.site_name}</span>
                        </td>
                        <td className="px-2 py-2 text-slate-600 truncate">{sp.client_name}</td>
                        <td className="px-2 py-2 text-right tabular-nums font-bold text-amber-700">
                          {Number(sp.materials_issued_qty).toLocaleString()}
                        </td>
                        <td className="px-2 py-2 text-center text-slate-600">{sp.products_used_count}</td>
                        <td className="px-2 py-2 text-center text-slate-600">{sp.serials_count}</td>
                        <td className="px-2 py-2 text-right text-slate-500 text-[11px]">{sp.last_activity_date}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Stock Health & Reorder Thresholds (5 cols) */}
        <Card className="lg:col-span-5 border-slate-200 shadow-sm bg-white">
          <CardHeader className="p-4 pb-2 border-b border-slate-100">
            <CardTitle className="text-sm font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>
              Warehouse Stock Health
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Inventory posture against configured reorder levels
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-100 text-center">
                <div className="text-lg font-bold text-emerald-800 tabular-nums">{stockHealth.healthy_count}</div>
                <div className="text-[10px] font-medium text-emerald-700">Healthy Stock</div>
              </div>
              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-100 text-center">
                <div className="text-lg font-bold text-amber-800 tabular-nums">{stockHealth.low_stock_count}</div>
                <div className="text-[10px] font-medium text-amber-700">Low Stock</div>
              </div>
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-100 text-center">
                <div className="text-lg font-bold text-red-800 tabular-nums">{stockHealth.out_of_stock_count}</div>
                <div className="text-[10px] font-medium text-red-700">Out of Stock</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-800">Fast Moving vs Stagnant Posture</div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-600">Fast Moving Products</span>
                <span className="font-bold text-indigo-700">{topRankings.fastest_moving_products?.length || 0} active</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-600">Slow Moving / Idle Material</span>
                <span className="font-bold text-amber-700">{slowMovingItems.length} items (&gt;45 days)</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SECTION 11 & 12: Slow Moving Materials & Real Anomaly Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Slow Moving Materials (7 cols) */}
        <Card className="lg:col-span-7 border-slate-200 shadow-sm bg-white">
          <CardHeader className="p-4 pb-2 border-b border-slate-100">
            <CardTitle className="text-sm font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>
              Slow Moving & Stagnant Materials
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Items with positive stock on-hand and zero outward dispatch in 45+ days
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[260px]">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Product</th>
                    <th className="px-2 py-2.5 font-semibold">Category</th>
                    <th className="px-2 py-2.5 text-right font-semibold">Available Qty</th>
                    <th className="px-2 py-2.5 text-center font-semibold">Days Idle</th>
                    <th className="px-2 py-2.5 text-center font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {slowMovingItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-400">
                        ✓ No slow-moving stock detected. All materials are actively moving!
                      </td>
                    </tr>
                  ) : (
                    slowMovingItems.map((sm) => (
                      <tr key={sm.id || sm.product} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-3 py-2 font-medium text-slate-900">{sm.product}</td>
                        <td className="px-2 py-2 text-slate-600">{sm.category}</td>
                        <td className="px-2 py-2 text-right tabular-nums font-bold text-slate-800">
                          {Number(sm.available_qty).toLocaleString()} {sm.unit}
                        </td>
                        <td className="px-2 py-2 text-center text-amber-700 font-semibold">{sm.days_since_movement} days</td>
                        <td className="px-2 py-2 text-center">
                          <Badge variant="outline" className="text-[10px] border-amber-300 bg-amber-50 text-amber-800">
                            {sm.status}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Anomaly Alerts (5 cols) */}
        <Card className="lg:col-span-5 border-slate-200 shadow-sm bg-white">
          <CardHeader className="p-4 pb-2 border-b border-slate-100">
            <CardTitle className="text-sm font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>
              Attention Required (Operational Alerts)
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Calculated discrepancies, low thresholds & equipment flags
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3.5 space-y-2.5 max-h-[260px] overflow-y-auto">
            {anomaliesAlerts.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-1.5">
                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                <span>All stock health and serialized asset checks are optimal!</span>
              </div>
            ) : (
              anomaliesAlerts.map((al, idx) => (
                <div
                  key={idx}
                  className={`p-2.5 rounded-lg border text-xs flex items-start gap-2.5 ${
                    al.type === "danger"
                      ? "bg-red-50/70 border-red-200 text-red-900"
                      : al.type === "warning"
                      ? "bg-amber-50/70 border-amber-200 text-amber-900"
                      : "bg-blue-50/70 border-blue-200 text-blue-900"
                  }`}
                >
                  <AlertOctagon className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="font-semibold text-[11px]">{al.title}</div>
                    <div className="text-[11px] opacity-90">{al.message}</div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* SECTION 4 & 13: Serial / Asset Intelligence Global Table */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader className="p-4 pb-2 border-b border-slate-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>
              Serialized Asset Intelligence & Audit Logs
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Trace equipment by serial numbers, current location, client project & movement history
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-slate-600 text-xs font-normal">
            Showing {serialItems.length} matching serials
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[340px]">
            <table className="w-full text-xs text-left" data-testid="serialized-assets-table">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 sticky top-0 z-10 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Serial Number</th>
                  <th className="px-2 py-2.5 font-semibold">Equipment Product</th>
                  <th className="px-2 py-2.5 font-semibold">Brand / Model</th>
                  <th className="px-2 py-2.5 font-semibold">Current Status</th>
                  <th className="px-2 py-2.5 font-semibold">Location / Site</th>
                  <th className="px-2 py-2.5 font-semibold">Client</th>
                  <th className="px-2 py-2.5 font-semibold">Project</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Outward Date</th>
                  <th className="px-2 py-2.5 font-semibold">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {serialItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-xs text-slate-400">
                      No serial numbers match the active filters
                    </td>
                  </tr>
                ) : (
                  serialItems.map((sa) => (
                    <tr key={sa.serial_number} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-3 py-2 font-mono font-bold text-slate-900">{sa.serial_number}</td>
                      <td className="px-2 py-2 font-medium text-slate-800">{sa.product}</td>
                      <td className="px-2 py-2 text-slate-600">{sa.brand} {sa.model !== "—" ? `(${sa.model})` : ""}</td>
                      <td className="px-2 py-2">
                        <Badge
                          variant="secondary"
                          className={`text-[10px] px-1.5 py-0 ${
                            sa.status === "In Stock"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : sa.status === "Installed"
                              ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                              : sa.status === "Damaged"
                              ? "bg-red-50 text-red-700 border border-red-200"
                              : sa.status === "Returned"
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-blue-50 text-blue-700 border border-blue-200"
                          }`}
                        >
                          {sa.status}
                        </Badge>
                      </td>
                      <td className="px-2 py-2 text-slate-600 truncate max-w-[150px]">{sa.location}</td>
                      <td className="px-2 py-2 text-slate-600 truncate">{sa.client_name}</td>
                      <td className="px-2 py-2 text-slate-600 truncate">{sa.project_name}</td>
                      <td className="px-2 py-2 text-right text-slate-500 text-[11px]">{sa.outward_date || "—"}</td>
                      <td className="px-2 py-2 text-slate-500 font-mono text-[10px]">{sa.reference}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Drill-down Product Modal */}
      {drilldownProduct && (
        <Dialog open={!!drilldownProduct} onOpenChange={() => setDrilldownProduct(null)}>
          <DialogContent className="max-w-2xl bg-white">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs text-indigo-700 bg-indigo-50">
                  {drilldownProduct.category}
                </Badge>
                {drilldownProduct.brand && drilldownProduct.brand !== "—" && (
                  <Badge variant="outline" className="text-xs text-slate-600">
                    {drilldownProduct.brand}
                  </Badge>
                )}
              </div>
              <DialogTitle className="text-lg font-bold text-slate-900 mt-1" style={{ fontFamily: "Outfit" }}>
                {drilldownProduct.product}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Detailed utilization, stock balance & serialized asset distribution
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              {/* Quick Metrics Grid */}
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="text-slate-500 text-[10px] uppercase font-medium">Received</div>
                  <div className="text-base font-bold text-slate-900 tabular-nums">
                    {Number(drilldownProduct.total_received).toLocaleString()}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="text-slate-500 text-[10px] uppercase font-medium">Issued</div>
                  <div className="text-base font-bold text-amber-700 tabular-nums">
                    {Number(drilldownProduct.total_issued).toLocaleString()}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="text-slate-500 text-[10px] uppercase font-medium">Available</div>
                  <div className="text-base font-bold text-emerald-700 tabular-nums">
                    {Number(drilldownProduct.available).toLocaleString()}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="text-slate-500 text-[10px] uppercase font-medium">Utilization</div>
                  <div className="text-base font-bold text-indigo-700 tabular-nums">
                    {drilldownProduct.utilization_pct}%
                  </div>
                </div>
              </div>

              {/* Serial Breakdown if Serialized */}
              {drilldownProduct.is_serialized && (
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-xs font-semibold text-slate-800 mb-2">Serialized Asset Distribution</div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="p-2 bg-white rounded border border-slate-100 flex items-center justify-between">
                      <span className="text-slate-600">In Stock:</span>
                      <span className="font-bold text-emerald-700">{drilldownProduct.serials_breakdown?.available || 0}</span>
                    </div>
                    <div className="p-2 bg-white rounded border border-slate-100 flex items-center justify-between">
                      <span className="text-slate-600">Issued / Out:</span>
                      <span className="font-bold text-blue-700">{drilldownProduct.serials_breakdown?.issued || 0}</span>
                    </div>
                    <div className="p-2 bg-white rounded border border-slate-100 flex items-center justify-between">
                      <span className="text-slate-600">Installed:</span>
                      <span className="font-bold text-indigo-700">{drilldownProduct.serials_breakdown?.installed || 0}</span>
                    </div>
                    <div className="p-2 bg-white rounded border border-slate-100 flex items-center justify-between">
                      <span className="text-slate-600">Returned:</span>
                      <span className="font-bold text-amber-700">{drilldownProduct.serials_breakdown?.returned || 0}</span>
                    </div>
                    <div className="p-2 bg-white rounded border border-slate-100 flex items-center justify-between">
                      <span className="text-slate-600">Damaged:</span>
                      <span className="font-bold text-red-700">{drilldownProduct.serials_breakdown?.damaged || 0}</span>
                    </div>
                    <div className="p-2 bg-white rounded border border-slate-100 flex items-center justify-between">
                      <span className="text-slate-600">Total Tracked:</span>
                      <span className="font-bold text-slate-900">{drilldownProduct.total_serials}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Movement Metadata */}
              <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                <span>Last Inward: {drilldownProduct.last_inward_date || "—"}</span>
                <span>Last Outward: {drilldownProduct.last_outward_date || "—"}</span>
                <span>Sites Dispatched To: {drilldownProduct.projects_count}</span>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
