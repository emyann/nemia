/**
 * The facade, proven by what this file does NOT import.
 *
 * There is no `import ... from 'effect'` anywhere below, and there must never be: the whole claim
 * of this layer is that a consumer can drive the engine, bring their own store and bring their own
 * harness while knowing nothing about Effect. A test that imported it would be testing something
 * else.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  createEngine,
  nameFor,
  type Event,
  type FeedEntry,
  type PromiseJournal,
  type PromiseRunner,
  type Sighting,
} from '../src/facade.ts';
import { scratch } from './scratch.ts';

/** A store in twelve lines of plain async — what an application with its own database writes. */
const memoryJournal = (): PromiseJournal => {
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
const fakeHarness = (sessions: Map<string, Sighting>): PromiseRunner => ({
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

test('a consumer can run the whole lifecycle in plain async/await', async () => {
  const sessions = new Map<string, Sighting>();
  const engine = createEngine({
    journal: memoryJournal(),
    harnesses: { fake: fakeHarness(sessions) },
    defaultHarness: 'fake',
  });

  const id = await engine.file({ brief: 'do the thing', cwd: '/repo' });
  assert.equal((await engine.view(id)).phase, 'pending');

  await engine.tick();
  assert.equal((await engine.view(id)).phase, 'running (working)');
  assert.equal(sessions.size, 1);

  for (const [k, v] of sessions) sessions.set(k, { ...v, state: 'completed' });
  await engine.tick();
  assert.equal((await engine.view(id)).phase, 'succeeded', 'the harness finished the work, and the engine found out by asking');
});

test('the feed is enough to build a workflow on, with no Effect anywhere', async () => {
  const sessions = new Map<string, Sighting>();
  const engine = createEngine({ journal: memoryJournal(), harnesses: { fake: fakeHarness(sessions) }, defaultHarness: 'fake' });

  const first = await engine.file({ brief: 'implement', cwd: '/repo' });
  await engine.tick();
  for (const [k, v] of sessions) sessions.set(k, { ...v, state: 'completed' });
  await engine.tick();

  let cursor = 0;
  const filed: string[] = [];
  const { entries, cursor: next } = await engine.feed(cursor);
  cursor = next;
  for (const { taskId, event } of entries) {
    if (event.kind === 'settled' && event.outcome === 'succeeded') {
      filed.push(await engine.file({ brief: `review ${taskId}`, cwd: '/repo' }));
    }
  }
  assert.equal(filed.length, 1, 'the settled event drove a follow-up task');
  assert.notEqual(filed[0], first);
});

test('the start, the stop and the list all work through the facade — and every task given starts, with no ceiling', async () => {
  const sessions = new Map<string, Sighting>();
  const engine = createEngine({ journal: memoryJournal(), harnesses: { fake: fakeHarness(sessions) }, defaultHarness: 'fake' });
  for (let i = 0; i < 5; i++) await engine.file({ brief: `t${i}`, cwd: '/repo', id: `task-${i}` });

  const report = await engine.tick();
  assert.equal(sessions.size, 5, 'the runtime holds nothing back: a layer above files `queued: true` to');
  assert.deepEqual(report.running, { fake: 5 }, 'counted under the harness that ran it, not "default"');
  assert.equal((await engine.list()).views.length, 5);

  await engine.stop('task-0');
  await engine.tick();
  assert.equal(sessions.get(nameFor('task-0', 1))!.state, 'canceled');
});

test('the file-backed default needs no configuration at all', async () => {
  const root = scratch('ae-facade-');
  const sessions = new Map<string, Sighting>();
  const engine = createEngine({ root, harnesses: { fake: fakeHarness(sessions) }, defaultHarness: 'fake' });

  const id = await engine.file({ brief: 'b', cwd: '/repo' });
  await engine.tick();
  assert.ok(fs.existsSync(path.join(root, 'tasks', `${id}.jsonl`)), 'it wrote a journal');
  assert.ok(fs.existsSync(path.join(root, 'feed.jsonl')), 'and a feed');

  const reopened = createEngine({ root, harnesses: { fake: fakeHarness(sessions) }, defaultHarness: 'fake' });
  assert.equal(
    (await reopened.view(id)).state.brief,
    'b',
    'a second engine over the same root sees the same board: the state is on disk, not in memory',
  );
});

/**
 * A harness whose every observation takes `ms`: one pass of `tick()` observes once, so this is a tick slower than
 * the timer. It counts the passes begun and the most ever in flight at once.
 *
 * With a pass three intervals long, the timer comes due before the pass's own wait does, and timers fire in the
 * order they come due, however late: the timer fires during every pass, and only the guard in `start()` keeps a
 * second pass out. Without that guard `most` reads 2.
 */
const slowHarness = (sessions: Map<string, Sighting>, ms: number) => {
  const fast = fakeHarness(sessions);
  const seen = { passes: 0, inFlight: 0, most: 0 };
  const harness: PromiseRunner = {
    ...fast,
    async observe() {
      seen.passes += 1;
      seen.inFlight += 1;
      seen.most = Math.max(seen.most, seen.inFlight);
      try {
        await new Promise((r) => setTimeout(r, ms));
        return await fast.observe();
      } finally {
        seen.inFlight -= 1;
      }
    },
  };
  return { harness, seen };
};

/**
 * Resolves when `onTick` has been called `n` times, or rejects after `boundMs` of wall clock. A test waits for the
 * tick it counts, as long as a starved machine needs, never for a length of time before counting.
 */
const ticksUntil = (n: number, boundMs: number) => {
  let ticks = 0;
  let reached!: () => void;
  const done = new Promise<void>((r) => {
    reached = r;
  });
  return {
    onTick: () => {
      ticks += 1;
      if (ticks === n) reached();
    },
    count: () => ticks,
    wait: async (errors: unknown[]) => {
      let timer: NodeJS.Timeout | undefined;
      const late = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`saw ${ticks} tick(s) of ${n} in ${boundMs}ms; errors: ${errors.map(String).join('; ') || 'none'}`)),
          boundMs,
        );
      });
      try {
        await Promise.race([done, late]);
      } finally {
        clearTimeout(timer);
      }
    },
  };
};

