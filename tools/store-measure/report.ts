/**
 * What the store's reads cost, measured on a copy of it: `node --expose-gc tools/store-measure/report.ts [--from <wf-root>]
 * [--engine <ae-root>] [--repeat N] [--json <file>] [--compare <baseline.json>]`.
 *
 * It copies the workflows' store (`--from`, `WF_ROOT` or `~/.agent-workflows`, its runtime's journals under `engine/` with it) and the
 * runtime's own (`--engine`, `AE_ROOT` or `~/.agent-engine`) into a fresh temp folder, leaving out what no read opens and what would tie
 * the copy to the live machine (`LEFT_OUT` in `fence.ts`), and refusing a temp folder inside either store; points `WF_ROOT` and `AE_ROOT`
 * at the copy before the orchestrator loads (it pins its root as it loads); and times five reads there, each cold — the first call over
 * memos that hold nothing — and warm — called again with what the memos kept — as the median over `--repeat` calls and the heap each
 * left held after a collection:
 *
 * - `tickPass`: a pass of the tick (`tickRun`, `WF_VERIFY_REST` off), over an engine built afresh for each cold pass (the tick's memo of
 *   runs at rest is kept per engine) and kept for the warm ones. The runtime's own pass is not run: the engine's `tick` answers a report
 *   that saw nothing, so no session is admitted, started, observed in a pass or stopped, and every task the pass reads is read off its
 *   journal (`passEngine`). The place answers reads and refuses every write (`readOnlyPlace`); the fence refuses any child process but a
 *   read of git, a write outside the copy and a signal (`installFence`). What the pass files lands in the copy's journals and goes no
 *   further.
 * - `runList`, `stats`: `GET /api/runs` and `GET /api/stats`, asked of the api in this process (`app.request`), over an app built
 *   afresh for each cold call (its `ReadMemo` new) and kept for the warm ones.
 * - `finishedRun`, `openRun`: `GET /api/runs/:id` of the newest run finished and of the newest still open, by `createdAt`; null where
 *   the store has none.
 * - `feedFromCursor`: `GET /api/feed/stream` from the cursor `FEED_BACK` lines before the workflow feed's end, read until its last line
 *   came, then let go.
 *
 * Beside the numbers: the runs, finished and open, the runtime's tasks and their journals' bytes, the runs whose tasks did not read
 * and the pass's unreadable lines, and `invariantRefusals`, the records the Run model refuses. A markdown table on stdout; with
 * `--json`, the report as JSON with the machine, the commit and the date; with `--compare`, each number beside the baseline's and
 * their ratio. It refuses itself, exit 1 and no JSON, where the fence refused anything; exit 2 for a call it cannot run. The copy is
 * removed at the end. No threshold is fixed: the numbers are the owner's to judge.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Effect, Layer, Logger } from 'effect';
import type { Pass, RunSummary } from 'agent-orchestrator';
import {
  AE_LEFT_OUT,
  copyStore,
  destinationRefusal,
  installFence,
  placeRefused,
  readOnlyPlace,
  type Fence,
  type Refusal,
} from './fence.ts';

/** The five reads, the run's page counted twice: each a key of the report's `measures`. */
export const MEASURES = ['tickPass', 'runList', 'stats', 'finishedRun', 'openRun', 'feedFromCursor'] as const;

/** A read the report measures. */
export type MeasureKey = (typeof MEASURES)[number];

/** One read's cost: the median of its calls in milliseconds, and the median heap it left held after a collection, in megabytes. */
export type Timed = { ms: number; heapMb: number };

/** A read cold and warm. */
export type Measured = { cold: Timed; warm: Timed };

/** How far before the feed's end its read starts, in lines. */
export const FEED_BACK = 1000;

/** What the report says, as `--json` writes it and `--compare` reads it. */
export type StoreMeasure = {
  machine: { cpu: string; cores: number; memoryBytes: number; node: string; platform: string };
  commit: string;
  date: string;
  repeat: number;
  from: string;
  engine: string;
  copy: { files: number; bytes: number; ms: number; leftOut: string[] };
  counts: {
    runs: number;
    finishedRuns: number;
    openRuns: number;
    tasks: number;
    journalBytes: number;
    feedLines: number;
    /** Runs the list answered off their record because a task's journal did not read, and the lines the pass said were unreadable. */
    unreadable: { runs: number; passLines: number };
    /** The records the Run model refuses (`invariantRefusals`). */
    invariantRefusals: number;
  };
  asked: { finishedRun: string | null; openRun: string | null; feedCursor: number; feedLinesRead: number };
  measures: Record<MeasureKey, Measured | null>;
  /** Each child process the reads ran, by verdict and program, counted. */
  spawned: Record<string, number>;
  /** Each write the place refused the pass, by verb, counted. */
  placeRefused: Record<string, number>;
  refusals: Refusal[];
};

