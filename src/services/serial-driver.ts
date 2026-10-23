import { SerialTransport } from './serial-transport';

export interface SerialProgressCallback {
  (percentage: number, statusText: string): void;
}

export class RadioProtocolError extends Error {}

export class OperationCancelledError extends Error {
  constructor() {
    super('Cancelled.');
  }
}

const MAGIC = Uint8Array.from([0x50, 0x52, 0x4F, 0x47, 0x38, 0x31, 0x4C, 0x53]); // "PROG81LS"
const STX = 0x02;
const ACK = 0x06;
const CMD_READ = 0x52;  // 'R'
const CMD_WRITE = 0x57; // 'W'
const CMD_END = 0x45;   // 'E'

/** Model identifiers this driver accepts during the handshake. */
export const SUPPORTED_MODELS = ['P3207'];

const hex = (n: number) => `0x${n.toString(16).toUpperCase().padStart(2, '0')}`;

/**
 * Collects every byte the transport delivers so nothing is lost between reads,
 * however the bytes are split into chunks or however late they arrive.
 */
export class ByteQueue {
  private buf = new Uint8Array(0);
  private waiters: (() => void)[] = [];
  private closedError: Error | null = null;

  push(chunk: Uint8Array): void {
    const next = new Uint8Array(this.buf.length + chunk.length);
    next.set(this.buf, 0);
    next.set(chunk, this.buf.length);
    this.buf = next;
    this.wake();
  }

  close(error?: unknown): void {
    this.closedError = error instanceof Error ? error : new RadioProtocolError('The serial port was closed.');
    this.wake();
  }

  get available(): number {
    return this.buf.length;
  }

  /** Discards everything received so far; returns how many bytes were dropped. */
  drain(): number {
    const n = this.buf.length;
    this.buf = new Uint8Array(0);
    return n;
  }

  async take(count: number, timeoutMs: number, signal?: AbortSignal): Promise<Uint8Array> {
    const deadline = Date.now() + timeoutMs;
    while (this.buf.length < count) {
      if (signal?.aborted) throw new OperationCancelledError();
      if (this.closedError) throw this.closedError;
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new RadioProtocolError(`Timed out waiting for ${count} byte(s) from the radio (got ${this.buf.length}).`);
      }
      await this.wait(Math.min(remaining, 100));
    }
    const out = this.buf.slice(0, count);
    this.buf = this.buf.slice(count);
    return out;
  }

  /** Waits until no new bytes have arrived for `quietMs`, then discards them. */
  async settle(quietMs: number, maxMs = 1000): Promise<void> {
    const end = Date.now() + maxMs;
    let last = this.buf.length;
    while (Date.now() < end) {
      await this.wait(quietMs);
      if (this.buf.length === last) break;
      last = this.buf.length;
    }
    this.drain();
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.waiters = this.waiters.filter((w) => w !== done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.waiters.push(done);
    });
  }

  private wake(): void {
    for (const w of [...this.waiters]) w();
  }
}

/**
 * An open connection to the radio. The transport is started once, and every
 * byte it delivers lands in one queue that successive operations share.
 */
export class RadioLink {
  readonly queue = new ByteQueue();
  private closed = false;
  private closeListeners: ((error?: unknown) => void)[] = [];

  constructor(readonly transport: SerialTransport) {
    transport.start(
      (chunk) => this.queue.push(chunk),
      (error) => {
        this.closed = true;
        this.queue.close(error);
        this.closeListeners.forEach((l) => l(error));
      }
    );
  }

  get isClosed(): boolean {
    return this.closed;
  }

  onClose(listener: (error?: unknown) => void): void {
    this.closeListeners.push(listener);
  }

  async close(): Promise<void> {
    this.closed = true;
    this.queue.close();
    await this.transport.close();
  }
}

export interface ProtocolOptions {
  timeoutMs?: number;
  retries?: number;
  allowedModels?: string[];
}

/**
 * The PROG81LS programming protocol (reverse-engineered; not yet confirmed on a radio):
 *   host "PROG81LS" -> radio 'A' | host 0x02 -> radio "P3207\xFF\xFF\xFF" | host 0x06 -> radio 0x06
 *   read:  host 'R' a2 a1 a0 len          -> radio 'W' a2 a1 a0 len data...  then host 0x06
 *   write: host 'W' a2 a1 a0 len data...  -> radio 0x06
 *   end:   host 'E' (radio leaves programming mode)
 */
