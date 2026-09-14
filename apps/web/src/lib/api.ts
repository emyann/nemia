import { queryOptions } from '@tanstack/react-query';

/** Mirrors `RunStatus` in apps/api/src/app.ts: where `assess` puts the run. */
export type RunStatus = 'running' | 'succeeded' | 'failed' | 'cancelled';

/** Mirrors `RunSummary` in apps/api/src/app.ts. */
export type RunSummary = {
  id: string;
  repo: string;
  brief: string;
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
  after: string[];
  resume: string | null;
  permissionMode: string | null;
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

/** Mirrors `StepCloseout` in apps/api/src/app.ts. */
export type StepCloseout = {
  outcome: 'done' | 'blocked';
  summary: string;
  needs: string | null;
  artifacts: string[];
};

/**
 * Mirrors `StepCheck` in apps/api/src/app.ts: the command a step is judged by, from the workflow the run
 * froze, and once its check refused, the exit in `wf ls`'s words and the end of each stream.
 */
export type StepCheck = {
  command: string;
  refused: { exit: string; stdout: StepLog; stderr: StepLog; unreadable: string | null } | null;
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
 * a round gone — reads it again, once.
 */
export const decisionQuery = (id: string, stamp: string) =>
  queryOptions({
    queryKey: ['runs', id, 'decision', stamp],
    queryFn: () => get<RunDecision>(`/api/runs/${encodeURIComponent(id)}/decision`),
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
 * A step's output, read on the page's beat while the step runs and left alone once it is not.
 *
 * Whether it runs is in the key, so the output is read once more when a step stops: the last beat
 * before it stopped can miss how it ended.
 */
export const stepLogQuery = (runId: string, step: string, running: boolean) =>
  queryOptions({
    queryKey: ['runs', runId, 'steps', step, 'log', running ? 'running' : 'not running'],
    queryFn: () => get<StepLog>(`/api/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(step)}/log`),
    refetchInterval: running ? 5_000 : false,
  });

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
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
 * `after` instead: a graph the api did not give is the guess this replaces.
 */
export function withGraph(id: string, detail: RunDetail): RunDetail {
  const graph = (detail as { graph?: Partial<RunGraph> | null }).graph;
  if (!graph || !Array.isArray(graph.roots) || !Array.isArray(graph.edges)) {
    throw new Error(
      `The api answered run '${id}' without its graph, so it is older than this board, which draws only the graph the api gives. ` +
        'Restart the api (`npm run dev` from the repository, or whatever serves /api), then reload the page.',
    );
  }
  return detail;
}
