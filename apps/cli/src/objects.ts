/**
 * The client of the objects: `objects`' `Api` made into a typed client (`HttpApiClient.make`) over the url of the daemon serving this
 * store, found by its lease (`where.ts`) and started on demand where none serves (`daemon.ts`), as every GET of `client.ts` finds it. A
 * read asks it through `asked`, which answers the decoded object, or throws a `Refused` the bin prints and exits with.
 *
 * A refused connection starts a daemon once and asks again. A refusal of the `Api`'s (`Missing`, `Conflict`, `Invalid`, `Unjudged`,
 * `Forbidden`, `Unauthorized`) is the api's own words, exit 2. Every request carries the session's token where `WF_SESSION_TOKEN` holds
 * one (`sessionHeaders`). A 404 whose body is no refusal is a daemon older than this client, refused naming the restart; an answer that
 * does not decode as the `Api` says is one too, the daemon and this client being of two builds. A read the api takes and does not answer
 * within `READ_BOUND_MS` gives up, refused naming the service's status and the read in process: it starts no daemon, since one holds
 * the port and took the request.
 */
import { Cause, Duration, Effect, Exit, Option } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientError, HttpClientRequest } from 'effect/http';
import { HttpApiClient } from 'effect/http-api';
import { Api, type APIResource, Conflict, Forbidden, Invalid, Missing, Unauthorized, Unjudged } from 'objects';
import { olderThanThis, Refused, served, sessionHeaders, unanswered } from './client.ts';
import { daemonStarted } from './daemon.ts';
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

/** The typed client of the `Api` at `base`, each request carrying the session's token where `env` holds one (`sessionHeaders`). */
const clientAt = (base: string, env: NodeJS.ProcessEnv = process.env) =>
  HttpApiClient.make(Api, {
    baseUrl: base,
    transformClient: HttpClient.mapRequest(HttpClientRequest.setHeaders(sessionHeaders(env))),
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

/** Whether `exit` failed before the api answered at all: no connection. */
const unreached = <A, E>(exit: Exit.Exit<A, E>): boolean => {
  const failed = failureOf(exit);
  return HttpClientError.isHttpClientError(failed) && failed.reason._tag === 'TransportError';
};

/** The path of the request a client error is about, as a line names it. */
const pathOf = (err: HttpClientError.HttpClientError): string => {
  try {
    return new URL(err.reason.request.url).pathname;
  } catch {
    return err.reason.request.url;
  }
};

/** `call` asked of the client at `base`, run to its end or until `boundMs` is gone, when it is interrupted and fails with a timeout. */
const attempt = <A, E>(base: string, call: (client: ObjectsClient) => Effect.Effect<A, E>, boundMs: number, env: NodeJS.ProcessEnv) =>
  Effect.runPromiseExit(
    Effect.flatMap(clientAt(base, env), call).pipe(Effect.timeout(Duration.millis(boundMs)), Effect.provide(FetchHttpClient.layer)),
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
 * What `call` answers of the objects' client, for the read `verb` names, in a process whose environment is `env`: on the daemon its lease
 * names, else one started now; on one started again where the first takes no connection. Each attempt has `boundMs` to answer.
 */
export async function asked<A, E>(
  verb: string,
  call: (client: ObjectsClient) => Effect.Effect<A, E>,
  env: NodeJS.ProcessEnv = process.env,
  boundMs: number = READ_BOUND_MS,
): Promise<A> {
  let base = await served(verb, env);
  let exit = await attempt(base, call, boundMs, env);
  if (unreached(exit)) {
    base = await daemonStarted(verb, env);
    exit = await attempt(base, call, boundMs, env);
  }
  return answerOf(exit, verb, base, boundMs);
}

/** The factories the api lists (`FactoryList`, `GET /api/factories`), the default first on its own repository, for the read `verb`. */
export const factoriesListed = (verb: string, env: NodeJS.ProcessEnv = process.env) =>
  asked(verb, (client) => client.factories.listAll({ query: {} }), env);

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
