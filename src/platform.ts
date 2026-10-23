export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
export const PROJECT_URL = 'https://github.com/Arsydian/IC980PM';

export interface SerialPortInfo {
  portId: string;
  portName?: string;
  displayName?: string;
  vendorId?: number;
  productId?: number;
}

/** Functions the Electron preload script exposes; undefined in a plain browser. */
export interface DesktopBridge {
  isDesktop: true;
  platform: string;
  onSerialPorts(cb: (ports: SerialPortInfo[]) => void): () => void;
  onSerialPortAdded(cb: (port: SerialPortInfo) => void): () => void;
  onSerialPortRemoved(cb: (port: SerialPortInfo) => void): () => void;
  selectSerialPort(portId: string | null): Promise<void>;
  setRepeaterBookToken(token: string): Promise<{ stored: 'secure' | 'session' | 'none' }>;
  hasRepeaterBookToken(): Promise<boolean>;
  repeaterBookFetch(url: string, contact: string): Promise<{ status: number; body: string }>;
  saveBackup(fileName: string, contents: string): Promise<string>;
  openBackupsFolder(): Promise<void>;
}

export const desktop: DesktopBridge | undefined =
  typeof window !== 'undefined' ? (window as unknown as { ic980?: DesktopBridge }).ic980 : undefined;

/** Browser storage that never throws (private windows and blocked storage return null). */
export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): boolean {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
};

export function downloadFile(fileName: string, data: string | Uint8Array, mime: string): void {
  const blob = new Blob([typeof data === 'string' ? data : new Uint8Array(data)], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
