/**
 * The keys the inbox's search bar offers (`searchKeys`, src/lib/searchBar.ts): one row per label key the cards in view hold, then
 * `factory`, `workflow` and `state`, which every factory has. The keys come from the cards in view, never from a list written for one
 * factory: a factory whose cards hold no label of their own offers exactly the three. `factory` and `workflow` are read off the labels
 * the card list counts (the orchestrator's `cardLabels` gives every card both); `state` is the card's phase, read off the list's counts,
 * never a label, so a label a card names `state` is not offered as a second `state`.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { CardPhase } from 'objects';

/** One label in use among the cards in view, as the card list's `metadata.labelsInUse` gives it: its key, its value and how many hold it. */
export type LabelInUse = { readonly key: string; readonly value: string; readonly cards: number };

/** One value a key offers, and how many cards in view hold it. */
export type KeyValue = { readonly value: string; readonly cards: number };

/** One key of the bar: its name, as the bar spells it before its colon, and the values it offers. */
export type SearchKey = { readonly key: string; readonly values: readonly KeyValue[] };

/** Whether `key` is one of the three every factory offers. */
const fixed = (key: string) => key === 'factory' || key === 'workflow' || key === 'state';

/** Whether no two of `items` are the same. */
const once = (items: readonly string[]) => new Set(items).size === items.length;

/** The labels of `labels` under `key`. */
const under = (labels: readonly LabelInUse[], key: string) => labels.filter((label) => label.key === key);

const searchKeysSpec = spec<(labels: readonly LabelInUse[], counts: Readonly<Record<CardPhase, number>>) => readonly SearchKey[]>({
  requires: ({ input: [labels] }) => once(labels.map((label) => `${label.key}=${label.value}`)),
  ensures: {
    theThreeComeLast: {
      description: 'The last three keys are factory, workflow and state, in that order, whatever the cards hold',
      condition: ({ output }) =>
        output.length >= 3 &&
        output[output.length - 3]?.key === 'factory' &&
        output[output.length - 2]?.key === 'workflow' &&
        output[output.length - 1]?.key === 'state',
    },
    noKeyTwice: {
      description: 'No key is offered twice',
      condition: ({ output }) => once(output.map((one) => one.key)),
    },
    labelKeysAreHeld: {
      description: 'Every key before the three is a key some card in view holds as a label, and none of the three',
      condition: ({ input: [labels], output }) =>
        output.slice(0, -3).every((one) => !fixed(one.key) && labels.some((label) => label.key === one.key)),
    },
    everyHeldKeyOffered: {
      description: 'Every label key a card in view holds is offered',
      condition: ({ input: [labels], output }) => labels.every((label) => output.some((one) => one.key === label.key)),
    },
    labelValuesAreTheLabels: {
      description: 'A key other than state offers exactly the values the cards hold under it, each with how many hold it',
      condition: ({ input: [labels], output }) =>
        output
          .filter((one) => one.key !== 'state')
          .every(
            (one) =>
              one.values.length === under(labels, one.key).length &&
              under(labels, one.key).every((label) =>
                one.values.some((value) => value.value === label.value && value.cards === label.cards),
              ),
          ),
    },
    stateOffersEveryPhase: {
      description: 'state offers every phase once, each with how many cards in view are in it',
      condition: ({ input: [, counts], output }) => {
        const state = output.find((one) => one.key === 'state');
        const phases = Object.keys(counts) as CardPhase[];
        return (
          state !== undefined &&
          state.values.length === phases.length &&
          phases.every((phase) => state.values.some((value) => value.value === phase && value.cards === counts[phase]))
        );
      },
    },
  },
});

/** `searchKeys`'s type, which src/lib/searchBar.ts takes. */
export type SearchKeysOf = Implementation<typeof searchKeysSpec>;
