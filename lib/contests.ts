import { XMLParser } from 'fast-xml-parser';
import { browser } from 'wxt/browser';
import { CONTESTS_CACHE_MS, STORAGE_KEYS } from './constants';

export const CONTEST_RSS_URL = 'https://www.contestcalendar.com/calendar.rss';
export const MIN_CONTEST_HOURS = 23;

// The feed has no band/mode field, so we can't filter HF vs VHF/UHF/microwave
// precisely - contest names are reliably self-describing though (e.g. "TA VHF/UHF
// Contest"), so exclude on that basis.
const NON_HF_NAME_RE = /\b(VHF|UHF|SHF|microwave)\b/i;

export interface ContestEntry {
  name: string;
  link: string;
  start: number;
  end: number;
  durationHours: number;
}

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function resolveTimestamp(monthAbbr: string, day: number, hour: number, minute: number, now: number): number | null {
  const month = MONTHS[monthAbbr];
  if (month == null) return null;
  const year = new Date(now).getUTCFullYear();
  let ts = Date.UTC(year, month, day, hour, minute);
  // The feed only ever lists near-term contests (an 8-day window). If the naive
  // year guess lands more than a few days in the past, we crossed a year boundary
  // (e.g. today is late Dec, contest date is early Jan) - use next year instead.
  if (ts < now - 3 * 24 * 60 * 60 * 1000) {
    ts = Date.UTC(year + 1, month, day, hour, minute);
  }
  return ts;
}

const CROSS_DAY_RE = /^(\d{2})(\d{2})Z,\s*([A-Za-z]{3})\s+(\d{1,2})\s+to\s+(\d{2})(\d{2})Z,\s*([A-Za-z]{3})\s+(\d{1,2})$/;
const SAME_DAY_RE = /^(\d{2})(\d{2})Z-(\d{2})(\d{2})Z,\s*([A-Za-z]{3})\s+(\d{1,2})$/;

function parseSegment(segment: string, now: number): { start: number; end: number } | null {
  const trimmed = segment.trim();

  const cross = trimmed.match(CROSS_DAY_RE);
  if (cross) {
    const [, sh, sm, smon, sday, eh, em, emon, eday] = cross;
    const start = resolveTimestamp(smon, Number(sday), Number(sh), Number(sm), now);
    const end = resolveTimestamp(emon, Number(eday), Number(eh), Number(em), now);
    if (start == null || end == null) return null;
    return { start, end };
  }

  const same = trimmed.match(SAME_DAY_RE);
  if (same) {
    const [, sh, sm, eh, em, mon, day] = same;
    const start = resolveTimestamp(mon, Number(day), Number(sh), Number(sm), now);
    const end = resolveTimestamp(mon, Number(day), Number(eh), Number(em), now);
    if (start == null || end == null) return null;
    return { start, end };
  }

  return null;
}

export function parseContestDescription(description: string, now: number): { start: number; end: number } | null {
  const segments = description.split(/\s+and\s+/i);
  let start: number | null = null;
  let end: number | null = null;

  for (const segment of segments) {
    const parsed = parseSegment(segment, now);
    if (!parsed) continue;
    if (start == null || parsed.start < start) start = parsed.start;
    if (end == null || parsed.end > end) end = parsed.end;
  }

  if (start == null || end == null) return null;
  return { start, end };
}

export async function fetchContests(): Promise<ContestEntry[]> {
  const res = await fetch(CONTEST_RSS_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Contest calendar request failed: ${res.status}`);
  const xml = await res.text();

  const parser = new XMLParser();
  const doc = parser.parse(xml);
  const rawItems: Array<Record<string, unknown>> = doc?.rss?.channel?.item ?? [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];
  const now = Date.now();

  const contests: ContestEntry[] = [];
  for (const item of items) {
    const name = String(item?.title ?? '').trim();
    const link = String(item?.link ?? '').trim();
    const description = String(item?.description ?? '').trim();
    if (!name || !description) continue;
    if (NON_HF_NAME_RE.test(name)) continue;

    const parsed = parseContestDescription(description, now);
    if (!parsed) continue;

    const durationHours = (parsed.end - parsed.start) / (60 * 60 * 1000);
    if (durationHours < MIN_CONTEST_HOURS) continue;

    contests.push({ name, link, start: parsed.start, end: parsed.end, durationHours });
  }

  contests.sort((a, b) => a.start - b.start);
  return contests;
}

export interface ContestsCache {
  fetchedAt: number;
  contests: ContestEntry[];
}

export async function getCachedContests(): Promise<ContestsCache | null> {
  const result = await browser.storage.local.get(STORAGE_KEYS.contestsCache);
  const cached = result[STORAGE_KEYS.contestsCache] as ContestsCache | undefined;
  if (!cached) return null;
  if (Date.now() - cached.fetchedAt > CONTESTS_CACHE_MS) return null;
  return cached;
}

export async function fetchAndCacheContests(): Promise<ContestsCache> {
  const contests = await fetchContests();
  const cache: ContestsCache = { fetchedAt: Date.now(), contests };
  await browser.storage.local.set({ [STORAGE_KEYS.contestsCache]: cache });
  return cache;
}
