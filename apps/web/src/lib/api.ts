import { keepPreviousData, queryOptions } from '@tanstack/react-query';

/** Mirrors `RunStatus` in apps/api/src/app.ts: where `assess` puts the run. */
export type RunStatus = 'running' | 'succeeded' | 'failed' | 'cancelled';

/** Mirrors `RunSummary` in apps/api/src/app.ts. */
export type RunSummary = {
  id: string;
  repo: string;
  brief: string;
  /** The workflow folder the run was started from: its last segment names the workflow (`workflowNameOf`). */
  workflowDir: string;
  createdAt: string;
  cancelledAt: string | null;
  /** The runs this one waits on (`wf start --after`), as its record froze them: the edges from their cards to its card on the Factory. */
  after: string[];
  /** The runs its roots still wait on, in the package's words (`RunWaiting`); null once there are none, or the run has started. */
  waiting: RunWaiting | null;
  status: RunStatus;
  /**
   * Whether anything of the run still moves: a task the engine holds for it, or a step or check a tick would still file — the roots of a
   * run waiting on runs that may still ship among them, and not those of one waiting on a run that never ships without a person.
   */
  moving: boolean;
  /** What the run has cost so far, every step's tries together, as `wf ls` adds it up (`Spent`); null until a cost was measured. */
  cost: Spent | null;
  /**
   * `note` is what `wf ls` prints beside the status — the try or round a step is on, or the one due — and null where it prints nothing.
   * `needs` and `blockedByHarness` are what a person has to know to act on it (`StepNeeds`).
   */
  steps: Array<{ name: string; taskId: string | null; branch: string | null; status: string; note: string | null } & StepNeeds>;
  /**
   * Steps a person has to act on — blocked, unsigned, refused by their check, awaiting approval at their gate, out of rounds or past their
   * budget. Empty on a cancelled run.
   */
  waitingOnYou: string[];
  /** `waitingOnYou` as `wf ls` names it after `→ waiting on you:`, one entry a step: its name, or for a step at its gate, `approve plan`. */
  onYou: string[];
  /** What a person has to decide about the run's result (`RunToDecide`); null while there is nothing — which is every run still going. */
  toDecide: RunToDecide | null;
};

/**
 * Mirrors `RunToDecide` in apps/api/src/app.ts: what a person has to decide about a run's result, the fifth reason a run waits on one —
 * `approve`, the gate on its last step, with `step` and `says`, what that step would do in the folder's own words (null for a gated step
 * that has signed off, whose closeout is what to read); or `git`, result branches ahead of the base that nothing in the workflow merges.
 *
 * `said` is the whole of what `wf ls` prints after `→ to decide:`, and `command` the command at the end of it. The board runs neither.
 */
export type RunToDecide =
  | { kind: 'approve'; step: string; says: string | null; said: string; command: string }
  | { kind: 'git'; branches: string[]; said: string; command: string };

/**
 * Mirrors `Spent` in apps/api/src/app.ts: what sessions cost, as the package adds it up — the dollars of the attempts that ended with a cost on
 * them, how many did and how many ended with none — and `said`, its word for it: `$4.20`, or `≥$4.20` where an ended attempt has no cost on it.
 */
export type Spent = { usd: number; measured: number; unmeasured: number; said: string };

/**
 * Mirrors `StepBudget` in apps/api/src/app.ts: a step's cap in force — the `budget:` the run froze, or what a person raised it to — as its
 * author writes one (`said`, `$3`), what its tries have cost of it (`of`, `$4.25 of $3`, null until measured), and whether that is the cap or more.
 */
export type StepBudget = { usd: number; said: string; of: string | null; over: boolean };

/**
 * Mirrors `StepRaise` in apps/api/src/app.ts: a raise of a step's cap the package takes — with its try (`retry`) or with its loop's round
 * (`round`) — and what the budget has to be more than, as the package refuses less. For a try, the ways the package takes it (`modes`,
 * `recheck` among them where a check did not pass, needing no raise) and how the step ended on its own work, its budget aside (`own`, the
 * package's word: `blocked`, `unsigned`, `failed (check)` …), which its word — `over budget` — no longer says. For a round, none, and null.
 */
export type StepRaise = { by: 'retry' | 'round'; above: number; said: string; modes: RetryMode[]; own: string | null };

/**
 * Mirrors `RunWaiting` in apps/api/src/app.ts: what a run started `--after` still waits on, in the package's words. `runs` are each run
 * not shipped, and why one never will without a person (`missing`, `cancelledAt`, `gone`); `word` is what `wf ls` prints on its roots —
 * `waiting on a-1x2y (cancelled)` — and `advice` the line `wf decide` prints under it; `onYou` whether a person has to act.
 */
export type RunWaiting = {
  runs: Array<{ run: string; missing: boolean; cancelledAt: string | null; gone: string[] }>;
  word: string;
  advice: string;
  onYou: boolean;
};

/**
 * Mirrors `StepNeeds` in apps/api/src/app.ts. `needs`: the closeout's, for a step whose current try signed off blocked. `blockedByHarness`:
 * whether the harness marked its session blocked while it gave no closeout — the engine's `needs-human`. What that session said last is
 * on a run's detail alone (`lastLine`): the list reads no conversation. `approve`: what `wf ls` asks of you for a step waiting at its gate,
 * `approve plan`; null for any other step, and for one already sent back.
 */
export type StepNeeds = { needs: string | null; blockedByHarness: boolean; approve: string | null };

/** Mirrors `StepApproval` in apps/api/src/app.ts: a person's approval of the try a gated step is on — when, and the words given with it. */
export type StepApproval = { try: number; at: string; message: string | null };

/**
 * Mirrors `StepGate` in apps/api/src/app.ts: a gated step's gate. `awaiting` while it waits at it — `wf ls`'s `awaiting approval` — and
 * `approval` once a person approved the try it is on. Neither, for a gated step not signed off yet.
 */
export type StepGate = { awaiting: boolean; approval: StepApproval | null };

/**
 * Mirrors `StepAsked` in apps/api/src/app.ts: a try a person asked for, which the next tick files — once it has stopped the step's session
 * where `stopFirst`, because the harness blocked it.
 */
export type StepAsked = { try: number; mode: RetryMode; model: string | null; message: string | null; stopFirst: boolean };

/** Mirrors `Said` in agent-workflows, the engine's `said` entry: words a person said to a step's running session, when, and to which attempt of its task. */
export type Said = { at: string; attempt: number; text: string };

/** How `wf retry` tries a step again: continue its session, a new one, or its check run again and no session. */
export type RetryMode = 'nudge' | 'fresh' | 'recheck';

/** Mirrors `StepSpec` in apps/api/src/app.ts. */
export type StepSpec = {
  harness: string | null;
  model: string | null;
  effort: string | null;
  /** The session's context window, in tokens (`context:`): null for the model's whole window. */
  context: number | null;
  after: string[];
  /**
   * `main` for a step that runs in the repository's own checkout rather than a worktree of the run's: the step that ends the run, whose
   * gate holds before it is filed and whose approval is what files it (`endsTheRun`). Null for every other step.
   */
  workspace: string | null;
  resume: string | null;
  permissionMode: string | null;
  /** Null for the harness's own set, empty for none. */
  tools: string[] | null;
  deadlineSeconds: number | null;
  maxAttempts: number | null;
  /** The step a round runs again, for a looping step; and how many rounds its loop may run, the first included. */
  loop: string | null;
  rounds: number | null;
};

