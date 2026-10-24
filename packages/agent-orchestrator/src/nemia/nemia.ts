/**
 * Nemia, the store's own agent, kept on a long-lived session while a person has her on: the levels a person sets (`LEVELS`), the file
 * that says it (`LevelFile`), what the keeper owes on a beat (`nemiaDue`) off the state her session and her subscription are in
 * (`nemiaState`), the selectors of the feed that wake her (`NEMIA_SELECTORS`), the settings her session is filed with
 * (`nemiaSettings`), and her machine as a board draws it (`nemiaGraph`, `nemiaDiagram`).
 *
 * Pure. The person's file and her folder are `level.store.ts`'s, the keeper is `keep.verb.ts`, and the commands are `level.verb.ts` and
 * `memory.verb.ts`.
 */
import path from 'node:path';
import { DEMAND_OFF } from '../demand/demand.ts';
import { FACTORY_LEVEL_FORM, LEVELS, type Level } from '../level/level.ts';

export { LEVELS, type Level } from '../level/level.ts';

/**
 * What `nemia level` writes of the store: its `level`, the default factory's and that of every factory that names none, when (`since`),
 * and the task her session is filed under (`task`), named when some factory was put above `manual` and kept once none is, so the keeper
 * stops the session it kept.
 */
export type LevelFile = { level: Level; since: string; task?: string };

/** The level a factory is worked on by her from: below it, her subscription carries none of its lines and admission denies her its runs. */
export const NEMIA_FLOOR: Level = 'semi-auto';

/** The name of her subscription to the feed, which the keeper alone puts and drops: refused to `nemia subscribe` and `unsubscribe`. */
export const NEMIA_SUBSCRIPTION = 'nemia';

/**
 * The selectors of the feed that wake her, two lines a person reads in her record: the lines that wait on a person, and a step's calls
 * denied. Hers, not the package's default, and said in the feed's one grammar (`watch/selector.ts`), over the keys the tick stamps.
 */
export const NEMIA_SELECTORS: readonly string[] = ['waits=person', 'reason=ToolDenied'];

/**
 * The minutes a digest of the feed's routine lines waits for a wake: a day, so routine news reaches her mostly folded into a line that
 * needs her.
 */
export const NEMIA_DIGEST_EVERY = 1440;

/** The task her session is filed under when some factory is put above `manual` at `since`: `nemia-` and the time's digits. */
export const nemiaTaskId = (since: string): string => `nemia-${since.replace(/[^0-9]/g, '')}`;

/**
 * The harness's settings her session is filed with, as JSON: her ask and deny rules (`rules`); `NEMIA_DAEMON_START=off` (`DEMAND_OFF`),
 * so a `nemia` she types never starts a daemon beside the one that keeps her; and the search path `searchPath` with the folder `bin`
 * first and only there, so the `nemia` she types is the bin of the daemon that keeps her. No path where `bin` is undefined. Pure.
 */
export function nemiaSettings(
  rules: { readonly ask: readonly string[]; readonly deny: readonly string[] },
  bin: string | undefined,
  searchPath: string,
): string {
  const rest = searchPath.split(path.delimiter).filter((entry) => entry !== '' && entry !== bin);
  return JSON.stringify({
    permissions: { ask: [...rules.ask], deny: [...rules.deny] },
    env: { [DEMAND_OFF]: 'off', ...(bin === undefined ? {} : { PATH: [bin, ...rest].join(path.delimiter) }) },
  });
}

/** The usage the refusals of `nemia level` end on. */
export const LEVEL_FORM = FACTORY_LEVEL_FORM;

/** Why `word` is no level `nemia level` sets, or undefined where it is one. Pure. */
export function levelRefusal(word: string): string | undefined {
  if ((LEVELS as readonly string[]).includes(word)) return undefined;
  return `${JSON.stringify(word)} is no level: ${LEVEL_FORM}.`;
}

/** What the keeper reads of her task: whether it settled, and whether a stop was asked. Absent where no task is filed under her id. */
export type HerTask = { settled: boolean; stopRequested: boolean };

/**
 * Where she is: `off`, no factory above `manual` and nothing to stop; `due`, some factory above it and no task filed; `untrusted`, as
 * `due` but her folder not trusted by her harness, so her session waits for the person to trust it once; `filed`, her task
 * open and not yet subscribed with her floor; `kept`, open and subscribed with it; `stopped`, her task stopped or ended from outside while
 * some factory is above `manual`, never filed again until the person sets a level again; `leaving`, none above `manual` with her task
 * open or her subscription still there.
 */
export type NemiaState = 'off' | 'due' | 'untrusted' | 'filed' | 'kept' | 'stopped' | 'leaving';

/**
 * What the keeper does on a beat: file her task, subscribe it, stop it, drop her subscription, say her custom words to her open task
 * (`sayCustom`), say the person's chat words to her session (`sayOutbox`), write down the questions of hers that wait on the person
 * (`record`), and carry their answers to them (`answer`).
 */