test('start() ticks on a timer and never overlaps', async () => {
  const sessions = new Map<string, Sighting>();
  const { harness, seen } = slowHarness(sessions, 60);
  const engine = createEngine({ journal: memoryJournal(), harnesses: { fake: harness }, defaultHarness: 'fake' });
  await engine.file({ brief: 'b', cwd: '/repo' });

  const errors: unknown[] = [];
  const ticks = ticksUntil(3, 30_000);
  const loop = engine.start({
    intervalMs: 20,
    onTick: ticks.onTick,
    onError: (e) => {
      errors.push(e);
    },
  });
  try {
    await ticks.wait(errors);
  } finally {
    loop.stop();
  }

  assert.equal(ticks.count(), 3, 'three ticks, and nobody called tick()');
  assert.equal(seen.most, 1, 'two ticks ran at once');
  assert.equal(seen.passes, 3, 'every pass that began, reported');
  assert.equal(seen.inFlight, 0, "no pass under way: stop() ran in the same turn as the third tick's report, before any timer could fire");

  await new Promise((r) => setTimeout(r, 100));
  assert.equal(seen.passes, 3, 'stop() means stopped: no pass began after it');
  assert.equal(ticks.count(), 3, 'and none was reported');
  assert.deepEqual(errors, []);
});

test('a tick under way when stop() is called — its sessions spawned, its events journalled, not to be taken back — finishes, and reports, and is the last', async () => {
  const sessions = new Map<string, Sighting>();
  const { harness, seen } = slowHarness(sessions, 60);
  const engine = createEngine({ journal: memoryJournal(), harnesses: { fake: harness }, defaultHarness: 'fake' });
  await engine.file({ brief: 'b', cwd: '/repo' });

  const errors: unknown[] = [];
  const ticks = ticksUntil(1, 30_000);
  const loop = engine.start({
    intervalMs: 20,
    onTick: ticks.onTick,
    onError: (e) => {
      errors.push(e);
    },
  });
  const bound = Date.now() + 30_000;
  while (seen.inFlight === 0 && Date.now() < bound) await new Promise((r) => setTimeout(r, 1));
  loop.stop();
  assert.equal(seen.inFlight, 1, 'a pass was under way at stop()');
  assert.equal(ticks.count(), 0, 'and it has not reported yet');

  await ticks.wait(errors);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(ticks.count(), 1, 'the pass under way reported once');
  assert.equal(seen.passes, 1, 'and no other began');
  assert.deepEqual(errors, []);
});

test('running is keyed by the harness the task resolved to: a task that names it and one that does not count together', async () => {
  const sessions = new Map<string, Sighting>();
  const engine = createEngine({ journal: memoryJournal(), harnesses: { fake: fakeHarness(sessions) }, defaultHarness: 'fake' });
  for (let i = 0; i < 3; i++) await engine.file({ brief: `e${i}`, cwd: '/r', id: `a-${i}`, harness: 'fake' });
  for (let i = 0; i < 3; i++) await engine.file({ brief: `i${i}`, cwd: '/r', id: `b-${i}` });

  const report = await engine.tick();
  assert.equal(sessions.size, 6);
  assert.deepEqual(
    report.running,
    { fake: 6 },
    'the facade resolves the harness at filing: three that name `fake` and three that name nothing are six under `fake`, none under "default"',
  );
});

test('watch delivers every event, in order, once', async () => {
  const sessions = new Map<string, Sighting>();
  const engine = createEngine({ journal: memoryJournal(), harnesses: { fake: fakeHarness(sessions) }, defaultHarness: 'fake' });

  const seen: string[] = [];
  const w = engine.watch({
    onEntry: (e) => {
      seen.push(e.event.kind);
    },
    intervalMs: 20,
  });

  const id = await engine.file({ brief: 'b', cwd: '/r' });
  await engine.tick();
  for (const [k, v] of sessions) sessions.set(k, { ...v, state: 'completed' });
  await engine.tick();
  await new Promise((r) => setTimeout(r, 200));
  w.stop();

  assert.deepEqual(seen, ['filed', 'starting', 'spawned', 'ended', 'settled'], 'in order, no repeats');
  void id;
});

/** A `measured` line whose usage no runtime wrote, as a person's or another program's edit leaves one. */
const MISWRITTEN = JSON.stringify({ kind: 'measured', at: '2026-09-28T00:00:00Z', attempt: 1, usage: { turns: 'three' } }) + '\n';

test('a task whose journal holds an entry no runtime wrote is left out of each pass and said, naming the file, the entry and the field; every other task moves', async () => {
  const root = scratch('ae-facade-');
  const sessions = new Map<string, Sighting>();
  const engine = createEngine({ root, harnesses: { fake: fakeHarness(sessions) }, defaultHarness: 'fake' });
  const bad = await engine.file({ brief: 'miswritten', cwd: '/repo' });
  const good = await engine.file({ brief: 'fine', cwd: '/repo' });
  const journal = path.join(root, 'tasks', `${bad}.jsonl`);
  fs.appendFileSync(journal, MISWRITTEN);

  const first = await engine.tick();
  assert.equal((await engine.view(good)).phase, 'running (working)');
  assert.deepEqual([...sessions.keys()], [nameFor(good, 1)]);
  assert.equal(first.unreadable.length, 1);
  assert.ok(
    first.unreadable[0].startsWith(
      `${bad}'s journal (${journal}), entry 2 is a \`measured\` event, and its \`usage.turns\` is "three", where the runtime writes number.`,
    ),
    first.unreadable[0],
  );

  for (const [k, v] of sessions) sessions.set(k, { ...v, state: 'completed' });
  const second = await engine.tick();
  assert.equal((await engine.view(good)).phase, 'succeeded');
  assert.deepEqual(second.unreadable, first.unreadable, 'said on every pass it lasts');
  await assert.rejects(engine.view(bad), (e: Error) => e.message.includes(`${bad}'s journal (${journal}), entry 2`));
});

