/**
 * A card whose wait on the cards of its `after:` only a person can release, as the feed says it (`feedChanges` with `waits`,
 * `foldFeed`): `CardWaitStalled` once when it begins, a Warning about the factory labelled with it and the card, never again while it
 * stands nor after a restart, and `CardWaitFreed` once when it ends; a caller that read no inbox says nothing of any.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { feedChanges, foldFeed, freshFold, isFactoryLine, type FeedFold, type FeedLine, type FeedWaits } from './feed.ts';

const AT = '2026-11-22T10:00:00.000Z';
const STALLED = { factory: 'mill', card: 'b-3z4w', waits: ['waiting on a-1x2y (no such card) — needs you: nemia start b-3z4w'] };

/** A pass over `fold` handed `waits`: the lines it owes, folded in as the feed would read them back. */
const pass = (fold: FeedFold, waits: FeedWaits | undefined) => {
  const lines: FeedLine[] = feedChanges(
    fold,
    new Map(),
    AT,
    new Set(),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    waits,
  );
  foldFeed(fold, lines);
  return lines;
};

/** Each line's factory, card and reason. */
const said = (lines: readonly FeedLine[]) => lines.filter(isFactoryLine).map((l) => [l.factory, l.labels?.card, l.reason]);

describe("a card's stalled wait is said when it begins and when it ends", () => {
  test('begun: one Warning about the factory, labelled with the card, its note naming the fix, said once over many passes', () => {
    const fold = freshFold();
    const first = pass(fold, [STALLED]);
    assert.deepEqual(said(first), [['mill', 'b-3z4w', 'CardWaitStalled']]);
    assert.deepEqual(
      first.filter(isFactoryLine).map((l) => [l.involved, l.type, l.source, l.labels]),
      [[{ kind: 'Factory', name: 'mill' }, 'Warning', 'tick', { factory: 'mill', card: 'b-3z4w' }]],
    );
    assert.match(first.filter(isFactoryLine)[0]?.note ?? '', /nemia start b-3z4w/);
    for (let i = 0; i < 3; i++) assert.deepEqual(pass(fold, [{ ...STALLED, waits: ['waiting on a-1x2y at c-5v6u (failed)'] }]), []);
  });
  test('a restarted daemon, its fold the whole feed, says it no second time', () => {
    const lines = pass(freshFold(), [STALLED]);
    assert.deepEqual(pass(foldFeed(freshFold(), lines), [STALLED]), []);
  });
  test('ended: one Normal line, once, and a wait stalled again is said again', () => {
    const fold = freshFold();
    pass(fold, [STALLED]);
    assert.deepEqual(said(pass(fold, [])), [['mill', 'b-3z4w', 'CardWaitFreed']]);
    assert.deepEqual(pass(fold, []), []);
    assert.deepEqual(said(pass(fold, [STALLED])), [['mill', 'b-3z4w', 'CardWaitStalled']]);
  });
  test('a caller that read no inbox says nothing of the waits, however the feed stands', () => {
    const fold = freshFold();
    pass(fold, [STALLED]);
    assert.deepEqual(pass(fold, undefined), []);
  });
});
