import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Sun, MapPin, PenTool, Box, Sparkles, Layers, ArrowLeft, ArrowRight,
  Save, FileDown, Plus, Trash2, RotateCw, RefreshCw, Check, CheckCircle2,
  AlertTriangle, ShieldCheck, Download, Sliders, Ruler, Maximize2, Minimize2,
  Navigation, Search, Globe, Building2, User, FileText, Compass, ChevronDown, Eye
} from "lucide-react";
import { toast } from "sonner";

import LiveSatelliteMap from "./components/LiveSatelliteMap";
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
} from "./utils/geoCalculations";
import {
  searchLocations,
  getPlaceDetails,
  getCurrentLocationDetails,
} from "@/lib/locationService";
import { useClientList } from "@/hooks/useClients";
import { useProductList } from "@/hooks/useInventory";

export default function SolarStudio() {
  const { id: designId } = useParams();
  const nav = useNavigate();
  const location = useLocation();

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState("2d"); // '2d' | '3d' | 'split'
  const [activeTool, setActiveTool] = useState("select"); // 'select' | 'draw_roof' | 'calibrate'
  const [selectedPanelId, setSelectedPanelId] = useState(null);

  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(Boolean(designId));

  // Location search autocomplete state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchPredictions, setSearchPredictions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [detectingGps, setDetectingGps] = useState(false);

  // Clients & Products hooks
  const { data: clientsData = [] } = useClientList();
  const clients = Array.isArray(clientsData) ? clientsData : [];

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

  // Visual Viewport Refs for PDF/Word snapshot capture
  const liveMapRef = useRef(null);
  const viewer3dRef = useRef(null);

  // Canonical Solar Design State (Shared between 2D satellite map and 3D WebGL viewer)
  const [designData, setDesignData] = useState({
    id: "",
    design_number: "",
    client_id: "",
    client_name: "",
    project_id: "",
    lead_id: "",
    site_name: "Rooftop Solar PV Installation",
    address: "",
    formatted_address: "Mumbai, Maharashtra, India",
    latitude: 19.076,
    longitude: 72.8777,
    place_id: "",
    zoom: 19,
    roof_polygon: [
      { x: -7, y: -5, lat: 19.076045, lng: 72.877635 },
      { x: 7, y: -5, lat: 19.076045, lng: 72.877765 },
      { x: 7, y: 5, lat: 19.075955, lng: 72.877765 },
      { x: -7, y: 5, lat: 19.075955, lng: 72.877635 },
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
    panel_model: "550W High-Efficiency PV Module",
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

  // Fetch Existing Design if editing
  useEffect(() => {
    if (!designId) return;
    let isMounted = true;
    (async () => {
      try {
        const res = await api.get(`/solar-designer/designs/${designId}`);
        if (res.data && isMounted) {
          setDesignData(res.data);
          if (res.data.address) setSearchQuery(res.data.address);
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

  // Update Roof Polygon and recalculate geometric properties
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

    toast.success(`Generated layout: ${result.panelCount} panels (${result.totalKw.toFixed(2)} kWp)`);
  }, [designData]);

  // Run auto-layout once on initial load if panels are empty
  useEffect(() => {
    if (!designId && designData.panels.length === 0 && designData.roof_polygon.length >= 3) {
      handleAutoLayout();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Address Search Autocomplete
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchPredictions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchLocations(searchQuery);
        setSearchPredictions(results || []);
      } catch (e) {
        setSearchPredictions([]);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Select Search Item
  const handleSelectPrediction = async (item) => {
    setSearching(true);
    setSearchPredictions([]);
    try {
      const details = await getPlaceDetails(item);
      if (details) {
        setSearchQuery(details.formatted_address || details.name);
        const lat = details.latitude || designData.latitude || 19.076;
        const lng = details.longitude || designData.longitude || 72.8777;

        updateDesignData({
          address: details.address || details.name,
          formatted_address: details.formatted_address || details.name,
          latitude: lat,
          longitude: lng,
          place_id: details.place_id || "",
          site_name: `${details.city || details.name} Solar Rooftop`,
        });

        if (liveMapRef.current?.panTo) {
          liveMapRef.current.panTo(lat, lng);
        }
      }
    } catch (e) {
      console.warn("Place selection error", e);
    } finally {
      setSearching(false);
    }
  };

  // GPS Location Detection
  const handleDetectGPS = async () => {
    setDetectingGps(true);
    try {
      const details = await getCurrentLocationDetails();
      if (details && details.latitude && details.longitude) {
        setSearchQuery(details.formatted_address || `${details.city}, ${details.state}`);
        updateDesignData({
          address: details.address || details.city || "Current Location",
          formatted_address: details.formatted_address || `${details.city}, ${details.state}`,
          latitude: details.latitude,
          longitude: details.longitude,
          site_name: `${details.city || 'GPS'} Solar Rooftop`,
        });

        if (liveMapRef.current?.panTo) {
          liveMapRef.current.panTo(details.latitude, details.longitude);
        }
        toast.success("Detected GPS location!");
      }
    } catch (err) {
      toast.error(err.message || "Failed to detect GPS location.");
    } finally {
      setDetectingGps(false);
    }
  };

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
      toast.warning("No additional panel can fit within the current roof, setback and obstruction constraints.");
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

    toast.success(`Added panel #${updatedPanels.length}`);
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
    const match = (product.name || "").match(/(\d{3,4})\s*W/i) || (product.size || "").match(/(\d{3,4})\s*W/i);
    if (match) wattage = parseInt(match[1], 10);

    updateDesignData({
      panel_product_id: product.id,
      panel_make: product.name,
      panel_model: product.size || `${wattage}W PV Module`,
      panel_wattage: wattage,
    });
    setShowProductModal(false);
    toast.success(`Selected module: ${product.name}`);
  };

  // Add Obstacle Submit
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
    toast.success(`Added ${newObs.name} exclusion zone.`);
  };

  // Save Design
  const handleSaveDesign = async (saveAsNewVersion = false) => {
    setSaving(true);
    try {
      const snap2d = liveMapRef.current?.getSnapshotDataUrl?.() || "";
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

  // Export PDF
  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const snap2d = liveMapRef.current?.getSnapshotDataUrl?.() || "";
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
      toast.success("PDF technical report downloaded!");
    } catch (err) {
      toast.error("PDF export error: " + formatApiError(err));
    } finally {
      setExporting(false);
    }
  };

  // Export DOCX
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
      toast.success("Word report downloaded!");
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
    <div className={`space-y-3 select-none ${isFullscreen ? "fixed inset-0 z-50 bg-slate-950 p-3 overflow-hidden flex flex-col h-screen" : "pb-12"}`}>
      {/* 1. TOP HEADER BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 text-white p-3.5 rounded-2xl border border-slate-800 shadow-xl shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => nav("/solar-designer")}
            className="h-8 w-8 p-0 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>

          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-xs">
              <Sun className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-white tracking-tight" style={{ fontFamily: "Outfit" }}>
                  SOLARIX 3D SOLAR DESIGNER
                </span>
                <Badge variant="outline" className="text-[10px] bg-blue-900/60 text-blue-300 border-blue-700 font-semibold px-2 py-0">
                  {designData.design_number || `v${designData.version || 1}`}
                </Badge>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-2 truncate max-w-[320px]">
                <MapPin className="w-3 h-3 text-red-400 shrink-0" />
                <span className="truncate">{designData.formatted_address || "Set location on map"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setIsFullscreen(!isFullscreen)}
            variant="outline"
            className="h-8 text-xs font-semibold rounded-xl bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 gap-1.5"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span>{isFullscreen ? "Exit Fullscreen" : "Open Full Screen Designer"}</span>
          </Button>

          <Button
            size="sm"
            onClick={() => handleSaveDesign(false)}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-8 rounded-xl shadow-xs gap-1.5 px-3.5"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? "Saving..." : "Save"}</span>
          </Button>
        </div>
      </div>

      {/* 2. THREE-COLUMN DESKTOP ENGINEERING WORKSPACE */}
      <div className={`grid grid-cols-1 lg:grid-cols-12 gap-3.5 ${isFullscreen ? "flex-1 min-h-0" : ""}`}>
        {/* LEFT COLUMN: DESIGN TOOLS (3 cols) */}
        <div className={`lg:col-span-3 space-y-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm overflow-y-auto ${isFullscreen ? "max-h-full" : "max-h-[820px]"}`}>
          {/* Section 1: Location & Search */}
          <div className="space-y-2">
            <div className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Globe className="w-3 h-3 text-blue-600" /> 1. Location & Search
            </div>

            {/* Address Search with Autocomplete */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search site address, PIN, landmark..."
                className="h-8 pl-8 pr-3 text-xs"
              />
              {searching && (
                <RefreshCw className="w-3 h-3 text-blue-600 animate-spin absolute right-2.5 top-2.5" />
              )}

              {searchPredictions.length > 0 && (
                <div className="absolute top-9 left-0 right-0 z-50 bg-white rounded-xl border border-slate-200 shadow-xl max-h-52 overflow-y-auto divide-y divide-slate-100">
                  {searchPredictions.map((p, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSelectPrediction(p)}
                      className="w-full text-left p-2 hover:bg-blue-50 text-[11px] flex items-center justify-between gap-2"
                    >
                      <span className="font-semibold text-slate-800 truncate">{p.name}</span>
                      <Badge variant="outline" className="text-[9px] shrink-0">{p.type || "Place"}</Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={handleDetectGPS}
                disabled={detectingGps}
                className="h-7 text-[10.5px] font-semibold text-blue-700 bg-blue-50/50 border-blue-200 hover:bg-blue-100"
              >
                <Navigation className="w-3 h-3 mr-1" /> GPS Locate
              </Button>

              <Select
                value={designData.client_id || "none"}
                onValueChange={(val) => {
                  const c = clients.find((item) => item.id === val);
                  updateDesignData({
                    client_id: val === "none" ? "" : val,
                    client_name: c ? c.full_name : "",
                  });
                }}
              >
                <SelectTrigger className="h-7 text-[10.5px]">
                  <SelectValue placeholder="Link Client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-- No Client --</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="w-full h-[1px] bg-slate-100" />

          {/* Section 2: Roof Geometry & Drawing */}
          <div className="space-y-2">
            <div className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <PenTool className="w-3 h-3 text-emerald-600" /> 2. Roof Geometry
            </div>

            <Button
              size="sm"
              variant={activeTool === "draw_roof" ? "default" : "outline"}
              onClick={() => setActiveTool(activeTool === "draw_roof" ? "select" : "draw_roof")}
              className={`w-full h-8 text-xs font-semibold rounded-xl gap-1.5 ${
                activeTool === "draw_roof" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "border-emerald-300 text-emerald-700 bg-emerald-50/40 hover:bg-emerald-100"
              }`}
            >
              <PenTool className="w-3.5 h-3.5" />
              <span>{activeTool === "draw_roof" ? "Drawing Roof Mode (Active)" : "Draw Roof on Map"}</span>
            </Button>

            <div className="space-y-1 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 text-[11px]">
              <div className="flex items-center justify-between text-slate-600">
                <span>Setback Clearance</span>
                <span className="font-bold text-slate-800">{designData.setback_m}m</span>
              </div>
              <Slider
                value={[Number(designData.setback_m || 0.5)]}
                min={0.1}
                max={2.0}
                step={0.1}
                onValueChange={(val) => updateDesignData({ setback_m: val[0] })}
                className="py-1"
              />
            </div>
          </div>

          <div className="w-full h-[1px] bg-slate-100" />

          {/* Section 3: Obstacles & Exclusions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Box className="w-3 h-3 text-red-500" /> 3. Obstacles ({designData.obstacles?.length || 0})
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowObstacleModal(true)}
                className="h-6 text-[10.5px] px-2 text-red-600 hover:bg-red-50 font-bold"
              >
                + Add Obstacle
              </Button>
            </div>

            {designData.obstacles?.length > 0 ? (
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {designData.obstacles.map((obs) => (
                  <div key={obs.id} className="flex items-center justify-between bg-red-50/60 px-2 py-1 rounded-lg border border-red-100 text-[10.5px]">
                    <span className="font-semibold text-red-900">{obs.name}</span>
                    <button
                      onClick={() => setDesignData((prev) => ({ ...prev, obstacles: prev.obstacles.filter((o) => o.id !== obs.id) }))}
                      className="text-red-400 hover:text-red-700"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[10.5px] text-slate-400 italic bg-slate-50 p-1.5 rounded-lg text-center">
                No rooftop obstacles placed
              </div>
            )}
          </div>

          <div className="w-full h-[1px] bg-slate-100" />

          {/* Section 4: Solar Module Selection & Auto Layout */}
          <div className="space-y-2">
            <div className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Sun className="w-3 h-3 text-amber-500" /> 4. PV Module & Layout
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowProductModal(true)}
              className="w-full h-8 text-xs font-semibold justify-between border-blue-200 bg-blue-50/40 text-blue-800 hover:bg-blue-100 rounded-xl"
            >
              <span className="truncate max-w-[160px]">{designData.panel_wattage}W ({designData.panel_make})</span>
              <ChevronDown className="w-3.5 h-3.5 shrink-0" />
            </Button>

            <div className="grid grid-cols-2 gap-1.5">
              <Select
                value={designData.orientation || "portrait"}
                onValueChange={(val) => updateDesignData({ orientation: val })}
              >
                <SelectTrigger className="h-7 text-[10.5px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="portrait">Portrait</SelectItem>
                  <SelectItem value="landscape">Landscape</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={designData.structure_type || "elevated"}
                onValueChange={(val) => updateDesignData({ structure_type: val })}
              >
                <SelectTrigger className="h-7 text-[10.5px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="elevated">Elevated (1.8m)</SelectItem>
                  <SelectItem value="flush">Flush Mount</SelectItem>
                  <SelectItem value="ballasted">Ballasted</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Primary Auto Layout Button */}
            <Button
              size="sm"
              onClick={() => handleAutoLayout("auto")}
              className="w-full h-8 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Auto Layout Panels</span>
            </Button>

            {/* Manual Panel Quantity Adjuster */}
            <div className="flex items-center justify-between bg-slate-50 p-1.5 rounded-xl border border-slate-200 text-xs">
              <span className="text-slate-500 font-medium text-[11px] px-1">Fine-tune Panels:</span>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" onClick={handleDecreasePanelCount} className="h-6 w-7 p-0 font-bold">-</Button>
                <span className="font-bold text-slate-800 px-1 text-xs">{designData.panels.filter((p) => !p.hidden).length}</span>
                <Button size="sm" variant="outline" onClick={handleIncreasePanelCount} className="h-6 w-7 p-0 font-bold">+</Button>
              </div>
            </div>
          </div>
        </div>

        {/* CENTER COLUMN: DOMINANT LIVE WORKSPACE (6 cols) */}
        <div className={`lg:col-span-6 flex flex-col space-y-2 ${isFullscreen ? "flex-1 min-h-0" : "h-[740px]"}`}>
          {/* Mode Switcher Toolbar */}
          <div className="flex items-center justify-between bg-slate-900 p-1.5 rounded-2xl border border-slate-800 shadow-md shrink-0">
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant={activeTab === "2d" ? "default" : "ghost"}
                onClick={() => setActiveTab("2d")}
                className="h-7 text-xs font-semibold px-3 rounded-xl"
              >
                2D Satellite Plan
              </Button>
              <Button
                size="sm"
                variant={activeTab === "3d" ? "default" : "ghost"}
                onClick={() => setActiveTab("3d")}
                className="h-7 text-xs font-semibold px-3 rounded-xl"
              >
                3D Live View
              </Button>
              <Button
                size="sm"
                variant={activeTab === "split" ? "default" : "ghost"}
                onClick={() => setActiveTab("split")}
                className="h-7 text-xs font-semibold px-3 rounded-xl hidden xl:inline-flex"
              >
                Split Mode
              </Button>
            </div>

            <div className="text-[11px] text-slate-400 pr-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Real-Time Engine Active</span>
            </div>
          </div>

          {/* Central Visual Canvas Area */}
          <div className="flex-1 min-h-0 relative rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
            {activeTab === "2d" && (
              <LiveSatelliteMap
                ref={liveMapRef}
                latitude={Number(designData.latitude) || 19.076}
                longitude={Number(designData.longitude) || 72.8777}
                zoom={designData.zoom || 19}
                onLocationChange={(coords) => updateDesignData(coords)}
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
                activeTool={activeTool}
                setActiveTool={setActiveTool}
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

            {activeTab === "3d" && (
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

            {activeTab === "split" && (
              <div className="grid grid-cols-1 md:grid-cols-2 h-full gap-2 bg-slate-950">
                <LiveSatelliteMap
                  ref={liveMapRef}
                  latitude={Number(designData.latitude) || 19.076}
                  longitude={Number(designData.longitude) || 72.8777}
                  roofPolygon={designData.roof_polygon}
                  setRoofPolygon={handleSetRoofPolygon}
                  panels={designData.panels}
                  obstacles={designData.obstacles}
                  setbackMeters={Number(designData.setback_m || 0.5)}
                  activeTool={activeTool}
                  setActiveTool={setActiveTool}
                />
                <Rooftop3DViewer
                  ref={viewer3dRef}
                  roofPolygon={designData.roof_polygon}
                  panels={designData.panels}
                  obstacles={designData.obstacles}
                  structureType={designData.structure_type || "elevated"}
                  tiltAngle={designData.tilt_angle || 15}
                  azimuthAngle={designData.azimuth_angle || 180}
                />
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: LIVE DATA & DESIGN SUMMARY (3 cols) */}
        <div className={`lg:col-span-3 overflow-y-auto ${isFullscreen ? "max-h-full" : "max-h-[820px]"}`}>
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
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Sun className="w-5 h-5 text-amber-500" /> Select PV Module from Product Master
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            {solarPanelProducts.length > 0 ? (
              <div className="space-y-1.5 max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
                {solarPanelProducts.map((prod) => (
                  <div
                    key={prod.id}
                    onClick={() => handleSelectProductFromMaster(prod)}
                    className="p-2.5 hover:bg-blue-50 cursor-pointer transition flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{prod.name}</div>
                      <div className="text-[10.5px] text-slate-500">{prod.size || "Standard"} · Stock: {prod.stock_quantity || 0}</div>
                    </div>
                    <Button size="sm" variant="outline" className="h-6 text-[11px] font-semibold text-blue-700 bg-white">Select</Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 text-center bg-slate-50 rounded-xl text-slate-500 text-xs">
                No solar panel products found in Product Master inventory. You can configure custom specs below:
              </div>
            )}

            {/* Custom module specification */}
            <div className="pt-2 border-t border-slate-200 space-y-2">
              <Label className="text-xs font-semibold text-slate-700">Custom Module Wattage (Wp)</Label>
              <Input
                type="number"
                value={designData.panel_wattage}
                onChange={(e) => updateDesignData({ panel_wattage: parseFloat(e.target.value) || 550 })}
                className="h-8 text-xs font-bold"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProductModal(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Obstacle Modal */}
      <Dialog open={showObstacleModal} onOpenChange={setShowObstacleModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Box className="w-5 h-5 text-red-500" /> Add Rooftop Obstruction
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Obstacle Type</Label>
              <Select
                value={newObstacleForm.type}
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
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OBSTACLE_TYPES.map((t) => (
                    <SelectItem key={t.type} value={t.type}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] text-slate-600">Length (m)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={newObstacleForm.length}
                  onChange={(e) => setNewObstacleForm({ ...newObstacleForm, length: parseFloat(e.target.value) || 1 })}
                  className="h-8 text-xs font-bold"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-slate-600">Width (m)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={newObstacleForm.width}
                  onChange={(e) => setNewObstacleForm({ ...newObstacleForm, width: parseFloat(e.target.value) || 1 })}
                  className="h-8 text-xs font-bold"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-slate-600">Height (m)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={newObstacleForm.height}
                  onChange={(e) => setNewObstacleForm({ ...newObstacleForm, height: parseFloat(e.target.value) || 1 })}
                  className="h-8 text-xs font-bold"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowObstacleModal(false)}>Cancel</Button>
            <Button onClick={handleAddObstacleSubmit} className="bg-red-600 hover:bg-red-700 text-white font-semibold text-xs">Add Obstacle</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
