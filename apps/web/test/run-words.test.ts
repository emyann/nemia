/**
 * The runs page's plain words (src/lib/runWords.ts): one sentence per kind of wait, how a finished run ended, a time to the minute and
 * what the rail says, each over a row as the light answer gives it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RunSummary } from '../src/lib/api.ts';
import { stateMeaning, type StepState } from '../src/lib/status.ts';
import {
  endedWords,
  nowOf,
  openWord,
  presentWait,
  railSaid,
  sentenceOf,
  sinceCreated,
  sinceShort,
  sinceWords,
  WAIT_KINDS,
  waitKindOf,
  waitOf,
  WAITS,
  waitSentence,
  waitTag,
  WAITS_TAG,
  whenColumn,
  whenWords,
  type WaitKind,
} from '../src/lib/runWords.ts';
import { summary } from './run-fixtures.ts';

/** A command, as the api's advice can carry one: no sentence repeats it. */
const COMMAND = 'nemia approve r-1 land --message "go" && git merge wf/r-1/land';

const DONE = [
  ['design', 'verified ✓'],
  ['implement', 'verified ✓'],
  ['review', 'verified ✓'],
] as const;

/** A row of three done steps and `land` saying `status`, which waits on a person. */
const landing = (status: string, extra: Partial<RunSummary> = {}): RunSummary =>
  summary([...DONE, ['land', status]], { status: 'failed', moving: false, waitingOnYou: ['land'], onYou: [COMMAND], ...extra });

const holding = { at: '2026-09-30T05:00:00.000Z', runs: [], word: `held: ${COMMAND}`, advice: COMMAND, onYou: true };
const waiting = {
  runs: [{ run: 'r-0', missing: false, cancelledAt: '2026-09-30T05:00:00.000Z', gone: [] }],
  word: 'waiting on r-0 (cancelled)',
  advice: COMMAND,
  onYou: true,
};

/** One row of the light answer per kind of wait, the sentence it says, and the words of its card's button. */
const ROWS: Record<WaitKind, { row: RunSummary; says: string; opens: string }> = {
  approve: { row: landing('awaiting approval'), says: 'Three steps are done. Land waits for your approval.', opens: 'Read the land' },
  blocked: { row: landing('succeeded · BLOCKED'), says: 'Land stopped and needs your word to go on.', opens: 'Read the question' },
  check: {
    row: landing('failed ✗ check (exit 1)'),
    says: "The check refused Land's work. Try it again or call the run off.",
    opens: 'Read the check',
  },
  unfinished: {
    row: landing('failed ✗ check (unfinished)'),
    says: "Land's check did not finish, so nothing judged its work. Run the check again.",
    opens: 'Read the check',
  },
  unsigned: { row: landing('unsigned'), says: 'Land ended without signing its work. Try it again.', opens: 'Open the run' },
  denied: { row: landing('denied'), says: 'Land was refused a tool it called. Try it again.', opens: 'Open the run' },
  rounds: { row: landing('rounds exhausted'), says: 'Land is out of rounds. Give it another or decide its result.', opens: 'Open the run' },
  budget: {
    row: landing('over budget $4.25 of $3'),
    says: 'Land is past its budget. Say whether it may spend more.',
    opens: 'Open the run',
  },
  hold: {
    row: summary([['design', 'waiting']], { moving: false, holding }),
    says: 'You hold this run. It moves once you lift the hold.',
    opens: 'Open the run',
  },
  after: {
    row: summary([['design', 'waiting on r-0 (cancelled)']], { moving: false, waiting }),
    says: 'It waits on a run that will not finish without you.',
    opens: 'Open the run',
  },
};

test('each kind of wait says its one sentence, over a row of the light answer', () => {
  for (const kind of WAIT_KINDS) {
    const { row, says } = ROWS[kind];
    assert.equal(waitOf(row)?.kind, kind, `the row of ${kind} is read as that kind`);
    assert.equal(waitSentence(row), says, kind);
  }
});

test("each kind of wait says its button's words: what there is to read where there is one thing, else that it opens the run", () => {
  for (const kind of WAIT_KINDS) assert.equal(openWord(ROWS[kind].row), ROWS[kind].opens, kind);
  assert.equal(openWord(summary([['plan', 'pondering']], { waitingOnYou: ['plan'] })), 'Open the run', 'a wait the board has no kind for');
});

/** `row` with the task of its step `name` set to `taskId`. */
const tasked = (row: RunSummary, name: string, taskId: string | null): RunSummary => ({
  ...row,
  steps: row.steps.map((step) => (step.name === name ? { ...step, taskId } : step)),
});

