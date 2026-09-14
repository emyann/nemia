import fs from 'node:fs';
import { Hono } from 'hono';
import { streamSSE, type SSEStreamingApi } from 'hono/streaming';
import { checkStderr, closeoutAsked, closeoutOf, closeoutReader, engine, exitVerdicts, listRuns, phaseOfView, readAsks, verdictWord } from 'agent-workflows';
import { assess, composeBrief, inFlight, listing, type Assessment, type Run } from 'agent-workflows/run';
import { loadWorkflows, type Workflow } from 'agent-workflows/workflow';
import { capabilitiesOf, repoOf } from './capabilities.ts';

/** Where a run stands, as `assess` decides it: `running` until every step is final one way or the other. */
export type RunStatus = Assessment['status'];

/** A run as the web app lists it: what was asked, where, and what each step is doing. */
export type RunSummary = {
  id: string;
  repo: string;
  brief: string;
  createdAt: string;
  cancelledAt: string | null;
  status: RunStatus;
  /**
   * Whether anything of the run still moves: a task the engine holds for it — a step's or a check's, filed
   * and not settled — or a step, a check, a try or a round a tick would still file. `status` does not say: `assess` reads a
   * fan-out as failed once one step is final without letting its followers run, while a sibling still works.
   */
  moving: boolean;
  /**
   * `status` is what `wf ls` prints for the step — see `judge` for the one word it corrects. `note` is what `wf ls` prints
   * beside it, for a step tried again or about to be, or in a loop past its first round — `try 2, by retries: 1`,
   * `round 2 of 3`, `round 3 asked (wf round) — …` — and null where it prints nothing.
   */
  steps: Array<{ name: string; taskId: string | null; branch: string | null; status: string; note: string | null }>;
  /** Steps a person has to act on — blocked, unsigned, refused by their check, or a loop out of rounds — on a run nobody has called off. */
  waitingOnYou: string[];
};

/** A step's frontmatter. `null` where the workflow file does not set it. */
export type StepSpec = {
  harness: string | null;
  model: string | null;
  after: string[];
  resume: string | null;
  permissionMode: string | null;
  deadlineSeconds: number | null;
  maxAttempts: number | null;
};

/** How a step signed off, when it did. */
export type StepCloseout = {
  outcome: 'done' | 'blocked';
  summary: string;
  needs: string | null;
  artifacts: string[];
};

/**
 * The command a step is judged by, and what it said once it refused.
 *
 * `command` is from the workflow the run froze at `wf start`: the one the run executes. `refused` is set
 * once the check settled failed or stopped: `exit` in `wf ls`'s words (`exit 1`, `unfinished`), then the
 * end of each of its streams, as `wf decide` shows them.
 */
export type StepCheck = {
  command: string;
  refused: {
    exit: string;
    stdout: StepLog;
    stderr: StepLog;
    /** Why its output could not be read, when it could not. */
    unreadable: string | null;
  } | null;
};

/** One run in full, for a person reading it: the spec, and per step what it was told and how it went. */
export type RunDetail = {
  id: string;
  brief: string;
  repo: string;
  workflowDir: string;
  baseRef: string;
  branch: string;
  isolate: boolean;
  createdAt: string;
  cancelledAt: string | null;
  status: RunStatus;
  /** As on `RunSummary`. */
  moving: boolean;
  waitingOnYou: string[];
  /** Set when the workflow folder cannot be read, or no longer has the steps the run started with. */
  warning: string | null;
  /** The recorded steps in the order the run started with them, then any the folder has gained. */
  steps: Array<{
    name: string;
    spec: StepSpec | null;
    body: string | null;
    /** For a filed step, the brief the engine was filed with; for one not yet filed, what it would be given now. */
    told: string | null;
    taskId: string | null;
    workspace: string | null;
    branch: string | null;
    status: string;
    /** As on `RunSummary`. */
    note: string | null;
    closeout: StepCloseout | null;
    /** Null for a step with no `check:` in the workflow the run froze. */
    check: StepCheck | null;
    attempts: StepAttempts;
  }>;
};

