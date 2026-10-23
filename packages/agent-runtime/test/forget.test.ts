/**
 * `Engine.forget` on the files store: what a settled task keeps — its journal, its lines in the feed, the files its harness keeps of
 * each session — counted without `yes` and removed with it; each guard refusing before anything is removed; and what reads the store
 * after a forget (`ae feed`, `ae sweep`, another engine's pass).
 *
 * Told as one story over a store of settled tasks, then a table of every refusal (the verb's, and `ae forget`'s and `ae sweep`'s
 * arguments) and one of what the two commands take and print. A forget cut short, a store with no count of its feed lines, and a
 * detached harness's run files stay focused.
 */
import { Effect } from 'effect';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Engine, Journal, type EngineShape, type HarnessSpec, type Sighting } from '../src/index.ts';
import { RunnerError, type RunnerOps } from '../src/harness/index.ts';
import { forgetAsked, forgetLines, main, sweepAsked, sweepLine } from '../src/cli/main.ts';
import { scratch } from './scratch.ts';
import { builtEngine } from './engine.ts';
import { story } from './checkpoints.ts';
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
const linesOf = (engine: EngineShape, id: string) => feedTasks(engine).filter((x) => x === id).length;

/** What `effect` failed with — its tag, the task it names and its words; fails the test if it succeeded. */
const refusalOf = async (effect: Effect.Effect<unknown, { _tag: string; message: string; taskId?: string }>) => {
  const exit = await Effect.runPromise(Effect.flip(effect));
  return { tag: exit._tag, taskId: exit.taskId, message: exit.message };
};

/** Asserts `words` holds each of `names`: the id, the harness, the command — what a person needs to act on it. */
const naming = (words: string, ...names: string[]) => {
  for (const name of names) assert.ok(words.includes(name), `${JSON.stringify(name)} in: ${words}`);
};

/** A `ForgetRefused` on `taskId`, in words that name `names` and end saying nothing was forgotten. */
const forgetRefused = (r: Awaited<ReturnType<typeof refusalOf>>, taskId: string, ...names: string[]) => {
  assert.deepEqual([r.tag, r.taskId], ['ForgetRefused', taskId]);
  naming(r.message, ...names);
  assert.ok(r.message.endsWith(': nothing was forgotten.'), r.message);
};

