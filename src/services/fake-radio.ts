import { RadioChannel } from '../types/radio';
import { createBlankChannel } from '../codecs/channel';
import { EEPROM_KEYS_ADDRESS, encodeChannelToEeprom, getChannelEepromAddress } from '../codecs/eeprom-codec';
import { ctcssTone } from '../codecs/tone-tables';
import { SerialTransport } from './serial-transport';

export interface FakeRadioOptions {
  /** Delay before each reply, in ms. */
  latencyMs?: number;
  /** Split every reply into chunks of this many bytes (0 = one chunk). */
  chunkSize?: number;
  /** 8-byte model identifier returned during the handshake. */
  modelIdent?: Uint8Array;
  /** Answer the magic with a 14-byte "YS…" header instead of 'A'. */
  ysHeader?: boolean;
  /** Byte that unused memory holds (erased flash is 0xFF). */
  emptyFill?: number;
  /** Ignore this many read commands (no reply), to exercise retries. */
  dropReads?: number;
  /** Corrupt the stored byte of the Nth write (1-based), to exercise verification. */
  corruptWrite?: number;
}

const MEMORY_SIZE = 0x20000;

/**
 * An in-memory IC-980 Pro Max that speaks the PROG81LS protocol. Used by the
 * test suite and offered in the app as "Simulated radio" for trying the
 * read/write flow without hardware.
 */
export class FakeRadio implements SerialTransport {
  readonly label = 'Simulated radio';
  readonly memory: Uint8Array;
  readonly commands: string[] = [];
  private inbox: number[] = [];
  private onData: ((chunk: Uint8Array) => void) | null = null;
  private state: 'idle' | 'magic' | 'ident' | 'ready' | 'awaitAck' = 'idle';
  private writes = 0;
  private dropReads: number;
  private closed = false;

  constructor(private options: FakeRadioOptions = {}) {
    this.memory = new Uint8Array(MEMORY_SIZE).fill(options.emptyFill ?? 0xFF);
    this.dropReads = options.dropReads ?? 0;
  }

  /** Puts a channel into memory the way the radio stores it. */
  setChannel(index: number, ch: RadioChannel): void {
    this.memory.set(encodeChannelToEeprom(ch, this.options.emptyFill ?? 0xFF), getChannelEepromAddress(index));
  }

  setKeys(bytes: number[]): void {
    this.memory.set(bytes, EEPROM_KEYS_ADDRESS);
  }

  get sessionEnded(): boolean {
    return this.commands[this.commands.length - 1] === 'E';
  }

  start(onData: (chunk: Uint8Array) => void): void {
    this.onData = onData;
    this.closed = false;
    this.inbox = [];
    this.state = 'idle';
  }

  async write(data: Uint8Array): Promise<void> {
    if (this.closed) throw new Error('Port closed');
    this.inbox.push(...data);
    this.process();
  }

  async close(): Promise<void> {
    this.closed = true;
    this.onData = null;
  }

  private reply(bytes: number[]): void {
    const chunk = this.options.chunkSize || bytes.length;
    const latency = this.options.latencyMs ?? 0;
    if (latency === 0 && chunk >= bytes.length) {
      // Still asynchronous, but without timer granularity (about 15 ms on Windows).
      const all = Uint8Array.from(bytes);
      queueMicrotask(() => this.onData?.(all));
      return;
    }
    for (let o = 0; o < bytes.length; o += chunk) {
      const part = Uint8Array.from(bytes.slice(o, o + chunk));
      setTimeout(() => this.onData?.(part), latency + o);
    }
  }

  private process(): void {
    for (;;) {
      // A new handshake always restarts the session, like power-cycling the radio.
      if (this.state !== 'idle' && this.findMagic() === 0) this.state = 'idle';
      if (this.state === 'idle') {
        const idx = this.findMagic();
        if (idx === -1) return;
        this.inbox.splice(0, idx + 8);
        this.commands.push('PROG81LS');
        this.state = 'magic';
        this.reply(this.options.ysHeader
          ? [0x59, 0x53, ...Array.from('IC980PROMAX', (c) => c.charCodeAt(0)), 0x00]
          : [0x41]);
        continue;
      }
      if (this.inbox.length === 0) return;

      if (this.state === 'magic') {
        if (this.inbox.shift() !== 0x02) continue;
        this.state = 'ident';
        this.reply(Array.from(this.options.modelIdent ?? Uint8Array.from([0x50, 0x33, 0x32, 0x30, 0x37, 0xFF, 0xFF, 0xFF])));
        continue;
      }
      if (this.state === 'ident') {
        if (this.inbox.shift() !== 0x06) continue;
        this.state = 'ready';
        this.reply([0x06]);
        continue;
      }
      if (this.state === 'awaitAck') {
        this.inbox.shift();
        this.state = 'ready';
        continue;
      }

      const cmd = this.inbox[0];
      if (cmd === 0x45) {
        this.inbox.shift();
        this.commands.push('E');
        this.state = 'idle';
        continue;
      }
      if (cmd === 0x52) {
        if (this.inbox.length < 5) return;
        const [, a2, a1, a0, len] = this.inbox.splice(0, 5);
        const addr = (a2 << 16) | (a1 << 8) | a0;
        this.commands.push(`R ${addr.toString(16)} ${len}`);
        if (this.dropReads > 0) {
          this.dropReads--;
          continue;
        }
        this.state = 'awaitAck';
        this.reply([0x57, a2, a1, a0, len, ...this.memory.subarray(addr, addr + len)]);
        continue;
      }
      if (cmd === 0x57) {
        if (this.inbox.length < 5) return;
        const len = this.inbox[4];
        if (this.inbox.length < 5 + len) return;
        const [, a2, a1, a0] = this.inbox.splice(0, 5);
        const data = this.inbox.splice(0, len);
        const addr = (a2 << 16) | (a1 << 8) | a0;
        this.commands.push(`W ${addr.toString(16)} ${len}`);
        this.writes++;
        this.memory.set(data, addr);
        if (this.options.corruptWrite === this.writes) this.memory[addr] ^= 0xFF;
        this.reply([0x06]);
        continue;
      }
      this.inbox.shift(); // unknown byte
    }
  }

  private findMagic(): number {
    const magic = [0x50, 0x52, 0x4F, 0x47, 0x38, 0x31, 0x4C, 0x53];
    for (let i = 0; i + magic.length <= this.inbox.length; i++) {
      if (magic.every((b, k) => this.inbox[i + k] === b)) return i;
    }
    return -1;
  }
}

let shared: FakeRadio | null = null;

/** The app's simulated radio keeps its memory for the whole session, with a few demo channels. */
export function getSimulatedRadio(): FakeRadio {
  if (!shared) {
    shared = new FakeRadio({ latencyMs: 2 });
    const demo: [number, string, number, number, number?][] = [
      [0, '2M CALL', 146.52, 146.52],
      [1, '70CM CALL', 446.0, 446.0],
      [2, 'DEMO RPT', 146.94, 146.34, 100.0],
      [3, 'NOAA WX1', 162.55, 162.55]
    ];
    for (const [i, name, rx, tx, tone] of demo) {
      const ch = { ...createBlankChannel(i + 1), name, rxFreq: rx, txFreq: tx };
      if (tone) ch.txTone = ctcssTone(tone);
      shared.setChannel(i, ch);
    }
    shared.setKeys([0x04, 0x02, 0x03, 0x08, 0x0C, 0x09]);
  }
  // The app opens a fresh session each time it connects.
  return shared;
}
