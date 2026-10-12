/**
 * What the tick's memo of runs at rest saves a pass, counted by the meter on a store of finished runs beside a few in flight, and that each
 * input of a run takes it out of the memo (`advanceResting` in tick.verb.ts): its record, the files a person keeps beside it, its asks and
 * what is done with them, its tasks' journals, and its result branches. What makes a run at rest is pure, and lives in rest.test.ts.
 *
 * Walked through the runtime itself, `plainEngine` over an in-memory journal and a harness the test signs by hand, as held.test.ts does.
 * On one test place for the file, since its tests read one store built in order; the git processes a pass's place starts are counted on
 * git in pass-processes.boundary.test.ts.
 * A file of its own, since `tick` reads every run under `WF_ROOT`. Every pass that is not a measurement judges the runs the memo answered
 * in full as well (`verifyRest`), and throws where the two differ. `WF_ROOT` is read as the module loads, so it is set before the import;
 * no cap on runs in flight, and sessions enough that every task filed is admitted on the pass after, so a store of two hundred runs is
 * built in a few passes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { nameFor, Engine, type Sighting } from 'agent-runtime';
import { asyncStore, type AsyncJournal, asyncOps, type AsyncRunner } from '../../test/promised.ts';
import type { RepositoryRun, Run } from '../run.ts';
import type { PassCost } from '../meter/meter.ts';
import { scratch } from '../../test/scratch.ts';
import { Effect } from 'effect';
import { plainEngine } from '../../test/promised.ts';
import { runGiven, runOver } from '../../test/placed.ts';
import { testPlace } from '../../place/memory/index.ts';
import { placeOver, unreadBy } from '../../test/place-over.ts';

const ROOT = scratch('wf-rest-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
process.env.WF_MAX_CONCURRENT = '10000';
delete process.env.WF_MAX_RUNS;
const { addToInbox, approveRun, forgetRun, isRepositoryRun, prune, queueInInbox, readInbox, retryRun, startRun } =
  await import('../runner.ts');
const { listRuns, readRun } = await import('../record/record.store.ts');
const { resumePause, putPause } = await import('../pause/pause.store.ts');
const { tickRun, freshRestMemo } = await import('./tick.verb.ts');
const { acceptFile, approvalFile, asksDir, holdFile, markCancelled, pruneFile, restStamps, runFile, runsDir, writeAsk } =
  await import('../record/record.store.ts');
const { feedFile } = await import('../feed/feed.store.ts');
const { runWith: runEngine } = await import('../runtime-client.ts');
const { PlaceService } = await import('../place/place.store.ts');
const { meteredPlace } = await import('../place/shipped.store.ts');
const made = testPlace();
/** The file's test place, each question of it counted as the pass's `place` phase, as the shipped place counts its own. */
const place = { ...made, place: meteredPlace(made.place), layer: PlaceService.layer(meteredPlace(made.place)) };
const stand = () => place;
const world = () => stand().world;
const runWith = runOver(runEngine, () => stand().layer);
const runPlaced = runGiven(() => stand().layer);

/** A repository with one commit, so `nemia start` has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  world().repository(repo, {});
  return repo;
};

/**
 * A workflow folder of the steps given, each `after` the one before it, on codex: a job that is not held open, so it settles as it signs.
 */
const folder = (...steps: string[]) => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  steps.forEach((name, k) =>
    fs.writeFileSync(
      path.join(dir, `${name}.md`),
      `---\nplace: git\nharness: codex\n${k ? `after: ${steps[k - 1]}\n` : ''}---\n${name} it\n`,
    ),
  );
  return dir;
};

/**
 * The engine's store, in memory, as its own tests keep one, noting in `starts` when each attempt began, by its session's name; `journal` is
 * kept so a test can append to a task as the runtime would.
 */
const memoryJournal = (starts: Map<string, number>): AsyncJournal => {
  const tasks = new Map<string, Parameters<AsyncJournal['append']>[1][]>();
  const feed: Awaited<ReturnType<AsyncJournal['feed']>>['entries'] = [];
  return {
    async append(taskId, event) {
      tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]);
      feed.push({ taskId, event });
      if (event.kind === 'starting') starts.set(nameFor(taskId, event.attempt), Date.parse(event.at));
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

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };
const BLOCKED = { outcome: 'blocked', summary: 'two flags could be meant', artifacts: [], needs: 'which flag?' };

