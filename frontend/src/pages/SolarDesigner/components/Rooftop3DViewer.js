import React, { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import * as THREE from "three";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  RotateCcw, Eye, Layers, Compass, ZoomIn, ZoomOut, Maximize2, Minimize2,
  Box, Camera, Sun, Info, Focus, Sliders, Check
} from "lucide-react";
import {
  toRad,
  calculateRoofElevationAtPoint,
  calculatePanel3DPosition,
  clusterPanelsIntoRows,
  getPolygonBounds,
} from "../utils/geoCalculations";

/**
 * Engineering-Grade 3D Rooftop WebGL Visualizer
 * 
 * Structural Hierarchy:
 * ROOF SLAB -> BASE ANCHOR FOOTING -> VERTICAL SUPPORT POSTS -> INCLINED RAFTERS -> DUAL CONTINUOUS RAILS -> PV MODULES
 * 
 * Features:
 * - Extruded 3D Roof Slab matching drawn 2D polygon boundary
 * - Building elevation / ground-to-roof structure walls (3.0m - 30m)
 * - Roof Slope / Pitch support (Flat, Single Slope, Gable, Hip)
 * - Row-based mounting table engineering:
 *   - Continuous longitudinal aluminium rails under each panel row
 *   - Strategic rafter support lines (e.g. 2-3 post pairs per row, NOT per panel)
 *   - Distinct rectangular base anchor plates with bolts on the roof slab
 *   - Elevated super structure with diagonal sway cross-braces on outer frames
 *   - Concrete ballast blocks for ballasted mount
 *   - Flush mini-rails for flush mount
 * - Dynamic Azimuth & Tilt alignment
 * - 0 default obstacles (only rendered when explicitly added)
 */
