/**
 * What a line of the feed means for a subscriber, the words it is told, and when a digest falls due: pure, and pinned against the words the
 * feed writes (`feedWords`), so a word the feed changes is a default wake word that fails here rather than a wake that never comes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feedWords, upgraded, type FeedLine, type RunLine } from '../feed/index.ts';
import type { Listing } from '../list/list.ts';
import type { Closeout } from '../closeout/index.ts';
import type { Instant } from '../daemon/daemon.ts';
import { DEFAULT_WAKE, digestDue, digestOf, messageOf, readDelivered, sortLine, subscribeRefusalOf } from './subscription.ts';

const AT = '2026-10-05T12:00:00.000Z';

/** A listing of one run whose one step `review` stands at `status`, waiting on a person where `onYou`. */
const listed = (status: string, { onYou = false, waits }: { onYou?: boolean; waits?: string } = {}) =>
  ({
    steps: [{ name: 'review', status, branch: null, ...(waits ? { waits } : {}) }],
    waitingOnYou: onYou ? ['review'] : [],
    waiting: [],
  }) as unknown as Listing;

/**
 * The feed's lines for a pass that judged the run `status`, and its step as `listed` says it: the run's, then the step's, each signed as
 * the tick signs one (`upgraded`) — so every rule this file holds is held on a v1 line.
 */
const linesOf = (
  l: Listing,
  status: { status: 'running' | 'succeeded' | 'failed' | 'cancelled' | 'awaiting approval' | 'blocked' },
  closeout?: Closeout,
): RunLine[] => {
  const words = feedWords(l, {}, status, () => closeout);
  return [
    upgraded({ at: AT, run: 'r-1', ...words.run }) as RunLine,
    ...words.steps.map(({ name, ...said }) => upgraded({ at: AT, run: 'r-1', step: name, ...said }) as RunLine),
  ];
};

const BLOCKED: Closeout = { outcome: 'blocked', summary: 's', artifacts: [], needs: 'a decision on the schema' };

test('the default wake words wake on each line the feed writes for a wait on a person, pinned against feedWords', () => {
  const waits: Array<[string, FeedLine[]]> = [
    ['a step at its gate', linesOf(listed('awaiting approval', { onYou: true }), { status: 'awaiting approval' })],
    ['a loop out of rounds', linesOf(listed('rounds exhausted', { onYou: true }), { status: 'running' })],
    ['a session on its prompt', linesOf(listed('needs-human', { waits: 'permission: Bash' }), { status: 'running' })],
    ['a blocked sign-off', linesOf(listed('succeeded · BLOCKED', { onYou: true }), { status: 'blocked' }, BLOCKED)],
    ['a check refused', linesOf(listed('failed ✗ check (exit 1)', { onYou: true }), { status: 'failed' })],
  ];
  for (const [what, lines] of waits)
    assert.ok(
      lines.some((l) => sortLine(l, DEFAULT_WAKE) === 'wake'),
      `${what} wakes: ${JSON.stringify(lines)}`,
    );
});

test('a tool denial is routine for the default wake words, as a step’s denied: note was before it became a signal of its own', () => {
  const shot = upgraded({ at: AT, run: 'r-1', step: 'review', word: 'denied: Bash(git push)', note: 'try 2', call: 'Bash(git push)', try: 2 });
  assert.equal(shot.reason, 'ToolDenied');
  assert.equal(sortLine(shot, DEFAULT_WAKE), 'routine', 'nobody woken by the default words is woken by a denial, then or now');
});

test("a run blocked, its note waiting on you: review, wakes on the run's own line, and a loop out of rounds on the step's", () => {
  const [run] = linesOf(listed('rounds exhausted', { onYou: true }), { status: 'blocked' });
  assert.deepEqual(run, upgraded({ at: AT, run: 'r-1', word: 'blocked', note: 'waiting on you: review' }));
  assert.deepEqual({ reason: run.reason, type: run.type, waits: run.waits }, { reason: 'Blocked', type: 'Warning', waits: 'person' });
  assert.equal(sortLine(run, DEFAULT_WAKE), 'wake');
  assert.equal(
    sortLine({ at: AT, run: 'r-1', word: 'running', note: 'waiting on you: review' }, DEFAULT_WAKE),
    'wake',
    'by its note alone',
  );
  const [, step] = linesOf(listed('rounds exhausted', { onYou: true }), { status: 'running' });
  assert.equal(step.word, 'rounds exhausted');
  assert.equal(sortLine(step, DEFAULT_WAKE), 'wake');
});

