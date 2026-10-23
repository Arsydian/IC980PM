import { describe, it, expect } from 'vitest';
import { FakeRadio } from '../src/services/fake-radio';
import { OperationCancelledError, RadioLink, RadioProtocol } from '../src/services/serial-driver';
import { readRadio, restoreRadio, writeRadio } from '../src/services/radio-operations';
import { createBlankChannel, createBlankChannels } from '../src/codecs/channel';
import { getChannelEepromAddress } from '../src/codecs/eeprom-codec';
import { ctcssTone } from '../src/codecs/tone-tables';

const channel = (id: number, name: string, rx: number, tx = rx) => ({ ...createBlankChannel(id), name, rxFreq: rx, txFreq: tx });

function radioWith(options: ConstructorParameters<typeof FakeRadio>[0] = {}) {
  const radio = new FakeRadio(options);
  radio.setChannel(0, channel(1, 'CALL', 146.52));
  radio.setChannel(1, { ...channel(2, 'RPT', 146.94, 146.34), txTone: ctcssTone(100) });
  radio.setKeys([0x04, 0x02, 0x03, 0x08, 0x0C, 0x09]);
  return radio;
}

describe('PROG81LS protocol', () => {
  it('survives replies that arrive later than the old 200 ms poll window', async () => {
    const radio = radioWith({ latencyMs: 250 });
    const link = new RadioLink(radio);
    const proto = new RadioProtocol(radio, link.queue);
    expect(await proto.handshake()).toBe('P3207');
    const rec = await proto.readBlock(getChannelEepromAddress(0), 34);
    expect(String.fromCharCode(...rec.subarray(18, 22))).toBe('CALL');
    await proto.end();
    expect(radio.sessionEnded).toBe(true);
  });

  it('reassembles replies split into single-byte chunks', async () => {
    const radio = radioWith({ chunkSize: 1 });
    const link = new RadioLink(radio);
    const proto = new RadioProtocol(radio, link.queue);
    await proto.handshake();
    const rec = await proto.readBlock(getChannelEepromAddress(1), 34);
    expect(String.fromCharCode(...rec.subarray(18, 21))).toBe('RPT');
  });

  it('accepts the longer "YS" handshake header', async () => {
    const radio = radioWith({ ysHeader: true });
    const link = new RadioLink(radio);
    expect(await new RadioProtocol(radio, link.queue).handshake()).toBe('P3207');
  });

  it('refuses a radio that reports a different model, before writing anything', async () => {
    const radio = radioWith({ modelIdent: Uint8Array.from([0x55, 0x56, 0x2D, 0x4B, 0x35, 0, 0, 0]) });
    await expect(writeRadio(new RadioLink(radio), createBlankChannels())).rejects.toThrow(/Unexpected radio model/);
    expect(radio.commands.some((c) => c.startsWith('W'))).toBe(false);
  });

  it('retries reads the radio does not answer', async () => {
    const radio = radioWith({ dropReads: 2 });
    const link = new RadioLink(radio);
    const proto = new RadioProtocol(radio, link.queue, { timeoutMs: 100 });
    await proto.handshake();
    const rec = await proto.readBlock(getChannelEepromAddress(0), 34);
    expect(rec[0]).not.toBe(0xFF);
    expect(radio.commands.filter((c) => c.startsWith('R')).length).toBe(3);
  });
});

describe('Radio read / write operations', () => {
  it('reads channels, treats erased (0xFF) slots as empty, and ends the session', async () => {
    const radio = radioWith();
    const { channels, keys, backup } = await readRadio(new RadioLink(radio));
    expect(channels[0].name).toBe('CALL');
    expect(channels[1].txFreq).toBeCloseTo(146.34, 6);
    expect(channels[1].txTone.ctcss).toBe(100);
    expect(channels[2].rxFreq).toBe(0);
    expect(keys.key3Short).toBe(0x0C);
    expect(backup.blocks.length).toBe(501);
    expect(radio.sessionEnded).toBe(true);
  });

  it('writes, verifies, uses the radio\'s own empty fill, and reports the backup first', async () => {
    const radio = radioWith();
    const link = new RadioLink(radio);
    const read = await readRadio(link);
    const edited = [...read.channels];
    edited[0] = createBlankChannel(1);
    edited[5] = channel(6, 'NEW', 446.0);

    let backupSeen = false;
    const result = await writeRadio(link, edited, {
      onBackup: (b) => { backupSeen = b.blocks.length === 501; }
    });
    expect(backupSeen).toBe(true);
    expect(result.verified).toBe(true);
    expect(radio.memory[getChannelEepromAddress(0)]).toBe(0xFF);
    const again = await readRadio(link);
    expect(again.channels[0].rxFreq).toBe(0);
    expect(again.channels[5].name).toBe('NEW');
    expect(again.channels[1].name).toBe('RPT');
  });

  it('only sends changed records when asked to', async () => {
    const radio = radioWith();
    const link = new RadioLink(radio);
    const read = await readRadio(link);
    const edited = [...read.channels];
    edited[1] = { ...edited[1], name: 'RENAMED' };
    const before = radio.commands.length;
    const result = await writeRadio(link, edited, { onlyChanged: true, keys: read.keys });
    expect(result.written).toBe(1);
    expect(radio.commands.slice(before).filter((c) => c.startsWith('W')).length).toBe(1);
  });

  it('fails verification when the radio stores different data, and still ends the session', async () => {
    const radio = radioWith({ corruptWrite: 3 });
    const link = new RadioLink(radio);
    const read = await readRadio(link);
    await expect(writeRadio(link, read.channels)).rejects.toThrow(/Verification failed/);
    expect(radio.sessionEnded).toBe(true);
  });

  it('can be cancelled, and still ends the session', async () => {
    const radio = radioWith();
    const controller = new AbortController();
    const promise = readRadio(new RadioLink(radio), {
      signal: controller.signal,
      onProgress: (pct) => { if (pct > 20) controller.abort(); }
    });
    await expect(promise).rejects.toBeInstanceOf(OperationCancelledError);
    expect(radio.sessionEnded).toBe(true);
  });

  it('restores a backup byte for byte', async () => {
    const radio = radioWith();
    const link = new RadioLink(radio);
    const { backup } = await readRadio(link);
    await writeRadio(link, createBlankChannels());
    expect(radio.memory[getChannelEepromAddress(0) + 18]).toBe(0xFF);
    await restoreRadio(link, backup);
    const after = await readRadio(link);
    expect(after.channels[0].name).toBe('CALL');
    expect(after.channels[1].name).toBe('RPT');
  });
}, 30000);
