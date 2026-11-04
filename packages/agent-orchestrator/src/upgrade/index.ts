/**
 * The face of a templated factory's upgrade: its tree merged three ways, or, for a switch onto a template of another name, with no
 * common base (`switchTrees`); the person's choices composed into it, and the plan said.
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
