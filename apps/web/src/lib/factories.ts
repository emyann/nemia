/**
 * The machine split by factory, without React Flow: a block for each factory, with what it holds; the runs and the queued cards of one
 * factory; where a factory's floor starts a run; and, for the pages that list the whole machine, the factory each run or card is tagged
 * with, the place of a run that a harness does not trust (`untrustedFor`), what the factory picked keeps, the factories a workflow listed with no factory is in, and where the address's place reads a list of
 * workflows. A run or a card belongs to the factory it names, and one naming none to the default factory. Pure.
 */
import type {
  Factory,
  FactoryCondition,
  FactoryUntrusted,
  InboxEntry,
  OpenRuns,
  PagePlace,
  Place,
  RunSummary,
  WorkflowListing,
  WorkflowPageAddress,
} from './api.ts';
import { inFlight, openRows, repoName, waitsOnYou } from './factory.ts';

/** What the blocks read of a run: the factory it names, and what `inFlight` and `waitsOnYou` read. */
export type FactoryRun = Pick<RunSummary, 'factory' | 'status' | 'moving' | 'waitingOnYou' | 'cancelledAt' | 'waiting' | 'holding'>;

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
 * The untrusted place the run `run` works on, among `factories`: the place of a factory that is the run's repository, in the factory
 * the run names where it names one, else in the first that lists it. Nothing for a run on no repository, on a place every harness
 * trusts, or in a factory that does not list its repository.
 */
export function untrustedFor(
  factories: readonly Pick<Factory, 'name' | 'untrusted' | 'commands'>[],
  run: { repo: string | null; factory?: string | null },
): UntrustedPlace | undefined {
  if (run.repo === null) return undefined;
  for (const factory of factories) {
    if (run.factory !== undefined && run.factory !== factory.name) continue;
    const place = factory.untrusted.find((u) => u.place === run.repo);
    if (place) return { factory: factory.name, trust: factory.commands.trust, place };
  }
  return undefined;
}

/**
 * Whether the condition `condition` of a factory's template is amiss: `Applied` that is not true, or another (`ConflictsPending`) that
 * is.
 */
export const conditionAmiss = (condition: Pick<FactoryCondition, 'type' | 'status'>): boolean =>
  (condition.type === 'Applied') === (condition.status === 'False');

/** Whether `item` is in `factory`: it names it, or it names none and `factory` is the default. */
const isIn = (item: { factory: string | null }, factory: FactoryPlace): boolean =>
  factory.default ? item.factory === null : item.factory === factory.name;

/** The runs in `factory`, in their order. */
export const runsIn = <T extends { factory: string | null }>(runs: readonly T[], factory: FactoryPlace): T[] =>
  runs.filter((run) => isIn(run, factory));

/** The cards in `factory`, in their order: the queue of its floor keeps these alone. */
export const queuedIn = (cards: readonly InboxEntry[], factory: FactoryPlace): InboxEntry[] => cards.filter((card) => isIn(card, factory));

/** `factory` as its block and its bar show it, holding those of `runs` that are in it. */
export const blockOf = (factory: Factory, runs: readonly FactoryRun[]): FactoryBlock => {
  const mine = runsIn(runs, factory);
  return {
    name: factory.name,
    default: factory.default,
    repos: factory.repos.map(repoName),
    runs: mine.length,
    inFlight: mine.filter(inFlight).length,
    waitsOnYou: mine.filter(waitsOnYou).length,
    workflows: factory.workflows === null ? null : factory.workflows.length,
    hires: Object.keys(factory.hires).length,
    error: factory.error,
  };
};

/** What a factory's block reads of its light answer: the three counts, and of each row what `inFlight` reads. */
export type OpenBlock = Pick<OpenRuns, 'counts'> & {
  waiting: ReadonlyArray<Pick<FactoryRun, 'status' | 'moving' | 'waiting' | 'holding'>>;
  inFlight: ReadonlyArray<Pick<FactoryRun, 'status' | 'moving' | 'waiting' | 'holding'>>;
};

/**
 * `factory` as its bar shows it, from `open`, the light answer asked for that factory alone: the runs it holds are the three counts
 * together, those that wait on you the api's count, and those in flight the board's word (`inFlight`) over the rows, a run at its gate
 * that still moves among them.
 */
