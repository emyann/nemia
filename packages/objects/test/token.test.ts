/**
 * Standing tokens and actors (`src/token.ts`, `src/commands-rest-tokens.ts`): a token listed decodes with and without an agent's holder,
 * a mint takes no narrowing but `read` or `act`, an actor written before actors were said (none at all) is still read where it is
 * optional, and `nemia token add` refuses a narrowing that is none, and a factory or a narrowing with no agent, before anything is asked.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { Actor, actorWords, Event, Token, TOKEN_ADD_WORDS, TokenMint } from 'objects';

test('a token listed decodes as the person’s or an agent’s, and a mint takes no narrowing past read and act', () => {
  for (const token of [
    { name: 'laptop', holder: 'person', createdAt: '2026-11-13T00:00:00.000Z' },
    { name: 'ops', holder: 'agent', agent: 'operator', factory: 'a', narrowed: 'act', createdAt: '2026-11-13T00:00:00.000Z' },
  ])
    assert.deepEqual(Schema.encodeSync(Token)(Schema.decodeUnknownSync(Token)(token)), token);
  assert.throws(() => Schema.decodeUnknownSync(TokenMint)({ name: 'ops', agent: 'operator', narrowed: 'answer' }), 'a widening is no narrowing');
});

test('an actor is optional where it is recorded: an event with none decodes, and each kind of actor reads in words', () => {
  const event = {
    apiVersion: 'nemia/v1',
    kind: 'Event',
    metadata: { name: '0', creationTimestamp: '2026-11-13T00:00:00.000Z', resourceVersion: '100' },
    involved: { kind: 'Run', name: 'r' },
    reason: 'Approved',
    type: 'Normal',
    message: 'approved',
    source: 'person',
  };
  assert.ok(Schema.is(Event)(event), 'a line written before actors were said');
  assert.ok(Schema.is(Event)({ ...event, actor: { kind: 'person', token: 'laptop' } }));
  const said = [
    { kind: 'person' },
    { kind: 'person', token: 'laptop' },
    { kind: 'agent', agent: 'operator', token: 'ops' },
    { kind: 'agent', agent: 'review', run: 'r', step: 's' },
  ].map((a) => actorWords(Schema.decodeUnknownSync(Actor)(a)));
  assert.equal(new Set(said).size, said.length, 'each kind of actor reads apart');
  assert.ok(said[1]?.includes('laptop') && said[2]?.includes('operator') && said[2].includes('ops') && said[3]?.includes('r/s'));
});

test('REFUSED: nemia token add with a narrowing that is none, or a factory or a narrowing with no agent, before anything is asked', () => {
  const check = TOKEN_ADD_WORDS.check;
  assert.equal(check({ name: 'laptop' }), null);
  assert.equal(check({ name: 'ops', agent: 'operator', factory: 'a', narrowed: 'read' }), null);
  assert.equal(typeof check({ name: 'ops', agent: 'operator', narrowed: 'answer' }), 'string');
  assert.equal(typeof check({ name: 'ops', factory: 'a' }), 'string');
  assert.equal(typeof check({ name: 'ops', narrowed: 'act' }), 'string');
});
