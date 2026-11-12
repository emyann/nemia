/**
 * Every harness the orchestrator files a task on is one the daemon's engine has (`HARNESSES`, `src/runtime-client.ts`): a step's, each
 * of the step harnesses (`HARNESSES`, `src/harness/harness.ts`), and each harness a filing names as a literal (`e.file({ … harness: '<name>'
 * … })` in the package's source: a check's, a fix's, a script condition's). The stand-in engine takes any harness, so a filing on one
 * the engine lacks is refused only on the daemon, as every fix was while `command` was missing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { HARNESSES } from '../src/runtime-client.ts';
import { HARNESSES as STEP_HARNESSES } from '../src/harness/harness.ts';

const PACKAGE = path.resolve(import.meta.dirname, '..');

/** Each source file of the package's `src` and `place`, tests left out, by its path from the package. */
const sources = (): string[] =>
  ['src', 'place'].flatMap((dir) =>
    fs
      .readdirSync(path.join(PACKAGE, dir), { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
      .map((file) => path.join(dir, file)),
  );

/** A filing whose spec is written in place, and the literal harness it names before the spec's object closes. */
const LITERAL_FILING = /e\.file\(\{[^}]*?\bharness:\s*'([^']+)'/g;

/** Each harness named as a literal by a filing, with the file that names it. */
const literalFilings = (): { file: string; harness: string }[] =>
  sources().flatMap((file) =>
    [...fs.readFileSync(path.join(PACKAGE, file), 'utf8').matchAll(LITERAL_FILING)].map((m) => ({ file, harness: m[1] ?? '' })),
  );

test("every harness the orchestrator files on is a key of the daemon's engine's harnesses", async (t) => {
  const literals = literalFilings();
  assert.deepEqual(
    [...new Set(literals.map((f) => f.harness))].sort(),
    ['check', 'command'],
    'the scan finds the check, the fix and the script condition, so a row is never missing for want of a match',
  );
  const rows = [
    ...STEP_HARNESSES.map((harness) => ({ filer: `a step on ${harness}`, harness })),
    ...literals.map((f) => ({ filer: `${f.file}'s filing`, harness: f.harness })),
  ];
  for (const { filer, harness } of rows)
    await t.test(`${filer}: \`${harness}\``, () => {
      assert.ok(Object.hasOwn(HARNESSES, harness), `${filer} files on \`${harness}\`, which the engine has not: add it to HARNESSES`);
    });
  assert.ok(
    ['src/needs/fix.verb.ts', 'src/script/script.verb.ts', 'src/tick/file.verb.ts'].every((file) => literals.some((f) => f.file === file)),
    'the fix, the script condition and the check are each a row',
  );
});
