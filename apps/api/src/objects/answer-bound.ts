/**
 * The bound on every answer a read of the `Api` builds: no request makes the daemon encode an answer it cannot hold. HttpApi encodes a
 * handler's success inside the endpoint's own effect (`HttpApiBuilder`'s route of it), after the handler and before any middleware
 * sees a response, so the bound is measured on the success value itself, by its handler (`readHandled`), before it is encoded: its JSON's
 * length counted as `JSON.stringify` would write it, the string never built, the walk stopped as soon as it is past (`jsonLengthPast`).
 * An answer past the bound dies of `AnswerPastBound`, which the mount answers as a 422 naming the read's narrowing keys (`READS`), so a
 * client is told how to ask a smaller answer rather than handed a larger one. The bound is the app's (`AnswerBound`, `ANSWER_MOST` by
 * default, layer.ts), so a test shortens it.
 *
 * And the floor of an agent's standing token, run where the endpoint a request reaches is first known (`floorHandled`): before every
 * endpoint's handler, writes included, a request an agent's token reaches past its floor is refused 403.
 */
import { Effect } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/http';
import { HttpApiBuilder } from 'effect/http-api';
import { tokenFloor } from 'agent-orchestrator';
import { Api, type ApiGetName, Forbidden, READS } from 'objects';
import { floorEntryOf, floorWords } from '../caller/index.ts';
import { answered, type ApiError, bodyOf, ServedNow, statusOf } from './refused.ts';

/** The JSON length of `text` as a JSON string: its quotes, and each character as `JSON.stringify` escapes it. */
const stringLength = (text: string): number => {
  let length = 2;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 0x22 || code === 0x5c || code === 0x08 || code === 0x0c || code === 0x0a || code === 0x0d || code === 0x09) length += 2;
    else if (code < 0x20) length += 6;
    else if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        length += 2;
        i++;
      } else length += 6;
    } else if (code >= 0xdc00 && code <= 0xdfff) length += 6;
    else length += 1;
  }
  return length;
};

/** Whether `value` is one `JSON.stringify` leaves out of an object, and writes `null` for in an array. */
const unwritten = (value: unknown): boolean => value === undefined || typeof value === 'function' || typeof value === 'symbol';

/** `value` as `JSON.stringify` writes it under `key`: what its `toJSON` answers, a boxed primitive unboxed. */
const asWritten = (key: string, value: unknown): unknown => {
  const told =
    typeof value === 'object' && value !== null && typeof (value as { toJSON?: unknown }).toJSON === 'function'
      ? (value as { toJSON: (key: string) => unknown }).toJSON(key)
      : value;
  return told instanceof Number || told instanceof String || told instanceof Boolean ? told.valueOf() : told;
};

/** The JSON length of a value that holds no other: `null`, a boolean, a number (`null` where it is not finite), a string. */
const scalarLength = (value: unknown): number => {
  if (typeof value === 'string') return stringLength(value);
  if (typeof value === 'number') return Number.isFinite(value) ? String(value).length : 4;
  if (typeof value === 'bigint') throw new TypeError('Do not know how to serialize a BigInt');
  return value === false ? 5 : 4;
};

/** A walk of a value's JSON, its length so far in `total`, stopped once it is past `most`. */
type Walk = { total: number; readonly most: number };

/** Adds the JSON length of `raw`, read under `key`, to the walk; whether it is past its most. */
const walked = (walk: Walk, key: string, raw: unknown): boolean => {
  const value = asWritten(key, raw);
  if (typeof value !== 'object' || value === null) walk.total += scalarLength(value);
  else if (Array.isArray(value)) return itemsWalked(walk, value);
  else return keysWalked(walk, value);
  return walk.total > walk.most;
};

/** Adds the JSON length of the array `items` to the walk, each item in turn; whether it is past its most. */
const itemsWalked = (walk: Walk, items: readonly unknown[]): boolean => {
  walk.total += 2 + Math.max(0, items.length - 1);
  for (const [i, item] of items.entries()) {
    if (walk.total > walk.most) return true;
    if (unwritten(item)) walk.total += 4;
    else if (walked(walk, String(i), item)) return true;
  }
  return walk.total > walk.most;
};

