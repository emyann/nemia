/**
 * The deliverer over the feed on disk and an engine of the test's, whose `say` records what each task is told and fails where a test says:
 * a wake line said once, with the digest riding it; a digest said alone once due, and never before; a restart that neither repeats nor
 * drops a line; the cursor held while `say` fails; an unsubscribe that stops delivery; a name subscribed again that starts from its own
 * `from`; a feed cut under the cursor read again from its start; and a subscription scoped by a floor told only of the runs of factories
 * at it or above. Each test
 * runs a deliverer of its own and waits for what it counts. A store of its own, since `WF_ROOT` is read as the module loads.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Duration, Effect, Fiber, Metric, Schedule } from 'effect';
import { scratch } from '../../test/scratch.ts';
import { board } from '../../test/engine-board.ts';
import { bell, until, WAITED } from '../../test/waits.ts';

const ROOT = scratch('wf-deliver-');
process.env.WF_ROOT = ROOT;
const { SUBSCRIPTION_DIGEST_CHECKS, deliver, sayBackoff } = await import('./deliver.verb.ts');
const { deliveryFile, dropSubscription, putSubscription, readDelivery, writeDelivery } = await import('./subscription.store.ts');
const { DEFAULT_WAKE } = await import('./subscription.ts');
const { feedFile, feedSize } = await import('../feed/feed.store.ts');
const { engineOf, over } = await import('../runtime-client.ts');
const { addFactory } = await import('../factory/factory.store.ts');
const { writeFactoryLevel } = await import('../level/level.store.ts');

/** What each task was told, in order; how many times each was asked; and the tasks whose `say` fails for now. */
const told = new Map<string, string[]>();
const asked = new Map<string, number>();
const failing = new Set<string>();
/** Rung as a task is told. */
const toldBell = bell();

const e = {
  ...engineOf(board().layer),
  say: (task: string, text: string) =>
    Effect.suspend(() => {
      asked.set(task, (asked.get(task) ?? 0) + 1);
      if (failing.has(task)) return Effect.fail({ _tag: 'SayUnsent', message: 'its session is not listed' } as never);
      told.set(task, [...(told.get(task) ?? []), text]);
      toldBell.ring();
      return Effect.succeed({ at: new Date().toISOString(), text } as never);
    }),
};

/** A deliverer at a pace a test waits on, running until the answer is called, or else until test `t` ends, whatever its verdict. */
const running = (t: TestContext): (() => Promise<void>) => {
  const fiber = Effect.runFork(
    over(e)(deliver({ every: '10 millis', beat: '10 millis', digestCheck: '10 millis', retry: '5 millis', retryCap: '20 millis' })),
  );
  const stop = () => Effect.runPromise(Fiber.interrupt(fiber)).then(() => undefined);
  t.after(stop);
  return stop;
};

/** Waits in test `t` until `holds` does: asked as a task is told, and every 10ms for what the deliverer writes or counts. */
const held = (t: TestContext, holds: () => boolean, what: string) => until(t, holds, what, { bell: toldBell, everyMs: 10 });

/** A line of the feed about `run`, at its `build` step. */
const line = (run: string, word: string) => ({ at: new Date().toISOString(), run, step: 'build', word });

/** `lines` written at the end of the feed, as the tick writes them. */
const appended = (...lines: object[]): void => fs.appendFileSync(feedFile(), lines.map((l) => `${JSON.stringify(l)}\n`).join(''));

/** A subscription of `task`'s, by the default wake words, from the feed's end, which it answers. */
const subscribed = (name: string, task: string): number => {
  const from = feedSize();
  putSubscription(name, { task, wake: [...DEFAULT_WAKE], digestEvery: 60, from });
  return from;
};

/** The digest checks the deliverers have done. */
const digestChecks = (): number => Effect.runSync(Metric.value(SUBSCRIPTION_DIGEST_CHECKS)).count;

const toldTo = (task: string): string[] => told.get(task) ?? [];

test(
  'a wake line is said once, the routine lines before it riding it as one digest, and the cursor kept once it is said',
  WAITED,
  async (t) => {
    subscribed('once', 't-once');
    const stop = running(t);
    appended(line('r-1', 'running'), line('r-1', 'verified ✓'), line('r-1', 'awaiting approval'));
    await held(t, () => toldTo('t-once').length === 1, 'the wake said');
    const [first] = toldTo('t-once');
    assert.match(
      first,
      /^The feed needs your judgement:\n {2}\S+ {2}r-1 {2}build {2}awaiting approval\n\nSince your last news:\n2 routine lines/,
    );
    assert.match(first, /r-1 {2}build {2}running\n.*r-1 {2}build {2}verified ✓$/);
    appended(line('r-2', 'rounds exhausted'));
    await held(t, () => toldTo('t-once').length === 2, 'the next wake said');
    assert.doesNotMatch(toldTo('t-once')[1], /r-1|Since your last news/, 'neither the first wake nor its digest again');
    await held(t, () => readDelivery('once')?.cursor === feedSize(), 'the cursor at the end of the feed');
    assert.deepEqual(readDelivery('once')?.digest, []);
    await stop();
    dropSubscription('once');
  },
);

