/**
 * The run as one object, as Kubernetes spells a resource: `apiVersion`, `kind`, `metadata`, the frozen record a run was started with
 * (`spec`) and what the package judges of it now (`status`), as Schemas at the orchestrator's door. The status's run-level fields are the
 * runs list's judged fields (`judgedFields`, summary.verb.ts), typed by the same types, so the object and the list say a run alike.
 *
 * Plain JSON throughout — structs, closed literal unions, arrays, strings, numbers, nulls, no brand and no check — so `runDocument` exports
 * it to an OpenAPI 3.1 document that imports back into a Schema decoding the same object.
 */
import { JsonSchema, Schema } from 'effect';
import { ANSWER_VIA, RUN_PHASES, RUN_REASONS, STEP_PHASES, STEP_REASONS, WAIT_ON } from '../phase/phase.ts';
import { CHECK_RESULTS } from '../check/check.ts';
import { PLACE_KINDS, type StepStatus } from '../record/record.ts';
import type { RetryMode } from '../retry/index.ts';
import type { TaskSpan } from '../timeline/index.ts';

/** `assess`'s word for a run (`RunStatus`, judged.verb.ts), each of them. */
const RUN_STATUSES = ['running', 'succeeded', 'failed', 'cancelled', 'awaiting approval', 'waiting'] as const;

/** A step's word (`StepStatus`, record.ts), each of them. */
const STEP_STATUSES = [
  'pending',
  'running',
  'blocked',
  'unsigned',
  'checking',
  'verified',
  'unverified',
  'awaiting approval',
  'exhausted',
  'over budget',
  'budget exhausted',
  'denied',
  'failed (check)',
  'failed',
  'stopped',
] as const satisfies readonly StepStatus[];

/** How a try is taken (`RetryMode`, retry-ask.ts), each way. */
const RETRY_MODES = ['continue', 'fresh', 'recheck'] as const satisfies readonly RetryMode[];

/** Where a task stands on the clock (`TaskSpan.at`, timeline.ts), each word. */
const SPAN_AT = ['unknown', 'queued', 'starting', 'running', 'ended', 'unspawned'] as const satisfies readonly TaskSpan['at'][];

/** How a raise is asked for (`StepRaise.by`): with a try, or with a round. */
const RAISE_BY = ['retry', 'round'] as const;

/** How a step signed off, in its closeout. */
const OUTCOMES = ['done', 'blocked'] as const;

const Strings = Schema.mutable(Schema.Array(Schema.String));
const NullString = Schema.NullOr(Schema.String);
const NullNumber = Schema.NullOr(Schema.Finite);

const StepStatusWord = Schema.Literals(STEP_STATUSES);
const StepPhase = Schema.Literals(STEP_PHASES);
const StepReason = Schema.Literals(STEP_REASONS);

/**
 * The run's name, when it was made, and the labels it is found by: the factory it was started in (null for the default) and its
 * workflow.
 */
export const RunMetadata = Schema.Struct({
  name: Schema.String,
  creationTimestamp: Schema.String,
  labels: Schema.Struct({ factory: NullString, workflow: Schema.String }),
}).annotate({ identifier: 'RunMetadata' });
export type RunMetadata = typeof RunMetadata.Type;

/**
 * One step as the run froze it: what it waits on (`after`), whose declared output it is handed (`input`), and on a looping step the step
 * a round runs again and how many rounds it may run (`loop`, `rounds`; null on any other).
 */
export const RunSpecStep = Schema.Struct({
  name: Schema.String,
  after: Strings,
  input: Strings,
  loop: NullString,
  rounds: NullNumber,
}).annotate({ identifier: 'RunSpecStep' });
export type RunSpecStep = typeof RunSpecStep.Type;

/**
 * What the run was started with, frozen: its steps, its brief, the kind of place its work is on, and for a repository run the repository
 * and the base branch its result goes to (null on a folder run).
 */
export const RunSpec = Schema.Struct({
  steps: Schema.mutable(Schema.Array(RunSpecStep)),
  brief: Schema.String,
  place: Schema.Literals(PLACE_KINDS),
  repo: NullString,
  branch: NullString,
}).annotate({ identifier: 'RunSpec' });
export type RunSpec = typeof RunSpec.Type;

/** A check's verdict as codes (`CheckVerdict`, check.ts). */
const CheckVerdict = Schema.Struct({ result: Schema.Literals(CHECK_RESULTS), exit: NullNumber });

