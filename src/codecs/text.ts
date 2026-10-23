export const CHANNEL_NAME_LENGTH = 16;

/**
 * Converts text to what the radio can display: printable ASCII only.
 * Accented letters lose their accents ("é" -> "e"); anything else becomes "?".
 */
export function toRadioAscii(text: string, maxLength = CHANNEL_NAME_LENGTH): string {
  const plain = (text || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  let out = '';
  for (const char of plain) {
    const code = char.charCodeAt(0);
    out += code >= 0x20 && code <= 0x7e ? char : '?';
    if (out.length >= maxLength) break;
  }
  return out;
}

export function writeAscii(buf: Uint8Array, offset: number, length: number, text: string): void {
  const clean = toRadioAscii(text, length);
  for (let i = 0; i < length; i++) {
    buf[offset + i] = i < clean.length ? clean.charCodeAt(i) : 0;
  }
}

/** Reads a zero-terminated ASCII field; 0xFF bytes (erased flash) also terminate. */
export function readAscii(buf: Uint8Array, offset: number, length: number): string {
  let out = '';
  for (let i = offset; i < offset + length; i++) {
    const b = buf[i];
    if (b === 0 || b === 0xff) break;
    out += b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '?';
  }
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function toHex(n: number, width = 2): string {
  return n.toString(16).toUpperCase().padStart(width, '0');
}
