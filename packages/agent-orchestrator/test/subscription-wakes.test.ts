/**
 * A subscription waking a long-lived task, told as a person's stories on the stage (`story.ts`): the deliverer (`deliver`) runs on the
 * stage's clock, which no real time moves, at its shipped pace — the subscriptions read again every five seconds, each feed followed on
 * a beat of one second, a digest asked after every thirty, a failed `say` said again after a backoff from one second doubling to five
 * minutes — each written below as a literal, and moved a millisecond short, then the millisecond. Its task is one the engine's stand-in
 * holds, long-lived and at work, and what it is told is what the stand-in's `say` was asked.
 *
 * One say per read, the digest riding a wake, a gate's lines and several gates in one message, routine lines that wait for their
 * digest, a restart that neither drops nor repeats a line, one between a say and its cursor that says it again, an unsubscribe, a name
 * subscribed again and a feed cut under the cursor; a failed say said again on its backoff, its cursor held; the hub's lines, and those
 * published while a say is in flight gathered; a digest alone once due; and a floor's scope, a daemon's line and the store's carried by
 * every one.
 * What a line means for a subscriber and the words it is told are `src/subscription/subscription.test.ts`'s, pure; the verbs' refusals
 * `subscription.verb.test.ts`'s.
 *
 * A store of its own, since `WF_ROOT` is read as the module loads; every subscription a story puts goes through `kept`, which drops it
 * once the test ends whatever its verdict, so no story's deliverer follows another's.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Clock, Effect, Fiber, Layer, Logger, ManagedRuntime, Metric } from 'effect';
import { bell, until, WAITED } from 'agent-runtime/testing';
import type { FeedLine, FeedWords } from '../src/feed/feed.ts';
import { scratch } from './scratch.ts';
import { StoreRoot } from '../src/config/root.store.ts';
import { staged, story } from './story.ts';
import { names } from './assessed.ts';

const ROOT = scratch('wf-subscription-wakes-');
process.env.WF_ROOT = ROOT;
const { SUBSCRIPTION_DIGEST_CHECKS, deliver } = await import('../src/subscription/deliver.verb.ts');
const { deliveryFileAt, dropSubscription, putSubscription, readDelivery, subscriptionFileAt, writeDelivery, listSubscriptions } =
  await import('../src/subscription/subscription.store.ts');
const deliveryFile = (name: string) => deliveryFileAt(ROOT, name);
const subscriptionFile = (name: string) => subscriptionFileAt(ROOT, name);
const { StoreRoot } = await import('../src/config/root.store.ts');
const { DEFAULT_SELECTORS } = await import('../src/subscription/subscription.ts');
const { DAEMON_STARTED, isRunLine, upgraded } = await import('../src/feed/feed.ts');
const { feedFile, feedSize, readFeed } = await import('../src/feed/feed.store.ts');
const { emitFeed, FEED_FOLLOW_LINES, FEED_FOLLOWERS, feedHubLayer } = await import('../src/feed/feed.verb.ts');
const { addFactory } = await import('../src/factory/factory.store.ts');
const { writeFactoryLevel } = await import('../src/level/level.store.ts');
const { over, engineOf } = await import('../src/runtime-client.ts');
const { RunDoor } = await import('../src/runs/runs.store.ts');
const { runDoorMemory } = await import('../src/runs/memory.store.ts');
const { runWith } = await import('../src/runner.ts');
const { main } = await import('../src/cli/main.ts');
const stage = staged({ runWith, main, engineOf });

/** A wait on what the deliverer did, asked as the clock moves and as a task is asked to hear. */
const heard = bell();

/**
 * The deliverer's engine for this test: the stage's, whose `say` is counted — each message asked, by task, with the steered instant it
 * was asked at — and, for a task in `hanging`, told once and never answered, as a deliverer stopped between a say and its cursor.
 */
const engineFor = () => {
  const b = stage.board();
  const asked: { taskId: string; text: string; at: number }[] = [];
  const hanging = new Set<string>();
  const e = {
    ...b.e,
    say: (taskId: string, text: string) =>
      Effect.gen(function* () {
        asked.push({ taskId, text, at: yield* Clock.currentTimeMillis });
        heard.ring();
        const said = yield* b.e.say(taskId, text);
        if (hanging.delete(taskId)) return yield* Effect.never;
        return said;
      }),
  };
  return { e, asked, hanging };
};

