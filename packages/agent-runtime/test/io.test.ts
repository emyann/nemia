/**
 * What a pass costs, as the runtime reports it: a tick's wall time and each harness's observes (`TickReport.ms`, `.observed`), and the
 * running totals of what the runtime read and started (`Engine.io()`), the process's or, inside `Engine.tallied`, the program's own.
 * Facts for the layer above to compose; nothing here decides on them.
 *
 * A settled task's view asks no harness, whatever its harness has (`viewOf` in `service/engine.ts`): the orchestrator views every task
 * of every run each pass, and a harness with no `find` (the orchestrator's `check`, which lists its run files on each observe) would
 * otherwise be observed on every view, even of a task settled days ago. What a sighting gives a settled view is its session's id alone
 * (its phase is its outcome, `waitingFor` is a `needs-human` phase's, `usage` an attempt in flight's), and a check's `logs` — its
 * verdict — are read by that id: the handle the attempt's `ended` entry names.
 *
 * `list(taskIds)` is the views of some tasks, each journal read once and the harnesses looked at once for those in flight among them
 * (`viewsOf` in engine.ts): what the api's list of runs reads for the runs it has not kept, in place of `list()`, which reads every
 * journal in the store, or a `view` each, which observes its harness for each task in flight.
 */
import { Effect } from 'effect';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { EngineIo, HarnessSpec, Sighting } from '../src/index.ts';
import { Engine } from '../src/index.ts';
import { scratch } from './scratch.ts';
import { until, WAITED, type Waiter } from '../src/waits/index.ts';
import { asyncOps, asyncStore, type AsyncJournal, type AsyncRunner, type AsyncSighting } from './promise-runner.ts';
import { builtEngine } from './engine.ts';
import { story } from './checkpoints.ts';

/**
 * A harness shaped as the orchestrator's `check`: a command and nothing else — no `find`, no `start` — run by the engine's
 * detached worker. It prints a line and exits 3, unless its cwd holds `hold`, where it waits (bounded) until the file is gone.
 */
const check: HarnessSpec = {
  name: 'check',
  command: () => ({
    cmd: 'sh',
    args: ['-c', 'n=0; while [ -e hold ] && [ $n -lt 400 ]; do sleep 0.05; n=$((n+1)); done; echo checked; exit 3'],
  }),
};

/** Ticks `engine` in test `t`, every 50ms, until task `id` has settled. */
const settle = (t: Waiter, engine: ReturnType<typeof builtEngine>, id: string) =>
  until(
    t,
    async () => {
      if ((await Effect.runPromise(engine.view(id))).state.settled) return true;
      await Effect.runPromise(engine.tick());
      return false;
    },
    `${id} settled`,
    { everyMs: 50 },
  );

/** Views task `id` in test `t`, every 50ms, until its attempt runs. */
const runs = (t: Waiter, engine: ReturnType<typeof builtEngine>, id: string) => {
  let phase = 'not viewed yet';
  return until(
    t,
    async () => (phase = (await Effect.runPromise(engine.view(id))).phase).startsWith('running'),
    () => `${id} running; it is ${phase}`,
    { everyMs: 50 },
  );
};

/** A folder for a check to run in, held (the check waits) while it holds `hold`. */
const held = () => {
  const cwd = scratch('ae-io-cwd-');
  fs.writeFileSync(path.join(cwd, 'hold'), '');
  return { cwd, let: () => fs.rmSync(path.join(cwd, 'hold')) };
};

