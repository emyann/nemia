/**
 * A run is one workflow, once, over one workspace.
 *
 * Same shape as the engine underneath it: `assess()` is pure and decides everything; the file
 * store and the engine calls are the I/O around it. A run holds no status of its own — whether it
 * is finished is a question about its steps' tasks, and the engine can answer that. Copying the
 * answer here would be a second source of truth that goes stale the moment a task settles.
 *
 * Cancellation is the exception, and it is the one that proves the rule: "somebody called this
 * off" is not a fact about any step's task, so there is nothing here to copy. The engine can be
 * asked to stop a task, but it has never heard of the run — which is why `cancelledAt` lives on
 * the run, and is the only state this file writes down rather than derives.
 */
import type { TaskView } from 'agent-engine';
import { terminalSteps, type Workflow } from './workflow.ts';

/** What the engine says about one step's task. `unknown` is a task we filed and cannot find. */
export type TaskPhase = 'pending' | 'running' | 'succeeded' | 'failed' | 'stopped' | 'unknown';

export type Run = {
  id: string;
  /** The repository the work is about. */
  repo: string;
  /** Where the run's first step works. Later steps inherit, fork or merge from it. */
  workspace: string;
  /** The commit the workspace started from, so a reviewer can diff against it. */
  baseRef: string;
  /** The repository's branch when the run started. */
  branch: string;
  /** Whether each step gets a worktree of its own. False only for `--no-worktree`. */
  isolate: boolean;
  /** What the person actually asked for. This travels to EVERY step; it is the spec. */
  brief: string;
  workflowDir: string;
  /**
   * When somebody called the run off, if they did.
   *
   * On the run rather than on a step, because that is what it is about: stopping the step in
   * flight is one consequence of it, and "file nothing further" is the other, and no step's task
   * can hold the second one.
   */
  cancelledAt?: string;
  /** Per step: the task the engine ran, and the workspace and branch it ran in. */
  steps: Record<string, { taskId: string | null; workspace?: string; branch?: string }>;
  createdAt: string;
};

export type Assessment = {
  /** Steps whose predecessors have all succeeded and which have not been filed. File these. */
  ready: string[];
  /** Steps that can never run, because something they wait on failed. */
  blocked: string[];
  status: 'running' | 'succeeded' | 'failed' | 'cancelled';
};

/**
 * What should happen to this run now. Pure — hand it the engine's view of each task and it
 * decides; it reads no disk and calls no engine.
 */
export function assess(
  steps: readonly Workflow[],
  run: Run,
  phaseOf: (taskId: string) => TaskPhase,
  /**
   * How each step signed off, when it left a closeout.
   *
   * A step can end its session cleanly and still not have done the work — `outcome: "blocked"` is
   * it saying so. The engine cannot know that: it settled a session, and a session that stops
   * because the agent is stuck stops exactly like one that finished. So the DAG asks here.
   */
  closeoutOf: (step: string) => Closeout | undefined = () => undefined,
): Assessment {
  // A cancelled run outranks anything its tasks say. Nothing more is filed for it however
  // cheerfully its predecessors succeeded — which is the entire reason the fact is written down:
  // a tick after a cancel must not helpfully start the next step of a run somebody just stopped.
  if (run.cancelledAt) return { ready: [], blocked: [], status: 'cancelled' };

  const phase = (name: string): TaskPhase | 'unfiled' => {
    const id = run.steps[name]?.taskId;
    if (!id) return 'unfiled';
    // A step that signed off `blocked` did not succeed, whatever became of its session. Read as
    // `stopped` rather than `failed`: nothing downstream can run, and it is waiting on a person
    // rather than broken — which is the distinction `wf decide` then makes out loud.
    if (closeoutOf(name)?.outcome === 'blocked') return 'stopped';
    return phaseOf(id);
  };

  const ready: string[] = [];
  const blocked: string[] = [];

  for (const step of steps) {
    if (phase(step.name) !== 'unfiled') continue;
    const deps = step.after.map((a) => phase(a));
    // A predecessor that failed or was stopped is final: nothing downstream can ever run. Said
    // plainly rather than left to hang, because a run that waits forever looks like a bug.
    if (deps.some((d) => d === 'failed' || d === 'stopped')) blocked.push(step.name);
    else if (deps.every((d) => d === 'succeeded')) ready.push(step.name);
  }

  const all = steps.map((s) => phase(s.name));
  const status: Assessment['status'] =
    all.every((p) => p === 'succeeded') ? 'succeeded'
    : blocked.length || all.some((p) => p === 'failed' || p === 'stopped') ? 'failed'
    : 'running';

  return { ready, blocked, status };
}

// ─── calling one off ────────────────────────────────────────────────────────

