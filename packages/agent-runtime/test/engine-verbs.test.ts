/**
 * The engine's verbs, driven as a caller of `agent-runtime` drives them: the `Engine` service built over a store and a harness of the
 * caller's own, here written in plain async and made the runtime's by `asyncStore` and `asyncOps` (`test/promise-runner.ts`), each
 * verb run with `Effect.runPromise`. The file store by default; `start` and `watch` holding their host process open; and what the
 * layer and `tick` refuse, each a tagged error. What `file` refuses and takes is `test/refusal.test.ts`'s.
 */
import { Effect } from 'effect';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { codex, nameFor, type EngineOptions, type Event, type FeedEntry, type Sighting } from '../src/index.ts';
import { Engine as EngineService } from '../src/index.ts';
import { scratch } from './scratch.ts';
import { asyncStore, asyncOps, type AsyncJournal, type AsyncRunner } from './promise-runner.ts';
import { builtEngine } from './engine.ts';
import { story } from './checkpoints.ts';
import { bell, until, WAITED, type Waiter } from '../src/waits/index.ts';

/** A store in twelve lines of plain async — what an application with its own database writes. */
const memoryJournal = (): AsyncJournal => {
  const tasks = new Map<string, Event[]>();
  const feed: FeedEntry[] = [];
  return {
    async append(taskId, event) {
      tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]);
      feed.push({ taskId, event });
    },
    async read(taskId) {
      return [...(tasks.get(taskId) ?? [])];
    },
    async list() {
      return [...tasks.keys()].sort();
    },
    async feed(after) {
      return { entries: feed.slice(after), cursor: feed.length };
    },
  };
};

/** A harness in eight. */
const fakeHarness = (sessions: Map<string, Sighting>): AsyncRunner => ({
  async spawn(r) {
    sessions.set(r.name, { sessionId: `s-${sessions.size + 1}`, state: 'working' });
  },
  async observe() {
    return new Map(sessions);
  },
  async stop(id) {
    for (const [n, s] of sessions) if (s.sessionId === id) sessions.set(n, { ...s, state: 'canceled' });
  },
  async logs() {
    return 'fake logs';
  },
});

/** The engine over a store in memory and `harness`, its default. */
const engineOver = (harness: AsyncRunner) =>
  builtEngine(
    EngineService.layer({
      root: scratch('ae-engine-verbs-root-'),
      journal: asyncStore(memoryJournal()),
      harnesses: { fake: asyncOps(harness) },
      defaultHarness: 'fake',
    }),
  );

/** Every session listed completed: the harness has finished the work. */
const complete = (sessions: Map<string, Sighting>) => {
  for (const [k, v] of sessions) sessions.set(k, { ...v, state: 'completed' });
};

