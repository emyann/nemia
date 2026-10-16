/**
 * The feed's reason table (`reason.ts`): every word the package writes maps to a reason, the lines that wait on a person are exactly the
 * lines a subscriber was woken by before the selectors and is woken by after them, and every entry of the table is one some word reaches.
 *
 * The fixtures are built from the code's own constants and word-builders wherever there is one — `SLOT_WAIT`, `slotWord`, `PAUSE_WAIT`,
 * `checkoutWord`, `waitWord`, `holdWord`, `waitingWords`, `REMOVED`, `DENIED` — and the statuses are keyed by their unions
 * (`Record<Assessment['status'], …>`, `Record<StepStatus, …>`), so a status added anywhere fails this file's typecheck rather than
 * falling silently to `Unknown`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DENIED, kindsOf, messageOf, reasonOf, REASON_CODES, typeOf, waitsOf, REMOVED, type InvolvedKind, type Reason } from './reason.ts';
import { upgraded, type FeedLine } from './feed.ts';
import { SLOT_WAIT, slotWord } from '../cap/cap.ts';
import { PAUSE_WAIT, waitingWords } from '../list/list.ts';
import { checkoutWord } from '../ending/ending.ts';
import { holdWord, waitWord } from '../wait/wait.ts';
import { FORMER_DEFAULT_WAKE, FORMER_NEMIA_WAKE, selectorsOfWake } from '../subscription/index.ts';
import { parseSelectors, selects } from '../watch/selector.ts';
import type { Assessment } from '../tick/assess.ts';
import type { StepStatus } from '../record/record.ts';

/** One fixture: the kind the line is about, the word and note it carries, and the reason the table must name. */
type Case = { kind: InvolvedKind; word: string; note?: string; reason: Reason };

/** Every word `assess` gives a run, with `(pruned)` beside it as `nemia ls` says it. Exhaustive over the status union. */
const RUN_STATUS = {
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
  cancelled: 'Cancelled',
  'awaiting approval': 'AwaitingApproval',
  blocked: 'Blocked',
} satisfies Record<Assessment['status'], Reason>;

/** Every status a step stands at, in the word `nemia ls` prints for it. Exhaustive over `StepStatus`. */
const STEP_STATUS = {
  waiting: { word: 'waiting', reason: 'Waiting' },
  running: { word: 'running', reason: 'Running' },
  blocked: { word: 'blocked', reason: 'Blocked' },
  unsigned: { word: 'unsigned', reason: 'Unsigned' },
  checking: { word: 'checking', reason: 'Checking' },
  verified: { word: 'verified ✓', reason: 'CheckPassed' },
  unverified: { word: 'unverified', reason: 'Unknown' },
  'awaiting approval': { word: 'awaiting approval', reason: 'AwaitingApproval' },
  exhausted: { word: 'rounds exhausted', reason: 'RoundsExhausted' },
  'over budget': { word: 'over budget $21.00 of $20', reason: 'OverBudget' },
  'budget exhausted': { word: 'budget exhausted ≥$21.00 of $20', reason: 'BudgetExhausted' },
  denied: { word: 'denied', reason: 'CheckDenied' },
  'failed (check)': { word: 'failed ✗ check (exit 1)', reason: 'CheckFailed' },
  failed: { word: 'failed', reason: 'Failed' },
  stopped: { word: 'stopped', reason: 'Stopped' },
} satisfies Record<StepStatus, { word: string; reason: Reason }>;

/** What the engine's word for a task comes to in the feed (`feedPhase`), and the two words `listing` writes in its place. */
const PHASE_WORDS: readonly Case[] = [
  { kind: 'Step', word: 'pending', reason: 'Pending' },
  { kind: 'Step', word: 'running', reason: 'Running' },
  { kind: 'Step', word: 'succeeded', reason: 'Succeeded' },
  { kind: 'Step', word: 'failed', reason: 'Failed' },
  { kind: 'Step', word: 'stopped', reason: 'Stopped' },
  { kind: 'Step', word: 'unknown', reason: 'Unknown' },
  { kind: 'Step', word: 'needs-human', reason: 'NeedsHuman' },
  { kind: 'Step', word: `needs-human: ${waitingWords('permission prompt')}`, reason: 'NeedsHuman' },
  { kind: 'Step', word: 'input-required', reason: 'Unknown' },
  { kind: 'Step', word: 'unverified', reason: 'Unknown' },
];

