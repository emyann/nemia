/**
 * A run's page's reads as the api answers them, every key the board reads and each union in its shapes: a run's detail (`detail`, its
 * steps from `step`), a run's row in a list (`summary`), its decision (`decidable`), a step's conversation (`transcript`) and its try's
 * path (`stepPath`). Each takes keys to put over its own.
 */
import type {
  Decidable,
  ListedRun,
  RunDetail,
  RunSummary,
  WaitingRun,
  StepPath,
  StepTranscript,
  StepUsed,
  TimelineTotal,
} from '../src/lib/api.ts';

type Step = RunDetail['steps'][number];

/** What a try's session consumed, measured in part: a count nobody measured is absent. */
export const used = (extra: Partial<StepUsed> = {}): StepUsed => ({
  usage: { turns: 12, costUsd: 1.25, inputTokens: 9_000 },
  used: '12 turns',
  cost: '$1.25',
  costUsd: 1.25,
  apiMs: 42_000,
  toolMs: null,
  read: 'read 21.4M · wrote 412k · peak 167k',
  peak: 'large',
  rebuilt: 0,
  ...extra,
});

/** The run's time on the clock, or a round's with `loop`. */
const total = (extra: Partial<TimelineTotal> = {}): TimelineTotal => ({
  loop: null,
  round: null,
  tasks: 2,
  inFlight: 0,
  queuedMs: 1_000,
  ranMs: 60_000,
  wallMs: 61_000,
  queued: '1s',
  ran: '1m',
  wall: '1m 1s',
  cost: { usd: 1.25, measured: 1, unmeasured: 0, said: '$1.25' },
  ...extra,
});

