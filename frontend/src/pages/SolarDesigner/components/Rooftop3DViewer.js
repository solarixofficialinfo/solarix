import React, { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import * as THREE from "three";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  RotateCcw, Eye, Layers, Compass, ZoomIn, ZoomOut, Maximize2, Minimize2,
  Box, Camera, Sun, Info
} from "lucide-react";

/**
 * High-Performance Interactive 3D WebGL Rooftop Viewer
 */
const Rooftop3DViewer = forwardRef(function Rooftop3DViewer(
  {
    roofPolygon = [],
    panels = [],
    obstacles = [],
    walkways = [],
    structureType = "elevated",
    tiltAngle = 15,
    azimuthAngle = 180,
    mountingHeightM = 1.8,
    roofTilt = 0,
    panelSpecs = {},
  },
  ref
) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef({
    isDragging: false,
    isPanning: false,
    prevX: 0,
    prevY: 0,
    spherical: { radius: 25, phi: Math.PI / 3, theta: Math.PI / 4 },
    target: new THREE.Vector3(0, 0, 0),
  });

  const [activePreset, setActivePreset] = useState("isometric");
  const [showPanels, setShowPanels] = useState(true);
  const [showStructures, setShowStructures] = useState(true);
  const [showObstacles, setShowObstacles] = useState(true);
  const [showWalkways, setShowWalkways] = useState(true);
  const [showCompass, setShowCompass] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef(null);

  // Expose snapshot capture function to parent
  useImperativeHandle(ref, () => ({
    getSnapshotDataUrl: () => {
      if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return null;
      rendererRef.current.render(sceneRef.current, cameraRef.current);
      return rendererRef.current.domElement.toDataURL("image/png");
    },
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

  // Set Camera View Presets
  const setCameraPreset = useCallback(
    (preset) => {
      setActivePreset(preset);
      const ctr = controlsRef.current;
      if (preset === "top") {
        ctr.spherical.phi = 0.05; // almost vertical top-down
        ctr.spherical.theta = 0;
      } else if (preset === "front") {
        ctr.spherical.phi = Math.PI / 2.2;
        ctr.spherical.theta = 0;
      } else if (preset === "side") {
        ctr.spherical.phi = Math.PI / 2.2;
        ctr.spherical.theta = Math.PI / 2;
      } else if (preset === "isometric") {
        ctr.spherical.phi = Math.PI / 3.2;
        ctr.spherical.theta = Math.PI / 4;
      }
      updateCameraPosition();
    },
    [updateCameraPosition]
  );

  const resetCamera = useCallback(() => {
    controlsRef.current.spherical = { radius: 28, phi: Math.PI / 3.2, theta: Math.PI / 4 };
    controlsRef.current.target.set(0, 0, 0);
    setCameraPreset("isometric");
  }, [setCameraPreset]);

  // Initialize Three.js Scene
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 450;

    // 1. Scene & Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9); // Slate-100 clean background
    sceneRef.current = scene;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 500);
    cameraRef.current = camera;
    updateCameraPosition();

    // 3. Lighting (Sun + Sky Ambient)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfffaed, 1.4);
    sunLight.position.set(20, 45, 25);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 150;
    const d = 30;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0x90b0e0, 0.4);
    fillLight.position.set(-20, 20, -20);
    scene.add(fillLight);

    // Ground Grid Helper
    const gridHelper = new THREE.GridHelper(60, 60, 0x94a3b8, 0xe2e8f0);
    gridHelper.position.y = -0.05;
    scene.add(gridHelper);

    // 4. Mouse / Touch Orbit & Pan Controls
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
        // Pan Target
        const panSpeed = ctr.spherical.radius * 0.0015;
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
        const up = new THREE.Vector3().crossVectors(right, forward).normalize();

        ctr.target.addScaledVector(right, -deltaX * panSpeed);
        ctr.target.addScaledVector(up, deltaY * panSpeed);
      } else if (ctr.isDragging) {
        // Rotate Orbit
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
      controlsRef.current.spherical.radius = Math.max(4, Math.min(120, controlsRef.current.spherical.radius * zoomFactor));
      updateCameraPosition();
    };

    const onContextMenu = (e) => e.preventDefault();

    dom.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    dom.addEventListener("wheel", onWheel, { passive: false });
    dom.addEventListener("contextmenu", onContextMenu);

    // 5. Resize Handler
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    // 6. Animation Loop
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

  // Re-build 3D Rooftop Scene Objects on Prop Changes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove previous dynamic meshes (keep lights and ground grid)
    const toRemove = [];
    scene.children.forEach((child) => {
      if (child.name === "dynamic_roof_object") {
        toRemove.push(child);
      }
    });
    toRemove.forEach((c) => scene.remove(c));

    const rootGroup = new THREE.Group();
    rootGroup.name = "dynamic_roof_object";

    // 1. Build Extruded Roof Slab
    if (roofPolygon && roofPolygon.length >= 3) {
      const shape = new THREE.Shape();
      roofPolygon.forEach((pt, idx) => {
        // In 3D space: x = pt.x, z = -pt.y (standard top-down mapping)
        if (idx === 0) shape.moveTo(pt.x, -pt.y);
        else shape.lineTo(pt.x, -pt.y);
      });
      shape.closePath();

      const extrudeSettings = {
        steps: 1,
        depth: 0.35, // 35cm concrete roof slab thickness
        bevelEnabled: true,
        bevelThickness: 0.08,
        bevelSize: 0.08,
        bevelSegments: 2,
      };

      const roofGeom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      roofGeom.rotateX(Math.PI / 2); // Rotate to lay flat horizontally

      // Realistic Concrete Rooftop Material
      const roofMat = new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        roughness: 0.85,
        metalness: 0.1,
      });

      const roofMesh = new THREE.Mesh(roofGeom, roofMat);
      roofMesh.position.y = 0;
      roofMesh.receiveShadow = true;
      rootGroup.add(roofMesh);

      // Add parapet edge outline
      const edgeGeom = new THREE.EdgesGeometry(roofGeom);
      const edgeMat = new THREE.LineBasicMaterial({ color: 0x94a3b8, linewidth: 1.5 });
      const edgeLines = new THREE.LineSegments(edgeGeom, edgeMat);
      roofMesh.add(edgeLines);
    }

    // 2. Build 3D Solar Panels and Underneath Mounting Structures
    if (showPanels && panels && panels.length > 0) {
      const isElevated = structureType.toLowerCase().includes("elevated");
      const baseClearance = isElevated ? Number(mountingHeightM || 1.8) : 0.18;
      const tiltRad = THREE.MathUtils.degToRad(Number(tiltAngle || 15));

      // Panel Geometry & Realistic Solar Cell Materials
      const panelGeom = new THREE.BoxGeometry(1, 0.038, 1); // Unit box scaled per panel

      // Panel Face Texture: Deep Blue / Monocrystalline Anti-Reflective Silicon
      const panelTopMat = new THREE.MeshStandardMaterial({
        color: 0x0f2b59,
        roughness: 0.2,
        metalness: 0.65,
      });

      // Metallic Aluminium Silver Frame
      const frameMat = new THREE.MeshStandardMaterial({
        color: 0xcfd8dc,
        roughness: 0.35,
        metalness: 0.85,
      });

      const panelMaterials = [
        frameMat, // Right
        frameMat, // Left
        panelTopMat, // Top (solar cells)
        frameMat, // Bottom
        frameMat, // Front
        frameMat, // Back
      ];

      // Aluminium Mounting Rails Material
      const railMat = new THREE.MeshStandardMaterial({
        color: 0x90a4ae,
        roughness: 0.4,
        metalness: 0.8,
      });

      // Leg / Column Material
      const legMat = new THREE.MeshStandardMaterial({
        color: 0x64748b,
        roughness: 0.45,
        metalness: 0.75,
      });

      panels.forEach((p) => {
        if (p.hidden) return;

        const pw = p.width || 1.134;
        const pl = p.height || 2.278;

        const panelMesh = new THREE.Mesh(panelGeom, panelMaterials);
        panelMesh.scale.set(pw, 1, pl);
        panelMesh.castShadow = true;
        panelMesh.receiveShadow = true;

        // Position: sitting on top of the mounting structure
        const px = p.x;
        const pz = -p.y;
        const py = baseClearance + (pl / 2) * Math.sin(tiltRad) + 0.04;

        panelMesh.position.set(px, py, pz);
        // Tilt around X axis (facing South)
        panelMesh.rotation.x = -tiltRad;

        rootGroup.add(panelMesh);

        // Add 3D Mounting Structure Rails and Support Legs
        if (showStructures) {
          // 2 Longitude Rails under each panel row
          const railGeom = new THREE.BoxGeometry(0.045, 0.06, pl * 1.05);
          const rail1 = new THREE.Mesh(railGeom, railMat);
          rail1.position.set(px - pw * 0.28, py - 0.04, pz);
          rail1.rotation.x = -tiltRad;
          rail1.castShadow = true;
          rootGroup.add(rail1);

          const rail2 = new THREE.Mesh(railGeom, railMat);
          rail2.position.set(px + pw * 0.28, py - 0.04, pz);
          rail2.rotation.x = -tiltRad;
          rail2.castShadow = true;
          rootGroup.add(rail2);

          // Support Columns/Legs extending down to roof surface
          if (isElevated || baseClearance > 0.3) {
            const frontLegH = baseClearance;
            const backLegH = baseClearance + pl * Math.sin(tiltRad);

            // Front Leg
            const frontLegGeom = new THREE.CylinderGeometry(0.025, 0.025, frontLegH, 8);
            const frontLeg = new THREE.Mesh(frontLegGeom, legMat);
            frontLeg.position.set(px, frontLegH / 2, pz + (pl / 2) * Math.cos(tiltRad) * 0.8);
            frontLeg.castShadow = true;
            rootGroup.add(frontLeg);

            // Back Leg
            const backLegGeom = new THREE.CylinderGeometry(0.025, 0.025, backLegH, 8);
            const backLeg = new THREE.Mesh(backLegGeom, legMat);
            backLeg.position.set(px, backLegH / 2, pz - (pl / 2) * Math.cos(tiltRad) * 0.8);
            backLeg.castShadow = true;
            rootGroup.add(backLeg);
          }
        }
      });
    }

    // 3. Build 3D Obstacles (Water tanks, Staircase rooms, AC units, etc.)
    if (showObstacles && obstacles && obstacles.length > 0) {
      obstacles.forEach((obs) => {
        const ox = Number(obs.x || 0);
        const oz = -Number(obs.y || 0);
        const ol = Number(obs.length || obs.width_m || 1.5);
        const ow = Number(obs.width || obs.height_m || 1.5);
        const oh = Number(obs.height || 1.2);
        const type = obs.type || "water_tank";

        if (type === "water_tank") {
          // Cylindrical Water Tank with Stand
          const tankRadius = Math.min(ol, ow) / 2;
          const tankGeom = new THREE.CylinderGeometry(tankRadius, tankRadius, oh, 16);
          const tankMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.4, metalness: 0.2 });
          const tankMesh = new THREE.Mesh(tankGeom, tankMat);
          tankMesh.position.set(ox, oh / 2, oz);
          tankMesh.castShadow = true;
          tankMesh.receiveShadow = true;
          rootGroup.add(tankMesh);

          // Top Lid
          const lidGeom = new THREE.CylinderGeometry(tankRadius * 0.5, tankRadius * 0.55, 0.12, 16);
          const lidMat = new THREE.MeshStandardMaterial({ color: 0x1e40af, roughness: 0.5 });
          const lidMesh = new THREE.Mesh(lidGeom, lidMat);
          lidMesh.position.set(ox, oh + 0.06, oz);
          rootGroup.add(lidMesh);
        } else if (type === "staircase") {
          // Staircase Tower Room
          const stairGeom = new THREE.BoxGeometry(ol, oh, ow);
          const stairMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.8 });
          const stairMesh = new THREE.Mesh(stairGeom, stairMat);
          stairMesh.position.set(ox, oh / 2, oz);
          stairMesh.castShadow = true;
          stairMesh.receiveShadow = true;
          rootGroup.add(stairMesh);

          // Door indicator
          const doorGeom = new THREE.PlaneGeometry(0.8, 1.8);
          const doorMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 });
          const doorMesh = new THREE.Mesh(doorGeom, doorMat);
          doorMesh.position.set(ox, 0.9, oz + ow / 2 + 0.01);
          rootGroup.add(doorMesh);
        } else if (type === "ac_unit") {
          // AC Outdoor Condenser
          const acGeom = new THREE.BoxGeometry(ol, oh, ow);
          const acMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.4, metalness: 0.5 });
          const acMesh = new THREE.Mesh(acGeom, acMat);
          acMesh.position.set(ox, oh / 2, oz);
          acMesh.castShadow = true;
          acMesh.receiveShadow = true;
          rootGroup.add(acMesh);
        } else {
          // Generic Cuboid Obstruction
          const boxGeom = new THREE.BoxGeometry(ol, oh, ow);
          const boxMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.7 });
          const boxMesh = new THREE.Mesh(boxGeom, boxMat);
          boxMesh.position.set(ox, oh / 2, oz);
          boxMesh.castShadow = true;
          boxMesh.receiveShadow = true;
          rootGroup.add(boxMesh);
        }
      });
    }

    // 4. Build 3D Walkways
    if (showWalkways && walkways && walkways.length > 0) {
      const walkMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        roughness: 0.6,
        metalness: 0.3,
      });

      walkways.forEach((w) => {
        const ww = Number(w.width || 0.6);
        const wl = Number(w.length || 3.0);
        const wx = Number(w.x || 0);
        const wz = -Number(w.y || 0);

        const walkGeom = new THREE.BoxGeometry(ww, 0.05, wl);
        const walkMesh = new THREE.Mesh(walkGeom, walkMat);
        walkMesh.position.set(wx, 0.03, wz);
        walkMesh.receiveShadow = true;
        rootGroup.add(walkMesh);
      });
    }

    // 5. 3D Compass Indicator (North Arrow)
    if (showCompass) {
      const compassGroup = new THREE.Group();
      compassGroup.position.set(-12, 0.05, -12);

      // North Red Arrow
      const arrowCone = new THREE.ConeGeometry(0.4, 1.2, 12);
      const redMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
      const northArrow = new THREE.Mesh(arrowCone, redMat);
      northArrow.rotation.x = -Math.PI / 2;
      northArrow.position.z = -0.8;
      compassGroup.add(northArrow);

      // South White/Blue Cone
      const southCone = new THREE.ConeGeometry(0.3, 0.8, 12);
      const blueMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6 });
      const southArrow = new THREE.Mesh(southCone, blueMat);
      southArrow.rotation.x = Math.PI / 2;
      southArrow.position.z = 0.6;
      compassGroup.add(southArrow);

      // Center Ring
      const ringGeom = new THREE.RingGeometry(1.2, 1.35, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8, side: THREE.DoubleSide });
      const ringMesh = new THREE.Mesh(ringGeom, ringMat);
      ringMesh.rotation.x = Math.PI / 2;
      compassGroup.add(ringMesh);

      rootGroup.add(compassGroup);
    }

    scene.add(rootGroup);
  }, [
    roofPolygon,
    panels,
    obstacles,
    walkways,
    structureType,
    tiltAngle,
    azimuthAngle,
    mountingHeightM,
    roofTilt,
    showPanels,
    showStructures,
    showObstacles,
    showWalkways,
    showCompass,
  ]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full rounded-2xl overflow-hidden bg-slate-900 border border-slate-700 shadow-xl select-none ${
        isFullscreen ? "fixed inset-0 z-50 rounded-none h-screen" : "h-[560px]"
      }`}
    >
      {/* 3D WebGL Canvas Mount */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Top Floating Control Bar */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none gap-2">
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
            Top
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
            onClick={resetCamera}
            className="h-7 w-7 p-0 rounded-lg text-slate-400 hover:text-white"
            title="Reset Camera"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Layer Visibility Toggles */}
        <div className="flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md p-1.5 rounded-xl border border-slate-700/80 shadow-lg pointer-events-auto">
          <Button
            size="sm"
            variant={showPanels ? "secondary" : "ghost"}
            onClick={() => setShowPanels(!showPanels)}
            className="h-7 text-[11px] px-2 rounded-lg gap-1"
          >
            <Sun className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Panels</span> ({panels.filter((p) => !p.hidden).length})
          </Button>
          <Button
            size="sm"
            variant={showStructures ? "secondary" : "ghost"}
            onClick={() => setShowStructures(!showStructures)}
            className="h-7 text-[11px] px-2 rounded-lg gap-1"
          >
            <Layers className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">Structure</span>
          </Button>
          <Button
            size="sm"
            variant={showObstacles ? "secondary" : "ghost"}
            onClick={() => setShowObstacles(!showObstacles)}
            className="h-7 text-[11px] px-2 rounded-lg gap-1"
          >
            <Box className="w-3.5 h-3.5 text-red-400" />
            <span className="hidden sm:inline">Obstacles</span> ({obstacles.length})
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

      {/* Bottom Live Legend & Engineering Badge */}
      <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between pointer-events-none gap-2">
        <div className="bg-slate-900/90 backdrop-blur-md px-3 py-2 rounded-xl border border-slate-700/80 shadow-lg pointer-events-auto flex items-center gap-3 text-xs text-slate-300">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-xs" />
            <span>Structure: <b>{structureType.toUpperCase()} ({mountingHeightM}m)</b></span>
          </div>
          <span className="text-slate-600">|</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-xs" />
            <span>Tilt: <b>{tiltAngle}°</b></span>
          </div>
          <span className="text-slate-600">|</span>
          <div className="flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-red-400" />
            <span>Azimuth: <b>{azimuthAngle}° (South)</b></span>
          </div>
        </div>

        <div className="bg-amber-950/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-amber-800/60 shadow-lg text-[10.5px] text-amber-200 pointer-events-auto flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>Preliminary 3D Model — Subject to physical survey</span>
        </div>
      </div>
    </div>
  );
});

export default Rooftop3DViewer;