/** What a step's closeout adds after its word (`listing`), on the words the real feed carries them on. */
const SAID_WORDS: readonly Case[] = [
  { kind: 'Step', word: 'succeeded · done', reason: 'Succeeded' },
  { kind: 'Step', word: 'unverified · done', reason: 'Succeeded' },
  { kind: 'Step', word: 'input-required · done', reason: 'Succeeded' },
  { kind: 'Step', word: 'unsigned · done', reason: 'Unsigned' },
  { kind: 'Step', word: 'input-required · BLOCKED', reason: 'Blocked' },
  { kind: 'Step', word: 'succeeded · BLOCKED', reason: 'Blocked' },
  { kind: 'Step', word: 'unverified · BLOCKED', note: 'needs: whose call is it', reason: 'Blocked' },
  { kind: 'Step', word: 'unverified · closeout unreadable', reason: 'UnreadableCloseout' },
];

/** Every wait a step's word says, each from the code that words it. */
const WAIT_WORDS: readonly Case[] = [
  { kind: 'Step', word: SLOT_WAIT, reason: 'WaitingForSlot' },
  { kind: 'Step', word: slotWord({ inFlight: 1, cap: 2 }), reason: 'WaitingForSlot' },
  { kind: 'Step', word: PAUSE_WAIT, note: 'its check is filed on nemia resume', reason: 'WaitingForPause' },
  { kind: 'Step', word: checkoutWord({ run: 'r-2', step: 'land' }), reason: 'WaitingForCheckout' },
  { kind: 'Step', word: waitWord([{ run: 'r-2' }]), reason: 'Waiting' },
  { kind: 'Step', word: waitWord([{ run: 'r-2' }, { run: 'r-3' }]), reason: 'Waiting' },
];

/** A run's own lines: its statuses, pruned and not, a hold, who it waits on, and the word of a run the store no longer has. */
const RUN_LINES: readonly Case[] = [
  ...Object.entries(RUN_STATUS).flatMap(([word, reason]): Case[] => [
    { kind: 'Run', word, reason },
    { kind: 'Run', word: `${word} (pruned)`, reason },
  ]),
  { kind: 'Run', word: REMOVED, reason: 'Removed' },
  { kind: 'Run', word: 'running', note: holdWord([{ run: 'r-2' }]), reason: 'Held' },
  { kind: 'Run', word: 'running', note: holdWord([], { why: 'the base moved', by: 'operator' }), reason: 'Held' },
  { kind: 'Run', word: 'running', note: 'waiting on you: approve plan', reason: 'Running' },
  { kind: 'Run', word: 'awaiting approval', note: 'waiting on you: approve plan', reason: 'AwaitingApproval' },
];

/** The one-shot a tool denial writes, and the one line a daemon writes. */
const ONE_SHOTS: readonly Case[] = [
  { kind: 'Step', word: `${DENIED}Bash(grep)`, note: 'try 2', reason: 'ToolDenied' },
  { kind: 'Step', word: `${DENIED}Skill(look)`, note: 'try 1', reason: 'ToolDenied' },
  { kind: 'Daemon', word: 'daemon started', note: 'first daemon on this store', reason: 'DaemonStarted' },
];

/** Every word the package can write, each with the reason the table must name for it. */
const CASES: readonly Case[] = [
  ...RUN_LINES,
  ...Object.values(STEP_STATUS).map(({ word, reason }): Case => ({ kind: 'Step', word, reason })),
  ...PHASE_WORDS,
  ...SAID_WORDS,
  ...WAIT_WORDS,
  ...ONE_SHOTS,
];

test('every word the package writes maps to a reason', () => {
  for (const c of CASES) {
    const said = { word: c.word, ...(c.note !== undefined ? { note: c.note } : {}) };
    assert.equal(reasonOf(said, c.kind), c.reason, `${c.kind} ${JSON.stringify(c.word)} ${JSON.stringify(c.note ?? '')}`);
  }
});

test('a reason is only named of a kind the table gives it', () => {
  for (const c of CASES) assert.ok(kindsOf(c.reason).includes(c.kind), `${c.reason} is not a reason of a ${c.kind}`);
});

test('every entry of the table is one some word reaches', () => {
  const reached = new Set(
    CASES.map((c) => `${reasonOf({ word: c.word, ...(c.note !== undefined ? { note: c.note } : {}) }, c.kind)}/${c.kind}`),
  );
  const entries = REASON_CODES.flatMap((reason) => kindsOf(reason).map((kind) => `${reason}/${kind}`));
  assert.equal(entries.length, 32, 'the table the owner named has 32 entries');
  assert.equal(REASON_CODES.length, 27, 'of 27 distinct codes');
  assert.deepEqual(
    entries.filter((entry) => !reached.has(entry)),
    [],
    'a table entry no fixture reaches is a code nothing can write, or a word the fixture is missing',
  );
});

