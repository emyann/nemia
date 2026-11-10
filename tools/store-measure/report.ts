/**
 * What the store's reads cost, measured on a copy of it: `node --expose-gc tools/store-measure/report.ts [--from <wf-root>]
 * [--engine <ae-root>] [--repeat N] [--json <file>] [--compare <baseline.json>]`.
 *
 * It copies the workflows' store (`--from`, `WF_ROOT` or `~/.agent-workflows`, its runtime's journals under `engine/` with it) and the
 * runtime's own (`--engine`, `AE_ROOT` or `~/.agent-engine`) into a fresh temp folder, leaving out what no read opens and what would tie
 * the copy to the live machine (`LEFT_OUT` in `fence.ts`), and refusing a temp folder inside either store; points `WF_ROOT` and `AE_ROOT`
 * at the copy before the orchestrator loads (it pins its root as it loads); and times nine reads there, each cold — the first call over
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
 * - `runSummaries`: the board's frame read, the RunList asked by state (`GET /api/runs?fieldSelector=status.state!=finished`), which
 *   judges every run to count it, over apps as `runList` is, kept under the key the baselines timed `GET /api/runs-summaries` by, the
 *   read it replaced, so a `--compare` reads the frame's time against the old summaries' on one store.
 * - `finishedRun`, `openRun`: `GET /api/runs/:id` of the newest run finished and of the newest still open, by `createdAt`; null where
 *   the store has none. The route answers the run object (`runObject`), and only it: `baselines/s1.json` and `s2.json` timed the run's
 *   page, which that route answered then and which is gone, so a `--compare` of these two against either sets two different answers
 *   side by side, not one answer before and after.
 * - `feedFromCursor`: `GET /api/feed/stream` from the cursor `FEED_BACK` lines before the workflow feed's end, read until its last line
 *   came, then let go.
 * - `tickPassInformed`: the same pass with an informer given (`Informer`), as the daemon's pass runs: it judges each run the informer
 *   does not hold and keeps it, every moving run on every pass among them. Cold, a fresh engine and a fresh informer per pass; warm, both
 *   kept.
 * - `runListAfterPass`, `openRunAfterPass`: `GET /api/runs` and `GET /api/runs/:id` of the newest open run, each asked after a pass of
 *   the tick has filled the app's informer (`Informer`, given by `liveOf`), as the daemon's pass fills it: the pass is not timed, the read
 *   is. Cold over an app built afresh and one pass for each call; warm, called again within the same pass, which serves even a moving
 *   run's judgement.
 * - `inbox`, `inboxAfterPass`: `GET /api/cards`, every card (a `CardList`), over an app built afresh for each cold call and kept for the
 *   warm ones, and the same asked after a pass has filled the app's informer, as `runListAfterPass` is. A baseline taken before the
 *   CardList read `GET /api/inbox?all=true`, every card too, so a `--compare` sets the two reads of every card side by side.
 * - `chatHistory`, `chatBeatBefore`, `chatFoldStep`: her chat, at the place the copy's level file names (`nemiaChatPlace`), each over an
 *   engine (`passEngine`) and reads (`ChatReads`: the informer and the filings an app keeps) built afresh for each cold call and kept for
 *   the warm ones. `chatHistory` is `chatHistory(place, {})`, what a reader lists on joining and what the board's dock read every 5 s
 *   before her chat was followed. `chatBeatBefore` is `followChat`'s `first` from the cursor that history gave, its follow none: the same
 *   reads and the same answer as the old stream's beat, the whole re-projection it paid every 2 s per open stream. `chatFoldStep` is
 *   what a follower pays now for one moment of her session (`chatFold`): `followChat`'s `rest`, after a listing not timed, run until the
 *   first thing it sends, its follow handing one `events` moment of one new event; null where no session of hers is filed. Its time holds
 *   the rest's start too (the follow of the feed, the look at the files), so it bounds the fold from above.
 *
 * - `factoryList`, `factoryGet`, `factoryCommands`, `scheduleList`, `hireList`, `volumeList`, `mcpServerList`: `GET /api/factories`,
 *   and of the copy's first factory but the default by name, `GET /api/factories/:name`, `…/commands` and
 *   `GET /api/namespaces/:name/schedules`, `hires`, `volumes` and `mcpservers`, over apps as `runList` is; null where the copy has no
 *   factory of its own. `ceilings`: `GET /api/ceilings`, the same way, and `ceilingsAfterPass` the same asked after a pass has filled the
 *   app's informer, as `runListAfterPass` is.
 *
 * Each read over apps carries the run records (`runs/<id>.json`) one call read, cold and warm (`records`), counted on a call of its own.
 *
 * Beside the numbers: the runs, finished and open, the inbox's cards and those a run was started from, the runtime's tasks and their
 * journals' bytes, the runs whose tasks did not read and the pass's unreadable lines, and `invariantRefusals`, the records the Run model
 * refuses. A markdown table on stdout; with `--json`, the report as JSON with the machine, the commit and the date; with `--compare`,
 * each number beside the baseline's and their ratio, a read or a count the baseline lacks shown as `—`. It refuses itself, exit 1 and no
 * JSON, where the fence refused anything; exit 2 for a call it cannot run. The copy is removed at the end. No threshold is fixed: the
 * numbers are the owner's to judge.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Duration, Effect, Layer, Logger, Option, Stream } from 'effect';
import type { ChatFollow, ChatFollowed, ChatReads, Pass } from 'agent-orchestrator';
import { AE_LEFT_OUT, copyStore, destinationRefusal, installFence, placeRefused, readOnlyPlace, type Fence } from './fence.ts';
import { passEngine, recordsReadBy } from './reads.ts';
import { comparedWith, MEASURES, rendered, type MeasureKey, type Measured, type StoreMeasure, type Timed } from './render.ts';

export { comparedWith, MEASURES, rendered, type MeasureKey, type Measured, type StoreMeasure, type Timed };

/** How far before the feed's end its read starts, in lines. */
export const FEED_BACK = 1000;

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