/**
 * The runtime, with a harness whose sessions work until `signAll` ends them. The harness reports its own words (`done`, `stopped`), as a
 * runner written in Promises may still report them: the runtime reads them as A2A's. `signAll` signs every session at work but those of
 * the runs `keep` names, which stay in flight, with `closeout`, or `SIGNED` where it names none, stamped a millisecond after the journal
 * says its attempt began.
 */
const engine = () => {
  const sessions = new Map<string, Sighting>();
  let n = 0;
  const runner: AsyncRunner = {
    async spawn(r) {
      n++;
      sessions.set(r.name, { sessionId: `s-${n}`, nativeId: `native-${n}`, state: 'working', busy: true });
    },
    async observe() {
      return new Map(sessions);
    },
    async stop(id) {
      for (const [name, s] of sessions) if (s.sessionId === id) sessions.set(name, { ...s, state: 'canceled', busy: false });
    },
    async logs() {
      return '';
    },
  };
  const starts = new Map<string, number>();
  const journal = memoryJournal(starts);
  const e = plainEngine(
    Engine.layer({
      root: fs.mkdtempSync(path.join(ROOT, 'engine-')),
      journal: asyncStore(journal),
      harnesses: { claude: asyncOps(runner), codex: asyncOps(runner), check: asyncOps(runner) },
      defaultHarness: 'claude',
    }),
  );
  const signAll = (keep: readonly Run[] = [], closeout: (name: string) => object | undefined = () => undefined) => {
    for (const [name, s] of sessions) {
      if (s.state !== 'working' || keep.some((r) => name.startsWith(`ae/${r.id}-`))) continue;
      sessions.set(name, {
        ...s,
        state: 'completed',
        busy: false,
        closeout: { payload: closeout(name) ?? SIGNED, at: starts.get(name)! + 1 },
      });
    }
  };
  return { e, journal, signAll };
};

const h = engine();
const REPO = aRepo();
const ONE = folder('work');
const TWO = folder('plan', 'work');
const inFlight: Run[] = [];

/** The memo every pass here keeps, as the daemon keeps its engine's: handed in, so a test can read what it holds. */
const MEMO = freshRestMemo();
/** A pass that judges every run the memo answers again in full, and throws where the two differ. */
const verified = () => runWith(h.e, tickRun({ repo: ROOT, memo: MEMO, verifyRest: true }));
/** A pass as the daemon makes it: the memo trusted. */
const measured = async (memo = MEMO): Promise<PassCost> => (await runWith(h.e, tickRun({ repo: ROOT, memo, verifyRest: false }))).cost!;

/**
 * Passes until every run but those in flight has finished and the memo answers it: filed, admitted, started, signed, settled, at rest. A
 * session whose name holds one of `blocking` signs blocked.
 */
const finish = async (blocking: readonly string[] = []): Promise<PassCost> => {
  for (let k = 0; k < 12; k++) {
    await verified();
    h.signAll(inFlight, (name) => (blocking.some((id) => name.startsWith(`ae/${id}-`)) ? BLOCKED : undefined));
    const pass = await measured();
    const finished = listRuns().filter((r) => !inFlight.some((f) => f.id === r.id)).length;
    if (pass.rested === finished) return pass;
  }
  assert.fail('the store did not come to rest in twelve passes');
};

/** One pass, measured once the memo is steady: the pass that follows is the one compared. */
const steady = async (): Promise<PassCost> => {
  await finish();
  return measured();
};

const started = async (n: number, workflowDir = ONE, repo = REPO, isolate = false) => {
  const runs: Run[] = [];
  for (let k = 0; k < n; k++) runs.push(await runPlaced(startRun({ brief: `run ${k}`, repo, workflowDir, isolate })));
  return runs;
};

const journals = (c: PassCost) => c.phases.journals.calls;
const observes = (c: PassCost) => c.phases.observe.calls;
/** The questions a pass asked of its place: what `place.calls` counts, a question one call whatever its place starts to answer it. */
const places = (c: PassCost) => c.phases.place.calls;

/** The store at each size, and the pass each was measured at: built once, read by the tests that follow. */
const sizes: Array<{ finished: number; cost: PassCost; fresh?: PassCost }> = [];
const ISOLATED_REPOS = [aRepo(), aRepo()];

