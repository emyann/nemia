/**
 * The board's client of the objects (`objects`' `Api`): every read and write of a kind the api serves as an object goes through here, made
 * by `HttpApiClient` from the one definition the api serves, over `FetchHttpClient` — the Run and its sub-resources (`runs`), and the
 * inbox's cards (`cards`). Each is a promise, as TanStack Query's functions take one.
 *
 * What a call rejects with is what the board's own reads and writes reject with (`read.ts`): a refusal in the api's words (its `error`)
 * and its status — a `ReadRefusal` for a read, so a run gone is still `runGone`, a `WriteRefusal` for a write — and an `UnreadAnswer`
 * where an answer does not decode, naming the first key that is wrong. So each call runs on a `fetch` of its own that keeps the status and
 * the body of what it was answered, which the client's own errors do not carry whole.
 *
 * Imports no sibling but the shared reads (`test/api-files.test.ts`).
 */
import { Cause, Effect, Exit, Option, Schema } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/http';
import { HttpApiClient } from 'effect/http-api';
import {
  Api,
  Card,
  DEFAULT_NAMESPACE,
  type CardFile,
  CardList,
  type CardStart,
  type LabelEdit,
  Labelled,
  Run,
  StepTold,
  StepTries,
} from 'objects';
import { decoded, ReadRefusal, WriteRefusal } from './read.ts';

/**
 * The origin a request is made under where there is no page to resolve its path against — the node tests: effect makes every request's
 * URL whole, and the `fetch` of each call (`call`) sends its path and query alone, so this origin never leaves.
 */
const NO_PAGE = 'http://board.invalid';

/**
 * The client, made once: every write sent as `application/json`, which the api requires of every write — a body another site's page cannot
 * send unasked — the Card's verbs that send no body included.
 */
const client = Effect.runSync(
  HttpApiClient.make(Api, {
    baseUrl: typeof location === 'undefined' ? NO_PAGE : '',
    transformClient: HttpClient.mapRequest((request) =>
      request.method === 'GET' ? request : HttpClientRequest.setHeader(request, 'content-type', 'application/json'),
    ),
  }).pipe(Effect.provide(FetchHttpClient.layer)),
);

type Client = typeof client;

/** What an answer said: its status, and its JSON (undefined for one that is not JSON). */
type Seen = { route: string; status: number; statusText: string; body: Promise<unknown> };

/** How a call is answered: the schema its answer decodes with, what a refusal is built as, and for a write what it may have done. */
type How<A> = {
  schema: Schema.Decoder<A>;
  refuse: (words: string, status: number) => Error;
  may?: string;
  /** Keys the request is sent with beyond the ones the Api declares: the place a card is started in (`?factory=&repo=`). */
  query?: Record<string, string>;
};

/** `input`'s path and query: a request of the board's goes to its own api, wherever it is served. */
const pathOf = (input: RequestInfo | URL, query: Record<string, string> | undefined): string => {
  const url = new URL(input instanceof Request ? input.url : String(input), NO_PAGE);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
};

/** What a refusal of the api's says: its `error`. */
const Said = Schema.Struct({ error: Schema.String });

/**
 * Runs `use` of the client: resolves with its answer, decoded; rejects with `how.refuse` of the api's words and status where it refused,
 * with an `UnreadAnswer` where its answer does not decode, and with `fetch`'s own failure where nothing answered.
 */
async function call<A>(use: (client: Client) => Effect.Effect<A, unknown>, how: How<A>): Promise<A> {
  let seen: Seen | undefined;
  const fetchSeen: typeof fetch = async (input, init) => {
    const path = pathOf(input, how.query);
    const res = await globalThis.fetch(path, init);
    seen = {
      route: `${init?.method ?? 'GET'} ${path.split('?')[0]}`,
      status: res.status,
      statusText: res.statusText,
      body: res
        .clone()
        .json()
        .catch(() => undefined),
    };
    return res;
  };
  const exit = await Effect.runPromiseExit(use(client).pipe(Effect.provideService(FetchHttpClient.Fetch, fetchSeen)));
  if (Exit.isSuccess(exit)) return exit.value;
  if (seen === undefined) throw Cause.squash(exit.cause);
  const body = await seen.body;
  if (seen.status >= 200 && seen.status < 300) return decoded(seen.route, how.schema, body, how.may);
  const said = Option.getOrUndefined(Schema.decodeUnknownOption(Said)(body))?.error;
  throw how.refuse(said ?? `${seen.route} answered ${seen.status} ${seen.statusText}`, seen.status);
}

