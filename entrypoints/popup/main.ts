import { browser } from 'wxt/browser';
import './style.css';
import { getAlertsEnabled, setAlertsEnabled } from '../../lib/alerts';
import { CONTINENTS, MIN_SPOT_THRESHOLD, fetchAndCacheBandActivity, getCachedBandActivity } from '../../lib/band-activity';
import type { BandActivityData } from '../../lib/band-activity';
import { CHART_BUCKET_MS, HISTORY_RETENTION_MS, STORAGE_KEYS } from '../../lib/constants';
import { MIN_CONTEST_HOURS, fetchAndCacheContests, getCachedContests } from '../../lib/contests';
import type { ContestEntry } from '../../lib/contests';
import { drawBandActivityGrid, effectiveColorMax } from '../../lib/heatmap-canvas';
import { STALE_THRESHOLD_MS, fetchAndStore, getStoredData, msSinceLastFetch } from '../../lib/solar-store';
import type { KHistoryPoint, SolarSnapshot } from '../../lib/types';

const solarPanelEl = document.getElementById('panel-solar')!;
const updatedLineEl = document.getElementById('updated-line')!;
const staleBadgeEl = document.getElementById('stale-badge')!;
const refreshBtn = document.getElementById('refresh-btn')!;
const themeToggleBtn = document.getElementById('theme-toggle')!;
const alertsToggleBtn = document.getElementById('alerts-toggle')!;
const sourceLinkEl = document.getElementById('source-link') as HTMLAnchorElement;
const pageTitleEl = document.getElementById('page-title')!;
const versionTagEl = document.getElementById('version-tag')!;

versionTagEl.textContent = `HF Toolkit v${browser.runtime.getManifest().version}`;

const tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.tab-btn'));
const tabPanels = {
  solar: document.getElementById('panel-solar')!,
  band: document.getElementById('panel-band')!,
  contests: document.getElementById('panel-contests')!,
};

const continentSelect = document.getElementById('continent-select') as HTMLSelectElement;
const bandCanvas = document.getElementById('band-canvas') as HTMLCanvasElement;
const bandLoadingEl = document.getElementById('band-loading')!;
const bandCaptionEl = document.getElementById('band-caption')!;
const legendMaxEl = document.getElementById('legend-max')!;
const contestListEl = document.getElementById('contest-list')!;

type TabName = 'solar' | 'band' | 'contests';
let activeTab: TabName = 'solar';
let latestBandData: BandActivityData | null = null;
let latestContests: ContestEntry[] | null = null;
let contestsFetchedAt: number | null = null;

// ---------- Theme ----------

type Theme = 'light' | 'dark';

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  themeToggleBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

async function initTheme() {
  const stored = await browser.storage.local.get(STORAGE_KEYS.theme);
  const theme: Theme = (stored[STORAGE_KEYS.theme] as Theme) ?? (systemPrefersDark() ? 'dark' : 'light');
  applyTheme(theme);
}

themeToggleBtn.addEventListener('click', async () => {
  const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  const next: Theme = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  await browser.storage.local.set({ [STORAGE_KEYS.theme]: next });
  if (activeTab === 'band') renderBandCanvas();
});

// ---------- Alerts ----------

async function applyAlertsButton(enabled: boolean) {
  alertsToggleBtn.textContent = enabled ? '🔔' : '🔕';
  alertsToggleBtn.title = enabled
    ? 'Alerts on — K-index spikes, solar flares, band openings, contests going live (click to disable)'
    : 'Alerts off (click to enable)';
}

async function initAlerts() {
  applyAlertsButton(await getAlertsEnabled());
}

alertsToggleBtn.addEventListener('click', async () => {
  const next = !(await getAlertsEnabled());
  await setAlertsEnabled(next);
  await applyAlertsButton(next);
});

// ---------- Tabs ----------

