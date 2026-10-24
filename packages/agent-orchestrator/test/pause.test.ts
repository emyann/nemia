/**
 * The store paused, then paused at once, then resumed — a person's story on the stage (`story.ts`): `nemia pause --now` alone says what
 * it would stop and writes nothing; `nemia pause --yes` pauses as a plain pause does; a pass under it starts nothing — no step, try or
 * check, and no due schedule — while what runs finishes, and `nemia watch --once`, `nemia start` and `nemia up` say it; `nemia pause
 * --now --yes` keeps the pause as it was put and asks each session and check at work but a landing to stop, its ask on disk first, a
 * step already asked of left at work, and one that ended before its stop let be; and `nemia resume` lifts it, the pass after trying
 * again each try the pause stopped — a nudge of its session, a recheck — and starting the schedule's fire.
 *
 * What the pause holds back and how each line says it is pure, in `src/pause/pause.test.ts`; the pause's file in
 * `src/pause/pause.store.test.ts`. The runtime's own admission under the pause — a task filed and not admitted while it stands — is
 * walked on the real runtime in `src/tick/pause.test.ts`, which the stand-in cannot model.
 *
 * The story opens on a store where no run has a task, which the pause read then reads no task of: it is the file's first test, and the
 * warm read after it takes its own records away as it ends, so the store is quiet there in whatever order the two run.
 *
 * The tick is the store's pass (`tickRun`), on the stage's engine given a pass of its own that does nothing and no tally, as
 * `queue-store.test.ts` gives it. A schedule's `now` is the wall's, so the story steers `Date` with node's mock timers, at the fire's
 * instant written as a literal. `WF_ROOT` is set before the import, since the module reads it as it loads, and the run cap high, so the
 * schedule's fire is held by the pause alone.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import type { Run } from '../src/run.ts';
import type { RunTasks } from '../src/pause/pause.ts';
import { scratch } from './scratch.ts';
import { TEAM } from './team.ts';
import { staged, story, type Board } from './story.ts';
import { names } from './assessed.ts';

const ROOT = scratch('wf-pause-story-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
process.env.WF_MAX_RUNS = '100';
process.env.WF_DEFAULT_FACTORY_STARTS = '1';
delete process.env.WF_MAX_CONCURRENT;
const { addFactory, approveRun, attachWorkflow, setSchedule, startRun, tickRun, runWith } = await import('../src/runner.ts');
const { askFile, asksDir, listRuns, markCancelled, readRun } = await import('../src/record/record.store.ts');
const { pauseFile, readPause } = await import('../src/pause/pause.store.ts');
const { nowRead } = await import('../src/pause/pause.verb.ts');
const { pausedRead } = await import('../src/list/list.verb.ts');
const { pauseSaid } = await import('../src/daemon/up.verb.ts');
const { currentTasks, pausedWords, RESUMED } = await import('../src/pause/pause.ts');
const { freshRestMemo } = await import('../src/tick/tick.verb.ts');
const { recordMemo } = await import('../src/rest/index.ts');
const { metered } = await import('../src/meter/tally.store.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const { main } = await import('../src/cli/main.ts');
const stage = staged({ runWith, main, engineOf });

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };
/** What the engine's own pass answers here: nothing admitted, nothing started, no view — every task is read off the stand-in. */
const QUIET = { tasks: 0, actions: [], running: {}, views: [] };
/** Monday 9 AM, Montreal: the weekly fire. */
const MONDAY = '2026-10-05T13:00:00.000Z';

