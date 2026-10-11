/**
 * `nemia plan`: every card of a plan folder started, parents first (`startPlan`), each through `startRun`. A controller: it reaches the
 * runtime through `start/start.verb.ts`.
 */
import { Cause, Effect, Exit } from 'effect';
import { workflowFolder } from '../folder/folder.store.ts';
import { type Card, type Planned } from './plan.ts';
import { readPlan } from './plan.store.ts';
import { startRun, stepsToStart } from '../start/start.verb.ts';
import { PlaceService, openPlace } from '../place/place.store.ts';
import { isFolderTeam } from '../workflow/index.ts';
import { placesOf } from '../folder/lookup.store.ts';
import { readFactory } from '../factory/factory.store.ts';
import { Invalid } from '../refusal/refusal.ts';

/**
 * What `startPlan` did: the cards it started, in order; the workflow folder each card's `workflow:` was found at; and, when a start
 * refused part-way, which card, why, and the cards after it.
 */
export type PlanStarted = {
  started: Planned[];
  folderOf: (card: Card) => string;
  stopped?: { card: Card; error: Error & { exitCode?: number }; rest: Card[] };
};

/**
 * `nemia plan`: every card of a plan folder started, parents first, each with `startRun` and `after` the runs of the cards its `after:`
 * names — the record `nemia start --after` writes, so the tick, `nemia ls`, `nemia decide` and the board need nothing new; parents first,
 * so every card a card's `after:` names has a run by then. Nothing else is written: no plan
 * record, and no file of its own. The runs and their `after` are the plan.
 *
 * Refused before the first run is started, naming the card and the fix: a folder `parsePlan` refuses; a card whose `workflow:` names no
 * workflow folder (`workflowFolder`, from the plan folder), or one `startRun` would refuse — that refusal, behind the card; and, when a
 * card runs on the repository, what its place's `open` refuses of it, a `.worktreeinclude` among them (`openPlace`). A start
 * that refuses after that, part-way, stops the plan: the runs already started stand, and `stopped` says which card refused and which are
 * left. The option `start` is `startRun`, unless a test hands it one of its own.
 *
 * `factory` names the factory every card's run is started in, as `nemia start --factory` names it: read first (`readFactory`), and each
 * card's workflow is judged in it before the first run, a workflow it has not attached or a step its hires leave unfilled among what is
 * refused. Left out, each run is started with none, the default factory's.
 */
export const startPlan = Effect.fn('startPlan')(function* (opts: { dir: string; repo: string; factory?: string; start?: typeof startRun }) {
  const place = yield* PlaceService;
  const cards = readPlan(opts.dir);
  const factory = opts.factory === undefined ? undefined : readFactory(opts.factory);
  const folders = new Map<string, string>();
  let onRepo = false;
  for (const card of cards) {
    try {
      const folder = workflowFolder(card.workflow, opts.dir, opts.repo, factory?.tree);
      const steps = stepsToStart(folder, true, placesOf(opts.repo), factory, [], undefined, false, place.declared.denyWhileLanding);
      onRepo = onRepo || !isFolderTeam(steps);
      folders.set(card.name, folder);
    } catch (err) {
      throw new Invalid({ message: `${card.file}: \`workflow: ${card.workflow}\` — ${(err as Error).message}` });
    }
  }
  if (onRepo) openPlace(place, opts.repo, true);
  const folderOf = (card: Card): string => folders.get(card.name)!;
  const startOne = opts.start ?? startRun;
  const started: Planned[] = [];
  for (const [i, card] of cards.entries()) {
    const runOf = new Map(started.map((p) => [p.card.name, p.runId]));
    const tried = yield* Effect.exit(
      startOne({
        brief: card.body,
        repo: opts.repo,
        workflowDir: folderOf(card),
        after: card.after.map((a) => runOf.get(a)!),
        ...(opts.factory !== undefined ? { factory: opts.factory } : {}),
      }),
    );
    if (Exit.isFailure(tried)) {
      return {
        started,
        folderOf,
        stopped: { card, error: Cause.squash(tried.cause) as Error & { exitCode?: number }, rest: cards.slice(i + 1) },
      } satisfies PlanStarted;
    }
    started.push({ card, runId: tried.value.id, workflowDir: tried.value.workflowDir });
  }
  return { started, folderOf } satisfies PlanStarted;
});
