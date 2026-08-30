/**
 * Geospatial & 2D Geometry Calculation Engine for SOLARIX 3D Solar Designer
 * 
 * Provides:
 * - Geodesic Haversine distance (meters)
 * - Spherical polygon area (m²)
 * - Real-world Latitude/Longitude <-> Local Cartesian (x, y in meters) projection
 * - Polygon bounding box, centroid, perimeter, azimuth orientation
 * - Inset / setback polygon calculation
 * - Point-in-polygon & Box-in-polygon containment tests
 * - Rotated Oriented Bounding Box (OBB) collision tests for obstacles
 */

const EARTH_RADIUS = 6378137; // WGS84 Earth equatorial radius in meters

/**
 * Converts degrees to radians
 */
export function toRad(deg) {
  return (deg * Math.PI) / 180.0;
}

/**
 * Converts radians to degrees
 */
export function toDeg(rad) {
  return (rad * 180.0) / Math.PI;
}

/**
 * Calculates geodesic Haversine distance between two (lat, lng) points in meters
 */
export function getHaversineDistance(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS * c;
}

/**
 * Computes polygon centroid in (lat, lng)
 */
export function getPolygonCentroid(polygon) {
  if (!polygon || polygon.length === 0) return { lat: 0, lng: 0 };
  let sumLat = 0;
  let sumLng = 0;
  for (const pt of polygon) {
    sumLat += Number(pt.lat);
    sumLng += Number(pt.lng);
  }
  return {
    lat: sumLat / polygon.length,
    lng: sumLng / polygon.length,
  };
}

/**
 * Projects (lat, lng) coordinate to local Cartesian (x, y) in meters
 * relative to an origin point (latOrigin, lngOrigin) using Equirectangular / Mercator approximation.
 */
export function projectLatLngToMeters(lat, lng, origin) {
  const latRad = toRad(origin.lat);
  const x = (toRad(lng) - toRad(origin.lng)) * Math.cos(latRad) * EARTH_RADIUS;
  const y = (toRad(lat) - toRad(origin.lat)) * EARTH_RADIUS;
  return { x, y };
}

/**
 * Unprojects local Cartesian (x, y) in meters back to (lat, lng)
 */
export function unprojectMetersToLatLng(x, y, origin) {
  const latRad = toRad(origin.lat);
  const dLngRad = x / (Math.cos(latRad) * EARTH_RADIUS);
  const dLatRad = y / EARTH_RADIUS;
  const lat = origin.lat + toDeg(dLatRad);
  const lng = origin.lng + toDeg(dLngRad);
  return { lat, lng };
}

/**
 * Converts a polygon of {lat, lng} into local Cartesian {x, y} in meters
 */
export function polygonLatLngToMeters(polygon, origin = null) {
  if (!polygon || polygon.length === 0) return { localPoints: [], origin: { lat: 0, lng: 0 } };
  const baseOrigin = origin || getPolygonCentroid(polygon);
  const localPoints = polygon.map((pt) => projectLatLngToMeters(Number(pt.lat), Number(pt.lng), baseOrigin));
  return { localPoints, origin: baseOrigin };
}

/**
 * Calculates 2D Cartesian polygon area in m² using the Shoelace formula
 */
export function getCartesianPolygonArea(points) {
  if (!points || points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2.0;
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
      // Angle in degrees from North (+Y axis) clockwise
      let angle = (Math.atan2(dx, dy) * 180.0) / Math.PI;
      if (angle < 0) angle += 360;
      bestAngle = angle;
    }
  }

  return Math.round(bestAngle);
}

/**
 * Checks if a 2D point (px, py) is strictly inside a 2D polygon using Ray Casting
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
  const isCCW = (pts) => {
    let sum = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      sum += (pts[j].x - pts[i].x) * (pts[j].y + pts[i].y);
    }
    return sum < 0;
  };

  const pts = isCCW(points) ? [...points] : [...points].reverse();
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

    // Intersection of line (prev.p1, prev.p2) and (curr.p1, curr.p2)
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
  if (insetArea < 1.0) {
    return []; // Roof too small for setback
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
 * and does not intersect any boundary edges.
 */
export function isRectInsidePolygon(cx, cy, width, height, rotationDeg, polygon) {
  if (!polygon || polygon.length < 3) return false;
  const corners = getRotatedRectCorners(cx, cy, width, height, rotationDeg);

  // 1. All 4 corners must be inside
  for (const corner of corners) {
    if (!isPointInPolygon(corner.x, corner.y, polygon)) {
      return false;
    }
  }

  // 2. Rectangle edges must not cross polygon edges
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
