/**
 * The I/O half: a run store, a workspace, and the engine.
 *
 * This file is the only one that knows the engine exists, and it uses `agent-engine` — the
 * Promise API — not `agent-engine/effect`. Nothing here imports Effect, which is the point: a
 * consumer of the engine should need to learn three functions, not a library.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createEngine, type Engine, type TaskView } from 'agent-engine';
import { fansOut, loadWorkflows, terminalSteps, type Workflow } from './workflow.ts';
import { assess, cancelPlan, composeBrief, inFlight, workspacePlan, type Assessment, type CancelPlan, type Run, type TaskPhase } from './run.ts';

export const HOME = process.env.WF_ROOT ?? path.join(os.homedir(), '.agent-workflows');

const runsDir = () => path.join(HOME, 'runs');
const runFile = (id: string) => path.join(runsDir(), `${id}.json`);

/**
 * A cancellation gets its OWN file, and this is the whole reason it does.
 *
 * The run's json has one writer that rewrites it constantly — a tick reads the record, spends
 * seconds observing sessions and cutting worktrees, then writes back what it filed. `wf cancel` is
 * a second writer, and it exists to be used while that daemon is running: that is the point of the
 * verb. Two writers doing read-modify-write on one file is a lost update, and it was: a cancel
 * landing mid-pass was overwritten by the tick's stale copy, the mark vanished, and the run went
 * on filing steps. Re-reading before writing only narrows that window; it does not close it.
 *
 * So the two writers are given two files and never touch each other's. The tick owns the run's
 * steps, a person owns the cancellation, and `readRun` composes them. No lock, and nothing to get
 * wrong under a crash: the file exists or it does not.
 */
const cancelFile = (id: string) => path.join(runsDir(), `${id}.cancelled`);

export const readRun = (id: string): Run => {
  const run = JSON.parse(fs.readFileSync(runFile(id), 'utf8')) as Run;
  const at = fs.existsSync(cancelFile(id)) ? fs.readFileSync(cancelFile(id), 'utf8').trim() : '';
  return at ? { ...run, cancelledAt: at } : run;
};

/**
 * Write down that this run is cancelled, and answer with the time that now stands.
 *
 * `wx` so the FIRST cancellation is the one kept: two people calling the same run off should not
 * leave the record saying it happened at whichever moment the second one typed it.
 */
export const markCancelled = (id: string): string => {
  fs.mkdirSync(runsDir(), { recursive: true });
  const at = new Date().toISOString();
  try {
    fs.writeFileSync(cancelFile(id), at, { flag: 'wx' });
    return at;
  } catch {
    return fs.readFileSync(cancelFile(id), 'utf8').trim() || at;
  }
};

export const listRuns = (): Run[] =>
  fs.existsSync(runsDir())
    ? fs.readdirSync(runsDir()).filter((f) => f.endsWith('.json')).map((f) => readRun(path.basename(f, '.json'))).sort((a, b) => a.id.localeCompare(b.id))
    : [];

const writeRun = (run: Run) => {
  fs.mkdirSync(runsDir(), { recursive: true });
  fs.writeFileSync(runFile(run.id), JSON.stringify(run, null, 2));
};

export const engine = (): Engine => createEngine({
  root: path.join(HOME, 'engine'),
  maxConcurrent: Number(process.env.WF_MAX_CONCURRENT) || 2,
});

/** The engine's task phases, narrowed to what a run cares about. */
const phaseOfView = (v: TaskView): TaskPhase =>
  v.state.settled ?? (v.state.attempts.length ? 'running' : 'pending');

/**
 * The engine's word on every task this run has filed, read once.
 *
 * One read per task per pass, shared by everything that then wants an answer: `advance` needs the
 * views themselves (for the session id a `resume:` step continues), and the pure functions need
 * only the phase.
 */
async function taskPhases(e: Engine, run: Run): Promise<{
  views: Map<string, TaskView>;
  phaseOf: (taskId: string) => TaskPhase;
}> {
  const views = new Map<string, TaskView>();
  for (const { taskId } of Object.values(run.steps)) {
    if (taskId) views.set(taskId, await e.view(taskId));
  }
  return {
    views,
    phaseOf: (taskId) => {
      const v = views.get(taskId);
      return v ? phaseOfView(v) : 'unknown';
    },
  };
}

