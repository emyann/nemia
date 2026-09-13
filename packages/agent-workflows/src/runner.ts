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
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { claudeDetached, codex, createEngine, type Engine, type TaskView } from 'agent-engine';
import { CHECK, CHECK_DEADLINE_SECONDS, checkBrief, lastLines, readVerdict, stdoutTail, type Verdict } from './check.ts';
import { depsPlan, inside, refusalLines, worktreeInclude, type DepEntry, type DepsListing, type Provisioned, type WorktreeInclude } from './deps.ts';

export { verdictWord } from './check.ts';
export { artifactLines, outputLines } from './run.ts';
import { fansOut, loadWorkflows, terminalSteps, type Workflow } from './workflow.ts';
import { artifactPlace, type ArtifactFile } from './run.ts';
import { assess, cancelPlan, checkTaskId, closeoutSchemaOf, composeBrief, decision, handOffDue, inFlight, listing, parseCloseout, stepStatus, workspacePlan, type Assessment, type CancelPlan, type Closeout, type Decision, type Listing, type Run, type TaskPhase } from './run.ts';

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
  // A mistyped run id is the commonest way to reach this, and `ENOENT: no such file or directory,
  // open '/home/.../runs/r-xzy.json'` answers a question nobody asked. Every verb that takes an
  // id comes through here, so saying it once covers all of them.
  if (!fs.existsSync(runFile(id))) throw new Error(`no such run: ${id}  (try 'wf ls')`);
  const run = JSON.parse(fs.readFileSync(runFile(id), 'utf8')) as Run;
  const at = fs.existsSync(cancelFile(id)) ? fs.readFileSync(cancelFile(id), 'utf8').trim() : '';
  return at ? { ...run, cancelledAt: at } : run;
};

/**
 * The run's steps: the workflow it froze at `wf start`.
 *
 * The folder is read only for a record from before the run froze its workflow — and a run started
 * today never reaches that branch, so nothing written into the folder after `wf start` reaches it.
 */
export const stepsOf = (run: Run): Workflow[] => run.workflow ?? loadWorkflows(run.workflowDir);

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

/**
 * The engine, with one harness of the run's own beside the three it ships.
 *
 * `check` runs a step's `check:` command (`src/check.ts`). Passing `harnesses` REPLACES the engine's
 * default map rather than adding to it, so the defaults are named again here — leaving them out would
 * quietly send every `claude` step to whichever harness came first.
 */
export const HARNESSES = {
  claude: 'claude-bg',
  codex,
  'claude-detached': claudeDetached,
  check: CHECK,
} as const;

export const engine = (): Engine => createEngine({
  root: path.join(HOME, 'engine'),
  maxConcurrent: Number(process.env.WF_MAX_CONCURRENT) || 2,
  harnesses: HARNESSES,
});

/**
 * The engine's task phases, narrowed to what a run cares about.
 *
 * A task the engine has never heard of is `unknown`, NOT `pending`. It folds to the same empty
 * state as one that is filed and waiting for a slot — `settled: null`, zero attempts — and the one
 * thing that tells them apart is that a filed task has the brief it was filed with.
 *
 * Worth the line, because `pending` counts as in flight. A run whose engine board has since been
 * cleared read as running for ever: `wf cancel` claimed to stop steps nobody can find, and
 * `wf decide` said "still running". `unknown` was in the type for this and was simply unreachable.
 * Found by the `wf rm` run (34774e0), whose verb was not kept; this was.
 */
