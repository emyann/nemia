/**
 * The frame's floating bar, for the pages that open it: what it shows, read from the address, and the verbs that change it there; and its
 * one width, kept by this browser for every page.
 */
import { useCallback, useState, useSyncExternalStore } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { BAR_KEY, barOf, barValue, barWidth, nextBar, parseWidth, type Bar } from './bar.ts';

/**
 * What the bar shows (`open`, none while it is closed), and the verbs that change it on this page, keeping its path and every other key of
 * its search: `show` a thing, as a new entry in the history, so Back closes it; `close` it in place of the current entry, so Back does not
 * open it again; and `toggle`, which closes it for the thing it shows and shows anything else.
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

/** Calls `onChange` each time the window changes size, and returns what stops it. */
const onResize = (onChange: () => void) => {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
};
const viewportWidth = () => window.innerWidth;

/** The width this browser keeps for the bar: the default where nothing is kept or storage is refused. */
function storedWidth(): number {
  try {
    return parseWidth(localStorage.getItem(BAR_KEY));
  } catch {
    return parseWidth(null);
  }
}

/** Keeps `width` for every page: where storage is refused or full, nothing is kept, and the width lasts as long as the page does. */
function storeWidth(width: number): void {
  try {
    localStorage.setItem(BAR_KEY, String(width));
  } catch {}
}

/**
 * The bar's width, drawn in this window (`barWidth`) and drawn again each time the window changes size, and what sets it: a width given in
 * pixels, held to the window and kept by this browser for every page.
 */
export function useBarWidth(): [number, (width: number) => void] {
  const [stored, setStored] = useState(storedWidth);
  const viewport = useSyncExternalStore(onResize, viewportWidth, () => 1280);
  const set = (width: number) => {
    const held = barWidth(width, viewportWidth());
    setStored(held);
    storeWidth(held);
  };
  return [barWidth(stored, viewport), set];
}
