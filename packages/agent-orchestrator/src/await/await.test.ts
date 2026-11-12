/**
 * `nemia wait` over a store of the file's own: the follow (`waitFeed`) that ends on the first chunk of the feed holding a line its
 * selectors take, or at its bound, and answers the cursor it read to, so the next wait loses no line; and the entry (`WAIT`) that checks
 * what it is handed and prints the answer. The bound's own laws are `contracts/wait-bound.contract.ts`'s.
 *
 * Every line here is of a run no other test names, so each test reads only its own lines. The live waits run on a runtime with a hub
 * (`feedHubLayer`) and no logger, as the api's do; the bound is steered (`steeredClock`), at its shipped four minutes.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { Cause, Effect, Exit, Fiber, Layer, Logger, ManagedRuntime, Metric } from 'effect';
import { scratch } from 'test-kit/scratch';
import { until, WAITED } from 'agent-runtime/testing';
import { StoreRoot } from '../config/root.store.ts';
import { emitFeed, FEED_FOLLOWERS, feedHubLayer } from '../feed/feed.verb.ts';
import { feedSize } from '../feed/feed.store.ts';
import type { FeedLine, FeedWords } from '../feed/feed.ts';
import { Invalid } from '../refusal/refusal.ts';
import { parseSelectors } from '../watch/selector.ts';
import { watchedLine } from '../subscription/subscription.ts';
import { steeredClock } from '../../test/steered.ts';
import { waitForBound } from './await.ts';
import { answerOf, readChunk, waitFeed } from './await.verb.ts';
import { WAIT } from './commands.verb.ts';

const ROOT = scratch('wf-await-');

/**
 * What a pass judged: `run` at `word`, and each of `also` at its word, each labelled with its id alone, as a run with no labels of a
 * person's is. A run a pass leaves out is said `removed`, so a pass names every run of its test that still stands.
 */
const judged = (run: string, word: string, also: Readonly<Record<string, string>> = {}): ReadonlyMap<string, FeedWords> =>
  new Map([[run, word] as const, ...Object.entries(also)].map(([id, said]) => [id, { run: { word: said }, steps: [] }]));

/** A runtime with a hub and no logger over the file's store, the process a waiter and the writer share: let go once `t` ends. */
function hubbed(t: TestContext) {
  const rt = ManagedRuntime.make(Layer.mergeAll(feedHubLayer(), Logger.layer([]), StoreRoot.layer(ROOT)));
  t.after(() => rt.dispose());
  return rt;
}

/** The live readers counted now (`FEED_FOLLOWERS`): a wait is counted once it holds its cursor. */
const followers = () => Effect.runSync(Metric.value(FEED_FOLLOWERS)).value;

/** The words of the lines a wait answered. */
const words = (lines: readonly { line: { word: string } }[]) => lines.map((l) => l.line.word);

test(
  'a line written after the wait opens, which its selector takes, ends the wait and is answered with the cursor after it',
  WAITED,
  async (t) => {
    const rt = hubbed(t);
    const was = followers();
    const waiting = rt.runPromise(waitFeed({ selectors: parseSelectors(['run=after-1']), ms: 60_000, beat: '1 hour' }));
    await until(t, () => followers() === was + 1, 'the wait holds its cursor', { everyMs: 5 });
    await rt.runPromise(emitFeed(judged('after-1', 'started')));
    const got = await waiting;
    assert.equal(got.ended, 'matched');
    assert.deepEqual(words(got.lines), ['started']);
    assert.equal(got.cursor, feedSize(ROOT), 'the cursor is the feed end after the line');
    assert.equal(got.lines[0]?.to, got.cursor, "the line's end is the cursor");
  },
);

test('a selector filters: a line it does not take is read past, and the wait ends on the one it takes', WAITED, async (t) => {
  const rt = hubbed(t);
  const was = followers();
  const waiting = rt.runPromise(waitFeed({ selectors: parseSelectors(['run=filter-b']), ms: 60_000, beat: '1 hour' }));
  await until(t, () => followers() === was + 1, 'the wait holds its cursor', { everyMs: 5 });
  await rt.runPromise(emitFeed(judged('filter-a', 'started')));
  const past = feedSize(ROOT);
  await rt.runPromise(emitFeed(judged('filter-b', 'landed', { 'filter-a': 'started' })));
  const got = await waiting;
  assert.equal(got.ended, 'matched');
  assert.deepEqual(words(got.lines), ['landed'], 'the line of filter-a is left out');
  assert.equal(got.lines[0]?.from, past, 'the line taken starts where the one read past ended');
});

