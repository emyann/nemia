/**
 * The runs page's reads as the api answers them, for its stories (`Pages/Runs`): runs typed by `objects`' own `Run` and `RunList`, so a
 * key the api adds or renames fails the typecheck here before a story draws a shape the api no longer serves, and the MSW handlers a
 * story names in `parameters.msw` to answer the page's two reads (`GET /api/runs`, the runs not finished and a page of the finished,
 * told apart by their `fieldSelector`) — with none, refusing, or with the runs of the person's three target pictures.
 */
import { http, HttpResponse } from 'msw';
import type { Run, RunList, RunSpecStep, RunStepStatus } from 'objects';

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

/** A RunList as the api answers a list asked by state: `items`, counted and measured to `AS_OF`. */
const listOf = (items: Run[], counts: { waiting: number; inFlight: number; finished: number }): RunList => ({
  apiVersion: 'nemia/v1',
  kind: 'RunList',
  metadata: { asOf: AS_OF, counts },
  items,
});

/** Whether `request` asks for the finished runs rather than those not finished. */
const asksFinished = (request: Request): boolean => new URL(request.url).searchParams.get('fieldSelector') === 'status.state=finished';

/** The page's two reads answered with no run at all. */
export const noRuns = [http.get('/api/runs', () => HttpResponse.json(listOf([], { waiting: 0, inFlight: 0, finished: 0 })))];

/** The words the api refuses the page's reads with, which the page says as they came. */
export const REFUSED_WORDS = 'the store could not be read: run nemia doctor';

/** The page's reads refused by the api, a 503 with its words. */
export const refused = [http.get('/api/runs', () => HttpResponse.json({ error: REFUSED_WORDS }, { status: 503 }))];

/** A step as a run freezes it: its name, the agent it is given and, on a loop, how many rounds it may run. */
const frozen = (name: string, agent: string, rounds: number | null = null): RunSpecStep => ({
  name,
  after: [],
  input: [],
  loop: null,
  rounds,
  harness: null,
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
  agent,
});

/** The agent each step of the targets' workflows is given, as the factory's team gives it. */
const AGENTS: Record<string, string> = { design: 'Seldon', implement: 'Grace', review: 'Agora', land: 'Otto' };

/** How many rounds each looping step may run. */
const ROUNDS: Record<string, number> = { implement: 3, review: 2 };

/** An amount spent, as the api words it: `$17.00`, or `≥$5.54` where a session was not measured. */
const spent = (usd: number, unmeasured = 0): NonNullable<Run['status']['cost']> => ({
  usd,
  measured: 1,
  unmeasured,
  said: `${unmeasured > 0 ? '≥' : ''}$${usd.toFixed(2)}`,
});

/** `minutes` before `AS_OF`, as the api writes an instant. */
const before = (minutes: number): string => new Date(Date.parse(AS_OF) - minutes * 60_000).toISOString();

/** The steps of each workflow of the targets, in its order. */
const STEPS_OF = { quick: ['implement', 'review', 'land'], build: ['design', 'implement', 'review', 'land'] } as const;

/** A run of the targets: its id, title, workflow, labels, its steps (each step not named in `now` done), and its status over them. */
type Staged = {
  name: string;
  brief: string;
  workflow: keyof typeof STEPS_OF;
  labels: Record<string, string>;
  now: Record<string, RunStepStatus>;
  minutes: number | null;
  usd: number | null;
  status: Partial<Run['status']> & Pick<Run['status'], 'status' | 'phase' | 'reason' | 'moving' | 'state'>;
};

/**
 * A run of the targets, of the `nemia` factory: each of its workflow's steps verified but those `now` gives, its time at work
 * `minutes`.
 */
