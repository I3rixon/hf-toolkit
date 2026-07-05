// Renders an equirectangular world map with the live day/night terminator.
import type { LatLon } from './maidenhead';
import { solarElevation } from './grayline';
import { LAND_RINGS } from './world-map-data';

// Internal render resolution (2x the ~340px display width for crisp scaling).
const W = 680;
const H = 340;

export interface GraylineTheme {
  ocean: string;
  land: string;
  graticule: string;
}

export const GRAYLINE_THEMES: Record<'light' | 'dark', GraylineTheme> = {
  light: { ocean: '#bcd3e8', land: '#d7e0c8', graticule: 'rgba(0,0,0,0.10)' },
  dark: { ocean: '#0f1626', land: '#28323f', graticule: 'rgba(255,255,255,0.08)' },
};

const lonToX = (lon: number) => ((lon + 180) / 360) * W;
const latToY = (lat: number) => ((90 - lat) / 180) * H;

function drawLand(ctx: CanvasRenderingContext2D, color: string) {
  ctx.fillStyle = color;
  for (const ring of LAND_RINGS) {
    ctx.beginPath();
    for (let i = 0; i < ring.length; i += 2) {
      const x = lonToX(ring[i]);
      const y = latToY(ring[i + 1]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
}

function drawGraticule(ctx: CanvasRenderingContext2D, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let lon = -150; lon <= 150; lon += 30) {
    const x = lonToX(lon);
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const y = latToY(lat);
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();
}

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