/** A long-lived task at work on the stand-in, as a subscription is put for: filed `restartPolicy: Always`, its attempt started. */
const longLived = async (id: string): Promise<string> => {
  await Effect.runPromise(stage.board().e.file({ id, brief: `the task ${id}`, cwd: ROOT, restartPolicy: 'Always' }));
  stage.board().settle(id, 'working');
  return id;
};

/** What the task `id` was told, in order: each message the stand-in's `say` took. */
const toldTo = (id: string): string[] =>
  stage
    .board()
    .said.filter((s) => s.taskId === id)
    .map((s) => s.text);

/** The lines of a message told, each a line of the feed, between its heading and the digest riding it. */
const wakesIn = (message: string): string[] => message.split('\n\n')[0].split('\n').slice(1);

/** The fields of each line of a message after its time, joined by a space. */
const fieldsOf = (message: string, from = 2, to?: number): string[] => wakesIn(message).map((l) => l.split('  ').slice(from, to).join(' '));

/** A line of the feed about `run`, at its `build` step. */
const line = (run: string, word: string) => ({ at: new Date().toISOString(), run, step: 'build', word });

/** `lines` written at the end of the feed, as the tick writes them. */
const appended = (...lines: object[]): void => fs.appendFileSync(feedFile(), lines.map((l) => `${JSON.stringify(l)}\n`).join(''));

/** A gate's two lines at one instant, as the tick writes them: the run's, waiting on a person, then its step's at `land`. */
const gate = (run: string): object[] => {
  const at = new Date().toISOString();
  return [
    { at, run, word: 'awaiting approval', note: 'waiting on you: approve land' },
    { at, run, step: 'land', word: 'awaiting approval', note: `approve it: nemia approve ${run} land` },
  ];
};

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

/**
 * The deliverer over `e` on the stage's clock, in a runtime of `layer`'s where one is given: started, and stopped once test `t` ends.
 * `rests()` is how many of the clock's rests are asked and not yet woken; `quiet(n)` waits until `n` are, each of its fibers at rest — the
 * subscriptions' read, and each subscription's digest check and beat; `cut(n)` takes away the `n` rests of a subscription's deliverer the
 * deliverer stopped itself, as one gone is stopped, never woken. Given `runs`, a Run door's layer, the deliverer reads a run's factory
 * there rather than off the files.
 */
const delivering = (
  t: TestContext,
  e: Parameters<typeof over>[0],
  rt?: ManagedRuntime.ManagedRuntime<never, never>,
  runs: Layer.Layer<never> = Layer.empty,
) => {
  const clock = stage.clock();
  let fiber: Fiber.Fiber<never> | undefined;
  let stopped = 0;
  const start = () => {
    const program = over(e)(deliver()).pipe(
      Effect.provide(clock.layer),
      Effect.provide(Logger.layer([])),
      Effect.provide(runs),
      Effect.provideService(StoreRoot, ROOT),
    );
    fiber = rt ? rt.runFork(program) : Effect.runFork(program);
  };
  const stop = async () => {
    const f = fiber;
    fiber = undefined;
    if (f) await Effect.runPromise(Fiber.interrupt(f));
    stopped = clock.asked.length - clock.woken.length;
  };
  t.after(stop);
  const rests = () => clock.asked.length - clock.woken.length - stopped;
  const quiet = (n: number, what = `${n} rests asked`) =>
    until(
      t,
      () => rests() === n,
      () => `${what}; ${rests()} are`,
      { bell: clock.bell, everyMs: 10 },
    );
  const cut = (n: number) => {
    stopped += n;
  };
  start();
  return { clock, start, stop, rests, quiet, cut };
};

/** Waits in test `t` until `holds` does, asked as the clock moves, as a task is asked to hear, and every 10ms for what is written. */
const held = (t: TestContext, holds: () => boolean, what: string) => until(t, holds, what, { bell: heard, everyMs: 10 });

