/**
 * What the board's reads and writes of the api are refused with — in the api's words (`ReadRefusal`, `WriteRefusal`), or as an answer this
 * board does not read (`UnreadAnswer`) — and the decode that words the last (`decoded`). Every read and write is made by the objects'
 * client (`objects.ts`), which reads a refusal's words once. And what a page says where a read fails, by its kind, the same on every
 * page (`troubleOf`, `troubleLine`, proved by `contracts/read-trouble.contract.ts`).
 */
import { Result, Schema, SchemaIssue } from 'effect';
import { refusedIn, type RefusedPlace, type TokenRefusal } from 'objects';
import type { ReadFailure, Trouble, TroubleKind, TroubleWords } from '../../../contracts/read-trouble.contract.ts';

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
 * is wrong, what was there, and the fix, `BUILT_APART`: the board and the api are of different builds.
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

/** The fix where the api answered what this board does not read: the two are of different builds, said for an install. */
export const BUILT_APART = "The board and Nemia's api are of different builds: restart Nemia's service, then reload the page.";

/** `value` as JSON, cut to its first 60 characters and marked `…` where it was cut. */
const shown = (value: unknown) => {
  const json = JSON.stringify(value) ?? 'undefined';
  return json.length > 60 ? `${json.slice(0, 59)}…` : json;
};

/** `path` as a reader writes it into a value: `[0].steps[1].status`, or `the answer` for the value itself. */
const pathWords = (path: readonly PropertyKey[]) =>
  path.length ? path.map((key, i) => (typeof key === 'number' ? `[${key}]` : `${i ? '.' : ''}${String(key)}`)).join('') : 'the answer';

/**
 * Why `route` answered what the board does not read, from the deepest place `issue` refused of its failed decode — the first, where they
 * are as deep: a union answers an issue for each member, and the one that read furthest is the member the answer meant. Sentences ending
 * on the fix, with `may` before it: what a write may have done, and what to look at before sending it again.
 */
function unreadWords(route: string, issue: SchemaIssue.Issue, may?: string) {
  const deepest = refusedIn(issue).reduce<RefusedPlace | undefined>(
    (found, next) => (found && next.path.length <= found.path.length ? found : next),
    undefined,
  );
  const path = deepest?.path ?? [];
  const what =
    deepest === undefined
      ? 'is not what the board reads'
      : deepest._tag === 'MissingKey'
        ? 'is missing'
        : `is ${shown(deepest.input)}, where the board reads ${deepest.message ?? deepest.expected}`;
  return `${route} answered what this board does not read: at ${pathWords(path)}, the value ${what}.${may ? ` ${may}` : ''} ${BUILT_APART}`;
}

/**
 * How `error` failed a read, and its message: the api's refusal (`ReadRefusal`, `WriteRefusal`), an answer this board does not read
 * (`UnreadAnswer`), or anything else, which is nothing having answered — the objects' client throws no other error where the api answered.
 * @param error What the read was rejected with.
 */
export function failureOf(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const kind: TroubleKind =
    error instanceof ReadRefusal || error instanceof WriteRefusal ? 'refused' : error instanceof UnreadAnswer ? 'unread' : 'unanswered';
  return { kind, message } satisfies ReadFailure;
}

/**
 * What the board says of a failed read, by its kind: the api's words where it refused, the answer's own message where it answered what
 * the board does not read, and where nothing answered, that Nemia's api did not, why, and to reload once it does.
 * @param failure The read's failure: its kind and its message.
 */
export const troubleWords: TroubleWords = (failure) => {
  if (failure.kind !== 'unanswered') return { kind: failure.kind, words: failure.message };
  return { kind: failure.kind, words: "Nemia's api did not answer (" + failure.message + '). Reload the page once it is running again.' };
};

/**
 * What the board says where `error` failed a read: its kind, which a page marks it by, and its words.
 * @param error What the read was rejected with.
 */
export const troubleOf = (error: unknown) => troubleWords(failureOf(error)) satisfies Trouble;

