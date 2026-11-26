/**
 * Nemia, the store's own agent, on a long-lived session that operates while a factory's level asks it and talks with the person whenever
 * they write to her: the levels a person sets (`LEVELS`), the file that says it (`LevelFile`), what the keeper owes on a beat
 * (`nemiaDue`) and whether the conversation is quiet enough for her to rest (`quietOf`), both proved by
 * `contracts/nemia-keep.contract.ts`, the selectors of the feed that wake her (`NEMIA_SELECTORS`), the settings her session is filed with
 * (`nemiaSettings`), and her machine as a board draws it (`nemiaGraph`, `nemiaDiagram`).
 *
 * Pure. The person's file and her folder are `level.store.ts`'s, the keeper is `keep.verb.ts`, and the commands are `level.verb.ts` and
 * `memory.verb.ts`.
 */
import path from 'node:path';
import { type TrustNotGiven, withoutHandStep } from '../trust/trust.ts';
import { DEMAND_OFF } from '../demand/demand.ts';
import { FACTORY_LEVEL_FORM, LEVELS, type Level } from '../level/level.ts';

export { LEVELS, type Level } from '../level/level.ts';

/**
 * What `nemia level` writes of the store: its `level`, the default factory's and that of every factory that names none, when (`since`),
 * and when the person last set a level, the store's or a factory's (`asked`), which the keeper reads as the person speaking after a stop
 * from outside. `task` is read and carried on, never written anew: the task a store kept before the keeper named her tasks in its own
 * record (`session.json`), which the keeper adopts as her first.
 */
export type LevelFile = { level: Level; since: string; asked?: string; task?: string };

/**
 * The keeper's record of her session (`session.json`), written by the keeper alone: her tasks, oldest first, the last her current one,
 * and three marks of the current one, each an ISO time — when the keeper saw it idle after the last word said to it (`idleSince`), that
 * it put it to rest (`rested`), and that it saw it end with no rest of its own (`stoppedSeen`).
 */
export type NemiaSession = { tasks: string[]; idleSince?: string; rested?: string; stoppedSeen?: string };

/** The level a factory is worked on by her from: below it, her subscription carries none of its lines and admission denies her its runs. */
export const NEMIA_FLOOR: Level = 'semi-auto';

/** The name of her subscription to the feed, which the keeper alone puts and drops: refused to `nemia subscribe` and `unsubscribe`. */
export const NEMIA_SUBSCRIPTION = 'nemia';

/**
 * The selectors of the feed that wake her, four lines a person reads in her record: the lines that wait on a person, a step's calls
 * denied, a factory's level changed — by the board, the CLI or a raise's end — so she hears a raise as she hears a gate, and a factory's
 * upgrade waiting on a person's choice for its conflicts. Hers, not the package's default, and said in the feed's one grammar
 * (`watch/selector.ts`), over the keys the tick stamps.
 */
export const NEMIA_SELECTORS: readonly string[] = ['waits=person', 'reason=ToolDenied', 'reason=LevelChanged', 'reason=ConflictsPending'];

/**
 * The minutes a digest of the feed's routine lines waits for a wake: a day, so routine news reaches her mostly folded into a line that
 * needs her.
 */
export const NEMIA_DIGEST_EVERY = 1440;

/**
 * A task of hers filed at `at`: `nemia-` and the time's digits.
 * @param at When the keeper files her, an ISO time.
 */
export const nemiaTaskId = (at: string) => `nemia-${at.replace(/[^0-9]/g, '')}`;

/**
 * The harness's settings her session is filed with, as JSON: her ask and deny rules (`rules`); `NEMIA_DAEMON_START=off` (`DEMAND_OFF`),
 * so a `nemia` she types never starts a daemon beside the one that keeps her; and the search path `searchPath` with the folder `bin`
 * first and only there, so the `nemia` she types is the bin of the daemon that keeps her. No path where `bin` is undefined. Pure.
 * @param rules Her ask and deny rules.
 * @param bin The folder of the daemon's own `nemia` bin, or undefined where none was found: no path.
 * @param searchPath The search path to put `bin` first on, as the daemon's PATH.
 */
export function nemiaSettings(
  rules: { readonly ask: readonly string[]; readonly deny: readonly string[] },
  bin: string | undefined,
  searchPath: string,
) {
  const rest = searchPath.split(path.delimiter).filter((entry) => entry !== '' && entry !== bin);
  return JSON.stringify({
    permissions: { ask: [...rules.ask], deny: [...rules.deny] },
    env: { [DEMAND_OFF]: 'off', ...(bin === undefined ? {} : { PATH: [bin, ...rest].join(path.delimiter) }) },
  });
}

/** The usage the refusals of `nemia level` end on. */
export const LEVEL_FORM = FACTORY_LEVEL_FORM;

