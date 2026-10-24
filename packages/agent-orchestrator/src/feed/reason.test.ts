/**
 * The feed's reason table (`reason.ts`): every word the package writes maps to a reason, the lines that wait on a person are those of the
 * reasons of phase `waiting` and of a step that broke, never a note's, which takes every line a retired wake word woke a subscriber on
 * but a run's that only its note said waits, and every entry of the table is one some word reaches.
 *
 * The fixtures are built from the code's own constants and word-builders wherever there is one — `SLOT_WAIT`, `slotWord`, `PAUSE_WAIT`,
 * `checkoutWord`, `waitWord`, `holdWord`, `waitingWords`, `REMOVED`, `DENIED` — and the statuses are keyed by their unions
 * (`Record<Assessment['status'], …>`, `Record<StepStatus, …>`), so a status added anywhere fails this file's typecheck rather than
 * falling silently to `Unknown`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  codesOf,
  DENIED,
  isOnce,
  kindsOf,
  messageOf,
  reasonOf,
  REASON_CODES,
  sourceOf,
  typeOf,
  waitsOf,
  REMOVED,
  type InvolvedKind,
  type Reason,
  LINE_SOURCES,
} from './reason.ts';
import { upgraded, FEED_VERSION, type FeedLine } from './feed.ts';
import { formerHints, formerOf, FORMER_REASONS, type Codes } from './reason.ts';
import { codedStep, PHASE_OF, runCodes, STEP_REASONS, type AnswerVia, type QualifiedStep, type WaitOn } from '../phase/phase.ts';
import { SLOT_WAIT, slotWord } from '../cap/cap.ts';
import { PAUSE_WAIT, waitingWords } from '../list/list.ts';
import { checkoutWord } from '../ending/ending.ts';
import { holdWord, waitWord } from '../wait/wait.ts';
import { FORMER_DEFAULT_WAKE, FORMER_NEMIA_WAKE, selectorsOfWake } from '../subscription/index.ts';
import { parseSelectors, selects } from '../watch/selector.ts';
import type { Assessment } from '../tick/assess.ts';
import type { StepStatus } from '../record/record.ts';

/** One fixture: the kind the line is about, the word and note it carries, and the codes the table must name. */
type Case = { kind: InvolvedKind; word: string; note?: string; reason: Reason; on?: WaitOn; via?: AnswerVia };

/** Every word `assess` gives a run, with `(pruned)` beside it as `nemia ls` says it. Exhaustive over the status union. */
const RUN_STATUS = {
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
  cancelled: 'Cancelled',
  'awaiting approval': 'AwaitingApproval',
  blocked: 'AwaitingAnswer',
} satisfies Record<Assessment['status'], Reason>;

/** Every status a step stands at, in the word `nemia ls` prints for it. Exhaustive over `StepStatus`. */
const STEP_STATUS = {
  waiting: { word: 'waiting', reason: 'Pending' },
  running: { word: 'running', reason: 'Running' },
  blocked: { word: 'blocked', reason: 'AwaitingAnswer', via: 'closeout' },
  unsigned: { word: 'unsigned', reason: 'Unsigned' },
  checking: { word: 'checking', reason: 'Checking' },
  verified: { word: 'verified ✓', reason: 'CheckPassed' },
  unverified: { word: 'unverified', reason: 'Unknown' },
  'awaiting approval': { word: 'awaiting approval', reason: 'AwaitingApproval' },
  exhausted: { word: 'rounds exhausted', reason: 'AwaitingRound' },
  'over budget': { word: 'over budget $21.00 of $20', reason: 'OverBudget' },
  'budget exhausted': { word: 'budget exhausted ≥$21.00 of $20', reason: 'BudgetExhausted' },
  denied: { word: 'denied', reason: 'Denied' },
  'failed (check)': { word: 'failed ✗ check (exit 1)', reason: 'CheckFailed' },
  failed: { word: 'failed', reason: 'Failed' },
  stopped: { word: 'stopped', reason: 'Stopped' },
} satisfies Record<StepStatus, { word: string; reason: Reason; via?: AnswerVia }>;

