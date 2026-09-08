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
} from "./geoCalculations.js";

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
 * Packs panels on a predictable, geometry-based grid within usable roof polygon
 */
function packPanelsOnGrid({
  usablePolygon,
  obstacles = [],
  walkways = [],
  pWidth,
  pLength,
  panelGap = 0.03,
  azimuthDegrees = 180,
  wattage = 550,
}) {
  const bounds = getPolygonBounds(usablePolygon);
  const panels = [];
  let panelIdCounter = 1;

  const stepX = pWidth + panelGap;
  const stepY = pLength + panelGap;

  // Calculate actual remaining horizontal and vertical distances
  const availableWidth = bounds.width;
  const availableLength = bounds.length;

  if (availableWidth < pWidth || availableLength < pLength) {
    return [];
  }

  // Maximum complete columns and rows that can physically fit
  const maxCols = Math.max(1, Math.floor((availableWidth + panelGap + 1e-6) / stepX));
  const maxRows = Math.max(1, Math.floor((availableLength + panelGap + 1e-6) / stepY));

  // Center the grid symmetrically within the usable bounding box
  const totalOccupiedX = maxCols * pWidth + (maxCols - 1) * panelGap;
  const totalOccupiedY = maxRows * pLength + (maxRows - 1) * panelGap;
  const marginX = Math.max(0, (availableWidth - totalOccupiedX) / 2);
  const marginY = Math.max(0, (availableLength - totalOccupiedY) / 2);

  const startX = bounds.minX + marginX + pWidth / 2;
  const startY = bounds.minY + marginY + pLength / 2;

  for (let r = 0; r < maxRows; r++) {
    const cy = startY + r * stepY;
    // Row boundary verification: entire footprint must fit vertically
    if (cy - pLength / 2 < bounds.minY - 1e-4 || cy + pLength / 2 > bounds.maxY + 1e-4) {
      continue;
    }

    for (let c = 0; c < maxCols; c++) {
      const cx = startX + c * stepX;
      // Column boundary verification: entire footprint must fit horizontally
      if (cx - pWidth / 2 < bounds.minX - 1e-4 || cx + pWidth / 2 > bounds.maxX + 1e-4) {
        continue;
      }

      const candidate = {
        x: Math.round(cx * 1000) / 1000,
        y: Math.round(cy * 1000) / 1000,
        width: pWidth,
        height: pLength,
        rotation: 0,
      };

      // 1. Must be completely inside the usable setback polygon (works for arbitrary & irregular shapes)
      if (!isRectInsidePolygon(candidate.x, candidate.y, candidate.width, candidate.height, candidate.rotation, usablePolygon)) {
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
        row: r,
        col: c,
        wattage,
        locked: false,
        hidden: false,
      });
    }
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
  rowSpacingMeters = 0.03,
  panelSpacingMeters = 0.03,
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

  // Single unified panel gap in meters
  const panelGap = Math.max(0.01, Number(panelSpacingMeters ?? rowSpacingMeters ?? 0.03));

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
    const candidatePanels = packPanelsOnGrid({
      usablePolygon,
      obstacles,
      walkways,
      pWidth,
      pLength,
      panelGap,
      azimuthDegrees,
      wattage,
    });

    if (candidatePanels.length > bestPanels.length) {
      bestPanels = candidatePanels;
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
  rowSpacingMeters = 0.03,
  panelSpacingMeters = 0.03,
  azimuthDegrees = 180,
  nearX = null,
  nearY = null,
}) {
  if (!roofPolygon || roofPolygon.length < 3) {
    return { canFit: false, newPanel: null, reason: "No roof boundary defined." };
  }

  const usablePolygon = computeSetbackPolygon(roofPolygon, setbackMeters);
  if (!usablePolygon || usablePolygon.length < 3) {
    return { canFit: false, newPanel: null, reason: "No usable roof area inside setbacks." };
  }

  // 1. Determine Panel Dimensions, Orientation, and Azimuth
  // Preserve configuration from existing panels if present
  let pWidth, pLength, pRotation, pAzimuth;
  if (panels.length > 0) {
    const refPanel = panels[0];
    pWidth = Number(refPanel.width || (orientation === "landscape" ? (panelSpecs.length_m || 2.278) : (panelSpecs.width_m || 1.134)));
    pLength = Number(refPanel.height || (orientation === "landscape" ? (panelSpecs.width_m || 1.134) : (panelSpecs.length_m || 2.278)));
    pRotation = Number(refPanel.rotation || 0);
    pAzimuth = Number(refPanel.azimuth ?? azimuthDegrees ?? 180);
  } else {
    const isLandscape = (orientation || "").toLowerCase() === "landscape";
    pWidth = isLandscape ? Number(panelSpecs.length_m || 2.278) : Number(panelSpecs.width_m || 1.134);
    pLength = isLandscape ? Number(panelSpecs.width_m || 1.134) : Number(panelSpecs.length_m || 2.278);
    pRotation = 0;
    pAzimuth = Number(azimuthDegrees || 180);
  }

  // 2. Determine Spacing / Grid Step (using unified panelGap)
  const panelGap = Math.max(0.01, Number(panelSpacingMeters ?? rowSpacingMeters ?? 0.03));
  const stepX = pWidth + panelGap;
  const stepY = pLength + panelGap;

  const bounds = getPolygonBounds(usablePolygon);
  const candidates = [];

  // 3. Candidate Generation
  if (panels.length > 0) {
    // Cluster existing panels into rows by Y coordinate
    const rowTolerance = pLength * 0.45;
    const rows = [];
    const sortedPanels = [...panels].sort((a, b) => {
      if (Math.abs(b.y - a.y) > rowTolerance) return b.y - a.y; // North to South
      return a.x - b.x; // West to East
    });

    for (const p of sortedPanels) {
      let matchedRow = rows.find((r) => Math.abs(r.y - p.y) <= rowTolerance);
      if (!matchedRow) {
        matchedRow = { y: p.y, panels: [] };
        rows.push(matchedRow);
      }
      matchedRow.panels.push(p);
    }

    // Centroid and sort panels within each row by X
    rows.forEach((r) => {
      r.panels.sort((a, b) => a.x - b.x);
      r.y = r.panels.reduce((sum, p) => sum + p.y, 0) / r.panels.length;
    });

    // TIER 1: Row continuation (Right & Left) + Internal Gaps
    rows.forEach((row, rowIdx) => {
      const rowPanels = row.panels;
      if (rowPanels.length === 0) return;

      const first = rowPanels[0];
      const last = rowPanels[rowPanels.length - 1];

      // 1A. Right of last panel in row
      candidates.push({
        x: last.x + stepX,
        y: row.y,
        row: rowIdx,
        col: (last.col != null ? last.col + 1 : rowPanels.length),
        priority: 1,
      });

      // 1B. Left of first panel in row
      candidates.push({
        x: first.x - stepX,
        y: row.y,
        row: rowIdx,
        col: (first.col != null ? first.col - 1 : -1),
        priority: 2,
      });

      // 1C. Fill any gap within the row
      for (let i = 0; i < rowPanels.length - 1; i++) {
        const gap = rowPanels[i + 1].x - rowPanels[i].x;
        if (gap > stepX * 1.5) {
          const missingCount = Math.round(gap / stepX) - 1;
          for (let k = 1; k <= missingCount; k++) {
            candidates.push({
              x: rowPanels[i].x + k * stepX,
              y: row.y,
              row: rowIdx,
              col: (rowPanels[i].col != null ? rowPanels[i].col + k : i + k),
              priority: 0, // Highest priority: fill gaps inside existing row!
            });
          }
        }
      }
    });

    // TIER 2: Adjacent Rows (Below and Above existing array)
    if (rows.length > 0) {
      // Row below lowest row
      const lowestRow = rows[rows.length - 1];
      const newRowY_below = lowestRow.y - stepY;
      lowestRow.panels.forEach((p, idx) => {
        candidates.push({
          x: p.x,
          y: newRowY_below,
          row: rows.length,
          col: p.col ?? idx,
          priority: 3,
        });
      });

      // Row above highest row
      const highestRow = rows[0];
      const newRowY_above = highestRow.y + stepY;
      highestRow.panels.forEach((p, idx) => {
        candidates.push({
          x: p.x,
          y: newRowY_above,
          row: -1,
          col: p.col ?? idx,
          priority: 4,
        });
      });
    }

    // TIER 3: Canonical Grid Expansion across entire usablePolygon
    const anchorX = panels[0].x;
    const anchorY = panels[0].y;
    const minK = Math.floor((bounds.minX + pWidth / 2 - anchorX) / stepX) - 1;
    const maxK = Math.ceil((bounds.maxX - pWidth / 2 - anchorX) / stepX) + 1;
    const minM = Math.floor((bounds.minY + pLength / 2 - anchorY) / stepY) - 1;
    const maxM = Math.ceil((bounds.maxY - pLength / 2 - anchorY) / stepY) + 1;

    const gridCandidates = [];
    for (let m = maxM; m >= minM; m--) {
      const cy = anchorY + m * stepY;
      for (let k = minK; k <= maxK; k++) {
        const cx = anchorX + k * stepX;
        const alreadyOccupied = panels.some(
          (p) => Math.abs(p.x - cx) < pWidth * 0.75 && Math.abs(p.y - cy) < pLength * 0.75
        );
        if (!alreadyOccupied) {
          gridCandidates.push({
            x: cx,
            y: cy,
            row: m,
            col: k,
            priority: 5,
          });
        }
      }
    }

    // Sort grid candidates by proximity to existing panels (or nearX, nearY)
    const centroidX = nearX != null ? Number(nearX) : panels.reduce((s, p) => s + p.x, 0) / panels.length;
    const centroidY = nearY != null ? Number(nearY) : panels.reduce((s, p) => s + p.y, 0) / panels.length;

    gridCandidates.sort((a, b) => {
      const distA = Math.hypot(a.x - centroidX, a.y - centroidY);
      const distB = Math.hypot(b.x - centroidX, b.y - centroidY);
      return distA - distB;
    });

    candidates.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      const distA = Math.hypot(a.x - centroidX, a.y - centroidY);
      const distB = Math.hypot(b.x - centroidX, b.y - centroidY);
      return distA - distB;
    });

    candidates.push(...gridCandidates);
  } else {
    // EMPTY ROOF: place the first panel on canonical grid starting at top-left of usable polygon
    const startY = bounds.maxY - pLength / 2;
    const startX = bounds.minX + pWidth / 2;
    for (let y = startY; y >= bounds.minY + pLength / 2 - 0.05; y -= stepY) {
      for (let x = startX; x <= bounds.maxX - pWidth / 2 + 0.05; x += stepX) {
        candidates.push({
          x,
          y,
          row: Math.round((startY - y) / stepY),
          col: Math.round((x - startX) / stepX),
          priority: 0,
        });
      }
    }
  }

  // 4. Test Candidates Against Collision & Boundary Constraints
  for (const cand of candidates) {
    const candidateObj = {
      x: Math.round(cand.x * 1000) / 1000,
      y: Math.round(cand.y * 1000) / 1000,
      width: pWidth,
      height: pLength,
      rotation: pRotation,
    };

    // A. Must be completely inside the usable setback polygon (works for arbitrary polygons!)
    if (!isRectInsidePolygon(candidateObj.x, candidateObj.y, pWidth, pLength, pRotation, usablePolygon)) {
      continue;
    }

    // B. Must not collide with any existing panel
    let collidesWithPanel = false;
    for (const p of panels) {
      if (p.hidden) continue;
      const pRect = {
        x: p.x,
        y: p.y,
        width: p.width,
        height: p.height,
        rotation: p.rotation || 0,
      };
      if (rotatedRectanglesIntersect(candidateObj, pRect)) {
        collidesWithPanel = true;
        break;
      }
    }
    if (collidesWithPanel) continue;

    // C. Must not collide with any obstacle
    let collidesWithObs = false;
    for (const obs of obstacles) {
      const obsRect = {
        x: Number(obs.x || 0),
        y: Number(obs.y || 0),
        width: Number(obs.length || 1.8),
        height: Number(obs.width || 1.8),
        rotation: Number(obs.rotation || 0),
      };
      if (rotatedRectanglesIntersect(candidateObj, obsRect)) {
        collidesWithObs = true;
        break;
      }
    }
    if (collidesWithObs) continue;

    // D. Must not collide with any walkway
    let collidesWithWalk = false;
    for (const walk of walkways) {
      const walkRect = {
        x: Number(walk.x || 0),
        y: Number(walk.y || 0),
        width: Number(walk.width || 0.8),
        height: Number(walk.length || 3.0),
        rotation: Number(walk.rotation || 0),
      };
      if (rotatedRectanglesIntersect(candidateObj, walkRect)) {
        collidesWithWalk = true;
        break;
      }
    }
    if (collidesWithWalk) continue;

    // Valid placement candidate found!
    const maxId = panels.reduce((max, p) => {
      const n = parseInt(String(p.id || "").replace(/\D/g, ""), 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 0);
    const newPanelId = `panel-${maxId + 1}`;

    return {
      canFit: true,
      newPanel: {
        id: newPanelId,
        x: candidateObj.x,
        y: candidateObj.y,
        width: pWidth,
        height: pLength,
        rotation: pRotation,
        azimuth: pAzimuth,
        row: cand.row ?? 0,
        col: cand.col ?? 0,
        wattage: Number(panelSpecs.wattage || 550),
        locked: false,
        hidden: false,
      },
    };
  }

  return {
    canFit: false,
    newPanel: null,
    reason: "No valid panel position available in the current roof area.",
  };
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
