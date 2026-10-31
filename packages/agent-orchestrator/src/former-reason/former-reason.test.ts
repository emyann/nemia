/**
 * The former reason codes (`former-reason.ts`): a line on disk under one reads back under its current codes, a selector that names one
 * selects what it did, and a person who types one is told the new spelling.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formerHints, formerOf, FORMER_REASONS } from './former-reason.ts';
import { upgraded, FEED_VERSION, type Codes, type FeedLine, type InvolvedKind } from '../feed/index.ts';
import { parseSelectors, selects } from '../watch/selector.ts';

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
