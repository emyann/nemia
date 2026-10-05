/**
 * The deliverer over the feed on disk and an engine of the test's, whose `say` records what each task is told and fails where a test says:
 * a wake line said once, with the digest riding it; a digest said alone once due; a restart that neither repeats nor drops a line; the
 * cursor held while `say` fails; an unsubscribe that stops delivery; and a feed cut under the cursor read again from its start. Each test
 * runs a deliverer of its own and waits for what it counts. A store of its own, since `WF_ROOT` is read as the module loads.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { Effect, Fiber } from 'effect';
import { scratch } from '../../test/scratch.ts';
import { board } from '../../test/engine-board.ts';

process.env.WF_ROOT = scratch('wf-deliver-');
const { deliver } = await import('./deliver.verb.ts');
const { deliveryFile, dropSubscription, putSubscription, readDelivery, writeDelivery } = await import('./subscription.store.ts');
const { DEFAULT_WAKE } = await import('./subscription.ts');
const { feedFile, feedSize } = await import('../feed/feed.store.ts');
const { engineOf, over } = await import('../runtime-client.ts');

/** What each task was told, in order; how many times each was asked; and the tasks whose `say` fails for now. */
const told = new Map<string, string[]>();
const asked = new Map<string, number>();
const failing = new Set<string>();