/** A step's attempts as the engine's view has them: how many, and when and how the latest went. */
export type StepAttempts = {
  count: number;
  latest: {
    startedAt: string;
    /** The harness's last word on the attempt — `done`, `failed`, `stopped`; null while it runs. */
    ended: string | null;
    /** When it ended: the `at` of the engine's `ended` event, kept as `Attempt.endedAt`; null while it runs. */
    endedAt: string | null;
    /** `harness` when the harness said it ended, `lost` when the engine stopped seeing it; null while it runs. */
    reason: string | null;
  } | null;
};

/** The tail of a step's session output, oldest line first. */
export type StepLog = {
  lines: string[];
  /**
   * Whether the api cut lines off the top. A harness can hand over less than all of its output
   * already — the detached runner keeps only its last few thousand characters — and that cut is
   * not visible here, so its first line may start mid-line.
   */
  truncated: boolean;
};

/**
 * One engine for the process, and the api only reads through it — `list`, `view` and `logs`, never
 * `tick` or `file`.
 * Filing and advancing work is `wf`'s job, so a board left open in a tab cannot start anything.
 */
const e = engine();

type TaskView = Awaited<ReturnType<typeof e.view>>;
type Views = ReadonlyMap<string, TaskView>;

/**
 * The engine's view of every task a run has filed — each step's, and each check's — for one run's page.
 * Each `view` observes every harness — a `claude agents` call, a scan of detached runs — so this is an
 * observation per filed task, and a request reads each task once. The list of every run reads them with
 * `everyView`.
 */
async function viewsOf(run: Run): Promise<Views> {
  const views = new Map<string, TaskView>();
  for (const { taskId, check } of Object.values(run.steps)) {
    if (taskId) views.set(taskId, await e.view(taskId));
    if (check) views.set(check.taskId, await e.view(check.taskId));
  }
  return views;
}

/**
 * The engine's view of every task in its store, over one observation, by task id.
 *
 * `list` observes the harnesses once and folds every task's journal against that; `view` observes
 * afresh on each call. A task the engine has no record of is simply absent, which reads exactly as
 * `view`'s empty state does: no brief, so `unknown`.
 */
async function everyView(): Promise<Views> {
  return new Map((await e.list()).map((view) => [view.id, view]));
}

/**
 * The run's workflow folder, read now.
 *
 * The run record is the truth about what ran; the folder is only where the prose came from, and it
 * can be edited or deleted after `wf start`. So a folder that no longer reads is a warning on the
 * run, not a failure of the request.
 */
function workflowsOf(run: Run): { steps: Workflow[]; warning: null } | { steps: null; warning: string } {
  try {
    return { steps: loadWorkflows(run.workflowDir), warning: null };
  } catch (err) {
    const why = fs.existsSync(run.workflowDir)
      ? `The workflow folder ${run.workflowDir} no longer reads as a workflow: ${(err as Error).message}.`
      : `The workflow folder ${run.workflowDir} is gone.`;
    return {
      steps: null,
      warning: `${why} The steps are listed from the run record, without their spec or prose.`,
    };
  }
}

/**
 * Which steps a run has, in the order to show them.
 *
 * Every step on the record, in the record's order — the workflow's order when the run started —
 * because the record is the truth about what ran, whatever the folder says now; `wf decide` reads
 * the record too. Then any step the folder has and the record does not: `wf start` records every
 * step it finds, so those were added since. The tick files them only on a record from before runs
 * froze their workflow, which it reads from the folder; on a run that froze one they stay `waiting`.
 */
function stepNames(run: Run, workflows: readonly Workflow[] | null): string[] {
  const added = (workflows ?? []).map((s) => s.name).filter((name) => !Object.hasOwn(run.steps, name));
  return [...Object.keys(run.steps), ...added];
}

/** How the folder has moved away from the steps the run started with, or null if it has not. */
function driftOf(run: Run, workflows: readonly Workflow[]): string | null {
  const inFolder = new Set(workflows.map((s) => s.name));
  const removed = Object.keys(run.steps).filter((name) => !inFolder.has(name));
  const added = workflows.map((s) => s.name).filter((name) => !Object.hasOwn(run.steps, name));
  const said = [
    ...(removed.length ? [`it no longer has ${removed.join(', ')}, shown from the run record without spec or prose`] : []),
    ...(added.length ? [`it has ${added.join(', ')}, which the run did not start with`] : []),
  ];
  return said.length ? `The workflow folder ${run.workflowDir} has changed since this run started: ${said.join('; ')}.` : null;
}

