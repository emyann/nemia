/**
 * The board's client of the objects (`objects`' `Api`): every read and write of a kind the api serves as an object goes through here, made
 * by `objects`' one constructor of its typed client (`apiClient`) from the one definition the api serves, over `FetchHttpClient` — the Run
 * and its sub-resources (`runs`), the inbox's cards (`cards`), and a factory and its parts: the Factory with its rules, instruction,
 * command lines and cost lines (`factories`), filed empty or made from a template, and the templates Nemia builds in (`templates`), its
 * MCP servers and their sign-ins (`mcpServers`), Nemia's own servers (`builtin`), its schedules, hires and volumes; and the definitions a
 * namespace serves, its workflows, agents and skills (`workflows`, `agents`, `skills`); and the proposals that change them and the
 * delegations that may approve them (`proposals`, `delegations`); and the files a start hands its run (`files`). Each
 * is a promise, as TanStack Query's functions take one.
 *
 * A file is the one write sent as a form (`multipart/form-data`), not JSON: the board writes by its cookie, and the api's write guard lets
 * its form through only with the header a script sets (`SCRIPTED_HEADER`), which no form on another site can send; each is bounded by its
 * size (`uploadBoundMs`), not the bound of every call.
 *
 * A list the board shows whole is read page by page (`everyPage`): the api answers a page of `LIST_PAGE.byDefault` to a list asked with no
 * `limit`, and `continue` on every page but the last, so each list read here asks pages of `LIST_PAGE.most` and reads on until a page
 * answers no `continue`. A step's tries are read with every output field of each closeout (`fields=*`) and each body read on from its
 * `bodyNext` (`steps.tries`), as the board shows a closeout whole.
 *
 * What a call rejects with is what the board's own reads and writes reject with (`read.ts`): a refusal in the api's words (its `error`) and
 * its status — a `ReadRefusal` for a read, so a run gone is still `readGone`, a `WriteRefusal` for a write — and an `UnreadAnswer` where an
 * answer does not decode, naming the first key that is wrong. So each call runs on a `fetch` of its own that keeps the status and the body
 * of what it was answered, which the client's own errors do not carry whole.
 *
 * Imports no sibling but the shared reads (`test/api-files.test.ts`).
 */
import { Cause, Effect, Exit, Option, Schema } from 'effect';
import { FetchHttpClient } from 'effect/http';
import {
  apiClient,
  Agent,
  AgentCopied,
  AgentSources,
  AgentCard,
  AgentList,
  AgentTried,
  type AgentWrite,
  Card,
  CheckOutput,
  Delegation,
  DelegationList,
  type DelegationWrite,
  type CardFile,
  CardList,
  type CardStart,
  type CardWrite,
  Factory,
  FactoryApplied,
  type FactoryApplyWrite,
  FactoryCommands,
  type FactoryCreate,
  FactoryCreated,
  FactoryInstruction,
  type FactoryInstructionWrite,
  FactoryList,
  FactoryRules,
  FactoryTrusted,
  VolumeAdded,
  VolumeRemoved,
  type VolumeWrite,
  Volume,
  type VolumeSwitchesWrite,
  Hire,
  HireList,
  LibraryAdd,
  LibraryAddList,
  type LabelEdit,
  Labelled,
  McpServer,
  McpServerList,
  Proposal,
  ProposalList,
  type McpServerWrite,
  Run,
  RunApproved,
  type RunApprove,
  RunAsked,
  RunHeld,
  type RunHold,
  RunList,
  type RunPrune,
  RunPruned,
  RunRemoved,
  type RunRetry,
  RunSaid,
  type OutputStream,
  type RunStart,
  RunStarted,
  Schedule,
  ScheduleList,
  type ScheduleWrite,
  SignedOut,
  SignInStarted,
  SignInState,
  StepTold,
  type Table,
  StepTries,
  Skill,
  SkillFiles,
  TemplateList,
  SkillList,
  type SkillWrite,
  Workflow,
  type WorkflowCreate,
  WorkflowList,
  type WorkflowWrite,
  WorkflowStepPage,
  KeyForm,
  type DefinitionOrigin,
  LIST_PAGE,
  BODY_PAGE,
  TryCloseout,
  type StepTry,
  FileObject,
  type RunInput,
  SCRIPTED_HEADER,
  uploadBoundMs,
} from 'objects';
import { askToken, decoded, ReadRefusal, tokenAskOf, WriteRefusal } from './read.ts';

/**
 * The origin a request is made under where there is no page to resolve its path against — the node tests: effect makes every request's
 * URL whole, and the `fetch` of each call (`call`) sends it whole there, where no page could resolve a path, and its path and query alone
 * in a browser, where the page's origin is the api's.
 */
const NO_PAGE = 'http://board.invalid';

/**
 * The client, made once (`apiClient`): every write sent as `application/json`, which the api requires of every write — a body another
 * site's page cannot send unasked — the Card's verbs that send no body sent `{}`; and every call given up at the bound `objects` gives
 * one (`READ_BOUND_MS`), its `fetch` aborted.
 */
const clientOf = (boundMs?: number) =>
  Effect.runSync(
    apiClient({ baseUrl: typeof location === 'undefined' ? NO_PAGE : '', boundMs }).pipe(Effect.provide(FetchHttpClient.layer)),
  );

const client = clientOf();

type Client = typeof client;

/** What an answer said: its status, and its JSON (undefined for one that is not JSON). */
type Seen = { route: string; status: number; statusText: string; body: Promise<unknown> };

/** How a call is answered: the schema its answer decodes with, what a refusal is built as, and for a write what it may have done. */
type How<A> = {
  schema: Schema.Decoder<A>;
  refuse: (words: string, status: number, answer: unknown) => Error;
  may?: string;
  /** Keys the request is sent with beyond the ones the Api declares: the place a card is started in (`?factory=&repo=`). */
  query?: Record<string, string>;
  /**
   * Headers the request is sent with beyond the ones the Api declares: the token pasted on the token page, as its bearer; the header a
   * script sets on a file's form.
   */
  headers?: Record<string, string>;
  /** The call's bound, in milliseconds, where it is not the bound of every call: a file's upload, by its size. */
  boundMs?: number;
};

