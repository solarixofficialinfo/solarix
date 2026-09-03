import React, { useEffect, useRef, useState, useCallback, useMemo, useImperativeHandle, forwardRef } from "react";
import L from "leaflet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MousePointer, PenTool, Ruler, Trash2, RotateCw, Copy, Plus,
  AlertTriangle, Navigation, CheckCircle2, Undo2, Redo2, MapPin, Check, Info, PlusCircle,
  Edit3, CheckSquare, X
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

const LiveSatelliteMapInner = forwardRef(function LiveSatelliteMapInner(
  {
    latitude = 19.076,
    longitude = 72.8777,
    zoom = 19,
    onLocationChange,
    onCaptureLocation,
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
  const vertexHandlesRef = useRef([]);

  // Stable refs for latest prop values
  const roofPolygonRef = useRef(roofPolygon);
  const setRoofPolygonRef = useRef(setRoofPolygon);
  const originRef = useRef({ lat: Number(latitude) || 19.076, lng: Number(longitude) || 72.8777 });

  useEffect(() => { roofPolygonRef.current = roofPolygon; }, [roofPolygon]);
  useEffect(() => { setRoofPolygonRef.current = setRoofPolygon; }, [setRoofPolygon]);

  const [mapType, setMapType] = useState("satellite");
  const [mapError, setMapError] = useState(null);
  const [activeDrawPoints, setActiveDrawPoints] = useState([]);
  const [cursorCoords, setCursorCoords] = useState({ lat: Number(latitude) || 19.076, lng: Number(longitude) || 72.8777 });

  // Location Capture & Drag confirmation states
  const [locationCaptured, setLocationCaptured] = useState(false);
  const [capturedCoords, setCapturedCoords] = useState(null);
  const [pendingMarkerLocation, setPendingMarkerLocation] = useState(null);

  // Roof Edit Mode state & Undo/Redo Stacks
  const editingRoof = activeTool === "edit_roof";
  const editingRoofRef = useRef(editingRoof);
  useEffect(() => { editingRoofRef.current = editingRoof; }, [editingRoof]);

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

  // Handle Add Panel click
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
        zoom: Math.min(zoom || 19, 20),
        maxZoom: 20,
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

      // Site Location Marker with Confirmation on drag
      const centerMarker = L.marker([initialLat, initialLng], {
        draggable: true,
        title: "Solar Rooftop Site Location — Drag to adjust",
      }).addTo(map);

      centerMarker.on("dragend", () => {
        const pos = centerMarker.getLatLng();
        if (!isValidLatLng(pos.lat, pos.lng)) return;
        setPendingMarkerLocation({ lat: pos.lat, lng: pos.lng });
        toast.info("Site marker moved. Click 'Update Site Location' to confirm new coordinates.");
      });

      markerRef.current = centerMarker;

      map.on("mousemove", (e) => {
        if (isValidLatLng(e.latlng.lat, e.latlng.lng)) {
          setCursorCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
        }
      });

      // Map Click Handler based on active tool
      map.on("click", (e) => {
        const { lat, lng } = e.latlng;
        if (!isValidLatLng(lat, lng)) return;

        const tool = window.__activeSolarTool;
        if (tool === "draw_roof") {
          setActiveDrawPoints((prev) => {
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

  useEffect(() => {
    window.__activeSolarTool = activeTool;
    window.__handleSolarMapClickAddPanel = handleMapClickForAddPanel;
  }, [activeTool, handleMapClickForAddPanel]);

  // Tile Layers with maxNativeZoom: 18 to prevent white-screen on deep zoom
  useEffect(() => {
    const tileGroup = tileLayerGroupRef.current;
    if (!tileGroup) return;
    tileGroup.clearLayers();

    if (mapType === "satellite") {
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 20, maxNativeZoom: 18, keepBuffer: 6, errorTileUrl: "" }
      ).addTo(tileGroup);
    } else if (mapType === "hybrid") {
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 20, maxNativeZoom: 18, keepBuffer: 6, errorTileUrl: "" }
      ).addTo(tileGroup);
      L.tileLayer(
        "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 20, maxNativeZoom: 18, keepBuffer: 6, errorTileUrl: "" }
      ).addTo(tileGroup);
    } else {
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 20, maxNativeZoom: 19,
        subdomains: ["a", "b", "c"],
        keepBuffer: 6,
        errorTileUrl: "",
      }).addTo(tileGroup);
    }
  }, [mapType]);

  // Pan map when canonical location prop changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!isValidLatLng(lat, lng)) return;

    const currentCenter = map.getCenter();
    const dist = Math.abs(currentCenter.lat - lat) + Math.abs(currentCenter.lng - lng);
    if (dist > 0.003) {
      const currentZoom = map.getZoom();
      map.setView([lat, lng], Math.max(currentZoom, zoom || 18), { animate: true });
    }
    if (markerRef.current && !pendingMarkerLocation) {
      markerRef.current.setLatLng([lat, lng]);
    }
  }, [latitude, longitude, zoom, pendingMarkerLocation]);

  // Roof Drawing Actions
  const handleUndoDrawPoint = useCallback(() => {
    setActiveDrawPoints((prev) => prev.slice(0, -1));
  }, []);

  const handleCancelDrawing = useCallback(() => {
    setActiveDrawPoints([]);
    setActiveTool("select");
  }, [setActiveTool]);

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
    toast.success(`Roof drawn: ${deduped.length} vertices. Click "Edit Roof" to adjust.`);
  }, [activeDrawPoints, pushVertexHistory, setRoofPolygon, setActiveTool]);

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

      activeDrawPoints.forEach((p, idx) => {
        const cm = L.circleMarker([p.lat, p.lng], {
          radius: idx === 0 ? 8 : 6,
          fillColor: idx === 0 ? "#10b981" : "#2563eb",
          fillOpacity: 1,
          color: "#ffffff",
          weight: 2,
        }).addTo(roofGroup);
        cm.bindTooltip(`Point ${idx + 1}`, { permanent: true, direction: "top", className: "px-1.5 py-0.5 text-[10px] font-bold" });
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
        color: editingRoof ? "#f59e0b" : "#2563eb",
        weight: editingRoof ? 2.5 : 3,
        fillColor: editingRoof ? "#fbbf24" : "#3b82f6",
        fillOpacity: editingRoof ? 0.18 : 0.28,
        dashArray: editingRoof ? "4, 4" : undefined,
      }).addTo(roofGroup);

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

          handle.on("dragstart", () => {
            pushVertexHistory(roofPolygonRef.current);
          });

          handle.on("drag", (e) => {
            const { lat, lng } = e.target.getLatLng();
            handleVertexDrag(idx, lat, lng);
          });

          handle.on("dragend", (e) => {
            const { lat, lng } = e.target.getLatLng();
            handleVertexDrag(idx, lat, lng);
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
            fillColor: "#2563eb",
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
            className: "bg-white/95 px-1.5 py-0.5 rounded-md border border-blue-300 text-[10px] font-bold text-blue-900 shadow-sm text-center select-none pointer-events-none whitespace-nowrap",
            html: `${lenM.toFixed(1)}m`,
            iconSize: [44, 18],
            iconAnchor: [22, 9],
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

    // 4. Solar Panels (with out-of-bounds safety indicator)
    if (layers.panels && Array.isArray(panels) && panels.length > 0) {
      panels.forEach((p, idx) => {
        if (p.hidden || !isValidCartesian(p)) return;
        const isSelected = p.id === selectedPanelId;
        const isOutOfBounds = roofPolygon && roofPolygon.length >= 3 && !isPointInPolygon(p.x, p.y, roofPolygon);

        const corners = getRotatedRectCorners(p.x, p.y, p.width || 1.134, p.height || 2.278, p.rotation || 0);
        const pLatLngs = corners.map((c) => cartesianToLatLng(c.x, c.y));
        const centerLatLng = cartesianToLatLng(p.x, p.y);

        const panelPoly = L.polygon(pLatLngs, {
          color: isOutOfBounds ? "#ef4444" : isSelected ? "#fbbf24" : "#93c5fd",
          dashArray: isOutOfBounds ? "4, 4" : undefined,
          weight: isOutOfBounds ? 2.5 : isSelected ? 2.5 : 1,
          fillColor: isOutOfBounds ? "#b91c1c" : isSelected ? "#2563eb" : "#0a192f",
          fillOpacity: isOutOfBounds ? 0.85 : 0.92,
        }).addTo(panelGroup);

        panelPoly.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          setSelectedPanelId?.(p.id);
        });

        if (isOutOfBounds) {
          panelPoly.bindTooltip(
            `<div class="text-[10px] font-bold text-amber-300">⚠ Panel #${idx + 1} is outside the roof boundary.<br>Click to reposition or delete.</div>`,
            { direction: "top" }
          );
        }

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
              setPanels?.((prev) => [...prev]);
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
    cartesianToLatLng, latLngToCartesian, handleVertexDrag, handleDeleteVertex,
    handleInsertVertexOnEdge, pushVertexHistory, setSelectedPanelId, setPanels,
    setActiveTool
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
    toast.success(`Site captured: ${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`);
  }, [onCaptureLocation, onLocationChange]);

  const hasRoof = roofPolygon && roofPolygon.length >= 3;

  return (
    <div className="relative w-full h-full min-h-[580px] rounded-2xl overflow-hidden bg-slate-950 border border-slate-700 shadow-xl select-none flex flex-col">
      <div ref={mapContainerRef} className="w-full h-full flex-1 z-0 cursor-crosshair bg-slate-950" />

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

      {/* ── TOP SMART CONTEXTUAL TOOLBAR ───────────────────────────────────── */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none gap-2 z-10">
        {/* Left: Dynamic Context Tools */}
        <div className="flex items-center gap-1 bg-slate-900/95 backdrop-blur-md p-1 rounded-xl border border-slate-700/80 shadow-lg pointer-events-auto flex-wrap">
          {/* 1. Context: Drawing Roof */}
          {activeTool === "draw_roof" ? (
            <div className="flex items-center gap-1">
              <Badge className="bg-emerald-600 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-lg">
                Point {activeDrawPoints.length + 1}
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleUndoDrawPoint}
                disabled={activeDrawPoints.length === 0}
                className="h-7 text-xs px-2.5 rounded-lg text-slate-300 hover:text-white disabled:opacity-30 gap-1"
                title="Undo last placed point"
              >
                <Undo2 className="w-3.5 h-3.5" /> Undo Point
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCancelDrawing}
                className="h-7 text-xs px-2 rounded-lg text-red-400 hover:text-red-300"
                title="Cancel roof drawing"
              >
                <X className="w-3.5 h-3.5 mr-1" /> Cancel
              </Button>
              {activeDrawPoints.length >= 3 && (
                <Button
                  size="sm"
                  onClick={handleFinishDrawingRoof}
                  className="h-7 text-xs px-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold animate-pulse shadow-sm"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Finish Roof ({activeDrawPoints.length} pts)
                </Button>
              )}
            </div>
          ) : activeTool === "edit_roof" ? (
            /* 2. Context: Editing Roof Vertices */
            <div className="flex items-center gap-1">
              <Badge className="bg-amber-600 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-lg">
                Editing Roof ({roofPolygon.length} vertices)
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleUndoVertex}
                disabled={vertexHistory.length === 0}
                className="h-7 text-xs px-2 rounded-lg text-slate-300 hover:text-white disabled:opacity-30 gap-1"
                title="Undo vertex modification"
              >
                <Undo2 className="w-3.5 h-3.5" /> Undo
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleRedoVertex}
                disabled={vertexRedoStack.length === 0}
                className="h-7 text-xs px-2 rounded-lg text-slate-300 hover:text-white disabled:opacity-30 gap-1"
                title="Redo vertex modification"
              >
                <Redo2 className="w-3.5 h-3.5" /> Redo
              </Button>
              <Button
                size="sm"
                onClick={() => setActiveTool("select")}
                className="h-7 text-xs px-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold rounded-lg ml-1 shadow-sm gap-1"
              >
                <CheckSquare className="w-3.5 h-3.5" /> Finish Editing
              </Button>
            </div>
          ) : selectedPanelId ? (
            /* 3. Context: Panel Selected */
            <div className="flex items-center gap-1">
              <Badge className="bg-blue-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-lg">
                Panel #{panels.findIndex((p) => p.id === selectedPanelId) + 1}
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPanels?.((prev) => prev.map((p) => p.id === selectedPanelId ? { ...p, rotation: (p.rotation || 0) + 90 } : p))}
                className="h-7 text-xs px-2 rounded-lg text-white hover:bg-blue-800"
                title="Rotate 90°"
              >
                <RotateCw className="w-3 h-3 mr-1" /> Rotate
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const t = panels.find((p) => p.id === selectedPanelId);
                  if (!t) return;
                  const d = { ...t, id: `panel-${Date.now()}`, x: t.x + 1.2 };
                  setPanels?.([...panels, d]);
                  setSelectedPanelId?.(d.id);
                  toast.success("Duplicated panel");
                }}
                className="h-7 text-xs px-2 rounded-lg text-white hover:bg-blue-800"
              >
                <Copy className="w-3 h-3 mr-1" /> Duplicate
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setPanels?.((prev) => prev.filter((p) => p.id !== selectedPanelId));
                  setSelectedPanelId?.(null);
                  toast.success("Removed panel");
                }}
                className="h-7 text-xs px-2 rounded-lg text-red-400 hover:bg-red-900"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedPanelId?.(null)}
                className="h-7 text-xs px-2 rounded-lg text-slate-400 hover:text-white"
              >
                Deselect
              </Button>
            </div>
          ) : (
            /* 4. Context: General Mode Toolbar */
            <>
              {/* Location Capture Indicator */}
              {locationCaptured ? (
                <div className="flex items-center gap-1 h-7 px-2.5 rounded-lg bg-emerald-900/80 border border-emerald-600/60 text-emerald-300 text-xs font-semibold">
                  <Check className="w-3 h-3" />
                  <span>Captured</span>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCaptureLocation}
                  className="h-7 text-xs px-2.5 rounded-lg gap-1.5 text-blue-300 hover:text-white hover:bg-blue-700 border border-blue-600/50"
                  title="Capture map center as site coordinates"
                >
                  <MapPin className="w-3.5 h-3.5" /> Capture Location
                </Button>
              )}

              <div className="w-[1px] h-4 bg-slate-700 mx-0.5" />

              <Button
                size="sm"
                variant={activeTool === "select" ? "default" : "ghost"}
                onClick={() => { setActiveTool("select"); setActiveDrawPoints([]); }}
                className="h-7 text-xs px-2.5 rounded-lg gap-1.5"
                title="Select & Move Panels"
              >
                <MousePointer className="w-3.5 h-3.5" /> Select
              </Button>

              <Button
                size="sm"
                variant={activeTool === "draw_roof" ? "default" : "ghost"}
                onClick={() => { setActiveTool("draw_roof"); setActiveDrawPoints([]); }}
                className={`h-7 text-xs px-2.5 rounded-lg gap-1.5 ${activeTool === "draw_roof" ? "bg-emerald-600 text-white" : "text-emerald-400 hover:text-white"}`}
                title="Trace rooftop perimeter"
              >
                <PenTool className="w-3.5 h-3.5" /> Draw Roof
              </Button>

              {hasRoof && (
                <Button
                  size="sm"
                  variant={activeTool === "edit_roof" ? "default" : "ghost"}
                  onClick={() => {
                    setActiveTool("edit_roof");
                    setActiveDrawPoints([]);
                  }}
                  className={`h-7 text-xs px-2.5 rounded-lg gap-1.5 ${activeTool === "edit_roof" ? "bg-amber-500 text-slate-950 font-bold" : "text-amber-400 hover:text-white"}`}
                  title="Drag vertices or add points on edges"
                >
                  <Edit3 className="w-3.5 h-3.5" /> Edit Roof
                </Button>
              )}

              <Button
                size="sm"
                variant={activeTool === "add_panel" ? "default" : "ghost"}
                onClick={() => { setActiveTool("add_panel"); setActiveDrawPoints([]); }}
                className={`h-7 text-xs px-2.5 rounded-lg gap-1.5 ${activeTool === "add_panel" ? "bg-blue-600 text-white" : "text-blue-400 hover:text-white"}`}
                title="Click on roof to place individual panel"
              >
                <Plus className="w-3.5 h-3.5" /> + Add Panel
              </Button>

              <Button
                size="sm"
                variant={activeTool === "calibrate" ? "default" : "ghost"}
                onClick={() => { setActiveTool("calibrate"); setCalibratePoints([]); }}
                className="h-7 text-xs px-2 rounded-lg gap-1.5 text-purple-400 hover:text-purple-300"
                title="Measure distance & calibrate map scale"
              >
                <Ruler className="w-3.5 h-3.5" /> Calibrate
              </Button>

              {hasRoof && (
                <>
                  <div className="w-[1px] h-4 bg-slate-700 mx-0.5" />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (window.confirm("Clear roof polygon and panels?")) {
                        pushVertexHistory(roofPolygonRef.current);
                        setRoofPolygon([]);
                        setActiveDrawPoints([]);
                        setPanels?.([]);
                      }
                    }}
                    className="h-7 px-2 rounded-lg text-slate-400 hover:text-red-400"
                    title="Clear Roof & Panels"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </>
              )}
            </>
          )}
        </div>

        {/* Right: Small Floating Map Controls (Zoom, Fit, Types) */}
        <div className="flex items-center gap-1 bg-slate-900/95 backdrop-blur-md p-1 rounded-xl border border-slate-700/80 shadow-lg pointer-events-auto">
          <Button size="sm" variant={mapType === "satellite" ? "secondary" : "ghost"} onClick={() => setMapType("satellite")} className="h-6 text-[11px] px-2 rounded-lg">Satellite</Button>
          <Button size="sm" variant={mapType === "hybrid" ? "secondary" : "ghost"} onClick={() => setMapType("hybrid")} className="h-6 text-[11px] px-2 rounded-lg">Hybrid</Button>
          <Button size="sm" variant={mapType === "street" ? "secondary" : "ghost"} onClick={() => setMapType("street")} className="h-6 text-[11px] px-2 rounded-lg">Street</Button>
          <div className="w-[1px] h-3.5 bg-slate-700 mx-0.5" />
          <Button size="sm" variant="ghost" onClick={handleZoomIn} className="h-6 w-6 p-0 rounded-lg text-slate-300 hover:text-white font-bold text-sm" title="Zoom In (+)">+</Button>
          <Button size="sm" variant="ghost" onClick={handleZoomOut} className="h-6 w-6 p-0 rounded-lg text-slate-300 hover:text-white font-bold text-sm" title="Zoom Out (−)">−</Button>
          <div className="w-[1px] h-3.5 bg-slate-700 mx-0.5" />
          <Button
            size="sm"
            variant="ghost"
            onClick={handleFitRoof}
            disabled={!hasRoof}
            className="h-6 px-1.5 rounded-lg text-emerald-400 hover:text-emerald-300 text-[10px] gap-0.5 disabled:opacity-30"
            title="Fit view to roof"
          >
            Fit Roof
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleFitDesign}
            className="h-6 px-1.5 rounded-lg text-blue-400 hover:text-blue-300 text-[10px] gap-0.5"
            title="Fit view to all components"
          >
            Fit Design
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleLocateCenter}
            className="h-6 px-1.5 rounded-lg text-slate-400 hover:text-slate-200 text-[10px] gap-0.5"
            title="Recenter on site marker"
          >
            <Navigation className="w-3 h-3" />
          </Button>
        </div>
      </div>

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