/**
 * The steps a run is judged by: the workflow it froze at `wf start`, which the tick reads (`stepsOf` in
 * runner.ts), and for a record from before runs froze one, the folder. A record whose folder no longer
 * reads is judged from the record alone, a `bare` step each.
 */
const judgedSteps = (run: Run, folder: readonly Workflow[] | null): readonly Workflow[] =>
  run.workflow ?? folder ?? Object.keys(run.steps).map(bare);

/** A step nothing defines any more. All the record says of it is its name: no `after`, `check:` or `output:`. */
const bare = (name: string): Workflow => ({ name, after: [], body: '' });

/**
 * The engine's own word for a task — `running (working)`, `needs-human`, `succeeded` — as `wf ls` shows it: `list`'s,
 * which the package does not export. `unknown` where `phaseOfView` says so, for a task the engine has no record of: the
 * engine folds it to the state of one filed and waiting for a slot, and calls it `pending`, which is in flight.
 */
const wordOf = (views: Views) => (taskId: string): string => {
  const view = views.get(taskId);
  return view && phaseOfView(view) !== 'unknown' ? view.phase : 'unknown';
};

/** What the run established, over one read of its tasks: each step's word and note, who is waited on, where the run stands, and whether it still moves. */
type Judged = {
  words: ReadonlyMap<string, string>;
  notes: ReadonlyMap<string, string | null>;
  waitingOnYou: string[];
  status: RunStatus;
  moving: boolean;
};

/**
 * What `wf ls` says about each step, what `assess` says about the run, and whether the run still moves.
 *
 * The words are `listing`'s — `verified ✓`, `checking`, `unverified · done`, `failed ✗ check (exit 1)`,
 * `unsigned`, `succeeded · BLOCKED`, `rounds exhausted`, the engine's own word while a step runs, and `unknown` for a task it
 * has no record of — and so are the notes beside them. A step and a check are read as the tick reads them, off the package's
 * own `phaseOfView`, `closeoutAsked` and `exitVerdicts`.
 *
 * Given what people asked for with `wf retry` and `wf round`, read once, as the tick reads them (`readAsks`): without them a
 * step a person asked to try again, or a loop out of rounds a person sent round once more, reads as waiting on them, and the
 * run as not moving, for as long as the tick takes to file what they asked for. A step the page shows and the tick does not judge — one the folder gained after the run froze
 * its workflow, or one a pre-freeze record has and its folder lost — is worded as a `bare` step, and has no
 * say in the run's status. Everything is read off the views the request already has: calling `list` would
 * read every task again, and word only the steps the tick judges. The api test holds these words to `list`'s.
 */
function judge(run: Run, names: readonly string[], folder: readonly Workflow[] | null, views: Views): Judged {
  const steps = judgedSteps(run, folder);
  const shown = [...steps, ...names.filter((name) => !steps.some((s) => s.name === name)).map(bare)];
  const asked = closeoutAsked(views);
  // Off the engine's record of each check, not the log `wf ls` reads (`readVerdict`): the check prints the code it exits with,
  // so the two agree, and a `logs` call per refused check would observe every harness again, on every poll of the list.
  const verdicts = exitVerdicts(views, run);
  // Unreadable ask files are `notes` the tick prints and does not honour; neither does the board.
  const { asks, rounds } = readAsks(run.id);
  const said = listing(shown, run, wordOf(views), (name) => closeoutOf(views, run, name), asked, verdicts, asks, rounds);
  const phase = (taskId: string) => phaseOfView(views.get(taskId));
  // Given the verdict, as the tick is: without it `assess` cannot tell a check that refused, which `retries:` tries
  // again, from one that did not finish, which waits on a person — and the status and `listing`'s words would disagree.
  const { status, ready, check, retry, round } = assess(steps, run, phase, closeoutReader(views, run), asked, verdicts, asks, rounds);
  // A record the tick cannot read — from before runs froze their workflow, its folder gone — has nothing filed
  // for it, whatever its bare steps would make ready: the tick fails on it.
  const tickReads = Boolean(run.workflow ?? folder);
  return {
    words: new Map(said.steps.map((s) => [s.name, s.status])),
    notes: new Map(said.steps.map((s) => [s.name, s.note ?? null])),
    waitingOnYou: names.filter((name) => said.waitingOnYou.includes(name)),
    status,
    // The line `cancelPlan` draws for a finished run, which `status` does not: nothing in flight, and nothing a
    // tick would still file. A cancelled run files nothing (`assess` makes nothing ready), and moves until its stop lands.
    // A round due is filed as a try is: a loop's looping step settled, and nothing of it in flight until the tick files the round.
    moving: inFlight(run, phase).length > 0 || (tickReads && (ready.length > 0 || check.length > 0 || retry.length > 0 || round.length > 0)),
  };
}

