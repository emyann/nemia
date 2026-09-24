/**
 * Run by `leaks.test.ts` alone, under a TMPDIR of its own: a test that passes and leaves a root `scratch` cannot remove —
 * a folder in it that its owner may not write, with a file inside. The file must fail, saying what it left.
 */
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../scratch.ts';

test('a test that leaves its root holding what cannot be removed', () => {
  const locked = path.join(scratch('ae-detached-'), 'locked');
  fs.mkdirSync(locked);
  fs.writeFileSync(path.join(locked, 'kept'), '');
  fs.chmodSync(locked, 0o500);
});
