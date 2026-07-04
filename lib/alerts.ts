import { browser } from 'wxt/browser';
import { fetchAndCacheContests, getCachedContests } from './contests';
import { KINDEX_ALERT_THRESHOLD, STORAGE_KEYS } from './constants';
import type { SolarSnapshot } from './types';

const FLARE_CLASSES = new Set(['M', 'X']);

interface AlertState {
  kindexElevated: boolean;
  xrayFlareActive: boolean;
  goodBandKeys: string[];
  notifiedContests: Array<{ key: string; end: number }>;
}

const DEFAULT_STATE: AlertState = {
  kindexElevated: false,
  xrayFlareActive: false,
  goodBandKeys: [],
  notifiedContests: [],
};

async function getAlertState(): Promise<AlertState> {
  const result = await browser.storage.local.get(STORAGE_KEYS.alertState);
  return (result[STORAGE_KEYS.alertState] as AlertState) ?? DEFAULT_STATE;
}

async function setAlertState(state: AlertState): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEYS.alertState]: state });
}

export async function getAlertsEnabled(): Promise<boolean> {
  const result = await browser.storage.local.get(STORAGE_KEYS.alertsEnabled);
  return (result[STORAGE_KEYS.alertsEnabled] as boolean) ?? false;
}

export async function setAlertsEnabled(enabled: boolean): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEYS.alertsEnabled]: enabled });
}

function parseXrayClass(xray: string): string | null {
  const match = xray.trim().match(/^([A-Za-z])/);
  return match ? match[1].toUpperCase() : null;
}

async function notify(id: string, title: string, message: string, url: string): Promise<void> {
  await browser.notifications.create(id, {
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icon/128.png'),
    title,
    message,
    priority: 1,
  });
  const result = await browser.storage.local.get(STORAGE_KEYS.notificationLinks);
  const links = (result[STORAGE_KEYS.notificationLinks] as Record<string, string>) ?? {};
  links[id] = url;
  await browser.storage.local.set({ [STORAGE_KEYS.notificationLinks]: links });
}

export function registerAlertNotificationHandlers(): void {
  browser.notifications.onClicked.addListener(async (notificationId) => {
    const result = await browser.storage.local.get(STORAGE_KEYS.notificationLinks);
    const links = (result[STORAGE_KEYS.notificationLinks] as Record<string, string>) ?? {};
    const url = links[notificationId];
    if (url) {
      await browser.tabs.create({ url });
      delete links[notificationId];
      await browser.storage.local.set({ [STORAGE_KEYS.notificationLinks]: links });
    }
    await browser.notifications.clear(notificationId);
  });
}

export async function checkSolarAlerts(snapshot: SolarSnapshot): Promise<void> {
  if (!(await getAlertsEnabled())) return;
  const state = await getAlertState();
  const sourceUrl = 'https://www.hamqsl.com/solar101.html';

  const isElevated = (snapshot.kindex ?? 0) >= KINDEX_ALERT_THRESHOLD;
  if (isElevated && !state.kindexElevated) {
    await notify(
      `kindex-${Date.now()}`,
      'Geomagnetic Storm Alert',
      `K-index has risen to ${snapshot.kindex} — expect degraded HF propagation and possible aurora.`,
      sourceUrl
    );
  }
  state.kindexElevated = isElevated;

  const xrayClass = parseXrayClass(snapshot.xray);
  const isFlare = xrayClass != null && FLARE_CLASSES.has(xrayClass);
  if (isFlare && !state.xrayFlareActive) {
    await notify(
      `xray-${Date.now()}`,
      'Solar Flare Alert',
      `X-ray flux at ${snapshot.xray} — HF blackout possible on sunlit paths.`,
      sourceUrl
    );
  }
  state.xrayFlareActive = isFlare;

  const currentGoodKeys = snapshot.bands
    .filter((b) => b.condition.toLowerCase().includes('good'))
    .map((b) => `${b.name}|${b.time}`);
  const newlyGood = currentGoodKeys.filter((k) => !state.goodBandKeys.includes(k));
  if (newlyGood.length > 0) {
    const labels = newlyGood.map((k) => {
      const [name, time] = k.split('|');
      return `${name} (${time === 'night' ? 'Night' : 'Day'})`;
    });
    await notify(`bands-${Date.now()}`, 'Band Opening', `Now Good: ${labels.join(', ')}`, sourceUrl);
  }
  state.goodBandKeys = currentGoodKeys;

  await setAlertState(state);
}

export async function checkContestAlerts(): Promise<void> {
  if (!(await getAlertsEnabled())) return;

  const cache = (await getCachedContests()) ?? (await fetchAndCacheContests());
  const now = Date.now();
  const state = await getAlertState();
  const notified = state.notifiedContests.filter((n) => n.end > now);

  for (const c of cache.contests) {
    const key = `${c.name}-${c.start}`;
    const isLive = now >= c.start && now <= c.end;
    if (isLive && !notified.some((n) => n.key === key)) {
      await notify(`contest-${key}`, 'Contest Live', `${c.name} is now underway.`, c.link);
      notified.push({ key, end: c.end });
    }
  }

  state.notifiedContests = notified;
  await setAlertState(state);
}
