/**
 * Which way a command goes, pure: the api for a moved read (`READ_VERBS`) and for the client's own verbs (`CLIENT_VERBS`, whatever
 * else is typed), the orchestrator's own CLI for the rest and for a verb about this machine (`MACHINE_VERBS`), whatever context is in
 * use; forwarded, a verb about the store only the old path has, typed while the context names a remote daemon: that CLI spawned with
 * the context's server and token, calling the daemon's endpoints in place of its handlers (`contracts/route.contract.ts`). Each list
 * is spelled once, here, and read by the contract and the code: no file of `src` imports a value of a contract, which ships the
 * verifier (`tools/guards/test/no-contract-values.test.ts`).
 */
import type { RouteOf } from '../contracts/route.contract.ts';

/**
 * The reads this client asks the api for, which the orchestrator's CLI answers too: `readiness` among them, whose `fix` starts a fix on
 * the server the context names and follows it (`src/readiness.ts`).
 */
export const READ_VERBS = ['show', 'closeout', 'ls', 'inbox', 'watch', 'readiness'] as const;

/** A read this client asks the api for. */
export type ReadVerb = (typeof READ_VERBS)[number];

/** The verbs this client alone has, generic over every kind the api serves: no process answers them. */
export const CLIENT_VERBS = ['get', 'apply', 'explain', 'propose', 'proposals', 'decide'] as const;

/** One of `CLIENT_VERBS`. */
export type ClientVerb = (typeof CLIENT_VERBS)[number];

/**
 * The verbs about the machine this client runs on, never a remote daemon's (the distribution intent's Q6): its login service, its
 * releases, a daemon of its own, what it runs, the person's tokens of its store and its Claude token, and the verbs that read and write
 * files of this machine and no store (`template`, `frontmatter`, `admit`). Each runs on the old path, whatever context is in use.
 */
export const MACHINE_VERBS = [
  'service',
  'upgrade',
  'up',
  'tick',
  'version',
  'token',
  'claude-token',
  'template',
  'frontmatter',
  'admit',
] as const;

/** One of `MACHINE_VERBS`. */
export type MachineVerb = (typeof MACHINE_VERBS)[number];

/**
 * Where a command goes: the api, the orchestrator's CLI in a process of its own on this machine, or that CLI forwarded — a verb about
 * the store that only the old path has yet, typed while a context names a remote daemon: spawned with the context's server and token
 * (`forwardedEnv`, `src/context.ts`), it calls that daemon's endpoints and refuses in its own words a command none serves.
 */
export type Route = 'api' | 'process' | 'forwarded';

/**
 * A command as the route reads it: the name it opens with, whether `--local` was typed, whether it asks for its help, and whether the
 * context in use names a remote daemon (`remote`; false, this machine's store).
 */
export type Routed = { readonly name: string; readonly local: boolean; readonly help: boolean; readonly remote: boolean };

const clients: readonly string[] = CLIENT_VERBS;
const reads: readonly string[] = READ_VERBS;
const machines: readonly string[] = MACHINE_VERBS;

export const routeOf: RouteOf = ({ name, local, help, remote }) => {
  if (clients.includes(name)) return 'api';
  if (reads.includes(name)) return local || help ? 'process' : 'api';
  return remote && !help && !machines.includes(name) ? 'forwarded' : 'process';
};

/**
 * The name `argv` opens with as the route reads it: its first word. A moved read typed with words it does not read (`inbox add`, a command
 * of its own on the old path) hands them to the old path itself, before it asks the api anything.
 */
export const nameOf = (argv: readonly string[]): string => argv[0] ?? '';
