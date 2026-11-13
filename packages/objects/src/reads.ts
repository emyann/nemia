/**
 * How each read the api serves is bounded, so that no request makes the daemon build an answer it cannot hold. The numbers: a list's page
 * (`LIST_PAGE`), a conversation's (`TRANSCRIPT_PAGE`), a closeout's body's (`BODY_PAGE`), a log's tail (`LOG_TAIL`), the output field a
 * closeout keeps when none is named (`SHORT_FIELD`), and the most any answer is, its JSON's length, before the api refuses to build it
 * (`ANSWER_MOST`). And `READS`, one entry for every GET endpoint of the `Api`: the shape of its read — a list's page (`page`), a read
 * from a cursor (`cursor`), a whole read by part (`part`), one object (`one`), a stream (`stream`), a file's bytes (`bytes`) — and the
 * query keys that narrow it, which the api's refusal of an answer past its bound names. Typed over every GET name, so a read the `Api`
 * gains with no entry does not compile, and held to each endpoint's query by `readsUnbounded`.
 */
import type { ApiGetName } from './api.ts';
import type { READ_SHAPES } from './words.ts';

/** What a read answers at most: `byDefault` where its count is not asked, and `most` whatever is asked, as Kubernetes' server may. */
export type PageBounds = { readonly byDefault: number; readonly most: number };

/** A list's page: 100 objects where no `limit` is asked, and never more than 500. */
export const LIST_PAGE: PageBounds = { byDefault: 100, most: 500 };

/** A step's conversation's page: 200 events where neither `limit` nor `last` is asked, and never more than 1,000. */
export const TRANSCRIPT_PAGE: PageBounds = { byDefault: 200, most: 1000 };

/** A closeout's body's page, in characters: 40,000 where no `bodyLimit` is asked, and never more than 400,000. */
export const BODY_PAGE: PageBounds = { byDefault: 40_000, most: 400_000 };

/** A step's session output's last lines: 200 where no `tail` is asked, and never more than 2,000. */
export const LOG_TAIL: PageBounds = { byDefault: 200, most: 2000 };

/** The JSON length, in characters, of a closeout's output field kept where no `fields` is named: a longer one is named, to be asked. */
export const SHORT_FIELD = 2000;

/** The most an answer's JSON is, in characters (8 MiB), past which the api refuses it, naming how to narrow it, before building it. */
export const ANSWER_MOST = 8 * 1024 * 1024;

/** The shape of a read (`READ_SHAPES`). */
export type ReadShape = (typeof READ_SHAPES)[number];

/**
 * How one read is bounded: its shape, the query keys that narrow it (each a key its endpoint's query takes), and, for a read that takes
 * none and may still grow, why it is left whole.
 */
export type ReadBound = { readonly shape: ReadShape; readonly narrow?: readonly string[]; readonly why?: string };

/** A list's narrowing keys. */
const LIST: ReadBound = { shape: 'page', narrow: ['limit', 'continue', 'labelSelector'] };

/** A list's narrowing keys, with its `fieldSelector`. */
const LIST_BY_FIELD: ReadBound = { shape: 'page', narrow: ['limit', 'continue', 'labelSelector', 'fieldSelector'] };

/** One object, as small as what it holds. */
const ONE: ReadBound = { shape: 'one' };

/** A closeout read by part: its output's fields by name, its body by page. */
const CLOSEOUT: ReadBound = { shape: 'part', narrow: ['fields', 'bodyFrom', 'bodyLimit'] };

