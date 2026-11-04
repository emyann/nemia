/**
 * Every word the board says to a person of a step's state, of a run's wait and of how a run ended, in one place: where the board's words
 * differ from the code's (`awaiting-approval` is `waits on you`, `cancelled` is `called off`), they are translated here and nowhere else.
 * `status.ts` reads a step's codes into its state, `runWords.ts` and `stepCard.ts` compose; each reads its words from here. No word here is
 * the runtime's: a person hovering over a chip reads what the state means to them, never how it is kept.
 */
import type { RunOutcome } from './api/runs.ts';
import type { CheckVerdict, WaitOn } from './api/reasons.ts';
import type { OfferCase } from './asks.ts';
import type { StepState } from './status.ts';

/** A wait on a person, as its words read it: the step that waits, none for a wait of the run's own, and how many steps are done. */
export type Wait = { step: string | null; done: number };

/** The words of a wait: the card's tag, its one sentence, and its button, given the step whose work there is to read, if one. */
export interface WaitWords {
  readonly tag: (wait: Wait) => string;
  readonly sentence: (wait: Wait) => string;
  readonly open: (wait: Wait, read: string | null) => string;
}

/**
 * A person's words for a state: the rail's short word (on the chip, the rail and the card's tag), what it means on hover, and, for a
 * state the api lists as waiting on a person, the words of that wait; null for a state that waits on nobody.
 */
export interface PersonWords {
  readonly rail: string;
  readonly meaning: string;
  readonly tag: WaitWords['tag'] | null;
  readonly sentence: WaitWords['sentence'] | null;
  readonly open: WaitWords['open'] | null;
}

/** What a waiting card's button says where the card names nothing to read: it opens the run's page. */
export const OPENS = 'Open the run';

/** A count up to twelve in a word, capitalised; in digits past it. */
const COUNTED = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];

/** How many steps are done, as a sentence and its space; nothing for none. */
const doneSaid = (done: number): string =>
  done === 0 ? '' : done === 1 ? 'One step is done. ' : `${COUNTED[done] ?? String(done)} steps are done. `;

/** A step's name as a sentence starts with it. */
const named = (step: string | null): string => (step ? step.charAt(0).toUpperCase() + step.slice(1) : 'A step');

const opens = (): string => OPENS;

/** No wait: the words of a state that waits on nobody. */
const NONE = { tag: null, sentence: null, open: null } as const;

const APPROVE: WaitWords = {
  tag: (wait) => (wait.step ? `approve ${wait.step}` : 'approve'),
  sentence: (wait) => `${doneSaid(wait.done)}${named(wait.step)} waits for your approval.`,
  open: (_, read) => (read ? `Read the ${read}` : OPENS),
};

const BUDGET: WaitWords = {
  tag: () => 'past budget',
  sentence: (wait) => `${named(wait.step)} is past its budget. Say whether it may spend more.`,
  open: opens,
};

/** A state that waits on you: the rail says so of every gate alike, and its wait says what is asked. */
const GATE = 'waits on you';