test(
  'a subscribed task is told each read of the feed in one say, its digest riding a wake, across restarts that drop no line',
  WAITED,
  async (t) => {
    const s = story(t);
    const { e, hanging } = engineFor();
    const task = await longLived('t-once');
    let d: ReturnType<typeof delivering>;
    const beat = async (rests = 3) => {
      await d.quiet(rests);
      await d.clock.adjust('1 second');
    };
    await s.test('nemia subscribe puts the long-lived task’s subscription from the feed’s end, by the default selector', async () => {
      appended(line('r-0', 'running'));
      await stage.main(['subscribe', 'once', task]);
      t.after(() => {
        if (fs.existsSync(subscriptionFile('once'))) dropSubscription('once');
      });
      assert.deepEqual(listSubscriptions().find((x) => x.name === 'once')?.subscription, {
        task,
        selectors: [...DEFAULT_SELECTORS],
        digestEvery: 60,
        from: feedSize(),
      });
      d = delivering(t, e);
      await d.quiet(3, 'the deliverer at rest: its subscriptions, its digest and its beat');
    });
    await s.test(
      'a wake line is said once, the routine lines before it riding it as one digest, and the cursor kept once it is said',
      async () => {
        appended(line('r-1', 'running'), line('r-1', 'verified ✓'), line('r-1', 'awaiting approval'));
        await d.quiet(3, 'the deliverer at rest: its subscriptions, its digest and its beat');
        await d.clock.adjust('999 millis');
        assert.deepEqual(toldTo(task), [], 'a millisecond before its beat, the feed is not read');
        await d.clock.adjust('1 millis');
        await held(t, () => toldTo(task).length === 1, 'the wake said on the beat');
        const [first] = toldTo(task);
        assert.deepEqual(fieldsOf(first), ['r-1 build awaiting approval']);
        names(first, 'Since your last news:', '2 routine lines', 'r-1  build  running', 'r-1  build  verified ✓');
        assert.ok(first.startsWith('The feed needs your judgement:\n'), first);
        assert.ok(first.indexOf('r-1  build  running') < first.indexOf('r-1  build  verified ✓'), 'the digest in feed order');
        appended(line('r-2', 'rounds exhausted'));
        await beat();
        await held(t, () => toldTo(task).length === 2, 'the next wake said');
        assert.doesNotMatch(toldTo(task)[1], /r-1|Since your last news/, 'neither the first wake nor its digest again');
        await held(t, () => readDelivery('once')?.cursor === feedSize(), 'the cursor at the end of the feed');
        assert.deepEqual(readDelivery('once')?.digest, []);
      },
    );
    await s.test("REFUSED: one gate's two lines are one say, holding both in feed order", async () => {
      appended(...gate('r-20'));
      await beat();
      await held(t, () => readDelivery('once')?.cursor === feedSize(), 'the cursor at the end of the feed');
      assert.equal(toldTo(task).length, 3, 'one say for one gate');
      assert.deepEqual(fieldsOf(toldTo(task)[2]), [
        'r-20 — awaiting approval · waiting on you: approve land',
        'r-20 land awaiting approval · approve it: nemia approve r-20 land',
      ]);
    });
    await s.test('three gates in one read: one say, their lines in feed order, with the digest once', async () => {
      appended(line('r-21', 'running'), ...gate('r-22'), ...gate('r-23'), ...gate('r-24'));
      await beat();
      await held(t, () => readDelivery('once')?.cursor === feedSize(), 'the cursor at the end of the feed');
      assert.equal(toldTo(task).length, 4, 'one say for one read');
      const said = toldTo(task)[3];
      assert.deepEqual(fieldsOf(said, 2, 4), ['r-22 —', 'r-22 land', 'r-23 —', 'r-23 land', 'r-24 —', 'r-24 land']);
      assert.equal(said.split('Since your last news:').length, 2, 'the digest said once');
      names(said.split('Since your last news:')[1], '1 routine line of the feed:', 'r-21  build  running');
      assert.deepEqual(readDelivery('once')?.digest, []);
    });
    await s.test(
      'a digest not yet due is not said: its routine lines wait for their minutes over its checks, or ride the next wake',
      async () => {
        appended(line('r-11', 'running'), line('r-11', 'verified ✓'));
        await beat();
        await held(t, () => readDelivery('once')?.digest.length === 2, 'both routine lines folded');
        const checks = digestChecks();
        for (let i = 0; i < 2; i++) {
          await d.quiet(3);
          await d.clock.adjust('30 seconds');
        }
        await held(t, () => digestChecks() >= checks + 2, 'two digest checks done after they were folded');
        assert.equal(toldTo(task).length, 4, 'nothing said before the digest is due');
        appended(line('r-11', 'awaiting approval'));
        await beat();
        await held(t, () => toldTo(task).length === 5, 'the wake said');
        names(toldTo(task)[4], 'Since your last news:', '2 routine lines');
      },
    );
    await s.test('a restart reads where the deliverer was off its file: no line said again, none dropped', async () => {
      appended(line('r-4', 'failed ✗ check (exit 1)'));
      await beat();
      await held(t, () => toldTo(task).length === 6, 'the first wake said');
      appended(line('r-4', 'running'));
      await beat();
      await held(t, () => readDelivery('once')?.digest.length === 1, 'the routine line folded');
      await d.stop();
      appended(line('r-5', 'awaiting approval'));
      d.start();
      await held(t, () => toldTo(task).length === 7, 'the wake written while it was down said, read off its file as it starts');
      const second = toldTo(task)[6];
      assert.deepEqual(fieldsOf(second), ['r-5 build awaiting approval']);
      names(second.split('Since your last news:')[1], '1 routine line of the feed:', 'r-4  build  running');
      assert.doesNotMatch(second, /failed/, 'the first wake not said again');
    });
    await s.test('a restart between a say and its cursor write says the message again: at least once, never dropped', async () => {
      await held(t, () => readDelivery('once')?.cursor === feedSize(), 'the cursor at the end of the feed');
      const from = feedSize();
      hanging.add(task);
      appended(line('r-26', 'awaiting approval'), line('r-27', 'blocked'));
      await beat();
      await held(t, () => toldTo(task).length === 8, 'told once, its say never resolving');
      await d.stop();
      assert.equal(readDelivery('once')?.cursor, from, 'the cursor never moved: the say did not resolve');
      d.start();
      await held(t, () => readDelivery('once')?.cursor === feedSize(), 'the cursor at the end of the feed');
      const [first, again] = toldTo(task).slice(7);
      assert.equal(toldTo(task).length, 9, 'said again once the restarted deliverer read from its cursor');
      assert.equal(again, first, 'the same message, whole');
      assert.deepEqual(fieldsOf(first), ['r-26 build awaiting approval', 'r-27 build blocked']);
    });
    await s.test('a feed cut under the cursor is read again from its start', async () => {
      fs.writeFileSync(feedFile(), `${JSON.stringify(line('r-10', 'blocked'))}\n`);
      await beat();
      await held(t, () => toldTo(task).length === 10, 'the cut feed read again from its start');
      assert.deepEqual(fieldsOf(toldTo(task)[9]), ['r-10 build blocked']);
      await held(t, () => readDelivery('once')?.cursor === feedSize(), 'the cursor at the end of the new feed');
    });
    await s.test('an unsubscribe stops delivery, and the deliverer drops its file once it reads the subscriptions again', async () => {
      const staying = await longLived('t-staying');
      subscribed(t, 'staying', staying);
      await d.stop();
      d.start();
      await d.quiet(5, 'the deliverer started again at rest with both subscriptions, its subscriptions read as it starts');
      await stage.main(['unsubscribe', 'once']);
      await d.clock.adjust('4999 millis');
      assert.equal(fs.existsSync(deliveryFile('once')), true, 'a millisecond before the subscriptions are read again, its file stands');
      await d.clock.adjust('1 millis');
      await held(
        t,
        () => !fs.existsSync(deliveryFile('once')),
        'the deliverer drops a file whose subscription is gone, once it has stopped it',
      );
      d.cut(2);
      appended(line('r-8', 'awaiting approval'));
      await beat();
      await held(t, () => toldTo(staying).length === 1, 'the one staying told');
      assert.equal(toldTo(task).length, 10, 'the one gone told nothing more');
    });
    await s.test(
      "a name subscribed again starts from its own from: a deliverer's file written for the last one under it is not its",
      async () => {
        await d.stop();
        appended(line('r-12', 'awaiting approval'));
        const from = subscribed(t, 'once', task);
        writeDelivery('once', { of: { task, from: 0 }, cursor: 0, digest: [line('r-12', 'running')] });
        d.start();
        await d.quiet(5);
        appended(line('r-13', 'blocked'));
        await d.clock.adjust('1 second');
        await held(t, () => toldTo(task).length === 11, 'the wake after its from said');
        const said = toldTo(task)[10];
        assert.deepEqual(fieldsOf(said), ['r-13 build blocked']);
        assert.doesNotMatch(said, /r-12|Since your last news/, "neither a line before its from nor the last one's digest");
        await held(t, () => readDelivery('once')?.of.from === from, 'its own file written');
      },
    );
  },
);