export const openBlockOf = (factory: Factory, open: OpenBlock): FactoryBlock => ({
  ...blockOf(factory, []),
  runs: open.counts.waiting + open.counts.inFlight + open.counts.finished,
  inFlight: openRows(open).filter(inFlight).length,
  waitsOnYou: open.counts.waiting,
});

/** `n` of `one`, in words: `1 run`, `3 runs`. */
const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** What a block offers, in words: the default factory every workflow and no hire; another its workflows and its hires. */
export const offerOf = (block: FactoryBlock): string =>
  block.workflows === null
    ? 'every workflow · no hires'
    : `${count(block.workflows, 'workflow')} · ${block.hires === 0 ? 'no hires' : count(block.hires, 'hire')}`;

/** What a block's runs are doing, in words: how many are in flight and wait on you, how many it holds, or that it holds none. */
export const runsOf = (block: FactoryBlock): string =>
  block.runs === 0
    ? 'No runs yet'
    : [`${block.inFlight} in flight`, block.waitsOnYou > 0 && `${block.waitsOnYou} waiting on you`, count(block.runs, 'run')]
        .filter(Boolean)
        .join(' · ');

/**
 * The factories the machine shows, in the order the api lists them, one whose file does not read among them. The default factory is one
 * only while no factory is filed and it holds a run (`held`): an empty default says nothing a person must act on, and once a factory
 * exists every run is started in one, so the default's runs are read on the Runs page alone.
 */
export const factoriesShown = <T extends FactoryPlace>(factories: readonly T[], held: boolean): T[] => {
  const named = factories.filter((f) => !f.default);
  return named.length || !held ? named : [...factories];
};

/** The blocks of the machine, one for each factory shown (`factoriesShown`), the default one while a run of `runs` names no factory. */
export const factoryBlocks = (factories: readonly Factory[], runs: readonly FactoryRun[]): FactoryBlock[] =>
  factoriesShown(
    factories,
    runs.some((run) => run.factory === null),
  ).map((f) => blockOf(f, runs));

/**
 * The repository a card starts on in `factory`: the card's `repo:`, else the factory's one repository when it has only one, else null — a
 * person picks it among the factory's.
 */
export const startRepo = (factory: Pick<Factory, 'repos'>, cardRepo: string | null): string | null =>
  cardRepo ?? (factory.repos.length === 1 ? factory.repos[0] : null);

/**
 * Where a factory's floor starts a run: the factory, its repositories and the one it starts on — its only one, else null until a person
 * picks — or why it cannot start, for a factory whose file does not read or one on no repository. Null for the default factory, whose
 * floor starts none: a run started from a floor names its factory, and a run in none is started from the Workflows page.
 */
export const floorPlace = (factory: Factory): { factory: string; repos: string[]; repo: string | null } | { why: string } | null => {
  if (factory.default) return null;
  if (factory.error !== null) return { why: `The factory ${factory.name}'s file does not read: ${factory.error}` };
  if (!factory.repos.length) {
    return {
      why: `The factory ${factory.name} names no repository to start a run on: give its file one, or file it again with ${factory.commands.rm} and ${factory.commands.add}.`,
    };
  }
  return { factory: factory.name, repos: factory.repos, repo: startRepo(factory, null) };
};

/** Why a workflow the factory lists cannot start: its folder's `error`, else the steps its hires leave `unfilled`; null when it can. */
export const whyNotStarted = (workflow: Pick<WorkflowListing, 'error' | 'unfilled'>): string | null =>
  workflow.error ?? workflow.unfilled ?? null;

/** The name the default factory goes by: in a filter, on a tag, and on a card that writes `factory: default`. */
export const DEFAULT_NAME = 'default';

/** The factory a run or a card is tagged with: the one it names, or `default` for one naming none. */
export const factoryOf = (item: { factory: string | null }): string => item.factory ?? DEFAULT_NAME;

/** Whether a run or a card is kept by the filter on the factory `filter` names (`factoryOf`): every one is when it names none. */
export const keptBy =
  (filter: string | undefined) =>
  (item: { factory: string | null }): boolean =>
    filter === undefined || factoryOf(item) === filter;

/** The runs or cards of the factory `filter` names (`keptBy`), in their order; every one when `filter` names none. */
export const shownIn = <T extends { factory: string | null }>(items: readonly T[], filter: string | undefined): T[] =>
  items.filter(keptBy(filter));

