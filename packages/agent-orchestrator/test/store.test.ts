/**
 * The run store, where a person's cancellation meets the daemon's writes.
 *
 * Everything else about cancelling is a pure decision and lives in run.test.ts. This is the part
 * that is not pure and cannot be: two writers on one run, and a tick that takes seconds to make up
 * its mind. `nemia cancel` is meant to be typed while `nemia up` is running — that is the whole point of
 * the verb — so "what happens when they overlap" is a property worth pinning down.
 *
 * `WF_ROOT` is set before the runner is imported, since it is read as the module loads. `WF_VERIFY_REST=1` judges in full every run a
 * pass answers from its memo of runs at rest, and a difference throws (`verifyRest` in tick.verb.ts).
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { type TaskSpec, type TaskView, StopRefused, ForgetRefused } from 'agent-runtime';
import type { Engine } from '../src/runtime-client.ts';
import type { RepositoryRun, Run, TaskPhase } from '../src/run.ts';
import type { StepRecord } from '../src/run.ts';
import type { Effect as EffectOf } from 'effect/Effect';
import type { ForgetHow, Forgot } from '../src/forget/forget.ts';
import type { Refusal } from '../src/refusal/refusal.ts';
import type { EngineService } from '../src/runtime-client.ts';
import type { RetryHow } from '../src/retry/retry-ask.ts';
import type { Accepted, RoundAsked } from '../src/round/round.verb.ts';
import type { Asked } from '../src/retry/retry.verb.ts';
import type { Approved } from '../src/gate/gate.verb.ts';
import type { Told } from '../src/say/say.verb.ts';
import type { Cancelled } from '../src/cancel/cancel.verb.ts';
import type { CheckReport } from '../src/views/views.verb.ts';
import type { CheckRefusal } from '../src/check/check.ts';
import type { ParentRun } from '../src/wait/wait.ts';
import type { BranchReader } from '../src/branches/branches.store.ts';
import { verdictWord } from '../src/check/check.ts';
import { scratch } from './scratch.ts';
import { TEAM_DEV } from './team.ts';
import { isRepositoryRun, shownNote, shownStatus } from '../src/run.ts';
import { promised } from './promised.ts';
import { Effect } from 'effect';
import { eachTest, givenPlace, runGiven, runOver } from './placed.ts';
import { testPlace } from '../place/memory/index.ts';
import type { PlaceService } from '../src/place/place.store.ts';
import { placeOver, unreadBy } from './place-over.ts';
import type { StoreRoot } from '../src/config/root.store.ts';

const ROOT = scratch('wf-store-');
const WORKFLOW = path.join(ROOT, 'workflow');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
fs.mkdirSync(WORKFLOW, { recursive: true });
fs.writeFileSync(path.join(WORKFLOW, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
fs.writeFileSync(path.join(WORKFLOW, 'review.md'), '---\nafter: implement\nplace: git\n---\nreview it\n');

process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const {
  Conflict,
  acceptRun,
  advanceRun,
  approveRun,
  cancelRun,
  closeoutAsked,
  decideRun,
  exitVerdicts,
  forgetRun,
  forgetLine: forgetLineOf,
  list,
  Missing,
  parentRead,
  phaseOfView,
  retryRun,
  roundRun,
  sayRun,
  startRun,
  startPlan,
  stepsOf,
  runWith: runEngine,
  standingLiveOf,
} = await import('../src/runner.ts');
const stand = eachTest(testPlace);
const world = () => stand().world;
const runWith = runOver(runEngine, () => stand().layer);
const runPlaced = runGiven(() => stand().layer);
/** `program` given the place of the test running now, and still to be run. */
const placed = <A, E, R>(program: EffectOf<A, E, R>) => givenPlace(() => stand().layer)(program);
const { main: cli } = await import('../src/cli/main.ts');
/** `nemia`, as a person types it, over the test's place. */
const main = (argv: string[], e?: Engine) => cli(argv, e, undefined, stand().place);
/**
 * Refused by kind and exit 2, its message naming each of `named` — the command, flag or field its fix names, and the step, run or
 * amount it is about — never its sentence, which is nobody's to check.
 */
const refusedNaming =
  (tag: 'Missing' | 'Conflict' | 'Invalid', ...named: string[]) =>
  (err: Error & { exitCode?: number; _tag?: string }) => {
    assert.equal(err._tag, tag, err.message);
    assert.equal(err.exitCode, 2, err.message);
    for (const n of named) assert.ok(err.message.includes(n), `${n} is not named in: ${err.message}`);
    return true;
  };

/** The paths `checkout` holds uncommitted, a line each. */
const uncommitted = (checkout: string): string => world().changes(checkout).join('\n');

/** Every commit the commit `rev` names in `root` follows, itself first, a merge's first parent before its second. */
const commitsOf = (root: string, rev: string): string[] => {
  const seen: string[] = [];
  const next = [world().tip(root, rev) ?? rev];
  while (next.length) {
    const at = next.shift()!;
    if (seen.includes(at)) continue;
    seen.push(at);
    next.push(...world().read(root, at).parents);
  }
  return seen;
};

/** The first line of the message of each commit `rev` follows in `root`, itself first: the commit the checkout is at, given none. */
const subjects = (root: string, rev = world().head(root)): string[] =>
  commitsOf(root, rev).map((id) => world().read(root, id).message.split('\n')[0]);

/** How many commits `tip` holds in `root` that `base` does not. */
const ahead = (root: string, base: string, tip: string): number => {
  const below = commitsOf(root, base);
  return commitsOf(root, tip).filter((id) => !below.includes(id)).length;
};

/** `branch` merged into `repo`'s checkout and committed under `message`, as a person merges a result by hand. */
const mergedByHand = (repo: string, branch: string, message: string): void => {
  world().stage(repo, branch);
  world().commit(repo, message);
};

/** The workspace `wt` and the branch `branch` of `repo` taken away, as a person removes a worktree and deletes its branch. */
const droppedByHand = (repo: string, wt: string, branch: string): void => {
  const outcome = stand().place.askNow('remove', { repo, workspaces: [wt], branches: [branch] });
  assert.deepEqual('answer' in outcome && [outcome.answer.removed, outcome.answer.deleted], [[wt], [branch]]);
};
/** A run as one waiting on it reads it, where its branches stand asked now, as a person's verb asks them (`standingLiveOf`). */
const parentNow = (id: string) => standingLiveOf([id]).pipe(Effect.flatMap((git) => parentRead(id, git)));
const { listRuns, markCancelled, readAnswers, readAsks, readRun } = await import('../src/record/record.store.ts');
const { LINE_NAME } = await import('../src/run.ts');
const { passStanding } = await import('../src/standing/standing.verb.ts');
/** A pass's read of where every run's branches stand, written to `standing.json` as the tick writes it: what `nemia ls` reads. */
const aPass = (e: Engine) => runWith(e, passStanding(listRuns()));
const { PlaceService: PlaceTag } = await import('../src/place/place.store.ts');

/** A run record over `/repo`, without worktrees: a test of the record, not of git. */
const aRun = (id: string, steps: Run['steps']): Run => ({
  id,
  repo: '/repo',
  workspace: '/repo',
  baseRef: 'abc123',
  branch: 'main',
  isolate: false,
  brief: 'add a flag',
  workflowDir: WORKFLOW,
  steps,
  createdAt: '2026-01-01T00:00:00Z',
});

/** What the daemon does to the run's json, and the only thing it does to it. */
const writeRun = (run: Run) => fs.writeFileSync(path.join(ROOT, 'runs', `${run.id}.json`), JSON.stringify(run, null, 2));

/**
 * Just enough engine: what each task is doing, how it signed off if it did, and a `file` the test
 * can hold open mid-call. A filed task has the brief it was filed with; only one the engine never heard of has none.
 */
const engineWith = (phase: Record<string, TaskPhase>, hold?: Promise<void>, closeouts: Record<string, unknown> = {}) => {
  const stopped: string[] = [];
  const settled = new Set(['succeeded', 'failed', 'stopped']);
  const e = promised({
    view: async (id: string) => ({
      id,
      phase: phase[id] ?? 'unknown',
      sessionId: 's',
      state: {
        brief: 'filed',
        settled: settled.has(phase[id] ?? '') ? phase[id] : null,
        attempts: phase[id] === 'pending' ? [] : [{ n: 1, ended: null, nativeId: 's', closeout: closeouts[id] }],
        stopRequested: false,
      },
    }),
    file: async (spec: { id: string }) => {
      await hold;
      return spec.id;
    },
    stop: async (id: string) => {
      stopped.push(id);
    },
  });
  return { e, stopped };
};

/**
 * A step's record without what every filing writes of the revisions it took — the agent and skill pins (`pinned`) and the digest of the
 * closeout schema it was given (`closeoutHash`), whose subject is `revisions.test.ts`: what is left is what this file is about.
 */
const filedAs = (record: StepRecord | undefined): Partial<StepRecord> => {
  const { pinned: _, closeoutHash: __, ...rest } = record ?? { taskId: null };
  return rest;
};

test('a cancel that lands mid-tick survives the tick', async () => {
  const run = aRun('r-race', { implement: { taskId: 't1' }, review: { taskId: null } });
  writeRun(run);

  let release!: () => void;
  const { e } = engineWith(
    { t1: 'succeeded' },
    new Promise<void>((r) => {
      release = r;
    }),
  );

  const tickHeldInFile = runWith(e, advanceRun(readRun(run.id)));
  await new Promise((r) => setTimeout(r, 10));
  const { plan } = await runWith(e, cancelRun(run.id));
  assert.equal(plan.kind, 'cancel', 'a person cancels while the tick awaits `e.file`');
  release();
  await tickHeldInFile;

  const after = readRun(run.id);
  assert.ok(
    after.cancelledAt,
    'the cancellation is still there: the tick wrote back its copy from before it, and the mark is in its own file',
  );
  assert.equal(after.steps.review?.taskId, 'r-race-review', 'and so is the step the tick filed');
});

test('the next tick stops a step filed in the instant after the cancel, and files nothing more', async () => {
  const run = aRun('r-heal', { implement: { taskId: 't1' }, review: { taskId: 'r-heal-review' } });
  writeRun(run);
  markCancelled(run.id);

  const { e, stopped } = engineWith({ t1: 'succeeded', 'r-heal-review': 'running' });
  const pass = await runWith(e, advanceRun(readRun(run.id)));

  assert.deepEqual(
    stopped,
    ['r-heal-review'],
    '`nemia cancel` stops the steps it sees, and the tick enforces the mark on one filed after: nobody had to cancel a second time',
  );
  assert.deepEqual(pass.filed, []);
  assert.equal(pass.status, 'cancelled');
});

test('REFUSED by the engine: a stop of a task that settled, or was asked to stop, since `nemia cancel` or a pass read it is nothing left to do — the run is cancelled all the same, and every pass after it goes on', async () => {
  const run = aRun('r-late', { implement: { taskId: 't1' }, review: { taskId: null } });
  writeRun(run);
  const { e } = engineWith({ t1: 'running' });
  const asked: string[] = [];
  Object.assign(e, {
    stop: (id: string) => {
      asked.push(id);
      return Effect.fail(
        Object.assign(new Error(`stop: \`${id}\` has settled (succeeded): there is nothing left to stop.`), { exitCode: 2 }) as never,
      );
    },
  });

  const { plan } = await runWith(e, cancelRun(run.id));
  assert.equal(plan.kind, 'cancel');
  assert.ok(readRun(run.id).cancelledAt, 'the run is called off: what the stop was for is met');
  const pass = await runWith(e, advanceRun(readRun(run.id)));
  assert.equal(pass.status, 'cancelled', 'and the pass that asks again is refused, and goes on');
  assert.deepEqual(asked, ['t1', 't1']);
});

/** A repository with one commit, so `nemia start` has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  world().repository(repo, {});
  return repo;
};

/** An engine that has never heard of anything, and remembers every task it is asked to file. */
const recording = () => {
  const filed: Array<{ id: string; brief: string; harness?: string; cwd: string }> = [];
  const e = promised({
    view: async (id: string) => ({
      id,
      phase: 'unknown',
      sessionId: null,
      state: { brief: '', settled: null, attempts: [], stopRequested: false },
    }),
    file: async (spec: { id: string; brief: string; harness?: string; cwd: string }) => {
      filed.push(spec);
      return spec.id;
    },
    stop: async () => {},
  });
  return { e, filed };
};

test("REFUSED at shipped defaults: a run is never started under an id the store has — a record, the asks one left, or a run's directory", async (t) => {
  let draws = 0;
  t.mock.method(Math, 'random', () => (draws++ === 0 ? 0.5 : draws / 97));
  const first = await runPlaced(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: WORKFLOW, isolate: false }));
  draws = 0;
  const second = await runPlaced(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: WORKFLOW, isolate: false }));
  assert.notEqual(second.id, first.id, "the id drawn again: the first run's record has it");

  const runs = path.join(ROOT, 'runs');
  fs.rmSync(path.join(runs, `${first.id}.json`));
  fs.mkdirSync(path.join(runs, `${first.id}.asks`));
  draws = 0;
  const third = await runPlaced(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: WORKFLOW, isolate: false }));
  assert.notEqual(third.id, first.id, 'drawn again: the asks its record left have the id');

  fs.rmSync(path.join(runs, `${first.id}.asks`), { recursive: true });
  fs.mkdirSync(path.join(runs, first.id));
  draws = 0;
  const fourth = await runPlaced(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: WORKFLOW, isolate: false }));
  assert.notEqual(fourth.id, first.id, "drawn again: the run's own directory has the id");
  assert.deepEqual(
    [first, second, third, fourth].map((run) => run.id.replace(/-[^-]+$/, '')),
    ['add-a-flag', 'add-a-flag', 'add-a-flag', 'add-a-flag'],
    'each id is the brief, its tail drawn',
  );
});

test('a run that has filed keeps the workflow it froze — the folder edited after its first filing never reaches it', async () => {
  const folder = fs.mkdtempSync(path.join(ROOT, 'frozen-'));
  fs.writeFileSync(path.join(folder, 'implement.md'), '---\nplace: git\n---\nimplement it as asked\n');
  fs.writeFileSync(path.join(folder, 'review.md'), '---\nafter: implement\nplace: git\n---\nreview it\n');
  const run = await runPlaced(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: folder, isolate: false }));

  const { e, tasks, filings, settle } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  assert.deepEqual(filings, [`${run.id}-implement`], 'the first pass files the first step');

  fs.writeFileSync(path.join(folder, 'implement.md'), '---\nplace: git\n---\nsomething else entirely\n');
  fs.writeFileSync(path.join(folder, 'review.md'), '---\nafter: implement\nplace: git\n---\nsomething else entirely\n');

  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await runWith(e, advanceRun(readRun(run.id)));
  assert.deepEqual(filings, [`${run.id}-implement`, `${run.id}-review`], 'the step after it is filed from the freeze');
  assert.match(tasks.get(`${run.id}-review`)!.spec.brief, /review it/);
  assert.doesNotMatch(tasks.get(`${run.id}-review`)!.spec.brief, /something else/);
  assert.deepEqual(
    readRun(run.id).workflow?.map((s) => s.name),
    ['implement', 'review'],
    'the folder the run has filed from, rewritten since, never reaches it',
  );
});

/**
 * An engine board a test settles by hand. It keeps what each task was filed with — so a view carries
 * the closeout schema the run really asked for — and counts every filing. Each task's session is its
 * own (`native-<id>`), and a settled task carries the exit code it is given, as a detached one does.
 *
 * Beside the engine it hands back what a test sets or reads on it:
 * - `said`: what the engine journalled as said to each task (`say`), in order: its view's `state.said`.
 * - `deaf`: tasks whose session is not given the words: `say` rejects, with no exit code, and journals nothing.
 * - `waiting`: what the harness says each task's session waits for, as `claude agents` says it: the engine carries it onto the view
 *   (`TaskView.waitingFor`).
 * - `denials`: what the harness denied each task's last attempt, as the runtime records it on the attempt's end (`Attempt.denials`):
 *   once it has settled.
 * - `stated`: whether each task's last attempt gave the statement it was asked for, as the runtime reports it (`Attempt.stated`): once
 *   it has settled, its attempt ended `done` by its harness with the fact beside it. Absent, the attempt carries no such key, as an
 *   older journal's does.
 */
const board = () => {
  type Filed = TaskSpec & { id: string };
  const tasks = new Map<
    string,
    { spec: Filed; phase: TaskPhase; closeout?: unknown; exitCode?: number; reason?: string | string[]; usage?: object }
  >();
  const filings: string[] = [];
  const stopped: string[] = [];
  const logs = new Map<string, string>();
  const outputs = new Map<string, string>();
  const said = new Map<string, Array<{ at: string; attempt: number; text: string }>>();
  const deaf = new Set<string>();
  const waiting = new Map<string, string>();
  const denials = new Map<string, Array<{ tool: string; what?: string }>>();
  const stated = new Map<string, boolean>();
  const forgets: { taskIds: string[]; yes: boolean }[] = [];
  const endOf = (reason: string) =>
    reason === 'budget' ? { ended: 'failed', reason: 'harness', limit: 'budget' } : { ended: 'failed', reason };
  let clock = Date.parse('2026-09-14T16:00:00.000Z');
  const e = promised({
    view: async (id: string) => {
      const t = tasks.get(id);
      const settled = t && ['succeeded', 'failed', 'stopped'].includes(t.phase) ? t.phase : null;
      const reasons = Array.isArray(t?.reason) ? t.reason : [t?.reason];
      return {
        id,
        phase: t?.phase ?? 'pending',
        sessionId: t ? 's' : null,
        ...(waiting.get(id) ? { waitingFor: waiting.get(id) } : {}),
        state: {
          brief: t?.spec.brief ?? '',
          closeoutSchema: t?.spec.closeoutSchema,
          settled,
          stopRequested: false,
          said: said.get(id) ?? [],
          /**
           * An attempt given a reason ended `failed` with it, as the engine records a session that went quiet unsigned, or broke. What it
           * consumed is on it once it has settled, and not before: a `--bg` session writes its cost as its process exits. Given several
           * reasons, one attempt ended with each, in order, and the last carries what the task settled with. `budget` is no end the
           * runtime judges: its harness's cut is carried on a failed end as `limit`, as the runtime records it.
           */
          attempts:
            !t || t.phase === 'pending'
              ? []
              : reasons.map((reason, i) =>
                  i < reasons.length - 1
                    ? { n: i + 1, ...endOf(reason!), nativeId: `native-${id}`, exitCode: null, usage: null }
                    : {
                        n: i + 1,
                        nativeId: `native-${id}`,
                        closeout: t.closeout,
                        exitCode: t.exitCode ?? null,
                        usage: settled && t.usage ? t.usage : null,
                        ...(reason ? endOf(reason) : { ended: null }),
                        ...(settled && denials.get(id) ? { denials: denials.get(id) } : {}),
                        ...(settled && !reason && stated.has(id) ? { ended: 'done', reason: 'harness', stated: stated.get(id) } : {}),
                      },
                ),
        },
      };
    },
    file: async (spec: Filed) => {
      filings.push(spec.id);
      tasks.set(spec.id, { spec, phase: 'pending' });
      return spec.id;
    },
    stop: async (id: string) => {
      stopped.push(id);
    },
    logs: async (id: string) => logs.get(id) ?? '(no output yet)',
    /** A stream of a task's latest attempt the runtime kept, by `<id>.<stream>`: none where a test set none, as for a check run before. */
    output: async (id: string, stream: string) => outputs.get(`${id}.${stream}`),
    /**
     * The engine's `say`, as far as a run can tell it: refused in its words, exit code 2, for empty words, a task it has no record of, one
     * settled and one not started; rejected with no exit code for a session not given the words; otherwise journalled on the task, and
     * returned.
     */
    say: async (id: string, text: string) => {
      const refuse = (why: string) => Object.assign(new Error(`say: ${why}`), { exitCode: 2 });
      if (!text.trim()) throw refuse('`text` is empty. Give the words the session should hear.');
      const t = tasks.get(id);
      if (!t) throw refuse(`\`${id}\` is not a task on this board. \`ae ls\`, or \`list()\`, gives the ones it has.`);
      if (['succeeded', 'failed', 'stopped'].includes(t.phase))
        throw refuse(`\`${id}\` has settled (${t.phase}): no session of it is running to hear anything.`);
      if (t.phase === 'pending') throw refuse(`\`${id}\` has not started an attempt yet, so there is no session to hear anything.`);
      if (deaf.has(id)) throw new Error(`say: ae/${id}/1 was not given the words (connect ECONNREFUSED). Nothing was journalled.`);
      const entry = { at: new Date((clock += 60_000)).toISOString(), attempt: 1, text };
      said.set(id, [...(said.get(id) ?? []), entry]);
      return entry;
    },
    /**
     * The engine's `forget`, as far as a run can tell it: refused whole for a task not settled, naming it; otherwise each task taken off
     * the board with `yes`, its journal 1 KB and its 2 lines in the feed, and each call counted on `forgets`.
     */
    forget: async (ids: string[], options?: { yes?: boolean }) => {
      forgets.push({ taskIds: [...ids], yes: options?.yes === true });
      for (const id of ids)
        if (!['succeeded', 'failed', 'stopped'].includes(tasks.get(id)?.phase ?? 'pending'))
          throw new ForgetRefused({ taskId: id, message: `forget: \`${id}\` has not settled: stop it first.` });
      if (options?.yes) for (const id of ids) tasks.delete(id);
      return { forgotten: options?.yes === true, tasks: ids.map((taskId) => ({ taskId, journalBytes: 1024, feedLines: 2, sessions: [] })) };
    },
  });
  const settle = (id: string, phase: TaskPhase, closeout?: unknown, exitCode?: number, reason?: string | string[], usage?: object) =>
    Object.assign(tasks.get(id)!, { phase, closeout, exitCode, reason, usage });
  return { e, tasks, filings, stopped, forgets, settle, logs, outputs, said, deaf, waiting, denials, stated };
};

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };

/** What `nemia rm` says the board's `forget` did with a run's one task. */
const FORGOT_ONE = '; the engine forgot 1 task of it (1.0 KB of journal, 2 feed lines)';

/** A workflow folder: `implement`, with whatever frontmatter it is given, and `review` after it. */
const folder = (implementKeys = '') => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), `---\nplace: git\n${implementKeys ? `${implementKeys}\n` : ''}---\nimplement it\n`);
  fs.writeFileSync(path.join(dir, 'review.md'), '---\nafter: implement\nplace: git\n---\nreview it\n');
  return dir;
};

/** A run this file started on a repository: a repository run, whose repository and base branch are on its record. */
const repositoryRunOf = (run: Run): RepositoryRun => {
  assert.ok(isRepositoryRun(run), `${run.id} works on a repository`);
  return run;
};

/** `nemia start`, for real, over a fresh repository, the steps working in the checkout itself. */
const started = async (dir: string) =>
  repositoryRunOf(await runPlaced(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: dir, isolate: false })));

test('no `check:` → the run never files a check task, from the first pass to the last', async () => {
  const run = await started(folder());
  const { e, filings, settle } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-review`, 'succeeded', SIGNED);
  const last = await runWith(e, advanceRun(readRun(run.id)));

  assert.deepEqual(filings, [`${run.id}-implement`, `${run.id}-review`]);
  assert.equal(last.status, 'succeeded');
  assert.equal(readRun(run.id).steps.implement?.check, undefined);
});

test("the run files a signed step's check itself: the frozen command, in its workspace, on the check harness, once", async () => {
  const run = await started(folder('check: npm test && npm run typecheck'));
  const { e, tasks, filings, settle } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-implement`, 'succeeded', SIGNED);

  const pass = await runWith(e, advanceRun(readRun(run.id)));
  const id = `${run.id}-implement-check`;
  assert.deepEqual([pass.checked, pass.filed], [['implement'], []], 'the follower waits for the check, not for the agent');
  assert.deepEqual(
    filedAs(readRun(run.id).steps.implement),
    {
      taskId: `${run.id}-implement`,
      workspace: run.repo,
      branch: run.branch,
      check: { taskId: id },
      handedOff: `${run.id}-implement`,
    },
    "`taskId` is still the step's own task, which apps/api reads; it is handed off in the pass that filed its check, and what it left " +
      'is committed once for this try, never again (`handOffDue`)',
  );

  const spec = tasks.get(id)!.spec;
  assert.deepEqual(
    { harness: spec.harness, cwd: spec.cwd, deadlineSeconds: spec.deadlineSeconds, closeoutSchema: spec.closeoutSchema },
    { harness: 'check', cwd: run.repo, deadlineSeconds: 3300, closeoutSchema: undefined },
    "a step's check that does not land the run keeps a round's bound on a hang (`CHECK_DEADLINE_SECONDS`), not a landing's",
  );
  assert.equal('maxAttempts' in spec || 'resume' in spec, false, 'one attempt, as every task is: the runtime refuses a count or a policy');
  assert.equal(spec.brief, 'npm test && npm run typecheck', 'the brief is the check line, for a person reading the task');
  assert.deepEqual(
    spec.config,
    {
      command: ['sh', '-c', 'npm test && npm run typecheck'],
      env: {
        WF_RUN: run.id,
        WF_STEP: 'implement',
        WF_BASE_REF: run.baseRef,
        WF_WORKSPACE: run.repo,
        WF_ARTIFACTS: path.join(ROOT, 'runs', run.id, 'artifacts', 'implement'),
        WF_CLOSEOUT: path.join(ROOT, 'checks', `${id}.closeout.json`),
      },
      niceness: 10,
    },
    "filed as data on the runtime's command harness: `WF_ARTIFACTS` is the step's own files directory, where a check that takes screenshots puts them; `WF_CLOSEOUT` the step's closeout",
  );
  assert.ok(fs.existsSync(path.join(ROOT, 'checks')), 'the closeout file has somewhere to go');
  assert.ok(fs.statSync(path.join(ROOT, 'runs', run.id, 'artifacts', 'implement')).isDirectory(), 'and so do its files');

  await runWith(e, advanceRun(readRun(run.id)));
  assert.equal(filings.filter((f) => f === id).length, 1, 'filed once, however many passes');

  settle(id, 'succeeded');
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).filed, ['review'], 'exit 0, and the follower is filed');
});

test("a check is handed the step's closeout as a file, flat, a declared field at the top level beside the four", async () => {
  const dir = folder('output: implement.schema.json\ncheck: node check.ts');
  const DECLARED = {
    type: 'object',
    properties: { notes: { type: 'array', items: { type: 'string' } }, noNotes: { type: ['string', 'null'] } },
    required: ['notes', 'noNotes'],
    additionalProperties: false,
  };
  fs.writeFileSync(path.join(dir, 'implement.schema.json'), JSON.stringify(DECLARED));
  const run = await started(dir);
  const { e, tasks, settle } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-implement`, 'succeeded', { ...SIGNED, notes: [], noNotes: 'a doc only' });
  await runWith(e, advanceRun(readRun(run.id)));

  const id = `${run.id}-implement-check`;
  const file = tasks.get(id)!.spec.config?.env?.WF_CLOSEOUT ?? '';
  assert.equal(file, path.join(ROOT, 'checks', `${id}.closeout.json`));
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {
    outcome: 'done',
    summary: 'did it',
    artifacts: [],
    notes: [],
    noNotes: 'a doc only',
  });
});

test('a check that exits non-zero leaves the follower unfiled, pass after pass, and the run failed', async () => {
  const run = await started(folder('check: npm test'));
  const { e, filings, settle } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-implement-check`, 'failed');

  for (let i = 0; i < 3; i++) {
    const pass = await runWith(e, advanceRun(readRun(run.id)));
    assert.deepEqual([pass.filed, pass.checked, pass.blocked, pass.status], [[], [], ['review'], 'failed']);
  }
  assert.ok(!filings.includes(`${run.id}-review`));
});

test('a `check:` planted in the folder after the run has filed never reaches the check the run files', async () => {
  const dir = folder('check: npm test');
  const run = await started(dir);

  const { e, tasks, settle } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\ncheck: true\n---\nimplement it\n');
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await runWith(e, advanceRun(readRun(run.id)));
  const spec = tasks.get(`${run.id}-implement-check`)!.spec;
  assert.deepEqual(
    [spec.config?.command, spec.brief],
    [['sh', '-c', 'npm test'], 'npm test'],
    'the frozen command, not the one a step would like to be judged by',
  );
});

test('a pass that filed a check and died before writing the run down is adopted, never filed twice', async () => {
  const run = await started(folder('check: npm test'));
  const { e, filings, settle } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  const before = readRun(run.id);
  await runWith(e, advanceRun(readRun(run.id)));
  writeRun(before);

  const again = await runWith(e, advanceRun(readRun(run.id)));
  assert.equal(
    filings.filter((f) => f.endsWith('-check')).length,
    1,
    'the pass filed the check, and the record written back as it was before never says so',
  );
  assert.deepEqual(again.checked, [], 'adopted before the pass assessed anything, so there was nothing left to file');
  assert.deepEqual(readRun(run.id).steps.implement?.check, { taskId: `${run.id}-implement-check` });
});

test("a step named for another step's check is refused at `nemia start`, before anything is spent", async () => {
  const dir = folder('check: npm test');
  fs.writeFileSync(path.join(dir, 'implement-check.md'), '---\nplace: git\n---\na step of its own\n');
  await assert.rejects(
    async () => await runPlaced(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: dir })),
    (err: Error & { exitCode?: number }) =>
      err.exitCode === 2 && /implement-check/.test(err.message) && /Rename implement-check\.md/.test(err.message),
    'refused for its name, with worktrees: without them a second root is refused first, for running beside `implement`',
  );
});

test("REFUSED: a step named `run`, the name a run's own line of work is cut under, at `nemia start`, before anything is spent", async () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, `${LINE_NAME}.md`), '---\nplace: git\n---\nrun it\n');
  fs.writeFileSync(path.join(dir, 'review.md'), `---\nafter: ${LINE_NAME}\nplace: git\n---\nreview it\n`);
  await assert.rejects(
    async () => await runPlaced(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: dir })),
    (err: Error & { exitCode?: number }) =>
      err.exitCode === 2 &&
      /a step may not be named `run`/.test(err.message) &&
      /would claim one branch/.test(err.message) &&
      /Rename run\.md/.test(err.message),
    "its cut and the run's line would both ask the place for `wf/<id>/run`",
  );
});

test('`nemia ls` and `nemia decide` read a refused check from the streams the runtime kept of it', async () => {
  const run = await started(folder('check: npm test'));
  const { e, settle, outputs } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await runWith(e, advanceRun(readRun(run.id)));
  const id = `${run.id}-implement-check`;
  settle(id, 'failed', undefined, 1);
  outputs.set(`${id}.stdout`, 'not ok 3 - parses a trailing comma\n# fail 1\n');
  outputs.set(`${id}.stderr`, 'npm error Test failed.\n');

  const l = await runWith(e, list(e, readRun(run.id)));
  assert.deepEqual(
    l.steps.map((s) => s.status),
    ['failed ✗ check (exit 1)', 'waiting'],
  );
  assert.deepEqual(l.waitingOnYou, ['implement']);

  const { decision: d, checks } = await runWith(e, decideRun(run.id));
  assert.deepEqual(d.kind === 'awaiting' && [d.outcome, d.failedCheck], ['failed', ['implement']]);
  assert.deepEqual(checks.implement, {
    command: 'npm test',
    passed: false,
    verdict: 1,
    stdout: 'not ok 3 - parses a trailing comma\n# fail 1',
    stderr: 'npm error Test failed.',
  });
});

