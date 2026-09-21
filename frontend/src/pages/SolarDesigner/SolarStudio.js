import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Sun, MapPin, PenTool, Box, Sparkles, Layers, ArrowLeft, ArrowRight,
  Save, FileDown, Plus, Trash2, RotateCw, RotateCcw, RefreshCw, Check, CheckCircle2,
  AlertTriangle, ShieldCheck, Download, Sliders, Ruler, Maximize2, Minimize2,
  Navigation, Search, Globe, Building2, User, FileText, Compass, ChevronDown, ChevronUp, Eye, Focus,
  PlusCircle, Undo2, Edit3, X, HelpCircle, Bell, Grid, Layers2, Image as ImageIcon, ChevronRight, Edit2, Zap,
  Scissors, Move
} from "lucide-react";
import { toast } from "sonner";
import dayjs from "dayjs";

import LiveSatelliteMap from "./components/LiveSatelliteMap";
const Rooftop3DViewer = lazy(() => import("./components/Rooftop3DViewer"));
import DesignSummaryPanel from "./components/DesignSummaryPanel";
import LayoutMicroAdjuster from "./components/LayoutMicroAdjuster";
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
  toRad,
  ensureCartesianCoordinates,
  splitPolygonWithLine,
  mergeTwoAdjacentPolygons,
  validateSectionPolygon,
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

/**
 * Authoritative roof metric recalculation helper.
 * Mathematically enforces usable_area_sqm <= roof_area_sqm across single or multi-section roofs.
 */
export const recalculateRoofMetrics = (roofPolygon, roofSections, setbackM = 0.5) => {
  const polyArea = roofPolygon && roofPolygon.length >= 3 ? getCartesianPolygonArea(roofPolygon) : 0;
  let sectionsArea = 0;
  let totalUsableArea = 0;

  if (Array.isArray(roofSections) && roofSections.length > 0) {
    roofSections.forEach((sec) => {
      if (sec.polygon && sec.polygon.length >= 3) {
        const sArea = getCartesianPolygonArea(sec.polygon);
        sectionsArea += sArea;
        const sUsable = computeSetbackPolygon(sec.polygon, setbackM);
        const sUsableArea = sUsable && sUsable.length >= 3 ? getCartesianPolygonArea(sUsable) : 0;
        totalUsableArea += Math.min(sArea, sUsableArea);
      }
    });
  }

  const totalRoofArea = Math.max(polyArea, sectionsArea);
  let finalUsableArea = 0;
  if (Array.isArray(roofSections) && roofSections.length > 0) {
    finalUsableArea = Math.min(totalRoofArea, totalUsableArea);
  } else if (roofPolygon && roofPolygon.length >= 3) {
    const parentUsable = computeSetbackPolygon(roofPolygon, setbackM);
    const parentUsableArea = parentUsable && parentUsable.length >= 3 ? getCartesianPolygonArea(parentUsable) : 0;
    finalUsableArea = Math.min(totalRoofArea, parentUsableArea);
  }

  return {
    roof_area_sqm: Math.round(totalRoofArea * 10) / 10,
    usable_area_sqm: Math.round(finalUsableArea * 10) / 10,
  };
};


