import { RadioChannel } from '../types/radio';
import { createBlankChannel, deriveDuplex, isChannelEmpty, roundMHz } from './channel';
import { parseCsvChannels } from './csv-codec';
import { parseCsvRows } from './csv-parse';
import { formatTone, parseToneString } from './tone-tables';
import { toRadioAscii } from './text';

/** Columns used when copying rows to a spreadsheet; pasting accepts the same layout. */
export const TSV_COLUMNS = ['Channel', 'Name', 'RX MHz', 'TX MHz', 'TX Tone', 'RX Tone', 'Power', 'Bandwidth', 'Scan', 'Mode'];

export function channelsToTsv(channels: RadioChannel[]): string {
  const clean = (s: string) => s.replace(/[\t\r\n]/g, ' ');
  const lines = [TSV_COLUMNS.join('\t')];
  for (const ch of channels) {
    lines.push([
      ch.id,
      clean(ch.name),
      isChannelEmpty(ch) ? '' : ch.rxFreq.toFixed(5),
      isChannelEmpty(ch) ? '' : (ch.txFreq > 0 ? ch.txFreq : ch.rxFreq).toFixed(5),
      formatTone(ch.txTone),
      formatTone(ch.rxTone),
      ch.power ? 'High' : 'Low',
      ch.bandwidth ? 'Wide' : 'Narrow',
      ch.scan ? 'ADD' : 'DEL',
      ch.mode ? 'AM' : 'FM'
    ].join('\t'));
  }
  return lines.join('\r\n');
}

const pick = (value: string | undefined, yes: RegExp) => yes.test((value || '').trim());

function rowToChannel(cells: string[]): RadioChannel | null {
  // Layout: [Channel], Name, RX, TX, TX Tone, RX Tone, Power, Bandwidth, Scan, Mode
  const offset = /^\d+$/.test(cells[0] ?? '') && cells.length >= 3 ? 1 : 0;
  const [name, rx, tx, txTone, rxTone, power, bw, scan, mode] = cells.slice(offset);
  const rxFreq = parseFloat((rx || '').replace(',', '.'));
  if (!(rxFreq > 0)) return null;
  const ch = createBlankChannel(1);
  ch.name = toRadioAscii(name || '');
  ch.rxFreq = roundMHz(rxFreq);
  const txFreq = parseFloat((tx || '').replace(',', '.'));
  ch.txFreq = txFreq > 0 ? roundMHz(txFreq) : ch.rxFreq;
  Object.assign(ch, deriveDuplex(ch.rxFreq, ch.txFreq));
  ch.txTone = parseToneString((txTone || '').replace(/\s*Hz$/i, ''));
  ch.rxTone = parseToneString((rxTone || '').replace(/\s*Hz$/i, ''));
  if (power) ch.power = pick(power, /^low/i) ? 0 : 1;
  if (bw) ch.bandwidth = pick(bw, /^n/i) ? 0 : 1;
  if (scan) ch.scan = pick(scan, /^(del|skip|s|no|off)$/i) ? 0 : 1;
  if (mode) ch.mode = pick(mode, /^am$/i) ? 1 : 0;
  return ch;
}

/**
 * Parses text pasted from a spreadsheet or another program.
 * Understands this app's TSV, CHIRP or OEM CSV headers (tab or comma separated),
 * and header-less rows in the TSV column order.
 */
export function parseClipboardText(text: string): RadioChannel[] {
  if (!text.trim()) return [];
  const delimiter = text.includes('\t') ? '\t' : ',';
  const chirpOrOem = parseCsvChannels(text, delimiter);
  if (chirpOrOem.format !== 'unknown') return chirpOrOem.channels.map((p) => p.channel);

  const rows = parseCsvRows(text, delimiter);
  const hasHeader = rows.length > 0 && rows[0].some((c) => /name|rx/i.test(c)) && !rows[0].some((c) => /^\d{3}\.\d/.test(c));
  return rows.slice(hasHeader ? 1 : 0).map(rowToChannel).filter((c): c is RadioChannel => c !== null);
}