/** What the command was asked. */
export type Asked = { from: string; engine: string; repeat: number; json?: string; compare?: string };

const USAGE =
  'usage: node --expose-gc tools/store-measure/report.ts [--from <wf-root>] [--engine <ae-root>] [--repeat N] [--json <file>] [--compare <baseline.json>]';

/** The arguments, each store an existing folder, or the words that say how to call it. */
export function argsOf(args: readonly string[], env: NodeJS.ProcessEnv): Asked | string {
  const given: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    if (!['--from', '--engine', '--repeat', '--json', '--compare'].includes(flag)) return `${flag} is not a flag of the measure. ${USAGE}`;
    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) return `${flag} takes a value. ${USAGE}`;
    given[flag] = value;
  }
  const home = env.HOME ?? os.homedir();
  const from = path.resolve(given['--from'] ?? env.WF_ROOT ?? path.join(home, '.agent-workflows'));
  const engine = path.resolve(given['--engine'] ?? env.AE_ROOT ?? path.join(home, '.agent-engine'));
  for (const [flag, dir] of [
    ['--from', from],
    ['--engine', engine],
  ])
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory())
      return `${dir} is no folder: name the store with ${flag} <folder>. ${USAGE}`;
  const repeat = given['--repeat'] ?? '5';
  if (!/^[1-9]\d*$/.test(repeat)) return `--repeat ${repeat} is not a count from 1: --repeat 5. ${USAGE}`;
  const at = (flag: string) => (given[flag] === undefined ? undefined : path.resolve(given[flag]));
  return { from, engine, repeat: Number(repeat), json: at('--json'), compare: at('--compare') };
}

/** The middle of `values`, the mean of the two middle ones for an even count. */
const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Collect the heap, which `--expose-gc` gives. */
const gc = (): void => (globalThis as { gc?: () => void }).gc!();

/** `read` timed, with the heap it left held after a collection. */
async function timed(read: () => Promise<unknown>): Promise<Timed> {
  gc();
  const before = process.memoryUsage().heapUsed;
  const t0 = performance.now();
  await read();
  const ms = performance.now() - t0;
  gc();
  return { ms, heapMb: (process.memoryUsage().heapUsed - before) / 1e6 };
}

/** The medians of `calls`. */
const medianOf = (calls: readonly Timed[]): Timed => ({ ms: median(calls.map((c) => c.ms)), heapMb: median(calls.map((c) => c.heapMb)) });

/** A store's root as a report writes it: under the home folder as `~/…`, so a committed baseline names no one's home. */
export const rootAsWritten = (root: string, home = os.homedir()): string =>
  root === home || root.startsWith(`${home}${path.sep}`) ? `~${root.slice(home.length)}` : root;

/**
 * The records the Run model refuses, among the runs of the copy at `wf`: each `runs/<id>.json` decoded with run-core's `Run`
 * (`packages/agent-orchestrator/src/record/record.model.ts`, its invariants included) after the store's own upgrade, a record that
 * is no JSON left to the unreadable count. The model is reached through the package's root, as `RunModel`, and imported after the
 * store is copied, as the rest is.
 */
export async function invariantRefusals(wf: string): Promise<number> {
  const { Exit, Schema } = await import('effect');
  const { RunModel } = await import('agent-orchestrator');
  const decode = Schema.decodeUnknownExit(RunModel.Run);
  let refused = 0;
  for (const name of filesOf(path.join(wf, 'runs'), '.json')) {
    let record: unknown;
    try {
      record = JSON.parse(fs.readFileSync(path.join(wf, 'runs', name), 'utf8'));
    } catch {
      continue;
    }
    if (Exit.isFailure(decode(RunModel.upgradeTries(record)))) refused += 1;
  }
  return refused;
}

/** The files of `dir` whose name ends with `suffix`, none where it is not there. */
const filesOf = (dir: string, suffix: string): string[] =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.endsWith(suffix)) : [];

