/**
 * A started card sent on (`resentText`, `resentCardName`, `resentFrom`): the new card's keys, its context, its body and its name, and
 * which of its runs it is sent on from. `resendRefusal` is proved by contracts/resend.contract.ts.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { parseInboxCard } from './inbox.ts';
import { resentCardName, resentFrom, resentText } from './resend.ts';

const AT = '2026-11-21T10:00:00.000Z';

/** A card routed to `quick`, started as `r-k2q9`, every key it may carry set. */
const ROUTED = parseInboxCard(
  'r-front-door-routed.md',
  '---\nworkflow: quick\nrepo: /home/me/code/app\ngate: review\nmodel: implement=fable\nfactory: nemia\nfrom: door-a1b2\nlabels: { door: front, team: core }\n---\nCache the views.\n',
);

/** The card `resentText` writes, read back. */
const resent = (workflow: string | undefined, runs = ['r-k2q9']) =>
  parseInboxCard(resentCardName('r-k2q9') + '.md', resentText(ROUTED, 'r-k2q9', runs, workflow, AT));

describe('a card sent on to a workflow', () => {
  const card = resent('intake');
  test('names the workflow given, queued at the time given', () => {
    assert.equal(card.workflow, 'intake');
    assert.equal(card.queued, AT);
  });
  test('keeps its factory and its labels, so its factory reads it as the card', () => {
    assert.equal(card.factory, 'nemia');
    assert.deepEqual(card.labels, { door: 'front', team: 'core' });
  });
  test('is handed its own context, then the run it was started as', () => assert.deepEqual(card.from, ['door-a1b2', 'r-k2q9']));
  test("drops the gate and the models, which name another workflow's steps", () => {
    assert.equal(card.gate, undefined);
    assert.equal(card.model, undefined);
  });
  test('writes no retired repo', () => assert.equal('repo' in card, false));
  test("opens with the card's own body, and says where it came from after it", () => {
    assert.ok(card.body.startsWith('Cache the views.'));
    assert.match(card.body, /r-k2q9/);
    assert.notEqual(card.body, 'Cache the views.');
  });
});

describe('a card sent on naming no workflow', () => {
  const card = resent(undefined);
  test('names none, and is not queued: its factory’s card triggers take it', () => {
    assert.equal(card.workflow, undefined);
    assert.equal(card.queued, undefined);
  });
  test('keeps the labels a trigger selects it by', () => assert.equal(card.labels?.door, 'front'));
  test('drops the gate and the models', () => assert.equal(card.gate, undefined));
});

describe('a card sent on to its own workflow', () => {
  const card = resent('quick');
  test('keeps its gate and its models, which name that workflow’s steps', () => {
    assert.equal(card.gate, 'review');
    assert.deepEqual(card.model, { implement: 'fable' });
  });
});

test('a run both the card and its starts name is handed once', () =>
  assert.deepEqual(resent('intake', ['door-a1b2', 'r-k2q9']).from, ['door-a1b2', 'r-k2q9']));

test("the card sent on is named after the run it is sent on from, past a person's or a routed card's name", () =>
  assert.equal(resentCardName('cache-the-views-k2q9'), 'cache-the-views-k2q9-resent'));

describe('the run a card is sent on from', () => {
  test('the first still in play', () =>
    assert.equal(
      resentFrom([
        { id: 'a', phase: 'failed' },
        { id: 'b', phase: 'waiting' },
        { id: 'c', phase: 'running' },
      ])?.id,
      'b',
    ));
  test('else the last', () =>
    assert.equal(
      resentFrom([
        { id: 'a', phase: 'failed' },
        { id: 'b', phase: 'cancelled' },
      ])?.id,
      'b',
    ));
  test('none for a card never started', () => assert.equal(resentFrom([]), undefined));
});