/**
 * Gitignored directories a fresh worktree needs in order to be usable.
 *
 * A worktree contains tracked files only, so `node_modules` is absent and a step that runs the
 * tests fails on its first command — through no fault of its own. Symlinked rather than copied:
 * installing per worktree would cost minutes per step, and a local `file:` dependency would not
 * even resolve from a worktree that lives outside the repository's parent directory.
 *
 * `node_modules` is the pragmatic 95% case rather than a principle. A workflow for another
 * ecosystem wants `.venv`, `target`, `vendor`; when that day comes this becomes a run option
 * instead of a constant.
 */
const LINK_DIRS = ['node_modules'];

/** Make a worktree usable: link in what git deliberately did not copy. */
function linkDependencies(repo: string, workspace: string): void {
  for (const dir of LINK_DIRS) {
    const from = path.join(repo, dir);
    const to = path.join(workspace, dir);
    if (fs.existsSync(from) && !fs.existsSync(to)) {
      try { fs.symlinkSync(from, to, 'dir'); } catch { /* best effort: the step will say so */ }
    }
  }
}

const git = (repo: string, ...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();

/**
 * Cut the run's starting workspace.
 *
 * The WORKFLOW owns this, not the engine and not the harness. Both harnesses can make a worktree
 * of their own, but each makes its *own* — and which worktree a step works in is a fact about the
 * workflow's shape, not about the harness. Owning it here also means neither harness needs a flag
 * the other one spells differently.
 */
function makeWorkspace(repo: string, isolate: boolean): { workspace: string; baseRef: string; branch: string } {
  // No worktree is cut here. Every step gets its own from `workspaceFor`, including the first —
  // one code path, so the pure plan cannot be quietly overridden by a special case.
  return {
    workspace: repo,
    baseRef: git(repo, 'rev-parse', 'HEAD'),
    branch: git(repo, 'rev-parse', '--abbrev-ref', 'HEAD'),
  };
}

/**
 * The workspace a step runs in, made real.
 *
 * `inherit` costs nothing — the step continues where the last one left off. `fork` and `merge`
 * cut a worktree, which is what stops two concurrent steps from editing the same directory. A
 * merge that conflicts is left conflicted on purpose: the step is told, and resolving it is the
 * job. Failing here instead would throw away work that a person would simply sort out.
 */
function workspaceFor(
  run: Run,
  steps: readonly Workflow[],
  step: Workflow,
): { workspace: string; branch: string; conflicted: boolean } {
  const plan = workspacePlan(steps, step);
  const of = (name: string) => {
    const s = run.steps[name];
    if (!s?.workspace || !s.branch) throw new Error(`${step.name}: ${name} has no workspace yet`);
    return s as { workspace: string; branch: string };
  };

  // Without isolation every step works in the repository itself, which is only safe because
  // `validate` refuses a workflow that could run two steps at once in that mode.
  if (!run.isolate) return { workspace: run.repo, branch: run.branch, conflicted: false };

  if (plan.kind === 'inherit') {
    const parent = of(plan.from);
    return { workspace: parent.workspace, branch: parent.branch, conflicted: false };
  }

  // A worktree of its own, so nothing it does can collide with a sibling's.
  const branch = `wf/${run.id}/${step.name}`;
  const workspace = path.join(HOME, 'worktrees', run.id, step.name);
  const from = plan.kind === 'merge' ? of(plan.from).branch : plan.from ? of(plan.from).branch : run.baseRef;
  fs.mkdirSync(path.dirname(workspace), { recursive: true });
  git(run.repo, 'worktree', 'add', '-b', branch, workspace, from);
  linkDependencies(run.repo, workspace);

  let conflicted = false;
  if (plan.kind === 'merge') {
    for (const other of plan.also) {
      try {
        git(workspace, '-c', 'user.email=wf@local', '-c', 'user.name=wf',
            'merge', '--no-edit', of(other).branch);
      } catch {
        // Left in place, markers and all. The step waiting on several others is the one whose
        // job this is, and it is told so in its brief.
        conflicted = true;
      }
    }
  }
  return { workspace, branch, conflicted };
}

/**
 * A run id a person can read.
 *
 * The engine lets the caller choose task ids, and a session's name is built from one — so the id
 * IS what a human sees in `claude agents`. `t-mtxvs3nw-f4763a59` tells them nothing;
 * `add-split-workflow-8imz` tells them which piece of work they are looking at, and the step
 * suffix tells them which part of it. The random tail keeps two runs of the same request apart.
 */
export const runId = (brief: string): string => {
  const slug = brief.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28).replace(/-$/, '');
  return `${slug || 'run'}-${Math.random().toString(36).slice(2, 6)}`;
};

