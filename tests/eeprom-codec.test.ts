import { describe, it, expect } from 'vitest';
import {
  getChannelEepromAddress,
  encodeChannelToEeprom,
  decodeChannelFromEeprom,
  EEPROM_RECORD_SIZE
} from '../src/codecs/eeprom-codec';
import { createBlankChannel } from '../src/codecs/ysf-codec';
import { RadioChannel } from '../src/types/radio';

describe('EEPROM Memory Addressing & Channel Record Codec', () => {
  it('should calculate EEPROM addresses accurately according to reverse-engineered assembly math', () => {
    // Channel 0 (Ch 1 in UI): 0x1000 + 0 = 0x1000
    expect(getChannelEepromAddress(0)).toBe(0x1000);

    // Channel 1 (Ch 2 in UI): 0x1000 + 34 (0x22) = 0x1022
    expect(getChannelEepromAddress(1)).toBe(0x1022);

    // Channel 31 (Ch 32 in UI, last in sector 0): 0x1000 + 31 * 34 = 0x1000 + 1054 = 0x141E
    expect(getChannelEepromAddress(31)).toBe(0x141E);

    // Channel 32 (Ch 33 in UI, first in sector 1): 0x1000 + 1 * 0x1000 + 0 = 0x2000
    expect(getChannelEepromAddress(32)).toBe(0x2000);

    // Channel 499 (Ch 500 in UI): sector 15 -> 0x1000 + 15 * 0x1000 + (19 * 34) = 0x10000 + 646 = 0x10286
    expect(getChannelEepromAddress(499)).toBe(0x10286);
  });

  it('should encode and decode a 34-byte EEPROM channel record with high fidelity', () => {
    const ch: RadioChannel = {
      ...createBlankChannel(1),
      name: 'CALL-146.52',
      rxFreq: 146.52000,
      txFreq: 146.52000,
      duplex: 'OFF',
      offset: 0,
      txTone: { type: 1, ctcss: 88.5, dcs: '023' },
      rxTone: { type: 1, ctcss: 88.5, dcs: '023' },
      power: 1,
      bandwidth: 1,
      scan: 1,
      mode: 0,
      busy: 1,
      compander: 1
    };

    const encoded = encodeChannelToEeprom(ch);
    expect(encoded.length).toBe(EEPROM_RECORD_SIZE);

    const decoded = decodeChannelFromEeprom(encoded, 1);
    expect(decoded.id).toBe(1);
    expect(decoded.name).toBe('CALL-146.52');
    expect(decoded.rxFreq).toBe(146.52000);
    expect(decoded.txFreq).toBe(146.52000);
    expect(decoded.txTone.type).toBe(1);
    expect(decoded.txTone.ctcss).toBe(88.5);
    expect(decoded.rxTone.type).toBe(1);
    expect(decoded.rxTone.ctcss).toBe(88.5);
    expect(decoded.power).toBe(1);
    expect(decoded.bandwidth).toBe(1);
    expect(decoded.scan).toBe(1);
    expect(decoded.busy).toBe(1);
    expect(decoded.compander).toBe(1);
  });
});
