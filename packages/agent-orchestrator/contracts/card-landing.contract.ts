/**
 * Where the work of a card that another card waits on stands (agent-orchestrator, src/inbox/waits.ts, `cardLanded`): one card, read from
 * the runs started from it and from what became of the cards those runs passed its work on to — the card each workflow node of theirs filed
 * (`StepRecord.sent`) and the card each was sent on as (`nemia inbox resend`, `<run>-resent`) — each of those already judged by this same
 * decision, so that a card routed by a door has landed when the card it was routed as has. Read from the level on every pass, carried
 * nowhere.
 *
 * A card has landed exactly when a run started from it has landed, as that run's own `nemia decide` says it, or a card its runs passed
 * its work on to has. Else the card waits, at the card where its work stands now: the first card it was passed on to that still waits, else
 * a card it was passed on to that is gone, else the card itself. A name the store knows nothing of — no card of that name in the inbox and
 * no run started from it — is missing, and never lands without a person. The state a person reads beside a wait is that card's own, as
 * the inbox lists it: not this decision's.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { CardState } from 'objects';

/** A run started from the card, as the wait reads it: its id, and whether it landed, as its own `nemia decide` says it. */
export type WaitedRun = { readonly id: string; readonly landed: boolean };

/**
 * A card another names in its `after:`, as the wait reads it: its name; whether the store knows it — a card of that name in the inbox, or
 * a run started from it; and the runs started from it, in the order they were started.
 */
export type WaitedCard = { readonly name: string; readonly known: boolean; readonly runs: readonly WaitedRun[] };

/**
 * Where a card's work stands: landed; waiting, at the card where its work is now (`card`, the card itself or one it was passed on to); or
 * missing, `card` being the name the store knows nothing of.
 */
export type CardLanding =
  | { readonly kind: 'landed' }
  | { readonly kind: 'waiting'; readonly card: string }
  | { readonly kind: 'missing'; readonly card: string };

/** Whether a run started from the card has landed. */
const ownRunLanded = (card: WaitedCard) => card.runs.some((r) => r.landed);

/** Whether a card the card's runs passed its work on to has landed. */
const onwardLanded = (onward: readonly CardLanding[]) => onward.some((o) => o.kind === 'landed');

/** The first card its work was passed on to that still waits, as judged. */
const firstWaiting = (onward: readonly CardLanding[]) => onward.find((o) => o.kind === 'waiting');

/** The first card its work was passed on to that is gone, as judged. */
const firstMissing = (onward: readonly CardLanding[]) => onward.find((o) => o.kind === 'missing');

/** Whether the card is known and nothing of it, nor of where its work went, has landed. */
const knownUnlanded = (card: WaitedCard, onward: readonly CardLanding[]) => card.known && !ownRunLanded(card) && !onwardLanded(onward);

const cardLandedSpec = spec<(card: WaitedCard, onward: readonly CardLanding[]) => CardLanding>({
  ensures: {
    unknownIsMissing: {
      description: 'A name the store knows nothing of, no card and no run started from it, is missing, by that name',
      condition: ({ input: [card], output }) => card.known || (output.kind === 'missing' && output.card === card.name),
    },
    ownRunLands: {
      description: 'A known card a run started from which has landed has landed',
      condition: ({ input: [card], output }) => !(card.known && ownRunLanded(card)) || output.kind === 'landed',
    },
    onwardLands: {
      description: 'A known card whose work was passed on to a card that has landed has landed',
      condition: ({ input: [card, onward], output }) => !(card.known && onwardLanded(onward)) || output.kind === 'landed',
    },
    landedOnlyByALanding: {
      description: 'A card has landed only by a run of its own landing, or a card its work was passed on to',
      condition: ({ input: [card, onward], output }) =>
        output.kind !== 'landed' || (card.known && (ownRunLanded(card) || onwardLanded(onward))),
    },
    followsTheWork: {
      description: 'A card not landed whose work was passed on to a card that waits waits where that card waits',
      condition: ({ input: [card, onward], output }) => {
        const at = firstWaiting(onward);
        return (
          !(knownUnlanded(card, onward) && at !== undefined && at.kind === 'waiting') ||
          (output.kind === 'waiting' && output.card === at.card)
        );
      },
    },
    goneOnward: {
      description:
        'A card not landed whose work went on to a card that is gone, and to none that waits, is missing, by the first card gone',
      condition: ({ input: [card, onward], output }) => {
        const gone = firstMissing(onward);
        return (
          !(knownUnlanded(card, onward) && firstWaiting(onward) === undefined && gone !== undefined && gone.kind === 'missing') ||
          (output.kind === 'missing' && output.card === gone.card)
        );
      },
    },
    waitsOnItself: {
      description: 'A known card not landed whose work was passed on to no card waits at itself',
      condition: ({ input: [card, onward], output }) =>
        !(knownUnlanded(card, onward) && firstWaiting(onward) === undefined && firstMissing(onward) === undefined) ||
        (output.kind === 'waiting' && output.card === card.name),
    },
  },
});

/** `cardLanded`'s type, which src/inbox/waits.ts takes: where the work of one card another waits on stands. */
export type CardLanded = Implementation<typeof cardLandedSpec>;

/**
 * A wait as the listing says it to a person, for whether it is stalled: its kind — `waiting` at a card, `missing`, or `cycle`, a card whose
 * `after:` leads back to itself — and, for `waiting`, the state of the card its work stands at as the inbox lists it (null where not read).
 */
export type ListedWait = {
  readonly kind: 'waiting' | 'missing' | 'cycle';
  readonly state: CardState | null;
};

/**
 * The states of the card a wait stands at from which nothing the tick does lands it: its run ended without landing (`succeeded` with its
 * work not on its base, `failed`, `stopped`, `cancelled`), or its start was refused (`refused`).
 */
const ENDED_UNLANDED: readonly CardState[] = ['succeeded', 'failed', 'stopped', 'cancelled', 'refused'];

const waitStalledSpec = spec<(wait: ListedWait) => boolean>({
  ensures: {
    missingIsStalled: {
      description: 'A wait on a name the store knows nothing of is stalled: no pass will ever find it',
      condition: ({ input: [wait], output }) => wait.kind !== 'missing' || output,
    },
    cycleIsStalled: {
      description: 'A wait on a cycle of after: is stalled: each card waits on the other for ever',
      condition: ({ input: [wait], output }) => wait.kind !== 'cycle' || output,
    },
    endedUnlandedIsStalled: {
      description: 'A wait standing at a card whose run ended unlanded, or whose start was refused, is stalled',
      condition: ({ input: [wait], output }) =>
        !(wait.kind === 'waiting' && wait.state !== null && ENDED_UNLANDED.includes(wait.state)) || output,
    },
    stalledOnlyThen: {
      description:
        'A wait at a card still to start or still at work, or whose state was not read, is not stalled: the tick may yet land it',
      condition: ({ input: [wait], output }) =>
        !output || wait.kind !== 'waiting' || (wait.state !== null && ENDED_UNLANDED.includes(wait.state)),
    },
  },
});

/**
 * `waitStalled`'s type, which src/inbox/waits.ts takes: whether a wait will never be released without a person, which the listing marks
 * (`CardWait.stalled`) and the feed says once, begun and ended (`CardWaitStalled`, `CardWaitFreed`).
 */
export type WaitStalled = Implementation<typeof waitStalledSpec>;