/** Mirrors `GraphEdge` in apps/api/src/graph.ts: `after`, `to` waits on `from`; `loop`, `from` runs `to` again. */
export type GraphEdge =
  | { from: string; to: string; kind: 'after' }
  | { from: string; to: string; kind: 'loop'; rounds: number };

/** Mirrors `RunGraph` in apps/api/src/graph.ts: the steps the run's card leads to, and every edge between steps. */
export type RunGraph = { roots: string[]; edges: GraphEdge[] };

/**
 * Mirrors `StepFiled` in apps/api/src/app.ts: what the engine filed a step's current try with. `maxAttempts` is always on the
 * record; any other field is null where the task was filed without it — no deadline, which is no limit, and the harness's own
 * model, effort and tools. `askedModel` is the model a person's `wf retry --model` asked this try for; `runsIn` the permission
 * mode the session runs in, as its harness decides it — the mode filed, its choice when none was (`auto` for Claude Code), or a
 * Codex sandbox narrowed by `tools` — and null where the api could not ask the harness.
 */
export type StepFiled = {
  model: string | null;
  askedModel: string | null;
  effort: string | null;
  /** The context window the try was filed with, in tokens: null for the model's whole window. */
  contextTokens: number | null;
  permissionMode: string | null;
  runsIn: { mode: string; by: 'filed' | 'default' | 'tools' } | null;
  tools: string[] | null;
  deadlineSeconds: number | null;
  maxAttempts: number;
};

/**
 * Mirrors `StepArtifact` in apps/api/src/artifacts.ts: a file a closeout named. One the api serves from the step's files
 * directory has its name, the `url` to read it by, its kind and size; anything else is the path alone.
 */
export type StepArtifact = { path: string } | { path: string; name: string; url: string; kind: 'image' | 'text' | 'other'; size: number };

/** Mirrors `StepReply` in apps/api/src/app.ts: a loop's target's answer to one finding. */
export type StepReply = { finding: string; answer: string; why: string };

/** Mirrors `StepCloseout` in apps/api/src/app.ts: with what it gave of its declared output, what it did not, and its `replies`. */
export type StepCloseout = {
  outcome: 'done' | 'blocked';
  summary: string;
  needs: string | null;
  artifacts: StepArtifact[];
  output: Record<string, unknown>;
  missing: string[];
  replies: StepReply[] | null;
};

/**
 * Mirrors `StepCheck` in apps/api/src/app.ts: the command a step is judged by, from the workflow the run
 * froze, its task and verdict — `passed`, `exit 1`, `unfinished`, `checking` — and once its check refused, the
 * exit in `wf ls`'s words and the end of each stream. `stdout` is null on an earlier try's check, whose output the api does not read.
 */
export type StepCheck = {
  command: string;
  taskId: string | null;
  verdict: string | null;
  refused: { exit: string; stdout: StepLog | null; stderr: StepLog; unreadable: string | null } | null;
};

/**
 * Mirrors `StepTry` in apps/api/src/app.ts: one try of a step, earliest first. `then` is what replaced it, null on the current
 * try, which `current` marks; `note` how it was reached, in `wf ls`'s words. `status` is the step's word on the current try, and
 * the engine's word for the task on an earlier one.
 */
export type StepTry = {
  try: number;
  round: number;
  then: 'retries' | 'nudge' | 'fresh' | 'recheck' | 'round' | null;
  current: boolean;
  taskId: string | null;
  note: string | null;
  status: string;
  attempts: StepAttempts;
  check: StepCheck | null;
  closeout: StepCloseout | null;
  /** What a person said to this try when they asked for it — `wf decide`'s `your answer` — or null. */
  answer: string | null;
};

/** Mirrors `RunDetail` in apps/api/src/app.ts. */
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
  /** As on `RunSummary`. */
  after: string[];
  /** The inbox card the run was started from, as its record carries it; absent for a run started without one. */
  from?: { inbox: string };
  /** Where it came from, in `wf decide`'s words (`fromNote` in agent-workflows): absent with `from`. */
  fromNote?: string;
  waiting: RunWaiting | null;
  status: RunStatus;
  moving: boolean;
  /** As on `RunSummary`. */
  cost: Spent | null;
  /** What every try of every step read, by price, beside `cost` (`RunRead`); null where none of it was measured. */
  read: RunRead | null;
  waitingOnYou: string[];
  /** As on `RunSummary`. */
  onYou: string[];
  /** As on `RunSummary` (`RunToDecide`). */
  toDecide: RunToDecide | null;
  /** The steps the run is gated at, in the order they run: those its workflow gates, and those it was started with. */
  gates: string[];
  warning: string | null;
  /** The steps as a graph, from the workflow the run froze: what the canvases draw, so none derives it from `after`. */
  graph: RunGraph;
  steps: Array<{
    name: string;
    spec: StepSpec | null;
    /** What the engine filed its current try with; null for a step not filed. */
    filed: StepFiled | null;
    body: string | null;
    told: string | null;
    taskId: string | null;
    workspace: string | null;
    branch: string | null;
    status: string;
    /** As on `RunSummary`. */
    note: string | null;
    needs: string | null;
    blockedByHarness: boolean;
    approve: string | null;
    /** Its gate, awaiting approval or approved (`StepGate`); null for a step with none. */
    gate: StepGate | null;
    /** For a step the harness blocked, what its session said last; null for any other, and for one that said nothing the api could read. */
    lastLine: string | null;
    /** What a person said to its current try's session while it ran (`wf say`, or the session page's prompt box), in the order said. */
    said: Said[];
    /** The try a person asked for that the next tick files; null when none is. */
    asked: StepAsked | null;
    closeout: StepCloseout | null;
    /** Null for a step with no `check:`. */
    check: StepCheck | null;
    attempts: StepAttempts;
    /** What its current try consumed, in `wf decide`'s words; null for a step not filed. */
    used: StepUsed | null;
    /** What all its tries have cost together, as `wf ls` puts it beside its word; null until a cost was measured. */
    spent: Spent | null;
    /** Its cap in force, and what its tries have cost of it; null for a step with no `budget:`. */
    budget: StepBudget | null;
    /** The raise of its cap the package takes, and how; null where none does, and on a run called off. */
    raise: StepRaise | null;
    /** Every try, earliest first, the current one last: `attempts` counts the current try's task alone. */
    tries: StepTry[];
    /** Where the step's time went, try by try and check by check; empty for a step not filed. */
    timeline: StepTimelineTry[];
  }>;
  /** The run's time together: each round of its loop, and the whole run — with what the sessions in each cost. */
  timeline: { rounds: TimelineTotal[]; run: TimelineTotal };
};

/**
 * Mirrors `TaskSpan` in agent-workflows' run.ts: one task of a try on the clock — its session, or its check. `filedAt` is off the engine's
 * feed, and null where the feed has none; `spawnedAt` its first attempt's spawn; `endedAt` its last attempt's end once it settled. `at` is
 * where it stands, and `queued` (filed → spawned, the wait for a slot) and `ran` (spawned → ended) the package's words for its two times.
 */
export type TaskSpan = {
  taskId: string;
  at: 'unknown' | 'queued' | 'starting' | 'running' | 'ended' | 'unspawned';
  filedAt: string | null;
  spawnedAt: string | null;
  endedAt: string | null;
  attempts: number;
  queuedMs: number | null;
  ranMs: number | null;
  queued: string;
  ran: string;
};

