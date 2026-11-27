/**
 * A run that waits on a run (`nemia start --after`), as the board reads it: `after` as the record froze it, and `waiting` — the runs its
 * roots wait on, in the package's words — on the list, the detail and the decision, each held to what `nemia ls` and `nemia decide` say.
 * Off a real repository, though a wait reads none of it, in the harness's scratch store (`root`), the api and the
 * package's programs given this file's environment (`ENV`).
 *
 * The runs: `a-done`, the diamond's top, its step signed off and its result branch merged into main; `b-running`, started after it and
 * still working, its branch not merged; `c-cancelled`, called off before anything of it was filed; `x-failed`, whose one step failed.
 * Their children, none filed: `d-waits`, `e-cancelled-parent`, `f-no-such-parent`,
 * `g-parents-done`, `h-failed-parent`; and `i-started`, a child that started, whose parents are never read again. Their tasks' journals,
 * which the engine's views read, say `b-running` and `i-started` were filed an hour and more after they were created, as a run started
 * `--after` runs is once they land, and `a-done` and `x-failed` when they were created; the engine's feed holds none of it. A pass has
 * read where their branches stand (`passStanding`), which the list reads off `standing.json`.
 */
import { root } from './harness.ts';
import { describe, test } from 'vitest';
import { story } from 'test-kit/checkpoints';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { RunDecision } from 'objects';
import { appOf, liveOf } from '../src/app.ts';
import {
  decideRun,
  engine,
  list,
  passStanding,
  waitAdvice,
  waitWord,
  builtin,
  type EngineService,
  type PlaceService,
  runWith as runEngine,
  storeConfigLayer,
  type StoreConfig,
  type StoreRoot,
} from 'agent-orchestrator';
import { Effect } from 'effect';
import { listedRuns as runList, objectOf } from './run-reads.ts';
import type { Run } from 'objects';
import { plantRecord, runKey, runsNow, plantMarker } from 'agent-orchestrator/testing';

/** The environment this file's api and programs read: the harness's, at shipped defaults, with neither of the daemon's two ceilings set. */
const ENV: NodeJS.ProcessEnv = { ...process.env, WF_MAX_CONCURRENT: undefined, WF_MAX_RUNS: undefined };
const { app } = appOf(liveOf(ENV));
/** `program` run over the engine `e`, given the package's git place and the store and settings `ENV` names. */
const runWith = <A, E>(
  e: Parameters<typeof runEngine>[0],
  program: Effect.Effect<A, E, EngineService | PlaceService | StoreRoot | StoreConfig>,
) => runEngine(e, builtin(program.pipe(Effect.provide(storeConfigLayer(ENV)))));
const git = (...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args],
    { cwd: repo, encoding: 'utf8' },
  );
const repo = fs.mkdtempSync(path.join(root, 'repo-'));
git('init', '-q', '-b', 'main');
fs.writeFileSync(path.join(repo, 'README.md'), '# app\n');
git('add', '-A');
git('commit', '-q', '-m', 'base');
const base = git('rev-parse', 'HEAD').trim();

/** A result branch off main with a file of its own committed; merged back into main with `--no-ff` when `merge` says so. */
function branch(name: string, merge: boolean) {
  git('checkout', '-q', '-b', name);
  fs.writeFileSync(path.join(repo, `${name.replaceAll('/', '-')}.txt`), `${name}\n`);
  git('add', '-A');
  git('commit', '-q', '-m', `the work of ${name}`);
  git('checkout', '-q', 'main');
  if (merge) git('merge', '-q', '--no-ff', '-m', `Merge ${name}`, name);
}

const at = '2026-09-14T00:10:00.000Z';

/** A task's journal, as the engine writes it. */
const journal = (taskId: string, events: object[]) => {
  fs.mkdirSync(path.join(root, 'engine', 'tasks'), { recursive: true });
  fs.writeFileSync(path.join(root, 'engine', 'tasks', `${taskId}.jsonl`), events.map((e) => `${JSON.stringify(e)}\n`).join(''));
};
/** When `b-running`'s and `i-started`'s tasks were filed: an hour and more after their runs were created, once what they wait on
 * succeeded. */
