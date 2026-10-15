/**
 * The runs page's plain words, without React: the one sentence a waiting run says, by the kind of its wait; how a finished run ended; a
 * wall time as a fact to the minute; and what a run's rail of steps says aloud. Each sentence is built from the row's steps and their
 * names alone: what the api advises a person to type is never repeated here. Pure.
 */
import type { RunOutcome, RunSummary } from './api/runs.ts';
import type { Hue } from './meaning.ts';
import { stepState, type StepState } from './status.ts';
import { timeOfDay, unreadable, UNREADABLE } from './timeOfDay.ts';

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

/** What the words read of a row of the light answer: of each step its name and its word, and of the run who it waits on. */
export type WaitingRow = Pick<RunSummary, 'cancelledAt' | 'holding' | 'waiting' | 'waitingOnYou'> & {
  steps: ReadonlyArray<Pick<RunSummary['steps'][number], 'name' | 'status'>>;
};

/** A row whose button is worded: a `WaitingRow` that says of each step the task of its work too, none for a step not filed yet. */
export type OpenedRow = WaitingRow & { steps: ReadonlyArray<Pick<RunSummary['steps'][number], 'name' | 'status' | 'taskId'>> };

/** A wait: its kind, the step that waits, none for a wait of the run's own, and how many of the run's steps are done. */
export type Wait = { kind: WaitKind; step: string | null; done: number };

/** How the api ends the word of a step whose check did not finish: no exit, so no verdict on the work. */
const UNFINISHED = /\(unfinished\)$/;

/**
 * The kind of wait a step saying `status` is on its row: its state's (`waitKindOf`), but `unfinished` where its check did not finish,
 * which refused nothing.
 */
function kindOn(row: WaitingRow, status: string): WaitKind | null {
  const kind = waitKindOf[stateOn(row, status)];
  return kind === 'check' && UNFINISHED.test(status) ? 'unfinished' : kind;
}

/** A step's state on its row (`stepState`). */
const stateOn = (row: WaitingRow, status: string): StepState => stepState(status, Boolean(row.cancelledAt), row.holding != null);

/**
 * What `row` waits on a person for: a hold only a person lifts first; then the first of its steps, in the run's order, that the api
 * says waits on a person (`waitingOnYou`), by its kind (`kindOn`); then a run it waits on that never ships without a person. None for a
 * row that waits on nobody, and for one whose waiting step says a word the board has no kind for.
 */
export function waitOf(row: WaitingRow): Wait | null {
  const done = row.steps.filter((step) => ['verified', 'unverified'].includes(stateOn(row, step.status))).length;
  if (row.holding?.onYou) return { kind: 'hold', step: null, done };
  for (const step of row.steps) {
    const kind = kindOn(row, step.status);
    if (kind && row.waitingOnYou.includes(step.name)) return { kind, step: step.name, done };
  }
  return row.waiting?.onYou ? { kind: 'after', step: null, done } : null;
}

/** A count up to twelve in a word, capitalised; in digits past it. */
const COUNTED = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];

/** How many steps are done, as a sentence and its space; nothing for none. */
const doneSaid = (done: number): string =>
  done === 0 ? '' : done === 1 ? 'One step is done. ' : `${COUNTED[done] ?? String(done)} steps are done. `;

/** A step's name as a sentence starts with it. */
const named = (step: string | null): string => (step ? step.charAt(0).toUpperCase() + step.slice(1) : 'A step');

/** Each kind's sentence, from the wait. */
const SENTENCES: Record<WaitKind, (wait: Wait) => string> = {
  approve: (wait) => `${doneSaid(wait.done)}${named(wait.step)} waits for your approval.`,
  blocked: (wait) => `${named(wait.step)} stopped and needs your word to go on.`,
  check: (wait) => `The check refused ${named(wait.step)}'s work. Try it again or call the run off.`,
  unfinished: (wait) => `${named(wait.step)}'s check did not finish, so nothing judged its work. Run the check again.`,
  unsigned: (wait) => `${named(wait.step)} ended without signing its work. Try it again.`,
  denied: (wait) => `${named(wait.step)} was refused a tool it called. Try it again.`,
  rounds: (wait) => `${named(wait.step)} is out of rounds. Give it another or decide its result.`,
  budget: (wait) => `${named(wait.step)} is past its budget. Say whether it may spend more.`,
  hold: () => 'You hold this run. It moves once you lift the hold.',
  after: () => 'It waits on a run that will not finish without you.',
};

