/**
 * The feed's one emission (`emitFeed`) and its live readers (`followFeed`), over a store of the file's own: what a reader is handed when
 * it keeps up, when it lags behind the hub, when another process writes, and when the feed is cut under it; and what a writer says.
 *
 * A file of its own, since the feed is the store's one file. `WF_ROOT` is read as the module loads, so it is set before the import. Every
 * pass here judges one run, `r-1`, a word no pass said before, so each writes one line and none says a run `removed`; each test reads from
 * the feed's end, so no test reads another's lines. The live tests run on a runtime with a hub
 * (`feedHubLayer`) and no logger; a line another process writes is emitted with no hub, as `nemia tick` by hand writes one.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Exit, Fiber, Layer, Logger, ManagedRuntime, Metric, PubSub, References, Stream, type Duration } from 'effect';
import { isRunLine, type FeedWords } from './feed.ts';
import { scratch } from '../../test/scratch.ts';
import { bell, until, WAITED } from '../../test/waits.ts';

const ROOT = scratch('wf-feed-verb-');
const FEED = path.join(ROOT, 'feed.jsonl');

process.env.WF_ROOT = ROOT;
const { emitFeed, FEED_FOLLOW_BEATS, FEED_FOLLOW_LINES, FEED_FOLLOW_READS, FEED_FOLLOWERS, FeedHub, feedHubLayer, followFeed } =
  await import('./feed.verb.ts');
const { feedSize } = await import('./feed.store.ts');

type Followed = Stream.Success<ReturnType<typeof followFeed>>;

/** What a pass judged of the one run, `r-1`: the run at `word`, and `step` at `word` where it is given. */
const judged = (word: string, step?: string): ReadonlyMap<string, FeedWords> =>
  new Map([['r-1', { run: { word }, steps: step ? [{ name: step, word }] : [] }]]);

/** A runtime with a hub of `capacity` lines and no logger, the process a reader and a writer share: let go once the test `t` ends. */
function hubbed(t: TestContext, capacity?: number) {
  const rt = ManagedRuntime.make(Layer.merge(feedHubLayer(capacity), Logger.layer([])));
  t.after(() => rt.dispose());
  return rt;
}

/** A word written by another process: through the same writer, with no hub, so no reader is handed an item of it. */
const foreign = (word: string) => Effect.runPromise(emitFeed(judged(word)).pipe(Effect.provide(Logger.layer([]))));

/** A metric's count now, read off the registry every runtime shares. */
const counted = (metric: typeof FEED_FOLLOW_READS) => Effect.runSync(Metric.value(metric)).count;

/** The live readers counted now (`FEED_FOLLOWERS`). */
const followers = () => Effect.runSync(Metric.value(FEED_FOLLOWERS)).value;

/** Waits in test `t` until `ok()` holds, read every 5ms: a metric or a fiber's end, which no callback of the test's rings. */
const read = (t: TestContext, ok: () => boolean, what: string) => until(t, ok, what, { everyMs: 5 });

/**
 * A reader from `from` on `rt`, the feed's end by default, each item it is handed kept in `got`, counted once it holds its cursor: stopped
 * once the test `t` ends, and no longer counted. `handed(ok, what)` waits until `ok()` holds, asked as each item is handed.
 */
async function following(t: TestContext, rt: ReturnType<typeof hubbed>, beat: Duration.Input, from = feedSize()) {
  const got: Followed[] = [];
  const pushed = bell();
  const was = followers();
  const fiber = rt.runFork(
    Stream.runForEach(followFeed(from, { beat }), (f) =>
      Effect.sync(() => {
        got.push(f);
        pushed.ring();
      }),
    ),
  );
  t.after(async () => {
    await Effect.runPromise(Fiber.interrupt(fiber));
    assert.equal(followers(), was, 'no longer counted once interrupted');
  });
  await read(t, () => followers() === was + 1 || fiber.pollUnsafe() !== undefined, 'the reader counted, or its end');
  return {
    got,
    fiber,
    words: () => got.flatMap((f) => (f.kind === 'line' ? [f.line.word] : [])),
    handed: (ok: () => boolean, what: string) => until(t, ok, what, { bell: pushed }),
  };
}

test('REFUSED: a reader that takes nothing never holds up the writer — the hub slides, the oldest line dropped for it', async (t) => {
  const rt = hubbed(t, 2);
  const taken = rt.runSync(
    Effect.scoped(
      Effect.gen(function* () {
        const reader = yield* PubSub.subscribe((yield* FeedHub)!);
        for (const word of ['one', 'two', 'three', 'four', 'five']) yield* emitFeed(judged(word));
        return yield* PubSub.takeUpTo(reader, 10);
      }),
    ),
  );
  assert.deepEqual(
    taken.map((p) => p.line.word),
    ['four', 'five'],
    'every emission returned at once, with the reader full: it keeps the last two',
  );
});

