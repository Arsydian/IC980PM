import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

function subscribe<T>(channel: string, callback: (value: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, value: T) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('ic980', {
  isDesktop: true,
  platform: process.platform,
  onSerialPorts: (cb: (ports: unknown[]) => void) => subscribe('serial:ports', cb),
  onSerialPortAdded: (cb: (port: unknown) => void) => subscribe('serial:port-added', cb),
  onSerialPortRemoved: (cb: (port: unknown) => void) => subscribe('serial:port-removed', cb),
  selectSerialPort: (portId: string | null) => ipcRenderer.invoke('serial:select', portId),
  setRepeaterBookToken: (token: string) => ipcRenderer.invoke('rb:set-token', token),
  hasRepeaterBookToken: () => ipcRenderer.invoke('rb:has-token'),
  repeaterBookFetch: (url: string, contact: string) => ipcRenderer.invoke('rb:fetch', url, contact),
  saveBackup: (fileName: string, contents: string) => ipcRenderer.invoke('backup:save', fileName, contents),
  openBackupsFolder: () => ipcRenderer.invoke('backup:open-folder')
});
