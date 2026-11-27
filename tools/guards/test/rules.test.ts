/**
 * `npm run rules` (`tools/guards/rules.ts`) runs the tests that read a whole folder for a rule a new file can break, which `vitest
 * related` never picks since they import none of the files a change adds. Each rule that broke a round's `ci` after `npm run touched`
 * passed is named here by its package and file, so taking it off the list is refused; and every file the list names is there.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from 'test-kit/repo';
import { RULES } from '../rules.ts';

/** The rules that broke a round's `ci` after its own tests passed, each by its package's folder and its file from there. */
const KEPT: readonly (readonly [string, string])[] = [
  ['apps/web', 'test/look.test.ts'],
  ['apps/web', 'test/one-action.test.ts'],
  ['apps/web', 'test/stories.test.ts'],
  ['apps/web', 'test/type.test.ts'],
  ['apps/web', 'test/dead-exports.test.ts'],
  ['apps/web', 'test/structure.test.ts'],
  ['apps/web', 'test/runs-type.test.ts'],
  ['tools/design-system', 'test/stories.test.ts'],
];

test('the rules name each folder-wide rule that broke a round after its own tests passed', () => {
  const named = new Set(RULES.flatMap((group) => group.files.map((file) => `${group.dir}/${file}`)));
  assert.deepEqual(
    KEPT.map(([dir, file]) => `${dir}/${file}`).filter((file) => !named.has(file)),
    [],
  );
});

test('every file the rules name is there, and no package is named twice', () => {
  const files = RULES.flatMap((group) => group.files.map((file) => path.join(group.dir, file)));
  assert.deepEqual(
    files.filter((file) => !fs.existsSync(path.join(REPO, file))),
    [],
  );
  const dirs = RULES.map((group) => group.dir);
  assert.equal(new Set(dirs).size, dirs.length);
  assert.equal(new Set(files).size, files.length);
});
