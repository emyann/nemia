/**
 * The store's credential: the person's own standing token for this machine, kept in `<home>/credential` (mode 0600) so the person's
 * `nemia` on the store's machine presents it with nothing to type. The daemon puts it in place at its start (`credentialKept`, called by
 * `up`): level-triggered, it leaves a file whose token the store still keeps as the person's, and otherwise mints a person-held token
 * named `local` (or the first free `local-2`, `local-3`…) and writes it there, so a token retired with `nemia token rm local`, or a file
 * that holds no kept token, is replaced at the next start. The client reads the file; nothing else of the store holds the token in the
 * clear.
 */
import fs from 'node:fs';
import path from 'node:path';
import { holderOf, mintPersonTokenFree, personTokenOf, tokenDigest } from './token.store.ts';

/** The file under the store that holds the person's credential, as the client reads it. */
export const CREDENTIAL_FILE = 'credential';

/** The name the store's credential is minted under, or the first free one after it. */
export const CREDENTIAL_NAME = 'local';

/** The credential's file under the store `home`. */
export const credentialFile = (home: string): string => path.join(home, CREDENTIAL_FILE);

/** The token `<home>/credential` holds, trimmed, or none: no file, or an empty one. */
function heldCredential(home: string): string | undefined {
  let text: string;
  try {
    text = fs.readFileSync(credentialFile(home), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
  const token = text.trim();
  return token === '' ? undefined : token;
}

/**
 * Puts the person's credential in place under the store `home`: where `<home>/credential` holds a token the store keeps as a standing
 * token held by the person, leaves it and answers `kept`; else mints a person-held token named `local`, or the first free name after it,
 * and writes it to the file with mode 0600 through a hidden file renamed over it, answering `minted` and the name.
 */
export function credentialKept(
  home: string,
  now: Date = new Date(),
): { readonly kind: 'kept' } | { readonly kind: 'minted'; readonly name: string } {
  const held = heldCredential(home);
  const record = held === undefined ? null : personTokenOf(home, tokenDigest(held));
  if (record !== null && holderOf(record).kind === 'person') return { kind: 'kept' };
  const { token, name } = mintPersonTokenFree(home, CREDENTIAL_NAME, now);
  fs.mkdirSync(home, { recursive: true });
  const hidden = path.join(home, `.${CREDENTIAL_FILE}.${process.pid}.tmp`);
  fs.writeFileSync(hidden, `${token}\n`, { mode: 0o600 });
  fs.chmodSync(hidden, 0o600);
  fs.renameSync(hidden, credentialFile(home));
  return { kind: 'minted', name };
}
