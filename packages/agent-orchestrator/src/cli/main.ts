/**
 * The verbs' table, and the runners of the commands the CLI runs itself (`RUNS`): `nemia tick`, `nemia up` and `nemia watch` here, the
 * others beside.
 */
import path from 'node:path';
import { Effect, Layer, Stream, type Duration } from 'effect';
import {
  breakdownLines,
  ceilingLines,
  ceilings,
  Conflict,
  pausedLines,
  engine,
  everyOf,
  feedCursorRefusal,
  feedHubLayer,
  daemonStanding,
  livenessLine,
  livenessWords,
  wakeOf,
  watchedLine,
  type DaemonStanding,
  type Liveness,
  type Watched,
  HOME,
  lastPassCost,
  queueLine,
  refusalLines,
  slotWord,
  storeRefusal,
  takeoverLine,
  runMain,
  tickRun,
  runWith,
  shippedGitPlace,
  PlaceService,
  type Place,
  telemetryLayer,
  up,
  waitWord,
  watchFeed,
  type TakenStore,
  parseArgv,
  TABLE,
  type Args,
  type Command,
  type Ran,
  currentRelease,
  runningRelease,
  trialRefusal,
  ensureDaemon,
  liveDemandHost,
  type DemandHost,
} from '../runner.ts';
import { HELP, placedIn, usage, WF_HINT, type Engine, type Verb } from './flags.ts';
import { decideVerb } from './decide/decide.ts';
import { admitRun, agentsCustomRun, autoProposeRun, factoryInstructRun, factoryRulesRun, pruneVerb, rmVerb } from './runs.ts';
import { inboxAddRun, inboxQueueRun, planRun, startRun } from './start.ts';
import { agentsWriteRun, skillsWriteRun, workflowsWriteRun } from './writers.ts';

/** How often `nemia watch` reads the lease for its liveness. */
export const LIVENESS_EVERY: Duration.Input = '2 seconds';

/** What a watch that has read nothing yet takes the store to be: up, so a store already down is said at once, and one up is not. */
const ASSUMED: Liveness = { state: 'up', at: '', text: '' };

/**
 * The store's liveness as it changes: `lease` read at once and every `every`, judged (`livenessLine`), and each reading said only when its
 * state is not the last one's — `down` at once when the store is already down, then a line for each fall and each recovery. Read again on
 * every poll, never carried: a watch started again reads the same. Its lines are the watch's own, never the feed's. Never ends.
 */
export const livenessLines = (
  lease: () => DaemonStanding,
  every: Duration.Input = LIVENESS_EVERY,
  now: () => number = Date.now,
): Stream.Stream<Liveness> =>
  Stream.tick(every).pipe(
    Stream.map(() => livenessLine(lease(), now())),
    Stream.prepend([ASSUMED]),
    Stream.changesWith((a, b) => a.state === b.state),
    Stream.drop(1),
  );

/**
 * `nemia watch` from a cursor already checked: the feed's lines as they are written, on stdout, until `stop()` — as `how` prints them
 * (`watchedLine`), in words or as JSON, every line or the wake lines alone; a feed cut under the watch is said once on stderr, and followed
 * from the start of the feed there is now (`watchFeed`). In JSON the banner goes to stderr too, so stdout holds nothing but JSON.
 *
 * The banner is printed once the watch holds its cursor, not before: a reader that acts on `watching from` — cuts the feed, or writes to it
 * — finds a watch already there to see it, where a cut before the watch holds its cursor would have it refuse the cursor it was given.
 */
export function watchPrinted(from: number, how: Watched = {}): { stop(): void } {
  const watch = watchFeed({
    from,
    onLine: (line, cursor) => {
      const printed = watchedLine(line, cursor, how);
      if (printed !== undefined) console.log(printed);
    },
    onCut: (said) => console.error(`nemia watch: ${said}`),
    onError: (err) => console.error(`nemia watch: ${(err as Error).message ?? String(err)}`),
  });
  (how.json === true ? console.error : console.log)(`watching from ${from}, ^C to stop`);
  return watch;
}

/**
 * `nemia watch` as an Effect: `watchPrinted(from, how)` held in its scope until it is interrupted, and stopped as that scope closes, so an
 * interrupted watch leaves no watcher and no timer behind; beside it, the store's liveness read off `lease` and printed as it changes
 * (`livenessLines`), whatever the wake words. It never ends of itself; a cursor it cannot read from fails it.
 */
export const watching = (
  from: number,
  how: Watched = {},
  lease: () => DaemonStanding = () => daemonStanding(),
): Effect.Effect<never, unknown> =>
  Effect.acquireRelease(Effect.try({ try: () => watchPrinted(from, how), catch: (err) => err }), (watch) =>
    Effect.sync(() => watch.stop()),
  ).pipe(
    Effect.andThen(
      Effect.forkScoped(Stream.runForEach(livenessLines(lease), (l) => Effect.sync(() => console.log(livenessWords(l, how.json))))),
    ),
    Effect.andThen(Effect.never),
    Effect.scoped,
  );

