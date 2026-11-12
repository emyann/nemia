/**
 * The store paused, then paused at once, then resumed — a person's story on the stage (`story.ts`): `nemia pause --now` alone says what it
 * would stop and writes nothing; `nemia pause --yes` pauses as a plain pause does; a pass under it starts nothing — no step, try or check,
 * and no due schedule — while each working session stops at its current tool call's end, and `nemia watch --once`, `nemia start` and `nemia
 * up` say it; `nemia pause --now --yes` keeps the pause as it was put, its timeout cut to 0 so the sessions' drain cuts each session's
 * call, asks no session a try nor a stop, and asks each check at work but a landing's to stop, its ask on disk first, a step already asked
 * of left at work; and `nemia resume` lifts it and the drain, each session parked going on as the same try, the pass after running again
 * each check the pause stopped and starting the schedule's fire. The stand-in parks no session: its list says a session held at its hook
 * where the story parks it, as the runtime would under the drain.
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
 * instant written as a literal. The store is the file's own, at `ROOT`, given as `ENV`, and the run cap high, so the
 * schedule's fire is held by the pause alone.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import type { Run } from '../src/run.ts';
import type { RunTasks } from '../src/pause/pause.ts';
import { scratch } from 'test-kit/scratch';
import { TEAM } from './team.ts';
import { staged, story, type Board } from './story.ts';
import { names } from './assessed.ts';
import { approveRun, startRun, tickRun, runWith } from '../src/runner.ts';
import { addFactoryAt, attachWorkflowAt, setScheduleAt } from '../src/factory/factory.store.ts';
import { askFile, asksDir, listRuns, markCancelled, runRecord } from '../src/record/record.store.ts';
import { pauseFile, readPause } from '../src/pause/pause.store.ts';
import { nowRead } from '../src/pause/pause.verb.ts';
import { pausedRead } from '../src/list/list.verb.ts';
import { pauseSaid } from '../src/daemon/up.verb.ts';
import { currentTasks, pausedWords, RESUMED } from '../src/pause/pause.ts';
import { freshRestMemo } from '../src/tick/tick.verb.ts';
import { recordMemo } from '../src/rest/index.ts';
import { metered } from '../src/meter/tally.store.ts';
import { engineOf } from '../src/runtime-client.ts';
import { main } from '../src/cli/main.ts';
import { typed } from './typed.ts';
import { pauseNowPreview, pauseNowPreviewLines, startedLines } from '../src/runner.ts';
import type { Started } from '../src/start/commands.verb.ts';

/** What `nemia pause --now --yes` answers: whether the pause stood as it was, and the tasks it cut and left at work. */
type PausedNow = { kept: boolean; interrupted: { run: string; kind: string }[]; skipped: unknown[] };
import { COMMAND_WORDS } from 'objects';
import type { Place } from '../src/runner.ts';
import type { Engine } from '../src/cli/flags.ts';
import type { Env } from '../src/config/config.store.ts';

const ROOT = scratch('wf-pause-story-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
/** The file's store and settings; a test that times a cold read turns the full judgement of runs at rest off on it. */
const ENV: Record<string, string | undefined> = {
  ...process.env,
  WF_ROOT: ROOT,
  WF_VERIFY_REST: '1',
  WF_MAX_RUNS: '100',
  WF_DEFAULT_FACTORY_STARTS: '1',
  WF_MAX_CONCURRENT: undefined,
};
/**
 * A command line as a person types it: a verb the client holds (`objects`' `COMMAND_WORDS`) run on its entry's handler (`typed`), as the
 * api runs it; any other through this CLI's `main`.
 */
const typedOrMain = (argv: string[], e?: Engine, _demand?: unknown, place?: Place, env?: Env): Promise<unknown> =>
  COMMAND_WORDS.some((w) => w.name === argv[0]) ? typed(argv, e, undefined, place, env) : main(argv, e, undefined, place, env);
const stage = staged({ runWith, main: typedOrMain, engineOf, env: ENV });

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };
/** What the engine's own pass answers here: nothing admitted, nothing started, no view — every task is read off the stand-in. */
const QUIET = { tasks: 0, actions: [], running: {}, views: [] };
/** Monday 9 AM, Montreal: the weekly fire. */
const MONDAY = '2026-10-05T13:00:00.000Z';

const world = () => stage.place().world;
/**
 * The stage's engine with a pass of its own that does nothing, and no tally: what a whole-store pass asks of the engine first. Its list
 * says each task of `parked` held at its hook, as the runtime says a session the sessions' drain parked, which the stand-in does not.
 */