test('a feed entry no runtime wrote is skipped: the pass that meets it says it once and moves on, and a watcher is told and delivers the rest', async () => {
  const root = scratch('ae-facade-');
  const sessions = new Map<string, Sighting>();
  const engine = createEngine({ root, harnesses: { fake: fakeHarness(sessions) }, defaultHarness: 'fake' });
  const id = await engine.file({ brief: 'b', cwd: '/repo' });
  await engine.tick();
  const feedFile = path.join(root, 'feed.jsonl');
  fs.appendFileSync(feedFile, JSON.stringify({ taskId: id, event: { kind: 'nudged', at: 'x' } }) + '\n');
  fs.appendFileSync(feedFile, '{"taskId":"t-cut","ev\n');
  for (const [k, v] of sessions) sessions.set(k, { ...v, state: 'completed' });

  const meets = await engine.tick();
  assert.equal((await engine.view(id)).phase, 'succeeded');
  assert.equal(meets.unreadable.length, 2);
  assert.ok(
    meets.unreadable[0].startsWith(`the feed (${feedFile}), entry `) &&
      meets.unreadable[0].includes('is no event this runtime writes (its kind is "nudged"'),
    meets.unreadable[0],
  );
  assert.deepEqual((await engine.tick()).unreadable, [], 'said once: the cursor is past it');

  const { entries, cursor, refused } = await engine.feed(0);
  assert.equal(cursor, fs.statSync(feedFile).size);
  assert.deepEqual(
    entries.map((e) => e.event.kind),
    ['filed', 'starting', 'spawned', 'ended', 'settled'],
  );
  assert.equal(refused?.length, 2);

  const seen: string[] = [];
  const told: string[] = [];
  const w = engine.watch({
    onEntry: (e) => void seen.push(e.event.kind),
    onError: (e) => void told.push((e as Error).message),
    intervalMs: 20,
  });
  const bound = Date.now() + 10_000;
  while (seen.length < 5 && Date.now() < bound) await new Promise((r) => setTimeout(r, 10));
  w.stop();
  assert.deepEqual(seen, ['filed', 'starting', 'spawned', 'ended', 'settled']);
  assert.deepEqual(
    told,
    refused?.map((r) => r.why),
  );
});

test('a watcher starting at 0 replays history, and stop() stops', async () => {
  const sessions = new Map<string, Sighting>();
  const engine = createEngine({ journal: memoryJournal(), harnesses: { fake: fakeHarness(sessions) }, defaultHarness: 'fake' });
  await engine.file({ brief: 'b', cwd: '/r' });
  await engine.tick();

  const seen: string[] = [];
  const w = engine.watch({
    onEntry: (e) => {
      seen.push(e.event.kind);
    },
    intervalMs: 20,
  });
  await new Promise((r) => setTimeout(r, 120));
  assert.deepEqual(seen, ['filed', 'starting', 'spawned'], 'the cursor never expires — it replays');

  w.stop();
  const before = seen.length;
  await engine.file({ brief: 'another', cwd: '/r' });
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(seen.length, before, 'nothing arrives after stop()');
});

test('the file store pushes: a watcher hears about a write it did not poll for', async () => {
  const root = scratch('ae-watch-');
  const sessions = new Map<string, Sighting>();
  const engine = createEngine({ root, harnesses: { fake: fakeHarness(sessions) }, defaultHarness: 'fake' });

  const seen: string[] = [];
  const w = engine.watch({
    onEntry: (e) => {
      seen.push(e.event.kind);
    },
    intervalMs: 60_000,
  });
  await new Promise((r) => setTimeout(r, 50));

  await engine.file({ brief: 'b', cwd: '/r' });
  await new Promise((r) => setTimeout(r, 400));
  w.stop();

  assert.deepEqual(seen, ['filed'], 'delivered without waiting for the interval');
});

import { spawn } from 'node:child_process';

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
    import { createEngine } from '${path.resolve('src/facade.ts')}';
    const engine = createEngine({ root: ${JSON.stringify(root)} });
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

test('start() keeps its host process alive — a loop that lets you exit is not a loop', async () => {
  assert.equal(await survives('engine.start({ intervalMs: 200 });'), true);
});

test('watch() keeps its host process alive, even with a store that cannot push', async () => {
  assert.equal(
    await survives(`
    const store = {
      append: async () => {}, read: async () => [], list: async () => [],
      feed: async () => ({ entries: [], cursor: 0 }),
    };
    createEngine({ journal: store }).watch({ onEntry: () => {} });
  `),
    true,
    "a store with no `subscribe`, the kind a consumer brings, has only the interval to hold the loop open: the file store's fs.watch holds it by itself",
  );
});

import { claudeDetached, codex, type Engine, type HarnessSpec, type HarnessArgs, type TaskSpec } from '../src/facade.ts';

/** An engine at shipped defaults — the three built-in harnesses — over a store a test can read. */
const shipped = () => {
  const journal = memoryJournal();
  return { journal, engine: createEngine({ journal }) };
};

/** Rejected with exit code 2 and a sentence that matches. */
const refused = (engine: Engine, spec: TaskSpec, says: RegExp) =>
  assert.rejects(engine.file(spec), (e: Error & { exitCode?: number }) => {
    assert.equal(e.exitCode, 2, e.message);
    assert.match(e.message, says);
    return true;
  });

test('file() refuses a harness the engine does not have, rather than run the task on the fallback', async () => {
  const { journal, engine } = shipped();
  await refused(
    engine,
    { brief: 'b', cwd: '/r', harness: 'banana' },
    /`harness: banana` is not a harness this engine has.*claude, codex, claude-detached/,
  );
  assert.deepEqual(await journal.list(), [], 'nothing was journalled');
});