test('a pass costs as many journal reads, observes and questions of its place on 200 finished runs as on none: what is in flight sets it', async () => {
  inFlight.push(...(await started(3)));
  sizes.push({ finished: 0, cost: await steady() });

  await started(3, TWO, ISOLATED_REPOS[0], true);
  await started(3, TWO, ISOLATED_REPOS[1], true);
  await started(94);
  sizes.push({ finished: 100, cost: await steady() });
  await started(100);
  sizes.push({ finished: 200, cost: await steady() });

  const [none, hundred, twoHundred] = sizes.map((s) => s.cost) as [PassCost, PassCost, PassCost];
  assert.ok(
    journals(none) < 3,
    `the three runs in flight are read off the views the runtime's pass reported (\`reportedEngine\`), with no view of their own (${journals(none)} reads)`,
  );
  assert.ok(observes(none) >= 1, `and their harness observed (${observes(none)} observes)`);
  for (const [at, c] of [
    [100, hundred],
    [200, twoHundred],
  ] as const) {
    assert.equal(c.rested, at, `every finished run of ${at} answered from memory`);
    assert.equal(c.records, none.records, `${at} finished runs: no record read more than the runs in flight make`);
    assert.equal(journals(c), journals(none), `${at} finished runs: no journal read more than the runs in flight make`);
    assert.equal(observes(c), observes(none), `${at} finished runs: no observe more`);
    assert.equal(
      places(c),
      places(none) + ISOLATED_REPOS.length,
      `${at} finished runs: one standing a repository whose runs' tips are read (three runs on each of two), and no more`,
    );
  }
  assert.equal(none.rested, 0);
});

test('a second pass over the same store reads no record of a finished run, and a memo emptied, as a restarted daemon has it, reads them all', async () => {
  await measured();
  const second = await measured();
  const listed = listRuns().length;
  assert.equal(second.rested, 200, 'every finished run answered from memory');
  assert.equal(second.records, listed - second.rested, `only the records of the runs in flight read (${second.records} of ${listed})`);
  const fresh = await measured(freshRestMemo());
  assert.ok(fresh.records >= listed, `every record read with nothing in memory (${fresh.records} of ${listed})`);
  await measured();
});

test('the same store paused: once the pass after the pause has read every run with it, every finished run is answered from memory', async () => {
  const [none] = sizes.map((s) => s.cost) as [PassCost];
  putPause({ why: 'merging by hand', by: 'ann' });
  try {
    await measured();
    const paused = await measured();
    const listed = listRuns().length;
    assert.equal(paused.rested, 200, 'every finished run answered from memory while the pause stands');
    assert.equal(paused.records, listed - paused.rested, `only the records of the runs in flight read (${paused.records} of ${listed})`);
    assert.equal(journals(paused), journals(none), 'no journal read more than the runs in flight make');
  } finally {
    resumePause();
  }
  await measured();
  assert.equal((await measured()).rested, 200, 'and once it is lifted, as before');
});

test('the same store, the memo emptied before every pass as a restarted daemon has it: every finished run is read again, git no more', async () => {
  const [none, , twoHundred] = sizes.map((s) => s.cost) as [PassCost, PassCost, PassCost];
  const fresh = await measured(freshRestMemo());
  assert.equal(fresh.rested, 0, 'nothing answered from memory');
  assert.ok(
    journals(fresh) >= journals(none) + 200,
    `each of the 200 finished runs' tasks read (${journals(fresh)} reads, against ${journals(twoHundred)})`,
  );
  assert.equal(
    places(fresh),
    places(twoHundred),
    "the six runs whose tips are read ask no git of their own: their tips are read off the heads of the pass's one `standing` a repository",
  );
  assert.equal(
    journals(await measured()),
    journals(twoHundred),
    "the pass that follows, on the engine's own memo, is as it was: an empty memo is a cost, never an answer",
  );
});

test('a pass that answers the finished runs from memory carries no refused move: their tasks are settled, and the runtime moves none', async () => {
  for (let k = 0; k < 3; k++) {
    const pass = await verified();
    assert.ok(pass.cost!.rested >= 200, `pass ${k + 1}: the finished runs answered from memory (${pass.cost!.rested})`);
    assert.equal(
      pass.refused,
      undefined,
      `pass ${k + 1}: no refused move; the refusals are the runtime's pass's (\`TickReport.refused\`), taken before the memo is read, and a settled task is asked nothing (\`settledQuiet\` in the runtime's domain.ts)`,
    );
  }
});

