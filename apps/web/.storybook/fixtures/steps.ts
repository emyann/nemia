/**
 * A run of one step, `design`, in each place a step stands, as the api's run view holds it (`RunDetail`): what a step's stories draw.
 */
import type { StepCloseout, StepTry } from '../../src/lib/api/tries';
import type { RunDetail, StepView } from '../../src/lib/runView';
import { FLAG_PNG } from './flag';

/** The instant the stories read the run at. */
export const NOW = new Date('2026-10-12T17:11:00.000Z');
const AT = '2026-10-12T17:02:00.000Z';
const ENDED = '2026-10-12T17:06:30.000Z';


export const CODES = {
  come: { phase: 'pending', reason: 'Pending', on: null, via: null, verdict: null, message: 'waiting' },
  work: { phase: 'running', reason: 'Running', on: null, via: null, verdict: null, message: 'running (working)' },
  gate: { phase: 'waiting', reason: 'AwaitingApproval', on: null, via: null, verdict: null, message: 'awaiting approval' },
  done: {
    phase: 'succeeded',
    reason: 'CheckPassed',
    on: null,
    via: null,
    verdict: { result: 'passed', exit: 0 },
    message: 'verified ✓',
  },
  refused: {
    phase: 'failed',
    reason: 'CheckFailed',
    on: null,
    via: null,
    verdict: { result: 'failed', exit: 1 },
    message: 'failed ✗ check (exit 1)',
  },
} as const;

export type Codes = (typeof CODES)[keyof typeof CODES];

/** A closeout that signed off done, with a plan's four fields and one picture. */
export const PLAN: StepCloseout = {
  outcome: 'done',
  summary: 'Parse the flag, then store it.',
  needs: null,
  apiVersion: null,
  body: 'The flag is read once, at the door, and stored beside the run.',
  values: [],
  refused: [],
  artifacts: [
    {
      path: '/wf/runs/r-1/artifacts/design/flag.png',
      relativePath: 'flag.png',
      name: 'flag.png',
      url: FLAG_PNG,
      kind: 'image',
      size: 48_213,
    },
  ],
  output: {
    approach: 'Read the flag in **one** place and hand it on.',
    files: [
      { path: 'src/flag.ts', why: 'parses it' },
      { path: 'src/run.ts', why: 'stores it' },
    ],
    steps: ['Parse', 'Store', 'Test'],
    again: false,
  },
  missing: [],
  replies: null,
  schema: {
    approach: { type: 'string' },
    files: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, why: { type: 'string' } } } },
    steps: { type: 'array', items: { type: 'string' } },
    again: { type: 'boolean', description: 'true when the plan wants another round.' },
  },
  questions: [],
  raw: { outcome: 'done', summary: 'Parse the flag, then store it.' },
};

/** What the step was filed with: its model, effort and fence. */
const FILED: StepView['filed'] = {
  model: 'opus',
  askedModel: null,
  memory: null,
  effort: 'high',
  contextTokens: 200_000,
  fence: 'auto',
  runsIn: null,
  tools: null,
  deadlineSeconds: 3600,
  remote: null,
  bridge: null,
};

/** A try of the step, its codes `codes`, ended where `ended`. */
export const tryOf = (n: number, codes: Codes, ended: boolean, closeout: StepCloseout | null, current = true) => ({
  try: n,
  round: 1,
  cause: n === 1 && !current ? 'retries' : null,
  current,
  taskId: `t-design-${n}`,
  note: null,
  phase: codes.phase,
  reason: codes.reason,
  on: codes.on,
  via: codes.via,
  message: codes.message,
  check: codes.verdict === null ? null : { name: 'check', command: 'npm test', started: null, ended: null, taskId: `t-design-${n}-check`, verdict: codes.verdict, refused: null },
  closeout,
  unreadable: null,
  answer: null,
  attempts:
    codes === CODES.come
      ? { count: 0, latest: null }
      : {
          count: 1,
          latest: {
            startedAt: AT,
            ended: ended ? 'succeeded' : null,
            endedAt: ended ? ENDED : null,
            reason: 'harness',
            release: null,
            harness: null,
          },
        },
}) satisfies StepTry;

/**
 * The step `design`, standing at `codes`, with `tries` and the closeout of its latest. Its command lines are the api's to spell: a story
 * writes each verb and its names alone.
 */
