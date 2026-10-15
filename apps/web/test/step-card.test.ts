/**
 * A step's card (src/lib/stepCard.ts): each of its five states read from a run's row and its own answer, the hue of its frame, its
 * tag, its tries and rounds, its time, its five facts, its spend, its note and its action; and the query that opens it as a sheet
 * (src/lib/useSheetPreview.ts).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RunDetail } from '../src/lib/api.ts';
import { stepCardOf, type StepCardFacts } from '../src/lib/stepCard.ts';
import { SHEET_QUERY } from '../src/lib/useSheetPreview.ts';
import { detail, step, summary } from './run-fixtures.ts';

type Step = RunDetail['steps'][number];

const NOW = new Date('2026-09-30T05:20:00.000Z');

/** A step of the answer, settled as `status` says, with nothing beside it but what `extra` puts. */
const quiet = (name: string, status: string, extra: Partial<Step> = {}): Step =>
  step({
    name,
    status,
    denied: null,
    check: null,
    gate: null,
    accepted: null,
    lastLine: null,
    needs: null,
    spent: { usd: 3.71, measured: 1, unmeasured: 0, said: '$3.71' },
    budget: { usd: 10, said: '$10', of: '$3.71 of $10', over: false },
    ...extra,
  });

/** One try of a step, of `round`. */
const aTry = (n: number, round = 1): Step['tries'][number] => ({
  try: n,
  round,
  then: null,
  current: true,
  taskId: `t-${n}`,
  note: null,
  status: 'running',
  attempts: { count: 1, latest: null },
  check: null,
  closeout: null,
  unreadable: null,
  answer: null,
});

/** The card of `name` on a run of design, implement, review whose statuses are `statuses`, its answer's steps `steps`. */
function cardOf(name: string, statuses: Record<string, string>, steps: Step[], agent: string | null = 'Ada'): StepCardFacts {
  const row = summary(Object.entries(statuses));
  row.steps = row.steps.map((s) => ({ ...s, agent: s.name === name ? agent : null }));
  return stepCardOf({
    run: row,
    step: name,
    detail: detail({ steps }),
    agents: [{ name: 'Ada', role: 'Software engineer' }],
    now: NOW,
  });
}

const STATUSES = { design: 'verified ✓', implement: 'running (working)', review: 'waiting' };

test('a step at work: alive, its try and round of the loop, how long since its session started, and no spend measured yet', () => {
  const card = cardOf('implement', STATUSES, [
    quiet('implement', 'running (working)', {
      tries: [aTry(1)],
      spent: null,
      denied: { words: '1 call denied: Bash(cd)', calls: ['Bash(cd)'] },
    }),
    quiet('review', 'waiting', { spec: { ...step().spec!, loop: 'implement', rounds: 3 }, tries: [] }),
  ]);
  assert.equal(card.kind, 'work');
  assert.equal(card.hue, 'alive');
  assert.deepEqual(card.tag, { word: 'at work', color: 'secondary', variant: 'tonal' });
  assert.deepEqual(card.agent, { name: 'Ada', initial: 'A', role: 'Software engineer' });
  assert.equal(card.place, 'try 1 · round 1 of 3');
  assert.equal(card.time?.label, 'At work');
  assert.equal(card.time?.value, '18m');
  assert.match(card.time?.note ?? '', /^since /);
  assert.deepEqual(card.spend, { kind: 'words', label: 'Spent', said: 'not measured yet', note: 'of $10' });
  assert.deepEqual(card.note, { text: '1 call denied: Bash(cd)', icon: 'shield' });
  assert.deepEqual(card.action, { words: 'Open the step', runId: 'r-1', step: 'implement' });
});

test('a step at work is drawn with no meter, even where a spend was measured before its try', () => {
  const card = cardOf('implement', STATUSES, [quiet('implement', 'running (working)', { tries: [aTry(2)] })]);
  assert.equal(card.spend?.kind, 'words');
  assert.equal(card.spend?.kind === 'words' && card.spend.said, 'not measured yet');
});

test('a step at its gate: yours, waiting since its session ended, its spend on a meter, and Read and approve', () => {
  const card = cardOf('design', { ...STATUSES, design: 'awaiting approval' }, [
    quiet('design', 'awaiting approval', {
      tries: [aTry(1)],
      spent: { usd: 2.39, measured: 1, unmeasured: 0, said: '$2.39' },
      gate: { awaiting: true, approval: null },
      needs: 'Nine questions for you, each with a recommendation.',
    }),
  ]);
  assert.equal(card.kind, 'gate');
  assert.equal(card.hue, 'yours');
  assert.deepEqual(card.tag, { word: 'waits for you', color: 'primary', variant: 'filled' });
  assert.equal(card.place, 'try 1');
  assert.equal(card.time?.label, 'Waiting');
  assert.equal(card.time?.value, '17m');
  assert.deepEqual(card.spend, { kind: 'meter', label: 'Spent', value: 2.39, max: 10, said: '$2.39 of $10' });
  assert.deepEqual(card.note, { text: 'Nine questions for you, each with a recommendation.', icon: 'info' });
  assert.equal(card.action.words, 'Read and approve');
});

