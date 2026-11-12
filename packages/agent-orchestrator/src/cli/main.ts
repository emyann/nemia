/**
 * The verbs' table, and the runners of the commands the CLI runs itself (`RUNS`): `nemia tick` and `nemia up` here, the others beside.
 */
import path from 'node:path';
import { Effect, Layer, Schema } from 'effect';
import { COMMAND_WORDS } from 'objects';
import {
  breakdownLines,
  ceilingLines,
  ceilings,
  Conflict,
  pausedLines,
  engine,
  everyOf,
  feedHubLayer,
  lastPassCost,
  queueLine,
  refusalLines,
  slotWord,
  storeRefusal,
  takeoverLine,
  runMain,
  tickRun,
  runWith,
  builtinGitPlace,
  PlaceService,
  settingsOf,
  storeConfigLayer,
  wfRoot,
  type Place,
  telemetryLayer,
  up,
  waitWord,
  type TakenStore,
  parseArgv,
  TABLE,
  type Args,
  type Command,
  type Ran,
  type Served,
  currentRelease,
  runningRelease,
  claudeTokenFile,
  claudeTokenStatus,
  loadClaudeToken,
  tokenWarningLine,
  trialRefusal,
  checkoutPromiseLine,
  ensureDaemon,
  liveDemandHost,
  type DemandHost,
  renamedIn,
  PAUSE,
  pauseNowPreview,
  pauseNowPreviewLines,
  withProposalsPass,
  withResolutionProposer,
  type Env,
  CLI_VERBS,
  PAUSE_NOW,
} from '../runner.ts';
import { forwardedOf, unlinked } from '../command/forward.verb.ts';
import { printed, answered, forwardedOr, HELP, placedIn, usage, WF_HINT, type Engine, type Verb } from './flags.ts';
import { decideVerb } from './decide/decide.ts';
import {
  admitRun,
  agentsCustomRun,
  agentsRun,
  agentsCardRun,
  policyProposeRun,
  factoryInstructRun,
  factoryRulesRun,
  factoryServerAddRun,
  pruneVerb,
  rmVerb,
  sayRun,
} from './runs.ts';
import { inboxAddRun, inboxFromRun, inboxQueueRun, startRun } from './start.ts';

/** What one pass of the tick hands back: each run it advanced, the queue's card, the feed's failure, its cost, and what it refused. */
type Pass = Effect.Success<ReturnType<typeof tickRun>>;

/**
 * A run's line on `nemia tick`: its status, as the pass judged it — `awaiting approval` or `waiting` for one a person alone stops, `failed`
 * for one in which a step broke — and what the pass did to it.
 */
