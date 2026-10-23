import { RadioChannel, ToneSetting, ToneType } from '../types/radio';
import { createBlankChannel, deriveDuplex, isChannelEmpty, roundMHz } from './channel';
import { DCS_CODES, nearestCtcss, parseToneString, sameTone, toneLabel } from './tone-tables';
import { escapeCsvCell, parseCsvRows, rowsToObjects } from './csv-parse';
import { applyPlacement, planPlacement, PlacementMode, PlacementPlan } from './placement';
import { toRadioAscii } from './text';

export { parseCsvRows } from './csv-parse';

export const CHIRP_COLUMNS = [
  'Location', 'Name', 'Frequency', 'Duplex', 'Offset', 'Tone', 'rToneFreq', 'cToneFreq',
  'DtcsCode', 'DtcsPolarity', 'RxDtcsCode', 'CrossMode', 'Mode', 'TStep', 'Skip',
  'Power', 'Comment', 'URCALL', 'RPT1CALL', 'RPT2CALL', 'DVCODE'
];

/** Column names and value labels used by the OEM CPS CSV export. */
export const OEM_COLUMNS = [
  'NO.', 'RX Freq.', 'TX Freq.', 'QT/DQT Dec', 'QT/DQT Enc', 'TX Power', 'Bandwidth',
  'Scan', 'Busy Inhibit', 'Special DCS', 'Vague Subaudio', 'Compando', 'scramble',
  'FM/AM', 'Rx signal Code', 'PTT Push Code', 'PTT Pop Code', 'Name'
];

const codeLabels = ['OFF', 'ID', ...Array.from({ length: 30 }, (_, i) => `Code form-${i + 1}`)];
export const OEM_LABELS = {
  power: ['Low', 'High'],
  bandwidth: ['Narrow', 'Wide'],
  scan: ['DEL', 'ADD'],
  busy: ['OFF', 'DQT', 'CAT'],
  specialDcs: ['OFF', 'Special DCS 1', 'Special DCS 2', 'Special DCS 3', 'Special DCS 4'],
  onOff: ['OFF', 'ON'],
  scrambler: ['OFF', ...Array.from({ length: 8 }, (_, i) => `scramble ${i + 1}`)],
  mode: ['FM', 'AM'],
  rxSig: ['OFF', 'DTMF', 'FSK', 'FSK DTMF'],
  code: codeLabels
};

/** Label for a value; values outside the list round-trip as "? (n)". */
function oemLabel(labels: string[], value: number): string {
  return labels[value] ?? `? (${value})`;
}

function oemValue(labels: string[], label: string, fallback: number): number {
  const clean = (label || '').trim().toLowerCase();
  if (!clean) return fallback;
  const idx = labels.findIndex((l) => l.toLowerCase() === clean);
  if (idx !== -1) return idx;
  const m = /^\?\s*\((\d+)\)$/.exec(clean);
  return m ? parseInt(m[1], 10) : fallback;
}

// ---------- CHIRP ----------

export function chirpToneFields(ch: RadioChannel) {
  const txT = ch.txTone;
  const rxT = ch.rxTone;
  const f = {
    toneMode: '', rTone: '88.5', cTone: '88.5', dtcsCode: '023', rxDtcsCode: '023', dtcsPol: 'NN', crossMode: 'Tone->Tone'
  };
  const pol = (t: ToneSetting) => (t.type === 3 ? 'R' : 'N');

  if (txT.type === 0 && rxT.type === 0) {
    f.toneMode = '';
  } else if (txT.type === 1 && rxT.type === 0) {
    f.toneMode = 'Tone';
    f.rTone = txT.ctcss.toFixed(1);
  } else if (txT.type === 1 && rxT.type === 1 && sameTone(txT, rxT)) {
    f.toneMode = 'TSQL';
    f.rTone = txT.ctcss.toFixed(1);
    f.cTone = rxT.ctcss.toFixed(1);
  } else if (txT.type >= 2 && rxT.type >= 2 && txT.dcs === rxT.dcs) {
    f.toneMode = 'DTCS';
    f.dtcsCode = txT.dcs;
    f.rxDtcsCode = rxT.dcs;
    f.dtcsPol = pol(txT) + pol(rxT);
  } else {
    f.toneMode = 'Cross';
    const kind = (t: ToneSetting) => (t.type === 0 ? '' : t.type === 1 ? 'Tone' : 'DTCS');
    f.crossMode = `${kind(txT)}->${kind(rxT)}`;
    if (txT.type === 1) f.rTone = txT.ctcss.toFixed(1);
    if (rxT.type === 1) f.cTone = rxT.ctcss.toFixed(1);
    if (txT.type >= 2) f.dtcsCode = txT.dcs;
    if (rxT.type >= 2) f.rxDtcsCode = rxT.dcs;
    f.dtcsPol = pol(txT) + pol(rxT);
  }
  return f;
}

