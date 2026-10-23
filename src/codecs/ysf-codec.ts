import { CodeplugExtras, HandsetKeySettings, RadioChannel } from '../types/radio';
import { decodeToneValue, encodeToneValue } from './tone-tables';
import { DEFAULT_TEMPLATE_B64 } from './default-template';
import { decodeHandsetKeysFromEeprom, encodeHandsetKeysToEeprom } from './eeprom-codec';
import { createBlankChannel, deriveDuplex, isChannelEmpty, MAX_CHANNELS } from './channel';
import { base64ToBytes, readAscii, writeAscii } from './text';

// .ysf file layout (47,046 bytes): header 564 B | 500 channel records x 85 B | settings block 3,982 B
export const HEADER_SIZE = 564;
export const REC_SIZE = 85;
export const MAX_CH = MAX_CHANNELS;
export const TAIL_SIZE = 3982;
export const TAIL_OFFSET = HEADER_SIZE + MAX_CH * REC_SIZE; // 43,064
export const TOTAL_FILE_SIZE = TAIL_OFFSET + TAIL_SIZE;     // 47,046

// Header bytes 351..413: one bit per occupied channel (channel n -> byte 351 + n/8, bit n%8)
export const BITMASK_START = 351;
export const BITMASK_END = 413;

// Offsets below are inferred from the factory template's structure, not from documentation.
// See docs/MAPPING.md for how they were derived and how to confirm or add more.
/** Two channel-format records in the header (factory values 430.000 and 144.300 MHz). */
export const VFO_RECORD_OFFSETS = [173, 258];
/** Seven channel-format records filling the last 595 bytes of the settings block. */
export const TAIL_RECORDS_OFFSET = TAIL_OFFSET + 3387;
export const TAIL_RECORD_COUNT = 7;
/** Power-on message, ASCII (factory value "HELLO"). */
export const POWER_ON_MSG_OFFSET = TAIL_OFFSET + 3315;
export const POWER_ON_MSG_LENGTH = 7;
/** Six handset key opcodes, relative to the start of the settings block. */
export const TAIL_KEYS_OFFSET = 41;

// Field offsets inside an 85-byte channel record
export const F_RX = 0;              // 4 bytes u32 LE, Hz
export const F_TX = 14;             // 4 bytes u32 LE, Hz
export const F_RXT = 28;            // 2 bytes u16 LE, tone value
export const F_RXT_TYPE = 30;       // 1 byte, tone type
export const F_TXT = 41;            // 2 bytes u16 LE, tone value
export const F_TXT_TYPE = 43;       // 1 byte, tone type
export const F_BUSY_RXSIG = 57;     // bits 3-4 busy, bits 5-6 rx signal code
export const F_SCAN_PWR_BW = 58;    // bit 7 scan, bit 5 power, bit 4 bw, bits 1-3 special DCS, bit 0 compander
export const F_SCR_VAGUE = 59;      // bit 4 vague subaudio, bits 0-3 scrambler
export const F_MODE_TONES = 60;     // bit 2 AM, bits 4-5 rx tone type, bits 6-7 tx tone type
export const F_PUSH_CODE = 61;
export const F_POP_CODE = 62;
export const F_NAME = 63;           // 16 bytes ASCII
export const NAME_LEN = 16;

function u32le(r: Uint8Array, o: number): number {
  return ((r[o] | (r[o + 1] << 8) | (r[o + 2] << 16) | (r[o + 3] << 24)) >>> 0);
}

function u16le(r: Uint8Array, o: number): number {
  return (r[o] | (r[o + 1] << 8)) >>> 0;
}

function putU32(buf: Uint8Array, o: number, v: number): void {
  buf[o] = v & 0xFF;
  buf[o + 1] = (v >> 8) & 0xFF;
  buf[o + 2] = (v >> 16) & 0xFF;
  buf[o + 3] = (v >>> 24) & 0xFF;
}

function putU16(buf: Uint8Array, o: number, v: number): void {
  buf[o] = v & 0xFF;
  buf[o + 1] = (v >> 8) & 0xFF;
}