function setActiveTab(tab: TabName) {
  activeTab = tab;
  tabButtons.forEach((btn) => {
    const isActive = btn.dataset.tab === tab;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  });
  tabPanels.solar.hidden = tab !== 'solar';
  tabPanels.band.hidden = tab !== 'band';
  tabPanels.contests.hidden = tab !== 'contests';

  if (tab === 'solar') {
    pageTitleEl.textContent = 'Solar Activity';
    sourceLinkEl.href = 'https://www.hamqsl.com/solar101.html';
    sourceLinkEl.textContent = 'Source: N0NBH · hamqsl.com';
    loadAndRenderSolar();
  } else if (tab === 'band') {
    pageTitleEl.textContent = 'Band Activity';
    sourceLinkEl.href = 'https://dxheat.com/';
    sourceLinkEl.textContent = 'Source: dxheat.com';
    staleBadgeEl.hidden = true;
    if (!latestBandData || latestBandData.continent !== continentSelect.value) {
      loadBand(continentSelect.value, false);
    } else {
      renderBandCanvas();
    }
  } else {
    pageTitleEl.textContent = 'Contests';
    sourceLinkEl.href = 'https://www.contestcalendar.com/';
    sourceLinkEl.textContent = 'Source: WA7BNM Contest Calendar';
    staleBadgeEl.hidden = true;
    if (!latestContests) {
      updatedLineEl.textContent = 'Loading…';
      loadContests(false);
    } else {
      renderContestList();
    }
  }
}

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => setActiveTab(btn.dataset.tab as TabName));
});

// ---------- Solar tab ----------

function kColor(k: number | null): string {
  if (k == null) return 'var(--border)';
  if (k <= 2) return 'var(--k-quiet)';
  if (k <= 4) return 'var(--k-unsettled)';
  if (k === 5) return 'var(--k-active)';
  if (k === 6) return 'var(--k-storm)';
  return 'var(--k-severe)';
}

function badgeClass(condition: string): string {
  const c = condition.toLowerCase();
  if (c.includes('good')) return 'good';
  if (c.includes('fair')) return 'fair';
  if (c.includes('poor')) return 'poor';
  return 'unknown';
}

