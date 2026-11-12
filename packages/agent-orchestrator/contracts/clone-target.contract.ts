/**
 * What a factory's `--repo` names (agent-orchestrator, src/factory/clones/clones.ts): a directory of this machine, as before
 * (`path`), a repository by its git URL, kept as a clone under `$WF_ROOT/clones/<folder>` (`url`), or neither (`refused`, its words
 * naming the fix).
 *
 * A value is a path exactly as git reads one: it holds no colon, or a slash comes before its first colon (git-clone(1), *GIT URLS*:
 * the scp-like syntax "is only recognized if there are no slashes before the first colon"). Anything else is a URL: the scheme form
 * `<scheme>://[<user>@]<host>[:<port>]/<path>`, its scheme one of https, http, ssh, git or file, or the scp-like form
 * `[<user>@]<host>:<path>`. Its folder is the host, lower-cased (`localhost` for a file URL, which names none), then the path, with
 * its leading and trailing slashes and a trailing `.git` taken off: the user, the port and the scheme name no folder, so one
 * repository named over ssh and over https is one clone. Nemia holds no credential: a URL that carries a password is refused.
 * Refused besides: another scheme, a host left empty, and a path that is empty or would climb or step aside (`.` or `..` or an empty
 * segment), or that holds a space, a `%`, a backslash, a colon or an `@`.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** What a `--repo` value names. Declared here until implement moves it into `src/factory/clones/clones.ts`. */
export type CloneTarget =
  | { readonly kind: 'path' }
  | { readonly kind: 'url'; readonly folder: string }
  | { readonly kind: 'refused'; readonly message: string };

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
  const rest = given.slice(at + 3);
  const slash = rest.indexOf('/');
  return slash < 0 ? rest : rest.slice(0, slash);
};

/** Whether the scheme form carries a password: a colon in the user part, before the authority's last `@`. */
const holdsPassword = (given: string): boolean => {
  const authority = authorityOf(given);
  const at = authority.lastIndexOf('@');
  return at >= 0 && authority.slice(0, at).includes(':');
};

/** Whether a clone's folder stays under `clones/`: relative, a host and a path at least, no segment empty, `.` or `..`. */
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

/** Whether `text` holds none of what a folder of a clone may not: a space, a `%`, a backslash, a colon or an `@`. */
const plain = (text: string): boolean =>
  !text.includes(' ') && !text.includes('%') && !text.includes('\\') && !text.includes(':') && !text.includes('@');

/**
 * Whether `rest`, a host and a path after `https://`, is one a clone is plainly made of: a host and at least one segment, plain,
 * with no segment empty, `.`, `..` or a lone `.git`, and no trailing slash.
 */
const plainHttpsRest = (rest: string): boolean => {
  const framed = `/${rest}/`;
  return (
    plain(rest) &&
    rest.includes('/') &&
    !rest.startsWith('/') &&
    !rest.endsWith('/') &&
    !framed.includes('//') &&
    !framed.includes('/./') &&
    !framed.includes('/../') &&
    !framed.includes('/.git/')
  );
};

/** Whether `given` is the scp-like form `git@<host>:<path>` over plain words: a host, then a path of one segment at least. */
const plainScp = (given: string): boolean => {
  if (!given.startsWith('git@')) return false;
  const rest = given.slice(4);
  const colon = rest.indexOf(':');
  if (colon <= 0) return false;
  const host = rest.slice(0, colon);
  const path = rest.slice(colon + 1);
  return !host.includes('/') && plain(host) && path.length > 0 && plainHttpsRest(`${host}/${path}`);
};

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
    plainHttpsCloned: {
      description: 'An https URL of a host and a path in plain words, with no user, is cloned under that host',
      condition: ({ input: [given], output }) => {
        if (!given.startsWith('https://')) return true;
        const rest = given.slice(8);
        if (!plainHttpsRest(rest)) return true;
        const host = rest.slice(0, rest.indexOf('/'));
        return output.kind === 'url' && output.folder.startsWith(`${host.toLowerCase()}/`);
      },
    },
    plainScpCloned: {
      description: 'The scp-like git@<host>:<path> of plain words is cloned under that host',
      condition: ({ input: [given], output }) => {
        if (!plainScp(given)) return true;
        const host = given.slice(4, given.indexOf(':'));
        return output.kind === 'url' && output.folder.startsWith(`${host.toLowerCase()}/`);
      },
    },
  },
});

/** `cloneTarget`'s type, which `src/factory/clones/clones.ts` takes. */
export type CloneTargetOf = Implementation<typeof cloneTargetSpec>;
