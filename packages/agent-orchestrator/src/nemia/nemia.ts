/**
 * Nemia, the store's own agent, kept on a long-lived session while a person has her on: the levels a person sets (`LEVELS`), the file
 * that says it (`LevelFile`), what the keeper owes on a beat (`nemiaDue`) off the state her session and her subscription are in
 * (`nemiaState`), the words that wake her (`NEMIA_WAKE`), and her machine as a board draws it (`nemiaGraph`, `nemiaDiagram`).
 *
 * Pure. The person's file and her folder are `level.store.ts`'s, the keeper is `keep.verb.ts`, and the commands are `level.verb.ts` and
 * `memory.verb.ts`.
 */
import { DEFAULT_WAKE } from '../subscription/subscription.ts';

/** The levels a person sets: `manual`, her session stopped; `semi-auto`, her session kept, every write she proposes asked of the person. */
export const LEVELS = ['manual', 'semi-auto'] as const;

/** A level a person sets. */
export type Level = (typeof LEVELS)[number];

/**
 * What `nemia level` writes: the `level` asked, when (`since`), and the task her session is filed under (`task`), named when she was put
 * at `semi-auto` and kept at `manual`, so the keeper stops the session it kept.
 */
export type LevelFile = { level: Level; since: string; task?: string };

/** The name of her subscription to the feed, which the keeper alone puts and drops: refused to `nemia subscribe` and `unsubscribe`. */
export const NEMIA_SUBSCRIPTION = 'nemia';

/** The words of the feed that wake her: those that wait on a person (`DEFAULT_WAKE`), and a step's calls denied (`denied:`). */
export const NEMIA_WAKE: readonly string[] = [...DEFAULT_WAKE, 'denied:'];

/**
 * The minutes a digest of the feed's routine lines waits for a wake: a day, so routine news reaches her mostly folded into a line that
 * needs her.
 */
export const NEMIA_DIGEST_EVERY = 1440;

/** The task her session is filed under when she is put at `semi-auto` at `since`: `nemia-` and the time's digits. */
export const nemiaTaskId = (since: string): string => `nemia-${since.replace(/[^0-9]/g, '')}`;

/** The usage the refusals of `nemia level` end on. */
export const LEVEL_FORM = `nemia level [${LEVELS.join('|')}]`;

/** Why `word` is no level `nemia level` sets, or undefined where it is one. `auto` is a level to come, said so. Pure. */
export function levelRefusal(word: string): string | undefined {
  if ((LEVELS as readonly string[]).includes(word)) return undefined;
  if (word === 'auto')
    return `auto is not built yet: Nemia acting on her own word, under a cap, comes with slice 6. Today she is ${LEVELS.join(' or ')}: ${LEVEL_FORM}.`;
  return `${JSON.stringify(word)} is no level: ${LEVEL_FORM}.`;
}

/** What the keeper reads of her task: whether it settled, and whether a stop was asked. Absent where no task is filed under her id. */
export type HerTask = { settled: boolean; stopRequested: boolean };

/**
 * Where she is: `off`, at `manual` with nothing to stop; `due`, at `semi-auto` with no task filed; `filed`, her task open and not yet
 * subscribed; `kept`, open and subscribed; `stopped`, her task stopped or ended from outside at `semi-auto`, never filed again until the
 * person sets the level again; `leaving`, at `manual` with her task open or her subscription still there.
 */
export type NemiaState = 'off' | 'due' | 'filed' | 'kept' | 'stopped' | 'leaving';

/** What the keeper does on a beat: file her task, subscribe it, stop it, drop her subscription. */
export type NemiaAct = 'file' | 'subscribe' | 'stop' | 'drop';

/**
 * Where she is (`NemiaState`), off the person's file (`level`, none read as `manual`), her task's record (`task`, absent where none is
 * filed under the file's id) and the task her subscription names (`subscribedTo`). Pure.
 */
export function nemiaState(level: LevelFile | undefined, task: HerTask | undefined, subscribedTo: string | undefined): NemiaState {
  const open = task !== undefined && !task.settled && !task.stopRequested;
  if (level?.level !== 'semi-auto') return open || subscribedTo !== undefined ? 'leaving' : 'off';
  if (task === undefined) return 'due';
  if (!open) return 'stopped';
  return subscribedTo === level.task ? 'kept' : 'filed';
}

