/**
 * Whether this client and the daemon it asks are of one release (the api-consumer intent's Q9): the client's release is the `tag` of
 * the `release.json` at its install's root, read once (`clientRelease`), null for a checkout; the daemon's is the one its `GET
 * /api/health` answers (`Health.release`). `releaseMet` decides (`contracts/release.contract.ts`); `served` (`daemon.ts`) refuses a
 * release that `differs`, naming `nemia version` on both machines.
 *
 * The install's root is found as the orchestrator finds the code it runs (`runningRelease`), never by importing it: the first folder
 * above this file whose `package.json` names the daemon (`"nemia": { "daemon": … }`), an install where a `release.json` sits there.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ReleaseMet } from '../contracts/release.contract.ts';

export const releaseMet: ReleaseMet = (client, daemon) => {
  if (client === null || daemon === null) return 'unsaid';
  return client === daemon ? 'met' : 'differs';
};

/** The JSON of `file`, or undefined where it is not there or does not read. */
const jsonOf = (file: string): unknown => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
};

/** Whether `dir`'s `package.json` names the daemon: the root of a checkout or an install. */
const namesTheDaemon = (dir: string): boolean => {
  const read = jsonOf(path.join(dir, 'package.json'));
  if (typeof read !== 'object' || read === null || !('nemia' in read)) return false;
  const { nemia } = read;
  return typeof nemia === 'object' && nemia !== null && 'daemon' in nemia && typeof nemia.daemon === 'string';
};

/**
 * The release of the code at or above `from`: the `tag` of the `release.json` at the first folder whose `package.json` names the
 * daemon; null where that folder has none (a checkout), where its `tag` is not a word, or where no folder names the daemon.
 */
export function releaseAt(from: string): string | null {
  let at: string;
  try {
    at = fs.realpathSync(from);
  } catch {
    return null;
  }
  for (;;) {
    if (namesTheDaemon(at)) {
      const file = jsonOf(path.join(at, 'release.json'));
      if (typeof file !== 'object' || file === null || !('tag' in file)) return null;
      return typeof file.tag === 'string' && file.tag !== '' ? file.tag : null;
    }
    const up = path.dirname(at);
    if (up === at) return null;
    at = up;
  }
}

let mine: string | null | undefined;

/** This client's own release, read once from its install's `release.json` (`releaseAt`); null for a checkout. */
export const clientRelease = (): string | null => (mine === undefined ? (mine = releaseAt(import.meta.dirname)) : mine);
