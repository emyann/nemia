/**
 * The verbs' table, the daemon's verbs — `wf tick`, `wf up`, `wf feed` and `wf watch` — and `runMain`, which runs a command that lives as
 * long as its process.
 */
import path from 'node:path';
import { Cause, Effect, Exit, Fiber } from 'effect';
import {
  addPass,
  beat,
  breakdownLines,
  ceilingLines,
  ceilings,
  Conflict,
  engine,
  everyOf,
  feedCursorRefusal,
  feedLineWords,
  HOME,
  lastPassCost,
  passed,
  queueLine,
  readFeed,
  refusalLines,
  releaseStore,
  slotWord,
  stillHeld,
  storeRefusal,
  summaryDue,
  summaryLine,
  takeStore,
  takenFromLine,
  takeoverLine,
  tick,
  waitWord,
  watchFeed,
  type Interval,
  COMMANDS,
  parseArgv,
  type Command,
} from '../runner.ts';
import { HELP, usage, type Engine, type Verb } from './flags.ts';
import { decideVerb } from './decide/decide.ts';
import { statsVerb } from './stats/stats.ts';
import { factoryVerb } from './factory/factory.ts';
import { agentsCustom, cancelVerb, holdVerb, logsVerb, pruneVerb, rmVerb, showVerb } from './runs.ts';
import { inboxVerb, planVerb, startVerb } from './start.ts';

/**
 * The signals that stop a command, each with the code the process exits with once the command has let go of what it held: 128 + its number.
 */
const SIGNALS = [
  ['SIGINT', 130],
  ['SIGTERM', 143],
  ['SIGHUP', 129],
] as const;

/**
 * Runs `program` as the process's command. SIGINT, SIGTERM and SIGHUP interrupt it, and once its finalizers have run the process exits 130,
 * 143 or 129, by the signal that came. Otherwise the promise resolves with its value, or rejects with what it failed or died with, that
 * very value, so a refusal's `exitCode` reaches `bin/wf.ts`. The handlers are its own, taken off as it ends: a second signal while the
 * finalizers run is Node's to handle.
 *
 * Not the `runMain` of `@effect/platform-node`'s NodeRuntime: its teardown exits 130 on any interruption, whatever signal came, it
 * handles no SIGHUP, and it hands no failure back to the caller.
 */
export function runMain<A, E>(program: Effect.Effect<A, E>): Promise<A> {
  return new Promise<A>((resolve, reject) => {
    const fiber = Effect.runFork(program);
    let stoppedWith: number | undefined;
    const stops = SIGNALS.map(([signal, code]) => {
      const stop = () => {
        stoppedWith = code;
        Effect.runFork(Fiber.interrupt(fiber));
      };
      process.once(signal, stop);
      return [signal, stop] as const;
    });
    fiber.addObserver((exit) => {
      for (const [signal, stop] of stops) process.off(signal, stop);
      if (stoppedWith !== undefined) process.exit(stoppedWith);
      if (Exit.isSuccess(exit)) resolve(exit.value);
      else reject(Cause.squash(exit.cause));
    });
  });
}

/**
 * The cursor `wf feed` and `wf watch` read from: 0 when none is given, a whole number of bytes otherwise, and nothing more. Whether the
 * feed has a line starting there is the feed's to say (`feedCursorRefusal`), in its words.
 */
function feedCursor(verb: 'feed' | 'watch', argv: string[]): number {
  if (argv.length > 1 || (argv[0] !== undefined && !/^\d+$/.test(argv[0]))) {
    usage(
      `wf ${verb} takes one cursor at most, a whole number of bytes — 0, or the number a \`cursor:\` line printed: wf ${verb} [cursor]`,
    );
  }
  return argv[0] === undefined ? 0 : Number(argv[0]);
}

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

