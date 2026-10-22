/**
 * Every temporary root a test makes comes from `scratch`, which takes it away with whatever runs in it (`scratch.ts`):
 * a call of `os.tmpdir` anywhere else under `test/`, or in a test beside the code in `src/`, is refused, and each
 * package's copy of the helper is this one. A test of where the code under test runs a process names the temp directory
 * with `machineTempDir()`, which the scan refuses only on a line that makes a root with `mkdtempSync`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const TEST = import.meta.dirname;
/** The one copy the others are held to. */
const RUNTIME = path.join(TEST, '..', '..', '..', 'packages', 'agent-runtime', 'test', 'scratch.ts');
/** The tests beside the code are held as the ones under `test/` are. */
const SRC = path.join(TEST, '..', 'src');
/** The one file that may make a root by hand: the helper. */
const ALLOWED = ['test/scratch.ts'];

/** Each line of `text` that calls the temp directory by name, or makes a root with `mkdtempSync` in `machineTempDir()`. */
const tmpdirCalls = (text: string) =>
  text
    .split('\n')
    .flatMap((line, i) => (/\btmpdir\s*\(|\bmkdtemp\w*\s*\(.*\bmachineTempDir\s*\(/.test(line) ? [`${i + 1}: ${line.trim()}`] : []));

test('REFUSED: a line that makes a root under the temp directory by hand is found', () => {
  // oxlint-disable-next-line typescript/no-unnecessary-template-expression -- built in two, so this file does not name the call it refuses
  const call = `${'tmp'}dir`;
  assert.deepEqual(tmpdirCalls(`const a = 1;\nconst dir = fs.mkdtempSync(path.join(os.${call}(), 'ae-x-'));\n`), [
    `2: const dir = fs.mkdtempSync(path.join(os.${call}(), 'ae-x-'));`,
  ]);
  assert.equal(tmpdirCalls(`import { ${call} } from 'node:os';\nconst d = ${call} ();`).length, 1);
  assert.deepEqual(tmpdirCalls("const dir = scratch('ae-x-');\n// under the machine's temp directory"), []);
  assert.equal(tmpdirCalls(`assert.equal(ran.cwd, os.${call}());`).length, 1, 'refused where it makes no root');
  assert.equal(
    tmpdirCalls(`assert.equal(ran.cwd, os.${call}()); // not a root: where the ask runs`).length,
    1,
    'refused whatever a comment beside it says',
  );
  assert.deepEqual(tmpdirCalls('assert.equal(ran.cwd, machineTempDir());'), [], 'the named directory is let through');
  const named = 'machineTempDir';
  assert.equal(tmpdirCalls(`const dir = fs.mkdtempSync(path.join(${named}(), 'ae-x-'));`).length, 1, 'but never made a root in');
});

test('no test makes a root but through scratch, under test/ or beside the code in src/', () => {
  const files = [
    ...fs
      .readdirSync(TEST, { recursive: true, encoding: 'utf8' })
      .filter((f) => /\.(ts|tsx)$/.test(f) && !f.split(path.sep).includes('node_modules'))
      .map((f) => path.join('test', f)),
    ...fs
      .readdirSync(SRC, { recursive: true, encoding: 'utf8' })
      .filter((f) => /\.test\.tsx?$/.test(f))
      .map((f) => path.join('src', f)),
  ];
  assert.ok(files.length > 1, 'the scan reads the tests');
  const refused = files
    .filter((f) => !ALLOWED.includes(f.split(path.sep).join('/')))
    .flatMap((f) => tmpdirCalls(fs.readFileSync(path.join(TEST, '..', f), 'utf8')).map((l) => `${f}:${l}`));
  assert.deepEqual(refused, [], 'make the root with scratch(prefix) from ./scratch.ts');
});

test("the helper is the runtime's, byte for byte", () => {
  assert.equal(
    fs.readFileSync(path.join(TEST, 'scratch.ts'), 'utf8'),
    fs.readFileSync(RUNTIME, 'utf8'),
    'copy packages/agent-runtime/test/scratch.ts over this one: a change to it is made there and copied to every package',
  );
});
