/**
 * What a watch from a revision sends of a kind's objects (contracts/kind-watch.contract.ts, `objectChange`, proved law by law), and what
 * each served kind is made of: the records of the keyspace its objects read (`WATCHED_KINDS`), each prefix with the object a key under it
 * names. An object's `resourceVersion` is the highest revision among the records that name it; a watch asked to start after revision `R` is
 * handed the rows written since under each of its kind's prefixes, and an object whose records moved is sent. Pure.
 */
import type { ObjectChangeOf, OwnRow } from '../../contracts/kind-watch.contract.ts';

export type { ObjectChange, OwnRow } from '../../contracts/kind-watch.contract.ts';

/**
 * What a watch sends of an object whose records moved after the revision it starts from.
 * @param after The revision the watch starts after.
 * @param own The latest row of the object's own record written after `after`, or null where only records beside it moved.
 */
export const objectChange: ObjectChangeOf = (after, own) => {
  if (own === null) return 'MODIFIED';
  if (own.createRevision > after) return own.deleted ? 'unseen' : 'ADDED';
  return own.deleted ? 'DELETED' : 'MODIFIED';
};

/**
 * The object a record names: its namespace (none where it names the object in every namespace) and its name (none where it names
 * every object of the namespace).
 */
export type Target = { readonly namespace: string | null; readonly name: string | null };

/** A prefix of the keyspace a kind's objects read, whether its records are the objects' own, and the object a key under it names. */
type Source = { readonly prefix: string; readonly own: boolean; readonly target: (rest: string) => Target | null };

/** The kinds a list serves that are watched from a revision. */
export const WATCHED_KIND_NAMES = [
  'Card',
  'Delegation',
  'Proposal',
  'Subscription',
  'Factory',
  'Hire',
  'Schedule',
  'Trigger',
  'Volume',
  'McpServer',
  'LibraryAdd',
  'Agent',
  'Skill',
  'Workflow',
  'Template',
] as const;

/** A kind a list serves that is watched from a revision. */
export type WatchedKind = (typeof WATCHED_KIND_NAMES)[number];

/** The prefix of the definition index's records (`src/definition-index`). */
export const DEFINITIONS_PREFIX = '/registry/definitions/';

const byName = (rest: string) => ({ namespace: null, name: rest }) satisfies Target;
const inNamespace = (rest: string) => {
  const at = rest.indexOf('/');
  return at < 0 ? null : ({ namespace: rest.slice(0, at), name: rest.slice(at + 1) } satisfies Target);
};
const ofFactory = (rest: string) => ({ namespace: rest, name: null }) satisfies Target;
const ofFactoryNamed = (rest: string) => ({ namespace: null, name: rest }) satisfies Target;

/**
 * The object a definition index record names (`<scope>/<kind>/<name>`) where it is of `kind`: a factory's scope names its namespace, the
 * library's and the builtin's every namespace.
 * @param kind The kind of definition the object is: agent, skill, workflow or template.
 */
const definitionOf = (kind: string) => (rest: string) => {
  const [scope, of, ...name] = rest.split('/');
  if (scope === undefined || of !== kind || name.length === 0) return null;
  return { namespace: scope.startsWith('_') ? null : scope, name: decodeURIComponent(name.join('/')) } satisfies Target;
};

/** The definition index's records of workflows of a factory: what each of its Hires reads. */
const workflowsOfFactory = (rest: string) => {
  const [scope, of] = rest.split('/');
  return scope === undefined || of !== 'workflow' || scope.startsWith('_') ? null : ({ namespace: scope, name: null } satisfies Target);
};

/** The records each watched kind's objects are made of, by the prefixes of the keyspace. */
export const WATCHED_KINDS = {
  Card: [
    { prefix: '/registry/cards/', own: true, target: byName },
    { prefix: '/registry/cardtries/', own: false, target: byName },
    { prefix: '/registry/claims/', own: false, target: byName },
  ],
  Delegation: [{ prefix: '/registry/delegations/', own: true, target: inNamespace }],
  Proposal: [{ prefix: '/registry/proposals/', own: true, target: inNamespace }],
  Subscription: [
    { prefix: '/registry/subscriptions/', own: true, target: byName },
    { prefix: '/registry/deliveries/', own: false, target: byName },
  ],
  Factory: [
    { prefix: '/registry/factories/', own: true, target: ofFactoryNamed },
    { prefix: '/registry/levels/', own: false, target: ofFactoryNamed },
    { prefix: '/registry/applied/', own: false, target: ofFactoryNamed },
    { prefix: '/registry/servers/', own: false, target: ofFactoryNamed },
  ],
  Hire: [
    { prefix: '/registry/factories/', own: false, target: ofFactory },
    { prefix: DEFINITIONS_PREFIX, own: false, target: workflowsOfFactory },
  ],
  Schedule: [
    { prefix: '/registry/factories/', own: false, target: ofFactory },
    { prefix: '/registry/applied/', own: false, target: ofFactory },
  ],
  Trigger: [
    { prefix: '/registry/factories/', own: false, target: ofFactory },
    { prefix: '/registry/applied/', own: false, target: ofFactory },
  ],
  Volume: [{ prefix: '/registry/factories/', own: false, target: ofFactory }],
  McpServer: [
    { prefix: '/registry/factories/', own: false, target: ofFactory },
    { prefix: '/registry/servers/', own: false, target: ofFactory },
  ],
  LibraryAdd: [{ prefix: '/registry/factories/', own: false, target: ofFactory }],
  Agent: [{ prefix: DEFINITIONS_PREFIX, own: true, target: definitionOf('agent') }],
  Skill: [{ prefix: DEFINITIONS_PREFIX, own: true, target: definitionOf('skill') }],
  Workflow: [{ prefix: DEFINITIONS_PREFIX, own: true, target: definitionOf('workflow') }],
  Template: [{ prefix: DEFINITIONS_PREFIX, own: true, target: definitionOf('template') }],
} as const satisfies Record<WatchedKind, readonly Source[]>;