const phaseOfView = (v: TaskView): TaskPhase => {
  if (v.state.settled) return v.state.settled;
  if (v.state.attempts.length) return 'running';
  return v.state.brief ? 'pending' : 'unknown';
};

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
  for (const { taskId, check } of Object.values(run.steps)) {
    if (taskId) views.set(taskId, await e.view(taskId));
    if (check) views.set(check.taskId, await e.view(check.taskId));
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
 * Checks a pass filed and never wrote down, put back on the record. In memory: `advance` is the one
 * writer of the run's json, and writes it; `cancel` only needs them in view.
 *
 * A pass that dies between `e.file` and `writeRun` leaves a check on the engine's board that the
 * record does not name. It is looked for under the id the run derives, for every step whose check is
 * due and unrecorded, and BEFORE anything asks what is in flight. Waiting for filing time to adopt it
 * was not enough: a run cancelled in that window files no more checks, so it was never adopted, never
 * stopped, and its suite ran on to the deadline.
 */
async function adoptChecks(
  e: Engine,
  run: Run,
  steps: readonly Workflow[],
  views: Map<string, TaskView>,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined,
  asked: (taskId: string) => boolean,
): Promise<string[]> {
  const adopted: string[] = [];
  for (const step of steps) {
    if (run.steps[step.name]?.check || stepStatus(step, run, phaseOf, closeoutOf, asked) !== 'checking') continue;
    const taskId = checkTaskId(run, step.name);
    const view = await e.view(taskId);
    if (!view.state.brief) continue;   // not filed: due, and this pass's to file
    views.set(taskId, view);
    run.steps[step.name] = { ...run.steps[step.name]!, check: { taskId } };
    adopted.push(step.name);
  }
  return adopted;
}

/** Whether a task was asked for a closeout: the schema the engine keeps on its record of the filing. */
const closeoutAsked =(views: ReadonlyMap<string, TaskView>) => (taskId: string): boolean =>
  Boolean(views.get(taskId)?.state.closeoutSchema);

/**
 * Where a check's stderr goes: beside the run records, outside every workspace — a file inside one
 * would be committed by the next hand-off and ride the branch.
 */
export const checkStderr = (taskId: string): string => path.join(HOME, 'checks', `${taskId}.stderr`);

/**
 * The directory the run makes for a step's files: screenshots, logs, reports — for the steps after it
 * and the person who decides.
 *
 * Beside the run's record, outside every workspace, for the reason a check's stderr is: a file written
 * into a worktree is committed by the next hand-off and rides the branch, and a gitignored one never
 * reaches the next step's worktree at all. `advance` makes it before it files the step, tells the step in
 * its brief (`artifactsContract`), and hands it to the step's check as `WF_ARTIFACTS`.
 */
export const artifactsDir = (run: Pick<Run, 'id'>, step: string): string => path.join(runsDir(), run.id, 'artifacts', step);

/** How long `npm ci` may take in a worktree before the run stops waiting and tells the step. */
const NPM_CI_TIMEOUT_MS = 10 * 60_000;

const execFileAsync = promisify(execFile);
const lstatOf = (p: string) => fs.lstatSync(p, { throwIfNoEntry: false });

/** Whether the worktree's `package-lock.json` says anything main's does not — one of them missing included. */
function lockfileDiffers(mainRoot: string, worktree: string): boolean {
  const read = (root: string) => { try { return fs.readFileSync(path.join(root, 'package-lock.json')); } catch { return null; } };
  const [mine, mains] = [read(worktree), read(mainRoot)];
  return mine === null || mains === null ? mine !== mains : !mine.equals(mains);
}

/** Main's `node_modules`, listed for `depsPlan`: names and link targets, nothing below a package. */
function listDeps(modules: string): DepsListing | null {
  if (!fs.statSync(modules, { throwIfNoEntry: false })?.isDirectory()) return null;
  const entriesOf = (dir: string): DepEntry[] => {
    try {
      return fs.readdirSync(dir, { withFileTypes: true }).map((d) =>
        d.isSymbolicLink() ? { name: d.name, link: fs.readlinkSync(path.join(dir, d.name)) } : { name: d.name });
    } catch { return []; }
  };
  const entries = entriesOf(modules);
  const scopes = Object.fromEntries(entries
    .filter((e) => e.name.startsWith('@') && e.link === undefined)
    .map((e) => [e.name, entriesOf(path.join(modules, e.name))]));
  return { entries, scopes, bins: entriesOf(path.join(modules, '.bin')) };
}

/**
 * Give a worktree a `node_modules` of its own: `depsPlan`'s links, or `npm ci` when its lockfile differs.
 *
 * A worktree holds tracked files only, so without this a step that runs the tests fails on its first
 * command through no fault of its own. It used to be one link to the main checkout's whole tree, which
 * tested a branch against main's workspace packages and hid a dependency the branch added. Links cost no
 * install; when the worktree's `package-lock.json` differs from main's they would be the wrong tree, so
 * `npm ci` installs one here — about a minute, which the step is told (`depsLines`).
 *
 * Idempotent, so a pass that died halfway can run it again and a second call changes nothing: a tree npm
 * installed (it has `.package-lock.json`, which the plan never makes) is left alone, and so is a
 * `node_modules` that is one link, cut before this; a tree the plan made gains only what it lacks, and
 * nothing already there is replaced. It writes nothing under the main checkout. It does not throw: a
 * tick that threw here would throw on every pass after, and a step can run `npm ci` itself.
 */
export async function provisionDeps(mainRoot: string, worktree: string): Promise<Provisioned> {
  const modules = path.join(worktree, 'node_modules');
  if (lstatOf(modules)?.isSymbolicLink()) return { tree: 'shared' };
  if (lstatOf(path.join(modules, '.package-lock.json'))) return { tree: 'own', installed: false };

  if (lockfileDiffers(mainRoot, worktree)) {
    try {
      await execFileAsync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: worktree, timeout: NPM_CI_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 });
      return { tree: 'own', installed: true };
    } catch (err) {
      const { stderr, message } = err as { stderr?: string; message?: string };
      return { tree: 'failed', error: lastLines(stderr?.trim() ? stderr : message ?? String(err), 10) };
    }
  }

  const listing = listDeps(path.join(mainRoot, 'node_modules'));
  if (!listing) return { tree: 'absent' };
  let made = 0;
  try {
    for (const action of depsPlan(mainRoot, worktree, listing)) {
      if (lstatOf(action.path)) continue;
      if (action.kind === 'dir') fs.mkdirSync(action.path);
      else fs.symlinkSync(action.target, action.path);
      made++;
    }
  } catch (err) {
    return { tree: 'failed', error: (err as Error).message };
  }
  return { tree: 'linked', made };
}

