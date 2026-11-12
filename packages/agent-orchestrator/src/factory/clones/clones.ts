/**
 * What a factory's `--repo` names (`cloneTarget`): a directory of this machine, or a repository by its git URL, kept as a clone under
 * the store's `clones/` folder (`cloneFolder`), or neither. Pure: the clone itself is the place's (`clone`), and the sweep that keeps it
 * is `clones.verb.ts`'s. `contracts/clone-target.contract.ts` proves what a value is read as and what folder a URL is given.
 */
import path from 'node:path';
import { lowerHost } from './host.ts';
import type { CloneTarget, CloneTargetOf } from '../../../contracts/clone-target.contract.ts';

export type { CloneTarget } from '../../../contracts/clone-target.contract.ts';

/** The forms of a URL a clone is made of, said in a refusal. */
const FORMS = 'https://<host>/<path>, ssh://[<user>@]<host>/<path>, <user>@<host>:<path>, git://<host>/<path> or file:///<path>';

/** `text` without the one slash it opens with and the one it ends with: a second is an empty segment, refused. */
const trimmed = (text: string): string => {
  const opened = text.startsWith('/') ? text.slice(1) : text;
  return opened.endsWith('/') ? opened.slice(0, opened.length - 1) : opened;
};

/** Whether `given` opens with a scheme a clone is made over. */
const knownScheme = (given: string): boolean =>
  given.startsWith('https://') ||
  given.startsWith('http://') ||
  given.startsWith('ssh://') ||
  given.startsWith('git://') ||
  given.startsWith('file://');

/** Whether `folder` stays under `clones/`: a host and a path, no segment empty, `.` or `..`. */
const staysUnder = (folder: string): boolean => {
  const framed = `/${folder}/`;
  return (
    folder.includes('/') &&
    !folder.startsWith('/') &&
    !folder.endsWith('/') &&
    !framed.includes('//') &&
    !framed.includes('/./') &&
    !framed.includes('/../')
  );
};

/** Whether `folder` holds nothing a folder of the store does not take: a space, a `%`, a backslash, a colon or an `@`. */
const plain = (folder: string): boolean =>
  !folder.includes(' ') && !folder.includes('%') && !folder.includes('\\') && !folder.includes(':') && !folder.includes('@');

/** A host and a path made a clone's folder, `.git` taken off the path, or refused naming what to give instead. */
const folderOf = (given: string, host: string, rest: string): CloneTarget => {
  const bare = trimmed(rest);
  const named = bare.endsWith('.git') ? bare.slice(0, bare.length - 4) : bare;
  const folder = `${lowerHost(host)}/${trimmed(named)}`;
  if (host.length === 0 || !plain(folder) || !staysUnder(folder) || folder.endsWith('.git'))
    return {
      kind: 'refused',
      message: `--repo ${given} is read as a git URL, and it names no host and repository Nemia can keep a clone of: give one as ${FORMS}, or the path of a directory of this machine. Nothing was filed.`,
    };
  return { kind: 'url', folder };
};

/**
 * What `given`, a factory's `--repo`, names. A path, as git reads one (no colon, or a slash before the first), is a directory as
 * before. A URL is kept as a clone in the folder of its host and path, its user, port, scheme and `.git` dropped, so one repository
 * named two ways is one clone. Refused: a scheme a clone is not made over, a URL that carries a password (the machine holds the
 * credential, never Nemia), and one that names no plain host and path.
 */
export const cloneTarget: CloneTargetOf = (given) => {
  const colon = given.indexOf(':');
  const slash = given.indexOf('/');
  if (colon < 0 || (slash >= 0 && slash < colon)) return { kind: 'path' };
  const scheme = given.indexOf('://');
  if (scheme < 0) {
    const user = given.slice(0, colon);
    const at = user.indexOf('@');
    return folderOf(given, at < 0 ? user : user.slice(at).slice(1), given.slice(colon).slice(1));
  }
  if (!knownScheme(given))
    return {
      kind: 'refused',
      message: `--repo ${given} names a scheme Nemia does not clone over: give the repository as ${FORMS}. Nothing was filed.`,
    };
  const after = given.slice(scheme).slice(3);
  const cut = after.indexOf('/');
  const authority = cut < 0 ? after : after.slice(0, cut);
  const at = authority.indexOf('@');
  const hostPort = at < 0 ? authority : authority.slice(at).slice(1);
  if (at >= 0 && (authority.slice(0, at).includes(':') || hostPort.includes('@')))
    return {
      kind: 'refused',
      message: `--repo carries a password, and Nemia holds no credential: give the URL without it, and let this machine's git hold the credential (a credential helper for the host, or an SSH key). Nothing was filed.`,
    };
  const port = hostPort.indexOf(':');
  const host = port < 0 ? hostPort : hostPort.slice(0, port);
  const local = given.startsWith('file://') && host.length === 0 ? 'localhost' : host;
  return folderOf(given, local, cut < 0 ? '' : after.slice(cut));
};

/** The folder of the store `home` a clone whose folder is `folder` (`cloneTarget`) is kept in: `<home>/clones/<folder>`. */
export const cloneFolder = (home: string, folder: string): string => path.join(home, 'clones', folder);
