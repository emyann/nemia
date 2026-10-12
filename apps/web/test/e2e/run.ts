/**
 * `npm run e2e`: the web app, built, served against seeded stores, and looked at in a browser, by workers in parallel.
 *
 *     npm run e2e [-- [--photos [--contrast]] [--pages <name,…>] [--workers <n>]]
 *
 *  0. Reads its plan from its command line (`planOf`, pages.ts), refusing a flag or a page it does not know before anything else.
 *  1. Builds the web app, once.
 *  2. Hands the pages it visits to workers, one at a time as each asks (`queueOf`, workers.ts): as many workers as `--workers` asks, else
 *     as many as the machine has room for (`workersFor`) — half its cores, as many as its free memory holds, no more than the pages.
 *  3. Makes an empty store for each, refusing two that are one (`apart`), and starts each worker (worker.ts), which seeds its store,
 *     serves it with an api and `vite preview` of its own, and visits the pages it is handed in its own Chromium, in the dark theme: no
 *     console error, no failed request, the page in the theme asked for, and the elements the page must have. With `--pages`, only the
 *     pages named; with `--photos`, each in a light and then a dark theme. Each worker's lines are said as it says them, after `[w<i>]`.
 *  4. Takes no picture but a failing page's. With `--photos`, screenshots each page visited in each theme, with the pictures the page
 *     takes of itself, into $WF_ARTIFACTS when a run gives one — the step's files directory — and into `.e2e/` at the repository root
 *     otherwise.
 *  5. Reads what each worker wrote, refusing two that served one store, api or app (`apart`); and says last the ten slowest pages, what
 *     each worker took, and how many pages passed, in which themes, in how many seconds. A whole run — every page, in the dark theme —
 *     says what its pages cost summed, and fails when that passes their bound, naming its slowest pages (`overBound`, timing.ts); its
 *     own time refuses nothing, and is said when it passed a step's tool (`pastTool`).
 *
 * Exits non-zero when a worker fails, saying each failure, and last the first by the pages' order, naming the page, the theme and the
 * assertion, with a screenshot of what the page looked like. On a signal, every worker is stopped and every store removed. The assertions
 * are made to refuse in checks.test.ts, the visiting and the exit (visit.ts) in visit.test.ts, and a full-page picture of a tall page with
 * its frame where the window was in photograph.test.ts, all of which `npm run e2e` runs first.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadPages, planOf } from './pages.ts';
import { overBound, pagesLine, pastTool, rankLines, type PageTiming } from './timing.ts';
import { exitOn } from './visit.ts';
import { apart, failedInOrder, queueOf, workersFor, type PageQueue, type Seat } from './workers.ts';
import type { WorkerResult } from './worker.ts';
import { fromNodeModules, plain, WEB } from './world.ts';

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

/**
 * Worker `i` started on `store` with `args`, handed its pages from `queue` one at a time as it asks; resolves with what it wrote to its
 * result, or a failure saying how it ended without one. A worker that fails stops the queue: no worker starts another page.
 */
async function runWorker(i: number, store: string, args: readonly string[], dir: string, queue: PageQueue<string>): Promise<WorkerResult> {
  const result = path.join(dir, `worker-${i}.json`);
  const worker = path.join(import.meta.dirname, 'worker.ts');
  const child = spawn(process.execPath, [worker, '--worker', String(i), '--store', store, '--result', result, ...args], {
    cwd: WEB,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  children.push(child);
  child.on('message', () => {
    if (child.connected) child.send({ page: queue.next() });
  });
  const kept: string[] = [];
  const ended = new Promise<string>((resolve) =>
    child.on('exit', (code, signal) => {
      if (code !== 0) queue.stop();
      resolve(signal ?? `code ${code}`);
    }),
  );
  await Promise.all([relay(child.stdout!, process.stdout, `[w${i}] `, kept), relay(child.stderr!, process.stderr, `[w${i}] `, kept)]);
  const how = await ended;
  if (fs.existsSync(result)) return JSON.parse(fs.readFileSync(result, 'utf8')) as WorkerResult;
  return {
    worker: i,
    store,
    setupMs: 0,
    ms: 0,
    timings: [],
    shots: [],
    failure: `worker ${i} ended (${how}) without saying what it did. What it said last:\n    ${kept.join('\n    ')}`,
    tails: '',
  };
}

/** The web app, built into `dist/`, once, for every worker's `vite preview` to serve. */
function build(): void {
  console.log('e2e: building the web app');
  try {
    execFileSync(process.execPath, [fromNodeModules(path.join('vite', 'bin', 'vite.js')), 'build'], { cwd: WEB, stdio: 'pipe' });
  } catch (err) {
    const { stdout, stderr } = err as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(plain(`the web app did not build:\n${String(stdout ?? '')}${String(stderr ?? '')}`), { cause: err });
  }
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
  build();
  const n = workersFor({ cores: os.availableParallelism(), freeBytes: os.freemem(), pages: plan.visit.length, asked: plan.workers });
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
  results = await Promise.all(seats.map((seat) => runWorker(seat.worker, seat.store, flags, dir, queue)));
  apart(results);
  const order = plan.visit.map((p) => p.name);
  const failures = failedInOrder(results, order);
  for (const failed of failures.slice(1).reverse())
    console.error(`\ne2e: worker ${failed.worker} FAILED — ${failed.failure}${failed.tails}`);
  first = failures[0];
  if (first) throw new Error(first.failure!);
  const shots = results.flatMap((r) => r.shots);
  const timings: PageTiming[] = results.flatMap((r) => r.timings);
  if (shots.length) console.log(`\ne2e: the pages pictured:\n${shots.map((shot) => `  ${shot}`).join('\n')}`);
  console.log(`\ne2e: the slowest pages:\n  ${rankLines(timings, RANKED).join('\n  ')}`);
  console.log(`\ne2e: ${results.map(workerLine).join('\n     ')}`);
  if (plan.whole) console.log(`     ${pagesLine(timings)}`);
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
