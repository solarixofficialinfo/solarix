/**
 * Geodetic and 2D/3D Geometry Utility Library for Rooftop Solar Designer
 * 
 * Provides:
 * - Local Cartesian <-> WGS84 Geodesic transformations (Haversine & Equirectangular)
 * - 2D Polygon area (Shoelace) and perimeter calculations
 * - Signed area and orientation detection (CCW vs CW)
 * - Inward offset / Setback polygon calculation for arbitrary roofs
 * - Point-in-polygon (Ray Casting) & Multi-point Rotated Rectangle Containment
 * - Separating Axis Theorem (SAT) for rotated rectangle collision
 * - Roof surface elevation calculation with pitch/slope & azimuth
 * - 3D mounting structure transformation (tilt, azimuth, height)
 * - Panel row and mounting table structural clustering engine
 */

export const EARTH_RADIUS_METERS = 6378137.0;

/**
 * Degrees to Radians
 */
export function toRad(deg) {
  return (Number(deg || 0) * Math.PI) / 180.0;
}

/**
 * Radians to Degrees
 */
export function toDeg(rad) {
  return (Number(rad || 0) * 180.0) / Math.PI;
}

/**
 * Calculates geodesic distance between two (lat, lng) points using the Haversine formula
 */
export function getHaversineDistance(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const rLat1 = toRad(lat1);
  const rLat2 = toRad(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

/**
 * Computes the geographic centroid of an array of {lat, lng} points
 */
export function getPolygonCentroid(points) {
  if (!points || points.length === 0) return { lat: 0, lng: 0 };
  let sumLat = 0;
  let sumLng = 0;
  for (const pt of points) {
    sumLat += Number(pt.lat);
    sumLng += Number(pt.lng);
  }
  return {
    lat: sumLat / points.length,
    lng: sumLng / points.length,
  };
}

/**
 * Converts GPS Lat/Lng to local Cartesian (x: East, y: North) in meters relative to an origin
 */
export function projectLatLngToMeters(lat, lng, origin) {
  const latRad = toRad(origin.lat);
  const x = (toRad(lng) - toRad(origin.lng)) * Math.cos(latRad) * EARTH_RADIUS_METERS;
  const y = (toRad(lat) - toRad(origin.lat)) * EARTH_RADIUS_METERS;
  return { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 };
}

/**
 * Converts local Cartesian (x: East, y: North) in meters to GPS Lat/Lng relative to an origin
 */
export function projectMetersToLatLng(x, y, origin) {
  const latRad = toRad(origin.lat);
  const dLngRad = x / (Math.cos(latRad) * EARTH_RADIUS_METERS);
  const dLatRad = y / EARTH_RADIUS_METERS;
  const lat = origin.lat + toDeg(dLatRad);
  const lng = origin.lng + toDeg(dLngRad);
  return { lat, lng };
}

export function ensureCartesianCoordinates(points, customOrigin) {
  if (!points || !Array.isArray(points) || points.length === 0) return points || [];
  if (points[0].x !== undefined && !isNaN(points[0].x) && points[0].y !== undefined && !isNaN(points[0].y)) {
    return points;
  }
  const origin = customOrigin || (points[0].lat != null && points[0].lng != null ? points[0] : null);
  if (!origin || origin.lat == null || origin.lng == null) return points;
  const baseLatRad = toRad(origin.lat);
  return points.map((pt) => {
    if (pt.x !== undefined && !isNaN(pt.x) && pt.y !== undefined && !isNaN(pt.y)) return pt;
    const x = (toRad(pt.lng) - toRad(origin.lng)) * Math.cos(baseLatRad) * EARTH_RADIUS_METERS;
    const y = (toRad(pt.lat) - toRad(origin.lat)) * EARTH_RADIUS_METERS;
    return {
      ...pt,
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
    };
  });
}

/**
 * Calculates signed 2D Cartesian polygon area in m²
 * Positive = Counter-Clockwise (CCW), Negative = Clockwise (CW)
 */
export function getPolygonSignedArea(points) {
  if (!points || points.length < 3) return 0;
  const pts = ensureCartesianCoordinates(points);
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return area / 2.0;
}

/**
 * Calculates 2D Cartesian polygon absolute area in m² using Shoelace formula
 */
export function getCartesianPolygonArea(points) {
  return Math.abs(getPolygonSignedArea(points));
}

export const getPolygonArea = getCartesianPolygonArea;

/**
 * Calculates polygon perimeter in meters
 */
export function getCartesianPolygonPerimeter(points) {
  if (!points || points.length < 2) return 0;
  const pts = ensureCartesianCoordinates(points);
  let perimeter = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const dx = pts[j].x - pts[i].x;
    const dy = pts[j].y - pts[i].y;
    perimeter += Math.sqrt(dx * dx + dy * dy);
  }
  return perimeter;
}

/**
 * Calculates bounding box and approximate length & width of 2D polygon
 */
export function getPolygonBounds(points) {
  if (!points || points.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, length: 0, centerX: 0, centerY: 0 };
  }
  const pts = ensureCartesianCoordinates(points);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const pt of pts) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }

  const width = Math.max(0, maxX - minX);
  const length = Math.max(0, maxY - minY);
  return {
    minX,
    maxX,
    minY,
    maxY,
    width,
    length,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

/**
 * Calculates primary orientation / azimuth of the polygon's longest edge in degrees (0 - 360)
 * 0° = North, 90° = East, 180° = South, 270° = West
 */
export function getPolygonPrimaryAzimuth(points) {
  if (!points || points.length < 2) return 180; // default True South
  let maxLen = 0;
  let bestAngle = 180;

  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    const dx = points[j].x - points[i].x;
    const dy = points[j].y - points[i].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > maxLen) {
      maxLen = len;
      let angle = (Math.atan2(dx, dy) * 180.0) / Math.PI;
      if (angle < 0) angle += 360;
      bestAngle = angle;
    }
  }

  return Math.round(bestAngle);
}

