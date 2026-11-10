/**
 * What the board's reads and writes of the api are refused with — in the api's words (`ReadRefusal`, `WriteRefusal`), or as an answer this
 * board does not read (`UnreadAnswer`) — and the decode that words the last (`decoded`). Every read and write is made by the objects'
 * client (`objects.ts`), which reads a refusal's words once.
 */
import { Result, Schema, SchemaIssue } from 'effect';

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
