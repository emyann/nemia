/** The face of a templated factory's upgrade: its tree merged three ways, the person's choices composed into it, and the plan said. */
export { diff3Lines, linesOf, type Segment } from './lines.ts';
export {
  compareVersions,
  compose,
  conflictCut,
  KEPT_LINES,
  mergeTrees,
  planLines,
  resolveLine,
  type Choice,
  type Conflict,
  type Merged,
  type TreeFile,
  type TreeMerge,
} from './merge.ts';
