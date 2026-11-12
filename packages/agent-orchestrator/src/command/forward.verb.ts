/**
 * The command line forwarded to another machine's api: where `NEMIA_SERVER` names a daemon (set by the client, `apps/cli`, under a context
 * naming a remote one), the CLI still parses, checks and prints as it does on the store here, and at the one point where it would call an
 * entry's handler it calls the endpoint the entry links (`served`) instead, through `objects`' `Api` made into a typed client
 * (`HttpApiClient`), presenting `NEMIA_SERVER_TOKEN` as its bearer. The answer is the endpoint's success, decoded by its Schema, made into
 * what the entry prints by the link's `answer` where it has one; a refusal is the package's of the same kind, in the api's words, so a
 * forwarded command exits as one run here does. Nothing of `apps/api` is imported: this is a client of another machine's api, through
 * `objects` alone.
 */
import { Cause, Effect, Exit, Option, type Schema } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientError, HttpClientRequest } from 'effect/http';
import { HttpApiClient } from 'effect/http-api';
import {
  Api,
  BadRequest,
  Conflict as ConflictAnswer,
  DEFAULT_NAMESPACE,
  endpointKeysOf,
  type EndpointKeys,
  keysOfEndpoint,
  Forbidden as ForbiddenAnswer,
  Invalid as InvalidAnswer,
  Missing as MissingAnswer,
  PROPOSAL_REFUSALS,
  type ProposalRefusal,
  Unauthorized,
} from 'objects';
import type { Env } from '../config/config.store.ts';
import { Conflict, Forbidden, Invalid, Missing, type Refusal } from '../refusal/refusal.ts';
import type { CommandSpec, EndpointLink } from './command.ts';

/** The daemon a forwarded command line asks: its api's address, and the token it presents there, where one is set. */
export type Forwarded = { readonly server: string; readonly token: string | undefined };

/** Where `env` forwards the command line (`NEMIA_SERVER`, `NEMIA_SERVER_TOKEN`): none where `NEMIA_SERVER` is unset or empty. */
export const forwardedOf = (env: Env): Forwarded | undefined => {
  const server = env.NEMIA_SERVER?.trim();
  if (server === undefined || server === '') return undefined;
  const token = env.NEMIA_SERVER_TOKEN?.trim();
  return { server: server.replace(/\/+$/, ''), token: token === undefined || token === '' ? undefined : token };
};

/** What a forwarded call reads of an entry: its name, for a refusal, and its links. */
export type Linked = Pick<CommandSpec, 'name' | 'served'>;

/** The link `input` calls of `links`: the first whose `takes` holds, else the last. */
export const linkOf = (links: readonly [EndpointLink, ...EndpointLink[]], input: Readonly<Record<string, unknown>>): EndpointLink =>
  links.find((link) => link.takes?.(input) === true) ?? links[links.length - 1] ?? links[0];

/** A call's parts, as the typed client takes them: its path's keys, its query's and its payload's. */
export type CallParts = {
  readonly params: Readonly<Record<string, unknown>>;
  readonly query: Readonly<Record<string, unknown>>;
  readonly payload: Readonly<Record<string, unknown>>;
};

/**
 * `request` split by where `keys` says its endpoint takes each key: a key of the path into `params`, of the query into `query` — the link's
 * `defaults` where the request gives none — and of the payload into `payload`; a key the endpoint takes nowhere is not sent, and an
 * undefined value is left out.
 */
export function partsOf(
  keys: EndpointKeys,
  request: Readonly<Record<string, unknown>>,
  defaults: Readonly<Record<string, string>> = {},
): CallParts {
  const pick = (names: readonly string[]) =>
    Object.fromEntries(names.flatMap((k) => (request[k] === undefined ? [] : [[k, request[k]] as const])));
  return {
    params: pick(keys.pathKeys),
    query: { ...Object.fromEntries(Object.entries(defaults).filter(([k]) => keys.queryKeys.includes(k))), ...pick(keys.queryKeys) },
    payload: pick(keys.payloadKeys),
  };
}

/** The typed client of the `Api` at `forwarded`'s server, each request presenting its token as its bearer where it has one. */
const clientOf = (forwarded: Forwarded) =>
  HttpApiClient.make(Api, {
    baseUrl: forwarded.server,
    transformClient: forwarded.token === undefined ? undefined : HttpClient.mapRequest(HttpClientRequest.bearerToken(forwarded.token)),
  });

/** The typed client, as a forwarded call reads it: each group's endpoints by name, a call taking its parts. */
type Calls = Readonly<Record<string, Readonly<Record<string, (parts: CallParts) => Effect.Effect<unknown, unknown>>>>>;

