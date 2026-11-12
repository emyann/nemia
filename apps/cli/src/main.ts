/**
 * `nemia`, a client of the api: a moved read asks the api serving the store the context in use names (`context.ts`) over HTTP; the
 * client's own verbs (`CLIENT_VERBS`: `get`, `apply`, `explain`, `propose`, `proposals`, `decide`) ask it whatever else is typed, each
 * saying its own help; a command whose words the client holds (`MOVED_COMMANDS`) is parsed, helped and run here (`commands/commanded.ts`);
 * every other verb and a help of one run on the orchestrator's own CLI, spawned with the same words (`local.ts`), so the writes it has
 * not moved keep their path exactly. `--local` is refused, exit 2, naming the command typed without it. Under a remote context a verb about
 * the store only that path has is forwarded: that CLI spawned with the context's server and token (`forwardedEnv`), calling the daemon's
 * endpoints; a verb about this machine (`MACHINE_VERBS`) still runs here, and `nemia config` reads and writes the contexts themselves,
 * and `nemia pair <url>` writes one a pairing minted the token of (`pair.ts`), whatever context is in use.
 */
import { CONFIG_VERB, chosenOf, config, factoryNotHere, unheld } from './context.ts';
import { doctor, RETIRED_VERB, retiredVerb } from './doctor.ts';
import { type Entry, spawned, unlocal } from './local.ts';
import { PAIR_VERB, pair } from './pair.ts';
import { type ClientVerb, MACHINE_VERBS, MOVED_COMMANDS, type MovedName, nameOf, type ReadVerb, routeOf } from './route.ts';
import { renamedIn } from 'objects';
import { Refused } from './refused.ts';
import { commanded } from './commands/commanded.ts';
import { forwardedEnv } from './where.ts';
import { apply } from './objects/apply.ts';
import { decide } from './objects/decide.ts';
import { explain } from './objects/explain.ts';
import { get } from './objects/get.ts';
import { propose, proposals } from './objects/propose.ts';
import { closeout } from './reads/closeout.ts';
import { inbox } from './reads/inbox.ts';
import { ls } from './reads/ls.ts';
import { show } from './reads/show.ts';
import { watch } from './watch/watch.ts';

/** What the `wf` alias says first, on stderr, the same words the orchestrator's alias says. */
export const WF_HINT = 'wf is now nemia: type `nemia <args>`; wf stays an alias until a later release removes it.';

/** Each moved read's runner, on the words after its name: it prints, and answers its exit code. */
const READS: Readonly<Record<ReadVerb, (args: readonly string[]) => Promise<number>>> = {
  show,
  closeout,
  ls,
  inbox,
  watch,
  doctor,
};

/** Each of the client's own verbs' runner, on the words after its name. */
const own = (entry: Entry): Readonly<Record<ClientVerb, (args: readonly string[]) => Promise<number>>> => ({
  get,
  apply,
  explain,
  propose,
  proposals,
  decide: (args) => decide(args, (argv) => main(argv, entry)),
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
 * Whether `words` are a `nemia template export` that holds a factory's parts (`--factory`), which it reads from the store in process: a
 * machine verb in all its other forms.
 */
const exportsAFactory = (words: readonly string[]): boolean =>
  words[0] === 'template' && words[1] === 'export' && words.some((word) => word === '--factory' || word.startsWith('--factory='));

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
 * Runs `argv` and answers the exit code: on the api for a moved read, a verb of the client's own and a command whose words it holds,
 * else on the old path under `entry`, forwarded to the daemon a remote context names for a verb about the store only that path has;
 * refused, exit 2, where `--local` is typed (`localRefused`), under a context the config does not hold, for a `template export
 * --factory` under a remote one, which would read this machine's store (`factoryNotHere`), and for the retired word `readiness`
 * (`RETIRED_VERB`), naming `nemia doctor` (`retiredVerb`). A former name is run as the name it became (`objects`' `renamedIn`), its hint
 * said on stderr.
 */
export async function main(typed: readonly string[], entry: Entry = 'nemia'): Promise<number> {
  const renamed = renamedIn(typed);
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
  const route = routeOf({ name, local: unlocal(argv), help, remote: chosen.kind === 'remote' });
  if (route === 'refused') throw localRefused(argv, chosen.kind === 'local');
  if (chosen.kind === 'refused' && !ofTheMachine(name)) throw unheld(chosen.name);
  if (chosen.kind === 'remote' && !help && exportsAFactory(argv)) throw factoryNotHere(chosen.name);
  if (route === 'forwarded' && chosen.kind === 'remote') return spawned(argv, entry, forwardedEnv(chosen));
  if (route === 'process') return spawned(argv, entry);
  if (entry === 'wf') process.stderr.write(`${WF_HINT}\n`);
  if (isMoved(name)) return commanded(name, argv.slice(name.split(' ').length));
  const verb = Object.entries(own(entry)).find(([word]) => word === name)?.[1];
  if (verb !== undefined) return verb(argv.slice(1));
  const read = Object.entries(READS).find(([verb]) => verb === name)?.[1];
  return read === undefined ? spawned(argv, entry) : read(argv.slice(1));
}
