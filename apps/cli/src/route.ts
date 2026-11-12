/**
 * Which way a command goes, pure: refused where `--local` is typed, which reads no store in process any more; the api for a moved read
 * (`READ_VERBS`), for the client's own verbs (`CLIENT_VERBS`, whatever else is typed) and for a command whose words the client holds
 * (`MOVED_COMMANDS`, its help included), the orchestrator's own CLI for the rest and for a verb about this machine (`MACHINE_VERBS`),
 * whatever context is in use; forwarded, a verb about the store only the old path has, typed while the context names a remote daemon: that
 * CLI spawned with the context's server and token, calling the daemon's endpoints in place of its handlers (`contracts/route.contract.ts`).
 * Each list is spelled once, here, and read by the contract and the code: no file of `src` imports a value of a contract, which ships the
 * verifier (`tools/guards/test/no-contract-values.test.ts`).
 */
import { MACHINE_VERBS, MOVED_COMMANDS, type MovedCommand } from 'objects';
import type { RouteOf } from '../contracts/route.contract.ts';

/**
 * The reads this client asks the api for, which the orchestrator's CLI answers too: `doctor` among them, whose `fix` starts a fix on
 * the server the context names and follows it (`src/doctor.ts`).
 */
export const READ_VERBS = ['show', 'closeout', 'ls', 'inbox', 'watch', 'doctor'] as const;

/** A read this client asks the api for. */
export type ReadVerb = (typeof READ_VERBS)[number];

/** The verbs this client alone has, generic over every kind the api serves: no process answers them. */
export const CLIENT_VERBS = ['get', 'apply', 'explain', 'propose', 'proposals', 'decide'] as const;

/** One of `CLIENT_VERBS`. */
export type ClientVerb = (typeof CLIENT_VERBS)[number];

/**
 * The verbs about the machine this client runs on, never a remote daemon's (`objects`' `MACHINE_VERBS`, where the orchestrator's guard
 * reads them too), and the commands whose words this client holds (`objects`' `MOVED_COMMANDS`, the names of its `COMMAND_WORDS`): each
 * of those parsed, helped, run and printed here through the api, under every context. Said here for the contract and the code to read.
 */
export { MACHINE_VERBS, MOVED_COMMANDS };

/** One of `MACHINE_VERBS`. */
export type MachineVerb = (typeof MACHINE_VERBS)[number];

/** One of `MOVED_COMMANDS`. */
export type MovedName = MovedCommand;

/**
 * Where a command goes: refused (`--local`, which names what to type instead), the api, the orchestrator's CLI in a process of its own on
 * this machine, or that CLI forwarded — a verb about
 * the store that only the old path has yet, typed while a context names a remote daemon: spawned with the context's server and token
 * (`forwardedEnv`, `src/context.ts`), it calls that daemon's endpoints and refuses in its own words a command none serves.
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
  return remote && !help && !machines.includes(name) ? 'forwarded' : 'process';
};

/**
 * The name `argv` opens with as the route reads it: the longest of `MOVED_COMMANDS` its words open with (`workflows write`), else its
 * first word. A moved read typed with words it does not read (`inbox add`, a command of its own on the old path) hands them to the old
 * path itself, before it asks the api anything.
 */
export const nameOf = (argv: readonly string[]): string => {
  const opens = moved.filter((name) => {
    const words = name.split(' ');
    return words.every((word, at) => argv[at] === word);
  });
  return opens.reduce((longest, name) => (name.split(' ').length > longest.split(' ').length ? name : longest), argv[0] ?? '');
};
