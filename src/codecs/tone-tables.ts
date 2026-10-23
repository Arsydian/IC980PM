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

export function nearestCtcss(freq: number): number {
  if (!freq || freq <= 0) return 88.5;
  return CTCSS_TONES.reduce((prev, curr) =>
    Math.abs(curr - freq) < Math.abs(prev - freq) ? curr : prev
  );
}

export function formatTone(tone: ToneSetting): string {
  if (!tone || tone.type === 0) return 'None';
  if (tone.type === 1) return `${tone.ctcss.toFixed(1)} Hz`;
  if (tone.type === 2) return `D${tone.dcs}N`;
  if (tone.type === 3) return `D${tone.dcs}I`;
  return 'None';
}

export function parseToneString(str: string): ToneSetting {
  const result = createEmptyTone();
  if (!str) return result;
  const clean = str.trim().toUpperCase();
  if (!clean || clean === 'OFF' || clean === 'NONE' || clean === 'NO TONE') {
    return result;
  }

  // Check for DCS e.g. D023N, D023I, 023N, 023I, DTCS
  const dcsMatch = clean.match(/^D?(\d{3})([NI])?$/);
  if (dcsMatch) {
    const code = dcsMatch[1];
    const pol = dcsMatch[2] === 'I' ? 3 : 2;
    if (DCS_CODES.includes(code)) {
      result.type = pol as ToneType;
      result.dcs = code;
      return result;
    }
  }

  // Check for CTCSS frequency e.g. 88.5 or 88.5 Hz
  const freq = parseFloat(clean.replace(/[^\d.]/g, ''));
  if (freq > 50 && freq < 300) {
    result.type = 1;
    result.ctcss = nearestCtcss(freq);
    return result;
  }

  return result;
}

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
