/**
 * The verbs' table, and the runners of the commands the CLI runs itself (`RUNS`): `wf tick`, `wf up` and `wf watch` here, the others
 * beside.
 */
import path from 'node:path';
import { Effect } from 'effect';
import {
  addPass,
  breakdownLines,
  ceilingLines,
  ceilings,
  Conflict,
  cordonWords,
  UNCORDONED,
  engine,
  everyOf,
  feedCursorRefusal,
  feedLineWords,
  HOME,
  lastPassCost,
  queueLine,
  refusalLines,
  slotWord,
  storeRefusal,
  summaryDue,
  summaryLine,
  takeoverLine,
  runMain,
  tick,
  up,
  waitWord,
  watchFeed,
  type Interval,
  type TakenStore,
  parseArgv,
  TABLE,
  type Args,
  type Command,
  type Ran,
} from '../runner.ts';
import { HELP, usage, type Engine, type Verb } from './flags.ts';
import { decideVerb } from './decide/decide.ts';
import { agentsCustomRun, pruneVerb, rmVerb } from './runs.ts';
import { inboxAddRun, inboxQueueRun, planRun, startRun } from './start.ts';

/**
 * `wf watch` from a cursor already checked: the feed's lines as they are written, on stdout, until `stop()`; a feed cut under the watch is
 * said once on stderr, and followed from the start of the feed there is now (`watchFeed`).
 *
 * The banner is printed once the watch holds its cursor, not before: a reader that acts on `watching from` — cuts the feed, or writes to it
 * — finds a watch already there to see it, where a cut before the watch holds its cursor would have it refuse the cursor it was given.
 */
export function watchPrinted(from: number): { stop(): void } {
  const watch = watchFeed({
    from,
    onLine: (line) => console.log(feedLineWords(line)),
    onCut: (said) => console.error(`wf watch: ${said}`),
    onError: (err) => console.error(`wf watch: ${(err as Error).message ?? String(err)}`),
  });
  console.log(`watching from ${from}, ^C to stop`);
  return watch;
}

/**
 * `wf watch` as an Effect: `watchPrinted(from)` held in its scope until it is interrupted, and stopped as that scope closes, so an
 * interrupted watch leaves no watcher and no timer behind. It never ends of itself; a cursor it cannot read from fails it.
 */
export const watching = (from: number): Effect.Effect<never, unknown> =>
  Effect.acquireRelease(Effect.try({ try: () => watchPrinted(from), catch: (err) => err }), (watch) =>
    Effect.sync(() => watch.stop()),
  ).pipe(Effect.andThen(Effect.never), Effect.scoped);

/** What one pass of the tick hands back: each run it advanced, the queue's card, the feed's failure, its cost, and what it refused. */
type Pass = Awaited<ReturnType<typeof tick>>;

/** A run's line on `wf tick`: its status and what the pass did to it, then its notes, a line each. */
function tickRunLines(r: Pass['runs'][number]): void {
  const filed = r.filed.length ? `  filed: ${r.filed.join(', ')}` : '';
  const tried = r.tried.length ? `  tried again: ${r.tried.join(', ')}` : '';
  const looped = r.looped.length ? `  round again: ${r.looped.join(', ')}` : '';
  const checked = r.checked.length ? `  checking: ${r.checked.join(', ')}` : '';
  const blocked = r.blocked.length ? `  blocked: ${r.blocked.join(', ')}` : '';
  const waiting = r.waiting.length ? `  ${waitWord(r.waiting)}` : r.held ? `  ${slotWord(r.held)}` : '';
  console.log(`${r.run.id}  ${r.status}${filed}${tried}${looped}${checked}${blocked}${waiting}`);
  for (const note of r.notes) console.log(`   ${note}`);
}

/**
 * A pass's lines on `wf tick`: the cordon it read, what failed or was left out on stderr, then what it refused, the queue's card and each
 * run; returns it.
 */
function tickLines(pass: Pass): Pass {
  const { runs: results, queue, feedError, refused, unreadable, cordon } = pass;
  if (cordon) console.log(cordonWords(cordon));
  if (feedError) console.error(feedError);
  for (const why of unreadable ?? []) console.error(`left out: ${why}`);
  for (const line of refusalLines(refused ?? [], new Set()).lines) console.log(line);
  if (queue) console.log(queueLine(queue));
  if (!results.length && !queue && !unreadable?.length) console.log('no runs');
  for (const r of results) tickRunLines(r);
  return pass;
}

/**
 * `wf tick`: one pass, and what it did to each run; with `--stats`, what the pass cost. Beside a daemon that ticks the store it is refused,
 * with no way to force it. A queued card that names no repository starts on the one it is typed in, as `wf start` takes `.`.
 */
async function tickVerb(args: Args, e: Engine): Promise<void> {
  const stats = args.stats === true;
  const held = storeRefusal('tick');
  if (held) throw new Conflict({ message: stats ? `${held} What its last pass cost is read without a pass: wf up --stats.` : held });
  const { cost } = tickLines(await tick(e, { repo: path.resolve('.') }));
  if (stats) for (const line of cost ? breakdownLines(cost) : ['this pass was not measured']) console.log(line);
  return;
}