/** What the engine's word for a task comes to in the feed (`feedPhase`), and the two words `listing` writes in its place. */
const PHASE_WORDS: readonly Case[] = [
  { kind: 'Step', word: 'pending', reason: 'Pending' },
  { kind: 'Step', word: 'running', reason: 'Running' },
  { kind: 'Step', word: 'succeeded', reason: 'Succeeded' },
  { kind: 'Step', word: 'failed', reason: 'Failed' },
  { kind: 'Step', word: 'stopped', reason: 'Stopped' },
  { kind: 'Step', word: 'unknown', reason: 'Unknown' },
  { kind: 'Step', word: 'needs-human', reason: 'AwaitingAnswer', via: 'session' },
  { kind: 'Step', word: `needs-human: ${waitingWords('permission prompt')}`, reason: 'AwaitingAnswer', via: 'session' },
  { kind: 'Step', word: 'input-required', reason: 'Unknown' },
  { kind: 'Step', word: 'unverified', reason: 'Unknown' },
];

/** What a step's closeout adds after its word (`listing`), on the words the real feed carries them on. */
const SAID_WORDS: readonly Case[] = [
  { kind: 'Step', word: 'succeeded · done', reason: 'Succeeded' },
  { kind: 'Step', word: 'unverified · done', reason: 'Succeeded' },
  { kind: 'Step', word: 'input-required · done', reason: 'Succeeded' },
  { kind: 'Step', word: 'unsigned · done', reason: 'Unsigned' },
  { kind: 'Step', word: 'input-required · BLOCKED', reason: 'AwaitingAnswer', via: 'closeout' },
  { kind: 'Step', word: 'succeeded · BLOCKED', reason: 'AwaitingAnswer', via: 'closeout' },
  { kind: 'Step', word: 'unverified · BLOCKED', note: 'needs: whose call is it', reason: 'AwaitingAnswer', via: 'closeout' },
  { kind: 'Step', word: 'unverified · closeout unreadable', reason: 'UnreadableCloseout' },
];

/** Every wait a step's word says, each from the code that words it. */
const WAIT_WORDS: readonly Case[] = [
  { kind: 'Step', word: SLOT_WAIT, reason: 'Waiting', on: 'limit' },
  { kind: 'Step', word: slotWord({ inFlight: 1, cap: 2 }), reason: 'Waiting', on: 'limit' },
  { kind: 'Step', word: PAUSE_WAIT, note: 'its check is filed on nemia resume', reason: 'Waiting', on: 'pause' },
  { kind: 'Step', word: checkoutWord({ run: 'r-2', step: 'land' }), reason: 'Waiting', on: 'checkout' },
  { kind: 'Step', word: waitWord([{ run: 'r-2' }]), reason: 'Waiting', on: 'run' },
  { kind: 'Step', word: waitWord([{ run: 'r-2' }, { run: 'r-3' }]), reason: 'Waiting', on: 'run' },
];

/** A run's own lines: its statuses, pruned and not, a hold, who it waits on, and the word of a run the store no longer has. */
const RUN_LINES: readonly Case[] = [
  ...Object.entries(RUN_STATUS).flatMap(([word, reason]): Case[] => [
    { kind: 'Run', word, reason },
    { kind: 'Run', word: `${word} (pruned)`, reason },
  ]),
  { kind: 'Run', word: REMOVED, reason: 'Removed' },
  { kind: 'Run', word: 'running', note: holdWord([{ run: 'r-2' }]), reason: 'Waiting', on: 'run' },
  { kind: 'Run', word: 'running', note: holdWord([], { why: 'the base moved', by: 'operator' }), reason: 'Waiting', on: 'run' },
  { kind: 'Run', word: 'running', note: 'waiting on you: approve plan', reason: 'Running' },
  { kind: 'Run', word: 'awaiting approval', note: 'waiting on you: approve plan', reason: 'AwaitingApproval' },
];

/**
 * The six words the owner named at this slice's design gate, spelled here by hand and not read off `LINE_WORDS`: this file is what holds
 * the code to the words, so a word reworded in the table and not here is a case that fails, which is the point. Each of the two runtime
 * faults is a word of the workflow layer's own — `nothing started`, not `unstartable`; `session lost`, not `lost`.
 */
