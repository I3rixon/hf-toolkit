// Great-circle distance and beam headings between two points.
import type { LatLon } from './maidenhead';

const R_KM = 6371.0088; // mean Earth radius
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export interface PathResult {
  distanceKm: number;
  distanceMi: number;
  shortPathBearing: number; // true degrees from north
  longPathBearing: number;
}

export function greatCircle(from: LatLon, to: LatLon): PathResult {
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLon = toRad(to.lon - from.lon);
  const dLat = lat2 - lat1;

  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const distanceKm = R_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const shortPathBearing = (toDeg(Math.atan2(y, x)) + 360) % 360;

  return {
    distanceKm,
    distanceMi: distanceKm * 0.621371,
    shortPathBearing,
    longPathBearing: (shortPathBearing + 180) % 360,
  };
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

export function compassPoint(deg: number): string {
  return COMPASS[Math.round(deg / 22.5) % 16];
}