/** How many runs the next pass answers from memory, every one of them judged again in full. */
const rested = async (): Promise<number> => (await verified()).cost!.rested;
/** What the last pass answered of one run. */
const answered = async (id: string) => (await verified()).runs.find((a) => a.run.id === id)!;
/** The ids of the runs a test has taken with `aResting`, each taken once. */
const touched = new Set<string>();
/** A finished run worked in place, from the store built above, not yet touched by a test; `isolate` picks one in a worktree instead. */
const aResting = (isolate = false): RepositoryRun => {
  const run = listRuns().find(
    (r) => Boolean(r.isolate) === isolate && !touched.has(r.id) && !inFlight.some((f) => f.id === r.id) && MEMO.runs.has(r.id),
  );
  assert.ok(run, 'a run at rest is left to touch');
  assert.ok(isRepositoryRun(run), `${run.id} works on a repository`);
  touched.add(run.id);
  return run;
};

/**
 * `change` made to a run at rest takes that run, and no other, out of the memo for the pass that reads it — for `afresh` passes, where the
 * first writes the record — and then it rests again. The first of them reads `read` records more than a steady pass: the run's own, unless
 * no file of it moved and the memo's run is judged.
 */
const evicts = async (what: string, change: (run: Run) => void | Promise<void>, run: Run = aResting(), afresh = 1, read = 1) => {
  const before = await rested();
  const steadily = await measured();
  assert.ok(MEMO.runs.has(run.id), `${what}: the run is at rest before`);
  await change(run);
  const first = await measured();
  assert.deepEqual(
    [first.rested, first.records],
    [before - 1, steadily.records + read],
    `${what}: the run is judged afresh, and every other run still answered from memory without a read of its record`,
  );
  for (let k = 1; k < afresh; k++)
    assert.equal(
      await rested(),
      before - 1,
      `${what}: the run is judged afresh (pass ${k + 1}), and every other run still answered from memory`,
    );
  assert.equal(await rested(), before, `${what}: and at rest again on the pass after`);
  return run;
};

test('its record written again, word for word, takes a run out of the memo', async () => {
  await evicts('the record', (run) => {
    const text = fs.readFileSync(runFile(run.id));
    fs.writeFileSync(`${runFile(run.id)}.new`, text);
    fs.renameSync(`${runFile(run.id)}.new`, runFile(run.id));
  });
});

test("a person's marker beside the record — cancelled, pruned — takes a run out, and the pass that reads it says what it says", async () => {
  const cancelled = await evicts('.cancelled', (run) => {
    markCancelled(run.id);
  });
  assert.equal((await answered(cancelled.id)).status, 'cancelled');
  const pruned = await evicts('.pruned', (run) => {
    fs.writeFileSync(pruneFile(run.id), `${JSON.stringify({ at: new Date().toISOString(), worktrees: [] })}\n`);
  });
  assert.ok((await answered(pruned.id)).run.pruned, 'the run reads as pruned');
});

test("a hold takes a run out of the memo for as long as it holds: what it waits on is another run's", async () => {
  const run = aResting();
  const before = await rested();
  const steadily = await measured();
  fs.writeFileSync(holdFile(run.id), `${JSON.stringify({ at: new Date().toISOString(), until: [] })}\n`);
  const held = await measured();
  assert.deepEqual(
    [held.rested, held.records],
    [before - 1, steadily.records + 1],
    'held on no run, the held run is judged afresh and its record read again, and no other',
  );
  fs.writeFileSync(holdFile(run.id), `${JSON.stringify({ at: new Date().toISOString(), until: [inFlight[0].id] })}\n`);
  assert.equal(await rested(), before - 1);
  assert.equal(await rested(), before - 1, 'held, it is judged afresh on every pass');
  fs.rmSync(holdFile(run.id));
  assert.equal(await rested(), before - 1, 'the hold lifted, the pass that reads it judges afresh');
  assert.equal(await rested(), before);
});

