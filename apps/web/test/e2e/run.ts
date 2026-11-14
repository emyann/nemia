/**
 * `npm run e2e`: the web app, built, served against seeded stores, and looked at in a browser, by workers in parallel.
 *
 *     npm run e2e [-- [--look] [--photos [--contrast]] [--pages <name,…>] [--shard <i> --of <n>] [--workers <n>]]
 *
 *  0. Reads its plan from its command line (`planOf`, pages.ts), refusing a flag or a page it does not know before anything else.
 *  1. With `--look`, or with no `--pages`, `--shard` or `--look` (the whole e2e), runs the look's browser tests first, two files at a
 *     time (`lookTests`, look.ts), and stops there when it visits no page (`--look` alone). `--pages` and a shard run none of them.
 *  2. Builds the web app, once, unless `dist/` is already the build of the sources as they stand (`current`, built.ts): never in CI.
 *  3. Hands the pages it visits to workers, one at a time as each asks (`queueOf`, workers.ts): half the machine's cores, or as many as
 *     `--workers` asks, capped by as many as its free memory holds and by the pages (`workersFor`); `--workers` can lower the count,
 *     never raise it past free memory, and a run given fewer than it asked says so on one line before it starts them.
 *  4. Makes an empty store for each, refusing two that are one (`apart`), and starts each worker (worker.ts), which seeds its store,
 *     serves it with an api and `vite preview` of its own, and visits the pages it is handed in its own Chromium, in the dark theme: no
 *     console error, no failed request, the page in the theme asked for, and the elements the page must have. With `--pages`, only the
 *     pages named; with `--photos`, each in a light and then a dark theme. Each worker's lines are said as it says them, after `[w<i>]`.
 *  5. Takes no picture but a failing page's. With `--photos`, screenshots each page visited in each theme, with the pictures the page
 *     takes of itself, into $WF_ARTIFACTS when a run gives one — the step's files directory — and into `.e2e/` at the repository root
 *     otherwise.
 *  6. Reads what each worker wrote, refusing two that served one store, api or app (`apart`); and says last the ten slowest pages, what
 *     each worker took, and how many pages passed, in which themes, in how many seconds. A whole run — every page, in the dark theme —
 *     says what its pages cost summed, and fails when that passes their bound, naming its slowest pages (`overBound`, timing.ts); its
 *     own time refuses nothing, and is said when it passed a step's tool (`pastTool`). A run of one shard (`--shard <i> --of <n>`) is
 *     a run of some pages, held to no bound either; it writes its page times to `pages-<i>-of-<n>.json` in the same place the pictures
 *     go, for the shards of one run to be summed against that bound together afterwards (`pages-bound.ts`).
 *
 * Exits non-zero when a worker fails, saying each failure, and last the first by the pages' order, naming the page, the theme and the
 * assertion, with a screenshot of what the page looked like. A worker stops at its first failing page; its seat then starts another on
 * a fresh store for the pages left, so one run names every failing page of its batch, up to `FAILURES_NAMED` (`startsAgain`,
 * workers.ts), and says their names together before it ends. On a signal, every worker is stopped and every store removed. The assertions
 * are made to refuse in checks.test.ts, the visiting and the exit (visit.ts) in visit.test.ts, and a full-page picture of a tall page with
 * its frame where the window was in photograph.test.ts, all of which `--look` runs, and a whole `npm run e2e` first.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { current, inputsOf, stamp } from './built.ts';
import { lookTests } from './look.ts';
import { loadPages, planOf } from './pages.ts';
import { overBound, pagesLine, pastTool, rankLines, type PageTiming, type ShardPages } from './timing.ts';
import { exitOn } from './visit.ts';
import {
  apart,
  FAILURES_NAMED,
  failedInOrder,
  fewerThanAsked,
  pageNamed,
  queueOf,
  startsAgain,
  workersFor,
  type PageQueue,
  type Seat,
} from './workers.ts';
import type { WorkerResult } from './worker.ts';
import { fromNodeModules, OUT, plain, REPO, WEB } from './world.ts';

/** How many of the slowest pages a run says at its end. */
const RANKED = 10;

const children: ChildProcess[] = [];
const stores: string[] = [];
let results: WorkerResult[] = [];
/** The failure a failing run ends with: the first by the pages' order. */
let first: WorkerResult | undefined;

/** Stop every worker and remove every store. Idempotent: `exit` runs it again after a signal did. */
function cleanUp(): void {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  }
  for (const store of stores) fs.rmSync(store, { recursive: true, force: true });
}
process.on('exit', cleanUp);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, () => {
    console.error(`\ne2e: ${signal} — stopping the workers`);
    cleanUp();
    process.exit(128 + os.constants.signals[signal]);
  });
}

