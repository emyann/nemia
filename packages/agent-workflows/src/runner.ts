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
import { CHECK, CHECK_DEADLINE_SECONDS, checkBrief, lastLines, readVerdict, stdoutTail, type CheckRefusal, type Verdict } from './check.ts';
import { depsPlan, inside, isModuleKey, lockfilePackages, lockfileParting, refusalLines, worktreeInclude, type DepEntry, type DepsListing, type Installed, type Provisioned, type WorktreeInclude } from './deps.ts';

export { verdictWord } from './check.ts';
export { artifactLines, dueNote, outputLines, owedFields, roundDueNote, tryNote } from './run.ts';
export type { Retry, RetryAsk, RetryMode, Round, RoundAsk } from './run.ts';
import { fansOut, loadWorkflows, terminalSteps, type Workflow } from './workflow.ts';
import { artifactPlace, type ArtifactFile } from './run.ts';
import { askingTry, assess, cancelPlan, capOf, checkTaskId, closeoutSchemaOf, composeBrief, decision, handOffDue, inFlight, listing, modeWord, nextTry, owesReplies, parseCloseout, retriesDue, retryLines, retryRefusal, roundAsk, roundFiled, roundLines, roundsDue, spentAsks, spentRoundAsks, stepStatus, stepTaskId, tryOf, workspacePlan, type Assessment, type CancelPlan, type Closeout, type Decision, type Listing, type Retry, type RetryAsk, type RetryMode, type Round, type RoundAsk, type Run, type TaskPhase } from './run.ts';

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

/**
 * A person's `wf retry`, in files of its own: `runs/<id>.asks/retry-<step>-<n>`, one per try asked for.
 *
 * For the reason a cancellation has its own file: the run's json has one writer, the tick, and a verb typed
 * while `wf up` runs must not be a second. The verb creates the ask, whole and exclusively, and never touches
 * it again. Every pass reads the directory, and once the run's record holds the try an ask names, the tick
 * moves the file into `done/` — consumed, never edited. Naming the try is what makes an ask honoured once: a
 * pass that dies after filing the try and before consuming the ask files nothing more, because the next pass
 * finds the try on the board (`adoptTries`) or on the record (`spentAsks`).
 *
 * `wf round` is the same, in `round-<step>-<n>`: the looping step, and the round it asks for (`adoptRounds`, `spentRoundAsks`).
 */
const asksDir = (id: string) => path.join(runsDir(), `${id}.asks`);
export const askFile = (id: string, step: string, n: number): string => path.join(asksDir(id), `retry-${step}-${n}`);
export const roundAskFile = (id: string, step: string, round: number): string => path.join(asksDir(id), `round-${step}-${round}`);