test('a step done: no hue, its tries counted, when it ended and how long it ran, its spend on a meter', () => {
  const card = cardOf('design', STATUSES, [quiet('design', 'verified ✓', { tries: [aTry(1), aTry(2)] })]);
  assert.equal(card.kind, 'done');
  assert.equal(card.hue, 'none');
  assert.deepEqual(card.tag, { word: 'verified', color: 'neutral', variant: 'tonal' });
  assert.equal(card.place, '2 tries');
  assert.equal(card.time?.label, 'Done');
  assert.equal(card.time?.note, 'its last try ran 1m');
  assert.deepEqual(card.spend, { kind: 'meter', label: 'Spent', value: 3.71, max: 10, said: '$3.71 of $10' });
  assert.equal(card.note, null);
});

test('a step done with no budget says its spend alone, with no meter', () => {
  const card = cardOf('design', STATUSES, [quiet('design', 'verified ✓', { tries: [aTry(1)], budget: null })]);
  assert.deepEqual(card.spend, { kind: 'words', label: 'Spent', said: '$3.71', note: '' });
});

test('a step to come: no hue, the rounds it may run, after the steps it waits for, and its budget as words', () => {
  const card = cardOf('review', STATUSES, [
    quiet('review', 'waiting', {
      tries: [],
      timeline: [],
      attempts: { count: 0, latest: null },
      spent: null,
      budget: { usd: 16, said: '$16', of: null, over: false },
      spec: { ...step().spec!, after: ['implement'], loop: 'implement', rounds: 3 },
    }),
  ]);
  assert.equal(card.kind, 'come');
  assert.equal(card.hue, 'none');
  assert.deepEqual(card.tag, { word: 'to come', color: 'secondary', variant: 'outlined' });
  assert.equal(card.place, 'up to 3 rounds');
  assert.deepEqual(card.time, { label: 'Starts', value: 'after implement', note: '', ink: 'muted' });
  assert.deepEqual(card.spend, { kind: 'words', label: 'Budget', said: '$16', note: '' });
});

test('a step that failed: no hue, failed at its end, and its check refusal as the note', () => {
  const card = cardOf('implement', { ...STATUSES, implement: 'failed ✗ check' }, [
    quiet('implement', 'failed ✗ check', {
      tries: [aTry(1)],
      spent: { usd: 0.52, measured: 1, unmeasured: 0, said: '$0.52' },
      check: step().check,
    }),
  ]);
  assert.equal(card.kind, 'failed');
  assert.equal(card.hue, 'none');
  assert.deepEqual(card.tag, { word: 'failed its check', color: 'error', variant: 'tonal' });
  assert.equal(card.time?.label, 'Failed');
  assert.equal(card.time?.ink, 'failure');
  assert.deepEqual(card.note, { text: 'Its check refused it (exit exit 1).', icon: 'fail' });
});

test("the agent's last line comes first in the note, before the calls denied", () => {
  const card = cardOf('implement', STATUSES, [
    quiet('implement', 'running (working)', {
      tries: [aTry(1)],
      lastLine: 'Writing the e2e page.',
      denied: { words: '1 call denied', calls: ['Bash(cd)'] },
    }),
  ]);
  assert.deepEqual(card.note, { text: 'Writing the e2e page.', icon: 'info' });
});

test('the five session facts, whole, from what the try was filed with', () => {
  const card = cardOf('implement', STATUSES, [
    quiet('implement', 'running (working)', {
      tries: [aTry(1)],
      spec: { ...step().spec!, harness: 'a2a:remote', context: 400_000, permissionMode: 'auto' },
      filed: { ...step().filed!, effort: 'medium', contextTokens: 400_000, permissionMode: 'auto' },
    }),
  ]);
  assert.deepEqual(card.facts, [
    { key: 'Harness', value: 'a2a:remote' },
    { key: 'Model', value: 'opus' },
    { key: 'Effort', value: 'medium' },
    { key: 'Context', value: '400k tokens' },
    { key: 'Permission', value: 'auto' },
  ]);
});

test('no card says its place among the run\'s steps: "step x of y" is the rail\'s', () => {
  const cards = [
    cardOf('implement', STATUSES, [quiet('implement', 'running (working)', { tries: [aTry(1)] })]),
    cardOf('design', STATUSES, [quiet('design', 'verified ✓', { tries: [aTry(1), aTry(2)] })]),
  ];
  for (const card of cards) assert.doesNotMatch(JSON.stringify(card), /step \d+ of \d+|\(\d+ of \d+\)/);
});

test('while the run is read, the card says what the row knows and nothing it has not read', () => {
  const row = summary(Object.entries(STATUSES));
  const card = stepCardOf({ run: row, step: 'implement', now: NOW });
  assert.equal(card.hue, 'alive');
  assert.equal(card.tag.word, 'at work');
  assert.equal(card.agent, null);
  assert.equal(card.facts, null);
  assert.equal(card.spend, null);
  assert.equal(card.time, null);
});

test('a preview opens as a sheet where no pointer hovers or the window is compact, under 600 pixels', () => {
  assert.equal(SHEET_QUERY, '(hover: none), (max-width: 599px)');
});
