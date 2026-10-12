/**
 * The daemon's retention of worktrees (`freeOnce`, `free`): a run that is finished — landed by its ending, merged by hand, or cancelled —
 * has its worktrees removed by a sweep after the pass that found it at rest, and everything `nemia prune` keeps is kept. Walked through
 * the runtime itself, `plainEngine` over an in-memory journal and a harness the test signs by hand, on one test place for the file, since
 * its runs share one store and every pass reads them all. A file of its own, since `WF_ROOT` is read once, as the package loads. A
 * worktree a person locked, and a checkout on no branch, are walked on git in free-held.boundary.test.ts.
 *
 * `WF_KEEP_WORKTREES` is deleted at its head, so the rule is read at its shipped default, and each sweep is handed the runs of its own
 * test alone: a sweep reads what it is given, and every test's runs share the one store.
 *
 * And the daemon's other sweep, of the store's disk (`disk`): that `up` forks it once its first pass answered and hands its reading on.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Fiber, Logger, References } from 'effect';
import { Engine, type Sighting } from 'agent-runtime';
import { asyncOps, asyncStore, plainEngine, type AsyncJournal, type AsyncRunner } from './promised.ts';
import { scratch } from './scratch.ts';
import { runGiven } from './placed.ts';
import { testPlace } from '../place/memory/index.ts';
import { until, WAITED } from './waits.ts';
import { steeredClock } from './steered.ts';
import type { PlaceRequests, PlaceVerb } from '../src/place/place.ts';

const ROOT = scratch('wf-free-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
process.env.WF_MAX_CONCURRENT = '50';
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
delete process.env.WF_KEEP_WORKTREES;
const { approveRun, cancelRun, decideRun, startRun, runWith: runEngine } = await import('../src/runner.ts');
const place = testPlace();
const stand = () => place;
const world = () => stand().world;
const runPlaced = runGiven(() => stand().layer);
const { readRun } = await import('../src/record/record.store.ts');
const { runStore } = await import('../src/record/files.store.ts');
const { tickRun, freshRestMemo } = await import('../src/tick/tick.verb.ts');
const { PlaceService } = await import('../src/place/place.store.ts');
const { free, freeOnce, freshFreeMemory, FREE_A_SWEEP } = await import('../src/prune/free.verb.ts');
const { EngineService } = await import('../src/runtime-client.ts');
const { freeable, freeSaid, freeTurn } = await import('../src/prune/prune.ts');
const { up } = await import('../src/daemon/up.verb.ts');
const { recentPasses } = await import('../src/daemon/daemon.store.ts');
const { DEFAULT_FACTORY } = await import('../src/factory/factory.ts');
const { main } = await import('../src/cli/main.ts');

type Pass = Awaited<ReturnType<typeof tick>>;
type Memory = ReturnType<typeof freshFreeMemory>;

/** A repository with one commit on main. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  world().repository(repo, { 'README.md': 'readme\n' });
  return repo;
};

/** `branch` merged into `repo`'s checkout and committed under `message`, as a person or an ending's session merges it. */
const mergedIn = (repo: string, branch: string, message: string): void => {
  world().stage(repo, branch);
  world().commit(repo, message);
};

/** A workflow of one step, `work`. */
const WORK = fs.mkdtempSync(path.join(ROOT, 'wf-work-'));
fs.writeFileSync(path.join(WORK, 'work.md'), '---\nplace: git\nharness: codex\n---\nwork it\n');

/** `work → ship`, the ending landed by the run on its check: the run reads its checkout's merge through the place's `status`. */
const CHECKED = fs.mkdtempSync(path.join(ROOT, 'wf-checked-'));
fs.writeFileSync(path.join(CHECKED, 'work.md'), '---\nplace: git\nharness: codex\n---\nwork it\n');
fs.writeFileSync(
  path.join(CHECKED, 'ship.md'),
  '---\nafter: work\nplace: git\nworkspace: main\ngate: true\ncheck: "true"\nharness: claude\n---\nShip it.\n',
);