/** `wf up --stats`: what the last pass cost, read off the store, ticking nothing, and who wrote it. */
function upStats(): void {
  const cost = lastPassCost();
  const daemon = storeRefusal('tick') !== undefined;
  if (!cost)
    return console.log(
      `no pass has written what it cost to ${path.join(HOME, 'tick-stats.json')} yet — ${daemon ? 'the daemon that holds this store writes it after its next pass' : 'no daemon holds this store: run wf tick --stats, or start one (npm start in apps/api, or wf up)'}`,
    );
  for (const line of breakdownLines(cost)) console.log(line);
  return console.log(
    daemon
      ? 'written by the daemon that holds this store, after its last pass'
      : 'no daemon holds this store now, so this was the last pass anyone ran: wf tick --stats runs one and says what it cost',
  );
}

/**
 * What `wf up` has said while it lasts, so it says each failure once: a queued card's start (`said`), the feed's (`feedSaid`), a move the
 * lifecycle refused (`refusedSaid`), a journal left out (`unreadableSaid`); the store's cordon (`cordonSaid`), said once put and once
 * lifted; and the passes its next summary counts (`interval`).
 */
type UpSaid = {
  said: string | undefined;
  cordonSaid: string | undefined;
  feedSaid: string | undefined;
  refusedSaid: ReadonlySet<string>;
  unreadableSaid: ReadonlySet<string>;
  interval: Interval | undefined;
};

/** The queued card's line on `wf up`, unless it is the failure it said last; returns the failure it says now, if any. */
function queueSaid(queue: NonNullable<Pass['queue']>, said: string | undefined): string | undefined {
  const failure = 'failed' in queue ? `${queue.card}  ${queue.on ?? ''}  ${queue.failed}` : undefined;
  if (failure === undefined || failure !== said) console.log(`${new Date().toISOString().slice(11, 19)}  ${queueLine(queue)}`);
  return failure;
}

/** What a pass did to each run, as `wf up` says it: its notes, then what it filed, tried again, rounded again and is checking. */
function advancedLines(advanced: Pass['runs']): void {
  for (const r of advanced) {
    for (const note of r.notes) console.log(`${new Date().toISOString().slice(11, 19)}  ${r.run.id}  ${note}`);
    if (r.filed.length) console.log(`${new Date().toISOString().slice(11, 19)}  ${r.run.id}  filed ${r.filed.join(', ')}`);
    if (r.tried.length) console.log(`${new Date().toISOString().slice(11, 19)}  ${r.run.id}  tried again ${r.tried.join(', ')}`);
    if (r.looped.length) console.log(`${new Date().toISOString().slice(11, 19)}  ${r.run.id}  round again ${r.looped.join(', ')}`);
    if (r.checked.length) console.log(`${new Date().toISOString().slice(11, 19)}  ${r.run.id}  checking ${r.checked.join(', ')}`);
  }
}

/** The store's cordon on `wf up`, once when it is put or changed and once when it is lifted; returns the cordon it said, if any. */
export function cordonSaid(cordon: Pass['cordon'], said: string | undefined): string | undefined {
  const now = cordon ? cordonWords(cordon) : undefined;
  if (now !== said) console.log(`${new Date().toISOString().slice(11, 19)}  ${now ?? UNCORDONED}`);
  return now;
}

/** One pass's lines on `wf up`, going by what it has printed (`was`), not by the store; returns what it has printed now. */
function passLines(pass: Pass, was: UpSaid): UpSaid {
  const { runs: advanced, queue, feedError, cost, refused, unreadable } = pass;
  const cordoned = cordonSaid(pass.cordon, was.cordonSaid);
  let interval = was.interval;
  if (cost) interval = addPass(interval, cost, Date.now());
  if (summaryDue(interval, Date.now())) {
    console.log(`${new Date().toISOString().slice(11, 19)}  ${summaryLine(interval!, Date.now())}`);
    interval = undefined;
  }
  if (feedError && feedError !== was.feedSaid) console.error(`${new Date().toISOString().slice(11, 19)}  ${feedError}`);
  const stalled = refusalLines(refused ?? [], was.refusedSaid);
  for (const line of stalled.lines) console.log(`${new Date().toISOString().slice(11, 19)}  ${line}`);
  for (const why of unreadable ?? [])
    if (!was.unreadableSaid.has(why)) console.error(`${new Date().toISOString().slice(11, 19)}  left out: ${why}`);
  const said = queue ? queueSaid(queue, was.said) : was.said;
  advancedLines(advanced);
  return { said, cordonSaid: cordoned, feedSaid: feedError, refusedSaid: stalled.said, unreadableSaid: new Set(unreadable), interval };
}

/**
 * `wf up`: the headless daemon, a pass every interval until it is stopped, or `--stats`. It refuses its interval (`everyOf`) and its
 * ceilings (`ceilings`) before it takes the store, then runs the daemon's controller (`up`) as `wf up` under `runMain`, saying each
 * failure once while it lasts (`UpSaid`). A queued card that names no repository starts on the one it is typed in, as `wf start` takes `.`.
 */