/**
 * Mirrors `StepTimelineTry` in apps/api/src/app.ts: one try of a step on the clock. `session` is null on a try a recheck reached, whose session
 * is try `sessionOf`'s; `check` null for a try whose check was never filed; `used` what its session consumed, in `wf decide`'s words.
 */
export type StepTimelineTry = { try: number; round: number; session: TaskSpan | null; sessionOf: number | null; check: TaskSpan | null; used: StepUsed | null };

/**
 * Mirrors `StepTimelineTotal` in apps/api/src/app.ts — `TimelineTotal` in agent-workflows' run.ts, with its cost: a round of a loop — `loop` its
 * looping step, counting the steps that round files again — or the run's, every step's (`loop` and `round` null); sums over its tasks, and its
 * wall, in words; and what the sessions in it cost, null where none was measured.
 */
export type TimelineTotal = {
  loop: string | null;
  round: number | null;
  tasks: number;
  inFlight: number;
  queuedMs: number;
  ranMs: number;
  wallMs: number | null;
  queued: string;
  ran: string;
  wall: string;
  cost: Spent | null;
};

/** Mirrors `Usage` in apps/api/src/app.ts: a count nobody measured is absent, never 0. */
export type Usage = {
  turns?: number; toolCalls?: number; inputTokens?: number; outputTokens?: number; costUsd?: number; apiMs?: number; toolMs?: number;
  cacheReadTokens?: number; cacheWriteTokens?: number; uncachedTokens?: number; peakContextTokens?: number; firstContextTokens?: number; firstCacheWriteTokens?: number; compactions?: number; rebuiltCaches?: number;
};

/** Where a peak context stands: at the step's `context:` cap, or past 200k on a step with none. */
export type PeakMark = 'cap' | 'large' | null;

/**
 * Mirrors `StepUsed` in apps/api/src/app.ts: the usage, and `wf decide`'s words for it — `used` and `cost`, `not measured` where nobody
 * counted — and the engine's cost, api time and tool time off it, each null where nobody measured it. `read` is what the sessions read, by
 * price, in `wf decide`'s words (`read 21.4M · wrote 412k · peak 167k`), null where nothing measured it; `peak` where its peak stands; and
 * `rebuilt` how many resumed sessions wrote their context to the cache again.
 */
export type StepUsed = {
  usage: Usage | null; used: string; cost: string; costUsd: number | null; apiMs: number | null; toolMs: number | null;
  read: string | null; peak: PeakMark; rebuilt: number;
};

/** Mirrors `RunRead` in apps/api/src/app.ts: what a run's sessions read, by price, in words, where its peak stands, and how many rebuilt their cache. */
export type RunRead = { said: string; peak: PeakMark; rebuilt: number };

/** Mirrors `Change` in agent-workflows' radius.ts: a file a branch changed. A binary file has null counts, never 0. */
export type Change = { path: string; from?: string; added: number | null; removed: number | null };

/** Mirrors `Group` in agent-workflows' radius.ts: a workspace package, a top-level directory, or `(root)`. */
export type Group = { name: string; files: number; added: number; removed: number; binary: number };

/** Mirrors `Radius` in agent-workflows' radius.ts: what a branch touched, and among it what an agent reads and what decides a check. */
export type Radius = { changes: Change[]; groups: Group[]; agentFacing: string[]; checkAffecting: string[]; lessons: Change[] };

/** Mirrors `Touched` in apps/api/src/app.ts: a branch, and its radius or why git could not read it. */
export type Touched = { branch: string; radius: Radius | { error: string } };

/** Mirrors `DiffFile` in apps/api/src/app.ts: one file's unified diff, cut to the api's cap, and how many lines were cut. */
export type DiffFile = { path: string; lines: string[]; cut: number };

/** Mirrors `SensitiveDiff` in apps/api/src/app.ts. */
export type SensitiveDiff = { branch: string; files: DiffFile[]; error: string | null };

/** Mirrors `Lesson` in apps/api/src/app.ts: `wf decide`'s lesson line without its label, and which of its three it is. */
export type Lesson = { said: string; state: 'written' | 'nothing' | 'unknown' };

/** Mirrors `DecideCommand` in apps/api/src/app.ts: a command `wf decide` prints and runs none of. */
export type DecideCommand = { label: 'ship it' | 'drop it' | 'read it' | 'once more' | 'approve' | 'send back'; command: string; said: string | null };

/**
 * Mirrors `Standing` in apps/api/src/app.ts: where one result branch stands against the base branch as git says it now — on it, ahead of it
 * by N commits, or gone — with the fact in the package's words and how much it changed, as `wf decide` prints beside the branch (git's
 * `--shortstat`); `stat` is null where git said nothing of it.
 */
export type Standing = ({ branch: string; where: 'on' } | { branch: string; where: 'ahead'; commits: number } | { branch: string; where: 'gone' })
  & { said: string; stat: string | null };

/** Mirrors `Decidable` in apps/api/src/app.ts. */
export type Decidable = {
  /** Where each result branch stands, and how much it changed: the facts under the run's result, as `wf decide` prints them. */
  standings: Standing[];
  touched: Touched[];
  lesson: Lesson;
  sensitive: SensitiveDiff[];
  used: Record<string, StepUsed>;
  total: StepUsed;
  /** What the run has cost, as `wf decide` prints it after its steps, without its label; null before any attempt has ended. */
  cost: string | null;
  /** `wf decide`'s OVER BUDGET line: why each step held on its budget is held; null when none is. */
  overBudget: string | null;
  commands: DecideCommand[];
};

/**
 * Mirrors `RunDecision` in apps/api/src/app.ts: `waiting` for a run whose roots wait on runs not shipped, `running` while nobody is
 * waited on, `nothing` for a run called off or shipped.
 */
export type RunDecision = { waiting: RunWaiting } | { running: true } | { nothing: string } | Decidable;

/**
 * What `wf decide` shows a person about a run. Read once for each state of the run, never on the page's beat: the api
 * runs `git diff` for it. `stamp` is the run's state (`decisionStamp`), so a step that moves — a retry filed and settled,
 * a round gone — reads it again, once; and while it does, the decision last read stays on the page, rather than the
 * section going blank and the canvas under it jumping up and back.
 */