test('file() refuses seconds the loop cannot use — NaN among them, which JSON writes as null', async () => {
  const { journal, engine } = shipped();
  for (const deadlineSeconds of [Number.NaN, 0, -5, Infinity]) {
    await refused(engine, { brief: 'b', cwd: '/r', deadlineSeconds }, /is not a number of seconds/);
  }
  assert.deepEqual(await journal.list(), [], 'nothing was journalled');
});

test('file() refuses the retired maxAttempts and resume, at what were their defaults, from an untyped caller — the type names neither key — and says what to do instead', async () => {
  const { journal, engine } = shipped();
  await refused(
    engine,
    { brief: 'b', cwd: '/r', maxAttempts: 1 } as TaskSpec,
    /^file: `maxAttempts` is retired: .*file it again.*`retries:`.*`wf retry <run> <step>`/,
  );
  await refused(
    engine,
    { brief: 'b', cwd: '/r', resume: 'interrupted' } as TaskSpec,
    /^file: `resume` is retired: .*`retries:`.*`wf retry <run> <step>`/,
  );
  assert.deepEqual(await journal.list(), [], 'nothing was journalled');
});

test("file() refuses a permission mode outside its harness's own words", async () => {
  const { journal, engine } = shipped();
  await refused(
    engine,
    { brief: 'b', cwd: '/r', config: { permissionMode: 'yolo' } },
    /`permissionMode: yolo` is not a mode Claude Code has/,
  );
  await refused(
    engine,
    { brief: 'b', cwd: '/r', harness: 'claude-detached', config: { permissionMode: 'read-only' } },
    /not a mode Claude Code has/,
  );
  await refused(
    engine,
    { brief: 'b', cwd: '/r', harness: 'codex', config: { permissionMode: 'auto' } },
    /`permissionMode: auto` is not a sandbox Codex has/,
  );
  assert.deepEqual(await journal.list(), [], 'nothing was journalled');

  await engine.file({ brief: 'b', cwd: '/r', harness: 'codex', config: { permissionMode: 'read-only' } });
  await engine.file({ brief: 'b', cwd: '/r', config: { permissionMode: 'default' } });
  assert.equal((await journal.list()).length, 2, 'the words each harness does have are filed');
});

test('file() refuses an empty brief, cwd, model or resumeFrom', async () => {
  const { engine } = shipped();
  await refused(engine, { brief: '  ', cwd: '/r' }, /`brief` is empty/);
  await refused(engine, { brief: 'b', cwd: '' }, /`cwd` is empty/);
  await refused(engine, { brief: 'b', cwd: '/r', config: { model: '' } }, /`model` is empty/);
  await refused(engine, { brief: 'b', cwd: '/r', resumeFrom: '' }, /`resumeFrom` is empty/);
});

test('file() refuses a cwd that is not absolute, naming it resolved — the process that ticks would resolve it, and need not be the one that filed it — on every harness, so no detached worker is launched into repo/repo', async () => {
  const { journal, engine } = shipped();
  for (const harness of ['claude', 'codex', 'claude-detached']) {
    await refused(
      engine,
      { brief: 'b', cwd: 'repo', harness },
      new RegExp(`\`cwd: repo\` is not an absolute path.*from here that is ${path.resolve('repo')}`),
    );
  }
  await refused(engine, { brief: 'b', cwd: './repo' }, /`cwd: \.\/repo` is not an absolute path/);
  await refused(engine, { brief: 'b', cwd: '~/repo' }, /`cwd: ~\/repo` is not an absolute path/);
  assert.deepEqual(await journal.list(), [], 'nothing was journalled, so no tick can spawn it');
  assert.ok(await engine.file({ brief: 'b', cwd: path.resolve('repo') }), 'the same directory, resolved, is filed');
});

test('a harness brought as a spec is asked its own refusals; one brought as a runner is asked nothing', async () => {
  const picky: HarnessSpec = {
    name: 'picky',
    command: () => ({ cmd: 'true', args: [] }),
    refuses: (task) => (task.config?.model === 'huge' ? 'picky runs no huge models' : undefined),
  };
  const engine = createEngine({ journal: memoryJournal(), harnesses: { picky, fake: fakeHarness(new Map()) }, defaultHarness: 'picky' });
  await refused(engine, { brief: 'b', cwd: '/r', config: { model: 'huge' } }, /picky runs no huge models/);
  assert.ok(await engine.file({ brief: 'b', cwd: '/r', harness: 'fake', config: { permissionMode: 'anything' } }));
});

test('file() refuses an effort its harness does not have — Claude Code would have ignored it', async () => {
  const { journal, engine } = shipped();
  await refused(engine, { brief: 'b', cwd: '/r', config: { effort: 'extreme' } }, /`effort: extreme` is not an effort Claude Code has/);
  await refused(engine, { brief: 'b', cwd: '/r', harness: 'codex', config: { effort: 'extreme' } }, /not a reasoning effort Codex has/);
  await refused(engine, { brief: 'b', cwd: '/r', config: { effort: '' } }, /`effort` is empty/);
  assert.deepEqual(await journal.list(), [], 'nothing was journalled');

  await engine.file({ brief: 'b', cwd: '/r', config: { effort: 'xhigh' } });
  await engine.file({ brief: 'b', cwd: '/r', harness: 'codex', config: { effort: 'minimal' } });
  assert.equal((await journal.list()).length, 2, 'the efforts each harness does have are filed');
});

test('file() refuses a tool list that is not a list of names, and journals one that is', async () => {
  const { journal, engine } = shipped();
  for (const tools of [['Read,Grep'], [''], [' Read'], 'Read' as unknown as string[]]) {
    await refused(engine, { brief: 'b', cwd: '/r', config: { tools } }, /is not a list of tool names/);
  }
  assert.deepEqual(await journal.list(), [], 'nothing was journalled');

  const id = await engine.file({ brief: 'b', cwd: '/r', config: { tools: ['Read', 'Grep', 'Glob'] } });
  const [filed] = await journal.read(id);
  assert.deepEqual((filed as { config?: { tools?: string[] } }).config?.tools, ['Read', 'Grep', 'Glob'], 'on the record, for the runner');
});

