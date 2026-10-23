import { Duplex, RadioChannel } from '../types/radio';
import { createEmptyTone } from './tone-tables';

export const MAX_CHANNELS = 500;

/** Offsets this large (or a TX on another band) are treated as split rather than +/-. */
const SPLIT_THRESHOLD_MHZ = 20;

export const roundMHz = (mhz: number): number => Math.round(mhz * 1e6) / 1e6;

export function createBlankChannel(id: number): RadioChannel {
  return {
    id,
    name: '',
    rxFreq: 0,
    txFreq: 0,
    duplex: 'OFF',
    offset: 0,
    rxTone: createEmptyTone(),
    txTone: createEmptyTone(),
    power: 1,         // High
    bandwidth: 1,     // Wide
    scan: 1,          // Add
    busy: 0,          // OFF
    specialDcs: 0,
    vague: 0,
    compander: 0,
    scrambler: 0,
    mode: 0,          // FM
    rxSig: 0,         // OFF
    pushCode: 0,      // OFF
    popCode: 0        // OFF
  };
}

export function createBlankChannels(count = MAX_CHANNELS): RadioChannel[] {
  return Array.from({ length: count }, (_, i) => createBlankChannel(i + 1));
}

export function isChannelEmpty(ch: RadioChannel | undefined): boolean {
  return !ch || !(ch.rxFreq > 0);
}

/** Deep copy so tone objects and raw byte arrays are never shared between channels. */
export function cloneChannel(ch: RadioChannel, id = ch.id): RadioChannel {
  return {
    ...ch,
    id,
    rxTone: { ...ch.rxTone },
    txTone: { ...ch.txTone },
    rawBytes: ch.rawBytes ? [...ch.rawBytes] : undefined,
    eepromBytes: ch.eepromBytes ? [...ch.eepromBytes] : undefined
  };
}

export function deriveDuplex(rxFreq: number, txFreq: number): { duplex: Duplex; offset: number } {
  if (!(rxFreq > 0) || !(txFreq > 0)) return { duplex: 'OFF', offset: 0 };
  const delta = roundMHz(txFreq - rxFreq);
  if (delta === 0) return { duplex: 'OFF', offset: 0 };
  if (Math.abs(delta) >= SPLIT_THRESHOLD_MHZ) return { duplex: 'SPLIT', offset: Math.abs(delta) };
  return { duplex: delta > 0 ? '+' : '-', offset: Math.abs(delta) };
}

function txFor(rxFreq: number, duplex: Duplex, offset: number, currentTx: number): number {
  if (duplex === '+') return roundMHz(rxFreq + offset);
  if (duplex === '-') return roundMHz(rxFreq - offset);
  if (duplex === 'SPLIT') return currentTx > 0 ? currentTx : rxFreq;
  return rxFreq;
}

export function withRxFreq(ch: RadioChannel, rxFreq: number): RadioChannel {
  const rx = rxFreq > 0 ? roundMHz(rxFreq) : 0;
  if (!rx) return { ...ch, rxFreq: 0, txFreq: 0 };
  if (ch.duplex === 'SPLIT') {
    const tx = ch.txFreq > 0 ? ch.txFreq : rx;
    return { ...ch, rxFreq: rx, txFreq: tx, offset: Math.abs(roundMHz(tx - rx)) };
  }
  return { ...ch, rxFreq: rx, txFreq: txFor(rx, ch.duplex, ch.offset, ch.txFreq) };
}

export function withTxFreq(ch: RadioChannel, txFreq: number): RadioChannel {
  const tx = txFreq > 0 ? roundMHz(txFreq) : ch.rxFreq;
  const { duplex, offset } = deriveDuplex(ch.rxFreq, tx);
  return { ...ch, txFreq: tx, duplex: ch.duplex === 'SPLIT' ? 'SPLIT' : duplex, offset };
}

export function withDuplex(ch: RadioChannel, duplex: Duplex): RadioChannel {
  return { ...ch, duplex, txFreq: txFor(ch.rxFreq, duplex, ch.offset, ch.txFreq) };
}

export function withOffset(ch: RadioChannel, offset: number): RadioChannel {
  const off = Math.max(0, roundMHz(offset || 0));
  if (ch.duplex === 'SPLIT' || ch.duplex === 'OFF') return { ...ch, offset: off };
  return { ...ch, offset: off, txFreq: txFor(ch.rxFreq, ch.duplex, off, ch.txFreq) };
}

/** Re-assigns ids so channels[i].id === i + 1. */
export function renumber(channels: RadioChannel[]): RadioChannel[] {
  return channels.map((ch, i) => (ch.id === i + 1 ? ch : { ...ch, id: i + 1 }));
}

export function formatMHz(mhz: number): string {
  if (!(mhz > 0)) return '';
  return mhz.toFixed(5);
}

/** Accepts "146.52", "146,52", "146520" (kHz) and "146520000" (Hz). Returns MHz or NaN. */
export function parseFrequencyInput(text: string): number {
  const clean = (text || '').trim().replace(',', '.');
  if (!clean) return 0;
  if (!/^\d+(\.\d+)?$/.test(clean)) return NaN;
  let value = parseFloat(clean);
  if (value >= 1e7) value /= 1e6;      // Hz
  else if (value >= 1e4) value /= 1e3; // kHz
  return roundMHz(value);
}
