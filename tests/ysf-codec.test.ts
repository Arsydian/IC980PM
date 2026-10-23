import { describe, it, expect } from 'vitest';
import {
  decodeYsf,
  encodeYsf,
  createNewCodeplug,
  getDefaultTemplateBytes,
  TOTAL_FILE_SIZE,
  MAX_CH,
  HEADER_SIZE,
  REC_SIZE,
  F_SCAN_PWR_BW,
  POWER_ON_MSG_OFFSET
} from '../src/codecs/ysf-codec';
import { createBlankChannel } from '../src/codecs/channel';
import { ctcssTone } from '../src/codecs/tone-tables';

describe('YSF Codeplug Binary Codec', () => {
  it('decodes the factory template with 0 active channels', () => {
    const raw = getDefaultTemplateBytes();
    expect(raw.length).toBe(TOTAL_FILE_SIZE);

    const { channels, image } = decodeYsf(raw);
    expect(channels.length).toBe(MAX_CH);
    expect(image.length).toBe(TOTAL_FILE_SIZE);
    expect(channels.filter((c) => c.rxFreq > 0).length).toBe(0);
    expect(channels[0]).toMatchObject({ id: 1, rxFreq: 0, txFreq: 0, duplex: 'OFF', name: '' });
  });

  it('decodes the records inferred from the template structure', () => {
    const { extras } = createNewCodeplug();
    expect(extras.vfos.map((v) => v.rxFreq)).toEqual([430, 144.3]);
    expect(extras.vfos[1].power).toBe(1);
    expect(extras.tailMemories).toHaveLength(7);
    expect(extras.tailMemories[0].rxFreq).toBe(0);
    expect(extras.tailMemories[1]).toMatchObject({ rxFreq: 435.025, txFreq: 455.025, scan: 1, bandwidth: 1, power: 1 });
    expect(extras.powerOnMessage).toBe('HELLO');
  });

  it('creates a blank codeplug with an empty channel bitmask', () => {
    const { channels, image } = createNewCodeplug();
    expect(channels.filter((c) => c.rxFreq > 0).length).toBe(0);
    for (let b = 351; b <= 413; b++) expect(image[b]).toBe(0);
  });

  it('round-trips programmed channels', () => {
    const codeplug = createNewCodeplug();
    codeplug.channels[0] = { ...codeplug.channels[0], name: 'CALL-146.52', rxFreq: 146.52, txFreq: 146.52 };
    codeplug.channels[1] = {
      ...codeplug.channels[1], name: 'RPT-146.88', rxFreq: 146.88, txFreq: 146.28, duplex: '-', offset: 0.6,
      txTone: ctcssTone(100)
    };
    const reDecoded = decodeYsf(encodeYsf(codeplug.channels, codeplug.image));
    expect(reDecoded.channels[0]).toMatchObject({ name: 'CALL-146.52', rxFreq: 146.52, txFreq: 146.52, duplex: 'OFF' });
    expect(reDecoded.channels[1]).toMatchObject({ name: 'RPT-146.88', rxFreq: 146.88, duplex: '-', offset: 0.6 });
    expect(reDecoded.channels[1].txFreq).toBeCloseTo(146.28, 6);
    expect(reDecoded.channels[1].txTone).toMatchObject({ type: 1, ctcss: 100 });
    expect(reDecoded.channels[2].rxFreq).toBe(0);
  });

  it('sets the active channel bitmask in header bytes 351..413', () => {
    const codeplug = createNewCodeplug();
    codeplug.channels[0].rxFreq = 146.52;
    codeplug.channels[1].rxFreq = 146.88;
    const bytes = encodeYsf(codeplug.channels, codeplug.image);
    expect(bytes[351] & (1 << 1)).not.toBe(0);
    expect(bytes[351] & (1 << 2)).not.toBe(0);
    expect(bytes[351] & (1 << 3)).toBe(0);
  });

  it('preserves unknown bits and bytes of an existing record', () => {
    const { channels, image } = createNewCodeplug();
    channels[0] = { ...createBlankChannel(1), name: 'X', rxFreq: 146.52, txFreq: 146.52 };
    const first = encodeYsf(channels, image);
    const off = HEADER_SIZE;
    first[off + F_SCAN_PWR_BW] |= 0x40; // unknown bit
    first[off + 80] = 0x5A;             // unmapped byte
    const decoded = decodeYsf(first);
    decoded.channels[0] = { ...decoded.channels[0], name: 'RENAMED' };
    const second = encodeYsf(decoded.channels, decoded.image);
    expect(second[off + F_SCAN_PWR_BW] & 0x40).toBe(0x40);
    expect(second[off + 80]).toBe(0x5A);
    expect(second.subarray(off, off + REC_SIZE)[63]).toBe('R'.charCodeAt(0));
  });

  it('writes extras (power-on message, VFOs) into the image', () => {
    const cp = createNewCodeplug();
    const vfos = [{ ...cp.extras.vfos[0], rxFreq: 446, txFreq: 446 }, cp.extras.vfos[1]];
    const bytes = encodeYsf(cp.channels, cp.image, { powerOnMessage: 'W1ABC', vfos });
    expect(String.fromCharCode(...bytes.subarray(POWER_ON_MSG_OFFSET, POWER_ON_MSG_OFFSET + 5))).toBe('W1ABC');
    expect(decodeYsf(bytes).extras.vfos[0].rxFreq).toBe(446);
  });

  it('stores names as printable ASCII', () => {
    const cp = createNewCodeplug();
    cp.channels[0] = { ...createBlankChannel(1), name: 'Café Ω', rxFreq: 146.52, txFreq: 146.52 };
    expect(decodeYsf(encodeYsf(cp.channels, cp.image)).channels[0].name).toBe('Cafe ?');
  });

  it('rejects files that are too large', () => {
    expect(() => decodeYsf(new Uint8Array(TOTAL_FILE_SIZE + 1))).toThrow(/larger/);
  });
});