test('file() refuses a disallowedTools that is not a list of permission rules, and a deny list on codex, and journals one that is', async () => {
  const { journal, engine } = shipped();
  const notRules: unknown[] = [
    'SendMessage',
    [''],
    [' SendMessage'],
    [42],
    ['SendMessage,CronCreate'],
    ['Bash npm run build'],
    ['Bash(npm run build'],
    ['Bash()'],
    ['(npm run build)'],
    ['-p'],
  ];
  for (const disallowedTools of notRules) {
    await refused(
      engine,
      { brief: 'b', cwd: '/r', config: { disallowedTools: disallowedTools as string[] } },
      /is not a list of permission rules\. Give one rule per entry/,
    );
  }
  await refused(
    engine,
    { brief: 'b', cwd: '/r', harness: 'codex', config: { disallowedTools: ['SendMessage'] } },
    /is a deny list, and Codex has no tool list/,
  );
  assert.deepEqual(await journal.list(), [], 'nothing was journalled');

  const rules = [
    'SendMessage',
    'Bash(npm run build)',
    'mcp__playwright__browser_run_code_unsafe',
    'Read(//home/**)',
    `Bash(git commit -m 'wip')`,
  ];
  const id = await engine.file({ brief: 'b', cwd: '/r', config: { disallowedTools: rules } });
  const [filed] = await journal.read(id);
  assert.deepEqual((filed as { config?: { disallowedTools?: string[] } }).config?.disallowedTools, rules, 'on the record, for the runner');
});

test('file() refuses an allowedTools that is not a list of permission rules, and an allow list on codex, and journals one that is', async () => {
  const { journal, engine } = shipped();
  const notRules: unknown[] = [
    'Write(**)',
    [''],
    [' Write(**)'],
    [42],
    ['Write(**),Edit(**)'],
    ['Bash npm test'],
    ['Write(**'],
    ['Write()'],
    ['(**)'],
    ['-p'],
  ];
  for (const allowedTools of notRules) {
    await refused(
      engine,
      { brief: 'b', cwd: '/r', config: { allowedTools: allowedTools as string[] } },
      /is not a list of permission rules\. Give one rule per entry/,
    );
  }
  await refused(
    engine,
    { brief: 'b', cwd: '/r', harness: 'codex', config: { allowedTools: ['Write(**)'] } },
    /is an allow list, and Codex has no tool list/,
  );
  assert.deepEqual(await journal.list(), [], 'nothing was journalled');

  const rules = ['Write(**)', 'Edit(**)', 'Bash(npm test)', 'mcp__playwright__browser_navigate', `Bash(git commit -m 'wip')`];
  const id = await engine.file({ brief: 'b', cwd: '/r', config: { allowedTools: rules } });
  const [filed] = await journal.read(id);
  assert.deepEqual((filed as { config?: { allowedTools?: string[] } }).config?.allowedTools, rules, 'on the record, for the runner');
});

test('file() refuses an mcp map whose entries are not .mcp.json servers, and journals one that is', async () => {
  const { journal, engine } = shipped();
  const bad: Array<[unknown, RegExp]> = [
    [[], /`mcp: \[\]` is not a map of MCP servers by name/],
    [null, /`mcp: null` is not a map of MCP servers by name/],
    ['npx @playwright/mcp', /is not a map of MCP servers by name/],
    [{ 'my server': { command: 'x' } }, /`mcp: "my server"` is not a server name/],
    [{ web: 'npx server' }, /`mcp.web` is not a server\. An entry is/],
    [{ web: {} }, /`mcp.web` has neither `command` nor `url`/],
    [{ web: { command: 'x', url: 'https://h/mcp' } }, /`mcp.web` has both `command` and `url`/],
    [{ web: { command: '' } }, /`mcp.web.command` is not a program to run/],
    [{ web: { command: 'x', args: '-y server' } }, /`mcp.web.args` is not a list of strings/],
    [{ web: { command: 'x', env: { PORT: 3000 } } }, /`mcp.web.env` is not a map of strings/],
    [{ web: { command: 'x', cwd: '/r' } }, /`mcp.web` has `cwd`, which a server with a `command` does not take/],
    [{ web: { command: 'x', type: 'http' } }, /`mcp.web` has a `command` and `type: "http"`/],
    [{ web: { url: 'https://h/mcp' } }, /`mcp.web` has a `url` and no `type`.*Claude Code loads no server/],
    [{ web: { type: 'ws', url: 'https://h/mcp' } }, /`mcp.web` has a `url` and `type: "ws"`/],
    [{ web: { type: 'http', url: 7 } }, /`mcp.web.url` is not an address/],
    [{ web: { type: 'http', url: 'https://h/mcp', env: {} } }, /`mcp.web` has `env`, which a server with a `url` does not take/],
    [{ web: { type: 'http', url: 'https://h/mcp', headers: { Authorization: 1 } } }, /`mcp.web.headers` is not a map of strings/],
  ];
  for (const [mcp, says] of bad) await refused(engine, { brief: 'b', cwd: '/r', config: { mcp: mcp as HarnessArgs['mcp'] } }, says);
  const sse = { docs: { type: 'sse' as const, url: 'https://h/sse' } };
  await refused(
    engine,
    { brief: 'b', cwd: '/r', harness: 'codex', config: { mcp: sse } },
    /`mcp.docs` is an SSE server, and Codex connects only to stdio and streamable HTTP/,
  );
  assert.deepEqual(await journal.list(), [], 'nothing was journalled');

  await engine.file({ brief: 'b', cwd: '/r', harness: 'claude-detached', config: { mcp: sse } });
  const mcp = {
    browser: { command: 'npx', args: ['-y', '@playwright/mcp'], env: { HEADLESS: '1' } },
    docs: { type: 'http' as const, url: 'https://h/mcp' },
  };
  const id = await engine.file({ brief: 'b', cwd: '/r', config: { mcp } });
  const [filed] = await journal.read(id);
  assert.deepEqual((filed as { config?: { mcp?: unknown } }).config?.mcp, mcp, 'on the record, for the runner');
});