/** `input`'s URL with `query` set over its own keys. */
const urlOf = (input: RequestInfo | URL, query: Record<string, string> | undefined) => {
  const url = new URL(input instanceof Request ? input.url : String(input), NO_PAGE);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
  return url;
};

/** Where a request of the board's is sent: its path and query on a page, which go to its own api wherever it is served; whole with none. */
const sentTo = (url: URL) => (typeof location === 'undefined' ? url.href : `${url.pathname}${url.search}`);

/** `sent`, the headers the client made, with `more` set over them. */
const withHeaders = (sent: HeadersInit | undefined, more: Record<string, string>) => {
  const headers = new Headers(sent);
  for (const [name, value] of Object.entries(more)) headers.set(name, value);
  return headers;
};

/** What a refusal of the api's says: its `error`. The board's one reading of a refusal's words: every answer is read through `call`. */
const Said = Schema.Struct({ error: Schema.String });

/**
 * Runs `use` of the client: resolves with its answer, decoded; rejects with `how.refuse` of the api's words and status where it refused,
 * with an `UnreadAnswer` where its answer does not decode, and with `fetch`'s own failure where nothing answered. `signal` aborts it.
 * A refusal that asks this browser for a token (`tokenAskOf`) is told to the token page besides (`askToken`), whichever read it was:
 * never one of a call that sends its own bearer (`signIn`), whose refusal is of the token it sends, not of what this browser keeps.
 * @param use The call of the client to run.
 * @param how How its answer is read: the schema it decodes with, what a refusal is built as, what a write may have done, and the
 *   query and headers sent besides.
 * @param signal Aborts the call; none for a call that runs to the bound.
 */
export async function call<A>(use: (client: Client) => Effect.Effect<A, unknown>, how: How<A>, signal?: AbortSignal) {
  let seen: Seen | undefined;
  const fetchSeen: typeof fetch = async (input, init) => {
    const url = urlOf(input, how.query);
    const res = await globalThis.fetch(sentTo(url), how.headers ? { ...init, headers: withHeaders(init?.headers, how.headers) } : init);
    seen = {
      route: `${init?.method ?? 'GET'} ${url.pathname}`,
      status: res.status,
      statusText: res.statusText,
      body: res
        .clone()
        .json()
        .catch(() => undefined),
    };
    return res;
  };
  const exit = await Effect.runPromiseExit(
    use(how.boundMs === undefined ? client : clientOf(how.boundMs)).pipe(Effect.provideService(FetchHttpClient.Fetch, fetchSeen)),
    signal ? { signal } : undefined,
  );
  if (Exit.isSuccess(exit)) return exit.value;
  if (seen === undefined) throw Cause.squash(exit.cause);
  const body = await seen.body;
  const ask = how.headers?.authorization === undefined ? tokenAskOf(seen.status, body) : null;
  if (ask !== null) askToken(ask);
  if (seen.status >= 200 && seen.status < 300) return decoded(seen.route, how.schema, body, how.may);
  const said = Option.getOrUndefined(Schema.decodeUnknownOption(Said)(body))?.error;
  throw how.refuse(said ?? `${seen.route} answered ${seen.status} ${seen.statusText}`, seen.status, body);
}

/**
 * How a read is refused: a `ReadRefusal`, whose 404 on a run is the run gone.
 * @param schema The schema the answer decodes with.
 * @param query Keys the request is sent with beyond the ones the Api declares; none for none.
 */
export const read = <A>(schema: Schema.Decoder<A>, query?: Record<string, string>) =>
  ({
    schema,
    refuse: (words, status) => new ReadRefusal(words, status),
    ...(query ? { query } : {}),
  }) satisfies How<A>;

/** What a refusal of a write is built as: the api's words, its status, and its answer whole, which a refusal may read more of. */
export type Refuse = (words: string, status: number, answer: unknown) => Error;

/**
 * How a write is refused: a `WriteRefusal`; `may` says what it may have done, which an answer the board does not read says.
 * @param schema The schema the answer decodes with.
 * @param may What the write may have done, said where its answer does not read.
 * @param query Keys the request is sent with beyond the ones the Api declares; none for none.
 * @param refuse What a refusal is built as; none for a `WriteRefusal`.
 */
export const write = <A>(schema: Schema.Decoder<A>, may: string, query?: Record<string, string>, refuse?: Refuse) => ({
  schema,
  refuse: refuse ?? ((words, status) => new WriteRefusal(words, status)),
  may,
  ...(query ? { query } : {}),
});

/** Whether a list's answer is the `Table` it answers when asked for one (`TABLE_ACCEPT`), which the board never asks for. */
const isTable = (answer: unknown): answer is Table =>
  typeof answer === 'object' && answer !== null && Reflect.get(answer, 'kind') === 'Table';

/** A list endpoint's answer, its list: a `Table`, never asked for, is a defect of the api's. */
const listed = <L>(answer: L | Table) =>
  isTable(answer)
    ? Effect.die(new Error('The api answered a Table the board did not ask for: restart the api (npm run dev).'))
    : Effect.succeed(answer);

/** The page of a list asked: the most a page holds, and past the first page the `continue` the page before answered, sent as it is. */
type PageAsked = { limit: string; continue?: string };

/** A page of a list: its items, where it stands, and, for the runs, each it could not judge. */
type Paged = { metadata: { continue?: string }; items: readonly unknown[]; unjudged?: readonly unknown[] };

/**
 * Every page of a list read as one: `page` asked for a page of `LIST_PAGE.most`, and again with each `continue` its answer gives, until
 * one gives none; the first page's shape, every page's items (and runs not judged) in order, the last page's metadata. A page that gives
 * back the `continue` it was asked with is an api that would be asked forever, refused naming the restart.
 * @param page Reads one page of the list, given its limit and the `continue` of the page before.
 */
