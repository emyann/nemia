/**
 * A watched kind's objects served at their revision: every object of a kind the keyspace watches (`isWatchedKind`) leaves the api with
 * `metadata.resourceVersion` the keyspace revision of its last change — the highest among the records it is made of — and every list of
 * one with `metadata.resourceVersion` the keyspace head read before its items were, so a watch from it loses no change between the two.
 * A GET writes nothing here, and nothing is kept between two requests.
 */
import type { Context as RequestContext } from 'hono';
import { definitionsRefreshed, isWatchedKind, keyspaceHead, kindRevisions, type WatchedKind } from 'agent-orchestrator';
import type { ApiEnv } from '../layer.ts';
import type { Listed } from '../watch/watch.ts';

/** The kind a `<Kind>List` is of, where the keyspace watches it. */
const watchedListOf = (kind: string | undefined) => {
  const base = kind?.replace(/List$/, '');
  return kind?.endsWith('List') === true && base !== undefined && isWatchedKind(base) ? base : undefined;
};

/** The kinds whose revisions are made of the definition index's records, which a write of one reads again. */
const INDEXED = new Set(['Agent', 'Skill', 'Workflow', 'Template', 'Hire', 'Factory']);

/**
 * Those a read of reads the index again too where no daemon sweeps it: not the Factory, whose read writes nothing — the index holds its
 * rules and instruction as of the daemon's last sweep, or of the last write or proposal that read it.
 */
const INDEXED_ON_READ = new Set(['Agent', 'Skill', 'Workflow', 'Template', 'Hire']);

/** The template a request names (`/api/templates/<name>/…`), whose documents are served at the template's own revision. */
const TEMPLATE_PATH = /^\/api\/templates\/([^/]+)\//;

/** The kinds stamped in a list only: a Run read alone is built per request from parts no revision covers, so it keeps its own version. */
const LISTED_ONLY = new Set<string>(['Run']);

const stampedOf = (body: unknown, asked: readonly string[] = []) => {
  if (typeof body !== 'object' || body === null || !('kind' in body) || typeof body.kind !== 'string') return undefined;
  if (body.kind === 'Table') {
    const kind = asked.map(watchedListOf).find((k) => k !== undefined);
    return kind === undefined ? undefined : { kind, list: true, table: true };
  }
  const list = watchedListOf(body.kind);
  if (list !== undefined) return { kind: list, list: true, table: false };
  return isWatchedKind(body.kind) && !LISTED_ONLY.has(body.kind) ? { kind: body.kind, list: false, table: false } : undefined;
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
 * `list` answering objects of a watched kind at their revision: a list's items each, and its position the head read before it was read; a
 * single object read or written each. Any other answer as it is. The definition index is read again first where a read needs it exact,
 * and after a write of a definition.
 * @param list The handler that answers a request.
 * @param kindsAt The kinds a request's endpoint answers, from its method and its path: none where it answers no object of the api's.
 */
export const revisioned =
  (list: Listed, kindsAt: (method: string, path: string) => readonly string[]) =>
  async (c: RequestContext<ApiEnv>, request = c.req.raw) => {
    const path = new URL(request.url).pathname;
    const kinds = kindsAt(request.method, path);
    if (!kinds.some((kind) => stampedOf({ kind }) !== undefined)) return list(c, request);
    const base = kinds.map((kind) => kind.replace(/List$/, ''));
    const indexed = base.some((kind) => INDEXED.has(kind));
    const reads = request.method === 'GET';
    if (reads && base.some((kind) => INDEXED_ON_READ.has(kind))) await c.var.runtime.runPromise(definitionsRefreshed(false));
    const head =
      reads && kinds.some((kind) => watchedListOf(kind) !== undefined) ? await c.var.runtime.runPromise(keyspaceHead()) : undefined;
    const response = await list(c, request);
    if (indexed && !reads) await c.var.runtime.runPromise(definitionsRefreshed(true));
    if (!response.ok || !(response.headers.get('content-type') ?? '').includes('json')) return response;
    const body: unknown = await response.clone().json();
    const stamped = stampedOf(body, kinds);
    if (stamped === undefined) return response;
    const served = servedAt(body, stamped.list, await revisionsOf(c, path, stamped.kind), head);
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    return new Response(JSON.stringify(served), { status: response.status, headers });
  };