function tickRunLine(r: Pass['runs'][number]): string {
  const filed = r.filed.length ? `  filed: ${r.filed.join(', ')}` : '';
  const tried = r.tried.length ? `  tried again: ${r.tried.join(', ')}` : '';
  const looped = r.looped.length ? `  round again: ${r.looped.join(', ')}` : '';
  const checked = r.checked.length ? `  checking: ${r.checked.join(', ')}` : '';
  const unreachable = r.unreachable.length ? `  unreachable: ${r.unreachable.join(', ')}` : '';
  const waiting = r.waiting.length ? `  ${waitWord(r.waiting)}` : r.held ? `  ${slotWord(r.held)}` : '';
  return `${r.run.id}  ${r.status}${filed}${tried}${looped}${checked}${unreachable}${waiting}`;
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
async function tickVerb(env: Env, args: Args, e: Engine, place: Place): Promise<void> {
  const stats = args.stats === true;
  const held = storeRefusal(wfRoot(env), 'tick');
  if (held) throw new Conflict({ message: stats ? `${held} What its last pass cost is read without a pass: nemia up --stats.` : held });
  const { cost } = tickLines(await runWith(e, placedIn(env, place, withProposalsPass(tickRun({ repo: path.resolve('.') })))));
  if (stats) for (const line of cost ? breakdownLines(cost) : ['this pass was not measured']) console.log(line);
  return;
}

/** `nemia up --stats`: what the last pass cost, read off the store at `home`, ticking nothing, and who wrote it. */
function upStats(home: string): void {
  const cost = lastPassCost(home);
  const daemon = storeRefusal(home, 'tick') !== undefined;
  if (!cost)
    return console.log(
      `no pass has written what it cost to ${path.join(home, 'tick-stats.json')} yet — ${daemon ? 'the daemon that holds this store writes it after its next pass' : 'no daemon holds this store: run nemia tick --stats, or start one (npm start in apps/api, or nemia up; any nemia command that files work starts one too)'}`,
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
 * card that names no repository starts on the one it is typed in, as `nemia start` takes `.`. Before anything it loads the person's sign-in
 * token file into the environment the sessions inherit, where `CLAUDE_CODE_OAUTH_TOKEN` is unset (`loadClaudeToken`), refused (exit 2)
 * where the file is readable by others, and says once, as it takes the store, the warning of a kept token near or past its year
 * (`tokenWarningLine`).
 */
function upVerb(env: Env, args: Args, e: Engine, place: Place): void | Promise<void> {
  const store = wfRoot(env);
  if (args.stats === true) return upStats(store);
  const signedIn = loadClaudeToken(env);
  const asked = everyOf(typeof args.every === 'string' ? args.every : undefined);
  const every = 'refusal' in asked ? usage(asked.refusal) : asked.every;
  const ceiling = ceilings(settingsOf(env));
  const onTaken = ({ held, replaced }: TakenStore) =>
    Effect.sync(() => {
      console.log(`up — every ${every}ms, ^C to stop`);
      for (const line of ceilingLines(ceiling)) console.log(`   ${line}`);
      console.log(
        `   holds ${store} as pid ${held.pid} — a second daemon, the api or a nemia up, or a nemia tick, on this store is refused while it ticks (daemon.json)`,
      );
      const took = takeoverLine(replaced, store, Date.now());
      if (took) console.log(`   ${took}`);
      const promise = checkoutPromiseLine(runningRelease());
      if (promise) console.log(`   ${promise}`);
      if (signedIn === 'loaded') console.log(`   sessions sign in with the token in ${claudeTokenFile(store)}`);
      const aged = signedIn === 'loaded' ? tokenWarningLine(claudeTokenStatus(store)) : undefined;
      if (aged) console.log(`   warning: ${aged}`);
    });
  const daemon = up(e, { every, repo: path.resolve('.'), holder: 'up', onTaken });
  return runMain(
    daemon.pipe(
      Effect.scoped,
      Effect.provide(Layer.mergeAll(telemetryLayer(env), feedHubLayer(), PlaceService.layer(place), storeConfigLayer(env))),
    ),
  );
}

/**
 * `nemia pause`'s runner: the CLI asks before it pauses at once — `--now` says what it would cut and writes nothing, and acts on `--yes`
 * alone, since the verb takes no yes (`PAUSE`); every other pause is handed to its handler as any command is.
 */
async function pauseRun(env: Env, args: Args, e: Engine, place: Place): Promise<void> {
  if (args.now === true && args.yes !== true) {
    const preview = await forwardedOr(env, PAUSE_NOW, {}, () => runWith(e, placedIn(env, place, pauseNowPreview())));
    for (const line of pauseNowPreviewLines(preview)) console.log(line);
    return;
  }
  const given = inputOf(PAUSE, args);
  const data = await answered(env, e, place, PAUSE, given);
  for (const line of printed(PAUSE, data, given)) console.log(line);
}

/** Each verb `nemia` takes, by its name on the command line: a `Map`, so a name every object has is no verb. */
export const VERBS: ReadonlyMap<string, Verb> = new Map<string, Verb>([['decide', decideVerb]]);

/** A runner of the CLI: the environment `main` composes from, the parsed line, the engine and the place. */
type Runner = (env: Env, args: Args, e: Engine, place: Place) => void | Promise<void>;

/**
 * The runner of each command the CLI runs itself, by its name — those it serves alone (`RAN`); `nemia rm` and `nemia prune`,
 * whose runners walk the many runs a command line names through their handlers; and `nemia start`, `nemia inbox add`, `nemia inbox queue`,
 * `nemia agents custom`, `nemia factory instruct` and `nemia policy propose`, whose runners read the files and folders a command line
 * names before their handlers; `nemia inbox from`,
 * whose runner reads the card first where the command line is forwarded; `nemia factory server
 * add`, whose runner maps its flags to the write its handler takes; `nemia say`, whose runner reads who calls off the session's token;
 * and `nemia admit`, whose runner reads the call on stdin: handed its
 * arguments once read and checked.
 */
export const RUNS: ReadonlyMap<string, Runner> = new Map<string, Runner>([
  ['tick', tickVerb],
  ['up', upVerb],
  ['rm', rmVerb],
  ['prune', pruneVerb],
  ['start', startRun],
  ['inbox add', inboxAddRun],
  ['inbox queue', inboxQueueRun],
  ['inbox from', inboxFromRun],
  ['agents', agentsRun],
  ['agents card', agentsCardRun],
  ['agents custom', agentsCustomRun],
  ['factory instruct', factoryInstructRun],
  ['factory rules', factoryRulesRun],
  ['factory server add', factoryServerAddRun],
  ['policy propose', policyProposeRun],
  ['admit', admitRun],
  ['pause', pauseRun],
  ['say', sayRun],
]);

/**
 * A command of the table (`TABLE`), run from the command line: its long help printed for `--help` where it has one (`manual`); else its
 * arguments read against its spec — the help printed for too little — then refused by its `check`; for a command that ticks, the daemon
 * started where none ticks the store (`ensureDaemon`, over `demand`); then handed to its runner (`RUNS`) where it has one, else to its
 * handler, and the lines it prints of the answer printed.
 */
async function commanded(
  env: Env,
  command: Command | Served | Ran,
  rest: string[],
  e: Engine,
  demand: (root: string) => DemandHost,
  place: Place,
): Promise<void> {
  if (command.manual !== undefined && rest.includes('--help')) return console.log(command.manual);
  const args = parseArgv(command.spec, rest);
  if (args === undefined) return console.log(HELP);
  const wrong = command.check?.(args);
  if (wrong) usage(wrong);
  if (command.ticks === true && forwardedOf(env) === undefined) await Effect.runPromise(ensureDaemon(demand(wfRoot(env))));
  const runner = RUNS.get(command.name);
  if (runner) return runner(env, args, e, place);
  if (command.handler === undefined)
    throw new Error(`${command.name} has neither a runner nor a handler: give it one in RUNS or its entry`);
  const entry: Served & Partial<Pick<Command, 'print' | 'note'>> = command;
  const given = inputOf<Readonly<Record<string, unknown>>, Args>(entry, args);
  const data = await answered(env, e, place, entry, given, withResolutionProposer);
  for (const line of printed(entry, data, given)) console.log(line);
  for (const line of entry.note?.(data, given) ?? []) console.error(line);
}

/**
 * The arguments `command`'s handler takes: the parsed `args` as they are, or decoded through its `input` where it says one, a key its
 * handler takes that the parse left out or gave another type refused, exit 2, before anything is read. The decoded value is what the
 * typed entry takes, its input erased as the table holds it (`tableEntry`).
 */
function inputOf<D extends object, I>(command: Served<D, I>, args: Args): I;
function inputOf(command: Served, args: Args): Args {
  if (command.input === undefined) return args;
  const decoded = Schema.decodeUnknownExit(command.input)(args);
  if (decoded._tag === 'Success') return decoded.value as Args;
  return usage(`nemia ${command.name} was given arguments its handler does not take: nemia ${command.name} ${command.usage}.`);
}

/** The names of the commands the client holds (`objects`' `COMMAND_WORDS`), which this CLI no longer runs. */
const MOVED: readonly string[] = COMMAND_WORDS.map((w) => w.name);

/**
 * The names `nemia` takes, its commands' and its verbs', a name of two words among them: `agents card`; a command the client holds left
 * out, though its entry stays in the table for the api to call.
 */
const NAMES = [...TABLE.filter((c) => c.only?.side !== 'api' && !MOVED.includes(c.name)).map((c) => c.name), ...VERBS.keys()];

/**
 * The name `argv` opens with, the longest of `NAMES` whose words it starts with, and the arguments after it — or none, and none where a
 * command the client holds (`MOVED`) is longer, so its words print the help rather than reach a name that heads it (`agents`). A name
 * that heads others (`agents`, before `agents card`) given a word none of them is gets that word, and refuses it in its own words.
 */
function namedIn(argv: readonly string[]): { name: string; rest: string[] } | undefined {
  const opens = (name: string) => name.split(' ').every((word, i) => argv[i] === word);
  const name = [...NAMES, ...MOVED].filter(opens).sort((a, b) => b.length - a.length)[0];
  if (name === undefined || MOVED.includes(name)) return undefined;
  return { name, rest: argv.slice(name.split(' ').length) };
}

/**
 * The engine of a command line forwarded to another machine's api, which builds none here: every entry is called through `answered`,
 * which reads no engine when forwarded, so a read of this one is a runner that reached past the seam, said as such.
 */
const unbuilt = (verb: string): Engine =>
  new Proxy({} as Engine, {
    get: () => {
      throw new Error(
        `nemia ${verb} reached for this machine's engine while forwarded to another's (NEMIA_SERVER): run it there, or here with NEMIA_CONTEXT=local.`,
      );
    },
  });

/**
 * Whether the name `named` runs forwarded: a command of the table or a verb of the CLI's own with an endpoint it calls (`served`); and a
 * help, which is printed here.
 */
const linkedOrHelp = (name: string, rest: readonly string[]): boolean =>
  rest.includes('--help') ||
  [...TABLE.filter((c) => c.only?.side !== 'api'), ...CLI_VERBS].some((c) => c.name === name && c.served !== undefined);

/**
 * Runs the command or the verb `argv` names and prints what it did, or prints the help for none and for a name it does not know. `given` is
 * the engine they talk to, which a test hands; else the board under `WF_ROOT`, built once the guard passed. `demand` is the machine a
 * command that ticks starts the daemon on (`ensureDaemon`), which a test hands; else the live one. Refused (`Conflict`) before any command
 * but `version` and a help: a checkout on a store that runs an install (`trialRefusal`).
 *
 * Forwarded to another machine's api (`NEMIA_SERVER`, `forwardedOf`), it builds no engine and checks no install of this machine's, starts
 * no daemon here, and refuses (`Invalid`) a command or a verb that no endpoint serves (`unlinked`): it runs only where its store is.
 */
export async function main(
  argv: string[],
  given?: Engine,
  demand: (root: string) => DemandHost = liveDemandHost,
  place: Place = builtinGitPlace,
  env: Env = process.env,
): Promise<void> {
  const renamed = renamedIn(argv);
  if (renamed.hint !== undefined) process.stderr.write(`${renamed.hint}\n`);
  const named = namedIn(renamed.words);
  if (named === undefined) return console.log(HELP);
  const forwarded = forwardedOf(env) !== undefined;
  if (forwarded && !linkedOrHelp(named.name, named.rest)) throw unlinked(named.name);
  const exempt = forwarded || named.name === 'version' || named.rest.includes('--help');
  const trial = exempt ? null : trialRefusal(runningRelease(), currentRelease(wfRoot(env)), wfRoot(env), env);
  if (trial !== null) throw new Conflict({ message: trial });
  const e = given ?? (forwarded ? unbuilt(named.name) : engine(env));
  const command = TABLE.find((c) => c.name === named.name && c.only?.side !== 'api');
  if (command) return commanded(env, command, named.rest, e, demand, place);
  const verb = VERBS.get(named.name);
  if (verb === undefined) return console.log(HELP);
  return verb(env, named.rest, e, place);
}

/** Runs `argv` as `main` does, for the `wf` alias: its one-line hint first, on stderr, so what a script reads off stdout stays the same. */
export function aliased(argv: string[], e?: Engine): Promise<void> {
  process.stderr.write(`${WF_HINT}\n`);
  return main(argv, e);
}
