/**
 * The header's bell, without React: the runs that wait on a person across every factory, as the api answers them, each
 * with its factory, what it waits for and the step at whose gate it waits; and how the bell says how many. Pure.
 */
import type { RunSummary } from './api';
import { stepAnchor } from './asks.ts';
import { factoryOf } from './factories.ts';
import { byAge, titleOf } from './factory.ts';

/**
 * A run the bell lists: its id, its title (`titleOf`), the factory it is in (`factoryOf`), what it waits for in the package's words, and
 * the step waiting at its gate, null for a run that waits on a person for anything else.
 */
export type BellRow = { run: string; title: string; factory: string; waitsFor: string[]; gate: string | null };

/**
 * What `run` waits for, in the package's words: each step as the api asks it (`onYou`), else each by name; the run it waits on that never
 * ships without a person (`waiting.word`); and the hold only a person lifts (`holding.word`).
 */
function waitsForOf(run: RunSummary): string[] {
  const steps = run.onYou.length ? run.onYou : run.waitingOnYou;
  return [...steps, ...(run.waiting?.onYou ? [run.waiting.word] : []), ...(run.holding?.onYou ? [run.holding.word] : [])];
}

/**
 * The runs the api says wait on a person (`waiting`), oldest first (`byAge`), each as the bell lists it. Every one of them, and no other:
 * which runs wait is the api's to say, and the board only orders and words them.
 */
export const bellRows = (waiting: readonly RunSummary[]): BellRow[] =>
  byAge(waiting).map((run) => ({
    run: run.id,
    title: titleOf(run),
    factory: factoryOf(run),
    waitsFor: waitsForOf(run),
    gate: run.steps.find((step) => step.approve)?.name ?? null,
  }));

/** Where a row of the bell opens its run's page: at its gate's step section (`stepAnchor`), or at its top for a run at no gate. */
export const bellHash = (row: Pick<BellRow, 'gate'>): string | undefined => (row.gate === null ? undefined : stepAnchor(row.gate));

/** The bell's count as its badge reads it: nothing for none, the number up to 99, and `99+` past it. */
export const bellCount = (count: number): string => (count <= 0 ? '' : count > 99 ? '99+' : String(count));

/**
 * The bell's name, given how many runs wait on you, undefined while they are not read, and whether their read `failed`: the count, that
 * nothing waits on you only once they are read, and no number before or when the read failed.
 */
export const bellLabel = (count: number | undefined, failed: boolean): string =>
  count === undefined
    ? failed
      ? 'Waiting on you: the runs could not be read'
      : 'Waiting on you'
    : count
      ? `Waiting on you: ${count}`
      : 'Nothing waits on you';
