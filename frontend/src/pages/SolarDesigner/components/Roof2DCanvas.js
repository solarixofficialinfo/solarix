import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  MousePointer, PenTool, Ruler, Square, Trash2, RotateCw, Copy, Lock, Unlock,
  Undo2, Redo2, Eye, EyeOff, Layers, ZoomIn, ZoomOut, Maximize2, Compass,
  Move, Plus, Sparkles, Check
} from "lucide-react";
import {
  getCartesianPolygonArea,
  getCartesianPolygonPerimeter,
  getPolygonBounds,
  computeSetbackPolygon,
  getRotatedRectCorners,
} from "../utils/geoCalculations";

/**
 * 2D Interactive Solar Rooftop Canvas
 */
const Roof2DCanvas = forwardRef(function Roof2DCanvas(
  {
    roofPolygon = [],
    setRoofPolygon,
    panels = [],
    setPanels,
    obstacles = [],
    setObstacles,
    walkways = [],
    setWalkways,
    setbackMeters = 0.5,
    backgroundImage = null,
    activeTool = "select", // 'select' | 'draw_roof' | 'calibrate' | 'add_obstacle' | 'add_walkway' | 'measure'
    setActiveTool,
    onPanelSelect,
    selectedPanelId = null,
    setSelectedPanelId,
    onCalibrationComplete,
    orientation = "portrait",
    panelSpecs = {},
  },
  ref
) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // Viewport Transform (Pan & Zoom)
  const [viewState, setViewState] = useState({
    scale: 25, // pixels per meter (default 1m = 25px)
    offsetX: 0,
    offsetY: 0,
    isPanning: false,
    panStartX: 0,
    panStartY: 0,
  });

  // Drawing & Interaction State
  const [dragState, setDragState] = useState(null); // { type: 'vertex'|'panel'|'obstacle', index/id, startX, startY }
  const [hoveredItem, setHoveredItem] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  // Calibration tool modal
  const [calibratePoints, setCalibratePoints] = useState([]);
  const [showCalibrateModal, setShowCalibrateModal] = useState(false);
  const [calibrateDistanceInput, setCalibrateDistanceInput] = useState("10");

  // Measure tool state
  const [measurePoints, setMeasurePoints] = useState([]);

  // Layer Visibility
  const [layers, setLayers] = useState({
    background: true,
    roofBoundary: true,
    setbacks: true,
    dimensions: true,
    panels: true,
    obstacles: true,
    walkways: true,
    grid: true,
  });

  // Expose snapshot generator to parent
  useImperativeHandle(ref, () => ({
    getSnapshotDataUrl: () => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      return canvas.toDataURL("image/png");
    },
  }));

  // Center viewport on polygon bounds
  const centerViewOnRoof = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !roofPolygon || roofPolygon.length < 2) return;

    const bounds = getPolygonBounds(roofPolygon);
    const canvasW = canvas.width;
    const canvasH = canvas.height;

    const roofW = Math.max(5, bounds.width);
    const roofH = Math.max(5, bounds.length);

    // Calculate scale to fit with 20% margin
    const scaleX = (canvasW * 0.7) / roofW;
    const scaleY = (canvasH * 0.7) / roofH;
    const fitScale = Math.min(Math.max(scaleX, scaleY), 80);

    const offX = canvasW / 2 - bounds.centerX * fitScale;
    const offY = canvasH / 2 + bounds.centerY * fitScale; // Invert Y for screen

    setViewState((prev) => ({
      ...prev,
      scale: fitScale,
      offsetX: offX,
      offsetY: offY,
    }));
  }, [roofPolygon]);

  // Initial Auto-Center
  useEffect(() => {
    if (roofPolygon && roofPolygon.length >= 3 && viewState.offsetX === 0) {
      centerViewOnRoof();
    }
  }, [roofPolygon, centerViewOnRoof, viewState.offsetX]);

  // Coordinate Conversion Helpers
  const screenToWorld = useCallback(
    (screenX, screenY) => {
      const worldX = (screenX - viewState.offsetX) / viewState.scale;
      const worldY = -(screenY - viewState.offsetY) / viewState.scale; // Invert Y
      return { x: worldX, y: worldY };
    },
    [viewState]
  );

  const worldToScreen = useCallback(
    (worldX, worldY) => {
      const screenX = worldX * viewState.scale + viewState.offsetX;
      const screenY = -worldY * viewState.scale + viewState.offsetY;
      return { x: screenX, y: screenY };
    },
    [viewState]
  );

  // Redraw Canvas
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // 1. Draw Background Grid
    if (layers.grid) {
      ctx.save();
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 1;
      const gridSizeM = 1; // 1 meter grid
      const gridPx = gridSizeM * viewState.scale;

      const startX = viewState.offsetX % gridPx;
      const startY = viewState.offsetY % gridPx;

      ctx.beginPath();
      for (let x = startX; x < width; x += gridPx) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = startY; y < height; y += gridPx) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();

      // Major 5-meter grid lines
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1.2;
      const majorGridPx = 5 * viewState.scale;
      const majorStartX = viewState.offsetX % majorGridPx;
      const majorStartY = viewState.offsetY % majorGridPx;

      ctx.beginPath();
      for (let x = majorStartX; x < width; x += majorGridPx) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = majorStartY; y < height; y += majorGridPx) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 2. Draw Roof Boundary Polygon
    if (layers.roofBoundary && roofPolygon && roofPolygon.length > 0) {
      ctx.save();
      ctx.beginPath();
      roofPolygon.forEach((pt, idx) => {
        const s = worldToScreen(pt.x, pt.y);
        if (idx === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });

      if (roofPolygon.length >= 3) {
        ctx.closePath();
        ctx.fillStyle = "rgba(226, 232, 240, 0.45)"; // Soft concrete fill
        ctx.fill();
      }

      ctx.strokeStyle = "#2563eb"; // Blue outline
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Draw Vertices
      roofPolygon.forEach((pt, idx) => {
        const s = worldToScreen(pt.x, pt.y);
        ctx.beginPath();
        ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = idx === 0 ? "#16a34a" : "#2563eb";
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Vertex Index label
        ctx.fillStyle = "#1e293b";
        ctx.font = "bold 10px sans-serif";
        ctx.fillText(`P${idx + 1}`, s.x + 8, s.y - 6);
      });

      // 3. Draw Edge Dimension Labels
      if (layers.dimensions && roofPolygon.length >= 2) {
        ctx.font = "10px sans-serif";
        ctx.fillStyle = "#1e40af";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        for (let i = 0; i < roofPolygon.length; i++) {
          const j = (i + 1) % roofPolygon.length;
          if (j === 0 && roofPolygon.length < 3) continue;

          const p1 = roofPolygon[i];
          const p2 = roofPolygon[j];
          const s1 = worldToScreen(p1.x, p1.y);
          const s2 = worldToScreen(p2.x, p2.y);

          const midX = (s1.x + s2.x) / 2;
          const midY = (s1.y + s2.y) / 2;

          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const lenM = Math.sqrt(dx * dx + dy * dy);

          // Draw dimension pill
          const label = `${lenM.toFixed(1)}m`;
          const textW = ctx.measureText(label).width + 8;
          ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
          ctx.fillRect(midX - textW / 2, midY - 8, textW, 16);
          ctx.strokeStyle = "#93c5fd";
          ctx.lineWidth = 1;
          ctx.strokeRect(midX - textW / 2, midY - 8, textW, 16);

          ctx.fillStyle = "#1e40af";
          ctx.fillText(label, midX, midY);
        }
      }
      ctx.restore();
    }

    // 4. Draw Inset / Setback Line
    if (layers.setbacks && setbackMeters > 0 && roofPolygon && roofPolygon.length >= 3) {
      const setbackPoly = computeSetbackPolygon(roofPolygon, setbackMeters);
      if (setbackPoly && setbackPoly.length >= 3) {
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = "#dc2626"; // Red dashed setback
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        setbackPoly.forEach((pt, idx) => {
          const s = worldToScreen(pt.x, pt.y);
          if (idx === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        });
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
    }

    // 5. Draw Walkways
    if (layers.walkways && walkways && walkways.length > 0) {
      ctx.save();
      walkways.forEach((w) => {
        const corners = getRotatedRectCorners(w.x, w.y, w.width || 0.6, w.length || 3.0, w.rotation || 0);
        ctx.beginPath();
        corners.forEach((c, idx) => {
          const s = worldToScreen(c.x, c.y);
          if (idx === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        });
        ctx.closePath();
        ctx.fillStyle = "rgba(245, 158, 11, 0.6)"; // Amber walkway
        ctx.fill();
        ctx.strokeStyle = "#d97706";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
      ctx.restore();
    }

    // 6. Draw Obstacles (No-panel exclusion zones)
    if (layers.obstacles && obstacles && obstacles.length > 0) {
      ctx.save();
      obstacles.forEach((obs) => {
        const ow = Number(obs.length || obs.width_m || 1.5);
        const ol = Number(obs.width || obs.height_m || 1.5);
        const corners = getRotatedRectCorners(obs.x, obs.y, ow, ol, obs.rotation || 0);

        ctx.beginPath();
        corners.forEach((c, idx) => {
          const s = worldToScreen(c.x, c.y);
          if (idx === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        });
        ctx.closePath();
        ctx.fillStyle = "rgba(239, 68, 68, 0.35)"; // Red exclusion zone
        ctx.fill();
        ctx.strokeStyle = "#dc2626";
        ctx.lineWidth = 1.8;
        ctx.stroke();

        // Center Obstacle Icon & Label
        const center = worldToScreen(obs.x, obs.y);
        ctx.fillStyle = "#991b1b";
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(obs.name || obs.type || "Obstacle", center.x, center.y);
      });
      ctx.restore();
    }

    // 7. Draw Solar Panels
    if (layers.panels && panels && panels.length > 0) {
      ctx.save();
      panels.forEach((p, idx) => {
        if (p.hidden) return;

        const isSelected = p.id === selectedPanelId;
        const corners = getRotatedRectCorners(p.x, p.y, p.width, p.height, p.rotation || 0);

        ctx.beginPath();
        corners.forEach((c, cIdx) => {
          const s = worldToScreen(c.x, c.y);
          if (cIdx === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        });
        ctx.closePath();

        // Panel Silicon Gradient / Fill
        ctx.fillStyle = isSelected ? "#3b82f6" : "#1e3a8a"; // Blue / Dark Blue
        ctx.fill();

        // Metallic Aluminium Frame Border
        ctx.strokeStyle = isSelected ? "#fbbf24" : "#93c5fd"; // Yellow if selected
        ctx.lineWidth = isSelected ? 2.5 : 1.2;
        ctx.stroke();

        // Panel Number Label
        const center = worldToScreen(p.x, p.y);
        ctx.fillStyle = isSelected ? "#ffffff" : "#bfdbfe";
        ctx.font = "bold 8px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`${idx + 1}`, center.x, center.y);
      });
      ctx.restore();
    }

    // 8. Draw Calibration / Measure In-Progress Line
    if ((activeTool === "calibrate" && calibratePoints.length > 0) || (activeTool === "measure" && measurePoints.length > 0)) {
      const pts = activeTool === "calibrate" ? calibratePoints : measurePoints;
      ctx.save();
      ctx.strokeStyle = "#8b5cf6"; // Purple calibration line
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);

      ctx.beginPath();
      pts.forEach((pt, idx) => {
        const s = worldToScreen(pt.x, pt.y);
        if (idx === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.stroke();

      pts.forEach((pt) => {
        const s = worldToScreen(pt.x, pt.y);
        ctx.beginPath();
        ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#8b5cf6";
        ctx.fill();
      });
      ctx.restore();
    }
  }, [
    roofPolygon,
    panels,
    obstacles,
    walkways,
    setbackMeters,
    layers,
    selectedPanelId,
    activeTool,
    calibratePoints,
    measurePoints,
    viewState,
    worldToScreen,
  ]);

  // Request Render Animation Frame
  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Canvas Resize Listener
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      renderCanvas();
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [renderCanvas]);

  // Mouse Interaction Handlers
  const handleMouseDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const world = screenToWorld(screenX, screenY);

    // Right-Click or Middle-Click -> Pan Viewport
    if (e.button === 2 || e.button === 1 || e.shiftKey) {
      setViewState((prev) => ({
        ...prev,
        isPanning: true,
        panStartX: screenX - prev.offsetX,
        panStartY: screenY - prev.offsetY,
      }));
      return;
    }

    if (e.button !== 0) return; // Left click only below

    // Tool: Draw Roof Boundary
    if (activeTool === "draw_roof") {
      // Check if clicking near start vertex to close polygon
      if (roofPolygon.length >= 3) {
        const startScreen = worldToScreen(roofPolygon[0].x, roofPolygon[0].y);
        const distToStart = Math.hypot(screenX - startScreen.x, screenY - startScreen.y);
        if (distToStart < 15) {
          // Close polygon!
          setActiveTool("select");
          return;
        }
      }
      setRoofPolygon([...roofPolygon, { x: world.x, y: world.y }]);
      return;
    }

    // Tool: Measure / Calibrate
    if (activeTool === "calibrate") {
      const nextPts = [...calibratePoints, world];
      if (nextPts.length === 2) {
        setCalibratePoints(nextPts);
        setShowCalibrateModal(true);
      } else {
        setCalibratePoints(nextPts);
      }
      return;
    }

    if (activeTool === "measure") {
      const nextPts = [...measurePoints, world];
      if (nextPts.length === 2) {
        const dist = Math.hypot(nextPts[1].x - nextPts[0].x, nextPts[1].y - nextPts[0].y);
        alert(`Measured Distance: ${dist.toFixed(2)} meters`);
        setMeasurePoints([]);
      } else {
        setMeasurePoints(nextPts);
      }
      return;
    }

    // Tool: Add Obstacle
    if (activeTool === "add_obstacle") {
      const newObs = {
        id: `obs-${Date.now()}`,
        name: "Water Tank",
        type: "water_tank",
        x: Math.round(world.x * 100) / 100,
        y: Math.round(world.y * 100) / 100,
        length: 1.8,
        width: 1.8,
        height: 1.6,
        rotation: 0,
      };
      setObstacles([...obstacles, newObs]);
      setActiveTool("select");
      return;
    }

    // Tool: Add Walkway
    if (activeTool === "add_walkway") {
      const newWalk = {
        id: `walk-${Date.now()}`,
        x: Math.round(world.x * 100) / 100,
        y: Math.round(world.y * 100) / 100,
        width: 0.6,
        length: 3.5,
        rotation: 0,
      };
      setWalkways([...walkways, newWalk]);
      setActiveTool("select");
      return;
    }

    // Tool: Select / Drag Mode
    if (activeTool === "select") {
      // 1. Check Vertex Click on Roof Polygon
      for (let i = 0; i < roofPolygon.length; i++) {
        const s = worldToScreen(roofPolygon[i].x, roofPolygon[i].y);
        if (Math.hypot(screenX - s.x, screenY - s.y) < 10) {
          setDragState({ type: "vertex", index: i });
          return;
        }
      }

      // 2. Check Panel Click
      for (let i = panels.length - 1; i >= 0; i--) {
        const p = panels[i];
        if (p.hidden) continue;
        const hw = p.width / 2;
        const hh = p.height / 2;
        if (world.x >= p.x - hw && world.x <= p.x + hw && world.y >= p.y - hh && world.y <= p.y + hh) {
          setSelectedPanelId(p.id);
          if (onPanelSelect) onPanelSelect(p);
          if (!p.locked) {
            setDragState({ type: "panel", id: p.id, startX: world.x - p.x, startY: world.y - p.y });
          }
          return;
        }
      }

      // 3. Check Obstacle Click
      for (let i = obstacles.length - 1; i >= 0; i--) {
        const obs = obstacles[i];
        const hw = (obs.length || 1.5) / 2;
        const hh = (obs.width || 1.5) / 2;
        if (world.x >= obs.x - hw && world.x <= obs.x + hw && world.y >= obs.y - hh && world.y <= obs.y + hh) {
          setDragState({ type: "obstacle", id: obs.id, startX: world.x - obs.x, startY: world.y - obs.y });
          return;
        }
      }

      // Clicked on empty space -> deselect
      setSelectedPanelId(null);
    }
  };

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    if (viewState.isPanning) {
      setViewState((prev) => ({
        ...prev,
        offsetX: screenX - prev.panStartX,
        offsetY: screenY - prev.panStartY,
      }));
      return;
    }

    const world = screenToWorld(screenX, screenY);

    if (dragState) {
      if (dragState.type === "vertex") {
        const updated = [...roofPolygon];
        updated[dragState.index] = { x: world.x, y: world.y };
        setRoofPolygon(updated);
      } else if (dragState.type === "panel") {
        setPanels((prev) =>
          prev.map((p) =>
            p.id === dragState.id
              ? { ...p, x: Math.round((world.x - dragState.startX) * 100) / 100, y: Math.round((world.y - dragState.startY) * 100) / 100 }
              : p
          )
        );
      } else if (dragState.type === "obstacle") {
        setObstacles((prev) =>
          prev.map((obs) =>
            obs.id === dragState.id
              ? { ...obs, x: Math.round((world.x - dragState.startX) * 100) / 100, y: Math.round((world.y - dragState.startY) * 100) / 100 }
              : obs
          )
        );
      }
    }
  };

  const handleMouseUp = () => {
    setViewState((prev) => ({ ...prev, isPanning: false }));
    setDragState(null);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newScale = Math.min(Math.max(viewState.scale * zoomFactor, 5), 200);

    // Zoom towards cursor
    const newOffsetX = screenX - (screenX - viewState.offsetX) * (newScale / viewState.scale);
    const newOffsetY = screenY - (screenY - viewState.offsetY) * (newScale / viewState.scale);

    setViewState((prev) => ({
      ...prev,
      scale: newScale,
      offsetX: newOffsetX,
      offsetY: newOffsetY,
    }));
  };

  // Calibration submit
  const handleApplyCalibration = () => {
    if (calibratePoints.length < 2) return;
    const measuredMeters = Math.hypot(calibratePoints[1].x - calibratePoints[0].x, calibratePoints[1].y - calibratePoints[0].y);
    const targetMeters = parseFloat(calibrateDistanceInput) || 10;

    if (measuredMeters > 0 && targetMeters > 0) {
      const scaleFactor = targetMeters / measuredMeters;
      // Rescale roof polygon vertices
      const rescaledRoof = roofPolygon.map((p) => ({ x: p.x * scaleFactor, y: p.y * scaleFactor }));
      setRoofPolygon(rescaledRoof);

      if (onCalibrationComplete) {
        onCalibrationComplete({
          measuredMeters,
          targetMeters,
          scaleFactor,
        });
      }
    }

    setCalibratePoints([]);
    setShowCalibrateModal(false);
    setActiveTool("select");
  };

  // Selected Panel Controls
  const handleRotateSelectedPanel = () => {
    if (!selectedPanelId) return;
    setPanels((prev) =>
      prev.map((p) => (p.id === selectedPanelId ? { ...p, rotation: (p.rotation || 0) + 90 } : p))
    );
  };

  const handleDeleteSelectedPanel = () => {
    if (!selectedPanelId) return;
    setPanels((prev) => prev.filter((p) => p.id !== selectedPanelId));
    setSelectedPanelId(null);
  };

  const handleDuplicateSelectedPanel = () => {
    if (!selectedPanelId) return;
    const target = panels.find((p) => p.id === selectedPanelId);
    if (!target) return;
    const duplicated = {
      ...target,
      id: `panel-${Date.now()}`,
      x: target.x + target.width + 0.1,
      y: target.y,
    };
    setPanels([...panels, duplicated]);
    setSelectedPanelId(duplicated.id);
  };

  const handleToggleLockSelectedPanel = () => {
    if (!selectedPanelId) return;
    setPanels((prev) =>
      prev.map((p) => (p.id === selectedPanelId ? { ...p, locked: !p.locked } : p))
    );
  };

  const roofArea = getCartesianPolygonArea(roofPolygon);
  const roofPerimeter = getCartesianPolygonPerimeter(roofPolygon);

  return (
    <div ref={containerRef} className="relative w-full h-[560px] rounded-2xl overflow-hidden bg-white border border-slate-200 shadow-xl select-none">
      {/* 2D Canvas Element */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
        className="w-full h-full cursor-crosshair block"
      />

      {/* Top Floating Engineering Toolbar */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none gap-2">
        {/* Primary Interaction Tools */}
        <div className="flex items-center gap-1 bg-white/95 backdrop-blur-md p-1.5 rounded-xl border border-slate-200 shadow-md pointer-events-auto">
          <Button
            size="sm"
            variant={activeTool === "select" ? "default" : "ghost"}
            onClick={() => setActiveTool("select")}
            className="h-8 text-xs px-2.5 rounded-lg gap-1.5"
            title="Select & Move Objects"
          >
            <MousePointer className="w-3.5 h-3.5" /> Select
          </Button>

          <Button
            size="sm"
            variant={activeTool === "draw_roof" ? "default" : "ghost"}
            onClick={() => {
              setActiveTool("draw_roof");
            }}
            className="h-8 text-xs px-2.5 rounded-lg gap-1.5"
            title="Click points to draw roof boundary"
          >
            <PenTool className="w-3.5 h-3.5 text-blue-600" /> Draw Roof
          </Button>

          <Button
            size="sm"
            variant={activeTool === "calibrate" ? "default" : "ghost"}
            onClick={() => {
              setActiveTool("calibrate");
              setCalibratePoints([]);
            }}
            className="h-8 text-xs px-2.5 rounded-lg gap-1.5"
            title="Calibrate measurement with known distance"
          >
            <Ruler className="w-3.5 h-3.5 text-purple-600" /> Calibrate
          </Button>

          <Button
            size="sm"
            variant={activeTool === "add_obstacle" ? "default" : "ghost"}
            onClick={() => setActiveTool("add_obstacle")}
            className="h-8 text-xs px-2.5 rounded-lg gap-1.5"
            title="Add Obstacle / Water Tank / Staircase"
          >
            <Square className="w-3.5 h-3.5 text-red-500" /> + Obstacle
          </Button>

          <div className="w-[1px] h-5 bg-slate-200 mx-1" />

          <Button
            size="sm"
            variant="ghost"
            onClick={centerViewOnRoof}
            className="h-8 px-2 rounded-lg text-slate-600 hover:text-slate-900"
            title="Center Roof"
          >
            <Compass className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setRoofPolygon([])}
            className="h-8 px-2 rounded-lg text-slate-500 hover:text-red-600"
            title="Clear Roof Polygon"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Selected Panel Toolbar (Contextual) */}
        {selectedPanelId && (
          <div className="flex items-center gap-1 bg-blue-50/95 backdrop-blur-md p-1.5 rounded-xl border border-blue-200 shadow-md pointer-events-auto animate-in fade-in">
            <span className="text-[11px] font-semibold text-blue-900 px-2">Panel Selected</span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRotateSelectedPanel}
              className="h-7 text-xs px-2 rounded-lg bg-white"
              title="Rotate 90°"
            >
              <RotateCw className="w-3 h-3" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDuplicateSelectedPanel}
              className="h-7 text-xs px-2 rounded-lg bg-white"
              title="Duplicate Panel"
            >
              <Copy className="w-3 h-3" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleToggleLockSelectedPanel}
              className="h-7 text-xs px-2 rounded-lg bg-white"
              title="Lock/Unlock Position"
            >
              {panels.find((p) => p.id === selectedPanelId)?.locked ? <Lock className="w-3 h-3 text-red-500" /> : <Unlock className="w-3 h-3" />}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDeleteSelectedPanel}
              className="h-7 text-xs px-2 rounded-lg"
              title="Delete Panel"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        )}

        {/* Layer Visibility Pills */}
        <div className="flex items-center gap-1 bg-white/95 backdrop-blur-md p-1 rounded-xl border border-slate-200 shadow-md pointer-events-auto">
          <Button
            size="sm"
            variant={layers.roofBoundary ? "secondary" : "ghost"}
            onClick={() => setLayers({ ...layers, roofBoundary: !layers.roofBoundary })}
            className="h-7 text-[11px] px-2 rounded-lg"
          >
            Roof
          </Button>
          <Button
            size="sm"
            variant={layers.setbacks ? "secondary" : "ghost"}
            onClick={() => setLayers({ ...layers, setbacks: !layers.setbacks })}
            className="h-7 text-[11px] px-2 rounded-lg"
          >
            Setbacks
          </Button>
          <Button
            size="sm"
            variant={layers.panels ? "secondary" : "ghost"}
            onClick={() => setLayers({ ...layers, panels: !layers.panels })}
            className="h-7 text-[11px] px-2 rounded-lg"
          >
            Panels
          </Button>
          <Button
            size="sm"
            variant={layers.obstacles ? "secondary" : "ghost"}
            onClick={() => setLayers({ ...layers, obstacles: !layers.obstacles })}
            className="h-7 text-[11px] px-2 rounded-lg"
          >
            Obstacles
          </Button>
        </div>
      </div>

      {/* Bottom Live Metrics & Scale HUD */}
      <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between pointer-events-none">
        <div className="bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-xl border border-slate-200 shadow-lg pointer-events-auto flex items-center gap-4 text-xs">
          <div>
            <span className="text-slate-500 block text-[10px]">ROOF AREA</span>
            <span className="font-bold text-slate-900">{roofArea > 0 ? `${roofArea.toFixed(1)} m²` : "0 m²"}</span>
            <span className="text-[10px] text-slate-400 ml-1">({(roofArea * 10.764).toFixed(0)} sq.ft)</span>
          </div>
          <div className="w-[1px] h-6 bg-slate-200" />
          <div>
            <span className="text-slate-500 block text-[10px]">PERIMETER</span>
            <span className="font-bold text-slate-900">{roofPerimeter > 0 ? `${roofPerimeter.toFixed(1)} m` : "0 m"}</span>
          </div>
          <div className="w-[1px] h-6 bg-slate-200" />
          <div>
            <span className="text-slate-500 block text-[10px]">PANEL COUNT</span>
            <span className="font-bold text-blue-700">{panels.filter((p) => !p.hidden).length} Nos</span>
          </div>
        </div>

        <div className="bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-200 shadow-md text-[11px] text-slate-500 pointer-events-auto flex items-center gap-2">
          <span>Scale: <b>1m = {Math.round(viewState.scale)}px</b></span>
          <span className="text-slate-300">|</span>
          <span className="text-emerald-700 font-semibold">Geospatial Coordinate Projection</span>
        </div>
      </div>

      {/* Measurement Calibration Dialog */}
      <Dialog open={showCalibrateModal} onOpenChange={setShowCalibrateModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Ruler className="w-5 h-5 text-purple-600" /> Calibrate Roof Measurement
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm text-slate-600">
            <p>
              You selected a reference segment on the rooftop. Enter the known actual physical distance between these two points to calibrate all measurements:
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Actual Known Distance (meters)</Label>
              <Input
                type="number"
                step="0.1"
                min="0.5"
                max="500"
                value={calibrateDistanceInput}
                onChange={(e) => setCalibrateDistanceInput(e.target.value)}
                placeholder="e.g. 10.0"
                className="text-sm font-semibold"
                autoFocus
              />
            </div>
            <div className="text-xs text-slate-500 bg-purple-50 p-2.5 rounded-lg border border-purple-200">
              This will update the scale factor across the entire rooftop boundary and all panel placements.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCalibrateModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleApplyCalibration} className="bg-purple-600 hover:bg-purple-700 text-white">
              Apply Calibration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

export default Roof2DCanvas;
