/**
 * What a factory's `--repo` names (`cloneTarget`): a directory of this machine, or a repository by its git URL, kept as a clone under
 * the store's `clones/` folder (`cloneFolder`), or neither. Pure: the clone itself is the place's (`clone`), and the sweep that keeps it
 * is `clones.verb.ts`'s. `contracts/clone-target.contract.ts` proves what a value is read as and what folder a URL is given.
 */
import path from 'node:path';
import type { CloneTargetOf } from '../../../contracts/clone-target.contract.ts';
import { joinedFolder } from './clone-folder.ts';

export { joinedFolder } from './clone-folder.ts';

export type { CloneTarget } from '../../../contracts/clone-target.contract.ts';

/** The forms of a URL a clone is made of, said in a refusal. */
const FORMS = 'https://<host>/<path>, ssh://[<user>@]<host>/<path>, <user>@<host>:<path>, git://<host>/<path> or file:///<path>';

/** Whether git reads `given` as a local path: no colon, or a slash before the first colon. */
const isPath = (given: string): boolean => {
  const colon = given.indexOf(':');
  const slash = given.indexOf('/');
  return colon < 0 || (slash >= 0 && slash < colon);
};

/** Whether `given` opens with a scheme a clone is made over. */
const knownScheme = (given: string): boolean =>
  given.startsWith('https://') ||
  given.startsWith('http://') ||
  given.startsWith('ssh://') ||
  given.startsWith('git://') ||
  given.startsWith('file://');

/** What follows the scheme form's `://`. */
const afterScheme = (given: string): string => given.slice(given.indexOf('://')).slice(3);

/** The scheme form's authority: what lies between `://` and the next slash. */
const authorityOf = (given: string): string => {
  const rest = afterScheme(given);
  const slash = rest.indexOf('/');
  return slash < 0 ? rest : rest.slice(0, slash);
};

/** Whether the scheme form carries a password: an `@` after the authority's first colon, which is a colon in a user part. */
const holdsPassword = (given: string): boolean => {
  const authority = authorityOf(given);
  const colon = authority.indexOf(':');
  return colon >= 0 && authority.slice(colon).includes('@');
};

/** `text` after its first `@`, or all of it where it has none. */
const afterAt = (text: string): string => {
  const at = text.indexOf('@');
  return at < 0 ? text : text.slice(at).slice(1);
};

/** The host a URL names: the scheme form's, its user and port dropped (`localhost` for a file URL naming none), or the scp-like form's. */
const hostOf = (given: string): string => {
  if (!given.includes('://')) return afterAt(given.slice(0, given.indexOf(':')));
  const hostPort = afterAt(authorityOf(given));
  const port = hostPort.indexOf(':');
  const host = port < 0 ? hostPort : hostPort.slice(0, port);
  return host.length === 0 && given.startsWith('file://') ? 'localhost' : host;
};

/** The path a URL names, as written: after the scheme form's authority, or after the scp-like form's colon. */
const pathOf = (given: string): string => {
  if (!given.includes('://')) return given.slice(given.indexOf(':')).slice(1);
  const rest = afterScheme(given);
  const slash = rest.indexOf('/');
  return slash < 0 ? '' : rest.slice(slash);
};

/** `text` without one slash it opens with, one it ends with, then a `.git` it ends with. */
const named = (text: string): string => {
  const opened = text.startsWith('/') ? text.slice(1) : text;
  const ended = opened.endsWith('/') ? opened.slice(0, opened.length - 1) : opened;
  return ended.endsWith('.git') ? ended.slice(0, ended.length - 4) : ended;
};

/** Whether a clone's folder stays under `clones/`: relative, a host and a path at least, no segment empty, `.` or `..`. */
const staysUnder = (folder: string): boolean =>
  folder.includes('/') &&
  !folder.startsWith('/') &&
  !folder.endsWith('/') &&
  !folder.includes('//') &&
  !folder.startsWith('./') &&
  !folder.startsWith('../') &&
  !folder.endsWith('/.') &&
  !folder.endsWith('/..') &&
  !folder.includes('/./') &&
  !folder.includes('/../');

/** Whether `text` holds none of what a folder of a clone may not: a space, a `%`, a backslash, a colon or an `@`. */
const plain = (text: string): boolean =>
  !text.includes(' ') && !text.includes('%') && !text.includes('\\') && !text.includes(':') && !text.includes('@');

/**
 * What `given`, a factory's `--repo`, names. A path, as git reads one, is a directory as before. A URL is kept as a clone in the folder
 * of its host and path, its user, port, scheme and `.git` dropped, so one repository named two ways is one clone. Refused: a URL that
 * carries a password (the machine holds the credential, never Nemia), a scheme a clone is not made over, and a URL that names no plain
 * host and path.
 */
export const cloneTarget: CloneTargetOf = (given) => {
  if (isPath(given)) return { kind: 'path' };
  if (holdsPassword(given))
    return {
      kind: 'refused',
      message: `--repo carries a password, and Nemia holds no credential: give the URL without it, and let the git of the machine Nemia's daemon runs on hold the credential (a credential helper for the host, or an SSH key). Nothing was filed.`,
    };
  if (given.includes('://') && !knownScheme(given))
    return {
      kind: 'refused',
      message: `--repo ${given} names a scheme Nemia does not clone over: give the repository as ${FORMS}. Nothing was filed.`,
    };
  const folder = joinedFolder(hostOf(given), named(pathOf(given)));
  if (staysUnder(folder) && plain(folder) && !folder.endsWith('.git')) return { kind: 'url', folder };
  return {
    kind: 'refused',
    message: `--repo ${given} is read as a git URL, and it names no host and repository Nemia can keep a clone of: give one as ${FORMS}, or the path of a directory of the machine Nemia's daemon runs on. Nothing was filed.`,
  };
};

/**
 * The folder of the store `home` a clone whose folder is `folder` (`cloneTarget`) is kept in: `<home>/clones/<folder>`, its host
 * lower-cased, as hosts are matched, so one host written in two cases is one clone.
 */
export const cloneFolder = (home: string, folder: string): string => {
  const slash = folder.indexOf('/');
  return path.join(home, 'clones', folder.slice(0, slash).toLowerCase() + folder.slice(slash));
};

/**
 * Whether `repo` is a clone the store `home` keeps: a folder strictly inside `<home>/clones`, where `cloneFolder` alone puts one. Read by
 * the path as given, resolved, never through a link.
 */
export const isCloneFolder = (home: string, repo: string): boolean => {
  const rel = path.relative(path.join(home, 'clones'), path.resolve(repo));
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
};
