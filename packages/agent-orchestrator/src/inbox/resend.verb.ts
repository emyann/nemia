/**
 * `nemia inbox resend`: a started card sent on, filed again as a card of its own (`<run>-resent`) to the workflow a person names or naming
 * none for its factory's card triggers, handed the runs it was started as, then the run it came from cancelled when that run waits on a
 * person. A controller: an Effect program over the Card door, the runs' judgement through the engine (`cardRuns`) and `cancelRun`.
 */
import { Cause, Effect, Exit } from 'effect';
import type { Actor } from 'objects';
import { cancelRun } from '../cancel/cancel.verb.ts';
import { CardDoor } from '../cards/cards.store.ts';
import { factoryOrNone } from '../factory/door/factories.store.ts';
import { unattachedRefusal } from '../factory/factory.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { EngineService } from '../runtime-client.ts';
import { WorkflowError } from '../step/step.ts';
import { cardRuns, type SummaryHow } from '../summary/summary.verb.ts';
import { cardState, cardWorkflowRefusal, inboxNameRefusal, noCardLine, parseInboxCard, type InboxCard } from './inbox.ts';
import { CardName } from './inbox.model.ts';
import { inboxCards } from './inbox.store.ts';
import { resendRefusal, resendRefusalMessage, resentCardName, resentFrom, resentText } from './resend.ts';

/** What `nemia inbox resend` is asked: the card, the workflow it is sent to by name (none for its factory's triggers), and who asks. */
export type ResendAsked = { readonly name: string; readonly workflow?: string; readonly actor?: Actor };

/**
 * What `nemia inbox resend` did: the card filed and its file, the card and run it was sent on from, and the run cancelled (`cancelled`, by
 * id), or why that run was not (`cancelLeft`, the cancel's own words) when it waited on a person and its cancel failed. Neither for a run
 * that had ended.
 */
export type Resent = {
  card: InboxCard;
  file: string;
  from: { card: string; run: string };
  cancelled?: string;
  cancelLeft?: string;
};

/** The refusal `resendRefusal`'s word is answered as: an unstarted card is no conflict, only a card to queue or start. */
const refusalOf = (why: 'unstarted' | 'sent' | 'in-flight', message: string) =>
  why === 'unstarted' ? new Invalid({ message }) : new Conflict({ message });

/**
 * Send the card `asked.name` on: its runs judged now through the engine (`cardRuns`, over `how`), refused as `resendRefusal` says
 * (`unstarted` as `Invalid`, `sent` and `in-flight` as `Conflict`), then filed through the Card door as `<run>-resent` (`resentText`),
 * and only then, when the run it is sent on from waits on a person, that run cancelled by `asked.actor` (`cancelRun`). A cancel that fails
 * never undoes the card: it is said on `cancelLeft`, and asking again is refused as `sent`, so the person cancels it with `nemia cancel`.
 *
 * Refused by name, exit 2, before anything is written: a name that is no card's (`inboxNameRefusal`), a workflow that is no workflow's
 * name (`cardWorkflowRefusal`), a card not there (`Missing`, naming the cards), a card that does not read, and a workflow its factory does
 * not offer (`unattachedRefusal`). A card already at the new card's name, filed between the read and the write, is the door's `Conflict`.
 * @param asked The card by name, the workflow it is sent to (none for its factory's card triggers), and who asks.
 * @param how The store's root, the informer and whether its answers are verified, which the card's runs are judged through.
 */
export const resendCard = Effect.fn('resendCard')(function* (asked: ResendAsked, how: SummaryHow) {
  const { name, workflow, actor } = asked;
  const wrongName = inboxNameRefusal(name);
  if (wrongName) return yield* Effect.fail(new Invalid({ message: wrongName }));
  const wrongWorkflow = workflow === undefined ? undefined : cardWorkflowRefusal('--workflow', workflow, 'Nothing was filed.');
  if (wrongWorkflow !== undefined) return yield* Effect.fail(new Invalid({ message: wrongWorkflow }));
  const door = yield* CardDoor;
  const text = yield* door.cards.read(CardName.read(name));
  if (text === null) {
    return yield* Effect.fail(
      new Missing({
        message: `${noCardLine(name, yield* inboxCards())} Name one of those: nemia inbox resend <name> [--workflow <name>]. Nothing was filed.`,
      }),
    );
  }
  const card = yield* Effect.try({ try: () => parseInboxCard(`${name}.md`, text), catch: (err) => err as WorkflowError });
  const runs = (yield* cardRuns(yield* EngineService, how)).filter((r) => r.from?.inbox === card.name);
  const run = resentFrom(runs);
  const state = cardState({ phases: runs.map((r) => r.phase) });
  const taken = run !== undefined && (yield* door.cards.read(CardName.read(resentCardName(run.id)))) !== null;
  const why = resendRefusal({ state, taken });
  if (why !== null || run === undefined) {
    const said = why ?? 'unstarted';
    return yield* Effect.fail(refusalOf(said, resendRefusalMessage(said, name, run?.id)));
  }
  const factory = yield* factoryOrNone(card.factory);
  const unattached = workflow === undefined || factory === undefined ? undefined : unattachedRefusal(factory, workflow);
  if (unattached !== undefined)
    return yield* Effect.fail(new Invalid({ message: unattached.replace('Nothing was started.', 'Nothing was filed.') }));
  const sent = resentCardName(run.id);
  const written = resentText(
    card,
    run.id,
    runs.map((r) => r.id),
    workflow,
    new Date().toISOString(),
  );
  const file = yield* door.cards.add(CardName.read(sent), written);
  const out: Resent = { card: parseInboxCard(`${sent}.md`, written), file, from: { card: card.name, run: run.id } };
  if (state !== 'waiting') return out;
  const cancelled = yield* Effect.exit(cancelRun(run.id, actor));
  if (Exit.isSuccess(cancelled)) return { ...out, cancelled: run.id } satisfies Resent;
  const err = Cause.squash(cancelled.cause);
  const left = `${err instanceof Error ? err.message : String(err)} — the card was filed all the same: call the run off with nemia cancel ${run.id}.`;
  return { ...out, cancelLeft: left } satisfies Resent;
});