test("a blocked sign-off wakes by its note's needs: alone, whatever its word", () => {
  const [, step] = linesOf(listed('succeeded · BLOCKED'), { status: 'running' }, BLOCKED);
  assert.equal(step.note, 'needs: a decision on the schema');
  assert.equal(sortLine({ ...step, word: 'succeeded' }, DEFAULT_WAKE), 'wake');
});

test('routine words do not wake: a step at work, verified, waiting, a run running or succeeded, a hold', () => {
  for (const status of ['running', 'verified ✓', 'waiting', 'pending', 'succeeded · done'])
    for (const line of linesOf(listed(status), { status: 'running' }))
      assert.equal(sortLine(line, DEFAULT_WAKE), 'routine', `${JSON.stringify(line)} is routine`);
  assert.equal(sortLine({ at: AT, run: 'r-1', word: 'succeeded' }, DEFAULT_WAKE), 'routine');
  assert.equal(sortLine({ at: AT, run: 'r-1', word: 'running', note: 'held until r-2 ships' }, DEFAULT_WAKE), 'routine');
  assert.equal(
    sortLine({ at: AT, run: 'r-1', step: 'build', word: 'running', note: 'said to twice · the needs: of it' }, DEFAULT_WAKE),
    'routine',
    'a wake word inside a part of the note, not leading it, is no wake',
  );
});

test("a subscriber's own wake words replace the default, matched on the word or the note's lead whatever their case", () => {
  const line: FeedLine = { at: AT, run: 'r-1', step: 'plan', word: 'Verified ✓' };
  assert.equal(sortLine(line, ['verified']), 'wake');
  assert.equal(sortLine({ ...line, word: 'verified ✓' }, ['VERIFIED']), 'wake', 'the wake word folded too');
  assert.equal(sortLine({ ...line, word: 'awaiting approval' }, ['verified']), 'routine');
  assert.equal(sortLine({ ...line, word: 'running', note: 'Waiting On You: review it' }, DEFAULT_WAKE), 'wake', "the note's lead folded");
});

test('a wake is told its lines, then the digest riding it; a digest alone is told with its count', () => {
  const wake: FeedLine = { at: AT, run: 'r-1', step: 'plan', word: 'awaiting approval', note: 'approve it: nemia approve r-1 plan' };
  const r1: FeedLine = { at: '2026-10-05T11:58:00.000Z', run: 'r-2', step: 'build', word: 'running' };
  const r2: FeedLine = { at: '2026-10-05T11:59:00.000Z', run: 'r-2', step: 'build', word: 'verified ✓' };
  assert.equal(
    messageOf([wake], []),
    'The feed needs your judgement:\n  12:00:00  r-1  plan  awaiting approval  · approve it: nemia approve r-1 plan',
  );
  const ridden = messageOf([wake], [r1, r2]).split('\n');
  assert.deepEqual(ridden.slice(2), [
    '',
    'Since your last news:',
    '2 routine lines of the feed:',
    '  11:58:00  r-2  build  running',
    '  11:59:00  r-2  build  verified ✓',
  ]);
  assert.deepEqual(digestOf([r1]).split('\n'), [
    'News from the feed, nothing waiting on you:',
    '1 routine line of the feed:',
    '  11:58:00  r-2  build  running',
  ]);
});

/** A gate's two lines, as the tick writes them at one instant: the run's, then its step's. */
const GATE: FeedLine[] = [
  { at: AT, run: 'r-1', word: 'awaiting approval', note: 'waiting on you: approve land' },
  { at: AT, run: 'r-1', step: 'land', word: 'awaiting approval', note: 'approve it: nemia approve r-1 land' },
];

test('the wake lines of one read are told in one message, each in the order given, the digest once under them', () => {
  const r1: FeedLine = { at: '2026-10-05T11:58:00.000Z', run: 'r-2', step: 'build', word: 'running' };
  const told = (lines: FeedLine[]) => messageOf(lines, [r1]).split('\n');
  assert.deepEqual(told(GATE), [
    'The feed needs your judgement:',
    '  12:00:00  r-1  —  awaiting approval  · waiting on you: approve land',
    '  12:00:00  r-1  land  awaiting approval  · approve it: nemia approve r-1 land',
    '',
    'Since your last news:',
    '1 routine line of the feed:',
    '  11:58:00  r-2  build  running',
  ]);
  assert.deepEqual(told([...GATE].reverse()).slice(1, 3), told(GATE).slice(1, 3).reverse(), 'in the order given, never sorted');
});