/** A step of a run's detail signed off after a try replaced by a nudge: a closeout naming each kind of file, a check that refused. */
export const step = (extra: Partial<Step> = {}): Step => ({
  name: 'implement',
  spec: {
    harness: 'claude',
    model: 'opus',
    effort: 'high',
    context: null,
    after: ['design'],
    workspace: null,
    place: null,
    resume: null,
    permissionMode: 'dontAsk',
    sandbox: null,
    tools: ['Read', 'Edit'],
    deadlineSeconds: 3600,
    loop: null,
    rounds: null,
  },
  filed: {
    model: 'opus',
    askedModel: null,
    effort: 'high',
    contextTokens: null,
    permissionMode: 'dontAsk',
    runsIn: { mode: 'dontAsk', by: 'filed' },
    tools: null,
    deadlineSeconds: 3600,
    remote: { name: 'far', address: 'https://far.example/a2a' },
    bridge: null,
  },
  body: 'Build it.',
  told: null,
  layers: null,
  taskParts: null,
  taskId: 't-2',
  workspace: '/work/tree',
  files: [{ path: 'out/report.md', name: 'report.md', url: '/api/runs/r-1/steps/implement/files/report.md', kind: 'text', size: 12 }],
  filesError: null,
  branch: 'wf/r-1/implement',
  status: 'failed (check)',
  note: 'try 2',
  roundDue: false,
  commands: { approve: 'nemia approve r-1 implement', retry: 'nemia retry r-1 implement', say: 'nemia say r-1 implement' },
  needs: null,
  blockedByHarness: false,
  waitingFor: null,
  approve: 'approve implement',
  denied: { words: 'denied: Skill(look)', calls: ['Skill(look)'] },
  sessionUnread: null,
  gate: { awaiting: false, approval: { try: 2, at: '2026-09-30T05:10:00.000Z', message: 'Go.' } },
  accepted: { try: 2, at: '2026-09-30T05:11:00.000Z', message: 'Good enough.' },
  lastLine: null,
  said: [{ at: '2026-09-30T05:05:00.000Z', attempt: 1, text: 'Widen it.', after: null }],
  asked: { try: 3, mode: 'recheck', model: null, message: null, stopFirst: false },
  closeout: {
    outcome: 'done',
    summary: 'Built.',
    needs: null,
    apiVersion: null,
    body: null,
    values: [],
    refused: [],
    artifacts: [
      { path: 'shot.png', name: 'shot.png', url: '/api/runs/r-1/steps/implement/files/shot.png', kind: 'image', size: 2048 },
      { path: 'old.log', pruned: 'removed by wf prune --artifacts', prunedAt: '2026-09-30T06:00:00.000Z' },
      { path: 'RESPONSE.md' },
    ],
    output: { notes: [], noNotes: 'none' },
    missing: ['replies'],
    replies: [{ finding: 'a.ts:1', answer: 'fixed', why: 'Cut.' }],
    schema: { notes: { type: 'array' } },
    questions: [
      {
        field: 'open',
        questions: [{ title: 'Which?', body: 'Pick.', options: [{ label: 'A', meaning: 'the first' }], recommended: 'A', multiple: false }],
      },
    ],
    raw: { outcome: 'done' },
  },
  unreadable: null,
  check: {
    command: 'npm test',
    taskId: 't-3',
    verdict: 'exit 1',
    refused: { exit: 'exit 1', stdout: null, stderr: { lines: ['boom'], truncated: false }, unreadable: null },
  },
  attempts: {
    count: 1,
    latest: { startedAt: '2026-09-30T05:02:00.000Z', ended: 'exited', endedAt: '2026-09-30T05:09:00.000Z', reason: null },
  },
  used: used(),
  spent: { usd: 1.25, measured: 1, unmeasured: 0, said: '$1.25' },
  budget: { usd: 3, said: '$3', of: '$1.25 of $3', over: false },
  raise: { by: 'retry', above: 1.25, said: 'raise it', modes: ['nudge', 'fresh', 'recheck'], own: 'failed (check)' },
  tries: [
    {
      try: 1,
      round: 1,
      then: 'nudge',
      current: false,
      taskId: 't-1',
      note: null,
      status: 'failed',
      attempts: { count: 1, latest: null },
      check: null,
      closeout: null,
      unreadable: { error: 'no closeout', raw: 'what it said' },
      answer: 'try harder',
    },
    {
      try: 2,
      round: 1,
      then: null,
      current: true,
      taskId: 't-2',
      note: 'nudged',
      status: 'failed (check)',
      attempts: { count: 1, latest: null },
      check: { command: 'npm test', taskId: 't-3', verdict: 'exit 1', refused: null },
      closeout: null,
      unreadable: null,
      answer: null,
    },
  ],
  timeline: [
    {
      try: 1,
      round: 1,
      session: {
        taskId: 't-1',
        at: 'ended',
        filedAt: '2026-09-30T05:01:00.000Z',
        spawnedAt: '2026-09-30T05:02:00.000Z',
        endedAt: '2026-09-30T05:03:00.000Z',
        attempts: 1,
        queuedMs: 60_000,
        ranMs: 60_000,
        queued: '1m',
        ran: '1m',
      },
      sessionOf: null,
      check: null,
      used: null,
    },
    { try: 2, round: 1, session: null, sessionOf: 1, check: null, used: used({ usage: null, peak: null }) },
  ],
  ...extra,
});

/** A run's detail, as `GET /api/runs/r-1` answers it: from an inbox card, pruned, waiting and held, its steps `step`'s. */
export const detail = (extra: Partial<RunDetail> = {}): RunDetail => ({
  id: 'r-1',
  brief: 'Decode the reads',
  decide: 'nemia decide r-1',
  repo: '/work/repo',
  place: 'repository',
  work: null,
  workflowDir: '/work/workflows/build',
  workflowPage: null,
  try: null,
  baseRef: 'abc123',
  branch: 'main',
  isolate: true,
  createdAt: '2026-09-30T05:00:00.000Z',
  startedAt: '2026-09-30T05:01:00.000Z',
  cancelledAt: null,
  pruned: {
    at: '2026-09-30T06:00:00.000Z',
    worktrees: [{ path: '/work/tree', bytes: 1024 }],
    artifacts: { at: '2026-09-30T06:00:00.000Z', bytes: 2048 },
  },
  onDisk: { worktrees: false, files: true },
  after: ['r-0'],
  from: { inbox: 'decode-reads' },
  fromNote: 'from the inbox card decode-reads',
  waiting: {
    runs: [{ run: 'r-0', missing: false, cancelledAt: null, gone: [] }],
    word: 'waiting on r-0',
    advice: 'wait',
    onYou: false,
  },
  context: [],
  heldUntil: ['r-0'],
  holding: {
    at: '2026-09-30T05:00:00.000Z',
    runs: [{ run: 'r-0', missing: false, cancelledAt: null, gone: [], shipped: false }],
    word: 'held until r-0 ships',
    advice: 'wf hold r-1 --off',
    onYou: true,
  },
  status: 'running',
  moving: true,
  cost: { usd: 1.25, measured: 1, unmeasured: 0, said: '$1.25' },
  atWork: null,
  tokens: null,
  read: { said: 'read 21.4M', peak: 'cap', rebuilt: 1 },
  waitingOnYou: ['implement'],
  onYou: ['approve implement'],
  toDecide: { kind: 'result', branches: ['wf/r-1/implement'], said: 'merge', command: 'git merge' },
  gates: ['implement'],
  warning: null,
  kinds: [],
  refresh: 'nemia refresh r-1',
  graph: {
    roots: ['implement'],
    edges: [
      { from: 'implement', to: 'review', kind: 'after' },
      { from: 'review', to: 'implement', kind: 'loop', rounds: 3 },
    ],
  },
  steps: [step()],
  timeline: { rounds: [total({ loop: 'review', round: 1 })], run: total() },
  ...extra,
});

