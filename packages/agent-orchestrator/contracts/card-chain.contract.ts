/**
 * Where a card stands in the chains of `after:` (agent-orchestrator, src/inbox/card-chain.ts, `chainOf`): the cards that wait on it
 * (`followedBy`, whose `after:` names it, served as the Card's `status.followedBy`), and whether it is chained (`status.chained`): in play,
 * and tied by an `after:` to another card in play, before it or after it. The board pulls the chained cards out of its grid, each chain
 * whole. Pure.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A card as its chain reads it: its name, the cards its `after:` names, and whether it is in play. */
export type Linked = { readonly name: string; readonly after: readonly string[]; readonly inPlay: boolean };

/** A card's place in its chains: the cards whose `after:` names it, by name, and whether it is chained. */
export type ChainPlace = { readonly followedBy: readonly string[]; readonly chained: boolean };

/** Whether `other` is another card than `card` and in play. */
const otherInPlay = (card: Linked, other: Linked) => other.name !== card.name && other.inPlay;

/** Whether `card` and `other` are tied by an `after:`, one way or the other. */
const tied = (card: Linked, other: Linked) => other.after.includes(card.name) || card.after.includes(other.name);

const chainOfSpec = spec<(card: Linked, cards: readonly Linked[]) => ChainPlace>({
  ensures: {
    followersNameIt: {
      description: "Each card it is followed by names it in its after:, and is a card of the inbox",
      condition: ({ input: [card, cards], output }) =>
        output.followedBy.every((name) => cards.some((other) => other.name === name && other.after.includes(card.name))),
    },
    everyFollowerListed: {
      description: 'Every other card whose after: names it is listed among those it is followed by',
      condition: ({ input: [card, cards], output }) =>
        cards.every((other) => other.name === card.name || !other.after.includes(card.name) || output.followedBy.includes(other.name)),
    },
    chainedExactly: {
      description: 'A card is chained exactly when it is in play and tied by an after: to another card in play',
      condition: ({ input: [card, cards], output }) =>
        output.chained === (card.inPlay && cards.some((other) => otherInPlay(card, other) && tied(card, other))),
    },
  },
});

/** `chainOf`'s type, which `src/inbox/card-chain.ts` takes: where `card` stands among `cards`, the inbox's every card. */
export type ChainOf = Implementation<typeof chainOfSpec>;
