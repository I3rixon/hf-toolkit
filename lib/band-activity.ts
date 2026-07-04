import { browser } from 'wxt/browser';
import { BAND_ACTIVITY_CACHE_MS, STORAGE_KEYS } from './constants';

export interface Continent {
  code: string;
  label: string;
}

export const CONTINENTS: Continent[] = [
  { code: 'EU', label: 'Europe' },
  { code: 'NA', label: 'N. America' },
  { code: 'SA', label: 'S. America' },
  { code: 'AS', label: 'Asia' },
  { code: 'AF', label: 'Africa' },
  { code: 'OC', label: 'Oceania' },
];

// Row order top-to-bottom, matching dxheat.com's Band Activity widget.
export const BAND_ROWS = ['6', '10', '12', '15', '17', '20', '30', '40', '80', '160'];

export const GRID = {
  width: 280,
  height: 348,
  colStartX: 55,
  colStep: 30,
  rowStartY: 55,
  rowStep: 30,
  cellSize: 30,
};

export interface BandActivityPoint {
  x: number;
  y: number;
  value: number;
}

export interface BandActivityData {
  continent: string;
  fetchedAt: number;
  points: BandActivityPoint[];
  max: number;
  hadRawSpots: boolean;
}

// Spot counts this low are noise (e.g. one lone spot with a low continent-wide max
// would otherwise render at full intensity since value/max = 1). Hide them instead
// of showing a single blip as if it were a major opening.
export const MIN_SPOT_THRESHOLD = 3;

export async function fetchBandActivity(continent: string): Promise<BandActivityData> {
  const res = await fetch(`https://dxheat.com/heatmap/source/heatmap/?c=${continent}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Band activity request failed: ${res.status}`);
  const raw: Array<Record<string, unknown>> = await res.json();

  let max = 0;
  const points: BandActivityPoint[] = [];
  let hadRawSpots = false;
  for (const item of raw) {
    if (item && typeof item === 'object' && 'max' in item) {
      max = Number(item.max) || 0;
    } else if (item && typeof item === 'object' && 'x' in item && 'y' in item) {
      const value = Number(item.value);
      if (Number.isFinite(value)) {
        hadRawSpots = true;
        if (value >= MIN_SPOT_THRESHOLD) {
          points.push({ x: Number(item.x), y: Number(item.y), value });
        }
      }
    }
  }

  return { continent, fetchedAt: Date.now(), points, max, hadRawSpots };
}

type BandActivityCacheMap = Record<string, BandActivityData>;

export async function getCachedBandActivity(continent: string): Promise<BandActivityData | null> {
  const result = await browser.storage.local.get(STORAGE_KEYS.bandActivityCache);
  const cache = (result[STORAGE_KEYS.bandActivityCache] as BandActivityCacheMap) ?? {};
  const cached = cache[continent];
  if (!cached) return null;
  if (Date.now() - cached.fetchedAt > BAND_ACTIVITY_CACHE_MS) return null;
  return cached;
}

export async function fetchAndCacheBandActivity(continent: string): Promise<BandActivityData> {
  const data = await fetchBandActivity(continent);
  const result = await browser.storage.local.get(STORAGE_KEYS.bandActivityCache);
  const cache = (result[STORAGE_KEYS.bandActivityCache] as BandActivityCacheMap) ?? {};
  cache[continent] = data;
  await browser.storage.local.set({ [STORAGE_KEYS.bandActivityCache]: cache });
  return data;
}
