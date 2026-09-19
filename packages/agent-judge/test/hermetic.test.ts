/** No test needs a key or the network: every test file imports `hermetic.ts` first, and here is the proof that it seals. */
import { reached, unsealed } from './hermetic.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('every test file imports the hermetic harness first', () => {
  const dir = import.meta.dirname;
  const tests = fs.readdirSync(dir).filter((f) => f.endsWith('.test.ts'));
  assert.ok(tests.includes('hermetic.test.ts') && tests.length > 3);
  assert.deepEqual(tests.map((f) => [f, unsealed(fs.readFileSync(path.join(dir, f), 'utf8'))]).filter(([, why]) => why !== null), []);
});

test('REFUSED: a test file whose first import is not the harness, or none, or an import() above it', () => {
  const refused = (text: string, why: RegExp) => {
    const said = unsealed(text);
    assert.ok(said !== null && why.test(said) && said.includes("Make `import './hermetic.ts'` first"), `${JSON.stringify(text)} → ${said}`);
  };
  refused("import { test } from 'node:test';\nimport './hermetic.ts';\n", /^its first import is node:test\./);
  refused("const m = await import('../src/facade.ts');\nimport './hermetic.ts';\n", /^it imports a module with import\(\)/);
  refused('const one = 1;\n', /^it imports no harness\./);
  assert.equal(unsealed("import { stub } from './hermetic.ts';\nimport { test } from 'node:test';\n"), null);
});

test('the harness took the key out of the environment, and the global fetch refuses', async () => {
  assert.equal(Object.keys(process.env).filter((k) => k.startsWith('TYPESAFE_')).length, 0);
  const before = reached.length;
  await assert.rejects(fetch('https://api.typesafe.ai/v1/systemone'), (e: Error) => /^hermetic: a test reached for the network/.test(e.message));
  assert.equal(reached.length, before + 1);
});
