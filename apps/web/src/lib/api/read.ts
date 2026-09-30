/**
 * The board's reads and writes of the api: a GET (`get`) or a write (`send`) answered with JSON, decoded with the schema kept beside the
 * type it reads, refused in the api's words (`ReadRefusal`, `WriteRefusal`), or refused as an answer this board does not read
 * (`UnreadAnswer`). `test/read.test.ts` refuses a read or a write that passes no schema.
 */
import { Option, Result, Schema, SchemaIssue } from 'effect';

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

/**
 * A write the api answered with an error: its words, and its status. Apart from `ReadRefusal`, so a write's 404 is never taken for a run
 * gone from the store (`runGone`).
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

/** What an answer that is no refusal of the api's has to say: its `error`. */
const Said = Schema.Struct({ error: Schema.String });

/** How a refusal of the api's is built from its words (its `error`, or `<route> answered <status> <text>`), its status and its JSON. */
type Refuse = (words: string, status: number, answer: unknown) => Error;

/**
 * The JSON of a 2xx answer to `route`, sent to `path` with `init` — undefined for an answer that is not JSON; rejects with what `refuse`
 * builds of the api's own words (its `error`) where it gave them, else of words naming the status.
 */
async function answer(route: string, path: string, init: RequestInit | undefined, refuse: Refuse): Promise<unknown> {
  const res = await fetch(path, init);
  const body: unknown = await res.json().catch(() => undefined);
  if (res.ok) return body;
  const said = Option.getOrUndefined(Schema.decodeUnknownOption(Said)(body))?.error;
  throw refuse(said ?? `${route} answered ${res.status} ${res.statusText}`, res.status, body);
}

/** `value` decoded with `schema`; throws an `UnreadAnswer` for `route` where it does not decode, with `may`'s words before the fix. */
function decoded<T>(route: string, schema: Schema.Decoder<T>, value: unknown, may?: string): T {
  const result = Schema.decodeUnknownResult(schema)(value);
  if (Result.isSuccess(result)) return result.success;
  throw new UnreadAnswer(route, unreadWords(route, value, result.failure.issue, may));
}

/**
 * Reads `path` from the api and decodes its JSON with `schema`: resolves with what the board reads, every key it does not know dropped;
 * rejects with a `ReadRefusal` where the api refused the read, and with an `UnreadAnswer` where its answer does not decode.
 */
export async function get<T>(path: string, schema: Schema.Decoder<T>, init?: RequestInit): Promise<T> {
  const route = `GET ${path}`;
  const value = await answer(route, path, init, (words, status) => new ReadRefusal(words, status));
  return decoded(route, schema, value);
}

/**
 * How a write is sent: `body`, sent as JSON, left out for a write that sends none; `may`, a sentence saying what the write may have done
 * and what to look at before sending it again, which an answer the board does not read says; and `refused`, what a refusal of the api's is
 * built as — a `WriteRefusal` where it is left out.
 */
export type SendHow = { body?: unknown; may: string; refused?: Refuse };

/**
 * Sends a write to `path` by `method`, as `application/json`, which the api requires of every write, and decodes the JSON it answers with
 * `schema`: resolves with what the board reads, every key it does not know dropped; rejects with what `how.refused` builds, or a
 * `WriteRefusal`, where the api refused the write, and with an `UnreadAnswer` — never a refusal: the write may be done — where its answer
 * does not decode.
 */
export async function send<T>(method: 'POST' | 'PUT' | 'DELETE', path: string, schema: Schema.Decoder<T>, how: SendHow): Promise<T> {
  const route = `${method} ${path}`;
  const init: RequestInit = {
    method,
    headers: { 'content-type': 'application/json' },
    ...(how.body === undefined ? {} : { body: JSON.stringify(how.body) }),
  };
  const value = await answer(route, path, init, how.refused ?? ((words, status) => new WriteRefusal(words, status)));
  return decoded(route, schema, value, how.may);
}