/**
 * Checks if a 2D point (px, py) is inside a 2D polygon using Ray Casting
 */
export function isPointInPolygon(px, py, points) {
  if (!points || points.length < 3) return false;
  const pts = ensureCartesianCoordinates(points);
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x;
    const yi = pts[i].y;
    const xj = pts[j].x;
    const yj = pts[j].y;

    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export const isPointInsidePolygon = isPointInPolygon;

/**
 * Checks if a point is inside or near the boundary of a polygon (within tolerance in meters)
 */
export function isPointInOrNearPolygon(px, py, points, tolerance = 0.08) {
  if (!points || points.length < 3) return false;
  if (isPointInPolygon(px, py, points)) return true;

  const pts = ensureCartesianCoordinates(points);
  const tolSq = tolerance * tolerance;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const ax = pts[i].x, ay = pts[i].y;
    const bx = pts[j].x, by = pts[j].y;

    // Check distance to vertex
    const distVertexSq = (px - ax) * (px - ax) + (py - ay) * (py - ay);
    if (distVertexSq <= tolSq) return true;

    // Distance from point to segment AB
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq > 1e-8) {
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
      const projX = ax + t * dx;
      const projY = ay + t * dy;
      const distSegSq = (px - projX) * (px - projX) + (py - projY) * (py - projY);
      if (distSegSq <= tolSq) return true;
    }
  }
  return false;
}

/**
 * Line segment intersection test between (p1, p2) and (p3, p4)
 */
export function segmentsIntersect(p1, p2, p3, p4) {
  function ccw(A, B, C) {
    return (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
  }
  return (
    ccw(p1, p3, p4) !== ccw(p2, p3, p4) &&
    ccw(p1, p2, p3) !== ccw(p1, p2, p4)
  );
}

/**
 * Checks if a line segment intersects any edge of the polygon
 */
export function segmentIntersectsPolygon(p1, p2, points) {
  if (!points || points.length < 2) return false;
  const pts = ensureCartesianCoordinates(points);
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    if (segmentsIntersect(p1, p2, pts[i], pts[j])) {
      return true;
    }
  }
  return false;
}

