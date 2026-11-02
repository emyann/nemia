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
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { type TaskSpec, type TaskView, ForgetRefused } from 'agent-runtime';
import type { Engine } from '../src/runtime-client.ts';
import type { RepositoryRun, Run, TaskPhase } from '../src/run.ts';
import type { Effect as EffectOf } from 'effect/Effect';
import type { Forgot } from '../src/forget/forget.ts';
import type { Refusal } from '../src/refusal/refusal.ts';
import type { EngineService } from '../src/runtime-client.ts';
import type { Accepted, RoundAsked } from '../src/round/round.verb.ts';
import type { Asked } from '../src/retry/retry.verb.ts';
import type { Approved } from '../src/gate/gate.verb.ts';
import type { Told } from '../src/say/say.verb.ts';
import type { Cancelled } from '../src/cancel/cancel.verb.ts';
import type { CheckReport } from '../src/views/views.verb.ts';
import type { CheckRefusal } from '../src/check/check.ts';
import type { ParentRun } from '../src/wait/wait.ts';
import { scratch } from './scratch.ts';
import { isRepositoryRun, shownStatus } from '../src/run.ts';
import { promised } from './promised.ts';
import { Effect } from 'effect';
import { eachTest, givenPlace, runGiven, runOver } from './placed.ts';
import { testPlace } from '../place/memory/index.ts';
import type { PlaceService } from '../src/place/place.store.ts';
import {} from './place-over.ts';
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
  acceptRun,
  advanceRun,
  cancelRun,
  forgetRun,
  list,
  retryRun,
  roundRun,
  startRun,
  runWith: runEngine,
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

const { listRuns, markCancelled, readAnswers, readAsks, readRun } = await import('../src/record/record.store.ts');

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

test('a cancel that lands mid-tick survives the tick', async () => {
  const run = aRun('r-race', { implement: { taskId: 'r-race-implement' }, review: { taskId: null } });
  writeRun(run);

  let release!: () => void;
  const { e } = engineWith(
    { 'r-race-implement': 'succeeded' },
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
 * - `closedOut`: whether each task's last attempt gave the statement it was asked for, as the runtime reports it (`Attempt.closedOut`):
 *   once it has settled, its attempt ended `done` by its harness with the fact beside it. Absent, the attempt carries no such key, as
 *   an older journal's does.
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
  const closedOut = new Map<string, boolean>();
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
           * consumed is on it once it has settled, and not before: a job writes its cost as it prints its result. Given several
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
                        ...(settled && !reason && closedOut.has(id)
                          ? { ended: 'succeeded', reason: 'harness', closedOut: closedOut.get(id) }
                          : {}),
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
  return { e, tasks, filings, stopped, forgets, settle, logs, outputs, said, deaf, waiting, denials, closedOut };
};

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };

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
    [readRun(run.id).steps.implement?.taskId, readRun(run.id).steps.implement?.tries?.map((t) => t.cause)],
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

/** The pages a cut-short check named before it was stopped, planted in the engine's log. */
const PAGES_RUN = 'wf pictures: the pages this change touched: run';
const CHECK_SAID = "## What implement's check said";

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
    /^review asked for round 4, and a person accepted its work as it stands at .*Nothing waiting on it has been filed yet, so to go round once more after all, take that acceptance back first — accept-review-3, in the run's \.asks directory — then ask again: nemia retry \S+ review --round\.$/,
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
    /^review asked for round 4, and a person accepted its work as it stands at .* \(nemia approve\), so its loop is over on their word and there is nothing to go round again\. What waits on it has been filed: nemia ls /,
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
    (await runWith(b.e, list(b.e, readRun(run.id)))).steps[1].message,
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
  assert.deepEqual([record.implement?.taskId, record.review?.taskId, record.review?.tries?.map((t) => t.cause)], [try2, null, ['round']]);

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

test('REFUSED at read: an ask file whose message is not text, is empty, or rides on a recheck is not honoured — and one written before messages reads as it always did', async () => {
  const { run, e, filings } = await throughCheck('check: npm test', 'stopped');
  const at = '2026-09-13T10:00:00.000Z';
  fs.mkdirSync(asksDir(run.id), { recursive: true });
  const refused = {
    'retry-implement-2': [{ mode: 'continue', message: 42, at }, 'its message is not text'],
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

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

test("REFUSED by name at shipped defaults: a file at an ask's name that is not an ask — `nemia retry` and `nemia retry --round` name it and say to delete it, never to wait for an ask no pass honours", async () => {
  const { run, e, filings } = await throughCheck('check: npm test', 'failed', 1);
  const file = path.join(asksDir(run.id), 'retry-implement-2');
  fs.mkdirSync(asksDir(run.id), { recursive: true });
  fs.writeFileSync(file, '{}');
  assert.equal((await runWith(e, list(e, readRun(run.id)))).steps[0].note, undefined, '`nemia ls` shows nothing asked');
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).tried, [], 'and no pass honours it');
  await assert.rejects(
    runWith(e, retryRun(run.id, 'implement', { mode: 'continue' })),
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
  await runWith(e, retryRun(run.id, 'implement', { mode: 'continue' }));
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
        `^round 2 of review's loop cannot be asked for: ${escaped(roundFile)} is already there, and it is not an ask — it is not an ask nemia retry --round wrote\\. .*Delete it \\(rm ${escaped(roundFile)}\\), then ask again: nemia retry ${escaped(looping.id)} review --round\\.$`,
      ),
    ),
  );
  assert.equal(fs.readFileSync(roundFile, 'utf8'), '[]');
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
  assert.equal((await step()).message, 'needs-human', 'and the status every reader compares is the bare word');
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
      `implement: try 2 — nemia retry --continue; its harness blocked its session, but the engine did not take the stop (stop: \`${taskId}\` has settled (stopped): there is nothing left to stop.), and the try is filed once it has settled`,
    ),
    first.notes.join('\n'),
  );

  b.settle(taskId, 'stopped');
  const filed = await runWith(refusing, advanceRun(readRun(run.id)));
  assert.deepEqual(filed.tried, ['implement'], 'settled, the try is filed');
});

const under = (...parts: string[]) => fs.existsSync(path.join(ROOT, ...parts));

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
    JSON.stringify({ step: 'implement', try: 1, mode: 'continue', at: '2026-09-16T00:00:00.000Z' }),
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
