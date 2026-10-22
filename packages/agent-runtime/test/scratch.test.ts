/**
 * Every temporary root a test makes comes from `scratch`, which takes it away with whatever runs in it (`scratch.ts`):
 * a call of `os.tmpdir` anywhere else under `test/`, or in a test beside the code under `src/`, is refused. `test/scratch.ts` here is
 * the one copy, and each other package's is held to it by that package's own `scratch.test.ts`. A test of where the code under test
 * runs a process names the temp directory with `machineTempDir()`, which the scan refuses only on a line that makes a root with
 * `mkdtempSync`. A Claude Code runner a test makes, and an engine, are each given their `root`, which they write to as they look
 * (`harness/claude/quiet.ts`, `service/engine.ts`): a call with none is refused. `root` is required on both today, so the typecheck
 * refuses one too — this rule is what names the call and the line, and what catches a rootless literal written inline and cast past
 * the typecheck (`rootlessRunners`, whose one escape says what it does not reach).
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

/**
 * The makers of a Claude Code runner, and of an engine: each writes under its `root`, and each must be given one. `Engine.layer` is
 * among them because the engine builds its runners under the root it is given, and it was the maker the rule missed when a test wrote
 * `~/.agent-engine/parent/ae_t_1.json` on the person's own machine.
 */
const RUNNERS = /\b(?:claudeOps|claudeCodeOps|Runner\.claude|Engine\.layer)\s*\(/g;

/**
 * Each call in `text` of a maker in `RUNNERS` whose arguments do not name `root`, by its line; a comment line is passed over, and so
 * is a call handed one bare name (`Engine.layer(options)`, `claudeOps(...opts)`), which the rule trusts to the typecheck: the
 * required `root` on the options type refuses that one at compile time, and this rule cannot read where the name was bound.
 *
 * So the one shape neither reaches is a rootless literal bound and cast on another line, then handed over by name. Six call sites in
 * this package hand a root-carrying variable by name, which is why the escape is here rather than the sites being rewritten; the
 * package has no rootless cast left — `test/verb-refusals.test.ts`'s was the one, and it names a root now, with no cast at all: a
 * `maxConcurrent: 0` is a legal number the engine refuses when it builds, which is what that test is about.
 */
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
    const args = text.slice(start, end);
    const given = /^\s*\)/.test(args) ? false : /^\s*(?:\.\.\.)?[A-Za-z_$][\w$]*\s*\)?\s*$/.test(args);
    if (/^(?:\*|\/\/|\/\*)/.test(shown) || /\broot\b/.test(args) || given) return [];
    return [`${line}: ${shown}`];
  });

test('REFUSED: a Claude Code runner or an engine made with no root is found, whichever maker and however its arguments are laid out', () => {
  const maker = 'claude' + 'Ops';
  const codeMaker = 'claudeCode' + 'Ops';
  const runnerMaker = 'Runner.' + 'claude';
  const engineMaker = 'Engine.' + 'layer';
  assert.deepEqual(rootlessRunners(`const a = 1;\nconst ops = ${maker}({ now: () => t });\n`), [
    `2: const ops = ${maker}({ now: () => t });`,
  ]);
  assert.equal(rootlessRunners(`${maker}().spawn(r)`).length, 1, 'no arguments at all');
  assert.equal(rootlessRunners(`${codeMaker}({\n  now,\n})`).length, 1);
  assert.equal(rootlessRunners(`${runnerMaker}()`).length, 1);
  assert.deepEqual(rootlessRunners(`${maker}({\n  root,\n  now: () => f(t),\n})`), [], 'a root given on another line');
  assert.deepEqual(rootlessRunners(`${maker}({ ...opsOptions(root), now })`), [], 'a root given through a helper');
  assert.deepEqual(rootlessRunners(` * The argv \`${maker}().spawn\` hands over`), [], 'a comment is passed over');
  assert.equal(rootlessRunners(`${engineMaker}()`).length, 1, 'an engine with no options at all');
  assert.deepEqual(
    rootlessRunners(`const e = ${engineMaker}({ journal: memoryJournal() });\n`),
    [`1: const e = ${engineMaker}({ journal: memoryJournal() });`],
    'a journal is no root: the engine builds its runners under the root',
  );
  assert.equal(rootlessRunners(`${engineMaker}({\n  harnesses,\n})`).length, 1, 'laid over several lines');
  assert.deepEqual(rootlessRunners(`${engineMaker}({ ...optionsFor(root) })`), [], 'a root given through a helper');
  assert.deepEqual(
    rootlessRunners(`${engineMaker}(options)`),
    [],
    'one bare name, trusted to the typecheck: the required root refuses it there, and this rule cannot read where it was bound',
  );
  assert.deepEqual(rootlessRunners(`${engineMaker}(...given)`), [], 'and one spread bare');
  assert.deepEqual(
    rootlessRunners(`const e = ${engineMaker}({ journal } as never);\n`),
    [`1: const e = ${engineMaker}({ journal } as never);`],
    'a literal cast past the typecheck is exactly what the rule is for',
  );
});

test('no test makes a Claude Code runner or an engine over the default store', () => {
  const files = [
    ...fs.readdirSync(TEST, { recursive: true, encoding: 'utf8' }).filter((f) => /\.(ts|tsx)$/.test(f) && f !== 'scratch.test.ts'),
    ...besideTheCode(),
  ];
  const refused = files.flatMap((f) => rootlessRunners(fs.readFileSync(path.join(TEST, f), 'utf8')).map((l) => `${f}:${l}`));
  assert.deepEqual(
    refused,
    [],
    "give the runner or the engine a root from scratch(prefix): with none it writes into the person's own ~/.agent-engine",
  );
});