/** The asks waiting in a run's directory — tries and rounds — and a line for each file there that names one and cannot be read as one. */
export function readAsks(id: string): { asks: RetryAsk[]; rounds: RoundAsk[]; notes: string[] } {
  const asks: RetryAsk[] = [];
  const rounds: RoundAsk[] = [];
  const notes: string[] = [];
  let names: string[];
  try {
    names = fs.readdirSync(asksDir(id), { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name).sort();
  } catch { return { asks, rounds, notes }; }
  for (const name of names) {
    // Anything else is not an ask: the file the verb writes before linking it into place starts with a dot.
    const tried = /^retry-(.+)-(\d+)$/.exec(name);
    const again = /^round-(.+)-(\d+)$/.exec(name);
    const file = path.join(asksDir(id), name);
    if (tried) {
      const ask = askIn(file, tried[1]!, Number(tried[2]));
      if (typeof ask === 'string') notes.push(`${file}: ${ask}, so it is not honoured — remove it, and ask with wf retry`);
      else asks.push(ask);
    } else if (again) {
      const ask = roundAskIn(file, again[1]!, Number(again[2]));
      if (typeof ask === 'string') notes.push(`${file}: ${ask}, so it is not honoured — remove it, and ask with wf round`);
      else rounds.push(ask);
    }
  }
  return { asks, rounds, notes };
}

/** One round ask file, read: the looping step and the round from its name, when from what it holds — or why it cannot be read. */
function roundAskIn(file: string, step: string, round: number): RoundAsk | string {
  let held: unknown;
  try { held = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) { return `unreadable (${(err as Error).message})`; }
  if (!held || typeof held !== 'object' || Array.isArray(held)) return 'it is not an ask wf round wrote';
  const { at } = held as Record<string, unknown>;
  return { step, round, at: typeof at === 'string' ? at : '' };
}

/** One ask file, read: the step and the try from its name, how and when from what it holds — or why it cannot be read. */
function askIn(file: string, step: string, n: number): RetryAsk | string {
  let held: unknown;
  try { held = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) { return `unreadable (${(err as Error).message})`; }
  const { mode, model, at } = (held && typeof held === 'object' ? held : {}) as Record<string, unknown>;
  if (mode !== 'nudge' && mode !== 'fresh' && mode !== 'recheck') return `it asks for no mode wf retry knows (${JSON.stringify(mode)})`;
  if (model !== undefined && (typeof model !== 'string' || !model)) return 'its model is not a name';
  return { step, try: n, mode, ...(model ? { model: model as string } : {}), at: typeof at === 'string' ? at : '' };
}

/**
 * Write a person's ask, whole and exclusively: into a file of its own, then linked to its name. `link` refuses a
 * name that exists, as `wx` does, and unlike `wx` leaves no moment in which the tick can read an ask that has
 * been created and not yet written. False when an ask for that try was already there.
 */
function writeAsk(file: string, ask: RetryAsk | RoundAsk): boolean {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const whole = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}`);
  fs.writeFileSync(whole, `${JSON.stringify(ask, null, 2)}\n`, { flag: 'wx' });
  try {
    fs.linkSync(whole, file);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw err;
  } finally {
    fs.rmSync(whole, { force: true });
  }
}

/** Move each ask the run's record already answers into `done/`. The tick's one touch on a person's file, and never an edit. */
function consumeAsks(run: Run, asks: readonly RetryAsk[], rounds: readonly RoundAsk[]): void {
  const spent = [
    ...spentAsks(run, asks).map((a) => askFile(run.id, a.step, a.try)),
    ...spentRoundAsks(run, rounds).map((a) => roundAskFile(run.id, a.step, a.round)),
  ];
  for (const file of spent) {
    const done = path.join(asksDir(run.id), 'done', path.basename(file));
    try {
      fs.mkdirSync(path.dirname(done), { recursive: true });
      fs.renameSync(file, done);
    } catch { /* already moved, by a pass beside this one */ }
  }
}

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
 *
 * Exported, log-free, so a consumer narrows a view as the tick does. No view at all is `unknown` too.
 */
export const phaseOfView = (v: TaskView | undefined): TaskPhase => {
  if (!v) return 'unknown';
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
    phaseOf: (taskId) => phaseOfView(views.get(taskId)),
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
    if (run.steps[step.name]?.check || stepStatus(step, run, phaseOf, closeoutOf, asked, steps) !== 'checking') continue;
    const taskId = checkTaskId(run, step.name);
    const view = await e.view(taskId);
    if (!view.state.brief) continue;   // not filed: due, and this pass's to file
    views.set(taskId, view);
    run.steps[step.name] = { ...run.steps[step.name]!, check: { taskId } };
    adopted.push(step.name);
  }
  return adopted;
}

/**
 * Tries a pass filed and never wrote down, put back on the record — in memory, as `adoptChecks` does, and
 * before anything asks what is in flight, for the same reason: a run cancelled in that window files no more
 * tries, so a try filed in it would otherwise never be adopted, nor stopped.
 *
 * Looked for only where a try is due (`retriesDue`, cancelled or not): an ask for the step's next try, or a
 * refused check `retries:` covers. A run waiting on a person with nothing asked costs no look.
 */
async function adoptTries(
  e: Engine,
  run: Run,
  steps: readonly Workflow[],
  views: Map<string, TaskView>,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined,
  asked: (taskId: string) => boolean,
  verdictOf: (step: string) => Verdict | undefined,
  asks: readonly RetryAsk[],
): Promise<string[]> {
  const adopted: string[] = [];
  for (const r of retriesDue(steps, run, phaseOf, closeoutOf, asked, verdictOf, asks)) {
    const taskId = r.mode === 'recheck' ? checkTaskId(run, r.step, r.try) : stepTaskId(run, r.step, r.try);
    const view = await e.view(taskId);
    if (!view.state.brief) continue;   // not filed: due, and this pass's to file
    views.set(taskId, view);
    const record = run.steps[r.step]!;
    run.steps[r.step] = r.mode === 'recheck' ? { ...nextTry(record, r), check: { taskId } } : nextTry(record, r, taskId);
    adopted.push(r.step);
  }
  return adopted;
}

/**
 * Rounds a pass filed and never wrote down, put back on the record — in memory, and before anything asks what is in flight, as `adoptTries`
 * does and for its reason.
 *
 * Looked for only where a round is due (`roundsDue`, cancelled or not), under the target's next try's id. A pass that filed the round and died
 * left the looping step's `again: true` on the record, so the round reads due again; finding its task filed, this moves the loop on as the
 * pass would have (`roundFiled`), and nothing is filed twice.
 */
async function adoptRounds(
  e: Engine,
  run: Run,
  steps: readonly Workflow[],
  views: Map<string, TaskView>,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined,
  asked: (taskId: string) => boolean,
  asks: readonly RoundAsk[],
): Promise<string[]> {
  const adopted: string[] = [];
  for (const r of roundsDue(steps, run, phaseOf, closeoutOf, asked, asks)) {
    const taskId = stepTaskId(run, r.target, tryOf(run, r.target) + 1);
    const view = await e.view(taskId);
    if (!view.state.brief) continue;   // not filed: due, and this pass's to file
    views.set(taskId, view);
    Object.assign(run.steps, roundFiled(steps, run, r, taskId));
    adopted.push(r.step);
  }
  return adopted;
}

/**
 * Whether a task was asked for a closeout: the schema the engine keeps on its record of the filing. What tells a
 * step that ended without one — `unsigned` — from a task that was never asked. Exported, log-free, for a consumer
 * that words a step as `wf ls` does.
 */
export const closeoutAsked = (views: ReadonlyMap<string, TaskView>) => (taskId: string): boolean =>
  Boolean(views.get(taskId)?.state.closeoutSchema);

/**
 * What each step's current check exited with, off the engine's record: the code its process gave, or
 * `unfinished` when it gave none — killed by a signal, stopped, or never started — and `undefined` for a step
 * with no check filed. What the tick tells a refusal from a check that did not finish by (`refusedCheck`),
 * without reading a log: a run waiting on a person costs no more each pass. The check prints the code it exits
 * with, so this and the log's `[wf check] exit N`, which `wf ls` reads, agree.
 *
 * Exported for a consumer that words a check as `wf ls` does, without a `logs` call per refused check.
 */
export const exitVerdicts = (views: ReadonlyMap<string, TaskView>, run: Run) => (step: string): Verdict | undefined => {
  const taskId = run.steps[step]?.check?.taskId;
  if (!taskId) return undefined;
  const exitCode = views.get(taskId)?.state.attempts.at(-1)?.exitCode;
  return typeof exitCode === 'number' ? exitCode : 'unfinished';
};

/** The harness's own id for a task's last session — what `--resume` takes. */
const sessionIn = (views: ReadonlyMap<string, TaskView>, taskId: string): string | undefined =>
  views.get(taskId)?.state.attempts.at(-1)?.nativeId ?? undefined;

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

/**
 * Where the worktree's `package-lock.json` asks for a tree the main checkout does not have on disk, or
 * null when links will do: `lockfileParting`, over a look at each package path the lockfile names.
 *
 * A main checkout with no `node_modules` has no tree to part from and none to link, so its lockfile is
 * compared byte for byte instead, as before: a different one is installed in the worktree, and the same
 * one leaves nothing to provision. A worktree without a lockfile parts only from a main checkout that
 * has one — a repository without one is not npm's, and links are all there is.
 */
export function lockfileParts(mainRoot: string, worktree: string): string | null {
  const read = (file: string): string | null => { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } };
  const wanted = read(path.join(worktree, 'package-lock.json'));
  const mains = read(path.join(mainRoot, 'package-lock.json'));
  if (wanted === null) return mains === null ? null : 'package-lock.json';
  if (!fs.statSync(path.join(mainRoot, 'node_modules'), { throwIfNoEntry: false })?.isDirectory()) {
    return wanted === mains ? null : 'package-lock.json';
  }

  let lock: unknown = null;
  try { lock = JSON.parse(wanted); } catch { /* parts at package-lock.json */ }
  const installed: Record<string, Installed | null> = {};
  for (const key of Object.keys(lockfilePackages(lock) ?? {}).filter(isModuleKey)) {
    const at = path.join(mainRoot, key);
    const st = lstatOf(at);
    if (!st) installed[key] = null;
    else if (st.isSymbolicLink()) {
      installed[key] = { link: true, resolved: path.relative(mainRoot, path.resolve(path.dirname(at), fs.readlinkSync(at))).split(path.sep).join('/') };
    } else {
      let version: string | undefined;
      try { version = JSON.parse(fs.readFileSync(path.join(at, 'package.json'), 'utf8')).version; } catch { /* a package without a manifest has no version */ }
      installed[key] = { link: false, version };
    }
  }
  return lockfileParting(lock, installed);
}

/** Whether git ignores a path in a checkout. `git check-ignore` says no for a tracked path, and for one git has not been told to ignore. */
function ignored(repo: string, rel: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '-q', '--', rel], { cwd: repo, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
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
 * install; when the worktree's `package-lock.json` asks for packages main has not installed they would be
 * the wrong tree, so `npm ci` installs one here — about a minute, which the step is told (`depsLines`).
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

  if (lockfileParts(mainRoot, worktree)) {
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
 * Read from the main checkout, never from the worktree a step can edit. Only a path git ignores there is
 * copied, as Claude Code's file copies only ignored files: anything else lands in the worktree as an
 * untracked file, and the hand-off's `git add -A` commits it onto the run's branch — a token in a notes
 * file included. Nothing already in the worktree is overwritten, so a second pass copies nothing. What a
 * person should hear comes back as lines for the run's log, never as an error: a path the main checkout
 * does not have is skipped, and one that leads outside the repository — as written, or through a link —
 * or that git does not ignore is refused.
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
    if (!ignored(repo, rel)) { notes.push(`.worktreeinclude: refused "${rel}" is not gitignored — the hand-off would commit it`); continue; }
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
  if (deps.tree === 'own' && deps.installed) notes.push('node_modules: installed with npm ci — package-lock.json asks for packages the main checkout has not installed');
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
  // Nor for another step's try: any step may be tried again, as `<step>-try<n>`, its check as `<step>-try<n>-check`.
  const tryClash = steps.map((s) => ({ s, of: /^(.+)-try\d+(?:-check)?$/.exec(s.name)?.[1] })).find(({ of }) => of && steps.some((other) => other.name === of));
  if (tryClash) {
    const { s, of } = tryClash;
    throw Object.assign(new Error(
      `${s.name}: a step may not be named for another step's try. The run files ${of} tried again as ${of}-try2, its check as ${of}-try2-check, and on. Rename ${s.name}.md.`,
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
 * One pass's work: the steps it filed, the steps whose checks it filed, the steps it tried again, and where the
 * run stands — and `notes`, each line starting with its step: what cutting a worktree had to say (a path
 * `.worktreeinclude` lists that the main checkout does not have, a line it refused, an `npm ci` that ran or
 * failed), each try and each round filed and on whose word, and an ask file that cannot be read. `looped` names the
 * looping steps whose loop this pass took round again.
 */
export type Advanced = { run: Run; filed: string[]; checked: string[]; tried: string[]; looped: string[]; status: Assessment['status']; blocked: string[]; notes: string[] };

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
  const verdictOf = exitVerdicts(views, run);
  // A person's word, read on every pass: an ask made while this pass was elsewhere is read by the next.
  const { asks, rounds: roundAsks, notes: askNotes } = readAsks(run.id);
  const adoptedRounds = await adoptRounds(e, run, steps, views, phaseOf, signedOff, asked, roundAsks);
  const adoptedTries = await adoptTries(e, run, steps, views, phaseOf, signedOff, asked, verdictOf, asks);
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

  const { ready, check, retry, round, blocked, status } = assess(steps, run, phaseOf, signedOff, asked, verdictOf, asks, roundAsks);

  // Another try: a refused check `retries:` still covers, or a person's `wf retry`. The step goes on in the
  // workspace and on the branch it had, under its next try's derived id, and the try it replaces moves behind
  // it on the record. Nothing about the engine changes: to it, this is one more task.
  const tried: string[] = [];
  const rechecked: string[] = [];
  const notes: string[] = [...askNotes];
  for (const r of retry) {
    const step = steps.find((s) => s.name === r.step)!;
    const record = run.steps[r.step]!;
    tried.push(r.step);
    notes.push(`${r.step}: try ${r.try} — ${r.by === 'retries' ? `retries: ${step.retries}` : `wf retry ${modeWord(r)}`}`);
    // A recheck files no session. Its check is filed below with the others, under the new try's id.
    if (r.mode === 'recheck') {
      run.steps[r.step] = nextTry(record, r);
      rechecked.push(r.step);
      continue;
    }

    const taskId = stepTaskId(run, r.step, r.try);
    // A try an earlier pass filed and never wrote down was adopted above. Looked up once more all the same,
    // as a check is: filing an id the engine already holds would journal it twice.
    if (!(await e.view(taskId)).state.brief) {
      const files = artifactsDir(run, r.step);
      fs.mkdirSync(files, { recursive: true });
      // A nudge continues the last try's session. With none to continue — a session the harness never
      // reported — the try starts a new one, and its brief says so.
      const resumeFrom = r.mode === 'nudge' ? sessionIn(views, record.taskId!) : undefined;
      // What the check said, as data in the brief: the frozen command, its exit, and both tails.
      const refusal = record.check && step.check ? await refusalOf(e, step.check, record.check.taskId) : undefined;
      // A new session of a loop's target within a round owes replies to the round's findings, and is handed them as its first try was:
      // off the looping step's try that asked, since the looping step's own place is unfiled until the target is verified.
      const asking = resumeFrom ? undefined : askingTry(steps, run, r.step);
      const askedWith = asking ? (await e.view(asking.taskId)).state.attempts.at(-1)?.closeout : undefined;
      const findings = askedWith === undefined ? undefined : parseCloseout(askedWith);
      const reads = (name: string): Closeout | undefined =>
        (asking && name === asking.looping.name && findings && !('error' in findings) ? findings : signedOff(name));
      await e.file({
        id: taskId,
        brief: composeBrief(step, run, steps, reads, files, undefined, {
          try: r.try, by: r.by, mode: r.mode, ...(r.model ? { model: r.model } : {}), resumed: Boolean(resumeFrom),
          status: stepStatus(step, run, phaseOf, signedOff, asked, steps), ...(refusal ? { refusal } : {}),
        }),
        cwd: record.workspace ?? run.workspace,
        harness: step.harness,
        model: r.model ?? step.model,
        effort: step.effort,
        permissionMode: step.permissionMode,
        // The fence goes with every try: a try is the step, and a nudge continues a session that had it.
        tools: step.tools,
        deadlineSeconds: step.deadlineSeconds,
        maxAttempts: step.maxAttempts,
        resumeFrom,
        // A loop's target tried again within a round still owes its answers to the findings it was handed.
        closeoutSchema: closeoutSchemaOf(step, owesReplies(steps, run, r.step)),
      });
    }
    run.steps[r.step] = nextTry(record, r, taskId);
  }

  // Another round: a looping step said `again: true` with rounds left, or a person's `wf round` took a loop out of rounds once more. The
  // loop's target goes on in its workspace, its session continued under its next try's id and handed what the looping step declared, as data.
  // Every other step of the loop moves behind, unfiled, and a later pass files each once what it waits on is verified — a new session. To the
  // engine, this is one more task.
  const looped: string[] = [];
  for (const r of round) {
    const looping = steps.find((s) => s.name === r.step)!;
    const target = steps.find((s) => s.name === r.target)!;
    const record = run.steps[r.target]!;
    const taskId = stepTaskId(run, r.target, tryOf(run, r.target) + 1);
    looped.push(r.step);
    notes.push(`${r.step}: round ${r.round} — ${r.by === 'again' ? `again, rounds: ${capOf(looping)}` : 'wf round'}; ${r.target} goes again`);
    // A round an earlier pass filed and never wrote down was adopted above. Looked up once more all the same, as a try is.
    if (!(await e.view(taskId)).state.brief) {
      const files = artifactsDir(run, r.target);
      fs.mkdirSync(files, { recursive: true });
      const resumeFrom = record.taskId ? sessionIn(views, record.taskId) : undefined;
      await e.file({
        id: taskId,
        // Read off the closeout that asked for the round, before the record moves it behind.
        brief: composeBrief(target, run, steps, signedOff, files, undefined, undefined, {
          loop: r.step, round: r.round, rounds: capOf(looping), by: r.by, resumed: Boolean(resumeFrom),
        }),
        cwd: record.workspace ?? run.workspace,
        harness: target.harness,
        model: target.model,
        effort: target.effort,
        permissionMode: target.permissionMode,
        tools: target.tools,
        deadlineSeconds: target.deadlineSeconds,
        maxAttempts: target.maxAttempts,
        resumeFrom,
        closeoutSchema: closeoutSchemaOf(target, true),
      });
    }
    Object.assign(run.steps, roundFiled(steps, run, r, taskId));
  }

  // The fact the run establishes for itself: each signed step's `check:`, executed where the work is.
  // An engine task on the `check` harness, so it outlives this pass, has a deadline, and is stopped
  // by a cancel like anything else. Nothing is ready on it in this pass — a follower waits for the
  // check to SETTLE, on a later one.
  const checked: string[] = [];
  for (const name of [...check, ...rechecked]) {
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
      // than a duplicate. A step of a loop filed for a later round is on a later try, and its id says which.
      id: stepTaskId(run, name, tryOf(run, name)),
      // What the steps it reads declared, if it names any in `input:` — read off the same closeouts the
      // assessment that made it ready just read, so it is handed what it was filed on.
      // And, when the run installed its `node_modules` or could not, why its start was slow or what to run.
      brief: composeBrief(step, run, steps, signedOff, files, place.deps),
      cwd: place.workspace,
      harness: step.harness,
      model: step.model,
      effort: step.effort,
      // Left to the engine's default (`auto`) unless the step says otherwise: a workflow runs
      // unattended by definition, and a mode that prompts is a mode that stalls.
      permissionMode: step.permissionMode,
      // The only tools the session has, when the step names them — from the workflow this run froze, like the rest.
      tools: step.tools,
      deadlineSeconds: step.deadlineSeconds,
      maxAttempts: step.maxAttempts,
      resumeFrom: step.resume ? sessionOf(step.resume) : undefined,
      // The shape of the step's closing statement, with the fields its `output:` declares — from the
      // workflow this run froze, never the folder. The engine hands it to the harness and records the
      // answer without reading it; what the fields mean is ours — see `Closeout`.
      closeoutSchema: closeoutSchemaOf(step),
    });
    // The tries a round moved behind stay with it.
    run.steps[name] = { ...run.steps[name], taskId, workspace: place.workspace, branch: place.branch };
    filed.push(name);
  }
  if (filed.length || checked.length || tried.length || looped.length || adopted.length || adoptedTries.length || adoptedRounds.length) writeRun(run);
  // After the record is written, never before: an ask is consumed once the record holds its try or its round — this
  // pass's, or one a pass that died before consuming it wrote down.
  consumeAsks(run, asks, roundAsks);

  return { run, filed, checked, tried, looped, status, blocked, notes };
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
  // A check, a try or a round filed by a pass that died before writing the run down is in flight too. Found here so
  // the verb stops it at once; on the record only in memory, because this verb never writes the run.
  const { asks, rounds } = readAsks(id);
  const verdictOf = exitVerdicts(views, run);
  await adoptRounds(e, run, steps, views, phaseOf, closeoutReader(views, run), closeoutAsked(views), rounds);
  await adoptTries(e, run, steps, views, phaseOf, closeoutReader(views, run), closeoutAsked(views), verdictOf, asks);
  await adoptChecks(e, run, steps, views, phaseOf, closeoutReader(views, run), closeoutAsked(views));

  const plan = cancelPlan(steps, run, phaseOf, closeoutReader(views, run), closeoutAsked(views), verdictOf, asks, rounds);
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
  const { asks, rounds } = readAsks(run.id);
  // The engine's own word, but `unknown` for a task it has no record of, as `phaseOfView` has it: the engine folds
  // that task to the state of one filed and waiting for a slot, and calls it `pending`, which is in flight.
  const wordOf = (taskId: string): string => {
    const v = views.get(taskId);
    return v?.state.brief ? v.phase : 'unknown';
  };
  return listing(steps, run, wordOf, (name) => closeoutOf(views, run, name), closeoutAsked(views), (name) => refused.get(name)?.verdict, asks, rounds);
}

