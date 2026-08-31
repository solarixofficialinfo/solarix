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
  AlertTriangle, Navigation, CheckCircle2, ShieldCheck, Undo2, MapPin, Check, Info, PlusCircle
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

// Fix Leaflet marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

/**
 * High-Precision Interactive Live Satellite Rooftop Designer Map
 * 
 * Features:
 * - Real high-resolution satellite imagery (Esri World Imagery + Hybrid road labels + OSM)
 * - Point-and-click polygon roof boundary tracing directly on top of satellite imagery
 * - Draggable polygon vertices with real-time recalculation
 * - Real-time segment dimension labels (e.g. 12.4m) ONLY when roof polygon exists
 * - Interactive "+ Add Panel" placement tool with boundary & obstacle validation
 * - Move/Drag existing panels with collision avoidance
 * - Reference measurement calibration tool
 */
const LiveSatelliteMap = forwardRef(function LiveSatelliteMap(
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
    activeTool = "select", // 'select' | 'draw_roof' | 'add_panel' | 'calibrate'
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

  const [mapType, setMapType] = useState("satellite"); // 'satellite' | 'hybrid' | 'street'
  const [mapError, setMapError] = useState(null);
  const [activeDrawPoints, setActiveDrawPoints] = useState([]);
  const [cursorCoords, setCursorCoords] = useState({ lat: latitude, lng: longitude });

  // Calibration tool state
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

  const originLat = Number(latitude) || 19.076;
  const originLng = Number(longitude) || 72.8777;
  const latRad = toRad(originLat);

  // Helper: Cartesian (meters) <-> LatLng
  const cartesianToLatLng = useCallback((x, y) => {
    const dLngRad = x / (Math.cos(latRad) * 6378137);
    const dLatRad = y / 6378137;
    return [originLat + toDeg(dLatRad), originLng + toDeg(dLngRad)];
  }, [latRad, originLat, originLng]);

  const latLngToCartesian = useCallback((lat, lng) => {
    const x = (toRad(lng) - toRad(originLng)) * Math.cos(latRad) * 6378137;
    const y = (toRad(lat) - toRad(originLat)) * 6378137;
    return { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 };
  }, [latRad, originLat, originLng]);

  // Expose snapshot export and panTo functions to parent
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
      } catch (e) {
        return null;
      }
    },
    panTo: (lat, lng) => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setView([lat, lng], 19, { animate: true });
        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
        }
      }
    },
  }));

  // Handle Manual Click on Map to Add Panel
  const handleMapClickForAddPanel = useCallback((lat, lng) => {
    if (!roofPolygon || roofPolygon.length < 3) {
      toast.warning("Please draw a roof boundary first before adding panels.");
      return;
    }

    const { x, y } = latLngToCartesian(lat, lng);
    const isPortrait = orientation.toLowerCase() === "portrait";
    const pWidth = isPortrait ? (panelSpecs.width_m || 1.134) : (panelSpecs.length_m || 2.278);
    const pLength = isPortrait ? (panelSpecs.length_m || 2.278) : (panelSpecs.width_m || 1.134);

    const candidate = {
      x,
      y,
      width: pWidth,
      height: pLength,
      rotation: 0,
    };

    const check = validatePanelPlacement({
      candidate,
      roofPolygon,
      setbackMeters,
      panels,
      obstacles,
      walkways,
    });

    if (!check.valid) {
      toast.warning(check.reason || "Cannot place panel here: outside boundary or blocked.");
      return;
    }

    const newPanel = {
      id: `panel-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      x,
      y,
      width: pWidth,
      height: pLength,
      rotation: 0,
      azimuth: azimuthDegrees || 180,
      wattage: panelSpecs.wattage || 550,
      locked: false,
      hidden: false,
    };

    setPanels((prev) => [...prev, newPanel]);
    setSelectedPanelId(newPanel.id);
    toast.success(`Placed Panel #${panels.length + 1}`);
  }, [
    roofPolygon,
    latLngToCartesian,
    orientation,
    panelSpecs,
    setbackMeters,
    panels,
    obstacles,
    walkways,
    azimuthDegrees,
    setPanels,
    setSelectedPanelId,
  ]);

  // Initialize Leaflet Map Instance
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    try {
      const initialLat = Number(latitude) || 19.076;
      const initialLng = Number(longitude) || 72.8777;

      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom: zoom || 19,
        maxZoom: 22,
        minZoom: 4,
        zoomControl: false,
        attributionControl: false,
      });

      mapInstanceRef.current = map;

      tileLayerGroupRef.current = L.layerGroup().addTo(map);
      roofLayerGroupRef.current = L.layerGroup().addTo(map);
      obstaclesLayerGroupRef.current = L.layerGroup().addTo(map);
      panelsLayerGroupRef.current = L.layerGroup().addTo(map);

      const centerMarker = L.marker([initialLat, initialLng], {
        draggable: true,
        title: "Solar Rooftop Site Location",
      }).addTo(map);

      centerMarker.on("dragend", () => {
        const pos = centerMarker.getLatLng();
        if (onLocationChange) {
          onLocationChange({ latitude: pos.lat, longitude: pos.lng });
        }
      });

      markerRef.current = centerMarker;

      map.on("mousemove", (e) => {
        setCursorCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
      });

      map.on("click", (e) => {
        const { lat, lng } = e.latlng;

        if (window.__activeSolarTool === "draw_roof") {
          setActiveDrawPoints((prev) => [...prev, { lat, lng }]);
        } else if (window.__activeSolarTool === "add_panel") {
          window.__handleSolarMapClickAddPanel?.(lat, lng);
        } else if (window.__activeSolarTool === "calibrate") {
          setCalibratePoints((prev) => {
            const next = [...prev, { lat, lng }];
            if (next.length === 2) {
              setShowCalibrateModal(true);
            }
            return next;
          });
        }
      });

      setMapError(null);
    } catch (err) {
      console.error("Leaflet initialization failed", err);
      setMapError("Satellite map engine initialization failed: " + err.message);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    window.__activeSolarTool = activeTool;
    window.__handleSolarMapClickAddPanel = handleMapClickForAddPanel;
  }, [activeTool, handleMapClickForAddPanel]);

  // Update Base Tile Layer on mapType change
  useEffect(() => {
    const tileGroup = tileLayerGroupRef.current;
    if (!tileGroup) return;

    tileGroup.clearLayers();

    if (mapType === "satellite") {
      const esriSatellite = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 21, maxNativeZoom: 19, subdomains: ["server", "services"] }
      );
      esriSatellite.addTo(tileGroup);
    } else if (mapType === "hybrid") {
      const esriSatellite = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 21, maxNativeZoom: 19 }
      );
      const esriLabels = L.tileLayer(
        "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 21, maxNativeZoom: 19 }
      );
      esriSatellite.addTo(tileGroup);
      esriLabels.addTo(tileGroup);
    } else {
      const osmStreet = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 20,
        subdomains: ["a", "b", "c"],
      });
      osmStreet.addTo(tileGroup);
    }
  }, [mapType]);

  // Pan map when coordinates change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!lat || !lng) return;

    const currentCenter = map.getCenter();
    if (Math.abs(currentCenter.lat - lat) > 0.0001 || Math.abs(currentCenter.lng - lng) > 0.0001) {
      map.setView([lat, lng], zoom || 19, { animate: true });
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      }
    }
  }, [latitude, longitude, zoom]);

  // Finish Drawing Roof Polygon directly on Satellite Map
  const handleFinishDrawingRoof = useCallback(() => {
    if (activeDrawPoints.length < 3) {
      alert("A roof boundary requires at least 3 points. Click on the satellite map to add points.");
      return;
    }

    let sumLat = 0;
    let sumLng = 0;
    activeDrawPoints.forEach((p) => {
      sumLat += p.lat;
      sumLng += p.lng;
    });
    const origin = { lat: sumLat / activeDrawPoints.length, lng: sumLng / activeDrawPoints.length };
    const baseLatRad = toRad(origin.lat);

    const cartesianPoints = activeDrawPoints.map((pt) => {
      const x = (toRad(pt.lng) - toRad(origin.lng)) * Math.cos(baseLatRad) * 6378137;
      const y = (toRad(pt.lat) - toRad(origin.lat)) * 6378137;
      return {
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100,
        lat: pt.lat,
        lng: pt.lng,
      };
    });

    setRoofPolygon(cartesianPoints);
    setActiveDrawPoints([]);
    setActiveTool("select");
  }, [activeDrawPoints, setRoofPolygon, setActiveTool]);

  // Apply Calibration
  const handleApplyCalibration = () => {
    if (calibratePoints.length < 2) return;
    const distGeodesic = getHaversineDistance(
      calibratePoints[0].lat,
      calibratePoints[0].lng,
      calibratePoints[1].lat,
      calibratePoints[1].lng
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

      if (onCalibrationComplete) {
        onCalibrationComplete({ measuredMeters: distGeodesic, targetMeters, scaleFactor });
      }
    }

    setCalibratePoints([]);
    setShowCalibrateModal(false);
    setActiveTool("select");
  };

  // Render Overlays (Roof Polygon, Dimension Labels, Obstacles, Panels) on Leaflet Map
  useEffect(() => {
    const map = mapInstanceRef.current;
    const roofGroup = roofLayerGroupRef.current;
    const obsGroup = obstaclesLayerGroupRef.current;
    const panelGroup = panelsLayerGroupRef.current;

    if (!map || !roofGroup || !obsGroup || !panelGroup) return;

    roofGroup.clearLayers();
    obsGroup.clearLayers();
    panelGroup.clearLayers();

    // 1. Draw Active Drawing In-Progress Line & Vertices
    if (activeDrawPoints.length > 0) {
      const latLngs = activeDrawPoints.map((p) => [p.lat, p.lng]);
      L.polyline(latLngs, {
        color: "#10b981",
        weight: 3,
        dashArray: "6, 6",
      }).addTo(roofGroup);

      activeDrawPoints.forEach((p, idx) => {
        const circleMarker = L.circleMarker([p.lat, p.lng], {
          radius: 6,
          fillColor: idx === 0 ? "#10b981" : "#2563eb",
          fillOpacity: 1,
          color: "#ffffff",
          weight: 2,
        }).addTo(roofGroup);

        circleMarker.bindTooltip(`P${idx + 1}`, {
          permanent: true,
          direction: "top",
          className: "px-1 py-0 text-[10px] font-bold",
        });
      });
    }

    // 2. Draw Committed Roof Boundary Polygon (ONLY if >= 3 vertices)
    if (layers.roofBoundary && roofPolygon && roofPolygon.length >= 3) {
      const polyLatLngs = roofPolygon.map((p) => {
        if (p.lat && p.lng) return [p.lat, p.lng];
        return cartesianToLatLng(p.x, p.y);
      });

      const roofPoly = L.polygon(polyLatLngs, {
        color: "#2563eb",
        weight: 3,
        fillColor: "#3b82f6",
        fillOpacity: 0.25,
      }).addTo(roofGroup);

      // Vertex Markers
      polyLatLngs.forEach((latlng, idx) => {
        const vertexMarker = L.circleMarker(latlng, {
          radius: 6,
          fillColor: "#2563eb",
          fillOpacity: 1,
          color: "#ffffff",
          weight: 2,
        }).addTo(roofGroup);

        vertexMarker.bindTooltip(`P${idx + 1}`, { permanent: false, direction: "top" });
      });

      // 3. Draw Segment Dimension Labels
      if (layers.dimensions) {
        for (let i = 0; i < roofPolygon.length; i++) {
          const j = (i + 1) % roofPolygon.length;
          const p1 = roofPolygon[i];
          const p2 = roofPolygon[j];
          const lenM = Math.hypot(p2.x - p1.x, p2.y - p1.y);

          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;
          const midLatLng =
            p1.lat && p2.lat
              ? [(p1.lat + p2.lat) / 2, (p1.lng + p2.lng) / 2]
              : cartesianToLatLng(midX, midY);

          const dimIcon = L.divIcon({
            className:
              "bg-white/95 px-1.5 py-0.5 rounded-md border border-blue-300 text-[10px] font-bold text-blue-900 shadow-sm text-center select-none pointer-events-none whitespace-nowrap",
            html: `${lenM.toFixed(1)}m`,
            iconSize: [42, 18],
            iconAnchor: [21, 9],
          });

          L.marker(midLatLng, { icon: dimIcon, interactive: false }).addTo(roofGroup);
        }
      }

      // 4. Draw Setback Clearance Margin Line
      if (layers.setbacks && setbackMeters > 0) {
        const setbackPoly = computeSetbackPolygon(roofPolygon, setbackMeters);
        if (setbackPoly && setbackPoly.length >= 3) {
          const setbackLatLngs = setbackPoly.map((p) => cartesianToLatLng(p.x, p.y));
          L.polygon(setbackLatLngs, {
            color: "#dc2626",
            weight: 1.5,
            dashArray: "4, 4",
            fillOpacity: 0,
          }).addTo(roofGroup);
        }
      }
    }

    // 5. Draw Obstacles (ONLY if explicitly added)
    if (layers.obstacles && Array.isArray(obstacles) && obstacles.length > 0) {
      obstacles.forEach((obs) => {
        const ow = Number(obs.length || 1.8);
        const ol = Number(obs.width || 1.8);
        const corners = getRotatedRectCorners(obs.x, obs.y, ow, ol, obs.rotation || 0);
        const obsLatLngs = corners.map((c) => cartesianToLatLng(c.x, c.y));

        L.polygon(obsLatLngs, {
          color: "#dc2626",
          weight: 2,
          fillColor: "#ef4444",
          fillOpacity: 0.45,
        }).addTo(obsGroup);

        const centerLatLng = cartesianToLatLng(obs.x, obs.y);
        const labelIcon = L.divIcon({
          className:
            "bg-red-900/90 text-white px-1.5 py-0.5 rounded text-[9.5px] font-bold shadow-xs whitespace-nowrap",
          html: obs.name || obs.type || "Obstacle",
          iconSize: [60, 16],
          iconAnchor: [30, 8],
        });

        L.marker(centerLatLng, { icon: labelIcon, interactive: false }).addTo(obsGroup);
      });
    }

    // 6. Draw Solar PV Modules with Drag & Click Support
    if (layers.panels && Array.isArray(panels) && panels.length > 0) {
      panels.forEach((p, idx) => {
        if (p.hidden) return;

        const isSelected = p.id === selectedPanelId;
        const corners = getRotatedRectCorners(
          p.x,
          p.y,
          p.width || 1.134,
          p.height || 2.278,
          p.rotation || 0
        );
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
          setSelectedPanelId(p.id);
        });

        // Draggable Handle for moving selected panel
        if (isSelected) {
          const moveHandle = L.marker(centerLatLng, {
            draggable: true,
            icon: L.divIcon({
              className: "bg-amber-400 text-slate-950 font-bold px-1.5 py-0.5 rounded-full shadow-lg border border-white text-[9px] cursor-move",
              html: "✛ Move",
              iconSize: [44, 18],
              iconAnchor: [22, 9],
            }),
          }).addTo(panelGroup);

          moveHandle.on("dragend", (e) => {
            const newPos = e.target.getLatLng();
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
              setPanels((prev) =>
                prev.map((item) => (item.id === p.id ? { ...item, x: newX, y: newY } : item))
              );
              toast.success(`Moved Panel #${idx + 1}`);
            } else {
              toast.warning(validation.reason || "Invalid position: outside boundary or overlaps obstacle.");
              // Force re-render to revert position
              setPanels((prev) => [...prev]);
            }
          });
        } else {
          const panelNumIcon = L.divIcon({
            className: "text-[8px] font-bold text-center text-blue-200 select-none pointer-events-none",
            html: `${idx + 1}`,
            iconSize: [16, 12],
            iconAnchor: [8, 6],
          });
          L.marker(centerLatLng, { icon: panelNumIcon, interactive: false }).addTo(panelGroup);
        }
      });
    }
  }, [
    roofPolygon,
    panels,
    obstacles,
    walkways,
    setbackMeters,
    activeDrawPoints,
    layers,
    selectedPanelId,
    latitude,
    longitude,
    cartesianToLatLng,
    latLngToCartesian,
    setPanels,
    setSelectedPanelId,
  ]);

  // Zoom & Location Helpers
  const handleZoomIn = () => mapInstanceRef.current?.zoomIn();
  const handleZoomOut = () => mapInstanceRef.current?.zoomOut();
  const handleLocateCenter = () => {
    if (mapInstanceRef.current && latitude && longitude) {
      mapInstanceRef.current.setView([latitude, longitude], 19, { animate: true });
    }
  };

  const roofArea = getCartesianPolygonArea(roofPolygon);
  const roofPerimeter = getCartesianPolygonPerimeter(roofPolygon);
  const hasRoof = roofPolygon && roofPolygon.length >= 3;

  return (
    <div className="relative w-full h-full min-h-[580px] rounded-2xl overflow-hidden bg-slate-900 border border-slate-700 shadow-xl select-none flex flex-col">
      <div ref={mapContainerRef} className="w-full h-full flex-1 z-0 cursor-crosshair" />

      {mapError && (
        <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-white z-50">
          <AlertTriangle className="w-12 h-12 text-amber-400 mb-3" />
          <h3 className="text-lg font-bold">Satellite Map Notice</h3>
          <p className="text-xs text-slate-300 max-w-md my-2">{mapError}</p>
          <Button
            onClick={() => setMapType("street")}
            className="bg-blue-600 hover:bg-blue-700 text-xs font-semibold px-4 py-2 mt-3 rounded-xl"
          >
            Continue with Street Map
          </Button>
        </div>
      )}

      {/* Empty State Guidance Hint */}
      {!hasRoof && activeDrawPoints.length === 0 && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 bg-slate-900/90 backdrop-blur-md px-4 py-2 rounded-xl border border-blue-500/60 shadow-xl text-xs text-blue-200 pointer-events-none flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-400 shrink-0" />
          <span>Search site location, then click <b>'Draw Roof'</b> to trace the building perimeter.</span>
        </div>
      )}

      {/* Top Floating Compact Toolbar Bar */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none gap-2 z-10">
        {/* Left Toolbar: Interaction Tools */}
        <div className="flex items-center gap-1 bg-slate-900/95 backdrop-blur-md p-1 rounded-xl border border-slate-700/80 shadow-lg pointer-events-auto">
          <Button
            size="sm"
            variant={activeTool === "select" ? "default" : "ghost"}
            onClick={() => {
              setActiveTool("select");
              setActiveDrawPoints([]);
            }}
            className="h-7 text-xs px-2.5 rounded-lg gap-1.5"
            title="Select & Drag Objects"
          >
            <MousePointer className="w-3.5 h-3.5" /> Select
          </Button>

          <Button
            size="sm"
            variant={activeTool === "draw_roof" ? "default" : "ghost"}
            onClick={() => {
              setActiveTool("draw_roof");
              setActiveDrawPoints([]);
            }}
            className={`h-7 text-xs px-2.5 rounded-lg gap-1.5 ${
              activeTool === "draw_roof"
                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                : "text-emerald-400 hover:text-white"
            }`}
            title="Click points directly on satellite imagery to trace roof"
          >
            <PenTool className="w-3.5 h-3.5" /> Draw Roof
          </Button>

          <Button
            size="sm"
            variant={activeTool === "add_panel" ? "default" : "ghost"}
            onClick={() => {
              setActiveTool("add_panel");
              setActiveDrawPoints([]);
            }}
            className={`h-7 text-xs px-2.5 rounded-lg gap-1.5 ${
              activeTool === "add_panel"
                ? "bg-amber-600 hover:bg-amber-700 text-white"
                : "text-amber-400 hover:text-white"
            }`}
            title="Click anywhere on the roof to manually add a panel"
          >
            <Plus className="w-3.5 h-3.5" /> + Add Panel
          </Button>

          <Button
            size="sm"
            variant={activeTool === "calibrate" ? "default" : "ghost"}
            onClick={() => {
              setActiveTool("calibrate");
              setCalibratePoints([]);
            }}
            className="h-7 text-xs px-2 rounded-lg gap-1.5 text-purple-400 hover:text-purple-300"
            title="Calibrate measurement with known distance"
          >
            <Ruler className="w-3.5 h-3.5" /> Calibrate
          </Button>

          {activeTool === "draw_roof" && activeDrawPoints.length >= 3 && (
            <Button
              size="sm"
              onClick={handleFinishDrawingRoof}
              className="h-7 text-xs px-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold animate-pulse shadow-sm"
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Close Roof ({activeDrawPoints.length} pts)
            </Button>
          )}

          {hasRoof && (
            <>
              <div className="w-[1px] h-4 bg-slate-700 mx-0.5" />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setRoofPolygon([]);
                  setActiveDrawPoints([]);
                  setPanels([]);
                }}
                className="h-7 px-2 rounded-lg text-slate-400 hover:text-red-400"
                title="Clear Roof & Panels"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </>
          )}
        </div>

        {/* Right Toolbar: Map Type Selector & Controls */}
        <div className="flex items-center gap-1 bg-slate-900/95 backdrop-blur-md p-1 rounded-xl border border-slate-700/80 shadow-lg pointer-events-auto">
          <Button
            size="sm"
            variant={mapType === "satellite" ? "secondary" : "ghost"}
            onClick={() => setMapType("satellite")}
            className="h-6 text-[11px] px-2 rounded-lg"
          >
            Satellite
          </Button>
          <Button
            size="sm"
            variant={mapType === "hybrid" ? "secondary" : "ghost"}
            onClick={() => setMapType("hybrid")}
            className="h-6 text-[11px] px-2 rounded-lg"
          >
            Hybrid
          </Button>
          <Button
            size="sm"
            variant={mapType === "street" ? "secondary" : "ghost"}
            onClick={() => setMapType("street")}
            className="h-6 text-[11px] px-2 rounded-lg"
          >
            Street
          </Button>

          <div className="w-[1px] h-3.5 bg-slate-700 mx-0.5" />

          <Button
            size="sm"
            variant="ghost"
            onClick={handleZoomIn}
            className="h-6 w-6 p-0 rounded-lg text-slate-300 hover:text-white"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleZoomOut}
            className="h-6 w-6 p-0 rounded-lg text-slate-300 hover:text-white"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleLocateCenter}
            className="h-6 w-6 p-0 rounded-lg text-blue-400 hover:text-blue-300"
            title="Center Site Marker"
          >
            <Navigation className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Selected Panel Toolbar (Floating Contextual) */}
      {selectedPanelId && (
        <div className="absolute top-14 left-3 z-10 flex items-center gap-1 bg-blue-900/95 backdrop-blur-md p-1.5 rounded-xl border border-blue-500 shadow-xl pointer-events-auto animate-in fade-in">
          <span className="text-[11px] font-semibold text-blue-200 px-2">
            Panel #{panels.findIndex((p) => p.id === selectedPanelId) + 1}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setPanels((prev) =>
                prev.map((p) => (p.id === selectedPanelId ? { ...p, rotation: (p.rotation || 0) + 90 } : p))
              );
            }}
            className="h-6 text-xs px-2 rounded-lg text-white hover:bg-blue-800"
            title="Rotate 90°"
          >
            <RotateCw className="w-3 h-3 mr-1" /> Rotate
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const target = panels.find((p) => p.id === selectedPanelId);
              if (!target) return;
              const dup = { ...target, id: `panel-${Date.now()}`, x: target.x + 1.2 };
              setPanels([...panels, dup]);
              setSelectedPanelId(dup.id);
              toast.success("Duplicated panel");
            }}
            className="h-6 text-xs px-2 rounded-lg text-white hover:bg-blue-800"
            title="Duplicate"
          >
            <Copy className="w-3 h-3 mr-1" /> Duplicate
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setPanels((prev) => prev.filter((p) => p.id !== selectedPanelId));
              setSelectedPanelId(null);
              toast.success("Removed panel");
            }}
            className="h-6 text-xs px-2 rounded-lg text-red-300 hover:bg-red-900"
            title="Delete Panel"
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      )}

      {/* Manual Add Panel Guidance */}
      {activeTool === "add_panel" && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 bg-amber-950/95 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-amber-600 shadow-xl text-xs text-amber-200 pointer-events-auto flex items-center gap-2">
          <PlusCircle className="w-3.5 h-3.5 text-amber-400 animate-bounce shrink-0" />
          <span>Click anywhere on the open roof space to place a solar panel</span>
        </div>
      )}

      {/* Drawing Instructions Overlay */}
      {activeTool === "draw_roof" && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 bg-emerald-950/95 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-emerald-600 shadow-xl text-xs text-emerald-200 pointer-events-auto flex items-center gap-2.5">
          <PenTool className="w-3.5 h-3.5 text-emerald-400 animate-pulse shrink-0" />
          <span>
            Click corners of the rooftop on the satellite map ({activeDrawPoints.length} points placed)
          </span>
          {activeDrawPoints.length >= 3 && (
            <Button
              size="sm"
              onClick={handleFinishDrawingRoof}
              className="h-6 px-2 text-xs bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg ml-1"
            >
              Done / Close
            </Button>
          )}
        </div>
      )}

      {/* Bottom Live Metrics & Imagery Metadata HUD */}
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
          <span>Cursor: <b>{cursorCoords.lat.toFixed(5)}, {cursorCoords.lng.toFixed(5)}</b></span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400">Satellite imagery</span>
          {isCalibrated && (
            <>
              <span className="text-slate-600">|</span>
              <Badge variant="outline" className="text-[9px] bg-purple-950 text-purple-300 border-purple-800 py-0">
                Calibrated
              </Badge>
            </>
          )}
        </div>
      </div>

      {/* Measurement Calibration Dialog */}
      <Dialog open={showCalibrateModal} onOpenChange={setShowCalibrateModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Ruler className="w-5 h-5 text-purple-600" /> Calibrate Roof Reference Dimension
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm text-slate-600">
            <p>
              You clicked two points on the satellite image. Enter the known physical on-site distance between these two points:
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Known Distance (meters)</Label>
              <Input
                type="number"
                step="0.1"
                min="0.5"
                max="500"
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

export default LiveSatelliteMap;