/**
 * Why `word` is no level `nemia level` sets, or undefined where it is one. Pure.
 * @param word The level as the person typed it.
 */
export function levelRefusal(word: string) {
  if ((LEVELS as readonly string[]).includes(word)) return undefined;
  return `${JSON.stringify(word)} is no level: ${LEVEL_FORM}.`;
}

import type { HerSubscription, HerTask, Keeping, NemiaAct, NemiaDue, QuietOf } from '../../contracts/nemia-keep.contract.ts';

export type { HerSubscription, HerTask, NemiaAct } from '../../contracts/nemia-keep.contract.ts';

/**
 * Where she is: `resting`, no task of hers open and nobody wanting her, or her last task put to rest by the keeper; `due`, wanted — a
 * factory above `manual`, or a word of the person's waiting in her chat — and no task open; `untrusted`, as `due` but her folder not
 * trusted by her harness, which the keeper trusts itself before it files her, the folder being Nemia's own, and where that write was
 * refused, its refusal said to the person; `filed`, her task open while some factory is above `manual`, not yet subscribed with her floor;
 * `kept`, open and subscribed, operating; `talking`, open with every factory at `manual`, in conversation with the person; `leaving`, put
 * to rest by the keeper, the stop asked; `stopped`, her task ended with no rest of the keeper's, filed again only once the person speaks.
 */
type NemiaState = 'resting' | 'due' | 'untrusted' | 'filed' | 'kept' | 'talking' | 'leaving' | 'stopped';

/** How long the conversation is quiet, her session idle since the last word said to her, before she rests at `manual`. */
export const NEMIA_REST_AFTER = '15 minutes';

/** Whether her task is open: filed, not settled, and no stop asked. */
const isOpen = (task: HerTask | undefined) => task !== undefined && !task.settled && !task.stopRequested;

/** Whether her subscription tells her task `task` with her floor and her selectors as they ship. */
const proper = (task: string | undefined, s: HerSubscription | undefined) =>
  s !== undefined && task !== undefined && s.task === task && s.scoped && s.selected;

/**
 * What the keeper owes on a beat, in the order it acts. Where no task of hers is open: a subscription left over dropped, then, where she
 * is wanted (a factory above `manual`, or a word of the person's waiting in her chat) and her last task, if any, was put to rest by the
 * keeper or the person spoke after it ended, her folder trusted where her harness does not trust it and a new task filed; else, a task
 * that ended with no rest marked once. Where it is open: put to rest where the keeper marked it so, or, with every factory at `manual`,
 * the conversation is quiet; a subscription not hers dropped and hers put while she operates (a factory above `manual`); and while the
 * keeper speaks to her session, the person's custom words said where they changed, the chat's words, her questions and the person's
 * answers carried where her session is up, and her session marked idle once. Pure.
 * @param keeping What the keeper reads of the levels, her folder, her record, her session and the chat.
 * @param task Her current task's record, or undefined where none is filed under the record's last id.
 * @param subscribed Her subscription, or undefined where she has none.
 */
export const nemiaDue: NemiaDue = (keeping, task, subscribed) => {
  const k = keeping;
  const dropped: NemiaAct[] = subscribed === undefined ? [] : ['drop'];
  if (!isOpen(task)) return [...dropped, ...dueClosed(k, task !== undefined)];
  if (k.rested === true || (!k.above && quietNow(k))) return ['rest', ...dropped];
  if (k.above && !proper(k.task, subscribed)) return [...dropped, 'subscribe'];
  return [...(k.above ? [] : dropped), ...spoken(k)];
};

/** Whether a word of the person's waits for her: a message in her outbox or an answer to her question. */
const waiting = (k: Keeping) => k.owed === true || k.answered === true;

/**
 * What is owed where no task of hers is open, its subscription aside: her folder trusted where needed and a task filed, where she is
 * wanted and her last task (`filed`) was put to rest or the person spoke after it ended; else a task ended from outside marked once.
 */
const dueClosed = (k: Keeping, filed: boolean) => {
  const spoke = k.rested === true || k.heard === true;
  if ((k.above || waiting(k)) && (!filed || spoke))
    return [...(k.trusted === false ? (['trust'] as const) : []), 'file'] satisfies NemiaAct[];
  return (filed && !spoke && k.stoppedMarked !== true ? ['markStopped'] : []) satisfies NemiaAct[];
};

/** Whether the conversation is quiet long enough for her to rest: idle, nothing waiting, no question of hers open. */
const quietNow = (k: Keeping) => k.quiet === true && k.idle === true && !waiting(k) && k.asking !== true && k.closing !== true;