test(
  'a reader that lags gets every line once and in order: one read of the file for what the hub dropped, none for an item it read',
  WAITED,
  async (t) => {
    const rt = hubbed(t, 2);
    const reader = await following(t, rt, '1 hour');
    const reads = counted(FEED_FOLLOW_READS);
    rt.runSync(Effect.forEach(['1', '2', '3', '4', '5', '6', '7', '8'], (word) => emitFeed(judged(word))));
    await reader.handed(() => reader.words().length >= 8, 'eight lines handed');
    await rt.runPromise(emitFeed(judged('9')));
    await reader.handed(() => reader.words().length >= 9, 'the ninth line handed');

    assert.deepEqual(reader.words(), ['1', '2', '3', '4', '5', '6', '7', '8', '9']);
    const cursors = reader.got.flatMap((f) => (f.kind === 'line' ? [f.cursor] : []));
    assert.deepEqual(
      cursors,
      [...cursors].sort((a, b) => a - b),
      'each cursor past the one before',
    );
    assert.equal(cursors.at(-1), feedSize(), 'the last cursor is the end of the feed');
    assert.equal(
      counted(FEED_FOLLOW_READS) - reads,
      1,
      'the first item past the cursor read the six lines the hub dropped, the eighth line was in that read and its item cost nothing, and the ninth came from the hub',
    );
  },
);

test(
  'REFUSED: a reader counts each line it hands on, from its first read, from the hub and from a later read, and nothing else',
  WAITED,
  async (t) => {
    const rt = hubbed(t);
    const from = feedSize();
    await foreign('caught');
    const lines = counted(FEED_FOLLOW_LINES);
    const reader = await following(t, rt, '5 millis', from);
    await reader.handed(() => reader.words().length >= 1, 'the line before it opened handed');
    assert.equal(counted(FEED_FOLLOW_LINES) - lines, 1, 'the line of its first read');

    await rt.runPromise(emitFeed(judged('a pass', 'build')));
    await reader.handed(() => reader.words().length >= 3, "the pass's two lines handed");
    assert.equal(counted(FEED_FOLLOW_LINES) - lines, 3, 'the two lines of one item of the hub');

    await foreign('theirs');
    rt.runSync(Effect.forEach(['one', 'two'], (word) => emitFeed(judged(word))));
    await reader.handed(() => reader.words().length >= 6, 'the three lines after it handed');
    const beats = counted(FEED_FOLLOW_BEATS);
    await read(t, () => counted(FEED_FOLLOW_BEATS) >= beats + 3, 'three beats on a feed that did not move');
    assert.deepEqual(reader.words(), ['caught', 'a pass', 'a pass', 'theirs', 'one', 'two']);
    assert.equal(counted(FEED_FOLLOW_LINES) - lines, 6, 'each line once: an item a read handed already, and a beat, count nothing');
  },
);

test(
  "a line another process wrote is read from the file before the next line the hub brings, as the item's bytes are past the cursor",
  WAITED,
  async (t) => {
    const rt = hubbed(t);
    const reader = await following(t, rt, '1 hour');
    await foreign('theirs');
    await rt.runPromise(emitFeed(judged('ours')));
    await reader.handed(() => reader.words().length >= 2, 'both lines handed');
    assert.deepEqual(reader.words(), ['theirs', 'ours']);
  },
);

test(
  'the beat stats the file and reads it only once it moved: a line another process wrote is read on the next beat, and nothing before it',
  WAITED,
  async (t) => {
    const rt = hubbed(t);
    const reader = await following(t, rt, '5 millis');
    const reads = counted(FEED_FOLLOW_READS);
    const beats = counted(FEED_FOLLOW_BEATS);
    await read(t, () => counted(FEED_FOLLOW_BEATS) >= beats + 3, 'three beats');
    assert.equal(counted(FEED_FOLLOW_READS), reads, 'three beats on a feed that did not move read nothing');

    await foreign('theirs, on a beat');
    await reader.handed(() => reader.words().length >= 1, 'the line handed');
    assert.deepEqual(reader.words(), ['theirs, on a beat']);
    assert.deepEqual(
      reader.got.map((f) => f.kind === 'line' && f.cursor),
      [feedSize()],
    );
  },
);