/** What a waiting row says of a wait the board has no kind for. */
export const WAITS = 'It waits on you.';

/** The sentence of a wait of `kind`. */
export const sentenceOf = (wait: Wait): string => SENTENCES[wait.kind](wait);

/** The one sentence a waiting run says: its wait's (`waitOf`), or that it waits on you where the board has no kind for it. */
export function waitSentence(row: WaitingRow): string {
  const wait = waitOf(row);
  return wait ? sentenceOf(wait) : WAITS;
}

/** What a waiting card's tag says of each kind of wait, in two or three words; `approve` and `blocked` name the step. */
const TAGS: Record<WaitKind, (wait: Wait) => string> = {
  approve: (wait) => (wait.step ? `approve ${wait.step}` : 'approve'),
  blocked: (wait) => (wait.step ? `answer ${wait.step}` : 'answer'),
  check: () => 'check refused',
  unfinished: () => 'check unfinished',
  unsigned: () => 'not signed',
  denied: () => 'tool refused',
  rounds: () => 'out of rounds',
  budget: () => 'past budget',
  hold: () => 'held by you',
  after: () => 'waits on a run',
};

/** What a waiting card's tag says of a wait the board has no kind for. */
export const WAITS_TAG = 'waits on you';

/** The few words of a waiting run's tag: what is asked of the person (`approve land`). */
export function waitTag(row: WaitingRow): string {
  const wait = waitOf(row);
  return wait ? TAGS[wait.kind](wait) : WAITS_TAG;
}

/** The states of a step a run is past. */
const PAST: readonly StepState[] = ['verified', 'unverified'];

/** What a waiting card's button says where the card names nothing to read: it opens the run's page. */
export const OPENS = 'Open the run';

/**
 * The step whose work a person reads at the gate of `gated` on `row`: the gated step itself where it has run (its task is filed), else
 * the last step done before it, as at a gate held before its step is filed. None where neither is.
 */
function readAt(row: OpenedRow, gated: string | null): string | null {
  const at = row.steps.findIndex((step) => step.name === gated);
  if (at < 0) return null;
  if (row.steps[at].taskId !== null) return row.steps[at].name;
  const done = row.steps.slice(0, at).filter((step) => PAST.includes(stateOn(row, step.status)));
  return done.pop()?.name ?? null;
}

/** What a waiting card's button says of each kind of wait: what there is to read where it is one thing, else `OPENS`. */
const OPEN_WORDS: Record<WaitKind, (wait: Wait, row: OpenedRow) => string> = {
  approve: (wait, row) => {
    const step = readAt(row, wait.step);
    return step ? `Read the ${step}` : OPENS;
  },
  blocked: () => 'Read the question',
  check: () => 'Read the check',
  unfinished: () => 'Read the check',
  unsigned: () => OPENS,
  denied: () => OPENS,
  rounds: () => OPENS,
  budget: () => OPENS,
  hold: () => OPENS,
  after: () => OPENS,
};

/**
 * The words of a waiting card's button, by the kind of its wait (`waitOf`): `Read the design` at a gate, `Read the question`,
 * `Read the check`, and `Open the run` for every other kind and for a wait the board has no kind for. The button opens the run's page
 * whatever it says.
 */
export function openWord(row: OpenedRow): string {
  const wait = waitOf(row);
  return wait ? OPEN_WORDS[wait.kind](wait, row) : OPENS;
}

/** What a row in flight says it does now: the word of the step it is on, and a note of which step, its place, and how long. */
export type Now = { word: string; note: string };

/**
 * What a run in flight does now: its first step not done, by the rail's word for its state, its name and its place among the run's
 * steps (`implement (2 of 4)`), then how long the run has been at work without a stop, to the minute, where `workingMs` gives it.
 * None for a run whose every step is done.
 */
export function nowOf(row: WaitingRow, workingMs: number | null): Now | null {
  const states = railStates(row.steps, Boolean(row.cancelledAt), row.holding != null);
  const at = states.findIndex((step) => !PAST.includes(step.state));
  const step = states[at];
  if (!step) return null;
  const place = `${step.name} (${at + 1} of ${states.length})`;
  const timed = step.state === 'working' && workingMs !== null;
  return { word: railWord[step.state], note: timed ? `${place}, ${sinceWords(workingMs)}` : place };
}

/** How a finished run ended, as the page says it: a word, its whole sentence, and the hue it is drawn in. */
export type Ended = { word: string; title: string; hue: Hue };