test('a check filed by a pass that died, on a run then cancelled, is found and stopped — by the verb, and by every pass', async () => {
  const run = await started(folder('check: npm test'));
  const { e, filings, stopped, settle } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  const before = readRun(run.id);
  await runWith(e, advanceRun(readRun(run.id)));
  writeRun(before);
  const id = `${run.id}-implement-check`;
  settle(id, 'running');

  const { plan } = await runWith(e, cancelRun(run.id));
  assert.deepEqual(
    plan,
    { kind: 'cancel', stop: [{ name: 'implement (check)', taskId: id }] },
    'the verb finds the check a pass filed, on a record written back without it',
  );
  assert.equal(readRun(run.id).steps.implement?.check, undefined, 'and does not write the run to do so');

  await runWith(e, advanceRun(readRun(run.id)));
  assert.deepEqual(stopped, [id, id], 'a cancelled run files no check, and still finds the one it filed');
  assert.deepEqual(readRun(run.id).steps.implement?.check, { taskId: id }, 'the tick puts it on the record');
  assert.equal(filings.filter((f) => f === id).length, 1);
});

/** A strict `findings` schema, as the tests' team's `test/fixtures/team/agents/review.schema.json` has it. */
const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: { file: { type: 'string' }, line: { type: ['integer', 'null'] }, what: { type: 'string' } },
        required: ['file', 'line', 'what'],
        additionalProperties: false,
      },
    },
  },
  required: ['findings'],
  additionalProperties: false,
};
const FOUND = [{ file: 'src/flag.ts', line: 12, what: 'the flag is read before it is parsed' }];

/** `nemia start` over `implement` (with `keys`) → `review`, run until implement's check settles `phase`, with the exit code given. */
const throughCheck = async (keys: string, phase: TaskPhase, exitCode?: number) => {
  const run = await started(folder(keys));
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(run.id)));
  b.settle(`${run.id}-implement-check`, phase, undefined, exitCode);
  return { run, ...b };
};

const asksDir = (id: string) => path.join(ROOT, 'runs', `${id}.asks`);
/** The asks waiting in a run's directory, by name. */
const asksOf = (id: string) => (fs.existsSync(asksDir(id)) ? fs.readdirSync(asksDir(id)).filter((f) => f.startsWith('retry-')) : []);
const refusedWith = (pattern: RegExp) => (err: Error & { exitCode?: number }) => err.exitCode === 2 && pattern.test(err.message);
/** A refusal, exit 2, whose whole sentence is `message`, or matches `pattern`. */
const refusedAs = (said: RegExp | string) => (err: Error & { exitCode?: number }) =>
  typeof said === 'string' ? err.exitCode === 2 && err.message === said : refusedWith(said)(err);
/**
 * What a verb refused with, once it has said it was a refusal — for a message to read more than one thing in, and to read something
 * out of.
 */
const refusal = async (p: Promise<unknown>): Promise<string> => {
  const err = await p.then(
    () => undefined,
    (e: Error & { exitCode?: number }) => e,
  );
  assert.ok(err?.exitCode === 2, `expected a refusal, got ${err ? err.message : 'no error'}`);
  return err.message;
};

test('`retries: 1` re-files a step its check refused, once, continuing its session and told what the check said — and past it, files nothing', async () => {
  const { run, e, tasks, filings, settle, outputs } = await throughCheck('check: npm test && npm run typecheck\nretries: 1', 'failed', 1);
  const check1 = `${run.id}-implement-check`;
  outputs.set(`${check1}.stdout`, 'ok 1 - builds\nnot ok 2 - parses a trailing comma\n# fail 1\n');
  outputs.set(`${check1}.stderr`, 'npm error Test failed.\n');

  const pass = await runWith(e, advanceRun(readRun(run.id)));
  const try2 = `${run.id}-implement-try2`;
  assert.deepEqual([pass.tried, pass.filed, pass.blocked, pass.status], [['implement'], [], [], 'running']);
  const spec = tasks.get(try2)!.spec;
  assert.deepEqual(
    { cwd: spec.cwd, resumeFrom: spec.resumeFrom, harness: spec.harness },
    { cwd: run.repo, resumeFrom: `native-${run.id}-implement`, harness: undefined },
  );
  assert.deepEqual(filedAs(readRun(run.id).steps.implement), {
    taskId: try2,
    workspace: run.repo,
    branch: run.branch,
    tries: [{ taskId: `${run.id}-implement`, check: { taskId: check1 }, then: 'retries' }],
  });
  assert.match(spec.brief, /^## Try 2\n/);
  assert.deepEqual(
    JSON.parse(/\n```json\n([\s\S]*?)\n```/.exec(spec.brief)![1]),
    {
      command: 'npm test && npm run typecheck',
      exit: 1,
      stdout: 'ok 1 - builds\nnot ok 2 - parses a trailing comma\n# fail 1',
      stderr: 'npm error Test failed.',
    },
    'try 2 is told the command, the exit and both tails',
  );
  assert.match(spec.brief, /Do not weaken the check to pass it/, 'and not to weaken the check');

  await runWith(e, advanceRun(readRun(run.id)));
  assert.equal(filings.filter((f) => f === try2).length, 1, 'filed once, however many passes');

  settle(try2, 'succeeded', SIGNED);
  assert.deepEqual(
    (await runWith(e, advanceRun(readRun(run.id)))).checked,
    ['implement'],
    'try 2 signs off, and is checked under an id of its own',
  );
  const check2 = `${run.id}-implement-try2-check`;
  settle(check2, 'failed', undefined, 1);
  for (let i = 0; i < 3; i++) {
    const after = await runWith(e, advanceRun(readRun(run.id)));
    assert.deepEqual(
      [after.tried, after.filed, after.checked, after.blocked, after.status],
      [[], [], [], ['review'], 'failed'],
      `pass ${i + 1}: the check of try 2 refused it too`,
    );
  }
  assert.deepEqual(filings, [`${run.id}-implement`, check1, try2, check2], 'past `retries: 1`, nothing more');
  const l = await runWith(e, list(e, readRun(run.id)));
  assert.deepEqual([l.waitingOnYou, l.steps[0].note], [['implement'], 'try 2, by retries: 1']);
});

test('`nemia retry --model haiku` on a Claude Code step in `auto` is refused and writes no ask — named or by default; another mode, a model that keeps it, or codex, is asked (F21)', async () => {
  const { run, e } = await throughCheck('check: npm test', 'failed', 1);
  for (const model of ['haiku', 'claude-haiku-4-5-20251001', 'claude-sonnet-4-5']) {
    const said = await refusal(runWith(e, retryRun(run.id, 'implement', { mode: 'fresh', model })));
    assert.ok(
      said.startsWith(
        `\`--model ${model}\`: implement names no \`permissionMode:\`, so it is filed in \`auto\`, the runtime's default, and Claude Code drops \`auto\``,
      ),
      `at shipped defaults a step that names no mode is filed in \`auto\`, and Claude Code runs haiku in \`default\` there: ${said}`,
    );
    assert.match(said, /a job denies every call `default` would ask about/);
    assert.doesNotMatch(said, /F21|measured/, "a finding's number and a version are nothing a person can act on");
    assert.match(said, new RegExp(`nemia retry ${run.id} implement --model sonnet`));
  }
  assert.deepEqual(asksOf(run.id), [], 'nothing written');

  const named = await throughCheck('check: npm test\npermissionMode: auto', 'failed', 1);
  assert.match(
    await refusal(runWith(named.e, retryRun(named.run.id, 'implement', { mode: 'fresh', model: 'haiku' }))),
    /^`--model haiku`: implement says `permissionMode: auto`/,
  );
  assert.deepEqual(asksOf(named.run.id), []);

  assert.equal(
    (await runWith(e, retryRun(run.id, 'implement', { mode: 'fresh', model: 'sonnet' }))).ask.model,
    'sonnet',
    'what keeps what the step asked for is asked, and written',
  );
  const fenced = await throughCheck('check: npm test\npermissionMode: dontAsk', 'failed', 1);
  assert.equal((await runWith(fenced.e, retryRun(fenced.run.id, 'implement', { mode: 'fresh', model: 'haiku' }))).ask.model, 'haiku');
  const codex = await throughCheck('check: npm test\nharness: codex', 'failed', 1);
  assert.equal((await runWith(codex.e, retryRun(codex.run.id, 'implement', { mode: 'fresh', model: 'haiku' }))).ask.model, 'haiku');
});

test("`nemia retry` writes a person's ask, and the tick honours it once: a second pass files nothing, and the ask is consumed whole, never edited", async () => {
  const { run, e, tasks, filings } = await throughCheck('check: npm test', 'failed', 1);
  const { ask, file } = await runWith(e, retryRun(run.id, 'implement', { mode: 'fresh', model: 'opus' }));
  assert.equal(file, path.join(asksDir(run.id), 'retry-implement-2'));
  const written = fs.readFileSync(file, 'utf8');
  assert.deepEqual(JSON.parse(written), ask);
  assert.equal(readRun(run.id).steps.implement?.tries, undefined, 'the verb writes no record');
  assert.match((await runWith(e, list(e, readRun(run.id)))).steps[0].note ?? '', /^try 2 asked \(--model opus\)/);

  const first = await runWith(e, advanceRun(readRun(run.id)));
  const try2 = `${run.id}-implement-try2`;
  assert.deepEqual(first.tried, ['implement']);
  const spec = tasks.get(try2)!.spec;
  assert.deepEqual(
    { model: spec.config?.model, resumeFrom: spec.resumeFrom },
    { model: 'opus', resumeFrom: undefined },
    'a new session, on the model asked for',
  );
  assert.match(spec.brief, /## What was asked for\n\nadd a flag/, 'told everything a step starting cold is');
  assert.deepEqual(asksOf(run.id), [], 'consumed');
  assert.equal(fs.readFileSync(path.join(asksDir(run.id), 'done', 'retry-implement-2'), 'utf8'), written, 'moved whole');

  const second = await runWith(e, advanceRun(readRun(run.id)));
  assert.deepEqual([second.tried, second.filed, second.checked], [[], [], []]);

  fs.copyFileSync(path.join(asksDir(run.id), 'done', 'retry-implement-2'), file);
  const third = await runWith(e, advanceRun(readRun(run.id)));
  assert.deepEqual(
    [third.tried, asksOf(run.id)],
    [[], []],
    'a pass that filed the try, wrote the record and died before consuming the ask: the ask is spent, and files nothing',
  );
  assert.equal(filings.filter((f) => f === try2).length, 1);
  assert.deepEqual(
    readRun(run.id).steps.implement?.tries?.map((t) => [t.then, t.model]),
    [['fresh', 'opus']],
  );
});

test('a check that ended stopped spends no retry: the step waits on you, `nemia decide` says its check did not finish and offers --recheck — which files a check, and no step', async () => {
  const { run, e, tasks, filings, settle } = await throughCheck('check: npm test\nretries: 2', 'stopped');
  const check1 = `${run.id}-implement-check`;
  for (let i = 0; i < 2; i++) {
    const pass = await runWith(e, advanceRun(readRun(run.id)));
    assert.deepEqual([pass.tried, pass.filed, pass.blocked, pass.status], [[], [], ['review'], 'failed']);
  }
  assert.equal(readRun(run.id).steps.implement?.tries, undefined, 'no try spent');
  assert.deepEqual((await runWith(e, list(e, readRun(run.id)))).waitingOnYou, ['implement']);
  const { decision: d, offers } = await runWith(e, decideRun(run.id));
  assert.deepEqual(d.kind === 'awaiting' && [d.failedCheck, d.unfinishedCheck], [[], ['implement']]);
  assert.deepEqual(offers, [
    `implement: its check did not finish, so no retry was spent on it. Run the check again, and nothing else:  nemia retry ${run.id} implement --recheck`,
  ]);

  await runWith(e, retryRun(run.id, 'implement', { mode: 'recheck' }));
  const pass = await runWith(e, advanceRun(readRun(run.id)));
  const check2 = `${run.id}-implement-try2-check`;
  assert.deepEqual([pass.tried, pass.checked, pass.filed], [['implement'], ['implement'], []]);
  assert.deepEqual(filings, [`${run.id}-implement`, check1, check2], 'a check, and no step');
  assert.equal(tasks.get(check2)!.spec.harness, 'check');
  assert.deepEqual(filedAs(readRun(run.id).steps.implement), {
    taskId: `${run.id}-implement`,
    workspace: run.repo,
    branch: run.branch,
    check: { taskId: check2 },
    tries: [{ taskId: `${run.id}-implement`, check: { taskId: check1 }, then: 'recheck' }],
  });

  settle(check2, 'succeeded', undefined, 0);
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).filed, ['review'], 'the work passed as it stood');
});

test('`nemia retry` refuses a running step, a cancelled run, a second ask for the same try, and a step the run retries itself — exit 2, and no ask written', async () => {
  const running = await started(folder('check: npm test'));
  const b = board();
  await runWith(b.e, advanceRun(readRun(running.id)));
  b.settle(`${running.id}-implement`, 'running');
  await assert.rejects(runWith(b.e, retryRun(running.id, 'implement', { mode: 'nudge' })), refusedWith(/^implement is still running/));
  assert.deepEqual(asksOf(running.id), []);

  const twice = await throughCheck('check: npm test', 'failed', 1);
  await runWith(twice.e, retryRun(twice.run.id, 'implement', { mode: 'nudge' }));
  await assert.rejects(
    runWith(twice.e, retryRun(twice.run.id, 'implement', { mode: 'recheck' })),
    refusedWith(/^try 2 of implement is already asked for \(--nudge/),
  );
  assert.deepEqual(asksOf(twice.run.id), ['retry-implement-2']);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(asksDir(twice.run.id), 'retry-implement-2'), 'utf8')).mode,
    'nudge',
    'the first ask stands',
  );

  const called = await throughCheck('check: npm test', 'failed', 1);
  markCancelled(called.run.id);
  await assert.rejects(
    runWith(called.e, retryRun(called.run.id, 'implement', { mode: 'nudge' })),
    refusedWith(/was cancelled at .*never be honoured/),
  );
  assert.deepEqual(asksOf(called.run.id), []);

  const itself = await throughCheck('check: npm test\nretries: 1', 'failed', 1);
  await assert.rejects(
    runWith(itself.e, retryRun(itself.run.id, 'implement', { mode: 'nudge' })),
    refusedWith(/^the run tries implement again itself/),
  );
  assert.deepEqual(asksOf(itself.run.id), []);
});

test('a pass that filed try 2 and died before writing the run down is adopted, never filed twice — and a run cancelled in that window stops it', async () => {
  const { run, e, filings, stopped, settle } = await throughCheck('check: npm test\nretries: 1', 'failed', 1);
  const before = readRun(run.id);
  await runWith(e, advanceRun(readRun(run.id)));
  writeRun(before);
  const try2 = `${run.id}-implement-try2`;

  const again = await runWith(e, advanceRun(readRun(run.id)));
  assert.deepEqual(
    again.tried,
    [],
    'a pass filed try 2 and the record was written back without it: adopted before the pass assessed anything, nothing left to file',
  );
  assert.equal(filings.filter((f) => f === try2).length, 1);
  assert.deepEqual(
    [readRun(run.id).steps.implement?.taskId, readRun(run.id).steps.implement?.tries?.map((t) => t.then)],
    [try2, ['retries']],
  );

  writeRun(before);
  settle(try2, 'running');
  const { plan } = await runWith(e, cancelRun(run.id));
  assert.deepEqual(
    plan,
    { kind: 'cancel', stop: [{ name: 'implement', taskId: try2 }] },
    'the verb finds it, the run called off in the same window',
  );
  await runWith(e, advanceRun(readRun(run.id)));
  assert.deepEqual(stopped, [try2, try2], 'and so does every pass');
  assert.equal(filings.filter((f) => f === try2).length, 1);
});

test('an ask file the run cannot read is not honoured, and not touched: the pass says so, and files nothing', async () => {
  const { run, e, filings } = await throughCheck('check: npm test', 'failed', 1);
  fs.mkdirSync(asksDir(run.id), { recursive: true });
  fs.writeFileSync(path.join(asksDir(run.id), 'retry-implement-2'), 'try harder');
  fs.writeFileSync(path.join(asksDir(run.id), 'retry-review-2'), JSON.stringify({ mode: 'harder' }));
  const pass = await runWith(e, advanceRun(readRun(run.id)));
  assert.deepEqual(pass.tried, []);
  assert.ok(
    pass.notes.some((n) => /retry-implement-2: unreadable .* so it is not honoured/.test(n)),
    pass.notes.join('\n'),
  );
  assert.ok(
    pass.notes.some((n) => /retry-review-2: it asks for no mode nemia retry knows \("harder"\)/.test(n)),
    pass.notes.join('\n'),
  );
  assert.deepEqual(asksOf(run.id), ['retry-implement-2', 'retry-review-2']);
  assert.equal(filings.length, 2);
});

test("a step named for another step's try is refused at `nemia start`, before anything is spent", async () => {
  const dir = folder();
  fs.writeFileSync(path.join(dir, 'implement-try2.md'), '---\nafter: implement\nplace: git\n---\na step of its own\n');
  const runs = fs.readdirSync(path.join(ROOT, 'runs')).length;
  await assert.rejects(
    async () => await runPlaced(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: dir })),
    refusedNaming('Invalid', 'implement-try2: a step may not be named', 'Rename implement-try2.md'),
  );
  assert.equal(fs.readdirSync(path.join(ROOT, 'runs')).length, runs);
});

test('`nemia retry` takes one way to try, and `--model` with a name — anything else is refused before a run is read', async () => {
  for (const [flags, pattern] of [
    [['--fresh', '--recheck'], /pick one of --nudge, --fresh, --model <m>, --recheck/],
    [['--model'], /--model takes the model/],
    [['--model', '--fresh'], /--model takes the model/],
    [['--harder'], /does not take --harder/],
  ] as const) {
    await assert.rejects(main(['retry', 'no-such-run', 'implement', ...flags]), refusedWith(pattern), flags.join(' '));
  }
});

/** `findings` and `again`, as the tests' team's `test/fixtures/team/agents/review.schema.json` declares them. */
const LOOPING = { ...FINDINGS, properties: { ...FINDINGS.properties, again: { type: 'boolean' } }, required: ['findings', 'again'] };

/**
 * implement, checked → review, looping back to it with `rounds:` at its default unless `reviewKeys` say — the shape `workflows/` ships.
 * Each key set ends with a newline.
 */
const looped = (reviewKeys = '', implementKeys = '') => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), `---\nplace: git\ncheck: npm test\n${implementKeys}---\nimplement it\n`);
  fs.writeFileSync(
    path.join(dir, 'review.md'),
    `---\nafter: implement\nplace: git\noutput: review.schema.json\nloop: implement\n${reviewKeys}---\nreview it\n`,
  );
  fs.writeFileSync(path.join(dir, 'review.schema.json'), JSON.stringify(LOOPING, null, 2));
  return dir;
};
const REPLIES = [{ finding: 'src/flag.ts:12', answer: 'fixed', why: 'the flag is parsed before it is read' }];
const reviewSays = (again: boolean) => ({ ...SIGNED, summary: 'REVIEWER-SUMMARY', findings: FOUND, again });
const ANSWERED = { ...SIGNED, summary: 'IMPLEMENTER-SUMMARY', replies: REPLIES };
/** A step's task on round `n`: its first try's id, then its try's. */
const onRound = (id: string, step: string, n: number) => (n === 1 ? `${id}-${step}` : `${id}-${step}-try${n}`);

/**
 * Round `n` up to review's word: implement's try signs off — answering, past round 1 — and its check is filed and passes, then review is
 * filed and signs off saying `again`. The pass that reads that word is the caller's.
 */
const toReview = async (b: ReturnType<typeof board>, id: string, n: number, again: boolean) => {
  b.settle(onRound(id, 'implement', n), 'succeeded', n === 1 ? SIGNED : ANSWERED);
  assert.deepEqual((await runWith(b.e, advanceRun(readRun(id)))).checked, ['implement'], `round ${n}: implement's check`);
  b.settle(`${onRound(id, 'implement', n)}-check`, 'succeeded', undefined, 0);
  assert.deepEqual((await runWith(b.e, advanceRun(readRun(id)))).filed, ['review'], `round ${n}: review`);
  b.settle(onRound(id, 'review', n), 'succeeded', reviewSays(again));
};
const roundAsksOf = (id: string) => (fs.existsSync(asksDir(id)) ? fs.readdirSync(asksDir(id)).filter((f) => f.startsWith('round-')) : []);
/** The JSON under a brief's `heading`. */
const dataUnder = (brief: string, heading: string) =>
  JSON.parse(new RegExp(`${heading}\\n[\\s\\S]*?\\n\`\`\`json\\n([\\s\\S]*?)\\n\`\`\``).exec(brief)![1]);

/**
 * A check's stdout as `workflows/build`'s prints it: turbo's prefixed lines, the pictures' `wf pictures:` lines, then a tail longer
 * than 20 lines.
 */
/** The line a check that touched no page prints last, planted in its stdout. */
const NO_PAGES = 'wf check: nothing under apps/web/ or apps/api/ was touched: no build, no e2e';
/** The pages a cut-short check named before it was stopped, planted in the engine's log. */
const PAGES_RUN = 'wf pictures: the pages this change touched: run';
const picturesLog = (named: readonly string[]): string =>
  [
    'agent-orchestrator:test: ✔ files a step (12 ms)',
    'agent-orchestrator:test: wf pictures: a line a test printed, prefixed by turbo',
    'wf pictures: the pages this change touched: run, factory',
    ...named.map((n) => `wf pictures: named ${n}`),
    `wf pictures: ${named.length} picture(s) named, 0 missing, in 3.1 s`,
    ...Array.from({ length: 24 }, (_, i) => `web:build: chunk ${i} built`),
    NO_PAGES,
    '',
  ].join('\n');
/**
 * A check's output as the runtime keeps it: its whole stdout as the stream of its attempt, and in the engine's log only the end from the
 * web build on, which holds no `wf pictures:` line, as the engine keeps the end of a long one.
 */
const checkPrinted = (b: { logs: Map<string, string>; outputs: Map<string, string> }, id: string, text: string) => {
  b.outputs.set(`${id}.stdout`, text);
  b.logs.set(id, text.slice(text.indexOf('web:build:')));
};
const NAMED_1 = '#1 run-dark.png, for apps/web/src/routes/run.tsx (0.4 s)';
const NAMED_2 = '#2 factory-light.png, for apps/web/src/routes/factory.tsx (0.3 s)';
const CHECK_SAID = "## What implement's check said";

test('the step after a checked step is handed what the check said: its exit, the tails, and every `wf <name>:` line of its whole stdout, in its brief', async () => {
  const { run, e, tasks, logs, outputs } = await throughCheck('check: npm test', 'succeeded', 0);
  const check = `${run.id}-implement-check`;
  checkPrinted({ logs, outputs }, check, picturesLog([NAMED_1, NAMED_2]));
  assert.doesNotMatch(logs.get(check)!, /wf pictures:/, "the engine's log holds none of them");
  outputs.set(`${check}.stderr`, 'npm warn deprecated glob@7\n');

  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).filed, ['review']);
  const brief = tasks.get(`${run.id}-review`)!.spec.brief;
  assert.match(brief, /\n## What implement's check said\n\nIt passed: exited 0\./);
  const said = dataUnder(brief, CHECK_SAID) as { stdout: string; reported: string[] };
  assert.deepEqual(said.reported, [
    'wf pictures: the pages this change touched: run, factory',
    `wf pictures: named ${NAMED_1}`,
    `wf pictures: named ${NAMED_2}`,
    'wf pictures: 2 picture(s) named, 0 missing, in 3.1 s',
    NO_PAGES,
  ]);
  assert.doesNotMatch(said.stdout, /named #/, 'the marked lines are above the tail, so only the whole stdout hands them');
  assert.match(brief, /from all of it and not only the tail\./);
  assert.deepEqual(dataUnder(brief, CHECK_SAID), {
    command: 'npm test',
    exit: 0,
    stdout: [...Array.from({ length: 19 }, (_, i) => `web:build: chunk ${i + 5} built`), NO_PAGES].join('\n'),
    stderr: 'npm warn deprecated glob@7',
    reported: said.reported,
  });
});

test('REFUSED silence: a check that did not finish says so, and one whose log cannot be read says why, in the brief of the step after it', async () => {
  const cut = await throughCheck('check: npm test', 'succeeded');
  cut.logs.set(`${cut.run.id}-implement-check`, `${PAGES_RUN}\nok 1 - builds\n`);
  await runWith(cut.e, advanceRun(readRun(cut.run.id)));
  const unfinished = cut.tasks.get(`${cut.run.id}-review`)!.spec.brief;
  assert.match(
    unfinished,
    /\n## What implement's check said\n\nIt did not finish: it was stopped, or killed before it exited with a code\./,
  );
  assert.doesNotMatch(unfinished, /It passed/);
  assert.deepEqual(
    dataUnder(unfinished, CHECK_SAID) as object,
    {
      command: 'npm test',
      exit: 'unfinished',
      stdout: `${PAGES_RUN}\nok 1 - builds`,
      stderr: '',
      reported: [PAGES_RUN],
      partial: true,
    },
    "no whole stdout kept: read off the engine's log, partial",
  );
  assert.match(unfinished, /Its whole stdout\nwas not kept, so `partial` is true: a line printed earlier may be missing/);
  assert.doesNotMatch(unfinished, /from all of it/);

  const gone = await throughCheck('check: npm test', 'succeeded', 0);
  const check = `${gone.run.id}-implement-check`;
  const logsOf = gone.e.logs.bind(gone.e);
  Object.assign(gone.e, {
    logs: (id: string) => (id === check ? Effect.fail(new Error(`no journal for ${id}`)) : logsOf(id)),
  });
  assert.deepEqual((await runWith(gone.e, advanceRun(readRun(gone.run.id)))).filed, ['review'], 'the step is filed all the same');
  assert.match(
    gone.tasks.get(`${gone.run.id}-review`)!.spec.brief,
    new RegExp(
      `\\n## What implement's check said\\n\\nWhat it said cannot be given here — the engine could not give what its task ${check} printed: no journal for ${check}\\.`,
    ),
  );
});

test("a step after a checked step, tried afresh, is handed that check in its try's brief too", async () => {
  const run = await started(folder('check: npm test'));
  const b = board();
  checkPrinted(b, `${run.id}-implement-check`, picturesLog([NAMED_1]));
  await runWith(b.e, advanceRun(readRun(run.id)));
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(run.id)));
  b.settle(`${run.id}-implement-check`, 'succeeded', undefined, 0);
  assert.deepEqual((await runWith(b.e, advanceRun(readRun(run.id)))).filed, ['review']);
  b.settle(`${run.id}-review`, 'failed', undefined, 1, 'quiet');
  await runWith(b.e, retryRun(run.id, 'review', { mode: 'fresh' }));
  assert.deepEqual((await runWith(b.e, advanceRun(readRun(run.id)))).tried, ['review']);
  const said = dataUnder(b.tasks.get(`${run.id}-review-try2`)!.spec.brief, CHECK_SAID) as { reported: string[] };
  assert.ok(said.reported.includes(`wf pictures: named ${NAMED_1}`), said.reported.join('\n'));
});

test("a step after a step with no `check:` is handed no check's word", async () => {
  const run = await started(folder());
  const { e, tasks, settle } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).filed, ['review']);
  assert.ok(!tasks.get(`${run.id}-review`)!.spec.brief.includes(CHECK_SAID));
});

/** implement ⇄ review as `looped()` builds it, and a gated ship after the loop: the ending an acceptance exists to reach. */
const loopedThenShip = (reviewKeys = '') => {
  const dir = looped(reviewKeys);
  fs.writeFileSync(path.join(dir, 'ship.md'), '---\nafter: review\nplace: git\ngate: true\n---\nship it\n');
  return dir;
};
/** Why a person judged the loop's findings later work rather than this run's. */
const ENOUGH = 'the finding is a case no shipped team has: follow-up work, not this run.';

/** The same loop, closed by a step with no gate: what waits on the loop runs the moment the loop is over, and nobody is asked. */
const loopedThenDocs = () => {
  const dir = looped();
  fs.writeFileSync(path.join(dir, 'docs.md'), '---\nafter: review\nplace: git\n---\nwrite it up\n');
  return dir;
};

test('an acceptance a tick has acted on is not a file to delete: the round refuses with what there is instead — and refuses again if it is deleted anyway', async () => {
  const run = await started(loopedThenDocs());
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  for (const n of [1, 2]) {
    await toReview(b, run.id, n, true);
    await runWith(b.e, advanceRun(readRun(run.id)));
  }
  await toReview(b, run.id, 3, true);
  assert.deepEqual((await runWith(b.e, advanceRun(readRun(run.id)))).filed, [], 'at the cap, nothing after the loop');

  const { file } = await runWith(b.e, acceptRun(run.id, undefined, ENOUGH));
  const early = await refusal(runWith(b.e, roundRun(run.id)));
  assert.match(
    early,
    /^review asked for round 4, and a person accepted its work as it stands at .*Nothing waiting on it has been filed yet, so to go round once more after all, take that acceptance back first — accept-review-3, in the run's \.asks directory — then ask again: nemia round /,
    'before a tick has acted on it, taking the acceptance back is the way back into the loop: nothing was done on its strength',
  );

  assert.deepEqual(
    (await runWith(b.e, advanceRun(readRun(run.id)))).filed,
    ['docs'],
    'the tick files what waited, as if review had said `again: false`',
  );
  const late = await refusal(runWith(b.e, roundRun(run.id)));
  assert.match(
    late,
    /^review asked for round 4, and a person accepted its work as it stands at .* \(nemia accept\), so its loop is over on their word and there is nothing to go round again\. What waits on it has been filed: nemia ls /,
    'once a tick has acted on it, docs has run on the work and taking the word back takes none of that back: the refusal says what there is',
  );
  assert.doesNotMatch(late, /take that acceptance back|\.asks directory/, 'and does not send them to delete it');

  fs.rmSync(file);
  assert.equal(
    readRun(run.id).acceptances,
    undefined,
    'deleted anyway: an acceptance is level-triggered, unlike a round ask, so the loop reads out of rounds again',
  );
  assert.equal(
    (await runWith(b.e, list(b.e, readRun(run.id)))).steps[1].status,
    'rounds exhausted',
    'which is the standing a round is filed from',
  );
  const anyway = await refusal(runWith(b.e, roundRun(run.id)));
  assert.match(
    anyway,
    /^docs waits on review and has already been filed \(running\), so a round would file implement again under a step that ran on its work, and take none of that back\./,
  );
  assert.match(anyway, /deleting that acceptance does not delete docs\. See where the run stands, and what there is to do: nemia decide /);
  assert.deepEqual(roundAsksOf(run.id), [], 'and no ask is written');
  assert.deepEqual((await runWith(b.e, advanceRun(readRun(run.id)))).looped, [], 'nor does a pass go round of its own accord');
});