export type NemiaAct = 'file' | 'subscribe' | 'stop' | 'drop' | 'sayCustom' | 'sayOutbox' | 'record' | 'answer';

/**
 * What the keeper reads of the levels and her folder: whether any factory, the default one included, is above `manual` now; her task's
 * id; whether her harness trusts her folder (`trusted`, absent for a harness that keeps no trust, which is read as trusted); and whether
 * the person's custom words are not those she was last filed or told with (`stale`), read only while she is kept; whether her session is
 * live (`up`); whether the person's chat holds words not yet delivered to her (`owed`); whether her session holds a question open on
 * the person (`asking`, off her task's view); whether the chat holds an ask whose mark no longer says what became of its call
 * (`closing`, a question cut with nothing answered, or one cut and asked again); and whether the chat holds an answer of theirs not
 * yet carried to her (`answered`).
 */
export type Keeping = {
  above: boolean;
  task?: string;
  trusted?: boolean;
  stale?: boolean;
  up?: boolean;
  owed?: boolean;
  asking?: boolean;
  closing?: boolean;
  answered?: boolean;
};

/** What the keeper reads of her subscription: the task it tells, and whether it carries her floor (`NEMIA_FLOOR`). */
export type HerSubscription = { task: string; scoped: boolean };

/** Whether her task is open: filed, not settled, and no stop asked. */
const isOpen = (task: HerTask | undefined): boolean => task !== undefined && !task.settled && !task.stopRequested;

/**
 * Where she is (`NemiaState`), off the levels (`keeping`), her task's record (`task`, absent where none is filed under her id) and her
 * subscription (`subscribed`): kept only once it tells her task and carries her floor, so one put before the floor is put again. Pure.
 */
export function nemiaState(keeping: Keeping, task: HerTask | undefined, subscribed: HerSubscription | undefined): NemiaState {
  if (!keeping.above) return isOpen(task) || subscribed !== undefined ? 'leaving' : 'off';
  if (task === undefined) return keeping.trusted === false ? 'untrusted' : 'due';
  if (!isOpen(task)) return 'stopped';
  return subscribed !== undefined && subscribed.task === keeping.task && subscribed.scoped ? 'kept' : 'filed';
}

/**
 * What the keeper owes on a beat, in order: at `due`, file; at `filed`, subscribe, dropping first a subscription left for another task or
 * without her floor; at `kept`, say the person's custom words to her where they are not those her task was filed with (`stale`), then
 * say the person's chat words where some are owed and her session is live (`owed`, `up`), write down the questions her live session
 * holds open and mark what became of a question it no longer holds (`record`, where her task's view says one waits, `asking`, or the
 * chat holds one whose mark does not say what became of its call, `closing`), and carry the person's answers where one is
 * owed (`answered`); at `leaving`, stop the open task and drop
 * the subscription; at `stopped`, drop a subscription left; else nothing, at `untrusted` too: a session filed in a folder her harness does
 * not trust would be refused at its start. A task settled from outside is never filed again: the person said so by stopping it. Pure.
 */
export function nemiaDue(keeping: Keeping, task: HerTask | undefined, subscribed: HerSubscription | undefined): NemiaAct[] {
  const state = nemiaState(keeping, task, subscribed);
  const dropped: NemiaAct[] = subscribed === undefined ? [] : ['drop'];
  if (state === 'due') return ['file'];
  if (state === 'filed') return [...dropped, 'subscribe'];
  if (state === 'stopped') return dropped;
  if (state === 'leaving') return [...(isOpen(task) ? (['stop'] as const) : []), ...dropped];
  if (state !== 'kept') return [];
  return [
    ...(keeping.stale === true ? (['sayCustom'] as const) : []),
    ...(keeping.owed === true && keeping.up === true ? (['sayOutbox'] as const) : []),
    ...((keeping.asking === true || keeping.closing === true) && keeping.up === true ? (['record'] as const) : []),
    ...(keeping.answered === true && keeping.up === true ? (['answer'] as const) : []),
  ];
}

/** The instruction her session is filed with: her shipped instruction `body`, then the person's `custom` words where there are any. */
export const nemiaPrompt = (body: string, custom: string | undefined): string =>
  `${[body.trim(), ...(custom === undefined ? [] : [custom])].join('\n\n')}\n`;

/** The custom words her session was last filed or told with, as the keeper records them: `words` absent for none. */
export type ToldCustom = { words?: string };

/**
 * Whether the person's custom words `now` differ from those her session has: those of the keeper's record `told`; where it kept none yet,
 * for a session filed before it kept one, whether her filed instruction `filed` ends with them. Her shipped instruction is never compared,
 * and with no record no removal is owed: whether she had words is unknown. Pure.
 */
export const customChanged = (told: ToldCustom | undefined, now: string | undefined, filed: string | undefined): boolean =>
  told === undefined ? now !== undefined && !(filed ?? '').endsWith(`\n\n${now}\n`) : told.words !== now;