/** The lines of `file` and the byte each starts at, none where it is not there. */
function lineStarts(file: string): number[] {
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file);
  const starts: number[] = [];
  let at = 0;
  while (at < text.length) {
    starts.push(at);
    const end = text.indexOf(10, at);
    if (end < 0) break;
    at = end + 1;
  }
  return starts;
}

/** The statuses a run has finished with. */
const FINISHED = new Set(['succeeded', 'failed', 'cancelled']);

type Orchestrator = typeof import('agent-orchestrator');
type Api = typeof import('api/src/app.ts');
type Built = ReturnType<Api['appOf']>;
type App = Built['app'];
type Place = Parameters<Orchestrator['PlaceService']['layer']>[0];

/**
 * The environment the copy at `root` is read under, set before the orchestrator loads: both roots on the copy, the memo's verification
 * off, worktrees kept, no daemon started and no collector. Answers the workflows' store of the copy.
 */
function pointAtCopy(root: string): string {
  const wf = path.join(root, 'wf');
  process.env.WF_ROOT = wf;
  process.env.AE_ROOT = path.join(root, 'ae');
  process.env.WF_VERIFY_REST = '0';
  process.env.WF_KEEP_WORKTREES = '1';
  process.env.NEMIA_DAEMON_START = 'off';
  for (const key of Object.keys(process.env)) if (key.startsWith('OTEL_')) delete process.env[key];
  return wf;
}

/** An api app over the copy, its runtime built and every memo of it empty, reading through `place`, saying no line. */
const appOver = async (api: Api, orch: Orchestrator, place: Place): Promise<Built> => {
  const built = api.appOf(Layer.mergeAll(api.liveOf(process.env), orch.PlaceService.layer(place), Logger.layer([])));
  await built.runtime.runPromise(Effect.void);
  return built;
};

/** `GET url` of `app`, its body read as JSON; thrown where it is not a 200. */
async function getJson(app: App, url: string): Promise<unknown> {
  const res = await app.request(url);
  const body = await res.text();
  if (res.status !== 200) throw new Error(`GET ${url} answered ${res.status} on the copy: ${body.slice(0, 300)}`);
  return JSON.parse(body) as unknown;
}

/** `read` over a fresh app for each of `repeat` cold calls, then over one app kept, after a first call that is not counted. */
async function overApps(fresh: () => Promise<Built>, read: (app: App) => Promise<unknown>, repeat: number): Promise<Measured> {
  const cold: Timed[] = [];
  for (let i = 0; i < repeat; i++) {
    const { app, runtime } = await fresh();
    cold.push(await timed(() => read(app)));
    await runtime.dispose();
  }
  const { app, runtime } = await fresh();
  await read(app);
  const warm: Timed[] = [];
  for (let i = 0; i < repeat; i++) warm.push(await timed(() => read(app)));
  await runtime.dispose();
  return { cold: medianOf(cold), warm: medianOf(warm) };
}

/** Where the feed's read starts and ends, and how many lines the last read of it took. */
type FeedRead = { file: string; lines: number; cursor: number; end: number; read: number };

/** The workflow feed of the copy at `wf`: its lines, the cursor `FEED_BACK` lines before its end, and its end. */
function feedOf(wf: string): FeedRead {
  const file = path.join(wf, 'feed.jsonl');
  const starts = lineStarts(file);
  const end = fs.existsSync(file) ? fs.statSync(file).size : 0;
  return { file, lines: starts.length, cursor: starts.length > FEED_BACK ? starts[starts.length - FEED_BACK] : 0, end, read: 0 };
}

/** The lines the events of `chunk` carry, and the cursor after the last; whether the stream's opening comment is among them. */
function eventsIn(chunk: readonly string[], cursor: number): { lines: number; cursor: number; opened: boolean } {
  let lines = 0;
  let opened = false;
  for (const event of chunk) {
    if (event.startsWith(':')) opened = true;
    const id = /^id: ?(\d+)$/m.exec(event);
    if (id && !/^event: ?bookmark$/m.test(event)) {
      lines++;
      cursor = Number(id[1]);
    }
  }
  return { lines, cursor, opened };
}