/** `work → ship`: an ending at its gate, whose own session merges the run's branch in the repository's checkout. */
const ENDING = fs.mkdtempSync(path.join(ROOT, 'wf-ending-'));
fs.writeFileSync(path.join(ENDING, 'work.md'), '---\nplace: git\nharness: codex\n---\nwork it\n');
fs.writeFileSync(
  path.join(ENDING, 'ship.md'),
  '---\nafter: work\nplace: git\nworkspace: main\ngate: true\nharness: codex\n---\nShip it.\n',
);

const tasks = new Map<string, unknown[]>();
const starts = new Map<string, number>();
const journal: AsyncJournal = {
  async append(taskId, event) {
    tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]);
    if (event.kind === 'starting') starts.set(`ae/${taskId}/${event.attempt}`, Date.parse(event.at));
  },
  async read(taskId) {
    return [...(tasks.get(taskId) ?? [])] as Awaited<ReturnType<AsyncJournal['read']>>;
  },
  async list() {
    return [...tasks.keys()].sort();
  },
  async feed() {
    return { entries: [], cursor: 0 };
  },
};

const sessions = new Map<string, Sighting>();
const runner: AsyncRunner = {
  async spawn(r) {
    sessions.set(r.name, { sessionId: `s-${sessions.size + 1}`, nativeId: `n-${sessions.size + 1}`, state: 'working', busy: true });
  },
  async observe() {
    return new Map(sessions);
  },
  async stop() {},
  async logs() {
    return '';
  },
};
const e = plainEngine(
  Engine.layer({
    root: fs.mkdtempSync(path.join(ROOT, 'engine-')),
    journal: asyncStore(journal),
    harnesses: { claude: asyncOps(runner), codex: asyncOps(runner), check: asyncOps(runner) },
    defaultHarness: 'claude',
  }),
);

/** Whether a session of the run `id` is at work. */
const atWork = (id: string): boolean => [...sessions].some(([name, s]) => name.startsWith(`ae/${id}-`) && s.state === 'working');

/** Each session of the run `id` at work signs off, `done` unless told `blocked`. */
const sign = (id: string, outcome: 'done' | 'blocked' = 'done') => {
  for (const [name, s] of sessions) {
    if (!name.startsWith(`ae/${id}-`) || s.state !== 'working') continue;
    const payload = { outcome, summary: 'did it', artifacts: [], needs: outcome === 'done' ? null : 'a person' };
    sessions.set(name, { ...s, state: 'completed', busy: false, closeout: { payload, at: starts.get(name)! + 1 } });
  }
};

/** What the place was asked, verb by verb, and through which door: `ask`, off the loop, or `askNow`, which holds the process. */
type Asked = Array<{ verb: PlaceVerb; request: PlaceRequests[PlaceVerb]; door: 'ask' | 'askNow' }>;

/** The file's test place, every question noted in `asked`, with its door, before it is answered. */
const counting = (asked: Asked) =>
  PlaceService.layer({
    declared: stand().place.declared,
    ask: (verb, request, options) => {
      asked.push({ verb, request, door: 'ask' });
      return stand().place.ask(verb, request, options);
    },
    askNow: (verb, request, options) => {
      asked.push({ verb, request, door: 'askNow' });
      return stand().place.askNow(verb, request, options);
    },
  });

const tick = (memo?: ReturnType<typeof freshRestMemo>) =>
  runEngine(e, tickRun({ repo: ROOT, ...(memo ? { memo } : {}) }).pipe(Effect.provide(stand().layer)));

/** Passes until `ok` holds of one, a dozen at most. */
async function ticked(ok: (pass: Pass) => boolean, what: string): Promise<Pass> {
  for (let k = 0; k < 12; k++) {
    const pass = await tick();
    if (ok(pass)) return pass;
  }
  return assert.fail(`twelve passes, and never: ${what}`);
}