/**
 * What a step was told.
 *
 * For a filed step, the brief the engine holds: it is what the step was given. Recomposing it now
 * would not be — `composeBrief` points a step with no `after` at every step filed so far, so a
 * finished first step would read as told to look at work done after it, and an edited folder would
 * rewrite it. For a step not yet filed, what `composeBrief` would give it now. For a filed task the
 * engine has no record of, nobody can say.
 */
function toldOf(run: Run, name: string, workflows: readonly Workflow[] | null, views: Views): string | null {
  const taskId = run.steps[name]?.taskId;
  if (taskId) return views.get(taskId)?.state.brief || null;
  const step = workflows?.find((s) => s.name === name);
  return step && workflows ? composeBrief(step, run, workflows) : null;
}

function summarize(run: Run, views: Views): RunSummary {
  const folder = workflowsOf(run).steps;
  const names = stepNames(run, folder);
  const judged = judge(run, names, folder, views);
  return {
    id: run.id,
    repo: run.repo,
    brief: run.brief,
    createdAt: run.createdAt,
    cancelledAt: run.cancelledAt ?? null,
    status: judged.status,
    moving: judged.moving,
    steps: names.map((name) => ({
      name,
      taskId: run.steps[name]?.taskId ?? null,
      branch: run.steps[name]?.branch ?? null,
      status: judged.words.get(name)!,
      note: judged.notes.get(name) ?? null,
    })),
    waitingOnYou: judged.waitingOnYou,
  };
}

const specOf = (step: Workflow): StepSpec => ({
  harness: step.harness ?? null,
  model: step.model ?? null,
  after: step.after,
  resume: step.resume ?? null,
  permissionMode: step.permissionMode ?? null,
  deadlineSeconds: step.deadlineSeconds ?? null,
  maxAttempts: step.maxAttempts ?? null,
});

async function detail(run: Run): Promise<RunDetail> {
  const folder = workflowsOf(run);
  const workflows = folder.steps;
  const names = stepNames(run, workflows);
  const views = await viewsOf(run);
  const judged = judge(run, names, workflows, views);
  const checks = await checksOf(run, judgedSteps(run, workflows), views);
  return {
    id: run.id,
    brief: run.brief,
    repo: run.repo,
    workflowDir: run.workflowDir,
    baseRef: run.baseRef,
    branch: run.branch,
    isolate: run.isolate,
    createdAt: run.createdAt,
    cancelledAt: run.cancelledAt ?? null,
    status: judged.status,
    moving: judged.moving,
    waitingOnYou: judged.waitingOnYou,
    warning: folder.steps ? driftOf(run, folder.steps) : folder.warning,
    steps: names.map((name) => {
      const step = workflows?.find((s) => s.name === name);
      const c = closeoutOf(views, run, name);
      return {
        name,
        spec: step ? specOf(step) : null,
        body: step?.body ?? null,
        told: toldOf(run, name, workflows, views),
        taskId: run.steps[name]?.taskId ?? null,
        workspace: run.steps[name]?.workspace ?? null,
        branch: run.steps[name]?.branch ?? null,
        status: judged.words.get(name)!,
        note: judged.notes.get(name) ?? null,
        // An unreadable closeout is already in `status`; there is nothing here to show of it.
        closeout: c && !('error' in c)
          ? { outcome: c.outcome, summary: c.summary, needs: c.needs ?? null, artifacts: c.artifacts }
          : null,
        check: checks.get(name) ?? null,
        attempts: attemptsOf(run, name, views),
      };
    }),
  };
}

/** Off the engine's view of the step's task. A step with no task, or one the engine has lost, has had none. */
function attemptsOf(run: Run, name: string, views: Views): StepAttempts {
  const taskId = run.steps[name]?.taskId;
  const attempts = (taskId && views.get(taskId)?.state.attempts) || [];
  const latest = attempts.at(-1);
  return {
    count: attempts.length,
    latest: latest ? { startedAt: latest.startedAt, ended: latest.ended, endedAt: latest.endedAt ?? null, reason: latest.reason } : null,
  };
}