export async function everyPage<L extends Paged>(page: (asked: PageAsked) => Promise<L>) {
  const limit = String(LIST_PAGE.most);
  const first = await page({ limit });
  const pages = [first];
  let next = first.metadata.continue;
  while (next !== undefined && next !== '') {
    const answer = await page({ limit, continue: next });
    pages.push(answer);
    if (answer.metadata.continue === next)
      throw new Error('The api answered a page the same `continue` it was asked with: restart the api (npm run dev).');
    next = answer.metadata.continue;
  }
  const { metadata } = pages.at(-1) ?? first;
  const unjudged = pages.flatMap((p) => p.unjudged ?? []);
  return Object.assign(
    {},
    first,
    { metadata, items: pages.flatMap((p) => p.items) },
    first.unjudged === undefined && unjudged.length === 0 ? {} : { unjudged },
  );
}

/** What a list of runs is asked by: its labels, its state (`status.state=<state>`, `==`, `!=`), and a page of it. */
export type RunListQuery = { labelSelector?: string; fieldSelector?: string; limit?: number; continue?: string };

/** The query a list of runs is sent with: each key given, `limit` as the digits the api reads. */
const runListQueryOf = (query: RunListQuery) => ({
  ...(query.labelSelector === undefined ? {} : { labelSelector: query.labelSelector }),
  ...(query.fieldSelector === undefined ? {} : { fieldSelector: query.fieldSelector }),
  ...(query.limit === undefined ? {} : { limit: String(query.limit) }),
  ...(query.continue === undefined ? {} : { continue: query.continue }),
});

/** A list of runs `page` reads: the one page `query` names by its `limit` or `continue`, else every page (`everyPage`). */
const runPages = (query: RunListQuery, page: (asked: { limit?: number; continue?: string }) => Promise<RunList>) =>
  query.limit !== undefined || query.continue !== undefined
    ? page({})
    : everyPage((asked) => page({ limit: Number(asked.limit), ...(asked.continue === undefined ? {} : { continue: asked.continue }) }));

/**
 * The run object, its list and its sub-resources; and its named actions, each in the run's namespace (its factory, `default` for one that
 * names none, `namespaceOf`), each taking what it may have done (`may`), which the caller's words say.
 */
export const runs = {
  /**
   * Every run, of every namespace, that the query keeps (`GET /api/runs`), with each it could not judge beside them (`unjudged`): by its
   * labels (`labelSelector`), by its state (`fieldSelector`, which brings the frame's parts and the counts), a page of `limit` runs from
   * `continue`; with neither, every page of them (`everyPage`).
   */
  listAll: (query: RunListQuery = {}) =>
    runPages(query, (asked) =>
      call((c) => c.runs.listAll({ query: runListQueryOf({ ...query, ...asked }) }).pipe(Effect.flatMap(listed)), read(RunList)),
    ),
  /** The runs of `namespace` the query keeps (`GET /api/namespaces/:namespace/runs`), as `listAll` asks them. */
  list: (namespace: string, query: RunListQuery = {}) =>
    runPages(query, (asked) =>
      call(
        (c) => c.runs.list({ params: { namespace }, query: runListQueryOf({ ...query, ...asked }) }).pipe(Effect.flatMap(listed)),
        read(RunList),
      ),
    ),
  /** The run object (`GET /api/runs/:name`). */
  show: (name: string) => call((c) => c.runs.show({ params: { name } }), read(Run)),
  /** A run started in `namespace`, `?repo=` finding the factory: the api places it on the repository its wiring gives. Its name. */
  create: (namespace: string, start: RunStart, may: string, repo?: string) =>
    call(
      (c) => c.runs.create({ params: { namespace }, query: repo === undefined ? {} : { repo }, payload: start }),
      write(RunStarted, may),
    ),
  /** A try's run removed: its record and the folders it worked in. */
  delete: (namespace: string, name: string, may: string) =>
    call((c) => c.runs.delete({ params: { namespace, name }, query: {} }), write(RunRemoved, may)),
  /** A finished run pruned: its worktrees, and its files with `artifacts`. */
  prune: (namespace: string, name: string, how: RunPrune, may: string) =>
    call((c) => c.runs.prune({ params: { namespace, name }, payload: how }), write(RunPruned, may)),
  /** A run's labels edited (`key=value`, `key-`); a changed value needs `overwrite`. */
  labels: (namespace: string, name: string, edit: LabelEdit, may: string) =>
    call((c) => c.runs.labels({ params: { namespace, name }, payload: edit }), write(Labelled, may)),
  /** A run held until the runs `hold.until` names land. */
  hold: (namespace: string, name: string, hold: RunHold, may: string) =>
    call((c) => c.runs.hold({ params: { namespace, name }, payload: hold }), write(RunHeld, may)),
  /** A person's hold on a run lifted. */
  unhold: (namespace: string, name: string, may: string) =>
    call((c) => c.runs.unhold({ params: { namespace, name } }), write(RunHeld, may)),
  /** Another try of a step, or with `round` another round of the loop it closes: the ask, written and not yet filed. */
  retry: (namespace: string, name: string, step: string, how: RunRetry, may: string) =>
    call((c) => c.runs.retry({ params: { namespace, name, step }, payload: how }), write(RunAsked, may)),
  /** A step approved at its gate, or a loop out of rounds taken as it stands. */
  approve: (namespace: string, name: string, step: string, how: RunApprove, may: string) =>
    call((c) => c.runs.approve({ params: { namespace, name, step }, payload: how }), write(RunApproved, may)),
  /** Words said to a step's running session. */
  say: (namespace: string, name: string, step: string, text: string, may: string) =>
    call((c) => c.runs.say({ params: { namespace, name, step }, payload: { text } }), write(RunSaid, may)),
};

/**
 * A try with its closeout's body whole: each page after the one it was answered with read from the `bodyNext` the page before gave, in
 * pages of the most the api answers (`BODY_PAGE.most`), until a page gives none. A try whose body was answered whole is as it was.
 */
