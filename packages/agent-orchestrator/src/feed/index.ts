/**
 * The face of the feed's pure code: the line and what signs it, the fold, what a pass owes (`feed.ts`), and the closed table of reasons
 * the line names (`reason.ts`). A file outside this folder imports it here (`test/layout.test.ts`); the file itself, read and appended to,
 * is `feed.store.ts`'s, and the verbs are `feed.verb.ts`'s.
 */
export {
  DAEMON_STARTED,
  feedLineWords,
  feedPhase,
  feedWords,
  FEED_VERSION,
  involvedOf,
  isRunLine,
  isStoreLine,
  isFactoryLine,
  lineAsRead,
  REMOVED,
  LINE_WORDS,
  leftEndedLine,
  startedLine,
  upgraded,
} from './feed.ts';
export type {
  FeedCloseout,
  FeedConflicts,
  FeedMissing,
  FeedClashes,
  FeedWaits,
  FeedReadiness,
  FeedDenial,
  ClosedFeedLabels,
  FeedLabels,
  FeedLine,
  FeedWords,
  InvolvedKind,
  Once,
  Reason,
  RunLine,
} from './feed.ts';
export { codesOf, DENIED, LINE_SOURCES, messageOf, reasonOf, REASON_CODES, sourceOf, typeOf, waitsOf } from './reason.ts';
export type { Codes } from './reason.ts';
export {
  codedStep,
  ENGINE_REASON,
  PHASE_OF,
  REASON_OF,
  RUN_PHASES,
  RUN_REASONS,
  runCodes,
  STEP_PHASES,
  STEP_REASONS,
} from '../phase/phase.ts';
export type { AnswerVia, QualifiedStep, RunPhase, RunReason, StepPhase, StepReason, WaitOn } from '../phase/phase.ts';
