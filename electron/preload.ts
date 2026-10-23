import { contextBridge } from 'electron';

export const APP_VERSION = '1.1.0';

contextBridge.exposeInMainWorld('api', {
  appVersion: APP_VERSION,
  platform: process.platform
});
