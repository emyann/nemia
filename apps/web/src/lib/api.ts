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
  status: RunStatus;
  /** Whether anything of the run still moves: a task the engine holds for it, or a step or check a tick would still file. */
  moving: boolean;
  /** `note` is what `wf ls` prints beside the status — the try or round a step is on, or the one due — and null where it prints nothing. */
  steps: Array<{ name: string; taskId: string | null; branch: string | null; status: string; note: string | null }>;
  /** Steps a person has to act on — blocked, unsigned, refused by their check, or a loop out of rounds. Empty on a cancelled run. */
  waitingOnYou: string[];
};

/** Mirrors `StepSpec` in apps/api/src/app.ts. */
export type StepSpec = {
  harness: string | null;
  model: string | null;
  effort: string | null;
  after: string[];
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
  status: RunStatus;
  moving: boolean;
  waitingOnYou: string[];
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
    closeout: StepCloseout | null;
    /** Null for a step with no `check:`. */
    check: StepCheck | null;
    attempts: StepAttempts;
    /** What its current try consumed, in `wf decide`'s words; null for a step not filed. */
    used: StepUsed | null;
    /** Every try, earliest first, the current one last: `attempts` counts the current try's task alone. */
    tries: StepTry[];
  }>;
};

/** Mirrors `Usage` in apps/api/src/app.ts: a count nobody measured is absent, never 0. */
export type Usage = { turns?: number; toolCalls?: number; inputTokens?: number; outputTokens?: number; costUsd?: number };

/** Mirrors `StepUsed` in apps/api/src/app.ts: the usage, and `wf decide`'s words for it — `used` and `cost`, `not measured` where nobody counted. */
export type StepUsed = { usage: Usage | null; used: string; cost: string };

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
export type DecideCommand = { label: 'ship it' | 'drop it' | 'read it' | 'once more'; command: string; said: string | null };

/** Mirrors `Decidable` in apps/api/src/app.ts. */
export type Decidable = {
  touched: Touched[];
  lesson: Lesson;
  sensitive: SensitiveDiff[];
  used: Record<string, StepUsed>;
  total: StepUsed;
  commands: DecideCommand[];
};

/** Mirrors `RunDecision` in apps/api/src/app.ts: `running` while nobody is waited on, `nothing` for a run called off or shipped. */
export type RunDecision = { running: true } | { nothing: string } | Decidable;

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

/** Mirrors `Capabilities` in apps/api/src/capabilities.ts: what the repository the api runs in offers a step. */
export type Capabilities = {
  repo: string;
  skills: Described[];
  agents: Described[];
  mcp: McpServer[];
  denied: Array<{ rule: string; source: string }>;
  warnings: string[];
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
  after: string[];
  resume: string | null;
  input: string[];
  permissionMode: string | null;
  tools: string[] | null;
  deadlineSeconds: number | null;
  maxAttempts: number | null;
  check: string | null;
  retries: number | null;
  /** The schema file `output:` names. */
  output: string | null;
  loop: string | null;
  rounds: number | null;
};

/**
 * Mirrors `WorkflowListing` in apps/api/src/workflows.ts: a folder of steps, where it is read from — the repository's
 * `workflows/`, or yours — its README's description, its steps and its graph; or, for a folder that does not read as a
 * workflow, the loader's refusal and no steps.
 */
export type WorkflowListing = {
  name: string;
  from: 'repo' | 'yours';
  dir: string;
  description: string | null;
  steps: Array<{ name: string; spec: WorkflowStepSpec }>;
  graph: RunGraph;
  error: string | null;
};

/** Every workflow there is. Not polled: it changes when a person edits a folder. Read again on each visit. */
export const workflowsQuery = queryOptions({
  queryKey: ['workflows'],
  queryFn: () => get<WorkflowListing[]>('/api/workflows'),
});

/** A workflow by name, as the Workflows page lists it: the last segment of its folder. */
export const workflowNameOf = (workflowDir: string): string => workflowDir.replace(/[\\/]+$/, '').split(/[\\/]/).at(-1) || workflowDir;

/**
 * Start a run of a workflow, as `wf start` does: the api writes the run's record and files nothing. Resolves with the new
 * run's id; rejects with the api's refusal in full — the loader's, `wf start`'s, or the api's own about the request.
 *
 * Sent as `application/json`, which the api requires of a start: the one body a page on another site cannot send it unasked.
 */
export async function startRun(start: { workflow: string; from: WorkflowListing['from']; brief: string }): Promise<{ id: string }> {
  const res = await fetch('/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(start) });
  const body = (await res.json().catch(() => undefined)) as { id?: unknown; error?: unknown } | undefined;
  if (res.ok && typeof body?.id === 'string') return { id: body.id };
  if (res.ok) {
    // Written, it may well be: look before starting it again.
    throw new Error(
      `POST /api/runs answered ${res.status} ${res.statusText} without the new run's id, so the api and this board disagree about what a start answers. ` +
        'The run may have started: look on the Runs page before starting it again, and restart the api (`npm run dev`).',
    );
  }
  throw new Error(typeof body?.error === 'string' ? body.error : `POST /api/runs answered ${res.status} ${res.statusText}`);
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
  return detail;
}
