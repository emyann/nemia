/**
 * `wf plan`: every card of a plan folder started, parents first (`startPlan`), each through `start`. A controller: it reaches the runtime
 * through `start/start.verb.ts`.
 */
import { workflowFolder } from '../folder/folder.store.ts';
import { type Card, type Planned } from './plan.ts';
import { runId } from '../record/record.store.ts';
import { readPlan } from './plan.store.ts';
import { placesOf, refuseInclude, start, stepsToStart } from '../start/start.verb.ts';
import { Invalid } from '../refusal/refusal.ts';

/** What `startPlan` did: the cards it started, in order; the workflow folder each card's `workflow:` was found at; and, when a `start()` refused part-way, which card, why, and the cards after it. */
export type PlanStarted = {
  started: Planned[];
  folderOf: (card: Card) => string;
  stopped?: { card: Card; error: Error & { exitCode?: number }; rest: Card[] };
};

/**
 * `wf plan`: every card of a plan folder started, parents first, each with `start()` and `after` the runs of the cards its `after:` names —
 * the record `wf start --after` writes, so the tick, `wf ls`, `wf decide` and the board need nothing new; parents first, so every card a
 * card's `after:` names has a run by then. Nothing else is written: no plan
 * record, and no file of its own. The runs and their `after` are the plan.
 *
 * Refused before the first run is started, naming the card and the fix: a folder `parsePlan` refuses; a card whose `workflow:` names no
 * workflow folder (`workflowFolder`, from the plan folder), or one `start` would refuse — that refusal, behind the card; and a
 * `.worktreeinclude` `start` would refuse. A `start()` that refuses after that, part-way, stops the plan: the runs already started stand,
 * and `stopped` says which card refused and which are left. `startRun` is `start`, unless a test hands it one of its own.
 */
export function startPlan(opts: { dir: string; repo: string; startRun?: typeof start }): PlanStarted {
  const cards = readPlan(opts.dir);
  refuseInclude(opts.repo, true);
  const folders = new Map<string, string>();
  for (const card of cards) {
    try {
      const folder = workflowFolder(card.workflow, opts.dir, opts.repo);
      stepsToStart(folder, true, placesOf(opts.repo));
      folders.set(card.name, folder);
    } catch (err) {
      throw new Invalid({ message: `${card.file}: \`workflow: ${card.workflow}\` — ${(err as Error).message}` });
    }
  }
  const folderOf = (card: Card): string => folders.get(card.name)!;
  const startRun = opts.startRun ?? start;
  const started: Planned[] = [];
  for (const [i, card] of cards.entries()) {
    const runOf = new Map(started.map((p) => [p.card.name, p.runId]));
    try {
      const run = startRun({ brief: card.body, repo: opts.repo, workflowDir: folderOf(card), after: card.after.map((a) => runOf.get(a)!) });
      started.push({ card, runId: run.id, workflowDir: run.workflowDir });
    } catch (err) {
      return { started, folderOf, stopped: { card, error: err as Error, rest: cards.slice(i + 1) } };
    }
  }
  return { started, folderOf };
}