const world = () => stage.place().world;
/** The stage's engine with a pass of its own that does nothing, and no tally: what a whole-store pass asks of the engine first. */
const ticking = (): Board => {
  const b = stage.board();
  Object.assign(b.e, { tick: () => Effect.succeed(QUIET), tallied: undefined });
  return b;
};
/** A repository with one commit, and the tests' team under `workflows/`. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  world().repository(repo, {});
  fs.cpSync(TEAM, path.join(repo, 'workflows'), { recursive: true });
  return repo;
};
/** A workflow folder of the steps given, each `after` the one before it, with the frontmatter lines `more` gives each. */
const folder = (steps: readonly string[], more: (name: string) => string = () => '') => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  steps.forEach((name, k) =>
    fs.writeFileSync(path.join(dir, `${name}.md`), `---\nplace: git\n${k ? `after: ${steps[k - 1]}\n` : ''}${more(name)}---\n${name} it\n`),
  );
  return dir;
};
/** What `run` printed on stdout, line by line. */
const printedBy = async (t: TestContext, run: () => unknown): Promise<string[]> => {
  const lines: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    lines.push(args.join(' '));
  });
  try {
    await run();
  } finally {
    log.mock.restore();
  }
  return lines.join('\n').split('\n');
};
/** The asks of `run` no pass has set aside. */
const asksOf = (id: string) => (fs.existsSync(asksDir(id)) ? fs.readdirSync(asksDir(id)).filter((f) => f !== 'done') : []);
const askOf = (id: string, step: string, n: number) => JSON.parse(fs.readFileSync(askFile(id, step, n), 'utf8'));
/** The runs a schedule started: the fire each was started for. */
const scheduledDues = (): string[] => listRuns().flatMap((r) => (r.scheduled ? [r.scheduled.due] : []));

