/**
 * The machine split by factory, without React Flow: a block for each factory, with what it holds; the runs and the queued cards of one
 * factory; where a factory's floor starts a run; and, for the pages that list the whole machine, the factory each run or card is tagged
 * with, the place of a run that a harness does not trust (`untrustedFor`), what the factory picked keeps, the factories a workflow listed
 * with no factory is in, and where the address's place reads a list of
 * workflows. A run or a card belongs to the factory it names, and one naming none to the default factory. Pure.
 */
import { DEFAULT_NAMESPACE } from 'objects';
import { namespaceOf } from './api/namespace.ts';
import type { Factory, FactoryCondition, FactoryUntrusted } from './api/factories.ts';
import type { InboxEntry } from './api/inbox.ts';
import { type OpenRuns } from './api/runs.ts';
import { judged, type UnjudgedRun } from './api/judged.ts';
import type { RunView } from './api/judged.ts';
import type { PagePlace, Place, WorkflowListing } from './api/workflows.ts';
import type { WorkflowPageAddress } from './api/address.ts';
import { inFlight, repoName, waitsOnYou } from './factory.ts';

/**
 * What the blocks read of a run: the factory it names, and what `inFlight` and `waitsOnYou` read; or a run the list could not judge, in
 * flight as the tick counts it, and waiting on nobody.
 */
export type FactoryRun =
  | Pick<RunView, 'factory' | 'status' | 'moving' | 'waitingOnYou' | 'cancelledAt' | 'waiting' | 'holding'>
  | UnjudgedRun;

/** A factory as a block reads it: its name, and whether it is the default factory, which holds whatever names none. */
export type FactoryPlace = Pick<Factory, 'name' | 'default'>;

/**
 * A factory as its block shows it: its name, its repositories by their folders' names, how many runs it holds, how many are in flight as
 * the floor counts them (`inFlight`) and how many wait on you (`waitsOnYou`), how many workflows it offers — null for the default
 * factory, which offers every one — and how many steps it hires into. `error` says why its file does not read; null for every other.
 */
export type FactoryBlock = {
  name: string;
  default: boolean;
  repos: string[];
  runs: number;
  inFlight: number;
  waitsOnYou: number;
  workflows: number | null;
  hires: number;
  error: string | null;
};

/** A place a run works on that a harness does not trust: the place as the api said it, its factory, and the line that trusts it. */
export type UntrustedPlace = { factory: string; trust: string; place: FactoryUntrusted };

/**
 * The untrusted place the run `run` works on, among `factories`: the place of the first factory that lists the run's repository as
 * untrusted. The factory the run names is not asked for: a harness keeps its trust for the folder, whichever factory lists it, so any
 * factory's line that names the folder repairs it. Nothing for a run on no repository, or on a place every harness trusts.
 * @param factories The factories as the api lists them, with their untrusted places and their commands.
 * @param run The run, by its repository; null where it works on none.
 */
export function untrustedFor(factories: readonly Pick<Factory, 'name' | 'untrusted' | 'commands'>[], run: { repo: string | null }) {
  if (run.repo === null) return undefined;
  for (const factory of factories) {
    const place = factory.untrusted.find((u) => u.place === run.repo);
    if (place) return { factory: factory.name, trust: factory.commands.trust, place };
  }
  return undefined;
}

/**
 * Whether the condition `condition` of a factory's template is amiss: `Applied` that is not true, or another (`ConflictsPending`) that
 * is.
 * @param condition The condition, by its type and its status.
 */
export const conditionAmiss = (condition: Pick<FactoryCondition, 'type' | 'status'>) =>
  (condition.type === 'Applied') === (condition.status === 'False');

/** Whether `item` is in `factory`: it names it, or it names none and `factory` is the default. */
const isIn = (item: { factory: string | null }, factory: FactoryPlace) =>
  factory.default ? item.factory === null : item.factory === factory.name;

/**
 * The runs in `factory`, in their order.
 * @param runs The runs to keep from, each by the factory it names (null for none).
 * @param factory The factory, by its name and whether it is the default.
 */
export const runsIn = <T extends { factory: string | null }>(runs: readonly T[], factory: FactoryPlace) =>
  runs.filter((run) => isIn(run, factory));

