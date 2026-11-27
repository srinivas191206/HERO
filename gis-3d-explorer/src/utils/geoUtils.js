/**
 * Geographic utility functions for calculations, formatting and parsing
 */

export function formatCoordinate(val, isLat = true) {
  if (val === null || val === undefined || isNaN(val)) return '--';
  const dir = isLat ? (val >= 0 ? 'N' : 'S') : (val >= 0 ? 'E' : 'W');
  return `${Math.abs(val).toFixed(5)}° ${dir}`;
}

export function formatAltitude(meters) {
  if (meters === null || meters === undefined || isNaN(meters)) return '-- m';
  if (meters >= 1000000) {
    return `${(meters / 1000000).toFixed(2)}M km`;
  }
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${Math.round(meters)} m`;
}

export function calculatePolygonCentroid(coordinates) {
  // Coordinates are [[lon, lat], [lon, lat], ...]
  if (!coordinates || coordinates.length === 0) return [82.2475, 16.9891];
  
  let ring = coordinates;
  if (Array.isArray(coordinates[0][0])) {
    ring = coordinates[0]; // exterior ring
  }

  let sumLon = 0;
  let sumLat = 0;
  let count = 0;

  for (let i = 0; i < ring.length; i++) {
    const pt = ring[i];
    if (Array.isArray(pt) && pt.length >= 2) {
      sumLon += pt[0];
      sumLat += pt[1];
      count++;
    }
  }

  if (count === 0) return [82.2475, 16.9891];
  return [sumLon / count, sumLat / count];
}

export function calculatePolygonArea(ring) {
  // Approximate planar area in m^2 for parcel context
  if (!ring || ring.length < 3) return 0;
  let area = 0;
  const numPoints = ring.length;
  const degToRad = Math.PI / 180.0;
  const R = 6378137.0; // Earth radius in meters

  for (let i = 0; i < numPoints - 1; i++) {
    const p1 = ring[i];
    const p2 = ring[i + 1];
    const x1 = p1[0] * degToRad * R * Math.cos((p1[1] + p2[1]) * 0.5 * degToRad);
    const y1 = p1[1] * degToRad * R;
    const x2 = p2[0] * degToRad * R * Math.cos((p1[1] + p2[1]) * 0.5 * degToRad);
    const y2 = p2[1] * degToRad * R;
    area += (x1 * y2 - x2 * y1);
  }
  return Math.abs(area * 0.5);
}
