// Shared equirectangular world-map base (land polygons + graticule), reused by
// the Grayline terminator map and the Beacon location map.
import { LAND_RINGS } from './world-map-data';

export const MAP_W = 680;
export const MAP_H = 340;

export interface WorldMapTheme {
  ocean: string;
  land: string;
  graticule: string;
}

export const WORLD_MAP_THEMES: Record<'light' | 'dark', WorldMapTheme> = {
  light: { ocean: '#bcd3e8', land: '#d7e0c8', graticule: 'rgba(0,0,0,0.10)' },
  dark: { ocean: '#0f1626', land: '#28323f', graticule: 'rgba(255,255,255,0.08)' },
};

export const lonToX = (lon: number) => ((lon + 180) / 360) * MAP_W;
export const latToY = (lat: number) => ((90 - lat) / 180) * MAP_H;

export function drawLand(ctx: CanvasRenderingContext2D, color: string) {
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

export function drawGraticule(ctx: CanvasRenderingContext2D, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let lon = -150; lon <= 150; lon += 30) {
    const x = lonToX(lon);
    ctx.moveTo(x, 0);
    ctx.lineTo(x, MAP_H);
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const y = latToY(lat);
    ctx.moveTo(0, y);
    ctx.lineTo(MAP_W, y);
  }
  ctx.stroke();
}

export function drawBaseMap(ctx: CanvasRenderingContext2D, theme: WorldMapTheme) {
  ctx.fillStyle = theme.ocean;
  ctx.fillRect(0, 0, MAP_W, MAP_H);
  drawLand(ctx, theme.land);
  drawGraticule(ctx, theme.graticule);
}