test('a consumer runs a task through its whole life in plain async/await, and builds a workflow on the feed, with no Effect anywhere', async (t) => {
  const s = story(t);
  const sessions = new Map<string, Sighting>();
  const engine = engineOver(fakeHarness(sessions));
  const live: string[] = [];
  const delivered = bell();
  const watcher = Effect.runSync(
    engine.watch({
      onEntry: (e) => {
        live.push(e.event.kind);
        delivered.ring();
      },
      intervalMs: 20,
    }),
  );
  let id = '';

  try {
    await s.test('filed, the task is pending', async () => {
      id = await Effect.runPromise(engine.file({ brief: 'do the thing', cwd: '/repo' }));
      assert.equal((await Effect.runPromise(engine.view(id))).phase, 'pending');
    });

    await s.test('a pass starts it: running, one session', async () => {
      await Effect.runPromise(engine.tick());
      assert.equal((await Effect.runPromise(engine.view(id))).phase, 'working');
      assert.equal(sessions.size, 1);
    });

    await s.test('the harness finishing it settles it succeeded: the engine found out by asking', async () => {
      complete(sessions);
      await Effect.runPromise(engine.tick());
      assert.equal(
        (await Effect.runPromise(engine.view(id))).phase,
        'succeeded',
        'the harness finished the work, and the engine found out by asking',
      );
    });

    await s.test('a watcher started before the filing delivered every event, in order, once', async (sub) => {
      await until(
        sub,
        () => live.length >= 5,
        () => `five entries; saw ${live.join(', ') || 'none'}`,
        { bell: delivered },
      );
      await new Promise((r) => setTimeout(r, 100));
      assert.deepEqual(live, ['filed', 'starting', 'spawned', 'ended', 'settled'], 'in order, no repeats');
    });
  } finally {
    watcher.stop();
  }

  const filed: string[] = [];
  await s.test('the settled event in the feed drives a follow-up task', async () => {
    const { entries } = await Effect.runPromise(engine.feed(0));
    for (const { taskId, event } of entries) {
      if (event.kind === 'settled' && event.outcome === 'succeeded') {
        filed.push(await Effect.runPromise(engine.file({ brief: `review ${taskId}`, cwd: '/repo' })));
      }
    }
    assert.equal(filed.length, 1, 'the settled event drove a follow-up task');
    assert.notEqual(filed[0], id);
  });

  await s.test('a watcher starting at 0 replays the history — the cursor never expires — and stop() stops it', async (sub) => {
    const seen: string[] = [];
    const heard = bell();
    const w = Effect.runSync(
      engine.watch({
        onEntry: (e) => {
          seen.push(e.event.kind);
          heard.ring();
        },
        intervalMs: 20,
      }),
    );
    try {
      await until(
        sub,
        () => seen.length >= 6,
        () => `six entries; saw ${seen.join(', ') || 'none'}`,
        { bell: heard },
      );
    } finally {
      w.stop();
    }
    assert.deepEqual(seen, ['filed', 'starting', 'spawned', 'ended', 'settled', 'filed'], 'the cursor never expires — it replays');
    const before = seen.length;
    await Effect.runPromise(engine.file({ brief: 'another', cwd: '/r' }));
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(seen.length, before, 'nothing arrives after stop()');
  });
});

test('every task given starts, with no ceiling, counted under the harness it resolved to — named or not — and a stop cancels one', async () => {
  const sessions = new Map<string, Sighting>();
  const engine = engineOver(fakeHarness(sessions));
  for (let i = 0; i < 3; i++) await Effect.runPromise(engine.file({ brief: `e${i}`, cwd: '/r', id: `a-${i}`, harness: 'fake' }));
  for (let i = 0; i < 3; i++) await Effect.runPromise(engine.file({ brief: `i${i}`, cwd: '/r', id: `b-${i}` }));

  const report = await Effect.runPromise(engine.tick());
  assert.equal(sessions.size, 6, 'the runtime holds nothing back: a layer above files `queued: true` to');
  assert.deepEqual(
    report.running,
    { fake: 6 },
    'the engine resolves the harness at filing: three that name `fake` and three that name nothing are six under `fake`, none under "default"',
  );
  assert.equal((await Effect.runPromise(engine.list())).views.length, 6);

  await Effect.runPromise(engine.stop('a-0'));
  await Effect.runPromise(engine.tick());
  assert.equal(sessions.get(nameFor('a-0', 1))!.state, 'canceled');
});