test('a pass that filed a round and died before writing the run down is adopted, never filed twice — and a run cancelled in that window stops it', async () => {
  const run = await started(looped());
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  await toReview(b, run.id, 1, true);
  const before = readRun(run.id);
  await runWith(b.e, advanceRun(readRun(run.id)));
  writeRun(before);
  const try2 = `${run.id}-implement-try2`;

  const again = await runWith(b.e, advanceRun(readRun(run.id)));
  assert.deepEqual(
    again.looped,
    [],
    'a pass filed round 2 and the record was written back without it: adopted before the pass assessed anything, nothing left to file',
  );
  assert.equal(b.filings.filter((f) => f === try2).length, 1);
  const record = readRun(run.id).steps;
  assert.deepEqual([record.implement?.taskId, record.review?.taskId, record.review?.tries?.map((t) => t.then)], [try2, null, ['round']]);

  writeRun(before);
  b.settle(try2, 'running');
  const { plan } = await runWith(b.e, cancelRun(run.id));
  assert.deepEqual(
    plan,
    { kind: 'cancel', stop: [{ name: 'implement', taskId: try2 }] },
    'the verb finds it, the run called off in the same window',
  );
  assert.equal(readRun(run.id).steps.implement?.taskId, `${run.id}-implement`, 'and does not write the run to do so');
  await runWith(b.e, advanceRun(readRun(run.id)));
  assert.deepEqual(b.stopped, [try2, try2], 'and so does every pass');
  assert.equal(b.filings.filter((f) => f === try2).length, 1);
});

test('REFUSED before, now carried: a step with `tools:` and `effort:` reaches `e.file` with exactly that list and that effort — on its first filing, a try `retries:` files, and a try `nemia retry` asks for', async () => {
  const TOOLS = ['Read', 'Grep', 'Glob', 'Bash'];
  const { run, e, tasks, settle } = await throughCheck(
    'check: npm test\nretries: 1\ntools: Read, Grep, Glob, Bash\neffort: high',
    'failed',
    1,
  );
  const first = tasks.get(`${run.id}-implement`)!.spec;
  assert.deepEqual([first.config?.tools, first.config?.effort], [TOOLS, 'high'], 'the first filing');

  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).tried, ['implement']);
  const nudged = tasks.get(`${run.id}-implement-try2`)!.spec;
  assert.deepEqual(
    [nudged.config?.tools, nudged.config?.effort, nudged.resumeFrom],
    [TOOLS, 'high', `native-${run.id}-implement`],
    'the try `retries:` files, continuing the session',
  );

  settle(`${run.id}-implement-try2`, 'succeeded', SIGNED);
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).checked, ['implement']);
  settle(`${run.id}-implement-try2-check`, 'failed', undefined, 1);
  await runWith(e, retryRun(run.id, 'implement', { mode: 'fresh', model: 'opus' }));
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).tried, ['implement']);
  const fresh = tasks.get(`${run.id}-implement-try3`)!.spec;
  assert.deepEqual(
    [fresh.config?.tools, fresh.config?.effort, fresh.config?.model, fresh.resumeFrom],
    [TOOLS, 'high', 'opus', undefined],
    'a new session on the model asked for, fenced the same',
  );

  const check = tasks.get(`${run.id}-implement-check`)!.spec;
  assert.deepEqual(
    [check.harness, check.config?.tools, check.config?.effort],
    ['check', undefined, undefined],
    "the check is the run's own, on a harness with no tools to narrow",
  );
});

test('a step with `context:` reaches `e.file` as its tokens, `contextTokens` — on its first filing, a try `retries:` files, and a try `nemia retry` asks for; a check has none', async () => {
  const { run, e, tasks, settle } = await throughCheck('check: npm test\nretries: 1\ncontext: 200k', 'failed', 1);
  assert.equal(
    tasks.get(`${run.id}-implement`)!.spec.config?.contextTokens,
    200_000,
    'the first filing, as the number the line was read into',
  );

  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).tried, ['implement']);
  const nudged = tasks.get(`${run.id}-implement-try2`)!.spec;
  assert.deepEqual(
    [nudged.config?.contextTokens, nudged.resumeFrom],
    [200_000, `native-${run.id}-implement`],
    'the try `retries:` files, continuing the session on its window',
  );

  settle(`${run.id}-implement-try2`, 'succeeded', SIGNED);
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).checked, ['implement']);
  settle(`${run.id}-implement-try2-check`, 'failed', undefined, 1);
  await runWith(e, retryRun(run.id, 'implement', { mode: 'fresh' }));
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).tried, ['implement']);
  assert.equal(tasks.get(`${run.id}-implement-try3`)!.spec.config?.contextTokens, 200_000, 'a new session, on the same window');

  assert.equal(
    tasks.get(`${run.id}-implement-check`)!.spec.config?.contextTokens,
    undefined,
    "the check is the run's own, and has no session",
  );
  const plain = await started(folder());
  const b = board();
  await runWith(b.e, advanceRun(readRun(plain.id)));
  assert.equal(b.tasks.get(`${plain.id}-implement`)!.spec.config?.contextTokens, undefined, "no line, no window: the model's own");
});

test("a step that continues another's session (`resume:`) is filed with that session's window, and with no line of its own inherits it — a retry of it too", async () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\ncontext: 200k\n---\nimplement it\n');
  fs.writeFileSync(path.join(dir, 'respond.md'), '---\nresume: implement\nplace: git\ncheck: npm test\n---\nanswer it\n');
  const run = await started(dir);
  const { e, tasks, settle } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).filed, ['respond']);
  const respond = tasks.get(`${run.id}-respond`)!.spec;
  assert.deepEqual(
    [respond.resumeFrom, respond.config?.contextTokens],
    [`native-${run.id}-implement`, 200_000],
    "without `sessionContext`, respond is filed with its own `context:`, none, and its copy of implement's session runs on the whole window",
  );

  settle(`${run.id}-respond`, 'succeeded', SIGNED);
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).checked, ['respond']);
  settle(`${run.id}-respond-check`, 'failed', undefined, 1);
  await runWith(e, retryRun(run.id, 'respond', { mode: 'nudge', message: 'the test fails' }));
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).tried, ['respond']);
  assert.equal(tasks.get(`${run.id}-respond-try2`)!.spec.config?.contextTokens, 200_000, 'its nudge, continuing the same chain');
});

test('a step with `disallowedTools:` reaches `e.file` with exactly those rules as `disallowedTools` — on its first filing, a try `retries:` files, and a try `nemia retry` asks for', async () => {
  const RULES = ['Bash(npm run build)', 'Bash(npm run e2e)', 'SendMessage'];
  const { run, e, tasks, settle } = await throughCheck(
    'check: npm test\nretries: 1\ndisallowedTools: Bash(npm run build), Bash(npm run e2e), SendMessage',
    'failed',
    1,
  );
  assert.deepEqual(tasks.get(`${run.id}-implement`)!.spec.config?.disallowedTools, RULES, 'the first filing');

  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).tried, ['implement']);
  const nudged = tasks.get(`${run.id}-implement-try2`)!.spec;
  assert.deepEqual(
    [nudged.config?.disallowedTools, nudged.resumeFrom],
    [RULES, `native-${run.id}-implement`],
    'the try `retries:` files, continuing the session',
  );

  settle(`${run.id}-implement-try2`, 'succeeded', SIGNED);
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).checked, ['implement']);
  settle(`${run.id}-implement-try2-check`, 'failed', undefined, 1);
  await runWith(e, retryRun(run.id, 'implement', { mode: 'fresh' }));
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).tried, ['implement']);
  assert.deepEqual(tasks.get(`${run.id}-implement-try3`)!.spec.config?.disallowedTools, RULES, 'a new session, denied the same');

  assert.equal(
    tasks.get(`${run.id}-implement-check`)!.spec.config?.disallowedTools,
    undefined,
    "the check is the run's own, and denied nothing",
  );
});

test('a run frozen while the lists were `disallow` and `allow` loads, files each step with its rules under the names they have now, and is written back under those alone', async () => {
  const run = await started(folder('disallowedTools: SendMessage\nallowedTools: Edit(**), Bash(npm test)'));
  const at = path.join(ROOT, 'runs', `${run.id}.json`);
  const record = JSON.parse(fs.readFileSync(at, 'utf8')) as Run & { workflow: Array<Record<string, unknown>> };
  record.workflow = record.workflow.map(({ disallowedTools, allowedTools, ...step }) => ({
    ...step,
    ...(disallowedTools ? { disallow: disallowedTools } : {}),
    ...(allowedTools ? { allow: allowedTools } : {}),
  }));
  fs.writeFileSync(at, JSON.stringify(record, null, 2));
  assert.match(
    fs.readFileSync(at, 'utf8'),
    /"disallow": \[/,
    'the fixture is the record as an older `nemia` froze it: the same step, its lists under the former names',
  );
  assert.doesNotMatch(fs.readFileSync(at, 'utf8'), /"(disallowed|allowed)Tools":/, 'and holds no new name');
  const read = readRun(run.id).workflow!.find((s) => s.name === 'implement')!;
  assert.deepEqual(
    [read.disallowedTools, read.allowedTools],
    [['SendMessage'], ['Edit(**)', 'Bash(npm test)']],
    'read under the names the keys have now',
  );
  assert.equal(Object.hasOwn(read, 'allow') || Object.hasOwn(read, 'disallow'), false);
  assert.deepEqual(
    listRuns().find((r) => r.id === run.id)!.workflow,
    readRun(run.id).workflow,
    'and listed the same way the tick reads it',
  );
  const { e, tasks } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  const config = tasks.get(`${run.id}-implement`)!.spec.config;
  assert.deepEqual(
    [config?.disallowedTools, config?.allowedTools],
    [['SendMessage'], ['Edit(**)', 'Bash(npm test)']],
    'the frozen rules reach the engine: none is dropped',
  );
  const written = (JSON.parse(fs.readFileSync(at, 'utf8')) as { workflow: Array<Record<string, unknown>> }).workflow.find(
    (s) => s.name === 'implement',
  )!;
  assert.deepEqual(
    [written.disallowedTools, written.allowedTools],
    [['SendMessage'], ['Edit(**)', 'Bash(npm test)']],
    'the pass that filed it wrote the record back under the new names',
  );
  assert.equal(Object.hasOwn(written, 'disallow') || Object.hasOwn(written, 'allow'), false, 'and under them alone');
});

test("a record written today holds each step's rule lists and a codex step's sandbox under the names they have now alone, at `nemia start` and after a pass", async () => {
  const lists = await started(folder('disallowedTools: SendMessage\nallowedTools: Edit(**), Bash(npm test)'));
  const codex = await started(folder('harness: codex\nsandbox: read-only'));
  const frozen = (id: string) =>
    (
      JSON.parse(fs.readFileSync(path.join(ROOT, 'runs', `${id}.json`), 'utf8')) as { workflow: Array<Record<string, unknown>> }
    ).workflow.find((s) => s.name === 'implement')!;
  const held = () => {
    const step = frozen(lists.id);
    const sandboxed = frozen(codex.id);
    return {
      lists: [step.disallowedTools, step.allowedTools],
      former: [Object.hasOwn(step, 'disallow'), Object.hasOwn(step, 'allow'), Object.hasOwn(sandboxed, 'permissionMode')],
      sandbox: sandboxed.sandbox,
    };
  };
  const TODAY = { lists: [['SendMessage'], ['Edit(**)', 'Bash(npm test)']], former: [false, false, false], sandbox: 'read-only' };
  assert.deepEqual(held(), TODAY, '`nemia start` writes them (`writeRun`) under the new names, and no former one');
  const { e } = board();
  await runWith(e, advanceRun(readRun(lists.id)));
  await runWith(e, advanceRun(readRun(codex.id)));
  assert.deepEqual(held(), TODAY, 'and the tick writes them back (`rewriteRun`) the same way');
});

test("a codex run frozen while its sandbox was `permissionMode` loads as it was frozen, and files that sandbox: the engine's task calls it `permissionMode` (`modeOf`)", async () => {
  const frozenAs = async (sandbox: string, word: string) => {
    const run = await started(folder(`harness: codex\nsandbox: ${sandbox}`));
    const at = path.join(ROOT, 'runs', `${run.id}.json`);
    const record = JSON.parse(fs.readFileSync(at, 'utf8')) as Run & { workflow: Array<Record<string, unknown>> };
    record.workflow = record.workflow.map(({ sandbox: given, permissionMode: _, ...step }) => ({
      ...step,
      ...(given ? { permissionMode: word } : {}),
    }));
    fs.writeFileSync(at, JSON.stringify(record, null, 2));
    assert.doesNotMatch(
      fs.readFileSync(at, 'utf8'),
      /"sandbox":/,
      "the fixture is the record as an older `nemia` froze it: the codex step's sandbox under `permissionMode`, and no `sandbox`",
    );
    return run;
  };
  const { e, tasks } = board();
  for (const [sandbox, word] of [
    ['read-only', 'read-only'],
    ['danger-full-access', 'bypassPermissions'],
  ]) {
    const run = await frozenAs(sandbox, word);
    const read = readRun(run.id).workflow!.find((s) => s.name === 'implement')!;
    assert.deepEqual([read.permissionMode, read.sandbox], [word, undefined], 'read as it was frozen');
    await runWith(e, advanceRun(readRun(run.id)));
    assert.equal(
      tasks.get(`${run.id}-implement`)!.spec.config?.permissionMode,
      word,
      "the engine is handed the sandbox it was written with, not Codex's default; the runtime reads `bypassPermissions` as `danger-full-access`",
    );
  }
});

test("a codex step's `sandbox:` is filed as the engine's `permissionMode`, and a Claude Code step's `permissionMode:` as itself — each on its first filing", async () => {
  const codexRun = await started(folder('harness: codex\nsandbox: read-only'));
  const claudeRun = await started(folder('permissionMode: dontAsk'));
  const { e, tasks } = board();
  await runWith(e, advanceRun(readRun(codexRun.id)));
  await runWith(e, advanceRun(readRun(claudeRun.id)));
  assert.equal(tasks.get(`${codexRun.id}-implement`)!.spec.config?.permissionMode, 'read-only');
  assert.equal(tasks.get(`${claudeRun.id}-implement`)!.spec.config?.permissionMode, 'dontAsk');
});

test("a codex step of a repository run is filed with `codex.trustFrom` the real path of its repository, on its first filing, a try and a round; a Claude Code step and a folder run's codex step with none", async () => {
  const real = aRepo();
  const link = path.join(scratch('wf-linked-'), 'repo');
  fs.symlinkSync(real, link);
  const run = repositoryRunOf(
    await runPlaced(startRun({ brief: 'add a flag', repo: link, workflowDir: looped('', 'harness: codex\nretries: 1\n'), isolate: false })),
  );
  assert.equal(run.repo, link, 'the record keeps the path the run was started with');
  const trusted = { trustFrom: fs.realpathSync(real) };
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  assert.deepEqual(b.tasks.get(`${run.id}-implement`)!.spec.config?.codex, trusted, 'the first filing');

  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  assert.deepEqual((await runWith(b.e, advanceRun(readRun(run.id)))).checked, ['implement']);
  b.settle(`${run.id}-implement-check`, 'failed', undefined, 1);
  assert.deepEqual((await runWith(b.e, advanceRun(readRun(run.id)))).tried, ['implement']);
  assert.deepEqual(b.tasks.get(`${run.id}-implement-try2`)!.spec.config?.codex, trusted, 'the try `retries:` files');

  b.settle(`${run.id}-implement-try2`, 'succeeded', SIGNED);
  assert.deepEqual((await runWith(b.e, advanceRun(readRun(run.id)))).checked, ['implement']);
  b.settle(`${run.id}-implement-try2-check`, 'succeeded', undefined, 0);
  assert.deepEqual((await runWith(b.e, advanceRun(readRun(run.id)))).filed, ['review']);
  b.settle(`${run.id}-review`, 'succeeded', reviewSays(true));
  assert.deepEqual((await runWith(b.e, advanceRun(readRun(run.id)))).looped, ['review']);
  assert.deepEqual(b.tasks.get(`${run.id}-implement-try3`)!.spec.config?.codex, trusted, 'the round review asks for');
  assert.equal(b.tasks.get(`${run.id}-review`)!.spec.config?.codex, undefined, "the review, a Claude Code step, names no Codex's trust");

  const team = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(team, 'write.md'), '---\nworkspace: folder\nharness: codex\n---\nwrite the note\n');
  const inFolders = await runPlaced(startRun({ brief: 'a note', repo: scratch('wf-not-a-repo-'), workflowDir: team }));
  assert.equal(isRepositoryRun(inFolders), false);
  await runWith(b.e, advanceRun(readRun(inFolders.id)));
  const written = b.tasks.get(`${inFolders.id}-write`)!.spec;
  assert.equal(written.harness, 'codex');
  assert.equal(written.config?.codex, undefined, 'a folder run has no repository to extend trust from');
});

test('a codex try of a run whose repository is gone is filed with no `codex.trustFrom`, rather than throwing out of the pass', async () => {
  const repo = aRepo();
  const run = repositoryRunOf(
    await runPlaced(startRun({ brief: 'add a flag', repo, workflowDir: folder('harness: codex\ncheck: npm test\nretries: 1') })),
  );
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  assert.deepEqual((await runWith(b.e, advanceRun(readRun(run.id)))).checked, ['implement']);
  b.settle(`${run.id}-implement-check`, 'failed', undefined, 1);
  fs.rmSync(repo, { recursive: true, force: true });
  assert.deepEqual((await runWith(b.e, advanceRun(readRun(run.id)))).tried, ['implement']);
  const tried = b.tasks.get(`${run.id}-implement-try2`)!.spec;
  assert.equal(tried.config?.codex, undefined, 'a repository that is not there extends no trust');
});

test('a step with `allowedTools:` reaches `e.file` with exactly those rules as `allowedTools` — on its first filing, a try `retries:` files, and a try `nemia retry` asks for', async () => {
  const RULES = ['Edit(**)', 'Bash(npm test)'];
  const { run, e, tasks, settle } = await throughCheck('check: npm test\nretries: 1\nallowedTools: Edit(**), Bash(npm test)', 'failed', 1);
  assert.deepEqual(tasks.get(`${run.id}-implement`)!.spec.config?.allowedTools, RULES, 'the first filing');

  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).tried, ['implement']);
  const nudged = tasks.get(`${run.id}-implement-try2`)!.spec;
  assert.deepEqual(
    [nudged.config?.allowedTools, nudged.resumeFrom],
    [RULES, `native-${run.id}-implement`],
    'the try `retries:` files, continuing the session',
  );

  settle(`${run.id}-implement-try2`, 'succeeded', SIGNED);
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).checked, ['implement']);
  settle(`${run.id}-implement-try2-check`, 'failed', undefined, 1);
  await runWith(e, retryRun(run.id, 'implement', { mode: 'fresh' }));
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).tried, ['implement']);
  assert.deepEqual(tasks.get(`${run.id}-implement-try3`)!.spec.config?.allowedTools, RULES, 'a new session, allowed the same');

  assert.equal(
    tasks.get(`${run.id}-implement-check`)!.spec.config?.allowedTools,
    undefined,
    "the check is the run's own, and is allowed nothing",
  );
});

test("at shipped defaults a step names neither, and is filed with neither: the harness's own tools, at its own effort", async () => {
  const run = await started(folder());
  const { e, tasks } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  const spec = tasks.get(`${run.id}-implement`)!.spec;
  assert.deepEqual([spec.config?.tools, spec.config?.disallowedTools, spec.config?.effort], [undefined, undefined, undefined]);
});

test("a round files its target with the target's tools, deny list and effort, and the looping step — a new session each round — with its own", async () => {
  const REVIEWS = ['Read', 'Grep', 'Glob', 'Bash'];
  const EDITS = ['Read', 'Edit', 'Write', 'Bash'];
  const run = await started(
    looped(
      'tools: Read, Grep, Glob, Bash\ndisallowedTools: Bash(npm run build)\neffort: max\n',
      'tools: Read, Edit, Write, Bash\ndisallowedTools: SendMessage\nallowedTools: Edit(**)\neffort: low\n',
    ),
  );
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  const implement1 = b.tasks.get(`${run.id}-implement`)!.spec;
  assert.deepEqual(
    [implement1.config?.tools, implement1.config?.disallowedTools, implement1.config?.allowedTools, implement1.config?.effort],
    [EDITS, ['SendMessage'], ['Edit(**)'], 'low'],
  );
  await toReview(b, run.id, 1, true);
  const review1 = b.tasks.get(`${run.id}-review`)!.spec;
  assert.deepEqual(
    [review1.config?.tools, review1.config?.disallowedTools, review1.config?.allowedTools, review1.config?.effort],
    [REVIEWS, ['Bash(npm run build)'], undefined, 'max'],
    'the looping step, which allows nothing of its own',
  );

  assert.deepEqual((await runWith(b.e, advanceRun(readRun(run.id)))).looped, ['review']);
  const implement2 = b.tasks.get(`${run.id}-implement-try2`)!.spec;
  assert.deepEqual(
    [
      implement2.config?.tools,
      implement2.config?.disallowedTools,
      implement2.config?.allowedTools,
      implement2.config?.effort,
      implement2.resumeFrom,
    ],
    [EDITS, ['SendMessage'], ['Edit(**)'], 'low', `native-${run.id}-implement`],
    'the round, continuing implement',
  );
  await toReview(b, run.id, 2, false);
  const review2 = b.tasks.get(`${run.id}-review-try2`)!.spec;
  assert.deepEqual(
    [review2.config?.tools, review2.config?.disallowedTools, review2.config?.effort, review2.resumeFrom],
    [REVIEWS, ['Bash(npm run build)'], 'max', undefined],
    "round 2's review",
  );
});

test('a step with `background: true` and `remote: true` reaches `e.file` with both — on its first filing, a try `retries:` files, and a try `nemia retry` asks for — and its check, and a step without the lines, with neither', async () => {
  const { run, e, tasks, settle } = await throughCheck('check: npm test\nretries: 1\nbackground: true\nremote: true', 'failed', 1);
  const both = (id: string) => [tasks.get(id)!.spec.config?.background, tasks.get(id)!.spec.config?.claude?.remoteControl];
  assert.deepEqual(both(`${run.id}-implement`), [true, true], 'the first filing');

  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).tried, ['implement']);
  const nudged = tasks.get(`${run.id}-implement-try2`)!.spec;
  assert.deepEqual(
    [nudged.config?.background, nudged.config?.claude?.remoteControl, nudged.resumeFrom],
    [true, true, `native-${run.id}-implement`],
    'the try `retries:` files, continuing the session',
  );

  settle(`${run.id}-implement-try2`, 'succeeded', SIGNED);
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).checked, ['implement']);
  settle(`${run.id}-implement-try2-check`, 'failed', undefined, 1);
  await runWith(e, retryRun(run.id, 'implement', { mode: 'fresh' }));
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).tried, ['implement']);
  assert.deepEqual(both(`${run.id}-implement-try3`), [true, true], 'a new session, bridged the same');

  assert.deepEqual(
    [tasks.get(`${run.id}-implement-check`)!.spec.harness, ...both(`${run.id}-implement-check`)],
    ['check', undefined, undefined],
    "the check is the run's own, on a harness the engine refuses a bridge for",
  );
  settle(`${run.id}-implement-try3`, 'succeeded', SIGNED);
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-implement-try3-check`, 'succeeded', undefined, 0);
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).filed, ['review']);
  assert.deepEqual(
    both(`${run.id}-review`),
    [undefined, undefined],
    'review never said the word, and it is never a default: a job, unbridged',
  );
});

test('a round files its target bridged as the target says, and the looping step — a new session each round — as it says', async () => {
  const run = await started(looped('background: true\nremote: true\n'));
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  assert.equal(b.tasks.get(`${run.id}-implement`)!.spec.config?.claude?.remoteControl, undefined);
  await toReview(b, run.id, 1, true);
  assert.equal(b.tasks.get(`${run.id}-review`)!.spec.config?.claude?.remoteControl, true);
  assert.deepEqual((await runWith(b.e, advanceRun(readRun(run.id)))).looped, ['review']);
  assert.equal(b.tasks.get(`${run.id}-implement-try2`)!.spec.config?.claude?.remoteControl, undefined, 'the round, continuing implement');
  await toReview(b, run.id, 2, false);
  assert.equal(b.tasks.get(`${run.id}-review-try2`)!.spec.config?.claude?.remoteControl, true, "round 2's review");

  const other = await started(looped('', 'background: true\nremote: true\n'));
  const c = board();
  await runWith(c.e, advanceRun(readRun(other.id)));
  await toReview(c, other.id, 1, true);
  assert.deepEqual((await runWith(c.e, advanceRun(readRun(other.id)))).looped, ['review']);
  assert.deepEqual(
    [
      c.tasks.get(`${other.id}-implement-try2`)!.spec.config?.claude?.remoteControl,
      c.tasks.get(`${other.id}-review`)!.spec.config?.claude?.remoteControl,
    ],
    [true, undefined],
  );
  assert.deepEqual(
    [c.tasks.get(`${other.id}-implement-try2`)!.spec.config?.background, c.tasks.get(`${other.id}-review`)!.spec.config?.background],
    [true, undefined],
    'and run as the target says, a round being a session of it: a background session again, and review a job',
  );
});

/** Every task a run's record names, viewed once, as the tick views them: all the exports are given — no engine, and so no log. */
const viewsOf = async (e: Engine, run: Run): Promise<Map<string, TaskView>> => {
  const views = new Map<string, TaskView>();
  for (const { taskId, check } of Object.values(run.steps)) {
    if (taskId) views.set(taskId, await Effect.runPromise(e.view(taskId)));
    if (check) views.set(check.taskId, await Effect.runPromise(e.view(check.taskId)));
  }
  return views;
};

test('REFUSED as a verdict: `exitVerdicts` reads `unfinished` for a check whose attempt has no exit code — the word `nemia ls` says — and no retry is spent on it', async () => {
  const refused = await throughCheck('check: npm test\nretries: 1', 'failed', 1);
  refused.logs.set(`${refused.run.id}-implement-check`, 'not ok 1 - parses a trailing comma\n');
  const killed = await throughCheck('check: npm test\nretries: 1', 'failed');
  killed.logs.set(`${killed.run.id}-implement-check`, 'ok 1 - builds\n');
  const cut = await throughCheck('check: npm test\nretries: 1', 'failed', 143);
  cut.settle(`${cut.run.id}-implement-check`, 'failed', undefined, 143, 'deadline');
  cut.logs.set(`${cut.run.id}-implement-check`, 'ok 1 - builds\n');

  for (const [b, verdict] of [
    [refused, 1],
    [killed, 'unfinished'],
    [cut, 'unfinished'],
  ] as const) {
    const run = readRun(b.run.id);
    const verdictOf = exitVerdicts(await viewsOf(b.e, run), run);
    assert.equal(verdictOf('implement'), verdict);
    assert.equal(verdictOf('review'), undefined, 'a step with no check filed has no verdict at all');
    assert.equal(
      (await runWith(b.e, list(b.e, run))).steps[0].status,
      `failed ✗ check (${verdictWord(verdict)})`,
      "`nemia ls`'s word, which it read off the attempt",
    );
  }
  assert.deepEqual(
    (await runWith(killed.e, advanceRun(readRun(killed.run.id)))).tried,
    [],
    'a check killed at its deadline, settled `failed` with no exit code on its attempt, did not finish: no retry',
  );
  assert.deepEqual(
    (await runWith(cut.e, advanceRun(readRun(cut.run.id)))).tried,
    [],
    'nor does one cut at its deadline that trapped the signal and exited: the engine ends it `deadline`, and its code is how it died',
  );
  assert.deepEqual((await runWith(refused.e, advanceRun(readRun(refused.run.id)))).tried, ['implement'], 'a refusal does');
});

/**
 * The run's one sign-off nudge of an unsigned implement, filed by the next pass and ended unsigned in its turn: what leaves the step on a
 * person at shipped defaults (`retriesDue`, `by: 'signoff'`).
 */
async function nudgedUnsigned(b: ReturnType<typeof board>, runId: string): Promise<void> {
  const pass = await runWith(b.e, advanceRun(readRun(runId)));
  assert.deepEqual(pass.tried, ['implement'], 'the run nudges it to sign off, itself');
  assert.equal(readRun(runId).steps.implement?.tries?.at(-1)?.then, 'signoff');
  b.settle(`${runId}-implement-try2`, 'failed', undefined, undefined, 'unsigned');
}

test("UNSIGNED is read off the LAST attempt: a task whose journal, from before stage 4a part 2, has attempt 1 quiet and attempt 2 `lost` reads `failed` on `nemia ls`, `nemia decide` and a try's brief — and one lost, then quiet, reads `unsigned`", async () => {
  const through = async (reasons: string[]) => {
    const b = board();
    const run = await started(folder());
    await runWith(b.e, advanceRun(readRun(run.id)));
    b.settle(`${run.id}-implement`, 'failed', undefined, undefined, reasons);
    if (reasons.at(-1) === 'unsigned') await nudgedUnsigned(b, run.id);
    return { ...b, run };
  };
  const cases = [
    {
      reasons: ['unsigned', 'lost'],
      asked: true,
      word: 'failed',
      outcome: 'failed',
      onYou: [],
      told: "The last try's session ended `failed` before it signed off.",
    },
    {
      reasons: ['lost', 'unsigned'],
      asked: 'unsigned',
      word: 'unsigned',
      outcome: 'blocked',
      onYou: ['implement'],
      told: 'The last try ended without the closeout the run asked for',
    },
  ];
  for (const { reasons, asked, word, outcome, onYou, told } of cases) {
    const b = await through(reasons);
    const taskId = `${b.run.id}-implement`;
    const views = new Map([[taskId, await Effect.runPromise(b.e.view(taskId))]]);
    assert.deepEqual(
      views.get(taskId)!.state.attempts.map((a) => a.reason),
      reasons,
      "two attempts on the view of the first try's task; unsigned, the step is on the run's nudge after it",
    );
    assert.deepEqual([phaseOfView(views.get(taskId)), closeoutAsked(views)(taskId)], ['failed', asked], word);
    const l = await runWith(b.e, list(b.e, readRun(b.run.id)));
    assert.deepEqual([l.steps[0].status, l.waitingOnYou], [word, onYou], word);
    const { decision: d } = await runWith(b.e, decideRun(b.run.id));
    assert.deepEqual(
      d.kind === 'awaiting' && { outcome: d.outcome, unsigned: d.unsigned, failed: d.failed },
      { outcome, unsigned: word === 'unsigned' ? ['implement'] : [], failed: word === 'failed' ? ['implement'] : [] },
      word,
    );
    await runWith(b.e, retryRun(b.run.id, 'implement', { mode: 'nudge' }));
    assert.deepEqual((await runWith(b.e, advanceRun(readRun(b.run.id)))).tried, ['implement'], word);
    const now = readRun(b.run.id).steps.implement.taskId!;
    assert.ok(b.tasks.get(now)!.spec.brief.includes(told), `${word}: the try is told ${told}`);
  }
});

test('a run frozen before stage 4a part 2 with a step of `maxAttempts: 2` still loads, lists and files — with no count, which the runtime would refuse', async () => {
  const run = await started(folder());
  const file = path.join(ROOT, 'runs', `${run.id}.json`);
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));
  record.workflow = record.workflow.map((s: { name: string }) => (s.name === 'implement' ? { ...s, maxAttempts: 2 } : s));
  fs.writeFileSync(file, JSON.stringify(record));
  const frozen: Record<string, unknown> = readRun(run.id).workflow!.find((s) => s.name === 'implement')!;
  assert.equal(frozen.maxAttempts, 2, 'the key is on the frozen step, read as a key the type does not know: no step has it now');

  const b = board();
  assert.deepEqual((await runWith(b.e, advanceRun(readRun(run.id)))).filed, ['implement']);
  const spec = b.tasks.get(`${run.id}-implement`)!.spec;
  assert.equal('maxAttempts' in spec, false, 'filed without it');
  assert.equal((await runWith(b.e, list(b.e, readRun(run.id)))).steps[0].status, 'pending');
  b.settle(`${run.id}-implement`, 'failed');
  assert.equal((await runWith(b.e, list(b.e, readRun(run.id)))).steps[0].status, 'failed');
  await runWith(b.e, retryRun(run.id, 'implement', { mode: 'fresh' }));
  assert.deepEqual((await runWith(b.e, advanceRun(readRun(run.id)))).tried, ['implement'], 'and a try of it is filed as any is');
  assert.equal('maxAttempts' in b.tasks.get(`${run.id}-implement-try2`)!.spec, false);
});

test("open issue 5, the orchestrator's now: a `--nudge` of a try whose session could not start continues the session that try was filed to continue — the runtime no longer does", async () => {
  const run = await started(folder());
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  b.settle(`${run.id}-implement`, 'failed');
  await runWith(b.e, retryRun(run.id, 'implement', { mode: 'nudge' }));
  assert.deepEqual((await runWith(b.e, advanceRun(readRun(run.id)))).tried, ['implement']);
  const first = `native-${run.id}-implement`;
  assert.equal(b.tasks.get(`${run.id}-implement-try2`)!.spec.resumeFrom, first);

  const view = b.e.view;
  Object.assign(b.e, {
    view: (id: string) =>
      Effect.map(view(id), (v) => {
        if (id !== `${run.id}-implement-try2`) return v;
        const attempt = { n: 1, ended: 'failed', reason: 'unstartable', nativeId: null, resumeFrom: first, exitCode: null, usage: null };
        return { ...v, state: { ...v.state, attempts: [attempt] } } as typeof v;
      }),
  });
  b.settle(`${run.id}-implement-try2`, 'failed');
  await runWith(b.e, retryRun(run.id, 'implement', { mode: 'nudge' }));
  assert.deepEqual((await runWith(b.e, advanceRun(readRun(run.id)))).tried, ['implement']);
  assert.equal(
    b.tasks.get(`${run.id}-implement-try3`)!.spec.resumeFrom,
    first,
    "try 2's `--resume` was refused before a session ran, its one attempt `unstartable` with no id of its own: the chain try 2 was " +
      'filed to continue, not a new session',
  );
});

test("`nemia retry --message` writes the answer on the person's ask and nothing else; the tick carries it into the try's brief as `## Your answer`, once, and `nemia ls` says the try was answered", async () => {
  const run = await started(folder());
  const { e, tasks, filings, settle } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-implement`, 'succeeded', {
    outcome: 'blocked',
    summary: 'two readings',
    artifacts: [],
    needs: 'Rename --flag, or keep it?',
  });
  await runWith(e, advanceRun(readRun(run.id)));

  const answer = 'Keep it.\nThe flag is public: say so in the README.';
  const record = fs.readFileSync(path.join(ROOT, 'runs', `${run.id}.json`), 'utf8');
  const { ask, file } = await runWith(e, retryRun(run.id, 'implement', { mode: 'nudge', message: answer }));
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { step: 'implement', try: 2, mode: 'nudge', message: answer, at: ask.at });
  assert.equal(fs.readFileSync(path.join(ROOT, 'runs', `${run.id}.json`), 'utf8'), record, 'the verb writes no record');
  assert.equal(
    (await runWith(e, list(e, readRun(run.id)))).steps[0].note,
    'try 2 asked (--nudge, with your answer) — the next tick files it',
  );

  const pass = await runWith(e, advanceRun(readRun(run.id)));
  const try2 = `${run.id}-implement-try2`;
  assert.deepEqual(pass.tried, ['implement']);
  assert.ok(pass.notes.includes('implement: try 2 — nemia retry --nudge, with your answer'), pass.notes.join('\n'));
  const brief = tasks.get(try2)!.spec.brief;
  assert.match(brief, /^## Try 2\n\nThe last try signed off `blocked`\./, 'its session continued, told why it is back');
  assert.ok(brief.includes(`\n\n## Your answer\n\n\`\`\`text\n${answer}\n\`\`\``), brief);
  assert.equal(readRun(run.id).steps.implement?.tries?.[0]?.then, 'nudge');
  assert.ok(
    !fs.readFileSync(path.join(ROOT, 'runs', `${run.id}.json`), 'utf8').includes('say so in the README'),
    'the record keeps no message',
  );
  assert.deepEqual(asksOf(run.id), [], 'consumed');

  settle(try2, 'running');
  assert.equal(
    (await runWith(e, list(e, readRun(run.id)))).steps[0].note,
    'try 2, nudged on your word, answered',
    'read off the consumed ask',
  );
  assert.deepEqual(readAnswers(run.id), [{ ...ask }]);
  await runWith(e, advanceRun(readRun(run.id)));
  assert.equal(filings.filter((f) => f === try2).length, 1, 'honoured once');
});