/**
 * The one line a page says where it could not read `what`: `Could not read <what>: ` and the trouble's words.
 * @param what What the page reads, as a person names it: `the agents`, `the run r-1`.
 * @param error What the read was rejected with.
 */
export const troubleLine = (what: string, error: unknown) => `Could not read ${what}: ${troubleOf(error).words}`;

/**
 * `value` decoded with `schema`; throws an `UnreadAnswer` for `route` where it does not decode, with `may`'s words before the fix. Shared
 * with the objects' client (`objects.ts`), whose answers are read as these are.
 * @param route The read or write, by its method and path (`GET /api/runs`), which the message names.
 * @param schema The schema the value decodes with.
 * @param value The answer as the api sent it.
 * @param may What a write may have done, said before the fix; none for a read.
 */
export function decoded<T>(route: string, schema: Schema.Decoder<T>, value: unknown, may?: string) {
  const result = Schema.decodeUnknownResult(schema)(value, { reportInput: true });
  if (Result.isSuccess(result)) return result.success;
  throw new UnreadAnswer(route, unreadWords(route, result.failure.issue, may));
}

/**
 * Why the api asks this browser for a token: it sent none (`token-required`, on every store, loopback included), or the one its cookie
 * carries is no token the store keeps (`unknown-token`, one removed since). The two of `objects`' `TOKEN_REFUSALS` a person answers by
 * pasting a token: the other two are a session's and the MCP port's, which a browser never is.
 */
export type TokenAsk = Extract<TokenRefusal, 'token-required' | 'unknown-token'>;

/** The api's ask for a token: its reason, its words, which say where a token is minted, and whether the store is marked exposed. */
export type TokenAsked = { readonly reason: TokenAsk; readonly message: string; readonly exposed: boolean };

/** The refusals the token page answers, by their words. */
const TOKEN_ASKS: ReadonlySet<string> = new Set<TokenAsk>(['token-required', 'unknown-token']);

/** The string `answer` carries at `key`, where it is an object that carries one. */
const stringAt = (answer: unknown, key: string) => {
  const value = typeof answer === 'object' && answer !== null ? Reflect.get(answer, key) : undefined;
  return typeof value === 'string' ? value : undefined;
};

/**
 * The token the api asks for where it answered `status` with `answer`: a 401 whose reason is a `TokenAsk`, with its words, and whether
 * the store is marked exposed — only an answer that says `exposed: false` is a store served on this machine alone, so an api that says
 * nothing keeps today's words; else none.
 * @param status The status the api answered.
 * @param answer The answer's JSON, undefined for one that is not JSON.
 */
export function tokenAskOf(status: number, answer: unknown) {
  const reason = stringAt(answer, 'reason');
  if (status !== 401 || reason === undefined || !TOKEN_ASKS.has(reason)) return null;
  const exposed = typeof answer === 'object' && answer !== null ? Reflect.get(answer, 'exposed') !== false : true;
  return { reason: reason as TokenAsk, message: stringAt(answer, 'error') ?? '', exposed };
}

/** The token the api last asked this page for, until the page loads again: none, until a read or a write is answered with one. */
let asked: TokenAsked | null = null;

/** Who is told when the api asks for a token. */
const askedListeners = new Set<() => void>();

/**
 * Notes that the api asked for a token, as `ask` says, and tells every listener where its reason is new: the objects' client calls it on
 * each answer that asks, and the first words of a reason are kept.
 * @param ask The api's ask for a token: its reason and its words.
 */
export function askToken(ask: TokenAsked) {
  if (asked?.reason === ask.reason) return;
  asked = ask;
  for (const listener of askedListeners) listener();
}

/**
 * `listener` told each time the api asks for a token; the answer stops telling it. Shaped for React's `useSyncExternalStore`.
 * @param listener Called each time the api asks for a token anew.
 */
export function onTokenAsked(listener: () => void) {
  askedListeners.add(listener);
  return () => void askedListeners.delete(listener);
}

/** The token the api last asked for, or null while it has asked for none. */
export const tokenAsked = () => asked;