test('a digest falls due after its minutes with no wake: said alone, then emptied', WAITED, async (t) => {
  const from = subscribed('quiet', 't-quiet');
  const folded = line('r-3', 'verified ✓');
  writeDelivery('quiet', { of: { task: 't-quiet', from }, cursor: from, digest: [folded], since: { at: Date.now() - 61 * 60_000 } });
  const stop = running(t);
  await held(t, () => toldTo('t-quiet').length === 1, 'the digest said');
  assert.match(
    toldTo('t-quiet')[0],
    /^News from the feed, nothing waiting on you:\n1 routine line of the feed:\n {2}\S+ {2}r-3 {2}build {2}verified ✓$/,
  );
  await held(t, () => readDelivery('quiet')?.digest.length === 0, 'the digest emptied');
  await stop();
  dropSubscription('quiet');
});

test('a digest not yet due is not said: its routine lines wait for their minutes, or ride the next wake', WAITED, async (t) => {
  subscribed('patient', 't-patient');
  const stop = running(t);
  appended(line('r-11', 'running'), line('r-11', 'verified ✓'));
  await held(t, () => readDelivery('patient')?.digest.length === 2, 'both routine lines folded');
  const checks = digestChecks();
  await held(t, () => digestChecks() >= checks + 2, 'a whole digest check begun after they were folded');
  assert.deepEqual(toldTo('t-patient'), [], 'nothing said before the digest is due');
  appended(line('r-11', 'awaiting approval'));
  await held(t, () => toldTo('t-patient').length === 1, 'the wake said');
  assert.match(toldTo('t-patient')[0], /Since your last news:\n2 routine lines/);
  await stop();
  dropSubscription('patient');
});

test('a restart reads where the deliverer was off its file: no line said again, none dropped', WAITED, async (t) => {
  subscribed('restart', 't-restart');
  let stop = running(t);
  appended(line('r-4', 'failed ✗ check (exit 1)'));
  await held(t, () => toldTo('t-restart').length === 1, 'the first wake said');
  appended(line('r-4', 'running'));
  await held(t, () => readDelivery('restart')?.digest.length === 1, 'the routine line folded');
  await stop();
  appended(line('r-5', 'awaiting approval'));
  stop = running(t);
  await held(t, () => toldTo('t-restart').length === 2, 'the wake written while it was down said');
  const [, second] = toldTo('t-restart');
  assert.match(second, /r-5 {2}build {2}awaiting approval/);
  assert.match(second, /Since your last news:\n1 routine line of the feed:\n {2}\S+ {2}r-4 {2}build {2}running$/, 'the folded line kept');
  assert.doesNotMatch(second, /failed/, 'the first wake not said again');
  await stop();
  dropSubscription('restart');
});

test('the cursor stays while say fails, said again after a backoff until it is taken', WAITED, async (t) => {
  subscribed('held', 't-held');
  failing.add('t-held');
  const stop = running(t);
  appended(line('r-6', 'running'));
  await held(t, () => readDelivery('held')?.digest.length === 1, 'the routine line folded');
  const before = readDelivery('held')!;
  appended(line('r-6', 'blocked'));
  await held(t, () => (asked.get('t-held') ?? 0) >= 3, 'say asked three times');
  assert.deepEqual(readDelivery('held'), before, 'neither the cursor nor the digest moved while say fails');
  failing.delete('t-held');
  await held(t, () => toldTo('t-held').length === 1, 'said once say takes it');
  await held(t, () => readDelivery('held')?.cursor === feedSize(), 'the cursor kept after it');
  assert.equal(toldTo('t-held').length, 1);
  await stop();
  dropSubscription('held');
});

test('a failed say is said again after a backoff that doubles from retry and never waits longer than retryCap', () => {
  const delays = Effect.runSync(
    Effect.gen(function* () {
      const step = yield* Schedule.toStep(sayBackoff({ retry: '1 second', retryCap: '5 minutes' }));
      const waits: number[] = [];
      let now = 0;
      for (let k = 0; k < 12; k++) {
        const [, delay] = yield* step(now, undefined);
        waits.push(Duration.toMillis(delay));
        now += Duration.toMillis(delay);
      }
      return waits;
    }),
  );
  assert.deepEqual(delays, [1000, 2000, 4000, 8000, 16_000, 32_000, 64_000, 128_000, 256_000, 300_000, 300_000, 300_000]);
});

