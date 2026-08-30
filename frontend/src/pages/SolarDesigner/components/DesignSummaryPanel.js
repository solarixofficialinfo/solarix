import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Sun, Zap, Layers, Compass, Save, FileDown, ArrowUpRight, CheckCircle2,
  AlertTriangle, ShieldAlert, Sparkles, Building2, MapPin, Box, Ruler, Download, FileText
} from "lucide-react";
import { calculateBillOfMaterials } from "../utils/layoutEngine";

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
  const [showQuotationConfirm, setShowQuotationConfirm] = useState(false);

  const panelCount = Number(designData.panel_count || (designData.panels || []).filter((p) => !p.hidden).length || 0);
  const panelWattage = Number(designData.panel_wattage || 550);
  const systemKw = Number(designData.system_kw || ((panelCount * panelWattage) / 1000.0).toFixed(2));
  const roofArea = Number(designData.roof_area_sqm || 0);
  const usableArea = Number(designData.usable_area_sqm || (roofArea * 0.85).toFixed(1));
  const coveragePct = Number(designData.coverage_pct || 0);
  const excludedArea = Math.max(0, roofArea - usableArea);
  const remainingArea = Math.max(0, usableArea - (panelCount * 2.3));

  const bom = calculateBillOfMaterials({
    panelCount,
    panelSpecs: {
      make: designData.panel_make,
      model: designData.panel_model,
      wattage: panelWattage,
    },
    roofAreaSqm: roofArea,
    structureType: designData.structure_type || "elevated",
    mountingHeightM: designData.mounting_height_m || 1.8,
  });

  return (
    <div className="space-y-4">
      {/* Main KPI Card */}
      <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden bg-gradient-to-b from-blue-50/50 to-white">
        <div className="p-4 border-b border-blue-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Sun className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Outfit" }}>
                DESIGN SUMMARY
              </div>
              <div className="text-[10px] text-slate-500 font-medium">Preliminary Solar Assessment</div>
            </div>
          </div>
          <Badge className="bg-blue-100 text-blue-800 text-[10px] font-semibold hover:bg-blue-100">
            {systemKw.toFixed(2)} kWp
          </Badge>
        </div>

        <CardContent className="p-4 space-y-4 text-xs">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-2xs">
              <span className="text-[10px] font-medium text-slate-500 block">TOTAL PANELS</span>
              <span className="text-base font-bold text-slate-900">{panelCount}</span>
              <span className="text-[10px] text-slate-400 ml-1">Nos</span>
            </div>
            <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-2xs">
              <span className="text-[10px] font-medium text-slate-500 block">ROOF COVERAGE</span>
              <span className="text-base font-bold text-blue-700">{coveragePct.toFixed(1)}%</span>
            </div>
            <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-2xs">
              <span className="text-[10px] font-medium text-slate-500 block">TOTAL ROOF AREA</span>
              <span className="text-sm font-bold text-slate-900">{roofArea.toFixed(1)} m²</span>
            </div>
            <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-2xs">
              <span className="text-[10px] font-medium text-slate-500 block">USABLE AREA</span>
              <span className="text-sm font-bold text-emerald-700">{usableArea.toFixed(1)} m²</span>
            </div>
          </div>

          {/* Technical Specifications List */}
          <div className="space-y-2 pt-1">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Technical Specifications</div>
            
            <div className="space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200/80 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Module Model</span>
                <span className="font-semibold text-slate-800 text-right truncate max-w-[130px]">{designData.panel_make || "Tier-1 Mono"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Module Wattage</span>
                <span className="font-semibold text-slate-800">{panelWattage} Wp</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Orientation</span>
                <span className="font-semibold text-slate-800 capitalize">{designData.orientation || "Portrait"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Tilt Angle</span>
                <span className="font-semibold text-slate-800">{designData.tilt_angle || 15}° Fixed</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Mounting System</span>
                <span className="font-semibold text-slate-800 capitalize">{designData.structure_type || "Elevated"} ({designData.mounting_height_m || 1.8}m)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Excluded Area</span>
                <span className="font-semibold text-slate-800">{excludedArea.toFixed(1)} m²</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Remaining Space</span>
                <span className="font-semibold text-slate-800">{remainingArea.toFixed(1)} m²</span>
              </div>
            </div>
          </div>

          {/* Material Estimate Button */}
          <Button
            variant="outline"
            onClick={() => setShowBomModal(true)}
            className="w-full text-xs h-9 justify-between font-semibold border-blue-200 text-blue-700 bg-blue-50/50 hover:bg-blue-100/70 rounded-xl"
          >
            <div className="flex items-center gap-1.5">
              <Box className="w-3.5 h-3.5 text-blue-600" />
              <span>Material & Structure Estimate</span>
            </div>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Button>

          {/* Action Buttons */}
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <Button
              onClick={onSave}
              disabled={saving}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-9 rounded-xl shadow-xs gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? "Saving Design..." : "Save Design"}</span>
            </Button>

            <Button
              variant="outline"
              onClick={onSaveNewVersion}
              disabled={saving}
              className="w-full text-xs h-9 font-medium text-slate-700 border-slate-300 rounded-xl"
            >
              Save as New Version
            </Button>

            <Button
              onClick={() => setShowQuotationConfirm(true)}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-9 rounded-xl shadow-xs gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-200" />
              <span>Use Design in Quotation</span>
            </Button>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button
                variant="outline"
                onClick={onExportPdf}
                disabled={exporting}
                className="text-xs h-8 font-semibold border-slate-300 text-slate-700 gap-1 rounded-xl"
              >
                <FileDown className="w-3 h-3 text-red-600" /> PDF Report
              </Button>
              <Button
                variant="outline"
                onClick={onExportDocx}
                disabled={exporting}
                className="text-xs h-8 font-semibold border-slate-300 text-slate-700 gap-1 rounded-xl"
              >
                <FileText className="w-3 h-3 text-blue-600" /> Word (.docx)
              </Button>
            </div>
          </div>

          {/* Regulatory Disclaimer Notice */}
          <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-200/80 text-[10.5px] text-amber-900 space-y-1">
            <div className="font-bold flex items-center gap-1 text-amber-800">
              <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
              <span>Engineering Notice</span>
            </div>
            <p className="leading-tight text-amber-700">
              Preliminary layout only — on-site structural and electrical survey required before civil installation.
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
                <span className="text-lg font-bold text-slate-900">{panelCount} × {panelWattage}W</span>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-xs font-bold text-slate-700">Item</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700">Description & Specification</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-right">Estimated Qty</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700">Unit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bom.items.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-semibold text-slate-900">{item.name}</TableCell>
                    <TableCell className="text-slate-500">{item.spec}</TableCell>
                    <TableCell className="font-bold text-slate-900 text-right">{item.qty}</TableCell>
                    <TableCell className="text-slate-600">{item.unit}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="text-[11px] text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200">
              * Quantities are calculated based on standard engineering heuristics for {designData.structure_type || "elevated"} mounting structures. Exact cable runs and hardware should be verified against site electrical single-line diagrams.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBomModal(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Use in Quotation Confirmation Dialog */}
      <Dialog open={showQuotationConfirm} onOpenChange={setShowQuotationConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Sparkles className="w-5 h-5 text-emerald-600" /> Transfer Design to Quotation
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm text-slate-600">
            <p>
              Transfer technical specifications from this 3D design into the official Quotation generator?
            </p>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1.5">
              <div><b>Client:</b> {designData.client_name || "Direct Client"}</div>
              <div><b>System Size:</b> {systemKw.toFixed(2)} kWp ({panelCount} × {panelWattage}W panels)</div>
              <div><b>Mounting Rails:</b> ~{roundTo1(panelCount * 2.35)} meters</div>
              <div><b>Structure Sets:</b> ~{Math.max(1, Math.ceil(panelCount / 4))} sets ({designData.structure_type || "Elevated"})</div>
            </div>
            <p className="text-xs text-slate-500">
              This will pre-fill line items on the Quotation page without affecting existing commercial rates until confirmed.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQuotationConfirm(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowQuotationConfirm(false);
                if (onTransferToQuotation) onTransferToQuotation();
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs"
            >
              Confirm & Open Quotation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function roundTo1(val) {
  return Math.round(Number(val) * 10) / 10;
}
