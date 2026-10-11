/**
 * One worker of `npm run e2e` (run.ts starts them): a store of its own, seeded, served by an api and `vite preview` of its own, and its
 * share of the pages visited in a browser of its own, so no page's write crosses into another worker's pages.
 *
 *     node test/e2e/worker.ts --worker <i> --store <empty dir> --result <file> [--pages <name,…>] [--photos]
 *
 * Started by run.ts, it asks run.ts for each page it visits next, over the channel run.ts opens with it; started by hand, it visits
 * every page its plan names, in their order.
 *
 *  1. Seeds the store, which must be empty, with six fake runs, the first with a real repository and branch to decide on, and beside it
 *     a checkout for the api to serve (`HKB_REPO`) on the Capabilities page, and workflows in both for the Workflows page (seed.ts).
 *  2. Starts the api on a free port (`PORT=0`, reading the port it prints), ticking nothing (`--no-tick`: the pages seed the store's
 *     daemon themselves), and `vite preview` of the app run.ts built on another, proxying `/api` to it (`HKB_API_URL`, vite.config.ts):
 *     the same two processes and the same proxy as `npm run dev`, never on :8787 or :5173, so it runs beside a person's dev servers, the
 *     other workers and another worktree's e2e.
 *  3. Takes the store's fingerprint (print.ts), visits its pages one at a time (visit.ts), each in a browser context of its own, and
 *     takes it again: a page that left a write it did not take back fails the worker, naming the files.
 *  4. Writes what it did to `--result`, as JSON: its store, the port of its api and the address of its app, what each page took, its
 *     pictures, and why it failed, or null — run.ts reads it to refuse two workers that share one (`apart`) and to rank the pages.
 *
 * Exits 1 on the first failure, after writing its result, saying why last (`exitOn`). Both servers are stopped and the store removed on
 * the way out: on success, on failure, and on a signal.
 */
import fs from 'node:fs';
import { loadPages, planOf } from './pages.ts';
import { fingerprint, leftOver } from './print.ts';
import type { PageTiming } from './timing.ts';
import { exitOn, launch, visitAll, type PageSpec } from './visit.ts';
import { cleanUp, serveStore, stopOnTheWayOut, tails } from './served.ts';
import { OUT } from './world.ts';

/** What a worker writes to its `--result` file, for run.ts. */
export type WorkerResult = {
  worker: number;
  store: string;
  apiPort?: string;
  base?: string;
  setupMs: number;
  ms: number;
  timings: PageTiming[];
  shots: string[];
  failure: string | null;
  tails: string;
};

/** The worker's command line: its number, its store, its result file, and the rest for `planOf`. */
function argsOf(argv: readonly string[]): { worker: number; store: string; result: string; rest: string[] } {
  const rest: string[] = [];
  const own: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (['--worker', '--store', '--result'].includes(argv[i])) own[argv[i]] = argv[++i] ?? '';
    else rest.push(argv[i]);
  }
  const worker = Number(own['--worker']);
  if (!Number.isInteger(worker) || !own['--store'] || !own['--result'])
    throw new Error('usage: node test/e2e/worker.ts --worker <i> --store <empty dir> --result <file> [--pages <name,…>] [--photos]');
  return { worker, store: own['--store'], result: own['--result'], rest };
}


/**
 * The next page run.ts hands this worker, or null when it has none left: asked over the channel run.ts opened with it. A channel run.ts
 * closed, as it does when it ends, has none left either.
 */
const handed = (): Promise<string | null> =>
  new Promise((resolve) => {
    const answer = (said: { page?: unknown }) => {
      process.off('disconnect', gone);
      resolve(typeof said?.page === 'string' ? said.page : null);
    };
    const gone = () => {
      process.off('message', answer);
      resolve(null);
    };
    process.once('message', answer);
    process.once('disconnect', gone);
    process.send!({ next: true });
  });

/**
 * The pages worker `worker` visits, one at a time, from `own`, every page its plan names: each asked of run.ts as the last is done
 * (`queueOf`, workers.ts), or, started by hand with no channel to it, all of `own` in their order. A name that is none of `own` is refused.
 */
async function* pagesOf(own: Iterable<PageSpec>, worker: number): AsyncGenerator<PageSpec> {
  const pages = [...own];
  if (!process.send) return yield* pages;
  const byName = new Map(pages.map((page) => [page.name, page]));
  for (let name = await handed(); name !== null; name = await handed()) {
    const page = byName.get(name);
    if (!page) throw new Error(`worker ${worker}: run.ts handed it ${name}, which is not a page its plan visits`);
    yield page;
  }
}

/**
 * Seeds the store and serves it (`serveStore`, served.ts), and visits the worker's pages. `seat` is filled in as the worker learns where
 * it serves, for the result a failure writes.
 */
async function main(seat: WorkerResult, rest: readonly string[]): Promise<void> {
  const started = performance.now();
  const plan = planOf(rest, await loadPages());
  const root = seat.store;
  const { base } = await serveStore(root, seat);
  console.log(`e2e: api on :${seat.apiPort}, the built app on ${seat.base}, store ${root}`);
  const before = fingerprint(root);
  seat.setupMs = performance.now() - started;
  const browser = await launch();
  const visited: string[] = [];
  try {
    for await (const page of pagesOf(plan.visit, seat.worker)) {
      visited.push(page.name);
      const { timings, shots } = await visitAll(browser, base, [page], OUT, {
        store: root,
        themes: plan.themes,
        pictured: plan.pictured,
        worker: seat.worker,
      });
      seat.timings.push(...timings);
      seat.shots.push(...shots);
    }
  } finally {
    await browser.close();
  }
  const left = leftOver(before, fingerprint(root), visited);
  if (left) throw new Error(`worker ${seat.worker}: ${left}`);
  seat.ms = performance.now() - started;
}

const { worker, store: root, result, rest } = argsOf(process.argv.slice(2));
const seat: WorkerResult = { worker, store: root, setupMs: 0, ms: 0, timings: [], shots: [], failure: null, tails: '' };
stopOnTheWayOut('e2e');
const write = () => fs.writeFileSync(result, `${JSON.stringify(seat)}\n`);
exitOn(
  main(seat, rest).then(write, (err: unknown) => {
    seat.failure = err instanceof Error ? err.message : String(err);
    seat.tails = tails();
    write();
    throw err;
  }),
  cleanUp,
  tails,
);