export const decisionQuery = (id: string, stamp: string) =>
  queryOptions({
    queryKey: ['runs', id, 'decision', stamp],
    queryFn: () => get<RunDecision>(`/api/runs/${encodeURIComponent(id)}/decision`),
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

/**
 * Mirrors `StepAttempts` in apps/api/src/app.ts. `endedAt` is when the latest attempt ended — the
 * engine's `Attempt.endedAt` — and null while it runs or on a record from before the engine kept it.
 */
export type StepAttempts = {
  count: number;
  latest: { startedAt: string; ended: string | null; endedAt: string | null; reason: string | null } | null;
};

/** Mirrors `StepLog` in apps/api/src/app.ts. */
export type StepLog = { lines: string[]; truncated: boolean };

/**
 * Mirrors `TranscriptEvent` in packages/agent-engine/src/runner.ts, as the api passes it on: one thing said in a session's
 * conversation. A `tool_result` carries its call's `id`, so an event is unique by `id` and `kind` together.
 */
export type TranscriptEvent = {
  id: string;
  at: string;
  role: 'assistant' | 'user' | 'system';
  kind: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'system';
  text?: string;
  tool?: { name: string; input: unknown };
  result?: { text: string; isError: boolean };
};

/** Mirrors `StepTranscript` in apps/api/src/app.ts: the events from a cursor, the cursor to ask again from, and whether more may come. */
export type StepTranscript = { events: TranscriptEvent[]; cursor: string | null; live: boolean };

/** Where a step's conversation is read, and — with `/stream` after it — followed as server-sent events. */
export const transcriptPath = (runId: string, step: string) =>
  `/api/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(step)}/transcript`;

/** One read of a step's conversation, from the start. */
export const readTranscript = (runId: string, step: string, signal?: AbortSignal) =>
  get<StepTranscript>(transcriptPath(runId, step), { signal });

async function get<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    // The api says what to do next in `error`, which is worth more than the status line.
    const said = await res.json().then((body: { error?: unknown }) => body.error, () => undefined);
    throw new Error(typeof said === 'string' ? said : `GET ${path} answered ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export const runsQuery = queryOptions({
  queryKey: ['runs'],
  queryFn: () => get<RunSummary[]>('/api/runs'),
  refetchInterval: 5_000,
});

/** Mirrors `Described` in apps/api/src/capabilities.ts: a skill or an agent, and the file it was read from. */
export type Described = { name: string; description: string | null; source: string };

/** Mirrors `McpServer` in apps/api/src/capabilities.ts: a server as `.mcp.json` declares it, and what it answered. */
export type McpServer = {
  name: string;
  source: string;
  type: string;
  command: string | null;
  args: string[];
  url: string | null;
  enabled: boolean;
  /** `denied` is the rule in `permissions.deny` that refuses the tool, if one does. */
  tools: Array<{ name: string; description: string | null; denied: string | null }> | null;
  error: string | null;
  notAsked: string | null;
  checkedAt: string | null;
};

/** A permission rule, and where it was read: the settings' file, or a step's `disallow:`. */
export type Rule = { rule: string; source: string };

/**
 * Mirrors `MEASURED_TOOLS` in apps/api/src/capabilities.ts: what a Claude Code step with no `tools:` has, as measured on `measuredAt` with
 * `version` — data, never claimed current.
 */
export type MeasuredTools = {
  harness: string;
  version: string;
  measuredAt: string;
  source: string;
  /** What the measurement named. */
  tools: string[];
  /** What such a step is taken to have that no measurement named, each with why: inferred, never measured. */
  inferred: Array<{ name: string; why: string }>;
  lacks: string[];
};

/**
 * Mirrors `READ_ONLY_COMMANDS` in apps/api/src/capabilities.ts: the Bash commands Claude Code runs without a rule in every mode, unless a deny
 * names them — `measured` running so on `measuredAt` with `version`, the rest only `documented` — data, never claimed current.
 */
export type ReadOnlyCommands = {
  harness: string;
  version: string;
  measuredAt: string;
  source: string;
  measured: string[];
  /** Named by the docs, not measured; `git` is its read-only forms. */
  documented: string[];
  docs: string;
};

/**
 * Mirrors `StepReach` in apps/api/src/reach.ts: what a step of a workflow gets — its fence as its file declares it, and, on Claude Code, the
 * built-in tools it has (`declared` or `measured`, less what a deny rule takes), the skills it can load, each enabled server's tools; the deny
 * rules that hold for it, and what the settings allow it, `bash` their commands and `dontAsk` whether the rest is denied without a prompt.
 */
export type StepReach = {
  workflow: string;
  from: 'repo' | 'yours';
  step: string;
  harness: string;
  claudeCode: boolean;
  fence: { tools: string[] | null; disallow: string[]; permissionMode: string | null; effort: string | null; mcp: null };
  tools: { from: 'declared' | 'measured'; names: string[]; inferred: string[]; removed: Array<{ name: string; rule: string; source: string; of: string | null }> } | null;
  skills: { names: string[]; why: string | null } | null;
  /** Each tool of each server: the deny over it, the ask rule over it when no deny is, and whether an allow reaches it with neither. */
  mcp: Array<{ server: string; tools: Array<{ name: string; denied: Rule | null; asks: Rule | null; allowed: boolean }> | null; why: string | null }> | null;
  denied: Rule[];
  /** The settings' ask rules: what asks whatever an allow says, and in dontAsk is denied. None off Claude Code. */
  asked: Rule[];
  /**
   * Mirrors `AllowedFor`: the allow rules that stand, those a deny takes back, those an ask rule takes back, and of a tool the step does not have;
   * the Bash rules that stand, each with the narrower denies that still refuse some of it and the narrower ask rules that make some of it ask;
   * and why there is no Bash command, for a step with no Bash.
   */
  allowed: {
    rules: string[];
    takenBack: Array<{ rule: string; by: Rule }>;
    asked: Array<{ rule: string; by: Rule }>;
    unused: string[];
    bash: Array<{ rule: string; command: string; except: string[]; asks: string[] }>;
    /** Every standing rule a narrower deny still refuses part of, or a narrower ask rule makes part of ask — a Bash command, one tool of a server. */
    exceptions: Array<{ rule: string; except: string[]; asks: string[] }>;
    dontAsk: boolean;
    why: string | null;
  };
  /**
   * Mirrors `ReadOnlyCommand`: Claude Code's read-only commands, each measured or documented; the ask rule that makes it ask, when no deny refuses
   * it; and the rule that refuses it — a deny, or in dontAsk that ask rule. None without Bash, null off Claude Code.
   */
  readOnly: Array<{ command: string; measured: boolean; denied: Rule | null; asks: Rule | null }> | null;
};

/** Mirrors `CapabilitiesWithSteps` in apps/api/src/reach.ts: what the repository the api runs in offers a step, and what each step gets. */
export type Capabilities = {
  repo: string;
  skills: Described[];
  agents: Described[];
  mcp: McpServer[];
  denied: Rule[];
  /** `permissions.ask` in the settings, in its order. */
  asked: Rule[];
  /** `permissions.allow` in the settings, in its order. */
  allowed: Rule[];
  warnings: string[];
  measured: MeasuredTools;
  readOnly: ReadOnlyCommands;
  steps: StepReach[];
};

/**
 * What the repository offers a step. Not polled: it changes when a person edits the checkout, and the api asks
 * each server for its tools once while it runs. Read again on each visit.
 */
export const capabilitiesQuery = queryOptions({
  queryKey: ['capabilities'],
  queryFn: () => get<Capabilities>('/api/capabilities'),
});

/** Mirrors `WorkflowStepSpec` in apps/api/src/workflows.ts: every key a step of a workflow sets, before any run froze it. */
export type WorkflowStepSpec = {
  harness: string | null;
  model: string | null;
  effort: string | null;
  /** The session's context window, in tokens (`context:`, written `200k`): null for the model's whole window. */
  context: number | null;
  after: string[];
  resume: string | null;
  input: string[];
  /** The agent attached to the step (`agent:`), in agents/ beside the folder: the rest of the keys are resolved with it. Null for none. */
  agent: string | null;
  permissionMode: string | null;
  tools: string[] | null;
  /** What the session may not have (`disallow:`): empty where the step denies nothing. */
  disallow: string[];
  /** `remote:` as written: null where the step has no line. */
  remote: boolean | null;
  deadlineSeconds: number | null;
  maxAttempts: number | null;
  /** The most the step's tries may cost together, in dollars (`budget:`). */
  budget: number | null;
  check: string | null;
  retries: number | null;
  /** `gate: true`, or null for a step without the line. */
  gate: true | null;
  /** The schema file `output:` names. */
  output: string | null;
  loop: string | null;
  rounds: number | null;
};

/**
 * Mirrors `ListedStep` in apps/api/src/workflows.ts: a step as a workflow's listing has it — and as the builder puts it back. `spec` and `body`
 * are the step resolved; `own` is what a step with an agent sets itself, null for a step with none.
 */
export type ListedStep = { name: string; spec: WorkflowStepSpec; body: string; own: StepOwn | null };

/** Mirrors `StepOwn` in apps/api/src/workflows.ts: the keys a step with an agent sets itself — the rest are its agent's — and its own note. */
export type StepOwn = { keys: Array<keyof WorkflowStepSpec>; body: string };

/**
 * Mirrors `WorkflowListing` in apps/api/src/workflows.ts: a folder of steps, where it is read from — the repository's
 * `workflows/`, or yours — its README's description, its steps, its graph and the schemas beside its steps; or, for a folder
 * that does not read as a workflow, the loader's refusal and no steps.
 */
export type WorkflowListing = {
  name: string;
  from: 'repo' | 'yours';
  dir: string;
  description: string | null;
  steps: ListedStep[];
  graph: RunGraph;
  /** The `.json` files beside the steps, which an `output:` may name. */
  schemas: string[];
  /** What the folder's files held when it was listed: a save carries it, and the api refuses one of a folder changed since (409). */
  version: string;
  error: string | null;
};

/** Every workflow there is. Not polled: it changes when a person edits a folder. Read again on each visit. */
export const workflowsQuery = queryOptions({
  queryKey: ['workflows'],
  queryFn: () => get<WorkflowListing[]>('/api/workflows'),
});

/**
 * Mirrors `KeyRow` in apps/api/src/workflows.ts: one key of a card or a step, as its page lays them out — the key, its value as the package
 * read it, null where the file does not set it, and the package's one line of what it means.
 */
export type KeyRow = { key: string; value: string | null; meaning: string };

/**
 * Mirrors `WorkflowStepPage` in apps/api/src/workflows.ts: one step of a workflow — its body, its file as written, and every key a step may set,
 * in the package's order, with its value as the loader read it.
 */
export type WorkflowStepPage = { workflow: string; from: WorkflowListing['from']; dir: string; step: string; body: string; source: string; keys: KeyRow[] };

/** A step of a workflow, for its page. Read again on each visit, as the Workflows page is: a person edits the folder. */
export const stepQuery = (from: string, workflow: string, step: string) =>
  queryOptions({
    queryKey: ['workflows', from, workflow, step],
    queryFn: () => get<WorkflowStepPage>(`/api/workflows/${encodeURIComponent(from)}/${encodeURIComponent(workflow)}/${encodeURIComponent(step)}`),
  });

/** Mirrors `KeyKind` in apps/api/src/builder.ts: how a key is set on a step's form. */
export type KeyKind = 'steps' | 'step' | 'choice' | 'harness-word' | 'text' | 'list' | 'count' | 'dollars' | 'tokens' | 'flag' | 'schema';

/** Mirrors `KeyField` in apps/api/src/builder.ts: one key of a step's form, its line of meaning, how it is set, and the words it may take. */
export type KeyField = {
  key: keyof WorkflowStepSpec;
  meaning: string;
  kind: KeyKind;
  choices: string[] | null;
  byHarness: Record<string, string[]> | null;
};

/**
 * Mirrors `KeyForm` in apps/api/src/builder.ts: every key a step may set, in the package's order, the harness a step runs on when it names none,
 * the keys a step with an agent takes from it (`roleKeys`), and what each agent of yours gives a step (`agents`).
 */
export type KeyForm = { keys: KeyField[]; defaultHarness: string; roleKeys: Array<keyof WorkflowStepSpec>; agents: Record<string, Partial<WorkflowStepSpec>> };

/** What a step's form is drawn from. It changes with the package, so once a visit. */
export const keyFormQuery = queryOptions({
  queryKey: ['step-keys'],
  queryFn: () => get<KeyForm>('/api/workflows/keys'),
  staleTime: Infinity,
});

/** Mirrors `WorkflowSaved` in apps/api/src/builder.ts: a folder written, read back from disk, and its files by name. */
export type WorkflowSaved = { workflow: WorkflowListing; written: string[]; kept: string[]; removed: string[] };

/**
 * A write of the builder's the api refused: its sentence, and the steps it names — one, several for a cycle, or none for a refusal of the
 * folder or the request — which the board shows it by. `status` is the api's: 409 for a folder changed since the board read it. Null for a
 * write refused before an answer said why.
 */
export class BuildRefusal extends Error {
  readonly steps: string[];
  readonly status: number | null;
  constructor(message: string, steps: readonly string[], status: number | null = null) {
    super(message);
    this.steps = [...steps];
    this.status = status;
  }
}

/** A builder's write, sent as `application/json`, which the api requires of every write: resolved with what it answered, or its refusal. */
async function build<T>(method: 'PUT' | 'POST', route: string, body: unknown, ok: (answer: Record<string, unknown>) => boolean): Promise<T> {
  const res = await fetch(route, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const answer = (await res.json().catch(() => undefined)) as Record<string, unknown> | undefined;
  if (res.ok && answer && ok(answer)) return answer as T;
  if (res.ok) {
    throw new BuildRefusal(
      `${method} ${route} answered ${res.status} ${res.statusText} without what it wrote, so the api and this board disagree about what a write answers. ` +
        'The folder may be written: reload the Workflows page before writing it again, and restart the api (`npm run dev`).',
      [],
    );
  }
  const steps = Array.isArray(answer?.steps) ? answer.steps.filter((s): s is string => typeof s === 'string') : [];
  throw new BuildRefusal(typeof answer?.error === 'string' ? answer.error : `${method} ${route} answered ${res.status} ${res.statusText}`, steps, res.status);
}

const isSaved = (answer: Record<string, unknown>): boolean => typeof answer.workflow === 'object' && answer.workflow !== null && Array.isArray(answer.written);

/** A schema pasted for a step's `output:`, written beside the steps by the save that carries it. */
export type SchemaFile = { file: string; text: string };

/**
 * Put a folder of yours back from its steps and the schemas pasted for them, as the builder saves it: the api judges the two together, calls the
 * package's `writeWorkflow`, and answers the folder read back from disk. `version` is the one the folder was listed at. Rejects with a
 * `BuildRefusal`: the package's sentence and the steps it names, a folder changed since it was read (409), or the api's own about the request.
 */
export const saveWorkflow = (name: string, save: { version: string; steps: readonly ListedStep[]; schemas: readonly SchemaFile[] }): Promise<WorkflowSaved> =>
  build('PUT', `/api/workflows/yours/${encodeURIComponent(name)}`, { version: save.version, steps: save.steps, ...(save.schemas.length ? { schemas: save.schemas } : {}) }, isSaved);

/** Make a folder of yours with its first step. Rejects with a `BuildRefusal`, as a save does: a name taken, or a step the package refuses. */
export const createWorkflow = (name: string, step: ListedStep): Promise<WorkflowSaved> =>
  build('POST', '/api/workflows/yours', { name, step }, isSaved);

/** The keys an agent sets on the steps that name it: every agent key but its description. Mirrors `RoleKey` in the package. */
export type AgentRoleKey = 'harness' | 'model' | 'effort' | 'context' | 'permissionMode' | 'tools' | 'disallow' | 'remote' | 'output';

/** Mirrors `AgentUser` in apps/api/src/agents.ts: a node that names an agent, the step of a workflow in the agent's own place. */
export type AgentUser = { from: 'repo' | 'yours'; workflow: string; step: string };

/**
 * Mirrors `AgentListing` in apps/api/src/agents.ts: one agent — its keys as its file writes them, its instructions, the result schema its
 * `output:` names, its file as written, the version a write carries, the nodes that name it, and the parser's refusal of a file that does not read.
 */
export type AgentListing = {
  name: string;
  from: 'repo' | 'yours';
  dir: string;
  file: string;
  description: string | null;
  keys: Partial<Record<AgentRoleKey, string>>;
  body: string;
  schema: SchemaFile | null;
  source: string;
  version: string;
  usedBy: AgentUser[];
  error: string | null;
};

/** Every agent of the repository's and of yours, read from disk on each request. */
export const agentsQuery = queryOptions({
  queryKey: ['agents'],
  queryFn: () => get<AgentListing[]>('/api/agents'),
});

/** One agent, for its page. */
export const agentQuery = (from: string, name: string) =>
  queryOptions({
    queryKey: ['agents', from, name],
    queryFn: () => get<AgentListing>(`/api/agents/${encodeURIComponent(from)}/${encodeURIComponent(name)}`),
  });

/** An agent as a write sends it: its name, description, the role keys it sets — one unset as null — its instructions, and a result schema pasted for it. */
export type AgentDraft = { name: string; description: string | null; keys: Partial<Record<AgentRoleKey, string | null>>; body: string; schema?: SchemaFile };

/** Mirrors `AgentSaved` in apps/api/src/agents.ts: the agent as it now reads, and its files by name. */
export type AgentSaved = { agent: AgentListing; written: string[]; removed: string[] };

/**
 * A write of an agent the api refused: the package's sentence, the nodes that still name the agent when that is why, and the api's status —
 * 404 for an agent gone, 409 for one changed since it was read, a name taken, or an agent still named. Null for no answer.
 */
export class AgentRefusal extends Error {
  readonly users: string[];
  readonly status: number | null;
  constructor(message: string, users: readonly string[], status: number | null = null) {
    super(message);
    this.users = [...users];
    this.status = status;
  }
}

async function agentWrite<T>(method: 'POST' | 'PUT' | 'DELETE', route: string, body: unknown): Promise<T> {
  const res = await fetch(route, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const answer = (await res.json().catch(() => undefined)) as Record<string, unknown> | undefined;
  if (res.ok && answer) return answer as T;
  const users = Array.isArray(answer?.users) ? answer.users.filter((s): s is string => typeof s === 'string') : [];
  throw new AgentRefusal(typeof answer?.error === 'string' ? answer.error : `${method} ${route} answered ${res.status} ${res.statusText}`, users, res.status);
}

/** Make an agent of yours. Rejects with an `AgentRefusal`: a name taken, or a key or value the package refuses. */
export const createAgent = (draft: AgentDraft): Promise<AgentSaved> => agentWrite('POST', '/api/agents/yours', draft);

/** Put an agent of yours back — renamed, when the draft names it otherwise — against the version it was read at. */
export const saveAgent = (name: string, version: string, draft: AgentDraft): Promise<AgentSaved> =>
  agentWrite('PUT', `/api/agents/yours/${encodeURIComponent(name)}`, { ...draft, version });

/** Remove an agent of yours, against the version it was read at: refused while a node still names it, saying which. */
export const removeAgent = (name: string, version: string): Promise<{ removed: string[] }> =>
  agentWrite('DELETE', `/api/agents/yours/${encodeURIComponent(name)}`, { version });

/** A workflow by name, as the Workflows page lists it: the last segment of its folder. */
export const workflowNameOf = (workflowDir: string): string => workflowDir.replace(/[\\/]+$/, '').split(/[\\/]/).at(-1) || workflowDir;

/** The repository a start runs in, as the api resolved it: what the start form lists the runs of. Read once a visit. */
export const repositoryQuery = queryOptions({
  queryKey: ['repository'],
  queryFn: () => get<{ repo: string }>('/api/repository'),
});

/** What a start answers: the new run — and, for an inbox card, whether the card left the inbox, and why not when it did not. */
export type Started = { id: string; removed?: boolean; why?: string };

/**
 * Start a run of a workflow, as `wf start` does: the api writes the run's record and files nothing. Resolves with the new
 * run's id; rejects with the api's refusal in full — the loader's, `wf start`'s (`afterRefusal`'s, for a run it will not wait
 * on), or the api's own about the request. `after` names the runs it waits on, as `--after` does; left out when there are none.
 *
 * `card` starts an inbox card, as `wf start <inbox>/<card>.md --brief <brief>` does: the record carries where it came from, and the card
 * leaves the inbox — `removed` says whether it did, and `why` why not. Refused in the package's words: a card not there, one started already.
 *
 * Sent as `application/json`, which the api requires of a start: the one body a page on another site cannot send it unasked.
 */
export async function startRun(start: { workflow: string; from: WorkflowListing['from']; brief: string; after?: readonly string[]; card?: string }): Promise<Started> {
  const res = await fetch('/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(start) });
  const body = (await res.json().catch(() => undefined)) as { id?: unknown; removed?: unknown; why?: unknown; error?: unknown } | undefined;
  if (res.ok && typeof body?.id === 'string') {
    return { id: body.id, ...(typeof body.removed === 'boolean' ? { removed: body.removed } : {}), ...(typeof body.why === 'string' ? { why: body.why } : {}) };
  }
  if (res.ok) {
    // Written, it may well be: look before starting it again.
    throw new Error(
      `POST /api/runs answered ${res.status} ${res.statusText} without the new run's id, so the api and this board disagree about what a start answers. ` +
        'The run may have started: look on the Runs page before starting it again, and restart the api (`npm run dev`).',
    );
  }
  throw new Error(typeof body?.error === 'string' ? body.error : `POST /api/runs answered ${res.status} ${res.statusText}`);
}

