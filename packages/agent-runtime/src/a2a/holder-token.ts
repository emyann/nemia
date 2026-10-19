/**
 * The bearer token of a holder's served port (`listener.ts`): minted at the hold, kept in the runtime's own store under
 * `<root>/a2a/`, and removed as the hold ends.
 *
 * Fresh at each hold: a token left behind by a dead holder dials nothing, since the port it was minted for is gone, and the
 * layer above hands a viewer the token of the holder that is up. The file is the only place it is written — never a log, the
 * journal, the feed, the registry, nor a child's argv — and it is written 0600 in a 0700 folder, so only the user who holds
 * can read it.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** How many random bytes a token is made of: 32, base64url, as a bearer token of no structure. */
const TOKEN_BYTES = 32;

/** The folder the holder's token is kept in, under the runtime's store `root`. */
export const tokenFolderOf = (root: string): string => path.join(root, 'a2a');

/** The file the holder's token is kept in. */
export const tokenFileOf = (root: string): string => path.join(tokenFolderOf(root), 'holder-token');

/** A token no one can guess: 32 random bytes, base64url. */
export const tokenOf = (): string => crypto.randomBytes(TOKEN_BYTES).toString('base64url');

/** `token` written under `root`, 0600 in a 0700 folder, whatever modes a folder already there was made with. */
export const writeToken = (root: string, token: string): void => {
  const dir = tokenFolderOf(root);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  const file = tokenFileOf(root);
  fs.writeFileSync(file, token, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
};

/** The token under `root` forgotten; an absence is no error. */
export const forgetToken = (root: string): void => fs.rmSync(tokenFileOf(root), { force: true });

/**
 * Whether `given` is `token`, compared over the sha256 of each so that two of any lengths are compared in constant time:
 * a request with no token is no match.
 */
export const tokenHolds = (token: string, given: string | undefined): boolean => {
  if (given === undefined) return false;
  const digest = (s: string) => crypto.createHash('sha256').update(s).digest();
  return crypto.timingSafeEqual(digest(token), digest(given));
};

/** The bearer token an `authorization` header carries, or `undefined` where it carries none. */
export const bearerOf = (header: string | undefined): string | undefined => {
  const m = header === undefined ? null : /^Bearer\s+(\S+)$/i.exec(header.trim());
  return m ? m[1] : undefined;
};
