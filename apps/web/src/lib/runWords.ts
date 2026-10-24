/**
 * The runs page's plain words, without React: the one sentence a waiting run says, by the kind of its wait; how a finished run ended; a
 * wall time as a fact to the minute; and what a run's rail of steps says aloud. Each sentence is built from the row's steps and their
 * names alone: what the api advises a person to type is never repeated here. The words themselves are `words.ts`'s; this reads the row
 * and composes them. Pure.
 */
import { format, formatDistanceStrict, isSameDay, isSameYear } from 'date-fns';
import type { RunOutcome, RunSummary } from './api/runs.ts';
import type { StepReason } from './api/reasons.ts';
import type { Hue } from './meaning.ts';
import { stepState, type StepState } from './status.ts';
import { timeOfDay, unreadable, UNREADABLE, zoneOf } from './timeOfDay.ts';
import { ANY_WAIT, ENDED, OPENS, PERSON, RUN_WAITS, stateWordsOf, type Wait as Waited, type WaitWords } from './words.ts';

/** Every kind of wait on a person the page has a sentence for. */
export const WAIT_KINDS = ['approve', 'blocked', 'check', 'unfinished', 'unsigned', 'denied', 'rounds', 'budget', 'hold', 'after'] as const;

/** A kind of wait on a person. */
export type WaitKind = (typeof WAIT_KINDS)[number];

/**
 * The kind of wait each state of a step is, none for a state the api lists no step in as waiting on a person: a session that asks is a run
 * still in flight there, which the rail's Runs count does not count, and a held run's steps are named by none of its rows, whose wait is
 * the hold's own.
 */
export const waitKindOf: Record<StepState, WaitKind | null> = {
  working: null,
  'needs-human': null,
  checking: null,
  verified: null,
  unverified: null,
  blocked: 'blocked',
  'awaiting-approval': 'approve',
  exhausted: 'rounds',
  'over-budget': 'budget',
  'budget-exhausted': 'budget',
  denied: 'denied',
  unsigned: 'unsigned',
  failed: null,
  'failed-check': 'check',
  waiting: null,
  'waiting-for-slot': null,
  held: null,
  cancelled: null,
  unreadable: null,
  unknown: null,
};

/** A step of a row as the words read it: its name, its codes, and its check's verdict. */
type CodedStep = Pick<RunSummary['steps'][number], 'name' | 'phase' | 'reason' | 'verdict'>;

/** What the words read of a row of the light answer: of each step its name and its codes, and of the run who it waits on. */
export type WaitingRow = Pick<RunSummary, 'cancelledAt' | 'holding' | 'waiting' | 'waitingOnYou'> & { steps: ReadonlyArray<CodedStep> };

/** A row whose button is worded: a `WaitingRow` that says of each step the task of its work too, none for a step not filed yet. */
export type OpenedRow = WaitingRow & { steps: ReadonlyArray<CodedStep & Pick<RunSummary['steps'][number], 'taskId'>> };

/** A wait: its kind, the step that waits, none for a wait of the run's own, and how many of the run's steps are done. */
export type Wait = Waited & { kind: WaitKind };

/**
 * The kind of wait a step is on its row: its state's (`waitKindOf`), but `unfinished` where its check did not finish (its verdict's
 * `unfinished`), which refused nothing.
 */
function kindOn(row: WaitingRow, step: CodedStep): WaitKind | null {
  const kind = waitKindOf[stateOn(row, step)];
  return kind === 'check' && step.verdict?.result === 'unfinished' ? 'unfinished' : kind;
}

/** A step's state on its row (`stepState`). */
const stateOn = (row: WaitingRow, step: CodedStep): StepState =>
  stepState(step.phase, step.reason, Boolean(row.cancelledAt), row.holding != null);

/**
 * What `row` waits on a person for: a hold only a person lifts first; then the first of its steps, in the run's order, that the api
 * says waits on a person (`waitingOnYou`), by its kind (`kindOn`); then a run it waits on that never lands without a person. None for a
 * row that waits on nobody, and for one whose waiting step says a word the board has no kind for.
 */
export function waitOf(row: WaitingRow): Wait | null {
  const done = row.steps.filter((step) => ['verified', 'unverified'].includes(stateOn(row, step))).length;
  if (row.holding?.onYou) return { kind: 'hold', step: null, done };
  for (const step of row.steps) {
    const kind = kindOn(row, step);
    if (kind && row.waitingOnYou.includes(step.name)) return { kind, step: step.name, done };
  }
  return row.waiting?.onYou ? { kind: 'after', step: null, done } : null;
}

