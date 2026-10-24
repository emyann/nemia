/** The face of `branches/`: what a run's result branches touched and where they stand, and a trial merge in words, re-exported by name. */
export {
  AGENT_FACING,
  CHECK_AFFECTING,
  LESSON,
  branchesToRead,
  countsLine,
  inFullLines,
  lessonLine,
  parseGlobs,
  resultSteps,
  resultTips,
  landedOver,
  tipBranches,
  tipsSeen,
  touchedLines,
  workChecks,
} from './branches.ts';
export { mergeWord, mergeWordOf } from './merges.ts';
export type { MergeWord, StandingMerge } from './merges.ts';
