import { RadioChannel, HandsetKeySettings, HandsetKeyFunction } from '../types/radio';
import { createBlankChannel, deriveDuplex, isChannelEmpty } from './channel';
import { decodeToneValue, encodeToneValue } from './tone-tables';
import { readAscii, writeAscii } from './text';

// Radio memory layout as reverse-engineered from the OEM software. Not yet confirmed on hardware.
export const EEPROM_RECORD_SIZE = 34; // 0x22 bytes
export const CHANNELS_PER_SECTOR = 32;
export const SECTOR_SPAN = 0x1000;    // 4096 bytes
export const BASE_CHANNEL_ADDRESS = 0x1000;
export const EEPROM_KEYS_ADDRESS = 0x120C5;
export const EEPROM_KEYS_LENGTH = 6;

/** Data the app knows how to place in radio memory (and therefore reads and writes over USB). */
export const RADIO_MAPPED_REGIONS = [
  { label: '500 channel records', detail: '34 bytes each, from 0x1000' },
  { label: 'Handset key assignments', detail: '6 bytes at 0x120C5' }
];

/** Data held in .ysf files whose radio-memory address is not known yet, so it is never sent over USB. */
export const RADIO_UNMAPPED_REGIONS = [
  'VFO A/B',
  'Power-on message',
  'Tail memories (likely the repeat/relay table)',
  'Squelch, TOT, VOX, beeps, voice and other global settings',
  'DTMF / ANI code lists'
];

export function getChannelEepromAddress(channelZeroIndex: number): number {
  const sector = Math.floor(channelZeroIndex / CHANNELS_PER_SECTOR);
  const offset = (channelZeroIndex % CHANNELS_PER_SECTOR) * EEPROM_RECORD_SIZE;
  return BASE_CHANNEL_ADDRESS + (sector * SECTOR_SPAN) + offset;
}

function u32(bytes: Uint8Array, o: number): number {
  return (bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24)) >>> 0;
}

/** Erased flash reads back as 0xFF; the OEM software stores unused slots as 0x00. Both mean empty. */
export function isEmptyEepromRecord(bytes: Uint8Array): boolean {
  if (bytes.length < EEPROM_RECORD_SIZE) return true;
  const rx = u32(bytes, 0);
  return rx === 0 || rx === 0xFFFFFFFF;
}

/**
 * Picks the byte used to fill empty slots, by majority vote over the empty
 * records already in the radio. Falls back to 0x00 when there are none.
 */
export function detectEmptyFill(records: Uint8Array[]): number {
  let ff = 0;
  let zero = 0;
  for (const rec of records) {
    if (!isEmptyEepromRecord(rec)) continue;
    if (rec[0] === 0xFF) ff++;
    else zero++;
  }
  return ff > zero ? 0xFF : 0x00;
}

export function encodeChannelToEeprom(ch: RadioChannel, emptyFill = 0x00): Uint8Array {
  const buf = new Uint8Array(EEPROM_RECORD_SIZE);
  if (isChannelEmpty(ch)) {
    buf.fill(emptyFill);
    return buf;
  }
  if (ch.eepromBytes && ch.eepromBytes.length === EEPROM_RECORD_SIZE && !isEmptyEepromRecord(Uint8Array.from(ch.eepromBytes))) {
    buf.set(ch.eepromBytes);
  }

  const rxHz = Math.round(ch.rxFreq * 1e6) >>> 0;
  const txHz = ch.txFreq > 0 ? Math.round(ch.txFreq * 1e6) >>> 0 : rxHz;

  // RX Freq (bytes 0..3, u32 LE), TX Freq (bytes 4..7, u32 LE)
  for (let i = 0; i < 4; i++) {
    buf[i] = (rxHz >>> (8 * i)) & 0xFF;
    buf[4 + i] = (txHz >>> (8 * i)) & 0xFF;
  }

  // RX Tone (bytes 8..9), TX Tone (bytes 10..11), u16 LE
  const rxToneEnc = encodeToneValue(ch.rxTone);
  buf[8] = rxToneEnc.rawVal & 0xFF;
  buf[9] = (rxToneEnc.rawVal >> 8) & 0xFF;
  const txToneEnc = encodeToneValue(ch.txTone);
  buf[10] = txToneEnc.rawVal & 0xFF;
  buf[11] = (txToneEnc.rawVal >> 8) & 0xFF;

  // Unknown bits in bytes 12..15 are kept from the record read from the radio.
  // Byte 12: Busy Inhibit (bits 3-4) & RX Signal Code (bits 5-6)
  buf[12] = (buf[12] & 0x87) | ((ch.busy & 3) << 3) | ((ch.rxSig & 3) << 5);

  // Byte 13: Scan (bit 7), Power (bit 5), Bandwidth (bit 4), Special DCS (bits 1-3), Compander (bit 0)
  buf[13] = (buf[13] & 0x40)
    | ((ch.scan & 1) << 7)
    | ((ch.power & 1) << 5)
    | ((ch.bandwidth & 1) << 4)
    | ((ch.specialDcs & 7) << 1)
    | (ch.compander & 1);

  // Byte 14: Vague Subaudio (bit 4), Scramble (bits 0-3)
  buf[14] = (buf[14] & 0xE0) | ((ch.vague & 1) << 4) | (ch.scrambler & 0x0F);

  // Byte 15: FM/AM (bit 2), RX Tone Type (bits 4-5), TX Tone Type (bits 6-7)
  buf[15] = (buf[15] & 0x0B)
    | ((ch.mode & 1) << 2)
    | ((rxToneEnc.toneType & 3) << 4)
    | ((txToneEnc.toneType & 3) << 6);

  // Byte 16: PTT Push Code, Byte 17: PTT Pop Code
  buf[16] = ch.pushCode & 0xFF;
  buf[17] = ch.popCode & 0xFF;

  // Bytes 18..33: Channel Name (16 bytes ASCII)
  writeAscii(buf, 18, 16, ch.name);

  return buf;
}