test('the file-backed default needs no configuration: a journal and a feed on disk, a board a second engine reads, and a measure written once its value arrives', async (t) => {
  const s = story(t);
  const root = scratch('ae-verbs-');
  const sessions = new Map<string, Sighting>();
  const engine = builtEngine(EngineService.layer({ root, harnesses: { fake: asyncOps(fakeHarness(sessions)) }, defaultHarness: 'fake' }));
  let id = '';
  const measured = async () =>
    (await Effect.runPromise(engine.feed(0))).entries.filter((e) => e.taskId === id && e.event.kind === 'measured').map((e) => e.event);

  await s.test('filed and ticked, it wrote a journal and a feed', async () => {
    id = await Effect.runPromise(engine.file({ brief: 'b', cwd: '/repo' }));
    await Effect.runPromise(engine.tick());
    assert.ok(fs.existsSync(path.join(root, 'tasks', `${id}.jsonl`)), 'it wrote a journal');
    assert.ok(fs.existsSync(path.join(root, 'feed.jsonl')), 'and a feed');
  });

  await s.test('a second engine over the same root sees the same board: the state is on disk, not in memory', async () => {
    const reopened = builtEngine(
      EngineService.layer({ root, harnesses: { fake: asyncOps(fakeHarness(sessions)) }, defaultHarness: 'fake' }),
    );
    assert.equal((await Effect.runPromise(reopened.view(id))).state.brief, 'b');
  });

  await s.test(
    'a usage whose key has no value — `{ costUsd: undefined }`, which the files journal writes without the key — is nothing new to write down, on any pass',
    async () => {
      for (const [k, v] of sessions) sessions.set(k, { ...v, state: 'completed', usage: { turns: 3, costUsd: undefined } });
      for (let i = 0; i < 4; i++) await Effect.runPromise(engine.tick());
      assert.equal((await Effect.runPromise(engine.view(id))).state.settled, 'succeeded');
      assert.deepEqual(await measured(), [], 'the end already says turns, and nothing says a cost: nothing to write, on any pass');
    },
  );

  await s.test('a cost that arrives is written once, not on every pass', async () => {
    for (const [k, v] of sessions) sessions.set(k, { ...v, usage: { turns: 3, costUsd: 0.5 } });
    for (let i = 0; i < 3; i++) await Effect.runPromise(engine.tick());
    assert.equal((await measured()).length, 1, 'a cost that arrives is written once');
    assert.deepEqual((await Effect.runPromise(engine.view(id))).state.attempts[0]?.usage, { turns: 3, costUsd: 0.5 });
  });
});

/**
 * A harness whose every observation takes `ms`: one pass of `tick()` observes once, so this is a tick slower than
 * the timer. It counts the passes begun and the most ever in flight at once, and rings `begun` as each begins.
 *
 * With a pass three intervals long, the timer comes due before the pass's own wait does, and timers fire in the
 * order they come due, however late: the timer fires during every pass, and only the guard in `start()` keeps a
 * second pass out. Without that guard `most` reads 2.
 */
const slowHarness = (sessions: Map<string, Sighting>, ms: number) => {
  const fast = fakeHarness(sessions);
  const seen = { passes: 0, inFlight: 0, most: 0 };
  const begun = bell();
  const harness: AsyncRunner = {
    ...fast,
    async observe() {
      seen.passes += 1;
      seen.inFlight += 1;
      seen.most = Math.max(seen.most, seen.inFlight);
      begun.ring();
      try {
        await new Promise((r) => setTimeout(r, ms));
        return await fast.observe();
      } finally {
        seen.inFlight -= 1;
      }
    },
  };
  return { harness, seen, begun };
};

/**
 * Counts the calls of `onTick`; `wait` resolves once it has been called `n` times, in test `t`, asked again on each call. A test waits
 * for the tick it counts, as long as a starved machine needs, never for a length of time.
 */
const ticksUntil = (n: number) => {
  let ticks = 0;
  const ticked = bell();
  return {
    onTick: () => {
      ticks += 1;
      ticked.ring();
    },
    count: () => ticks,
    wait: (t: Waiter, errors: unknown[]) =>
      until(
        t,
        () => ticks >= n,
        () => `${n} tick(s); saw ${ticks}; errors: ${errors.map(String).join('; ') || 'none'}`,
        {
          bell: ticked,
        },
      ),
  };
};

