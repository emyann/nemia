/**
 * `clone`: a repository named by its URL made into a folder, with the machine's own credentials, none of them held here. Takes
 * `{ url, into }`, `into` an absolute path whose parent is made when it is not there; answers `{ repo, made }`: `into`, and whether it was
 * cloned now or found a repository already, nothing fetched then. The clone is made in a hidden folder beside `into` and renamed onto it
 * once whole, so `into` is either absent or a whole repository; git asks no one at a terminal for a credential (`GIT_TERMINAL_PROMPT=0`),
 * so a URL the machine cannot reach fails at once. Refuses a relative `into`, an `into` that holds something and no repository, and a
 * clone git will not make, in git's last words and the setup the URL's form needs, the hidden folder taken away and no password said.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { failedWords, gitSays, isDirectory, printed, refused, type Asking, type Reply } from '../git.ts';
import type { PlaceRequests } from '../../../src/place/place.ts';

/** Git asks no one at a terminal for a credential: one the machine does not hold fails the clone at once. */
const NO_PROMPT = { GIT_TERMINAL_PROMPT: '0' };

/** `text` with the password of each URL in it taken out: `scheme://user:secret@host` said as `scheme://user@host`. */
export const withoutPassword = (text: string): string => text.replace(/([a-z][a-z0-9+.-]*:\/\/[^/@\s:]*):[^/@\s]*@/gi, '$1@');

/** The host a URL names, scp-like `user@host:path` too; undefined where it names none. */
function hostOf(url: string): string | undefined {
  const scp = /^[^/:@\s]+@([^/:\s]+):/.exec(url);
  if (scp) return scp[1];
  try {
    return new URL(url).hostname || undefined;
  } catch {
    return undefined;
  }
}

/** What to set up on this machine so that git can clone `url`, by its form: ssh and scp-like, http(s), or anything else. */
export function setupFor(url: string): string {
  const host = hostOf(url) ?? 'its host';
  if (/^ssh:\/\//i.test(url) || /^[^/:@\s]+@[^/:\s]+:/.test(url))
    return `give this machine an SSH key that ${host} accepts, and add ${host}'s host key to ~/.ssh/known_hosts (ssh -T <user>@${host} once checks both), then ask again`;
  if (/^https?:\/\//i.test(url))
    return `set up a git credential helper for ${host} (git config --global credential.helper <helper>) that holds a credential it accepts, then ask again`;
  return `check that ${withoutPassword(url)} names a repository this machine can read, then ask again`;
}

/** Whether `dir` is the top of a repository of its own, and not a folder inside another one. */
function* isRepository(dir: string): Asking<boolean> {
  const top = yield* gitSays(dir, ['rev-parse', '--path-format=absolute', '--show-toplevel']);
  return top !== undefined && top === fs.realpathSync(dir);
}

/** The verb's body. */
export function* clone({ url, into }: PlaceRequests['clone']): Asking<Reply<'clone'>> {
  if (!path.isAbsolute(into)) return refused(`${into} is not an absolute path: name the folder to clone into from the root`);
  const there = fs.statSync(into, { throwIfNoEntry: false });
  if (there?.isDirectory() && (yield* isRepository(into))) return { repo: into, made: false };
  if (there && !(isDirectory(into) && fs.readdirSync(into).length === 0))
    return refused(`${into} holds something that is no repository, so nothing is cloned over it: move it away, or clone somewhere else`);
  const parent = path.dirname(into);
  fs.mkdirSync(parent, { recursive: true });
  const hidden = path.join(parent, `.${path.basename(into)}.clone-${randomUUID().slice(0, 8)}`);
  try {
    yield* printed({ cmd: 'git', cwd: parent, args: ['clone', '--quiet', '--', url, hidden], env: NO_PROMPT });
    fs.renameSync(hidden, into);
  } catch (err) {
    fs.rmSync(hidden, { recursive: true, force: true });
    return refused(withoutPassword(`${url} could not be cloned into ${into}: ${failedWords(err)} — to clone it, ${setupFor(url)}`));
  }
  return { repo: into, made: true };
}
