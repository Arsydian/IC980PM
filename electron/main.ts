import { app, BrowserWindow, dialog, ipcMain, net, safeStorage, shell } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

const devServerUrl = process.env.VITE_DEV_SERVER_URL;
const PROJECT_URL = 'https://github.com/Arsydian/IC980PM';
const RB_URL = /^https:\/\/www\.repeaterbook\.com\/api\/(export|exportROW)\.php\?[\w%&=.+-]*$/;

let mainWindow: BrowserWindow | null = null;
let pendingPortCallback: ((portId: string) => void) | null = null;
/** Used when the OS offers no encrypted storage (some Linux desktops): kept for this run only. */
let sessionToken: string | null = null;

interface PortInfo {
  portId: string;
  portName?: string;
  displayName?: string;
  vendorId?: number;
  productId?: number;
}

function toPortInfo(p: Electron.SerialPort): PortInfo {
  return {
    portId: p.portId,
    portName: p.portName,
    displayName: p.displayName,
    vendorId: p.vendorId ? parseInt(p.vendorId, 16) : undefined,
    productId: p.productId ? parseInt(p.productId, 16) : undefined
  };
}

const userFile = (...parts: string[]) => path.join(app.getPath('userData'), ...parts);
const backupsDir = () => userFile('backups');

function isAppUrl(url: string): boolean {
  return devServerUrl ? url.startsWith(devServerUrl) : url.startsWith('file://');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 1024,
    minHeight: 680,
    title: 'IC-980 Pro Max Programmer',
    backgroundColor: '#020617',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const ses = mainWindow.webContents.session;

  // navigator.serial.requestPort() lands here; the renderer shows its own picker.
  ses.on('select-serial-port', (event, portList, _webContents, callback) => {
    event.preventDefault();
    pendingPortCallback?.('');
    pendingPortCallback = callback;
    mainWindow?.webContents.send('serial:ports', portList.map(toPortInfo));
  });
  ses.on('serial-port-added', (_event, port) => mainWindow?.webContents.send('serial:port-added', toPortInfo(port)));
  ses.on('serial-port-removed', (_event, port) => mainWindow?.webContents.send('serial:port-removed', toPortInfo(port)));

  ses.setPermissionCheckHandler((_wc, permission) => permission === 'serial' || permission === 'geolocation');
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'geolocation'));
  ses.setDevicePermissionHandler((details) => details.deviceType === 'serial');

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });

  // The renderer blocks unload while there are unsaved edits; ask the user here.
  mainWindow.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(mainWindow!, {
      type: 'warning',
      buttons: ['Discard changes and close', 'Keep editing'],
      defaultId: 1,
      cancelId: 1,
      title: 'Unsaved changes',
      message: 'This codeplug has changes that are not saved to a .ysf file.',
      detail: 'A draft is kept and offered again next time you open the app.'
    });
    if (choice === 0) event.preventDefault();
  });

  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.handle('serial:select', (_event, portId: unknown) => {
  const callback = pendingPortCallback;
  pendingPortCallback = null;
  callback?.(typeof portId === 'string' ? portId : '');
});

async function readToken(): Promise<string | null> {
  if (sessionToken) return sessionToken;
  try {
    const encrypted = await fs.readFile(userFile('repeaterbook-token.bin'));
    return safeStorage.decryptString(encrypted);
  } catch {
    return null;
  }
}

ipcMain.handle('rb:set-token', async (_event, token: unknown) => {
  const value = typeof token === 'string' ? token.trim() : '';
  await fs.rm(userFile('repeaterbook-token.bin'), { force: true });
  sessionToken = null;
  if (!value) return { stored: 'none' };
  if (!/^[A-Za-z0-9_-]{8,256}$/.test(value)) throw new Error('That does not look like a RepeaterBook token.');
  if (safeStorage.isEncryptionAvailable()) {
    await fs.mkdir(app.getPath('userData'), { recursive: true });
    await fs.writeFile(userFile('repeaterbook-token.bin'), safeStorage.encryptString(value));
    return { stored: 'secure' };
  }
  sessionToken = value;
  return { stored: 'session' };
});

ipcMain.handle('rb:has-token', async () => (await readToken()) !== null);

ipcMain.handle('rb:fetch', async (_event, url: unknown, contact: unknown) => {
  if (typeof url !== 'string' || !RB_URL.test(url)) throw new Error('Blocked request: not a RepeaterBook export URL.');
  const token = await readToken();
  if (!token) return { status: 401, body: JSON.stringify({ error: 'auth_missing' }) };
  const contactText = typeof contact === 'string' ? contact.replace(/[^\w@.+ -]/g, '').slice(0, 120) : '';
  const userAgent = `IC980PM/${app.getVersion()} (+${PROJECT_URL}${contactText ? `; ${contactText}` : ''})`;
  const res = await net.fetch(url, {
    headers: { 'X-RB-App-Token': token, 'User-Agent': userAgent, Accept: 'application/json' }
  });
  return { status: res.status, body: await res.text() };
});

ipcMain.handle('backup:save', async (_event, fileName: unknown, contents: unknown) => {
  if (typeof fileName !== 'string' || typeof contents !== 'string') throw new Error('Invalid backup.');
  const safeName = path.basename(fileName).replace(/[^\w.-]/g, '_');
  await fs.mkdir(backupsDir(), { recursive: true });
  const full = path.join(backupsDir(), safeName);
  await fs.writeFile(full, contents, 'utf8');
  return full;
});

ipcMain.handle('backup:open-folder', async () => {
  await fs.mkdir(backupsDir(), { recursive: true });
  await shell.openPath(backupsDir());
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
