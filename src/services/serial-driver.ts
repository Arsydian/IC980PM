import { RadioChannel, HandsetKeySettings } from '../types/radio';
import {
  decodeChannelFromEeprom,
  encodeChannelToEeprom,
  getChannelEepromAddress,
  EEPROM_RECORD_SIZE,
  EEPROM_KEYS_ADDRESS,
  EEPROM_KEYS_LENGTH,
  encodeHandsetKeysToEeprom,
  decodeHandsetKeysFromEeprom,
  DEFAULT_HANDSET_KEYS
} from '../codecs/eeprom-codec';

export interface SerialProgressCallback {
  (percentage: number, statusText: string): void;
}

export class RadioSerialDriver {
  private port: any = null;
  private reader: any = null;
  private writer: any = null;
  private isConnected = false;

  public get connected(): boolean {
    return this.isConnected;
  }

  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  public async connect(baudRate = 115200): Promise<boolean> {
    if (!this.isSupported()) {
      throw new Error('Web Serial API is not supported in this environment. Please use Chrome, Edge, or the Electron Desktop version.');
    }

    try {
      this.port = await (navigator as any).serial.requestPort();
      await this.port.open({
        baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        bufferSize: 4096
      });

      this.reader = this.port.readable.getReader();
      this.writer = this.port.writable.getWriter();
      this.isConnected = true;
      return true;
    } catch (err: any) {
      this.isConnected = false;
      throw new Error(`Failed to open serial port: ${err.message}`);
    }
  }

  public async disconnect(): Promise<void> {
    try {
      if (this.reader) {
        await this.reader.cancel();
        this.reader.releaseLock();
        this.reader = null;
      }
      if (this.writer) {
        await this.writer.close();
        this.writer.releaseLock();
        this.writer = null;
      }
      if (this.port) {
        await this.port.close();
        this.port = null;
      }
    } catch (e) {
      console.warn('Error during disconnect:', e);
    } finally {
      this.isConnected = false;
    }
  }

  private async writeBytes(bytes: Uint8Array): Promise<void> {
    if (!this.writer) throw new Error('Serial writer not available');
    await this.writer.write(bytes);
  }

  private async readExactBytes(count: number, timeoutMs = 2000): Promise<Uint8Array> {
    if (!this.reader) throw new Error('Serial reader not available');

    const result = new Uint8Array(count);
    let bytesRead = 0;
    const startTime = Date.now();

    while (bytesRead < count) {
      if (Date.now() - startTime > timeoutMs) {
        throw new Error(`Serial read timeout waiting for ${count} bytes (got ${bytesRead} bytes)`);
      }

      // Check with a small timeout window
      const readPromise = this.reader.read();
      const timeoutPromise = new Promise<{ value: undefined; done: boolean }>(resolve =>
        setTimeout(() => resolve({ value: undefined, done: false }), 200)
      );

      const res = await Promise.race([readPromise, timeoutPromise]);
      if (res.done) {
        throw new Error('Serial port was closed unexpectedly');
      }

      if (res.value) {
        const chunk = res.value as Uint8Array;
        for (let i = 0; i < chunk.length && bytesRead < count; i++) {
          result[bytesRead++] = chunk[i];
        }
      }
    }

    return result;
  }

  /**
   * Performs the IC-980 Pro Max protocol handshake
   */
  public async performHandshake(): Promise<string> {
    // 1. Send PROG81LS magic (8 bytes)
    const magic = new Uint8Array([0x50, 0x52, 0x4F, 0x47, 0x38, 0x31, 0x4C, 0x53]);
    await this.writeBytes(magic);

    // 2. Read first response (expecting 'A' = 0x41 or 14-byte 'YS' model header)
    const ack1 = await this.readExactBytes(1, 1500);
    if (ack1[0] !== 0x41 && ack1[0] !== 0x59) {
      throw new Error(`Invalid radio handshake response: 0x${ack1[0].toString(16)} (expected 0x41 'A')`);
    }

    // 3. Send STX (0x02)
    await this.writeBytes(new Uint8Array([0x02]));

    // 4. Read model ID response: P3207\xff\xff\xff (8 bytes)
    const modelBytes = await this.readExactBytes(8, 1500);
    const modelStr = String.fromCharCode(...modelBytes.subarray(0, 5));

    // 5. Send ACK (0x06)
    await this.writeBytes(new Uint8Array([0x06]));

    // 6. Read confirmation ACK (0x06)
    const ack2 = await this.readExactBytes(1, 1500);
    if (ack2[0] !== 0x06) {
      throw new Error(`Radio did not confirm handshake (got 0x${ack2[0].toString(16)}, expected 0x06)`);
    }

    return modelStr;
  }

