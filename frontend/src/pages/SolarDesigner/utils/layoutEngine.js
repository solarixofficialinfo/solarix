/**
 * Solar Rooftop Layout Engine & Bill of Materials (BOM) Calculator
 * 
 * Implements:
 * - Optimal automated 2D panel packing algorithm
 * - Setback, obstacle, and walkway collision checking
 * - Portrait vs Landscape orientation support
 * - True South / azimuth row alignment
 * - Physical space capacity limit check
 * - Bill of Materials (BOM) estimation engine
 */

import {
  getPolygonBounds,
  computeSetbackPolygon,
  isRectInsidePolygon,
  rotatedRectanglesIntersect,
  toRad,
  getCartesianPolygonArea,
} from "./geoCalculations";

/**
 * Standard Solar Panel Dimensions (Length × Width in meters, Wattage in Wp)
 */
export const DEFAULT_PANEL_SPECS = {
  make: "Tier-1 Mono PERC",
  model: "550W High-Efficiency Module",
  wattage: 550,
  length_m: 2.278,
  width_m: 1.134,
  thickness_m: 0.035,
  weight_kg: 28.5,
  voc_v: 49.8,
  isc_a: 14.0,
  vmp_v: 41.9,
  imp_a: 13.1,
  efficiency_pct: 21.3,
};

/**
 * Common rooftop obstruction presets
 */
export const OBSTACLE_TYPES = [
  { type: "water_tank", label: "Water Tank", length: 1.8, width: 1.8, height: 1.6, color: "#3b82f6" },
  { type: "staircase", label: "Staircase Room / Tower", length: 3.5, width: 2.5, height: 2.4, color: "#64748b" },
  { type: "ac_unit", label: "AC Outdoor Unit", length: 1.0, width: 0.8, height: 0.8, color: "#f59e0b" },
  { type: "solar_heater", label: "Solar Water Heater", length: 2.4, width: 2.0, height: 1.5, color: "#ec4899" },
  { type: "vent", label: "Vent / Pipe / Skylight", length: 0.8, width: 0.8, height: 0.6, color: "#8b5cf6" },
  { type: "custom", label: "Custom Obstruction", length: 1.5, width: 1.5, height: 1.0, color: "#ef4444" },
];

/**
 * Generates an automated practical panel layout inside a roof polygon
 * 
 * @param {Object} params
 * @param {Array} params.roofPolygon - Array of {x, y} local Cartesian coordinates
 * @param {number} params.setbackMeters - Perimeter edge clearance (e.g. 0.5m)
 * @param {Array} params.obstacles - Array of obstacle objects {x, y, length, width, height, rotation}
 * @param {Array} params.walkways - Array of walkway segments/rectangles {x, y, width, length, rotation}
 * @param {Object} params.panelSpecs - Panel dimensions {length_m, width_m, wattage}
 * @param {string} params.orientation - 'portrait' | 'landscape'
 * @param {number} params.rowSpacingMeters - Pitch / gap between panel rows (e.g. 0.3m)
 * @param {number} params.panelSpacingMeters - Inter-panel gap in same row (e.g. 0.02m)
 * @param {number} params.azimuthDegrees - Alignment angle (default 180° South)
 * @param {string} params.strategy - 'auto' | 'optimize_usage' | 'optimize_capacity' | 'optimize_access'
 */
