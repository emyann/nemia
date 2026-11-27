/**
 * The keys the inbox's search bar offers (`searchKeys`, src/lib/searchBar.ts): one row per label key the cards in view hold, then
 * `factory`, `workflow` and `state`, which every factory has. The keys come from the cards in view, never from a list written for one
 * factory: a factory whose cards hold no label of their own offers exactly the three. `factory` and `workflow` are read off the labels
 * the card list counts (the orchestrator's `cardLabels` gives every card both); `state` is the card's phase, read off the list's counts,
 * never a label, so a label a card names `state` is not offered as a second `state`. What the verifier does not reach (that each key is
 * offered once, that every label key held is offered, and that each offers exactly the values its cards hold with their counts) is a
 * test's (`test/search-bar.test.ts`).
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { CardPhase } from 'objects';

/** One label in use among the cards in view, as the card list's `metadata.labelsInUse` gives it: key, value and how many cards hold it. */
export type LabelInUse = { readonly key: string; readonly value: string; readonly cards: number };

/** One value a key offers, and how many cards in view hold it. */
export type KeyValue = { readonly value: string; readonly cards: number };

/** One key of the bar: its name, as the bar spells it before its colon, and the values it offers. */
export type SearchKey = { readonly key: string; readonly values: readonly KeyValue[] };

/** Whether `key` is one of the three every factory offers. */
const fixed = (key: string) => key === 'factory' || key === 'workflow' || key === 'state';

/** Whether no two of `items` are the same. */
const once = (items: readonly string[]) => items.every((one, at) => !items.slice(0, at).includes(one));

const searchKeysSpec = spec<(labels: readonly LabelInUse[], counts: Readonly<Record<CardPhase, number>>) => readonly SearchKey[]>({
  requires: ({ input: [labels, counts] }) =>
    once(labels.map((label) => `${label.key}=${label.value}`)) &&
    [counts.notStarted, counts.blocked, counts.waiting, counts.working, counts.done, counts.failed, counts.cancelled].every((n) => n >= 0),
  ensures: {
    theThreeComeLast: {
      description: 'The last three keys are factory, workflow and state, in that order, whatever the cards hold',
      condition: ({ output }) =>
        output.length >= 3 && output.at(-3)?.key === 'factory' && output.at(-2)?.key === 'workflow' && output.at(-1)?.key === 'state',
    },
    labelKeysAreHeld: {
      description: 'Every key before the three is a key some card in view holds as a label, and none of the three',
      condition: ({ input: [labels], output }) =>
        output.slice(0, -3).every((one) => !fixed(one.key) && labels.some((label) => label.key === one.key)),
    },
    stateOffersEveryPhase: {
      description: 'state offers every phase once, in the order the chips draw them',
      condition: ({ output }) => {
        const state = output.at(-1);
        return (
          state !== undefined &&
          state.key === 'state' &&
          state.values.length === 7 &&
          state.values.at(0)?.value === 'waiting' &&
          state.values.at(1)?.value === 'working' &&
          state.values.at(2)?.value === 'blocked' &&
          state.values.at(3)?.value === 'notStarted' &&
          state.values.at(4)?.value === 'done' &&
          state.values.at(5)?.value === 'failed' &&
          state.values.at(6)?.value === 'cancelled'
        );
      },
    },
    stateCountsEveryPhase: {
      description: 'each phase state offers carries how many cards in view are in it',
      condition: ({ input: [, counts], output }) => {
        const state = output.at(-1);
        return (
          state !== undefined &&
          state.values.at(0)?.cards === counts.waiting &&
          state.values.at(1)?.cards === counts.working &&
          state.values.at(2)?.cards === counts.blocked &&
          state.values.at(3)?.cards === counts.notStarted &&
          state.values.at(4)?.cards === counts.done &&
          state.values.at(5)?.cards === counts.failed &&
          state.values.at(6)?.cards === counts.cancelled
        );
      },
    },
  },
});

/** `searchKeys`'s type, which src/lib/searchBar.ts takes. */
export type SearchKeysOf = Implementation<typeof searchKeysSpec>;
