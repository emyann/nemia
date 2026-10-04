/** The orchestrator's `VERSION`, held to the version its package.json says. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { VERSION } from './version.ts';

test('VERSION is the version package.json says', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: unknown };
  assert.equal(VERSION, pkg.version, 'bump VERSION in src/version/version.ts with package.json');
});