class Viewer3DErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.warn("[Viewer3DErrorBoundary caught error]:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 text-white p-6 text-center z-30">
          <div className="w-12 h-12 rounded-2xl bg-indigo-950 border border-indigo-700/60 flex items-center justify-center mb-3 text-indigo-400 font-bold">
            3D
          </div>
          <h4 className="text-sm font-bold text-slate-200 mb-1">3D Visualizer Notice</h4>
          <p className="text-xs text-slate-400 max-w-sm mb-4">
            3D WebGL acceleration is unavailable in this environment ({this.state.error?.message || "WebGL context creation failed"}).
          </p>
          <Button
            size="sm"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              this.props.onSwitchTo2D?.();
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-1.5 rounded-xl"
          >
            ← Return to 2D Satellite Designer
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function SolarStudio() {
  const { id: designId } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();

  // Fullscreen state & View mode
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState("2d"); // '2d' | '3d' | 'split'
  const [hasOpened3D, setHasOpened3D] = useState(false);

  useEffect(() => {
    if (activeTab === "3d" || activeTab === "split") {
      setHasOpened3D(true);
    }
  }, [activeTab]);

  const [activeTool, setActiveTool] = useState("select"); // 'select' | 'draw_roof' | 'edit_roof' | 'add_panel' | 'calibrate'
  const [selectedPanelId, setSelectedPanelId] = useState(null);
  const [selectedSectionId, setSelectedSectionId] = useState(null);
  const [isSectionSettingsOpen, setIsSectionSettingsOpen] = useState(false);
  const [showMicroAdjust, setShowMicroAdjust] = useState(false);
  const [selectionMode, setSelectionMode] = useState("panel"); // 'panel' | 'row' | 'array'
  const [selectedRowIndex, setSelectedRowIndex] = useState(null);
  const [autoLayoutBaselinePanels, setAutoLayoutBaselinePanels] = useState(null);
  const [hasManualAdjustments, setHasManualAdjustments] = useState(false);
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
    roof_sections: [],
    roof_area_sqm: 0,
    roof_perimeter_m: 0,
    roof_dimensions: { length_m: 0, width_m: 0 },
    calibration: {},
    setback_m: 0.5,
    edge_clearance_m: 0.5,
    walkway_m: 0.75, // India CEA standard: 75cm (750mm) clear rooftop access pathway
    walkway_enabled: true,
    walkway_frequency: "every_10",
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
      type: "elevated", // 'elevated' | 'flush' | 'fixed_tilt' | 'east_west' | 'ballasted'
      tilt_deg: 15,
      height_m: 1.8,
      azimuth: 180,
      material: "GI", // 'GI' | 'Aluminium' | 'MS'
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
          doc.roof_polygon = Array.isArray(doc.roof_polygon) ? ensureCartesianCoordinates(doc.roof_polygon) : [];
          if (doc.roof_polygon.length >= 3) {
            if (!doc.roof_area_sqm || isNaN(doc.roof_area_sqm) || doc.roof_area_sqm === 0) {
              doc.roof_area_sqm = Math.round(getCartesianPolygonArea(doc.roof_polygon) * 10) / 10;
            }
            if (!doc.usable_area_sqm || isNaN(doc.usable_area_sqm) || doc.usable_area_sqm === 0) {
              const usablePoly = computeSetbackPolygon(doc.roof_polygon, Number(doc.roof?.setback_m || doc.setback_m || 0.5));
              doc.usable_area_sqm = Math.round(getCartesianPolygonArea(usablePoly) * 10) / 10;
            }
          }
          doc.roof_sections = Array.isArray(doc.roof_sections)
            ? doc.roof_sections.map((sec) => ({
                ...sec,
                polygon: Array.isArray(sec.polygon) ? ensureCartesianCoordinates(sec.polygon) : [],
              }))
            : [];
          if (doc.roof_sections.length > 0) {
            setSelectedSectionId(doc.roof_sections[0].id);
          }
          doc.structure_nodes = Array.isArray(doc.structure_nodes) ? doc.structure_nodes : [];
          doc.structure_members = Array.isArray(doc.structure_members) ? doc.structure_members : [];
          doc.saved_views = Array.isArray(doc.saved_views) ? doc.saved_views : [];

          setDesignData(doc);
          if (doc.panels && doc.panels.length > 0) {
            setAutoLayoutBaselinePanels(doc.panels);
          }
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

  // Effective Roof Sections (guarantees backward compatibility with single roof_polygon)
  const effectiveSections = useMemo(() => {
    if (Array.isArray(designData.roof_sections) && designData.roof_sections.length > 0) {
      return designData.roof_sections;
    }
    if (Array.isArray(designData.roof_polygon) && designData.roof_polygon.length >= 3) {
      const surfaceMat = (designData.roof?.surface_material || "").toLowerCase();
      const initialRoofType = surfaceMat.includes("tile") ? "Tile" : surfaceMat.includes("metal") ? "Metal" : "RCC";
      return [
        {
          id: "sec_default",
          name: "Section A",
          polygon: designData.roof_polygon,
          roofType: initialRoofType,
          pitch: Number(designData.roof?.pitch_deg || 0),
          azimuth: Number(designData.roof?.azimuth_deg ?? designData.azimuth_angle ?? 180),
          elevation: Number(designData.roof?.eave_height_m ?? designData.roof?.elevation_m ?? 3.5),
          solarEnabled: true,
          mountingType: designData.structure?.type || (initialRoofType === "Tile" ? "tile_hook_rail" : "elevated"),
          structureEnabled: designData.structure?.show_structure !== false,
          jointType: "same_plane",
          tileConfig: {
            type: "spanish_barrel",
            color: "#b45309",
          },
        },
      ];
    }
    return [];
  }, [
    designData.roof_sections,
    designData.roof_polygon,
    designData.roof?.surface_material,
    designData.roof?.pitch_deg,
    designData.roof?.azimuth_deg,
    designData.roof?.eave_height_m,
    designData.roof?.elevation_m,
    designData.azimuth_angle,
    designData.structure?.type,
    designData.structure?.show_structure,
  ]);

  const hasRoof = Boolean(
    (designData.roof_polygon && designData.roof_polygon.length >= 3) ||
    (effectiveSections && effectiveSections.length > 0)
  );

  // Current active / selected section object
  const activeSection = useMemo(() => {
    if (!effectiveSections || effectiveSections.length === 0) return null;
    if (!selectedSectionId) return effectiveSections[0];
    return effectiveSections.find((s) => s.id === selectedSectionId) || effectiveSections[0];
  }, [effectiveSections, selectedSectionId]);

  // Explicit Section Selector: activates section and opens its inspector settings
  const handleSelectSection = useCallback((secId) => {
    if (secId) {
      setSelectedSectionId(secId);
      setIsSectionSettingsOpen(true);
      setOpenSection(null);
    } else {
      setSelectedSectionId(null);
      setIsSectionSettingsOpen(false);
    }
  }, []);

  // Split section with a line drawn across the polygon
  const handleSplitSection = useCallback((lineStart, lineEnd, targetSectionId = null) => {
    if (!lineStart || !lineEnd) return;
    const sections = effectiveSections;
    if (!sections || sections.length === 0) {
      toast.warning("Draw a roof boundary first before splitting sections.");
      return;
    }

    let target = null;
    let splitResult = null;

    if (targetSectionId) {
      target = sections.find((s) => s.id === targetSectionId);
      if (target) {
        splitResult = splitPolygonWithLine(target.polygon, lineStart, lineEnd);
      }
    }

    if (!splitResult) {
      for (const sec of sections) {
        const res = splitPolygonWithLine(sec.polygon, lineStart, lineEnd);
        if (res) {
          target = sec;
          splitResult = res;
          break;
        }
      }
    }

    if (!splitResult || !target) {
      toast.warning("Section line must cut across the roof boundary edges. Try drawing completely across.");
      return;
    }

    const [poly1, poly2] = splitResult;
    const existingNames = sections.map((s) => s.name || "");
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let nextLetter = "B";
    for (let i = 0; i < alphabet.length; i++) {
      const candidate = `Section ${alphabet[i]}`;
      if (!existingNames.includes(candidate)) {
        nextLetter = alphabet[i];
        break;
      }
    }

    const sec1 = {
      ...target,
      polygon: poly1,
      tileConfig: target.tileConfig ? { ...target.tileConfig } : undefined,
    };

    const sec2 = {
      ...target,
      id: `sec_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name: `Section ${nextLetter}`,
      polygon: poly2,
      solarEnabled: true,
      tileConfig: target.tileConfig ? { ...target.tileConfig } : { type: "spanish_barrel", color: "#b45309" },
      panel_spacing_m: Number(target.panel_spacing_m ?? designData.panel_spacing_m ?? 0.03),
      row_spacing_m: Number(target.row_spacing_m ?? designData.row_spacing_m ?? 0.03),
      setback_m: Number(target.setback_m ?? designData.roof?.setback_m ?? designData.setback_m ?? 0.5),
      orientation: target.orientation || designData.orientation || "portrait",
    };

    const newSections = sections.map((s) => (s.id === target.id ? sec1 : s));
    newSections.push(sec2);

    // Re-associate panels to respective sections based on geometry containment
    const updatedPanels = (designData.panels || []).map((p) => {
      if (p.sectionId === target.id || !p.sectionId) {
        if (isRectInsidePolygon(p.x, p.y, p.width || 1.134, p.height || 2.278, p.rotation || 0, poly2)) {
          return { ...p, sectionId: sec2.id };
        }
        return { ...p, sectionId: sec1.id };
      }
      return p;
    });

    const metrics = recalculateRoofMetrics(
      designData.roof_polygon,
      newSections,
      Number(designData.roof?.setback_m || designData.setback_m || 0.5)
    );

    setDesignData((prev) => ({
      ...prev,
      roof_sections: newSections,
      panels: updatedPanels,
      roof_area_sqm: metrics.roof_area_sqm,
      usable_area_sqm: metrics.usable_area_sqm,
    }));
    setSelectedSectionId(sec2.id);
    toast.success(`Split into ${sec1.name} and ${sec2.name}!`);
  }, [effectiveSections, designData.panels, designData.roof_polygon, designData.roof?.setback_m, designData.setback_m, designData.panel_spacing_m, designData.row_spacing_m, designData.orientation]);

  // Merge two adjacent sections
  const handleMergeSections = useCallback((secIdA, secIdB) => {
    const sections = effectiveSections;
    const secA = sections.find((s) => s.id === secIdA);
    const secB = sections.find((s) => s.id === secIdB);
    if (!secA || !secB) {
      toast.warning("Select two valid sections to merge.");
      return;
    }

    const mergedPoly = mergeTwoAdjacentPolygons(secA.polygon, secB.polygon);
    if (!mergedPoly) {
      toast.warning("Sections do not share a common boundary edge.");
      return;
    }

    const mergedSection = {
      ...secA,
      polygon: mergedPoly,
    };

    const newSections = sections
      .filter((s) => s.id !== secIdA && s.id !== secIdB)
      .concat(mergedSection);

    const updatedPanels = (designData.panels || []).map((p) => {
      if (p.sectionId === secIdA || p.sectionId === secIdB) {
        return { ...p, sectionId: mergedSection.id };
      }
      return p;
    });

    const metrics = recalculateRoofMetrics(
      designData.roof_polygon,
      newSections,
      Number(designData.roof?.setback_m || designData.setback_m || 0.5)
    );

    setDesignData((prev) => ({
      ...prev,
      roof_sections: newSections,
      panels: updatedPanels,
      roof_area_sqm: metrics.roof_area_sqm,
      usable_area_sqm: metrics.usable_area_sqm,
    }));
    setSelectedSectionId(mergedSection.id);
    toast.success(`Merged ${secA.name} and ${secB.name} into ${mergedSection.name}`);
  }, [effectiveSections, designData.panels, designData.roof_polygon, designData.roof?.setback_m, designData.setback_m]);

  // Remove all sections and restore single roof
  const handleRemoveSectioning = useCallback(() => {
    if (!designData.roof_polygon || designData.roof_polygon.length < 3) return;
    if (!window.confirm("Remove all sections and restore single roof?")) return;
    const surfaceMat = (designData.roof?.surface_material || "").toLowerCase();
    const roofType = surfaceMat.includes("tile") ? "Tile" : surfaceMat.includes("metal") ? "Metal" : "RCC";
    const single = {
      id: `sec_${Date.now()}_1`,
      name: "Section A",
      polygon: designData.roof_polygon,
      roofType,
      pitch: Number(designData.roof?.pitch_deg || 0),
      azimuth: Number(designData.roof?.azimuth_deg ?? designData.azimuth_angle ?? 180),
      elevation: Number(designData.roof?.eave_height_m ?? designData.roof?.elevation_m ?? 3.5),
      solarEnabled: true,
      mountingType: designData.structure?.type || (roofType === "Tile" ? "tile_hook_rail" : "elevated"),
      structureEnabled: designData.structure?.show_structure !== false,
      jointType: "same_plane",
      tileConfig: { type: "spanish_barrel", color: "#b45309" },
    };
    const panels = (designData.panels || []).map((p) => ({ ...p, sectionId: single.id }));
    const metrics = recalculateRoofMetrics(
      designData.roof_polygon,
      [single],
      Number(designData.roof?.setback_m || designData.setback_m || 0.5)
    );
    setDesignData((prev) => ({
      ...prev,
      roof_sections: [single],
      panels,
      roof_area_sqm: metrics.roof_area_sqm,
      usable_area_sqm: metrics.usable_area_sqm,
    }));
    setSelectedSectionId(single.id);
    toast.success("Restored single roof — all sections removed.");
  }, [designData]);

  // Update a section's parameters (pitch, azimuth, roofType, solarEnabled, gaps, etc.)
  const handleUpdateSection = useCallback((sectionId, updates) => {
    setDesignData((prev) => {
      const currentSections = (prev.roof_sections && prev.roof_sections.length > 0)
        ? prev.roof_sections
        : effectiveSections;

      const newSections = currentSections.map((s) => {
        if (s.id === sectionId) {
          return {
            ...s,
            ...updates,
            tileConfig: updates.tileConfig ? { ...(s.tileConfig || {}), ...updates.tileConfig } : s.tileConfig,
          };
        }
        return s;
      });

      const defaultSecId = currentSections[0]?.id;
      let panels = prev.panels || [];
      if (updates.solarEnabled === false) {
        panels = panels.filter((p) => {
          const pSecId = p.sectionId || defaultSecId;
          return pSecId !== sectionId;
        });
      }
      if (updates.azimuth != null || updates.pitch != null || updates.tilt_deg != null) {
        panels = panels.map((p) => {
          const pSecId = p.sectionId || defaultSecId;
          if (pSecId === sectionId) {
            return {
              ...p,
              azimuth: updates.azimuth != null ? Number(updates.azimuth) : p.azimuth,
              pitch: updates.pitch != null ? Number(updates.pitch) : p.pitch,
              tilt: updates.tilt_deg != null ? Number(updates.tilt_deg) : p.tilt,
            };
          }
          return p;
        });
      }

      const pCount = panels.filter((p) => !p.hidden).length;
      const pWatt = Number(prev.panel_wattage || 550);
      const totalKw = (pCount * pWatt) / 1000.0;
      const singleArea = (prev.panel_dimensions?.width_m || 1.134) * (prev.panel_dimensions?.length_m || 2.278);
      const coveragePct = prev.usable_area_sqm > 0 ? ((pCount * singleArea) / prev.usable_area_sqm) * 100 : 0;

      return {
        ...prev,
        roof_sections: newSections,
        panels,
        panel_count: pCount,
        system_kw: Math.round(totalKw * 100) / 100,
        coverage_pct: Math.min(100, Math.round(coveragePct * 10) / 10),
      };
    });
  }, [effectiveSections]);

  // Centralized panel update handler with metrics recalculation
  const handleSetPanels = useCallback((panelsOrFn) => {
    setDesignData((prev) => {
      const currentPanels = prev.panels || [];
      const newPanels = typeof panelsOrFn === "function" ? panelsOrFn(currentPanels) : panelsOrFn;
      const pCount = newPanels.filter((p) => !p.hidden).length;
      const pWatt = Number(prev.panel_wattage || 550);
      const totalKw = (pCount * pWatt) / 1000.0;
      const singleArea = (prev.panel_dimensions?.width_m || 1.134) * (prev.panel_dimensions?.length_m || 2.278);
      const coveragePct = prev.usable_area_sqm > 0 ? ((pCount * singleArea) / prev.usable_area_sqm) * 100 : 0;
      return {
        ...prev,
        panels: newPanels,
        panel_count: pCount,
        system_kw: Math.round(totalKw * 100) / 100,
        coverage_pct: Math.min(100, Math.round(coveragePct * 10) / 10),
      };
    });
  }, []);

  // Add a new child section directly inside the roof
  const handleAddSection = useCallback((sectionPolygon) => {
    if (!sectionPolygon || sectionPolygon.length < 3) {
      toast.warning("Section polygon requires at least 3 points.");
      return;
    }

    const baseSections = (Array.isArray(designData.roof_sections) && designData.roof_sections.length > 0)
      ? designData.roof_sections
      : effectiveSections;

    const val = validateSectionPolygon(sectionPolygon, designData.roof_polygon, baseSections);
    if (!val.valid) {
      toast.error(val.error || "Invalid section polygon.");
      return;
    }

    // Sequential naming:
    // If Section A already exists, the next is Section B, Section C, Section D...
    const existingNames = baseSections.map((s) => s.name || "");
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let nextLetter = "A";
    for (let i = 0; i < alphabet.length; i++) {
      const candidate = `Section ${alphabet[i]}`;
      if (!existingNames.includes(candidate)) {
        nextLetter = alphabet[i];
        break;
      }
    }
    if (existingNames.includes(`Section ${nextLetter}`)) {
      nextLetter = `${alphabet[baseSections.length % 26]}${Math.floor(baseSections.length / 26) + 1}`;
    }

    const surfaceMat = (designData.roof?.surface_material || "").toLowerCase();
    const defaultRoofType = surfaceMat.includes("tile") ? "Tile" : surfaceMat.includes("metal") ? "Metal" : "RCC";
    const refSec = baseSections[baseSections.length - 1] || {};

    const newSection = {
      id: `sec_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      name: `Section ${nextLetter}`,
      polygon: sectionPolygon,
      roofType: refSec.roofType || defaultRoofType,
      pitch: Number(refSec.pitch ?? designData.roof?.pitch_deg ?? 0),
      azimuth: Number(refSec.azimuth ?? designData.roof?.azimuth_deg ?? designData.azimuth_angle ?? 180),
      elevation: Number(refSec.elevation ?? designData.roof?.eave_height_m ?? designData.roof?.elevation_m ?? 3.5),
      solarEnabled: true,
      mountingType: refSec.mountingType || designData.structure?.type || "elevated",
      structureEnabled: refSec.structureEnabled !== false,
      jointType: "same_plane",
      tileConfig: refSec.tileConfig ? { ...refSec.tileConfig } : { type: "spanish_barrel", color: "#b45309" },
      tilt_deg: Number(refSec.tilt_deg ?? designData.structure?.tilt_deg ?? designData.tilt_angle ?? 15),
      panel_spacing_m: Number(refSec.panel_spacing_m ?? designData.panel_spacing_m ?? 0.03),
      row_spacing_m: Number(refSec.row_spacing_m ?? designData.row_spacing_m ?? 0.03),
      setback_m: Number(refSec.setback_m ?? designData.roof?.setback_m ?? designData.setback_m ?? 0.5),
      orientation: refSec.orientation || designData.orientation || "portrait",
    };

    setDesignData((prev) => {
      const current = (Array.isArray(prev.roof_sections) && prev.roof_sections.length > 0)
        ? prev.roof_sections
        : effectiveSections;
      const nextSections = [...current, newSection];
      const metrics = recalculateRoofMetrics(
        prev.roof_polygon,
        nextSections,
        Number(prev.roof?.setback_m || prev.setback_m || 0.5)
      );
      return {
        ...prev,
        roof_sections: nextSections,
        roof_area_sqm: metrics.roof_area_sqm,
        usable_area_sqm: metrics.usable_area_sqm,
      };
    });

    setSelectedSectionId(newSection.id);
    setIsSectionSettingsOpen(true);
    setOpenSection(null);
    setActiveTool("select");
    toast.success(`${newSection.name} created.`);
  }, [designData, effectiveSections]);

  // Delete a specific section while preserving parent roof and sibling sections
  const handleDeleteSection = useCallback((sectionId) => {
    if (!sectionId) return;
    const sections = (designData.roof_sections && designData.roof_sections.length > 0)
      ? designData.roof_sections
      : effectiveSections;

    if (sections.length <= 1) {
      toast.warning("Cannot delete the only section. Use 'Remove All' to restore single roof.");
      return;
    }

    const secToDelete = sections.find((s) => s.id === sectionId);
    const secName = secToDelete?.name || "Section";

    setDesignData((prev) => {
      const current = (prev.roof_sections && prev.roof_sections.length > 0)
        ? prev.roof_sections
        : effectiveSections;
      const nextSections = current.filter((s) => s.id !== sectionId);
      const metrics = recalculateRoofMetrics(
        prev.roof_polygon,
        nextSections,
        Number(prev.roof?.setback_m || prev.setback_m || 0.5)
      );

      // Cleanly remove panels belonging strictly to the deleted section
      const defaultSecId = current[0]?.id;
      const remappedPanels = (prev.panels || []).filter((p) => {
        const pSecId = p.sectionId || defaultSecId;
        return pSecId !== sectionId;
      });
      const pCount = remappedPanels.filter((p) => !p.hidden).length;
      const pWatt = Number(prev.panel_wattage || 550);
      const totalKw = (pCount * pWatt) / 1000.0;
      const singleArea = (prev.panel_dimensions?.width_m || 1.134) * (prev.panel_dimensions?.length_m || 2.278);
      const coveragePct = metrics.usable_area_sqm > 0 ? ((pCount * singleArea) / metrics.usable_area_sqm) * 100 : 0;

      return {
        ...prev,
        roof_sections: nextSections,
        panels: remappedPanels,
        panel_count: pCount,
        system_kw: Math.round(totalKw * 100) / 100,
        coverage_pct: Math.min(100, Math.round(coveragePct * 10) / 10),
        roof_area_sqm: metrics.roof_area_sqm,
        usable_area_sqm: metrics.usable_area_sqm,
      };
    });

    const remainingSections = sections.filter((s) => s.id !== sectionId);
    setSelectedSectionId(remainingSections.length > 0 ? remainingSections[0].id : null);
    setActiveTool("select");
    toast.success(`Deleted ${secName}.`);
  }, [designData.roof_sections, effectiveSections]);

  // Generate panels ONLY for a specific section (Preserving all other sections)
  const handleGenerateSectionPanels = useCallback((targetSecId) => {
    const sec = effectiveSections.find((s) => s.id === targetSecId);
    if (!sec) {
      toast.error("Section not found.");
      return;
    }
    if (sec.solarEnabled === false) {
      toast.warning(`Solar PV is disabled on ${sec.name || "this section"}. Enable it first.`);
      return;
    }
    if (!sec.polygon || sec.polygon.length < 3) {
      toast.warning("Section polygon requires at least 3 points.");
      return;
    }

    const secAzimuth = Number(sec.azimuth ?? designData.azimuth_angle ?? 180);
    const secSetback = Number(sec.setback_m ?? sec.setback ?? designData.roof?.setback_m ?? designData.setback_m ?? 0.5);
    const secRowGap = Number(sec.row_spacing_m ?? sec.rowSpacing ?? designData.row_spacing_m ?? 0.03);
    const secPanelGap = Number(sec.panel_spacing_m ?? sec.panelGap ?? designData.panel_spacing_m ?? 0.03);
    const secOrientation = sec.orientation || designData.orientation || "portrait";

    const result = generateAutoPanelLayout({
      roofPolygon: sec.polygon,
      setbackMeters: secSetback,
      obstacles: designData.obstacles || [],
      walkways: (designData.walkways || []).filter((w) => w.type !== "corridor"),
      panelSpecs: {
        make: designData.panel_make,
        model: designData.panel_model,
        wattage: Number(designData.panel_wattage || 550),
        length_m: designData.panel_dimensions?.length_m || 2.278,
        width_m: designData.panel_dimensions?.width_m || 1.134,
      },
      orientation: secOrientation,
      rowSpacingMeters: secRowGap,
      panelSpacingMeters: secPanelGap,
      walkwayEnabled: designData.walkway_enabled ?? true,
      walkwayWidth: Number(designData.walkway_m ?? 0.75),
      walkwayFrequency: designData.walkway_frequency ?? "every_10",
      azimuthDegrees: secAzimuth,
      strategy: "auto",
    });

    const taggedPanels = result.panels.map((p, pIdx) => ({
      ...p,
      id: `sec-${sec.id}-p-${Date.now()}-${pIdx + 1}`,
      sectionId: sec.id,
      pitch: Number(sec.pitch || 0),
      azimuth: secAzimuth,
      tilt: Number(sec.tilt_deg ?? designData.structure?.tilt_deg ?? designData.tilt_angle ?? 15),
    }));

    setDesignData((prev) => {
      const defaultSecId = effectiveSections[0]?.id;
      const otherPanels = (prev.panels || []).filter((p) => {
        const pSecId = p.sectionId || defaultSecId;
        return pSecId !== sec.id;
      });
      const combinedPanels = [...otherPanels, ...taggedPanels];

      const pWatt = Number(prev.panel_wattage || 550);
      const totalKw = (combinedPanels.length * pWatt) / 1000.0;
      const singleArea = (prev.panel_dimensions?.width_m || 1.134) * (prev.panel_dimensions?.length_m || 2.278);
      const coveragePct = prev.usable_area_sqm > 0
        ? Math.min(100, Math.round(((combinedPanels.length * singleArea) / prev.usable_area_sqm) * 1000) / 10)
        : 0;

      return {
        ...prev,
        panels: combinedPanels,
        panel_count: combinedPanels.length,
        system_kw: Math.round(totalKw * 100) / 100,
        coverage_pct: coveragePct,
      };
    });

    toast.success(`Generated ${taggedPanels.length} panels for ${sec.name || "Section"}`);
  }, [effectiveSections, designData]);

  // Clear panels ONLY for a specific section (Preserving all other sections)
  const handleClearSectionPanels = useCallback((targetSecId) => {
    setDesignData((prev) => {
      const defaultSecId = effectiveSections[0]?.id;
      const remainingPanels = (prev.panels || []).filter((p) => {
        const pSecId = p.sectionId || defaultSecId;
        return pSecId !== targetSecId;
      });
      const pWatt = Number(prev.panel_wattage || 550);
      const totalKw = (remainingPanels.length * pWatt) / 1000.0;
      const singleArea = (prev.panel_dimensions?.width_m || 1.134) * (prev.panel_dimensions?.length_m || 2.278);
      const coveragePct = prev.usable_area_sqm > 0
        ? Math.min(100, Math.round(((remainingPanels.length * singleArea) / prev.usable_area_sqm) * 1000) / 10)
        : 0;

      return {
        ...prev,
        panels: remainingPanels,
        panel_count: remainingPanels.length,
        system_kw: Math.round(totalKw * 100) / 100,
        coverage_pct: coveragePct,
      };
    });
    toast.info("Cleared panels for this section.");
  }, [effectiveSections]);

  // Update polygon vertices of a specific section (from edit_section mode)
  const handleUpdateSectionPolygon = useCallback((sectionId, updatedPolygon) => {
    if (!sectionId || !updatedPolygon || updatedPolygon.length < 3) return;
    const currentSections = Array.isArray(designData.roof_sections) && designData.roof_sections.length > 0
      ? designData.roof_sections
      : effectiveSections;

    const val = validateSectionPolygon(updatedPolygon, designData.roof_polygon, currentSections, sectionId);
    if (!val.valid) {
      toast.error(val.error || "Invalid section polygon boundary.");
      return;
    }

    setDesignData((prev) => {
      const current = (prev.roof_sections && prev.roof_sections.length > 0)
        ? prev.roof_sections
        : effectiveSections;
      const updated = current.map((s) => (s.id === sectionId ? { ...s, polygon: updatedPolygon } : s));
      const metrics = recalculateRoofMetrics(
        prev.roof_polygon,
        updated,
        Number(prev.roof?.setback_m || prev.setback_m || 0.5)
      );
      return {
        ...prev,
        roof_sections: updated,
        roof_area_sqm: metrics.roof_area_sqm,
        usable_area_sqm: metrics.usable_area_sqm,
      };
    });
    toast.success("Section boundary updated.");
  }, [designData.roof_polygon, designData.roof_sections, effectiveSections]);

  // Update Roof Polygon and recalculate geometric properties (Preserves existing sections)
  const handleSetRoofPolygon = useCallback((polygon) => {
    if (!polygon || polygon.length < 3) {
      setDesignData((prev) => ({
        ...prev,
        roof_polygon: polygon || [],
        roof_sections: [],
        roof_area_sqm: 0,
        roof_perimeter_m: 0,
        usable_area_sqm: 0,
      }));
      return;
    }

    let validPolygon = polygon;
    if (validPolygon.length > 0 && (validPolygon[0].x === undefined || isNaN(validPolygon[0].x))) {
      // Re-hydrate local cartesian coordinates if loaded from DB
      const origin = validPolygon[0];
      const baseLatRad = toRad(origin.lat);
      validPolygon = validPolygon.map((pt) => {
        const x = (toRad(pt.lng) - toRad(origin.lng)) * Math.cos(baseLatRad) * 6378137;
        const y = (toRad(pt.lat) - toRad(origin.lat)) * 6378137;
        return {
          ...pt,
          x: Math.round(x * 100) / 100,
          y: Math.round(y * 100) / 100,
        };
      });
    }

    const area = getCartesianPolygonArea(validPolygon);
    if (isNaN(area) || area < 0.5) {
      toast.warning("Roof boundary is invalid: corners overlap or area is zero.");
      return;
    }

    const perimeter = getCartesianPolygonPerimeter(validPolygon);
    const bounds = getPolygonBounds(validPolygon);
    const setback = Number(designData.roof?.setback_m || designData.setback_m || 0.5);
    const usablePoly = computeSetbackPolygon(validPolygon, setback);
    const usableArea = Math.round(getCartesianPolygonArea(usablePoly) * 10) / 10;

    const surfaceMat = (designData.roof?.surface_material || "").toLowerCase();
    const initialRoofType = surfaceMat.includes("tile") ? "Tile" : surfaceMat.includes("metal") ? "Metal" : "RCC";
    const initialSection = {
      id: `sec_${Date.now()}_1`,
      name: "Section A",
      polygon: validPolygon,
      roofType: initialRoofType,
      pitch: Number(designData.roof?.pitch_deg || 0),
      azimuth: Number(designData.roof?.azimuth_deg ?? designData.azimuth_angle ?? 180),
      elevation: Number(designData.roof?.eave_height_m ?? designData.roof?.elevation_m ?? 3.5),
      solarEnabled: true,
      mountingType: designData.structure?.type || (initialRoofType === "Tile" ? "tile_hook_rail" : "elevated"),
      structureEnabled: designData.structure?.show_structure !== false,
      jointType: "same_plane",
      tileConfig: { type: "spanish_barrel", color: "#b45309" },
      tilt_deg: Number(designData.structure?.tilt_deg ?? designData.tilt_angle ?? 15),
      panel_spacing_m: Number(designData.panel_spacing_m ?? 0.03),
      row_spacing_m: Number(designData.row_spacing_m ?? 0.03),
      setback_m: Number(designData.roof?.setback_m ?? designData.setback_m ?? 0.5),
      orientation: designData.orientation || "portrait",
    };

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

      // PRESERVE EXISTING SECTIONS: Never wipe multi-section roofs on perimeter edit
      const prevSections = prev.roof_sections;
      let nextSections;
      if (Array.isArray(prevSections) && prevSections.length > 1) {
        nextSections = prevSections;
      } else if (Array.isArray(prevSections) && prevSections.length === 1) {
        nextSections = [{
          ...prevSections[0],
          polygon: validPolygon,
        }];
        setSelectedSectionId(prevSections[0].id);
      } else {
        nextSections = [initialSection];
        setSelectedSectionId(initialSection.id);
      }

      const metrics = recalculateRoofMetrics(validPolygon, nextSections, setback);

      return {
        ...prev,
        roof_polygon: validPolygon,
        roof_sections: nextSections,
        roof_area_sqm: metrics.roof_area_sqm,
        roof_perimeter_m: Math.round(perimeter * 10) / 10,
        roof_dimensions: {
          length_m: Math.round(bounds.length * 10) / 10,
          width_m: Math.round(bounds.width * 10) / 10,
        },
        usable_area_sqm: metrics.usable_area_sqm,
        panels: validPanels,
        panel_count: validPanels.length,
        system_kw: Math.round(totalKw * 100) / 100,
        coverage_pct: coveragePct,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designData.roof?.setback_m, designData.roof?.surface_material, designData.roof?.pitch_deg, designData.roof?.azimuth_deg, designData.roof?.eave_height_m, designData.roof?.elevation_m, designData.setback_m, designData.azimuth_angle, designData.structure?.type, designData.structure?.show_structure]);

  // Trigger Automatic Panel Layout with live recalculation support (Per-Section Aware)
  const handleAutoLayout = useCallback((customStrategy = "auto", customPolygon = null, customOverrides = {}, bypassConfirm = false) => {
    if (!bypassConfirm && hasManualAdjustments) {
      if (!window.confirm("Regenerate layout? Manual panel adjustments will be removed.")) {
        return;
      }
    }

    const sections = effectiveSections;
    const hasMultipleSections = sections && sections.length > 1;

    const setback = Number(customOverrides.setback_m ?? designData.roof?.setback_m ?? designData.setback_m ?? 0.5);
    const rowGap = Number(customOverrides.row_spacing_m ?? designData.row_spacing_m ?? 0.03);
    const panelGap = Number(customOverrides.panel_spacing_m ?? designData.panel_spacing_m ?? 0.03);
    const orientation = customOverrides.orientation ?? designData.orientation ?? "portrait";
    const walkwayWidth = Number(customOverrides.walkway_m ?? designData.walkway_m ?? 0.75);
    const walkwayEnabled = customOverrides.walkway_enabled ?? designData.walkway_enabled ?? true;
    const walkwayFreq = customOverrides.walkway_frequency ?? designData.walkway_frequency ?? "every_10";

    if (hasMultipleSections) {
      let allPanels = [];
      let totalUsableArea = 0;
      let generatedWalkways = [];

      sections.forEach((sec, sIdx) => {
        if (sec.solarEnabled === false) return;
        const secPoly = sec.polygon;
        if (!secPoly || secPoly.length < 3) return;

        const secAzimuth = Number(sec.azimuth ?? designData.azimuth_angle ?? 180);
        const secSetback = Number(sec.setback_m ?? sec.setback ?? setback);
        const secRowGap = Number(sec.row_spacing_m ?? sec.rowSpacing ?? rowGap);
        const secPanelGap = Number(sec.panel_spacing_m ?? sec.panelGap ?? panelGap);
        const secOrientation = sec.orientation || orientation;

        const result = generateAutoPanelLayout({
          roofPolygon: secPoly,
          setbackMeters: secSetback,
          obstacles: designData.obstacles || [],
          walkways: (designData.walkways || []).filter((w) => w.type !== "corridor"),
          panelSpecs: {
            make: designData.panel_make,
            model: designData.panel_model,
            wattage: Number(designData.panel_wattage || 550),
            length_m: designData.panel_dimensions?.length_m || 2.278,
            width_m: designData.panel_dimensions?.width_m || 1.134,
          },
          orientation: secOrientation,
          rowSpacingMeters: secRowGap,
          panelSpacingMeters: secPanelGap,
          walkwayEnabled,
          walkwayWidth,
          walkwayFrequency: walkwayFreq,
          azimuthDegrees: secAzimuth,
          strategy: customStrategy,
        });

        const taggedPanels = result.panels.map((p, pIdx) => ({
          ...p,
          id: `sec-${sec.id}-p-${pIdx + 1}`,
          sectionId: sec.id,
          pitch: Number(sec.pitch || 0),
          azimuth: secAzimuth,
        }));

        allPanels.push(...taggedPanels);
        totalUsableArea += result.usableAreaSqm;
        if (result.generatedWalkways) {
          generatedWalkways.push(...result.generatedWalkways);
        }
      });

      const metrics = recalculateRoofMetrics(
        designData.roof_polygon,
        sections,
        setback
      );
      const guaranteedRoofArea = metrics.roof_area_sqm;
      const guaranteedUsableArea = metrics.usable_area_sqm;

      const pWatt = Number(designData.panel_wattage || 550);
      const totalKw = (allPanels.length * pWatt) / 1000.0;
      const singleArea = (designData.panel_dimensions?.width_m || 1.134) * (designData.panel_dimensions?.length_m || 2.278);
      const coveragePct = guaranteedUsableArea > 0 ? Math.min(100, Math.round(((allPanels.length * singleArea) / guaranteedUsableArea) * 1000) / 10) : 0;

      setAutoLayoutBaselinePanels(allPanels);
      setHasManualAdjustments(false);
      setSelectedPanelId(null);
      setSelectedRowIndex(null);

      setDesignData((prev) => ({
        ...prev,
        panels: allPanels,
        panel_count: allPanels.length,
        system_kw: Math.round(totalKw * 100) / 100,
        roof_area_sqm: guaranteedRoofArea,
        usable_area_sqm: guaranteedUsableArea,
        coverage_pct: coveragePct,
        walkways: [
          ...(prev.walkways || []).filter((w) => w.type !== "corridor"),
          ...generatedWalkways,
        ],
        ...customOverrides,
      }));

      toast.success(`Generated multi-section layout: ${allPanels.length} panels (${totalKw.toFixed(2)} kWp)`);
      return;
    }

    const polygon = customPolygon || designData.roof_polygon;
    if (!polygon || polygon.length < 3) {
      toast.warning("Please draw a roof boundary on the map first.");
      setOpenSection("roof");
      setActiveTool("draw_roof");
      return;
    }

    const result = generateAutoPanelLayout({
      roofPolygon: polygon,
      setbackMeters: setback,
      obstacles: designData.obstacles || [],
      walkways: (designData.walkways || []).filter((w) => w.type !== "corridor"),
      panelSpecs: {
        make: designData.panel_make,
        model: designData.panel_model,
        wattage: Number(designData.panel_wattage || 550),
        length_m: designData.panel_dimensions?.length_m || 2.278,
        width_m: designData.panel_dimensions?.width_m || 1.134,
      },
      orientation,
      rowSpacingMeters: rowGap,
      panelSpacingMeters: panelGap,
      walkwayEnabled,
      walkwayWidth,
      walkwayFrequency: walkwayFreq,
      azimuthDegrees: Number(designData.azimuth_angle || 180),
      strategy: customStrategy,
    });

    const defaultSecId = effectiveSections[0]?.id || "sec_default";
    const taggedPanels = result.panels.map((p) => ({
      ...p,
      sectionId: defaultSecId,
    }));

    setAutoLayoutBaselinePanels(taggedPanels);
    setHasManualAdjustments(false);
    setSelectedPanelId(null);
    setSelectedRowIndex(null);

    setDesignData((prev) => ({
      ...prev,
      panels: taggedPanels,
      panel_count: taggedPanels.length,
      system_kw: result.totalKw,
      usable_area_sqm: result.usableAreaSqm,
      coverage_pct: result.coveragePct,
      walkways: [
        ...(prev.walkways || []).filter((w) => w.type !== "corridor"),
        ...(result.generatedWalkways || []),
      ],
      ...customOverrides,
    }));

    toast.success(`Generated layout: ${result.panelCount} panels (${result.totalKw.toFixed(2)} kWp)`);
  }, [designData, effectiveSections, hasManualAdjustments]);

  // Live Layout Parameter Adjustment Handler
  const handleLayoutParamChange = useCallback((field, value) => {
    setDesignData((prev) => {
      const updated = { ...prev, [field]: value };
      if (field === "setback_m") {
        updated.roof = { ...prev.roof, setback_m: value };
      }
      return updated;
    });

    if (designData.roof_polygon && designData.roof_polygon.length >= 3) {
      handleAutoLayout("auto", null, { [field]: value });
    }
  }, [designData.roof_polygon, handleAutoLayout]);

  // Reset to Solarix Canonical Defaults
  const handleResetLayoutDefaults = useCallback(() => {
    const canonicalDefaults = {
      panel_spacing_m: 0.03,
      row_spacing_m: 0.03,
      setback_m: 0.5,
      walkway_m: 0.75,
      walkway_enabled: true,
      walkway_frequency: "every_10",
      orientation: "portrait",
    };

    setDesignData((prev) => ({
      ...prev,
      ...canonicalDefaults,
      roof: {
        ...prev.roof,
        setback_m: 0.5,
      },
    }));

    if (designData.roof_polygon && designData.roof_polygon.length >= 3) {
      handleAutoLayout("auto", null, canonicalDefaults);
    }
    toast.success("Restored layout defaults (0.03m gaps, 0.5m setback, 750mm walkway)");
  }, [designData.roof_polygon, handleAutoLayout]);

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
      handleAutoLayout("auto", templatePolygon);
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

  // Manual Increase Panel Count (Section-Aware)
  const handleIncreasePanelCount = () => {
    const targetSection = activeSection || (effectiveSections && effectiveSections[0]);
    const targetPolygon = targetSection?.polygon || designData.roof_polygon;

    if (!targetPolygon || targetPolygon.length < 3) {
      toast.warning("Please draw a roof boundary first.");
      return;
    }

    if (targetSection && targetSection.solarEnabled === false) {
      toast.warning(`Solar is disabled on ${targetSection.name || "selected section"}.`);
      return;
    }

    const targetAzimuth = Number(targetSection?.azimuth ?? designData.azimuth_angle ?? 180);

    const targetSetback = Number(targetSection?.setback_m ?? targetSection?.setback ?? designData.roof?.setback_m ?? designData.setback_m ?? 0.5);
    const targetRowGap = Number(targetSection?.row_spacing_m ?? targetSection?.rowSpacing ?? designData.row_spacing_m ?? 0.03);
    const targetPanelGap = Number(targetSection?.panel_spacing_m ?? targetSection?.panelGap ?? designData.panel_spacing_m ?? 0.03);
    const targetOrientation = targetSection?.orientation || designData.orientation || "portrait";

    const check = canFitAdditionalPanel({
      panels: designData.panels,
      roofPolygon: targetPolygon,
      setbackMeters: targetSetback,
      obstacles: designData.obstacles,
      walkways: designData.walkways,
      panelSpecs: {
        wattage: designData.panel_wattage,
        length_m: designData.panel_dimensions?.length_m || 2.278,
        width_m: designData.panel_dimensions?.width_m || 1.134,
      },
      orientation: targetOrientation,
      rowSpacingMeters: targetRowGap,
      panelSpacingMeters: targetPanelGap,
      azimuthDegrees: targetAzimuth,
    });

    if (!check.canFit || !check.newPanel) {
      toast.warning(check.reason || "No valid panel position remains in this section.");
      return;
    }

    const taggedPanel = {
      ...check.newPanel,
      id: targetSection ? `p-${targetSection.id}-${Date.now()}` : check.newPanel.id,
      sectionId: targetSection ? targetSection.id : undefined,
      azimuth: targetAzimuth,
      pitch: Number(targetSection?.pitch ?? 0),
    };

    const updatedPanels = [...designData.panels, taggedPanel];
    const pWatt = Number(designData.panel_wattage || 550);
    const totalKw = (updatedPanels.length * pWatt) / 1000.0;
    const totalPanelArea = updatedPanels.length * taggedPanel.width * taggedPanel.height;
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

    toast.success(`Added panel #${updatedPanels.length}${targetSection ? ` in ${targetSection.name}` : ""}`);
  };

  // Manual Decrease Panel Count (Section-Aware)
  const handleDecreasePanelCount = () => {
    if (!designData.panels || designData.panels.length === 0) return;

    let updatedPanels;
    if (selectedPanelId) {
      updatedPanels = designData.panels.filter((p) => p.id !== selectedPanelId);
      setSelectedPanelId(null);
    } else {
      const targetSecId = activeSection?.id;
      const lastInSecIdx = targetSecId
        ? designData.panels.map((p, idx) => (p.sectionId === targetSecId ? idx : -1)).filter((idx) => idx !== -1).pop()
        : undefined;

      if (lastInSecIdx !== undefined) {
        updatedPanels = designData.panels.filter((_, idx) => idx !== lastInSecIdx);
      } else {
        updatedPanels = designData.panels.slice(0, -1);
      }
    }

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

  // Regenerate Mounting Structure cleanly across all sections
  const handleRegenerateStructure = useCallback(() => {
    if (viewer3dRef.current?.regenerateStructure) {
      viewer3dRef.current.regenerateStructure();
      toast.success("Mounting structure regenerated from current panel layout.");
    } else {
      toast.info("Switch to 3D View to inspect regenerated structure.");
    }
  }, []);

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
                    setIsSectionSettingsOpen(false);
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
          2B. PERSISTENT FIXED SECTION / CONTEXT BAR (ALWAYS VISIBLE WHEN ROOF EXISTS)
      ────────────────────────────────────────────────────────────────────────── */}
      {hasRoof && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 bg-slate-900/95 border border-slate-800 px-3.5 py-1.5 rounded-2xl shadow-md shrink-0">
          <div className="flex items-center gap-2 overflow-x-auto py-0.5 no-scrollbar">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 shrink-0 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span>Sections:</span>
            </span>

            {effectiveSections.map((sec) => {
              const isSelected = (selectedSectionId || effectiveSections[0]?.id) === sec.id;
              return (
                <button
                  key={sec.id}
                  onClick={() => {
                    handleSelectSection(sec.id);
                  }}
                  className={`px-3 py-1 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                    isSelected
                      ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-950/50 ring-1 ring-cyan-300"
                      : "bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700/80 border border-slate-700/60"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${isSelected ? "bg-slate-950" : "bg-cyan-400"}`} />
                  <span>{sec.name}</span>
                  <span className={`text-[10px] ${isSelected ? "text-slate-900" : "text-slate-400"}`}>
                    ({sec.tilt_deg ?? designData.structure?.tilt_deg ?? designData.tilt_angle ?? 15}°)
                  </span>
                </button>
              );
            })}

            {/* Explicit Section Settings Toggle */}
            <button
              type="button"
              onClick={() => {
                setIsSectionSettingsOpen((prev) => !prev);
                setOpenSection(null);
              }}
              className={`h-7 px-3 text-xs rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                isSectionSettingsOpen && !openSection
                  ? "bg-cyan-600 text-white shadow-md ring-1 ring-cyan-300 border-cyan-500"
                  : "text-cyan-400 hover:text-white bg-cyan-950/40 hover:bg-cyan-900/60 border-cyan-600/40"
              }`}
              title={`Edit Settings for ${activeSection?.name || "Active Section"}`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Section Settings</span>
            </button>

            {/* + Add Section Button: ALWAYS VISIBLE */}
            <button
              onClick={() => {
                if (activeTab === "3d") setActiveTab("2d");
                setActiveTool("draw_section");
                toast.info("Click corners on 2D map to trace new section polygon, then click Finish.");
              }}
              className={`h-7 px-3 text-xs rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                activeTool === "draw_section"
                  ? "bg-emerald-600 text-white shadow-md ring-1 ring-emerald-300 border-emerald-500"
                  : "text-emerald-400 hover:text-white bg-emerald-950/40 hover:bg-emerald-900/60 border-emerald-600/40"
              }`}
              title="Add child roof section"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Section</span>
            </button>

            {/* Split Section Button */}
            <button
              onClick={() => {
                if (activeTab === "3d") setActiveTab("2d");
                const nextTool = activeTool === "add_section_line" ? "select" : "add_section_line";
                setActiveTool(nextTool);
                toast.info("Click 2 points across the roof on map to split it.");
              }}
              className={`h-7 px-3 text-xs rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                activeTool === "add_section_line"
                  ? "bg-cyan-600 text-white shadow-md ring-1 ring-cyan-300 border-cyan-500"
                  : "text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 border-slate-700/60"
              }`}
              title="Split section with a line cut"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>Split Section</span>
            </button>

            {/* Merge Sections Button (when >= 2 sections) */}
            {effectiveSections.length >= 2 && (
              <button
                onClick={() => {
                  if (selectedSectionId) {
                    const other = effectiveSections.find((s) => s.id !== selectedSectionId);
                    if (other) {
                      handleMergeSections(selectedSectionId, other.id);
                    }
                  } else {
                    toast.info("Select a section first, then click Merge to combine with adjacent section.");
                  }
                }}
                className="h-7 px-2.5 text-xs rounded-xl font-semibold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 flex items-center gap-1 transition cursor-pointer"
                title="Merge selected section with adjacent section"
              >
                <Layers className="w-3.5 h-3.5 text-purple-400" />
                <span>Merge</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Explicit Micro Adjust Launcher */}
            {designData.panels && designData.panels.length > 0 && (
              <button
                type="button"
                onClick={() => setShowMicroAdjust((prev) => !prev)}
                className={`h-7 px-3 text-xs rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                  showMicroAdjust
                    ? "bg-amber-500 text-slate-950 shadow-md ring-1 ring-amber-300 border-amber-400"
                    : "text-amber-400 hover:text-white bg-amber-950/40 hover:bg-amber-900/60 border-amber-600/40"
                }`}
                title="Toggle manual panel/row/array micro-adjustment controls"
              >
                <Move className="w-3.5 h-3.5" />
                <span>Micro Adjust</span>
              </button>
            )}

            {/* Active Tool Guidance & Done Button */}
            {activeTool !== "select" && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-amber-300 font-semibold animate-pulse">
                  Active: {activeTool === "draw_section" ? "Drawing Section" : activeTool === "add_section_line" ? "Splitting Section" : activeTool}
                </span>
                <button
                  onClick={() => {
                    setActiveTool("select");
                  }}
                  className="h-6 px-2.5 text-[11px] font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1 cursor-pointer shadow-sm"
                >
                  <Check className="w-3 h-3" />
                  <span>Done</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          2C. FIXED MICRO CONTROL BAR (PANEL / ROW / ARRAY SELECTION & MICRO-MOVE)
      ────────────────────────────────────────────────────────────────────────── */}
      {showMicroAdjust && designData.panels && designData.panels.length > 0 && (
        <LayoutMicroAdjuster
          variant="fixed-bar"
          panels={designData.panels}
          setPanels={handleSetPanels}
          roofPolygon={designData.roof_polygon}
          setbackMeters={Number(designData.roof?.setback_m || designData.setback_m || 0.5)}
          obstacles={designData.obstacles}
          walkways={designData.walkways}
          panelSpecs={{
            length_m: designData.panel_dimensions?.length_m || 2.278,
            width_m: designData.panel_dimensions?.width_m || 1.134,
            wattage: designData.panel_wattage || 550,
          }}
          orientation={designData.orientation}
          selectionMode={selectionMode}
          setSelectionMode={setSelectionMode}
          selectedPanelId={selectedPanelId}
          setSelectedPanelId={setSelectedPanelId}
          selectedRowIndex={selectedRowIndex}
          setSelectedRowIndex={setSelectedRowIndex}
          autoLayoutBaselinePanels={autoLayoutBaselinePanels}
          hasManualAdjustments={hasManualAdjustments}
          setHasManualAdjustments={setHasManualAdjustments}
        />
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          3. MAIN WORKSPACE (MAP DOMINANT ~80% + RIGHT INFO PANEL ~20%)
      ────────────────────────────────────────────────────────────────────────── */}
      <div className={`grid grid-cols-1 xl:grid-cols-12 lg:grid-cols-12 gap-2.5 flex-1 min-h-0 ${isFullscreen ? "h-full" : ""}`}>
        {/* CENTER / DOMINANT WORKSPACE (9 cols on xl = 75% width, 8 cols on lg = ~67%) */}
        <div className="xl:col-span-9 lg:col-span-8 flex flex-col relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 shadow-2xl min-h-[580px] h-full">
          <div className="flex flex-row flex-1 min-h-0 w-full h-full relative overflow-hidden">
            {/* FIXED SECTION CONTROL DRAWER (Left fixed side panel) */}
            {openSection && (
              <div
                className="w-80 shrink-0 border-r border-slate-800 bg-slate-900/98 flex flex-col h-full overflow-y-auto z-20 shadow-2xl p-3.5 text-white space-y-3 animate-in fade-in slide-in-from-left-2 duration-150"
                style={{ pointerEvents: "auto" }}
              >
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
                <div className="space-y-3 text-xs">
                  {/* Boundary & Points Actions */}
                  {(!designData.roof_polygon || designData.roof_polygon.length < 3) ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        if (activeTab !== "2d") setActiveTab("2d");
                        setActiveTool(activeTool === "draw_roof" ? "select" : "draw_roof");
                      }}
                      className={`w-full h-8 text-xs font-bold rounded-lg gap-1.5 ${
                        activeTool === "draw_roof"
                          ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                          : "bg-emerald-950/70 text-emerald-300 border border-emerald-700/60 hover:bg-emerald-900"
                      }`}
                    >
                      <PenTool className="w-3.5 h-3.5" />
                      {activeTool === "draw_roof" ? "Marking Boundary..." : "Mark Roof Boundary"}
                    </Button>
                  ) : (
                    <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950/80 border border-slate-800">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span className="text-xs font-bold text-white">Roof Perimeter</span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {Math.round(designData.roof_area_sqm || 0)} m²
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          onClick={() => {
                            if (activeTab !== "2d") setActiveTab("2d");
                            setActiveTool(activeTool === "edit_roof" ? "select" : "edit_roof");
                          }}
                          className={`h-6 text-[10.5px] font-bold rounded-lg gap-1 px-2 ${
                            activeTool === "edit_roof"
                              ? "bg-amber-500 text-slate-950"
                              : "bg-amber-950/60 text-amber-300 border border-amber-700/60 hover:bg-amber-900"
                          }`}
                          title="Drag perimeter boundary vertices"
                        >
                          <Edit3 className="w-3 h-3" />
                          {activeTool === "edit_roof" ? "Editing..." : "Edit Points"}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            if (window.confirm("Re-mark roof boundary? This will trace a new perimeter.")) {
                              if (activeTab !== "2d") setActiveTab("2d");
                              setActiveTool("draw_roof");
                            }
                          }}
                          variant="ghost"
                          className="h-6 text-[10px] text-slate-400 hover:text-white px-1.5"
                          title="Re-draw parent roof boundary"
                        >
                          Re-trace
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Section Tools: + Add Section, Split & Merge */}
                  {designData.roof_polygon?.length >= 3 && (
                    <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-bold text-slate-200 text-[11px]">
                          <Scissors className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Roof Sections & Planes</span>
                        </div>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-slate-700 text-cyan-400">
                          Existing Sections: {effectiveSections.length}
                        </Badge>
                      </div>

                      {/* Section Tabs / Switcher */}
                      <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar">
                        {effectiveSections.map((sec) => {
                          const isSelected = sec.id === (activeSection?.id || effectiveSections[0]?.id);
                          return (
                            <button
                              key={sec.id}
                              onClick={() => setSelectedSectionId(sec.id)}
                              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 transition ${
                                isSelected
                                  ? "bg-cyan-500 text-slate-950 shadow-sm"
                                  : "bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800"
                              }`}
                            >
                              <span>{sec.name || "Section"}</span>
                              <span className={`text-[9px] px-1 rounded ${isSelected ? "bg-cyan-600/30 text-slate-950 font-mono" : "text-slate-500 font-mono"}`}>
                                {sec.pitch ?? 0}°
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Section Tool Actions */}
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <Button
                          size="sm"
                          onClick={() => {
                            if (activeTab !== "2d") setActiveTab("2d");
                            setActiveTool(activeTool === "draw_section" ? "select" : "draw_section");
                          }}
                          className={`flex-1 h-6 text-[10.5px] font-bold rounded-lg gap-1 ${
                            activeTool === "draw_section"
                              ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                              : "bg-emerald-950/70 text-emerald-300 border border-emerald-700/60 hover:bg-emerald-900"
                          }`}
                          title="Draw a new child section polygon inside the roof"
                        >
                          <Plus className="w-3 h-3" />
                          {activeTool === "draw_section" ? "Drawing..." : "+ Add Section"}
                        </Button>

                        <Button
                          size="sm"
                          onClick={() => {
                            if (activeTab !== "2d") setActiveTab("2d");
                            setActiveTool(activeTool === "add_section_line" ? "select" : "add_section_line");
                          }}
                          className={`h-6 text-[10.5px] font-bold rounded-lg gap-1 px-2 ${
                            activeTool === "add_section_line"
                              ? "bg-cyan-600 hover:bg-cyan-700 text-white"
                              : "bg-cyan-950/60 text-cyan-300 border border-cyan-700/60 hover:bg-cyan-900"
                          }`}
                          title="Split roof with a cut line"
                        >
                          <Scissors className="w-3 h-3" />
                          Split
                        </Button>

                        {effectiveSections.length > 1 && (
                          <Button
                            size="sm"
                            onClick={() => {
                              if (activeTab !== "2d") setActiveTab("2d");
                              setActiveTool(activeTool === "merge_section" ? "select" : "merge_section");
                            }}
                            variant="outline"
                            className={`h-6 text-[10.5px] font-bold rounded-lg gap-1 px-2 ${
                              activeTool === "merge_section"
                                ? "bg-purple-600 hover:bg-purple-700 text-white border-purple-500"
                                : "bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700"
                            }`}
                            title="Click 2 adjacent sections on map to merge"
                          >
                            {activeTool === "merge_section" ? "Click 2..." : "Merge"}
                          </Button>
                        )}

                        {effectiveSections.length > 1 && (
                          <Button
                            size="sm"
                            onClick={handleRemoveSectioning}
                            variant="outline"
                            className="h-6 text-[10.5px] font-bold rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 gap-1 px-2"
                            title="Remove all sections and restore single roof"
                          >
                            <Trash2 className="w-3 h-3" />
                            Remove All
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ACTIVE SECTION LAUNCHER */}
                  {activeSection && (
                    <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between text-xs">
                      <div>
                        <div className="text-[10px] uppercase font-bold text-slate-400">Selected Section</div>
                        <div className="font-bold text-cyan-400 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-cyan-400" />
                          <span>{activeSection.name || "Section"}</span>
                          <span className="text-[10px] text-slate-400 font-mono font-normal">
                            ({activeSection.polygon?.length >= 3 ? `${Math.round(getCartesianPolygonArea(activeSection.polygon))} m²` : "0 m²"})
                          </span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleSelectSection(activeSection.id)}
                        className="h-6 text-[10.5px] font-bold bg-cyan-600 hover:bg-cyan-500 text-slate-950 rounded-lg gap-1 px-2.5 cursor-pointer shadow-sm"
                      >
                        <Sliders className="w-3 h-3" />
                        Open Settings
                      </Button>
                    </div>
                  )}

                  {/* Setback & Area Metrics */}
                  <div className="grid grid-cols-2 gap-2">
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
                    <div>
                      <Label className="text-[10px] font-semibold text-slate-400">Total Roof Area</Label>
                      <div className="h-7 mt-0.5 px-2 flex items-center bg-slate-900 border border-slate-800 rounded-md font-mono text-emerald-400 font-bold text-xs">
                        {designData.roof_area_sqm || 0} m²
                      </div>
                    </div>
                  </div>
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
                          <SelectItem value="elevated">Elevated Tilt</SelectItem>
                          <SelectItem value="flush">Flush Mount</SelectItem>
                          <SelectItem value="fixed_tilt">Fixed Tilt</SelectItem>
                          <SelectItem value="east_west">East-West (Dual Tilt)</SelectItem>
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

                  <div>
                    <Label className="text-[10px] font-semibold text-slate-400">Structure Material</Label>
                    <Select
                      value={designData.structure?.material || "GI"}
                      onValueChange={(val) => {
                        setDesignData((prev) => ({
                          ...prev,
                          structure: {
                            ...prev.structure,
                            material: val,
                          },
                        }));
                      }}
                    >
                      <SelectTrigger className="h-7 text-xs mt-0.5 bg-slate-800 border-slate-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-800 text-white">
                        <SelectItem value="GI">GI (Hot-Dip Galvanized Iron)</SelectItem>
                        <SelectItem value="Aluminium">Aluminium (Anodized Al 6063-T6)</SelectItem>
                        <SelectItem value="MS">MS (Mild Steel Powder-Coated)</SelectItem>
                      </SelectContent>
                    </Select>
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

                  {/* Spacing & Setback Controls */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="bg-slate-950/80 p-2 rounded-xl border border-slate-800 space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] font-semibold text-slate-400">Panel Gap</Label>
                        <span className="text-[9.5px] font-mono text-amber-300 font-bold">{Number(designData.panel_spacing_m ?? 0.03).toFixed(2)}m</span>
                      </div>
                      <Input
                        id="layout-panel-gap-input"
                        type="number"
                        step="0.01"
                        min="0.01"
                        max="1.0"
                        value={designData.panel_spacing_m ?? 0.03}
                        onChange={(e) => {
                          const gap = Math.max(0.01, parseFloat(e.target.value) || 0.03);
                          handleLayoutParamChange("panel_spacing_m", gap);
                        }}
                        className="h-7 text-xs font-bold bg-slate-800 border-slate-700 text-white"
                        placeholder="0.03"
                      />
                    </div>

                    <div className="bg-slate-950/80 p-2 rounded-xl border border-slate-800 space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] font-semibold text-slate-400">Row Gap</Label>
                        <span className="text-[9.5px] font-mono text-amber-300 font-bold">{Number(designData.row_spacing_m ?? 0.03).toFixed(2)}m</span>
                      </div>
                      <Input
                        id="layout-row-gap-input"
                        type="number"
                        step="0.01"
                        min="0.01"
                        max="2.0"
                        value={designData.row_spacing_m ?? 0.03}
                        onChange={(e) => {
                          const gap = Math.max(0.01, parseFloat(e.target.value) || 0.03);
                          handleLayoutParamChange("row_spacing_m", gap);
                        }}
                        className="h-7 text-xs font-bold bg-slate-800 border-slate-700 text-white"
                        placeholder="0.03"
                      />
                    </div>
                  </div>

                  {/* Setback & Orientation */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="bg-slate-950/80 p-2 rounded-xl border border-slate-800 space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] font-semibold text-slate-400">Edge Setback</Label>
                        <span className="text-[9.5px] font-mono text-cyan-300 font-bold">{Number(designData.roof?.setback_m ?? designData.setback_m ?? 0.5).toFixed(2)}m</span>
                      </div>
                      <Input
                        id="layout-setback-input"
                        type="number"
                        step="0.05"
                        min="0.0"
                        max="3.0"
                        value={designData.roof?.setback_m ?? designData.setback_m ?? 0.5}
                        onChange={(e) => {
                          const sb = Math.max(0, parseFloat(e.target.value) || 0);
                          handleLayoutParamChange("setback_m", sb);
                        }}
                        className="h-7 text-xs font-bold bg-slate-800 border-slate-700 text-white"
                        placeholder="0.5"
                      />
                    </div>

                    <div className="bg-slate-950/80 p-2 rounded-xl border border-slate-800 space-y-1">
                      <Label className="text-[10px] font-semibold text-slate-400">Orientation</Label>
                      <Select
                        value={designData.orientation || "portrait"}
                        onValueChange={(val) => handleLayoutParamChange("orientation", val)}
                      >
                        <SelectTrigger className="h-7 text-xs bg-slate-800 border-slate-700 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-800 text-white">
                          <SelectItem value="portrait">Portrait</SelectItem>
                          <SelectItem value="landscape">Landscape</SelectItem>
                          <SelectItem value="auto">Auto-Fit</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Walkway Corridor Configuration (CEA 750mm Standard) */}
                  <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[10px] font-bold text-slate-200">Walkway Corridor</div>
                        <div className="text-[9px] text-slate-400">CEA 750mm Rooftop Safety Keepout</div>
                      </div>
                      <Switch
                        id="layout-walkway-switch"
                        checked={Boolean(designData.walkway_enabled ?? true)}
                        onCheckedChange={(checked) => handleLayoutParamChange("walkway_enabled", checked)}
                      />
                    </div>

                    {Boolean(designData.walkway_enabled ?? true) && (
                      <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-slate-800/80">
                        <div>
                          <Label className="text-[9.5px] font-semibold text-slate-400">Width (m)</Label>
                          <Input
                            id="layout-walkway-width-input"
                            type="number"
                            step="0.05"
                            min="0.3"
                            max="2.5"
                            value={designData.walkway_m ?? 0.75}
                            onChange={(e) => {
                              const w = Math.max(0.3, parseFloat(e.target.value) || 0.75);
                              handleLayoutParamChange("walkway_m", w);
                            }}
                            className="h-7 text-xs font-bold mt-0.5 bg-slate-800 border-slate-700 text-white"
                          />
                        </div>

                        <div>
                          <Label className="text-[9.5px] font-semibold text-slate-400">Frequency</Label>
                          <Select
                            value={designData.walkway_frequency || "every_10"}
                            onValueChange={(val) => handleLayoutParamChange("walkway_frequency", val)}
                          >
                            <SelectTrigger id="layout-walkway-freq-select" className="h-7 text-xs mt-0.5 bg-slate-800 border-slate-700 text-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800 text-white">
                              <SelectItem value="none">None</SelectItem>
                              <SelectItem value="every_5">Every 5 rows</SelectItem>
                              <SelectItem value="every_10">Every 10 rows</SelectItem>
                              <SelectItem value="every_15">Every 15 rows</SelectItem>
                              <SelectItem value="every_20">Every 20 rows</SelectItem>
                              <SelectItem value="custom">Custom (8 rows)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons: Add Panel, Reset to Default, Clear */}
                  <div className="grid grid-cols-3 gap-1.5">
                    <Button
                      size="sm"
                      onClick={handleIncreasePanelCount}
                      className="h-7 text-[11px] font-semibold rounded-lg bg-amber-950/60 border border-amber-700/60 text-amber-300 hover:bg-amber-900 shadow-sm"
                      title="Add panel in nearest valid roof position"
                    >
                      <PlusCircle className="w-3 h-3 mr-1" /> + Panel
                    </Button>
                    <Button
                      id="layout-reset-defaults-btn"
                      size="sm"
                      variant="outline"
                      onClick={handleResetLayoutDefaults}
                      className="h-7 text-[11px] font-semibold text-blue-300 hover:text-white border-blue-800/80 bg-blue-950/50 hover:bg-blue-900/70 rounded-lg"
                      title="Restore canonical Solarix defaults (0.03m gaps, 0.5m setback, 750mm walkway)"
                    >
                      <RefreshCw className="w-3 h-3 mr-1" /> Defaults
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setDesignData((prev) => ({ ...prev, panels: [], panel_count: 0, system_kw: 0, coverage_pct: 0 }));
                        toast.success("Panel layout cleared");
                      }}
                      className="h-7 text-[11px] text-slate-300 hover:text-red-400 border-slate-700 bg-slate-800 hover:bg-slate-700 rounded-lg"
                    >
                      <Undo2 className="w-3 h-3 mr-1" /> Clear
                    </Button>
                  </div>

                  {hasManualAdjustments && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (autoLayoutBaselinePanels && autoLayoutBaselinePanels.length > 0) {
                          const pWatt = Number(designData.panel_wattage || 550);
                          const totalKw = (autoLayoutBaselinePanels.length * pWatt) / 1000.0;
                          const singleArea = (designData.panel_dimensions?.width_m || 1.134) * (designData.panel_dimensions?.length_m || 2.278);
                          const coveragePct = designData.usable_area_sqm > 0 ? ((autoLayoutBaselinePanels.length * singleArea) / designData.usable_area_sqm) * 100 : 0;
                          setDesignData((prev) => ({
                            ...prev,
                            panels: autoLayoutBaselinePanels,
                            panel_count: autoLayoutBaselinePanels.length,
                            system_kw: Math.round(totalKw * 100) / 100,
                            coverage_pct: Math.min(100, Math.round(coveragePct * 10) / 10),
                          }));
                          setHasManualAdjustments(false);
                          setSelectedPanelId(null);
                          setSelectedRowIndex(null);
                          toast.success("Restored latest Auto Layout panels");
                        }
                      }}
                      className="w-full h-7 text-[11px] font-bold bg-amber-950/40 hover:bg-amber-900/60 border border-amber-600/50 text-amber-300 rounded-lg flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" /> Reset Local Changes
                    </Button>
                  )}

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

          {/* PERSISTENT CANONICAL SECTION INSPECTOR (Active across 2D, 3D, and Split) */}
          {!openSection && isSectionSettingsOpen && activeSection && (
            <div
              className="w-84 shrink-0 border-r border-slate-800 bg-slate-900/98 flex flex-col h-full overflow-hidden z-20 shadow-2xl animate-in fade-in slide-in-from-left-2 duration-150"
              style={{ pointerEvents: "auto" }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-950/80 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>{activeSection.name || "Section"}</span>
                      <span className="text-[10px] text-cyan-400 font-normal">
                        ({activeSection.polygon?.length >= 3 ? `${Math.round(getCartesianPolygonArea(activeSection.polygon))} m²` : "0 m²"})
                      </span>
                    </div>
                    <div className="text-[9.5px] text-slate-400">
                      {activeSection.roofType || "RCC"} · {activeSection.pitch ?? 0}° pitch · {activeSection.tilt_deg ?? designData.structure?.tilt_deg ?? designData.tilt_angle ?? 15}° tilt · {activeSection.azimuth ?? 180}° az
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setIsSectionSettingsOpen(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                  title="Close Inspector"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Quick Section Switcher Bar */}
              {effectiveSections.length > 1 && (
                <div className="flex items-center gap-1 px-3 py-1.5 bg-slate-950/40 border-b border-slate-800/80 overflow-x-auto no-scrollbar">
                  <span className="text-[9px] uppercase font-bold text-slate-500 shrink-0 mr-0.5">Switch:</span>
                  {effectiveSections.map((sec) => {
                    const isCur = sec.id === activeSection.id;
                    return (
                      <button
                        key={sec.id}
                        onClick={() => setSelectedSectionId(sec.id)}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 transition flex items-center gap-1 ${
                          isCur
                            ? "bg-cyan-500 text-slate-950 shadow-sm"
                            : "bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/50"
                        }`}
                      >
                        <span>{sec.name || "Sec"}</span>
                        <span className={`text-[8.5px] font-mono ${isCur ? "text-slate-900" : "text-slate-400"}`}>
                          {sec.pitch ?? 0}°p / {sec.tilt_deg ?? 15}°t
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Scrollable Content Body */}
              <div className="p-3.5 space-y-3 overflow-y-auto text-xs text-white divide-y divide-slate-800/60 flex-1 min-h-0">
                {/* 1. Section Identity & Name */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Section Name</Label>
                    <span className="text-[9px] text-slate-500 font-mono">ID: {activeSection.id?.slice(0, 10)}</span>
                  </div>
                  <Input
                    type="text"
                    value={activeSection.name || ""}
                    onChange={(e) => handleUpdateSection(activeSection.id, { name: e.target.value })}
                    className="h-7 text-xs font-bold bg-slate-800 border-slate-700 text-white rounded-lg"
                    placeholder="e.g. South Slope"
                  />
                </div>

                {/* 2. Roof Plane Geometry & Surface */}
                <div className="pt-2.5 space-y-2.5">
                  <div className="text-[10px] uppercase font-bold text-cyan-400 tracking-wider flex items-center justify-between">
                    <span>Roof Architecture</span>
                    <span className="text-[9px] text-slate-400 font-normal">Independent Plane</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] font-semibold text-slate-400">Roof Surface</Label>
                      <Select
                        value={activeSection.roofType || "RCC"}
                        onValueChange={(val) => {
                          const updates = { roofType: val };
                          if (val === "Tile" && (!activeSection.tileConfig || !activeSection.tileConfig.type)) {
                            updates.tileConfig = { type: "spanish_barrel", color: "#b45309" };
                          }
                          handleUpdateSection(activeSection.id, updates);
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs bg-slate-800 border-slate-700 text-white mt-0.5">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-800 text-white">
                          <SelectItem value="RCC">Flat / RCC</SelectItem>
                          <SelectItem value="Tin / Metal">Tin / Metal Sheet</SelectItem>
                          <SelectItem value="Tile">Tile / Sloped Roof</SelectItem>
                          <SelectItem value="Asbestos">Asbestos / Corrugated</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-[10px] font-semibold text-slate-400">Joint Type</Label>
                      <Select
                        value={activeSection.jointType || "same_plane"}
                        onValueChange={(val) => handleUpdateSection(activeSection.id, { jointType: val })}
                      >
                        <SelectTrigger className="h-7 text-xs bg-slate-800 border-slate-700 text-white mt-0.5">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-800 text-white">
                          <SelectItem value="same_plane">Flat / Continuous</SelectItem>
                          <SelectItem value="ridge">Ridge (Peak)</SelectItem>
                          <SelectItem value="valley">Valley</SelectItem>
                          <SelectItem value="hip">Hip</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Tile Configuration (if Tile roof) */}
                  {activeSection.roofType === "Tile" && (
                    <div className="bg-slate-950/80 p-2 rounded-xl border border-amber-800/40 space-y-2">
                      <div className="text-[9.5px] font-bold text-amber-300">Tile Surface Pattern</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <Label className="text-[9px] text-slate-400">Profile</Label>
                          <Select
                            value={activeSection.tileConfig?.type || "spanish_barrel"}
                            onValueChange={(val) => handleUpdateSection(activeSection.id, {
                              tileConfig: { ...(activeSection.tileConfig || {}), type: val }
                            })}
                          >
                            <SelectTrigger className="h-6 text-[10.5px] bg-slate-800 border-slate-700 text-white mt-0.5">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800 text-white">
                              <SelectItem value="spanish_barrel">Spanish Barrel</SelectItem>
                              <SelectItem value="flat_interlocking">Flat Interlocking</SelectItem>
                              <SelectItem value="roman">Roman Tile</SelectItem>
                              <SelectItem value="slate">Slate / Shingle</SelectItem>
                              <SelectItem value="mission">Mission Tile</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-[9px] text-slate-400">Tile Color</Label>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <input
                              type="color"
                              value={activeSection.tileConfig?.color || "#b45309"}
                              onChange={(e) => handleUpdateSection(activeSection.id, {
                                tileConfig: { ...(activeSection.tileConfig || {}), color: e.target.value }
                              })}
                              className="w-6 h-6 rounded cursor-pointer border border-slate-700 bg-transparent p-0"
                            />
                            <span className="text-[10px] font-mono text-slate-300">
                              {activeSection.tileConfig?.color || "#b45309"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Pitch / Slope (Physical Roof Slope) */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-[10px] font-semibold text-slate-400">Roof Pitch (°)</Label>
                        <span className="text-[8.5px] text-slate-500 block">Physical roof plane slope</span>
                      </div>
                      <span className="font-mono text-cyan-400 text-xs font-bold">{activeSection.pitch ?? 0}°</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Slider
                        min={0}
                        max={60}
                        step={1}
                        value={[Number(activeSection.pitch ?? 0)]}
                        onValueChange={([val]) => handleUpdateSection(activeSection.id, { pitch: val })}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        min="0"
                        max="60"
                        value={activeSection.pitch ?? 0}
                        onChange={(e) => {
                          const val = Math.max(0, Math.min(60, parseFloat(e.target.value) || 0));
                          handleUpdateSection(activeSection.id, { pitch: val });
                        }}
                        className="h-6 w-14 text-xs font-mono font-bold bg-slate-800 border-slate-700 text-white text-center p-0"
                      />
                    </div>
                  </div>

                  {/* Solar Mounting Tilt Angle */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-[10px] font-semibold text-slate-400">Solar Tilt Angle (°)</Label>
                        <span className="text-[8.5px] text-slate-500 block">Solar module / mount tilt</span>
                      </div>
                      <span className="font-mono text-amber-400 text-xs font-bold">
                        {activeSection.tilt_deg ?? designData.structure?.tilt_deg ?? designData.tilt_angle ?? 15}°
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Slider
                        min={0}
                        max={60}
                        step={1}
                        value={[Number(activeSection.tilt_deg ?? designData.structure?.tilt_deg ?? designData.tilt_angle ?? 15)]}
                        onValueChange={([val]) => handleUpdateSection(activeSection.id, { tilt_deg: val })}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        min="0"
                        max="60"
                        value={activeSection.tilt_deg ?? designData.structure?.tilt_deg ?? designData.tilt_angle ?? 15}
                        onChange={(e) => {
                          const val = Math.max(0, Math.min(60, parseFloat(e.target.value) || 0));
                          handleUpdateSection(activeSection.id, { tilt_deg: val });
                        }}
                        className="h-6 w-14 text-xs font-mono font-bold bg-slate-800 border-slate-700 text-white text-center p-0"
                      />
                    </div>
                    {((activeSection.mountingType || "").toLowerCase() === "flush" || (activeSection.mountingType || "").toLowerCase() === "tile_hook_rail") && (
                      <p className="text-[8.5px] text-slate-400 italic">
                        Flush mount: panels align to roof pitch ({activeSection.pitch ?? 0}°).
                      </p>
                    )}
                  </div>

                  {/* Azimuth / Orientation */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] font-semibold text-slate-400">Azimuth (°)</Label>
                      <span className="font-mono text-cyan-400 text-xs font-bold">{activeSection.azimuth ?? 180}°</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Slider
                        min={0}
                        max={359}
                        step={1}
                        value={[Number(activeSection.azimuth ?? 180)]}
                        onValueChange={([val]) => handleUpdateSection(activeSection.id, { azimuth: val })}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        min="0"
                        max="359"
                        value={activeSection.azimuth ?? 180}
                        onChange={(e) => {
                          const val = Math.max(0, Math.min(359, parseFloat(e.target.value) || 0));
                          handleUpdateSection(activeSection.id, { azimuth: val });
                        }}
                        className="h-6 w-14 text-xs font-mono font-bold bg-slate-800 border-slate-700 text-white text-center p-0"
                      />
                    </div>
                    <div className="grid grid-cols-4 gap-1 pt-0.5">
                      {[
                        { label: "N (0°)", deg: 0 },
                        { label: "E (90°)", deg: 90 },
                        { label: "S (180°)", deg: 180 },
                        { label: "W (270°)", deg: 270 },
                      ].map((item) => (
                        <button
                          key={item.deg}
                          type="button"
                          onClick={() => handleUpdateSection(activeSection.id, { azimuth: item.deg })}
                          className={`py-0.5 text-[9px] font-bold rounded border transition cursor-pointer ${
                            Number(activeSection.azimuth ?? 180) === item.deg
                              ? "bg-cyan-950 border-cyan-500 text-cyan-300"
                              : "bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white"
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Elevation / Height */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] font-semibold text-slate-400">Elevation / Base Height (m)</Label>
                      <span className="font-mono text-cyan-400 text-xs font-bold">{activeSection.elevation ?? 3.5} m</span>
                    </div>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="50"
                      value={activeSection.elevation ?? 3.5}
                      onChange={(e) => {
                        const val = Math.max(0, parseFloat(e.target.value) || 3.5);
                        handleUpdateSection(activeSection.id, { elevation: val });
                      }}
                      className="h-7 text-xs font-mono font-bold bg-slate-800 border-slate-700 text-white"
                    />
                  </div>
                </div>

                {/* 3. Solar PV Generation & Isolated Layout Parameters */}
                <div className="pt-2.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">Solar PV Array</div>
                      <div className="text-[9px] text-slate-400">Independent Section Layout</div>
                    </div>
                    <Switch
                      checked={activeSection.solarEnabled !== false}
                      onCheckedChange={(checked) => handleUpdateSection(activeSection.id, { solarEnabled: checked })}
                    />
                  </div>

                  {activeSection.solarEnabled !== false ? (
                    <div className="space-y-2.5 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                      {/* Orientation */}
                      <div>
                        <Label className="text-[10px] font-semibold text-slate-400">Panel Orientation</Label>
                        <div className="grid grid-cols-2 gap-1.5 mt-1">
                          <button
                            type="button"
                            onClick={() => handleUpdateSection(activeSection.id, { orientation: "portrait" })}
                            className={`py-1 text-xs font-bold rounded-lg border transition cursor-pointer ${
                              (activeSection.orientation || designData.orientation || "portrait") === "portrait"
                                ? "bg-amber-500 text-slate-950 border-amber-400 shadow-sm"
                                : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
                            }`}
                          >
                            Portrait
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateSection(activeSection.id, { orientation: "landscape" })}
                            className={`py-1 text-xs font-bold rounded-lg border transition cursor-pointer ${
                              (activeSection.orientation || designData.orientation || "portrait") === "landscape"
                                ? "bg-amber-500 text-slate-950 border-amber-400 shadow-sm"
                                : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
                            }`}
                          >
                            Landscape
                          </button>
                        </div>
                      </div>

                      {/* Setback, Panel Gap, Row Gap */}
                      <div className="grid grid-cols-3 gap-1.5">
                        <div>
                          <Label className="text-[9px] text-slate-400">Setback (m)</Label>
                          <Input
                            type="number"
                            step="0.05"
                            min="0.1"
                            max="2.5"
                            value={activeSection.setback_m ?? designData.roof?.setback_m ?? designData.setback_m ?? 0.5}
                            onChange={(e) => {
                              const val = Math.max(0.05, parseFloat(e.target.value) || 0.5);
                              handleUpdateSection(activeSection.id, { setback_m: val });
                            }}
                            className="h-6 text-[10.5px] font-bold bg-slate-800 border-slate-700 text-white mt-0.5 px-1.5"
                          />
                        </div>

                        <div>
                          <Label className="text-[9px] text-slate-400">Panel Gap (m)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0.01"
                            max="0.5"
                            value={activeSection.panel_spacing_m ?? designData.panel_spacing_m ?? 0.03}
                            onChange={(e) => {
                              const val = Math.max(0.01, parseFloat(e.target.value) || 0.03);
                              handleUpdateSection(activeSection.id, { panel_spacing_m: val });
                            }}
                            className="h-6 text-[10.5px] font-bold bg-slate-800 border-slate-700 text-white mt-0.5 px-1.5"
                          />
                        </div>

                        <div>
                          <Label className="text-[9px] text-slate-400">Row Gap (m)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0.01"
                            max="2.0"
                            value={activeSection.row_spacing_m ?? designData.row_spacing_m ?? 0.03}
                            onChange={(e) => {
                              const val = Math.max(0.01, parseFloat(e.target.value) || 0.03);
                              handleUpdateSection(activeSection.id, { row_spacing_m: val });
                            }}
                            className="h-6 text-[10.5px] font-bold bg-slate-800 border-slate-700 text-white mt-0.5 px-1.5"
                          />
                        </div>
                      </div>

                      {/* Section Panel Generation Actions */}
                      <div className="pt-1.5 space-y-1.5">
                        <Button
                          size="sm"
                          onClick={() => handleGenerateSectionPanels(activeSection.id)}
                          className="w-full h-7 text-[11px] font-bold bg-amber-600 hover:bg-amber-500 text-slate-950 rounded-lg flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                        >
                          <Zap className="w-3 h-3 fill-current" />
                          Generate {activeSection.name || "Section"} Panels
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleClearSectionPanels(activeSection.id)}
                          className="w-full h-6 text-[10px] font-semibold bg-slate-900/80 hover:bg-slate-800 border-slate-700 text-slate-300 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Clear {activeSection.name || "Section"} Panels
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800 text-[10.5px] text-slate-400 italic text-center">
                      Solar PV generation is disabled on this section.
                    </div>
                  )}
                </div>

                {/* 4. Isolated Mounting & Structure */}
                <div className="pt-2.5 space-y-2.5">
                  <div className="text-[10px] uppercase font-bold text-blue-400 tracking-wider flex items-center justify-between">
                    <span>Mounting & Structure</span>
                    <span className="text-[9px] text-slate-400 font-normal">Section Isolated</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] font-semibold text-slate-400">Mounting Type</Label>
                      <Select
                        value={activeSection.mountingType || designData.structure?.type || "elevated"}
                        onValueChange={(val) => handleUpdateSection(activeSection.id, { mountingType: val })}
                      >
                        <SelectTrigger className="h-7 text-xs bg-slate-800 border-slate-700 text-white mt-0.5">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-800 text-white">
                          <SelectItem value="elevated">Elevated Frame</SelectItem>
                          <SelectItem value="flush">Flush to Roof</SelectItem>
                          <SelectItem value="tile_hook_rail">Tile Hook & Rail</SelectItem>
                          <SelectItem value="ballasted">Ballasted</SelectItem>
                          <SelectItem value="ground_mount">Ground Mount</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-[10px] font-semibold text-slate-400">Clearance (m)</Label>
                      <Input
                        type="number"
                        step="0.05"
                        min="0.05"
                        max="4.0"
                        value={activeSection.structure_height_m ?? designData.structure?.height_m ?? 1.8}
                        onChange={(e) => {
                          const val = Math.max(0.05, parseFloat(e.target.value) || 1.8);
                          handleUpdateSection(activeSection.id, { structure_height_m: val });
                        }}
                        className="h-7 text-xs font-bold mt-0.5 bg-slate-800 border-slate-700 text-white"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between bg-slate-950/80 p-2 rounded-xl border border-slate-800">
                    <div>
                      <div className="text-[10px] font-bold text-slate-200">3D Framework</div>
                      <div className="text-[9px] text-slate-400">Show purlins & rafters in 3D</div>
                    </div>
                    <Switch
                      checked={activeSection.structureEnabled !== false}
                      onCheckedChange={(checked) => handleUpdateSection(activeSection.id, { structureEnabled: checked })}
                    />
                  </div>
                </div>

                {/* 5. Section Boundary & Delete Actions */}
                <div className="pt-2.5 flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      if (activeTab !== "2d") setActiveTab("2d");
                      setActiveTool("edit_section");
                    }}
                    className="flex-1 h-7 text-[10.5px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <PenTool className="w-3 h-3 text-emerald-400" />
                    Edit 2D Boundary
                  </Button>

                  {effectiveSections.length > 1 && (
                    <Button
                      size="sm"
                      onClick={() => handleDeleteSection(activeSection.id)}
                      className="h-7 text-[10.5px] font-bold bg-rose-950/50 hover:bg-rose-900 border border-rose-800/60 text-rose-300 rounded-lg px-2.5 flex items-center justify-center gap-1 cursor-pointer"
                      title="Delete this section"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── CANVAS WORKING AREA (Takes remaining space, NEVER covered by inspector) ── */}
          <div className="flex-1 relative min-w-0 h-full overflow-hidden">
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
              setPanels={handleSetPanels}
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
              selectionMode={selectionMode}
              setSelectionMode={setSelectionMode}
              selectedRowIndex={selectedRowIndex}
              setSelectedRowIndex={setSelectedRowIndex}
              autoLayoutBaselinePanels={autoLayoutBaselinePanels}
              hasManualAdjustments={hasManualAdjustments}
              setHasManualAdjustments={setHasManualAdjustments}
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
              roofSections={effectiveSections}
              selectedSectionId={selectedSectionId}
              onSelectSection={handleSelectSection}
              onSplitSection={handleSplitSection}
              onMergeSections={handleMergeSections}
              onAddSection={handleAddSection}
              onDeleteSection={handleDeleteSection}
              onUpdateSectionPolygon={handleUpdateSectionPolygon}
            />
          </div>

          {/* 3D VIEWER CONTAINER (Kept mounted for zero-lag switching) */}
          <div className={`w-full h-full relative ${activeTab === "3d" ? "block" : "hidden"}`}>
            {/* Top 3D View Presets Toolbar */}
            <div className="absolute top-4 left-4 z-20 flex items-center gap-1 bg-slate-900/90 backdrop-blur-md p-1 rounded-xl border border-slate-800 shadow-xl transition-all duration-200">
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

            {hasOpened3D && (
              <Viewer3DErrorBoundary onSwitchTo2D={() => { setActiveTab("2d"); setActiveTool("draw_roof"); }}>
                <Suspense fallback={
                  <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 text-slate-400 gap-2">
                    <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs">Initializing 3D Visualizer…</span>
                  </div>
                }>
                  <Rooftop3DViewer
                    ref={viewer3dRef}
                    roofPolygon={designData.roof_polygon}
                    roof={designData.roof}
                    roofSections={effectiveSections}
                    selectedSectionId={selectedSectionId}
                    onSelectSection={handleSelectSection}
                    panels={designData.panels}
                    setPanels={handleSetPanels}
                    selectedPanelId={selectedPanelId}
                    setSelectedPanelId={setSelectedPanelId}
                    selectionMode={selectionMode}
                    setSelectionMode={setSelectionMode}
                    selectedRowIndex={selectedRowIndex}
                    setSelectedRowIndex={setSelectedRowIndex}
                    hasManualAdjustments={hasManualAdjustments}
                    setHasManualAdjustments={setHasManualAdjustments}
                    setbackMeters={Number(designData.roof?.setback_m || designData.setback_m || 0.5)}
                    onUpdateSection={handleUpdateSection}
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
                </Suspense>
              </Viewer3DErrorBoundary>
            )}
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
                selectionMode={selectionMode}
                setSelectionMode={setSelectionMode}
                selectedRowIndex={selectedRowIndex}
                setSelectedRowIndex={setSelectedRowIndex}
                autoLayoutBaselinePanels={autoLayoutBaselinePanels}
                hasManualAdjustments={hasManualAdjustments}
                setHasManualAdjustments={setHasManualAdjustments}
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
                roofSections={effectiveSections}
                selectedSectionId={selectedSectionId}
                onSelectSection={handleSelectSection}
                onSplitSection={handleSplitSection}
                onMergeSections={handleMergeSections}
                onAddSection={handleAddSection}
                onDeleteSection={handleDeleteSection}
                onUpdateSectionPolygon={handleUpdateSectionPolygon}
              />
              {hasOpened3D && (
                <Suspense fallback={
                  <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 text-slate-400 gap-2">
                    <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs">Initializing 3D Visualizer…</span>
                  </div>
                }>
                  <Rooftop3DViewer
                    ref={viewer3dRef}
                    roofPolygon={designData.roof_polygon}
                    roof={designData.roof}
                    roofSections={effectiveSections}
                    selectedSectionId={selectedSectionId}
                    onSelectSection={handleSelectSection}
                    panels={designData.panels}
                    setPanels={handleSetPanels}
                    selectedPanelId={selectedPanelId}
                    setSelectedPanelId={setSelectedPanelId}
                    selectionMode={selectionMode}
                    setSelectionMode={setSelectionMode}
                    selectedRowIndex={selectedRowIndex}
                    setSelectedRowIndex={setSelectedRowIndex}
                    hasManualAdjustments={hasManualAdjustments}
                    setHasManualAdjustments={setHasManualAdjustments}
                    setbackMeters={Number(designData.roof?.setback_m || designData.setback_m || 0.5)}
                    onUpdateSection={handleUpdateSection}
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
                </Suspense>
              )}
            </div>
          )}
            </div>
          </div>
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