const filedB = '2026-09-14T01:10:00.000Z';
const filedI = '2026-09-14T01:40:30.000Z';
const filed = (when = at) => ({ kind: 'filed', at: when, brief: 'Implement it.', cwd: repo, maxAttempts: 1, harness: 'codex' });
const signedOff = (taskId: string) =>
  journal(taskId, [
    filed(),
    { kind: 'starting', at, attempt: 1 },
    { kind: 'spawned', at, attempt: 1 },
    {
      kind: 'ended',
      at,
      attempt: 1,
      sessionId: `ae/${taskId}/1`,
      observed: 'done',
      reason: 'harness',
      closeout: { outcome: 'done', summary: 'Done.', needs: null, artifacts: [] },
    },
    { kind: 'settled', at, outcome: 'succeeded' },
  ]);
/** A task filed at `when`, `at` unless given, and at work since. */
const working = (taskId: string, when = at) =>
  journal(taskId, [filed(when), { kind: 'starting', at: when, attempt: 1 }, { kind: 'spawned', at: when, attempt: 1 }]);

/** One step, frozen on the record as `nemia start` freezes it: its branch is the run's result. */
const workflow = [{ name: 'implement', after: [], body: 'Implement it.', harness: 'codex' }];

/**
 * Writes run `id`'s record, one `implement` step frozen on it; `cancelledAt` marks it cancelled as `nemia cancel` does, in a file of its
 * own beside the record.
 */
function writeRun(id: string, fields: { after?: string[]; steps?: object; cancelledAt?: string } = {}) {
  const { cancelledAt, ...rest } = fields;
  fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
  plantRecord(
    root,
    runKey(id),
    JSON.stringify({
      id,
      repo,
      workspace: repo,
      baseRef: base,
      branch: 'main',
      isolate: true,
      brief: `Run ${id}`,
      createdAt: at,
      workflowDir: path.join(root, 'no-such-workflow'),
      workflow,
      steps: { implement: { taskId: null } },
      ...rest,
    }),
  );
  if (cancelledAt) plantMarker(root, id, 'cancelled', cancelledAt);
}

const cancelledAt = '2026-09-14T00:20:00.000Z';

branch('wf/a-done/implement', true);
signedOff('t-a');
writeRun('a-done', { steps: { implement: { taskId: 't-a', workspace: repo, branch: 'wf/a-done/implement' } } });
branch('wf/b-running/implement', false);
working('t-b', filedB);
writeRun('b-running', { after: ['a-done'], steps: { implement: { taskId: 't-b', workspace: repo, branch: 'wf/b-running/implement' } } });
writeRun('c-cancelled', { cancelledAt });
journal('t-x', [
  filed(),
  { kind: 'starting', at, attempt: 1 },
  { kind: 'spawned', at, attempt: 1 },
  { kind: 'ended', at, attempt: 1, sessionId: 'ae/t-x/1', observed: 'failed', reason: 'harness' },
  { kind: 'settled', at, outcome: 'failed' },
]);
writeRun('x-failed', { steps: { implement: { taskId: 't-x', workspace: repo, branch: 'wf/x-failed/implement' } } });

writeRun('d-waits', { after: ['a-done', 'b-running'] });
writeRun('e-cancelled-parent', { after: ['c-cancelled'] });
writeRun('f-no-such-parent', { after: ['no-such-run'] });
writeRun('g-parents-done', { after: ['a-done'] });
writeRun('h-failed-parent', { after: ['x-failed'] });
working('t-i', filedI);
writeRun('i-started', { after: ['b-running'], steps: { implement: { taskId: 't-i', workspace: repo, branch: 'wf/i-started/implement' } } });
await runWith(engine(ENV), passStanding(runsNow(root).runs.list()));

/** A run as the RunList (`GET /api/runs`) has it: its `status`, with the runs it froze to wait on and when it was made. */
type Listed = Run['status'] & { after: readonly string[]; createdAt: string };

/** Each run of the RunList, by name (`Listed`). */
const listedRuns = async () =>
  new Map(
    (await runList(app)).map((r) => [r.metadata.name, { ...r.status, after: r.spec.after, createdAt: r.metadata.creationTimestamp }]),
  );