/** The shipped backoff of a failed say, a try at a time: from one second doubling, and never longer than five minutes. */
const BACKOFF = [1000, 2000, 4000, 8000, 16_000, 32_000, 64_000, 128_000, 256_000, 300_000, 300_000, 300_000];

test(
  'a say that fails is said again whole after a backoff doubling from one second to five minutes, the cursor held until it is taken',
  WAITED,
  async (t) => {
    const s = story(t);
    const { e, asked } = engineFor();
    const task = await longLived('t-held');
    subscribed(t, 'held', task);
    const d = delivering(t, e);
    const tries = () => asked.filter((a) => a.taskId === task);
    let before: ReturnType<typeof readDelivery>;
    await s.test('a routine line is folded into the digest, and nothing said', async () => {
      await d.quiet(3);
      appended(line('r-6', 'running'));
      await d.clock.adjust('1 second');
      await held(t, () => readDelivery('held')?.digest.length === 1, 'the routine line folded');
      before = readDelivery('held');
      assert.deepEqual(tries(), []);
    });
    await s.test('each failed say is said again a backoff later, from one second doubling, never longer than five minutes', async () => {
      await d.stop();
      stage.board().refuseSay(12);
      appended(line('r-6', 'blocked'), line('r-6', 'running'), line('r-6b', 'failed ✗ check (exit 1)'));
      let mark = d.clock.asked.length;
      d.start();
      await held(t, () => tries().length === 1, 'the read as it starts said, and refused');
      await until(t, () => d.clock.asked.slice(mark).filter((ms) => ms === 1000).length >= 2, 'its beat and the backoff asked', {
        bell: d.clock.bell,
      });
      for (const [k, ms] of BACKOFF.entries()) {
        if (k > 0) await until(t, () => d.clock.asked.slice(mark).includes(ms), `the backoff of ${ms}ms asked`, { bell: d.clock.bell });
        if (k === BACKOFF.length - 1)
          assert.deepEqual(readDelivery('held'), before, 'neither the cursor nor the digest moved while say fails');
        await d.clock.adjust(ms - 1);
        assert.equal(tries().length, k + 1, `a millisecond before the backoff of ${ms}ms, no try`);
        mark = d.clock.asked.length;
        await d.clock.adjust(1);
        await held(t, () => tries().length === k + 2, `said again after ${ms}ms`);
      }
      const at = tries().map((a) => a.at);
      assert.deepEqual(
        at.slice(1).map((ms, i) => ms - at[i]),
        BACKOFF,
      );
    });
    await s.test('said once say takes it, the cursor kept after it, every try the message whole and the same', async () => {
      await held(t, () => toldTo(task).length === 1, 'said once say takes it');
      await held(t, () => readDelivery('held')?.cursor === feedSize(), 'the cursor kept after it');
      const [said] = toldTo(task);
      assert.deepEqual(new Set(tries().map((a) => a.text)), new Set([said]), 'every try said the message whole, and the same');
      assert.deepEqual(fieldsOf(said), ['r-6 build blocked', 'r-6b build failed ✗ check (exit 1)']);
      const digest = said.split('Since your last news:')[1];
      names(digest, '2 routine lines of the feed:');
      assert.equal(digest.split('r-6  build  running').length, 3, 'the folded line and the one of the read');
    });
  },
);

