/**
 * The one store fact this client reads: where the daemon serving the store listens, the `url` its lease holds (`$WF_ROOT/daemon.json`,
 * written by the api once it listens). It reads no other file of the store: what it shows comes from the api. Read only where the context
 * in use is this machine's (`context.ts`): under a remote one, or one the config does not hold, this machine may have no store at all,
 * and the old path is forwarded with the store's variable dropped (`forwardedEnv`), here since this file alone spells it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { type Chosen, chosenOf } from './context.ts';

/** The lease's name under the store: what the daemon writes, and what a line about it names. */
export const LEASE_FILE = 'daemon.json';

/** The store's folder: `WF_ROOT`, else `~/.agent-workflows`, as the orchestrator reads it. */
export const storeRoot = (env: NodeJS.ProcessEnv = process.env): string =>
  env.WF_ROOT !== undefined && env.WF_ROOT !== '' ? env.WF_ROOT : path.join(os.homedir(), '.agent-workflows');

/**
 * The variables a forwarded CLI reads (`FORWARD_VARIABLES` of `agent-orchestrator`, which this client imports nothing of in its source,
 * so they are spelled here, once): the daemon's address and the person's token for it.
 */
export const FORWARD_VARIABLES = ['NEMIA_SERVER', 'NEMIA_SERVER_TOKEN'] as const;

/**
 * The environment the old path is forwarded with under the remote context `chosen`: `env` with the context's server in `NEMIA_SERVER`
 * and its token in `NEMIA_SERVER_TOKEN`, never on the command line, where `ps` would show it; and without `WF_ROOT`, since what the
 * forwarded CLI asks is the daemon's store, never one of this machine's.
 */
export function forwardedEnv(chosen: Extract<Chosen, { kind: 'remote' }>, env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const [server, token] = FORWARD_VARIABLES;
  const { WF_ROOT: _root, ...rest } = env;
  return { ...rest, [server]: chosen.server, [token]: chosen.token };
}

/**
 * The url the store's lease names, or none: no lease, a lease a `nemia up` holds, or one not yet listening; and none where the context
 * in use is not this machine's, whose store is then never read.
 */
export function servedAt(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (chosenOf(env).kind !== 'local') return undefined;
  let text: string;
  try {
    text = fs.readFileSync(path.join(storeRoot(env), LEASE_FILE), 'utf8');
  } catch {
    return undefined;
  }
  try {
    const lease: unknown = JSON.parse(text);
    if (typeof lease !== 'object' || lease === null || !('url' in lease)) return undefined;
    return typeof lease.url === 'string' && lease.url !== '' ? lease.url : undefined;
  } catch {
    return undefined;
  }
}