test("REFUSED: a gate's button names the step whose work there is to read: the gated step's own, or the one done before it", () => {
  const steps = [
    ['review', 'verified ✓'],
    ['land', 'awaiting approval'],
  ] as const;
  const gate = summary(steps, { waitingOnYou: ['land'] });
  assert.equal(openWord(tasked(gate, 'land', 't-9')), 'Read the land', 'a gated step that has run is what there is to read');
  assert.equal(openWord(tasked(gate, 'land', null)), 'Read the review', 'a gate held before its step is filed reads the step before');
  const design = summary([['design', 'awaiting approval'], ...steps.slice(0, 1)], { waitingOnYou: ['design'] });
  assert.equal(openWord(design), 'Read the design');
  assert.equal(openWord(tasked(design, 'design', null)), 'Open the run', 'no work of its own and none done before it: nothing to name');
  const skipped = summary(
    [
      ['design', 'unverified'],
      ['implement', 'waiting'],
      ['land', 'awaiting approval'],
    ],
    { waitingOnYou: ['land'] },
  );
  assert.equal(openWord(tasked(skipped, 'land', null)), 'Read the design', 'the last step done before it, not the step beside it');
});

test('REFUSED: a kind with no sentence fails rather than printing nothing', () => {
  for (const kind of WAIT_KINDS) {
    const said = sentenceOf({ kind, step: 'land', done: 0 });
    assert.ok(said.length > 10 && said.endsWith('.'), `${kind} says a sentence: ${JSON.stringify(said)}`);
  }
  assert.deepEqual(Object.keys(ROWS).sort(), [...WAIT_KINDS].sort(), 'every kind has its row here');
});

test('every state the api lists a step in as waiting on a person has a kind, and no other state has one', () => {
  const waits: StepState[] = [
    'blocked',
    'awaiting-approval',
    'failed-check',
    'unsigned',
    'denied',
    'exhausted',
    'over-budget',
    'budget-exhausted',
  ];
  for (const state of Object.keys(stateMeaning) as StepState[]) {
    assert.equal(waitKindOf[state] !== null, waits.includes(state), state);
  }
  assert.equal(waitKindOf['budget-exhausted'], 'budget');
  assert.equal(waitOf(landing('budget exhausted'))?.kind, 'budget');
});

test('REFUSED: a check that did not finish is said as no refusal, and nobody is told to call the run off', () => {
  const row = landing('failed ✗ check (unfinished)');
  assert.deepEqual(waitOf(row), { kind: 'unfinished', step: 'land', done: 3 });
  assert.doesNotMatch(waitSentence(row), /refused|call the run off/);
  assert.equal(waitOf(landing('failed ✗ check (exit 1)'))?.kind, 'check', 'a numeric exit is the refusal');
  assert.equal(waitOf(landing('failed ✗ check (exit 137)'))?.kind, 'check');
});

test("REFUSED: a held run at its gate, as the api lists it with no step waiting, says the hold's sentence, not an approval's", () => {
  const atGate = summary([...DONE, ['land', 'awaiting approval']], { status: 'running', moving: false, holding, waitingOnYou: [] });
  assert.deepEqual(waitOf(atGate), { kind: 'hold', step: null, done: 3 });
  assert.equal(waitSentence(atGate), 'You hold this run. It moves once you lift the hold.');
  const liftsItself = { ...atGate, holding: { ...holding, onYou: false } };
  assert.equal(waitOf(liftsItself), null, 'a hold the tick lifts waits on nobody');
  assert.equal(waitOf({ ...liftsItself, waiting })?.kind, 'after', 'and such a run that waits on a run nobody will ship says that');
});

test("a run whose session asks while another step waits says the waiting step's sentence: the api lists no asking step", () => {
  const both = summary(
    [
      ['design', 'needs-human'],
      ['plan', 'awaiting approval'],
    ],
    { waitingOnYou: ['plan'] },
  );
  assert.equal(waitSentence(both), 'Plan waits for your approval.');
  assert.equal(waitOf(summary([['design', 'needs-human']])), null, 'a run that only asks is in flight, and no row of the waiting');
});

test('the first waiting step in the run’s order is the one said, and only a step the api says waits', () => {
  const two = summary(
    [
      ['design', 'verified ✓'],
      ['implement', 'unsigned'],
      ['review', 'awaiting approval'],
    ],
    { waitingOnYou: ['review', 'implement'] },
  );
  assert.equal(waitSentence(two), 'Implement ended without signing its work. Try it again.');
  assert.equal(waitSentence({ ...two, waitingOnYou: ['review'] }), 'One step is done. Review waits for your approval.');
  assert.equal(waitSentence(summary([['plan', 'awaiting approval']], { waitingOnYou: ['plan'] })), 'Plan waits for your approval.');
});