export type Asked = { run: Run; ask: RetryAsk; file: string };

/**
 * Ask for another try of a step — `wf retry` — by writing the ask, and nothing else. The next tick honours it once.
 *
 * Refused before anything is written, with what to do instead (`retryRefusal`): a step that is not waiting on a
 * person, a cancelled run, an ask for that try already there. Like a cancellation, the ask is the person's own
 * file, and the verb never writes the run's json, which the tick owns.
 */
export async function retry(e: Engine, id: string, stepName: string, how: { mode: RetryMode; model?: string }): Promise<Asked> {
  const run = readRun(id);
  const steps = stepsOf(run);
  const { views, phaseOf } = await taskPhases(e, run);
  const refusal = (asks: readonly RetryAsk[]) =>
    retryRefusal(steps, run, stepName, how, phaseOf, closeoutReader(views, run), closeoutAsked(views), exitVerdicts(views, run), asks);
  const refuse = (message: string): never => { throw Object.assign(new Error(message), { exitCode: 2 }); };

  const refused = refusal(readAsks(id).asks);
  if (refused) refuse(refused);
  const ask: RetryAsk = { step: stepName, try: tryOf(run, stepName) + 1, mode: how.mode, ...(how.model ? { model: how.model } : {}), at: new Date().toISOString() };
  // Someone asked in the moment since the look above: said as the look would have said it.
  if (!writeAsk(askFile(id, stepName, ask.try), ask)) refuse(refusal(readAsks(id).asks) ?? `try ${ask.try} of ${stepName} is already asked for. Wait for it: wf ls ${id}.`);
  return { run, ask, file: askFile(id, stepName, ask.try) };
}