test('REFUSED: `nemia retry` with an empty --message, or --message on --recheck — exit 2, by name, and no ask written; the CLI refuses before it reads a run', async () => {
  const { run, e } = await throughCheck('check: npm test', 'stopped');
  await assert.rejects(runWith(e, retryRun(run.id, 'implement', { mode: 'nudge', message: ' \n' })), refusedWith(/^--message is empty/));
  await assert.rejects(
    runWith(e, retryRun(run.id, 'implement', { mode: 'recheck', message: 'the suite is fixed' })),
    refusedNaming('Conflict', `nemia retry ${run.id} implement --recheck`, `nemia retry ${run.id} implement --message "<answer>"`),
  );
  assert.deepEqual(asksOf(run.id), []);
  await runWith(e, retryRun(run.id, 'implement', { mode: 'fresh', message: 'main has the fix for the flake' }));
  assert.deepEqual(
    asksOf(run.id),
    ['retry-implement-2'],
    'a message to a step whose check did not finish is not refused: it did not sign off blocked, and a person may have something to say',
  );

  for (const [flags, pattern] of [
    [
      ['--message', ''],
      '--message is empty, and an empty answer tells the step nothing. Say what the step needs to hear — nemia retry no-such-run implement --message "<answer>" — or leave --message out.',
    ],
    [
      ['--recheck', '--message', 'the second reading'],
      "--message carries your answer into the try's brief, and --recheck files no session to read it — it runs the check again, and nothing else. " +
        'Recheck without a message (nemia retry no-such-run implement --recheck), or give the answer to a session: nemia retry no-such-run implement --message "<answer>".',
    ],
    [['--message'], /^--message takes what to tell the step, quoted/],
    [
      ['--message', '--fresh'],
      /^--message takes what to tell the step, and --fresh is one of nemia retry's own flags, so the answer was left out: .*give it as --message=--fresh\.$/,
    ],
    [['--nudge', '--message', '--model', 'opus'], /^--message takes what to tell the step, and --model is one of nemia retry's own flags/],
    [
      ['--message=', '--fresh'],
      '--message is empty, and an empty answer tells the step nothing. Say what the step needs to hear — nemia retry no-such-run implement --message "<answer>" — or leave --message out.',
    ],
    [['--message=a', '--message', 'b'], /^nemia retry takes --message once/],
  ] as const) {
    await assert.rejects(main(['retry', 'no-such-run', 'implement', ...flags]), refusedAs(pattern), flags.join(' '));
  }
});

test('`nemia retry --message` takes the next argument as the answer whatever it starts with — an answer about a flag names it — and `--message=<answer>` too', async (t) => {
  t.mock.method(console, 'log', () => {});
  const asked = async (...flags: string[]) => {
    const { run, e } = await throughCheck('check: npm test', 'stopped');
    await main(['retry', run.id, 'implement', ...flags], e);
    const { step: _, try: __, at: ___, ...how } = JSON.parse(fs.readFileSync(path.join(asksDir(run.id), 'retry-implement-2'), 'utf8'));
    return how;
  };
  assert.deepEqual(
    await asked('--message', '--flag stays; say so in the README'),
    { mode: 'nudge', message: '--flag stays; say so in the README' },
    'the ask file says how, after `nemia retry` with these flags',
  );
  assert.deepEqual(await asked('--fresh', '--message', '-n is short for --dry-run'), {
    mode: 'fresh',
    message: '-n is short for --dry-run',
  });
  assert.deepEqual(await asked('--message=--fresh'), { mode: 'nudge', message: '--fresh' }, "a flag's name, as the whole answer");
  assert.deepEqual(await asked('--message=keep --flag=on', '--model', 'opus'), { mode: 'fresh', model: 'opus', message: 'keep --flag=on' });
});

test('REFUSED at read: an ask file whose message is not text, is empty, or rides on a recheck is not honoured — and one written before messages reads as it always did', async () => {
  const { run, e, filings } = await throughCheck('check: npm test', 'stopped');
  const at = '2026-09-13T10:00:00.000Z';
  fs.mkdirSync(asksDir(run.id), { recursive: true });
  const refused = {
    'retry-implement-2': [{ mode: 'nudge', message: 42, at }, 'its message is not text'],
    'retry-implement-3': [{ mode: 'fresh', message: ' ', at }, 'its message is empty'],
    'retry-review-2': [
      { mode: 'recheck', message: 'the suite is fixed', at },
      'it carries a message and asks for a recheck, which files no session to read it',
    ],
  } as const;
  for (const [name, [held]] of Object.entries(refused)) fs.writeFileSync(path.join(asksDir(run.id), name), JSON.stringify(held));
  const pass = await runWith(e, advanceRun(readRun(run.id)));
  assert.deepEqual(pass.tried, []);
  for (const [name, [, why]] of Object.entries(refused)) {
    assert.ok(
      pass.notes.some((n) => n.endsWith(`${name}: ${why}, so it is not honoured — remove it, and ask with nemia retry`)),
      pass.notes.join('\n'),
    );
  }
  assert.deepEqual([readAsks(run.id).asks, readAnswers(run.id)], [[], []]);
  assert.equal(filings.length, 2);

  for (const name of Object.keys(refused)) fs.rmSync(path.join(asksDir(run.id), name));
  const legacy = { step: 'implement', try: 2, mode: 'recheck', at };
  fs.writeFileSync(path.join(asksDir(run.id), 'retry-implement-2'), `${JSON.stringify(legacy, null, 2)}\n`);
  assert.deepEqual(
    readAsks(run.id),
    { asks: [legacy], rounds: [], notes: [] },
    'the shape `nemia retry` wrote before --message is read with no message, and honoured',
  );
  assert.deepEqual(readAnswers(run.id), []);
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).tried, ['implement']);
});

/** A workflow of one step, `implement`: its branch is the run's result. */
const oneStep = () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'one-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  return dir;
};

/**
 * A run another will wait on, on the board its child is ticked on — one engine, as in life: started for real, with worktrees, and its
 * step filed. With `work`, a file committed on its branch; with `signed` — by default, when there is work — its step signed off.
 */
const aParent = async (
  repo: string,
  b: ReturnType<typeof board>,
  {
    work,
    signed = Boolean(work),
    workflowDir,
    brief = 'the parent',
  }: { work?: string; signed?: boolean; workflowDir?: string; brief?: string } = {},
) => {
  const run = repositoryRunOf(await runPlaced(startRun({ brief, repo, workflowDir: workflowDir ?? oneStep() })));
  await runWith(b.e, advanceRun(readRun(run.id)));
  const wt = readRun(run.id).steps.implement.workspace!;
  if (work) {
    fs.writeFileSync(path.join(wt, work), `${work}\n`);
    world().commit(wt, `add ${work}`);
  }
  if (signed) b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  return { run, wt, branch: readRun(run.id).steps.implement.branch! };
};

const runsWritten = () => fs.readdirSync(path.join(ROOT, 'runs')).length;
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

test("REFUSED at shipped defaults: a run whose parent has not shipped files nothing, tick after tick, and says `waiting on <parent>` — merged while it still runs, nothing; signed off and on the base, the next tick files its roots, from a base with the parent's work", async () => {
  const repo = aRepo();
  const c = board();
  const p = await aParent(repo, c);
  const child = await runPlaced(startRun({ brief: 'the child', repo, workflowDir: folder(), after: [p.run.id] }));
  assert.deepEqual(readRun(child.id).after, [p.run.id], 'frozen on the record');
  const filings = [...c.filings];
  for (let pass = 0; pass < 3; pass++) {
    const r = await runWith(c.e, advanceRun(readRun(child.id)));
    assert.deepEqual(
      [r.filed, c.filings, r.waiting],
      [[], filings, [{ run: p.run.id }]],
      `pass ${pass + 1}: filed and still running, the parent's branch sits at its base, on the base branch, which is not shipped`,
    );
  }
  fs.writeFileSync(path.join(p.wt, 'parent.txt'), 'parent.txt\n');
  world().commit(p.wt, 'add parent.txt');
  assert.deepEqual(
    (await runWith(c.e, advanceRun(readRun(child.id)))).filed,
    [],
    'the step did its work on its branch: still running, and not on the base branch',
  );
  assert.equal((await runWith(c.e, parentNow(p.run.id))).shipped, false);

  await aPass(c.e);
  assert.deepEqual(
    (await runWith(c.e, list(c.e, readRun(child.id)))).steps.map((s) => s.status),
    [`waiting on ${p.run.id}`, 'waiting'],
  );
  const d = await runWith(c.e, decideRun(child.id));
  assert.deepEqual(
    [d.waiting, d.offers, d.retrying, d.rounding],
    [[{ run: p.run.id }], [], [], []],
    '`nemia decide` says the same, and offers nothing else',
  );

  mergedByHand(repo, p.branch, 'Merge the parent');
  const tip = world().head(repo);
  assert.equal(
    (await runWith(c.e, decideRun(p.run.id))).decision.kind,
    'running',
    "merged by a person while its session still runs: on the base branch, and not decided, the parent's `nemia decide` says still running",
  );
  assert.deepEqual((await runWith(c.e, advanceRun(readRun(child.id)))).filed, [], 'and so does the gate');

  c.settle(`${p.run.id}-implement`, 'succeeded', SIGNED);
  assert.deepEqual(
    (await runWith(c.e, decideRun(p.run.id))).decision,
    { kind: 'shipped', branches: [p.branch] },
    "signed off, its `nemia decide` says shipped, and the next tick files the child's roots",
  );
  const r = await runWith(c.e, advanceRun(readRun(child.id)));
  assert.deepEqual([r.filed, r.waiting], [['implement'], []]);
  const now = readRun(child.id);
  assert.notEqual(child.baseRef, tip);
  assert.equal(now.baseRef, tip, 'the base as it stands now, and not as it stood at `nemia start`');
  assert.equal(
    fs.readFileSync(path.join(now.steps.implement.workspace!, 'parent.txt'), 'utf8'),
    'parent.txt\n',
    "so the child's worktree has the parent's work",
  );
  assert.equal(world().head(now.steps.implement.workspace!), tip);
});

test("REFUSED before review, now shipped: a parent whose step signs off with nothing to commit has shipped, as its own `nemia decide` says — its child's next tick files the roots, and `nemia start --after` it is not refused", async () => {
  const repo = aRepo();
  const c = board();
  const p = await aParent(repo, c);
  const child = await runPlaced(startRun({ brief: 'the child of a change already made', repo, workflowDir: folder(), after: [p.run.id] }));
  assert.deepEqual(
    (await runWith(c.e, advanceRun(readRun(child.id)))).filed,
    [],
    'running, with nothing committed: its branch has been on the base branch since it was cut, and that is not shipped',
  );
  assert.equal((await runWith(c.e, decideRun(p.run.id))).decision.kind, 'running');

  c.settle(`${p.run.id}-implement`, 'succeeded', SIGNED);
  assert.equal(
    String(ahead(repo, p.run.baseRef, p.branch)),
    '0',
    'it found the work already done, and signed off with nothing past its base',
  );
  assert.deepEqual((await runWith(c.e, decideRun(p.run.id))).decision, { kind: 'shipped', branches: [p.branch] });
  assert.equal((await runWith(c.e, parentNow(p.run.id))).shipped, true, 'the gate says what its `nemia decide` says');
  const r = await runWith(c.e, advanceRun(readRun(child.id)));
  assert.deepEqual([r.filed, r.waiting], [['implement'], []]);
  assert.deepEqual((await runPlaced(startRun({ brief: 'another child', repo, workflowDir: folder(), after: [p.run.id] }))).after, [
    p.run.id,
  ]);
});

test("REFUSED before review, now shipped: a parent merged and then its branch deleted still ships, by the tip its finished run's own pass recorded — a run that started on the merge files what follows, and one that had not files its roots", async () => {
  const repo = aRepo();
  const c = board();
  const p = await aParent(repo, c, { work: 'parent.txt' });
  assert.equal(readRun(p.run.id).tips, undefined, 'not recorded while it ran');
  await runWith(c.e, advanceRun(readRun(p.run.id)));
  const tip = world().tip(repo, p.branch);
  assert.deepEqual(
    readRun(p.run.id).tips,
    { [p.branch]: tip },
    "the parent's own pass, as `nemia up` makes one over every run: it has finished, so it records its result branch's tip",
  );
  const early = await runPlaced(startRun({ brief: 'the early child', repo, workflowDir: folder(), after: [p.run.id] }));
  const late = await runPlaced(startRun({ brief: 'the late child', repo, workflowDir: folder(), after: [p.run.id] }));
  mergedByHand(repo, p.branch, 'Merge the parent');
  assert.deepEqual((await runWith(c.e, advanceRun(readRun(early.id)))).filed, ['implement']);

  droppedByHand(repo, p.wt, p.branch);
  assert.deepEqual(
    await runWith(c.e, parentNow(p.run.id)),
    { record: readRun(p.run.id), shipped: true },
    'the merge stays, and the branch goes, its worktree first: `git branch -d` refuses a branch a worktree uses',
  );
  assert.deepEqual(
    (await runWith(c.e, decideRun(p.run.id))).decision,
    { kind: 'shipped', branches: [p.branch] },
    'and its own `nemia decide` says the same',
  );
  assert.equal(
    (await runWith(c.e, advanceRun(readRun(p.run.id)))).run.tips?.[p.branch],
    tip,
    'a branch git no longer has keeps the tip last seen',
  );

  c.settle(`${early.id}-implement`, 'succeeded', SIGNED);
  const next = await runWith(c.e, advanceRun(readRun(early.id)));
  assert.deepEqual([next.filed, next.waiting], [['review'], []], 'a run that has started is never gated again');

  const r = await runWith(c.e, advanceRun(readRun(late.id)));
  assert.deepEqual([r.filed, r.waiting], [['implement'], []], 'on the base is shipped');
  assert.deepEqual((await runPlaced(startRun({ brief: 'the latest child', repo, workflowDir: folder(), after: [p.run.id] }))).after, [
    p.run.id,
  ]);
});

test("the diamond's D, after B and C: B merged and its branch deleted while C is still running — D says `waiting on C` alone, and files its roots on the pass after C ships, from a base with both", async () => {
  const repo = aRepo();
  const c = board();
  const b = await aParent(repo, c, { work: 'b.txt' });
  const cc = await aParent(repo, c, { work: 'c.txt', signed: false });
  const d = await runPlaced(startRun({ brief: 'd, after b and c', repo, workflowDir: folder(), after: [b.run.id, cc.run.id] }));
  await runWith(c.e, advanceRun(readRun(b.run.id)));
  mergedByHand(repo, b.branch, 'Merge B');
  droppedByHand(repo, b.wt, b.branch);
  const filings = [...c.filings];
  for (let pass = 0; pass < 2; pass++) {
    const r = await runWith(c.e, advanceRun(readRun(d.id)));
    assert.deepEqual(
      [r.filed, c.filings, r.waiting],
      [[], filings, [{ run: cc.run.id }]],
      `pass ${pass + 1}: B finished, its tip recorded by \`nemia up\`'s pass, and a person shipped it and cleaned up while C is in review`,
    );
  }
  await aPass(c.e);
  assert.deepEqual(
    (await runWith(c.e, list(c.e, readRun(d.id)))).steps.map((s) => s.status),
    [`waiting on ${cc.run.id}`, 'waiting'],
  );

  c.settle(`${cc.run.id}-implement`, 'succeeded', SIGNED);
  mergedByHand(repo, cc.branch, 'Merge C');
  const r = await runWith(c.e, advanceRun(readRun(d.id)));
  assert.deepEqual([r.filed, r.waiting], [['implement'], []], 'C signed off, and a person shipped it');
  const wt = readRun(d.id).steps.implement.workspace!;
  assert.deepEqual(
    ['b.txt', 'c.txt'].map((f) => fs.existsSync(path.join(wt, f))),
    [true, true],
  );
});

test('REFUSED at shipped defaults: a parent dropped unmerged after its tip was recorded, and one merged and deleted before any pass saw it finish, read `(<branch> gone)` — the child files nothing, and `nemia start --after` either is refused', async () => {
  const repo = aRepo();
  const c = board();
  const dropped = await aParent(repo, c, { work: 'dropped.txt' });
  await runWith(c.e, advanceRun(readRun(dropped.run.id)));
  const unseen = await aParent(repo, c, { work: 'unseen.txt' });
  const child = await runPlaced(
    startRun({ brief: 'the child of work that is gone', repo, workflowDir: folder(), after: [dropped.run.id, unseen.run.id] }),
  );
  mergedByHand(repo, unseen.branch, 'Merge the unseen parent');
  for (const p of [dropped, unseen]) {
    droppedByHand(repo, p.wt, p.branch);
  }
  assert.ok(readRun(dropped.run.id).tips?.[dropped.branch], 'the dropped parent had its tip recorded');
  const filings = [...c.filings];
  const r = await runWith(c.e, advanceRun(readRun(child.id)));
  assert.deepEqual(
    [r.filed, c.filings, r.waiting],
    [
      [],
      filings,
      [
        { run: dropped.run.id, gone: [dropped.branch] },
        { run: unseen.run.id, gone: [unseen.branch] },
      ],
    ],
    'no pass over the unseen parent since it signed off: no tip was recorded, and git keeps no trace of what its branch named',
  );
  await aPass(c.e);
  assert.deepEqual(
    (await runWith(c.e, list(c.e, readRun(child.id)))).steps.map((s) => s.status),
    [`waiting on ${dropped.run.id} (${dropped.branch} gone), ${unseen.run.id} (${unseen.branch} gone)`, 'waiting'],
  );
  const before = runsWritten();
  for (const p of [dropped, unseen]) {
    await assert.rejects(
      async () => await runPlaced(startRun({ brief: 'another child', repo, workflowDir: folder(), after: [p.run.id] })),
      refusedWith(
        new RegExp(
          `^--after ${escaped(p.run.id)}: ${escaped(p.branch)} is gone, and git cannot find it on ${escaped(p.run.branch)}, so this run would wait for ever\\.`,
        ),
      ),
    );
  }
  assert.equal(runsWritten(), before);
});

test('REFUSED at shipped defaults: a run whose parent was cancelled files nothing, merged or not, and `nemia ls` and `nemia decide` say `waiting on <parent> (cancelled)` and how to resolve it — which `nemia cancel` does', async (t) => {
  const repo = aRepo();
  const c = board();
  const p = await aParent(repo, c, { work: 'parent.txt' });
  const child = await runPlaced(startRun({ brief: 'the child of a cancelled run', repo, workflowDir: folder(), after: [p.run.id] }));
  const at = markCancelled(p.run.id);
  const filings = [...c.filings];
  for (let pass = 0; pass < 2; pass++) {
    const r = await runWith(c.e, advanceRun(readRun(child.id)));
    assert.deepEqual([r.filed, c.filings, r.waiting], [[], filings, [{ run: p.run.id, cancelledAt: at }]]);
  }
  mergedByHand(repo, p.branch, 'Merge the cancelled parent');
  assert.equal(
    (await runWith(c.e, decideRun(p.run.id))).decision.kind,
    'cancelled',
    "merged all the same, a cancelled run's `nemia decide` says it was cancelled, never shipped",
  );
  assert.deepEqual([(await runWith(c.e, advanceRun(readRun(child.id)))).filed, c.filings], [[], filings], 'and the gate says what it says');

  const printed: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.join(' '));
  });
  await main(['ls', child.id], c.e);
  const ls = printed.join('\n');
  assert.match(ls, new RegExp(`^   implement +waiting on ${escaped(p.run.id)} \\(cancelled\\) *$`, 'm'));
  assert.match(ls, /^   review +waiting *$/m);
  assert.match(
    ls,
    new RegExp(
      `→ waiting on you: ${escaped(p.run.id)} was cancelled at ${escaped(at)}, and a cancelled run never ships — yours to resolve: nemia cancel ${escaped(child.id)}, or start the work again without --after ${escaped(p.run.id)}$`,
      'm',
    ),
  );

  printed.length = 0;
  await main(['decide', child.id], c.e);
  assert.deepEqual(printed.join('\n').split('\n').slice(1), [
    '',
    `  waiting on ${p.run.id} (cancelled)`,
    `  ${p.run.id} was cancelled at ${at}, and a cancelled run never ships — yours to resolve: nemia cancel ${child.id}, or start the work again without --after ${p.run.id}`,
  ]);

  assert.equal((await runWith(c.e, cancelRun(child.id))).plan.kind, 'cancel');
  assert.deepEqual(
    (await runWith(c.e, list(c.e, readRun(child.id)))).steps.map((s) => s.status),
    ['waiting', 'waiting'],
    'a person resolves it: the child called off waits on nothing, and files nothing',
  );
  assert.deepEqual([(await runWith(c.e, advanceRun(readRun(child.id)))).filed, c.filings], [[], filings]);
});

test("REFUSED by name at shipped defaults: a file at an ask's name that is not an ask — `nemia retry` and `nemia round` name it and say to delete it, never to wait for an ask no pass honours", async () => {
  const { run, e, filings } = await throughCheck('check: npm test', 'failed', 1);
  const file = path.join(asksDir(run.id), 'retry-implement-2');
  fs.mkdirSync(asksDir(run.id), { recursive: true });
  fs.writeFileSync(file, '{}');
  assert.equal((await runWith(e, list(e, readRun(run.id)))).steps[0].note, undefined, '`nemia ls` shows nothing asked');
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).tried, [], 'and no pass honours it');
  await assert.rejects(
    runWith(e, retryRun(run.id, 'implement', { mode: 'nudge' })),
    refusedWith(
      new RegExp(
        `^try 2 of implement cannot be asked for: ${escaped(file)} is already there, and it is not an ask — it asks for no mode nemia retry knows \\(undefined\\)\\. ` +
          `No tick honours it, and nemia ls shows nothing asked, so waiting would be for ever\\. Delete it \\(rm ${escaped(file)}\\), then ask again: nemia retry ${escaped(run.id)} implement\\.$`,
      ),
    ),
  );
  assert.equal(fs.readFileSync(file, 'utf8'), '{}', 'not written over');
  assert.equal(filings.length, 2);
  fs.rmSync(file);
  await runWith(e, retryRun(run.id, 'implement', { mode: 'nudge' }));
  assert.deepEqual(
    (await runWith(e, advanceRun(readRun(run.id)))).tried,
    ['implement'],
    'deleted, as the refusal says: the ask is written, and the next pass honours it',
  );

  const looping = await started(looped('rounds: 1\n'));
  const b = board();
  await runWith(b.e, advanceRun(readRun(looping.id)));
  await toReview(b, looping.id, 1, true);
  assert.deepEqual((await runWith(b.e, advanceRun(readRun(looping.id)))).looped, [], 'out of rounds, on the first');
  const roundFile = path.join(asksDir(looping.id), 'round-review-2');
  fs.mkdirSync(asksDir(looping.id), { recursive: true });
  fs.writeFileSync(roundFile, '[]');
  await assert.rejects(
    runWith(b.e, roundRun(looping.id)),
    refusedWith(
      new RegExp(
        `^round 2 of review's loop cannot be asked for: ${escaped(roundFile)} is already there, and it is not an ask — it is not an ask nemia round wrote\\. .*Delete it \\(rm ${escaped(roundFile)}\\), then ask again: nemia round ${escaped(looping.id)} review\\.$`,
      ),
    ),
  );
  assert.equal(fs.readFileSync(roundFile, 'utf8'), '[]');
});

test("REFUSED at shipped defaults: a one-step run whose step failed with nothing committed reads failed, not shipped, and a run `--after` it files nothing — with its work merged onto the base, a failed step's run is shipped, and its child starts", async () => {
  const repo = aRepo();
  const c = board();
  const p = await aParent(repo, c);
  c.settle(`${p.run.id}-implement`, 'failed');
  await runWith(c.e, advanceRun(readRun(p.run.id)));
  assert.equal(
    String(ahead(repo, p.run.baseRef, p.branch)),
    '0',
    'its own pass had nothing to hand off, and recorded its tip: nothing past its base',
  );
  assert.ok(commitsOf(repo, p.run.branch).includes(world().tip(repo, p.branch)!), 'and so on the base branch, as its place reads it');
  const d = (await runWith(c.e, decideRun(p.run.id))).decision;
  assert.deepEqual(
    d.kind === 'awaiting' && [d.outcome, d.failed, d.branches],
    ['failed', ['implement'], [p.branch]],
    '`nemia decide` shows the failure',
  );
  assert.equal((await runWith(c.e, parentNow(p.run.id))).shipped, false);
  const child = await runPlaced(startRun({ brief: 'the child of a failure', repo, workflowDir: folder(), after: [p.run.id] }));
  for (let pass = 0; pass < 3; pass++) {
    const r = await runWith(c.e, advanceRun(readRun(child.id)));
    assert.deepEqual([r.filed, r.waiting], [[], [{ run: p.run.id }]], `pass ${pass + 1}`);
  }

  const q = await aParent(repo, c, { work: 'kept.txt', signed: false });
  c.settle(`${q.run.id}-implement`, 'failed');
  const before = await runWith(c.e, decideRun(q.run.id));
  assert.deepEqual(before.decision.kind === 'awaiting' && before.decision.outcome, 'failed', 'not merged yet: decided');
  mergedByHand(repo, q.branch, 'Merge the work of a failed step');
  assert.deepEqual(
    (await runWith(c.e, decideRun(q.run.id))).decision,
    { kind: 'shipped', branches: [q.branch] },
    'its step failed, and a person merged what it committed: shipped, whatever the step said',
  );
  const next = await runPlaced(startRun({ brief: 'the child of merged work', repo, workflowDir: folder(), after: [q.run.id] }));
  assert.deepEqual((await runWith(c.e, advanceRun(readRun(next.id)))).filed, ['implement']);
});

/** A board whose views carry a stop once it is asked for, as the engine's record does: `stopRequested` from then on. */
const recordingStops = (b: ReturnType<typeof board>): Engine => ({
  ...b.e,
  view: (id: string) => Effect.map(b.e.view(id), (v) => ({ ...v, state: { ...v.state, stopRequested: b.stopped.includes(id) } })),
});