/**
 * Where a namespaced object is read across namespaces, by the group of the endpoint that acts on it: a run and a card are each in the
 * namespace of their factory, which the command line does not say, so it is read before the call.
 */
const ACROSS: Readonly<Record<string, { readonly group: string; readonly endpoint: string }>> = {
  runs: { group: 'runs', endpoint: 'show' },
  cards: { group: 'cards', endpoint: 'getAll' },
};

/** The namespace an object answered names, `default` where it names none. */
const namespaceIn = (answer: unknown): string => {
  const meta = (answer as { metadata?: { namespace?: unknown } } | null)?.metadata;
  return typeof meta?.namespace === 'string' ? meta.namespace : DEFAULT_NAMESPACE;
};

/**
 * The namespace a call of `endpoint` is made in, where its path takes one and `request` names none: the namespace of the run or card it
 * names (`ACROSS`), read of the api; else the factory the request names; else `default`.
 */
const namespaceFor = (
  calls: Calls,
  endpoint: string,
  keys: EndpointKeys,
  request: Readonly<Record<string, unknown>>,
): Effect.Effect<Readonly<Record<string, unknown>>, unknown> => {
  if (!keys.pathKeys.includes('namespace') || typeof request.namespace === 'string') return Effect.succeed(request);
  const group = endpoint.slice(0, endpoint.indexOf('.'));
  const across = ACROSS[group];
  const name = request.name;
  if (across !== undefined && typeof name === 'string' && !(group === 'cards' && endpoint === 'cards.create')) {
    const read = calls[across.group]?.[across.endpoint];
    if (read !== undefined)
      return read({ params: { name }, query: {}, payload: {} }).pipe(
        Effect.map((found) => ({ ...request, namespace: namespaceIn(found) })),
      );
  }
  const factory = typeof request.factory === 'string' && request.factory !== '' ? request.factory : DEFAULT_NAMESPACE;
  return Effect.succeed({ ...request, namespace: factory });
};

/**
 * `reason`, where it is one of the reasons the package's `Forbidden` carries; else `person-only`, the reason of a write the person alone
 * makes.
 */
const proposalReason = (reason: unknown): ProposalRefusal =>
  (PROPOSAL_REFUSALS as readonly unknown[]).includes(reason) ? (reason as ProposalRefusal) : 'person-only';

/**
 * The refusal of the package's an answered status is, by the api's one map read backwards: 400 and 422 `Invalid`, 401 and 403
 * `Forbidden`, 404 `Missing`, 409 `Conflict`; none for any other.
 */
export const refusalOfStatus = (status: number, message: string): Refusal | undefined => {
  if (status === 400 || status === 422) return new Invalid({ message });
  if (status === 401 || status === 403) return new Forbidden({ message, reason: 'person-only' });
  if (status === 404) return new Missing({ message });
  if (status === 409) return new Conflict({ message });
  return undefined;
};

/** One of the `Api`'s refusals as the package's refusal of its kind, in the api's words; none for anything else. */
function refusalOfAnswer(failed: unknown): Refusal | undefined {
  if (failed instanceof MissingAnswer) return new Missing({ message: failed.error });
  if (failed instanceof ConflictAnswer)
    return new Conflict({ message: failed.error, ...(failed.users === undefined ? {} : { users: failed.users }) });
  if (failed instanceof InvalidAnswer || failed instanceof BadRequest) return new Invalid({ message: failed.error });
  if (failed instanceof ForbiddenAnswer) return new Forbidden({ message: failed.error, reason: proposalReason(failed.reason) });
  if (failed instanceof Unauthorized) return new Forbidden({ message: failed.error, reason: 'person-only' });
  return undefined;
}

/** A client's error of a forwarded call: a daemon not reached, naming the fix; else a status the `Api` does not declare, by its kind. */
function clientFailure(failed: HttpClientError.HttpClientError, forwarded: Forwarded, verb: string): Refusal | Error {
  const { reason } = failed;
  if (reason._tag === 'TransportError')
    return new Error(
      `nemia ${verb} could not reach the daemon at ${forwarded.server} (NEMIA_SERVER): see the context it is forwarded under with \`nemia config\`, or run it on this machine's store with NEMIA_CONTEXT=local.`,
    );
  const status = 'response' in reason ? reason.response.status : undefined;
  const said = `the daemon at ${forwarded.server} answered ${status ?? 'nothing'} to nemia ${verb}, which this nemia does not read: see that it is of this release (\`nemia version\` on both machines)`;
  return (status === undefined ? undefined : refusalOfStatus(status, said)) ?? new Error(said);
}

