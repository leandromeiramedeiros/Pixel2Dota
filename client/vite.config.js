import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const shared = path.resolve(here, '../shared');
const root = path.resolve(here, '..');

// Multi-page: index.html (NET agent) + sandbox.html (render sandbox). index.html is only an input once it exists.
const input = {};
for (const [name, file] of [['main', 'index.html'], ['sandbox', 'sandbox.html']]) {
  const p = path.resolve(here, file);
  if (existsSync(p)) input[name] = p;
}

export default defineConfig({
  root: here,
  resolve: { alias: { '@shared': shared } },
  server: { host: true, port: 5173, fs: { allow: [root] }, hmr: { overlay: false } },
  build: { target: 'es2022', rollupOptions: { input } },
  optimizeDeps: { include: ['three'] },
});
