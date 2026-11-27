/**
 * The runs a card's work went through (`cardWork`, one step of it proved by `contracts/card-work.contract.ts`): in the order they were
 * made whatever order the store lists them in (`workRuns`), a chain of workflow nodes followed down to its end, and a loop of
 * `startedBy` that reaches no card left out. What the contract cannot prove — the order, the depth — is held here.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { cardWork, workRuns, type Worked } from './card-work.ts';

const T = (minute: number) => `2026-11-01T10:${String(minute).padStart(2, '0')}:00.000Z`;

/** A run started from the card `card`. */
const fromCard = (id: string, card: string, minute: number) => ({ id, from: { inbox: card }, createdAt: T(minute) }) satisfies Worked;

/** A run the node of `parent` started. */
const byNode = (id: string, parent: string, minute: number) => ({ id, startedBy: { run: parent }, createdAt: T(minute) }) satisfies Worked;

test("a card's work is the runs started from it and, below each, the runs its nodes started, in the order they were made", () => {
  const runs = [
    byNode('child-b', 'root', 3),
    fromCard('other', 'another-card', 1),
    byNode('child-a', 'root', 2),
    fromCard('root', 'card-1', 0),
  ];
  assert.deepEqual(cardWork('card-1', workRuns(runs)), ['root', 'child-a', 'child-b'], 'the other card has none of it');
  assert.deepEqual(cardWork('another-card', workRuns(runs)), ['other']);
  assert.deepEqual(cardWork('none', workRuns(runs)), []);
});

test('a chain of workflow nodes is followed to its end, and a run made at the same instant follows the order the ids give', () => {
  const chain = [fromCard('r0', 'card-1', 0), byNode('r1', 'r0', 1), byNode('r2', 'r1', 2), byNode('r3', 'r2', 3), byNode('r4', 'r3', 4)];
  assert.deepEqual(cardWork('card-1', workRuns([...chain].reverse())), ['r0', 'r1', 'r2', 'r3', 'r4']);
  const tied = [fromCard('b', 'card-1', 0), fromCard('a', 'card-1', 0)];
  assert.deepEqual(cardWork('card-1', workRuns(tied)), ['a', 'b']);
});

test('a run that carries a card of its own is not the work of the run that started it, and a loop of startedBy belongs to no card', () => {
  const runs = [
    fromCard('root', 'card-1', 0),
    { ...byNode('own', 'root', 1), from: { inbox: 'card-2' } },
    byNode('x', 'y', 2),
    byNode('y', 'x', 3),
  ];
  assert.deepEqual(cardWork('card-1', workRuns(runs)), ['root']);
  assert.deepEqual(cardWork('card-2', workRuns(runs)), ['own']);
});
