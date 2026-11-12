/**
 * The board's client of the objects (`objects`' `Api`): every read and write of a kind the api serves as an object goes through here, made
 * by `HttpApiClient` from the one definition the api serves, over `FetchHttpClient` — the Run and its sub-resources (`runs`), the
 * inbox's cards (`cards`), and a factory and its parts: the Factory with its rules, instruction, command lines and cost lines
 * (`factories`), its MCP servers and their sign-ins (`mcpServers`), Nemia's own servers (`builtin`), its schedules, hires and volumes;
 * and the definitions a namespace serves, its workflows, agents and skills (`workflows`, `agents`, `skills`); and the proposals that
 * change them and the delegations that may approve them (`proposals`, `delegations`). Each is a promise, as TanStack Query's functions
 * take one.
 *
 * What a call rejects with is what the board's own reads and writes reject with (`read.ts`): a refusal in the api's words (its `error`)
 * and its status — a `ReadRefusal` for a read, so a run gone is still `readGone`, a `WriteRefusal` for a write — and an `UnreadAnswer`
 * where an answer does not decode, naming the first key that is wrong. So each call runs on a `fetch` of its own that keeps the status and
 * the body of what it was answered, which the client's own errors do not carry whole.
 *
 * Imports no sibling but the shared reads (`test/api-files.test.ts`).
 */
import { Cause, Effect, Exit, Option, Schema } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/http';
import { HttpApiClient } from 'effect/http-api';
import {
  Agent,
  AgentCard,
  AgentList,
  AgentTried,
  type AgentWrite,
  Api,
  Card,
  Delegation,
  DelegationList,
  type DelegationWrite,
  type CardFile,
  CardList,
  type CardStart,
  type CardWrite,
  Factory,
  FactoryCommands,
  FactoryInstruction,
  type FactoryInstructionWrite,
  FactoryList,
  FactoryRules,
  Hire,
  HireList,
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
  SkillList,
  type SkillWrite,
  Workflow,
  type WorkflowCreate,
  WorkflowList,
  type WorkflowWrite,
  WorkflowStepPage,
  KeyForm,
  type DefinitionOrigin,
} from 'objects';
import { askToken, decoded, ReadRefusal, tokenAskOf, WriteRefusal } from './read.ts';

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
  refuse: (words: string, status: number, answer: unknown) => Error;
  may?: string;
  /** Keys the request is sent with beyond the ones the Api declares: the place a card is started in (`?factory=&repo=`). */
  query?: Record<string, string>;
  /** Headers the request is sent with beyond the ones the Api declares: the token pasted on the token page, as its bearer. */
  headers?: Record<string, string>;
};

/** `input`'s path and query: a request of the board's goes to its own api, wherever it is served. */
const pathOf = (input: RequestInfo | URL, query: Record<string, string> | undefined): string => {
  const url = new URL(input instanceof Request ? input.url : String(input), NO_PAGE);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
};

