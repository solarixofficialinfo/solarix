/**
 * Solar Rooftop Layout Engine & Bill of Materials (BOM) Calculator
 * 
 * Implements:
 * - Optimal automated 2D panel dense packing algorithm with multi-offset search
 * - Setback, obstacle, and walkway collision checking
 * - Portrait vs Landscape orientation support with true Azimuth alignment
 * - Single-panel manual placement validator & additional space capacity finder
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
 * Packs panels on a grid given orientation and grid shift offset
 */
function packPanelsOnGrid({
  usablePolygon,
  obstacles,
  walkways,
  pWidth,
  pLength,
  stepX,
  stepY,
  offsetX,
  offsetY,
  azimuthDegrees,
  wattage,
}) {
  const bounds = getPolygonBounds(usablePolygon);
  const panels = [];
  let panelIdCounter = 1;
  let rowIdx = 0;

  const startY = bounds.minY + offsetY + pLength / 2;
  const startX = bounds.minX + offsetX + pWidth / 2;

  for (let y = startY; y <= bounds.maxY - pLength / 2 + 0.05; y += stepY) {
    let colIdx = 0;
    for (let x = startX; x <= bounds.maxX - pWidth / 2 + 0.05; x += stepX) {
      const candidate = {
        x: Math.round(x * 1000) / 1000,
        y: Math.round(y * 1000) / 1000,
        width: pWidth,
        height: pLength,
        rotation: 0,
      };

      // 1. Must be completely inside the usable setback polygon
      if (!isRectInsidePolygon(candidate.x, candidate.y, candidate.width, candidate.height, candidate.rotation, usablePolygon)) {
        colIdx++;
        continue;
      }

      // 2. Must not collide with any obstacle
      let collidesWithObstacle = false;
      for (const obs of obstacles) {
        const obsRect = {
          x: Number(obs.x || 0),
          y: Number(obs.y || 0),
          width: Number(obs.length || 1.8),
          height: Number(obs.width || 1.8),
          rotation: Number(obs.rotation || 0),
        };
        if (rotatedRectanglesIntersect(candidate, obsRect)) {
          collidesWithObstacle = true;
          break;
        }
      }
      if (collidesWithObstacle) {
        colIdx++;
        continue;
      }

      // 3. Must not collide with any walkway
      let collidesWithWalkway = false;
      for (const walk of walkways) {
        const walkRect = {
          x: Number(walk.x || 0),
          y: Number(walk.y || 0),
          width: Number(walk.width || 0.8),
          height: Number(walk.length || 3.0),
          rotation: Number(walk.rotation || 0),
        };
        if (rotatedRectanglesIntersect(candidate, walkRect)) {
          collidesWithWalkway = true;
          break;
        }
      }
      if (collidesWithWalkway) {
        colIdx++;
        continue;
      }

      // Add valid panel
      panels.push({
        id: `panel-${panelIdCounter++}`,
        x: candidate.x,
        y: candidate.y,
        width: pWidth,
        height: pLength,
        rotation: 0,
        azimuth: azimuthDegrees,
        row: rowIdx,
        col: colIdx,
        wattage,
        locked: false,
        hidden: false,
      });

      colIdx++;
    }
    rowIdx++;
  }

  return panels;
}

