/**
 * The client of the objects: `objects`' `Api` made into a typed client (`HttpApiClient.make`) over the url of the daemon serving this
 * store, found by its lease (`where.ts`) and, where none listens there, started once and waited for until it is ready (`daemon.ts`). A
 * read asks it once through `asked`, which answers the decoded object, or throws a `Refused` the bin prints and exits with.
 *
 * A refusal of the `Api`'s (`Missing`, `Conflict`, `Invalid`, `Unjudged`,
 * `Forbidden`, `Unauthorized`) is the api's own words, exit 2. Every request carries the session's token where `WF_SESSION_TOKEN` holds
 * one (`sessionHeaders`). A 404 whose body is no refusal is a daemon older than this client, refused naming the restart; an answer that
 * does not decode as the `Api` says is one too, the daemon and this client being of two builds. A read the api takes and does not answer
 * within `READ_BOUND_MS` gives up, refused naming the service's status and the read in process: it starts no daemon, since one holds
 * the port and took the request.
 */
import { Cause, Duration, Effect, Exit, Option } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientError, HttpClientRequest } from 'effect/http';
import { HttpApiClient } from 'effect/http-api';
import {
  Api,
  type APIResource,
  Conflict,
  Forbidden,
  Invalid,
  jsonBodied,
  LIST_PAGE,
  Missing,
  type Table,
  Unauthorized,
  Unjudged,
} from 'objects';
import { olderThanThis, Refused, sessionHeaders, unanswered } from './client.ts';
import { served } from './daemon.ts';
import { resourceNamed } from './objects/resource.ts';
import { CLIENT_VERBS } from './route.ts';

/** The way to read in process, for a verb that has one: the client's own verbs have none (`noLocal`). */
const localWay = (verb: string): string =>
  (CLIENT_VERBS as readonly string[]).includes(verb.split(' ')[0] ?? verb) ? '' : `, or read in process: \`nemia ${verb} … --local\``;

/**
 * How long a moved read waits on the api before it gives up: the whole call, from the request to the decoded answer. Thirty seconds, some
 * twenty times the coldest read the cli asks on the measured store (the run list, 1.3 s on 100 runs; a run's page, 0.9 s:
 * `tools/store-measure/baselines/s2-vs-s1.txt`), so a store ten times as large on a loaded machine still answers, while a person at
 * the terminal is told within half a minute that an api which took the connection is not answering.
 */
export const READ_BOUND_MS = 30_000;

/**
 * The typed client of the `Api` at `base`: each write with no body sent as `{}` in JSON (`jsonBodied`), as the api's write guard takes
 * it, and each request carrying the session's token where `env` holds one and `carried` is left on (`sessionHeaders`; a pairing turns it
 * off, since it asks for a token of its own) and `headers` beside it (an `Accept` that
 * asks a list for its `Table`).
 */
export const clientAt = (
  base: string,
  env: NodeJS.ProcessEnv = process.env,
  headers: Readonly<Record<string, string>> = {},
  carried = true,
) =>
  HttpApiClient.make(Api, {
    baseUrl: base,
    transformClient: (client) =>
      HttpClient.mapRequest(
        HttpClient.mapRequest(client, jsonBodied),
        HttpClientRequest.setHeaders({ ...(carried ? sessionHeaders(env) : {}), ...headers }),
      ),
  });

/** What a read asks of: every group of the `Api`, each endpoint a method. */
export type ObjectsClient = Effect.Success<ReturnType<typeof clientAt>>;

/**
 * The `Api`'s refusals, whose `error` is the api's sentence naming the fix: a caller refused (`Forbidden`, 403) or a token the api does
 * not take (`Unauthorized`, 401) among them, said and exited with as every other.
 */
const isRefusal = (err: unknown): err is Missing | Conflict | Invalid | Unjudged | Forbidden | Unauthorized =>
  err instanceof Missing ||
  err instanceof Conflict ||
  err instanceof Invalid ||
  err instanceof Unjudged ||
  err instanceof Forbidden ||
  err instanceof Unauthorized;

/** The first failure of `exit`, if it failed with one. */
const failureOf = <A, E>(exit: Exit.Exit<A, E>): E | undefined =>
  Exit.isFailure(exit) ? Option.getOrUndefined(Cause.findErrorOption(exit.cause)) : undefined;

