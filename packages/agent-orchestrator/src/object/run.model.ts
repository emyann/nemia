/**
 * The run as one object at the orchestrator's door (`RunObject`): its Schemas are `objects`' (`packages/objects/src/run.ts`), re-exported
 * here by name for the package's callers, and its status's run-level fields are the runs list's judged fields (`judgedFields`,
 * summary.verb.ts), typed by the same types, so the object and the list say a run alike (`run.model.test.ts`).
 *
 * The words each field is one of are `objects`' too (`packages/objects/src/words.ts`). The orchestrator keeps its own unions, and its
 * pure files keep their own tuples, which the pure entries (`agent-orchestrator/run`, `/workflow`) read with no Effect but `effect/Data`
 * (`test/refusal.test.ts`) and so cannot take from `objects`, whose door loads `effect`: `wordsHeld` holds each equal to `objects`' list,
 * both ways, so a word added on one side alone fails the typecheck.
 */
import { JsonSchema, SchemaRepresentation } from 'effect';
import {
  ANSWER_VIA,
  ATTEMPT_ENDS,
  CHECK_RESULTS,
  ENGINE_OUTCOMES,
  LabelEdit,
  Labelled,
  PLACE_KINDS,
  RETRY_MODES,
  REVISION_KINDS,
  Run,
  RUN_PHASES,
  RUN_REASONS,
  SAID_AFTER,
  SPAN_AT,
  STEP_PHASES,
  STEP_REASONS,
  STEP_STATUSES,
  StepTold,
  StepTries,
  StepTry,
  TRY_CAUSES,
  TryCloseout,
  WAIT_ON,
} from 'objects';
import type * as Phase from '../phase/phase.ts';
import type * as Check from '../check/check.ts';
import type * as Records from '../record/record.ts';
import type * as Retry from '../retry/index.ts';
import type { EngineOutcome, TaskSpan } from '../timeline/index.ts';
import type * as Revisions from '../revisions/revisions.ts';
import type { AttemptEnd } from '../views/views-words.ts';
import type { SaidAfterKind } from '../say/say.ts';

export {
  Run,
  RunMetadata,
  RunSpec,
  RunSpecStep,
  RunStatus,
  RunStepStatus,
  Spent,
  StepAttempts,
  StepCheck,
  StepCloseout,
  StepRaise,
  StepTold,
  StepTries,
  StepTry,
  StepUnreadable,
  StepUsed,
  TryCloseout,
  TryShort,
} from 'objects';

/** Whether `A` and `B` are each assignable to the other. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** The words of a list. */
type Words<L extends readonly string[]> = L[number];

/**
 * Each word list of `objects` and the orchestrator's own: a pure file's tuple, word for word in its order, and a union, word for word
 * both ways. Typed, so a list that drifts from its other fails the typecheck here.
 */
export const wordsHeld = {
  stepPhases: true satisfies Same<typeof STEP_PHASES, typeof Phase.STEP_PHASES>,
  runPhases: true satisfies Same<typeof RUN_PHASES, typeof Phase.RUN_PHASES>,
  waitOn: true satisfies Same<typeof WAIT_ON, typeof Phase.WAIT_ON>,
  answerVia: true satisfies Same<typeof ANSWER_VIA, typeof Phase.ANSWER_VIA>,
  stepReasons: true satisfies Same<typeof STEP_REASONS, typeof Phase.STEP_REASONS>,
  runReasons: true satisfies Same<typeof RUN_REASONS, typeof Phase.RUN_REASONS>,
  checkResults: true satisfies Same<typeof CHECK_RESULTS, typeof Check.CHECK_RESULTS>,
  placeKinds: true satisfies Same<typeof PLACE_KINDS, typeof Records.PLACE_KINDS>,
  tryCauses: true satisfies Same<typeof TRY_CAUSES, typeof Retry.TRY_CAUSES>,
  tryCause: true satisfies Same<Words<typeof TRY_CAUSES>, Retry.TryCause>,
  revisionKinds: true satisfies Same<Words<typeof REVISION_KINDS>, Revisions.RevisionKind>,
  stepStatuses: true satisfies Same<Words<typeof STEP_STATUSES>, Records.StepStatus>,
  retryModes: true satisfies Same<Words<typeof RETRY_MODES>, Retry.RetryMode>,
  spanAt: true satisfies Same<Words<typeof SPAN_AT>, TaskSpan['at']>,
  engineOutcomes: true satisfies Same<Words<typeof ENGINE_OUTCOMES>, EngineOutcome>,
  attemptEnds: true satisfies Same<Words<typeof ATTEMPT_ENDS>, AttemptEnd>,
  saidAfter: true satisfies Same<Words<typeof SAID_AFTER>, SaidAfterKind>,
} as const;

/**
 * The run object and its sub-resources' answers as an OpenAPI 3.1 multi-document: its roots references to `Run`, `StepTries`, `StepTry`,
 * `TryCloseout` and `StepTold`, then a label edit's answer and body (`Labelled`, `LabelEdit`), and each struct named above a component
 * of its own (`#/components/schemas/<name>`), every object closed (`onExcessProperty: 'error'`), so a client generated from it reads
 * structs and no index of extra keys but a label map's. Pure.
 */
export function runDocument(): JsonSchema.MultiDocument<'openapi-3.1'> {
  const roots = SchemaRepresentation.toRepresentations([
    Run.ast,
    StepTries.ast,
    StepTry.ast,
    TryCloseout.ast,
    StepTold.ast,
    Labelled.ast,
    LabelEdit.ast,
  ]);
  return JsonSchema.toMultiDocumentOpenApi3_1(SchemaRepresentation.toJsonSchemaMultiDocument(roots, { onExcessProperty: 'error' }));
}
