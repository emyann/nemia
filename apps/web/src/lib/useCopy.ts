import { useEffect, useRef, useState } from 'react';

/** How long a copy control says it copied, or could not, before it offers to copy again, in milliseconds. */
export const COPY_REST_MS = 1_500;

/** What a copy control says: that it copies, that it copied, or that it could not. */
export type CopySaid = 'copy' | 'copied' | 'failed';

/**
 * Copies `text` to the clipboard and tells `say` what came of it — `copied`, or `failed` where the clipboard refused it or the page has
 * none, as outside a secure context — then `copy` again `COPY_REST_MS` later. Returns what stops it: nothing is said after that.
 */
export function copyAndSay(text: string, say: (said: CopySaid) => void): () => void {
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
    () => sayFor('failed'),
  );
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

/**
 * The board's one copy control's state: `copy` copies `text`, and `said` says so for `COPY_REST_MS` — or that it could not, so a person
 * selects it instead — then rests. A second press starts the moment again; leaving the page stops it.
 */
export function useCopy(text: string): { said: CopySaid; copy: () => void } {
  const [said, setSaid] = useState<CopySaid>('copy');
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);
  const copy = () => {
    stop.current?.();
    stop.current = copyAndSay(text, setSaid);
  };
  return { said, copy };
}