/**
 * The words of a wait of `kind`: a wait of the run's own (`RUN_WAITS`), else the words of the first state whose wait is that kind
 * (`waitKindOf`), both budgets' being the same.
 */
function wordsOf(kind: WaitKind): WaitWords {
  if (kind === 'hold' || kind === 'after' || kind === 'unfinished') return RUN_WAITS[kind];
  const state = (Object.keys(waitKindOf) as StepState[]).find((s) => waitKindOf[s] === kind);
  const words = state && PERSON[state];
  return words?.tag && words.sentence && words.open ? { tag: words.tag, sentence: words.sentence, open: words.open } : ANY_WAIT;
}

/** The sentence of a wait of `kind`. */
export const sentenceOf = (wait: Wait): string => wordsOf(wait.kind).sentence(wait);

/** The one sentence a waiting run says: its wait's (`waitOf`), or that it waits on you where the board has no kind for it. */
export function waitSentence(row: WaitingRow): string {
  const wait = waitOf(row);
  return wait ? sentenceOf(wait) : ANY_WAIT.sentence({ step: null, done: 0 });
}

/** The few words of a waiting run's tag: what is asked of the person (`approve land`). */
export function waitTag(row: WaitingRow): string {
  const wait = waitOf(row);
  return wait ? wordsOf(wait.kind).tag(wait) : ANY_WAIT.tag({ step: null, done: 0 });
}

/** The states of a step a run is past. */
const PAST: readonly StepState[] = ['verified', 'unverified'];

/**
 * The step whose work a person reads at the gate of `gated` on `row`: the gated step itself where it has run (its task is filed), else
 * the last step done before it, as at a gate held before its step is filed. None where neither is.
 */
function readAt(row: OpenedRow, gated: string | null): string | null {
  const at = row.steps.findIndex((step) => step.name === gated);
  if (at < 0) return null;
  if (row.steps[at].taskId !== null) return row.steps[at].name;
  const done = row.steps.slice(0, at).filter((step) => PAST.includes(stateOn(row, step)));
  return done.pop()?.name ?? null;
}

/**
 * The words of a waiting card's button, by the kind of its wait (`waitOf`): `Read the design` at a gate, `Read the question`,
 * `Read the check`, and `Open the run` for every other kind and for a wait the board has no kind for. The button opens the run's page
 * whatever it says.
 */
export function openWord(row: OpenedRow): string {
  const wait = waitOf(row);
  return wait ? wordsOf(wait.kind).open(wait, readAt(row, wait.step)) : OPENS;
}

/** What a row in flight says it does now: the word of the step it is on, and a note of which step, its place, and how long. */
export type Now = { word: string; note: string };

/**
 * What a run in flight does now: its first step not done, by the rail's word for its state, and its name and its place among the run's
 * steps as the note (`implement (2 of 4)`). None for a run whose every step is done. It says no duration: the row's Clock column says
 * how long the run has been at work, and a second time in the note beside it read as one word and said the same thing twice.
 */
export function nowOf(row: WaitingRow): Now | null {
  const states = railStates(row.steps, Boolean(row.cancelledAt), row.holding != null);
  const at = states.findIndex((step) => !PAST.includes(step.state));
  const step = states[at];
  if (!step) return null;
  return { word: stateWordsOf(step.state, step.reason).rail, note: `${step.name} (${at + 1} of ${states.length})` };
}

/** How a finished run ended, as the page says it: a word, its whole sentence, and the hue it is drawn in. */
export type Ended = { word: string; title: string; hue: Hue };

/** The hue each outcome is drawn in. */
const ENDED_HUE: Record<RunOutcome, Hue> = { succeeded: 'sage', cancelled: 'grey', failed: 'failure', undecided: 'yours' };

/** How a finished run of `outcome` ended. */
export const endedWords = (outcome: RunOutcome): Ended => ({ ...ENDED[outcome], hue: ENDED_HUE[outcome] });

/** `ms` of wall time to the minute: `under a minute`, `27m`, `3h 12m`, `2d 4h`, a part of none left out. */
export function sinceWords(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return 'under a minute';
  const [d, h, m] = [Math.floor(minutes / 1440), Math.floor((minutes % 1440) / 60), minutes % 60];
  const parts = d > 0 ? [`${d}d`, h > 0 && `${h}h`] : h > 0 ? [`${h}h`, m > 0 && `${m}m`] : [`${m}m`];
  return parts.filter(Boolean).join(' ');
}

