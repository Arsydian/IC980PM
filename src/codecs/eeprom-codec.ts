import { RadioChannel, HandsetKeySettings, HandsetKeyFunction } from '../types/radio';
import { createBlankChannel } from './ysf-codec';
import { decodeToneValue, encodeToneValue } from './tone-tables';

export const EEPROM_RECORD_SIZE = 34; // 0x22 bytes
export const CHANNELS_PER_SECTOR = 32;
export const SECTOR_SPAN = 0x1000;    // 4096 bytes
export const BASE_CHANNEL_ADDRESS = 0x1000;

export function getChannelEepromAddress(channelZeroIndex: number): number {
  const sector = Math.floor(channelZeroIndex / CHANNELS_PER_SECTOR);
  const offset = (channelZeroIndex % CHANNELS_PER_SECTOR) * EEPROM_RECORD_SIZE;
  return BASE_CHANNEL_ADDRESS + (sector * SECTOR_SPAN) + offset;
}

export function encodeChannelToEeprom(ch: RadioChannel): Uint8Array {
  const buf = new Uint8Array(EEPROM_RECORD_SIZE);
  if (!ch || ch.rxFreq <= 0) {
    return buf; // All zeroes for blank channel
  }

  const rxHz = Math.round(ch.rxFreq * 1e6);
  let txHz = Math.round(ch.txFreq * 1e6);
  if (!txHz || txHz <= 0) txHz = rxHz;

  // RX Freq (bytes 0..3, u32 LE)
  buf[0] = rxHz & 0xFF;
  buf[1] = (rxHz >> 8) & 0xFF;
  buf[2] = (rxHz >> 16) & 0xFF;
  buf[3] = (rxHz >>> 24) & 0xFF;

  // TX Freq (bytes 4..7, u32 LE)
  buf[4] = txHz & 0xFF;
  buf[5] = (txHz >> 8) & 0xFF;
  buf[6] = (txHz >> 16) & 0xFF;
  buf[7] = (txHz >>> 24) & 0xFF;

  // RX Tone (bytes 8..9, u16 LE)
  const rxToneEnc = encodeToneValue(ch.rxTone);
  buf[8] = rxToneEnc.rawVal & 0xFF;
  buf[9] = (rxToneEnc.rawVal >> 8) & 0xFF;

  // TX Tone (bytes 10..11, u16 LE)
  const txToneEnc = encodeToneValue(ch.txTone);
  buf[10] = txToneEnc.rawVal & 0xFF;
  buf[11] = (txToneEnc.rawVal >> 8) & 0xFF;

  // Byte 12: Busy Inhibit (bits 3-4) & RX Signal Code (bits 5-6)
  buf[12] = ((ch.busy & 3) << 3) | ((ch.rxSig & 3) << 5);

  // Byte 13: Scan (bit 7), Power (bit 5), Bandwidth (bit 4), Special DCS (bits 1-3), Compander (bit 0)
  buf[13] = ((ch.scan & 1) << 7)
    | ((ch.power & 1) << 5)
    | ((ch.bandwidth & 1) << 4)
    | ((ch.specialDcs & 7) << 1)
    | (ch.compander & 1);

  // Byte 14: Vague Subaudio (bit 4), Scramble (bits 0-3)
  buf[14] = ((ch.vague & 1) << 4) | (ch.scrambler & 0x0F);

  // Byte 15: FM/AM (bit 2), RX Tone Type (bits 4-5), TX Tone Type (bits 6-7)
  buf[15] = ((ch.mode & 1) << 2)
    | ((rxToneEnc.toneType & 3) << 4)
    | ((txToneEnc.toneType & 3) << 6);

  // Byte 16: PTT Push Code, Byte 17: PTT Pop Code
  buf[16] = ch.pushCode & 0xFF;
  buf[17] = ch.popCode & 0xFF;

  // Bytes 18..33: Channel Name (16 bytes ASCII)
  const nameStr = (ch.name || '').substring(0, 16);
  for (let i = 0; i < 16; i++) {
    buf[18 + i] = i < nameStr.length ? nameStr.charCodeAt(i) & 0xFF : 0;
  }

  return buf;
}