export function channelsToChirpCsv(channels: RadioChannel[]): string {
  const lines: string[] = [CHIRP_COLUMNS.join(',')];

  channels.forEach((ch) => {
    if (isChannelEmpty(ch)) return;
    const t = chirpToneFields(ch);
    const duplex = ch.duplex === 'OFF' ? '' : ch.duplex === 'SPLIT' ? 'split' : ch.duplex;
    const offset = ch.duplex === 'SPLIT' ? ch.txFreq : ch.offset;
    const mode = ch.mode === 1 ? 'AM' : (ch.bandwidth === 0 ? 'NFM' : 'FM');

    const row = [
      ch.id,
      escapeCsvCell(ch.name, true),
      ch.rxFreq.toFixed(6),
      duplex,
      (offset > 0 ? offset : 0).toFixed(6),
      t.toneMode,
      t.rTone,
      t.cTone,
      t.dtcsCode,
      t.dtcsPol,
      t.rxDtcsCode,
      t.crossMode,
      mode,
      '5.00',
      ch.scan === 1 ? '' : 'S',
      ch.power === 1 ? 'High' : 'Low',
      '', '', '', '', ''
    ];
    lines.push(row.join(','));
  });

  return lines.join('\r\n') + '\r\n';
}

const validDcs = (code: string) => (DCS_CODES.includes(code) ? code : '023');

