import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  PlusCircle, Undo2, Edit3, X, HelpCircle, Bell, Grid, Layers2, Image as ImageIcon, ChevronRight, Edit2, Zap
} from "lucide-react";
import { toast } from "sonner";
import dayjs from "dayjs";

import LiveSatelliteMap from "./components/LiveSatelliteMap";
import Rooftop3DViewer from "./components/Rooftop3DViewer";
import DesignSummaryPanel from "./components/DesignSummaryPanel";
import {
  DEFAULT_PANEL_SPECS,
  OBSTACLE_TYPES,
  generateAutoPanelLayout,
  canFitAdditionalPanel,
  calculateBillOfMaterials,
} from "./utils/layoutEngine";
import {
  getCartesianPolygonArea,
  getCartesianPolygonPerimeter,
  getPolygonBounds,
  projectMetersToLatLng,
  computeSetbackPolygon,
  isRectInsidePolygon,
} from "./utils/geoCalculations";
import {
  searchLocations,
  getPlaceDetails,
  getCurrentLocationDetails,
} from "@/lib/locationService";
import { useClientList } from "@/hooks/useClients";
import { useProductList } from "@/hooks/useInventory";
import { useAuth } from "@/context/AuthContext";

// 6 Primary Design Stages matching the reference information architecture
const DESIGN_STAGES = [
  { key: "location", label: "1. Location", icon: MapPin },
  { key: "roof", label: "2. Roof", icon: PenTool },
  { key: "obstacles", label: "3. Obstacles", icon: Box },
  { key: "pv_module", label: "4. PV Module", icon: Grid },
  { key: "structure", label: "5. Mounting", icon: Layers2 },
  { key: "layout", label: "6. Layout", icon: Sparkles },
];