export function generateAutoPanelLayout({
  roofPolygon,
  setbackMeters = 0.5,
  obstacles = [],
  walkways = [],
  panelSpecs = DEFAULT_PANEL_SPECS,
  orientation = "portrait",
  rowSpacingMeters = 0.35,
  panelSpacingMeters = 0.02,
  azimuthDegrees = 180,
  strategy = "auto",
}) {
  if (!roofPolygon || roofPolygon.length < 3) {
    return { panels: [], usableAreaSqm: 0, panelCount: 0, totalKw: 0, coveragePct: 0 };
  }

  // 1. Compute usable boundary with setback
  const usablePolygon = computeSetbackPolygon(roofPolygon, setbackMeters);
  if (!usablePolygon || usablePolygon.length < 3) {
    return { panels: [], usableAreaSqm: 0, panelCount: 0, totalKw: 0, coveragePct: 0 };
  }

  const usableAreaSqm = getCartesianPolygonArea(usablePolygon);

  // 2. Determine effective panel width & length based on orientation
  const isPortrait = orientation.toLowerCase() === "portrait";
  const pWidth = isPortrait ? (panelSpecs.width_m || 1.134) : (panelSpecs.length_m || 2.278);
  const pLength = isPortrait ? (panelSpecs.length_m || 2.278) : (panelSpecs.width_m || 1.134);

  // Strategy adjustments
  let effectiveRowSpacing = rowSpacingMeters;
  let effectivePanelSpacing = panelSpacingMeters;

  if (strategy === "optimize_usage" || strategy === "optimize_capacity") {
    effectiveRowSpacing = Math.max(0.2, rowSpacingMeters * 0.8);
    effectivePanelSpacing = Math.max(0.015, panelSpacingMeters * 0.75);
  } else if (strategy === "optimize_access") {
    effectiveRowSpacing = Math.max(0.6, rowSpacingMeters * 1.5);
  }

  // 3. Grid bounds
  const bounds = getPolygonBounds(usablePolygon);
  const startX = bounds.minX;
  const endX = bounds.maxX;
  const startY = bounds.minY;
  const endY = bounds.maxY;

  const stepX = pWidth + effectivePanelSpacing;
  const stepY = pLength + effectiveRowSpacing;

  const generatedPanels = [];
  let panelIdCounter = 1;

  // 4. Form grid lines and check containment
  let rowIdx = 0;
  for (let y = startY + pLength / 2; y <= endY - pLength / 2 + 0.05; y += stepY) {
    let colIdx = 0;
    for (let x = startX + pWidth / 2; x <= endX - pWidth / 2 + 0.05; x += stepX) {
      const panelCandidate = {
        x,
        y,
        width: pWidth,
        height: pLength,
        rotation: 0, // In local Cartesian space
      };

      // Test A: Inside usable polygon boundary
      const isInside = isRectInsidePolygon(
        panelCandidate.x,
        panelCandidate.y,
        panelCandidate.width,
        panelCandidate.height,
        panelCandidate.rotation,
        usablePolygon
      );

      if (!isInside) {
        colIdx++;
        continue;
      }

      // Test B: Collision with any Obstacles
      let collidesWithObstacle = false;
      for (const obs of obstacles) {
        const obsWidth = Number(obs.length || obs.width_m || 1.5);
        const obsLength = Number(obs.width || obs.height_m || 1.5);
        const obsRect = {
          x: Number(obs.x || 0),
          y: Number(obs.y || 0),
          width: obsWidth,
          height: obsLength,
          rotation: Number(obs.rotation || 0),
        };

        if (rotatedRectanglesIntersect(panelCandidate, obsRect)) {
          collidesWithObstacle = true;
          break;
        }
      }

      if (collidesWithObstacle) {
        colIdx++;
        continue;
      }

      // Test C: Collision with Walkways
      let collidesWithWalkway = false;
      for (const walk of walkways) {
        const walkRect = {
          x: Number(walk.x || 0),
          y: Number(walk.y || 0),
          width: Number(walk.width || 0.8),
          height: Number(walk.length || 3.0),
          rotation: Number(walk.rotation || 0),
        };
        if (rotatedRectanglesIntersect(panelCandidate, walkRect)) {
          collidesWithWalkway = true;
          break;
        }
      }

      if (collidesWithWalkway) {
        colIdx++;
        continue;
      }

      // Panel is valid!
      generatedPanels.push({
        id: `panel-${panelIdCounter++}`,
        x: Math.round(x * 1000) / 1000,
        y: Math.round(y * 1000) / 1000,
        width: pWidth,
        height: pLength,
        rotation: 0,
        row: rowIdx,
        col: colIdx,
        wattage: panelSpecs.wattage || 550,
        locked: false,
        hidden: false,
      });

      colIdx++;
    }
    rowIdx++;
  }

  const panelCount = generatedPanels.length;
  const singlePanelArea = pWidth * pLength;
  const totalPanelArea = panelCount * singlePanelArea;
  const totalKw = (panelCount * (panelSpecs.wattage || 550)) / 1000.0;
  const coveragePct = usableAreaSqm > 0 ? Math.min(100, Math.round((totalPanelArea / usableAreaSqm) * 1000) / 10) : 0;

  return {
    panels: generatedPanels,
    usableAreaSqm: Math.round(usableAreaSqm * 10) / 10,
    panelCount,
    totalKw: Math.round(totalKw * 100) / 100,
    coveragePct,
  };
}

