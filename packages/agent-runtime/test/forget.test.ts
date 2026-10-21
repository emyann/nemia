/**
 * `Engine.forget` on the files store: what a settled task keeps — its journal, its lines in the feed, the files its harness keeps of
 * each session — counted without `yes` and removed with it; each guard refusing before anything is removed; and what reads the store
 * after a forget (`ae feed`, `sweep`, another engine's pass).
 */
import { Effect } from 'effect';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Engine, Journal, type EngineShape, type HarnessSpec, type Sighting } from '../src/index.ts';
import { RunnerError, type RunnerOps } from '../src/harness/index.ts';
import { forgetAsked, forgetLines, main } from '../src/cli/main.ts';
import { scratch } from './scratch.ts';
import { builtEngine } from './engine.ts';
import { until, WAITED } from '../src/waits/index.ts';
import { asyncOps, type AsyncRunner } from './promise-runner.ts';

const refusing: AsyncRunner = {
  spawn: async () => {
    throw Object.assign(new Error('not today'), { refused: true });
  },
  observe: async () => new Map(),
  stop: async () => {},
  logs: async () => '',
};

/** What the fake harness's look answers, and what its `forget` keeps of each session, by name; set by a test as it goes. */
type World = { seen: Map<string, Sighting>; unread: Set<string>; kept: Map<string, string[]>; forgetFails?: boolean };

/** A harness that refuses every spawn, so each task settles on its first pass, and looks and forgets as `world` says. */
const fakeHarness = (world: World): RunnerOps => ({
  ...asyncOps(refusing),
  observeFor: () => Effect.succeed({ seen: world.seen, unread: world.unread }),
  forget: ({ name }, { dry }) => {
    if (world.forgetFails) return Effect.fail(new RunnerError({ verb: 'forget', message: `fake: ${name} cannot be removed` }));
    const files = world.kept.get(name) ?? [];
    if (!dry) world.kept.delete(name);
    return Effect.succeed({ files, left: [] });
  },
});

const freshWorld = (): World => ({ seen: new Map(), unread: new Set(), kept: new Map() });

/**
 * A store on the files under a scratch root, an engine on the fake harness, and `n` tasks settled on it; `counting: false` takes the
 * store's own count of feed lines (`feedLines`) away.
 */
const settledStore = async (n: number, world = freshWorld(), { counting = true } = {}) => {
  const root = scratch('ae-forget-root-');
  const cwd = scratch('ae-forget-cwd-');
  const { feedLines, ...uncounted } = Journal.filesOps(root);
  const journal = counting ? { ...uncounted, feedLines } : uncounted;
  const engine = builtEngine(Engine.layer({ root, journal, harnesses: { fake: fakeHarness(world) }, defaultHarness: 'fake' }));
  const ids: string[] = [];
  for (let i = 0; i < n; i++) ids.push(await Effect.runPromise(engine.file({ brief: `task ${i}`, cwd, harness: 'fake' })));
  await Effect.runPromise(engine.tick());
  return { root, cwd, engine, ids, world };
};

const journalOf = (root: string, id: string) => path.join(root, 'tasks', `${id}.jsonl`);
const feedTasks = (engine: EngineShape) => Effect.runSync(engine.feed(0)).entries.map((e) => e.taskId);

/** The message of what `effect` failed with, and its tag; fails the test if it succeeded. */
const refusalOf = async (effect: Effect.Effect<unknown, { _tag: string; message: string }>) => {
  const exit = await Effect.runPromise(Effect.flip(effect));
  return { tag: exit._tag, message: exit.message };
};

const sighting = (name: string, state: Sighting['state'], held?: boolean): Sighting => ({
  sessionId: name,
  state,
  ...(held === undefined ? {} : { held }),
});

