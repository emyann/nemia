/**
 * The face of a templated factory's upgrade: its tree merged three ways, or, for a switch onto a template of another name, with no
 * common base (`switchTrees`); the person's choices composed into it, and the plan said; and how each conflict is resolved, a
 * workflow's by a proposal of it (`resolvedBy`, `workflowResolution`, `takenFromTree`).
 */
export { diff2Lines, diff3Lines, linesOf, type Segment } from './lines.ts';
export {
  baseTemplateOf,
  compareVersions,
  compose,
  conflictCut,
  KEPT_LINES,
  mergeBaseOf,
  mergeTrees,
  planLines,
  approveLine,
  declineLine,
  resolveLine,
  switchTrees,
  type Choice,
  type Conflict,
  type Merged,
  type TreeFile,
  type PlanNext,
  type Switched,
  type TreeMerge,
} from './merge.ts';
export { choicesApply, sameVersionChange } from './same-version.ts';
export { allText, conflictOwners, resolvedBy, segmentsOf, takenFromTree, workflowResolution } from './resolution.ts';
export type { MergeAt, SameVersionKind } from '../../../contracts/same-version.contract.ts';
export type { ResolutionProposal, WorkflowResolution } from '../../../contracts/resolution.contract.ts';
