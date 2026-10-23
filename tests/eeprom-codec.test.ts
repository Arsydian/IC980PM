import { describe, it, expect } from 'vitest';
import {
  getChannelEepromAddress,
  encodeChannelToEeprom,
  decodeChannelFromEeprom,
  detectEmptyFill,
  EEPROM_RECORD_SIZE
} from '../src/codecs/eeprom-codec';
import { createBlankChannel } from '../src/codecs/channel';
import { RadioChannel } from '../src/types/radio';

describe('EEPROM Memory Addressing & Channel Record Codec', () => {
  it('calculates channel addresses', () => {
    expect(getChannelEepromAddress(0)).toBe(0x1000);
    expect(getChannelEepromAddress(1)).toBe(0x1022);
    expect(getChannelEepromAddress(31)).toBe(0x141E);
    expect(getChannelEepromAddress(32)).toBe(0x2000);
    expect(getChannelEepromAddress(499)).toBe(0x10286);
  });

  it('encodes and decodes a 34-byte record', () => {
    const ch: RadioChannel = {
      ...createBlankChannel(1),
      name: 'CALL-146.52',
      rxFreq: 146.52,
      txFreq: 146.52,
      txTone: { type: 1, ctcss: 88.5, dcs: '023' },
      rxTone: { type: 1, ctcss: 88.5, dcs: '023' },
      busy: 1,
      compander: 1
    };
    const encoded = encodeChannelToEeprom(ch);
    expect(encoded.length).toBe(EEPROM_RECORD_SIZE);
    const decoded = decodeChannelFromEeprom(encoded, 1);
    expect(decoded).toMatchObject({ id: 1, name: 'CALL-146.52', rxFreq: 146.52, txFreq: 146.52, power: 1, bandwidth: 1, scan: 1, busy: 1, compander: 1 });
    expect(decoded.txTone).toMatchObject({ type: 1, ctcss: 88.5 });
  });

  it('treats erased flash (all 0xFF) as an empty channel', () => {
    const decoded = decodeChannelFromEeprom(new Uint8Array(34).fill(0xFF), 7);
    expect(decoded.rxFreq).toBe(0);
    expect(decoded.name).toBe('');
  });

  it('keeps unknown bits from the record read from the radio', () => {
    const raw = encodeChannelToEeprom({ ...createBlankChannel(1), rxFreq: 146.52, txFreq: 146.52 });
    raw[12] |= 0x81; // unknown bits 0 and 7
    raw[13] |= 0x40; // unknown bit 6
    raw[15] |= 0x08; // unknown bit 3
    const decoded = decodeChannelFromEeprom(raw, 1);
    const again = encodeChannelToEeprom({ ...decoded, name: 'NEW', power: 0 });
    expect(again[12] & 0x81).toBe(0x81);
    expect(again[13] & 0x40).toBe(0x40);
    expect(again[15] & 0x08).toBe(0x08);
    expect((again[13] >> 5) & 1).toBe(0);
  });

  it('fills empty slots with the byte the radio already uses', () => {
    const ff = new Uint8Array(34).fill(0xFF);
    const zero = new Uint8Array(34);
    expect(detectEmptyFill([ff, ff, zero])).toBe(0xFF);
    expect(detectEmptyFill([zero])).toBe(0x00);
    expect(detectEmptyFill([])).toBe(0x00);
    expect(Array.from(encodeChannelToEeprom(createBlankChannel(1), 0xFF))).toEqual(Array(34).fill(0xFF));
  });
});
