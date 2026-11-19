/**
 * The factory step's reads and writes as the api answers them, for its stories (`Pages/Welcome factory` and its parts): the templates
 * Nemia ships typed by `objects`' own `Template` and `TemplateList`, an apply answered by its `FactoryApplied` and a filing by its
 * `FactoryCreated`, so a key the api renames fails the typecheck here; and the MSW handlers a story names in `parameters.msw`, each
 * write's body kept in `sent` for its play to read.
 */
import { delay, http, HttpResponse } from 'msw';
import type { FactoryApplied, FactoryCreated, Template, TemplateList } from 'objects';

/** sdlc, as the api serves it: a team that builds software, its workflows and agents read. */
export const SDLC: Template = {
  apiVersion: 'nemia/v1',
  kind: 'Template',
  metadata: { name: 'sdlc', creationTimestamp: '2026-11-18T10:00:00.000Z', resourceVersion: '1' },
  spec: {
    version: '3.11.0',
    description: 'A software team: an idea to an intent, an intent to main through a design, an implement and a review.',
    parameters: {},
    hires: { 'build/implement': 'grace', 'build/review': 'agora' },
  },
  status: {
    source: 'builtin:sdlc',
    digest: 'sha256:1',
    workflows: ['build', 'intake', 'janitor', 'quick'],
    agents: ['agora', 'argus', 'grace', 'iris', 'otto', 'seldon'],
    skills: ['implement-a-change'],
  },
};

/** A template Nemia cannot read: it says why, and cannot be picked. */
export const BROKEN: Template = {
  ...SDLC,
  metadata: { ...SDLC.metadata, name: 'broken' },
  spec: { ...SDLC.spec, description: 'A template whose tree does not read.' },
  status: { ...SDLC.status, workflows: [], agents: [], skills: [], problems: ['its nemia.yaml does not read: line 3 is not YAML'] },
};

/** The templates listed: `items` in order, on one page. */
const listOf = (items: readonly Template[]): TemplateList => ({
  apiVersion: 'nemia/v1',
  kind: 'TemplateList',
  metadata: {},
  items: [...items],
});

/** An apply of sdlc answered: the factory `name`, with no volume. */
const applied = (name: string): FactoryApplied => ({
  name,
  volumes: [],
  file: `/home/me/.agent-workflows/factories/${name}.yaml`,
  template: { source: 'builtin:sdlc', version: '3.11.0', params: {} },
  place: 'builtin:sdlc',
  tree: `/home/me/.agent-workflows/factories/${name}/tree`,
  trusts: [],
});

/** A filing answered: the empty factory `name`, with no volume. */
const created = (name: string): FactoryCreated => ({
  name,
  volumes: [],
  file: `/home/me/.agent-workflows/factories/${name}.yaml`,
  trusts: [],
});

/** Each write a story's handlers were sent, its route and its body, in order: a play reads what the page sent. */
export const sent: { route: string; body: unknown }[] = [];

/** The words the api refuses a name taken with. */
export const TAKEN = 'a factory named my-app is already filed: choose another name, or remove it with nemia factory rm my-app';

/** The handlers of a store that serves `items` and answers each write, or refuses each with `TAKEN` (409) where `refuse`. */
const answering = (items: readonly Template[], refuse = false) => [
  http.get('/api/templates', () => HttpResponse.json(listOf(items))),
  http.post('/api/factories/:name/apply', async ({ params, request }) => {
    const name = String(params.name);
    sent.push({ route: `POST /api/factories/${name}/apply`, body: await request.json() });
    await delay(150);
    return refuse ? HttpResponse.json({ error: TAKEN }, { status: 409 }) : HttpResponse.json(applied(name));
  }),
  http.post('/api/factories', async ({ request }) => {
    const body: unknown = await request.json();
    sent.push({ route: 'POST /api/factories', body });
    await delay(150);
    const name = typeof body === 'object' && body !== null ? String(Reflect.get(body, 'name')) : '';
    return refuse ? HttpResponse.json({ error: TAKEN }, { status: 409 }) : HttpResponse.json(created(name));
  }),
];

/** sdlc served, and every write answered. */
export const templatesServed = answering([SDLC]);

/** sdlc served, and every write refused: the name is taken. */
export const writesRefused = answering([SDLC], true);

/** sdlc and a template Nemia cannot read. */
export const oneBroken = answering([SDLC, BROKEN]);
