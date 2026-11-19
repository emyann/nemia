/**
 * What the factory's own parts read, typed by the board's views of `objects`: a factory's block on the Factories canvas (`block`), a
 * workflow it offers on its repository (`listing`), the template it is made from (`template`), its volumes (`volumes`) and its
 * instruction (`instruction`). Each story seeds its query client with them (`seeded`, beside the proposals' fixtures).
 */
import type { FactoryTemplate, FactoryVolume } from '../../src/lib/api/factories';
import type { WorkflowListing } from '../../src/lib/api/workflows';
import { FACTORY, factoryView } from './proposals';

/**
 * The block of the factory `name` on the Factories canvas: on one repository, two runs in flight, one waiting on the person; or, given
 * `error`, a factory whose file does not read.
 * @param name The factory's name.
 * @param error Why its file does not read; null where it does.
 */
export const block = (name: string, error: string | null = null) => ({
  name,
  default: false,
  repos: ['nemia'],
  runs: 3,
  inFlight: 2,
  waitsOnYou: 1,
  workflows: 2,
  hires: 4,
  error,
});

/** The factory the start's stories start in, offering `build` and `quick`: on one repository, or on two where `repos` says so. */
export const offering = (repos: readonly string[] = ['/work/nemia']) => ({
  ...factoryView(FACTORY),
  worksOn: [...repos],
  workflows: ['build', 'quick'],
});

/**
 * The workflow `name` as the factory offers it on its repository, from its own tree: it starts, or, given `unfilled`, the steps its hires
 * leave with no agent say why it cannot.
 * @param name The workflow's name.
 * @param unfilled Why a run of it cannot start in the factory; null where it can.
 */
export const listing = (name: string, unfilled: string | null = null) => ({
  name,
  from: 'repo',
  dir: `/work/nemia/workflows/${name}`,
  description: name === 'build' ? 'An intent to main: design, implement, review, land.' : 'A card that settles its change, to main.',
  readme: null,
  steps: [],
  graph: { roots: [], edges: [] },
  schemas: [],
  folderTeam: false,
  version: `${name}-1`,
  error: null,
  unfilled,
}) satisfies WorkflowListing;

/** The template the factory is made from, before the daemon has rendered it: no parameters, no condition. */
export const unrendered: FactoryTemplate = { source: 'builtin:sdlc', version: '3.11.0', params: {}, applied: null, conditions: [] };

/** The same template rendered, with its parameters and the daemon's conditions, one of them amiss. */
export const rendered: FactoryTemplate = {
  source: 'builtin:sdlc',
  version: '3.11.0',
  params: { github: true, landingRefresh: 'node packages/templates/released.ts cut' },
  applied: '3.11.0',
  conditions: [
    { type: 'Applied', status: 'True', reason: 'Rendered', message: 'its tree is the template at 3.11.0' },
    { type: 'ConflictsPending', status: 'True', reason: 'Conflicts', message: 'a file of its tree was edited by hand: an upgrade conflicts there' },
  ],
};

/** A folder the factory's runs read, and one they write. */
export const volumes: FactoryVolume[] = [
  { path: '/srv/notes', readOnly: true, origin: null, commands: { rm: `nemia volume rm notes -n ${FACTORY}` } },
  { path: '/srv/scratch', readOnly: false, origin: null, commands: { rm: `nemia volume rm scratch -n ${FACTORY}` } },
];

/**
 * The factory's instruction: kept in the store, its words given; or, with `store` false, read from `NEMIA.md` in its folder.
 * @param store Whether the store keeps it.
 */
export const instruction = (store: boolean) => ({
  name: FACTORY,
  path: null,
  store,
  file: store ? `/store/factories/${FACTORY}/NEMIA.md` : '/work/nemia/NEMIA.md',
  words: 'Nemia builds Nemia: ask before a change to the store, and land nothing on a Friday.',
  error: null,
  stored: store,
});

/**
 * Why `workflow` cannot start in the factory: its implement step, which its hires leave with no agent, and the hire that fills it.
 * @param workflow The workflow's name.
 */
export const unfilled = (workflow: string) =>
  `implement: no agent fills it in ${FACTORY}: nemia factory hire ${FACTORY} <agent> --step ${workflow}/implement`;
