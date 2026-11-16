/**
 * The runs page's plain words, without React: the one sentence a waiting run says, by the kind of its wait; how long ago something was;
 * and what a run's rail of steps says aloud. Each sentence is built from the row's steps and their
 * names alone: what the api advises a person to type is never repeated here. The words themselves are `words.ts`'s; this reads the row
 * and composes them. Pure.
 */
import { format, formatDistanceStrict, isSameDay, isSameYear } from 'date-fns';
import { agentOf, type RunView } from './api/judged.ts';
import type { NowStands } from '../../contracts/now-chip.contract.ts';
import { chipTone, nowStandsOf, type ChipTone } from './nowChip.ts';
import type { WaitOn } from 'objects';
import { stepState, waitsOnPerson, type StepState } from './status.ts';
import { timeOfDay, unreadable, UNREADABLE, zoneOf } from './timeOfDay.ts';
import { durationWords } from './duration.ts';
import { ANY_WAIT, NOW_WORDS, OPENS, PERSON, RUN_WAITS, stateWordsOf, type Wait as Waited, type WaitWords } from './words.ts';

/** Every kind of wait on a person the page has a sentence for. */
export const WAIT_KINDS = ['approve', 'answer', 'check', 'unfinished', 'unsigned', 'denied', 'rounds', 'budget', 'hold', 'after'] as const;

/** A kind of wait on a person. */
export type WaitKind = (typeof WAIT_KINDS)[number];

/**
 * The kind of wait each state of a step is, none for a state the api lists no step in as waiting on a person: a session that asks is a run
 * still in flight there, which the rail's Runs count does not count, and a held run's steps are named by none of its rows, whose wait is
 * the hold's own.
 */
export const waitKindOf: Record<StepState, WaitKind | null> = {
  working: null,
  paused: null,
  'asks-in-session': null,
  checking: null,
  verified: null,
  unverified: null,
  blocked: 'answer',
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
  skipped: null,
  sent: null,
  unreadable: null,
  unknown: null,
};

/** A step of a row as the words read it: its name, its codes, and its check's verdict. */
type CodedStep = Pick<RunView['steps'][number], 'name' | 'phase' | 'reason' | 'on' | 'via' | 'verdict'> &
  Partial<Pick<RunView['steps'][number], 'baseHeldBy'>>;

/** What the words read of a row of the light answer: of each step its name and its codes, and of the run who it waits on. */
type WaitingRow = Pick<RunView, 'cancelledAt' | 'holding' | 'waiting' | 'waitingOnYou'> & { steps: ReadonlyArray<CodedStep> };

/** A row whose button is worded: a `WaitingRow` that says of each step the task of its work too, none for a step not filed yet. */
type OpenedRow = WaitingRow & { steps: ReadonlyArray<CodedStep & Pick<RunView['steps'][number], 'taskId'>> };

/** A wait: its kind, the step that waits, none for a wait of the run's own, and how many of the run's steps are done. */
type Wait = Waited & { kind: WaitKind };

/**
 * The kind of wait a step is on its row: its state's (`waitKindOf`), but `unfinished` where its check did not finish (its verdict's
 * `unfinished`), which refused nothing.
 */
function kindOn(row: WaitingRow, step: CodedStep): WaitKind | null {
  const kind = waitKindOf[stateOn(row, step)];
  return kind === 'check' && step.verdict?.result === 'unfinished' ? 'unfinished' : kind;
}

/** A step's state on its row (`stepState`). */
const stateOn = (row: WaitingRow, step: CodedStep): StepState => stepState(step, Boolean(row.cancelledAt), row.holding != null);

/**
 * What `row` waits on a person for: a hold only a person lifts first; then the first of its steps, in the run's order, that the api
 * says waits on a person (`waitingOnYou`), by its kind (`kindOn`); then a run it waits on that never lands without a person. None for a
 * row that waits on nobody, and for one whose waiting step says a word the board has no kind for.
 * @param row The run's row: its steps with their codes, its hold, the run it waits on and the steps that wait on you.
 */