/**
 * Generates an optimal automated panel layout inside a roof polygon
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
    return {
      panels: [],
      usableAreaSqm: 0,
      panelCount: 0,
      totalKw: 0,
      coveragePct: 0,
      coveredAreaSqm: 0,
      remainingAreaSqm: 0,
    };
  }

  // 1. Compute usable boundary with setback
  const usablePolygon = computeSetbackPolygon(roofPolygon, setbackMeters);
  const usableAreaSqm = Math.round(getCartesianPolygonArea(usablePolygon) * 10) / 10;
  if (usableAreaSqm <= 0.5) {
    return {
      panels: [],
      usableAreaSqm: 0,
      panelCount: 0,
      totalKw: 0,
      coveragePct: 0,
      coveredAreaSqm: 0,
      remainingAreaSqm: 0,
    };
  }

  const wattage = Number(panelSpecs.wattage || 550);
  const stdLength = Number(panelSpecs.length_m || 2.278);
  const stdWidth = Number(panelSpecs.width_m || 1.134);

  // Strategy adjustments
  let effectiveRowSpacing = rowSpacingMeters;
  let effectivePanelSpacing = panelSpacingMeters;
  if (strategy === "optimize_usage" || strategy === "optimize_capacity") {
    effectiveRowSpacing = Math.max(0.2, rowSpacingMeters * 0.85);
    effectivePanelSpacing = Math.max(0.015, panelSpacingMeters * 0.75);
  } else if (strategy === "optimize_access") {
    effectiveRowSpacing = Math.max(0.6, rowSpacingMeters * 1.5);
  }

  // Orientations to evaluate
  const orientationsToTry = [];
  if (orientation === "landscape") {
    orientationsToTry.push({ pWidth: stdLength, pLength: stdWidth, name: "landscape" });
  } else if (orientation === "portrait") {
    orientationsToTry.push({ pWidth: stdWidth, pLength: stdLength, name: "portrait" });
  } else {
    // Auto: try portrait first, then landscape
    orientationsToTry.push({ pWidth: stdWidth, pLength: stdLength, name: "portrait" });
    orientationsToTry.push({ pWidth: stdLength, pLength: stdWidth, name: "landscape" });
  }

  let bestPanels = [];

  for (const orient of orientationsToTry) {
    const { pWidth, pLength } = orient;
    const stepX = pWidth + effectivePanelSpacing;
    const stepY = pLength + effectiveRowSpacing;

    // Multi-phase grid shift search to maximize panel density
    const shiftFractions = [0, 0.25, 0.5, 0.75];

    for (const fx of shiftFractions) {
      for (const fy of shiftFractions) {
        const candidatePanels = packPanelsOnGrid({
          usablePolygon,
          obstacles,
          walkways,
          pWidth,
          pLength,
          stepX,
          stepY,
          offsetX: fx * stepX,
          offsetY: fy * stepY,
          azimuthDegrees,
          wattage,
        });

        if (candidatePanels.length > bestPanels.length) {
          bestPanels = candidatePanels;
        }
      }
    }
  }

  const panelCount = bestPanels.length;
  const singlePanelArea = stdWidth * stdLength;
  const coveredAreaSqm = Math.round(panelCount * singlePanelArea * 10) / 10;
  const totalKw = Math.round(((panelCount * wattage) / 1000.0) * 100) / 100;
  const coveragePct =
    usableAreaSqm > 0 ? Math.min(100, Math.round((coveredAreaSqm / usableAreaSqm) * 1000) / 10) : 0;
  const remainingAreaSqm = Math.max(0, Math.round((usableAreaSqm - coveredAreaSqm) * 10) / 10);

  return {
    panels: bestPanels,
    usableAreaSqm,
    panelCount,
    totalKw,
    coveragePct,
    coveredAreaSqm,
    remainingAreaSqm,
  };
}

/**
 * Validates whether a panel can be placed or moved to candidate (x, y)
 */
export function validatePanelPlacement({
  candidate,
  roofPolygon,
  setbackMeters = 0.5,
  panels = [],
  obstacles = [],
  walkways = [],
  excludePanelId = null,
}) {
  if (!roofPolygon || roofPolygon.length < 3) {
    return { valid: false, reason: "No roof boundary defined." };
  }

  const usablePolygon = computeSetbackPolygon(roofPolygon, setbackMeters);
  const pWidth = Number(candidate.width || 1.134);
  const pLength = Number(candidate.height || 2.278);
  const pRot = Number(candidate.rotation || 0);

  // 1. Inside usable polygon
  if (!isRectInsidePolygon(candidate.x, candidate.y, pWidth, pLength, pRot, usablePolygon)) {
    return { valid: false, reason: "Panel extends beyond the valid roof setback boundary." };
  }

  // 2. Overlap with existing panels
  for (const p of panels) {
    if (p.hidden || (excludePanelId && p.id === excludePanelId)) continue;
    const pRect = {
      x: p.x,
      y: p.y,
      width: p.width,
      height: p.height,
      rotation: p.rotation || 0,
    };
    if (rotatedRectanglesIntersect({ x: candidate.x, y: candidate.y, width: pWidth, height: pLength, rotation: pRot }, pRect)) {
      return { valid: false, reason: "Panel overlaps another existing solar panel." };
    }
  }

  // 3. Overlap with obstacles
  for (const obs of obstacles) {
    const obsRect = {
      x: Number(obs.x || 0),
      y: Number(obs.y || 0),
      width: Number(obs.length || 1.8),
      height: Number(obs.width || 1.8),
      rotation: Number(obs.rotation || 0),
    };
    if (rotatedRectanglesIntersect({ x: candidate.x, y: candidate.y, width: pWidth, height: pLength, rotation: pRot }, obsRect)) {
      return { valid: false, reason: `Panel overlaps obstacle: ${obs.name || obs.type || "Exclusion Zone"}.` };
    }
  }

  // 4. Overlap with walkways
  for (const walk of walkways) {
    const walkRect = {
      x: Number(walk.x || 0),
      y: Number(walk.y || 0),
      width: Number(walk.width || 0.8),
      height: Number(walk.length || 3.0),
      rotation: Number(walk.rotation || 0),
    };
    if (rotatedRectanglesIntersect({ x: candidate.x, y: candidate.y, width: pWidth, height: pLength, rotation: pRot }, walkRect)) {
      return { valid: false, reason: "Panel overlaps maintenance walkway." };
    }
  }

  return { valid: true, reason: "" };
}

