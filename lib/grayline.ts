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

function wrap180(deg: number): number {
  return (((deg + 180) % 360) + 360) % 360 - 180;
}

// The next solar transit (local solar noon) at a given longitude, at or after `from`.
// Solves for the time where the subsolar point's longitude lines up with `lon` -
// i.e. hour angle = 0 - via a couple of Newton steps against the near-linear
// (~15 deg/hour) drift of the subsolar longitude.
function nextSolarNoon(lon: number, from: Date): Date {
  let t = from.getTime();
  for (let shift = 0; shift < 2; shift++) {
    for (let i = 0; i < 4; i++) {
      const probe = 3_600_000; // 1h, used to estimate the drift rate
      const f0 = wrap180(subsolarPoint(new Date(t)).lon - lon);
      let df = wrap180(subsolarPoint(new Date(t + probe)).lon - lon) - f0;
      if (df > 180) df -= 360;
      if (df < -180) df += 360;
      const rate = df / probe; // deg/ms
      if (Math.abs(rate) < 1e-12) break;
      t -= f0 / rate;
    }
    if (t >= from.getTime() - 1000) break;
    t += 86_400_000; // landed on a past transit - retry for the following solar day
  }
  return new Date(t);
}

export interface SunTimes {
  sunrise: Date | null; // null when the sun doesn't rise (polar night)
  sunset: Date | null; // null when the sun doesn't set (polar day)
  solarNoon: Date; // time of zenith (sun crosses the local meridian)
  polarDay: boolean;
  polarNight: boolean;
}

// Sunrise, solar noon and sunset for a location, using the standard -0.833deg
// horizon altitude (accounts for atmospheric refraction and the sun's apparent radius).
export function sunTimes(lat: number, lon: number, from: Date = new Date()): SunTimes {
  const solarNoon = nextSolarNoon(lon, from);
  const decl = subsolarPoint(solarNoon).lat;
  const cosH0 =
    (Math.sin(toRad(-0.833)) - Math.sin(toRad(lat)) * Math.sin(toRad(decl))) /
    (Math.cos(toRad(lat)) * Math.cos(toRad(decl)));

  if (cosH0 > 1) return { sunrise: null, sunset: null, solarNoon, polarDay: false, polarNight: true };
  if (cosH0 < -1) return { sunrise: null, sunset: null, solarNoon, polarDay: true, polarNight: false };

  const halfDayMs = (toDeg(Math.acos(cosH0)) / 15) * 3_600_000;
  return {
    sunrise: new Date(solarNoon.getTime() - halfDayMs),
    sunset: new Date(solarNoon.getTime() + halfDayMs),
    solarNoon,
    polarDay: false,
    polarNight: false,
  };
}
