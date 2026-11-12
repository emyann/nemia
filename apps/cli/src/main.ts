/**
 * `nemia`, a client of the api: every store verb asks the api serving the store the context in use names (`context.ts`) over HTTP. A
 * command whose words the client holds (`MOVED_COMMANDS`) is parsed, helped and run here (`commands/commanded.ts`); the client's own verbs
 * (`CLIENT_VERBS`: `get`, `apply`, `explain`, `propose`, `proposals`, `decide`, `channel`) ask it whatever else is typed, each saying its
 * own help (`channel` serves the feed to a Claude Code session over stdio, `watch/channel.ts`); and its reads `doctor` and `daemon`
 * (`READ_VERBS`) ask it too. A verb about this machine (`MACHINE_VERBS`) and a help of one run on the orchestrator's own CLI, spawned with
 * the same words (`local.ts`), whatever context is in use; `template export --factory` among them reads the factory's parts through the
 * api first (`template-export.ts`). `--local` is refused, exit 2, naming the command typed without it, but on `doctor carry`
 * (`carryUnlocal`), and so is a word typed under a remote context that the client does not answer and this machine does not own, naming
 * `nemia --help` and `NEMIA_CONTEXT=local`: nothing is forwarded. `nemia config` reads and writes the contexts themselves, and `nemia
 * pair <url>` writes one a pairing minted the token of (`pair.ts`), whatever context is in use.
 */
import { CONFIG_VERB, chosenOf, config, unheld } from './context.ts';
import { doctor, RETIRED_VERB, retiredVerb } from './doctor.ts';
import { type Entry, spawned, unlocal } from './local.ts';
import { PAIR_VERB, pair } from './pair.ts';
import { type ClientVerb, MACHINE_VERBS, MOVED_COMMANDS, type MovedName, nameOf, type ReadVerb, routeOf } from './route.ts';
import { renamedIn } from 'objects';
import { Refused } from './refused.ts';
import { commanded } from './commands/commanded.ts';
import { daemon } from './reads/daemon.ts';
import { exportsAFactory, templateExported } from './template-export.ts';
import { apply } from './objects/apply.ts';
import { decide } from './objects/decide.ts';
import { explain } from './objects/explain.ts';
import { get } from './objects/get.ts';
import { propose, proposals } from './objects/propose.ts';
import { channel } from './watch/channel.ts';

/** What the `wf` alias says first, on stderr, the same words the orchestrator's alias says. */
export const WF_HINT = 'wf is now nemia: type `nemia <args>`; wf stays an alias until a later release removes it.';

/** Each read whose help the old path still holds, `doctor` and `daemon`, run on the words after its name: it prints, answering its code. */
const READS: Readonly<Record<ReadVerb, (args: readonly string[]) => Promise<number>>> = { doctor, daemon };

/** Each of the client's own verbs' runner, on the words after its name. */
const own = (entry: Entry): Readonly<Record<ClientVerb, (args: readonly string[]) => Promise<number>>> => ({
  get,
  apply,
  explain,
  propose,
  proposals,
  decide: (args) => decide(args, (argv) => main(argv, entry)),
  channel,
});

/** Whether `name` is one of `MOVED_COMMANDS`, whose words the client holds. */
const isMoved = (name: string): name is MovedName => (MOVED_COMMANDS as readonly string[]).includes(name);

/**
 * `--local` typed, which reads no store in process any more: refused, exit 2, naming the command typed without it, and, under a context
 * other than this machine's, the same command asked of this machine's daemon (`NEMIA_CONTEXT=local`).
 */
const localRefused = (argv: readonly string[], here: boolean): Refused => {
  const command = ['nemia', ...argv.filter((word) => word !== '--local')].join(' ');
  return new Refused(
    `--local reads no store in process any more: every command asks a daemon's api, this machine's started on demand. Type \`${command}\`` +
      (here ? '' : `, or ask this machine's daemon whatever context is in use: \`NEMIA_CONTEXT=local ${command}\``),
  );
};

