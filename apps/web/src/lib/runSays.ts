/**
 * What the look's run part says at each of its sizes (`Run`, `look/Run.tsx`): the smallest size that says each thing a run can say
 * (`smallestSize`, proved by `contracts/run-says.contract.ts`), and from it everything a size says (`says`), so each size says all the
 * one under it does, and more. Pure.
 */
import type { RunLayout, RunSays, RunSize, SmallestSizeOf } from '../../contracts/run-says.contract.ts';

export type { RunLayout, RunSays, RunSize } from '../../contracts/run-says.contract.ts';

/** The sizes, smallest first. */
const SIZES: readonly RunSize[] = ['xs', 'sm', 'md', 'lg', 'xl'];

/** Every thing a run can say, in the order the ladder adds them. */
const THINGS: readonly RunSays[] = [
  'state',
  'id',
  'step',
  'title',
  'clock',
  'where',
  'agent',
  'round',
  'words',
  'graph',
  'budget',
  'cost',
  'waitedBy',
  'labels',
  'action',
  'named',
  'facts',
  'runs',
  'lastLine',
];

/** The size that first says each thing, as a card: the person's ladder from the artboard. */
const FIRST: Record<RunSays, RunSize> = {
  state: 'xs',
  id: 'xs',
  step: 'sm',
  title: 'sm',
  clock: 'sm',
  where: 'md',
  agent: 'md',
  round: 'md',
  words: 'md',
  graph: 'md',
  budget: 'md',
  cost: 'md',
  waitedBy: 'md',
  labels: 'lg',
  action: 'lg',
  named: 'xl',
  facts: 'xl',
  runs: 'xl',
  lastLine: 'xl',
};

/**
 * The smallest size that says `thing`: the mark its state and id, the line the step, title and clock, md what the run is doing, lg its
 * labels and Open run, the panel the rest; a row says its labels a size early, at md, having the width a card has not.
 * @param thing What is said.
 * @param layout The run's shape at md: a row of a list or a card.
 */
export const smallestSize: SmallestSizeOf = (thing: RunSays, layout: RunLayout): RunSize =>
  thing === 'labels' && layout === 'row' ? 'md' : FIRST[thing];

/**
 * Everything a run says at `size` in `layout`: each thing whose smallest size is no larger.
 * @param size How much it says.
 * @param layout Its shape at md, a row or a card.
 */
export function says(size: RunSize, layout: RunLayout): ReadonlySet<RunSays> {
  const at = SIZES.indexOf(size);
  return new Set(THINGS.filter((thing) => SIZES.indexOf(smallestSize(thing, layout)) <= at));
}
