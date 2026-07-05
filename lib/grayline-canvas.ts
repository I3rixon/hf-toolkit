// Renders an equirectangular world map with the live day/night terminator.
import type { LatLon } from './maidenhead';
import { solarElevation } from './grayline';
import { MAP_W as W, MAP_H as H, WORLD_MAP_THEMES, lonToX, latToY, drawLand, drawGraticule } from './world-map-base';
import type { WorldMapTheme } from './world-map-base';

export type GraylineTheme = WorldMapTheme;
export const GRAYLINE_THEMES = WORLD_MAP_THEMES;

// Paints the night/twilight/grayline overlay. Built on an offscreen canvas and
// composited with drawImage so it alpha-blends over the base map — putImageData
// on the main context would overwrite (erase) the land/ocean underneath.
function nightOverlay(ctx: CanvasRenderingContext2D, sub: LatLon) {
  const off = document.createElement('canvas');
  off.width = W;
  off.height = H;
  const octx = off.getContext('2d')!;
  const img = octx.createImageData(W, H);
  const data = img.data;
  for (let py = 0; py < H; py++) {
    const lat = 90 - (py / H) * 180;
    for (let px = 0; px < W; px++) {
      const lon = (px / W) * 360 - 180;
      const elev = solarElevation(lat, lon, sub);
      const idx = (py * W + px) * 4;
      if (elev >= 0.8) continue; // full daylight -> transparent
      if (elev < -6) {
        // night
        data[idx] = 8;
        data[idx + 1] = 12;
        data[idx + 2] = 34;
        data[idx + 3] = 140;
      } else if (elev < -0.8) {
        // twilight
        data[idx] = 10;
        data[idx + 1] = 16;
        data[idx + 2] = 44;
        data[idx + 3] = 78;
      } else {
        // grayline band (amber accent)
        data[idx] = 245;
        data[idx + 1] = 158;
        data[idx + 2] = 11;
        data[idx + 3] = 150;
      }
    }
  }
  octx.putImageData(img, 0, 0);
  ctx.drawImage(off, 0, 0);
}

function drawSun(ctx: CanvasRenderingContext2D, sub: LatLon) {
  const x = lonToX(sub.lon);
  const y = latToY(sub.lat);
  const glow = ctx.createRadialGradient(x, y, 0, x, y, 26);
  glow.addColorStop(0, 'rgba(255,221,120,0.9)');
  glow.addColorStop(1, 'rgba(255,221,120,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, 26, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffd23f';
  ctx.strokeStyle = '#b45309';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawQth(ctx: CanvasRenderingContext2D, qth: LatLon) {
  const x = lonToX(qth.lon);
  const y = latToY(qth.lat);
  ctx.fillStyle = '#ef4444';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

export interface DrawGraylineOpts {
  subsolar: LatLon;
  qth?: LatLon | null;
  theme: GraylineTheme;
}

export function drawGrayline(canvas: HTMLCanvasElement, opts: DrawGraylineOpts) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = opts.theme.ocean;
  ctx.fillRect(0, 0, W, H);
  drawLand(ctx, opts.theme.land);
  drawGraticule(ctx, opts.theme.graticule);
  nightOverlay(ctx, opts.subsolar);
  drawSun(ctx, opts.subsolar);
  if (opts.qth) drawQth(ctx, opts.qth);
}