test(
  'a board of checks, as the orchestrator keeps one: a view observes a check pending or in flight and never a settled one, a tick says what it took, and io() counts every read, observe and worker',
  WAITED,
  async (t) => {
    const s = story(t);
    const root = scratch('ae-io-root-');
    const engine = builtEngine(Engine.layer({ root, harnesses: { check }, defaultHarness: 'check' }));
    const io = () => Effect.runSync(engine.io());
    const calls = () => io().observed.check?.calls ?? 0;
    const first = held();
    let id = '';

    await s.test('a pending check, on a harness that cannot find, is observed by its view, which reads its journal whole', async () => {
      id = await Effect.runPromise(engine.file({ brief: 'b', cwd: first.cwd }));
      const read0 = io();
      const before = calls();
      assert.equal((await Effect.runPromise(engine.view(id))).phase, 'pending');
      assert.equal(calls() - before, 1, 'a pending task on a harness that cannot find is observed');
      const read1 = io();
      const journal = fs.statSync(path.join(root, 'tasks', `${id}.jsonl`)).size;
      assert.ok(
        read1.bytesRead - read0.bytesRead >= journal,
        `a view read the journal's ${journal} bytes (read ${read1.bytesRead - read0.bytesRead})`,
      );
      assert.ok(read1.reads > read0.reads);
    });

    await s.test(
      "the pass that starts it starts its worker, and a view of it in flight observes: its phase is its session's state",
      async (sub) => {
        const spawn0 = io().spawned;
        await Effect.runPromise(engine.tick());
        assert.ok(io().spawned - spawn0 >= 1, 'the pass that started the attempt started its worker');
        await runs(sub, engine, id);
        const before = calls();
        assert.equal((await Effect.runPromise(engine.view(id))).phase, 'running (working)');
        assert.equal(calls() - before, 1, "an attempt in flight is observed: its phase is its session's state");
      },
    );

    await s.test("a tick counts only the observes made during it; io() counts every observe, a view's too", async () => {
      const one = await Effect.runPromise(engine.tick());
      const before = io().observed.check;
      await Effect.runPromise(engine.view(id));
      const afterView = io().observed.check;
      assert.ok(afterView.calls > before.calls, 'a view observes, and is counted');
      const two = await Effect.runPromise(engine.tick());
      assert.equal(two.observed.check.calls, one.observed.check.calls, "the view's observe is not charged to the next pass");
      assert.equal(io().observed.check.calls, afterView.calls + two.observed.check.calls, 'the running total has both');
    });

    await s.test(
      'REFUSED at shipped defaults: a view of a settled check observes nothing, and its logs are still read by the session it ended as',
      async (sub) => {
        first.let();
        await settle(sub, engine, id);
        const before = calls();
        const v = await Effect.runPromise(engine.view(id));
        assert.equal(v.phase, 'failed');
        assert.equal(v.state.attempts[0]?.exitCode, 3);
        assert.equal(v.sessionId, `ae/${id}/1`, 'the handle its end was recorded under: the name a detached run goes by');
        assert.match(
          await Effect.runPromise(engine.logs(id)),
          /checked/,
          'what the check printed, which is its verdict to the layer above',
        );
        assert.equal(calls() - before, 0, 'viewed, and its logs read, with no observe of the check harness');
      },
    );

    await s.test(
      'a tick says what it took and what each harness listed, and a directory of run files starts no process to be read',
      async () => {
        const report = await Effect.runPromise(engine.tick());
        assert.equal(typeof report.ms, 'number');
        assert.ok(report.ms >= 0);
        assert.deepEqual(Object.keys(report.observed), ['check'], 'one entry per harness observed in the pass');
        const o = report.observed.check;
        assert.ok(o.calls >= 1, 'the pass observed the harness');
        assert.equal(o.listed, o.calls, 'each observe listed the one run file there is');
        assert.equal(o.spawned, 0, 'reading run files starts nothing');
        assert.ok(o.ms >= 0 && o.ms <= report.ms + 1, 'an observe inside the pass takes no longer than the pass');
      },
    );

    await s.test(
      'a pass and a view of every task, as the orchestrator makes each pass: the check harness is observed once for the pass and once for each check in flight',
      async (sub) => {
        const done = [id];
        for (let k = 0; k < 4; k++) done.push(await Effect.runPromise(engine.file({ brief: 'b', cwd: scratch('ae-io-cwd-') })));
        for (const each of done) await settle(sub, engine, each);
        const second = held();
        const running = await Effect.runPromise(engine.file({ brief: 'b', cwd: second.cwd }));
        await Effect.runPromise(engine.tick());
        await runs(sub, engine, running);

        const before = calls();
        await Effect.runPromise(engine.tick());
        for (const each of [...done, running]) await Effect.runPromise(engine.view(each));
        assert.equal(calls() - before, 2, 'the pass, and the one check in flight: none for the five settled');

        second.let();
        await settle(sub, engine, running);
      },
    );
  },
);