test(
  'REFUSED at shipped defaults: no line ends a wait at its four minutes, a millisecond early nothing, with the cursor it read to',
  WAITED,
  async (t) => {
    const rt = hubbed(t);
    const clock = steeredClock();
    const at = feedSize(ROOT);
    const bound = waitForBound(undefined);
    assert.ok('ms' in bound, 'no --for is a bound');
    const fiber = rt.runFork(
      waitFeed({ selectors: parseSelectors(['run=never']), ms: bound.ms, beat: '1 hour' }).pipe(Effect.provide(clock.layer)),
    );
    t.after(() => Effect.runPromise(Fiber.interrupt(fiber)));
    await until(t, () => clock.asked.includes(240_000), 'the bound asked', { bell: clock.bell });
    await rt.runPromise(emitFeed(judged('bound-other', 'started')));
    await clock.adjust(239_999);
    assert.equal(fiber.pollUnsafe(), undefined, 'a millisecond early, still waiting');
    await clock.adjust(1);
    const got = await rt.runPromise(Fiber.join(fiber));
    assert.equal(got.ended, 'bound');
    assert.deepEqual(got.lines, []);
    assert.ok(got.cursor >= at, 'the cursor is never behind where the wait began');
  },
);

test(
  'a cursor older than the feed end answers the first match already there, and the cursor answered resumes with no line lost',
  WAITED,
  async (t) => {
    const rt = hubbed(t);
    const from = feedSize(ROOT);
    await rt.runPromise(emitFeed(judged('resume-1', 'started')));
    await rt.runPromise(emitFeed(judged('resume-other', 'started', { 'resume-1': 'started' })));
    const first = await rt.runPromise(
      waitFeed({ selectors: parseSelectors(['run in (resume-1,resume-2)']), from, ms: 60_000, beat: '1 hour' }),
    );
    assert.equal(first.ended, 'matched');
    assert.deepEqual(words(first.lines), ['started'], 'the line already there is answered at once');
    assert.equal(first.lines[0]?.from, from, 'it is the first line after the cursor');
    await rt.runPromise(emitFeed(judged('resume-2', 'landed', { 'resume-1': 'started', 'resume-other': 'started' })));
    const second = await rt.runPromise(
      waitFeed({ selectors: parseSelectors(['run in (resume-1,resume-2)']), from: first.cursor, ms: 60_000, beat: '1 hour' }),
    );
    assert.deepEqual(words(second.lines), ['landed'], 'the line written between the waits is answered by the next');
    assert.equal(second.cursor, feedSize(ROOT));
  },
);

test('what a wait read holds the lines it took beside its cursor, so a bound that falls once they are taken still answers them', (t) => {
  const line = (run: string) => ({
    kind: 'line' as const,
    line: { at: '2026-11-11T00:00:00.000Z', run, word: 'started' } as FeedLine,
    cursor: 0,
  });
  const at = (run: string, cursor: number) => ({ ...line(run), cursor });
  const selectors = parseSelectors(['run=chunk-1']);
  const none = readChunk({ cursor: 10, lines: [] }, [at('chunk-0', 20)], selectors);
  t.test('a chunk with no line taken moves the cursor past it, and answers bound there', () => {
    assert.deepEqual(answerOf(none), { ended: 'bound', lines: [], cursor: 20 });
  });
  const took = readChunk(none, [at('chunk-0', 30), at('chunk-1', 40), at('chunk-0', 50)], selectors);
  t.test('a chunk with a line taken answers matched with it, the cursor after the chunk', () => {
    assert.deepEqual(answerOf(took), { ended: 'matched', lines: [{ line: at('chunk-1', 40).line, from: 30, to: 40 }], cursor: 50 });
  });
  t.test('once lines are taken, a later chunk is not read: the cursor stays after the chunk they came in', () => {
    assert.equal(readChunk(took, [at('chunk-1', 60)], selectors), took);
  });
});

test('REFUSED: a cursor inside a line is refused as followFeed refuses it', async (t) => {
  const rt = hubbed(t);
  const from = feedSize(ROOT);
  await rt.runPromise(emitFeed(judged('inside-1', 'started')));
  const exit = await rt.runPromiseExit(waitFeed({ selectors: [], from: from + 1, ms: 60_000, beat: '1 hour' }));
  assert.ok(Exit.isFailure(exit));
  assert.ok(Cause.squash(exit.cause) instanceof Invalid, 'an Invalid, exit 2');
});

test('REFUSED: WAIT refuses a bad selector, a --for out of its form, none to wait and longer than a call lives, before reading', () => {
  for (const args of [{ selector: ['run=='] }, { for: 'soon' }, { for: '0s' }, { for: '5m' }, { from: 'start' }]) {
    assert.equal(typeof WAIT.check?.(args), 'string', JSON.stringify(args));
    const exit = Effect.runSyncExit(
      Effect.provideService(WAIT.handler(args) as unknown as Effect.Effect<unknown, unknown, StoreRoot>, StoreRoot, ROOT),
    );
    assert.ok(Exit.isFailure(exit) && Cause.squash(exit.cause) instanceof Invalid, `${JSON.stringify(args)} refused as Invalid`);
  }
  assert.equal(WAIT.check?.({ selector: ['run=x'], for: '30s', from: '0' }), null, 'a good wait is taken');
});

test('WAIT prints each line as nemia watch --once does, then the cursor', () => {
  const line = { run: 'p-1', word: 'started', at: '2026-11-11T00:00:00.000Z' };
  const printed = WAIT.print({ ended: 'matched', lines: [{ line, from: 0, to: 40 }], cursor: 40 }, {});
  assert.deepEqual(printed, [watchedLine(line, 40, {}), 'cursor: 40']);
});
