import React, { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import * as THREE from "three";
import { toast } from "sonner";
import {
  RotateCcw, Eye, Layers, Compass, ZoomIn, ZoomOut, Maximize2, Minimize2,
  Box, Camera, Sun, Info, Focus, Sliders, Check, Plus, Trash2, Copy,
  Move, AlertTriangle, Grid, Magnet, Triangle, Sparkles,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, X
} from "lucide-react";
import {
  toRad,
  calculateRoofElevationAtPoint,
  calculateSectionRoofElevationAtPoint,
  isPointInsidePolygon,
  isPointInOrNearPolygon,
  calculatePanel3DPosition,
  clusterPanelsIntoRows,
  getPolygonBounds,
  getPolygonArea,
} from "../utils/geoCalculations";
import { validatePanelPlacement } from "../utils/layoutEngine";

// ─────────────────────────────────────────────────────────────────────────────
// Engineering-Grade 3D Rooftop WebGL Visualizer
//
// Structural Hierarchy:
//   ROOF SLAB → BASE ANCHOR FOOTING → VERTICAL SUPPORT POSTS
//             → INCLINED RAFTERS → DUAL CONTINUOUS RAILS → PV MODULES
//
// Interactive Structure Editor:
//   - Click to select a node or member
//   - "Add Support" tool: click roof plane → create post with base plate
//   - "Add Member" tool: click point A → click point B → create member
//   - "Add Brace" tool: click point A → click point B → create diagonal brace
//   - Moving a node updates all connected members automatically
//   - Snap system (roof edge, panel corners, existing nodes, 0.25m grid)
// ─────────────────────────────────────────────────────────────────────────────

// Procedural High-Definition Solar Cell Wafer Texture (Mono PERC 6×12 cells with silver busbars)
function createSolarCellCanvasTexture() {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Deep anti-reflective monocrystalline silicon gradient
  const grad = ctx.createLinearGradient(0, 0, 512, 1024);
  grad.addColorStop(0, "#081836");
  grad.addColorStop(0.5, "#061228");
  grad.addColorStop(1, "#040d1c");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 1024);

  // 6 columns x 12 rows of mono solar cells
  const cols = 6;
  const rows = 12;
  const padX = 4;
  const padY = 4;
  const cellW = (512 - (cols + 1) * padX) / cols;
  const cellH = (1024 - (rows + 1) * padY) / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = padX + c * (cellW + padX);
      const y = padY + r * (cellH + padY);

      // Wafer background with subtle blue sheen
      ctx.fillStyle = "#0a2550";
      ctx.fillRect(x, y, cellW, cellH);

      // Diagonal chamfered corners (monocrystalline pseudo-square)
      ctx.fillStyle = "#040c1a";
      const chamfer = 7;
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x + chamfer, y); ctx.lineTo(x, y + chamfer); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + cellW, y); ctx.lineTo(x + cellW - chamfer, y); ctx.lineTo(x + cellW, y + chamfer); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x, y + cellH); ctx.lineTo(x + chamfer, y + cellH); ctx.lineTo(x, y + cellH - chamfer); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + cellW, y + cellH); ctx.lineTo(x + cellW - chamfer, y + cellH); ctx.lineTo(x + cellW, y + cellH - chamfer); ctx.fill();

      // Ultra-fine silver grid fingers (horizontal lines per cell)
      ctx.strokeStyle = "rgba(180, 210, 255, 0.22)";
      ctx.lineWidth = 0.6;
      for (let f = 1; f < 8; f++) {
        const fy = y + (f * cellH) / 8;
        ctx.beginPath();
        ctx.moveTo(x + 2, fy);
        ctx.lineTo(x + cellW - 2, fy);
        ctx.stroke();
      }
    }
  }

  // Multi-Busbar (MBB) 9-BB silver ribbons running vertically down the module
  ctx.strokeStyle = "rgba(235, 245, 255, 0.85)";
  ctx.lineWidth = 1.6;
  const busbars = 9;
  for (let b = 1; b <= busbars; b++) {
    const bx = (b * 512) / (busbars + 1);
    ctx.beginPath();
    ctx.moveTo(bx, 2);
    ctx.lineTo(bx, 1022);
    ctx.stroke();

    // Subtle solder pad highlights along busbars
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    for (let r = 0; r < rows; r++) {
      const py = padY + r * (cellH + padY) + cellH / 2;
      ctx.fillRect(bx - 1.5, py - 2, 3, 4);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}

// Global cached solar cell texture
let cachedSolarTexture = null;
function getSolarCellTexture() {
  if (!cachedSolarTexture) {
    cachedSolarTexture = createSolarCellCanvasTexture();
  }
  return cachedSolarTexture;
}

// Cache generated procedural tile textures
const tileTextureCache = new Map();

function getTileRoofTexture(tileConfig = {}) {
  if (typeof document === "undefined") return null;
  const style = tileConfig.type || "spanish_barrel";
  const colorHex = tileConfig.color || "#b45309";
  const cacheKey = `${style}_${colorHex}`;
  if (tileTextureCache.has(cacheKey)) {
    return tileTextureCache.get(cacheKey);
  }

  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = colorHex;
  ctx.fillRect(0, 0, 512, 512);

  const rows = 16;
  const cols = 8;
  const rowHeight = 512 / rows;
  const colWidth = 512 / cols;

  for (let r = 0; r < rows; r++) {
    const y = r * rowHeight;
    const rowOffset = (r % 2) * (colWidth / 2);

    // Lap shadow at top of course
    const grad = ctx.createLinearGradient(0, y, 0, y + rowHeight);
    grad.addColorStop(0, "rgba(0, 0, 0, 0.45)");
    grad.addColorStop(0.12, "rgba(0, 0, 0, 0.15)");
    grad.addColorStop(0.85, "rgba(255, 255, 255, 0.08)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0.35)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, y, 512, rowHeight);

    // Individual tile arches or seams
    for (let c = -1; c <= cols + 1; c++) {
      const x = c * colWidth + rowOffset;
      if (style === "spanish" || style === "roman") {
        const archGrad = ctx.createLinearGradient(x, 0, x + colWidth, 0);
        archGrad.addColorStop(0, "rgba(0, 0, 0, 0.4)");
        archGrad.addColorStop(0.3, "rgba(255, 255, 255, 0.22)");
        archGrad.addColorStop(0.7, "rgba(0, 0, 0, 0.08)");
        archGrad.addColorStop(1, "rgba(0, 0, 0, 0.5)");
        ctx.fillStyle = archGrad;
        ctx.fillRect(x, y, colWidth, rowHeight);
      } else {
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.fillRect(x, y, 3, rowHeight);
        ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
        ctx.fillRect(x + 3, y, 2, rowHeight);
      }
    }

    // Horizontal course overhang line
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, y, 512, 2.5);
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.fillRect(0, y + 2.5, 512, 1.5);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  tileTextureCache.set(cacheKey, texture);
  return texture;
}

const Rooftop3DViewer = forwardRef(function Rooftop3DViewer(
  {
    roofPolygon = [],
    roof = { type: "flat", pitch_deg: 0, azimuth_deg: 180, elevation_m: 3.0, surface_material: "concrete" },
    roofSections = [],
    selectedSectionId = null,
    onSelectSection = null,
    panels = [],
    setPanels = null,
    selectedPanelId = null,
    setSelectedPanelId = null,
    selectionMode = "panel", // 'panel' | 'row' | 'array'
    setSelectionMode = null,
    selectedRowIndex = null,
    setSelectedRowIndex = null,
    hasManualAdjustments = false,
    setHasManualAdjustments = null,
    setbackMeters = 0.5,
    onUpdateSection = null,
    obstacles = [],
    walkways = [],
    structure = {
      type: "elevated",
      tilt_deg: 15,
      height_m: 1.8,
      azimuth: 180,
      material: "GI",
      show_structure: true,
      cross_bracing: true,
      base_plates: true,
      show_supports: true,
    },
    panelSpecs = {},
    structureNodes = [],
    structureMembers = [],
    onStructureNodesChange,
    onStructureMembersChange,
    onSwitchTo2D,
    onApplyTemplateRoof,
  },
  ref
) {
  const mountRef = useRef(null);
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const rootGroupRef = useRef(null);
  const interactiveGroupRef = useRef(null); // holds manually-added nodes/members

  // Camera orbit state
  const controlsRef = useRef({
    isDragging: false,
    isPanning: false,
    prevX: 0,
    prevY: 0,
    spherical: { radius: 32, phi: Math.PI / 3.2, theta: Math.PI / 4 },
    target: new THREE.Vector3(0, 3, 0),
  });

  // Raycaster
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());

  // Tool state
  const [structureTool, setStructureTool] = useState("none"); // 'none' | 'add_support' | 'add_member' | 'add_brace'
  const [pendingPoint, setPendingPoint] = useState(null); // first click for member/brace
  const pendingPointRef = useRef(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [deletedMemberIds, setDeletedMemberIds] = useState(new Set());
  const [viewMode, setViewMode] = useState("visual"); // 'visual' | 'engineering'
  const [snapEnabled, setSnapEnabled] = useState(true);
  const snapEnabledRef = useRef(true);
  const structureToolRef = useRef("none");
  const deletedMemberIdsRef = useRef(deletedMemberIds);
  const viewModeRef = useRef(viewMode);

  // Scene-level refs for interactive meshes
  const nodeMeshMapRef = useRef({}); // nodeId → THREE.Mesh
  const memberMeshMapRef = useRef({}); // memberId → THREE.Mesh (+ line)
  const sectionMeshMapRef = useRef({}); // sectionId → THREE.Mesh
  const panelMeshMapRef = useRef({}); // panelId → THREE.Mesh

  // Visibility toggles
  const [renderNonce, setRenderNonce] = useState(0);
  const [activePreset, setActivePreset] = useState("isometric");
  const [showPanels, setShowPanels] = useState(true);
  const [showStructures, setShowStructures] = useState(structure?.show_structure !== false);
  const [showPosts, setShowPosts] = useState(true);
  const [showRoof, setShowRoof] = useState(true);
  const [showBuilding, setShowBuilding] = useState(true);
  const [showObstacles, setShowObstacles] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showLegend, setShowLegend] = useState(false);

  // Local nodes/members state (mirrors canonical state via props)
  const nodesRef = useRef(structureNodes);
  const membersRef = useRef(structureMembers);
  useEffect(() => { nodesRef.current = structureNodes; }, [structureNodes]);
  useEffect(() => { membersRef.current = structureMembers; }, [structureMembers]);
  useEffect(() => { deletedMemberIdsRef.current = deletedMemberIds; }, [deletedMemberIds]);
  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);

  const hasRoof = roofPolygon && roofPolygon.length >= 3;
  const activePanels = (panels || []).filter((p) => !p.hidden);
  const activeSec = selectedSectionId && roofSections
    ? roofSections.find((s) => s.id === selectedSectionId)
    : null;

  // 3D Panel Selection & Adjustment Fallbacks
  const [internalSelectedPanelId, setInternalSelectedPanelId] = useState(null);
  const [internalSelectionMode, setInternalSelectionMode] = useState("panel");
  const [internalSelectedRowIndex, setInternalSelectedRowIndex] = useState(null);
  const [stepIncrement, setStepIncrement] = useState(0.05); // 0.01, 0.05, 0.10

  const activeSelectedPanelId = selectedPanelId !== undefined && selectedPanelId !== null ? selectedPanelId : internalSelectedPanelId;
  const changeSelectedPanelId = setSelectedPanelId || setInternalSelectedPanelId;

  const activeSelectionMode = selectionMode || internalSelectionMode;
  const changeSelectionMode = setSelectionMode || setInternalSelectionMode;

  const activeSelectedRowIndex = selectedRowIndex !== undefined && selectedRowIndex !== null ? selectedRowIndex : internalSelectedRowIndex;
  const changeSelectedRowIndex = setSelectedRowIndex || setInternalSelectedRowIndex;

  // 3D Micro-Move Handler with Boundary Collision Checks
  const handle3DMicroMove = useCallback((dx, dy) => {
    if (!panels || panels.length === 0 || !setPanels) return;
    const finalDx = Math.round(dx * 1000) / 1000;
    const finalDy = Math.round(dy * 1000) / 1000;

    const currentSelectedPanel = activeSelectedPanelId ? panels.find((p) => p.id === activeSelectedPanelId) : null;
    const targetSec = activeSec
      || (currentSelectedPanel?.sectionId && roofSections ? roofSections.find((s) => s.id === currentSelectedPanel.sectionId) : null);
    const targetPolygon = targetSec?.polygon || roofPolygon;

    if (!targetPolygon || targetPolygon.length < 3) {
      toast.warning("Roof boundary required for micro-adjustments.");
      return;
    }

    // MODE 1: Single Panel Move
    if (activeSelectionMode === "panel") {
      if (!activeSelectedPanelId || !currentSelectedPanel) {
        toast.info("Click a solar panel in 3D to select and move it.");
        return;
      }

      const candidate = {
        ...currentSelectedPanel,
        x: Math.round((currentSelectedPanel.x + finalDx) * 1000) / 1000,
        y: Math.round((currentSelectedPanel.y + finalDy) * 1000) / 1000,
      };

      const validation = validatePanelPlacement({
        candidate,
        roofPolygon: targetPolygon,
        setbackMeters,
        panels,
        obstacles,
        walkways,
        excludePanelId: currentSelectedPanel.id,
      });

      if (!validation.valid) {
        toast.warning(validation.reason || "Movement blocked: panel would leave usable roof area.");
        return;
      }

      setPanels((prev) =>
        prev.map((p) => (p.id === currentSelectedPanel.id ? { ...p, x: candidate.x, y: candidate.y } : p))
      );
      setHasManualAdjustments?.(true);
      return;
    }

    // MODE 2: Row Move
    if (activeSelectionMode === "row") {
      if (activeSelectedRowIndex == null) {
        toast.info("Please select a panel to identify its row.");
        return;
      }

      const rowPanels = panels.filter((p) => p.row === activeSelectedRowIndex);
      if (rowPanels.length === 0) return;

      const rowPanelIds = new Set(rowPanels.map((p) => p.id));
      const candidatePanels = rowPanels.map((p) => ({
        ...p,
        x: Math.round((p.x + finalDx) * 1000) / 1000,
        y: Math.round((p.y + finalDy) * 1000) / 1000,
      }));

      const otherPanels = panels.filter((p) => !rowPanelIds.has(p.id));

      for (const cand of candidatePanels) {
        const validation = validatePanelPlacement({
          candidate: cand,
          roofPolygon: targetPolygon,
          setbackMeters,
          panels: otherPanels,
          obstacles,
          walkways,
          excludePanelId: cand.id,
        });

        if (!validation.valid) {
          toast.warning(validation.reason || "Row movement blocked: would push panels outside usable roof area.");
          return;
        }
      }

      const candMap = new Map(candidatePanels.map((p) => [p.id, p]));
      setPanels((prev) =>
        prev.map((p) => {
          if (candMap.has(p.id)) {
            const u = candMap.get(p.id);
            return { ...p, x: u.x, y: u.y };
          }
          return p;
        })
      );
      setHasManualAdjustments?.(true);
      return;
    }

    // MODE 3: Entire Array Move
    if (activeSelectionMode === "array") {
      const candidatePanels = panels.map((p) => ({
        ...p,
        x: Math.round((p.x + finalDx) * 1000) / 1000,
        y: Math.round((p.y + finalDy) * 1000) / 1000,
      }));

      for (const cand of candidatePanels) {
        const validation = validatePanelPlacement({
          candidate: cand,
          roofPolygon: targetPolygon,
          setbackMeters,
          panels: [],
          obstacles,
          walkways,
          excludePanelId: cand.id,
        });

        if (!validation.valid) {
          toast.warning("Array movement blocked: would push panels outside usable roof area.");
          return;
        }
      }

      setPanels(candidatePanels);
      setHasManualAdjustments?.(true);
      return;
    }
  }, [panels, setPanels, activeSelectedPanelId, activeSelectedRowIndex, activeSelectionMode, activeSec, roofSections, roofPolygon, setbackMeters, obstacles, walkways, setHasManualAdjustments]);

  // Delete currently selected panel in 3D
  const handleDeleteSelectedPanel = useCallback(() => {
    if (!activeSelectedPanelId || !setPanels) return;
    setPanels((prev) => prev.filter((p) => p.id !== activeSelectedPanelId));
    changeSelectedPanelId(null);
    changeSelectedRowIndex(null);
    toast.success("Panel removed.");
  }, [activeSelectedPanelId, setPanels, changeSelectedPanelId, changeSelectedRowIndex]);

  // Arrow keys listener when panel is selected
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!activeSelectedPanelId && activeSelectedRowIndex == null) return;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;

      const step = stepIncrement;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        handle3DMicroMove(0, step);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        handle3DMicroMove(0, -step);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handle3DMicroMove(-step, 0);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handle3DMicroMove(step, 0);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeSelectedPanelId, activeSelectedRowIndex, stepIncrement, handle3DMicroMove]);

  // Keep refs in sync with state
  useEffect(() => { structureToolRef.current = structureTool; }, [structureTool]);
  useEffect(() => { snapEnabledRef.current = snapEnabled; }, [snapEnabled]);
  useEffect(() => { pendingPointRef.current = pendingPoint; }, [pendingPoint]);

  // ─── Derived structure counts for legend ────────────────────────────────────
  const manualNodeCount = structureNodes.length;
  const manualMemberCount = structureMembers.filter((m) => m.type === "member" || m.type === "beam").length;
  const manualBraceCount = structureMembers.filter((m) => m.type === "brace").length;
  const manualSupportCount = structureNodes.filter((n) => n.type === "post_top" || n.type === "anchor").length;

  const gridHelperRef = useRef(null);
  const groundMeshRef = useRef(null);

  // Expose snapshot export, multi-view generation, and fit-camera functions to parent
  useImperativeHandle(ref, () => ({
    regenerateStructure: () => {
      deletedMemberIdsRef.current.clear();
      setDeletedMemberIds(new Set());
      setRenderNonce((n) => n + 1);
    },
    getSnapshotDataUrl: () => {
      if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return null;
      rendererRef.current.render(sceneRef.current, cameraRef.current);
      return rendererRef.current.domElement.toDataURL("image/png");
    },
    generateAllViews: () => {
      if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return [];
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      const ctr = controlsRef.current;

      const savedSpherical = { ...ctr.spherical };
      const savedTarget = ctr.target.clone();

      if (rootGroupRef.current) {
        const box = new THREE.Box3().setFromObject(rootGroupRef.current);
        if (!box.isEmpty()) {
          box.getCenter(ctr.target);
          const size = new THREE.Vector3();
          box.getSize(size);
          const maxDim = Math.max(size.x, size.y, size.z, 8);
          const fov = camera.fov * (Math.PI / 180);
          ctr.spherical.radius = Math.max(12, Math.min(140, (maxDim / 2) / Math.tan(fov / 2) * 1.6));
        }
      }

      const viewsToRender = [
        { id: "top", name: "Top View", phi: 0.05, theta: 0 },
        { id: "3d", name: "3D View", phi: Math.PI / 3.2, theta: Math.PI / 4 },
        { id: "left", name: "Left View", phi: Math.PI / 2.15, theta: Math.PI / 2 },
        { id: "right", name: "Right View", phi: Math.PI / 2.15, theta: -Math.PI / 2 },
        { id: "front", name: "Front View", phi: Math.PI / 2.15, theta: 0 },
      ];

      const capturedViews = [];
      const nowIso = new Date().toISOString();

      for (const v of viewsToRender) {
        ctr.spherical.phi = v.phi;
        ctr.spherical.theta = v.theta;
        updateCameraPosition();
        renderer.render(scene, camera);
        const dataUrl = renderer.domElement.toDataURL("image/png");
        capturedViews.push({
          id: v.id,
          name: v.name,
          thumbnail: dataUrl,
          dataUrl: dataUrl,
          timestamp: nowIso,
        });
      }

      ctr.spherical = savedSpherical;
      ctr.target.copy(savedTarget);
      updateCameraPosition();
      renderer.render(scene, camera);

      return capturedViews;
    },
    applyViewPreset: (preset) => {
      setCameraPreset(preset);
    },
    fitDesign: () => fitDesignCamera(),
    fitRoof: () => fitRoofCamera(),
    resize: () => {
      const container = mountRef.current;
      const renderer = rendererRef.current;
      const camera = cameraRef.current;
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w > 0 && h > 0) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    },
    getStructuralMembers: () => Object.keys(memberMeshMapRef.current).map((id) => ({
      id,
      ...memberMeshMapRef.current[id]?.userData,
    })),
    selectMemberById: (id) => {
      if (memberMeshMapRef.current[id]) {
        setSelectedMemberId(id);
        setSelectedNodeId(null);
      }
    },
    deleteMemberById: (id) => {
      setDeletedMemberIds((prev) => new Set([...prev, id]));
      setSelectedMemberId(null);
      setSelectedGroupId(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.__solarix_3d_viewer = {
        getStructuralMembers: () => Object.keys(memberMeshMapRef.current).map((id) => ({
          id,
          ...memberMeshMapRef.current[id]?.userData,
        })),
        selectMemberById: (id) => {
          if (memberMeshMapRef.current[id]) {
            setSelectedMemberId(id);
            setSelectedNodeId(null);
          }
        },
        deleteMemberById: (id) => {
          setDeletedMemberIds((prev) => new Set([...prev, id]));
          setSelectedMemberId(null);
          setSelectedGroupId(null);
        },
      };
    }
  }, []);

  // ─── Camera Utilities ────────────────────────────────────────────────────────
  const updateCameraPosition = useCallback(() => {
    if (!cameraRef.current) return;
    const ctr = controlsRef.current;
    if (!ctr || !ctr.spherical || !ctr.target) return;

    let { radius, phi, theta } = ctr.spherical;
    const target = ctr.target;

    // Safety checks against NaN / Infinity to prevent blank 3D screen
    if (!isFinite(radius) || radius <= 0) radius = 32;
    if (!isFinite(phi)) phi = Math.PI / 3.2;
    if (!isFinite(theta)) theta = Math.PI / 4;
    if (!isFinite(target.x) || !isFinite(target.y) || !isFinite(target.z)) {
      target.set(0, 3, 0);
    }
    ctr.spherical.radius = Math.max(4, Math.min(180, radius));
    ctr.spherical.phi = Math.max(0.05, Math.min(Math.PI / 2.05, phi));
    ctr.spherical.theta = theta;

    const x = target.x + radius * Math.sin(phi) * Math.sin(theta);
    const y = target.y + radius * Math.cos(phi);
    const z = target.z + radius * Math.sin(phi) * Math.cos(theta);

    if (isFinite(x) && isFinite(y) && isFinite(z)) {
      cameraRef.current.position.set(x, y, z);
      cameraRef.current.lookAt(target);
    }
  }, []);

  const fitDesignCamera = useCallback(() => {
    if (!rootGroupRef.current || !cameraRef.current) return;
    const box = new THREE.Box3().setFromObject(rootGroupRef.current);
    if (box.isEmpty()) return;
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 8);
    const fov = cameraRef.current.fov * (Math.PI / 180);
    const distance = (maxDim / 2) / Math.tan(fov / 2) * 1.5;
    if (isFinite(distance) && isFinite(center.x)) {
      controlsRef.current.target.copy(center);
      controlsRef.current.spherical.radius = Math.max(8, Math.min(160, distance));
      controlsRef.current.spherical.phi = Math.PI / 3.2;
      controlsRef.current.spherical.theta = Math.PI / 4;
      setActivePreset("isometric");
      updateCameraPosition();
    }
  }, [updateCameraPosition]);

  const fitRoofCamera = useCallback(() => {
    if (!rootGroupRef.current || !cameraRef.current) return;
    const box = new THREE.Box3();
    rootGroupRef.current.traverse((child) => {
      if (child.name === "building_roof_mesh" || child.name === "building_wall_mesh") {
        box.expandByObject(child);
      }
    });
    if (box.isEmpty()) {
      box.setFromObject(rootGroupRef.current);
    }
    if (box.isEmpty()) return;
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 6);
    const fov = cameraRef.current.fov * (Math.PI / 180);
    const distance = (maxDim / 2) / Math.tan(fov / 2) * 1.5;
    if (isFinite(distance) && isFinite(center.x)) {
      controlsRef.current.target.copy(center);
      controlsRef.current.spherical.radius = Math.max(6, Math.min(160, distance));
      controlsRef.current.spherical.phi = Math.PI / 3.2;
      controlsRef.current.spherical.theta = Math.PI / 4;
      setActivePreset("isometric");
      updateCameraPosition();
    }
  }, [updateCameraPosition]);

  const setCameraPreset = useCallback((preset) => {
    setActivePreset(preset);
    const ctr = controlsRef.current;
    if (rootGroupRef.current) {
      const box = new THREE.Box3().setFromObject(rootGroupRef.current);
      if (!box.isEmpty()) {
        box.getCenter(ctr.target);
      }
    }
    if (preset === "top") { ctr.spherical.phi = 0.05; ctr.spherical.theta = 0; }
    else if (preset === "front") { ctr.spherical.phi = Math.PI / 2.15; ctr.spherical.theta = 0; }
    else if (preset === "side" || preset === "left") { ctr.spherical.phi = Math.PI / 2.15; ctr.spherical.theta = Math.PI / 2; }
    else if (preset === "right") { ctr.spherical.phi = Math.PI / 2.15; ctr.spherical.theta = -Math.PI / 2; }
    else if (preset === "isometric" || preset === "3d") { ctr.spherical.phi = Math.PI / 3.2; ctr.spherical.theta = Math.PI / 4; }
    else if (preset === "fit" || preset === "fit_design" || preset === "fitDesign") { fitDesignCamera(); return; }
    else if (preset === "fit_roof" || preset === "fitRoof") { fitRoofCamera(); return; }
    else if (preset === "reset") {
      ctr.spherical.radius = 32;
      ctr.spherical.phi = Math.PI / 3.2;
      ctr.spherical.theta = Math.PI / 4;
      if (rootGroupRef.current) {
        const box = new THREE.Box3().setFromObject(rootGroupRef.current);
        if (!box.isEmpty()) box.getCenter(ctr.target);
        else ctr.target.set(0, 3, 0);
      } else {
        ctr.target.set(0, 3, 0);
      }
    }
    updateCameraPosition();
  }, [updateCameraPosition, fitDesignCamera, fitRoofCamera]);

  // ─── Snap Helper ─────────────────────────────────────────────────────────────
  const snapToNearest = useCallback((rawX, rawY, rawZ) => {
    if (!snapEnabledRef.current) return { x: rawX, y: rawY, z: rawZ };
    const GRID = 0.25;
    const snapped = {
      x: Math.round(rawX / GRID) * GRID,
      y: rawY,
      z: Math.round(rawZ / GRID) * GRID,
    };
    // Snap to existing node positions
    let minDist = 0.6; // snap radius in world units
    for (const node of nodesRef.current) {
      const d = Math.hypot(rawX - node.x, rawZ - (-node.y));
      if (d < minDist) { minDist = d; snapped.x = node.x; snapped.z = -node.y; }
    }
    // Snap to roof polygon vertices
    for (const pt of roofPolygon) {
      const d = Math.hypot(rawX - pt.x, rawZ - (-pt.y));
      if (d < minDist) { minDist = d; snapped.x = pt.x; snapped.z = -pt.y; }
    }
    return snapped;
  }, [roofPolygon]);

  // ─── Initialize Three.js Scene ────────────────────────────────────────────────
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;
    const width = container.clientWidth || 600;
    const height = container.clientHeight || 450;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f1d);
    sceneRef.current = scene;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance",
      });
    } catch (err) {
      console.warn("THREE.WebGLRenderer initialization failed:", err);
      container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#94a3b8;padding:24px;text-align:center;">
          <div style="font-size:13px;font-weight:600;color:#f1f5f9;margin-bottom:8px;">3D WebGL Acceleration Unavailable</div>
          <div style="font-size:11px;max-width:320px;line-height:1.4;">WebGL is disabled or unsupported in this browser window. Use 2D Satellite View for design and layout.</div>
        </div>
      `;
      return;
    }
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 800);
    cameraRef.current = camera;
    updateCameraPosition();

    // Lighting
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x1e293b, 0.85);
    scene.add(hemiLight);
    const sunLight = new THREE.DirectionalLight(0xfffaed, 1.6);
    sunLight.position.set(40, 70, 45);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    const d = 50;
    sunLight.shadow.camera.left = -d; sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d; sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.camera.far = 300; sunLight.shadow.bias = -0.0004;
    scene.add(sunLight);
    scene.add(new THREE.AmbientLight(0xffffff, 0.45));

    // Ground + Grid
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x131d2e, roughness: 0.95, metalness: 0.05 });
    const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -0.02;
    groundMesh.receiveShadow = true;
    groundMeshRef.current = groundMesh;
    scene.add(groundMesh);

    const gridHelper = new THREE.GridHelper(140, 70, 0x3b82f6, 0x1e293b);
    gridHelper.position.y = 0.01;
    gridHelperRef.current = gridHelper;
    scene.add(gridHelper);

    // Interactive group (always in scene, updated separately)
    const iGroup = new THREE.Group();
    iGroup.name = "interactive_structure";
    interactiveGroupRef.current = iGroup;
    scene.add(iGroup);

    // Mouse Event Handlers
    const dom = renderer.domElement;
    const onMouseDown = (e) => {
      e.preventDefault();
      controlsRef.current.isDragging = e.button === 0 && structureToolRef.current === "none";
      controlsRef.current.isPanning = e.button === 2 || (e.button === 0 && e.shiftKey);
      controlsRef.current.prevX = e.clientX;
      controlsRef.current.prevY = e.clientY;
    };
    const onMouseMove = (e) => {
      const ctr = controlsRef.current;
      if (!ctr.isDragging && !ctr.isPanning) return;
      const deltaX = e.clientX - ctr.prevX;
      const deltaY = e.clientY - ctr.prevY;
      ctr.prevX = e.clientX; ctr.prevY = e.clientY;
      if (ctr.isPanning) {
        const panSpeed = ctr.spherical.radius * 0.0015;
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
        const up = new THREE.Vector3().crossVectors(right, forward).normalize();
        ctr.target.addScaledVector(right, -deltaX * panSpeed);
        ctr.target.addScaledVector(up, deltaY * panSpeed);
      } else if (ctr.isDragging) {
        const rotSpeed = 0.006;
        ctr.spherical.theta -= deltaX * rotSpeed;
        ctr.spherical.phi = Math.max(0.05, Math.min(Math.PI / 2.05, ctr.spherical.phi - deltaY * rotSpeed));
      }
      updateCameraPosition();
    };
    const onMouseUp = () => { controlsRef.current.isDragging = false; controlsRef.current.isPanning = false; };
    const onWheel = (e) => {
      e.preventDefault();
      const ctr = controlsRef.current;
      if (!cameraRef.current || !ctr) return;

      const rect = dom.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      if (mouseX < 0 || mouseX > rect.width || mouseY < 0 || mouseY > rect.height) {
        return;
      }

      // Normalized Device Coordinates (-1 to +1)
      const ndcX = (mouseX / rect.width) * 2 - 1;
      const ndcY = -(mouseY / rect.height) * 2 + 1;

      // Pointer-directed 3D zoom using raycasting
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera({ x: ndcX, y: ndcY }, cameraRef.current);

      let targetHitPoint = null;
      if (rootGroupRef.current) {
        const intersects = raycaster.intersectObjects(rootGroupRef.current.children, true);
        if (intersects && intersects.length > 0) {
          targetHitPoint = intersects[0].point;
        }
      }

      // If ray doesn't intersect a rooftop mesh, intersect with a horizontal plane at current target height
      if (!targetHitPoint) {
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -ctr.target.y);
        const planeHit = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(plane, planeHit)) {
          targetHitPoint = planeHit;
        }
      }

      const isZoomIn = e.deltaY < 0;
      // Controlled, smooth zoom factor
      const zoomFactor = isZoomIn ? 0.90 : 1.10;

      if (targetHitPoint && isFinite(targetHitPoint.x) && isFinite(targetHitPoint.z)) {
        if (isZoomIn) {
          // Bias target towards cursor hit point (0.16 bias factor)
          ctr.target.lerp(targetHitPoint, 0.16);
        } else {
          // When zooming out, gently pull target back towards model center
          if (rootGroupRef.current) {
            const box = new THREE.Box3().setFromObject(rootGroupRef.current);
            if (!box.isEmpty()) {
              const modelCenter = box.getCenter(new THREE.Vector3());
              ctr.target.lerp(modelCenter, 0.08);
            }
          }
        }
      }

      // Safety bounds for target: prevent drifting infinitely far away
      if (rootGroupRef.current) {
        const box = new THREE.Box3().setFromObject(rootGroupRef.current);
        if (!box.isEmpty()) {
          const margin = 25;
          ctr.target.x = Math.max(box.min.x - margin, Math.min(box.max.x + margin, ctr.target.x));
          ctr.target.z = Math.max(box.min.z - margin, Math.min(box.max.z + margin, ctr.target.z));
          ctr.target.y = Math.max(0, Math.min(box.max.y + 15, ctr.target.y));
        }
      }

      // Safe camera distance range (5m to 160m)
      ctr.spherical.radius = Math.max(5, Math.min(160, ctr.spherical.radius * zoomFactor));

      updateCameraPosition();
    };
    const onContextMenu = (e) => e.preventDefault();
    dom.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    dom.addEventListener("wheel", onWheel, { passive: false });
    dom.addEventListener("contextmenu", onContextMenu);

    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth, h = container.clientHeight;
      if (w > 0 && h > 0) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    };
    window.addEventListener("resize", handleResize);

    // ResizeObserver ensures Three.js canvas auto-adapts when tab switches from hidden to visible
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(container);

    let animId;
    const animate = () => { animId = requestAnimationFrame(animate); renderer.render(scene, camera); };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      dom.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      dom.removeEventListener("wheel", onWheel);
      dom.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
    };
  }, [updateCameraPosition]);

  // ─── 3D Click Handler for Structure Tools ────────────────────────────────────
  const handleCanvasClick = useCallback((e) => {
    const tool = structureToolRef.current;
    if (tool === "none") {
      // Check if clicking an existing interactive node/member for selection
      if (!rendererRef.current || !cameraRef.current || !mountRef.current) return;
      const rect = mountRef.current.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
      const nodeObjects = Object.values(nodeMeshMapRef.current);
      const intersects = raycasterRef.current.intersectObjects(nodeObjects, false);
      if (intersects.length > 0) {
        const hit = intersects[0].object;
        const nodeId = hit.userData?.nodeId;
        if (nodeId) { setSelectedNodeId(nodeId); setSelectedMemberId(null); }
      } else {
        const memberObjects = Object.values(memberMeshMapRef.current);
        const mIntersects = raycasterRef.current.intersectObjects(memberObjects, false);
        if (mIntersects.length > 0) {
          const hit = mIntersects[0].object;
          const memberId = hit.userData?.memberId;
          if (memberId) {
            setSelectedMemberId(memberId);
            setSelectedNodeId(null);
            if (e.altKey || e.shiftKey) {
              setSelectedGroupId(hit.userData?.groupId || null);
            } else {
              setSelectedGroupId(null);
            }
          }
        } else {
          // Check if a panel was clicked
          const panelObjects = Object.values(panelMeshMapRef.current || {});
          const pIntersects = raycasterRef.current.intersectObjects(panelObjects, false);
          if (pIntersects.length > 0) {
            const hit = pIntersects[0].object;
            const pId = hit.userData?.panelId;
            if (pId) {
              changeSelectedPanelId(pId);
              const clickedP = panels.find((item) => item.id === pId);
              if (clickedP && clickedP.row != null) {
                changeSelectedRowIndex(clickedP.row);
              }
            }
          } else {
            const sectionObjects = Object.values(sectionMeshMapRef.current || {});
            const secIntersects = raycasterRef.current.intersectObjects(sectionObjects, false);
            if (secIntersects.length > 0) {
              const hit = secIntersects[0].object;
              const secId = hit.userData?.sectionId;
              changeSelectedPanelId(null);
              changeSelectedRowIndex(null);
              if (secId && onSelectSection) {
                onSelectSection(secId);
              }
            } else {
              setSelectedNodeId(null);
              setSelectedMemberId(null);
              setSelectedGroupId(null);
              changeSelectedPanelId(null);
              changeSelectedRowIndex(null);
            }
          }
        }
      }
      return;
    }

    // Raycast against a large horizontal plane at roofElevation for placement
    if (!rendererRef.current || !cameraRef.current || !mountRef.current) return;
    const rect = mountRef.current.getBoundingClientRect();
    mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

    const roofElevation = Number(roof?.elevation_m || 3.0);
    const planeY = roofElevation;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
    const intersection = new THREE.Vector3();
    raycasterRef.current.ray.intersectPlane(plane, intersection);
    if (!intersection) return;

    const rawX = intersection.x;
    const rawY = intersection.z; // in design space, y is -z in THREE
    const rawZ = intersection.z;
    const snapped = snapToNearest(rawX, rawY * -1, rawZ);
    const worldX = snapped.x;
    const worldZ = snapped.z;
    const designY = -worldZ; // design-space y

    if (tool === "add_support") {
      // Create anchor node at roof level + top node
      const roofYAt = calculateRoofElevationAtPoint(worldX, -worldZ, roof);
      const postHeight = Number(structure?.height_m || 1.8);
      const anchorNodeId = `node-${Date.now()}-a`;
      const topNodeId = `node-${Date.now()}-t`;
      const memberId = `member-${Date.now()}-p`;

      const newAnchor = { id: anchorNodeId, x: worldX, y: designY, z: roofYAt, type: "anchor" };
      const newTop = { id: topNodeId, x: worldX, y: designY, z: roofYAt + postHeight, type: "post_top" };
      const newPost = { id: memberId, nodeAId: anchorNodeId, nodeBId: topNodeId, type: "post" };

      const updatedNodes = [...nodesRef.current, newAnchor, newTop];
      const updatedMembers = [...membersRef.current, newPost];
      nodesRef.current = updatedNodes;
      membersRef.current = updatedMembers;
      onStructureNodesChange?.(updatedNodes);
      onStructureMembersChange?.(updatedMembers);
      setStructureTool("none");
      setSelectedNodeId(topNodeId);
      return;
    }

    if (tool === "add_member" || tool === "add_brace") {
      if (!pendingPointRef.current) {
        // First click → store pending point
        const firstNodeId = `node-${Date.now()}-m1`;
        const firstNode = { id: firstNodeId, x: worldX, y: designY, z: Number(structure?.height_m || 1.8) + Number(roof?.elevation_m || 3.0), type: "junction" };
        const updatedNodes = [...nodesRef.current, firstNode];
        nodesRef.current = updatedNodes;
        onStructureNodesChange?.(updatedNodes);
        setPendingPoint(firstNode);
        pendingPointRef.current = firstNode;
      } else {
        // Second click → create node B + member
        const secondNodeId = `node-${Date.now()}-m2`;
        const memberId = `member-${Date.now()}`;
        const secondNode = { id: secondNodeId, x: worldX, y: designY, z: Number(structure?.height_m || 1.8) + Number(roof?.elevation_m || 3.0), type: "junction" };
        const memberType = tool === "add_brace" ? "brace" : "member";
        const newMember = { id: memberId, nodeAId: pendingPointRef.current.id, nodeBId: secondNodeId, type: memberType };

        const updatedNodes = [...nodesRef.current, secondNode];
        const updatedMembers = [...membersRef.current, newMember];
        nodesRef.current = updatedNodes;
        membersRef.current = updatedMembers;
        onStructureNodesChange?.(updatedNodes);
        onStructureMembersChange?.(updatedMembers);
        setPendingPoint(null);
        pendingPointRef.current = null;
        setStructureTool("none");
        setSelectedMemberId(memberId);
      }
      return;
    }
  }, [roof, structure, snapToNearest, onStructureNodesChange, onStructureMembersChange, onSelectSection, panels, changeSelectedPanelId, changeSelectedRowIndex]);

  // ─── Build / Update Main 3D Scene ─────────────────────────────────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (rootGroupRef.current) scene.remove(rootGroupRef.current);
    memberMeshMapRef.current = {};
    sectionMeshMapRef.current = {};
    panelMeshMapRef.current = {};

    const rootGroup = new THREE.Group();
    rootGroup.name = "dynamic_rooftop_group";
    rootGroupRef.current = rootGroup;

    const roofType = roof?.type || "flat";
    const roofPitchDeg = Number(roof?.pitch_deg || 0);
    const roofAzimuthDeg = Number(roof?.azimuth_deg || 180);
    const buildingElevationM = Number(roof?.elevation_m || 3.0);
    const roofPitchRad = toRad(roofPitchDeg);

    const hasValidRoofPolygon = Boolean(roofPolygon && roofPolygon.length >= 3);
    const bounds = hasValidRoofPolygon
      ? getPolygonBounds(roofPolygon)
      : { minX: 0, maxX: 10, minY: 0, maxY: 10, width: 10, length: 10 };
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    const roofBounds = { ...bounds, centerX: cx, centerY: cy };
    const fullRoof = {
      ...roof,
      type: roofType,
      bounds: roofBounds,
      elevation_m: buildingElevationM,
      eave_height_m: roof?.eave_height_m != null ? Number(roof.eave_height_m) : buildingElevationM,
      ridge_height_m: roof?.ridge_height_m != null ? Number(roof.ridge_height_m) : null,
      pitch_deg: roofPitchDeg,
      azimuth_deg: roofAzimuthDeg,
    };

    if (gridHelperRef.current && isFinite(cx) && isFinite(cy)) {
      gridHelperRef.current.position.set(cx, 0.01, -cy);
    }
    if (groundMeshRef.current && isFinite(cx) && isFinite(cy)) {
      groundMeshRef.current.position.set(cx, -0.02, -cy);
    }

    // ── 1. Building Walls + Roof Slab ──────────────────────────────────────────
    if (hasValidRoofPolygon) {
      const wallMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.9, metalness: 0.05, side: THREE.DoubleSide });
      const roofMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.75, metalness: 0.12, side: THREE.DoubleSide });
      const edgeMat = new THREE.LineBasicMaterial({ color: 0x475569, linewidth: 1.5 });

      if (roofSections && roofSections.length > 0) {
        // ── MULTI-SECTION ROOF MAPPING (Independent Planes) ──────────────────
        // 1. Building Perimeter Walls down to ground
        if (showBuilding && hasValidRoofPolygon) {
          const wallGeom = new THREE.BufferGeometry();
          const wallVertices = [];
          for (let i = 0; i < roofPolygon.length; i++) {
            const j = (i + 1) % roofPolygon.length;
            const p1 = roofPolygon[i], p2 = roofPolygon[j];
            const sec1 = roofSections.find((s) => isPointInOrNearPolygon(p1.x, p1.y, s.polygon, 0.25)) || roofSections[0];
            const sec2 = roofSections.find((s) => isPointInOrNearPolygon(p2.x, p2.y, s.polygon, 0.25)) || roofSections[0];
            const h1 = calculateSectionRoofElevationAtPoint(p1.x, p1.y, sec1, fullRoof);
            const h2 = calculateSectionRoofElevationAtPoint(p2.x, p2.y, sec2, fullRoof);
            const z1 = -p1.y, z2 = -p2.y;

            wallVertices.push(
              p1.x, 0, z1,  p2.x, 0, z2,  p2.x, h2, z2,
              p1.x, 0, z1,  p2.x, h2, z2,  p1.x, h1, z1
            );
          }
          wallGeom.setAttribute("position", new THREE.Float32BufferAttribute(wallVertices, 3));
          wallGeom.computeVertexNormals();
          const wallMesh = new THREE.Mesh(wallGeom, wallMat);
          wallMesh.castShadow = true; wallMesh.receiveShadow = true;
          rootGroup.add(wallMesh);
        }

        // 2. Unified Base Building Roof Slab
        if (showRoof && hasValidRoofPolygon) {
          const baseShape = new THREE.Shape();
          roofPolygon.forEach((pt, idx) => {
            if (idx === 0) baseShape.moveTo(pt.x, -pt.y);
            else baseShape.lineTo(pt.x, -pt.y);
          });
          baseShape.closePath();
          const baseGeom = new THREE.ShapeGeometry(baseShape);
          const basePos = baseGeom.getAttribute("position");
          for (let i = 0; i < basePos.count; i++) {
            const px = basePos.getX(i);
            const pz = basePos.getY(i);
            basePos.setXYZ(i, px, buildingElevationM, pz);
          }
          baseGeom.computeVertexNormals();
          const baseMesh = new THREE.Mesh(baseGeom, roofMat);
          baseMesh.castShadow = true;
          baseMesh.receiveShadow = true;
          rootGroup.add(baseMesh);
        }

        // 3. Individual Roof Planes per Section
        if (showRoof) {
          roofSections.forEach((sec) => {
            if (!sec.polygon || sec.polygon.length < 3) return;

            const isSelectedSec = selectedSectionId === sec.id;
            const shape = new THREE.Shape();
            sec.polygon.forEach((pt, idx) => {
              if (idx === 0) shape.moveTo(pt.x, -pt.y);
              else shape.lineTo(pt.x, -pt.y);
            });
            shape.closePath();

            const secGeom = new THREE.ShapeGeometry(shape);
            const posAttr = secGeom.getAttribute("position");
            const uvAttr = secGeom.getAttribute("uv");

            for (let i = 0; i < posAttr.count; i++) {
              const px = posAttr.getX(i);
              const pz = posAttr.getY(i);
              const py = calculateSectionRoofElevationAtPoint(px, -pz, sec, fullRoof);
              const finalY = sec.pitch <= 0 ? Math.max(py, buildingElevationM + 0.005) : py;
              posAttr.setXYZ(i, px, finalY, pz);
              if (uvAttr) {
                // UV repeat scaled to real-world meters
                uvAttr.setXY(i, px / 0.40, pz / 0.40);
              }
            }
            secGeom.computeVertexNormals();

            let secMat;
            if (sec.roofType === "Tile") {
              const tileTex = getTileRoofTexture(sec.tileConfig);
              secMat = new THREE.MeshStandardMaterial({
                map: tileTex,
                roughness: 0.65,
                metalness: 0.1,
                side: THREE.DoubleSide,
              });
            } else if (sec.roofType === "Metal") {
              secMat = new THREE.MeshStandardMaterial({
                color: isSelectedSec ? 0x93c5fd : 0x64748b,
                roughness: 0.35,
                metalness: 0.8,
                side: THREE.DoubleSide,
              });
            } else if (sec.roofType === "Shingle") {
              secMat = new THREE.MeshStandardMaterial({
                color: isSelectedSec ? 0x64748b : 0x334155,
                roughness: 0.9,
                metalness: 0.05,
                side: THREE.DoubleSide,
              });
            } else {
              // RCC Concrete
              secMat = new THREE.MeshStandardMaterial({
                color: isSelectedSec ? 0xcffafe : 0xe2e8f0,
                roughness: 0.8,
                metalness: 0.1,
                side: THREE.DoubleSide,
              });
            }

            const secMesh = new THREE.Mesh(secGeom, secMat);
            secMesh.castShadow = true;
            secMesh.receiveShadow = true;
            secMesh.userData = {
              isRoofSection: true,
              sectionId: sec.id,
              sectionName: sec.name,
            };
            rootGroup.add(secMesh);
            sectionMeshMapRef.current[sec.id] = secMesh;

            // Edge wireframe (Highlighted cyan only when section is selected)
            if (isSelectedSec) {
              const secEdgeGeom = new THREE.EdgesGeometry(secGeom);
              const secEdgeMat = new THREE.LineBasicMaterial({
                color: 0x06b6d4,
                linewidth: 3,
              });
              secMesh.add(new THREE.LineSegments(secEdgeGeom, secEdgeMat));
            }
          });
        }
      } else if (roofType === "gable" && roofPitchDeg > 0) {
        // Construct Gable Roof with central ridge and 2 sloping planes + triangular gable end walls
        const isLengthX = bounds.width >= bounds.length;
        const eaveH = Number(fullRoof.eave_height_m);
        const halfSpan = isLengthX ? bounds.length / 2 : bounds.width / 2;
        const ridgeH = Number(fullRoof.ridge_height_m ?? (eaveH + halfSpan * Math.tan(roofPitchRad)));

        const shape = new THREE.Shape();
        roofPolygon.forEach((pt, idx) => {
          if (idx === 0) shape.moveTo(pt.x, -pt.y);
          else shape.lineTo(pt.x, -pt.y);
        });
        shape.closePath();

        if (showBuilding && eaveH > 0) {
          const wallGeom = new THREE.ExtrudeGeometry(shape, { steps: 1, depth: eaveH, bevelEnabled: false });
          wallGeom.rotateX(Math.PI / 2);
          const wallMesh = new THREE.Mesh(wallGeom, wallMat);
          wallMesh.castShadow = true; wallMesh.receiveShadow = true;
          rootGroup.add(wallMesh);
        }

        if (showRoof) {
          const gableGeom = new THREE.BufferGeometry();
          const vertices = [];

          if (isLengthX) {
            const x0 = bounds.minX, x1 = bounds.maxX;
            const y0 = -bounds.maxY, y1 = -bounds.minY; // note: THREE.z = -y
            const zRidge = -cy;

            // Plane 1: from y0 (North eave) to zRidge (apex)
            vertices.push(
              x0, eaveH, y0,  x1, eaveH, y0,  x1, ridgeH, zRidge,
              x0, eaveH, y0,  x1, ridgeH, zRidge,  x0, ridgeH, zRidge
            );
            // Plane 2: from zRidge (apex) to y1 (South eave)
            vertices.push(
              x0, ridgeH, zRidge,  x1, ridgeH, zRidge,  x1, eaveH, y1,
              x0, ridgeH, zRidge,  x1, eaveH, y1,  x0, eaveH, y1
            );
            // Gable triangular end wall caps
            vertices.push(x0, eaveH, y0,  x0, ridgeH, zRidge,  x0, eaveH, y1);
            vertices.push(x1, eaveH, y0,  x1, eaveH, y1,  x1, ridgeH, zRidge);
          } else {
            const x0 = bounds.minX, x1 = bounds.maxX;
            const y0 = -bounds.maxY, y1 = -bounds.minY;
            const xRidge = cx;

            // Plane 1: from x0 (West eave) to xRidge (apex)
            vertices.push(
              x0, eaveH, y0,  xRidge, ridgeH, y0,  xRidge, ridgeH, y1,
              x0, eaveH, y0,  xRidge, ridgeH, y1,  x0, eaveH, y1
            );
            // Plane 2: from xRidge (apex) to x1 (East eave)
            vertices.push(
              xRidge, ridgeH, y0,  x1, eaveH, y0,  x1, eaveH, y1,
              xRidge, ridgeH, y0,  x1, eaveH, y1,  xRidge, ridgeH, y1
            );
            // Gable triangular end wall caps
            vertices.push(x0, eaveH, y0,  xRidge, ridgeH, y0,  x1, eaveH, y0);
            vertices.push(x0, eaveH, y1,  x1, eaveH, y1,  xRidge, ridgeH, y1);
          }

          gableGeom.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
          gableGeom.computeVertexNormals();
          const gableMesh = new THREE.Mesh(gableGeom, roofMat);
          gableMesh.castShadow = true; gableMesh.receiveShadow = true;
          rootGroup.add(gableMesh);

          const wireframe = new THREE.LineSegments(new THREE.EdgesGeometry(gableGeom), edgeMat);
          gableMesh.add(wireframe);
        }
      } else if (roofType === "hip" && roofPitchDeg > 0) {
        // Construct Hip Roof with 4 sloped planes meeting at central ridge
        const isLengthX = bounds.width >= bounds.length;
        const eaveH = Number(fullRoof.eave_height_m);
        const halfSpan = isLengthX ? bounds.length / 2 : bounds.width / 2;
        const ridgeH = Number(fullRoof.ridge_height_m ?? (eaveH + halfSpan * Math.tan(roofPitchRad)));

        const shape = new THREE.Shape();
        roofPolygon.forEach((pt, idx) => {
          if (idx === 0) shape.moveTo(pt.x, -pt.y);
          else shape.lineTo(pt.x, -pt.y);
        });
        shape.closePath();

        if (showBuilding && eaveH > 0) {
          const wallGeom = new THREE.ExtrudeGeometry(shape, { steps: 1, depth: eaveH, bevelEnabled: false });
          wallGeom.rotateX(Math.PI / 2);
          const wallMesh = new THREE.Mesh(wallGeom, wallMat);
          wallMesh.castShadow = true; wallMesh.receiveShadow = true;
          rootGroup.add(wallMesh);
        }

        if (showRoof) {
          const hipGeom = new THREE.BufferGeometry();
          const vertices = [];
          const x0 = bounds.minX, x1 = bounds.maxX;
          const y0 = -bounds.maxY, y1 = -bounds.minY;

          if (isLengthX) {
            const zRidge = -cy;
            const rX0 = Math.min(cx, x0 + halfSpan);
            const rX1 = Math.max(cx, x1 - halfSpan);

            // Trapezoid 1: North slope (y0) to ridge
            vertices.push(
              x0, eaveH, y0,  x1, eaveH, y0,  rX1, ridgeH, zRidge,
              x0, eaveH, y0,  rX1, ridgeH, zRidge,  rX0, ridgeH, zRidge
            );
            // Trapezoid 2: South slope (y1) to ridge
            vertices.push(
              x0, eaveH, y1,  rX0, ridgeH, zRidge,  rX1, ridgeH, zRidge,
              x0, eaveH, y1,  rX1, ridgeH, zRidge,  x1, eaveH, y1
            );
            // Triangle 3: West end
            vertices.push(x0, eaveH, y0,  rX0, ridgeH, zRidge,  x0, eaveH, y1);
            // Triangle 4: East end
            vertices.push(x1, eaveH, y0,  x1, eaveH, y1,  rX1, ridgeH, zRidge);
          } else {
            const xRidge = cx;
            const rY0 = Math.min(-cy, y0 + halfSpan);
            const rY1 = Math.max(-cy, y1 - halfSpan);

            // Trapezoid 1: West slope (x0) to ridge
            vertices.push(
              x0, eaveH, y0,  xRidge, ridgeH, rY0,  xRidge, ridgeH, rY1,
              x0, eaveH, y0,  xRidge, ridgeH, rY1,  x0, eaveH, y1
            );
            // Trapezoid 2: East slope (x1) to ridge
            vertices.push(
              x1, eaveH, y0,  x1, eaveH, y1,  xRidge, ridgeH, rY1,
              x1, eaveH, y0,  xRidge, ridgeH, rY1,  xRidge, ridgeH, rY0
            );
            // Triangle 3: North end
            vertices.push(x0, eaveH, y0,  x1, eaveH, y0,  xRidge, ridgeH, rY0);
            // Triangle 4: South end
            vertices.push(x0, eaveH, y1,  xRidge, ridgeH, rY1,  x1, eaveH, y1);
          }

          hipGeom.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
          hipGeom.computeVertexNormals();
          const hipMesh = new THREE.Mesh(hipGeom, roofMat);
          hipMesh.castShadow = true; hipMesh.receiveShadow = true;
          rootGroup.add(hipMesh);

          const wireframe = new THREE.LineSegments(new THREE.EdgesGeometry(hipGeom), edgeMat);
          hipMesh.add(wireframe);
        }
      } else if (roofPitchDeg > 0) {
        // Single Slope or Custom Polygon sloped roof with continuous perimeter wedge walls
        if (showBuilding) {
          const wallGeom = new THREE.BufferGeometry();
          const wallVertices = [];
          for (let i = 0; i < roofPolygon.length; i++) {
            const j = (i + 1) % roofPolygon.length;
            const p1 = roofPolygon[i], p2 = roofPolygon[j];
            const h1 = calculateRoofElevationAtPoint(p1.x, p1.y, fullRoof);
            const h2 = calculateRoofElevationAtPoint(p2.x, p2.y, fullRoof);
            const z1 = -p1.y, z2 = -p2.y;

            // 2 triangles per perimeter wall segment
            wallVertices.push(
              p1.x, 0, z1,  p2.x, 0, z2,  p2.x, h2, z2,
              p1.x, 0, z1,  p2.x, h2, z2,  p1.x, h1, z1
            );
          }
          wallGeom.setAttribute("position", new THREE.Float32BufferAttribute(wallVertices, 3));
          wallGeom.computeVertexNormals();
          const wallMesh = new THREE.Mesh(wallGeom, wallMat);
          wallMesh.castShadow = true; wallMesh.receiveShadow = true;
          rootGroup.add(wallMesh);
        }

        if (showRoof) {
          const shape = new THREE.Shape();
          roofPolygon.forEach((pt, idx) => {
            if (idx === 0) shape.moveTo(pt.x, -pt.y);
            else shape.lineTo(pt.x, -pt.y);
          });
          shape.closePath();

          const flatGeom = new THREE.ShapeGeometry(shape);
          const posAttr = flatGeom.getAttribute("position");
          for (let i = 0; i < posAttr.count; i++) {
            const px = posAttr.getX(i);
            const pz = posAttr.getY(i);
            const py = calculateRoofElevationAtPoint(px, -pz, fullRoof);
            posAttr.setXYZ(i, px, py, pz);
          }
          flatGeom.computeVertexNormals();

          const pitchedMesh = new THREE.Mesh(flatGeom, roofMat);
          pitchedMesh.castShadow = true; pitchedMesh.receiveShadow = true;
          rootGroup.add(pitchedMesh);

          const wireframe = new THREE.LineSegments(new THREE.EdgesGeometry(flatGeom), edgeMat);
          pitchedMesh.add(wireframe);
        }
      } else {
        // Flat Roof (0° pitch)
        const shape = new THREE.Shape();
        roofPolygon.forEach((pt, idx) => {
          if (idx === 0) shape.moveTo(pt.x, -pt.y);
          else shape.lineTo(pt.x, -pt.y);
        });
        shape.closePath();

        if (showBuilding && buildingElevationM > 0) {
          const wallGeom = new THREE.ExtrudeGeometry(shape, { steps: 1, depth: buildingElevationM, bevelEnabled: false });
          wallGeom.rotateX(Math.PI / 2);
          const wallMesh = new THREE.Mesh(wallGeom, wallMat);
          wallMesh.position.y = 0;
          wallMesh.castShadow = true; wallMesh.receiveShadow = true;
          rootGroup.add(wallMesh);
        }

        if (showRoof) {
          const roofExtrudeSettings = { steps: 1, depth: 0.35, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 };
          const roofGeom = new THREE.ExtrudeGeometry(shape, roofExtrudeSettings);
          roofGeom.rotateX(Math.PI / 2);
          const roofMesh = new THREE.Mesh(roofGeom, roofMat);
          roofMesh.position.y = buildingElevationM;
          roofMesh.receiveShadow = true; roofMesh.castShadow = true;
          rootGroup.add(roofMesh);
          const edgeGeom = new THREE.EdgesGeometry(roofGeom);
          const edgeMatSegments = new THREE.LineBasicMaterial({ color: 0x64748b, linewidth: 1.5 });
          roofMesh.add(new THREE.LineSegments(edgeGeom, edgeMatSegments));
        }
      }
    } else {
      // ── Blueprint Building Ghost Template (Rendered when no custom roof is traced yet) ──
      // Prevents 3D scene from appearing as a pitch-black void with just an arrow
      const defaultW = 14;
      const defaultL = 10;
      const defaultH = 3.5;
      const ghostMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.85,
        metalness: 0.15,
        transparent: true,
        opacity: 0.45,
      });
      const ghostRoofMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.7,
        metalness: 0.2,
        transparent: true,
        opacity: 0.6,
      });
      const ghostWireMat = new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.5,
      });

      const buildingMesh = new THREE.Mesh(new THREE.BoxGeometry(defaultW, defaultH, defaultL), ghostMat);
      buildingMesh.position.set(0, defaultH / 2, 0);
      rootGroup.add(buildingMesh);

      const wireMesh = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(defaultW, defaultH, defaultL)),
        ghostWireMat
      );
      wireMesh.position.set(0, defaultH / 2, 0);
      rootGroup.add(wireMesh);

      const slabMesh = new THREE.Mesh(new THREE.BoxGeometry(defaultW + 0.4, 0.25, defaultL + 0.4), ghostRoofMat);
      slabMesh.position.set(0, defaultH + 0.125, 0);
      rootGroup.add(slabMesh);
    }

    // ── 2. Solar PV Modules + Row-Based Mounting Structure ────────────────────
    if (activePanels.length > 0) {
      const structType = (structure?.type || "elevated").toLowerCase();
      const isFlush = structType === "flush";
      const isElevated = structType === "elevated";
      const isFixedTilt = structType === "fixed_tilt";
      const isEastWest = structType === "east_west";
      const isBallasted = structType === "ballasted";
      const structMaterial = structure?.material || "GI";

      const baseClearance = isFlush ? 0.12 : Number(structure?.height_m || 1.8);
      const panelTiltDeg = isFlush ? roofPitchDeg : Number(structure?.tilt_deg || 15);
      const structAzimuth = Number(structure?.azimuth ?? 180);

      // Photorealistic Solar Cell Wafer Texture
      const solarTexture = createSolarCellCanvasTexture();
      const siliconCellMat = new THREE.MeshStandardMaterial({
        map: solarTexture,
        roughness: 0.12,
        metalness: 0.65,
      });
      const frameMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.3, metalness: 0.88 });
      const moduleMaterials = [frameMat, frameMat, siliconCellMat, frameMat, frameMat, frameMat];

      // Material finish based on structureMaterial prop (GI, Aluminium, MS)
      let railMatColor = 0x94a3b8; // GI
      let postMatColor = 0x64748b;
      let structMetalness = 0.8;
      let structRoughness = 0.35;
      if (structMaterial === "Aluminium") {
        railMatColor = 0xd1d5db;
        postMatColor = 0xb0b8c8;
        structMetalness = 0.9;
        structRoughness = 0.25;
      } else if (structMaterial === "MS") {
        railMatColor = 0x334155;
        postMatColor = 0x1e293b;
        structMetalness = 0.6;
        structRoughness = 0.45;
      }

      // Visual materials
      const railMat = new THREE.MeshStandardMaterial({ color: railMatColor, roughness: structRoughness, metalness: structMetalness });
      const rafterMat = new THREE.MeshStandardMaterial({ color: postMatColor, roughness: structRoughness + 0.05, metalness: structMetalness });
      const postMat = new THREE.MeshStandardMaterial({ color: postMatColor, roughness: structRoughness, metalness: structMetalness });
      const basePlateMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.9 });
      const boltMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.2, metalness: 0.95 });
      const braceMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: structRoughness, metalness: structMetalness });
      const ballastMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.95, metalness: 0.05 });
      const clampMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.25, metalness: 0.85 });

      // Engineering Mode materials (high-contrast functional color-coding)
      const engRailMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3, metalness: 0.7 }); // Amber
      const engRafterMat = new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.3, metalness: 0.7 }); // Cyan
      const engPostMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.3, metalness: 0.8 }); // Blue
      const engBraceMat = new THREE.MeshStandardMaterial({ color: 0xa855f7, roughness: 0.3, metalness: 0.7 }); // Purple

      // Selection materials
      const selectedMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.6,
        roughness: 0.2,
        metalness: 0.8,
      });
      const groupSelectedMat = new THREE.MeshStandardMaterial({
        color: 0x60a5fa,
        emissive: 0x2563eb,
        emissiveIntensity: 0.3,
        roughness: 0.3,
        metalness: 0.7,
      });

      // A. Render PV Panels with realistic mono PERC cell wafer texture, beveled border & clamps
      if (showPanels) {
        const renderablePanels = activePanels.filter((p) => {
          if (!roofSections || roofSections.length === 0) return true;
          const sec = roofSections.find((s) => s.id === p.sectionId) ||
                      roofSections.find((s) => isPointInsidePolygon(p.x, p.y, s.polygon));
          return !sec || sec.solarEnabled !== false;
        });

        renderablePanels.forEach((p) => {
          const pw = Number(p.width || 1.134);
          const pl = Number(p.height || 2.278);

          // Find the section this panel belongs to
          const pSec = (roofSections && roofSections.length > 0)
            ? (roofSections.find((s) => s.id === p.sectionId) || roofSections.find((s) => isPointInsidePolygon(p.x, p.y, s.polygon)) || roofSections[0])
            : null;

          const panelAzimuth = Number(p.azimuth ?? pSec?.azimuth ?? structAzimuth);
          const panelPitch = pSec ? Number(pSec.pitch ?? 0) : panelTiltDeg;
          const secMType = (pSec?.mountingType || "").toLowerCase();
          const isSectionFlush = secMType === "flush" || secMType === "tile_hook_rail"
            ? true
            : (secMType === "elevated" || secMType === "fixed_tilt" || secMType === "ballasted" || secMType === "ground_mount")
            ? false
            : (pSec?.roofType === "Tile" || pSec?.roofType === "Metal" || isFlush);
          const secTiltAngle = Number(pSec?.tilt_deg ?? p.tilt ?? structure?.tilt_deg ?? 15);
          const effectiveTiltDeg = isSectionFlush ? panelPitch : secTiltAngle;

          // Panel elevation on section
          const sectionRoofElevation = pSec
            ? calculateSectionRoofElevationAtPoint(p.x, p.y, pSec, fullRoof)
            : calculateRoofElevationAtPoint(p.x, p.y, fullRoof);

          const structClearance = isSectionFlush ? 0.12 : Number(pSec?.structure_height_m ?? baseClearance);
          const tiltRad = toRad(effectiveTiltDeg);
          const verticalOffset = (pl / 2) * Math.sin(tiltRad);
          const yawRad = toRad(panelAzimuth - 180);
          const posX = Number(p.x || 0);
          const posY = sectionRoofElevation + structClearance + verticalOffset + 0.035;
          const posZ = -Number(p.y || 0);

          const panelGroup = new THREE.Group();
          panelGroup.position.set(posX, posY, posZ);
          panelGroup.rotation.y = yawRad + toRad(p.rotation || 0);

          // 1. PV Module Body with Monocrystalline PERC cell texture
          const panelMesh = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.038, pl), moduleMaterials);
          panelMesh.rotation.x = -tiltRad;
          panelMesh.castShadow = true; panelMesh.receiveShadow = true;
          panelMesh.userData = {
            isPanel: true,
            panelId: p.id,
            sectionId: pSec?.id,
            sectionName: pSec?.name,
            row: p.row,
          };
          panelGroup.add(panelMesh);
          if (p.id) {
            panelMeshMapRef.current[p.id] = panelMesh;
          }

          // 3D Panel Selection Outline Highlight
          const isSingleSel = activeSelectedPanelId === p.id;
          const isRowSel = activeSelectionMode === "row" && activeSelectedRowIndex != null && p.row === activeSelectedRowIndex;
          const isArraySel = activeSelectionMode === "array" && (activeSelectedPanelId != null || activeSelectedRowIndex != null);
          const isPanelHighlighted = isSingleSel || isRowSel || isArraySel;

          if (isPanelHighlighted) {
            const selGeom = new THREE.EdgesGeometry(new THREE.BoxGeometry(pw + 0.03, 0.055, pl + 0.03));
            const selMat = new THREE.LineBasicMaterial({
              color: isSingleSel ? 0x06b6d4 : 0xf59e0b,
              linewidth: 3,
            });
            const selOutline = new THREE.LineSegments(selGeom, selMat);
            selOutline.rotation.x = -tiltRad;
            panelGroup.add(selOutline);
          }

          // 2. Beveled Aluminium Frame Lip (0.012m outer border)
          const frameLipGeom = new THREE.BoxGeometry(pw + 0.016, 0.012, pl + 0.016);
          const frameLipMesh = new THREE.Mesh(frameLipGeom, frameMat);
          frameLipMesh.position.set(0, -0.016, 0);
          frameLipMesh.rotation.x = -tiltRad;
          panelGroup.add(frameLipMesh);

          rootGroup.add(panelGroup);
        });
      }

      // B. Render Row-Based Structural Mounting Framework with Node-to-Node Precision (Per-Section Isolated)
      if (showStructures) {
        const sectionsToProcess = (roofSections && roofSections.length > 0)
          ? roofSections
          : [{
              id: "sec_default",
              name: "Default Roof",
              polygon: roofPolygon,
              solarEnabled: true,
              structureEnabled: true,
              mountingType: structType,
              pitch: roofPitchDeg,
              azimuth: structAzimuth,
            }];

        sectionsToProcess.forEach((sec) => {
          if (sec.solarEnabled === false || sec.structureEnabled === false) return;

          // Panels specifically belonging to THIS section
          const secPanels = activePanels.filter((p) => {
            if (p.sectionId) return p.sectionId === sec.id;
            if (sec.polygon && sec.polygon.length >= 3) {
              return isPointInsidePolygon(p.x, p.y, sec.polygon);
            }
            return false;
          });

          if (secPanels.length === 0) return;

          // Determine section-specific structure parameters
          const secMountType = (sec.mountingType || "").toLowerCase();
          const isSecTile = sec.roofType === "Tile";
          const isSecMetal = sec.roofType === "Metal";
          const isSecFlush = secMountType === "flush"
            ? true
            : (secMountType === "elevated" || secMountType === "ballasted")
            ? false
            : (isSecTile || isSecMetal || isFlush);
          const isSecElevated = !isSecFlush;

          const secAzimuth = Number(sec.azimuth ?? structAzimuth ?? 180);
          const secPitchDeg = isSecFlush ? Number(sec.pitch ?? 0) : Number(sec.tilt_deg ?? structure?.tilt_deg ?? 15);
          const secTiltRad = toRad(secPitchDeg);
          const secAzRad = toRad(secAzimuth - 180);
          const secCosAz = Math.cos(secAzRad);
          const secSinAz = Math.sin(secAzRad);
          const secClearance = isSecFlush ? 0.12 : Number(sec.structure_height_m ?? structure?.height_m ?? baseClearance);

          // Cluster panels of THIS section into rows using THIS section's azimuth
          const rows = clusterPanelsIntoRows(secPanels, secAzimuth);

          rows.forEach((row, rIdx) => {
            const groupId = `sec-${sec.id}-row-${rIdx}`;
            const tiltRad = secTiltRad;
            const azRad = secAzRad;
            const cosAz = secCosAz;
            const sinAz = secSinAz;

            const rowRoofY = calculateSectionRoofElevationAtPoint(row.centerX, row.centerY, sec, fullRoof);
            const frameCenterY = rowRoofY + secClearance + (row.pl / 2) * Math.sin(tiltRad);

            // ── FLUSH MOUNT: Mini Rails directly on roof surface ───────────────
            if (isSecFlush) {
              const effectiveRowTiltRad = toRad(Number(sec.pitch ?? 0));
              const railLength = row.totalRowLength + 0.12;
              const railGeom = new THREE.BoxGeometry(railLength, 0.035, 0.045);
              [-row.pl * 0.28, row.pl * 0.28].forEach((vOff, railIdx) => {
                const railId = `member-sec${sec.id}-row${rIdx}-flush-rail-${railIdx}`;
                if (deletedMemberIdsRef.current.has(railId)) return;

                const railZ = vOff * Math.cos(effectiveRowTiltRad);
                const wx = row.centerX - railZ * sinAz;
                const wy = row.centerY + railZ * cosAz;
                const wRoofY = calculateSectionRoofElevationAtPoint(wx, wy, sec, fullRoof);
                const finalY = wRoofY + (isSecTile ? 0.08 : 0.04);

                const isSel = selectedMemberId === railId;
                const isGrpSel = selectedGroupId === groupId;
                const rMat = isSel ? selectedMat : isGrpSel ? groupSelectedMat : viewMode === "engineering" ? engRailMat : railMat;

                const railMesh = new THREE.Mesh(railGeom, rMat);
                railMesh.position.set(wx, finalY, -wy);
                railMesh.rotation.y = azRad;
                railMesh.rotation.x = -effectiveRowTiltRad;
                railMesh.userData = {
                  memberId: railId,
                  groupId,
                  sectionId: sec.id,
                  type: "Purlin / Rail",
                  material: structMaterial,
                  length: Number(railLength.toFixed(2)),
                };
                railMesh.castShadow = true;
                rootGroup.add(railMesh);
                memberMeshMapRef.current[railId] = railMesh;

                // IF TILE ROOF: Add Tile Roof Hooks under the rail
                if (isSecTile && row.items && row.items.length > 0) {
                  const hookMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.35, metalness: 0.85 });
                  row.items.forEach((it) => {
                    const uPos = it.u - row.centerU;
                    const hx = wx + uPos * cosAz;
                    const hy = wy + uPos * sinAz;
                    const hRoofY = calculateSectionRoofElevationAtPoint(hx, hy, sec, fullRoof);

                    const hookGroup = new THREE.Group();
                    hookGroup.position.set(hx, hRoofY, -hy);
                    hookGroup.rotation.y = azRad;
                    hookGroup.rotation.x = -effectiveRowTiltRad;

                    // Hook Foot (bolted under tile)
                    const footMesh = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.008, 0.12), hookMat);
                    footMesh.position.set(0, 0.004, -0.04);
                    hookGroup.add(footMesh);

                    // Hook Arm (riser coming up through tile gap)
                    const armMesh = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.075, 0.03), hookMat);
                    armMesh.position.set(0, 0.04, 0);
                    hookGroup.add(armMesh);

                    // Hook Top (bracket clamping rail)
                    const topMesh = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, 0.05), hookMat);
                    topMesh.position.set(0, 0.075, 0);
                    hookGroup.add(topMesh);

                    rootGroup.add(hookGroup);
                  });
                }

                // Mid and End Clamps on top of flush rail
                if (row.items && row.items.length > 0) {
                  const clampGeom = new THREE.BoxGeometry(0.035, 0.018, 0.045);
                  row.items.forEach((it, itIdx) => {
                    const uPos = it.u - row.centerU;
                    const isFirst = itIdx === 0;
                    const uOffsets = [];
                    if (isFirst) uOffsets.push(uPos - it.pw / 2 + 0.02);
                    uOffsets.push(uPos + it.pw / 2 - 0.02);

                    uOffsets.forEach((uCl) => {
                      const clampMesh = new THREE.Mesh(clampGeom, clampMat);
                      clampMesh.position.set(wx + uCl * cosAz, finalY + 0.02, -(wy + uCl * sinAz));
                      clampMesh.rotation.y = azRad;
                      clampMesh.rotation.x = -effectiveRowTiltRad;
                      rootGroup.add(clampMesh);
                    });
                  });
                }
              });
              return;
            }

            // ── TILTED / ELEVATED / FIXED TILT / BALLASTED MOUNT ───────────────
            const rowMountGroup = new THREE.Group();
            rowMountGroup.position.set(row.centerX, frameCenterY, -row.centerY);
            rowMountGroup.rotation.y = azRad;

            const tiltedSubgroup = new THREE.Group();
            tiltedSubgroup.rotation.x = -tiltRad;
            rowMountGroup.add(tiltedSubgroup);

            // 1. CONTINUOUS RAILS (Bottom Rail & Top Rail)
            const railLength = row.totalRowLength + 0.14;
            const railGeom = new THREE.BoxGeometry(railLength, 0.045, 0.055);

            const railsConfig = [
              { idSuffix: "rail-bottom", vRel: +row.pl * 0.28, label: "Bottom Rail" },
              { idSuffix: "rail-top", vRel: -row.pl * 0.28, label: "Top Rail" },
            ];

            railsConfig.forEach(({ idSuffix, vRel }) => {
              const railId = `member-sec${sec.id}-row${rIdx}-${idSuffix}`;
              if (deletedMemberIdsRef.current.has(railId)) return;

              const isSel = selectedMemberId === railId;
              const isGrpSel = selectedGroupId === groupId;
              const rMat = isSel ? selectedMat : isGrpSel ? groupSelectedMat : viewMode === "engineering" ? engRailMat : railMat;

              const railMesh = new THREE.Mesh(railGeom, rMat);
              railMesh.position.set(0, -0.0415, vRel);
              railMesh.userData = {
                memberId: railId,
                groupId,
                sectionId: sec.id,
                type: "Purlin / Rail",
                material: structMaterial,
                length: Number(railLength.toFixed(2)),
              };
              railMesh.castShadow = true;
              tiltedSubgroup.add(railMesh);
              memberMeshMapRef.current[railId] = railMesh;
            });

            // 2. MID CLAMPS & END CLAMPS AT RAIL INTERSECTIONS
            if (row.items && row.items.length > 0) {
              const clampGeom = new THREE.BoxGeometry(0.035, 0.018, 0.045);
              row.items.forEach((it, itIdx) => {
                const uPos = it.u - row.centerU;
                const isFirst = itIdx === 0;
                const uOffsets = [];
                if (isFirst) uOffsets.push(uPos - it.pw / 2 + 0.02);
                uOffsets.push(uPos + it.pw / 2 - 0.02);

                uOffsets.forEach((uCl) => {
                  [+row.pl * 0.28, -row.pl * 0.28].forEach((vRel) => {
                    const clampMesh = new THREE.Mesh(clampGeom, clampMat);
                    clampMesh.position.set(uCl, 0.018, vRel);
                    tiltedSubgroup.add(clampMesh);
                  });
                });
              });
            }

            // 3. STRUCTURAL FRAMES: Rafters, Posts, Base Plates, and Cross Braces
            const rafterLength = row.pl * 0.88;
            const rafterGeom = new THREE.BoxGeometry(0.06, 0.08, rafterLength);
            const basePlateGeom = new THREE.BoxGeometry(0.20, 0.022, 0.20);
            const boltGeom = new THREE.CylinderGeometry(0.008, 0.008, 0.035, 8);

            const rafterLocalY = -0.104;
            const rafterBottomLocalY = -0.144;
            const frontVRel = +row.pl * 0.28;
            const rearVRel = -row.pl * 0.28;

            row.rafterUOffsets.forEach((uOffset, idx) => {
              const uRel = uOffset - row.centerU;
              const isEndFrame = idx === 0 || idx === row.rafterUOffsets.length - 1;

              // A. RAFTER BEAM
              const rafterId = `member-sec${sec.id}-row${rIdx}-rafter-${idx}`;
              if (!deletedMemberIdsRef.current.has(rafterId)) {
                const isSel = selectedMemberId === rafterId;
                const isGrpSel = selectedGroupId === groupId;
                const rafMat = isSel ? selectedMat : isGrpSel ? groupSelectedMat : viewMode === "engineering" ? engRafterMat : rafterMat;

                const rafterMesh = new THREE.Mesh(rafterGeom, rafMat);
                rafterMesh.position.set(uRel, rafterLocalY, 0);
                rafterMesh.userData = {
                  memberId: rafterId,
                  groupId,
                  sectionId: sec.id,
                  type: "Rafter Beam",
                  material: structMaterial,
                  length: Number(rafterLength.toFixed(2)),
                };
                rafterMesh.castShadow = true;
                tiltedSubgroup.add(rafterMesh);
                memberMeshMapRef.current[rafterId] = rafterMesh;
              }

              // Post attachment points on rafter bottom
              const nodeFrontLocal = new THREE.Vector3(uRel, rafterBottomLocalY, frontVRel);
              const nodeRearLocal = new THREE.Vector3(uRel, rafterBottomLocalY, rearVRel);
              const nodeFrontInMount = nodeFrontLocal.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), -tiltRad);
              const nodeRearInMount = nodeRearLocal.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), -tiltRad);

              const worldFrontX = row.centerX + nodeFrontInMount.x * cosAz + nodeFrontInMount.z * sinAz;
              const worldFrontY = row.centerY - nodeFrontInMount.x * sinAz + nodeFrontInMount.z * cosAz;
              const worldRearX = row.centerX + nodeRearInMount.x * cosAz + nodeRearInMount.z * sinAz;
              const worldRearY = row.centerY - nodeRearInMount.x * sinAz + nodeRearInMount.z * cosAz;

              const roofFrontY = calculateSectionRoofElevationAtPoint(worldFrontX, worldFrontY, sec, fullRoof);
              const roofRearY = calculateSectionRoofElevationAtPoint(worldRearX, worldRearY, sec, fullRoof);

              const frontPostTopY = frameCenterY + nodeFrontInMount.y;
              const rearPostTopY = frameCenterY + nodeRearInMount.y;

              const frontPostH = Math.max(0.15, frontPostTopY - roofFrontY);
              const rearPostH = Math.max(0.15, rearPostTopY - roofRearY);

              // B. FRONT POST
              const postFrontId = `member-sec${sec.id}-row${rIdx}-post-front-${idx}`;
              if (!deletedMemberIdsRef.current.has(postFrontId)) {
                const isSel = selectedMemberId === postFrontId;
                const isGrpSel = selectedGroupId === groupId;
                const pMat = isSel ? selectedMat : isGrpSel ? groupSelectedMat : viewMode === "engineering" ? engPostMat : postMat;

                const frontPostGeom = new THREE.BoxGeometry(0.065, frontPostH, 0.065);
                const frontPostMesh = new THREE.Mesh(frontPostGeom, pMat);
                frontPostMesh.position.set(nodeFrontInMount.x, (frontPostTopY + roofFrontY) / 2 - frameCenterY, nodeFrontInMount.z);
                frontPostMesh.userData = {
                  memberId: postFrontId,
                  groupId,
                  sectionId: sec.id,
                  type: "Front Column / Post",
                  material: structMaterial,
                  length: Number(frontPostH.toFixed(2)),
                };
                frontPostMesh.castShadow = true;
                rowMountGroup.add(frontPostMesh);
                memberMeshMapRef.current[postFrontId] = frontPostMesh;

                // Base Plate & Anchor Bolts
                const basePlateMesh = new THREE.Mesh(basePlateGeom, basePlateMat);
                basePlateMesh.position.set(nodeFrontInMount.x, roofFrontY - frameCenterY + 0.011, nodeFrontInMount.z);
                rowMountGroup.add(basePlateMesh);

                [-0.065, 0.065].forEach((bx) => {
                  [-0.065, 0.065].forEach((bz) => {
                    const bolt = new THREE.Mesh(boltGeom, boltMat);
                    bolt.position.set(nodeFrontInMount.x + bx, roofFrontY - frameCenterY + 0.026, nodeFrontInMount.z + bz);
                    rowMountGroup.add(bolt);
                  });
                });
              }

              // C. REAR POST
              const postRearId = `member-sec${sec.id}-row${rIdx}-post-rear-${idx}`;
              if (!deletedMemberIdsRef.current.has(postRearId)) {
                const isSel = selectedMemberId === postRearId;
                const isGrpSel = selectedGroupId === groupId;
                const pMat = isSel ? selectedMat : isGrpSel ? groupSelectedMat : viewMode === "engineering" ? engPostMat : postMat;

                const rearPostGeom = new THREE.BoxGeometry(0.065, rearPostH, 0.065);
                const rearPostMesh = new THREE.Mesh(rearPostGeom, pMat);
                rearPostMesh.position.set(nodeRearInMount.x, (rearPostTopY + roofRearY) / 2 - frameCenterY, nodeRearInMount.z);
                rearPostMesh.userData = {
                  memberId: postRearId,
                  groupId,
                  sectionId: sec.id,
                  type: "Rear Column / Post",
                  material: structMaterial,
                  length: Number(rearPostH.toFixed(2)),
                };
                rearPostMesh.castShadow = true;
                rowMountGroup.add(rearPostMesh);
                memberMeshMapRef.current[postRearId] = rearPostMesh;

                // Base Plate & Anchor Bolts
                const basePlateRearMesh = new THREE.Mesh(basePlateGeom, basePlateMat);
                basePlateRearMesh.position.set(nodeRearInMount.x, roofRearY - frameCenterY + 0.011, nodeRearInMount.z);
                rowMountGroup.add(basePlateRearMesh);

                [-0.065, 0.065].forEach((bx) => {
                  [-0.065, 0.065].forEach((bz) => {
                    const bolt = new THREE.Mesh(boltGeom, boltMat);
                    bolt.position.set(nodeRearInMount.x + bx, roofRearY - frameCenterY + 0.026, nodeRearInMount.z + bz);
                    rowMountGroup.add(bolt);
                  });
                });
              }

              // D. CROSS BRACING (on elevated end frames or clearance >= 1.2m)
              if (isSecElevated && secClearance >= 1.2 && isEndFrame && structure?.cross_bracing !== false) {
                const braceId = `member-sec${sec.id}-row${rIdx}-brace-${idx}`;
                if (!deletedMemberIdsRef.current.has(braceId)) {
                  const isSel = selectedMemberId === braceId;
                  const isGrpSel = selectedGroupId === groupId;
                  const bMat = isSel ? selectedMat : isGrpSel ? groupSelectedMat : viewMode === "engineering" ? engBraceMat : braceMat;

                  const pFrontFoot = new THREE.Vector3(nodeFrontInMount.x, roofFrontY - frameCenterY, nodeFrontInMount.z);
                  const pRearTop = nodeRearInMount.clone();
                  const braceDiff = new THREE.Vector3().subVectors(pRearTop, pFrontFoot);
                  const braceLength = braceDiff.length();
                  const braceMid = new THREE.Vector3().addVectors(pFrontFoot, pRearTop).multiplyScalar(0.5);

                  const braceGeom = new THREE.CylinderGeometry(0.02, 0.02, braceLength, 8);
                  const braceMesh = new THREE.Mesh(braceGeom, bMat);
                  braceMesh.position.copy(braceMid);
                  braceMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), braceDiff.clone().normalize());
                  braceMesh.userData = {
                    memberId: braceId,
                    groupId,
                    sectionId: sec.id,
                    type: "Diagonal Brace",
                    material: structMaterial,
                    length: Number(braceLength.toFixed(2)),
                  };
                  braceMesh.castShadow = true;
                  rowMountGroup.add(braceMesh);
                  memberMeshMapRef.current[braceId] = braceMesh;
                }
              }

              // E. ENGINEERING JOINT NODES (Shown when viewMode === 'engineering')
              if (viewMode === "engineering") {
                const nodeSphGeom = new THREE.SphereGeometry(0.045, 10, 10);
                const nodeMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });

                // Joint 1: Front Post Top
                const n1 = new THREE.Mesh(nodeSphGeom, nodeMat);
                n1.position.copy(nodeFrontInMount);
                rowMountGroup.add(n1);

                // Joint 2: Rear Post Top
                const n2 = new THREE.Mesh(nodeSphGeom, nodeMat);
                n2.position.copy(nodeRearInMount);
                rowMountGroup.add(n2);

                // Joint 3: Front Base Anchor
                const n3 = new THREE.Mesh(nodeSphGeom, new THREE.MeshBasicMaterial({ color: 0x10b981 }));
                n3.position.set(nodeFrontInMount.x, roofFrontY - frameCenterY, nodeFrontInMount.z);
                rowMountGroup.add(n3);

                // Joint 4: Rear Base Anchor
                const n4 = new THREE.Mesh(nodeSphGeom, new THREE.MeshBasicMaterial({ color: 0x10b981 }));
                n4.position.set(nodeRearInMount.x, roofRearY - frameCenterY, nodeRearInMount.z);
                rowMountGroup.add(n4);
              }
            });

            rootGroup.add(rowMountGroup);
          });
        });
      }
    }

    // ── 2.5 Walkways & Maintenance Corridors (CEA 750mm Standard) ─────────────
    if (walkways && walkways.length > 0) {
      walkways.forEach((w) => {
        const wWidth = Number(w.width || 0.75); // 750mm CEA standard
        const wLength = Number(w.length || 4.0);
        const wx = Number(w.x || 0);
        const wy = Number(w.y || 0);
        const wRoofY = calculateRoofElevationAtPoint(wx, wy, fullRoof);
        const wRot = toRad(Number(w.rotation || 0));

        const walkGroup = new THREE.Group();
        walkGroup.position.set(wx, wRoofY + 0.02, -wy);
        walkGroup.rotation.y = wRot;

        // Perforated safety grating walkway
        const gratingGeom = new THREE.BoxGeometry(wWidth, 0.03, wLength);
        const gratingMat = new THREE.MeshStandardMaterial({
          color: 0xd97706, // Industrial amber safety walkway
          roughness: 0.45,
          metalness: 0.65,
        });
        const gratingMesh = new THREE.Mesh(gratingGeom, gratingMat);
        gratingMesh.castShadow = true;
        gratingMesh.receiveShadow = true;
        walkGroup.add(gratingMesh);

        // Yellow high-visibility anti-slip borders
        const borderGeom = new THREE.BoxGeometry(0.025, 0.045, wLength);
        const borderMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3 });
        const leftB = new THREE.Mesh(borderGeom, borderMat);
        leftB.position.set(-wWidth / 2 + 0.012, 0.02, 0);
        walkGroup.add(leftB);
        const rightB = new THREE.Mesh(borderGeom, borderMat);
        rightB.position.set(wWidth / 2 - 0.012, 0.02, 0);
        walkGroup.add(rightB);

        rootGroup.add(walkGroup);
      });
    }

    // ── 3. Obstacles ──────────────────────────────────────────────────────────
    if (showObstacles && Array.isArray(obstacles) && obstacles.length > 0) {
      obstacles.forEach((obs) => {
        const ox = Number(obs.x || 0);
        const oz = -Number(obs.y || 0);
        const ol = Number(obs.length || 1.8);
        const ow = Number(obs.width || 1.8);
        const oh = Number(obs.height || 1.6);
        const type = obs.type || "water_tank";
        const roofElevation = calculateRoofElevationAtPoint(ox, Number(obs.y || 0), fullRoof);
        if (type === "water_tank") {
          const tankRadius = Math.min(ol, ow) / 2;
          const tankMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(tankRadius, tankRadius, oh, 24),
            new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.35, metalness: 0.25 })
          );
          tankMesh.position.set(ox, roofElevation + oh / 2, oz);
          tankMesh.castShadow = true;
          rootGroup.add(tankMesh);
          const lidMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(tankRadius * 0.45, tankRadius * 0.5, 0.12, 24),
            new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.4 })
          );
          lidMesh.position.set(ox, roofElevation + oh + 0.06, oz);
          rootGroup.add(lidMesh);
        } else if (type === "staircase") {
          const stairMesh = new THREE.Mesh(new THREE.BoxGeometry(ol, oh, ow), new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.8 }));
          stairMesh.position.set(ox, roofElevation + oh / 2, oz);
          stairMesh.castShadow = true;
          rootGroup.add(stairMesh);
        } else if (type === "ac_unit") {
          const acMesh = new THREE.Mesh(new THREE.BoxGeometry(ol, oh, ow), new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.4, metalness: 0.5 }));
          acMesh.position.set(ox, roofElevation + oh / 2, oz);
          acMesh.castShadow = true;
          rootGroup.add(acMesh);
        } else {
          const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(ol, oh, ow), new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.7 }));
          boxMesh.position.set(ox, roofElevation + oh / 2, oz);
          boxMesh.castShadow = true;
          rootGroup.add(boxMesh);
        }
      });
    }

    // ── 4. Compass Indicator ──────────────────────────────────────────────────
    const compassGroup = new THREE.Group();
    if (hasValidRoofPolygon) {
      const compassDist = Math.max(12, Math.max(bounds.width || 12, bounds.length || 10) * 0.75);
      compassGroup.position.set(cx - compassDist, 0.05, -cy - compassDist);
    } else {
      compassGroup.position.set(-12, 0.05, -10);
    }
    const northArrow = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 16), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
    northArrow.rotation.x = -Math.PI / 2; northArrow.position.z = -0.9;
    compassGroup.add(northArrow);
    const southArrow = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.0, 16), new THREE.MeshBasicMaterial({ color: 0x3b82f6 }));
    southArrow.rotation.x = Math.PI / 2; southArrow.position.z = 0.7;
    compassGroup.add(southArrow);
    const ringMesh = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.65, 32), new THREE.MeshBasicMaterial({ color: 0x94a3b8, side: THREE.DoubleSide }));
    ringMesh.rotation.x = Math.PI / 2;
    compassGroup.add(ringMesh);
    rootGroup.add(compassGroup);

    scene.add(rootGroup);
  }, [
    roofPolygon, roof, roofSections, selectedSectionId, panels, activePanels, obstacles, walkways, structure,
    showPanels, showStructures, showPosts, showRoof, showBuilding, showObstacles,
    selectedMemberId, selectedGroupId, viewMode, deletedMemberIds, renderNonce,
    activeSelectedPanelId, activeSelectedRowIndex, activeSelectionMode,
  ]);

  // ─── Build / Update Interactive Structure Nodes & Members ─────────────────────
  useEffect(() => {
    const iGroup = interactiveGroupRef.current;
    if (!iGroup) return;

    // Clear previous interactive meshes
    while (iGroup.children.length > 0) iGroup.remove(iGroup.children[0]);
    nodeMeshMapRef.current = {};
    // Clean up previous manual member refs, but preserve auto-generated members
    Object.keys(memberMeshMapRef.current).forEach((k) => {
      if (k.startsWith("member-") || k.startsWith("manual-")) {
        delete memberMeshMapRef.current[k];
      }
    });

    const nodeMat_default = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3, metalness: 0.7, emissive: 0x7c4400, emissiveIntensity: 0.1 });
    const nodeMat_selected = new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.2, metalness: 0.8, emissive: 0x1d4ed8, emissiveIntensity: 0.4 });
    const nodeMat_anchor = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.9 });
    const memberMat_post = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.35, metalness: 0.85 });
    const memberMat_brace = new THREE.MeshStandardMaterial({ color: 0x7c3aed, roughness: 0.4, metalness: 0.7, emissive: 0x4c1d95, emissiveIntensity: 0.15 });
    const memberMat_member = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.3, metalness: 0.75 });
    const memberMat_selected = new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.2, metalness: 0.8, emissive: 0x1d4ed8, emissiveIntensity: 0.5 });

    const nodeMap = {};
    structureNodes.forEach((n) => nodeMap[n.id] = n);

    // Render members first (so nodes render on top)
    structureMembers.forEach((m) => {
      const nodeA = nodeMap[m.nodeAId];
      const nodeB = nodeMap[m.nodeBId];
      if (!nodeA || !nodeB) return;

      const ax = nodeA.x, ay = nodeA.z ?? 3.0, az = -(nodeA.y ?? 0);
      const bx = nodeB.x, by = nodeB.z ?? 3.0, bz = -(nodeB.y ?? 0);

      const midX = (ax + bx) / 2, midY = (ay + by) / 2, midZ = (az + bz) / 2;
      const dx = bx - ax, dy = by - ay, dz = bz - az;
      const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (length < 0.001) return;

      const isSelected = m.id === selectedMemberId;
      let mat = memberMat_member;
      if (m.type === "post") mat = memberMat_post;
      else if (m.type === "brace") mat = memberMat_brace;
      if (isSelected) mat = memberMat_selected;

      const radius = m.type === "brace" ? 0.02 : (m.type === "post" ? 0.03 : 0.025);
      const memberGeom = new THREE.CylinderGeometry(radius, radius, length, 10);
      const memberMesh = new THREE.Mesh(memberGeom, mat);
      memberMesh.position.set(midX, midY, midZ);

      // Orient cylinder along (dx, dy, dz)
      const direction = new THREE.Vector3(dx, dy, dz).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      if (Math.abs(direction.dot(up)) < 0.999) {
        const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction);
        memberMesh.quaternion.copy(quaternion);
      }
      memberMesh.userData = { memberId: m.id };
      memberMesh.castShadow = true;
      iGroup.add(memberMesh);
      memberMeshMapRef.current[m.id] = memberMesh;

      // Base plate for posts
      if (m.type === "post") {
        const baseGeom = new THREE.BoxGeometry(0.2, 0.025, 0.2);
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.9 });
        const baseMesh = new THREE.Mesh(baseGeom, baseMat);
        baseMesh.position.set(ax, ay, az);
        baseMesh.castShadow = true;
        iGroup.add(baseMesh);
      }
    });

    // Render nodes (spheres)
    structureNodes.forEach((n) => {
      const nx = n.x ?? 0;
      const ny = n.z ?? 3.0; // THREE Y = design Z (elevation)
      const nz = -(n.y ?? 0);
      const isSelected = n.id === selectedNodeId;
      const isAnchor = n.type === "anchor";
      const mat = isSelected ? nodeMat_selected : (isAnchor ? nodeMat_anchor : nodeMat_default);
      const radius = isAnchor ? 0.08 : (isSelected ? 0.12 : 0.09);
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 12), mat);
      sphere.position.set(nx, ny, nz);
      sphere.userData = { nodeId: n.id };
      sphere.castShadow = true;
      iGroup.add(sphere);
      nodeMeshMapRef.current[n.id] = sphere;
    });

    // Pending first point indicator
    if (pendingPoint) {
      const pendingMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.8 });
      const pendingSphere = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), pendingMat);
      pendingSphere.position.set(pendingPoint.x, pendingPoint.z ?? 3.0, -(pendingPoint.y ?? 0));
      iGroup.add(pendingSphere);
    }
  }, [structureNodes, structureMembers, selectedNodeId, selectedMemberId, pendingPoint]);

  // ─── Contextual Panel for Selected Node ───────────────────────────────────────
  const selectedNode = structureNodes.find((n) => n.id === selectedNodeId);
  const selectedMember = structureMembers.find((m) => m.id === selectedMemberId)
    || (selectedMemberId && memberMeshMapRef.current[selectedMemberId]?.userData)
    || null;

  const handleDeleteNode = useCallback(() => {
    if (!selectedNodeId) return;
    const updatedNodes = nodesRef.current.filter((n) => n.id !== selectedNodeId);
    const updatedMembers = membersRef.current.filter((m) => m.nodeAId !== selectedNodeId && m.nodeBId !== selectedNodeId);
    nodesRef.current = updatedNodes;
    membersRef.current = updatedMembers;
    onStructureNodesChange?.(updatedNodes);
    onStructureMembersChange?.(updatedMembers);
    setSelectedNodeId(null);
  }, [selectedNodeId, onStructureNodesChange, onStructureMembersChange]);

  const handleDeleteMember = useCallback(() => {
    if (!selectedMemberId) return;
    if (membersRef.current.some((m) => m.id === selectedMemberId)) {
      const updatedMembers = membersRef.current.filter((m) => m.id !== selectedMemberId);
      membersRef.current = updatedMembers;
      onStructureMembersChange?.(updatedMembers);
    }
    setDeletedMemberIds((prev) => new Set([...prev, selectedMemberId]));
    setSelectedMemberId(null);
    setSelectedGroupId(null);
  }, [selectedMemberId, onStructureMembersChange]);

  // Keyboard navigation & deletion shortcuts (Esc = deselect, Del/Backspace = remove selected)
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setSelectedMemberId(null);
        setSelectedNodeId(null);
        setSelectedGroupId(null);
        setPendingPoint(null);
        pendingPointRef.current = null;
        setStructureTool("none");
      } else if ((e.key === "Delete" || e.key === "Backspace") && !e.target.matches("input, select, textarea")) {
        if (selectedMemberId) {
          handleDeleteMember();
        } else if (selectedNodeId) {
          handleDeleteNode();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedMemberId, selectedNodeId, handleDeleteMember, handleDeleteNode]);

  const handleDuplicateMember = () => {
    if (!selectedMember) return;
    const nodeA = structureNodes.find((n) => n.id === selectedMember.nodeAId);
    const nodeB = structureNodes.find((n) => n.id === selectedMember.nodeBId);
    if (!nodeA || !nodeB) return;
    const offset = 0.6;
    const newA = { ...nodeA, id: `node-${Date.now()}-da`, x: nodeA.x + offset };
    const newB = { ...nodeB, id: `node-${Date.now()}-db`, x: nodeB.x + offset };
    const newMember = { ...selectedMember, id: `member-${Date.now()}-dup`, nodeAId: newA.id, nodeBId: newB.id };
    const updatedNodes = [...nodesRef.current, newA, newB];
    const updatedMembers = [...membersRef.current, newMember];
    nodesRef.current = updatedNodes;
    membersRef.current = updatedMembers;
    onStructureNodesChange?.(updatedNodes);
    onStructureMembersChange?.(updatedMembers);
    setSelectedMemberId(newMember.id);
  };

  const handleClearAllManual = () => {
    if (!window.confirm("Clear all manually added structural members and supports?")) return;
    nodesRef.current = [];
    membersRef.current = [];
    onStructureNodesChange?.([]);
    onStructureMembersChange?.([]);
    setSelectedNodeId(null);
    setSelectedMemberId(null);
    setSelectedGroupId(null);
  };

  // ─── Toolbar button style helper ───────────────────────────────────────────────
  const tbBtn = (active, extraClass = "") =>
    `flex items-center gap-1 px-2 h-7 text-[11px] font-bold rounded-lg transition-all cursor-pointer select-none border ${
      active
        ? "bg-blue-600 text-white border-blue-500 shadow-sm"
        : "bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700 hover:text-white"
    } ${extraClass}`;

  const toolBtn = (tool) =>
    `flex items-center gap-1.5 px-3 h-7 text-[11px] font-bold rounded-lg transition-all cursor-pointer select-none border ${
      structureTool === tool
        ? "bg-amber-500 text-white border-amber-400 shadow-sm"
        : "bg-slate-800 text-slate-200 border-slate-700 hover:bg-amber-600 hover:text-white"
    }`;

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full min-h-[580px] rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl select-none flex flex-col ${
        isFullscreen ? "fixed inset-0 z-50 rounded-none h-screen" : ""
      }`}
    >
      {/* 3D Canvas */}
      <div
        ref={mountRef}
        className="w-full h-full flex-1 cursor-grab active:cursor-grabbing block"
        onClick={handleCanvasClick}
      />

      {/* Empty State Guidance Card */}
      {!hasRoof && (
        <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center text-white z-10 pointer-events-auto">
          <div className="bg-slate-900/90 border border-slate-700/80 rounded-2xl p-6 shadow-2xl max-w-md w-full text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-900/60 border border-blue-700 flex items-center justify-center text-blue-400 mx-auto shadow-lg">
              <Box className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold tracking-tight text-white">3D Simulation Awaiting Roof Geometry</h3>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                Trace your rooftop perimeter on the <b>2D Satellite Map</b>, or generate a standard 3D solar rooftop instantly:
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={onSwitchTo2D}
                className="w-full sm:w-auto px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                ← Trace on 2D Map
              </button>
              {onApplyTemplateRoof && (
                <button
                  type="button"
                  onClick={onApplyTemplateRoof}
                  className="w-full sm:w-auto px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Use 12m × 8m Roof
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TOP TOOLBAR ─────────────────────────────────────────────────────── */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none gap-2 z-10">

        {/* LEFT: Camera Presets */}
        <div className="flex items-center gap-1 bg-slate-900/98 backdrop-blur-md p-1 rounded-xl border border-slate-700 shadow-lg pointer-events-auto flex-wrap">
          <button onClick={() => setCameraPreset("isometric")} className={tbBtn(activePreset === "isometric")}>
            <Box className="w-3 h-3" /> 3D
          </button>
          <button onClick={() => setCameraPreset("top")} className={tbBtn(activePreset === "top")}>Top</button>
          <button onClick={() => setCameraPreset("front")} className={tbBtn(activePreset === "front")}>Front</button>
          <button onClick={() => setCameraPreset("side")} className={tbBtn(activePreset === "side")}>Side</button>
          <button onClick={fitDesignCamera} className={tbBtn(false, "text-blue-300 hover:text-white border-blue-700/50")}>
            <Focus className="w-3 h-3" /> Fit
          </button>
          <button onClick={() => setCameraPreset("reset")} className="flex items-center gap-1 h-7 w-7 justify-center text-slate-400 hover:text-white bg-slate-800 border border-slate-700 rounded-lg transition-all cursor-pointer">
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>

        {/* RIGHT: View Mode + Layer Toggles + Fullscreen */}
        <div className="flex items-center gap-1.5 bg-slate-900/98 backdrop-blur-md p-1 rounded-xl border border-slate-700 shadow-lg pointer-events-auto">
          {/* Visual / Engineering Mode Toggle */}
          <div className="flex items-center gap-0.5 bg-slate-800/80 p-0.5 rounded-lg border border-slate-700/80 mr-1">
            <button
              onClick={() => setViewMode("visual")}
              className={`px-2.5 py-1 text-[10.5px] font-bold rounded-md transition-all cursor-pointer ${
                viewMode === "visual"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Visual
            </button>
            <button
              onClick={() => setViewMode("engineering")}
              className={`px-2.5 py-1 text-[10.5px] font-bold rounded-md transition-all cursor-pointer ${
                viewMode === "engineering"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Engineering
            </button>
          </div>

          <button onClick={() => setShowRoof(!showRoof)} className={tbBtn(showRoof)}>Roof</button>
          <button onClick={() => setShowStructures(!showStructures)} className={tbBtn(showStructures)}>Structure</button>
          <button onClick={() => setShowPanels(!showPanels)} className={tbBtn(showPanels)}>Panels ({activePanels.length})</button>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="h-7 w-7 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 transition-all cursor-pointer"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* ── STRUCTURE EDITOR TOOLBAR ─────────────────────────────────────────── */}
      <div className="absolute top-14 left-3 flex flex-col gap-1.5 pointer-events-auto z-10">
        <div className="bg-slate-900/98 backdrop-blur-md p-1.5 rounded-xl border border-slate-700 shadow-lg space-y-1">
          <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider px-1 pb-0.5">Structure Editor</div>

          {/* Add Support */}
          <button
            onClick={() => setStructureTool(structureTool === "add_support" ? "none" : "add_support")}
            className={toolBtn("add_support")}
            title="Click a point on the roof to add a vertical support post"
          >
            <Plus className="w-3 h-3" /> + Support
          </button>

          {/* Add Member */}
          <button
            onClick={() => { setStructureTool(structureTool === "add_member" ? "none" : "add_member"); setPendingPoint(null); pendingPointRef.current = null; }}
            className={toolBtn("add_member")}
            title="Click point A, then point B to create a structural member"
          >
            <Plus className="w-3 h-3" /> + Member
          </button>

          {/* Add Brace */}
          <button
            onClick={() => { setStructureTool(structureTool === "add_brace" ? "none" : "add_brace"); setPendingPoint(null); pendingPointRef.current = null; }}
            className={toolBtn("add_brace")}
            title="Click point A, then point B to create a diagonal brace"
          >
            <Triangle className="w-3 h-3" /> + Brace
          </button>

          {/* Snap Toggle */}
          <button
            onClick={() => setSnapEnabled(!snapEnabled)}
            className={`flex items-center gap-1.5 px-3 h-6 text-[10px] font-semibold rounded-lg transition-all cursor-pointer border ${
              snapEnabled ? "bg-emerald-700/60 text-emerald-200 border-emerald-600" : "bg-slate-800 text-slate-400 border-slate-700"
            }`}
            title="Toggle snap to grid/nodes/roof"
          >
            <Magnet className="w-3 h-3" /> Snap {snapEnabled ? "ON" : "OFF"}
          </button>

          {/* Clear all manual */}
          {(structureNodes.length > 0 || structureMembers.length > 0) && (
            <button
              onClick={handleClearAllManual}
              className="flex items-center gap-1.5 px-3 h-6 text-[10px] font-semibold rounded-lg bg-red-900/50 text-red-300 border border-red-800 hover:bg-red-800/60 transition-all cursor-pointer"
            >
              <Trash2 className="w-3 h-3" /> Clear All
            </button>
          )}
        </div>

        {/* Tool instruction */}
        {structureTool !== "none" && (
          <div className="bg-amber-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-amber-700 shadow-lg text-[11px] text-amber-200 font-semibold max-w-[160px]">
            {structureTool === "add_support" && "Click on the roof to place a support post"}
            {structureTool === "add_member" && !pendingPoint && "Click point A (first end)"}
            {structureTool === "add_member" && pendingPoint && "Click point B (second end)"}
            {structureTool === "add_brace" && !pendingPoint && "Click point A (first end)"}
            {structureTool === "add_brace" && pendingPoint && "Click point B (second end)"}
            <div className="text-[10px] text-amber-400 mt-0.5 font-normal">Press Esc or click button to cancel</div>
          </div>
        )}
      </div>

      {/* ── SELECTED ELEMENT CONTEXTUAL PANEL ───────────────────────────────── */}
      {(selectedNode || selectedMember) && (
        <div className="absolute top-14 right-3 bg-slate-900/98 backdrop-blur-md p-3 rounded-xl border border-blue-700/60 shadow-xl z-10 pointer-events-auto min-w-[200px] animate-in fade-in">
          {selectedNode && (
            <>
              <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-2">
                {selectedNode.type === "anchor" ? "⚓ Anchor Node" : selectedNode.type === "post_top" ? "🔝 Post Top" : "◉ Junction Node"}
              </div>
              <div className="space-y-1 text-[11px] text-slate-300 mb-2">
                <div className="flex justify-between"><span className="text-slate-500">X</span><span className="font-bold">{Number(selectedNode.x ?? 0).toFixed(2)} m</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Y</span><span className="font-bold">{Number(selectedNode.y ?? 0).toFixed(2)} m</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Elevation</span><span className="font-bold">{Number(selectedNode.z ?? 0).toFixed(2)} m</span></div>
              </div>
              <div className="flex gap-1">
                <button onClick={handleDeleteNode} className="flex-1 h-7 text-[11px] font-bold bg-red-900/60 text-red-300 border border-red-700 rounded-lg hover:bg-red-800/70 transition-all flex items-center justify-center gap-1 cursor-pointer">
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              </div>
            </>
          )}
          {selectedMember && (
            <>
              <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>{selectedMember.type || "Structural Member"}</span>
                {selectedGroupId && <span className="text-[9px] text-emerald-400 bg-emerald-950/80 px-1 py-0.5 rounded border border-emerald-800">Group</span>}
              </div>
              <div className="space-y-1 text-[11px] text-slate-300 mb-2.5">
                {(() => {
                  const mSec = (roofSections || []).find((s) => selectedMember.id?.includes(`sec${s.id}`));
                  return mSec ? (
                    <div className="flex justify-between"><span className="text-slate-500">Section</span><span className="font-bold text-cyan-400">{mSec.name}</span></div>
                  ) : null;
                })()}
                <div className="flex justify-between"><span className="text-slate-500">ID</span><span className="font-mono text-[10px] text-slate-300 truncate max-w-[110px]">{selectedMember.id}</span></div>
                {selectedMember.length && <div className="flex justify-between"><span className="text-slate-500">Length</span><span className="font-bold text-white">{selectedMember.length} m</span></div>}
                {selectedMember.material && <div className="flex justify-between"><span className="text-slate-500">Material</span><span className="font-bold text-amber-300">{selectedMember.material}</span></div>}
                {selectedMember.elevation && <div className="flex justify-between"><span className="text-slate-500">Roof Height</span><span className="font-bold text-slate-300">{selectedMember.elevation} m</span></div>}
                {selectedMember.groupId && <div className="flex justify-between"><span className="text-slate-500">Table</span><span className="font-bold text-slate-300 capitalize">{selectedMember.groupId}</span></div>}
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setSelectedGroupId(selectedGroupId ? null : selectedMember.groupId)}
                    className="flex-1 h-7 text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Layers className="w-3 h-3" /> {selectedGroupId ? "Single" : "Select Group"}
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteMember}
                    className="flex-1 h-7 text-[10px] font-bold bg-red-900/60 hover:bg-red-800 text-red-200 border border-red-700 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => { setSelectedMemberId(null); setSelectedGroupId(null); }}
                  className="w-full h-6 text-[10px] text-slate-400 hover:text-white bg-transparent hover:bg-slate-800/60 rounded transition text-center cursor-pointer"
                >
                  Deselect (Esc)
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── BOTTOM HUD + LEGEND ──────────────────────────────────────────────── */}
      <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between pointer-events-none z-10 gap-2">

        {/* Bottom-left: Live spec + structure legend toggle */}
        <div className="flex flex-col gap-1.5">
          {/* Structure Legend (expandable) */}
          {showLegend && (
            <div className="bg-slate-900/95 backdrop-blur-md px-3 py-2 rounded-xl border border-slate-700/80 shadow-lg text-[10px] text-slate-300 pointer-events-auto">
              <div className="font-bold text-slate-200 mb-1.5 text-[10px]">Structure Legend</div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2"><span className="w-4 h-0.5 bg-slate-400 inline-block rounded" /> Rail</div>
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-amber-500 inline-block" /> Node / Joint</div>
                <div className="flex items-center gap-2"><span className="w-4 h-0.5 bg-sky-400 inline-block rounded" /> Member</div>
                <div className="flex items-center gap-2"><span className="w-4 h-0.5 bg-purple-400 inline-block rounded" /> Brace</div>
                <div className="flex items-center gap-2"><span className="w-4 h-0.5 bg-slate-500 inline-block rounded" /> Post</div>
                <div className="flex items-center gap-2"><span className="w-3 h-1 bg-slate-800 inline-block rounded border border-slate-600" /> Base Plate</div>
              </div>
              {manualNodeCount > 0 && (
                <div className="mt-1.5 pt-1.5 border-t border-slate-700 space-y-0.5 text-[9.5px]">
                  <div className="flex justify-between"><span className="text-slate-500">Nodes</span><span className="font-bold text-amber-400">{manualNodeCount}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Members</span><span className="font-bold text-sky-400">{manualMemberCount}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Braces</span><span className="font-bold text-purple-400">{manualBraceCount}</span></div>
                </div>
              )}
            </div>
          )}
          <div className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700/80 shadow-lg pointer-events-auto flex items-center gap-3 text-xs text-slate-300">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500 shadow-sm" />
              <span>Roof: <b>{activeSec ? `${activeSec.roofType || "RCC"} (${activeSec.pitch ?? 0}°)` : hasRoof ? `${roof?.type?.toUpperCase() || "FLAT"} (${roof?.elevation_m || 3.0}m)` : "None"}</b></span>
            </div>
            <span className="text-slate-700">|</span>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm" />
              <span>Tilt: <b>{activeSec?.tilt_deg ?? structure?.tilt_deg ?? 15}°</b>{activeSec && <span className="text-[10px] text-cyan-400 font-normal ml-0.5">({activeSec.name})</span>}</span>
            </div>
            <span className="text-slate-700">|</span>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 shadow-sm" />
              <span>Az: <b>{activeSec?.azimuth ?? structure?.azimuth ?? 180}°</b></span>
            </div>
            <button
              onClick={() => setShowLegend(!showLegend)}
              className="ml-2 h-5 px-1.5 text-[10px] font-semibold bg-slate-800 border border-slate-600 rounded-md text-slate-300 hover:text-white hover:bg-slate-700 transition-all"
            >
              {showLegend ? "▲ Legend" : "▼ Legend"}
            </button>
          </div>
        </div>

        {/* Bottom-right: Simulation badge */}
        <div className="bg-slate-900/90 backdrop-blur-md px-2.5 py-1 rounded-xl border border-slate-700/80 shadow-lg text-[10px] text-slate-300 pointer-events-auto flex items-center gap-1.5">
          <Info className="w-3 h-3 text-blue-400 shrink-0" />
          <span>3D Simulation</span>
          {manualNodeCount > 0 && (
            <span className="ml-1 text-amber-400 font-bold">{manualNodeCount} Nodes</span>
          )}
        </div>
      </div>
    </div>
  );
});

export default Rooftop3DViewer;
