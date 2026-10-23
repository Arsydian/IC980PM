import { readFileSync } from 'node:fs';
import { defineConfig, Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Applied to production builds only; the dev server needs inline scripts for hot reload.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self' https://www.repeaterbook.com",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ');

const contentSecurityPolicy = (): Plugin => ({
  name: 'content-security-policy',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}" />`)
});

export default defineConfig({
  // Relative asset paths so the packaged app can load dist/index.html from disk.
  base: './',
  plugins: [react(), contentSecurityPolicy()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  server: {
    port: 3000
  },
  test: {
    globals: true,
    environment: 'node'
  }
});