/** The engine over a store in memory and a harness whose observation takes 60 ms, with one task filed; and the loop's errors. */
const slowEngine = async () => {
  const { harness, seen, begun } = slowHarness(new Map<string, Sighting>(), 60);
  const engine = engineOver(harness);
  await Effect.runPromise(engine.file({ brief: 'b', cwd: '/repo' }));
  const errors: unknown[] = [];
  return { engine, seen, begun, errors, onError: (e: unknown) => void errors.push(e) };
};

test(
  'up(): it ticks on a timer and never overlaps, and stop() lets the pass under way finish, report and be the last',
  WAITED,
  async (t) => {
    await t.test('it ticks on a timer and never overlaps', async (row) => {
      const { engine, seen, errors, onError } = await slowEngine();
      const ticks = ticksUntil(3);
      const loop = Effect.runSync(engine.up({ intervalMs: 20, onTick: ticks.onTick, onError }));
      try {
        await ticks.wait(row, errors);
      } finally {
        loop.stop();
      }

      assert.equal(ticks.count(), 3, 'three ticks, and nobody called tick()');
      assert.equal(seen.most, 1, 'two ticks ran at once');
      assert.equal(seen.passes, 3, 'every pass that began, reported');
      assert.equal(
        seen.inFlight,
        0,
        "no pass under way: stop() ran in the same turn as the third tick's report, before any timer could fire",
      );

      await new Promise((r) => setTimeout(r, 100));
      assert.equal(seen.passes, 3, 'stop() means stopped: no pass began after it');
      assert.equal(ticks.count(), 3, 'and none was reported');
      assert.deepEqual(errors, []);
    });

    await t.test(
      'a tick under way when stop() is called — its sessions spawned, its events journalled, not to be taken back — finishes, and reports, and is the last',
      async (row) => {
        const { engine, seen, begun, errors, onError } = await slowEngine();
        const ticks = ticksUntil(1);
        const loop = Effect.runSync(engine.up({ intervalMs: 20, onTick: ticks.onTick, onError }));
        try {
          await until(row, () => seen.inFlight > 0, 'a pass under way', { bell: begun });
        } finally {
          loop.stop();
        }
        assert.equal(seen.inFlight, 1, 'a pass was under way at stop()');
        assert.equal(ticks.count(), 0, 'and it has not reported yet');

        await ticks.wait(row, errors);
        await new Promise((r) => setTimeout(r, 100));
        assert.equal(ticks.count(), 1, 'the pass under way reported once');
        assert.equal(seen.passes, 1, 'and no other began');
        assert.deepEqual(errors, []);
      },
    );
  },
);

/** A `measured` line whose usage no runtime wrote, as a person's or another program's edit leaves one. */
const MISWRITTEN = JSON.stringify({ kind: 'measured', at: '2026-09-28T00:00:00Z', attempt: 1, usage: { turns: 'three' } }) + '\n';

test('a task whose journal holds an entry no runtime wrote is left out of each pass and said, naming the file, the entry and the field; every other task moves', async () => {
  const root = scratch('ae-verbs-');
  const sessions = new Map<string, Sighting>();
  const engine = builtEngine(EngineService.layer({ root, harnesses: { fake: asyncOps(fakeHarness(sessions)) }, defaultHarness: 'fake' }));
  const bad = await Effect.runPromise(engine.file({ brief: 'miswritten', cwd: '/repo' }));
  const good = await Effect.runPromise(engine.file({ brief: 'fine', cwd: '/repo' }));
  const journal = path.join(root, 'tasks', `${bad}.jsonl`);
  fs.appendFileSync(journal, MISWRITTEN);

  const first = await Effect.runPromise(engine.tick());
  assert.equal((await Effect.runPromise(engine.view(good))).phase, 'working');
  assert.deepEqual([...sessions.keys()], [nameFor(good, 1)]);
  assert.equal(first.unreadable.length, 1);
  assert.ok(
    first.unreadable[0].startsWith(
      `${bad}'s journal (${journal}), entry 2 is a \`measured\` event, and its \`usage.turns\` is "three", where the runtime writes number.`,
    ),
    first.unreadable[0],
  );

  complete(sessions);
  const second = await Effect.runPromise(engine.tick());
  assert.equal((await Effect.runPromise(engine.view(good))).phase, 'succeeded');
  assert.deepEqual(second.unreadable, first.unreadable, 'said on every pass it lasts');
  await assert.rejects(Effect.runPromise(engine.view(bad)), (e: Error) => e.message.includes(`${bad}'s journal (${journal}), entry 2`));
});