/**
 * Computes an inward offset (setback) polygon by moving edges inward by `setbackMeters`
 */
export function computeSetbackPolygon(points, setbackMeters) {
  if (!points || points.length < 3 || setbackMeters <= 0) return points || [];
  
  const ptsRaw = ensureCartesianCoordinates(points);
  const signedArea = getPolygonSignedArea(ptsRaw);
  const pts = signedArea > 0 ? [...ptsRaw] : [...ptsRaw].reverse();
  const n = pts.length;
  const offsetEdges = [];

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = pts[j].x - pts[i].x;
    const dy = pts[j].y - pts[i].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) continue;

    const nx = -dy / len;
    const ny = dx / len;

    offsetEdges.push({
      p1: { x: pts[i].x + nx * setbackMeters, y: pts[i].y + ny * setbackMeters },
      p2: { x: pts[j].x + nx * setbackMeters, y: pts[j].y + ny * setbackMeters },
    });
  }

  const insetPoints = [];
  const numEdges = offsetEdges.length;

  for (let i = 0; i < numEdges; i++) {
    const prev = offsetEdges[(i - 1 + numEdges) % numEdges];
    const curr = offsetEdges[i];

    const x1 = prev.p1.x, y1 = prev.p1.y, x2 = prev.p2.x, y2 = prev.p2.y;
    const x3 = curr.p1.x, y3 = curr.p1.y, x4 = curr.p2.x, y4 = curr.p2.y;

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-6) {
      insetPoints.push(curr.p1);
    } else {
      const ix = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / denom;
      const iy = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / denom;
      insetPoints.push({ x: ix, y: iy });
    }
  }

  const insetArea = getCartesianPolygonArea(insetPoints);
  if (insetArea < 0.5) {
    return points;
  }

  return insetPoints;
}

/**
 * Returns 4 corner vertices of a rotated rectangle given center (cx, cy), width, height, and rotation (degrees)
 */
export function getRotatedRectCorners(cx, cy, width, height, rotationDeg = 0) {
  const rad = toRad(rotationDeg);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const hw = width / 2.0;
  const hh = height / 2.0;

  const localCorners = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];

  return localCorners.map((c) => ({
    x: cx + c.x * cos - c.y * sin,
    y: cy + c.x * sin + c.y * cos,
  }));
}

/**
 * Tests if a rectangle (with rotation) is completely inside the boundary polygon
 * Uses 9-point sampling (4 corners + 4 edge midpoints + center) plus edge crossing check
 */
export function isRectInsidePolygon(cx, cy, width, height, rotationDeg, polygon) {
  if (!polygon || polygon.length < 3) return false;
  const corners = getRotatedRectCorners(cx, cy, width, height, rotationDeg);

  if (!isPointInPolygon(cx, cy, polygon)) return false;

  for (const corner of corners) {
    if (!isPointInPolygon(corner.x, corner.y, polygon)) {
      return false;
    }
  }

  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const midX = (corners[i].x + corners[j].x) / 2;
    const midY = (corners[i].y + corners[j].y) / 2;
    if (!isPointInPolygon(midX, midY, polygon)) {
      return false;
    }
  }

  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    if (segmentIntersectsPolygon(corners[i], corners[j], polygon)) {
      return false;
    }
  }

  return true;
}

/**
 * Tests if two rotated rectangles intersect (Separating Axis Theorem - SAT)
 */