/**
 * Mirrors `InboxEntry` in apps/api/src/inbox.ts: a card as `wf inbox` lists it — or an entry of the inbox that does not read as one, `error`
 * saying why — with its body, the brief a start is prefilled with, and when its file was written, which the page orders the cards by.
 */
export type InboxEntry = {
  name: string;
  file: string;
  /** The first line of its body; null for an entry that does not read. */
  title: string | null;
  /** As the card writes it: a workflow's name, or the absolute folder of one. */
  workflow: string | null;
  repo: string | null;
  /** The runs a record says it was started as: a card still here was started, and its removal failed. */
  startedAs: string[];
  error: string | null;
  body: string | null;
  filedAt: string | null;
  /**
   * On a queued card only (`wf inbox queue`): when it was queued, and its place in the order the tick starts cards in, from 1 — null for a card a
   * record says was started, which the tick never starts again.
   */
  queued?: { at: string; place: number | null };
  /**
   * On a queued card only, whose start the tick tried and did not make, as the card stands: when, on which repository, why, and whether the
   * package refused it — which lasts until the card is edited or queued again — or something else failed, which the tick tries again.
   */
  tried?: { at: string; repo: string; why: string; refused: boolean };
};

/** The inbox. Not polled: it changes when a person files, drops or starts a card, here or at the command line. Read again on each visit. */
export const inboxQuery = queryOptions({
  queryKey: ['inbox'],
  queryFn: () => get<InboxEntry[]>('/api/inbox'),
});