/** What one pass of the tick hands back: each run it advanced, the queue's card, the feed's failure, its cost, and what it refused. */
type Pass = Effect.Success<ReturnType<typeof tickRun>>;

/**
 * A run's line on `nemia tick`: its status, as the pass judged it — `awaiting approval` or `blocked` for one a person alone stops, `failed`
 * for one in which a step broke — and what the pass did to it.
 */
export function tickRunLine(r: Pass['runs'][number]): string {
  const filed = r.filed.length ? `  filed: ${r.filed.join(', ')}` : '';
  const tried = r.tried.length ? `  tried again: ${r.tried.join(', ')}` : '';
  const looped = r.looped.length ? `  round again: ${r.looped.join(', ')}` : '';
  const checked = r.checked.length ? `  checking: ${r.checked.join(', ')}` : '';
  const blocked = r.blocked.length ? `  blocked: ${r.blocked.join(', ')}` : '';
  const waiting = r.waiting.length ? `  ${waitWord(r.waiting)}` : r.held ? `  ${slotWord(r.held)}` : '';
  return `${r.run.id}  ${r.status}${filed}${tried}${looped}${checked}${blocked}${waiting}`;
}

/** What `nemia tick` prints of a run: its line (`tickRunLine`), then its notes, a line each. */
function tickRunLines(r: Pass['runs'][number]): void {
  console.log(tickRunLine(r));
  for (const note of r.notes) console.log(`   ${note}`);
}

/**
 * A pass's lines on `nemia tick`: the pause it read and what finishes under it, what failed or was left out and what it forgot of removed
 * runs on stderr, then what it refused, the queue's card and each run; returns it.
 */
function tickLines(pass: Pass): Pass {
  const { runs: results, queue, feedError, refused, unreadable, forgetting, pause } = pass;
  if (pause) for (const line of pausedLines(pause)) console.log(line);
  if (feedError) console.error(feedError);
  for (const why of unreadable ?? []) console.error(`left out: ${why}`);
  for (const { text } of forgetting ?? []) console.error(text);
  for (const line of refusalLines(refused ?? [], new Set()).lines) console.log(line);
  if (queue) console.log(queueLine(queue));
  if (!results.length && !queue && !unreadable?.length) console.log('no runs');
  for (const r of results) tickRunLines(r);
  return pass;
}

/**
 * `nemia tick`: one pass, and what it did to each run; with `--stats`, what the pass cost. Beside a daemon that ticks the store it is
 * refused, with no way to force it. A queued card that names no repository starts on the one it is typed in, as `nemia start` takes `.`.
 */
async function tickVerb(args: Args, e: Engine, place: Place): Promise<void> {
  const stats = args.stats === true;
  const held = storeRefusal('tick');
  if (held) throw new Conflict({ message: stats ? `${held} What its last pass cost is read without a pass: nemia up --stats.` : held });
  const { cost } = tickLines(await runWith(e, placedIn(place, tickRun({ repo: path.resolve('.') }))));
  if (stats) for (const line of cost ? breakdownLines(cost) : ['this pass was not measured']) console.log(line);
  return;
}

/** `nemia up --stats`: what the last pass cost, read off the store, ticking nothing, and who wrote it. */
function upStats(): void {
  const cost = lastPassCost();
  const daemon = storeRefusal('tick') !== undefined;
  if (!cost)
    return console.log(
      `no pass has written what it cost to ${path.join(HOME, 'tick-stats.json')} yet — ${daemon ? 'the daemon that holds this store writes it after its next pass' : 'no daemon holds this store: run nemia tick --stats, or start one (npm start in apps/api, or nemia up; any nemia command that files work starts one too)'}`,
    );
  for (const line of breakdownLines(cost)) console.log(line);
  return console.log(
    daemon
      ? 'written by the daemon that holds this store, after its last pass'
      : 'no daemon holds this store now, so this was the last pass anyone ran: nemia tick --stats runs one and says what it cost',
  );
}

/**
 * `nemia up`: the headless daemon, a pass every interval until it is stopped, or `--stats`. It refuses its interval (`everyOf`) and its
 * ceilings (`ceilings`) before it takes the store, then runs the daemon's controller (`up`) as `nemia up` under `runMain`, its passes
 * said through the process's telemetry (`telemetryLayer`) and its feed's lines published to its live readers (`feedHubLayer`). A queued
 * card that names no repository starts on the one it is typed in, as `nemia start` takes `.`.
 */
function upVerb(args: Args, e: Engine, place: Place): void | Promise<void> {
  if (args.stats === true) return upStats();
  const asked = everyOf(typeof args.every === 'string' ? args.every : undefined);
  const every = 'refusal' in asked ? usage(asked.refusal) : asked.every;
  const ceiling = ceilings();
  const store = HOME;
  const onTaken = ({ held, replaced }: TakenStore) =>
    Effect.sync(() => {
      console.log(`up — every ${every}ms, ^C to stop`);
      for (const line of ceilingLines(ceiling)) console.log(`   ${line}`);
      console.log(
        `   holds ${store} as pid ${held.pid} — a second daemon, the api or a nemia up, or a nemia tick, on this store is refused while it ticks (daemon.json)`,
      );
      const took = takeoverLine(replaced, store, Date.now());
      if (took) console.log(`   ${took}`);
    });
  const daemon = up(e, { every, repo: path.resolve('.'), holder: 'wf up', onTaken });
  return runMain(
    daemon.pipe(Effect.scoped, Effect.provide(Layer.mergeAll(telemetryLayer(process.env), feedHubLayer(), PlaceService.layer(place)))),
  );
}