/** `ms` of wall time to the minute where room is short, on a tile or in a column: `under 1m` for less than one, else as `sinceWords`. */
export const sinceShort = (ms: number): string => (ms < 60_000 ? 'under 1m' : sinceWords(ms));

/**
 * How long a waiting run has waited on a person this time, at `asOf`, as `sinceShort` says it: since `waitingSince`, never the sum of
 * its waits. Null for a run the answer dates no present wait of.
 */
export const presentWait = (run: { waitingSince: string | null }, asOf: Date): string | null =>
  run.waitingSince === null ? null : sinceShort(asOf.getTime() - Date.parse(run.waitingSince));

/** A run's wall time as a fact: `27m since it was created`. */
export const sinceCreated = (ms: number): string => `${sinceWords(ms)} since it was created`;

/** What a distance under a minute says, a column having no room for seconds. */
export const JUST_NOW = 'just now';

/**
 * How long ago `at` was at `now`, the way a table's column says it: `just now` under a minute, else one unit and the word `ago`
 * (`3 minutes ago`, `2 hours ago`, `3 days ago`, `4 months ago`, `2 years ago`). date-fns's `formatDistanceStrict`, which rounds to the
 * nearest unit and writes no `about`, unlike `formatDistance`. A distance has no time zone: the whole instant on hover is where the
 * reader's zone shows (`instantWhole`). `UNREADABLE` where `at` or `now` does not parse.
 */
export function agoWords(at: Date, now: Date): string {
  if (unreadable(at, now)) return UNREADABLE;
  return Math.abs(now.getTime() - at.getTime()) < 60_000 ? JUST_NOW : formatDistanceStrict(at, now, { addSuffix: true });
}

/** A run's steps as the rail draws them: each by its name and its state. */
export const railStates = (
  steps: ReadonlyArray<Pick<RunSummary['steps'][number], 'name' | 'phase' | 'reason'>>,
  cancelled: boolean,
  held: boolean,
): Array<{ name: string; state: StepState; reason: StepReason }> =>
  steps.map((step) => ({ name: step.name, state: stepState(step.phase, step.reason, cancelled, held), reason: step.reason }));

/** What the rail says aloud: each step and its word, in the run's order: `design verified, land waits on you`, a step a
 * check verified told from one done on its own word. */
export const railSaid = (
  steps: ReadonlyArray<Pick<RunSummary['steps'][number], 'name' | 'phase' | 'reason'>>,
  cancelled: boolean,
  held: boolean,
): string =>
  railStates(steps, cancelled, held)
    .map((step) => `${step.name} ${stateWordsOf(step.state, step.reason).rail}`)
    .join(', ');

/** A bar of the rail as a button says it: its step's name and the rail's word for its state, `implement, at work`. */
export const barSaid = (name: string, state: StepState, reason: StepReason): string => `${name}, ${stateWordsOf(state, reason).rail}`;

/**
 * The parts of a date as a person reads it in `timeZone`, theirs by default: its year, its month in three letters and its day; each
 * empty for a date that does not parse, which the writers that compose them say as `UNREADABLE` before they ask.
 */
export function dateParts(at: Date, timeZone?: string): { year: string; month: string; day: string } {
  if (unreadable(at)) return { year: '', month: '', day: '' };
  const zone = zoneOf(timeZone);
  return { year: format(at, 'y', zone), month: format(at, 'MMM', zone), day: format(at, 'd', zone) };
}

/**
 * When something of a run happened, as a person reads it where they are, to the minute, on a 12-hour clock: the time alone on the day
 * of `now` (`1:11 PM`), the day and the month before it on another (`11 Oct 1:11 PM`), and in another year the day alone, with its
 * year (`31 Dec 2025`). Its spaces are plain ones. `UNREADABLE` where `at` or `now` does not parse.
 */
export function whenWords(at: Date, now: Date, timeZone?: string): string {
  if (unreadable(at, now)) return UNREADABLE;
  const zone = zoneOf(timeZone);
  const then = dateParts(at, timeZone);
  const time = timeOfDay(at, timeZone);
  if (!isSameYear(at, now, zone)) return `${then.day} ${then.month} ${then.year}`;
  return isSameDay(at, now, zone) ? time : `${then.day} ${then.month} ${time}`;
}