test('without yes, forget counts what a settled task keeps and removes nothing; with it, the journal, the feed lines and the session files go', async () => {
  const { root, engine, ids, world } = await settledStore(2);
  const [x, y] = ids as [string, string];
  world.kept.set(`ae/${x}/1`, ['/runs/x.json']);
  const lines = feedTasks(engine).filter((id) => id === x).length;
  assert.ok(lines > 0, 'the feed names the task');

  const dry = await Effect.runPromise(engine.forget([x]));
  assert.deepEqual(dry, {
    forgotten: false,
    tasks: [
      {
        taskId: x,
        journalBytes: fs.statSync(journalOf(root, x)).size,
        feedLines: lines,
        sessions: [{ name: `ae/${x}/1`, files: ['/runs/x.json'], left: [] }],
      },
    ],
  });
  assert.ok(fs.existsSync(journalOf(root, x)), 'a count removes no journal');
  assert.ok(world.kept.has(`ae/${x}/1`), 'nor a session file');

  const done = await Effect.runPromise(engine.forget([x], { yes: true }));
  assert.equal(done.forgotten, true);
  assert.equal(done.feed?.linesForgotten, lines, 'every line of the task left the feed');
  assert.ok(!fs.existsSync(journalOf(root, x)), 'the journal went');
  assert.ok(!world.kept.has(`ae/${x}/1`), 'and the session files, through the harness');
  assert.deepEqual(new Set(feedTasks(engine)), new Set([y]), 'the other task keeps its lines');
  assert.deepEqual(
    (await Effect.runPromise(engine.list())).views.map((v) => v.state.taskId),
    [y],
  );
  assert.equal(Effect.runSync(engine.feed(0)).forgotten, lines, 'a read from the start says how many lines were forgotten');
});

test('a forget with yes reads the feed once, in the removal, and counts each task off what the removal forgot', async () => {
  const { root, engine, ids } = await settledStore(20);
  const [x] = ids as [string];
  const lines = feedTasks(engine).filter((id) => id === x).length;
  const feedBytes = fs.statSync(path.join(root, 'feed.jsonl')).size;
  const journalBytes = fs.statSync(journalOf(root, x)).size;
  const { done, io } = await Effect.runPromise(
    engine.tallied(
      Effect.gen(function* () {
        const done = yield* engine.forget([x], { yes: true });
        return { done, io: yield* engine.io() };
      }),
    ),
  );
  assert.ok(
    io.bytesRead < journalBytes + 1.5 * feedBytes,
    `the forget read ${io.bytesRead} bytes, under its journal's ${journalBytes} and one and a half times the feed's ${feedBytes}`,
  );
  assert.deepEqual(
    done.tasks.map((t) => [t.taskId, t.feedLines]),
    [[x, lines]],
  );
  assert.deepEqual(Object.keys(done.feed ?? {}), ['linesForgotten', 'bytesBefore', 'bytesAfter'], 'the feed is told as it was');
  assert.equal(done.feed?.linesForgotten, lines);
});

test('a forget counts the feed lines it removes, a line no runtime wrote among them, without and with yes alike', async () => {
  const { root, engine, ids } = await settledStore(2);
  const [x] = ids as [string];
  const decoded = feedTasks(engine).filter((id) => id === x).length;
  fs.appendFileSync(path.join(root, 'feed.jsonl'), JSON.stringify({ taskId: x, event: { kind: 'nobody wrote this' } }) + '\n');
  assert.equal(feedTasks(engine).filter((id) => id === x).length, decoded, 'a read of the feed skips the line it cannot decode');
  const dry = await Effect.runPromise(engine.forget([x]));
  assert.equal(dry.tasks[0]?.feedLines, decoded + 1, 'the count decodes no line: the one no runtime wrote is counted');
  const done = await Effect.runPromise(engine.forget([x], { yes: true }));
  assert.deepEqual([done.tasks[0]?.feedLines, done.feed?.linesForgotten], [decoded + 1, decoded + 1]);
});

test('a store with no count of its own feed lines gives a forget the same counts, off its feed read whole', async () => {
  const reports = [];
  for (const counting of [true, false]) {
    const { engine, ids } = await settledStore(3, freshWorld(), { counting });
    const [x, y] = ids as [string, string];
    const dry = await Effect.runPromise(engine.forget([x, y]));
    const done = await Effect.runPromise(engine.forget([x, y], { yes: true }));
    const counts = (r: typeof dry) => r.tasks.map((t) => t.feedLines);
    assert.ok(
      counts(dry).every((n) => n > 0),
      'each task has lines in the feed',
    );
    reports.push({ dry: counts(dry), done: counts(done), forgotten: done.feed?.linesForgotten });
  }
  assert.deepEqual(reports[1], reports[0]);
});