test(
  'a feed entry no runtime wrote is skipped: the pass that meets it says it once and moves on, and a watcher is told and delivers the rest',
  WAITED,
  async (t) => {
    const root = scratch('ae-verbs-');
    const sessions = new Map<string, Sighting>();
    const engine = builtEngine(EngineService.layer({ root, harnesses: { fake: asyncOps(fakeHarness(sessions)) }, defaultHarness: 'fake' }));
    const id = await Effect.runPromise(engine.file({ brief: 'b', cwd: '/repo' }));
    await Effect.runPromise(engine.tick());
    const feedFile = path.join(root, 'feed.jsonl');
    fs.appendFileSync(feedFile, JSON.stringify({ taskId: id, event: { kind: 'nudged', at: 'x' } }) + '\n');
    fs.appendFileSync(feedFile, '{"taskId":"t-cut","ev\n');
    complete(sessions);

    const meets = await Effect.runPromise(engine.tick());
    assert.equal((await Effect.runPromise(engine.view(id))).phase, 'succeeded');
    assert.equal(meets.unreadable.length, 2);
    assert.ok(
      meets.unreadable[0].startsWith(`the feed (${feedFile}), entry `) &&
        meets.unreadable[0].includes('is no event this runtime writes (its kind is "nudged"'),
      meets.unreadable[0],
    );
    assert.deepEqual((await Effect.runPromise(engine.tick())).unreadable, [], 'said once: the cursor is past it');

    const { entries, cursor, refused } = await Effect.runPromise(engine.feed(0));
    assert.equal(cursor, fs.statSync(feedFile).size);
    assert.deepEqual(
      entries.map((e) => e.event.kind),
      ['filed', 'starting', 'spawned', 'ended', 'settled'],
    );
    assert.equal(refused?.length, 2);

    const seen: string[] = [];
    const told: string[] = [];
    const entered = bell();
    const w = Effect.runSync(
      engine.watch({
        onEntry: (e) => {
          seen.push(e.event.kind);
          entered.ring();
        },
        onError: (e) => void told.push((e as Error).message),
        intervalMs: 20,
      }),
    );
    try {
      await until(
        t,
        () => seen.length >= 5,
        () => `five entries; saw ${seen.join(', ') || 'none'}`,
        { bell: entered },
      );
    } finally {
      w.stop();
    }
    assert.deepEqual(seen, ['filed', 'starting', 'spawned', 'ended', 'settled']);
    assert.deepEqual(
      told,
      refused?.map((r) => r.why),
    );
  },
);