/** What a forwarded call failed with, as the command line throws it: a refusal of the package's kind, or an `Error` naming the fix. */
function thrownOf(failed: unknown, forwarded: Forwarded, verb: string): Refusal | Error {
  const refused = refusalOfAnswer(failed);
  if (refused !== undefined) return refused;
  if (HttpClientError.isHttpClientError(failed)) return clientFailure(failed, forwarded, verb);
  const error = (failed as { error?: unknown } | null)?.error;
  if (typeof error === 'string') return new Error(error);
  return new Error(
    `the daemon at ${forwarded.server} answered nemia ${verb} in a shape this nemia does not read (${failed instanceof Error ? failed.message : String(failed)}): see that both are of one release (\`nemia version\` on both machines).`,
  );
}

/**
 * The entry `entry` called on the api `forwarded` names, with `input`, its decoded input: the link it calls (`linkOf`), the request made of
 * the input (its `request`, else the input itself), split into the endpoint's path, query and payload (`partsOf`, by `endpointKeysOf`), in
 * the namespace of what it names (`namespaceFor`); the endpoint's success decoded by its Schema, then made into what the entry prints by
 * the link's `answer` where it has one. Refused, `Invalid`, for an entry no endpoint serves; a refusal the api answers is the package's
 * of its kind, and a daemon not reached an `Error` naming `nemia config` and `NEMIA_CONTEXT=local`.
 */
export const forwardedCall = Effect.fn('forwardedCall')(function* (
  forwarded: Forwarded,
  entry: Linked,
  input: Readonly<Record<string, unknown>>,
) {
  if (entry.served === undefined) return yield* Effect.fail(unlinked(entry.name));
  const link = linkOf(entry.served, input);
  const request = link.request === undefined ? input : yield* link.request(input);
  const keys = endpointKeysOf(Api, link.endpoint);
  const [group = '', endpoint = ''] = link.endpoint.split('.');
  const answer = yield* clientOf(forwarded).pipe(
    Effect.flatMap((client) => {
      const calls = client as unknown as Calls;
      const call = calls[group]?.[endpoint];
      if (call === undefined)
        return Effect.die(new Error(`${link.endpoint} is no endpoint of the typed client: name one objects' Api declares`));
      return namespaceFor(calls, link.endpoint, keys, request).pipe(Effect.flatMap((placed) => call(partsOf(keys, placed, link.query))));
    }),
    Effect.provide(FetchHttpClient.layer),
    Effect.mapError((failed) => thrownOf(failed, forwarded, entry.name)),
  );
  return link.answer === undefined ? answer : link.answer(answer, input);
});

/** The refusal of a verb no endpoint serves, run forwarded: it runs only where its store is. */
export const unlinked = (verb: string): Invalid =>
  new Invalid({
    message: `nemia ${verb} is served by no endpoint of the api, so it runs only on the daemon's machine: run it there, or on this machine's store with NEMIA_CONTEXT=local.`,
  });

/** `program` run to its value, or its failure thrown as it is: how the command line awaits a forwarded call. */
export async function forwardedAnswer<A, E>(program: Effect.Effect<A, E>): Promise<A> {
  const exit = await Effect.runPromiseExit(program);
  if (Exit.isSuccess(exit)) return exit.value;
  throw Option.getOrUndefined(Cause.findErrorOption(exit.cause)) ?? Cause.squash(exit.cause);
}

/** The keys of `input`, an entry's input Schema: read as objects reads an endpoint's path, by its JSON Schema. */
const inputKeysOf = (input: Schema.Top): readonly string[] =>
  keysOfEndpoint({ identifier: '', method: 'GET', path: '', params: input, query: undefined, payload: new Map(), success: new Set() })
    .pathKeys;

/** A key of an entry's input that the endpoint a link of it calls takes nowhere: the endpoint, and the keys. */
export type Unsent = { readonly entry: string; readonly endpoint: string; readonly keys: readonly string[] };

/**
 * Each link of `entry` that would send its input as it is (no `request`) and whose endpoint takes some key of that input nowhere — in its
 * path, its query or its payload — with those keys: what a forwarded call of it would drop, as an input that says `runId` dropped by an
 * endpoint whose path says `name`. None for an entry with no `input` Schema, whose input is the command line's `Args`.
 */
export function unsentOf(entry: Linked & { readonly input?: unknown }): Unsent[] {
  if (entry.served === undefined || entry.input === undefined) return [];
  const keys = inputKeysOf(entry.input as Schema.Top);
  return entry.served.flatMap((link) => {
    if (link.request !== undefined) return [];
    const at = endpointKeysOf(Api, link.endpoint);
    const taken = [...at.pathKeys, ...at.queryKeys, ...at.payloadKeys];
    const unsent = keys.filter((k) => !taken.includes(k));
    return unsent.length ? [{ entry: entry.name, endpoint: link.endpoint, keys: unsent }] : [];
  });
}