/** The path of the request a client error is about, as a line names it. */
const pathOf = (err: HttpClientError.HttpClientError): string => {
  try {
    return new URL(err.reason.request.url).pathname;
  } catch {
    return err.reason.request.url;
  }
};

/** `call` asked of the client at `base`, run to its end or until `boundMs` is gone, when it is interrupted and fails with a timeout. */
const attempt = <A, E>(
  base: string,
  call: (client: ObjectsClient) => Effect.Effect<A, E>,
  boundMs: number,
  env: NodeJS.ProcessEnv,
  headers: Readonly<Record<string, string>>,
  carried = true,
) =>
  Effect.runPromiseExit(
    Effect.flatMap(clientAt(base, env, headers, carried), call).pipe(
      Effect.timeout(Duration.millis(boundMs)),
      Effect.provide(FetchHttpClient.layer),
    ),
  );

/** A daemon that took the read and did not answer it within `boundMs`: refused, naming its status and the read in process. */
const notInTime = (verb: string, base: string, boundMs: number): Refused =>
  new Refused(
    `the daemon at ${base} did not answer \`nemia ${verb}\` within ${boundMs / 1000} s. See whether it is up, \`nemia service status\`${localWay(verb)}`,
  );

/**
 * The answer of `exit`, or the refusal it is as a person reads it, for the read `verb` names, of the daemon at `base`, which had `boundMs`
 * to answer.
 */
function answerOf<A, E>(exit: Exit.Exit<A, E>, verb: string, base: string, boundMs: number): A {
  if (Exit.isSuccess(exit)) return exit.value;
  const failed = failureOf(exit);
  if (failed === undefined) throw Cause.squash(exit.cause);
  if (Cause.isTimeoutError(failed)) throw notInTime(verb, base, boundMs);
  if (isRefusal(failed)) return thrown(failed.error);
  if (HttpClientError.isHttpClientError(failed)) {
    const { reason } = failed;
    const status = 'response' in reason ? reason.response.status : undefined;
    if (status === 404) throw olderThanThis(verb, base, pathOf(failed));
    if (reason._tag === 'TransportError') throw unanswered(verb, base, failed);
    throw new Refused(
      `the daemon at ${base} answered ${status ?? 'nothing'} to ${pathOf(failed)}, which this nemia does not read: restart it, \`nemia service restart\`${localWay(verb)}`,
    );
  }
  throw new Refused(
    `the daemon at ${base} answered in a shape this nemia does not read (${failed instanceof Error ? failed.message : String(failed)}): restart it, \`nemia service restart\`${localWay(verb)}`,
  );
}

/** A refusal in the api's own words. */
const thrown = (said: string): never => {
  throw new Refused(said);
};

/**
 * What `call` answers of the objects' client, for the read `verb` names, in a process whose environment is `env`: asked once, of the
 * daemon `served` made ready, within `boundMs`, each request carrying `headers`.
 */
export async function asked<A, E>(
  verb: string,
  call: (client: ObjectsClient) => Effect.Effect<A, E>,
  env: NodeJS.ProcessEnv = process.env,
  boundMs: number = READ_BOUND_MS,
  headers: Readonly<Record<string, string>> = {},
): Promise<A> {
  const base = await served(verb, env);
  return answerOf(await attempt(base, call, boundMs, env, headers), verb, base, boundMs);
}

/**
 * What `call` answers of the objects' client at `base`, a server no context names yet (`nemia pair <url>`), for the verb `verb` names:
 * asked once, within `boundMs`, carrying no token at all, since the token of the context in use is another server's and is never sent
 * to this one. Refused as `asked` refuses.
 */
export async function askedBare<A, E>(
  verb: string,
  base: string,
  call: (client: ObjectsClient) => Effect.Effect<A, E>,
  boundMs: number = READ_BOUND_MS,
): Promise<A> {
  return answerOf(await attempt(base, call, boundMs, {}, {}, false), verb, base, boundMs);
}

/**
 * A list's page, of a list that answers a `Table` only where asked for one (`TABLE_ACCEPT`), which a read of its objects never asks: a
 * `Table` all the same is an api this client does not read, said as such.
 */