  /**
   * Read block from radio EEPROM
   */
  public async readBlock(address: number, length: number): Promise<Uint8Array> {
    // Command: 'R' (0x52) + 3-byte Addr (BE) + 1-byte length
    const cmd = new Uint8Array([
      0x52,
      (address >> 16) & 0xFF,
      (address >> 8) & 0xFF,
      address & 0xFF,
      length & 0xFF
    ]);
    await this.writeBytes(cmd);

    // Response: 'W' (0x57) + 3-byte Addr + 1-byte length + Data payload
    const totalRespLen = 5 + length;
    const resp = await this.readExactBytes(totalRespLen, 2500);

    if (resp[0] !== 0x57) {
      throw new Error(`Unexpected block read header 0x${resp[0].toString(16)} (expected 'W' 0x57)`);
    }

    // Send ACK (0x06)
    await this.writeBytes(new Uint8Array([0x06]));

    return resp.subarray(5, totalRespLen);
  }

  /**
   * Write block to radio EEPROM
   */
  public async writeBlock(address: number, data: Uint8Array): Promise<void> {
    // Command: 'W' (0x57) + 3-byte Addr (BE) + 1-byte length + Data
    const cmd = new Uint8Array(5 + data.length);
    cmd[0] = 0x57;
    cmd[1] = (address >> 16) & 0xFF;
    cmd[2] = (address >> 8) & 0xFF;
    cmd[3] = address & 0xFF;
    cmd[4] = data.length & 0xFF;
    cmd.set(data, 5);

    await this.writeBytes(cmd);

    // Radio returns 1 byte ACK (0x06)
    const ack = await this.readExactBytes(1, 2500);
    if (ack[0] !== 0x06) {
      throw new Error(`Block write failed at address 0x${address.toString(16)} (got 0x${ack[0].toString(16)})`);
    }
  }

  /**
   * Finalize and reboot radio
   */
  public async finishProgramming(): Promise<void> {
    // Send 'E' (0x45)
    await this.writeBytes(new Uint8Array([0x45]));
  }

  /**
   * Reads channels and settings from the physical radio
   */
  public async readRadioData(onProgress?: SerialProgressCallback): Promise<{ channels: RadioChannel[]; keys: HandsetKeySettings }> {
    onProgress?.(5, 'Connecting and handshaking with radio...');
    await this.performHandshake();

    const channels: RadioChannel[] = [];
    const totalChannels = 500;

    for (let i = 0; i < totalChannels; i++) {
      const channelId = i + 1;
      const addr = getChannelEepromAddress(i);

      if (i % 15 === 0) {
        const percent = Math.round(10 + (i / totalChannels) * 80);
        onProgress?.(percent, `Reading Channel ${channelId} of 500 (Addr 0x${addr.toString(16)})...`);
      }

      const block = await this.readBlock(addr, EEPROM_RECORD_SIZE);
      const ch = decodeChannelFromEeprom(block, channelId);
      channels.push(ch);
    }

    onProgress?.(92, 'Reading handset programmable key settings...');
    let keys: HandsetKeySettings = { ...DEFAULT_HANDSET_KEYS };
    try {
      const keysBlock = await this.readBlock(EEPROM_KEYS_ADDRESS, EEPROM_KEYS_LENGTH);
      keys = decodeHandsetKeysFromEeprom(keysBlock);
    } catch (e) {
      console.warn('Could not read handset keys from EEPROM, using defaults:', e);
    }

    onProgress?.(98, 'Finalizing programming session...');
    await this.finishProgramming();
    onProgress?.(100, 'Complete! Codeplug read successfully.');

    return { channels, keys };
  }

  /**
   * Reads all 500 channels from the physical radio
   */
  public async readAllChannels(onProgress?: SerialProgressCallback): Promise<RadioChannel[]> {
    const data = await this.readRadioData(onProgress);
    return data.channels;
  }

  /**
   * Writes all modified channels and handset keys to the physical radio
   */
  public async writeRadioData(
    channels: RadioChannel[],
    keys?: HandsetKeySettings,
    onProgress?: SerialProgressCallback
  ): Promise<void> {
    onProgress?.(5, 'Connecting and handshaking with radio...');
    await this.performHandshake();

    const totalChannels = Math.min(channels.length, 500);

    for (let i = 0; i < totalChannels; i++) {
      const ch = channels[i];
      const addr = getChannelEepromAddress(i);

      if (i % 15 === 0) {
        const percent = Math.round(10 + (i / totalChannels) * 80);
        onProgress?.(percent, `Writing Channel ${i + 1} of 500...`);
      }

      const encoded = encodeChannelToEeprom(ch);
      await this.writeBlock(addr, encoded);
    }

    if (keys) {
      onProgress?.(94, 'Writing handset programmable key assignments...');
      const encodedKeys = encodeHandsetKeysToEeprom(keys);
      await this.writeBlock(EEPROM_KEYS_ADDRESS, encodedKeys);
    }

    onProgress?.(98, 'Rebooting radio...');
    await this.finishProgramming();
    onProgress?.(100, 'Complete! Radio programmed successfully.');
  }

  /**
   * Writes all modified channels to the physical radio
   */
  public async writeAllChannels(channels: RadioChannel[], onProgress?: SerialProgressCallback): Promise<void> {
    await this.writeRadioData(channels, undefined, onProgress);
  }
}

export const serialDriver = new RadioSerialDriver();
