/**
 * The definitions as the api's tests read them: a Workflow, an Agent or a Skill object (definitions/) laid out as the listing its tests
 * assert on — its name, its origin as `from`, its version, and its status beside its spec — so a test re-pointed from a retired route keeps
 * its assertions. Read over `on`, an app, in the namespace `ns` (`default` unless named).
 */
type Requesting = { request: (url: string, init?: RequestInit) => Response | Promise<Response> };
type Obj = { metadata: { name: string; resourceVersion: string }; spec: Record<string, unknown>; status: Record<string, unknown> };

/** An object as its listing: its status, its spec, its name, `from` its origin, `version` its resourceVersion. */
export const asListing = <T = Record<string, unknown>>(o: Obj): T =>
  ({
    ...o.status,
    ...o.spec,
    name: o.metadata.name,
    from: o.status.origin,
    version: o.metadata.resourceVersion,
    steps: o.status.steps,
    body: o.spec.instructions ?? o.spec.body,
    schema: o.spec.output,
  }) as T;

/**
 * A Workflow as the listing the retired `GET /api/workflows` answered: the graph without the nodes the object adds, nor the edges an
 * `input:` draws, which `graphOf` never drew.
 */
export const asWorkflowListing = (o: Obj) => {
  const s = o.status as Record<string, unknown> & { graph: { roots: unknown; edges: Array<{ kind?: string }> } };
  return {
    name: o.metadata.name,
    from: s.origin,
    dir: s.dir,
    description: o.spec.description,
    readme: o.spec.readme,
    steps: s.steps,
    graph: { roots: s.graph.roots, edges: s.graph.edges.filter((e) => e.kind !== 'input') },
    schemas: s.schemas,
    folderTeam: s.folderTeam,
    version: o.metadata.resourceVersion,
    error: s.error,
    unfilled: s.unfilled,
  };
};

/** An Agent as the listing the retired `GET /api/agents` answered (`LibraryAgent`): its spec's lines, and its status but the origin. */
export const asAgentListing = (o: Obj) => {
  const { origin, shadowedBy: _shadowedBy, revision: _revision, ...status } = o.status;
  const { instructions, output, ...lines } = o.spec;
  return {
    ...lines,
    ...status,
    name: o.metadata.name,
    from: origin,
    version: o.metadata.resourceVersion,
    body: instructions,
    schema: output,
  };
};

/** The objects of `plural` in `ns`, each as its listing, `query` the list's (`origin=yours`, `repo=…`). */
export async function listedIn<T = Record<string, unknown>>(on: Requesting, plural: string, query = '', ns = 'default'): Promise<T[]> {
  const res = await on.request(`/api/namespaces/${ns}/${plural}${query ? `?${query}` : ''}`);
  const body = (await res.json()) as { items?: Obj[]; error?: string };
  if (!body.items) throw new Error(`GET ${plural} answered ${res.status}: ${body.error}`);
  return body.items.map(
    (o) => (plural === 'workflows' ? asWorkflowListing(o) : plural === 'agents' ? asAgentListing(o) : asListing(o)) as T,
  );
}

/** Every origin's of `plural` in `ns`, each listed whole, shadowed or not, in the lookup order. */
export async function everyOrigin<T = Record<string, unknown>>(on: Requesting, plural: string, ns = 'default', query = ''): Promise<T[]> {
  const out: T[] = [];
  for (const origin of ['factory', 'repo', 'yours', 'builtin'])
    out.push(...(await listedIn<T>(on, plural, `origin=${origin}${query ? `&${query}` : ''}`, ns)));
  return out;
}

/**
 * The workflows of the factory and the repository `query` names (`factory=<name>&repo=<path>`, the namespace and the `?repo=` of the
 * objects' path), laid out as the retired `GET /api/workflows` listed them: the tree's, the repository's and yours, each folder once but
 * the repository's a tree shadows. A refusal is answered as it is, its status and its body.
 */
export async function workflowsListed<T = ReturnType<typeof asWorkflowListing>>(
  on: Requesting,
  query = '',
): Promise<{ status: number; body: T[] }> {
  const asked = new URLSearchParams(query);
  const ns = asked.get('factory') ?? 'default';
  const repo = asked.get('repo');
  const out: T[] = [];
  for (const origin of ['factory', 'repo', 'yours']) {
    const res = await on.request(
      `/api/namespaces/${encodeURIComponent(ns)}/workflows?origin=${origin}${repo === null ? '' : `&repo=${encodeURIComponent(repo)}`}`,
    );
    const body = (await res.json()) as { items?: Obj[] };
    if (!body.items) return { status: res.status, body: body as never };
    out.push(...body.items.filter((o) => o.status.shadowedBy !== 'factory').map((o) => asWorkflowListing(o) as T));
  }
  return { status: 200, body: out };
}
