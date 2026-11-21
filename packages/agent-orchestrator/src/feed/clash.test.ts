/**
 * A card the triggers of its factory clash on, as the feed says it (`feedChanges` with `clashes`, `foldFeed`): `TriggersClash` once when
 * a clash begins, a Warning about the factory labelled with it and the card, never again while it stands nor after a restart, and
 * `ClashSettled` once when it ends; a caller that read no inbox says nothing of any.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { feedChanges, foldFeed, freshFold, isFactoryLine, type FeedClashes, type FeedFold, type FeedLine } from './feed.ts';

const AT = '2026-11-19T10:00:00.000Z';
const CLASH = { factory: 'mill', card: 'both-ways', by: ['bugs', 'ready'] };

/** A pass over `fold` handed `clashes`: the lines it owes, folded in as the feed would read them back. */
const pass = (fold: FeedFold, clashes: FeedClashes | undefined) => {
  const lines: FeedLine[] = feedChanges(fold, new Map(), AT, new Set(), undefined, undefined, undefined, undefined, undefined, undefined, clashes);
  foldFeed(fold, lines);
  return lines;
};

/** Each line's factory, card and reason. */
const said = (lines: readonly FeedLine[]) => lines.filter(isFactoryLine).map((l) => [l.factory, l.labels?.card, l.reason]);

describe('a clash on a card is said when it begins and when it ends', () => {
  test('begun: one Warning about the factory, labelled with the card, said once over many passes', () => {
    const fold = freshFold();
    const first = pass(fold, [CLASH]);
    assert.deepEqual(said(first), [['mill', 'both-ways', 'TriggersClash']]);
    assert.deepEqual(
      first.filter(isFactoryLine).map((l) => [l.involved, l.type, l.source, l.labels]),
      [[{ kind: 'Factory', name: 'mill' }, 'Warning', 'tick', { factory: 'mill', card: 'both-ways' }]],
    );
    for (let i = 0; i < 3; i++) assert.deepEqual(pass(fold, [{ ...CLASH, by: ['bugs', 'ready', 'third'] }]), []);
  });
  test('a restarted daemon, its fold the whole feed, says it no second time', () => {
    const fold = freshFold();
    const lines = pass(fold, [CLASH]);
    const restarted = foldFeed(freshFold(), lines);
    assert.deepEqual(pass(restarted, [CLASH]), []);
  });
  test('ended: one Normal line, once, and a clash begun again is said again', () => {
    const fold = freshFold();
    pass(fold, [CLASH]);
    assert.deepEqual(said(pass(fold, [])), [['mill', 'both-ways', 'ClashSettled']]);
    assert.deepEqual(pass(fold, []), []);
    assert.deepEqual(said(pass(fold, [CLASH])), [['mill', 'both-ways', 'TriggersClash']]);
  });
  test('a caller that read no inbox says nothing of the clashes, however the feed stands', () => {
    const fold = freshFold();
    pass(fold, [CLASH]);
    assert.deepEqual(pass(fold, undefined), []);
  });
});