const answerOf = (pass: Pass, id: string) => pass.runs.find((a) => a.run.id === id);
const rests = (pass: Pass, id: string, status: string) => answerOf(pass, id)?.status === status && answerOf(pass, id)?.feed.atRest === true;

/**
 * One sweep over what `pass` answered of the runs `ids`, in that order, with what it logged and what it asked of the place: refused
 * here, for every test, when a question went through `askNow`.
 */
async function sweep(pass: Pass, ids: readonly string[], memory: Memory) {
  const asked: Asked = [];
  const logged: string[] = [];
  const keeper = Logger.make(({ message }) => void logged.push((Array.isArray(message) ? message : [message]).join(' ')));
  const answers = ids.flatMap((id) => answerOf(pass, id) ?? []);
  const done = await runEngine(
    e,
    freeOnce(answers, memory).pipe(
      Effect.provide(counting(asked)),
      Effect.provide(Logger.layer([keeper])),
      Effect.provideService(References.MinimumLogLevel, 'Info'),
    ),
  );
  assert.deepEqual(
    asked.filter((a) => a.door === 'askNow').map((a) => a.verb),
    [],
    'a sweep asks its place nothing that holds the process: every question goes off the loop',
  );
  return { ...done, logged, asked, verbs: asked.map((a) => a.verb) };
}

const lane = (id: string, step = 'work') => readRun(id).steps[step].workspace!;
const whole = (id: string) => fs.existsSync(lane(id)) && !fs.existsSync(path.join(ROOT, 'runs', `${id}.pruned`));
const gone = (id: string) => !fs.existsSync(path.join(ROOT, 'worktrees', id));

/** A run of `folder` started on `repo`, its `work` at work in its worktree. */
async function started(folder: string, repo = aRepo(), more: { after?: string[] } = {}) {
  const run = await runPlaced(startRun({ brief: 'do it', repo, workflowDir: folder, ...more }));
  return { id: run.id, repo };
}

/** `work` does its work on its branch — a file of the run's own — and signs off; passes until its session is over. */
async function worked(id: string, outcome: 'done' | 'blocked' = 'done') {
  await ticked(() => atWork(id), `${id}'s work at work`);
  const at = lane(id);
  fs.writeFileSync(path.join(at, `${id}.txt`), 'work\n');
  world().commit(at, `work of ${id}`);
  sign(id, outcome);
  return ticked((pass) => !atWork(id) && answerOf(pass, id)?.status !== 'running', `${id} past its work`);
}

/** A one-step run that succeeded, its branch merged into main by hand: finished, with no ending. */
async function merged(repo = aRepo()) {
  const run = await started(WORK, repo);
  await worked(run.id);
  mergedIn(repo, readRun(run.id).steps.work.branch!, `merge ${run.id}`);
  return run;
}

/** A run of `work → ship` landed by its ending: approved at its gate, its session merging the branch in the checkout and signing off. */
async function land(id: string, repo: string) {
  await worked(id);
  return shipped(id, repo);
}

/** The ending of a run whose work is done: approved, its merge made in the checkout, signed off; passes until the run rests, landed. */
async function shipped(id: string, repo: string) {
  await runEngine(e, approveRun(id, 'ship').pipe(Effect.provide(stand().layer)));
  await ticked(() => atWork(id), `${id}'s ending at work`);
  mergedIn(repo, readRun(id).steps.work.branch!, `land ${id}`);
  sign(id);
  return ticked((pass) => rests(pass, id, 'succeeded'), `${id} landed and at rest`);
}

const printedBy = async (t: TestContext, argv: string[]) => {
  const out: string[] = [];
  const log = t.mock.method(console, 'log', (...a: unknown[]) => void out.push(a.map(String).join(' ')));
  try {
    await main(argv, e, undefined, stand().place);
  } finally {
    log.mock.restore();
  }
  return out;
};

