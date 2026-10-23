import { RadioChannel, ToneSetting, HandsetKeySettings } from '../types/radio';
import { createEmptyTone, decodeToneValue, encodeToneValue } from './tone-tables';
import { DEFAULT_TEMPLATE_B64 } from './default-template';
import { decodeHandsetKeysFromEeprom, encodeHandsetKeysToEeprom, DEFAULT_HANDSET_KEYS } from './eeprom-codec';

export const HEADER_SIZE = 564;
export const REC_SIZE = 85;
export const MAX_CH = 500;
export const TAIL_SIZE = 3982;
export const TAIL_OFFSET = HEADER_SIZE + MAX_CH * REC_SIZE; // 43,064
export const TOTAL_FILE_SIZE = TAIL_OFFSET + TAIL_SIZE;     // 47,046
export const TAIL_KEYS_OFFSET = 41; // Tail offset 41 (file offset 43105) for 6 handset key opcodes

// Channel record offsets (85 bytes per record)
export const F_RX = 0;              // 4 bytes u32 LE, Hz
export const F_TX = 14;             // 4 bytes u32 LE, Hz
export const F_RXT = 28;            // 2 bytes u16 LE, tone val
export const F_RXT_TYPE = 30;       // 1 byte u8, tone type
export const F_TXT = 41;            // 2 bytes u16 LE, tone val
export const F_TXT_TYPE = 43;       // 1 byte u8, tone type
export const F_BUSY_RXSIG = 57;     // Byte 57
export const F_SCAN_PWR_BW = 58;    // Byte 58
export const F_SCR_VAGUE = 59;      // Byte 59
export const F_MODE_TONES = 60;     // Byte 60
export const F_PUSH_CODE = 61;      // Byte 61
export const F_POP_CODE = 62;       // Byte 62
export const F_NAME = 63;           // 16 bytes ASCII
export const NAME_LEN = 16;

function u32le(r: Uint8Array, o: number): number {
  return ((r[o] | (r[o + 1] << 8) | (r[o + 2] << 16) | (r[o + 3] << 24)) >>> 0);
}

function u16le(r: Uint8Array, o: number): number {
  return (r[o] | (r[o + 1] << 8)) >>> 0;
}

function putU32(buf: Uint8Array, o: number, v: number): void {
  buf[o] = v & 0xFF;
  buf[o + 1] = (v >> 8) & 0xFF;
  buf[o + 2] = (v >> 16) & 0xFF;
  buf[o + 3] = (v >>> 24) & 0xFF;
}

function putU16(buf: Uint8Array, o: number, v: number): void {
  buf[o] = v & 0xFF;
  buf[o + 1] = (v >> 8) & 0xFF;
}

