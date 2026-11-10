/**
 * The waiting bar's rows, without React: the runs that wait on a person across every factory, as the api answers them, each with its
 * factory, what it waits for and the step at whose gate it waits. Pure.
 */
import { judged, type RunRow, type RunView } from './api/judged.ts';
import { stepAnchor } from './asks.ts';
import { namespaceOf } from './factories.ts';
import { byAge, titleOf } from './factory.ts';

/**
 * A run the waiting bar lists: its id, its title (`titleOf`), the factory it is in (`namespaceOf`), what it waits for in the package's
 * words, and the step waiting at its gate, null for a run that waits on a person for anything else.
 */
export type BellRow = { run: string; title: string; factory: string; waitsFor: string[]; gate: string | null };

/**
 * What `run` waits for, in the package's words: each step as the api asks it (`waitingOnYouWords`), else each by name; the run it waits on
 * that never lands without a person (`waiting.word`); and the hold only a person lifts (`holding.word`).
 */
function waitsForOf(run: RunView): string[] {
  const steps = run.waitingOnYouWords.length ? run.waitingOnYouWords : run.waitingOnYou;
  return [...steps, ...(run.waiting?.waitingOnYou ? [run.waiting.word] : []), ...(run.holding?.waitingOnYou ? [run.holding.word] : [])];
}

/**
 * The runs the api says wait on a person (`waiting`), each as the waiting bar lists it: first each the list could not judge, by its id,
 * its id for its title and nothing said of what it waits for, since nothing of it is judged; then the rest oldest first (`byAge`). Every
 * one of them, and no other: which runs wait is the api's to say, and the board only orders and words them.
 */
export const bellRows = (waiting: readonly RunRow[]): BellRow[] => [
  ...waiting
    .filter((run) => !judged(run))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((run) => ({ run: run.id, title: run.id, factory: namespaceOf(run.factory), waitsFor: [], gate: null })),
  ...byAge(waiting.filter(judged)).map((run) => ({
    run: run.id,
    title: titleOf(run),
    factory: namespaceOf(run.factory),
    waitsFor: waitsForOf(run),
    gate: run.steps.find((step) => step.approve)?.name ?? null,
  })),
];

/** Where a row of the waiting bar opens its run's page: at its gate's step section (`stepAnchor`), or at its top for a run at no gate. */
export const bellHash = (row: Pick<BellRow, 'gate'>): string | undefined => (row.gate === null ? undefined : stepAnchor(row.gate));
