import { browser } from 'wxt/browser';
import './style.css';
import { getAlertsEnabled, setAlertsEnabled } from '../../lib/alerts';
import { BEACONS, getBandStatuses, msRemainingInSlot } from '../../lib/beacons';
import { CONTINENTS, MIN_SPOT_THRESHOLD, fetchAndCacheBandActivity, getCachedBandActivity } from '../../lib/band-activity';
import type { BandActivityData } from '../../lib/band-activity';
import { CHART_BUCKET_MS, HISTORY_RETENTION_MS, STORAGE_KEYS } from '../../lib/constants';
import { MIN_CONTEST_HOURS, fetchAndCacheContests, getCachedContests } from '../../lib/contests';
import type { ContestEntry } from '../../lib/contests';
import { drawBandActivityGrid, effectiveColorMax } from '../../lib/heatmap-canvas';
import { STALE_THRESHOLD_MS, fetchAndStore, getStoredData, msSinceLastFetch } from '../../lib/solar-store';
import type { KHistoryPoint, SolarSnapshot } from '../../lib/types';
import { gridToLatLon, isValidGrid, latLonToGrid } from '../../lib/maidenhead';
import { compassPoint, greatCircle } from '../../lib/geo';
import { solarElevation, subsolarPoint } from '../../lib/grayline';
import { GRAYLINE_THEMES, drawGrayline } from '../../lib/grayline-canvas';
import { ANTENNA_TYPES, calcAntenna, getAntennaType } from '../../lib/antenna';
import { ANTENNA_THEMES, drawAntennaDiagram } from '../../lib/antenna-canvas';

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
  beacons: document.getElementById('panel-beacons')!,
  grayline: document.getElementById('panel-grayline')!,
  beam: document.getElementById('panel-beam')!,
  antenna: document.getElementById('panel-antenna')!,
};

const continentSelect = document.getElementById('continent-select') as HTMLSelectElement;
const bandCanvas = document.getElementById('band-canvas') as HTMLCanvasElement;
const bandLoadingEl = document.getElementById('band-loading')!;
const bandCaptionEl = document.getElementById('band-caption')!;
const legendMaxEl = document.getElementById('legend-max')!;
const contestListEl = document.getElementById('contest-list')!;
const beaconRowsEl = document.getElementById('beacon-rows')!;
const beaconRotationEl = document.getElementById('beacon-rotation')!;
const beaconSlotBadgeEl = document.getElementById('beacon-slot-badge')!;
const beaconCountdownEl = document.getElementById('beacon-countdown-text')!;

const graylineCanvas = document.getElementById('grayline-canvas') as HTMLCanvasElement;
const graylineCaptionEl = document.getElementById('grayline-caption')!;
const beamMyGridEl = document.getElementById('beam-my-grid') as HTMLInputElement;
const beamDxGridEl = document.getElementById('beam-dx-grid') as HTMLInputElement;
const beamErrorEl = document.getElementById('beam-error')!;
const beamResultEl = document.getElementById('beam-result')!;
const beamCompassEl = document.getElementById('beam-compass')!;
const beamShortDegEl = document.getElementById('beam-short-deg')!;
const beamShortCompassEl = document.getElementById('beam-short-compass')!;
const beamLongDegEl = document.getElementById('beam-long-deg')!;
const beamLongCompassEl = document.getElementById('beam-long-compass')!;
const beamDistKmEl = document.getElementById('beam-dist-km')!;
const beamDistMiEl = document.getElementById('beam-dist-mi')!;

const antennaBandPresetEl = document.getElementById('antenna-band-preset') as HTMLSelectElement;
const antennaFreqEl = document.getElementById('antenna-freq') as HTMLInputElement;
const antennaTypeEl = document.getElementById('antenna-type') as HTMLSelectElement;
const antennaKEl = document.getElementById('antenna-k') as HTMLInputElement;
const antennaUnitBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('.unit-btn'));
const antennaCanvas = document.getElementById('antenna-canvas') as HTMLCanvasElement;
const antennaCaptionEl = document.getElementById('antenna-caption')!;