test('file() refuses a config.budgetUsd that is not dollars above 0, and one on a session that would keep no cap — and journals one a job keeps, under config', async () => {
  const { journal, engine } = shipped();
  for (const budgetUsd of [0, -1, Number.NaN, Infinity, '5' as unknown as number]) {
    await refused(
      engine,
      { brief: 'b', cwd: '/r', harness: 'claude-detached', config: { budgetUsd } },
      /is not an amount of dollars\. Give dollars above 0/,
    );
  }
  await refused(
    engine,
    { brief: 'b', cwd: '/r', config: { budgetUsd: 5, background: true } },
    /`budgetUsd: 5` is a spend cap, and a `claude --bg` session does not keep one.*Leave `config\.background` off to run the task as a job \(`claude -p`\), which ends the session at its cap/,
  );
  await refused(
    engine,
    { brief: 'b', cwd: '/r', harness: 'codex', config: { budgetUsd: 5 } },
    /`budgetUsd: 5` is a spend cap in dollars, and `codex exec` has none/,
  );
  assert.deepEqual(await journal.list(), [], 'nothing was journalled');

  for (const harness of ['claude-detached', 'claude']) {
    const id = await engine.file({ brief: 'b', cwd: '/r', harness, config: { budgetUsd: 0.25 } });
    const [filed] = await journal.read(id);
    assert.deepEqual((filed as { config?: object }).config, { budgetUsd: 0.25 }, 'on the record, for the runner');
    assert.equal('budgetUsd' in filed, false, 'and nowhere else');
    assert.equal(
      (await engine.view(id)).state.config?.budgetUsd,
      0.25,
      `a job keeps its cap on ${harness}: \`claude -p\` ends the session at it`,
    );
  }
});

test('file() refuses `priority` at any value, on every harness, and journals nothing: the runtime chooses no order', async () => {
  const { journal, engine } = shipped();
  for (const harness of ['claude', 'codex', 'claude-detached', 'check']) {
    for (const priority of [2, -1, 0.5, 0, Number.NaN, 'high', null, undefined]) {
      await refused(
        engine,
        { brief: 'b', cwd: '/r', harness, priority } as unknown as TaskSpec,
        /^file: `priority` is retired: the runtime starts a task on its next pass once it is admitted, so it chooses no order\. File tasks `queued: true` and `admit` each when it may start/,
      );
    }
  }
  assert.deepEqual(await journal.list(), [], 'nothing was journalled');
});

test('createEngine refuses `maxConcurrent` at any value, as an own key: the runtime keeps no ceiling', () => {
  for (const maxConcurrent of [2, 1, Infinity, 0, undefined]) {
    assert.throws(
      () => createEngine({ journal: memoryJournal(), maxConcurrent } as unknown as Parameters<typeof createEngine>[0]),
      (e: Error & { exitCode?: number }) => {
        assert.equal(e.exitCode, 2, e.message);
        assert.match(
          e.message,
          /^createEngine: `maxConcurrent` is retired: the runtime keeps no ceiling, and starts every task it is given\. File tasks `queued: true` and `admit` each/,
        );
        return true;
      },
    );
  }
});