/** `.worktreeinclude` at the root of the main checkout, parsed — or null, when the repository has none. */
function readInclude(repo: string): WorktreeInclude | null {
  const file = path.join(repo, '.worktreeinclude');
  return fs.existsSync(file) ? worktreeInclude(fs.readFileSync(file, 'utf8')) : null;
}

/**
 * Copy what `.worktreeinclude` lists from the main checkout into a worktree the run just cut — the
 * gitignored files a repository says a worktree needs, as Claude Code's `--worktree` does. Never
 * `node_modules`: `provisionDeps` makes that, and a copy would cost minutes per step.
 *
 * Read from the main checkout, never from the worktree a step can edit. Nothing already in the worktree
 * is overwritten, so a second pass copies nothing. What a person should hear comes back as lines for
 * the run's log, never as an error: a path the main checkout does not have is skipped, and one that
 * leads outside the repository — as written, or through a link — is refused.
 */
function includeFiles(repo: string, worktree: string): string[] {
  const include = readInclude(repo);
  if (!include) return [];
  const notes = refusalLines(include.refused).map((line) => `.worktreeinclude: refused ${line}`);
  const root = fs.realpathSync(repo);
  const absent: string[] = [];
  for (const rel of include.copy) {
    const from = path.join(repo, rel);
    let real: string;
    try { real = fs.realpathSync(from); } catch { absent.push(rel); continue; }
    if (!inside(root, real)) { notes.push(`.worktreeinclude: refused "${rel}" leads outside the repository`); continue; }
    const to = path.join(worktree, rel);
    try {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.cpSync(from, to, { recursive: true, force: false, errorOnExist: false, verbatimSymlinks: true });
    } catch (err) {
      notes.push(`.worktreeinclude: could not copy ${rel} — ${(err as Error).message}`);
    }
  }
  if (absent.length) notes.unshift(`.worktreeinclude: skipped ${absent.join(', ')} — not in the main checkout`);
  return notes;
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
async function workspaceFor(
  run: Run,
  steps: readonly Workflow[],
  step: Workflow,
): Promise<{ workspace: string; branch: string; conflicted: boolean; deps?: Provisioned; notes: string[] }> {
  const plan = workspacePlan(steps, step);
  const of = (name: string) => {
    const s = run.steps[name];
    if (!s?.workspace || !s.branch) throw new Error(`${step.name}: ${name} has no workspace yet`);
    return s as { workspace: string; branch: string };
  };

  // Without isolation every step works in the repository itself, which is only safe because
  // `validate` refuses a workflow that could run two steps at once in that mode.
  if (!run.isolate) return { workspace: run.repo, branch: run.branch, conflicted: false, notes: [] };

  if (plan.kind === 'inherit') {
    const parent = of(plan.from);
    return { workspace: parent.workspace, branch: parent.branch, conflicted: false, notes: [] };
  }

  // A worktree of its own, so nothing it does can collide with a sibling's.
  const branch = `wf/${run.id}/${step.name}`;
  const workspace = path.join(HOME, 'worktrees', run.id, step.name);
  const from = plan.kind === 'merge' ? of(plan.from).branch : plan.from ? of(plan.from).branch : run.baseRef;
  fs.mkdirSync(path.dirname(workspace), { recursive: true });
  // Taken up where it stands when a pass cut it and died before filing the step — in the minute `npm ci`
  // can take, say. `worktree add -b` would refuse the branch that pass made, on every pass after.
  if (!fs.existsSync(path.join(workspace, '.git'))) git(run.repo, 'worktree', 'add', '-b', branch, workspace, from);

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

  // After the merges, because the step works on the merged tree — its lockfile included.
  const notes = includeFiles(run.repo, workspace);
  const deps = await provisionDeps(run.repo, workspace);
  if (deps.tree === 'own' && deps.installed) notes.push('node_modules: installed with npm ci — package-lock.json differs from the main checkout\'s');
  if (deps.tree === 'failed') notes.push(`node_modules: not provisioned — ${deps.error.split('\n').at(-1)}`);
  return { workspace, branch, conflicted, deps, notes };
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
  // A check's task is its step's id plus `-check`, so a step named that would share an id with it and
  // the run would read one task as the other.
  const clash = steps.find((s) => s.check && steps.some((other) => other.name === `${s.name}-check`));
  if (clash) {
    throw Object.assign(new Error(
      `${clash.name}-check: a step may not be named for another step's check. ${clash.name} has a \`check:\`, and the run files it as ${clash.name}-check. Rename ${clash.name}-check.md.`,
    ), { exitCode: 2 });
  }
  const isolate = opts.isolate ?? true;
  // Refused here, where a person is looking, rather than line by line in a daemon's log. Only a run that
  // cuts worktrees reads the file.
  const refused = isolate ? readInclude(opts.repo)?.refused ?? [] : [];
  if (refused.length) {
    throw Object.assign(new Error(
      `${path.join(opts.repo, '.worktreeinclude')}: ${refusalLines(refused).join('; ')}. Each line is a gitignored path inside the repository, relative to its root — fix or remove ${refused.length === 1 ? 'that line' : 'those lines'}.`,
    ), { exitCode: 2 });
  }
  const id = runId(opts.brief);
  const { workspace, baseRef, branch } = makeWorkspace(opts.repo, isolate);

  const run: Run = {
    id,
    repo: opts.repo,
    workspace,
    baseRef,
    isolate,
    brief: opts.brief,
    workflowDir: path.resolve(opts.workflowDir),
    workflow: steps,
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

/**
 * One pass's work: the steps it filed, the steps whose checks it filed, and where the run stands — and
 * `notes`, what cutting a worktree had to say, each line starting with its step: a path `.worktreeinclude`
 * lists that the main checkout does not have, a line it refused, an `npm ci` that ran or failed.
 */
export type Advanced = { run: Run; filed: string[]; checked: string[]; status: Assessment['status']; blocked: string[]; notes: string[] };

/**
 * One pass over one run: tick the engine, then file whatever became ready.
 *
 * Level-triggered, like everything under it: it reads the current state of each task and decides,
 * so it is safe to run repeatedly, safe to interrupt, and correct after a restart with no memory
 * of what it did last time.
 */
export async function advance(e: Engine, run: Run): Promise<Advanced> {
  const steps = stepsOf(run);

  const { views, phaseOf } = await taskPhases(e, run);
  const signedOff = closeoutReader(views, run);
  const asked = closeoutAsked(views);
  const adopted = await adoptChecks(e, run, steps, views, phaseOf, signedOff, asked);

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
  // branch that did not contain it. Asking every step's prose to remember is not a contract — so
  // this IS the contract: every step is told the run commits what it leaves (`closeoutContract`),
  // which is also exactly what a sandboxed step that cannot write git's metadata needs.
  //
  // Every finished step, failed and stopped too, until its check is filed or a later step works in its
  // workspace: the check judges the committed tree, and nothing it leaves behind — nor the next step's
  // work in progress — is committed under this step's name (`handOffDue`).
  for (const name of handOffDue(steps, run, phaseOf)) handOff(run.steps[name]!.workspace!, name);

  const { ready, check, blocked, status } = assess(steps, run, phaseOf, signedOff, asked);

  // The fact the run establishes for itself: each signed step's `check:`, executed where the work is.
  // An engine task on the `check` harness, so it outlives this pass, has a deadline, and is stopped
  // by a cancel like anything else. Nothing is ready on it in this pass — a follower waits for the
  // check to SETTLE, on a later one.
  const checked: string[] = [];
  for (const name of check) {
    const step = steps.find((s) => s.name === name)!;
    const workspace = run.steps[name]!.workspace ?? run.workspace;
    const taskId = checkTaskId(run, name);
    // A check an earlier pass filed and never wrote down was adopted above, before this list was made.
    // Looked up once more all the same: filing an id the engine already holds would journal it twice.
    if (!(await e.view(taskId)).state.brief) {
      fs.mkdirSync(path.dirname(checkStderr(taskId)), { recursive: true });
      // Made here as well as at filing: a step filed before the run made these has none.
      const files = artifactsDir(run, name);
      fs.mkdirSync(files, { recursive: true });
      await e.file({
        id: taskId,
        harness: 'check',
        // The command from the workflow this run froze — never from the workspace it is about to judge.
        brief: checkBrief(step.check!, {
          WF_RUN: run.id, WF_STEP: name, WF_BASE_REF: run.baseRef, WF_WORKSPACE: workspace, WF_STDERR: checkStderr(taskId),
          WF_ARTIFACTS: files,
        }),
        cwd: workspace,
        deadlineSeconds: CHECK_DEADLINE_SECONDS,
        // One attempt, never resumed: a check that refused has said what it has to say, and running a
        // suite until it passes would let a flaky suite decide what ships.
        maxAttempts: 1,
        resume: 'never',
      });
    }
    run.steps[name] = { ...run.steps[name]!, check: { taskId } };
    checked.push(name);
  }

  /** The harness's own id for a step's session — what `--resume` takes. */
  const sessionOf = (stepName: string): string | undefined => {
    const taskId = run.steps[stepName]?.taskId;
    const attempts = taskId ? views.get(taskId)?.state.attempts : undefined;
    return attempts?.at(-1)?.nativeId ?? undefined;
  };

  const filed: string[] = [];
  const notes: string[] = [];
  for (const name of ready) {
    const step = steps.find((s) => s.name === name)!;
    const place = await workspaceFor(run, steps, step);
    notes.push(...place.notes.map((note) => `${name}: ${note}`));
    // Made before the step is told of it, so the directory its brief names is there when it starts.
    const files = artifactsDir(run, name);
    fs.mkdirSync(files, { recursive: true });

    const taskId = await e.file({
      // The task id is chosen, not generated, so the harness session reads `ae/<run>-<step>/1`.
      // A person scanning their sessions then sees which run and which step, and two steps of one
      // run share a prefix — which is what makes a resumed step legible as a continuation rather
      // than a duplicate.
      id: `${run.id}-${name}`,
      // What the steps it reads declared, if it names any in `input:` — read off the same closeouts the
      // assessment that made it ready just read, so it is handed what it was filed on.
      // And, when the run installed its `node_modules` or could not, why its start was slow or what to run.
      brief: composeBrief(step, run, steps, signedOff, files, place.deps),
      cwd: place.workspace,
      harness: step.harness,
      model: step.model,
      // Left to the engine's default (`auto`) unless the step says otherwise: a workflow runs
      // unattended by definition, and a mode that prompts is a mode that stalls.
      permissionMode: step.permissionMode,
      deadlineSeconds: step.deadlineSeconds,
      maxAttempts: step.maxAttempts,
      resumeFrom: step.resume ? sessionOf(step.resume) : undefined,
      // The shape of the step's closing statement, with the fields its `output:` declares — from the
      // workflow this run froze, never the folder. The engine hands it to the harness and records the
      // answer without reading it; what the fields mean is ours — see `Closeout`.
      closeoutSchema: closeoutSchemaOf(step),
    });
    run.steps[name] = { taskId, workspace: place.workspace, branch: place.branch };
    filed.push(name);
  }
  if (filed.length || checked.length || adopted.length) writeRun(run);

  return { run, filed, checked, status, blocked, notes };
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
  const steps = stepsOf(run);
  const { views, phaseOf } = await taskPhases(e, run);
  // A check filed by a pass that died before writing the run down is in flight too. Found here so the
  // verb stops it at once; on the record only in memory, because this verb never writes the run.
  await adoptChecks(e, run, steps, views, phaseOf, closeoutReader(views, run), closeoutAsked(views));

  const plan = cancelPlan(steps, run, phaseOf, closeoutReader(views, run), closeoutAsked(views));
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

/**
 * What `wf ls` shows for one run — the pure call, over one read of each task.
 *
 * The phase beside a step is the engine's own word (`running (working)`, `needs-human`), not the
 * narrowed `TaskPhase` the DAG decides on: a person reading the list wants the detail.
 */
export async function list(e: Engine, run: Run): Promise<Listing> {
  const steps = stepsOf(run);
  const { views, phaseOf } = await taskPhases(e, run);
  // Only a refused check's log is read here: its exit code is the one number on its line.
  const refused = await checkReports(e, run, steps, phaseOf, (p) => p === 'failed' || p === 'stopped');
  return listing(steps, run, (taskId) => views.get(taskId)?.phase ?? 'unknown', (name) => closeoutOf(views, run, name),
    closeoutAsked(views), (name) => refused.get(name)?.verdict);
}

/**
 * What a settled check said, for a person to read.
 *
 * `passed` is the engine's settled phase — the worker's reading of the exit code, and the only thing
 * the run gates on. The rest is evidence: the number from the log's last line, and the last lines of
 * each stream, kept apart because a loud stderr must not push a test runner's stdout verdict off the
 * screen.
 */
export type CheckReport = { command: string; passed: boolean; verdict: Verdict; stdout: string; stderr: string };

async function checkReports(
  e: Engine,
  run: Run,
  steps: readonly Workflow[],
  phaseOf: (taskId: string) => TaskPhase,
  want: (phase: TaskPhase) => boolean,
): Promise<Map<string, CheckReport>> {
  const reports = new Map<string, CheckReport>();
  for (const step of steps) {
    const taskId = run.steps[step.name]?.check?.taskId;
    if (!taskId || !step.check || !want(phaseOf(taskId))) continue;
    const log = await e.logs(taskId);
    reports.set(step.name, {
      command: step.check,
      passed: phaseOf(taskId) === 'succeeded',
      verdict: readVerdict(log),
      stdout: stdoutTail(log),
      stderr: lastLines(tailOf(checkStderr(taskId))),
    });
  }
  return reports;
}

/** The end of a file that may be large, or absent — a check stopped before it started wrote none. */
function tailOf(file: string, bytes = 64_000): string {
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const size = fs.fstatSync(fd).size;
      const buf = Buffer.alloc(Math.min(size, bytes));
      fs.readSync(fd, buf, 0, buf.length, size - buf.length);
      return buf.toString('utf8');
    } finally { fs.closeSync(fd); }
  } catch { return ''; }
}

/**
 * Where the run's work ended up, for a person who now has to go and look at it.
 *
 * A branch, not a directory: the worktree is scaffolding and gets removed, the branch is the
 * result and stays in the repository. Reported as soon as a terminal step has a branch, so it is
 * useful while the run is still going, not only afterwards.
 */
/**
 * How a step signed off: its closing statement, as the engine recorded it on the attempt.
 *
 * The engine carries the payload and never reads it; this reads it. No git and no path — the step
 * made the statement to its harness, and it lives on the engine's record of the attempt that made
 * it, which is also what keeps a resumed step from being credited with its parent's.
 */
export function closeoutOf(views: ReadonlyMap<string, TaskView>, run: Run, stepName: string): Closeout | { error: string } | undefined {
  const taskId = run.steps[stepName]?.taskId;
  const said = taskId ? views.get(taskId)?.state.attempts.at(-1)?.closeout : undefined;
  return said === undefined ? undefined : parseCloseout(said);
}

/** Only the well-formed ones, for the pure functions that just want the outcome. */
export const closeoutReader = (views: ReadonlyMap<string, TaskView>, run: Run) => (stepName: string): Closeout | undefined => {
  const c = closeoutOf(views, run, stepName);
  return c && !('error' in c) ? c : undefined;
};

/**
 * Artifacts a step DECLARED that are not where it says they are.
 *
 * The whole point of declaring them. The first real run lost the reviewer's entire output because
 * REVIEW.md was written and never committed, and nothing anywhere noticed — the merge was clean
 * and empty. A declared file that is not on the branch is now a mismatch somebody can see. Since
 * the run commits whatever a step leaves, a missing one was never written — or was written where
 * git will not take it, like a gitignored path.
 *
 * An absolute path names a file in the step's files directory (`artifactsDir`), and is looked for there,
 * on disk: present when it is a file inside the directory once every link on the way is followed, so a
 * link that leads out is as missing as where it leads. Any other absolute path is reported without being
 * looked at (`artifactPlace`).
 */
export function missingArtifacts(run: Run, stepName: string, closeout: Closeout | { error: string } | undefined): string[] {
  if (!closeout || 'error' in closeout) return [];
  const branch = run.steps[stepName]?.branch;
  const dir = artifactsDir(run, stepName);
  return closeout.artifacts.filter((f) => {
    const place = artifactPlace(f, dir);
    if (place === 'outside') return true;
    if (place === 'files') return !isFileIn(f, dir);
    if (!branch) return false;
    try { git(run.repo, 'cat-file', '-e', `${branch}:${f}`); return false; } catch { return true; }
  });
}

/** Whether `file` is a regular file inside `dir`, with every link on the way to either followed. */
function isFileIn(file: string, dir: string): boolean {
  try {
    const real = fs.realpathSync(file);
    return artifactPlace(real, fs.realpathSync(dir)) === 'files' && fs.statSync(real).isFile();
  } catch { return false; }
}

/**
 * Every file in a step's files directory, every level down, with its size: what `wf decide` lists after
 * the step's closeout. Regular files only, and no link is followed, so nothing outside the directory is
 * listed because something inside it points there.
 */
export function artifactFiles(run: Pick<Run, 'id'>, stepName: string): ArtifactFile[] {
  const found: ArtifactFile[] = [];
  const walk = (dir: string): void => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const at = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(at);
      else if (entry.isFile()) found.push({ path: at, bytes: fs.lstatSync(at).size });
    }
  };
  walk(artifactsDir(run, stepName));
  return found.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Has this branch landed on the base branch? Git's answer, not ours.
 *
 * `--is-ancestor` rather than a merge-commit search, so a fast-forward, a squash-merge that was
 * then merged, and a rebase all read the same: the commits are in, therefore it shipped.
 */
export function isShipped(run: Run, branch: string): boolean {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', branch, run.branch], { cwd: run.repo, stdio: 'ignore' });
    return true;
  } catch { return false; }
}