export const stepOf = (codes: Codes, tries: StepTry[], gated = false) => ({
  name: 'design',
  spec: null,
  filed: codes === CODES.come ? null : FILED,
  body: 'Design the flag.',
  told: null,
  layers: null,
  taskParts: null,
  taskId: codes === CODES.come ? null : 't-design-1',
  workspace: null,
  files: [],
  filesError: null,
  branch: null,
  ...codes,
  note: null,
  roundDue: false,
  commands: { approve: 'approve r-1 design', retry: 'retry r-1 design', say: 'say r-1 design' },
  needs: null,
  waitingFor: null,
  approve: gated ? 'approve r-1 design' : null,
  denied: null,
  sessionUnread: null,
  queuedFor: null,
  gate: null,
  lastLine: null,
  said: [],
  asked: null,
  closeout: tries.at(-1)?.closeout ?? null,
  unreadable: null,
  check: null,
  attempts: tries.at(-1)?.attempts ?? { count: 0, latest: null },
  used: null,
  spent: null,
  budget: null,
  raise: null,
  tries,
  shown: tries.at(-1)?.try ?? null,
  timeline: [],
});

/** The run `r-1` of the one step `step`, waiting on you where the step waits at its gate. */
export const runOf = (step: StepView) => ({
  id: 'r-1',
  factory: null,
  labels: {},
  kinds: [],
  refresh: 'refresh r-1',
  brief: 'Add a flag',
  decide: 'decide r-1',
  repo: '/code/app',
  place: 'git',
  work: null,
  workflowDir: '/code/app/workflow',
  workflowPage: null,
  try: null,
  baseRef: 'abc123',
  branch: 'main',
  isolate: true,
  createdAt: AT,
  startedAt: AT,
  cancelledAt: null,
  pruned: null,
  onDisk: { worktrees: true, files: true },
  after: [],
  waiting: null,
  context: [],
  holdUntil: [],
  holding: null,
  status: step.phase === 'succeeded' ? 'succeeded' : 'running',
  phase: step.phase === 'succeeded' ? 'succeeded' : 'running',
  reason: step.phase === 'succeeded' ? 'Succeeded' : 'Running',
  on: null,
  via: null,
  moving: step.phase === 'running',
  cost: null,
  atWork: null,
  tokens: null,
  read: null,
  waitingOnYou: step.approve ? ['design'] : [],
  waitingOnYouWords: step.approve ? ['design'] : [],
  toDecide: null,
  gates: [],
  warning: null,
  graph: { roots: ['design'], edges: [] },
  steps: [step],
  timeline: {
    rounds: [],
    run: {
      loop: null,
      round: null,
      tasks: 1,
      inFlight: 0,
      queuedMs: 0,
      ranMs: 0,
      wallMs: null,
      queued: '—',
      ran: '—',
      wall: 'not known',
      cost: null,
    },
  },
}) satisfies RunDetail;

/** `step` with its spend measured against a budget: the head's meter. */
export const measured = (step: StepView) => ({
  ...step,
  spent: { usd: 1.25, measured: 1, unmeasured: 0, said: '$1.25' },
  budget: { usd: 5, said: '$5', of: '$1.25 of $5', over: false },
});

/** `step` at work, with no budget, whose session has said what it spent so far, a try before it measured: $32.32 so far. */
export const spendingSoFar = (step: StepView) => ({
  ...step,
  spent: { usd: 16.06, measured: 1, unmeasured: 0, live: { usd: 16.26, at: NOW.toISOString() }, said: '$32.32 so far' },
  budget: null,
});

/**
 * `step` told in layers whose words write their headings at every depth a step's file does — a `##`, a `###` straight under the layer,
 * a `#` — and its task in parts, a run it waited on among them: what `Told` draws on its detail, opened.
 */
export const toldInLayers = (step: StepView) => ({
  ...step,
  told: null,
  layers: {
    agent: 'designer',
    instructions: '## Your role\n\nYou design the change.\n\n### What you refuse\n\nA spec with no test.',
    custom: '### Mine\n\nBe terse.',
    factory: '# The rules\n\n## Git\n\nNever push.',
    agentSkills: [],
    policy: '### true — on GitHub\n\nOpen the pull request.\n\n#### Either way\n\nMerge the base.',
    addedSkills: [],
    fence: [],
    folderFiles: true,
    task: null,
    via: 'prompt',
  },
  taskParts: [
    { kind: 'text', text: '## What was asked for\n\nA flag.' },
    { kind: 'from', run: 'r-0', asked: 'Build the cache.', body: '### Its work\n\nIt built the cache.', how: 'waited' },
  ],
}) satisfies StepView;