test('createEngine refuses a harness that names a `pool`, a spec or a Promise runner, and names the harness', () => {
  const sessions = new Map<string, Sighting>();
  const withPool = [
    ['codex-pooled', { ...codex, pool: 'codex' }],
    ['fake', { ...fakeHarness(sessions), pool: 'claude' }],
    ['unpooled', { ...fakeHarness(sessions), pool: undefined }],
  ] as const;
  for (const [name, harness] of withPool) {
    assert.throws(
      () => createEngine({ journal: memoryJournal(), harnesses: { [name]: harness } as unknown as Record<string, PromiseRunner> }),
      (e: Error & { exitCode?: number }) => {
        assert.equal(e.exitCode, 2, e.message);
        assert.match(
          e.message,
          new RegExp(
            `^createEngine: the \`${name}\` harness names a \`pool\`, which is retired: the runtime counts no pools\\. Take \`pool\` off it`,
          ),
        );
        assert.match(e.message, /the orchestrator's `POOLS` in `src\/cap\/cap\.ts`/);
        return true;
      },
    );
  }
  assert.doesNotThrow(
    () => createEngine({ journal: memoryJournal(), harnesses: { codex, bg: claudeDetached, fake: fakeHarness(sessions) } }),
    'every shipped harness is taken as it is',
  );
});

test("the facade's tick refuses any argument, with exit 2 and nothing started — a ceiling handed to it is not dropped", async () => {
  const sessions = new Map<string, Sighting>();
  const engine = createEngine({ journal: memoryJournal(), harnesses: { fake: fakeHarness(sessions) }, defaultHarness: 'fake' });
  await engine.file({ brief: 'b', cwd: '/r', id: 'waits' });
  const tick = engine.tick as unknown as (...args: unknown[]) => Promise<unknown>;
  for (const args of [[3], [3, { fake: 'fake' }], [undefined]]) {
    await assert.rejects(tick(...args), (e: Error & { exitCode?: number }) => {
      assert.equal(e.exitCode, 2, e.message);
      assert.match(
        e.message,
        new RegExp(
          `^tick: the pass takes no arguments, and was handed ${args.length}: it has no ceiling and no pools since stage 4c part 2\\. File tasks`,
        ),
      );
      return true;
    });
  }
  assert.equal(sessions.size, 0, 'nothing started');
  assert.equal((await engine.view('waits')).phase, 'pending');
});

test("file() refuses claude.remoteControl on every harness with no such flag, by name — codex, claude-detached and a check — ahead of the bag's own refusal; claude journals it; and the old place is refused naming the new one", async () => {
  const check: HarnessSpec = { name: 'check', command: () => ({ cmd: 'sh', args: ['-c', 'true'] }) };
  const journal = memoryJournal();
  const engine = createEngine({ journal, harnesses: { claude: 'claude-bg', codex, 'claude-detached': claudeDetached, check } });
  for (const harness of ['codex', 'claude-detached', 'check']) {
    await refused(
      engine,
      { brief: 'b', cwd: '/r', harness, config: { claude: { remoteControl: true } } },
      new RegExp(
        `^file: \`claude\\.remoteControl\` asks for a session bridged to claude\\.ai, and the \`${harness}\` harness has no such flag.*File the task on \`claude\`, or leave \`claude\\.remoteControl\` off`,
      ),
    );
  }
  for (const config of [{ remoteControl: true }, { remoteControl: false }, { remoteControl: 'true' }]) {
    await refused(
      engine,
      { brief: 'b', cwd: '/r', config: config as never },
      /^file: `remoteControl` is Claude Code's own flag, no harness argument of its own since 2026-09-25: file it with Claude Code's flags, as `config: \{ claude: \{ remoteControl: true \} \}`/,
    );
  }
  await refused(engine, { brief: 'b', cwd: '/r', remoteControl: true } as never, /^file: `remoteControl` is Claude Code's own flag/);
  assert.deepEqual(await journal.list(), [], 'nothing was journalled');

  const id = await engine.file({ brief: 'b', cwd: '/r', config: { claude: { remoteControl: true } } });
  const [filed] = await journal.read(id);
  assert.deepEqual((filed as { config?: object }).config, { claude: { remoteControl: true } }, 'on the record, for the runner');
  assert.equal((await engine.view(id)).state.config?.claude?.remoteControl, true);

  const bare = createEngine({ journal: memoryJournal(), harnesses: { codex } });
  await refused(
    bare,
    { brief: 'b', cwd: '/r', config: { claude: { remoteControl: true } } },
    /the `codex` harness has no such flag.*Leave `claude\.remoteControl` off: none of this engine's harnesses bridges a session/,
  );
});

test('file() refuses background on every harness with no such mode, and remoteControl on a job, which a task at shipped defaults is unless it asks for a background session — claude journals a background session, bridged or not', async () => {
  const { journal, engine } = shipped();
  for (const harness of ['codex', 'claude-detached']) {
    await refused(
      engine,
      { brief: 'b', cwd: '/r', harness, config: { background: true } },
      new RegExp(
        `\`background: true\` asks for a Claude Code background session, and the \`${harness}\` harness has no such mode\\. File the task on \`claude\`, or leave \`background\` off`,
      ),
    );
  }
  const bg = createEngine({ journal: memoryJournal(), harnesses: { claude: 'claude-bg' } });
  await refused(
    bg,
    { brief: 'b', cwd: '/r', config: { background: true } },
    /the `claude` harness has no such mode: every session of it is one already\. Leave `background` off/,
  );
  await refused(
    engine,
    { brief: 'b', cwd: '/r', config: { claude: { remoteControl: true } } },
    /^file: `claude\.remoteControl` bridges a session to claude\.ai, and only a background session \(`claude --bg`\) can be bridged.*Give `config\.background: true` as well, or leave `claude\.remoteControl` off/,
  );
  assert.deepEqual(await journal.list(), [], 'nothing was journalled');

  for (const config of [
    { background: true },
    { background: true, claude: { remoteControl: true } },
    { background: false },
  ] as HarnessArgs[]) {
    const id = await engine.file({ brief: 'b', cwd: '/r', config });
    const [filed] = await journal.read(id);
    assert.deepEqual((filed as { config?: object }).config, config, 'on the record, for the runner');
  }
});

test('say() to a job at shipped defaults is refused only as any task is — here, before its attempt — and never for its mode', async () => {
  const { engine } = shipped();
  for (const config of [undefined, { permissionMode: 'bypassPermissions' as const }]) {
    const id = await engine.file({ brief: 'b', cwd: '/r', config });
    await assert.rejects(engine.say(id, 'hello'), (e: Error & { exitCode?: number }) => {
      assert.equal(e.exitCode, 2, e.message);
      assert.match(
        e.message,
        /has not started an attempt yet/,
        "a job's words go on its stdin, which takes a mode Claude Code's inbox does not",
      );
      return true;
    });
  }
  const bg = await engine.file({ brief: 'b', cwd: '/r', config: { background: true, permissionMode: 'bypassPermissions' } });
  await assert.rejects(
    engine.say(bg, 'hello'),
    (e: Error & { exitCode?: number }) => e.exitCode === 2 && /permissionMode: bypassPermissions`/.test(e.message),
    "a background session's words are refused in that mode before anything is read",
  );
});

test('file() refuses a contextTokens that is not a whole number of tokens, one outside what Claude Code takes — which it refuses as it parses its arguments, so a spawn would fail on every pass — and any on codex, and journals one both Claude harnesses take, both ends of the range included', async () => {
  const { journal, engine } = shipped();
  for (const contextTokens of [0, -200000, 150000.5, Number.NaN, Infinity, '200000' as unknown as number, '200k' as unknown as number]) {
    await refused(
      engine,
      { brief: 'b', cwd: '/r', config: { contextTokens } },
      /`contextTokens: .*` is not a number of tokens\. Give a whole number of tokens, like 200000/,
    );
  }
  for (const harness of ['claude', 'claude-detached']) {
    for (const contextTokens of [99_999, 1_000_001, 1_000]) {
      await refused(
        engine,
        { brief: 'b', cwd: '/r', harness, config: { contextTokens } },
        new RegExp(`\`contextTokens: ${contextTokens}\` is outside the windows the \`${harness}\` harness takes.*from 100000 to 1000000`),
      );
    }
  }
  await refused(
    engine,
    { brief: 'b', cwd: '/r', harness: 'codex', config: { contextTokens: 200000 } },
    /`contextTokens: 200000` sets the session's context window, and the `codex` harness has no such knob.*File the task on `claude` or `claude-detached`/,
  );
  assert.deepEqual(await journal.list(), [], 'nothing was journalled');

  for (const [harness, contextTokens] of [
    ['claude', 200000],
    ['claude-detached', 100000],
    ['claude', 1000000],
  ] as const) {
    const id = await engine.file({ brief: 'b', cwd: '/r', harness, config: { contextTokens } });
    const [filed] = await journal.read(id);
    assert.equal((filed as { config?: { contextTokens?: number } }).config?.contextTokens, contextTokens, 'on the record, for the runner');
    assert.equal((await engine.view(id)).state.config?.contextTokens, contextTokens);
  }
});

