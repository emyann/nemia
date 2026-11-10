/**
 * A memo brought up to the engine's feed (`followedFeed`, `rest.verb.ts`) where the feed does not read: a refusal of it clears the memo,
 * forgets its place and answers false, its reason and what it cleared said (`feedUnread`); a defect is let through. A boundary test: the
 * stand-in engine models no feed that refuses or dies, which is this file's whole subject.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Exit } from 'effect';
import type { Engine } from '../runtime-client.ts';
import { feedUnread, followedFeed, type FollowedMemo } from './rest.verb.ts';

/** An engine whose feed answers `feed`, and nothing else. */
const feeding = (feed: Engine['feed']): Engine => ({ feed }) as unknown as Engine;

/** A memo that has read to 3 and holds two runs. */
const held = (): FollowedMemo => ({
  cursor: 3,
  runs: new Map([
    ['r-1', 1],
    ['r-2', 2],
  ]),
});

test('a feed that refuses clears the memo, forgets its place, and answers false', () => {
  const memo = held();
  const refused = feeding((() => Effect.fail(new Error('the journal is locked'))) as unknown as Engine['feed']);
  assert.equal(Effect.runSync(followedFeed(refused, memo)), false);
  assert.equal(memo.runs.size, 0);
  assert.equal(memo.cursor, undefined);
});

test('what is said of a feed that did not read names why, and how many runs were cleared', () => {
  const said = feedUnread(2, new Error('the journal is locked'));
  assert.ok(said.includes('the journal is locked'), said);
  assert.ok(said.includes('2 run(s)'), said);
});

test('REFUSED: a feed that dies is let through, and the memo is left as it was', () => {
  const memo = held();
  const dying = feeding(() => Effect.die(new Error('a bug in the feed')));
  const exit = Effect.runSyncExit(followedFeed(dying, memo));
  assert.ok(Exit.isFailure(exit), 'the defect is not answered as a read');
  assert.equal(memo.runs.size, 2);
  assert.equal(memo.cursor, 3);
});