export type RoundAsked = { run: Run; ask: RoundAsk; file: string };

/**
 * Ask for one more round of a loop whose rounds are spent — `wf round` — by writing the ask, and nothing else. The next tick honours it once.
 *
 * Refused before anything is written, with what to do instead (`roundAsk`): a round still running, one the run files itself, a loop that
 * ended without asking again, a step of the loop that stopped, a cancelled run, a round already asked for. Like `wf retry`'s, the ask is the
 * person's own file, and the verb never writes the run's json, which the tick owns. `stepName` may be left out when the run has one loop.
 */
export async function round(e: Engine, id: string, stepName?: string): Promise<RoundAsked> {
  const run = readRun(id);
  const steps = stepsOf(run);
  const { views, phaseOf } = await taskPhases(e, run);
  const answer = (asks: readonly RoundAsk[]) => roundAsk(steps, run, stepName, phaseOf, closeoutReader(views, run), closeoutAsked(views), asks);
  const refuse = (message: string): never => { throw Object.assign(new Error(message), { exitCode: 2 }); };

  const first = answer(readAsks(id).rounds);
  if ('refusal' in first) return refuse(first.refusal);
  const ask: RoundAsk = { step: first.step, round: first.round, at: new Date().toISOString() };
  const file = roundAskFile(id, ask.step, ask.round);
  // Someone asked in the moment since the look above: said as the look would have said it.
  if (!writeAsk(file, ask)) {
    const now = answer(readAsks(id).rounds);
    refuse('refusal' in now ? now.refusal : `round ${ask.round} of ${ask.step}'s loop is already asked for. Wait for it: wf ls ${id}.`);
  }
  return { run, ask, file };
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
    reports.set(step.name, { passed: phaseOf(taskId) === 'succeeded', ...(await refusalOf(e, step.check, taskId)) });
  }
  return reports;
}

