/**
 * Whether this client and the daemon it asks are of one release (the api-consumer intent's Q9): the client's release is the `tag` of
 * the `release.json` at its install's root, read once (`clientRelease`), null for a checkout; the daemon's is the one its `GET
 * /api/health` answers (`Health.release`). `releaseMet` decides (`contracts/release.contract.ts`); `served` (`daemon.ts`) refuses a
 * release that `differs`, naming `nemia version` on both machines.
 *
 * The install's root is found as the orchestrator finds the code it runs (`runningRelease`), never by importing it: the first folder
 * above this file whose `package.json` names the daemon (`"nemia": { "daemon": … }`), an install where a `release.json` sits there.
 */
import { Option, Schema } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import type { ReleaseMet } from '../contracts/release.contract.ts';

/**
 * Whether this client's release and the daemon's are one: `unsaid` where either says none, else `met` or `differs`.
 * @param client This client's release, null for a checkout.
 * @param daemon The release the daemon's health says, null where it says none.
 */
export const releaseMet: ReleaseMet = (client, daemon) => {
  if (client === null || daemon === null) return 'unsaid';
  return client === daemon ? 'met' : 'differs';
};

/** The text of `file`, or undefined where it is not there or does not read. */
const textOf = (file: string): string | undefined => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
};

/** A `package.json` that names the daemon, `nemia.daemon`. */
const NamesDaemon = Schema.fromJsonString(Schema.Struct({ nemia: Schema.Struct({ daemon: Schema.String }) }));

/** A `release.json`'s tag. */
const ReleaseFile = Schema.fromJsonString(Schema.Struct({ tag: Schema.String }));

/** Whether `dir`'s `package.json` names the daemon: the root of a checkout or an install. */
const namesTheDaemon = (dir: string): boolean => {
  const text = textOf(path.join(dir, 'package.json'));
  return text !== undefined && Option.isSome(Schema.decodeUnknownOption(NamesDaemon)(text));
};

/**
 * The release of the code at or above `from`: the `tag` of the `release.json` at the first folder whose `package.json` names the
 * daemon; null where that folder has none (a checkout), where its `tag` is not a word, or where no folder names the daemon.
 * @param from The folder the search starts at, and goes up from.
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
      const text = textOf(path.join(at, 'release.json'));
      const tag = text === undefined ? undefined : Option.getOrUndefined(Schema.decodeUnknownOption(ReleaseFile)(text))?.tag;
      return tag !== undefined && tag !== '' ? tag : null;
    }
    const up = path.dirname(at);
    if (up === at) return null;
    at = up;
  }
}

let mine: string | null | undefined;

/** This client's own release, read once from its install's `release.json` (`releaseAt`); null for a checkout. */
export const clientRelease = (): string | null => (mine === undefined ? (mine = releaseAt(import.meta.dirname)) : mine);
