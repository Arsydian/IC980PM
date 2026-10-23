// Bundles the Electron main process and preload script to CommonJS in dist-electron/.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';

export async function buildElectron({ dev = false } = {}) {
  const common = {
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['electron'],
    sourcemap: dev,
    minify: !dev,
    logLevel: 'warning'
  };
  await build({ ...common, entryPoints: ['electron/main.ts'], outfile: 'dist-electron/main.cjs' });
  await build({ ...common, entryPoints: ['electron/preload.ts'], outfile: 'dist-electron/preload.cjs' });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildElectron();
}