export function rotatedRectanglesIntersect(rectA, rectB) {
  const cornersA = getRotatedRectCorners(rectA.x, rectA.y, rectA.width, rectA.height, rectA.rotation || 0);
  const cornersB = getRotatedRectCorners(rectB.x, rectB.y, rectB.width, rectB.height, rectB.rotation || 0);

  function getAxes(corners) {
    const axes = [];
    for (let i = 0; i < corners.length; i++) {
      const j = (i + 1) % corners.length;
      const dx = corners[j].x - corners[i].x;
      const dy = corners[j].y - corners[i].y;
      const len = Math.sqrt(dx * dx + dy * dy);
      axes.push({ x: -dy / len, y: dx / len });
    }
    return axes;
  }

  function project(corners, axis) {
    let min = Infinity;
    let max = -Infinity;
    for (const c of corners) {
      const dot = c.x * axis.x + c.y * axis.y;
      if (dot < min) min = dot;
      if (dot > max) max = dot;
    }
    return { min, max };
  }

  const axes = [...getAxes(cornersA), ...getAxes(cornersB)];
  for (const axis of axes) {
    const projA = project(cornersA, axis);
    const projB = project(cornersB, axis);
    if (projA.max < projB.min || projB.max < projA.min) {
      return false;
    }
  }
  return true;
}

/**
 * Calculates 3D Roof Surface Elevation (Y in Three.js coordinates) at any (x, y) location
 * taking into account building elevation, roof slope/pitch, bounds, gable ridge, hip facets, and slope azimuth.
 */
export function calculateRoofElevationAtPoint(x, y, roof = {}) {
  const type = roof?.type || "flat";
  const pitch_deg = Number(roof?.pitch_deg || 0);
  const azimuth_deg = Number(roof?.azimuth_deg ?? 180);
  const elevation_m = Number(roof?.elevation_m || 3.0);
  const eave_height_m = roof?.eave_height_m != null ? Number(roof.eave_height_m) : elevation_m;
  const ridge_height_m = roof?.ridge_height_m != null ? Number(roof.ridge_height_m) : null;
  const bounds = roof?.bounds || null;

  const baseElevation = eave_height_m;
  const pitchRad = toRad(pitch_deg);

  if (pitch_deg <= 0 || type === "flat") {
    return baseElevation;
  }

  const cx = bounds?.centerX ?? 0;
  const cy = bounds?.centerY ?? 0;
  const relX = x - cx;
  const relY = y - cy;

  if (type === "single_slope") {
    const azRad = toRad(azimuth_deg);
    const projDist = relX * Math.sin(azRad) + relY * Math.cos(azRad);
    return Math.max(0.5, baseElevation + projDist * Math.tan(pitchRad));
  }

  if (type === "gable") {
    const azRad = toRad(azimuth_deg);
    // Perpendicular distance to central ridge
    const distToRidge = Math.abs(relX * Math.cos(azRad) - relY * Math.sin(azRad));
    const halfWidth = bounds?.width ? bounds.width / 2 : 5;
    const calculatedRidgeH = ridge_height_m != null ? ridge_height_m : baseElevation + halfWidth * Math.tan(pitchRad);
    return Math.max(baseElevation, calculatedRidgeH - distToRidge * Math.tan(pitchRad));
  }

  if (type === "hip") {
    const hw = bounds?.width ? bounds.width / 2 : 5;
    const hl = bounds?.length ? bounds.length / 2 : 7.5;
    const distFromEdgeX = Math.max(0, hw - Math.abs(relX));
    const distFromEdgeY = Math.max(0, hl - Math.abs(relY));
    const distFromEdge = Math.min(distFromEdgeX, distFromEdgeY);
    return baseElevation + distFromEdge * Math.tan(pitchRad);
  }

  if (type === "custom_polygon") {
    const azRad = toRad(azimuth_deg);
    const projDist = relX * Math.sin(azRad) + relY * Math.cos(azRad);
    return Math.max(0.5, baseElevation + projDist * Math.tan(pitchRad));
  }

  return baseElevation;
}

/**
 * Calculates 3D mounting transform (position & rotation) for a panel sitting ON the roof
 */