/**
 * What her open task is told once the person's custom instruction for her changed: the words `custom` whole, which replace those she was
 * started with, or, where undefined, that they were removed and she has none. Pure.
 */
export const toldCustom = (custom: string | undefined): string =>
  custom === undefined
    ? 'The person removed their custom instruction for you: you now have none, and the one you were started with no longer holds.'
    : `The person's custom instruction for you changed. It now reads as below, and replaces the one you were started with:\n\n${custom}`;

/** One edge of her machine: from a state, on what the keeper reads, to a state, by what it does. */
export type NemiaEdge = { from: NemiaState; to: NemiaState; event: string; action: string };

/** A verb a person writes from outside her machine: the states it is taken from, the state the next beat reads, its guard, and who. */
export type NemiaVerb = { verb: string; from: NemiaState[]; to: NemiaState; guard: string; by: string };

/** Her machine as plain data: its first state, its states, its final ones (none: she is kept until a person says), edges and verbs. */
export type NemiaGraph = { initial: NemiaState; states: NemiaState[]; final: NemiaState[]; edges: NemiaEdge[]; verbs: NemiaVerb[] };

/** Every state, in the order a session goes through them. */
const STATES: NemiaState[] = ['off', 'due', 'untrusted', 'filed', 'kept', 'stopped', 'leaving'];

/**
 * The keeper's moves, her folder's trust read each beat, a change of her custom words said, the person's chat words said, a stop or
 * end from outside, which it never undoes, and the end of the last raise above `manual` as it passes.
 */
const EDGES: NemiaEdge[] = [
  { from: 'due', to: 'filed', event: 'NO_TASK', action: 'file' },
  { from: 'due', to: 'untrusted', event: 'FOLDER_UNTRUSTED', action: 'nothing' },
  { from: 'untrusted', to: 'due', event: 'FOLDER_TRUSTED', action: 'nothing' },
  { from: 'filed', to: 'kept', event: 'NOT_SUBSCRIBED', action: 'subscribe' },
  { from: 'filed', to: 'stopped', event: 'SETTLED_OUTSIDE', action: 'nothing' },
  { from: 'kept', to: 'stopped', event: 'SETTLED_OUTSIDE', action: 'nothing' },
  { from: 'kept', to: 'kept', event: 'CUSTOM_CHANGED', action: 'sayCustom' },
  { from: 'kept', to: 'kept', event: 'OUTBOX_OWED', action: 'sayOutbox' },
  { from: 'stopped', to: 'stopped', event: 'SUBSCRIBED', action: 'drop' },
  { from: 'leaving', to: 'off', event: 'OPEN_OR_SUBSCRIBED', action: 'stop, drop' },
  { from: 'due', to: 'off', event: 'RAISE_ENDED', action: 'nothing' },
  { from: 'untrusted', to: 'off', event: 'RAISE_ENDED', action: 'nothing' },
  { from: 'filed', to: 'leaving', event: 'RAISE_ENDED', action: 'nothing' },
  { from: 'kept', to: 'leaving', event: 'RAISE_ENDED', action: 'nothing' },
];

/**
 * The person's verbs: `nemia level` putting some factory above `manual` (the store's level, a factory's default or a raise), whatever
 * her folder's trust, which the keeper reads, and putting none above it (a level set, or a raise ended early); and `nemia agents custom
 * nemia` setting or clearing her custom words, which the next beat says to her. Nothing else raises a level: the level is the person's.
 */
export const NEMIA_VERBS: NemiaVerb[] = [
  { verb: 'level (a factory above manual)', from: ['off', 'untrusted', 'stopped', 'leaving'], to: 'due', guard: 'always', by: 'person' },
  {
    verb: 'level (none above manual)',
    from: ['due', 'untrusted', 'filed', 'kept', 'stopped'],
    to: 'leaving',
    guard: 'always',
    by: 'person',
  },
  { verb: 'agents custom nemia (set or clear)', from: ['kept'], to: 'kept', guard: 'always', by: 'person' },
];

/** Her machine as plain data, a fresh copy each call. */
export const nemiaGraph = (): NemiaGraph => ({
  initial: 'off',
  states: [...STATES],
  final: [],
  edges: EDGES.map((e) => ({ ...e })),
  verbs: NEMIA_VERBS.map((v) => ({ ...v, from: [...v.from] })),
});

/** Her machine as a Mermaid state diagram, edges then verbs, held in the package's `docs/features.md` between `diagram:nemia` markers. */
export const nemiaDiagram = (graph: NemiaGraph = nemiaGraph()): string =>
  [
    'stateDiagram-v2',
    `  [*] --> ${graph.initial}`,
    ...graph.edges.map((e) => `  ${e.from} --> ${e.to}: ${e.event} / ${e.action}`),
    ...graph.verbs.flatMap((v) => v.from.map((from) => `  ${from} --> ${v.to}: ${v.verb} [${v.guard}] (by ${v.by})`)),
  ].join('\n');