/**
 * The retired prose rule, kept here as this file's yardstick: whether `line` held a word of `wake` in its word, or leading a part of its
 * note, whatever the case — the prose a subscription's filter was matched on before it took selectors. It is what the conversion of a
 * stored wake list (`selectorsOfWake`) is held equal to below; deleted as dead code, the old-versus-new equivalence goes with it and
 * nothing refuses a wrong table entry in `former-wake.ts`.
 */
function wokenByFormerWake(line: FeedLine, wake: readonly string[]): boolean {
  const word = line.word.toLowerCase();
  const notes = (line.note ?? '').split(' · ').map((part) => part.trim().toLowerCase());
  return wake.map((w) => w.toLowerCase()).some((w) => word.includes(w) || notes.some((part) => part.startsWith(w)));
}

/** One fixture as the tick writes it to the feed: a signed line of its run, or of its step. */
const lineOf = (c: Case): FeedLine =>
  upgraded({
    at: '2026-10-16T04:00:00.000Z',
    run: 'r-1',
    ...(c.kind === 'Step' ? { step: 'plan' } : {}),
    word: c.word,
    ...(c.note !== undefined ? { note: c.note } : {}),
  });

/** Whether the selectors a stored wake list converts to take `line`. */
const takenByConverted = (wake: readonly string[], line: FeedLine): boolean =>
  selects(parseSelectors(selectorsOfWake(wake).selectors), line);

test('the waiting set is the one the retired wake words woke on, and the one the selectors they convert to take', () => {
  for (const c of CASES) {
    const line = lineOf(c);
    const waits = waitsOf(c.reason, c.note);
    const said = `${c.reason}: ${JSON.stringify(c.word)} ${JSON.stringify(c.note ?? '')}`;
    assert.equal(waits, wokenByFormerWake(line, FORMER_DEFAULT_WAKE), `${said} must wait exactly when the former wake words took it`);
    assert.equal(waits, takenByConverted(FORMER_DEFAULT_WAKE, line), `${said} must be taken exactly by the selectors they convert to`);
  }
});

test("Nemia's former wake list converts to selectors that take the waiting lines and a tool denial, and no other line", () => {
  for (const c of CASES) {
    const line = lineOf(c);
    const hers = waitsOf(c.reason, c.note) || c.reason === 'ToolDenied';
    assert.equal(takenByConverted(FORMER_NEMIA_WAKE, line), hers, `${c.reason}: ${JSON.stringify(c.word)}`);
    assert.equal(wokenByFormerWake(line, FORMER_NEMIA_WAKE), hers, 'which is what her eight words woke on');
  }
  assert.ok(
    CASES.some((c) => c.reason === 'ToolDenied'),
    'a denial is among the fixtures, or the line above proves nothing',
  );
});

test('every one of the 256 stored wake lists converts to selectors that take every line it woke on, and the two note words more', () => {
  const lines = CASES.map(lineOf);
  const subsets = Array.from({ length: 1 << FORMER_NEMIA_WAKE.length }, (_, mask) =>
    FORMER_NEMIA_WAKE.filter((_word, i) => (mask & (1 << i)) !== 0),
  );
  assert.equal(subsets.length, 256);
  let wider = 0;
  for (const wake of subsets)
    for (const [i, line] of lines.entries()) {
      const woken = wokenByFormerWake(line, wake);
      const taken = takenByConverted(wake, line);
      if (woken) assert.ok(taken, `${JSON.stringify(wake)} woke on ${JSON.stringify(CASES[i].word)} and its selectors do not take it`);
      if (taken && !woken) wider++;
    }
  assert.ok(
    wider > 0,
    'waiting on you: and needs: read a note that no selector reads, so they convert to waits=person: a strict superset, never a narrower one',
  );
});

test('a type is the table its reason comes from, and a message is the word and its note', () => {
  assert.equal(typeOf('Failed'), 'Warning');
  assert.equal(typeOf('Running'), 'Normal');
  assert.equal(
    messageOf({ word: 'awaiting approval', note: 'approve it: nemia approve r-1 plan' }),
    'awaiting approval · approve it: nemia approve r-1 plan',
  );
  assert.equal(messageOf({ word: 'running' }), 'running', 'a word with no note is the message whole');
  assert.equal(messageOf({ word: 'running', note: '' }), 'running', 'and so is an empty note');
  assert.equal(messageOf({ word: `${DENIED}Bash(grep)`, note: 'try 2' }), 'denied: Bash(grep) · try 2', "the owner's wording for a denial");
});
