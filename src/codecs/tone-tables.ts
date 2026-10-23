import { ToneSetting, ToneType } from '../types/radio';

export const CTCSS_TONES: number[] = [
  67.0, 69.3, 71.9, 74.4, 77.0, 79.7, 82.5, 85.4, 88.5, 91.5,
  94.8, 97.4, 100.0, 103.5, 107.2, 110.9, 114.8, 118.8, 123.0, 127.3,
  131.8, 136.5, 141.3, 146.2, 151.4, 156.7, 159.8, 162.2, 165.5, 167.9,
  171.3, 173.8, 177.3, 179.9, 183.5, 186.2, 189.9, 192.8, 196.6, 199.5,
  203.5, 206.5, 210.7, 218.1, 225.7, 229.1, 233.6, 241.8, 250.3, 254.1
];

export const DCS_CODES: string[] = [
  '023', '025', '026', '031', '032', '036', '043', '047', '051', '053', '054', '065', '071', '072', '073', '074',
  '114', '115', '116', '122', '125', '131', '132', '134', '143', '145', '152', '155', '156', '162', '165', '172',
  '174', '205', '212', '223', '225', '226', '243', '244', '245', '246', '251', '252', '255', '261', '263', '265',
  '266', '271', '274', '306', '311', '315', '325', '331', '332', '343', '346', '351', '356', '364', '365', '371',
  '411', '412', '413', '423', '431', '432', '445', '446', '452', '454', '455', '462', '464', '465', '466', '503',
  '506', '516', '523', '526', '532', '546', '565', '606', '612', '624', '627', '631', '632', '654', '662', '664',
  '703', '712', '723', '731', '732', '734', '743', '754'
];

export function createEmptyTone(): ToneSetting {
  return {
    type: 0,
    ctcss: 88.5,
    dcs: '023',
    noneRaw: 0xFFFF
  };
}

export function ctcssTone(freq: number): ToneSetting {
  return { type: 1, ctcss: nearestCtcss(freq), dcs: '023' };
}

export function dcsTone(code: string, inverted = false): ToneSetting {
  return { type: inverted ? 3 : 2, ctcss: 88.5, dcs: code };
}

export function nearestCtcss(freq: number): number {
  if (!freq || freq <= 0) return 88.5;
  return CTCSS_TONES.reduce((prev, curr) =>
    Math.abs(curr - freq) < Math.abs(prev - freq) ? curr : prev
  );
}

export function isStandardCtcss(freq: number): boolean {
  return CTCSS_TONES.some((t) => Math.abs(t - freq) < 0.05);
}

export function sameTone(a: ToneSetting, b: ToneSetting): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 0) return true;
  if (a.type === 1) return Math.abs(a.ctcss - b.ctcss) < 0.05;
  return a.dcs === b.dcs;
}

export function formatTone(tone: ToneSetting): string {
  if (!tone || tone.type === 0) return 'None';
  if (tone.type === 1) return `${tone.ctcss.toFixed(1)} Hz`;
  if (tone.type === 2) return `D${tone.dcs}N`;
  if (tone.type === 3) return `D${tone.dcs}I`;
  return 'None';
}

/** Short label used by the OEM CPS CSV format: "Off", "88.5", "D023N", "D023I". */
export function toneLabel(tone: ToneSetting): string {
  if (!tone || tone.type === 0) return 'Off';
  if (tone.type === 1) return tone.ctcss.toFixed(1);
  return `D${tone.dcs}${tone.type === 3 ? 'I' : 'N'}`;
}

/**
 * Parses "88.5", "88.5 Hz", "D023N", "023I", "Off", "None".
 * A string that looks like a DCS code but isn't a valid one yields "no tone"
 * rather than being misread as a CTCSS frequency.
 */
export function parseToneString(str: string): ToneSetting {
  const result = createEmptyTone();
  if (!str) return result;
  const clean = str.trim().toUpperCase();
  if (!clean || clean === 'OFF' || clean === 'NONE' || clean === 'NO TONE' || clean === 'CSQ') {
    return result;
  }

  const dcsMatch = clean.match(/^D?(\d{3})\s*([NIR])?$/);
  const looksDcs = dcsMatch && (clean.startsWith('D') || !!dcsMatch[2]);
  if (dcsMatch) {
    const code = dcsMatch[1];
    if (DCS_CODES.includes(code)) {
      result.type = (dcsMatch[2] === 'I' || dcsMatch[2] === 'R' ? 3 : 2) as ToneType;
      result.dcs = code;
      return result;
    }
    if (looksDcs) return result;
  }

  const ctcssMatch = clean.match(/^(\d{2,3}(?:\.\d+)?)\s*(HZ)?$/);
  if (ctcssMatch) {
    const freq = parseFloat(ctcssMatch[1]);
    if (freq >= 60 && freq <= 260) {
      result.type = 1;
      result.ctcss = nearestCtcss(freq);
    }
  }
  return result;
}

/** Stable string key for <select> values: "N", "C88.5", "D023N", "D023I". */
export function toneKey(tone: ToneSetting): string {
  if (!tone || tone.type === 0) return 'N';
  if (tone.type === 1) return `C${tone.ctcss.toFixed(1)}`;
  return `D${tone.dcs}${tone.type === 3 ? 'I' : 'N'}`;
}

export function toneFromKey(key: string, previous?: ToneSetting): ToneSetting {
  if (key === 'N') return { ...createEmptyTone(), noneRaw: previous?.noneRaw ?? 0xFFFF };
  if (key.startsWith('C')) return { type: 1, ctcss: parseFloat(key.slice(1)), dcs: '023' };
  return { type: key.endsWith('I') ? 3 : 2, ctcss: 88.5, dcs: key.slice(1, 4) };
}

export interface ToneOptionGroup {
  label: string;
  options: { key: string; label: string }[];
}

export const TONE_OPTION_GROUPS: ToneOptionGroup[] = [
  { label: 'Off', options: [{ key: 'N', label: 'None' }] },
  { label: 'CTCSS', options: CTCSS_TONES.map((t) => ({ key: `C${t.toFixed(1)}`, label: `${t.toFixed(1)} Hz` })) },
  { label: 'DCS normal', options: DCS_CODES.map((c) => ({ key: `D${c}N`, label: `D${c}N` })) },
  { label: 'DCS inverted', options: DCS_CODES.map((c) => ({ key: `D${c}I`, label: `D${c}I` })) }
];

export function encodeToneValue(tone: ToneSetting): { rawVal: number; toneType: number } {
  let rawVal = tone.noneRaw ?? 0xFFFF;
  const toneType = tone.type;

  if (toneType === 1) {
    rawVal = Math.round(tone.ctcss * 10);
  } else if (toneType === 2 || toneType === 3) {
    rawVal = 0x2800 | parseInt(tone.dcs, 8);
  }

  return { rawVal, toneType };
}

export function decodeToneValue(rawVal: number, rawType: number): ToneSetting {
  const type: ToneType = (rawType <= 3 ? rawType : 0) as ToneType;
  const res: ToneSetting = {
    type,
    ctcss: 88.5,
    dcs: '023',
    noneRaw: type === 0 ? rawVal : 0xFFFF
  };

  if (type === 1) {
    res.ctcss = rawVal / 10;
  } else if (type === 2 || type === 3) {
    res.dcs = (rawVal & 0x1FF).toString(8).padStart(3, '0');
  }

  return res;
}