export function parseChirpRow(row: Record<string, string>, channelId: number): RadioChannel | null {
  const rxFreq = parseFloat(row['Frequency']);
  if (!(rxFreq > 0)) return null;

  const ch = createBlankChannel(channelId);
  ch.name = toRadioAscii(row['Name'] || '');
  ch.rxFreq = roundMHz(rxFreq);

  const duplexStr = (row['Duplex'] || '').trim().toLowerCase();
  const offset = Math.abs(parseFloat(row['Offset']) || 0);

  if (duplexStr === '+' || duplexStr === '-') {
    ch.duplex = duplexStr;
    ch.offset = roundMHz(offset);
    ch.txFreq = roundMHz(duplexStr === '+' ? ch.rxFreq + offset : ch.rxFreq - offset);
  } else if (duplexStr === 'split') {
    ch.txFreq = offset > 0 ? roundMHz(offset) : ch.rxFreq;
    ch.duplex = 'SPLIT';
    ch.offset = Math.abs(roundMHz(ch.txFreq - ch.rxFreq));
  } else if (duplexStr === 'off') {
    // CHIRP "off" means transmit disabled; the radio has no such flag, so keep it simplex.
    ch.txFreq = ch.rxFreq;
  } else {
    ch.txFreq = ch.rxFreq;
  }

  const toneMode = (row['Tone'] || '').trim();
  const rToneFreq = parseFloat(row['rToneFreq']) || 88.5;
  const cToneFreq = parseFloat(row['cToneFreq']) || rToneFreq;
  const dtcsCode = validDcs((row['DtcsCode'] || '023').padStart(3, '0'));
  const rxDtcsCode = validDcs((row['RxDtcsCode'] || row['DtcsCode'] || '023').padStart(3, '0'));
  const polarity = ((row['DtcsPolarity'] || 'NN').toUpperCase() + 'NN').slice(0, 2);
  const dcs = (code: string, p: string): ToneSetting => ({ type: (p === 'R' ? 3 : 2) as ToneType, ctcss: 88.5, dcs: code });
  const ctcss = (f: number): ToneSetting => ({ type: 1, ctcss: nearestCtcss(f), dcs: '023' });

  if (toneMode === 'Tone') {
    ch.txTone = ctcss(rToneFreq);
  } else if (toneMode === 'TSQL') {
    ch.txTone = ctcss(cToneFreq);
    ch.rxTone = ctcss(cToneFreq);
  } else if (toneMode === 'DTCS') {
    ch.txTone = dcs(dtcsCode, polarity[0]);
    ch.rxTone = dcs(dtcsCode, polarity[1]);
  } else if (toneMode === 'Cross') {
    const [txKind = 'Tone', rxKind = ''] = (row['CrossMode'] || 'Tone->Tone').split('->');
    if (txKind === 'Tone') ch.txTone = ctcss(rToneFreq);
    else if (txKind === 'DTCS') ch.txTone = dcs(dtcsCode, polarity[0]);
    if (rxKind === 'Tone') ch.rxTone = ctcss(cToneFreq);
    else if (rxKind === 'DTCS') ch.rxTone = dcs(rxDtcsCode, polarity[1]);
  }

  const modeStr = (row['Mode'] || 'FM').trim().toUpperCase();
  if (modeStr === 'AM' || modeStr === 'NAM') {
    ch.mode = 1;
  } else {
    ch.mode = 0;
    ch.bandwidth = modeStr === 'NFM' ? 0 : 1;
  }

  ch.scan = (row['Skip'] || '').trim().toUpperCase() === 'S' ? 0 : 1;

  const pwrStr = (row['Power'] || '').trim().toUpperCase();
  const watts = parseFloat(pwrStr);
  ch.power = pwrStr.includes('LOW') || (watts > 0 && watts < 10) ? 0 : 1;

  return ch;
}

// ---------- OEM CPS ----------