test('REFUSED before, now accepted at shipped defaults: `nemia retry` on a step whose session its harness blocked, with nothing signed — the tick stops the session, files nothing while it stops, and once it has, files the try as a nudge that continues it', async (t) => {
  const run = await started(folder());
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  const taskId = `${run.id}-implement`;
  b.settle(taskId, 'needs-human' as TaskPhase);
  const e = recordingStops(b);

  await assert.rejects(runWith(e, retryRun(run.id, 'implement', { mode: 'nudge' })), refusedWith(/^implement is still running/));
  assert.deepEqual(
    asksOf(run.id),
    [],
    "`needs-human` is the engine's word for a session its harness blocked, running, nothing signed: asked for through the API, it is refused",
  );

  const printed: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.join(' '));
  });
  await main(['retry', run.id, 'implement'], e);
  assert.deepEqual(asksOf(run.id), ['retry-implement-2'], '`nemia retry`, as a person types it, asks');
  assert.equal(
    printed[0],
    `${run.id}  asked: try 2 of implement (--nudge) — its harness blocked its session: the next tick stops it, and files the try once it has stopped`,
  );
  assert.deepEqual(
    (await runWith(e, list(e, readRun(run.id)))).steps[0],
    {
      name: 'implement',
      status: 'needs-human',
      branch: run.branch,
      note: 'try 2 asked (--nudge) — stopping its blocked session, then the tick files it',
    },
    'this harness says nothing about what it waits for: the phase alone, as before',
  );

  const record = fs.readFileSync(path.join(ROOT, 'runs', `${run.id}.json`), 'utf8');
  const first = await runWith(e, advanceRun(readRun(run.id)));
  assert.deepEqual(
    [b.stopped, first.tried, first.filed, first.status],
    [[taskId], [], [], 'running'],
    'the session asked to stop, and nothing filed',
  );
  assert.ok(
    first.notes.some((n) =>
      n.startsWith('implement: try 2 — nemia retry --nudge; its harness blocked its session, so the engine is asked to stop it'),
    ),
    first.notes.join('\n'),
  );
  assert.equal(fs.readFileSync(path.join(ROOT, 'runs', `${run.id}.json`), 'utf8'), record, 'the record untouched');
  assert.deepEqual(asksOf(run.id), ['retry-implement-2'], 'the ask waits for its try');

  for (const engineOf of [() => e, () => recordingStops(b)]) {
    const again = await runWith(engineOf(), advanceRun(readRun(run.id)));
    assert.deepEqual(
      [b.stopped, again.tried, again.filed, again.notes],
      [[taskId], [], [], []],
      'passes while the engine stops it, the second on a board read afresh as after a restart: nothing carried, no second stop, nothing filed',
    );
  }

  b.settle(taskId, 'stopped');
  const filed = await runWith(e, advanceRun(readRun(run.id)));
  const try2 = `${run.id}-implement-try2`;
  assert.deepEqual(
    [filed.tried, b.filings],
    [['implement'], [taskId, try2]],
    'settled stopped, the next pass files try 2 as it files one for a stopped step: a nudge that continues the session',
  );
  const spec = b.tasks.get(try2)!.spec;
  assert.equal(spec.resumeFrom, `native-${taskId}`, 'the blocked session, continued');
  assert.match(
    spec.brief,
    /^## Try 2\n\nThe last try's session was stopped before it signed off\.\nA person asked for this try: `nemia retry --nudge`\./,
  );
  assert.deepEqual(readRun(run.id).steps.implement?.tries, [{ taskId, then: 'nudge' }]);
  assert.deepEqual(asksOf(run.id), [], 'consumed');
  const after = await runWith(e, advanceRun(readRun(run.id)));
  assert.deepEqual([after.tried, b.stopped, b.filings.filter((f) => f === try2).length], [[], [taskId], 1], 'once');
});

test('a step whose harness blocked its session says what the harness waits for — on `nemia ls` and on `nemia decide`, read afresh each pass', async (t) => {
  const run = await started(folder());
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  const taskId = `${run.id}-implement`;
  b.settle(taskId, 'needs-human' as TaskPhase);
  b.waiting.set(taskId, 'permission prompt');
  const step = async () => (await runWith(b.e, list(b.e, readRun(run.id)))).steps[0];
  const status = async () => shownStatus(await step());
  const printed: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.join(' '));
  });
  const decided = async () => {
    printed.length = 0;
    await main(['decide', run.id], b.e);
    return printed.join('\n');
  };

  assert.equal(await status(), 'needs-human: waiting for a permission prompt', '`nemia ls`: beside the phase');
  assert.equal((await step()).status, 'needs-human', 'and the status every reader compares is the bare word');
  assert.match(
    await decided(),
    new RegExp(`\n {2}implement: waiting for a permission prompt — answer it in Claude Code: claude agents, session ae/${taskId}/1$`, 'm'),
    '`nemia decide`: the word, and where a person answers it',
  );

  b.waiting.set(taskId, 'workspace trust dialog');
  assert.equal(
    await status(),
    'needs-human: waiting for a workspace trust dialog',
    'level-triggered: the word is read on the pass that prints it, and nothing of the last one is kept',
  );
  assert.doesNotMatch(await decided(), /permission prompt/, 'the old word is nowhere');

  b.waiting.delete(taskId);
  assert.equal(await status(), 'needs-human', 'a harness that stops saying leaves the step reading as it did before any of this');
  assert.doesNotMatch(await decided(), /answer it in Claude Code/, 'no word, no line');
});

test('a step that says `denials: fail`, denied a call, is stopped: nothing after it filed, `nemia decide` names the rule for `allowedTools:` and offers `--fresh`, whose try is told what was denied — and a clean try hands on', async (t) => {
  const run = await started(folder('denials: fail'));
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  const taskId = `${run.id}-implement`;
  b.denials.set(taskId, [{ tool: 'Write', what: '/tmp/w/notes.md' }]);
  b.settle(taskId, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(run.id)));
  await runWith(b.e, advanceRun(readRun(run.id)));
  assert.deepEqual(b.filings, [taskId], 'nothing after it is filed, however many passes');
  const printed: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.join(' '));
  });
  const printedBy = async (...args: string[]) => {
    printed.length = 0;
    await main(args, b.e);
    return printed.join('\n');
  };

  const listed = await runWith(b.e, list(b.e, readRun(run.id)));
  assert.deepEqual(
    [listed.steps[0].status, shownNote(listed.steps[0]), listed.waitingOnYou],
    ['denied', 'denied: Write(/tmp/w/notes.md)', ['implement']],
  );
  const decided = await printedBy('decide', run.id);
  assert.match(decided, /\n {2}DENIED, waiting on you: implement {2}— its harness denied its try a call/);
  assert.match(
    decided,
    new RegExp(
      `add Edit\\(//tmp/w/notes\\.md\\) to the folder's allowedTools:, .* told to do without it: {2}nemia retry ${run.id} implement --fresh {2}\\(`,
    ),
  );

  await main(['retry', run.id, 'implement', '--fresh'], b.e);
  await runWith(b.e, advanceRun(readRun(run.id)));
  const again = b.filings.at(-1)!;
  assert.notEqual(again, taskId, 'a new task for try 2');
  const brief = (b.tasks.get(again)!.spec as { brief: string }).brief;
  assert.match(brief, /## What your session was denied\n\n```text\nWrite\(\/tmp\/w\/notes\.md\)\n```/);
  assert.match(brief, /the same call will be denied again/);

  b.settle(again, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(run.id)));
  assert.equal(b.filings.at(-1), `${run.id}-review`, 'denied nothing, it hands on');
});

test('REFUSED at shipped defaults: `nemia retry` on a step whose session still works, `--recheck` on one its harness blocked, and one that signed off and runs on — exit 2, and no ask written', async () => {
  const run = await started(folder());
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  b.settle(`${run.id}-implement`, 'running');
  await assert.rejects(
    main(['retry', run.id, 'implement'], b.e),
    refusedNaming('Conflict', 'implement is still running', `nemia ls ${run.id}`, `nemia cancel ${run.id}`),
  );
  await assert.rejects(main(['retry', run.id, 'implement', '--fresh'], b.e), refusedWith(/^implement is still running/));
  b.settle(`${run.id}-implement`, 'needs-human' as TaskPhase);
  await assert.rejects(
    main(['retry', run.id, 'implement', '--recheck'], b.e),
    refusedNaming('Conflict', 'implement is running', 'no check of it failed', `nemia retry ${run.id} implement`, '--fresh'),
  );
  b.settle(`${run.id}-implement`, 'needs-human' as TaskPhase, SIGNED);
  await assert.rejects(main(['retry', run.id, 'implement'], b.e), refusedWith(/^implement is still running/));
  assert.deepEqual([asksOf(run.id), b.stopped], [[], []]);
});

/** A card's text: its frontmatter keys, and its body. */
const cardText = (keys: string, body: string) => `---\n${keys}\n---\n${body}\n`;

/** A plan folder holding these files, by name — a function of the folder, so a card can name a workflow by a path from it. */
const aPlan = (files: (dir: string) => Record<string, string>): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'plan-'));
  for (const [file, text] of Object.entries(files(dir))) fs.writeFileSync(path.join(dir, file), text);
  return dir;
};

/** A repository with a workflow of one step under its workflows/, by name. */
const aRepoWith = (name: string): { repo: string; dir: string } => {
  const repo = aRepo();
  const dir = path.join(repo, 'workflows', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  return { repo, dir };
};

test('`nemia plan` on the diamond starts four runs, parents first, each `after` the runs of the cards it names — the record `nemia start --after` writes, and nothing else — prints a line per card, and `nemia ls` says D waits on B and C', async (t) => {
  const { repo, dir: dev } = aRepoWith('dev');
  const other = oneStep();
  const b = board();
  const plan = aPlan((dir) => ({
    'README.md': '# The flag\n\nParse it, then document and store it, then show it.\n',
    'd.md': cardText('workflow: dev\nafter: b, c', 'Show the flag on the settings page'),
    'c.md': cardText('workflow: dev\nafter: a', 'Store the flag'),
    'b.md': cardText(`# a workflow by a path from the plan folder\nworkflow: ${path.relative(dir, other)}\nafter: a`, 'Document the flag'),
    'a.md': cardText('workflow: dev', 'Parse the flag'),
  }));
  const before = runsWritten();
  const printed: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.join(' '));
  });
  await main(['plan', plan, '--repo', repo], b.e);

  assert.equal(runsWritten(), before + 4, 'four runs, and no file of the plan');
  const ids: Record<string, string> = Object.fromEntries(printed.slice(0, 4).map((line) => line.split(/ +/).slice(0, 2)));
  assert.deepEqual(Object.keys(ids), ['a', 'b', 'c', 'd'], 'parents first');
  const record = (card: string) => readRun(ids[card]);
  assert.deepEqual(
    ['a', 'b', 'c', 'd'].map((card) => record(card).after),
    [undefined, [ids.a], [ids.a], [ids.b, ids.c]],
  );
  assert.deepEqual(
    ['a', 'b', 'c', 'd'].map((card) => record(card).brief),
    ['Parse the flag', 'Document the flag', 'Store the flag', 'Show the flag on the settings page'],
  );
  assert.deepEqual(
    ['a', 'b', 'c', 'd'].map((card) => record(card).workflowDir),
    [dev, other, dev, dev],
  );
  assert.match(printed[0], new RegExp(`^a  ${escaped(ids.a)} +dev +waits on nothing$`));
  assert.match(
    printed[1],
    new RegExp(`^b  ${escaped(ids.b)} +${escaped(path.relative(plan, other))}  waits on a \\(${escaped(ids.a)}\\)$`),
  );
  assert.match(printed[3], new RegExp(`^d  ${escaped(ids.d)} +dev +waits on b \\(${escaped(ids.b)}\\), c \\(${escaped(ids.c)}\\)$`));
  assert.deepEqual(printed.slice(4), ["run 'nemia tick' (or 'nemia up') to start them"]);

  await aPass(b.e);
  assert.deepEqual(
    (await runWith(b.e, list(b.e, record('d')))).steps.map((s) => s.status),
    [`waiting on ${ids.b}, ${ids.c}`],
  );
  printed.length = 0;
  await main(['ls', ids.d], b.e);
  assert.match(printed.join('\n'), new RegExp(`^   implement +waiting on ${escaped(ids.b)}, ${escaped(ids.c)} *$`, 'm'));

  assert.deepEqual((await runWith(b.e, advanceRun(record('a')))).filed, ['implement'], 'the tick does the waiting: a is filed');
  for (const card of ['b', 'c', 'd']) assert.deepEqual((await runWith(b.e, advanceRun(record(card)))).filed, [], `${card} waits on a`);
});

test("REFUSED at shipped defaults, before the first `start()`: `nemia plan` on a folder whose second card's workflow does not load starts nothing — the workflow's own refusal, behind the card — nor on a workflow that is not there, a cycle, a folder inside the plan, a folder with no card, or no folder", async () => {
  const repo = aRepo();
  const b = board();
  const broken = fs.mkdtempSync(path.join(ROOT, 'broken-'));
  fs.writeFileSync(path.join(broken, 'implement.md'), '---\nplace: git\nafer: plan\n---\nimplement it\n');
  const first = oneStep();
  const plan = aPlan(() => ({
    'a.md': cardText(`workflow: ${first}`, 'the first card'),
    'b.md': cardText(`workflow: ${broken}\nafter: a`, 'the second card'),
  }));
  const before = runsWritten();
  const planned = () => main(['plan', plan, '--repo', repo], b.e);
  await assert.rejects(
    planned(),
    refusedWith(new RegExp(`^b\\.md: \`workflow: ${escaped(broken)}\` — implement: \`afer\` is not a key a step has\\.`)),
  );
  assert.equal(runsWritten(), before, 'not even the first card');

  fs.writeFileSync(path.join(plan, 'b.md'), cardText('workflow: nope\nafter: a', 'the second card'));
  await assert.rejects(
    planned(),
    refusedWith(
      new RegExp(
        `^b\\.md: \`workflow: nope\` — no workflow folder at ${escaped(path.join(plan, 'nope'))}, nor a workflow named nope in ${escaped(path.join(repo, 'workflows'))}\\.`,
      ),
    ),
  );
  fs.writeFileSync(path.join(plan, 'b.md'), cardText(`workflow: ${first}\nafter: c`, 'the second card'));
  fs.writeFileSync(path.join(plan, 'c.md'), cardText(`workflow: ${first}\nafter: b`, 'the third card'));
  await assert.rejects(planned(), refusedNaming('Invalid', 'b.md, c.md wait on each other', 'b after c, c after b', '`after:`'));
  fs.rmSync(path.join(plan, 'c.md'));
  fs.writeFileSync(path.join(plan, 'b.md'), cardText(`workflow: ${first}\nafter: a`, 'the second card'));
  fs.mkdirSync(path.join(plan, 'drafts'));
  await assert.rejects(planned(), refusedWith(new RegExp(`^drafts/ in ${escaped(plan)}: not a card\\.`)));
  const empty = aPlan(() => ({ 'README.md': '# Nothing yet\n' }));
  await assert.rejects(
    main(['plan', empty, '--repo', repo], b.e),
    refusedWith(new RegExp(`^${escaped(empty)} has no cards in it — README\\.md says what the plan is for, and is not a card\\.`)),
  );
  await assert.rejects(
    main(['plan', path.join(ROOT, 'no-such-plan'), '--repo', repo], b.e),
    refusedWith(/^no plan folder at .*no-such-plan\./),
  );
  assert.equal(runsWritten(), before, 'no run written');
});

test('REFUSED by name: `nemia plan` with --after, --workflows or --no-worktree — the folder says each — an unknown flag, --repo twice or with no value, and a second folder; nothing is started', async () => {
  const repo = aRepo();
  const b = board();
  const plan = aPlan(() => ({ 'a.md': cardText(`workflow: ${oneStep()}`, 'the only card') }));
  const before = runsWritten();
  const typed = (...flags: string[]) => main(['plan', plan, ...flags], b.e);
  await assert.rejects(
    typed('--repo', repo, '--after', 'r-xyz'),
    refusedNaming('Invalid', 'nemia plan does not take --after', 'nemia start <card.md> --workflows <dir> --after <runId>'),
  );
  await assert.rejects(typed('--after=r-xyz', '--repo', repo), refusedWith(/^nemia plan does not take --after:/));
  await assert.rejects(
    typed('--workflows', 'dev', '--repo', repo),
    refusedNaming('Invalid', 'nemia plan does not take --workflows', 'in its workflow:'),
  );
  await assert.rejects(typed('--no-worktree', '--repo', repo), refusedWith(/^nemia plan does not take --no-worktree:/));
  await assert.rejects(
    typed('--repos', repo),
    refusedNaming('Invalid', 'nemia plan does not take --repos', '--repo <r>', '--factory <name>'),
  );
  await assert.rejects(typed('--repo', repo, '--repo', repo), refusedNaming('Invalid', 'nemia plan takes --repo once'));
  await assert.rejects(typed('--repo'), refusedNaming('Invalid', 'nemia plan <folder> --repo <r>'));
  await assert.rejects(typed('--repo='), refusedWith(/^--repo takes the repository the plan works on/));
  await assert.rejects(
    typed(plan, '--repo', repo),
    refusedWith(new RegExp(`^nemia plan takes one folder, and ${escaped(plan)} is a second\\.`)),
  );
  assert.equal(runsWritten(), before, 'no run written');
});

test("`nemia start --workflows <name>` starts the repository's workflow of that name when no folder of that name is where it is typed — and refuses a name it does not have, naming both places and the workflows it has", async (t) => {
  const { repo, dir } = aRepoWith('flagship');
  const b = board();
  const printed: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.join(' '));
  });
  await main(['start', 'a brief', '--workflows', 'flagship', '--repo', repo], b.e);
  assert.equal(readRun(printed[0].split(' ')[0]).workflowDir, dir);
  const before = runsWritten();
  await assert.rejects(
    main(['start', 'a brief', '--workflows', 'flagshp', '--repo', repo], b.e),
    refusedWith(
      new RegExp(
        `^no workflow folder at ${escaped(path.resolve('flagshp'))}, nor a workflow named flagshp in ${escaped(path.join(repo, 'workflows'))}\\. The repository's workflows are: flagship — name one, or give the path to a workflow folder\\.$`,
      ),
    ),
  );
  assert.equal(runsWritten(), before);
});

test('a `start()` that refuses part-way stops the plan: the runs already started stand, with their edges, and it says which card refused and which are left', async () => {
  const repo = aRepo();
  const flow = oneStep();
  const plan = aPlan(() => ({
    'a.md': cardText(`workflow: ${flow}`, 'the root'),
    'b.md': cardText(`workflow: ${flow}\nafter: a`, 'the left'),
    'c.md': cardText(`workflow: ${flow}\nafter: a`, 'the right'),
    'd.md': cardText(`workflow: ${flow}\nafter: b, c`, 'the join'),
  }));
  const before = runsWritten();
  let calls = 0;
  const start: typeof startRun = (opts) => {
    if (++calls === 3) return Effect.die(Object.assign(new Error('the disk is full'), { exitCode: 1 }));
    return startRun(opts);
  };
  const { started, stopped, folderOf } = await runPlaced(startPlan({ dir: plan, repo, start }));
  assert.deepEqual(
    [started.map((p) => p.card.name), stopped?.card.name, stopped?.error.message, stopped?.rest.map((c) => c.name)],
    [['a', 'b'], 'c', 'the disk is full', ['d']],
  );
  assert.equal(runsWritten(), before + 2, 'the runs it started stand');
  assert.deepEqual(
    started.map((p) => readRun(p.runId).after),
    [undefined, [started[0].runId]],
  );
  assert.equal(folderOf(stopped!.card), flow);
});

test("a run that waited on runs has its roots filed with `## From run <parent>` for each — the first line of the parent's brief, its terminal step's summary and declared fields, as data — and neither a run without `after` nor a step after a root is given one", async () => {
  const repo = aRepo();
  const c = board();
  const declaring = fs.mkdtempSync(path.join(ROOT, 'declaring-'));
  fs.writeFileSync(path.join(declaring, 'implement.md'), '---\nplace: git\noutput: implement.schema.json\n---\nimplement it\n');
  fs.writeFileSync(path.join(declaring, 'implement.schema.json'), JSON.stringify(FINDINGS));
  const p = await aParent(repo, c, {
    work: 'parent.txt',
    signed: false,
    workflowDir: declaring,
    brief: 'Parse the flag\n\nIn cli.ts, before anything reads it.',
  });
  c.settle(`${p.run.id}-implement`, 'succeeded', { ...SIGNED, summary: 'PARENT-SUMMARY: the flag is parsed first', findings: FOUND });
  const q = await aParent(repo, c, { work: 'second.txt', brief: 'Store the flag' });
  assert.doesNotMatch(c.tasks.get(`${p.run.id}-implement`)!.spec.brief, /## From run/, 'a run without `after` is given none');

  const child = await runPlaced(startRun({ brief: 'Show the flag', repo, workflowDir: folder(), after: [p.run.id, q.run.id] }));
  for (const parent of [p, q]) mergedByHand(repo, parent.branch, `Merge ${parent.run.id}`);
  const r = await runWith(c.e, advanceRun(readRun(child.id)));
  assert.deepEqual([r.filed, r.waiting], [['implement'], []]);
  const brief = c.tasks.get(`${child.id}-implement`)!.spec.brief;
  assert.ok(brief.includes(`## What was asked for\n\nShow the flag\n\n## From run ${p.run.id}\n`), brief);
  const fromP = brief.slice(brief.indexOf(`## From run ${p.run.id}\n`), brief.indexOf(`## From run ${q.run.id}\n`));
  assert.ok(fromP.includes('What it was asked, the first line:\n\n```text\nParse the flag\n```'), fromP);
  assert.ok(
    fromP.includes('What implement said when it signed off, its `summary`:\n\n```text\nPARENT-SUMMARY: the flag is parsed first\n```'),
    fromP,
  );
  assert.deepEqual(dataUnder(fromP, 'What implement declared in its closeout — `findings`:'), { findings: FOUND });
  const qAt = brief.indexOf(`## From run ${q.run.id}\n`);
  const fromQ = brief.slice(qAt, brief.indexOf('\n## ', qAt));
  assert.ok(fromQ.includes('What it was asked, the first line:\n\n```text\nStore the flag\n```'), fromQ);
  assert.ok(fromQ.includes('What implement said when it signed off, its `summary`:\n\n```text\ndid it\n```'), fromQ);
  assert.doesNotMatch(fromQ, /declared in its closeout/, 'a step that declares nothing hands on its summary alone');

  c.settle(`${child.id}-implement`, 'succeeded', SIGNED);
  assert.deepEqual((await runWith(c.e, advanceRun(readRun(child.id)))).filed, ['review']);
  assert.doesNotMatch(c.tasks.get(`${child.id}-review`)!.spec.brief, /## From run/, 'only its roots');
});

test('REFUSED to fail the filing: a parent whose closeout cannot be read — a failed step whose work a person merged, and one whose closeout does not parse — is handed on as a section that says so, and the roots are filed all the same', async () => {
  const repo = aRepo();
  const c = board();
  const lost = await aParent(repo, c, { work: 'lost.txt', signed: false });
  c.settle(`${lost.run.id}-implement`, 'failed');
  const garbled = await aParent(repo, c, { work: 'garbled.txt', signed: false });
  c.settle(`${garbled.run.id}-implement`, 'failed', 'not json {');
  for (const parent of [lost, garbled]) {
    mergedByHand(repo, parent.branch, `Merge ${parent.run.id}`);
    assert.deepEqual((await runWith(c.e, decideRun(parent.run.id))).decision, { kind: 'shipped', branches: [parent.branch] });
  }
  const child = await runPlaced(
    startRun({
      brief: 'the child of work merged without a word',
      repo,
      workflowDir: folder(),
      after: [lost.run.id, garbled.run.id],
    }),
  );
  const r = await runWith(c.e, advanceRun(readRun(child.id)));
  assert.deepEqual([r.filed, r.waiting], [['implement'], []], 'filed all the same');
  const brief = c.tasks.get(`${child.id}-implement`)!.spec.brief;
  assert.ok(brief.includes(`## From run ${lost.run.id}\n`) && brief.includes(`## From run ${garbled.run.id}\n`), brief);
  assert.ok(
    brief.includes(
      `\nWhat implement said when it signed off cannot be given here — the engine holds no closeout for its task ${lost.run.id}-implement, which is failed.\n`,
    ),
    brief,
  );
  assert.match(brief, /\nWhat implement said when it signed off cannot be given here — its closeout cannot be read: unparseable: .*\.\n/);
});

test('REFUSED to wait on context: a run handed only a run still in flight files its roots on the first pass, the source handed as not shipped, not judged', async () => {
  const repo = aRepo();
  const c = board();
  const source = await aParent(repo, c, { work: 'source.txt', signed: false });
  const child = await runPlaced(startRun({ brief: 'Read what the source has', repo, workflowDir: folder(), context: [source.run.id] }));
  assert.deepEqual(readRun(child.id).context, [source.run.id], 'frozen on the record');
  const r = await runWith(c.e, advanceRun(readRun(child.id)));
  assert.deepEqual([r.filed, r.waiting], [['implement'], []]);
  const brief = c.tasks.get(`${child.id}-implement`)!.spec.brief;
  const section = brief.slice(brief.indexOf(`\n## From run ${source.run.id}\n`));
  assert.ok(section.length < brief.length, brief);
  assert.match(section, /as context \(`--from`\); it did not wait on it/);
  assert.match(section, new RegExp(`Not shipped, not judged: ${source.run.id} was still in flight`));
});

test('REFUSED to wait on context: a run after one run and handed another waits for the first alone, handed it in `--after` words before the other', async () => {
  const repo = aRepo();
  const c = board();
  const waited = await aParent(repo, c, { work: 'waited.txt' });
  const read = await aParent(repo, c, { work: 'read.txt', signed: false });
  const child = await runPlaced(
    startRun({ brief: 'the child', repo, workflowDir: folder(), after: [waited.run.id], context: [read.run.id] }),
  );
  const before = await runWith(c.e, advanceRun(readRun(child.id)));
  assert.deepEqual(
    [before.filed, before.waiting],
    [[], [{ run: waited.run.id }]],
    'waiting on the run it waits on, never the one it reads',
  );
  mergedByHand(repo, waited.branch, `Merge ${waited.run.id}`);
  const r = await runWith(c.e, advanceRun(readRun(child.id)));
  assert.deepEqual([r.filed, r.waiting], [['implement'], []]);
  const brief = c.tasks.get(`${child.id}-implement`)!.spec.brief;
  const waitedAt = brief.indexOf(`\n## From run ${waited.run.id}\n`);
  const readAt = brief.indexOf(`\n## From run ${read.run.id}\n`);
  assert.ok(waitedAt > 0 && readAt > waitedAt, brief);
  assert.match(brief.slice(waitedAt, readAt), /waited on .* \(`--after`\) and started once it shipped/);
  assert.match(brief.slice(readAt), /as context \(`--from`\).*\n.*\nNot shipped, not judged/);
});

test('`nemia concluded` prints the section the tick hands a run started with `--from` — REFUSED: a run the store does not have', async (t) => {
  const repo = aRepo();
  const c = board();
  const source = await aParent(repo, c, { work: 'source.txt', signed: false });
  const printed: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.join(' '));
  });
  await main(['concluded', source.run.id], c.e);
  const child = await runPlaced(startRun({ brief: 'Read what the source has', repo, workflowDir: folder(), context: [source.run.id] }));
  await runWith(c.e, advanceRun(readRun(child.id)));
  const brief = c.tasks.get(`${child.id}-implement`)!.spec.brief;
  const at = brief.indexOf(`\n## From run ${source.run.id}\n`);
  const section = brief.slice(at, brief.indexOf('\n## Files for the steps after you\n', at));
  assert.equal(printed.join('\n'), section.replace(/^\n+/, '').replace(/\n+$/, ''), 'the very section the root was handed');
  await assert.rejects(main(['concluded', 'nobody-z9'], c.e), (err: Error) => {
    assert.match(err.message, /nemia concluded nobody-z9: the store has no run nobody-z9/);
    return true;
  });
});

test("`nemia say` hands the words to the step's current task through the engine's `say` and prints the line it journalled, writing nothing of its own — `nemia ls` notes the step said to, and `nemia decide` prints each thing said under the step, before its closeout, fenced", async (t) => {
  const run = await started(folder());
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  const taskId = `${run.id}-implement`;
  b.settle(taskId, 'running');
  const printed: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.join(' '));
  });
  const recordOf = () => fs.readFileSync(path.join(ROOT, 'runs', `${run.id}.json`), 'utf8');
  const record = recordOf();
  const beside = fs.readdirSync(path.join(ROOT, 'runs')).sort();

  await main(['say', run.id, 'implement', 'Widen', 'the', 'scope', 'to', 'apps/api', 'too.'], b.e);
  const [first] = b.said.get(taskId)!;
  assert.deepEqual(
    first,
    { at: '2026-09-14T16:01:00.000Z', attempt: 1, text: 'Widen the scope to apps/api too.' },
    'the words are everything after the step, so an unquoted sentence is one message',
  );
  assert.deepEqual(printed, [
    `${run.id}  said to implement, try 1, at ${first.at} — journalled on ${taskId}: nemia decide ${run.id} prints it under the step`,
    '   ```text',
    '   Widen the scope to apps/api too.',
    '   ```',
  ]);
  assert.equal(recordOf(), record, "the run's record untouched");
  assert.deepEqual(
    fs.readdirSync(path.join(ROOT, 'runs')).sort(),
    beside,
    'and no file of its own beside it: the engine journal is the record',
  );
  assert.deepEqual((await runWith(b.e, list(b.e, readRun(run.id)))).steps[0], {
    name: 'implement',
    status: 'running',
    branch: run.branch,
    note: 'said to 1×',
  });

  const told = await runWith(b.e, sayRun(run.id, 'implement', 'And keep `--flag` as it is.'));
  const second = b.said.get(taskId)![1];
  assert.deepEqual([told.taskId, told.try, told.said], [taskId, 1, second]);
  assert.equal((await runWith(b.e, list(b.e, readRun(run.id)))).steps[0].note, 'said to 2×');

  b.settle(taskId, 'succeeded', { outcome: 'blocked', summary: 'IMPLEMENTER-SUMMARY', artifacts: [], needs: 'Which reading?' });
  printed.length = 0;
  await main(['decide', run.id], b.e);
  const at = (line: string) => printed.indexOf(line);
  const under = at(`    said to try 1, at ${first.at}:`);
  assert.ok(
    at('\n  implement  BLOCKED') >= 0 && at('\n  implement  BLOCKED') < under,
    `signed off blocked, the run waits on a person: \`nemia decide\` prints what was said under the step\n${printed.join('\n')}`,
  );
  assert.deepEqual(printed.slice(under, under + 8), [
    `    said to try 1, at ${first.at}:`,
    '    ```text',
    '    Widen the scope to apps/api too.',
    '    ```',
    `    said to try 1, at ${second.at}:`,
    '    ```text',
    '    And keep `--flag` as it is.',
    '    ```',
  ]);
  assert.ok(under < at('    IMPLEMENTER-SUMMARY'), "before the closeout, the step's own account of it");
  assert.equal(recordOf(), record, 'and still nothing written');
});