test('an ask takes a run out, and the try it asks for is filed: a retry, and an approval at a gate', async () => {
  const [run] = await started(1);
  touched.add(run.id);
  const before = (await finish([run.id])).rested;
  assert.equal((await answered(run.id)).status, 'blocked', 'its step signed blocked');
  await runWith(h.e, retryRun(run.id, 'work', { mode: 'fresh' }));
  assert.equal(await rested(), before - 1, 'the ask read');
  assert.equal((await finish()).rested, before, 'the try filed, signed, settled, and the run at rest again');
  assert.equal(readRun(run.id).steps.work.taskId, `${run.id}-work-try2`, 'on its second try');

  const gated = await runPlaced(startRun({ brief: 'gated', repo: REPO, workflowDir: TWO, isolate: false, gates: ['plan'] }));
  touched.add(gated.id);
  for (let k = 0; k < 8 && !MEMO.runs.has(gated.id); k++) {
    await verified();
    h.signAll(inFlight);
  }
  assert.ok(MEMO.runs.has(gated.id), 'a run waiting at a gate, its task settled, is at rest');
  assert.equal(readRun(gated.id).steps.work?.taskId ?? null, null, 'work waits on the gate');
  const waiting = await rested();
  await runWith(h.e, approveRun(gated.id, 'plan'));
  assert.ok(fs.existsSync(approvalFile(gated.id, 'plan', 1)), 'the approval is a file in the asks');
  assert.equal(await rested(), waiting - 1, 'the approval read');
  assert.ok(readRun(gated.id).steps.work?.taskId, 'and work filed on it');
  assert.equal((await finish()).rested, waiting, 'the run finished, and at rest again');
});

test('an acceptance, and an ask moved into done/, each take a run out', async () => {
  const accepted = await evicts('an acceptance', (run) => {
    writeAsk(acceptFile(run.id, 'work', 1), { step: 'work', try: 1, at: new Date().toISOString(), message: 'good enough as it is' });
  });
  assert.ok(
    fs.existsSync(acceptFile(accepted.id, 'work', 1)),
    'an acceptance of a step that loops nowhere ends nothing and stays where it is, so the run rests again with it there',
  );
  await evicts('done/', (run) => {
    fs.mkdirSync(path.join(asksDir(run.id), 'done'), { recursive: true });
    fs.writeFileSync(path.join(asksDir(run.id), 'done', 'retry-work-9'), '{}\n');
  });
});

test('what the runtime appends to a task — what it cost — takes its run out', async () => {
  await evicts('measured', (run) =>
    h.journal.append(`${run.id}-work`, { kind: 'measured', at: new Date().toISOString(), attempt: 1, usage: { costUsd: 0.25 } }),
  );
});

test('a result branch moved takes its run out and its tip is written; one deleted, and a commit on the base branch, move nothing', async () => {
  const run = aResting(true);
  const [branch, tip] = Object.entries(readRun(run.id).tips ?? {})[0] ?? [];
  assert.ok(branch && tip, 'the run has a tip on its record');
  let moved = tip;
  await evicts(
    'a branch moved',
    () => {
      moved = world().branch(run.repo, branch, {});
    },
    run,
    2,
    0,
  );
  assert.equal(readRun(run.id).tips![branch], moved, 'the tip the pass saw is on the record');

  const before = await rested();
  const lanes = Object.values(readRun(run.id).steps).flatMap((step) => (step.branch === branch && step.workspace ? [step.workspace] : []));
  const dropped = stand().place.askNow('remove', { repo: run.repo, workspaces: lanes, branches: [branch] });
  assert.deepEqual('answer' in dropped && dropped.answer.deleted, [branch], 'the branch is deleted, its worktree removed first');
  assert.equal(await rested(), before, 'a branch git no longer has keeps the tip last seen: nothing to judge again');
  world().commit(run.repo, 'later on the base branch');
  assert.equal(await rested(), before, 'the base branch is none of the key');
  assert.equal(readRun(run.id).tips![branch], moved);
});

/** The place the package ships, its `standing` of `repo` not heard: that repository reads unread, and every other as git has it. */
const unreadIn = (repo: string) =>
  PlaceService.layer(
    placeOver(stand().place, {
      standing: (request) =>
        path.resolve(request.repo) === path.resolve(repo)
          ? unreadBy('standing', 'the standing broke')
          : stand().place.askNow('standing', request),
    }),
  );

test('REFUSED: a repository whose standing is unread answers none of its runs with result branches from memory, and keeps their tips', async () => {
  const run = aResting(true);
  const [branch, tip] = Object.entries(readRun(run.id).tips ?? {})[0] ?? [];
  assert.ok(branch && tip, 'the run has a tip on its record');
  const tippedThere = [...MEMO.runs.values()].filter((kept) => kept.run.repo === run.repo && kept.tipped.length > 0).length;
  assert.ok(tippedThere > 0, 'runs of its repository rest on their tips');
  const before = await rested();
  const moved = world().branch(run.repo, branch, {});
  const pass = await runWith(h.e, tickRun({ repo: ROOT, memo: MEMO, verifyRest: true }).pipe(Effect.provide(unreadIn(run.repo))));
  assert.equal(pass.cost!.rested, before - tippedThere, 'every run of it whose tips the memo holds is judged in full, and no other');
  assert.equal(readRun(run.id).tips![branch], tip, 'and the tip the record holds is kept: the pass read no head');
  assert.equal(await rested(), before - 1, 'its standing read again, the run whose branch moved is judged afresh');
  assert.equal(readRun(run.id).tips![branch], moved, 'and its tip written');
  await rested();
  assert.equal(await rested(), before, 'and at rest again');
});

