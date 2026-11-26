/**
 * The two store facts this client reads: where the daemon serving the store listens, the `url` its lease holds (`$WF_ROOT/daemon.json`,
 * written by the api once it listens), and the person's credential the daemon keeps for this machine (`$WF_ROOT/credential`, written
 * 0600 at the daemon's start), the token the person's `nemia` presents here with nothing typed. It reads no other file of the store: what
 * it shows comes from the api. Read only where the context in use is this machine's (`context.ts`): under a remote one, or one the
 * config does not hold, this machine may have no store at all.
 */
import { Option, Schema } from 'effect';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chosenOf } from './context.ts';

/** The lease's name under the store: what the daemon writes, and what a line about it names. */
const LEASE_FILE = 'daemon.json';

/** The credential's name under the store: what the daemon writes at its start, as the orchestrator names it. */
const CREDENTIAL_FILE = 'credential';

/**
 * The store's folder: `WF_ROOT`, else `~/.agent-workflows`, as the orchestrator reads it.
 * @param env The environment read for `WF_ROOT`.
 */
export const storeRoot = (env: NodeJS.ProcessEnv = process.env) =>
  env.WF_ROOT !== undefined && env.WF_ROOT !== '' ? env.WF_ROOT : path.join(os.homedir(), '.agent-workflows');

/**
 * The url the store's lease names, or none: no lease, a lease a `nemia up` holds, or one not yet listening; and none where the context
 * in use is not this machine's, whose store is then never read.
 * @param env The environment read for the context in use and `WF_ROOT`.
 */
export function servedAt(env: NodeJS.ProcessEnv = process.env) {
  if (chosenOf(env).kind !== 'local') return undefined;
  let text: string;
  try {
    text = fs.readFileSync(path.join(storeRoot(env), LEASE_FILE), 'utf8');
  } catch {
    return undefined;
  }
  const url = Option.getOrUndefined(leaseIn(text))?.url;
  return url === '' ? undefined : url;
}

/** A daemon's lease, as `servedAt` reads it: the url it serves at. */
const leaseIn = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Struct({ url: Schema.String })));

/**
 * The person's credential the store keeps for this machine (`CREDENTIAL_FILE`), trimmed, or none: no file, an empty one, one this user
 * may not read, or a context in use that is not this machine's, whose store is then never read.
 * @param env The environment read for the context in use and `WF_ROOT`.
 */
export function storeCredential(env: NodeJS.ProcessEnv = process.env) {
  if (chosenOf(env).kind !== 'local') return undefined;
  try {
    const token = fs.readFileSync(path.join(storeRoot(env), CREDENTIAL_FILE), 'utf8').trim();
    return token === '' ? undefined : token;
  } catch {
    return undefined;
  }
}
