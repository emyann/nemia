/**
 * The walk of what a card waits on (`cardWaitsOf`): a named card is released when its own run has, or the card its run passed its work on
 * to has — a workflow node's card, or the card it was sent on as — and waits at the card its work stands at now; each card read once,
 * and a loop of hand-offs ends. And the route of a cycle of `after:` lines (`afterCycle`). The landing rule itself is proved by
 * `contracts/card-release.contract.ts`.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { afterCycle, cardWaitsOf, type CardLook } from './waits.ts';

/** A look over `cards`, by name: a card not among them is unknown; each look counted in `looks`. */
const lookOver =
  (cards: Readonly<Record<string, Partial<CardLook>>>, looks: string[] = []) =>
  (name: string) => {
    looks.push(name);
    const c = cards[name];
    return c === undefined ? { known: false, runs: [], onward: [] } : { known: true, runs: c.runs ?? [], onward: c.onward ?? [] };
  };

describe('cardWaitsOf', () => {
  test('a card routed by a door, its own run not released, is released once the card it was routed as has', () => {
    const look = lookOver({
      a: { runs: [{ id: 'a-run', released: false }], onward: ['a2'] },
      a2: { runs: [{ id: 'a2-run', released: true }] },
    });
    assert.deepEqual(cardWaitsOf(['a'], look), []);
  });

  test('while the card it was routed as is not released, it waits at that card', () => {
    const look = lookOver({
      a: { runs: [{ id: 'a-run', released: false }], onward: ['a2'] },
      a2: { runs: [{ id: 'a2-run', released: false }] },
    });
    assert.deepEqual(cardWaitsOf(['a'], look), [{ card: 'a', release: { kind: 'waiting', card: 'a2' } }]);
  });

  test('a card sent on (`<run>-resent`) is followed the same way', () => {
    const look = lookOver({
      a: { runs: [{ id: 'a-run', released: false }], onward: ['a-run-resent'] },
      'a-run-resent': { runs: [] },
    });
    assert.deepEqual(cardWaitsOf(['a'], look), [{ card: 'a', release: { kind: 'waiting', card: 'a-run-resent' } }]);
  });

  test('a loop of hand-offs ends, each card read once', () => {
    const looks: string[] = [];
    const look = lookOver({ a: { onward: ['b'] }, b: { onward: ['a'] } }, looks);
    assert.deepEqual(cardWaitsOf(['a', 'b'], look), [
      { card: 'a', release: { kind: 'waiting', card: 'b' } },
      { card: 'b', release: { kind: 'waiting', card: 'b' } },
    ]);
    assert.deepEqual(looks, ['a', 'b']);
  });

  test('a name the store knows nothing of is missing; a card released is left out', () => {
    const look = lookOver({ done: { runs: [{ id: 'd', released: true }] } });
    assert.deepEqual(cardWaitsOf(['done', 'typo'], look), [{ card: 'typo', release: { kind: 'missing', card: 'typo' } }]);
  });
});

describe('afterCycle', () => {
  const afterOf = (lines: Readonly<Record<string, readonly string[]>>) => (name: string) => lines[name] ?? [];

  test('A after B and B after A is the route A → B → A', () => {
    assert.deepEqual(afterCycle('a', afterOf({ a: ['b'], b: ['a'] })), ['a', 'b', 'a']);
  });

  test('a longer cycle gives its whole route', () => {
    assert.deepEqual(afterCycle('a', afterOf({ a: ['b'], b: ['c'], c: ['a'] })), ['a', 'b', 'c', 'a']);
  });

  test('a chain with no cycle gives none, nor does a card beyond a cycle it is not on', () => {
    assert.equal(afterCycle('a', afterOf({ a: ['b'], b: ['c'] })), undefined);
    assert.equal(afterCycle('z', afterOf({ z: ['a'], a: ['b'], b: ['a'] })), undefined);
  });
});