/** What a check said, off its log and its stderr file: the verdict, and the last lines of each stream. */
async function refusalOf(e: Engine, command: string, taskId: string): Promise<CheckRefusal> {
  const log = await e.logs(taskId);
  return { command, verdict: readVerdict(log), stdout: stdoutTail(log), stderr: lastLines(tailOf(checkStderr(taskId))) };
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
  /** The tries the next tick files: asked for, or covered by `retries:`. */
  retrying: Retry[];
  /** The rounds the next tick files: asked for with `again: true`, or with `wf round`. */
  rounding: Round[];
  /** For each loop out of rounds, the `wf round` that goes once more (`roundLines`); for each step a person may try again, the `wf retry` (`retryLines`). */
  offers: string[];
}> {
  const run = readRun(id);
  const steps = stepsOf(run);
  const { views, phaseOf } = await taskPhases(e, run);
  const closeouts = Object.fromEntries(Object.keys(run.steps).map((name) => [name, closeoutOf(views, run, name)]));
  const checks = Object.fromEntries(await checkReports(e, run, steps, phaseOf, (p) => p === 'succeeded' || p === 'failed' || p === 'stopped'));
  const { asks, rounds } = readAsks(id);
  const reader = closeoutReader(views, run);
  const asked = closeoutAsked(views);
  // The verdict the screen prints, off the log: a refusal and a check that did not finish, told apart by it.
  const verdictOf = (name: string) => checks[name]?.verdict;
  const d = decision(steps, run, phaseOf, (b) => isShipped(run, b), reader, asked, verdictOf, asks, rounds);
  return {
    run, decision: d, closeouts, checks,
    retrying: run.cancelledAt ? [] : retriesDue(steps, run, phaseOf, reader, asked, verdictOf, asks),
    rounding: run.cancelledAt ? [] : roundsDue(steps, run, phaseOf, reader, asked, rounds),
    offers: [...roundLines(steps, run, d), ...retryLines(steps, run, d, phaseOf, reader, asked)],
  };
}

export function resultBranches(run: Run): string[] {
  const steps = stepsOf(run);
  return terminalSteps(steps)
    .map((s) => run.steps[s.name]?.branch)
    .filter((b): b is string => Boolean(b));
}