test("REFUSED: `nemia say` on a step the run does not have, a step not filed, a settled step and a cancelled run — exit 2 in the package's words, the engine never asked; the engine's own refusals are a Conflict in its words, exit 2 — a task not started, empty words — and words not delivered reject in its words with no exit code, no refusal; nothing said, nothing written", async () => {
  const run = await started(folder());
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  const taskId = `${run.id}-implement`;
  const asked: string[] = [];
  const e = {
    ...b.e,
    say: (id: string, text: string) => {
      asked.push(id);
      return b.e.say(id, text);
    },
  };
  const record = fs.readFileSync(path.join(ROOT, 'runs', `${run.id}.json`), 'utf8');
  const verbatim = (message: string, exitCode: number | undefined) => (err: Error & { exitCode?: number }) =>
    err.exitCode === exitCode && err.message === message && (exitCode === 2) === err instanceof Conflict;

  await assert.rejects(
    runWith(e, sayRun(run.id, 'implement', 'Start with the parser.')),
    refusedNaming('Conflict', `say: \`${taskId}\``, 'has not started an attempt'),
    "the engine's refusal: filed, with no attempt started",
  );
  b.settle(taskId, 'running');
  for (const words of [[''], [' \n '], []]) {
    await assert.rejects(
      main(['say', run.id, 'implement', ...words], e),
      refusedNaming('Conflict', 'say: `text` is empty', 'Give the words'),
      `the engine's refusal of empty words, from the verb and from the command line with none at all: ${JSON.stringify(words)}`,
    );
  }
  b.deaf.add(taskId);
  await assert.rejects(
    runWith(e, sayRun(run.id, 'implement', 'Widen the scope.')),
    verbatim(`say: ae/${taskId}/1 was not given the words (connect ECONNREFUSED). Nothing was journalled.`, undefined),
    'words its harness did not take: no exit code, since asking again may work',
  );
  b.deaf.delete(taskId);
  assert.equal(asked.length, 5, "each of those was the engine's to answer");
  asked.length = 0;

  await assert.rejects(
    runWith(e, sayRun(run.id, 'deploy', 'Ship it.')),
    verbatim(`${run.id} has no step "deploy" — its steps are implement, review.`, 2),
    "the package's refusal, before the engine is asked",
  );
  await assert.rejects(
    main(['say', run.id, 'review', 'Look at the parser first.'], e),
    verbatim(`review has not been filed yet, so there is no session to hear anything. Say it once it runs: nemia ls ${run.id}.`, 2),
  );
  for (const phase of ['succeeded', 'failed', 'stopped'] as const) {
    b.settle(taskId, phase);
    await assert.rejects(
      runWith(e, sayRun(run.id, 'implement', 'Widen the scope.')),
      refusedWith(
        new RegExp(
          `^implement is not running: try 1's task settled \`${phase}\`, so no session of it is there to hear anything\\. .*: nemia retry ${run.id} implement --message "<words>"\\.$`,
        ),
      ),
      phase,
    );
  }
  b.settle(taskId, 'running');
  markCancelled(run.id);
  await assert.rejects(
    main(['say', run.id, 'implement', 'Widen the scope.'], e),
    refusedWith(new RegExp(`^${run.id} was cancelled at [^:]+:\\d\\d:[\\d.]+Z: its sessions are being stopped, not steered`)),
  );
  assert.deepEqual(asked, [], 'the engine was never asked');
  assert.equal(b.said.get(taskId), undefined, 'nothing said');
  assert.equal(fs.readFileSync(path.join(ROOT, 'runs', `${run.id}.json`), 'utf8'), record, 'nothing written');
});

test('a nudge that continues a session is handed what was said to it — `nemia retry`, `retries:`, and a session its harness blocked, stopped and continued (agent-runtime open issue 16) — as `## Said to your session` inside `## Try 2`, each message with its time, fenced; a fresh session is handed none', async () => {
  const toldThenBlocked = async (how: RetryHow) => {
    const run = await started(folder());
    const b = board();
    await runWith(b.e, advanceRun(readRun(run.id)));
    const taskId = `${run.id}-implement`;
    b.settle(taskId, 'running');
    await runWith(b.e, sayRun(run.id, 'implement', 'Widen the scope to apps/api too.'));
    await runWith(b.e, sayRun(run.id, 'implement', 'Keep:\n```\n--flag\n```'));
    b.settle(taskId, 'succeeded', { outcome: 'blocked', summary: 'two readings', artifacts: [], needs: 'Rename --flag?' });
    await runWith(b.e, advanceRun(readRun(run.id)));
    await runWith(b.e, retryRun(run.id, 'implement', how));
    assert.deepEqual((await runWith(b.e, advanceRun(readRun(run.id)))).tried, ['implement']);
    return { brief: b.tasks.get(`${run.id}-implement-try2`)!.spec.brief, said: b.said.get(taskId)! };
  };

  const nudged = await toldThenBlocked({ mode: 'nudge', message: 'Keep it.' });
  const [one, two] = nudged.said;
  assert.match(nudged.brief, /^## Try 2\n\nThe last try signed off `blocked`\./);
  assert.ok(
    nudged.brief.includes(`\n\n## Said to your session\n\nA person said these to your session while the last try ran (\`nemia say\`).`),
    nudged.brief,
  );
  assert.ok(
    nudged.brief.includes(
      `\n\nAt ${one.at}:\n\n\`\`\`text\n${one.text}\n\`\`\`\n\nAt ${two.at}:\n\n\`\`\`\`text\n${two.text}\n\`\`\`\`\n\n## Your answer\n\n\`\`\`text\nKeep it.\n\`\`\``,
    ),
    nudged.brief,
  );
  const fresh = await toldThenBlocked({ mode: 'fresh' });
  assert.doesNotMatch(fresh.brief, /Said to your session|Widen the scope/, 'a new session is handed none of the last one');

  const { run: checked, e, tasks, said, logs } = await throughCheck('check: npm test\nretries: 1', 'failed', 1);
  logs.set(`${checked.id}-implement-check`, 'not ok 1 - parses a trailing comma\n');
  said.set(`${checked.id}-implement`, [{ at: '2026-09-14T16:05:00.000Z', attempt: 1, text: 'Run the parser tests too.' }]);
  assert.deepEqual((await runWith(e, advanceRun(readRun(checked.id)))).tried, ['implement']);
  const retried = tasks.get(`${checked.id}-implement-try2`)!.spec.brief;
  assert.ok(
    retried.includes('## Said to your session\n\nA person said this to your session'),
    `\`retries:\`, the run's own nudge, hands them on too, beside what the check said\n${retried}`,
  );
  assert.ok(retried.includes('At 2026-09-14T16:05:00.000Z:\n\n```text\nRun the parser tests too.\n```'), retried);
  assert.ok(retried.indexOf('## Said to your session') < retried.indexOf('## What the check said'), 'before the evidence');

  const run = await started(folder());
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  const blocked = `${run.id}-implement`;
  b.settle(blocked, 'needs-human' as TaskPhase);
  const stops = recordingStops(b);
  await runWith(stops, sayRun(run.id, 'implement', 'Approve nothing; widen the scope instead.'));
  await runWith(stops, retryRun(run.id, 'implement', { mode: 'nudge' }, { stopBlocked: true }));
  await runWith(stops, advanceRun(readRun(run.id)));
  assert.deepEqual(b.stopped, [blocked]);
  b.settle(blocked, 'stopped');
  assert.deepEqual((await runWith(stops, advanceRun(readRun(run.id)))).tried, ['implement']);
  const continued = b.tasks.get(`${run.id}-implement-try2`)!.spec;
  assert.equal(
    continued.resumeFrom,
    `native-${blocked}`,
    "a session its harness blocked, told something, which the board's Continue stops, then continues",
  );
  assert.match(
    continued.brief,
    /^## Try 2\n\nThe last try's session was stopped before it signed off\.[\s\S]*\n\n## Said to your session\n\n[\s\S]*```text\nApprove nothing; widen the scope instead\.\n```/,
  );
});

test("REFUSED by the engine: a try's stop of a session that settled since the pass read it is said, and the pass goes on — it files nothing, and the pass after it, reading it settled, files the try", async (t) => {
  const run = await started(folder());
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  const taskId = `${run.id}-implement`;
  b.settle(taskId, 'needs-human' as TaskPhase);
  t.mock.method(console, 'log', () => {});
  await main(['retry', run.id, 'implement'], b.e);
  assert.deepEqual(asksOf(run.id), ['retry-implement-2']);

  const refusing: Engine = {
    ...b.e,
    stop: (id: string) =>
      Effect.fail(
        Object.assign(new Error(`stop: \`${id}\` has settled (stopped): there is nothing left to stop.`), { exitCode: 2 }) as never,
      ),
  };
  const first = await runWith(refusing, advanceRun(readRun(run.id)));
  assert.deepEqual([first.tried, first.filed], [[], []], 'nothing filed on the read the refusal proved stale');
  assert.ok(
    first.notes.includes(
      `implement: try 2 — nemia retry --nudge; its harness blocked its session, but the engine did not take the stop (stop: \`${taskId}\` has settled (stopped): there is nothing left to stop.), and the try is filed once it has settled`,
    ),
    first.notes.join('\n'),
  );

  b.settle(taskId, 'stopped');
  const filed = await runWith(refusing, advanceRun(readRun(run.id)));
  assert.deepEqual(filed.tried, ['implement'], 'settled, the try is filed');
});

test('REFUSED before, now honoured at shipped defaults: `nemia retry` on a step whose harness blocked its session, and the session works again before any tick — the tick stops it once, files nothing while it stops, and files the try once it has; `nemia ls` says so meanwhile', async (t) => {
  const run = await started(folder());
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  const taskId = `${run.id}-implement`;
  b.settle(taskId, 'needs-human' as TaskPhase);
  const e = recordingStops(b);
  t.mock.method(console, 'log', () => {});
  await main(['retry', run.id, 'implement'], e);
  assert.deepEqual(asksOf(run.id), ['retry-implement-2']);

  b.settle(taskId, 'running');
  assert.deepEqual(
    (await runWith(e, list(e, readRun(run.id)))).steps[0],
    {
      name: 'implement',
      status: 'running',
      branch: run.branch,
      note: 'try 2 asked (--nudge) — stopping its session, then the tick files it',
    },
    "a peer's message, and the session works again with no tick in between",
  );

  const record = fs.readFileSync(path.join(ROOT, 'runs', `${run.id}.json`), 'utf8');
  const first = await runWith(e, advanceRun(readRun(run.id)));
  assert.deepEqual(
    [b.stopped, first.tried, first.filed, first.status],
    [[taskId], [], [], 'running'],
    'the session asked to stop, and nothing filed',
  );
  assert.ok(
    first.notes.includes(
      `implement: try 2 — nemia retry --nudge; its session runs on, asked for while its harness had blocked it, so the engine is asked to stop it, and the try is filed once it has`,
    ),
    first.notes.join('\n'),
  );
  assert.equal(fs.readFileSync(path.join(ROOT, 'runs', `${run.id}.json`), 'utf8'), record, 'the record untouched');
  assert.deepEqual(asksOf(run.id), ['retry-implement-2'], 'the ask waits for its try');

  for (const engineOf of [() => e, () => recordingStops(b)]) {
    const again = await runWith(engineOf(), advanceRun(readRun(run.id)));
    assert.deepEqual(
      [b.stopped, again.tried, again.filed, again.notes],
      [[taskId], [], [], []],
      'passes while the engine stops it, the second on a board read afresh as after a restart: no second stop, nothing filed',
    );
  }

  b.settle(taskId, 'stopped');
  const try2 = `${run.id}-implement-try2`;
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).tried, ['implement'], 'settled stopped, the next pass files try 2');
  assert.equal(b.tasks.get(try2)!.spec.resumeFrom, `native-${taskId}`, 'a nudge that continues the session');
  assert.deepEqual(asksOf(run.id), [], 'consumed');
  await runWith(e, advanceRun(readRun(run.id)));
  assert.deepEqual([b.stopped, b.filings.filter((f) => f === try2).length], [[taskId], 1], 'once');
});

test("a step's `budget:` is frozen on the run with the rest of its keys: the folder edited afterwards never raises it, nor takes it off", async () => {
  const dir = folder('budget: 2.50');
  const run = await started(dir);
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\nbudget: 500\n---\nimplement it\n');
  assert.deepEqual(
    stepsOf(readRun(run.id)).map((s) => [s.name, s.budget]),
    [
      ['implement', 2.5],
      ['review', undefined],
    ],
  );
});

test('REFUSED past its budget at shipped defaults: a claude step whose ended tries cost more than its `budget:` is not tried again by `retries:` — `nemia ls` says over budget with the amounts — `nemia retry` is refused without `--budget` or with one not above what it spent, and one above it files the try, the cap on the record', async () => {
  const { run, e, tasks, filings, settle, logs } = await throughCheck('check: npm test\nretries: 2\nbudget: 3', 'failed', 1);
  const implement = `${run.id}-implement`;
  settle(implement, 'succeeded', SIGNED, undefined, undefined, { costUsd: 4.25 });
  logs.set(`${implement}-check`, 'not ok 1 - parses\n');
  for (let i = 0; i < 2; i++) {
    const pass = await runWith(e, advanceRun(readRun(run.id)));
    assert.deepEqual(
      [pass.tried, pass.filed, pass.checked, pass.blocked, pass.status],
      [[], [], [], ['review'], 'failed'],
      `pass ${i + 1}`,
    );
  }
  assert.deepEqual(filings, [implement, `${implement}-check`], '`retries: 2` files nothing past the cap');
  assert.equal(tasks.get(implement)!.spec.config?.budgetUsd, 3, 'a claude step runs as a job, which keeps the cap: filed with it whole');
  const l = await runWith(e, list(e, readRun(run.id)));
  assert.deepEqual(
    [l.steps[0].status, l.waitingOnYou],
    ['over budget $4.25 of $3', ['implement']],
    "the cost is read off the engine's view of the settled try, the exit off its check's log",
  );
  await assert.rejects(
    runWith(e, retryRun(run.id, 'implement', { mode: 'nudge' })),
    refusedNaming('Conflict', 'implement is over budget', '$4.25 of its $3 budget', `nemia retry ${run.id} implement --budget <amount>`),
  );
  await assert.rejects(
    runWith(e, retryRun(run.id, 'implement', { mode: 'nudge', budget: 4 })),
    refusedNaming('Conflict', '--budget 4 is not above $4.25', `nemia retry ${run.id} implement --budget <amount>`),
  );
  assert.deepEqual(asksOf(run.id), [], 'no ask written');
  const { offers, decision: d } = await runWith(e, decideRun(run.id));
  assert.deepEqual(d.kind === 'awaiting' && [d.outcome, d.overBudget, d.failedCheck], ['failed', ['implement'], ['implement']]);
  assert.match(
    offers[0],
    new RegExp(
      `^implement: over budget \\(check refused\\), \\$4\\.25 of \\$3\\. Raise its cap above \\$4\\.25 and continue its session:  nemia retry ${run.id} implement --budget <amount>`,
    ),
  );

  const { ask } = await runWith(e, retryRun(run.id, 'implement', { mode: 'nudge', budget: 10 }));
  assert.equal(ask.budget, 10);
  assert.match(
    (await runWith(e, list(e, readRun(run.id)))).steps[0].note ?? '',
    /^try 2 asked \(--nudge, --budget 10\) — the next tick files it/,
  );
  const pass = await runWith(e, advanceRun(readRun(run.id)));
  const try2 = `${implement}-try2`;
  assert.deepEqual(pass.tried, ['implement']);
  assert.ok(pass.notes.includes('implement: try 2 — nemia retry --nudge --budget 10'), pass.notes.join('\n'));
  assert.deepEqual(readRun(run.id).steps.implement?.tries, [
    { taskId: implement, check: { taskId: `${implement}-check` }, then: 'nudge', budget: 10 },
  ]);
  const spec = tasks.get(try2)!.spec;
  assert.deepEqual(
    [spec.resumeFrom, spec.config?.budgetUsd],
    [`native-${implement}`, 5.75],
    'the job resumed, handed what is left of $10 after the $4.25 its tries cost: a resume is charged its own spend',
  );
  assert.match(spec.brief, /A person asked for this try: `nemia retry --nudge --budget 10`, raising this step's budget to \$10\./);
  assert.match(
    spec.brief,
    /^## Try 2\n\nAfter the last try signed off, the run executed this step's check, and it did not pass\.\nAnd this step's tries had together cost its budget or more, so the run filed nothing more for it until a person raised the cap\.\n/,
  );

  settle(try2, 'succeeded', SIGNED, undefined, undefined, { costUsd: 6 });
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).checked, ['implement']);
  settle(`${try2}-check`, 'failed', undefined, 1);
  assert.deepEqual(
    (await runWith(e, advanceRun(readRun(run.id)))).tried,
    [],
    'try 2 costs $6 more, $10.25 of $10, and its check refuses: over again, and `retries:` files nothing on its own',
  );
  const again = await runWith(e, list(e, readRun(run.id)));
  assert.deepEqual([again.steps[0].status, again.steps[0].note], ['over budget $10.25 of $10', 'try 2, nudged on your word, budget $10']);
});

test("a claude-detached step's `budget:` goes to the engine as `budgetUsd`; a session its harness ended at the cap reads budget exhausted — not tried by `retries:`, offered `--budget`, refused one not above what it spent — and a try with a larger one carries it", async () => {
  const run = await started(folder('harness: claude-detached\ncheck: npm test\nretries: 2\nbudget: 3'));
  const { e, tasks, filings, settle } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  const implement = `${run.id}-implement`;
  assert.deepEqual([tasks.get(implement)!.spec.harness, tasks.get(implement)!.spec.config?.budgetUsd], ['claude-detached', 3]);
  settle(implement, 'failed', undefined, 1, 'budget', { costUsd: 3.02 });
  for (let i = 0; i < 2; i++) {
    const pass = await runWith(e, advanceRun(readRun(run.id)));
    assert.deepEqual(
      [pass.tried, pass.filed, pass.checked, pass.blocked, pass.status],
      [[], [], [], ['review'], 'blocked'],
      `pass ${i + 1}`,
    );
  }
  assert.deepEqual(filings, [implement]);
  const l = await runWith(e, list(e, readRun(run.id)));
  assert.deepEqual(
    [l.steps[0].status, l.waitingOnYou],
    ['budget exhausted $3.02 of $3', ['implement']],
    'the engine settled it `failed`, naming the budget, with what the session cost',
  );
  const { offers, decision: d } = await runWith(e, decideRun(run.id));
  assert.deepEqual(d.kind === 'awaiting' && [d.outcome, d.budgetExhausted, d.failed], ['blocked', ['implement'], []]);
  assert.deepEqual(offers, [
    `implement: budget exhausted, $3.02 of $3. Raise its cap above $3.02 and continue its session:  nemia retry ${run.id} implement --budget <amount>  (--fresh, or --model <m>, for a new session; retries: 2, 0 spent)`,
  ]);
  await assert.rejects(
    runWith(e, retryRun(run.id, 'implement', { mode: 'fresh' })),
    refusedNaming(
      'Conflict',
      'implement ended at its budget',
      'stopped its session at $3,',
      `nemia retry ${run.id} implement --budget <amount> --fresh`,
    ),
  );
  await assert.rejects(
    runWith(e, retryRun(run.id, 'implement', { mode: 'fresh', budget: 2 })),
    refusedNaming('Conflict', '--budget 2 is not above $3.02', `nemia retry ${run.id} implement --budget <amount>`),
  );
  await runWith(e, retryRun(run.id, 'implement', { mode: 'fresh', budget: 8 }));
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).tried, ['implement']);
  const spec = tasks.get(`${implement}-try2`)!.spec;
  assert.deepEqual(
    [spec.harness, spec.config?.budgetUsd, spec.resumeFrom],
    ['claude-detached', 4.98, undefined],
    'what is left of $8 after the $3.02 its tries cost',
  );
  assert.match(spec.brief, /The last try's session was ended by its harness at this step's budget, before it signed off\./);
});

test('a step blocked under its cap takes a `--budget` above it at shipped defaults: implement, blocked at $19.27 of its $20 asking for more, takes `--budget 40`, and its next try is filed with what is left of $40; `--budget 15` and `--budget 20` are REFUSED, naming the cap and what was spent', async () => {
  const run = await started(folder('harness: claude-detached\nbudget: 20'));
  const { e, tasks, settle } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  const implement = `${run.id}-implement`;
  const asked = { outcome: 'blocked', summary: 'ran out of room', artifacts: [], needs: 'a try with a larger budget, about $15–25' };
  settle(implement, 'succeeded', asked, undefined, undefined, { costUsd: 19.27 });
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).tried, []);
  const l = await runWith(e, list(e, readRun(run.id)));
  assert.deepEqual([l.steps[0].status, l.waitingOnYou], ['succeeded · BLOCKED', ['implement']]);
  await assert.rejects(
    runWith(e, retryRun(run.id, 'implement', { mode: 'nudge', budget: 15 })),
    refusedNaming(
      'Conflict',
      '--budget 15 is not above $20',
      'the $20 cap in force on implement',
      'cost $19.27',
      `nemia retry ${run.id} implement --budget <amount>`,
    ),
  );
  await assert.rejects(
    runWith(e, retryRun(run.id, 'implement', { mode: 'nudge', budget: 20 })),
    refusedNaming('Conflict', '--budget 20 is not above $20', 'the $20 cap in force on implement'),
  );
  assert.deepEqual(asksOf(run.id), [], 'no ask written');

  await runWith(e, retryRun(run.id, 'implement', { mode: 'nudge', budget: 40 }));
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).tried, ['implement']);
  assert.deepEqual(readRun(run.id).steps.implement?.tries, [{ taskId: implement, then: 'nudge', budget: 40 }]);
  const spec = tasks.get(`${implement}-try2`)!.spec;
  assert.deepEqual(
    [spec.harness, spec.config?.budgetUsd],
    ['claude-detached', 20.73],
    'what is left of $40 after the $19.27 its tries cost',
  );
  assert.match(spec.brief, /A person asked for this try: `nemia retry --nudge --budget 40`, raising this step's budget to \$40\./);
  assert.doesNotMatch(spec.brief, /had together cost its budget or more/);
});

test('REFUSED by the CLI before a run is read: `nemia retry --budget` with no amount, a word, 0, a unit, twice, or with --recheck — and `--budget=<amount>` is read', async () => {
  const { e } = board();
  const cases: Array<[string[], RegExp | string]> = [
    [
      ['--budget'],
      /^--budget takes the most the step's tries may cost together, in dollars, above what they have cost — an amount above zero, in digits, like 5 or 2\.50: nemia retry <runId> <step> --budget <amount>$/,
    ],
    [['--budget', 'five'], /, and five is not one: /],
    [['--budget', '0'], /, and 0 is not one: /],
    [['--budget', '$5'], /, and \$5 is not one: /],
    [['--budget', '5', '--budget', '6'], /^nemia retry takes --budget once/],
    [
      ['--recheck', '--budget', '5'],
      "--budget raises a step's cap for the session a try files, and --recheck files none — it runs the check again, which costs nothing. " +
        'Recheck without it (nemia retry no-such-run implement --recheck), or give the cap to a session: nemia retry no-such-run implement --budget <amount>.',
    ],
  ];
  for (const [argv, pattern] of cases)
    await assert.rejects(main(['retry', 'no-such-run', 'implement', ...argv], e), refusedAs(pattern), argv.join(' '));
  await assert.rejects(
    main(['retry', 'no-such-run', 'implement', '--budget=5'], e),
    (err: unknown) => err instanceof Missing && err.message === "no such run: no-such-run  (try 'nemia ls')",
    'read, and the run is looked for: refused as Missing',
  );
});

test("a claude-detached step's tries share its cap: `retries:` files the next try with what is left of it, not a cap of its own — and at the cap, nothing left, files none", async () => {
  const { run, e, tasks, settle } = await throughCheck('harness: claude-detached\ncheck: npm test\nretries: 2\nbudget: 3', 'failed', 1);
  const implement = `${run.id}-implement`;
  assert.equal(tasks.get(implement)!.spec.config?.budgetUsd, 3, 'the first filing: nothing spent, the whole cap');
  settle(implement, 'succeeded', SIGNED, undefined, undefined, { costUsd: 2.9 });
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).tried, ['implement'], '$2.90 of $3: `retries:` tries it');
  const try2 = `${implement}-try2`;
  assert.equal(tasks.get(try2)!.spec.config?.budgetUsd, 0.1, 'what is left of $3 after $2.90');

  settle(try2, 'succeeded', SIGNED, undefined, undefined, { costUsd: 0.1 });
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).checked, ['implement']);
  settle(`${try2}-check`, 'failed', undefined, 1);
  const pass = await runWith(e, advanceRun(readRun(run.id)));
  assert.deepEqual(
    [pass.tried, pass.blocked],
    [[], ['review']],
    '$3.00 of $3: nothing left, and `retries: 2` does not spend the try it has',
  );
  assert.equal((await runWith(e, list(e, readRun(run.id)))).steps[0].status, 'over budget $3.00 of $3');
});

test('a nudge past a budget is told why its last try ended on its own work — here, without its closeout — beside the budget a person raised, and not in its place', async () => {
  const run = await started(folder('budget: 3'));
  const { e, tasks, settle } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  const implement = `${run.id}-implement`;
  settle(implement, 'succeeded', undefined, undefined, undefined, { costUsd: 4.25 });
  assert.equal((await runWith(e, list(e, readRun(run.id)))).steps[0].status, 'over budget $4.25 of $3');
  await runWith(e, retryRun(run.id, 'implement', { mode: 'nudge', budget: 10 }));
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).tried, ['implement']);
  const brief = tasks.get(`${implement}-try2`)!.spec.brief;
  assert.match(
    brief,
    /^## Try 2\n\nThe last try ended without the closeout the run asked for, or without a field its `output:` declares, so nothing that waits on this step started\.\nAnd this step's tries had together cost its budget or more, so the run filed nothing more for it until a person raised the cap\.\nA person asked for this try: `nemia retry --nudge --budget 10`/,
  );
  assert.doesNotMatch(brief, /The last try ended `over budget`/);
});

/** The directories `repo` has a checkout in under the store's worktrees, as its place lists them. */
const worktreesOf = (repo: string): string[] => {
  const outcome = stand().place.askNow('inventory', { repo, under: path.join(ROOT, 'worktrees'), prefix: 'wf/', base: 'main' });
  assert.ok('answer' in outcome, `the inventory of ${repo} was expected, not ${JSON.stringify(outcome)}`);
  return outcome.answer.workspaces.map((w) => w.path);
};
const hasBranch = (repo: string, branch: string) => world().tip(repo, branch) !== null;
const under = (...parts: string[]) => fs.existsSync(path.join(ROOT, ...parts));
/** `nemia rm`, through the CLI, as a person types it: the lines it printed, and the error it ended with, if it did. */
const rmTyped = async (t: TestContext, e: Engine, ...args: string[]) => {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...a: unknown[]) => {
    printed.push(a.join(' '));
  });
  try {
    await main(['rm', ...args], e);
    return { printed, error: undefined };
  } catch (err) {
    return { printed, error: err as Error & { exitCode?: number } };
  } finally {
    log.mock.restore();
  }
};

test('REFUSED at shipped defaults: `nemia rm` on a run with a step in flight, one whose next step is ready, one with an unspent ask, and one another run waits on — each named on its line with what to do, nothing of it removed, exit 2 — while a run beside them in the same `nemia rm` is forgotten', async (t) => {
  const repo = aRepo();
  const b = board();
  const running = await runPlaced(startRun({ brief: 'still running', repo, workflowDir: folder() }));
  await runWith(b.e, advanceRun(readRun(running.id)));
  const ready = await runPlaced(startRun({ brief: 'review is ready', repo, workflowDir: folder() }));
  await runWith(b.e, advanceRun(readRun(ready.id)));
  b.settle(`${ready.id}-implement`, 'succeeded', SIGNED);
  const asked = await runPlaced(startRun({ brief: 'a try asked for', repo, workflowDir: folder() }));
  await runWith(b.e, advanceRun(readRun(asked.id)));
  b.settle(`${asked.id}-implement`, 'succeeded');
  await runWith(b.e, retryRun(asked.id, 'implement', { mode: 'nudge' }));
  const parent = await aParent(repo, b, { work: 'parent.txt' });
  const child = await runPlaced(startRun({ brief: 'the child', repo, workflowDir: folder(), after: [parent.run.id] }));
  const over = await aParent(repo, b, { work: 'over.txt' });

  const { printed, error } = await rmTyped(t, b.e, running.id, ready.id, asked.id, parent.run.id, over.run.id);
  assert.equal(error?.exitCode, 2);
  assert.equal(
    error?.message,
    `nemia rm: ${running.id}, ${ready.id}, ${asked.id}, ${parent.run.id} not forgotten — each line above says why, and what to do.`,
  );
  assert.deepEqual(printed.slice(0, 4), [
    `${running.id}  not forgotten: implement is pending. Forgetting is not cancelling: nemia cancel ${running.id} stops what is in flight and files nothing more, then nemia rm ${running.id} once what was in flight has settled (nemia ls ${running.id}).`,
    `${ready.id}  not forgotten: review is ready to be filed, and a pass may be filing it now. Forgetting is not cancelling: nemia cancel ${ready.id} files nothing more, then nemia rm ${ready.id}.`,
    `${asked.id}  not forgotten: try 2 of implement is due (nemia retry --nudge), and a pass may be filing it now. Forgetting is not cancelling: nemia cancel ${asked.id} files nothing more, then nemia rm ${asked.id}.`,
    `${parent.run.id}  not forgotten: ${child.id} waits on it and has not started: forgotten, it would read waiting on ${parent.run.id} (no such run) for ever. Let it start first, on the pass after nemia decide says ${parent.run.id} has shipped, or call it off: nemia cancel ${child.id}.`,
  ]);
  assert.match(printed[4], new RegExp(`^${escaped(over.run.id)}  forgotten: removed 1 worktree; `));
  for (const id of [running.id, ready.id, asked.id, parent.run.id]) {
    assert.ok(under('runs', `${id}.json`) && under('worktrees', id, LINE_NAME), `${id}: record and worktree kept`);
  }
  assert.ok(under('runs', `${asked.id}.asks`, 'retry-implement-2'), 'and the ask');
  assert.deepEqual(b.stopped, [], 'nothing stopped: cancelling is its own verb');

  await runWith(b.e, cancelRun(running.id));
  const pending = (await runWith(b.e, forgetRun(running.id))).refusal!;
  assert.ok(pending.startsWith('implement is pending. It was cancelled at '), pending);
  assert.ok(pending.includes(`nemia rm ${running.id}`), pending);
  b.settle(`${running.id}-implement`, 'stopped');
  assert.equal(
    (await runWith(b.e, forgetRun(running.id))).kind,
    'forgotten',
    'a person cancels: what is in flight is stopped by a tick, and the run is forgotten once it has settled, not before',
  );
  await runWith(b.e, cancelRun(ready.id));
  await runWith(b.e, cancelRun(asked.id));
  await runWith(b.e, cancelRun(child.id));
  for (const id of [ready.id, asked.id, parent.run.id])
    assert.equal(
      (await runWith(b.e, forgetRun(id))).kind,
      'forgotten',
      `${id}: a cancelled run files nothing and honours no ask; a child called off strands nothing`,
    );
  assert.ok(!under('runs', `${asked.id}.asks`) && !under('runs', `${asked.id}.cancelled`), 'its ask and its cancellation go with it');
});

