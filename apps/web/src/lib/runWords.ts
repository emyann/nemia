/**
 * The runs page's plain words, without React: the one sentence a waiting run says, by the kind of its wait; how a finished run ended; a
 * wall time as a fact to the minute; and what a run's rail of steps says aloud. Each sentence is built from the row's steps and their
 * names alone: what the api advises a person to type is never repeated here. Pure.
 */
import type { RunOutcome, RunSummary } from './api/runs.ts';
import type { Hue } from './meaning.ts';
import { stepState, type StepState } from './status.ts';

/** Every kind of wait on a person the page has a sentence for. */
export const WAIT_KINDS = ['approve', 'asks', 'blocked', 'check', 'unsigned', 'denied', 'rounds', 'budget', 'hold', 'after'] as const;

/** A kind of wait on a person. */
export type WaitKind = (typeof WAIT_KINDS)[number];

/** The kind of wait each state of a step is, none for a state that waits on nobody. A held run's gate is the hold's, not an approval. */
export const waitKindOf: Record<StepState, WaitKind | null> = {
  working: null,
  'needs-human': 'asks',
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
  held: 'hold',
  cancelled: null,
  unreadable: null,
  unknown: null,
};

/** What the words read of a row of the light answer. */
export type WaitingRow = Pick<RunSummary, 'steps' | 'cancelledAt' | 'holding' | 'waiting' | 'waitingOnYou'>;

/** A wait: its kind, the step that waits, none for a wait of the run's own, and how many of the run's steps are done. */
export type Wait = { kind: WaitKind; step: string | null; done: number };

/** A step's state on its row (`stepState`). */
const stateOn = (row: WaitingRow, status: string): StepState => stepState(status, Boolean(row.cancelledAt), row.holding != null);

/**
 * What `row` waits on a person for: a hold only a person lifts first; then the first of its steps, in the run's order, that the api
 * says waits on a person or whose session asks, by its state's kind; then a run it waits on that never ships without a person. None
 * for a row that waits on nobody, and for one whose waiting step says a word the board has no kind for.
 */
export function waitOf(row: WaitingRow): Wait | null {
  const done = row.steps.filter((step) => ['verified', 'unverified'].includes(stateOn(row, step.status))).length;
  if (row.holding?.onYou) return { kind: 'hold', step: null, done };
  for (const step of row.steps) {
    const state = stateOn(row, step.status);
    const kind = waitKindOf[state];
    if (kind && (row.waitingOnYou.includes(step.name) || state === 'needs-human')) return { kind, step: step.name, done };
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
  asks: (wait) => `${named(wait.step)} asks you a question while it works.`,
  blocked: (wait) => `${named(wait.step)} stopped and needs your word to go on.`,
  check: (wait) => `The check refused ${named(wait.step)}'s work. Try it again or call the run off.`,
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

/** A run's wall time as a fact: `27m since it was created`. */
export const sinceCreated = (ms: number): string => `${sinceWords(ms)} since it was created`;

/** What the rail says of a step in each state. */
export const railWord: Record<StepState, string> = {
  working: 'at work',
  'needs-human': 'asks you',
  checking: 'being checked',
  verified: 'done',
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

/** What the rail says aloud: each step and its word, in the run's order: `design done, land waits for you`. */
export const railSaid = (
  steps: ReadonlyArray<Pick<RunSummary['steps'][number], 'name' | 'status'>>,
  cancelled: boolean,
  held: boolean,
): string =>
  railStates(steps, cancelled, held)
    .map((step) => `${step.name} ${railWord[step.state]}`)
    .join(', ');