/** Whether `name` is one of `MACHINE_VERBS`, which runs here whatever context is named, held or not. */
const ofTheMachine = (name: string): boolean => (MACHINE_VERBS as readonly string[]).includes(name);

/**
 * A word typed under the remote context `context` that the client does not answer and that is no verb of this machine: refused, exit 2,
 * since no path takes it to that daemon and this machine's store is not the context's, naming the commands there are and how to ask this
 * machine's store instead.
 */
const stranded = (argv: readonly string[], name: string, context: string): Refused =>
  new Refused(
    `nemia ${name} is no command the client answers, and the context in use, ${context}, is a remote daemon: see the commands with \`nemia --help\`, or ask this machine's store with \`NEMIA_CONTEXT=local nemia ${argv.join(' ')}\``,
  );

/**
 * `argv` as the route reads it: a `nemia doctor carry --local` without its `--local`, which every `nemia upgrade` of v1.7.0 and before
 * types to run the new release's carry, and which runs in process whatever is typed (`src/doctor.ts`); every other `argv` as it is, its
 * `--local` refused (`localRefused`).
 */
const carryUnlocal = (argv: readonly string[]): readonly string[] =>
  argv[0] === 'doctor' && argv[1] === 'carry' ? argv.filter((word) => word !== '--local') : argv;

/**
 * The verbs answered before any context or route is read: `nemia config` and `nemia pair`, about the client's own config, and the
 * retired word `readiness`, refused naming `nemia doctor`.
 */
const FIRST: Readonly<Record<string, (args: readonly string[]) => Promise<number>>> = {
  [CONFIG_VERB]: config,
  [PAIR_VERB]: pair,
  [RETIRED_VERB]: () => Promise.reject(retiredVerb()),
};

/**
 * Runs `argv` and answers the exit code: on the api for a read of the client's, a verb of its own and a command whose words it holds,
 * else on the old path under `entry`, a verb about this machine; refused, exit 2, where `--local` is typed (`localRefused`) but on `doctor
 * carry` (`carryUnlocal`), for a word stranded under a remote context (`stranded`), under a context the config does not hold, and for the
 * retired word `readiness` (`RETIRED_VERB`), naming `nemia doctor` (`retiredVerb`). A former name is run as the name it became
 * (`objects`' `renamedIn`), its hint said on stderr.
 */
export async function main(typed: readonly string[], entry: Entry = 'nemia'): Promise<number> {
  const renamed = renamedIn(carryUnlocal(typed));
  const name = nameOf(renamed.words);
  const first = Object.entries(FIRST).find(([word]) => word === name)?.[1];
  if (first !== undefined) return first(renamed.words.slice(1));
  if (renamed.hint !== undefined) process.stderr.write(`${renamed.hint}\n`);
  return routed(renamed.words, name, entry);
}

/** `argv`, named `name`, sent the way its route says (`routeOf`), under the context in use. */
async function routed(argv: readonly string[], name: string, entry: Entry): Promise<number> {
  const chosen = chosenOf();
  const help = argv.includes('--help') || name === '';
  const local = unlocal(argv);
  const route = routeOf({ name, local, help, remote: chosen.kind === 'remote' });
  if (route === 'refused' && !local && chosen.kind === 'remote') throw stranded(argv, name, chosen.name);
  if (route === 'refused') throw localRefused(argv, chosen.kind === 'local');
  if (chosen.kind === 'refused' && !ofTheMachine(name)) throw unheld(chosen.name);
  if (route === 'process') return exportsAFactory(argv) ? templateExported(argv, entry) : spawned(argv, entry);
  if (entry === 'wf') process.stderr.write(`${WF_HINT}\n`);
  if (isMoved(name)) return commanded(name, argv.slice(name.split(' ').length));
  const verb = Object.entries(own(entry)).find(([word]) => word === name)?.[1];
  if (verb !== undefined) return verb(argv.slice(1));
  const read = Object.entries(READS).find(([verb]) => verb === name)?.[1];
  return read === undefined ? spawned(argv, entry) : read(argv.slice(1));
}