test('REFUSED at shipped defaults: a check a pass filed and died before writing down is in flight too — on a cancelled run, which files nothing, it is what holds `nemia rm` until it settles', async () => {
  const run = await runPlaced(startRun({ brief: 'a check nobody wrote down', repo: aRepo(), workflowDir: folder('check: npm test') }));
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await Effect.runPromise(b.e.file({ id: `${run.id}-implement-check`, brief: 'npm test', cwd: '/', harness: 'check' }));
  const at = markCancelled(run.id);
  assert.equal(readRun(run.id).steps.implement.check, undefined, 'the check is filed, and the record never says so');

  const held = await runWith(b.e, forgetRun(run.id));
  assert.equal(
    held.refusal,
    `implement's check is pending. It was cancelled at ${at}, and a tick stops what is in flight: nemia rm ${run.id} once it has settled (nemia ls ${run.id}).`,
  );
  assert.ok(under('runs', `${run.id}.json`) && under('worktrees', run.id, LINE_NAME));
  b.settle(`${run.id}-implement-check`, 'stopped');
  assert.equal((await runWith(b.e, forgetRun(run.id))).kind, 'forgotten');
});

test("REFUSED at shipped defaults: `nemia rm --delete-branches` never deletes a branch its hand-off just committed onto — the inventory read it merged, at its base, before the step's work was committed there — and says it kept it, not merged", async () => {
  const repo = aRepo();
  const b = board();
  const p = await aParent(repo, b, { signed: true });
  fs.writeFileSync(path.join(p.wt, 'left.txt'), 'left uncommitted\n');
  const forgot = await runWith(b.e, forgetRun(p.run.id, { deleteBranches: true }));
  assert.equal(forgot.kind, 'forgotten');
  assert.deepEqual(
    forgot.handedOff.map((h) => h.branch),
    [p.branch],
  );
  assert.ok(hasBranch(repo, p.branch), 'the branch with the work the hand-off committed is kept');
  assert.equal(world().changed(repo, p.branch).join('\n'), 'left.txt');
  assert.match(forgetLineOf(forgot), new RegExp(`kept ${escaped(p.branch)}: not merged into ${escaped(p.run.branch)}`));
});

test("`nemia rm --delete-branches` deletes a branch merged into its run's base and keeps one that is not, saying why; `--force-unmerged` beside it deletes that one too; the base branch a `--no-worktree` run worked on is never touched — and the CLI refuses `--force-unmerged` alone, a flag it does not take, and an id that is not a name, before anything is read", async (t) => {
  const repo = aRepo();
  const b = board();
  const merged = await aParent(repo, b, { work: 'merged.txt' });
  mergedByHand(repo, merged.branch, 'Merge it');
  const unmerged = await aParent(repo, b, { work: 'unmerged.txt' });
  const forced = await aParent(repo, b, { work: 'forced.txt' });
  const base = merged.run.branch;

  const one = await rmTyped(t, b.e, merged.run.id, unmerged.run.id, '--delete-branches');
  assert.equal(one.error, undefined);
  assert.match(one.printed[0], new RegExp(`; deleted ${escaped(merged.branch)} \\(merged into ${base}\\)${escaped(FORGOT_ONE)}$`));
  assert.match(
    one.printed[1],
    new RegExp(
      `; kept ${escaped(unmerged.branch)}: not merged into ${base} — --force-unmerged deletes it, and the work on it${escaped(FORGOT_ONE)}$`,
    ),
  );
  assert.deepEqual([hasBranch(repo, merged.branch), hasBranch(repo, unmerged.branch)], [false, true]);

  const two = await rmTyped(t, b.e, forced.run.id, '--force-unmerged', '--delete-branches');
  assert.match(
    two.printed[0],
    new RegExp(`; deleted ${escaped(forced.branch)} \\(not merged into ${base}, forced\\)${escaped(FORGOT_ONE)}$`),
  );
  assert.equal(hasBranch(repo, forced.branch), false);

  const direct = await runPlaced(startRun({ brief: 'on the base itself', repo, workflowDir: oneStep(), isolate: false }));
  await runWith(b.e, advanceRun(readRun(direct.id)));
  b.settle(`${direct.id}-implement`, 'succeeded', SIGNED);
  const three = await rmTyped(t, b.e, direct.id, '--delete-branches', '--force-unmerged');
  assert.deepEqual(three.printed, [
    `${direct.id}  forgotten: no worktrees, it worked in ${repo} itself; removed runs/${direct.id}.json, runs/${direct.id}/; no branch of its own${FORGOT_ONE}`,
  ]);
  assert.ok(
    hasBranch(repo, base) && world().head(repo) === world().tip(repo, base),
    'the base branch and the repository are where they were',
  );

  const kept = await aParent(repo, b, { work: 'kept.txt' });
  const refused = async (args: string[], pattern: RegExp) => {
    const { printed, error } = await rmTyped(t, b.e, ...args);
    assert.equal(error?.exitCode, 2, args.join(' '));
    assert.match(error.message, pattern);
    assert.deepEqual(printed, [], 'refused before any run is read');
    assert.ok(under('runs', `${kept.run.id}.json`) && hasBranch(repo, kept.branch));
  };
  await refused(
    [kept.run.id, '--force-unmerged'],
    /^--force-unmerged forces --delete-branches to delete a branch not merged into its run's base branch, and alone deletes nothing: /,
  );
  await refused(
    [kept.run.id, '--force'],
    /^nemia rm does not take --force\. It takes the runs to forget, then --delete-branches, and --force-unmerged beside it: /,
  );
  await refused(['--delete-branches'], /^nemia rm takes the runs to forget, by id: /);

  for (const id of ['..', '.', 'runs/../..', '']) {
    const { printed, error } = await rmTyped(t, b.e, id);
    assert.equal(
      error?.exitCode,
      2,
      `${JSON.stringify(id)}: an id that is not a name names a directory that is not the run's, and \`..\` is the store itself`,
    );
    assert.deepEqual(printed, [
      `${id}  not forgotten: ${JSON.stringify(id)} is not a run's id, and nemia rm removes what is under WF_ROOT by id — lowercase letters, digits and dashes: give the id nemia ls prints, as in nemia rm add-a-flag-x1y2.`,
    ]);
    assert.ok(under('runs', `${kept.run.id}.json`) && under('worktrees', kept.run.id, LINE_NAME), 'the store is where it was');
  }
});

test("REFUSED at shipped defaults: a pass that read a run before `nemia rm` forgot it writes nothing back — the record stays gone — and a pass that reaches a run's asks as they are removed does not make their directory again; a record gone between the store's listing and its read is no run, and no failure", async (t) => {
  const repo = aRepo();
  const b = board();
  const p = await aParent(repo, b, { work: 'done.txt' });
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const heldAfterReadingTheRun = {
    ...b.e,
    view: (id: string) =>
      Effect.flatMap(b.e.view(id), (view) =>
        Effect.as(
          Effect.promise(() => gate),
          view,
        ),
      ),
  };
  const pass = runWith(heldAfterReadingTheRun, advanceRun(readRun(p.run.id)));
  assert.equal((await runWith(b.e, forgetRun(p.run.id))).kind, 'forgotten');
  release();
  const after = await pass;
  assert.equal(after.status, 'succeeded');
  assert.ok(after.run.tips, "the pass after it finished had its branch's tip to write");
  assert.ok(!under('runs', `${p.run.id}.json`), 'and did not write them into a record it made again');
  assert.deepEqual(
    listRuns().filter((r) => r.id === p.run.id),
    [],
  );

  const q = await aParent(repo, b, { work: 'asked.txt' });
  const asks = path.join(ROOT, 'runs', `${q.run.id}.asks`);
  fs.mkdirSync(asks);
  fs.writeFileSync(
    path.join(asks, 'retry-implement-1'),
    JSON.stringify({ step: 'implement', try: 1, mode: 'nudge', at: '2026-09-16T00:00:00.000Z' }),
  );
  const mkdir = fs.mkdirSync;
  t.mock.method(fs, 'mkdirSync', (at: string, ...rest: unknown[]) => {
    if (String(at).startsWith(asks)) fs.rmSync(asks, { recursive: true, force: true });
    return (mkdir as (...a: unknown[]) => unknown)(at, ...rest);
  });
  await runWith(b.e, advanceRun(readRun(q.run.id)));
  (fs.mkdirSync as unknown as { mock: { restore: () => void } }).mock.restore();
  assert.ok(
    !fs.existsSync(asks),
    'a spent ask the pass moves into `done/` as `nemia rm` removes the directory: no asks directory made again',
  );

  const vanished = path.join(ROOT, 'runs', 'vanished-a1b2.json');
  fs.symlinkSync(path.join(ROOT, 'nowhere.json'), vanished);
  try {
    assert.ok(listRuns().length > 0);
    assert.ok(
      !listRuns().some((r) => r.id === 'vanished-a1b2'),
      'listed, then gone before it is read: a dangling link reads as exactly that',
    );
  } finally {
    fs.rmSync(vanished);
  }
});

test('a run whose tasks the engine no longer knows is forgotten; so is a record from before runs froze their workflow whose folder is gone — which every pass, `nemia ls` and `nemia decide` read and died on — and the line says so; a run with no record is `no such run`, and what was left under its id is removed and named', async (t) => {
  const { e: neverHeardOfAnything } = recording();
  const legacyDir = fs.mkdtempSync(path.join(ROOT, 'legacy-'));
  fs.writeFileSync(path.join(legacyDir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  const legacy = { ...aRun('legacy-run-9z9z', { implement: { taskId: 'legacy-run-9z9z-implement' } }), workflowDir: legacyDir };
  writeRun(legacy);
  assert.equal(stepsOf(readRun(legacy.id)).length, 1, 'read from the folder, since the record froze nothing');
  fs.rmSync(legacyDir, { recursive: true });
  assert.throws(
    () => stepsOf(readRun(legacy.id)),
    (err: Error) =>
      err.message.startsWith(`run ${legacy.id}: it froze no workflow at nemia start`) &&
      err.message.includes(`does not load: no workflow folder at ${legacyDir}`),
  );

  const { printed, error } = await rmTyped(t, neverHeardOfAnything, legacy.id);
  assert.equal(error, undefined);
  assert.deepEqual(printed, [
    `${legacy.id}  forgotten: no worktrees, it worked in /repo itself; removed runs/${legacy.id}.json; no branch of its own; its workflow was never frozen, and no workflow folder at ${legacyDir}`,
  ]);

  fs.writeFileSync(path.join(ROOT, 'runs', 'gone-run-3c4d.cancelled'), '2026-09-16T00:00:00.000Z');
  fs.mkdirSync(path.join(ROOT, 'runs', 'gone-run-3c4d.asks', 'done'), { recursive: true });
  const leftover = await rmTyped(t, neverHeardOfAnything, 'gone-run-3c4d');
  assert.equal(leftover.error, undefined, 'no record is no refusal');
  assert.equal(leftover.printed.length, 1);
  const [gone] = leftover.printed;
  assert.ok(gone.startsWith('gone-run-3c4d  no such run'), gone);
  assert.ok(gone.includes('runs/gone-run-3c4d.cancelled') && gone.includes('runs/gone-run-3c4d.asks/'), gone);
  assert.ok(!under('runs', 'gone-run-3c4d.asks') && !under('runs', 'gone-run-3c4d.cancelled'));
});

test('REFUSED at shipped defaults: a step a pass filed and died before writing down, on a run then cancelled — `nemia rm` finds it on the engine, in flight, and says a tick stops it; the next tick does, and once it has settled the run is forgotten', async () => {
  const b = board();
  const run = await runPlaced(startRun({ brief: 'filed and never written down', repo: aRepo(), workflowDir: folder() }));
  const taskId = `${run.id}-implement`;
  await Effect.runPromise(b.e.file({ id: taskId, brief: 'implement it', cwd: '/' }));
  const at = markCancelled(run.id);
  assert.equal(readRun(run.id).steps.implement.taskId, null, 'the pass that filed it died there: the record never names it');

  assert.equal(
    (await runWith(b.e, forgetRun(run.id))).refusal,
    `implement is pending. It was cancelled at ${at}, and a tick stops what is in flight: nemia rm ${run.id} once it has settled (nemia ls ${run.id}).`,
  );
  assert.ok(under('runs', `${run.id}.json`));
  const pass = await runWith(b.e, advanceRun(readRun(run.id)));
  assert.deepEqual([b.stopped, pass.filed, b.filings], [[taskId], [], [taskId]], 'stopped, and nothing filed');
  b.settle(taskId, 'stopped');
  assert.equal((await runWith(b.e, forgetRun(run.id))).kind, 'forgotten');
});

/** The package's place whose `inventory` is not heard, in `said`, as a place that cannot read its repository answers. */
const placeUnread = (said: string) => PlaceTag.layer(placeOver(stand().place, { inventory: () => unreadBy('inventory', said) }));

test("REFUSED at shipped defaults: a place whose inventory is not heard refuses `nemia rm` as not read, never as nothing to remove — its worktree with the step's work, its branch, its record and its cancellation are all still there, and no task is written down to forget", async () => {
  const repo = aRepo();
  const b = board();
  const p = await aParent(repo, b, { work: 'kept.txt' });
  fs.writeFileSync(path.join(p.wt, 'uncommitted.txt'), 'work\n');
  markCancelled(p.run.id);
  const planted = placeUnread('the inventory broke');

  const forgot = await runWith(b.e, forgetRun(p.run.id).pipe(Effect.provide(planted)));
  assert.equal(forgot.kind, 'refused');
  assert.equal(
    forgot.refusal,
    `its place's inventory of what it left in ${repo} was not heard — the inventory broke; nothing was touched, as nothing says what is there: nemia rm ${p.run.id} again once the place reads it`,
  );
  assert.ok(fs.existsSync(path.join(p.wt, 'uncommitted.txt')) && worktreesOf(repo).includes(p.wt), 'the worktree and its work stay');
  assert.ok(hasBranch(repo, p.branch), 'the branch stays');
  assert.ok(under('runs', `${p.run.id}.json`) && under('runs', `${p.run.id}.cancelled`), 'the record and its cancellation stay');
  assert.ok(!under('forgetting', `${p.run.id}.json`), 'no task written down to forget');
  assert.equal((await runWith(b.e, forgetRun(p.run.id))).kind, 'forgotten', 'the shipped place reads it, and the run is forgotten');
});

test("REFUSED at shipped defaults: `nemia rm` on a name that is a live run's id plus the suffix of one of its files — `<id>.json`, `<id>.cancelled`, `<id>.asks`, as `ls runs/` gives them — exit 2, saying the id to give; its record, cancellation and asks stay. Nor does a run with no record take a live run's check logs: `nemia rm <id>-implement` leaves `<id>-implement-check.stderr`, nor a run's whose record does not read", async (t) => {
  const repo = aRepo();
  const b = board();
  const live = await aParent(repo, b);
  const id = live.run.id;
  markCancelled(id);
  const asks = path.join(ROOT, 'runs', `${id}.asks`);
  fs.mkdirSync(asks, { recursive: true });
  fs.writeFileSync(
    path.join(asks, 'retry-implement-2'),
    JSON.stringify({ step: 'implement', try: 2, mode: 'nudge', at: '2026-09-16T00:00:00.000Z' }),
  );
  fs.mkdirSync(path.join(ROOT, 'checks'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'checks', `${id}-implement-check.stderr`), "the live run's\n");

  for (const [named, suffix] of [
    [`${id}.json`, '.json'],
    [`${id}.cancelled`, '.cancelled'],
    [`${id}.asks`, '.asks'],
  ] as const) {
    const { printed, error } = await rmTyped(t, b.e, named);
    assert.equal(error?.exitCode, 2, named);
    assert.deepEqual(printed, [
      `${named}  not forgotten: "${named}" is not a run's id: ${suffix} is on the name of one of its files under runs/, not on the run's. Give the id nemia ls prints: nemia rm ${id}.`,
    ]);
  }
  for (const other of ['R-XYZ', 'r_xyz', 'r.xyz']) {
    const { printed, error } = await rmTyped(t, b.e, other);
    assert.deepEqual(
      [error?.exitCode, printed],
      [
        2,
        [
          `${other}  not forgotten: "${other}" is not a run's id, and nemia rm removes what is under WF_ROOT by id — lowercase letters, digits and dashes: give the id nemia ls prints, as in nemia rm add-a-flag-x1y2.`,
        ],
      ],
    );
  }
  assert.ok(
    under('runs', `${id}.json`) && under('runs', `${id}.cancelled`) && under('runs', `${id}.asks`, 'retry-implement-2'),
    'the record, its cancellation and its ask stay',
  );
  assert.ok(readRun(id).cancelledAt);

  const sibling = await rmTyped(t, b.e, `${id}-implement`);
  assert.deepEqual([sibling.error, sibling.printed], [undefined, [`${id}-implement  no such run — nothing to forget`]]);
  assert.ok(under('checks', `${id}-implement-check.stderr`), "the live run's check log stays");

  const torn = 'torn-record-x2';
  fs.writeFileSync(path.join(ROOT, 'runs', `${torn}.json`), '{ "id": ');
  fs.writeFileSync(path.join(ROOT, 'checks', `${torn}-review-check.stderr`), "a torn run's\n");
  t.after(() => fs.rmSync(path.join(ROOT, 'runs', `${torn}.json`), { force: true }));
  const prefix = await rmTyped(t, b.e, 'torn-record');
  assert.deepEqual([prefix.error, prefix.printed], [undefined, ['torn-record  no such run — nothing to forget']]);
  assert.ok(under('checks', `${torn}-review-check.stderr`), 'nor a run whose record does not read');
});

test('REFUSED at shipped defaults: a pass that read a `--no-worktree` run before `nemia rm` forgot it hands nothing off and collects nothing afterwards — its workspace, the repository, is still there, and its files directory is not made again', async () => {
  const repo = aRepo();
  const b = board();
  const run = await runPlaced(startRun({ brief: 'notes on the base itself', repo, workflowDir: oneStep(), isolate: false }));
  await runWith(b.e, advanceRun(readRun(run.id)));
  fs.writeFileSync(path.join(repo, 'notes.md'), 'notes\n');
  b.settle(`${run.id}-implement`, 'succeeded', { ...SIGNED, artifacts: ['notes.md'] });

  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  let reading!: () => void;
  const read = new Promise<void>((r) => {
    reading = r;
  });
  const slow = {
    ...b.e,
    view: (id: string) =>
      Effect.tap(b.e.view(id), () =>
        Effect.promise(() => {
          reading();
          return gate;
        }),
      ),
  };
  const pass = runWith(slow, advanceRun(readRun(run.id)));
  await read;
  assert.equal((await runWith(b.e, forgetRun(run.id))).kind, 'forgotten');
  fs.writeFileSync(path.join(repo, 'later.txt'), "a person's edit, after the run was forgotten\n");
  release();
  await pass;

  assert.ok(!under('runs', run.id), 'no files directory without a record');
  assert.equal(
    uncommitted(repo),
    'later.txt\nnotes.md',
    "and nothing of a person's checkout committed under the step's name: the step's file and the person's edit, as they were left",
  );
  assert.deepEqual(subjects(repo), ['base']);
});

test('REFUSED at shipped defaults: a pass that read a run before it was cancelled and `nemia rm` forgot it files no step of it afterwards — a follower due by what the pass read stays unfiled', async () => {
  const repo = aRepo();
  const b = board();
  const dir = oneStep();
  fs.writeFileSync(path.join(dir, 'review.md'), '---\nafter: implement\nplace: git\n---\nreview it\n');
  const run = await runPlaced(startRun({ brief: 'cancelled and forgotten with a follower due', repo, workflowDir: dir }));
  await runWith(b.e, advanceRun(readRun(run.id)));
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);

  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  let reading!: () => void;
  const read = new Promise<void>((r) => {
    reading = r;
  });
  const slow = {
    ...b.e,
    view: (id: string) =>
      Effect.tap(b.e.view(id), () =>
        Effect.promise(() => {
          reading();
          return gate;
        }),
      ),
  };
  const pass = runWith(slow, advanceRun(readRun(run.id)));
  await read;
  await runWith(b.e, cancelRun(run.id));
  assert.equal((await runWith(b.e, forgetRun(run.id))).kind, 'forgotten');
  release();
  assert.deepEqual((await pass).filed, [], 'nothing filed for a run with no record');
  assert.deepEqual(b.filings, [`${run.id}-implement`]);
});

test("`nemia rm`'s program, given the engine as a service, answers what its plain face answers: the face runs the program and adds nothing", async () => {
  const { Effect } = await import('effect');
  const { forgetRun } = await import('../src/forget/forget.verb.ts');
  const { EngineService } = await import('../src/runtime-client.ts');
  const b = board();
  const run = await runPlaced(startRun({ brief: 'forgotten through its program', repo: aRepo(), workflowDir: folder() }));
  await runWith(b.e, advanceRun(readRun(run.id)));
  const program = (how: ForgetHow) => runPlaced(forgetRun(run.id, how).pipe(Effect.provide(EngineService.layer(b.e))));

  const refused = await program({});
  assert.equal(refused.kind, 'refused', 'a step in flight: nothing is touched');
  assert.deepStrictEqual(refused, await runWith(b.e, forgetRun(run.id)));

  const wt = readRun(run.id).steps.implement.workspace!;
  b.settle(`${run.id}-implement`, 'failed');
  await runWith(b.e, advanceRun(readRun(run.id)));
  const forgot = await program({ deleteBranches: true, forceUnmerged: true });
  assert.deepEqual([forgot.kind, forgot.removed], ['forgotten', [wt]]);
  assert.deepEqual(
    forgot.branches.map((f) => [f.branch, f.deleted]),
    [[`wf/${run.id}/${LINE_NAME}`, true]],
    'what it was asked, honoured',
  );
  assert.ok(!under('runs', `${run.id}.json`) && !under('worktrees', run.id));
  assert.deepStrictEqual(await runWith(b.e, forgetRun(run.id)), await program({}), 'no record left: both say so the same');
});

/** An engine every verb of which fails the test, naming the verb: for a call that must ask the engine nothing. */
const untouched = (e: Engine): Engine =>
  Object.fromEntries(Object.keys(e).map((verb) => [verb, () => assert.fail(`the engine was asked \`${verb}\``)])) as unknown as Engine;

test('REFUSED at shipped defaults: `nemia rm` of an id that is not a name rejects with the `Invalid` itself, exit code 2, in its words, before the store or the engine is read', async () => {
  const { Invalid } = await import('../src/refusal/refusal.ts');
  const { idRefusal } = await import('../src/forget/forget.ts');
  writeRun(aRun('climbed', {}));
  fs.renameSync(path.join(ROOT, 'runs', 'climbed.json'), path.join(ROOT, 'climbed.json'));
  const err = await runWith(untouched(board().e), forgetRun('../climbed')).then(
    () => assert.fail('nemia rm of ../climbed resolved'),
    (x: unknown) => x,
  );
  assert.ok(err instanceof Invalid, `an Invalid, not ${String(err)}`);
  assert.equal(err.exitCode, 2);
  assert.equal(err.message, idRefusal('../climbed'));
  assert.ok(fs.existsSync(path.join(ROOT, 'climbed.json')), 'the record its path climbs to is not read, nor removed');
  fs.rmSync(path.join(ROOT, 'climbed.json'));
});

test("`nemia rm`'s refusal is its program's typed failure; anything else is a defect, which the face rejects with as it was thrown", async () => {
  const { Effect } = await import('effect');
  const { forgetRun } = await import('../src/forget/forget.verb.ts');
  const { EngineService } = await import('../src/runtime-client.ts');
  const b = board();
  const recovered = (e: Engine, id: string) =>
    runPlaced(
      forgetRun(id, {}).pipe(
        Effect.catchTag('Invalid', (r) => Effect.succeed(r.message)),
        Effect.provide(EngineService.layer(e)),
      ),
    );
  assert.match(String(await recovered(b.e, '../x')), /^"\.\.\/x" is not a run's id/);
  fs.writeFileSync(path.join(ROOT, 'runs', 'garbled.json'), '{ not json');
  assert.match(String(await recovered(b.e, 'garbled')), /is not JSON/, "a refusal the store threw is the program's failure too");
  assert.ok(under('runs', 'garbled.json'), 'and nothing removed');
  fs.rmSync(path.join(ROOT, 'runs', 'garbled.json'));

  const run = await runPlaced(startRun({ brief: 'its journal will not read', repo: aRepo(), workflowDir: folder() }));
  await runWith(b.e, advanceRun(readRun(run.id)));
  const boom = new Error('journal');
  const broken = {
    ...b.e,
    view: () => Effect.die(boom),
  };
  const died = await recovered(broken, run.id).then(
    () => assert.fail('a defect recovered as a refusal'),
    (x: unknown) => x,
  );
  assert.equal(died, boom, 'not a failure the program may catch by its tag: the error itself');
  const uncaught = await runPlaced(
    forgetRun(run.id, {}).pipe(
      Effect.catch(() => Effect.succeed('caught')),
      Effect.provide(EngineService.layer(broken)),
    ),
  ).then(
    () => assert.fail('a defect caught as a failure'),
    (x: unknown) => x,
  );
  assert.equal(uncaught, boom, 'nor any failure at all: a defect, which no `Effect.catch` recovers');
  const face = await runWith(broken, forgetRun(run.id)).then(
    () => assert.fail('nemia rm over a journal that does not read resolved'),
    (x: unknown) => x,
  );
  assert.equal(face, boom);
  assert.ok(under('runs', `${run.id}.json`), 'nothing removed');
});

/**
 * `nemia rm`'s program says in its type what it needs and what it refuses: the engine, and a refusal. Nothing calls this: the
 * typecheck reads its lines, and an `@ts-expect-error` over code that stops erring is the failure.
 */
async function _rmProgramTypes() {
  const { Effect } = await import('effect');
  const { forgetRun } = await import('../src/forget/forget.verb.ts');
  void (forgetRun('x', {}) satisfies EffectOf<Forgot, Refusal, EngineService | PlaceService>);
  // @ts-expect-error -- a refusal is its failure, so it is not an Effect that cannot fail
  void (forgetRun('x', {}) satisfies EffectOf<Forgot, never, EngineService>);
  // @ts-expect-error -- forgetRun requires EngineService, and runPromise takes no requirement
  void Effect.runPromise(forgetRun('x', {}));
}

/**
 * The programs of what a person asks of a run, and a runner of one over `e` as its plain face runs it: given the engine as a service.
 * Imported at the call, as `WF_ROOT` is read when the store loads.
 */
const verbPrograms = async () => {
  const { Effect } = await import('effect');
  const { EngineService } = await import('../src/runtime-client.ts');
  const { acceptRun, roundRun } = await import('../src/round/round.verb.ts');
  const { retryRun } = await import('../src/retry/retry.verb.ts');
  const { approveRun } = await import('../src/gate/gate.verb.ts');
  const { sayRun } = await import('../src/say/say.verb.ts');
  const { cancelRun } = await import('../src/cancel/cancel.verb.ts');
  const { storeRootLayer } = await import('../src/config/root.store.ts');
  const over = <A, E>(e: Engine, program: EffectOf<A, E, EngineService | PlaceService | StoreRoot>): Promise<A> =>
    Effect.runPromise(placed(program).pipe(Effect.provide(EngineService.layer(e)), Effect.provide(storeRootLayer(process.env))));
  return { Effect, EngineService, over, acceptRun, approveRun, cancelRun, retryRun, roundRun, sayRun };
};

/** What `p` rejects with, or a failed test when it resolves. */
const rejection = (p: Promise<unknown>, what: string): Promise<unknown> =>
  p.then(
    () => assert.fail(`${what} resolved`),
    (x: unknown) => x,
  );

test('the programs of `nemia round`, `nemia accept`, `nemia retry`, `nemia approve`, `nemia say` and `nemia cancel`, given the engine as a service, answer what their plain faces answer on the same store: each face runs its program and adds nothing', async (t) => {
  const v = await verbPrograms();
  const { cancelFile } = await import('../src/record/record.store.ts');
  const at = Date.parse('2026-09-30T08:00:00.000Z');
  const same = async <A extends object>(what: string, program: () => Promise<A>, face: () => Promise<A>) => {
    t.mock.timers.enable({ apis: ['Date'], now: at });
    try {
      const ran = await program();
      if ('file' in ran) fs.rmSync(String(ran.file));
      assert.deepStrictEqual(ran, await face(), what);
    } finally {
      t.mock.timers.reset();
    }
  };

  const run = await started(loopedThenShip());
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  for (const n of [1, 2]) {
    await toReview(b, run.id, n, true);
    assert.deepEqual((await runWith(b.e, advanceRun(readRun(run.id)))).looped, ['review'], `round ${n + 1}`);
  }
  await toReview(b, run.id, 3, true);
  await runWith(b.e, advanceRun(readRun(run.id)));
  await same(
    'nemia round',
    () => v.over(b.e, v.roundRun(run.id)),
    () => runWith(b.e, roundRun(run.id)),
  );
  fs.rmSync(path.join(asksDir(run.id), 'round-review-4'));
  await same(
    'nemia accept',
    () => v.over(b.e, v.acceptRun(run.id, undefined, ENOUGH)),
    () => runWith(b.e, acceptRun(run.id, undefined, ENOUGH)),
  );
  assert.deepEqual((await runWith(b.e, advanceRun(readRun(run.id)))).filed, ['ship']);
  b.settle(`${run.id}-ship`, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(run.id)));
  await same(
    'nemia approve',
    () => v.over(b.e, v.approveRun(run.id, 'ship', 'ship it')),
    () => runWith(b.e, approveRun(run.id, 'ship', 'ship it')),
  );

  const failed = await started(folder());
  await runWith(b.e, advanceRun(readRun(failed.id)));
  b.settle(`${failed.id}-implement`, 'failed');
  await runWith(b.e, advanceRun(readRun(failed.id)));
  await same(
    'nemia retry',
    () => v.over(b.e, v.retryRun(failed.id, 'implement', { mode: 'fresh' })),
    () => runWith(b.e, retryRun(failed.id, 'implement', { mode: 'fresh' })),
  );

  const running = await started(folder());
  await runWith(b.e, advanceRun(readRun(running.id)));
  const taskId = `${running.id}-implement`;
  b.settle(taskId, 'running');
  const told = await v.over(b.e, v.sayRun(running.id, 'implement', 'Start with the parser.'));
  const face = await runWith(b.e, sayRun(running.id, 'implement', 'Start with the parser.'));
  assert.deepStrictEqual(
    [told, face],
    b.said.get(taskId)!.map((said) => ({ ...face, said })),
    'nemia say: each journalled once, in turn',
  );

  await same(
    'nemia cancel',
    async () => {
      const cancelled = await v.over(b.e, v.cancelRun(running.id));
      fs.rmSync(cancelFile(running.id));
      return cancelled;
    },
    () => runWith(b.e, cancelRun(running.id)),
  );
  assert.deepEqual(b.stopped.slice(-2), [taskId, taskId], 'each asked the engine to stop the step');
});

test('REFUSED as a typed failure: a run not there is a `Missing`, and a state that forbids the verb a `Conflict`, which each program fails with in the words its plain face rejects with', async () => {
  const v = await verbPrograms();
  const recovered = <A>(e: Engine, program: EffectOf<A, Refusal, EngineService | PlaceService | StoreRoot>, tag: 'Missing' | 'Conflict') =>
    v.over(
      e,
      program.pipe(
        v.Effect.map(() => 'answered'),
        v.Effect.catchTag(tag, (r) => v.Effect.succeed(r.message)),
      ),
    );
  const b = board();
  assert.equal(
    await recovered(b.e, v.approveRun('no-such-run', 'x'), 'Missing'),
    'no such run: no-such-run. nemia approve takes a run by its id, as nemia ls lists it: nemia approve <runId> <step>.',
  );
  assert.equal(
    await recovered(b.e, v.acceptRun('no-such-run', undefined, ENOUGH), 'Missing'),
    'no such run: no-such-run. nemia accept takes a run by its id, as nemia ls lists it: nemia accept <runId> [<step>] --message "<why>".',
  );

  const run = await started(looped());
  await runWith(b.e, advanceRun(readRun(run.id)));
  b.settle(`${run.id}-implement`, 'running');
  const refusals: Array<[string, EffectOf<unknown, Refusal, EngineService | PlaceService | StoreRoot>, Promise<unknown>]> = [
    ['nemia retry', v.retryRun(run.id, 'implement', { mode: 'fresh' }), runWith(b.e, retryRun(run.id, 'implement', { mode: 'fresh' }))],
    ['nemia round', v.roundRun(run.id), runWith(b.e, roundRun(run.id))],
    ['nemia approve', v.approveRun(run.id, 'implement', 'ok'), runWith(b.e, approveRun(run.id, 'implement', 'ok'))],
  ];
  for (const [what, program, face] of refusals) {
    const err = await rejection(face, what);
    assert.ok(err instanceof Conflict, `${what}: a Conflict, not ${String(err)}`);
    assert.equal(await recovered(b.e, program, 'Conflict'), err.message, what);
  }
  assert.ok(!fs.existsSync(asksDir(run.id)), 'nothing written');
});

test("REFUSED as a typed failure: a record the store refuses to read is each program's `Invalid`, in the store's words, not a defect", async () => {
  const v = await verbPrograms();
  const e = board().e;
  fs.writeFileSync(path.join(ROOT, 'runs', 'garbled.json'), '{ not json');
  const programs: Array<[string, EffectOf<unknown, Refusal, EngineService | PlaceService | StoreRoot>]> = [
    ['nemia round', v.roundRun('garbled')],
    ['nemia accept', v.acceptRun('garbled', undefined, ENOUGH)],
    ['nemia retry', v.retryRun('garbled', 'implement', { mode: 'fresh' })],
    ['nemia approve', v.approveRun('garbled', 'implement')],
    ['nemia say', v.sayRun('garbled', 'implement', 'hello')],
    ['nemia cancel', v.cancelRun('garbled')],
  ];
  for (const [what, program] of programs) {
    const said = await v.over(
      e,
      program.pipe(
        v.Effect.map(() => 'answered'),
        v.Effect.catchTag('Invalid', (r) => v.Effect.succeed(r.message)),
      ),
    );
    assert.match(said, /is not JSON/, what);
  }
  assert.ok(!fs.existsSync(asksDir('garbled')) && !fs.existsSync(path.join(ROOT, 'runs', 'garbled.cancelled')), 'nothing written');
  fs.rmSync(path.join(ROOT, 'runs', 'garbled.json'));
});

test('a journal that does not read is a defect of each program, which no `Effect.catch` recovers, and its plain face rejects with it as it was thrown; nothing written', async () => {
  const v = await verbPrograms();
  const b = board();
  const run = await started(folder());
  await runWith(b.e, advanceRun(readRun(run.id)));
  const boom = new Error('journal');
  const broken = {
    ...b.e,
    view: () => Effect.die(boom),
  };
  const verbs: Array<[string, EffectOf<unknown, Refusal, EngineService | PlaceService | StoreRoot>, () => Promise<unknown>]> = [
    ['nemia round', v.roundRun(run.id), () => runWith(broken, roundRun(run.id))],
    ['nemia accept', v.acceptRun(run.id, undefined, ENOUGH), () => runWith(broken, acceptRun(run.id, undefined, ENOUGH))],
    [
      'nemia retry',
      v.retryRun(run.id, 'implement', { mode: 'fresh' }),
      () => runWith(broken, retryRun(run.id, 'implement', { mode: 'fresh' })),
    ],
    ['nemia approve', v.approveRun(run.id, 'implement', 'ok'), () => runWith(broken, approveRun(run.id, 'implement', 'ok'))],
    ['nemia say', v.sayRun(run.id, 'implement', 'hello'), () => runWith(broken, sayRun(run.id, 'implement', 'hello'))],
    ['nemia cancel', v.cancelRun(run.id), () => runWith(broken, cancelRun(run.id))],
  ];
  for (const [what, program, face] of verbs) {
    const uncaught = await rejection(v.over(broken, program.pipe(v.Effect.catch(() => v.Effect.succeed('caught')))), what);
    assert.equal(uncaught, boom, `${what}: a defect, which no \`Effect.catch\` recovers`);
    assert.equal(await rejection(face(), what), boom, `${what}: its face rejects with the error itself`);
  }
  assert.ok(!fs.existsSync(asksDir(run.id)) && !readRun(run.id).cancelledAt, 'nothing written');
});

test("REFUSED as a typed failure: `nemia say`'s engine refusing, exit code 2, is its program's `Conflict` in the engine's words; words not delivered, with no exit code, are a defect its face rejects with as it was thrown", async () => {
  const v = await verbPrograms();
  const b = board();
  const run = await started(folder());
  await runWith(b.e, advanceRun(readRun(run.id)));
  const taskId = `${run.id}-implement`;
  const unheard = await v.over(
    b.e,
    v.sayRun(run.id, 'implement', 'Start with the parser.').pipe(
      v.Effect.map(() => 'answered'),
      v.Effect.catchTag('Conflict', (r) => v.Effect.succeed(r.message)),
    ),
  );
  assert.ok(unheard.startsWith(`say: \`${taskId}\``) && unheard.includes('has not started an attempt'), unheard);

  b.settle(taskId, 'running');
  const lost = new Error(`say: ae/${taskId}/1 was not given the words (connect ECONNREFUSED). Nothing was journalled.`);
  const deaf = {
    ...b.e,
    say: () => Effect.die(lost),
  };
  const program = v.sayRun(run.id, 'implement', 'Widen the scope.').pipe(v.Effect.catch(() => v.Effect.succeed('caught')));
  assert.equal(await rejection(v.over(deaf, program), 'nemia say'), lost, 'a defect, which no `Effect.catch` recovers');
  assert.equal(await rejection(runWith(deaf, sayRun(run.id, 'implement', 'Widen the scope.')), 'nemia say'), lost);
  assert.deepEqual(b.said.get(taskId), undefined, 'nothing said');
});

test('`nemia cancel` asks the engine to stop before it marks the run: a stop the engine rejects leaves the run uncancelled, and its plain face rejects with it', async () => {
  const b = board();
  const run = await started(folder());
  await runWith(b.e, advanceRun(readRun(run.id)));
  const refused = new Error('stop: the engine is not listening');
  const deaf = {
    ...b.e,
    stop: () => Effect.die(refused),
  };
  assert.equal(await rejection(runWith(deaf, cancelRun(run.id)), 'nemia cancel'), refused);
  assert.equal(readRun(run.id).cancelledAt, undefined, 'not marked: asking again does both');
  assert.ok((await runWith(b.e, cancelRun(run.id))).run.cancelledAt, 'asked again, it stops and marks');
});

/**
 * The programs of what a person asks of a run say in their types what they need and what they refuse: the engine, the place where they
 * ask it, and a refusal. Nothing calls this: the typecheck reads its lines.
 */
async function _verbProgramTypes() {
  const v = await verbPrograms();
  void ([
    v.roundRun('x') satisfies EffectOf<RoundAsked, Refusal, EngineService>,
    v.acceptRun('x') satisfies EffectOf<Accepted, Refusal, EngineService>,
    v.retryRun('x', 'y', { mode: 'fresh' }) satisfies EffectOf<Asked, Refusal, EngineService | PlaceService | StoreRoot>,
    v.approveRun('x', 'y') satisfies EffectOf<Approved, Refusal, EngineService | PlaceService>,
    v.sayRun('x', 'y', 'z') satisfies EffectOf<Told, Refusal, EngineService>,
    v.cancelRun('x') satisfies EffectOf<Cancelled, Refusal, EngineService>,
  ] satisfies Array<EffectOf<unknown, Refusal, EngineService | PlaceService | StoreRoot>>);
  void [
    // @ts-expect-error -- a refusal is its failure, so it is not an Effect that cannot fail
    v.roundRun('x') satisfies EffectOf<RoundAsked, never, EngineService>,
    // @ts-expect-error -- a refusal is its failure, so it is not an Effect that cannot fail
    v.acceptRun('x') satisfies EffectOf<Accepted, never, EngineService>,
    // @ts-expect-error -- a refusal is its failure, so it is not an Effect that cannot fail
    v.retryRun('x', 'y', { mode: 'fresh' }) satisfies EffectOf<Asked, never, EngineService>,
    // @ts-expect-error -- a refusal is its failure, so it is not an Effect that cannot fail
    v.approveRun('x', 'y') satisfies EffectOf<Approved, never, EngineService>,
    // @ts-expect-error -- a refusal is its failure, so it is not an Effect that cannot fail
    v.sayRun('x', 'y', 'z') satisfies EffectOf<Told, never, EngineService>,
    // @ts-expect-error -- a refusal is its failure, so it is not an Effect that cannot fail
    v.cancelRun('x') satisfies EffectOf<Cancelled, never, EngineService>,
  ];
  void [
    // @ts-expect-error -- roundRun requires EngineService, and runPromise takes no requirement
    v.Effect.runPromise(v.roundRun('x')),
    // @ts-expect-error -- acceptRun requires EngineService, and runPromise takes no requirement
    v.Effect.runPromise(v.acceptRun('x')),
    // @ts-expect-error -- retryRun requires EngineService, and runPromise takes no requirement
    v.Effect.runPromise(v.retryRun('x', 'y', { mode: 'fresh' })),
    // @ts-expect-error -- approveRun requires EngineService, and runPromise takes no requirement
    v.Effect.runPromise(v.approveRun('x', 'y')),
    // @ts-expect-error -- sayRun requires EngineService, and runPromise takes no requirement
    v.Effect.runPromise(v.sayRun('x', 'y', 'z')),
    // @ts-expect-error -- cancelRun requires EngineService, and runPromise takes no requirement
    v.Effect.runPromise(v.cancelRun('x')),
  ];
}

/**
 * The views' programs, a runner of one over `e` as its plain face runs it, and an engine over `e` whose feed says `entries`. Imported at
 * the call, as `WF_ROOT` is read when the store loads.
 */
const viewPrograms = async () => {
  const { Effect } = await import('effect');
  const { EngineService } = await import('../src/runtime-client.ts');
  const views = await import('../src/views/views.verb.ts');
  const { NOTHING_READ, standingLiveOf: liveOf, standingReader } = await import('../src/standing/standing.verb.ts');
  const live = (ids: readonly string[]) => runPlaced(liveOf(ids));
  const over = <A, E>(e: Engine, program: EffectOf<A, E, EngineService>): Promise<A> =>
    Effect.runPromise(program.pipe(Effect.provide(EngineService.layer(e))));
  const fed = (e: Engine, entries: Effect.Success<ReturnType<Engine['feed']>>['entries']): Engine => ({
    ...e,
    feed: (after = 0) => Effect.succeed({ entries: entries.slice(after), cursor: entries.length }),
  });
  return { Effect, over, fed, live, nothingRead: () => standingReader(NOTHING_READ), ...views };
};

test('the programs of the views, given the engine as a service, answer what their plain faces answer on the same store: each face runs its program and adds nothing', async () => {
  const v = await viewPrograms();
  const { run, e, settle, outputs } = await throughCheck('check: npm test\nretries: 1', 'failed', 1);
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-implement-try2`, 'succeeded', SIGNED);
  await runWith(e, advanceRun(readRun(run.id)));
  const check = `${run.id}-implement-try2-check`;
  settle(check, 'failed', undefined, 1);
  outputs.set(`${check}.stdout`, 'not ok 1 - parses a trailing comma\n# fail 1\n');
  outputs.set(`${check}.stderr`, 'npm error Test failed.\n');
  const record = readRun(run.id);
  const earlier = `${run.id}-implement`;
  assert.deepEqual(record.steps.implement.tries?.[0].taskId, earlier, 'an earlier try, whose task only every try reads');

  for (const how of [{}, { earlierTries: false }]) {
    const ran = await v.over(e, v.taskPhasesRead(record, how));
    assert.equal(ran.views.has(earlier), how.earlierTries !== false, JSON.stringify(how));
  }

  const { phaseOf } = await v.over(e, v.taskPhasesRead(record));
  const steps = stepsOf(record);
  const failed = (p: TaskPhase) => p === 'failed' || p === 'stopped';
  const reports = await v.over(e, v.checkReportsRead(record, steps, phaseOf, failed));
  assert.deepStrictEqual(reports.get('implement'), {
    passed: false,
    command: 'npm test',
    verdict: 1,
    stdout: 'not ok 1 - parses a trailing comma\n# fail 1',
    stderr: 'npm error Test failed.',
  });
  await v.over(e, v.refusalRead('npm test', check));

  const at = '2026-09-30T08:00:00.000Z';
  const told = v.fed(e, [
    { taskId: 'a', event: { kind: 'filed', at, brief: 'a', cwd: '/repo' } },
    { taskId: 'a', event: { kind: 'admitted', at: '2026-09-30T08:01:00.000Z' } },
    { taskId: 'b', event: { kind: 'filed', at: '2026-09-30T08:02:00.000Z', brief: 'b', cwd: '/repo' } },
  ]);
  const first = await v.over(told, v.filingsRead(0, new Map([['c', at]])));
  assert.deepStrictEqual(first, {
    filed: new Map([
      ['c', at],
      ['a', at],
      ['b', '2026-09-30T08:02:00.000Z'],
    ]),
    cursor: 3,
    forgotten: 0,
  });
  assert.deepStrictEqual(
    await v.over(told, v.filingsRead(1)),
    { filed: new Map([['b', '2026-09-30T08:02:00.000Z']]), cursor: 3, forgotten: 0 },
    'from a cursor',
  );

  const repo = aRepo();
  const b = board();
  const shipped = await aParent(repo, b);
  b.settle(`${shipped.run.id}-implement`, 'succeeded', SIGNED);
  const running = await aParent(repo, b);
  const child = await runPlaced(startRun({ brief: 'the child', repo, workflowDir: folder(), after: [shipped.run.id, running.run.id] }));
  const ids = [shipped.run.id, running.run.id, 'no-such-run'];
  const git = await v.live(ids);
  const read = await Promise.all(ids.map((id) => v.over(b.e, v.parentRead(id, git))));
  assert.deepEqual(
    read.map((p) => p.shipped),
    [true, false, false],
  );
  const lookup = await v.over(b.e, v.parentsRead(readRun(child.id), git));
  assert.deepStrictEqual(ids.map(lookup), read);
});

test("REFUSED as a death in the runtime's words: a refusal the engine's view, logs or feed fails with is each views program's death, led by its verb, with exit code 2, which no `Effect.catch` recovers; anything else dies as it was thrown; a refusal of the store is still the program's failure, recoverable by its tag", async () => {
  const v = await viewPrograms();
  const { run, e } = await throughCheck('check: npm test', 'failed', 1);
  const record = readRun(run.id);
  const check = `${run.id}-implement-check`;
  const repo = aRepo();
  const b = board();
  const parent = await aParent(repo, b);
  b.settle(`${parent.run.id}-implement`, 'succeeded', SIGNED);
  const child = readRun((await runPlaced(startRun({ brief: 'the child', repo, workflowDir: folder(), after: [parent.run.id] }))).id);
  const failed = (): TaskPhase => 'failed';
  const live = await v.live([parent.run.id]);
  const reads = (err: unknown) => {
    const refuse = () => Effect.fail(err);
    return [
      ['taskPhases', 'view', v.taskPhasesRead(record), { ...e, view: refuse }],
      ['checkReports', 'logs', v.checkReportsRead(record, stepsOf(record), failed, () => true), { ...e, logs: refuse }],
      ['refusalOf', 'logs', v.refusalRead('npm test', check), { ...e, logs: refuse }],
      ['parentOf', 'view', v.parentRead(parent.run.id, live), { ...b.e, view: refuse }],
      ['parentsOf', 'view', v.parentsRead(child, live), { ...b.e, view: refuse }],
      ['readFilings', 'feed', v.filingsRead(), { ...e, feed: refuse }],
    ] as unknown as Array<[string, string, EffectOf<unknown, Refusal, EngineService>, Engine]>;
  };

  const refused = new StopRefused({ message: 'no such task' });
  for (const [what, verb, program, broken] of reads(refused)) {
    const died = (await rejection(v.over(broken, program), what)) as Error & { exitCode?: number };
    assert.equal(died.message, `${verb}: no such task`, `${what}: the refusal in the runtime's words, led by its verb`);
    assert.equal(died.exitCode, 2, what);
    const uncaught = await rejection(v.over(broken, program.pipe(v.Effect.catch(() => v.Effect.succeed('caught')))), what);
    assert.equal((uncaught as Error).message, `${verb}: no such task`, `${what}: a death, which no \`Effect.catch\` recovers`);
  }

  const boom = new Error('journal');
  for (const [what, , program, broken] of reads(boom)) {
    const uncaught = await rejection(v.over(broken, program.pipe(v.Effect.catch(() => v.Effect.succeed('caught')))), what);
    assert.equal(uncaught, boom, `${what}: a defect, which no \`Effect.catch\` recovers`);
    assert.equal(await rejection(v.over(broken, program), what), boom, `${what}: the program rejects with the error itself`);
  }

  const unreadable = new Missing({ message: 'git has no such repository' });
  const git: BranchReader = {
    ...live,
    has: () => {
      throw unreadable;
    },
  };
  const recovered = await v.over(b.e, v.parentRead(parent.run.id, git).pipe(v.Effect.catchTag('Missing', (r) => v.Effect.succeed(r))));
  assert.equal(recovered, unreadable, 'a refusal of git is the program’s failure, recovered by its tag');
});