const Rooftop3DViewer = forwardRef(function Rooftop3DViewer(
  {
    roofPolygon = [],
    roof = {
      type: "flat", // 'flat' | 'single_slope' | 'gable' | 'hip'
      pitch_deg: 0,
      azimuth_deg: 180,
      elevation_m: 3.0,
      surface_material: "concrete",
    },
    panels = [],
    obstacles = [],
    walkways = [],
    structure = {
      type: "elevated", // 'elevated' | 'flush' | 'fixed_tilt' | 'ballasted'
      tilt_deg: 15,
      height_m: 1.8,
      azimuth: 180,
      show_structure: true,
      cross_bracing: true,
      base_plates: true,
      show_supports: true,
    },
    panelSpecs = {},
  },
  ref
) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const rootGroupRef = useRef(null);

  // Camera orbit state
  const controlsRef = useRef({
    isDragging: false,
    isPanning: false,
    prevX: 0,
    prevY: 0,
    spherical: { radius: 32, phi: Math.PI / 3.2, theta: Math.PI / 4 },
    target: new THREE.Vector3(0, 3, 0),
  });

  const [activePreset, setActivePreset] = useState("isometric");
  const [showPanels, setShowPanels] = useState(true);
  const [showStructures, setShowStructures] = useState(structure?.show_structure !== false);
  const [showPosts, setShowPosts] = useState(true);
  const [showRoof, setShowRoof] = useState(true);
  const [showBuilding, setShowBuilding] = useState(true);
  const [showObstacles, setShowObstacles] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef(null);

  const hasRoof = roofPolygon && roofPolygon.length >= 3;
  const activePanels = (panels || []).filter((p) => !p.hidden);

  // Expose snapshot export and fit-camera functions to parent
  useImperativeHandle(ref, () => ({
    getSnapshotDataUrl: () => {
      if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return null;
      rendererRef.current.render(sceneRef.current, cameraRef.current);
      return rendererRef.current.domElement.toDataURL("image/png");
    },
    fitDesign: () => fitDesignCamera(),
  }));

  // Update Camera from spherical coordinates
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

  // Fit Design in Camera Viewport
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

    controlsRef.current.target.copy(center);
    controlsRef.current.spherical.radius = Math.max(10, Math.min(140, distance));
    controlsRef.current.spherical.phi = Math.PI / 3.2;
    controlsRef.current.spherical.theta = Math.PI / 4;
    setActivePreset("isometric");
    updateCameraPosition();
  }, [updateCameraPosition]);

  // Set Camera View Presets
  const setCameraPreset = useCallback(
    (preset) => {
      setActivePreset(preset);
      const ctr = controlsRef.current;
      if (preset === "top") {
        ctr.spherical.phi = 0.05;
        ctr.spherical.theta = 0;
      } else if (preset === "front") {
        ctr.spherical.phi = Math.PI / 2.15;
        ctr.spherical.theta = 0;
      } else if (preset === "side") {
        ctr.spherical.phi = Math.PI / 2.15;
        ctr.spherical.theta = Math.PI / 2;
      } else if (preset === "isometric") {
        ctr.spherical.phi = Math.PI / 3.2;
        ctr.spherical.theta = Math.PI / 4;
      } else if (preset === "fit") {
        fitDesignCamera();
        return;
      } else if (preset === "reset") {
        ctr.spherical.radius = 32;
        ctr.spherical.phi = Math.PI / 3.2;
        ctr.spherical.theta = Math.PI / 4;
        ctr.target.set(0, 3, 0);
      }
      updateCameraPosition();
    },
    [updateCameraPosition, fitDesignCamera]
  );

  // Initialize Three.js Scene
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
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 300;
    const d = 50;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0004;
    scene.add(sunLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambientLight);

    // Ground Plane
    const groundGeom = new THREE.PlaneGeometry(140, 140);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x131d2e,
      roughness: 0.95,
      metalness: 0.05,
    });
    const groundMesh = new THREE.Mesh(groundGeom, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -0.02;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    const gridHelper = new THREE.GridHelper(120, 60, 0x3b82f6, 0x1e293b);
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);

    // Mouse Listeners
    const dom = renderer.domElement;

    const onMouseDown = (e) => {
      e.preventDefault();
      controlsRef.current.isDragging = e.button === 0;
      controlsRef.current.isPanning = e.button === 2 || e.shiftKey;
      controlsRef.current.prevX = e.clientX;
      controlsRef.current.prevY = e.clientY;
    };

    const onMouseMove = (e) => {
      const ctr = controlsRef.current;
      if (!ctr.isDragging && !ctr.isPanning) return;

      const deltaX = e.clientX - ctr.prevX;
      const deltaY = e.clientY - ctr.prevY;
      ctr.prevX = e.clientX;
      ctr.prevY = e.clientY;

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

    const onMouseUp = () => {
      controlsRef.current.isDragging = false;
      controlsRef.current.isPanning = false;
    };

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
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
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

  // Build / Update Complete 3D Rooftop Scene Hierarchy
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (rootGroupRef.current) {
      scene.remove(rootGroupRef.current);
    }

    const rootGroup = new THREE.Group();
    rootGroup.name = "dynamic_rooftop_group";
    rootGroupRef.current = rootGroup;

    const roofType = roof?.type || "flat";
    const roofPitchDeg = Number(roof?.pitch_deg || 0);
    const roofAzimuthDeg = Number(roof?.azimuth_deg || 180);
    const buildingElevationM = Number(roof?.elevation_m || 3.0);
    const roofPitchRad = toRad(roofPitchDeg);

    // 1. Build 3D Building Walls & Extruded Solid Roof Slab (ONLY if roofPolygon exists)
    if (roofPolygon && roofPolygon.length >= 3) {
      const shape = new THREE.Shape();
      roofPolygon.forEach((pt, idx) => {
        if (idx === 0) shape.moveTo(pt.x, -pt.y);
        else shape.lineTo(pt.x, -pt.y);
      });
      shape.closePath();

      // Building Base Walls
      if (showBuilding && buildingElevationM > 0) {
        const wallExtrudeSettings = { steps: 1, depth: buildingElevationM, bevelEnabled: false };
        const wallGeom = new THREE.ExtrudeGeometry(shape, wallExtrudeSettings);
        wallGeom.rotateX(Math.PI / 2);

        const wallMat = new THREE.MeshStandardMaterial({
          color: 0x94a3b8,
          roughness: 0.9,
          metalness: 0.05,
        });

        const wallMesh = new THREE.Mesh(wallGeom, wallMat);
        wallMesh.position.y = 0;
        wallMesh.castShadow = true;
        wallMesh.receiveShadow = true;
        rootGroup.add(wallMesh);
      }

      // 3D Solid Roof Slab
      if (showRoof) {
        const roofSlabThickness = 0.35;
        const roofExtrudeSettings = {
          steps: 1,
          depth: roofSlabThickness,
          bevelEnabled: true,
          bevelThickness: 0.06,
          bevelSize: 0.06,
          bevelSegments: 2,
        };

        const roofGeom = new THREE.ExtrudeGeometry(shape, roofExtrudeSettings);
        roofGeom.rotateX(Math.PI / 2);

        const roofMat = new THREE.MeshStandardMaterial({
          color: 0xe2e8f0,
          roughness: 0.8,
          metalness: 0.1,
        });

        const roofMesh = new THREE.Mesh(roofGeom, roofMat);
        roofMesh.position.y = buildingElevationM;
        roofMesh.receiveShadow = true;
        roofMesh.castShadow = true;

        if (roofPitchDeg > 0 && roofType === "single_slope") {
          roofMesh.rotation.x = -roofPitchRad;
        }

        rootGroup.add(roofMesh);

        const edgeGeom = new THREE.EdgesGeometry(roofGeom);
        const edgeMat = new THREE.LineBasicMaterial({ color: 0x64748b, linewidth: 1.5 });
        const edgeLines = new THREE.LineSegments(edgeGeom, edgeMat);
        roofMesh.add(edgeLines);
      }
    }

    // 2. Build 3D Solar PV Modules & Row-Based Engineering Mounting Structure
    if (activePanels.length > 0) {
      const structType = (structure?.type || "elevated").toLowerCase();
      const isFlush = structType === "flush";
      const isElevated = structType === "elevated";
      const isBallasted = structType === "ballasted";
      const baseClearance = isFlush ? 0.12 : Number(structure?.height_m || 1.8);
      const panelTiltDeg = isFlush ? roofPitchDeg : Number(structure?.tilt_deg || 15);
      const structAzimuth = Number(structure?.azimuth ?? 180);

      // Shared Module Materials
      const panelGeom = new THREE.BoxGeometry(1, 0.038, 1);
      const siliconCellMat = new THREE.MeshStandardMaterial({
        color: 0x071b3b,
        roughness: 0.16,
        metalness: 0.75,
      });
      const frameMat = new THREE.MeshStandardMaterial({
        color: 0xd1d5db,
        roughness: 0.35,
        metalness: 0.85,
      });
      const moduleMaterials = [frameMat, frameMat, siliconCellMat, frameMat, frameMat, frameMat];

      // Realistic Structure Materials
      const railMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.3, metalness: 0.85 }); // Anodized Aluminium
      const rafterMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.4, metalness: 0.8 }); // Steel C-Channel
      const postMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.35, metalness: 0.85 }); // Galvanized Steel
      const basePlateMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.9 }); // Steel Base Anchor
      const boltMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.2, metalness: 0.95 }); // SS304 Bolts
      const braceMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.85 }); // Strut Brace
      const ballastMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.95, metalness: 0.05 }); // Concrete Ballast

      // A. Render Individual Solar PV Panels
      if (showPanels) {
        activePanels.forEach((p) => {
          const pw = Number(p.width || 1.134);
          const pl = Number(p.height || 2.278);
          const panelAzimuth = Number(p.azimuth ?? structAzimuth);

          const transform = calculatePanel3DPosition({
            panel: { ...p, azimuth: panelAzimuth },
            roof: {
              type: roofType,
              pitch_deg: roofPitchDeg,
              azimuth_deg: roofAzimuthDeg,
              elevation_m: buildingElevationM,
            },
            structure: {
              type: structType,
              tilt_deg: panelTiltDeg,
              height_m: baseClearance,
              azimuth: panelAzimuth,
            },
          });

          const panelGroup = new THREE.Group();
          panelGroup.position.set(transform.x, transform.y, transform.z);
          panelGroup.rotation.y = transform.yawRad;

          const panelMesh = new THREE.Mesh(panelGeom, moduleMaterials);
          panelMesh.scale.set(pw, 1, pl);
          panelMesh.rotation.x = -transform.tiltRad;
          panelMesh.castShadow = true;
          panelMesh.receiveShadow = true;
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
            type: roofType,
            pitch_deg: roofPitchDeg,
            azimuth_deg: roofAzimuthDeg,
            elevation_m: buildingElevationM,
          });

          const frameCenterY = rowRoofY + baseClearance + (row.pl / 2) * Math.sin(tiltRad);

          const rowMountGroup = new THREE.Group();
          rowMountGroup.position.set(row.centerX, frameCenterY, -row.centerY);
          rowMountGroup.rotation.y = azYawRad;

          // 1. Dual Continuous Longitudinal Rails
          const railLength = row.totalRowLength + 0.12;
          const railGeom = new THREE.BoxGeometry(railLength, 0.045, 0.055);

          // Upper rail
          const topRail = new THREE.Mesh(railGeom, railMat);
          topRail.position.set(0, -0.038, -row.pl * 0.28 * Math.cos(tiltRad));
          topRail.rotation.x = -tiltRad;
          topRail.castShadow = true;
          rowMountGroup.add(topRail);

          // Lower rail
          const bottomRail = new THREE.Mesh(railGeom, railMat);
          bottomRail.position.set(0, -0.038, +row.pl * 0.28 * Math.cos(tiltRad));
          bottomRail.rotation.x = -tiltRad;
          bottomRail.castShadow = true;
          rowMountGroup.add(bottomRail);

          // 2. Structural Rafter Lines, Columns & Base Anchor Plates
          if (showPosts && !isFlush) {
            const frontZ = +row.pl * 0.28 * Math.cos(tiltRad);
            const rearZ = -row.pl * 0.28 * Math.cos(tiltRad);
            const frontYOffset = -(row.pl * 0.28) * Math.sin(tiltRad) - 0.065;
            const rearYOffset = +(row.pl * 0.28) * Math.sin(tiltRad) - 0.065;

            const frontLegHeight = Math.max(0.1, frameCenterY + frontYOffset - rowRoofY);
            const rearLegHeight = Math.max(0.1, frameCenterY + rearYOffset - rowRoofY);

            const rafterLength = row.pl * 0.85;
            const rafterGeom = new THREE.BoxGeometry(0.06, 0.08, rafterLength);
            const postGeomFront = new THREE.CylinderGeometry(0.028, 0.028, frontLegHeight, 12);
            const postGeomRear = new THREE.CylinderGeometry(0.028, 0.028, rearLegHeight, 12);
            const basePlateGeom = new THREE.BoxGeometry(0.18, 0.02, 0.18);
            const boltGeom = new THREE.CylinderGeometry(0.008, 0.008, 0.03, 8);
            const ballastBlockGeom = new THREE.BoxGeometry(0.35, 0.18, 0.28);

            row.rafterUOffsets.forEach((uOffset, idx) => {
              const uRel = uOffset - row.centerU;
              const isEndFrame = idx === 0 || idx === row.rafterUOffsets.length - 1;

              // A. Inclined Structural Rafter Beam (connecting front to rear rail)
              const rafterMesh = new THREE.Mesh(rafterGeom, rafterMat);
              rafterMesh.position.set(uRel, -0.065, 0);
              rafterMesh.rotation.x = -tiltRad;
              rafterMesh.castShadow = true;
              rowMountGroup.add(rafterMesh);

              // B. Front Support Column (Post)
              const frontPost = new THREE.Mesh(postGeomFront, postMat);
              frontPost.position.set(uRel, frontYOffset - frontLegHeight / 2, frontZ);
              frontPost.castShadow = true;
              rowMountGroup.add(frontPost);

              // Front Base Anchor Plate / Ballast Block
              if (isBallasted) {
                const ballast = new THREE.Mesh(ballastBlockGeom, ballastMat);
                ballast.position.set(uRel, frontYOffset - frontLegHeight + 0.09, frontZ);
                ballast.castShadow = true;
                ballast.receiveShadow = true;
                rowMountGroup.add(ballast);
              } else {
                const basePlate = new THREE.Mesh(basePlateGeom, basePlateMat);
                basePlate.position.set(uRel, frontYOffset - frontLegHeight + 0.01, frontZ);
                basePlate.castShadow = true;
                rowMountGroup.add(basePlate);

                // 4 Anchor Bolts
                [[-0.06, -0.06], [-0.06, 0.06], [0.06, -0.06], [0.06, 0.06]].forEach(([bx, bz]) => {
                  const bolt = new THREE.Mesh(boltGeom, boltMat);
                  bolt.position.set(uRel + bx, frontYOffset - frontLegHeight + 0.025, frontZ + bz);
                  rowMountGroup.add(bolt);
                });
              }

              // C. Rear Support Column (Post)
              const rearPost = new THREE.Mesh(postGeomRear, postMat);
              rearPost.position.set(uRel, rearYOffset - rearLegHeight / 2, rearZ);
              rearPost.castShadow = true;
              rowMountGroup.add(rearPost);

              // Rear Base Anchor Plate / Ballast Block
              if (isBallasted) {
                const ballast = new THREE.Mesh(ballastBlockGeom, ballastMat);
                ballast.position.set(uRel, rearYOffset - rearLegHeight + 0.09, rearZ);
                ballast.castShadow = true;
                ballast.receiveShadow = true;
                rowMountGroup.add(ballast);
              } else {
                const basePlate = new THREE.Mesh(basePlateGeom, basePlateMat);
                basePlate.position.set(uRel, rearYOffset - rearLegHeight + 0.01, rearZ);
                basePlate.castShadow = true;
                rowMountGroup.add(basePlate);

                [[-0.06, -0.06], [-0.06, 0.06], [0.06, -0.06], [0.06, 0.06]].forEach(([bx, bz]) => {
                  const bolt = new THREE.Mesh(boltGeom, boltMat);
                  bolt.position.set(uRel + bx, rearYOffset - rearLegHeight + 0.025, rearZ + bz);
                  rowMountGroup.add(bolt);
                });
              }

              // D. Diagonal Sway Cross-Bracing on End Frames
              if (isElevated && baseClearance >= 1.2 && isEndFrame) {
                const braceSpanZ = frontZ - rearZ;
                const braceSpanY = (rearYOffset) - (frontYOffset - frontLegHeight);
                const braceLength = Math.hypot(braceSpanZ, braceSpanY);
                const braceGeom = new THREE.CylinderGeometry(0.018, 0.018, braceLength, 8);

                const braceMesh = new THREE.Mesh(braceGeom, braceMat);
                braceMesh.position.set(
                  uRel,
                  (frontYOffset - frontLegHeight + rearYOffset) / 2,
                  (frontZ + rearZ) / 2
                );
                braceMesh.rotation.x = Math.atan2(braceSpanZ, braceSpanY);
                braceMesh.castShadow = true;
                rowMountGroup.add(braceMesh);
              }
            });
          }

          rootGroup.add(rowMountGroup);
        });
      }
    }

    // 3. Build 3D Obstacles (ONLY if explicitly added)
    if (showObstacles && Array.isArray(obstacles) && obstacles.length > 0) {
      obstacles.forEach((obs) => {
        const ox = Number(obs.x || 0);
        const oz = -Number(obs.y || 0);
        const ol = Number(obs.length || 1.8);
        const ow = Number(obs.width || 1.8);
        const oh = Number(obs.height || 1.6);
        const type = obs.type || "water_tank";
        const roofElevation = calculateRoofElevationAtPoint(ox, Number(obs.y || 0), {
          type: roofType,
          pitch_deg: roofPitchDeg,
          azimuth_deg: roofAzimuthDeg,
          elevation_m: buildingElevationM,
        });

        if (type === "water_tank") {
          const tankRadius = Math.min(ol, ow) / 2;
          const tankGeom = new THREE.CylinderGeometry(tankRadius, tankRadius, oh, 24);
          const tankMat = new THREE.MeshStandardMaterial({
            color: 0x1d4ed8,
            roughness: 0.35,
            metalness: 0.25,
          });
          const tankMesh = new THREE.Mesh(tankGeom, tankMat);
          tankMesh.position.set(ox, roofElevation + oh / 2, oz);
          tankMesh.castShadow = true;
          tankMesh.receiveShadow = true;
          rootGroup.add(tankMesh);

          const lidGeom = new THREE.CylinderGeometry(tankRadius * 0.45, tankRadius * 0.5, 0.12, 24);
          const lidMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.4 });
          const lidMesh = new THREE.Mesh(lidGeom, lidMat);
          lidMesh.position.set(ox, roofElevation + oh + 0.06, oz);
          rootGroup.add(lidMesh);
        } else if (type === "staircase") {
          const stairGeom = new THREE.BoxGeometry(ol, oh, ow);
          const stairMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.8 });
          const stairMesh = new THREE.Mesh(stairGeom, stairMat);
          stairMesh.position.set(ox, roofElevation + oh / 2, oz);
          stairMesh.castShadow = true;
          stairMesh.receiveShadow = true;
          rootGroup.add(stairMesh);
        } else if (type === "ac_unit") {
          const acGeom = new THREE.BoxGeometry(ol, oh, ow);
          const acMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.4, metalness: 0.5 });
          const acMesh = new THREE.Mesh(acGeom, acMat);
          acMesh.position.set(ox, roofElevation + oh / 2, oz);
          acMesh.castShadow = true;
          rootGroup.add(acMesh);
        } else {
          const boxGeom = new THREE.BoxGeometry(ol, oh, ow);
          const boxMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.7 });
          const boxMesh = new THREE.Mesh(boxGeom, boxMat);
          boxMesh.position.set(ox, roofElevation + oh / 2, oz);
          boxMesh.castShadow = true;
          rootGroup.add(boxMesh);
        }
      });
    }

    // 4. 3D Compass Indicator
    const compassGroup = new THREE.Group();
    compassGroup.position.set(-18, 0.05, -18);

    const northCone = new THREE.ConeGeometry(0.5, 1.4, 16);
    const redMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const northArrow = new THREE.Mesh(northCone, redMat);
    northArrow.rotation.x = -Math.PI / 2;
    northArrow.position.z = -0.9;
    compassGroup.add(northArrow);

    const southCone = new THREE.ConeGeometry(0.4, 1.0, 16);
    const blueMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6 });
    const southArrow = new THREE.Mesh(southCone, blueMat);
    southArrow.rotation.x = Math.PI / 2;
    southArrow.position.z = 0.7;
    compassGroup.add(southArrow);

    const ringGeom = new THREE.RingGeometry(1.5, 1.65, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8, side: THREE.DoubleSide });
    const ringMesh = new THREE.Mesh(ringGeom, ringMat);
    ringMesh.rotation.x = Math.PI / 2;
    compassGroup.add(ringMesh);

    rootGroup.add(compassGroup);

    scene.add(rootGroup);
  }, [
    roofPolygon,
    roof,
    panels,
    activePanels,
    obstacles,
    walkways,
    structure,
    showPanels,
    showStructures,
    showPosts,
    showRoof,
    showBuilding,
    showObstacles,
  ]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full min-h-[580px] rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl select-none flex flex-col ${
        isFullscreen ? "fixed inset-0 z-50 rounded-none h-screen" : ""
      }`}
    >
      <div ref={mountRef} className="w-full h-full flex-1 cursor-grab active:cursor-grabbing block" />

      {/* Empty State Banner in 3D */}
      {!hasRoof && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center text-white pointer-events-none z-10">
          <div className="w-12 h-12 rounded-2xl bg-blue-900/60 border border-blue-700 flex items-center justify-center text-blue-400 mb-3 shadow-lg">
            <Box className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold tracking-tight">3D Preview Awaiting Roof Geometry</h3>
          <p className="text-xs text-slate-400 max-w-sm my-1.5 leading-relaxed">
            3D rooftop simulation will appear after you draw the roof boundary in the <b>2D Satellite Plan</b> tab.
          </p>
        </div>
      )}

      {/* Top Floating Compact Camera Toolbar */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none gap-2 z-10">
        <div className="flex items-center gap-1 bg-slate-900/95 backdrop-blur-md p-1 rounded-xl border border-slate-700/80 shadow-lg pointer-events-auto">
          <Button
            size="sm"
            variant={activePreset === "isometric" ? "default" : "ghost"}
            onClick={() => setCameraPreset("isometric")}
            className="h-6 text-[11px] px-2 rounded-lg"
          >
            <Box className="w-3.5 h-3.5 mr-1" /> 3D View
          </Button>
          <Button
            size="sm"
            variant={activePreset === "top" ? "default" : "ghost"}
            onClick={() => setCameraPreset("top")}
            className="h-6 text-[11px] px-2 rounded-lg"
          >
            Top
          </Button>
          <Button
            size="sm"
            variant={activePreset === "front" ? "default" : "ghost"}
            onClick={() => setCameraPreset("front")}
            className="h-6 text-[11px] px-2 rounded-lg"
          >
            Front
          </Button>
          <Button
            size="sm"
            variant={activePreset === "side" ? "default" : "ghost"}
            onClick={() => setCameraPreset("side")}
            className="h-6 text-[11px] px-2 rounded-lg"
          >
            Side
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={fitDesignCamera}
            className="h-6 text-[11px] px-2 rounded-lg text-blue-400 hover:text-white"
            title="Fit Entire Installation in Viewport"
          >
            <Focus className="w-3 h-3 mr-1" /> Fit Design
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setCameraPreset("reset")}
            className="h-6 w-6 p-0 rounded-lg text-slate-400 hover:text-white"
            title="Reset Camera"
          >
            <RotateCcw className="w-3 h-3" />
          </Button>
        </div>

        <div className="flex items-center gap-1 bg-slate-900/95 backdrop-blur-md p-1 rounded-xl border border-slate-700/80 shadow-lg pointer-events-auto">
          <Button
            size="sm"
            variant={showRoof ? "secondary" : "ghost"}
            onClick={() => setShowRoof(!showRoof)}
            className="h-6 text-[11px] px-2 rounded-lg"
          >
            Roof
          </Button>
          <Button
            size="sm"
            variant={showStructures ? "secondary" : "ghost"}
            onClick={() => setShowStructures(!showStructures)}
            className="h-6 text-[11px] px-2 rounded-lg"
          >
            Structure
          </Button>
          <Button
            size="sm"
            variant={showPanels ? "secondary" : "ghost"}
            onClick={() => setShowPanels(!showPanels)}
            className="h-6 text-[11px] px-2 rounded-lg"
          >
            Panels ({activePanels.length})
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="h-6 w-6 p-0 rounded-lg text-slate-300 hover:text-white"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {/* Bottom Live Engineering Spec HUD */}
      <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between pointer-events-none z-10 gap-2">
        <div className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700/80 shadow-lg pointer-events-auto flex items-center gap-3 text-xs text-slate-300">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500 shadow-xs" />
            <span>Roof: <b>{hasRoof ? `${roof?.type?.toUpperCase() || "FLAT"} (${roof?.elevation_m || 3.0}m)` : "None"}</b></span>
          </div>
          <span className="text-slate-700">|</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-xs" />
            <span>Tilt: <b>{structure?.tilt_deg || 15}°</b></span>
          </div>
          <span className="text-slate-700">|</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 shadow-xs" />
            <span>Azimuth: <b>{structure?.azimuth || 180}° ({structure?.azimuth === 180 ? "South" : structure?.azimuth === 90 ? "East" : structure?.azimuth === 270 ? "West" : structure?.azimuth === 135 ? "SE" : structure?.azimuth === 225 ? "SW" : "Custom"})</b></span>
          </div>
        </div>

        <div className="bg-slate-900/90 backdrop-blur-md px-2.5 py-1 rounded-xl border border-slate-700/80 shadow-lg text-[10px] text-slate-300 pointer-events-auto flex items-center gap-1.5">
          <Info className="w-3 h-3 text-blue-400 shrink-0" />
          <span>3D Simulation</span>
        </div>
      </div>
    </div>
  );
});

export default Rooftop3DViewer;