/** A harness whose sessions are what the test says, counting its observes. */
const counting = () => {
  const sessions = new Map<string, Sighting>();
  const counts = { observe: 0 };
  const runner = {
    async spawn(r: { name: string }) {
      sessions.set(r.name, { sessionId: `s-${sessions.size + 1}`, state: 'working', busy: true });
    },
    async observe() {
      counts.observe++;
      return new Map(sessions);
    },
    async stop() {},
    async logs(sessionId: string) {
      return `logs of ${sessionId}`;
    },
  };
  return { sessions, counts, runner };
};

/** Three tasks settled, two in flight, one filed and never started. */
const listBoard = async () => {
  const h = counting();
  const root = scratch('ae-list-some-root-');
  const engine = builtEngine(Engine.layer({ root, harnesses: { mine: asyncOps(h.runner) } }));
  const cwd = scratch('ae-list-some-cwd-');
  const settled = [
    await Effect.runPromise(engine.file({ brief: 'a', cwd })),
    await Effect.runPromise(engine.file({ brief: 'b', cwd })),
    await Effect.runPromise(engine.file({ brief: 'c', cwd })),
  ];
  await Effect.runPromise(engine.tick());
  for (const id of settled) h.sessions.set(`ae/${id}/1`, { ...h.sessions.get(`ae/${id}/1`)!, state: 'completed', busy: false });
  await Effect.runPromise(engine.tick());
  const flying = [await Effect.runPromise(engine.file({ brief: 'd', cwd })), await Effect.runPromise(engine.file({ brief: 'e', cwd }))];
  await Effect.runPromise(engine.tick());
  const queued = await Effect.runPromise(engine.file({ brief: 'f', cwd, queued: true }));
  return { engine, root, ...h, settled, flying, queued };
};

/** A `measured` line whose usage no runtime wrote, as a person's or another program's edit leaves one. */
const MISWRITTEN = JSON.stringify({ kind: 'measured', at: '2026-09-28T00:00:00Z', attempt: 1, usage: { turns: 'three' } }) + '\n';

