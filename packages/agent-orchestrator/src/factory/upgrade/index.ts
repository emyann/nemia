/**
 * The face of a templated factory's upgrade: its tree merged three ways, or, for a switch onto a template of another name, with no
 * common base (`switchTrees`); the person's choices composed into it, and the plan said; and how each conflict is resolved, by a
 * proposal of the object that holds its file, or by the person's choice (`resolvedBy`, `resolutionOf`, `takenFromTree`).
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
export {
  allText,
  conflictOwners,
  keyOf,
  ownerKey,
  ownerOfKey,
  resolutionOf,
  resolvedBy,
  segmentsOf,
  takenFromTree,
  WIRING_FILE,
} from './resolution.ts';
export type { MergeAt, SameVersionKind } from '../../../contracts/same-version.contract.ts';
export type { ResolutionKind, ResolutionOwner, ResolutionProposal, UpgradeResolution } from '../../../contracts/resolution.contract.ts';
