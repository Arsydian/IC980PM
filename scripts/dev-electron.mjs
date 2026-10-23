// Starts the Vite dev server, then launches Electron pointed at whatever port Vite picked.
import { spawn } from 'node:child_process';
import electronPath from 'electron';
import { createServer } from 'vite';
import { buildElectron } from './build-electron.mjs';

const server = await createServer();
await server.listen();
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error('Vite did not report a local URL.');

await buildElectron({ dev: true });

const child = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url }
});
child.on('close', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
