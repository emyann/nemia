/**
 * The run as one object (`Run`): a hand-built run decodes through it, its status carries the list's judged fields by the very types the
 * list's row has (`judgedFields`), and its OpenAPI 3.1 document (`runDocument`) holds a `Run` and imports back into a Schema that decodes
 * the same run.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JsonSchema, Schema, SchemaRepresentation } from 'effect';
import {
  Run,
  RunStatus,
  RunStepStatus,
  runDocument,
  StepAttempts,
  StepCheck,
  StepCloseout,
  StepRaise,
  StepTold,
  StepTries,
  StepTry,
  StepUsed,
  TryCloseout,
  TryShort,
} from './run.model.ts';
import type { judgedFields } from '../summary/summary.verb.ts';
import type { ObjectGraph } from '../summary/graph.ts';
import type { Timeline } from '../timeline/index.ts';
import type { RunDetail, StepTimelineTotal, StepTimelineTry } from '../resource/page.verb.ts';
import type * as Tries from '../resource/tries.verb.ts';
import type { StepCheck as CheckType } from '../resource/checks.verb.ts';
import type { StepUsed as UsedType } from '../resource/usage.ts';
import type { toldOf } from '../resource/told.verb.ts';
import type { TryCloseout as CloseoutAnswer } from './run.verb.ts';
import type { StepStatus } from '../record/record.ts';
import type { RetryMode } from '../retry/index.ts';

/** Whether `A` and `B` are each assignable to the other. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type Judged = ReturnType<typeof judgedFields>;

/** The status's judged fields are the list row's, by type, both ways: no field of either spelled apart. */
const judgedSame: Same<Pick<RunStatus, keyof Judged>, Judged> = true;
const graphSame: Same<RunStatus['graph'], ObjectGraph> = true;
const timelineSame: Same<RunStatus['timeline'], { rounds: StepTimelineTotal[]; run: StepTimelineTotal; slot: Timeline['slot'] }> = true;
const stepTimelineSame: Same<RunStepStatus['timeline'], StepTimelineTry[]> = true;
const stepWordSame: Same<RunStepStatus['status'], StepStatus> = true;
const modesSame: Same<StepRaise['modes'][number], RetryMode> = true;

/** A sub-resource's answer, by its Schema, is what the package builds it as, both ways (tries.verb.ts, told.verb.ts and the page's). */
const subResourcesSame = [
  true satisfies Same<StepTry, Tries.StepTry>,
  true satisfies Same<StepTries, { tries: Tries.StepTry[] }>,
  true satisfies Same<StepCloseout, Tries.StepCloseout>,
  true satisfies Same<StepAttempts, Tries.StepAttempts>,
  true satisfies Same<TryCloseout, CloseoutAnswer>,
  true satisfies Same<StepCheck, CheckType>,
  true satisfies Same<StepUsed, UsedType>,
  true satisfies Same<StepTold, ReturnType<typeof toldOf> & { body: string | null }>,
  true satisfies Same<RunStatus['kinds'], RunDetail['kinds'][number][]>,
];

/** A Schema imported from JSON Schema, typed `Top` with its services unknown, as the decoder it is: built from JSON alone, it asks none. */
const imported = (schema: Schema.Top): Schema.Decoder<unknown> => schema as Schema.Decoder<unknown>;

const span = {
  taskId: 'r-1-build',
  at: 'ended',
  filedAt: '2026-10-14T09:00:00.000Z',
  spawnedAt: '2026-10-14T09:00:01.000Z',
  endedAt: '2026-10-14T09:05:00.000Z',
  attempts: 1,
  queuedMs: 1000,
  ranMs: 299000,
  queued: '1s',
  ran: '4m59s',
} as const;

const total = {
  loop: null,
  round: null,
  tasks: 1,
  inFlight: 0,
  queuedMs: 1000,
  ranMs: 299000,
  wallMs: 300000,
  queued: '1s',
  ran: '4m59s',
  wall: '5m',
  cost: { usd: 4.25, measured: 2, unmeasured: 0, said: '$4.25' },
};

/** A step's frontmatter none of which is set. */
const unset = {
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
};

/** What the page shows of a step beyond its codes, word, raise, timeline and current try, as a step not yet filed has it. */
const unfiled = (name: string) => ({
  on: null,
  via: null,
  message: name === 'build' ? 'over budget $4.25 of $3' : 'pending',
  verdict: null,
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
});

const current: TryShort = {
  try: 2,
  round: 1,
  phase: 'waiting',
  reason: 'OverBudget',
  outcome: 'done',
  verdict: { result: 'passed', exit: 0 },
};

/** What a session used, in `nemia decide`'s words. */
const used = {
  usage: { inputTokens: 1000, outputTokens: 200 },
  used: '1.2k tokens',
  cost: '$4.25',
  costUsd: 4.25,
  apiMs: null,
  toolMs: null,
  read: null,
  peak: null,
  rebuilt: 0,
};

