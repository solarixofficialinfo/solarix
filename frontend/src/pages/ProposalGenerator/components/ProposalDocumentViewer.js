import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  FileText, Download, Printer, ArrowLeft, ArrowRight, Share2, Check,
  Sun, Zap, ShieldCheck, TreePine, Leaf, DollarSign, Calendar, Clock,
  MapPin, Phone, Mail, Building2, Eye, ChevronLeft, ChevronRight, Sparkles
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
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
  const totalPages = 11;

  const co = companyData || {};
  const pd = proposalData || {};
  const m = metrics || {};

  const [selectedTemplate, setSelectedTemplate] = useState(pd.template_id || "template1");

  useEffect(() => {
    if (pd.template_id && pd.template_id !== selectedTemplate) {
      setSelectedTemplate(pd.template_id);
    }
  }, [pd.template_id, selectedTemplate]);

  const companyName = co.company_name || co.name || "GVP Solar Energy Solutions";
  const customerName = pd.customer_name || "Valued Customer";
  const systemKw = Number(pd.system_kw) || 5.0;
  const propNumber = pd.proposal_number || `PROP-${pd.proposal_date || "2026"}`;
  const propDate = pd.proposal_date || new Date().toISOString().slice(0, 10);
  const netCost = Number(pd.net_customer_cost) || 172000;
  const roiPct = netCost > 0 ? ((m.annualSavings / netCost) * 100).toFixed(2) : "19.84";

  const handlePrint = () => {
    window.print();
  };

  const handleShareWhatsApp = () => {
    const text = `☀️ *SOLAR PV PROPOSAL FOR ${customerName.toUpperCase()}*\n\n` +
      `System Capacity: *${systemKw.toFixed(2)} kWp*\n` +
      `Est. Annual Generation: *${formatNumberIN(m.annualKwh)} units/year*\n` +
      `Est. Annual Savings: *${formatINR(m.annualSavings)}/year*\n` +
      `Net Cost to Customer: *${formatINR(netCost)}*\n` +
      `Estimated Payback: *${m.paybackYears} Years*\n\n` +
      `Prepared by: *${companyName}*\n` +
      `Proposal Ref: ${propNumber}\n\n` +
      `Please review your customer-ready proposal document!`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  // Recharts custom tooltip
  const CustomChartTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900 text-white p-2.5 rounded-lg shadow-xl text-xs border border-slate-700">
          <div className="font-bold text-blue-300">{label}</div>
          <div className="text-slate-200">Generation: <span className="font-semibold text-emerald-400">{payload[0]?.value} kWh</span></div>
          <div className="text-slate-200">Savings: <span className="font-semibold text-amber-300">{formatINR(payload[1]?.value)}</span></div>
        </div>
      );
    }
    return null;
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

        {/* Template Switcher Buttons */}
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => {
              setSelectedTemplate("template1");
              if (onSelectTemplate) onSelectTemplate("template1");
            }}
            className={`px-2.5 py-1 text-xs rounded-lg font-semibold transition ${
              selectedTemplate === "template1"
                ? "bg-sky-600 text-white shadow-xs"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Template 01 · Solar Professional
          </button>
          <button
            onClick={() => {
              setSelectedTemplate("template2");
              if (onSelectTemplate) onSelectTemplate("template2");
            }}
            className={`px-2.5 py-1 text-xs rounded-lg font-semibold transition ${
              selectedTemplate === "template2"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Template 02 · Modern Solar
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
            {viewMode === "continuous" ? "All Pages" : `Page ${currentPage} of ${totalPages}`}
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
              padding: 16mm 18mm !important;
              box-shadow: none !important;
              border: none !important;
              page-break-after: always !important;
              page-break-inside: avoid !important;
              break-after: page !important;
            }
          }
        `}</style>

        {/* Page Render Helper */}
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((pageNum) => {
          if (viewMode === "paged" && currentPage !== pageNum) {
            return null;
          }

          return (
            <div
              key={pageNum}
              className="a4-page relative w-full max-w-[820px] min-h-[1140px] bg-white text-slate-800 rounded-xl shadow-2xl p-10 sm:p-12 flex flex-col justify-between print:rounded-none print:shadow-none print:max-w-none"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              {/* Top Accent Line (Pages 2-11) */}
              {pageNum > 1 && (
                selectedTemplate === "template1" ? (
                  <div className="w-full border-b-2 border-sky-500 pb-2 mb-6 flex items-center justify-between text-[11px] text-slate-500">
                    <div className="flex items-center gap-1.5 font-bold text-sky-800 tracking-wide">
                      <Sun className="w-3.5 h-3.5 text-sky-600" />
                      <span>{companyName.toUpperCase()}</span>
                    </div>
                    <div className="font-semibold text-slate-400">
                      SOLAR PV TECHNICAL PROPOSAL · {propNumber}
                    </div>
                  </div>
                ) : (
                  <div className="w-full border-b border-slate-800/80 pb-2 mb-6 flex items-center justify-between text-[11px] text-slate-500">
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
                {/* PAGE 1: COVER / HERO */}
                {pageNum === 1 && (
                  selectedTemplate === "template1" ? (
                    /* ── TEMPLATE 01: SOLAR PROOF / REFERENCE PDF STYLE ────── */
                    <div className="flex-1 flex flex-col justify-between py-2">
                      <div className="space-y-6">
                        {/* Reference PDF Contact Details Header */}
                        <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-200">
                          <div>
                            <span className="text-[10px] font-bold text-sky-700 uppercase tracking-wider block">Prepared by:</span>
                            <div className="text-xs font-bold text-slate-900">{co.owner_name || "Solar EPC Specialist"}</div>
                            <div className="text-[11px] text-slate-600">{co.mobile || co.phone || "+91 98765 43210"}</div>
                            <div className="text-[11px] text-slate-600">{co.email || "info@solarix.energy"}</div>
                            <div className="text-[11px] text-sky-700 font-semibold">{companyName}</div>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-sky-700 uppercase tracking-wider block">Created for:</span>
                            <div className="text-xs font-bold text-slate-900">{customerName}</div>
                            <div className="text-[11px] text-slate-600">{pd.mobile || "Mobile Not Specified"}</div>
                            {pd.email && <div className="text-[11px] text-slate-600">{pd.email}</div>}
                            <div className="text-[11px] text-slate-600">{pd.site_address || "Site Address"}, {pd.city}</div>
                            <div className="text-[10.5px] text-slate-400 mt-1 font-mono">
                              Date: {propDate} · Ref: {propNumber}
                            </div>
                          </div>
                        </div>

                        {/* Reference PDF Angular Hero Card with Rooftop Solar Imagery */}
                        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-sky-600 to-blue-700 text-white p-6 shadow-xl">
                          <div className="max-w-xs space-y-2 relative z-10">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-sky-200 block">
                              ENGINEERING ROOFTOP SOLAR
                            </span>
                            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight" style={{ fontFamily: "Outfit" }}>
                              SOLAR POWER<br />PROPOSAL
                            </h1>
                            <div className="text-4xl font-black text-white tracking-tight pt-1">
                              {systemKw.toFixed(2)}kW
                            </div>
                          </div>
                          {/* Angled background badge */}
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
                              <span className="text-lg font-black text-emerald-700">{roiPct}%</span>
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
                            <div className="font-semibold text-slate-800 text-[11px] mt-0.5">{pd.panel?.quantity || 18} × {pd.panel?.wattage || 555}W DCR TOPCon Modules</div>
                            <div className="text-[10px] text-slate-500">{pd.inverter?.capacity || "10.0 kW"} On-Grid Smart Inverter with App</div>
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
                        <span className="font-semibold text-sky-700">Proposal Valid for 15 Days</span>
                      </div>
                    </div>
                  ) : (
                    /* ── TEMPLATE 02: MODERN SOLAR THEME ─────────────────────── */
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
                              <div className="flex justify-between"><span className="text-slate-500">Prepared By:</span> <span className="font-medium text-slate-800">{pd.prepared_by || "Solar Engineering Team"}</span></div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="text-center pt-6 border-t border-slate-200 text-xs text-slate-400">
                        <div><b>{companyName}</b> · {co.address || "Solar EPC Headquarters"} · {co.mobile || co.phone} · {co.email}</div>
                        <div className="text-[10px] mt-1 text-slate-400">Confidential · Strictly for client evaluation</div>
                      </div>
                    </div>
                  )
                )}

                {/* PAGE 2: EXECUTIVE SUMMARY */}
                {pageNum === 2 && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Outfit" }}>Executive Summary</h2>
                      <p className="text-xs text-slate-500">Comprehensive overview of plant specifications, expected power yield, and financial viability.</p>
                    </div>

                    {/* 4-Box Top KPI Grid */}
                    <div className="grid grid-cols-4 gap-3">
                      <div className="bg-blue-50/80 p-3.5 rounded-xl border border-blue-200 text-center">
                        <span className="text-[10px] font-bold text-blue-700 block uppercase">SYSTEM CAPACITY</span>
                        <span className="text-xl font-extrabold text-slate-900">{systemKw.toFixed(2)}</span>
                        <span className="text-[11px] text-slate-500 block">kWp DC</span>
                      </div>
                      <div className="bg-emerald-50/80 p-3.5 rounded-xl border border-emerald-200 text-center">
                        <span className="text-[10px] font-bold text-emerald-700 block uppercase">YEAR 1 GENERATION</span>
                        <span className="text-xl font-extrabold text-slate-900">{formatNumberIN(m.annualKwh)}</span>
                        <span className="text-[11px] text-slate-500 block">Units (kWh)</span>
                      </div>
                      <div className="bg-amber-50/80 p-3.5 rounded-xl border border-amber-200 text-center">
                        <span className="text-[10px] font-bold text-amber-700 block uppercase">ANNUAL SAVINGS</span>
                        <span className="text-xl font-extrabold text-slate-900">{formatINR(m.annualSavings)}</span>
                        <span className="text-[11px] text-slate-500 block">Electricity Bill</span>
                      </div>
                      <div className="bg-indigo-50/80 p-3.5 rounded-xl border border-indigo-200 text-center">
                        <span className="text-[10px] font-bold text-indigo-700 block uppercase">EST. PAYBACK</span>
                        <span className="text-xl font-extrabold text-indigo-700">{m.paybackYears}</span>
                        <span className="text-[11px] text-slate-500 block">Years</span>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-700 leading-relaxed space-y-2">
                      <p>
                        We present this engineering proposal to <b>{customerName}</b> for establishing a state-of-the-art <b>{systemKw.toFixed(2)} kWp</b> Grid-Connected Solar Photovoltaic Plant. The installation incorporates Tier-1 ALMM approved high-wattage modules and an intelligent MPPT string inverter with real-time cloud data logging.
                      </p>
                      <p>
                        Over its guaranteed 25-year operational lifecycle, the rooftop solar array will produce over <b>{formatNumberIN(m.annualKwh * 23.5)} units</b> of electricity, delivering approximately <b>{formatINR(m.lifetimeSavings)}</b> in cumulative bill offsets.
                      </p>
                    </div>

                    {/* Comparison Table */}
                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                          <tr>
                            <th className="px-3.5 py-2.5">Key Performance Indicator</th>
                            <th className="px-3.5 py-2.5">Design Specification / Projected Return</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          <tr><td className="px-3.5 py-2 text-slate-600">Client & Site Location</td><td className="px-3.5 py-2 font-semibold text-slate-900">{customerName} · {pd.city || "Site"}</td></tr>
                          <tr><td className="px-3.5 py-2 text-slate-600">Total Solar PV Modules</td><td className="px-3.5 py-2 font-semibold text-slate-900">{pd.panel?.quantity || 9} Modules ({pd.panel?.wattage || 555}W {pd.panel?.make || "Tier-1"})</td></tr>
                          <tr><td className="px-3.5 py-2 text-slate-600">Solar Inverter Rating</td><td className="px-3.5 py-2 font-semibold text-slate-900">{pd.inverter?.capacity || `${systemKw.toFixed(1)} kW`} ({pd.inverter?.make || "UTL Solar"}, {pd.inverter?.phase || "Single Phase"})</td></tr>
                          <tr><td className="px-3.5 py-2 text-slate-600">Gross Project Cost</td><td className="px-3.5 py-2 font-semibold text-slate-900">{formatINR(pd.gross_cost || 250000)} (Including GST)</td></tr>
                          <tr><td className="px-3.5 py-2 text-slate-600">Central Government Subsidy</td><td className="px-3.5 py-2 font-bold text-emerald-600">{pd.subsidy_applicable ? formatINR(pd.subsidy_amount || 78000) : "Not Applicable"}</td></tr>
                          <tr className="bg-blue-50/50"><td className="px-3.5 py-2 font-bold text-blue-900">Net Cost to Customer</td><td className="px-3.5 py-2 font-bold text-blue-700 text-sm">{formatINR(netCost)}</td></tr>
                          <tr><td className="px-3.5 py-2 text-slate-600">25-Year Cumulative Savings</td><td className="px-3.5 py-2 font-semibold text-emerald-700">{formatINR(m.lifetimeSavings)}</td></tr>
                          <tr><td className="px-3.5 py-2 text-slate-600">Environmental CO₂ Mitigation</td><td className="px-3.5 py-2 text-slate-900">{m.co2Tons} Tonnes / Year (Equivalent to ~{m.treesEquivalent} Trees)</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* PAGE 3: WHY CHOOSE US */}
                {pageNum === 3 && (
                  <div className="space-y-5">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Outfit" }}>Why Choose {companyName}</h2>
                      <p className="text-xs text-slate-500">Uncompromising solar EPC engineering, certified components, and long-term customer dedication.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {[
                        { title: "MNRE Approved Solar EPC", desc: "Recognized and certified under Ministry of New & Renewable Energy channel partner standards with verified engineering quality." },
                        { title: "Comprehensive Energy Audit", desc: "Detailed site assessment and energy requirement auditing to design optimal solar capacity without over-sizing or under-sizing." },
                        { title: "Customized Engineering Solutions", desc: "Tailored rooftop structural designs engineered specifically for wind loads up to 150 km/h with zero roof puncture options." },
                        { title: "End-to-End Net-Metering Support", desc: "Complete liaisoning with state DISCOM for solar application, sanction, meter testing, and bi-directional meter commissioning." },
                        { title: "Direct Government Subsidy Assistance", desc: "Dedicated team assisting in PM Surya Ghar / National Portal registration, document verification, and subsidy release." },
                        { title: "Accelerated Tax Depreciation Benefit", desc: "For commercial entities, solar assets qualify for 40% accelerated depreciation benefit under Section 32 of Income Tax Act." },
                        { title: "Tier-1 Certified Components", desc: "Strict adherence to ALMM listed DCR solar modules, high-efficiency MPPT string inverters, and UV-resistant fire-retardant cabling." },
                        { title: "24/7 Mobile Cloud Monitoring", desc: "Real-time generation tracking, fault detection, and performance analytics directly via smartphone application." },
                      ].map((item, idx) => (
                        <div key={idx} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0">
                              ✓
                            </div>
                            <h3 className="font-bold text-slate-900 text-xs">{item.title}</h3>
                          </div>
                          <p className="text-[11px] text-slate-600 leading-relaxed pl-7">{item.desc}</p>
                        </div>
                      ))}
                    </div>

                    <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center gap-3">
                      <ShieldCheck className="w-6 h-6 text-blue-600 shrink-0" />
                      <div>
                        <span className="font-bold">5-Year Workmanship & Comprehensive EPC Warranty</span>
                        <span className="block text-[11px] text-blue-700 mt-0.5">We stand behind every component we erect with round-the-clock technical support.</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* PAGE 4: SYSTEM DESIGN */}
                {pageNum === 4 && (
                  <div className="space-y-5">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Outfit" }}>System Design & Engineering</h2>
                      <p className="text-xs text-slate-500">Rooftop module layout matrix, mechanical orientation, and engineering parameters.</p>
                    </div>

                    {/* Snapshots Grid */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 text-center">
                        <span className="text-[10px] font-bold text-slate-500 block mb-2 uppercase">2D ROOF PLAN & PANEL GRID</span>
                        {pd.snapshot_2d ? (
                          <img src={pd.snapshot_2d} alt="2D Roof Plan" className="w-full h-40 object-cover rounded-lg border border-slate-200" />
                        ) : (
                          <div className="w-full h-40 bg-slate-200 rounded-lg flex flex-col items-center justify-center text-slate-400 text-xs">
                            <Sun className="w-6 h-6 mb-1 text-slate-400" />
                            <span>Geospatial Layout</span>
                          </div>
                        )}
                      </div>

                      <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 text-center">
                        <span className="text-[10px] font-bold text-slate-500 block mb-2 uppercase">3D ROOFTOP SIMULATION</span>
                        {pd.snapshot_3d ? (
                          <img src={pd.snapshot_3d} alt="3D Rooftop Simulation" className="w-full h-40 object-cover rounded-lg border border-slate-200" />
                        ) : (
                          <div className="w-full h-40 bg-slate-200 rounded-lg flex flex-col items-center justify-center text-slate-400 text-xs">
                            <Sparkles className="w-6 h-6 mb-1 text-slate-400" />
                            <span>3D Visualization</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Technical Parameter Grid */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
                        <div className="font-bold text-blue-900 text-[11px] uppercase tracking-wider">MECHANICAL DESIGN</div>
                        <div className="flex justify-between border-b border-slate-100 pb-1"><span className="text-slate-500">System Rating:</span> <span className="font-semibold">{systemKw.toFixed(2)} kWp DC</span></div>
                        <div className="flex justify-between border-b border-slate-100 pb-1"><span className="text-slate-500">Module Orientation:</span> <span className="font-semibold">Portrait (True South)</span></div>
                        <div className="flex justify-between border-b border-slate-100 pb-1"><span className="text-slate-500">Tilt Angle:</span> <span className="font-semibold">15° Fixed Optimized</span></div>
                        <div className="flex justify-between border-b border-slate-100 pb-1"><span className="text-slate-500">Mounting Structure:</span> <span className="font-semibold">{pd.structure?.type || "Elevated Super Structure"}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Clearance Height:</span> <span className="font-semibold">{pd.structure?.height || "1.8m Clearance"}</span></div>
                      </div>

                      <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
                        <div className="font-bold text-blue-900 text-[11px] uppercase tracking-wider">ELECTRICAL PARAMETERS</div>
                        <div className="flex justify-between border-b border-slate-100 pb-1"><span className="text-slate-500">AC Output Voltage:</span> <span className="font-semibold">{pd.inverter?.phase?.includes("Three") ? "415V, 3-Phase" : "230V, Single Phase"}</span></div>
                        <div className="flex justify-between border-b border-slate-100 pb-1"><span className="text-slate-500">Grid Frequency:</span> <span className="font-semibold">50 Hz ± 5%</span></div>
                        <div className="flex justify-between border-b border-slate-100 pb-1"><span className="text-slate-500">Power Factor:</span> <span className="font-semibold">&gt; 0.99 (Unity)</span></div>
                        <div className="flex justify-between border-b border-slate-100 pb-1"><span className="text-slate-500">Inverter IP Rating:</span> <span className="font-semibold">IP65 Weatherproof</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Lightning & Surge:</span> <span className="font-semibold">Type-II SPD & Copper LA</span></div>
                      </div>
                    </div>
                  </div>
                )}

                {/* PAGE 5: EQUIPMENT & WARRANTIES */}
                {pageNum === 5 && (
                  <div className="space-y-5">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Outfit" }}>Equipment Specifications & Warranties</h2>
                      <p className="text-xs text-slate-500">Tier-1 solar components, certified switchgear, and comprehensive warranty schedule.</p>
                    </div>

                    <div className="rounded-xl border border-slate-200 overflow-hidden text-xs">
                      <table className="w-full text-left">
                        <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                          <tr>
                            <th className="px-3.5 py-2.5">Component</th>
                            <th className="px-3.5 py-2.5">Make & Model</th>
                            <th className="px-3.5 py-2.5">Quantity</th>
                            <th className="px-3.5 py-2.5">Warranty Coverage</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          <tr>
                            <td className="px-3.5 py-2.5 font-bold text-slate-900">Solar PV Modules</td>
                            <td className="px-3.5 py-2.5">{pd.panel?.make || "INA Solar"} · {pd.panel?.model || "555W TOPCon"}</td>
                            <td className="px-3.5 py-2.5 font-semibold">{pd.panel?.quantity || 9} Nos</td>
                            <td className="px-3.5 py-2.5 font-bold text-blue-700">12 Yrs Product · 30 Yrs Perf.</td>
                          </tr>
                          <tr>
                            <td className="px-3.5 py-2.5 font-bold text-slate-900">Solar Inverter</td>
                            <td className="px-3.5 py-2.5">{pd.inverter?.make || "UTL Solar"} ({pd.inverter?.capacity || `${systemKw} kW`})</td>
                            <td className="px-3.5 py-2.5 font-semibold">1 Set</td>
                            <td className="px-3.5 py-2.5 font-bold text-blue-700">10 Years Product Warranty</td>
                          </tr>
                          <tr>
                            <td className="px-3.5 py-2.5 font-bold text-slate-900">Mounting Structure</td>
                            <td className="px-3.5 py-2.5">{pd.structure?.type || "Elevated"} · {pd.structure?.material || "Aluminium & HDGI"}</td>
                            <td className="px-3.5 py-2.5 font-semibold">1 Lot</td>
                            <td className="px-3.5 py-2.5 font-bold text-slate-700">5 Years Structural Warranty</td>
                          </tr>
                          <tr>
                            <td className="px-3.5 py-2.5 font-bold text-slate-900">Solar DC & AC Cables</td>
                            <td className="px-3.5 py-2.5">{pd.cables?.brand || "Siechem / Polycab"} (4/6 sq.mm)</td>
                            <td className="px-3.5 py-2.5 font-semibold">As per site</td>
                            <td className="px-3.5 py-2.5 font-bold text-slate-700">18 Months Workmanship</td>
                          </tr>
                          <tr>
                            <td className="px-3.5 py-2.5 font-bold text-slate-900">DC Distribution Box</td>
                            <td className="px-3.5 py-2.5">IP65 Enclosure with 1000V DC SPD & Fuses</td>
                            <td className="px-3.5 py-2.5 font-semibold">1 Set</td>
                            <td className="px-3.5 py-2.5 font-bold text-slate-700">1 Year System Warranty</td>
                          </tr>
                          <tr>
                            <td className="px-3.5 py-2.5 font-bold text-slate-900">AC Distribution Box</td>
                            <td className="px-3.5 py-2.5">IP65 Enclosure with MCB, Isolator & Type-2 SPD</td>
                            <td className="px-3.5 py-2.5 font-semibold">1 Set</td>
                            <td className="px-3.5 py-2.5 font-bold text-slate-700">1 Year System Warranty</td>
                          </tr>
                          <tr>
                            <td className="px-3.5 py-2.5 font-bold text-slate-900">Chemical Earthing</td>
                            <td className="px-3.5 py-2.5">Dual Earth Pits with Copper-Bonded Electrodes</td>
                            <td className="px-3.5 py-2.5 font-semibold">2 Sets</td>
                            <td className="px-3.5 py-2.5 font-bold text-slate-700">1 Year System Warranty</td>
                          </tr>
                          <tr>
                            <td className="px-3.5 py-2.5 font-bold text-slate-900">Lightning Arrestor</td>
                            <td className="px-3.5 py-2.5">Class-I Copper Spike Arrestor with Base Plate</td>
                            <td className="px-3.5 py-2.5 font-semibold">1 Set</td>
                            <td className="px-3.5 py-2.5 font-bold text-slate-700">1 Year System Warranty</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                      <b>Warranty Terms:</b> Solar module 30-year performance guarantee ensures minimum 90% peak output at Year 10 and 80-85% at Year 25/30. All manufacturer warranty certificates will be handed over upon plant commissioning.
                    </div>
                  </div>
                )}

                {/* PAGE 6: SOLAR SAVINGS & ROI */}
                {pageNum === 6 && (
                  <div className="space-y-5">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Outfit" }}>Solar Savings & Return on Investment (ROI)</h2>
                      <p className="text-xs text-slate-500">Detailed financial analysis of electricity cost reduction, payback, and 25-year lifetime yield.</p>
                    </div>

                    {/* Green Metrics Card */}
                    <div className="grid grid-cols-4 gap-3 bg-emerald-50/70 border border-emerald-200 p-4 rounded-xl text-center">
                      <div>
                        <span className="text-[10px] font-bold text-emerald-800 uppercase block">YEARLY ENERGY</span>
                        <span className="text-xl font-black text-emerald-700">{formatNumberIN(m.annualKwh)}</span>
                        <span className="text-[11px] text-emerald-600 block">kWh Units</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-emerald-800 uppercase block">YEAR 1 SAVINGS</span>
                        <span className="text-xl font-black text-emerald-700">{formatINR(m.annualSavings)}</span>
                        <span className="text-[11px] text-emerald-600 block">At current tariff</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-emerald-800 uppercase block">CARBON OFFSET</span>
                        <span className="text-xl font-black text-emerald-700">{m.co2Tons} T</span>
                        <span className="text-[11px] text-emerald-600 block">CO₂ per Year</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-emerald-800 uppercase block">TREES EQUIVALENT</span>
                        <span className="text-xl font-black text-emerald-700">{m.treesEquivalent}</span>
                        <span className="text-[11px] text-emerald-600 block">Trees Planted</span>
                      </div>
                    </div>

                    {/* 10-Year Projections Table */}
                    <div className="rounded-xl border border-slate-200 overflow-hidden text-xs">
                      <div className="bg-slate-100 px-3.5 py-2 font-bold text-slate-700">10-Year Financial Forecast (Assumes 3% Annual Tariff Escalation)</div>
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                          <tr>
                            <th className="px-3.5 py-2">Year</th>
                            <th className="px-3.5 py-2">Est. Generation</th>
                            <th className="px-3.5 py-2">Grid Tariff</th>
                            <th className="px-3.5 py-2">Annual Savings</th>
                            <th className="px-3.5 py-2">Cumulative Savings</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(m.yearlyProjections || []).slice(0, 8).map((row) => (
                            <tr key={row.year}>
                              <td className="px-3.5 py-1.5 font-semibold text-slate-800">Year {row.year}</td>
                              <td className="px-3.5 py-1.5 text-slate-600">{formatNumberIN(row.generationKwh)} units</td>
                              <td className="px-3.5 py-1.5 text-slate-600">₹{row.tariff.toFixed(2)}/u</td>
                              <td className="px-3.5 py-1.5 text-slate-800 font-medium">{formatINR(row.annualSavings)}</td>
                              <td className="px-3.5 py-1.5 font-bold text-emerald-700">{formatINR(row.cumulativeSavings)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center justify-between">
                      <div>
                        <span className="font-bold">25-Year Cumulative Savings:</span>
                        <span className="text-sm font-black text-blue-700 ml-2">{formatINR(m.lifetimeSavings)}</span>
                      </div>
                      <Badge className="bg-emerald-600 text-white font-semibold">
                        Payback in ~{m.paybackYears} Years
                      </Badge>
                    </div>
                  </div>
                )}

                {/* PAGE 7: MONTHLY GENERATION & SAVINGS */}
                {pageNum === 7 && (
                  <div className="space-y-5">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Outfit" }}>Monthly Generation & Savings Profile</h2>
                      <p className="text-xs text-slate-500">Estimated month-by-month power harvest based on regional solar irradiance models.</p>
                    </div>

                    {/* Chart Container */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <div className="text-[11px] font-bold text-slate-600 uppercase mb-3 tracking-wider">MONTHLY GENERATION (kWh) & SAVINGS (₹)</div>
                      <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={m.monthlyData || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#64748b" }} />
                            <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                            <Tooltip content={<CustomChartTooltip />} />
                            <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                            <Bar dataKey="generation" name="Generation (Units)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="savings" name="Savings (₹)" fill="#10b981" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* 12 Months Data Table */}
                    <div className="rounded-xl border border-slate-200 overflow-hidden text-[11px]">
                      <table className="w-full text-left">
                        <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                          <tr>
                            <th className="px-3 py-1.5">Month</th>
                            <th className="px-3 py-1.5">Est. Generation (kWh)</th>
                            <th className="px-3 py-1.5">Est. Bill Savings</th>
                            <th className="px-3 py-1.5">Solar Radiation Condition</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(m.monthlyData || []).map((row) => (
                            <tr key={row.month}>
                              <td className="px-3 py-1 font-semibold text-slate-800">{row.fullMonth}</td>
                              <td className="px-3 py-1 font-mono text-blue-700">{row.generation} units</td>
                              <td className="px-3 py-1 font-bold text-emerald-700">{formatINR(row.savings)}</td>
                              <td className="px-3 py-1 text-slate-500">{row.tag}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* PAGE 8: COMMERCIAL OFFER */}
                {pageNum === 8 && (
                  <div className="space-y-5">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Outfit" }}>Commercial Offer & Payment Schedule</h2>
                      <p className="text-xs text-slate-500">Transparent system investment, applicable subsidy deduction, and project milestone schedule.</p>
                    </div>

                    {/* Commercial Breakdown */}
                    <div className="rounded-xl border border-slate-200 overflow-hidden text-xs">
                      <table className="w-full text-left">
                        <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-3">Cost Component</th>
                            <th className="px-4 py-3 text-right">Amount (₹)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          <tr>
                            <td className="px-4 py-2.5 text-slate-700 font-medium">
                              Solar PV System Package ({systemKw.toFixed(2)} kWp with Modules, Inverter, Structure & Cables)
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold">{formatINR(pd.system_price || 250000)}</td>
                          </tr>
                          {Number(pd.additional_charges || 0) > 0 && (
                            <tr>
                              <td className="px-4 py-2 text-slate-600">Additional Structural Elevation / Civil Foundation</td>
                              <td className="px-4 py-2 text-right font-semibold">{formatINR(pd.additional_charges)}</td>
                            </tr>
                          )}
                          {Number(pd.net_meter_charges || 0) > 0 && (
                            <tr>
                              <td className="px-4 py-2 text-slate-600">DISCOM Liaisoning & Net Metering Charges</td>
                              <td className="px-4 py-2 text-right font-semibold">{formatINR(pd.net_meter_charges)}</td>
                            </tr>
                          )}
                          <tr>
                            <td className="px-4 py-2 text-slate-600">Goods and Services Tax (GST @ {pd.gst_pct || 13.8}%)</td>
                            <td className="px-4 py-2 text-right font-semibold">{formatINR(pd.gst_amount || 34500)}</td>
                          </tr>
                          <tr className="bg-slate-50 font-bold text-slate-900">
                            <td className="px-4 py-2.5">Gross Project Cost (Including GST)</td>
                            <td className="px-4 py-2.5 text-right">{formatINR(pd.gross_cost || 284500)}</td>
                          </tr>
                          {pd.subsidy_applicable && (
                            <tr className="text-emerald-700 bg-emerald-50/50">
                              <td className="px-4 py-2.5 font-bold">
                                Central Govt. Subsidy (PM Surya Ghar Muft Bijli Yojana)
                                <span className="block text-[10px] text-emerald-600 font-normal">Directly credited to consumer bank account post-commissioning</span>
                              </td>
                              <td className="px-4 py-2.5 text-right font-extrabold text-sm">- {formatINR(pd.subsidy_amount || 78000)}</td>
                            </tr>
                          )}
                          <tr className="bg-blue-50/80 border-t-2 border-blue-500">
                            <td className="px-4 py-3.5">
                              <span className="text-sm font-black text-blue-900 uppercase block">FINAL NET COST TO CUSTOMER</span>
                              <span className="text-[11px] text-blue-700">Total out-of-pocket investment after subsidy</span>
                            </td>
                            <td className="px-4 py-3.5 text-right">
                              <span className="text-xl font-black text-blue-700">{formatINR(netCost)}</span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Milestone Payment Schedule */}
                    <div className="rounded-xl border border-slate-200 overflow-hidden text-xs">
                      <div className="bg-slate-100 px-4 py-2 font-bold text-slate-700">Project Payment Schedule</div>
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-2">Milestone</th>
                            <th className="px-4 py-2">Stage Description</th>
                            <th className="px-4 py-2">Percentage</th>
                            <th className="px-4 py-2 text-right">Amount (₹)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(pd.milestones || [
                            { stage: "Milestone 1", label: "20% Advance with Confirmed Work Order", pct: 20 },
                            { stage: "Milestone 2", label: "70% Upon Material Readiness & Dispatch to Site", pct: 70 },
                            { stage: "Milestone 3", label: "5% Upon Complete Mechanical & Electrical Installation", pct: 5 },
                            { stage: "Milestone 4", label: "5% Upon Net-Meter Installation & Commissioning", pct: 5 },
                          ]).map((mItem, idx) => {
                            const mAmt = Math.round((netCost * Number(mItem.pct)) / 100);
                            return (
                              <tr key={idx}>
                                <td className="px-4 py-2 font-bold text-slate-900">{mItem.stage}</td>
                                <td className="px-4 py-2 text-slate-700">{mItem.label}</td>
                                <td className="px-4 py-2 font-semibold text-blue-700">{mItem.pct}%</td>
                                <td className="px-4 py-2 text-right font-bold text-slate-900">{formatINR(mAmt)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* PAGE 9: PROJECT TIMELINE & SCOPE MATRIX */}
                {pageNum === 9 && (
                  <div className="space-y-5">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Outfit" }}>Project Timeline & Scope Matrix</h2>
                      <p className="text-xs text-slate-500">Stage-by-stage execution schedule and demarcation of responsibilities.</p>
                    </div>

                    {/* Timeline Visual */}
                    <div className="grid grid-cols-4 gap-3 text-xs">
                      {[
                        { stage: "Phase 1", title: "Design & Drawings", days: "7 Days", desc: "Shadow modeling & structural drawing signoff" },
                        { stage: "Phase 2", title: "Procurement & Supply", days: "15 Days", desc: "Tier-1 material dispatch to site" },
                        { stage: "Phase 3", title: "Installation & Wiring", days: "20 Days", desc: "Structure, modules, ACDB/DCDB & earthing" },
                        { stage: "Phase 4", title: "Net Metering & Handover", days: "14 Days", desc: "DISCOM inspection & app configuration" },
                      ].map((t, idx) => (
                        <div key={idx} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 relative">
                          <Badge className="bg-blue-600 text-white text-[10px] py-0 mb-1.5 font-bold">{t.stage}</Badge>
                          <div className="font-bold text-slate-900 text-xs">{t.title}</div>
                          <div className="text-[11px] text-emerald-700 font-bold mt-0.5">{t.days}</div>
                          <p className="text-[10px] text-slate-500 mt-1 leading-snug">{t.desc}</p>
                        </div>
                      ))}
                    </div>

                    {/* Scope Comparison Cards */}
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div className="p-4 bg-blue-50/60 rounded-xl border border-blue-200">
                        <div className="text-[11px] font-bold text-blue-900 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                          <Check className="w-4 h-4 text-blue-600" /> OUR SCOPE OF WORK ({companyName.toUpperCase()})
                        </div>
                        <ul className="space-y-1.5 text-slate-700">
                          {(pd.our_scope || []).map((s, idx) => (
                            <li key={idx} className="flex items-start gap-1.5">
                              <span className="text-blue-600 font-bold">✓</span>
                              <span className="text-[11px]">{typeof s === "string" ? s : s.text}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="p-4 bg-amber-50/60 rounded-xl border border-amber-200">
                        <div className="text-[11px] font-bold text-amber-900 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                          <Building2 className="w-4 h-4 text-amber-600" /> CUSTOMER SCOPE OF RESPONSIBILITY
                        </div>
                        <ul className="space-y-1.5 text-slate-700">
                          {(pd.customer_scope || []).map((cs, idx) => (
                            <li key={idx} className="flex items-start gap-1.5">
                              <span className="text-amber-600 font-bold">•</span>
                              <span className="text-[11px]">{typeof cs === "string" ? cs : cs.text}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* PAGE 10: TERMS & CONDITIONS */}
                {pageNum === 10 && (
                  <div className="space-y-5">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Outfit" }}>General Terms & Conditions</h2>
                      <p className="text-xs text-slate-500">Commercial parameters, delivery conditions, and contractual guidelines.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                      {(pd.terms || []).map((term, idx) => (
                        <div key={idx} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                          <div className="font-bold text-slate-900 text-xs mb-1 flex items-center gap-1.5">
                            <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[10px] font-mono shrink-0">{idx + 1}</span>
                            <span>{term.title}</span>
                          </div>
                          <p className="text-[11px] text-slate-600 leading-relaxed pl-5">{term.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* PAGE 11: ACCEPTANCE & CONTACT */}
                {pageNum === 11 && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Outfit" }}>Project Acceptance & Formal Signoff</h2>
                      <p className="text-xs text-slate-500">Company payment details, banking coordinates, and contract authorization.</p>
                    </div>

                    {/* Bank Details Card */}
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                      <div className="font-bold text-blue-900 text-xs uppercase tracking-wider mb-3">OFFICIAL PAYMENT & BANK DETAILS</div>
                      <div className="grid grid-cols-2 gap-3 text-slate-700">
                        <div><span className="text-slate-500">Account Name:</span> <span className="font-bold text-slate-900 ml-1">{co.company_name || companyName}</span></div>
                        <div><span className="text-slate-500">Bank Name:</span> <span className="font-bold text-slate-900 ml-1">{co.bank_name || "State Bank of India / HDFC"}</span></div>
                        <div><span className="text-slate-500">Account Number:</span> <span className="font-mono font-bold text-slate-900 ml-1">{co.account_number || "XXXXXXXXXX (On Request)"}</span></div>
                        <div><span className="text-slate-500">IFSC Code:</span> <span className="font-mono font-bold text-slate-900 ml-1">{co.ifsc_code || "SBIN000XXXX"}</span></div>
                        <div><span className="text-slate-500">GSTIN:</span> <span className="font-mono font-semibold text-slate-800 ml-1">{co.gst_number || "27XXXXX0000X1ZX"}</span></div>
                        <div><span className="text-slate-500">Contact:</span> <span className="font-semibold text-slate-800 ml-1">{co.mobile || co.phone}</span></div>
                      </div>
                    </div>

                    {/* Dual Signature Block */}
                    <div className="grid grid-cols-2 gap-6 pt-6 text-xs">
                      <div className="p-6 bg-white border border-slate-200 rounded-xl flex flex-col justify-between h-44 text-center">
                        <div className="font-bold text-blue-900 uppercase tracking-wider text-[11px]">FOR {companyName.toUpperCase()}</div>
                        <div className="border-t border-slate-300 pt-2 text-slate-500">
                          <div className="font-semibold text-slate-800">{co.owner_name || pd.prepared_by || "Authorized Signatory"}</div>
                          <div className="text-[10px]">Authorized Technical Signatory & Stamp</div>
                        </div>
                      </div>

                      <div className="p-6 bg-white border border-slate-200 rounded-xl flex flex-col justify-between h-44 text-center">
                        <div className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">CUSTOMER WORK ORDER ACCEPTANCE</div>
                        <div className="border-t border-slate-300 pt-2 text-slate-500">
                          <div className="font-semibold text-slate-800">{customerName}</div>
                          <div className="text-[10px]">Customer Signature & Date</div>
                        </div>
                      </div>
                    </div>

                    <div className="text-center pt-8 border-t border-slate-200 text-xs text-slate-500">
                      <p className="font-bold text-blue-900">Thank you for placing your trust in {companyName} as your clean energy partner.</p>
                      <p className="text-[11px] text-slate-400 mt-1">Together we build a sustainable, self-reliant, and green future.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Footer Line (Pages 2-11) */}
              {pageNum > 1 && (
                selectedTemplate === "template1" ? (
                  <div className="w-full border-t border-slate-200 pt-2.5 mt-6 flex items-center justify-between text-[10px] text-slate-500">
                    <div className="truncate max-w-lg">
                      {co.owner_name || "Solar EPC"} {co.mobile ? `| ${co.mobile}` : ""} {co.email ? `| ${co.email}` : ""} | {companyName} {co.gst_number ? `| GSTIN: ${co.gst_number}` : ""}
                    </div>
                    <div className="w-7 h-7 bg-sky-500 text-white font-black text-xs flex items-center justify-center rounded-xs shadow-2xs shrink-0">
                      {pageNum}
                    </div>
                  </div>
                ) : (
                  <div className="w-full border-t border-slate-200 pt-3 mt-6 flex items-center justify-between text-[10px] text-slate-400">
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