test('a HarnessSpec is given a contextTokens only when it declares the windows it takes, and a runner is asked nothing', async () => {
  const bare: HarnessSpec = { name: 'bare', command: () => ({ cmd: 'sh', args: ['-c', 'true'] }) };
  const windowed: HarnessSpec = { ...bare, name: 'windowed', contextTokens: { least: 8_000, most: 32_000 } };
  const runner: PromiseRunner = { spawn: async () => {}, observe: async () => new Map(), stop: async () => {}, logs: async () => '' };
  const engine = createEngine({ journal: memoryJournal(), harnesses: { bare, windowed, runner } });
  await refused(
    engine,
    { brief: 'b', cwd: '/r', harness: 'bare', config: { contextTokens: 16_000 } },
    /the `bare` harness has no such knob: it would run on its own window.*File the task on `windowed`, whose sessions compact past it, or leave `contextTokens` off/,
  );
  await refused(engine, { brief: 'b', cwd: '/r', harness: 'windowed', config: { contextTokens: 64_000 } }, /from 8000 to 32000/);
  assert.ok(await engine.file({ brief: 'b', cwd: '/r', harness: 'windowed', config: { contextTokens: 16_000 } }));
  assert.ok(await engine.file({ brief: 'b', cwd: '/r', harness: 'runner', config: { contextTokens: 5 } }), "a runner's own business");

  const none = createEngine({ journal: memoryJournal(), harnesses: { codex } });
  await refused(
    none,
    { brief: 'b', cwd: '/r', config: { contextTokens: 200000 } },
    /Leave `contextTokens` off: none of this engine's harnesses sets a session's window/,
  );
});

test('a harness brought as a runner is asked nothing of claude.remoteControl, and is handed it on the spawn', async () => {
  const sessions = new Map<string, Sighting>();
  const asked: boolean[] = [];
  const runner = fakeHarness(sessions);
  const engine = createEngine({
    journal: memoryJournal(),
    defaultHarness: 'mine',
    harnesses: {
      mine: {
        ...runner,
        spawn: async (r) => {
          asked.push(r.config?.claude?.remoteControl === true);
          await runner.spawn(r);
        },
      },
    },
  });
  await engine.file({ brief: 'b', cwd: '/r', config: { claude: { remoteControl: true } } });
  await engine.tick();
  assert.deepEqual(asked, [true], 'its to honour');
});

test('a usage whose key has no value, as `{ costUsd: undefined }` that the files journal writes without the key, is not something new to write down — measured is written once a value arrives, not on every pass', async () => {
  const root = scratch('ae-measured-');
  const sessions = new Map<string, Sighting>();
  const engine = createEngine({ root, harnesses: { fake: fakeHarness(sessions) }, defaultHarness: 'fake' });
  const id = await engine.file({ brief: 'b', cwd: '/repo' });
  await engine.tick();
  const measured = async () =>
    (await engine.feed(0)).entries.filter((e) => e.taskId === id && e.event.kind === 'measured').map((e) => e.event);

  for (const [k, v] of sessions) sessions.set(k, { ...v, state: 'completed', usage: { turns: 3, costUsd: undefined } });
  for (let i = 0; i < 4; i++) await engine.tick();
  assert.equal((await engine.view(id)).state.settled, 'succeeded');
  assert.deepEqual(await measured(), [], 'the end already says turns, and nothing says a cost: nothing to write, on any pass');

  for (const [k, v] of sessions) sessions.set(k, { ...v, usage: { turns: 3, costUsd: 0.5 } });
  for (let i = 0; i < 3; i++) await engine.tick();
  assert.equal((await measured()).length, 1, 'a cost that arrives is written once');
  assert.deepEqual((await engine.view(id)).state.attempts[0]?.usage, { turns: 3, costUsd: 0.5 });
});

test('a PromiseRunner whose spawn rejects is not taken to have started nothing — unless it says so', async () => {
  const sessions = new Map<string, Sighting>();
  const launcher: PromiseRunner = {
    ...fakeHarness(sessions),
    async spawn(r) {
      if (r.brief === 'refuse') throw Object.assign(new Error('quota: no sessions today'), { refused: true });
      sessions.set(r.name, { sessionId: `s-${sessions.size + 1}`, state: 'working' });
      throw new Error('launcher: lost the acknowledgement');
    },
  };
  const engine = createEngine({ journal: memoryJournal(), harnesses: { launcher }, defaultHarness: 'launcher' });
  const maybe = await engine.file({ brief: 'start', cwd: '/r' });
  const no = await engine.file({ brief: 'refuse', cwd: '/r' });

  await engine.tick();
  assert.equal((await engine.view(no)).state.settled, 'failed', 'said nothing started: unstartable');
  assert.equal((await engine.view(no)).state.attempts[0]?.reason, 'unstartable');
  assert.equal((await engine.view(maybe)).state.settled, null, 'said nothing: not failed');

  await engine.tick();
  assert.equal((await engine.view(maybe)).phase, 'running (working)', 'and its session is adopted');
});
