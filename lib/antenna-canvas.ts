// Renders a simple schematic diagram of the selected antenna type.
import type { AntennaTypeId } from './antenna';

const W = 320;
const H = 170;

export interface AntennaTheme {
  wire: string;
  support: string;
  ground: string;
  label: string;
  feed: string;
}

export const ANTENNA_THEMES: Record<'light' | 'dark', AntennaTheme> = {
  light: { wire: '#b45309', support: '#9198a8', ground: '#676e7c', label: '#3a3f47', feed: '#ef4444' },
  dark: { wire: '#fbbf24', support: '#5b6270', ground: '#9198a8', label: '#c7ccd6', feed: '#f87171' },
};

function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  size = 11,
  align: CanvasTextAlign = 'center'
) {
  ctx.fillStyle = color;
  ctx.font = `600 ${size}px -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
}

function feedDot(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 3.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawDipole(ctx: CanvasRenderingContext2D, theme: AntennaTheme, totalLabel: string, legLabel: string) {
  const y = 58;
  const xLeft = 36;
  const xRight = 284;
  const xCenter = 160;
  const gap = 6;

  // supports (dashed, up to the popup edge)
  ctx.strokeStyle = theme.support;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(xLeft, y);
  ctx.lineTo(xLeft, 14);
  ctx.moveTo(xRight, y);
  ctx.lineTo(xRight, 14);
  ctx.stroke();
  ctx.setLineDash([]);

  // wire, split at center feedpoint
  ctx.strokeStyle = theme.wire;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(xLeft, y);
  ctx.lineTo(xCenter - gap, y);
  ctx.moveTo(xCenter + gap, y);
  ctx.lineTo(xRight, y);
  ctx.stroke();

  // insulators
  ctx.fillStyle = theme.support;
  [xLeft, xRight].forEach((x) => {
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  // feedline down to the radio
  ctx.strokeStyle = theme.wire;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(xCenter, y);
  ctx.lineTo(xCenter, 128);
  ctx.stroke();
  feedDot(ctx, xCenter, y, theme.feed);
  label(ctx, 'to feedline / rig', xCenter, 143, theme.label, 9.5);

  label(ctx, totalLabel, xCenter, 26, theme.label, 12.5);
  label(ctx, legLabel, (xLeft + xCenter) / 2, 76, theme.label, 10);
  label(ctx, legLabel, (xRight + xCenter) / 2, 76, theme.label, 10);
}

function drawVertical(ctx: CanvasRenderingContext2D, theme: AntennaTheme, totalLabel: string) {
  const groundY = 148;
  const baseX = 160;
  const topY = 22;

  // ground line + hatching
  ctx.strokeStyle = theme.ground;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(30, groundY);
  ctx.lineTo(290, groundY);
  ctx.stroke();
  for (let x = 34; x < 290; x += 12) {
    ctx.beginPath();
    ctx.moveTo(x, groundY);
    ctx.lineTo(x - 6, groundY + 7);
    ctx.stroke();
  }

  // radials
  ctx.strokeStyle = theme.support;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 3]);
  [
    [baseX - 70, groundY],
    [baseX - 35, groundY],
    [baseX + 35, groundY],
    [baseX + 70, groundY],
  ].forEach(([x, y]) => {
    ctx.beginPath();
    ctx.moveTo(baseX, groundY);
    ctx.lineTo(x, y);
    ctx.stroke();
  });
  ctx.setLineDash([]);

  // vertical element
  ctx.strokeStyle = theme.wire;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(baseX, groundY);
  ctx.lineTo(baseX, topY);
  ctx.stroke();

  feedDot(ctx, baseX, groundY, theme.feed);
  label(ctx, totalLabel, baseX + 58, (topY + groundY) / 2, theme.label, 12.5);
  label(ctx, 'radials', baseX, groundY + 20, theme.label, 9.5);
  label(ctx, 'feedpoint', baseX - 42, groundY - 4, theme.label, 9.5);
}

function drawLoop(ctx: CanvasRenderingContext2D, theme: AntennaTheme, totalLabel: string, sideLabel: string) {
  const cx = 160;
  const cy = 82;
  const halfW = 92;
  const halfH = 62;
  const top: [number, number] = [cx, cy - halfH];
  const right: [number, number] = [cx + halfW, cy];
  const bottom: [number, number] = [cx, cy + halfH];
  const left: [number, number] = [cx - halfW, cy];

  ctx.strokeStyle = theme.wire;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(...top);
  ctx.lineTo(...right);
  ctx.lineTo(...bottom);
  ctx.lineTo(...left);
  ctx.closePath();
  ctx.stroke();

  // supports at top/left/right corners
  ctx.fillStyle = theme.support;
  [top, right, left].forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  // feedline at the bottom corner
  ctx.strokeStyle = theme.wire;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bottom[0], bottom[1]);
  ctx.lineTo(bottom[0], bottom[1] + 20);
  ctx.stroke();
  feedDot(ctx, bottom[0], bottom[1], theme.feed);
  label(ctx, 'feedpoint', bottom[0], bottom[1] + 34, theme.label, 9.5);

  label(ctx, totalLabel, cx, cy - halfH - 10, theme.label, 12.5);
  label(ctx, sideLabel, cx + halfW / 2 + 24, cy - halfH / 2 - 18, theme.label, 10, 'left');
}

export interface DrawAntennaOpts {
  type: AntennaTypeId;
  totalLabel: string;
  legLabel?: string; // dipole leg / loop side length, formatted
  theme: AntennaTheme;
}

export function drawAntennaDiagram(canvas: HTMLCanvasElement, opts: DrawAntennaOpts) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);

  if (opts.type === 'dipole') {
    drawDipole(ctx, opts.theme, opts.totalLabel, opts.legLabel ?? '');
  } else if (opts.type === 'vertical') {
    drawVertical(ctx, opts.theme, opts.totalLabel);
  } else {
    drawLoop(ctx, opts.theme, opts.totalLabel, opts.legLabel ?? '');
  }
}