test('a run lands by its ending, and a later sweep frees its worktree: marked, said, and its record, branch and files kept', async (t) => {
  const { id, repo } = await started(ENDING);
  await land(id, repo);
  const wt = lane(id);
  const branch = readRun(id).steps.work.branch!;
  const tip = world().tip(repo, branch);
  assert.ok(tip, 'the run has its branch');
  const record = fs.readFileSync(path.join(ROOT, 'runs', `${id}.json`), 'utf8');
  assert.ok(fs.existsSync(wt), 'landed, its worktree is still there: no pass removes it');

  const pass = await tick();
  assert.ok(rests(pass, id, 'succeeded'), 'the pass answers the landed run at rest: what a sweep is fed');
  const done = await sweep(pass, [id], freshFreeMemory());

  assert.deepEqual(
    done.freed.map((p) => [p.id, p.kind, p.worktrees.map((w) => w.path)]),
    [[id, 'pruned', [wt]]],
  );
  assert.ok(!fs.existsSync(wt) && gone(id), 'the worktree and worktrees/<id> are gone');
  const mark = JSON.parse(fs.readFileSync(path.join(ROOT, 'runs', `${id}.pruned`), 'utf8')) as {
    at: string;
    worktrees: { path: string; bytes: number }[];
  };
  assert.ok(!Number.isNaN(Date.parse(mark.at)), 'the mark says when');
  assert.deepEqual(
    mark.worktrees.map((w) => [w.path, typeof w.bytes, w.bytes > 0]),
    [[wt, 'number', true]],
    'and each worktree with what it freed',
  );
  assert.match(done.logged.join('\n'), new RegExp(`^${id}  freed: removed 1 worktree, .+; its record, branches and files are kept$`, 'm'));
  assert.deepEqual(done.verbs, ['inventory', 'standing', 'remove'], 'one inventory, one standing and one remove, every one off the loop');

  assert.equal(fs.readFileSync(path.join(ROOT, 'runs', `${id}.json`), 'utf8'), record, 'the sweep wrote nothing on the run record');
  assert.equal(world().tip(repo, branch), tip, 'its branch is kept');
  assert.ok(fs.existsSync(path.join(ROOT, 'runs', id)), 'and its files under runs/<id>/');
  assert.equal((await runEngine(e, decideRun(id).pipe(Effect.provide(stand().layer)))).decision.kind, 'shipped');
  const ls = await printedBy(t, ['ls']);
  assert.ok(
    ls.some((l) => l.startsWith(`${id}  `) && l.includes('(pruned)')),
    ls.join('\n'),
  );
  assert.deepEqual((await sweep(await tick(), [id], freshFreeMemory())).verbs, [], 'freed, it is no candidate: nothing is asked again');
});

test('a cancelled run whose tasks have settled is freed; one cancelled with a task still at work is left whole, and its place asked nothing', async () => {
  const settled = await started(ENDING);
  await worked(settled.id);
  await runEngine(e, cancelRun(settled.id));
  const inFlight = await started(WORK);
  await ticked(() => atWork(inFlight.id), 'the second run at work');
  await runEngine(e, cancelRun(inFlight.id));
  const pass = await ticked((p) => rests(p, settled.id, 'cancelled'), 'the settled run cancelled and at rest');
  assert.equal(answerOf(pass, inFlight.id)?.status, 'cancelled');
  assert.notEqual(answerOf(pass, inFlight.id)?.feed.atRest, true, 'a task of it is still at work: not at rest');

  const left = await sweep(pass, [inFlight.id], freshFreeMemory());
  assert.deepEqual([left.verbs, left.freed, whole(inFlight.id)], [[], [], true]);
  const done = await sweep(pass, [settled.id], freshFreeMemory());
  assert.deepEqual([done.freed.map((p) => p.id), gone(settled.id)], [[settled.id], true]);
  assert.equal(readRun(settled.id).pruned?.worktrees.length, 1);
});