/**
 * What cancelling this run has to do — and, because they are the same decision, what to tell the
 * person who asked. Pure, like `assess`, and tested the same way.
 *
 * Three answers, because cancelling anything at any time is a normal thing for a person to do and
 * none of it is an error:
 *
 *   - **cancel** — mark the run and ask the engine to stop whatever it has in flight. Possibly
 *     nothing: a run cancelled before its first tick has filed no task at all, and marking it is
 *     still the whole point, because that is what stops the next tick filing the first step.
 *   - **already-cancelled** — someone got there first, and the time they did it stands rather than
 *     being re-stamped. Anything STILL in flight is asked to stop again all the same: cancelling
 *     is level-triggered like everything else here, so running it twice is how a person fixes a
 *     step that slipped through the first time rather than something they have to reason about.
 *   - **finished** — it ended on its own, and there is nothing left for a tick to do either: no
 *     step in flight AND none ready to file. It is deliberately NOT relabelled — a run that
 *     succeeded succeeded, and overwriting that would make `wf ls` lie about work that landed.
 *
 * "Finished" has to mean both of those, because `failed` does not mean a run has stopped moving:
 * in a fan-out where `a` failed and `b` succeeded, a step waiting only on `b` is still READY while
 * the run as a whole reads failed. Treating that as finished wrote no mark, and the next tick
 * filed the step anyway — the exact thing cancelling is for.
 */
export type CancelPlan =
  | { kind: 'cancel'; stop: InFlight[] }
  | { kind: 'already-cancelled'; at: string; stop: InFlight[] }
  | { kind: 'finished'; status: 'succeeded' | 'failed' };

export type InFlight = { name: string; taskId: string };

/** The steps the engine is still holding: filed, and settled neither way. */
export function inFlight(run: Run, phaseOf: (taskId: string) => TaskPhase): InFlight[] {
  const live: InFlight[] = [];
  for (const [name, step] of Object.entries(run.steps)) {
    if (!step.taskId) continue;
    const phase = phaseOf(step.taskId);
    // `pending` counts: a task that is filed and waiting for a slot has not started, but the next
    // tick would start it — which is precisely what the person cancelling does not want.
    if (phase === 'pending' || phase === 'running') live.push({ name, taskId: step.taskId });
  }
  return live;
}

export function cancelPlan(steps: readonly Workflow[], run: Run, phaseOf: (taskId: string) => TaskPhase): CancelPlan {
  // Whatever is in flight is stopped whatever the rest of the run looks like. A fan-out can have
  // one sibling still working while another has already failed the run as a whole, and that
  // session is exactly the one the person cancelling wants to stop.
  const stop = inFlight(run, phaseOf);
  if (run.cancelledAt) return { kind: 'already-cancelled', at: run.cancelledAt, stop };
  if (stop.length) return { kind: 'cancel', stop };

  // Nothing in flight, so the question is only whether a tick would still file something. `ready`
  // is the honest test for that; `status` alone is not.
  const { ready, status } = assess(steps, run, phaseOf);
  if (!ready.length && (status === 'succeeded' || status === 'failed')) return { kind: 'finished', status };
  return { kind: 'cancel', stop: [] };
}

// ─── the closeout ───────────────────────────────────────────────────────────

/**
 * Where a step writes what it finished with. The path is this package's, not the engine's.
 *
 * The engine is told only that a file at this path means "finished" and never opens it. Everything
 * below — the shape, the field names, what they mean — lives here, because it is a workflow's
 * vocabulary and nothing underneath should have to learn it.
 *
 * NAMED PER STEP, and that is not tidiness. A closeout is committed so it can be read after the
 * worktree is swept away, which means it travels down the branch like any other commit: with one
 * shared name, the next step inherits a satisfied probe and a closeout that is not its own. The
 * first real run settled two steps `succeeded` in six seconds each, having done nothing at all.
 * Distinct names make an inherited marker simply a different file — and make `git show
 * <branch>:<path>` unambiguous on a branch that merged three others.
 */
export const closeoutPath = (step: string) => `.wf/${step}.done.json`;

/**
 * What a step says on its way out.
 *
 * Two audiences, deliberately separated, which is the whole reason this is a record and not a
 * string. `summary` is prose for the DECIDER — a person, at the end of the run. `artifacts` is for
 * the machine and for the next step: the files this step wants read.
 *
 * The reviewer never sees `summary`. Passing the implementer's account of the work to the person
 * judging it would anchor the judgement on the context that produced the work, and offer
 * unverifiable claims beside verifiable evidence — the rule `composeBrief` already keeps. Hermes
 * Kanban injects the parent's summary into the child's prompt; this is the one place worth
 * diverging, and the field earns its place by travelling to the human instead.
 */