test("watch(): a store that pushes wakes a watcher, which hears a write it did not poll for — the file store's, and a brought store's subscribe", async (t) => {
  await t.test('the file store pushes', async () => {
    const root = scratch('ae-watch-');
    const sessions = new Map<string, Sighting>();
    const engine = builtEngine(EngineService.layer({ root, harnesses: { fake: asyncOps(fakeHarness(sessions)) }, defaultHarness: 'fake' }));

    const seen: string[] = [];
    const w = Effect.runSync(
      engine.watch({
        onEntry: (e) => {
          seen.push(e.event.kind);
        },
        intervalMs: 60_000,
      }),
    );
    await new Promise((r) => setTimeout(r, 50));

    await Effect.runPromise(engine.file({ brief: 'b', cwd: '/r' }));
    await new Promise((r) => setTimeout(r, 400));
    w.stop();

    assert.deepEqual(seen, ['filed'], 'delivered without waiting for the interval');
  });

  await t.test("a brought store's subscribe wakes it, and stop() unsubscribes", async () => {
    const listeners = new Set<() => void>();
    const plain = asyncStore(memoryJournal());
    const store = {
      ...plain,
      append: (taskId: string, event: Event) =>
        plain.append(taskId, event).pipe(Effect.tap(() => Effect.sync(() => listeners.forEach((l) => l())))),
      subscribe: (onChange: () => void) => {
        listeners.add(onChange);
        return () => void listeners.delete(onChange);
      },
    };
    const engine = builtEngine(
      EngineService.layer({
        root: scratch('ae-engine-verbs-root-'),
        journal: store,
        harnesses: { fake: asyncOps(fakeHarness(new Map())) },
        defaultHarness: 'fake',
      }),
    );
    await Effect.runPromise(engine.file({ brief: 'first', cwd: '/r', id: 'first' }));

    const seen: string[] = [];
    let heard: (() => void) | undefined;
    const w = Effect.runSync(
      engine.watch({
        onEntry: (e) => {
          seen.push(e.taskId);
          heard?.();
        },
        intervalMs: 600_000,
      }),
    );
    const heardOf = (n: number) =>
      new Promise<void>((resolve, reject) => {
        const bound = setTimeout(() => reject(new Error(`heard ${seen.length} of ${n}: the store's subscribe woke nobody`)), 10_000);
        heard = () => {
          if (seen.length < n) return;
          clearTimeout(bound);
          resolve();
        };
        heard();
      });
    try {
      await heardOf(1);
      assert.equal(listeners.size, 1, 'the watcher subscribed');
      await Effect.runPromise(engine.file({ brief: 'second', cwd: '/r', id: 'second' }));
      await heardOf(2);
    } finally {
      w.stop();
    }
    assert.deepEqual(seen, ['first', 'second']);
    assert.equal(listeners.size, 0, 'stop() unsubscribes');
  });
});

/**
 * Whether a child process that runs `body` against an engine is still there after 1.2 seconds. `start()` and `watch()`
 * must hold the event loop open, and a test inside the test runner cannot see whether they do: the runner keeps its
 * own process alive. So this spawns a real child and asks from outside.
 */
