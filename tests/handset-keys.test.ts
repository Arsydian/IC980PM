import { describe, it, expect } from 'vitest';
import {
  encodeHandsetKeysToEeprom,
  decodeHandsetKeysFromEeprom,
  DEFAULT_HANDSET_KEYS,
  EEPROM_KEYS_ADDRESS,
  EEPROM_KEYS_LENGTH
} from '../src/codecs/eeprom-codec';
import { HandsetKeySettings } from '../src/types/radio';
import { decodeYsf, encodeYsf, createNewCodeplug, TAIL_KEYS_OFFSET, TAIL_OFFSET } from '../src/codecs/ysf-codec';

describe('Handset & Programmable Keys Codec', () => {
  it('correctly maps Reverse Frequency (0x04) and Monitor Momentary (0x02) in default keys', () => {
    expect(DEFAULT_HANDSET_KEYS.key1Short).toBe(0x04); // Reverse Frequency
    expect(DEFAULT_HANDSET_KEYS.key1Long).toBe(0x02);  // Monitor Momentary
    expect(DEFAULT_HANDSET_KEYS.key2Short).toBe(0x03); // Scan
    expect(DEFAULT_HANDSET_KEYS.key3Short).toBe(0x0C); // Frequency match
  });

  it('encodes handset key settings to a 6-byte EEPROM record', () => {
    const customKeys: HandsetKeySettings = {
      key1Short: 0x04, // Reverse Frequency
      key1Long: 0x01,  // Monitor Latched
      key2Short: 0x08, // FM Radio
      key2Long: 0x0B,  // Warning Light
      key3Short: 0x09, // Alarm Beep
      key3Long: 0x0C   // Frequency Match
    };

    const encoded = encodeHandsetKeysToEeprom(customKeys);
    expect(encoded).toHaveLength(EEPROM_KEYS_LENGTH);
    expect(encoded[0]).toBe(0x04);
    expect(encoded[1]).toBe(0x01);
    expect(encoded[2]).toBe(0x08);
    expect(encoded[3]).toBe(0x0B);
    expect(encoded[4]).toBe(0x09);
    expect(encoded[5]).toBe(0x0C);
  });

  it('decodes handset key settings from a 6-byte EEPROM record with validation fallback', () => {
    const rawBytes = new Uint8Array([0x04, 0x02, 0x03, 0x08, 0x0C, 0x09]);
    const decoded = decodeHandsetKeysFromEeprom(rawBytes);

    expect(decoded.key1Short).toBe(0x04);
    expect(decoded.key1Long).toBe(0x02);
    expect(decoded.key2Short).toBe(0x03);
    expect(decoded.key2Long).toBe(0x08);
    expect(decoded.key3Short).toBe(0x0C);
    expect(decoded.key3Long).toBe(0x09);
  });

  it('handles invalid opcodes gracefully with default fallback', () => {
    const invalidBytes = new Uint8Array([0xFF, 0xEE, 0xDD, 0xAA, 0x77, 0x99]);
    const decoded = decodeHandsetKeysFromEeprom(invalidBytes);

    expect(decoded.key1Short).toBe(DEFAULT_HANDSET_KEYS.key1Short);
    expect(decoded.key1Long).toBe(DEFAULT_HANDSET_KEYS.key1Long);
    expect(decoded.key2Short).toBe(DEFAULT_HANDSET_KEYS.key2Short);
  });

  it('persists handset key settings across YSF codeplug encode and decode cycle', () => {
    const customKeys: HandsetKeySettings = {
      key1Short: 0x04, // Reverse Frequency
      key1Long: 0x02,  // Monitor Momentary
      key2Short: 0x00, // Unassigned
      key2Long: 0x00,
      key3Short: 0x0C, // Frequency Match
      key3Long: 0x09   // Alarm Beep
    };

    const fresh = createNewCodeplug();
    const encodedYsf = encodeYsf(fresh.channels, fresh.rawHeader, fresh.rawTail, customKeys);

    // Verify raw byte offsets directly in the tail
    expect(encodedYsf[TAIL_OFFSET + TAIL_KEYS_OFFSET + 0]).toBe(0x04);
    expect(encodedYsf[TAIL_OFFSET + TAIL_KEYS_OFFSET + 1]).toBe(0x02);
    expect(encodedYsf[TAIL_OFFSET + TAIL_KEYS_OFFSET + 2]).toBe(0x00);
    expect(encodedYsf[TAIL_OFFSET + TAIL_KEYS_OFFSET + 3]).toBe(0x00);
    expect(encodedYsf[TAIL_OFFSET + TAIL_KEYS_OFFSET + 4]).toBe(0x0C);
    expect(encodedYsf[TAIL_OFFSET + TAIL_KEYS_OFFSET + 5]).toBe(0x09);

    // Decode and verify roundtrip
    const decoded = decodeYsf(encodedYsf);
    expect(decoded.keys).toBeDefined();
    expect(decoded.keys.key1Short).toBe(0x04);
    expect(decoded.keys.key1Long).toBe(0x02);
    expect(decoded.keys.key2Short).toBe(0x00);
    expect(decoded.keys.key3Short).toBe(0x0C);
    expect(decoded.keys.key3Long).toBe(0x09);
  });
});
