/**
 * The deliverer over the feed on disk and an engine of the test's, whose `say` records what each task is told and fails where a test says:
 * a wake line said once, with the digest riding it; the wake lines of one read said in one message, a gate's two lines and several
 * gates alike, over the file and over the hub, and the lines published while a `say` is in flight gathered into the next; a digest said
 * alone once due, and never before; a restart that neither repeats nor drops a line, and one between a `say` and its cursor that says the
 * message again; the cursor held while `say` fails, the message said again whole; an unsubscribe that stops delivery; a name subscribed
 * again that starts from its own `from`; a feed cut under the cursor read again from its start; and a subscription scoped by a floor told
 * only of the runs of factories at it or above. Each test runs a deliverer of its own and waits for what it counts. A store of its own,
 * since `WF_ROOT` is read as the module loads.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Duration, Effect, Fiber, Layer, Logger, ManagedRuntime, Metric, Schedule } from 'effect';
import { scratch } from '../../test/scratch.ts';
import { testEngine, bell, until, WAITED } from 'agent-runtime/testing';
import { steeredClock } from '../../test/steered.ts';
import { DAEMON_STARTED, isRunLine, upgraded, type FeedLine } from '../feed/index.ts';

const ROOT = scratch('wf-deliver-');
process.env.WF_ROOT = ROOT;
const { DELIVER_DEFAULTS, SUBSCRIPTION_DIGEST_CHECKS, deliver, sayBackoff } = await import('./deliver.verb.ts');
const { deliveryFile, dropSubscription, putSubscription, readDelivery, subscriptionFile, writeDelivery } =
  await import('./subscription.store.ts');
const { DEFAULT_SELECTORS } = await import('./subscription.ts');
const { feedFile, feedSize, readFeed } = await import('../feed/feed.store.ts');
const { emitFeed, FEED_FOLLOW_LINES, FEED_FOLLOWERS, feedHubLayer } = await import('../feed/feed.verb.ts');
const { engineOf, over } = await import('../runtime-client.ts');
const { addFactory } = await import('../factory/factory.store.ts');
const { writeFactoryLevel } = await import('../level/level.store.ts');

/**
 * What each task was told, in order; what each was asked, in order; the tasks whose `say` fails for now; and the tasks whose next `say` is
 * told and never resolves, as a deliverer stopped between a `say` and its cursor.
 */
const told = new Map<string, string[]>();
const asked = new Map<string, string[]>();
const failing = new Set<string>();
const hanging = new Set<string>();
/** Rung as a task is told. */
const toldBell = bell();

const e = {
  ...engineOf(testEngine().layer),
  say: (task: string, text: string) =>
    Effect.suspend(() => {
      asked.set(task, [...(asked.get(task) ?? []), text]);
      if (failing.has(task)) return Effect.fail({ _tag: 'SayUnsent', message: 'its session is not listed' } as never);
      told.set(task, [...(told.get(task) ?? []), text]);
      toldBell.ring();
      if (hanging.delete(task)) return Effect.never;
      return Effect.succeed({ at: new Date().toISOString(), text } as never);
    }),
};

/** The deliverer, at a pace a test waits on. */
const delivering = over(e)(
  deliver({ every: '10 millis', beat: '10 millis', digestCheck: '10 millis', retry: '5 millis', retryCap: '20 millis' }),
);

