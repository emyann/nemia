import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const probe = path.join(import.meta.dirname, '..', '..', '..', '..', '..', 'tools', 'test-costs', 'probe.ts');

test('spawns a process that loads the probe and is no test file', () => {
  const child = spawnSync(process.execPath, [`--import=${probe}`, 'child.ts'], { cwd: import.meta.dirname, encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
});