export function calculatePanel3DPosition({
  panel,
  roof = { type: "flat", pitch_deg: 0, azimuth_deg: 180, elevation_m: 3.0 },
  structure = { type: "elevated", tilt_deg: 15, height_m: 1.8 },
}) {
  const px = Number(panel.x || 0);
  const py = Number(panel.y || 0);
  const roofH = calculateRoofElevationAtPoint(px, py, roof);

  const isFlush = (structure.type || "").toLowerCase() === "flush";
  const structClearance = isFlush ? 0.12 : Number(structure.height_m || 1.8);
  const tiltDeg = isFlush ? Number(roof.pitch_deg || 0) : Number(structure.tilt_deg || 15);
  const tiltRad = toRad(tiltDeg);
  const azimuthDeg = Number(panel.azimuth ?? structure.azimuth ?? 180);
  const yawRad = toRad(azimuthDeg - 180);

  const panelLength = Number(panel.height || 2.278);
  const verticalOffset = (panelLength / 2) * Math.sin(tiltRad);

  return {
    x: px,
    y: roofH + structClearance + verticalOffset + 0.035,
    z: -py,
    tiltRad,
    yawRad,
    azimuthDeg,
    structClearance,
    roofSurfaceY: roofH,
  };
}

/**
 * Clusters individual panels into continuous rows/tables along the orientation azimuth
 * to generate realistic continuous rails, structural rafters, and evenly spaced support columns
 */
export function clusterPanelsIntoRows(panels, azimuthDeg = 180) {
  if (!panels || panels.length === 0) return [];

  const azRad = toRad(azimuthDeg - 180);
  const cos = Math.cos(azRad);
  const sin = Math.sin(azRad);

  // Transform each panel center to local row coordinates (u: along row/X, v: across row/Y)
  const transformed = panels.map((p) => {
    const px = Number(p.x || 0);
    const py = Number(p.y || 0);
    const u = px * cos + py * sin;
    const v = -px * sin + py * cos;
    return {
      panel: p,
      u,
      v,
      pw: Number(p.width || 1.134),
      pl: Number(p.height || 2.278),
    };
  });

  const rows = [];
  transformed.sort((a, b) => a.v - b.v);

  transformed.forEach((item) => {
    let matchedRow = rows.find((r) => Math.abs(r.v - item.v) < item.pl * 0.45);
    if (!matchedRow) {
      matchedRow = { v: item.v, items: [] };
      rows.push(matchedRow);
    }
    matchedRow.items.push(item);
  });

  return rows.map((row, rIdx) => {
    row.items.sort((a, b) => a.u - b.u);
    const items = row.items;
    const count = items.length;
    const pl = items[0].pl;
    const pw = items[0].pw;

    const minU = items[0].u - pw / 2;
    const maxU = items[count - 1].u + pw / 2;
    const totalRowLength = Math.max(pw, maxU - minU);
    const centerU = (minU + maxU) / 2;
    const avgV = row.items.reduce((sum, it) => sum + it.v, 0) / count;

    // Structural support column spacing (rafter lines)
    let numRafters = 2;
    if (count >= 4 && count <= 5) numRafters = 3;
    else if (count >= 6 && count <= 8) numRafters = 4;
    else if (count >= 9) numRafters = Math.max(3, Math.ceil(count / 2.2));

    const rafterUOffsets = [];
    if (numRafters === 2) {
      rafterUOffsets.push(minU + totalRowLength * 0.22, maxU - totalRowLength * 0.22);
    } else {
      const step = (totalRowLength * 0.8) / (numRafters - 1);
      const start = minU + totalRowLength * 0.1;
      for (let i = 0; i < numRafters; i++) {
        rafterUOffsets.push(start + i * step);
      }
    }

    // Convert (centerU, avgV) back to Cartesian (centerX, centerY)
    const centerX = centerU * cos - avgV * sin;
    const centerY = centerU * sin + avgV * cos;

    return {
      rowIndex: rIdx,
      count,
      panels: items.map((it) => it.panel),
      centerX,
      centerY,
      centerU,
      avgV,
      minU,
      maxU,
      totalRowLength,
      pw,
      pl,
      rafterUOffsets,
      azimuthDeg,
    };
  });
}

