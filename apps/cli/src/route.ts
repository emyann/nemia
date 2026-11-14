/**
 * Which way a command goes, pure (`contracts/route.contract.ts`): refused where `--local` is typed, which reads no store in process any
 * more; the api for a read of the client's (`READ_VERBS`), for the client's own verbs (`CLIENT_VERBS`, whatever else is typed) and for a
 * command whose words the client holds (`MOVED_COMMANDS`, its help included); the orchestrator's own CLI for a verb about this machine
 * (`MACHINE_VERBS`), a help of one, and, under this machine's context, a word no list holds, which that CLI refuses in its own words; and
 * refused, a word typed while the context names a remote daemon that the client does not answer and that is no verb of this machine:
 * nothing is forwarded, so no such word reaches this machine's store.
 * Each list is spelled once, in `verbs.ts` or `objects`, and read by the contract and the code: no file of `src` imports a value of a contract, which ships the
 * verifier (`tools/guards/test/no-contract-values.test.ts`).
 */
import { MACHINE_VERBS, MOVED_COMMANDS, type MovedCommand } from 'objects';
import type { RouteOf } from '../contracts/route.contract.ts';
import { CLIENT_VERBS, READ_VERBS } from './verbs.ts';

export type { Route, Routed } from '../contracts/route.contract.ts';
export { CLIENT_VERBS, type ClientVerb, READ_VERBS, type ReadVerb } from './verbs.ts';

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