type TabName = 'solar' | 'band' | 'contests' | 'beacons' | 'grayline' | 'beam' | 'antenna';
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
  if (activeTab === 'grayline') renderGrayline();
  if (activeTab === 'antenna') renderAntenna();
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
  tabPanels.beacons.hidden = tab !== 'beacons';
  tabPanels.grayline.hidden = tab !== 'grayline';
  tabPanels.beam.hidden = tab !== 'beam';
  tabPanels.antenna.hidden = tab !== 'antenna';

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
  } else if (tab === 'contests') {
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
  } else if (tab === 'beacons') {
    pageTitleEl.textContent = 'Beacons';
    sourceLinkEl.href = 'https://www.ncdxf.org/beacon/';
    sourceLinkEl.textContent = 'Source: NCDXF/IARU';
    staleBadgeEl.hidden = true;
    renderBeacons();
  } else if (tab === 'grayline') {
    pageTitleEl.textContent = 'Grayline';
    sourceLinkEl.href = 'https://en.wikipedia.org/wiki/Grey-line_radio_propagation';
    sourceLinkEl.textContent = 'Day/night terminator';
    staleBadgeEl.hidden = true;
    renderGrayline();
  } else if (tab === 'beam') {
    pageTitleEl.textContent = 'Beam Heading';
    sourceLinkEl.href = 'https://en.wikipedia.org/wiki/Maidenhead_Locator_System';
    sourceLinkEl.textContent = 'Maidenhead great-circle';
    staleBadgeEl.hidden = true;
    if (activeTab === 'beam') updatedLineEl.textContent = 'Enter two grid squares';
    renderBeam();
  } else {
    pageTitleEl.textContent = 'Antenna Calculator';
    sourceLinkEl.href = 'https://en.wikipedia.org/wiki/Dipole_antenna';
    sourceLinkEl.textContent = 'ARRL-style resonant length formulas';
    staleBadgeEl.hidden = true;
    renderAntenna();
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

// ---------- Beacons tab ----------

function renderBeacons() {
  const now = Date.now();
  const statuses = getBandStatuses(now);
  const activeCalls = new Set(statuses.map((s) => s.beacon.call));

  beaconRowsEl.innerHTML = statuses
    .map(
      (s) => `
      <tr>
        <td class="band-name">${s.frequency}</td>
        <td><span class="beacon-call">${s.beacon.call}</span></td>
        <td>${s.beacon.location}</td>
      </tr>`
    )
    .join('');

  beaconRotationEl.innerHTML = BEACONS.map(
    (b) => `<li class="${activeCalls.has(b.call) ? 'active' : ''}">${b.call}</li>`
  ).join('');

  const secondsLeft = Math.ceil(msRemainingInSlot(now) / 1000);
  beaconSlotBadgeEl.textContent = `:${String(new Date(now).getUTCSeconds()).padStart(2, '0')} UTC`;
  beaconCountdownEl.textContent = `next change in ${secondsLeft}s`;

  if (activeTab === 'beacons') {
    updatedLineEl.textContent = `Live — updates every 10s`;
  }
}

setInterval(() => {
  if (activeTab === 'beacons') renderBeacons();
}, 1000);

// ---------- Grayline tab ----------

let myGridValue = '';

function fmtLat(lat: number): string {
  return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}`;
}

function fmtLon(lon: number): string {
  return `${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`;
}

function fmtUtc(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function renderGrayline() {
  const now = new Date();
  const sub = subsolarPoint(now);
  const theme = GRAYLINE_THEMES[isDarkMode() ? 'dark' : 'light'];
  const qth = isValidGrid(myGridValue) ? gridToLatLon(myGridValue) : null;
  drawGrayline(graylineCanvas, { subsolar: sub, qth, theme });

  const subGrid = latLonToGrid(sub.lat, sub.lon).slice(0, 4).toUpperCase();
  let caption = `Sun overhead near ${fmtLat(sub.lat)} ${fmtLon(sub.lon)} (${subGrid}).`;
  if (qth) {
    const elev = solarElevation(qth.lat, qth.lon, sub);
    const state =
      elev >= 6 ? 'in daylight' : elev >= -0.8 ? 'on the grayline' : elev >= -6 ? 'in twilight' : 'in darkness';
    caption += ` Your QTH (${myGridValue.toUpperCase()}) is ${state} — sun ${elev >= 0 ? '+' : ''}${elev.toFixed(0)}°.`;
  } else {
    caption += ' Set your grid on the Beam tab to plot your QTH.';
  }
  graylineCaptionEl.textContent = caption;

  if (activeTab === 'grayline') {
    updatedLineEl.textContent = `Terminator at ${fmtUtc(now)} UTC · updates each minute`;
  }
}

setInterval(() => {
  if (activeTab === 'grayline') renderGrayline();
}, 60_000);

// ---------- Beam Heading tab ----------

function needle(bearingDeg: number, len: number, color: string, width: number, dashed: boolean): string {
  const b = (bearingDeg * Math.PI) / 180;
  const x = 60 + Math.sin(b) * len;
  const y = 60 - Math.cos(b) * len;
  return `<line x1="60" y1="60" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${color}" stroke-width="${width}" stroke-linecap="round"${dashed ? ' stroke-dasharray="3 3"' : ''} />`;
}

function drawCompass(shortB: number, longB: number) {
  const ring = `<circle cx="60" cy="60" r="52" fill="none" stroke="var(--border)" stroke-width="2" />`;
  const ticks = [0, 90, 180, 270]
    .map((a) => {
      const b = (a * Math.PI) / 180;
      const x1 = 60 + Math.sin(b) * 52;
      const y1 = 60 - Math.cos(b) * 52;
      const x2 = 60 + Math.sin(b) * 45;
      const y2 = 60 - Math.cos(b) * 45;
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="var(--text-muted)" stroke-width="2" />`;
    })
    .join('');
  const labels = `
    <text x="60" y="17" text-anchor="middle" class="beam-compass-label">N</text>
    <text x="107" y="64" text-anchor="middle" class="beam-compass-label">E</text>
    <text x="60" y="111" text-anchor="middle" class="beam-compass-label">S</text>
    <text x="13" y="64" text-anchor="middle" class="beam-compass-label">W</text>`;
  const longNeedle = needle(longB, 40, 'var(--text-muted)', 2, true);
  const shortNeedle = needle(shortB, 44, 'var(--accent)', 3.5, false);
  const hub = `<circle cx="60" cy="60" r="4" fill="var(--accent)" />`;
  beamCompassEl.innerHTML = ring + ticks + labels + longNeedle + shortNeedle + hub;
}

function renderBeam() {
  const myG = beamMyGridEl.value.trim();
  const dxG = beamDxGridEl.value.trim();

  if (!myG && !dxG) {
    beamErrorEl.hidden = true;
    beamResultEl.hidden = true;
    return;
  }

  const from = gridToLatLon(myG);
  const to = gridToLatLon(dxG);
  if (!from || !to) {
    beamResultEl.hidden = true;
    beamErrorEl.hidden = false;
    if (myG && !from) beamErrorEl.textContent = `"${myG.toUpperCase()}" isn't a valid grid square.`;
    else if (dxG && !to) beamErrorEl.textContent = `"${dxG.toUpperCase()}" isn't a valid grid square.`;
    else beamErrorEl.textContent = 'Enter both grid squares (e.g. FN31 and JO65).';
    return;
  }

  const r = greatCircle(from, to);
  beamErrorEl.hidden = true;
  beamResultEl.hidden = false;
  beamShortDegEl.textContent = String(Math.round(r.shortPathBearing) % 360);
  beamShortCompassEl.textContent = compassPoint(r.shortPathBearing);
  beamLongDegEl.textContent = String(Math.round(r.longPathBearing) % 360);
  beamLongCompassEl.textContent = compassPoint(r.longPathBearing);
  beamDistKmEl.textContent = Math.round(r.distanceKm).toLocaleString();
  beamDistMiEl.textContent = Math.round(r.distanceMi).toLocaleString();
  drawCompass(r.shortPathBearing, r.longPathBearing);

  if (activeTab === 'beam') {
    updatedLineEl.textContent = `${myG.toUpperCase()} → ${dxG.toUpperCase()}`;
  }
}

function onBeamInput() {
  myGridValue = beamMyGridEl.value.trim();
  browser.storage.local.set({
    [STORAGE_KEYS.myGrid]: beamMyGridEl.value.trim(),
    [STORAGE_KEYS.dxGrid]: beamDxGridEl.value.trim(),
  });
  renderBeam();
}

beamMyGridEl.addEventListener('input', onBeamInput);
beamDxGridEl.addEventListener('input', onBeamInput);

async function initGrids() {
  const stored = await browser.storage.local.get([STORAGE_KEYS.myGrid, STORAGE_KEYS.dxGrid]);
  const my = (stored[STORAGE_KEYS.myGrid] as string | undefined) ?? '';
  const dx = (stored[STORAGE_KEYS.dxGrid] as string | undefined) ?? '';
  beamMyGridEl.value = my;
  beamDxGridEl.value = dx;
  myGridValue = my.trim();
}

// ---------- Antenna Calculator tab ----------

let antennaUnit: 'ft' | 'm' = 'ft';

function fmtFt(ft: number): string {
  return `${ft.toFixed(1)} ft`;
}

function fmtM(m: number): string {
  return `${m.toFixed(2)} m`;
}

function fmtLen(ft: number, m: number): string {
  return antennaUnit === 'ft' ? fmtFt(ft) : fmtM(m);
}

function renderAntenna() {
  const freq = parseFloat(antennaFreqEl.value);
  if (!Number.isFinite(freq) || freq <= 0) {
    antennaCaptionEl.textContent = 'Enter a frequency in MHz.';
    return;
  }

  const typeId = antennaTypeEl.value;
  const type = getAntennaType(typeId);
  const k = parseFloat(antennaKEl.value) || type.defaultK;
  const result = calcAntenna(freq, typeId, k);
  const theme = ANTENNA_THEMES[isDarkMode() ? 'dark' : 'light'];

  const totalLabel = `${fmtLen(result.totalFt, result.totalM)} total`;
  let legLabel = '';
  let detail = '';
  if (type.id === 'dipole' && result.legFt != null && result.legM != null) {
    legLabel = fmtLen(result.legFt, result.legM) + '/leg';
    detail = `Each leg: ${fmtLen(result.legFt, result.legM)}.`;
  } else if (type.id === 'loop' && result.sideFt != null && result.sideM != null) {
    legLabel = fmtLen(result.sideFt, result.sideM) + '/side';
    detail = `~${fmtLen(result.sideFt, result.sideM)} per side (4-sided loop).`;
  }

  drawAntennaDiagram(antennaCanvas, { type: type.id, totalLabel, legLabel, theme });

  antennaCaptionEl.textContent = `${type.label} for ${freq} MHz: ${fmtLen(result.totalFt, result.totalM)} (K=${k.toFixed(2)}). ${detail}`;

  if (activeTab === 'antenna') {
    updatedLineEl.textContent = `${type.label} · ${freq} MHz`;
  }
}

antennaBandPresetEl.addEventListener('change', () => {
  antennaFreqEl.value = antennaBandPresetEl.value;
  onAntennaInput();
});

antennaTypeEl.addEventListener('change', () => {
  antennaKEl.value = String(getAntennaType(antennaTypeEl.value).defaultK);
  onAntennaInput();
});

antennaFreqEl.addEventListener('input', onAntennaInput);
antennaKEl.addEventListener('input', onAntennaInput);

antennaUnitBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    antennaUnit = btn.dataset.unit as 'ft' | 'm';
    antennaUnitBtns.forEach((b) => b.classList.toggle('active', b === btn));
    browser.storage.local.set({ [STORAGE_KEYS.antennaUnit]: antennaUnit });
    renderAntenna();
  });
});

