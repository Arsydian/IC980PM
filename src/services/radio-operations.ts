import { HandsetKeySettings, RadioChannel } from '../types/radio';
import {
  decodeChannelFromEeprom,
  decodeHandsetKeysFromEeprom,
  detectEmptyFill,
  EEPROM_KEYS_ADDRESS,
  EEPROM_KEYS_LENGTH,
  EEPROM_RECORD_SIZE,
  encodeChannelToEeprom,
  encodeHandsetKeysToEeprom,
  getChannelEepromAddress
} from '../codecs/eeprom-codec';
import { MAX_CHANNELS } from '../codecs/channel';
import { RadioBackup, RadioBlock } from '../codecs/radio-backup';
import { RadioLink, RadioProtocol, SerialProgressCallback } from './serial-driver';

export interface OperationOptions {
  onProgress?: SerialProgressCallback;
  signal?: AbortSignal;
  appVersion?: string;
}

/** Every block the app knows about, in the order they are read. */
function mappedBlocks(): { address: number; length: number; channelIndex?: number }[] {
  const blocks: { address: number; length: number; channelIndex?: number }[] = Array.from(
    { length: MAX_CHANNELS },
    (_, i) => ({ address: getChannelEepromAddress(i), length: EEPROM_RECORD_SIZE, channelIndex: i })
  );
  blocks.push({ address: EEPROM_KEYS_ADDRESS, length: EEPROM_KEYS_LENGTH });
  return blocks;
}

/** Runs `body` inside one programming session and always ends the session. */
async function withSession<T>(
  link: RadioLink,
  options: OperationOptions,
  body: (proto: RadioProtocol, model: string) => Promise<T>
): Promise<T> {
  if (link.isClosed) throw new Error('The radio is disconnected. Reconnect and try again.');
  const proto = new RadioProtocol(link.transport, link.queue);
  options.onProgress?.(2, 'Handshaking with the radio…');
  try {
    const model = await proto.handshake(options.signal);
    return await body(proto, model);
  } finally {
    try {
      await proto.end();
    } catch {
      // the port may already be gone
    }
  }
}

async function readAll(
  proto: RadioProtocol,
  model: string,
  options: OperationOptions,
  from: number,
  to: number
): Promise<RadioBackup> {
  const list = mappedBlocks();
  const blocks: RadioBlock[] = [];
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (i % 10 === 0) {
      const label = b.channelIndex !== undefined ? `channel ${b.channelIndex + 1} of ${MAX_CHANNELS}` : 'handset keys';
      options.onProgress?.(Math.round(from + (i / list.length) * (to - from)), `Reading ${label}…`);
    }
    blocks.push({ address: b.address, data: await proto.readBlock(b.address, b.length, options.signal) });
  }
  return { model, createdAt: new Date().toISOString(), appVersion: options.appVersion ?? '', blocks };
}

export interface ReadResult {
  backup: RadioBackup;
  channels: RadioChannel[];
  keys: HandsetKeySettings;
}

export async function readRadio(link: RadioLink, options: OperationOptions = {}): Promise<ReadResult> {
  return withSession(link, options, async (proto, model) => {
    const backup = await readAll(proto, model, options, 5, 95);
    const channels = backup.blocks.slice(0, MAX_CHANNELS).map((b, i) => decodeChannelFromEeprom(b.data, i + 1));
    const keys = decodeHandsetKeysFromEeprom(backup.blocks[MAX_CHANNELS].data);
    options.onProgress?.(100, 'Read complete.');
    return { backup, channels, keys };
  });
}

export interface WriteOptions extends OperationOptions {
  keys?: HandsetKeySettings;
  /** Only send records that differ from what the radio already holds. */
  onlyChanged?: boolean;
  /** Read every written block back and compare. */
  verify?: boolean;
  /** Called with the pre-write backup before anything is written, so it can be saved first. */
  onBackup?: (backup: RadioBackup) => Promise<void> | void;
}

export interface WriteResult {
  backup: RadioBackup;
  written: number;
  unchanged: number;
  verified: boolean;
}

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

export async function writeRadio(
  link: RadioLink,
  channels: RadioChannel[],
  options: WriteOptions = {}
): Promise<WriteResult> {
  return withSession(link, options, async (proto, model) => {
    const backup = await readAll(proto, model, options, 4, 35);
    await options.onBackup?.(backup);

    const fill = detectEmptyFill(backup.blocks.slice(0, MAX_CHANNELS).map((b) => b.data));
    const pending: RadioBlock[] = [];
    for (let i = 0; i < MAX_CHANNELS; i++) {
      pending.push({ address: getChannelEepromAddress(i), data: encodeChannelToEeprom(channels[i], fill) });
    }
    if (options.keys) {
      pending.push({ address: EEPROM_KEYS_ADDRESS, data: encodeHandsetKeysToEeprom(options.keys) });
    }

    const toWrite = options.onlyChanged
      ? pending.filter((p) => {
        const before = backup.blocks.find((b) => b.address === p.address);
        return !before || !sameBytes(before.data, p.data);
      })
      : pending;

    for (let i = 0; i < toWrite.length; i++) {
      if (i % 10 === 0) {
        options.onProgress?.(Math.round(36 + (i / Math.max(1, toWrite.length)) * 44), `Writing block ${i + 1} of ${toWrite.length}…`);
      }
      await proto.writeBlock(toWrite[i].address, toWrite[i].data, options.signal);
    }

    if (options.verify !== false) {
      for (let i = 0; i < toWrite.length; i++) {
        if (i % 10 === 0) {
          options.onProgress?.(Math.round(80 + (i / Math.max(1, toWrite.length)) * 18), `Verifying block ${i + 1} of ${toWrite.length}…`);
        }
        const { address, data } = toWrite[i];
        const readBack = await proto.readBlock(address, data.length, options.signal);
        if (!sameBytes(readBack, data)) {
          throw new Error(`Verification failed at 0x${address.toString(16).toUpperCase()}: the radio holds different data than was written. Restore the backup and try again.`);
        }
      }
    }

    options.onProgress?.(100, 'Write complete.');
    return { backup, written: toWrite.length, unchanged: pending.length - toWrite.length, verified: options.verify !== false };
  });
}

/** Writes every block of a backup back to the radio, then verifies it. */
export async function restoreRadio(link: RadioLink, backup: RadioBackup, options: OperationOptions = {}): Promise<number> {
  return withSession(link, options, async (proto) => {
    const blocks = backup.blocks.flatMap((b) => {
      const parts: RadioBlock[] = [];
      for (let o = 0; o < b.data.length; o += 255) {
        parts.push({ address: b.address + o, data: b.data.subarray(o, Math.min(b.data.length, o + 255)) });
      }
      return parts;
    });
    for (let i = 0; i < blocks.length; i++) {
      if (i % 10 === 0) options.onProgress?.(Math.round(5 + (i / blocks.length) * 60), `Restoring block ${i + 1} of ${blocks.length}…`);
      await proto.writeBlock(blocks[i].address, blocks[i].data, options.signal);
    }
    for (let i = 0; i < blocks.length; i++) {
      if (i % 10 === 0) options.onProgress?.(Math.round(65 + (i / blocks.length) * 33), `Verifying block ${i + 1} of ${blocks.length}…`);
      const readBack = await proto.readBlock(blocks[i].address, blocks[i].data.length, options.signal);
      if (!sameBytes(readBack, blocks[i].data)) {
        throw new Error(`Verification failed at 0x${blocks[i].address.toString(16).toUpperCase()} while restoring.`);
      }
    }
    options.onProgress?.(100, 'Restore complete.');
    return blocks.length;
  });
}
