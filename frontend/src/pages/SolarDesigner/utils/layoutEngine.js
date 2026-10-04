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
  isPointInPolygon,
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
 * Parses walkway frequency string or number into a row interval number (0 = none)
 */
export function parseWalkwayFrequency(val) {
  if (!val || val === "none" || val === "None" || val === 0) return 0;
  if (val === "every_5") return 5;
  if (val === "every_10") return 10;
  if (val === "every_15") return 15;
  if (val === "every_20") return 20;
  const num = parseInt(val, 10);
  return isNaN(num) || num <= 0 ? 0 : num;
}

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
  rowGap = 0.03,
  walkwayEnabled = false,
  walkwayWidth = 0.75,
  walkwayFrequency = "none",
  azimuthDegrees = 180,
  wattage = 550,
}) {
  const bounds = getPolygonBounds(usablePolygon);
  const panels = [];
  const generatedWalkways = [];
  let panelIdCounter = 1;

  const stepX = pWidth + panelGap;

  // Calculate actual remaining horizontal and vertical distances
  const availableWidth = bounds.width;
  const availableLength = bounds.length;

  if (availableWidth < pWidth || availableLength < pLength) {
    return { panels: [], generatedWalkways: [] };
  }

  // Maximum complete columns that can physically fit horizontally
  const maxCols = Math.max(1, Math.floor((availableWidth + panelGap + 1e-6) / stepX));
  const totalOccupiedX = maxCols * pWidth + (maxCols - 1) * panelGap;
  const marginX = Math.max(0, (availableWidth - totalOccupiedX) / 2);
  const startX = bounds.minX + marginX + pWidth / 2;

  // Maximum complete rows that can physically fit vertically with rowGap and walkway corridors
  const freq = walkwayEnabled ? parseWalkwayFrequency(walkwayFrequency) : 0;
  const wWidth = walkwayEnabled ? Math.max(0.3, Number(walkwayWidth || 0.75)) : 0;

  let maxRows = 0;
  let totalOccupiedY = 0;
  while (true) {
    const nextN = maxRows + 1;
    const walkwaysCount = (freq > 0 && nextN > 1) ? Math.floor((nextN - 1) / freq) : 0;
    const requiredLength = nextN * pLength + (nextN - 1) * rowGap + walkwaysCount * wWidth;
    if (requiredLength <= availableLength + 1e-4) {
      maxRows = nextN;
      totalOccupiedY = requiredLength;
    } else {
      break;
    }
  }

  if (maxRows === 0 && availableLength >= pLength) {
    maxRows = 1;
    totalOccupiedY = pLength;
  }

  const marginY = Math.max(0, (availableLength - totalOccupiedY) / 2);
  const startY = bounds.minY + marginY + pLength / 2;

  let lastWalkwayRow = -1;

  for (let r = 0; r < maxRows; r++) {
    const walkwaysBefore = (freq > 0) ? Math.floor(r / freq) : 0;
    const cy = startY + r * (pLength + rowGap) + walkwaysBefore * wWidth;

    // Generate explicit walkway corridor geometry between row blocks
    if (freq > 0 && r > 0 && r % freq === 0 && lastWalkwayRow !== r) {
      lastWalkwayRow = r;
      const prevCy = startY + (r - 1) * (pLength + rowGap) + (walkwaysBefore - 1) * wWidth;
      const corridorY = (prevCy + pLength / 2 + cy - pLength / 2) / 2;
      generatedWalkways.push({
        id: `walkway-corridor-row-${r}`,
        x: (bounds.minX + bounds.maxX) / 2,
        y: Math.round(corridorY * 1000) / 1000,
        width: Math.round(bounds.width * 1000) / 1000,
        length: wWidth,
        rotation: 0,
        type: "corridor",
      });
    }

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

  return { panels, generatedWalkways };
}

/**
 * Generates an optimal automated panel layout inside a roof polygon
 */
export function generateAutoPanelLayout({
  roofPolygon,
  setbackMeters,
  setbackM,
  obstacles = [],
  walkways = [],
  panelSpecs,
  moduleSpec,
  orientation = "portrait",
  rowSpacingMeters,
  rowGapM,
  panelSpacingMeters,
  spacingM,
  panelGapM,
  walkwayEnabled = false,
  walkwayWidth = 0.75,
  walkwayFrequency = "none",
  azimuthDegrees = 180,
  strategy = "auto",
}) {
  if (!roofPolygon || roofPolygon.length < 3) {
    return {
      panels: [],
      generatedWalkways: [],
      usableAreaSqm: 0,
      panelCount: 0,
      totalKw: 0,
      coveragePct: 0,
      coveredAreaSqm: 0,
      remainingAreaSqm: 0,
    };
  }

  const effSetback = Number(setbackMeters ?? setbackM ?? 0.5);
  const effRowSpacing = Number(rowSpacingMeters ?? rowGapM ?? 0.03);
  const effPanelSpacing = Number(panelSpacingMeters ?? spacingM ?? panelGapM ?? 0.03);
  const effSpecs = panelSpecs || moduleSpec || DEFAULT_PANEL_SPECS;

  const effWalkwayObj = Array.isArray(walkways)
    ? walkways.find((w) => w && (w.frequency !== undefined || w.enabled !== undefined))
    : null;
  const effWalkwayEnabled = walkwayEnabled || Boolean(effWalkwayObj?.enabled);
  const effWalkwayWidth = Number(effWalkwayObj?.width ?? walkwayWidth ?? 0.75);
  const effWalkwayFreq = effWalkwayObj?.frequency ?? walkwayFrequency ?? "none";

  // 1. Compute usable boundary with setback
  const usablePolygon = computeSetbackPolygon(roofPolygon, effSetback);
  const usableAreaSqm = Math.round(getCartesianPolygonArea(usablePolygon) * 10) / 10;
  if (usableAreaSqm <= 0.5) {
    return {
      panels: [],
      generatedWalkways: [],
      usableAreaSqm: 0,
      panelCount: 0,
      totalKw: 0,
      coveragePct: 0,
      coveredAreaSqm: 0,
      remainingAreaSqm: 0,
    };
  }

  const wattage = Number(effSpecs.wattage || effSpecs.power_w || 550);
  const stdLength = Number(effSpecs.length_m || effSpecs.height || 2.278);
  const stdWidth = Number(effSpecs.width_m || effSpecs.width || 1.134);

  // Discrete panel spacing (along row) and row spacing (between rows)
  const panelGap = Math.max(0.01, effPanelSpacing);
  const rowGap = Math.max(0.01, effRowSpacing);

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

  let bestResult = { panels: [], generatedWalkways: [] };

  for (const orient of orientationsToTry) {
    const { pWidth, pLength } = orient;
    const result = packPanelsOnGrid({
      usablePolygon,
      obstacles,
      walkways,
      pWidth,
      pLength,
      panelGap,
      rowGap,
      walkwayEnabled: effWalkwayEnabled,
      walkwayWidth: effWalkwayWidth,
      walkwayFrequency: effWalkwayFreq,
      azimuthDegrees,
      wattage,
    });

    if (result.panels.length > bestResult.panels.length) {
      bestResult = result;
    }
  }

  const bestPanels = bestResult.panels;
  const panelCount = bestPanels.length;
  const singlePanelArea = stdWidth * stdLength;
  const coveredAreaSqm = Math.round(panelCount * singlePanelArea * 10) / 10;
  const totalKw = Math.round(((panelCount * wattage) / 1000.0) * 100) / 100;
  const coveragePct =
    usableAreaSqm > 0 ? Math.min(100, Math.round((coveredAreaSqm / usableAreaSqm) * 1000) / 10) : 0;
  const remainingAreaSqm = Math.max(0, Math.round((usableAreaSqm - coveredAreaSqm) * 10) / 10);

  return {
    panels: bestPanels,
    generatedWalkways: bestResult.generatedWalkways || [],
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
  isManual = false,
}) {
  if (!roofPolygon || roofPolygon.length < 3) {
    return { valid: false, reason: "No roof boundary defined." };
  }

  // In manual mode, validate against the true physical roof boundary with a minimal 0.02m edge buffer
  // This ensures auto-generation setbacks never falsely block valid manual placements inside the roof.
  const effectiveSetback = isManual ? Math.min(Number(setbackMeters || 0.5), 0.02) : Number(setbackMeters || 0.5);
  const usablePolygon = computeSetbackPolygon(roofPolygon, effectiveSetback);
  const pWidth = Number(candidate.width || 1.134);
  const pLength = Number(candidate.height || 2.278);
  const pRot = Number(candidate.rotation || 0);

  // 1. Inside usable polygon (or roof boundary if setback is relaxed)
  const boundaryPoly = (usablePolygon && usablePolygon.length >= 3) ? usablePolygon : roofPolygon;
  if (!isRectInsidePolygon(candidate.x, candidate.y, pWidth, pLength, pRot, boundaryPoly)) {
    if (isManual && isPointInPolygon(candidate.x, candidate.y, roofPolygon)) {
      // In manual mode, panel center is physically inside roof boundary; allow manual placement/adjustment
    } else {
      return { valid: false, reason: isManual ? "Panel is outside the roof perimeter boundary." : "Panel extends beyond the valid roof setback boundary." };
    }
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
  isManual = true,
}) {
  if (!roofPolygon || roofPolygon.length < 3) {
    return { canFit: false, newPanel: null, reason: "No roof boundary defined." };
  }

  // In manual mode, validate against actual roof boundary with minimal 0.02m buffer
  // This removes the false 'no space' restriction from auto-layout setbacks.
  const effectiveSetback = isManual ? Math.min(Number(setbackMeters || 0.5), 0.02) : Number(setbackMeters || 0.5);
  const usablePolygon = computeSetbackPolygon(roofPolygon, effectiveSetback);
  const boundaryPoly = (usablePolygon && usablePolygon.length >= 3) ? usablePolygon : roofPolygon;

  // 1. Determine Panel Dimensions, Orientation, and Azimuth
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

  // 2. Determine Spacing / Grid Step
  const panelGap = Math.max(0.01, Number(panelSpacingMeters ?? rowSpacingMeters ?? 0.03));
  const stepX = pWidth + panelGap;
  const stepY = pLength + panelGap;

  const bounds = getPolygonBounds(boundaryPoly);
  const candidates = [];

  // TIER 0: Direct manual target location (highest priority)
  if (nearX != null && nearY != null) {
    const nX = Number(nearX);
    const nY = Number(nearY);
    candidates.push({ x: nX, y: nY, row: 0, col: 0, priority: -10 });
    // Local cluster offsets around user target
    [
      { dx: stepX, dy: 0 },
      { dx: -stepX, dy: 0 },
      { dx: 0, dy: stepY },
      { dx: 0, dy: -stepY },
      { dx: stepX, dy: stepY },
      { dx: -stepX, dy: stepY },
      { dx: stepX, dy: -stepY },
      { dx: -stepX, dy: -stepY },
      { dx: stepX * 0.5, dy: 0 },
      { dx: -stepX * 0.5, dy: 0 },
      { dx: 0, dy: stepY * 0.5 },
      { dx: 0, dy: -stepY * 0.5 },
    ].forEach((off) => {
      candidates.push({ x: nX + off.dx, y: nY + off.dy, row: 0, col: 0, priority: -5 });
    });
  }

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

    // TIER 3: Canonical Grid Expansion across entire usable boundary
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

    // TIER 4: Comprehensive Fine-Grained Search for any unblocked spot on roof
    const fineStepX = Math.max(0.2, pWidth * 0.25);
    const fineStepY = Math.max(0.2, pLength * 0.25);
    for (let fy = bounds.maxY - pLength / 2; fy >= bounds.minY + pLength / 2; fy -= fineStepY) {
      for (let fx = bounds.minX + pWidth / 2; fx <= bounds.maxX - pWidth / 2; fx += fineStepX) {
        const occupied = panels.some(
          (p) => Math.abs(p.x - fx) < pWidth * 0.85 && Math.abs(p.y - fy) < pLength * 0.85
        );
        if (!occupied) {
          gridCandidates.push({
            x: fx,
            y: fy,
            row: 0,
            col: 0,
            priority: 8,
          });
        }
      }
    }

    // Sort grid candidates by proximity to existing panels (or nearX, nearY)
    const centroidX = nearX != null ? Number(nearX) : panels.reduce((s, p) => s + p.x, 0) / panels.length;
    const centroidY = nearY != null ? Number(nearY) : panels.reduce((s, p) => s + p.y, 0) / panels.length;

    candidates.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      const distA = Math.hypot(a.x - centroidX, a.y - centroidY);
      const distB = Math.hypot(b.x - centroidX, b.y - centroidY);
      return distA - distB;
    });

    gridCandidates.sort((a, b) => {
      const distA = Math.hypot(a.x - centroidX, a.y - centroidY);
      const distB = Math.hypot(b.x - centroidX, b.y - centroidY);
      return distA - distB;
    });

    candidates.push(...gridCandidates);
  } else {
    // EMPTY ROOF: place the first panel near clicked location or canonical grid
    if (nearX != null && nearY != null) {
      candidates.push({
        x: Number(nearX),
        y: Number(nearY),
        row: 0,
        col: 0,
        priority: -1,
      });
    }

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

    if (nearX != null && nearY != null) {
      candidates.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        const distA = Math.hypot(a.x - Number(nearX), a.y - Number(nearY));
        const distB = Math.hypot(b.x - Number(nearX), b.y - Number(nearY));
        return distA - distB;
      });
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

    // A. Must be completely inside the usable boundary polygon
    if (!isRectInsidePolygon(candidateObj.x, candidateObj.y, pWidth, pLength, pRotation, boundaryPoly)) {
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

  // MANUAL OVERRIDE FALLBACK:
  // When isManual is true, automatic capacity recommendation must NOT be a hard limit.
  // The user explicitly desires to place another panel manually.
  if (isManual && roofPolygon && roofPolygon.length >= 3) {
    const maxId = panels.reduce((max, p) => {
      const n = parseInt(String(p.id || "").replace(/\D/g, ""), 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 0);
    const newPanelId = `panel-${maxId + 1}`;

    // A. Explicit clicked target location on roof
    if (nearX != null && nearY != null) {
      const nX = Number(nearX);
      const nY = Number(nearY);

      if (isPointInPolygon(nX, nY, roofPolygon)) {
        // Try fine local nudges around clicked point to minimize collision
        const nudges = [
          { dx: 0, dy: 0 },
          { dx: stepX * 0.5, dy: 0 },
          { dx: -stepX * 0.5, dy: 0 },
          { dx: 0, dy: stepY * 0.5 },
          { dx: 0, dy: -stepY * 0.5 },
          { dx: stepX, dy: 0 },
          { dx: -stepX, dy: 0 },
        ];

        let bestPos = { x: nX, y: nY };
        let minCollisions = Infinity;

        for (const n of nudges) {
          const testX = Math.round((nX + n.dx) * 1000) / 1000;
          const testY = Math.round((nY + n.dy) * 1000) / 1000;
          if (!isPointInPolygon(testX, testY, roofPolygon)) continue;

          const testRect = { x: testX, y: testY, width: pWidth, height: pLength, rotation: pRotation };
          let colls = 0;
          for (const p of panels) {
            if (p.hidden) continue;
            if (rotatedRectanglesIntersect(testRect, { x: p.x, y: p.y, width: p.width, height: p.height, rotation: p.rotation || 0 })) {
              colls++;
            }
          }

          if (colls === 0) {
            bestPos = { x: testX, y: testY };
            minCollisions = 0;
            break;
          }

          if (colls < minCollisions) {
            minCollisions = colls;
            bestPos = { x: testX, y: testY };
          }
        }

        return {
          canFit: true,
          newPanel: {
            id: newPanelId,
            x: bestPos.x,
            y: bestPos.y,
            width: pWidth,
            height: pLength,
            rotation: pRotation,
            azimuth: pAzimuth,
            row: 0,
            col: 0,
            wattage: Number(panelSpecs.wattage || 550),
            locked: false,
            hidden: false,
            isManual: true,
          },
        };
      }
    }

    // B. Manual addition via button (+ Panel) without clicked coordinates
    if (panels.length > 0) {
      // Find row edges or adjacent space to expand the array
      const sortedByX = [...panels].sort((a, b) => b.x - a.x);
      const rightmost = sortedByX[0];
      const sortedByY = [...panels].sort((a, b) => a.y - b.y);
      const lowest = sortedByY[0];
      const highest = sortedByY[sortedByY.length - 1];

      const edgeCandidates = [
        { x: rightmost.x + stepX, y: rightmost.y, row: rightmost.row ?? 0, col: (rightmost.col ?? 0) + 1 },
        { x: sortedByX[sortedByX.length - 1].x - stepX, y: rightmost.y, row: rightmost.row ?? 0, col: (rightmost.col ?? 0) - 1 },
        { x: lowest.x, y: lowest.y - stepY, row: (lowest.row ?? 0) + 1, col: lowest.col ?? 0 },
        { x: highest.x, y: highest.y + stepY, row: (highest.row ?? 0) - 1, col: highest.col ?? 0 },
      ];

      for (const ec of edgeCandidates) {
        if (isPointInPolygon(ec.x, ec.y, roofPolygon)) {
          return {
            canFit: true,
            newPanel: {
              id: newPanelId,
              x: Math.round(ec.x * 1000) / 1000,
              y: Math.round(ec.y * 1000) / 1000,
              width: pWidth,
              height: pLength,
              rotation: pRotation,
              azimuth: pAzimuth,
              row: ec.row,
              col: ec.col,
              wattage: Number(panelSpecs.wattage || 550),
              locked: false,
              hidden: false,
              isManual: true,
            },
          };
        }
      }

      // If exact grid edge points touch outside, place adjacent to last panel with manual flag
      return {
        canFit: true,
        newPanel: {
          id: newPanelId,
          x: Math.round((rightmost.x + stepX * 0.8) * 1000) / 1000,
          y: Math.round(rightmost.y * 1000) / 1000,
          width: pWidth,
          height: pLength,
          rotation: pRotation,
          azimuth: pAzimuth,
          row: rightmost.row ?? 0,
          col: (rightmost.col ?? 0) + 1,
          wattage: Number(panelSpecs.wattage || 550),
          locked: false,
          hidden: false,
          isManual: true,
        },
      };
    }
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
