import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import process from 'node:process';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
assert.match(version, stableVersion, 'Use a stable X.Y.Z release version');
assert.equal(lock.version, version, 'Update the lockfile version to match package.json');
assert.equal(lock.packages[''].version, version, 'Update the lockfile root package version');

const tag = `v${version}`;
if (process.argv[2] !== undefined) {
  assert.equal(process.argv[2], tag, 'Release tag must match package.json');
}
process.stdout.write(`${tag}\n`);
