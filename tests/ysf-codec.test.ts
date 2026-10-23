import { describe, it, expect } from 'vitest';
import {
  decodeYsf,
  encodeYsf,
  createNewCodeplug,
  getDefaultTemplateBytes,
  TOTAL_FILE_SIZE,
  MAX_CH,
  HEADER_SIZE,
  REC_SIZE
} from '../src/codecs/ysf-codec';

describe('YSF Codeplug Binary Codec', () => {
  it('should decode the clean factory template with 0 active channels', () => {
    const raw = getDefaultTemplateBytes();
    expect(raw.length).toBe(TOTAL_FILE_SIZE);

    const { channels, rawHeader, rawTail } = decodeYsf(raw);
    expect(channels.length).toBe(MAX_CH);
    expect(rawHeader.length).toBe(HEADER_SIZE);
    expect(rawTail.length).toBe(3982);

    const active = channels.filter(c => c.rxFreq > 0);
    expect(active.length).toBe(0);

    // Verify channel 1 is blank
    const ch1 = channels[0];
    expect(ch1.id).toBe(1);
    expect(ch1.rxFreq).toBe(0);
    expect(ch1.txFreq).toBe(0);
    expect(ch1.duplex).toBe('OFF');
    expect(ch1.name.trim()).toBe('');
  });

  it('should create a clean blank codeplug via createNewCodeplug()', () => {
    const { channels, rawHeader, rawTail } = createNewCodeplug();
    expect(channels.length).toBe(MAX_CH);
    expect(rawHeader.length).toBe(HEADER_SIZE);
    expect(rawTail.length).toBe(3982);

    // Ensure all 500 channels are blank
    const active = channels.filter(c => c.rxFreq > 0);
    expect(active.length).toBe(0);

    // Ensure channel allocation bitmask is all zeroes
    for (let b = 351; b <= 413; b++) {
      expect(rawHeader[b]).toBe(0);
    }
  });

  it('should round-trip encode and decode programmed channels without data loss', () => {
    const codeplug = createNewCodeplug();

    // Program two test channels
    codeplug.channels[0] = {
      ...codeplug.channels[0],
      name: 'CALL-146.52',
      rxFreq: 146.52000,
      txFreq: 146.52000,
      duplex: 'OFF',
      offset: 0,
      power: 1,
      bandwidth: 1,
      scan: 1,
      mode: 0
    };

    codeplug.channels[1] = {
      ...codeplug.channels[1],
      name: 'RPT-146.88',
      rxFreq: 146.88000,
      txFreq: 146.28000,
      duplex: '-',
      offset: 0.60000,
      power: 1,
      bandwidth: 1,
      scan: 1,
      mode: 0,
      txTone: { type: 1, ctcss: 100.0, dcs: '023' }
    };

    const reEncoded = encodeYsf(codeplug.channels, codeplug.rawHeader, codeplug.rawTail);
    expect(reEncoded.length).toBe(TOTAL_FILE_SIZE);

    const reDecoded = decodeYsf(reEncoded);
    expect(reDecoded.channels.length).toBe(MAX_CH);

    const ch1 = reDecoded.channels[0];
    expect(ch1.name).toBe('CALL-146.52');
    expect(ch1.rxFreq).toBe(146.52000);
    expect(ch1.txFreq).toBe(146.52000);
    expect(ch1.duplex).toBe('OFF');

    const ch2 = reDecoded.channels[1];
    expect(ch2.name).toBe('RPT-146.88');
    expect(ch2.rxFreq).toBe(146.88000);
    expect(ch2.txFreq).toBe(146.28000);
    expect(ch2.duplex).toBe('-');
    expect(ch2.offset).toBe(0.60000);
    expect(ch2.txTone.type).toBe(1);
    expect(ch2.txTone.ctcss).toBe(100.0);

    // Channel 3 onwards should be empty
    expect(reDecoded.channels[2].rxFreq).toBe(0);
  });

  it('should correctly calculate active channels bitmask in header bytes 351..413', () => {
    const codeplug = createNewCodeplug();
    codeplug.channels[0].rxFreq = 146.52000; // Channel 1 active
    codeplug.channels[1].rxFreq = 146.88000; // Channel 2 active

    const reEncoded = encodeYsf(codeplug.channels, codeplug.rawHeader, codeplug.rawTail);

    // Channel 1 is active: bit 1 of byte 351 (Math.floor(1/8)=0, 1<<1=2)
    const byte351 = reEncoded[351];
    expect((byte351 & (1 << 1)) !== 0).toBe(true);

    // Channel 2 is active: bit 2 of byte 351 (1<<2=4)
    expect((byte351 & (1 << 2)) !== 0).toBe(true);

    // Channel 3 is not active: bit 3 of byte 351 (1<<3=8)
    expect((byte351 & (1 << 3)) === 0).toBe(true);
  });
});