/** Each line `from` says, after `prefix`, onto `to`, a whole line at a time; resolves once `from` ends. */
function relay(from: NodeJS.ReadableStream, to: NodeJS.WritableStream, prefix: string, kept: string[]): Promise<void> {
  let partial = '';
  const say = (line: string) => {
    kept.push(line);
    if (kept.length > 30) kept.shift();
    to.write(`${prefix}${line}\n`);
  };
  from.on('data', (chunk: Buffer) => {
    const lines = (partial + chunk.toString()).split('\n');
    partial = lines.pop() ?? '';
    lines.forEach(say);
  });
  return new Promise((resolve) => {
    from.on('end', () => {
      if (partial) say(partial);
      resolve();
    });
  });
}

/** A worker's result, and how many pages it was handed. */
type Ran = { result: WorkerResult; handed: number };

/**
 * Worker `i` started on `store` with `args`, handed its pages from `queue` one at a time as it asks; resolves with what it wrote to its
 * result file `result`, or a failure saying how it ended without one, and with how many pages it was handed.
 */
async function runWorker(i: number, store: string, args: readonly string[], result: string, queue: PageQueue<string>): Promise<Ran> {
  let handed = 0;
  const worker = path.join(import.meta.dirname, 'worker.ts');
  const child = spawn(process.execPath, [worker, '--worker', String(i), '--store', store, '--result', result, ...args], {
    cwd: WEB,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  children.push(child);
  child.on('message', () => {
    if (!child.connected) return;
    const page = queue.next();
    if (page !== null) handed++;
    child.send({ page });
  });
  const kept: string[] = [];
  const ended = new Promise<string>((resolve) => child.on('exit', (code, signal) => resolve(signal ?? `code ${code}`)));
  await Promise.all([relay(child.stdout!, process.stdout, `[w${i}] `, kept), relay(child.stderr!, process.stderr, `[w${i}] `, kept)]);
  const how = await ended;
  if (fs.existsSync(result)) return { result: JSON.parse(fs.readFileSync(result, 'utf8')) as WorkerResult, handed };
  return {
    handed,
    result: {
      worker: i,
      store,
      setupMs: 0,
      ms: 0,
      timings: [],
      shots: [],
      failure: `worker ${i} ended (${how}) without saying what it did. What it said last:\n    ${kept.join('\n    ')}`,
      tails: '',
    },
  };
}

/** How many workers of this run have failed, over every seat. */
let failed = 0;
/** How many pages the queue still held when the run stopped it. */
let unvisited = 0;

/**
 * Seat `seat`'s workers, one after another, and what each did: the first on the seat's store, and after one that failed another on a
 * fresh store for the pages left, while the run still names failures (`startsAgain`); once it does not, the queue is stopped and no
 * worker starts another page.
 */
async function runSeat(seat: Seat, args: readonly string[], dir: string, queue: PageQueue<string>): Promise<WorkerResult[]> {
  const did: WorkerResult[] = [];
  for (let store = seat.store; ; store = fs.mkdtempSync(path.join(os.tmpdir(), 'nemia-e2e-'))) {
    stores.push(store);
    const { result, handed } = await runWorker(seat.worker, store, args, path.join(dir, `worker-${seat.worker}-${did.length}.json`), queue);
    did.push(result);
    if (!result.failure) return did;
    failed++;
    if (!startsAgain({ handed, failed, left: queue.left() })) {
      unvisited = Math.max(unvisited, queue.left());
      queue.stop();
      return did;
    }
    console.log(`e2e: worker ${seat.worker} starts again on a fresh store for the ${queue.left()} pages left`);
  }
}

/**
 * The web app, built into `dist/`, once, for every worker's `vite preview` to serve; not built again where `dist/` is already the build
 * of the sources as they stand (`current`).
 */
function build(): void {
  const inputs = inputsOf(WEB, REPO);
  if (current(WEB, inputs)) {
    console.log('e2e: the web app in dist/ is the build of these sources, so it is not built again (rm -rf apps/web/dist to build it)');
    return;
  }
  console.log('e2e: building the web app');
  try {
    execFileSync(process.execPath, [fromNodeModules(path.join('vite', 'bin', 'vite.js')), 'build'], { cwd: WEB, stdio: 'pipe' });
  } catch (err) {
    const { stdout, stderr } = err as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(plain(`the web app did not build:\n${String(stdout ?? '')}${String(stderr ?? '')}`), { cause: err });
  }
  stamp(WEB, inputsOf(WEB, REPO));
}

/**
 * What `shard` cost, written to `pages-<i>-of-<n>.json` in `OUT` — where the pictures go, $WF_ARTIFACTS when a run gives one and `.e2e/`
 * otherwise, so no caller says where the e2e writes — and the path it wrote. A shard is a run of some pages and is held to no bound of its
 * own; its times are written down for the shards of one run to be summed against that bound together afterwards (`pages-bound.ts`).
 */
function wroteShard(shard: { i: number; of: number }, timings: readonly PageTiming[]): string {
  const file = path.join(OUT, `pages-${shard.i}-of-${shard.of}.json`);
  const wrote: ShardPages = { shard: shard.i, of: shard.of, pages: [...timings] };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(wrote, undefined, 2)}\n`);
  return file;
}

/** The line saying what each worker took: its pages, its whole time and its setup. */
const workerLine = (r: WorkerResult): string =>
  `worker ${r.worker}: ${new Set(r.timings.map((t) => t.name)).size} pages in ${Math.round(r.ms / 1000)} s ` +
  `(seeding and serving ${Math.round(r.setupMs / 1000)} s)`;

/**
 * The run: loads the pages and reads its plan first, so a stray in pages/ or a bad command line is refused before the build, not after it;
 * builds the app; starts the workers over their shares, each on a store of its own; and reads what they did.
 */
async function main(): Promise<void> {
  const started = performance.now();
  const pages = await loadPages();
  const plan = planOf(process.argv.slice(2), pages);
  if (plan.look) await lookTests(children);
  if (!plan.visit.length) {
    console.log(`\ne2e: the look's tests passed in ${Math.round((performance.now() - started) / 1000)} s, and no page was asked for`);
    return;
  }
  build();
  const freeBytes = os.freemem();
  const n = workersFor({ cores: os.availableParallelism(), freeBytes, pages: plan.visit.length, asked: plan.workers });
  const fewer = fewerThanAsked({ asked: plan.workers, workers: n, freeBytes, pages: plan.visit.length });
  if (fewer) console.log(fewer);
  const queue = queueOf(plan.visit.map((p) => p.name));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nemia-e2e-run-'));
  stores.push(dir);
  const seats: Seat[] = Array.from({ length: n }, (_, worker) => {
    const store = fs.mkdtempSync(path.join(os.tmpdir(), 'nemia-e2e-'));
    stores.push(store);
    return { worker, store };
  });
  apart(seats);
  console.log(`e2e: ${plan.visit.length} pages over ${n} worker${n > 1 ? 's' : ''} (${Math.round(os.freemem() / 2 ** 20)} MB free)`);
  const flags = [...(plan.themes.length > 1 ? ['--photos'] : []), ...(plan.measured ? ['--contrast'] : [])];
  const bySeat = await Promise.all(seats.map((seat) => runSeat(seat, flags, dir, queue)));
  results = bySeat.flat();
  apart(bySeat.map((did) => did.at(-1)!));
  const order = plan.visit.map((p) => p.name);
  const failures = failedInOrder(results, order);
  for (const other of failures.slice(1).reverse()) console.error(`\ne2e: worker ${other.worker} FAILED — ${other.failure}${other.tails}`);
  first = failures[0];
  if (failures.length > 1) {
    const names = failures.map((f) => pageNamed(f.failure!) ?? 'a worker, naming no page');
    const line =
      `\ne2e: ${failures.length} failures: ${names.join(', ')}` +
      (unvisited > 0 ? `; ${unvisited} pages were handed to no worker, a run naming ${FAILURES_NAMED} failures at most` : '');
    console.error(line);
    console.log(line);
  }
  if (first) throw new Error(first.failure!);
  const shots = results.flatMap((r) => r.shots);
  const timings: PageTiming[] = results.flatMap((r) => r.timings);
  if (shots.length) console.log(`\ne2e: the pages pictured:\n${shots.map((shot) => `  ${shot}`).join('\n')}`);
  console.log(`\ne2e: the slowest pages:\n  ${rankLines(timings, RANKED).join('\n  ')}`);
  console.log(`\ne2e: ${results.map(workerLine).join('\n     ')}`);
  if (plan.whole) console.log(`     ${pagesLine(timings)}`);
  if (plan.shard)
    console.log(`\ne2e: shard ${plan.shard.i} of ${plan.shard.of} wrote its page times to ${wroteShard(plan.shard, timings)}`);
  const totalMs = performance.now() - started;
  const late = overBound(timings, plan.whole);
  if (late) throw new Error(late);
  const slow = pastTool(totalMs, results.length, plan.whole);
  if (slow) console.log(`\ne2e: ${slow}`);
  console.log(
    `\ne2e: ${plan.visit.length} of ${pages.length} pages passed in the ${plan.themes.join(' and ')} theme${plan.themes.length > 1 ? 's' : ''}` +
      ` in ${Math.round(totalMs / 1000)} s, over ${results.length} worker${results.length > 1 ? 's' : ''}`,
  );
}

exitOn(main(), cleanUp, () => first?.tails ?? '');
