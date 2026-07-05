// Renders the NCDXF/IARU beacon locations on the shared world map, highlighting
// whichever beacons are currently transmitting.
import type { LatLon } from './maidenhead';
import type { Beacon } from './beacons';
import { MAP_W as W, MAP_H as H, WORLD_MAP_THEMES, lonToX, latToY, drawLand, drawGraticule } from './world-map-base';
import type { WorldMapTheme } from './world-map-base';

export type BeaconMapTheme = WorldMapTheme;
export const BEACON_MAP_THEMES = WORLD_MAP_THEMES;

// White-on-dark-outline text reads on both the light and dark map themes
// without needing per-theme label colors. Clamped so labels near the map's
// left/right edge (e.g. ZL6B, near the antimeridian) don't run off-canvas.
function outlinedLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size = 9) {
  ctx.font = `700 ${size}px -apple-system, "Segoe UI", sans-serif`;
  const halfWidth = ctx.measureText(text).width / 2 + 2;
  const clampedX = Math.min(Math.max(x, halfWidth), W - halfWidth);
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.strokeText(text, clampedX, y);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, clampedX, y);
}

function drawBeacon(ctx: CanvasRenderingContext2D, beacon: Beacon, active: boolean) {
  const x = lonToX(beacon.lon);
  const y = latToY(beacon.lat);

  if (!active) {
    ctx.fillStyle = 'rgba(148,155,168,0.65)';
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  const glow = ctx.createRadialGradient(x, y, 0, x, y, 15);
  glow.addColorStop(0, 'rgba(245,158,11,0.55)');
  glow.addColorStop(1, 'rgba(245,158,11,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, 15, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#f59e0b';
  ctx.strokeStyle = '#7c3a06';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  outlinedLabel(ctx, beacon.call, x, y - 9);
}

function drawHome(ctx: CanvasRenderingContext2D, home: LatLon) {
  const x = lonToX(home.lon);
  const y = latToY(home.lat);
  ctx.fillStyle = '#ef4444';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  outlinedLabel(ctx, 'HOME', x, y - 11, 9.5);
}

export interface DrawBeaconMapOpts {
  beacons: Beacon[];
  activeCalls: Set<string>;
  home?: LatLon | null;
  theme: BeaconMapTheme;
}

export function drawBeaconMap(canvas: HTMLCanvasElement, opts: DrawBeaconMapOpts) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = opts.theme.ocean;
  ctx.fillRect(0, 0, W, H);
  drawLand(ctx, opts.theme.land);
  drawGraticule(ctx, opts.theme.graticule);

  // draw inactive beacons first, active ones (with glow/label) on top
  for (const beacon of opts.beacons) {
    if (!opts.activeCalls.has(beacon.call)) drawBeacon(ctx, beacon, false);
  }
  for (const beacon of opts.beacons) {
    if (opts.activeCalls.has(beacon.call)) drawBeacon(ctx, beacon, true);
  }
  if (opts.home) drawHome(ctx, opts.home);
}
