/**
 * The runs page's reads as the api answers them, for its stories (`Pages/Runs`): runs typed by `objects`' own `Run` and `RunList`, so a
 * key the api adds or renames fails the typecheck here before a story draws a shape the api no longer serves, and the MSW handlers a
 * story names in `parameters.msw` to answer the page's two reads (`GET /api/runs`, the runs not finished and a page of the finished,
 * told apart by their `fieldSelector`) — with some runs, with none, or refusing.
 */
import { http, HttpResponse } from 'msw';
import type { Run, RunList, RunStepStatus } from 'objects';

/** The instant every list is measured to, so a story draws the same words whatever day it is drawn on. */
const AS_OF = '2026-11-15T18:00:00.000Z';

/** A step of a run as the list carries it: `name` in `phase`, for `reason`, said by `status` and `message`; nothing asked or spent. */
const step = (
  name: string,
  phase: RunStepStatus['phase'],
  reason: RunStepStatus['reason'],
  status: RunStepStatus['status'],
  message: string,
): RunStepStatus => ({
  name,
  phase,
  reason,
  status,
  on: null,
  via: null,
  message,
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
});

/** The three steps of a run, the first done, the second `now`, the last to come. */
const stepsAt = (now: RunStepStatus): RunStepStatus[] => [
  step('design', 'succeeded', 'Succeeded', 'verified', 'verified'),
  now,
  step('review', 'pending', 'Pending', 'pending', 'pending'),
];

/** What every run of the stories shares, `status` over its own where a run differs. */
type Shape = {
  name: string;
  brief: string;
  createdAt: string;
  steps: RunStepStatus[];
  status: Partial<Run['status']> & Pick<Run['status'], 'status' | 'phase' | 'reason' | 'moving'>;
};

/** A run of the `factory` factory as a list asked by state answers it. */
const run = ({ name, brief, createdAt, steps, status }: Shape): Run => ({
  apiVersion: 'nemia/v1',
  kind: 'Run',
  metadata: { name, namespace: 'factory', creationTimestamp: createdAt, labels: { workflow: 'build' } },
  spec: {
    steps: [],
    brief,
    place: 'git',
    repo: '/code/app',
    baseRef: 'main',
    branch: `wf/${name}/run`,
    isolate: null,
    work: null,
    workflowDir: '/code/app/workflows/build',
    try: null,
    after: [],
    context: [],
    from: null,
  },
  status: {
    on: null,
    via: null,
    cost: null,
    atWork: null,
    tokens: null,
    waiting: null,
    holding: null,
    toDecide: null,
    graph: { roots: ['design'], edges: [] },
    timeline: {
      rounds: [],
      run: {
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
      },
      slot: null,
    },
    steps,
    startedAt: createdAt,
    cancelledAt: null,
    pruned: null,
    onDisk: { worktrees: true, files: true },
    holdUntil: [],
    read: null,
    waitingOnYou: [],
    waitingOnYouWords: [],
    gates: [],
    warning: null,
    kinds: [],
    clock: null,
    ...status,
  },
});

/** A run that waits on a person: its implement step at its gate. */
const WAITING = run({
  name: 'board-stories-in-storybook-72wy',
  brief: 'board: agents build and check the look in Storybook',
  createdAt: '2026-11-15T16:10:00.000Z',
  steps: stepsAt(step('implement', 'waiting', 'AwaitingApproval', 'awaiting approval', 'awaiting approval')),
  status: {
    status: 'awaiting approval',
    phase: 'waiting',
    reason: 'AwaitingApproval',
    moving: false,
    state: 'waiting',
    wallMs: 6_600_000,
    stepCosts: null,
    waitingSince: '2026-11-15T17:40:00.000Z',
    waitingOnYou: ['implement'],
    waitingOnYouWords: ['approve implement'],
    gates: ['implement'],
  },
});

