import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TrendingUp, TreePine, Leaf, DollarSign, Calendar, Zap, ShieldCheck } from "lucide-react";
import { formatINR, formatNumberIN } from "../defaults";

export default function Step4Financials({ quotation, updateQuotation }) {
  const fin = quotation.financials || {};
  const comm = quotation.commercial || {};
  const proj = quotation.project || {};

  const sizeKw = Number(proj.size_kw) || 0;
  const projectCost = Number(fin.project_cost || comm.price) || 0;
  const tariffRate = Number(fin.tariff_rate) || 8.0;

  const handleTariffChange = (val) => {
    const rate = Math.max(0.5, parseFloat(val) || 0);
    updateQuotation({
      financials: {
        ...fin,
        tariff_rate: rate,
      },
    });
  };

  const updateFinField = (key, val) => {
    updateQuotation({
      financials: {
        ...fin,
        [key]: val,
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards Summary Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-slate-200/80 shadow-xs bg-linear-to-b from-blue-50/50 to-white rounded-xl">
          <CardContent className="p-4 text-center">
            <div className="w-8 h-8 mx-auto rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center mb-2">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase">Payback Period</div>
            <div className="text-xl font-black font-mono text-slate-900 mt-1" style={{ fontFamily: "Outfit" }}>
              {fin.payback_years ?? 3.5} <span className="text-xs font-normal text-slate-500">Years</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-xs bg-linear-to-b from-amber-50/50 to-white rounded-xl">
          <CardContent className="p-4 text-center">
            <div className="w-8 h-8 mx-auto rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center mb-2">
              <Zap className="w-4 h-4" />
            </div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase">Annual Generation</div>
            <div className="text-xl font-black font-mono text-slate-900 mt-1" style={{ fontFamily: "Outfit" }}>
              {formatNumberIN(fin.annual_generation ?? 150000)} <span className="text-xs font-normal text-slate-500">Units</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-xs bg-linear-to-b from-emerald-50/50 to-white rounded-xl">
          <CardContent className="p-4 text-center">
            <div className="w-8 h-8 mx-auto rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center mb-2">
              <DollarSign className="w-4 h-4" />
            </div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase">Annual Savings</div>
            <div className="text-xl font-black font-mono text-emerald-700 mt-1" style={{ fontFamily: "Outfit" }}>
              {formatINR(fin.annual_saving ?? 1200000)}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-xs bg-linear-to-b from-slate-50 to-white rounded-xl">
          <CardContent className="p-4 text-center">
            <div className="w-8 h-8 mx-auto rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center mb-2">
              <Leaf className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase">CO2 Mitigation</div>
            <div className="text-xl font-black font-mono text-slate-900 mt-1" style={{ fontFamily: "Outfit" }}>
              {formatNumberIN(fin.co2_reduction ?? 140)} <span className="text-xs font-normal text-slate-500">Tonnes</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Financial Form Configuration */}
      <Card className="border-slate-200/80 shadow-xs rounded-xl bg-white">
        <CardContent className="p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                Solar Financial Returns & Environmental Projections
              </h3>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              Auto-calculated from {sizeKw} kW capacity
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs font-semibold text-slate-700">Project Total Cost (₹)</Label>
              <Input
                className="mt-1 h-9 text-xs font-mono font-bold text-blue-700"
                type="number"
                value={fin.project_cost ?? 260000}
                onChange={(e) => updateFinField("project_cost", Number(e.target.value) || 0)}
                data-testid="input-project-cost"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">Electricity Tariff (₹ / Unit)</Label>
              <div className="relative mt-1">
                <Input
                  className="h-9 text-xs font-mono font-medium pr-12"
                  type="number"
                  step="0.1"
                  value={tariffRate}
                  onChange={(e) => handleTariffChange(e.target.value)}
                />
                <span className="absolute right-3 top-2 text-xs text-slate-400 font-semibold">₹/kWh</span>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">Payback Period (Years)</Label>
              <Input
                className="mt-1 h-9 text-xs font-mono font-medium"
                type="number"
                step="0.1"
                value={fin.payback_years ?? 3.5}
                onChange={(e) => updateFinField("payback_years", Number(e.target.value) || 0)}
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">Average Yearly Generation (Units)</Label>
              <Input
                className="mt-1 h-9 text-xs font-mono font-medium"
                type="number"
                value={fin.annual_generation ?? 150000}
                onChange={(e) => updateFinField("annual_generation", Number(e.target.value) || 0)}
                data-testid="input-annual-generation"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">Average Annual Savings (₹)</Label>
              <Input
                className="mt-1 h-9 text-xs font-mono font-medium text-emerald-700"
                type="number"
                value={fin.annual_saving ?? 1200000}
                onChange={(e) => updateFinField("annual_saving", Number(e.target.value) || 0)}
                data-testid="input-annual-saving"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">Expected Monthly Generation (Units)</Label>
              <Input
                className="mt-1 h-9 text-xs font-mono font-medium"
                type="number"
                value={fin.monthly_generation ?? Math.round((fin.annual_generation || 150000) / 12)}
                onChange={(e) => updateFinField("monthly_generation", Number(e.target.value) || 0)}
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">Expected Monthly Savings (₹)</Label>
              <Input
                className="mt-1 h-9 text-xs font-mono font-medium text-emerald-700"
                type="number"
                value={fin.monthly_saving ?? Math.round((fin.annual_saving || 1200000) / 12)}
                onChange={(e) => updateFinField("monthly_saving", Number(e.target.value) || 0)}
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">Lifetime Trees Saved (Nos)</Label>
              <Input
                className="mt-1 h-9 text-xs font-mono font-medium"
                type="number"
                value={fin.tree_saved ?? 1600}
                onChange={(e) => updateFinField("tree_saved", Number(e.target.value) || 0)}
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">CO2 Reduction (Tonnes)</Label>
              <Input
                className="mt-1 h-9 text-xs font-mono font-medium"
                type="number"
                step="0.1"
                value={fin.co2_reduction ?? 140}
                onChange={(e) => updateFinField("co2_reduction", Number(e.target.value) || 0)}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