export function channelsToOemCsv(channels: RadioChannel[]): string {
  const L = OEM_LABELS;
  const lines = [OEM_COLUMNS.join(',')];
  channels.forEach((ch) => {
    if (isChannelEmpty(ch)) return;
    lines.push([
      ch.id,
      ch.rxFreq.toFixed(5),
      (ch.txFreq > 0 ? ch.txFreq : ch.rxFreq).toFixed(5),
      toneLabel(ch.rxTone),
      toneLabel(ch.txTone),
      oemLabel(L.power, ch.power),
      oemLabel(L.bandwidth, ch.bandwidth),
      oemLabel(L.scan, ch.scan),
      oemLabel(L.busy, ch.busy),
      oemLabel(L.specialDcs, ch.specialDcs),
      oemLabel(L.onOff, ch.vague),
      oemLabel(L.onOff, ch.compander),
      oemLabel(L.scrambler, ch.scrambler),
      oemLabel(L.mode, ch.mode),
      oemLabel(L.rxSig, ch.rxSig),
      oemLabel(L.code, ch.pushCode),
      oemLabel(L.code, ch.popCode),
      escapeCsvCell(ch.name, true)
    ].join(','));
  });
  // The OEM software expects a UTF-8 BOM and CRLF line endings.
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function parseOemRow(row: Record<string, string>, channelId: number): RadioChannel | null {
  const rxFreq = parseFloat(row['RX Freq.']);
  if (!(rxFreq > 0)) return null;
  const L = OEM_LABELS;

  const ch = createBlankChannel(channelId);
  ch.name = toRadioAscii(row['Name'] || '');
  ch.rxFreq = roundMHz(rxFreq);
  const txFreq = parseFloat(row['TX Freq.']);
  ch.txFreq = txFreq > 0 ? roundMHz(txFreq) : ch.rxFreq;
  Object.assign(ch, deriveDuplex(ch.rxFreq, ch.txFreq));

  ch.rxTone = parseToneString(row['QT/DQT Dec'] || 'Off');
  ch.txTone = parseToneString(row['QT/DQT Enc'] || 'Off');
  ch.power = oemValue(L.power, row['TX Power'], 1) as 0 | 1;
  ch.bandwidth = oemValue(L.bandwidth, row['Bandwidth'], 1) as 0 | 1;
  ch.scan = oemValue(L.scan, row['Scan'], 1) as 0 | 1;
  ch.busy = oemValue(L.busy, row['Busy Inhibit'], 0) as 0 | 1 | 2;
  ch.specialDcs = oemValue(L.specialDcs, row['Special DCS'], 0) as 0 | 1 | 2 | 3 | 4;
  ch.vague = oemValue(L.onOff, row['Vague Subaudio'], 0) as 0 | 1;
  ch.compander = oemValue(L.onOff, row['Compando'], 0) as 0 | 1;
  ch.scrambler = oemValue(L.scrambler, row['scramble'], 0);
  ch.mode = oemValue(L.mode, row['FM/AM'], 0) as 0 | 1;
  ch.rxSig = oemValue(L.rxSig, row['Rx signal Code'], 0) as 0 | 1 | 2 | 3;
  ch.pushCode = oemValue(L.code, row['PTT Push Code'], 0);
  ch.popCode = oemValue(L.code, row['PTT Pop Code'], 0);
  return ch;
}

// ---------- Import ----------

export type CsvFormat = 'chirp' | 'oem' | 'unknown';

export interface ParsedCsvChannel {
  location?: number; // 1-based channel number from the file, if it has one
  channel: RadioChannel;
}

export function detectCsvFormat(header: string[]): CsvFormat {
  const has = (name: string) => header.some((h) => h.toLowerCase() === name.toLowerCase());
  if (has('RX Freq.') && has('QT/DQT Dec')) return 'oem';
  if (has('Frequency') && (has('Duplex') || has('Tone') || has('Location'))) return 'chirp';
  return 'unknown';
}

export function parseCsvChannels(text: string, delimiter = ','): { format: CsvFormat; channels: ParsedCsvChannel[] } {
  const { header, records } = rowsToObjects(parseCsvRows(text, delimiter));
  const format = detectCsvFormat(header);
  if (format === 'unknown') return { format, channels: [] };

  const out: ParsedCsvChannel[] = [];
  records.forEach((rec, i) => {
    const ch = format === 'oem' ? parseOemRow(rec, i + 1) : parseChirpRow(rec, i + 1);
    if (!ch) return;
    const locStr = format === 'oem' ? rec['NO.'] : rec['Location'];
    const loc = /^\d+$/.test((locStr || '').trim()) ? parseInt(locStr, 10) : undefined;
    out.push({ location: loc, channel: ch });
  });

  // Files from radios whose memories start at 0 are shifted so 0 lands on channel 1.
  if (out.some((p) => p.location === 0)) {
    out.forEach((p) => { if (p.location !== undefined) p.location += 1; });
  }
  return { format, channels: out };
}

export interface CsvImportOptions {
  mode: PlacementMode;
  startAt?: number;
}

export interface CsvImportResult {
  channels: RadioChannel[];
  importedCount: number;
  format: CsvFormat;
  plan: PlacementPlan;
}

export function importCsvToChannels(
  csvText: string,
  existingChannels: RadioChannel[],
  options: CsvImportOptions = { mode: 'location' }
): CsvImportResult {
  const { format, channels: parsed } = parseCsvChannels(csvText);
  if (format === 'unknown') {
    throw new Error('Unrecognised CSV. Expected a CHIRP export (Location, Name, Frequency, …) or an OEM CPS export (NO., RX Freq., …). For RepeaterBook CSV files use the RepeaterBook import.');
  }
  const mode = options.mode === 'location' && parsed.every((p) => p.location === undefined) ? 'appendEmpty' : options.mode;
  const plan = planPlacement(existingChannels, parsed.length, mode, options.startAt ?? 1, parsed.map((p) => p.location));
  const channels = applyPlacement(existingChannels, parsed.map((p) => p.channel), plan);
  return { channels, importedCount: plan.targets.filter((t) => t !== -1).length, format, plan };
}
