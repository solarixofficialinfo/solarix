import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText, Download, Printer, ArrowLeft, Share2, Check,
  Sun, Zap, ShieldCheck, TreePine, Leaf, DollarSign, Calendar, Clock,
  MapPin, Phone, Mail, Building2, Eye, ChevronLeft, ChevronRight, Sparkles,
  Layers, CheckCircle2, BatteryCharging
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  LineChart, Line, AreaChart, Area
} from "recharts";
import { formatINR, formatNumberIN } from "../utils/proposalCalculations";

export default function ProposalDocumentViewer({
  proposalData,
  companyData,
  metrics,
  onClose,
  onDownloadPdf,
  onSelectTemplate,
  downloading = false,
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState("paged"); // 'paged' | 'continuous'
  const totalPages = 8;

  const co = companyData || {};
  const pd = proposalData || {};
  const m = metrics || {};

  const [selectedTemplate, setSelectedTemplate] = useState(pd.template_id || "template1");

  useEffect(() => {
    if (pd.template_id && pd.template_id !== selectedTemplate) {
      setSelectedTemplate(pd.template_id);
    }
  }, [pd.template_id, selectedTemplate]);

  const companyName = co.company_name || co.name || "Solarix Solar Energy EPC";
  const customerName = pd.customer_name || "Valued Customer";
  const systemKw = Number(pd.system_kw) || 5.0;
  const propNumber = pd.proposal_number || `PROP-${pd.proposal_date || "2026"}`;
  const propDate = pd.proposal_date || new Date().toISOString().slice(0, 10);
  const validUntil = pd.valid_until || "15 Days from Date of Issue";
  const repName = pd.prepared_by || co.owner_name || "Solar Solutions Engineer";
  const repPhone = pd.representative_phone || co.mobile || co.phone || "+91 98765 43210";
  const repEmail = pd.representative_email || co.email || "info@solarix.energy";
  const netCost = Number(pd.net_customer_cost) || (m.netCustomerCost - (pd.custom_discount || 0)) || 172000;
  const grossCost = Number(m.grossCost) || (netCost + (pd.subsidy_amount || 0));
  const gstAmount = Number(m.gstAmount) || Math.round((grossCost * 13.8) / 113.8);
  const subsidyAmount = pd.subsidy_applicable ? (Number(pd.subsidy_amount) || 0) : 0;
  const customDiscount = Number(pd.custom_discount) || 0;
  const roiPct = netCost > 0 && m.annualSavings > 0 ? ((m.annualSavings / netCost) * 100).toFixed(2) : "19.85";

  const panelCount = pd.panel?.quantity || 18;
  const panelWatt = pd.panel?.wattage || 555;
  const panelMake = pd.panel?.make || "Tier-1 Mono PERC";
  const panelModel = pd.panel?.model || "SPR-E19-320";

  const invCap = pd.inverter?.capacity || `${systemKw.toFixed(1)} kW`;
  const invMake = pd.inverter?.make || "Growatt / ABB";
  const invModel = pd.inverter?.model || "PVI-10.0-TL-OUTD";
  const invQty = pd.inverter?.quantity || 1;

  const batteryIncluded = Boolean(pd.battery_included);
  const batteryMake = pd.battery?.make || "LiFePO4 Storage";
  const batteryCap = pd.battery?.capacity || "5.0 kWh";
  const batteryQty = pd.battery?.quantity || 1;

  const structureType = pd.structure?.type || "Elevated Super Structure";
  const structureHeight = pd.structure?.height || "1.8m Clearance";
  const structureMat = pd.structure?.material || "Aluminium 6063-T6 & Hot Dip Galvanized Iron";

  const retailer = pd.customer_retailer || "Origin Energy / MSEDCL";
  const nmi = pd.customer_nmi || "Essential Energy / 4001292991";
  const projectNotes = pd.proposal_notes || "Standard rooftop installation. Inverter located with minimum 300mm ventilation clearance. Real-time smartphone monitoring setup included.";

  const warrantyPanel = pd.warranty_panel_performance || "25 Years Guaranteed Performance 80% / 10 Years Material";
  const warrantyInverter = pd.warranty_inverter || "10 Years Replacement Warranty";
  const warrantyBattery = batteryIncluded ? (pd.warranty_battery || "10 Years Limited Warranty") : "NA";
  const warrantyMounting = pd.warranty_mounting || "10 Years Structural & Racking Warranty";
  const warrantyWorkmanship = pd.warranty_workmanship || "5 Years Workmanship Warranty";

  const dailyUsage = pd.daily_usage_kwh || 20.0;
  const annualUsage = pd.annual_usage_kwh || 7301;
  const currentQtrBill = pd.current_quarterly_bill || Math.round(systemKw * 6800);
  const postSolarQtrBill = pd.post_solar_quarterly_bill || Math.round(systemKw * 2900);
  const selfConsumedPct = pd.self_consumption_pct || 46.68;
  const gridExportPct = pd.grid_export_pct || 53.32;
  const avgDailyGen = (m.annualKwh / 365).toFixed(1);

  // Weekly & Seasonal chart data for Page 4
  const hourlyCurveData = [
    { time: "02:00", mon: 0.1, wed: 0.15, sat: 0.2, summer: 0.2, autumn: 0.15, winter: 0.1, spring: 0.15 },
    { time: "06:00", mon: 0.4, wed: 0.45, sat: 0.5, summer: 0.6, autumn: 0.45, winter: 0.35, spring: 0.45 },
    { time: "09:00", mon: 2.1, wed: 2.2, sat: 2.0, summer: 2.3, autumn: 2.0, winter: 1.8, spring: 2.0 },
    { time: "12:00", mon: 2.5, wed: 2.6, sat: 2.4, summer: 2.7, autumn: 2.3, winter: 2.0, spring: 2.4 },
    { time: "16:00", mon: 1.2, wed: 1.3, sat: 1.4, summer: 1.5, autumn: 1.2, winter: 0.9, spring: 1.2 },
    { time: "20:00", mon: 0.3, wed: 0.35, sat: 0.4, summer: 0.4, autumn: 0.3, winter: 0.25, spring: 0.3 },
    { time: "23:00", mon: 0.1, wed: 0.1, sat: 0.15, summer: 0.15, autumn: 0.1, winter: 0.08, spring: 0.1 },
  ];

  // Power bill comparison data for Page 4
  const billCompareData = [
    { name: "Power Bill", beforeSolar: currentQtrBill, afterSolar: postSolarQtrBill }
  ];

  // Average day snapshot & energy mix data for Page 5
  const daySnapshotData = [
    { time: "05:00", consumption: 0.4, generation: 0.1 },
    { time: "08:00", consumption: 1.6, generation: 1.2 },
    { time: "11:00", consumption: 2.2, generation: 3.5 },
    { time: "14:00", consumption: 1.8, generation: 3.2 },
    { time: "17:00", consumption: 1.4, generation: 1.1 },
    { time: "20:00", consumption: 0.6, generation: 0.0 },
    { time: "23:00", consumption: 0.3, generation: 0.0 },
  ];

  const energyMixData = [
    { name: "Grid Power Used", value: Math.round(annualUsage * (1 - selfConsumedPct / 100)) },
    { name: "Solar Consumed", value: Math.round(m.annualKwh * (selfConsumedPct / 100)) },
    { name: "Solar Exported", value: Math.round(m.annualKwh * (gridExportPct / 100)) },
  ];

  // Monthly table data (Jan - Dec)
  const monthlyTableData = [
    { month: "Jan", total: Math.round(m.annualKwh * 0.104), shade: 5, avg: (m.annualKwh * 0.104 / 31).toFixed(1) },
    { month: "Feb", total: Math.round(m.annualKwh * 0.083), shade: 4, avg: (m.annualKwh * 0.083 / 28).toFixed(1) },
    { month: "Mar", total: Math.round(m.annualKwh * 0.087), shade: 12, avg: (m.annualKwh * 0.087 / 31).toFixed(1) },
    { month: "Apr", total: Math.round(m.annualKwh * 0.073), shade: 11, avg: (m.annualKwh * 0.073 / 30).toFixed(1) },
    { month: "May", total: Math.round(m.annualKwh * 0.059), shade: 10, avg: (m.annualKwh * 0.059 / 31).toFixed(1) },
    { month: "Jun", total: Math.round(m.annualKwh * 0.057), shade: 23, avg: (m.annualKwh * 0.057 / 30).toFixed(1) },
    { month: "Jul", total: Math.round(m.annualKwh * 0.067), shade: 26, avg: (m.annualKwh * 0.067 / 31).toFixed(1) },
    { month: "Aug", total: Math.round(m.annualKwh * 0.080), shade: 33, avg: (m.annualKwh * 0.080 / 31).toFixed(1) },
    { month: "Sep", total: Math.round(m.annualKwh * 0.094), shade: 9, avg: (m.annualKwh * 0.094 / 30).toFixed(1) },
    { month: "Oct", total: Math.round(m.annualKwh * 0.093), shade: 10, avg: (m.annualKwh * 0.093 / 31).toFixed(1) },
    { month: "Nov", total: Math.round(m.annualKwh * 0.098), shade: 10, avg: (m.annualKwh * 0.098 / 30).toFixed(1) },
    { month: "Dec", total: Math.round(m.annualKwh * 0.105), shade: 6, avg: (m.annualKwh * 0.105 / 31).toFixed(1) },
  ];

  // 5-Year Return on Investment data for Page 6
  const returnsData = [
    { year: "Year 1", returns: Math.round(m.annualSavings) },
    { year: "Year 2", returns: Math.round(m.annualSavings * 2.05) },
    { year: "Year 3", returns: Math.round(m.annualSavings * 3.15) },
    { year: "Year 4", returns: Math.round(m.annualSavings * 4.30) },
    { year: "Year 5", returns: Math.round(m.annualSavings * 5.50) },
  ];

  const handlePrint = () => {
    window.print();
  };

  const handleShareWhatsApp = () => {
    const text = `☀️ *SOLAR PV PROPOSAL FOR ${customerName.toUpperCase()}*\n\n` +
      `System Capacity: *${systemKw.toFixed(2)} kWp*\n` +
      `Est. Annual Generation: *${formatNumberIN(m.annualKwh)} units/year*\n` +
      `Est. Annual Savings: *${formatINR(m.annualSavings)}/year*\n` +
      `Net Upfront Investment: *${formatINR(netCost)}*\n` +
      `Estimated Payback: *${m.paybackYears} Years*\n\n` +
      `Prepared by: *${repName}* (${companyName})\n` +
      `Proposal Ref: ${propNumber}\n\n` +
      `Please review your customer-ready proposal document!`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      {/* ── TOP CONTROL BAR (Screen Only) ─────────────────────────────────── */}
      <header className="print:hidden sticky top-0 z-50 bg-slate-950/90 backdrop-blur border-b border-slate-800 px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-slate-300 hover:text-white hover:bg-slate-800 h-8 px-2.5 rounded-lg gap-1.5 text-xs"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Editor
          </Button>
          <div className="h-4 w-[1px] bg-slate-800 hidden sm:block" />
          <div>
            <div className="font-bold text-white text-xs sm:text-sm flex items-center gap-1.5">
              <span>{propNumber}</span>
              <Badge className="bg-blue-600/30 text-blue-400 border-blue-500/40 text-[10px] py-0 font-medium">
                {systemKw.toFixed(2)} kWp
              </Badge>
            </div>
            <div className="text-[11px] text-slate-400 truncate max-w-xs">{customerName}</div>
          </div>
        </div>

        {/* Template Selector Buttons */}
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => {
              setSelectedTemplate("template1");
              if (onSelectTemplate) onSelectTemplate("template1");
            }}
            className={`px-3 py-1 text-xs rounded-lg font-semibold transition ${
              selectedTemplate === "template1"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Template 1 · Solarix Premium
          </button>
          <button
            onClick={() => {
              setSelectedTemplate("template2");
              if (onSelectTemplate) onSelectTemplate("template2");
            }}
            className={`px-3 py-1 text-xs rounded-lg font-semibold transition ${
              selectedTemplate === "template2"
                ? "bg-sky-600 text-white shadow-xs"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Template 2 · Solarix Corporate
          </button>
        </div>

        {/* Center Pager Controls */}
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
          <Button
            variant="ghost"
            size="sm"
            disabled={viewMode === "continuous" || currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="h-7 w-7 p-0 text-slate-400 hover:text-white disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs font-semibold px-2 text-slate-300 min-w-[70px] text-center">
            {viewMode === "continuous" ? "All 8 Pages" : `Page ${currentPage} of ${totalPages}`}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={viewMode === "continuous" || currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="h-7 w-7 p-0 text-slate-400 hover:text-white disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          <div className="h-4 w-[1px] bg-slate-800 mx-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewMode(viewMode === "paged" ? "continuous" : "paged")}
            className="h-7 px-2 text-[11px] text-slate-400 hover:text-white"
          >
            {viewMode === "paged" ? "View All" : "Single Page"}
          </Button>
        </div>

        {/* Actions: Download / Print / Share */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleShareWhatsApp}
            className="border-emerald-600/50 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 text-xs h-8 px-3 rounded-lg gap-1.5"
          >
            <Share2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">WhatsApp</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="border-slate-700 bg-slate-800 hover:bg-slate-700 text-white text-xs h-8 px-3 rounded-lg gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Print</span>
          </Button>
          <Button
            size="sm"
            onClick={onDownloadPdf}
            disabled={downloading}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold h-8 px-3.5 rounded-lg gap-1.5 shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            {downloading ? "Building PDF…" : "Download PDF"}
          </Button>
        </div>
      </header>

      {/* ── DOCUMENT CONTAINER (A4 Layout) ────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto py-8 px-4 flex flex-col items-center gap-8 bg-slate-900 print:bg-white print:p-0 print:gap-0">
        <style>{`
          @media print {
            body {
              background: white !important;
              color: black !important;
            }
            .a4-page {
              width: 210mm !important;
              min-height: 297mm !important;
              height: 297mm !important;
              margin: 0 !important;
              padding: 14mm 16mm !important;
              box-shadow: none !important;
              border: none !important;
              page-break-after: always !important;
              page-break-inside: avoid !important;
              break-after: page !important;
            }
          }
        `}</style>

        {/* 8-Page Render Loop */}
        {[1, 2, 3, 4, 5, 6, 7, 8].map((pageNum) => {
          if (viewMode === "paged" && currentPage !== pageNum) {
            return null;
          }

          return (
            <div
              key={pageNum}
              className="a4-page relative w-full max-w-[820px] min-h-[1140px] bg-white text-slate-800 rounded-xl shadow-2xl p-10 sm:p-12 flex flex-col justify-between print:rounded-none print:shadow-none print:max-w-none"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              {/* Top Accent Line (Pages 2-8) */}
              {pageNum > 1 && (
                selectedTemplate === "template2" ? (
                  <div className="w-full border-b-2 border-sky-500 pb-2 mb-5 flex items-center justify-between text-[11px] text-slate-500">
                    <div className="flex items-center gap-1.5 font-bold text-sky-800 tracking-wide">
                      <Sun className="w-3.5 h-3.5 text-sky-600" />
                      <span>{companyName.toUpperCase()}</span>
                    </div>
                    <div className="font-semibold text-slate-400">
                      SOLAR PV TECHNICAL PROPOSAL · {propNumber}
                    </div>
                  </div>
                ) : (
                  <div className="w-full border-b border-slate-800/80 pb-2 mb-5 flex items-center justify-between text-[11px] text-slate-500">
                    <div className="flex items-center gap-1.5 font-bold text-slate-900 tracking-wide">
                      <Sun className="w-3.5 h-3.5 text-blue-600" />
                      <span>{companyName.toUpperCase()}</span>
                    </div>
                    <div className="font-medium text-slate-400">
                      Solar PV Proposal · {propNumber}
                    </div>
                  </div>
                )
              )}

              {/* ── PAGE CONTENT ROUTER ───────────────────────────────────── */}
              <div className="flex-1 flex flex-col">
                {/* ───────────────────────────────────────────────────────────── */}
                {/* PAGE 1: COVER PAGE                                            */}
                {/* ───────────────────────────────────────────────────────────── */}
                {pageNum === 1 && (
                  selectedTemplate === "template2" ? (
                    /* ── TEMPLATE 2: SOLARIX CORPORATE (REFERENCE PDF STYLE) ─── */
                    <div className="flex-1 flex flex-col justify-between py-2">
                      <div className="space-y-6">
                        {/* Reference PDF Contact Details Header */}
                        <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-200">
                          <div>
                            <span className="text-[10px] font-bold text-sky-700 uppercase tracking-wider block">Prepared by:</span>
                            <div className="text-xs font-bold text-slate-900">{repName}</div>
                            <div className="text-[11px] text-slate-600">{repPhone}</div>
                            <div className="text-[11px] text-slate-600">{repEmail}</div>
                            <div className="text-[11px] text-sky-700 font-semibold">{companyName}</div>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-sky-700 uppercase tracking-wider block">Created for:</span>
                            <div className="text-xs font-bold text-slate-900">{customerName}</div>
                            <div className="text-[11px] text-slate-600">{pd.mobile || "Phone Not Specified"}</div>
                            {pd.email && <div className="text-[11px] text-slate-600">{pd.email}</div>}
                            <div className="text-[11px] text-slate-600">{pd.site_address || "Site Address"}, {pd.city}</div>
                            <div className="text-[10.5px] text-slate-400 mt-1 font-mono">
                              Date: {propDate} · Project No.: {propNumber}
                            </div>
                          </div>
                        </div>

                        {/* Reference PDF Angular Hero Banner */}
                        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-sky-600 to-blue-700 text-white p-7 shadow-xl">
                          <div className="max-w-xs space-y-2 relative z-10">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-sky-200 block">
                              ENGINEERING ROOFTOP SOLAR
                            </span>
                            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight" style={{ fontFamily: "Outfit" }}>
                              SOLAR POWER<br />PROPOSAL
                            </h1>
                            <div className="text-4xl font-black text-white tracking-tight pt-1">
                              {systemKw.toFixed(2)}kW
                            </div>
                          </div>
                          <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-25 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white via-transparent to-transparent pointer-events-none" />
                        </div>

                        {/* INVESTMENT SUMMARY BOX (Exact Reference PDF Section) */}
                        <div className="p-5 rounded-xl border-2 border-sky-500 bg-sky-50/40 space-y-3">
                          <div className="text-xs font-black text-sky-900 uppercase tracking-wider border-b border-sky-200 pb-1.5 flex items-center justify-between">
                            <span>INVESTMENT SUMMARY</span>
                            <Badge className="bg-sky-600 text-white text-[9px] px-2 py-0">Turnkey EPC</Badge>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                            <div>
                              <span className="text-[9.5px] font-bold text-slate-500 uppercase block">ESTIMATED SAVINGS (YEAR 1)</span>
                              <span className="text-lg font-black text-slate-900">{formatINR(m.annualSavings)}</span>
                            </div>
                            <div>
                              <span className="text-[9.5px] font-bold text-slate-500 uppercase block">RETURN ON INVESTMENT</span>
                              <span className="text-lg font-black text-emerald-700">{roiPct}% p.a.</span>
                            </div>
                            <div>
                              <span className="text-[9.5px] font-bold text-slate-500 uppercase block">PAYBACK PERIOD</span>
                              <span className="text-lg font-black text-sky-700">{m.paybackYears} years</span>
                            </div>
                          </div>
                        </div>

                        {/* Scope Snapshot */}
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                            <span className="text-[9.5px] font-bold text-slate-500 uppercase block">Hardware Inclusions</span>
                            <div className="font-semibold text-slate-800 text-[11px] mt-0.5">{panelCount} × {panelWatt}W {panelMake}</div>
                            <div className="text-[10px] text-slate-500">{invCap} {invMake} Inverter with App Monitoring</div>
                          </div>
                          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                            <span className="text-[9.5px] font-bold text-slate-500 uppercase block">Financial Summary</span>
                            <div className="font-semibold text-slate-800 text-[11px] mt-0.5">Net Investment: {formatINR(netCost)}</div>
                            <div className="text-[10px] text-emerald-700 font-medium">Includes PM Surya Ghar Subsidy Assistance</div>
                          </div>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-slate-200 flex justify-between items-center text-[10.5px] text-slate-500">
                        <span>{companyName} · Solar Energy EPC</span>
                        <span className="font-semibold text-sky-700">Proposal Valid Until: {validUntil}</span>
                      </div>
                    </div>
                  ) : (
                    /* ── TEMPLATE 1: SOLARIX PREMIUM COVER ───────────────────── */
                    <div className="flex-1 flex flex-col justify-between py-6">
                      <div>
                        {/* Top Header Row */}
                        <div className="flex items-center justify-between border-b-2 border-slate-900 pb-4">
                          <div>
                            <div className="text-2xl font-black text-slate-900 tracking-tight" style={{ fontFamily: "Outfit" }}>
                              {companyName.toUpperCase()}
                            </div>
                            <div className="text-xs text-slate-500 font-medium mt-0.5">
                              Certified Solar EPC & Clean Energy Solutions
                            </div>
                          </div>
                          <div className="text-right text-xs">
                            <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">PROPOSAL REF</div>
                            <div className="font-mono font-bold text-blue-700">{propNumber}</div>
                            <div className="text-slate-500 text-[11px] mt-0.5">Date: {propDate}</div>
                          </div>
                        </div>

                        {/* Large Hero Banner */}
                        <div className="my-8 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white p-8 rounded-2xl shadow-xl relative overflow-hidden border border-slate-800">
                          <span className="inline-block bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[11px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider mb-3">
                            Grid-Connected Solar PV
                          </span>
                          <h1 className="text-3xl font-black tracking-tight text-white leading-tight" style={{ fontFamily: "Outfit" }}>
                            Commercial & Technical<br />Solar Rooftop Proposal
                          </h1>
                          <p className="text-xs text-slate-300 mt-2 max-w-lg leading-relaxed">
                            Tailored turnkey engineering proposal for a high-efficiency <b>{systemKw.toFixed(2)} kWp</b> rooftop solar installation.
                          </p>
                          <div className="mt-5 flex flex-wrap gap-4 pt-4 border-t border-slate-800 text-xs">
                            <div>
                              <span className="text-slate-400 text-[10px] block font-medium">PLANT CAPACITY</span>
                              <span className="text-lg font-bold text-amber-400">{systemKw.toFixed(2)} kWp</span>
                            </div>
                            <div className="w-[1px] h-7 bg-slate-800" />
                            <div>
                              <span className="text-slate-400 text-[10px] block font-medium">ANNUAL GENERATION</span>
                              <span className="text-lg font-bold text-emerald-400">~{formatNumberIN(m.annualKwh)} kWh</span>
                            </div>
                            <div className="w-[1px] h-7 bg-slate-800" />
                            <div>
                              <span className="text-slate-400 text-[10px] block font-medium">NET INVESTMENT</span>
                              <span className="text-lg font-bold text-white">{formatINR(netCost)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Customer & Project Detail Cards */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                            <div className="text-[10px] font-bold text-slate-900 uppercase tracking-wider mb-2">PREPARED FOR</div>
                            <div className="font-bold text-slate-900 text-base">{customerName}</div>
                            <div className="text-xs text-slate-600 mt-1">{pd.site_address || "Site Address"}</div>
                            <div className="text-xs text-slate-600">{pd.city} {pd.state} {pd.pincode}</div>
                            <div className="text-xs text-slate-500 mt-2">
                              {pd.mobile && <span>Ph: {pd.mobile}</span>}
                              {pd.email && <span className="ml-2">· {pd.email}</span>}
                            </div>
                          </div>

                          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                            <div className="text-[10px] font-bold text-slate-900 uppercase tracking-wider mb-2">PROJECT OVERVIEW</div>
                            <div className="text-xs space-y-1">
                              <div className="flex justify-between"><span className="text-slate-500">System Rating:</span> <span className="font-bold text-slate-800">{systemKw.toFixed(2)} kWp DC</span></div>
                              <div className="flex justify-between"><span className="text-slate-500">Project Type:</span> <span className="font-medium text-slate-800">{pd.project_type || "Residential"}</span></div>
                              <div className="flex justify-between"><span className="text-slate-500">Grid Tie:</span> <span className="font-medium text-slate-800">{pd.solar_system_type || "On-Grid"}</span></div>
                              <div className="flex justify-between"><span className="text-slate-500">Govt. Subsidy:</span> <span className="font-bold text-emerald-700">{pd.subsidy_applicable ? "Eligible (PM Surya Ghar)" : "Not Applicable"}</span></div>
                              <div className="flex justify-between"><span className="text-slate-500">Prepared By:</span> <span className="font-medium text-slate-800">{repName}</span></div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="text-center pt-6 border-t border-slate-200 text-xs text-slate-400">
                        <div><b>{companyName}</b> · {co.address || "Solar EPC Headquarters"} · {repPhone} · {repEmail}</div>
                        <div className="text-[10px] mt-1 text-slate-400">Confidential · Strictly for client evaluation</div>
                      </div>
                    </div>
                  )
                )}

                {/* ───────────────────────────────────────────────────────────── */}
                {/* PAGE 2: ABOUT US                                              */}
                {/* ───────────────────────────────────────────────────────────── */}
                {pageNum === 2 && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase" style={{ fontFamily: "Outfit", color: selectedTemplate === "template2" ? "#0284c7" : undefined }}>
                        ABOUT US
                      </h2>
                      <p className="text-xs text-slate-600 mt-1">
                        We are an experienced solar installation company with a special focus on providing the best possible products to you with the best possible service.
                      </p>
                    </div>

                    <div className="space-y-4 text-xs text-slate-700 leading-relaxed">
                      <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70">
                        <h3 className="font-bold text-sm text-slate-900 mb-2 uppercase tracking-wide" style={{ color: selectedTemplate === "template2" ? "#0284c7" : undefined }}>
                          OUR COMPANY
                        </h3>
                        <p>
                          <b>{companyName}</b> is a full-service solar engineering, procurement, and construction (EPC) company focused on the success and energy independence of homeowners and businesses.
                          Our aim is to make high quality, success-oriented clean energy systems accessible and dependable. We always listen to each individual customer to discover what your unique requirements are — so that we can offer a service that matches your highest expectations.
                        </p>
                        <div className="mt-3 pt-3 border-t border-slate-200">
                          <span className="font-bold text-slate-900 block mb-1">Key Features of {companyName}:</span>
                          <ul className="list-disc pl-5 space-y-0.5 text-[11.5px] text-slate-600">
                            <li>Cutting edge 3D solar panel design and precision irradiance simulation</li>
                            <li>Tier-1 DCR solar modules compliant with MNRE & IEC international benchmarks</li>
                            <li>Advanced shadow analysis, string sizing and export limiting integration</li>
                            <li>Complete liaisoning with local DISCOM for fast net-metering and subsidy credit</li>
                            <li>Full remote performance monitoring via cloud smartphone apps</li>
                          </ul>
                        </div>
                      </div>

                      <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70">
                        <h3 className="font-bold text-sm text-slate-900 mb-2 uppercase tracking-wide" style={{ color: selectedTemplate === "template2" ? "#0284c7" : undefined }}>
                          CONTACT US
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Headquarters</span>
                            <div className="font-bold text-slate-900">{companyName}</div>
                            <div className="text-slate-600 mt-0.5">{co.address || "Solar EPC Corporate Office"}</div>
                            {co.gst_number && <div className="text-slate-500 font-mono text-[10.5px]">GSTIN: {co.gst_number}</div>}
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Your Representative</span>
                            <div className="font-bold text-slate-900">{repName}</div>
                            <div className="text-slate-600 mt-0.5">{repPhone}</div>
                            <div className="text-slate-600">{repEmail}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ───────────────────────────────────────────────────────────── */}
                {/* PAGE 3: SITE ANALYSIS                                         */}
                {/* ───────────────────────────────────────────────────────────── */}
                {pageNum === 3 && (
                  <div className="space-y-5">
                    <div>
                      <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase" style={{ fontFamily: "Outfit", color: selectedTemplate === "template2" ? "#0284c7" : undefined }}>
                        SITE ANALYSIS
                      </h2>
                      <p className="text-xs text-slate-600 mt-1">
                        We have reviewed your site and determined the below information to be correct and suitable for your premises.
                      </p>
                    </div>

                    {/* Satellite / 3D Layout Image Display */}
                    <div className="rounded-xl border border-slate-300 overflow-hidden bg-slate-100 flex items-center justify-center aspect-video max-h-72">
                      {pd.snapshot_3d || pd.snapshot_2d ? (
                        <img
                          src={pd.snapshot_3d || pd.snapshot_2d}
                          alt="Roof Solar Layout"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="p-8 text-center text-slate-400 text-xs">
                          <Compass className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                          <span>Satellite imagery and 3D rooftop array layout verified for {pd.site_address || customerName}</span>
                        </div>
                      )}
                    </div>

                    {/* System Summary Table (Exact Reference PDF Section) */}
                    <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                      <div className="font-bold text-xs uppercase tracking-wide border-b border-slate-100 pb-1.5" style={{ color: selectedTemplate === "template2" ? "#0284c7" : "#0f172a" }}>
                        SYSTEM SUMMARY
                      </div>
                      <div className="text-xs space-y-2">
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="font-bold text-slate-600">Site Address:</span>
                          <span className="font-semibold text-slate-900 text-right">{pd.site_address || "222 Margaret Street, Brisbane City, QLD, 4000, Australia"}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center pt-2">
                          <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                            <span className="text-[10px] font-bold text-slate-500 uppercase block">Array Capacity</span>
                            <span className="text-base font-extrabold text-slate-900">{systemKw.toFixed(2)}kW</span>
                          </div>
                          <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                            <span className="text-[10px] font-bold text-slate-500 uppercase block">Tilt Angle</span>
                            <span className="text-base font-extrabold text-slate-900">{pd.tilt_deg || 22}°</span>
                          </div>
                          <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                            <span className="text-[10px] font-bold text-slate-500 uppercase block">Direction (from North)</span>
                            <span className="text-base font-extrabold text-slate-900">{pd.azimuth_deg || 317.5}°</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ───────────────────────────────────────────────────────────── */}
                {/* PAGE 4: ENERGY NEEDS                                          */}
                {/* ───────────────────────────────────────────────────────────── */}
                {pageNum === 4 && (
                  <div className="space-y-5">
                    <div>
                      <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase" style={{ fontFamily: "Outfit", color: selectedTemplate === "template2" ? "#0284c7" : undefined }}>
                        ENERGY NEEDS
                      </h2>
                      <p className="text-xs text-slate-600 mt-1">
                        We have thoroughly assessed your energy use to determine the best solar solution to fit your needs.
                      </p>
                    </div>

                    {/* Section: Your Energy Use */}
                    <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2">
                      <div className="font-bold text-xs uppercase tracking-wide border-b border-slate-100 pb-1" style={{ color: selectedTemplate === "template2" ? "#0284c7" : "#0f172a" }}>
                        YOUR ENERGY USE
                      </div>
                      <div className="text-xs text-slate-700 space-y-0.5">
                        <div>Current Energy Use Per Day: <b>{dailyUsage} kWh/day</b></div>
                        <div>Current Annual Use: <b>{formatNumberIN(annualUsage)} kWh</b></div>
                      </div>

                      {/* Dual Curves: Weekly & Seasonal */}
                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div>
                          <span className="text-[10px] font-bold text-slate-500 block text-center mb-1">WEEKLY AVERAGES</span>
                          <div className="h-28 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={hourlyCurveData}>
                                <XAxis dataKey="time" tick={{ fontSize: 8 }} />
                                <YAxis tick={{ fontSize: 8 }} domain={[0, 3]} />
                                <Line type="monotone" dataKey="mon" stroke="#ef4444" strokeWidth={1.5} dot={false} />
                                <Line type="monotone" dataKey="wed" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
                                <Line type="monotone" dataKey="sat" stroke="#0ea5e9" strokeWidth={1.5} dot={false} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        <div>
                          <span className="text-[10px] font-bold text-slate-500 block text-center mb-1">SEASONAL AVERAGES</span>
                          <div className="h-28 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={hourlyCurveData}>
                                <XAxis dataKey="time" tick={{ fontSize: 8 }} />
                                <YAxis tick={{ fontSize: 8 }} domain={[0, 3]} />
                                <Line type="monotone" dataKey="summer" stroke="#ef4444" strokeWidth={1.5} dot={false} />
                                <Line type="monotone" dataKey="winter" stroke="#0ea5e9" strokeWidth={1.5} dot={false} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Section: Your Power Bill */}
                    <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2">
                      <div className="font-bold text-xs uppercase tracking-wide border-b border-slate-100 pb-1" style={{ color: selectedTemplate === "template2" ? "#0284c7" : "#0f172a" }}>
                        YOUR POWER BILL
                      </div>
                      <div className="text-xs text-slate-700 space-y-0.5">
                        <div>Current Quarterly Power Bill: <b>{formatINR(currentQtrBill)} /quarter</b></div>
                        <div>Quarterly Power Bill After Solar: <b>{formatINR(postSolarQtrBill)} /quarter</b></div>
                        <div>Your Overall (Lifetime) Power Bill Savings Estimate: <b className="text-emerald-700">{formatINR(m.lifetimeSavings)}</b></div>
                      </div>

                      {/* Bar Chart: Bill Before vs After Solar */}
                      <div className="h-32 w-full pt-1">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={billCompareData}>
                            <CartGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                            <YAxis tick={{ fontSize: 8 }} />
                            <Tooltip formatter={(v) => formatINR(v)} />
                            <Bar dataKey="beforeSolar" name="Power Bill Before Solar" fill="#475569" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="afterSolar" name="Power Bill After Solar" fill="#0284c7" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                )}

                {/* ───────────────────────────────────────────────────────────── */}
                {/* PAGE 5: SOLAR SYSTEM                                          */}
                {/* ───────────────────────────────────────────────────────────── */}
                {pageNum === 5 && (
                  <div className="space-y-4">
                    <div>
                      <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase" style={{ fontFamily: "Outfit", color: selectedTemplate === "template2" ? "#0284c7" : undefined }}>
                        SOLAR SYSTEM
                      </h2>
                      <p className="text-xs text-slate-600 mt-0.5">
                        The solar system we have proposed for your premises will decrease your reliance on fossil-fuel "grid" energy and save you money on your power bill.
                      </p>
                    </div>

                    {/* System Performance Monthly */}
                    <div className="p-3 rounded-xl border border-slate-200 bg-white space-y-2">
                      <div className="font-bold text-xs uppercase tracking-wide border-b border-slate-100 pb-1" style={{ color: selectedTemplate === "template2" ? "#0284c7" : "#0f172a" }}>
                        SYSTEM PERFORMANCE (MONTHLY)
                      </div>
                      <div className="text-xs text-slate-700 flex flex-wrap justify-between gap-2">
                        <span>Average Solar Energy Produced: <b>{avgDailyGen} kWh/day</b></span>
                        <span>Solar Energy Produced (Year 1): <b>{formatNumberIN(m.annualKwh)} kWh</b></span>
                        <span>Solar Exported / Self-Consumed: <b>{gridExportPct}% / {selfConsumedPct}%</b></span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div>
                          <span className="text-[10px] font-bold text-slate-500 block text-center mb-1">AVERAGE DAY SNAPSHOT</span>
                          <div className="h-24 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={daySnapshotData}>
                                <XAxis dataKey="time" tick={{ fontSize: 8 }} />
                                <YAxis tick={{ fontSize: 8 }} />
                                <Area type="monotone" dataKey="generation" name="Solar Production" fill="#fef08a" stroke="#eab308" />
                                <Area type="monotone" dataKey="consumption" name="Energy Use" fill="#94a3b8" stroke="#475569" fillOpacity={0.4} />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        <div>
                          <span className="text-[10px] font-bold text-slate-500 block text-center mb-1">NEW ENERGY MIX</span>
                          <div className="h-24 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={energyMixData}>
                                <XAxis dataKey="name" tick={{ fontSize: 7 }} />
                                <YAxis tick={{ fontSize: 8 }} />
                                <Bar dataKey="value" fill="#0284c7" radius={[3, 3, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Daily Average Solar Energy Table & Chart (Exact Reference PDF layout) */}
                    <div className="p-3 rounded-xl border border-slate-200 bg-white space-y-2">
                      <div className="font-bold text-xs uppercase tracking-wide border-b border-slate-100 pb-1" style={{ color: selectedTemplate === "template2" ? "#0284c7" : "#0f172a" }}>
                        DAILY AVERAGE SOLAR ENERGY
                      </div>
                      <div className="h-24 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={monthlyTableData}>
                            <XAxis dataKey="month" tick={{ fontSize: 8 }} />
                            <YAxis tick={{ fontSize: 8 }} />
                            <Bar dataKey="total" fill="#0284c7" radius={[2, 2, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Solar Generation Estimates Table */}
                      <div className="overflow-x-auto pt-1">
                        <span className="text-[10px] font-bold text-slate-700 block mb-1">Solar Generation Estimates (All Figures in kWhs)</span>
                        <table className="w-full text-[9px] text-center border-collapse border border-slate-200">
                          <thead>
                            <tr className="bg-slate-100 text-slate-700">
                              <th className="p-1 border border-slate-200 font-bold">Month</th>
                              {monthlyTableData.map((d) => <th key={d.month} className="p-1 border border-slate-200">{d.month}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="p-1 border border-slate-200 font-bold bg-slate-50">Total</td>
                              {monthlyTableData.map((d) => <td key={d.month} className="p-1 border border-slate-200">{d.total}</td>)}
                            </tr>
                            <tr>
                              <td className="p-1 border border-slate-200 font-bold bg-slate-50">Shade Losses</td>
                              {monthlyTableData.map((d) => <td key={d.month} className="p-1 border border-slate-200">{d.shade}</td>)}
                            </tr>
                            <tr>
                              <td className="p-1 border border-slate-200 font-bold bg-slate-50">Avg Daily</td>
                              {monthlyTableData.map((d) => <td key={d.month} className="p-1 border border-slate-200 font-semibold">{d.avg}</td>)}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* ───────────────────────────────────────────────────────────── */}
                {/* PAGE 6: FINANCIALS                                            */}
                {/* ───────────────────────────────────────────────────────────── */}
                {pageNum === 6 && (
                  <div className="space-y-5">
                    <div>
                      <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase" style={{ fontFamily: "Outfit", color: selectedTemplate === "template2" ? "#0284c7" : undefined }}>
                        FINANCIALS
                      </h2>
                      <p className="text-xs text-slate-600 mt-1">
                        We have determined the savings you will make from your solar system based on the information detailed in this proposal.
                      </p>
                    </div>

                    {/* Section: Your Savings */}
                    <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2">
                      <div className="font-bold text-xs uppercase tracking-wide border-b border-slate-100 pb-1" style={{ color: selectedTemplate === "template2" ? "#0284c7" : "#0f172a" }}>
                        YOUR SAVINGS*
                      </div>
                      <div className="text-xs text-slate-700 flex justify-between">
                        <span>Total Savings In Year 1: <b>{formatINR(m.annualSavings)}</b></span>
                        <span>25 Year Savings Estimate: <b className="text-emerald-700">{formatINR(m.lifetimeSavings)}</b></span>
                      </div>
                    </div>

                    {/* Section: Your Returns */}
                    <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2">
                      <div className="font-bold text-xs uppercase tracking-wide border-b border-slate-100 pb-1" style={{ color: selectedTemplate === "template2" ? "#0284c7" : "#0f172a" }}>
                        YOUR RETURNS*
                      </div>
                      <div className="text-xs text-slate-700 flex justify-between">
                        <span>Return On Investment: <b>{roiPct}% p.a.</b></span>
                        <span>Payback Period: <b>{m.paybackYears} years</b></span>
                      </div>

                      {/* Cumulative Returns Chart */}
                      <div className="h-36 w-full pt-1">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={returnsData}>
                            <CartGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="year" tick={{ fontSize: 8 }} />
                            <YAxis tick={{ fontSize: 8 }} />
                            <Tooltip formatter={(v) => formatINR(v)} />
                            <Bar dataKey="returns" name="Cumulative Returns" fill="#0284c7" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Disclaimer */}
                      <p className="text-[9px] text-slate-400 pt-2 border-t border-slate-100 leading-relaxed">
                        *Disclaimer: The savings shown above assume total estimated generation as mentioned in the engineering model at standard peak tariff. Assuming self-consumption of {selfConsumedPct}% and remaining {gridExportPct}% exported to the grid based on the solar yield profile. These figures are indicative and based on standard test conditions.
                      </p>
                    </div>
                  </div>
                )}

                {/* ───────────────────────────────────────────────────────────── */}
                {/* PAGE 7: COMPONENTS & WARRANTY                                 */}
                {/* ───────────────────────────────────────────────────────────── */}
                {pageNum === 7 && (
                  <div className="space-y-5">
                    <div>
                      <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase" style={{ fontFamily: "Outfit", color: selectedTemplate === "template2" ? "#0284c7" : undefined }}>
                        COMPONENTS
                      </h2>
                      <p className="text-xs text-slate-600 mt-1">
                        Your system includes all of the components required to install your fully-functioning solar power system. We have made a list of inclusions below.
                      </p>
                    </div>

                    {/* Solar System Inclusions Table */}
                    <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2">
                      <div className="font-bold text-xs uppercase tracking-wide border-b border-slate-100 pb-1" style={{ color: selectedTemplate === "template2" ? "#0284c7" : "#0f172a" }}>
                        YOUR SYSTEM · INCLUSIONS
                      </div>
                      <table className="w-full text-xs">
                        <tbody className="divide-y divide-slate-100">
                          <tr className="py-1">
                            <td className="w-1/3 py-1 font-bold text-slate-700">Solar Panels</td>
                            <td className="py-1 text-slate-800">{panelCount} × {panelWatt}W - {panelMake} - ({panelModel})</td>
                          </tr>
                          <tr className="py-1">
                            <td className="w-1/3 py-1 font-bold text-slate-700">Inverters</td>
                            <td className="py-1 text-slate-800">{invQty} × {invMake} {invCap} ({invModel})</td>
                          </tr>
                          <tr className="py-1">
                            <td className="w-1/3 py-1 font-bold text-slate-700">Batteries</td>
                            <td className="py-1 text-slate-800">{batteryIncluded ? `${batteryQty} × ${batteryMake} (${batteryCap})` : "NA"}</td>
                          </tr>
                          <tr className="py-1">
                            <td className="w-1/3 py-1 font-bold text-slate-700">Mounting System</td>
                            <td className="py-1 text-slate-800">{structureType} ({structureHeight})</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Customer Information & Project Notes */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="p-3 rounded-xl border border-slate-200 bg-white space-y-1.5">
                        <div className="font-bold text-[11px] uppercase tracking-wide" style={{ color: selectedTemplate === "template2" ? "#0284c7" : "#0f172a" }}>
                          CUSTOMER INFORMATION
                        </div>
                        <div className="space-y-0.5 text-slate-700">
                          <div>Energy Retailer: <b>{retailer}</b></div>
                          <div>Distributor / NMI: <b>{nmi}</b></div>
                          <div>Site Address: <b>{pd.site_address || "222 Margaret Street, Brisbane City"}</b></div>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl border border-slate-200 bg-white space-y-1.5">
                        <div className="font-bold text-[11px] uppercase tracking-wide" style={{ color: selectedTemplate === "template2" ? "#0284c7" : "#0f172a" }}>
                          PROJECT NOTES
                        </div>
                        <p className="text-slate-600 text-[10.5px] leading-relaxed">
                          {projectNotes}
                        </p>
                      </div>
                    </div>

                    {/* Warranty Table */}
                    <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2">
                      <div className="font-bold text-xs uppercase tracking-wide border-b border-slate-100 pb-1" style={{ color: selectedTemplate === "template2" ? "#0284c7" : "#0f172a" }}>
                        WARRANTY
                      </div>
                      <table className="w-full text-xs">
                        <tbody className="divide-y divide-slate-100">
                          <tr className="py-1">
                            <td className="w-1/3 py-1 font-bold text-slate-700">Solar Panels</td>
                            <td className="py-1 text-slate-800">{warrantyPanel}</td>
                          </tr>
                          <tr className="py-1">
                            <td className="w-1/3 py-1 font-bold text-slate-700">Inverter / Battery</td>
                            <td className="py-1 text-slate-800">{warrantyInverter} / {warrantyBattery}</td>
                          </tr>
                          <tr className="py-1">
                            <td className="w-1/3 py-1 font-bold text-slate-700">Racking / Mounting</td>
                            <td className="py-1 text-slate-800">{warrantyMounting}</td>
                          </tr>
                          <tr className="py-1">
                            <td className="w-1/3 py-1 font-bold text-slate-700">Workmanship</td>
                            <td className="py-1 text-slate-800">{warrantyWorkmanship}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ───────────────────────────────────────────────────────────── */}
                {/* PAGE 8: QUOTATION & ACCEPTANCE                                */}
                {/* ───────────────────────────────────────────────────────────── */}
                {pageNum === 8 && (
                  <div className="space-y-5">
                    <div>
                      <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase" style={{ fontFamily: "Outfit", color: selectedTemplate === "template2" ? "#0284c7" : undefined }}>
                        QUOTATION
                      </h2>
                      <p className="text-xs text-slate-600 mt-1">
                        We have prepared a quotation for your consideration below.
                      </p>
                    </div>

                    {/* Your Solar System Quote Table */}
                    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                      <div className="p-3 font-bold text-xs uppercase tracking-wide bg-slate-50 border-b border-slate-200" style={{ color: selectedTemplate === "template2" ? "#0284c7" : "#0f172a" }}>
                        YOUR SOLAR SYSTEM QUOTE
                      </div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 text-left">
                            <th className="p-2 font-bold">Description</th>
                            <th className="p-2 font-bold text-center">Qty</th>
                            <th className="p-2 font-bold text-right">Price Incl. GST</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          <tr>
                            <td className="p-2 font-medium">{systemKw.toFixed(2)}kW Solar Power System</td>
                            <td className="p-2 text-center">1 Unit</td>
                            <td className="p-2 text-right font-semibold">{formatINR(grossCost)}</td>
                          </tr>
                          <tr className="bg-slate-50 font-medium">
                            <td colSpan={2} className="p-1.5 text-right text-slate-600">Sub-Total</td>
                            <td className="p-1.5 text-right">{formatINR(grossCost - gstAmount)}</td>
                          </tr>
                          <tr className="bg-slate-50 font-medium">
                            <td colSpan={2} className="p-1.5 text-right text-slate-600">GST Total ({pd.gst_pct || 13.8}%)</td>
                            <td className="p-1.5 text-right">{formatINR(gstAmount)}</td>
                          </tr>
                          {subsidyAmount > 0 && (
                            <tr className="text-emerald-700 font-bold">
                              <td colSpan={2} className="p-1.5 text-right">Govt. Central Subsidy / STC Incentive</td>
                              <td className="p-1.5 text-right">-{formatINR(subsidyAmount)}</td>
                            </tr>
                          )}
                          {customDiscount > 0 && (
                            <tr className="text-amber-700 font-bold">
                              <td colSpan={2} className="p-1.5 text-right">Special Discount</td>
                              <td className="p-1.5 text-right">-{formatINR(customDiscount)}</td>
                            </tr>
                          )}
                          <tr className="bg-slate-900 text-white font-extrabold text-sm">
                            <td colSpan={2} className="p-2.5 text-right">Upfront Balance Total</td>
                            <td className="p-2.5 text-right">{formatINR(netCost)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Customer Acceptance Block */}
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-4">
                      <div className="text-xs font-semibold text-slate-800">
                        I <b>{customerName}</b> accept the offer described in this document.
                      </div>

                      <div className="grid grid-cols-2 gap-6 pt-2">
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Signed:</span>
                          <div className="h-10 border-b-2 border-slate-400 flex items-end pb-1 font-serif text-slate-800 text-sm">
                            {customerName}
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Date:</span>
                          <div className="h-10 border-b-2 border-slate-400 flex items-end pb-1 text-xs text-slate-700 font-mono">
                            {propDate}
                          </div>
                        </div>
                      </div>

                      <p className="text-[9.5px] text-slate-400 leading-relaxed border-t border-slate-200 pt-2">
                        * Note: This proposal is valid until {validUntil}. Payment terms as outlined in project milestones. Grid tie-in and net metering timeline are subject to DISCOM inspection and statutory approvals.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* ── FOOTER ON PAGES 2-8 ───────────────────────────────────── */}
              {pageNum > 1 && (
                selectedTemplate === "template2" ? (
                  /* Template 2: Reference PDF footer with contact on left and solid blue square tab with page number on right */
                  <div className="w-full border-t border-slate-200 pt-2.5 mt-5 flex items-center justify-between text-[10px] text-slate-500">
                    <div className="truncate max-w-lg">
                      {repName} | {repPhone} | {repEmail} | {companyName} {co.gst_number ? `| GST: ${co.gst_number}` : ""}
                    </div>
                    <div className="w-7 h-7 bg-sky-500 text-white font-black text-xs flex items-center justify-center rounded-xs shadow-2xs shrink-0">
                      {pageNum}
                    </div>
                  </div>
                ) : (
                  /* Template 1: Solarix Premium clean footer */
                  <div className="w-full border-t border-slate-200 pt-3 mt-5 flex items-center justify-between text-[10px] text-slate-400">
                    <div>Confidential · Prepared specifically for {customerName}</div>
                    <div className="font-bold text-slate-600">Page {pageNum} of {totalPages}</div>
                  </div>
                )
              )}
            </div>
          );
        })}
      </main>
    </div>
  );
}
