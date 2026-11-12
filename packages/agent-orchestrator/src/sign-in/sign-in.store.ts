/**
 * The person's sign-in token file, `$WF_ROOT/<TOKEN_NAME>`: the long-lived subscription token the default harness's `setup-token`
 * prints (`TOKEN_MAKER`), kept on the person's own machine readable by them alone (mode 0600), written whole by a temporary file and a
 * rename, and never printed, logged or served. The daemon loads it at its start into the harness's variable (`TOKEN_VARIABLE`) where unset
 * (`loadClaudeToken`), so the sessions it starts sign in with it, however the daemon was started; a file whose mode lets another user
 * read it is refused, naming `chmod 600`. The token lasts a year from when it was made: its age is read off the file's write time
 * alone, which `writeClaudeToken` sets, and past about eleven months it is warned of (`tokenWarningLine`) before a session's first
 * request fails on it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { wfRoot } from '../config/config.store.ts';
import { Invalid } from '../refusal/refusal.ts';
import { DEFAULT_HARNESS, DEFAULT_SIGN_IN } from 'agent-runtime/vocabulary';

/** The token file's name under the store, and the commands' word for it: `nemia <TOKEN_NAME> set`, the default harness's name first. */
export const TOKEN_NAME = `${DEFAULT_HARNESS}-token`;

/** The default harness's name with its first letter in capitals, as a sentence names its token. */
const capitalHarness = `${DEFAULT_HARNESS.charAt(0).toUpperCase()}${DEFAULT_HARNESS.slice(1)}`;

/** The command that prints the token to keep, as a person types it: the default harness's, as the runtime names it. */
export const TOKEN_MAKER = DEFAULT_SIGN_IN.maker;

/** The variable the default harness signs in with, which the daemon's sessions inherit, as the runtime names it. */
export const TOKEN_VARIABLE = DEFAULT_SIGN_IN.variable;

/** The token file of the store at `home`. */
export const claudeTokenFile = (home: string): string => path.join(home, TOKEN_NAME);

/** Whether the store keeps a sign-in token (`set`) or not (`unset`). */
export type ClaudeTokenState = 'set' | 'unset';

/** A day, in milliseconds. */
const DAY_MS = 86_400_000;

/** How long a token `TOKEN_MAKER` prints lasts: a year. */
export const TOKEN_LIFE_DAYS = 365;

/** How old a token is when it is warned of: about eleven months, a month before its year is out. */
export const TOKEN_WARN_DAYS = 335;

/** Why a kept token is warned of: within a month of its year (`near-year`), or past it (`past-year`). */
export type ClaudeTokenWarning = 'near-year' | 'past-year';

/**
 * What `status` says: whether a token is kept, its file, and the file's mode, as `0600`; for a kept one, when it was set (the file's
 * write time, ISO), the whole days left of its year (below zero once past it), and its warning where it is near or past it; never the
 * token.
 */
export type ClaudeTokenStatus = {
  readonly state: ClaudeTokenState;
  readonly file: string;
  readonly mode?: string;
  readonly setAt?: string;
  readonly daysLeft?: number;
  readonly warning?: ClaudeTokenWarning;
};

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

/** The warning of a token set at `setMs`, read at `now`: none while it is younger than `TOKEN_WARN_DAYS`. */
const warningOf = (setMs: number, now: number): ClaudeTokenWarning | undefined => {
  const age = now - setMs;
  return age >= TOKEN_LIFE_DAYS * DAY_MS ? 'past-year' : age >= TOKEN_WARN_DAYS * DAY_MS ? 'near-year' : undefined;
};

/**
 * Whether the store at `home` keeps a sign-in token, its file's mode, and, read at `now`, when it was set and how long its year has left
 * (its file's write time); never the token.
 */
export function claudeTokenStatus(home: string, now: number = Date.now()): ClaudeTokenStatus {
  const file = claudeTokenFile(home);
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  if (stat === undefined) return { state: 'unset', file };
  const warning = warningOf(stat.mtimeMs, now);
  return {
    state: 'set',
    file,
    mode: modeWords(stat.mode),
    setAt: new Date(stat.mtimeMs).toISOString(),
    daysLeft: Math.floor((stat.mtimeMs + TOKEN_LIFE_DAYS * DAY_MS - now) / DAY_MS),
    ...(warning === undefined ? {} : { warning }),
  };
}

/** A kept token's age in words: the day it was set, and the days left of its year or how long it is past it. */
export function tokenAgeWords(status: ClaudeTokenStatus): string | undefined {
  if (status.setAt === undefined || status.daysLeft === undefined) return undefined;
  const day = status.setAt.slice(0, 10);
  const left = status.daysLeft;
  return left >= 0
    ? `set ${day}, ${left} day${left === 1 ? '' : 's'} left of its year`
    : `set ${day}, ${-left} day${left === -1 ? '' : 's'} past its year`;
}

/** The command line that makes a new token and puts it in use: made, kept, and the daemon started again to load it. */
export const TOKEN_RENEWAL = `${TOKEN_MAKER} on a machine with a browser, then nemia ${TOKEN_NAME} set, then nemia service restart`;

/**
 * The warning of a kept token near or past its year, naming the fix (`TOKEN_RENEWAL`): none for a token younger than `TOKEN_WARN_DAYS`
 * or none kept. `nemia <TOKEN_NAME> status`, the daemon's start and the readiness read say it alike.
 */
export function tokenWarningLine(status: ClaudeTokenStatus): string | undefined {
  if (status.warning === undefined) return undefined;
  const age = tokenAgeWords(status);
  const end =
    status.warning === 'past-year'
      ? 'it may no longer sign in, and every session fails at its first request'
      : 'every session fails at its first request once its year is out';
  return `the ${capitalHarness} token in ${status.file} was ${age}: ${end}. Make a new one: ${TOKEN_RENEWAL}`;
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
 * Sets the harness's variable (`TOKEN_VARIABLE`) in `env` from the token file of `env`'s store (`WF_ROOT`) where it is unset or empty, as
 * the daemon does at its start: the process's own environment, which every session it starts inherits. Refused (`Invalid`, exit 2) where
 * the file's mode lets its group or others read or write it, naming `chmod 600 <file>`, and where it holds no token.
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