export function getDefaultTemplateBytes(): Uint8Array {
  return base64ToBytes(DEFAULT_TEMPLATE_B64);
}

const isBlankHz = (hz: number) => hz === 0 || hz === 0xFFFFFFFF;

/** Decodes one 85-byte record. Empty records still carry their raw bytes. */
export function decodeRecord(rec: Uint8Array, id: number): RadioChannel {
  const rawBytes = Array.from(rec.subarray(0, REC_SIZE));
  const rxHz = u32le(rec, F_RX);
  if (isBlankHz(rxHz)) return { ...createBlankChannel(id), rawBytes };

  const txRaw = u32le(rec, F_TX);
  const txHz = isBlankHz(txRaw) ? rxHz : txRaw;
  const rxFreq = rxHz / 1e6;
  const txFreq = txHz / 1e6;
  const { duplex, offset } = deriveDuplex(rxFreq, txFreq);

  const b57 = rec[F_BUSY_RXSIG];
  const b58 = rec[F_SCAN_PWR_BW];
  const b59 = rec[F_SCR_VAGUE];
  const b60 = rec[F_MODE_TONES];

  return {
    id,
    name: readAscii(rec, F_NAME, NAME_LEN),
    rxFreq,
    txFreq,
    duplex,
    offset,
    rxTone: decodeToneValue(u16le(rec, F_RXT), rec[F_RXT_TYPE]),
    txTone: decodeToneValue(u16le(rec, F_TXT), rec[F_TXT_TYPE]),
    busy: Math.min(2, (b57 >> 3) & 3) as 0 | 1 | 2,
    rxSig: ((b57 >> 5) & 3) as 0 | 1 | 2 | 3,
    scan: ((b58 >> 7) & 1) as 0 | 1,
    power: ((b58 >> 5) & 1) as 0 | 1,
    bandwidth: ((b58 >> 4) & 1) as 0 | 1,
    specialDcs: Math.min(4, (b58 >> 1) & 7) as 0 | 1 | 2 | 3 | 4,
    compander: (b58 & 1) as 0 | 1,
    scrambler: b59 & 0x0F,
    vague: ((b59 >> 4) & 1) as 0 | 1,
    mode: ((b60 >> 2) & 1) as 0 | 1,
    pushCode: rec[F_PUSH_CODE],
    popCode: rec[F_POP_CODE],
    rawBytes
  };
}

/**
 * Writes a channel into the record at `off`, starting from its original bytes so
 * unknown bits survive. With `zeroIfEmpty`, an empty channel clears the whole record
 * (how the OEM software stores unused channel slots).
 */
export function encodeRecord(buf: Uint8Array, off: number, ch: RadioChannel, zeroIfEmpty: boolean): void {
  const empty = isChannelEmpty(ch);
  if (empty && zeroIfEmpty) {
    buf.fill(0, off, off + REC_SIZE);
    return;
  }

  if (ch.rawBytes && ch.rawBytes.length === REC_SIZE) {
    buf.set(ch.rawBytes, off);
  } else {
    buf.fill(0, off, off + REC_SIZE);
  }

  const rxHz = empty ? 0 : Math.round(ch.rxFreq * 1e6) >>> 0;
  const txHz = empty ? 0 : (ch.txFreq > 0 ? Math.round(ch.txFreq * 1e6) >>> 0 : rxHz);
  putU32(buf, off + F_RX, rxHz);
  putU32(buf, off + F_TX, txHz);

  const rxEnc = encodeToneValue(ch.rxTone);
  putU16(buf, off + F_RXT, rxEnc.rawVal);
  buf[off + F_RXT_TYPE] = rxEnc.toneType;

  const txEnc = encodeToneValue(ch.txTone);
  putU16(buf, off + F_TXT, txEnc.rawVal);
  buf[off + F_TXT_TYPE] = txEnc.toneType;

  buf[off + F_BUSY_RXSIG] = (buf[off + F_BUSY_RXSIG] & 0x87)
    | ((ch.busy & 3) << 3)
    | ((ch.rxSig & 3) << 5);
  buf[off + F_SCAN_PWR_BW] = (buf[off + F_SCAN_PWR_BW] & 0x40)
    | ((ch.scan & 1) << 7)
    | ((ch.power & 1) << 5)
    | ((ch.bandwidth & 1) << 4)
    | ((ch.specialDcs & 7) << 1)
    | (ch.compander & 1);
  buf[off + F_SCR_VAGUE] = (buf[off + F_SCR_VAGUE] & 0xE0)
    | ((ch.vague & 1) << 4)
    | (ch.scrambler & 0x0F);
  buf[off + F_MODE_TONES] = (buf[off + F_MODE_TONES] & 0x0B)
    | ((ch.mode & 1) << 2)
    | ((rxEnc.toneType & 3) << 4)
    | ((txEnc.toneType & 3) << 6);
  buf[off + F_PUSH_CODE] = ch.pushCode & 0xFF;
  buf[off + F_POP_CODE] = ch.popCode & 0xFF;
  writeAscii(buf, off + F_NAME, NAME_LEN, ch.name);
}

