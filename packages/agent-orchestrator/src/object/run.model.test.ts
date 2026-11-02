/**
 * The run as one object (`Run`): a hand-built run decodes through it, its status carries the list's judged fields by the very types the
 * list's row has (`judgedFields`), and its OpenAPI 3.1 document (`runDocument`) holds a `Run` and imports back into a Schema that decodes
 * the same run.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JsonSchema, Schema, SchemaRepresentation } from 'effect';
import { Run, RunStatus, RunStepStatus, runDocument, StepRaise, TryShort } from './run.model.ts';
import type { judgedFields } from '../summary/summary.verb.ts';
import type { ObjectGraph } from '../summary/graph.ts';
import type { Timeline, TimelineTry } from '../timeline/index.ts';
import type { StepStatus } from '../record/record.ts';
import type { RetryMode } from '../retry/index.ts';

/** Whether `A` and `B` are each assignable to the other. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type Judged = ReturnType<typeof judgedFields>;

/** The status's judged fields are the list row's, by type, both ways: no field of either spelled apart. */
const judgedSame: Same<Pick<RunStatus, keyof Judged>, Judged> = true;
const graphSame: Same<RunStatus['graph'], ObjectGraph> = true;
const timelineSame: Same<RunStatus['timeline'], Pick<Timeline, 'rounds' | 'run' | 'slot'>> = true;
const stepTimelineSame: Same<RunStepStatus['timeline'], TimelineTry[]> = true;
const stepWordSame: Same<RunStepStatus['status'], StepStatus> = true;
const modesSame: Same<StepRaise['modes'][number], RetryMode> = true;

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
};

const current: TryShort = {
  try: 2,
  round: 1,
  phase: 'waiting',
  reason: 'OverBudget',
  outcome: 'done',
  verdict: { result: 'passed', exit: 0 },
};

/** A run of two steps, `build` over its budget with a raise offered, `review` reading its output and looping back to it. */
const fixture = {
  apiVersion: 'nemia/v1',
  kind: 'Run',
  metadata: { name: 'r-1', creationTimestamp: '2026-10-14T09:00:00.000Z', labels: { factory: null, workflow: 'build' } },
  spec: {
    steps: [
      { name: 'build', after: [], input: [], loop: null, rounds: null },
      { name: 'review', after: ['build'], input: ['build'], loop: 'build', rounds: 3 },
    ],
    brief: 'build it',
    place: 'git',
    repo: '/work/repo',
    branch: 'main',
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
    steps: [
      {
        name: 'build',
        phase: 'waiting',
        reason: 'OverBudget',
        status: 'over budget',
        raise: { by: 'retry', above: 4.25, said: '$4.25', modes: ['continue', 'fresh'], own: 'verified' },
        timeline: [{ try: 1, round: 1, session: span, sessionOf: null, check: null, used: { inputTokens: 1000, outputTokens: 200 } }],
        current,
      },
      { name: 'review', phase: 'pending', reason: 'Pending', status: 'pending', raise: null, timeline: [], current: null },
    ],
  },
};

test('a hand-built run decodes through `Run`, and a state not among its words is refused', () => {
  assert.deepEqual(
    [judgedSame, graphSame, timelineSame, stepTimelineSame, stepWordSame, modesSame],
    [true, true, true, true, true, true],
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