/** `sent`, the headers the client made, with `more` set over them. */
const withHeaders = (sent: HeadersInit | undefined, more: Record<string, string>): Headers => {
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
 */
export async function call<A>(use: (client: Client) => Effect.Effect<A, unknown>, how: How<A>, signal?: AbortSignal): Promise<A> {
  let seen: Seen | undefined;
  const fetchSeen: typeof fetch = async (input, init) => {
    const path = pathOf(input, how.query);
    const res = await globalThis.fetch(path, how.headers ? { ...init, headers: withHeaders(init?.headers, how.headers) } : init);
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
  const exit = await Effect.runPromiseExit(
    use(client).pipe(Effect.provideService(FetchHttpClient.Fetch, fetchSeen)),
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

/** How a read is refused: a `ReadRefusal`, whose 404 on a run is the run gone. */
export const read = <A>(schema: Schema.Decoder<A>, query?: Record<string, string>): How<A> => ({
  schema,
  refuse: (words, status) => new ReadRefusal(words, status),
  ...(query ? { query } : {}),
});

/** What a refusal of a write is built as: the api's words, its status, and its answer whole, which a refusal may read more of. */
export type Refuse = (words: string, status: number, answer: unknown) => Error;

/** How a write is refused: a `WriteRefusal`; `may` says what it may have done, which an answer the board does not read says. */
export const write = <A>(schema: Schema.Decoder<A>, may: string, query?: Record<string, string>, refuse?: Refuse): How<A> => ({
  schema,
  refuse: refuse ?? ((words, status) => new WriteRefusal(words, status)),
  may,
  ...(query ? { query } : {}),
});

/** Whether a list's answer is the `Table` it answers when asked for one (`TABLE_ACCEPT`), which the board never asks for. */
const isTable = (answer: unknown): answer is Table =>
  typeof answer === 'object' && answer !== null && Reflect.get(answer, 'kind') === 'Table';

/** A list endpoint's answer, its list: a `Table`, never asked for, is a defect of the api's. */
const listed = <L>(answer: L | Table): Effect.Effect<L> =>
  isTable(answer)
    ? Effect.die(new Error('The api answered a Table the board did not ask for: restart the api (npm run dev).'))
    : Effect.succeed(answer);

/** What a list of runs is asked by: its labels, its state (`status.state=<state>`, `==`, `!=`), and a page of it. */
export type RunListQuery = { labelSelector?: string; fieldSelector?: string; limit?: number; continue?: string };

/** The query a list of runs is sent with: each key given, `limit` as the digits the api reads. */
const runListQueryOf = (query: RunListQuery) => ({
  ...(query.labelSelector === undefined ? {} : { labelSelector: query.labelSelector }),
  ...(query.fieldSelector === undefined ? {} : { fieldSelector: query.fieldSelector }),
  ...(query.limit === undefined ? {} : { limit: String(query.limit) }),
  ...(query.continue === undefined ? {} : { continue: query.continue }),
});

/**
 * The run object, its list and its sub-resources; and its named actions, each in the run's namespace (its factory, `default` for one that
 * names none, `namespaceOf`), each taking what it may have done (`may`), which the caller's words say.
 */
export const runs = {
  /**
   * Every run, of every namespace, that the query keeps (`GET /api/runs`), with each it could not judge beside them (`unjudged`): by its
   * labels (`labelSelector`), by its state (`fieldSelector`, which brings the frame's parts and the counts), a page of `limit` runs from
   * `continue`; with no `limit` the api answers them all.
   */
  listAll: (query: RunListQuery = {}): Promise<RunList> =>
    call((c) => c.runs.listAll({ query: runListQueryOf(query) }).pipe(Effect.flatMap(listed)), read(RunList)),
  /** The runs of `namespace` the query keeps (`GET /api/namespaces/:namespace/runs`), as `listAll` asks them. */
  list: (namespace: string, query: RunListQuery = {}): Promise<RunList> =>
    call((c) => c.runs.list({ params: { namespace }, query: runListQueryOf(query) }).pipe(Effect.flatMap(listed)), read(RunList)),
  /** The run object (`GET /api/runs/:name`). */
  show: (name: string): Promise<Run> => call((c) => c.runs.show({ params: { name } }), read(Run)),
  /** A run started in `namespace`, on its repository `repo` where the factory has several (`?repo=`): its name. */
  create: (namespace: string, start: RunStart, may: string, repo?: string): Promise<RunStarted> =>
    call(
      (c) => c.runs.create({ params: { namespace }, query: repo === undefined ? {} : { repo }, payload: start }),
      write(RunStarted, may),
    ),
  /** A try's run removed: its record and the folders it worked in. */
  delete: (namespace: string, name: string, may: string): Promise<RunRemoved> =>
    call((c) => c.runs.delete({ params: { namespace, name } }), write(RunRemoved, may)),
  /** A finished run pruned: its worktrees, and its files with `artifacts`. */
  prune: (namespace: string, name: string, how: RunPrune, may: string): Promise<RunPruned> =>
    call((c) => c.runs.prune({ params: { namespace, name }, payload: how }), write(RunPruned, may)),
  /** A run's labels edited (`key=value`, `key-`); a changed value needs `overwrite`. */
  labels: (namespace: string, name: string, edit: LabelEdit, may: string): Promise<Labelled> =>
    call((c) => c.runs.labels({ params: { namespace, name }, payload: edit }), write(Labelled, may)),
  /** A run held until the runs `hold.until` names land. */
  hold: (namespace: string, name: string, hold: RunHold, may: string): Promise<RunHeld> =>
    call((c) => c.runs.hold({ params: { namespace, name }, payload: hold }), write(RunHeld, may)),
  /** A person's hold on a run lifted. */
  unhold: (namespace: string, name: string, may: string): Promise<RunHeld> =>
    call((c) => c.runs.unhold({ params: { namespace, name } }), write(RunHeld, may)),
  /** Another try of a step, or with `round` another round of the loop it closes: the ask, written and not yet filed. */
  retry: (namespace: string, name: string, step: string, how: RunRetry, may: string): Promise<RunAsked> =>
    call((c) => c.runs.retry({ params: { namespace, name, step }, payload: how }), write(RunAsked, may)),
  /** A step approved at its gate, or a loop out of rounds taken as it stands. */
  approve: (namespace: string, name: string, step: string, how: RunApprove, may: string): Promise<RunApproved> =>
    call((c) => c.runs.approve({ params: { namespace, name, step }, payload: how }), write(RunApproved, may)),
  /** Words said to a step's running session. */
  say: (namespace: string, name: string, step: string, text: string, may: string): Promise<RunSaid> =>
    call((c) => c.runs.say({ params: { namespace, name, step }, payload: { text } }), write(RunSaid, may)),
};

/** A run's step's reads (`/api/runs/:runId/steps/:step/…`). */
export const steps = {
  /** Every try of a step, earliest first. */
  tries: (runId: string, step: string): Promise<StepTries> => call((c) => c.steps.tries({ params: { runId, step } }), read(StepTries)),
  /** What a step was told. */
  told: (runId: string, step: string): Promise<StepTold> => call((c) => c.steps.told({ params: { runId, step } }), read(StepTold)),
};

/** What a card's start answers: its new run, and the card's name. */
const Started = Schema.Struct({ id: Schema.String, card: Schema.String });

/** The inbox's cards as objects: a card is named by its namespace (its factory, `default` for none) and its name. */
export const cards = {
  /** Every card, of every namespace, that `labelSelector` keeps by its labels, or every card for none (`GET /api/cards`). */
  listAll: (labelSelector?: string): Promise<CardList> =>
    call(
      (c) => c.cards.listAll({ query: labelSelector === undefined ? {} : { labelSelector } }).pipe(Effect.flatMap(listed)),
      read(CardList),
    ),
  /** A card, by its namespace and its name, with its file as written (`status.source`). */
  get: (namespace: string, name: string): Promise<Card> => call((c) => c.cards.get({ params: { namespace, name } }), read(Card)),
  /** A card by its name alone, whichever namespace holds it, with its file as written (`GET /api/cards/:name`): a card's page's read. */
  getAll: (name: string): Promise<Card> => call((c) => c.cards.getAll({ params: { name } }), read(Card)),
  /**
   * A card written whole: its spec as it is to be, its labels, and the `resourceVersion` it was read at, which refuses the write where the
   * card has changed since. `spec.queued` goes back as read. Answers the card as it now reads.
   */
  replace: (namespace: string, name: string, card: CardWrite): Promise<Card> =>
    call(
      (c) => c.cards.update({ params: { namespace, name }, payload: card }),
      write(Card, 'The card may be changed, or not: read the card again before sending it again.'),
    ),
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

/** What a write of a factory's rules, instruction or cost line may have done, and what to look at before writing again. */
const SETTINGS_WRITTEN = "The factory's settings may be changed: read its settings again before changing them again.";

/** A factory, its rules, its instruction and the lines a person types for it (`/api/factories`). */
export const factories = {
  /** Every factory, the default one among them (`GET /api/factories`). */
  listAll: (): Promise<FactoryList> => call((c) => c.factories.listAll({ query: {} }).pipe(Effect.flatMap(listed)), read(FactoryList)),
  /** The factory `name`. */
  get: (name: string): Promise<Factory> => call((c) => c.factories.get({ params: { name } }), read(Factory)),
  /** The lines a person types for the factory `name`: attach, rm, add, schedule, trust, volume, and each unschedule and volume rm. */
  commands: (name: string): Promise<FactoryCommands> => call((c) => c.factories.commands({ params: { name } }), read(FactoryCommands)),
  /** The rules of the factory `name`, what every agent hired into it is told. */
  rules: (name: string): Promise<FactoryRules> => call((c) => c.factories.rules({ params: { name } }), read(FactoryRules)),
  /** `words` written as the rules of the factory `name`: the rules as they then read. */
  putRules: (name: string, words: string): Promise<FactoryRules> =>
    call((c) => c.factories.putRules({ params: { name }, payload: { words } }), write(FactoryRules, SETTINGS_WRITTEN)),
  /** The rules of the factory `name` removed: the rules as they then read, none. */
  deleteRules: (name: string): Promise<FactoryRules> =>
    call((c) => c.factories.deleteRules({ params: { name } }), write(FactoryRules, SETTINGS_WRITTEN)),
  /** The instruction of the factory `name`, what Nemia is to know about it. */
  instruction: (name: string): Promise<FactoryInstruction> =>
    call((c) => c.factories.instruction({ params: { name } }), read(FactoryInstruction)),
  /** The instruction of the factory `name` kept at `place`: a file of its first folder, or the store. */
  putInstruction: (name: string, place: FactoryInstructionWrite): Promise<FactoryInstruction> =>
    call((c) => c.factories.putInstruction({ params: { name }, payload: place }), write(FactoryInstruction, SETTINGS_WRITTEN)),
  /** The instruction of the factory `name` read from `NEMIA.md` of its first folder again. */
  deleteInstruction: (name: string): Promise<FactoryInstruction> =>
    call((c) => c.factories.deleteInstruction({ params: { name } }), write(FactoryInstruction, SETTINGS_WRITTEN)),
  /** `words` written as the instruction the store keeps for the factory `name`. */
  putInstructionWords: (name: string, words: string): Promise<FactoryInstruction> =>
    call((c) => c.factories.putInstructionWords({ params: { name }, payload: { words } }), write(FactoryInstruction, SETTINGS_WRITTEN)),
  /** The instruction the store keeps for the factory `name` removed. */
  deleteInstructionWords: (name: string): Promise<FactoryInstruction> =>
    call((c) => c.factories.deleteInstructionWords({ params: { name } }), write(FactoryInstruction, SETTINGS_WRITTEN)),
  /** The cost line of `workflow` in the factory `name` set to `usd`: the factory as it then reads. */
  putCostLine: (name: string, workflow: string, usd: number): Promise<Factory> =>
    call((c) => c.factories.putCostLine({ params: { name, workflow }, payload: { usd } }), write(Factory, SETTINGS_WRITTEN)),
  /** The cost line of `workflow` in the factory `name` taken off: the factory as it then reads. */
  deleteCostLine: (name: string, workflow: string): Promise<Factory> =>
    call((c) => c.factories.deleteCostLine({ params: { name, workflow } }), write(Factory, SETTINGS_WRITTEN)),
};

/** What a write of a server may have done, and what to look at before writing again. */
const SERVER_WRITTEN = "The server may be recorded: read the factory's servers again before writing them again.";

/** What a sign-in or a sign-out may have done, and what to look at before asking again. */
const SIGN_IN_ASKED = "The sign-in may have changed: read the server's state again before asking again.";

/** A factory's MCP servers, in its namespace (the factory's name), each header's value served masked; and their sign-ins. */
export const mcpServers = {
  /** Every server the factory `namespace` records, with the state its harness reports of each. */
  list: (namespace: string): Promise<McpServerList> =>
    call((c) => c.mcpservers.list({ params: { namespace }, query: {} }).pipe(Effect.flatMap(listed)), read(McpServerList)),
  /** The server `name` recorded as `server`; a header sent as the mask keeps the value stored. */
  put: (namespace: string, name: string, server: McpServerWrite): Promise<McpServer> =>
    call((c) => c.mcpservers.put({ params: { namespace, name }, payload: server }), write(McpServer, SERVER_WRITTEN)),
  /** The server `name` taken off the record: answers it as it was. */
  delete: (namespace: string, name: string): Promise<McpServer> =>
    call((c) => c.mcpservers.delete({ params: { namespace, name } }), write(McpServer, SERVER_WRITTEN)),
  /** A sign-in to the server `name` started: the address the person opens. */
  signIn: (namespace: string, name: string): Promise<SignInStarted> =>
    call((c) => c.mcpservers.signIn({ params: { namespace, name } }), write(SignInStarted, SIGN_IN_ASKED)),
  /** The state of the server `name`'s last sign-in, from the engine's memory. */
  signInState: (namespace: string, name: string): Promise<SignInState> =>
    call((c) => c.mcpservers.signInState({ params: { namespace, name } }), read(SignInState)),
  /**
   * The server `name`'s waiting sign-in handed `url`, the address the person's browser landed on once they approved, where that
   * browser runs on another machine than the daemon: answers the sign-in's state.
   */
  signInCallback: (namespace: string, name: string, url: string): Promise<SignInState> =>
    call((c) => c.mcpservers.signInCallback({ params: { namespace, name }, payload: { url } }), write(SignInState, SIGN_IN_ASKED)),
  /** The server `name` signed out. */
  signOut: (namespace: string, name: string): Promise<SignedOut> =>
    call((c) => c.mcpservers.signOut({ params: { namespace, name } }), write(SignedOut, SIGN_IN_ASKED)),
};

/** Nemia's own servers, which a factory may record (`GET /api/builtin/mcpservers`). */
export const builtin = {
  mcpServers: (): Promise<McpServerList> => call((c) => c.builtin.mcpservers({}), read(McpServerList)),
};

/** A factory's schedules, each named by its workflow. */
export const schedules = {
  list: (namespace: string): Promise<ScheduleList> =>
    call((c) => c.schedules.list({ params: { namespace }, query: {} }), read(ScheduleList)),
  get: (namespace: string, name: string): Promise<Schedule> =>
    call((c) => c.schedules.get({ params: { namespace, name } }), read(Schedule)),
  put: (namespace: string, name: string, schedule: ScheduleWrite): Promise<Schedule> =>
    call(
      (c) => c.schedules.put({ params: { namespace, name }, payload: schedule }),
      write(Schedule, "The schedule may be changed: read the factory's schedules again before writing it again."),
    ),
  delete: (namespace: string, name: string): Promise<Schedule> =>
    call(
      (c) => c.schedules.delete({ params: { namespace, name } }),
      write(Schedule, "The schedule may be removed: read the factory's schedules again before removing it again."),
    ),
};

/** The name of the hire into `step` of `workflow`: the two joined by a dot. */
export const hireName = (workflow: string, step: string): string => `${workflow}.${step}`;

/** What a hire or a fire may have done, and what to look at before sending it again. */
const HIRE_WRITTEN = "The factory's hires may be changed: read the step's page again before hiring or firing again.";

/** A factory's hires, one per step of each workflow it offers, each named `<workflow>.<step>` (`hireName`). */
export const hires = {
  list: (namespace: string): Promise<HireList> => call((c) => c.hires.list({ params: { namespace }, query: {} }), read(HireList)),
  get: (namespace: string, name: string): Promise<Hire> => call((c) => c.hires.get({ params: { namespace, name } }), read(Hire)),
  /** The agent `agent` hired into the step the hire `name` is of: answers the hire as it then reads. */
  put: (namespace: string, name: string, agent: string): Promise<Hire> =>
    call((c) => c.hires.put({ params: { namespace, name }, payload: { agent } }), write(Hire, HIRE_WRITTEN)),
  /** The agent hired into the step the hire `name` is of fired: answers the hire as it then reads. */
  delete: (namespace: string, name: string): Promise<Hire> =>
    call((c) => c.hires.delete({ params: { namespace, name } }), write(Hire, HIRE_WRITTEN)),
};

/** What an approval or a decline may have done, and what to look at before sending it again. */
const PROPOSAL_JUDGED = 'The proposal may be judged: read it again on its page before approving or declining it again.';

/** A factory's proposals, each a change to its definitions waiting on, or judged by, an approval. */
export const proposals = {
  list: (namespace: string): Promise<ProposalList> =>
    call((c) => c.proposals.list({ params: { namespace }, query: {} }), read(ProposalList)),
  get: (namespace: string, name: string): Promise<Proposal> =>
    call((c) => c.proposals.get({ params: { namespace, name } }), read(Proposal)),
  /** The proposal `name` approved, the person's: answers it as it then reads, applied where it applies at approval. */
  approve: (namespace: string, name: string): Promise<Proposal> =>
    call((c) => c.proposals.approve({ params: { namespace, name } }), write(Proposal, PROPOSAL_JUDGED)),
  /** The proposal `name` declined, the person's: answers it as it then reads. */
  decline: (namespace: string, name: string): Promise<Proposal> =>
    call((c) => c.proposals.decline({ params: { namespace, name } }), write(Proposal, PROPOSAL_JUDGED)),
};

/** What a delegation's write may have done, and what to look at before sending it again. */
const DELEGATION_WRITTEN = "The factory's delegations may be changed: read its settings again before writing one again.";

/** A factory's delegations, each named after the agent it lets approve proposals within its grants; written by the person alone. */
export const delegations = {
  list: (namespace: string): Promise<DelegationList> =>
    call((c) => c.delegations.list({ params: { namespace }, query: {} }), read(DelegationList)),
  /** The delegation of the agent `name` written whole as `spec`: answers it as it then reads. */
  put: (namespace: string, name: string, spec: DelegationWrite): Promise<Delegation> =>
    call((c) => c.delegations.put({ params: { namespace, name }, payload: spec }), write(Delegation, DELEGATION_WRITTEN)),
  /** The delegation of the agent `name` removed: answers it as it read. */
  delete: (namespace: string, name: string): Promise<Delegation> =>
    call((c) => c.delegations.delete({ params: { namespace, name } }), write(Delegation, DELEGATION_WRITTEN)),
};

/**
 * Which definition a read is of, beside its namespace: `origin`, the place it is read from, shadowed or not (none: the one the namespace
 * serves at each name); and `repo`, the factory's repository it is read on, sent as `?repo=` as every read of a factory's says it.
 */
type DefinitionRead = { origin?: DefinitionOrigin; repo?: string };

/** The `?origin=` of `at`, none for none. */
const originOf = (at: DefinitionRead | undefined): { origin?: string } => (at?.origin ? { origin: at.origin } : {});

/** The `?repo=` of `at`, sent beside the keys the Api declares; none for none. */
const repoOf = (at: DefinitionRead | undefined): Record<string, string> | undefined => (at?.repo ? { repo: at.repo } : undefined);

/** Every item of a list read page by page: `page` asked again with each `continue` its answer gives, until one gives none. */
async function everyPage<T>(page: (next: string | undefined) => Promise<{ metadata: { continue?: string }; items: readonly T[] }>) {
  const items: T[] = [];
  let next: string | undefined;
  do {
    const answer = await page(next);
    items.push(...answer.items);
    next = answer.metadata.continue;
  } while (next !== undefined);
  return items;
}

/** What a write of a workflow may have done, and what to look at before writing again. */
const WORKFLOW_WRITTEN = 'The folder may be written: reload the Workflows page before writing it again.';

/**
 * A namespace's workflows (`default`: the api's repository and your library), each the factory's resolved view of its name; yours made,
 * written and removed in `default` alone. A write takes `refuse`, what its refusal is built as (a `WriteRefusal` for none).
 */
export const workflows = {
  /** Every workflow the namespace serves, every page of it. */
  list: (namespace: string, at?: DefinitionRead): Promise<Workflow[]> =>
    everyPage((next) =>
      call(
        (c) => c.workflows.list({ params: { namespace }, query: { ...originOf(at), ...(next === undefined ? {} : { continue: next }) } }),
        read(WorkflowList, repoOf(at)),
      ),
    ),
  get: (namespace: string, name: string, at?: DefinitionRead): Promise<Workflow> =>
    call((c) => c.workflows.get({ params: { namespace, name }, query: originOf(at) }), read(Workflow, repoOf(at))),
  create: (namespace: string, body: WorkflowCreate, refuse?: Refuse): Promise<Workflow> =>
    call((c) => c.workflows.create({ params: { namespace }, payload: body }), write(Workflow, WORKFLOW_WRITTEN, undefined, refuse)),
  replace: (namespace: string, name: string, body: WorkflowWrite, refuse?: Refuse): Promise<Workflow> =>
    call((c) => c.workflows.replace({ params: { namespace, name }, payload: body }), write(Workflow, WORKFLOW_WRITTEN, undefined, refuse)),
  /** The workflow `name` removed, against the `resourceVersion` it was read at. */
  delete: (namespace: string, name: string, resourceVersion: string, refuse?: Refuse): Promise<Workflow> =>
    call(
      (c) => c.workflows.delete({ params: { namespace, name }, query: { resourceVersion } }),
      write(Workflow, 'The folder may be removed: reload the Workflows page before removing it again.', undefined, refuse),
    ),
  /** A step of the workflow `name`, for its page: its keys, its layers, its hires and its recent runs, read where `at` says. */
  step: (namespace: string, name: string, step: string, at?: DefinitionRead): Promise<WorkflowStepPage> =>
    call((c) => c.workflows.step({ params: { namespace, name, step }, query: originOf(at) }), read(WorkflowStepPage, repoOf(at))),
  /** Every key a step's form sets, how, and what it means (`GET /api/workflows/keys`). */
  keys: (): Promise<KeyForm> => call((c) => c.workflows.keys(), read(KeyForm)),
};

/** What an agent's write may have done, and what to look at before writing it again. */
const AGENT_WRITTEN = 'The agent may be written: read it again on its page before writing it again.';

/** A namespace's agents, as its workflows: yours made, written and removed in `default`; tried; and read as an A2A card. */
export const agents = {
  list: (namespace: string, at?: DefinitionRead): Promise<Agent[]> =>
    everyPage((next) =>
      call(
        (c) =>
          c.agents
            .list({ params: { namespace }, query: { ...originOf(at), ...(next === undefined ? {} : { continue: next }) } })
            .pipe(Effect.flatMap(listed)),
        read(AgentList, repoOf(at)),
      ),
    ),
  get: (namespace: string, name: string, at?: DefinitionRead): Promise<Agent> =>
    call((c) => c.agents.get({ params: { namespace, name }, query: originOf(at) }), read(Agent, repoOf(at))),
  create: (namespace: string, body: AgentWrite, refuse?: Refuse): Promise<Agent> =>
    call((c) => c.agents.create({ params: { namespace }, payload: body }), write(Agent, AGENT_WRITTEN, undefined, refuse)),
  replace: (namespace: string, name: string, body: AgentWrite, refuse?: Refuse): Promise<Agent> =>
    call((c) => c.agents.replace({ params: { namespace, name }, payload: body }), write(Agent, AGENT_WRITTEN, undefined, refuse)),
  delete: (namespace: string, name: string, resourceVersion: string, refuse?: Refuse): Promise<Agent> =>
    call(
      (c) => c.agents.delete({ params: { namespace, name }, query: { resourceVersion } }),
      write(Agent, AGENT_WRITTEN, undefined, refuse),
    ),
  /** A try of the agent `name` on `brief`: the run it started. */
  try: (namespace: string, name: string, brief: string, refuse?: Refuse): Promise<AgentTried> =>
    call(
      (c) => c.agents.try({ params: { namespace, name }, payload: { brief } }),
      write(AgentTried, 'The try may have started: look on the Runs page before trying the agent again.', undefined, refuse),
    ),
  card: (namespace: string, name: string, at?: DefinitionRead): Promise<AgentCard> =>
    call((c) => c.agents.card({ params: { namespace, name }, query: originOf(at) }), read(AgentCard, repoOf(at))),
};

/** What a skill's write may have done, and what to look at before writing it again. */
const SKILL_WRITTEN = 'The skill may be written: read the skills again before writing it again.';

/** A namespace's skills: yours made and written in `default`, a builtin one copied to yours, and a folder's files by path. */
export const skills = {
  list: (namespace: string, at?: DefinitionRead): Promise<Skill[]> =>
    everyPage((next) =>
      call(
        (c) =>
          c.skills
            .list({ params: { namespace }, query: { ...originOf(at), ...(next === undefined ? {} : { continue: next }) } })
            .pipe(Effect.flatMap(listed)),
        read(SkillList, repoOf(at)),
      ),
    ),
  get: (namespace: string, name: string, at?: DefinitionRead): Promise<Skill> =>
    call((c) => c.skills.get({ params: { namespace, name }, query: originOf(at) }), read(Skill, repoOf(at))),
  create: (namespace: string, body: SkillWrite, refuse?: Refuse): Promise<Skill> =>
    call((c) => c.skills.create({ params: { namespace }, payload: body }), write(Skill, SKILL_WRITTEN, undefined, refuse)),
  replace: (namespace: string, name: string, body: SkillWrite, refuse?: Refuse): Promise<Skill> =>
    call((c) => c.skills.replace({ params: { namespace, name }, payload: body }), write(Skill, SKILL_WRITTEN, undefined, refuse)),
  /** The builtin skill `name` copied into your library: the copy, as yours. */
  copy: (namespace: string, name: string, refuse?: Refuse): Promise<Skill> =>
    call((c) => c.skills.copy({ params: { namespace, name } }), write(Skill, SKILL_WRITTEN, undefined, refuse)),
  files: (namespace: string, name: string, at?: DefinitionRead): Promise<SkillFiles> =>
    call((c) => c.skills.files({ params: { namespace, name }, query: originOf(at) }), read(SkillFiles, repoOf(at))),
};