export type Closeout = {
  /** `done` finished the work. `blocked` finished the SESSION and needs a person. */
  outcome: 'done' | 'blocked';
  summary: string;
  /** Files this step produced for whoever reads next, by path from the workspace root. */
  artifacts: string[];
  /** Set when blocked: what the person has to settle. */
  needs?: string;
};

/**
 * Read a closeout, forgivingly.
 *
 * An agent wrote this, so it is parsed the way you would parse anything an agent wrote: a missing
 * file is normal (the step is still running, or it is an older run, or it crashed), and a malformed
 * one is reported rather than thrown — a run must not become unreadable because one step wrote
 * bad JSON on its way out.
 */
export function parseCloseout(text: string): Closeout | { error: string } {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch (e) { return { error: `unparseable: ${(e as Error).message}` }; }
  // `typeof [] === 'object'`, so an array would otherwise read as an empty closeout.
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'not an object' };
  const o = raw as Record<string, unknown>;
  const outcome = o.outcome === 'blocked' ? 'blocked' : 'done';
  return {
    outcome,
    summary: typeof o.summary === 'string' ? o.summary : '',
    artifacts: Array.isArray(o.artifacts) ? o.artifacts.filter((a): a is string => typeof a === 'string') : [],
    needs: typeof o.needs === 'string' ? o.needs : undefined,
  };
}

/**
 * What a step is told to write on its way out, appended to every brief.
 *
 * MECHANISM, not prose a workflow author has to remember. The first real run lost an entire
 * reviewer's output because `review.md` was the one step whose body forgot to say "commit this",
 * and the fix at the time was to edit the prose — which leaves the next workflow to make the same
 * mistake. Every step is now told the same thing by the runner, so no workflow can omit it.
 */
export const closeoutContract = (step: string): string => [
  '', '## When you are finished', '',
  `Write \`${closeoutPath(step)}\` and commit it. It is how this run knows you are done, and it`,
  'is the last thing you should do:',
  '', '```json', '{',
  '  "outcome": "done",',
  '  "summary": "one to three sentences: what you did, for the person who decides what ships",',
  '  "artifacts": ["any file you wrote for someone else to read, e.g. REVIEW.md"],',
  '  "needs": "only when blocked: what a person has to settle"',
  '}', '```', '',
  '`artifacts` must be **committed**. The next step gets your branch merged into its workspace, and',
  'an uncommitted file does not travel — a file you list but do not commit is reported as missing.',
  '',
  'Use `"outcome": "blocked"` if you cannot honestly finish. A step that reports success it did not',
  'have is worse than one that stops and says why.',
].join('\n');

// ─── handing it back ────────────────────────────────────────────────────────

/**
 * What is left for a person to do about this run.
 *
 * A review and a reply are two opinions; something has to say what ships, and that something is
 * not a step. An agent that graded the exchange would be a third opinion with no more standing
 * than the first two, and the one thing it could not do is the thing the moment is for — commit
 * the repository to an answer. So the run ends by handing the choice over, deliberately, instead
 * of settling `succeeded` and going quiet.
 *
 * `shipped` is ASKED, not stored. Whether the work landed is a question git can already answer —
 * is the result branch an ancestor of the base branch — and a `decidedAt` field would be a second
 * copy of it, wrong the moment somebody merges by hand. A run still holds no status of its own;
 * cancellation remains the single exception, and it is one because nothing else knows it.
 */
export type Decision =
  | { kind: 'running'; waiting: string[] }
  | { kind: 'cancelled'; at: string }
  | { kind: 'shipped'; branches: string[] }
  | { kind: 'awaiting'; outcome: 'succeeded' | 'failed' | 'blocked'; branches: string[]; failed: string[]; stuck: string[] };

export function decision(
  steps: readonly Workflow[],
  run: Run,
  phaseOf: (taskId: string) => TaskPhase,
  shipped: (branch: string) => boolean,
  closeoutOf: (step: string) => Closeout | undefined = () => undefined,
): Decision {
  if (run.cancelledAt) return { kind: 'cancelled', at: run.cancelledAt };

  const { status, ready } = assess(steps, run, phaseOf, closeoutOf);
  if (status === 'running') {
    // Named so the answer to "why can I not decide yet" is on the screen rather than inferred.
    const live = Object.entries(run.steps)
      .filter(([, s]) => s.taskId && ['pending', 'running'].includes(phaseOf(s.taskId)))
      .map(([name]) => name);
    return { kind: 'running', waiting: [...live, ...ready].sort() };
  }

  const branches = terminalSteps(steps)
    .map((s) => run.steps[s.name]?.branch)
    .filter((b): b is string => Boolean(b));

  // Every terminal branch, not some: a fan-out that ends in two branches is not shipped because
  // one of them landed.
  if (branches.length && branches.every(shipped)) return { kind: 'shipped', branches };

  // Told apart on purpose. A step that STOPPED itself and said why is a question for you; one the
  // engine recorded as failed is a thing that broke. Lumping them loses the only bit that decides
  // whether you read a summary or a log.
  const stepsBy = (p: (name: string) => boolean) =>
    Object.entries(run.steps).filter(([name, s]) => s.taskId && p(name)).map(([name]) => name).sort();
  const stuck = stepsBy((name) => closeoutOf(name)?.outcome === 'blocked');
  const failed = stepsBy((name) =>
    closeoutOf(name)?.outcome !== 'blocked' && ['failed', 'stopped'].includes(phaseOf(run.steps[name]!.taskId!)));
  return {
    kind: 'awaiting',
    outcome: failed.length ? 'failed' : stuck.length ? 'blocked' : 'succeeded',
    branches, failed, stuck,
  };
}