test('REFUSED at shipped defaults: a run at its gate, a run that failed and a run in flight are each left whole by three sweeps, and nothing is asked of their place', async () => {
  const gated = await started(ENDING);
  await worked(gated.id);
  const failed = await started(WORK);
  await worked(failed.id, 'blocked');
  const flying = await started(WORK);
  await ticked(() => atWork(flying.id), 'the third run at work');
  const ids = [gated.id, failed.id, flying.id];
  const memory = freshFreeMemory();
  for (let k = 0; k < 3; k++) {
    const pass = await tick();
    assert.deepEqual(
      ids.map((id) => answerOf(pass, id)?.status),
      ['failed', 'failed', 'running'],
      'a gate waiting on a person reads failed, as a blocked step does',
    );
    assert.equal(answerOf(pass, gated.id)?.feed.atRest, true, 'and the gated run is at rest: its status alone keeps it');
    const done = await sweep(pass, ids, memory);
    assert.deepEqual([done.verbs, done.freed, done.logged], [[], [], []]);
  }
  assert.deepEqual(ids.map(whole), [true, true, true]);
});

test("REFUSED at shipped defaults: a run that succeeded with a person's merge left is judged, left whole and nothing is said; merged by hand, a later sweep frees it", async () => {
  const { id, repo } = await started(WORK);
  await worked(id);
  const memory = freshFreeMemory();
  const pass = await ticked((p) => rests(p, id, 'succeeded'), 'succeeded and at rest');
  const first = await sweep(pass, [id], memory);
  assert.deepEqual(
    first.verbs.filter((v) => v === 'inventory' || v === 'remove'),
    ['inventory'],
    'judged, never removed',
  );
  assert.deepEqual([first.freed, first.said, first.logged, whole(id)], [[], [], [], true]);

  mergedIn(repo, readRun(id).steps.work.branch!, 'by hand');
  const done = await sweep(await tick(), [id], memory);
  assert.deepEqual([done.freed.map((p) => p.id), gone(id)], [[id], true], 'on its base now, it is finished');
});

test("REFUSED at shipped defaults: a finished run that stays, judged while another merge is staged in its repository's checkout, has the checkout's status asked off the loop", async () => {
  const { id, repo } = await started(CHECKED);
  await worked(id);
  await runEngine(e, cancelRun(id));
  fs.writeFileSync(path.join(lane(id), 'left.txt'), 'not committed\n');
  world().branch(repo, 'other', { 'other.txt': "another run's work\n" });
  const pass = await ticked((p) => rests(p, id, 'cancelled'), 'cancelled at its gate, and at rest');
  world().stage(repo, 'other');
  assert.ok(fs.existsSync(readRun(id).stagedFile!), "a merge is staged in the checkout, and it is not this run's");

  const done = await sweep(pass, [id], freshFreeMemory());
  assert.deepEqual(
    done.asked.filter((a) => a.verb === 'status').map((a) => a.door),
    ['ask'],
    'the checkout is read, once, and off the loop',
  );
  assert.deepEqual([done.freed, whole(id)], [[], true]);
  world().takeBack(repo);
});

test('a restart between the landing and the sweep changes nothing: a daemon that remembers nothing frees the run on its first pass and sweep', async () => {
  const { id, repo } = await started(ENDING);
  await land(id, repo);
  const pass = await tick(freshRestMemo());
  assert.ok(rests(pass, id, 'succeeded'), 'judged in full by a pass with no memo, it is at rest');
  const done = await sweep(pass, [id], freshFreeMemory());
  assert.deepEqual([done.freed.map((p) => p.id), gone(id)], [[id], true]);
});

test('a removal cut short — the run marked pruned, its worktree still on disk — is finished by the next sweep, and the mark lists it', async () => {
  const { id } = await merged();
  const wt = lane(id);
  runStore.runs.prune(id, { at: '2026-10-11T10:00:00.000Z', worktrees: [] });
  const done = await sweep(await tick(freshRestMemo()), [id], freshFreeMemory());
  assert.deepEqual([done.freed.map((p) => p.id), gone(id)], [[id], true]);
  assert.deepEqual(
    readRun(id).pruned?.worktrees.map((w) => w.path),
    [wt],
  );
});

