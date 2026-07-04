import { browser } from 'wxt/browser';
import { FETCH_INTERVAL_MINUTES, HISTORY_RETENTION_MS, SOLAR_XML_URL, STORAGE_KEYS } from './constants';
import { parseSolarXml } from './parse-solar-xml';
import type { KHistoryPoint, SolarSnapshot } from './types';

export async function getStoredData(): Promise<{ latest: SolarSnapshot | null; history: KHistoryPoint[] }> {
  const result = await browser.storage.local.get([STORAGE_KEYS.latest, STORAGE_KEYS.history]);
  return {
    latest: (result[STORAGE_KEYS.latest] as SolarSnapshot) ?? null,
    history: (result[STORAGE_KEYS.history] as KHistoryPoint[]) ?? [],
  };
}

export async function fetchAndStore(): Promise<SolarSnapshot> {
  const res = await fetch(SOLAR_XML_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Solar feed request failed: ${res.status}`);
  const xml = await res.text();
  const snapshot = parseSolarXml(xml);

  const { history } = await getStoredData();
  const cutoff = snapshot.fetchedAt - HISTORY_RETENTION_MS;
  const nextHistory: KHistoryPoint[] = [
    ...history.filter((p) => p.fetchedAt >= cutoff),
    { fetchedAt: snapshot.fetchedAt, kindex: snapshot.kindex },
  ];

  await browser.storage.local.set({
    [STORAGE_KEYS.latest]: snapshot,
    [STORAGE_KEYS.history]: nextHistory,
  });

  return snapshot;
}

export function msSinceLastFetch(latest: SolarSnapshot | null): number {
  if (!latest) return Infinity;
  return Date.now() - latest.fetchedAt;
}

export const STALE_THRESHOLD_MS = FETCH_INTERVAL_MINUTES * 60 * 1000 * 1.5;