export function start(opts: { brief: string; repo: string; workflowDir: string; isolate?: boolean }): Run {
  const steps = loadWorkflows(opts.workflowDir);   // validated before anything is spent
  if (opts.isolate === false && fansOut(steps)) {
    throw new Error(
      'this workflow can run two steps at once, and --no-worktree would put them in the same directory.\n' +
      'Either drop --no-worktree, or make the steps a chain.',
    );
  }
  const id = runId(opts.brief);
  const isolate = opts.isolate ?? true;
  const { workspace, baseRef, branch } = makeWorkspace(opts.repo, isolate);

  const run: Run = {
    id,
    repo: opts.repo,
    workspace,
    baseRef,
    isolate,
    brief: opts.brief,
    workflowDir: path.resolve(opts.workflowDir),
    branch,
    steps: Object.fromEntries(steps.map((s) => [s.name, { taskId: null }])),
    createdAt: new Date().toISOString(),
  };
  writeRun(run);
  return run;
}

/**
 * Commit whatever a step left behind, so the workspace it hands on is the workspace it made.
 *
 * Idempotent: a clean tree commits nothing, so this runs on every pass without accumulating
 * commits. Deliberately not a failure if it cannot — a step's real work is already committed by
 * the step itself in the normal case, and losing a run over a git edge case would be worse.
 */
function handOff(workspace: string, step: string): void {
  try {
    if (!execFileSync('git', ['status', '--porcelain'], { cwd: workspace, encoding: 'utf8' }).trim()) return;
    execFileSync('git', ['add', '-A'], { cwd: workspace });
    execFileSync('git', [
      '-c', 'user.email=wf@local', '-c', 'user.name=wf',
      'commit', '-m', `${step}: hand off what was left uncommitted`,
    ], { cwd: workspace, encoding: 'utf8' });
  } catch { /* nothing to hand off, or a tree git will not commit */ }
}

export type Advanced = { run: Run; filed: string[]; status: Assessment['status']; blocked: string[] };

/**
 * One pass over one run: tick the engine, then file whatever became ready.
 *
 * Level-triggered, like everything under it: it reads the current state of each task and decides,
 * so it is safe to run repeatedly, safe to interrupt, and correct after a restart with no memory
 * of what it did last time.
 */
export async function advance(e: Engine, run: Run): Promise<Advanced> {
  const steps = loadWorkflows(run.workflowDir);

  const { views, phaseOf } = await taskPhases(e, run);

  // A cancelled run is enforced by every pass, not only by the verb that cancelled it.
  //
  // `wf cancel` stops what it can SEE in flight, and this pass may have filed a step moments
  // after it looked. One tick later that step is asked to stop too, so the window costs a few
  // seconds of work rather than a session nobody is watching. Level-triggered, like the rest: the
  // mark is the desired state and every tick reconciles toward it, instead of the system trusting
  // that one command did everything.
  if (run.cancelledAt) {
    for (const { taskId } of inFlight(run, phaseOf)) {
      // Skipped once the engine already has the request on its record, so a task taking a tick or
      // two to settle does not collect a stop-requested event every four seconds.
      if (!views.get(taskId)?.state.stopRequested) await e.stop(taskId);
    }
  }

  // Anything a finished step left uncommitted is committed for it, BEFORE a later step merges.
  //
  // A merge carries commits, not working trees. While steps shared one directory that did not
  // matter — a file written was a file the next step could read — but the moment steps fork, an
  // uncommitted file is invisible downstream and the next step answers a question it never saw.
  // Measured the hard way: a review wrote REVIEW.md, did not commit, and the responder merged a
  // branch that did not contain it. Asking every step's prose to remember is not a contract.
  for (const [name, st] of Object.entries(run.steps)) {
    if (!st.taskId || !st.workspace || phaseOf(st.taskId) !== 'succeeded') continue;
    handOff(st.workspace, name);
  }

  const { ready, blocked, status } = assess(steps, run, phaseOf);

  /** The harness's own id for a step's session — what `--resume` takes. */
  const sessionOf = (stepName: string): string | undefined => {
    const taskId = run.steps[stepName]?.taskId;
    const attempts = taskId ? views.get(taskId)?.state.attempts : undefined;
    return attempts?.at(-1)?.nativeId ?? undefined;
  };

  const filed: string[] = [];
  for (const name of ready) {
    const step = steps.find((s) => s.name === name)!;
    const place = workspaceFor(run, steps, step);

    const taskId = await e.file({
      // The task id is chosen, not generated, so the harness session reads `ae/<run>-<step>/1`.
      // A person scanning their sessions then sees which run and which step, and two steps of one
      // run share a prefix — which is what makes a resumed step legible as a continuation rather
      // than a duplicate.
      id: `${run.id}-${name}`,
      brief: composeBrief(step, run, steps),
      cwd: place.workspace,
      harness: step.harness,
      model: step.model,
      // Left to the engine's default (`auto`) unless the step says otherwise: a workflow runs
      // unattended by definition, and a mode that prompts is a mode that stalls.
      permissionMode: step.permissionMode,
      deadlineSeconds: step.deadlineSeconds,
      maxAttempts: step.maxAttempts,
      resumeFrom: step.resume ? sessionOf(step.resume) : undefined,
    });
    run.steps[name] = { taskId, workspace: place.workspace, branch: place.branch };
    filed.push(name);
  }
  if (filed.length) writeRun(run);

  return { run, filed, status, blocked };
}