test('a chain: a run waiting --after a landed, freed run starts from main, lands, and is freed in its turn', async () => {
  const a = await started(ENDING);
  const b = await started(ENDING, a.repo, { after: [a.id] });
  await worked(a.id);
  assert.ok(!readRun(b.id).steps.work?.taskId, 'B waits while A has not landed');
  const landed = await shipped(a.id, a.repo);
  const memory = freshFreeMemory();
  assert.deepEqual(
    (await sweep(landed, [a.id, b.id], memory)).freed.map((p) => p.id),
    [a.id],
  );
  assert.ok(gone(a.id), "A's worktree is gone before B has done any work");

  await land(b.id, b.repo);
  assert.ok(fs.existsSync(path.join(lane(b.id), `${a.id}.txt`)), "B's worktree was cut from main, with A's work on it");
  assert.deepEqual(
    (await sweep(await tick(), [a.id, b.id], memory)).freed.map((p) => p.id),
    [b.id],
  );
  assert.ok(gone(b.id));
});

test('REFUSED at shipped defaults: a store with more finished runs than a sweep may free is freed over several, one remove a repository; a run that stays is judged once a sweep at most', async () => {
  const repo = aRepo();
  const runs: string[] = [];
  for (let k = 0; k < 2 * FREE_A_SWEEP + 1; k++) runs.push((await merged(repo)).id);
  const kept = await merged(repo);
  fs.writeFileSync(path.join(lane(kept.id), 'left.txt'), 'not committed\n');
  const ids = [...runs, kept.id];
  const memory = freshFreeMemory();
  const sweeps: Awaited<ReturnType<typeof sweep>>[] = [];
  for (let k = 0; k < 5; k++) sweeps.push(await sweep(await tick(), ids, memory));
  const count = (verb: PlaceVerb) => sweeps.map((s) => s.verbs.filter((v) => v === verb).length);

  assert.deepEqual(
    sweeps.map((s) => s.freed.map((p) => p.id)),
    [runs.slice(0, FREE_A_SWEEP), runs.slice(FREE_A_SWEEP, 2 * FREE_A_SWEEP), runs.slice(2 * FREE_A_SWEEP), [], []],
    'a sweep frees FREE_A_SWEEP runs and no more',
  );
  assert.deepEqual(
    count('inventory'),
    [FREE_A_SWEEP, FREE_A_SWEEP, 2, 1, 1],
    'and judges no more: the run that stays once a sweep after that',
  );
  assert.deepEqual(count('remove'), [1, 1, 1, 0, 0], 'one remove a repository, whatever the runs');
  const first = sweeps[0].asked.find((a) => a.verb === 'remove')!.request as PlaceRequests['remove'];
  assert.deepEqual(
    [first.repo, first.workspaces.length, first.branches],
    [repo, FREE_A_SWEEP, []],
    'carrying every worktree, and no branch',
  );
  assert.ok(whole(kept.id));
});

test('runs of two repositories freed by one sweep: the place is asked one remove each', async () => {
  const [here, there] = [aRepo(), aRepo()];
  const ids = [(await merged(here)).id, (await merged(here)).id, (await merged(there)).id];
  const done = await sweep(await tick(), ids, freshFreeMemory());
  assert.deepEqual(new Set(done.freed.map((p) => p.id)), new Set(ids));
  const removes = done.asked.filter((a) => a.verb === 'remove').map((a) => a.request as PlaceRequests['remove']);
  assert.deepEqual(
    removes.map((r) => `${r.repo} ${r.workspaces.length}`).sort((a, b) => a.localeCompare(b)),
    [`${here} 2`, `${there} 1`].sort((a, b) => a.localeCompare(b)),
  );
});

