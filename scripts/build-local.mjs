// Build de secours SANS Vite (esbuild seul) : dist/ identique en fonctionnement. Usage : node scripts/build-local.mjs
import { build } from 'esbuild';
import fs from 'node:fs';

fs.rmSync('dist', { recursive: true, force: true });
fs.mkdirSync('dist/assets', { recursive: true });
await build({ entryPoints: ['src/main.ts'], bundle: true, format: 'esm', target: 'es2022', outdir: 'dist/assets', minify: true, loader: { '.css': 'css' }, logLevel: 'warning' });
fs.cpSync('public', 'dist', { recursive: true });
const html = fs.readFileSync('index.html', 'utf8')
  .replace('<script type="module" src="/src/main.ts"></script>', '<link rel="stylesheet" href="./assets/main.css"><script type="module" src="./assets/main.js"></script>');
fs.writeFileSync('dist/index.html', html);
console.log('dist/ prêt');