/**
 * `read` over a fresh app for each of `repeat` cold calls, then over one app kept, after a first call that is not counted; with the run
 * records each call read (`recordsReadBy`), counted on a call apart from the timed ones so the count costs the time nothing.
 */
async function overApps(fresh: () => Promise<Built>, read: (app: App) => Promise<unknown>, repeat: number): Promise<Measured> {
  const cold: Timed[] = [];
  for (let i = 0; i < repeat; i++) {
    const { app, runtime } = await fresh();
    cold.push(await timed(() => read(app)));
    await runtime.dispose();
  }
  const counted = await fresh();
  const coldRecords = (await recordsReadBy(() => read(counted.app))).records;
  await counted.runtime.dispose();
  const { app, runtime } = await fresh();
  await read(app);
  const warm: Timed[] = [];
  for (let i = 0; i < repeat; i++) warm.push(await timed(() => read(app)));
  const warmRecords = (await recordsReadBy(() => read(app))).records;
  await runtime.dispose();
  return { cold: medianOf(cold), warm: medianOf(warm), records: { cold: coldRecords, warm: warmRecords } };
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

/** The lines the events of `chunk` carry, and the cursor after the last; whether the stream's opening event (`opened`) is among them. */
function eventsIn(chunk: readonly string[], cursor: number): { lines: number; cursor: number; opened: boolean } {
  let lines = 0;
  let opened = false;
  for (const event of chunk) {
    if (/^event: ?opened$/m.test(event)) opened = true;
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
async function tickMeasured(orch: Orchestrator, place: Place, fence: Fence, wf: string, repeat: number, informed = false) {
  const base = orch
    .withProposalsPass(orch.tickRun({ repo: wf, verifyRest: false }))
    .pipe(Effect.provide(Layer.merge(orch.PlaceService.layer(place), orch.storeRootLayer(process.env))));
  let informer = orch.informerMemo();
  const program = Effect.suspend(() => (informed ? base.pipe(Effect.provideService(orch.Informer, informer)) : base));
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
    informer = orch.informerMemo();
    cold.push(await timed(() => passOf(e)));
  }
  const kept = passEngine(orch.engine(), fence);
  informer = orch.informerMemo();
  await passOf(kept);
  const warm: Timed[] = [];
  for (let i = 0; i < repeat; i++) warm.push(await timed(() => passOf(kept)));
  return { measured: { cold: medianOf(cold), warm: medianOf(warm) }, pass };
}

/**
 * A fresh app whose informer (`Informer`, the app's own) a pass of the tick on the copy at `wf` filled, the fence armed for a pass: what
 * `overApps` reads `runListAfterPass`, `openRunAfterPass` and `inboxAfterPass` over, so the pass is not timed and the read is, the warm
 * calls within it.
 */
const passedOver = (orch: Orchestrator, place: Place, fence: Fence, wf: string, fresh: () => Promise<Built>) => async () => {
  const built = await fresh();
  const informer = await built.runtime.runPromise(Effect.service(orch.Informer));
  const program = orch
    .withProposalsPass(orch.tickRun({ repo: wf, verifyRest: false }))
    .pipe(
      Effect.provide(Layer.merge(orch.PlaceService.layer(place), orch.storeRootLayer(process.env))),
      Effect.provideService(orch.Informer, informer),
    );
  fence.arm('pass');
  try {
    await orch.runWith(passEngine(orch.engine(), fence), program);
  } finally {
    fence.arm('read');
  }
  return built;
};

/** The inbox, every card: the route ignores `all` where it does not read it, and lists every card then too. */
const INBOX_URL = '/api/cards';

/** How long `chatFold` waits for the moment it hands to be sent: a fold that sends nothing (no session of hers to fold into) is null. */
const FOLD_BOUND_MS = 10_000;

/** What `chatMeasured` reads with: a fresh engine on the copy and fresh reads, as a new app's are, or those kept between calls. */
type ChatOver = { e: ReturnType<Orchestrator['engine']>; reads: ChatReads };

/**
 * One moment of her session folded by a follower that has listed: `followChat`'s `rest` run until the first thing it sends, its follow
 * handing one `events` moment of one new assistant text, `n` apart from every other. Answers whether anything was sent within
 * `FOLD_BOUND_MS`.
 */
const chatFold = <R>(rest: Stream.Stream<unknown, never, R>) =>
  Effect.gen(function* () {
    const head = yield* Stream.runHead(rest).pipe(Effect.timeoutOption(Duration.millis(FOLD_BOUND_MS)));
    return Option.isSome(head) && Option.isSome(head.value);
  });

/**
 * Her chat measured on the copy at the place its level file names: the history, the old beat (`followChat`'s `first` from the history's
 * cursor) and the fold of one moment (`chatFold`), each cold over an engine and reads built afresh per call and warm over one kept.
 */
async function chatMeasured(orch: Orchestrator, place: Place, fence: Fence, repeat: number) {
  const placed = Layer.merge(orch.PlaceService.layer(place), orch.storeRootLayer(process.env));
  const fresh = (): ChatOver => ({
    e: passEngine(orch.engine(), fence),
    reads: { home: process.env.WF_ROOT, runs: orch.informerMemo(), filings: { filed: new Map(), cursor: 0 }, env: process.env },
  });
  const history = (at: ChatOver) => orch.runWith(at.e, orch.chatHistory(orch.nemiaChatPlace(), {}, at.reads).pipe(Effect.provide(placed)));
  const listed = await history(fresh());
  const none: ChatFollow = () => Stream.empty;
  const followed = (at: ChatOver, follow: ChatFollow) =>
    orch.runWith(at.e, orch.followChat(orch.nemiaChatPlace, listed.cursor, at.reads, follow).pipe(Effect.provide(placed)));
  type Rest = Awaited<ReturnType<typeof followed>>['rest'];
  let n = 0;
  const moment: ChatFollow = () => {
    n += 1;
    const event = {
      id: `store-measure-${n}`,
      at: new Date().toISOString(),
      role: 'assistant',
      kind: 'text',
      text: `a moment ${n}`,
    } as const;
    return Stream.make<[ChatFollowed]>({ kind: 'events', events: [event], cursor: `store-measure-${n}` });
  };
  const folds = async (at: ChatOver, rest: Rest) => {
    if (!(await orch.runWith(at.e, chatFold(rest).pipe(Effect.provide(placed)))))
      throw new Error(`a moment of her session was folded and nothing was sent within ${FOLD_BOUND_MS} ms`);
  };
  const over = async (read: (at: ChatOver) => Promise<unknown>): Promise<Measured> => {
    const cold: Timed[] = [];
    for (let i = 0; i < repeat; i++) {
      const at = fresh();
      cold.push(await timed(() => read(at)));
    }
    const kept = fresh();
    await read(kept);
    const warm: Timed[] = [];
    for (let i = 0; i < repeat; i++) warm.push(await timed(() => read(kept)));
    return { cold: medianOf(cold), warm: medianOf(warm) };
  };
  const foldOver = async (): Promise<Measured> => {
    const cold: Timed[] = [];
    for (let i = 0; i < repeat; i++) {
      const at = fresh();
      const { rest } = await followed(at, moment);
      cold.push(await timed(() => folds(at, rest)));
    }
    const kept = fresh();
    const { rest } = await followed(kept, moment);
    await folds(kept, rest);
    const warm: Timed[] = [];
    for (let i = 0; i < repeat; i++) warm.push(await timed(() => folds(kept, rest)));
    return { cold: medianOf(cold), warm: medianOf(warm) };
  };
  const task = orch.nemiaChatPlace().task ?? null;
  return {
    asked: { task, events: listed.events.length, cursor: listed.cursor },
    measures: {
      chatHistory: await over(history),
      chatBeatBefore: await over(async (at) => (await followed(at, none)).first),
      chatFoldStep: task === null ? null : await foldOver(),
    },
  };
}

/** What the measure reads of the list `GET /api/runs` answers (a `RunList`): each run's name, word and when it was made. */
type Listed = { id: string; status: string; createdAt: string };

/** The runs a `RunList` holds, as the measure reads them, and how many it could not judge. */
const listedOf = (list: unknown): { runs: Listed[]; unjudged: number } => {
  const { items, unjudged } = list as {
    items: Array<{ metadata: { name: string; creationTimestamp: string }; status: { status: string } }>;
    unjudged?: unknown[];
  };
  return {
    runs: items.map((r) => ({ id: r.metadata.name, status: r.status.status, createdAt: r.metadata.creationTimestamp })),
    unjudged: unjudged?.length ?? 0,
  };
};

/** The newest run of `listing`, by `createdAt`, finished or not; null where there is none. */
const newestOf = (listing: readonly Listed[], finished: boolean): string | null =>
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
  const place = readOnlyPlace(orch.builtinGitPlace);
  const fresh = () => appOver(api, orch, place);
  const { repeat } = asked;
  const first = await fresh();
  const { runs: listing, unjudged } = listedOf(await getJson(first.app, '/api/runs'));
  const finishedRun = newestOf(listing, true);
  const openRun = newestOf(listing, false);
  const cards = ((await getJson(first.app, INBOX_URL)) as { items: { status: { runs: readonly string[] } }[] }).items;
  const factory = ((await getJson(first.app, '/api/factories')) as { items: { metadata: { name: string } }[] }).items
    .map((f) => f.metadata.name)
    .find((name) => name !== 'default');
  await first.runtime.dispose();
  const ofFactory = (url: (name: string) => string) =>
    factory === undefined ? null : overApps(fresh, (app) => getJson(app, url(encodeURIComponent(factory))), repeat);
  const feed = feedOf(wf);
  const passed = passedOver(orch, place, fence, wf, fresh);
  const objectOf = (id: string | null, over = fresh) =>
    id === null ? null : overApps(over, (app) => getJson(app, `/api/runs/${encodeURIComponent(id)}`), repeat);
  const measures: Record<MeasureKey, Measured | null> = {
    runList: await overApps(fresh, (app) => getJson(app, '/api/runs'), repeat),
    runSummaries: await overApps(fresh, (app) => getJson(app, '/api/runs?fieldSelector=status.state!%3Dfinished'), repeat),
    stats: await overApps(fresh, (app) => getJson(app, '/api/stats'), repeat),
    finishedRun: await objectOf(finishedRun),
    openRun: await objectOf(openRun),
    feedFromCursor: await overApps(fresh, (app) => feedStreamed(app, feed), repeat),
    tickPass: null,
    tickPassInformed: null,
    runListAfterPass: await overApps(passed, (app) => getJson(app, '/api/runs'), repeat),
    openRunAfterPass: await objectOf(openRun, passed),
    inbox: await overApps(fresh, (app) => getJson(app, INBOX_URL), repeat),
    inboxAfterPass: await overApps(passed, (app) => getJson(app, INBOX_URL), repeat),
    chatHistory: null,
    chatBeatBefore: null,
    chatFoldStep: null,
    factoryList: await overApps(fresh, (app) => getJson(app, '/api/factories'), repeat),
    factoryGet: await ofFactory((f) => `/api/factories/${f}`),
    factoryCommands: await ofFactory((f) => `/api/factories/${f}/commands`),
    scheduleList: await ofFactory((f) => `/api/namespaces/${f}/schedules`),
    hireList: await ofFactory((f) => `/api/namespaces/${f}/hires`),
    volumeList: await ofFactory((f) => `/api/namespaces/${f}/volumes`),
    mcpServerList: await ofFactory((f) => `/api/namespaces/${f}/mcpservers`),
    ceilings: await overApps(fresh, (app) => getJson(app, '/api/ceilings'), repeat),
    ceilingsAfterPass: await overApps(passed, (app) => getJson(app, '/api/ceilings'), repeat),
  };
  const chat = await chatMeasured(orch, place, fence, repeat);
  Object.assign(measures, chat.measures);
  const { measured, pass } = await tickMeasured(orch, place, fence, wf, repeat);
  measures.tickPass = measured;
  measures.tickPassInformed = (await tickMeasured(orch, place, fence, wf, repeat, true)).measured;
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
      cards: { listed: cards.length, started: cards.filter((c) => c.status.runs.length > 0).length },
      unreadable: { runs: unjudged, passLines: pass?.unreadable?.length ?? 0 },
      invariantRefusals: await invariantRefusals(wf),
    },
    asked: { factory: factory ?? null, finishedRun, openRun, feedCursor: feed.cursor, feedLinesRead: feed.read, chat: chat.asked },
    measures,
  };
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
    load: Number((os.loadavg()[1] ?? 0).toFixed(2)),
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
