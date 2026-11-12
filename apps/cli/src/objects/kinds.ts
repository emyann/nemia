/**
 * How each kind the api serves is called (`KIND_CALLS`), total over `objects`' `KINDS`: a kind added to the package fails this client's
 * typecheck until it is mapped here, and an endpoint renamed fails it too, each call being the typed client's (`src/objects.ts`). Each
 * entry holds closures over the client: its list, in a namespace or across all where the api has one, every page of it read as one
 * (`everyPage`); its read of one, in a namespace
 * or across all by its store-wide name (the Run's, the Card's, the Event's) where the api has one; and, for a kind `nemia apply` writes,
 * how the spec a file holds is read (`prepared`) and made the payload of its create and its update.
 *
 * What apply can write: a Workflow, an Agent and a Skill are made and written whole; a McpServer, a Schedule and a Hire are written by a
 * PUT that makes one where none is (`upsert`); a Card is written whole and never made here, the api naming a filed card from its idea
 * (`nemia inbox add`); a Delegation is written by a PUT that makes one where none is, as a McpServer; a Proposal is read here and made
 * by `nemia propose` alone, which reads the objects as they are served and asks the api to judge them. The Run, the Factory, the Volume,
 * the Template, the Subscription and the Event take no write.
 */
import { Effect, Schema } from 'effect';
import {
  AgentSpec,
  CardSpec,
  DelegationSpec,
  HireSpec,
  type Kind,
  McpServerSpec,
  Missing,
  type ObjectMeta,
  ProposalSpec,
  ScheduleSpec,
  SkillSpec,
  WorkflowSpec,
} from 'objects';
import { everyPage, type ObjectsClient, type PageAsked, pageOf } from '../objects.ts';

/** What every kind's metadata carries: a Run served before it had one carries no `resourceVersion`. */
export type ServedMeta = Pick<ObjectMeta, 'name' | 'namespace' | 'labels' | 'creationTimestamp'> & {
  readonly resourceVersion?: string;
};

/** An object as any kind serves it: its kind, its metadata, its spec and its status. */
export type Served = {
  readonly apiVersion: string;
  readonly kind: string;
  readonly metadata: ServedMeta;
  readonly spec?: unknown;
  readonly status?: unknown;
};

/** A page of a list of any kind. */
export type Page = { readonly items: readonly Served[] };

/** What a call asks of the client. */
export type Call<A> = (client: ObjectsClient) => Effect.Effect<A, unknown>;

/** An object of a file as a write reads it: its name, its namespace, its labels and the version it was read at, where it says them. */
export type Applied = {
  readonly name: string;
  readonly namespace: string;
  readonly labels: Readonly<Record<string, string>> | undefined;
  readonly resourceVersion: string | undefined;
};

/** The spec of a file read as the kind's own (`spec`, what apply compares), and its writes, each of the object it names. */
export type Prepared = {
  readonly spec: unknown;
  readonly create?: (applied: Applied) => Call<Served>;
  readonly update?: (applied: Applied) => Call<Served>;
};

/** What `nemia apply` can do with a kind: read a file's spec as its own, or say why it cannot. */
export type Writes = {
  /** Whether it makes an object (`create`), writes one (`update`), and whether the write makes a missing one (`upsert`). */
  readonly create: boolean;
  readonly update: boolean;
  readonly upsert: boolean;
  /** Whether its write carries the object's labels: only then are they compared, and written. */
  readonly labels: boolean;
  /** The command that makes one where apply cannot: the Card's `nemia inbox add`. */
  readonly madeBy?: string;
  /** The file's spec read as the kind's, beside the object served (null for none), and its writes; a string where it is not one. */
  readonly prepared: (spec: unknown, served: Served | null) => Prepared | string;
};

/** How a kind is called: listed and read, in a namespace and across all where the api has each, and written where it takes a write. */
export type KindCalls = {
  readonly list: {
    readonly in?: (namespace: string, labelSelector: readonly string[]) => Call<Page>;
    readonly all?: (labelSelector: readonly string[]) => Call<Page>;
  };
  readonly get: {
    readonly in?: (namespace: string, name: string) => Call<Served>;
    readonly all?: (name: string) => Call<Served>;
  };
  readonly writes?: Writes;
};

/** A list's query: the page asked, and the selectors, sent as `labelSelector` where any was given. */
const query = (labelSelector: readonly string[], page: PageAsked) => (labelSelector.length ? { ...page, labelSelector } : page);