test('REFUSED: a wait on runs that may still ship is no wait on a person, and a step that waits comes before a run waited on', () => {
  const onRuns = summary([['design', 'waiting on r-0']], { moving: true, waiting: { ...waiting, onYou: false } });
  assert.equal(waitOf(onRuns), null);
  assert.equal(waitOf(landing('unsigned', { waiting }))?.kind, 'unsigned');
  assert.equal(waitOf(landing('unsigned', { waiting, holding }))?.kind, 'hold');
});

test('REFUSED: a waiting row whose step says a word the board does not know says it waits on you, never nothing', () => {
  const unknown = summary([['plan', 'pondering']], { waitingOnYou: ['plan'] });
  assert.equal(waitOf(unknown), null);
  assert.equal(waitSentence(unknown), WAITS);
  assert.equal(WAITS, 'It waits on you.');
});

test('REFUSED: no sentence says a word of git or of a command line, though the row carries a command', () => {
  const words = /\bgit\b|\bbranch|\bmerge|\bcommit|worktree|`|--|\bwf |\bnemia /i;
  assert.match(COMMAND, words, 'the pattern finds the command the rows carry');
  for (const kind of WAIT_KINDS) assert.doesNotMatch(waitSentence(ROWS[kind].row), words, kind);
  for (const kind of WAIT_KINDS) assert.doesNotMatch(waitTag(ROWS[kind].row), words, `the tag of ${kind}`);
  for (const kind of WAIT_KINDS) {
    const now = nowOf(ROWS[kind].row, 120_000);
    assert.doesNotMatch(`${now?.word} ${now?.note}`, words, `the note of ${kind}`);
  }
  assert.doesNotMatch(`${WAITS} ${WAITS_TAG}`, words);
  for (const outcome of ['succeeded', 'failed', 'cancelled', 'undecided'] as const) {
    assert.doesNotMatch(`${endedWords(outcome).word} ${endedWords(outcome).title}`, words, outcome);
  }
});

test('how a finished run ended: done, cancelled, failed, or that nobody has decided its result', () => {
  assert.deepEqual(endedWords('succeeded'), { word: 'done', title: 'Every step of it is done.', hue: 'sage' });
  assert.deepEqual(endedWords('cancelled'), { word: 'cancelled', title: 'Somebody called it off.', hue: 'grey' });
  assert.deepEqual(endedWords('failed'), { word: 'failed', title: 'It stopped on a step that failed.', hue: 'failure' });
  assert.deepEqual(endedWords('undecided'), { word: 'undecided', title: 'Nobody has decided its result.', hue: 'yours' });
});

test('a time is a fact to the minute, wall time', () => {
  const [S, M, H, D] = [1_000, 60_000, 3_600_000, 86_400_000];
  assert.equal(sinceCreated(0), 'under a minute since it was created');
  assert.equal(sinceCreated(59 * S), 'under a minute since it was created');
  assert.equal(sinceCreated(27 * M + 40 * S), '27m since it was created');
  assert.equal(sinceCreated(3 * H + 12 * M), '3h 12m since it was created');
  assert.equal(sinceCreated(2 * D + 4 * H + 59 * M), '2d 4h since it was created');
  assert.equal(sinceWords(3 * H), '3h');
  assert.equal(sinceWords(2 * D), '2d');
  assert.equal(sinceWords(-5), 'under a minute');
  assert.deepEqual([0, 59 * S, M, 3 * H + 12 * M].map(sinceShort), ['under 1m', 'under 1m', '1m', '3h 12m'], 'short, where room is');
});

test('the present wait is said since the instant it began, to the minute, and not at all where none is dated', () => {
  const asOf = new Date('2026-10-12T12:00:00.000Z');
  const since = (ms: number) => ({ waitingSince: new Date(asOf.getTime() - ms).toISOString() });
  assert.equal(presentWait(since(150_000), asOf), '2m');
  assert.equal(presentWait(since(30_000), asOf), 'under 1m');
  assert.equal(
    presentWait(since(-300_000), asOf),
    'under 1m',
    'an instant after the answer was read is under a minute, as `sinceShort` says any figure below one',
  );
  assert.equal(presentWait({ waitingSince: null }, asOf), null);
});

test('the rail says each step and its word, in the run’s order', () => {
  const mixed = summary([
    ['design', 'verified ✓'],
    ['implement', 'unverified'],
    ['land', 'awaiting approval'],
  ]).steps;
  assert.equal(railSaid(mixed, false, false), 'design verified, implement done, land waits for you', 'a check is told from a word');
  assert.equal(railSaid(mixed, false, true), 'design verified, implement done, land held');
  assert.equal(
    railSaid(
      summary([
        ['a', 'running (working)'],
        ['b', 'waiting'],
      ]).steps,
      false,
      false,
    ),
    'a at work, b to come',
  );
});

test("a waiting card's tag says what is asked in two or three words, the step where the person acts on one", () => {
  const tags: Record<WaitKind, string> = {
    approve: 'approve land',
    blocked: 'answer land',
    check: 'check refused',
    unfinished: 'check unfinished',
    unsigned: 'not signed',
    denied: 'tool refused',
    rounds: 'out of rounds',
    budget: 'past budget',
    hold: 'held by you',
    after: 'waits on a run',
  };
  for (const kind of WAIT_KINDS) assert.equal(waitTag(ROWS[kind].row), tags[kind], kind);
  assert.equal(waitTag(summary([['plan', 'pondering']], { waitingOnYou: ['plan'] })), WAITS_TAG);
  assert.equal(WAITS_TAG, 'waits on you');
});

test('what a run in flight does now: its first step not done, its place among its steps, and how long it has been at work', () => {
  const working = summary([...DONE.slice(0, 1), ['implement', 'running (working)'], ['review', 'waiting'], ['land', 'waiting']]);
  assert.deepEqual(nowOf(working, 2 * 60_000 + 59_000), { word: 'at work', note: 'implement (2 of 4), 2m' });
  assert.deepEqual(nowOf(working, null), { word: 'at work', note: 'implement (2 of 4)' }, 'no time where the api gives none');
  const checking = summary([...DONE.slice(0, 1), ['implement', 'checking']]);
  assert.deepEqual(nowOf(checking, 60_000), { word: 'being checked', note: 'implement (2 of 2)' }, 'a time only for a session at work');
  const queued = summary([['design', 'waiting']]);
  assert.deepEqual(nowOf(queued, null), { word: 'to come', note: 'design (1 of 1)' });
  assert.equal(nowOf(summary([...DONE]), null), null, 'every step done: nothing to say');
});

/** No character but printable ASCII: a narrow no-break space before AM or PM is refused. */
const PLAIN = /^[ -~]+$/;

test('when something happened: the time alone on the same day, the day before it on another, the day and its year in another year', () => {
  const now = new Date('2026-10-11T17:38:00.000Z');
  const said = [
    [whenWords(new Date('2026-10-11T17:11:59.000Z'), now, 'America/Montreal'), '1:11 PM'],
    [whenWords(new Date('2026-10-11T03:59:00.000Z'), now, 'America/Montreal'), '10 Oct 11:59 PM'],
    [whenWords(new Date('2026-08-03T13:05:00.000Z'), now, 'UTC'), '3 Aug 1:05 PM'],
    [whenWords(new Date('2025-12-31T23:05:00.000Z'), now, 'UTC'), '31 Dec 2025'],
    [whenWords(new Date('2026-10-11T12:00:00.000Z'), now, 'UTC'), '12:00 PM'],
    [whenWords(new Date('2026-10-11T00:05:00.000Z'), now, 'UTC'), '12:05 AM'],
  ];
  for (const [words, want] of said) {
    assert.equal(words, want);
    assert.match(words, PLAIN, 'plain spaces only');
  }
});

test("REFUSED: a finished row's time carries its date on the day itself, each of its day and its hour two characters wide", () => {
  const now = new Date('2026-10-11T17:38:00.000Z');
  const today = whenColumn(new Date('2026-10-11T17:11:59.000Z'), now, 'America/Montreal');
  assert.equal(today, '11 Oct  1:11 PM', 'today says its date too');
  assert.equal(
    whenColumn(new Date('2026-08-03T13:05:00.000Z'), now, 'UTC'),
    ' 3 Aug  1:05 PM',
    'a day and an hour of one digit are padded',
  );
  assert.equal(whenColumn(new Date('2026-10-11T03:59:00.000Z'), now, 'America/Montreal'), '10 Oct 11:59 PM');
  assert.equal(whenColumn(new Date('2026-01-01T00:05:00.000Z'), now, 'UTC'), ' 1 Jan 12:05 AM');
  assert.equal(whenColumn(new Date('2025-12-31T23:05:00.000Z'), now, 'UTC'), '31 Dec 2025', 'another year: the day and its year');
  assert.equal(whenColumn(new Date('2025-01-03T23:05:00.000Z'), now, 'UTC'), ' 3 Jan 2025');
  for (let hour = 0; hour < 24 * 365; hour += 7) {
    const words = whenColumn(new Date(Date.UTC(2026, 0, 1, hour, 7)), now, 'UTC');
    assert.equal(words.length, 15, words);
    assert.match(words, PLAIN, words);
  }
});
