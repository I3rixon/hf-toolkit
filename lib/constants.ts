export const SOLAR_XML_URL = 'https://www.hamqsl.com/solarxml.php';
export const FETCH_ALARM_NAME = 'fetch-solar-data';
export const FETCH_INTERVAL_MINUTES = 30;
export const HISTORY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const CHART_BUCKET_MS = 3 * 60 * 60 * 1000;

export const STORAGE_KEYS = {
  latest: 'solar:latest',
  history: 'solar:history',
  theme: 'solar:theme',
  bandContinent: 'solar:bandContinent',
  bandActivityCache: 'solar:bandActivityCache',
  contestsCache: 'solar:contestsCache',
  alertsEnabled: 'solar:alertsEnabled',
  alertState: 'solar:alertState',
  notificationLinks: 'solar:notificationLinks',
  myGrid: 'solar:myGrid',
  dxGrid: 'solar:dxGrid',
  antennaFreq: 'solar:antennaFreq',
  antennaType: 'solar:antennaType',
  antennaUnit: 'solar:antennaUnit',
  beaconBandFilter: 'solar:beaconBandFilter',
} as const;

export const BAND_ACTIVITY_CACHE_MS = 30 * 60 * 1000;
export const CONTESTS_CACHE_MS = 60 * 60 * 1000;
export const KINDEX_ALERT_THRESHOLD = 5;