/**
 * What the keeper owes on a beat, in order: at `due`, file; at `filed`, subscribe, dropping first a subscription left for another task;
 * at `leaving`, stop the open task and drop the subscription; at `stopped`, drop a subscription left; else nothing. A task settled from
 * outside is never filed again: the person said so by stopping it. Pure.
 */
export function nemiaDue(level: LevelFile | undefined, task: HerTask | undefined, subscribedTo: string | undefined): NemiaAct[] {
  const state = nemiaState(level, task, subscribedTo);
  const dropped: NemiaAct[] = subscribedTo === undefined ? [] : ['drop'];
  if (state === 'due') return ['file'];
  if (state === 'filed') return [...dropped, 'subscribe'];
  if (state === 'stopped') return dropped;
  if (state === 'leaving') return [...(task !== undefined && !task.settled && !task.stopRequested ? (['stop'] as const) : []), ...dropped];
  return [];
}

/** One edge of her machine: from a state, on what the keeper reads, to a state, by what it does. */
export type NemiaEdge = { from: NemiaState; to: NemiaState; event: string; action: string };

/** A verb a person writes from outside her machine: the states it is taken from, the state the next beat reads, its guard, and who. */
export type NemiaVerb = { verb: string; from: NemiaState[]; to: NemiaState; guard: string; by: string };

/** Her machine as plain data: its first state, its states, its final ones (none: she is kept until a person says), edges and verbs. */
export type NemiaGraph = { initial: NemiaState; states: NemiaState[]; final: NemiaState[]; edges: NemiaEdge[]; verbs: NemiaVerb[] };

/** Every state, in the order a session goes through them. */
const STATES: NemiaState[] = ['off', 'due', 'filed', 'kept', 'stopped', 'leaving'];

/** The keeper's moves, and a stop or end from outside, which it never undoes. */
const EDGES: NemiaEdge[] = [
  { from: 'due', to: 'filed', event: 'NO_TASK', action: 'file' },
  { from: 'filed', to: 'kept', event: 'NOT_SUBSCRIBED', action: 'subscribe' },
  { from: 'filed', to: 'stopped', event: 'SETTLED_OUTSIDE', action: 'nothing' },
  { from: 'kept', to: 'stopped', event: 'SETTLED_OUTSIDE', action: 'nothing' },
  { from: 'stopped', to: 'stopped', event: 'SUBSCRIBED', action: 'drop' },
  { from: 'leaving', to: 'off', event: 'OPEN_OR_SUBSCRIBED', action: 'stop, drop' },
];

/** The person's verbs: `nemia level semi-auto`, asked first whether her folder is trusted, and `nemia level manual`. */
export const NEMIA_VERBS: NemiaVerb[] = [
  { verb: 'level semi-auto', from: ['off', 'stopped', 'leaving'], to: 'due', guard: 'trusted', by: 'person' },
  { verb: 'level manual', from: ['due', 'filed', 'kept', 'stopped'], to: 'leaving', guard: 'always', by: 'person' },
];

/** Her machine as plain data, a fresh copy each call. */
export const nemiaGraph = (): NemiaGraph => ({
  initial: 'off',
  states: [...STATES],
  final: [],
  edges: EDGES.map((e) => ({ ...e })),
  verbs: NEMIA_VERBS.map((v) => ({ ...v, from: [...v.from] })),
});

/** Her machine as a Mermaid state diagram, edges then verbs, which the package's README holds between its `diagram:nemia` markers. */
export const nemiaDiagram = (graph: NemiaGraph = nemiaGraph()): string =>
  [
    'stateDiagram-v2',
    `  [*] --> ${graph.initial}`,
    ...graph.edges.map((e) => `  ${e.from} --> ${e.to}: ${e.event} / ${e.action}`),
    ...graph.verbs.flatMap((v) => v.from.map((from) => `  ${from} --> ${v.to}: ${v.verb} [${v.guard}] (by ${v.by})`)),
  ].join('\n');