function fmtAge(ms: number): string {
  if (!Number.isFinite(ms)) return 'never';
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

function buildChartBars(history: KHistoryPoint[]): string {
  const now = Date.now();
  const bucketCount = Math.round(HISTORY_RETENTION_MS / CHART_BUCKET_MS);
  const buckets: (number | null)[] = new Array(bucketCount).fill(null);

  // When multiple readings land in the same 3h bucket, keep the highest one -
  // the bucket should reflect the peak disturbance in that window, not just
  // whichever sample happened to be polled last.
  for (const point of history) {
    if (point.kindex == null) continue;
    const age = now - point.fetchedAt;
    if (age < 0 || age > HISTORY_RETENTION_MS) continue;
    const idx = bucketCount - 1 - Math.floor(age / CHART_BUCKET_MS);
    if (idx < 0 || idx >= bucketCount) continue;
    const existing = buckets[idx];
    if (existing == null || point.kindex > existing) {
      buckets[idx] = point.kindex;
    }
  }

  return buckets
    .map((k) => {
      const heightPct = k == null ? 6 : Math.max(8, (k / 9) * 100);
      const title = k == null ? 'no data' : `K=${k}`;
      return `<div class="chart-bar" style="height:${heightPct}%;background:${kColor(k)}" title="${title}"></div>`;
    })
    .join('');
}

function renderBandConditionRows(snapshot: SolarSnapshot): string {
  const byName = new Map<string, { day?: string; night?: string }>();
  for (const b of snapshot.bands) {
    const entry = byName.get(b.name) ?? {};
    entry[b.time] = b.condition;
    byName.set(b.name, entry);
  }
  if (byName.size === 0) {
    return `<tr><td colspan="3" style="color:var(--text-muted)">No band data reported</td></tr>`;
  }
  return [...byName.entries()]
    .map(
      ([name, { day, night }]) => `
      <tr>
        <td class="band-name">${name}</td>
        <td>${day ? `<span class="badge ${badgeClass(day)}">${day}</span>` : '—'}</td>
        <td>${night ? `<span class="badge ${badgeClass(night)}">${night}</span>` : '—'}</td>
      </tr>`
    )
    .join('');
}

function renderSolar(latest: SolarSnapshot | null, history: KHistoryPoint[]) {
  if (!latest) {
    solarPanelEl.innerHTML = `<p class="loading">Fetching latest data…</p>`;
    if (activeTab === 'solar') updatedLineEl.textContent = 'No data yet';
    staleBadgeEl.hidden = true;
    return;
  }

  if (activeTab === 'solar') {
    updatedLineEl.textContent = `Updated: ${latest.updated || 'unknown'} · fetched ${fmtAge(Date.now() - latest.fetchedAt)}`;
    staleBadgeEl.hidden = msSinceLastFetch(latest) <= STALE_THRESHOLD_MS;
  }

  const auroraPct = latest.aurora == null ? 0 : Math.min(100, (latest.aurora / 9) * 100);

  solarPanelEl.innerHTML = `
    <div class="stat-grid">
      <div class="stat-tile k-tile">
        <div class="value" style="background:${kColor(latest.kindex)};color:#0b0e14">${latest.kindex ?? '—'}</div>
        <div class="label">K-index</div>
      </div>
      <div class="stat-tile">
        <div class="value">${latest.aindex ?? '—'}</div>
        <div class="label">A-index</div>
      </div>
      <div class="stat-tile">
        <div class="value">${latest.solarflux ?? '—'}</div>
        <div class="label">Solar Flux</div>
      </div>
      <div class="stat-tile">
        <div class="value">${latest.sunspots ?? '—'}</div>
        <div class="label">Sunspots</div>
      </div>
      <div class="stat-tile">
        <div class="value">${latest.xray || '—'}</div>
        <div class="label">X-ray</div>
      </div>
      <div class="stat-tile">
        <div class="value">${latest.solarwind ?? '—'}</div>
        <div class="label">Solar Wind</div>
      </div>
      <div class="stat-tile wide">
        <div class="value">${latest.signalnoise || '—'}</div>
        <div class="label">Signal/Noise</div>
      </div>
    </div>

    <div class="section-title">Aurora Activity</div>
    <div class="aurora-meter">
      <div class="aurora-track"><div class="aurora-fill" style="width:${auroraPct}%"></div></div>
      <div class="aurora-value">${latest.aurora ?? '—'}</div>
    </div>

    <div class="section-title">K-index — Past 7 Days</div>
    <div class="chart-wrap">
      <div class="chart-bars">${buildChartBars(history)}</div>
      <div class="chart-scale"><span>7d ago</span><span>now</span></div>
    </div>

    <div class="section-title">Band Conditions</div>
    <table class="band-table">
      <thead><tr><th>Band</th><th>Day</th><th>Night</th></tr></thead>
      <tbody>${renderBandConditionRows(latest)}</tbody>
    </table>
  `;
}

async function loadAndRenderSolar() {
  const { latest, history } = await getStoredData();
  renderSolar(latest, history);
  return latest;
}

async function doRefreshSolar() {
  refreshBtn.classList.add('spinning');
  try {
    await fetchAndStore();
  } catch (err) {
    console.error('[solar] popup refresh failed', err);
  } finally {
    await loadAndRenderSolar();
    refreshBtn.classList.remove('spinning');
  }
}

// ---------- Band Activity tab ----------

for (const cont of CONTINENTS) {
  const opt = document.createElement('option');
  opt.value = cont.code;
  opt.textContent = cont.label;
  continentSelect.appendChild(opt);
}

function isDarkMode(): boolean {
  return document.documentElement.dataset.theme === 'dark';
}

function renderBandCanvas() {
  if (!latestBandData) return;
  bandLoadingEl.hidden = true;
  drawBandActivityGrid(bandCanvas, latestBandData.points, latestBandData.max, {
    gridLine: isDarkMode() ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)',
    label: isDarkMode() ? '#9198a8' : '#676e7c',
  });
  legendMaxEl.textContent = latestBandData.points.length > 0 ? String(effectiveColorMax(latestBandData.max)) : '0';

  const contLabel = CONTINENTS.find((c) => c.code === latestBandData!.continent)?.label ?? latestBandData.continent;
  const age = fmtAge(Date.now() - latestBandData.fetchedAt);
  const peak = latestBandData.max > 0 ? ` · peak ${latestBandData.max} spots/hr` : '';

  if (latestBandData.points.length === 0 && latestBandData.hadRawSpots) {
    bandCaptionEl.textContent = `No notable activity in ${contLabel} right now (cells with fewer than ${MIN_SPOT_THRESHOLD} spots/hour are hidden)${peak} · fetched ${age}`;
  } else if (latestBandData.points.length === 0) {
    bandCaptionEl.textContent = `No DX spots reported for ${contLabel} in the last 60 minutes · fetched ${age}`;
  } else {
    bandCaptionEl.textContent = `Spots from/of stations in ${contLabel} during the last 60 minutes, by continent and band${peak} · fetched ${age}`;
  }

  if (activeTab === 'band') {
    updatedLineEl.textContent = `Continent: ${contLabel} · fetched ${age}`;
  }
}

