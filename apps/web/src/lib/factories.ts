/**
 * The machine split by factory, without React Flow: a block for each factory, with what it holds; the runs and the queued cards of one
 * factory; the factories the menu lists; and where a factory's floor starts a run. A run or a card belongs to the factory it names, and one
 * naming none to the default factory. Pure.
 */
import type { Factory, InboxEntry, RunSummary, WorkflowListing } from './api.ts';
import { inFlight, repoName, waitsOnYou } from './factory.ts';

/** What the blocks read of a run: the factory it names, and what `inFlight` and `waitsOnYou` read. */
export type FactoryRun = Pick<RunSummary, 'factory' | 'status' | 'moving' | 'waitingOnYou' | 'cancelledAt' | 'waiting' | 'holding'>;

/** A factory as the menu and a block read it: its name, and whether it is the default factory, which holds whatever names none. */
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

/** Whether `item` is in `factory`: it names it, or it names none and `factory` is the default. */
const isIn = (item: { factory: string | null }, factory: FactoryPlace): boolean =>
  factory.default ? item.factory === null : item.factory === factory.name;

/** The runs in `factory`, in their order. */
export const runsIn = <T extends { factory: string | null }>(runs: readonly T[], factory: FactoryPlace): T[] =>
  runs.filter((run) => isIn(run, factory));

/** The cards in `factory`, in their order: the queue of its floor keeps these alone. */
export const queuedIn = (cards: readonly InboxEntry[], factory: FactoryPlace): InboxEntry[] => cards.filter((card) => isIn(card, factory));

/** `factory` as its block shows it, holding `runs`. */
const blockOf = (factory: Factory, runs: readonly FactoryRun[]): FactoryBlock => {
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

/**
 * The blocks of the machine, one a factory, in the order the api lists them, one whose file does not read among them. The default factory
 * is a block only while no factory is filed and a run names none: an empty default says nothing a person must act on, and once a factory
 * exists every run is started in one, so the default's runs are read on the Runs page alone.
 */
export const factoryBlocks = (factories: readonly Factory[], runs: readonly FactoryRun[]): FactoryBlock[] => {
  const named = factories.filter((f) => !f.default);
  const held = runs.some((run) => run.factory === null);
  return (named.length || !held ? named : factories).map((f) => blockOf(f, runs));
};

/**
 * The repository a card starts on in `factory`: the card's `repo:`, else the factory's one repository when it has only one, else null — a
 * person picks it among the factory's.
 */
export const startRepo = (factory: Pick<Factory, 'repos'>, cardRepo: string | null): string | null =>
  cardRepo ?? (factory.repos.length === 1 ? factory.repos[0] : null);

/** How many factories the menu lists before it offers the rest. */
export const MENU_SHOWN = 5;

/**
 * The factories the menu lists: the first `MENU_SHOWN` of `blocks`, or every one once `all` is asked, and how many it leaves out. The
 * factory named `open`, whose floor is open, is listed all the same: past the first five, it follows them, and they never move.
 */
export const menuFactories = <T extends { name: string }>(
  blocks: readonly T[],
  all: boolean,
  open?: string,
): { shown: T[]; hidden: number } => {
  const first = all ? [...blocks] : blocks.slice(0, MENU_SHOWN);
  const lit = first.some((b) => b.name === open) ? undefined : blocks.find((b) => b.name === open);
  const shown = lit ? [...first, lit] : first;
  return { shown, hidden: blocks.length - shown.length };
};

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
      why: `The factory ${factory.name} names no repository to start a run on: give its file one, or file it again with wf factory rm ${factory.name} and wf factory add ${factory.name} --repo <path>.`,
    };
  }
  return { factory: factory.name, repos: factory.repos, repo: startRepo(factory, null) };
};

/** Why a workflow the factory lists cannot start: its folder's `error`, else the steps its hires leave `unfilled`; null when it can. */
export const whyNotStarted = (workflow: Pick<WorkflowListing, 'error' | 'unfilled'>): string | null =>
  workflow.error ?? workflow.unfilled ?? null;