/** A run's decision with every fact of it: a branch in each standing, a radius and a git error, a sensitive diff. */
export const decidable = (extra: Partial<Decidable> = {}): Decidable => ({
  standings: [
    { branch: 'wf/r-1/a', where: 'on', said: 'on main', stat: null, merge: null },
    {
      branch: 'wf/r-1/b',
      where: 'ahead',
      commits: 2,
      said: 'ahead by 2',
      stat: '2 files: +3 −1',
      merge: { clean: false, conflicts: ['a.ts'], said: 'conflicts in a.ts' },
    },
    { branch: 'wf/r-1/c', where: 'ahead', commits: 1, said: 'ahead by 1', stat: null, merge: { clean: true, said: 'merges clean' } },
    { branch: 'wf/r-1/d', where: 'ahead', commits: 1, said: 'ahead by 1', stat: null, merge: { error: 'no git', said: 'cannot tell' } },
    { branch: 'wf/r-1/e', where: 'gone', said: 'gone', stat: null, merge: null },
    {
      branch: 'wf/r-1/f',
      where: 'unread',
      why: 'the place was not heard: timed out',
      said: 'wf/r-1/f: where it stands is not read (the place was not heard: timed out)',
      stat: null,
      merge: null,
    },
  ],
  touched: [
    {
      branch: 'wf/r-1/b',
      radius: {
        changes: [
          { path: 'a.ts', added: 2, removed: 1 },
          { path: 'b.png', from: 'old.png', added: null, removed: null },
        ],
        groups: [{ name: '(root)', files: 2, added: 2, removed: 1, binary: 1 }],
        agentFacing: ['CLAUDE.md'],
        checkAffecting: ['package.json'],
        lessons: [{ path: 'CLAUDE.md', added: 2, removed: 0 }],
      },
    },
    { branch: 'wf/r-1/e', radius: { error: 'no such branch' } },
  ],
  lesson: { said: 'CLAUDE.md +2 −0', state: 'written' },
  sensitive: [{ branch: 'wf/r-1/b', files: [{ path: 'package.json', lines: ['+x'], cut: 0 }], error: null }],
  used: { implement: used() },
  total: used(),
  cost: '$1.25',
  overBudget: null,
  commands: [{ label: 'ship it', command: 'git merge wf/r-1/b', said: null, step: null }],
  awaiting: { branches: ['wf/r-1/b'], direct: false },
  collisions: {
    onto: 'main',
    base: [
      { branch: 'wf/r-1/b', clean: false, conflicts: ['a.ts'], said: 'conflicts in a.ts' },
      { branch: 'wf/r-1/c', clean: true, said: 'merges clean' },
      { branch: 'wf/r-1/d', error: 'no git', said: 'cannot tell' },
    ],
    inFlight: ['r-2', 'r-3', 'r-4'],
    colliding: [
      { run: 'r-2', branch: 'wf/r-2/x', ours: 'wf/r-1/b', merge: { clean: false, conflicts: ['a.ts'] }, said: "conflicts with r-2's x" },
      { run: 'r-4', branch: 'wf/r-4/x', ours: 'wf/r-1/c', merge: { error: 'no git' }, said: "whether it merges onto r-4's x is not known" },
    ],
    semantic: { step: 'ship', check: 't-check', sha: 'b'.repeat(40), said: "ship's landing check refused the merged tree" },
    said: 'collides with 1 of the 3 runs in flight on main: r-2; whether it collides with r-4 is not known',
  },
  ...extra,
});