test('REFUSED: an id the store does not list, before anything of the listed one is removed', async () => {
  const { root, engine, ids } = await settledStore(1);
  const r = await refusalOf(engine.forget([ids[0], 'nobody'], { yes: true }));
  assert.deepEqual(r, {
    tag: 'ForgetRefused',
    message: 'no task nobody in this store; `ae ls` lists them: nothing was forgotten.',
  });
  assert.ok(fs.existsSync(journalOf(root, ids[0])), 'the task listed is kept');
});

test('REFUSED: a task not settled, in words that say where it stands and how to settle it', async () => {
  const { root, cwd, engine } = await settledStore(0);
  const id = await Effect.runPromise(engine.file({ brief: 'later', cwd, harness: 'fake', queued: true }));
  const r = await refusalOf(engine.forget([id], { yes: true }));
  assert.equal(
    r.message,
    `task ${id} is not started: forgetting it would lose its journal while a session may still write to it; stop it with \`ae stop ${id}\`, wait for it to settle, then forget it: nothing was forgotten.`,
  );
  assert.ok(fs.existsSync(journalOf(root, id)));
});

test('REFUSED: a journal that cannot be read, so whether it settled cannot be told', async () => {
  const { root, ids } = await settledStore(1);
  fs.appendFileSync(journalOf(root, ids[0]), '{"kind":"nothing a runtime wrote"}\n');
  const fresh = builtEngine(Engine.layer({ root, harnesses: { fake: fakeHarness(freshWorld()) }, defaultHarness: 'fake' }));
  const r = await refusalOf(fresh.forget(ids, { yes: true }));
  assert.match(
    r.message,
    /: whether it settled cannot be told, and forgetting it would lose a record nobody has read: nothing was forgotten\.$/,
  );
  assert.ok(fs.existsSync(journalOf(root, ids[0])));
});

test('REFUSED: a task filed on a harness this engine does not have, whose session files cannot be found', async () => {
  const { root, ids } = await settledStore(1);
  const other = builtEngine(Engine.layer({ root, harnesses: { other: fakeHarness(freshWorld()) }, defaultHarness: 'other' }));
  const r = await refusalOf(other.forget(ids, { yes: true }));
  assert.equal(
    r.message,
    `task ${ids[0]} ran on the \`fake\` harness, which this engine does not have, so its session files cannot be found; give the engine the \`fake\` harness again: nothing was forgotten.`,
  );
  assert.ok(fs.existsSync(journalOf(root, ids[0])));
});

test('REFUSED: a session its harness still holds, at work or its process kept, and one it could not be read for', async () => {
  const { root, engine, ids, world } = await settledStore(1);
  const id = ids[0];
  const name = `ae/${id}/1`;
  const held = `task ${id}'s harness, \`fake\`, still holds session ${name}; the next pass lets a finished session go; forget it after: nothing was forgotten.`;

  world.seen.set(name, sighting(name, 'working'));
  assert.equal((await refusalOf(engine.forget([id], { yes: true }))).message, held, 'at work');
  world.seen.set(name, sighting(name, 'completed', true));
  assert.equal((await refusalOf(engine.forget([id], { yes: true }))).message, held, 'ended, its process held');
  world.seen.clear();
  world.unread.add(name);
  assert.equal(
    (await refusalOf(engine.forget([id], { yes: true }))).message,
    `task ${id}'s harness, \`fake\`, could not be read for session ${name}, so whether it still holds it cannot be told; forget it once \`ae ls\` reads it: nothing was forgotten.`,
  );
  assert.ok(fs.existsSync(journalOf(root, id)), 'nothing was removed by any of them');
});

test('a session its harness still lists, ended and let go, is no refusal', async () => {
  const { root, engine, ids, world } = await settledStore(1);
  const name = `ae/${ids[0]}/1`;
  world.seen.set(name, sighting(name, 'completed', false));
  assert.equal((await Effect.runPromise(engine.forget(ids, { yes: true }))).forgotten, true);
  assert.ok(!fs.existsSync(journalOf(root, ids[0])));
});

