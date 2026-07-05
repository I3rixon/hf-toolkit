import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'HF Toolkit',
    description: 'HF ham radio toolkit: solar conditions & 7-day K-index history (hamqsl.com), live band activity heatmap by continent (dxheat.com), upcoming HF contests (WA7BNM Contest Calendar), the NCDXF/IARU beacon schedule, a live grayline/terminator map, a Maidenhead beam-heading calculator, and optional alerts for K-index spikes, solar flares, band openings, and contests going live.',
    permissions: ['storage', 'alarms', 'notifications'],
    host_permissions: ['https://www.hamqsl.com/*', 'https://dxheat.com/*', 'https://www.contestcalendar.com/*'],
    action: {
      default_title: 'HF Toolkit',
    },
  },
});