/** How much of a step's output the board is given: the end of it, which is where a running step is. */
const LOG_LINES = 200;

/** The last `max` lines of a session's output, and whether there were more. */
function tailOf(output: string, max: number): StepLog {
  const lines = output.split(/\r?\n/);
  // Output that ends in a newline has not begun another line.
  if (lines.at(-1) === '') lines.pop();
  return lines.length > max ? { lines: lines.slice(-max), truncated: true } : { lines, truncated: false };
}

/** How many lines of each stream a refused check shows: as many as `wf decide` does (`CHECK_TAIL_LINES`). */
const CHECK_LINES = 20;

/**
 * Each judged step's check: its command, and for a check that refused, what it said — what `checkReports`
 * in runner.ts reads for `wf ls` and `wf decide`, which the package does not export. A `logs` call per
 * refused check, which observes every harness again: on one run's page, and never on the list.
 */
async function checksOf(run: Run, steps: readonly Workflow[], views: Views): Promise<Map<string, StepCheck>> {
  const checks = new Map<string, StepCheck>();
  for (const step of steps) {
    if (!step.check) continue;
    const taskId = run.steps[step.name]?.check?.taskId;
    const settled = taskId ? views.get(taskId)?.state.settled : null;
    if (!taskId || (settled !== 'failed' && settled !== 'stopped')) {
      checks.set(step.name, { command: step.check, refused: null });
      continue;
    }
    let stdout: StepLog = { lines: [], truncated: false };
    let unreadable: string | null = null;
    try {
      stdout = tailOf(await e.logs(taskId), CHECK_LINES);
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      unreadable = `Could not read the output of its check (task ${taskId}): ${why}. \`wf decide ${run.id}\` reads it the same way from the command line.`;
    }
    checks.set(step.name, {
      command: step.check,
      // A check is filed for the step, so the engine's record has a verdict for it: an exit code, or `unfinished`.
      refused: { exit: verdictWord(exitVerdicts(views, run)(step.name)!), stdout, stderr: tailOf(endOf(checkStderr(taskId)), CHECK_LINES), unreadable },
    });
  }
  return checks;
}

/** The end of a file that may be large, or absent: a check stopped before it started wrote no stderr. */
function endOf(file: string, bytes = 64_000): string {
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const size = fs.fstatSync(fd).size;
      const buf = Buffer.alloc(Math.min(size, bytes));
      fs.readSync(fd, buf, 0, buf.length, size - buf.length);
      return buf.toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return '';
  }
}

/** Found among the runs the store has, not read by path, so no id can name a file outside it. */
const findRun = (id: string): Run | undefined => listRuns().find((r) => r.id === id);

const noSuchRun = (id: string) =>
  `No run '${id}' in this store. GET /api/runs (or \`wf ls\`) lists the runs it has; check WF_ROOT if you expected it here.`;

/**
 * The task a step's routes read — null for a step not filed yet — or why there is no such step to read: no run by that id,
 * or no step by that name on the run's page.
 */
function taskOfStep(id: string, step: string): { taskId: string | null } | { error: string } {
  const run = findRun(id);
  if (!run) return { error: noSuchRun(id) };
  // The steps the run's page shows: those on the record, and any the folder has gained since.
  if (!stepNames(run, workflowsOf(run).steps).includes(step)) {
    return { error: `Run '${id}' has no step '${step}'. GET /api/runs/${id} lists the steps it has.` };
  }
  return { taskId: run.steps[step]?.taskId ?? null };
}

/** One of the engine's events in a session's conversation, as `transcript` gives it (`TranscriptEvent` in agent-engine). */
export type TranscriptEvent = Awaited<ReturnType<typeof e.transcript>>['events'][number];

/** A read of a step's conversation: the engine's events from the cursor asked with, where to ask again, and whether more may come. */
export type StepTranscript = {
  events: TranscriptEvent[];
  /** The engine's cursor, to pass as `after` on the next read. Null for a step with no task to read. */
  cursor: string | null;
  /** Whether the step's task is not settled yet. */
  live: boolean;
};

type Read = StepTranscript & { cursor: string };