test('a read with a wake comes to one message: every wake line, then the digest and every routine line of the read, emptied after', () => {
  const now: Instant = { at: 2_000_000, mono: { boot: 'b', ms: 1 } };
  const since: Instant = { at: 1_000_000, mono: { boot: 'b', ms: 0 } };
  const folded: FeedLine = { at: '2026-10-05T11:50:00.000Z', run: 'r-2', step: 'build', word: 'running' };
  const before: FeedLine = { at: '2026-10-05T11:58:00.000Z', run: 'r-2', step: 'build', word: 'verified ✓' };
  const after: FeedLine = { at: '2026-10-05T12:01:00.000Z', run: 'r-3', step: 'build', word: 'running' };
  const read = readDelivered({ cursor: 10, digest: [folded], since }, [before, ...GATE, after], DEFAULT_WAKE, 99, now);
  assert.equal(read.message, messageOf(GATE, [folded, before, after]));
  assert.equal(read.wakes, 2);
  assert.deepEqual(read.next, { cursor: 99, digest: [] });
});

test('a read with no wake is told nothing: its routine lines folded, the digest begun now where it was empty, the cursor moved', () => {
  const now: Instant = { at: 2_000_000, mono: { boot: 'b', ms: 1 } };
  const since: Instant = { at: 1_000_000, mono: { boot: 'b', ms: 0 } };
  const r1: FeedLine = { at: AT, run: 'r-2', step: 'build', word: 'running' };
  const r2: FeedLine = { at: AT, run: 'r-2', step: 'build', word: 'verified ✓' };
  assert.deepEqual(readDelivered({ cursor: 10, digest: [] }, [r1, r2], DEFAULT_WAKE, 50, now), {
    wakes: 0,
    next: { cursor: 50, digest: [r1, r2], since: now },
  });
  assert.deepEqual(readDelivered({ cursor: 10, digest: [r1], since }, [r2], DEFAULT_WAKE, 50, now), {
    wakes: 0,
    next: { cursor: 50, digest: [r1, r2], since },
  });
  assert.deepEqual(readDelivered({ cursor: 10, digest: [r1], since }, [], DEFAULT_WAKE, 50, now), {
    wakes: 0,
    next: { cursor: 50, digest: [r1], since },
  });
  assert.deepEqual(readDelivered({ cursor: 10, digest: [] }, [], DEFAULT_WAKE, 50, now), { wakes: 0, next: { cursor: 50, digest: [] } });
});

test('a digest is due once its minutes have passed since its first line, and never while it is empty', () => {
  const since: Instant = { at: 1_000_000, mono: { boot: 'b', ms: 500_000 } };
  const after = (ms: number): Instant => ({ at: 1_000_000 + ms, mono: { boot: 'b', ms: 500_000 + ms } });
  assert.equal(digestDue(since, 60, after(59 * 60_000 + 999)), false, 'a millisecond before');
  assert.equal(digestDue(since, 60, after(60 * 60_000)), true, 'at the minute');
  assert.equal(digestDue(since, 60, after(61 * 60_000)), true, 'after it');
  assert.equal(digestDue(since, 1, after(59_000)), false, 'minutes are minutes, not seconds');
  assert.equal(digestDue(undefined, 1, after(3_600_000)), false, 'an empty digest is never due');
  const otherBoot: Instant = { at: 1_000_000 + 60_000, mono: { boot: 'c', ms: 1 } };
  assert.equal(digestDue(since, 1, otherBoot), true, 'across boots, the wall clock');
});

test('REFUSED: a subscription whose name is no file name, a wake word empty, or minutes not above zero', () => {
  assert.equal(subscribeRefusalOf({ name: 'nemia', wake: [], digestEvery: 60 }), undefined);
  for (const name of ['', '../x', 'a b', 'x.state', '-x'])
    assert.match(subscribeRefusalOf({ name, wake: [] }) ?? '', /is no subscription's name/, JSON.stringify(name));
  assert.match(subscribeRefusalOf({ name: 'n', wake: ['failed', ' '] }) ?? '', /^--wake takes a word/);
  for (const digestEvery of [0, -1, Number.NaN])
    assert.match(subscribeRefusalOf({ name: 'n', wake: [], digestEvery }) ?? '', /^--digest-every takes the minutes/, String(digestEvery));
});