/** What the keeper says to her open session: custom words changed, and what the chat owes where her session is up; its idle mark. */
const spoken = (k: Keeping) => {
  const up = k.up === true;
  return [
    ...(k.stale === true ? (['sayCustom'] as const) : []),
    ...(up && k.owed === true ? (['sayOutbox'] as const) : []),
    ...(up && (k.asking === true || k.closing === true) ? (['record'] as const) : []),
    ...(up && k.answered === true ? (['answer'] as const) : []),
    ...(k.idle === true && k.idleMarked !== true ? (['markIdle'] as const) : []),
  ];
};

/**
 * Whether the keeper's idle mark of her session stands, no word said to her after it, and whether it is old enough for her to rest: at
 * least `restAfterMs` before `now`. Pure.
 * @param read The idle mark, the last word said to her, now, and the rest's length, each in milliseconds.
 */
export const quietOf: QuietOf = (read) => {
  const marked = read.idleSince !== null && (read.lastSaid === null || read.idleSince >= read.lastSaid);
  return { marked, quiet: marked && read.idleSince !== null && read.now - read.idleSince >= read.restAfterMs };
};

/** What the keeper says once its next beat may give the trust. */
const NEXT_BEAT = 'the keeper gives the trust at its next beat, and files her session';

/**
 * Why the keeper's write of her harness's trust left her folder not trusted, and what a person does so the next beat gives it, in words
 * that offer no command to run the harness by hand: a folder the harness never keeps a trust of (`never`), a write that threw (`threw`,
 * its words), or a file of the harness's that did not take the trust, with the runtime's reason (`refused`). Pure.
 * @param not The trust as it reads after the write.
 * @param threw The words of the error the write threw, or undefined where it answered.
 */
export function trustRefused(not: TrustNotGiven, threw?: string) {
  if (threw !== undefined)
    return `${not.harness}'s trust of her folder ${not.folder} could not be written in ${not.file} (${threw}): make that file readable and writable by the user the store runs as; ${NEXT_BEAT}`;
  if (not.never !== null)
    return `her folder ${not.folder} is the home directory, and ${not.never}: run the store (WF_ROOT) where its nemia folder is not the home directory; ${NEXT_BEAT}`;
  const why = not.refused === null ? `${not.file} was left as it is` : withoutHandStep(not.refused, not);
  return `${not.harness} did not take the trust of her folder ${not.folder}: ${why}. Where that is a file that does not read, make it read as a JSON object again, or move it aside; ${NEXT_BEAT}`;
}

/**
 * Why the keeper could not make her folder, which it trusts only once it is there, and what a person does so the next beat makes it:
 * the folder, and the words of what its making threw. Pure.
 * @param folder Her folder in the store.
 * @param threw The words of the error making it threw.
 */
export const folderUnmade = (folder: string, threw: string) =>
  `her folder ${folder} could not be made (${threw}): make the store's folder writable by the user the store runs as; the keeper makes her folder at its next beat, gives it the trust and files her session`;

/**
 * The instruction her session is filed with: her builtin instruction `body`, then the person's `custom` words where there are any.
 * @param body Her builtin instruction.
 * @param custom The person's custom words for her, or undefined where there are none.
 */
export const nemiaPrompt = (body: string, custom: string | undefined) =>
  `${[body.trim(), ...(custom === undefined ? [] : [custom])].join('\n\n')}\n`;

/** The custom words her session was last filed or told with, as the keeper records them: `words` absent for none. */
export type ToldCustom = { words?: string };

/**
 * Whether the person's custom words `now` differ from those her session has: those of the keeper's record `told`; where it kept none yet,
 * for a session filed before it kept one, whether her filed instruction `filed` ends with them. Her builtin instruction is never compared,
 * and with no record no removal is owed: whether she had words is unknown. Pure.
 * @param told The keeper's record of the words her session has, or undefined where it kept none.
 * @param now The person's custom words now, or undefined where there are none.
 * @param filed Her filed instruction, or undefined where none was written.
 */
export const customChanged = (told: ToldCustom | undefined, now: string | undefined, filed: string | undefined) =>
  told === undefined ? now !== undefined && !(filed ?? '').endsWith(`\n\n${now}\n`) : told.words !== now;

/**
 * What her open task is told once the person's custom instruction for her changed: the words `custom` whole, which replace those she was
 * started with, or, where undefined, that they were removed and she has none. Pure.
 * @param custom The person's custom words now, or undefined where they were removed.
 */
export const toldCustom = (custom: string | undefined) =>
  custom === undefined
    ? 'The person removed their custom instruction for you: you now have none, and the one you were started with no longer holds.'
    : `The person's custom instruction for you changed. It now reads as below, and replaces the one you were started with:\n\n${custom}`;

/** One edge of her machine: from a state, on what the keeper reads, to a state, by what it does. */
type NemiaEdge = { from: NemiaState; to: NemiaState; event: string; action: string };

/** A verb a person writes from outside her machine: the states it is taken from, the state the next beat reads, its guard, and who. */
type NemiaVerb = { verb: string; from: NemiaState[]; to: NemiaState; guard: string; by: string };