export interface DecodedYsf {
  channels: RadioChannel[];
  /** The complete file image; bytes the app does not model are kept from here. */
  image: Uint8Array;
  extras: CodeplugExtras;
}

export function decodeExtras(image: Uint8Array): CodeplugExtras {
  const keys: HandsetKeySettings = decodeHandsetKeysFromEeprom(
    image.subarray(TAIL_OFFSET + TAIL_KEYS_OFFSET, TAIL_OFFSET + TAIL_KEYS_OFFSET + 6)
  );
  return {
    keys,
    powerOnMessage: readAscii(image, POWER_ON_MSG_OFFSET, POWER_ON_MSG_LENGTH),
    vfos: VFO_RECORD_OFFSETS.map((off, i) => decodeRecord(image.subarray(off, off + REC_SIZE), i + 1)),
    tailMemories: Array.from({ length: TAIL_RECORD_COUNT }, (_, i) => {
      const off = TAIL_RECORDS_OFFSET + i * REC_SIZE;
      return decodeRecord(image.subarray(off, off + REC_SIZE), i + 1);
    })
  };
}

export function decodeYsf(buf: Uint8Array): DecodedYsf {
  if (buf.length < HEADER_SIZE + REC_SIZE) {
    throw new Error(`File is too small to be a valid YSF codeplug (${buf.length} bytes)`);
  }
  if (buf.length > TOTAL_FILE_SIZE) {
    throw new Error(`File is larger than a YSF codeplug (${buf.length} bytes, expected ${TOTAL_FILE_SIZE})`);
  }

  // A short (truncated) file is completed from the factory template.
  const image = getDefaultTemplateBytes();
  image.set(buf.subarray(0, Math.min(buf.length, TOTAL_FILE_SIZE)), 0);

  const channels: RadioChannel[] = [];
  for (let i = 0; i < MAX_CH; i++) {
    const off = HEADER_SIZE + i * REC_SIZE;
    channels.push(off + REC_SIZE <= buf.length
      ? decodeRecord(image.subarray(off, off + REC_SIZE), i + 1)
      : createBlankChannel(i + 1));
  }

  return { channels, image, extras: decodeExtras(image) };
}

export function encodeYsf(
  channels: RadioChannel[],
  image?: Uint8Array,
  extras?: Partial<CodeplugExtras>
): Uint8Array {
  const buf = image && image.length === TOTAL_FILE_SIZE ? new Uint8Array(image) : getDefaultTemplateBytes();

  buf.fill(0, BITMASK_START, BITMASK_END + 1);
  for (let i = 0; i < MAX_CH; i++) {
    const ch = channels[i];
    if (!isChannelEmpty(ch)) {
      const n = i + 1;
      buf[BITMASK_START + Math.floor(n / 8)] |= (1 << (n % 8));
    }
    const blank = ch ?? createBlankChannel(i + 1);
    encodeRecord(buf, HEADER_SIZE + i * REC_SIZE, blank, true);
  }

  if (extras?.keys) {
    buf.set(encodeHandsetKeysToEeprom(extras.keys), TAIL_OFFSET + TAIL_KEYS_OFFSET);
  }
  if (extras?.powerOnMessage !== undefined) {
    writeAscii(buf, POWER_ON_MSG_OFFSET, POWER_ON_MSG_LENGTH, extras.powerOnMessage);
  }
  extras?.vfos?.slice(0, VFO_RECORD_OFFSETS.length).forEach((vfo, i) => {
    encodeRecord(buf, VFO_RECORD_OFFSETS[i], vfo, false);
  });
  extras?.tailMemories?.slice(0, TAIL_RECORD_COUNT).forEach((mem, i) => {
    encodeRecord(buf, TAIL_RECORDS_OFFSET + i * REC_SIZE, mem, false);
  });

  return buf;
}