/** Two runs in flight, each at its implement step. */
const IN_FLIGHT = [
  run({
    name: 'runtime-a-session-says-its-peak-q1x8',
    brief: 'runtime: a session says its peak memory',
    createdAt: '2026-11-15T17:20:00.000Z',
    steps: stepsAt(step('implement', 'running', 'Running', 'running', 'running')),
    status: { status: 'running', phase: 'running', reason: 'Running', moving: true, state: 'inFlight', wallMs: 2_400_000 },
  }),
  run({
    name: 'docs-the-glossary-draws-each-context-p3m2',
    brief: 'docs: the glossary draws each context',
    createdAt: '2026-11-15T17:48:00.000Z',
    steps: stepsAt(step('implement', 'running', 'Checking', 'running', 'checking')),
    status: { status: 'running', phase: 'running', reason: 'Running', moving: true, state: 'inFlight', wallMs: 720_000 },
  }),
];

/** Three finished runs, newest finished first: one landed, one failed, one called off. */
const FINISHED = [
  run({
    name: 'cli-nemia-get-reads-every-kind-z9k1',
    brief: 'cli: nemia get reads every kind',
    createdAt: '2026-11-15T14:00:00.000Z',
    steps: stepsAt(step('implement', 'succeeded', 'Succeeded', 'verified', 'verified')),
    status: {
      status: 'succeeded',
      phase: 'succeeded',
      reason: 'Succeeded',
      moving: false,
      state: 'finished',
      wallMs: 5_400_000,
      finishedAt: '2026-11-15T15:30:00.000Z',
      outcome: 'succeeded',
    },
  }),
  run({
    name: 'api-a-refusal-names-its-fix-c4d7',
    brief: 'api: a refusal names its fix',
    createdAt: '2026-11-15T11:00:00.000Z',
    steps: stepsAt(step('implement', 'failed', 'CheckFailed', 'failed', 'failed (check)')),
    status: {
      status: 'failed',
      phase: 'failed',
      reason: 'Failed',
      moving: false,
      state: 'finished',
      wallMs: 3_000_000,
      finishedAt: '2026-11-15T11:50:00.000Z',
      outcome: 'failed',
    },
  }),
  run({
    name: 'feed-the-feed-reads-from-a-cursor-h2n5',
    brief: 'feed: the feed reads from a cursor',
    createdAt: '2026-11-15T09:00:00.000Z',
    steps: stepsAt(step('implement', 'stopped', 'Stopped', 'stopped', 'stopped')),
    status: {
      status: 'cancelled',
      phase: 'cancelled',
      reason: 'Cancelled',
      moving: false,
      state: 'finished',
      wallMs: 600_000,
      finishedAt: '2026-11-15T09:10:00.000Z',
      outcome: 'cancelled',
      cancelledAt: '2026-11-15T09:10:00.000Z',
    },
  }),
];

/** A RunList as the api answers a list asked by state: `items`, counted and measured to `AS_OF`. */
const listOf = (items: Run[], counts: { waiting: number; inFlight: number; finished: number }): RunList => ({
  apiVersion: 'nemia/v1',
  kind: 'RunList',
  metadata: { asOf: AS_OF, counts },
  items,
});

/** The brief of the waiting run, which a story asserts is drawn. */
export const WAITING_BRIEF = WAITING.spec.brief;

/** Whether `request` asks for the finished runs rather than those not finished. */
const asksFinished = (request: Request): boolean => new URL(request.url).searchParams.get('fieldSelector') === 'status.state=finished';

/** The page's two reads answered with a run waiting on a person, two in flight and three finished. */
export const someRuns = [
  http.get('/api/runs', ({ request }) => {
    const counts = { waiting: 1, inFlight: IN_FLIGHT.length, finished: FINISHED.length };
    return HttpResponse.json(asksFinished(request) ? listOf(FINISHED, counts) : listOf([WAITING, ...IN_FLIGHT], counts));
  }),
];

/** The page's two reads answered with no run at all. */
export const noRuns = [http.get('/api/runs', () => HttpResponse.json(listOf([], { waiting: 0, inFlight: 0, finished: 0 })))];

/** The words the api refuses the page's reads with, which the page says as they came. */
export const REFUSED_WORDS = 'the store could not be read: run nemia doctor';

/** The page's reads refused by the api, a 503 with its words. */
export const refused = [http.get('/api/runs', () => HttpResponse.json({ error: REFUSED_WORDS }, { status: 503 }))];