const ENDED: Record<RunOutcome, Ended> = {
  succeeded: { word: 'done', title: 'Every step of it is done.', hue: 'sage' },
  cancelled: { word: 'cancelled', title: 'Somebody called it off.', hue: 'grey' },
  failed: { word: 'failed', title: 'It stopped on a step that failed.', hue: 'failure' },
  undecided: { word: 'undecided', title: 'Nobody has decided its result.', hue: 'yours' },
};

/** How a finished run of `outcome` ended. */
export const endedWords = (outcome: RunOutcome): Ended => ENDED[outcome];

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

/** What the rail says of a step in each state. */
export const railWord: Record<StepState, string> = {
  working: 'at work',
  'needs-human': 'asks you',
  checking: 'being checked',
  verified: 'verified',
  unverified: 'done',
  blocked: 'waits for you',
  'awaiting-approval': 'waits for you',
  exhausted: 'waits for you',
  'over-budget': 'waits for you',
  'budget-exhausted': 'waits for you',
  denied: 'to try again',
  unsigned: 'to try again',
  failed: 'failed',
  'failed-check': 'failed its check',
  waiting: 'to come',
  'waiting-for-slot': 'to come',
  held: 'held',
  cancelled: 'called off',
  unreadable: 'unreadable',
  unknown: 'unknown',
};

/** A run's steps as the rail draws them: each by its name and its state. */
export const railStates = (
  steps: ReadonlyArray<Pick<RunSummary['steps'][number], 'name' | 'status'>>,
  cancelled: boolean,
  held: boolean,
): Array<{ name: string; state: StepState }> => steps.map((step) => ({ name: step.name, state: stepState(step.status, cancelled, held) }));

/** What the rail says aloud: each step and its word, in the run's order: `design verified, land waits for you`, a step a
 * check verified told from one done on its own word. */
export const railSaid = (
  steps: ReadonlyArray<Pick<RunSummary['steps'][number], 'name' | 'status'>>,
  cancelled: boolean,
  held: boolean,
): string =>
  railStates(steps, cancelled, held)
    .map((step) => `${step.name} ${railWord[step.state]}`)
    .join(', ');

/**
 * The parts of a date as a person reads it in `timeZone`, theirs by default: its year, its month in three letters and its day; each
 * empty for a date that does not parse, which the writers that compose them say as `UNREADABLE` before they ask.
 */
export function dateParts(at: Date, timeZone?: string): { year: string; month: string; day: string } {
  if (unreadable(at)) return { year: '', month: '', day: '' };
  const parts = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone }).formatToParts(at);
  const of = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? '';
  return { year: of('year'), month: of('month'), day: of('day') };
}

/**
 * When something of a run happened, as a person reads it where they are, to the minute, on a 12-hour clock: the time alone on the day
 * of `now` (`1:11 PM`), the day and the month before it on another (`11 Oct 1:11 PM`), and in another year the day alone, with its
 * year (`31 Dec 2025`). Its spaces are plain ones. `UNREADABLE` where `at` or `now` does not parse.
 */
export function whenWords(at: Date, now: Date, timeZone?: string): string {
  if (unreadable(at, now)) return UNREADABLE;
  const [then, today] = [dateParts(at, timeZone), dateParts(now, timeZone)];
  const time = timeOfDay(at, timeZone);
  if (then.year !== today.year) return `${then.day} ${then.month} ${then.year}`;
  return then.day === today.day && then.month === today.month ? time : `${then.day} ${then.month} ${time}`;
}

/**
 * When something of a run happened, as a column of a table writes it: its date on every row, the day of `now` included, and its time
 * on a 12-hour clock, the day and the hour each two characters wide so that a mono column lines up (`11 Oct  1:11 PM`,
 * ` 3 Aug 11:05 AM`); in another year than `now`'s the day and its year (`31 Dec 2025`). Its spaces are plain ones: draw it with
 * its white space kept. `UNREADABLE`, unpadded, where `at` or `now` does not parse.
 */
export function whenColumn(at: Date, now: Date, timeZone?: string): string {
  if (unreadable(at, now)) return UNREADABLE;
  const then = dateParts(at, timeZone);
  const date = `${then.day.padStart(2)} ${then.month}`;
  if (then.year !== dateParts(now, timeZone).year) return `${date} ${then.year}`;
  return `${date} ${timeOfDay(at, timeZone).padStart(8)}`;
}