/**
 * What a step is told. THE decision about what one step knows of another.
 *
 * It gets: its own prose, the original request, and where to look. It does NOT get the previous
 * step's transcript, reasoning or self-assessment.
 *
 * The reason is the one a pull request already demonstrates: a PR description is not the author's
 * transcript, it is an artifact the author deliberately produced, and the reviewer judges the diff
 * rather than the author's account of it. Passing the implementer's reasoning to the reviewer
 * would anchor it on the same context that produced the work — the failure we already avoid when
 * deciding whether to resume a failed session — and would offer unverifiable claims alongside
 * verifiable evidence.
 *
 * So: intent and artifacts travel, process does not. If a step wants to say something to the next
 * one, it writes a file, deliberately, like a person would.
 */
export function composeBrief(step: Workflow, run: Run, steps: readonly Workflow[]): string {
  // A step that CONTINUES another already has the context — its own. Repeating the spec back and
  // pointing it at the workspace would be telling someone what they spent an hour doing.
  if (step.resume) return step.body + closeoutContract(step.name);

  const earlier = step.after.length
    ? step.after
    : steps.filter((s) => s.name !== step.name && run.steps[s.name]?.taskId).map((s) => s.name);

  const parts = [step.body, '', '## What was asked for', '', run.brief];

  if (step.after.length > 1) {
    return [
      step.body, '', '## What was asked for', '', run.brief, '',
      '## What is in this workspace', '',
      `The work of ${step.after.join(' and ')} has been merged into this branch.`,
      'If the merge left conflicts, they are yours to resolve — that is what a step waiting on',
      'several others is for. `git status` shows them.',
      closeoutContract(step.name),
    ].join('\n');
  }

  if (earlier.length) {
    parts.push(
      '',
      '## Where to look',
      '',
      `This workspace has already been worked in by: ${earlier.join(', ')}.`,
      `Their work is on disk, and against \`${run.baseRef}\` you can see exactly what changed:`,
      '',
      '```',
      `git diff ${run.baseRef}`,
      `git status`,
      '```',
      '',
      'Judge what is there. You have not been given their reasoning, on purpose — read the change,',
      'not an account of it.',
    );
  }

  parts.push(closeoutContract(step.name));
  return parts.join('\n');
}

// ─── where a step works ─────────────────────────────────────────────────────

/**
 * Which workspace a step needs. Pure — it reads the shape of the workflow, nothing else.
 *
 * The rule is git's, not ours:
 *
 *   - **inherit** — a step that is the only thing following its only predecessor is the same line
 *     of work continuing. Same directory, same branch, no git operation. This is the sequential
 *     case, and it is why `resume:` still makes sense: the author comes back to their own desk.
 *   - **fork** — a step that runs beside a sibling gets its own worktree, branched from wherever
 *     it starts. Two agents editing one directory at once is the arrangement we are avoiding, and
 *     for an agent a worktree costs nothing, so there is no reason to share one.
 *   - **merge** — a step that waits on SEVERAL steps is a fan-in, so it gets a worktree with all
 *     of their work combined. `after: a, b` already means "wait for both"; it now also means
 *     "and give me both". Nobody has to learn a new key for the thing they already asked for.
 *
 * Conflicts are not an error here. A merge that conflicts leaves the markers in place and the
 * step is told about it, because resolving them is exactly the work a fan-in step exists to do.
 */
export type WorkspacePlan =
  | { kind: 'inherit'; from: string }
  | { kind: 'fork'; from: string | null }
  | { kind: 'merge'; from: string; also: string[] };

export function workspacePlan(steps: readonly Workflow[], step: Workflow): WorkspacePlan {
  if (step.after.length === 0) return { kind: 'fork', from: null };
  if (step.after.length > 1) {
    const [first, ...also] = [...step.after].sort();
    return { kind: 'merge', from: first!, also };
  }

  const parent = step.after[0]!;
  const siblings = steps.filter((s) => s.after.includes(parent));
  return siblings.length === 1
    ? { kind: 'inherit', from: parent }
    : { kind: 'fork', from: parent };
}
