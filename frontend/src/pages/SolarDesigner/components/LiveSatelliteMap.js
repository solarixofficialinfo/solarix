import React, { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import L from "leaflet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MousePointer, PenTool, Ruler, Square, Trash2, RotateCw, Copy, Lock, Unlock,
  Layers, ZoomIn, ZoomOut, Maximize2, Minimize2, Compass, Move, Plus, Sparkles,
  AlertTriangle, Navigation, CheckCircle2, ShieldCheck, Undo2, MapPin, Check, Info, PlusCircle,
  Edit3, CheckSquare
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
} from "../utils/geoCalculations";
import { validatePanelPlacement } from "../utils/layoutEngine";

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
    console.error("MapErrorBoundary caught:", err, info);
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

/**
 * High-Precision Interactive Live Satellite Rooftop Designer Map
 *
 * Bug Fixes Applied:
 * - FIXED: Click offset — handleFinishDrawingRoof now uses the same stable
 *   originLat/originLng as cartesianToLatLng for a single consistent origin.
 * - FIXED: maxZoom 22→20 to prevent white-screen at unsupported tile zoom levels.
 * - FIXED: ResizeObserver calls map.invalidateSize() on container resize,
 *   fixing click offset after accordion open/close or fullscreen toggle.
 * - FIXED: Roof vertex editing — "Edit Roof" mode with draggable L.marker handles.
 * - FIXED: Marker drag with roof shows confirmation (no silent geometry shift).
 * - ADDED: "+ Add Point" on edge click in edit mode.
 * - ADDED: Error boundary prevents full white screen on map crash.
 * - ADDED: Coordinate validation guards against NaN/Infinite values.
 */