/**
 * Simplifies a polygon by removing redundant collinear vertices along straight lines
 */
export function simplifyCollinearVertices(pts, eps = 1e-4) {
  if (!pts || pts.length < 3) return pts || [];
  const res = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];
    const cross = (curr.x - prev.x) * (next.y - curr.y) - (curr.y - prev.y) * (next.x - curr.x);
    if (Math.abs(cross) > eps) {
      res.push(curr);
    }
  }
  return res.length >= 3 ? res : pts;
}

/**
 * Splits a 2D closed polygon with a section cut line passing through it.
 * Returns two closed polygons [poly1, poly2] sharing the exact cut edge vertices,
 * or null if the line does not cross through the polygon.
 */
export function splitPolygonWithLine(polygon, lineStart, lineEnd) {
  if (!polygon || polygon.length < 3) return null;
  const pts = ensureCartesianCoordinates(polygon);
  const n = pts.length;

  const dx = Number(lineEnd.x) - Number(lineStart.x);
  const dy = Number(lineEnd.y) - Number(lineStart.y);
  const len = Math.hypot(dx, dy);
  if (len < 1e-4) return null;

  // Extend line well beyond polygon bounds
  const bounds = getPolygonBounds(pts);
  const span = Math.max(bounds.width, bounds.length, 50) * 4;
  const dirX = dx / len;
  const dirY = dy / len;
  const p1 = { x: Number(lineStart.x) - dirX * span, y: Number(lineStart.y) - dirY * span };
  const p2 = { x: Number(lineEnd.x) + dirX * span, y: Number(lineEnd.y) + dirY * span };

  function segIntersect(a1, a2, b1, b2) {
    const x1 = a1.x, y1 = a1.y, x2 = a2.x, y2 = a2.y;
    const x3 = b1.x, y3 = b1.y, x4 = b2.x, y4 = b2.y;
    const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
    if (Math.abs(denom) < 1e-9) return null;
    const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
    const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
    if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
      return { x: x1 + ua * (x2 - x1), y: y1 + ua * (y2 - y1), tEdge: ub };
    }
    return null;
  }

  const intersections = [];
  for (let i = 0; i < n; i++) {
    const nextIdx = (i + 1) % n;
    const v1 = pts[i];
    const v2 = pts[nextIdx];
    const hit = segIntersect(p1, p2, v1, v2);
    if (hit) {
      let lat = undefined;
      let lng = undefined;
      if (v1.lat != null && v2.lat != null) {
        lat = v1.lat + hit.tEdge * (v2.lat - v1.lat);
        lng = v1.lng + hit.tEdge * (v2.lng - v1.lng);
      }
      intersections.push({
        edgeIndex: i,
        point: {
          x: Math.round(hit.x * 1000) / 1000,
          y: Math.round(hit.y * 1000) / 1000,
          lat: lat != null ? Math.round(lat * 1e7) / 1e7 : undefined,
          lng: lng != null ? Math.round(lng * 1e7) / 1e7 : undefined,
        },
      });
    }
  }

  if (intersections.length !== 2) {
    return null;
  }

  const [hitA, hitB] = intersections;
  const idxA = hitA.edgeIndex;
  const idxB = hitB.edgeIndex;
  if (idxA === idxB) return null;

  // Poly 1: hitA.point -> pts[idxA + 1 ... idxB] -> hitB.point
  const poly1 = [hitA.point];
  let curr = (idxA + 1) % n;
  while (curr !== (idxB + 1) % n) {
    poly1.push(pts[curr]);
    curr = (curr + 1) % n;
  }
  poly1.push(hitB.point);

  // Poly 2: hitB.point -> pts[idxB + 1 ... idxA] -> hitA.point
  const poly2 = [hitB.point];
  curr = (idxB + 1) % n;
  while (curr !== (idxA + 1) % n) {
    poly2.push(pts[curr]);
    curr = (curr + 1) % n;
  }
  poly2.push(hitA.point);

  const area1 = getCartesianPolygonArea(poly1);
  const area2 = getCartesianPolygonArea(poly2);
  if (area1 < 0.2 || area2 < 0.2) {
    return null;
  }

  return [simplifyCollinearVertices(poly1), simplifyCollinearVertices(poly2)];
}