/**
 * The cards in `factory`, in their order: the queue of its floor keeps these alone.
 * @param cards The inbox's cards.
 * @param factory The factory, by its name and whether it is the default.
 */
export const queuedIn = (cards: readonly InboxEntry[], factory: FactoryPlace) => cards.filter((card) => isIn(card, factory));

/**
 * `factory` as its block and its bar show it, holding those of `runs` that are in it.
 * @param factory The factory as the api answers it.
 * @param runs The runs of the machine, every factory's; those in `factory` are counted.
 */
export const blockOf = (factory: Factory, runs: readonly FactoryRun[]) => {
  const mine = runsIn(runs, factory);
  return {
    name: factory.name,
    default: factory.default,
    repos: factory.worksOn.map(repoName),
    runs: mine.length,
    inFlight: mine.filter((run) => !judged(run) || inFlight(run)).length,
    waitsOnYou: mine.filter((run) => judged(run) && waitsOnYou(run)).length,
    workflows: factory.workflows === null ? null : factory.workflows.length,
    hires: Object.keys(factory.hires).length,
    error: factory.error,
  };
};

/** What a factory's block reads of its light answer: the three counts. */
type OpenBlock = Pick<OpenRuns, 'counts'>;

/**
 * `factory` as its bar shows it, from `open`, the light answer asked for that factory alone: the runs it holds are the three counts
 * together, and those that wait on you and those in flight the api's own counts, a run at its gate that still moves among the waiting
 * alone.
 * @param factory The factory as the api answers it.
 * @param open The light answer asked for that factory alone, by its three counts.
 */
export const openBlockOf = (factory: Factory, open: OpenBlock) => ({
  ...blockOf(factory, []),
  runs: open.counts.waiting + open.counts.inFlight + open.counts.finished,
  inFlight: open.counts.inFlight,
  waitsOnYou: open.counts.waiting,
});

/** `n` of `one`, in words: `1 run`, `3 runs`. */
const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/**
 * What a block offers, in words: the default factory every workflow and no hire; another its workflows and its hires.
 * @param block The factory's block.
 */
export const offerOf = (block: FactoryBlock) =>
  block.workflows === null
    ? 'every workflow · no hires'
    : `${count(block.workflows, 'workflow')} · ${block.hires === 0 ? 'no hires' : count(block.hires, 'hire')}`;

/**
 * What a block's runs are doing, in words: how many are in flight and wait on you, how many it holds, or that it holds none.
 * @param block The factory's block.
 */
export const runsOf = (block: FactoryBlock) =>
  block.runs === 0
    ? 'No runs yet'
    : [`${block.inFlight} in flight`, block.waitsOnYou > 0 && `${block.waitsOnYou} waiting on you`, count(block.runs, 'run')]
        .filter(Boolean)
        .join(' · ');

/**
 * The factories the machine shows, in the order the api lists them, one whose file does not read among them. The default factory is one
 * only while no factory is filed and it holds a run (`held`): an empty default says nothing a person must act on, and once a factory
 * exists every run is started in one, so the default's runs are read on the Runs page alone.
 * @param factories The factories, in the order the api lists them.
 * @param held Whether the default factory holds a run (`holdsRuns`).
 */
export const factoriesShown = <T extends FactoryPlace>(factories: readonly T[], held: boolean) => {
  const named = factories.filter((f) => !f.default);
  return named.length || !held ? named : [...factories];
};

/** Whether a factory holds a run, by the counts of its light answer: the default factory is shown only while it does (`factoriesShown`). */
export const holdsRuns = ({ counts }: { counts: { waiting: number; inFlight: number; finished: number } }) =>
  counts.waiting + counts.inFlight + counts.finished > 0;

/**
 * The blocks of the machine, one for each factory shown (`factoriesShown`), the default one while `held` (its light answer counts a run),
 * each counted off its own light answer (`openBlockOf`) in `opens`, by its name. A factory whose answer is not in `opens` has no block yet.
 * @param factories The factories, in the order the api lists them.
 * @param opens Each factory's light answer, by its name.
 * @param held Whether the default factory's light answer counts a run.
 */
export const openBlocks = (factories: readonly Factory[], opens: ReadonlyMap<string, OpenBlock>, held: boolean) =>
  factoriesShown(factories, held).flatMap((f) => {
    const open = opens.get(f.name);
    return open ? [openBlockOf(f, open)] : [];
  });

