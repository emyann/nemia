/**
 * Every word the board says to a person of a step's state, of a run's wait and of how a run ended, in one place: where the board's words
 * differ from the code's (`awaiting-approval` is `waiting`, `unsigned` is `retry`), they are translated here and nowhere else. A state
 * the board names is one word, and its sentence is its meaning, on hover.
 * `status.ts` reads a step's codes into its state, `runWords.ts` and `stepPart.ts` compose; each reads its words from here. No word here is
 * the runtime's: a person hovering over a chip reads what the state means to them, never how it is kept.
 */
import type { ProposalPhase } from 'objects';
import type { CardState } from './api/inbox.ts';
import type { RunOutcome } from './api/runs.ts';
import type { StepCheck, WaitOn } from 'objects';

/** A check's verdict: its result, and the code it exited with. */
type CheckVerdict = NonNullable<StepCheck['verdict']>;
import type { OfferCase } from './asks.ts';
import type { Hue } from './meaning.ts';
import type { StepState } from './status.ts';

/** A wait on a person, as its words read it: the step that waits, none for a wait of the run's own, and how many steps are done. */
export type Wait = { step: string | null; done: number };

/** The words of a wait: the card's tag, its one sentence, and its button, given the step whose work there is to read, if one. */
interface WaitWords {
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

/**
 * What a waiting card's button says at an approval's gate: it approves the step that waits.
 * @param step The gated step's name.
 */
export const approves = (step: string) => `Approve ${step}`;

/** A count up to twelve in a word, capitalised; in digits past it. */
const COUNTED = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];

/** How many steps are done, as a sentence and its space; nothing for none. */
const doneSaid = (done: number) =>
  done === 0 ? '' : done === 1 ? 'One step is done. ' : `${COUNTED[done] ?? String(done)} steps are done. `;

/** A step's name as a sentence starts with it. */
const named = (step: string | null) => (step ? step.charAt(0).toUpperCase() + step.slice(1) : 'A step');

const opens = () => OPENS;

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

/** A state that waits on you: the rail says `waiting` of every gate alike, in the hue that is yours, and its wait says what is asked. */
const GATE = 'waiting';

/** A person's words for each state of a step. */
export const PERSON: Record<StepState, PersonWords> = {
  working: { rail: 'working', meaning: 'Its session is running.', ...NONE },
  paused: {
    rail: 'paused',
    meaning: "Parked between two tool calls by the store's pause; resumes as the same try.",
    ...NONE,
  },
  'asks-in-session': { rail: 'asking', meaning: 'Its session is asking a person a question.', ...NONE },
  checking: { rail: 'checking', meaning: 'It signed off, and the run is running its check.', ...NONE },
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
    rail: 'retry',
    meaning:
      'The run did not take its closeout: it gave none, left out a field its output declares, or named a file the run does not have. Try it again.',
    tag: () => 'try it again',
    sentence: (wait) => `${named(wait.step)} ended without signing its work. Try it again.`,
    open: opens,
  },
  denied: {
    rail: 'retry',
    meaning:
      "Its harness refused its try a call, and the step says denials fail. Nothing after it starts until you try it again; a new run's allowedTools: is where the call is let through.",
    tag: () => 'tool refused',
    sentence: (wait) => `${named(wait.step)} was refused a tool it called. Try it again.`,
    open: opens,
  },
  failed: { rail: 'failed', meaning: 'Its session failed.', ...NONE },
  'failed-check': {
    rail: 'failed',
    meaning: 'The command the run judges it by did not exit 0.',
    tag: () => 'failed',
    sentence: (wait) => `${named(wait.step)} failed its check. Try it again or call the run off.`,
    open: () => 'Read the check',
  },
  waiting: { rail: 'pending', meaning: 'It has not started yet.', ...NONE },
  'waiting-for-slot': {
    rail: 'queued',
    meaning:
      'It has not started yet: the cap on runs in flight holds the run, and it starts once a run in flight settles, oldest held first.',
    ...NONE,
  },
  held: {
    rail: 'held',
    meaning: 'A person holds the run, so nothing of it starts and nothing is asked of you until the hold lifts.',
    ...NONE,
  },
  cancelled: { rail: 'cancelled', meaning: 'The run was called off.', ...NONE },
  skipped: { rail: 'skipped', meaning: 'Its route was not taken, so it never runs: the run goes on without it.', ...NONE },
  sent: { rail: 'sent', meaning: 'It filed its card for another workflow, and that run carries the work on.', ...NONE },
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
  rail: 'paused',
  meaning: 'It signed off, and its check runs once the factories are resumed.',
};

/**
 * A step not started on a run a person holds: named as any step to come, since it is drawn as one, and its meaning says the hold is why it
 * has not.
 */
export const HELD_TO_COME: Pick<PersonWords, 'rail' | 'meaning'> = {
  rail: PERSON.waiting.rail,
  meaning: 'It has not started yet: a person holds the run, and nothing of it starts until the hold lifts.',
};