const staged = ({ name, brief, workflow, labels, now, minutes, usd, status }: Staged): Run => {
  const base = run({
    name,
    brief,
    createdAt: before(240),
    steps: STEPS_OF[workflow].map((step) => now[step] ?? stepOf(step, 'succeeded', 'CheckPassed', 'verified', 'verified')),
    status: {
      ...status,
      startedAt: minutes === null ? null : before(200),
      atWork: minutes === null ? null : { ms: minutes * 60_000, since: null, endedAt: before(1) },
      cost: usd === null ? null : spent(usd, name.endsWith('72wy') && status.state === 'finished' ? 1 : 0),
    },
  });
  return {
    ...base,
    metadata: { ...base.metadata, namespace: 'nemia', labels: { factory: 'nemia', workflow, ...labels } },
    spec: {
      ...base.spec,
      workflowDir: `/code/nemia/workflows/${workflow}`,
      steps: STEPS_OF[workflow].map((step) => frozen(step, AGENTS[step] ?? 'Grace', ROUNDS[step] ?? null)),
    },
  };
};

const stepOf = step;

/** `step`'s current try: its first, in round `round`. */
const tried = (status: RunStepStatus, round: number): RunStepStatus => ({
  ...status,
  current: { try: 1, round, phase: status.phase, reason: status.reason, outcome: null, verdict: status.verdict },
});

/** A step at work, its session running. */
const working = (name: string): RunStepStatus => step(name, 'running', 'Running', 'running', 'running');

/** A step still to come. */
const toCome = (name: string): RunStepStatus => step(name, 'pending', 'Pending', 'pending', 'pending');

/** A step waiting on `on`, said by `message`. */
const waitingOn = (name: string, on: RunStepStatus['on'], message: string): RunStepStatus => ({
  ...step(name, 'pending', 'Waiting', 'pending', message),
  on,
});

const IN_FLIGHT_STATE = { status: 'running', phase: 'running', reason: 'Running', moving: true, state: 'inFlight' } as const;
const WAITING_STATE = { status: 'running', phase: 'running', reason: 'Running', moving: false, state: 'waiting' } as const;

/** The run being checked that holds the checkout. */
const LGLL = staged({
  name: 'api-a-factorys-pages-stop-paying-lgll',
  brief: 'api: a factory’s pages stop paying for the whole proposals list, and the list answers in under a second',
  workflow: 'quick',
  labels: { area: 'api', work: 'fix' },
  now: { land: { ...step('land', 'running', 'Checking', 'running', 'checking'), verdict: { result: 'running', exit: null } } },
  minutes: 131,
  usd: 17,
  status: IN_FLIGHT_STATE,
});

/** The two runs whose land waits on the checkout, which lgll's land holds. */
const ON_THE_CHECKOUT = [
  staged({
    name: 'api-the-daemons-event-loop-answers-649a',
    brief: 'api: the daemon’s event loop answers a read within a few hundred milliseconds while its pass runs',
    workflow: 'quick',
    labels: { area: 'api', work: 'fix' },
    now: { land: waitingOn('land', 'base', "waiting on the checkout (lgll's land has it)") },
    minutes: 94,
    usd: 12.46,
    status: IN_FLIGHT_STATE,
  }),
  staged({
    name: 'board-the-parts-page-goes-5zt1',
    brief: 'board: the parts page goes; its tests run on Storybook’s stories, and a step looks through `storybook dev`',
    workflow: 'quick',
    labels: { area: 'board', initiative: 'visual', work: 'feature' },
    now: { land: waitingOn('land', 'base', "waiting on the checkout (lgll's land has it)") },
    minutes: 93,
    usd: 18.51,
    status: IN_FLIGHT_STATE,
  }),
];

/** A finished run of the targets, landed `ago` minutes before `AS_OF`. */
const landed = (name: string, brief: string, workflow: keyof typeof STEPS_OF, labels: Record<string, string>, ago: number, minutes: number, usd: number) =>
  staged({
    name,
    brief,
    workflow,
    labels,
    now: {},
    minutes,
    usd,
    status: {
      status: 'succeeded',
      phase: 'succeeded',
      reason: 'Succeeded',
      moving: false,
      state: 'finished',
      finishedAt: before(ago),
      outcome: 'succeeded',
    },
  });

