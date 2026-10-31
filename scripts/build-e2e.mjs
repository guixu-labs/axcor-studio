import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

mkdirSync('.vite/build', { recursive: true });
await build({ entryPoints: ['src/main.ts'], outfile: '.vite/build/main.js', bundle: true, platform: 'node', format: 'cjs', external: ['electron'], define: { MAIN_WINDOW_VITE_DEV_SERVER_URL: 'undefined', MAIN_WINDOW_VITE_NAME: '"main_window"' } });
await build({ entryPoints: ['src/preload.ts'], outfile: '.vite/build/preload.js', bundle: true, platform: 'node', format: 'cjs', external: ['electron'] });
execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'vite.renderer.config.ts', '--outDir', path.resolve('.vite/renderer/main_window')], { stdio: 'inherit' });
