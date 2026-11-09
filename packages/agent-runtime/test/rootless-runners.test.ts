/**
 * A Claude Code runner a test makes, and an engine, are each given their `root`, which they write to as they look
 * (`harness/claude/quiet.ts`, `service/engine.ts`): a call with none is refused. `root` is required on both today, so the typecheck
 * refuses one too — this rule is what names the call and the line, and what catches a rootless literal written inline and cast past
 * the typecheck (`rootlessRunners`, whose one escape says what it does not reach). The root itself comes from `scratch`
 * (`test-kit/scratch`), as every test's does.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const TEST = import.meta.dirname;
const SRC = path.join(TEST, '..', 'src');

/** The tests beside the code: every `*.test.ts` under `src/`, by its path from `test/`. */
const besideTheCode = () =>
  fs
    .readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.test.ts'))
    .map((f) => path.join('..', 'src', f));

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
    ...fs.readdirSync(TEST, { recursive: true, encoding: 'utf8' }).filter((f) => /\.(ts|tsx)$/.test(f) && f !== 'rootless-runners.test.ts'),
    ...besideTheCode(),
  ];
  const refused = files.flatMap((f) => rootlessRunners(fs.readFileSync(path.join(TEST, f), 'utf8')).map((l) => `${f}:${l}`));
  assert.deepEqual(
    refused,
    [],
    "give the runner or the engine a root from scratch(prefix): with none it writes into the person's own ~/.agent-engine",
  );
});
