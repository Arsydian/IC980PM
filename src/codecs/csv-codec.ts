import { RadioChannel, ToneSetting, ToneType } from '../types/radio';
import { createBlankChannel } from './ysf-codec';
import { createEmptyTone, CTCSS_TONES, DCS_CODES, nearestCtcss, parseToneString } from './tone-tables';

export const CHIRP_COLUMNS = [
  'Location', 'Name', 'Frequency', 'Duplex', 'Offset', 'Tone', 'rToneFreq', 'cToneFreq',
  'DtcsCode', 'DtcsPolarity', 'RxDtcsCode', 'CrossMode', 'Mode', 'TStep', 'Skip',
  'Power', 'Comment', 'URCALL', 'RPT1CALL', 'RPT2CALL', 'DVCODE'
];

export const OEM_COLUMNS = [
  'NO.', 'RX Freq.', 'TX Freq.', 'QT/DQT Dec', 'QT/DQT Enc', 'TX Power', 'Bandwidth',
  'Scan', 'Busy Inhibit', 'Special DCS', 'Vague Subaudio', 'Compando', 'scramble',
  'FM/AM', 'Rx signal Code', 'PTT Push Code', 'PTT Pop Code', 'Name'
];

function escapeCsvCell(val: string | number | undefined): string {
  const str = String(val ?? '');
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function parseCsvRows(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '').trim();
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let insideQuote = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    const nextChar = clean[i + 1];

    if (insideQuote) {
      if (char === '"') {
        if (nextChar === '"') {
          currentCell += '"';
          i++;
        } else {
          insideQuote = false;
        }
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"') {
        insideQuote = true;
      } else if (char === ',') {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if (char === '\r') {
        // Handle CRLF
        if (nextChar === '\n') i++;
        currentRow.push(currentCell.trim());
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      } else if (char === '\n') {
        currentRow.push(currentCell.trim());
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    rows.push(currentRow);
  }

  return rows;
}

export function channelsToChirpCsv(channels: RadioChannel[]): string {
  const lines: string[] = [CHIRP_COLUMNS.join(',')];

  channels.forEach((ch, index) => {
    if (ch.rxFreq <= 0) return;

    let duplex = ch.duplex === 'OFF' ? '' : ch.duplex;
    let offset = ch.offset > 0 ? ch.offset.toFixed(6) : '0.000000';
    let toneMode = '';
    let rTone = '88.5';
    let cTone = '88.5';
    let dtcsCode = '023';
    let rxDtcsCode = '023';
    let dtcsPol = 'NN';
    let crossMode = 'Tone->Tone';

    const txT = ch.txTone;
    const rxT = ch.rxTone;

    if (txT.type === 0 && rxT.type === 0) {
      toneMode = '';
    } else if (txT.type === 1 && rxT.type === 0) {
      toneMode = 'Tone';
      rTone = txT.ctcss.toFixed(1);
    } else if (txT.type === 1 && rxT.type === 1 && Math.abs(txT.ctcss - rxT.ctcss) < 0.1) {
      toneMode = 'TSQL';
      rTone = txT.ctcss.toFixed(1);
      cTone = rxT.ctcss.toFixed(1);
    } else if (txT.type >= 2 && rxT.type >= 2 && txT.dcs === rxT.dcs) {
      toneMode = 'DTCS';
      dtcsCode = txT.dcs;
      rxDtcsCode = rxT.dcs;
      dtcsPol = (txT.type === 3 ? 'R' : 'N') + (rxT.type === 3 ? 'R' : 'N');
    } else {
      toneMode = 'Cross';
      const kind = (t: ToneSetting) => (t.type === 0 ? '' : t.type === 1 ? 'Tone' : 'DTCS');
      crossMode = `${kind(txT)}->${kind(rxT)}`;
      if (txT.type === 1) rTone = txT.ctcss.toFixed(1);
      if (rxT.type === 1) cTone = rxT.ctcss.toFixed(1);
      if (txT.type >= 2) dtcsCode = txT.dcs;
      if (rxT.type >= 2) rxDtcsCode = rxT.dcs;
      dtcsPol = (txT.type === 3 ? 'R' : 'N') + (rxT.type === 3 ? 'R' : 'N');
    }

    const mode = ch.mode === 1 ? 'AM' : (ch.bandwidth === 0 ? 'NFM' : 'FM');
    const skip = ch.scan === 1 ? '' : 'S';
    const power = ch.power === 1 ? 'High' : 'Low';

    const row = [
      index, // CHIRP 0-indexed location
      escapeCsvCell(ch.name),
      ch.rxFreq.toFixed(6),
      duplex,
      offset,
      toneMode,
      rTone,
      cTone,
      dtcsCode,
      dtcsPol,
      rxDtcsCode,
      crossMode,
      mode,
      '5.00', // TStep
      skip,
      power,
      '', // Comment
      '', // URCALL
      '', // RPT1CALL
      '', // RPT2CALL
      ''  // DVCODE
    ];

    lines.push(row.join(','));
  });

  return lines.join('\r\n') + '\r\n';
}

export function parseChirpRow(row: Record<string, string>, channelId: number): RadioChannel | null {
  const rxFreq = parseFloat(row['Frequency']);
  if (!rxFreq || isNaN(rxFreq) || rxFreq <= 0) return null;

  const ch = createBlankChannel(channelId);
  ch.name = (row['Name'] || `CH-${channelId}`).substring(0, 16);
  ch.rxFreq = Math.round(rxFreq * 1e5) / 1e5;

  const duplexStr = (row['Duplex'] || '').trim();
  const offset = parseFloat(row['Offset']) || 0;
  ch.offset = Math.round(offset * 1e5) / 1e5;

  if (duplexStr === '+') {
    ch.duplex = '+';
    ch.txFreq = Math.round((ch.rxFreq + ch.offset) * 1e5) / 1e5;
  } else if (duplexStr === '-') {
    ch.duplex = '-';
    ch.txFreq = Math.round((ch.rxFreq - ch.offset) * 1e5) / 1e5;
  } else if (duplexStr.toLowerCase() === 'split') {
    ch.duplex = 'SPLIT';
    ch.txFreq = ch.offset > 0 ? ch.offset : ch.rxFreq;
  } else {
    ch.duplex = 'OFF';
    ch.txFreq = ch.rxFreq;
  }

  // Tones
  const toneMode = (row['Tone'] || '').trim();
  const rToneFreq = parseFloat(row['rToneFreq']) || 88.5;
  const cToneFreq = parseFloat(row['cToneFreq']) || 88.5;
  const dtcsCode = (row['DtcsCode'] || '023').padStart(3, '0');
  const rxDtcsCode = (row['RxDtcsCode'] || dtcsCode).padStart(3, '0');
  const polarity = (row['DtcsPolarity'] || 'NN').toUpperCase();

  if (toneMode === 'Tone') {
    ch.txTone = { type: 1, ctcss: nearestCtcss(rToneFreq), dcs: '023' };
    ch.rxTone = createEmptyTone();
  } else if (toneMode === 'TSQL') {
    const toneVal = nearestCtcss(cToneFreq || rToneFreq);
    ch.txTone = { type: 1, ctcss: toneVal, dcs: '023' };
    ch.rxTone = { type: 1, ctcss: toneVal, dcs: '023' };
  } else if (toneMode === 'DTCS') {
    const txPol: ToneType = polarity[0] === 'R' ? 3 : 2;
    const rxPol: ToneType = polarity[1] === 'R' ? 3 : 2;
    ch.txTone = { type: txPol, ctcss: 88.5, dcs: DCS_CODES.includes(dtcsCode) ? dtcsCode : '023' };
    ch.rxTone = { type: rxPol, ctcss: 88.5, dcs: DCS_CODES.includes(rxDtcsCode) ? rxDtcsCode : '023' };
  } else if (toneMode === 'Cross') {
    const cross = (row['CrossMode'] || 'Tone->Tone').split('->');
    const txKind = cross[0] || 'Tone';
    const rxKind = cross[1] || '';

    if (txKind === 'Tone') ch.txTone = { type: 1, ctcss: nearestCtcss(rToneFreq), dcs: '023' };
    else if (txKind === 'DTCS') ch.txTone = { type: polarity[0] === 'R' ? 3 : 2, ctcss: 88.5, dcs: dtcsCode };

    if (rxKind === 'Tone') ch.rxTone = { type: 1, ctcss: nearestCtcss(cToneFreq), dcs: '023' };
    else if (rxKind === 'DTCS') ch.rxTone = { type: polarity[1] === 'R' ? 3 : 2, ctcss: 88.5, dcs: rxDtcsCode };
  }

  // Modulation & Bandwidth
  const modeStr = (row['Mode'] || 'FM').toUpperCase();
  if (modeStr.includes('AM')) {
    ch.mode = 1;
  } else {
    ch.mode = 0;
    ch.bandwidth = modeStr === 'NFM' ? 0 : 1;
  }

  // Scan Skip
  ch.scan = (row['Skip'] || '').toUpperCase() === 'S' ? 0 : 1;

  // Power
  const pwrStr = (row['Power'] || '').toUpperCase();
  ch.power = (pwrStr.includes('LOW') || pwrStr === '0' || pwrStr.startsWith('1.') || pwrStr.startsWith('5.')) ? 0 : 1;

  return ch;
}

export function parseOemRow(row: Record<string, string>, channelId: number): RadioChannel | null {
  const rxFreq = parseFloat(row['RX Freq.']);
  if (!rxFreq || isNaN(rxFreq) || rxFreq <= 0) return null;

  const ch = createBlankChannel(channelId);
  ch.name = (row['Name'] || `CH-${channelId}`).substring(0, 16);
  ch.rxFreq = Math.round(rxFreq * 1e5) / 1e5;

  const txFreq = parseFloat(row['TX Freq.']) || ch.rxFreq;
  ch.txFreq = Math.round(txFreq * 1e5) / 1e5;

  const delta = Math.round((ch.txFreq - ch.rxFreq) * 1e5) / 1e5;
  if (delta > 0) {
    ch.duplex = '+';
    ch.offset = delta;
  } else if (delta < 0) {
    ch.duplex = '-';
    ch.offset = Math.abs(delta);
  } else {
    ch.duplex = 'OFF';
    ch.offset = 0;
  }

  ch.rxTone = parseToneString(row['QT/DQT Dec'] || 'Off');
  ch.txTone = parseToneString(row['QT/DQT Enc'] || 'Off');

  const pwr = (row['TX Power'] || '').toLowerCase();
  ch.power = pwr.includes('low') ? 0 : 1;

  const bw = (row['Bandwidth'] || '').toLowerCase();
  ch.bandwidth = bw.includes('narrow') ? 0 : 1;

  const scan = (row['Scan'] || '').toLowerCase();
  ch.scan = scan.includes('del') ? 0 : 1;

  const mode = (row['FM/AM'] || '').toLowerCase();
  ch.mode = mode.includes('am') ? 1 : 0;

  return ch;
}

export function importCsvToChannels(
  csvText: string,
  existingChannels: RadioChannel[],
  startChannelIndex = 1
): { channels: RadioChannel[]; importedCount: number } {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) return { channels: [...existingChannels], importedCount: 0 };

  const header = rows[0].map(h => h.trim());
  const isChirp = header.some(h => /frequency/i.test(h));
  const isOem = header.some(h => /rx freq/i.test(h));

  const resultChannels = [...existingChannels];
  let targetIdx = startChannelIndex;
  let importedCount = 0;

  for (let r = 1; r < rows.length && targetIdx <= 500; r++) {
    const rowValues = rows[r];
    if (rowValues.length < 2) continue;

    const rowObj: Record<string, string> = {};
    header.forEach((col, idx) => {
      rowObj[col] = rowValues[idx] || '';
    });

    let parsedCh: RadioChannel | null = null;
    if (isChirp) {
      parsedCh = parseChirpRow(rowObj, targetIdx);
    } else if (isOem) {
      parsedCh = parseOemRow(rowObj, targetIdx);
    } else {
      // Generic fallback (e.g. standard RepeaterBook CSV)
      const freqCol = header.find(h => /frequency|downlink|rx/i.test(h));
      if (freqCol && rowObj[freqCol]) {
        rowObj['Frequency'] = rowObj[freqCol];
        rowObj['Name'] = rowObj['Callsign'] || rowObj['Name'] || rowObj['Location'] || '';
        parsedCh = parseChirpRow(rowObj, targetIdx);
      }
    }

    if (parsedCh) {
      resultChannels[targetIdx - 1] = parsedCh;
      targetIdx++;
      importedCount++;
    }
  }

  return { channels: resultChannels, importedCount };
}
