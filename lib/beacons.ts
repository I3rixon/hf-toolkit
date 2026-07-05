// NCDXF/IARU International Beacon Project schedule.
// Algorithm and station list confirmed against the official BeaconClock.js
// (https://www.ncdxf.org/beacon/BeaconClock.js): every 10 seconds a global slot
// counter n = floor(Date.now()/10000) % 18 advances; for band index b (0-4),
// the beacon currently transmitting on that band is beacons[(n - b + 18) % 18].
// The full 18-beacon x 5-band pattern repeats every 3 minutes.

export const BEACON_FREQUENCIES = ['14.100', '18.110', '21.150', '24.930', '28.200'];

export const BAND_LABELS: Record<string, string> = {
  '14.100': '20m',
  '18.110': '17m',
  '21.150': '15m',
  '24.930': '12m',
  '28.200': '10m',
};

export interface Beacon {
  call: string;
  location: string;
  lat: number;
  lon: number;
}

export const BEACONS: Beacon[] = [
  { call: '4U1UN', location: 'United Nations, New York, USA', lat: 40.75, lon: -73.97 },
  { call: 'VE8AT', location: 'Inuvik, NT, Canada', lat: 68.36, lon: -133.72 },
  { call: 'W6WX', location: 'Mt Umunhum, California, USA', lat: 37.15, lon: -121.89 },
  { call: 'KH6RS', location: 'Maui, Hawaii, USA', lat: 20.75, lon: -156.45 },
  { call: 'ZL6B', location: 'Masterton, New Zealand', lat: -40.96, lon: 175.65 },
  { call: 'VK6RBP', location: 'Rolystone, Australia', lat: -32.08, lon: 116.05 },
  { call: 'JA2IGY', location: 'Mt Asama, Japan', lat: 36.4, lon: 138.5 },
  { call: 'RR9O', location: 'Novosibirsk, Russia', lat: 55.0, lon: 82.9 },
  { call: 'VR2B', location: 'Hong Kong', lat: 22.3, lon: 114.2 },
  { call: '4S7B', location: 'Colombo, Sri Lanka', lat: 6.93, lon: 79.85 },
  { call: 'ZS6DN', location: 'Pretoria, South Africa', lat: -25.75, lon: 28.19 },
  { call: '5Z4B', location: 'Kikuyu, Kenya', lat: -1.24, lon: 36.66 },
  { call: '4X6TU', location: 'Tel Aviv, Israel', lat: 32.08, lon: 34.78 },
  { call: 'OH2B', location: 'Lohja, Finland', lat: 60.25, lon: 24.07 },
  { call: 'CS3B', location: 'Madeira', lat: 32.65, lon: -16.91 },
  { call: 'LU4AA', location: 'Buenos Aires, Argentina', lat: -34.6, lon: -58.4 },
  { call: 'OA4B', location: 'Lima, Peru', lat: -12.05, lon: -77.05 },
  { call: 'YV5B', location: 'Caracas, Venezuela', lat: 10.5, lon: -66.9 },
];

const SLOT_MS = 10_000;
const BEACON_COUNT = BEACONS.length;
const BAND_COUNT = BEACON_FREQUENCIES.length;

export function currentSlot(atMs: number = Date.now()): number {
  return Math.floor(atMs / SLOT_MS) % BEACON_COUNT;
}

export function msRemainingInSlot(atMs: number = Date.now()): number {
  return SLOT_MS - (atMs % SLOT_MS);
}

export function activeBeaconIndexForBand(bandIndex: number, atMs: number = Date.now()): number {
  const n = currentSlot(atMs);
  return (n - bandIndex + BEACON_COUNT) % BEACON_COUNT;
}

export interface BandStatus {
  frequency: string;
  beacon: Beacon;
}

export function getBandStatuses(atMs: number = Date.now()): BandStatus[] {
  return BEACON_FREQUENCIES.map((frequency, bandIndex) => ({
    frequency,
    beacon: BEACONS[activeBeaconIndexForBand(bandIndex, atMs)],
  }));
}

export { BAND_COUNT };