async function loadBand(continent: string, forceRefresh: boolean) {
  if (!forceRefresh) {
    const cached = await getCachedBandActivity(continent);
    if (cached) {
      latestBandData = cached;
      renderBandCanvas();
      return;
    }
  }

  refreshBtn.classList.add('spinning');
  bandLoadingEl.hidden = false;
  bandLoadingEl.textContent = 'Fetching latest spots…';
  try {
    latestBandData = await fetchAndCacheBandActivity(continent);
    renderBandCanvas();
  } catch (err) {
    console.error('[band-activity] fetch failed', err);
    bandLoadingEl.hidden = false;
    bandLoadingEl.textContent = 'Failed to load band activity.';
    bandLoadingEl.classList.add('error');
  } finally {
    refreshBtn.classList.remove('spinning');
  }
}

continentSelect.addEventListener('change', async () => {
  await browser.storage.local.set({ [STORAGE_KEYS.bandContinent]: continentSelect.value });
  loadBand(continentSelect.value, false);
});

async function initBandContinent() {
  const stored = await browser.storage.local.get(STORAGE_KEYS.bandContinent);
  const saved = stored[STORAGE_KEYS.bandContinent] as string | undefined;
  continentSelect.value = saved && CONTINENTS.some((c) => c.code === saved) ? saved : 'EU';
}

// ---------- Contests tab ----------

function fmtContestTime(ts: number): string {
  const d = new Date(ts);
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${weekday} ${hh}${mm}Z`;
}

function fmtCountdown(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h`;
  return `${Math.round(hr / 24)}d`;
}

function renderContestList() {
  if (!latestContests) return;

  const now = Date.now();
  const upcoming = latestContests.filter((c) => c.end > now);

  if (upcoming.length === 0) {
    contestListEl.innerHTML = `<li class="loading">No full-length (${MIN_CONTEST_HOURS}h+) contests in the current window.</li>`;
  } else {
    contestListEl.innerHTML = upcoming
      .map((c) => {
        const isLive = now >= c.start && now <= c.end;
        const status = isLive ? `LIVE · ends in ${fmtCountdown(c.end - now)}` : `starts in ${fmtCountdown(c.start - now)}`;
        return `
          <li class="contest-item">
            <div class="contest-row">
              <a class="contest-name" href="${c.link}" target="_blank" rel="noopener">${c.name}</a>
              <span class="contest-status${isLive ? ' live' : ''}">${status}</span>
            </div>
            <div class="contest-time">${fmtContestTime(c.start)} – ${fmtContestTime(c.end)} · ${Math.round(c.durationHours)}h</div>
          </li>`;
      })
      .join('');
  }

  if (activeTab === 'contests' && contestsFetchedAt != null) {
    updatedLineEl.textContent = `${upcoming.length} upcoming · fetched ${fmtAge(Date.now() - contestsFetchedAt)}`;
  }
}

async function loadContests(forceRefresh: boolean) {
  if (!forceRefresh) {
    const cached = await getCachedContests();
    if (cached) {
      latestContests = cached.contests;
      contestsFetchedAt = cached.fetchedAt;
      renderContestList();
      return;
    }
  }

  refreshBtn.classList.add('spinning');
  contestListEl.innerHTML = `<li class="loading">Fetching contest calendar…</li>`;
  try {
    const cache = await fetchAndCacheContests();
    latestContests = cache.contests;
    contestsFetchedAt = cache.fetchedAt;
    renderContestList();
  } catch (err) {
    console.error('[contests] fetch failed', err);
    contestListEl.innerHTML = `<li class="loading error">Failed to load contest calendar.</li>`;
  } finally {
    refreshBtn.classList.remove('spinning');
  }
}

// ---------- Refresh button (context-aware) ----------

refreshBtn.addEventListener('click', () => {
  if (activeTab === 'solar') {
    doRefreshSolar();
  } else if (activeTab === 'band') {
    loadBand(continentSelect.value, true);
  } else {
    loadContests(true);
  }
});

// ---------- Init ----------

initTheme();
initAlerts();
initBandContinent().then(() => {
  loadAndRenderSolar().then((latest) => {
    if (msSinceLastFetch(latest) > STALE_THRESHOLD_MS) {
      doRefreshSolar();
    }
  });
});