/**
 * Whether a kind a list serves is watched from a revision.
 * @param kind The kind of the list's objects, as its `<Kind>List` names it.
 */
export const isWatchedKind = (kind: string): kind is WatchedKind => Object.hasOwn(WATCHED_KINDS, kind);

/** One row a watch is handed: the key, its revision, the revision of its life's first row, whether it deletes. */
export type RowSeen = { readonly key: string; readonly revision: number; readonly createRevision: number; readonly deleted: boolean };

/** What the watch sends of one object or one namespace's objects: where it is, how it changed and the revision it is at. */
export type KindChange = {
  readonly namespace: string | null;
  readonly name: string | null;
  readonly change: 'ADDED' | 'MODIFIED' | 'DELETED';
  readonly revision: number;
};

/**
 * The changes the rows written after `after` make to the objects of `kind`, in the order of the revision each object came to: each row
 * under a prefix of the kind names an object (or every one of a namespace); of an object its own record's latest row decides
 * (`objectChange`), and an object only records beside it moved is MODIFIED; one made and removed since `after` is sent nothing.
 * @param kind The kind watched.
 * @param after The revision the watch starts after.
 * @param rows Every row written after `after` under a prefix of the kind, in revision order, with the prefix it was read under.
 */
export const changesOf = (kind: WatchedKind, after: number, rows: readonly (RowSeen & { readonly prefix: string })[]) => {
  const sources: readonly Source[] = WATCHED_KINDS[kind];
  const seen = new Map<string, { target: Target; own: OwnRow | null; revision: number }>();
  for (const row of rows) {
    const source = sources.find((s) => s.prefix === row.prefix);
    const target = source?.target(row.key.slice(row.prefix.length));
    if (source === undefined || target === undefined || target === null) continue;
    const id = `${target.namespace ?? '*'}\0${target.name ?? '*'}`;
    const held = seen.get(id);
    const own: OwnRow | null = source.own
      ? { createRevision: row.createRevision, revision: row.revision, deleted: row.deleted }
      : (held?.own ?? null);
    seen.set(id, { target, own, revision: Math.max(row.revision, held?.revision ?? 0) });
  }
  return [...seen.values()]
    .flatMap(({ target, own, revision }) => {
      const change = objectChange(after, own);
      return change === 'unseen' ? [] : [{ ...target, change, revision } satisfies KindChange];
    })
    .sort((a, b) => a.revision - b.revision);
};

/**
 * The revision each object of `kind` is at: the highest among the live records that name it.
 * @param kind The kind served.
 * @param held Each prefix of the kind with the live records under it and their revisions.
 */
export const revisionTable = (kind: WatchedKind, held: ReadonlyMap<string, ReadonlyMap<string, number>>) => {
  const exact = new Map<string, number>();
  const named = new Map<string, number>();
  const inSpace = new Map<string, number>();
  let all = 0;
  for (const source of WATCHED_KINDS[kind] as readonly Source[]) {
    for (const [key, revision] of held.get(source.prefix) ?? []) {
      const target = source.target(key.slice(source.prefix.length));
      if (target === null) continue;
      const bump = (map: Map<string, number>, id: string) => map.set(id, Math.max(map.get(id) ?? 0, revision));
      if (target.namespace !== null && target.name !== null) bump(exact, `${target.namespace}\0${target.name}`);
      else if (target.name !== null) bump(named, target.name);
      else if (target.namespace !== null) bump(inSpace, target.namespace);
      else all = Math.max(all, revision);
    }
  }
  return (namespace: string | undefined, name: string) =>
    Math.max(
      all,
      named.get(name) ?? 0,
      namespace === undefined ? 0 : (inSpace.get(namespace) ?? 0),
      namespace === undefined ? 0 : (exact.get(`${namespace}\0${name}`) ?? 0),
    );
};