test(
  "the process's hub: a gate published is one say as the daemon delivers it, and lines published while a say is in flight are gathered",
  WAITED,
  async (t) => {
    const s = story(t);
    const { e, asked } = engineFor();
    const rt = ManagedRuntime.make(Layer.mergeAll(feedHubLayer(), Logger.layer([]), StoreRoot.layer(ROOT)));
    t.after(() => rt.dispose());
    const following = () => Effect.runSync(Metric.value(FEED_FOLLOWERS)).value;
    const handed = () => Effect.runSync(Metric.value(FEED_FOLLOW_LINES)).count;
    const published = (run: string, judged: FeedWords) =>
      rt.runPromise(
        emitFeed(new Map([[run, judged]]), {
          unjudged: new Set(
            readFeed()
              .lines.filter(isRunLine)
              .map((l) => l.run),
          ),
        }),
      );
    const awaiting = { run: { word: 'awaiting approval', note: 'waiting on you: approve land' }, steps: [] };
    let d: ReturnType<typeof delivering>;
    await s.test("a gate published to the process's hub is one say, with no beat to wait for", async () => {
      const task = await longLived('t-hub');
      subscribed(t, 'hub', task);
      const was = following();
      d = delivering(t, e, rt);
      await held(t, () => following() > was, 'the deliverer following the hub');
      await d.quiet(3);
      await published('r-25', { run: awaiting.run, steps: [{ name: 'land', word: 'awaiting approval' }] });
      await held(t, () => readDelivery('hub')?.cursor === feedSize(), 'the cursor at the end of the feed');
      assert.equal(toldTo(task).length, 1, 'one say for the pass');
      assert.deepEqual(fieldsOf(toldTo(task)[0], 2, 4), ['r-25 —', 'r-25 land']);
    });
    await s.test(
      'REFUSED: the lines published while a say is in flight are gathered: one more say holds them all, in feed order',
      async () => {
        await d.stop();
        dropSubscription('hub');
        const task = await longLived('t-busy');
        subscribed(t, 'busy', task);
        const was = following();
        d.start();
        await held(t, () => following() > was, 'the deliverer following the hub');
        await d.quiet(3);
        stage.board().refuseSay(1);
        await published('r-40', awaiting);
        await held(t, () => asked.filter((a) => a.taskId === task).length >= 1, 'the first message asked, its say refused');
        const mark = handed();
        await published('r-41', awaiting);
        await held(t, () => handed() >= mark + 1, 'r-41 handed on by the reader');
        await published('r-42', awaiting);
        await held(t, () => handed() >= mark + 2, 'r-42 handed on by the reader');
        await until(t, () => d.clock.asked.at(-1) === 1000, 'the backoff asked', { bell: d.clock.bell });
        await d.clock.adjust('1 second');
        await held(t, () => readDelivery('busy')?.cursor === feedSize() && toldTo(task).length === 2, 'the cursor at the end of the feed');
        assert.deepEqual(
          toldTo(task).map((said) => wakesIn(said).map((l) => l.split('  ')[2])),
          [['r-40'], ['r-41', 'r-42']],
          'the first message alone, then one say for both lines that came while it was in flight',
        );
      },
    );
  },
);