/** `GET /api/feed/stream` from `feed.cursor`, read until its last line came and then let go, or for two minutes at most. */
async function feedStreamed(app: App, feed: FeedRead): Promise<void> {
  const gone = new AbortController();
  const res = await app.request(`/api/feed/stream${feed.cursor ? `?after=${feed.cursor}` : ''}`, { signal: gone.signal });
  if (res.status !== 200 || !res.body) throw new Error(`GET /api/feed/stream answered ${res.status} on the copy: ${await res.text()}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const bound = setTimeout(() => gone.abort(), 120_000);
  let text = '';
  let at = { lines: 0, cursor: feed.cursor, opened: false };
  try {
    while (!at.opened || at.cursor < feed.end) {
      const { value, done } = await reader.read();
      if (done) throw new Error(`the feed's stream ended at ${at.cursor} of ${feed.end}, or its read went past two minutes`);
      const events = (text + decoder.decode(value, { stream: true })).split('\n\n');
      text = events.pop() ?? '';
      const seen = eventsIn(events, at.cursor);
      at = { lines: at.lines + seen.lines, cursor: seen.cursor, opened: at.opened || seen.opened };
    }
  } finally {
    clearTimeout(bound);
    gone.abort();
    await reader.cancel().catch(() => undefined);
  }
  feed.read = at.lines;
}

/**
 * A pass of the tick on the copy at `wf`, cold over an engine built afresh for each of `repeat` passes (the tick keeps its memo of runs
 * at rest per engine), then warm over one engine kept, after a first pass that is not counted; each pass with the fence armed for a
 * pass. Answers the measure and the last pass.
 */
async function tickMeasured(orch: Orchestrator, place: Place, fence: Fence, wf: string, repeat: number) {
  const program = orch
    .tickRun({ repo: wf, verifyRest: false })
    .pipe(Effect.provide(Layer.merge(orch.PlaceService.layer(place), orch.storeRootLayer(process.env))));
  let pass: Pass | undefined;
  const passOf = async (e: ReturnType<Orchestrator['engine']>) => {
    fence.arm('pass');
    try {
      pass = await orch.runWith(e, program);
    } finally {
      fence.arm('read');
    }
  };
  const cold: Timed[] = [];
  for (let i = 0; i < repeat; i++) {
    const e = passEngine(orch.engine(), fence);
    cold.push(await timed(() => passOf(e)));
  }
  const kept = passEngine(orch.engine(), fence);
  await passOf(kept);
  const warm: Timed[] = [];
  for (let i = 0; i < repeat; i++) warm.push(await timed(() => passOf(kept)));
  return { measured: { cold: medianOf(cold), warm: medianOf(warm) }, pass };
}

/** The newest run of `listing`, by `createdAt`, finished or not; null where there is none. */
const newestOf = (listing: readonly RunSummary[], finished: boolean): string | null =>
  listing
    .filter((r) => FINISHED.has(r.status) === finished)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .at(0)?.id ?? null;

/** The measure on the copy at `root`: `wf`, the workflows' store, and `ae`, the runtime's. */
async function measure(asked: Asked, root: string, fence: Fence) {
  const wf = pointAtCopy(root);
  fence.arm('read');
  const orch = await import('agent-orchestrator');
  const api = await import('api/src/app.ts');
  const place = readOnlyPlace(orch.shippedGitPlace);
  const fresh = () => appOver(api, orch, place);
  const { repeat } = asked;
  const first = await fresh();
  const listing = (await getJson(first.app, '/api/runs')) as RunSummary[];
  await first.runtime.dispose();
  const finishedRun = newestOf(listing, true);
  const openRun = newestOf(listing, false);
  const feed = feedOf(wf);
  const pageOf = (id: string | null) =>
    id === null ? null : overApps(fresh, (app) => getJson(app, `/api/runs/${encodeURIComponent(id)}`), repeat);
  const measures: Record<MeasureKey, Measured | null> = {
    runList: await overApps(fresh, (app) => getJson(app, '/api/runs'), repeat),
    stats: await overApps(fresh, (app) => getJson(app, '/api/stats'), repeat),
    finishedRun: await pageOf(finishedRun),
    openRun: await pageOf(openRun),
    feedFromCursor: await overApps(fresh, (app) => feedStreamed(app, feed), repeat),
    tickPass: null,
  };
  const { measured, pass } = await tickMeasured(orch, place, fence, wf, repeat);
  measures.tickPass = measured;
  fence.disarm();
  const tasks = filesOf(path.join(wf, 'engine', 'tasks'), '.jsonl');
  return {
    counts: {
      runs: filesOf(path.join(wf, 'runs'), '.json').length,
      finishedRuns: listing.filter((r) => FINISHED.has(r.status)).length,
      openRuns: listing.filter((r) => !FINISHED.has(r.status)).length,
      tasks: tasks.length,
      journalBytes: tasks.reduce((sum, name) => sum + fs.statSync(path.join(wf, 'engine', 'tasks', name)).size, 0),
      feedLines: feed.lines,
      unreadable: { runs: listing.filter((r) => r.unreadable !== null).length, passLines: pass?.unreadable?.length ?? 0 },
      invariantRefusals: await invariantRefusals(wf),
    },
    asked: { finishedRun, openRun, feedCursor: feed.cursor, feedLinesRead: feed.read },
    measures,
  };
}