export function createNewCodeplug(): DecodedYsf {
  const image = getDefaultTemplateBytes();
  image.fill(0, BITMASK_START, BITMASK_END + 1);
  const channels = Array.from({ length: MAX_CH }, (_, i) => createBlankChannel(i + 1));
  return { channels, image, extras: decodeExtras(image) };
}

/** Human-readable description of a byte offset, for the file comparison tool. */
export function describeYsfOffset(offset: number): string {
  if (offset < HEADER_SIZE) {
    if (offset >= BITMASK_START && offset <= BITMASK_END) return 'Header · channel-in-use bitmask';
    const vfo = VFO_RECORD_OFFSETS.findIndex((o) => offset >= o && offset < o + REC_SIZE);
    if (vfo !== -1) return `Header · VFO ${vfo === 0 ? 'A' : 'B'} record +${offset - VFO_RECORD_OFFSETS[vfo]} (${recordFieldName(offset - VFO_RECORD_OFFSETS[vfo])})`;
    return `Header +${offset}`;
  }
  if (offset < TAIL_OFFSET) {
    const rel = offset - HEADER_SIZE;
    const ch = Math.floor(rel / REC_SIZE) + 1;
    return `Channel ${ch} +${rel % REC_SIZE} (${recordFieldName(rel % REC_SIZE)})`;
  }
  const tailRel = offset - TAIL_OFFSET;
  if (offset >= TAIL_RECORDS_OFFSET) {
    const rel = offset - TAIL_RECORDS_OFFSET;
    return `Settings +${tailRel} · tail memory ${Math.floor(rel / REC_SIZE) + 1} +${rel % REC_SIZE} (${recordFieldName(rel % REC_SIZE)})`;
  }
  if (tailRel >= TAIL_KEYS_OFFSET && tailRel < TAIL_KEYS_OFFSET + 6) return `Settings +${tailRel} · handset key byte ${tailRel - TAIL_KEYS_OFFSET + 1}`;
  if (offset >= POWER_ON_MSG_OFFSET && offset < POWER_ON_MSG_OFFSET + POWER_ON_MSG_LENGTH) return `Settings +${tailRel} · power-on message`;
  return `Settings +${tailRel} (unmapped)`;
}

function recordFieldName(rel: number): string {
  if (rel < 4) return 'RX frequency';
  if (rel >= F_TX && rel < F_TX + 4) return 'TX frequency';
  if (rel === F_RXT || rel === F_RXT + 1) return 'RX tone value';
  if (rel === F_RXT_TYPE) return 'RX tone type';
  if (rel === F_TXT || rel === F_TXT + 1) return 'TX tone value';
  if (rel === F_TXT_TYPE) return 'TX tone type';
  if (rel === F_BUSY_RXSIG) return 'busy lock / RX signal code';
  if (rel === F_SCAN_PWR_BW) return 'scan / power / bandwidth / special DCS / compander';
  if (rel === F_SCR_VAGUE) return 'scrambler / vague subaudio';
  if (rel === F_MODE_TONES) return 'FM-AM / tone types';
  if (rel === F_PUSH_CODE) return 'PTT push code';
  if (rel === F_POP_CODE) return 'PTT pop code';
  if (rel >= F_NAME && rel < F_NAME + NAME_LEN) return 'name';
  return 'unmapped';
}