const ticking = (parked: ReadonlySet<string> = new Set()): Board => {
  const b = stage.board();
  const list = b.e.list;
  Object.assign(b.e, {
    tick: () => Effect.succeed(QUIET),
    tallied: undefined,
    list: (...args: Parameters<typeof list>) =>
      Effect.map(list(...args), (r) => ({
        ...r,
        views: r.views.map((v) => (parked.has(v.id) ? { ...v, heldBack: { since: new Date().toISOString() } } : v)),
      })),
  });
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
const asksOf = (id: string) => (fs.existsSync(asksDir(ROOT, id)) ? fs.readdirSync(asksDir(ROOT, id)).filter((f) => f !== 'done') : []);
const askOf = (id: string, step: string, n: number) => JSON.parse(fs.readFileSync(askFile(ROOT, id, step, n), 'utf8'));
/** The runs a schedule started: the fire each was started for. */
const scheduledDues = (): string[] => listRuns(ROOT).flatMap((r) => (r.scheduled ? [r.scheduled.due] : []));

test("the store paused, then paused at once, then resumed: nothing new starts, each session stops at its tool call's end, and what the pause stopped is tried again", async (t) => {
  const s = story(t);
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-04T12:00:00Z') });
  const parked = new Set<string>();
  const b = ticking(parked);
  const pass = () => stage.runWith(b.e, tickRun());
  const repo = aRepo();
  addFactoryAt(ROOT, { name: 'solo', repos: [repo] });
  attachWorkflowAt(ROOT, { factory: 'solo', workflow: 'dev' });
  setScheduleAt(ROOT, { factory: 'solo', workflow: 'dev', cron: '0 9 * * 1', tz: 'America/Montreal', brief: 'Read the stats' });
  const ONE = folder(['work']);
  const CHECKED = folder(['work'], () => 'check: "true"\n');
  const SHIP = folder(['work', 'ship'], (name) => (name === 'ship' ? 'gate: true\nworkspace: base\ncheck: "true"\n' : ''));
  const begun = (workflowDir: string, more: Partial<Parameters<typeof startRun>[0]> = {}) =>
    stage.runPlaced(startRun({ brief: 'paused', repo, workflowDir, isolate: false, ...more }));
  const runs: Record<'session' | 'checking' | 'asked' | 'ended' | 'landing' | 'called', Run> = {} as never;
  const task = (name: keyof typeof runs, step = 'work') => runRecord(ROOT, runs[name].id).steps[step].taskId!;
  const checkOf = (name: keyof typeof runs) => runRecord(ROOT, runs[name].id).steps.work.check!.taskId;
  const stops: { taskId: string; askOnDisk: boolean }[] = [];
  const stopping = {
    ...b.e,
    stop: (taskId: string) =>
      Effect.suspend(() => {
        const run = Object.values(runs).find((r) => JSON.stringify(runRecord(ROOT, r.id).steps).includes(`"${taskId}"`));
        stops.push({
          taskId,
          askOnDisk:
            run !== undefined && asksOf(run.id).some((f) => fs.readFileSync(path.join(asksDir(ROOT, run.id), f), 'utf8').includes(taskId)),
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
      assert.deepEqual([readPause(ROOT), listRuns(ROOT).flatMap(currentTasks)], [null, []], 'no run of the store has a task yet');
      const said = (await stage.main(['pause', '--now', '--yes', '--why', 'quiet', '--by', 'ann'], stopping)) as PausedNow;
      assert.deepEqual([said.kept, said.interrupted, said.skipped], [false, [], []], 'paused at once, nothing stopped');
      assert.deepEqual([readPause(ROOT)?.why, readPause(ROOT)?.by, readPause(ROOT)?.timeoutMs, stops], ['quiet', 'ann', 0, []]);
      assert.deepEqual(b.sessionDrains.at(-1), { graceMs: 0 }, "the sessions' drain put at no timeout: every call in flight is cut");
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
      markCancelled(ROOT, loose.id);
      await stage.main(['resume']);
      assert.equal(readPause(ROOT), null);
      assert.equal(b.sessionDrains.at(-1), null, "the sessions' drain lifted");
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
    fs.writeFileSync(path.join(runRecord(ROOT, runs.landing.id).steps.work.workspace!, 'work.txt'), 'work\n');
    b.settle(task('landing'), 'succeeded', SIGNED);
    await pass();
    b.settle(checkOf('checking'), 'working');
    await stage.runWith(b.e, approveRun(runs.landing.id, 'ship'));
    await pass();
    b.settle(task('landing', 'ship'), 'working');
    fs.mkdirSync(asksDir(ROOT, runs.asked.id), { recursive: true });
    fs.writeFileSync(
      askFile(ROOT, runs.asked.id, 'work', 2),
      JSON.stringify({ step: 'work', try: 2, mode: 'fresh', at: '2026-10-04T12:00:00Z' }),
    );
    markCancelled(ROOT, runs.called.id);
    assert.equal(readPause(ROOT), null);
  });
  await s.test(
    '`nemia pause --now` alone says what it would stop, at what cost, and the line that acts — and writes and stops nothing',
    async () => {
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
      const preview = pauseNowPreviewLines(await stage.runWith(stopping, pauseNowPreview()));
      assert.match(preview[0], /^nemia pause --now would pause the store and cut 4 at work/);
      assert.ok(preview.includes(`   ${runs.session.id}'s work: its session, its call cut, going on as the same try`), preview.join('\n'));
      assert.ok(preview.includes(`   ${runs.checking.id}'s work: its check, run again`), preview.join('\n'));
      assert.equal(preview.at(-1), 'nemia pause --now --yes does it.');
      assert.equal(fs.existsSync(pauseFile(ROOT)), false);
      assert.deepEqual([asksOf(runs.session.id), asksOf(runs.checking.id), stops], [[], [], []]);
    },
  );
  await s.test(
    "`nemia pause --yes` pauses as a plain pause does, stopping nothing and parking every session within the store's timeout; a plain pause again is refused, naming --now",
    async () => {
      await stage.main(['pause', '--yes', '--why', 'lunch', '--by', 'ann'], stopping);
      assert.deepEqual([readPause(ROOT)?.why, readPause(ROOT)?.by, readPause(ROOT)?.timeoutMs, stops], ['lunch', 'ann', 600_000, []]);
      assert.deepEqual(b.sessionDrains.at(-1), { graceMs: 600_000 }, "the sessions' drain put at the store's timeout, 10m by default");
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
      assert.deepEqual(paused.pause?.pause, readPause(ROOT), 'the pass says the pause it read');
      const standing = await stage.runWith(b.e, pausedRead());
      assert.match(
        pausedWords(standing) ?? '',
        /^Pausing: 5 sessions finishing a tool call, cut now/,
        "what still finishes: four sessions, the landing's and the session of a run called off, and a check; the clock is past the timeout, so their calls are being cut",
      );
      assert.deepEqual(b.sessionDrains.at(-1), { graceMs: 600_000 }, "the pass puts the sessions' drain again at the pause's timeout");
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
      const started = startedLines(
        (await stage.main(['start', 'a paused start', '--workflows', ONE, '--repo', free, '--no-worktree'])) as Started,
      );
      const at = started.indexOf("run 'nemia tick' (or 'nemia up') to start it");
      assert.ok(at > 0, started.join('\n'));
      assert.equal(started[at + 1], `${standing}: nothing of this run is filed until then`);
    },
  );
  await s.test(
    "`nemia pause --now --yes` keeps the pause as it was put, its timeout cut to 0, and asks each check at work to stop, its ask on disk first; a session is asked no try and no stop, the sessions' drain cutting its call",
    async () => {
      const pause = readPause(ROOT);
      const said = (await stage.main(['pause', '--now', '--yes', '--why', 'other'], stopping)) as PausedNow;
      assert.equal(said.kept, true, "the store's pause stands as it was put");
      assert.deepEqual(readPause(ROOT), { ...pause, timeoutMs: 0 }, 'the pause stands as it was, its timeout cut');
      assert.deepEqual(b.sessionDrains.at(-1), { graceMs: 0 }, "the sessions' drain put at no timeout");
      assert.ok(
        said.interrupted.some((i) => i.run === runs.session.id && i.kind === 'session'),
        JSON.stringify(said.interrupted),
      );
      assert.deepEqual(
        stops,
        [{ taskId: checkOf('checking'), askOnDisk: true }],
        'the check stopped only once its ask is on disk; no session, nor the landing, is ever stopped',
      );
      assert.deepEqual(raced, [], 'no stop the engine refused');
      assert.deepEqual(
        asksOf(runs.session.id),
        [],
        'a session is asked no try: it goes on as the same try, where it was once asked a continue',
      );
      assert.deepEqual(asksOf(runs.ended.id), [], 'nor is any other session');
      assert.equal(askOf(runs.checking.id, 'work', 2).mode, 'recheck', 'a check is run again');
      assert.equal(askOf(runs.asked.id, 'work', 2).mode, 'fresh', 'the try a person asked for stands');
      assert.deepEqual(
        asksOf(runs.landing.id).filter((f) => f.startsWith('retry-')),
        [],
        'a landing is asked no try',
      );
      assert.equal(fs.existsSync(asksDir(ROOT, runs.called.id)), false, 'a run called off is left alone');
      for (const name of ['session', 'ended', 'called'] as const) parked.add(task(name));
    },
  );
  await s.test(
    'the pause read names each session parked, finishing nothing, the check it stopped tried again on the resume, and one stopped by another hand promised nothing',
    async () => {
      await Effect.runPromise(b.e.stop(task('asked')));
      const read = await stage.runWith(b.e, pausedRead());
      const of = (name: keyof typeof runs, kind: 'session' | 'check' = 'session') =>
        read.finishing.find((f) => f.run === runs[name].id && (kind === 'check' ? f.kind === 'check' : f.kind !== 'check'));
      assert.equal(of('session'), undefined, 'a session parked finishes nothing');
      assert.deepEqual(
        read.parked.map((p) => p.run).sort(),
        [runs.session.id, runs.ended.id, runs.called.id].sort(),
        'each session parked is named parked',
      );
      assert.deepEqual(of('checking', 'check'), { run: runs.checking.id, step: 'work', kind: 'check', stopping: true, resumed: true });
      assert.deepEqual(of('asked'), { run: runs.asked.id, step: 'work', kind: 'session', stopping: true });
      assert.deepEqual(of('landing'), { run: runs.landing.id, step: 'ship', kind: 'session' }, "the landing's session finishes, unstopped");
    },
  );
  await s.test(
    'the check and the session asked of stopped and the landing ended, a pass under the pause files nothing — nor one a restarted daemon makes — and says Paused, the sessions parked',
    async (sub) => {
      for (const id of [checkOf('checking'), task('asked')]) b.settle(id, 'stopped');
      b.settle(task('landing', 'ship'), 'succeeded', SIGNED);
      await pass();
      await stage.runWith(b.e, tickRun({ memo: freshRestMemo() }));
      assert.deepEqual(b.filings, filings, 'nothing filed while paused, nor by a restarted daemon with no memo of runs at rest');
      assert.deepEqual(b.sessionDrains.at(-1), { graceMs: 0 }, "each pass puts the drain again at the pause's timeout, cut to 0");
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
      parked: [],
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
    "`nemia resume` lifts it and the sessions' drain: each session parked goes on as the same try, each check runs again, the due fire starts — and nothing says a pause",
    async (sub) => {
      const before = task('session');
      await stage.main(['resume']);
      assert.equal(b.sessionDrains.at(-1), null, "the sessions' drain lifted by the resume");
      parked.clear();
      await pass();
      const resumed = runRecord(ROOT, runs.session.id).steps.work;
      assert.deepEqual([resumed.taskId, resumed.tries], [before, undefined], 'the session goes on as the same try: none is filed');
      const checked = stops.find((x) => x.taskId.startsWith(`${runs.checking.id}-`))!.taskId;
      const rechecked = runRecord(ROOT, runs.checking.id).steps.work;
      assert.notEqual(rechecked.check?.taskId, checked, 'its check filed again');
      assert.deepEqual(rechecked.tries?.at(-1), { taskId: rechecked.taskId, check: { taskId: checked }, cause: 'recheck', paused: true });
      assert.equal(runRecord(ROOT, runs.ended.id).steps.work?.tries, undefined, 'no other session is tried either');
      assert.deepEqual(scheduledDues(), [MONDAY], 'the fire held by the pause starts on the pass after the resume');
      const feed = await printedBy(sub, () => stage.main(['watch', '--once']));
      assert.equal(
        feed.some((l) => l.startsWith('Paus')),
        false,
        feed.join('\n'),
      );
      const free = fs.mkdtempSync(path.join(ROOT, 'free-'));
      world().repository(free, {});
      const started = startedLines(
        (await stage.main(['start', 'a free start', '--workflows', ONE, '--repo', free, '--no-worktree'])) as Started,
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
  ENV.WF_VERIFY_REST = '0';
  t.after(() => {
    ENV.WF_VERIFY_REST = '1';
  });
  await stage.runWith(b.e, nowRead(memo));
  const records = (await metered(async () => await stage.runWith(b.e, nowRead(memo)))).tallies?.records;
  assert.equal(records, 1, "the one run whose task is at work, and no finished run's record");
  const warmed = await stage.runWith(b.e, nowRead(memo));
  assert.deepEqual(warmed, [{ run: 'r-live', step: 'implement', kind: 'session', taskId: 'live-1' }]);
  assert.deepEqual(warmed, await stage.runWith(b.e, nowRead()), "the warm answer is a cold read's own: nothing the board shows changes");
});