test('REFUSED at shipped defaults: with WF_KEEP_WORKTREES=1 a sweep asks nothing and frees nothing; unset, it frees', async (t) => {
  const { id } = await merged();
  const pass = await tick();
  process.env.WF_KEEP_WORKTREES = '1';
  t.after(() => delete process.env.WF_KEEP_WORKTREES);
  const keptWhole = await sweep(pass, [id], freshFreeMemory());
  assert.deepEqual([keptWhole.verbs, keptWhole.freed, whole(id)], [[], [], true]);
  delete process.env.WF_KEEP_WORKTREES;
  assert.deepEqual(
    (await sweep(pass, [id], freshFreeMemory())).freed.map((p) => p.id),
    [id],
  );
});

test('the daemon frees a finished run with no person: `up` forks the sweep beside its passes', WAITED, async (t) => {
  const { id } = await merged();
  assert.ok(whole(id));
  const daemon = Effect.runFork(
    Effect.scoped(up(e, { every: 20, repo: ROOT, holder: 'wf up' })).pipe(Effect.provide(stand().layer), Effect.provide(Logger.layer([]))),
  );
  t.after(() => Effect.runPromise(Fiber.interrupt(daemon)));
  await until(t, () => gone(id), `the daemon frees ${id}`, { everyMs: 50 });
  assert.equal(readRun(id).pruned?.worktrees.length, 1);
});

test(
  'the daemon measures the store with no person: `up` forks the sweep once its first pass answered, and hands each pass after its reading',
  WAITED,
  async (t) => {
    const { id } = await started(WORK);
    const from = new Date().toISOString();
    const turn = Effect.promise(() => new Promise<void>((next) => setImmediate(next)));
    const turns = Effect.forEach(Array.from({ length: 200 }), () => turn, { discard: true });
    const daemon = Effect.runFork(
      Effect.scoped(up(e, { every: 20, repo: ROOT, holder: 'wf up', onTaken: () => turns })).pipe(
        Effect.provide(stand().layer),
        Effect.provide(Logger.layer([])),
      ),
    );
    t.after(() => Effect.runPromise(Fiber.interrupt(daemon)));
    const kept = () => recentPasses().filter((pass) => pass.at >= from);
    const read = await until(t, () => kept().find((pass) => pass.disk), 'a pass of the daemon keeps a reading of the disk', {
      everyMs: 20,
    });
    const first = kept()[0];
    assert.equal(
      first.disk,
      undefined,
      'REFUSED: a sweep before the first pass answered, which the fibers forked had two hundred turns to start, and which knows no run and so no factory',
    );
    assert.ok(first.at < read.at);
    const ours = read.disk!.entries.find((entry) => entry.part === 'runs' && entry.factory === DEFAULT_FACTORY);
    assert.ok(ours?.bytes, `the runs the pass answered, ${id} among them, are their factory's: ${JSON.stringify(read.disk!.entries)}`);
    assert.equal(
      readRun(id).factory,
      undefined,
      'a run of no factory is the default factory’s once a pass answered it, and no factory’s before',
    );
    assert.ok(read.disk!.size >= read.disk!.free && read.disk!.free > 0, 'with the room on its file system');
  },
);