const ACT_WORDS: readonly Case[] = [
  { kind: 'Step', word: 'approved', note: 'try 2 · at 2026-10-16T04:00:00.000Z', reason: 'Approved' },
  { kind: 'Run', word: 'cancel asked', note: 'at 2026-10-16T04:00:00.000Z', reason: 'CancelAsked' },
  { kind: 'Run', word: 'hold put', note: 'since 2026-10-16T04:00:00.000Z', reason: 'HoldPut' },
  { kind: 'Run', word: 'hold lifted', note: 'since 2026-10-16T04:00:00.000Z', reason: 'HoldLifted' },
  { kind: 'Step', word: 'nothing started', note: 'try 1', reason: 'SpawnFailed' },
  { kind: 'Step', word: 'session lost', note: 'try 3', reason: 'SessionLost' },
];

/**
 * The one-shot a tool denial writes, the one a step's closeout read writes — `closed out`, spelled here by hand as the owner named it —
 * and the one line a daemon writes.
 */
const ONE_SHOTS: readonly Case[] = [
  { kind: 'Step', word: 'closed out', note: 'try 2', reason: 'ClosedOut' },
  { kind: 'Step', word: `${DENIED}Bash(grep)`, note: 'try 2', reason: 'ToolDenied' },
  { kind: 'Step', word: `${DENIED}Skill(look)`, note: 'try 1', reason: 'ToolDenied' },
  { kind: 'Daemon', word: 'daemon started', note: 'first daemon on this store', reason: 'DaemonStarted' },
];

/**
 * The two words a person's pause and resume of the whole store write, spelled here by hand as the owner named them: `store paused` and
 * `store resumed`, each with the moment the pause was put as its note.
 */
const STORE_LINES: readonly Case[] = [
  { kind: 'Store', word: 'store paused', note: 'since 2026-10-16T04:00:00.000Z', reason: 'StorePaused' },
  { kind: 'Store', word: 'store resumed', note: 'since 2026-10-16T04:00:00.000Z', reason: 'StoreResumed' },
];

/** Every word the package can write, each with the reason the table must name for it. */
const CASES: readonly Case[] = [
  ...RUN_LINES,
  ...Object.values(STEP_STATUS).map((codes): Case => ({ kind: 'Step', ...codes })),
  ...PHASE_WORDS,
  ...SAID_WORDS,
  ...WAIT_WORDS,
  ...ONE_SHOTS,
  ...ACT_WORDS,
  ...STORE_LINES,
];

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

/** One fixture as the tick writes it to the feed: a signed line of its run, of its step, or of the store. */
const lineOf = (c: Case): FeedLine =>
  c.kind === 'Store'
    ? upgraded({
        at: '2026-10-16T04:00:00.000Z',
        store: 'store',
        word: c.word,
        ...(c.note !== undefined ? { note: c.note } : {}),
      })
    : upgraded({
        at: '2026-10-16T04:00:00.000Z',
        run: 'r-1',
        ...(c.kind === 'Step' ? { step: 'plan' } : {}),
        word: c.word,
        ...(c.note !== undefined ? { note: c.note } : {}),
      });

/** Whether the selectors a stored wake list converts to take `line`. */
const takenByConverted = (wake: readonly string[], line: FeedLine): boolean =>
  selects(parseSelectors(selectorsOfWake(wake).selectors), line);

test('reasonOf names a reason for every word the package writes, only of a kind the table gives it, and every entry is one some word reaches', async (t) => {
  await t.test('every word the package writes maps to a reason, and what qualifies it', () => {
    for (const c of CASES) {
      const said = { word: c.word, ...(c.note !== undefined ? { note: c.note } : {}) };
      const codes = { reason: c.reason, ...(c.on ? { on: c.on } : {}), ...(c.via ? { via: c.via } : {}) };
      assert.deepEqual(codesOf(said, c.kind), codes, `${c.kind} ${JSON.stringify(c.word)} ${JSON.stringify(c.note ?? '')}`);
      assert.equal(reasonOf(said, c.kind), c.reason);
    }
  });
  await t.test('a reason is only named of a kind the table gives it', () => {
    for (const c of CASES) assert.ok(kindsOf(c.reason).includes(c.kind), `${c.reason} is not a reason of a ${c.kind}`);
  });
  await t.test("every entry of the table is one some word reaches, or a run's first waiting step's reason (`runCodes`)", () => {
    const reached = new Set(
      CASES.map((c) => `${reasonOf({ word: c.word, ...(c.note !== undefined ? { note: c.note } : {}) }, c.kind)}/${c.kind}`),
    );
    for (const reason of STEP_REASONS.filter((r) => PHASE_OF[r] === 'waiting'))
      reached.add(
        `${runCodes('blocked', false, [codedStep(reason === 'AwaitingAnswer' ? { reason, via: 'session' } : ({ reason } as QualifiedStep))]).reason}/Run`,
      );
    const entries = REASON_CODES.flatMap((reason) => kindsOf(reason).map((kind) => `${reason}/${kind}`));
    assert.equal(entries.length, 42, 'the table the owner named has 42 entries');
    assert.equal(REASON_CODES.length, 31, 'of 31 distinct codes');
    assert.deepEqual(
      entries.filter((entry) => !reached.has(entry)),
      [],
      'a table entry no fixture reaches is a code nothing can write, or a word the fixture is missing',
    );
  });
});

