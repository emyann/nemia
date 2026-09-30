/**
 * The board's reads of the api: a GET answered with JSON, decoded with the schema kept beside the type it reads (`get`), refused in the
 * api's words (`ReadRefusal`), or refused as an answer this board does not read (`UnreadAnswer`). `getUndecoded` is the read of the files
 * not decoded yet, a list `test/read.test.ts` holds and only shrinks.
 */
import { Result, Schema, SchemaIssue } from 'effect';

/** A read the api answered with an error: its words, and its status, which is how a run gone from the store is told apart (`runGone`). */
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
 * are as deep: a union answers an issue for each member, and the one that read furthest is the member the answer meant. A sentence ending
 * on the fix.
 */
function unreadWords(route: string, value: unknown, issue: SchemaIssue.Issue): string {
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
  return `${route} answered what this board does not read: at ${pathWords(path)}, the value ${what}. The board and the api were built apart: restart the api (npm run dev) and rebuild the board (npm run build), then reload the page.`;
}

/**
 * The JSON of a 2xx answer to `path`; rejects with a `ReadRefusal` in the api's own words (its `error`) where it gave them, else naming the
 * status.
 */
async function answer(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const said = await res.json().then(
      (body: { error?: unknown }) => body.error,
      () => undefined,
    );
    throw new ReadRefusal(typeof said === 'string' ? said : `GET ${path} answered ${res.status} ${res.statusText}`, res.status);
  }
  return res.json();
}

/**
 * Reads `path` from the api and decodes its JSON with `schema`: resolves with what the board reads, every key it does not know dropped;
 * rejects with a `ReadRefusal` where the api refused the read, and with an `UnreadAnswer` where its answer does not decode.
 */
export async function get<T>(path: string, schema: Schema.Decoder<T>, init?: RequestInit): Promise<T> {
  const value = await answer(path, init);
  const decoded = Schema.decodeUnknownResult(schema)(value);
  if (Result.isSuccess(decoded)) return decoded.success;
  const route = `GET ${path}`;
  throw new UnreadAnswer(route, unreadWords(route, value, decoded.failure.issue));
}

/**
 * Reads `path` from the api as `get` does, and takes its JSON to be a `T` unread: the read of a file not decoded yet (`test/read.test.ts`).
 */
export async function getUndecoded<T>(path: string, init?: RequestInit): Promise<T> {
  return (await answer(path, init)) as T;
}