test('an unsubscribe stops delivery, and the deliverer drops its file', WAITED, async (t) => {
  subscribed('leaving', 't-leaving');
  subscribed('staying', 't-staying');
  const stop = running(t);
  appended(line('r-7', 'awaiting approval'));
  await held(t, () => toldTo('t-leaving').length === 1 && toldTo('t-staying').length === 1, 'both told');
  dropSubscription('leaving');
  writeDelivery('leaving', { of: { task: 't-leaving', from: 0 }, cursor: 0, digest: [] });
  await held(
    t,
    () => !fs.existsSync(deliveryFile('leaving')),
    'the deliverer drops a file whose subscription is gone, once it has stopped it',
  );
  appended(line('r-8', 'awaiting approval'));
  await held(t, () => toldTo('t-staying').length === 2, 'the one staying told');
  assert.equal(toldTo('t-leaving').length, 1, 'the one gone told nothing more');
  await stop();
  dropSubscription('staying');
});

test(
  "a name subscribed again starts from its own from: a deliverer's file written for the last one under it is not its",
  WAITED,
  async (t) => {
    appended(line('r-12', 'awaiting approval'));
    const from = subscribed('again', 't-again');
    writeDelivery('again', { of: { task: 't-again', from: 0 }, cursor: 0, digest: [line('r-12', 'running')] });
    const stop = running(t);
    appended(line('r-13', 'blocked'));
    await held(t, () => toldTo('t-again').length === 1, 'the wake after its from said');
    const [said] = toldTo('t-again');
    assert.match(said, /r-13 {2}build {2}blocked/);
    assert.doesNotMatch(said, /r-12|Since your last news/, "neither a line before its from nor the last one's digest");
    await held(t, () => readDelivery('again')?.of.from === from, 'its own file written');
    await stop();
    dropSubscription('again');
  },
);

test('a feed cut under the cursor is read again from its start', WAITED, async (t) => {
  subscribed('cut', 't-cut');
  const stop = running(t);
  appended(line('r-9', 'awaiting approval'));
  await held(t, () => toldTo('t-cut').length === 1, 'the wake said');
  fs.writeFileSync(feedFile(), `${JSON.stringify(line('r-10', 'blocked'))}\n`);
  await held(t, () => toldTo('t-cut').length === 2, 'the cut feed read again from its start');
  assert.match(toldTo('t-cut')[1], /r-10 {2}build {2}blocked/);
  await held(t, () => readDelivery('cut')?.cursor === feedSize(), 'the cursor at the end of the new feed');
  await stop();
  dropSubscription('cut');
});

/** Writes the run `id`'s record, started in the factory `factory`. */
function writeRun(id: string, factory: string) {
  fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
  const record = {
    id,
    workspace: ROOT,
    brief: `The brief of ${id}`,
    createdAt: '2026-10-06T08:00:00.000Z',
    workflowDir: path.join(ROOT, 'no-such-workflow'),
    place: { kind: 'folder' },
    workflow: [{ name: 'build', after: [], body: 'Build it.', harness: 'codex' }],
    steps: {},
    factory,
  };
  fs.writeFileSync(path.join(ROOT, 'runs', `${id}.json`), JSON.stringify(record));
}

test(
  'REFUSED: a subscription scoped by a floor is told nothing of a run whose factory is below it; one unscoped is told of both',
  WAITED,
  async (t) => {
    for (const name of ['pipao', 'hkb']) addFactory({ name, repos: [fs.mkdtempSync(path.join(ROOT, `${name}-`))] });
    writeFactoryLevel('hkb', { level: 'semi-auto', since: '2026-10-06T08:00:00.000Z' });
    writeRun('r-pipao', 'pipao');
    writeRun('r-hkb', 'hkb');
    const from = feedSize();
    putSubscription('floored', { task: 't-floored', wake: [...DEFAULT_WAKE], digestEvery: 60, from, scope: { atLeast: 'semi-auto' } });
    putSubscription('everything', { task: 't-everything', wake: [...DEFAULT_WAKE], digestEvery: 60, from });
    const stop = running(t);
    appended(line('r-pipao', 'running'), line('r-pipao', 'awaiting approval'), line('r-gone', 'awaiting approval'));
    appended(line('r-hkb', 'awaiting approval'));
    await held(t, () => toldTo('t-everything').length === 3, 'every wake said to the one unscoped');
    await held(t, () => readDelivery('floored')?.cursor === feedSize(), "the floored one's cursor past every line");
    assert.equal(toldTo('t-floored').length, 1);
    assert.match(toldTo('t-floored')[0], /^The feed needs your judgement:\n {2}\S+ {2}r-hkb {2}build {2}awaiting approval$/);
    assert.deepEqual(readDelivery('floored')?.digest, [], 'a line below the floor is not folded either');
    await stop();
    dropSubscription('floored');
    dropSubscription('everything');
  },
);