const survives = (body: string) =>
  new Promise<boolean>((resolve) => {
    const root = scratch('ae-alive-');
    const child = spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
    import { Effect } from 'effect';
    import { Engine } from '${path.resolve('src/index.ts')}';
    import { builtEngine } from '${path.resolve('test/engine.ts')}';
    const root = ${JSON.stringify(root)};
    const engine = builtEngine(Engine.layer({ root }));
    ${body}
  `,
      ],
      { stdio: 'ignore' },
    );
    let exited = false;
    child.on('exit', () => {
      exited = true;
    });
    setTimeout(() => {
      const alive = !exited;
      child.kill();
      resolve(alive);
    }, 1_200);
  });

test('up() and watch() keep their host process alive — a loop that lets you exit is not a loop', async (t) => {
  const started = survives('Effect.runSync(engine.up({ intervalMs: 200 }));');
  const watching = survives(`
    const store = {
      append: () => Effect.void, read: () => Effect.succeed([]), list: Effect.succeed([]),
      feed: () => Effect.succeed({ entries: [], cursor: 0 }),
    };
    Effect.runSync(builtEngine(Engine.layer({ root, journal: store })).watch({ onEntry: () => {} }));
  `);
  await t.test('up() keeps its host process alive', async () => {
    assert.equal(await started, true);
  });
  await t.test('watch() keeps its host process alive, even with a store that cannot push', async () => {
    assert.equal(
      await watching,
      true,
      "a store with no `subscribe`, the kind a consumer brings, has only the interval to hold the loop open: the file store's fs.watch holds it by itself",
    );
  });
});

test('the engine refuses what it cannot be built from — a `maxConcurrent` that is no whole number from 1, a `pool` that is no name — and a pass handed any argument: EngineRefused and TickRefused, nothing started', async (t) => {
  for (const maxConcurrent of [0, -1, 1.5, '2', Infinity, null]) {
    await t.test(`maxConcurrent: ${String(maxConcurrent)} is refused`, () => {
      assert.throws(
        () => builtEngine(EngineService.layer({ journal: asyncStore(memoryJournal()), maxConcurrent } as unknown as EngineOptions)),
        (e: Error & { _tag?: string }) => {
          assert.equal(e._tag, 'EngineRefused', e.message);
          assert.match(
            e.message,
            /^`maxConcurrent: .*` is not a ceiling\. Give the sessions each pool may have at work at once, a whole number from 1/,
          );
          return true;
        },
      );
    });
  }
  await t.test('a whole number from 1, or none, is taken', () => {
    for (const maxConcurrent of [1, 3, undefined]) {
      assert.doesNotThrow(() =>
        builtEngine(EngineService.layer({ root: scratch('ae-engine-verbs-root-'), journal: asyncStore(memoryJournal()), maxConcurrent })),
      );
    }
  });

  const sessions = new Map<string, Sighting>();
  const badPool = [
    ['codex-pooled', { ...codex, pool: '' }],
    ['fake', { ...asyncOps(fakeHarness(sessions)), pool: 3 }],
    ['unpooled', { ...asyncOps(fakeHarness(sessions)), pool: undefined }],
    ['remote', { url: 'https://agent.example', pool: ' ' }],
  ] as const;
  for (const [name, harness] of badPool) {
    await t.test(`a pool that is not a name, on the \`${name}\` harness, is refused naming the harness`, () => {
      assert.throws(
        () =>
          builtEngine(
            EngineService.layer({
              root: scratch('ae-engine-verbs-root-'),
              journal: asyncStore(memoryJournal()),
              harnesses: { [name]: harness } as never,
            }),
          ),
        (e: Error & { _tag?: string }) => {
          assert.equal(e._tag, 'EngineRefused', e.message);
          assert.match(e.message, new RegExp(`^the \`${name}\` harness names the \`pool\` .*, which is not a name\\.`));
          return true;
        },
      );
    });
  }
  const homeless = [
    ['a `defaultHarness` none of its harnesses has', { harnesses: { only: asyncOps(fakeHarness(sessions)) }, defaultHarness: 'nowhere' }],
    ['no harness at all', { harnesses: {} }],
  ] as const;
  for (const [name, given] of homeless) {
    await t.test(`an engine with ${name}, where a task that names no harness would run, is refused`, () => {
      assert.throws(
        () => builtEngine(EngineService.layer({ root: scratch('ae-engine-verbs-root-'), journal: asyncStore(memoryJournal()), ...given })),
        (e: Error & { _tag?: string }) => {
          assert.equal(e._tag, 'EngineRefused', e.message);
          return true;
        },
      );
    });
  }
  const taken = [
    ['`sayTimeoutMs`, which bounded a `say` to a `--bg` session', { sayTimeoutMs: 500 }, ['`sayTimeoutMs`']],
    ["a harness configured `'claude-bg'`", { harnesses: { bg: 'claude-bg' } }, ['`bg`', "restartPolicy: 'Always'"]],
    ['a harness configured by any other word', { harnesses: { bg: 'claude-job' } }, ['`bg`']],
  ] as const;
  for (const [name, given, names] of taken) {
    await t.test(`REFUSED: ${name}, naming it and what to do instead, before anything is built`, () => {
      assert.throws(
        () =>
          builtEngine(
            EngineService.layer({ root: scratch('ae-engine-verbs-root-'), journal: asyncStore(memoryJournal()), ...given } as never),
          ),
        (e: Error & { _tag?: string }) => {
          assert.equal(e._tag, 'EngineRefused', e.message);
          for (const word of names) assert.ok(e.message.includes(word), `${word} in: ${e.message}`);
          return true;
        },
      );
    });
  }
  await t.test('a pool on a spec, a runner and a remote agent is taken', () => {
    assert.doesNotThrow(
      () =>
        builtEngine(
          EngineService.layer({
            root: scratch('ae-engine-verbs-root-'),
            journal: asyncStore(memoryJournal()),
            harnesses: {
              codex: { ...codex, pool: 'x' },
              fake: asyncOps(fakeHarness(sessions)),
              remote: { url: 'https://agent.example', pool: 'x' },
            },
          }),
        ),
      'a pool on a spec, a runner and a remote agent is taken',
    );
  });

  await t.test('the pass refuses any argument, TickRefused and nothing started — a ceiling handed to it is not dropped', async () => {
    const started = new Map<string, Sighting>();
    const engine = engineOver(fakeHarness(started));
    await Effect.runPromise(engine.file({ brief: 'b', cwd: '/r', id: 'waits' }));
    const tick: (...args: unknown[]) => ReturnType<typeof engine.tick> = engine.tick;
    for (const args of [[3], [3, { fake: 'fake' }], [undefined]]) {
      const e = await Effect.runPromise(Effect.flip(tick(...args)));
      assert.equal(e._tag, 'TickRefused', e.message);
      assert.match(
        e.message,
        new RegExp(
          `^the pass takes no arguments, and was handed ${args.length}: a ceiling and its pools are the engine's own, never a pass's\\. A ceiling is the engine's`,
        ),
      );
    }
    assert.equal(started.size, 0, 'nothing started');
    assert.equal((await Effect.runPromise(engine.view('waits'))).phase, 'pending');
  });
});

