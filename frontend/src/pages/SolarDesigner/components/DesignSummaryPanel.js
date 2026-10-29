import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sun, Zap, Layers, Compass, Save, FileDown, ArrowUpRight, CheckCircle2,
  AlertTriangle, Sparkles, Building2, MapPin, Box, Ruler, Download,
  FileText, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, Sliders, Info, Edit2, Eye, RefreshCw, Image
} from "lucide-react";
import dayjs from "dayjs";
import { calculateBillOfMaterials } from "../utils/layoutEngine";

/**
 * Professional Solar EPC Design Summary & Gallery Drawer
 * Matches the reference design with Design Gallery (2x2 grid) and Design Information specs.
 */
export default function DesignSummaryPanel({
  designData,
  savedViews = [],
  onSelectView,
  onOpenGallery,
  onGenerateViews,
  onUpdateDesign,
  onSave,
  onSaveNewVersion,
  onExportPdf,
  onExportDocx,
  onTransferToQuotation,
  onTransferToProposal,
  saving = false,
  exporting = false,
  autoLayoutBaselinePanels = null,
  recommendedPanels = null,
  onCollapse = null,
}) {
  const [showBomModal, setShowBomModal] = useState(false);
  const [showTechSpecs, setShowTechSpecs] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedAngleCount, setSelectedAngleCount] = useState(4);

  // Edit modal states
  const [editWattage, setEditWattage] = useState(550);
  const [editMake, setEditMake] = useState("");
  const [editModel, setEditModel] = useState("");
  const [editTilt, setEditTilt] = useState(15);
  const [editAzimuth, setEditAzimuth] = useState(180);
  const [editStructType, setEditStructType] = useState("elevated");
  const [editHeight, setEditHeight] = useState(1.8);
  const [editUsableArea, setEditUsableArea] = useState(0);
  const [editRoofArea, setEditRoofArea] = useState(0);
  const [editError, setEditError] = useState("");

  const panelCount = Number(
    designData.panel_count ?? (designData.panels || []).filter((p) => !p.hidden).length ?? 0
  );
  const baselineRecommended = recommendedPanels != null ? recommendedPanels : autoLayoutBaselinePanels?.length || null;
  const hasManualOverride = baselineRecommended != null && panelCount > baselineRecommended;

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

  const tiltAngle = Number(designData.structure?.tilt_deg ?? designData.tilt_angle ?? 15);
  const azimuthAngle = Number(designData.structure?.azimuth || designData.azimuth_angle || 180);
  const structType = designData.structure?.type || designData.structure_type || "elevated";
  const structHeight = designData.structure?.height_m || designData.mounting_height_m || 1.8;

  const handleOpenEditModal = () => {
    setEditWattage(designData.panel_wattage ?? 550);
    setEditMake(designData.panel_make || "Tier-1 Monocrystalline");
    setEditModel(designData.panel_model || "550W Mono PERC");
    setEditTilt(designData.structure?.tilt_deg ?? designData.tilt_angle ?? 15);
    setEditAzimuth(designData.structure?.azimuth ?? designData.azimuth_angle ?? 180);
    setEditStructType(designData.structure?.type || designData.structure_type || "elevated");
    setEditHeight(designData.structure?.height_m ?? designData.mounting_height_m ?? 1.8);
    setEditUsableArea(usableArea);
    setEditRoofArea(roofArea);
    setEditError("");
    setShowEditModal(true);
  };

  const handleSaveEdit = () => {
    const w = parseFloat(editWattage);
    if (isNaN(w) || w < 100 || w > 1000) {
      setEditError("Please enter a valid PV module wattage between 100 Wp and 1000 Wp.");
      return;
    }
    const t = parseFloat(editTilt);
    if (isNaN(t) || t < 0 || t > 60) {
      setEditError("Tilt angle must be between 0° and 60°.");
      return;
    }
    const az = parseFloat(editAzimuth);
    if (isNaN(az) || az < 0 || az > 360) {
      setEditError("Azimuth angle must be between 0° and 360°.");
      return;
    }
    const h = parseFloat(editHeight);
    if (isNaN(h) || h < 0.05 || h > 6.0) {
      setEditError("Clearance height must be between 0.05m and 6.0m.");
      return;
    }
    const ua = parseFloat(editUsableArea);
    const ra = parseFloat(editRoofArea);

    if (onUpdateDesign) {
      onUpdateDesign({
        panel_wattage: w,
        panel_make: editMake,
        panel_model: editModel,
        tilt_angle: t,
        azimuth_angle: az,
        structure_type: editStructType,
        mounting_height_m: h,
        usable_area_sqm: !isNaN(ua) && ua >= 0 ? ua : usableArea,
        roof_area_sqm: !isNaN(ra) && ra >= 0 ? ra : roofArea,
        system_kw: parseFloat(((panelCount * w) / 1000).toFixed(2)),
      });
    }
    setShowEditModal(false);
  };

  const handleDownloadView = (view, e) => {
    if (e) e.stopPropagation();
    const url = view.dataUrl || view.thumbnail;
    if (!url) return;
    const cleanName = (view.name || "Design_View").replace(/[^a-zA-Z0-9_-]/g, "_");
    const link = document.createElement("a");
    link.href = url;
    link.download = `Solarix_${cleanName}_${dayjs().format("YYYYMMDD_HHmm")}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadAllViews = () => {
    (savedViews || []).forEach((view, idx) => {
      setTimeout(() => {
        handleDownloadView(view);
      }, idx * 250);
    });
  };

  const bomData = calculateBillOfMaterials({
    panelCount,
    panelSpecs: {
      make: designData.panel_make,
      model: designData.panel_model,
      wattage: panelWattage,
    },
    roofAreaSqm: roofArea,
    structureType: structType,
    mountingHeightM: structHeight,
  });
  const bomItems = Array.isArray(bomData) ? bomData : (bomData?.items || []);

  // Display up to 4 views in 2x2 grid
  const displayViews = savedViews && savedViews.length > 0
    ? savedViews.slice(0, 4)
    : [
        { id: "top", name: "Top View", timestamp: dayjs().format("DD MMM YYYY HH:mm") },
        { id: "3d", name: "3D View", timestamp: dayjs().format("DD MMM YYYY HH:mm") },
        { id: "left", name: "Left View", timestamp: dayjs().format("DD MMM YYYY HH:mm") },
        { id: "right", name: "Right View", timestamp: dayjs().format("DD MMM YYYY HH:mm") },
      ];

  return (
    <div className="space-y-2.5 text-white select-none">
      {/* ── SECTION 1: DESIGN GALLERY ────────────────────────────────────────── */}
      <div className="bg-slate-900/98 rounded-2xl border border-slate-800 p-3 shadow-xl">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-1.5">
            <Image className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs font-bold text-white tracking-wide">
              Design Gallery ({savedViews.length || 4})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenGallery}
              className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition cursor-pointer"
            >
              View All
            </button>
            {onCollapse && (
              <button
                type="button"
                onClick={onCollapse}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer flex items-center"
                title="Collapse Side Panel (>)"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* 2x2 Thumbnail Grid */}
        <div className="grid grid-cols-2 gap-2">
          {displayViews.map((view, idx) => (
            <div
              key={view.id || idx}
              onClick={() => onSelectView ? onSelectView(view) : onOpenGallery?.()}
              className="group relative bg-slate-950 rounded-xl overflow-hidden border border-slate-800 hover:border-blue-500 cursor-pointer transition-all shadow-sm"
            >
              {/* Thumbnail Image */}
              <div className="h-20 w-full bg-slate-950 flex items-center justify-center overflow-hidden relative border-b border-slate-800/60">
                {view.thumbnail || view.dataUrl ? (
                  <img
                    src={view.thumbnail || view.dataUrl}
                    alt={view.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-slate-400 gap-1 p-2 text-center">
                    <Box className="w-5 h-5 text-slate-500 group-hover:text-blue-400 transition" />
                    <span className="text-[9.5px] text-slate-300 font-semibold">{view.name}</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent opacity-50 group-hover:opacity-25 transition" />
                <div className="absolute top-1.5 right-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition z-10">
                  <span
                    onClick={(e) => { e.stopPropagation(); onSelectView ? onSelectView(view) : onOpenGallery?.(); }}
                    className="bg-blue-600 hover:bg-blue-500 text-white rounded p-1 text-[9px] flex items-center justify-center shadow-md cursor-pointer"
                    title="Expand View"
                  >
                    <Eye className="w-2.5 h-2.5" />
                  </span>
                  <span
                    onClick={(e) => handleDownloadView(view, e)}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white rounded p-1 text-[9px] flex items-center justify-center shadow-md cursor-pointer"
                    title="Download Angle PNG"
                  >
                    <Download className="w-2.5 h-2.5" />
                  </span>
                </div>
              </div>

              {/* Card Label */}
              <div className="p-2 bg-slate-950">
                <div className="text-xs font-bold text-slate-100 truncate">{view.name}</div>
                <div className="text-[10px] text-slate-400 font-mono font-medium truncate mt-0.5">
                  {view.timestamp ? dayjs(view.timestamp).format("DD MMM YYYY HH:mm") : dayjs().format("DD MMM YYYY HH:mm")}
                </div>
              </div>
            </div>
          ))}
        </div>

        {onGenerateViews && (
          <div className="space-y-1.5 mt-2.5">
            <div className="flex items-center gap-1.5">
              <Select
                value={String(selectedAngleCount)}
                onValueChange={(val) => setSelectedAngleCount(Number(val))}
              >
                <SelectTrigger className="h-7 text-[11px] bg-slate-800 border-slate-700 text-white flex-1">
                  <SelectValue placeholder="Angles to capture" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800 text-white">
                  <SelectItem value="1">1 Angle (3D Isometric)</SelectItem>
                  <SelectItem value="2">2 Distinct Angles (3D + Top Plan)</SelectItem>
                  <SelectItem value="4">All 4 Angles (Isometric, Top, Front, Side)</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={() => onGenerateViews(selectedAngleCount)}
                className="h-7 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg gap-1 px-2.5 transition shrink-0"
                title="Capture high-resolution design perspectives"
              >
                <RefreshCw className="w-3 h-3 shrink-0" />
                <span>Capture</span>
              </Button>
            </div>
            {savedViews && savedViews.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDownloadAllViews}
                className="w-full h-6 text-[10px] font-medium text-slate-300 hover:text-white bg-slate-950/60 hover:bg-slate-800 rounded-lg gap-1 border border-slate-800 transition"
              >
                <Download className="w-2.5 h-2.5 text-blue-400" />
                <span>Download All Saved Angles ({savedViews.length})</span>
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ── SECTION 2: DESIGN INFORMATION ────────────────────────────────────── */}
      <div className="bg-slate-900/98 rounded-2xl border border-slate-800 p-3.5 shadow-xl space-y-2">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <span className="text-xs font-bold text-white tracking-wide uppercase">
            Design Information
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowTechSpecs(!showTechSpecs)}
              className={`text-slate-400 hover:text-white transition p-1 rounded-md ${showTechSpecs ? "bg-slate-800 text-blue-400" : ""}`}
              title="Toggle Detailed PV Module Specs"
            >
              <Sliders className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleOpenEditModal}
              className="text-slate-400 hover:text-white transition p-1 rounded-md hover:bg-slate-800"
              title="Edit Design Information Parameters"
            >
              <Edit2 className="w-3.5 h-3.5 text-blue-400" />
            </button>
          </div>
        </div>

        {/* Clean Engineering Metric Rows: Two-Column Label / Value */}
        <div className="space-y-0.5 text-xs divide-y divide-slate-800/60">
          <div className="flex items-center justify-between py-1.5">
            <span className="text-slate-300 font-medium text-[12px]">Total Panels</span>
            <div className="flex items-center gap-2">
              {hasManualOverride && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-600/50 text-amber-300 font-mono font-bold" title={`Recommended by auto-generator: ${baselineRecommended}`}>
                  Rec: {baselineRecommended} (+{panelCount - baselineRecommended})
                </span>
              )}
              <span className="font-bold text-white font-mono text-[12.5px]">{panelCount}</span>
            </div>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-slate-300 font-medium text-[12px]">System Capacity</span>
            <span className="font-bold text-amber-400 font-mono text-[12.5px]">{systemKw.toFixed(2)} kWp</span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-slate-300 font-medium text-[12px]">Roof Area</span>
            <span className="font-bold text-slate-100 font-mono text-[12.5px]">
              {roofArea > 0 ? `${roofArea.toFixed(1)} m²` : "0.0 m²"}
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-slate-300 font-medium text-[12px]">Usable Area</span>
            <span className="font-bold text-emerald-400 font-mono text-[12.5px]">
              {usableArea > 0 ? `${usableArea.toFixed(1)} m²` : "0.0 m²"}
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-slate-300 font-medium text-[12px]">Tilt Angle</span>
            <span className="font-bold text-slate-100 font-mono text-[12.5px]">{tiltAngle}°</span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-slate-300 font-medium text-[12px]">Orientation</span>
            <span className="font-bold text-slate-100 font-mono text-[12.5px]">{azimuthAngle}°</span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-slate-300 font-medium text-[12px]">Mounting Type</span>
            <span
              title={`${structType.toUpperCase()} (Mounting height: ${structHeight}m)`}
              className="font-bold text-sky-300 text-[12px] capitalize truncate max-w-[140px] cursor-help hover:text-sky-200"
            >
              {structType} ({structHeight}m)
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-slate-300 font-medium text-[12px]">Excluded Area</span>
            <span className="font-bold text-rose-400 font-mono text-[12.5px]">{excludedArea.toFixed(1)} m²</span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-slate-300 font-medium text-[12px]">Remaining Space</span>
            <span className="font-bold text-emerald-300 font-mono text-[12.5px]">{remainingArea.toFixed(1)} m²</span>
          </div>
        </div>

        {/* Extended Specs dropdown */}
        {showTechSpecs && (
          <div className="pt-2 border-t border-slate-800 space-y-1.5 text-[11px] bg-slate-950/80 p-2.5 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">PV Module</span>
              <span
                title={designData.panel_make || designData.panel_model || "550W Module"}
                className="font-semibold text-slate-200 truncate max-w-[130px] cursor-help"
              >
                {designData.panel_make || designData.panel_model || "550W Module"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Wattage</span>
              <span className="font-semibold text-slate-200 font-mono">{panelWattage} Wp</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Orientation</span>
              <span className="font-semibold text-slate-200 capitalize">{designData.orientation || "Portrait"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Coverage</span>
              <span className="font-semibold text-blue-400 font-mono">{coveragePct.toFixed(1)}%</span>
            </div>
          </div>
        )}

        {/* Bill of Materials Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowBomModal(true)}
          className="w-full text-xs h-7 justify-between font-semibold border-slate-700 bg-slate-800/80 text-blue-300 hover:bg-slate-700 hover:text-white rounded-xl mt-1.5"
        >
          <div className="flex items-center gap-1.5">
            <Box className="w-3 h-3 text-blue-400" />
            <span>Material Estimates (BOM)</span>
          </div>
          <ArrowUpRight className="w-3 h-3" />
        </Button>
      </div>

      {/* ── SECTION 3: WORKFLOW ACTIONS & EXPORT ───────────────────────────── */}
      <div className="bg-slate-900/95 rounded-2xl border border-slate-800 p-2.5 shadow-xl space-y-1.5">
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            onClick={onTransferToProposal}
            className="text-[10.5px] h-7 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-xs"
          >
            <Sparkles className="w-3 h-3 mr-1" /> To Proposal
          </Button>
          <Button
            onClick={onTransferToQuotation}
            variant="outline"
            className="text-[10.5px] h-7 text-emerald-400 border-emerald-800/60 bg-emerald-950/30 hover:bg-emerald-950/60 font-semibold rounded-lg shadow-xs"
          >
            To Quotation
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <Button
            variant="outline"
            onClick={onExportPdf}
            disabled={exporting}
            className="text-[10.5px] h-7 font-semibold border-slate-700 bg-slate-800/60 text-slate-200 hover:bg-slate-700 gap-1 rounded-lg"
          >
            <FileDown className="w-3 h-3 text-red-400" /> PDF Report
          </Button>
          <Button
            variant="outline"
            onClick={onExportDocx}
            disabled={exporting}
            className="text-[10.5px] h-7 font-semibold border-slate-700 bg-slate-800/60 text-slate-200 hover:bg-slate-700 gap-1 rounded-lg"
          >
            <FileText className="w-3 h-3 text-blue-400" /> Word (.docx)
          </Button>
        </div>
      </div>

      {/* Bill of Materials (BOM) Modal */}
      <Dialog open={showBomModal} onOpenChange={setShowBomModal}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white text-sm font-bold">
              <Box className="w-4 h-4 text-blue-400" /> Preliminary Bill of Materials (BOM) Estimate
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">DESIGN SYSTEM CAPACITY</span>
                <span className="text-lg font-bold text-amber-400">{systemKw.toFixed(2)} kWp</span>
              </div>
              <div className="text-right">
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">MODULE COUNT</span>
                <span className="text-lg font-bold text-white">
                  {panelCount} × {panelWattage}W
                </span>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 bg-slate-950">
                  <TableHead className="font-bold text-slate-300">Item Description</TableHead>
                  <TableHead className="font-bold text-slate-300 text-center">Category</TableHead>
                  <TableHead className="font-bold text-slate-300 text-right">Estimated Qty</TableHead>
                  <TableHead className="font-bold text-slate-300 text-center">Unit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bomItems.map((item, idx) => (
                  <TableRow key={idx} className="border-slate-800">
                    <TableCell className="font-medium text-white">
                      <div>{item.name || item.item}</div>
                      {item.spec && <div className="text-[10px] text-slate-400 font-normal">{item.spec}</div>}
                    </TableCell>
                    <TableCell className="text-center text-slate-400">{item.category}</TableCell>
                    <TableCell className="text-right font-bold text-blue-400">{item.qty ?? item.quantity}</TableCell>
                    <TableCell className="text-center text-slate-400">{item.unit}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBomModal(false)} className="border-slate-700 text-slate-300">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Design Information Dialog (Modal) */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white text-sm font-bold">
              <Edit2 className="w-4 h-4 text-blue-400" />
              <span>Edit Design Information</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3.5 py-2 text-xs">
            {editError && (
              <div className="p-2.5 rounded-lg bg-rose-950/80 border border-rose-800/80 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{editError}</span>
              </div>
            )}

            {/* Recalculated Metric Highlight Cards */}
            <div className="grid grid-cols-2 gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
              <div>
                <span className="text-[10px] text-slate-400 font-semibold uppercase block">System Capacity</span>
                <span className="text-base font-bold font-mono text-amber-400">
                  {((panelCount * (parseFloat(editWattage) || 0)) / 1000).toFixed(2)} kWp
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5 font-mono">
                  {panelCount} panels × {editWattage || 0}W
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 font-semibold uppercase block">Usable Remaining</span>
                <span className="text-base font-bold font-mono text-emerald-400">
                  {Math.max(0, (parseFloat(editUsableArea) || 0) - panelCount * 2.3).toFixed(1)} m²
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5 font-mono">
                  of {editUsableArea || 0} m² usable
                </span>
              </div>
            </div>

            {/* PV Module Specifications */}
            <div className="space-y-2 pt-1 border-t border-slate-800">
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                PV Module Details
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] text-slate-400 font-medium">Module Wattage (Wp)</Label>
                  <Input
                    type="number"
                    min="100"
                    max="1000"
                    step="5"
                    value={editWattage}
                    onChange={(e) => setEditWattage(e.target.value)}
                    className="h-8 text-xs font-bold mt-1 bg-slate-950 border-slate-700 text-white"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-slate-400 font-medium">Total Panels (Array)</Label>
                  <Input
                    type="number"
                    value={panelCount}
                    disabled
                    className="h-8 text-xs font-mono font-bold mt-1 bg-slate-950/60 border-slate-800 text-slate-400 cursor-not-allowed"
                    title="Panel count is determined by active 3D layout"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] text-slate-400 font-medium">Module Make / Brand</Label>
                  <Input
                    type="text"
                    value={editMake}
                    onChange={(e) => setEditMake(e.target.value)}
                    placeholder="e.g. Tata Power Solar"
                    className="h-8 text-xs mt-1 bg-slate-950 border-slate-700 text-white"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-slate-400 font-medium">Module Model / Spec</Label>
                  <Input
                    type="text"
                    value={editModel}
                    onChange={(e) => setEditModel(e.target.value)}
                    placeholder="e.g. Mono PERC 550W"
                    className="h-8 text-xs mt-1 bg-slate-950 border-slate-700 text-white"
                  />
                </div>
              </div>
            </div>

            {/* Mounting Structure Specifications */}
            <div className="space-y-2 pt-1 border-t border-slate-800">
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                Mounting Structure & Geometry
              </span>
              <div>
                <Label className="text-[10px] text-slate-400 font-medium">Mounting Structure Type</Label>
                <Select
                  value={editStructType}
                  onValueChange={(val) => {
                    setEditStructType(val);
                    if (val === "monorail") setEditHeight(0.06);
                    else if (val === "flush") setEditHeight(0.12);
                    else if (val === "tile_hook_rail") setEditHeight(0.14);
                    else if (val === "ballasted") setEditHeight(0.35);
                    else if (val === "fixed_tilt") setEditHeight(0.45);
                    else if (val === "ground_mount") setEditHeight(0.80);
                    else if (val === "elevated") setEditHeight(1.8);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs mt-1 bg-slate-950 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-white">
                    <SelectItem value="elevated">Elevated Frame / Super Structure</SelectItem>
                    <SelectItem value="monorail">Mono Rail / Short Rail</SelectItem>
                    <SelectItem value="flush">Flush to Roof (Continuous Rail)</SelectItem>
                    <SelectItem value="tile_hook_rail">Tile Hook & Rail</SelectItem>
                    <SelectItem value="fixed_tilt">Fixed Tilt (Triangular Legs)</SelectItem>
                    <SelectItem value="ballasted">Ballasted (Non-Penetrating)</SelectItem>
                    <SelectItem value="east_west">East-West (Dual Tilt)</SelectItem>
                    <SelectItem value="ground_mount">Ground Mount</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] text-slate-400 font-medium">Tilt Angle (°)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="60"
                    step="1"
                    value={editTilt}
                    onChange={(e) => setEditTilt(e.target.value)}
                    className="h-8 text-xs font-bold mt-1 bg-slate-950 border-slate-700 text-white"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-slate-400 font-medium">Clearance Height (m)</Label>
                  <Input
                    type="number"
                    min="0.05"
                    max="6.0"
                    step="0.05"
                    value={editHeight}
                    onChange={(e) => setEditHeight(e.target.value)}
                    className="h-8 text-xs font-bold mt-1 bg-slate-950 border-slate-700 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] text-slate-400 font-medium">Orientation / Azimuth</Label>
                  <Select
                    value={String(editAzimuth)}
                    onValueChange={(val) => setEditAzimuth(Number(val))}
                  >
                    <SelectTrigger className="h-8 text-xs mt-1 bg-slate-950 border-slate-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800 text-white">
                      <SelectItem value="180">South 180° (Recommended)</SelectItem>
                      <SelectItem value="135">SE 135°</SelectItem>
                      <SelectItem value="225">SW 225°</SelectItem>
                      <SelectItem value="90">East 90°</SelectItem>
                      <SelectItem value="270">West 270°</SelectItem>
                      <SelectItem value="0">North 0°</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] text-slate-400 font-medium">Usable Area (m²)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={editUsableArea}
                    onChange={(e) => setEditUsableArea(e.target.value)}
                    className="h-8 text-xs font-bold mt-1 bg-slate-950 border-slate-700 text-white"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2 border-t border-slate-800">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEditModal(false)}
              className="border-slate-700 text-slate-300 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveEdit}
              className="bg-blue-600 hover:bg-blue-500 text-white font-semibold gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Changes</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
