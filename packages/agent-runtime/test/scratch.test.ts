/**
 * Every temporary root a test makes comes from `scratch`, which takes it away with whatever runs in it (`scratch.ts`):
 * a call of `os.tmpdir` anywhere else under `test/`, or in a test beside the code under `src/`, is refused. `test/scratch.ts` here is
 * the one copy, and each other package's is held to it by that package's own `scratch.test.ts`. A test of where the code under test
 * runs a process names the temp directory with `machineTempDir()`, which the scan refuses only on a line that makes a root with
 * `mkdtempSync`. A Claude Code runner a test
 * makes is given its `root`, which it writes to as it looks (`harness/claude/quiet.ts`): a call with none is refused, since
 * the default is the person's own store.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const TEST = import.meta.dirname;
const SRC = path.join(TEST, '..', 'src');
/** The files under `test/` that may make a root by hand: the helper, and the fixture that shows the guard a leak. */
const ALLOWED = ['scratch.ts', 'fixtures/leak-unguarded.ts'];

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

/** The tests beside the code: every `*.test.ts` under `src/`, by its path from `test/`. */
const besideTheCode = () =>
  fs
    .readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.test.ts'))
    .map((f) => path.join('..', 'src', f));

test('no test makes a root but through scratch', () => {
  const files = [
    ...fs
      .readdirSync(TEST, { recursive: true, encoding: 'utf8' })
      .filter((f) => /\.(ts|tsx)$/.test(f) && !f.split(path.sep).includes('node_modules')),
    ...besideTheCode(),
  ];
  assert.ok(files.length > 1, 'the scan reads the tests');
  const refused = files
    .filter((f) => !ALLOWED.includes(f.split(path.sep).join('/')))
    .flatMap((f) => tmpdirCalls(fs.readFileSync(path.join(TEST, f), 'utf8')).map((l) => `${f}:${l}`));
  assert.deepEqual(refused, [], 'make the root with scratch(prefix) from test/scratch.ts, which takes it away with what runs in it');
});

/** The makers of a Claude Code runner, whose `root` defaults to the person's own store. */
const RUNNERS = /\b(?:claudeOps|claudeCodeOps|Runner\.claude)\s*\(/g;

/** Each call in `text` of a maker in `RUNNERS` whose arguments do not name `root`, by its line; a comment line is passed over. */
const rootlessRunners = (text: string) =>
  [...text.matchAll(RUNNERS)].flatMap((m) => {
    const start = (m.index ?? 0) + m[0].length;
    let depth = 1;
    let end = start;
    while (end < text.length && depth > 0) {
      depth += text[end] === '(' ? 1 : text[end] === ')' ? -1 : 0;
      end++;
    }
    const line = text.slice(0, m.index).split('\n').length;
    const shown = text.split('\n')[line - 1].trim();
    if (/^(?:\*|\/\/|\/\*)/.test(shown) || /\broot\b/.test(text.slice(start, end))) return [];
    return [`${line}: ${shown}`];
  });

test('REFUSED: a Claude Code runner made with no root is found, whichever maker and however its arguments are laid out', () => {
  const maker = 'claude' + 'Ops';
  const codeMaker = 'claudeCode' + 'Ops';
  const runnerMaker = 'Runner.' + 'claude';
  assert.deepEqual(rootlessRunners(`const a = 1;\nconst ops = ${maker}({ now: () => t });\n`), [
    `2: const ops = ${maker}({ now: () => t });`,
  ]);
  assert.equal(rootlessRunners(`${maker}().spawn(r)`).length, 1, 'no arguments at all');
  assert.equal(rootlessRunners(`${codeMaker}({\n  now,\n})`).length, 1);
  assert.equal(rootlessRunners(`${runnerMaker}()`).length, 1);
  assert.deepEqual(rootlessRunners(`${maker}({\n  root,\n  now: () => f(t),\n})`), [], 'a root given on another line');
  assert.deepEqual(rootlessRunners(`${maker}({ ...opsOptions(root), now })`), [], 'a root given through a helper');
  assert.deepEqual(rootlessRunners(` * The argv \`${maker}().spawn\` hands over`), [], 'a comment is passed over');
});

test('no test makes a Claude Code runner over the default store', () => {
  const files = [
    ...fs.readdirSync(TEST, { recursive: true, encoding: 'utf8' }).filter((f) => /\.(ts|tsx)$/.test(f) && f !== 'scratch.test.ts'),
    ...besideTheCode(),
  ];
  const refused = files.flatMap((f) => rootlessRunners(fs.readFileSync(path.join(TEST, f), 'utf8')).map((l) => `${f}:${l}`));
  assert.deepEqual(refused, [], "give the runner a root from scratch(prefix): with none it writes into the person's own ~/.agent-engine");
});
