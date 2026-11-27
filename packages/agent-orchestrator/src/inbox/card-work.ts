/**
 * The runs a card's work went through (`cardWork`, proved by contracts/card-work.contract.ts): the runs started from the card, then each
 * run a workflow node of one of them started, carrying no card of its own, in the order they were made. Pure.
 */
import type { CardWorkOf, WorkRun } from '../../contracts/card-work.contract.ts';

/**
 * Whether `run` belongs to the work of `card`: started from it, or, carrying no card of its own, started by a run that does. Walks up at
 * most `runs.length` runs, so a loop of `startedBy` a hand-edited record makes ends, read as belonging to no card.
 */
const belongs = (run: WorkRun, runs: readonly WorkRun[], card: string) => {
  let at: WorkRun | undefined = run;
  for (let i = 0; i <= runs.length && at !== undefined; i++) {
    if (at.card === card) return true;
    if (at.card !== null || at.startedBy === null) return false;
    const parent: string = at.startedBy;
    at = runs.find((r) => r.id === parent);
  }
  return false;
};

/**
 * The ids of the runs of `runs` that belong to the work of `card`, in the order `runs` lists them, which is the order they were made (`byCreated`).
 * @param card The card's name.
 * @param runs Every run the store lists, as the walk reads them.
 */
export const cardWork: CardWorkOf = (card, runs) => runs.filter((r) => belongs(r, runs, card)).map((r) => r.id);

/**
 * The runs in the order they were made, those made at the same instant by id: what `cardWork` is asked over. Not proved: it sorts by a
 * comparison the verifier does not read.
 * @param runs The runs to order.
 */
export const byCreated = <R extends { readonly id: string; readonly created: number }>(runs: readonly R[]) =>
  [...runs].sort((a, b) => a.created - b.created || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/** What `workRuns` reads of a run: its id, the card it was started from, the run whose node started it and when it was made. */
export type Worked = { readonly id: string;
  readonly from?: { readonly inbox: string } | undefined; readonly startedBy?: { readonly run: string } | undefined; readonly createdAt?: string };

/**
 * The runs `cardWork` may be asked over, once for a pass: those started from a card or by a node, as it reads them, in the order they
 * were made. A run with neither belongs to no card's work.
 * @param runs The store's runs.
 */
export const workRuns = (runs: readonly Worked[]) =>
  byCreated(
    runs
      .filter((r) => r.from !== undefined || r.startedBy !== undefined)
      .map((r) => ({
        id: r.id,
        card: r.from?.inbox ?? null,
        startedBy: r.startedBy?.run ?? null,
        created: r.createdAt === undefined ? 0 : Date.parse(r.createdAt) || 0,
      })),
  );