/**
 * Mirrors `InboxCardPage` in apps/api/src/inbox.ts: a card as the inbox lists it, its file as written, frontmatter included, and each key a card
 * may set, a row each — none for an entry that does not read as a card.
 */
export type InboxCardPage = InboxEntry & { source: string; keys: KeyRow[] | null };

/** A card, for its page. Read again on each visit, as the inbox is. */
export const cardQuery = (name: string) =>
  queryOptions({
    queryKey: ['inbox', name],
    queryFn: () => get<InboxCardPage>(`/api/inbox/${encodeURIComponent(name)}`),
  });

/**
 * File an idea as a card, as `wf inbox add "<idea>" --workflow <name> --repo <path>` does. Resolves with the card's name; rejects with the api's
 * refusal in full — the package's words for an idea with nothing in it or a repository that is not an absolute path to a directory, or the
 * api's own about the request or a workflow it has none of.
 *
 * Sent as `application/json`, which the api requires of it, as of a start.
 */
export async function fileCard(card: { body: string; workflow?: string; from?: WorkflowListing['from']; repo?: string }): Promise<{ name: string }> {
  const res = await fetch('/api/inbox', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(card) });
  const body = (await res.json().catch(() => undefined)) as { name?: unknown; error?: unknown } | undefined;
  if (res.ok && typeof body?.name === 'string') return { name: body.name };
  if (res.ok) {
    throw new Error(
      `POST /api/inbox answered ${res.status} ${res.statusText} without the card's name, so the api and this board disagree about what a filing answers. ` +
        'The card may be filed: look in the inbox (`wf inbox`) before filing it again, and restart the api (`npm run dev`).',
    );
  }
  throw new Error(typeof body?.error === 'string' ? body.error : `POST /api/inbox answered ${res.status} ${res.statusText}`);
}

