import React, { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import * as THREE from "three";
import {
  RotateCcw, Eye, Layers, Compass, ZoomIn, ZoomOut, Maximize2, Minimize2,
  Box, Camera, Sun, Info, Focus, Sliders, Check, Plus, Trash2, Copy,
  Move, AlertTriangle, Grid, Magnet, Triangle
} from "lucide-react";
import {
  toRad,
  calculateRoofElevationAtPoint,
  calculatePanel3DPosition,
  clusterPanelsIntoRows,
  getPolygonBounds,
} from "../utils/geoCalculations";

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

const Rooftop3DViewer = forwardRef(function Rooftop3DViewer(
  {
    roofPolygon = [],
    roof = { type: "flat", pitch_deg: 0, azimuth_deg: 180, elevation_m: 3.0, surface_material: "concrete" },
    panels = [],
    obstacles = [],
    walkways = [],
    structure = {
      type: "elevated",
      tilt_deg: 15,
      height_m: 1.8,
      azimuth: 180,
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
  const [snapEnabled, setSnapEnabled] = useState(true);
  const snapEnabledRef = useRef(true);
  const structureToolRef = useRef("none");

  // Scene-level refs for interactive meshes
  const nodeMeshMapRef = useRef({}); // nodeId → THREE.Mesh
  const memberMeshMapRef = useRef({}); // memberId → THREE.Mesh (+ line)

  // Visibility toggles
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

  const hasRoof = roofPolygon && roofPolygon.length >= 3;
  const activePanels = (panels || []).filter((p) => !p.hidden);

  // Keep refs in sync with state
  useEffect(() => { structureToolRef.current = structureTool; }, [structureTool]);
  useEffect(() => { snapEnabledRef.current = snapEnabled; }, [snapEnabled]);
  useEffect(() => { pendingPointRef.current = pendingPoint; }, [pendingPoint]);

  // ─── Derived structure counts for legend ────────────────────────────────────
  const manualNodeCount = structureNodes.length;
  const manualMemberCount = structureMembers.filter((m) => m.type === "member" || m.type === "beam").length;
  const manualBraceCount = structureMembers.filter((m) => m.type === "brace").length;
  const manualSupportCount = structureNodes.filter((n) => n.type === "post_top" || n.type === "anchor").length;

  // Expose snapshot export and fit-camera functions to parent
  useImperativeHandle(ref, () => ({
    getSnapshotDataUrl: () => {
      if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return null;
      rendererRef.current.render(sceneRef.current, cameraRef.current);
      return rendererRef.current.domElement.toDataURL("image/png");
    },
    fitDesign: () => fitDesignCamera(),
  }));

  // ─── Camera Utilities ────────────────────────────────────────────────────────
  const updateCameraPosition = useCallback(() => {
    if (!cameraRef.current) return;
    const { radius, phi, theta } = controlsRef.current.spherical;
    const target = controlsRef.current.target;
    const x = target.x + radius * Math.sin(phi) * Math.sin(theta);
    const y = target.y + radius * Math.cos(phi);
    const z = target.z + radius * Math.sin(phi) * Math.cos(theta);
    cameraRef.current.position.set(x, y, z);
    cameraRef.current.lookAt(target);
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
    const distance = (maxDim / 2) / Math.tan(fov / 2) * 1.6;
    controlsRef.current.target.copy(center);
    controlsRef.current.spherical.radius = Math.max(10, Math.min(160, distance));
    controlsRef.current.spherical.phi = Math.PI / 3.2;
    controlsRef.current.spherical.theta = Math.PI / 4;
    setActivePreset("isometric");
    updateCameraPosition();
  }, [updateCameraPosition]);

  const setCameraPreset = useCallback((preset) => {
    setActivePreset(preset);
    const ctr = controlsRef.current;
    if (preset === "top") { ctr.spherical.phi = 0.05; ctr.spherical.theta = 0; }
    else if (preset === "front") { ctr.spherical.phi = Math.PI / 2.15; ctr.spherical.theta = 0; }
    else if (preset === "side") { ctr.spherical.phi = Math.PI / 2.15; ctr.spherical.theta = Math.PI / 2; }
    else if (preset === "isometric") { ctr.spherical.phi = Math.PI / 3.2; ctr.spherical.theta = Math.PI / 4; }
    else if (preset === "fit") { fitDesignCamera(); return; }
    else if (preset === "reset") { ctr.spherical.radius = 32; ctr.spherical.phi = Math.PI / 3.2; ctr.spherical.theta = Math.PI / 4; ctr.target.set(0, 3, 0); }
    updateCameraPosition();
  }, [updateCameraPosition, fitDesignCamera]);

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

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
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
    const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -0.02;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);
    const gridHelper = new THREE.GridHelper(120, 60, 0x3b82f6, 0x1e293b);
    gridHelper.position.y = 0.01;
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
      const zoomFactor = e.deltaY > 0 ? 1.08 : 0.92;
      controlsRef.current.spherical.radius = Math.max(4, Math.min(180, controlsRef.current.spherical.radius * zoomFactor));
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
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    let animId;
    const animate = () => { animId = requestAnimationFrame(animate); renderer.render(scene, camera); };
    animate();

    return () => {
      cancelAnimationFrame(animId);
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
          if (memberId) { setSelectedMemberId(memberId); setSelectedNodeId(null); }
        } else {
          setSelectedNodeId(null); setSelectedMemberId(null);
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
  }, [roof, structure, snapToNearest, onStructureNodesChange, onStructureMembersChange]);

  // ─── Build / Update Main 3D Scene ─────────────────────────────────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (rootGroupRef.current) scene.remove(rootGroupRef.current);

    const rootGroup = new THREE.Group();
    rootGroup.name = "dynamic_rooftop_group";
    rootGroupRef.current = rootGroup;

    const roofType = roof?.type || "flat";
    const roofPitchDeg = Number(roof?.pitch_deg || 0);
    const roofAzimuthDeg = Number(roof?.azimuth_deg || 180);
    const buildingElevationM = Number(roof?.elevation_m || 3.0);
    const roofPitchRad = toRad(roofPitchDeg);

    // ── 1. Building Walls + Roof Slab ──────────────────────────────────────────
    if (roofPolygon && roofPolygon.length >= 3) {
      const shape = new THREE.Shape();
      roofPolygon.forEach((pt, idx) => {
        if (idx === 0) shape.moveTo(pt.x, -pt.y);
        else shape.lineTo(pt.x, -pt.y);
      });
      shape.closePath();

      if (showBuilding && buildingElevationM > 0) {
        const wallGeom = new THREE.ExtrudeGeometry(shape, { steps: 1, depth: buildingElevationM, bevelEnabled: false });
        wallGeom.rotateX(Math.PI / 2);
        const wallMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.9, metalness: 0.05 });
        const wallMesh = new THREE.Mesh(wallGeom, wallMat);
        wallMesh.position.y = 0;
        wallMesh.castShadow = true; wallMesh.receiveShadow = true;
        rootGroup.add(wallMesh);
      }

      if (showRoof) {
        const roofExtrudeSettings = { steps: 1, depth: 0.35, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 };
        const roofGeom = new THREE.ExtrudeGeometry(shape, roofExtrudeSettings);
        roofGeom.rotateX(Math.PI / 2);
        const roofMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.8, metalness: 0.1 });
        const roofMesh = new THREE.Mesh(roofGeom, roofMat);
        roofMesh.position.y = buildingElevationM;
        roofMesh.receiveShadow = true; roofMesh.castShadow = true;
        if (roofPitchDeg > 0 && roofType === "single_slope") roofMesh.rotation.x = -roofPitchRad;
        rootGroup.add(roofMesh);
        const edgeGeom = new THREE.EdgesGeometry(roofGeom);
        const edgeMat = new THREE.LineBasicMaterial({ color: 0x64748b, linewidth: 1.5 });
        roofMesh.add(new THREE.LineSegments(edgeGeom, edgeMat));
      }
    }

    // ── 2. Solar PV Modules + Row-Based Mounting Structure ────────────────────
    if (activePanels.length > 0) {
      const structType = (structure?.type || "elevated").toLowerCase();
      const isFlush = structType === "flush";
      const isElevated = structType === "elevated";
      const isFixedTilt = structType === "fixed_tilt";
      const isBallasted = structType === "ballasted";
      const baseClearance = isFlush ? 0.12 : Number(structure?.height_m || 1.8);
      const panelTiltDeg = isFlush ? roofPitchDeg : Number(structure?.tilt_deg || 15);
      const structAzimuth = Number(structure?.azimuth ?? 180);

      // Materials
      const panelGeom = new THREE.BoxGeometry(1, 0.038, 1);
      const siliconCellMat = new THREE.MeshStandardMaterial({ color: 0x071b3b, roughness: 0.16, metalness: 0.75 });
      const frameMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.35, metalness: 0.85 });
      const moduleMaterials = [frameMat, frameMat, siliconCellMat, frameMat, frameMat, frameMat];

      const railMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.3, metalness: 0.85 });
      const rafterMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.4, metalness: 0.8 });
      const postMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.35, metalness: 0.85 });
      const basePlateMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.9 });
      const boltMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.2, metalness: 0.95 });
      const braceMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.85 });
      const ballastMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.95, metalness: 0.05 });
      const flushRailMat = new THREE.MeshStandardMaterial({ color: 0xb0b8c8, roughness: 0.25, metalness: 0.9 });

      // A. Render PV Panels
      if (showPanels) {
        activePanels.forEach((p) => {
          const pw = Number(p.width || 1.134);
          const pl = Number(p.height || 2.278);
          const panelAzimuth = Number(p.azimuth ?? structAzimuth);
          const transform = calculatePanel3DPosition({
            panel: { ...p, azimuth: panelAzimuth },
            roof: { type: roofType, pitch_deg: roofPitchDeg, azimuth_deg: roofAzimuthDeg, elevation_m: buildingElevationM },
            structure: { type: structType, tilt_deg: panelTiltDeg, height_m: baseClearance, azimuth: panelAzimuth },
          });
          const panelGroup = new THREE.Group();
          panelGroup.position.set(transform.x, transform.y, transform.z);
          panelGroup.rotation.y = transform.yawRad;
          const panelMesh = new THREE.Mesh(panelGeom, moduleMaterials);
          panelMesh.scale.set(pw, 1, pl);
          panelMesh.rotation.x = -transform.tiltRad;
          panelMesh.castShadow = true; panelMesh.receiveShadow = true;
          panelGroup.add(panelMesh);
          rootGroup.add(panelGroup);
        });
      }

      // B. Render Row-Based Structural Mounting Framework
      if (showStructures) {
        const rows = clusterPanelsIntoRows(activePanels, structAzimuth);

        rows.forEach((row) => {
          const tiltRad = toRad(panelTiltDeg);
          const azYawRad = toRad(structAzimuth - 180);
          const rowRoofY = calculateRoofElevationAtPoint(row.centerX, row.centerY, {
            type: roofType, pitch_deg: roofPitchDeg, azimuth_deg: roofAzimuthDeg, elevation_m: buildingElevationM,
          });
          const frameCenterY = rowRoofY + baseClearance + (row.pl / 2) * Math.sin(tiltRad);

          const rowMountGroup = new THREE.Group();
          rowMountGroup.position.set(row.centerX, frameCenterY, -row.centerY);
          rowMountGroup.rotation.y = azYawRad;

          // ── FLUSH MOUNT: short mini-clamp rails, no posts ──────────────────
          if (isFlush) {
            const miniRailGeom = new THREE.BoxGeometry(row.totalRowLength + 0.1, 0.032, 0.04);
            [-row.pl * 0.3, row.pl * 0.3].forEach((zOff) => {
              const r = new THREE.Mesh(miniRailGeom, flushRailMat);
              r.position.set(0, -0.02, zOff);
              r.castShadow = true;
              rowMountGroup.add(r);
            });
          } else {
            // ── STANDARD RAILS ──────────────────────────────────────────────
            const railLength = row.totalRowLength + 0.12;
            const railGeom = new THREE.BoxGeometry(railLength, 0.045, 0.055);
            const topRail = new THREE.Mesh(railGeom, railMat);
            topRail.position.set(0, -0.038, -row.pl * 0.28 * Math.cos(tiltRad));
            topRail.rotation.x = -tiltRad;
            topRail.castShadow = true;
            rowMountGroup.add(topRail);
            const bottomRail = new THREE.Mesh(railGeom, railMat);
            bottomRail.position.set(0, -0.038, +row.pl * 0.28 * Math.cos(tiltRad));
            bottomRail.rotation.x = -tiltRad;
            bottomRail.castShadow = true;
            rowMountGroup.add(bottomRail);

            // ── BALLASTED MOUNT: add concrete ballast blocks ────────────────
            if (isBallasted && showPosts) {
              const ballastBlockGeom = new THREE.BoxGeometry(0.40, 0.22, 0.32);
              row.rafterUOffsets.forEach((uOffset) => {
                const uRel = uOffset - row.centerU;
                [+row.pl * 0.28 * Math.cos(tiltRad), -row.pl * 0.28 * Math.cos(tiltRad)].forEach((zOff) => {
                  const ballast = new THREE.Mesh(ballastBlockGeom, ballastMat);
                  ballast.position.set(uRel, -(baseClearance - 0.11), zOff);
                  ballast.castShadow = true; ballast.receiveShadow = true;
                  rowMountGroup.add(ballast);
                });
              });
            }

            // ── POSTS + BASE PLATES (Elevated, Fixed Tilt) ──────────────────
            if (showPosts && !isFlush && !isBallasted) {
              const frontZ = +row.pl * 0.28 * Math.cos(tiltRad);
              const rearZ = -row.pl * 0.28 * Math.cos(tiltRad);
              const frontYOffset = -(row.pl * 0.28) * Math.sin(tiltRad) - 0.065;
              const rearYOffset = +(row.pl * 0.28) * Math.sin(tiltRad) - 0.065;
              const frontLegHeight = Math.max(0.1, frameCenterY + frontYOffset - rowRoofY);
              const rearLegHeight = Math.max(0.1, frameCenterY + rearYOffset - rowRoofY);
              const rafterLength = row.pl * 0.85;
              const rafterGeom = new THREE.BoxGeometry(0.06, 0.08, rafterLength);
              const postGeomFront = new THREE.CylinderGeometry(0.028, 0.028, frontLegHeight, 12);
              const postGeomRear = isFixedTilt
                ? new THREE.CylinderGeometry(0.028, 0.028, rearLegHeight * 0.6, 12)
                : new THREE.CylinderGeometry(0.028, 0.028, rearLegHeight, 12);
              const basePlateGeom = new THREE.BoxGeometry(0.18, 0.02, 0.18);
              const boltGeom = new THREE.CylinderGeometry(0.008, 0.008, 0.03, 8);

              row.rafterUOffsets.forEach((uOffset, idx) => {
                const uRel = uOffset - row.centerU;
                const isEndFrame = idx === 0 || idx === row.rafterUOffsets.length - 1;

                // Rafter beam
                const rafterMesh = new THREE.Mesh(rafterGeom, rafterMat);
                rafterMesh.position.set(uRel, -0.065, 0);
                rafterMesh.rotation.x = -tiltRad;
                rafterMesh.castShadow = true;
                rowMountGroup.add(rafterMesh);

                // Front post + base
                const frontPost = new THREE.Mesh(postGeomFront, postMat);
                frontPost.position.set(uRel, frontYOffset - frontLegHeight / 2, frontZ);
                frontPost.castShadow = true;
                rowMountGroup.add(frontPost);
                const frontBase = new THREE.Mesh(basePlateGeom, basePlateMat);
                frontBase.position.set(uRel, frontYOffset - frontLegHeight + 0.01, frontZ);
                frontBase.castShadow = true;
                rowMountGroup.add(frontBase);
                [[-0.06, -0.06], [-0.06, 0.06], [0.06, -0.06], [0.06, 0.06]].forEach(([bx, bz]) => {
                  const bolt = new THREE.Mesh(boltGeom, boltMat);
                  bolt.position.set(uRel + bx, frontYOffset - frontLegHeight + 0.025, frontZ + bz);
                  rowMountGroup.add(bolt);
                });

                // Rear post + base
                const rearPost = new THREE.Mesh(postGeomRear, postMat);
                rearPost.position.set(uRel, rearYOffset - rearLegHeight / 2, rearZ);
                rearPost.castShadow = true;
                rowMountGroup.add(rearPost);
                const rearBase = new THREE.Mesh(basePlateGeom, basePlateMat);
                rearBase.position.set(uRel, rearYOffset - rearLegHeight + 0.01, rearZ);
                rearBase.castShadow = true;
                rowMountGroup.add(rearBase);
                [[-0.06, -0.06], [-0.06, 0.06], [0.06, -0.06], [0.06, 0.06]].forEach(([bx, bz]) => {
                  const bolt = new THREE.Mesh(boltGeom, boltMat);
                  bolt.position.set(uRel + bx, rearYOffset - rearLegHeight + 0.025, rearZ + bz);
                  rowMountGroup.add(bolt);
                });

                // Cross bracing on end frames (elevated only)
                if (isElevated && baseClearance >= 1.2 && isEndFrame && structure?.cross_bracing !== false) {
                  const braceSpanZ = frontZ - rearZ;
                  const braceSpanY = rearYOffset - (frontYOffset - frontLegHeight);
                  const braceLength = Math.hypot(braceSpanZ, braceSpanY);
                  const braceGeom = new THREE.CylinderGeometry(0.018, 0.018, braceLength, 8);
                  const braceMesh = new THREE.Mesh(braceGeom, braceMat);
                  braceMesh.position.set(uRel, (frontYOffset - frontLegHeight + rearYOffset) / 2, (frontZ + rearZ) / 2);
                  braceMesh.rotation.x = Math.atan2(braceSpanZ, braceSpanY);
                  braceMesh.castShadow = true;
                  rowMountGroup.add(braceMesh);
                }
              });
            }
          }

          rootGroup.add(rowMountGroup);
        });
      }
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
        const roofElevation = calculateRoofElevationAtPoint(ox, Number(obs.y || 0), {
          type: roof?.type || "flat", pitch_deg: Number(roof?.pitch_deg || 0),
          azimuth_deg: Number(roof?.azimuth_deg || 180), elevation_m: Number(roof?.elevation_m || 3.0),
        });
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
    compassGroup.position.set(-18, 0.05, -18);
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
    roofPolygon, roof, panels, activePanels, obstacles, walkways, structure,
    showPanels, showStructures, showPosts, showRoof, showBuilding, showObstacles,
  ]);

  // ─── Build / Update Interactive Structure Nodes & Members ─────────────────────
  useEffect(() => {
    const iGroup = interactiveGroupRef.current;
    if (!iGroup) return;

    // Clear previous interactive meshes
    while (iGroup.children.length > 0) iGroup.remove(iGroup.children[0]);
    nodeMeshMapRef.current = {};
    memberMeshMapRef.current = {};

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
  const selectedMember = structureMembers.find((m) => m.id === selectedMemberId);

  const handleDeleteNode = () => {
    if (!selectedNodeId) return;
    const updatedNodes = nodesRef.current.filter((n) => n.id !== selectedNodeId);
    const updatedMembers = membersRef.current.filter((m) => m.nodeAId !== selectedNodeId && m.nodeBId !== selectedNodeId);
    nodesRef.current = updatedNodes;
    membersRef.current = updatedMembers;
    onStructureNodesChange?.(updatedNodes);
    onStructureMembersChange?.(updatedMembers);
    setSelectedNodeId(null);
  };

  const handleDeleteMember = () => {
    if (!selectedMemberId) return;
    const updatedMembers = membersRef.current.filter((m) => m.id !== selectedMemberId);
    membersRef.current = updatedMembers;
    onStructureMembersChange?.(updatedMembers);
    setSelectedMemberId(null);
  };

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

      {/* Empty State Banner */}
      {!hasRoof && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center text-white pointer-events-none z-10">
          <div className="w-12 h-12 rounded-2xl bg-blue-900/60 border border-blue-700 flex items-center justify-center text-blue-400 mb-3 shadow-lg">
            <Box className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold tracking-tight">3D Preview Awaiting Roof Geometry</h3>
          <p className="text-xs text-slate-400 max-w-sm my-1.5 leading-relaxed">
            3D rooftop simulation will appear after you draw the roof boundary in the <b>2D Satellite Plan</b> tab.
          </p>
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

        {/* RIGHT: Layer Toggles + Fullscreen */}
        <div className="flex items-center gap-1 bg-slate-900/98 backdrop-blur-md p-1 rounded-xl border border-slate-700 shadow-lg pointer-events-auto">
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
        <div className="absolute top-14 right-3 bg-slate-900/98 backdrop-blur-md p-3 rounded-xl border border-blue-700/60 shadow-xl z-10 pointer-events-auto min-w-[160px]">
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
                <button onClick={handleDeleteNode} className="flex-1 h-7 text-[11px] font-bold bg-red-900/60 text-red-300 border border-red-700 rounded-lg hover:bg-red-800/70 transition-all flex items-center justify-center gap-1">
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              </div>
            </>
          )}
          {selectedMember && (
            <>
              <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-2">
                {selectedMember.type === "post" ? "│ Support Post" : selectedMember.type === "brace" ? "╲ Diagonal Brace" : selectedMember.type === "rail" ? "━ Rail" : "━ Member"}
              </div>
              {(() => {
                const nA = structureNodes.find((n) => n.id === selectedMember.nodeAId);
                const nB = structureNodes.find((n) => n.id === selectedMember.nodeBId);
                if (!nA || !nB) return null;
                const len = Math.sqrt(
                  Math.pow(nB.x - nA.x, 2) + Math.pow((nB.z ?? 0) - (nA.z ?? 0), 2) + Math.pow(nB.y - nA.y, 2)
                );
                return (
                  <div className="space-y-1 text-[11px] text-slate-300 mb-2">
                    <div className="flex justify-between"><span className="text-slate-500">Length</span><span className="font-bold">{len.toFixed(2)} m</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Type</span><span className="font-bold capitalize">{selectedMember.type}</span></div>
                  </div>
                );
              })()}
              <div className="flex gap-1">
                <button onClick={handleDuplicateMember} className="flex-1 h-7 text-[10px] font-bold bg-slate-700 text-slate-200 border border-slate-600 rounded-lg hover:bg-slate-600 transition-all flex items-center justify-center gap-1">
                  <Copy className="w-3 h-3" /> Dup
                </button>
                <button onClick={handleDeleteMember} className="flex-1 h-7 text-[10px] font-bold bg-red-900/60 text-red-300 border border-red-700 rounded-lg hover:bg-red-800/70 transition-all flex items-center justify-center gap-1">
                  <Trash2 className="w-3 h-3" /> Del
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
              <span>Roof: <b>{hasRoof ? `${roof?.type?.toUpperCase() || "FLAT"} (${roof?.elevation_m || 3.0}m)` : "None"}</b></span>
            </div>
            <span className="text-slate-700">|</span>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm" />
              <span>Tilt: <b>{structure?.tilt_deg || 15}°</b></span>
            </div>
            <span className="text-slate-700">|</span>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 shadow-sm" />
              <span>Az: <b>{structure?.azimuth || 180}°</b></span>
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
