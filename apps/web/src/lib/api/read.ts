/**
 * What the board's reads and writes of the api are refused with — in the api's words (`ReadRefusal`, `WriteRefusal`), or as an answer this
 * board does not read (`UnreadAnswer`) — and the decode that words the last (`decoded`). Every read and write is made by the objects'
 * client (`objects.ts`), which reads a refusal's words once.
 */
import { Result, Schema, SchemaIssue } from 'effect';
import type { TokenRefusal } from 'objects';

/** A read the api answered with an error: its words, and its status, which is how a run gone from the store is told apart (`readGone`). */
export class ReadRefusal extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * A read the api answered, with what this board does not read: `route` the read (`GET /api/runs`), and a message naming the first key that
 * is wrong, what was there, and the fix — the board and the api were built apart, so restart the api and rebuild the board, then reload.
 */
export class UnreadAnswer extends Error {
  readonly route: string;
  constructor(route: string, message: string) {
    super(message);
    this.route = route;
  }
}

/**
 * A write the api answered with an error: its words, and its status. Apart from `ReadRefusal`, so a write's 404 is never taken for a run
 * gone from the store (`readGone`).
 */
export class WriteRefusal extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const formatter = SchemaIssue.makeFormatterStandardSchemaV1();

/** One issue of a failed decode, as the formatter words it: where, by its path, and what was expected there. */
type Issue = ReturnType<typeof formatter>['issues'][number];

/** `value` as JSON, cut to its first 60 characters and marked `…` where it was cut. */
const shown = (value: unknown): string => {
  const json = JSON.stringify(value) ?? 'undefined';
  return json.length > 60 ? `${json.slice(0, 59)}…` : json;
};

/** `path` as a reader writes it into a value: `[0].steps[1].status`, or `the answer` for the value itself. */
const pathWords = (path: readonly PropertyKey[]): string =>
  path.length ? path.map((key, i) => (typeof key === 'number' ? `[${key}]` : `${i ? '.' : ''}${String(key)}`)).join('') : 'the answer';

/** The value at `path` in `value`, or undefined where a key on the way is not there. */
const valueAt = (value: unknown, path: readonly PropertyKey[]): unknown =>
  path.reduce<unknown>(
    (at, key) => (typeof at === 'object' && at !== null && Object.hasOwn(at, key) ? Reflect.get(at, key) : undefined),
    value,
  );

/**
 * Why `route` answered `value` with what the board does not read, from the deepest issue of its failed decode — the first, where they
 * are as deep: a union answers an issue for each member, and the one that read furthest is the member the answer meant. Sentences ending
 * on the fix, with `may` before it: what a write may have done, and what to look at before sending it again.
 */
function unreadWords(route: string, value: unknown, issue: SchemaIssue.Issue, may?: string): string {
  const deepest = formatter(issue).issues.reduce<Issue | undefined>(
    (found, next) => (found && (next.path?.length ?? 0) <= (found.path?.length ?? 0) ? found : next),
    undefined,
  );
  const path = (deepest?.path ?? []).map((p) => (typeof p === 'object' && p !== null && 'key' in p ? p.key : p));
  const message = deepest?.message ?? 'Expected what the board reads';
  const what =
    message === 'Missing key'
      ? 'is missing'
      : `is ${shown(valueAt(value, path))}, where the board reads ${message.replace(/^Expected /, '').replace(/ \| undefined$/, '')}`;
  return `${route} answered what this board does not read: at ${pathWords(path)}, the value ${what}.${may ? ` ${may}` : ''} The board and the api were built apart: restart the api (npm run dev) and rebuild the board (npm run build), then reload the page.`;
}

/**
 * `value` decoded with `schema`; throws an `UnreadAnswer` for `route` where it does not decode, with `may`'s words before the fix. Shared
 * with the objects' client (`objects.ts`), whose answers are read as these are.
 */
export function decoded<T>(route: string, schema: Schema.Decoder<T>, value: unknown, may?: string): T {
  const result = Schema.decodeUnknownResult(schema)(value);
  if (Result.isSuccess(result)) return result.success;
  throw new UnreadAnswer(route, unreadWords(route, value, result.failure.issue, may));
}

/**
 * Why the api asks this browser for a token: it sent none to a store marked exposed (`token-required`), or the one its cookie carries is
 * no token the store keeps (`unknown-token`, one removed since). The two of `objects`' `TOKEN_REFUSALS` a person answers by pasting a
 * token: the other two are a session's and the MCP port's, which a browser never is.
 */
export type TokenAsk = Extract<TokenRefusal, 'token-required' | 'unknown-token'>;

/** The api's ask for a token: its reason, and its words, which say where a token is minted. */
export type TokenAsked = { readonly reason: TokenAsk; readonly message: string };

/** The refusals the token page answers, by their words. */
const TOKEN_ASKS: ReadonlySet<string> = new Set<TokenAsk>(['token-required', 'unknown-token']);

/** The string `answer` carries at `key`, where it is an object that carries one. */
const stringAt = (answer: unknown, key: string): string | undefined => {
  const value = typeof answer === 'object' && answer !== null ? Reflect.get(answer, key) : undefined;
  return typeof value === 'string' ? value : undefined;
};

/** The token the api asks for where it answered `status` with `answer`: a 401 whose reason is a `TokenAsk`, with its words; else none. */
export function tokenAskOf(status: number, answer: unknown): TokenAsked | null {
  const reason = stringAt(answer, 'reason');
  if (status !== 401 || reason === undefined || !TOKEN_ASKS.has(reason)) return null;
  return { reason: reason as TokenAsk, message: stringAt(answer, 'error') ?? '' };
}

/** The token the api last asked this page for, until the page loads again: none, until a read or a write is answered with one. */
let asked: TokenAsked | null = null;

/** Who is told when the api asks for a token. */
const askedListeners = new Set<() => void>();

/**
 * Notes that the api asked for a token, as `ask` says, and tells every listener where its reason is new: the objects' client calls it on
 * each answer that asks, and the first words of a reason are kept.
 */
export function askToken(ask: TokenAsked): void {
  if (asked?.reason === ask.reason) return;
  asked = ask;
  for (const listener of askedListeners) listener();
}

/** `listener` told each time the api asks for a token; the answer stops telling it. Shaped for React's `useSyncExternalStore`. */
export function onTokenAsked(listener: () => void): () => void {
  askedListeners.add(listener);
  return () => void askedListeners.delete(listener);
}

/** The token the api last asked for, or null while it has asked for none. */
export const tokenAsked = (): TokenAsked | null => asked;