/** A person's words for each state of a step. */
export const PERSON: Record<StepState, PersonWords> = {
  working: { rail: 'at work', meaning: 'Its session is running.', ...NONE },
  'needs-human': { rail: 'asks you', meaning: 'Its session is asking a person a question.', ...NONE },
  checking: { rail: 'being checked', meaning: 'It signed off, and the run is running its check.', ...NONE },
  verified: { rail: 'verified', meaning: 'Its check passed: the command the run judges it by exited 0.', ...NONE },
  unverified: { rail: 'done', meaning: 'It signed off and has no check, so only its own word says it worked.', ...NONE },
  blocked: {
    rail: GATE,
    meaning: 'It signed off without finishing, and needs your word to go on.',
    tag: (wait) => (wait.step ? `answer ${wait.step}` : 'answer'),
    sentence: (wait) => `${named(wait.step)} stopped and needs your word to go on.`,
    open: () => 'Read the question',
  },
  'awaiting-approval': {
    rail: GATE,
    meaning: 'It signed off at its gate. Nothing after it starts until you approve it, or send it back with words for its next try.',
    ...APPROVE,
  },
  exhausted: {
    rail: GATE,
    meaning:
      'The reviewer asked for another round after the last one its rounds allow. You decide: another round, or go on with what is there.',
    tag: () => 'out of rounds',
    sentence: (wait) => `${named(wait.step)} is out of rounds. Give it another or decide its result.`,
    open: opens,
  },
  'over-budget': {
    rail: GATE,
    meaning: 'Its tries have cost its budget or more. The run spends nothing more on it until you raise the cap on a try or a round.',
    ...BUDGET,
  },
  'budget-exhausted': {
    rail: GATE,
    meaning: 'Its session was ended at its budget. Nothing more starts for it until you raise the cap on a try.',
    ...BUDGET,
  },
  unsigned: {
    rail: 'to try again',
    meaning:
      'The run did not take its closeout: it gave none, left out a field its output declares, or named a file the run does not have. Try it again.',
    tag: () => 'try it again',
    sentence: (wait) => `${named(wait.step)} ended without signing its work. Try it again.`,
    open: opens,
  },
  denied: {
    rail: 'to try again',
    meaning:
      "Its harness refused its try a call, and the step says denials fail. Nothing after it starts until you try it again; a new run's allowedTools: is where the call is let through.",
    tag: () => 'tool refused',
    sentence: (wait) => `${named(wait.step)} was refused a tool it called. Try it again.`,
    open: opens,
  },
  failed: { rail: 'failed', meaning: 'Its session failed.', ...NONE },
  'failed-check': {
    rail: 'failed its check',
    meaning: 'The command the run judges it by did not exit 0.',
    tag: () => 'failed its check',
    sentence: (wait) => `${named(wait.step)} failed its check. Try it again or call the run off.`,
    open: () => 'Read the check',
  },
  waiting: { rail: 'to come', meaning: 'It has not started yet.', ...NONE },
  'waiting-for-slot': {
    rail: 'to come',
    meaning:
      'It has not started yet: the cap on runs in flight holds the run, and it starts once a run in flight settles, oldest held first.',
    ...NONE,
  },
  held: {
    rail: 'held',
    meaning: 'A person holds the run until other runs land, so nothing of it starts and nothing is asked of you until the hold lifts.',
    ...NONE,
  },
  cancelled: { rail: 'called off', meaning: 'The run was called off.', ...NONE },
  unreadable: {
    rail: 'unreadable',
    meaning:
      "Its task's record holds an entry Nemia did not write, so the run is not judged and does not move on until the record reads again. The run says which entry.",
    ...NONE,
  },
  unknown: { rail: 'unknown', meaning: 'There is no record of its task.', ...NONE },
};

/** A step `waiting` whose check the store's pause holds: not to come, since it signed off, but held until the factories resume. */
export const PAUSED: Pick<PersonWords, 'rail' | 'meaning'> = {
  rail: 'waits on the pause',
  meaning: 'It signed off, and its check runs once the factories are resumed.',
};

/**
 * A step not started on a run a person holds: named as any step to come, since it is drawn as one, and its meaning says the hold is why it
 * has not.
 */
export const HELD_TO_COME: Pick<PersonWords, 'rail' | 'meaning'> = {
  rail: PERSON.waiting.rail,
  meaning: 'It has not started yet: a person holds the run until other runs land, and nothing of it starts until the hold lifts.',
};

/**
 * The rail word and meaning of a step by its state, by what it waits on where a state has a wait of its own (the pause's), and by whether
 * a person holds the run (`runHeld`), which a step not started waits on. `runHeld` has no default, as `stepState`'s has none.
 */
export const stateWordsOf = (state: StepState, on: WaitOn | null, runHeld: boolean): Pick<PersonWords, 'rail' | 'meaning'> => {
  if (state === 'waiting' && on === 'pause') return PAUSED;
  if (runHeld && (state === 'waiting' || state === 'waiting-for-slot')) return HELD_TO_COME;
  return PERSON[state];
};

/**
 * A check's verdict as a person reads it, from its codes: `passed`, `exit 1` for the code it failed with (`failed` where it gave none),
 * `unfinished` for one that did not finish, `checking` while it runs, and `unknown` for a task the engine has no record of.
 */
export function verdictWords({ result, exit }: CheckVerdict): string {
  if (result === 'failed') return exit === null ? 'failed' : `exit ${exit}`;
  return result === 'running' ? 'checking' : result;
}

/**
 * The words of the waits a run has of its own, which no step's state says: a hold only a person lifts, a run it waits on that never
 * lands without a person, and a check that did not finish, which refused nothing.
 */