test('a parent whose frozen steps cannot be read has not shipped: its views program answers so, neither failing nor dying, and asks git nothing of its branches', async () => {
  const v = await viewPrograms();
  const repo = aRepo();
  const b = board();
  const dir = oneStep();
  const p = await aParent(repo, b, { workflowDir: dir });
  b.settle(`${p.run.id}-implement`, 'succeeded', SIGNED);
  const record = readRun(p.run.id);
  delete record.workflow;
  writeRun(record);
  fs.rmSync(dir, { recursive: true });
  assert.throws(() => stepsOf(readRun(p.run.id)), 'its steps do not read');
  const asked: string[] = [];
  const read = await v.live([p.run.id]);
  const git: BranchReader = {
    ...read,
    shipped: (run, branch) => {
      asked.push(branch);
      return read.shipped(run, branch);
    },
  };
  const unshipped = { record: readRun(p.run.id), shipped: false };
  assert.deepStrictEqual(await v.over(b.e, v.parentRead(p.run.id, git)), unshipped, 'no `catch`: it answers');
  assert.deepEqual(asked, [], 'no branch of it asked');
});

/**
 * The views' programs say in their types what they need and what they refuse: the engine, and a refusal. Nothing calls this: the
 * typecheck reads its lines.
 */
async function _viewProgramTypes() {
  const v = await viewPrograms();
  const run = aRun('x', {});
  const failed = (): TaskPhase => 'failed';
  void ([
    v.taskPhasesRead(run) satisfies EffectOf<
      { views: Map<string, TaskView>; phaseOf: (taskId: string) => TaskPhase },
      Refusal,
      EngineService
    >,
    v.checkReportsRead(run, [], failed, () => true) satisfies EffectOf<Map<string, CheckReport>, Refusal, EngineService>,
    v.refusalRead('x', 'y') satisfies EffectOf<CheckRefusal, Refusal, EngineService>,
    v.parentRead('x', v.nothingRead()) satisfies EffectOf<ParentRun, Refusal, EngineService>,
    v.parentsRead(run, v.nothingRead()) satisfies EffectOf<(id: string) => ParentRun, Refusal, EngineService>,
    v.filingsRead() satisfies EffectOf<{ filed: Map<string, string>; cursor: number }, Refusal, EngineService>,
  ] satisfies Array<EffectOf<unknown, Refusal, EngineService>>);
  void [
    // @ts-expect-error -- a refusal is its failure, so it is not an Effect that cannot fail
    v.parentRead('x', v.nothingRead()) satisfies EffectOf<ParentRun, never, EngineService>,
  ];
  void [
    v.taskPhasesRead(run) satisfies EffectOf<unknown, never, EngineService>,
    v.filingsRead() satisfies EffectOf<unknown, never, EngineService>,
  ];
  void [
    // @ts-expect-error -- taskPhasesRead requires EngineService, and runPromise takes no requirement
    v.Effect.runPromise(v.taskPhasesRead(run)),
    // @ts-expect-error -- parentRead requires EngineService, and runPromise takes no requirement
    v.Effect.runPromise(v.parentRead('x')),
    // @ts-expect-error -- filingsRead requires EngineService, and runPromise takes no requirement
    v.Effect.runPromise(v.filingsRead()),
  ];
}

/** The start program, its face, and what a test of either reads. Imported at the call, as `WF_ROOT` is read when the store loads. */
const startProgram = async () => {
  const { Effect } = await import('effect');
  const { startRun } = await import('../src/start/start.verb.ts');
  const { Invalid, isRefusal } = await import('../src/refusal/refusal.ts');
  const { inputsDir, runsDir } = await import('../src/record/record.store.ts');
  const { runStore } = await import('../src/record/files.store.ts');
  return { Effect, startRun, Invalid, isRefusal, inputsDir, runsDir, runStore };
};

/**
 * A team whose steps say `workspace: folder`, in a chain, its writer an agent of its own: a run of it works in folders it makes, with no
 * git repository, and renders the writer.
 */
const folderTeam = () => {
  const root = fs.mkdtempSync(path.join(ROOT, 'team-'));
  const dir = path.join(root, 'notes');
  fs.mkdirSync(path.join(root, 'agents'));
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(root, 'agents', 'writer.md'), '---\nrole: Writer\ndescription: Writes the note.\n---\nWrite the note.\n');
  fs.writeFileSync(path.join(dir, 'write.md'), '---\nagent: writer\nworkspace: folder\npermissionMode: dontAsk\n---\nwrite the note\n');
  fs.writeFileSync(path.join(dir, 'review.md'), '---\nworkspace: folder\npermissionMode: dontAsk\nafter: write\n---\nreview the note\n');
  return dir;
};

/** What `fn` threw, or a failure of the test when it returned. */
const thrown = (fn: () => unknown, what: string): unknown => {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return assert.fail(`${what} returned`);
};

/** What `fn`'s promise rejected with, or a failure of the test when it resolved. */
const rejected = async (fn: () => Promise<unknown>, what: string): Promise<unknown> => {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  return assert.fail(`${what} resolved`);
};

test('the start program answers what its plain face answers on the same store: a repository run with an input, a gate and a parent, and a folder run', async () => {
  const s = await startProgram();
  const repo = aRepo();
  const parent = await runPlaced(startRun({ brief: 'the parent', repo, workflowDir: oneStep() }));
  const input = path.join(fs.mkdtempSync(path.join(ROOT, 'given-')), 'notes.md');
  fs.writeFileSync(input, 'the notes\n');
  const cases: Array<[string, Parameters<typeof startRun>[0]]> = [
    ['a repository run', { brief: 'the child', repo, workflowDir: TEAM_DEV, inputs: [input], gates: ['review'], after: [parent.id] }],
    ['a folder run', { brief: 'the note', repo: ROOT, workflowDir: folderTeam(), inputs: [input] }],
  ];
  const differ = ['id', 'workspace', 'branch', 'baseRef', 'createdAt'];
  const same = (r: Run) => Object.fromEntries(Object.entries(r).filter(([k]) => !differ.includes(k)));
  for (const [what, opts] of cases) {
    const ran = await s.Effect.runPromise(placed(s.startRun(opts)));
    const face = await runPlaced(startRun(opts));
    const written = (r: Run) => JSON.parse(JSON.stringify(r)) as Run;
    assert.deepStrictEqual(written(ran), readRun(ran.id), `${what}: the program's run is on the record`);
    assert.deepStrictEqual(written(face), readRun(face.id), `${what}: the face's run is on the record`);
    assert.deepStrictEqual(same(written(ran)), same(written(face)), what);
    assert.ok(fs.existsSync(path.join(s.inputsDir(ran), 'notes.md')), `${what}: its input copied`);
    assert.ok(fs.statSync(path.join(s.runsDir(), ran.id, 'agents')).isDirectory(), `${what}: its agents rendered`);
  }
});

test("REFUSED as a typed failure at `nemia start`: each refusal is the start program's `Invalid`, in the words its face throws with exit 2, and nothing is written", async () => {
  const s = await startProgram();
  const repo = aRepo();
  const fan = fs.mkdtempSync(path.join(ROOT, 'fan-'));
  fs.writeFileSync(path.join(fan, 'a.md'), '---\nplace: git\n---\nside a\n');
  fs.writeFileSync(path.join(fan, 'b.md'), '---\nplace: git\n---\nside b\n');
  const cases: Array<[string, Parameters<typeof startRun>[0]]> = [
    ['--repo on a folder team', { brief: 'x', repo, repoNamed: true, workflowDir: folderTeam() }],
    ['a gate naming no step', { brief: 'x', repo, workflowDir: folder(), gates: ['nowhere'] }],
    ['an input not there', { brief: 'x', repo, workflowDir: folder(), inputs: [path.join(ROOT, 'no-such-input.md')] }],
    ['after an unknown run', { brief: 'x', repo, workflowDir: folder(), after: ['no-such-run'] }],
    ['--no-worktree on a fan-out', { brief: 'x', repo, workflowDir: fan, isolate: false }],
  ];
  for (const [what, opts] of cases) {
    const before = fs.readdirSync(s.runsDir()).sort();
    const recovered = s.Effect.runSync(placed(s.startRun(opts)).pipe(s.Effect.catchTag('Invalid', (r) => s.Effect.succeed(r))));
    assert.ok(recovered instanceof s.Invalid, `${what}: an Invalid, recovered by its tag`);
    const err = await rejected(async () => await runPlaced(startRun(opts)), what);
    assert.ok(err instanceof s.Invalid, `${what}: the face throws the Invalid itself, not ${String(err)}`);
    assert.equal(err.exitCode, 2, what);
    assert.equal(recovered.message, err.message, what);
    assert.deepEqual(fs.readdirSync(s.runsDir()).sort(), before, `${what}: nothing written`);
  }
});

test('a run whose inputs cannot be copied is what the start program dies of, not a refusal: its face throws the same exit-1 Error, and no record or directory is left', async (t) => {
  const s = await startProgram();
  const input = path.join(fs.mkdtempSync(path.join(ROOT, 'given-')), 'notes.md');
  fs.writeFileSync(input, 'the notes\n');
  const opts = { brief: 'unwritable', repo: aRepo(), workflowDir: folder(), inputs: [input] };
  const before = fs.readdirSync(s.runsDir()).sort();
  fs.chmodSync(s.runsDir(), 0o555);
  t.after(() => fs.chmodSync(s.runsDir(), 0o755));
  const died = thrown(
    () => s.Effect.runSync(placed(s.startRun(opts)).pipe(s.Effect.catch(() => s.Effect.succeed('caught')))),
    'the program',
  );
  const face = await rejected(async () => await runPlaced(startRun(opts)), 'the face');
  fs.chmodSync(s.runsDir(), 0o755);
  for (const [what, err] of [
    ['the program', died],
    ['the face', face],
  ] as const) {
    assert.ok(err instanceof Error && !s.isRefusal(err), `${what}: an Error, not a refusal: ${String(err)}`);
    assert.equal((err as Error & { exitCode?: number }).exitCode, 1, what);
    assert.match(err.message, /^--input: the run's files could not be copied into /, what);
  }
  const anyId = (err: unknown) => (err as Error).message.replaceAll(/unwritable-[a-z0-9]+/g, '<id>');
  assert.equal(anyId(died), anyId(face), 'in the same words, but for the run id');
  assert.deepEqual(fs.readdirSync(s.runsDir()).sort(), before, 'no record, and no run directory');
});

test(
  'a run that dies once its own directory is made takes that directory with it: an input that cannot be read, a skill that cannot be ' +
    'rendered — exit 1, and nothing of it is left',
  { skip: process.getuid?.() === 0 && 'root reads a file of mode 000' },
  async (t) => {
    const s = await startProgram();
    const unreadable = (at: string) => {
      fs.writeFileSync(at, 'kept from the run\n');
      fs.chmodSync(at, 0o000);
      t.after(() => fs.chmodSync(at, 0o644));
    };
    const input = path.join(fs.mkdtempSync(path.join(ROOT, 'given-')), 'notes.md');
    unreadable(input);
    const team = folderTeam();
    const skill = path.join(path.dirname(team), 'skills', 'noting');
    fs.mkdirSync(skill, { recursive: true });
    fs.writeFileSync(path.join(skill, 'SKILL.md'), '---\nname: noting\ndescription: How a note is kept.\n---\nKeep it short.\n');
    unreadable(path.join(skill, 'form.md'));
    const writer = path.join(path.dirname(team), 'agents', 'writer.md');
    fs.writeFileSync(writer, fs.readFileSync(writer, 'utf8').replace('description:', 'skills: noting\ndescription:'));
    const cases: Array<[string, Parameters<typeof startRun>[0], RegExp]> = [
      ['an input', { brief: 'unreadable', repo: aRepo(), workflowDir: folder(), inputs: [input] }, /^--input: the run's files could/],
      ['a skill', { brief: 'unrendered', repo: ROOT, workflowDir: team }, /^the steps' agents could not be rendered into /],
    ];
    for (const [what, opts, said] of cases) {
      const before = fs.readdirSync(s.runsDir()).sort();
      const err = await rejected(async () => await runPlaced(startRun(opts)), what);
      assert.equal((err as Error & { exitCode?: number }).exitCode, 1, `${what}: ${String(err)}`);
      assert.match((err as Error).message, said, what);
      const id = /runs\/([a-z0-9-]+)\//.exec((err as Error).message)?.[1] ?? '';
      assert.ok(id, `${what}: the message names the run's directory: ${(err as Error).message}`);
      assert.equal(s.runStore.runs.taken(id), false, `${what}: nothing of ${id} is left`);
      assert.deepEqual(fs.readdirSync(s.runsDir()).sort(), before, `${what}: no record, and no run directory`);
    }
  },
);

/**
 * The start program says in its type that it refuses and asks the place: a run, a refusal, and no run without a place given. The
 * typecheck reads its lines, and nothing calls this.
 */
async function _startProgramTypes() {
  const s = await startProgram();
  const opts = { brief: 'x', repo: ROOT, workflowDir: WORKFLOW };
  void (s.startRun(opts) satisfies EffectOf<Run, Refusal, PlaceService>);
  // @ts-expect-error -- a refusal is its failure, so it is not an Effect that cannot fail
  void (s.startRun(opts) satisfies EffectOf<Run, never, PlaceService>);
  // @ts-expect-error -- a program that asks the place is given none, and runSync takes no requirement
  void s.Effect.runSync(s.startRun(opts));
  void (s.Effect.runSync(placed(s.startRun(opts))) satisfies Run);
}
