import type { WaitingRun } from '@/lib/api/runs';

/** The instant the stories' answer was read at. */
export const AS_OF = new Date('2026-10-12T17:11:00.000Z');

/** The codes and the words of a step verified by its check, of one at its gate, and of one that signed off blocked on a person's answer. */
const VERIFIED = {
  phase: 'succeeded',
  reason: 'CheckPassed',
  on: null,
  via: null,
  message: 'verified ✓',
  verdict: { result: 'passed', exit: 0 },
} as const;
const APPROVAL = {
  phase: 'waiting',
  reason: 'AwaitingApproval',
  on: null,
  via: null,
  message: 'awaiting approval',
  verdict: null,
} as const;
const BLOCKED = {
  phase: 'waiting',
  reason: 'AwaitingAnswer',
  on: null,
  via: 'closeout',
  message: 'succeeded · BLOCKED',
  verdict: null,
} as const;

/** A step of `RUN`, by its name and its codes, with nothing a person is asked. */
const step = (name: string, codes: typeof VERIFIED | typeof APPROVAL | typeof BLOCKED, i: number) => ({
  name,
  ...codes,
  raise: null,
  timeline: [],
  filed: null,
  spec: null,
  taskId: `t-${i}`,
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
  queuedFor: null,
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

/** A run at its last gate, its title long enough to run over the copy control under it on one line of the wide card. */
export const RUN: WaitingRun = {
  labels: {},
  id: 'lay-the-diamond-top-e2e4',
  repo: '/code/app',
  factory: 'nemia',
  place: 'git',
  work: null,
  brief: 'A title that runs over the copy control of its card',
  workflowDir: '/code/app/workflows/dev',
  try: null,
  baseRef: null,
  branch: null,
  isolate: null,
  createdAt: '2026-10-12T15:02:00.000Z',
  startedAt: '2026-10-12T15:02:00.000Z',
  cancelledAt: null,
  pruned: null,
  onDisk: { worktrees: true, files: true },
  read: null,
  gates: [{ step: 'land' }],
  warning: null,
  kinds: [],
  after: [],
  context: [],
  waiting: null,
  holdUntil: [],
  holding: null,
  assignee: null,
  status: 'awaiting approval',
  phase: 'waiting',
  reason: 'AwaitingApproval',
  on: null,
  via: null,
  moving: false,
  cost: null,
  atWork: null,
  tokens: null,
  steps: [step('design', VERIFIED, 0), step('implement', VERIFIED, 1), step('review', VERIFIED, 2), step('land', APPROVAL, 3)],
  graph: {
    roots: ['design'],
    edges: [
      { from: 'design', to: 'implement', kind: 'after' },
      { from: 'implement', to: 'review', kind: 'after' },
      { from: 'review', to: 'land', kind: 'after' },
      { from: 'review', to: 'implement', kind: 'loop', rounds: 3 },
    ],
  },
  waitingOnYou: ['land'],
  waitingOnYouWords: ['approve land'],
  toDecide: null,
  timeline: {
    rounds: [],
    run: {
      loop: null,
      round: null,
      tasks: 4,
      inFlight: 0,
      queuedMs: 0,
      ranMs: 0,
      wallMs: null,
      queued: '0s',
      ran: '0s',
      wall: '0s',
      cost: null,
    },
  },
  wallMs: 7_740_000,
  finishedAt: null,
  clock: null,
  stepCosts: null,
  waitingSince: '2026-10-12T16:40:00.000Z',
};

/** The step whose name runs long: longer than a narrow card's foot holds beside Open the run. */
export const LONG_STEP = 'review-the-security-of-the-change';

/** `RUN` with its last step, at its gate, named `LONG_STEP`: the button says Approve all the same. */
export const LONG_APPROVAL: WaitingRun = {
  ...RUN,
  gates: [{ step: LONG_STEP }],
  steps: [...RUN.steps.slice(0, 3), step(LONG_STEP, APPROVAL, 3)],
  graph: {
    roots: ['design'],
    edges: [...RUN.graph.edges.filter((e) => e.to !== 'land'), { from: 'review', to: LONG_STEP, kind: 'after' }],
  },
  waitingOnYou: [LONG_STEP],
  waitingOnYouWords: [`approve ${LONG_STEP}`],
};

/** `RUN` with its last step signed off blocked on a person's answer, at no gate: the button says Answer. */
export const ANSWER: WaitingRun = {
  ...RUN,
  gates: [],
  status: 'waiting',
  reason: 'AwaitingAnswer',
  via: 'closeout',
  steps: [...RUN.steps.slice(0, 3), step('land', BLOCKED, 3)],
  waitingOnYouWords: ['answer land'],
};