test(
  'a digest falls due after its minutes with no wake, said alone; the deliverer’s own pace, at its shipped durations',
  WAITED,
  async (t) => {
    const s = story(t);
    const { e } = engineFor();
    let d: ReturnType<typeof delivering>;
    await s.test('a digest due is said alone, as the deliverer starts, then emptied', async () => {
      const task = await longLived('t-quiet');
      const from = subscribed(t, 'quiet', task);
      const folded = line('r-3', 'verified ✓');
      writeDelivery('quiet', { of: { task, from }, cursor: from, digest: [folded], since: { at: Date.now() - 61 * 60_000 } });
      d = delivering(t, e);
      await held(t, () => toldTo(task).length === 1, 'the digest said');
      const [said] = toldTo(task);
      names(said, 'News from the feed, nothing waiting on you:', '1 routine line of the feed:', 'r-3  build  verified ✓');
      await held(t, () => readDelivery('quiet')?.digest.length === 0, 'the digest emptied');
    });
    await s.test(
      'REFUSED: a subscription written after a read is not delivered before five seconds, nor its digest asked again before thirty',
      async () => {
        await d.stop();
        dropSubscription('quiet');
        const mark = d.clock.asked.length;
        const since = () => d.clock.asked.slice(mark);
        const rests = (ms: number) => since().filter((asked) => asked === ms).length;
        d.start();
        await until(t, () => since().length === 1, 'the first read of the subscriptions done', { bell: d.clock.bell });
        assert.deepEqual(since(), [5000], 'the subscriptions are read again after the shipped five seconds');
        const woke = d.clock.woken.length;
        const checks = digestChecks();
        subscribed(t, 'steered', await longLived('t-steered'));
        await d.clock.adjust('4999 millis');
        assert.deepEqual([d.clock.woken.slice(woke), digestChecks()], [[], checks], 'a millisecond early, no read and no deliverer');
        await d.clock.adjust('1 millis');
        await until(t, () => rests(30_000) === 1, 'its deliverer at rest after its first digest check', { bell: d.clock.bell });
        assert.equal(digestChecks(), checks + 1);
        await d.clock.adjust('29999 millis');
        assert.deepEqual([digestChecks(), rests(30_000)], [checks + 1, 1], 'a millisecond early, no second check');
        await d.clock.adjust('1 millis');
        await until(t, () => rests(30_000) === 2, 'its second digest check done', { bell: d.clock.bell });
        assert.equal(digestChecks(), checks + 2);
      },
    );
  },
);