/**
 * Merges two adjacent polygons sharing a common cut edge into a single unified polygon.
 */
export function mergeTwoAdjacentPolygons(polyA, polyB, eps = 0.08) {
  if (!polyA || !polyB) return null;
  const ptsA = ensureCartesianCoordinates(polyA);
  const ptsB = ensureCartesianCoordinates(polyB);
  const nA = ptsA.length;
  const nB = ptsB.length;

  function pointsMatch(p1, p2) {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y) < eps;
  }

  let matchA = -1;
  let matchB = -1;
  for (let i = 0; i < nA; i++) {
    const nextA = (i + 1) % nA;
    for (let j = 0; j < nB; j++) {
      const nextB = (j + 1) % nB;
      if (pointsMatch(ptsA[i], ptsB[nextB]) && pointsMatch(ptsA[nextA], ptsB[j])) {
        matchA = i;
        matchB = j;
        break;
      }
    }
    if (matchA !== -1) break;
  }

  if (matchA === -1) {
    return null;
  }

  const merged = [];
  let curA = (matchA + 1) % nA;
  while (curA !== matchA) {
    merged.push(ptsA[curA]);
    curA = (curA + 1) % nA;
  }
  merged.push(ptsA[matchA]);

  let curB = (matchB + 2) % nB;
  while (curB !== (matchB + 1) % nB) {
    merged.push(ptsB[curB]);
    curB = (curB + 1) % nB;
  }

  return simplifyCollinearVertices(merged);
}

/**
 * Calculates 3D elevation for an independent roof section plane at (x, y)
 */
export function calculateSectionRoofElevationAtPoint(x, y, section = {}, roofBase = {}) {
  const pitch_deg = Number(section?.pitch ?? section?.pitch_deg ?? 0);
  const azimuth_deg = Number(section?.azimuth ?? section?.azimuth_deg ?? 180);
  const baseElevation = Number(section?.elevation ?? section?.elevation_m ?? roofBase?.elevation_m ?? 3.0);

  if (pitch_deg <= 0) {
    return baseElevation;
  }

  const polygon = section?.polygon;
  const bounds = polygon && polygon.length >= 3 ? getPolygonBounds(polygon) : null;
  const cx = bounds?.centerX ?? 0;
  const cy = bounds?.centerY ?? 0;

  const relX = x - cx;
  const relY = y - cy;
  const pitchRad = toRad(pitch_deg);
  const azRad = toRad(azimuth_deg);
  const projDist = relX * Math.sin(azRad) + relY * Math.cos(azRad);

  return Math.max(0.5, baseElevation + projDist * Math.tan(pitchRad));
}

/**
 * Validates a newly drawn or edited section polygon
 * - Must have at least 3 points
 * - Must have area >= 0.5 m²
 * - Must not self-intersect
 * - Must be contained within parent roof polygon
 * - Must not overlap existing sibling sections
 * Returns { valid: boolean, error?: string }
 */
