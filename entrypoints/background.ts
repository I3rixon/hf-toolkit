import { browser } from 'wxt/browser';
import { checkContestAlerts, checkSolarAlerts, registerAlertNotificationHandlers } from '../lib/alerts';
import { FETCH_ALARM_NAME, FETCH_INTERVAL_MINUTES } from '../lib/constants';
import { fetchAndStore } from '../lib/solar-store';

export default defineBackground(() => {
  const refresh = async () => {
    try {
      const snapshot = await fetchAndStore();
      await checkSolarAlerts(snapshot);
      await checkContestAlerts();
    } catch (err) {
      console.error('[solar] fetch failed', err);
    }
  };

  registerAlertNotificationHandlers();

  browser.runtime.onInstalled.addListener(() => {
    browser.alarms.create(FETCH_ALARM_NAME, { periodInMinutes: FETCH_INTERVAL_MINUTES });
    refresh();
  });

  browser.runtime.onStartup.addListener(() => {
    refresh();
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === FETCH_ALARM_NAME) refresh();
  });
});
