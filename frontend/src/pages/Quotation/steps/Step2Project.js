import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Layers, Zap, MapPin, Calculator, Sparkles } from "lucide-react";
import { formatINR } from "../defaults";

const STRUCTURE_TYPES = [
  "HDGI Elevated Rooftop Superstructure",
  "Standard Rooftop Ballasted Structure",
  "Flush / Sheet Metal Roof Mounting",
  "Ground Mounted Solar Array",
  "Solar Carport Structure",
  "Tin Shed Metal Clamp Mount",
];

const SYSTEM_TYPES = [
  "Grid Connected Solar PV System",
  "Grid-Tied Solar with Net Metering",
  "Hybrid Solar PV System with Battery",
  "Off-Grid Standalone Solar System",
  "Captive Industrial Solar Power Plant",
];

export default function Step2Project({ quotation, updateQuotation }) {
  const proj = quotation.project || {};
  const comm = quotation.commercial || {};
  const fin = quotation.financials || {};

  const sizeKw = Number(proj.size_kw) || 0;
  const ratePerKw = Number(comm.price_per_kw || fin.price_per_kw) || 0;
  const computedTotal = Math.round(sizeKw * ratePerKw);

  const handleSizeChange = (val) => {
    const num = Math.max(0, parseFloat(val) || 0);
    updateQuotation({
      project: {
        ...proj,
        size_kw: num,
      },
    });
  };

  const handleRateChange = (val) => {
    const num = Math.max(0, parseFloat(val) || 0);
    updateQuotation({
      commercial: {
        ...comm,
        price_per_kw: num,
      },
      financials: {
        ...fin,
        price_per_kw: num,
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Live Calculation Banner */}
      <Card className="border-blue-200 bg-linear-to-r from-blue-900 to-slate-900 text-white rounded-xl shadow-md overflow-hidden">
        <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center shrink-0">
              <Calculator className="w-5 h-5 text-blue-300" />
            </div>
            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider text-blue-300 font-semibold flex items-center gap-1.5">
                <span>Real-Time Project Valuation</span>
                <Sparkles className="w-3 h-3 text-amber-400" />
              </div>
              <div className="text-xs text-slate-300 mt-0.5 font-medium">
                {sizeKw} kW × {formatINR(ratePerKw)}/kW = {formatINR(computedTotal)}
              </div>
            </div>
          </div>

          <div className="text-right sm:border-l sm:border-slate-800 sm:pl-6">
            <div className="text-[11px] font-mono text-slate-400 uppercase">Estimated Project Cost</div>
            <div className="text-2xl font-black font-mono tracking-tight text-white" style={{ fontFamily: "Outfit" }}>
              {formatINR(computedTotal)}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Project Configuration Form */}
      <Card className="border-slate-200/80 shadow-xs rounded-xl bg-white">
        <CardContent className="p-5 sm:p-6 space-y-5">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <Layers className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
              Solar Project Specifications & Sizing
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-semibold text-slate-700">
                Project Capacity / Size (kW) <span className="text-red-500">*</span>
              </Label>
              <div className="relative mt-1">
                <Input
                  className="h-10 text-xs font-mono font-bold pr-12"
                  type="number"
                  step="any"
                  min="0.1"
                  placeholder="e.g. 100"
                  value={proj.size_kw ?? 100}
                  onChange={(e) => handleSizeChange(e.target.value)}
                  data-testid="input-project-size-kw"
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-semibold">kW</span>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">
                Quotation Pricing Rate (₹ / kW) <span className="text-red-500">*</span>
              </Label>
              <div className="relative mt-1">
                <Input
                  className="h-10 text-xs font-mono font-bold pr-14"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="e.g. 2600"
                  value={comm.price_per_kw ?? 2600}
                  onChange={(e) => handleRateChange(e.target.value)}
                  data-testid="input-price-per-kw"
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-semibold">₹/kW</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-semibold text-slate-700">Structure Type</Label>
              <Select
                value={proj.structure_type || STRUCTURE_TYPES[0]}
                onValueChange={(val) => updateQuotation({ project: { ...proj, structure_type: val } })}
              >
                <SelectTrigger className="mt-1 h-9 text-xs">
                  <SelectValue placeholder="Select Structure..." />
                </SelectTrigger>
                <SelectContent>
                  {STRUCTURE_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">System Grid Type</Label>
              <Select
                value={proj.system_type || SYSTEM_TYPES[0]}
                onValueChange={(val) => updateQuotation({ project: { ...proj, system_type: val } })}
              >
                <SelectTrigger className="mt-1 h-9 text-xs">
                  <SelectValue placeholder="Select System Type..." />
                </SelectTrigger>
                <SelectContent>
                  {SYSTEM_TYPES.map((st) => (
                    <SelectItem key={st} value={st} className="text-xs">{st}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-semibold text-slate-700">Project / Site Location</Label>
              <Input
                className="mt-1 h-9 text-xs"
                placeholder="e.g. Kolhapur Rooftop, Maharashtra"
                value={proj.location || ""}
                onChange={(e) => updateQuotation({ project: { ...proj, location: e.target.value } })}
                data-testid="input-project-location"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">Project Brief Description</Label>
              <Input
                className="mt-1 h-9 text-xs"
                placeholder="e.g. 100 kW Grid Connected Commercial Rooftop Installation"
                value={proj.description || ""}
                onChange={(e) => updateQuotation({ project: { ...proj, description: e.target.value } })}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
