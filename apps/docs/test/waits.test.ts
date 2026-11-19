/**
 * The wait a test makes on its event (`until`, `bell`, `test/waits.ts`), a copy of the runtime's `src/waits/waits.ts`, since this
 * package imports none, the default timeout the package's Vitest config gives a test that waits, and the guard that keeps a
 * hand-written bound out of a child this package's tests start (`boundsIn`). The helper's own tests are the runtime's, and so is the
 * fence that holds this copy to it byte for byte (`packages/agent-runtime/test/waits.test.ts`): a test here builds no path into a
 * package's `src` (`contract.test.ts` there).
 *
 * A bound handed to a spawn is a ceiling on a machine, and a time measured on a machine is a floor: the dev child of
 * `build.test.ts` was killed at 100 s inside the runner's 120 s. So no spawn in `test/` takes one, and the runner's
 * `testTimeout` is the one bound every wait here ends at.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { WAITED } from './waits.ts';

const PACKAGE = path.join(import.meta.dirname, '..');

/** The default timeout a package's `vitest.config.ts` gives every test (`testTimeout: <ms>`), or null for none. */
const defaultTimeout = (config: string): number | null => {
  const m = /^\s*testTimeout:\s*([1-9][\d_]*),/m.exec(config);
  return m ? Number(m[1].replaceAll('_', '')) : null;
};

/**
 * What leaves a wait unbounded in a test given no `WAITED`, as one that waits through a helper may be: a Vitest config whose default
 * timeout is not `WAITED`'s, since Vitest's is 5 s.
 *
 * @param config the text of the package's `vitest.config.ts`
 * @returns one line per break, empty when every test is bounded at `WAITED`'s timeout
 */
const timeoutBreaks = (config: string): string[] =>
  defaultTimeout(config) === WAITED.timeout
    ? []
    : [`the Vitest config gives no testTimeout: ${WAITED.timeout}, so a test given no \`WAITED\` that waits is never bounded: add it`];

test("the package's Vitest config bounds every test at `WAITED`'s timeout, so a wait in a test given none still ends", () => {
  assert.deepEqual(timeoutBreaks(fs.readFileSync(path.join(PACKAGE, 'vitest.config.ts'), 'utf8')), []);
});

test("REFUSED: a Vitest config with no default timeout, or another than `WAITED`'s, leaves a test's wait unbounded", () => {
  const refused = [
    `the Vitest config gives no testTimeout: ${WAITED.timeout}, so a test given no \`WAITED\` that waits is never bounded: add it`,
  ];
  assert.deepEqual(timeoutBreaks('export default { test: { maxWorkers: 2 } };'), refused, 'none');
  assert.deepEqual(timeoutBreaks('test: {\n    testTimeout: 600_000,\n  }'), refused, 'a longer one');
  assert.deepEqual(timeoutBreaks(`test: {\n    testTimeout: ${WAITED.timeout},\n  }`), [], 'its own');
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
 * child. A bound a test picks is a ceiling on a machine; the runner's `testTimeout` is the one bound a test takes.
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

test('no test under test/ bounds a spawn by hand: the runner’s testTimeout is the one bound', () => {
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
