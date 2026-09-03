import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FileText, Eye, Maximize2, Download, CheckCircle2,
  Sun, Zap, ShieldCheck, DollarSign, Calendar, MapPin, Building2,
  Layers, ChevronRight, ChevronLeft
} from "lucide-react";
import { formatINR, formatNumberIN } from "../utils/proposalCalculations";

export default function LiveProposalPreviewCard({
  form,
  metrics,
  companyData,
  onOpenFullViewer,
  onGenerateProposal,
  generating = false,
}) {
  const [activePreviewTab, setActivePreviewTab] = useState("cover"); // 'cover' | 'kpi' | 'system' | 'equipment' | 'financial' | 'scope'

  const co = companyData || {};
  const companyName = co.company_name || co.name || "GVP Solar Energy Solutions";
  const customerName = form.customer_name || "Customer Name";
  const siteAddress = form.site_address || "Site Location";
  const systemKw = Number(form.system_kw) || 5.0;
  const propNumber = form.proposal_number || "PROP-260301-001";
  const propDate = form.proposal_date || new Date().toISOString().slice(0, 10);
  const m = metrics || {};
  const netCost = Number(form.net_customer_cost || form.system_price || 250000);

  const tabs = [
    { key: "cover", label: "Cover" },
    { key: "kpi", label: "Executive" },
    { key: "system", label: "Design" },
    { key: "equipment", label: "Equipment" },
    { key: "financial", label: "Financial" },
    { key: "scope", label: "Scope" },
  ];

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-xl overflow-hidden flex flex-col text-slate-100 sticky top-4 h-[calc(100vh-6rem)]">
      {/* ── PREVIEW HEADER BAR ─────────────────────────────────────────────── */}
      <div className="bg-slate-950/90 border-b border-slate-800 px-3.5 py-2.5 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <span className="text-[11px] font-bold text-white uppercase tracking-wider truncate" style={{ fontFamily: "Outfit" }}>
            Live Proposal Preview
          </span>
          <Badge variant="outline" className="text-[9px] bg-blue-900/50 text-blue-300 border-blue-700/60 font-semibold px-1.5 py-0 shrink-0">
            {systemKw.toFixed(2)} kWp
          </Badge>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={onOpenFullViewer}
            className="h-7 px-2 text-[10px] text-blue-300 hover:text-white hover:bg-slate-800 rounded-lg gap-1"
            title="Open full 11-page proposal document viewer"
          >
            <Maximize2 className="w-3 h-3" /> Fullscreen
          </Button>
          <Button
            size="sm"
            onClick={onGenerateProposal}
            disabled={generating}
            className="h-7 px-2.5 text-[10px] font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg gap-1 shadow-xs"
          >
            <Download className="w-3 h-3" /> {generating ? "Generating…" : "PDF"}
          </Button>
        </div>
      </div>

      {/* ── PAGE TAB SWITCHER ──────────────────────────────────────────────── */}
      <div className="bg-slate-950/50 px-2 py-1.5 border-b border-slate-800/80 flex items-center gap-1 overflow-x-auto scrollbar-none shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActivePreviewTab(tab.key)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all whitespace-nowrap ${
              activePreviewTab === tab.key
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── LIVE PREVIEW PAPER CANVAS ──────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 bg-slate-950/40">
        <div className="max-w-md mx-auto bg-white text-slate-900 rounded-xl shadow-2xl border border-slate-200 p-5 transition-all">

          {/* TAB 1: COVER PAGE */}
          {activePreviewTab === "cover" && (
            <div className="space-y-4">
              <div className="flex items-start justify-between border-b border-slate-200 pb-3">
                <div>
                  <span className="text-[10px] font-bold tracking-wider text-blue-700 uppercase block">
                    {companyName}
                  </span>
                  <div className="text-[9px] text-slate-500">Commercial & Technical Proposal</div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] font-mono font-bold text-slate-700">{propNumber}</div>
                  <div className="text-[8px] text-slate-500">{propDate}</div>
                </div>
              </div>

              <div className="py-6 text-center space-y-2 bg-gradient-to-b from-blue-50/60 to-white rounded-xl p-4 border border-blue-100">
                <span className="inline-block bg-blue-100 text-blue-800 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Grid-Connected Solar PV System
                </span>
                <div className="text-2xl font-black text-slate-900 tracking-tight" style={{ fontFamily: "Outfit" }}>
                  {systemKw.toFixed(2)} kWp
                </div>
                <p className="text-[11px] font-bold text-blue-700">
                  Engineering-Grade Rooftop Solar Installation
                </p>
              </div>

              {/* Cover Highlights */}
              <div className="grid grid-cols-2 gap-2 text-left">
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80">
                  <span className="text-[8px] font-bold text-slate-500 uppercase block">Prepared For</span>
                  <div className="text-[11px] font-bold text-slate-900 truncate">{customerName}</div>
                  <div className="text-[9px] text-slate-600 truncate">{siteAddress}</div>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80">
                  <span className="text-[8px] font-bold text-slate-500 uppercase block">Project Scope</span>
                  <div className="text-[11px] font-bold text-slate-900">Complete EPC Turnkey</div>
                  <div className="text-[9px] text-slate-600">Supply, Install & Liaison</div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3 flex items-center justify-between text-[8.5px] text-slate-400">
                <span>Solarix EPC Intelligence</span>
                <span>Page 1 of 11</span>
              </div>
            </div>
          )}

          {/* TAB 2: EXECUTIVE SUMMARY / KPIS */}
          {activePreviewTab === "kpi" && (
            <div className="space-y-3.5">
              <div className="border-b border-slate-200 pb-2">
                <span className="text-[9px] font-bold text-blue-700 uppercase">Executive Summary</span>
                <h3 className="text-sm font-bold text-slate-900">Project Performance & Returns</h3>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-blue-50/80 p-2.5 rounded-xl border border-blue-200 text-center">
                  <div className="text-base font-black text-blue-950">{systemKw.toFixed(2)} kWp</div>
                  <span className="text-[8.5px] font-semibold text-blue-700 uppercase block">System Size</span>
                </div>
                <div className="bg-emerald-50/80 p-2.5 rounded-xl border border-emerald-200 text-center">
                  <div className="text-base font-black text-emerald-950">{formatNumberIN(m.annualKwh || systemKw * 1450)}</div>
                  <span className="text-[8.5px] font-semibold text-emerald-700 uppercase block">Units / Year (kWh)</span>
                </div>
                <div className="bg-amber-50/80 p-2.5 rounded-xl border border-amber-200 text-center">
                  <div className="text-base font-black text-amber-950">{formatINR(m.annualSavings || systemKw * 12325)}</div>
                  <span className="text-[8.5px] font-semibold text-amber-700 uppercase block">Annual Savings</span>
                </div>
                <div className="bg-indigo-50/80 p-2.5 rounded-xl border border-indigo-200 text-center">
                  <div className="text-base font-black text-indigo-950">{m.paybackYears || "4.6"} Yrs</div>
                  <span className="text-[8.5px] font-semibold text-indigo-700 uppercase block">Est. Payback</span>
                </div>
              </div>

              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-[10px] text-slate-600 space-y-1">
                <div className="font-bold text-slate-800">25-Year Cumulative Benefit</div>
                <div>Estimated lifetime savings: <b className="text-emerald-700">{formatINR(m.lifetimeSavings || systemKw * 12325 * 25)}</b></div>
                <div>CO₂ offset: <b className="text-slate-800">{m.co2Tons || (systemKw * 1.18).toFixed(1)} tons/yr</b> (~{m.treesCount || 54} trees)</div>
              </div>

              <div className="border-t border-slate-100 pt-2 flex justify-between text-[8.5px] text-slate-400">
                <span>Why Choose Solar</span>
                <span>Page 2 of 11</span>
              </div>
            </div>
          )}

          {/* TAB 3: DESIGN & ROOF PLAN */}
          {activePreviewTab === "system" && (
            <div className="space-y-3">
              <div className="border-b border-slate-200 pb-2">
                <span className="text-[9px] font-bold text-blue-700 uppercase">3D Engineering</span>
                <h3 className="text-sm font-bold text-slate-900">Rooftop Solar Plant Layout</h3>
              </div>

              {/* Visual Thumbnail */}
              {form.snapshot_2d || form.snapshot_3d ? (
                <div className="rounded-xl overflow-hidden border border-slate-300 bg-slate-950 aspect-video relative flex items-center justify-center">
                  <img
                    src={form.snapshot_3d || form.snapshot_2d}
                    alt="Rooftop Design"
                    className="w-full h-full object-cover"
                  />
                  <Badge className="absolute bottom-2 right-2 bg-black/70 text-white text-[8px] font-mono">
                    3D Simulation
                  </Badge>
                </div>
              ) : (
                <div className="bg-slate-100 rounded-xl p-6 text-center border border-dashed border-slate-300 space-y-1">
                  <Layers className="w-8 h-8 text-slate-400 mx-auto" />
                  <div className="text-[10px] font-bold text-slate-700">Rooftop Solar Simulation</div>
                  <div className="text-[8.5px] text-slate-500">Linked from Solarix 3D Designer</div>
                </div>
              )}

              {/* Design Spec Highlights */}
              <div className="grid grid-cols-2 gap-1.5 text-[9.5px]">
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                  <span className="text-slate-500 block text-[8px]">Module Configuration</span>
                  <span className="font-bold text-slate-900">{form.panel?.quantity || 18} × {form.panel?.wattage || 555}W</span>
                </div>
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                  <span className="text-slate-500 block text-[8px]">Mounting System</span>
                  <span className="font-bold text-slate-900 truncate block">{form.structure?.type || "Elevated 1.8m"}</span>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-2 flex justify-between text-[8.5px] text-slate-400">
                <span>Rooftop Layout Plan</span>
                <span>Page 4 of 11</span>
              </div>
            </div>
          )}

          {/* TAB 4: EQUIPMENT & WARRANTY */}
          {activePreviewTab === "equipment" && (
            <div className="space-y-3">
              <div className="border-b border-slate-200 pb-2">
                <span className="text-[9px] font-bold text-blue-700 uppercase">Tier-1 Bill of Materials</span>
                <h3 className="text-sm font-bold text-slate-900">Equipment Specifications</h3>
              </div>

              <div className="space-y-1.5 text-[9.5px]">
                <div className="p-2 rounded-lg border border-slate-200 bg-slate-50/70">
                  <div className="flex justify-between font-bold text-slate-900">
                    <span>PV Modules</span>
                    <span className="text-blue-700">{form.panel?.make || "INA Solar"}</span>
                  </div>
                  <div className="text-[8.5px] text-slate-500">{form.panel?.model || "555W DCR TOPCon"} · {form.panel?.quantity || 18} Nos</div>
                  <div className="text-[8px] text-emerald-700 font-medium mt-0.5">12Y Product / 30Y Performance Guarantee</div>
                </div>

                <div className="p-2 rounded-lg border border-slate-200 bg-slate-50/70">
                  <div className="flex justify-between font-bold text-slate-900">
                    <span>Solar Inverter</span>
                    <span className="text-blue-700">{form.inverter?.make || "UTL Solar"}</span>
                  </div>
                  <div className="text-[8.5px] text-slate-500">{form.inverter?.capacity || "10 kW"} · Wi-Fi Remote Monitoring</div>
                  <div className="text-[8px] text-emerald-700 font-medium mt-0.5">10 Years Manufacturer Warranty</div>
                </div>

                <div className="p-2 rounded-lg border border-slate-200 bg-slate-50/70">
                  <div className="flex justify-between font-bold text-slate-900">
                    <span>Mounting Structure</span>
                    <span className="text-blue-700">HDGI / Al 6063</span>
                  </div>
                  <div className="text-[8.5px] text-slate-500">{form.structure?.type || "Elevated"} · 150 km/h wind certified</div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-2 flex justify-between text-[8.5px] text-slate-400">
                <span>Equipment & Warranty</span>
                <span>Page 5 of 11</span>
              </div>
            </div>
          )}

          {/* TAB 5: FINANCIAL & MILESTONES */}
          {activePreviewTab === "financial" && (
            <div className="space-y-3">
              <div className="border-b border-slate-200 pb-2">
                <span className="text-[9px] font-bold text-blue-700 uppercase">Commercial Offer</span>
                <h3 className="text-sm font-bold text-slate-900">Financial Summary & Payment</h3>
              </div>

              <div className="bg-slate-900 text-white p-3 rounded-xl space-y-1">
                <span className="text-[8.5px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Net Investment to Customer
                </span>
                <div className="text-xl font-black text-white" style={{ fontFamily: "Outfit" }}>
                  {formatINR(netCost)}
                </div>
                {Number(form.subsidy_amount) > 0 && form.subsidy_applicable && (
                  <div className="text-[9px] text-emerald-400 font-semibold">
                    Includes {formatINR(form.subsidy_amount)} Central Subsidy Benefit
                  </div>
                )}
              </div>

              <div className="space-y-1 text-[9.5px]">
                <span className="text-[8.5px] font-bold text-slate-500 uppercase block">Payment Schedule</span>
                {(form.milestones || []).slice(0, 4).map((m, i) => (
                  <div key={i} className="flex justify-between p-1.5 rounded-md bg-slate-50 border border-slate-200">
                    <span className="text-slate-700 font-medium truncate max-w-[170px]">{m.stage || `Stage ${i + 1}`}</span>
                    <span className="font-bold text-slate-900">{m.pct}% ({formatINR(netCost * (m.pct / 100))})</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-100 pt-2 flex justify-between text-[8.5px] text-slate-400">
                <span>Commercial Offer</span>
                <span>Page 8 of 11</span>
              </div>
            </div>
          )}

          {/* TAB 6: SCOPE & DELIVERY */}
          {activePreviewTab === "scope" && (
            <div className="space-y-3">
              <div className="border-b border-slate-200 pb-2">
                <span className="text-[9px] font-bold text-blue-700 uppercase">Project Execution</span>
                <h3 className="text-sm font-bold text-slate-900">Scope Matrix & Responsibilities</h3>
              </div>

              <div className="space-y-2 text-[9px]">
                <div>
                  <span className="text-[8px] font-bold text-emerald-700 uppercase block mb-1">
                    EPC Turnkey Scope (Included)
                  </span>
                  <div className="grid grid-cols-2 gap-1 text-slate-700">
                    {(form.our_scope || []).slice(0, 8).map((s, idx) => (
                      <div key={idx} className="flex items-center gap-1 truncate">
                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                        <span className="truncate">{typeof s === "string" ? s : s?.text || ""}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <span className="text-[8px] font-bold text-slate-500 uppercase block mb-1">
                    Customer Deliverables
                  </span>
                  <div className="grid grid-cols-2 gap-1 text-slate-700">
                    {(form.customer_scope || []).slice(0, 6).map((cs, idx) => (
                      <div key={idx} className="flex items-center gap-1 truncate">
                        <div className="w-1 h-1 rounded-full bg-slate-400 shrink-0" />
                        <span className="truncate">{typeof cs === "string" ? cs : cs?.text || ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-2 flex justify-between text-[8.5px] text-slate-400">
                <span>Scope Matrix</span>
                <span>Page 9 of 11</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── FOOTER ACTIONS ─────────────────────────────────────────────────── */}
      <div className="p-2.5 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between text-[11px] shrink-0">
        <span className="text-slate-400 truncate">Proposal Ref: <b>{propNumber}</b></span>
        <button
          onClick={onOpenFullViewer}
          className="text-blue-400 hover:text-white font-bold flex items-center gap-1 transition"
        >
          <span>View All 11 Pages</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
