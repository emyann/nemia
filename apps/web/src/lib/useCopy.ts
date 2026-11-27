import { useEffect, useRef, useState } from 'react';

/** How long a copy control says it copied, or could not, before it offers to copy again, in milliseconds. */
export const COPY_REST_MS = 1_500;

/** What a copy control says: that it copies, that it copied, or that it could not. */
export type CopySaid = 'copy' | 'copied' | 'failed';

/**
 * Copies `text` the way a page without the clipboard's interface can, as one outside a secure context: selected in a textarea off the
 * screen, and the browser's copy command asked. The textarea goes and the focus returns where it was, whatever the command answered.
 * @param text The text to copy.
 */
function copyBySelection(text: string) {
  if (typeof document === 'undefined') return false;
  const was = document.activeElement as HTMLElement | null;
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  Object.assign(area.style, { position: 'fixed', top: '0', left: '-9999px', opacity: '0' });
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
    was?.focus();
  }
}

/**
 * Copies `text` to the clipboard and tells `say` what came of it — `copied`, or `failed` where neither the clipboard nor, where it refused
 * or the page has none, as outside a secure context, a copy of the text selected took it — then `copy` again `COPY_REST_MS` later.
 * Returns what stops it: nothing is said after that.
 * @param text The text to copy.
 * @param say Told what the control says, each time that changes.
 */
export function copyAndSay(text: string, say: (said: CopySaid) => void) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const sayFor = (said: CopySaid) => {
    if (stopped) return;
    say(said);
    timer = setTimeout(() => say('copy'), COPY_REST_MS);
  };
  const written = navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject(new Error('no clipboard'));
  written.then(
    () => sayFor('copied'),
    () => {
      if (!stopped) sayFor(copyBySelection(text) ? 'copied' : 'failed');
    },
  );
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

/**
 * The board's one copy control's state: `copy` copies `text`, and `said` says so for `COPY_REST_MS` — or that it could not, so a person
 * selects it instead — then rests. A second press starts the moment again; leaving the page stops it.
 * @param text The text the control copies.
 */
export function useCopy(text: string) {
  const [said, setSaid] = useState<CopySaid>('copy');
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);
  const copy = () => {
    stop.current?.();
    stop.current = copyAndSay(text, setSaid);
  };
  return { said, copy };
}
