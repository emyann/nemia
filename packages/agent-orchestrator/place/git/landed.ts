/**
 * Where a run's result came onto the base's line, read off git's walk of that line down to a tip, newest first, kept to the commits
 * that hold it (`git rev-list --first-parent --parents <tip>..HEAD`, kept to `git rev-list --ancestry-path <tip>..HEAD`): `cameOnto`
 * one tip, and `landedBy` the first commit of the line that holds two of them, folded over every tip asked of into what the `status`
 * verb answers as `landedBy`. Pure; proved by `contracts/landed-by.contract.ts`.
 */
import type { CameOnto, LandedBy } from '../../contracts/landed-by.contract.ts';

/**
 * Where `tip` came onto the line whose newest commit is `head`, given the walk of that line down to it. The walk's oldest row is the
 * line's commit nearest the tip: when its first parent is the tip, the tip itself is on the line (a fast-forward); otherwise that
 * commit merged it in. An empty walk means the tip is the line's newest commit, or is not on the line at all.
 */
export const cameOnto: CameOnto = (tip, head, walk) => {
  const nearest = walk.at(-1);
  if (nearest === undefined) return tip === head ? { commit: tip, below: 0 } : undefined;
  if (nearest.at(1) === tip) return { commit: tip, below: walk.length };
  const commit = nearest.at(0);
  return commit === undefined ? undefined : { commit, below: walk.length - 1 };
};

/**
 * The first commit of the line that holds both `landed` and `next`: the nearer the line's newest of the two, nothing when either is off
 * the line. Folded over a result's tips, it is the first commit that holds them all.
 */
export const landedBy: LandedBy = (landed, next) => {
  if (landed === undefined || next === undefined) return undefined;
  return landed.below <= next.below ? landed : next;
};
