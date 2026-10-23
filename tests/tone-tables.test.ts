import { describe, it, expect } from 'vitest';
import {
  CTCSS_TONES,
  DCS_CODES,
  nearestCtcss,
  parseToneString,
  encodeToneValue,
  decodeToneValue,
  formatTone
} from '../src/codecs/tone-tables';
import { ToneSetting } from '../src/types/radio';

describe('CTCSS and DCS Tone Tables & Encoding', () => {
  it('should have standard 50 CTCSS frequencies and 104 DCS codes', () => {
    expect(CTCSS_TONES.length).toBe(50);
    expect(DCS_CODES.length).toBe(104);
    expect(CTCSS_TONES).toContain(88.5);
    expect(CTCSS_TONES).toContain(100.0);
    expect(DCS_CODES).toContain('023');
    expect(DCS_CODES).toContain('754');
  });

  it('should find nearest CTCSS frequency accurately', () => {
    expect(nearestCtcss(88.4)).toBe(88.5);
    expect(nearestCtcss(100.1)).toBe(100.0);
    expect(nearestCtcss(67.0)).toBe(67.0);
  });

  it('should parse CTCSS tone strings correctly', () => {
    const tone = parseToneString('88.5 Hz');
    expect(tone.type).toBe(1);
    expect(tone.ctcss).toBe(88.5);

    const toneOff = parseToneString('Off');
    expect(toneOff.type).toBe(0);
  });

  it('should parse DCS tone strings correctly', () => {
    const dcsN = parseToneString('D023N');
    expect(dcsN.type).toBe(2);
    expect(dcsN.dcs).toBe('023');

    const dcsI = parseToneString('D023I');
    expect(dcsI.type).toBe(3);
    expect(dcsI.dcs).toBe('023');
  });

  it('should round-trip encode and decode CTCSS tones', () => {
    const orig: ToneSetting = { type: 1, ctcss: 123.0, dcs: '023' };
    const encoded = encodeToneValue(orig);
    expect(encoded.rawVal).toBe(1230); // 123.0 * 10
    expect(encoded.toneType).toBe(1);

    const decoded = decodeToneValue(encoded.rawVal, encoded.toneType);
    expect(decoded.type).toBe(1);
    expect(decoded.ctcss).toBe(123.0);
  });

  it('should round-trip encode and decode DCS Normal and Inverted tones', () => {
    // DCS 023 octal is 0x13 (19 dec). 0x2800 | 19 = 0x2813
    const origN: ToneSetting = { type: 2, ctcss: 88.5, dcs: '023' };
    const encN = encodeToneValue(origN);
    expect(encN.rawVal).toBe(0x2800 | 0o23);
    expect(encN.toneType).toBe(2);

    const decN = decodeToneValue(encN.rawVal, encN.toneType);
    expect(decN.type).toBe(2);
    expect(decN.dcs).toBe('023');

    const origI: ToneSetting = { type: 3, ctcss: 88.5, dcs: '754' };
    const encI = encodeToneValue(origI);
    expect(encI.rawVal).toBe(0x2800 | 0o754);
    expect(encI.toneType).toBe(3);

    const decI = decodeToneValue(encI.rawVal, encI.toneType);
    expect(decI.type).toBe(3);
    expect(decI.dcs).toBe('754');
  });

  it('should format tone labels properly', () => {
    expect(formatTone({ type: 0, ctcss: 88.5, dcs: '023' })).toBe('None');
    expect(formatTone({ type: 1, ctcss: 88.5, dcs: '023' })).toBe('88.5 Hz');
    expect(formatTone({ type: 2, ctcss: 88.5, dcs: '023' })).toBe('D023N');
    expect(formatTone({ type: 3, ctcss: 88.5, dcs: '023' })).toBe('D023I');
  });
});