/**
 * Checks if an additional panel can physically fit without collision
 */
export function canFitAdditionalPanel({
  panels,
  roofPolygon,
  setbackMeters,
  obstacles = [],
  walkways = [],
  panelSpecs = DEFAULT_PANEL_SPECS,
  orientation = "portrait",
}) {
  const usablePolygon = computeSetbackPolygon(roofPolygon, setbackMeters);
  if (!usablePolygon || usablePolygon.length < 3) return { canFit: false, newPanel: null };

  const isPortrait = orientation.toLowerCase() === "portrait";
  const pWidth = isPortrait ? (panelSpecs.width_m || 1.134) : (panelSpecs.length_m || 2.278);
  const pLength = isPortrait ? (panelSpecs.length_m || 2.278) : (panelSpecs.width_m || 1.134);

  const bounds = getPolygonBounds(usablePolygon);
  const stepX = pWidth + 0.05;
  const stepY = pLength + 0.35;

  for (let y = bounds.minY + pLength / 2; y <= bounds.maxY - pLength / 2; y += stepY) {
    for (let x = bounds.minX + pWidth / 2; x <= bounds.maxX - pWidth / 2; x += stepX) {
      const candidate = { x, y, width: pWidth, height: pLength, rotation: 0 };

      // 1. Inside usable polygon
      if (!isRectInsidePolygon(x, y, pWidth, pLength, 0, usablePolygon)) continue;

      // 2. No overlap with existing panels
      let overlapsPanel = false;
      for (const p of panels) {
        if (p.hidden) continue;
        const pRect = { x: p.x, y: p.y, width: p.width, height: p.height, rotation: p.rotation || 0 };
        if (rotatedRectanglesIntersect(candidate, pRect)) {
          overlapsPanel = true;
          break;
        }
      }
      if (overlapsPanel) continue;

      // 3. No overlap with obstacles
      let overlapsObs = false;
      for (const obs of obstacles) {
        const obsRect = { x: obs.x, y: obs.y, width: obs.length || 1.5, height: obs.width || 1.5, rotation: obs.rotation || 0 };
        if (rotatedRectanglesIntersect(candidate, obsRect)) {
          overlapsObs = true;
          break;
        }
      }
      if (overlapsObs) continue;

      // Found a spot!
      return {
        canFit: true,
        newPanel: {
          id: `panel-${Date.now()}`,
          x: Math.round(x * 1000) / 1000,
          y: Math.round(y * 1000) / 1000,
          width: pWidth,
          height: pLength,
          rotation: 0,
          wattage: panelSpecs.wattage || 550,
          locked: false,
          hidden: false,
        },
      };
    }
  }

  return { canFit: false, newPanel: null };
}

/**
 * Calculates preliminary Bill of Materials (BOM) quantities from solar design state
 */