/** How each read of the `Api` is bounded, by its `<group>.<endpoint>` name. */
export const READS: { readonly [K in ApiGetName]: ReadBound } = {
  'runs.listAll': LIST_BY_FIELD,
  'runs.list': LIST_BY_FIELD,
  'runs.get': ONE,
  'runs.show': { shape: 'one', why: "one run judged: its steps' statuses, one line each, its large parts read by their own endpoints" },
  'runs.lines': { shape: 'one', why: 'the lines a run prints, a few per step' },
  'runs.concluded': ONE,
  'runs.record': {
    shape: 'one',
    why: "the run's record as it is on disk, whole for `nemia show --raw`: no step writes into it what grows with its life",
  },
  'runs.decision': { shape: 'part', narrow: ['diffs'] },
  'steps.tries': CLOSEOUT,
  'steps.try': CLOSEOUT,
  'steps.closeout': CLOSEOUT,
  'steps.told': { shape: 'one', why: 'what a step was told once, its instructions as they were written' },
  'steps.log': { shape: 'part', narrow: ['tail'] },
  'steps.artifact': { shape: 'bytes', why: 'a file a step wrote, served as its bytes, never as JSON' },
  'steps.file': { shape: 'bytes', why: 'a file a step wrote, served as its bytes, never as JSON' },
  'steps.path': ONE,
  'steps.transcript': { shape: 'cursor', narrow: ['after', 'limit', 'last', 'kinds'] },
  'steps.transcriptStream': { shape: 'stream', why: 'sent one event at a time, never built as one answer' },
  'cards.listAll': LIST_BY_FIELD,
  'cards.list': LIST_BY_FIELD,
  'cards.get': ONE,
  'cards.getAll': ONE,
  'factories.listAll': LIST,
  'factories.get': ONE,
  'factories.rules': ONE,
  'factories.instruction': ONE,
  'factories.commands': ONE,
  'mcpservers.list': LIST,
  'mcpservers.get': ONE,
  'mcpservers.signInState': ONE,
  'builtin.mcpservers': LIST,
  'schedules.list': LIST,
  'schedules.get': ONE,
  'hires.list': LIST,
  'hires.get': ONE,
  'volumes.list': LIST,
  'volumes.get': ONE,
  'workflows.list': LIST,
  'workflows.get': ONE,
  'workflows.step': ONE,
  'workflows.keys': ONE,
  'agents.list': LIST,
  'agents.get': ONE,
  'agents.card': ONE,
  'agents.sources': ONE,
  'agents.instructions': ONE,
  'skills.list': LIST,
  'skills.get': ONE,
  'skills.files': { shape: 'one', why: "a skill's files by path, as many as its folder holds" },
  'templates.listAll': LIST,
  'templates.get': ONE,
  'templates.workflows': LIST,
  'templates.workflow': ONE,
  'templates.agents': LIST,
  'templates.agent': ONE,
  'templates.skills': LIST,
  'templates.skill': ONE,
  'subscriptions.listAll': LIST,
  'subscriptions.get': ONE,
  'events.listAll': LIST,
  'events.list': LIST,
  'events.getAll': ONE,
  'events.get': ONE,
  'proposals.list': LIST,
  'proposals.get': ONE,
  'delegations.list': LIST,
  'delegations.get': ONE,
  'discovery.resources': ONE,
  'server.health': ONE,
  'server.version': ONE,
  'server.capabilities': ONE,
  'server.repository': ONE,
  'server.store': ONE,
  'server.ceilings': ONE,
  'server.passes': { shape: 'part', narrow: ['last'] },
  'server.series': { shape: 'part', narrow: ['range'] },
  'server.metrics': ONE,
  'server.daemon': ONE,
  'server.quota': ONE,
  'server.stats': { shape: 'part', narrow: ['from', 'to'] },
  'server.paused': ONE,
  'server.pauseNow': ONE,
  'server.pauseTimeout': ONE,
  'server.wait': ONE,
  'server.feed': { shape: 'stream', why: 'sent one line at a time, never built as one answer' },
  'nemia.level': ONE,
  'nemia.memory': { shape: 'one', why: "Nemia's memory, its facts' names and first lines, each fact read by its own endpoint" },
  'nemia.fact': ONE,
  'nemia.policy': ONE,
  'nemia.reach': ONE,
  'nemia.chat': { shape: 'cursor', narrow: ['before', 'limit'] },
  'nemia.chatStream': { shape: 'stream', why: 'sent one message at a time, never built as one answer' },
  'readiness.read': { shape: 'one', why: 'one piece per area and per need the machine and its factories declare' },
  'readiness.fixOf': { shape: 'one', why: 'its output is the tail the orchestrator keeps of it (FIX_TAIL_BYTES), never the whole' },
  'readiness.fixOutput': { shape: 'stream', why: 'sent one chunk at a time, never built as one answer' },
  'upgrades.read': { shape: 'one', why: "the release going back goes to and the store's last upgrade, its output a tail" },
  'upgrades.upgradeOf': { shape: 'one', why: 'its output is the tail the orchestrator keeps of it, never the whole' },
  'upgrades.output': { shape: 'stream', why: 'sent one chunk at a time, never built as one answer' },
  'pairings.list': { shape: 'one', why: 'the tickets a person asked for, each short-lived: a handful at once' },
  'tokens.list': { shape: 'one', why: 'the tokens the person minted, each named by hand or for a client it paired: a handful' },
  'nemia.speakers': ONE,
  'nemia.instructions': ONE,
};

/** The query keys an endpoint takes, read off its query Schema's fields; none for one with no query. */
const queryKeys = (endpoint: { readonly query?: unknown }): readonly string[] => {
  const query = endpoint.query as { readonly schema?: { readonly fields?: object }; readonly fields?: object } | undefined;
  return Object.keys(query?.schema?.fields ?? query?.fields ?? {});
};

/** What an Api is read as here: its groups, each its endpoints by name, with their method and query. */
type ApiRead = {
  readonly groups: Readonly<
    Record<
      string,
      { readonly identifier: string; readonly endpoints: Readonly<Record<string, { readonly method: string; readonly query?: unknown }>> }
    >
  >;
};

/**
 * Each GET endpoint of `api` whose read `reads` does not bound, in words: one with no entry, a `page` whose query takes no `limit` or no
 * `continue`, an entry naming a narrowing key its endpoint's query does not take, and a `one` or `part` read that names neither a key nor
 * why it is left whole is allowed only as `one`. Empty for an Api every read of which is bounded. Pure.
 */
export const readsUnbounded = (api: ApiRead, reads: Readonly<Record<string, ReadBound>> = READS): string[] =>
  Object.values(api.groups).flatMap((group) =>
    Object.entries(group.endpoints)
      .filter(([, endpoint]) => endpoint.method === 'GET')
      .flatMap(([name, endpoint]) => {
        const read = `${group.identifier}.${name}`;
        const bound = reads[read];
        if (bound === undefined) return [`${read} has no entry in READS: say how it is bounded`];
        const keys = queryKeys(endpoint);
        const lacking = (bound.shape === 'page' ? ['limit', 'continue'] : []).filter((key) => !keys.includes(key));
        const unknown = (bound.narrow ?? []).filter((key) => !keys.includes(key));
        return [
          ...lacking.map((key) => `${read} is a page whose query takes no \`${key}\`: give it \`listQuery\``),
          ...unknown.map((key) => `${read} names \`${key}\` to narrow it, which its query does not take`),
          ...(bound.shape !== 'one' && bound.narrow === undefined && bound.why === undefined
            ? [`${read} is read as \`${bound.shape}\` with no key to narrow it and no why`]
            : []),
        ];
      }),
  );