export const RUN_WAITS: Record<'hold' | 'after' | 'unfinished', WaitWords> = {
  hold: { tag: () => 'held by you', sentence: () => 'You hold this run. It moves once you lift the hold.', open: opens },
  after: { tag: () => 'waits on a run', sentence: () => 'It waits on a run that will not finish without you.', open: opens },
  unfinished: {
    tag: () => 'check unfinished',
    sentence: (wait) => `${named(wait.step)}'s check did not finish, so nothing judged its work. Run the check again.`,
    open: () => 'Read the check',
  },
};

/** The words of a wait the board has no kind for. */
export const ANY_WAIT: WaitWords = { tag: () => GATE, sentence: () => 'It waits on you.', open: opens };

/** How a finished run ended, as the page says it: a word, and its whole sentence. */
export const ENDED: Record<RunOutcome, { word: string; title: string }> = {
  succeeded: { word: 'done', title: 'Every step of it is done.' },
  cancelled: { word: 'called off', title: 'Somebody called it off.' },
  failed: { word: 'failed', title: 'It stopped on a step that failed.' },
  undecided: { word: 'undecided', title: 'Nobody has decided its result.' },
};

/** A sentence a try is given in its box, the same for each case that asks for one: something to tell it, if anything. */
const TELL_IT = 'Anything to tell it (optional): the next try is told it.';

/** What a try's box is called, for a case that may tell it something. */
const toTell = (step: string): string => `What to tell ${step}, if anything`;

/**
 * A person's words for each offer of a run's page, by why its step waits (`OfferCase`): what its row says after the step's name — null
 * where it says the step's own words instead (its question, the api's word for a raise) — and the names of its form and its box, the box's
 * hint and the button. A case's words that only its row reads sit beside them: a try's words for why it ended unsigned, unfinished or
 * refused, the recheck's, the note beside answers chosen, a raise's buttons, and what a row says once its command is taken.
 */
export const OFFERS = {
  answer: {
    said: 'signed off blocked, and said nothing of what it needs',
    form: (step: string) => `Answer ${step}`,
    field: (step: string) => `Your answer to ${step}`,
    placeholder: 'Your answer: the next try is told it, under “Your answer”.',
    note: 'A note beside the answers (optional): the next try is told it.',
    button: 'Answer and continue',
  },
  'try-again': {
    said: {
      unsigned:
        "gave no closeout the run accepts — none, one short of a field it declares, or one naming a file the run does not have; the CLI's decide says which",
      unfinished: 'has a check that did not finish: no verdict on the work',
      refused: 'was refused by its check',
    },
    form: (step: string) => `Try ${step} again`,
    field: toTell,
    placeholder: TELL_IT,
    button: 'Try again',
    recheck: {
      placeholder: 'A recheck runs the check again and files no session: there is nobody to tell.',
      note: 'Not sent with a recheck: it files no session to read it. Choose a session to send it.',
    },
  },
  denied: {
    said: (calls: string | null) =>
      `signed off having been denied a call${calls ? ` (${calls})` : ''}, and says denials: fail. This run's allowedTools: is frozen, so a try is denied the same again: a new session is told to do without it`,
    form: (step: string) => `Try ${step} again`,
    field: toTell,
    placeholder: TELL_IT,
    button: 'Try again',
  },
  raise: {
    said: null,
    form: (step: string) => `Raise ${step}'s budget`,
    field: toTell,
    placeholder: TELL_IT,
    button: 'Raise the budget and try again',
    buttons: { round: 'Raise the budget and go round again', recheck: 'Run its check again', answer: 'Raise the budget and answer' },
  },
  continue: {
    said: 'asks it: the next tick stops its session, and files the try once it has stopped',
    form: (step: string) => `Continue ${step}`,
    field: toTell,
    placeholder: TELL_IT,
    button: 'Continue',
  },
  enough: {
    said: 'is out of rounds, and waits on you: approve its work as it stands, its findings open, or copy the command that goes round once more',
    form: (step: string) => `Approve ${step} as it stands`,
    field: (step: string) => `Why ${step}'s work is good enough as it stands`,
    placeholder: 'Why the work is good enough with its findings open (required): every step after the loop is handed it.',
    button: 'Approve as it stands',
    approved: (step: string) => `of ${step} approved as it stands — what waits on it is filed on the next tick`,
  },
} as const satisfies Record<OfferCase, OfferWords & Readonly<Record<string, unknown>>>;

/** What every offer's words hold (`OFFERS`). */
export interface OfferWords {
  readonly said: string | null | Readonly<Record<string, string>> | ((calls: string | null) => string);
  readonly form: (step: string) => string;
  readonly field: (step: string) => string;
  readonly placeholder: string;
  readonly button: string;
}