/** A deliverer at a pace a test waits on, running until the answer is called, or else until test `t` ends, whatever its verdict. */
const running = (t: TestContext): (() => Promise<void>) => {
  const fiber = Effect.runFork(delivering);
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

/**
 * `subscription` put under `name` for test `t`, and dropped once it ends, whatever its verdict, unless the test dropped it: a test that
 * fails leaves no subscription for the next one's deliverer to follow.
 */
const kept = (t: TestContext, name: string, subscription: Parameters<typeof putSubscription>[1]): void => {
  putSubscription(name, subscription);
  t.after(() => {
    if (fs.existsSync(subscriptionFile(name))) dropSubscription(name);
  });
};

/** A subscription of `task`'s for test `t`, by the default selector, from the feed's end, which it answers (`kept`). */
const subscribed = (t: TestContext, name: string, task: string): number => {
  const from = feedSize();
  kept(t, name, { task, selectors: [...DEFAULT_SELECTORS], digestEvery: 60, from });
  return from;
};

/** The digest checks the deliverers have done. */
const digestChecks = (): number => Effect.runSync(Metric.value(SUBSCRIPTION_DIGEST_CHECKS)).count;

const toldTo = (task: string): string[] => told.get(task) ?? [];

/** The lines of a message told, each a line of the feed, between its heading and the digest riding it. */
const wakesIn = (message: string): string[] => message.split('\n\n')[0].split('\n').slice(1);

/** A gate's two lines at one instant, as the tick writes them: the run's, waiting on a person, then its step's at `land`. */
const gate = (run: string): object[] => {
  const at = new Date().toISOString();
  return [
    { at, run, word: 'awaiting approval', note: 'waiting on you: approve land' },
    { at, run, step: 'land', word: 'awaiting approval', note: `approve it: nemia approve ${run} land` },
  ];
};

test(
  'a wake line is said once, the routine lines before it riding it as one digest, and the cursor kept once it is said',
  WAITED,
  async (t) => {
    subscribed(t, 'once', 't-once');
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
  },
);

test("REFUSED: one gate's two lines are one say, holding both in feed order", WAITED, async (t) => {
  subscribed(t, 'gate', 't-gate');
  appended(...gate('r-20'));
  const stop = running(t);
  await held(t, () => readDelivery('gate')?.cursor === feedSize(), 'the cursor at the end of the feed');
  assert.equal(toldTo('t-gate').length, 1, 'one say for one gate');
  assert.deepEqual(
    wakesIn(toldTo('t-gate')[0]).map((l) => l.split('  ').slice(2).join(' ')),
    ['r-20 — awaiting approval · waiting on you: approve land', 'r-20 land awaiting approval · approve it: nemia approve r-20 land'],
  );
  await stop();
});

test('three gates in one read: one say, their lines in feed order, with the digest once', WAITED, async (t) => {
  subscribed(t, 'gates', 't-gates');
  appended(line('r-21', 'running'), ...gate('r-22'), ...gate('r-23'), ...gate('r-24'));
  const stop = running(t);
  await held(t, () => readDelivery('gates')?.cursor === feedSize(), 'the cursor at the end of the feed');
  assert.equal(toldTo('t-gates').length, 1, 'one say for one read');
  const [said] = toldTo('t-gates');
  assert.deepEqual(
    wakesIn(said).map((l) => l.split('  ').slice(2, 4).join(' ')),
    ['r-22 —', 'r-22 land', 'r-23 —', 'r-23 land', 'r-24 —', 'r-24 land'],
  );
  assert.equal(said.split('Since your last news:').length, 2, 'the digest said once');
  assert.match(said, /Since your last news:\n1 routine line of the feed:\n {2}\S+ {2}r-21 {2}build {2}running$/);
  assert.deepEqual(readDelivery('gates')?.digest, []);
  await stop();
});

test("a gate published to the process's hub is one say, as the daemon delivers it", WAITED, async (t) => {
  const rt = ManagedRuntime.make(Layer.merge(feedHubLayer(), Logger.layer([])));
  t.after(() => rt.dispose());
  subscribed(t, 'hub', 't-hub');
  const following = () => Effect.runSync(Metric.value(FEED_FOLLOWERS)).value;
  const was = following();
  const fiber = rt.runFork(delivering);
  t.after(() => Effect.runPromise(Fiber.interrupt(fiber)));
  await held(t, () => following() > was, 'the deliverer following the hub');
  const judged = {
    run: { word: 'awaiting approval', note: 'waiting on you: approve land' },
    steps: [{ name: 'land', word: 'awaiting approval' }],
  };
  const others = new Set(
    readFeed()
      .lines.filter(isRunLine)
      .map((l) => l.run),
  );
  await rt.runPromise(emitFeed(new Map([['r-25', judged]]), { unjudged: others }));
  await held(t, () => readDelivery('hub')?.cursor === feedSize(), 'the cursor at the end of the feed');
  assert.equal(toldTo('t-hub').length, 1, 'one say for the pass');
  assert.deepEqual(
    wakesIn(toldTo('t-hub')[0]).map((l) => l.split('  ').slice(2, 4).join(' ')),
    ['r-25 —', 'r-25 land'],
  );
  await Effect.runPromise(Fiber.interrupt(fiber));
});

test(
  'REFUSED: the lines published while a say is in flight are gathered: one more say holds them all, in feed order',
  WAITED,
  async (t) => {
    const rt = ManagedRuntime.make(Layer.merge(feedHubLayer(), Logger.layer([])));
    t.after(() => rt.dispose());
    subscribed(t, 'busy', 't-busy');
    failing.add('t-busy');
    const following = () => Effect.runSync(Metric.value(FEED_FOLLOWERS)).value;
    const was = following();
    const paced = { every: '10 millis', beat: '1 hour', digestCheck: '10 millis', retry: '5 millis', retryCap: '20 millis' } as const;
    const fiber = rt.runFork(over(e)(deliver(paced)));
    t.after(() => Effect.runPromise(Fiber.interrupt(fiber)));
    await held(t, () => following() > was, 'the deliverer following the hub');
    const awaiting = { run: { word: 'awaiting approval', note: 'waiting on you: approve land' }, steps: [] };
    const handed = () => Effect.runSync(Metric.value(FEED_FOLLOW_LINES)).count;
    const published = (run: string) =>
      rt.runPromise(
        emitFeed(new Map([[run, awaiting]]), {
          unjudged: new Set(
            readFeed()
              .lines.filter(isRunLine)
              .map((l) => l.run),
          ),
        }),
      );
    await published('r-40');
    await held(t, () => (asked.get('t-busy') ?? []).length >= 1, 'the first message asked, its say failing');
    const mark = handed();
    await published('r-41');
    await held(t, () => handed() >= mark + 1, 'r-41 handed on by the reader');
    await published('r-42');
    await held(t, () => handed() >= mark + 2, 'r-42 handed on by the reader');
    failing.delete('t-busy');
    await held(t, () => readDelivery('busy')?.cursor === feedSize(), 'the cursor at the end of the feed');
    assert.deepEqual(
      toldTo('t-busy').map((said) => wakesIn(said).map((l) => l.split('  ')[2])),
      [['r-40'], ['r-41', 'r-42']],
      'the first message alone, then one say for both lines that came while it was in flight',
    );
    await Effect.runPromise(Fiber.interrupt(fiber));
  },
);

test('a digest falls due after its minutes with no wake: said alone, then emptied', WAITED, async (t) => {
  const from = subscribed(t, 'quiet', 't-quiet');
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
});

test('a digest not yet due is not said: its routine lines wait for their minutes, or ride the next wake', WAITED, async (t) => {
  subscribed(t, 'patient', 't-patient');
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
});

test('a restart reads where the deliverer was off its file: no line said again, none dropped', WAITED, async (t) => {
  subscribed(t, 'restart', 't-restart');
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
});

test('the cursor stays while say fails, said again after a backoff until it is taken', WAITED, async (t) => {
  subscribed(t, 'held', 't-held');
  failing.add('t-held');
  const stop = running(t);
  appended(line('r-6', 'running'));
  await held(t, () => readDelivery('held')?.digest.length === 1, 'the routine line folded');
  const before = readDelivery('held')!;
  appended(line('r-6', 'blocked'), line('r-6', 'running'), line('r-6b', 'failed ✗ check (exit 1)'));
  await held(t, () => (asked.get('t-held') ?? []).length >= 3, 'say asked three times');
  assert.deepEqual(readDelivery('held'), before, 'neither the cursor nor the digest moved while say fails');
  failing.delete('t-held');
  await held(t, () => toldTo('t-held').length === 1, 'said once say takes it');
  await held(t, () => readDelivery('held')?.cursor === feedSize(), 'the cursor kept after it');
  assert.equal(toldTo('t-held').length, 1);
  const [said] = toldTo('t-held');
  assert.deepEqual(new Set(asked.get('t-held')), new Set([said]), 'every try said the message whole, and the same');
  assert.deepEqual(
    wakesIn(said).map((l) => l.split('  ').slice(2).join(' ')),
    ['r-6 build blocked', 'r-6b build failed ✗ check (exit 1)'],
  );
  assert.match(said, /Since your last news:\n2 routine lines of the feed:\n.*r-6 {2}build {2}running\n.*r-6 {2}build {2}running$/);
  await stop();
});

test('a restart between a say and its cursor write says the message again: at least once, never dropped', WAITED, async (t) => {
  const from = subscribed(t, 'between', 't-between');
  hanging.add('t-between');
  let stop = running(t);
  appended(line('r-26', 'awaiting approval'), line('r-27', 'blocked'));
  await held(t, () => toldTo('t-between').length === 1, 'told once, its say never resolving');
  await stop();
  assert.equal(readDelivery('between')?.cursor ?? from, from, 'the cursor never moved: the say did not resolve');
  stop = running(t);
  await held(t, () => readDelivery('between')?.cursor === feedSize(), 'the cursor at the end of the feed');
  const [first, again] = toldTo('t-between');
  assert.equal(toldTo('t-between').length, 2, 'said again once the restarted deliverer read from its cursor');
  assert.equal(again, first, 'the same message, whole');
  assert.deepEqual(
    wakesIn(first).map((l) => l.split('  ').slice(2).join(' ')),
    ['r-26 build awaiting approval', 'r-27 build blocked'],
  );
  await stop();
});

test('at shipped defaults a failed say is said again after a backoff that doubles from one second and never waits longer than five minutes', () => {
  const delays = Effect.runSync(
    Effect.gen(function* () {
      const step = yield* Schedule.toStep(sayBackoff(DELIVER_DEFAULTS));
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

test(
  'REFUSED at shipped defaults: a subscription written after a read is not delivered before five seconds, and its digest not asked again before thirty',
  WAITED,
  async (t) => {
    const clock = steeredClock();
    const fiber = Effect.runFork(over(e)(deliver()).pipe(Effect.provide(clock.layer)));
    t.after(() => Effect.runPromise(Fiber.interrupt(fiber)));
    const at = (what: string, holds: () => boolean) => until(t, holds, what, { bell: clock.bell });
    const rests = (ms: number) => clock.asked.filter((asked) => asked === ms).length;
    await at('the first read of the subscriptions done', () => clock.asked.length === 1);
    assert.deepEqual(clock.asked, [5_000], 'the subscriptions are read again after the shipped five seconds');
    const checks = digestChecks();
    subscribed(t, 'steered', 't-steered');
    await clock.adjust(4_999);
    assert.deepEqual([clock.woken, digestChecks()], [[], checks], 'a millisecond early, no read and no deliverer');
    await clock.adjust(1);
    await at('its deliverer at rest after its first digest check', () => rests(30_000) === 1);
    assert.equal(digestChecks(), checks + 1);
    await clock.adjust(29_999);
    assert.deepEqual([digestChecks(), rests(30_000)], [checks + 1, 1], 'a millisecond early, no second check');
    await clock.adjust(1);
    await at('its second digest check done', () => rests(30_000) === 2);
    assert.equal(digestChecks(), checks + 2);
  },
);

test('an unsubscribe stops delivery, and the deliverer drops its file', WAITED, async (t) => {
  subscribed(t, 'leaving', 't-leaving');
  subscribed(t, 'staying', 't-staying');
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
});

test(
  "a name subscribed again starts from its own from: a deliverer's file written for the last one under it is not its",
  WAITED,
  async (t) => {
    appended(line('r-12', 'awaiting approval'));
    const from = subscribed(t, 'again', 't-again');
    writeDelivery('again', { of: { task: 't-again', from: 0 }, cursor: 0, digest: [line('r-12', 'running')] });
    const stop = running(t);
    appended(line('r-13', 'blocked'));
    await held(t, () => toldTo('t-again').length === 1, 'the wake after its from said');
    const [said] = toldTo('t-again');
    assert.match(said, /r-13 {2}build {2}blocked/);
    assert.doesNotMatch(said, /r-12|Since your last news/, "neither a line before its from nor the last one's digest");
    await held(t, () => readDelivery('again')?.of.from === from, 'its own file written');
    await stop();
  },
);

test('a feed cut under the cursor is read again from its start', WAITED, async (t) => {
  subscribed(t, 'cut', 't-cut');
  const stop = running(t);
  appended(line('r-9', 'awaiting approval'));
  await held(t, () => toldTo('t-cut').length === 1, 'the wake said');
  fs.writeFileSync(feedFile(), `${JSON.stringify(line('r-10', 'blocked'))}\n`);
  await held(t, () => toldTo('t-cut').length === 2, 'the cut feed read again from its start');
  assert.match(toldTo('t-cut')[1], /r-10 {2}build {2}blocked/);
  await held(t, () => readDelivery('cut')?.cursor === feedSize(), 'the cursor at the end of the new feed');
  await stop();
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
    kept(t, 'floored', { task: 't-floored', selectors: [...DEFAULT_SELECTORS], digestEvery: 60, from, scope: { atLeast: 'semi-auto' } });
    kept(t, 'everything', { task: 't-everything', selectors: [...DEFAULT_SELECTORS], digestEvery: 60, from });
    const stop = running(t);
    appended(line('r-pipao', 'running'), line('r-pipao', 'awaiting approval'), line('r-gone', 'awaiting approval'));
    appended(line('r-hkb', 'awaiting approval'));
    const wakesTold = () =>
      toldTo('t-everything')
        .flatMap(wakesIn)
        .filter((l) => l.includes('awaiting approval')).length;
    await held(t, () => wakesTold() === 3, 'every wake said to the one unscoped');
    await held(t, () => readDelivery('floored')?.cursor === feedSize(), "the floored one's cursor past every line");
    assert.equal(toldTo('t-floored').length, 1);
    assert.match(toldTo('t-floored')[0], /^The feed needs your judgement:\n {2}\S+ {2}r-hkb {2}build {2}awaiting approval$/);
    assert.deepEqual(readDelivery('floored')?.digest, [], 'a line below the floor is not folded either');
    await stop();
  },
);

test(
  'a daemon’s line is carried by every subscription, scoped or not: routine in a digest kept on disk, a wake where it names daemon',
  WAITED,
  async (t) => {
    const from = feedSize();
    kept(t, 'scoped-d', { task: 't-scoped-d', selectors: [...DEFAULT_SELECTORS], digestEvery: 60, from, scope: { atLeast: 'semi-auto' } });
    kept(t, 'woken-d', { task: 't-woken-d', selectors: ['kind=Daemon'], digestEvery: 60, from });
    const stop = running(t);
    const started: FeedLine = { at: new Date().toISOString(), daemon: 5151, word: DAEMON_STARTED, note: 'first daemon on this store' };
    appended(started);
    await held(t, () => toldTo('t-woken-d').length === 1, 'the subscriber that names daemon woken');
    assert.match(
      toldTo('t-woken-d')[0],
      /^The feed needs your judgement:\n {2}\S+ {2}pid 5151 {2}daemon started {2}· first daemon on this store$/,
    );
    await held(t, () => readDelivery('scoped-d')?.cursor === feedSize(), "the scoped one's cursor past the line");
    assert.deepEqual(
      readDelivery('scoped-d')?.digest,
      [upgraded(started)],
      'folded into its digest, and read back off its file, upgraded as the feed reads it',
    );
    assert.equal(toldTo('t-scoped-d').length, 0, 'routine by the default words');
    await stop();
  },
);

/**
 * Of a test file's `source`: how many subscriptions it puts outside its helper `kept`, and whether `kept` drops what it put in a
 * `t.after`. Refuses a source with no `kept` before its `subscribed`.
 */
const unkept = (source: string): { puts: number; drops: boolean } => {
  const begin = source.indexOf('const kept = ');
  const end = source.indexOf('const subscribed = ', begin);
  assert.ok(begin >= 0 && end > begin, 'the helper kept, then subscribed, in the file');
  const body = source.slice(begin, end);
  const outside = source.slice(0, begin) + source.slice(end);
  return {
    puts: outside.match(/putSubscription\s*\(/g)?.length ?? 0,
    drops: /t\.after\(\s*\(\)\s*=>\s*\{[^}]*dropSubscription\(\s*name\s*\)/.test(body),
  };
};

test('REFUSED: every subscription a test here puts is put through kept, which drops it once the test ends, whatever its verdict', () => {
  const source = fs.readFileSync(import.meta.filename, 'utf8');
  assert.deepEqual(unkept(source), { puts: 0, drops: true });
  const put = ['putSubscription', "('loose', {});"].join('');
  assert.deepEqual(unkept(`${source}\n${put}\n`), { puts: 1, drops: true }, 'a subscription put by hand is refused');
  const undropped = source.replace(/t\.after\(\s*\(\)\s*=>\s*\{[^}]*dropSubscription\(\s*name\s*\);?\s*\}\);/, '');
  assert.notEqual(undropped, source, 'the fixture took the drop out');
  assert.deepEqual(unkept(undropped), { puts: 0, drops: false }, 'a kept that drops nothing is refused');
});
