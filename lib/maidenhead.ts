// Maidenhead locator <-> latitude/longitude conversion.
// Locators are 4 chars (field + square, ~1x2 deg) or 6 chars (+ subsquare).

export interface LatLon {
  lat: number;
  lon: number;
}

const A = 'A'.charCodeAt(0);

// Accepts "FN31" or "FN31pr" (case-insensitive).
export function isValidGrid(grid: string): boolean {
  return /^[A-R]{2}[0-9]{2}([A-X]{2})?$/i.test(grid.trim());
}

// Center point of the locator's cell.
export function gridToLatLon(grid: string): LatLon | null {
  const g = grid.trim().toUpperCase();
  if (!isValidGrid(g)) return null;

  let lon = (g.charCodeAt(0) - A) * 20 - 180;
  let lat = (g.charCodeAt(1) - A) * 10 - 90;
  lon += Number(g[2]) * 2;
  lat += Number(g[3]) * 1;

  if (g.length >= 6) {
    lon += (g.charCodeAt(4) - A) * (2 / 24) + (2 / 24) / 2;
    lat += (g.charCodeAt(5) - A) * (1 / 24) + (1 / 24) / 2;
  } else {
    lon += 1; // center of the 2-deg-wide square
    lat += 0.5; // center of the 1-deg-tall square
  }
  return { lat, lon };
}

// Nearest 6-char locator for a lat/lon.
export function latLonToGrid(lat: number, lon: number): string {
  const clampedLon = Math.max(-180, Math.min(179.999, lon));
  const clampedLat = Math.max(-90, Math.min(89.999, lat));
  const adjLon = clampedLon + 180;
  const adjLat = clampedLat + 90;

  const field1 = Math.floor(adjLon / 20);
  const field2 = Math.floor(adjLat / 10);
  const sq1 = Math.floor((adjLon % 20) / 2);
  const sq2 = Math.floor(adjLat % 10);
  const sub1 = Math.floor(((adjLon % 2) / 2) * 24);
  const sub2 = Math.floor(((adjLat % 1) / 1) * 24);

  return (
    String.fromCharCode(A + field1) +
    String.fromCharCode(A + field2) +
    String(sq1) +
    String(sq2) +
    String.fromCharCode(A + sub1).toLowerCase() +
    String.fromCharCode(A + sub2).toLowerCase()
  );
}