export function getDefaultTemplateBytes(): Uint8Array {
  const binaryString = atob(DEFAULT_TEMPLATE_B64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

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

export interface DecodedYsf {
  channels: RadioChannel[];
  rawHeader: Uint8Array;
  rawTail: Uint8Array;
  keys: HandsetKeySettings;
}

export function decodeYsf(buf: Uint8Array): DecodedYsf {
  if (buf.length < HEADER_SIZE + REC_SIZE) {
    throw new Error(`File is too small to be a valid YSF codeplug (${buf.length} bytes)`);
  }

  const rawHeader = new Uint8Array(buf.subarray(0, HEADER_SIZE));
  const tailStart = Math.min(buf.length, TAIL_OFFSET);
  const rawTail = new Uint8Array(buf.subarray(tailStart, Math.min(buf.length, TOTAL_FILE_SIZE)));

  let keys: HandsetKeySettings = { ...DEFAULT_HANDSET_KEYS };
  if (rawTail.length >= TAIL_KEYS_OFFSET + 6) {
    keys = decodeHandsetKeysFromEeprom(rawTail.subarray(TAIL_KEYS_OFFSET, TAIL_KEYS_OFFSET + 6));
  }

  const channels: RadioChannel[] = [];

  for (let i = 0; i < MAX_CH; i++) {
    const channelId = i + 1;
    const off = HEADER_SIZE + i * REC_SIZE;
    if (off + REC_SIZE > buf.length) {
      channels.push(createBlankChannel(channelId));
      continue;
    }

    const rec = buf.subarray(off, off + REC_SIZE);
    const rxHz = u32le(rec, F_RX);

    if (rxHz === 0) {
      channels.push(createBlankChannel(channelId));
      continue;
    }

    const txHz = u32le(rec, F_TX) || rxHz;
    const rxFreq = Math.round((rxHz / 1e6) * 1e5) / 1e5;
    const txFreq = Math.round((txHz / 1e6) * 1e5) / 1e5;

    // Calculate Duplex direction & Offset
    const delta = Math.round((txFreq - rxFreq) * 1e5) / 1e5;
    let duplex: '+' | '-' | 'OFF' | 'SPLIT' = 'OFF';
    let offset = 0;

    if (delta > 0) {
      duplex = '+';
      offset = delta;
    } else if (delta < 0) {
      duplex = '-';
      offset = Math.abs(delta);
    }

    // Name extraction
    let name = '';
    for (let c = F_NAME; c < F_NAME + NAME_LEN; c++) {
      if (rec[c] === 0) break;
      name += String.fromCharCode(rec[c]);
    }

    // Tone decoding
    const rxToneVal = u16le(rec, F_RXT);
    const rxToneType = rec[F_RXT_TYPE];
    const txToneVal = u16le(rec, F_TXT);
    const txToneType = rec[F_TXT_TYPE];

    const rxTone = decodeToneValue(rxToneVal, rxToneType);
    const txTone = decodeToneValue(txToneVal, txToneType);

    // Flags
    const b57 = rec[F_BUSY_RXSIG];
    const b58 = rec[F_SCAN_PWR_BW];
    const b59 = rec[F_SCR_VAGUE];
    const b60 = rec[F_MODE_TONES];

    channels.push({
      id: channelId,
      name,
      rxFreq,
      txFreq,
      duplex,
      offset,
      rxTone,
      txTone,
      busy: ((b57 >> 3) & 3) as 0 | 1 | 2,
      rxSig: ((b57 >> 5) & 3) as 0 | 1 | 2 | 3,
      scan: ((b58 >> 7) & 1) as 0 | 1,
      power: ((b58 >> 5) & 1) as 0 | 1,
      bandwidth: ((b58 >> 4) & 1) as 0 | 1,
      specialDcs: ((b58 >> 1) & 7) as 0 | 1 | 2 | 3 | 4,
      compander: (b58 & 1) as 0 | 1,
      scrambler: b59 & 0x0F,
      vague: ((b59 >> 4) & 1) as 0 | 1,
      mode: ((b60 >> 2) & 1) as 0 | 1,
      pushCode: rec[F_PUSH_CODE],
      popCode: rec[F_POP_CODE],
      rawBytes: Array.from(rec)
    });
  }

  return { channels, rawHeader, rawTail, keys };
}

export function encodeYsf(
  channels: RadioChannel[],
  rawHeader?: Uint8Array,
  rawTail?: Uint8Array,
  keys?: HandsetKeySettings
): Uint8Array {
  const buf = new Uint8Array(TOTAL_FILE_SIZE);
  const template = getDefaultTemplateBytes();

  // 1. Initialize Header
  if (rawHeader && rawHeader.length >= HEADER_SIZE) {
    buf.set(rawHeader.subarray(0, HEADER_SIZE), 0);
  } else {
    buf.set(template.subarray(0, HEADER_SIZE), 0);
  }

  // 2. Clear and recalculate active channels allocation bitmask (Header bytes 351..413)
  for (let b = 351; b <= 413; b++) {
    buf[b] = 0x00;
  }
  for (let i = 0; i < channels.length && i < MAX_CH; i++) {
    const ch = channels[i];
    if (ch.rxFreq > 0) {
      const n = i + 1; // 1-based channel number
      buf[351 + Math.floor(n / 8)] |= (1 << (n % 8));
    }
  }

  // 3. Encode all 500 channels
  for (let i = 0; i < MAX_CH; i++) {
    const off = HEADER_SIZE + i * REC_SIZE;
    const ch = channels[i];

    if (!ch || ch.rxFreq <= 0) {
      // Empty channel slot: zero out
      for (let b = 0; b < REC_SIZE; b++) {
        buf[off + b] = 0;
      }
      continue;
    }

    // Preserve baseline raw record if present, otherwise clear
    if (ch.rawBytes && ch.rawBytes.length === REC_SIZE) {
      buf.set(ch.rawBytes, off);
    } else {
      for (let b = 0; b < REC_SIZE; b++) buf[off + b] = 0;
    }

    // Frequencies in Hz
    const rxHz = Math.round(ch.rxFreq * 1e6);
    let txHz = Math.round(ch.txFreq * 1e6);
    if (!txHz || txHz <= 0) txHz = rxHz;

    putU32(buf, off + F_RX, rxHz);
    putU32(buf, off + F_TX, txHz);

    // Tones
    const rxEnc = encodeToneValue(ch.rxTone);
    putU16(buf, off + F_RXT, rxEnc.rawVal);
    buf[off + F_RXT_TYPE] = rxEnc.toneType;

    const txEnc = encodeToneValue(ch.txTone);
    putU16(buf, off + F_TXT, txEnc.rawVal);
    buf[off + F_TXT_TYPE] = txEnc.toneType;

    // Bitfields
    // Byte 57: busy (bits 3-4), rxsig (bits 5-6)
    buf[off + F_BUSY_RXSIG] = (buf[off + F_BUSY_RXSIG] & 0x87)
      | ((ch.busy & 3) << 3)
      | ((ch.rxSig & 3) << 5);

    // Byte 58: scan (bit 7), power (bit 5), bw (bit 4), sdcs (bits 1-3), comp (bit 0)
    buf[off + F_SCAN_PWR_BW] = (buf[off + F_SCAN_PWR_BW] & 0x40)
      | ((ch.scan & 1) << 7)
      | ((ch.power & 1) << 5)
      | ((ch.bandwidth & 1) << 4)
      | ((ch.specialDcs & 7) << 1)
      | (ch.compander & 1);

    // Byte 59: vague (bit 4), scrambler (bits 0-3)
    buf[off + F_SCR_VAGUE] = (buf[off + F_SCR_VAGUE] & 0xE0)
      | ((ch.vague & 1) << 4)
      | (ch.scrambler & 0x0F);

    // Byte 60: mode (bit 2), rxT.type (bits 4-5), txT.type (bits 6-7)
    buf[off + F_MODE_TONES] = (buf[off + F_MODE_TONES] & 0x0B)
      | ((ch.mode & 1) << 2)
      | ((rxEnc.toneType & 3) << 4)
      | ((txEnc.toneType & 3) << 6);

    // Byte 61 & 62
    buf[off + F_PUSH_CODE] = ch.pushCode & 0xFF;
    buf[off + F_POP_CODE] = ch.popCode & 0xFF;

    // Channel Name (16 bytes ASCII)
    const nameStr = ch.name.substring(0, NAME_LEN);
    for (let c = 0; c < NAME_LEN; c++) {
      buf[off + F_NAME + c] = c < nameStr.length ? nameStr.charCodeAt(c) & 0xFF : 0;
    }
  }

  // 4. Initialize Tail / System settings
  if (rawTail && rawTail.length >= TAIL_SIZE) {
    buf.set(rawTail.subarray(0, TAIL_SIZE), TAIL_OFFSET);
  } else {
    buf.set(template.subarray(TAIL_OFFSET, TOTAL_FILE_SIZE), TAIL_OFFSET);
  }

  // 5. Serialize handset keys if specified
  if (keys) {
    const encodedKeys = encodeHandsetKeysToEeprom(keys);
    buf.set(encodedKeys, TAIL_OFFSET + TAIL_KEYS_OFFSET);
  }

  return buf;
}

export function createNewCodeplug(): DecodedYsf {
  const template = getDefaultTemplateBytes();
  const rawHeader = new Uint8Array(template.subarray(0, HEADER_SIZE));
  // Zero out channel allocation bitmask (bytes 351..413)
  for (let b = 351; b <= 413; b++) {
    rawHeader[b] = 0;
  }
  const rawTail = new Uint8Array(template.subarray(TAIL_OFFSET, TOTAL_FILE_SIZE));
  const channels = Array.from({ length: MAX_CH }, (_, i) => createBlankChannel(i + 1));
  return { channels, rawHeader, rawTail, keys: { ...DEFAULT_HANDSET_KEYS } };
}