async function bodyWhole(runId: string, step: string, at: StepTry) {
  let closeout = at.closeout;
  while (closeout?.bodyNext !== undefined) {
    const { bodyNext: from, ...had } = closeout;
    const next = await call(
      (c) =>
        c.steps.closeout({
          params: { runId, step, try: String(at.try) },
          query: { bodyFrom: String(from), bodyLimit: String(BODY_PAGE.most) },
        }),
      read(TryCloseout),
    );
    const page = next.closeout;
    if (page === null) break;
    closeout = {
      ...had,
      body: `${had.body ?? ''}${page.body ?? ''}`,
      ...(page.bodyNext !== undefined && page.bodyNext > from ? { bodyNext: page.bodyNext } : {}),
    };
  }
  return closeout === at.closeout ? at : { ...at, closeout };
}

/** A run's step's reads (`/api/runs/:runId/steps/:step/…`). */
export const steps = {
  /**
   * Every try of a step, earliest first, each closeout whole: every output field (`fields=*`), and its body read on from each page's
   * `bodyNext` (`bodyWhole`).
   */
  tries: async (runId: string, step: string) => {
    const listed = await call((c) => c.steps.tries({ params: { runId, step }, query: { fields: '*' } }), read(StepTries));
    return { ...listed, tries: await Promise.all(listed.tries.map((t) => bodyWhole(runId, step, t))) };
  },
  /** What a step was told. */
  told: (runId: string, step: string) => call((c) => c.steps.told({ params: { runId, step } }), read(StepTold)),
  /** A page of what the check of a step's try printed on one stream, as `query` cuts it: from a line, the last lines, a match. */
  checkOutput: (runId: string, step: string, tryNo: number, query: CheckOutputQuery) =>
    call((c) => c.steps.checkOutput({ params: { runId, step, try: String(tryNo) }, query }), read(CheckOutput)),
};

/** What a read of a check's output asks: the stream, the line to read on from or the last lines, how many, and the text to match. */
type CheckOutputQuery = {
  readonly stream?: OutputStream;
  readonly from?: string;
  readonly limit?: string;
  readonly last?: string;
  readonly match?: string;
};

/**
 * The files a start hands its run, as its form lists them (`listed`), with the ids of those an earlier press uploaded (`sent`) and what is
 * told how many are uploaded as each goes (`onSent`).
 */
export type StartFiles = { listed: readonly File[]; sent: Map<File, string>; onSent?: (count: number) => void };

/** The files a start hands its run, each uploaded to its namespace before the start names it by its id. */
export const files = {
  /**
   * `file` uploaded to `namespace`'s files (`POST /api/namespaces/:namespace/files`) as a form of one part, `file`, under its own name,
   * with the header a script sets, which the write guard asks of a form by the board's cookie; bounded by its size. Its id and size.
   */
  upload: (namespace: string, file: File, may: string) => {
    const form = new FormData();
    form.append('file', file, file.name);
    return call((c) => c.files.upload({ params: { namespace }, payload: form }), {
      ...write(FileObject, may),
      headers: { [SCRIPTED_HEADER]: 'XMLHttpRequest' },
      boundMs: uploadBoundMs(file.size),
    });
  },
  /**
   * Each file `listed` uploaded to `namespace`'s files, one after another, in order, and named among a start's inputs by its id, as `nemia
   * start --input` names each: a file already in `sent`, uploaded by an earlier press of the same form, is named by the id it was answered
   * and not sent again, and each one uploaded now is set there. `onSent` is told how many are uploaded, after each. Rejects with the
   * `WriteRefusal` of the first one refused, its words naming the file, and uploads none after it.
   */
  uploaded: async (namespace: string, { listed, sent, onSent }: StartFiles) => {
    const inputs: RunInput[] = [];
    for (const file of listed) {
      const id =
        sent.get(file) ??
        (await files.upload(namespace, file, `${file.name} may be kept: starting again uploads it again.`).then(
          (kept) => kept.id,
          (error: unknown) => {
            throw error instanceof WriteRefusal ? new WriteRefusal(`${file.name}: ${error.message}`, error.status) : error;
          },
        ));
      sent.set(file, id);
      inputs.push({ name: file.name, file: id });
      onSent?.(inputs.length);
    }
    return inputs;
  },
  /**
   * Each file of `sent` whose id the start's `refusal` says its namespace keeps no more, forgotten there, so the next press uploads it
   * again: a 422 that names the id, the api's answer to a start naming a file it no longer keeps (gone past `FILE_KEPT_FOR`, or never
   * kept). Told apart by its status and the id it names, which is random, never by its words. The files forgotten, none for any other
   * refusal.
   * @param sent The ids an earlier press of the form uploaded, by their file.
   * @param refusal What the start was refused with.
   */
  unkept: (sent: Map<File, string>, refusal: unknown) => {
    if (!(refusal instanceof WriteRefusal) || refusal.status !== 422) return [];
    const gone = [...sent].filter(([, id]) => refusal.message.includes(id)).map(([file]) => file);
    for (const file of gone) sent.delete(file);
    return gone;
  },
};

/** What a card's start answers: its new run, and the card's name. */
const Started = Schema.Struct({ id: Schema.String, card: Schema.String });