export function validateSectionPolygon(polygon, parentRoofPolygon = null, existingSections = [], currentSectionId = null) {
  if (!polygon || !Array.isArray(polygon) || polygon.length < 3) {
    return { valid: false, error: "Section requires at least 3 points." };
  }

  const pts = ensureCartesianCoordinates(polygon);
  const area = getCartesianPolygonArea(pts);
  if (isNaN(area) || area < 0.5) {
    return { valid: false, error: "Section area is too small (minimum 0.5 m²)." };
  }

  // Self-intersection check: non-adjacent edges must not intersect
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const p3 = pts[j];
      const p4 = pts[(j + 1) % n];
      if (segmentsIntersect(p1, p2, p3, p4)) {
        return { valid: false, error: "Section edges cross over each other (self-intersecting)." };
      }
    }
  }


  // Helper: checks if a point is strictly inside polygon interior (excluding shared boundary edges)
  function isPointStrictlyInside(px, py, points, borderTol = 0.08) {
    if (!isPointInPolygon(px, py, points)) return false;
    const ptsList = ensureCartesianCoordinates(points);
    for (let i = 0; i < ptsList.length; i++) {
      const j = (i + 1) % ptsList.length;
      const ax = ptsList[i].x, ay = ptsList[i].y;
      const bx = ptsList[j].x, by = ptsList[j].y;
      const dx = bx - ax, dy = by - ay;
      const lenSq = dx * dx + dy * dy;
      if (lenSq > 1e-8) {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
        const projX = ax + t * dx;
        const projY = ay + t * dy;
        if (Math.hypot(px - projX, py - projY) <= borderTol) {
          return false; // on border
        }
      }
    }
    return true;
  }

  // 2. Overlap Check with Existing Sibling Sections
  if (Array.isArray(existingSections) && existingSections.length > 0) {
    for (const sec of existingSections) {
      if (!sec || !sec.polygon || sec.polygon.length < 3) continue;
      if (currentSectionId && sec.id === currentSectionId) continue;

      const secPts = ensureCartesianCoordinates(sec.polygon);

      // Check if centroid of candidate is strictly inside sibling
      const bounds = getPolygonBounds(pts);
      if (isPointStrictlyInside(bounds.centerX, bounds.centerY, secPts)) {
        return { valid: false, error: `Section overlaps ${sec.name || "another section"}. Sections must not overlap.` };
      }

      // Check if centroid of sibling is strictly inside candidate
      const siblingBounds = getPolygonBounds(secPts);
      if (isPointStrictlyInside(siblingBounds.centerX, siblingBounds.centerY, pts)) {
        return { valid: false, error: `Section overlaps ${sec.name || "another section"}. Sections must not overlap.` };
      }

      // Check if vertices of candidate are strictly inside sibling section interior
      for (const p of pts) {
        if (isPointStrictlyInside(p.x, p.y, secPts)) {
          return { valid: false, error: `Section overlaps ${sec.name || "another section"}. Sections must not overlap.` };
        }
      }

      // Check if sibling vertices are strictly inside candidate interior
      for (const sp of secPts) {
        if (isPointStrictlyInside(sp.x, sp.y, pts)) {
          return { valid: false, error: `Section overlaps ${sec.name || "another section"}. Sections must not overlap.` };
        }
      }

      // Check if non-endpoint edges cross
      const n1 = pts.length;
      const n2 = secPts.length;
      for (let i = 0; i < n1; i++) {
        const a1 = pts[i], a2 = pts[(i + 1) % n1];
        for (let j = 0; j < n2; j++) {
          const b1 = secPts[j], b2 = secPts[(j + 1) % n2];
          if (segmentsIntersect(a1, a2, b1, b2)) {
            const isEndpoint =
              (Math.hypot(a1.x - b1.x, a1.y - b1.y) < 0.08 || Math.hypot(a1.x - b2.x, a1.y - b2.y) < 0.08) ||
              (Math.hypot(a2.x - b1.x, a2.y - b1.y) < 0.08 || Math.hypot(a2.x - b2.x, a2.y - b2.y) < 0.08);
            if (!isEndpoint) {
              return { valid: false, error: `Section crosses boundary of ${sec.name || "another section"}.` };
            }
          }
        }
      }
    }
  }

  return { valid: true };
}
