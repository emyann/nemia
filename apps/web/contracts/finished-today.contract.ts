/**
 * Whether the Overview's strip reads another page of the finished runs to count today's (`readsOnToday`, src/lib/api/runs.ts): the
 * RunList asked `status.state=finished` answers the newest finished first, so once a page holds a run that finished before the day began,
 * every older page does too, and the strip has every run finished today. It reads on while the page it holds finished wholly today and
 * the list says there is a next one; never past the last page, and never on a page with no row, which would ask the same nothing again.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * A page of the finished runs as the decision reads it: when each of its runs' work stopped, in epoch ms, in the list's order, and
 * whether the list answered a `continue` token for the next, older page.
 */
export type FinishedPageRead = { readonly finishedMs: readonly number[]; readonly next: boolean };

/** Whether a run that finished at `ms` finished today, the day beginning at `dayStart`. */
const today = (ms: number, dayStart: number): boolean => ms >= dayStart;

/** Whether every run of `page` finished today: none of it before the day began. */
const wholeToday = (page: FinishedPageRead, dayStart: number): boolean => page.finishedMs.every((ms) => today(ms, dayStart));

const readsOnTodaySpec = spec<(page: FinishedPageRead, dayStart: number) => boolean>({
  ensures: {
    notPastTheLastPage: {
      description: 'A page the list answered no next one for is the last: nothing more is read',
      condition: ({ input: [page], output }) => page.next || !output,
    },
    stopsAtTheDaysStart: {
      description: 'A page that holds a run finished before the day began ends the read: every older page finished before it',
      condition: ({ input: [page, dayStart], output }) => wholeToday(page, dayStart) || !output,
    },
    anEmptyPageEndsTheRead: {
      description: 'A page with no run ends the read, so a list that answers an empty page with a token is not asked forever',
      condition: ({ input: [page], output }) => page.finishedMs.length > 0 || !output,
    },
    readsOnWhileTodayGoesOn: {
      description: 'A page of runs that all finished today, with a next page, is followed by that page: no run finished today is missed',
      condition: ({ input: [page, dayStart], output }) =>
        !(page.next && page.finishedMs.length > 0 && wholeToday(page, dayStart)) || output,
    },
  },
});

/** `readsOnToday`'s type, which src/lib/api/runs.ts takes. */
export type ReadsOnToday = Implementation<typeof readsOnTodaySpec>;
