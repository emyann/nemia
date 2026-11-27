/**
 * What a story's play learns of the server-sent streams the page opens: each the browser's own, watched while a play's moves run and
 * passed through untouched (`streamsOf`), so a play can say how many were opened and how many its moves left open.
 */

/** How many streams a play's moves opened, and how many of them were still open once the moves ended. */
type Streams = { opened: number; open: number };

/**
 * The streams the page opens while `during` runs: the browser's stream constructor is watched, each stream it makes kept, and given back
 * whatever `during` does.
 * @param during The play's moves.
 */
export async function streamsOf(during: () => Promise<void>) {
  const made: EventSource[] = [];
  const Real = window.EventSource;
  window.EventSource = class extends Real {
    constructor(url: string | URL, init?: EventSourceInit) {
      super(url, init);
      made.push(this);
    }
  };
  try {
    await during();
  } finally {
    window.EventSource = Real;
  }
  return { opened: made.length, open: made.filter((stream) => stream.readyState !== Real.CLOSED).length } satisfies Streams;
}
