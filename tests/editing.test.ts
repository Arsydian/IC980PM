import { describe, it, expect } from 'vitest';
import { createBlankChannel, createBlankChannels, deriveDuplex, parseFrequencyInput, withDuplex, withOffset, withRxFreq, withTxFreq } from '../src/codecs/channel';
import { compactChannels, deleteAndShift, insertBlank, moveChannels, sortByFrequency } from '../src/codecs/channel-ops';
import { planPlacement } from '../src/codecs/placement';
import { validateChannels } from '../src/codecs/validation';
import { getRegion } from '../src/codecs/band-plans';
import { diffYsfImages } from '../src/codecs/ysf-diff';
import { createNewCodeplug, encodeYsf } from '../src/codecs/ysf-codec';
import { parseBackup, serializeBackup } from '../src/codecs/radio-backup';
import { createHistory, historyReducer } from '../src/state/history';

const ch = (id: number, rx: number, name = `CH${id}`) => ({ ...createBlankChannel(id), name, rxFreq: rx, txFreq: rx });

describe('Channel frequency helpers', () => {
  it('derives duplex, and treats cross-band as split', () => {
    expect(deriveDuplex(146.94, 146.34)).toEqual({ duplex: '-', offset: 0.6 });
    expect(deriveDuplex(146.52, 446.0)).toEqual({ duplex: 'SPLIT', offset: 299.48 });
  });

  it('keeps TX consistent while editing', () => {
    let c = withRxFreq(ch(1, 146.94), 146.94);
    c = withOffset(withDuplex(c, '-'), 0.6);
    expect(c.txFreq).toBeCloseTo(146.34, 6);
    c = withRxFreq(c, 147.0);
    expect(c.txFreq).toBeCloseTo(146.4, 6);
    c = withTxFreq(withDuplex(c, 'SPLIT'), 446.0);
    expect(c).toMatchObject({ duplex: 'SPLIT', txFreq: 446 });
  });

  it('parses MHz, kHz and Hz input', () => {
    expect(parseFrequencyInput('146.52')).toBe(146.52);
    expect(parseFrequencyInput('146,52')).toBe(146.52);
    expect(parseFrequencyInput('146520')).toBe(146.52);
    expect(parseFrequencyInput('146520000')).toBe(146.52);
    expect(parseFrequencyInput('abc')).toBeNaN();
  });
});

describe('Row operations', () => {
  it('moves, inserts, deletes, compacts and sorts', () => {
    const base = createBlankChannels();
    base[0] = ch(1, 446.0, 'B');
    base[2] = ch(3, 146.52, 'A');

    const moved = moveChannels(base, [2], -1);
    expect(moved.channels[1].name).toBe('A');
    expect(moved.channels[1].id).toBe(2);
    expect(moved.indices).toEqual([1]);

    const inserted = insertBlank(base, 0)!;
    expect(inserted[1].name).toBe('B');

    expect(deleteAndShift(base, [0])[1].name).toBe('A');
    expect(compactChannels(base).slice(0, 2).map((c) => c.name)).toEqual(['B', 'A']);
    expect(sortByFrequency(base).slice(0, 2).map((c) => c.name)).toEqual(['A', 'B']);
  });

  it('refuses to insert when channel 500 is in use', () => {
    const full = createBlankChannels();
    full[499] = ch(500, 146.52);
    expect(insertBlank(full, 0)).toBeNull();
  });

  it('plans placement and reports overwrites', () => {
    const existing = createBlankChannels();
    existing[1] = ch(2, 146.52);
    expect(planPlacement(existing, 2, 'appendEmpty').targets).toEqual([0, 2]);
    const startAt = planPlacement(existing, 2, 'startAt', 1);
    expect(startAt.targets).toEqual([0, 1]);
    expect(startAt.overwrites).toEqual([2]);
    expect(planPlacement(existing, 3, 'startAt', 499).dropped).toBe(1);
  });
});

describe('Validation', () => {
  it('flags out-of-range and out-of-band transmit frequencies', () => {
    const channels = createBlankChannels();
    channels[0] = ch(1, 146.52);
    channels[1] = ch(2, 462.5625);                   // GMRS: hardware OK, not amateur
    channels[2] = { ...ch(3, 146.52), txFreq: 300 };  // outside hardware TX
    channels[3] = ch(4, 145.9);                       // US OK, UK OK
    channels[4] = { ...ch(5, 119.1), mode: 1 as const }; // airband, RX only
    channels[5] = ch(6, 146.52);                      // duplicate of 1

    const us = validateChannels(channels, getRegion('US'));
    expect(us.filter((i) => i.severity === 'error').map((i) => i.channelId)).toEqual([3]);
    expect(us.filter((i) => i.severity === 'warning').map((i) => i.channelId)).toEqual([2]);
    expect(us.some((i) => i.channelId === 6 && /duplicate/.test(i.message))).toBe(true);
    expect(us.some((i) => i.channelId === 5)).toBe(false);

    const uk = validateChannels([ch(1, 147.0)], getRegion('GB'));
    expect(uk[0]).toMatchObject({ severity: 'warning' });
  });
});

describe('File comparison and backups', () => {
  it('labels the bytes that differ between two codeplugs', () => {
    const cp = createNewCodeplug();
    const a = encodeYsf(cp.channels, cp.image);
    const b = new Uint8Array(a);
    b[43064 + 100] = 0x42;
    const runs = diffYsfImages(a, b);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ start: 43164, label: 'Settings (unmapped)', a: [a[43164]], b: [0x42] });
  });

  it('serialises and parses radio backups', () => {
    const text = serializeBackup({ model: 'P3207', createdAt: '2026-10-23T00:00:00Z', appVersion: '1.2.0', blocks: [{ address: 0x1000, data: Uint8Array.of(1, 2, 3) }] });
    const back = parseBackup(text);
    expect(back.blocks[0].address).toBe(0x1000);
    expect(Array.from(back.blocks[0].data)).toEqual([1, 2, 3]);
    expect(() => parseBackup('{"format":"other"}')).toThrow();
  });
});

describe('Undo history', () => {
  it('undoes, redoes and coalesces typing into one step', () => {
    let h = createHistory(0);
    h = historyReducer(h, { type: 'set', value: 1, coalesceKey: 'name:1' });
    h = historyReducer(h, { type: 'set', value: 2, coalesceKey: 'name:1' });
    h = historyReducer(h, { type: 'set', value: 3 });
    h = historyReducer(h, { type: 'undo' });
    expect(h.present).toBe(2);
    h = historyReducer(h, { type: 'undo' });
    expect(h.present).toBe(0);
    h = historyReducer(h, { type: 'redo' });
    expect(h.present).toBe(2);
  });
});