/** Adds the JSON length of the object `value` to the walk, each key it writes in turn; whether it is past its most. */
const keysWalked = (walk: Walk, value: object): boolean => {
  walk.total += 2;
  let written = 0;
  for (const [name, item] of Object.entries(value)) {
    if (walk.total > walk.most) return true;
    if (unwritten(item)) continue;
    walk.total += stringLength(name) + 1 + (written++ === 0 ? 0 : 1);
    if (walked(walk, name, item)) return true;
  }
  return walk.total > walk.most;
};

/**
 * The length of `value`'s JSON as `JSON.stringify(value)` writes it — strings escaped, a key whose value is `undefined`, a function or a
 * symbol left out, such a value in an array written `null`, a value's `toJSON` respected — counted without building the string, and
 * stopped as soon as it is past `most`: the exact length where it is at most `most`, and a length past `most` (where the walk stopped,
 * the rest unread) where it is not. 0 for a value `JSON.stringify` writes nothing of. Pure.
 */
export const jsonLengthPast = (value: unknown, most: number): number => {
  if (unwritten(value)) return 0;
  const walk: Walk = { total: 0, most };
  walked(walk, '', value);
  return walk.total;
};

/**
 * An answer past the bound, as a defect of the endpoint's effect: the mount answers it 422 with its `message` (`answerRefused`, serve.ts).
 * A defect rather than a failure, since no endpoint declares it and HttpApi would answer an undeclared failure a 500.
 */
export class AnswerPastBound extends Error {
  readonly endpoint: ApiGetName;
  constructor(endpoint: ApiGetName, most: number) {
    const { shape, narrow = [] } = READS[endpoint];
    const keys = narrow.map((key) => `\`${key}\``).join(', ');
    const how =
      narrow.length === 0
        ? 'it takes no key that narrows it: read its parts by their own endpoints'
        : shape === 'page'
          ? `ask it again with a smaller \`limit\`, reading on with the \`continue\` it answers, or narrowed by ${keys}`
          : `ask it again for less of it, by ${keys}`;
    super(`The answer to ${endpoint} is longer than the api answers (${most} characters of JSON): ${how}.`);
    this.name = 'AnswerPastBound';
    this.endpoint = endpoint;
  }
}

/**
 * `handler`, the handler of the GET endpoint `endpoint`, its success measured against the app's bound (`Served.answerMost`) before HttpApi
 * encodes it: past it, a defect of `AnswerPastBound`, answered 422. A read of bytes or a stream (`READS`' `bytes`, `stream`), and a
 * response the handler built itself, are answered as they are. Every GET handler of the `Api` is given through it by its group
 * (`readsBounded`), which `test/bounded.test.ts` holds.
 */
export const readHandled =
  <Args extends ReadonlyArray<unknown>, A, E, R>(
    endpoint: ApiGetName,
    handler: (...args: Args) => Effect.Effect<A, E, R>,
  ): ((...args: Args) => Effect.Effect<A, E, R | ServedNow>) =>
  (...args) => {
    const { shape } = READS[endpoint];
    if (shape === 'bytes' || shape === 'stream') return handler(...args);
    return Effect.gen(function* () {
      const answer = yield* handler(...args);
      if (HttpServerResponse.isHttpServerResponse(answer)) return answer;
      const { answerMost } = yield* ServedNow;
      if (jsonLengthPast(answer, answerMost) > answerMost) return yield* Effect.die(new AnswerPastBound(endpoint, answerMost));
      return answer;
    });
  };

/** The handlers of a group as `readsBounded` hands them on: their `handle` is all it changes. */
type Handling = {
  readonly handle: (name: string, handler: (...args: never[]) => Effect.Effect<unknown, unknown, unknown>, options?: unknown) => unknown;
};