const sighting = (name: string, state: Sighting['state'], held?: boolean): Sighting => ({
  sessionId: name,
  state,
  ...(held === undefined ? {} : { held }),
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

/** What a call that should refuse with an exit code threw. */
const thrownBy = async (call: () => unknown): Promise<Error & { exitCode?: number }> => {
  try {
    await call();
  } catch (e) {
    return e as Error & { exitCode?: number };
  }
  return assert.fail('it was taken');
};

test('`ae forget`: a settled task is counted, then removed with its feed lines and session files, and the store reads on without it', async (t) => {
  const s = story(t);
  const { root, cwd, engine, ids, world } = await settledStore(20);
  const shared = 's'.repeat(2048);
  const own = 'o'.repeat(2048);
  const x2 = await Effect.runPromise(engine.file({ brief: shared + own, briefParts: [shared, own], cwd, harness: 'fake' }));
  const y2 = await Effect.runPromise(engine.file({ brief: shared, cwd, harness: 'fake' }));
  await Effect.runPromise(engine.tick());
  const [x] = ids as [string];
  const forgotten = new Set<string>();
  let linesForgottenSoFar = 0;
  const left = () => [...ids, x2, y2].filter((id) => !forgotten.has(id)).sort();
  const lines = linesOf(engine, x);

  await s.test('without yes, forget counts what a settled task keeps and removes nothing', async () => {
    world.kept.set(`ae/${x}/1`, ['/runs/x.json']);
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
  });

  await s.test('with yes, the journal, the feed lines and the session files go, the feed read once, in the removal', async () => {
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
    assert.equal(done.forgotten, true);
    assert.deepEqual(
      done.tasks.map((task) => [task.taskId, task.feedLines]),
      [[x, lines]],
    );
    assert.deepEqual(Object.keys(done.feed ?? {}), ['linesForgotten', 'bytesBefore', 'bytesAfter'], 'the feed is told as it was');
    assert.equal(done.feed?.linesForgotten, lines, 'every line of the task left the feed');
    forgotten.add(x);
    linesForgottenSoFar += lines;
    assert.ok(!fs.existsSync(journalOf(root, x)), 'the journal went');
    assert.ok(!world.kept.has(`ae/${x}/1`), 'and the session files, through the harness');
    assert.deepEqual([...new Set(feedTasks(engine))].sort(), left(), 'every other task keeps its lines');
    assert.deepEqual((await Effect.runPromise(engine.list())).views.map((v) => v.state.taskId).sort(), left());
    assert.equal(Effect.runSync(engine.feed(0)).forgotten, linesForgottenSoFar, 'a read from the start says how many lines were forgotten');
  });

  await s.test('a forget counts the feed lines it removes, a line no runtime wrote among them, without and with yes alike', async () => {
    const id = ids[1];
    const decoded = linesOf(engine, id);
    fs.appendFileSync(path.join(root, 'feed.jsonl'), JSON.stringify({ taskId: id, event: { kind: 'nobody wrote this' } }) + '\n');
    assert.equal(linesOf(engine, id), decoded, 'a read of the feed skips the line it cannot decode');
    const dry = await Effect.runPromise(engine.forget([id]));
    assert.equal(dry.tasks[0]?.feedLines, decoded + 1, 'the count decodes no line: the one no runtime wrote is counted');
    const done = await Effect.runPromise(engine.forget([id], { yes: true }));
    assert.deepEqual([done.tasks[0]?.feedLines, done.feed?.linesForgotten], [decoded + 1, decoded + 1]);
    forgotten.add(id);
    linesForgottenSoFar += decoded + 1;
  });

  await s.test('a session its harness still lists, ended and let go, is no refusal', async () => {
    const id = ids[2];
    const name = `ae/${id}/1`;
    world.seen.set(name, sighting(name, 'completed', false));
    const done = await Effect.runPromise(engine.forget([id], { yes: true }));
    assert.equal(done.forgotten, true);
    assert.ok(!fs.existsSync(journalOf(root, id)));
    forgotten.add(id);
    linesForgottenSoFar += done.feed?.linesForgotten ?? 0;
  });

  await s.test('an append to a task forgotten is refused, and no journal is made for it', async () => {
    const err = await Effect.runPromise(
      Effect.flip(Journal.filesOps(root).append(x, { kind: 'stop-requested', at: new Date().toISOString() })),
    );
    assert.equal(err._tag, 'JournalError');
    naming(err.message, `${x} has no journal (${journalOf(root, x)})`, 'File a new task');
    assert.ok(!fs.existsSync(journalOf(root, x)), 'and no journal is made for it');
  });

  await s.test("another engine's pass over the store after a forget leaves the task out, its memo kept or not", async () => {
    await Effect.runPromise(engine.tick());
    const other = builtEngine(Engine.layer({ root, harnesses: { fake: fakeHarness(freshWorld()) }, defaultHarness: 'fake' }));
    const done = await Effect.runPromise(other.forget([ids[3]], { yes: true }));
    forgotten.add(ids[3]);
    linesForgottenSoFar += done.feed?.linesForgotten ?? 0;
    const report = await Effect.runPromise(engine.tick());
    assert.equal(report.tasks, left().length, 'the forgotten task is no longer counted');
    assert.deepEqual([report.refused, report.unreadable], [[], []]);
    assert.deepEqual((await Effect.runPromise(engine.list())).views.map((v) => v.state.taskId).sort(), left());
  });

  await s.test('a pass over settled tasks the memo skips writes nothing and takes no lock', async () => {
    await Effect.runPromise(engine.tick());
    const before = Effect.runSync(engine.io());
    await Effect.runPromise(engine.tick());
    const after = Effect.runSync(engine.io());
    assert.deepEqual([after.writes - before.writes, after.locks - before.locks], [0, 0]);
  });

  await s.test('after a forget, ae sweep frees a body only the forgotten task named, and keeps one a kept task still names', async () => {
    const done = await Effect.runPromise(engine.forget([x2], { yes: true }));
    forgotten.add(x2);
    linesForgottenSoFar += done.feed?.linesForgotten ?? 0;
    const bodies = path.join(root, 'bodies');
    const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    for (const f of fs.readdirSync(bodies)) fs.utimesSync(path.join(bodies, f), old, old);
    assert.deepEqual(await printed(root, ['sweep']), ['1 body no journal names (2048 bytes): `ae sweep --yes` removes them; 1 kept']);
    assert.deepEqual(await printed(root, ['sweep', '--yes']), ['1 body removed (2048 bytes), 1 kept']);
    assert.deepEqual(fs.readdirSync(bodies).length, 1, 'the shared body is kept');
    assert.deepEqual(await printed(root, ['sweep']), ['0 bodies no journal names (0 bytes): `ae sweep --yes` removes them; 1 kept']);
    assert.deepEqual(await printed(root, ['sweep', '--yes']), ['0 bodies removed (0 bytes), 1 kept']);
  });

  await s.test('ae feed 0 says how many lines of forgotten tasks were there, and no line of theirs', async () => {
    const out = await printed(root, ['feed', '0']);
    assert.equal(out[0], `${linesForgottenSoFar} lines of forgotten tasks were here, after cursor 0`);
    for (const id of forgotten) assert.ok(!out.some((l) => l.includes(id)), `no line of ${id}`);
  });
});

test('REFUSED: forget refuses, before anything is removed, and `ae forget` and `ae sweep` refuse an argument with exit code 2', async (t) => {
  await t.test('an id the store does not list, before anything of the listed one is removed', async () => {
    const { root, engine, ids } = await settledStore(1);
    forgetRefused(await refusalOf(engine.forget([ids[0], 'nobody'], { yes: true })), 'nobody', 'no task nobody', '`ae ls`');
    assert.ok(fs.existsSync(journalOf(root, ids[0])), 'the task listed is kept');
  });

  await t.test('a task not settled, in words that say where it stands and how to settle it', async () => {
    const { root, cwd, engine } = await settledStore(0);
    const id = await Effect.runPromise(engine.file({ brief: 'later', cwd, harness: 'fake', queued: true }));
    forgetRefused(await refusalOf(engine.forget([id], { yes: true })), id, 'is not started', `\`ae stop ${id}\``);
    assert.ok(fs.existsSync(journalOf(root, id)));
  });

  await t.test('a journal that cannot be read, so whether it settled cannot be told', async () => {
    const { root, ids } = await settledStore(1);
    fs.appendFileSync(journalOf(root, ids[0]), '{"kind":"nothing a runtime wrote"}\n');
    const fresh = builtEngine(Engine.layer({ root, harnesses: { fake: fakeHarness(freshWorld()) }, defaultHarness: 'fake' }));
    forgetRefused(await refusalOf(fresh.forget(ids, { yes: true })), ids[0], journalOf(root, ids[0]), 'whether it settled cannot be told');
    assert.ok(fs.existsSync(journalOf(root, ids[0])));
  });

  await t.test('a task filed on a harness this engine does not have, whose session files cannot be found', async () => {
    const { root, ids } = await settledStore(1);
    const other = builtEngine(Engine.layer({ root, harnesses: { other: fakeHarness(freshWorld()) }, defaultHarness: 'other' }));
    forgetRefused(
      await refusalOf(other.forget(ids, { yes: true })),
      ids[0],
      'ran on the `fake` harness',
      'give the engine the `fake` harness',
    );
    assert.ok(fs.existsSync(journalOf(root, ids[0])));
  });

  await t.test('a session its harness still holds, at work or its process kept', async () => {
    const { root, engine, ids, world } = await settledStore(1);
    const [id] = ids as [string];
    const name = `ae/${id}/1`;
    for (const seen of [sighting(name, 'working'), sighting(name, 'completed', true)]) {
      world.seen.set(name, seen);
      forgetRefused(await refusalOf(engine.forget([id], { yes: true })), id, `still holds session ${name}`, '`fake`');
    }
    assert.ok(fs.existsSync(journalOf(root, id)), 'nothing was removed by either');
  });

  await t.test('a session its harness could not be read for', async () => {
    const { root, engine, ids, world } = await settledStore(1);
    const [id] = ids as [string];
    world.unread.add(`ae/${id}/1`);
    forgetRefused(await refusalOf(engine.forget([id], { yes: true })), id, `could not be read for session ae/${id}/1`, '`ae ls`');
    assert.ok(fs.existsSync(journalOf(root, id)));
  });

  await t.test('ae forget refuses an id the store does not list, with exit code 2', async () => {
    const { root } = await settledStore(1);
    const err = await thrownBy(() => printed(root, ['forget', 'nobody']));
    assert.equal(err.exitCode, 2);
    naming(err.message, 'no task nobody', '`ae ls`');
  });

  for (const rest of [[], ['--yes'], ['x', '--all']])
    await t.test(`ae forget given ${rest.join(' ') || 'nothing'}: no id, or a flag but --yes, with exit code 2`, async () => {
      const err = await thrownBy(() => forgetAsked(rest));
      assert.equal(err.exitCode, 2);
      naming(err.message, 'forget: ', `handed ${rest.join(' ') || 'nothing'}`, 'nothing was forgotten');
    });

  await t.test('ae sweep given anything but --yes, with exit code 2', async () => {
    const err = await thrownBy(() => sweepAsked(['--yes', '--all']));
    assert.equal(err.exitCode, 2);
    naming(err.message, 'sweep: ', 'handed --all.');
  });
});

test('ae forget and ae sweep: what each takes, and the lines it prints', async (t) => {
  await t.test('ae forget takes ids and --yes; ae sweep --yes or nothing', () => {
    assert.deepEqual(forgetAsked(['a', 'b', '--yes']), { taskIds: ['a', 'b'], yes: true });
    assert.deepEqual(forgetAsked(['a']), { taskIds: ['a'], yes: false });
    assert.deepEqual([sweepAsked([]), sweepAsked(['--yes'])], [{ yes: false }, { yes: true }]);
  });

  await t.test('ae forget prints per task what it keeps, what each harness leaves, and the command that removes it', () => {
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

  await t.test('ae sweep --yes says the bytes of the bodies it removed, not of those it found removable', () => {
    assert.equal(
      sweepLine({ removable: 3, bytes: 12288, kept: 3, removed: 2, removedBytes: 8192 }, true),
      '2 bodies removed (8192 bytes), 3 kept',
    );
  });
});

test('a store with no count of its own feed lines gives a forget the same counts, off its feed read whole', async () => {
  const reports = [];
  for (const counting of [true, false]) {
    const { engine, ids } = await settledStore(3, freshWorld(), { counting });
    const [x, y] = ids as [string, string];
    const dry = await Effect.runPromise(engine.forget([x, y]));
    const done = await Effect.runPromise(engine.forget([x, y], { yes: true }));
    const counts = (r: typeof dry) => r.tasks.map((task) => task.feedLines);
    assert.ok(
      counts(dry).every((n) => n > 0),
      'each task has lines in the feed',
    );
    reports.push({ dry: counts(dry), done: counts(done), forgotten: done.feed?.linesForgotten });
  }
  assert.deepEqual(reports[1], reports[0]);
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
