import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const output = 'dist/e2e';
mkdirSync(path.join(output, 'build'), { recursive: true });
await build({
  entryPoints: ['src/main.ts'],
  outfile: path.join(output, 'build/main.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
  define: { MAIN_WINDOW_VITE_DEV_SERVER_URL: 'undefined', MAIN_WINDOW_VITE_NAME: '"main_window"' },
  plugins: [
    {
      name: 'workspace-helper-source',
      setup(builder) {
        builder.onResolve({ filter: /axcor-workspace-helper\?raw$/ }, args => ({
          path: path.resolve(args.resolveDir, args.path.slice(0, -4)),
          namespace: 'workspace-helper',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'workspace-helper' }, async args => ({
          contents: await readFile(args.path),
          loader: 'text',
        }));
      },
    },
    {
      name: 'fixture-service-ports',
      setup(builder) {
        // Give parallel Electron tests isolated ports in the test bundle only.
        builder.onLoad({ filter: /[\\/]localServicePorts\.ts$/ }, () => ({
          contents: `
          const argument = prefix => process.argv.find(value => value.startsWith(prefix)).slice(prefix.length);
          export const DEFAULT_EXECUTION_BACKEND_PORT = argument('--fixture-controller-port=');
          export const DEFAULT_INSIGHT_PORT = Number(argument('--fixture-insight-port='));
        `,
        }));
      },
    },
  ],
});
await build({
  entryPoints: ['src/preload.ts'],
  outfile: path.join(output, 'build/preload.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
});
execFileSync(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'build',
    '--config',
    'vite.renderer.config.ts',
    '--outDir',
    path.resolve(output, 'renderer/main_window'),
  ],
  { stdio: 'inherit' },
);