/** Why a factory gives a workflow no repository, closed: none to work on, several and none named, a name none has, a name two share. */
type WorkflowRepoRefusal = 'none' | 'unwired' | 'unknown' | 'shared';

/** The repository a workflow starts on in a factory, by its path, or why the factory gives it none, naming the attach that fixes it. */
export type StartRepo = { repo: string } | { refused: WorkflowRepoRefusal; why: string };

/** A factory as `startRepo` reads it: its name, its repositories, its wiring and the line that attaches a workflow. */
type Wired = Pick<Factory, 'name' | 'worksOn' | 'workflowRepos'> & { commands: Pick<Factory['commands'], 'attach' | 'volume'> };

/**
 * The repository a run of `workflow` starts on in `factory`, a mirror of the orchestrator's `workflowRepo`
 * (`packages/agent-orchestrator/src/factory/factory.ts`, proved by its `contracts/workflow-repo.contract.ts`), which places the run: the
 * one whose folder name (`repoName`) the factory's wiring names for the workflow (`workflowRepos`), else its only one. Refused where it
 * works on none (`none`), its `why` naming the factory's volume add (`commands.volume`); or has several and names none (`unwired`),
 * names one none has (`unknown`), or one two share (`shared`), each `why` naming the factory's attach (`commands.attach`, as the api
 * answers it) with `--repo` and the folder names to pick among. Never a card's `repo:`, which is
 * retired: a card names a factory and a workflow, and the factory alone places its run. A prototype's name names no workflow's repository.
 * @param factory The factory: its name, its repositories, its wiring, and the lines that attach a workflow and give it a volume.
 * @param workflow The workflow's name.
 */
export function startRepo(factory: Wired, workflow: string) {
  const wired = Object.hasOwn(factory.workflowRepos, workflow) ? factory.workflowRepos[workflow] : undefined;
  const named = wired === undefined ? factory.worksOn : factory.worksOn.filter((repo) => repoName(repo) === wired);
  const [one, ...more] = named;
  if (one !== undefined && !more.length) return { repo: one } satisfies StartRepo as StartRepo;
  const refused: WorkflowRepoRefusal = !factory.worksOn.length
    ? 'none'
    : wired === undefined
      ? 'unwired'
      : one === undefined
        ? 'unknown'
        : 'shared';
  const names = [...new Set(factory.worksOn.map(repoName))].sort().join(', ') || 'none';
  const attach = `${factory.commands.attach.replace('<workflow>', workflow)} --repo <name>, one of ${names}`;
  const why = {
    none: `The factory ${factory.name} works on no repository yet, so ${workflow} has none to start on: give it one with ${factory.commands.volume}, marked :rw.`,
    unwired: `The factory ${factory.name} works on several repositories and names none for ${workflow}: ${attach}.`,
    unknown: `The factory ${factory.name} names for ${workflow} a folder name none of its repositories has: ${attach}.`,
    shared: `The factory ${factory.name} names for ${workflow} a folder name two of its repositories share, so it cannot tell which: file it on folders of distinct names, or ${attach}.`,
  }[refused];
  return { refused, why } satisfies StartRepo as StartRepo;
}

/** The repository a floor or an address starts on in `factory`: the one `named`, else its only one, else none until a person picks. */
const repoOn = (repos: readonly string[], named: string | null) => named ?? (repos.length === 1 ? (repos[0] ?? null) : null);

/**
 * Where a factory's floor starts a run: the factory, its repositories and the one it starts on — its only one, else null until a person
 * picks — or why it cannot start, for a factory whose file does not read or one on no repository. Null for the default factory, whose
 * floor starts none: a run started from a floor names its factory, and a run in none is started from the Workflows page.
 * @param factory The factory as the api answers it.
 */
