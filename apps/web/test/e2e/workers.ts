/**
 * How a run of the e2e splits its pages between workers, each a process of its own with its own seeded store, api, `vite preview` and
 * browser (worker.ts): how many (`workersFor`), which pages each visits (`shard`), and the refusal of two workers that share a store, an
 * api or an app (`apart`), where a write one page makes would reach another worker's pages. Pure: `e2e-workers.test.ts` holds it.
 */
import path from 'node:path';

/**
 * The memory one worker takes at its peak, with room: Chromium, the api and `vite preview`, sampled with `ps` over a whole run at four
 * workers, the largest worker's tree at about 1.5 times its peak.
 */
export const PER_WORKER_BYTES = 1_200 * 1024 * 1024;

/**
 * The pages each of `n` workers visits: page i goes to worker i mod n, so neighbours, which are often alike in cost, are spread; each
 * worker's in the order given, which is the order of the pages. Never an empty worker: `n` is cut to the number of pages.
 */
export function shard<P>(pages: readonly P[], n: number): P[][] {
  const workers = Math.max(1, Math.min(n, pages.length));
  return Array.from({ length: workers }, (_, w) => pages.filter((_, i) => i % workers === w));
}

/**
 * How many workers a run takes: `asked`, when the command line gives it; else half the machine's `cores`, as many as its `freeBytes` hold
 * at `PER_WORKER_BYTES` each, and no more than there are `pages` — the least of the three, and at least one.
 */
export function workersFor({
  cores,
  freeBytes,
  pages,
  asked,
}: {
  cores: number;
  freeBytes: number;
  pages: number;
  asked?: number;
}): number {
  if (asked !== undefined) return Math.max(1, Math.min(asked, pages));
  return Math.max(1, Math.min(Math.floor(cores / 2), Math.floor(freeBytes / PER_WORKER_BYTES), pages));
}

/** A worker as a run knows it: its number, its store, and once it reports them, the port of its api and the address of its app. */
export type Seat = { worker: number; store: string; apiPort?: string; base?: string };

const SHARED = [
  ['store', (seat: Seat) => path.resolve(seat.store)],
  ['api port', (seat: Seat) => seat.apiPort],
  ['app', (seat: Seat) => seat.base],
] as const;

/**
 * Refuses two workers that share a store, an api port or an app, naming both and what they share: a page's write would cross into the
 * other's pages. A value a worker has not reported yet is shared with no one.
 */
export function apart(seats: readonly Seat[]): void {
  for (const [word, of] of SHARED) {
    const by = new Map<string, number>();
    for (const seat of seats) {
      const value = of(seat);
      if (value === undefined) continue;
      const other = by.get(value);
      if (other !== undefined)
        throw new Error(
          `workers ${other} and ${seat.worker} share one ${word}, ${value}: each worker seeds a store of its own and serves it alone, ` +
            "or one page's write reaches the other's pages. Give each its own (run.ts makes a store for each, and each starts on port 0).",
        );
      by.set(value, seat.worker);
    }
  }
}
