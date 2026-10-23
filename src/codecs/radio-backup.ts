import { HandsetKeySettings, RadioChannel } from '../types/radio';
import {
  decodeChannelFromEeprom,
  decodeHandsetKeysFromEeprom,
  EEPROM_KEYS_ADDRESS,
  EEPROM_RECORD_SIZE,
  getChannelEepromAddress
} from './eeprom-codec';
import { MAX_CHANNELS } from './channel';
import { base64ToBytes, bytesToBase64 } from './text';

export const BACKUP_FORMAT = 'ic980pm-radio-backup';
export const BACKUP_EXTENSION = '.ic980bak';

/** One contiguous run of radio memory exactly as read over USB. */
export interface RadioBlock {
  address: number;
  data: Uint8Array;
}

export interface RadioBackup {
  model: string;
  createdAt: string;
  appVersion: string;
  blocks: RadioBlock[];
}

export function serializeBackup(backup: RadioBackup): string {
  return JSON.stringify({
    format: BACKUP_FORMAT,
    version: 1,
    model: backup.model,
    createdAt: backup.createdAt,
    appVersion: backup.appVersion,
    blocks: backup.blocks.map((b) => ({ address: b.address, data: bytesToBase64(b.data) }))
  }, null, 1);
}

export function parseBackup(text: string): RadioBackup {
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Not a radio backup file (invalid JSON).');
  }
  if (json?.format !== BACKUP_FORMAT || json.version !== 1 || !Array.isArray(json.blocks)) {
    throw new Error('Not an IC-980 Pro Max radio backup file.');
  }
  const blocks: RadioBlock[] = json.blocks.map((b: any) => {
    if (typeof b.address !== 'number' || b.address < 0 || b.address > 0xFFFFFF || typeof b.data !== 'string') {
      throw new Error('Radio backup contains an invalid memory block.');
    }
    return { address: b.address, data: base64ToBytes(b.data) };
  });
  return {
    model: String(json.model ?? ''),
    createdAt: String(json.createdAt ?? ''),
    appVersion: String(json.appVersion ?? ''),
    blocks
  };
}

export function findBlock(backup: RadioBackup, address: number, length: number): Uint8Array | null {
  for (const b of backup.blocks) {
    if (address >= b.address && address + length <= b.address + b.data.length) {
      return b.data.subarray(address - b.address, address - b.address + length);
    }
  }
  return null;
}

export function channelsFromBackup(backup: RadioBackup): { channels: RadioChannel[]; keys: HandsetKeySettings | null } {
  const channels: RadioChannel[] = [];
  for (let i = 0; i < MAX_CHANNELS; i++) {
    const rec = findBlock(backup, getChannelEepromAddress(i), EEPROM_RECORD_SIZE);
    channels.push(decodeChannelFromEeprom(rec ?? new Uint8Array(0), i + 1));
  }
  const keyBytes = findBlock(backup, EEPROM_KEYS_ADDRESS, 6);
  return { channels, keys: keyBytes ? decodeHandsetKeysFromEeprom(keyBytes) : null };
}

export function backupFileName(model: string, date = new Date()): string {
  const stamp = date.toISOString().replace(/[:T]/g, '-').slice(0, 19);
  return `IC980-${(model || 'radio').replace(/[^A-Za-z0-9]/g, '')}-backup-${stamp}${BACKUP_EXTENSION}`;
}