test('the store paused, then paused at once, then resumed: nothing new starts, what runs finishes, and what the pause stopped is tried again', async (t) => {
  const s = story(t);
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-04T12:00:00Z') });
  const b = ticking();
  const pass = () => stage.runWith(b.e, tickRun());
  const repo = aRepo();
  addFactory({ name: 'solo', repos: [repo] });
  attachWorkflow({ factory: 'solo', workflow: 'dev' });
  setSchedule({ factory: 'solo', workflow: 'dev', cron: '0 9 * * 1', tz: 'America/Montreal', brief: 'Read the stats' });
  const ONE = folder(['work']);
  const CHECKED = folder(['work'], () => 'check: "true"\n');
  const SHIP = folder(['work', 'ship'], (name) => (name === 'ship' ? 'gate: true\nworkspace: main\ncheck: "true"\n' : ''));
  const begun = (workflowDir: string, more: Partial<Parameters<typeof startRun>[0]> = {}) =>
    stage.runPlaced(startRun({ brief: 'paused', repo, workflowDir, isolate: false, ...more }));
  const runs: Record<'session' | 'checking' | 'asked' | 'ended' | 'landing' | 'called', Run> = {} as never;
  const task = (name: keyof typeof runs, step = 'work') => readRun(runs[name].id).steps[step].taskId!;
  const checkOf = (name: keyof typeof runs) => readRun(runs[name].id).steps.work.check!.taskId;
  const stops: { taskId: string; askOnDisk: boolean }[] = [];
  const stopping = {
    ...b.e,
    stop: (taskId: string) =>
      Effect.suspend(() => {
        const run = Object.values(runs).find((r) => JSON.stringify(readRun(r.id).steps).includes(`"${taskId}"`));
        stops.push({
          taskId,
          askOnDisk:
            run !== undefined && asksOf(run.id).some((f) => fs.readFileSync(path.join(asksDir(run.id), f), 'utf8').includes(taskId)),
        });
        if (taskId !== task('ended')) return b.e.stop(taskId);
        return Effect.promise(async () => {
          const before = [...b.filings];
          const asked = Object.values(runs).map((r) => asksOf(r.id));
          await pass();
          raced.push({
            filed: b.filings.length - before.length,
            asksKept: Object.values(runs).every((r, k) => asked[k].every((f) => asksOf(r.id).includes(f))),
          });
          b.settle(taskId, 'succeeded', SIGNED);
        }).pipe(Effect.andThen(Effect.suspend(() => b.e.stop(taskId))));
      }),
  };
  const raced: { filed: number; asksKept: boolean }[] = [];
  let filings: string[] = [];

  await s.test(
    'a store with nothing at work: `nemia pause --now --yes` puts the pause, stopping nothing; a folder run started under it is filed nothing, and the pause reads Paused, nothing finishing',
    async (sub) => {
      assert.deepEqual([readPause(), listRuns().flatMap(currentTasks)], [null, []], 'no run of the store has a task yet');
      const said = await printedBy(sub, () => stage.main(['pause', '--now', '--yes', '--why', 'quiet', '--by', 'ann'], stopping));
      names(said[0], 'paused at once', 'by ann: quiet', 'nemia resume');
      names(said[1], 'nothing was stopped');
      assert.deepEqual([readPause()?.why, readPause()?.by, stops], ['quiet', 'ann', []]);
      const team = fs.mkdtempSync(path.join(ROOT, 'wf-'));
      fs.writeFileSync(path.join(team, 'work.md'), '---\nplace: folder\n---\nwork it\n');
      const loose = await begun(team, { isolate: true });
      assert.equal(loose.place?.kind, 'folder');
      filings = [...b.filings];
      await pass();
      assert.deepEqual(b.filings, filings, 'nothing of the folder run is filed under the pause');
      const standing = await stage.runWith(b.e, pausedRead());
      assert.deepEqual([standing.finishing, standing.staged, standing.held], [[], [], []], 'a folder run holds no merge staged');
      assert.match(pausedWords(standing) ?? '', /^Paused since /);
      const feed = await printedBy(sub, () => stage.main(['watch', '--once']));
      assert.equal(feed[0], pausedWords(standing), feed.join('\n'));
      markCancelled(loose.id);
      assert.deepEqual(await printedBy(sub, () => stage.main(['resume'])), [RESUMED]);
      assert.equal(readPause(), null);
    },
  );
  await s.test('a session, a check and a landing at work, a step a person already asked a try of, and one about to end', async () => {
    runs.session = await begun(ONE);
    runs.checking = await begun(CHECKED);
    runs.asked = await begun(ONE);
    runs.ended = await begun(ONE);
    runs.called = await begun(ONE);
    const lands = fs.mkdtempSync(path.join(ROOT, 'lands-'));
    world().repository(lands, {});
    runs.landing = await begun(SHIP, { repo: lands, isolate: true });
    await pass();
    for (const name of ['session', 'asked', 'ended', 'landing', 'called'] as const) b.settle(task(name), 'working');
    b.settle(task('checking'), 'succeeded', SIGNED);
    fs.writeFileSync(path.join(readRun(runs.landing.id).steps.work.workspace!, 'work.txt'), 'work\n');
    b.settle(task('landing'), 'succeeded', SIGNED);
    await pass();
    b.settle(checkOf('checking'), 'working');
    await stage.runWith(b.e, approveRun(runs.landing.id, 'ship'));
    await pass();
    b.settle(task('landing', 'ship'), 'working');
    fs.mkdirSync(asksDir(runs.asked.id), { recursive: true });
    fs.writeFileSync(
      askFile(runs.asked.id, 'work', 2),
      JSON.stringify({ step: 'work', try: 2, mode: 'fresh', at: '2026-10-04T12:00:00Z' }),
    );
    markCancelled(runs.called.id);
    assert.equal(readPause(), null);
  });
  await s.test(
    '`nemia pause --now` alone says what it would stop, at what cost, and the line that acts — and writes and stops nothing',
    async (sub) => {
      const read = await stage.runWith(b.e, nowRead());
      assert.deepEqual(
        read.map((i) => `${i.run} ${i.step} ${i.kind}`).sort(),
        [
          `${runs.session.id} work session`,
          `${runs.checking.id} work check`,
          `${runs.ended.id} work session`,
          `${runs.asked.id} work session`,
        ].sort(),
        'the landing is not among what it would stop, nor a run called off whose session still works',
      );
      const preview = await printedBy(sub, () => stage.main(['pause', '--now'], stopping));
      assert.match(preview[0], /^nemia pause --now would pause the store and stop 4 at work/);
      assert.ok(preview.includes(`   ${runs.session.id}'s work: its session`), preview.join('\n'));
      assert.ok(preview.includes(`   ${runs.checking.id}'s work: its check`), preview.join('\n'));
      assert.equal(preview.at(-1), 'nemia pause --now --yes does it.');
      assert.equal(fs.existsSync(pauseFile()), false);
      assert.deepEqual([asksOf(runs.session.id), asksOf(runs.checking.id), stops], [[], [], []]);
    },
  );
  await s.test(
    '`nemia pause --yes` pauses as a plain pause does, stopping nothing; a plain pause again is refused, naming --now',
    async (sub) => {
      await printedBy(sub, () => stage.main(['pause', '--yes', '--why', 'lunch', '--by', 'ann'], stopping));
      assert.deepEqual([readPause()?.why, readPause()?.by, stops], ['lunch', 'ann', []]);
      await assert.rejects(stage.main(['pause', '--why', 'other'], stopping), (err: Error & { exitCode?: number; _tag?: string }) => {
        assert.deepEqual([err._tag, err.exitCode], ['Conflict', 2], err.message);
        names(err.message, 'already paused', 'nemia resume', 'nemia pause --now');
        return true;
      });
    },
  );
  await s.test(
    'a pass under the pause files nothing new — no try asked, no check of a step signed off — and the due schedule starts nothing',
    async () => {
      t.mock.timers.setTime(Date.parse(MONDAY) + 30_000);
      b.settle(task('session'), 'working');
      filings = [...b.filings];
      const paused = await pass();
      assert.deepEqual([paused.scheduled, scheduledDues(), b.filings], [undefined, [], filings]);
      assert.deepEqual(paused.pause?.pause, readPause(), 'the pass says the pause it read');
      const standing = await stage.runWith(b.e, pausedRead());
      assert.match(
        pausedWords(standing) ?? '',
        /^Pausing: 6 finishing/,
        'what runs finishes: four sessions, a check, and the session of a run called off',
      );
    },
  );
  await s.test(
    '`nemia watch --once` opens with the pause as the pass reads it; `nemia start` says nothing of its run is filed until it resumes',
    async (sub) => {
      const feed = await printedBy(sub, () => stage.main(['watch', '--once']));
      const standing = pausedWords(await stage.runWith(b.e, pausedRead()));
      assert.equal(feed[0], standing, feed.join('\n'));
      const free = fs.mkdtempSync(path.join(ROOT, 'free-'));
      world().repository(free, {});
      const started = await printedBy(sub, () =>
        stage.main(['start', 'a paused start', '--workflows', ONE, '--repo', free, '--no-worktree']),
      );
      const at = started.indexOf("run 'nemia tick' (or 'nemia up') to start it");
      assert.ok(at > 0, started.join('\n'));
      assert.equal(started[at + 1], `${standing}: nothing of this run is filed until then`);
    },
  );
  await s.test(
    '`nemia pause --now --yes` keeps the pause as it was put, and asks each session and check at work to stop, its ask on disk first; a landing and a step asked of are left',
    async (sub) => {
      const pause = readPause();
      const said = await printedBy(sub, () => stage.main(['pause', '--now', '--yes', '--why', 'other'], stopping));
      names(said[0], "the store's pause stands as it was put", 'by ann: lunch', 'now what runs is asked to stop');
      assert.deepEqual(readPause(), pause, 'the pause stands as it was');
      assert.ok(
        said.some((l) => l.startsWith(`   ${runs.asked.id}'s work`) && l.includes('left at work')),
        said.join('\n'),
      );
      assert.deepEqual(
        [...stops].sort((a, z) => a.taskId.localeCompare(z.taskId)),
        [task('session'), checkOf('checking'), task('ended')].sort().map((taskId) => ({ taskId, askOnDisk: true })),
        'each stopped only once its ask is on disk; the landing and the step asked of are never stopped',
      );
      assert.deepEqual(raced, [{ filed: 0, asksKept: true }], 'a pass run while it still stops files nothing and sets no ask aside');
      assert.deepEqual(
        askOf(runs.session.id, 'work', 2),
        { step: 'work', try: 2, mode: 'nudge', interrupted: task('session'), at: new Date().toISOString() },
        'a session is nudged',
      );
      assert.equal(askOf(runs.checking.id, 'work', 2).mode, 'recheck', 'a check is run again');
      assert.equal(
        askOf(runs.ended.id, 'work', 2).interrupted,
        task('ended'),
        'a stop the engine refused leaves its ask, for the tick to set aside',
      );
      assert.equal(askOf(runs.asked.id, 'work', 2).mode, 'fresh', 'the try a person asked for stands');
      assert.deepEqual(
        asksOf(runs.landing.id).filter((f) => f.startsWith('retry-')),
        [],
        'a landing is asked no try',
      );
      assert.equal(fs.existsSync(asksDir(runs.called.id)), false, 'a run called off is left alone');
    },
  );
  await s.test(
    'the pause read says each task it stopped is tried again on the resume, and one stopped by another hand is not',
    async () => {
      await Effect.runPromise(b.e.stop(task('asked')));
      const finishing = (await stage.runWith(b.e, pausedRead())).finishing;
      const of = (name: keyof typeof runs) => finishing.find((f) => f.run === runs[name].id && f.kind !== 'check');
      assert.deepEqual(of('session'), { run: runs.session.id, step: 'work', kind: 'session', stopping: true, resumed: true });
      assert.deepEqual(of('asked'), { run: runs.asked.id, step: 'work', kind: 'session', stopping: true });
      assert.equal(of('ended'), undefined, 'one that ended first finishes nothing');
      assert.deepEqual(of('landing'), { run: runs.landing.id, step: 'ship', kind: 'session' }, "the landing's session finishes, unstopped");
    },
  );
  await s.test(
    'the sessions stopped and the landing ended, a pass under the pause files nothing — nor one a restarted daemon makes — and its ask of the run that ended first is set aside',
    async (sub) => {
      for (const id of [task('session'), checkOf('checking'), task('asked'), task('called')]) b.settle(id, 'stopped');
      b.settle(task('landing', 'ship'), 'succeeded', SIGNED);
      await pass();
      await stage.runWith(b.e, tickRun({ memo: freshRestMemo() }));
      assert.deepEqual(b.filings, filings, 'nothing filed while paused, nor by a restarted daemon with no memo of runs at rest');
      assert.deepEqual(asksOf(runs.ended.id), [], 'its ask set aside');
      assert.deepEqual(fs.readdirSync(path.join(asksDir(runs.ended.id), 'done')), ['retry-work-2']);
      const feed = await printedBy(sub, () => stage.main(['watch', '--once']));
      assert.match(feed[0], /^Paused since /, 'Paused, once nothing outside a landing held is at work');
    },
  );
  await s.test('`nemia up` says the pause once across passes, again each time its words change, and resumed once', () => {
    const pause = { at: '2026-10-04T12:00:00.000Z', by: 'ann', why: 'merging by hand' };
    const two = {
      pause,
      finishing: [
        { run: 'r-1', step: 'a', kind: 'session' as const },
        { run: 'r-2', step: 'b', kind: 'check' as const },
      ],
      staged: [],
      held: [],
    };
    const one = { ...two, finishing: two.finishing.slice(1) };
    const none = { ...two, finishing: [] };
    const held = { ...none, staged: [{ run: 'r-3', step: 'ship', repo: '/code/app' }] };
    const signed = { ...held, held: [{ run: 'r-4', step: 'land' }] };
    let said: string | undefined;
    const lines: string[] = [];
    for (const standing of [undefined, two, two, one, none, none, held, held, signed, signed, undefined, undefined]) {
      const now = pauseSaid(standing, said);
      lines.push(...now.lines);
      said = now.said;
    }
    assert.deepEqual(lines, [
      pausedWords(two),
      pausedWords(one),
      pausedWords(none),
      pausedWords(held),
      "   r-3's ship has its merge staged in /code/app (MERGE_HEAD), and its check waits on nemia resume",
      pausedWords(signed),
      "   r-3's ship has its merge staged in /code/app (MERGE_HEAD), and its check waits on nemia resume",
      "   r-4's land has signed off, and its check waits on nemia resume",
      RESUMED,
    ]);
  });
  await s.test(
    '`nemia resume` lifts it: the pass after continues each session the pause stopped, runs each check again, starts the due fire — and tries nothing of the run that ended first; nothing says a pause',
    async (sub) => {
      assert.deepEqual(await printedBy(sub, () => stage.main(['resume'])), [RESUMED]);
      await pass();
      const stopped = stops.find((x) => x.taskId.startsWith(`${runs.session.id}-`))!.taskId;
      const resumed = readRun(runs.session.id).steps.work;
      assert.notEqual(resumed.taskId, stopped, "the session's try 2 filed");
      assert.deepEqual(resumed.tries, [{ taskId: stopped, cause: 'nudge', paused: true }]);
      const stoppedAttempt = b.tasks.get(resumed.tries[0].taskId)!.attempt;
      assert.equal(b.tasks.get(resumed.taskId!)!.spec.resumeFrom, stoppedAttempt?.nativeId, 'continuing the session it stopped');
      const checked = stops.find((x) => x.taskId.startsWith(`${runs.checking.id}-`))!.taskId;
      const rechecked = readRun(runs.checking.id).steps.work;
      assert.notEqual(rechecked.check?.taskId, checked, 'its check filed again');
      assert.deepEqual(rechecked.tries?.at(-1), { taskId: rechecked.taskId, check: { taskId: checked }, cause: 'recheck', paused: true });
      assert.equal(readRun(runs.ended.id).steps.work?.tries, undefined, 'the run whose session ended first is not tried');
      assert.deepEqual(scheduledDues(), [MONDAY], 'the fire held by the pause starts on the pass after the resume');
      const feed = await printedBy(sub, () => stage.main(['watch', '--once']));
      assert.equal(
        feed.some((l) => l.startsWith('Paus')),
        false,
        feed.join('\n'),
      );
      const free = fs.mkdtempSync(path.join(ROOT, 'free-'));
      world().repository(free, {});
      const started = await printedBy(sub, () =>
        stage.main(['start', 'a free start', '--workflows', ONE, '--repo', free, '--no-worktree']),
      );
      assert.equal(
        started.some((l) => l.includes('nothing of this run is filed')),
        false,
        started.join('\n'),
      );
    },
  );
  await s.test('REFUSED: `nemia resume` with no pause standing, naming the verb that puts one', async () => {
    await assert.rejects(stage.main(['resume']), (err: Error & { exitCode?: number; _tag?: string }) => {
      assert.deepEqual([err._tag, err.exitCode], ['Missing', 2], err.message);
      names(err.message, 'not paused', 'nemia pause');
      return true;
    });
  });
});

