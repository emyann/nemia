import { useEffect } from 'react';

/** How long a scroll bar stays shown after the last scroll of what it scrolls, in milliseconds. */
export const LINGER_MS = 900;

/** The attribute that says whether what scrolls is scrolling, which the board's styles draw its scroll bar from. */
export const BAR = 'data-scroll-bar';

/** Runs `run` once `ms` have passed, and returns what takes that back. */
export type Later = (run: () => void, ms: number) => () => void;

const timer: Later = (run, ms) => {
  const id = setTimeout(run, ms);
  return () => clearTimeout(id);
};

/** What a scroll is heard on: a document, or a stand-in that keeps the listener it is given. */
export type ScrollSource = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

/** What a mark is written on: an element. */
type Marked = Pick<Element, 'setAttribute'>;

/** What scrolled, by a scroll event's target: a document's root element for the page's own scroll, else the element. */
function scrollerOf(target: unknown): Marked | null {
  if (typeof target !== 'object' || target === null) return null;
  const at = 'documentElement' in target ? target.documentElement : target;
  return typeof at === 'object' && at !== null && 'setAttribute' in at && typeof at.setAttribute === 'function' ? (at as Marked) : null;
}

/**
 * Marks what scrolls under `source` while it scrolls: every scroll heard there, of the page or of any element, on its way down,
 * writes `data-scroll-bar="shown"` on what scrolled, and `data-scroll-bar="rest"` once `LINGER_MS` have passed with no scroll of
 * it. The attribute is written only when it changes. Scrolling itself is left to the browser: the listener is passive.
 *
 * @param source where scrolls are heard, a document
 * @param later what runs a function after a time, a timer unless a test steps it by hand
 * @returns what undoes it: no scroll is heard after, and what was shown is at rest
 */
export function markScrolls(source: ScrollSource, later: Later = timer): () => void {
  const shown = new Map<Marked, () => void>();
  const heard = (event: Event): void => {
    const scroller = scrollerOf(event.target);
    if (!scroller) return;
    const forget = shown.get(scroller);
    if (forget) forget();
    else scroller.setAttribute(BAR, 'shown');
    shown.set(
      scroller,
      later(() => {
        shown.delete(scroller);
        scroller.setAttribute(BAR, 'rest');
      }, LINGER_MS),
    );
  };
  source.addEventListener('scroll', heard, { capture: true, passive: true });
  return () => {
    source.removeEventListener('scroll', heard, { capture: true });
    for (const [scroller, forget] of shown) {
      forget();
      scroller.setAttribute(BAR, 'rest');
    }
    shown.clear();
  };
}

/** Marks what scrolls on the page for as long as the caller is mounted (`markScrolls`): the frame mounts it once. */
export function useScrollMark(): void {
  useEffect(() => markScrolls(document), []);
}