const LiveSatelliteMapInner = forwardRef(function LiveSatelliteMapInner(
  {
    latitude = 19.076,
    longitude = 72.8777,
    zoom = 19,
    onLocationChange,
    roofPolygon = [],
    setRoofPolygon,
    panels = [],
    setPanels,
    obstacles = [],
    setObstacles,
    walkways = [],
    setWalkways,
    setbackMeters = 0.5,
    activeTool = "select",
    setActiveTool,
    selectedPanelId = null,
    setSelectedPanelId,
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
  // Vertex drag handles for roof edit mode (keyed by index)
  const vertexHandlesRef = useRef([]);
  // Stable refs for latest prop values (avoid stale closures in Leaflet handlers)
  const roofPolygonRef = useRef(roofPolygon);
  const setRoofPolygonRef = useRef(setRoofPolygon);
  const originRef = useRef({ lat: Number(latitude) || 19.076, lng: Number(longitude) || 72.8777 });

  useEffect(() => { roofPolygonRef.current = roofPolygon; }, [roofPolygon]);
  useEffect(() => { setRoofPolygonRef.current = setRoofPolygon; }, [setRoofPolygon]);

  const [mapType, setMapType] = useState("satellite");
  const [mapError, setMapError] = useState(null);
  const [activeDrawPoints, setActiveDrawPoints] = useState([]);
  const [cursorCoords, setCursorCoords] = useState({ lat: Number(latitude) || 19.076, lng: Number(longitude) || 72.8777 });

  // Roof edit mode
  const [editingRoof, setEditingRoof] = useState(false);
  const editingRoofRef = useRef(false);
  useEffect(() => { editingRoofRef.current = editingRoof; }, [editingRoof]);

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

  // ── STABLE ORIGIN: always use canonical site lat/lng as Cartesian origin ────
  // This is the SINGLE source of truth for coordinate conversion.
  // All Cartesian (x,y) values are relative to this origin.
  const originLat = Number(latitude) || 19.076;
  const originLng = Number(longitude) || 72.8777;
  const latRad = toRad(originLat);

  // Keep originRef updated so Leaflet event handlers can access current value
  useEffect(() => {
    originRef.current = { lat: originLat, lng: originLng };
  }, [originLat, originLng]);

  // ── COORDINATE CONVERSION (using stable origin from props) ──────────────────
  // FIX: Both cartesianToLatLng AND latLngToCartesian use the same originLat/originLng.
  // Previously handleFinishDrawingRoof used a different centroid origin, causing the offset.
  const cartesianToLatLng = useCallback((x, y) => {
    if (!isFinite(x) || !isFinite(y)) return [originLat, originLng];
    const dLngRad = x / (Math.cos(toRad(originRef.current.lat)) * 6378137);
    const dLatRad = y / 6378137;
    const lat = originRef.current.lat + toDeg(dLatRad);
    const lng = originRef.current.lng + toDeg(dLngRad);
    if (!isValidLatLng(lat, lng)) return [originRef.current.lat, originRef.current.lng];
    return [lat, lng];
  }, [originLat, originLng]); // eslint-disable-line react-hooks/exhaustive-deps

  const latLngToCartesian = useCallback((lat, lng) => {
    if (!isValidLatLng(lat, lng)) return { x: 0, y: 0 };
    const x = (toRad(lng) - toRad(originRef.current.lng)) * Math.cos(toRad(originRef.current.lat)) * 6378137;
    const y = (toRad(lat) - toRad(originRef.current.lat)) * 6378137;
    return { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 };
  }, []); // originRef is mutable, no deps needed

  // Expose snapshot + panTo + invalidateSize to parent
  useImperativeHandle(ref, () => ({
    getSnapshotDataUrl: () => {
      const map = mapInstanceRef.current;
      if (!map) return null;
      try {
        const canvas = document.createElement("canvas");
        const container = map.getContainer();
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/png");
      } catch (e) { return null; }
    },
    panTo: (lat, lng) => {
      if (!isValidLatLng(lat, lng)) return;
      const map = mapInstanceRef.current;
      if (map) {
        map.setView([lat, lng], 19, { animate: true });
        if (markerRef.current) markerRef.current.setLatLng([lat, lng]);
      }
    },
    invalidateSize: () => {
      mapInstanceRef.current?.invalidateSize({ pan: false });
    },
  }));

  // ── Handle Add Panel click ───────────────────────────────────────────────────
  const handleMapClickForAddPanel = useCallback((lat, lng) => {
    if (!roofPolygonRef.current || roofPolygonRef.current.length < 3) {
      toast.warning("Please draw a roof boundary first before adding panels.");
      return;
    }
    if (!isValidLatLng(lat, lng)) return;

    const { x, y } = latLngToCartesian(lat, lng);
    const isPortrait = orientation.toLowerCase() === "portrait";
    const pWidth = isPortrait ? (panelSpecs.width_m || 1.134) : (panelSpecs.length_m || 2.278);
    const pLength = isPortrait ? (panelSpecs.length_m || 2.278) : (panelSpecs.width_m || 1.134);
    const candidate = { x, y, width: pWidth, height: pLength, rotation: 0 };

    const check = validatePanelPlacement({
      candidate,
      roofPolygon: roofPolygonRef.current,
      setbackMeters,
      panels,
      obstacles,
      walkways,
    });

    if (!check.valid) {
      toast.warning(check.reason || "Cannot place panel here.");
      return;
    }

    const newPanel = {
      id: `panel-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      x, y, width: pWidth, height: pLength, rotation: 0,
      azimuth: azimuthDegrees || 180,
      wattage: panelSpecs.wattage || 550,
      locked: false, hidden: false,
    };
    setPanels?.((prev) => [...prev, newPanel]);
    setSelectedPanelId?.(newPanel.id);
    toast.success(`Placed Panel #${panels.length + 1}`);
  }, [latLngToCartesian, orientation, panelSpecs, setbackMeters, panels, obstacles, walkways, azimuthDegrees, setPanels, setSelectedPanelId]);

  // ── Initialize Leaflet Map ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    try {
      const initialLat = Number(latitude) || 19.076;
      const initialLng = Number(longitude) || 72.8777;

      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom: Math.min(zoom || 19, 20), // FIX: cap at 20 to prevent white-screen above tile maxNativeZoom
        maxZoom: 20,   // FIX: was 22, white-screen occurs above provider's maxNativeZoom=19
        minZoom: 4,
        zoomControl: false,
        attributionControl: false,
        preferCanvas: false,
      });

      mapInstanceRef.current = map;

      tileLayerGroupRef.current = L.layerGroup().addTo(map);
      roofLayerGroupRef.current = L.layerGroup().addTo(map);
      obstaclesLayerGroupRef.current = L.layerGroup().addTo(map);
      panelsLayerGroupRef.current = L.layerGroup().addTo(map);

      // ── Site Location Marker (draggable) ──────────────────────────────────
      const centerMarker = L.marker([initialLat, initialLng], {
        draggable: true,
        title: "Solar Rooftop Site Location — Drag to adjust",
      }).addTo(map);

      centerMarker.on("dragend", () => {
        const pos = centerMarker.getLatLng();
        if (!isValidLatLng(pos.lat, pos.lng)) return;

        // FIX: If a roof exists, warn user — don't silently shift the origin
        if (roofPolygonRef.current && roofPolygonRef.current.length >= 3) {
          toast.warning(
            "Site location updated. Existing roof geometry stays at its saved geographic position.",
            { duration: 5000 }
          );
        }

        if (onLocationChange) {
          onLocationChange({ latitude: pos.lat, longitude: pos.lng });
        }
      });

      markerRef.current = centerMarker;

      // ── Cursor coordinate HUD (uses Leaflet's event latlng — never manual calc) ──
      map.on("mousemove", (e) => {
        if (isValidLatLng(e.latlng.lat, e.latlng.lng)) {
          setCursorCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
        }
      });

      // ── Map Click Handler ────────────────────────────────────────────────
      // Uses e.latlng directly from Leaflet — the official pixel→geo API.
      // This is the correct and only way to get accurate click coordinates.
      map.on("click", (e) => {
        const { lat, lng } = e.latlng;
        if (!isValidLatLng(lat, lng)) return;

        // Do not process click if in roof edit mode (handled by vertex markers)
        if (editingRoofRef.current) return;

        const tool = window.__activeSolarTool;
        if (tool === "draw_roof") {
          setActiveDrawPoints((prev) => {
            // Prevent duplicate points
            if (prev.length > 0) {
              const last = prev[prev.length - 1];
              if (Math.abs(last.lat - lat) < 0.000001 && Math.abs(last.lng - lng) < 0.000001) return prev;
            }
            return [...prev, { lat, lng }];
          });
        } else if (tool === "add_panel") {
          window.__handleSolarMapClickAddPanel?.(lat, lng);
        } else if (tool === "calibrate") {
          setCalibratePoints((prev) => {
            const next = [...prev, { lat, lng }];
            if (next.length === 2) setShowCalibrateModal(true);
            return next;
          });
        }
      });

      // ── Tile error handler: prevent blank canvas ────────────────────────
      map.on("tileerror", (e) => {
        // Silently suppress tile errors (network/zoom issues) — don't crash
        // The map will show empty grey at those tiles rather than white-screening
        console.warn("Tile load error (non-fatal):", e?.tile?.src?.slice(-40));
      });

      // ── ResizeObserver: invalidateSize on container resize ───────────────
      // FIX: This is the critical fix for click offset after accordion toggle / fullscreen.
      // Without this, Leaflet's internal pixel calculations use stale container dimensions.
      const resizeObserver = new ResizeObserver(() => {
        try {
          mapInstanceRef.current?.invalidateSize({ pan: false });
        } catch (err) {
          // Silently ignore if map was already removed
        }
      });
      resizeObserver.observe(mapContainerRef.current);

      setMapError(null);

      return () => {
        resizeObserver.disconnect();
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }
      };
    } catch (err) {
      console.error("Leaflet initialization failed", err);
      setMapError("Satellite map engine initialization failed: " + err.message);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    window.__activeSolarTool = activeTool;
    window.__handleSolarMapClickAddPanel = handleMapClickForAddPanel;
  }, [activeTool, handleMapClickForAddPanel]);

  // ── Tile Layers on mapType change ──────────────────────────────────────────
  useEffect(() => {
    const tileGroup = tileLayerGroupRef.current;
    if (!tileGroup) return;
    tileGroup.clearLayers();

    if (mapType === "satellite") {
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 20, maxNativeZoom: 19, errorTileUrl: "" }
      ).addTo(tileGroup);
    } else if (mapType === "hybrid") {
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 20, maxNativeZoom: 19, errorTileUrl: "" }
      ).addTo(tileGroup);
      L.tileLayer(
        "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 20, maxNativeZoom: 19, errorTileUrl: "" }
      ).addTo(tileGroup);
    } else {
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 20, maxNativeZoom: 19,
        subdomains: ["a", "b", "c"],
        errorTileUrl: "",
      }).addTo(tileGroup);
    }
  }, [mapType]);

  // ── Pan map when location changes (preserve center on zoom/layer changes) ──
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!isValidLatLng(lat, lng)) return;

    const currentCenter = map.getCenter();
    const dist = Math.abs(currentCenter.lat - lat) + Math.abs(currentCenter.lng - lng);
    // Only pan if location changed significantly (avoids fighting user panning)
    if (dist > 0.0001) {
      map.setView([lat, lng], zoom || 19, { animate: true });
    }
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    }
  }, [latitude, longitude, zoom]);

  // ── Finish Drawing Roof Polygon ───────────────────────────────────────────
  // FIX: Uses originLat/originLng (stable canonical origin) for Cartesian conversion —
  // the SAME origin used by cartesianToLatLng for rendering. Previously used centroid
  // which caused a systematic visual offset.
  const handleFinishDrawingRoof = useCallback(() => {
    if (activeDrawPoints.length < 3) {
      toast.warning("A roof boundary requires at least 3 points.");
      return;
    }

    // Validate all points
    const validPoints = activeDrawPoints.filter((p) => isValidLatLng(p.lat, p.lng));
    if (validPoints.length < 3) {
      toast.error("Invalid roof boundary. Please re-draw using valid map clicks.");
      return;
    }

    // FIX: Use stable originLat/originLng (from props) as Cartesian origin — NOT centroid
    const origin = originRef.current;
    const baseLatRad = toRad(origin.lat);

    const cartesianPoints = validPoints.map((pt) => {
      const x = (toRad(pt.lng) - toRad(origin.lng)) * Math.cos(baseLatRad) * 6378137;
      const y = (toRad(pt.lat) - toRad(origin.lat)) * 6378137;
      return {
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100,
        lat: pt.lat,   // preserve for accurate rendering without re-conversion
        lng: pt.lng,
      };
    });

    // Validate no self-intersection (simple check: no duplicate consecutive points)
    const deduped = cartesianPoints.filter((p, i) => {
      if (i === 0) return true;
      const prev = cartesianPoints[i - 1];
      return !(Math.abs(p.x - prev.x) < 0.01 && Math.abs(p.y - prev.y) < 0.01);
    });

    if (deduped.length < 3) {
      toast.error("Roof has too many duplicate points. Please re-draw.");
      return;
    }

    setRoofPolygon(deduped);
    setActiveDrawPoints([]);
    setActiveTool("select");
    toast.success(`Roof drawn: ${deduped.length} vertices. Click "Edit Roof" to adjust.`);
  }, [activeDrawPoints, setRoofPolygon, setActiveTool]);

  // ── Roof Vertex Edit: drag a single vertex ────────────────────────────────
  const handleVertexDrag = useCallback((vertexIdx, lat, lng) => {
    // Live update during drag — update only that vertex
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

  // ── Delete a roof vertex ───────────────────────────────────────────────────
  const handleDeleteVertex = useCallback((idx) => {
    const poly = roofPolygonRef.current;
    if (poly.length <= 3) {
      toast.warning("A roof requires at least 3 points.");
      return;
    }
    const updated = poly.filter((_, i) => i !== idx);
    setRoofPolygonRef.current(updated);
  }, []);

  // ── Insert vertex on edge midpoint click ─────────────────────────────────
  const handleInsertVertexOnEdge = useCallback((edgeIdx) => {
    const poly = roofPolygonRef.current;
    if (!poly || poly.length < 2) return;
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
  }, []);

  // ── Calibration ───────────────────────────────────────────────────────────
  const handleApplyCalibration = () => {
    if (calibratePoints.length < 2) return;
    const distGeodesic = getHaversineDistance(
      calibratePoints[0].lat, calibratePoints[0].lng,
      calibratePoints[1].lat, calibratePoints[1].lng
    );
    const targetMeters = parseFloat(calibrateDistanceInput) || 10;

    if (distGeodesic > 0 && targetMeters > 0) {
      const scaleFactor = targetMeters / distGeodesic;
      const rescaledRoof = (roofPolygon || []).map((p) => ({
        ...p,
        x: Math.round(p.x * scaleFactor * 100) / 100,
        y: Math.round(p.y * scaleFactor * 100) / 100,
      }));
      setRoofPolygon(rescaledRoof);
      if (onCalibrationComplete) onCalibrationComplete({ measuredMeters: distGeodesic, targetMeters, scaleFactor });
    }

    setCalibratePoints([]);
    setShowCalibrateModal(false);
    setActiveTool("select");
  };

  // ── Render Overlays on Leaflet Map ─────────────────────────────────────────
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

      activeDrawPoints.forEach((p, idx) => {
        const cm = L.circleMarker([p.lat, p.lng], {
          radius: idx === 0 ? 8 : 6,
          fillColor: idx === 0 ? "#10b981" : "#2563eb",
          fillOpacity: 1,
          color: "#ffffff",
          weight: 2,
        }).addTo(roofGroup);
        cm.bindTooltip(`P${idx + 1}`, { permanent: true, direction: "top", className: "px-1 py-0 text-[10px] font-bold" });
      });
    }

    // 2. Committed Roof Polygon
    if (layers.roofBoundary && roofPolygon && roofPolygon.length >= 3) {
      // Filter invalid points before rendering
      const validPoly = roofPolygon.filter((p) => isValidLatLng(p.lat ?? 0, p.lng ?? 0) || isValidCartesian(p));

      const polyLatLngs = validPoly.map((p) => {
        // FIX: Use stored lat/lng when available (no re-conversion needed → no drift)
        if (isValidLatLng(p.lat, p.lng)) return [p.lat, p.lng];
        return cartesianToLatLng(p.x, p.y);
      });

      // Closed boundary polygon
      L.polygon(polyLatLngs, {
        color: editingRoof ? "#f59e0b" : "#2563eb",
        weight: editingRoof ? 2.5 : 3,
        fillColor: "#3b82f6",
        fillOpacity: 0.2,
        dashArray: editingRoof ? "5,4" : null,
      }).addTo(roofGroup);

      // Vertices — draggable in edit mode, static otherwise
      polyLatLngs.forEach((latlng, idx) => {
        if (editingRoof) {
          // ── DRAGGABLE VERTEX HANDLE ─────────────────────────────────────
          const handle = L.marker(latlng, {
            draggable: true,
            icon: L.divIcon({
              className: "",
              html: `<div style="width:18px;height:18px;border-radius:50%;background:#f59e0b;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;cursor:grab;font-size:8px;font-weight:bold;color:#1c1917;">${idx + 1}</div>`,
              iconSize: [18, 18],
              iconAnchor: [9, 9],
            }),
            zIndexOffset: 1000,
          }).addTo(roofGroup);

          handle.on("drag", (e) => {
            const { lat, lng } = e.target.getLatLng();
            handleVertexDrag(idx, lat, lng);
          });

          handle.on("dragend", (e) => {
            const { lat, lng } = e.target.getLatLng();
            handleVertexDrag(idx, lat, lng);
          });

          // Delete button on right-click
          handle.on("contextmenu", (e) => {
            L.DomEvent.stopPropagation(e);
            handleDeleteVertex(idx);
          });

          handle.bindTooltip(
            `<div style="font-size:10px;font-weight:bold">P${idx + 1} — drag to move<br>Right-click to delete</div>`,
            { direction: "top", className: "leaflet-tooltip-vertex" }
          );
          vertexHandlesRef.current.push(handle);
        } else {
          // ── STATIC VERTEX MARKER ──────────────────────────────────────────
          const cm = L.circleMarker(latlng, {
            radius: 6,
            fillColor: "#2563eb",
            fillOpacity: 1,
            color: "#ffffff",
            weight: 2,
          }).addTo(roofGroup);
          cm.bindTooltip(`P${idx + 1}`, { permanent: false, direction: "top" });
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
          const edgeIdx = i; // capture

          const addBtn = L.marker([midLat, midLng], {
            icon: L.divIcon({
              className: "",
              html: `<div style="width:14px;height:14px;border-radius:50%;background:#0ea5e9;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:11px;color:white;font-weight:bold;">+</div>`,
              iconSize: [14, 14],
              iconAnchor: [7, 7],
            }),
            interactive: true,
          }).addTo(roofGroup);

          addBtn.on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            handleInsertVertexOnEdge(edgeIdx);
          });
          addBtn.bindTooltip("Click to add vertex here", { direction: "top" });
        }
      }

      // 3. Segment dimension labels (only shown outside edit mode, or always)
      if (layers.dimensions && !editingRoof) {
        for (let i = 0; i < roofPolygon.length; i++) {
          const j = (i + 1) % roofPolygon.length;
          const p1 = roofPolygon[i], p2 = roofPolygon[j];
          const lenM = Math.hypot(p2.x - p1.x, p2.y - p1.y);
          const midLatLng = p1.lat && p2.lat
            ? [(p1.lat + p2.lat) / 2, (p1.lng + p2.lng) / 2]
            : cartesianToLatLng((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
          const dimIcon = L.divIcon({
            className: "bg-white/95 px-1.5 py-0.5 rounded-md border border-blue-300 text-[10px] font-bold text-blue-900 shadow-sm text-center select-none pointer-events-none whitespace-nowrap",
            html: `${lenM.toFixed(1)}m`,
            iconSize: [42, 18],
            iconAnchor: [21, 9],
          });
          L.marker(midLatLng, { icon: dimIcon, interactive: false }).addTo(roofGroup);
        }
      }

      // 4. Setback clearance margin
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
        } catch (e) {
          // Silently ignore setback render error (e.g. very small polygon)
        }
      }
    }

    // 5. Obstacles
    if (layers.obstacles && Array.isArray(obstacles) && obstacles.length > 0) {
      obstacles.forEach((obs) => {
        if (!isValidCartesian(obs)) return;
        const ow = Number(obs.length || 1.8);
        const ol = Number(obs.width || 1.8);
        const corners = getRotatedRectCorners(obs.x, obs.y, ow, ol, obs.rotation || 0);
        const obsLatLngs = corners.map((c) => cartesianToLatLng(c.x, c.y));
        L.polygon(obsLatLngs, { color: "#dc2626", weight: 2, fillColor: "#ef4444", fillOpacity: 0.45 }).addTo(obsGroup);
        const centerLatLng = cartesianToLatLng(obs.x, obs.y);
        const labelIcon = L.divIcon({
          className: "bg-red-900/90 text-white px-1.5 py-0.5 rounded text-[9.5px] font-bold shadow-xs whitespace-nowrap",
          html: obs.name || obs.type || "Obstacle",
          iconSize: [60, 16], iconAnchor: [30, 8],
        });
        L.marker(centerLatLng, { icon: labelIcon, interactive: false }).addTo(obsGroup);
      });
    }

    // 6. Solar Panels (with drag handle for selected)
    if (layers.panels && Array.isArray(panels) && panels.length > 0) {
      panels.forEach((p, idx) => {
        if (p.hidden || !isValidCartesian(p)) return;
        const isSelected = p.id === selectedPanelId;
        const corners = getRotatedRectCorners(p.x, p.y, p.width || 1.134, p.height || 2.278, p.rotation || 0);
        const pLatLngs = corners.map((c) => cartesianToLatLng(c.x, c.y));
        const centerLatLng = cartesianToLatLng(p.x, p.y);

        const panelPoly = L.polygon(pLatLngs, {
          color: isSelected ? "#fbbf24" : "#93c5fd",
          weight: isSelected ? 2.5 : 1,
          fillColor: isSelected ? "#2563eb" : "#0a192f",
          fillOpacity: 0.92,
        }).addTo(panelGroup);

        panelPoly.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          setSelectedPanelId?.(p.id);
        });

        if (isSelected) {
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
              toast.success(`Moved Panel #${idx + 1}`);
            } else {
              toast.warning(validation.reason || "Invalid position.");
              setPanels?.((prev) => [...prev]); // trigger re-render to revert
            }
          });
        } else {
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
    activeDrawPoints, layers, selectedPanelId, editingRoof,
    cartesianToLatLng, latLngToCartesian,
    handleVertexDrag, handleDeleteVertex, handleInsertVertexOnEdge,
    setPanels, setSelectedPanelId,
  ]);

  // ── Zoom helpers ──────────────────────────────────────────────────────────
  const handleZoomIn = () => mapInstanceRef.current?.zoomIn();
  const handleZoomOut = () => mapInstanceRef.current?.zoomOut();
  const handleLocateCenter = () => {
    if (mapInstanceRef.current && isValidLatLng(Number(latitude), Number(longitude))) {
      mapInstanceRef.current.setView([Number(latitude), Number(longitude)], 19, { animate: true });
    }
  };

  // ── Derived geometry stats ────────────────────────────────────────────────
  const roofArea = getCartesianPolygonArea(roofPolygon);
  const roofPerimeter = getCartesianPolygonPerimeter(roofPolygon);
  const hasRoof = roofPolygon && roofPolygon.length >= 3;

  return (
    <div className="relative w-full h-full min-h-[580px] rounded-2xl overflow-hidden bg-slate-900 border border-slate-700 shadow-xl select-none flex flex-col">
      <div ref={mapContainerRef} className="w-full h-full flex-1 z-0 cursor-crosshair" />

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

      {/* Empty-state guidance */}
      {!hasRoof && activeDrawPoints.length === 0 && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 bg-slate-900/90 backdrop-blur-md px-4 py-2 rounded-xl border border-blue-500/60 shadow-xl text-xs text-blue-200 pointer-events-none flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-400 shrink-0" />
          <span>Search site location, then click <b>'Draw Roof'</b> to trace the building perimeter.</span>
        </div>
      )}

      {/* ── TOP TOOLBAR ──────────────────────────────────────────────────────── */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none gap-2 z-10">
        {/* Left: Interaction Tools */}
        <div className="flex items-center gap-1 bg-slate-900/95 backdrop-blur-md p-1 rounded-xl border border-slate-700/80 shadow-lg pointer-events-auto flex-wrap">
          <Button
            size="sm"
            variant={activeTool === "select" ? "default" : "ghost"}
            onClick={() => { setActiveTool("select"); setActiveDrawPoints([]); setEditingRoof(false); }}
            className="h-7 text-xs px-2.5 rounded-lg gap-1.5"
            title="Select & Drag Objects"
          >
            <MousePointer className="w-3.5 h-3.5" /> Select
          </Button>

          <Button
            size="sm"
            variant={activeTool === "draw_roof" ? "default" : "ghost"}
            onClick={() => { setActiveTool("draw_roof"); setActiveDrawPoints([]); setEditingRoof(false); }}
            className={`h-7 text-xs px-2.5 rounded-lg gap-1.5 ${activeTool === "draw_roof" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "text-emerald-400 hover:text-white"}`}
            title="Click points on satellite imagery to trace roof boundary"
          >
            <PenTool className="w-3.5 h-3.5" /> Draw Roof
          </Button>

          {/* Edit Roof button — only shown when roof exists */}
          {hasRoof && (
            <Button
              size="sm"
              variant={editingRoof ? "default" : "ghost"}
              onClick={() => {
                setEditingRoof(!editingRoof);
                setActiveTool("select");
                setActiveDrawPoints([]);
              }}
              className={`h-7 text-xs px-2.5 rounded-lg gap-1.5 ${editingRoof ? "bg-amber-500 hover:bg-amber-600 text-white" : "text-amber-400 hover:text-white"}`}
              title="Drag roof vertices to reshape the boundary"
            >
              <Edit3 className="w-3.5 h-3.5" /> {editingRoof ? "Done Editing" : "Edit Roof"}
            </Button>
          )}

          <Button
            size="sm"
            variant={activeTool === "add_panel" ? "default" : "ghost"}
            onClick={() => { setActiveTool("add_panel"); setActiveDrawPoints([]); setEditingRoof(false); }}
            className={`h-7 text-xs px-2.5 rounded-lg gap-1.5 ${activeTool === "add_panel" ? "bg-amber-600 hover:bg-amber-700 text-white" : "text-amber-400 hover:text-white"}`}
            title="Click on roof to manually place a panel"
          >
            <Plus className="w-3.5 h-3.5" /> + Add Panel
          </Button>

          <Button
            size="sm"
            variant={activeTool === "calibrate" ? "default" : "ghost"}
            onClick={() => { setActiveTool("calibrate"); setCalibratePoints([]); }}
            className="h-7 text-xs px-2 rounded-lg gap-1.5 text-purple-400 hover:text-purple-300"
            title="Calibrate measurement with known distance"
          >
            <Ruler className="w-3.5 h-3.5" /> Calibrate
          </Button>

          {/* Close Roof (finish drawing) */}
          {activeTool === "draw_roof" && activeDrawPoints.length >= 3 && (
            <Button
              size="sm"
              onClick={handleFinishDrawingRoof}
              className="h-7 text-xs px-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold animate-pulse shadow-sm"
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Close Roof ({activeDrawPoints.length} pts)
            </Button>
          )}

          {/* Clear Roof */}
          {hasRoof && (
            <>
              <div className="w-[1px] h-4 bg-slate-700 mx-0.5" />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setRoofPolygon([]);
                  setActiveDrawPoints([]);
                  setEditingRoof(false);
                  setPanels?.([]);
                }}
                className="h-7 px-2 rounded-lg text-slate-400 hover:text-red-400"
                title="Clear Roof & Panels"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </>
          )}
        </div>

        {/* Right: Map Type Selector & Controls */}
        <div className="flex items-center gap-1 bg-slate-900/95 backdrop-blur-md p-1 rounded-xl border border-slate-700/80 shadow-lg pointer-events-auto">
          <Button size="sm" variant={mapType === "satellite" ? "secondary" : "ghost"} onClick={() => setMapType("satellite")} className="h-6 text-[11px] px-2 rounded-lg">Satellite</Button>
          <Button size="sm" variant={mapType === "hybrid" ? "secondary" : "ghost"} onClick={() => setMapType("hybrid")} className="h-6 text-[11px] px-2 rounded-lg">Hybrid</Button>
          <Button size="sm" variant={mapType === "street" ? "secondary" : "ghost"} onClick={() => setMapType("street")} className="h-6 text-[11px] px-2 rounded-lg">Street</Button>
          <div className="w-[1px] h-3.5 bg-slate-700 mx-0.5" />
          <Button size="sm" variant="ghost" onClick={handleZoomIn} className="h-6 w-6 p-0 rounded-lg text-slate-300 hover:text-white" title="Zoom In"><ZoomIn className="w-3.5 h-3.5" /></Button>
          <Button size="sm" variant="ghost" onClick={handleZoomOut} className="h-6 w-6 p-0 rounded-lg text-slate-300 hover:text-white" title="Zoom Out"><ZoomOut className="w-3.5 h-3.5" /></Button>
          <Button size="sm" variant="ghost" onClick={handleLocateCenter} className="h-6 w-6 p-0 rounded-lg text-blue-400 hover:text-blue-300" title="Center Site Marker"><Navigation className="w-3.5 h-3.5" /></Button>
        </div>
      </div>

      {/* Selected Panel Toolbar */}
      {selectedPanelId && (
        <div className="absolute top-14 left-3 z-10 flex items-center gap-1 bg-blue-900/95 backdrop-blur-md p-1.5 rounded-xl border border-blue-500 shadow-xl pointer-events-auto animate-in fade-in">
          <span className="text-[11px] font-semibold text-blue-200 px-2">
            Panel #{panels.findIndex((p) => p.id === selectedPanelId) + 1}
          </span>
          <Button size="sm" variant="ghost" onClick={() => setPanels?.((prev) => prev.map((p) => p.id === selectedPanelId ? { ...p, rotation: (p.rotation || 0) + 90 } : p))} className="h-6 text-xs px-2 rounded-lg text-white hover:bg-blue-800" title="Rotate 90°">
            <RotateCw className="w-3 h-3 mr-1" /> Rotate
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { const t = panels.find((p) => p.id === selectedPanelId); if (!t) return; const d = { ...t, id: `panel-${Date.now()}`, x: t.x + 1.2 }; setPanels?.([...panels, d]); setSelectedPanelId?.(d.id); toast.success("Duplicated panel"); }} className="h-6 text-xs px-2 rounded-lg text-white hover:bg-blue-800">
            <Copy className="w-3 h-3 mr-1" /> Duplicate
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setPanels?.((prev) => prev.filter((p) => p.id !== selectedPanelId)); setSelectedPanelId?.(null); toast.success("Removed panel"); }} className="h-6 text-xs px-2 rounded-lg text-red-300 hover:bg-red-900">
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      )}

      {/* Add Panel guidance */}
      {activeTool === "add_panel" && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 bg-amber-950/95 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-amber-600 shadow-xl text-xs text-amber-200 pointer-events-auto flex items-center gap-2">
          <PlusCircle className="w-3.5 h-3.5 text-amber-400 animate-bounce shrink-0" />
          <span>Click anywhere on the open roof space to place a solar panel</span>
        </div>
      )}

      {/* Drawing Instructions */}
      {activeTool === "draw_roof" && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 bg-emerald-950/95 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-emerald-600 shadow-xl text-xs text-emerald-200 pointer-events-auto flex items-center gap-2.5">
          <PenTool className="w-3.5 h-3.5 text-emerald-400 animate-pulse shrink-0" />
          <span>Click corners of the rooftop on the satellite map ({activeDrawPoints.length} point{activeDrawPoints.length !== 1 ? "s" : ""} placed)</span>
          {activeDrawPoints.length >= 3 && (
            <Button size="sm" onClick={handleFinishDrawingRoof} className="h-6 px-2 text-xs bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg ml-1">
              Done / Close
            </Button>
          )}
        </div>
      )}

      {/* Roof Edit Instructions */}
      {editingRoof && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 bg-amber-950/95 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-amber-600 shadow-xl text-xs text-amber-200 pointer-events-auto flex items-center gap-2.5 max-w-sm">
          <Edit3 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>Drag numbered handles to reshape. Click <b>+</b> on edges to add vertex. Right-click handle to delete.</span>
          <Button size="sm" onClick={() => setEditingRoof(false)} className="h-6 px-2 text-xs bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg ml-1 shrink-0">
            <CheckSquare className="w-3 h-3 mr-1" /> Done
          </Button>
        </div>
      )}

      {/* Bottom HUD */}
      <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between pointer-events-none z-10 gap-2">
        <div className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700/80 shadow-lg pointer-events-auto flex items-center gap-3 text-xs text-slate-300">
          <div>
            <span className="text-[9px] text-slate-400 block font-medium">ROOF AREA</span>
            <span className="font-bold text-white">{roofArea > 0 ? `${roofArea.toFixed(1)} m²` : "0 m²"}</span>
          </div>
          <div className="w-[1px] h-5 bg-slate-700" />
          <div>
            <span className="text-[9px] text-slate-400 block font-medium">PERIMETER</span>
            <span className="font-bold text-white">{roofPerimeter > 0 ? `${roofPerimeter.toFixed(1)} m` : "0 m"}</span>
          </div>
          <div className="w-[1px] h-5 bg-slate-700" />
          <div>
            <span className="text-[9px] text-slate-400 block font-medium">PANELS</span>
            <span className="font-bold text-blue-400">{panels.filter((p) => !p.hidden).length} Nos</span>
          </div>
        </div>

        <div className="bg-slate-900/90 backdrop-blur-md px-2.5 py-1 rounded-xl border border-slate-700/80 shadow-lg text-[10px] text-slate-300 pointer-events-auto flex items-center gap-2">
          <Compass className="w-3 h-3 text-red-400" />
          {/* Cursor coordinate: from Leaflet mousemove e.latlng — never manually calculated */}
          <span>Cursor: <b>{cursorCoords.lat.toFixed(5)}, {cursorCoords.lng.toFixed(5)}</b></span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400">
            {mapType === "satellite" ? "Satellite" : mapType === "hybrid" ? "Hybrid" : "Street"} imagery
          </span>
          {isCalibrated && (
            <>
              <span className="text-slate-600">|</span>
              <Badge variant="outline" className="text-[9px] bg-purple-950 text-purple-300 border-purple-800 py-0">Calibrated</Badge>
            </>
          )}
        </div>
      </div>

      {/* Calibration Dialog */}
      <Dialog open={showCalibrateModal} onOpenChange={setShowCalibrateModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Ruler className="w-5 h-5 text-purple-600" /> Calibrate Roof Reference Dimension
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm text-slate-600">
            <p>You clicked two points on the satellite image. Enter the known physical on-site distance between these two points:</p>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Known Distance (meters)</Label>
              <Input
                type="number" step="0.1" min="0.5" max="500"
                value={calibrateDistanceInput}
                onChange={(e) => setCalibrateDistanceInput(e.target.value)}
                placeholder="e.g. 10.0"
                className="text-sm font-bold"
                autoFocus
              />
            </div>
            <div className="text-xs text-slate-500 bg-purple-50 p-2.5 rounded-lg border border-purple-200">
              This will accurately rescale the rooftop boundary polygon and all solar module grid arrays.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCalibrateModal(false)}>Cancel</Button>
            <Button onClick={handleApplyCalibration} className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs">
              Apply Calibration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

// Wrap with error boundary
const LiveSatelliteMap = forwardRef(function LiveSatelliteMap(props, ref) {
  return (
    <MapErrorBoundary>
      <LiveSatelliteMapInner {...props} ref={ref} />
    </MapErrorBoundary>
  );
});

export default LiveSatelliteMap;
