import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sun, Cpu, Cable, Shield, Wrench, Layers } from "lucide-react";

export default function Step3SolarSystem({ quotation, updateQuotation }) {
  const sys = quotation.solar_system || {};
  const panel = sys.panel || {};
  const inverter = sys.inverter || {};
  const cable = sys.cable || {};
  const structure = sys.structure || {};
  const bos = sys.bos || {};

  const updateSub = (category, data) => {
    updateQuotation({
      solar_system: {
        ...sys,
        [category]: {
          ...sys[category],
          ...data,
        },
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Solar Modules / Panels */}
      <Card className="border-slate-200/80 shadow-xs rounded-xl bg-white">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <Sun className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
              Solar PV Modules / Panels (S1 & S2 Mapping)
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs font-semibold text-slate-700">Module Watt Peak (Wp)</Label>
              <Input
                className="mt-1 h-9 text-xs font-mono font-medium"
                placeholder="e.g. 590 Wp"
                value={panel.watt_peak || ""}
                onChange={(e) => updateSub("panel", { watt_peak: e.target.value })}
                data-testid="input-panel-wattage"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">Panel Quantity (Nos)</Label>
              <Input
                className="mt-1 h-9 text-xs font-mono font-medium"
                type="number"
                placeholder="e.g. 170"
                value={panel.quantity || ""}
                onChange={(e) => updateSub("panel", { quantity: Number(e.target.value) || 0 })}
                data-testid="input-panel-quantity"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">Panel Make / Brand</Label>
              <Input
                className="mt-1 h-9 text-xs"
                placeholder="e.g. Adani Solar / Waaree / Vikram"
                value={panel.make || panel.brand || ""}
                onChange={(e) => updateSub("panel", { make: e.target.value, brand: e.target.value })}
                data-testid="input-panel-make"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">Panel Cell Type</Label>
              <Input
                className="mt-1 h-9 text-xs"
                placeholder="e.g. Mono PERC Bifacial TOPCon"
                value={panel.type || ""}
                onChange={(e) => updateSub("panel", { type: e.target.value })}
                data-testid="input-panel-type"
              />
            </div>

            <div className="sm:col-span-2">
              <Label className="text-xs font-semibold text-slate-700">Panel Warranty Terms</Label>
              <Input
                className="mt-1 h-9 text-xs"
                placeholder="e.g. 12 Years Product / 25 Years Performance"
                value={panel.warranty || ""}
                onChange={(e) => updateSub("panel", { warranty: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* String Inverter */}
      <Card className="border-slate-200/80 shadow-xs rounded-xl bg-white">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <Cpu className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
              Solar Grid-Tied Inverter (S1 & S2 Mapping)
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs font-semibold text-slate-700">Inverter Size (kW)</Label>
              <Input
                className="mt-1 h-9 text-xs font-mono font-medium"
                placeholder="e.g. 100 kW"
                value={inverter.size_kw || ""}
                onChange={(e) => updateSub("inverter", { size_kw: e.target.value })}
                data-testid="input-inverter-size"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">Inverter Quantity</Label>
              <Input
                className="mt-1 h-9 text-xs font-mono font-medium"
                type="number"
                placeholder="e.g. 1"
                value={inverter.quantity || 1}
                onChange={(e) => updateSub("inverter", { quantity: Number(e.target.value) || 1 })}
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">Inverter Make / Brand</Label>
              <Input
                className="mt-1 h-9 text-xs"
                placeholder="e.g. Solis / Sungrow / Growatt"
                value={inverter.make || inverter.brand || ""}
                onChange={(e) => updateSub("inverter", { make: e.target.value, brand: e.target.value })}
                data-testid="input-inverter-make"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">Grid Phase</Label>
              <Select
                value={inverter.phase || "Three Phase"}
                onValueChange={(val) => updateSub("inverter", { phase: val })}
              >
                <SelectTrigger className="mt-1 h-9 text-xs">
                  <SelectValue placeholder="Select Phase" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Three Phase" className="text-xs">Three Phase (415V)</SelectItem>
                  <SelectItem value="Single Phase" className="text-xs">Single Phase (230V)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="sm:col-span-2">
              <Label className="text-xs font-semibold text-slate-700">Inverter Warranty Terms</Label>
              <Input
                className="mt-1 h-9 text-xs"
                placeholder="e.g. 5 Years Standard Replacement Warranty"
                value={inverter.warranty || ""}
                onChange={(e) => updateSub("inverter", { warranty: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cabling, Structure & Balance of System */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cabling Specifications */}
        <Card className="border-slate-200/80 shadow-xs rounded-xl bg-white">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <Cable className="w-4 h-4 text-slate-700" />
              <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                Solar Cabling Specs (S2 Mapping)
              </h3>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-xs font-semibold text-slate-700">Cable Make / Brand</Label>
                <Input
                  className="mt-1 h-9 text-xs"
                  placeholder="e.g. Polycab / Havells / KEI"
                  value={cable.make || cable.brand || ""}
                  onChange={(e) => updateSub("cable", { make: e.target.value, brand: e.target.value })}
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">AC Power Cable Spec</Label>
                <Input
                  className="mt-1 h-9 text-xs"
                  placeholder="e.g. 4C x 50 sq.mm Aluminium Armoured Cable"
                  value={cable.ac || ""}
                  onChange={(e) => updateSub("cable", { ac: e.target.value })}
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">DC Solar Cable Spec</Label>
                <Input
                  className="mt-1 h-9 text-xs"
                  placeholder="e.g. 1C x 4/6 sq.mm Tinned Copper Solar Cable"
                  value={cable.dc || ""}
                  onChange={(e) => updateSub("cable", { dc: e.target.value })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Structure & Balance of System */}
        <Card className="border-slate-200/80 shadow-xs rounded-xl bg-white">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <Wrench className="w-4 h-4 text-slate-700" />
              <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                Mounting Structure & BOS (S2 Mapping)
              </h3>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-xs font-semibold text-slate-700">Structure Description</Label>
                <Input
                  className="mt-1 h-9 text-xs"
                  placeholder="e.g. Elevated Superstructure with Hot Dip Galvanized Iron (HDGI)"
                  value={structure.description || ""}
                  onChange={(e) => updateSub("structure", { description: e.target.value })}
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">Balance of System (BOS) Spec</Label>
                <Input
                  className="mt-1 h-9 text-xs"
                  placeholder="e.g. ACDB, DCDB, Chemical Earthing & Lightning Protection"
                  value={bos.description || ""}
                  onChange={(e) => updateSub("bos", { description: e.target.value })}
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">BOS Warranty Terms</Label>
                <Input
                  className="mt-1 h-9 text-xs"
                  placeholder="e.g. 5 Years Complete Balance of System Warranty"
                  value={bos.warranty || ""}
                  onChange={(e) => updateSub("bos", { warranty: e.target.value })}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