/** Plants the run `id`'s record through the Run door `door`, started in the factory `factory`: the deliverer reads it for its level. */
const plantRun = (door: Layer.Layer<never>, id: string, factory: string) =>
  Effect.runPromise(
    Effect.provide(
      Effect.flatMap(RunDoor, (d) =>
        d.runs.create({
          id,
          workspace: ROOT,
          brief: `The brief of ${id}`,
          createdAt: '2026-10-06T08:00:00.000Z',
          workflowDir: path.join(ROOT, 'no-such-workflow'),
          place: { kind: 'folder' },
          workflow: [{ name: 'build', after: [], body: 'Build it.', harness: 'codex' }],
          steps: {},
          factory,
        }),
      ),
      door,
    ),
  );

test(
  "a subscription scoped by a floor is told only of the runs of factories at it or above, and every one carries a daemon's line and the store's",
  WAITED,
  async (t) => {
    const s = story(t);
    const { e } = engineFor();
    const door = runDoorMemory();
    let d: ReturnType<typeof delivering>;
    await s.test(
      'REFUSED: a subscription scoped by a floor is told nothing of a run whose factory is below it; one unscoped is told of both',
      async () => {
        for (const name of ['pipao', 'hkb']) addFactory({ name, repos: [fs.mkdtempSync(path.join(ROOT, `${name}-`))] });
        writeFactoryLevel('hkb', { level: 'semi-auto', since: '2026-10-06T08:00:00.000Z' });
        await plantRun(door, 'r-pipao', 'pipao');
        await plantRun(door, 'r-hkb', 'hkb');
        const from = feedSize();
        const floored = await longLived('t-floored');
        const everything = await longLived('t-everything');
        kept(t, 'floored', { task: floored, selectors: [...DEFAULT_SELECTORS], digestEvery: 60, from, scope: { atLeast: 'semi-auto' } });
        kept(t, 'everything', { task: everything, selectors: [...DEFAULT_SELECTORS], digestEvery: 60, from });
        d = delivering(t, e, undefined, door);
        await d.quiet(5);
        appended(line('r-pipao', 'running'), line('r-pipao', 'awaiting approval'), line('r-gone', 'awaiting approval'));
        appended(line('r-hkb', 'awaiting approval'));
        await d.clock.adjust('1 second');
        const wakesTold = () =>
          toldTo(everything)
            .flatMap(wakesIn)
            .filter((l) => l.includes('awaiting approval')).length;
        await held(t, () => wakesTold() === 3, 'every wake said to the one unscoped');
        await held(t, () => readDelivery('floored')?.cursor === feedSize(), "the floored one's cursor past every line");
        assert.equal(toldTo(floored).length, 1);
        assert.deepEqual(fieldsOf(toldTo(floored)[0]), ['r-hkb build awaiting approval']);
        assert.equal(toldTo(floored)[0].includes('Since your last news'), false);
        assert.ok(toldTo(floored)[0].startsWith('The feed needs your judgement:\n'));
        assert.deepEqual(readDelivery('floored')?.digest, [], 'a line below the floor is not folded either');
      },
    );
    await s.test(
      'a daemon’s line is carried by every subscription, scoped or not: routine in a digest kept on disk, a wake where it names daemon',
      async () => {
        await d.stop();
        dropSubscription('floored');
        dropSubscription('everything');
        const from = feedSize();
        const scoped = await longLived('t-scoped-d');
        const woken = await longLived('t-woken-d');
        kept(t, 'scoped-d', { task: scoped, selectors: [...DEFAULT_SELECTORS], digestEvery: 60, from, scope: { atLeast: 'semi-auto' } });
        kept(t, 'woken-d', { task: woken, selectors: ['kind=Daemon'], digestEvery: 60, from });
        d.start();
        await d.quiet(5);
        const started: FeedLine = { at: new Date().toISOString(), daemon: 5151, word: DAEMON_STARTED, note: 'first daemon on this store' };
        appended(started);
        await d.clock.adjust('1 second');
        await held(t, () => toldTo(woken).length === 1, 'the subscriber that names daemon woken');
        assert.deepEqual(
          wakesIn(toldTo(woken)[0]).map((l) => l.split('  ').slice(2).join(' ')),
          ['pid 5151 daemon started · first daemon on this store'],
        );
        await held(t, () => readDelivery('scoped-d')?.cursor === feedSize(), "the scoped one's cursor past the line");
        assert.deepEqual(
          readDelivery('scoped-d')?.digest,
          [upgraded(started)],
          'folded into its digest, and read back off its file, upgraded',
        );
        assert.equal(toldTo(scoped).length, 0, 'routine by the default words');
      },
    );
    await s.test(
      'the store’s line is carried by every subscription as a daemon’s is: routine in a scoped digest, a wake where it names kind=Store',
      async () => {
        await d.stop();
        dropSubscription('scoped-d');
        dropSubscription('woken-d');
        const from = feedSize();
        const scoped = await longLived('t-scoped-s');
        const woken = await longLived('t-woken-s');
        kept(t, 'scoped-s', { task: scoped, selectors: [...DEFAULT_SELECTORS], digestEvery: 60, from, scope: { atLeast: 'semi-auto' } });
        kept(t, 'woken-s', { task: woken, selectors: ['kind=Store'], digestEvery: 60, from });
        d.start();
        await d.quiet(5);
        const at = new Date().toISOString();
        const paused: FeedLine = { at, store: 'store', word: 'store paused', note: `since ${at}` };
        appended(paused);
        await d.clock.adjust('1 second');
        await held(t, () => toldTo(woken).length === 1, 'the subscriber that names the store woken');
        assert.equal(wakesIn(toldTo(woken)[0]).length, 1);
        assert.ok(wakesIn(toldTo(woken)[0])[0].includes(`store paused  · since ${at}`), toldTo(woken)[0]);
        await held(t, () => readDelivery('scoped-s')?.cursor === feedSize(), "the scoped one's cursor past the line");
        assert.deepEqual(readDelivery('scoped-s')?.digest, [upgraded(paused)], 'a line of no factory is no line below the floor');
        assert.equal(toldTo(scoped).length, 0, 'routine by the default words');
      },
    );
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

test('REFUSED: every subscription a story here puts is put through kept, which drops it once the test ends, whatever its verdict', () => {
  const source = fs.readFileSync(import.meta.filename, 'utf8');
  assert.deepEqual(unkept(source), { puts: 0, drops: true });
  const put = ['putSubscription', "('loose', {});"].join('');
  assert.deepEqual(unkept(`${source}\n${put}\n`), { puts: 1, drops: true }, 'a subscription put by hand is refused');
  const undropped = source.replace(/t\.after\(\s*\(\)\s*=>\s*\{[^}]*dropSubscription\(\s*name\s*\);?\s*\}\);/, '');
  assert.notEqual(undropped, source, 'the fixture took the drop out');
  assert.deepEqual(unkept(undropped), { puts: 0, drops: false }, 'a kept that drops nothing is refused');
});
