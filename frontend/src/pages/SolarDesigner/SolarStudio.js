import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sun, MapPin, PenTool, Box, Sparkles, Layers, ArrowLeft, ArrowRight,
  Save, FileDown, Plus, Trash2, RotateCw, RefreshCw, Check, CheckCircle2,
  AlertTriangle, ShieldCheck, Download, Sliders, Ruler, Maximize2
} from "lucide-react";
import { toast } from "sonner";

import SiteLocationPicker from "./components/SiteLocationPicker";
import Roof2DCanvas from "./components/Roof2DCanvas";
import Rooftop3DViewer from "./components/Rooftop3DViewer";
import DesignSummaryPanel from "./components/DesignSummaryPanel";
import {
  DEFAULT_PANEL_SPECS,
  OBSTACLE_TYPES,
  generateAutoPanelLayout,
  canFitAdditionalPanel,
} from "./utils/layoutEngine";
import {
  getCartesianPolygonArea,
  getCartesianPolygonPerimeter,
  getPolygonBounds,
  polygonLatLngToMeters,
} from "./utils/geoCalculations";
import { useProductList } from "@/hooks/useInventory";

export default function SolarStudio() {
  const { id: designId } = useParams();
  const nav = useNavigate();

  // Active Workflow Step: 'location' | 'roof' | 'obstacles' | 'panels' | '3d' | 'structure'
  const [activeStep, setActiveStep] = useState(designId ? "panels" : "location");
  const [viewMode, setViewMode] = useState("2d"); // '2d' | '3d' | 'split'
  const [active2dTool, setActive2dTool] = useState("select");
  const [selectedPanelId, setSelectedPanelId] = useState(null);

  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(Boolean(designId));

  // Product Master list from inventory hook
  const { data: productsData = [] } = useProductList();
  const solarPanelProducts = Array.isArray(productsData)
    ? productsData.filter((p) => (p.category || "").toLowerCase().includes("solar") || (p.name || "").toLowerCase().includes("panel") || (p.name || "").toLowerCase().includes("watt"))
    : [];

  const [showProductModal, setShowProductModal] = useState(false);
  const [showObstacleModal, setShowObstacleModal] = useState(false);
  const [newObstacleForm, setNewObstacleForm] = useState({
    name: "Water Tank",
    type: "water_tank",
    length: 1.8,
    width: 1.8,
    height: 1.6,
  });

  // Canvas & 3D Viewport Refs for Snapshots
  const canvas2dRef = useRef(null);
  const viewer3dRef = useRef(null);

  // Core Solar Design State
  const [designData, setDesignData] = useState({
    id: "",
    design_number: "",
    client_id: "",
    client_name: "",
    project_id: "",
    lead_id: "",
    site_name: "Residential Rooftop 10kW",
    address: "",
    formatted_address: "",
    latitude: 19.076,
    longitude: 72.8777,
    place_id: "",
    zoom: 19,
    roof_polygon: [
      { x: -7, y: -5 },
      { x: 7, y: -5 },
      { x: 7, y: 5 },
      { x: -7, y: 5 },
    ],
    roof_area_sqm: 140,
    roof_perimeter_m: 48,
    roof_dimensions: { length_m: 14, width_m: 10 },
    calibration: {},
    setback_m: 0.5,
    edge_clearance_m: 0.5,
    walkway_m: 0.6,
    walkways: [],
    usable_area_sqm: 117,
    coverage_pct: 0,
    obstacles: [
      { id: "obs-1", name: "Water Tank", type: "water_tank", x: 4.5, y: 2.5, length: 1.8, width: 1.8, height: 1.6, rotation: 0 },
    ],
    panel_product_id: "",
    panel_make: "Tier-1 High Efficiency Mono PERC",
    panel_model: "550W Module",
    panel_wattage: 550,
    panel_dimensions: { length_m: 2.278, width_m: 1.134, weight_kg: 28.5 },
    orientation: "portrait",
    tilt_angle: 15,
    azimuth_angle: 180,
    row_spacing_m: 0.35,
    panel_spacing_m: 0.02,
    panel_count: 0,
    system_kw: 0,
    panels: [],
    structure_type: "elevated",
    mounting_height_m: 1.8,
    material_estimates: {},
    camera_state: {},
    status: "Draft",
    notes: "",
  });

  // Fetch Existing Design if Editing
  useEffect(() => {
    if (!designId) return;
    let isMounted = true;
    (async () => {
      try {
        const res = await api.get(`/solar-designer/designs/${designId}`);
        if (res.data && isMounted) {
          setDesignData(res.data);
          setActiveStep("panels");
        }
      } catch (err) {
        toast.error("Failed to load design: " + formatApiError(err));
      } finally {
        if (isMounted) setLoadingInitial(false);
      }
    })();
    return () => { isMounted = false; };
  }, [designId]);

  // Merge updates to design data
  const updateDesignData = useCallback((updates) => {
    setDesignData((prev) => ({ ...prev, ...updates }));
  }, []);

  // Update Roof Polygon and recalculate area/perimeter
  const handleSetRoofPolygon = useCallback((polygon) => {
    const area = getCartesianPolygonArea(polygon);
    const perimeter = getCartesianPolygonPerimeter(polygon);
    const bounds = getPolygonBounds(polygon);

    setDesignData((prev) => ({
      ...prev,
      roof_polygon: polygon,
      roof_area_sqm: Math.round(area * 10) / 10,
      roof_perimeter_m: Math.round(perimeter * 10) / 10,
      roof_dimensions: {
        length_m: Math.round(bounds.length * 10) / 10,
        width_m: Math.round(bounds.width * 10) / 10,
      },
      usable_area_sqm: Math.max(0, Math.round((area * 0.85) * 10) / 10),
    }));
  }, []);

  // Trigger Automatic Panel Layout
  const handleAutoLayout = useCallback((customStrategy = "auto") => {
    const result = generateAutoPanelLayout({
      roofPolygon: designData.roof_polygon,
      setbackMeters: Number(designData.setback_m || 0.5),
      obstacles: designData.obstacles || [],
      walkways: designData.walkways || [],
      panelSpecs: {
        make: designData.panel_make,
        model: designData.panel_model,
        wattage: Number(designData.panel_wattage || 550),
        length_m: designData.panel_dimensions?.length_m || 2.278,
        width_m: designData.panel_dimensions?.width_m || 1.134,
      },
      orientation: designData.orientation || "portrait",
      rowSpacingMeters: Number(designData.row_spacing_m || 0.35),
      panelSpacingMeters: Number(designData.panel_spacing_m || 0.02),
      azimuthDegrees: Number(designData.azimuth_angle || 180),
      strategy: customStrategy,
    });

    setDesignData((prev) => ({
      ...prev,
      panels: result.panels,
      panel_count: result.panelCount,
      system_kw: result.totalKw,
      usable_area_sqm: result.usableAreaSqm,
      coverage_pct: result.coveragePct,
    }));

    toast.success(`Generated layout with ${result.panelCount} panels (${result.totalKw.toFixed(2)} kWp)`);
  }, [designData]);

  // Run auto layout once on initial roof creation if panels are empty
  useEffect(() => {
    if (!designId && designData.panels.length === 0 && designData.roof_polygon.length >= 3) {
      handleAutoLayout();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Manual Increase Panel Count with Physical Space Check
  const handleIncreasePanelCount = () => {
    const check = canFitAdditionalPanel({
      panels: designData.panels,
      roofPolygon: designData.roof_polygon,
      setbackMeters: Number(designData.setback_m || 0.5),
      obstacles: designData.obstacles,
      walkways: designData.walkways,
      panelSpecs: {
        wattage: designData.panel_wattage,
        length_m: designData.panel_dimensions?.length_m || 2.278,
        width_m: designData.panel_dimensions?.width_m || 1.134,
      },
      orientation: designData.orientation,
    });

    if (!check.canFit || !check.newPanel) {
      toast.warning("Maximum practical panel capacity reached for the current roof layout.");
      return;
    }

    const updatedPanels = [...designData.panels, check.newPanel];
    const pWatt = Number(designData.panel_wattage || 550);
    const totalKw = (updatedPanels.length * pWatt) / 1000.0;
    const totalPanelArea = updatedPanels.length * check.newPanel.width * check.newPanel.height;
    const coveragePct = designData.usable_area_sqm > 0 ? (totalPanelArea / designData.usable_area_sqm) * 100 : 0;

    setDesignData((prev) => ({
      ...prev,
      panels: updatedPanels,
      panel_count: updatedPanels.length,
      system_kw: Math.round(totalKw * 100) / 100,
      coverage_pct: Math.min(100, Math.round(coveragePct * 10) / 10),
    }));

    toast.success(`Added panel (Total: ${updatedPanels.length})`);
  };

  // Manual Decrease Panel Count
  const handleDecreasePanelCount = () => {
    if (designData.panels.length === 0) return;
    const updatedPanels = designData.panels.slice(0, -1);
    const pWatt = Number(designData.panel_wattage || 550);
    const totalKw = (updatedPanels.length * pWatt) / 1000.0;
    const singleArea = (designData.panel_dimensions?.width_m || 1.134) * (designData.panel_dimensions?.length_m || 2.278);
    const coveragePct = designData.usable_area_sqm > 0 ? ((updatedPanels.length * singleArea) / designData.usable_area_sqm) * 100 : 0;

    setDesignData((prev) => ({
      ...prev,
      panels: updatedPanels,
      panel_count: updatedPanels.length,
      system_kw: Math.round(totalKw * 100) / 100,
      coverage_pct: Math.min(100, Math.round(coveragePct * 10) / 10),
    }));
  };

  // Select Product from Product Master
  const handleSelectProductFromMaster = (product) => {
    let wattage = 550;
    // Extract wattage from product name or size e.g. "550W Mono PERC" -> 550
    const match = (product.name || "").match(/(\d{3,4})\s*W/i) || (product.size || "").match(/(\d{3,4})\s*W/i);
    if (match) wattage = parseInt(match[1], 10);

    updateDesignData({
      panel_product_id: product.id,
      panel_make: product.name,
      panel_model: product.size || `${wattage}W Module`,
      panel_wattage: wattage,
    });
    setShowProductModal(false);
    toast.success(`Selected module: ${product.name}`);
  };

  // Add Obstacle
  const handleAddObstacleSubmit = () => {
    const newObs = {
      id: `obs-${Date.now()}`,
      name: newObstacleForm.name || "Obstacle",
      type: newObstacleForm.type || "water_tank",
      x: 0,
      y: 0,
      length: Number(newObstacleForm.length || 1.5),
      width: Number(newObstacleForm.width || 1.5),
      height: Number(newObstacleForm.height || 1.0),
      rotation: 0,
    };
    setDesignData((prev) => ({
      ...prev,
      obstacles: [...(prev.obstacles || []), newObs],
    }));
    setShowObstacleModal(false);
    toast.success(`Added ${newObs.name}. You can drag it to position on 2D view.`);
  };

  // Collect Snapshots and Save
  const handleSaveDesign = async (saveAsNewVersion = false) => {
    setSaving(true);
    try {
      // Capture 2D and 3D visual snapshots
      const snap2d = canvas2dRef.current?.getSnapshotDataUrl?.() || "";
      const snap3d = viewer3dRef.current?.getSnapshotDataUrl?.() || "";

      const payload = {
        ...designData,
        layout_snapshot_2d: snap2d,
        layout_snapshot_3d: snap3d,
        save_as_new_version: saveAsNewVersion,
      };

      let res;
      if (designData.id) {
        res = await api.put(`/solar-designer/designs/${designData.id}`, payload);
      } else {
        res = await api.post("/solar-designer/designs", payload);
      }

      if (res.data) {
        setDesignData(res.data);
        toast.success(saveAsNewVersion ? "Saved as new design version!" : "Solar design saved successfully!");
      }
    } catch (err) {
      toast.error("Failed to save design: " + formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  // Export PDF Report
  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const snap2d = canvas2dRef.current?.getSnapshotDataUrl?.() || "";
      const snap3d = viewer3dRef.current?.getSnapshotDataUrl?.() || "";

      const payload = {
        ...designData,
        layout_snapshot_2d: snap2d,
        layout_snapshot_3d: snap3d,
      };

      const res = await api.post("/solar-designer/export-pdf", payload, {
        responseType: "blob",
      });

      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Solar_Design_${(designData.site_name || "Report").replace(/\s+/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      toast.success("PDF report downloaded successfully!");
    } catch (err) {
      toast.error("PDF export error: " + formatApiError(err));
    } finally {
      setExporting(false);
    }
  };

  // Export DOCX Report
  const handleExportDocx = async () => {
    setExporting(true);
    try {
      const res = await api.post("/solar-designer/export-docx", designData, {
        responseType: "blob",
      });
      const blob = new Blob([res.data], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Solar_Design_${(designData.site_name || "Report").replace(/\s+/g, "_")}.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      toast.success("Word report downloaded successfully!");
    } catch (err) {
      toast.error("DOCX export error: " + formatApiError(err));
    } finally {
      setExporting(false);
    }
  };

  // Transfer to Quotation
  const handleTransferToQuotation = () => {
    const pCount = designData.panels.filter((p) => !p.hidden).length;
    const pWatt = Number(designData.panel_wattage || 550);
    const systemKw = ((pCount * pWatt) / 1000.0).toFixed(2);

    nav("/quotation", {
      state: {
        transferFromSolarDesigner: true,
        client_id: designData.client_id,
        client_name: designData.client_name,
        system_kw: systemKw,
        panel_make: designData.panel_make,
        panel_wattage: pWatt,
        panel_count: pCount,
        structure_type: designData.structure_type,
        mounting_height_m: designData.mounting_height_m,
      },
    });
  };

  if (loadingInitial) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-slate-400 text-sm">
        <RefreshCw className="w-5 h-5 animate-spin mr-2 text-blue-600" /> Loading Solar Design...
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-12">
      {/* Studio Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => nav("/solar-designer")}
            className="h-9 w-9 p-0 rounded-xl text-slate-600 hover:bg-slate-100"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Outfit" }}>
                {designData.site_name || "3D Solar Rooftop Designer"}
              </h1>
              <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200 font-semibold">
                {designData.design_number || `v${designData.version || 1}`}
              </Badge>
            </div>
            <div className="text-xs text-slate-500 flex items-center gap-2">
              <span>{designData.client_name ? `Client: ${designData.client_name}` : "Direct Site Design"}</span>
              <span>·</span>
              <span className="truncate max-w-[250px]">{designData.formatted_address || "No address selected"}</span>
            </div>
          </div>
        </div>

        {/* View Mode & Step Navigation Tabs */}
        <div className="flex items-center gap-2">
          <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 border border-slate-200">
            <Button
              size="sm"
              variant={viewMode === "2d" ? "default" : "ghost"}
              onClick={() => setViewMode("2d")}
              className="h-7 text-xs px-2.5 rounded-lg"
            >
              2D Plan
            </Button>
            <Button
              size="sm"
              variant={viewMode === "3d" ? "default" : "ghost"}
              onClick={() => setViewMode("3d")}
              className="h-7 text-xs px-2.5 rounded-lg"
            >
              3D View
            </Button>
            <Button
              size="sm"
              variant={viewMode === "split" ? "default" : "ghost"}
              onClick={() => setViewMode("split")}
              className="h-7 text-xs px-2.5 rounded-lg hidden lg:inline-flex"
            >
              Split View
            </Button>
          </div>

          <Button
            onClick={() => handleSaveDesign(false)}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-9 rounded-xl shadow-xs gap-1.5 px-4"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? "Saving..." : "Save"}</span>
          </Button>
        </div>
      </div>

      {/* Main Studio Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left / Center Viewport Column */}
        <div className="lg:col-span-8 space-y-4">
          {/* Engineering Workflow Steps Bar */}
          <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between overflow-x-auto gap-2 text-xs">
            <Button
              size="sm"
              variant={activeStep === "location" ? "default" : "ghost"}
              onClick={() => setActiveStep("location")}
              className="h-8 text-xs font-semibold rounded-xl gap-1.5 shrink-0"
            >
              <MapPin className="w-3.5 h-3.5" /> 1. Site Location
            </Button>
            <Button
              size="sm"
              variant={activeStep === "roof" ? "default" : "ghost"}
              onClick={() => { setActiveStep("roof"); setActive2dTool("draw_roof"); }}
              className="h-8 text-xs font-semibold rounded-xl gap-1.5 shrink-0"
            >
              <PenTool className="w-3.5 h-3.5" /> 2. Draw Roof
            </Button>
            <Button
              size="sm"
              variant={activeStep === "obstacles" ? "default" : "ghost"}
              onClick={() => { setActiveStep("obstacles"); setActive2dTool("select"); }}
              className="h-8 text-xs font-semibold rounded-xl gap-1.5 shrink-0"
            >
              <Box className="w-3.5 h-3.5" /> 3. Obstacles ({designData.obstacles?.length || 0})
            </Button>
            <Button
              size="sm"
              variant={activeStep === "panels" ? "default" : "ghost"}
              onClick={() => setActiveStep("panels")}
              className="h-8 text-xs font-semibold rounded-xl gap-1.5 shrink-0"
            >
              <Sun className="w-3.5 h-3.5" /> 4. Panel Layout
            </Button>
            <Button
              size="sm"
              variant={activeStep === "structure" ? "default" : "ghost"}
              onClick={() => setActiveStep("structure")}
              className="h-8 text-xs font-semibold rounded-xl gap-1.5 shrink-0"
            >
              <Layers className="w-3.5 h-3.5" /> 5. Structure & Tilt
            </Button>
          </div>

          {/* STEP 1: Site Location Picker */}
          {activeStep === "location" && (
            <SiteLocationPicker
              designData={designData}
              updateDesignData={updateDesignData}
              onProceed={() => setActiveStep("roof")}
            />
          )}

          {/* STEP 2-5: Canvas / 3D Viewport Views */}
          {activeStep !== "location" && (
            <div className="space-y-4">
              {/* Secondary Layout Controls Bar for Panels & Structure */}
              {activeStep === "panels" && (
                <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => setShowProductModal(true)}
                      variant="outline"
                      className="h-8 text-xs font-semibold rounded-xl border-blue-200 text-blue-700 bg-blue-50/50 hover:bg-blue-100"
                    >
                      <Sun className="w-3.5 h-3.5 mr-1" />
                      Module: {designData.panel_wattage}W ({designData.panel_make?.slice(0, 14)}...)
                    </Button>

                    <Select
                      value={designData.orientation || "portrait"}
                      onValueChange={(val) => {
                        updateDesignData({ orientation: val });
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs w-28 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="portrait">Portrait</SelectItem>
                        <SelectItem value="landscape">Landscape</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      onClick={() => handleAutoLayout("auto")}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold h-8 rounded-xl shadow-xs gap-1"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Auto Layout
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleIncreasePanelCount}
                      className="h-8 text-xs px-2.5 rounded-xl font-semibold border-slate-300"
                      title="Add 1 panel"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1 text-emerald-600" /> + Panel
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleDecreasePanelCount}
                      className="h-8 text-xs px-2.5 rounded-xl font-semibold border-slate-300"
                      title="Remove 1 panel"
                    >
                      - Panel
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => updateDesignData({ panels: [], panel_count: 0, system_kw: 0, coverage_pct: 0 })}
                      className="h-8 px-2 rounded-xl text-slate-400 hover:text-red-600"
                      title="Remove all panels"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              )}

              {/* STEP 3: Obstacles Controls */}
              {activeStep === "obstacles" && (
                <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between gap-3 text-xs">
                  <div className="text-slate-600">
                    Obstacles automatically create <b>no-panel exclusion zones</b>. Click "+ Add Obstruction" or drag existing obstacles on canvas.
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setShowObstacleModal(true)}
                    className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold h-8 rounded-xl shadow-xs gap-1 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Obstruction
                  </Button>
                </div>
              )}

              {/* STEP 5: Structure Controls */}
              {activeStep === "structure" && (
                <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-slate-700">Mounting System</Label>
                    <Select
                      value={designData.structure_type || "elevated"}
                      onValueChange={(val) => updateDesignData({ structure_type: val })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="elevated">Elevated Super Structure (Raised)</SelectItem>
                        <SelectItem value="flush">Flush Mount (Flat Tin / RCC)</SelectItem>
                        <SelectItem value="ballasted">Ballasted Non-Penetrating</SelectItem>
                        <SelectItem value="custom">Custom High-Tilt Structure</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-slate-700">Tilt Angle (°)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="60"
                      value={designData.tilt_angle ?? 15}
                      onChange={(e) => updateDesignData({ tilt_angle: parseFloat(e.target.value) || 0 })}
                      className="h-8 text-xs font-semibold"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-slate-700">Clearance Height (m)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0.1"
                      max="6.0"
                      value={designData.mounting_height_m ?? 1.8}
                      onChange={(e) => updateDesignData({ mounting_height_m: parseFloat(e.target.value) || 0 })}
                      className="h-8 text-xs font-semibold"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-slate-700">Setback Clearance (m)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0.1"
                      max="3.0"
                      value={designData.setback_m ?? 0.5}
                      onChange={(e) => updateDesignData({ setback_m: parseFloat(e.target.value) || 0 })}
                      className="h-8 text-xs font-semibold"
                    />
                  </div>
                </div>
              )}

              {/* 2D / 3D Canvas Renders */}
              {viewMode === "2d" && (
                <Roof2DCanvas
                  ref={canvas2dRef}
                  roofPolygon={designData.roof_polygon}
                  setRoofPolygon={handleSetRoofPolygon}
                  panels={designData.panels}
                  setPanels={(panelsOrFn) => {
                    const newPanels = typeof panelsOrFn === "function" ? panelsOrFn(designData.panels) : panelsOrFn;
                    const pCount = newPanels.filter((p) => !p.hidden).length;
                    const pWatt = Number(designData.panel_wattage || 550);
                    const totalKw = (pCount * pWatt) / 1000.0;
                    setDesignData((prev) => ({
                      ...prev,
                      panels: newPanels,
                      panel_count: pCount,
                      system_kw: Math.round(totalKw * 100) / 100,
                    }));
                  }}
                  obstacles={designData.obstacles}
                  setObstacles={(obsOrFn) => {
                    const newObs = typeof obsOrFn === "function" ? obsOrFn(designData.obstacles) : obsOrFn;
                    setDesignData((prev) => ({ ...prev, obstacles: newObs }));
                  }}
                  walkways={designData.walkways}
                  setWalkways={(walksOrFn) => {
                    const newWalks = typeof walksOrFn === "function" ? walksOrFn(designData.walkways) : walksOrFn;
                    setDesignData((prev) => ({ ...prev, walkways: newWalks }));
                  }}
                  setbackMeters={Number(designData.setback_m || 0.5)}
                  activeTool={active2dTool}
                  setActiveTool={setActive2dTool}
                  selectedPanelId={selectedPanelId}
                  setSelectedPanelId={setSelectedPanelId}
                  orientation={designData.orientation}
                  panelSpecs={{
                    length_m: designData.panel_dimensions?.length_m || 2.278,
                    width_m: designData.panel_dimensions?.width_m || 1.134,
                    wattage: designData.panel_wattage || 550,
                  }}
                />
              )}

              {viewMode === "3d" && (
                <Rooftop3DViewer
                  ref={viewer3dRef}
                  roofPolygon={designData.roof_polygon}
                  panels={designData.panels}
                  obstacles={designData.obstacles}
                  walkways={designData.walkways}
                  structureType={designData.structure_type || "elevated"}
                  tiltAngle={designData.tilt_angle || 15}
                  azimuthAngle={designData.azimuth_angle || 180}
                  mountingHeightM={designData.mounting_height_m || 1.8}
                  panelSpecs={{
                    length_m: designData.panel_dimensions?.length_m || 2.278,
                    width_m: designData.panel_dimensions?.width_m || 1.134,
                    wattage: designData.panel_wattage || 550,
                  }}
                />
              )}

              {viewMode === "split" && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <Roof2DCanvas
                    ref={canvas2dRef}
                    roofPolygon={designData.roof_polygon}
                    setRoofPolygon={handleSetRoofPolygon}
                    panels={designData.panels}
                    setPanels={(panelsOrFn) => {
                      const newPanels = typeof panelsOrFn === "function" ? panelsOrFn(designData.panels) : panelsOrFn;
                      const pCount = newPanels.filter((p) => !p.hidden).length;
                      const pWatt = Number(designData.panel_wattage || 550);
                      const totalKw = (pCount * pWatt) / 1000.0;
                      setDesignData((prev) => ({
                        ...prev,
                        panels: newPanels,
                        panel_count: pCount,
                        system_kw: Math.round(totalKw * 100) / 100,
                      }));
                    }}
                    obstacles={designData.obstacles}
                    setObstacles={(obsOrFn) => {
                      const newObs = typeof obsOrFn === "function" ? obsOrFn(designData.obstacles) : obsOrFn;
                      setDesignData((prev) => ({ ...prev, obstacles: newObs }));
                    }}
                    walkways={designData.walkways}
                    setWalkways={(walksOrFn) => {
                      const newWalks = typeof walksOrFn === "function" ? walksOrFn(designData.walkways) : walksOrFn;
                      setDesignData((prev) => ({ ...prev, walkways: newWalks }));
                    }}
                    setbackMeters={Number(designData.setback_m || 0.5)}
                    activeTool={active2dTool}
                    setActiveTool={setActive2dTool}
                    selectedPanelId={selectedPanelId}
                    setSelectedPanelId={setSelectedPanelId}
                    orientation={designData.orientation}
                  />

                  <Rooftop3DViewer
                    ref={viewer3dRef}
                    roofPolygon={designData.roof_polygon}
                    panels={designData.panels}
                    obstacles={designData.obstacles}
                    walkways={designData.walkways}
                    structureType={designData.structure_type || "elevated"}
                    tiltAngle={designData.tilt_angle || 15}
                    azimuthAngle={designData.azimuth_angle || 180}
                    mountingHeightM={designData.mounting_height_m || 1.8}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Real-Time Design Summary & Actions */}
        <div className="lg:col-span-4">
          <DesignSummaryPanel
            designData={designData}
            onSave={() => handleSaveDesign(false)}
            onSaveNewVersion={() => handleSaveDesign(true)}
            onExportPdf={handleExportPdf}
            onExportDocx={handleExportDocx}
            onTransferToQuotation={handleTransferToQuotation}
            saving={saving}
            exporting={exporting}
          />
        </div>
      </div>

      {/* Select Module from Product Master Modal */}
      <Dialog open={showProductModal} onOpenChange={setShowProductModal}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Sun className="w-5 h-5 text-amber-500" /> Select Solar Module from Product Master
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <p className="text-slate-500">
              Choose an approved solar PV module from your Product Master inventory:
            </p>

            {solarPanelProducts.length > 0 ? (
              <div className="space-y-1.5 max-h-64 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
                {solarPanelProducts.map((prod) => (
                  <div
                    key={prod.id}
                    onClick={() => handleSelectProductFromMaster(prod)}
                    className="p-3 hover:bg-blue-50/80 cursor-pointer transition flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{prod.name}</div>
                      <div className="text-[11px] text-slate-500">Size: {prod.size || "Standard"} · Stock: {prod.stock_quantity || 0} {prod.unit || "Nos"}</div>
                    </div>
                    <Button size="sm" variant="outline" className="h-7 text-xs font-semibold bg-white border-blue-200 text-blue-700">
                      Select
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center bg-slate-50 rounded-xl border border-slate-200 text-slate-500">
                No solar panel products found in Product Master. You can configure custom module specifications below.
              </div>
            )}

            {/* Custom Module Specification Form */}
            <div className="pt-3 border-t border-slate-200 space-y-3">
              <div className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">Custom Module Specification</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-slate-600">Module Make / Label</Label>
                  <Input
                    value={designData.panel_make}
                    onChange={(e) => updateDesignData({ panel_make: e.target.value })}
                    className="h-8 text-xs font-semibold"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-slate-600">Wattage Rating (Wp)</Label>
                  <Input
                    type="number"
                    value={designData.panel_wattage}
                    onChange={(e) => updateDesignData({ panel_wattage: parseFloat(e.target.value) || 550 })}
                    className="h-8 text-xs font-semibold"
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProductModal(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Obstacle Modal */}
      <Dialog open={showObstacleModal} onOpenChange={setShowObstacleModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Box className="w-5 h-5 text-red-500" /> Add Rooftop Obstruction / Exclusion
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-slate-700">Obstacle Type</Label>
              <Select
                value={newObstacleForm.type}
                onChange={(e) => {}}
                onValueChange={(val) => {
                  const preset = OBSTACLE_TYPES.find((t) => t.type === val);
                  setNewObstacleForm({
                    ...newObstacleForm,
                    type: val,
                    name: preset ? preset.label : val,
                    length: preset ? preset.length : 1.5,
                    width: preset ? preset.width : 1.5,
                    height: preset ? preset.height : 1.0,
                  });
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OBSTACLE_TYPES.map((t) => (
                    <SelectItem key={t.type} value={t.type}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-slate-700">Obstacle Label</Label>
              <Input
                value={newObstacleForm.name}
                onChange={(e) => setNewObstacleForm({ ...newObstacleForm, name: e.target.value })}
                className="h-8 text-xs font-semibold"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-slate-700">Length (m)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={newObstacleForm.length}
                  onChange={(e) => setNewObstacleForm({ ...newObstacleForm, length: parseFloat(e.target.value) || 1 })}
                  className="h-8 text-xs font-semibold"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-slate-700">Width (m)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={newObstacleForm.width}
                  onChange={(e) => setNewObstacleForm({ ...newObstacleForm, width: parseFloat(e.target.value) || 1 })}
                  className="h-8 text-xs font-semibold"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-slate-700">Height (m)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={newObstacleForm.height}
                  onChange={(e) => setNewObstacleForm({ ...newObstacleForm, height: parseFloat(e.target.value) || 1 })}
                  className="h-8 text-xs font-semibold"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowObstacleModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddObstacleSubmit} className="bg-red-600 hover:bg-red-700 text-white font-semibold text-xs">
              Add Obstruction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
