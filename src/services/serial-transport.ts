/** A byte pipe to the radio: a USB serial cable, or the built-in simulator. */
export interface SerialTransport {
  readonly label: string;
  write(data: Uint8Array): Promise<void>;
  /** Starts delivering incoming bytes. Call once. */
  start(onData: (chunk: Uint8Array) => void, onClose: (error?: unknown) => void): void;
  close(): Promise<void>;
}

/** USB-serial chips commonly used in programming cables. */
const KNOWN_CABLE_CHIPS: Record<number, string> = {
  0x067b: 'Prolific PL2303',
  0x0403: 'FTDI',
  0x1a86: 'WCH CH340/CH341',
  0x10c4: 'Silicon Labs CP210x'
};

export function describeUsbVendor(vendorId?: number): string | undefined {
  return vendorId === undefined ? undefined : KNOWN_CABLE_CHIPS[vendorId];
}

export function isKnownCableChip(vendorId?: number): boolean {
  return vendorId !== undefined && vendorId in KNOWN_CABLE_CHIPS;
}

export function isWebSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

/** Web Serial (Chrome, Edge, and the Electron desktop app). */
export class WebSerialTransport implements SerialTransport {
  readonly label: string;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private closing = false;

  private constructor(private port: any) {
    const info = port.getInfo?.() ?? {};
    const chip = describeUsbVendor(info.usbVendorId);
    this.label = chip ? `${chip} cable` : 'USB serial port';
  }

  static async request(baudRate = 115200): Promise<WebSerialTransport> {
    if (!isWebSerialSupported()) {
      throw new Error('This browser cannot open serial ports. Use the desktop app, or Chrome / Edge.');
    }
    let port: any;
    try {
      port = await (navigator as any).serial.requestPort();
    } catch (err: any) {
      if (err?.name === 'NotFoundError') throw new Error('No port selected.');
      throw err;
    }
    try {
      await port.open({ baudRate, dataBits: 8, stopBits: 1, parity: 'none', bufferSize: 4096, flowControl: 'none' });
    } catch (err: any) {
      throw new Error(`Could not open the serial port: ${err?.message ?? err}. Is another program (such as the OEM software) using it?`);
    }
    return new WebSerialTransport(port);
  }

  /** True when the given SerialPort disconnect event is for this port. */
  isPort(port: unknown): boolean {
    return port === this.port;
  }

  async write(data: Uint8Array): Promise<void> {
    const writer = this.port.writable.getWriter();
    try {
      await writer.write(data);
    } finally {
      writer.releaseLock();
    }
  }

  start(onData: (chunk: Uint8Array) => void, onClose: (error?: unknown) => void): void {
    this.reader = this.port.readable.getReader();
    const loop = async () => {
      try {
        for (;;) {
          const { value, done } = await this.reader!.read();
          if (done) break;
          if (value && value.length) onData(value);
        }
        onClose();
      } catch (err) {
        onClose(this.closing ? undefined : err);
      } finally {
        this.reader?.releaseLock();
        this.reader = null;
      }
    };
    void loop();
  }

  async close(): Promise<void> {
    this.closing = true;
    try {
      await this.reader?.cancel();
    } catch {
      // already closed
    }
    try {
      await this.port.close();
    } catch {
      // already closed
    }
  }
}