/** The engine's verbs a pass on the copy may call: its reads, and the three writes that only append to the copy's journals. */
const PASS_VERBS = new Set([
  'view',
  'list',
  'path',
  'logs',
  'output',
  'transcript',
  'feed',
  'kept',
  'io',
  'tallied',
  'file',
  'admit',
  'stop',
]);

/**
 * `e` for a pass on the copy: its `tick`, the runtime's own pass, answers a report that saw nothing, so nothing is admitted, started,
 * observed or stopped by it; and every verb but `PASS_VERBS` is refused, kept among the fence's refusals, since one may reach a live
 * session (`answer`, `say`, `close`) or run the runtime (`up`).
 */
function passEngine<E extends Record<string, unknown>>(e: E, fence: Fence): E {
  const wrapped: Record<string, unknown> = { ...e };
  for (const [verb, value] of Object.entries(e)) {
    if (typeof value !== 'function' || PASS_VERBS.has(verb)) continue;
    wrapped[verb] = () => Effect.die(fence.refuse('engine', verb));
  }
  wrapped.tick = () => Effect.succeed({ views: [], refused: [], unreadable: [], unobserved: [], running: {}, ms: 0, observed: {} });
  return wrapped as E;
}

const ms = (n: number) => n.toFixed(1);
const mb = (n: number) => (n / 1e6).toFixed(1);

/** The report as markdown. */
export function rendered(report: StoreMeasure): string {
  const { counts } = report;
  const row = (key: MeasureKey) => {
    const m = report.measures[key];
    return m === null
      ? `| ${key} | — | — | — | — |`
      : `| ${key} | ${ms(m.cold.ms)} | ${m.cold.heapMb.toFixed(1)} | ${ms(m.warm.ms)} | ${m.warm.heapMb.toFixed(1)} |`;
  };
  return [
    `store measure of ${report.from} (${report.engine}), copied: ${report.copy.files} files, ${mb(report.copy.bytes)} MB in ${(report.copy.ms / 1000).toFixed(0)} s, without ${report.copy.leftOut.join(', ') || 'nothing'}`,
    `${counts.runs} runs (${counts.finishedRuns} finished, ${counts.openRuns} open), ${counts.tasks} tasks, ${mb(counts.journalBytes)} MB of journals, ${counts.feedLines} feed lines; unreadable: ${counts.unreadable.runs} runs, ${counts.unreadable.passLines} pass lines; invariant refusals: ${counts.invariantRefusals}`,
    `${report.machine.cpu}, ${report.machine.cores} cores, ${mb(report.machine.memoryBytes)} MB, node ${report.machine.node}; commit ${report.commit.slice(0, 12)}; ${report.date}; median of ${report.repeat}`,
    `runs read: finished ${report.asked.finishedRun ?? '—'}, open ${report.asked.openRun ?? '—'}; feed from byte ${report.asked.feedCursor}, ${report.asked.feedLinesRead} lines`,
    '',
    '| read | cold ms | cold heap MB | warm ms | warm heap MB |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...MEASURES.map(row),
    '',
    `spawned: ${
      Object.entries(report.spawned)
        .map(([what, n]) => `${what} ×${n}`)
        .join(', ') || 'nothing'
    }; place writes refused: ${
      Object.entries(report.placeRefused)
        .map(([verb, n]) => `${verb} ×${n}`)
        .join(', ') || 'none'
    }`,
  ].join('\n');
}

/** Each number of `now` beside `baseline`'s, and their ratio, as markdown. */
export function comparedWith(now: StoreMeasure, baseline: StoreMeasure): string {
  const ratio = (a: number, b: number) => (b > 0 ? `×${(a / b).toFixed(2)}` : '—');
  const cell = (n: Measured | null, b: Measured | null | undefined, side: 'cold' | 'warm') =>
    n === null || !b ? '— | — | —' : `${ms(n[side].ms)} | ${ms(b[side].ms)} | ${ratio(n[side].ms, b[side].ms)}`;
  return [
    `against ${baseline.commit.slice(0, 12)} of ${baseline.date}: ${now.counts.runs} runs now, ${baseline.counts.runs} then; ${now.counts.tasks} tasks now, ${baseline.counts.tasks} then`,
    '',
    '| read | cold ms | baseline | ratio | warm ms | baseline | ratio |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...MEASURES.map(
      (key) =>
        `| ${key} | ${cell(now.measures[key], baseline.measures?.[key], 'cold')} | ${cell(now.measures[key], baseline.measures?.[key], 'warm')} |`,
    ),
  ].join('\n');
}

