import type { CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { StepCloseout, StepTry } from '@/lib/api/tries';
import type { RunDetail, StepView } from '@/lib/runView';
import type { PartSize } from '@/lib/stepPart';
import { StepPart } from './StepPart';

/**
 * A step's part at each of its three sizes — the graph's node (S), the preview card (M) and whole (L) — in each of the five places a
 * step stands: to come, at work, waiting on you, done, and tried again after its check failed it.
 */
const meta: Meta = { title: 'Board/StepPart' };
export default meta;

/** The instant the stories read the run at. */
const NOW = new Date('2026-10-12T17:11:00.000Z');
const AT = '2026-10-12T17:02:00.000Z';
const ENDED = '2026-10-12T17:06:30.000Z';

/** A client that asks the api nothing: a story draws what its run holds, and a read it would make waits. */
const client = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });

const CODES = {
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

type Codes = (typeof CODES)[keyof typeof CODES];

/** A closeout that signed off done, with a plan's four fields and one picture. */
const PLAN: StepCloseout = {
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
      name: 'flag.png',
      url: 'https://placehold.co/480x360/png',
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
const tryOf = (n: number, codes: Codes, ended: boolean, closeout: StepCloseout | null, current = true): StepTry => ({
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
  check: codes.verdict === null ? null : { command: 'npm test', taskId: `t-design-${n}-check`, verdict: codes.verdict, refused: null },
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
});

/**
 * The step `design`, standing at `codes`, with `tries` and the closeout of its latest. Its command lines are the api's to spell: a story
 * writes each verb and its names alone.
 */
const stepOf = (codes: Codes, tries: StepTry[], gated = false): StepView => ({
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
  shown: tries.at(-1)?.try ?? 1,
  timeline: [],
});

/** The run `r-1` of the one step `step`, waiting on you where the step waits at its gate. */
const runOf = (step: StepView): RunDetail => ({
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
});

const RUNS = {
  toCome: runOf(stepOf(CODES.come, [tryOf(1, CODES.come, false, null)])),
  atWork: runOf(stepOf(CODES.work, [tryOf(1, CODES.work, false, null)])),
  waitsOnYou: runOf(stepOf(CODES.gate, [tryOf(1, CODES.gate, true, PLAN)], true)),
  done: runOf(stepOf(CODES.done, [tryOf(1, CODES.done, true, PLAN)])),
  tryAgain: runOf(
    stepOf(CODES.work, [tryOf(1, CODES.refused, true, { ...PLAN, summary: 'A first plan.' }, false), tryOf(2, CODES.work, false, null)]),
  ),
} as const;

const ROW: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 32 };
const WHOLE: CSSProperties = { maxWidth: 880 };

/** The step's part at each size: S and M side by side, L under them. */
function Sizes({ run }: { run: RunDetail }) {
  const at = (size: PartSize) => <StepPart view={run} step="design" size={size} now={NOW} />;
  return (
    <QueryClientProvider client={client}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        <div style={ROW}>
          {at('S')}
          {at('M')}
        </div>
        <div style={WHOLE}>{at('L')}</div>
      </div>
    </QueryClientProvider>
  );
}

/** A step to come: when it starts, nothing said and nothing given yet. */
export const ToCome: StoryObj = { render: () => <Sizes run={RUNS.toCome} /> };

/** A step at work: its session running, nothing given yet. */
export const AtWork: StoryObj = { render: () => <Sizes run={RUNS.atWork} /> };

/** A step at its gate: what it asks of you first, then what it said and gave. */
export const WaitsOnYou: StoryObj = { render: () => <Sizes run={RUNS.waitsOnYou} /> };

/** A step done: what it said, then each field it gave by its widget, its picture a thumbnail. */
export const Done: StoryObj = { render: () => <Sizes run={RUNS.done} /> };

/** A step tried again after its check failed the first try: the picker of its tries, the second at work. */
export const TryAgain: StoryObj = { render: () => <Sizes run={RUNS.tryAgain} /> };