/** A step's conversation: a line said, a tool called and its result. */
export const transcript = (extra: Partial<StepTranscript> = {}): StepTranscript => ({
  events: [
    { id: 'e-1', at: '2026-09-30T05:02:00.000Z', role: 'assistant', kind: 'text', text: 'Reading.' },
    { id: 'e-2', at: '2026-09-30T05:02:01.000Z', role: 'assistant', kind: 'tool_use', tool: { name: 'Read', input: { path: 'a.ts' } } },
    { id: 'e-2', at: '2026-09-30T05:02:02.000Z', role: 'user', kind: 'tool_result', result: { text: 'x', isError: false } },
  ],
  cursor: 'c-3',
  live: true,
  open: true,
  ...extra,
});

/** A try's task and its path through the runtime's lifecycle. */
export const stepPath = (extra: Partial<StepPath> = {}): StepPath => ({
  taskId: 't-2',
  try: 2,
  path: [
    { state: 'queued', event: 'filed', at: '2026-09-30T05:01:00.000Z' },
    { state: 'running', event: 'spawned', at: '2026-09-30T05:02:00.000Z' },
  ],
  ...extra,
});

/** A run's row as a list answers it, in flight, with one step per `[name, status]`, and `extra` over it. */
export const summary = (steps: ReadonlyArray<readonly [string, string]>, extra: Partial<RunSummary> = {}): RunSummary => ({
  id: 'r-1',
  repo: '/code/app',
  factory: null,
  place: 'repository',
  work: null,
  brief: 'Do the thing',
  workflowDir: '/code/app/workflows/dev',
  workflowPage: null,
  try: null,
  createdAt: '2026-09-13T00:00:00.000Z',
  startedAt: null,
  cancelledAt: null,
  pruned: null,
  status: 'running',
  moving: true,
  cost: null,
  atWork: null,
  tokens: null,
  steps: steps.map(([name, status], i) => ({
    name,
    taskId: `t-${i}`,
    branch: null,
    status,
    note: null,
    roundDue: false,
    agent: null,
    since: null,
    needs: null,
    blockedByHarness: false,
    waitingFor: null,
    approve: null,
    denied: null,
    sessionUnread: null,
  })),
  graph: { roots: [], edges: [] },
  waitingOnYou: [],
  onYou: [],
  after: [],
  waiting: null,
  context: [],
  heldUntil: [],
  holding: null,
  toDecide: null,
  unreadable: null,
  ...extra,
});

/** `run` as the light answer lists one in flight: its wall time, and no end. */
export const listed = (run: RunSummary, wallMs = 0): ListedRun => ({ ...run, wallMs, finishedAt: null });

/**
 * `run` as the light answer lists one that waits on a person: listed, with the breakdowns and the start of its present wait `extra`
 * gives, none by default.
 */
export const waitingRun = (
  run: RunSummary,
  extra: Partial<Pick<WaitingRun, 'wallMs' | 'clock' | 'stepCosts' | 'waitingSince'>> = {},
): WaitingRun => ({
  ...listed(run),
  clock: null,
  stepCosts: null,
  waitingSince: null,
  ...extra,
});

/** A run two revisions behind on one agent, with one step that already ran on the older one: what the run page draws the drift from. */
export const behind = (): RunDetail =>
  detail({
    kinds: [
      { kind: 'agent', name: 'coder', pinned: 5, now: 6 },
      { kind: 'skill', name: 'look', pinned: 1, now: 2, step: 'implement' },
    ],
  });

/** A run the api answered before revisions: no `kinds` at all, and nothing drawn. */
export const unpinned = (): RunDetail => {
  const { kinds: _, refresh: __, ...rest } = detail();
  return rest;
};
