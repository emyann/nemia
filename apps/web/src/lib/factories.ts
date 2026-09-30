/**
 * The machine split by factory, without React Flow: a block for each factory, with what it holds; the runs and the queued cards of one
 * factory; and the factories the menu lists. A run or a card belongs to the factory it names, and one naming none to the default factory.
 * Pure.
 */
import type { Factory, InboxEntry, RunSummary } from './api.ts';
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
 * The blocks of the machine, one a factory: the default factory first, and only while a run names no factory — an empty default says
 * nothing a person must act on — then each factory in the order the api lists them, one whose file does not read among them.
 */
export const factoryBlocks = (factories: readonly Factory[], runs: readonly FactoryRun[]): FactoryBlock[] => {
  const held = runs.some((run) => run.factory === null);
  return [...factories.filter((f) => f.default && held), ...factories.filter((f) => !f.default)].map((f) => blockOf(f, runs));
};

/** How many factories the menu lists before it offers the rest. */
export const MENU_SHOWN = 5;

/** The factories the menu lists: the first `MENU_SHOWN` of `blocks`, or every one once `all` is asked, and how many it leaves out. */
export const menuFactories = <T>(blocks: readonly T[], all: boolean): { shown: T[]; hidden: number } => {
  const shown = all ? [...blocks] : blocks.slice(0, MENU_SHOWN);
  return { shown, hidden: blocks.length - shown.length };
};