export const pageOf = <L extends { readonly items: readonly unknown[] }, E>(
  listed: Effect.Effect<L | Table, E>,
): Effect.Effect<L, E | Error> =>
  Effect.flatMap(listed, (list) =>
    'items' in list
      ? Effect.succeed(list)
      : Effect.fail(new Error('the api answered a Table to a list asked for its objects: restart it, `nemia service restart`')),
  );

/** The page of a list asked: `limit`, and past the first page the `continue` the page before answered, sent back as it is. */
export type PageAsked = { readonly limit: string; readonly continue?: string };

/** A page of a list as the api answers one: its objects (`items`) or its `Table`'s rows, and where the page stands. */
type Paged = { readonly metadata: { readonly continue?: string } } & (
  | { readonly items: readonly unknown[] }
  | { readonly rows: readonly unknown[] }
);

/** The pages of one list read as one: the first page's shape, every page's objects or rows in order, the last page's metadata. */
const joined = <P extends Paged>(first: P, pages: readonly P[]): P => {
  const { metadata } = pages.at(-1) ?? first;
  return 'rows' in first
    ? Object.assign({}, first, { metadata, rows: pages.flatMap((page) => ('rows' in page ? page.rows : [])) })
    : Object.assign({}, first, { metadata, items: pages.flatMap((page) => ('items' in page ? page.items : [])) });
};

/**
 * Every page of a list, read as one, for a client that prints the list whole: `ask` asked for a page of `LIST_PAGE.most` and again with
 * the `continue` each page answers, until a page answers none (the api answers a page of `LIST_PAGE.byDefault` to a list asked with no
 * `limit`, and `continue` on every page but the last). A page that answers back the `continue` it was asked with is an api that would
 * be asked forever, refused naming the restart.
 */
export const everyPage = <P extends Paged, E>(ask: (page: PageAsked) => Effect.Effect<P, E>): Effect.Effect<P, E | Error> =>
  Effect.gen(function* () {
    const limit = String(LIST_PAGE.most);
    const first = yield* ask({ limit });
    const pages = [first];
    let sent: string | undefined;
    let next = first.metadata.continue;
    while (next !== undefined && next !== '') {
      if (next === sent)
        return yield* Effect.fail(
          new Error('the api answered a page the same `continue` it was asked with: restart it, `nemia service restart`'),
        );
      sent = next;
      const page = yield* ask({ limit, continue: next });
      pages.push(page);
      next = page.metadata.continue;
    }
    return joined(first, pages);
  });

/**
 * The factories the api lists (`FactoryList`, `GET /api/factories`), every page, the default first on its own repository, for the read
 * `verb`.
 */
export const factoriesListed = (verb: string, env: NodeJS.ProcessEnv = process.env) =>
  asked(verb, (client) => pageOf(everyPage((page) => client.factories.listAll({ query: page }))), env);

/** Every resource the api serves (`GET /api`), for the verb `verb` names: what `get`, `apply` and `explain` resolve a word against. */
export const discovered = async (verb: string, env: NodeJS.ProcessEnv = process.env): Promise<readonly APIResource[]> =>
  (await asked(verb, (client) => client.discovery.resources(), env)).resources;

/** The kinds' own resources of `resources`, by their plurals: what a refusal names. */
const servedNames = (resources: readonly APIResource[]): string =>
  resources
    .filter((r) => !r.name.includes('/'))
    .map((r) => r.name)
    .join(', ');

/**
 * The resource `word` names among `resources`, in any case, for the verb `verb` names (`resourceNamed`); refused, naming the resources
 * there are and the command that explains one, where it names none.
 */
export function resourceFor(verb: string, resources: readonly APIResource[], word: string): APIResource {
  const named = resourceNamed(resources, word.toLowerCase());
  if (!('refused' in named)) return named;
  throw new Refused(
    `nemia ${verb}: the api serves no resource named "${word}". It serves ${servedNames(resources)}: see one with \`nemia explain <resource>\``,
  );
}

/** `--local` typed to a verb of the client's own, which no process answers: refused, naming how to see the daemon that serves it. */
export const noLocal = (verb: string): Refused =>
  new Refused(
    `nemia ${verb} asks the api alone, and has no --local: type it again without --local, and see the daemon that serves this store with \`nemia service status\``,
  );
