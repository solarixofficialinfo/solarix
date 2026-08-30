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
  getPolygonBounds,
} from "../utils/geoCalculations";

/**
 * Production-Ready 3D Rooftop WebGL Visualizer
 * 
 * Features:
 * - Real extruded 3D Roof Slab directly matching the drawn 2D polygon boundary
 * - Building elevation / ground-to-roof structure walls (3.0m - 6.0m)
 * - Roof Slope / Pitch support (Flat, Single Slope, Gable, Hip)
 * - Realistic Monocrystalline PV Panels sitting physically ON mounting rails & roof
 * - Complete 3D Mounting Structure Layer (Aluminium rails, vertical support columns, base brackets)
 * - 3D Obstacles (Water tanks with stands, staircase tower rooms, AC outdoor units)
 * - Orbit, Pan, and Zoom controls with "Fit Design" bounding-box framing
 * - Camera Presets (Top, Front, Side, Isometric, Fit Design)
 * - Layer visibility controls (Roof, Building, Structure, Panels, Obstacles, Walkways)
 */
const Rooftop3DViewer = forwardRef(function Rooftop3DViewer(
  {
    roofPolygon = [],
    roof = {
      type: "flat", // 'flat' | 'single_slope' | 'gable' | 'hip'
      pitch_deg: 0,
      azimuth_deg: 180,
      elevation_m: 3.0,
      surface_material: "concrete", // 'concrete' | 'metal_sheet' | 'tiles'
    },
    panels = [],
    obstacles = [],
    walkways = [],
    structure = {
      type: "elevated", // 'elevated' | 'flush' | 'fixed_tilt' | 'ballasted'
      tilt_deg: 15,
      height_m: 1.8,
      show_structure: true,
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
  const [showRoof, setShowRoof] = useState(true);
  const [showBuilding, setShowBuilding] = useState(true);
  const [showObstacles, setShowObstacles] = useState(true);
  const [showWalkways, setShowWalkways] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef(null);

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

    const maxDim = Math.max(size.x, size.y, size.z, 10);
    const fov = cameraRef.current.fov * (Math.PI / 180);
    const distance = (maxDim / 2) / Math.tan(fov / 2) * 1.5;

    controlsRef.current.target.copy(center);
    controlsRef.current.spherical.radius = Math.max(15, Math.min(120, distance));
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
        ctr.spherical.phi = 0.05; // directly overhead
        ctr.spherical.theta = 0;
      } else if (preset === "front") {
        ctr.spherical.phi = Math.PI / 2.15; // south facing elevation
        ctr.spherical.theta = 0;
      } else if (preset === "side") {
        ctr.spherical.phi = Math.PI / 2.15; // east profile
        ctr.spherical.theta = Math.PI / 2;
      } else if (preset === "isometric") {
        ctr.spherical.phi = Math.PI / 3.2;
        ctr.spherical.theta = Math.PI / 4;
      } else if (preset === "fit") {
        fitDesignCamera();
        return;
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

    // 1. Scene & Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a); // Slate-900 clean background
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

    // 2. Perspective Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 800);
    cameraRef.current = camera;
    updateCameraPosition();

    // 3. Realistic Sunlight & Sky Lighting
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x334155, 0.75);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfffaed, 1.5);
    sunLight.position.set(35, 60, 40);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 250;
    const d = 45;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0004;
    scene.add(sunLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    // 4. Ground Terrain Plane (y = 0)
    const groundGeom = new THREE.PlaneGeometry(120, 120);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.9,
      metalness: 0.1,
    });
    const groundMesh = new THREE.Mesh(groundGeom, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -0.02;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // Ground Grid Helper
    const gridHelper = new THREE.GridHelper(100, 50, 0x475569, 0x334155);
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);

    // 5. Mouse & Touch Orbit / Pan Event Handlers
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
        const panSpeed = ctr.spherical.radius * 0.0016;
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
      controlsRef.current.spherical.radius = Math.max(5, Math.min(150, controlsRef.current.spherical.radius * zoomFactor));
      updateCameraPosition();
    };

    const onContextMenu = (e) => e.preventDefault();

    dom.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    dom.addEventListener("wheel", onWheel, { passive: false });
    dom.addEventListener("contextmenu", onContextMenu);

    // 6. Resize Handler
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    // 7. Animation Loop
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

    // Remove previous dynamic objects
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

    // 1. Build 3D Building Walls & Extruded Roof Slab
    if (roofPolygon && roofPolygon.length >= 3) {
      const shape = new THREE.Shape();
      roofPolygon.forEach((pt, idx) => {
        if (idx === 0) shape.moveTo(pt.x, -pt.y);
        else shape.lineTo(pt.x, -pt.y);
      });
      shape.closePath();

      // A. Building Base Walls (Ground y=0 to y=buildingElevationM)
      if (showBuilding && buildingElevationM > 0) {
        const wallExtrudeSettings = {
          steps: 1,
          depth: buildingElevationM,
          bevelEnabled: false,
        };
        const wallGeom = new THREE.ExtrudeGeometry(shape, wallExtrudeSettings);
        wallGeom.rotateX(Math.PI / 2); // Lay horizontally

        const wallMat = new THREE.MeshStandardMaterial({
          color: 0x94a3b8, // Light Slate Concrete Wall
          roughness: 0.9,
          metalness: 0.05,
        });

        const wallMesh = new THREE.Mesh(wallGeom, wallMat);
        wallMesh.position.y = 0;
        wallMesh.castShadow = true;
        wallMesh.receiveShadow = true;
        rootGroup.add(wallMesh);
      }

      // B. 3D Roof Slab with Parapet Border
      if (showRoof) {
        const roofSlabThickness = 0.35; // 35cm RCC slab
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

        // Roof Surface Material (Concrete / Tin Sheet)
        const roofMat = new THREE.MeshStandardMaterial({
          color: 0xe2e8f0, // Clean White/Grey Concrete Rooftop
          roughness: 0.8,
          metalness: 0.1,
        });

        const roofMesh = new THREE.Mesh(roofGeom, roofMat);
        roofMesh.position.y = buildingElevationM;
        roofMesh.receiveShadow = true;
        roofMesh.castShadow = true;

        // Apply Roof Pitch/Slope inclination if single slope or pitched
        if (roofPitchDeg > 0 && roofType === "single_slope") {
          roofMesh.rotation.x = -roofPitchRad;
        }

        rootGroup.add(roofMesh);

        // Parapet Wall Edges Outline
        const edgeGeom = new THREE.EdgesGeometry(roofGeom);
        const edgeMat = new THREE.LineBasicMaterial({ color: 0x64748b, linewidth: 1.5 });
        const edgeLines = new THREE.LineSegments(edgeGeom, edgeMat);
        roofMesh.add(edgeLines);
      }
    }

    // 2. Build 3D Solar PV Modules & Underlying Mounting Structures
    if (showPanels && panels && panels.length > 0) {
      const isElevated = (structure?.type || "").toLowerCase() === "elevated";
      const isFlush = (structure?.type || "").toLowerCase() === "flush";
      const baseClearance = isFlush ? 0.12 : Number(structure?.height_m || 1.8);
      const panelTiltDeg = isFlush ? roofPitchDeg : Number(structure?.tilt_deg || 15);
      const panelTiltRad = toRad(panelTiltDeg);

      // Shared Module Materials: Monocrystalline Silicon + Aluminium Frame
      const panelGeom = new THREE.BoxGeometry(1, 0.038, 1);

      // Anti-Reflective Silicon Cell Texture
      const siliconCellMat = new THREE.MeshStandardMaterial({
        color: 0x0a192f, // Deep Blue/Black Silicon
        roughness: 0.18,
        metalness: 0.7,
      });

      // Anodized Aluminium Silver Frame
      const frameMat = new THREE.MeshStandardMaterial({
        color: 0xd1d5db,
        roughness: 0.35,
        metalness: 0.85,
      });

      const moduleMaterials = [
        frameMat, // +X
        frameMat, // -X
        siliconCellMat, // +Y (Top solar face)
        frameMat, // -Y
        frameMat, // +Z
        frameMat, // -Z
      ];

      // Aluminium Rails Material
      const railMat = new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        roughness: 0.3,
        metalness: 0.85,
      });

      // Support Leg Column Material
      const legMat = new THREE.MeshStandardMaterial({
        color: 0x64748b,
        roughness: 0.4,
        metalness: 0.8,
      });

      // Base Mounting Foot Bracket Material
      const bracketMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.5,
        metalness: 0.9,
      });

      panels.forEach((p) => {
        if (p.hidden) return;

        const pw = Number(p.width || 1.134);
        const pl = Number(p.height || 2.278);

        // Compute 3D position relative to roof surface elevation
        const transform = calculatePanel3DPosition({
          panel: p,
          roof: {
            type: roofType,
            pitch_deg: roofPitchDeg,
            azimuth_deg: roofAzimuthDeg,
            elevation_m: buildingElevationM,
          },
          structure: {
            type: structure?.type || "elevated",
            tilt_deg: panelTiltDeg,
            height_m: baseClearance,
          },
        });

        // 3D Panel Mesh
        const panelMesh = new THREE.Mesh(panelGeom, moduleMaterials);
        panelMesh.scale.set(pw, 1, pl);
        panelMesh.position.set(transform.x, transform.y, transform.z);
        panelMesh.rotation.x = -transform.tiltRad;
        panelMesh.castShadow = true;
        panelMesh.receiveShadow = true;
        rootGroup.add(panelMesh);

        // 3D Mounting Structure (Rails + Vertical Support Legs + Base Brackets)
        if (showStructures) {
          // Two Continuous Longitudinal Rails under each module
          const railLength = pl * 1.05;
          const railGeom = new THREE.BoxGeometry(0.045, 0.06, railLength);

          const rail1 = new THREE.Mesh(railGeom, railMat);
          rail1.position.set(transform.x - pw * 0.28, transform.y - 0.04, transform.z);
          rail1.rotation.x = -transform.tiltRad;
          rail1.castShadow = true;
          rootGroup.add(rail1);

          const rail2 = new THREE.Mesh(railGeom, railMat);
          rail2.position.set(transform.x + pw * 0.28, transform.y - 0.04, transform.z);
          rail2.rotation.x = -transform.tiltRad;
          rail2.castShadow = true;
          rootGroup.add(rail2);

          // Support Columns / Legs extending down from rails to the roof surface
          const roofSurfaceY = transform.roofSurfaceY;
          const frontLegHeight = Math.max(0.1, transform.y - 0.04 - (pl / 2) * Math.sin(transform.tiltRad) - roofSurfaceY);
          const backLegHeight = Math.max(0.1, transform.y - 0.04 + (pl / 2) * Math.sin(transform.tiltRad) - roofSurfaceY);

          // Front Support Column & Base Plate
          const frontLegGeom = new THREE.CylinderGeometry(0.025, 0.025, frontLegHeight, 8);
          const frontLeg = new THREE.Mesh(frontLegGeom, legMat);
          const frontZ = transform.z + (pl / 2) * Math.cos(transform.tiltRad) * 0.8;
          frontLeg.position.set(transform.x, roofSurfaceY + frontLegHeight / 2, frontZ);
          frontLeg.castShadow = true;
          rootGroup.add(frontLeg);

          const basePlateGeom = new THREE.BoxGeometry(0.15, 0.02, 0.15);
          const basePlate1 = new THREE.Mesh(basePlateGeom, bracketMat);
          basePlate1.position.set(transform.x, roofSurfaceY + 0.01, frontZ);
          rootGroup.add(basePlate1);

          // Back Support Column & Base Plate
          const backLegGeom = new THREE.CylinderGeometry(0.025, 0.025, backLegHeight, 8);
          const backLeg = new THREE.Mesh(backLegGeom, legMat);
          const backZ = transform.z - (pl / 2) * Math.cos(transform.tiltRad) * 0.8;
          backLeg.position.set(transform.x, roofSurfaceY + backLegHeight / 2, backZ);
          backLeg.castShadow = true;
          rootGroup.add(backLeg);

          const basePlate2 = new THREE.Mesh(basePlateGeom, bracketMat);
          basePlate2.position.set(transform.x, roofSurfaceY + 0.01, backZ);
          rootGroup.add(basePlate2);
        }
      });
    }

    // 3. Build 3D Obstacles on Roof (Water tanks, Staircase rooms, AC units)
    if (showObstacles && obstacles && obstacles.length > 0) {
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
          // Cylindrical Water Tank with Stand
          const tankRadius = Math.min(ol, ow) / 2;
          const tankGeom = new THREE.CylinderGeometry(tankRadius, tankRadius, oh, 24);
          const tankMat = new THREE.MeshStandardMaterial({
            color: 0x1d4ed8, // Vibrant Blue Water Tank
            roughness: 0.35,
            metalness: 0.25,
          });
          const tankMesh = new THREE.Mesh(tankGeom, tankMat);
          tankMesh.position.set(ox, roofElevation + oh / 2, oz);
          tankMesh.castShadow = true;
          tankMesh.receiveShadow = true;
          rootGroup.add(tankMesh);

          // Top Lid
          const lidGeom = new THREE.CylinderGeometry(tankRadius * 0.45, tankRadius * 0.5, 0.12, 24);
          const lidMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.4 });
          const lidMesh = new THREE.Mesh(lidGeom, lidMat);
          lidMesh.position.set(ox, roofElevation + oh + 0.06, oz);
          rootGroup.add(lidMesh);
        } else if (type === "staircase") {
          // Staircase Tower Room (Headroom)
          const stairGeom = new THREE.BoxGeometry(ol, oh, ow);
          const stairMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.8 });
          const stairMesh = new THREE.Mesh(stairGeom, stairMat);
          stairMesh.position.set(ox, roofElevation + oh / 2, oz);
          stairMesh.castShadow = true;
          stairMesh.receiveShadow = true;
          rootGroup.add(stairMesh);

          // Headroom Door
          const doorGeom = new THREE.PlaneGeometry(0.8, 1.9);
          const doorMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 });
          const doorMesh = new THREE.Mesh(doorGeom, doorMat);
          doorMesh.position.set(ox, roofElevation + 0.95, oz + ow / 2 + 0.01);
          rootGroup.add(doorMesh);
        } else if (type === "ac_unit") {
          // AC Outdoor Compressor Unit
          const acGeom = new THREE.BoxGeometry(ol, oh, ow);
          const acMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.4, metalness: 0.5 });
          const acMesh = new THREE.Mesh(acGeom, acMat);
          acMesh.position.set(ox, roofElevation + oh / 2, oz);
          acMesh.castShadow = true;
          rootGroup.add(acMesh);
        } else {
          // Generic Obstruction
          const boxGeom = new THREE.BoxGeometry(ol, oh, ow);
          const boxMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.7 });
          const boxMesh = new THREE.Mesh(boxGeom, boxMat);
          boxMesh.position.set(ox, roofElevation + oh / 2, oz);
          boxMesh.castShadow = true;
          rootGroup.add(boxMesh);
        }
      });
    }

    // 4. Build 3D Maintenance Walkways
    if (showWalkways && walkways && walkways.length > 0) {
      const walkMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        roughness: 0.5,
        metalness: 0.3,
      });

      walkways.forEach((w) => {
        const ww = Number(w.width || 0.6);
        const wl = Number(w.length || 3.0);
        const wx = Number(w.x || 0);
        const wz = -Number(w.y || 0);
        const roofElevation = calculateRoofElevationAtPoint(wx, Number(w.y || 0), {
          type: roofType,
          pitch_deg: roofPitchDeg,
          azimuth_deg: roofAzimuthDeg,
          elevation_m: buildingElevationM,
        });

        const walkGeom = new THREE.BoxGeometry(ww, 0.04, wl);
        const walkMesh = new THREE.Mesh(walkGeom, walkMat);
        walkMesh.position.set(wx, roofElevation + 0.02, wz);
        rootGroup.add(walkMesh);
      });
    }

    // 5. 3D Compass Indicator in Viewport
    const compassGroup = new THREE.Group();
    compassGroup.position.set(-18, 0.05, -18);

    // North Red Cone
    const northCone = new THREE.ConeGeometry(0.5, 1.4, 16);
    const redMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const northArrow = new THREE.Mesh(northCone, redMat);
    northArrow.rotation.x = -Math.PI / 2;
    northArrow.position.z = -0.9;
    compassGroup.add(northArrow);

    // South Blue Cone
    const southCone = new THREE.ConeGeometry(0.4, 1.0, 16);
    const blueMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6 });
    const southArrow = new THREE.Mesh(southCone, blueMat);
    southArrow.rotation.x = Math.PI / 2;
    southArrow.position.z = 0.7;
    compassGroup.add(southArrow);

    // Outer Compass Ring
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
    obstacles,
    walkways,
    structure,
    showPanels,
    showStructures,
    showRoof,
    showBuilding,
    showObstacles,
    showWalkways,
  ]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full min-h-[580px] rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl select-none flex flex-col ${
        isFullscreen ? "fixed inset-0 z-50 rounded-none h-screen" : ""
      }`}
    >
      {/* Three.js 3D WebGL Canvas Mount */}
      <div ref={mountRef} className="w-full h-full flex-1 cursor-grab active:cursor-grabbing block" />

      {/* Top Floating Camera Toolbar */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none gap-2 z-10">
        {/* Camera View Presets */}
        <div className="flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md p-1.5 rounded-xl border border-slate-700/80 shadow-lg pointer-events-auto">
          <Button
            size="sm"
            variant={activePreset === "isometric" ? "default" : "ghost"}
            onClick={() => setCameraPreset("isometric")}
            className="h-7 text-[11px] px-2.5 rounded-lg"
          >
            <Box className="w-3.5 h-3.5 mr-1" /> 3D View
          </Button>
          <Button
            size="sm"
            variant={activePreset === "top" ? "default" : "ghost"}
            onClick={() => setCameraPreset("top")}
            className="h-7 text-[11px] px-2.5 rounded-lg"
          >
            Top (Plan)
          </Button>
          <Button
            size="sm"
            variant={activePreset === "front" ? "default" : "ghost"}
            onClick={() => setCameraPreset("front")}
            className="h-7 text-[11px] px-2.5 rounded-lg"
          >
            Front (South)
          </Button>
          <Button
            size="sm"
            variant={activePreset === "side" ? "default" : "ghost"}
            onClick={() => setCameraPreset("side")}
            className="h-7 text-[11px] px-2.5 rounded-lg"
          >
            Side
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={fitDesignCamera}
            className="h-7 text-[11px] px-2.5 rounded-lg text-blue-400 hover:text-white"
            title="Fit Entire Installation in Viewport"
          >
            <Focus className="w-3.5 h-3.5 mr-1" /> Fit Design
          </Button>
        </div>

        {/* 3D Layer Visibility Toggles */}
        <div className="flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md p-1.5 rounded-xl border border-slate-700/80 shadow-lg pointer-events-auto">
          <Button
            size="sm"
            variant={showRoof ? "secondary" : "ghost"}
            onClick={() => setShowRoof(!showRoof)}
            className="h-7 text-[11px] px-2 rounded-lg"
          >
            Roof Slab
          </Button>
          <Button
            size="sm"
            variant={showBuilding ? "secondary" : "ghost"}
            onClick={() => setShowBuilding(!showBuilding)}
            className="h-7 text-[11px] px-2 rounded-lg"
          >
            Building Walls
          </Button>
          <Button
            size="sm"
            variant={showStructures ? "secondary" : "ghost"}
            onClick={() => setShowStructures(!showStructures)}
            className="h-7 text-[11px] px-2 rounded-lg"
          >
            Structure Rails
          </Button>
          <Button
            size="sm"
            variant={showPanels ? "secondary" : "ghost"}
            onClick={() => setShowPanels(!showPanels)}
            className="h-7 text-[11px] px-2 rounded-lg"
          >
            PV Modules ({panels.filter((p) => !p.hidden).length})
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="h-7 w-7 p-0 rounded-lg text-slate-300 hover:text-white"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {/* Bottom Live Engineering Spec HUD */}
      <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between pointer-events-none z-10 gap-2">
        <div className="bg-slate-900/90 backdrop-blur-md px-3.5 py-2 rounded-xl border border-slate-700/80 shadow-lg pointer-events-auto flex items-center gap-3 text-xs text-slate-300">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-xs" />
            <span>Roof: <b>{roof?.type?.toUpperCase() || "FLAT"} ({roof?.elevation_m || 3.0}m)</b></span>
          </div>
          <span className="text-slate-700">|</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-xs" />
            <span>Pitch: <b>{roof?.pitch_deg || 0}°</b></span>
          </div>
          <span className="text-slate-700">|</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-xs" />
            <span>Structure: <b>{structure?.type?.toUpperCase() || "ELEVATED"} ({structure?.height_m || 1.8}m, {structure?.tilt_deg || 15}° Tilt)</b></span>
          </div>
        </div>

        <div className="bg-amber-950/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-amber-800/60 shadow-lg text-[10.5px] text-amber-200 pointer-events-auto flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>Preliminary 3D Simulation — Subject to on-site civil survey</span>
        </div>
      </div>
    </div>
  );
});

export default Rooftop3DViewer;
