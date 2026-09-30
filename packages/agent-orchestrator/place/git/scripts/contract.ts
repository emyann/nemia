/**
 * What every verb script of the git place shares: reading its one request, answering it, and running git.
 *
 * A script is run by the orchestrator as `node scripts/<verb>.ts`, with one JSON request on stdin that carries `v`, the contract's
 * version. It prints one JSON document on stdout at exit 0: its answer, or `{ "refused": "<words>" }`. A request it cannot read exits 2 with
 * the reason on stderr, and any other failure exits 1: both are unread. Standalone: node's built-ins only, in TypeScript node strips.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

/** The version of the contract these scripts speak, carried as `v` on the request. */
const CONTRACT = 1;

/** A request as it arrived, before its fields are read. */
export type Request = Readonly<Record<string, unknown>>;

/** What a verb answers: its answer, or a refusal in its own words. */
export type Reply = object;

/** A request this script cannot read: said on stderr, and exit 2. */
export class Malformed extends Error {}

/** A refusal in the place's words, printed as `{ refused }` at exit 0. */
export const refused = (words: string): Reply => ({ refused: words });

/** The string `key` of `request`, or `Malformed` naming it. */
export function text(request: Request, key: string): string {
  const value = request[key];
  if (typeof value !== 'string')
    throw new Malformed(`the request's \`${key}\` is ${JSON.stringify(value) ?? 'missing'}, where a string is asked`);
  return value;
}

/** The object of strings `key` of `request`, or `Malformed` naming it. */
export function strings(request: Request, key: string): Readonly<Record<string, string>> {
  const value = request[key];
  if (typeof value !== 'object' || value === null || Array.isArray(value) || Object.values(value).some((v) => typeof v !== 'string'))
    throw new Malformed(`the request's \`${key}\` is ${JSON.stringify(value) ?? 'missing'}, where an object of strings is asked`);
  return value as Record<string, string>;
}

/**
 * Read the one request on stdin, hand it to `verb`, and print what it replies: exit 0 with its JSON, exit 2 with the reason when the
 * request is not JSON, is not an object, carries another `v`, or `verb` throws `Malformed`, and exit 1 with the error when `verb` throws
 * anything else.
 */
export function serve(verb: (request: Request) => Reply): void {
  try {
    const request: unknown = JSON.parse(fs.readFileSync(0, 'utf8'));
    if (typeof request !== 'object' || request === null || Array.isArray(request)) throw new Malformed('the request is not a JSON object');
    const v = (request as Request).v;
    if (v !== CONTRACT) throw new Malformed(`the request carries v ${JSON.stringify(v) ?? 'missing'}, and this place speaks v ${CONTRACT}`);
    process.stdout.write(`${JSON.stringify(verb(request as Request))}\n`);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = err instanceof Malformed || err instanceof SyntaxError ? 2 : 1;
  }
}

/** The last lines a failed git command wrote on stderr — where git hands on a hook's output, stdout's too — or its exit status. */
export function failedWords(err: unknown, lines = 4): string {
  const { stderr, status } = err as { stderr?: unknown; status?: number | null };
  const said = (Buffer.isBuffer(stderr) ? stderr.toString('utf8') : typeof stderr === 'string' ? stderr : '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return said.length ? said.slice(-lines).join(' / ') : `git exited ${status ?? 'on a signal'}`;
}

/** Git run in `cwd` with `args`, `input` on its stdin when given, its stdout trimmed; it throws with git's words when git fails. */
export const git = (cwd: string, args: readonly string[], input?: string): string =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    input: input ?? '',
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 256 * 1024 * 1024,
  }).trim();

/** Git's stdout, trimmed, or undefined when git fails: a question whose failure is an answer, as `merge-base --is-ancestor`'s is. */
export function gitSays(cwd: string, args: readonly string[]): string | undefined {
  try {
    return git(cwd, args);
  } catch {
    return undefined;
  }
}

/** Whether `dir` is a directory, so that git is never run where it cannot start. */
export const isDirectory = (dir: string): boolean => fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory() ?? false;