/**
 * The files this run ADDED — what its steps wrote for whoever reads next.
 *
 * Read out of git rather than off disk, because the worktree a step ran in is gone by the time
 * anybody decides anything, while the branch is exactly as it was left.
 *
 * "Added" is the whole rule. A step that wants to tell a person something writes a file, the same
 * way it tells the next step — so the artifacts are the new files, and no frontmatter key has to
 * be invented to declare them.
 */
export function artifacts(run: Run, branch: string): string[] {
  try {
    return git(run.repo, 'diff', '--diff-filter=A', '--name-only', `${run.baseRef}...${branch}`)
      .split('\n').map((l) => l.trim()).filter(Boolean);
  } catch { return []; }
}

/** One artifact's text, out of the branch. */
export function readArtifact(run: Run, branch: string, file: string): string {
  try { return git(run.repo, 'show', `${branch}:${file}`); } catch { return ''; }
}

/** How much the run changed, in one line. */
export function diffStat(run: Run, branch: string): string {
  try { return git(run.repo, 'diff', '--shortstat', `${run.baseRef}...${branch}`); } catch { return ''; }
}

/** What is left for a person to do — the pure call, with git asked the one question it owns. */
export async function decide(e: Engine, id: string): Promise<{
  run: Run;
  decision: Decision;
  closeouts: Record<string, Closeout | { error: string } | undefined>;
  /** Every settled check, by step: what the run's own fact about the step says. */
  checks: Record<string, CheckReport>;
}> {
  const run = readRun(id);
  const steps = stepsOf(run);
  const { views, phaseOf } = await taskPhases(e, run);
  const closeouts = Object.fromEntries(Object.keys(run.steps).map((name) => [name, closeoutOf(views, run, name)]));
  const checks = Object.fromEntries(await checkReports(e, run, steps, phaseOf, (p) => p === 'succeeded' || p === 'failed' || p === 'stopped'));
  return { run, decision: decision(steps, run, phaseOf, (b) => isShipped(run, b), closeoutReader(views, run), closeoutAsked(views)), closeouts, checks };
}

export function resultBranches(run: Run): string[] {
  const steps = stepsOf(run);
  return terminalSteps(steps)
    .map((s) => run.steps[s.name]?.branch)
    .filter((b): b is string => Boolean(b));
}