/** The reasons that wait on a person, by the card that split a wait on a person from a wait on a thing: phase `waiting`, and a step
 * broke. */
const PERSON = [
  'AwaitingApproval',
  'AwaitingAnswer',
  'AwaitingRound',
  'OverBudget',
  'BudgetExhausted',
  'Unsigned',
  'Denied',
  'Failed',
  'CheckFailed',
];

/** Whether `line` was woken by the retired wake words through its note alone: what no selector reads, and no code says. */
const wokenByNoteAlone = (line: FeedLine): boolean =>
  wokenByFormerWake(line, FORMER_DEFAULT_WAKE) && !wokenByFormerWake({ ...line, note: undefined }, FORMER_DEFAULT_WAKE);

test('waitsOf: the lines that wait on a person are those of the Awaiting reasons, the stops beside them and a step broke, never a note', async (t) => {
  await t.test('waits is true of exactly the reasons of phase waiting, and Failed and CheckFailed', () => {
    assert.deepEqual(REASON_CODES.filter(waitsOf).sort(), [...PERSON].sort());
  });
  await t.test('a note that says a person is waited on makes no line wait: only its reason does', () => {
    const line = upgraded({ at: '2026-10-16T04:00:00.000Z', run: 'r-1', step: 'plan', word: 'running', note: 'waiting on you: plan' });
    assert.equal(line.reason, 'Running');
    assert.equal(line.waits, undefined);
  });
  await t.test('every former code is gone from the table, and each converts through FORMER_REASONS', () => {
    const former = [
      'NeedsHuman',
      'Blocked',
      'RoundsExhausted',
      'WaitingForSlot',
      'WaitingForCheckout',
      'WaitingForPause',
      'Held',
      'CheckDenied',
    ];
    for (const code of former) {
      assert.ok(!(REASON_CODES as readonly string[]).includes(code), `${code} is no current code`);
      assert.ok(Object.hasOwn(FORMER_REASONS, code), `${code} is read through FORMER_REASONS`);
    }
  });
  await t.test("Nemia's former wake list converts to selectors that take the waiting lines and a tool denial, and no other line", () => {
    for (const c of CASES) {
      const hers = waitsOf(c.reason) || c.reason === 'ToolDenied';
      assert.equal(takenByConverted(FORMER_NEMIA_WAKE, lineOf(c)), hers, `${c.reason}: ${JSON.stringify(c.word)}`);
    }
    assert.ok(
      CASES.some((c) => c.reason === 'ToolDenied'),
      'a denial is among the fixtures, or the line above proves nothing',
    );
  });
  await t.test(
    'every one of the 256 stored wake lists converts to selectors that take every line it woke on but by a note alone, and more',
    () => {
      const lines = CASES.map(lineOf);
      const subsets = Array.from({ length: 1 << FORMER_NEMIA_WAKE.length }, (_, mask) =>
        FORMER_NEMIA_WAKE.filter((_word, i) => (mask & (1 << i)) !== 0),
      );
      assert.equal(subsets.length, 256);
      assert.deepEqual(
        lines.filter((line) => wokenByNoteAlone(line) && !waitsOf(line.reason!)).map((line) => [line.reason, line.note]),
        [['Running', 'waiting on you: approve plan']],
        'the one line a note alone woke on and no reason waits for: a run still at work beside a step that waits, whose own line wakes',
      );
      let wider = 0;
      for (const wake of subsets)
        for (const [i, line] of lines.entries()) {
          const woken = wokenByFormerWake(line, wake) && !(wokenByNoteAlone(line) && !waitsOf(line.reason!));
          const taken = takenByConverted(wake, line);
          if (woken) assert.ok(taken, `${JSON.stringify(wake)} woke on ${JSON.stringify(CASES[i].word)} and its selectors do not take it`);
          if (taken && !woken) wider++;
        }
      assert.ok(wider > 0, 'waits=person takes the stops the wake words never named: a strict superset, never a narrower one');
    },
  );
});

