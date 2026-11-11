/**
 * The run as one object at the orchestrator's door (`RunObject`): its Schemas are `objects`' (`packages/objects/src/run.ts`), re-exported
 * here by name for the package's callers, and its status's run-level fields are the runs list's judged fields (`judgedFields`,
 * summary.verb.ts), typed by the same types, so the object and the list say a run alike (`run.model.test.ts`).
 *
 * The words each field is one of are `objects`' too (`packages/objects/src/words.ts`), and the orchestrator's unions are imported from
 * there. Its pure files keep their own tuples, which the pure entries (`agent-orchestrator/run`, `/workflow`) read with no Effect but
 * `effect/Data` (`test/refusal.test.ts`) and so cannot take from `objects`, whose door loads `effect`: `wordsHeld` holds each equal to
 * `objects`' list, both ways, so a word added on one side alone fails the typecheck.
 */
import {
  ANSWER_VIA,
  CHECK_RESULTS,
  DEFINITION_ORIGINS,
  EVENT_REASONS,
  EVENT_SOURCES,
  FACTORY_CONDITION_REASONS,
  FACTORY_CONDITION_STATUSES,
  FACTORY_CONDITION_TYPES,
  OUTCOMES,
  PLACE_KINDS,
  REVISION_KINDS,
  REVISIONS_POLICIES,
  RUN_PHASES,
  RUN_REASONS,
  STEP_PHASES,
  STEP_REASONS,
  RETRY_MODES,
  TRY_CAUSES,
  WAIT_ON,
} from 'objects';
import type * as Phase from '../phase/phase.ts';
import type * as Check from '../check/index.ts';
import type * as Records from '../record/record.ts';
import type * as Retry from '../retry/index.ts';
import type * as Revisions from '../revisions/revisions.ts';
import type * as Factories from '../factory/factory.ts';
import type * as Feed from '../feed/index.ts';
import type * as Keys from '../keys/index.ts';
import type * as Served from '../definition/served.ts';
import type * as Closeouts from '../closeout/index.ts';

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
  places: true satisfies Same<typeof PLACE_KINDS, typeof Keys.PLACES>,
  tryCauses: true satisfies Same<typeof TRY_CAUSES, typeof Retry.TRY_CAUSES>,
  retryModes: true satisfies Same<typeof RETRY_MODES, typeof Retry.RETRY_MODES>,
  revisionKinds: true satisfies Same<typeof REVISION_KINDS, typeof Revisions.REVISION_KINDS>,
  outcomes: true satisfies Same<typeof OUTCOMES, typeof Closeouts.CLOSEOUT_OUTCOMES>,
  definitionOrigins: true satisfies Same<typeof DEFINITION_ORIGINS, typeof Served.LOOKUP>,
  revisionsPolicies: true satisfies Same<typeof REVISIONS_POLICIES, typeof Factories.REVISIONS_POLICIES>,
  factoryConditionTypes: true satisfies Same<typeof FACTORY_CONDITION_TYPES, typeof Factories.FACTORY_CONDITION_TYPES>,
  factoryConditionReasons: true satisfies Same<typeof FACTORY_CONDITION_REASONS, typeof Factories.FACTORY_CONDITION_REASONS>,
  factoryConditionStatuses: true satisfies Same<typeof FACTORY_CONDITION_STATUSES, typeof Factories.FACTORY_CONDITION_STATUSES>,
  eventReasons: true satisfies Same<Words<typeof EVENT_REASONS>, Feed.Reason>,
  eventSources: true satisfies Same<typeof EVENT_SOURCES, typeof Feed.LINE_SOURCES>,
} as const;