/** A pass's lines on `wf tick`: what failed or was left out on stderr, then what it refused, the queue's card and each run; returns it. */
function tickLines(pass: Pass): Pass {
  const { runs: results, queue, feedError, refused, unreadable } = pass;
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
export async function tickVerb(rest: string[], e: Engine): Promise<void> {
  const stats = rest.includes('--stats');
  const other = rest.find((a) => a !== '--stats');
  if (other !== undefined) usage(`wf tick takes no ${other}: wf tick runs one pass, and wf tick --stats says after it what the pass cost.`);
  const held = storeRefusal('tick');
  if (held) throw new Conflict({ message: stats ? `${held} What its last pass cost is read without a pass: wf up --stats.` : held });
  const { cost } = tickLines(await tick(e, { repo: path.resolve('.') }));
  if (stats) for (const line of cost ? breakdownLines(cost) : ['this pass was not measured']) console.log(line);
  return;
}

/** `wf up --stats`: what the last pass cost, read off the store, ticking nothing, and who wrote it. */
function upStats(rest: string[]): void {
  const other = rest.find((a) => a !== '--stats');
  if (other !== undefined)
    usage(
      `wf up --stats reads what the last pass cost and ticks nothing, so it takes no ${other}: wf up --stats alone, or wf up ${other} to tick.`,
    );
  const cost = lastPassCost();
  const daemon = storeRefusal('tick') !== undefined;
  if (!cost)
    return console.log(
      `no pass has written what it cost to ${path.join(HOME, 'tick-stats.json')} yet — ${daemon ? 'the wf up that holds this store writes it after its next pass' : 'no wf up holds this store: run wf tick --stats, or start wf up'}`,
    );
  for (const line of breakdownLines(cost)) console.log(line);
  return console.log(
    daemon
      ? 'written by the wf up that holds this store, after its last pass'
      : 'no wf up holds this store now, so this was the last pass anyone ran: wf tick --stats runs one and says what it cost',
  );
}

/**
 * What `wf up` has said while it lasts, so it says each failure once: a queued card's start (`said`), the feed's (`feedSaid`), a move the
 * lifecycle refused (`refusedSaid`), a journal left out (`unreadableSaid`); and the passes its next summary counts (`interval`).
 */
type UpSaid = {
  said: string | undefined;
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

/** One pass's lines on `wf up`, going by what it has printed (`was`), not by the store; returns what it has printed now. */
function passLines(pass: Pass, was: UpSaid): UpSaid {
  const { runs: advanced, queue, feedError, cost, refused, unreadable } = pass;
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
  return { said, feedSaid: feedError, refusedSaid: stalled.said, unreadableSaid: new Set(unreadable), interval };
}

/**
 * `wf up`: a pass every interval until it is stopped, or `--stats`. It refuses its interval (`everyOf`) and its ceilings (`ceilings`)
 * before it takes the store. It runs as an Effect (`runMain`): the store is taken in its scope and let go as the scope closes, however it
 * ends, so a signal that stops it leaves the store free at once. It beats on a fiber forked in that scope, so a long pass is not taken for
 * stalled and taken over mid-pass; it stops at the first pass that finds the store taken over (`stillHeld`). It says each failure once
 * while it lasts (`UpSaid`). A queued card that names no repository starts on the one it is typed in, as `wf start` takes `.`.
 */
export function upVerb(rest: string[], e: Engine): void | Promise<void> {
  if (rest.includes('--stats')) return upStats(rest);
  const asked = everyOf(rest[0]);
  const every = 'refusal' in asked ? usage(asked.refusal) : asked.every;
  const ceiling = ceilings();
  const store = HOME;
  return runMain(
    Effect.gen(function* () {
      const { held, replaced } = yield* Effect.acquireRelease(
        Effect.try({ try: () => takeStore({ every, cwd: path.resolve('.') }), catch: (err) => err }),
        ({ held }) => Effect.sync(() => releaseStore(held)),
      );
      console.log(`up — every ${every}ms, ^C to stop`);
      for (const line of ceilingLines(ceiling)) console.log(`   ${line}`);
      console.log(
        `   holds ${store} as pid ${held.pid} — a second wf up, or a wf tick, on this store is refused while it ticks (daemon.json)`,
      );
      const took = takeoverLine(replaced, store, Date.now());
      if (took) console.log(`   ${took}`);
      yield* Effect.forkScoped(Effect.forever(Effect.sleep(every).pipe(Effect.andThen(Effect.sync(() => beat(held))))));
      let was: UpSaid = {
        said: undefined,
        feedSaid: undefined,
        refusedSaid: new Set(),
        unreadableSaid: new Set(),
        interval: undefined,
      };
      for (;;) {
        const by = stillHeld(held);
        if (by) return yield* Effect.fail(new Error(takenFromLine(by, store)));
        const pass = yield* Effect.tryPromise({
          try: () => tick(e, { repo: path.resolve('.') }),
          catch: (err) => err,
        });
        passed(held);
        was = passLines(pass, was);
        yield* Effect.sleep(every);
      }
    }).pipe(Effect.scoped),
  );
}

/** `wf feed`: the feed's lines from a cursor, and the cursor to read from next. */
export function feedVerb(rest: string[]): void {
  const { lines, cursor } = readFeed(feedCursor('feed', rest));
  for (const line of lines) console.log(feedLineWords(line));
  return console.log(`cursor: ${cursor}`);
}

/** `wf watch`: the feed's lines as they come, from a cursor, until it is stopped (`watching`). */
export function watchVerb(rest: string[]): void | Promise<void> {
  const from = feedCursor('watch', rest);
  const refusal = feedCursorRefusal(from);
  if (refusal) usage(refusal);
  return runMain(watching(from));
}

/** Each verb `wf` takes, by its name on the command line: a `Map`, so a name every object has is no verb. */
export const VERBS: ReadonlyMap<string, Verb> = new Map<string, Verb>([
  ['start', startVerb],
  ['plan', planVerb],
  ['inbox', inboxVerb],
  ['factory', factoryVerb],
  ['tick', tickVerb],
  ['up', upVerb],
  ['feed', feedVerb],
  ['watch', watchVerb],
  ['cancel', cancelVerb],
  ['rm', rmVerb],
  ['prune', pruneVerb],
  ['hold', holdVerb],
  ['decide', decideVerb],
  ['stats', statsVerb],
  ['show', showVerb],
  ['logs', logsVerb],
  ['agents custom', agentsCustom],
]);

/**
 * A command of the table (`COMMANDS`), run from the command line: its arguments read against its spec — the help printed for too little —
 * then refused by its `check`, handed to its handler, and the lines it prints of the answer printed.
 */
async function commanded(command: Command, rest: string[], e: Engine): Promise<void> {
  const args = parseArgv(command.spec, rest);
  if (args === undefined) return console.log(HELP);
  const wrong = command.check?.(args);
  if (wrong) usage(wrong);
  const data = await command.handler(e, args);
  for (const line of command.print(data, args)) console.log(line);
  for (const line of command.note?.(data, args) ?? []) console.error(line);
}

/** The names `wf` takes, its commands' and its verbs', a name of two words among them: `agents card`. */
const NAMES = [...COMMANDS.filter((c) => c.only?.side !== 'api').map((c) => c.name), ...VERBS.keys()];

/**
 * The name `argv` opens with, the longest of `NAMES` whose words it starts with, and the arguments after it — or none. A name that heads
 * others (`agents`, before `agents card`) given a word that is none of its flags is given too little, and gets the help.
 */
function namedIn(argv: readonly string[]): { name: string; rest: string[] } | undefined {
  const opens = (name: string) => name.split(' ').every((word, i) => argv[i] === word);
  const name = NAMES.filter(opens).sort((a, b) => b.length - a.length)[0];
  if (name === undefined) return undefined;
  const rest = argv.slice(name.split(' ').length);
  const heads = NAMES.some((other) => other.startsWith(`${name} `));
  const flags = COMMANDS.find((c) => c.name === name)?.spec.flags.map((f) => f.flag) ?? [];
  if (heads && rest[0] !== undefined && !flags.includes(rest[0].split('=')[0])) return undefined;
  return { name, rest };
}

/**
 * Runs the command or the verb `argv` names and prints what it did, or prints the help for none and for a name it does not know. `e` is the
 * engine they talk to: the board under `WF_ROOT`, unless a test hands it one of its own.
 */
export async function main(argv: string[], e: Engine = engine()): Promise<void> {
  const named = namedIn(argv);
  if (named === undefined) return console.log(HELP);
  const command = COMMANDS.find((c) => c.name === named.name && c.only?.side !== 'api');
  if (command) return commanded(command, named.rest, e);
  return VERBS.get(named.name)!(named.rest, e);
}
