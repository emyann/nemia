/**
 * Which way a command goes, pure: the api for a moved read (`READ_VERBS`) and for the client's own verbs (`CLIENT_VERBS`, whatever
 * else is typed), the orchestrator's own CLI for the rest (`contracts/route.contract.ts`). Each list is spelled once, in the contract,
 * and read here.
 */
import { CLIENT_VERBS, READ_VERBS, type RouteOf } from '../contracts/route.contract.ts';

export { CLIENT_VERBS, type ClientVerb, READ_VERBS, type ReadVerb, type Route, type Routed } from '../contracts/route.contract.ts';

const clients: readonly string[] = CLIENT_VERBS;
const reads: readonly string[] = READ_VERBS;

export const routeOf: RouteOf = ({ name, local, help }) =>
  clients.includes(name) ? 'api' : !local && !help && reads.includes(name) ? 'api' : 'process';

/**
 * The name `argv` opens with as the route reads it: its first word. A moved read typed with words it does not read (`inbox add`, a command
 * of its own on the old path) hands them to the old path itself, before it asks the api anything.
 */
export const nameOf = (argv: readonly string[]): string => argv[0] ?? '';
