/**
 * What the tick's memo of runs at rest saves a pass, and what takes a run out of it (`advanceResting` in tick.verb.ts). Two tests. A story
 * over one big quiet store, built once: two hundred finished runs beside three in flight, where a pass costs what is in flight — its
 * records, journals read on disk, observes, questions of its place and spans — and never what has finished, nor how long the runtime's
 * feed has grown; the board's light list and a warm read of it alike. And a table of every input of a run at rest (`restStamps`, the feed,
 * its result branches) and every refusal of `verifyRest`, each row on a small store of its own, made for it and emptied by the next, so no
 * row reads what another changed; the list's own memo (`restingRead`) has its rows there too. What makes a run at rest is pure, and lives
 * in rest.test.ts.
 *
 * Walked through the runtime itself, `plainEngine` over its own journal on disk, whose reads it counts, and a harness the test signs by
 * hand, which takes what it is said and lets a session go. On one test place for the file; the git processes a pass's place starts are
 * counted on git in pass-processes.boundary.test.ts. A file of its own, since `tick` reads every run under `WF_ROOT`, read as the module
 * loads, so it is set before the import; no cap on runs in flight, and sessions enough that every task filed is admitted on the pass
 * after, so a store of two hundred runs is built in a few passes. Every pass that is not a measurement judges the runs the memo answered
 * in full as well (`verifyRest`), and throws where the two differ.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Tracer } from 'effect';
import { Engine, Journal, type Event, type Sighting } from 'agent-runtime';
import { asyncOps, plainEngine, type AsyncRunner } from '../../test/promised.ts';
import type { RepositoryRun, Run } from '../run.ts';
import type { PassCost } from '../meter/meter.ts';
import { scratch } from '../../test/scratch.ts';
import { runGiven, runOver } from '../../test/placed.ts';
import { testPlace } from '../../place/memory/index.ts';
import { placeOver, unreadBy } from '../../test/place-over.ts';
import { story } from '../../test/story.ts';

const ROOT = scratch('wf-rest-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
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
const { runWith: runEngine, EngineService } = await import('../runtime-client.ts');
const { PlaceService } = await import('../place/place.store.ts');
const { meteredPlace } = await import('../place/builtin.store.ts');
const { RUNS_FINISHED, RUNS_OPEN } = await import('../command/pages.verb.ts');
const { metered } = await import('../meter/tally.store.ts');
const { restingMemo, restingRead } = await import('../rest/resting.verb.ts');
const { NOTHING_READ, standingReader } = await import('../standing/standing.verb.ts');
const { filingsRead } = await import('../views/views.verb.ts');
type RunSummary = import('../summary/summary.verb.ts').RunSummary;
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

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };
const BLOCKED = { outcome: 'blocked', summary: 'two flags could be meant', artifacts: [], needs: 'which flag?' };

/**
 * The runtime over its own journal on disk, with a harness whose sessions work until `signAll` ends them, take what they are said, and
 * are let go by being forgotten. `signAll` signs every session at work but those of the runs `keep` names, which stay in flight, with
 * `closeout`, or `SIGNED` where it names none, stamped a millisecond after the journal says its attempt began. `on` makes another engine
 * over a runtime store at `root` with the same harness, as a restarted daemon makes one; `journal` writes to this one's journal as the
 * runtime would; `holdObserve` makes the next observe wait until it is let go.
 */
const engine = () => {
  const root = fs.mkdtempSync(path.join(ROOT, 'engine-'));
  const sessions = new Map<string, Sighting>();
  let n = 0;
  let holding: { entered: () => void; gate: Promise<void> } | undefined;
  const runner: AsyncRunner = {
    async spawn(r) {
      n++;
      sessions.set(r.name, { sessionId: `s-${n}`, nativeId: `native-${n}`, state: 'working', busy: true });
    },
    async observe() {
      const held = holding;
      holding = undefined;
      if (held) {
        held.entered();
        await held.gate;
      }
      return new Map(sessions);
    },
    async stop(id) {
      for (const [name, s] of sessions) if (s.sessionId === id) sessions.set(name, { ...s, state: 'canceled', busy: false });
    },
    async logs() {
      return '';
    },
    async say() {},
  };
  const release = (s: Sighting) =>
    Effect.sync(() => {
      for (const [name, listed] of sessions) if (listed.sessionId === s.sessionId) sessions.delete(name);
    });
  const ops = { ...asyncOps(runner), release };
  const harnesses = { claude: ops, codex: ops, check: ops };
  const on = (at: string) => plainEngine(Engine.layer({ root: at, harnesses, defaultHarness: 'claude' }));
  const e = on(root);
  const begun = async (name: string) => {
    const [, task, attempt] = /^ae\/(.+)\/(\d+)$/.exec(name)!;
    const { state } = await Effect.runPromise(e.view(task));
    return Date.parse(state.attempts.find((a) => a.n === Number(attempt))?.startedAt ?? '');
  };
  const signAll = async (keep: readonly Run[] = [], closeout: (name: string) => object | undefined = () => undefined) => {
    for (const [name, s] of sessions) {
      if (s.state !== 'working' || keep.some((r) => name.startsWith(`ae/${r.id}-`))) continue;
      sessions.set(name, {
        ...s,
        state: 'completed',
        busy: false,
        closeout: { payload: closeout(name) ?? SIGNED, at: (await begun(name)) + 1 },
      });
    }
  };
  const holdObserve = () => {
    let entered = () => {};
    const waiting = new Promise<void>((r) => (entered = r));
    let go = () => {};
    holding = { entered, gate: new Promise<void>((r) => (go = r)) };
    return { waiting, go };
  };
  return { e, root, on, journal: Journal.filesOps(root), sessions, signAll, holdObserve };
};

const journals = (c: PassCost) => c.phases.journals.calls;
const observes = (c: PassCost) => c.phases.observe.calls;
/** The questions a pass asked of its place: what `place.calls` counts, a question one call whatever its place starts to answer it. */
const places = (c: PassCost) => c.phases.place.calls;

