/**
 * The wait a test makes on its event (`until`, `bell`, `test/waits.ts`), a copy of the runtime's held here byte for byte, the default
 * timeout the package's `test` script gives a test that waits, and the guard that keeps a hand-written bound out of a child this
 * package's tests start (`boundsIn`). The helper's own tests are the runtime's.
 *
 * A bound handed to a spawn is a ceiling on a machine, and a time measured on a machine is a floor: the dev child of
 * `build.test.ts` was killed at 100 s inside the runner's 120 s. So no spawn in `test/` takes one, and the runner's
 * `--test-timeout` is the one bound every wait here ends at.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { WAITED } from './waits.ts';

const TEST = import.meta.dirname;
const PACKAGE = path.join(TEST, '..');
/** The one copy the others are held to. */
const RUNTIME = path.join(TEST, '..', '..', '..', 'packages', 'agent-runtime', 'test', 'waits.ts');

test("the helper is the runtime's, byte for byte", () => {
  assert.equal(
    fs.readFileSync(path.join(TEST, 'waits.ts'), 'utf8'),
    fs.readFileSync(RUNTIME, 'utf8'),
    'copy packages/agent-runtime/test/waits.ts over this one: a change to it is made there and copied to every package',
  );
});

/** The default timeout a `test` script gives every test (`--test-timeout=<ms>`, one word), or null for none. */
const defaultTimeout = (script: string): number | null => {
  const word = script.split(/\s+/).find((w) => /^--test-timeout=[1-9]\d*$/.test(w));
  return word ? Number(word.slice('--test-timeout='.length)) : null;
};

/**
 * What leaves a wait unbounded in a test given no `WAITED`, as one that waits through a helper may be: a `test` script whose default
 * timeout is not `WAITED`'s, since node's is none.
 *
 * @param script the package's `test` script
 * @returns one line per break, empty when every test is bounded at `WAITED`'s timeout
 */
const timeoutBreaks = (script: string): string[] =>
  defaultTimeout(script) === WAITED.timeout
    ? []
    : [`the test script gives no --test-timeout=${WAITED.timeout}, so a test given no \`WAITED\` that waits is never bounded: add it`];

test("the package's test script bounds every test at `WAITED`'s timeout, so a wait in a test given none still ends", () => {
  const { scripts } = JSON.parse(fs.readFileSync(path.join(PACKAGE, 'package.json'), 'utf8')) as { scripts: { test: string } };
  assert.deepEqual(timeoutBreaks(scripts.test), []);
});

test("REFUSED: a test script with no default timeout, or another than `WAITED`'s, leaves a test's wait unbounded", () => {
  const refused = [
    `the test script gives no --test-timeout=${WAITED.timeout}, so a test given no \`WAITED\` that waits is never bounded: add it`,
  ];
  assert.deepEqual(timeoutBreaks('node --test --test-concurrency=2 test/*.test.ts'), refused, 'none');
  assert.deepEqual(timeoutBreaks('node --test --test-concurrency=2 --test-timeout=600000 test/*.test.ts'), refused, 'a longer one');
  assert.deepEqual(timeoutBreaks(`node --test --test-concurrency=2 --test-timeout=${WAITED.timeout} test/*.test.ts`), [], 'its own');
});

/** What starts a child, by the name a test calls: each is given its options where it is given any. */
const STARTS = new RegExp(`\\b(?:${['spawnSync', 'spawn', 'execFileSync', 'execFile', 'execSync', 'exec', 'fork'].join('|')})\\s*[(]`, 'g');

/** A bound handed to such a call, in its options; built in parts, so this file's own text says none. */
const BOUND = new RegExp(`\\b(?:${['time', 'kill'].map((w) => `${w}\\w*`).join('|')})\\s*:`);

/**
 * The call starting at `from`, to the parenthesis that closes the one it opens — or to the end of `text` where none does. Parentheses
 * inside a string of the call are counted too, which can only make the slice shorter than the call: a bound beyond such a string is
 * then missed, and none is read that is not there.
 *
 * @param text the file's text
 * @param from the index just after the call's opening parenthesis
 * @returns the call's arguments, as text
 */
const callAt = (text: string, from: number): string => {
  let depth = 1;
  for (let i = from; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return text.slice(from, i);
  }
  return text.slice(from);
};

/**
 * Each bound a spawn in `text` is handed, by the line it is on: a `timeout:` or a `killSignal:` in the options of a call that starts a
 * child. A bound a test picks is a ceiling on a machine; the runner's `--test-timeout` is the one bound a test takes.
 *
 * @param file the file's path, as a person reads it
 * @param text its text
 * @returns one line per bound found, empty where the file hands none
 */
const boundsIn = (file: string, text: string): string[] =>
  [...text.matchAll(STARTS)].flatMap((m) => {
    const call = callAt(text, m.index + m[0].length);
    if (!BOUND.test(call)) return [];
    const line = text.slice(0, m.index).split('\n').length;
    return [`${file}:${line} bounds the child it starts by hand: wait for what it says with \`until\` (test/waits.ts) instead`];
  });

/** The package's test files and the helpers beside them, by their path from the package. */
const testFiles = (): string[] => fs.globSync('test/**/*.ts', { cwd: PACKAGE }).sort();

/** Every file that hands a spawn a bound, as they are on disk. */
const measured = (): string[] => testFiles().flatMap((file) => boundsIn(file, fs.readFileSync(path.join(PACKAGE, file), 'utf8')));

test('no test under test/ bounds a spawn by hand: the runner’s --test-timeout is the one bound', () => {
  assert.ok(testFiles().includes('test/build.test.ts'), 'the scan read the package’s tests');
  assert.ok(testFiles().includes('test/dev.ts'), 'and the helpers beside them');
  assert.deepEqual(measured(), []);
});

test('REFUSED: a bound handed to a spawn by hand is found, and the options beside it are not', () => {
  const starts = ['spawn', 'Sync'].join('');
  const bound = ['time', 'out'].join('');
  const signal = ['kill', 'Signal'].join('');
  const bounded = `  const ran = ${starts}(node, args, {\n    ${bound}: 100_000,\n    ${signal}: 'SIGKILL',\n  });`;
  assert.deepEqual(boundsIn('test/build.test.ts', bounded), [
    'test/build.test.ts:1 bounds the child it starts by hand: wait for what it says with `until` (test/waits.ts) instead',
  ]);
  const plain = `  const ran = ${starts}(node, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });`;
  assert.deepEqual(boundsIn('test/build.test.ts', plain), [], 'the options a test does give are not a bound');
  const after = `const w = { ${bound}: 1 };\n${starts}(node, args);`;
  assert.deepEqual(boundsIn('test/x.ts', after), [], 'a bound outside the call is none of the call\u2019s');
});
