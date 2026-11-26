/**
 * The first card's reads and writes, and "You are set"'s, as the api answers them, for their stories (`Pages/Welcome first card`,
 * `Pages/You are set`), each typed by `objects`' own types so a key the api renames fails the typecheck here: the factory `acme` with the
 * workflows it offers and its first volume (`Factory`), its lines with and without the host its template follows (`FactoryCommands`),
 * each workflow it offers, an `implement` step then its ending step `land` (`Workflow`), the stats of a workflow's landed runs (`Stats`),
 * the quota, the milestones, a card filed (`Card`) and started (`CardStarted`). Each
 * story makes its own store (`firstCardStore`); `filed` holds what the page wrote, in order.
 */
import { delay, http, HttpResponse } from 'msw';
import type { Card, CardStarted, Factory, FactoryList, FactoryVolume, Milestones, Quota, Workflow, WorkflowList } from 'objects';
import { UNSET } from '../../src/lib/builder';

/** The factory the card is filed in. */
const ACME = 'acme';

/** The run the start answers with. */
export const STARTED_RUN = 'r-first';

/** Each write a story's handlers were sent, its route and its body, in order: a play reads what the page sent. */
export const filed: { route: string; body: unknown }[] = [];

/** The quota, fresh, beside the cost line. */
const QUOTA: Quota = {
  state: 'fresh',
  askedAt: '2026-11-18T10:00:00.000Z',
  ageMs: 60_000,
  againAt: '2026-11-18T10:05:00.000Z',
  subscription: 'max',
  windows: [{ key: 'five_hour', label: '5-hour', usedPercentage: 12, resetsAt: '2026-11-18T14:00:00.000Z', reset: false, marked: false }],
  last: null,
  keepMs: 300_000,
  markAt: 80,
  said: null,
};

/** `acme`'s lines, with the host its template follows where `follows`. */
const commandsOf = (follows: boolean) => ({
  attach: `nemia factory attach ${ACME} <workflow>`,
  rm: `nemia factory rm ${ACME}`,
  add: `nemia factory add ${ACME}`,
  schedule: `nemia schedule add <workflow> -n ${ACME}`,
  trust: `nemia factory trust ${ACME}`,
  volume: `nemia factory volume add ${ACME} <path>:rw`,
  trigger: `nemia factory trigger ${ACME} <name> --labels <key>=<value> --to <workflow>`,
  unschedule: {},
  volumeRm: {},
  ...(follows
    ? { follow: { host: 'github.com', parameter: 'github', line: `nemia factory diff ${ACME} --to 4.9.0 --set github=true` } }
    : {}),
});

/** A factory named `name` as the api serves it, offering `workflows`, given `volumes`, and naming `quick` for a first card. */
const factoryFixture = (name: string, workflows: string[], volumes: FactoryVolume[]) => ({
  apiVersion: 'nemia/v1',
  kind: 'Factory',
  metadata: { name, creationTimestamp: '2026-11-18T10:00:00.000Z', resourceVersion: '1' },
  spec: { hires: {}, volumes, workflows, firstWorkflow: 'quick' },
  status: { conditions: [], untrusted: [] },
}) satisfies Factory;

/** The stats of a workflow's landed runs: `landed` of them, each about 14 minutes and $3.20, or none. */
const statsOf = (landed: number) => ({
  from: null,
  to: '2026-11-18',
  by: null,
  filters: {},
  all: { total: { runs: landed, landed, costPerLanded: landed ? 3.2 : null, timePerLanded: landed ? 14 * 60_000 : null } },
  groups: [],
  unreadable: [],
  health: {},
});

/** The milestones, the landing `done` or next. */
const milestonesOf = (landed: boolean) => ({
  milestones: [
    { name: 'harness', state: 'done', message: 'a harness is installed and signed in' },
    { name: 'factory', state: 'done', message: 'a factory is filed' },
    { name: 'volume', state: 'done', message: 'a writable volume is mounted and trusted' },
    {
      name: 'landed',
      state: landed ? 'done' : 'next',
      message: landed ? 'a run landed' : 'start a first card, and merge its change into the base branch',
    },
  ],
}) satisfies Milestones;

/** The body of a request, as a record. */
const bodyOf = async (request: Request) => {
  const body: unknown = await request.json();
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
};