/** `nemia watch`: the feed's lines as they come, from a cursor, and the store's liveness, until it is stopped (`watching`). */
function watchVerb(args: Args): void | Promise<void> {
  const from = typeof args.cursor === 'string' ? Number(args.cursor) : 0;
  const refusal = feedCursorRefusal(from);
  if (refusal) usage(refusal);
  return runMain(watching(from, { json: args.json === true, wake: wakeOf(args) }));
}

/** Each verb `nemia` takes, by its name on the command line: a `Map`, so a name every object has is no verb. */
export const VERBS: ReadonlyMap<string, Verb> = new Map<string, Verb>([['decide', decideVerb]]);

/**
 * The runner of each command the CLI runs itself, by its name — those it serves alone (`RAN`, `nemia plan`); `nemia rm` and `nemia prune`,
 * whose runners walk the many runs a command line names through their handlers; and `nemia start`, `nemia inbox add`, `nemia inbox queue`,
 * `nemia agents custom`, `nemia factory instruct`, `nemia auto propose`, `nemia agents write`, `nemia skills write` and
 * `nemia workflows write`, whose runners read the files and folders a command line names before their handlers; and `nemia admit`, whose
 * runner reads the call on stdin: handed its arguments once read and checked.
 */
export const RUNS: ReadonlyMap<string, (args: Args, e: Engine, place: Place) => void | Promise<void>> = new Map([
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
  ['factory instruct', factoryInstructRun],
  ['factory rules', factoryRulesRun],
  ['auto propose', autoProposeRun],
  ['agents write', agentsWriteRun],
  ['skills write', skillsWriteRun],
  ['workflows write', workflowsWriteRun],
  ['admit', admitRun],
]);

/**
 * A command of the table (`TABLE`), run from the command line: its long help printed for `--help` where it has one (`manual`); else its
 * arguments read against its spec — the help printed for too little — then refused by its `check`; for a command that ticks, the daemon
 * started where none ticks the store (`ensureDaemon`, over `demand`); then handed to its runner (`RUNS`) where it has one, else to its
 * handler, and the lines it prints of the answer printed.
 */
async function commanded(command: Command | Ran, rest: string[], e: Engine, demand: () => DemandHost, place: Place): Promise<void> {
  if (command.manual !== undefined && rest.includes('--help')) return console.log(command.manual);
  const args = parseArgv(command.spec, rest);
  if (args === undefined) return console.log(HELP);
  const wrong = command.check?.(args);
  if (wrong) usage(wrong);
  if (command.ticks === true) await Effect.runPromise(ensureDaemon(demand()));
  const runner = RUNS.get(command.name);
  if (runner || command.handler === undefined) return runner!(args, e, place);
  const data = await runWith(e, placedIn(place, command.handler(args)));
  for (const line of command.print(data, args)) console.log(line);
  for (const line of command.note?.(data, args) ?? []) console.error(line);
}

/** The names `nemia` takes, its commands' and its verbs', a name of two words among them: `agents card`. */
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
 * Runs the command or the verb `argv` names and prints what it did, or prints the help for none and for a name it does not know. `given` is
 * the engine they talk to, which a test hands; else the board under `WF_ROOT`, built once the guard passed. `demand` is the machine a
 * command that ticks starts the daemon on (`ensureDaemon`), which a test hands; else the live one. Refused (`Conflict`) before any command
 * but `version` and a help: a checkout on a store that runs an install (`trialRefusal`).
 */
export async function main(
  argv: string[],
  given?: Engine,
  demand: () => DemandHost = liveDemandHost,
  place: Place = shippedGitPlace,
): Promise<void> {
  const named = namedIn(argv);
  if (named === undefined) return console.log(HELP);
  const exempt = named.name === 'version' || named.rest.includes('--help');
  const trial = exempt ? null : trialRefusal(runningRelease(), currentRelease(), HOME, process.env);
  if (trial !== null) throw new Conflict({ message: trial });
  const e = given ?? engine();
  const command = TABLE.find((c) => c.name === named.name && c.only?.side !== 'api');
  if (command) return commanded(command, named.rest, e, demand, place);
  return VERBS.get(named.name)!(named.rest, e, place);
}

/** Runs `argv` as `main` does, for the `wf` alias: its one-line hint first, on stderr, so what a script reads off stdout stays the same. */
export function aliased(argv: string[], e?: Engine): Promise<void> {
  process.stderr.write(`${WF_HINT}\n`);
  return main(argv, e);
}
