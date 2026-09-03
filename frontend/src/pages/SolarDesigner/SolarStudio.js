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
  Navigation, Search, Globe, Building2, User, FileText, Compass, ChevronDown, ChevronUp, Eye, Focus,
  PlusCircle, Undo2
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

  // Fullscreen state & View mode
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState("2d"); // '2d' | '3d' | 'split'
  const [activeTool, setActiveTool] = useState("select"); // 'select' | 'draw_roof' | 'add_panel' | 'calibrate'
  const [selectedPanelId, setSelectedPanelId] = useState(null);
  const [isCalibrated, setIsCalibrated] = useState(false);

  // Accordion state: only ONE major section open at a time
  const [openSection, setOpenSection] = useState(null); // null = all collapsed; 'location' | 'roof' | 'obstacles' | 'pv_module' | 'structure' | 'layout'

  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(Boolean(designId));

  // Location search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchPredictions, setSearchPredictions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [detectingGps, setDetectingGps] = useState(false);
  const [showLocationChangeConfirm, setShowLocationChangeConfirm] = useState(false);
  const [pendingLocation, setPendingLocation] = useState(null);

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

  // Viewport Refs
  const liveMapRef = useRef(null);
  const viewer3dRef = useRef(null);

  // Canonical Solar Design State (0-default for brand new designs)
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
    // 1. Roof Geometry
    roof: {
      type: "flat", // 'flat' | 'single_slope' | 'gable' | 'hip'
      pitch_deg: 0,
      azimuth_deg: 180,
      elevation_m: 3.0,
      surface_material: "concrete",
      setback_m: 0.5,
    },
    roof_polygon: [],
    roof_area_sqm: 0,
    roof_perimeter_m: 0,
    roof_dimensions: { length_m: 0, width_m: 0 },
    calibration: {},
    setback_m: 0.5,
    edge_clearance_m: 0.5,
    walkway_m: 0.6,
    walkways: [],
    usable_area_sqm: 0,
    coverage_pct: 0,
    // 2. Obstacles Array
    obstacles: [],
    // 3. Panel Specification & Layout
    panel_product_id: "",
    panel_make: "Tier-1 High Efficiency Mono PERC",
    panel_model: "550W High-Efficiency PV Module",
    panel_wattage: 550,
    panel_dimensions: { length_m: 2.278, width_m: 1.134, weight_kg: 28.5 },
    orientation: "portrait",
    tilt_angle: 15,
    azimuth_angle: 180, // Default South
    row_spacing_m: 0.35,
    panel_spacing_m: 0.02,
    panel_count: 0,
    system_kw: 0,
    panels: [],
    // 4. Mounting Structure
    structure: {
      type: "elevated", // 'elevated' | 'flush' | 'fixed_tilt' | 'ballasted'
      tilt_deg: 15,
      height_m: 1.8,
      azimuth: 180,
      show_structure: true,
      cross_bracing: true,
      base_plates: true,
      show_supports: true,
      rail_type: "aluminium_6063",
    },
    structure_type: "elevated",
    mounting_height_m: 1.8,
    material_estimates: {},
    camera_state: {},
    // 5. Interactive Structure Editor — nodes & members
    // A node = { id, x, y, z, type: 'anchor'|'post_top'|'junction'|'manual' }
    // A member = { id, nodeAId, nodeBId, type: 'post'|'rail'|'brace'|'beam'|'member' }
    structure_nodes: [],
    structure_members: [],
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
          const doc = res.data;
          if (!doc.roof) {
            doc.roof = {
              type: doc.roof_type || "flat",
              pitch_deg: doc.roof_pitch || 0,
              azimuth_deg: doc.azimuth_angle || 180,
              elevation_m: doc.building_elevation_m || 3.0,
              setback_m: doc.setback_m || 0.5,
            };
          }
          if (!doc.structure) {
            doc.structure = {
              type: doc.structure_type || "elevated",
              tilt_deg: doc.tilt_angle || 15,
              height_m: doc.mounting_height_m || 1.8,
              azimuth: doc.azimuth_angle || 180,
              show_structure: true,
              cross_bracing: true,
              base_plates: true,
              show_supports: true,
            };
          }
          doc.obstacles = Array.isArray(doc.obstacles) ? doc.obstacles : [];
          doc.panels = Array.isArray(doc.panels) ? doc.panels : [];
          doc.roof_polygon = Array.isArray(doc.roof_polygon) ? doc.roof_polygon : [];
          // Restore interactive structure editor data
          doc.structure_nodes = Array.isArray(doc.structure_nodes) ? doc.structure_nodes : [];
          doc.structure_members = Array.isArray(doc.structure_members) ? doc.structure_members : [];
          setDesignData(doc);
          if (doc.formatted_address || doc.address) {
            setSearchQuery(doc.formatted_address || doc.address);
          }
        }
      } catch (err) {
        toast.error("Failed to load design: " + formatApiError(err));
      } finally {
        if (isMounted) setLoadingInitial(false);
      }
    })();
    return () => { isMounted = false; };
  }, [designId]);

  // Merge updates to canonical design data
  const updateDesignData = useCallback((updates) => {
    setDesignData((prev) => ({ ...prev, ...updates }));
  }, []);

  // FIX: Call map.invalidateSize() after accordion open/close or tab switch.
  // Without this, Leaflet's internal pixel→latlng calculations use stale container
  // dimensions, causing click coordinate offset whenever the sidebar layout shifts.
  useEffect(() => {
    const timer = setTimeout(() => {
      liveMapRef.current?.invalidateSize?.();
    }, 320); // slight delay to let CSS transitions complete
    return () => clearTimeout(timer);
  }, [openSection, activeTab, isFullscreen]);

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
    if (!designData.roof_polygon || designData.roof_polygon.length < 3) {
      toast.warning("Please draw a roof boundary on the map first.");
      setOpenSection("roof");
      setActiveTool("draw_roof");
      return;
    }

    const result = generateAutoPanelLayout({
      roofPolygon: designData.roof_polygon,
      setbackMeters: Number(designData.roof?.setback_m || designData.setback_m || 0.5),
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

  // Address Search Autocomplete with Debounce
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

  // Apply Selected Location to Canonical State & Map
  const applySelectedLocation = (details) => {
    const lat = Number(details.latitude);
    const lng = Number(details.longitude);

    if (isNaN(lat) || isNaN(lng) || lat === 0) {
      toast.error("Could not resolve valid GPS coordinates for this location.");
      return;
    }

    const formattedAddr = details.formatted_address || details.description || details.name;
    setSearchQuery(formattedAddr);

    updateDesignData({
      address: details.address || details.name,
      formatted_address: formattedAddr,
      latitude: lat,
      longitude: lng,
      place_id: details.place_id || "",
      site_name: `${details.city || details.name} Solar Rooftop`,
    });

    if (liveMapRef.current?.panTo) {
      liveMapRef.current.panTo(lat, lng);
    }

    toast.success(`Location updated to ${details.name} (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
  };

  // Select Search Result Item
  const handleSelectPrediction = async (item) => {
    setSearching(true);
    setSearchPredictions([]);
    try {
      const details = await getPlaceDetails(item);
      if (details && details.latitude && details.longitude) {
        if (designData.roof_polygon && designData.roof_polygon.length >= 3 && designData.latitude !== details.latitude) {
          setPendingLocation(details);
          setShowLocationChangeConfirm(true);
        } else {
          applySelectedLocation(details);
        }
      } else {
        toast.error("Location coordinates unavailable. Try another search or use GPS.");
      }
    } catch (e) {
      toast.error("Failed to fetch location details.");
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
        applySelectedLocation(details);
      }
    } catch (err) {
      toast.error(err.message || "Failed to detect GPS location.");
    } finally {
      setDetectingGps(false);
    }
  };

  // Manual Increase Panel Count with Physical Space Check
  const handleIncreasePanelCount = () => {
    if (!designData.roof_polygon || designData.roof_polygon.length < 3) {
      toast.warning("Please draw a roof boundary first.");
      return;
    }

    const check = canFitAdditionalPanel({
      panels: designData.panels,
      roofPolygon: designData.roof_polygon,
      setbackMeters: Number(designData.roof?.setback_m || designData.setback_m || 0.5),
      obstacles: designData.obstacles,
      walkways: designData.walkways,
      panelSpecs: {
        wattage: designData.panel_wattage,
        length_m: designData.panel_dimensions?.length_m || 2.278,
        width_m: designData.panel_dimensions?.width_m || 1.134,
      },
      orientation: designData.orientation,
      azimuthDegrees: Number(designData.azimuth_angle || 180),
    });

    if (!check.canFit || !check.newPanel) {
      toast.warning("No additional panel can fit within the available roof area.");
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
      length: Number(newObstacleForm.length || 1.8),
      width: Number(newObstacleForm.width || 1.8),
      height: Number(newObstacleForm.height || 1.6),
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

  // Export PDF Report
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
        panel_model: designData.panel_model,
        panel_wattage: pWatt,
        panel_count: pCount,
        orientation: designData.orientation || "portrait",
        azimuth: designData.azimuth_angle || 180,
        tilt_angle: designData.structure?.tilt_deg ?? designData.tilt_angle ?? 15,
        structure_type: designData.structure?.type || designData.structure_type,
        mounting_height_m: designData.structure?.height_m || designData.mounting_height_m,
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

  // Toggle Accordion Section (ensures only 1 section is open at a time)
  const toggleSection = (sectionName) => {
    setOpenSection(openSection === sectionName ? null : sectionName);
  };

  return (
    <div className={`space-y-2.5 select-none ${isFullscreen ? "fixed inset-0 z-50 bg-slate-950 p-2.5 overflow-hidden flex flex-col h-screen" : "pb-12"}`}>
      {/* 1. TOP HEADER BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-900 text-white px-3.5 py-2.5 rounded-2xl border border-slate-800 shadow-xl shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => nav("/solar-designer")}
            className="h-7 w-7 p-0 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>

          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs">
              <Sun className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs text-white tracking-tight" style={{ fontFamily: "Outfit" }}>
                  SOLARIX 3D SOLAR DESIGNER
                </span>
                <Badge variant="outline" className="text-[9px] bg-blue-900/60 text-blue-300 border-blue-700 font-semibold px-1.5 py-0">
                  {designData.design_number || `v${designData.version || 1}`}
                </Badge>
              </div>
              <div className="text-[10px] text-slate-400 flex items-center gap-1.5 truncate max-w-[340px]">
                <MapPin className="w-3 h-3 text-red-400 shrink-0" />
                <span className="truncate">{designData.formatted_address || "Set location on map"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Top Actions */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setIsFullscreen(!isFullscreen)}
            variant="outline"
            className="h-7 text-[11px] font-semibold rounded-lg bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 gap-1.5"
          >
            {isFullscreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
            <span>{isFullscreen ? "Exit Fullscreen" : "Full Screen"}</span>
          </Button>

          <Button
            size="sm"
            onClick={() => handleSaveDesign(false)}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[11px] h-7 rounded-lg shadow-xs gap-1.5 px-3"
          >
            <Save className="w-3 h-3" />
            <span>{saving ? "Saving..." : "Save"}</span>
          </Button>
        </div>
      </div>

      {/* 2. THREE-COLUMN DESKTOP ENGINEERING WORKSPACE */}
      <div className={`grid grid-cols-1 lg:grid-cols-12 gap-2 ${isFullscreen ? "flex-1 min-h-0" : ""}`}>
        {/* LEFT COLUMN: DESIGN TOOLS ACCORDION (2 cols — compact) */}
        <div className={`lg:col-span-2 space-y-1 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-xs overflow-y-auto ${isFullscreen ? "max-h-full" : "max-h-[860px]"}`}>
          {/* SECTION 1: Location & Search */}
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <button
              onClick={() => toggleSection("location")}
              className="w-full flex items-center justify-between px-2 py-1.5 bg-slate-50 hover:bg-slate-100 transition"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <Globe className="w-3 h-3 text-blue-600 shrink-0" />
                <span className="text-[10.5px] font-bold text-slate-800 truncate">1. Location</span>
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-1">
                {openSection !== "location" && designData.formatted_address && (
                  <span className="text-[9px] text-slate-500 truncate max-w-[60px] hidden xl:block">
                    {designData.formatted_address.split(",")[0]}
                  </span>
                )}
                {openSection === "location" ? <ChevronUp className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
              </div>
            </button>

            {openSection === "location" && (
              <div className="p-2 space-y-1.5 bg-white border-t border-slate-100 text-xs">
                <div className="relative">
                  <Search className="w-3 h-3 text-slate-400 absolute left-2 top-2" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search city, town, PIN..."
                    className="h-6 pl-6 pr-2 text-[10.5px]"
                  />
                  {searching && <RefreshCw className="w-3 h-3 text-blue-600 animate-spin absolute right-2 top-1.5" />}
                  {searchPredictions.length > 0 && (
                    <div className="absolute top-7 left-0 right-0 z-50 bg-white rounded-xl border border-slate-200 shadow-2xl max-h-48 overflow-y-auto divide-y divide-slate-100">
                      {searchPredictions.map((p, idx) => (
                        <button key={idx} onClick={() => handleSelectPrediction(p)} className="w-full text-left px-2 py-1.5 hover:bg-blue-50 text-[10.5px] transition block">
                          <div className="font-bold text-slate-900 truncate">{p.name}</div>
                          <div className="text-[9.5px] text-slate-500 truncate">{p.secondary || p.description}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-1">
                  <Button size="sm" variant="outline" onClick={handleDetectGPS} disabled={detectingGps}
                    className="h-6 text-[9.5px] font-semibold text-blue-700 bg-blue-50/50 border-blue-200 hover:bg-blue-100 px-1.5">
                    <Navigation className="w-2.5 h-2.5 mr-0.5" /> GPS
                  </Button>
                  <Select value={designData.client_id || "none"} onValueChange={(val) => { const c = clients.find((item) => item.id === val); updateDesignData({ client_id: val === "none" ? "" : val, client_name: c ? c.full_name : "" }); }}>
                    <SelectTrigger className="h-6 text-[9.5px]"><SelectValue placeholder="Client" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- No Client --</SelectItem>
                      {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 text-[9.5px] space-y-0.5">
                  <div className="font-bold text-slate-800 truncate">{designData.formatted_address || "—"}</div>
                  <div className="text-slate-400">Lat: <b>{Number(designData.latitude).toFixed(4)}</b> · Lng: <b>{Number(designData.longitude).toFixed(4)}</b></div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 2: Roof Geometry & Pitch */}
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <button
              onClick={() => toggleSection("roof")}
              className="w-full flex items-center justify-between px-2 py-1.5 bg-slate-50 hover:bg-slate-100 transition"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <PenTool className="w-3 h-3 text-emerald-600 shrink-0" />
                <span className="text-[10.5px] font-bold text-slate-800 truncate">2. Roof</span>
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-1">
                {openSection !== "roof" && (
                  <span className="text-[9px] text-slate-500 truncate max-w-[60px] hidden xl:block">
                    {designData.roof?.type ? designData.roof.type.replace("_", " ") : "Flat"} · {designData.roof?.pitch_deg ?? 0}°
                  </span>
                )}
                {openSection === "roof" ? <ChevronUp className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
              </div>
            </button>

            {openSection === "roof" && (
              <div className="p-2 space-y-1.5 bg-white border-t border-slate-100 text-xs">
                <Button size="sm" variant={activeTool === "draw_roof" ? "default" : "outline"}
                  onClick={() => setActiveTool(activeTool === "draw_roof" ? "select" : "draw_roof")}
                  className={`w-full h-6 text-[10.5px] font-semibold rounded-lg gap-1 ${
                    activeTool === "draw_roof" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "border-emerald-300 text-emerald-700 bg-emerald-50/40 hover:bg-emerald-100"
                  }`}>
                  <PenTool className="w-3 h-3" />
                  {activeTool === "draw_roof" ? "Drawing (Active)" : "Draw Roof on Map"}
                </Button>

                <div className="grid grid-cols-2 gap-1">
                  <div>
                    <Label className="text-[9px] font-semibold text-slate-500">Type</Label>
                    <Select value={designData.roof?.type || "flat"} onValueChange={(val) => setDesignData((prev) => ({ ...prev, roof: { ...prev.roof, type: val } }))}>
                      <SelectTrigger className="h-6 text-[9.5px] mt-0.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="flat">Flat (0°)</SelectItem>
                        <SelectItem value="single_slope">Single Slope</SelectItem>
                        <SelectItem value="gable">Gable</SelectItem>
                        <SelectItem value="hip">Hip</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[9px] font-semibold text-slate-500">Pitch (°)</Label>
                    <Input type="number" min="0" max="45" value={designData.roof?.pitch_deg ?? 0}
                      onChange={(e) => setDesignData((prev) => ({ ...prev, roof: { ...prev.roof, pitch_deg: parseFloat(e.target.value) || 0 } }))}
                      className="h-6 text-[10px] font-bold mt-0.5" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1">
                  <div>
                    <Label className="text-[9px] font-semibold text-slate-500">Bldg Ht (m)</Label>
                    <Input type="number" step="0.5" min="1" max="30" value={designData.roof?.elevation_m ?? 3.0}
                      onChange={(e) => setDesignData((prev) => ({ ...prev, roof: { ...prev.roof, elevation_m: parseFloat(e.target.value) || 3.0 } }))}
                      className="h-6 text-[10px] font-bold mt-0.5" />
                  </div>
                  <div>
                    <Label className="text-[9px] font-semibold text-slate-500">Setback (m)</Label>
                    <Input type="number" step="0.1" min="0.1" max="2.0" value={designData.roof?.setback_m ?? designData.setback_m ?? 0.5}
                      onChange={(e) => { const sb = parseFloat(e.target.value) || 0.5; setDesignData((prev) => ({ ...prev, setback_m: sb, roof: { ...prev.roof, setback_m: sb } })); }}
                      className="h-6 text-[10px] font-bold mt-0.5" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 3: Obstacles & Exclusions */}
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <button
              onClick={() => toggleSection("obstacles")}
              className="w-full flex items-center justify-between px-2 py-1.5 bg-slate-50 hover:bg-slate-100 transition"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <Box className="w-3 h-3 text-red-500 shrink-0" />
                <span className="text-[10.5px] font-bold text-slate-800 truncate">3. Obstacles</span>
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-1">
                <span className="text-[9px] font-bold text-slate-500">{designData.obstacles?.length || 0}</span>
                {openSection === "obstacles" ? <ChevronUp className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
              </div>
            </button>

            {openSection === "obstacles" && (
              <div className="p-2 space-y-1.5 bg-white border-t border-slate-100 text-xs">
                <Button size="sm" variant="outline" onClick={() => setShowObstacleModal(true)}
                  className="w-full h-6 text-[10px] font-bold text-red-600 border-red-200 bg-red-50/40 hover:bg-red-100">
                  <Plus className="w-3 h-3 mr-0.5" /> Add Obstacle
                </Button>
                {designData.obstacles && designData.obstacles.length > 0 ? (
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {designData.obstacles.map((obs) => (
                      <div key={obs.id} className="flex items-center justify-between bg-red-50/70 px-1.5 py-1 rounded-lg border border-red-100">
                        <span className="text-[9.5px] font-semibold text-red-900 truncate">{obs.name}</span>
                        <button onClick={() => setDesignData((prev) => ({ ...prev, obstacles: prev.obstacles.filter((o) => o.id !== obs.id) }))} className="text-red-400 hover:text-red-700 ml-1">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[9.5px] text-slate-400 italic text-center py-1">No obstacles added</div>
                )}
              </div>
            )}
          </div>

          {/* SECTION 4: PV Module Specification */}
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <button
              onClick={() => toggleSection("pv_module")}
              className="w-full flex items-center justify-between px-2 py-1.5 bg-slate-50 hover:bg-slate-100 transition"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <Sun className="w-3 h-3 text-amber-500 shrink-0" />
                <span className="text-[10.5px] font-bold text-slate-800 truncate">4. PV Module</span>
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-1">
                <span className="text-[9px] font-bold text-amber-600">{designData.panel_wattage}W</span>
                {openSection === "pv_module" ? <ChevronUp className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
              </div>
            </button>

            {openSection === "pv_module" && (
              <div className="p-2 space-y-1.5 bg-white border-t border-slate-100 text-xs">
                <Button size="sm" variant="outline" onClick={() => setShowProductModal(true)}
                  className="w-full h-6 text-[9.5px] font-semibold justify-between border-blue-200 bg-blue-50/40 text-blue-800 hover:bg-blue-100 rounded-lg">
                  <span className="truncate">{designData.panel_wattage}W · {designData.panel_make || "Select Module"}</span>
                  <ChevronDown className="w-3 h-3 shrink-0" />
                </Button>
                <div className="grid grid-cols-2 gap-1">
                  <div>
                    <Label className="text-[9px] font-semibold text-slate-500">Orientation</Label>
                    <Select value={designData.orientation || "portrait"} onValueChange={(val) => updateDesignData({ orientation: val })}>
                      <SelectTrigger className="h-6 text-[9.5px] mt-0.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="portrait">Portrait</SelectItem>
                        <SelectItem value="landscape">Landscape</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[9px] font-semibold text-slate-500">Wattage (Wp)</Label>
                    <Input type="number" value={designData.panel_wattage}
                      onChange={(e) => updateDesignData({ panel_wattage: parseFloat(e.target.value) || 550 })}
                      className="h-6 text-[10px] font-bold mt-0.5" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 5: Mounting Structure & Tilt */}
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <button
              onClick={() => toggleSection("structure")}
              className="w-full flex items-center justify-between px-2 py-1.5 bg-slate-50 hover:bg-slate-100 transition"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <Layers className="w-3 h-3 text-blue-600 shrink-0" />
                <span className="text-[10.5px] font-bold text-slate-800 truncate">5. Mounting</span>
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-1">
                {openSection !== "structure" && (
                  <span className="text-[9px] text-slate-500 truncate max-w-[55px] hidden xl:block">
                    {(designData.structure?.type || "elevated").charAt(0).toUpperCase() + (designData.structure?.type || "elevated").slice(1)} · {designData.structure?.tilt_deg ?? 15}°
                  </span>
                )}
                {openSection === "structure" ? <ChevronUp className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
              </div>
            </button>

            {openSection === "structure" && (
              <div className="p-2 space-y-1.5 bg-white border-t border-slate-100 text-xs">
                <div className="grid grid-cols-2 gap-1">
                  <div>
                    <Label className="text-[9px] font-semibold text-slate-500">Type</Label>
                    <Select
                      value={designData.structure?.type || designData.structure_type || "elevated"}
                      onValueChange={(val) => {
                        const isFlush = val === "flush";
                        setDesignData((prev) => ({ ...prev, structure_type: val, mounting_height_m: isFlush ? 0.12 : prev.mounting_height_m || 1.8, structure: { ...prev.structure, type: val, height_m: isFlush ? 0.12 : prev.structure?.height_m || 1.8 } }));
                      }}
                    >
                      <SelectTrigger className="h-6 text-[9.5px] mt-0.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="elevated">Elevated</SelectItem>
                        <SelectItem value="flush">Flush</SelectItem>
                        <SelectItem value="fixed_tilt">Fixed Tilt</SelectItem>
                        <SelectItem value="ballasted">Ballasted</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[9px] font-semibold text-slate-500">Tilt (°)</Label>
                    <Input type="number" min="0" max="45"
                      value={designData.structure?.tilt_deg ?? designData.tilt_angle ?? 15}
                      onChange={(e) => { const t = parseFloat(e.target.value) || 15; setDesignData((prev) => ({ ...prev, tilt_angle: t, structure: { ...prev.structure, tilt_deg: t } })); }}
                      className="h-6 text-[10px] font-bold mt-0.5" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <div>
                    <Label className="text-[9px] font-semibold text-slate-500">Azimuth</Label>
                    <Select value={String(designData.azimuth_angle ?? 180)}
                      onValueChange={(val) => { const az = parseFloat(val) || 180; setDesignData((prev) => ({ ...prev, azimuth_angle: az, structure: { ...prev.structure, azimuth: az }, panels: (prev.panels || []).map((p) => ({ ...p, azimuth: az })) })); }}>
                      <SelectTrigger className="h-6 text-[9.5px] mt-0.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="180">South 180°</SelectItem>
                        <SelectItem value="135">SE 135°</SelectItem>
                        <SelectItem value="225">SW 225°</SelectItem>
                        <SelectItem value="90">East 90°</SelectItem>
                        <SelectItem value="270">West 270°</SelectItem>
                        <SelectItem value="0">North 0°</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[9px] font-semibold text-slate-500">Clearance (m)</Label>
                    <Input type="number" step="0.1" min="0.1" max="6.0"
                      value={designData.structure?.height_m ?? designData.mounting_height_m ?? 1.8}
                      onChange={(e) => { const h = parseFloat(e.target.value) || 1.8; setDesignData((prev) => ({ ...prev, mounting_height_m: h, structure: { ...prev.structure, height_m: h } })); }}
                      className="h-6 text-[10px] font-bold mt-0.5" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 6: Panel Layout Controls */}
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <button
              onClick={() => toggleSection("layout")}
              className="w-full flex items-center justify-between px-2 py-1.5 bg-slate-50 hover:bg-slate-100 transition"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <Sparkles className="w-3 h-3 text-blue-600 shrink-0" />
                <span className="text-[10.5px] font-bold text-slate-800 truncate">6. Layout</span>
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-1">
                <span className="text-[9px] font-bold text-blue-600">{designData.panels.filter((p) => !p.hidden).length} pcs</span>
                {openSection === "layout" ? <ChevronUp className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
              </div>
            </button>

            {openSection === "layout" && (
              <div className="p-2 space-y-1.5 bg-white border-t border-slate-100 text-xs">
                <Button size="sm" onClick={() => handleAutoLayout("auto")}
                  className="w-full h-7 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10.5px] rounded-lg shadow-xs gap-1">
                  <Sparkles className="w-3 h-3" /> Auto Layout Panels
                </Button>
                <div className="grid grid-cols-2 gap-1">
                  <Button size="sm" variant={activeTool === "add_panel" ? "default" : "outline"}
                    onClick={() => setActiveTool(activeTool === "add_panel" ? "select" : "add_panel")}
                    className={`h-6 text-[9.5px] font-semibold rounded-lg ${
                      activeTool === "add_panel" ? "bg-amber-600 hover:bg-amber-700 text-white" : "border-amber-300 text-amber-700 bg-amber-50/50"
                    }`}>
                    <PlusCircle className="w-2.5 h-2.5 mr-0.5" /> + Panel
                  </Button>
                  <Button size="sm" variant="outline"
                    onClick={() => { setDesignData((prev) => ({ ...prev, panels: [], panel_count: 0, system_kw: 0, coverage_pct: 0 })); toast.success("Reset panel layout"); }}
                    className="h-6 text-[9.5px] text-slate-600 hover:text-red-600 border-slate-200 rounded-lg">
                    <Undo2 className="w-2.5 h-2.5 mr-0.5" /> Reset
                  </Button>
                </div>
                <div className="flex items-center justify-between bg-slate-50 px-2 py-1 rounded-lg border border-slate-200">
                  <span className="text-[9.5px] text-slate-600 font-semibold">Count:</span>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="outline" onClick={handleDecreasePanelCount} className="h-5 w-6 p-0 font-bold text-xs">−</Button>
                    <span className="font-bold text-slate-900 text-[10.5px] w-6 text-center">{designData.panels.filter((p) => !p.hidden).length}</span>
                    <Button size="sm" variant="outline" onClick={handleIncreasePanelCount} className="h-5 w-6 p-0 font-bold text-xs">+</Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* CENTER COLUMN: DOMINANT LIVE WORKSPACE (8 cols — wider map) */}
        <div className={`lg:col-span-8 flex flex-col space-y-2 ${isFullscreen ? "flex-1 min-h-0" : "h-[740px]"}`}>
          {/* Mode Switcher Toolbar — Prominent segmented control */}
          <div className="flex items-center justify-between bg-slate-900 p-1.5 rounded-2xl border border-slate-800 shadow-md shrink-0">
            {/* Primary 2D / 3D segmented control */}
            <div className="flex items-center bg-slate-800 rounded-xl p-0.5 gap-0.5">
              <button
                onClick={() => setActiveTab("2d")}
                className={`h-8 px-4 text-xs font-bold rounded-lg transition-all ${
                  activeTab === "2d"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                📍 2D PLAN
              </button>
              <button
                onClick={() => setActiveTab("3d")}
                className={`h-8 px-4 text-xs font-bold rounded-lg transition-all ${
                  activeTab === "3d"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                🧊 3D VIEW
              </button>
              <button
                onClick={() => setActiveTab("split")}
                className={`h-8 px-3 text-xs font-bold rounded-lg transition-all hidden xl:block ${
                  activeTab === "split"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                ⊞ SPLIT
              </button>
            </div>

            <div className="text-[11px] text-slate-400 pr-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Real-Time Sync</span>
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
                  const singleArea = (designData.panel_dimensions?.width_m || 1.134) * (designData.panel_dimensions?.length_m || 2.278);
                  const coveragePct = designData.usable_area_sqm > 0 ? ((pCount * singleArea) / designData.usable_area_sqm) * 100 : 0;
                  setDesignData((prev) => ({
                    ...prev,
                    panels: newPanels,
                    panel_count: pCount,
                    system_kw: Math.round(totalKw * 100) / 100,
                    coverage_pct: Math.min(100, Math.round(coveragePct * 10) / 10),
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
                setbackMeters={Number(designData.roof?.setback_m || designData.setback_m || 0.5)}
                activeTool={activeTool}
                setActiveTool={setActiveTool}
                selectedPanelId={selectedPanelId}
                setSelectedPanelId={setSelectedPanelId}
                orientation={designData.orientation}
                azimuthDegrees={Number(designData.azimuth_angle || 180)}
                panelSpecs={{
                  length_m: designData.panel_dimensions?.length_m || 2.278,
                  width_m: designData.panel_dimensions?.width_m || 1.134,
                  wattage: designData.panel_wattage || 550,
                }}
                isCalibrated={isCalibrated}
                onCalibrationComplete={() => setIsCalibrated(true)}
              />
            )}

            {activeTab === "3d" && (
              <Rooftop3DViewer
                ref={viewer3dRef}
                roofPolygon={designData.roof_polygon}
                roof={designData.roof}
                panels={designData.panels}
                obstacles={designData.obstacles}
                walkways={designData.walkways}
                structure={{
                  ...designData.structure,
                  azimuth: Number(designData.azimuth_angle || 180),
                  tilt_deg: Number(designData.structure?.tilt_deg ?? designData.tilt_angle ?? 15),
                  height_m: Number(designData.structure?.height_m ?? designData.mounting_height_m ?? 1.8),
                }}
                panelSpecs={{
                  length_m: designData.panel_dimensions?.length_m || 2.278,
                  width_m: designData.panel_dimensions?.width_m || 1.134,
                  wattage: designData.panel_wattage || 550,
                }}
                structureNodes={designData.structure_nodes || []}
                structureMembers={designData.structure_members || []}
                onStructureNodesChange={(nodes) => setDesignData((prev) => ({ ...prev, structure_nodes: nodes }))}
                onStructureMembersChange={(members) => setDesignData((prev) => ({ ...prev, structure_members: members }))}
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
                  setbackMeters={Number(designData.roof?.setback_m || designData.setback_m || 0.5)}
                  activeTool={activeTool}
                  setActiveTool={setActiveTool}
                  isCalibrated={isCalibrated}
                />
                <Rooftop3DViewer
                  ref={viewer3dRef}
                  roofPolygon={designData.roof_polygon}
                  roof={designData.roof}
                  panels={designData.panels}
                  obstacles={designData.obstacles}
                  structure={{
                    ...designData.structure,
                    azimuth: Number(designData.azimuth_angle || 180),
                  }}
                  structureNodes={designData.structure_nodes || []}
                  structureMembers={designData.structure_members || []}
                  onStructureNodesChange={(nodes) => setDesignData((prev) => ({ ...prev, structure_nodes: nodes }))}
                  onStructureMembersChange={(members) => setDesignData((prev) => ({ ...prev, structure_members: members }))}
                />
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: LIVE DATA & DESIGN SUMMARY (2 cols) */}
        <div className={`lg:col-span-2 overflow-y-auto ${isFullscreen ? "max-h-full" : "max-h-[860px]"}`}>
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

      {/* Location Change Confirmation Dialog */}
      <Dialog open={showLocationChangeConfirm} onOpenChange={setShowLocationChangeConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <MapPin className="w-5 h-5 text-amber-500" /> Change Site Location?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs text-slate-600">
            <p>
              You are moving to <b>{pendingLocation?.name || "a new site"}</b>.
            </p>
            <p className="bg-amber-50 p-2.5 rounded-lg border border-amber-200 text-amber-900 leading-relaxed">
              Changing site location will move the map center and satellite context. Your existing roof geometry and solar panel layout will remain intact.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLocationChangeConfirm(false)}>Cancel</Button>
            <Button
              onClick={() => {
                setShowLocationChangeConfirm(false);
                if (pendingLocation) applySelectedLocation(pendingLocation);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs"
            >
              Confirm & Move Location
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                    length: preset ? preset.length : 1.8,
                    width: preset ? preset.width : 1.8,
                    height: preset ? preset.height : 1.6,
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
