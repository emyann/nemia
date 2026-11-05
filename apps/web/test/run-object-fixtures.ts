/**
 * A run as the api serves it, a `Run` of `objects`, for the tests that read the RunList: a git run of two steps, `implement` at work
 * under Grace, `review` waiting on a person; each part a builder of its own, so a test changes the one key it is about.
 */
import type { RunObject } from '../src/lib/api.ts';

/** A task's span on the clock: spawned at `spawnedAt`, ended at `endedAt`. */
export const span = (taskId: string, spawnedAt: string | null, endedAt: string | null) => ({
  taskId,
  at: endedAt === null ? ('running' as const) : ('ended' as const),
  filedAt: spawnedAt,
  spawnedAt,
  endedAt,
  attempts: 1,
  queuedMs: null,
  ranMs: null,
  queued: '0s',
  ran: '0s',
});

/** The time of no task yet. */
const total = {
  loop: null,
  round: null,
  tasks: 0,
  inFlight: 0,
  queuedMs: 0,
  ranMs: 0,
  wallMs: null,
  queued: '0s',
  ran: '0s',
  wall: '0s',
  cost: null,
};

/** A step frozen with `agent` given, or none. */
export const frozen = (name: string, agent?: string): RunObject.RunSpecStep => ({
  name,
  after: [],
  input: [],
  loop: null,
  rounds: null,
  harness: 'claude',
  model: null,
  effort: null,
  context: null,
  workspace: null,
  place: null,
  resume: null,
  fence: null,
  sandbox: null,
  tools: null,
  deadlineSeconds: null,
  ...(agent === undefined ? {} : { agent }),
});

/** A step's status, pending unless `extra` says otherwise. */
export const stepStatus = (name: string, extra: Partial<RunObject.RunStepStatus> = {}): RunObject.RunStepStatus => ({
  name,
  phase: 'pending',
  reason: 'Pending',
  status: 'pending',
  on: null,
  via: null,
  message: 'pending',
  verdict: null,
  raise: null,
  timeline: [],
  current: null,
  filed: null,
  taskId: null,
  workspace: null,
  branch: null,
  files: [],
  filesError: null,
  note: null,
  roundDue: false,
  needs: null,
  waitingFor: null,
  approve: null,
  denied: null,
  sessionUnread: null,
  lastLine: null,
  gate: null,
  said: [],
  asked: null,
  check: null,
  attempts: { count: 0, latest: null },
  used: null,
  spent: null,
  budget: null,
  ...extra,
});

/** A try on the clock whose session spans `session`. */
export const timed = (n: number, session: ReturnType<typeof span> | null): RunObject.RunStepStatus['timeline'][number] => ({
  try: n,
  round: 1,
  session,
  sessionOf: null,
  check: null,
  used: null,
});

/** A run of the factory `factory`: `implement` at work under Grace since 10:05, `review` not filed. */
export const run = (factory: string, extra: Partial<RunObject.RunStatus> = {}): RunObject.Run => ({
  apiVersion: 'nemia/v1',
  kind: 'Run',
  metadata: {
    name: 'r-1',
    namespace: factory,
    creationTimestamp: '2026-11-02T10:00:00.000Z',
    labels: { workflow: 'quick', factory, team: 'blue' },
  },
  spec: {
    steps: [frozen('implement', 'grace'), frozen('review')],
    brief: 'a brief',
    place: 'git',
    repo: '/repo',
    baseRef: 'abc123',
    branch: 'main',
    isolate: true,
    work: null,
    workflowDir: '/team/quick',
    try: { agent: 'grace' },
    after: ['r-0'],
    context: ['r-c'],
    from: null,
  },
  status: {
    status: 'running',
    phase: 'running',
    reason: 'Running',
    on: null,
    via: null,
    moving: true,
    cost: { usd: 1.5, measured: 1, unmeasured: 0, said: '$1.50' },
    atWork: { ms: 1000, since: '2026-11-02T10:05:00.000Z', endedAt: null },
    tokens: null,
    waiting: null,
    holding: null,
    toDecide: null,
    graph: {
      roots: ['implement'],
      edges: [
        { from: 'implement', to: 'review', kind: 'after' },
        { from: 'implement', to: 'review', kind: 'input' },
      ],
    },
    timeline: { rounds: [], run: total, slot: null },
    steps: [
      stepStatus('implement', {
        phase: 'running',
        reason: 'Running',
        status: 'running',
        message: 'running',
        taskId: 'r-1-implement-2',
        branch: 'wf/r-1/implement',
        note: 'try 2',
        timeline: [
          timed(1, span('r-1-implement-1', '2026-11-02T10:01:00.000Z', '2026-11-02T10:02:00.000Z')),
          timed(2, span('r-1-implement-2', '2026-11-02T10:05:00.000Z', null)),
        ],
      }),
      stepStatus('review', { needs: 'a word', approve: 'approve review' }),
    ],
    startedAt: '2026-11-02T10:00:01.000Z',
    cancelledAt: null,
    pruned: null,
    onDisk: { worktrees: true, files: true },
    holdUntil: ['r-h'],
    read: null,
    waitingOnYou: ['review'],
    waitingOnYouWords: ['approve review'],
    gates: [],
    warning: null,
    kinds: [],
    ...extra,
  },
});
