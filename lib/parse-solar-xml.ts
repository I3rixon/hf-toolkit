import { XMLParser } from 'fast-xml-parser';
import type { BandCondition, SolarSnapshot, VhfPhenomenon } from './types';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

function toNumber(value: unknown): number | null {
  const n = parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : null;
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export function parseSolarXml(xml: string): SolarSnapshot {
  const doc = parser.parse(xml);
  const data = doc?.solar?.solardata ?? {};

  const bands: BandCondition[] = toArray(data.calculatedconditions?.band).map((b: any) => ({
    name: String(b?.['@_name'] ?? ''),
    time: b?.['@_time'] === 'night' ? 'night' : 'day',
    condition: String(b?.['#text'] ?? b ?? ''),
  }));

  const vhf: VhfPhenomenon[] = toArray(data.calculatedvhfconditions?.phenomenon).map((p: any) => ({
    name: String(p?.['@_name'] ?? ''),
    location: String(p?.['@_location'] ?? ''),
    condition: String(p?.['#text'] ?? p ?? ''),
  }));

  return {
    fetchedAt: Date.now(),
    updated: String(data.updated ?? ''),
    solarflux: toNumber(data.solarflux),
    aindex: toNumber(data.aindex),
    kindex: toNumber(data.kindex),
    xray: String(data.xray ?? ''),
    sunspots: toNumber(data.sunspots),
    aurora: toNumber(data.aurora),
    solarwind: toNumber(data.solarwind),
    magneticfield: toNumber(data.magneticfield),
    geomagfield: String(data.geomagfield ?? ''),
    signalnoise: String(data.signalnoise ?? ''),
    muf: String(data.muf ?? ''),
    bands,
    vhf,
  };
}
