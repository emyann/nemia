/**
 * The two store facts this client reads: where the daemon serving the store listens, the `url` its lease holds (`$WF_ROOT/daemon.json`,
 * written by the api once it listens), and the person's credential the daemon keeps for this machine (`$WF_ROOT/credential`, written
 * 0600 at the daemon's start), the token the person's `nemia` presents here with nothing typed. It reads no other file of the store: what
 * it shows comes from the api. Read only where the context in use is this machine's (`context.ts`): under a remote one, or one the
 * config does not hold, this machine may have no store at all.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chosenOf } from './context.ts';

/** The lease's name under the store: what the daemon writes, and what a line about it names. */
export const LEASE_FILE = 'daemon.json';

/** The credential's name under the store: what the daemon writes at its start, as the orchestrator names it. */
export const CREDENTIAL_FILE = 'credential';

/** The store's folder: `WF_ROOT`, else `~/.agent-workflows`, as the orchestrator reads it. */
export const storeRoot = (env: NodeJS.ProcessEnv = process.env): string =>
  env.WF_ROOT !== undefined && env.WF_ROOT !== '' ? env.WF_ROOT : path.join(os.homedir(), '.agent-workflows');

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

/**
 * The person's credential the store keeps for this machine (`CREDENTIAL_FILE`), trimmed, or none: no file, an empty one, one this user
 * may not read, or a context in use that is not this machine's, whose store is then never read.
 */
export function storeCredential(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (chosenOf(env).kind !== 'local') return undefined;
  try {
    const token = fs.readFileSync(path.join(storeRoot(env), CREDENTIAL_FILE), 'utf8').trim();
    return token === '' ? undefined : token;
  } catch {
    return undefined;
  }
}