test('typeOf, messageOf and sourceOf: how serious a line is, what a person reads of it, and whose deed it is', async (t) => {
  await t.test('a type is the table its reason comes from, and a message is the word and its note', () => {
    assert.equal(typeOf('Failed'), 'Warning');
    assert.equal(typeOf('Running'), 'Normal');
    assert.equal(typeOf('SpawnFailed'), 'Warning', 'a runtime fault is something gone wrong');
    assert.equal(typeOf('SessionLost'), 'Warning');
    assert.equal(
      messageOf({ word: 'awaiting approval', note: 'approve it: nemia approve r-1 plan' }),
      'awaiting approval · approve it: nemia approve r-1 plan',
    );
    assert.equal(messageOf({ word: 'running' }), 'running', 'a word with no note is the message whole');
    assert.equal(messageOf({ word: 'running', note: '' }), 'running', 'and so is an empty note');
    assert.equal(
      messageOf({ word: `${DENIED}Bash(grep)`, note: 'try 2' }),
      'denied: Bash(grep) · try 2',
      "the owner's wording for a denial",
    );
  });
  await t.test("a line's source is the table's, and every source is one some word reaches", () => {
    const reached = new Set(CASES.map((c) => sourceOf(reasonOf({ word: c.word, note: c.note }, c.kind))));
    assert.deepEqual(
      LINE_SOURCES.filter((source) => !reached.has(source)),
      [],
      'a source no fixture reaches is one nothing writes',
    );
  });
  await t.test("a person's act is the person's deed and a runtime fault the runtime's — never the tick's", () => {
    assert.deepEqual(
      ACT_WORDS.map((c) => sourceOf(c.reason)),
      ['person', 'person', 'person', 'person', 'runtime', 'runtime'],
      "the owner's four verbs are a person's deed and the two faults the runtime's",
    );
    assert.equal(sourceOf('ToolDenied'), 'runtime', 'a call the harness denied is the runtime telling us');
    assert.equal(sourceOf('DaemonStarted'), 'daemon');
    assert.deepEqual(
      STORE_LINES.map((c) => [sourceOf(c.reason), isOnce(c.reason), typeOf(c.reason), waitsOf(c.reason)]),
      [
        ['person', true, 'Normal', false],
        ['person', true, 'Normal', false],
      ],
      "the store's pause and resume are a person's verbs, said once each, and wait on nobody",
    );
    assert.equal(sourceOf('Running'), 'tick', "a word the tick judged is the tick's, which is what a reason naming no source is");
  });
});

/** A signed line of `kind`, as a `nemia` of either side of the rename wrote it, under `codes`. */
const signed = (kind: InvolvedKind, codes: { reason: string; on?: string; via?: string }, waits = false): FeedLine =>
  ({
    at: '2026-10-24T04:00:00.000Z',
    run: 'r-1',
    ...(kind === 'Step' ? { step: 'plan' } : {}),
    word: 'some word',
    apiVersion: FEED_VERSION,
    involved: kind === 'Step' ? { kind, name: 'r-1/plan' } : { kind, name: 'r-1' },
    labels: { run: 'r-1' },
    ...codes,
    type: 'Normal',
    ...(waits ? { waits: 'person' } : {}),
    source: 'tick',
    message: 'some word',
  }) as FeedLine;

