export interface BandCondition {
  name: string;
  time: 'day' | 'night';
  condition: string;
}

export interface VhfPhenomenon {
  name: string;
  location: string;
  condition: string;
}

export interface SolarSnapshot {
  fetchedAt: number;
  updated: string;
  solarflux: number | null;
  aindex: number | null;
  kindex: number | null;
  xray: string;
  sunspots: number | null;
  aurora: number | null;
  solarwind: number | null;
  magneticfield: number | null;
  geomagfield: string;
  signalnoise: string;
  muf: string;
  bands: BandCondition[];
  vhf: VhfPhenomenon[];
}

export interface KHistoryPoint {
  fetchedAt: number;
  kindex: number | null;
}
