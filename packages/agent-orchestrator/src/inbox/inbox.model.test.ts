/**
 * The planning model: a card's name refuses what `inboxNameRefusal` refuses and takes what `nemia inbox add` mints, a card decodes as
 * `parseInboxCard` reads one, and a card breaking what its reader upholds is refused.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { Option, Schema } from 'effect';
import { Card, CardName, Inbox, inboxModel } from './inbox.model.ts';
import { parseInboxCard } from './inbox.ts';
import { runId } from '../record/record.store.ts';

/** The card the tests' inbox files most: every key set, the repository a directory. */
const CARD = parseInboxCard(
  'cache-the-views-k2q9.md',
  '---\nworkflow: dev\nrepo: /home/me/code/app\nqueued: 2026-09-16T10:00:00.000Z\ngate: plan\nfactory: pipao\nfrom: a-k2q9, b-3z4w\nlabels: { team: core }\n---\nCache the views.\n',
);

describe("a card's name is checked on create by inboxNameRefusal's rule and read as any string", () => {
  test('refuses what inboxNameRefusal refuses', () => {
    for (const name of ['', ' ', '../runs/r-1', '.', '..', 'a/b', 'a\\b', 'a\0b', '.hidden'])
      assert.equal(Option.isNone(CardName.create.option(name)), true, JSON.stringify(name));
  });
  test('takes what nemia inbox add mints', () => {
    for (const name of [runId('Cache the views between passes'), 'a..b', CARD.name])
      assert.equal(Schema.is(CardName.OnCreate)(name), true, name);
  });
  test('reads a name written before the check', () => assert.equal(Schema.is(CardName.OnRead)('../old'), true));
});

describe('a card decodes as parseInboxCard reads one, and one breaking what its reader upholds is refused', () => {
  test('every key set', () => assert.equal(Schema.decodeUnknownResult(Card)(CARD)._tag, 'Success'));
  test('none set', () => assert.equal(Schema.is(Card)(parseInboxCard('x-k2q9.md', 'Cache the views.\n')), true));
  const rows: Record<string, object> = {
    'a file that is not its name with .md': { ...CARD, file: 'other.md' },
    'queued with no workflow': { name: 'x', file: 'x.md', queued: '2026-09-16T10:00:00.000Z', body: 'x' },
    'a run named twice in from': { ...CARD, from: ['a-k2q9', 'a-k2q9'] },
  };
  for (const [row, card] of Object.entries(rows)) test(`REFUSED: ${row}`, () => assert.equal(Schema.is(Card)(card), false));
});

test('the inbox holds its cards and the tick’s tries of the queued ones, by name', () => {
  const tried = { at: '2026-09-16T10:01:00.000Z', text: 'x', repo: '/home/me/code/app', why: 'no workflow', refused: true };
  assert.equal(Schema.is(Inbox)({ cards: [CARD], tries: { [CARD.name]: tried } }), true);
  assert.deepEqual(inboxModel.ids, { CardName: 'Card' });
  assert.deepEqual(inboxModel.entities, [Inbox, Card]);
});
