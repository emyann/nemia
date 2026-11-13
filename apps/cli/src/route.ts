/**
 * Which way a command goes, pure (`contracts/route.contract.ts`): refused where `--local` is typed, which reads no store in process any
 * more; the api for a read of the client's (`READ_VERBS`), for the client's own verbs (`CLIENT_VERBS`, whatever else is typed) and for a
 * command whose words the client holds (`MOVED_COMMANDS`, its help included); the orchestrator's own CLI for a verb about this machine
 * (`MACHINE_VERBS`), a help of one, and, under this machine's context, a word no list holds, which that CLI refuses in its own words; and
 * refused, a word typed while the context names a remote daemon that the client does not answer and that is no verb of this machine:
 * nothing is forwarded, so no such word reaches this machine's store.
 * Each list is spelled once, here, and read by the contract and the code: no file of `src` imports a value of a contract, which ships the
 * verifier (`tools/guards/test/no-contract-values.test.ts`).
 */
import { MACHINE_VERBS, MOVED_COMMANDS, type MovedCommand } from 'objects';
import type { RouteOf } from '../contracts/route.contract.ts';

/**
 * The reads this client asks the api for whose help the orchestrator's CLI still holds: `doctor`, whose `fix` starts a fix on the server
 * the context names and follows it (`src/doctor.ts`), and `daemon`, where the store's daemon stands (`src/reads/daemon.ts`), which that CLI
 * keeps as the starter this client spawns on demand. The other reads' words are the client's (`MOVED_COMMANDS`).
 */
export const READ_VERBS = ['doctor', 'daemon'] as const;

/** A read this client asks the api for. */
export type ReadVerb = (typeof READ_VERBS)[number];

/**
 * The verbs this client alone has, generic over every kind the api serves, `channel`, the feed pushed into a Claude Code session
 * (`src/watch/channel.ts`), and `server`, the daemon a context names asked about itself through its api (`nemia server upgrade`,
 * `src/server/upgrade.ts`), never `service`, this machine's login unit, which is a machine verb: no process answers them.
 */
export const CLIENT_VERBS = ['get', 'apply', 'explain', 'propose', 'proposals', 'decide', 'channel', 'server'] as const;

/** One of `CLIENT_VERBS`. */
export type ClientVerb = (typeof CLIENT_VERBS)[number];

/**
 * The verbs about the machine this client runs on, never a remote daemon's (`objects`' `MACHINE_VERBS`, where the orchestrator's guard
 * reads them too), and the commands whose words this client holds (`objects`' `MOVED_COMMANDS`, the names of its `COMMAND_WORDS`): each
 * of those parsed, helped, run and printed here through the api, under every context. `upgrade` upgrades this machine's install
 * under a remote context too: the server a context names is upgraded by `nemia server upgrade`, one of `CLIENT_VERBS`. Said here for the
 * contract and the code to read.
 */
export { MACHINE_VERBS, MOVED_COMMANDS };

/** One of `MACHINE_VERBS`. */
export type MachineVerb = (typeof MACHINE_VERBS)[number];

/** One of `MOVED_COMMANDS`. */
export type MovedName = MovedCommand;

/**
 * Where a command goes: the api, the orchestrator's CLI in a process of its own on this machine, or refused — `--local`, and a word
 * stranded under a remote context, each naming what to type instead. `forwarded`, the old path spawned against another machine's api,
 * is retired and never answered: it stays a word of the type only for the contract's law that holds it so (`nothingIsForwarded`,
 * `contracts/route.contract.ts`).
 */
export type Route = 'api' | 'process' | 'forwarded' | 'refused';

/**
 * A command as the route reads it: the name it opens with, whether `--local` was typed, whether it asks for its help, and whether the
 * context in use names a remote daemon (`remote`; false, this machine's store).
 */
export type Routed = { readonly name: string; readonly local: boolean; readonly help: boolean; readonly remote: boolean };

const clients: readonly string[] = CLIENT_VERBS;
const reads: readonly string[] = READ_VERBS;
const machines: readonly string[] = MACHINE_VERBS;

const moved: readonly string[] = MOVED_COMMANDS;

export const routeOf: RouteOf = ({ name, local, help, remote }) => {
  if (local) return 'refused';
  if (clients.includes(name) || moved.includes(name)) return 'api';
  if (reads.includes(name)) return help ? 'process' : 'api';
  return remote && !help && !machines.includes(name) ? 'refused' : 'process';
};

/**
 * The name `argv` opens with as the route reads it: the longest of `MOVED_COMMANDS` its words open with (`inbox add` over `inbox`), else
 * its first word. A word a command does not take is refused by its own words, before the api is asked anything.
 */
export const nameOf = (argv: readonly string[]): string => {
  const opens = moved.filter((name) => {
    const words = name.split(' ');
    return words.every((word, at) => argv[at] === word);
  });
  return opens.reduce((longest, name) => (name.split(' ').length > longest.split(' ').length ? name : longest), argv[0] ?? '');
};