test('the api lists some tasks: each journal read once, one look at the harness for those in flight, an unreadable task named once, and anything else refused', async (t) => {
  const s = story(t);
  const b = await listBoard();
  const { engine, root, runner, counts, settled, flying, queued } = b;
  const reads = (e: ReturnType<typeof builtEngine>) => Effect.runSync(e.io()).reads;

  await s.test(
    'the views of some tasks are their views, each journal read once and the harness observed once for all those in flight',
    async () => {
      const asked = [flying[1], settled[0], queued, flying[0], settled[0]];
      const expected = await Promise.all([...new Set(asked)].map((id) => Effect.runPromise(engine.view(id))));
      const cold = builtEngine(Engine.layer({ root, harnesses: { mine: asyncOps(runner) } }));
      const read0 = reads(cold);
      const observes = counts.observe;
      const { views } = await Effect.runPromise(cold.list(asked));
      assert.deepEqual(
        views.map((v) => v.id),
        [flying[1], settled[0], queued, flying[0]],
        'in the order asked, with no id twice',
      );
      assert.deepEqual(
        views.map((v) => v.phase),
        expected.map((v) => v.phase),
      );
      assert.deepEqual(
        views.map((v) => v.state),
        expected.map((v) => v.state),
      );
      assert.deepEqual(
        views.map((v) => v.phase),
        ['running (working)', 'succeeded', 'pending', 'running (working)'],
      );
      assert.equal(
        reads(cold) - read0,
        4,
        "an engine that never read them reads a journal for each task asked, and none of the store's other two",
      );
      assert.equal(counts.observe - observes, 1, 'one look at the harness for the two in flight');
      const again = reads(cold);
      await Effect.runPromise(cold.list(asked));
      assert.equal(reads(cold) - again, 0, 'and once read, a journal nothing has written to since is not read again');
    },
  );

  await s.test(
    "a view on an engine that never read the task reads its journal once, observed or settled: it views the fold it chose what to ask by, and a harness held in memory makes every read counted the journal's",
    async () => {
      const cold = builtEngine(Engine.layer({ root, harnesses: { mine: asyncOps(runner) } }));
      const observed0 = reads(cold);
      assert.equal((await Effect.runPromise(cold.view(flying[0]))).phase, 'running (working)');
      assert.equal(reads(cold) - observed0, 1, 'a task in flight, observed, is one read');
      const settled0 = reads(cold);
      assert.ok((await Effect.runPromise(cold.view(settled[1]))).state.settled, 'the task settled');
      assert.equal(reads(cold) - settled0, 1, 'a settled task, read off its record, is one read');
      const again = reads(cold);
      await Effect.runPromise(cold.view(settled[1]));
      assert.equal(reads(cold) - again, 0, 'and once read, a journal nothing has written to since is not read again');
    },
  );

  await s.test('the views of tasks none of which is in flight observe nothing, and of no tasks are nothing', async () => {
    const observes = counts.observe;
    const { views } = await Effect.runPromise(engine.list([...settled, queued]));
    assert.deepEqual(
      views.map((v) => v.phase),
      ['succeeded', 'succeeded', 'succeeded', 'pending'],
    );
    assert.equal(counts.observe - observes, 0);
    assert.deepEqual(await Effect.runPromise(engine.list([])), { views: [], unreadable: [] });
  });

  await s.test('with no ids, every task on the board over one observation, as before', async () => {
    const observes = counts.observe;
    const { views } = await Effect.runPromise(engine.list());
    assert.deepEqual(new Set(views.map((v) => v.id)), new Set([...settled, ...flying, queued]));
    assert.equal(counts.observe - observes, 1);
  });

  await s.test('REFUSED: `list` handed anything but a list of task ids, or more than one argument, says what it takes', async () => {
    const untyped = engine.list as (...args: unknown[]) => ReturnType<typeof engine.list>;
    for (const args of [[settled[0]], [[1]], [{ ids: settled }], [settled, 'more'], [null]]) {
      const refused = await Effect.runPromise(Effect.flip(untyped(...args)));
      assert.equal(refused._tag, 'ListRefused', JSON.stringify(args));
      assert.match(refused.message, /^takes the task ids to view, a list of strings/, refused.message);
    }
  });

  await s.test(
    'a task whose journal holds an entry no runtime wrote is left out of `list()` and `list(ids)` and named once, as the pass says it; the others are answered',
    async () => {
      const [bad, other] = [flying[1], flying[0]];
      const file = path.join(root, 'tasks', `${bad}.jsonl`);
      fs.appendFileSync(file, MISWRITTEN);
      const said = (await Effect.runPromise(engine.tick())).unreadable;
      assert.equal(said.length, 1);
      assert.ok(said[0].startsWith(`${bad}'s journal (${file}), entry `), said[0]);

      const some = await Effect.runPromise(engine.list([other, bad, settled[0], bad]));
      assert.deepEqual(
        some.views.map((v) => v.id),
        [other, settled[0]],
      );
      assert.deepEqual(some.unreadable, [{ taskId: bad, why: said[0] }], 'named once, though asked twice, in the words of the pass');

      const every = await Effect.runPromise(engine.list());
      assert.deepEqual(new Set(every.views.map((v) => v.id)), new Set([...settled, other, queued]));
      assert.deepEqual(every.unreadable, [{ taskId: bad, why: said[0] }]);
    },
  );

  await s.test('any other failure of a read fails `list()`: a store that cannot be listed', async () => {
    const journal: AsyncJournal = {
      async append() {},
      async read() {
        return [];
      },
      async list() {
        throw new Error('fake: the store is gone');
      },
      async feed() {
        return { entries: [], cursor: 0 };
      },
    };
    const gone = builtEngine(
      Engine.layer({ root: scratch('ae-list-some-root-'), journal: asyncStore(journal), harnesses: { mine: asyncOps(counting().runner) } }),
    );
    await assert.rejects(Effect.runPromise(gone.list()), (err: Error) => err.message.includes('fake: the store is gone'));
  });
});

