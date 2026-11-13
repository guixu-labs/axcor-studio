import assert from 'node:assert/strict';
import console from 'node:console';
import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import asar from '@electron/asar';

const output = path.join('out', `axcor-studio-${process.platform}-${process.arch}`);
const resources = process.platform === 'darwin' ? '*.app/Contents/Resources' : 'resources';
const archives = globSync(`${resources}/app.asar`, { cwd: output });
assert.equal(archives.length, 1, `Expected one app.asar in ${output}`);

const archive = path.join(output, archives[0]);
const license = path.join(path.dirname(archive), 'LICENSE');
assert.equal(readFileSync(license, 'utf8'), readFileSync('LICENSE', 'utf8'));

for (const entry of ['.vite/build/main.js', '.vite/build/preload.js']) {
  assert.ok(asar.extractFile(archive, path.normalize(entry)).length, `Empty entry: ${entry}`);
}

const renderer = '.vite/renderer/main_window';
const html = asar.extractFile(archive, path.join(renderer, 'index.html')).toString('utf8');
const assets = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map(match => match[1]);
assert.ok(assets.some(asset => asset.endsWith('.js')), 'Renderer JavaScript is missing from index.html');
for (const asset of assets) {
  assert.ok(asar.extractFile(archive, path.join(renderer, asset)).length, `Empty asset: ${asset}`);
}
console.log(`Verified main, preload and renderer in ${archive}`);