/**
 * The short of a step's current try (the page's `StepTry`): its number and the round of its loop it was filed in, where it stands as codes,
 * and how it signed off and its check's verdict where it has them (null where not).
 */
export const TryShort = Schema.Struct({
  try: Schema.Finite,
  round: Schema.Finite,
  phase: StepPhase,
  reason: StepReason,
  outcome: Schema.NullOr(Schema.Literals(OUTCOMES)),
  verdict: Schema.NullOr(CheckVerdict),
}).annotate({ identifier: 'TryShort' });
export type TryShort = typeof TryShort.Type;

/** A raise of a step's cap the package takes, and how it is asked for (`StepRaise`, retry/raise.ts). */
export const StepRaise = Schema.Struct({
  by: Schema.Literals(RAISE_BY),
  above: Schema.Finite,
  said: Schema.String,
  modes: Schema.mutable(Schema.Array(Schema.Literals(RETRY_MODES))),
  own: Schema.NullOr(StepStatusWord),
}).annotate({ identifier: 'StepRaise' });
export type StepRaise = typeof StepRaise.Type;

/** One task on the clock (`TaskSpan`, timeline.ts). */
const TaskSpanSchema = Schema.Struct({
  taskId: Schema.String,
  at: Schema.Literals(SPAN_AT),
  filedAt: NullString,
  spawnedAt: NullString,
  endedAt: NullString,
  attempts: Schema.Finite,
  queuedMs: NullNumber,
  ranMs: NullNumber,
  queued: Schema.String,
  ran: Schema.String,
});

/** What a session consumed (`Consumed`, status.ts): each count where it was measured. */
const Consumed = Schema.Struct({
  responses: Schema.optionalKey(Schema.Finite),
  toolCalls: Schema.optionalKey(Schema.Finite),
  inputTokens: Schema.optionalKey(Schema.Finite),
  outputTokens: Schema.optionalKey(Schema.Finite),
  costUsd: Schema.optionalKey(Schema.Finite),
  apiMs: Schema.optionalKey(Schema.Finite),
  toolMs: Schema.optionalKey(Schema.Finite),
  cacheReadTokens: Schema.optionalKey(Schema.Finite),
  cacheWriteTokens: Schema.optionalKey(Schema.Finite),
  uncachedTokens: Schema.optionalKey(Schema.Finite),
  peakContextTokens: Schema.optionalKey(Schema.Finite),
  firstContextTokens: Schema.optionalKey(Schema.Finite),
  firstCacheWriteTokens: Schema.optionalKey(Schema.Finite),
  compactions: Schema.optionalKey(Schema.Finite),
  rebuiltCaches: Schema.optionalKey(Schema.Finite),
});

/** One try of a step on the clock (`TimelineTry`, timeline.ts). */
const TimelineTry = Schema.Struct({
  try: Schema.Finite,
  round: Schema.Finite,
  session: Schema.NullOr(TaskSpanSchema),
  sessionOf: NullNumber,
  check: Schema.NullOr(TaskSpanSchema),
  used: Schema.optionalKey(Consumed),
  turn: Schema.optionalKey(Schema.Struct({ asked: Schema.Boolean, heldFrom: NullString, spawnedAt: NullString, endedAt: NullString })),
});

/** The time of several tasks together (`TimelineTotal`, timeline.ts): a round of a loop, or the whole run's. */
const TimelineTotal = Schema.Struct({
  loop: NullString,
  round: NullNumber,
  tasks: Schema.Finite,
  inFlight: Schema.Finite,
  queuedMs: Schema.Finite,
  ranMs: Schema.Finite,
  wallMs: NullNumber,
  queued: Schema.String,
  ran: Schema.String,
  wall: Schema.String,
});

/**
 * A step now: where it stands as codes and in its word, the raise of its cap the package takes (null where none), its tries on the clock
 * (`TimelineTry`), and the short of its current try (null while it has none).
 */
export const RunStepStatus = Schema.Struct({
  name: Schema.String,
  phase: StepPhase,
  reason: StepReason,
  status: StepStatusWord,
  raise: Schema.NullOr(StepRaise),
  timeline: Schema.mutable(Schema.Array(TimelineTry)),
  current: Schema.NullOr(TryShort),
}).annotate({ identifier: 'RunStepStatus' });
export type RunStepStatus = typeof RunStepStatus.Type;

/** The runs a run waits on or is held until, each that has not landed and why it never will on its own (`RunWaiting`, `RunHolding`). */
const waitedRun = { run: Schema.String, missing: Schema.Boolean, cancelledAt: NullString, gone: Strings };

