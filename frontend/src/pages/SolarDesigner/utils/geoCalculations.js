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

/**
 * Calculates signed 2D Cartesian polygon area in m²
 * Positive = Counter-Clockwise (CCW), Negative = Clockwise (CW)
 */
export function getPolygonSignedArea(points) {
  if (!points || points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y - points[j].x * points[i].y;
  }
  return area / 2.0;
}

/**
 * Calculates 2D Cartesian polygon absolute area in m² using Shoelace formula
 */
export function getCartesianPolygonArea(points) {
  return Math.abs(getPolygonSignedArea(points));
}

/**
 * Calculates polygon perimeter in meters
 */
export function getCartesianPolygonPerimeter(points) {
  if (!points || points.length < 2) return 0;
  let perimeter = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    const dx = points[j].x - points[i].x;
    const dy = points[j].y - points[i].y;
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
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const pt of points) {
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
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;

    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
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
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    if (segmentsIntersect(p1, p2, points[i], points[j])) {
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
  
  // Ensure counter-clockwise vertex orientation
  const signedArea = getPolygonSignedArea(points);
  const pts = signedArea > 0 ? [...points] : [...points].reverse();
  const n = pts.length;
  const offsetEdges = [];

  // Compute offset parallel lines for each edge
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = pts[j].x - pts[i].x;
    const dy = pts[j].y - pts[i].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) continue;

    // Normal vector pointing inward (left of edge direction in CCW)
    const nx = -dy / len;
    const ny = dx / len;

    offsetEdges.push({
      p1: { x: pts[i].x + nx * setbackMeters, y: pts[i].y + ny * setbackMeters },
      p2: { x: pts[j].x + nx * setbackMeters, y: pts[j].y + ny * setbackMeters },
    });
  }

  // Intersect consecutive offset lines to get inset vertices
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

  // Validate that inset polygon has positive area and is contained
  const insetArea = getCartesianPolygonArea(insetPoints);
  if (insetArea < 0.5) {
    return points; // Fallback to full polygon if roof is small
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

  // 1. Check center point
  if (!isPointInPolygon(cx, cy, polygon)) return false;

  // 2. Check all 4 corners
  for (const corner of corners) {
    if (!isPointInPolygon(corner.x, corner.y, polygon)) {
      return false;
    }
  }

  // 3. Check edge midpoints
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const midX = (corners[i].x + corners[j].x) / 2;
    const midY = (corners[i].y + corners[j].y) / 2;
    if (!isPointInPolygon(midX, midY, polygon)) {
      return false;
    }
  }

  // 4. Rectangle edges must not cross polygon edges
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
      return false; // Separating axis found
    }
  }
  return true;
}

/**
 * Calculates 3D Roof Surface Elevation (Y in Three.js coordinates) at any (x, y) location
 * taking into account building elevation, roof slope/pitch, and slope azimuth.
 */
export function calculateRoofElevationAtPoint(x, y, { type = "flat", pitch_deg = 0, azimuth_deg = 180, elevation_m = 3.0 } = {}) {
  const baseElevation = Number(elevation_m || 3.0);
  const pitchRad = toRad(Number(pitch_deg || 0));
  const azRad = toRad(Number(azimuth_deg || 180) - 180); // Relative to South

  if (pitch_deg <= 0 || type === "flat") {
    return baseElevation;
  }

  if (type === "single_slope") {
    const projectedDistance = x * Math.sin(azRad) + y * Math.cos(azRad);
    return baseElevation + projectedDistance * Math.tan(pitchRad);
  }

  if (type === "gable") {
    const projectedDistance = Math.abs(x * Math.sin(azRad) + y * Math.cos(azRad));
    return baseElevation - projectedDistance * Math.tan(pitchRad);
  }

  if (type === "hip") {
    const dist = Math.max(Math.abs(x), Math.abs(y));
    return baseElevation - dist * Math.tan(pitchRad);
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
    z: -py, // Invert Y for 3D Three.js Z-axis
    tiltRad,
    yawRad,
    azimuthDeg,
    structClearance,
    roofSurfaceY: roofH,
  };
}