/** A run of two steps, `build` over its budget with a raise offered, `review` reading its output and looping back to it. */
const fixture = {
  apiVersion: 'nemia/v1',
  kind: 'Run',
  metadata: { name: 'r-1', creationTimestamp: '2026-10-14T09:00:00.000Z', labels: { factory: null, workflow: 'build' } },
  spec: {
    steps: [
      { name: 'build', after: [], input: [], loop: null, rounds: null, ...unset, harness: 'claude' },
      { name: 'review', after: ['build'], input: ['build'], loop: 'build', rounds: 3, ...unset, tools: ['Read'] },
    ],
    brief: 'build it',
    place: 'git',
    repo: '/work/repo',
    baseRef: 'abc123',
    branch: 'main',
    isolate: true,
    work: null,
    workflowDir: '/work/team/build',
    try: null,
    after: [],
    context: [],
    from: { inbox: 'c-1' },
  },
  status: {
    status: 'waiting',
    phase: 'waiting',
    reason: 'OverBudget',
    on: null,
    via: null,
    moving: false,
    cost: { usd: 4.25, measured: 2, unmeasured: 0, said: '$4.25' },
    atWork: { ms: 300000, since: null, endedAt: '2026-10-14T09:05:00.000Z' },
    tokens: {
      total: 1200,
      input: 1000,
      output: 200,
      cacheRead: null,
      cacheWrite: null,
      uncached: null,
      measured: 1,
      unmeasured: 0,
      said: '1.2k',
      split: '1k in, 200 out',
    },
    waiting: null,
    holding: null,
    toDecide: null,
    graph: {
      roots: ['build'],
      edges: [
        { from: 'build', to: 'review', kind: 'after' },
        { from: 'build', to: 'review', kind: 'input' },
        { from: 'review', to: 'build', kind: 'loop', rounds: 3 },
      ],
    },
    timeline: { rounds: [], run: total, slot: null },
    startedAt: '2026-10-14T09:00:00.000Z',
    cancelledAt: null,
    pruned: null,
    onDisk: { worktrees: true, files: true },
    holdUntil: [],
    read: null,
    waitingOnYou: [],
    waitingOnYouWords: [],
    gates: [],
    warning: null,
    kinds: [{ kind: 'agent', name: 'builder', pinned: 2, now: 3 }],
    steps: [
      {
        name: 'build',
        phase: 'waiting',
        reason: 'OverBudget',
        status: 'over budget',
        raise: { by: 'retry', above: 4.25, said: '$4.25', modes: ['continue', 'fresh'], own: 'verified' },
        timeline: [{ try: 1, round: 1, session: span, sessionOf: null, check: null, used }],
        current,
        ...unfiled('build'),
      },
      {
        name: 'review',
        phase: 'pending',
        reason: 'Pending',
        status: 'pending',
        raise: null,
        timeline: [],
        current: null,
        ...unfiled('review'),
      },
    ],
  },
};

test('a hand-built run decodes through `Run`, and a state not among its words is refused', () => {
  assert.deepEqual(
    [judgedSame, graphSame, timelineSame, stepTimelineSame, stepWordSame, modesSame, ...subResourcesSame],
    [true, true, true, true, true, true, ...subResourcesSame.map(() => true)],
    'the types the object says agree with the ones the package judges by',
  );
  const run = Schema.decodeUnknownSync(Run)(fixture);
  assert.deepEqual(run, fixture, 'the object decodes as it was built');
  const opened = { ...fixture, status: { ...fixture.status, phase: 'paused' } };
  assert.equal(Schema.decodeUnknownResult(Run)(opened)._tag, 'Failure', 'a phase is one of its words');
  const kinded = { ...fixture, kind: 'Step' };
  assert.equal(Schema.decodeUnknownResult(Run)(kinded)._tag, 'Failure', 'the kind is `Run`');
});

test("the run's OpenAPI 3.1 document holds `Run`, and imports back into a Schema that decodes the same run", () => {
  const openapi = runDocument();
  assert.equal(openapi.dialect, 'openapi-3.1');
  assert.deepEqual(openapi.schemas[0], { $ref: '#/components/schemas/Run' });
  for (const name of ['Run', 'RunMetadata', 'RunSpec', 'RunSpecStep', 'RunStatus', 'RunStepStatus', 'TryShort', 'StepRaise']) {
    assert.ok(openapi.definitions[name], `the document defines ${name}`);
  }
  const document = JsonSchema.fromSchemaOpenApi3_1({ ...openapi.schemas[0], $defs: openapi.definitions });
  const back = imported(SchemaRepresentation.fromJsonSchemaDocument(document));
  assert.deepEqual(Schema.decodeUnknownSync(back)(fixture), fixture, 'the imported Schema decodes the run');
  const opened = { ...fixture, status: { ...fixture.status, phase: 'paused' } };
  assert.equal(Schema.decodeUnknownResult(back)(opened)._tag, 'Failure', 'and keeps its words closed');
});
