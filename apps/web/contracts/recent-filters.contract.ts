/**
 * What the inbox's search bar keeps as Recent (`keptRecent`, src/lib/searchBar.ts): the last five distinct filter sets this browser used,
 * newest first, kept as the Grid / List choice is (`lib/stored.ts`). A filter set is said as one text, the address's filters it holds
 * written in one order (`recentOf`, src/lib/searchBar.ts), so two uses of the same filters are one entry. Using a set puts it first; the
 * same set used again moves, never repeats; nothing is kept for no filter at all.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** Whether no two of `items` are the same. */
const once = (items: readonly string[]) => new Set(items).size === items.length;

/** How many distinct sets `recent` and `used` hold together, `used` counted only where it is a set (not empty). */
const distinctOf = (recent: readonly string[], used: string) =>
  new Set([...recent.filter((one) => one !== ''), ...(used === '' ? [] : [used])]).size;

const keptRecentSpec = spec<(recent: readonly string[], used: string) => readonly string[]>({
  ensures: {
    usedComesFirst: {
      description: 'A filter set just used is first',
      condition: ({ input: [, used], output }) => used === '' || output[0] === used,
    },
    atMostFive: {
      description: 'Recent keeps at most five sets',
      condition: ({ output }) => output.length <= 5,
    },
    noneTwice: {
      description: 'No set is kept twice',
      condition: ({ output }) => once(output),
    },
    noFilterIsNoSet: {
      description: 'No filter at all is never kept',
      condition: ({ output }) => !output.includes(''),
    },
    nothingInvented: {
      description: 'Every set kept was used just now or was kept before',
      condition: ({ input: [recent, used], output }) => output.every((one) => one === used || recent.includes(one)),
    },
    keepsAsManyAsItCan: {
      description: 'Recent keeps five sets, or every distinct set it has where it has fewer',
      condition: ({ input: [recent, used], output }) => output.length === Math.min(5, distinctOf(recent, used)),
    },
    olderKeepTheirOrder: {
      description: 'The sets kept from before keep the order they had',
      condition: ({ input: [recent, used], output }) => {
        const kept = output.filter((one) => one !== used);
        return kept.every((one, at) => at === 0 || recent.indexOf(kept[at - 1] ?? '') < recent.indexOf(one));
      },
    },
  },
});

/** `keptRecent`'s type, which src/lib/searchBar.ts takes. */
export type KeptRecentOf = Implementation<typeof keptRecentSpec>;
