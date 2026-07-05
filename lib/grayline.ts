// Solar position math for the grayline / day-night terminator map.
import type { LatLon } from './maidenhead';

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

// The subsolar point: the location where the Sun is directly overhead right now.
// NOAA low-precision solar-position algorithm, accurate to ~0.1 deg.
export function subsolarPoint(date: Date = new Date()): LatLon {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0; // days since J2000.0

  let meanLon = (280.46 + 0.9856474 * n) % 360;
  if (meanLon < 0) meanLon += 360;
  let meanAnom = (357.528 + 0.9856003 * n) % 360;
  if (meanAnom < 0) meanAnom += 360;

  const eclipticLon =
    meanLon + 1.915 * Math.sin(toRad(meanAnom)) + 0.02 * Math.sin(toRad(2 * meanAnom));
  const obliquity = 23.439 - 0.0000004 * n;

  const declination = toDeg(Math.asin(Math.sin(toRad(obliquity)) * Math.sin(toRad(eclipticLon))));
  const rightAscension = toDeg(
    Math.atan2(Math.cos(toRad(obliquity)) * Math.sin(toRad(eclipticLon)), Math.cos(toRad(eclipticLon)))
  );

  let gmst = (280.46061837 + 360.98564736629 * n) % 360;
  if (gmst < 0) gmst += 360;

  let lon = rightAscension - gmst;
  lon = (((lon + 180) % 360) + 360) % 360 - 180; // wrap to -180..180

  return { lat: declination, lon };
}

// Sun elevation (degrees above horizon) at a location, given the subsolar point.
// >0 = day, ~0 = grayline, <0 = night.
export function solarElevation(lat: number, lon: number, sub: LatLon): number {
  const hourAngle = toRad(lon - sub.lon);
  const sinElev =
    Math.sin(toRad(lat)) * Math.sin(toRad(sub.lat)) +
    Math.cos(toRad(lat)) * Math.cos(toRad(sub.lat)) * Math.cos(hourAngle);
  return toDeg(Math.asin(Math.max(-1, Math.min(1, sinElev))));
}
