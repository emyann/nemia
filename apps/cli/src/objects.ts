/**
 * The client of the objects: `objects`' `Api` made into its one typed client (`apiClient`) over the url of the daemon serving this
 * store, found by its lease (`where.ts`) and, where none listens there, started once and waited for until it is ready (`daemon.ts`). A
 * read asks it once through `asked`, which answers the decoded object, or throws a `Refused` the bin prints and exits with.
 *
 * A refusal of the `Api`'s, any object of its error shape (`{ error }`: `Missing`, `Invalid`, `Failed`, …), is the api's own words,
 * exit 2, but a `Conflict`, a stale version, exit 1. Every request carries the token this client calls with (`callerToken`). A 404 whose
 * body is no refusal is a daemon older than this client, refused naming the restart; another status the `Api` declares no
 * error for is said in the api's words where it gave some (`Answered`); an answer that does not decode as the `Api` says is one too,
 * the daemon and this client being of two builds, exit 2, naming both releases as known and `nemia version` (`undecoded`): a release
 * check that let the call through as `unsaid` leaves the decode to guard what is read back. A call the api takes and does not answer
 * within `READ_BOUND_MS` gives up, refused naming the service's status and its restart: it starts no daemon, since one holds the port
 * and took the request.
 */
import { Cause, Effect, Exit, Option } from 'effect';
import { FetchHttpClient, HttpClientError } from 'effect/http';
import { Answered, apiClient, type ApiClient, type APIResource, Conflict, LIST_PAGE, READ_BOUND_MS, type Table, timedOut } from 'objects';
import { callerToken, olderThanThis, Refused, unanswered } from './client.ts';
import { servedWith } from './daemon.ts';
import { clientRelease } from './release.ts';
import { resourceNamed } from './objects/resource.ts';

/** What a read asks of: every group of the `Api`, each endpoint a method. */
export type ObjectsClient = ApiClient;

/**
 * A refusal of the `Api`'s, in the api's own error shape: an object whose `error` is the api's sentence naming the fix, at whatever
 * status it declares it (`objects`' `api-errors.ts`: a caller refused, `Forbidden`, a token it does not take, `Unauthorized`, a 500 in
 * its own words, `Failed`, among them), said and exited with as every other. Read by its shape rather than a list of its classes, so a
 * refusal the api declares later is said in its words too, never taken for an answer of another release.
 */
const isRefusal = (err: unknown): err is { readonly error: string } =>
  typeof err === 'object' && err !== null && typeof (err as { readonly error?: unknown }).error === 'string';

/** The first failure of `exit`, if it failed with one. */
const failureOf = <A, E>(exit: Exit.Exit<A, E>): E | undefined =>
  Exit.isFailure(exit) ? Option.getOrUndefined(Cause.findErrorOption(exit.cause)) : undefined;

/**
 * `call` asked of the client at `base`, each request of it carrying `headers`, and the token this client calls with (`callerToken`) where
 * `carried` is left on (a pairing turns it off, since that token is another server's, `askedBare`), and run to its end or until
 * `boundMs` is gone, when it is interrupted and fails with a timeout (`timedOut`).
 */
const attempt = <A, E>(
  base: string,
  call: (client: ObjectsClient) => Effect.Effect<A, E>,
  boundMs: number,
  env: NodeJS.ProcessEnv,
  headers: Readonly<Record<string, string>>,
  carried = true,
) =>
  Effect.runPromiseExit(
    Effect.flatMap(apiClient({ baseUrl: base, token: carried ? callerToken(env) : undefined, headers, boundMs }), call).pipe(
      Effect.provide(FetchHttpClient.layer),
    ),
  );

/** A daemon that took the read and did not answer it within `boundMs`: refused, naming its status and its restart. */
const notInTime = (verb: string, base: string, boundMs: number): Refused =>
  new Refused(
    `the daemon at ${base} did not answer \`nemia ${verb}\` within ${boundMs / 1000} s. See whether it is up, \`nemia service status\`, or restart it, \`nemia service restart\``,
  );

/**
 * The releases a read was asked between, as far as they are known: the daemon's (`Health.release`; null where its health says none,
 * undefined where it was not read, as for a server a pairing asks) and this client's (`clientRelease`; null for a checkout).
 */
export type Releases = { readonly daemon: string | null | undefined; readonly client: string | null };

/** How `releases` say each side: the daemon's release or that it says none, this client's tag or that it is a checkout. */
const sidesOf = ({ daemon, client }: Releases): string =>
  `the daemon ${daemon === undefined ? 'was not asked its release' : daemon === null ? 'says no release (GET /api/health)' : `runs ${daemon}`}, and this nemia is ${client ?? 'a checkout'}`;

/**
 * An answer of the daemon at `base` to `nemia <verb>` that does not decode by the `Api`'s Schema (`failed`, what the decode said): a
 * daemon of another build than this client's, which may say no release at all, so `releaseMet`'s `unsaid` let it through. Refused, exit
 * 2, naming both releases as `releases` know them and `nemia version` on both machines.
 */
export const undecoded = (verb: string, base: string, failed: unknown, releases: Releases): Refused =>
  new Refused(
    `nemia ${verb}: the daemon at ${base} answered in a shape this nemia does not read (${failed instanceof Error ? failed.message : String(failed)}): ${sidesOf(releases)}. ` +
      "Type `nemia version` on both machines, then upgrade the older to the other's release (`nemia upgrade <tag>`), or run this command with the nemia of the daemon's release",
  );

/**
 * The answer of `exit`, or the refusal it is as a person reads it, for the read `verb` names, of the daemon at `base`, which had `boundMs`
 * to answer, the two sides being of `releases`.
 */
function answerOf<A, E>(exit: Exit.Exit<A, E>, verb: string, base: string, boundMs: number, releases: Releases): A {
  if (Exit.isSuccess(exit)) return exit.value;
  const failed = failureOf(exit);
  if (failed === undefined) throw Cause.squash(exit.cause);
  if (timedOut(failed)) throw notInTime(verb, base, boundMs);
  if (isRefusal(failed)) return thrown(failed.error, failed instanceof Conflict ? 1 : 2);
  if (failed instanceof Answered) {
    if (failed.status === 404) throw olderThanThis(verb, base, failed.path);
    throw new Refused(
      failed.said ??
        `the daemon at ${base} answered ${failed.status} to ${failed.path}, which this nemia does not read: restart it, \`nemia service restart\``,
    );
  }
  if (HttpClientError.isHttpClientError(failed) && failed.reason._tag === 'TransportError') throw unanswered(verb, base, failed);
  throw undecoded(verb, base, failed, releases);
}

/** A refusal in the api's own words, exited with `code`: 1 for a `Conflict` (a stale version), as the old path exits; else 2. */
const thrown = (said: string, code: number): never => {
  throw new Refused(said, code);
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
  const { base, release } = await servedWith(verb, env);
  return answerOf(await attempt(base, call, boundMs, env, headers), verb, base, boundMs, { daemon: release, client: clientRelease() });
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
  return answerOf(await attempt(base, call, boundMs, {}, {}, false), verb, base, boundMs, { daemon: undefined, client: clientRelease() });
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