/**
 * Drop a card without starting it, as `wf inbox rm <name>` does. Rejects with the api's refusal in full: the package's words for a card that is
 * not there, naming the cards that are, or for a name that is not a card's.
 *
 * Sent as `application/json`, with no body, which the api requires of it, as of every write: a request another site's page cannot make unasked.
 */
export async function dropCard(name: string): Promise<void> {
  const route = `/api/inbox/${encodeURIComponent(name)}`;
  const res = await fetch(route, { method: 'DELETE', headers: { 'content-type': 'application/json' } });
  if (res.ok) return;
  const body = (await res.json().catch(() => undefined)) as { error?: unknown } | undefined;
  throw new Error(typeof body?.error === 'string' ? body.error : `DELETE ${route} answered ${res.status} ${res.statusText}`);
}

/** Mirrors `InboxQueueAnswer` in apps/api/src/inbox.ts: what `wf inbox queue` did, the card's `queued:` as it now reads, and its place once queued. */
export type Queued = { name: string; file: string; was: 'queued' | 'taken back' | 'not queued'; queued: string | null; place: number | null; of: number | null };

/**
 * Queue a card to start on its own, as `wf inbox queue <name>` does — or, `off`, take it off the queue, as `--off` does. The tick starts the next
 * card in the queue when a run slot frees, on the workflow the card names. Resolves with what was done; rejects with the api's refusal in full —
 * the package's words for a card that is not there, names no workflow, is queued already or was started — or the api's own about the request.
 *
 * Sent as `application/json`, with no body, which the api requires of it, as of every write.
 */
export async function queueCard(name: string, { off = false }: { off?: boolean } = {}): Promise<Queued> {
  const route = `/api/inbox/${encodeURIComponent(name)}/queue`;
  const method = off ? 'DELETE' : 'POST';
  const res = await fetch(route, { method, headers: { 'content-type': 'application/json' } });
  const body = (await res.json().catch(() => undefined)) as Partial<Queued> & { error?: unknown } | undefined;
  if (res.ok && typeof body?.was === 'string') return body as Queued;
  if (res.ok) {
    throw new Error(
      `${method} ${route} answered ${res.status} ${res.statusText} without what it did, so the api and this board disagree about what a queue answers. ` +
        'The card may be queued, or not: look in the inbox (`wf inbox`) before asking again, and restart the api (`npm run dev`).',
    );
  }
  throw new Error(typeof body?.error === 'string' ? body.error : `${method} ${route} answered ${res.status} ${res.statusText}`);
}

/**
 * Mirrors `Ceilings` in apps/api/src/app.ts: the cap on runs in flight the daemon's last pass ran with (`last`, null before any pass wrote it),
 * the cap a run is judged by (0 for none), the runs that count against it — null with no cap, when the api reads none — and the runs it holds.
 */
export type Ceilings = {
  last: { sessions: number; runs: number } | null;
  cap: number;
  inFlight: string[] | null;
  held: Array<{ run: string; inFlight: number; cap: number; word: string }>;
};

/** The cap on runs in flight, read again every 5 s beside the runs: what the Factory says over its floor. */
export const ceilingsQuery = queryOptions({
  queryKey: ['ceilings'],
  queryFn: () => get<Ceilings>('/api/ceilings'),
  refetchInterval: 5_000,
});

/**
 * Ask for another try of a step, as `wf retry` does: the api calls the package's `retry()`, which writes the ask and nothing else, and the
 * next tick files the try. Resolves with the try asked for, its ask file, and the package's `stopFirst` — the tick stops the step's blocked
 * session before it files the try; rejects with the api's refusal in full — the package's words for a message or a budget that cannot ride
 * on the ask, a step that may not be tried again that way, or a budget not above what its tries have cost — or the api's own about the request.
 * `budget` is `--budget`: the cap a step over its budget, or ended at it, is raised to.
 *
 * Sent as `application/json`, which the api requires of it, as of a start.
 */
export async function askTry(runId: string, step: string, how: { mode: RetryMode; model?: string; message?: string; budget?: number }): Promise<{ try: number; file: string; stopFirst: boolean }> {
  const route = `/api/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(step)}/retry`;
  const res = await fetch(route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(how) });
  const body = (await res.json().catch(() => undefined)) as { try?: unknown; file?: unknown; stopFirst?: unknown; error?: unknown } | undefined;
  if (res.ok && typeof body?.try === 'number') return { try: body.try, file: String(body.file), stopFirst: body.stopFirst === true };
  if (res.ok) {
    // Written, it may well be: look before asking again.
    throw new Error(
      `POST ${route} answered ${res.status} ${res.statusText} without the try it asked for, so the api and this board disagree about what an ask answers. ` +
        `The ask may be written: look at the step's note (\`wf ls ${runId}\`) before asking again, and restart the api (\`npm run dev\`).`,
    );
  }
  throw new Error(typeof body?.error === 'string' ? body.error : `POST ${route} answered ${res.status} ${res.statusText}`);
}

/**
 * Ask for another round of a run's loop, as `wf round` does — past a cap, with `budget`, `--budget`: the api calls the package's `round()`,
 * which writes the ask and nothing else, and the next tick files the round. Resolves with the looping step, the round asked for, and its ask
 * file; rejects with the api's refusal in full — the package's words for a round the loop may not go, or a budget not above what its steps
 * have cost — or the api's own about the request.
 *
 * Sent as `application/json`, which the api requires of it, as of a try.
 */