export function waitOf(row: WaitingRow): Wait | null {
  const done = row.steps.filter((step) => ['verified', 'unverified'].includes(stateOn(row, step))).length;
  if (row.holding?.waitingOnYou) return { kind: 'hold', step: null, done };
  for (const step of row.steps) {
    const kind = kindOn(row, step);
    if (kind && row.waitingOnYou.includes(step.name)) return { kind, step: step.name, done };
  }
  return row.waiting?.waitingOnYou ? { kind: 'after', step: null, done } : null;
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

/**
 * The sentence of a wait of `kind`.
 * @param wait The wait: its kind, the step that waits, and how many steps are done.
 */
export const sentenceOf = (wait: Wait): string => wordsOf(wait.kind).sentence(wait);

/**
 * The one sentence a waiting run says: its wait's (`waitOf`), or that it waits on you where the board has no kind for it.
 * @param row The run's row: its steps with their codes, its hold, the run it waits on and the steps that wait on you.
 */
export function waitSentence(row: WaitingRow): string {
  const wait = waitOf(row);
  return wait ? sentenceOf(wait) : ANY_WAIT.sentence({ step: null, done: 0 });
}

/**
 * The few words of a waiting run's tag: what is asked of the person (`approve land`).
 * @param row The run's row: its steps with their codes, its hold, the run it waits on and the steps that wait on you.
 */
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
 * @param row The run's row, each step with its task, none for a step not filed yet.
 */
export function openWord(row: OpenedRow): string {
  const wait = waitOf(row);
  return wait ? wordsOf(wait.kind).open(wait, readAt(row, wait.step)) : OPENS;
}

/** Where a step stands that has started, so that its agent is named: at work, failed, or at rest. */
const STARTED: readonly NowStands[] = ['atWork', 'failed', 'atRest'];

/** A part of what NOW says: a word, or a run it names, which the row links by its id. */
export type NowPart = string | { run: string };

/**
 * What a row says it does now: the step it is on, its chip's colour (`chipTone`), the step's agent, its round of its rounds and its
 * budget against what it spent (each null where the step has none), and the few words of its wait, in parts.
 */
export type Now = {
  step: string;
  tone: ChipTone;
  agent: string | null;
  round: { at: number; of: number } | null;
  budget: { spent: number; cap: number; capSaid: string; over: boolean } | null;
  words: NowPart[];
};

/** A row as NOW reads it: its wait, and of each step its codes, its frozen spec, its current try, its budget and what it spent. */
type NowRow = Omit<WaitingRow, 'steps'> & {
  steps: ReadonlyArray<CodedStep & Partial<Pick<RunView['steps'][number], 'spec' | 'current' | 'budget' | 'spent'>>>;
};

/**
 * The words of a step that waits on a run or on the checkout: the run whose ending has the checkout (`baseHeldBy`), else the checkout
 * alone; the run it waits on, the first the store has, else a run that will not finish without a person.
 */
function runWaitWords(row: NowRow, on: WaitOn | null, step: CodedStep): NowPart[] {
  if (on === 'base') {
    const holder = step.baseHeldBy?.run;
    return holder ? [NOW_WORDS.waitsOn, { run: holder }, NOW_WORDS.theCheckout] : [NOW_WORDS.checkout];
  }
  const run = row.waiting?.runs.find((waited) => !waited.missing)?.run;
  return run ? [NOW_WORDS.waitsOn, { run }] : [RUN_WAITS.after.tag({ step: null, done: 0 })];
}

/**
 * The words of a step that waits on no person, by where it stands: being checked, a run or the checkout (`runWaitWords`), a run slot, a
 * hold and the run it waits until (the first not landed), a failure's or a rest's rail word, and none at work or still to come.
 */
function waitWords(row: NowRow, stands: NowStands, state: StepState, on: WaitOn | null, step: CodedStep): NowPart[] {
  const held = row.holding != null;
  if (stands === 'atWork') return state === 'checking' ? [PERSON.checking.rail] : [];
  if (stands === 'held') {
    const until = row.holding?.runs.find((run) => !run.landed)?.run;
    return until ? [PERSON.held.rail, NOW_WORDS.until, { run: until }, NOW_WORDS.lands] : [PERSON.held.rail];
  }
  if (stands === 'waitsOnARun') return runWaitWords(row, on, step);
  if (stands === 'waitsForASlot') return [NOW_WORDS.slot];
  if (stands === 'failed' || stands === 'atRest') return [stateWordsOf(state, on, held).rail];
  return [];
}

/**
 * What a run does now: the step its wait on a person names, else its first step not done, with the colour of its chip (`chipTone` of
 * where it stands, `nowStandsOf`, and whether the row waits on a person), its agent as the run froze it where the step has started or
 * waits on a person, its round of its rounds, its budget and what it spent, and the few words of its wait: on a person, the wait's tag
 * (`waitTag`); on no person, `waitWords`. None for a run whose every step is done. It says no duration: the row's Clock column says
 * how long the run has been at work.
 * @param row The run's row: its steps with their codes, spec, try, budget and spend, its calling off, its hold and its waits.
 */
export function nowOf(row: NowRow): Now | null {
  const held = row.holding != null;
  const cancelled = Boolean(row.cancelledAt);
  const states = railStates(row.steps, cancelled, held);
  const wait = waitOf(row);
  const named = wait?.step ? states.findIndex((step) => step.name === wait.step) : -1;
  const at = named >= 0 ? named : states.findIndex((step) => !PAST.includes(step.state));
  const drawn = states[at];
  const step = row.steps[at];
  if (!drawn || !step) return null;
  const yours = wait !== null || waitsOnPerson(drawn.state, cancelled);
  const stands = nowStandsOf(drawn.state, drawn.on, held);
  const rounds = step.spec?.rounds ?? null;
  return {
    step: drawn.name,
    tone: chipTone({ stands, yours }),
    agent: step.spec && (yours || STARTED.includes(stands)) ? agentOf({ spec: step.spec }) : null,
    round: rounds !== null && step.current ? { at: step.current.round, of: rounds } : null,
    budget: step.budget ? { spent: step.spent?.usd ?? 0, cap: step.budget.usd, capSaid: step.budget.said, over: step.budget.over } : null,
    words: yours
      ? [wait ? waitTag(row) : stateWordsOf(drawn.state, drawn.on, held).rail]
      : waitWords(row, stands, drawn.state, drawn.on, step),
  };
}

/**
 * How long a waiting run has waited on a person this time, at `asOf`, to the minute (`durationWords`): since `waitingSince`, never the
 * sum of its waits. Null for a run the answer dates no present wait of.
 * @param run The run: since when it has waited on a person this time, null where the answer dates no present wait.
 * @param asOf The instant the wait is measured to.
 */
export const presentWait = (run: { waitingSince: string | null }, asOf: Date): string | null =>
  run.waitingSince === null ? null : durationWords(asOf.getTime() - Date.parse(run.waitingSince), 'minute');

/** What a distance under a minute says, a column having no room for seconds. */
export const JUST_NOW = 'just now';

/**
 * How long ago `at` was at `now`, the way a table's column says it: `just now` under a minute, else one unit and the word `ago`
 * (`3 minutes ago`, `2 hours ago`, `3 days ago`, `4 months ago`, `2 years ago`). date-fns's `formatDistanceStrict`, which rounds to the
 * nearest unit and writes no `about`, unlike `formatDistance`. A distance has no time zone: the whole instant on hover is where the
 * reader's zone shows (`instantWhole`). `UNREADABLE` where `at` or `now` does not parse.
 * @param at The time that was.
 * @param now The instant it is now.
 */
export function agoWords(at: Date, now: Date): string {
  if (unreadable(at, now)) return UNREADABLE;
  return Math.abs(now.getTime() - at.getTime()) < 60_000 ? JUST_NOW : formatDistanceStrict(at, now, { addSuffix: true });
}

/**
 * A run's steps as the rail draws them: each by its name and its state.
 * @param steps The run's steps, each with its name and its codes.
 * @param cancelled Whether the run was called off.
 * @param held Whether a person holds the run.
 */
export const railStates = (
  steps: ReadonlyArray<Pick<RunView['steps'][number], 'name' | 'phase' | 'reason' | 'on' | 'via'>>,
  cancelled: boolean,
  held: boolean,
): Array<{ name: string; state: StepState; on: WaitOn | null }> =>
  steps.map((step) => ({ name: step.name, state: stepState(step, cancelled, held), on: step.on }));

/**
 * What the rail says aloud: each step and its word, in the run's order: `design verified, land waits on you`, a step a
 * check verified told from one done on its own word.
 * @param steps The run's steps, each with its name and its codes.
 * @param cancelled Whether the run was called off.
 * @param held Whether a person holds the run.
 */
export const railSaid = (
  steps: ReadonlyArray<Pick<RunView['steps'][number], 'name' | 'phase' | 'reason' | 'on' | 'via'>>,
  cancelled: boolean,
  held: boolean,
): string =>
  railStates(steps, cancelled, held)
    .map((step) => `${step.name} ${stateWordsOf(step.state, step.on, held).rail}`)
    .join(', ');

/**
 * A bar of the rail as a button says it: its step's name and the rail's word for its state, `implement, at work`.
 * @param name The step's name.
 * @param state The step's state.
 * @param on What thing the step waits on (`WaitOn`), or null where it waits on no thing.
 * @param held Whether a person holds the run.
 */
export const barSaid = (name: string, state: StepState, on: WaitOn | null, held: boolean): string =>
  `${name}, ${stateWordsOf(state, on, held).rail}`;

/**
 * The parts of a date as a person reads it in `timeZone`, theirs by default: its year, its month in three letters and its day; each
 * empty for a date that does not parse, which the writers that compose them say as `UNREADABLE` before they ask.
 * @param at The date to say.
 * @param timeZone The IANA time zone to say it in, or undefined for the person's own.
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
 * @param at The time it happened.
 * @param now The instant it is now, which sets how much of the date is said.
 * @param timeZone The IANA time zone to say it in, or undefined for the person's own.
 */
export function whenWords(at: Date, now: Date, timeZone?: string): string {
  if (unreadable(at, now)) return UNREADABLE;
  const zone = zoneOf(timeZone);
  const then = dateParts(at, timeZone);
  const time = timeOfDay(at, timeZone);
  if (!isSameYear(at, now, zone)) return `${then.day} ${then.month} ${then.year}`;
  return isSameDay(at, now, zone) ? time : `${then.day} ${then.month} ${time}`;
}