/** Why a step's conversation was not read, with the status that says whose it is to fix. */
class Unread extends Error {
  readonly status: 400 | 404 | 502;
  constructor(status: 400 | 404 | 502, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * One read of a step's conversation from `after`: the events and cursor as the engine's `transcript` gives them, and whether
 * the task is live.
 *
 * Live is read first. A task that settles between the two reads reads as live once more, and its last lines are read on the
 * next pass; read the other way round, it could read as settled before them. A read costs an observation of every harness
 * (`view`, a `claude agents` call among them, ~0.2 s here) and, while the attempt runs, one of the task's own harness
 * (`transcript` finds the session through it); once the attempt has ended, `transcript` reads by the session's id on the record.
 */
async function readTranscript(id: string, step: string, taskId: string, after: string | undefined): Promise<Read> {
  let view: TaskView;
  try {
    view = await e.view(taskId);
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    throw new Unread(502, `Could not read task ${taskId} of step '${step}': ${why}. \`wf ls\` reads the same record from the command line.`);
  }
  if (phaseOfView(view) === 'unknown') {
    throw new Unread(404, `Step '${step}' of run '${id}' was filed as task ${taskId}, and the engine has no record of it: there is no conversation to read. \`wf ls\` shows the step unknown.`);
  }
  try {
    const { events, cursor } = await e.transcript(taskId, after);
    return { events, cursor, live: view.state.settled === null };
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    if ((err as { exitCode?: unknown }).exitCode !== 2) {
      throw new Unread(502, `Could not read the conversation of step '${step}' (task ${taskId}): ${why}. \`wf logs ${id} ${step}\` reads its output from the command line.`);
    }
    // Refused. The engine refuses a cursor none of its reads gave, and a harness that keeps no conversation it can read — and
    // asked again from the start, only the second. The words of the refusal are the engine's to change; this is not.
    if (after !== undefined && (await e.transcript(taskId).then(() => true, () => false))) {
      throw new Unread(400, `\`${after}\` is not a cursor a read of this conversation gave. Pass the \`cursor\` the last read returned as \`after\` — on the stream, the id of the last event, which an EventSource sends back as Last-Event-ID — or none to read from the start.`);
    }
    throw new Unread(404, `Step '${step}' of run '${id}' has no conversation to read: ${why} GET /api/runs/${id}/steps/${step}/log gives what its session printed.`);
  }
}

/** How often the stream reads a live step's conversation again: once a second, as the plan asks (§4 S). */
const STREAM_EVERY_MS = 1_000;

/**
 * A read's events on the stream, an SSE `transcript` event each, with the read's cursor as the id of the last.
 *
 * Of the last only: a reader cut off partway through a read keeps the previous read's cursor as its Last-Event-ID, so it
 * reconnects from before the events it did not get and is sent the read again, rather than past them. Sent twice, an event
 * is still one event to a reader: it is unique by its `id` and `kind`.
 */
async function send(stream: SSEStreamingApi, read: Read): Promise<void> {
  for (const [i, event] of read.events.entries()) {
    if (stream.aborted) return;
    const last = i === read.events.length - 1;
    await stream.writeSSE({ event: 'transcript', data: JSON.stringify(event), ...(last ? { id: read.cursor } : {}) });
  }
}

export const app = new Hono()
  .get('/api/health', (c) => c.json({ ok: true }))
  // What the repository offers a step, read from the checkout on each request (capabilities.ts). Each MCP server
  // the settings enable is started and asked for its tools once while the api runs; one that fails is an `error`
  // on its entry, never a failed request.
  .get('/api/capabilities', async (c) => c.json(await capabilitiesOf(repoOf())))
  .get('/api/runs', async (c) => {
    // What one request costs, however many runs there are: one harness observation (one
    // `claude agents --json`, one scan of the detached runs' files), a read of every task journal in
    // the engine's store, and each run's record and workflow folder. It was a `view` — so an
    // observation — per filed step of every run: dozens of `claude agents` calls a poll.
    //
    // The records before the engine: `wf` files a step's task before it writes the id on the run, so
    // every id read here is in the listing that follows. The other way round, a task filed between
    // the two reads would show as `unknown` until the next poll.
    const runs = listRuns();
    const views = await everyView();
    return c.json(runs.map((run) => summarize(run, views)));
  })
  .get('/api/runs/:id', async (c) => {
    const id = c.req.param('id');
    const run = findRun(id);
    if (!run) return c.json({ error: noSuchRun(id) }, 404);
    return c.json(await detail(run));
  })
  // A step's session output as text, for `wf logs` parity. The board reads the conversation from the transcript routes below.
  .get('/api/runs/:id/steps/:step/log', async (c) => {
    const id = c.req.param('id');
    const step = c.req.param('step');
    const found = taskOfStep(id, step);
    if ('error' in found) return c.json({ error: found.error }, 404);
    const { taskId } = found;
    if (!taskId) return c.json({ lines: [], truncated: false } satisfies StepLog);
    try {
      return c.json(tailOf(await e.logs(taskId), LOG_LINES));
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      return c.json({
        error: `Could not read the output of step '${step}' (task ${taskId}): ${why}. \`wf logs ${id} ${step}\` reads it the same way from the command line, with the error in full.`,
      }, 502);
    }
  })
  // A step's conversation, read once from a cursor: the engine's events for the step's current task, and whether it is live.
  .get('/api/runs/:id/steps/:step/transcript', async (c) => {
    const id = c.req.param('id');
    const step = c.req.param('step');
    const found = taskOfStep(id, step);
    if ('error' in found) return c.json({ error: found.error }, 404);
    // Not filed yet: nothing to read, and nothing of it moves until a tick files it.
    if (!found.taskId) return c.json({ events: [], cursor: null, live: false } satisfies StepTranscript);
    try {
      // An empty `after` is none: a reader with no cursor yet, read from the start.
      return c.json((await readTranscript(id, step, found.taskId, c.req.query('after') || undefined)) satisfies StepTranscript);
    } catch (err) {
      if (err instanceof Unread) return c.json({ error: err.message }, err.status);
      throw err;
    }
  })
  // The same conversation followed, as server-sent events: read again every second while the task is live, each new event sent
  // as `transcript`, then `settled` once the task is, and the stream closed. A reconnect resumes from its Last-Event-ID.
  .get('/api/runs/:id/steps/:step/transcript/stream', async (c) => {
    const id = c.req.param('id');
    const step = c.req.param('step');
    const found = taskOfStep(id, step);
    if ('error' in found) return c.json({ error: found.error }, 404);
    const { taskId } = found;
    if (!taskId) {
      return c.json({ error: `Step '${step}' of run '${id}' is not filed yet, so it has no session to follow. GET /api/runs/${id} gives its task once a tick files it.` }, 404);
    }
    // An EventSource that reconnects sends the id of the last event it was sent; a first connection can say where to start.
    const after = c.req.header('Last-Event-ID') || c.req.query('after') || undefined;
    let read: Read;
    try {
      // Read before the stream opens, so a refused cursor or a lost task is an answer with a status, not an event.
      read = await readTranscript(id, step, taskId, after);
    } catch (err) {
      if (err instanceof Unread) return c.json({ error: err.message }, err.status);
      throw err;
    }
    return streamSSE(c, async (stream) => {
      await send(stream, read);
      // Whether the last read failed. A failure is said once, and cleared with `readable` by the first read that works.
      let failing = false;
      while (read.live) {
        await stream.sleep(STREAM_EVERY_MS);
        // Nobody is reading: stop asking the engine. Each read observes the harnesses.
        if (stream.aborted) return;
        try {
          read = await readTranscript(id, step, taskId, read.cursor);
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          // An answer about the conversation — its task gone from the engine's record — ends the stream: no read will change it.
          if (err instanceof Unread && err.status !== 502) {
            await stream.writeSSE({ event: 'unreadable', data: JSON.stringify({ error, retrying: false }) });
            return;
          }
          // Anything else is this read, not the conversation: a journal or a transcript that could not be opened this second
          // most likely can be the next. Read again on the next beat, from the same cursor, as a tick would.
          if (!failing) await stream.writeSSE({ event: 'unreadable', data: JSON.stringify({ error, retrying: true }) });
          failing = true;
          continue;
        }
        if (failing) await stream.writeSSE({ event: 'readable', data: '{}' });
        failing = false;
        await send(stream, read);
      }
      if (!stream.aborted) await stream.writeSSE({ event: 'settled', data: JSON.stringify({ cursor: read.cursor }), id: read.cursor });
    });
  });
