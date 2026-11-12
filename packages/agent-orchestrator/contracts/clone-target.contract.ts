/**
 * What a factory's `--repo` names (agent-orchestrator, src/factory/clones/clones.ts): a directory of this machine, as before
 * (`path`), a repository by its git URL, kept as a clone under `$WF_ROOT/clones/<folder>` (`url`), or neither (`refused`, its words
 * naming the fix).
 *
 * A value is a path exactly as git reads one: it holds no colon, or a slash comes before its first colon (git-clone(1), *GIT URLS*:
 * the scp-like syntax "is only recognized if there are no slashes before the first colon"). Anything else is a URL: the scheme form
 * `<scheme>://[<user>@]<host>[:<port>]/<path>`, its scheme one of https, http, ssh, git or file, or the scp-like form
 * `[<user>@]<host>:<path>`. Its folder is the host as written (`localhost` for a file URL, which names none; `cloneFolder` lower-cases
 * it, which the verifier does not read), then the path, with a leading and a trailing slash and a trailing `.git` taken off: the user,
 * the port and the scheme name no folder, so one repository named over ssh and over https is one clone. Nemia holds no credential: a
 * URL that carries a password is refused.
 * Refused besides: another scheme, a host left empty, and a path that is empty or would climb or step aside (`.` or `..` or an empty
 * segment), or that holds a space, a `%`, a backslash, a colon or an `@`.
 *
 * What a URL in plain words is cloned as — `https://<host>/<path>` and `git@<host>:<path>` each under its host — is held by the table of
 * `src/factory/clones/clones.test.ts`, not by a law here: as laws they ran the solver out of work at twice its default.
 */
import { assume, type Implementation, spec } from '@emyann/tsverify';
import { joinedFolder } from '../src/factory/clones/clones.ts';

/** What a `--repo` value names, which `src/factory/clones/clones.ts` re-exports. */
export type CloneTarget =
  | { readonly kind: 'path' }
  | { readonly kind: 'url'; readonly folder: string }
  | { readonly kind: 'refused'; readonly message: string };

/**
 * The join of a clone's host and path, read as one value: every law about the folder is a judgement `cloneTarget` makes of it whole,
 * after the join, so none needs what the join holds, and the solver is not asked to see through a `/` it adds.
 */
export const joinedFolderPure = assume(joinedFolder, { pure: true });

/** Whether git reads `given` as a local path: no colon, or a slash before the first colon. */
const isPath = (given: string): boolean => {
  const colon = given.indexOf(':');
  const slash = given.indexOf('/');
  return colon < 0 || (slash >= 0 && slash < colon);
};

/** Whether `given` is written in the scheme form, `<scheme>://…`. */
const hasScheme = (given: string): boolean => given.includes('://');

/** Whether the scheme form names a scheme a clone is made over. */
const knownScheme = (given: string): boolean =>
  given.startsWith('https://') ||
  given.startsWith('http://') ||
  given.startsWith('ssh://') ||
  given.startsWith('git://') ||
  given.startsWith('file://');

/** The scheme form's authority: what lies between `://` and the next slash, or nothing for the scp-like form. */
const authorityOf = (given: string): string => {
  const at = given.indexOf('://');
  if (at < 0) return '';
  const rest = given.slice(at).slice(3);
  const slash = rest.indexOf('/');
  return slash < 0 ? rest : rest.slice(0, slash);
};

/**
 * Whether the scheme form carries a password: a colon in the user part, before the authority's last `@` — said as an `@` after the
 * authority's first colon, which is the same.
 */
const holdsPassword = (given: string): boolean => {
  const authority = authorityOf(given);
  const colon = authority.indexOf(':');
  return colon >= 0 && authority.slice(colon).includes('@');
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

const cloneTargetSpec = spec<(given: string) => CloneTarget>({
  requires: ({ input: [given] }) => given.length > 0,
  ensures: {
    pathsAsBefore: {
      description: 'A value git reads as a local path is a directory of this machine, as a --repo always was',
      condition: ({ input: [given], output }) => !isPath(given) || output.kind === 'path',
    },
    urlsAreNoPaths: {
      description: 'A value git reads as a URL is never taken for a directory of this machine',
      condition: ({ input: [given], output }) => isPath(given) || output.kind !== 'path',
    },
    unknownSchemeRefused: {
      description: 'A URL over a scheme a clone is not made over (ftp, ext, a misspelling) is refused',
      condition: ({ input: [given], output }) => isPath(given) || !hasScheme(given) || knownScheme(given) || output.kind === 'refused',
    },
    passwordRefused: {
      description: 'A URL that carries a password is refused: Nemia holds no credential, the machine does',
      condition: ({ input: [given], output }) => isPath(given) || !holdsPassword(given) || output.kind === 'refused',
    },
    folderStaysUnderClones: {
      description: "A clone's folder is a host and a path under clones/, and never climbs out of it or steps aside",
      condition: ({ output }) => output.kind !== 'url' || staysUnder(output.folder),
    },
    folderNamesNoCredentialOrPort: {
      description: "A clone's folder holds no user, password or port, nor a character a folder of the store does not take",
      condition: ({ output }) => output.kind !== 'url' || plain(output.folder),
    },
    folderDropsGitSuffix: {
      description: "A clone's folder is named without git's .git suffix, so a URL with it and one without name one clone",
      condition: ({ output }) => output.kind !== 'url' || !output.folder.endsWith('.git'),
    },
  },
});

/** `cloneTarget`'s type, which `src/factory/clones/clones.ts` takes. */
export type CloneTargetOf = Implementation<typeof cloneTargetSpec>;