/** The targets' five finished runs, newest finished first. */
const LANDED = [
  landed('board-the-design-system-kit-moves-yaic', 'board: the design system kit moves from 0.5.1 to its newest published release', 'quick', { area: 'board', initiative: 'visual', work: 'feature' }, 17, 53, 3.54),
  landed('factory-a-workflow-proposal-that-4i8f', 'factory: a Workflow proposal that changes no fence says same, not widens', 'quick', { area: 'factory', work: 'fix' }, 60, 41, 4.92),
  landed('board-stories-in-storybook-72wy', 'board: agents build and check the look in Storybook, not by serving the whole board', 'build', { area: 'board', initiative: 'visual', work: 'feature' }, 120, 118, 5.54),
  landed('runtime-the-spawn-again-test-40gt', 'runtime: the spawn-again test waits for the second run, and passes on every runner', 'quick', { area: 'runtime', work: 'fix' }, 180, 38, 4.04),
  landed('board-the-floor-holds-the-floor-x57v', 'board: the Floor holds the floor alone; the template moves to Settings, the proposals to a page of their own', 'quick', { area: 'board', work: 'feature' }, 240, 46, 4.76),
];

/** The run that waits on you because its land failed its check. */
const VQVD: Run = {
  ...staged({
    name: 'factory-a-workflow-proposal-keeps-vqvd',
    brief: 'factory: a Workflow proposal keeps the workflow’s needs when it is applied',
    workflow: 'quick',
    labels: { area: 'factory', work: 'fix' },
    now: { land: { ...step('land', 'failed', 'CheckFailed', 'failed', 'failed ✗ check (exit 1)'), verdict: { result: 'failed', exit: 1 } } },
    minutes: 46,
    usd: 5.58,
    status: { ...WAITING_STATE, waitingOnYou: ['land'], waitingOnYouWords: ['retry land'], waitingSince: before(6), stepCosts: null },
  }),
};

/** The run that waits on you because its design asks four questions. */
const ASKS: Run = staged({
  name: 'board-stories-in-storybook-72wy',
  brief: 'board: agents build and check the look in Storybook, not by serving the whole board',
  workflow: 'build',
  labels: { area: 'board', initiative: 'visual', work: 'feature' },
  now: {
    design: { ...step('design', 'waiting', 'AwaitingAnswer', 'blocked', 'succeeded · BLOCKED'), via: 'closeout' },
    implement: toCome('implement'),
    review: toCome('review'),
    land: toCome('land'),
  },
  minutes: 5,
  usd: 2.16,
  status: { ...WAITING_STATE, waitingOnYou: ['design'], waitingOnYouWords: ['answer design'], waitingSince: before(5), stepCosts: null },
});

/** A run at work on implement, its second round of three, $2.40 spent of its $12. */
const AT_WORK = staged({
  name: 'cli-apps-cli-is-the-apis-only-1sw7',
  brief: 'cli: apps/cli is the api’s only consumer — every verb moves to the client',
  workflow: 'build',
  labels: { area: 'cli', initiative: 'one-api-client', work: 'feature' },
  now: {
    implement: {
      ...tried(working('implement'), 2),
      budget: { usd: 12, said: '$12', of: '$2.40 of $12', over: false },
      spent: spent(2.4),
    },
    review: toCome('review'),
    land: toCome('land'),
  },
  minutes: 62,
  usd: 4.12,
  status: IN_FLIGHT_STATE,
});

/** A run at work on review, its last round, past its step's $6 cap. */
const OVER_ITS_CAP = staged({
  name: 'board-a-held-runs-steps-wov8',
  brief: 'board: a held run’s steps that have not started are drawn as not started',
  workflow: 'quick',
  labels: { area: 'board', work: 'fix' },
  now: {
    review: { ...tried(working('review'), 2), budget: { usd: 6, said: '$6', of: '$6.30 of $6', over: true }, spent: spent(6.3) },
    land: toCome('land'),
  },
  minutes: 52,
  usd: 11.8,
  status: IN_FLIGHT_STATE,
});

/** A run whose land waits on lgll. */
const ON_A_RUN: Run = (() => {
  const waits = ON_THE_CHECKOUT[0];
  return {
    ...waits,
    status: {
      ...waits.status,
      steps: waits.status.steps.map((s) => (s.name === 'land' ? waitingOn('land', 'run', `waiting on ${LGLL.metadata.name}`) : s)),
      waiting: {
        runs: [{ run: LGLL.metadata.name, missing: false, cancelledAt: null, gone: [] }],
        word: `waiting on ${LGLL.metadata.name}`,
        advice: '',
        waitingOnYou: false,
      },
    },
  };
})();

