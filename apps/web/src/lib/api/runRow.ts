/**
 * A run of the RunList (`GET /api/runs`) as the row the floor, the strips and the pickers read (`RunSummary`): each field from where the
 * Run carries it — its name and labels in `metadata`, what it was started with in `spec`, what is judged of it in `status` — and the few
 * a Run says another way, derived here: the default factory said null, a step's agent from its frozen step, when a step's task at work
 * started from its timeline, and a prune in words. A run the list could not judge is a row of its name that says why (`unreadable`), so
 * it never leaves the floor without a word. Pure.
 */
import type { Run, RunList, RunStatus, RunStepStatus, RunUnjudged } from 'objects';
import type { RunSummary } from './runs.ts';
import type { GraphEdge } from './graph.ts';

/** The namespace of a run that names no factory, which a row says as null. */
const DEFAULT_FACTORY = 'default';

/** The factory a row says: the run's own, null for the default one, as its record names none. */
const factoryOf = (run: Run): string | null => {
  const factory = run.metadata.labels.factory ?? run.metadata.namespace ?? DEFAULT_FACTORY;
  return factory === DEFAULT_FACTORY ? null : factory;
};

/**
 * When a step's task still at work started: the earliest spawn, among its tries' sessions, checks and resumed turns, that has not ended;
 * null while none runs.
 */
export const stepSinceOf = (step: RunStepStatus): string | null => {
  const open = step.timeline.flatMap((t) =>
    [t.session, t.check, t.turn ?? null].flatMap((s) => (s && s.spawnedAt && s.endedAt === null ? [s.spawnedAt] : [])),
  );
  return open.length ? open.reduce((a, b) => (Date.parse(b) < Date.parse(a) ? b : a)) : null;
};

/** A time a prune's marker no longer says. */
const atOf = (at: string): string => at || 'a time its marker no longer says';

/**
 * What a prune removed and what it kept, in words for the mark beside a run's status, where the Run carries none of the package's: its
 * worktrees, its files where they went too.
 */
export const prunedSaid = (pruned: NonNullable<RunStatus['pruned']>): string => {
  const files = pruned.artifacts ? `its files were removed at ${atOf(pruned.artifacts.at)}` : '';
  const kept = pruned.artifacts ? 'its branches and record are kept' : 'its branches, record and files are kept';
  const removed =
    pruned.artifacts && !pruned.worktrees.length
      ? `pruned at ${atOf(pruned.artifacts.at)} — ${files}`
      : `pruned at ${atOf(pruned.at)} — its worktrees were removed${files ? `, and ${files}` : ''}`;
  return `${removed}; ${kept}`;
};

/** The edges a row draws: every one but what a step is handed (`input`). */
const drawnEdges = (edges: RunStatus['graph']['edges']): GraphEdge[] =>
  edges.filter((e): e is Exclude<typeof e, { kind: 'input' }> => e.kind !== 'input');

/** The row of a judged run. */
export const runRowOf = (run: Run): RunSummary => {
  const { metadata, spec, status } = run;
  const agents = new Map(spec.steps.map((s) => [s.name, s.agent ?? null]));
  return {
    id: metadata.name,
    repo: spec.repo,
    factory: factoryOf(run),
    place: spec.place,
    work: spec.work,
    brief: spec.brief,
    workflowDir: spec.workflowDir,
    workflowPage: null,
    try: spec.try,
    createdAt: metadata.creationTimestamp,
    startedAt: status.startedAt,
    cancelledAt: status.cancelledAt,
    pruned: status.pruned ? { said: status.pruned.said ?? prunedSaid(status.pruned) } : null,
    after: spec.after,
    context: spec.context,
    waiting: status.waiting,
    holdUntil: status.holdUntil,
    holding: status.holding,
    status: status.status,
    phase: status.phase,
    reason: status.reason,
    on: status.on,
    via: status.via,
    moving: status.moving,
    cost: status.cost,
    atWork: status.atWork,
    tokens: status.tokens,
    steps: status.steps.map((s) => ({
      name: s.name,
      taskId: s.taskId,
      branch: s.branch,
      phase: s.phase,
      reason: s.reason,
      on: s.on,
      via: s.via,
      message: s.message,
      verdict: s.verdict,
      note: s.note,
      roundDue: s.roundDue,
      agent: agents.get(s.name) ?? null,
      since: stepSinceOf(s),
      needs: s.needs,
      waitingFor: s.waitingFor,
      approve: s.approve,
      denied: s.denied,
      sessionUnread: s.sessionUnread,
    })),
    graph: {
      roots: status.graph.roots,
      edges: drawnEdges(status.graph.edges),
      ...(status.graph.nodes ? { nodes: status.graph.nodes } : {}),
    },
    waitingOnYou: status.waitingOnYou,
    waitingOnYouWords: status.waitingOnYouWords,
    toDecide: status.toDecide,
    unreadable: null,
    labels: metadata.labels,
  };
};

/**
 * The row of a run the list could not judge: its name and why (`unreadable`), in its namespace's factory (null for the default),
 * running as far as anyone
 * knows, with no step, no graph and no time — what the floor's card and the Runs page say of it is the why.
 */
export const unjudgedRowOf = (run: RunUnjudged): RunSummary => ({
  id: run.name,
  repo: null,
  factory: run.namespace === undefined || run.namespace === DEFAULT_FACTORY ? null : run.namespace,
  place: 'git',
  work: null,
  brief: '',
  workflowDir: '',
  workflowPage: null,
  try: null,
  createdAt: '',
  startedAt: null,
  cancelledAt: null,
  pruned: null,
  after: [],
  context: [],
  waiting: null,
  holdUntil: [],
  holding: null,
  status: 'running',
  phase: 'running',
  reason: 'Running',
  on: null,
  via: null,
  moving: true,
  cost: null,
  atWork: null,
  tokens: null,
  steps: [],
  graph: { roots: [], edges: [] },
  waitingOnYou: [],
  waitingOnYouWords: [],
  toDecide: null,
  unreadable: run.error,
  labels: {},
});

/** Every row of a list: its judged runs, then a row for each it could not judge. */
export const runRowsOf = (list: RunList): RunSummary[] => [...list.items.map(runRowOf), ...(list.unjudged ?? []).map(unjudgedRowOf)];