export function decodeChannelFromEeprom(bytes: Uint8Array, channelId: number): RadioChannel {
  if (bytes.length < EEPROM_RECORD_SIZE) {
    return createBlankChannel(channelId);
  }

  const rxHz = (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0;
  if (rxHz === 0) {
    return createBlankChannel(channelId);
  }

  const txHz = (bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24)) >>> 0;
  const rxFreq = Math.round((rxHz / 1e6) * 1e5) / 1e5;
  const txFreq = Math.round((txHz / 1e6) * 1e5) / 1e5;

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

  const rxToneRaw = (bytes[8] | (bytes[9] << 8)) >>> 0;
  const txToneRaw = (bytes[10] | (bytes[11] << 8)) >>> 0;

  const b12 = bytes[12];
  const b13 = bytes[13];
  const b14 = bytes[14];
  const b15 = bytes[15];

  const rxToneType = (b15 >> 4) & 3;
  const txToneType = (b15 >> 6) & 3;

  let name = '';
  for (let i = 18; i < 34; i++) {
    if (bytes[i] === 0) break;
    name += String.fromCharCode(bytes[i]);
  }

  return {
    id: channelId,
    name,
    rxFreq,
    txFreq,
    duplex,
    offset,
    rxTone: decodeToneValue(rxToneRaw, rxToneType),
    txTone: decodeToneValue(txToneRaw, txToneType),
    busy: ((b12 >> 3) & 3) as 0 | 1 | 2,
    rxSig: ((b12 >> 5) & 3) as 0 | 1 | 2 | 3,
    scan: ((b13 >> 7) & 1) as 0 | 1,
    power: ((b13 >> 5) & 1) as 0 | 1,
    bandwidth: ((b13 >> 4) & 1) as 0 | 1,
    specialDcs: ((b13 >> 1) & 7) as 0 | 1 | 2 | 3 | 4,
    compander: (b13 & 1) as 0 | 1,
    vague: ((b14 >> 4) & 1) as 0 | 1,
    scrambler: b14 & 0x0F,
    mode: ((b15 >> 2) & 1) as 0 | 1,
    pushCode: bytes[16],
    popCode: bytes[17]
  };
}

export const EEPROM_KEYS_ADDRESS = 0x120C5;
export const EEPROM_KEYS_LENGTH = 6;

export const DEFAULT_HANDSET_KEYS: HandsetKeySettings = {
  key1Short: 0x04, // Reverse Frequency (Monitor Repeater Input)
  key1Long: 0x02,  // Monitor Momentary (Open Squelch)
  key2Short: 0x03, // Scan Start/Stop
  key2Long: 0x08,  // FM Broadcast Radio
  key3Short: 0x0C, // Frequency Match Sweep
  key3Long: 0x09   // Emergency Alarm Beep
};

export function encodeHandsetKeysToEeprom(keys: HandsetKeySettings): Uint8Array {
  const buf = new Uint8Array(EEPROM_KEYS_LENGTH);
  buf[0] = keys.key1Short ?? DEFAULT_HANDSET_KEYS.key1Short;
  buf[1] = keys.key1Long ?? DEFAULT_HANDSET_KEYS.key1Long;
  buf[2] = keys.key2Short ?? DEFAULT_HANDSET_KEYS.key2Short;
  buf[3] = keys.key2Long ?? DEFAULT_HANDSET_KEYS.key2Long;
  buf[4] = keys.key3Short ?? DEFAULT_HANDSET_KEYS.key3Short;
  buf[5] = keys.key3Long ?? DEFAULT_HANDSET_KEYS.key3Long;
  return buf;
}

const VALID_OPCODES = new Set<number>([0x00, 0x01, 0x02, 0x03, 0x04, 0x08, 0x09, 0x0B, 0x0C]);

export function decodeHandsetKeysFromEeprom(bytes: Uint8Array): HandsetKeySettings {
  if (!bytes || bytes.length < EEPROM_KEYS_LENGTH) {
    return { ...DEFAULT_HANDSET_KEYS };
  }
  return {
    key1Short: (VALID_OPCODES.has(bytes[0]) ? bytes[0] : DEFAULT_HANDSET_KEYS.key1Short) as HandsetKeyFunction,
    key1Long: (VALID_OPCODES.has(bytes[1]) ? bytes[1] : DEFAULT_HANDSET_KEYS.key1Long) as HandsetKeyFunction,
    key2Short: (VALID_OPCODES.has(bytes[2]) ? bytes[2] : DEFAULT_HANDSET_KEYS.key2Short) as HandsetKeyFunction,
    key2Long: (VALID_OPCODES.has(bytes[3]) ? bytes[3] : DEFAULT_HANDSET_KEYS.key2Long) as HandsetKeyFunction,
    key3Short: (VALID_OPCODES.has(bytes[4]) ? bytes[4] : DEFAULT_HANDSET_KEYS.key3Short) as HandsetKeyFunction,
    key3Long: (VALID_OPCODES.has(bytes[5]) ? bytes[5] : DEFAULT_HANDSET_KEYS.key3Long) as HandsetKeyFunction
  };
}