/** The inbox's cards as objects: a card is named by its namespace (its factory, `default` for none) and its name. */
export const cards = {
  /** Every card, of every namespace, that `labelSelector` keeps by its labels, or every card for none (`GET /api/cards`), every page. */
  listAll: (labelSelector?: string) =>
    everyPage((asked) =>
      call(
        (c) => c.cards.listAll({ query: labelSelector === undefined ? asked : { ...asked, labelSelector } }).pipe(Effect.flatMap(listed)),
        read(CardList),
      ),
    ),
  /** A card, by its namespace and its name, with its file as written (`status.source`). */
  get: (namespace: string, name: string) => call((c) => c.cards.get({ params: { namespace, name } }), read(Card)),
  /** A card by its name alone, whichever namespace holds it, with its file as written (`GET /api/cards/:name`): a card's page's read. */
  getAll: (name: string) => call((c) => c.cards.getAll({ params: { name } }), read(Card)),
  /**
   * A card written whole: its spec as it is to be, its labels, and the `resourceVersion` it was read at, which refuses the write where the
   * card has changed since. `spec.queued` goes back as read. Answers the card as it now reads.
   */
  replace: (namespace: string, name: string, card: CardWrite) =>
    call(
      (c) => c.cards.update({ params: { namespace, name }, payload: card }),
      write(Card, 'The card may be changed, or not: read the card again before sending it again.'),
    ),
  /** A card filed in `namespace`. */
  create: (namespace: string, card: CardFile) =>
    call(
      (c) => c.cards.create({ params: { namespace }, payload: card }),
      write(Card, 'The card may be filed: look in the inbox before filing it again.'),
    ),
  /** A card dropped without starting it: answers the card as it was. */
  delete: (namespace: string, name: string) =>
    call(
      (c) => c.cards.delete({ params: { namespace, name } }),
      write(Card, 'The card may be dropped: look in the inbox before dropping it again.'),
    ),
  /**
   * A card started: its new run's id and the card's name. `factory` starts a card of no factory in that one, which the Card's start says
   * nothing of: sent as `?factory=`, read by the api off any request. Never a `?repo=`: the factory places the run by its wiring.
   */
  start: (namespace: string, name: string, start: CardStart, factory?: string) =>
    call(
      (c) => c.cards.start({ params: { namespace, name }, payload: start }),
      write(
        Started,
        'The run may have started: look on the Runs page before starting it again.',
        factory === undefined ? undefined : { factory },
      ),
    ),
  /** A card queued to start on its own: answers the card as it now reads. */
  queue: (namespace: string, name: string) =>
    call(
      (c) => c.cards.queue({ params: { namespace, name }, query: {} }),
      write(Card, 'The card may be queued, or not: look in the inbox before asking again.'),
    ),
  /** A card taken off the queue: answers the card as it now reads. */
  unqueue: (namespace: string, name: string) =>
    call(
      (c) => c.cards.unqueue({ params: { namespace, name } }),
      write(Card, 'The card may be queued, or not: look in the inbox before asking again.'),
    ),
  /** A card's labels edited (`key=value`, `key-`); a changed value needs `overwrite`. */
  labels: (namespace: string, name: string, edit: LabelEdit) =>
    call(
      (c) => c.cards.labels({ params: { namespace, name }, payload: edit }),
      write(Labelled, 'The labels may be set: read the card again before sending it again.'),
    ),
};

/** What a write of a factory's rules, instruction or cost line may have done, and what to look at before writing again. */
const SETTINGS_WRITTEN = "The factory's settings may be changed: read its settings again before changing them again.";

/** What a filing of a factory may have done, and what to look at before filing it again. */
const FACTORY_FILED = 'The factory may be filed: read the factories again before making it again.';

/** The templates Nemia builds in, which no namespace holds (`/api/templates`). */
export const templates = {
  /** Every template Nemia builds in (`GET /api/templates`), every page. */
  list: () => everyPage((asked) => call((c) => c.templates.listAll({ query: asked }).pipe(Effect.flatMap(listed)), read(TemplateList))),
};

/** A factory, its rules, its instruction and the lines a person types for it (`/api/factories`). */
export const factories = {
  /** Every factory, the default one among them (`GET /api/factories`), every page. */
  listAll: () => everyPage((asked) => call((c) => c.factories.listAll({ query: asked }).pipe(Effect.flatMap(listed)), read(FactoryList))),
  /** A factory filed (`POST /api/factories`): by its name, with the volumes the body names, none where it names none. */
  create: (body: FactoryCreate) => call((c) => c.factories.create({ payload: body }), write(FactoryCreated, FACTORY_FILED)),
  /** The factory `name` made from the template the body names (`POST /api/factories/:name/apply`), its parameters at their defaults. */
  apply: (name: string, body: FactoryApplyWrite) =>
    call((c) => c.factories.apply({ params: { name }, payload: body }), write(FactoryApplied, FACTORY_FILED)),
  /** The factory `name`. */
  get: (name: string) => call((c) => c.factories.get({ params: { name } }), read(Factory)),
  /** The lines a person types for the factory `name`: attach, rm, add, schedule, trust, volume, and each unschedule and volume rm. */
  commands: (name: string) => call((c) => c.factories.commands({ params: { name } }), read(FactoryCommands)),
  /** The rules of the factory `name`, what every agent hired into it is told. */
  rules: (name: string) => call((c) => c.factories.rules({ params: { name } }), read(FactoryRules)),
  /** `words` written as the rules of the factory `name`: the rules as they then read. */
  putRules: (name: string, words: string) =>
    call((c) => c.factories.putRules({ params: { name }, payload: { words } }), write(FactoryRules, SETTINGS_WRITTEN)),
  /** The rules of the factory `name` removed: the rules as they then read, none. */
  deleteRules: (name: string) => call((c) => c.factories.deleteRules({ params: { name } }), write(FactoryRules, SETTINGS_WRITTEN)),
  /** The instruction of the factory `name`, what Nemia is to know about it. */
  instruction: (name: string) => call((c) => c.factories.instruction({ params: { name } }), read(FactoryInstruction)),
  /** The instruction of the factory `name` kept at `place`: a file of its first folder, or the store. */
  putInstruction: (name: string, place: FactoryInstructionWrite) =>
    call((c) => c.factories.putInstruction({ params: { name }, payload: place }), write(FactoryInstruction, SETTINGS_WRITTEN)),
  /** The instruction of the factory `name` read from `NEMIA.md` of its first folder again. */
  deleteInstruction: (name: string) =>
    call((c) => c.factories.deleteInstruction({ params: { name } }), write(FactoryInstruction, SETTINGS_WRITTEN)),
  /** `words` written as the instruction the store keeps for the factory `name`. */
  putInstructionWords: (name: string, words: string) =>
    call((c) => c.factories.putInstructionWords({ params: { name }, payload: { words } }), write(FactoryInstruction, SETTINGS_WRITTEN)),
  /** The instruction the store keeps for the factory `name` removed. */
  deleteInstructionWords: (name: string) =>
    call((c) => c.factories.deleteInstructionWords({ params: { name } }), write(FactoryInstruction, SETTINGS_WRITTEN)),
  /** The cost line of `workflow` in the factory `name` set to `usd`: the factory as it then reads. */
  putCostLine: (name: string, workflow: string, usd: number) =>
    call((c) => c.factories.putCostLine({ params: { name, workflow }, payload: { usd } }), write(Factory, SETTINGS_WRITTEN)),
  /** The cost line of `workflow` in the factory `name` taken off: the factory as it then reads. */
  deleteCostLine: (name: string, workflow: string) =>
    call((c) => c.factories.deleteCostLine({ params: { name, workflow } }), write(Factory, SETTINGS_WRITTEN)),
  /** `volume` given to the factory `name`: a path or a git URL, marked `:ro` or `:rw`, a writable one a repository it works on. */
  addVolume: (name: string, volume: VolumeWrite) =>
    call((c) => c.factories.addVolume({ params: { factory: name }, payload: volume }), write(VolumeAdded, SETTINGS_WRITTEN)),
  /** The places of the factory `name` trusted, asking each harness that keeps a trust: what was asked for each place. */
  trust: (name: string) => call((c) => c.factories.trust({ params: { name } }), write(FactoryTrusted, SETTINGS_WRITTEN)),
  /** The volume of the factory `name` at `path` taken off, as it was given. */
  removeVolume: (name: string, path: string) =>
    call((c) => c.factories.removeVolume({ params: { factory: name }, query: { path } }), write(VolumeRemoved, SETTINGS_WRITTEN)),
};

