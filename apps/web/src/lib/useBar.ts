/**
 * The frame's bar, what the address's `?bar=` names and the frame's side sheet shows, for the pages that open it: what it shows, read
 * from the address, and the verbs that change it there.
 */
import { useCallback } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { barOf, barValue, nextBar, type Bar } from './bar.ts';

/**
 * What the bar shows (`open`, none while it is closed), and the verbs that change it on this page, keeping its path and every other key of
 * its search: `show` a thing, as a new entry in the history, so Back closes it; `close` it in place of the current entry, so Back does not
 * open it again; and `toggle`, which closes it for the thing it shows and shows anything else. None of them scrolls the page, beside which
 * the sheet stands.
 */
export function useBar(): { open: Bar | undefined; show: (bar: Bar) => void; close: () => void; toggle: (bar: Bar) => void } {
  const open = barOf(useSearch({ strict: false }).bar);
  const navigate = useNavigate();
  const go = useCallback(
    (bar: Bar | undefined, replace: boolean) =>
      void navigate({
        to: '.',
        search: (search: Record<string, unknown>) => ({ ...search, bar: bar ? barValue(bar) : undefined }),
        replace,
        resetScroll: false,
      }),
    [navigate],
  );
  return {
    open,
    show: (bar) => go(bar, false),
    close: () => go(undefined, true),
    toggle: (bar) => {
      const next = nextBar(open, bar);
      go(next, next === undefined);
    },
  };
}
