/**
 * What the inbox's search bar keeps as Recent (`keptRecent`, src/lib/searchBar.ts): the last five distinct filter sets this browser
 * used, newest first, kept as the Grid / List choice is (`lib/stored.ts`). A filter set is said as one text, the address's filters it
 * holds written in one order (`recentOf`, src/lib/searchBar.ts), so two uses of the same filters are one entry. What is kept before
 * holds no set twice and no empty one, which the bar's own reading of the browser's text sees to. What the verifier does not reach
 * (that older sets keep their order, and that five are kept where there are five) is a test's (`test/search-bar.test.ts`). Using a set
 * puts it first; the same set used again moves, never repeats; the caller keeps nothing for no filter at all (`used` is never empty).
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** Whether no two of `items` are the same. */
const once = (items: readonly string[]) => items.every((one, at) => !items.slice(0, at).includes(one));

const keptRecentSpec = spec<(recent: readonly string[], used: string) => readonly string[]>({
  requires: ({ input: [recent, used] }) => used !== '' && once(recent) && !recent.includes(''),
  ensures: {
    usedComesFirst: {
      description: 'A filter set just used is first',
      condition: ({ input: [, used], output }) => output.at(0) === used,
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
  },
});

/** `keptRecent`'s type, which src/lib/searchBar.ts takes. */
export type KeptRecentOf = Implementation<typeof keptRecentSpec>;
