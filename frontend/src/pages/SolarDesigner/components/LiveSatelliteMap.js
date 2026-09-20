import React, { useEffect, useRef, useState, useCallback, useMemo, useImperativeHandle, forwardRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MousePointer, PenTool, Ruler, Trash2, RotateCw, Copy, Plus,
  AlertTriangle, Navigation, CheckCircle2, Undo2, Redo2, MapPin, Check, Info, PlusCircle,
  Edit3, CheckSquare, X, Search, RefreshCw, Maximize2, Minimize2, Layers as LayersIcon,
  Target
} from "lucide-react";
import { toast } from "sonner";
import {
  toRad,
  toDeg,
  getHaversineDistance,
  getCartesianPolygonArea,
  getCartesianPolygonPerimeter,
  getPolygonBounds,
  computeSetbackPolygon,
  getRotatedRectCorners,
  isPointInPolygon,
} from "../utils/geoCalculations";
import { validatePanelPlacement, canFitAdditionalPanel } from "../utils/layoutEngine";
import LayoutMicroAdjuster from "./LayoutMicroAdjuster";

// Fix Leaflet default marker icons (CDN-based to avoid webpack asset issues)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// ─── Error Boundary ───────────────────────────────────────────────────────────
class MapErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }
  static getDerivedStateFromError(err) {
    return { hasError: true, errorMessage: err?.message || "Unknown map error" };
  }
  componentDidCatch(err, info) {
    console.error("[MapErrorBoundary caught error]:", err?.message, err?.stack, info?.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="absolute inset-0 bg-slate-900/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-white z-50 rounded-2xl">
          <AlertTriangle className="w-12 h-12 text-amber-400 mb-3" />
          <h3 className="text-lg font-bold mb-1">Map Rendering Failed</h3>
          <p className="text-xs text-slate-300 max-w-md mb-4">{this.state.errorMessage}</p>
          <button
            onClick={() => this.setState({ hasError: false, errorMessage: "" })}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-5 py-2 rounded-xl"
          >
            Retry Map
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Coordinate Validation ────────────────────────────────────────────────────
function isValidLatLng(lat, lng) {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    isFinite(lat) &&
    isFinite(lng) &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180
  );
}

function isValidCartesian(pt) {
  return (
    pt &&
    typeof pt.x === "number" &&
    typeof pt.y === "number" &&
    isFinite(pt.x) &&
    isFinite(pt.y) &&
    Math.abs(pt.x) < 50000 &&
    Math.abs(pt.y) < 50000
  );
}

const LiveSatelliteMapInner = forwardRef(function LiveSatelliteMapInner(
  {
    latitude = 19.076,
    longitude = 72.8777,
    zoom = 19,
    onLocationChange,
    onCaptureLocation,
    onZoomChange,
    formattedAddress = "",
    searchQuery = "",
    setSearchQuery,
    searchPredictions = [],
    onSelectPrediction,
    searching = false,
    activeTab = "2d",
    setActiveTab,
    isFullscreen = false,
    setIsFullscreen,
    roofPolygon = [],
    setRoofPolygon,
    panels = [],
    setPanels,
    obstacles = [],
    setObstacles,
    walkways = [],
    setWalkways,
    setbackMeters = 0.5,
    rowSpacingMeters = 0.35,
    panelSpacingMeters = 0.02,
    activeTool = "select",
    setActiveTool,
    onAddPanel,
    selectedPanelId = null,
    setSelectedPanelId,
    selectionMode = "panel",
    setSelectionMode,
    selectedRowIndex = null,
    setSelectedRowIndex,
    autoLayoutBaselinePanels = null,
    hasManualAdjustments = false,
    setHasManualAdjustments,
    onCalibrationComplete,
    orientation = "portrait",
    azimuthDegrees = 180,
    panelSpecs = {},
    isCalibrated = false,
  },
  ref
) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerGroupRef = useRef(null);
  const roofLayerGroupRef = useRef(null);
  const panelsLayerGroupRef = useRef(null);
  const obstaclesLayerGroupRef = useRef(null);
  const markerRef = useRef(null);
  const vertexHandlesRef = useRef([]);

  // Fallback states for layout micro-adjustments
  const [internalSelectionMode, setInternalSelectionMode] = useState("panel");
  const [internalSelectedRowIndex, setInternalSelectedRowIndex] = useState(null);
  const [internalSelectedPanelId, setInternalSelectedPanelId] = useState(null);
  const [hoveredRowIndex, setHoveredRowIndex] = useState(null);

  const activeSelectionMode = selectionMode || internalSelectionMode;
  const changeSelectionMode = setSelectionMode || setInternalSelectionMode;

  const activeSelectedRowIndex = selectedRowIndex !== undefined ? selectedRowIndex : internalSelectedRowIndex;
  const changeSelectedRowIndex = setSelectedRowIndex || setInternalSelectedRowIndex;

  const activeSelectedPanelId = selectedPanelId !== undefined ? selectedPanelId : internalSelectedPanelId;
  const changeSelectedPanelId = setSelectedPanelId || setInternalSelectedPanelId;

  // Stable refs for latest prop values
  const roofPolygonRef = useRef(roofPolygon);
  const setRoofPolygonRef = useRef(setRoofPolygon);
  const originRef = useRef({ lat: Number(latitude) || 19.076, lng: Number(longitude) || 72.8777 });

  useEffect(() => { roofPolygonRef.current = roofPolygon; }, [roofPolygon]);
  useEffect(() => { setRoofPolygonRef.current = setRoofPolygon; }, [setRoofPolygon]);

  const [mapType, setMapType] = useState("satellite");
  const [mapError, setMapError] = useState(null);
  const [activeDrawPoints, setActiveDrawPoints] = useState([]);
  const cursorCoordsRef = useRef({ lat: Number(latitude) || 19.076, lng: Number(longitude) || 72.8777 });

  // Precision Magnifier configuration, refs & state (Visual overlay, exactly ONE Leaflet map)
  const MAGNIFIER_SIZE = 120;
  const MAGNIFIER_RADIUS = MAGNIFIER_SIZE / 2;
  const [magnifierZoom, setMagnifierZoom] = useState(2);
  const magnifierZoomRef = useRef(2);
  const [magnifierOffset, setMagnifierOffset] = useState({ x: 24, y: -144 });
  const magnifierOffsetRef = useRef({ x: 24, y: -144 });

  const cursorScreenPosRef = useRef({ x: -999, y: -999 });
  const magnifierLensRef = useRef(null);
  const magnifierContentRef = useRef(null);
  const magnifierPaneRef = useRef(null);
  const targetReticleRef = useRef(null);
  const connectorSvgRef = useRef(null);
  const connectorLineRef = useRef(null);
  const updateMagnifierTransformRef = useRef(null);
  const rafIdRef = useRef(null);
  const isDraggingVertexRef = useRef(false);

  // Synchronize rendered tile layer DOM from primary Leaflet map into the precision magnifier lens
  const syncMagnifierTiles = useCallback(() => {
    const container = mapContainerRef.current;
    const contentWrapper = magnifierContentRef.current;
    const paneWrapper = magnifierPaneRef.current;
    if (!container || !contentWrapper || !paneWrapper) return;

    const tilePane = container.querySelector(".leaflet-tile-pane");
    if (!tilePane) return;

    const containerRect = container.getBoundingClientRect();
    const w = containerRect.width || container.clientWidth;
    const h = containerRect.height || container.clientHeight;
    if (w <= 0 || h <= 0) return;

    contentWrapper.style.width = `${w}px`;
    contentWrapper.style.height = `${h}px`;

    // Keep pane wrapper transform neutral so container coordinates map 1:1
    paneWrapper.style.transform = "none";

    const tiles = tilePane.querySelectorAll("img.leaflet-tile");
    if (tiles.length === 0) return;

    // Clear old visual tiles
    paneWrapper.innerHTML = "";

    // Create pure visual replicates of currently rendered satellite tiles positioned exactly in container coordinates
    tiles.forEach((t) => {
      if (!t.src) return;
      const tileRect = t.getBoundingClientRect();
      const left = tileRect.left - containerRect.left;
      const top = tileRect.top - containerRect.top;
      const width = tileRect.width || 256;
      const height = tileRect.height || 256;

      const img = document.createElement("img");
      img.src = t.src;
      img.style.cssText = `
        position: absolute !important;
        left: ${left}px !important;
        top: ${top}px !important;
        width: ${width}px !important;
        height: ${height}px !important;
        max-width: none !important;
        max-height: none !important;
        min-width: ${width}px !important;
        min-height: ${height}px !important;
        transform: none !important;
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        pointer-events: none !important;
      `;
      paneWrapper.appendChild(img);
    });
  }, []);

  // Update magnifier position, target reticle, connector line, and high-magnification transform at display refresh rate via requestAnimationFrame
  const updateMagnifierTransform = useCallback(() => {
    rafIdRef.current = null;
    const lensEl = magnifierLensRef.current;
    const contentEl = magnifierContentRef.current;
    const paneWrapper = magnifierPaneRef.current;
    const reticleEl = targetReticleRef.current;
    const connSvg = connectorSvgRef.current;
    const connLine = connectorLineRef.current;
    const container = mapContainerRef.current;
    if (!lensEl || !contentEl || !container) return;

    const { x: cx, y: cy } = cursorScreenPosRef.current;
    if (cx < 0 || cy < 0) {
      lensEl.style.display = "none";
      if (reticleEl) reticleEl.style.display = "none";
      if (connSvg) connSvg.style.display = "none";
      return;
    }

    const containerW = container.clientWidth;
    const containerH = container.clientHeight;

    if (cx < 0 || cx > containerW || cy < 0 || cy > containerH) {
      lensEl.style.display = "none";
      if (reticleEl) reticleEl.style.display = "none";
      if (connSvg) connSvg.style.display = "none";
      return;
    }

    // If tiles have not been populated yet, trigger sync now
    if (paneWrapper && paneWrapper.children.length === 0) {
      syncMagnifierTiles();
    }

    lensEl.style.display = "block";

    // 1. Under-cursor Target Reticle directly marking the exact geographic target
    if (reticleEl) {
      reticleEl.style.display = "block";
      reticleEl.style.transform = `translate3d(${cx}px, ${cy}px, 0px)`;
    }

    // 2. Clean Positioning: Offset lens relative to cursor to prevent covering target
    const MARGIN = 8;
    const offset = magnifierOffsetRef.current || { x: 24, y: -144 };

    let lensLeft = cx + offset.x;
    let lensTop = cy + offset.y;

    // Viewport edge auto-adaptation:
    // If approaching top edge when offset points above
    if (lensTop < MARGIN && offset.y < 0) {
      lensTop = cy + Math.abs(offset.y) - MAGNIFIER_SIZE;
    }
    // If approaching right edge when offset points right
    if (lensLeft + MAGNIFIER_SIZE > containerW - MARGIN && offset.x > 0) {
      lensLeft = cx - MAGNIFIER_SIZE - Math.abs(offset.x);
    }
    // If approaching bottom edge when offset points below
    if (lensTop + MAGNIFIER_SIZE > containerH - MARGIN && offset.y > 0) {
      lensTop = cy - MAGNIFIER_SIZE - Math.abs(offset.y);
    }
    // If approaching left edge when offset points left
    if (lensLeft < MARGIN && offset.x < 0) {
      lensLeft = cx + Math.abs(offset.x);
    }

    // Clamp strictly within viewport
    lensLeft = Math.max(MARGIN, Math.min(lensLeft, containerW - MAGNIFIER_SIZE - MARGIN));
    lensTop = Math.max(MARGIN, Math.min(lensTop, containerH - MAGNIFIER_SIZE - MARGIN));

    lensEl.style.transform = `translate3d(${lensLeft}px, ${lensTop}px, 0px)`;

    // 3. Visual Connector Line between cursor target (cx, cy) and lens perimeter
    if (connSvg && connLine) {
      const lensCenterX = lensLeft + MAGNIFIER_RADIUS;
      const lensCenterY = lensTop + MAGNIFIER_RADIUS;
      const dx = lensCenterX - cx;
      const dy = lensCenterY - cy;
      const dist = Math.hypot(dx, dy);

      if (dist > MAGNIFIER_RADIUS + 12) {
        connSvg.style.display = "block";
        const edgeX = lensCenterX - (dx / dist) * MAGNIFIER_RADIUS;
        const edgeY = lensCenterY - (dy / dist) * MAGNIFIER_RADIUS;
        connLine.setAttribute("x1", cx);
        connLine.setAttribute("y1", cy);
        connLine.setAttribute("x2", edgeX);
        connLine.setAttribute("y2", edgeY);
        connLine.style.display = "block";
      } else {
        connSvg.style.display = "none";
      }
    }

    // 4. Scale satellite imagery: The exact geographic point directly under the cursor (cx, cy)
    // is mathematically placed in the dead center of the lens (MAGNIFIER_RADIUS, MAGNIFIER_RADIUS).
    const zoom = magnifierZoomRef.current || 2;
    const tx = MAGNIFIER_RADIUS - zoom * cx;
    const ty = MAGNIFIER_RADIUS - zoom * cy;

    contentEl.style.transform = `translate3d(${tx}px, ${ty}px, 0px) scale(${zoom})`;
  }, [MAGNIFIER_RADIUS, MAGNIFIER_SIZE, syncMagnifierTiles]);

  useEffect(() => {
    updateMagnifierTransformRef.current = updateMagnifierTransform;
  }, [updateMagnifierTransform]);

  // Location Capture & Drag confirmation states
  const [locationCaptured, setLocationCaptured] = useState(false);
  const [capturedCoords, setCapturedCoords] = useState(null);
  const [pendingMarkerLocation, setPendingMarkerLocation] = useState(null);

  // Roof Edit Mode state & Undo/Redo Stacks
  const editingRoof = activeTool === "edit_roof";
  const editingRoofRef = useRef(editingRoof);
  useEffect(() => { editingRoofRef.current = editingRoof; }, [editingRoof]);

  const activeToolRef = useRef(activeTool);
  const handleMapClickForAddPanelRef = useRef(null);
  const handleMapClickRoofRef = useRef(null);

  useEffect(() => {
    activeToolRef.current = activeTool;
    window.__activeSolarTool = activeTool;
  }, [activeTool]);

  useEffect(() => {
    if (activeTool === "draw_roof") {
      syncMagnifierTiles();
      if (magnifierLensRef.current) magnifierLensRef.current.style.display = "none";
      if (targetReticleRef.current) targetReticleRef.current.style.display = "none";
      if (connectorSvgRef.current) connectorSvgRef.current.style.display = "none";
    } else {
      if (magnifierLensRef.current) magnifierLensRef.current.style.display = "none";
      if (targetReticleRef.current) targetReticleRef.current.style.display = "none";
      if (connectorSvgRef.current) connectorSvgRef.current.style.display = "none";
      cursorScreenPosRef.current = { x: -999, y: -999 };
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    }
  }, [activeTool, syncMagnifierTiles]);

  // Keep magnifier tiles synchronized when roof points or polygon changes
  useEffect(() => {
    if (activeTool === "draw_roof") {
      const timer = setTimeout(() => {
        syncMagnifierTiles();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeDrawPoints, roofPolygon, activeTool, syncMagnifierTiles]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  const [vertexHistory, setVertexHistory] = useState([]);
  const [vertexRedoStack, setVertexRedoStack] = useState([]);

  const pushVertexHistory = useCallback((prevPoly) => {
    if (!prevPoly || prevPoly.length === 0) return;
    setVertexHistory((h) => [...h.slice(-20), prevPoly]);
    setVertexRedoStack([]);
  }, []);

  const handleUndoVertex = useCallback(() => {
    if (vertexHistory.length === 0) return;
    const previous = vertexHistory[vertexHistory.length - 1];
    setVertexRedoStack((r) => [...r, roofPolygonRef.current]);
    setVertexHistory((h) => h.slice(0, -1));
    setRoofPolygonRef.current(previous);
    toast.info("Undid roof modification");
  }, [vertexHistory]);

  const handleRedoVertex = useCallback(() => {
    if (vertexRedoStack.length === 0) return;
    const next = vertexRedoStack[vertexRedoStack.length - 1];
    setVertexHistory((h) => [...h, roofPolygonRef.current]);
    setVertexRedoStack((r) => r.slice(0, -1));
    setRoofPolygonRef.current(next);
    toast.info("Redid roof modification");
  }, [vertexRedoStack]);

  // Calibration
  const [calibratePoints, setCalibratePoints] = useState([]);
  const [showCalibrateModal, setShowCalibrateModal] = useState(false);
  const [calibrateDistanceInput, setCalibrateDistanceInput] = useState("10");

  // Layer Visibility
  const [layers, setLayers] = useState({
    satellite: true,
    roofBoundary: true,
    dimensions: true,
    setbacks: true,
    obstacles: true,
    panels: true,
    walkways: true,
  });

  // Canonical Site Origin
  const originLat = Number(latitude) || 19.076;
  const originLng = Number(longitude) || 72.8777;

  useEffect(() => {
    originRef.current = { lat: originLat, lng: originLng };
  }, [originLat, originLng]);

  // Coordinate Conversion with Stable Origin
  const cartesianToLatLng = useCallback((x, y) => {
    if (!isFinite(x) || !isFinite(y)) return [originLat, originLng];
    const dLngRad = x / (Math.cos(toRad(originRef.current.lat)) * 6378137);
    const dLatRad = y / 6378137;
    const lat = originRef.current.lat + toDeg(dLatRad);
    const lng = originRef.current.lng + toDeg(dLngRad);
    if (!isValidLatLng(lat, lng)) return [originRef.current.lat, originRef.current.lng];
    return [lat, lng];
  }, [originLat, originLng]);

  const latLngToCartesian = useCallback((lat, lng) => {
    if (!isValidLatLng(lat, lng)) return { x: 0, y: 0 };
    const x = (toRad(lng) - toRad(originRef.current.lng)) * Math.cos(toRad(originRef.current.lat)) * 6378137;
    const y = (toRad(lat) - toRad(originRef.current.lat)) * 6378137;
    return { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 };
  }, []);

  // Check for Out-of-Bounds panels
  const outOfBoundsPanels = useMemo(() => {
    if (!roofPolygon || roofPolygon.length < 3 || !Array.isArray(panels)) return [];
    return panels.filter((p) => !p.hidden && isValidCartesian(p) && !isPointInPolygon(p.x, p.y, roofPolygon));
  }, [roofPolygon, panels]);

  const handleRemoveOutOfBoundsPanels = useCallback(() => {
    if (outOfBoundsPanels.length === 0) return;
    const badIds = new Set(outOfBoundsPanels.map((p) => p.id));
    setPanels?.((prev) => prev.filter((p) => !badIds.has(p.id)));
    toast.success(`Removed ${outOfBoundsPanels.length} out-of-bounds panel(s).`);
  }, [outOfBoundsPanels, setPanels]);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    getSnapshotDataUrl: () => {
      const map = mapInstanceRef.current;
      if (!map) return null;
      try {
        const poly = roofPolygonRef.current;
        const currentPanels = (Array.isArray(panels) ? panels : []).filter((p) => !p.hidden);
        const currentObstacles = Array.isArray(obstacles) ? obstacles : [];

        const canvas = document.createElement("canvas");
        const w = 1200;
        const h = 800;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;

        // 1. Blueprint-style Dark Gradient Background
        const bgGrad = ctx.createLinearGradient(0, 0, w, h);
        bgGrad.addColorStop(0, "#0a0f1d");
        bgGrad.addColorStop(1, "#111827");
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        // Architectural Grid Lines
        ctx.strokeStyle = "rgba(51, 65, 85, 0.25)";
        ctx.lineWidth = 1;
        for (let gx = 0; gx < w; gx += 40) {
          ctx.beginPath();
          ctx.moveTo(gx, 0);
          ctx.lineTo(gx, h);
          ctx.stroke();
        }
        for (let gy = 0; gy < h; gy += 40) {
          ctx.beginPath();
          ctx.moveTo(0, gy);
          ctx.lineTo(w, gy);
          ctx.stroke();
        }

        // 2. Determine Bounding Box in Cartesian Coordinates (meters)
        let minX = -10, maxX = 10, minY = -10, maxY = 10;
        if (poly && poly.length >= 3) {
          minX = Math.min(...poly.map((p) => p.x));
          maxX = Math.max(...poly.map((p) => p.x));
          minY = Math.min(...poly.map((p) => p.y));
          maxY = Math.max(...poly.map((p) => p.y));
        } else if (currentPanels.length > 0) {
          minX = Math.min(...currentPanels.map((p) => p.x)) - 2;
          maxX = Math.max(...currentPanels.map((p) => p.x)) + 2;
          minY = Math.min(...currentPanels.map((p) => p.y)) - 2;
          maxY = Math.max(...currentPanels.map((p) => p.y)) + 2;
        }

        // Add generous margins around structure
        minX -= 3.0; maxX += 3.0;
        minY -= 3.0; maxY += 3.0;
        const rangeX = Math.max(6, maxX - minX);
        const rangeY = Math.max(6, maxY - minY);

        const padX = 90;
        const padY = 90;
        const availW = w - padX * 2;
        const availH = h - padY * 2;
        const scale = Math.min(availW / rangeX, availH / rangeY);

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        const toScreenX = (x) => w / 2 + (x - centerX) * scale;
        const toScreenY = (y) => h / 2 - (y - centerY) * scale; // Invert Y so North is up

        // 3. Draw Roof Boundary Polygon
        if (poly && poly.length >= 3) {
          ctx.beginPath();
          poly.forEach((pt, i) => {
            const sx = toScreenX(pt.x);
            const sy = toScreenY(pt.y);
            if (i === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
          });
          ctx.closePath();
          ctx.fillStyle = "rgba(14, 116, 144, 0.22)";
          ctx.fill();
          ctx.strokeStyle = "#38bdf8";
          ctx.lineWidth = 3.5;
          ctx.stroke();

          // Vertex Points and Labels (P1, P2, ...)
          poly.forEach((pt, i) => {
            const sx = toScreenX(pt.x);
            const sy = toScreenY(pt.y);
            ctx.beginPath();
            ctx.arc(sx, sy, 5, 0, Math.PI * 2);
            ctx.fillStyle = "#f59e0b";
            ctx.fill();
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.font = "bold 11px system-ui, sans-serif";
            ctx.fillStyle = "#ffffff";
            ctx.fillText(`P${i + 1}`, sx + 8, sy - 6);
          });

          // Edge Dimension Labels (Meters)
          for (let i = 0; i < poly.length; i++) {
            const j = (i + 1) % poly.length;
            const p1 = poly[i], p2 = poly[j];
            const distM = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            const mx = (toScreenX(p1.x) + toScreenX(p2.x)) / 2;
            const my = (toScreenY(p1.y) + toScreenY(p2.y)) / 2;

            ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
            ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(mx - 22, my - 10, 44, 20, 4);
            ctx.fill();
            ctx.stroke();

            ctx.font = "bold 10px monospace";
            ctx.fillStyle = "#38bdf8";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(`${distM.toFixed(1)}m`, mx, my);
          }
        }

        // 4. Draw Obstacles
        currentObstacles.forEach((obs) => {
          const ow = (Number(obs.width) || 1.5) * scale;
          const ol = (Number(obs.length) || 1.5) * scale;
          const ox = toScreenX(obs.x || 0) - ow / 2;
          const oy = toScreenY(obs.y || 0) - ol / 2;
          ctx.fillStyle = "rgba(239, 68, 68, 0.35)";
          ctx.strokeStyle = "#ef4444";
          ctx.lineWidth = 2;
          ctx.fillRect(ox, oy, ow, ol);
          ctx.strokeRect(ox, oy, ow, ol);
          ctx.font = "9px system-ui";
          ctx.fillStyle = "#fca5a5";
          ctx.textAlign = "center";
          ctx.fillText(obs.name || "Obstacle", ox + ow / 2, oy + ol / 2);
        });

        // 5. Draw Solar PV Modules
        const pLenM = Number(panelSpecs?.length_m || 2.278);
        const pWidM = Number(panelSpecs?.width_m || 1.134);
        currentPanels.forEach((p) => {
          const isLandscape = p.orientation === "landscape";
          const pw = (isLandscape ? pLenM : pWidM) * scale;
          const ph = (isLandscape ? pWidM : pLenM) * scale;
          const px = toScreenX(p.x) - pw / 2;
          const py = toScreenY(p.y) - ph / 2;

          // Panel Glass (Deep Solar Blue gradient)
          const pGrad = ctx.createLinearGradient(px, py, px + pw, py + ph);
          pGrad.addColorStop(0, "#1d4ed8");
          pGrad.addColorStop(1, "#1e3a8a");
          ctx.fillStyle = pGrad;
          ctx.fillRect(px, py, pw, ph);

          // Anodized Aluminum Frame
          ctx.strokeStyle = "#cbd5e1";
          ctx.lineWidth = 1.2;
          ctx.strokeRect(px, py, pw, ph);

          // PV Cell Busbar Gridlines
          ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(px + pw / 2, py);
          ctx.lineTo(px + pw / 2, py + ph);
          ctx.moveTo(px, py + ph / 3);
          ctx.lineTo(px + pw, py + ph / 3);
          ctx.moveTo(px, py + (2 * ph) / 3);
          ctx.lineTo(px + pw, py + (2 * ph) / 3);
          ctx.stroke();
        });

        // 6. Header Annotation Banner
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
        ctx.fillRect(20, 16, 520, 52);
        ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
        ctx.strokeRect(20, 16, 520, 52);

        ctx.font = "bold 13px system-ui, sans-serif";
        ctx.fillStyle = "#ffffff";
        ctx.fillText("SOLARIX 2D ROOFTOP ARRAY LAYOUT & SITE PLAN", 32, 24);

        const pWatt = Number(panelSpecs?.wattage || 550);
        const totalKw = ((currentPanels.length * pWatt) / 1000).toFixed(2);
        const roofArea = poly && poly.length >= 3 ? Math.round(getCartesianPolygonArea(poly)) : 0;
        ctx.font = "11px system-ui, sans-serif";
        ctx.fillStyle = "#38bdf8";
        ctx.fillText(`${totalKw} kWp System · ${currentPanels.length} Modules (${pWatt}W) · Roof Area: ${roofArea} m²`, 32, 44);

        // 7. North Compass Rose
        const compassX = w - 50;
        const compassY = 45;
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 11px system-ui";
        ctx.textAlign = "center";
        ctx.fillText("N", compassX, compassY - 22);

        ctx.beginPath();
        ctx.moveTo(compassX, compassY - 18);
        ctx.lineTo(compassX - 6, compassY + 6);
        ctx.lineTo(compassX, compassY + 2);
        ctx.closePath();
        ctx.fillStyle = "#ef4444";
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(compassX, compassY - 18);
        ctx.lineTo(compassX + 6, compassY + 6);
        ctx.lineTo(compassX, compassY + 2);
        ctx.closePath();
        ctx.fillStyle = "#b91c1c";
        ctx.fill();

        // 8. Scale Indicator (Bottom Left)
        ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
        ctx.fillRect(20, h - 45, 130, 30);
        ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
        ctx.strokeRect(20, h - 45, 130, 30);

        const scaleBarM = 5;
        const scaleBarPx = scaleBarM * scale;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(30, h - 26);
        ctx.lineTo(30 + Math.min(100, scaleBarPx), h - 26);
        ctx.stroke();

        ctx.font = "bold 10px monospace";
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "left";
        ctx.fillText(`Scale: ${scaleBarM}m`, 30, h - 38);

        return canvas.toDataURL("image/png");
      } catch (e) {
        return null;
      }
    },
    panTo: (lat, lng) => {
      if (!isValidLatLng(lat, lng)) return;
      const map = mapInstanceRef.current;
      if (map) {
        const currentZoom = map.getZoom();
        map.setView([lat, lng], currentZoom, { animate: true });
        if (markerRef.current) markerRef.current.setLatLng([lat, lng]);
      }
    },
    resetMarkerTo: (lat, lng) => {
      const targetLat = Number(lat);
      const targetLng = Number(lng);
      if (markerRef.current && isValidLatLng(targetLat, targetLng)) {
        markerRef.current.setLatLng([targetLat, targetLng]);
      }
      setPendingMarkerLocation(null);
    },
    clearDrawState: () => {
      setActiveDrawPoints([]);
      setVertexHistory([]);
      setVertexRedoStack([]);
      setPendingMarkerLocation(null);
    },
    getCenter: () => {
      const map = mapInstanceRef.current;
      if (!map) return null;
      const c = map.getCenter();
      return isValidLatLng(c.lat, c.lng) ? { lat: c.lat, lng: c.lng } : null;
    },
    invalidateSize: () => {
      mapInstanceRef.current?.invalidateSize({ pan: false });
    },
  }));

  // Handle Add Panel click on map with canonical placement
  const handleMapClickForAddPanel = useCallback((lat, lng) => {
    if (!roofPolygonRef.current || roofPolygonRef.current.length < 3) {
      toast.warning("Please draw a roof boundary first before adding panels.");
      return;
    }
    if (!isValidLatLng(lat, lng)) return;

    const { x, y } = latLngToCartesian(lat, lng);

    const check = canFitAdditionalPanel({
      panels,
      roofPolygon: roofPolygonRef.current,
      setbackMeters,
      obstacles,
      walkways,
      panelSpecs,
      orientation,
      rowSpacingMeters,
      panelSpacingMeters,
      azimuthDegrees,
      nearX: x,
      nearY: y,
    });

    if (!check.canFit || !check.newPanel) {
      toast.warning(check.reason || "No valid panel position available in the current roof area.");
      return;
    }

    setPanels?.((prev) => [...prev, check.newPanel]);
    setSelectedPanelId?.(check.newPanel.id);
    toast.success(`Placed Panel #${panels.length + 1}`);
  }, [latLngToCartesian, orientation, panelSpecs, setbackMeters, rowSpacingMeters, panelSpacingMeters, panels, obstacles, walkways, azimuthDegrees, setPanels, setSelectedPanelId]);

  useEffect(() => {
    handleMapClickForAddPanelRef.current = handleMapClickForAddPanel;
    window.__handleSolarMapClickAddPanel = handleMapClickForAddPanel;
  }, [handleMapClickForAddPanel]);

  // ── Initialize Leaflet Map ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    try {
      if (mapContainerRef.current._leaflet_id) {
        delete mapContainerRef.current._leaflet_id;
      }
      const initialLat = Number(latitude) || 19.076;
      const initialLng = Number(longitude) || 72.8777;

      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom: Math.min(zoom || 19, 20),
        maxZoom: 20,
        minZoom: 4,
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        wheelPxPerZoomLevel: 90,
        wheelDebounceTime: 40,
        scrollWheelZoom: false, // Explicitly false so custom cursor-centered zoom handles wheel
        zoomControl: false,
        attributionControl: false,
        preferCanvas: false,
      });

      mapInstanceRef.current = map;

      map.on("zoomend", () => {
        const z = map.getZoom();
        onZoomChange?.(z);
      });

      tileLayerGroupRef.current = L.layerGroup().addTo(map);
      roofLayerGroupRef.current = L.layerGroup().addTo(map);
      obstaclesLayerGroupRef.current = L.layerGroup().addTo(map);
      panelsLayerGroupRef.current = L.layerGroup().addTo(map);

      // Site Location Marker with Confirmation on drag
      const centerMarker = L.marker([initialLat, initialLng], {
        draggable: true,
        title: "Solar Rooftop Site Location — Drag to adjust",
      }).addTo(map);

      centerMarker.on("dragend", () => {
        const pos = centerMarker.getLatLng();
        if (!isValidLatLng(pos.lat, pos.lng)) return;

        // Cancel any active drawing or editing mode cleanly
        const currentTool = activeToolRef.current ?? window.__activeSolarTool;
        if (currentTool === "draw_roof" || currentTool === "edit_roof") {
          setActiveDrawPoints([]);
          setActiveTool?.("select");
        }

        const currentRoof = roofPolygonRef.current;
        if (currentRoof && currentRoof.length >= 3) {
          // A roof geometry exists on this site: pass to parent controller to trigger confirmation flow
          if (onLocationChange) {
            onLocationChange({ latitude: pos.lat, longitude: pos.lng });
          }
        } else {
          setPendingMarkerLocation({ lat: pos.lat, lng: pos.lng });
          if (onLocationChange) {
            onLocationChange({ latitude: pos.lat, longitude: pos.lng });
          } else {
            toast.info("Site marker moved. Click 'Update Site Location' to confirm new coordinates.");
          }
        }
      });

      markerRef.current = centerMarker;

      map.on("mousemove", (e) => {
        if (isValidLatLng(e.latlng.lat, e.latlng.lng)) {
          cursorCoordsRef.current = { lat: e.latlng.lat, lng: e.latlng.lng };
          const container = mapContainerRef.current;
          if (container) {
            const rect = container.getBoundingClientRect();
            const sx = e.containerPoint ? e.containerPoint.x : ((e.originalEvent?.clientX ?? e.clientX ?? 0) - rect.left);
            const sy = e.containerPoint ? e.containerPoint.y : ((e.originalEvent?.clientY ?? e.clientY ?? 0) - rect.top);
            cursorScreenPosRef.current = { x: sx, y: sy };
          }
          if ((activeToolRef.current ?? window.__activeSolarTool) === "draw_roof") {
            if (!rafIdRef.current) {
              rafIdRef.current = requestAnimationFrame(updateMagnifierTransform);
            }
          }
        }
      });

      const syncMagnifierOnMapMove = () => {
        if ((activeToolRef.current ?? window.__activeSolarTool) === "draw_roof") {
          syncMagnifierTiles();
          if (!rafIdRef.current) {
            rafIdRef.current = requestAnimationFrame(updateMagnifierTransform);
          }
        }
      };

      map.on("move", syncMagnifierOnMapMove);
      map.on("zoom", syncMagnifierOnMapMove);
      map.on("zoomend", syncMagnifierOnMapMove);
      map.on("resize", syncMagnifierOnMapMove);

      const handleTouchStart = (e) => {
        if (e.touches && e.touches.length > 0) {
          const touch = e.touches[0];
          const container = mapContainerRef.current;
          if (container && mapInstanceRef.current) {
            const rect = container.getBoundingClientRect();
            const sx = touch.clientX - rect.left;
            const sy = touch.clientY - rect.top;
            cursorScreenPosRef.current = { x: sx, y: sy };
            const latlng = mapInstanceRef.current.containerPointToLatLng([sx, sy]);
            if (isValidLatLng(latlng.lat, latlng.lng)) {
              cursorCoordsRef.current = { lat: latlng.lat, lng: latlng.lng };
            }
            if ((activeToolRef.current ?? window.__activeSolarTool) === "draw_roof") {
              syncMagnifierTiles();
              if (!rafIdRef.current) {
                rafIdRef.current = requestAnimationFrame(updateMagnifierTransform);
              }
            }
          }
        }
      };

      const handleTouchMove = (e) => {
        if (e.touches && e.touches.length > 0) {
          const touch = e.touches[0];
          const container = mapContainerRef.current;
          if (container && mapInstanceRef.current) {
            const rect = container.getBoundingClientRect();
            const sx = touch.clientX - rect.left;
            const sy = touch.clientY - rect.top;
            cursorScreenPosRef.current = { x: sx, y: sy };
            const latlng = mapInstanceRef.current.containerPointToLatLng([sx, sy]);
            if (isValidLatLng(latlng.lat, latlng.lng)) {
              cursorCoordsRef.current = { lat: latlng.lat, lng: latlng.lng };
            }
            if ((activeToolRef.current ?? window.__activeSolarTool) === "draw_roof") {
              if (!rafIdRef.current) {
                rafIdRef.current = requestAnimationFrame(updateMagnifierTransform);
              }
            }
          }
        }
      };

      const handleTouchEnd = () => {
        cursorScreenPosRef.current = { x: -999, y: -999 };
        if (magnifierLensRef.current) {
          magnifierLensRef.current.style.display = "none";
        }
      };

      // TRUE Cursor-Centered Zoom Handler
      const handleMapWheel = (e) => {
        // Prevent default window scrolling when scrolling inside map
        e.preventDefault();
        e.stopPropagation();

        const map = mapInstanceRef.current;
        const container = mapContainerRef.current;
        if (!map || !container) return;

        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        if (mouseX < 0 || mouseX > rect.width || mouseY < 0 || mouseY > rect.height) {
          return;
        }

        const containerPoint = L.point(mouseX, mouseY);
        const currentZoom = map.getZoom();

        // Small incremental zoom steps for smooth, controlled zooming
        let zoomDelta = 0.5;
        if (Math.abs(e.deltaY) < 40) {
          // Trackpad pinch or fine wheel
          zoomDelta = Math.max(0.1, Math.min(0.25, Math.abs(e.deltaY) * 0.015));
        } else {
          // Standard mouse wheel
          zoomDelta = 0.5;
        }

        const direction = e.deltaY > 0 ? -1 : 1;
        const targetZoom = Math.max(4, Math.min(20, Math.round((currentZoom + direction * zoomDelta) * 20) / 20));

        if (targetZoom === currentZoom) return;

        // TRUE Cursor-Centered Zoom Mathematics:
        // 1. Capture exact geographic coordinate currently under mouse cursor
        const targetLatLng = map.containerPointToLatLng(containerPoint);

        // 2. Project targetLatLng to absolute world pixels at the NEW zoom
        const targetWorldPoint = map.project(targetLatLng, targetZoom);

        // 3. Container half-size
        const size = map.getSize();
        const halfSize = size.divideBy(2);

        // 4. Recalculate new map center in world pixels so targetWorldPoint remains at containerPoint
        const newCenterWorldPoint = targetWorldPoint.subtract(containerPoint).add(halfSize);

        // 5. Convert world center back to LatLng
        const newCenter = map.unproject(newCenterWorldPoint, targetZoom);

        // 6. Apply new center and zoom immediately without animation drift
        map.setView(newCenter, targetZoom, { animate: false });
        onZoomChange?.(targetZoom);

        // Sync precision magnifier if active
        // Removed secondary map manipulation
      };

      const domElem = mapContainerRef.current;
      domElem.addEventListener("touchstart", handleTouchStart, { passive: true });
      domElem.addEventListener("touchmove", handleTouchMove, { passive: true });
      domElem.addEventListener("touchend", handleTouchEnd, { passive: true });
      domElem.addEventListener("wheel", handleMapWheel, { passive: false });

      // Map Click Handler based on active tool
      map.on("click", (e) => {
        const { lat, lng } = e.latlng;
        if (!isValidLatLng(lat, lng)) return;

        const tool = activeToolRef.current ?? window.__activeSolarTool;
        if (tool === "draw_roof") {
          (handleMapClickRoofRef.current ?? window.__handleSolarMapClickRoof)?.(lat, lng);
        } else if (tool === "add_panel") {
          (handleMapClickForAddPanelRef.current ?? window.__handleSolarMapClickAddPanel)?.(lat, lng);
        } else if (tool === "calibrate") {
          setCalibratePoints((prev) => {
            const next = [...prev, { lat, lng }];
            if (next.length === 2) setShowCalibrateModal(true);
            return next;
          });
        } else if (tool === "select") {
          if (!roofPolygonRef.current || roofPolygonRef.current.length < 3) {
            toast.info("Click 'Mark Roof Boundary' above to trace your building roof corners.", { id: "roof-hint" });
          }
        }
      });

      map.on("tileerror", (e) => {
        // Silently suppress tile errors to prevent canvas crash
      });

      const resizeObserver = new ResizeObserver(() => {
        try {
          mapInstanceRef.current?.invalidateSize({ pan: false });
        } catch (err) {}
      });
      resizeObserver.observe(mapContainerRef.current);

      setMapError(null);

      return () => {
        domElem.removeEventListener("touchstart", handleTouchStart);
        domElem.removeEventListener("touchmove", handleTouchMove);
        domElem.removeEventListener("touchend", handleTouchEnd);
        domElem.removeEventListener("wheel", handleMapWheel);
        resizeObserver.disconnect();
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }
      };
    } catch (err) {
      console.error("Leaflet initialization failed", err);
      setMapError("Satellite map initialization failed: " + err.message);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Tile Layers with maxNativeZoom: 20 to prevent white-screen on deep zoom
  useEffect(() => {
    const tileGroup = tileLayerGroupRef.current;
    if (!tileGroup) return;
    tileGroup.clearLayers();

    if (mapType === "satellite") {
      const satLayer = L.tileLayer(
        "https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
        {
          maxZoom: 20,
          maxNativeZoom: 20,
          subdomains: ["0", "1", "2", "3"],
          keepBuffer: 6,
          errorTileUrl: "",
        }
      );
      
      let fallbackAdded = false;
      satLayer.on("tileerror", (e) => {
        console.error(`[Tile Error - Google] URL: ${e.tile?.src}, Zoom: ${mapInstanceRef.current?.getZoom()}, Center: ${JSON.stringify(mapInstanceRef.current?.getCenter())}`);
        
        // Fallback to ArcGIS if Google tiles ever encounter rate limits
        if (!fallbackAdded && tileGroup && mapInstanceRef.current) {
          fallbackAdded = true;
          console.warn("[Tile Fallback] Adding ArcGIS fallback layer due to Google tile failure.");
          const arcGisLayer = L.tileLayer(
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            { maxZoom: 20, maxNativeZoom: 18, keepBuffer: 6, errorTileUrl: "" }
          );
          arcGisLayer.on("tileerror", (e2) => {
            console.error(`[Tile Error - ArcGIS] URL: ${e2.tile?.src}, Zoom: ${mapInstanceRef.current?.getZoom()}`);
          });
          arcGisLayer.addTo(tileGroup);
        }
      });
      satLayer.addTo(tileGroup);
    } else if (mapType === "hybrid") {
      L.tileLayer(
        "https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
        {
          maxZoom: 20,
          maxNativeZoom: 20,
          subdomains: ["0", "1", "2", "3"],
          keepBuffer: 6,
          errorTileUrl: "",
        }
      ).addTo(tileGroup);
    } else {
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 20,
        maxNativeZoom: 19,
        subdomains: ["a", "b", "c"],
        keepBuffer: 6,
        errorTileUrl: "",
      }).addTo(tileGroup);
    }

    tileGroup.eachLayer((layer) => {
      layer.on("load", () => {
        if ((activeToolRef.current ?? window.__activeSolarTool) === "draw_roof") {
          syncMagnifierTiles();
        }
      });
    });
  }, [mapType, syncMagnifierTiles]);

  // Pan map when canonical location prop changes without resetting zoom
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!isValidLatLng(lat, lng)) return;

    const currentCenter = map.getCenter();
    const dist = Math.abs(currentCenter.lat - lat) + Math.abs(currentCenter.lng - lng);
    if (dist > 0.00002) {
      // Large moves should not use slow Leaflet pan animations to ensure instant tile fetch
      map.setView([lat, lng], map.getZoom(), { animate: dist < 0.01 });
      tileLayerGroupRef.current?.eachLayer((layer) => layer.redraw?.());
    }
    if (markerRef.current && !pendingMarkerLocation) {
      markerRef.current.setLatLng([lat, lng]);
    }
    originRef.current = { lat, lng };
  }, [latitude, longitude, pendingMarkerLocation]);

  // Ensure map size is accurately invalidated when switching back to 2D view
  useEffect(() => {
    if (activeTab === "2d" && mapInstanceRef.current) {
      const timer = setTimeout(() => {
        try {
          mapInstanceRef.current?.invalidateSize({ pan: false });
        } catch (err) {}
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeTab]);

  // Roof Drawing Actions
  const handleFinishDrawingRoof = useCallback(() => {
    if (activeDrawPoints.length < 3) {
      toast.warning("A roof boundary requires at least 3 points.");
      return;
    }

    const validPoints = activeDrawPoints.filter((p) => isValidLatLng(p.lat, p.lng));
    if (validPoints.length < 3) {
      toast.error("Invalid roof boundary. Please re-draw using valid map clicks.");
      return;
    }

    const origin = originRef.current;
    const baseLatRad = toRad(origin.lat);

    const cartesianPoints = validPoints.map((pt) => {
      const x = (toRad(pt.lng) - toRad(origin.lng)) * Math.cos(baseLatRad) * 6378137;
      const y = (toRad(pt.lat) - toRad(origin.lat)) * 6378137;
      return {
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100,
        lat: pt.lat,
        lng: pt.lng,
      };
    });

    const deduped = cartesianPoints.filter((p, i) => {
      if (i === 0) return true;
      const prev = cartesianPoints[i - 1];
      return !(Math.abs(p.x - prev.x) < 0.01 && Math.abs(p.y - prev.y) < 0.01);
    });

    if (deduped.length < 3) {
      toast.error("Roof has duplicate overlapping points. Please re-draw.");
      return;
    }

    pushVertexHistory(roofPolygonRef.current);
    setRoofPolygon(deduped);
    setActiveDrawPoints([]);
    setActiveTool("select");
    if (magnifierLensRef.current) {
      magnifierLensRef.current.style.display = "none";
    }
    toast.success(`Roof drawn: ${deduped.length} vertices. Click "Edit Roof" to adjust.`);
  }, [activeDrawPoints, pushVertexHistory, setRoofPolygon, setActiveTool]);

  const handleMapClickRoof = useCallback((lat, lng) => {
    if (!isValidLatLng(lat, lng)) return;

    // Check if user clicked near Point 1 when >= 3 points exist to close polygon
    if (activeDrawPoints.length >= 3 && mapInstanceRef.current) {
      const firstPt = activeDrawPoints[0];
      const clickPx = mapInstanceRef.current.latLngToContainerPoint([lat, lng]);
      const firstPx = mapInstanceRef.current.latLngToContainerPoint([firstPt.lat, firstPt.lng]);
      const distPx = Math.hypot(clickPx.x - firstPx.x, clickPx.y - firstPx.y);
      if (distPx < 20) {
        handleFinishDrawingRoof();
        return;
      }
    }

    const newPt = { lat, lng };
    setActiveDrawPoints((prev) => {
      if (prev.length > 0) {
        const last = prev[prev.length - 1];
        if (Math.abs(last.lat - newPt.lat) < 1e-7 && Math.abs(last.lng - newPt.lng) < 1e-7) {
          return prev;
        }
      }
      return [...prev, newPt];
    });
    toast.success(`Point ${activeDrawPoints.length + 1} marked`);
  }, [activeDrawPoints, handleFinishDrawingRoof]);

  useEffect(() => {
    handleMapClickRoofRef.current = handleMapClickRoof;
    window.__handleSolarMapClickRoof = handleMapClickRoof;
  }, [handleMapClickRoof]);

  const handleMarkFinderPoint = useCallback(() => {
    const coords = cursorCoordsRef.current;
    if (!coords || !isValidLatLng(coords.lat, coords.lng)) {
      toast.error("Move cursor over the map to mark a point.");
      return;
    }
    handleMapClickRoof(coords.lat, coords.lng);
  }, [handleMapClickRoof]);

  const handleUndoDrawPoint = useCallback(() => {
    setActiveDrawPoints((prev) => prev.slice(0, -1));
  }, []);

  const handleCancelDrawing = useCallback(() => {
    setActiveDrawPoints([]);
    setActiveTool("select");
    if (magnifierLensRef.current) {
      magnifierLensRef.current.style.display = "none";
    }
  }, [setActiveTool]);

  // Vertex Drag Handlers
  const handleVertexDrag = useCallback((vertexIdx, lat, lng) => {
    if (!isValidLatLng(lat, lng)) return;
    const origin = originRef.current;
    const baseLatRad = toRad(origin.lat);
    const x = (toRad(lng) - toRad(origin.lng)) * Math.cos(baseLatRad) * 6378137;
    const y = (toRad(lat) - toRad(origin.lat)) * 6378137;
    const updated = roofPolygonRef.current.map((pt, i) =>
      i === vertexIdx
        ? { ...pt, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, lat, lng }
        : pt
    );
    setRoofPolygonRef.current(updated);
  }, []);

  const handleDeleteVertex = useCallback((idx) => {
    const poly = roofPolygonRef.current;
    if (poly.length <= 3) {
      toast.warning("A roof requires at least 3 points.");
      return;
    }
    pushVertexHistory(poly);
    const updated = poly.filter((_, i) => i !== idx);
    setRoofPolygonRef.current(updated);
    toast.success(`Removed vertex P${idx + 1}`);
  }, [pushVertexHistory]);

  const handleInsertVertexOnEdge = useCallback((edgeIdx) => {
    const poly = roofPolygonRef.current;
    if (!poly || poly.length < 2) return;
    pushVertexHistory(poly);
    const j = (edgeIdx + 1) % poly.length;
    const a = poly[edgeIdx], b = poly[j];
    const midLat = (a.lat + b.lat) / 2;
    const midLng = (a.lng + b.lng) / 2;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const newPt = { x: midX, y: midY, lat: midLat, lng: midLng };
    const updated = [
      ...poly.slice(0, j),
      newPt,
      ...poly.slice(j),
    ];
    setRoofPolygonRef.current(updated);
    toast.success("Added vertex at edge midpoint.");
  }, [pushVertexHistory]);

  // Calibration
  const handleApplyCalibration = () => {
    if (calibratePoints.length < 2) return;
    const distGeodesic = getHaversineDistance(
      calibratePoints[0].lat, calibratePoints[0].lng,
      calibratePoints[1].lat, calibratePoints[1].lng
    );
    const targetMeters = parseFloat(calibrateDistanceInput) || 10;

    if (distGeodesic > 0 && targetMeters > 0) {
      const scaleFactor = targetMeters / distGeodesic;
      const rescaledRoof = (roofPolygon || []).map((p) => {
        const newX = Math.round(p.x * scaleFactor * 100) / 100;
        const newY = Math.round(p.y * scaleFactor * 100) / 100;
        const [newLat, newLng] = cartesianToLatLng(newX, newY);
        return {
          ...p,
          x: newX,
          y: newY,
          lat: newLat,
          lng: newLng,
        };
      });
      setRoofPolygon(rescaledRoof);
      if (onCalibrationComplete) onCalibrationComplete({ measuredMeters: distGeodesic, targetMeters, scaleFactor });
      toast.success(`Calibration applied: Scale Factor ${scaleFactor.toFixed(3)}x`);
    }

    setCalibratePoints([]);
    setShowCalibrateModal(false);
    setActiveTool("select");
  };

  // ── Map Overlays Rendering ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    const roofGroup = roofLayerGroupRef.current;
    const obsGroup = obstaclesLayerGroupRef.current;
    const panelGroup = panelsLayerGroupRef.current;
    if (!map || !roofGroup || !obsGroup || !panelGroup) return;

    roofGroup.clearLayers();
    obsGroup.clearLayers();
    panelGroup.clearLayers();
    vertexHandlesRef.current = [];

    // 1. In-progress drawing line & vertices
    if (activeDrawPoints.length > 0) {
      const latLngs = activeDrawPoints.map((p) => [p.lat, p.lng]);
      L.polyline(latLngs, { color: "#10b981", weight: 3, dashArray: "6, 6" }).addTo(roofGroup);

      // Compute adaptive label directions to prevent overlap across multiple points
      const pointScreenCoords = activeDrawPoints.map((p) => {
        if (mapInstanceRef.current) {
          try {
            return mapInstanceRef.current.latLngToContainerPoint([p.lat, p.lng]);
          } catch (e) {
            return { x: 0, y: 0 };
          }
        }
        return { x: 0, y: 0 };
      });

      activeDrawPoints.forEach((p, idx) => {
        const isFirst = idx === 0;
        const canClose = isFirst && activeDrawPoints.length >= 3;
        const cm = L.circleMarker([p.lat, p.lng], {
          radius: isFirst ? 8 : 6,
          fillColor: canClose ? "#10b981" : isFirst ? "#059669" : "#2563eb",
          fillOpacity: 1,
          color: "#ffffff",
          weight: isFirst ? 2.5 : 2,
        }).addTo(roofGroup);

        if (canClose) {
          cm.on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            handleFinishDrawingRoof();
          });
        }

        // Determine best label direction: top, right, bottom, left to avoid colliding with other points
        let bestDir = "top";
        let bestOffset = [0, -12];

        if (pointScreenCoords.length > 1) {
          const curr = pointScreenCoords[idx];
          const candidates = [
            { dir: "top", offset: [0, -12], testX: curr.x, testY: curr.y - 24 },
            { dir: "right", offset: [12, 0], testX: curr.x + 36, testY: curr.y },
            { dir: "bottom", offset: [0, 12], testX: curr.x, testY: curr.y + 24 },
            { dir: "left", offset: [-12, 0], testX: curr.x - 36, testY: curr.y },
          ];

          let maxMinDist = -1;
          for (const cand of candidates) {
            let minDistToOther = Infinity;
            for (let j = 0; j < pointScreenCoords.length; j++) {
              if (j === idx) continue;
              const other = pointScreenCoords[j];
              const d = Math.hypot(cand.testX - other.x, cand.testY - other.y);
              if (d < minDistToOther) minDistToOther = d;
            }
            if (minDistToOther > maxMinDist) {
              maxMinDist = minDistToOther;
              bestDir = cand.dir;
              bestOffset = cand.offset;
            }
          }
        }

        const labelContent = canClose
          ? `Point 1 (Close)`
          : `Point ${idx + 1}`;

        cm.bindTooltip(labelContent, {
          permanent: true,
          direction: bestDir,
          offset: L.point(bestOffset[0], bestOffset[1]),
          className: canClose
            ? "solarix-point-label solarix-point-label-close"
            : "solarix-point-label",
        });
      });
    }

    // 2. Committed Roof Polygon
    if (layers.roofBoundary && roofPolygon && roofPolygon.length >= 3) {
      const validPoly = roofPolygon.filter((p) => isValidLatLng(p.lat ?? 0, p.lng ?? 0) || isValidCartesian(p));

      const polyLatLngs = validPoly.map((p) => {
        if (isValidLatLng(p.lat, p.lng)) return [p.lat, p.lng];
        return cartesianToLatLng(p.x, p.y);
      });

      const polyLayer = L.polygon(polyLatLngs, {
        color: editingRoof ? "#f59e0b" : "#ef4444",
        weight: editingRoof ? 2.5 : 3,
        fillColor: editingRoof ? "#fbbf24" : "#ef4444",
        fillOpacity: editingRoof ? 0.18 : 0.22,
        dashArray: editingRoof ? "4, 4" : undefined,
      }).addTo(roofGroup);

      polyLayer.on("click", (e) => {
        if (editingRoof) {
          L.DomEvent.stopPropagation(e);
          const clickLL = e.latlng;
          const { x, y } = latLngToCartesian(clickLL.lat, clickLL.lng);
          const poly = roofPolygonRef.current;
          if (!poly || poly.length < 2) return;
          let minD = Infinity;
          let bestIdx = 0;
          for (let i = 0; i < poly.length; i++) {
            const j = (i + 1) % poly.length;
            const p1 = poly[i], p2 = poly[j];
            const l2 = (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
            let d = 0;
            if (l2 === 0) {
              d = Math.hypot(x - p1.x, y - p1.y);
            } else {
              let t = Math.max(0, Math.min(1, ((x - p1.x) * (p2.x - p1.x) + (y - p1.y) * (p2.y - p1.y)) / l2));
              d = Math.hypot(x - (p1.x + t * (p2.x - p1.x)), y - (p1.y + t * (p2.y - p1.y)));
            }
            if (d < minD) {
              minD = d;
              bestIdx = i;
            }
          }
          pushVertexHistory(poly);
          const insertIdx = (bestIdx + 1) % poly.length;
          const newPt = { x, y, lat: clickLL.lat, lng: clickLL.lng };
          const updated = [...poly.slice(0, insertIdx), newPt, ...poly.slice(insertIdx)];
          setRoofPolygonRef.current(updated);
          toast.success(`Added Point ${insertIdx + 1} on roof edge.`);
        }
      });

      polyLayer.on("dblclick", (e) => {
        L.DomEvent.stopPropagation(e);
        setActiveTool("edit_roof");
        toast.info("Roof editing enabled — drag any vertex P1..Pn to adjust.");
      });

      // Vertex markers
      validPoly.forEach((pt, idx) => {
        const latlng = isValidLatLng(pt.lat, pt.lng) ? [pt.lat, pt.lng] : cartesianToLatLng(pt.x, pt.y);

        if (editingRoof) {
          const handle = L.marker(latlng, {
            draggable: true,
            icon: L.divIcon({
              className: "",
              html: `<div style="width:20px;height:20px;border-radius:50%;background:#f59e0b;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;cursor:grab;font-size:9px;font-weight:bold;color:#1c1917;">${idx + 1}</div>`,
              iconSize: [20, 20],
              iconAnchor: [10, 10],
            }),
            zIndexOffset: 1000,
          }).addTo(roofGroup);

          handle.on("dragstart", (e) => {
            pushVertexHistory(roofPolygonRef.current);
            isDraggingVertexRef.current = true;
            syncMagnifierTiles();
          });

          handle.on("drag", (e) => {
            const { lat, lng } = e.target.getLatLng();
            handleVertexDrag(idx, lat, lng);
            if (isValidLatLng(lat, lng)) {
              cursorCoordsRef.current = { lat, lng };
              const container = mapContainerRef.current;
              if (container && mapInstanceRef.current) {
                const pt = mapInstanceRef.current.latLngToContainerPoint([lat, lng]);
                cursorScreenPosRef.current = { x: pt.x, y: pt.y };
                if (!rafIdRef.current) {
                  rafIdRef.current = requestAnimationFrame(updateMagnifierTransform);
                }
              }
            }
          });

          handle.on("dragend", (e) => {
            const { lat, lng } = e.target.getLatLng();
            handleVertexDrag(idx, lat, lng);
            isDraggingVertexRef.current = false;
            cursorScreenPosRef.current = { x: -999, y: -999 };
            if (magnifierLensRef.current) {
              magnifierLensRef.current.style.display = "none";
            }
          });

          handle.on("contextmenu", (e) => {
            L.DomEvent.stopPropagation(e);
            handleDeleteVertex(idx);
          });

          handle.bindTooltip(
            `<div style="font-size:10px;font-weight:bold">P${idx + 1} — drag to adjust<br>Right-click to delete</div>`,
            { direction: "top" }
          );
          vertexHandlesRef.current.push(handle);
        } else {
          const cm = L.circleMarker(latlng, {
            radius: 6,
            fillColor: "#ef4444",
            fillOpacity: 0.95,
            color: "#ffffff",
            weight: 2,
          }).addTo(roofGroup);
          cm.on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            setActiveTool("edit_roof");
            toast.info(`Editing roof vertices — drag P${idx + 1} to reposition.`);
          });
          cm.bindTooltip(`<b>P${idx + 1}</b> (click to edit)`, { permanent: false, direction: "top" });
        }
      });

      // Edge midpoint markers (for "Add Point" in edit mode)
      if (editingRoof) {
        for (let i = 0; i < validPoly.length; i++) {
          const j = (i + 1) % validPoly.length;
          const aLL = polyLatLngs[i];
          const bLL = polyLatLngs[j];
          const midLat = (aLL[0] + bLL[0]) / 2;
          const midLng = (aLL[1] + bLL[1]) / 2;
          const edgeIdx = i;

          const addBtn = L.marker([midLat, midLng], {
            icon: L.divIcon({
              className: "",
              html: `<div style="width:16px;height:16px;border-radius:50%;background:#0284c7;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.5);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;color:white;font-weight:bold;">+</div>`,
              iconSize: [16, 16],
              iconAnchor: [8, 8],
            }),
            interactive: true,
          }).addTo(roofGroup);

          addBtn.on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            handleInsertVertexOnEdge(edgeIdx);
          });
          addBtn.bindTooltip("Click to add vertex on this edge", { direction: "top" });
        }
      }

      // Segment dimension labels (always shown when dimensions layer is on)
      if (layers.dimensions) {
        for (let i = 0; i < roofPolygon.length; i++) {
          const j = (i + 1) % roofPolygon.length;
          const p1 = roofPolygon[i], p2 = roofPolygon[j];
          const lenM = Math.hypot(p2.x - p1.x, p2.y - p1.y);
          const midLatLng = p1.lat && p2.lat
            ? [(p1.lat + p2.lat) / 2, (p1.lng + p2.lng) / 2]
            : cartesianToLatLng((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
          const dimIcon = L.divIcon({
            className: "bg-white px-2 py-0.5 rounded-lg border border-slate-300 text-[10.5px] font-extrabold text-slate-900 shadow-md text-center select-none pointer-events-none whitespace-nowrap",
            html: `${lenM.toFixed(1)} m`,
            iconSize: [48, 20],
            iconAnchor: [24, 10],
          });
          L.marker(midLatLng, { icon: dimIcon, interactive: false }).addTo(roofGroup);
        }
      }

      // Setback clearance margin
      if (layers.setbacks && setbackMeters > 0 && !editingRoof) {
        try {
          const setbackPoly = computeSetbackPolygon(roofPolygon, setbackMeters);
          if (setbackPoly && setbackPoly.length >= 3) {
            const setbackLatLngs = setbackPoly.map((p) => {
              if (isValidLatLng(p.lat, p.lng)) return [p.lat, p.lng];
              return cartesianToLatLng(p.x, p.y);
            });
            L.polygon(setbackLatLngs, {
              color: "#dc2626", weight: 1.5, dashArray: "4, 4", fillOpacity: 0,
            }).addTo(roofGroup);
          }
        } catch (e) {}
      }
    }

    // 3. Obstacles
    if (layers.obstacles && Array.isArray(obstacles) && obstacles.length > 0) {
      obstacles.forEach((obs) => {
        if (!isValidCartesian(obs)) return;
        const ow = Number(obs.length || 1.8);
        const ol = Number(obs.width || 1.8);
        const corners = getRotatedRectCorners(obs.x, obs.y, ow, ol, obs.rotation || 0);
        const obsLatLngs = corners.map((c) => cartesianToLatLng(c.x, c.y));
        L.polygon(obsLatLngs, { color: "#dc2626", weight: 2, fillColor: "#ef4444", fillOpacity: 0.45 }).addTo(obsGroup);
        const centerLatLng = cartesianToLatLng(obs.x, obs.y);
        L.marker(centerLatLng, {
          icon: L.divIcon({
            className: "bg-red-800 text-white font-bold px-1.5 py-0.5 rounded text-[9px] shadow-sm select-none pointer-events-none whitespace-nowrap",
            html: `${obs.name || "Exclusion"} (${obs.height || 1.6}m)`,
            iconSize: [80, 16], iconAnchor: [40, 8],
          }),
        }).addTo(obsGroup);
      });
    }

    // 4. Solar Panels (with out-of-bounds safety indicator & micro-adjustment selection)
    if (layers.panels && Array.isArray(panels) && panels.length > 0) {
      const rowPanelsMap = new Map();
      panels.forEach((p) => {
        const rKey = p.row !== undefined && p.row !== null ? p.row : 0;
        if (!rowPanelsMap.has(rKey)) rowPanelsMap.set(rKey, []);
        rowPanelsMap.get(rKey).push(p);
      });

      panels.forEach((p, idx) => {
        if (p.hidden || !isValidCartesian(p)) return;
        const pRow = p.row !== undefined && p.row !== null ? p.row : 0;
        const rowPanels = rowPanelsMap.get(pRow) || [p];

        const isPanelSelected = activeSelectionMode === "panel" && p.id === activeSelectedPanelId;
        const isRowSelected = activeSelectionMode === "row" && activeSelectedRowIndex != null && pRow === activeSelectedRowIndex;
        const isRowHovered = activeSelectionMode === "row" && hoveredRowIndex != null && pRow === hoveredRowIndex && !isRowSelected;
        const isArraySelected = activeSelectionMode === "array";

        const isSelected = isPanelSelected || isRowSelected || isArraySelected;
        const isOutOfBounds = roofPolygon && roofPolygon.length >= 3 && !isPointInPolygon(p.x, p.y, roofPolygon);

        const corners = getRotatedRectCorners(p.x, p.y, p.width || 1.134, p.height || 2.278, p.rotation || 0);
        const pLatLngs = corners.map((c) => cartesianToLatLng(c.x, c.y));
        const centerLatLng = cartesianToLatLng(p.x, p.y);

        const strokeColor = isOutOfBounds
          ? "#ef4444"
          : isSelected
          ? "#fbbf24"
          : isRowHovered
          ? "#38bdf8"
          : "#93c5fd";

        const fillColor = isOutOfBounds
          ? "#b91c1c"
          : isSelected
          ? "#2563eb"
          : isRowHovered
          ? "#1e40af"
          : "#0a192f";

        const panelPoly = L.polygon(pLatLngs, {
          color: strokeColor,
          dashArray: isOutOfBounds ? "4, 4" : undefined,
          weight: isOutOfBounds ? 2.5 : isSelected ? 2.5 : isRowHovered ? 2 : 1,
          fillColor: fillColor,
          fillOpacity: isOutOfBounds ? 0.85 : isSelected ? 0.95 : isRowHovered ? 0.9 : 0.85,
        }).addTo(panelGroup);

        panelPoly.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          if (activeSelectionMode === "panel") {
            changeSelectedPanelId(p.id);
            changeSelectedRowIndex(null);
          } else if (activeSelectionMode === "row") {
            changeSelectedRowIndex(pRow);
            changeSelectedPanelId(null);
          } else if (activeSelectionMode === "array") {
            changeSelectedPanelId(null);
            changeSelectedRowIndex(null);
          }
        });

        panelPoly.on("mouseover", () => {
          if (activeSelectionMode === "row") {
            setHoveredRowIndex(pRow);
          }
        });

        panelPoly.on("mouseout", () => {
          if (activeSelectionMode === "row") {
            setHoveredRowIndex(null);
          }
        });

        if (activeSelectionMode === "row") {
          panelPoly.bindTooltip(
            `<div class="text-[10px] font-bold text-amber-300">Row ${Number(pRow) + 1}<br><span class="text-slate-300 text-[9px]">${rowPanels.length} Panels</span></div>`,
            { direction: "top", opacity: 0.95 }
          );
        } else if (isOutOfBounds) {
          panelPoly.bindTooltip(
            `<div class="text-[10px] font-bold text-amber-300">⚠ Panel #${idx + 1} is outside the roof boundary.<br>Click to reposition or delete.</div>`,
            { direction: "top" }
          );
        }

        if (isPanelSelected) {
          const moveHandle = L.marker(centerLatLng, {
            draggable: true,
            icon: L.divIcon({
              className: "bg-amber-400 text-slate-950 font-bold px-1.5 py-0.5 rounded-full shadow-lg border border-white text-[9px] cursor-move",
              html: "✛ Move",
              iconSize: [44, 18], iconAnchor: [22, 9],
            }),
          }).addTo(panelGroup);

          moveHandle.on("dragend", (e) => {
            const newPos = e.target.getLatLng();
            if (!isValidLatLng(newPos.lat, newPos.lng)) return;
            const { x: newX, y: newY } = latLngToCartesian(newPos.lat, newPos.lng);
            const validation = validatePanelPlacement({
              candidate: { x: newX, y: newY, width: p.width, height: p.height, rotation: p.rotation || 0 },
              roofPolygon,
              setbackMeters,
              panels,
              obstacles,
              walkways,
              excludePanelId: p.id,
            });
            if (validation.valid) {
              setPanels?.((prev) => prev.map((item) => item.id === p.id ? { ...item, x: newX, y: newY } : item));
              setHasManualAdjustments?.(true);
              toast.success(`Moved Panel #${idx + 1}`);
            } else {
              toast.warning(validation.reason || "Invalid position.");
              setPanels?.((prev) => [...prev]);
            }
          });
        } else if (!isRowSelected && !isArraySelected) {
          const numIcon = L.divIcon({
            className: "text-[8px] font-bold text-center text-blue-200 select-none pointer-events-none",
            html: `${idx + 1}`,
            iconSize: [16, 12], iconAnchor: [8, 6],
          });
          L.marker(centerLatLng, { icon: numIcon, interactive: false }).addTo(panelGroup);
        }
      });
    }
  }, [
    roofPolygon, panels, obstacles, walkways, setbackMeters,
    activeDrawPoints, layers, activeSelectedPanelId, activeSelectedRowIndex, activeSelectionMode, hoveredRowIndex, editingRoof,
    cartesianToLatLng, latLngToCartesian, handleVertexDrag, handleDeleteVertex,
    handleInsertVertexOnEdge, pushVertexHistory, changeSelectedPanelId, changeSelectedRowIndex, setPanels, setHasManualAdjustments,
    setActiveTool, handleFinishDrawingRoof, syncMagnifierTiles, updateMagnifierTransform
  ]);

  // Zoom & Fit Viewport Helpers
  const handleZoomIn = () => {
    const map = mapInstanceRef.current;
    if (map && map.getZoom() < 20) map.zoomIn();
  };
  const handleZoomOut = () => {
    const map = mapInstanceRef.current;
    if (map && map.getZoom() > 4) map.zoomOut();
  };

  const handleLocateCenter = useCallback(() => {
    const map = mapInstanceRef.current;
    if (map && isValidLatLng(Number(latitude), Number(longitude))) {
      const currentZoom = map.getZoom();
      map.setView([Number(latitude), Number(longitude)], currentZoom, { animate: true });
    }
  }, [latitude, longitude]);

  const handleFitRoof = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const poly = roofPolygonRef.current;
    if (!poly || poly.length < 3) {
      toast.info("Draw a roof boundary first to fit.");
      return;
    }
    const latLngs = poly.map((p) =>
      isValidLatLng(p.lat, p.lng) ? [p.lat, p.lng] : cartesianToLatLng(p.x, p.y)
    );
    const bounds = L.latLngBounds(latLngs);
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 20, animate: true });
  }, [cartesianToLatLng]);

  const handleFitDesign = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const allPts = [];
    const poly = roofPolygonRef.current;
    if (poly && poly.length >= 3) {
      poly.forEach((p) => {
        allPts.push(isValidLatLng(p.lat, p.lng) ? [p.lat, p.lng] : cartesianToLatLng(p.x, p.y));
      });
    }
    if (Array.isArray(panels) && panels.length > 0) {
      panels.forEach((p) => {
        if (!p.hidden && isValidCartesian(p)) {
          allPts.push(cartesianToLatLng(p.x, p.y));
        }
      });
    }
    if (Array.isArray(obstacles) && obstacles.length > 0) {
      obstacles.forEach((o) => {
        if (isValidCartesian(o)) {
          allPts.push(cartesianToLatLng(o.x, o.y));
        }
      });
    }
    if (allPts.length > 0) {
      const bounds = L.latLngBounds(allPts);
      map.fitBounds(bounds, { padding: [45, 45], maxZoom: 20, animate: true });
    } else {
      handleLocateCenter();
    }
  }, [cartesianToLatLng, panels, obstacles, handleLocateCenter]);

  // Capture Location callback
  const handleCaptureLocation = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const center = map.getCenter();
    if (!isValidLatLng(center.lat, center.lng)) {
      toast.error("Map center coordinates are invalid. Please pan to your site.");
      return;
    }
    // Deterministically cancel any in-progress drawing or editing
    if (activeTool === "draw_roof" || activeTool === "edit_roof") {
      setActiveDrawPoints([]);
      setActiveTool?.("select");
    }
    if (markerRef.current) {
      markerRef.current.setLatLng([center.lat, center.lng]);
    }
    setCapturedCoords({ lat: center.lat, lng: center.lng });
    setLocationCaptured(true);
    setPendingMarkerLocation(null);
    if (onCaptureLocation) {
      onCaptureLocation({ lat: center.lat, lng: center.lng });
    } else if (onLocationChange) {
      onLocationChange({ latitude: center.lat, longitude: center.lng });
    }
  }, [activeTool, setActiveTool, onCaptureLocation, onLocationChange]);

  const hasRoof = roofPolygon && roofPolygon.length >= 3;

  return (
    <div className="relative w-full h-full min-h-[580px] rounded-2xl overflow-hidden bg-slate-950 border border-slate-700 shadow-xl select-none flex flex-col">
      {/* Scoped CSS rule ensuring magnifier lens never intercepts mouse events, crosshair cursor is applied reliably, and tile images inside magnifier are positioned and visible */}
      <style dangerouslySetInnerHTML={{ __html: `
        .magnifier-lens-wrapper, .magnifier-lens-wrapper * {
          pointer-events: none !important;
          user-select: none !important;
        }
        .drawing-roof-cursor, .drawing-roof-cursor * {
          cursor: crosshair !important;
        }
        .magnifier-lens-wrapper .leaflet-pane,
        .magnifier-lens-wrapper .leaflet-tile-pane,
        .magnifier-lens-wrapper .leaflet-layer,
        .magnifier-lens-wrapper .leaflet-tile-container,
        .magnifier-lens-wrapper .leaflet-tile {
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          visibility: visible !important;
          opacity: 1 !important;
        }
        .magnifier-lens-wrapper img {
          max-width: none !important;
          max-height: none !important;
          min-width: 256px !important;
          min-height: 256px !important;
          width: 256px !important;
          height: 256px !important;
        }
        .solarix-point-label {
          background-color: rgba(255, 255, 255, 0.96) !important;
          color: #0f172a !important;
          font-family: inherit !important;
          font-weight: 700 !important;
          font-size: 11px !important;
          line-height: 1.2 !important;
          padding: 3px 8px !important;
          border-radius: 6px !important;
          border: 1px solid rgba(148, 163, 184, 0.5) !important;
          box-shadow: 0 3px 8px rgba(0, 0, 0, 0.22), 0 1px 2px rgba(0, 0, 0, 0.1) !important;
          white-space: nowrap !important;
          pointer-events: none !important;
        }
        .solarix-point-label-close {
          background-color: #059669 !important;
          color: #ffffff !important;
          border: 1px solid #10b981 !important;
        }
        .solarix-point-label::before {
          border-top-color: rgba(255, 255, 255, 0.96) !important;
        }
        .solarix-point-label-close::before {
          border-top-color: #059669 !important;
        }
      ` }} />

      <div
        className={`w-full h-full flex-1 z-0 relative bg-slate-950 ${
          activeTool === "draw_roof" ? "drawing-roof-cursor" : "cursor-grab"
        }`}
        onMouseEnter={() => {
          if (activeTool === "draw_roof") syncMagnifierTiles();
        }}
        onMouseMove={(e) => {
          if (activeTool === "draw_roof") {
            const container = mapContainerRef.current;
            if (container) {
              const rect = container.getBoundingClientRect();
              const sx = e.clientX - rect.left;
              const sy = e.clientY - rect.top;
              cursorScreenPosRef.current = { x: sx, y: sy };
              
              // Keep cursor geographic coordinate synchronized from container point
              if (mapInstanceRef.current) {
                try {
                  const latlng = mapInstanceRef.current.containerPointToLatLng([sx, sy]);
                  if (isValidLatLng(latlng.lat, latlng.lng)) {
                    cursorCoordsRef.current = { lat: latlng.lat, lng: latlng.lng };
                  }
                } catch (err) {}
              }

              if (!rafIdRef.current) {
                rafIdRef.current = requestAnimationFrame(updateMagnifierTransform);
              }
            }
          }
        }}
        onMouseLeave={() => {
          cursorScreenPosRef.current = { x: -999, y: -999 };
          if (magnifierLensRef.current) {
            magnifierLensRef.current.style.display = "none";
          }
          if (targetReticleRef.current) {
            targetReticleRef.current.style.display = "none";
          }
          if (connectorSvgRef.current) {
            connectorSvgRef.current.style.display = "none";
          }
          if (rafIdRef.current) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
          }
        }}
      >
        <div
          ref={mapContainerRef}
          className="w-full h-full leaflet-container"
          style={{ width: "100%", height: "100%", position: "relative" }}
        />

        {/* Visual Connector Line between Cursor Target and Magnifier Lens */}
        <svg
          ref={connectorSvgRef}
          id="magnifier-connector-svg"
          className="absolute inset-0 w-full h-full pointer-events-none z-[498]"
          style={{ display: "none", width: "100%", height: "100%" }}
        >
          <line
            ref={connectorLineRef}
            stroke="#10b981"
            strokeWidth="1.5"
            strokeDasharray="3, 3"
            opacity="0.8"
          />
        </svg>

        {/* Under-Cursor Target Indicator (The EXACT geographic target under mouse) */}
        <div
          ref={targetReticleRef}
          id="magnifier-cursor-target"
          style={{
            display: "none",
            position: "absolute",
            left: 0,
            top: 0,
            width: "16px",
            height: "16px",
            marginLeft: "-8px",
            marginTop: "-8px",
            zIndex: 499,
            pointerEvents: "none",
            willChange: "transform",
          }}
          className="pointer-events-none select-none"
        >
          <div className="relative w-full h-full flex items-center justify-center pointer-events-none">
            <div className="absolute w-3 h-3 rounded-full border border-emerald-400 bg-emerald-500/25 shadow-sm pointer-events-none" />
            <div className="absolute w-[1.5px] h-4 bg-emerald-400 pointer-events-none" />
            <div className="absolute h-[1.5px] w-4 bg-emerald-400 pointer-events-none" />
            <div className="w-1 h-1 rounded-full bg-emerald-300 shadow pointer-events-none" />
          </div>
        </div>

        {/* Precision Magnifier Lens (Compact 120px circular lens, clean satellite visual overlay) */}
        <div
          ref={magnifierLensRef}
          id="magnifier-lens-root"
          style={{
            display: "none",
            position: "absolute",
            left: 0,
            top: 0,
            width: `${MAGNIFIER_SIZE}px`,
            height: `${MAGNIFIER_SIZE}px`,
            zIndex: 500,
            pointerEvents: "none",
            borderRadius: "50%",
            border: "2px solid #ffffff",
            boxShadow: "0 10px 30px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.4)",
            overflow: "hidden",
            backgroundColor: "#070d1e",
            willChange: "transform",
          }}
          className="magnifier-lens-wrapper select-none pointer-events-none [&_*]:!pointer-events-none"
        >
          {/* Magnified Map Imagery Viewport */}
          <div
            ref={magnifierContentRef}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              transformOrigin: "0 0",
              pointerEvents: "none",
              willChange: "transform",
            }}
            className="pointer-events-none [&_*]:!pointer-events-none"
          >
            <div
              ref={magnifierPaneRef}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                pointerEvents: "none",
              }}
            />
          </div>

          {/* Subtle Small Center Marker (No large lines across the circle) */}
          <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center [&_*]:!pointer-events-none">
            <div className="relative w-4 h-4 flex items-center justify-center pointer-events-none">
              <div className="absolute top-0 w-[1px] h-1 bg-amber-400 pointer-events-none" />
              <div className="absolute bottom-0 w-[1px] h-1 bg-amber-400 pointer-events-none" />
              <div className="absolute left-0 h-[1px] w-1 bg-amber-400 pointer-events-none" />
              <div className="absolute right-0 h-[1px] w-1 bg-amber-400 pointer-events-none" />
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 border border-black/70 shadow-sm pointer-events-none" />
            </div>

            {/* Compact Zoom Badge */}
            <div
              id="magnifier-zoom-badge"
              className="absolute bottom-1.5 bg-slate-950/85 border border-slate-700/70 text-[8.5px] font-bold text-amber-300 px-1.5 py-0.5 rounded shadow pointer-events-none tracking-wide"
            >
              {magnifierZoom}×
            </div>
          </div>
        </div>
      </div>

      {/* Map error overlay */}
      {mapError && (
        <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-white z-50">
          <AlertTriangle className="w-12 h-12 text-amber-400 mb-3" />
          <h3 className="text-lg font-bold">Satellite Map Notice</h3>
          <p className="text-xs text-slate-300 max-w-md my-2">{mapError}</p>
          <Button
            onClick={() => { setMapError(null); setMapType("street"); }}
            className="bg-blue-600 hover:bg-blue-700 text-xs font-semibold px-4 py-2 mt-3 rounded-xl"
          >
            Continue with Street Map
          </Button>
        </div>
      )}

      {/* Location Move Confirmation Banner */}
      {pendingMarkerLocation && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 bg-slate-900/98 backdrop-blur-md px-4 py-2 rounded-xl border border-amber-500 shadow-2xl flex items-center gap-3 text-xs pointer-events-auto animate-in fade-in">
          <MapPin className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="text-slate-200">
            Location pin moved to <span className="font-mono text-amber-300 font-bold">{pendingMarkerLocation.lat.toFixed(5)}, {pendingMarkerLocation.lng.toFixed(5)}</span>
          </div>
          <div className="flex items-center gap-1.5 ml-2">
            <Button
              size="sm"
              onClick={() => {
                if (onLocationChange) {
                  onLocationChange({ latitude: pendingMarkerLocation.lat, longitude: pendingMarkerLocation.lng });
                }
                setPendingMarkerLocation(null);
                toast.success("Site location updated!");
              }}
              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 rounded-lg"
            >
              Update Site Location
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (markerRef.current) {
                  markerRef.current.setLatLng([originLat, originLng]);
                }
                setPendingMarkerLocation(null);
              }}
              className="h-7 text-xs text-slate-400 hover:text-white px-2 rounded-lg"
            >
              Reset
            </Button>
          </div>
        </div>
      )}

      {/* Out-of-bounds panels notification banner */}
      {outOfBoundsPanels.length > 0 && !editingRoof && (
        <div className="absolute top-14 right-3 z-20 bg-amber-950/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-amber-500 shadow-xl flex items-center gap-2 text-xs text-amber-200 pointer-events-auto animate-in fade-in">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>{outOfBoundsPanels.length} panel(s) outside roof</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleRemoveOutOfBoundsPanels}
            className="h-6 px-2 text-[10px] bg-red-900/60 hover:bg-red-800 text-red-200 rounded font-bold"
          >
            Remove Invalid
          </Button>
        </div>
      )}

      {/* ── 1. TOP-LEFT: FLOATING SITE SEARCH PILL & CAPTURE PIN ────────────────── */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-2 pointer-events-auto">
        <div className="relative flex items-center bg-slate-900/95 border border-slate-700/80 rounded-xl px-2.5 py-1.5 shadow-xl text-xs text-white min-w-[260px] max-w-[340px]">
          <Search className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery?.(e.target.value)}
            placeholder={formattedAddress || "Search location, address or coordinates..."}
            className="bg-transparent border-none outline-none text-white text-xs w-full placeholder:text-slate-400 font-medium truncate"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery?.("")} className="text-slate-400 hover:text-white ml-1 p-0.5">
              <X className="w-3 h-3" />
            </button>
          )}
          {searching && <RefreshCw className="w-3 h-3 text-blue-400 animate-spin ml-1 shrink-0" />}

          {/* Autocomplete Predictions Dropdown */}
          {searchPredictions && searchPredictions.length > 0 && (
            <div className="absolute top-10 left-0 right-0 z-50 bg-slate-900/98 border border-slate-700 rounded-xl shadow-2xl max-h-56 overflow-y-auto divide-y divide-slate-800">
              {searchPredictions.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => onSelectPrediction?.(p)}
                  className="w-full text-left px-3 py-2 hover:bg-blue-900/40 text-xs transition block"
                >
                  <div className="font-bold text-white truncate">{p.name}</div>
                  <div className="text-[10px] text-slate-400 truncate">{p.secondary || p.description}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Capture Location Button matching Reference [📍] */}
        <button
          onClick={handleCaptureLocation}
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition shadow-xl border cursor-pointer ${
            locationCaptured
              ? "bg-blue-600 text-white border-blue-500 hover:bg-blue-700"
              : "bg-blue-600 hover:bg-blue-700 text-white border-blue-500"
          }`}
          title="Capture Site Location (Locks geographic coordinates)"
        >
          <MapPin className="w-4 h-4" />
        </button>
      </div>

      {/* ── 2. TOP-CENTER: 2D/3D TOGGLE & FLOATING ACTION TOOLBAR ─────────────── */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 pointer-events-auto">
        {/* Segmented [ 2D | 3D ] Toggle matching Reference */}
        <div className="flex items-center bg-slate-900/95 border border-slate-700/80 rounded-xl p-0.5 shadow-xl">
          <button
            onClick={() => setActiveTab?.("2d")}
            className={`h-7 px-3.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              activeTab === "2d" ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
            }`}
          >
            2D
          </button>
          <button
            onClick={() => setActiveTab?.("3d")}
            className={`h-7 px-3.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              activeTab === "3d" ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
            }`}
          >
            3D
          </button>
        </div>

        {/* Floating Action Tools Bar matching Reference */}
        <div className="flex items-center gap-1 bg-slate-900/95 border border-slate-700/80 rounded-xl p-1 shadow-xl text-xs text-white">
          {/* Active Tool / In-progress context switch */}
          {activeTool === "draw_roof" ? (
            <div className="flex items-center gap-1.5 px-1 text-xs">
              {/* Point Index Pill */}
              <span className="bg-emerald-600 text-white text-[11px] font-extrabold px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-200 animate-ping" />
                Pt {activeDrawPoints.length + 1}
              </span>

              {/* Status Hint */}
              <span className="text-slate-300 text-xs px-1 hidden sm:inline-block">
                {activeDrawPoints.length === 0
                  ? "Click map to mark 1st corner"
                  : activeDrawPoints.length < 3
                  ? "Click next corner"
                  : "Click corners or Pt 1 to close"}
              </span>

              <div className="h-4 w-[1px] bg-slate-700 mx-0.5 hidden sm:block" />

              {/* PRIMARY ACTION: Mark Point */}
              <button
                type="button"
                onClick={handleMarkFinderPoint}
                className="h-7 px-2.5 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-extrabold flex items-center gap-1.5 shadow-md transition cursor-pointer"
                title="Mark point at cursor or click directly on map"
              >
                <Target className="w-3.5 h-3.5 text-emerald-100" />
                <span>Mark Point</span>
              </button>

              {/* Compact Zoom Selector (0.5×, 1×, 2×, 3×, 4× with 2× default) */}
              <div className="flex items-center gap-1 px-1.5 h-7 bg-slate-800/90 border border-slate-700/80 rounded-lg">
                <span className="text-[10.5px] text-slate-400 font-semibold">Zoom:</span>
                <select
                  id="magnifier-zoom-select"
                  value={magnifierZoom}
                  onChange={(e) => {
                    const z = parseFloat(e.target.value);
                    setMagnifierZoom(z);
                    magnifierZoomRef.current = z;
                    if (updateMagnifierTransformRef.current) {
                      updateMagnifierTransformRef.current();
                    }
                  }}
                  className="bg-transparent text-amber-300 text-xs font-bold cursor-pointer outline-none"
                  title="Magnifier Zoom Multiplier"
                >
                  <option value={0.5} className="bg-slate-900 text-white">0.5×</option>
                  <option value={1} className="bg-slate-900 text-white">1×</option>
                  <option value={2} className="bg-slate-900 text-white">2×</option>
                  <option value={3} className="bg-slate-900 text-white">3×</option>
                  <option value={4} className="bg-slate-900 text-white">4×</option>
                </select>
              </div>

              {/* Lens Position Presets & Nudge Controls */}
              <div className="flex items-center gap-1 px-1.5 h-7 bg-slate-800/90 border border-slate-700/80 rounded-lg">
                <span className="text-[10.5px] text-slate-400 font-semibold">Lens:</span>
                <select
                  id="magnifier-pos-select"
                  value={`${magnifierOffset.x},${magnifierOffset.y}`}
                  onChange={(e) => {
                    const parts = e.target.value.split(",").map(Number);
                    const next = { x: parts[0], y: parts[1] };
                    setMagnifierOffset(next);
                    magnifierOffsetRef.current = next;
                    updateMagnifierTransformRef.current?.();
                  }}
                  className="bg-transparent text-emerald-300 text-xs font-bold cursor-pointer outline-none"
                  title="Magnifier lens position relative to cursor"
                >
                  <option value="24,-144" className="bg-slate-900 text-white">↗ Top-Right</option>
                  <option value="-144,-144" className="bg-slate-900 text-white">↖ Top-Left</option>
                  <option value="-60,-150" className="bg-slate-900 text-white">↑ Above</option>
                  <option value="24,24" className="bg-slate-900 text-white">↘ Bottom-Right</option>
                  <option value="-144,24" className="bg-slate-900 text-white">↙ Bottom-Left</option>
                </select>

                {/* Nudge Buttons */}
                <div className="flex items-center gap-0.5 pl-1 border-l border-slate-700">
                  <button
                    type="button"
                    onClick={() => {
                      const next = { ...magnifierOffsetRef.current, y: magnifierOffsetRef.current.y - 25 };
                      setMagnifierOffset(next);
                      magnifierOffsetRef.current = next;
                      updateMagnifierTransformRef.current?.();
                    }}
                    className="w-4 h-4 rounded hover:bg-slate-700 flex items-center justify-center text-[9px] text-slate-300 hover:text-white"
                    title="Nudge magnifier UP"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = { ...magnifierOffsetRef.current, y: magnifierOffsetRef.current.y + 25 };
                      setMagnifierOffset(next);
                      magnifierOffsetRef.current = next;
                      updateMagnifierTransformRef.current?.();
                    }}
                    className="w-4 h-4 rounded hover:bg-slate-700 flex items-center justify-center text-[9px] text-slate-300 hover:text-white"
                    title="Nudge magnifier DOWN"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = { ...magnifierOffsetRef.current, x: magnifierOffsetRef.current.x - 25 };
                      setMagnifierOffset(next);
                      magnifierOffsetRef.current = next;
                      updateMagnifierTransformRef.current?.();
                    }}
                    className="w-4 h-4 rounded hover:bg-slate-700 flex items-center justify-center text-[9px] text-slate-300 hover:text-white"
                    title="Nudge magnifier LEFT"
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = { ...magnifierOffsetRef.current, x: magnifierOffsetRef.current.x + 25 };
                      setMagnifierOffset(next);
                      magnifierOffsetRef.current = next;
                      updateMagnifierTransformRef.current?.();
                    }}
                    className="w-4 h-4 rounded hover:bg-slate-700 flex items-center justify-center text-[9px] text-slate-300 hover:text-white"
                    title="Nudge magnifier RIGHT"
                  >
                    ▶
                  </button>
                </div>
              </div>

              {/* Undo Button */}
              <button
                type="button"
                onClick={handleUndoDrawPoint}
                disabled={activeDrawPoints.length === 0}
                className="h-7 px-2 text-[11px] rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent flex items-center gap-1 transition cursor-pointer"
                title="Undo last marked point"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>Undo</span>
              </button>

              {/* Finish Roof (Available when >= 3 points marked) */}
              {activeDrawPoints.length >= 3 && (
                <button
                  type="button"
                  onClick={handleFinishDrawingRoof}
                  className="h-7 px-2.5 text-[11px] rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold flex items-center gap-1.5 shadow-md transition cursor-pointer animate-pulse"
                  title="Complete and close roof polygon"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-100" />
                  <span>Finish Roof ({activeDrawPoints.length} pts)</span>
                </button>
              )}

              {/* Cancel Button */}
              <button
                type="button"
                onClick={handleCancelDrawing}
                className="h-7 px-2 text-[11px] rounded-lg text-red-400 hover:text-red-300 hover:bg-red-950/50 flex items-center gap-1 transition cursor-pointer"
                title="Cancel roof drawing"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
            </div>
          ) : activeTool === "edit_roof" ? (
            <div className="flex items-center gap-1">
              <span className="bg-amber-600 text-white text-[10px] font-bold px-2 py-1 rounded-lg">
                Editing ({roofPolygon.length} pts)
              </span>
              <button
                onClick={() => toast.info("Click anywhere on a roof edge or click any '+' marker to insert a vertex.")}
                className="h-7 px-2 text-[11px] rounded-lg text-sky-300 hover:text-white bg-sky-950/60 border border-sky-800/60 flex items-center gap-1"
                title="Click roof edge to insert point"
              >
                <Plus className="w-3.5 h-3.5" /> Add Point
              </button>
              <button
                onClick={() => toast.info("Right-click any vertex marker P1..Pn to delete it (minimum 3 points required).")}
                className="h-7 px-2 text-[11px] rounded-lg text-red-300 hover:text-white bg-red-950/40 border border-red-800/50 flex items-center gap-1"
                title="Right-click any vertex to delete"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Point
              </button>
              <button
                onClick={handleUndoVertex}
                disabled={vertexHistory.length === 0}
                className="h-7 px-2 text-[11px] rounded-lg text-slate-300 hover:text-white disabled:opacity-30 flex items-center gap-1 hover:bg-slate-800"
              >
                <Undo2 className="w-3.5 h-3.5" /> Undo
              </button>
              <button
                onClick={handleRedoVertex}
                disabled={vertexRedoStack.length === 0}
                className="h-7 px-2 text-[11px] rounded-lg text-slate-300 hover:text-white disabled:opacity-30 flex items-center gap-1 hover:bg-slate-800"
              >
                <Redo2 className="w-3.5 h-3.5" /> Redo
              </button>
              <button
                onClick={() => setActiveTool("select")}
                className="h-7 px-3 text-[11px] rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold flex items-center gap-1 shadow-sm"
              >
                <CheckSquare className="w-3.5 h-3.5" /> Done
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center bg-slate-800/90 border border-slate-700/80 rounded-lg p-0.5">
                <button
                  onClick={() => { setActiveTool("select"); setActiveDrawPoints([]); }}
                  className={`h-6 px-2 rounded-md font-semibold flex items-center gap-1 transition cursor-pointer ${
                    activeTool === "select" ? "bg-blue-600 text-white shadow-sm" : "text-slate-300 hover:text-white"
                  }`}
                  title="Select & Inspect"
                >
                  <MousePointer className="w-3 h-3" />
                  <span className="text-[11px]">Select</span>
                </button>
                {panels.length > 0 && activeTool === "select" && (
                  <select
                    id="map-selection-mode-select"
                    value={activeSelectionMode}
                    onChange={(e) => {
                      changeSelectionMode(e.target.value);
                      if (e.target.value === "panel") changeSelectedRowIndex(null);
                      if (e.target.value === "row") changeSelectedPanelId(null);
                    }}
                    className="bg-transparent text-amber-300 font-bold text-[10.5px] px-1 py-0.5 outline-none cursor-pointer border-l border-slate-700 ml-0.5"
                    title="Selection Target (Panel, Row, Array)"
                  >
                    <option value="panel" className="bg-slate-900 text-white">Panel</option>
                    <option value="row" className="bg-slate-900 text-white">Row</option>
                    <option value="array" className="bg-slate-900 text-white">Array</option>
                  </select>
                )}
              </div>

              <button
                onClick={() => { setActiveTool("draw_roof"); setActiveDrawPoints([]); }}
                className={`h-7 px-2.5 rounded-lg font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  activeTool === "draw_roof" ? "bg-blue-600 text-white shadow-sm" : "text-slate-300 hover:text-white hover:bg-slate-800"
                }`}
                title="Mark Roof Boundary (Trace rooftop perimeter)"
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>Mark Roof Boundary</span>
              </button>

              <button
                onClick={() => { setActiveTool("edit_roof"); setActiveDrawPoints([]); }}
                disabled={!hasRoof}
                className={`h-7 px-2.5 rounded-lg font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 ${
                  activeTool === "edit_roof" ? "bg-blue-600 text-white shadow-sm" : "text-slate-300 hover:text-white hover:bg-slate-800"
                }`}
                title="Drag vertices or add points"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Points</span>
              </button>

              <button
                onClick={() => {
                  if (onAddPanel) {
                    onAddPanel();
                  } else {
                    setActiveTool(activeTool === "add_panel" ? "select" : "add_panel");
                    setActiveDrawPoints([]);
                  }
                }}
                className={`h-7 px-2.5 rounded-lg font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  activeTool === "add_panel" ? "bg-blue-600 text-white shadow-sm" : "text-slate-300 hover:text-white hover:bg-slate-800"
                }`}
                title="Add panel following row/column layout rules"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Panel</span>
              </button>

              <button
                onClick={() => {
                  if (selectedPanelId) {
                    toast.info("Drag panel move handle to reposition");
                  } else {
                    toast.info("Click any panel to select and move it");
                  }
                }}
                className={`h-7 px-2.5 rounded-lg font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  selectedPanelId ? "text-amber-300 bg-slate-800" : "text-slate-300 hover:text-white hover:bg-slate-800"
                }`}
                title="Move Panel"
              >
                <Navigation className="w-3.5 h-3.5" />
                <span>Move</span>
              </button>

              <button
                onClick={() => {
                  if (selectedPanelId) {
                    setPanels?.((prev) => prev.map((p) => p.id === selectedPanelId ? { ...p, rotation: (p.rotation || 0) + 15 } : p));
                    toast.success("Rotated panel +15°");
                  } else {
                    toast.info("Select a panel first to rotate");
                  }
                }}
                className="h-7 px-2.5 rounded-lg font-semibold flex items-center gap-1.5 text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                title="Rotate Selected Panel"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Rotate</span>
              </button>

              <button
                onClick={() => {
                  if (selectedPanelId) {
                    setPanels?.((prev) => prev.filter((p) => p.id !== selectedPanelId));
                    setSelectedPanelId?.(null);
                    toast.success("Panel deleted");
                  } else if (hasRoof && window.confirm("Clear roof and panels?")) {
                    pushVertexHistory(roofPolygonRef.current);
                    setRoofPolygon([]);
                    setPanels?.([]);
                    toast.success("Roof cleared");
                  }
                }}
                className="h-7 px-2 rounded-lg font-semibold flex items-center gap-1 text-red-400 hover:text-red-300 hover:bg-red-950/50 transition cursor-pointer"
                title="Delete Selected or Clear Roof"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>

              <button
                onClick={() => { setActiveTool("calibrate"); setCalibratePoints([]); }}
                className={`h-7 px-2 rounded-lg font-semibold flex items-center gap-1 transition cursor-pointer ${
                  activeTool === "calibrate" ? "bg-purple-600 text-white" : "text-purple-400 hover:text-purple-300 hover:bg-slate-800"
                }`}
                title="Measure distance & calibrate map scale"
              >
                <Ruler className="w-3 h-3" />
                <span className="text-[10.5px]">Calibrate</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── 3. LEFT VERTICAL CONTROLS: RECENTER, ZOOM, FIT, FULLSCREEN ───────── */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1.5 bg-slate-900/95 border border-slate-700/80 rounded-xl p-1 shadow-xl pointer-events-auto">
        <button
          onClick={handleLocateCenter}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          title="Recenter on site coordinates"
        >
          <Navigation className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleZoomIn}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 transition font-bold text-sm cursor-pointer"
          title="Zoom In (+)"
        >
          +
        </button>
        <button
          onClick={handleZoomOut}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 transition font-bold text-sm cursor-pointer"
          title="Zoom Out (−)"
        >
          −
        </button>
        <button
          onClick={handleFitRoof}
          disabled={!hasRoof}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-emerald-400 hover:bg-slate-800 transition disabled:opacity-30 cursor-pointer"
          title="Fit Roof View"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setIsFullscreen?.(!isFullscreen)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          title="Toggle Fullscreen"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── 4. TOP-RIGHT CONTROLS: SATELLITE DROPDOWN, LAYERS, COMPASS ───────── */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 bg-slate-900/95 border border-slate-700/80 rounded-xl p-1 shadow-xl pointer-events-auto">
        <Select value={mapType} onValueChange={(val) => setMapType(val)}>
          <SelectTrigger className="h-7 text-xs bg-slate-800 border-none text-slate-200 gap-1 px-2.5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-800 text-white">
            <SelectItem value="satellite">Satellite</SelectItem>
            <SelectItem value="hybrid">Hybrid</SelectItem>
            <SelectItem value="street">Street</SelectItem>
          </SelectContent>
        </Select>

        <button
          onClick={() => setLayers((prev) => ({ ...prev, dimensions: !prev.dimensions }))}
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition cursor-pointer ${
            layers.dimensions ? "text-blue-400 bg-slate-800" : "text-slate-400 hover:text-white"
          }`}
          title="Toggle Edge Dimension Badges"
        >
          <LayersIcon className="w-3.5 h-3.5" />
        </button>

        {/* Compass Rose */}
        <div className="w-7 h-7 flex items-center justify-center text-red-500 font-bold text-[10px]" title="True North">
          ▲ N
        </div>
      </div>

      {/* ── 5. BOTTOM-LEFT: SATELLITE/MAP PREVIEW TOGGLE ─────────────────────── */}
      <div className="absolute bottom-3 left-3 z-20 pointer-events-auto flex items-center bg-slate-900/95 border border-slate-700/80 rounded-xl p-1 shadow-xl text-xs text-white">
        <button
          onClick={() => setMapType(mapType === "satellite" ? "street" : "satellite")}
          className="flex items-center gap-2 px-2 py-1 hover:bg-slate-800 rounded-lg transition cursor-pointer"
        >
          <span className="w-4 h-4 rounded bg-blue-600 flex items-center justify-center text-[9px] font-bold">
            {mapType === "satellite" ? "S" : "M"}
          </span>
          <span className="font-semibold text-xs capitalize">{mapType === "satellite" ? "Satellite" : "Map"}</span>
        </button>
      </div>

      {/* 2D Initial Roof Guidance Pill */}
      {!hasRoof && activeTool === "select" && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 bg-slate-900/95 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-blue-500/60 shadow-xl text-xs text-slate-200 pointer-events-auto flex items-center gap-2 animate-in fade-in">
          <PenTool className="w-3.5 h-3.5 text-blue-400 shrink-0 animate-pulse" />
          <span>Click <button type="button" onClick={() => { setActiveTool("draw_roof"); setActiveDrawPoints([]); }} className="text-blue-400 font-bold underline hover:text-blue-300 cursor-pointer">Mark Roof Boundary</button> to trace your rooftop corners</span>
        </div>
      )}

      {/* Add Panel Floating Guidance */}
      {activeTool === "add_panel" && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 bg-blue-950/95 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-blue-600 shadow-xl text-xs text-blue-200 pointer-events-auto flex items-center gap-2">
          <PlusCircle className="w-3.5 h-3.5 text-blue-400 animate-bounce shrink-0" />
          <span>Click anywhere on the open roof space to place a solar panel</span>
        </div>
      )}

      {/* Calibration Modal */}
      <Dialog open={showCalibrateModal} onOpenChange={setShowCalibrateModal}>
        <DialogContent className="max-w-sm bg-slate-900 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2 text-white">
              <Ruler className="w-4 h-4 text-purple-400" /> Calibrate Map Scale
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <p className="text-slate-300">
              Selected 2 points on the roof. Enter the real-world measured distance between them:
            </p>
            <div>
              <Label className="text-slate-400 text-[11px]">Actual Distance (meters)</Label>
              <Input
                type="number"
                step="0.1"
                min="0.5"
                value={calibrateDistanceInput}
                onChange={(e) => setCalibrateDistanceInput(e.target.value)}
                className="mt-1 bg-slate-800 border-slate-700 text-white text-xs h-9 font-bold font-mono"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowCalibrateModal(false)} className="border-slate-700 text-slate-300 text-xs">
              Cancel
            </Button>
            <Button size="sm" onClick={handleApplyCalibration} className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold">
              Apply Calibration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ── 5. FLOATING LAYOUT MICRO-ADJUSTMENT TOOL ──────────────────────────── */}
      {layers.panels && Array.isArray(panels) && panels.length > 0 && activeTool === "select" && (
        <LayoutMicroAdjuster
          panels={panels}
          setPanels={setPanels}
          roofPolygon={roofPolygon}
          setbackMeters={setbackMeters}
          obstacles={obstacles}
          walkways={walkways}
          panelSpecs={panelSpecs}
          orientation={orientation}
          selectionMode={activeSelectionMode}
          setSelectionMode={changeSelectionMode}
          selectedPanelId={activeSelectedPanelId}
          setSelectedPanelId={changeSelectedPanelId}
          selectedRowIndex={activeSelectedRowIndex}
          setSelectedRowIndex={changeSelectedRowIndex}
          autoLayoutBaselinePanels={autoLayoutBaselinePanels}
          hasManualAdjustments={hasManualAdjustments}
          setHasManualAdjustments={setHasManualAdjustments}
        />
      )}
    </div>
  );
});

export default function LiveSatelliteMap(props) {
  return (
    <MapErrorBoundary>
      <LiveSatelliteMapInner {...props} />
    </MapErrorBoundary>
  );
}