/** The commit the checkout of this file is at, or `unknown`. */
const commitHere = (): string => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: import.meta.dirname,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
};

/** What the machine is, as the report says it. */
const machineNow = (): StoreMeasure['machine'] => {
  const cpus = os.cpus();
  return {
    cpu: cpus[0]?.model ?? 'unknown',
    cores: cpus.length,
    memoryBytes: os.totalmem(),
    node: process.version,
    platform: process.platform,
  };
};

/** The report on the stores `asked` names, copied into `root` and measured there, the fence over every read. */
async function reportOn(asked: Asked, root: string, commit: string): Promise<StoreMeasure> {
  const t0 = performance.now();
  const wf = copyStore(asked.from, path.join(root, 'wf'));
  const ae = copyStore(asked.engine, path.join(root, 'ae'), AE_LEFT_OUT);
  const copy = {
    files: wf.files + ae.files,
    bytes: wf.bytes + ae.bytes,
    ms: performance.now() - t0,
    leftOut: [...wf.leftOut, ...ae.leftOut.map((p) => `engine store's ${p}`)],
  };
  const fence = installFence([root]);
  let measured: Awaited<ReturnType<typeof measure>>;
  try {
    measured = await measure(asked, root, fence);
  } finally {
    fence.uninstall();
  }
  const spawned: Record<string, number> = {};
  for (const s of fence.spawned) {
    const key = `${s.verdict === 'other' ? s.command.split(' ')[0] : s.verdict} (${s.on})`;
    spawned[key] = (spawned[key] ?? 0) + 1;
  }
  const { repeat } = asked;
  const [from, engine] = [rootAsWritten(asked.from), rootAsWritten(asked.engine)];
  const date = new Date().toISOString();
  return {
    machine: machineNow(),
    commit,
    date,
    repeat,
    from,
    engine,
    copy,
    ...measured,
    spawned,
    placeRefused: { ...placeRefused },
    refusals: fence.refusals,
  };
}

/** Run the command on `args`: the exit code. */
export async function main(args: readonly string[]): Promise<number> {
  const asked = argsOf(args, process.env);
  const said = (words: string, code: number) => {
    process.stderr.write(`store-measure: ${words}\n`);
    return code;
  };
  if (typeof asked === 'string') return said(asked, 2);
  if (typeof (globalThis as { gc?: unknown }).gc !== 'function')
    return said(
      `run node with --expose-gc, which the heap is measured after: node --expose-gc ${path.relative(process.cwd(), import.meta.filename)}`,
      2,
    );
  const tmp = os.tmpdir();
  const inside = destinationRefusal(tmp, [asked.from, asked.engine]);
  if (inside) return said(inside, 2);
  let baseline: StoreMeasure | undefined;
  if (asked.compare !== undefined) {
    try {
      baseline = JSON.parse(fs.readFileSync(asked.compare, 'utf8')) as StoreMeasure;
    } catch (err) {
      return said(`--compare ${asked.compare} does not read as a report: ${(err as Error).message}; name a file --json wrote`, 2);
    }
  }
  const commit = commitHere();
  const root = fs.mkdtempSync(path.join(tmp, 'store-measure-'));
  try {
    const report = await reportOn(asked, root, commit);
    process.stdout.write(`${rendered(report)}\n`);
    if (baseline) process.stdout.write(`\n${comparedWith(report, baseline)}\n`);
    if (report.refusals.length) {
      for (const r of report.refusals) process.stderr.write(`store-measure: refused on a ${r.on}: ${r.kind} ${r.what}\n`);
      return said(
        'the measure refused itself: a read reached past the copy, as above. Nothing was written: find what asked it, and run it again',
        1,
      );
    }
    if (asked.json !== undefined) {
      fs.mkdirSync(path.dirname(asked.json), { recursive: true });
      fs.writeFileSync(asked.json, `${JSON.stringify(report, null, 2)}\n`);
    }
    return 0;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) process.exit(await main(process.argv.slice(2)));