/** A run whose implement waits for a run slot. */
const FOR_A_SLOT = staged({
  name: 'factory-a-factorys-schedule-k2rq',
  brief: 'factory: a factory’s schedule starts its card on the hour it names',
  workflow: 'quick',
  labels: { area: 'factory', work: 'feature' },
  now: {
    implement: waitingOn('implement', 'limit', 'waiting for a run slot (2 of 2 in flight)'),
    review: toCome('review'),
    land: toCome('land'),
  },
  minutes: null,
  usd: null,
  status: { ...IN_FLIGHT_STATE, moving: false },
});

/** A run a person holds until 1sw7 lands. */
const HELD = staged({
  name: 'cli-the-rest-of-the-move-c7un',
  brief: 'cli: the rest of the move — every store verb left goes to the client',
  workflow: 'build',
  labels: { area: 'cli', initiative: 'one-api-client', work: 'feature' },
  now: { design: toCome('design'), implement: toCome('implement'), review: toCome('review'), land: toCome('land') },
  minutes: null,
  usd: null,
  status: {
    ...IN_FLIGHT_STATE,
    moving: false,
    holding: {
      at: before(30),
      runs: [{ run: AT_WORK.metadata.name, missing: false, cancelledAt: null, gone: [], landed: false }],
      word: `held until ${AT_WORK.metadata.name} lands`,
      advice: '',
      waitingOnYou: false,
    },
  },
});

/** The finished runs' count of the targets, of which a page shows the five. */
const FINISHED_COUNT = 123;

/** A RunList of the finished runs, its next page's token given, as the api answers the first page of many. */
const finishedOf = (counts: { waiting: number; inFlight: number; finished: number }): RunList => ({
  ...listOf(LANDED, counts),
  metadata: { asOf: AS_OF, counts, continue: 'f.older' },
});

/** The page's reads answered with `open`, the runs not finished, and the targets' finished runs. */
const answering = (open: Run[], counts: { waiting: number; inFlight: number; finished: number }) => [
  http.get('/api/runs', ({ request }) =>
    HttpResponse.json(asksFinished(request) ? finishedOf(counts) : listOf(open, counts)),
  ),
];

/** A run whose implement failed, waiting on nobody: the targets have none, and a part's story draws it. */
const FAILED_RUN = staged({
  name: 'runtime-a-session-says-its-peak-f41l',
  brief: 'runtime: a session says its peak memory',
  workflow: 'quick',
  labels: { area: 'runtime', work: 'fix' },
  now: { implement: step('implement', 'failed', 'Failed', 'failed', 'failed'), review: toCome('review'), land: toCome('land') },
  minutes: 12,
  usd: 1.2,
  status: IN_FLIGHT_STATE,
});

/** The runs of the targets, each by its id's last four characters, as the api answers them: what a part's story and a page's assert on. */
export const TARGET_RUNS = {
  lgll: LGLL,
  '649a': ON_THE_CHECKOUT[0],
  '5zt1': ON_THE_CHECKOUT[1],
  vqvd: VQVD,
  '72wy': ASKS,
  '1sw7': AT_WORK,
  wov8: OVER_ITS_CAP,
  onLgll: ON_A_RUN,
  k2rq: FOR_A_SLOT,
  c7un: HELD,
  f41l: FAILED_RUN,
} as const;

/** Nothing waits on you: three runs in flight, lgll being checked and two waiting on the checkout it holds; five finished of 123. */
export const nothingWaits = answering([LGLL, ...ON_THE_CHECKOUT], { waiting: 0, inFlight: 3, finished: FINISHED_COUNT });

/** The same, with one run waiting on you, its land failed its check. */
export const oneWaits = answering([VQVD, LGLL, ...ON_THE_CHECKOUT], { waiting: 1, inFlight: 3, finished: FINISHED_COUNT });

/** A row in each state in flight, and a card of each kind of wait on you: one that asks questions, one whose check failed. */
export const everyState = answering(
  [ASKS, VQVD, AT_WORK, OVER_ITS_CAP, LGLL, ON_A_RUN, FOR_A_SLOT, HELD],
  { waiting: 2, inFlight: 6, finished: FINISHED_COUNT },
);