test(
  'REFUSED at shipped defaults: a sweep that fails ends nothing — the loop warns once while its words stand, sweeps on, and frees once the cause is gone',
  WAITED,
  async (t) => {
    const { id } = await merged();
    const pass = await tick();
    const warned: string[] = [];
    const keeper = Logger.make(({ message }) => void warned.push((Array.isArray(message) ? message : [message]).join(' ')));
    let sweeps = 0;
    const answers = () => {
      sweeps++;
      return pass.runs.filter((a) => a.run.id === id);
    };
    process.env.WF_KEEP_WORKTREES = 'yes';
    t.after(() => delete process.env.WF_KEEP_WORKTREES);
    const clock = steeredClock();
    const loop = Effect.runFork(
      free(answers).pipe(
        Effect.provide(EngineService.layer(e)),
        Effect.provide(stand().layer),
        Effect.provide(Logger.layer([keeper])),
        Effect.provide(clock.layer),
      ),
    );
    t.after(() => Effect.runPromise(Fiber.interrupt(loop)));
    const ended = Effect.runPromise(Fiber.join(loop)).then(() => assert.fail('the loop ended'));
    const rested = (times: number) =>
      Promise.race([until(t, () => clock.asked.length === times, `the loop is at rest ${times}`, { bell: clock.bell }), ended]);
    await rested(1);
    assert.deepEqual([clock.asked, sweeps], [[5_000], 1], 'the rest is the shipped five seconds');
    await clock.adjust(4_999);
    assert.deepEqual([clock.woken, clock.asked, sweeps], [[], [5_000], 1], 'a millisecond before its rest ends, no sweep');
    await clock.adjust(1);
    await rested(2);
    assert.deepEqual([clock.woken, sweeps], [[5_000], 2], 'at five seconds, the next sweep');
    for (const times of [3, 4]) {
      await clock.adjust(5_000);
      await rested(times);
    }
    assert.equal(sweeps, 4);
    assert.deepEqual(
      warned,
      [
        'The worktrees of finished runs could not be freed this sweep: WF_KEEP_WORKTREES=yes is neither 1 nor 0. It keeps the worktrees of every finished run, which the daemon otherwise removes: WF_KEEP_WORKTREES=1 — or 0, or unset, to have them freed.',
      ],
      'said once across four failed sweeps',
    );
    assert.ok(whole(id));
    delete process.env.WF_KEEP_WORKTREES;
    await clock.adjust(5_000);
    await Promise.race([until(t, () => gone(id), `the loop frees ${id} once its switch reads`, { bell: clock.bell }), ended]);
  },
);

test('the rule as data: which answers are candidates, which a sweep takes, and what is said of one left', () => {
  const answer = (id: string, status: string, atRest: boolean, repo = true) => ({
    run: (repo ? { id, repo: '/r' } : { id, place: { kind: 'folder' } }) as never,
    status,
    feed: atRest ? { atRest: true as const } : {},
  });
  assert.deepEqual(
    freeable([
      answer('landed', 'succeeded', true),
      answer('cancelled', 'cancelled', true),
      answer('gated', 'failed', true),
      answer('flying', 'running', false),
      answer('settling', 'cancelled', false),
      answer('folder', 'succeeded', true, false),
    ]),
    ['landed', 'cancelled'],
  );

  const all = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual(freeTurn(all, new Set(), 2, 0), ['a', 'b'], 'the bound, of those not judged');
  assert.deepEqual(freeTurn(all, new Set(['a', 'b', 'c', 'd']), 2, 7), ['e'], 'what is left of them');
  assert.deepEqual(
    [0, 1, 2, 3].map((turn) => freeTurn(['a', 'b', 'c'], new Set(['a', 'b', 'c']), 2, turn)),
    [['a'], ['b'], ['c'], ['a']],
    'then one already judged, each in its turn',
  );
  assert.deepEqual(freeTurn([], new Set(), 2, 0), []);

  const facts = { decided: 'shipped' as const, held: null, owed: [], worktrees: [] };
  assert.equal(freeSaid(undefined, 'the place did not answer'), 'the place did not answer');
  assert.equal(freeSaid(facts, 'locked'), 'locked');
  assert.equal(freeSaid({ ...facts, decided: 'cancelled' }, 'locked'), 'locked');
  assert.equal(freeSaid({ ...facts, decided: 'awaiting' }, 'not merged'), null, "a merge left is the rule's boundary");
  assert.equal(freeSaid({ ...facts, decided: 'running' }, 'not over'), null);
  assert.equal(freeSaid({ ...facts, held: 'an ask no pass has spent' }, 'held'), null);
  assert.equal(freeSaid({ ...facts, owed: ['work'] }, 'owed'), null);
});