/** What a write of a server may have done, and what to look at before writing again. */
const SERVER_WRITTEN = "The server may be recorded: read the factory's servers again before writing them again.";

/** What a sign-in or a sign-out may have done, and what to look at before asking again. */
const SIGN_IN_ASKED = "The sign-in may have changed: read the server's state again before asking again.";

/** A factory's MCP servers, in its namespace (the factory's name), each header's value served masked; and their sign-ins. */
export const mcpServers = {
  /** Every server the factory `namespace` records, with the state its harness reports of each, every page. */
  list: (namespace: string) =>
    everyPage((asked) =>
      call((c) => c.mcpservers.list({ params: { namespace }, query: asked }).pipe(Effect.flatMap(listed)), read(McpServerList)),
    ),
  /** The server `name` recorded as `server`; a header sent as the mask keeps the value stored. */
  put: (namespace: string, name: string, server: McpServerWrite) =>
    call((c) => c.mcpservers.put({ params: { namespace, name }, payload: server }), write(McpServer, SERVER_WRITTEN)),
  /** The server `name` taken off the record: answers it as it was. */
  delete: (namespace: string, name: string) =>
    call((c) => c.mcpservers.delete({ params: { namespace, name } }), write(McpServer, SERVER_WRITTEN)),
  /** A sign-in to the server `name` started: the address the person opens. */
  signIn: (namespace: string, name: string) =>
    call((c) => c.mcpservers.signIn({ params: { namespace, name } }), write(SignInStarted, SIGN_IN_ASKED)),
  /** The state of the server `name`'s last sign-in, from the engine's memory. */
  signInState: (namespace: string, name: string) =>
    call((c) => c.mcpservers.signInState({ params: { namespace, name } }), read(SignInState)),
  /**
   * The server `name`'s waiting sign-in handed `url`, the address the person's browser landed on once they approved, where that
   * browser runs on another machine than the daemon: answers the sign-in's state.
   */
  signInCallback: (namespace: string, name: string, url: string) =>
    call((c) => c.mcpservers.signInCallback({ params: { namespace, name }, payload: { url } }), write(SignInState, SIGN_IN_ASKED)),
  /** The server `name` signed out. */
  signOut: (namespace: string, name: string) =>
    call((c) => c.mcpservers.signOut({ params: { namespace, name } }), write(SignedOut, SIGN_IN_ASKED)),
};

/** What an agent's copy into the library may have done, and what to look at before sending it again. */
const AGENT_COPY_WRITTEN = "The copy may be written: read the library's agents again before copying it again.";

/**
 * The store's library, in no namespace: its MCP servers (`GET /api/mcpservers`), the user library's beside Nemia's own, which a factory
 * adds; and each kind's items with the factories that add each, every page.
 */
export const library = {
  mcpServers: () => everyPage((asked) => call((c) => c.mcpservers.listLibrary({ query: asked }), read(McpServerList))),
  skills: () =>
    everyPage((asked) => call((c) => c.skills.listLibrary({ query: asked }).pipe(Effect.flatMap(listed)), read(SkillList))).then((l) => [
      ...l.items,
    ]),
  agents: () =>
    everyPage((asked) => call((c) => c.agents.listLibrary({ query: asked }).pipe(Effect.flatMap(listed)), read(AgentList))).then((l) => [
      ...l.items,
    ]),
  workflows: () =>
    everyPage((asked) => call((c) => c.workflows.listLibrary({ query: asked }), read(WorkflowList))).then((l) => [...l.items]),
  agentSources: () => call((c) => c.agents.sources({ query: {} }), read(AgentSources)),
  copyAgent: (file: string) => call((c) => c.agents.copyLibrary({ payload: { file } }), write(AgentCopied, AGENT_COPY_WRITTEN)),
};

/** What a factory's add may have done, and what to look at before sending it again. */
const ADD_WRITTEN = "The add may be written: read the factory's adds again before sending it again.";

/** What a factory has added from the library, each a LibraryAdd named `<kind>.<name>` with its state. */
export const libraryAdds = {
  list: (namespace: string) =>
    everyPage((asked) => call((c) => c.libraryadds.list({ params: { namespace }, query: asked }), read(LibraryAddList))).then((l) => [
      ...l.items,
    ]),
  add: (namespace: string, name: string) => call((c) => c.libraryadds.put({ params: { namespace, name } }), write(LibraryAdd, ADD_WRITTEN)),
  remove: (namespace: string, name: string) =>
    call((c) => c.libraryadds.delete({ params: { namespace, name } }), write(LibraryAdd, ADD_WRITTEN)),
};

