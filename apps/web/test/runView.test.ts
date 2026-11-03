/**
 * The board's view of a run (`src/lib/runView.ts`), composed from the run object, each step's tries and what it was told, and the run's
 * lines: a step's closeout is its current try's, its spec the frozen step of its name, its lines the api's, and the graph has no `input`
 * edge. And the stamp a step's tries and told are keyed by (`stepStamp`, `src/lib/lifecyclePath.ts`), which moves when the step moves
 * and with nothing else.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RunObject } from '../src/lib/api.ts';
import type { RunLines } from '../src/lib/api/run.ts';
import { runViewOf } from '../src/lib/runView.ts';
import { stepStamp } from '../src/lib/lifecyclePath.ts';

/** The time of no task yet, as a run's timeline totals it. */
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

/** A step as the run froze it, waiting on `after`, with its fence set. */
const frozen = (name: string, after: string[]): RunObject.RunSpecStep => ({
  name,
  after,
  input: after,
  loop: null,
  rounds: null,
  harness: 'claude',
  model: `${name}-model`,
  effort: null,
  context: null,
  workspace: null,
  place: null,
  resume: null,
  fence: 'acceptEdits',
  sandbox: null,
  tools: null,
  deadlineSeconds: null,
});

/** A step as the object's status says one: not filed yet, unless `extra` says otherwise. */
const stepStatus = (name: string, extra: Partial<RunObject.RunStepStatus> = {}): RunObject.RunStepStatus => ({
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
  accepted: null,
  said: [],
  asked: null,
  check: null,
  attempts: { count: 0, latest: null },
  used: null,
  spent: null,
  budget: null,
  ...extra,
});

/** A run of two steps, the second waiting on the first and handed its output; the first filed and on its second try. */
const object = (): RunObject.Run => ({
  apiVersion: 'nemia/v1',
  kind: 'Run',
  metadata: { name: 'r-1', creationTimestamp: '2026-11-02T10:00:00.000Z', labels: { workflow: 'quick' } },
  spec: {
    steps: [frozen('implement', []), frozen('review', ['implement'])],
    brief: 'a brief',
    place: 'git',
    repo: '/repo',
    baseRef: 'abc123',
    branch: 'main',
    isolate: true,
    work: null,
    workflowDir: '/team/quick',
    try: null,
    after: [],
    context: [],
    from: null,
  },
  status: {
    status: 'running',
    phase: 'running',
    reason: 'Running',
    on: null,
    via: null,
    moving: true,
    cost: null,
    atWork: null,
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
        attempts: { count: 1, latest: null },
        current: { try: 2, round: 1, phase: 'running', reason: 'Running', outcome: null, verdict: null },
        filed: {
          model: 'm',
          askedModel: null,
          effort: null,
          contextTokens: null,
          fence: 'bypassPermissions',
          runsIn: null,
          remote: null,
          bridge: null,
          tools: null,
          deadlineSeconds: null,
        },
      }),
      stepStatus('review'),
    ],
    startedAt: '2026-11-02T10:00:01.000Z',
    cancelledAt: null,
    pruned: null,
    onDisk: { worktrees: true, files: false },
    holdUntil: [],
    read: null,
    waitingOnYou: [],
    waitingOnYouWords: [],
    gates: [],
    warning: null,
    kinds: [],
  },
});

/** A closeout that says `summary`. */
const closeout = (summary: string): RunObject.StepCloseout => ({
  apiVersion: null,
  outcome: 'done',
  summary,
  body: null,
  needs: null,
  artifacts: [],
  values: [],
  refused: [],
  output: {},
  missing: [],
  replies: null,
  schema: {},
  questions: [],
  raw: null,
});

/** Try `n` of a step, current or not, signed off with `summary`. */
const tried = (n: number, current: boolean, summary: string): RunObject.StepTry => ({
  try: n,
  round: 1,
  cause: n === 1 ? null : 'retries',
  current,
  taskId: `r-1-implement-${n}`,
  note: null,
  phase: current ? 'running' : 'failed',
  reason: current ? 'Running' : 'Failed',
  on: null,
  via: null,
  message: current ? 'running' : 'failed',
  attempts: { count: 1, latest: null },
  check: null,
  closeout: closeout(summary),
  unreadable: null,
  answer: null,
});

const lines = (): RunLines => ({
  decide: 'nemia decide r-1',
  refresh: 'nemia refresh r-1',
  fromNote: null,
  steps: {
    implement: { approve: 'nemia approve r-1 implement', retry: 'nemia retry r-1 implement', say: 'nemia say r-1 implement' },
    review: { approve: 'nemia approve r-1 review', retry: 'nemia retry r-1 review', say: 'nemia say r-1 review' },
  },
  workflowPage: { from: 'repo', workflow: 'quick', factory: null, repo: null },
});