/** Her machine as plain data: its first state, its states, its final ones (none: she is kept until a person says), edges and verbs. */
export type NemiaGraph = { initial: NemiaState; states: NemiaState[]; final: NemiaState[]; edges: NemiaEdge[]; verbs: NemiaVerb[] };

/** Every state, in the order a session goes through them. */
const STATES: NemiaState[] = ['resting', 'due', 'untrusted', 'filed', 'kept', 'talking', 'leaving', 'stopped'];

/**
 * The keeper's moves: a word of the person's in her chat or a factory above `manual` files her, her folder's trust given first where it
 * is not; operating, she is subscribed and kept; at `manual`, she talks until the conversation is quiet, then is put to rest; a stop or
 * an end from outside holds her stopped until the person speaks.
 */
const EDGES: NemiaEdge[] = [
  { from: 'due', to: 'filed', event: 'ABOVE_MANUAL', action: 'file' },
  { from: 'due', to: 'talking', event: 'AT_MANUAL', action: 'file' },
  { from: 'due', to: 'untrusted', event: 'FOLDER_UNTRUSTED', action: 'nothing' },
  { from: 'untrusted', to: 'due', event: 'TRUST_WRITTEN', action: 'trust, file' },
  { from: 'untrusted', to: 'untrusted', event: 'TRUST_REFUSED', action: 'trust' },
  { from: 'filed', to: 'kept', event: 'NOT_SUBSCRIBED', action: 'subscribe' },
  { from: 'kept', to: 'kept', event: 'CUSTOM_CHANGED', action: 'sayCustom' },
  { from: 'kept', to: 'kept', event: 'OUTBOX_OWED', action: 'sayOutbox' },
  { from: 'kept', to: 'talking', event: 'RAISE_ENDED', action: 'drop' },
  { from: 'talking', to: 'talking', event: 'CUSTOM_CHANGED', action: 'sayCustom' },
  { from: 'talking', to: 'talking', event: 'OUTBOX_OWED', action: 'sayOutbox' },
  { from: 'talking', to: 'talking', event: 'IDLE', action: 'markIdle' },
  { from: 'talking', to: 'filed', event: 'ABOVE_MANUAL', action: 'nothing' },
  { from: 'talking', to: 'leaving', event: 'QUIET', action: 'rest' },
  { from: 'leaving', to: 'resting', event: 'SETTLED', action: 'nothing' },
  { from: 'filed', to: 'stopped', event: 'SETTLED_OUTSIDE', action: 'markStopped' },
  { from: 'kept', to: 'stopped', event: 'SETTLED_OUTSIDE', action: 'drop, markStopped' },
  { from: 'talking', to: 'stopped', event: 'SETTLED_OUTSIDE', action: 'markStopped' },
];

/**
 * The person's verbs: a message written in her chat, which files her from rest or from a stop; `nemia level` putting some factory above
 * `manual` (the store's level, a factory's default or a raise), whatever her folder's trust, which the keeper reads, and putting none
 * above it, which ends her operating and leaves the conversation as it is; and `nemia agents custom nemia` setting or clearing her custom
 * words, which the next beat says to her. Nothing else raises a level: the level is the person's.
 */
const NEMIA_VERBS: NemiaVerb[] = [
  { verb: 'chat (a message)', from: ['resting', 'stopped'], to: 'due', guard: 'always', by: 'person' },
  { verb: 'level (a factory above manual)', from: ['resting', 'stopped'], to: 'due', guard: 'always', by: 'person' },
  { verb: 'level (none above manual)', from: ['filed', 'kept'], to: 'talking', guard: 'always', by: 'person' },
  { verb: 'agents custom nemia (set or clear)', from: ['kept'], to: 'kept', guard: 'always', by: 'person' },
];

/** Her machine as plain data, a fresh copy each call. */
export const nemiaGraph = () =>
  ({
    initial: 'resting',
    states: [...STATES],
    final: [],
    edges: EDGES.map((e) => ({ ...e })),
    verbs: NEMIA_VERBS.map((v) => ({ ...v, from: [...v.from] })),
  }) satisfies NemiaGraph;

/**
 * Her machine as a Mermaid state diagram, edges then verbs, held in the package's `docs/features.md` between `diagram:nemia` markers.
 * @param graph Her machine as plain data, `nemiaGraph()` when absent.
 */
export const nemiaDiagram = (graph: NemiaGraph = nemiaGraph()) =>
  [
    'stateDiagram-v2',
    `  [*] --> ${graph.initial}`,
    ...graph.edges.map((e) => `  ${e.from} --> ${e.to}: ${e.event} / ${e.action}`),
    ...graph.verbs.flatMap((v) => v.from.map((from) => `  ${from} --> ${v.to}: ${v.verb} [${v.guard}] (by ${v.by})`)),
  ].join('\n');
