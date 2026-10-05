/**
 * Whether a run's result branches still merge onto its base branch as the base is now, in a person's words: what a person reads before
 * approving an ending that merges, so a conflict is seen at the gate rather than as the ending's abort. The trial merges are the place's
 * (`trialMerges`); this file words what they answer.
 */
import type { TrialMerge } from '../place/place.ts';

/**
 * Whether a branch merges onto its base: `clean` when it would merge with no conflict; the files it would conflict in otherwise, as git
 * names them; `error` where git could not say — a branch it no longer has, or a git older than 2.38, which has no `--write-tree` — never a
 * guess either way.
 */
export type MergeWord = { clean: true } | { clean: false; conflicts: string[] } | { error: string };

/** Whether a branch ahead of the base still merges onto it (`MergeWord`), and that in words (`mergeWord`). */
export type StandingMerge = MergeWord & { said: string };

/** A place's trial merge as a `MergeWord`: one it could not say is an `error`, in its words. */
export const mergeWordOf = (trial: TrialMerge): MergeWord =>
  'unknown' in trial ? { error: trial.unknown } : trial.clean ? { clean: true } : { clean: false, conflicts: [...trial.conflicts] };

/** The fact in a person's words: `merges cleanly onto main`, or which files it conflicts in, or why git could not say. */
export const mergeWord = (merge: MergeWord, onto: string): string =>
  'error' in merge
    ? `whether it merges onto ${onto} is not known: ${merge.error}`
    : merge.clean
      ? `merges cleanly onto ${onto}`
      : `conflicts with ${onto} in ${merge.conflicts.length} file${merge.conflicts.length === 1 ? '' : 's'}: ${merge.conflicts.join(', ')}`;