const told: RunObject.StepTold = { body: 'Implement it.', told: 'the whole brief', layers: null, taskParts: null };

/** The view of the sample run: the first step's two tries, the current one last, and what it was told; the second step's none. */
const view = () =>
  runViewOf(
    object(),
    lines(),
    { implement: [tried(1, false, 'the first try'), tried(2, true, 'the current try')], review: [] },
    { implement: told, review: null },
  );

test('runViewOf: the run object, its sub-resources and its lines, as the run page reads them', async (t) => {
  await t.test("a step's closeout is the closeout of its current try, not of the first", () => {
    const [implement] = view().steps;
    assert.equal(implement?.closeout?.summary, 'the current try');
    assert.equal(implement?.tries.length, 2, 'every try is kept, the current one last');
  });
  await t.test("a step's spec is the frozen step of its name, with its fence; null for a name not frozen", () => {
    const [implement, review] = view().steps;
    assert.equal(implement?.spec?.model, 'implement-model');
    assert.equal(review?.spec?.model, 'review-model');
    assert.equal(implement?.spec?.fence, 'acceptEdits');
    assert.equal(implement?.filed?.fence, 'bypassPermissions', 'and so is the fence it was filed with');
    const unfrozen = object();
    const ran = runViewOf(
      { ...unfrozen, spec: { ...unfrozen.spec, steps: [frozen('implement', [])] } },
      lines(),
      { implement: [], review: [] },
      { implement: told, review: null },
    );
    assert.equal(ran.steps[1]?.spec, null, 'a step the run froze none of has no spec');
  });
  await t.test("a step's lines and the run's are the api's lines, never composed on the board", () => {
    const v = view();
    assert.deepEqual(v.steps[0]?.commands, lines().steps.implement);
    assert.deepEqual(v.steps[1]?.commands, lines().steps.review);
    assert.equal(v.decide, 'nemia decide r-1');
    assert.equal(v.refresh, 'nemia refresh r-1');
    assert.deepEqual(v.workflowPage, lines().workflowPage);
  });
  await t.test('the graph holds no `input` edge: the page draws what a step waits on and its loops', () => {
    assert.deepEqual(view().graph.edges, [{ from: 'implement', to: 'review', kind: 'after' }]);
  });
  await t.test('what a step was told is read off its told, and a step with none read is told nothing, without a throw', () => {
    const [implement, review] = view().steps;
    assert.equal(implement?.body, 'Implement it.');
    assert.equal(implement?.told, 'the whole brief');
    assert.equal(review?.told, null);
    assert.equal(review?.closeout, null);
  });
  await t.test('the run reads as its object says it: its id, brief, and where it came from only when it came from a card', () => {
    const v = view();
    assert.equal(v.id, 'r-1');
    assert.equal(v.createdAt, '2026-11-02T10:00:00.000Z');
    assert.equal('fromNote' in v, false);
    const card = object();
    const from = runViewOf(
      { ...card, spec: { ...card.spec, from: { inbox: 'c-1' } } },
      { ...lines(), fromNote: 'from inbox card c-1' },
      {},
      {},
    );
    assert.equal(from.fromNote, 'from inbox card c-1');
    assert.deepEqual(from.from, { inbox: 'c-1' });
  });
});

test("stepStamp: a step's tries and told are read again when it moves, and with nothing else", async (t) => {
  const step = object().status.steps[0];
  const stamp = stepStamp(step);
  await t.test('its current try ending, and a try more, each move the stamp', () => {
    assert.notEqual(stepStamp({ ...step, current: { ...step.current!, outcome: 'done' } }), stamp, 'the current try signed off');
    assert.notEqual(stepStamp({ ...step, attempts: { ...step.attempts, count: 2 } }), stamp, 'an attempt more');
    assert.notEqual(stepStamp({ ...step, taskId: 'r-1-implement-3' }), stamp, 'another task');
    assert.notEqual(stepStamp({ ...step, current: null }), stamp, 'no try');
  });
  await t.test('REFUSED: what it cost, and what a person said to it, move no stamp', () => {
    assert.equal(stepStamp({ ...step, spent: { usd: 1, measured: 1, unmeasured: 0, said: '$1.00' } }), stamp);
    assert.equal(stepStamp({ ...step, said: [{ at: '2026-11-02T10:01:00.000Z', attempt: 1, text: 'hello' }] }), stamp);
  });
});