test('a runner brought as an AsyncRunner, at the pass: handed claude.remoteControl on the spawn, asked nothing of it; and a spawn that rejects is not taken to have started nothing — unless it says so', async (t) => {
  await t.test('it is asked nothing of claude.remoteControl, and is handed it on the spawn', async () => {
    const sessions = new Map<string, Sighting>();
    const asked: boolean[] = [];
    const runner = fakeHarness(sessions);
    const engine = engineOver({
      ...runner,
      spawn: async (r) => {
        asked.push(r.config?.claude?.remoteControl === true);
        await runner.spawn(r);
      },
    });
    await Effect.runPromise(engine.file({ brief: 'b', cwd: '/r', config: { claude: { remoteControl: true } } }));
    await Effect.runPromise(engine.tick());
    assert.deepEqual(asked, [true], 'its to honour');
  });

  await t.test(
    'a spawn that rejects saying nothing started fails the task unstartable; one that says nothing leaves it to be adopted',
    async () => {
      const sessions = new Map<string, Sighting>();
      const engine = engineOver({
        ...fakeHarness(sessions),
        async spawn(r) {
          if (r.brief === 'refuse') throw Object.assign(new Error('quota: no sessions today'), { refused: true });
          sessions.set(r.name, { sessionId: `s-${sessions.size + 1}`, state: 'working' });
          throw new Error('launcher: lost the acknowledgement');
        },
      });
      const maybe = await Effect.runPromise(engine.file({ brief: 'start', cwd: '/r' }));
      const no = await Effect.runPromise(engine.file({ brief: 'refuse', cwd: '/r' }));

      await Effect.runPromise(engine.tick());
      assert.equal((await Effect.runPromise(engine.view(no))).state.settled, 'failed', 'said nothing started: unstartable');
      assert.equal((await Effect.runPromise(engine.view(no))).state.attempts[0]?.reason, 'unstartable');
      assert.equal((await Effect.runPromise(engine.view(maybe))).state.settled, null, 'said nothing: not failed');

      await Effect.runPromise(engine.tick());
      assert.equal((await Effect.runPromise(engine.view(maybe))).phase, 'working', 'and its session is adopted');
    },
  );
});