function upVerb(args: Args, e: Engine): void | Promise<void> {
  if (args.stats === true) return upStats();
  const asked = everyOf(typeof args.every === 'string' ? args.every : undefined);
  const every = 'refusal' in asked ? usage(asked.refusal) : asked.every;
  const ceiling = ceilings();
  const store = HOME;
  let was: UpSaid = {
    said: undefined,
    cordonSaid: undefined,
    feedSaid: undefined,
    refusedSaid: new Set(),
    unreadableSaid: new Set(),
    interval: undefined,
  };
  const onTaken = ({ held, replaced }: TakenStore) =>
    Effect.sync(() => {
      console.log(`up — every ${every}ms, ^C to stop`);
      for (const line of ceilingLines(ceiling)) console.log(`   ${line}`);
      console.log(
        `   holds ${store} as pid ${held.pid} — a second daemon, the api or a wf up, or a wf tick, on this store is refused while it ticks (daemon.json)`,
      );
      const took = takeoverLine(replaced, store, Date.now());
      if (took) console.log(`   ${took}`);
    });
  const onPass = (pass: Pass) => {
    was = passLines(pass, was);
  };
  return runMain(up(e, { every, repo: path.resolve('.'), holder: 'wf up', onTaken, onPass }).pipe(Effect.scoped));
}

/** `wf watch`: the feed's lines as they come, from a cursor, until it is stopped (`watching`). */
function watchVerb(args: Args): void | Promise<void> {
  const from = typeof args.cursor === 'string' ? Number(args.cursor) : 0;
  const refusal = feedCursorRefusal(from);
  if (refusal) usage(refusal);
  return runMain(watching(from));
}

/** Each verb `wf` takes, by its name on the command line: a `Map`, so a name every object has is no verb. */
export const VERBS: ReadonlyMap<string, Verb> = new Map<string, Verb>([['decide', decideVerb]]);

/**
 * The runner of each command the CLI runs itself, by its name — those it serves alone (`RAN`, `wf plan`); `wf rm` and `wf prune`, whose
 * runners walk the many runs a command line names through their handlers; and `wf start`, `wf inbox add`, `wf inbox queue` and
 * `wf agents custom`, whose runners read the files and folders a command line names before their handlers: handed its arguments once read
 * and checked.
 */
export const RUNS: ReadonlyMap<string, (args: Args, e: Engine) => void | Promise<void>> = new Map([
  ['tick', tickVerb],
  ['up', upVerb],
  ['watch', watchVerb],
  ['rm', rmVerb],
  ['prune', pruneVerb],
  ['start', startRun],
  ['plan', planRun],
  ['inbox add', inboxAddRun],
  ['inbox queue', inboxQueueRun],
  ['agents custom', agentsCustomRun],
]);

/**
 * A command of the table (`TABLE`), run from the command line: its long help printed for `--help` where it has one (`manual`); else its
 * arguments read against its spec — the help printed for too little — then refused by its `check`, and handed to its runner (`RUNS`)
 * where it has one; else to its handler, and the lines it prints of the answer printed.
 */
async function commanded(command: Command | Ran, rest: string[], e: Engine): Promise<void> {
  if (command.manual !== undefined && rest.includes('--help')) return console.log(command.manual);
  const args = parseArgv(command.spec, rest);
  if (args === undefined) return console.log(HELP);
  const wrong = command.check?.(args);
  if (wrong) usage(wrong);
  const runner = RUNS.get(command.name);
  if (runner || command.handler === undefined) return runner!(args, e);
  const data = await command.handler(e, args);
  for (const line of command.print(data, args)) console.log(line);
  for (const line of command.note?.(data, args) ?? []) console.error(line);
}

/** The names `wf` takes, its commands' and its verbs', a name of two words among them: `agents card`. */
const NAMES = [...TABLE.filter((c) => c.only?.side !== 'api').map((c) => c.name), ...VERBS.keys()];

/**
 * The name `argv` opens with, the longest of `NAMES` whose words it starts with, and the arguments after it — or none. A name that heads
 * others (`agents`, before `agents card`) given a word none of them is gets that word, and refuses it in its own words.
 */
function namedIn(argv: readonly string[]): { name: string; rest: string[] } | undefined {
  const opens = (name: string) => name.split(' ').every((word, i) => argv[i] === word);
  const name = NAMES.filter(opens).sort((a, b) => b.length - a.length)[0];
  if (name === undefined) return undefined;
  return { name, rest: argv.slice(name.split(' ').length) };
}

/**
 * Runs the command or the verb `argv` names and prints what it did, or prints the help for none and for a name it does not know. `e` is the
 * engine they talk to: the board under `WF_ROOT`, unless a test hands it one of its own.
 */
export async function main(argv: string[], e: Engine = engine()): Promise<void> {
  const named = namedIn(argv);
  if (named === undefined) return console.log(HELP);
  const command = TABLE.find((c) => c.name === named.name && c.only?.side !== 'api');
  if (command) return commanded(command, named.rest, e);
  return VERBS.get(named.name)!(named.rest, e);
}