/** A step of a listed workflow, every key unset but where it works: `base` for its ending step, which lands. */
const listedStep = (name: string, workspace: 'base' | null) => ({
  name,
  spec: { ...UNSET, workspace },
  body: '',
  own: null,
  hired: null,
  layers: null,
  mcp: [],
});

/** The workflow `name` as `acme` lists it on its repository: an `implement` step, then `land`, its ending step. */
const workflowFixture = (name: string) => ({
  apiVersion: 'nemia/v1',
  kind: 'Workflow',
  metadata: { name, namespace: ACME, creationTimestamp: '2026-11-01T00:00:00.000Z', resourceVersion: `${name}-1` },
  spec: { steps: [] },
  status: {
    origin: 'factory',
    dir: `/home/you/.agent-workflows/factories/${ACME}/tree/workflows/${name}`,
    description: null,
    needs: [],
    readmeBody: null,
    graph: {
      roots: ['implement'],
      edges: [{ from: 'implement', to: 'land', kind: 'after' }],
      nodes: [
        { name: 'implement', kind: 'step' },
        { name: 'land', kind: 'step' },
      ],
    },
    steps: [listedStep('implement', null), listedStep('land', 'base')],
    schemas: [],
    folderTeam: false,
    error: null,
    unfilled: null,
  },
}) satisfies Workflow;

/** What a store of a story holds: the workflows `acme` offers, its first volume's origin, how many quick runs landed, and more. */
type Held = {
  workflows?: string[];
  origin?: string;
  landedRuns?: number;
  landed?: boolean;
  follows?: boolean;
  refuses?: string;
};

/**
 * The handlers of a store that holds the factory `acme`, its own for one story.
 * @param held What the store holds: by default quick offered, a folder of this machine, no landed run, a host followed.
 */
export const firstCardStore = ({ workflows = ['build', 'quick'], origin, landedRuns = 0, landed = false, follows = true, refuses }: Held = {}) => {
  const volume: FactoryVolume = { name: 'app', path: '/home/you/code/app', readOnly: false, ...(origin === undefined ? {} : { origin }) };
  return [
    http.get('/api/factories', () =>
      HttpResponse.json({
        apiVersion: 'nemia/v1',
        kind: 'FactoryList',
        metadata: {},
        items: [factoryFixture('default', [], []), factoryFixture(ACME, workflows, [volume])],
      } satisfies FactoryList),
    ),
    http.get('/api/factories/:name/commands', () => HttpResponse.json(commandsOf(follows))),
    http.get('/api/namespaces/:namespace/workflows', () =>
      HttpResponse.json({ apiVersion: 'nemia/v1', kind: 'WorkflowList', metadata: {}, items: workflows.map(workflowFixture) } satisfies WorkflowList),
    ),
    http.get('/api/namespaces/:namespace/schedules', () =>
      HttpResponse.json({ apiVersion: 'nemia/v1', kind: 'ScheduleList', metadata: {}, items: [] }),
    ),
    http.get('/api/stats', () => HttpResponse.json(statsOf(landedRuns))),
    http.get('/api/quota', () => HttpResponse.json(QUOTA)),
    http.get('/api/readiness/milestones', () => HttpResponse.json(milestonesOf(landed))),
    http.post('/api/namespaces/:namespace/cards', async ({ request }) => {
      const body = await bodyOf(request);
      filed.push({ route: 'POST cards', body });
      const card: Card = {
        apiVersion: 'nemia/v1',
        kind: 'Card',
        metadata: { name: 'first-card', namespace: ACME, creationTimestamp: '2026-11-18T10:00:00.000Z', resourceVersion: '1' },
        spec: { body: String(body.body) },
        status: { state: 'filed', runs: [], inPlay: true, title: 'first card', file: 'first-card.md' },
      };
      return HttpResponse.json(card, { status: 201 });
    }),
    http.post('/api/namespaces/:namespace/cards/:name/start', async ({ request }) => {
      filed.push({ route: 'POST start', body: await bodyOf(request) });
      await delay(50);
      if (refuses !== undefined) return HttpResponse.json({ error: refuses }, { status: 409 });
      return HttpResponse.json({ id: STARTED_RUN, card: 'first-card' } satisfies CardStarted, { status: 201 });
    }),
  ];
};