test('a tick counts the observes that could not read their harness (`unread`), and the attempt they could not read is left as it was', async () => {
  const sessions = new Map<string, AsyncSighting>();
  let failing = false;
  const flaky: AsyncRunner = {
    spawn: async (r) => {
      sessions.set(r.name, { sessionId: `s-${r.name}`, state: 'working' });
    },
    observe: async () => {
      if (failing) throw new Error('registry: timed out');
      return new Map(sessions);
    },
    stop: async () => {},
    logs: async () => '',
  };
  const engine = builtEngine(
    Engine.layer({ root: scratch('ae-io-root-'), harnesses: { flaky: asyncOps(flaky) }, defaultHarness: 'flaky' }),
  );
  const id = await Effect.runPromise(engine.file({ brief: 'b', cwd: scratch('ae-io-cwd-') }));
  await Effect.runPromise(engine.tick());
  const read = await Effect.runPromise(engine.tick());
  assert.equal(read.observed.flaky.unread, 0, 'a read that answered left nothing unread');
  failing = true;
  const unread = await Effect.runPromise(engine.tick());
  assert.deepEqual(
    [unread.observed.flaky.calls, unread.observed.flaky.listed, unread.observed.flaky.unread],
    [1, 0, 1],
    'one observe, nothing listed, one unread',
  );
  assert.equal(Effect.runSync(engine.io()).observed.flaky.unread, 1, 'and the running total has it');
  failing = false;
  assert.equal((await Effect.runPromise(engine.tick())).observed.flaky.unread, 0);
  assert.equal((await Effect.runPromise(engine.view(id))).state.attempts[0].ended, null, 'the attempt still runs');
});

/** What was read and observed between two of `io()`'s answers, on the harness `held`. */
const spent = (a: EngineIo, b: EngineIo) => ({
  bytesRead: b.bytesRead - a.bytesRead,
  reads: b.reads - a.reads,
  observes: (b.observed.held?.calls ?? 0) - (a.observed.held?.calls ?? 0),
});

test("REFUSED: io() inside `tallied` counts the program's own work alone: a feed read and a view another caller makes while the program's pass waits on its harness count in the process's totals, never in the program's", async () => {
  const sessions = new Map<string, AsyncSighting>();
  let gate: Promise<void> | undefined;
  let entered = () => {};
  const held: AsyncRunner = {
    spawn: async (r) => {
      sessions.set(r.name, { sessionId: `s-${r.name}`, state: 'working' });
    },
    observe: async () => {
      const wait = gate;
      gate = undefined;
      if (wait) {
        entered();
        await wait;
      }
      return new Map(sessions);
    },
    stop: async () => {},
    logs: async () => '',
  };
  const engine = builtEngine(Engine.layer({ root: scratch('ae-io-root-'), harnesses: { held: asyncOps(held) }, defaultHarness: 'held' }));
  const id = await Effect.runPromise(engine.file({ brief: 'b', cwd: scratch('ae-io-cwd-') }));
  await Effect.runPromise(engine.tick());
  const io = () => Effect.runSync(engine.io());
  const waiting = new Promise<void>((r) => (entered = r));
  let release = () => {};
  gate = new Promise<void>((r) => (release = r));
  const process0 = io();
  const pass = Effect.runPromise(
    engine.tallied(
      Effect.gen(function* () {
        const a = yield* engine.io();
        yield* engine.tick();
        return spent(a, yield* engine.io());
      }),
    ),
  );
  await waiting;
  const beside0 = io();
  await Effect.runPromise(Effect.andThen(engine.feed(0), engine.view(id)));
  const beside = spent(beside0, io());
  release();
  const own = await pass;
  const all = spent(process0, io());
  assert.ok(
    beside.bytesRead > 0 && beside.observes > 0,
    `the feed read and the view beside the pass read and observed: ${JSON.stringify(beside)}`,
  );
  assert.equal(own.observes, 1, "the program's one pass observed once");
  assert.deepEqual(
    all,
    { bytesRead: own.bytesRead + beside.bytesRead, reads: own.reads + beside.reads, observes: own.observes + beside.observes },
    "the process's totals are the program's and the reads beside it, each counted once",
  );
});