test("a warm read of what a pause at once would stop reads the live runs' records alone, and answers a cold read's own", async (t) => {
  const b = stage.board();
  const write = (id: string, taskId: string) =>
    fs.writeFileSync(
      path.join(ROOT, 'runs', `${id}.json`),
      JSON.stringify({
        id,
        workspace: ROOT,
        brief: `The brief of ${id}`,
        createdAt: '2026-10-04T12:00:00.000Z',
        workflowDir: path.join(ROOT, 'no-such-workflow'),
        place: { kind: 'folder' },
        workflow: [{ name: 'implement', after: [], body: 'Implement it.' }],
        steps: { implement: { taskId } },
      }),
    );
  const ids = ['r-live', ...Array.from({ length: 200 }, (_, n) => `fin-${String(n).padStart(3, '0')}`)];
  t.after(() => {
    for (const id of ids) fs.rmSync(path.join(ROOT, 'runs', `${id}.json`), { force: true });
  });
  write('r-live', 'live-1');
  for (let n = 0; n < 200; n++) write(ids[n + 1], `fin-${n}`);
  await Effect.runPromise(b.e.file({ id: 'live-1', brief: 'b', cwd: ROOT }));
  b.settle('live-1', 'working');
  const memo = recordMemo<RunTasks>();
  process.env.WF_VERIFY_REST = '0';
  t.after(() => {
    process.env.WF_VERIFY_REST = '1';
  });
  await stage.runWith(b.e, nowRead(memo));
  const records = (await metered(async () => await stage.runWith(b.e, nowRead(memo)))).tallies?.records;
  assert.equal(records, 1, "the one run whose task is at work, and no finished run's record");
  const warmed = await stage.runWith(b.e, nowRead(memo));
  assert.deepEqual(warmed, [{ run: 'r-live', step: 'implement', kind: 'session', taskId: 'live-1' }]);
  assert.deepEqual(warmed, await stage.runWith(b.e, nowRead()), "the warm answer is a cold read's own: nothing the board shows changes");
});
