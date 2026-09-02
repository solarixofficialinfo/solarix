import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Sun, Zap, Layers, Compass, Save, FileDown, ArrowUpRight, CheckCircle2,
  AlertTriangle, ShieldAlert, Sparkles, Building2, MapPin, Box, Ruler, Download,
  FileText, ChevronDown, ChevronUp, Sliders, Info
} from "lucide-react";
import { calculateBillOfMaterials } from "../utils/layoutEngine";

/**
 * Compact, High-Density Solar Engineering Design Summary
 * Organizes essential KPIs at top with clean collapsible technical sections
 */
export default function DesignSummaryPanel({
  designData,
  onSave,
  onSaveNewVersion,
  onExportPdf,
  onExportDocx,
  onTransferToQuotation,
  saving = false,
  exporting = false,
}) {
  const [showBomModal, setShowBomModal] = useState(false);
  const [showTechSpecs, setShowTechSpecs] = useState(true);
  const [showStructureDetails, setShowStructureDetails] = useState(false);
  const [showActions, setShowActions] = useState(true);

  const panelCount = Number(
    designData.panel_count ?? (designData.panels || []).filter((p) => !p.hidden).length ?? 0
  );
  const panelWattage = Number(designData.panel_wattage || 550);
  const systemKw = Number(
    designData.system_kw ?? ((panelCount * panelWattage) / 1000.0).toFixed(2)
  );
  const roofArea = Number(designData.roof_area_sqm || 0);
  const usableArea = Number(
    designData.usable_area_sqm || (roofArea > 0 ? (roofArea * 0.85).toFixed(1) : 0)
  );
  const coveragePct = Number(designData.coverage_pct || 0);
  const excludedArea = Math.max(0, roofArea - usableArea);
  const remainingArea = Math.max(0, usableArea - panelCount * 2.3);

  const bomData = calculateBillOfMaterials({
    panelCount,
    panelSpecs: {
      make: designData.panel_make,
      model: designData.panel_model,
      wattage: panelWattage,
    },
    roofAreaSqm: roofArea,
    structureType: designData.structure?.type || designData.structure_type || "elevated",
    mountingHeightM: designData.structure?.height_m || designData.mounting_height_m || 1.8,
  });
  const bomItems = Array.isArray(bomData) ? bomData : (bomData?.items || []);

  // Interactive structure editor counts
  const structNodes = Array.isArray(designData.structure_nodes) ? designData.structure_nodes : [];
  const structMembers = Array.isArray(designData.structure_members) ? designData.structure_members : [];
  const manualSupportCount = structNodes.filter((n) => n.type === "post_top" || n.type === "anchor").length;
  const manualMemberCount = structMembers.filter((m) => m.type === "member" || m.type === "beam").length;
  const manualBraceCount = structMembers.filter((m) => m.type === "brace").length;
  const manualPostCount = structMembers.filter((m) => m.type === "post").length;

  return (
    <div className="space-y-3">
      {/* Primary KPI Hero Card */}
      <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden bg-white">
        <div className="p-3.5 bg-gradient-to-r from-blue-900 to-indigo-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs">
              <Sun className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-blue-300 uppercase tracking-wider block">
                SYSTEM CAPACITY
              </span>
              <span className="text-xl font-bold text-white tracking-tight" style={{ fontFamily: "Outfit" }}>
                {systemKw > 0 ? `${systemKw.toFixed(2)} kWp` : "0.00 kWp"}
              </span>
            </div>
          </div>
          <Badge className="bg-blue-800/80 text-blue-200 text-[10px] font-semibold border border-blue-700">
            {panelCount} Modules
          </Badge>
        </div>

        <CardContent className="p-3 space-y-3 text-xs">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
              <span className="text-[10px] font-semibold text-slate-500 block">TOTAL PANELS</span>
              <span className="text-base font-bold text-slate-900">{panelCount}</span>
              <span className="text-[10px] text-slate-400 ml-1">Nos</span>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
              <span className="text-[10px] font-semibold text-slate-500 block">ROOF COVERAGE</span>
              <span className="text-base font-bold text-blue-700">{coveragePct.toFixed(1)}%</span>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
              <span className="text-[10px] font-semibold text-slate-500 block">TOTAL ROOF AREA</span>
              <span className="text-sm font-bold text-slate-900">
                {roofArea > 0 ? `${roofArea.toFixed(1)} m²` : "0 m²"}
              </span>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
              <span className="text-[10px] font-semibold text-slate-500 block">USABLE AREA</span>
              <span className="text-sm font-bold text-emerald-700">
                {usableArea > 0 ? `${usableArea.toFixed(1)} m²` : "0 m²"}
              </span>
            </div>
          </div>

          {/* Section 1: Collapsible Technical Specifications */}
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <button
              onClick={() => setShowTechSpecs(!showTechSpecs)}
              className="w-full flex items-center justify-between p-2 bg-slate-50 hover:bg-slate-100 text-[11px] font-bold text-slate-700 transition"
            >
              <div className="flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-blue-600" />
                <span>Technical Specifications</span>
              </div>
              {showTechSpecs ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
            </button>

            {showTechSpecs && (
              <div className="p-2.5 space-y-1.5 bg-white text-[10.5px] border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Module Model</span>
                  <span className="font-semibold text-slate-800 text-right truncate max-w-[130px]">
                    {designData.panel_make || "550W Mono PERC"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Module Wattage</span>
                  <span className="font-semibold text-slate-800">{panelWattage} Wp</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Orientation</span>
                  <span className="font-semibold text-slate-800 capitalize">
                    {designData.orientation || "Portrait"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Tilt Angle</span>
                  <span className="font-semibold text-slate-800">
                    {designData.structure?.tilt_deg ?? designData.tilt_angle ?? 15}°
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Mounting System</span>
                  <span className="font-semibold text-slate-800 capitalize">
                    {designData.structure?.type || designData.structure_type || "Elevated"} (
                    {designData.structure?.height_m || designData.mounting_height_m || 1.8}m)
                  </span>
                </div>
                {roofArea > 0 && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Excluded Area</span>
                      <span className="font-semibold text-slate-800">{excludedArea.toFixed(1)} m²</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Remaining Space</span>
                      <span className="font-semibold text-slate-800">{remainingArea.toFixed(1)} m²</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Section 2: Structure Details (collapsible) */}
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <button
              onClick={() => setShowStructureDetails(!showStructureDetails)}
              className="w-full flex items-center justify-between p-2 bg-slate-50 hover:bg-slate-100 text-[11px] font-bold text-slate-700 transition"
            >
              <div className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-blue-600" />
                <span>Structure Details</span>
              </div>
              {showStructureDetails ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
            </button>
            {showStructureDetails && (
              <div className="p-2.5 space-y-1.5 bg-white text-[10.5px] border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Structure Type</span>
                  <span className="font-semibold text-slate-800 capitalize">{designData.structure?.type || designData.structure_type || "Elevated"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Height / Clearance</span>
                  <span className="font-semibold text-slate-800">{designData.structure?.height_m || designData.mounting_height_m || 1.8} m</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Tilt</span>
                  <span className="font-semibold text-slate-800">{designData.structure?.tilt_deg ?? designData.tilt_angle ?? 15}°</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Azimuth</span>
                  <span className="font-semibold text-slate-800">{designData.structure?.azimuth || designData.azimuth_angle || 180}°</span>
                </div>
                {/* Manual interactive structure counts */}
                {(manualPostCount > 0 || manualMemberCount > 0 || manualBraceCount > 0) && (
                  <>
                    <div className="pt-1 border-t border-slate-100" />
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Interactive Structure</div>
                    {manualPostCount > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">│ Support Posts</span>
                        <span className="font-bold text-slate-800">{manualPostCount}</span>
                      </div>
                    )}
                    {manualMemberCount > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">━ Members</span>
                        <span className="font-bold text-slate-800">{manualMemberCount}</span>
                      </div>
                    )}
                    {manualBraceCount > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">╲ Braces</span>
                        <span className="font-bold text-slate-800">{manualBraceCount}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">◉ Nodes</span>
                      <span className="font-bold text-slate-800">{structNodes.length}</span>
                    </div>
                  </>
                )}
                {manualPostCount === 0 && manualMemberCount === 0 && manualBraceCount === 0 && (
                  <div className="text-[10px] text-slate-400 italic">No manually-added structure. Use 3D Structure Editor to add supports and members.</div>
                )}
              </div>
            )}
          </div>

          {/* Section 2: Material & Structure Estimate Button */}
          <Button
            variant="outline"
            onClick={() => setShowBomModal(true)}
            className="w-full text-xs h-8 justify-between font-semibold border-blue-200 text-blue-700 bg-blue-50/50 hover:bg-blue-100/70 rounded-xl"
          >
            <div className="flex items-center gap-1.5">
              <Box className="w-3.5 h-3.5 text-blue-600" />
              <span>Material & Structure Estimate</span>
            </div>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Button>

          {/* Section 3: Action & Export Controls */}
          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            <Button
              onClick={onSave}
              disabled={saving}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-8 rounded-xl shadow-xs gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? "Saving..." : "Save Design"}</span>
            </Button>

            <div className="grid grid-cols-2 gap-1.5">
              <Button
                variant="outline"
                onClick={onSaveNewVersion}
                disabled={saving}
                className="text-[11px] h-7 font-medium text-slate-700 border-slate-300 rounded-lg"
              >
                Save New Version
              </Button>
              <Button
                onClick={onTransferToQuotation}
                className="text-[11px] h-7 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-xs"
              >
                <Sparkles className="w-3 h-3 mr-1" /> To Quotation
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-1.5 pt-0.5">
              <Button
                variant="outline"
                onClick={onExportPdf}
                disabled={exporting}
                className="text-[10.5px] h-7 font-semibold border-slate-200 text-slate-700 gap-1 rounded-lg"
              >
                <FileDown className="w-3 h-3 text-red-600" /> PDF Report
              </Button>
              <Button
                variant="outline"
                onClick={onExportDocx}
                disabled={exporting}
                className="text-[10.5px] h-7 font-semibold border-slate-200 text-slate-700 gap-1 rounded-lg"
              >
                <FileText className="w-3 h-3 text-blue-600" /> Word (.docx)
              </Button>
            </div>
          </div>

          {/* Preliminary Engineering Notice */}
          <div className="bg-amber-50/80 p-2 rounded-xl border border-amber-200/60 text-[10px] text-amber-900 space-y-0.5">
            <div className="font-bold flex items-center gap-1 text-amber-800">
              <Info className="w-3 h-3 text-amber-600 shrink-0" />
              <span>Engineering Notice</span>
            </div>
            <p className="leading-tight text-amber-700">
              Preliminary layout only — on-site structural and shadow analysis required prior to installation.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Bill of Materials (BOM) Modal */}
      <Dialog open={showBomModal} onOpenChange={setShowBomModal}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Box className="w-5 h-5 text-blue-600" /> Preliminary Bill of Materials (BOM) Estimate
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-xs">
            <div className="bg-blue-50 p-3 rounded-xl border border-blue-200 flex items-center justify-between">
              <div>
                <span className="text-slate-500 block text-[11px]">DESIGN SYSTEM CAPACITY</span>
                <span className="text-lg font-bold text-blue-900">{systemKw.toFixed(2)} kWp</span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block text-[11px]">MODULE COUNT</span>
                <span className="text-lg font-bold text-slate-900">
                  {panelCount} × {panelWattage}W
                </span>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-bold text-slate-700">Item Description</TableHead>
                  <TableHead className="font-bold text-slate-700 text-center">Category</TableHead>
                  <TableHead className="font-bold text-slate-700 text-right">Estimated Qty</TableHead>
                  <TableHead className="font-bold text-slate-700 text-center">Unit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bomItems.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium text-slate-900">
                      <div>{item.name || item.item}</div>
                      {item.spec && <div className="text-[10px] text-slate-500 font-normal">{item.spec}</div>}
                    </TableCell>
                    <TableCell className="text-center text-slate-500">{item.category}</TableCell>
                    <TableCell className="text-right font-bold text-blue-700">{item.qty ?? item.quantity}</TableCell>
                    <TableCell className="text-center text-slate-500">{item.unit}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBomModal(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