test('a run forgotten leaves the memo, and passes over runs at rest write nothing to the feed', async () => {
  const run = aResting();
  await rested();
  const size = fs.statSync(feedFile()).size;
  await rested();
  await rested();
  assert.equal(fs.statSync(feedFile()).size, size, 'nothing moved, nothing said');
  await runWith(h.e, forgetRun(run.id));
  await rested();
  assert.equal(MEMO.runs.has(run.id), false, 'gone from the memo with its record');
});

test('a feed that cannot be read empties the memo and costs the pass nothing: every run is judged in full, and the next pass reads the feed from its end', async () => {
  const before = await rested();
  assert.ok(before > 0 && MEMO.cursor !== undefined, 'the memo holds runs at rest, and where on the feed it read to');
  const unread = {
    ...h.e,
    feed: () => Effect.fail(new Error('the journal cannot be read') as never),
  };
  const pass = await runWith(unread, tickRun({ repo: ROOT, memo: MEMO, verifyRest: true }));
  assert.equal(pass.cost?.rested, 0, 'no run answered from memory');
  assert.deepEqual(
    pass.runs.map((a) => a.run.id),
    listRuns().map((r) => r.id),
    'every run judged, in the store order',
  );
  assert.deepEqual([MEMO.runs.size, MEMO.cursor], [0, undefined], 'the memo emptied, and its place on the feed forgotten');
  assert.equal(await rested(), 0, 'the next pass reads the feed from its end, and judges every run afresh');
  assert.notEqual(MEMO.cursor, undefined);
  assert.equal(await rested(), before, 'and the pass after answers from memory what it answered before');
});

test('REFUSED: a file in the asks directory that no reader reads still takes its run out — the stamp reads the asks, not only the record', async () => {
  await evicts('an unread file in the asks', (run) => {
    fs.mkdirSync(asksDir(run.id), { recursive: true });
    fs.writeFileSync(path.join(asksDir(run.id), 'later'), 'nothing any reader reads\n');
  });
});

test("REFUSED: an event on a task's journal alone — no file in the store moved — takes its run out: the pass reads the feed", async () => {
  await evicts('a journal line', (run) =>
    h.journal.append(`${run.id}-work`, { kind: 'measured', at: new Date().toISOString(), attempt: 1, usage: { turns: 3 } }),
  );
});

test('REFUSED: a memo that answers otherwise than a full pass, its inputs unchanged, throws under verifyRest, naming the run', async () => {
  const run = aResting();
  await rested();
  const kept = MEMO.runs.get(run.id)!;
  const was = kept.advanced;
  kept.advanced = { ...was, status: 'failed' };
  await assert.rejects(
    verified(),
    (err: Error) => err.message.includes(run.id) && /from its memo of runs at rest, and a full pass answers otherwise/.test(err.message),
  );
  kept.advanced = was;
  await rested();
});

test('REFUSED: a memo whose run reads otherwise than its record, its stamp unchanged, throws under verifyRest, naming the run', async () => {
  const run = aResting();
  await rested();
  const kept = MEMO.runs.get(run.id)!;
  const was = kept.run;
  kept.run = { ...was, brief: 'not what the record says' };
  await assert.rejects(
    verified(),
    (err: Error) => err.message.includes(run.id) && /its record reads otherwise than the memo's run/.test(err.message),
  );
  kept.run = was;
  await rested();
});

test('REFUSED: a memo that holds a run a full pass finds not at rest throws under verifyRest, naming the clauses that hold it out', async () => {
  const { run: _, ...advanced } = await answered(inFlight[0].id);
  const run = readRun(inFlight[0].id);
  MEMO.runs.set(run.id, { stamp: restStamps().get(run.id)!, run, tipped: [], advanced });
  await assert.rejects(
    verified(),
    (err: Error) => err.message.includes(run.id) && /a full pass finds it not at rest \(status, settled, inFlight\)/.test(err.message),
  );
  MEMO.runs.delete(run.id);
  await rested();
});