export class RadioProtocol {
  private timeoutMs: number;
  private retries: number;
  private allowedModels: string[];
  private inSession = false;

  constructor(private transport: SerialTransport, readonly queue: ByteQueue, options: ProtocolOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 1500;
    this.retries = options.retries ?? 3;
    this.allowedModels = options.allowedModels ?? SUPPORTED_MODELS;
  }

  get sessionOpen(): boolean {
    return this.inSession;
  }

  async handshake(signal?: AbortSignal): Promise<string> {
    this.queue.drain();
    await this.transport.write(MAGIC);

    const first = (await this.queue.take(1, this.timeoutMs, signal))[0];
    if (first === 0x59) {
      // Some firmware answers with a longer "YS..." header; skip the rest of it.
      await this.queue.settle(100);
    } else if (first !== 0x41) {
      throw new RadioProtocolError(`The radio did not answer the programming request (got ${hex(first)}, expected 'A'). Check the cable and that the radio is switched on.`);
    }

    await this.transport.write(Uint8Array.of(STX));
    const ident = await this.queue.take(8, this.timeoutMs, signal);
    const model = String.fromCharCode(...ident.subarray(0, 5));
    if (!this.allowedModels.some((m) => model.startsWith(m))) {
      const printable = Array.from(ident).map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')).join('');
      throw new RadioProtocolError(`Unexpected radio model "${printable}". This app only programs the IC-980 Pro Max (${this.allowedModels.join(', ')}); nothing was written.`);
    }

    await this.transport.write(Uint8Array.of(ACK));
    const ack = (await this.queue.take(1, this.timeoutMs, signal))[0];
    if (ack !== ACK) {
      throw new RadioProtocolError(`The radio did not confirm the handshake (got ${hex(ack)}, expected ${hex(ACK)}).`);
    }
    this.inSession = true;
    return model;
  }

  async readBlock(address: number, length: number, signal?: AbortSignal): Promise<Uint8Array> {
    return this.withRetry(`read at ${hex(address)}`, signal, async () => {
      await this.transport.write(Uint8Array.of(CMD_READ, (address >> 16) & 0xFF, (address >> 8) & 0xFF, address & 0xFF, length & 0xFF));
      const head = await this.queue.take(5, this.timeoutMs, signal);
      const echoed = (head[1] << 16) | (head[2] << 8) | head[3];
      if (head[0] !== CMD_WRITE || echoed !== address || head[4] !== (length & 0xFF)) {
        throw new RadioProtocolError(`Unexpected reply to read at ${hex(address)}: ${Array.from(head).map(hex).join(' ')}`);
      }
      const data = await this.queue.take(length, this.timeoutMs, signal);
      await this.transport.write(Uint8Array.of(ACK));
      return data;
    });
  }

  async writeBlock(address: number, data: Uint8Array, signal?: AbortSignal): Promise<void> {
    if (data.length === 0 || data.length > 255) throw new RadioProtocolError(`Invalid block length ${data.length}.`);
    const cmd = new Uint8Array(5 + data.length);
    cmd.set([CMD_WRITE, (address >> 16) & 0xFF, (address >> 8) & 0xFF, address & 0xFF, data.length], 0);
    cmd.set(data, 5);
    await this.withRetry(`write at ${hex(address)}`, signal, async () => {
      await this.transport.write(cmd);
      const ack = (await this.queue.take(1, this.timeoutMs, signal))[0];
      if (ack !== ACK) {
        throw new RadioProtocolError(`The radio rejected the write at ${hex(address)} (got ${hex(ack)}).`);
      }
    });
  }

  /** Ends the programming session. Safe to call more than once. */
  async end(): Promise<void> {
    if (!this.inSession) return;
    this.inSession = false;
    await this.transport.write(Uint8Array.of(CMD_END));
  }

  private async withRetry<T>(what: string, signal: AbortSignal | undefined, attempt: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let i = 0; i <= this.retries; i++) {
      if (signal?.aborted) throw new OperationCancelledError();
      try {
        return await attempt();
      } catch (err) {
        if (err instanceof OperationCancelledError) throw err;
        lastError = err;
        await this.queue.settle(50, 300);
      }
    }
    const msg = lastError instanceof Error ? lastError.message : String(lastError);
    throw new RadioProtocolError(`${msg} (gave up on ${what} after ${this.retries + 1} attempts)`);
  }
}