export default function SolarStudio() {
  const { id: designId } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();

  // Fullscreen state & View mode
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState("2d"); // '2d' | '3d' | 'split'
  const [activeTool, setActiveTool] = useState("select"); // 'select' | 'draw_roof' | 'edit_roof' | 'add_panel' | 'calibrate'
  const [selectedPanelId, setSelectedPanelId] = useState(null);
  const [isCalibrated, setIsCalibrated] = useState(false);

  // Active section controls: which floating drawer is open
  const [openSection, setOpenSection] = useState(null); // 'location' | 'roof' | 'obstacles' | 'pv_module' | 'structure' | 'layout' | null

  const [saving, setSaving] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(Boolean(designId));

  // Location search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchPredictions, setSearchPredictions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [detectingGps, setDetectingGps] = useState(false);
  const [showLocationChangeConfirm, setShowLocationChangeConfirm] = useState(false);
  const [pendingLocation, setPendingLocation] = useState(null);

  // Multi-view Design Gallery state
  const [savedViews, setSavedViews] = useState([]);
  const [showGalleryModal, setShowGalleryModal] = useState(false);
  const [activeGalleryView, setActiveGalleryView] = useState(null);
  const [generatingViews, setGeneratingViews] = useState(false);

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

  // Manual 3D Roof Creator Form State
  const [showManualRoofModal, setShowManualRoofModal] = useState(false);
  const [manualRoofForm, setManualRoofForm] = useState({
    type: "gable", // 'flat' | 'single_slope' | 'gable' | 'hip' | 'custom_polygon'
    width_m: 12.0,
    length_m: 8.0,
    pitch_deg: 15,
    azimuth_deg: 180,
    eave_height_m: 3.5,
    ridge_height_m: 5.1,
    setback_m: 0.5,
    customPoints: [
      { x: -6.0, y: -4.0 },
      { x: 6.0, y: -4.0 },
      { x: 6.0, y: 4.0 },
      { x: 0.0, y: 6.5 },
      { x: -6.0, y: 4.0 },
    ],
  });

  // Viewport Refs
  const liveMapRef = useRef(null);
  const viewer3dRef = useRef(null);

  // Canonical Solar Design State
  const [designData, setDesignData] = useState({
    id: "",
    design_number: "",
    client_id: "",
    client_name: "",
    project_id: "",
    lead_id: "",
    site_name: "Ichalkaranji Solar Rooftop",
    address: "",
    formatted_address: "Ichalkaranji, Maharashtra, India",
    latitude: 16.69512,
    longitude: 74.46107,
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
    row_spacing_m: 0.03,
    panel_spacing_m: 0.03,
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
    structure_nodes: [],
    structure_members: [],
    saved_views: [],
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
          doc.structure_nodes = Array.isArray(doc.structure_nodes) ? doc.structure_nodes : [];
          doc.structure_members = Array.isArray(doc.structure_members) ? doc.structure_members : [];
          doc.saved_views = Array.isArray(doc.saved_views) ? doc.saved_views : [];

          setDesignData(doc);
          if (doc.saved_views && doc.saved_views.length > 0) {
            setSavedViews(doc.saved_views);
          }
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

  // Invalidate map size and 3D viewport on layout changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeTab === "2d" || activeTab === "split") {
        liveMapRef.current?.invalidateSize?.();
      }
      if (activeTab === "3d" || activeTab === "split") {
        viewer3dRef.current?.resize?.();
        viewer3dRef.current?.applyViewPreset?.("fitDesign");
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [activeTab, isFullscreen, openSection]);

  // Update Roof Polygon and recalculate geometric properties
  const handleSetRoofPolygon = useCallback((polygon) => {
    if (!polygon || polygon.length < 3) {
      setDesignData((prev) => ({
        ...prev,
        roof_polygon: polygon || [],
        roof_area_sqm: 0,
        roof_perimeter_m: 0,
        usable_area_sqm: 0,
      }));
      return;
    }

    const area = getCartesianPolygonArea(polygon);
    if (isNaN(area) || area < 0.5) {
      toast.warning("Roof boundary is invalid: corners overlap or area is zero.");
      return;
    }

    const perimeter = getCartesianPolygonPerimeter(polygon);
    const bounds = getPolygonBounds(polygon);
    const setback = Number(designData.roof?.setback_m || designData.setback_m || 0.5);
    const usablePoly = computeSetbackPolygon(polygon, setback);
    const usableArea = Math.round(getCartesianPolygonArea(usablePoly) * 10) / 10;

    setDesignData((prev) => {
      // Revalidate existing panels against new roof polygon without random auto-regeneration
      const currentPanels = prev.panels || [];
      const validPanels = currentPanels.filter((p) => {
        if (p.hidden) return false;
        return isRectInsidePolygon(p.x, p.y, p.width || 1.134, p.height || 2.278, p.rotation || 0, usablePoly);
      });

      const removedCount = currentPanels.length - validPanels.length;
      if (removedCount > 0) {
        toast.info(`Pruned ${removedCount} panel(s) outside new roof boundary.`);
      }

      const pWatt = Number(prev.panel_wattage || 550);
      const totalKw = (validPanels.length * pWatt) / 1000.0;
      const singleArea = (prev.panel_dimensions?.width_m || 1.134) * (prev.panel_dimensions?.length_m || 2.278);
      const coveragePct = usableArea > 0 ? Math.min(100, Math.round(((validPanels.length * singleArea) / usableArea) * 1000) / 10) : 0;

      return {
        ...prev,
        roof_polygon: polygon,
        roof_area_sqm: Math.round(area * 10) / 10,
        roof_perimeter_m: Math.round(perimeter * 10) / 10,
        roof_dimensions: {
          length_m: Math.round(bounds.length * 10) / 10,
          width_m: Math.round(bounds.width * 10) / 10,
        },
        usable_area_sqm: usableArea,
        panels: validPanels,
        panel_count: validPanels.length,
        system_kw: Math.round(totalKw * 100) / 100,
        coverage_pct: coveragePct,
      };
    });
  }, [designData.roof?.setback_m, designData.setback_m]);

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
      rowSpacingMeters: Number(designData.row_spacing_m || designData.panel_spacing_m || 0.03),
      panelSpacingMeters: Number(designData.panel_spacing_m || 0.03),
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

  // Update Custom Polygon Coordinates in Manual Mode
  const handleUpdateCustomPoint = (idx, axis, val) => {
    setManualRoofForm((prev) => {
      const updated = [...prev.customPoints];
      updated[idx] = {
        ...updated[idx],
        [axis]: parseFloat(val) || 0,
      };
      return { ...prev, customPoints: updated };
    });
  };

  const handleAddCustomPoint = () => {
    setManualRoofForm((prev) => {
      const pts = prev.customPoints || [];
      const last = pts[pts.length - 1] || { x: 0, y: 0 };
      return {
        ...prev,
        customPoints: [...pts, { x: Math.round((last.x + 2) * 10) / 10, y: Math.round(last.y * 10) / 10 }],
      };
    });
  };

  const handleDeleteCustomPoint = (idx) => {
    setManualRoofForm((prev) => {
      if ((prev.customPoints || []).length <= 3) {
        toast.warning("A custom polygon roof requires at least 3 vertices.");
        return prev;
      }
      return {
        ...prev,
        customPoints: prev.customPoints.filter((_, i) => i !== idx),
      };
    });
  };

  // Generate 3D Roof Mesh & Polygon from Manual Form
  const handleGenerateManualRoof = () => {
    const origin = {
      lat: Number(designData.latitude) || 16.69512,
      lng: Number(designData.longitude) || 74.46107,
    };

    let localCoords = [];
    const { type, width_m, length_m, pitch_deg, azimuth_deg, eave_height_m, setback_m } = manualRoofForm;
    const w = Math.max(1, Number(width_m) || 12);
    const l = Math.max(1, Number(length_m) || 8);
    const pitch = type === "flat" ? 0 : Math.max(0, Math.min(60, Number(pitch_deg) || 0));
    const eave = Math.max(1, Number(eave_height_m) || 3.5);
    const setback = Math.max(0, Number(setback_m) || 0.5);

    let calculatedRidge = Number(manualRoofForm.ridge_height_m);
    if (!calculatedRidge || calculatedRidge <= eave) {
      if (type === "flat") {
        calculatedRidge = eave;
      } else if (type === "single_slope") {
        calculatedRidge = eave + w * Math.tan((pitch * Math.PI) / 180);
      } else {
        calculatedRidge = eave + (w / 2) * Math.tan((pitch * Math.PI) / 180);
      }
    }

    if (type === "custom_polygon") {
      if (!manualRoofForm.customPoints || manualRoofForm.customPoints.length < 3) {
        toast.error("Custom polygon roof requires at least 3 vertices.");
        return;
      }
      localCoords = manualRoofForm.customPoints.map((pt) => ({
        x: Number(pt.x) || 0,
        y: Number(pt.y) || 0,
      }));
    } else {
      // Generate centered rectangular boundary (local X = width, local Y = length)
      const hw = w / 2;
      const hl = l / 2;
      localCoords = [
        { x: -hw, y: -hl },
        { x: hw, y: -hl },
        { x: hw, y: hl },
        { x: -hw, y: hl },
      ];
    }

    // Convert local Cartesian meters to GPS Lat/Lng centered at site origin
    const polygonWithGps = localCoords.map((pt) => {
      const gps = projectMetersToLatLng(pt.x, pt.y, origin);
      return {
        x: Math.round(pt.x * 100) / 100,
        y: Math.round(pt.y * 100) / 100,
        lat: gps.lat,
        lng: gps.lng,
      };
    });

    const area = getCartesianPolygonArea(polygonWithGps);
    const perimeter = getCartesianPolygonPerimeter(polygonWithGps);
    const bounds = getPolygonBounds(polygonWithGps);

    const newRoofObj = {
      type,
      pitch_deg: pitch,
      azimuth_deg: Number(azimuth_deg) || 180,
      elevation_m: eave,
      eave_height_m: eave,
      ridge_height_m: Math.round(calculatedRidge * 10) / 10,
      setback_m: setback,
      source: "manual",
      dimensions: {
        width_m: Math.round((bounds.width || w) * 10) / 10,
        length_m: Math.round((bounds.length || l) * 10) / 10,
      },
    };

    setDesignData((prev) => ({
      ...prev,
      roof_polygon: polygonWithGps,
      roof_area_sqm: Math.round(area * 10) / 10,
      roof_perimeter_m: Math.round(perimeter * 10) / 10,
      roof_dimensions: newRoofObj.dimensions,
      usable_area_sqm: Math.max(0, Math.round(area * 0.85 * 10) / 10),
      roof: newRoofObj,
      roof_type: type,
      roof_pitch: pitch,
      building_elevation_m: eave,
      eave_height_m: eave,
      ridge_height_m: newRoofObj.ridge_height_m,
      roof_source: "manual",
    }));

    setShowManualRoofModal(false);
    setActiveTab("3d");
    toast.success(`Generated 3D ${type.replace("_", " ").toUpperCase()} roof (${Math.round(area)} m²). Switched to 3D.`);

    setTimeout(() => {
      viewer3dRef.current?.applyViewPreset?.("fit");
    }, 200);
  };

  // Generate 12m x 8m Standard Template Roof directly from 3D Empty State
  const handleApplyDefaultRoofTemplate = useCallback(() => {
    const halfW = 6.0;
    const halfL = 4.0;
    const templatePolygon = [
      { x: -halfW, y: -halfL },
      { x: halfW, y: -halfL },
      { x: halfW, y: halfL },
      { x: -halfW, y: halfL },
    ];

    handleSetRoofPolygon(templatePolygon);
    toast.success("Applied standard 12m × 8m roof template.");

    setTimeout(() => {
      handleAutoLayout("auto");
      viewer3dRef.current?.applyViewPreset?.("fitDesign");
    }, 150);
  }, [handleSetRoofPolygon, handleAutoLayout]);

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
  const applySelectedLocation = useCallback((details, shouldClearGeometry = false) => {
    const lat = Number(details.latitude);
    const lng = Number(details.longitude);

    if (isNaN(lat) || isNaN(lng) || lat === 0) {
      toast.error("Could not resolve valid GPS coordinates for this location.");
      return;
    }

    const formattedAddr = details.formatted_address || details.description || details.name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    setSearchQuery(formattedAddr);

    const updates = {
      address: details.address || details.name || formattedAddr,
      formatted_address: formattedAddr,
      latitude: lat,
      longitude: lng,
      place_id: details.place_id || "",
      site_name: `${details.city || details.name || "Site"} Solar Rooftop`,
    };

    if (shouldClearGeometry) {
      updates.roof_polygon = [];
      updates.panels = [];
      updates.obstacles = [];
      updates.walkways = [];
      updates.roof_area_sqm = 0;
      updates.roof_perimeter_m = 0;
      updates.roof_dimensions = { length_m: 0, width_m: 0 };
      updates.usable_area_sqm = 0;
      updates.panel_count = 0;
      updates.system_kw = 0;
      updates.coverage_pct = 0;
      updates.calibration = {};
      updates.structure_nodes = [];
      updates.structure_members = [];
      updates.saved_views = [];
      setIsCalibrated(false);
      setSelectedPanelId(null);
      setSavedViews([]);
      // Save protection: reset lastSavedTime so user must explicitly click "Save Design"
      setLastSavedTime(null);
      // Clear in-map transient layers
      liveMapRef.current?.clearDrawState?.();
    }

    updateDesignData(updates);

    if (liveMapRef.current?.panTo) {
      liveMapRef.current.panTo(lat, lng);
    }
    if (liveMapRef.current?.resetMarkerTo) {
      liveMapRef.current.resetMarkerTo(lat, lng);
    }

    if (shouldClearGeometry) {
      toast.success(`Site location updated. Previous roof mapping cleared.`);
    } else {
      toast.success(`Location anchored to ${details.name || formattedAddr} (${lat.toFixed(5)}, ${lng.toFixed(5)})`);
    }
  }, [updateDesignData]);

  // Centralized Location Change Controller
  const requestLocationChange = useCallback((newCoords, addressInfo = {}) => {
    const newLat = Number(newCoords.latitude ?? newCoords.lat);
    const newLng = Number(newCoords.longitude ?? newCoords.lng);

    if (isNaN(newLat) || isNaN(newLng) || newLat === 0) {
      toast.error("Could not resolve valid GPS coordinates for this location.");
      return;
    }

    // Edge case: Deterministically cancel any in-progress drawing or editing
    if (activeTool === "draw_roof" || activeTool === "edit_roof") {
      setActiveTool("select");
      liveMapRef.current?.clearDrawState?.();
    }

    const currentLat = Number(designData.latitude);
    const currentLng = Number(designData.longitude);
    const hasExistingRoof = Array.isArray(designData.roof_polygon) && designData.roof_polygon.length >= 3;
    const isDifferentLocation = Math.abs(currentLat - newLat) > 0.000015 || Math.abs(currentLng - newLng) > 0.000015;

    const locationDetails = {
      latitude: newLat,
      longitude: newLng,
      formatted_address: addressInfo.formatted_address || addressInfo.name || designData.formatted_address || `${newLat.toFixed(5)}, ${newLng.toFixed(5)}`,
      address: addressInfo.address || addressInfo.name || designData.address || `${newLat.toFixed(5)}, ${newLng.toFixed(5)}`,
      place_id: addressInfo.place_id || "",
      city: addressInfo.city || "",
      name: addressInfo.name || addressInfo.formatted_address || `${newLat.toFixed(5)}, ${newLng.toFixed(5)}`,
    };

    if (hasExistingRoof && isDifferentLocation) {
      setPendingLocation(locationDetails);
      setShowLocationChangeConfirm(true);
    } else {
      applySelectedLocation(locationDetails, false);
    }
  }, [designData.latitude, designData.longitude, designData.roof_polygon, designData.formatted_address, designData.address, activeTool, applySelectedLocation]);

  const handleCancelLocationChange = useCallback(() => {
    setShowLocationChangeConfirm(false);
    setPendingLocation(null);
    if (liveMapRef.current?.resetMarkerTo) {
      liveMapRef.current.resetMarkerTo(Number(designData.latitude), Number(designData.longitude));
    }
    toast.info("Site location change cancelled. Existing roof design preserved.");
  }, [designData.latitude, designData.longitude]);

  const handleConfirmLocationChange = useCallback(() => {
    setShowLocationChangeConfirm(false);
    if (pendingLocation) {
      applySelectedLocation(pendingLocation, true);
    }
    setPendingLocation(null);
  }, [pendingLocation, applySelectedLocation]);

  // Capture the current map center as the confirmed design site
  const handleCaptureLocation = useCallback(({ lat, lng }) => {
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;
    requestLocationChange({ latitude: lat, longitude: lng });
  }, [requestLocationChange]);

  // Select Search Result Item
  const handleSelectPrediction = async (item) => {
    setSearching(true);
    setSearchPredictions([]);
    try {
      const details = await getPlaceDetails(item);
      if (details && details.latitude && details.longitude) {
        requestLocationChange(details, details);
      } else {
        toast.error("Location coordinates unavailable. Try another search or GPS.");
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
        requestLocationChange(details, details);
      }
    } catch (err) {
      toast.error(err.message || "Failed to detect GPS location.");
    } finally {
      setDetectingGps(false);
    }
  };

  // Manual Increase Panel Count
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
      rowSpacingMeters: Number(designData.row_spacing_m || designData.panel_spacing_m || 0.03),
      panelSpacingMeters: Number(designData.panel_spacing_m || 0.03),
      azimuthDegrees: Number(designData.azimuth_angle || 180),
    });

    if (!check.canFit || !check.newPanel) {
      toast.warning(check.reason || "No valid panel position available in the current roof area.");
      return;
    }

    const updatedPanels = [...designData.panels, check.newPanel];
    const pWatt = Number(designData.panel_wattage || 550);
    const totalKw = (updatedPanels.length * pWatt) / 1000.0;
    const totalPanelArea = updatedPanels.length * check.newPanel.width * check.newPanel.height;
    const coveragePct = designData.usable_area_sqm > 0 ? (totalPanelArea / designData.usable_area_sqm) * 100 : 0;
    const remainingArea = Math.max(0, (designData.usable_area_sqm || 0) - totalPanelArea);

    setDesignData((prev) => ({
      ...prev,
      panels: updatedPanels,
      panel_count: updatedPanels.length,
      system_kw: Math.round(totalKw * 100) / 100,
      coverage_pct: Math.min(100, Math.round(coveragePct * 10) / 10),
      remaining_area_sqm: Math.round(remainingArea * 100) / 100,
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
    const remainingArea = Math.max(0, (designData.usable_area_sqm || 0) - (updatedPanels.length * singleArea));

    setDesignData((prev) => ({
      ...prev,
      panels: updatedPanels,
      panel_count: updatedPanels.length,
      system_kw: Math.round(totalKw * 100) / 100,
      coverage_pct: Math.min(100, Math.round(coveragePct * 10) / 10),
      remaining_area_sqm: Math.round(remainingArea * 100) / 100,
    }));
  };

  // Generate Multi-View Snapshots from 3D Scene
  const handleGenerateViews = async () => {
    if (!viewer3dRef.current?.generateAllViews) {
      toast.info("Please switch to 3D View to generate multi-angle design captures.");
      setActiveTab("3d");
      return;
    }
    setGeneratingViews(true);
    try {
      const views = await viewer3dRef.current.generateAllViews();
      if (views && views.length > 0) {
        setSavedViews(views);
        setDesignData((prev) => ({ ...prev, saved_views: views }));
        toast.success(`Generated ${views.length} engineering views`);
      }
    } catch (e) {
      toast.error("Failed to capture views: " + e.message);
    } finally {
      setGeneratingViews(false);
    }
  };

  // Save Design with multi-views and validation
  const handleSaveDesign = async (saveAsNewVersion = false) => {
    const lat = Number(designData.latitude);
    const lng = Number(designData.longitude);
    if (!isFinite(lat) || !isFinite(lng) || lat === 0) {
      toast.error("Please set a valid site location on the map before saving.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const snap2d = liveMapRef.current?.getSnapshotDataUrl?.() || designData.layout_snapshot_2d || "";
      const snap3d = viewer3dRef.current?.getSnapshotDataUrl?.() || designData.layout_snapshot_3d || "";

      let currentViews = savedViews;
      if (viewer3dRef.current?.generateAllViews) {
        try {
          const freshViews = await viewer3dRef.current.generateAllViews();
          if (freshViews && freshViews.length > 0) {
            currentViews = freshViews;
            setSavedViews(freshViews);
          }
        } catch (e) {
          console.warn("View auto-capture error:", e);
        }
      }

      const payload = {
        ...designData,
        roof_type: designData.roof?.type || designData.roof_type || "flat",
        roof_pitch: designData.roof?.pitch_deg ?? designData.roof_pitch ?? 0,
        roof_source: designData.roof?.source || (designData.roof_polygon?.length ? "satellite" : "unknown"),
        eave_height_m: designData.roof?.eave_height_m ?? designData.roof?.elevation_m ?? 3.5,
        ridge_height_m: designData.roof?.ridge_height_m ?? 5.0,
        saved_views: currentViews,
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
        if (res.data.saved_views) {
          setSavedViews(res.data.saved_views);
        }
        setLastSavedTime(new Date());
        setSaveError(null);
        if (!designId && res.data.id) {
          window.history.replaceState(null, "", `/solar-designer/${res.data.id}`);
        }
        toast.success(saveAsNewVersion ? "Saved as new design version!" : "Design saved ✓");
      }
    } catch (err) {
      const msg = formatApiError(err);
      setSaveError(msg);
      toast.error("Unable to save design: " + msg);
    } finally {
      setSaving(false);
    }
  };

  // Next Stage step forward
  const handleNextStage = () => {
    const STAGES = ["location", "roof", "obstacles", "pv_module", "structure", "layout"];
    const currentIdx = STAGES.indexOf(openSection || "location");
    if (currentIdx < STAGES.length - 1) {
      const nextKey = STAGES[currentIdx + 1];
      setOpenSection(nextKey);
      if (nextKey === "roof" && (!designData.roof_polygon || designData.roof_polygon.length < 3)) {
        setActiveTool("draw_roof");
      } else if (nextKey === "layout" && (!designData.panels || designData.panels.length === 0)) {
        handleAutoLayout("auto");
      }
    } else {
      handleSaveDesign(false);
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

  // Transfer to Proposal Generator
  const handleTransferToProposal = () => {
    const pCount = designData.panels.filter((p) => !p.hidden).length;
    const pWatt = Number(designData.panel_wattage || 550);
    const systemKw = ((pCount * pWatt) / 1000.0).toFixed(2);
    const snap2d = liveMapRef.current?.getSnapshotDataUrl?.() || designData.layout_snapshot_2d || "";
    const snap3d = viewer3dRef.current?.getSnapshotDataUrl?.() || designData.layout_snapshot_3d || "";

    nav("/proposal-generator", {
      state: {
        transferFromSolarDesigner: true,
        designData: {
          ...designData,
          system_kw: systemKw,
          panel_count: pCount,
          panel_wattage: pWatt,
          layout_snapshot_2d: snap2d,
          layout_snapshot_3d: snap3d,
        },
      },
    });
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

  if (loadingInitial) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-slate-400 text-sm">
        <RefreshCw className="w-5 h-5 animate-spin mr-2 text-blue-600" /> Loading Solar Design...
      </div>
    );
  }

  const panelCount = Number(
    designData.panel_count ?? (designData.panels || []).filter((p) => !p.hidden).length ?? 0
  );
  const panelWattage = Number(designData.panel_wattage || 550);
  const systemKw = Number(
    designData.system_kw ?? ((panelCount * panelWattage) / 1000.0).toFixed(2)
  );

  return (
    <div className={`-mx-4 lg:-mx-8 -my-4 lg:-my-6 bg-slate-950 text-white min-h-[calc(100vh-65px)] flex flex-col select-none ${
      isFullscreen ? "fixed inset-0 z-50 p-2 overflow-hidden h-screen" : "p-3 space-y-2.5"
    }`}>
      {/* ──────────────────────────────────────────────────────────────────────────
          1. TOP PROFESSIONAL SOLARIX HEADER
      ────────────────────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 px-4 py-2 rounded-2xl shadow-xl shrink-0">
        {/* Brand & Identity */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => nav("/solar-designer")}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            title="Back to Solar Designs"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-sm">
              <Sun className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm text-white tracking-wider font-sans">SOLARIX</span>
                <span className="text-[9px] uppercase font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.2 rounded-full">
                  PRO
                </span>
              </div>
              <div className="text-[8.5px] text-slate-400 font-semibold tracking-wider uppercase">GVP SOLAR ENERGY</div>
            </div>
          </div>
        </div>

        {/* Search Location Input Pill in Header */}
        <div className="relative flex-1 max-w-md hidden md:block">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search location, address or coordinates..."
            className="h-8 pl-8 pr-8 text-xs bg-slate-800/90 border-slate-700 text-white rounded-xl placeholder:text-slate-500 focus:border-blue-500 shadow-inner"
          />
          {searching && (
            <RefreshCw className="w-3 h-3 text-blue-400 animate-spin absolute right-2.5 top-2.5" />
          )}
          {searchQuery && !searching && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Search Predictions Floating Popover */}
          {searchPredictions.length > 0 && (
            <div className="absolute top-10 left-0 right-0 z-50 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-h-56 overflow-y-auto divide-y divide-slate-800">
              {searchPredictions.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectPrediction(p)}
                  className="w-full text-left px-3 py-2 hover:bg-slate-800 text-xs transition block"
                >
                  <div className="font-semibold text-white truncate">{p.name}</div>
                  <div className="text-[10px] text-slate-400 truncate">{p.secondary || p.description}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Project Selector & User Information */}
        <div className="flex items-center gap-3">
          <div className="hidden lg:flex flex-col text-right">
            <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Project</span>
            <div className="flex items-center gap-1">
              <span className="text-xs font-bold text-white truncate max-w-[130px]">
                {designData.client_name || designData.site_name || "SHUBHAM JADHAV"}
              </span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </div>
          </div>

          <button
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
            title="Help & Shortcuts"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
          <button
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition relative"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 absolute top-1 right-1" />
          </button>

          {/* User Badge */}
          <div className="flex items-center gap-2 bg-slate-800/80 px-2.5 py-1 rounded-xl border border-slate-700">
            <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-bold text-white">
              {user?.name ? user.name.slice(0, 2).toUpperCase() : "TS"}
            </div>
            <div className="hidden sm:block text-left leading-none">
              <div className="text-xs font-semibold text-white">{user?.name || "testing shubham"}</div>
              <div className="text-[9px] text-slate-400">{user?.role || "Super Admin"}</div>
            </div>
          </div>
        </div>
      </header>

      {/* ──────────────────────────────────────────────────────────────────────────
          2. PRIMARY DESIGN NAVIGATION BAR (ICON-FIRST RAIL) + TOP ACTIONS
      ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 bg-slate-900/90 border border-slate-800 px-3.5 py-2 rounded-2xl shadow-lg shrink-0">
        {/* Horizontal Navigation: 6 Stages */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-none">
          {DESIGN_STAGES.map((stage) => {
            const Icon = stage.icon;
            const isActive = openSection === stage.key;
            return (
              <button
                key={stage.key}
                onClick={() => {
                  if (isActive) {
                    setOpenSection(null);
                  } else {
                    setOpenSection(stage.key);
                    if (stage.key === "roof") {
                      if (!designData.roof_polygon || designData.roof_polygon.length < 3) {
                        setActiveTool("draw_roof");
                      }
                    } else if (stage.key === "layout") {
                      if (!designData.panels || designData.panels.length === 0) {
                        handleAutoLayout("auto");
                      }
                    }
                  }
                }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl font-bold text-xs transition-all duration-150 shrink-0 cursor-pointer ${
                  isActive
                    ? "bg-blue-600 text-white shadow-md shadow-blue-900/50 border border-blue-500"
                    : "bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700/80 border border-slate-700/70"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-white" : "text-slate-400"}`} />
                <span>{stage.label}</span>
              </button>
            );
          })}
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Saved Status Indicator */}
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-950/80 border border-emerald-700/60 text-emerald-400 text-[11px] font-semibold">
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span>{lastSavedTime ? `Saved ${dayjs(lastSavedTime).format("hh:mm A")}` : "Saved"}</span>
          </div>

          {/* View Designs Gallery Button */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowGalleryModal(true)}
            className="h-8 text-xs font-semibold bg-slate-800/90 border-slate-700 text-white hover:bg-slate-700 rounded-xl gap-1.5 shadow-sm"
          >
            <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
            <span>View Designs ({savedViews.length || 4})</span>
          </Button>

          {/* Save Design Button */}
          <Button
            size="sm"
            onClick={() => handleSaveDesign(false)}
            disabled={saving}
            className="h-8 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md gap-1.5 px-3.5"
          >
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>{saving ? "Saving..." : "Save Design"}</span>
          </Button>
        </div>
      </div>

      {/* Save Error Recovery Banner */}
      {saveError && (
        <div className="bg-red-950/95 border border-red-500 text-red-200 px-3.5 py-2 rounded-xl flex items-center justify-between text-xs animate-in fade-in shadow-lg shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>Unable to save design: <b>{saveError}</b>. Current design remains safely in memory.</span>
          </div>
          <Button
            size="sm"
            onClick={() => handleSaveDesign(false)}
            disabled={saving}
            className="h-6 text-xs bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg px-2.5"
          >
            Retry Save
          </Button>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          3. MAIN WORKSPACE (MAP DOMINANT ~80% + RIGHT INFO PANEL ~20%)
      ────────────────────────────────────────────────────────────────────────── */}
      <div className={`grid grid-cols-1 xl:grid-cols-12 lg:grid-cols-12 gap-2.5 flex-1 min-h-0 ${isFullscreen ? "h-full" : ""}`}>
        {/* CENTER / DOMINANT WORKSPACE (9 cols on xl = 75% width, 8 cols on lg = ~67%) */}
        <div className="xl:col-span-9 lg:col-span-8 flex flex-col relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 shadow-2xl min-h-[580px] h-full">
          {/* FLOATING SECTION CONTROL DRAWER (Compact floating card over map) */}
          {openSection && (
            <div className="absolute top-14 left-4 z-40 w-80 bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-700/80 shadow-2xl p-3.5 text-white space-y-3 animate-in fade-in slide-in-from-left-2 duration-150">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  {openSection === "location" && <MapPin className="w-4 h-4 text-blue-400" />}
                  {openSection === "roof" && <PenTool className="w-4 h-4 text-emerald-400" />}
                  {openSection === "obstacles" && <Box className="w-4 h-4 text-red-400" />}
                  {openSection === "pv_module" && <Grid className="w-4 h-4 text-amber-400" />}
                  {openSection === "structure" && <Layers2 className="w-4 h-4 text-blue-400" />}
                  {openSection === "layout" && <Sparkles className="w-4 h-4 text-blue-400" />}
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    {DESIGN_STAGES.find((s) => s.key === openSection)?.label}
                  </span>
                </div>
                <button
                  onClick={() => setOpenSection(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* SECTION 1: LOCATION CONTROLS */}
              {openSection === "location" && (
                <div className="space-y-2.5 text-xs">
                  <div className="relative">
                    <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-2.5" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search city, town, address..."
                      className="h-7 pl-7 pr-2 text-xs bg-slate-800 border-slate-700 text-white rounded-lg"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleDetectGPS}
                      disabled={detectingGps}
                      className="h-7 text-xs font-semibold bg-blue-950/60 border-blue-700/60 text-blue-300 hover:bg-blue-900/80 rounded-lg"
                    >
                      <Navigation className="w-3 h-3 mr-1" /> GPS
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
                      <SelectTrigger className="h-7 text-xs bg-slate-800 border-slate-700 text-white">
                        <SelectValue placeholder="Client" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-800 text-white">
                        <SelectItem value="none">-- No Client --</SelectItem>
                        {clients.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 space-y-1 text-[11px]">
                    <div className="font-bold text-white truncate">{designData.formatted_address || "Ichalkaranji, Maharashtra"}</div>
                    <div className="text-slate-400 font-mono text-[10px]">
                      Lat: {Number(designData.latitude).toFixed(5)} · Lng: {Number(designData.longitude).toFixed(5)}
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 2: ROOF CONTROLS */}
              {openSection === "roof" && (
                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      onClick={() => setActiveTool(activeTool === "draw_roof" ? "select" : "draw_roof")}
                      className={`flex-1 h-7 text-xs font-bold rounded-lg gap-1.5 ${
                        activeTool === "draw_roof"
                          ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                          : "bg-emerald-950/70 text-emerald-300 border border-emerald-700/60 hover:bg-emerald-900"
                      }`}
                    >
                      <PenTool className="w-3 h-3" />
                      {activeTool === "draw_roof" ? "Marking Boundary..." : "Mark Roof Boundary"}
                    </Button>
                    {designData.roof_polygon?.length >= 3 && (
                      <Button
                        size="sm"
                        onClick={() => setActiveTool(activeTool === "edit_roof" ? "select" : "edit_roof")}
                        className={`h-7 text-xs font-bold rounded-lg gap-1.5 ${
                          activeTool === "edit_roof"
                            ? "bg-amber-500 text-slate-950"
                            : "bg-amber-950/60 text-amber-300 border border-amber-700/60 hover:bg-amber-900"
                        }`}
                      >
                        <Edit3 className="w-3 h-3" />
                        Edit Points
                      </Button>
                    )}
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowManualRoofModal(true)}
                    className="w-full h-7 text-xs font-bold bg-indigo-950/60 border border-indigo-700/60 text-indigo-300 hover:bg-indigo-900 hover:text-white rounded-lg gap-1.5 shadow-sm transition"
                  >
                    <Box className="w-3.5 h-3.5 text-indigo-400" />
                    Manual 3D Roof Engine
                  </Button>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] font-semibold text-slate-400">Roof Type</Label>
                      <Select
                        value={designData.roof?.type || "flat"}
                        onValueChange={(val) =>
                          setDesignData((prev) => ({
                            ...prev,
                            roof_type: val,
                            roof: { ...prev.roof, type: val },
                          }))
                        }
                      >
                        <SelectTrigger className="h-7 text-xs mt-0.5 bg-slate-800 border-slate-700 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-800 text-white">
                          <SelectItem value="flat">Flat (0°)</SelectItem>
                          <SelectItem value="single_slope">Single Slope</SelectItem>
                          <SelectItem value="gable">Gable</SelectItem>
                          <SelectItem value="hip">Hip</SelectItem>
                          <SelectItem value="custom_polygon">Custom Polygon</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[10px] font-semibold text-slate-400">Pitch (°)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="60"
                        value={designData.roof?.pitch_deg ?? 0}
                        onChange={(e) => {
                          const p = parseFloat(e.target.value) || 0;
                          setDesignData((prev) => ({
                            ...prev,
                            roof_pitch: p,
                            roof: { ...prev.roof, pitch_deg: p },
                          }));
                        }}
                        className="h-7 text-xs font-bold mt-0.5 bg-slate-800 border-slate-700 text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] font-semibold text-slate-400">Eave / Base (m)</Label>
                      <Input
                        type="number"
                        step="0.5"
                        min="1"
                        max="40"
                        value={designData.roof?.eave_height_m ?? designData.roof?.elevation_m ?? 3.5}
                        onChange={(e) => {
                          const ev = parseFloat(e.target.value) || 3.5;
                          setDesignData((prev) => ({
                            ...prev,
                            building_elevation_m: ev,
                            eave_height_m: ev,
                            roof: { ...prev.roof, elevation_m: ev, eave_height_m: ev },
                          }));
                        }}
                        className="h-7 text-xs font-bold mt-0.5 bg-slate-800 border-slate-700 text-white"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] font-semibold text-slate-400">Setback (m)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0.1"
                        max="2.0"
                        value={designData.roof?.setback_m ?? designData.setback_m ?? 0.5}
                        onChange={(e) => {
                          const sb = parseFloat(e.target.value) || 0.5;
                          setDesignData((prev) => ({
                            ...prev,
                            setback_m: sb,
                            roof: { ...prev.roof, setback_m: sb },
                          }));
                        }}
                        className="h-7 text-xs font-bold mt-0.5 bg-slate-800 border-slate-700 text-white"
                      />
                    </div>
                  </div>

                  {designData.roof?.type && designData.roof?.type !== "flat" && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px] font-semibold text-slate-400">Ridge Apex (m)</Label>
                        <Input
                          type="number"
                          step="0.2"
                          min="1"
                          max="40"
                          value={designData.roof?.ridge_height_m ?? 5.0}
                          onChange={(e) => {
                            const rh = parseFloat(e.target.value) || 5.0;
                            setDesignData((prev) => ({
                              ...prev,
                              ridge_height_m: rh,
                              roof: { ...prev.roof, ridge_height_m: rh },
                            }));
                          }}
                          className="h-7 text-xs font-bold mt-0.5 bg-slate-800 border-slate-700 text-white"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] font-semibold text-slate-400">Ridge Azimuth (°)</Label>
                        <Input
                          type="number"
                          step="5"
                          min="0"
                          max="360"
                          value={designData.roof?.azimuth_deg ?? 180}
                          onChange={(e) => {
                            const az = parseFloat(e.target.value) || 180;
                            setDesignData((prev) => ({
                              ...prev,
                              roof: { ...prev.roof, azimuth_deg: az },
                            }));
                          }}
                          className="h-7 text-xs font-bold mt-0.5 bg-slate-800 border-slate-700 text-white"
                        />
                      </div>
                    </div>
                  )}

                  {designData.roof_polygon?.length >= 3 && (
                    <div className="bg-slate-950/80 p-2 rounded-xl border border-slate-800 text-[11px] grid grid-cols-2 gap-1 font-mono">
                      <div>Area: <span className="text-emerald-400 font-bold">{designData.roof_area_sqm} m²</span></div>
                      <div>Perimeter: <span className="text-white font-bold">{designData.roof_perimeter_m} m</span></div>
                    </div>
                  )}
                </div>
              )}

              {/* SECTION 3: OBSTACLES CONTROLS */}
              {openSection === "obstacles" && (
                <div className="space-y-2.5 text-xs">
                  <Button
                    size="sm"
                    onClick={() => setShowObstacleModal(true)}
                    className="w-full h-7 text-xs font-bold bg-red-950/70 border border-red-700/60 text-red-300 hover:bg-red-900 rounded-lg gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Obstruction
                  </Button>
                  {designData.obstacles && designData.obstacles.length > 0 ? (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {designData.obstacles.map((obs) => (
                        <div key={obs.id} className="flex items-center justify-between bg-slate-950/80 px-2.5 py-1.5 rounded-xl border border-slate-800">
                          <div>
                            <div className="font-semibold text-white truncate text-[11px]">{obs.name}</div>
                            <div className="text-[9.5px] text-slate-400">{obs.length}m × {obs.width}m × {obs.height}m</div>
                          </div>
                          <button
                            onClick={() => setDesignData((prev) => ({ ...prev, obstacles: prev.obstacles.filter((o) => o.id !== obs.id) }))}
                            className="text-red-400 hover:text-red-300 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-400 italic text-center py-2 bg-slate-950/50 rounded-xl border border-slate-800/60">
                      No rooftop obstructions added
                    </div>
                  )}
                </div>
              )}

              {/* SECTION 4: PV MODULE CONTROLS */}
              {openSection === "pv_module" && (
                <div className="space-y-2.5 text-xs">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowProductModal(true)}
                    className="w-full h-7 text-xs font-semibold justify-between bg-slate-800 border-slate-700 text-white hover:bg-slate-700 rounded-lg"
                  >
                    <span className="truncate">{designData.panel_wattage}W · {designData.panel_make || "Select Module"}</span>
                    <ChevronDown className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                  </Button>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] font-semibold text-slate-400">Orientation</Label>
                      <Select
                        value={designData.orientation || "portrait"}
                        onValueChange={(val) => updateDesignData({ orientation: val })}
                      >
                        <SelectTrigger className="h-7 text-xs mt-0.5 bg-slate-800 border-slate-700 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-800 text-white">
                          <SelectItem value="portrait">Portrait</SelectItem>
                          <SelectItem value="landscape">Landscape</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[10px] font-semibold text-slate-400">Wattage (Wp)</Label>
                      <Input
                        type="number"
                        value={designData.panel_wattage}
                        onChange={(e) => updateDesignData({ panel_wattage: parseFloat(e.target.value) || 550 })}
                        className="h-7 text-xs font-bold mt-0.5 bg-slate-800 border-slate-700 text-white"
                      />
                    </div>
                  </div>

                  <div className="bg-slate-950/80 p-2 rounded-xl border border-slate-800 text-[10px] text-slate-400 space-y-1 font-mono">
                    <div className="flex items-center justify-between text-amber-300 font-bold">
                      <span>{designData.panel_wattage || 550}W Module</span>
                      <span className="capitalize text-slate-300 font-sans text-[9px] bg-slate-800 px-1.5 py-0.5 rounded">{designData.orientation || "portrait"}</span>
                    </div>
                    <div className="text-slate-300">
                      Footprint: {designData.orientation === "landscape"
                        ? `${designData.panel_dimensions?.length_m || 2.278}m (W) × ${designData.panel_dimensions?.width_m || 1.134}m (H)`
                        : `${designData.panel_dimensions?.width_m || 1.134}m (W) × ${designData.panel_dimensions?.length_m || 2.278}m (H)`}
                    </div>
                    <div>Weight: {designData.panel_dimensions?.weight_kg || 28.5} kg</div>
                  </div>
                </div>
              )}

              {/* SECTION 5: MOUNTING STRUCTURE CONTROLS */}
              {openSection === "structure" && (
                <div className="space-y-2.5 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] font-semibold text-slate-400">Structure Type</Label>
                      <Select
                        value={designData.structure?.type || designData.structure_type || "elevated"}
                        onValueChange={(val) => {
                          const isFlush = val === "flush";
                          setDesignData((prev) => ({
                            ...prev,
                            structure_type: val,
                            mounting_height_m: isFlush ? 0.12 : prev.mounting_height_m || 1.8,
                            structure: {
                              ...prev.structure,
                              type: val,
                              height_m: isFlush ? 0.12 : prev.structure?.height_m || 1.8,
                            },
                          }));
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs mt-0.5 bg-slate-800 border-slate-700 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-800 text-white">
                          <SelectItem value="elevated">Elevated</SelectItem>
                          <SelectItem value="flush">Flush</SelectItem>
                          <SelectItem value="fixed_tilt">Fixed Tilt</SelectItem>
                          <SelectItem value="ballasted">Ballasted</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[10px] font-semibold text-slate-400">Tilt Angle (°)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="45"
                        value={designData.structure?.tilt_deg ?? designData.tilt_angle ?? 15}
                        onChange={(e) => {
                          const t = parseFloat(e.target.value) || 15;
                          setDesignData((prev) => ({ ...prev, tilt_angle: t, structure: { ...prev.structure, tilt_deg: t } }));
                        }}
                        className="h-7 text-xs font-bold mt-0.5 bg-slate-800 border-slate-700 text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] font-semibold text-slate-400">Orientation (Azimuth)</Label>
                      <Select
                        value={String(designData.azimuth_angle ?? 180)}
                        onValueChange={(val) => {
                          const az = parseFloat(val) || 180;
                          setDesignData((prev) => ({
                            ...prev,
                            azimuth_angle: az,
                            structure: { ...prev.structure, azimuth: az },
                            panels: (prev.panels || []).map((p) => ({ ...p, azimuth: az })),
                          }));
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs mt-0.5 bg-slate-800 border-slate-700 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-800 text-white">
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
                      <Label className="text-[10px] font-semibold text-slate-400">Clearance (m)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0.1"
                        max="6.0"
                        value={designData.structure?.height_m ?? designData.mounting_height_m ?? 1.8}
                        onChange={(e) => {
                          const h = parseFloat(e.target.value) || 1.8;
                          setDesignData((prev) => ({ ...prev, mounting_height_m: h, structure: { ...prev.structure, height_m: h } }));
                        }}
                        className="h-7 text-xs font-bold mt-0.5 bg-slate-800 border-slate-700 text-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 6: LAYOUT CONTROLS */}
              {openSection === "layout" && (
                <div className="space-y-2.5 text-xs">
                  <Button
                    size="sm"
                    onClick={() => handleAutoLayout("auto")}
                    className="w-full h-7 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-sm gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Auto Layout Panels
                  </Button>

                  <div className="bg-slate-950/80 p-2 rounded-xl border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] font-semibold text-slate-400">Panel Gap (m)</Label>
                      <span className="text-[10px] font-mono text-amber-300 font-bold">{Number(designData.panel_spacing_m || 0.03).toFixed(2)} m</span>
                    </div>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max="0.5"
                      value={designData.panel_spacing_m ?? 0.03}
                      onChange={(e) => {
                        const gap = Math.max(0.01, parseFloat(e.target.value) || 0.03);
                        updateDesignData({ panel_spacing_m: gap, row_spacing_m: gap });
                      }}
                      className="h-7 text-xs font-bold bg-slate-800 border-slate-700 text-white"
                      placeholder="0.03"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <Button
                      size="sm"
                      onClick={handleIncreasePanelCount}
                      className="h-7 text-xs font-semibold rounded-lg bg-amber-950/60 border border-amber-700/60 text-amber-300 hover:bg-amber-900 shadow-sm"
                      title="Add panel in nearest valid roof position preserving row continuation"
                    >
                      <PlusCircle className="w-3 h-3 mr-1" /> + Add Panel
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setDesignData((prev) => ({ ...prev, panels: [], panel_count: 0, system_kw: 0, coverage_pct: 0 }));
                        toast.success("Panel layout cleared");
                      }}
                      className="h-7 text-xs text-slate-300 hover:text-red-400 border-slate-700 bg-slate-800 hover:bg-slate-700 rounded-lg"
                    >
                      <Undo2 className="w-3 h-3 mr-1" /> Reset
                    </Button>
                  </div>

                  <div className="flex items-center justify-between bg-slate-950/80 px-2.5 py-1.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 font-semibold text-xs">Panel Count:</span>
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant="outline" onClick={handleDecreasePanelCount} className="h-6 w-6 p-0 font-bold text-xs bg-slate-800 border-slate-700 text-white">−</Button>
                      <span className="font-bold text-white text-xs w-8 text-center">{panelCount}</span>
                      <Button size="sm" variant="outline" onClick={handleIncreasePanelCount} className="h-6 w-6 p-0 font-bold text-xs bg-slate-800 border-slate-700 text-white">+</Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 2D SATELLITE MAP CONTAINER (Kept mounted to preserve state & prevent re-init lag) */}
          <div className={`w-full h-full relative ${activeTab === "2d" ? "block" : "hidden"}`}>
            <LiveSatelliteMap
              ref={liveMapRef}
              latitude={Number(designData.latitude) || 16.69512}
              longitude={Number(designData.longitude) || 74.46107}
              zoom={designData.zoom || 19}
              formattedAddress={designData.formatted_address}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              searchPredictions={searchPredictions}
              onSelectPrediction={handleSelectPrediction}
              searching={searching}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              isFullscreen={isFullscreen}
              setIsFullscreen={setIsFullscreen}
              onLocationChange={(coords) => requestLocationChange(coords)}
              onCaptureLocation={handleCaptureLocation}
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
              rowSpacingMeters={Number(designData.row_spacing_m || designData.panel_spacing_m || 0.03)}
              panelSpacingMeters={Number(designData.panel_spacing_m || 0.03)}
              onAddPanel={handleIncreasePanelCount}
              panelSpecs={{
                length_m: designData.panel_dimensions?.length_m || 2.278,
                width_m: designData.panel_dimensions?.width_m || 1.134,
                wattage: designData.panel_wattage || 550,
              }}
              isCalibrated={isCalibrated}
              onCalibrationComplete={() => setIsCalibrated(true)}
            />
          </div>

          {/* 3D VIEWER CONTAINER (Kept mounted for zero-lag switching) */}
          <div className={`w-full h-full relative ${activeTab === "3d" ? "block" : "hidden"}`}>
            {/* Top 3D View Presets Toolbar */}
            <div className="absolute top-4 left-4 z-20 flex items-center gap-1 bg-slate-900/90 backdrop-blur-md p-1 rounded-xl border border-slate-800 shadow-xl">
              <button
                onClick={() => setActiveTab("2d")}
                className="px-3 py-1 text-xs font-bold rounded-lg text-slate-400 hover:text-white transition"
              >
                ← Back to 2D
              </button>
              <div className="w-[1px] h-4 bg-slate-800 mx-1" />
              <button
                onClick={() => viewer3dRef.current?.applyViewPreset?.("top")}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition"
              >
                Top View
              </button>
              <button
                onClick={() => viewer3dRef.current?.applyViewPreset?.("isometric")}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition"
              >
                3D View
              </button>
              <button
                onClick={() => viewer3dRef.current?.applyViewPreset?.("front")}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition"
              >
                Front View
              </button>
              <button
                onClick={() => viewer3dRef.current?.applyViewPreset?.("left")}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition"
              >
                Left View
              </button>
              <button
                onClick={() => viewer3dRef.current?.applyViewPreset?.("right")}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition"
              >
                Right View
              </button>
              <button
                onClick={() => viewer3dRef.current?.applyViewPreset?.("fitDesign")}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-300 transition flex items-center gap-1"
                title="Fit camera to 3D roof and structure"
              >
                <Focus className="w-3 h-3" /> Fit Design
              </button>
              <button
                onClick={() => viewer3dRef.current?.applyViewPreset?.("fitRoof")}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-teal-950/60 hover:bg-teal-900 border border-teal-700/60 text-teal-300 transition flex items-center gap-1"
                title="Fit camera to 3D roof geometry"
              >
                <Maximize2 className="w-3 h-3" /> Fit Roof
              </button>
              <div className="w-[1px] h-4 bg-slate-800 mx-1" />
              <button
                onClick={() => setShowManualRoofModal(true)}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-950/70 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-300 transition flex items-center gap-1.5 shadow-sm"
                title="Open Manual 3D Roof Creator"
              >
                <Box className="w-3.5 h-3.5" /> Manual Roof
              </button>
            </div>

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
              onSwitchTo2D={() => {
                setActiveTab("2d");
                setActiveTool("draw_roof");
              }}
              onApplyTemplateRoof={handleApplyDefaultRoofTemplate}
            />
          </div>

          {/* SPLIT SCREEN CONTAINER */}
          {activeTab === "split" && (
            <div className="grid grid-cols-1 md:grid-cols-2 w-full h-full gap-2 bg-slate-950">
              <LiveSatelliteMap
                ref={liveMapRef}
                latitude={Number(designData.latitude) || 16.69512}
                longitude={Number(designData.longitude) || 74.46107}
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
                walkways={designData.walkways}
                setbackMeters={Number(designData.roof?.setback_m || designData.setback_m || 0.5)}
                activeTool={activeTool}
                setActiveTool={setActiveTool}
                selectedPanelId={selectedPanelId}
                setSelectedPanelId={setSelectedPanelId}
                orientation={designData.orientation}
                azimuthDegrees={Number(designData.azimuth_angle || 180)}
                rowSpacingMeters={Number(designData.row_spacing_m || designData.panel_spacing_m || 0.03)}
                panelSpacingMeters={Number(designData.panel_spacing_m || 0.03)}
                onAddPanel={handleIncreasePanelCount}
                panelSpecs={{
                  length_m: designData.panel_dimensions?.length_m || 2.278,
                  width_m: designData.panel_dimensions?.width_m || 1.134,
                  wattage: designData.panel_wattage || 550,
                }}
                isCalibrated={isCalibrated}
                onCalibrationComplete={() => setIsCalibrated(true)}
                onLocationChange={(coords) => requestLocationChange(coords)}
                onCaptureLocation={handleCaptureLocation}
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
                onSwitchTo2D={() => {
                  setActiveTab("2d");
                  setActiveTool("draw_roof");
                }}
                onApplyTemplateRoof={handleApplyDefaultRoofTemplate}
              />
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: COMPACT DESIGN INFORMATION & GALLERY (3 cols on xl = 25%, 4 cols on lg = 33%) */}
        <div className="xl:col-span-3 lg:col-span-4 overflow-y-auto space-y-2.5">
          <DesignSummaryPanel
            designData={designData}
            savedViews={savedViews}
            onSelectView={(view) => {
              setActiveGalleryView(view);
              setShowGalleryModal(true);
            }}
            onOpenGallery={() => setShowGalleryModal(true)}
            onGenerateViews={handleGenerateViews}
            onSave={() => handleSaveDesign(false)}
            onSaveNewVersion={() => handleSaveDesign(true)}
            onExportPdf={handleExportPdf}
            onExportDocx={handleExportDocx}
            onTransferToQuotation={handleTransferToQuotation}
            onTransferToProposal={handleTransferToProposal}
            saving={saving}
            exporting={exporting}
          />
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          4. BOTTOM SUMMARY BAR (MATCHES REFERENCE WITH KEY METRICS + NEXT ACTION)
      ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/95 border border-slate-800 px-4 py-2.5 rounded-2xl shadow-xl shrink-0">
        <div className="flex flex-wrap items-center gap-6 text-xs">
          {/* Selected Location Pill */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                <span>Selected Location</span>
                <Edit2
                  className="w-3 h-3 text-slate-500 hover:text-white cursor-pointer"
                  onClick={() => setOpenSection("location")}
                />
              </div>
              <div className="font-bold text-white text-xs truncate max-w-[200px]">
                {designData.formatted_address || "Ichalkaranji, Maharashtra, India"}
              </div>
              <div className="text-[9.5px] font-mono text-slate-400">
                {Number(designData.latitude).toFixed(5)}, {Number(designData.longitude).toFixed(5)}
              </div>
            </div>
          </div>

          <div className="h-8 w-[1px] bg-slate-800 hidden sm:block" />

          {/* Roof Area Metric */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <PenTool className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-semibold text-slate-400">Roof Area</div>
              <div className="text-sm font-extrabold text-white">{Number(designData.roof_area_sqm || 0).toFixed(1)} m²</div>
            </div>
          </div>

          {/* Usable Area Metric */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-semibold text-slate-400">Usable Area</div>
              <div className="text-sm font-extrabold text-white">{Number(designData.usable_area_sqm || 0).toFixed(1)} m²</div>
            </div>
          </div>

          {/* Panels Count Metric */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <Grid className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-semibold text-slate-400">Panels</div>
              <div className="text-sm font-extrabold text-white">{panelCount}</div>
            </div>
          </div>

          {/* System Capacity Metric */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
              <Zap className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-semibold text-slate-400">Capacity</div>
              <div className="text-sm font-extrabold text-white">{systemKw} kWp</div>
            </div>
          </div>
        </div>

        {/* Right Action: Next Stage Step Button */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <Button
            size="sm"
            onClick={handleNextStage}
            className="h-9 px-5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg gap-2"
          >
            <span>
              {openSection === "location"
                ? "Next: Roof →"
                : openSection === "roof"
                ? "Next: Obstacles →"
                : openSection === "obstacles"
                ? "Next: PV Module →"
                : openSection === "pv_module"
                ? "Next: Mounting →"
                : openSection === "structure"
                ? "Next: Layout →"
                : "Save & Finalize ✓"}
            </span>
          </Button>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          5. DESIGN GALLERY INSPECTION MODAL
      ────────────────────────────────────────────────────────────────────────── */}
      <Dialog open={showGalleryModal} onOpenChange={setShowGalleryModal}>
        <DialogContent className="max-w-4xl bg-slate-900 border-slate-800 text-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between text-base font-bold text-white">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-blue-400" />
                <span>Solar EPC Design Gallery ({savedViews.length || 4} Views)</span>
              </div>
              <Button
                size="sm"
                onClick={handleGenerateViews}
                disabled={generatingViews}
                className="h-7 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg gap-1.5"
              >
                {generatingViews ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                <span>Refresh 3D Views</span>
              </Button>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Main Preview Area */}
            {activeGalleryView && (
              <div className="rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 p-2 space-y-2">
                <div className="h-80 w-full flex items-center justify-center bg-slate-900/60 rounded-xl overflow-hidden relative">
                  {activeGalleryView.dataUrl || activeGalleryView.thumbnail ? (
                    <img
                      src={activeGalleryView.dataUrl || activeGalleryView.thumbnail}
                      alt={activeGalleryView.name}
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <div className="text-center text-slate-500">
                      <Box className="w-12 h-12 mx-auto mb-2 text-slate-600" />
                      <span>{activeGalleryView.name} Preview</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between px-2 text-xs">
                  <div>
                    <span className="font-bold text-white">{activeGalleryView.name}</span>
                    <span className="text-slate-400 ml-2 font-mono text-[11px]">{dayjs(activeGalleryView.timestamp).format("DD MMM YYYY HH:mm:ss")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setActiveTab("3d");
                        viewer3dRef.current?.applyViewPreset?.(activeGalleryView.id || "isometric");
                        setShowGalleryModal(false);
                      }}
                      className="h-6 text-[11px] bg-slate-800 border-slate-700 text-white hover:bg-slate-700 rounded-lg"
                    >
                      Apply View to 3D Scene
                    </Button>
                    {(activeGalleryView.dataUrl || activeGalleryView.thumbnail) && (
                      <a
                        href={activeGalleryView.dataUrl || activeGalleryView.thumbnail}
                        download={`Solar_Design_${activeGalleryView.name.replace(/\s+/g, "_")}.png`}
                        className="h-6 text-[11px] px-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" /> Download
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Thumbnail Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(savedViews.length > 0 ? savedViews : [
                { id: "top", name: "Top View", timestamp: new Date() },
                { id: "3d", name: "3D View", timestamp: new Date() },
                { id: "left", name: "Left View", timestamp: new Date() },
                { id: "right", name: "Right View", timestamp: new Date() },
              ]).map((v, idx) => (
                <div
                  key={v.id || idx}
                  onClick={() => setActiveGalleryView(v)}
                  className={`p-2 rounded-xl border transition cursor-pointer bg-slate-950 ${
                    activeGalleryView?.id === v.id ? "border-blue-500 ring-1 ring-blue-500" : "border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="h-28 bg-slate-900 rounded-lg flex items-center justify-center overflow-hidden mb-1.5">
                    {v.dataUrl || v.thumbnail ? (
                      <img src={v.dataUrl || v.thumbnail} alt={v.name} className="w-full h-full object-cover" />
                    ) : (
                      <Box className="w-6 h-6 text-slate-600" />
                    )}
                  </div>
                  <div className="font-bold text-xs text-white truncate">{v.name}</div>
                  <div className="text-[10px] text-slate-400 font-mono truncate">{dayjs(v.timestamp).format("DD MMM YYYY HH:mm")}</div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGalleryModal(false)} className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700">
              Close Gallery
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ──────────────────────────────────────────────────────────────────────────
          6. SITE LOCATION CHANGE CONFIRMATION DIALOG
      ────────────────────────────────────────────────────────────────────────── */}
      <Dialog open={showLocationChangeConfirm} onOpenChange={setShowLocationChangeConfirm}>
        <DialogContent className="max-w-md bg-slate-900 border-slate-700 text-white shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-white font-bold">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" /> Change Site Location?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs text-slate-300">
            <div className="p-3.5 bg-amber-950/80 border border-amber-500/70 rounded-xl text-amber-200 text-xs leading-relaxed font-semibold">
              Changing site location will clear the current roof mapping and panel layout.
            </div>
            {pendingLocation && (
              <div className="text-[11.5px] text-slate-300">
                New Target Location: <span className="font-semibold text-white">{pendingLocation.formatted_address || pendingLocation.address || pendingLocation.name || `${pendingLocation.latitude.toFixed(5)}, ${pendingLocation.longitude.toFixed(5)}`}</span>
              </div>
            )}
          </div>
          <DialogFooter className="flex items-center justify-end gap-2.5 pt-2">
            <Button
              variant="outline"
              onClick={handleCancelLocationChange}
              className="bg-slate-800 border-slate-700 text-slate-200 hover:text-white hover:bg-slate-700 text-xs font-semibold px-4"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmLocationChange}
              className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-4 shadow-sm"
            >
              Change Location
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ──────────────────────────────────────────────────────────────────────────
          7. SELECT MODULE FROM PRODUCT MASTER MODAL
      ────────────────────────────────────────────────────────────────────────── */}
      <Dialog open={showProductModal} onOpenChange={setShowProductModal}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white text-base">
              <Sun className="w-5 h-5 text-amber-400" /> Select PV Module from Product Master
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            {solarPanelProducts.length > 0 ? (
              <div className="space-y-1.5 max-h-60 overflow-y-auto divide-y divide-slate-800 border border-slate-800 rounded-xl bg-slate-950">
                {solarPanelProducts.map((prod) => (
                  <div
                    key={prod.id}
                    onClick={() => handleSelectProductFromMaster(prod)}
                    className="p-2.5 hover:bg-slate-900 cursor-pointer transition flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="font-semibold text-white">{prod.name}</div>
                      <div className="text-[10.5px] text-slate-400">{prod.size || "Standard"} · Stock: {prod.stock_quantity || 0}</div>
                    </div>
                    <Button size="sm" variant="outline" className="h-6 text-[11px] font-semibold text-blue-400 bg-slate-800 border-slate-700">Select</Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 text-center bg-slate-950 rounded-xl text-slate-400 text-xs border border-slate-800">
                No solar panel products found in Product Master inventory. You can configure custom specs below:
              </div>
            )}

            <div className="pt-2 border-t border-slate-800 space-y-2">
              <Label className="text-xs font-semibold text-slate-300">Custom Module Wattage (Wp)</Label>
              <Input
                type="number"
                value={designData.panel_wattage}
                onChange={(e) => updateDesignData({ panel_wattage: parseFloat(e.target.value) || 550 })}
                className="h-8 text-xs font-bold bg-slate-800 border-slate-700 text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProductModal(false)} className="bg-slate-800 border-slate-700 text-white">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ──────────────────────────────────────────────────────────────────────────
          8. ADD ROOFTOP OBSTACLE MODAL
      ────────────────────────────────────────────────────────────────────────── */}
      <Dialog open={showObstacleModal} onOpenChange={setShowObstacleModal}>
        <DialogContent className="max-w-md bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white text-base">
              <Box className="w-5 h-5 text-red-400" /> Add Rooftop Obstruction
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-300">Obstacle Type</Label>
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
                <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-700 text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800 text-white">
                  {OBSTACLE_TYPES.map((t) => (
                    <SelectItem key={t.type} value={t.type}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] text-slate-400">Length (m)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={newObstacleForm.length}
                  onChange={(e) => setNewObstacleForm({ ...newObstacleForm, length: parseFloat(e.target.value) || 1 })}
                  className="h-8 text-xs font-bold bg-slate-800 border-slate-700 text-white"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-slate-400">Width (m)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={newObstacleForm.width}
                  onChange={(e) => setNewObstacleForm({ ...newObstacleForm, width: parseFloat(e.target.value) || 1 })}
                  className="h-8 text-xs font-bold bg-slate-800 border-slate-700 text-white"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-slate-400">Height (m)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={newObstacleForm.height}
                  onChange={(e) => setNewObstacleForm({ ...newObstacleForm, height: parseFloat(e.target.value) || 1 })}
                  className="h-8 text-xs font-bold bg-slate-800 border-slate-700 text-white"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowObstacleModal(false)} className="bg-slate-800 border-slate-700 text-white">Cancel</Button>
            <Button onClick={handleAddObstacleSubmit} className="bg-red-600 hover:bg-red-700 text-white font-semibold text-xs">Add Obstacle</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ──────────────────────────────────────────────────────────────────────────
          9. MANUAL 3D ROOF GENERATOR MODAL
      ────────────────────────────────────────────────────────────────────────── */}
      <Dialog open={showManualRoofModal} onOpenChange={setShowManualRoofModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-700 text-white shadow-2xl p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-white font-bold">
              <Box className="w-5 h-5 text-indigo-400" /> Manual 3D Roof Generator & Engine
            </DialogTitle>
            <p className="text-xs text-slate-400 mt-1">
              Create architectural 3D roofs directly by specifying dimensions or custom coordinates. Generates pitch-derived sloped surfaces, closed gable/hip wedge walls, and canonical polygon geometry.
            </p>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            {/* Roof Type Selection */}
            <div>
              <Label className="text-xs font-bold text-slate-300 mb-1.5 block">1. Select Roof Architecture</Label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  { type: "flat", label: "Flat Roof", sub: "0° Horizontal" },
                  { type: "single_slope", label: "Single Slope", sub: "Shed / Monopitch" },
                  { type: "gable", label: "Gable", sub: "Dual Sloped Ridge" },
                  { type: "hip", label: "Hip Roof", sub: "4-Facet Pyramid" },
                  { type: "custom_polygon", label: "Custom Polygon", sub: "Arbitrary Points" },
                ].map((opt) => (
                  <button
                    key={opt.type}
                    type="button"
                    onClick={() => {
                      const newPitch = opt.type === "flat" ? 0 : manualRoofForm.pitch_deg || 15;
                      const w = Number(manualRoofForm.width_m) || 12;
                      const eave = Number(manualRoofForm.eave_height_m) || 3.5;
                      const rGain =
                        opt.type === "flat"
                          ? 0
                          : opt.type === "single_slope"
                          ? w * Math.tan((newPitch * Math.PI) / 180)
                          : (w / 2) * Math.tan((newPitch * Math.PI) / 180);
                      setManualRoofForm((prev) => ({
                        ...prev,
                        type: opt.type,
                        pitch_deg: newPitch,
                        ridge_height_m: Math.round((eave + rGain) * 10) / 10,
                      }));
                    }}
                    className={`p-2.5 rounded-xl border text-left transition ${
                      manualRoofForm.type === opt.type
                        ? "bg-indigo-600/20 border-indigo-500 ring-1 ring-indigo-500 text-white"
                        : "bg-slate-950/60 border-slate-800 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                    }`}
                  >
                    <div className="font-bold text-xs text-white">{opt.label}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{opt.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Dimensions & Parameters */}
            {manualRoofForm.type !== "custom_polygon" ? (
              <div className="space-y-3 p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
                <Label className="text-xs font-bold text-slate-300 block">2. Building Footprint & Pitch</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-[11px] text-slate-400">Width (X / Span) [m]</Label>
                    <Input
                      type="number"
                      step="0.5"
                      min="2"
                      max="100"
                      value={manualRoofForm.width_m}
                      onChange={(e) => {
                        const w = parseFloat(e.target.value) || 2;
                        const eave = Number(manualRoofForm.eave_height_m) || 3.5;
                        const pitch = Number(manualRoofForm.pitch_deg) || 0;
                        const rGain =
                          manualRoofForm.type === "single_slope"
                            ? w * Math.tan((pitch * Math.PI) / 180)
                            : (w / 2) * Math.tan((pitch * Math.PI) / 180);
                        setManualRoofForm((prev) => ({
                          ...prev,
                          width_m: w,
                          ridge_height_m: Math.round((eave + rGain) * 10) / 10,
                        }));
                      }}
                      className="h-8 text-xs font-bold bg-slate-800 border-slate-700 text-white mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-slate-400">Length (Y / Depth) [m]</Label>
                    <Input
                      type="number"
                      step="0.5"
                      min="2"
                      max="100"
                      value={manualRoofForm.length_m}
                      onChange={(e) =>
                        setManualRoofForm((prev) => ({ ...prev, length_m: parseFloat(e.target.value) || 2 }))
                      }
                      className="h-8 text-xs font-bold bg-slate-800 border-slate-700 text-white mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-slate-400">Azimuth (° orientation)</Label>
                    <Input
                      type="number"
                      step="5"
                      min="0"
                      max="360"
                      value={manualRoofForm.azimuth_deg}
                      onChange={(e) =>
                        setManualRoofForm((prev) => ({ ...prev, azimuth_deg: parseFloat(e.target.value) || 0 }))
                      }
                      className="h-8 text-xs font-bold bg-slate-800 border-slate-700 text-white mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-slate-400">Pitch Angle (°)</Label>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      max="60"
                      disabled={manualRoofForm.type === "flat"}
                      value={manualRoofForm.type === "flat" ? 0 : manualRoofForm.pitch_deg}
                      onChange={(e) => {
                        const p = parseFloat(e.target.value) || 0;
                        const w = Number(manualRoofForm.width_m) || 12;
                        const eave = Number(manualRoofForm.eave_height_m) || 3.5;
                        const rGain =
                          manualRoofForm.type === "single_slope"
                            ? w * Math.tan((p * Math.PI) / 180)
                            : (w / 2) * Math.tan((p * Math.PI) / 180);
                        setManualRoofForm((prev) => ({
                          ...prev,
                          pitch_deg: p,
                          ridge_height_m: Math.round((eave + rGain) * 10) / 10,
                        }));
                      }}
                      className="h-8 text-xs font-bold bg-slate-800 border-slate-700 text-white mt-1 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-slate-400">Base / Eave Height [m]</Label>
                    <Input
                      type="number"
                      step="0.5"
                      min="1"
                      max="50"
                      value={manualRoofForm.eave_height_m}
                      onChange={(e) => {
                        const ev = parseFloat(e.target.value) || 3.5;
                        const w = Number(manualRoofForm.width_m) || 12;
                        const p = Number(manualRoofForm.pitch_deg) || 0;
                        const rGain =
                          manualRoofForm.type === "single_slope"
                            ? w * Math.tan((p * Math.PI) / 180)
                            : (w / 2) * Math.tan((p * Math.PI) / 180);
                        setManualRoofForm((prev) => ({
                          ...prev,
                          eave_height_m: ev,
                          ridge_height_m: Math.round((ev + rGain) * 10) / 10,
                        }));
                      }}
                      className="h-8 text-xs font-bold bg-slate-800 border-slate-700 text-white mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-slate-400">Ridge Apex Height [m]</Label>
                    <Input
                      type="number"
                      step="0.2"
                      min="1"
                      max="60"
                      disabled={manualRoofForm.type === "flat"}
                      value={
                        manualRoofForm.type === "flat"
                          ? manualRoofForm.eave_height_m
                          : manualRoofForm.ridge_height_m
                      }
                      onChange={(e) =>
                        setManualRoofForm((prev) => ({
                          ...prev,
                          ridge_height_m: parseFloat(e.target.value) || prev.eave_height_m,
                        }))
                      }
                      className="h-8 text-xs font-bold bg-slate-800 border-slate-700 text-white mt-1 disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>
            ) : (
              /* Custom Polygon Coordinate Table */
              <div className="space-y-3 p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-slate-300">2. Polygon Vertices (Cartesian Meters from Center)</Label>
                  <Button
                    size="sm"
                    type="button"
                    onClick={handleAddCustomPoint}
                    className="h-6 text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 rounded-lg gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add Point
                  </Button>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {manualRoofForm.customPoints.map((pt, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
                      <span className="text-[11px] font-mono text-indigo-400 font-bold w-14">P{idx + 1}:</span>
                      <div className="flex items-center gap-1.5 flex-1">
                        <span className="text-[10px] text-slate-400">X (m):</span>
                        <Input
                          type="number"
                          step="0.5"
                          value={pt.x}
                          onChange={(e) => handleUpdateCustomPoint(idx, "x", e.target.value)}
                          className="h-6 text-xs font-mono font-bold bg-slate-800 border-slate-700 text-white w-20 px-1.5"
                        />
                      </div>
                      <div className="flex items-center gap-1.5 flex-1">
                        <span className="text-[10px] text-slate-400">Y (m):</span>
                        <Input
                          type="number"
                          step="0.5"
                          value={pt.y}
                          onChange={(e) => handleUpdateCustomPoint(idx, "y", e.target.value)}
                          className="h-6 text-xs font-mono font-bold bg-slate-800 border-slate-700 text-white w-20 px-1.5"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteCustomPoint(idx)}
                        disabled={manualRoofForm.customPoints.length <= 3}
                        className="text-red-400 hover:text-red-300 disabled:opacity-30 p-1"
                        title={manualRoofForm.customPoints.length <= 3 ? "Requires >= 3 points" : "Delete vertex"}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80">
                  <div>
                    <Label className="text-[10px] text-slate-400">Pitch Angle (°)</Label>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      max="60"
                      value={manualRoofForm.pitch_deg}
                      onChange={(e) =>
                        setManualRoofForm((prev) => ({ ...prev, pitch_deg: parseFloat(e.target.value) || 0 }))
                      }
                      className="h-7 text-xs font-bold bg-slate-800 border-slate-700 text-white mt-0.5"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-slate-400">Eave Height [m]</Label>
                    <Input
                      type="number"
                      step="0.5"
                      min="1"
                      max="50"
                      value={manualRoofForm.eave_height_m}
                      onChange={(e) =>
                        setManualRoofForm((prev) => ({ ...prev, eave_height_m: parseFloat(e.target.value) || 3.5 }))
                      }
                      className="h-7 text-xs font-bold bg-slate-800 border-slate-700 text-white mt-0.5"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-slate-400">Ridge Height [m]</Label>
                    <Input
                      type="number"
                      step="0.5"
                      min="1"
                      max="60"
                      value={manualRoofForm.ridge_height_m}
                      onChange={(e) =>
                        setManualRoofForm((prev) => ({ ...prev, ridge_height_m: parseFloat(e.target.value) || 5.0 }))
                      }
                      className="h-7 text-xs font-bold bg-slate-800 border-slate-700 text-white mt-0.5"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Calculated Engineering Preview Card */}
            <div className="p-3 bg-indigo-950/40 border border-indigo-500/30 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div>
                <div className="text-[10px] uppercase text-indigo-300 font-semibold">Footprint Area</div>
                <div className="text-sm font-extrabold text-white">
                  {manualRoofForm.type === "custom_polygon"
                    ? Math.round(getCartesianPolygonArea(manualRoofForm.customPoints) * 10) / 10
                    : Math.round(
                        (Number(manualRoofForm.width_m) || 0) * (Number(manualRoofForm.length_m) || 0) * 10
                      ) / 10}{" "}
                  m²
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-indigo-300 font-semibold">Sloped Roof Area</div>
                <div className="text-sm font-extrabold text-emerald-400">
                  {Math.round(
                    ((manualRoofForm.type === "custom_polygon"
                      ? getCartesianPolygonArea(manualRoofForm.customPoints)
                      : (Number(manualRoofForm.width_m) || 0) * (Number(manualRoofForm.length_m) || 0)) /
                      Math.max(0.2, Math.cos(((Number(manualRoofForm.pitch_deg) || 0) * Math.PI) / 180))) *
                      10
                  ) / 10}{" "}
                  m²
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-indigo-300 font-semibold">Base / Apex Height</div>
                <div className="text-sm font-extrabold text-white">
                  {manualRoofForm.eave_height_m}m /{" "}
                  {manualRoofForm.type === "flat"
                    ? manualRoofForm.eave_height_m
                    : manualRoofForm.ridge_height_m}
                  m
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-indigo-300 font-semibold">Estimated Capacity</div>
                <div className="text-sm font-extrabold text-amber-300">
                  {Math.round(
                    (((manualRoofForm.type === "custom_polygon"
                      ? getCartesianPolygonArea(manualRoofForm.customPoints)
                      : (Number(manualRoofForm.width_m) || 0) * (Number(manualRoofForm.length_m) || 0)) *
                      0.8) /
                      2.58) *
                      0.55 *
                      10
                  ) / 10}{" "}
                  kWp
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
            <Button
              variant="outline"
              onClick={() => setShowManualRoofModal(false)}
              className="bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 text-xs font-semibold px-4"
            >
              Cancel
            </Button>
            <Button
              onClick={handleGenerateManualRoof}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-5 shadow-lg flex items-center gap-1.5"
            >
              <Box className="w-4 h-4" /> Generate 3D Roof Mesh
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