/** The waits as the api gives them, back in the package's shape. */
const asWaits = (waiting: Listed['waiting']) =>
  (waiting?.runs ?? []).map((w) => ({
    run: w.run,
    ...(w.missing ? { missing: true as const } : {}),
    ...(w.cancelledAt ? { cancelledAt: w.cancelledAt } : {}),
    ...(w.failed ? { failed: true as const } : {}),
  }));

describe('a run waiting on runs, read on the list, its page and its decision as `nemia ls` and `nemia decide` say: what it waits on, whether it moves, when it started', () => {
  const s = story(test);
  s.test(
    "the list carries each run's `after` as the record froze it, and `waiting` in `nemia ls`'s words: a root says `waiting on <run>`, and a parent that never succeeds says why",
    async () => {
      const runs = await listedRuns();
      const d = runs.get('d-waits')!;
      assert.deepEqual(d.after, ['a-done', 'b-running']);
      assert.deepEqual(
        d.waiting,
        {
          runs: [{ run: 'b-running', missing: false, cancelledAt: null, failed: false }],
          word: 'waiting on b-running',
          advice: 'nothing of d-waits is filed until b-running has succeeded; nothing to decide yet',
          waitingOnYou: false,
        },
        'a-done has succeeded, so only b-running is waited on',
      );
      assert.deepEqual(
        d.steps.map((s) => [s.name, s.message]),
        [['implement', 'waiting on b-running']],
      );

      const e = runs.get('e-cancelled-parent')!;
      assert.deepEqual(e.waiting, {
        runs: [{ run: 'c-cancelled', missing: false, cancelledAt, failed: false }],
        word: 'waiting on c-cancelled (cancelled)',
        advice: `c-cancelled was cancelled at ${cancelledAt}, and a cancelled run never succeeds — yours to resolve: nemia release c-cancelled, or nemia cancel e-cancelled-parent, or start the work again without --after c-cancelled`,
        waitingOnYou: true,
      });
      assert.deepEqual(runs.get('f-no-such-parent')!.waiting?.runs, [
        { run: 'no-such-run', missing: true, cancelledAt: null, failed: false },
      ]);
      assert.equal(runs.get('f-no-such-parent')!.waiting?.word, 'waiting on no-such-run (no such run)');
      assert.deepEqual(runs.get('h-failed-parent')!.waiting?.runs, [{ run: 'x-failed', missing: false, cancelledAt: null, failed: true }]);
      assert.equal(runs.get('h-failed-parent')!.waiting?.word, 'waiting on x-failed (failed)');

      assert.deepEqual(
        [runs.get('g-parents-done')!.after, runs.get('g-parents-done')!.waiting],
        [['a-done'], null],
        'every parent landed: nothing to wait on, and the next tick files the roots',
      );
      assert.deepEqual(
        [runs.get('i-started')!.after, runs.get('i-started')!.waiting],
        [['b-running'], null],
        'started: its parents are not read, whatever they say',
      );
      assert.deepEqual([runs.get('a-done')!.after, runs.get('a-done')!.waiting], [[], null], 'started without --after');
    },
  );
  s.test("the list's words and waits are `list`'s, run by run — and `advice` is `waitAdvice` over them, `word` `waitWord`", async () => {
    const runs = await listedRuns();
    const e = engine(ENV);
    for (const id of [
      'd-waits',
      'e-cancelled-parent',
      'f-no-such-parent',
      'g-parents-done',
      'h-failed-parent',
      'i-started',
      'a-done',
      'b-running',
      'c-cancelled',
    ]) {
      const api = runs.get(id)!;
      const cli = await runWith(e, list(e, runsNow(root).runs.read(id)));
      assert.deepEqual(asWaits(api.waiting), cli.waiting, id);
      assert.deepEqual(
        api.steps.map((s) => s.message),
        cli.steps.map((s) => s.message),
        id,
      );
      if (cli.waiting.length) {
        assert.equal(api.waiting?.word, waitWord(cli.waiting), id);
        assert.equal(api.waiting?.advice, waitAdvice(runsNow(root).runs.read(id), cli.waiting), id);
        assert.equal(
          api.waiting?.waitingOnYou,
          !waitAdvice(runsNow(root).runs.read(id), cli.waiting).startsWith(`nothing of ${id} is filed until `),
          `${id}: on you exactly when waitAdvice does not say "nothing of <run> is filed until …", which it says while every run waited on may still succeed`,
        );
      }
    }
  });
  s.test(
    'a run waiting on runs moves — the tick files its roots once they succeed — unless one never will without a person, when it moves no more',
    async () => {
      const runs = await listedRuns();
      const moving = Object.fromEntries(
        ['d-waits', 'g-parents-done', 'e-cancelled-parent', 'f-no-such-parent', 'h-failed-parent'].map((id) => [id, runs.get(id)!.moving]),
      );
      assert.deepEqual(moving, {
        'd-waits': true,
        'g-parents-done': true,
        'e-cancelled-parent': false,
        'f-no-such-parent': false,
        'h-failed-parent': false,
      });
      for (const id of Object.keys(moving))
        assert.deepEqual(
          [runs.get(id)!.status, runs.get(id)!.waitingOnYou],
          ['running', []],
          `${id}: running, as assess, which knows no gate, puts a run nothing of which is final; nobody waited on, as no step is filed`,
        );
    },
  );
  s.test("a run's detail carries the same `after`, `waiting` and `moving`", async () => {
    const runs = await listedRuns();
    for (const id of ['d-waits', 'e-cancelled-parent', 'i-started']) {
      const run = await objectOf(app, id);
      const listed = runs.get(id)!;
      assert.deepEqual(
        { after: run.spec.after, waiting: run.status.waiting, moving: run.status.moving },
        { after: listed.after, waiting: listed.waiting, moving: listed.moving },
        id,
      );
      assert.deepEqual(
        run.status.steps.map((s) => s.message),
        listed.steps.map((s) => s.message),
        id,
      );
    }
  });
  s.test(
    "a run started when its first task was filed, as its task's view says, not when it was created — on the list and the detail alike; nothing filed, not started",
    async () => {
      const runs = await listedRuns();
      const started = (id: string) => [runs.get(id)!.createdAt, runs.get(id)!.startedAt];
      assert.deepEqual(started('b-running'), [at, filedB], 'waited on a-done for an hour: that hour is not time at work');
      assert.deepEqual(started('i-started'), [at, filedI]);
      assert.deepEqual(started('a-done'), [at, at], 'started, filed when it was created');
      for (const id of ['d-waits', 'e-cancelled-parent', 'g-parents-done', 'c-cancelled'])
        assert.equal(
          runs.get(id)!.startedAt,
          null,
          `${id}: waiting on runs that may still succeed or never will, or its parents succeeded and the tick yet to file it: not started`,
        );
      for (const id of ['b-running', 'i-started', 'a-done', 'd-waits']) {
        assert.equal((await objectOf(app, id)).status.startedAt, runs.get(id)!.startedAt, id);
      }
    },
  );
  s.test('the decision of a run waiting on runs is `waiting`, and nothing else: what `nemia decide` prints for it', async () => {
    const runs = await listedRuns();
    const e = engine(ENV);
    for (const id of ['d-waits', 'e-cancelled-parent', 'h-failed-parent']) {
      const res = await app.request(`/api/runs/${id}/decision`);
      assert.equal(res.status, 200);
      const body = (await res.json()) as RunDecision;
      assert.deepEqual(body, { waiting: runs.get(id)!.waiting }, id);
      assert.ok('waiting' in body, id);
      const { run, waiting } = await runWith(e, decideRun(id));
      assert.deepEqual(asWaits(body.waiting), waiting, id);
      assert.equal(body.waiting.word, waitWord(waiting), id);
      assert.equal(body.waiting.advice, waitAdvice(run, waiting), id);
    }
    assert.deepEqual(
      await (await app.request('/api/runs/g-parents-done/decision')).json(),
      { running: true },
      'every parent landed, and not yet filed: it runs, and there is nothing to decide yet',
    );
  });
});