/**
 * The factories a workflow listed with no factory is in, by name, sorted, which tag it on the list read with none picked: each named
 * factory whose file reads and that attaches it by its folder's name, on a repository it is found on. One of yours is found on every
 * repository; one of the repository's only on the api's, the default factory's. None while `factories` holds no default factory to say
 * which repository that is. A list read in a named factory is the api's answer there, and is tagged with that factory alone.
 */
export const workflowFactories = (workflow: Pick<WorkflowListing, 'name' | 'from'>, factories: readonly Factory[]): string[] => {
  const here = factories.find((f) => f.default)?.repos[0];
  return factories
    .filter((f) => !f.default && f.error === null && f.workflows !== null && f.workflows.includes(workflow.name))
    .filter((f) => workflow.from === 'yours' || (here !== undefined && f.repos.includes(here)))
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
 * the repository the address names, else its only one (`startRepo`); `pick` where it has several and the address names none — never a
 * guess among them, nor the default factory's repository.
 */
export const listPlace = (address: PagePlace, factories: readonly Factory[]): ListPlace => {
  const { factory: name, repo } = address;
  if (name === undefined || name === DEFAULT_NAME) return { kind: 'every' };
  const factory = factories.find((f) => f.name === name && !f.default);
  const floor = factory ? floorPlace(factory) : null;
  if (!floor) return { kind: 'refused', factory: name, why: `No factory is named ${name}.` };
  if ('why' in floor) return { kind: 'refused', factory: name, why: floor.why };
  const on = startRepo(floor, repo ?? null);
  return on === null
    ? { kind: 'pick', factory: name, repos: floor.repos }
    : { kind: 'in', place: { factory: name, repo: on }, repos: floor.repos };
};

/**
 * The word for where a workflow read from `from` comes from, read in `factory`: `yours` for one of yours anywhere; `this repository` for
 * one read with no factory or in the default one; `the factory's` in a named factory, whose folder its page prints.
 */
export const fromWord = (from: WorkflowListing['from'], factory?: string): string => {
  if (from === 'yours') return 'yours';
  return factory === undefined || factory === DEFAULT_NAME ? 'this repository' : "the factory's";
};

/** The step a new agent is to be hired into once written: a factory, a workflow of yours, and its step. */
export type HirePlace = { factory: string; workflow: string; step: string };

/** The New agent page's search, the step it hires into: all three parts where the address names each by a string not empty, else none. */
export const hirePlaceOf = (search: Record<string, unknown>): Partial<HirePlace> => {
  const { factory, workflow, step } = search;
  return typeof factory === 'string' && factory && typeof workflow === 'string' && workflow && typeof step === 'string' && step
    ? { factory, workflow, step }
    : {};
};

/** What follows an agent written from a step's New agent: hired, and back to the step; or the hire's refusal, to say on the creator. */
export type HiredOnCreate = { hired: true } | { hired: false; why: string };

/**
 * Hires `agent`, just written, into `place` with `hire`, the board's hire: `hired` once the api takes it, else `why` not, in its words —
 * never a refusal passed over as a hire.
 */
export const hireOnCreate = (
  place: HirePlace,
  agent: string,
  hire: (factory: string, step: string, agent: string) => Promise<unknown>,
): Promise<HiredOnCreate> =>
  hire(place.factory, `${place.workflow}/${place.step}`, agent).then(
    (): HiredOnCreate => ({ hired: true }),
    (error: unknown): HiredOnCreate => ({ hired: false, why: error instanceof Error ? error.message : String(error) }),
  );

/**
 * The place a workflow's page or a step's is read in, from its address: `?factory=` as `factorySearch` reads it, and `?repo=` where it
 * names a repository by a string that is not empty.
 */
export const pagePlaceOf = (search: Record<string, unknown>): PagePlace => ({
  ...factorySearch(search),
  ...(typeof search.repo === 'string' && search.repo ? { repo: search.repo } : {}),
});

/** The place a run's workflow page is read in, from the address the api gave it: its factory and its repository where it names them. */
export const placeOfAddress = ({ factory, repo }: WorkflowPageAddress): PagePlace => ({
  ...(factory ? { factory } : {}),
  ...(repo ? { repo } : {}),
});

/** The factory a page's address filters by, `?factory=<name>`: none when it names none, or names it with nothing, or with no string. */
export const factorySearch = (search: Record<string, unknown>): { factory?: string } =>
  typeof search.factory === 'string' && search.factory ? { factory: search.factory } : {};
