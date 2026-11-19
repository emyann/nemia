/**
 * The volume step's reads and writes as the api answers them, for its stories (`Pages/Welcome volume`), each typed by `objects`' own
 * types so a key the api renames fails the typecheck here: the person's folder listing (`FolderNames`), a folder made a repository and a
 * new one (`RepositoryMade`), the factory `acme` with its volumes and the places a harness does not trust (`Factory`), its lines
 * (`FactoryCommands`), a volume added (`VolumeAdded`), its trust given (`FactoryTrusted`), the milestones and the readiness read. Each
 * story makes its own store (`volumeStore`), so what one story writes no other reads; `sent` holds what the page wrote, in order.
 */
import { delay, http, HttpResponse } from 'msw';
import type {
  Factory,
  FactoryCommands,
  FactoryList,
  FactoryTrusted,
  FactoryUntrusted,
  FactoryVolume,
  FolderNames,
  Milestones,
  Readiness,
  RepositoryMade,
  VolumeAdded,
} from 'objects';

/** The factory the step gives its work. */
export const ACME = 'acme';

/** The person's home, under which the listing names folders. */
const HOME = '/home/you';

/** The folders under `~/code`, as the listing answers them: two repositories and a folder that is none. */
const CODE = ['acme', 'nemia', 'notes'];

/** The one folder of `CODE` that is no git repository. */
const PLAIN = `${HOME}/code/notes`;

/** Where a new repository is made, in the store. */
const REPOSITORIES = `${HOME}/.agent-workflows/repositories`;

/** What is withheld from a place no harness trusts yet. */
const WITHHELD = "the folder's own settings, hooks and MCP servers";

/** Each write a story's handlers were sent, its route and its body, in order: a play reads what the page sent. */
export const sent: { route: string; body: unknown }[] = [];

/** The lines a person types for `acme`. */
const COMMANDS: FactoryCommands = {
  attach: `nemia factory attach ${ACME} <workflow>`,
  rm: `nemia factory rm ${ACME}`,
  add: `nemia factory add ${ACME}`,
  schedule: `nemia schedule add <workflow> -n ${ACME}`,
  trust: `nemia factory trust ${ACME}`,
  volume: `nemia factory volume add ${ACME} <path>:rw`,
  unschedule: {},
  volumeRm: {},
};

/** The milestones with the volume in `state`: the harness and the factory done, the landing later. */
const milestones = (volume: 'done' | 'next', waiting = false): Milestones => ({
  milestones: [
    { name: 'harness', state: 'done', message: 'a harness is installed and signed in' },
    { name: 'factory', state: 'done', message: 'a factory is filed' },
    {
      name: 'volume',
      state: volume,
      message:
        volume === 'done'
          ? 'a writable volume is mounted and trusted'
          : waiting
            ? `the factory ${ACME} has a writable volume that waits on your trust: trust it from the factory's Settings, or type nemia factory trust ${ACME}`
            : 'give a factory a writable volume, trusted, that its runs work in',
    },
    { name: 'landed', state: volume === 'done' ? 'next' : 'later', message: 'start a first card, and merge its change into the base branch' },
  ],
});

/** The readiness read, holding one missing need of `acme`'s workflow: the host's sign-in its template declares, with its typed fix. */
const READINESS: Readiness = {
  ready: false,
  ran: true,
  pieces: [
    {
      name: 'gh-sign-in',
      area: 'workflow',
      state: 'missing',
      message: 'gh is signed in to github.com, so a run can push its branch and open its pull request',
      fixes: [{ message: 'sign in to github.com with gh', command: 'gh auth login', startable: false, kind: 'typed' }],
      factory: ACME,
      workflow: 'build',
      cost: 'run',
    },
  ],
};

/** What the store of a story holds: `acme`'s volumes and the places a harness does not trust. */
type Held = { volumes: FactoryVolume[]; untrusted: FactoryUntrusted[] };

/** `acme` as the api serves it from `held`. */
const factoryOf = (held: Held): Factory => ({
  apiVersion: 'nemia/v1',
  kind: 'Factory',
  metadata: { name: ACME, creationTimestamp: '2026-11-18T10:00:00.000Z', resourceVersion: '1' },
  spec: { hires: {}, volumes: held.volumes },
  status: { conditions: [], untrusted: held.untrusted },
});

/** The body of a request, as a record. */
const bodyOf = async (request: Request): Promise<Record<string, unknown>> => {
  const body: unknown = await request.json();
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
};