function onAntennaInput() {
  browser.storage.local.set({
    [STORAGE_KEYS.antennaFreq]: antennaFreqEl.value,
    [STORAGE_KEYS.antennaType]: antennaTypeEl.value,
  });
  renderAntenna();
}

async function initAntenna() {
  const stored = await browser.storage.local.get([STORAGE_KEYS.antennaFreq, STORAGE_KEYS.antennaType, STORAGE_KEYS.antennaUnit]);
  const freq = stored[STORAGE_KEYS.antennaFreq] as string | undefined;
  const typeId = stored[STORAGE_KEYS.antennaType] as string | undefined;
  const unit = stored[STORAGE_KEYS.antennaUnit] as 'ft' | 'm' | undefined;

  if (freq) antennaFreqEl.value = freq;
  if (typeId && ANTENNA_TYPES.some((t) => t.id === typeId)) antennaTypeEl.value = typeId;
  antennaKEl.value = String(getAntennaType(antennaTypeEl.value).defaultK);
  if (unit === 'ft' || unit === 'm') {
    antennaUnit = unit;
    antennaUnitBtns.forEach((b) => b.classList.toggle('active', b.dataset.unit === unit));
  }
}

// ---------- Refresh button (context-aware) ----------

refreshBtn.addEventListener('click', () => {
  if (activeTab === 'solar') {
    doRefreshSolar();
  } else if (activeTab === 'band') {
    loadBand(continentSelect.value, true);
  } else if (activeTab === 'contests') {
    loadContests(true);
  } else if (activeTab === 'beacons') {
    renderBeacons();
  } else if (activeTab === 'grayline') {
    renderGrayline();
  } else if (activeTab === 'beam') {
    renderBeam();
  } else {
    renderAntenna();
  }
});

// ---------- Init ----------

initTheme();
initAlerts();
initGrids();
initAntenna();
initBandContinent().then(() => {
  loadAndRenderSolar().then((latest) => {
    if (msSinceLastFetch(latest) > STALE_THRESHOLD_MS) {
      doRefreshSolar();
    }
  });
});