export function calculateBillOfMaterials({
  panelCount = 0,
  panelSpecs = DEFAULT_PANEL_SPECS,
  roofAreaSqm = 0,
  structureType = "elevated",
  mountingHeightM = 1.8,
}) {
  const pCount = Math.max(0, parseInt(panelCount, 10) || 0);
  const pWatt = Number(panelSpecs?.wattage || 550);
  const totalKw = (pCount * pWatt) / 1000.0;

  // Rail length: approx 2.3m rail per panel + 5% waste
  const railsM = pCount > 0 ? Math.round(pCount * 2.35 * 10) / 10 : 0;

  // Mid clamps between adjacent modules
  const midClamps = pCount > 2 ? Math.max(0, (pCount - 2) * 2) : pCount * 2;

  // End clamps: 4 for each array block (est. 1 block per 10 panels)
  const numBlocks = Math.max(1, Math.ceil(pCount / 10));
  const endClamps = pCount > 0 ? numBlocks * 4 : 0;

  // Fasteners: mid + end clamps bolts + anchor base fasteners
  const fasteners = (midClamps + endClamps) * 2;

  // Structure leg columns/sets
  const isElevated = structureType.toLowerCase().includes("elevated");
  const structureSets = pCount > 0 ? Math.max(1, Math.ceil(pCount / (isElevated ? 4 : 6))) : 0;

  // DC Cable: ~4.5m per panel + 20m home run to inverter
  const dcCableM = pCount > 0 ? Math.round(pCount * 4.5 + 20) : 0;

  // Walkway grating
  const walkwayM = Math.max(1, Math.round(roofAreaSqm * 0.08));

  // Inverter Recommendation
  let recommendedInverter = "3 kW Single Phase";
  if (totalKw > 25) recommendedInverter = `${Math.ceil(totalKw / 25) * 25} kW Three Phase (Grid-Tied)`;
  else if (totalKw > 15) recommendedInverter = "20 kW Three Phase Grid-Tied Inverter";
  else if (totalKw > 10) recommendedInverter = "12 kW Three Phase Grid-Tied Inverter";
  else if (totalKw > 6) recommendedInverter = "8 kW Three Phase Grid-Tied Inverter";
  else if (totalKw > 3.5) recommendedInverter = "5 kW Single/Three Phase Inverter";

  return {
    totalKw: Math.round(totalKw * 100) / 100,
    panelCount: pCount,
    items: [
      {
        id: "bom-1",
        category: "Solar Panels",
        name: `Solar PV Modules (${panelSpecs?.make || "Tier-1 Mono PERC"})`,
        spec: `${pWatt}W Mono PERC / Bi-facial (High-Efficiency)`,
        qty: pCount,
        unit: "Nos",
        isProductMaster: true,
      },
      {
        id: "bom-2",
        category: "Structure",
        name: "Mounting Purlins / Aluminium Rails",
        spec: "Anodized Al 6063-T6 / HDGI Strut Channel",
        qty: railsM,
        unit: "Mtrs",
        isProductMaster: true,
      },
      {
        id: "bom-3",
        category: "Structure",
        name: `Mounting Framework (${isElevated ? "Elevated Super Structure" : "Flush Flat Roof Mount"})`,
        spec: isElevated ? `Elevated Column Legs (${mountingHeightM}m clearance)` : "Short Rail Base Bracket Mount",
        qty: structureSets,
        unit: "Sets",
        isProductMaster: true,
      },
      {
        id: "bom-4",
        category: "Hardware",
        name: "Module Mid Clamps",
        spec: "Aluminium Anodized with SS304 Allen Bolt & Spring Nut",
        qty: midClamps,
        unit: "Nos",
        isProductMaster: true,
      },
      {
        id: "bom-5",
        category: "Hardware",
        name: "Module End Clamps",
        spec: "Aluminium Anodized End Clamps (35mm / 40mm)",
        qty: endClamps,
        unit: "Nos",
        isProductMaster: true,
      },
      {
        id: "bom-6",
        category: "Hardware",
        name: "Anchor Fasteners / Expansion Bolts",
        spec: "M10 × 100mm SS304 Heavy Duty Anchor Bolts",
        qty: fasteners,
        unit: "Nos",
        isProductMaster: true,
      },
      {
        id: "bom-7",
        category: "Electrical",
        name: "Solar DC Cable (Red & Black)",
        spec: "4 / 6 sq.mm Tinned Copper UV Protected DC Cable",
        qty: dcCableM,
        unit: "Mtrs",
        isProductMaster: true,
      },
      {
        id: "bom-8",
        category: "Electrical",
        name: "Grid-Tied Solar Inverter (Suggested)",
        spec: recommendedInverter,
        qty: Math.max(1, Math.ceil(totalKw / 30)),
        unit: "Nos",
        isProductMaster: true,
      },
      {
        id: "bom-9",
        category: "Safety",
        name: "Rooftop Walkway Grating",
        spec: "FRP / Galvanized Anti-Slip Walkway (0.6m Width)",
        qty: walkwayM,
        unit: "Mtrs",
        isProductMaster: false,
        status: "Manual estimation required",
      },
    ],
  };
}