const e = {
  ...engineOf(board().layer),
  say: (task: string, text: string) =>
    Effect.suspend(() => {
      asked.set(task, (asked.get(task) ?? 0) + 1);
      if (failing.has(task)) return Effect.fail({ _tag: 'SayUnsent', message: 'its session is not listed' } as never);
      told.set(task, [...(told.get(task) ?? []), text]);
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

/** Waits until `holds` does, saying `what` if it never does. */
async function until(holds: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 3000; i++) {
    if (holds()) return;
    await sleep(10);
  }
  assert.fail(`never: ${what}`);
}

/** A line of the feed about `run`, at its `build` step. */
const line = (run: string, word: string) => ({ at: new Date().toISOString(), run, step: 'build', word });

/** `lines` written at the end of the feed, as the tick writes them. */
const appended = (...lines: object[]): void => fs.appendFileSync(feedFile(), lines.map((l) => `${JSON.stringify(l)}\n`).join(''));

/** A subscription of `task`'s, by the default wake words, from the feed's end. */
const subscribed = (name: string, task: string): void =>
  putSubscription(name, { task, wake: [...DEFAULT_WAKE], digestEvery: 60, from: feedSize() });

const toldTo = (task: string): string[] => told.get(task) ?? [];

test('a wake line is said once, the routine lines before it riding it as one digest, and the cursor kept once it is said', async (t) => {
  subscribed('once', 't-once');
  const stop = running(t);
  appended(line('r-1', 'running'), line('r-1', 'verified ✓'), line('r-1', 'awaiting approval'));
  await until(() => toldTo('t-once').length === 1, 'the wake said');
  const [first] = toldTo('t-once');
  assert.match(
    first,
    /^The feed needs your judgement:\n {2}\S+ {2}r-1 {2}build {2}awaiting approval\n\nSince your last news:\n2 routine lines/,
  );
  assert.match(first, /r-1 {2}build {2}running\n.*r-1 {2}build {2}verified ✓$/);
  appended(line('r-2', 'rounds exhausted'));
  await until(() => toldTo('t-once').length === 2, 'the next wake said');
  assert.doesNotMatch(toldTo('t-once')[1], /r-1|Since your last news/, 'neither the first wake nor its digest again');
  await until(() => readDelivery('once')?.cursor === feedSize(), 'the cursor at the end of the feed');
  assert.deepEqual(readDelivery('once')?.digest, []);
  await stop();
  dropSubscription('once');
});

test('a digest falls due after its minutes with no wake: said alone, then emptied', async (t) => {
  subscribed('quiet', 't-quiet');
  const folded = line('r-3', 'verified ✓');
  writeDelivery('quiet', { cursor: feedSize(), digest: [folded], since: { at: Date.now() - 61 * 60_000 } });
  const stop = running(t);
  await until(() => toldTo('t-quiet').length === 1, 'the digest said');
  assert.match(
    toldTo('t-quiet')[0],
    /^News from the feed, nothing waiting on you:\n1 routine line of the feed:\n {2}\S+ {2}r-3 {2}build {2}verified ✓$/,
  );
  await until(() => readDelivery('quiet')?.digest.length === 0, 'the digest emptied');
  await stop();
  dropSubscription('quiet');
});

test('a restart reads where the deliverer was off its file: no line said again, none dropped', async (t) => {
  subscribed('restart', 't-restart');
  let stop = running(t);
  appended(line('r-4', 'failed ✗ check (exit 1)'));
  await until(() => toldTo('t-restart').length === 1, 'the first wake said');
  appended(line('r-4', 'running'));
  await until(() => readDelivery('restart')?.digest.length === 1, 'the routine line folded');
  await stop();
  appended(line('r-5', 'awaiting approval'));
  stop = running(t);
  await until(() => toldTo('t-restart').length === 2, 'the wake written while it was down said');
  const [, second] = toldTo('t-restart');
  assert.match(second, /r-5 {2}build {2}awaiting approval/);
  assert.match(second, /Since your last news:\n1 routine line of the feed:\n {2}\S+ {2}r-4 {2}build {2}running$/, 'the folded line kept');
  assert.doesNotMatch(second, /failed/, 'the first wake not said again');
  await stop();
  dropSubscription('restart');
});

test('the cursor stays while say fails, said again after a backoff until it is taken', async (t) => {
  subscribed('held', 't-held');
  failing.add('t-held');
  const stop = running(t);
  appended(line('r-6', 'running'));
  await until(() => readDelivery('held')?.digest.length === 1, 'the routine line folded');
  const before = readDelivery('held')!;
  appended(line('r-6', 'blocked'));
  await until(() => (asked.get('t-held') ?? 0) >= 3, 'say asked three times');
  assert.deepEqual(readDelivery('held'), before, 'neither the cursor nor the digest moved while say fails');
  failing.delete('t-held');
  await until(() => toldTo('t-held').length === 1, 'said once say takes it');
  await until(() => readDelivery('held')?.cursor === feedSize(), 'the cursor kept after it');
  assert.equal(toldTo('t-held').length, 1);
  await stop();
  dropSubscription('held');
});

test('an unsubscribe stops delivery, and the deliverer drops its file', async (t) => {
  subscribed('leaving', 't-leaving');
  subscribed('staying', 't-staying');
  const stop = running(t);
  appended(line('r-7', 'awaiting approval'));
  await until(() => toldTo('t-leaving').length === 1 && toldTo('t-staying').length === 1, 'both told');
  dropSubscription('leaving');
  writeDelivery('leaving', { cursor: 0, digest: [] });
  await until(
    () => !fs.existsSync(deliveryFile('leaving')),
    'the deliverer drops a file whose subscription is gone, once it has stopped it',
  );
  appended(line('r-8', 'awaiting approval'));
  await until(() => toldTo('t-staying').length === 2, 'the one staying told');
  assert.equal(toldTo('t-leaving').length, 1, 'the one gone told nothing more');
  await stop();
  dropSubscription('staying');
});

test('a feed cut under the cursor is read again from its start', async (t) => {
  subscribed('cut', 't-cut');
  const stop = running(t);
  appended(line('r-9', 'awaiting approval'));
  await until(() => toldTo('t-cut').length === 1, 'the wake said');
  fs.writeFileSync(feedFile(), `${JSON.stringify(line('r-10', 'blocked'))}\n`);
  await until(() => toldTo('t-cut').length === 2, 'the cut feed read again from its start');
  assert.match(toldTo('t-cut')[1], /r-10 {2}build {2}blocked/);
  await until(() => readDelivery('cut')?.cursor === feedSize(), 'the cursor at the end of the new feed');
  await stop();
  dropSubscription('cut');
});