test("a run's stamp moves with any file named for it, a marker nobody has named yet included, and not with its own directory", async () => {
  const run = aResting();
  const stamp = () => restStamps().get(run.id);
  const was = stamp();
  assert.ok(was?.includes(`${run.id}.json=`), 'the record is stamped');
  fs.mkdirSync(path.join(runsDir(), run.id, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(runsDir(), run.id, 'inputs', 'brief.md'), 'what the run was given\n');
  assert.equal(stamp(), was, 'its directory — its files and inputs — is no input of a pass');
  fs.writeFileSync(path.join(runsDir(), `${run.id}.later`), 'a marker a later version writes\n');
  assert.notEqual(stamp(), was, 'a file named for the run is stamped, whatever it is called');
  fs.rmSync(path.join(runsDir(), `${run.id}.later`));
  assert.equal(stamp(), was, 'and, gone, the stamp is as it was');
  assert.equal(restStamps().has(`${run.id}-other`), false, 'a run with no files has no stamp');
});

/**
 * A finished run of worktrees, its worktrees then removed from under it by hand and its hand-offs never written down: a pass owes a step a
 * hand-off (`handOffDue`) that it can only try in a directory that is not there.
 */
const worktreesGone = (run: Run) => {
  const record = JSON.parse(fs.readFileSync(runFile(run.id), 'utf8')) as {
    steps: Record<string, { workspace?: string; handedOff?: string }>;
  };
  for (const step of Object.values(record.steps)) {
    delete step.handedOff;
    if (!step.workspace) continue;
    assert.ok(
      step.workspace?.startsWith(path.join(ROOT, 'worktrees', run.id)),
      `only a worktree the run made is removed (${step.workspace})`,
    );
    fs.rmSync(step.workspace, { recursive: true, force: true });
  }
  fs.writeFileSync(runFile(run.id), JSON.stringify(record, null, 2));
};

test('a run called off before anything of it was filed rests like a finished one: answered from memory, and judged the same in full', async () => {
  const [run] = await started(1);
  markCancelled(run.id);
  touched.add(run.id);
  const before = await rested();
  assert.equal(readRun(run.id).steps.work?.taskId ?? null, null, 'nothing of it filed');
  assert.ok(MEMO.runs.has(run.id), 'at rest after the pass that judged it');
  assert.equal(await rested(), before + 1, 'answered from memory on the next, and judged the same in full (verifyRest)');
  assert.equal((await answered(run.id)).status, 'cancelled');
  await evicts(
    ".pruned, a word of a person's, which takes it out as it takes any run out",
    (r) => {
      fs.writeFileSync(pruneFile(r.id), `${JSON.stringify({ at: new Date().toISOString(), worktrees: [] })}\n`);
    },
    run,
  );
});

test('a finished run whose worktrees are gone owes no hand-off, and rests — succeeded, blocked at a step, and called off', async () => {
  const [ok, broke, off] = await started(3, TWO, ISOLATED_REPOS[0], true);
  for (const run of [ok, broke, off]) touched.add(run.id);
  await finish([broke.id]);
  markCancelled(off.id);
  await finish();
  const before = await measured();
  for (const run of [ok, broke, off]) assert.ok(MEMO.runs.has(run.id), `${run.id} at rest with its worktrees there`);
  for (const run of [ok, broke, off]) await evicts(`${run.id}: its worktrees gone`, worktreesGone, run);
  assert.deepEqual(
    [ok, broke, off].map((r) => readRun(r.id).steps.plan?.handedOff ?? null),
    [null, null, null],
    'no hand-off written down: none was made',
  );
  assert.deepEqual(await Promise.all([ok, broke, off].map(async (r) => (await answered(r.id)).status)), [
    'succeeded',
    'blocked',
    'cancelled',
  ]);
  const after = await measured();
  console.log(
    'COST',
    JSON.stringify({
      before: { rested: before.rested, place: places(before), journals: journals(before), spawned: before.spawned },
      after: { rested: after.rested, place: places(after), journals: journals(after), spawned: after.spawned },
    }),
  );
  assert.equal(after.rested, before.rested, 'every one of them answered from memory');
  assert.equal(
    places(after),
    places(before),
    'no place process of their own: a hand-off tried in a directory that is gone was one each a pass',
  );
  assert.equal(journals(after), journals(before), 'and no journal read');
});

test('REFUSED: nemia prune does not wait on a hand-off from a worktree that is gone — no pass could make one there', async () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  for (const name of ['left', 'right'])
    fs.writeFileSync(path.join(dir, `${name}.md`), `---\nplace: git\nharness: codex\n---\n${name} it\n`);
  const run = await runPlaced(startRun({ brief: 'two roots', repo: ISOLATED_REPOS[1], workflowDir: dir, isolate: true }));
  touched.add(run.id);
  for (let k = 0; k < 12 && (await answered(run.id)).status !== 'succeeded'; k++) h.signAll(inFlight);
  const record = JSON.parse(fs.readFileSync(runFile(run.id), 'utf8')) as {
    steps: Record<string, { workspace: string; handedOff?: string }>;
  };
  assert.notEqual(
    record.steps.left.workspace,
    record.steps.right.workspace,
    'two roots, a worktree each: one of them removed, the other still there for `nemia prune` to remove',
  );
  delete record.steps.right.handedOff;
  fs.rmSync(record.steps.right.workspace, { recursive: true, force: true });
  fs.writeFileSync(runFile(run.id), JSON.stringify(record, null, 2));
  const pruning = await runWith(h.e, prune(run.id, { unmerged: true }));
  assert.equal(
    pruning.kind,
    'prunable',
    `the worktree left is prunable, not refused as right's hand-off still owed: ${pruning.kind === 'refused' ? pruning.refusal : pruning.kind}`,
  );
});