/** `spec` read by `decode`, or why it is not one: the decoder's own words. */
function decoded<S>(decode: (spec: unknown) => S, spec: unknown): { spec: S } | string {
  try {
    return { spec: decode(spec) };
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/** A kind's writes from its spec's Schema: `writesOf` makes its create and update of the spec read. */
function writable<S>(
  decode: (spec: unknown) => S,
  how: Omit<Writes, 'prepared'>,
  writesOf: (spec: S) => Omit<Prepared, 'spec'>,
  kept: (spec: S, served: Served | null) => S = (spec) => spec,
): Writes {
  return {
    ...how,
    prepared: (raw, served) => {
      const read = decoded(decode, raw);
      if (typeof read === 'string') return read;
      const spec = kept(read.spec, served);
      return { spec, ...writesOf(spec) };
    },
  };
}

/**
 * A card's spec with its `queued` as the file says it, or, where the file leaves the key out, as the api serves it: the queue is `nemia
 * inbox queue`'s and the tick's, so a file that says another time is sent as it is and refused by the api, naming that command, and a
 * file written by hand with no `queued` keeps the card's.
 */
const queuedAsServed = (spec: CardSpec, served: Served | null): CardSpec => {
  if (spec.queued !== undefined) return spec;
  const was = typeof served?.spec === 'object' && served.spec !== null && 'queued' in served.spec ? served.spec.queued : undefined;
  return typeof was === 'string' ? { ...spec, queued: was } : spec;
};

/** A namespace's object by its name, and the list of a namespace's. */
const params = ({ namespace, name }: Applied) => ({ params: { namespace, name } });

export const KIND_CALLS: { readonly [K in Kind]: KindCalls } = {
  Run: {
    list: {
      in: (namespace, s) => (c) => pageOf(everyPage((page) => c.runs.list({ params: { namespace }, query: query(s, page) }))),
      all: (s) => (c) => pageOf(everyPage((page) => c.runs.listAll({ query: query(s, page) }))),
    },
    get: {
      in: (namespace, name) => (c) => c.runs.get({ params: { namespace, name } }),
      all: (name) => (c) => c.runs.show({ params: { name } }),
    },
  },
  Card: {
    list: {
      in: (namespace, s) => (c) => pageOf(everyPage((page) => c.cards.list({ params: { namespace }, query: query(s, page) }))),
      all: (s) => (c) => pageOf(everyPage((page) => c.cards.listAll({ query: query(s, page) }))),
    },
    get: {
      in: (namespace, name) => (c) => c.cards.get({ params: { namespace, name } }),
      all: (name) => (c) => c.cards.getAll({ params: { name } }),
    },
    writes: writable(
      Schema.decodeUnknownSync(CardSpec),
      { create: false, update: true, upsert: false, labels: true, madeBy: 'nemia inbox add "<idea>"' },
      (spec) => ({
        update: (a) => (c) =>
          c.cards.update({
            ...params(a),
            payload: {
              metadata: {
                ...(a.labels !== undefined ? { labels: a.labels } : {}),
                ...(a.resourceVersion !== undefined ? { resourceVersion: a.resourceVersion } : {}),
              },
              spec,
            },
          }),
      }),
      queuedAsServed,
    ),
  },
  Factory: {
    list: { all: (s) => (c) => pageOf(everyPage((page) => c.factories.listAll({ query: query(s, page) }))) },
    get: { all: (name) => (c) => c.factories.get({ params: { name } }) },
  },
  McpServer: {
    list: { in: (namespace, s) => (c) => pageOf(everyPage((page) => c.mcpservers.list({ params: { namespace }, query: query(s, page) }))) },
    get: { in: (namespace, name) => (c) => c.mcpservers.get({ params: { namespace, name } }) },
    writes: writable(Schema.decodeUnknownSync(McpServerSpec), { create: false, update: true, upsert: true, labels: false }, (spec) => ({
      update: (a) => (c) => c.mcpservers.put({ ...params(a), payload: spec }),
    })),
  },
  Schedule: {
    list: { in: (namespace, s) => (c) => everyPage((page) => c.schedules.list({ params: { namespace }, query: query(s, page) })) },
    get: { in: (namespace, name) => (c) => c.schedules.get({ params: { namespace, name } }) },
    writes: writable(Schema.decodeUnknownSync(ScheduleSpec), { create: false, update: true, upsert: true, labels: false }, (spec) => ({
      update: (a) => (c) => c.schedules.put({ ...params(a), payload: spec }),
    })),
  },
  Hire: {
    list: { in: (namespace, s) => (c) => everyPage((page) => c.hires.list({ params: { namespace }, query: query(s, page) })) },
    get: { in: (namespace, name) => (c) => c.hires.get({ params: { namespace, name } }) },
    writes: writable(Schema.decodeUnknownSync(HireSpec), { create: false, update: true, upsert: true, labels: false }, (spec) => ({
      update: (a) => (c) => c.hires.put({ ...params(a), payload: { agent: spec.agent ?? '' } }),
    })),
  },
  Volume: {
    list: { in: (namespace, s) => (c) => everyPage((page) => c.volumes.list({ params: { namespace }, query: query(s, page) })) },
    get: { in: (namespace, name) => (c) => c.volumes.get({ params: { namespace, name } }) },
  },
  Workflow: {
    list: { in: (namespace, s) => (c) => everyPage((page) => c.workflows.list({ params: { namespace }, query: query(s, page) })) },
    get: { in: (namespace, name) => (c) => c.workflows.get({ params: { namespace, name }, query: {} }) },
    writes: writable(Schema.decodeUnknownSync(WorkflowSpec), { create: true, update: true, upsert: false, labels: false }, (spec) => ({
      create: (a) => (c) => c.workflows.create({ params: { namespace: a.namespace }, payload: { metadata: { name: a.name }, spec } }),
      update: (a) => (c) => c.workflows.replace({ ...params(a), payload: { metadata: versioned(a), spec } }),
    })),
  },
  Agent: {
    list: { in: (namespace, s) => (c) => pageOf(everyPage((page) => c.agents.list({ params: { namespace }, query: query(s, page) }))) },
    get: { in: (namespace, name) => (c) => c.agents.get({ params: { namespace, name }, query: {} }) },
    writes: writable(Schema.decodeUnknownSync(AgentSpec), { create: true, update: true, upsert: false, labels: false }, (spec) => ({
      create: (a) => (c) => c.agents.create({ params: { namespace: a.namespace }, payload: { metadata: { name: a.name }, spec } }),
      update: (a) => (c) => c.agents.replace({ ...params(a), payload: { metadata: versioned(a), spec } }),
    })),
  },
  Skill: {
    list: { in: (namespace, s) => (c) => pageOf(everyPage((page) => c.skills.list({ params: { namespace }, query: query(s, page) }))) },
    get: { in: (namespace, name) => (c) => c.skills.get({ params: { namespace, name }, query: {} }) },
    writes: writable(Schema.decodeUnknownSync(SkillSpec), { create: true, update: true, upsert: false, labels: false }, (spec) => ({
      create: (a) => (c) => c.skills.create({ params: { namespace: a.namespace }, payload: { metadata: { name: a.name }, spec } }),
      update: (a) => (c) => c.skills.replace({ ...params(a), payload: { metadata: versioned(a), spec } }),
    })),
  },
  Template: {
    list: { all: (s) => (c) => everyPage((page) => c.templates.listAll({ query: query(s, page) })) },
    get: { all: (name) => (c) => c.templates.get({ params: { name } }) },
  },
  Subscription: {
    list: { all: (s) => (c) => everyPage((page) => c.subscriptions.listAll({ query: query(s, page) })) },
    get: { all: (name) => (c) => c.subscriptions.get({ params: { name } }) },
  },
  Proposal: {
    list: { in: (namespace, s) => (c) => everyPage((page) => c.proposals.list({ params: { namespace }, query: query(s, page) })) },
    get: { in: (namespace, name) => (c) => c.proposals.get({ params: { namespace, name } }) },
    writes: writable(
      Schema.decodeUnknownSync(ProposalSpec),
      { create: false, update: false, upsert: false, labels: false, madeBy: 'nemia propose -f <file>' },
      () => ({}),
    ),
  },
  Delegation: {
    list: { in: (namespace, s) => (c) => everyPage((page) => c.delegations.list({ params: { namespace }, query: query(s, page) })) },
    get: { in: (namespace, name) => (c) => c.delegations.get({ params: { namespace, name } }) },
    writes: writable(Schema.decodeUnknownSync(DelegationSpec), { create: false, update: true, upsert: true, labels: false }, (spec) => ({
      update: (a) => (c) => c.delegations.put({ ...params(a), payload: spec }),
    })),
  },
  Event: {
    list: {
      in: (namespace, s) => (c) => everyPage((page) => c.events.list({ params: { namespace }, query: query(s, page) })),
      all: (s) => (c) => everyPage((page) => c.events.listAll({ query: query(s, page) })),
    },
    get: {
      in: (namespace, name) => (c) => c.events.get({ params: { namespace, name } }),
      all: (name) => (c) => c.events.getAll({ params: { name } }),
    },
  },
};

/** The version a write was read at, where the file says one: a write of a stale one is refused. */
const versioned = (a: Applied) => (a.resourceVersion !== undefined ? { resourceVersion: a.resourceVersion } : {});

/** `call` answering null where the api has no such object (`Missing`), for apply's read before its write. */
export const orNone =
  <A>(call: Call<A>): Call<A | null> =>
  (client) =>
    call(client).pipe(
      Effect.catchIf(
        (err): err is Missing => err instanceof Missing,
        () => Effect.succeed(null),
      ),
    );