/**
 * The handlers of a store that holds the factory `acme`, its own for one story: no volume to begin with, or, given `held`, a writable
 * one trusted already; a harness that keeps a trust where `keepsTrust`, so a writable volume added waits on it.
 * @param options What the store holds to begin with.
 */
export const volumeStore = ({ held = false, keepsTrust = true }: { held?: boolean; keepsTrust?: boolean } = {}) => {
  const store: Held = { volumes: held ? [{ name: 'acme', path: `${HOME}/code/acme`, readOnly: false }] : [], untrusted: [] };
  const done = () => store.volumes.some((v) => !v.readOnly && !store.untrusted.some((u) => u.place === v.path));
  return [
    http.get('/api/factories', () =>
      HttpResponse.json({
        apiVersion: 'nemia/v1',
        kind: 'FactoryList',
        metadata: {},
        items: [{ ...factoryOf({ volumes: [], untrusted: [] }), metadata: { name: 'default', creationTimestamp: '2026-11-18T10:00:00.000Z', resourceVersion: '1' } }, factoryOf(store)],
      } satisfies FactoryList),
    ),
    http.get('/api/factories/:name', () => HttpResponse.json(factoryOf(store))),
    http.get('/api/factories/:name/commands', () => HttpResponse.json(COMMANDS)),
    http.get('/api/readiness/milestones', () =>
      HttpResponse.json(milestones(done() ? 'done' : 'next', store.volumes.some((v) => !v.readOnly))),
    ),
    http.get('/api/readiness', () => HttpResponse.json(READINESS)),
    http.get('/api/folders', ({ request }) => {
      const typed = new URL(request.url).searchParams.get('path') ?? '';
      const dir = typed.endsWith('/') ? typed.replace(/\/+$/, '') : typed.slice(0, typed.lastIndexOf('/'));
      const piece = typed.endsWith('/') ? '' : typed.slice(typed.lastIndexOf('/') + 1);
      const names = dir === `${HOME}/code` ? CODE.filter((n) => n.startsWith(piece)) : dir === HOME ? ['code'].filter((n) => n.startsWith(piece)) : [];
      const folder = CODE.some((n) => typed === `${HOME}/code/${n}`);
      return HttpResponse.json({ path: dir, names, more: false, folder, repository: folder && typed !== PLAIN } satisfies FolderNames);
    }),
    http.post('/api/folders/repository', async ({ request }) => {
      const body = await bodyOf(request);
      sent.push({ route: 'POST /api/folders/repository', body });
      await delay(100);
      return HttpResponse.json({ path: String(body.path), made: true } satisfies RepositoryMade);
    }),
    http.post('/api/repositories', async ({ request }) => {
      const body = await bodyOf(request);
      sent.push({ route: 'POST /api/repositories', body });
      await delay(100);
      return HttpResponse.json({ path: `${REPOSITORIES}/${String(body.name)}`, made: true } satisfies RepositoryMade);
    }),
    http.post('/api/factories/:factory/volumes', async ({ request }) => {
      const body = await bodyOf(request);
      sent.push({ route: `POST /api/factories/${ACME}/volumes`, body });
      await delay(100);
      const given = String(body.volume);
      const readOnly = given.endsWith(':ro');
      const target = given.replace(/:(ro|rw)$/, '');
      const path = target.startsWith('/') ? target : `${HOME}/.agent-workflows/clones/${target.replace(/^.*[/:]/, '').replace(/\.git$/, '')}`;
      const volume: FactoryVolume = { path, readOnly, ...(target.startsWith('/') ? {} : { origin: target }) };
      store.volumes.push(volume);
      if (!readOnly && keepsTrust) store.untrusted.push({ place: path, harness: 'Claude Code', withheld: WITHHELD });
      return HttpResponse.json({ file: `${HOME}/.agent-workflows/factories/${ACME}.json`, volume, was: null, trusts: [] } satisfies VolumeAdded);
    }),
    http.post('/api/factories/:name/trust', async () => {
      sent.push({ route: `POST /api/factories/${ACME}/trust`, body: {} });
      await delay(100);
      const trusts = store.untrusted.map((u) => ({
        place: u.place,
        harness: u.harness,
        folder: u.place,
        grants: WITHHELD,
        back: 'claude config remove trust',
        wrote: true,
        refused: null,
      }));
      store.untrusted = [];
      return HttpResponse.json({ name: ACME, trusts } satisfies FactoryTrusted);
    }),
  ];
};