test(
  'REFUSED: a reader whose read failed at the end of the feed says `readable` before the next line, though its item starts at the cursor',
  WAITED,
  async (t) => {
    if (process.getuid?.() === 0) return t.skip('a folder of mode 600 does not keep root from reading it');
    const rt = hubbed(t);
    const reader = await following(t, rt, '5 millis');
    const mode = fs.statSync(ROOT).mode & 0o777;
    fs.chmodSync(ROOT, 0o600);
    try {
      await reader.handed(() => reader.got.length >= 1, 'the failed read handed');
    } finally {
      fs.chmodSync(ROOT, mode);
    }
    assert.deepEqual(
      reader.got.map((f) => f.kind),
      ['unreadable'],
      'a beat that cannot stat the feed reads it, and the read fails',
    );

    const lines = counted(FEED_FOLLOW_LINES);
    await rt.runPromise(emitFeed(judged('after a failed read')));
    await reader.handed(() => reader.words().length >= 1, 'the line handed');
    assert.equal(counted(FEED_FOLLOW_LINES) - lines, 1, '`readable` is no line handed on');
    assert.deepEqual(
      reader.got.map((f) => f.kind),
      ['unreadable', 'readable', 'line'],
      'the feed did not move while it failed, so the item starts at the cursor: only a read says the feed is readable again',
    );
  },
);

test('REFUSED: a cursor the feed cannot be read from fails the stream before the reader is counted — past the end, or inside a line', async () => {
  await foreign('cursor');
  const was = followers();
  for (const [from, said] of [
    [feedSize() + 5, /is past the end of the feed/],
    [1, /falls inside a line of the feed/],
  ] as const) {
    const exit = await Effect.runPromiseExit(Stream.runDrain(followFeed(from, { beat: '1 hour' })));
    assert.ok(Exit.isFailure(exit));
    const failure = exit.cause.reasons.find((r) => r._tag === 'Fail');
    assert.ok(failure && failure._tag === 'Fail');
    assert.equal((failure.error as { exitCode?: number }).exitCode, 2);
    assert.match((failure.error as Error).message, said);
    assert.equal(followers(), was);
  }
});

test('REFUSED: a feed cut under an open reader fails it on the next beat, and is never said as a read that failed', WAITED, async (t) => {
  await foreign('cut');
  const rt = hubbed(t);
  const reader = await following(t, rt, '5 millis');
  fs.truncateSync(FEED, 0);
  await read(t, () => reader.fiber.pollUnsafe() !== undefined || reader.got.length > 0, 'the reader failed, or handed an item');
  assert.deepEqual(reader.got, [], 'the cut is no line, and no unreadable feed to try again');
  const exit = await Effect.runPromise(Fiber.await(reader.fiber));
  assert.ok(Exit.isFailure(exit));
  assert.match(
    String(exit.cause.reasons.map((r) => (r._tag === 'Fail' ? (r.error as Error).message : r._tag))),
    /is past the end of the feed/,
  );
});

test('REFUSED: the lines of one emission reach a reader as one chunk, a run and its step together', WAITED, async (t) => {
  const rt = hubbed(t);
  const chunks: Followed[][] = [];
  const pushed = bell();
  const was = followers();
  const fiber = rt.runFork(
    Stream.runForEachArray(followFeed(feedSize(), { beat: '1 hour' }), (chunk) =>
      Effect.sync(() => {
        chunks.push([...chunk]);
        pushed.ring();
      }),
    ),
  );
  t.after(() => Effect.runPromise(Fiber.interrupt(fiber)));
  await read(t, () => followers() === was + 1, 'the reader counted');
  await rt.runPromise(emitFeed(judged('awaiting approval', 'land')));
  await until(t, () => chunks.flat().length >= 2, 'both lines handed', { bell: pushed });
  assert.deepEqual(
    chunks.map((c) =>
      c.map((f) => (f.kind === 'line' ? `${(isRunLine(f.line) ? f.line.step : undefined) ?? '—'} ${f.line.word}` : f.kind)),
    ),
    [['— awaiting approval', 'land awaiting approval']],
    'one chunk of two lines, the run first',
  );
  const [, step] = chunks[0];
  assert.equal(step.kind === 'line' && step.cursor, feedSize());
});

test('each line emitFeed writes is logged at Info, annotated with its labels, its reason, how serious it is, and its word', async () => {
  const logs: { level: string; text: string; annotations: Record<string, unknown> }[] = [];
  const keeper = Logger.make(({ message, logLevel, fiber }) => {
    logs.push({
      level: logLevel,
      text: (Array.isArray(message) ? message : [message]).join(' '),
      annotations: { ...fiber.getRef(References.CurrentLogAnnotations) },
    });
  });
  const lines = await Effect.runPromise(emitFeed(judged('running', 'plan')).pipe(Effect.provide(Logger.layer([keeper]))));
  assert.equal(lines.length, 2);
  assert.deepEqual(logs, [
    { level: 'Info', text: 'r-1  —  running', annotations: { run: 'r-1', reason: 'Running', type: 'Normal', word: 'running' } },
    {
      level: 'Info',
      text: 'r-1  plan  running',
      annotations: { run: 'r-1', step: 'plan', reason: 'Running', type: 'Normal', word: 'running' },
    },
  ]);
});