/** The method of the endpoint `name` of the group `group` of `objects`' `Api`, or undefined where it has no such endpoint. */
const methodOf = (group: string, name: string): string | undefined =>
  (Api.groups as Readonly<Record<string, { readonly endpoints: Readonly<Record<string, { readonly method: string }>> }>>)[group]?.endpoints[
    name
  ]?.method;

/** Whether the endpoint `name` of the group `group` of `objects`' `Api` is a GET: a read, bounded. */
const isRead = (group: string, name: string): boolean => methodOf(group, name) === 'GET';

/** `value` as a record of its keys, or none where it is no object. */
const partsOf = (value: unknown): Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>) : {};

/**
 * `handler`, the handler of the endpoint `name` of the group `group`, judged first by the floor of an agent's standing token for a caller
 * that is an agent presenting one (`tokenFloor`, the package's), the command its endpoint serves read off the table (`floorEntryOf`): a
 * request past the floor answered 403, `Forbidden` with the floor's reason and words that name what the person does instead
 * (`floorWords`), and the handler never run. The person's tokens and a session's are never judged here: the handler runs as it is.
 */
export const floorHandled =
  <Args extends ReadonlyArray<unknown>, A, E, R>(
    group: string,
    name: string,
    handler: (...args: Args) => Effect.Effect<A, E, R>,
  ): ((
    ...args: Args
  ) => Effect.Effect<A | HttpServerResponse.HttpServerResponse, E | ApiError, R | ServedNow | HttpServerRequest.HttpServerRequest>) =>
  (...args) =>
    Effect.gen(function* () {
      const { caller } = yield* ServedNow;
      if (caller.kind !== 'agent' || !caller.token) return yield* handler(...args);
      const method = methodOf(group, name) ?? 'POST';
      const parts = partsOf(args[0]);
      const entry = floorEntryOf(`${group}.${name}`, method);
      const answer = yield* answered((s) =>
        s.inRequest(tokenFloor(caller, entry, { method, group, params: parts.params, query: parts.query, payload: parts.payload })),
      );
      if (answer === undefined || answer.decision === 'allow') return yield* handler(...args);
      const request = yield* HttpServerRequest.HttpServerRequest;
      const route = `${method} ${new URL(request.url, 'http://api').pathname}`;
      const namespace = partsOf(parts.params).namespace;
      const factory = typeof namespace === 'string' ? namespace : undefined;
      const refused = new Forbidden({ reason: answer.reason, error: floorWords(route, entry, caller, answer.reason, factory) });
      return HttpServerResponse.jsonUnsafe(bodyOf(refused), { status: statusOf(refused) });
    });

/**
 * `handlers`, the handlers of the group `group`, with each endpoint's handler judged first by the floor of an agent's standing token
 * (`floorHandled`), and each GET endpoint's given through `readHandled` as it is registered: every other key as it is.
 */
const boundedHandlers = <H>(group: string, handlers: H): H => {
  const target = handlers as H & Handling;
  const bounded: H = new Proxy(target, {
    get: (held, key, receiver) =>
      key !== 'handle'
        ? Reflect.get(held, key, receiver)
        : (name: string, handler: (...args: never[]) => Effect.Effect<unknown, unknown, unknown>, options?: unknown) => {
            const read = isRead(group, name) ? readHandled(`${group}.${name}` as ApiGetName, handler) : handler;
            held.handle(name, floorHandled(group, name, read), options);
            return bounded;
          },
  });
  return bounded;
};

/**
 * `HttpApiBuilder.group`, every endpoint's handler of the group judged first by the floor of an agent's standing token (`floorHandled`)
 * and every GET endpoint's given through `readHandled`, so no read the group serves answers past the app's bound: what every group of the
 * `Api` is built with (serve.ts' groups; `test/bounded.test.ts` names any read that answers past it).
 */
export const readsBounded: typeof HttpApiBuilder.group = (api, group, build) =>
  HttpApiBuilder.group(api, group, (handlers) => build(boundedHandlers(group, handlers)));
