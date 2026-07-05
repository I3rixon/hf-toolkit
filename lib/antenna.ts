// Resonant wire-antenna length calculator (dipole / vertical / loop).
const C_M_PER_S = 299792458;
const M_TO_FT = 3.28084;
const FT_TO_M = 0.3048;

export type AntennaTypeId = 'dipole' | 'vertical' | 'loop';

export interface AntennaType {
  id: AntennaTypeId;
  label: string;
  fraction: number; // portion of a free-space wavelength the wire spans
  defaultK: number; // default end-effect / velocity factor
}

// K defaults follow the classic ARRL formulas: 468/f and 234/f embed a ~0.95
// end-effect factor for straight wire; a full-wave loop is conventionally cut
// slightly *longer* than one free-space wavelength (~1005/f), not shorter.
export const ANTENNA_TYPES: AntennaType[] = [
  { id: 'dipole', label: 'Half-Wave Dipole', fraction: 0.5, defaultK: 0.95 },
  { id: 'vertical', label: 'Quarter-Wave Vertical', fraction: 0.25, defaultK: 0.95 },
  { id: 'loop', label: 'Full-Wave Loop', fraction: 1.0, defaultK: 1.02 },
];

export function getAntennaType(id: string): AntennaType {
  return ANTENNA_TYPES.find((t) => t.id === id) ?? ANTENNA_TYPES[0];
}

export function freeSpaceWavelengthFt(freqMHz: number): number {
  const wavelengthM = C_M_PER_S / (freqMHz * 1e6);
  return wavelengthM * M_TO_FT;
}

export interface AntennaResult {
  totalFt: number;
  totalM: number;
  /** Length of each half for a dipole; undefined for vertical/loop. */
  legFt?: number;
  legM?: number;
  /** Length of one side for a (4-sided) loop; undefined otherwise. */
  sideFt?: number;
  sideM?: number;
}

export function calcAntenna(freqMHz: number, typeId: string, k: number): AntennaResult {
  const type = getAntennaType(typeId);
  const wavelengthFt = freeSpaceWavelengthFt(freqMHz);
  const totalFt = wavelengthFt * type.fraction * k;
  const totalM = totalFt * FT_TO_M;

  const result: AntennaResult = { totalFt, totalM };
  if (type.id === 'dipole') {
    result.legFt = totalFt / 2;
    result.legM = totalM / 2;
  } else if (type.id === 'loop') {
    result.sideFt = totalFt / 4;
    result.sideM = totalM / 4;
  }
  return result;
}
