/**
 * What `nemia inbox edit` prints of a card's wait (`editedLines`), over Cards built here: a wait kept, a wait changed with the cards it
 * was on, a wait taken off naming the cards it was on, and, for a card queued by hand or by a card trigger and not started, that it may
 * start on the next pass; a card with no wait before or after prints its two lines alone.
 */
import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { Card } from 'objects';
import { editedLines } from '../src/commands/inbox/edit.ts';

/** A card of the default factory, its spec and status as given over a filed card's. */
const aCard = (version: string, spec: Partial<Card['spec']> = {}, status: Partial<Card['status']> = {}) =>
  ({
    apiVersion: 'nemia/v1',
    kind: 'Card',
    metadata: {
      name: 'land-it-a1b2',
      namespace: 'default',
      creationTimestamp: '2026-11-22T07:00:00.000Z',
      resourceVersion: version,
    },
    spec: { body: 'Land it\n', ...spec },
    status: { state: 'filed', runs: [], inPlay: true, ...status },
  }) satisfies Card;

const START = /next pass/;

test('a wait kept is said as inbox add says it', () => {
  const lines = editedLines(aCard('2', { after: ['a-1x2y'] }), aCard('1', { after: ['a-1x2y'] }));
  assert.equal(lines.length, 3);
  assert.equal(lines[2], '  after: a-1x2y — queued and started once each has succeeded');
});

test('a wait changed names the cards it was on', () => {
  const lines = editedLines(aCard('2', { after: ['b-3z4w'] }), aCard('1', { after: ['a-1x2y'] }));
  assert.equal(lines[2], '  after: b-3z4w — queued and started once each has succeeded (was a-1x2y)');
});

test('a wait given to a card that had none is said with no was', () => {
  const lines = editedLines(aCard('2', { after: ['b-3z4w'] }), aCard('1'));
  assert.equal(lines[2], '  after: b-3z4w — queued and started once each has succeeded');
});

test('a wait taken off from a card not queued names the cards it was on, and says no start', () => {
  const lines = editedLines(aCard('2'), aCard('1', { after: ['a-1x2y', 'b-3z4w'] }));
  assert.equal(lines.length, 3);
  assert.match(lines[2] ?? '', /^ {2}after: taken off — it waited on a-1x2y, b-3z4w/);
  assert.ok(
    lines.every((line) => !START.test(line)),
    lines.join('\n'),
  );
});

test('a wait taken off from a card queued by hand says it may start on the next pass, and how to put the wait back', () => {
  const lines = editedLines(
    aCard('2', { queued: '2026-11-22T08:00:00.000Z' }, { state: 'queued' }),
    aCard('1', { after: ['a-1x2y'], queued: '2026-11-22T08:00:00.000Z' }),
  );
  assert.equal(lines.length, 4);
  assert.match(lines[3] ?? '', /queued by hand and may start on the next pass/);
  assert.match(lines[3] ?? '', /nemia inbox edit land-it-a1b2 .*after: a-1x2y/);
});

test('a wait taken off from a card a trigger queues names the trigger', () => {
  const lines = editedLines(aCard('2', {}, { queuedBy: ['sprint-ready'] }), aCard('1', { after: ['a-1x2y'] }));
  assert.match(lines[3] ?? '', /by the card trigger sprint-ready and may start on the next pass/);
});

test('a wait taken off from a card already started says no start', () => {
  const lines = editedLines(
    aCard('2', { queued: '2026-11-22T08:00:00.000Z' }, { state: 'running', runs: ['r-1'] }),
    aCard('1', { after: ['a-1x2y'], queued: '2026-11-22T08:00:00.000Z' }),
  );
  assert.equal(lines.length, 3);
  assert.ok(
    lines.every((line) => !START.test(line)),
    lines.join('\n'),
  );
});

test('a card with no wait before or after prints its two lines alone', () => {
  assert.equal(editedLines(aCard('2'), aCard('1')).length, 2);
});
