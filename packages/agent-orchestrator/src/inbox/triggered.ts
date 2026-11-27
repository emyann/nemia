/**
 * What a factory's card triggers do with one inbox card on a pass (`cardTriggered`, proved by `contracts/card-trigger.contract.ts`): queue
 * it on the workflow it names, else on their one target; leave it waiting on a clash where they target two; or nothing. Read from the
 * level on every pass and written nowhere: a card whose labels a selector no longer selects is queued by none on the next read. Which
 * triggers select a card (`matchingTriggers`) is the selector's own (`src/watch/selector.ts`), over the map a selector reads of a card
 * (`cardLabels`).
 */
import type { CardTrigger, CardTriggered, TriggerCard } from '../../contracts/card-trigger.contract.ts';
import { parseSelectors, selectorsRefusal, selectsLabels } from '../watch/selector.ts';

export type { TriggerCard } from '../../contracts/card-trigger.contract.ts';

/** A card trigger as the factory's wiring holds it: the trigger the decision reads, with its selector. */
export type SelectingTrigger = CardTrigger & { readonly selector: string };

/**
 * What the card triggers that select a card do with it on this pass.
 * @param card The card as a trigger reads it: its factory and workflow, whether it is queued by hand, started, reads, and waits on a card
 *   of its `after:` not released.
 * @param matching The triggers whose selector selects the card's labels, every factory's.
 */
export const cardTriggered: CardTriggered = (card, matching) => {
  if (card.factory === null || card.queued || card.started || !card.readable || card.waiting) return { kind: 'none' };
  const own = matching.filter((t) => t.factory === card.factory);
  const first = own[0];
  if (first === undefined) return { kind: 'none' };
  const by = own.map((t) => t.name);
  if (card.workflow !== null) return { kind: 'queued', workflow: card.workflow, by };
  if (own.some((t) => t.target.name !== first.target.name)) return { kind: 'clash', by };
  return { kind: 'queued', workflow: first.target.name, by };
};

/**
 * The triggers of `triggers` whose selector selects `labels`, a card's map as a selector reads it (`cardLabels`); a selector that does
 * not read selects nothing.
 * @param labels The card's labels, its `workflow` and its `factory`, as `cardLabels` gives them.
 * @param triggers The card triggers of every factory.
 */
export const matchingTriggers = <T extends SelectingTrigger>(labels: Readonly<Record<string, string>>, triggers: readonly T[]) =>
  triggers.filter((t) => selectorsRefusal([t.selector]) === undefined && selectsLabels(parseSelectors([t.selector]), labels));

/**
 * The card `card` as `cardTriggered` reads it, from what the listing knows of it.
 * @param card The entry's factory and workflow (null or empty for none), whether it is queued by hand, started, reads, and waits on a
 *   card of its `after:` not released.
 */
export const triggerCardOf = (card: {
  readonly factory: string | null;
  readonly workflow: string | null;
  readonly queued: boolean;
  readonly started: boolean;
  readonly readable: boolean;
  readonly waiting: boolean;
}) =>
  ({
    factory: card.factory || null,
    workflow: card.workflow || null,
    queued: card.queued,
    started: card.started,
    readable: card.readable,
    waiting: card.waiting,
  }) satisfies TriggerCard;