export const floorPlace = (factory: Factory) => {
  if (factory.default)
    return null satisfies { factory: string; repos: string[]; repo: string | null } | { why: string } | null as
      | { factory: string; repos: string[]; repo: string | null }
      | { why: string }
      | null;
  if (factory.error !== null)
    return { why: `The factory ${factory.name}'s file does not read: ${factory.error}` } satisfies
      | { factory: string; repos: string[]; repo: string | null }
      | { why: string }
      | null as { factory: string; repos: string[]; repo: string | null } | { why: string } | null;
  if (!factory.worksOn.length) {
    return {
      why: `The factory ${factory.name} works on no volume to start a run on: give it a writable volume with ${factory.commands.volume}.`,
    } satisfies { factory: string; repos: string[]; repo: string | null } | { why: string } | null as
      | { factory: string; repos: string[]; repo: string | null }
      | { why: string }
      | null;
  }
  return { factory: factory.name, repos: factory.worksOn, repo: repoOn(factory.worksOn, null) } satisfies
    | { factory: string; repos: string[]; repo: string | null }
    | { why: string }
    | null as { factory: string; repos: string[]; repo: string | null } | { why: string } | null;
};

/**
 * Why a workflow the factory lists cannot start: its folder's `error`, else the steps its hires leave `unfilled`; null when it can.
 * @param workflow The workflow as the list answers it, by its error and its unfilled steps.
 */
export const whyNotStarted = (workflow: Pick<WorkflowListing, 'error' | 'unfilled'>) => workflow.error ?? workflow.unfilled ?? null;

/**
 * The default factory's two converters, written once in a leaf of `lib/api` so the api's files reach them too: `namespaceOf`, from a
 * factory as the api answers it (null for the default) to its name, and `factoryIn`, from a name back to that form.
 */
export { factoryIn, namespaceOf } from './api/namespace.ts';

/**
 * Whether a run or a card is kept by the filter on the factory `filter` names (`namespaceOf`): every one is when it names none.
 * @param filter The factory's name the page filters by, or undefined where it filters by none.
 */
const keptBy = (filter: string | undefined) => (item: { factory: string | null }) =>
  filter === undefined || namespaceOf(item.factory) === filter;

/**
 * The runs or cards of the factory `filter` names (`keptBy`), in their order; every one when `filter` names none.
 * @param items The runs or cards, each by the factory it names (null for the default).
 * @param filter The factory's name the page filters by, or undefined where it filters by none.
 */
export const shownIn = <T extends { factory: string | null }>(items: readonly T[], filter: string | undefined) =>
  items.filter(keptBy(filter));

/**
 * The factories a workflow listed with no factory is in, by name, sorted, which tag it on the list read with none picked: each named
 * factory whose file reads and that attaches it by its folder's name, on a repository it is found on. One of yours is found on every
 * repository; one of the repository's only on the api's, the default factory's. None while `factories` holds no default factory to say
 * which repository that is. A list read in a named factory is the api's answer there, and is tagged with that factory alone.
 * @param workflow The workflow, by its name and where it was read from.
 * @param factories The factories as the api lists them.
 */
export const workflowFactories = (workflow: Pick<WorkflowListing, 'name' | 'from'>, factories: readonly Factory[]) => {
  const here = factories.find((f) => f.default)?.worksOn[0];
  return factories
    .filter((f) => !f.default && f.error === null && f.workflows !== null && f.workflows.includes(workflow.name))
    .filter((f) => workflow.from === 'user' || (here !== undefined && f.worksOn.includes(here)))
    .map((f) => f.name)
    .sort();
};

/**
 * Where the address's place reads a list of workflows: `every`, with no factory, the list read with none; `in` a named factory on one of
 * its repositories, the api's answer there, with the factory's `repos`; `pick`, for a factory on several repositories whose address names
 * none, which a person picks among; or `refused`, with `why` the factory `factory` lists none.
 */
export type ListPlace =
  | { kind: 'every' }
  | { kind: 'in'; place: Place; repos: string[] }
  | { kind: 'pick'; factory: string; repos: string[] }
  | { kind: 'refused'; factory: string; why: string };

/**
 * Where `address` reads a list of workflows among `factories` (`ListPlace`): `every` for no factory and for the default one; `refused`
 * for a name no factory has, a factory whose file does not read and one on no repository, in `floorPlace`'s words; `in` the factory on
 * the repository the address names, else its only one (`repoOn`); `pick` where it has several and the address names none — never a
 * guess among them, nor the default factory's repository.
 * @param address The address's place: the factory and the repository it names, each where it names one.
 * @param factories The factories as the api lists them.
 */