export async function askRound(runId: string, how: { step?: string; budget?: number }): Promise<{ step: string; round: number; file: string }> {
  const route = `/api/runs/${encodeURIComponent(runId)}/round`;
  const res = await fetch(route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(how) });
  const body = (await res.json().catch(() => undefined)) as { step?: unknown; round?: unknown; file?: unknown; error?: unknown } | undefined;
  if (res.ok && typeof body?.step === 'string' && typeof body.round === 'number') return { step: body.step, round: body.round, file: String(body.file) };
  if (res.ok) {
    // Written, it may well be: look before asking again.
    throw new Error(
      `POST ${route} answered ${res.status} ${res.statusText} without the round it asked for, so the api and this board disagree about what an ask answers. ` +
        `The ask may be written: look at the looping step's note (\`wf ls ${runId}\`) before asking again, and restart the api (\`npm run dev\`).`,
    );
  }
  throw new Error(typeof body?.error === 'string' ? body.error : `POST ${route} answered ${res.status} ${res.statusText}`);
}

/**
 * Approve a step waiting at its gate, as `wf approve` does — with `message`, `--message`, the words every step after the gate is handed: the
 * api calls the package's `approve()`, which writes the approval and nothing else, and the next tick files what waits on the step. Resolves
 * with the try approved, when, the words and the approval's file; rejects with the api's refusal in full — the package's words for a step
 * that may not be approved, or for empty words — or the api's own about the request.
 *
 * Sent as `application/json`, which the api requires of it, as of an ask. Sending the step back is an ask for a try with words (`askTry`).
 */
export async function approveStep(runId: string, step: string, how: { message?: string }): Promise<{ try: number; at: string; message: string | null; file: string }> {
  const route = `/api/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(step)}/approve`;
  const res = await fetch(route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(how) });
  const body = (await res.json().catch(() => undefined)) as { try?: unknown; at?: unknown; message?: unknown; file?: unknown; error?: unknown } | undefined;
  if (res.ok && typeof body?.try === 'number' && typeof body.at === 'string') {
    return { try: body.try, at: body.at, message: typeof body.message === 'string' ? body.message : null, file: String(body.file) };
  }
  if (res.ok) {
    // Written, it may well be: look before approving again.
    throw new Error(
      `POST ${route} answered ${res.status} ${res.statusText} without the approval it wrote, so the api and this board disagree about what approving answers. ` +
        `The approval may be written: look at the step (\`wf decide ${runId}\`) before approving again, and restart the api (\`npm run dev\`).`,
    );
  }
  throw new Error(typeof body?.error === 'string' ? body.error : `POST ${route} answered ${res.status} ${res.statusText}`);
}

/**
 * Tell a step's running session something, as `wf say` does: the api calls the package's `say()`, which hands the words to the session through
 * the engine, and the engine journals them on the step's task. Resolves with that entry; rejects with the api's refusal in full — the package's
 * words or the engine's, verbatim — or the api's own about the request.
 *
 * Sent as `application/json`, which the api requires of it, as of a start and an ask.
 */
export async function sayToStep(runId: string, step: string, text: string): Promise<Said> {
  const route = `/api/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(step)}/say`;
  const res = await fetch(route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
  const body = (await res.json().catch(() => undefined)) as { at?: unknown; attempt?: unknown; text?: unknown; error?: unknown } | undefined;
  if (res.ok && typeof body?.at === 'string' && typeof body.attempt === 'number' && typeof body.text === 'string') {
    return { at: body.at, attempt: body.attempt, text: body.text };
  }
  if (res.ok) {
    // Said, it may well be: look before saying it twice.
    throw new Error(
      `POST ${route} answered ${res.status} ${res.statusText} without what it journalled, so the api and this board disagree about what saying answers. ` +
        `The words may have been said: read the step's record (\`wf decide ${runId}\`) before saying them again, and restart the api (\`npm run dev\`).`,
    );
  }
  throw new Error(typeof body?.error === 'string' ? body.error : `POST ${route} answered ${res.status} ${res.statusText}`);
}

export const runQuery = (id: string) =>
  queryOptions({
    queryKey: ['runs', id],
    queryFn: () => get<RunDetail>(`/api/runs/${encodeURIComponent(id)}`).then((detail) => withGraph(id, detail)),
    refetchInterval: 5_000,
  });

/**
 * A run's detail, refused unless it carries its `graph`, which is all the canvases draw.
 *
 * An api process started before `RunDetail` carried it answers without one — the version skew that had the board take
 * every step for a root on 2026-09-13. Refused here, naming the fix, so the run's page and the Factory's card say so,
 * rather than a render throwing on `undefined` and taking the whole floor down with it. Nothing is worked out from
 * `after` instead: a graph the api did not give is the guess this replaces. So is a step without its `tries`, which the
 * inspector reads for every step: an api from before it carried them.
 */
export function withGraph(id: string, detail: RunDetail): RunDetail {
  const restart = 'Restart the api (`npm run dev` from the repository, or whatever serves /api), then reload the page.';
  const graph = (detail as { graph?: Partial<RunGraph> | null }).graph;
  if (!graph || !Array.isArray(graph.roots) || !Array.isArray(graph.edges)) {
    throw new Error(`The api answered run '${id}' without its graph, so it is older than this board, which draws only the graph the api gives. ${restart}`);
  }
  const bare = (detail.steps ?? []).find((step) => !Array.isArray((step as { tries?: unknown }).tries));
  if (bare) {
    throw new Error(`The api answered run '${id}' without the tries of its step '${bare.name}', so it is older than this board, which shows every round a step ran. ${restart}`);
  }
  const unsaid = detail.steps.find((step) => !Array.isArray((step as { said?: unknown }).said));
  if (unsaid) {
    throw new Error(`The api answered run '${id}' without what was said to its step '${unsaid.name}', so it is older than this board, whose session page shows what a person said to a step. ${restart}`);
  }
  // And a run's page draws where its time went, off each step's timeline and the run's totals.
  const untimed = detail.steps.find((step) => !Array.isArray((step as { timeline?: unknown }).timeline));
  const totals = (detail as { timeline?: Partial<RunDetail['timeline']> | null }).timeline;
  if (untimed || !totals || !Array.isArray(totals.rounds) || !totals.run) {
    const what = untimed ? `the timeline of its step '${untimed.name}'` : 'the timeline of the run';
    throw new Error(`The api answered run '${id}' without ${what}, so it is older than this board, whose run page shows where a run's time went. ${restart}`);
  }
  // And a gate: who the run waits on in `wf ls`'s words, and each step's need and gate. Without them the banner cannot say `approve plan`, and a
  // step's `approve` read as anything but null would offer Approve on a route that api does not have.
  const ungated = detail.steps.find((step) => !Object.hasOwn(step, 'approve') || !Object.hasOwn(step, 'gate'));
  if (ungated || !Array.isArray((detail as { onYou?: unknown }).onYou)) {
    const what = ungated ? `the gate of its step '${ungated.name}'` : 'who it waits on in wf ls\'s words';
    throw new Error(`The api answered run '${id}' without ${what}, so it is older than this board, whose run page approves a step at its gate. ${restart}`);
  }
  return detail;
}