/** Every former code of each kind it was written of, and what it reads as: the card's table, written out. */
const CONVERTED: ReadonlyArray<[string, InvolvedKind, Codes]> = [
  ['NeedsHuman', 'Step', { reason: 'AwaitingAnswer', via: 'session' }],
  ['Blocked', 'Step', { reason: 'AwaitingAnswer', via: 'closeout' }],
  ['Blocked', 'Run', { reason: 'AwaitingAnswer' }],
  ['RoundsExhausted', 'Step', { reason: 'AwaitingRound' }],
  ['WaitingForSlot', 'Step', { reason: 'Waiting', on: 'limit' }],
  ['WaitingForCheckout', 'Step', { reason: 'Waiting', on: 'checkout' }],
  ['WaitingForPause', 'Step', { reason: 'Waiting', on: 'pause' }],
  ['CheckDenied', 'Step', { reason: 'Denied' }],
  ['Held', 'Run', { reason: 'Waiting', on: 'run' }],
];

/** The codes of a line as the fold reads it: its reason and what qualifies it. */
const codesOfLine = (line: FeedLine): Codes => ({
  reason: line.reason!,
  ...(line.on ? { on: line.on } : {}),
  ...(line.via ? { via: line.via } : {}),
});

test('a signed line on disk under a former reason reads back under its current one, its waits as written', async (t) => {
  for (const [former, kind, now] of CONVERTED)
    await t.test(`${kind} ${former}`, () => {
      const read = upgraded(signed(kind, { reason: former }, true));
      assert.deepEqual(codesOfLine(read), now);
      assert.equal(read.waits, 'person', 'its waits is its writer’s, kept');
      assert.equal(formerOf(now, kind), former, 'and the code it was written under is what a former selector reads it by');
    });
  await t.test("a step's Waiting written before on was reads as Pending", () => {
    assert.deepEqual(codesOfLine(upgraded(signed('Step', { reason: 'Waiting' }))), { reason: 'Pending' });
  });
  await t.test('a line under a current code is read as written', () => {
    const line = signed('Step', { reason: 'Waiting', on: 'run' });
    assert.equal(upgraded(line), line);
  });
  await t.test('the table holds every former code the card retired, and no other', () => {
    assert.deepEqual(Object.keys(FORMER_REASONS).sort(), [...new Set(CONVERTED.map(([former]) => former))].sort());
  });
});

test('a selector naming a former reason selects the lines that code was written for, current or former', async (t) => {
  const lines: FeedLine[] = [
    ...CONVERTED.map(([, kind, now]) => signed(kind, now)),
    signed('Step', { reason: 'Running' }),
    signed('Step', { reason: 'Waiting', on: 'run' }),
    signed('Run', { reason: 'OverBudget' }),
  ];
  for (const [former, kind] of CONVERTED)
    await t.test(`reason=${former} and reason notin (${former})`, () => {
      const was = lines.filter((line) => formerOf(codesOfLine(line), line.involved!.kind) === former);
      assert.ok(
        was.some((line) => line.involved!.kind === kind),
        'the fixture holds the line the code was written for',
      );
      assert.deepEqual(
        lines.filter((line) => selects(parseSelectors([`reason=${former}`]), line)),
        was,
      );
      assert.deepEqual(
        lines.filter((line) => selects(parseSelectors([`reason notin (${former})`]), line)),
        lines.filter((line) => !was.includes(line)),
      );
    });
  await t.test("a run's every stop on a person was Blocked, whatever step it names now", () => {
    assert.ok(selects(parseSelectors(['kind=Run,reason=Blocked']), signed('Run', { reason: 'OverBudget' })));
  });
  await t.test('a former code and a current one in one list select both', () => {
    const selector = parseSelectors(['reason in (WaitingForSlot,Running)']);
    assert.deepEqual(lines.filter((line) => selects(selector, line)).map(codesOfLine), [
      { reason: 'Waiting', on: 'limit' },
      { reason: 'Running' },
    ]);
  });
  await t.test('on and via are keys a selector names', () => {
    assert.deepEqual(lines.filter((line) => selects(parseSelectors(['on=limit']), line)).map(codesOfLine), [
      { reason: 'Waiting', on: 'limit' },
    ]);
    assert.equal(lines.filter((line) => selects(parseSelectors(['via=closeout']), line)).length, 1);
  });
});

test('a former reason typed is hinted at, once each, and a current one is not', () => {
  assert.equal(formerHints('reason in (NeedsHuman,WaitingForSlot,NeedsHuman)').length, 2);
  assert.deepEqual(formerHints('reason=AwaitingAnswer,via=session'), []);
});