/** How a read is refused: a `ReadRefusal`, whose 404 on a run is the run gone. */
const read = <A>(schema: Schema.Decoder<A>): How<A> => ({ schema, refuse: (words, status) => new ReadRefusal(words, status) });

/** How a write is refused: a `WriteRefusal`; `may` says what it may have done, which an answer the board does not read says. */
const write = <A>(schema: Schema.Decoder<A>, may: string, query?: Record<string, string>): How<A> => ({
  schema,
  refuse: (words, status) => new WriteRefusal(words, status),
  may,
  ...(query ? { query } : {}),
});

/** The run object and its sub-resources. */
export const runs = {
  /** The run object (`GET /api/runs/:runId`). */
  show: (runId: string): Promise<Run> => call((c) => c.runs.show({ params: { runId } }), read(Run)),
  /** Every try of a step, earliest first. */
  tries: (runId: string, step: string): Promise<StepTries> => call((c) => c.runs.tries({ params: { runId, step } }), read(StepTries)),
  /** What a step was told. */
  told: (runId: string, step: string): Promise<StepTold> => call((c) => c.runs.told({ params: { runId, step } }), read(StepTold)),
};

/** The namespace of a card of `factory`: the factory itself, or `default` for a card that names none. */
export const namespaceOf = (factory: string | null | undefined): string => factory ?? DEFAULT_NAMESPACE;

/** What a card's start answers: its new run, and the card's name. */
const Started = Schema.Struct({ id: Schema.String, card: Schema.String });

/** The inbox's cards as objects: a card is named by its namespace (its factory, `default` for none) and its name. */
export const cards = {
  /** Every card, of every namespace, that `labelSelector` keeps by its labels, or every card for none (`GET /api/cards`). */
  listAll: (labelSelector?: string): Promise<CardList> =>
    call((c) => c.cards.listAll({ query: labelSelector === undefined ? {} : { labelSelector } }), read(CardList)),
  /** A card filed in `namespace`. */
  create: (namespace: string, card: CardFile): Promise<Card> =>
    call(
      (c) => c.cards.create({ params: { namespace }, payload: card }),
      write(Card, 'The card may be filed: look in the inbox before filing it again.'),
    ),
  /** A card dropped without starting it: answers the card as it was. */
  delete: (namespace: string, name: string): Promise<Card> =>
    call(
      (c) => c.cards.delete({ params: { namespace, name } }),
      write(Card, 'The card may be dropped: look in the inbox before dropping it again.'),
    ),
  /**
   * A card started: its new run's id and the card's name. `place` starts it in a factory on one of its repositories, which the Card's
   * start says nothing of: sent as `?factory=&repo=`, as every start of the board's says a place, and read by the api off any request.
   */
  start: (
    namespace: string,
    name: string,
    start: CardStart,
    place?: { factory: string; repo: string },
  ): Promise<{ id: string; card: string }> =>
    call(
      (c) => c.cards.start({ params: { namespace, name }, payload: start }),
      write(
        Started,
        'The run may have started: look on the Runs page before starting it again.',
        place ? { factory: place.factory, repo: place.repo } : undefined,
      ),
    ),
  /** A card queued to start on its own: answers the card as it now reads. */
  queue: (namespace: string, name: string): Promise<Card> =>
    call(
      (c) => c.cards.queue({ params: { namespace, name } }),
      write(Card, 'The card may be queued, or not: look in the inbox before asking again.'),
    ),
  /** A card taken off the queue: answers the card as it now reads. */
  unqueue: (namespace: string, name: string): Promise<Card> =>
    call(
      (c) => c.cards.unqueue({ params: { namespace, name } }),
      write(Card, 'The card may be queued, or not: look in the inbox before asking again.'),
    ),
  /** A card's labels edited (`key=value`, `key-`); a changed value needs `overwrite`. */
  labels: (namespace: string, name: string, edit: LabelEdit): Promise<Labelled> =>
    call(
      (c) => c.cards.labels({ params: { namespace, name }, payload: edit }),
      write(Labelled, 'The labels may be set: read the card again before sending it again.'),
    ),
};
