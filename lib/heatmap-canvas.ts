import { BAND_ROWS, CONTINENTS, GRID } from './band-activity';
import type { BandActivityPoint } from './band-activity';

const BLOB_RADIUS = 45;

// Color intensity is scaled against this floor, not the fetch's own local max.
// Without a floor, a quiet continent whose max is e.g. 1 spot would always render
// its single point at full "hot" intensity (value/max = 1). Log compression keeps
// the scale usable across both quiet hours and big band openings (max 100+).
export const COLOR_SCALE_FLOOR = 25;

export function effectiveColorMax(max: number): number {
  return Math.max(max, COLOR_SCALE_FLOOR);
}

function intensityFor(value: number, max: number): number {
  const scaleMax = effectiveColorMax(max);
  const ratio = Math.log(value + 1) / Math.log(scaleMax + 1);
  return Math.max(0, Math.min(1, ratio));
}

function jetColor(t: number): [number, number, number] {
  const stops: Array<[number, number, number, number]> = [
    [0, 0, 0, 255],
    [0.25, 0, 255, 255],
    [0.5, 0, 255, 0],
    [0.75, 255, 255, 0],
    [1, 255, 0, 0],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, r0, g0, b0] = stops[i];
    const [t1, r1, g1, b1] = stops[i + 1];
    if (t >= t0 && t <= t1) {
      const f = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
      return [r0 + (r1 - r0) * f, g0 + (g1 - g0) * f, b0 + (b1 - b0) * f];
    }
  }
  return [255, 0, 0];
}

function buildColorizedAlphaLayer(points: BandActivityPoint[], max: number): HTMLCanvasElement {
  const alphaCanvas = document.createElement('canvas');
  alphaCanvas.width = GRID.width;
  alphaCanvas.height = GRID.height;
  const actx = alphaCanvas.getContext('2d')!;

  for (const p of points) {
    const intensity = intensityFor(p.value, max);
    if (intensity <= 0) continue;
    const gradient = actx.createRadialGradient(p.x, p.y, 0, p.x, p.y, BLOB_RADIUS);
    gradient.addColorStop(0, `rgba(0,0,0,${intensity})`);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    actx.fillStyle = gradient;
    actx.fillRect(p.x - BLOB_RADIUS, p.y - BLOB_RADIUS, BLOB_RADIUS * 2, BLOB_RADIUS * 2);
  }

  const imageData = actx.getImageData(0, 0, alphaCanvas.width, alphaCanvas.height);
  const { data } = imageData;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha === 0) continue;
    const [r, g, b] = jetColor(alpha / 255);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
  actx.putImageData(imageData, 0, 0);
  return alphaCanvas;
}

export function drawBandActivityGrid(
  canvas: HTMLCanvasElement,
  points: BandActivityPoint[],
  max: number,
  colors: { gridLine: string; label: string }
) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = GRID.width * dpr;
  canvas.height = GRID.height * dpr;
  canvas.style.width = `${GRID.width}px`;
  canvas.style.height = `${GRID.height}px`;

  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, GRID.width, GRID.height);

  const gridLeft = GRID.colStartX - GRID.cellSize / 2;
  const gridTop = GRID.rowStartY - GRID.cellSize / 2;
  const gridRight = gridLeft + CONTINENTS.length * GRID.colStep;
  const gridBottom = gridTop + BAND_ROWS.length * GRID.rowStep;

  ctx.strokeStyle = colors.gridLine;
  ctx.lineWidth = 1;
  for (let c = 0; c <= CONTINENTS.length; c++) {
    const x = gridLeft + c * GRID.colStep;
    ctx.beginPath();
    ctx.moveTo(x, gridTop);
    ctx.lineTo(x, gridBottom);
    ctx.stroke();
  }
  for (let r = 0; r <= BAND_ROWS.length; r++) {
    const y = gridTop + r * GRID.rowStep;
    ctx.beginPath();
    ctx.moveTo(gridLeft, y);
    ctx.lineTo(gridRight, y);
    ctx.stroke();
  }

  if (points.length > 0 && max > 0) {
    const colorLayer = buildColorizedAlphaLayer(points, max);
    ctx.drawImage(colorLayer, 0, 0, GRID.width, GRID.height);
  }

  ctx.fillStyle = colors.label;
  ctx.font = '600 11px -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  CONTINENTS.forEach((cont, i) => {
    const x = GRID.colStartX + i * GRID.colStep;
    ctx.fillText(cont.code, x, gridTop - 10);
  });

  ctx.textAlign = 'right';
  BAND_ROWS.forEach((band, i) => {
    const y = GRID.rowStartY + i * GRID.rowStep;
    ctx.fillText(band, gridLeft - 8, y);
  });
}
