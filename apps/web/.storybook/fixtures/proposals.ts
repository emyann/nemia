/**
 * A factory's proposals and the reads its pane and its floor draw from, for their stories (`Factory/ProposalCard`, `Frame/FactoryPane`,
 * `Factory/FactoryCanvas`): proposals typed by `objects`' own `Proposal` (`proposal`), so a key the api adds or renames fails the
 * typecheck here first; a factory as the board views it (`factoryView`); a card not started (`unstartedCard`) or queued (`queuedCard`);
 * and the frame's light answer of the runs (`openRuns`). Each story seeds its own query client with them (`seeded`), its queries never
 * asked of the network, so the part draws the state the story names.
 */
import { QueryClient } from '@tanstack/react-query';
import type { Proposal, ProposalPhase } from 'objects';
import type { Factory } from '../../src/lib/api/factories';
import type { InboxEntry } from '../../src/lib/api/inbox';
import type { OpenRuns } from '../../src/lib/api/runs';

/** The factory every fixture here is in. */
export const FACTORY = 'nemia';

/** The instant every fixture is dated to, so a story draws the same words whatever day it is drawn on. */
const AT = '2026-11-15T18:00:00.000Z';

/**
 * A proposal of Nemia's that hires an agent into a step of `build`, in `phase`, widening access where `widens` says so; approved by the
 * person once its phase is past waiting.
 * @param name The proposal's name.
 * @param phase Where it stands.
 * @param widens Whether it widens access.
 */
export const proposal = (name: string, phase: ProposalPhase, widens = false): Proposal => ({
  apiVersion: 'nemia/v1',
  kind: 'Proposal',
  metadata: { name, namespace: FACTORY, creationTimestamp: AT, resourceVersion: `${name}-1` },
  spec: {
    objects: [
      {
        kind: 'Hire',
        verb: 'update',
        metadata: { name: 'build.plan', namespace: FACTORY, resourceVersion: 'hire-1' },
        spec: { workflow: 'build', step: 'plan', agent: 'seldon' },
      },
    ],
    why: 'the plan needs its notes written',
  },
  status: {
    phase,
    proposedBy: { agent: 'nemia' },
    ...(phase === 'waiting' ? {} : { approvedBy: { by: 'person' as const, at: AT } }),
    changes: [{ resource: 'hires', name: 'build.plan', verb: 'update', access: widens ? 'widens' : 'same' }],
    widens,
  },
});

/**
 * The factory `name` as the board views it: one repository, the workflow `build`, nothing scheduled, trusted and mounted.
 * @param name The factory's name.
 * @param isDefault Whether it is the default factory, which holds no proposal.
 */
export const factoryView = (name: string, isDefault = false): Factory => ({
  name,
  default: isDefault,
  worksOn: ['/work/nemia'],
  workflows: ['build'],
  hires: {},
  error: null,
  schedules: [],
  commands: {
    attach: `nemia factory attach ${name} <workflow>`,
    rm: `nemia factory rm ${name}`,
    add: `nemia factory add ${name} --repo /work/nemia`,
    schedule: `nemia schedule add <workflow> -n ${name}`,
    trust: `nemia factory trust ${name}`,
    volume: `nemia volume add <name> -n ${name}`,
  },
  template: null,
  untrusted: [],
  volumes: [],
  costLines: {},
  workflowRepos: { build: 'nemia' },
});

/**
 * A card of `factory` filed and not started.
 * @param name The card's name.
 * @param factory The factory it is filed in.
 */
export const unstartedCard = (name: string, factory: string): InboxEntry => ({
  labels: {},
  name,
  file: `${name}.md`,
  title: name,
  workflow: 'build',
  repo: '/work/nemia',
  factory,
  from: [],
  startedAs: [],
  state: 'filed',
  error: null,
  body: `${name}\n`,
  filedAt: AT,
  factoryRepo: null,
});

/**
 * A card of `factory` queued at `place` in the order the tick starts cards in.
 * @param name The card's name.
 * @param factory The factory it is filed in.
 * @param place Its place in the queue, from 1.
 */
export const queuedCard = (name: string, factory: string, place: number): InboxEntry => ({
  ...unstartedCard(name, factory),
  state: 'queued',
  queued: { at: AT, place },
});

/** The frame's light answer of the runs: `waiting` runs wait on the person, none listed, since the pane reads the counts alone. */
export const openRuns = (waiting: number): OpenRuns => ({
  asOf: AT,
  counts: { waiting, inFlight: 0, finished: 0 },
  waiting: [],
  inFlight: [],
});

/**
 * A query client holding `data` under each key, whose queries never fetch and never go stale: a story's part draws what it is seeded
 * with and asks the network nothing.
 * @param data Each query's key and the data it holds.
 */
export function seeded(data: ReadonlyArray<readonly [readonly unknown[], unknown]>): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false, staleTime: Infinity } } });
  for (const [key, value] of data) client.setQueryData(key, value);
  return client;
}
