/**
 * The person's sign-in token file, `$WF_ROOT/<TOKEN_NAME>`: the long-lived subscription token the default harness's `setup-token`
 * prints (`TOKEN_MAKER`), kept on the person's own machine readable by them alone (mode 0600), written whole by a temporary file and a
 * rename, and never printed, logged or served. The daemon loads it at its start into the harness's variable (`TOKEN_VARIABLE`) where unset
 * (`loadClaudeToken`), so the sessions it starts sign in with it, however the daemon was started; a file whose mode lets another user
 * read it is refused, naming `chmod 600`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { wfRoot } from '../config/config.store.ts';
import { Invalid } from '../refusal/refusal.ts';
import { DEFAULT_HARNESS, DEFAULT_SIGN_IN } from 'agent-runtime/vocabulary';

/** The token file's name under the store, and the commands' word for it: `nemia <TOKEN_NAME> set`, the default harness's name first. */
export const TOKEN_NAME = `${DEFAULT_HARNESS}-token`;

/** The command that prints the token to keep, as a person types it: the default harness's, as the runtime names it. */
export const TOKEN_MAKER = DEFAULT_SIGN_IN.maker;

/** The variable the default harness signs in with, which the daemon's sessions inherit, as the runtime names it. */
export const TOKEN_VARIABLE = DEFAULT_SIGN_IN.variable;

/** The token file of the store at `home`. */
export const claudeTokenFile = (home: string): string => path.join(home, TOKEN_NAME);

/** Whether the store keeps a sign-in token (`set`) or not (`unset`). */
export type ClaudeTokenState = 'set' | 'unset';

/** What `status` says: whether a token is kept, its file, and the file's mode, as `0600`; never the token. */
export type ClaudeTokenStatus = { readonly state: ClaudeTokenState; readonly file: string; readonly mode?: string };

/** A file mode's permission bits, as `chmod` takes them: `0600`. */
const modeWords = (mode: number): string => `0${(mode & 0o777).toString(8).padStart(3, '0')}`;

/**
 * Keeps `token` as the store's sign-in token: written to a file beside the token file with mode 0600, then renamed over it, so no
 * reader meets half of one or a moment it is readable by another. Refused (`Invalid`): a token that is empty or spans words once
 * trimmed.
 */
export function writeClaudeToken(home: string, token: string): string {
  const trimmed = token.trim();
  if (trimmed === '' || /\s/.test(trimmed))
    throw new Invalid({
      message: `nemia ${TOKEN_NAME} set: the token read is empty or holds a space or a line break: run ${TOKEN_MAKER} and give its token alone, like nemia ${TOKEN_NAME} set < token.txt.`,
    });
  const file = claudeTokenFile(home);
  fs.mkdirSync(home, { recursive: true });
  const hidden = path.join(home, `.${TOKEN_NAME}-${process.pid}`);
  fs.rmSync(hidden, { force: true });
  fs.writeFileSync(hidden, `${trimmed}\n`, { mode: 0o600, flag: 'wx' });
  fs.chmodSync(hidden, 0o600);
  fs.renameSync(hidden, file);
  return file;
}

/** Whether the store at `home` keeps a sign-in token, and its file's mode; never the token. */
export function claudeTokenStatus(home: string): ClaudeTokenStatus {
  const file = claudeTokenFile(home);
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  return stat === undefined ? { state: 'unset', file } : { state: 'set', file, mode: modeWords(stat.mode) };
}

/** Removes the store's sign-in token; answers whether there was one. */
export function removeClaudeToken(home: string): boolean {
  const file = claudeTokenFile(home);
  const had = fs.existsSync(file);
  fs.rmSync(file, { force: true });
  return had;
}

/** What `loadClaudeToken` did: set the variable from the file (`loaded`), left one already set (`given`), or found no file (`none`). */
export type ClaudeTokenLoad = 'loaded' | 'given' | 'none';

/**
 * Sets the harness's variable (`TOKEN_VARIABLE`) in `env` from the token file of `env`'s store (`WF_ROOT`) where it is unset or empty, as the daemon does
 * at its start: the process's own environment, which every session it starts inherits. Refused (`Invalid`, exit 2) where the file's mode
 * lets its group or others read or write it, naming `chmod 600 <file>`, and where it holds no token.
 */
export function loadClaudeToken(env: Record<string, string | undefined>, root: string = wfRoot(env)): ClaudeTokenLoad {
  if (env[TOKEN_VARIABLE]) return 'given';
  const file = claudeTokenFile(root);
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  if (stat === undefined) return 'none';
  if ((stat.mode & 0o077) !== 0)
    throw new Invalid({
      message: `nemia: the sign-in token file ${file} is mode ${modeWords(stat.mode)}, readable by more than you: run chmod 600 ${file}, then start the daemon again.`,
    });
  const token = fs.readFileSync(file, 'utf8').trim();
  if (token === '')
    throw new Invalid({
      message: `nemia: the sign-in token file ${file} is empty: run nemia ${TOKEN_NAME} set, or nemia ${TOKEN_NAME} rm.`,
    });
  env[TOKEN_VARIABLE] = token;
  return 'loaded';
}
