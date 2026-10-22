/**
 * The steered clock (`test/steered.ts`) wakes a rest only once it was asked, and no file that runs is given Effect's testing entry.
 *
 * A controller's wait is on Effect's clock, which a test replaces with `steeredClock()`. The first two tests hold the order a steered
 * test follows: wait for the rest asked, then move the clock. The others refuse `effect/testing` in a file of `src`, `bin` or `place`
 * that is no test, so a clock a test steers never ships.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Fiber } from 'effect';
import { steeredClock } from './steered.ts';
import { until, WAITED } from 'agent-runtime/testing';

const PKG = path.join(import.meta.dirname, '..');
const FROM_ROOT = 'packages/agent-orchestrator';

/** A program as a controller's loop is: real work that ends when `worked` does, then a rest of five seconds. */
const restsAfter = (worked: Promise<void>) => Effect.promise(() => worked).pipe(Effect.andThen(Effect.sleep('5 seconds')));

test(
  'a rest reached after real work is steered once it is waited for: asked, not woken a millisecond early, woken at its moment',
  WAITED,
  async (t) => {
    const clock = steeredClock();
    const fiber = Effect.runFork(restsAfter(new Promise((done) => setImmediate(done))).pipe(Effect.provide(clock.layer)));
    t.after(() => Effect.runPromise(Fiber.interrupt(fiber)));
    await until(t, () => clock.asked.length === 1, 'the rest is asked', { bell: clock.bell });
    assert.deepEqual(clock.asked, [5_000]);
    await clock.adjust(4_999);
    assert.deepEqual([clock.woken, fiber.pollUnsafe() === undefined], [[], true], 'a millisecond early, nothing woke');
    await clock.adjust(1);
    await Effect.runPromise(Fiber.join(fiber));
    assert.deepEqual(clock.woken, [5_000]);
  },
);

test('REFUSED: a clock moved before the rest is asked wakes nothing, however far it is moved', WAITED, async (t) => {
  const clock = steeredClock();
  let release: () => void = () => undefined;
  const fiber = Effect.runFork(restsAfter(new Promise((done) => (release = done))).pipe(Effect.provide(clock.layer)));
  t.after(() => Effect.runPromise(Fiber.interrupt(fiber)));
  await until(
    t,
    () =>
      clock.adjust(5_000).then(
        () => true,
        () => false,
      ),
    'the program has its clock',
    { everyMs: 1 },
  );
  await clock.adjust(60_000);
  release();
  await until(t, () => clock.asked.length === 1, 'the rest is asked', { bell: clock.bell });
  await clock.adjust(4_999);
  assert.deepEqual([clock.asked, clock.woken, fiber.pollUnsafe() === undefined], [[5_000], [], true]);
});

test('REFUSED: a clock no program was given cannot be moved, and says so', async () => {
  await assert.rejects(steeredClock().adjust(1), (err: unknown) => {
    assert.ok(err instanceof Error, String(err));
    assert.ok(err.message.startsWith('steeredClock: no program was given this clock'), err.message);
    assert.ok(err.message.includes('provide its `layer` first'), err.message);
    return true;
  });
});

/** Whether `file`, a path from the repository's root, is a test's: named `*.test.ts`, or under a `test` folder. */
const isTestFile = (file: string): boolean => /\.test\.[cm]?[jt]sx?$/.test(file) || file.split('/').includes('test');

/** Whether `text`, its block comments left out, imports Effect's testing entry, by an `import`, an `export … from` or `import()`. */
const importsTesting = (text: string): boolean =>
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]effect\/testing(?:\/[^'"]*)?['"]/.test(text.replace(/\/\*[\s\S]*?\*\//g, ''));

/** Where `file`, which is no test's, imports Effect's testing entry: a file that runs reads the clock it is given. */
function steeredBreaches(file: string, text: string): string[] {
  if (isTestFile(file) || !importsTesting(text)) return [];
  return [
    `${file} imports effect/testing, which is for tests alone: a file that runs reads Effect's clock as it is given, and only a ` +
      'test file (*.test.ts, or under a test/ folder) steers it',
  ];
}

/** Every TypeScript file under `dir` of the package, as a path from the repository's root. */
const sources = (dir: string): string[] =>
  fs
    .readdirSync(path.join(PKG, dir), { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.[cm]?tsx?$/.test(f))
    .map((f) => `${FROM_ROOT}/${dir}/${f.split(path.sep).join('/')}`);

test("REFUSED: a file of `src`, `bin` or `place` that is no test and imports Effect's testing entry; a test file may", () => {
  const line = "import { TestClock } from 'effect/testing';";
  for (const file of [`${FROM_ROOT}/src/prune/free.verb.ts`, `${FROM_ROOT}/bin/nemia.ts`, `${FROM_ROOT}/place/git/git.ts`])
    assert.deepEqual(steeredBreaches(file, line), [
      `${file} imports effect/testing, which is for tests alone: a file that runs reads Effect's clock as it is given, and only a ` +
        'test file (*.test.ts, or under a test/ folder) steers it',
    ]);
  const src = `${FROM_ROOT}/src/prune/free.verb.ts`;
  assert.equal(steeredBreaches(src, "const t = await import('effect/testing');").length, 1, 'a dynamic import');
  assert.equal(steeredBreaches(src, "import * as TestClock from 'effect/testing/TestClock';").length, 1, 'a file of the entry');
  assert.equal(steeredBreaches(src, "export { TestClock } from 'effect/testing';").length, 1, 'handed on');
  for (const file of [`${FROM_ROOT}/src/telemetry/telemetry.test.ts`, `${FROM_ROOT}/test/steered.ts`])
    assert.deepEqual(steeredBreaches(file, line), [], `not refused: ${file}`);
  assert.deepEqual(steeredBreaches(src, "import { Effect } from 'effect';"), [], 'the root entry');
  assert.deepEqual(steeredBreaches(src, `/**\n * ${line}\n */`), [], 'prose');
});

test("no file of `src`, `bin` or `place` that is no test imports Effect's testing entry, and some test does", () => {
  const files = ['src', 'bin', 'place', 'test']
    .flatMap(sources)
    .map((f) => [f, fs.readFileSync(path.join(PKG, '..', '..', f), 'utf8')] as const);
  for (const dir of ['src', 'bin', 'place'])
    assert.ok(
      files.some(([f]) => f.startsWith(`${FROM_ROOT}/${dir}/`) && !isTestFile(f)),
      `the scan reads ${dir}`,
    );
  assert.ok(
    files.some(([f, text]) => isTestFile(f) && importsTesting(text)),
    'a test steers the clock, so the scan reads the specifier',
  );
  assert.deepEqual(
    files.flatMap(([f, text]) => steeredBreaches(f, text)),
    [],
  );
});