export function decodeChannelFromEeprom(bytes: Uint8Array, channelId: number): RadioChannel {
  if (isEmptyEepromRecord(bytes)) {
    return createBlankChannel(channelId);
  }

  const rxHz = u32(bytes, 0);
  const txRaw = u32(bytes, 4);
  const txHz = txRaw === 0 || txRaw === 0xFFFFFFFF ? rxHz : txRaw;
  const rxFreq = rxHz / 1e6;
  const txFreq = txHz / 1e6;
  const { duplex, offset } = deriveDuplex(rxFreq, txFreq);

  const b12 = bytes[12];
  const b13 = bytes[13];
  const b14 = bytes[14];
  const b15 = bytes[15];

  return {
    id: channelId,
    name: readAscii(bytes, 18, 16),
    rxFreq,
    txFreq,
    duplex,
    offset,
    rxTone: decodeToneValue(bytes[8] | (bytes[9] << 8), (b15 >> 4) & 3),
    txTone: decodeToneValue(bytes[10] | (bytes[11] << 8), (b15 >> 6) & 3),
    busy: Math.min(2, (b12 >> 3) & 3) as 0 | 1 | 2,
    rxSig: ((b12 >> 5) & 3) as 0 | 1 | 2 | 3,
    scan: ((b13 >> 7) & 1) as 0 | 1,
    power: ((b13 >> 5) & 1) as 0 | 1,
    bandwidth: ((b13 >> 4) & 1) as 0 | 1,
    specialDcs: Math.min(4, (b13 >> 1) & 7) as 0 | 1 | 2 | 3 | 4,
    compander: (b13 & 1) as 0 | 1,
    vague: ((b14 >> 4) & 1) as 0 | 1,
    scrambler: b14 & 0x0F,
    mode: ((b15 >> 2) & 1) as 0 | 1,
    pushCode: bytes[16],
    popCode: bytes[17],
    eepromBytes: Array.from(bytes.subarray(0, EEPROM_RECORD_SIZE))
  };
}

export const DEFAULT_HANDSET_KEYS: HandsetKeySettings = {
  key1Short: 0x04, // Reverse Frequency (Monitor Repeater Input)
  key1Long: 0x02,  // Monitor Momentary (Open Squelch)
  key2Short: 0x03, // Scan Start/Stop
  key2Long: 0x08,  // FM Broadcast Radio
  key3Short: 0x0C, // Frequency Match Sweep
  key3Long: 0x09   // Emergency Alarm Beep
};

export const HANDSET_KEY_ORDER: (keyof HandsetKeySettings)[] = [
  'key1Short', 'key1Long', 'key2Short', 'key2Long', 'key3Short', 'key3Long'
];

export function encodeHandsetKeysToEeprom(keys: HandsetKeySettings): Uint8Array {
  return Uint8Array.from(HANDSET_KEY_ORDER.map((k) => keys[k] ?? DEFAULT_HANDSET_KEYS[k]));
}

export const VALID_KEY_OPCODES = new Set<number>([0x00, 0x01, 0x02, 0x03, 0x04, 0x08, 0x09, 0x0B, 0x0C]);

export function decodeHandsetKeysFromEeprom(bytes: Uint8Array): HandsetKeySettings {
  if (!bytes || bytes.length < EEPROM_KEYS_LENGTH) {
    return { ...DEFAULT_HANDSET_KEYS };
  }
  const keys = { ...DEFAULT_HANDSET_KEYS };
  HANDSET_KEY_ORDER.forEach((k, i) => {
    if (VALID_KEY_OPCODES.has(bytes[i])) keys[k] = bytes[i] as HandsetKeyFunction;
  });
  return keys;
}