/**
 * The rail word and meaning of a step by its state, by what it waits on where a state has a wait of its own (the pause's), and by whether
 * a person holds the run (`runHeld`), which a step not started waits on. `runHeld` has no default, as `stepState`'s has none.
 * @param state The step's state.
 * @param on What the step waits on, or null where it waits on nothing.
 * @param runHeld Whether a person holds the run.
 */
export const stateWordsOf = (state: StepState, on: WaitOn | null, runHeld: boolean) => {
  if (state === 'waiting' && on === 'pause') return PAUSED;
  if (runHeld && (state === 'waiting' || state === 'waiting-for-slot')) return HELD_TO_COME;
  return PERSON[state];
};

/**
 * What a chip says on hover: what its state means; for a step the store's pause parked, the api's sentence, which names the call it
 * stopped after or the call cut, where it says more than the rail word; then the step's note, when it has one.
 * @param state The step's state.
 * @param meaning What the state means, in words.
 * @param message The api's sentence of the step, or undefined where it says none.
 * @param note The step's note, or null where it has none.
 */
export const chipTitle = (state: StepState, meaning: string, message: string | undefined, note: string | null) =>
  [meaning, state === 'paused' && message && message !== PERSON.paused.rail ? message : null, note || null]
    .filter((line) => line !== null)
    .join('\n');

/**
 * A check's verdict as a person reads it, from its codes: `passed`, `exit 1` for the code it failed with (`failed` where it gave none),
 * `unfinished` for one that did not finish, `checking` while it runs, and `unknown` for a task the engine has no record of.
 */
export function verdictWords({ result, exit }: CheckVerdict) {
  if (result === 'failed') return exit === null ? 'failed' : `exit ${exit}`;
  return result === 'running' ? 'checking' : result;
}

/**
 * The words of the waits a run has of its own, which no step's state says: a hold only a person lifts, a run it waits on that never
 * lands without a person, and a check that did not finish, which refused nothing.
 */
export const RUN_WAITS: Record<'hold' | 'after' | 'unfinished', WaitWords> = {
  hold: { tag: () => 'held', sentence: () => 'It is held until a run that never lands on its own: lift the hold.', open: opens },
  after: { tag: () => 'waits on a run', sentence: () => 'It waits on a run that will not finish without you.', open: opens },
  unfinished: {
    tag: () => 'check unfinished',
    sentence: (wait) => `${named(wait.step)}'s check did not finish, so nothing judged its work. Run the check again.`,
    open: () => 'Read the check',
  },
};

/**
 * The words a runs-page row says beside its chip of what its step waits on, where it waits on no person: the run it waits on (`waits
 * on` before its id), the checkout (`waits on` the id of the run that has it and `· the checkout`, or the checkout alone where no run
 * is named), a run slot, a hold until a run lands (`until` and `lands` around its id, and after it why it never lands where it will not:
 * called off, not in the store, its branches gone), a step past its cap; a held row's hold line (`noWhy` where its person said no why, `by`
 * before who they said they are); and on hover, its round of its rounds, its budget's ring and how many runs wait on it.
 */
export const NOW_WORDS = {
  waitsOn: 'waits on',
  checkout: 'waits on the checkout',
  theCheckout: '· the checkout',
  slot: 'a run slot',
  until: '· until',
  lands: 'lands',
  calledOff: '(cancelled)',
  missing: '(not in the store)',
  gone: '(its branches gone)',
  noWhy: 'no reason given',
  by: 'by',
  over: (cap: string) => `over its ${cap}`,
  round: (at: number, of: number) => `round ${at} of ${of}`,
  ring: (spent: string, cap: string) => `its step: ${spent} of its ${cap} cap`,
  waitedBy: (count: number) => (count === 1 ? 'a run waits on it' : `${count} runs wait on it`),
  inHand: (who: string) => `· ${who} has it`,
  hasIt: (who: string) => `${who} has it in hand`,
  backAt: (at: string) => `back to you at ${at}`,
  notTimed: 'not timed while nothing is asked',
  someone: 'someone',
} as const;

/**
 * Where a run stands, in a word, as the start form, the run's header and the floor's run tag name it (`standingOf`): waiting on a
 * person, running, or finished; a cancelled run says `ENDED.cancelled.word`.
 */
export const STANDING = { waiting: 'waiting', running: 'running', finished: 'finished' } as const;

/** The tag over an ask of hers in the chat, while it is asked: a permission's `Asks to run` is an action, and says so. */
export const ASKING = 'asking';

/** The words of a wait the board has no kind for. */
export const ANY_WAIT: WaitWords = { tag: () => GATE, sentence: () => 'It waits on you.', open: opens };

/** How a finished run ended, as every page says it: a word, its whole sentence, and the hue it is drawn in. */
type Ended = { word: string; title: string; hue: Hue };