/**
 * A store of runs and the passes over it: a fresh engine and memo, the store's runs emptied first, so a store is the one its test made.
 * `verified` judges every run the memo answers again in full and throws where the two differ; `measured` is a pass as the daemon makes
 * it, the memo trusted; `rested` the runs the next verified pass answers from memory. `finish` passes until every run but those in
 * flight has finished and the memo answers it, a session whose name holds one of `blocking` signing blocked; `steady` is the pass after
 * it. `aResting` takes a finished run at rest no checkpoint took yet. `evicts` makes `change` to a run at rest and holds that it takes
 * that run, and no other, out of the memo for the pass that reads it — for `afresh` passes, where the first writes the record — and
 * that it rests again after; the first of them reads `read` records more than a steady pass: the run's own, unless no file of it moved.
 */
const storeOf = () => {
  fs.rmSync(runsDir(), { recursive: true, force: true });
  fs.mkdirSync(runsDir(), { recursive: true });
  const h = engine();
  const memo = freshRestMemo();
  const inFlight: Run[] = [];
  const verified = () => runWith(h.e, tickRun({ repo: ROOT, memo, verifyRest: true }));
  const measured = async (m = memo): Promise<PassCost> => (await runWith(h.e, tickRun({ repo: ROOT, memo: m, verifyRest: false }))).cost!;
  const finish = async (blocking: readonly string[] = []): Promise<PassCost> => {
    for (let k = 0; k < 12; k++) {
      await verified();
      await h.signAll(inFlight, (name) => (blocking.some((id) => name.startsWith(`ae/${id}-`)) ? BLOCKED : undefined));
      const pass = await measured();
      const finished = listRuns().filter((r) => !inFlight.some((f) => f.id === r.id)).length;
      if (pass.rested === finished) return pass;
    }
    assert.fail('the store did not come to rest in twelve passes');
  };
  const steady = async (): Promise<PassCost> => {
    await finish();
    return measured();
  };
  const started = async (n: number, workflowDir = ONE, repo = REPO, isolate = false) => {
    const runs: Run[] = [];
    for (let k = 0; k < n; k++) runs.push(await runPlaced(startRun({ brief: `run ${k}`, repo, workflowDir, isolate })));
    return runs;
  };
  const rested = async (): Promise<number> => (await verified()).cost!.rested;
  const answered = async (id: string) => (await verified()).runs.find((a) => a.run.id === id)!;
  const touched = new Set<string>();
  const aResting = (isolate = false): RepositoryRun => {
    const run = listRuns().find(
      (r) => Boolean(r.isolate) === isolate && !touched.has(r.id) && !inFlight.some((f) => f.id === r.id) && memo.runs.has(r.id),
    );
    assert.ok(run, 'a run at rest is left to touch');
    assert.ok(isRepositoryRun(run), `${run.id} works on a repository`);
    touched.add(run.id);
    return run;
  };
  const evicts = async (what: string, change: (run: Run) => unknown, run: Run = aResting(), afresh = 1, read = 1) => {
    const before = await rested();
    const steadily = await measured();
    assert.ok(memo.runs.has(run.id), `${what}: the run is at rest before`);
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
  return { h, memo, inFlight, verified, measured, finish, steady, started, rested, answered, touched, aResting, evicts };
};

/**
 * A small store for one row: `inFlight` runs at work, `inPlace` finished runs worked in place, `isolated` in worktrees of one
 * repository.
 */
const small = async (given: { inFlight?: number; inPlace?: number; isolated?: number } = {}) => {
  const s = storeOf();
  s.inFlight.push(...(await s.started(given.inFlight ?? 0)));
  await s.started(given.inPlace ?? 2);
  if (given.isolated) await s.started(given.isolated, TWO, aRepo(), true);
  await s.finish();
  return s;
};

const REPO = aRepo();
const ONE = folder('work');
const TWO = folder('plan', 'work');

/** A pass's journal reads through the runtime's readers or the store's, and the calls that asked for them. */
const reads = (c: PassCost) => ({
  journals: c.phases.journals.reads,
  asked: c.phases.journals.calls,
  runtime: c.phases.runtime.reads,
  records: c.records,
});
/** The names of `spans`, sorted: what a pass traced, whatever order its fibers ended in. */
const namesOf = (spans: readonly Tracer.NativeSpan[]): string[] => spans.map((s) => s.name).sort();
/** The board's light list of the open runs, as the api answers it, read cold. */
const open = (e: Parameters<typeof runWith>[0]) => runWith(e, RUNS_OPEN.handler({}, process.env));
/**
 * An answer of the light list without its clocks, which the wall clock moves between two reads, nor the note of how many words a run in
 * flight was said, which the story says to them between the two.
 */
const unclocked = (answer: object) =>
  JSON.parse(
    JSON.stringify(answer, (key, value) =>
      ['asOf', 'clock', 'wallMs', 'waitingSince', 'startedAt', 'note'].includes(key) ? undefined : value,
    ),
  );

test('a big quiet store: two hundred finished runs beside three in flight cost a pass what the three cost', async (t) => {
  const s = storeOf();
  const st = story(t);
  const { h, inFlight } = s;
  const traced = async (verifyRest: boolean) => {
    const spans: Tracer.NativeSpan[] = [];
    const tracer = Tracer.make({
      span(options) {
        const span = new Tracer.NativeSpan(options);
        spans.push(span);
        return span;
      },
    });
    const pass = await runPlaced(
      tickRun({ repo: ROOT, memo: s.memo, verifyRest }).pipe(Effect.provide(EngineService.layer(h.e)), Effect.withTracer(tracer)),
    );
    return { cost: pass.cost!, spans };
  };
  const saidToInFlight = async (e = h.e) => {
    for (const run of listRuns().filter((r) => inFlight.some((f) => f.id === r.id)))
      await Effect.runPromise(e.say(run.steps.work.taskId!, 'Keep going.'));
  };
  const quiet = async () => {
    for (let k = 0; k < 12; k++) if (!(await traced(false)).spans.some((span) => span.name === 'releaseFinished')) break;
    await saidToInFlight();
    return traced(false);
  };
  const unverified = { ...process.env, WF_VERIFY_REST: '0' };
  const kept = { runs: restingMemo<Omit<RunSummary, 'startedAt'>>(), filings: { filed: new Map(), cursor: 0 } };
  const warm = async (): Promise<number | undefined> => {
    await runWith(h.e, RUNS_OPEN.handler({}, unverified, ROOT, kept));
    return (await metered(() => runWith(h.e, RUNS_OPEN.handler({}, unverified, ROOT, kept)))).tallies?.records;
  };
  const ISOLATED_REPOS = [aRepo(), aRepo()];
  type Quiet = Awaited<ReturnType<typeof quiet>>;
  const sizes: Array<{ cost: PassCost; quiet: Quiet }> = [];
  let lightBefore: object = {};
  let warmBefore: number | undefined;

  await st.test(
    'a pass costs as many journal reads, observes and questions of its place on 200 finished runs as on none: what is in flight sets it',
    async () => {
      inFlight.push(...(await s.started(3)));
      sizes.push({ cost: await s.steady(), quiet: await quiet() });
      lightBefore = await open(h.e);
      warmBefore = await warm();
      await s.started(3, TWO, ISOLATED_REPOS[0], true);
      await s.started(3, TWO, ISOLATED_REPOS[1], true);
      await s.started(94);
      sizes.push({ cost: await s.steady(), quiet: await quiet() });
      await s.started(100);
      sizes.push({ cost: await s.steady(), quiet: await quiet() });

      const [none, hundred, twoHundred] = sizes.map((z) => z.cost) as [PassCost, PassCost, PassCost];
      assert.equal(none.rested, 0);
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
    },
  );

  await st.test(
    'the runs in flight said a word, the pass at rest reads their journals on disk, as much over 200 finished as over none, and traces as much',
    async () => {
      const [none, hundred, twoHundred] = sizes.map((z) => z.quiet) as [Quiet, Quiet, Quiet];
      assert.ok(
        reads(none.cost).runtime > 0,
        `the runtime's pass reads its journals on disk, for what was said (${reads(none.cost).runtime})`,
      );
      assert.equal(none.cost.records, inFlight.length, 'the records of the runs in flight alone');
      assert.deepEqual(reads(twoHundred.cost), reads(none.cost), 'as many journals and records read over 200 finished runs as over none');
      const said = ({ spans }: Quiet) => {
        const pass = spans.find((span) => span.name === 'pass');
        return [pass?.attributes.get('runs'), pass?.attributes.get('rested')];
      };
      assert.deepEqual(
        [said(hundred), said(twoHundred)],
        [
          [100 + inFlight.length, 100],
          [200 + inFlight.length, 200],
        ],
        'the pass says how many runs it listed and answered from memory',
      );
      assert.deepEqual(namesOf(twoHundred.spans), namesOf(hundred.spans), 'as many spans, and the same, over 200 runs at rest as over 100');
      assert.deepEqual(
        namesOf(twoHundred.spans).filter((name) => name === 'advanceResting' || name === 'releaseFinished'),
        [],
        'no span for a run answered from memory, nor for a settled task with nothing to release',
      );
      const advanced = twoHundred.spans.filter((span) => span.name === 'advancePass').map((span) => String(span.attributes.get('run')));
      assert.deepEqual(advanced.sort(), inFlight.map((r) => r.id).sort(), 'a run judged in full is a run in flight');
    },
  );

  await st.test(
    "the board's light list answers the same with none finished and two hundred, and a warm read of it reads no more",
    async () => {
      const after = (await open(h.e)) as { counts: { finished: number } };
      assert.equal(after.counts.finished, 200);
      assert.deepEqual(unclocked({ ...after, counts: { ...after.counts, finished: 0 } }), unclocked(lightBefore));
      const last = await runWith(h.e, RUNS_FINISHED.handler({ page: '23' }, process.env));
      assert.equal(last.runs.length, 2, 'two hundred finished runs, nine a page: two on the last');
      const many = await warm();
      assert.equal(warmBefore, 2 * inFlight.length, 'the records of the runs in flight alone, at rest in no memo, read for their clocks');
      assert.equal(many, warmBefore, "a warm read reads no finished run's record, however many there are");
      const warmed = await runWith(h.e, RUNS_OPEN.handler({}, unverified, ROOT, kept));
      assert.deepEqual(unclocked(warmed), unclocked(await open(h.e)), "the warm answer is a cold read's own");
    },
  );

  await st.test(
    'a second pass reads no record of a finished run, and a memo emptied, as a restarted daemon has it, reads them all, git no more',
    async () => {
      await s.measured();
      const second = await s.measured();
      const listed = listRuns().length;
      assert.equal(second.rested, 200, 'every finished run answered from memory');
      assert.equal(second.records, listed - second.rested, `only the records of the runs in flight read (${second.records} of ${listed})`);
      const fresh = await s.measured(freshRestMemo());
      assert.ok(fresh.records >= listed, `every record read with nothing in memory (${fresh.records} of ${listed})`);
      assert.equal(fresh.rested, 0, 'nothing answered from memory');
      const [none, , twoHundred] = sizes.map((z) => z.cost) as [PassCost, PassCost, PassCost];
      assert.ok(journals(fresh) >= journals(none) + 200, `each of the 200 finished runs' tasks read (${journals(fresh)} reads)`);
      assert.equal(
        places(fresh),
        places(twoHundred),
        "the six runs whose tips are read ask no git of their own: their tips are read off the heads of the pass's one `standing` a repository",
      );
      assert.equal(
        journals(await s.measured()),
        journals(twoHundred),
        "the pass that follows, on the engine's own memo, is as it was: an empty memo is a cost, never an answer",
      );
    },
  );

  await st.test(
    'the same store paused: once the pass after the pause has read every run with it, every finished run is answered from memory',
    async () => {
      const [none] = sizes.map((z) => z.cost) as [PassCost];
      putPause({ why: 'merging by hand', by: 'ann' });
      try {
        await s.measured();
        const paused = await s.measured();
        const listed = listRuns().length;
        assert.equal(paused.rested, 200, 'every finished run answered from memory while the pause stands');
        assert.equal(
          paused.records,
          listed - paused.rested,
          `only the records of the runs in flight read (${paused.records} of ${listed})`,
        );
        assert.equal(journals(paused), journals(none), 'no journal read more than the runs in flight make');
      } finally {
        resumePause();
      }
      await s.measured();
      assert.equal((await s.measured()).rested, 200, 'and once it is lifted, as before');
    },
  );

  await st.test(
    'a pass that answers the finished runs from memory carries no refused move: their tasks are settled, and the runtime moves none',
    async () => {
      for (let k = 0; k < 3; k++) {
        const pass = await s.verified();
        assert.ok(pass.cost!.rested >= 200, `pass ${k + 1}: the finished runs answered from memory (${pass.cost!.rested})`);
        assert.equal(pass.refused, undefined, `pass ${k + 1}: no refused move`);
      }
    },
  );

  const copied = (name: string, by: number) => {
    const root = path.join(ROOT, name);
    fs.cpSync(h.root, root, { recursive: true });
    const feed = path.join(root, 'feed.jsonl');
    const at = new Date(0).toISOString();
    const gone = Array.from({ length: by }, (_, k) => `${JSON.stringify({ taskId: `gone-${k}`, event: { kind: 'admitted', at } })}\n`);
    fs.writeFileSync(feed, gone.join('') + fs.readFileSync(feed, 'utf8'));
    return { root, feedBytes: fs.statSync(feed).size };
  };
  const bytes = (c: PassCost) => ({
    journals: { calls: c.phases.journals.calls, reads: c.phases.journals.reads, bytes: c.phases.journals.bytes },
    runtime: { reads: c.phases.runtime.reads, bytes: c.phases.runtime.bytes },
    records: c.records,
  });

  await st.test(
    "every pass of a restarted tick reads as much over a feed 20,000 lines longer as over the store's own: none of it grows with the feed",
    async () => {
      const passesOn = async (root: string) => {
        const e = h.on(root);
        const memo = freshRestMemo();
        const pass = async () => bytes((await runWith(e, tickRun({ repo: ROOT, memo, verifyRest: false }))).cost!);
        const first = await pass();
        const second = await pass();
        await saidToInFlight(e);
        return [first, second, await pass()];
      };
      const short = copied('engine-short', 0);
      const long = copied('engine-long', 20_000);
      assert.ok(long.feedBytes - short.feedBytes > 1_000_000, `the long feed is ${long.feedBytes - short.feedBytes} bytes longer`);
      const shortReads = await passesOn(short.root);
      const longReads = await passesOn(long.root);
      assert.ok(shortReads[2].runtime.bytes > 0 && shortReads[2].journals.bytes > 0, 'the third pass reads the lines the words appended');
      assert.deepEqual(longReads, shortReads);
    },
  );

  await st.test(
    'REFUSED: what another caller reads of the engine while a pass waits on its harness counts nothing to the pass: it reads as much as the pass before it',
    async () => {
      const harnessed = (c: PassCost) =>
        Object.fromEntries(
          Object.entries(c.harnesses).map(([name, x]) => [name, { calls: x.calls, listed: x.listed, spawned: x.spawned }]),
        );
      const e = h.on(copied('engine-beside', 0).root);
      const memo = freshRestMemo();
      const pass = async () => (await runWith(e, tickRun({ repo: ROOT, memo, verifyRest: false }))).cost!;
      await pass();
      const before = await pass();
      const held = h.holdObserve();
      const besideIt = pass();
      await held.waiting;
      const io0 = Effect.runSync(e.io());
      await runWith(e, filingsRead(0));
      for (const run of listRuns().filter((r) => inFlight.some((f) => f.id === r.id)))
        await Effect.runPromise(e.view(run.steps.work.taskId!));
      const io1 = Effect.runSync(e.io());
      held.go();
      const beside = await besideIt;
      const observed = (io: typeof io0) => io.observed.codex?.calls ?? 0;
      assert.ok(io1.bytesRead > io0.bytesRead && observed(io1) > observed(io0), 'the reads beside the pass read the feed and observed');
      assert.deepEqual([bytes(beside), harnessed(beside)], [bytes(before), harnessed(before)]);
    },
  );

  await st.test("a pass that lets a finished run's session go traces the release, with its task", async () => {
    const [run] = await s.started(1);
    s.touched.add(run.id);
    const released: string[] = [];
    for (let k = 0; k < 12 && !released.length; k++) {
      const { spans } = await traced(true);
      released.push(...spans.filter((span) => span.name === 'releaseFinished').map((span) => String(span.attributes.get('task'))));
      await h.signAll(inFlight);
    }
    assert.deepEqual(
      released,
      [readRun(run.id).steps.work.taskId],
      "the release of the run's session is traced, on the pass that let it go",
    );
    assert.equal(
      [...h.sessions.keys()].some((name) => name.startsWith(`ae/${run.id}-`)),
      false,
      'and its session was let go',
    );
    await s.finish();
  });

  await st.test(
    'a run called off before anything of it was filed rests like a finished one: answered from memory, and judged the same in full',
    async () => {
      const [run] = await s.started(1);
      markCancelled(run.id);
      s.touched.add(run.id);
      const before = await s.rested();
      assert.equal(readRun(run.id).steps.work?.taskId ?? null, null, 'nothing of it filed');
      assert.ok(s.memo.runs.has(run.id), 'at rest after the pass that judged it');
      assert.equal(await s.rested(), before + 1, 'answered from memory on the next, and judged the same in full (verifyRest)');
      assert.equal((await s.answered(run.id)).status, 'cancelled');
      await s.evicts(".pruned, a word of a person's, which takes it out as it takes any run out", pruned, run);
    },
  );

  const worktreesGone = (run: Run) => {
    const record = JSON.parse(fs.readFileSync(runFile(run.id), 'utf8')) as {
      steps: Record<string, { workspace?: string; handedOff?: string }>;
    };
    for (const step of Object.values(record.steps)) {
      delete step.handedOff;
      if (!step.workspace) continue;
      assert.ok(
        step.workspace.startsWith(path.join(ROOT, 'worktrees', run.id)),
        `only a worktree the run made is removed (${step.workspace})`,
      );
      fs.rmSync(step.workspace, { recursive: true, force: true });
    }
    fs.writeFileSync(runFile(run.id), JSON.stringify(record, null, 2));
  };

  await st.test(
    'a finished run whose worktrees are gone owes no hand-off, and rests — succeeded, blocked at a step, and called off',
    async () => {
      const [ok, broke, off] = await s.started(3, TWO, ISOLATED_REPOS[0], true);
      for (const run of [ok, broke, off]) s.touched.add(run.id);
      await s.finish([broke.id]);
      markCancelled(off.id);
      await s.finish();
      const before = await s.measured();
      for (const run of [ok, broke, off]) assert.ok(s.memo.runs.has(run.id), `${run.id} at rest with its worktrees there`);
      for (const run of [ok, broke, off]) await s.evicts(`${run.id}: its worktrees gone`, worktreesGone, run);
      assert.deepEqual(
        [ok, broke, off].map((r) => readRun(r.id).steps.plan?.handedOff ?? null),
        [null, null, null],
        'no hand-off written down: none was made',
      );
      assert.deepEqual(await Promise.all([ok, broke, off].map(async (r) => (await s.answered(r.id)).status)), [
        'succeeded',
        'waiting',
        'cancelled',
      ]);
      const after = await s.measured();
      assert.equal(after.rested, before.rested, 'every one of them answered from memory');
      assert.equal(
        places(after),
        places(before),
        'no place process of their own: a hand-off tried in a directory that is gone was one each a pass',
      );
      assert.equal(journals(after), journals(before), 'and no journal read');
    },
  );

  await st.test(
    'REFUSED: nemia prune does not wait on a hand-off from a worktree that is gone — no pass could make one there',
    async () => {
      const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
      for (const name of ['left', 'right'])
        fs.writeFileSync(path.join(dir, `${name}.md`), `---\nplace: git\nharness: codex\n---\n${name} it\n`);
      const run = await runPlaced(startRun({ brief: 'two roots', repo: ISOLATED_REPOS[1], workflowDir: dir, isolate: true }));
      s.touched.add(run.id);
      for (let k = 0; k < 12 && (await s.answered(run.id)).status !== 'succeeded'; k++) await h.signAll(inFlight);
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
      assert.equal(pruning.kind, 'prunable', "the worktree left is prunable, not refused as right's hand-off still owed");
    },
  );

  await st.test(
    'a pass lists the store once: an ending waiting on the checkout and a refused queued card read no record of a finished run',
    async () => {
      const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
      fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\nharness: codex\n---\nimplement it\n');
      fs.writeFileSync(
        path.join(dir, 'ship.md'),
        '---\nplace: git\nharness: codex\nafter: implement\nworkspace: base\ngate: true\n---\nship it\n',
      );
      const [first, second] = await s.started(2, dir, aRepo(), true);
      for (const run of [first, second]) s.touched.add(run.id);
      for (let k = 0; k < 8 && ![first, second].every((r) => s.memo.runs.has(r.id)); k++) {
        await s.verified();
        for (const run of [first, second]) {
          const workspace = readRun(run.id).steps.implement?.workspace;
          if (workspace) fs.writeFileSync(path.join(workspace, `${run.id}.ts`), 'export const done = true;\n');
        }
        await h.signAll(inFlight);
      }
      assert.ok(s.memo.runs.has(first.id) && s.memo.runs.has(second.id), 'both runs at rest at the gate of their ending');
      await runWith(h.e, approveRun(first.id, 'ship', 'Merge it.'));
      await s.verified();
      assert.ok(readRun(first.id).steps.ship?.taskId, "the first run's ending filed in the checkout");
      inFlight.push(first);
      await runWith(h.e, approveRun(second.id, 'ship', 'Merge it too.'));

      const gone = folder('work');
      const { card } = addToInbox({ text: 'an idea whose workflow is gone', workflow: gone, repo: REPO });
      queueInInbox(card.name);
      fs.rmSync(gone, { recursive: true });
      const refused = await s.verified();
      assert.ok(refused.queue && 'refused' in refused.queue, `the card's start refused (${JSON.stringify(refused.queue)})`);

      await s.verified();
      const pass = await runWith(h.e, tickRun({ repo: ROOT, memo: s.memo, verifyRest: false }));
      const cost = pass.cost!;
      const listed = listRuns().length;
      assert.ok(cost.rested >= 200, `the finished runs answered from memory (${cost.rested})`);
      assert.equal(
        cost.records,
        listed - cost.rested,
        `only the records of the runs in flight read (${cost.records} of ${listed}): the checkout's claims and the queue are read off the pass's own listing`,
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
    },
  );
});

/** An event the runtime appends to a task: what it cost. */
const measuredEvent = (usage: object): Event => ({ kind: 'measured', at: new Date().toISOString(), attempt: 1, usage });
/** A marker of `.pruned`, as `nemia prune` writes it. */
const pruned = (run: Run) => fs.writeFileSync(pruneFile(run.id), `${JSON.stringify({ at: new Date().toISOString(), worktrees: [] })}\n`);

/**
 * The list's own memo (`restingRead`, resting.verb.ts), which the board's reads keep: an answer kept for a run is given back while its
 * files in the store, its record and the engine's feed for its tasks stand. Folder runs written by hand on a small store of their own,
 * over the runtime's feed held in memory.
 */
const listMemo = () => {
  const s = storeOf();
  const lines: Array<{ taskId: string; event: Event }> = [];
  let broken = false;
  const e = {
    ...s.h.e,
    feed: (after?: number) =>
      broken
        ? Effect.fail(new Error('the feed does not read') as never)
        : Effect.succeed({ entries: lines.slice(after ?? 0), cursor: lines.length } as never),
  } as typeof s.h.e;
  const git = standingReader(NOTHING_READ);
  const stored = (id: string): Run => {
    const run = {
      id,
      workspace: ROOT,
      brief: 'Do it.',
      workflowDir: path.join(ROOT, 'team'),
      workflow: [],
      createdAt: '2026-10-04T10:00:00.000Z',
      place: { kind: 'folder' },
      steps: { work: { status: 'done', taskId: `${id}-work-1` } },
    } as unknown as Run;
    fs.writeFileSync(runFile(id), JSON.stringify(run));
    return run;
  };
  const read = (memo: ReturnType<typeof restingMemo<{ said: string }>>, verify = false) =>
    runWith(e, restingRead<{ said: string }>(e, memo, verify, git));
  const memoOf = async (run: Run, said: string) => {
    const memo = restingMemo<{ said: string }>();
    await read(memo);
    (await read(memo)).keep(run, { said }, [], () => new Map());
    return memo;
  };
  const line = (taskId: string) => lines.push({ taskId, event: measuredEvent({ responses: 1 }) });
  return { stored, read, memoOf, line, breakFeed: (to: boolean) => (broken = to) };
};

/**
 * A run at rest of `s` whose asks directory is already there, empty, and read by a pass since: what then moves in it is a file in a
 * directory the stamp already lists, never a name new beside the record.
 */
const withAsks = async (s: Awaited<ReturnType<typeof small>>) => {
  const run = s.aResting();
  fs.mkdirSync(asksDir(run.id), { recursive: true });
  await s.rested();
  await s.rested();
  return run;
};

test('every input of a run at rest takes it, and it alone, out of the memo; a memo that answers otherwise than a full pass is refused', async (t) => {
  await t.test('its record written again, word for word', async () => {
    const s = await small();
    await s.evicts('the record', (run) => {
      const text = fs.readFileSync(runFile(run.id));
      fs.writeFileSync(`${runFile(run.id)}.new`, text);
      fs.renameSync(`${runFile(run.id)}.new`, runFile(run.id));
    });
  });

  await t.test("a person's .cancelled beside the record, and the pass that reads it says so", async () => {
    const s = await small();
    const run = await s.evicts('.cancelled', (r) => markCancelled(r.id));
    assert.equal((await s.answered(run.id)).status, 'cancelled');
  });

  await t.test("a person's .pruned beside the record, and the pass that reads it says so", async () => {
    const s = await small();
    const run = await s.evicts('.pruned', pruned);
    assert.ok((await s.answered(run.id)).run.pruned, 'the run reads as pruned');
  });

  await t.test("a hold, for as long as it holds: what it waits on is another run's", async () => {
    const s = await small({ inFlight: 1 });
    const run = s.aResting();
    const before = await s.rested();
    const steadily = await s.measured();
    fs.writeFileSync(holdFile(run.id), `${JSON.stringify({ at: new Date().toISOString(), until: [] })}\n`);
    const held = await s.measured();
    assert.deepEqual(
      [held.rested, held.records],
      [before - 1, steadily.records + 1],
      'held on no run, the held run is judged afresh, and no other',
    );
    fs.writeFileSync(holdFile(run.id), `${JSON.stringify({ at: new Date().toISOString(), until: [s.inFlight[0].id] })}\n`);
    assert.equal(await s.rested(), before - 1);
    assert.equal(await s.rested(), before - 1, 'held, it is judged afresh on every pass');
    fs.rmSync(holdFile(run.id));
    assert.equal(await s.rested(), before - 1, 'the hold lifted, the pass that reads it judges afresh');
    assert.equal(await s.rested(), before);
  });

  await t.test('an ask for a retry, and the try it asks for filed', async () => {
    const s = await small();
    const [run] = await s.started(1);
    s.touched.add(run.id);
    const before = (await s.finish([run.id])).rested;
    assert.equal((await s.answered(run.id)).status, 'waiting', 'its step signed blocked');
    await runWith(s.h.e, retryRun(run.id, 'work', { mode: 'fresh' }));
    assert.equal(await s.rested(), before - 1, 'the ask read');
    assert.equal((await s.finish()).rested, before, 'the try filed, signed, settled, and the run at rest again');
    assert.equal(readRun(run.id).steps.work.taskId, `${run.id}-work-try2`, 'on its second try');
  });

  await t.test('an approval at a gate, a file in the asks, and the step it lets go filed', async () => {
    const s = await small();
    const gated = await runPlaced(startRun({ brief: 'gated', repo: REPO, workflowDir: TWO, isolate: false, gates: ['plan'] }));
    s.touched.add(gated.id);
    for (let k = 0; k < 8 && !s.memo.runs.has(gated.id); k++) {
      await s.verified();
      await s.h.signAll();
    }
    assert.ok(s.memo.runs.has(gated.id), 'a run waiting at a gate, its task settled, is at rest');
    assert.equal(readRun(gated.id).steps.work?.taskId ?? null, null, 'work waits on the gate');
    const waiting = await s.rested();
    await runWith(s.h.e, approveRun(gated.id, 'plan'));
    assert.ok(fs.existsSync(approvalFile(gated.id, 'plan', 1)), 'the approval is a file in the asks');
    assert.equal(await s.rested(), waiting - 1, 'the approval read');
    assert.ok(readRun(gated.id).steps.work?.taskId, 'and work filed on it');
    assert.equal((await s.finish()).rested, waiting, 'the run finished, and at rest again');
  });

  await t.test('an acceptance, which stays where it is', async () => {
    const s = await small();
    const run = await s.evicts(
      'an acceptance',
      (r) => writeAsk(acceptFile(r.id, 'work', 1), { step: 'work', try: 1, at: new Date().toISOString(), message: 'good enough as it is' }),
      await withAsks(s),
    );
    assert.ok(
      fs.existsSync(acceptFile(run.id, 'work', 1)),
      'an acceptance of a step that loops nowhere ends nothing and stays where it is, so the run rests again with it there',
    );
  });

  await t.test('an ask moved into done/', async () => {
    const s = await small();
    const run = await withAsks(s);
    fs.mkdirSync(path.join(asksDir(run.id), 'done'));
    await s.rested();
    await s.evicts('done/', () => fs.writeFileSync(path.join(asksDir(run.id), 'done', 'retry-work-9'), '{}\n'), run);
  });

  await t.test('REFUSED: a file in the asks that no reader reads: the stamp reads the asks, not only the record', async () => {
    const s = await small();
    await s.evicts(
      'an unread file in the asks',
      (run) => fs.writeFileSync(path.join(asksDir(run.id), 'later'), 'nothing any reader reads\n'),
      await withAsks(s),
    );
  });

  await t.test(
    "REFUSED: an event on a task's journal alone, what it cost, no file in the store moved: the pass reads the feed",
    async () => {
      const s = await small();
      await s.evicts('a journal line', (run) => Effect.runPromise(s.h.journal.append(`${run.id}-work`, measuredEvent({ costUsd: 0.25 }))));
    },
  );

  await t.test('a result branch moved, its tip written; one deleted, and a commit on the base branch, move nothing', async () => {
    const s = await small({ isolated: 2 });
    const run = s.aResting(true);
    const [branch, tip] = Object.entries(readRun(run.id).tips ?? {})[0] ?? [];
    assert.ok(branch && tip, 'the run has a tip on its record');
    let moved = tip;
    await s.evicts('a branch moved', () => (moved = world().branch(run.repo, branch, {})), run, 2, 0);
    assert.equal(readRun(run.id).tips![branch], moved, 'the tip the pass saw is on the record');

    const before = await s.rested();
    const lanes = Object.values(readRun(run.id).steps).flatMap((step) =>
      step.branch === branch && step.workspace ? [step.workspace] : [],
    );
    const dropped = stand().place.askNow('remove', { repo: run.repo, workspaces: lanes, branches: [branch] });
    assert.deepEqual('answer' in dropped && dropped.answer.deleted, [branch], 'the branch is deleted, its worktree removed first');
    assert.equal(await s.rested(), before, 'a branch git no longer has keeps the tip last seen: nothing to judge again');
    world().commit(run.repo, 'later on the base branch');
    assert.equal(await s.rested(), before, 'the base branch is none of the key');
    assert.equal(readRun(run.id).tips![branch], moved);
  });

  await t.test(
    'REFUSED: a repository whose standing is unread answers none of its runs with result branches from memory, and keeps their tips',
    async () => {
      const s = await small({ isolated: 2 });
      const run = s.aResting(true);
      const [branch, tip] = Object.entries(readRun(run.id).tips ?? {})[0] ?? [];
      assert.ok(branch && tip, 'the run has a tip on its record');
      const tippedThere = [...s.memo.runs.values()].filter((k) => k.run.repo === run.repo && k.tipped.length > 0).length;
      assert.ok(tippedThere > 1, 'runs of its repository rest on their tips');
      const before = await s.rested();
      const moved = world().branch(run.repo, branch, {});
      const unread = PlaceService.layer(
        placeOver(stand().place, {
          standing: (request) =>
            path.resolve(request.repo) === path.resolve(run.repo)
              ? unreadBy('standing', 'the standing broke')
              : stand().place.askNow('standing', request),
        }),
      );
      const pass = await runWith(s.h.e, tickRun({ repo: ROOT, memo: s.memo, verifyRest: true }).pipe(Effect.provide(unread)));
      assert.equal(pass.cost!.rested, before - tippedThere, 'every run of it whose tips the memo holds is judged in full, and no other');
      assert.equal(readRun(run.id).tips![branch], tip, 'and the tip the record holds is kept: the pass read no head');
      assert.equal(await s.rested(), before - 1, 'its standing read again, the run whose branch moved is judged afresh');
      assert.equal(readRun(run.id).tips![branch], moved, 'and its tip written');
      await s.rested();
      assert.equal(await s.rested(), before, 'and at rest again');
    },
  );

  await t.test('a run forgotten leaves the memo, and passes over runs at rest write nothing to the feed', async () => {
    const s = await small();
    const run = s.aResting();
    await s.rested();
    const size = fs.statSync(feedFile()).size;
    await s.rested();
    await s.rested();
    assert.equal(fs.statSync(feedFile()).size, size, 'nothing moved, nothing said');
    await runWith(s.h.e, forgetRun(run.id));
    await s.rested();
    assert.equal(s.memo.runs.has(run.id), false, 'gone from the memo with its record');
  });

  await t.test(
    'a feed that cannot be read empties the memo and costs the pass nothing: every run judged in full, the next pass reads on from its end',
    async () => {
      const s = await small();
      const before = await s.rested();
      assert.ok(before > 0 && s.memo.cursor !== undefined, 'the memo holds runs at rest, and where on the feed it read to');
      const unread = { ...s.h.e, feed: () => Effect.fail(new Error('the journal cannot be read') as never) };
      const pass = await runWith(unread, tickRun({ repo: ROOT, memo: s.memo, verifyRest: true }));
      assert.equal(pass.cost?.rested, 0, 'no run answered from memory');
      assert.deepEqual(
        pass.runs.map((a) => a.run.id),
        listRuns().map((r) => r.id),
        'every run judged, in the store order',
      );
      assert.deepEqual([s.memo.runs.size, s.memo.cursor], [0, undefined], 'the memo emptied, and its place on the feed forgotten');
      assert.equal(await s.rested(), 0, 'the next pass reads the feed from its end, and judges every run afresh');
      assert.notEqual(s.memo.cursor, undefined);
      assert.equal(await s.rested(), before, 'and the pass after answers from memory what it answered before');
    },
  );

  await t.test(
    "a run's stamp moves with any file named for it, a marker nobody has named yet included, and not with its own directory",
    async () => {
      const s = await small();
      const run = s.aResting();
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
    },
  );

  await t.test(
    'REFUSED: a memo that answers otherwise than a full pass, its inputs unchanged, throws under verifyRest, naming the run',
    async () => {
      const s = await small();
      const run = s.aResting();
      const kept = s.memo.runs.get(run.id)!;
      kept.advanced = { ...kept.advanced, status: 'failed' };
      await assert.rejects(s.verified(), (err: Error) => err.message.includes(run.id) && /a full pass answers otherwise/.test(err.message));
    },
  );

  await t.test(
    'REFUSED: a memo whose run reads otherwise than its record, its stamp unchanged, throws under verifyRest, naming the run',
    async () => {
      const s = await small();
      const run = s.aResting();
      const kept = s.memo.runs.get(run.id)!;
      kept.run = { ...kept.run, brief: 'not what the record says' };
      await assert.rejects(
        s.verified(),
        (err: Error) => err.message.includes(run.id) && /reads otherwise than the memo's run/.test(err.message),
      );
    },
  );

  await t.test(
    'REFUSED: a memo that holds a run a full pass finds not at rest throws under verifyRest, naming the clauses that hold it out',
    async () => {
      const s = await small({ inFlight: 1 });
      const id = s.inFlight[0].id;
      const { run: _, ...advanced } = await s.answered(id);
      const run = readRun(id);
      s.memo.runs.set(id, { stamp: restStamps().get(id)!, run, tipped: [], advanced });
      await assert.rejects(
        s.verified(),
        (err: Error) => err.message.includes(id) && /not at rest/.test(err.message) && /\(status, settled, inFlight\)/.test(err.message),
      );
    },
  );

  await t.test('the list: a run kept is answered from memory while its files, its record and the feed for its tasks stand', async () => {
    const l = listMemo();
    const run = l.stored('kept');
    const memo = await l.memoOf(run, 'done');
    l.line('other-work-1');
    assert.deepEqual((await l.read(memo)).kept(run), { said: 'done' }, 'a line of another run moves nothing of this one');
  });

  await t.test('REFUSED: the list: a line of its task on the feed takes the run out', async () => {
    const l = listMemo();
    const run = l.stored('fed');
    const memo = await l.memoOf(run, 'done');
    l.line('fed-work-1');
    assert.equal((await l.read(memo)).kept(run), undefined, 'its task appended');
    assert.equal(memo.runs.has('fed'), false);
  });

  await t.test('REFUSED: the list: a file beside its record takes the run out', async () => {
    const l = listMemo();
    const run = l.stored('written');
    const memo = await l.memoOf(run, 'done');
    fs.writeFileSync(path.join(runsDir(), 'written.cancelled'), '2026-10-04T11:00:00.000Z');
    assert.equal((await l.read(memo)).kept(run), undefined, 'a file beside its record');
  });

  await t.test('REFUSED: the list: a run read otherwise, or its record rewritten, is answered no more', async () => {
    const l = listMemo();
    const run = l.stored('read');
    const memo = await l.memoOf(run, 'done');
    assert.equal((await l.read(memo)).kept({ ...run, brief: 'Do it again.' }), undefined, 'a run that is not the one it kept');
    fs.writeFileSync(runFile('read'), JSON.stringify({ ...run, brief: 'Do it again.' }));
    const rewritten = await l.read(memo);
    assert.equal(rewritten.given('read'), undefined, 'its record rewritten: the store is handed nothing and reads it');
    assert.equal(rewritten.kept(run), undefined, 'and the run the memo kept is answered no more');
  });

  await t.test(
    'the list: a run at rest is handed to the store as the very run the memo kept, in place of a read of its record',
    async () => {
      const l = listMemo();
      const run = l.stored('handed');
      const read = await l.read(await l.memoOf(run, 'done'));
      assert.equal(read.given('handed'), run, 'the object kept, which `kept` then knows by identity');
      assert.deepEqual(read.kept(run), { said: 'done' });
      assert.equal(read.given('never-kept'), undefined, 'a run the memo holds nothing for');
    },
  );

  await t.test('REFUSED: the list: a verified read is handed nothing from memory, and answers no record that reads otherwise', async () => {
    const l = listMemo();
    const run = l.stored('afresh');
    const read = await l.read(await l.memoOf(run, 'done'), true);
    assert.equal(read.given('afresh'), undefined, 'the store reads every record afresh, so the fresh read can be compared');
    assert.deepEqual(read.kept({ ...run }), { said: 'done' }, 'the record read afresh reads as the run kept');
    assert.equal(read.kept({ ...run, brief: 'Do it again.' }), undefined, 'a record that reads otherwise');
  });

  await t.test(
    'REFUSED: the list: a read whose feed another read went past keeps nothing, and a feed that does not read empties the memo',
    async () => {
      const l = listMemo();
      const run = l.stored('raced');
      const memo = restingMemo<{ said: string }>();
      await l.read(memo);
      const slow = await l.read(memo);
      l.line('raced-work-1');
      await l.read(memo);
      slow.keep(run, { said: 'done' }, [], () => new Map());
      assert.equal(memo.runs.has('raced'), false, 'its answer may stand on a journal from before the line the other read');

      const kept = await l.memoOf(run, 'done');
      l.breakFeed(true);
      const unfed = await l.read(kept);
      assert.equal(kept.runs.size, 0, 'emptied');
      unfed.keep(run, { said: 'done' }, [], () => new Map());
      assert.equal(kept.runs.size, 0, 'nothing kept by a read made without the feed');
    },
  );

  await t.test(
    'REFUSED: the list: a verified read refuses a run judged afresh otherwise than the memo answered it (WF_VERIFY_REST)',
    async () => {
      const l = listMemo();
      const run = l.stored('verified');
      const read = await l.read(await l.memoOf(run, 'done'), true);
      assert.equal(read.verify, true);
      assert.deepEqual(read.kept(run), { said: 'done' });
      read.answered(run, { said: 'done' });
      assert.throws(
        () => read.answered(run, { said: 'blocked' }),
        (err: Error) => err.message.includes(`answered ${run.id} differently`) && /\(WF_VERIFY_REST\)/.test(err.message),
      );
      read.answered(l.stored('unkept'), { said: 'anything' });
    },
  );
});