export const listPlace = (address: PagePlace, factories: readonly Factory[]) => {
  const { factory: name, repo } = address;
  if (name === undefined || name === DEFAULT_NAMESPACE) return { kind: 'every' } satisfies ListPlace as ListPlace;
  const factory = factories.find((f) => f.name === name && !f.default);
  const floor = factory ? floorPlace(factory) : null;
  if (!floor) return { kind: 'refused', factory: name, why: `No factory is named ${name}.` } satisfies ListPlace as ListPlace;
  if ('why' in floor) return { kind: 'refused', factory: name, why: floor.why } satisfies ListPlace as ListPlace;
  const on = repoOn(floor.repos, repo ?? null);
  return (on === null
    ? { kind: 'pick', factory: name, repos: floor.repos }
    : { kind: 'in', place: { factory: name, repo: on }, repos: floor.repos }) satisfies ListPlace as ListPlace;
};

/**
 * The word for where a workflow read from `from` comes from, read in `factory`: `the user library` for one of the user library, anywhere;
 * `the factory's` for one of the factory's own tree; `this repository` for one read with no factory or in the default one; `the factory's`
 * in a named factory, whose folder its page prints — the word a route kept on Hono says `repo` for its tree too (`sourceOf`).
 * @param from Where the workflow was read from, as the list says it.
 * @param factory The factory's name it is read in, or undefined where it is read with none.
 */
export const fromWord = (from: WorkflowListing['from'], factory?: string) => {
  if (from === 'user') return 'the user library';
  if (from === 'factory') return "the factory's";
  return factory === undefined || factory === DEFAULT_NAMESPACE ? 'this repository' : "the factory's";
};

/**
 * The way a factory's own definition — a workflow, an agent or a skill of its tree (origin `factory`) — changes, which the api's refusal of
 * a write to one names (`way: 'factory'`): the board offers no write for one, and says these words in its place. The command itself is the
 * api's to answer, never the board's to spell (`test/structure.test.ts`).
 */
export const FACTORY_WAY = "they change the factory's way, its tree written from the command line, never on the board";

/** The step a new agent is to be hired into once written: a factory, a workflow of yours, and its step. */
export type HirePlace = { factory: string; workflow: string; step: string };

/**
 * The New agent page's search, the step it hires into: the factory (`?into=`), the workflow and the step, all three where the address names
 * each by a string not empty, else none.
 * @param search The page's search, as the router parsed it.
 */
export const hirePlaceOf = (search: Record<string, unknown>) => {
  const { into: factory, workflow, step } = search;
  return typeof factory === 'string' && factory && typeof workflow === 'string' && workflow && typeof step === 'string' && step
    ? { factory, workflow, step }
    : {};
};

/** What follows an agent written from a step's New agent: hired, and back to the step; or the hire's refusal, to say on the creator. */
type HiredOnCreate = { hired: true } | { hired: false; why: string };

/**
 * Hires `agent`, just written, into `place` with `hire`, the board's hire: `hired` once the api takes it, else `why` not, in its words —
 * never a refusal passed over as a hire.
 * @param place The step to hire into: its factory, its workflow and the step's name.
 * @param agent The name of the agent just written.
 * @param hire The board's hire: asks the api to hire an agent into a factory's step, by `<workflow>/<step>`.
 */
export const hireOnCreate = (place: HirePlace, agent: string, hire: (factory: string, step: string, agent: string) => Promise<unknown>) =>
  hire(place.factory, `${place.workflow}/${place.step}`, agent).then(
    () => ({ hired: true }) satisfies HiredOnCreate,
    (error: unknown) => ({ hired: false, why: error instanceof Error ? error.message : String(error) }),
  ) satisfies Promise<HiredOnCreate>;

/**
 * The repository a factory's page is read on, from its address's search: `?repo=` where it names one by a string that is not empty. The
 * factory is its path's (`seatOf`).
 * @param search The page's search, as the router parsed it.
 */
export const pagePlaceOf = (search: Record<string, unknown>) =>
  (typeof search.repo === 'string' && search.repo ? { repo: search.repo } : {}) satisfies { repo?: string } as { repo?: string };

/** The place a run's workflow page is read in, from the address the api gave it: its factory and its repository where it names them. */
export const placeOfAddress = ({ factory, repo }: WorkflowPageAddress) => ({
  ...(factory ? { factory } : {}),
  ...(repo ? { repo } : {}),
});
