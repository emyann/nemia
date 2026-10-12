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
  railSaid,
  sentenceOf,
  sinceCreated,
  sinceWords,
  WAIT_KINDS,
  waitKindOf,
  waitOf,
  WAITS,
  waitSentence,
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

/** One row of the light answer per kind of wait, and the sentence it says. */
const ROWS: Record<WaitKind, { row: RunSummary; says: string }> = {
  approve: { row: landing('awaiting approval'), says: 'Three steps are done. Land waits for your approval.' },
  blocked: { row: landing('succeeded · BLOCKED'), says: 'Land stopped and needs your word to go on.' },
  check: { row: landing('failed ✗ check (exit 1)'), says: "The check refused Land's work. Try it again or call the run off." },
  unsigned: { row: landing('unsigned'), says: 'Land ended without signing its work. Try it again.' },
  denied: { row: landing('denied'), says: 'Land was refused a tool it called. Try it again.' },
  rounds: { row: landing('rounds exhausted'), says: 'Land is out of rounds. Give it another or decide its result.' },
  budget: { row: landing('over budget $4.25 of $3'), says: 'Land is past its budget. Say whether it may spend more.' },
  hold: {
    row: summary([['design', 'waiting']], { moving: false, holding }),
    says: 'You hold this run. It moves once you lift the hold.',
  },
  after: {
    row: summary([['design', 'waiting on r-0 (cancelled)']], { moving: false, waiting }),
    says: 'It waits on a run that will not finish without you.',
  },
};

test('each kind of wait says its one sentence, over a row of the light answer', () => {
  for (const kind of WAIT_KINDS) {
    const { row, says } = ROWS[kind];
    assert.equal(waitOf(row)?.kind, kind, `the row of ${kind} is read as that kind`);
    assert.equal(waitSentence(row), says, kind);
  }
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
  assert.doesNotMatch(WAITS, words);
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
});

test('the rail says each step and its word, in the run’s order', () => {
  assert.equal(railSaid(landing('awaiting approval').steps, false, false), 'design done, implement done, review done, land waits for you');
  assert.equal(railSaid(landing('awaiting approval').steps, false, true), 'design done, implement done, review done, land held');
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