/** How a finished run of each outcome ended (`Ended`): the one table of an outcome's word and hue. */
export const ENDED: Record<RunOutcome, Ended> = {
  succeeded: { word: 'done', title: 'Every step of it is done.', hue: 'sage' },
  cancelled: { word: 'cancelled', title: 'Somebody called it off.', hue: 'grey' },
  failed: { word: 'failed', title: 'It stopped on a step that failed.', hue: 'failure' },
  undecided: { word: 'undecided', title: 'Nobody has decided its result.', hue: 'yours' },
};

/**
 * A person's word for each state of an inbox card (`CardState`), its whole sentence on hover, and the hue its chip is drawn in: the card's
 * own three until it starts, and its run's phase from then on, said as the runs pages say it — `waiting` for a run waiting on a
 * person, and `cancelled` for one called off (`ENDED`).
 */
export const CARD_WORDS: Record<CardState, { word: string; title: string; hue: Hue }> = {
  filed: { word: 'filed', title: 'Filed, and not started: Start it, or queue it to start on its own.', hue: 'grey' },
  queued: { word: 'queued', title: 'Queued: it starts on its own when a run slot is free.', hue: 'grey' },
  refused: { word: 'refused', title: 'Queued, and its start was refused: edit the card, or take it off the queue.', hue: 'failure' },
  pending: { word: 'pending', title: 'Its run is started and waits its turn: nothing of it is at work yet.', hue: 'grey' },
  running: { word: 'working', title: 'Its run is at work.', hue: 'alive' },
  waiting: { word: 'waiting', title: 'Its run waits on you: open it to see what it asks.', hue: 'yours' },
  succeeded: { word: ENDED.succeeded.word, title: `Its run is done. ${ENDED.succeeded.title}`, hue: ENDED.succeeded.hue },
  failed: { word: ENDED.failed.word, title: `Its run failed. ${ENDED.failed.title}`, hue: ENDED.failed.hue },
  stopped: { word: 'stopped', title: 'Its run was stopped before it ended.', hue: 'grey' },
  cancelled: { word: ENDED.cancelled.word, title: `Its run was called off. ${ENDED.cancelled.title}`, hue: ENDED.cancelled.hue },
};

/**
 * A person's word for each phase of a factory's proposal (`ProposalPhase`), its whole sentence on hover, and the hue its tag is drawn in:
 * `yours` while it waits on them, `failure` where it failed to apply, sage once applied, grey for the rest.
 */
export const PROPOSAL_WORDS: Record<ProposalPhase, { word: string; title: string; hue: Hue }> = {
  waiting: { word: 'waiting', title: 'It waits on your approval: Approve it, or Decline it.', hue: 'yours' },
  approved: {
    word: 'approved',
    title: 'Approved, and applied when the run that proposed it ends well: Decline it before then to take it back.',
    hue: 'grey',
  },
  applied: { word: 'applied', title: 'Approved and applied: the factory reads it as written.', hue: 'sage' },
  declined: { word: 'declined', title: 'Declined: nothing of it was written.', hue: 'grey' },
  stale: { word: 'stale', title: 'An object it changes moved since it was proposed: nothing was written; propose it again.', hue: 'grey' },
  dropped: { word: 'dropped', title: 'The run that proposed it ended without succeeding: nothing was written.', hue: 'grey' },
  failed: { word: 'failed', title: 'Approved, and it failed to apply: its message says why.', hue: 'failure' },
};

/** A sentence a try is given in its box, the same for each case that asks for one: something to tell it, if anything. */
const TELL_IT = 'Anything to tell it (optional): the next try is told it.';

/** What a try's box is called, for a case that may tell it something. */
const toTell = (step: string) => `What to tell ${step}, if anything`;

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

/**
 * The words of a series of questions (`QuestionSeries`): how a question says it takes one answer or several, and the two ways out the
 * board supplies on every question, as the Agent SDK's question tool supplies "Other" itself: no agent writes them.
 */
export const SERIES = {
  takesOne: 'Choose one',
  takesAny: 'Choose any',
  eyebrow: (n: number) => `Question ${n}`,
  recommended: 'recommended',
  addWords: 'Add your words',
  words: (title: string) => `Your own words on ${title}`,
  ways: {
    else: { title: 'Something else', line: 'An answer none of these gives. Say it in your words.', words: 'Say it in your words' },
    none: { title: 'None of these', line: 'None fits. Say why, if you will.', words: 'Why none fits (optional)' },
  },
  beside: 'Beside your choice, in your words (optional)',
} as const;

/** What every offer's words hold (`OFFERS`). */
interface OfferWords {
  readonly said: string | null | Readonly<Record<string, string>> | ((calls: string | null) => string);
  readonly form: (step: string) => string;
  readonly field: (step: string) => string;
  readonly placeholder: string;
  readonly button: string;
}