test('a forget cut short by a harness that could not remove its files keeps the journal, and the next forget finishes it', async () => {
  const { root, engine, ids, world } = await settledStore(1);
  world.forgetFails = true;
  const r = await refusalOf(engine.forget(ids, { yes: true }));
  assert.equal(r.tag, 'RunnerError');
  assert.ok(fs.existsSync(journalOf(root, ids[0])), 'the journal is removed last, so a forget can be asked again');
  world.forgetFails = false;
  assert.equal((await Effect.runPromise(engine.forget(ids, { yes: true }))).forgotten, true);
  assert.ok(!fs.existsSync(journalOf(root, ids[0])));
});

test('REFUSED: an append to a task forgotten, but its filing', async () => {
  const { root, engine, ids } = await settledStore(1);
  await Effect.runPromise(engine.forget(ids, { yes: true }));
  const store = Journal.filesOps(root);
  const err = await Effect.runPromise(Effect.flip(store.append(ids[0], { kind: 'stop-requested', at: new Date().toISOString() })));
  assert.equal(
    err.message,
    `${ids[0]} has no journal (${journalOf(root, ids[0])}): it was forgotten, or never filed, and is not written to again. File a new task.`,
  );
  assert.ok(!fs.existsSync(journalOf(root, ids[0])), 'and no journal is made for it');
});

test("another engine's pass over the store after a forget leaves the task out, its memo kept or not", async () => {
  const { root, engine, ids } = await settledStore(3);
  await Effect.runPromise(engine.tick());
  const other = builtEngine(Engine.layer({ root, harnesses: { fake: fakeHarness(freshWorld()) }, defaultHarness: 'fake' }));
  await Effect.runPromise(other.forget([ids[1]], { yes: true }));
  const report = await Effect.runPromise(engine.tick());
  assert.equal(report.tasks, 2, 'the forgotten task is no longer counted');
  assert.deepEqual([report.refused, report.unreadable], [[], []]);
  assert.deepEqual((await Effect.runPromise(engine.list())).views.map((v) => v.state.taskId).sort(), [ids[0], ids[2]].sort());
});

test('after a forget, sweep frees a body only the forgotten task named, and keeps one a kept task still names', async () => {
  const { root, cwd, engine } = await settledStore(0);
  const shared = 's'.repeat(2048);
  const own = 'o'.repeat(2048);
  const x = await Effect.runPromise(engine.file({ brief: shared + own, briefParts: [shared, own], cwd, harness: 'fake' }));
  await Effect.runPromise(engine.file({ brief: shared, cwd, harness: 'fake' }));
  await Effect.runPromise(engine.tick());
  await Effect.runPromise(engine.forget([x], { yes: true }));
  const bodies = path.join(root, 'bodies');
  const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  for (const f of fs.readdirSync(bodies)) fs.utimesSync(path.join(bodies, f), old, old);
  const swept = await Effect.runPromise(engine.sweep({ yes: true }));
  assert.deepEqual([swept.removed, swept.kept], [1, 1]);
  assert.deepEqual(fs.readdirSync(bodies).length, 1, 'the shared body is kept');
});

test('a pass over settled tasks the memo skips writes nothing and takes no lock', async () => {
  const { engine } = await settledStore(5);
  await Effect.runPromise(engine.tick());
  const before = Effect.runSync(engine.io());
  await Effect.runPromise(engine.tick());
  const after = Effect.runSync(engine.io());
  assert.deepEqual([after.writes - before.writes, after.locks - before.locks], [0, 0]);
});

const check: HarnessSpec = { name: 'check', command: () => ({ cmd: 'sh', args: ['-c', 'echo checked'] }) };

