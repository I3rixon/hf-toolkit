// NCDXF/IARU International Beacon Project schedule.
// Algorithm and station list confirmed against the official BeaconClock.js
// (https://www.ncdxf.org/beacon/BeaconClock.js): every 10 seconds a global slot
// counter n = floor(Date.now()/10000) % 18 advances; for band index b (0-4),
// the beacon currently transmitting on that band is beacons[(n - b + 18) % 18].
// The full 18-beacon x 5-band pattern repeats every 3 minutes.

export const BEACON_FREQUENCIES = ['14.100', '18.110', '21.150', '24.930', '28.200'];

export interface Beacon {
  call: string;
  location: string;
}

export const BEACONS: Beacon[] = [
  { call: '4U1UN', location: 'United Nations, New York, USA' },
  { call: 'VE8AT', location: 'Inuvik, NT, Canada' },
  { call: 'W6WX', location: 'Mt Umunhum, California, USA' },
  { call: 'KH6RS', location: 'Maui, Hawaii, USA' },
  { call: 'ZL6B', location: 'Masterton, New Zealand' },
  { call: 'VK6RBP', location: 'Rolystone, Australia' },
  { call: 'JA2IGY', location: 'Mt Asama, Japan' },
  { call: 'RR9O', location: 'Novosibirsk, Russia' },
  { call: 'VR2B', location: 'Hong Kong' },
  { call: '4S7B', location: 'Colombo, Sri Lanka' },
  { call: 'ZS6DN', location: 'Pretoria, South Africa' },
  { call: '5Z4B', location: 'Kikuyu, Kenya' },
  { call: '4X6TU', location: 'Tel Aviv, Israel' },
  { call: 'OH2B', location: 'Lohja, Finland' },
  { call: 'CS3B', location: 'Madeira' },
  { call: 'LU4AA', location: 'Buenos Aires, Argentina' },
  { call: 'OA4B', location: 'Lima, Peru' },
  { call: 'YV5B', location: 'Caracas, Venezuela' },
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