/** A workflow folder whose `implement` is followed by `ship`, its ending: gated, and worked in the repository's own checkout. */
const shipping = () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\nharness: codex\n---\nimplement it\n');
  fs.writeFileSync(
    path.join(dir, 'ship.md'),
    '---\nplace: git\nharness: codex\nafter: implement\nworkspace: main\ngate: true\n---\nship it\n',
  );
  return dir;
};

test('a pass lists the store once: an ending waiting on the checkout and a refused queued card read no record of a finished run', async () => {
  const repo = aRepo();
  const [first, second] = await started(2, shipping(), repo, true);
  for (const run of [first, second]) touched.add(run.id);
  for (let k = 0; k < 8 && ![first, second].every((r) => MEMO.runs.has(r.id)); k++) {
    await verified();
    for (const run of [first, second]) {
      const workspace = readRun(run.id).steps.implement?.workspace;
      if (workspace) fs.writeFileSync(path.join(workspace, `${run.id}.ts`), 'export const done = true;\n');
    }
    h.signAll(inFlight);
  }
  assert.ok(MEMO.runs.has(first.id) && MEMO.runs.has(second.id), 'both runs at rest at the gate of their ending');
  await runWith(h.e, approveRun(first.id, 'ship', 'Merge it.'));
  await verified();
  assert.ok(readRun(first.id).steps.ship?.taskId, "the first run's ending filed in the checkout");
  inFlight.push(first);
  await runWith(h.e, approveRun(second.id, 'ship', 'Merge it too.'));

  const gone = folder('work');
  const { card } = addToInbox({ text: 'an idea whose workflow is gone', workflow: gone, repo: REPO });
  queueInInbox(card.name);
  fs.rmSync(gone, { recursive: true });
  const refused = await verified();
  assert.ok(refused.queue && 'refused' in refused.queue, `the card's start refused (${JSON.stringify(refused.queue)})`);

  await verified();
  const pass = await runWith(h.e, tickRun({ repo: ROOT, memo: MEMO, verifyRest: false }));
  const cost = pass.cost!;
  const listed = listRuns().length;
  assert.ok(cost.rested >= 200, `the finished runs answered from memory (${cost.rested})`);
  assert.equal(
    cost.records,
    listed - cost.rested,
    `only the records of the runs in flight read (${cost.records} of ${listed}, ${cost.rested} at rest): the checkout's claims and the queue are read off the pass's own listing`,
  );
  const waiting = pass.runs.find((a) => a.run.id === second.id)!;
  assert.equal(readRun(second.id).steps.ship?.taskId ?? null, null, "the second run's ending is not filed");
  assert.equal(
    waiting.feed.steps.find((step) => step.name === 'ship')?.word,
    `waiting on the checkout (${first.id}'s ship has it)`,
    "it waits on the first run's, in the checkout",
  );
  assert.equal(pass.queue, undefined, 'the refused card is not tried again');
  const listing = readInbox().find((l) => l.name === card.name);
  assert.ok(listing?.queued && listing.tried?.refused, 'the card still queued, with its refusal');
});