/** A factory's schedules, each named by its workflow. */
export const schedules = {
  /** Every schedule of the factory `namespace`, every page. */
  list: (namespace: string) =>
    everyPage((asked) => call((c) => c.schedules.list({ params: { namespace }, query: asked }), read(ScheduleList))),
  get: (namespace: string, name: string) => call((c) => c.schedules.get({ params: { namespace, name } }), read(Schedule)),
  put: (namespace: string, name: string, schedule: ScheduleWrite) =>
    call(
      (c) => c.schedules.put({ params: { namespace, name }, payload: schedule }),
      write(Schedule, "The schedule may be changed: read the factory's schedules again before writing it again."),
    ),
  delete: (namespace: string, name: string) =>
    call(
      (c) => c.schedules.delete({ params: { namespace, name } }),
      write(Schedule, "The schedule may be removed: read the factory's schedules again before removing it again."),
    ),
};

/**
 * The name of the hire into `step` of `workflow`: the two joined by a dot.
 * @param workflow The workflow's name.
 * @param step The step's name in it.
 */
export const hireName = (workflow: string, step: string) => `${workflow}.${step}`;

/** What a hire or a fire may have done, and what to look at before sending it again. */
const HIRE_WRITTEN = "The factory's hires may be changed: read the step's page again before hiring or firing again.";

/** A factory's hires, one per step of each workflow it offers, each named `<workflow>.<step>` (`hireName`). */
export const hires = {
  /** Every hire of the factory `namespace`, every page. */
  list: (namespace: string) => everyPage((asked) => call((c) => c.hires.list({ params: { namespace }, query: asked }), read(HireList))),
  get: (namespace: string, name: string) => call((c) => c.hires.get({ params: { namespace, name } }), read(Hire)),
  /** The agent `agent` hired into the step the hire `name` is of: answers the hire as it then reads. */
  put: (namespace: string, name: string, agent: string) =>
    call((c) => c.hires.put({ params: { namespace, name }, payload: { agent } }), write(Hire, HIRE_WRITTEN)),
  /** The agent hired into the step the hire `name` is of fired: answers the hire as it then reads. */
  delete: (namespace: string, name: string) => call((c) => c.hires.delete({ params: { namespace, name } }), write(Hire, HIRE_WRITTEN)),
};

/** A factory's volumes, each by its stored name in the factory's namespace. */
export const volumes = {
  /** The switches given set on the volume `name` of the factory `namespace`, the other kept: answers it as it then reads. */
  patch: (namespace: string, name: string, switches: VolumeSwitchesWrite) =>
    call((c) => c.volumes.patch({ params: { namespace, name }, payload: switches }), write(Volume, SETTINGS_WRITTEN)),
};

/** What an approval or a decline may have done, and what to look at before sending it again. */
const PROPOSAL_JUDGED = 'The proposal may be judged: read it again on its page before approving or declining it again.';

/** A factory's proposals, each a change to its definitions waiting on, or judged by, an approval. */
export const proposals = {
  /** Every proposal of the factory `namespace` that `fieldSelector` keeps (`status.phase=<phase>`), or every one for none, every page. */
  list: (namespace: string, fieldSelector?: string) =>
    everyPage((asked) =>
      call(
        (c) => c.proposals.list({ params: { namespace }, query: fieldSelector === undefined ? asked : { ...asked, fieldSelector } }),
        read(ProposalList),
      ),
    ),
  get: (namespace: string, name: string) => call((c) => c.proposals.get({ params: { namespace, name } }), read(Proposal)),
  /** The proposal `name` approved, the person's: answers it as it then reads, applied where it applies at approval. */
  approve: (namespace: string, name: string) =>
    call((c) => c.proposals.approve({ params: { namespace, name } }), write(Proposal, PROPOSAL_JUDGED)),
  /** The proposal `name` declined, the person's: answers it as it then reads. */
  decline: (namespace: string, name: string) =>
    call((c) => c.proposals.decline({ params: { namespace, name } }), write(Proposal, PROPOSAL_JUDGED)),
};

/** What a delegation's write may have done, and what to look at before sending it again. */
const DELEGATION_WRITTEN = "The factory's delegations may be changed: read its settings again before writing one again.";

/** A factory's delegations, each named after the agent it lets approve proposals within its grants; written by the person alone. */
export const delegations = {
  /** Every delegation of the factory `namespace`, every page. */
  list: (namespace: string) =>
    everyPage((asked) => call((c) => c.delegations.list({ params: { namespace }, query: asked }), read(DelegationList))),
  /** The delegation of the agent `name` written whole as `spec`: answers it as it then reads. */
  put: (namespace: string, name: string, spec: DelegationWrite) =>
    call((c) => c.delegations.put({ params: { namespace, name }, payload: spec }), write(Delegation, DELEGATION_WRITTEN)),
  /** The delegation of the agent `name` removed: answers it as it read. */
  delete: (namespace: string, name: string) =>
    call((c) => c.delegations.delete({ params: { namespace, name } }), write(Delegation, DELEGATION_WRITTEN)),
};

/**
 * Which definition a read is of, beside its namespace: `origin`, the place it is read from, shadowed or not (none: the one the namespace
 * serves at each name); and `repo`, the factory's repository it is read on, sent as `?repo=` as every read of a factory's says it.
 */
type DefinitionRead = { origin?: DefinitionOrigin; repo?: string };

/** The `?origin=` of `at`, none for none. */
const originOf = (at: DefinitionRead | undefined) => (at?.origin ? { origin: at.origin } : {});

/** The `?repo=` of `at`, sent beside the keys the Api declares; none for none. */
const repoOf = (at: DefinitionRead | undefined) => (at?.repo ? { repo: at.repo } : undefined);