/** What a person has to decide (`RunToDecide`, judged.verb.ts): an approval at a gate, or the result branches. */
const RunToDecide = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal('approve'),
    step: Schema.String,
    says: NullString,
    filed: Schema.Boolean,
    back: Strings,
    onto: NullString,
    said: Schema.String,
    command: Schema.String,
  }),
  Schema.Struct({ kind: Schema.Literal('result'), branches: Strings, said: Schema.String, command: Schema.String }),
]);

/** One edge of the run's graph (`GraphEdge`, graph.ts). */
const GraphEdge = Schema.Union([
  Schema.Struct({ from: Schema.String, to: Schema.String, kind: Schema.Literal('after') }),
  Schema.Struct({ from: Schema.String, to: Schema.String, kind: Schema.Literal('input') }),
  Schema.Struct({ from: Schema.String, to: Schema.String, kind: Schema.Literal('loop'), rounds: Schema.Finite }),
]);

/**
 * The run now: the runs list's judged fields (`judgedFields`) — its word and codes, whether it moves, its cost, time at work and tokens,
 * what it waits on, its hold and what a person has to decide — then its graph, where its time went as a whole (`Timeline`'s rounds, run
 * and slot), and each step.
 */
export const RunStatus = Schema.Struct({
  status: Schema.Literals(RUN_STATUSES),
  phase: Schema.Literals(RUN_PHASES),
  reason: Schema.Literals(RUN_REASONS),
  on: Schema.NullOr(Schema.Literals(WAIT_ON)),
  via: Schema.NullOr(Schema.Literals(ANSWER_VIA)),
  moving: Schema.Boolean,
  cost: Schema.NullOr(Schema.Struct({ usd: Schema.Finite, measured: Schema.Finite, unmeasured: Schema.Finite, said: Schema.String })),
  atWork: Schema.NullOr(Schema.Struct({ ms: Schema.Finite, since: NullString, endedAt: NullString })),
  tokens: Schema.NullOr(
    Schema.Struct({
      total: Schema.Finite,
      input: Schema.Finite,
      output: Schema.Finite,
      cacheRead: NullNumber,
      cacheWrite: NullNumber,
      uncached: NullNumber,
      measured: Schema.Finite,
      unmeasured: Schema.Finite,
      said: Schema.String,
      split: Schema.String,
    }),
  ),
  waiting: Schema.NullOr(
    Schema.Struct({
      runs: Schema.mutable(Schema.Array(Schema.Struct(waitedRun))),
      word: Schema.String,
      advice: Schema.String,
      waitingOnYou: Schema.Boolean,
    }),
  ),
  holding: Schema.NullOr(
    Schema.Struct({
      at: Schema.String,
      runs: Schema.mutable(Schema.Array(Schema.Struct({ ...waitedRun, landed: Schema.Boolean }))),
      word: Schema.String,
      advice: Schema.String,
      waitingOnYou: Schema.Boolean,
    }),
  ),
  toDecide: Schema.NullOr(RunToDecide),
  graph: Schema.Struct({ roots: Strings, edges: Schema.mutable(Schema.Array(GraphEdge)) }),
  timeline: Schema.Struct({
    rounds: Schema.mutable(Schema.Array(TimelineTotal)),
    run: TimelineTotal,
    slot: Schema.NullOr(Schema.Struct({ from: Schema.String, filedAt: NullString, ms: NullNumber, queued: Schema.String })),
  }),
  steps: Schema.mutable(Schema.Array(RunStepStatus)),
}).annotate({ identifier: 'RunStatus' });
export type RunStatus = typeof RunStatus.Type;

/** The run as one object: `nemia/v1`'s `Run`. */
export const Run = Schema.Struct({
  apiVersion: Schema.Literal('nemia/v1'),
  kind: Schema.Literal('Run'),
  metadata: RunMetadata,
  spec: RunSpec,
  status: RunStatus,
}).annotate({ identifier: 'Run' });
export type Run = typeof Run.Type;

/**
 * `Run` as an OpenAPI 3.1 multi-document: its one root a reference to `Run`, and each struct named above a component of its own
 * (`#/components/schemas/<name>`). Pure.
 */
export function runDocument(): JsonSchema.MultiDocument<'openapi-3.1'> {
  const document = Schema.toJsonSchemaDocument(Run);
  return JsonSchema.toMultiDocumentOpenApi3_1({
    dialect: document.dialect,
    schemas: [document.schema],
    definitions: document.definitions,
  });
}
