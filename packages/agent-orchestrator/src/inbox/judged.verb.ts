/**
 * The inbox listed with each card's state (`inboxListing`): its cards and the tick's tries read through the Card door, the factories that
 * read, and each run a card was started from with its phase as the list judges it (`cardRuns`), so a started card reads its run's phase,
 * read now and never stored on the card. A controller: reading a phase takes the engine, which `inbox.store.ts` does not import.
 */
import { Effect } from 'effect';
import { inboxListing } from './inbox.ts';
import { readableFactories } from './inbox.store.ts';
import { CardDoor } from '../cards/cards.store.ts';
import { isDirectory } from '../record/record.store.ts';
import { cardRuns, type SummaryHow } from '../summary/summary.verb.ts';
import type { Engine } from '../runtime-client.ts';

/** `nemia inbox`'s listing, each entry with its state: a started card's its run's phase, through the informer `how.memo`. */
export const inboxJudged = Effect.fn('inboxJudged')(function* (e: Engine, how: SummaryHow) {
  const door = yield* CardDoor;
  const entries = yield* door.cards.entries();
  const tries = yield* door.tries.list();
  const runs = yield* cardRuns(e, how);
  return inboxListing(entries, runs, isDirectory, tries, readableFactories());
});