/** What a write of a workflow may have done, and what to look at before writing again. */
const WORKFLOW_WRITTEN = 'The folder may be written: reload the Workflows page before writing it again.';

/**
 * A namespace's workflows (`default`: the api's repository and your library), each the factory's resolved view of its name; yours made,
 * written and removed in `default` alone. A write takes `refuse`, what its refusal is built as (a `WriteRefusal` for none).
 */
export const workflows = {
  /** Every workflow the namespace serves, every page of it. */
  list: (namespace: string, at?: DefinitionRead) =>
    everyPage((asked) =>
      call((c) => c.workflows.list({ params: { namespace }, query: { ...originOf(at), ...asked } }), read(WorkflowList, repoOf(at))),
    ).then((list) => [...list.items]) satisfies Promise<Workflow[]>,
  get: (namespace: string, name: string, at?: DefinitionRead) =>
    call((c) => c.workflows.get({ params: { namespace, name }, query: originOf(at) }), read(Workflow, repoOf(at))),
  create: (body: WorkflowCreate, refuse?: Refuse) =>
    call((c) => c.workflows.createLibrary({ payload: body }), write(Workflow, WORKFLOW_WRITTEN, undefined, refuse)),
  replace: (name: string, body: WorkflowWrite, refuse?: Refuse) =>
    call((c) => c.workflows.replaceLibrary({ params: { name }, payload: body }), write(Workflow, WORKFLOW_WRITTEN, undefined, refuse)),
  /** The workflow `name` removed, against the `resourceVersion` it was read at. */
  delete: (name: string, resourceVersion: string, refuse?: Refuse) =>
    call(
      (c) => c.workflows.deleteLibrary({ params: { name }, query: { resourceVersion } }),
      write(Workflow, 'The folder may be removed: reload the Workflows page before removing it again.', undefined, refuse),
    ),
  /** A step of the workflow `name`, for its page: its keys, its layers, its hires and its recent runs, read where `at` says. */
  step: (namespace: string, name: string, step: string, at?: DefinitionRead) =>
    call((c) => c.workflows.step({ params: { namespace, name, step }, query: originOf(at) }), read(WorkflowStepPage, repoOf(at))),
  /** Every key a step's form sets, how, and what it means (`GET /api/workflows/keys`). */
  keys: () => call((c) => c.workflows.keys(), read(KeyForm)),
};

/** What an agent's write may have done, and what to look at before writing it again. */
const AGENT_WRITTEN = 'The agent may be written: read it again on its page before writing it again.';

/** A namespace's agents, as its workflows: yours made, written and removed in `default`; tried; and read as an A2A card. */
export const agents = {
  list: (namespace: string, at?: DefinitionRead) =>
    everyPage((asked) =>
      call(
        (c) => c.agents.list({ params: { namespace }, query: { ...originOf(at), ...asked } }).pipe(Effect.flatMap(listed)),
        read(AgentList, repoOf(at)),
      ),
    ).then((list) => [...list.items]),
  get: (namespace: string, name: string, at?: DefinitionRead) =>
    call((c) => c.agents.get({ params: { namespace, name }, query: originOf(at) }), read(Agent, repoOf(at))),
  create: (body: AgentWrite, refuse?: Refuse) =>
    call((c) => c.agents.createLibrary({ payload: body }), write(Agent, AGENT_WRITTEN, undefined, refuse)),
  replace: (name: string, body: AgentWrite, refuse?: Refuse) =>
    call((c) => c.agents.replaceLibrary({ params: { name }, payload: body }), write(Agent, AGENT_WRITTEN, undefined, refuse)),
  delete: (name: string, resourceVersion: string, refuse?: Refuse) =>
    call((c) => c.agents.deleteLibrary({ params: { name }, query: { resourceVersion } }), write(Agent, AGENT_WRITTEN, undefined, refuse)),
  /** A try of the agent `name` on `brief`: the run it started. */
  try: (name: string, brief: string, refuse?: Refuse) =>
    call(
      (c) => c.agents.tryLibrary({ params: { name }, payload: { brief } }),
      write(AgentTried, 'The try may have started: look on the Runs page before trying the agent again.', undefined, refuse),
    ),
  card: (namespace: string, name: string, at?: DefinitionRead) =>
    call((c) => c.agents.card({ params: { namespace, name }, query: originOf(at) }), read(AgentCard, repoOf(at))),
};

/** What a skill's write may have done, and what to look at before writing it again. */
const SKILL_WRITTEN = 'The skill may be written: read the skills again before writing it again.';

/** A namespace's skills: yours made and written in `default`, a builtin one copied to yours, and a folder's files by path. */
export const skills = {
  list: (namespace: string, at?: DefinitionRead) =>
    everyPage((asked) =>
      call(
        (c) => c.skills.list({ params: { namespace }, query: { ...originOf(at), ...asked } }).pipe(Effect.flatMap(listed)),
        read(SkillList, repoOf(at)),
      ),
    ).then((list) => [...list.items]),
  get: (namespace: string, name: string, at?: DefinitionRead) =>
    call((c) => c.skills.get({ params: { namespace, name }, query: originOf(at) }), read(Skill, repoOf(at))),
  create: (body: SkillWrite, refuse?: Refuse) =>
    call((c) => c.skills.createLibrary({ payload: body }), write(Skill, SKILL_WRITTEN, undefined, refuse)),
  replace: (name: string, body: SkillWrite, refuse?: Refuse) =>
    call((c) => c.skills.replaceLibrary({ params: { name }, payload: body }), write(Skill, SKILL_WRITTEN, undefined, refuse)),
  /** The builtin skill `name` copied into your library: the copy, as yours. */
  copy: (name: string, refuse?: Refuse) =>
    call((c) => c.skills.copyLibrary({ params: { name } }), write(Skill, SKILL_WRITTEN, undefined, refuse)),
  files: (namespace: string, name: string, at?: DefinitionRead) =>
    call((c) => c.skills.files({ params: { namespace, name }, query: originOf(at) }), read(SkillFiles, repoOf(at))),
};