export type Cancelled = { run: Run; plan: CancelPlan };

/**
 * Call a run off: stop what it has in flight, and write down that it is cancelled.
 *
 * Both halves matter and neither replaces the other. Stopping the session ends the work that is
 * burning right now; the mark on the run is what stops the NEXT step being filed, which the engine
 * could never know to do — it has tasks, not runs.
 *
 * The stop is asked for BEFORE the run is marked, on purpose. If the engine refuses, the run is
 * left uncancelled and asking again does both; the other order would leave a run that reads as
 * cancelled while its session ran on.
 *
 * Note what this does NOT do: write the run's json. A tick may be halfway through a pass over the
 * same run, and rewriting the record underneath it is how the mark got lost before. The
 * cancellation goes in a file only this verb writes, and `advance` enforces it on every pass —
 * which is also what covers a step filed in the moment after the stop list was taken.
 *
 * `e.stop` only records the operator's intent — the engine carries it out on its next tick and
 * confirms on the one after. That is the engine's contract, not a shortcut here, and it is why the
 * verb reports what it ASKED to stop.
 */
export async function cancel(e: Engine, id: string): Promise<Cancelled> {
  const run = readRun(id);
  const steps = loadWorkflows(run.workflowDir);
  const { phaseOf } = await taskPhases(e, run);

  const plan = cancelPlan(steps, run, phaseOf);
  if (plan.kind === 'finished') return { run, plan };

  for (const { taskId } of plan.stop) await e.stop(taskId);
  if (plan.kind === 'already-cancelled') return { run, plan };

  return { run: { ...run, cancelledAt: markCancelled(id) }, plan };
}

/** Every run, advanced once, after one engine tick. This is the whole daemon. */
export async function tick(e: Engine): Promise<Advanced[]> {
  await e.tick();
  const out: Advanced[] = [];
  for (const run of listRuns()) {
    // A finished run still gets assessed — it costs one read and it is how `ls` stays honest.
    out.push(await advance(e, run));
  }
  return out;
}

export async function stepViews(e: Engine, run: Run): Promise<Array<{ name: string; phase: string; taskId: string | null; branch: string | null }>> {
  const steps = loadWorkflows(run.workflowDir);
  const rows = [];
  for (const s of steps) {
    const taskId = run.steps[s.name]?.taskId ?? null;
    rows.push({
      name: s.name,
      taskId,
      branch: run.steps[s.name]?.branch ?? null,
      phase: taskId ? (await e.view(taskId)).phase : 'waiting',
    });
  }
  return rows;
}

/**
 * Where the run's work ended up, for a person who now has to go and look at it.
 *
 * A branch, not a directory: the worktree is scaffolding and gets removed, the branch is the
 * result and stays in the repository. Reported as soon as a terminal step has a branch, so it is
 * useful while the run is still going, not only afterwards.
 */
export function resultBranches(run: Run): string[] {
  const steps = loadWorkflows(run.workflowDir);
  return terminalSteps(steps)
    .map((s) => run.steps[s.name]?.branch)
    .filter((b): b is string => Boolean(b));
}
