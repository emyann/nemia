/**
 * Every test of the repository runs on Vitest: no file of a workspace imports `node:test`, whose runner no `test` script runs any more,
 * so a test written on it would be filed by nobody, and its doubles (`t.mock`) would pass the landmines' rules unseen. A run that began
 * before the move and adds such a test fails here, and converts it.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from 'test-kit/repo';

/** Whether `text` imports `node:test`, or a module of it, by a static import or an `import()`. */
const importsNodeTest = (text: string): boolean =>
  /^\s*import\b[^;]*?\bfrom\s*['"]node:test(\/[\w-]+)?['"]/m.test(text) || /\bimport\s*\(\s*['"]node:test(\/[\w-]+)?['"]\s*\)/.test(text);

test('REFUSED: a file that imports node:test, statically, by a module of it, or by import(); a string that names it is no import', () => {
  assert.equal(importsNodeTest("import { test } from 'node:test';\n"), true);
  assert.equal(importsNodeTest('import assert from \'node:assert\';\nimport test from "node:test";\n'), true);
  assert.equal(importsNodeTest("import { spec } from 'node:test/reporters';\n"), true);
  assert.equal(importsNodeTest("const { run } = await import('node:test');\n"), true);
  assert.equal(importsNodeTest("import { test } from 'vitest';\n"), false);
  assert.equal(importsNodeTest('const probe = "test(\'x\', () => {});"; // node:test is gone\n'), false);
});

test('no file of the repository imports node:test: each test runs on Vitest', () => {
  const files = execFileSync('git', ['ls-files', '-z', '--', '*.ts', '*.tsx', '*.mts', '*.mjs', '*.js'], { cwd: REPO, encoding: 'utf8' })
    .split('\0')
    .filter((file) => file && !file.split('/').includes('node_modules') && fs.existsSync(path.join(REPO, file)));
  assert.ok(files.length > 1000, `read ${files.length} files, far fewer than the repository has`);
  const importing = files.filter((file) => importsNodeTest(fs.readFileSync(path.join(REPO, file), 'utf8')));
  assert.deepEqual(importing, [], "import test and the rest from 'vitest' instead");
});
