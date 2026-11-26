/**
 * What the api stamps with a revision of the keyspace: the objects it serves that no verb of the orchestrator stamps (`atRevisions`) — a
 * Card, a Proposal and a Delegation's list, which the api pages itself, and an Agent, a Skill and a Workflow, which the api builds from
 * the doors' listings. Each leaves with `metadata.resourceVersion` the keyspace revision of its last change, the highest among the records
 * it is made of, and every list of one with the keyspace head read before its items were, so a watch from it loses no change between
 * the two. A GET writes nothing here, in any process, and nothing is kept between two requests: the definition index is numbered with no
 * write (`kindRevisions`).
 */
import type { Context as RequestContext } from 'hono';
import { isWatchedKind, kindRevisions, type WatchedKind } from 'agent-orchestrator';
import type { ApiEnv } from '../layer.ts';
import type { Listed } from '../watch/watch.ts';

/** The kind a `<Kind>List` is of, where the keyspace watches it. */
const watchedListOf = (kind: string | undefined) => {
  const base = kind?.replace(/List$/, '');
  return kind?.endsWith('List') === true && base !== undefined && isWatchedKind(base) ? base : undefined;
};

/** The kinds the api stamps itself: those no verb of the orchestrator stamps. */
const API_STAMPED = new Set<string>(['Card', 'Proposal', 'Delegation', 'Agent', 'Skill', 'Workflow']);

/** The template a request names (`/api/templates/<name>/…`), whose documents are served at the template's own revision. */
const TEMPLATE_PATH = /^\/api\/templates\/([^/]+)\//;

const stampedOf = (body: unknown, asked: readonly string[] = []) => {
  if (typeof body !== 'object' || body === null || !('kind' in body) || typeof body.kind !== 'string') return undefined;
  if (body.kind === 'Table') {
    const kind = asked.map(watchedListOf).find((k) => k !== undefined && API_STAMPED.has(k));
    return kind === undefined ? undefined : { kind, list: true, table: true };
  }
  const list = watchedListOf(body.kind);
  if (list !== undefined) return API_STAMPED.has(list) ? { kind: list, list: true, table: false } : undefined;
  return isWatchedKind(body.kind) && API_STAMPED.has(body.kind) && body.kind !== 'Delegation'
    ? { kind: body.kind, list: false, table: false }
    : undefined;
};

/** `object` with the revision it stands at as its `metadata.resourceVersion`, where it is an object with metadata. */
const withRevision = (object: unknown, revision: (namespace: string | undefined, name: string) => number) => {
  if (typeof object !== 'object' || object === null || !('metadata' in object)) return object;
  const { metadata } = object;
  if (typeof metadata !== 'object' || metadata === null || !('name' in metadata) || typeof metadata.name !== 'string') return object;
  const namespace = 'namespace' in metadata && typeof metadata.namespace === 'string' ? metadata.namespace : undefined;
  return { ...object, metadata: { ...metadata, resourceVersion: String(revision(namespace, metadata.name)) } };
};

/** The revision of each object of a watched kind as the keyspace holds them now: a template's documents all at the template's own. */
async function revisionsOf(c: RequestContext<ApiEnv>, path: string, kind: WatchedKind) {
  const { of } = await c.var.runtime.runPromise(kindRevisions(kind));
  const template = TEMPLATE_PATH.exec(path)?.[1];
  if (template === undefined || kind === 'Template') return of;
  const at = (await c.var.runtime.runPromise(kindRevisions('Template'))).of(undefined, template);
  return () => at;
}

/** `body`, a list or an object of the watched kind, served at the revisions `revision` says, a list at the head it was read at. */
const servedAt = (
  body: unknown,
  list: boolean,
  revision: (namespace: string | undefined, name: string) => number,
  head: number | undefined,
) => {
  if (list && typeof body === 'object' && body !== null && 'rows' in body && Array.isArray(body.rows)) {
    const metadata = 'metadata' in body && typeof body.metadata === 'object' ? body.metadata : {};
    const rows = body.rows.map((row: unknown) =>
      typeof row === 'object' && row !== null && 'object' in row ? { ...row, object: withRevision(row.object, revision) } : row,
    );
    return { ...body, rows, metadata: { ...metadata, ...(head === undefined ? {} : { resourceVersion: String(head) }) } };
  }
  if (!list || typeof body !== 'object' || body === null || !('items' in body) || !Array.isArray(body.items))
    return withRevision(body, revision);
  const metadata = 'metadata' in body && typeof body.metadata === 'object' ? body.metadata : {};
  return {
    ...body,
    items: body.items.map((item: unknown) => withRevision(item, revision)),
    metadata: { ...metadata, ...(head === undefined ? {} : { resourceVersion: String(head) }) },
  };
};

/**
 * `list` answering objects of the kinds the api stamps at their revision: a list's items each, and its position the head read before it
 * was read; a single object read or written each. Any other answer as it is.
 * @param list The handler that answers a request.
 * @param kindsAt The kinds a request's endpoint answers, from its method and its path: none where it answers no object of the api's.
 */
export const revisioned =
  (list: Listed, kindsAt: (method: string, path: string) => readonly string[]) =>
  async (c: RequestContext<ApiEnv>, request = c.req.raw) => {
    const path = new URL(request.url).pathname;
    const kinds = kindsAt(request.method, path);
    if (!kinds.some((kind) => stampedOf({ kind }) !== undefined)) return list(c, request);
    const reads = request.method === 'GET';
    const listed = kinds.map(watchedListOf).find((of) => of !== undefined && API_STAMPED.has(of));
    const head = reads && listed !== undefined ? (await c.var.runtime.runPromise(kindRevisions(listed))).head : undefined;
    const response = await list(c, request);
    if (!response.ok || !(response.headers.get('content-type') ?? '').includes('json')) return response;
    const body: unknown = await response.clone().json();
    const stamped = stampedOf(body, kinds);
    if (stamped === undefined) return response;
    const served = servedAt(body, stamped.list, await revisionsOf(c, path, stamped.kind), head);
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    return new Response(JSON.stringify(served), { status: response.status, headers });
  };