/**
 * Searches for any free spot in the usable roof to fit an additional panel
 */
export function canFitAdditionalPanel({
  panels = [],
  roofPolygon,
  setbackMeters = 0.5,
  obstacles = [],
  walkways = [],
  panelSpecs = DEFAULT_PANEL_SPECS,
  orientation = "portrait",
  azimuthDegrees = 180,
}) {
  if (!roofPolygon || roofPolygon.length < 3) {
    return { canFit: false, newPanel: null };
  }

  const usablePolygon = computeSetbackPolygon(roofPolygon, setbackMeters);
  const isPortrait = orientation.toLowerCase() === "portrait";
  const pWidth = isPortrait ? (panelSpecs.width_m || 1.134) : (panelSpecs.length_m || 2.278);
  const pLength = isPortrait ? (panelSpecs.length_m || 2.278) : (panelSpecs.width_m || 1.134);

  const bounds = getPolygonBounds(usablePolygon);
  const stepX = 0.25; // Fine resolution search
  const stepY = 0.25;

  for (let y = bounds.minY + pLength / 2; y <= bounds.maxY - pLength / 2 + 0.05; y += stepY) {
    for (let x = bounds.minX + pWidth / 2; x <= bounds.maxX - pWidth / 2 + 0.05; x += stepX) {
      const candidate = { x, y, width: pWidth, height: pLength, rotation: 0 };
      const check = validatePanelPlacement({
        candidate,
        roofPolygon,
        setbackMeters,
        panels,
        obstacles,
        walkways,
      });

      if (check.valid) {
        return {
          canFit: true,
          newPanel: {
            id: `panel-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            x: Math.round(x * 1000) / 1000,
            y: Math.round(y * 1000) / 1000,
            width: pWidth,
            height: pLength,
            rotation: 0,
            azimuth: azimuthDegrees,
            wattage: panelSpecs.wattage || 550,
            locked: false,
            hidden: false,
          },
        };
      }
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
  const totalKw = Math.round(((pCount * pWatt) / 1000.0) * 100) / 100;

  // Rail length: approx 2.35m rail per panel
  const railsM = pCount > 0 ? Math.round(pCount * 2.35 * 10) / 10 : 0;

  // Mid clamps between adjacent modules
  const midClamps = pCount > 2 ? Math.max(0, (pCount - 2) * 2) : pCount * 2;

  // End clamps: 4 per array block (est. 1 block per 10 panels)
  const numBlocks = Math.max(1, Math.ceil(pCount / 10));
  const endClamps = pCount > 0 ? numBlocks * 4 : 0;

  // Fasteners: clamps bolts + anchor base fasteners
  const fasteners = (midClamps + endClamps) * 2;

  // Structure leg columns/sets
  const isElevated = (structureType || "").toLowerCase().includes("elevated");
  const structureSets = pCount > 0 ? Math.max(1, Math.ceil(pCount / (isElevated ? 4 : 6))) : 0;

  // DC Cable: ~4.5m per panel + 20m home run
  const dcCableM = pCount > 0 ? Math.round(pCount * 4.5 + 20) : 0;

  // Walkway grating
  const walkwayM = Math.max(0, Math.round(roofAreaSqm * 0.06));

  // Inverter Recommendation
  let recommendedInverter = "3 kW Single Phase";
  if (totalKw > 25) recommendedInverter = `${Math.ceil(totalKw / 25) * 25} kW Three Phase (Grid-Tied)`;
  else if (totalKw > 15) recommendedInverter = "20 kW Three Phase Grid-Tied Inverter";
  else if (totalKw > 10) recommendedInverter = "12 kW Three Phase Grid-Tied Inverter";
  else if (totalKw > 6) recommendedInverter = "8 kW Three Phase Grid-Tied Inverter";
  else if (totalKw > 3.5) recommendedInverter = "5 kW Single/Three Phase Inverter";

  return {
    totalKw,
    panelCount: pCount,
    items: [
      {
        id: "bom-1",
        category: "Solar Panels",
        name: `Solar PV Modules (${panelSpecs?.make || "Tier-1 Mono PERC"})`,
        spec: `${pWatt}W Mono PERC (High-Efficiency)`,
        qty: pCount,
        unit: "Nos",
        isProductMaster: true,
      },
      {
        id: "bom-2",
        category: "Structure",
        name: "Mounting Purlins / Aluminium Rails",
        spec: "Anodized Al 6063-T6 Strut Channel",
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