test("forget removes the run files a detached harness keeps of a settled session, and no other session's", WAITED, async (t) => {
  const root = scratch('ae-forget-root-');
  const engine = builtEngine(Engine.layer({ root, harnesses: { check }, defaultHarness: 'check' }));
  const id = await Effect.runPromise(engine.file({ brief: 'b', cwd: scratch('ae-forget-cwd-') }));
  await until(
    t,
    async () => {
      if ((await Effect.runPromise(engine.view(id))).state.settled) return true;
      await Effect.runPromise(engine.tick());
      return false;
    },
    `${id} settled`,
    { everyMs: 50 },
  );
  await Effect.runPromise(engine.tick());
  const runs = path.join(root, 'runs', 'check');
  const files = fs.readdirSync(runs);
  assert.ok(files.length > 0, 'the run left files');
  fs.writeFileSync(path.join(runs, 'ae-other-1.json'), '{}');
  const dry = await Effect.runPromise(engine.forget([id]));
  assert.deepEqual(dry.tasks[0]?.sessions[0]?.files.map((f) => path.basename(f)).sort(), files.sort());
  await Effect.runPromise(engine.forget([id], { yes: true }));
  assert.deepEqual(fs.readdirSync(runs), ['ae-other-1.json'], "every run file of the session went, and another session's stayed");
});

/** What `main(argv)` printed with `console.log`, on the board at `root`. */
const printed = async (root: string, argv: string[]): Promise<string[]> => {
  const lines: string[] = [];
  const log = console.log;
  const given = process.env.AE_ROOT;
  process.env.AE_ROOT = root;
  console.log = (...args: unknown[]) => void lines.push(args.join(' '));
  try {
    await main(argv);
  } finally {
    console.log = log;
    if (given === undefined) delete process.env.AE_ROOT;
    else process.env.AE_ROOT = given;
  }
  return lines;
};

test('ae feed 0 says how many lines of forgotten tasks were there, and ae forget refuses an id the store does not list', async () => {
  const { root, engine, ids } = await settledStore(2);
  const lines = feedTasks(engine).filter((id) => id === ids[0]).length;
  await Effect.runPromise(engine.forget([ids[0]], { yes: true }));
  const out = await printed(root, ['feed', '0']);
  assert.equal(out[0], `${lines} lines of forgotten tasks were here, after cursor 0`);
  assert.ok(!out.some((l) => l.includes(ids[0])), 'and no line of the forgotten task');
  const err = await printed(root, ['forget', 'nobody']).then(
    () => assert.fail('an unknown id was taken'),
    (e: Error & { exitCode?: number }) => e,
  );
  assert.equal(err.exitCode, 2);
  assert.match(err.message, /no task nobody in this store; `ae ls` lists them: nothing was forgotten\.$/);
});

test('REFUSED: ae forget given no id, or a flag but --yes, with exit code 2', () => {
  for (const rest of [[], ['--yes'], ['x', '--all']]) {
    const err = (() => {
      try {
        forgetAsked(rest);
      } catch (e) {
        return e as Error & { exitCode?: number };
      }
      return assert.fail(`${rest.join(' ')} was taken`);
    })();
    assert.equal(err.exitCode, 2);
    assert.match(
      err.message,
      /^forget: takes the ids of settled tasks, and `--yes` to remove them; it was handed .*: nothing was forgotten\.$/,
    );
  }
  assert.deepEqual(forgetAsked(['a', 'b', '--yes']), { taskIds: ['a', 'b'], yes: true });
  assert.deepEqual(forgetAsked(['a']), { taskIds: ['a'], yes: false });
});

test('ae forget prints per task what it keeps, what each harness leaves, and the command that removes it', () => {
  const tasks = [
    { taskId: 't1', journalBytes: 120, feedLines: 4, sessions: [{ name: 'ae/t1/1', files: ['/r/a.json'], left: ['a transcript'] }] },
  ];
  assert.deepEqual(forgetLines({ forgotten: false, tasks }), [
    't1: journal 120 bytes, 4 feed line(s), 1 session file(s)',
    '  /r/a.json',
    '  left: a transcript',
    'nothing was forgotten: `ae forget t1 --yes` removes it',
  ]);
  assert.equal(
    forgetLines({ forgotten: true, tasks, feed: { linesForgotten: 4, bytesBefore: 900, bytesAfter: 500 } }).at(-1),
    'forgotten; the feed lost 4 line(s), 900 bytes to 500',
  );
});
