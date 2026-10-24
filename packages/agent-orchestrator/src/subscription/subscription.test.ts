/**
 * What a line of the feed means for a subscriber, the words it is told, and when a digest falls due: pure, and pinned against the lines the
 * feed writes (`feedWords`), so a wait the feed stops stamping fails here rather than becoming a wake that never comes. Which lines wake is
 * the feed's one selector grammar over the subscription's selectors (`selects`); the conversion of a stored wake list is
 * `former-wake.test.ts`'s.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feedWords, upgraded, type FeedLine, type RunLine } from '../feed/index.ts';
import type { Listing } from '../list/list.ts';
import type { Closeout } from '../closeout/index.ts';
import type { Instant } from '../daemon/daemon.ts';
import {
  BOOKMARK_EVERY,
  bookmarkLine,
  DEFAULT_SELECTORS,
  digestDue,
  digestOf,
  messageOf,
  readDelivered,
  subscribeRefusalOf,
} from './subscription.ts';
import { parseSelectors, selects } from '../watch/selector.ts';

/** The default filter parsed, as a subscription that named no selector of its own is delivered by. */
const DEFAULT = parseSelectors(DEFAULT_SELECTORS);

/** Whether the default filter takes `line`: `'wake'` where it does, `'routine'` where the line joins the digest instead. */
const sorted = (line: FeedLine, selectors = DEFAULT): 'wake' | 'routine' => (selects(selectors, line) ? 'wake' : 'routine');

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

/** A gate's two lines, as the tick writes them at one instant: the run's, then its step's. */
const GATE: FeedLine[] = [
  { at: AT, run: 'r-1', word: 'awaiting approval', note: 'waiting on you: approve land' },
  { at: AT, run: 'r-1', step: 'land', word: 'awaiting approval', note: 'approve it: nemia approve r-1 land' },
];

test("which lines wake a subscriber: the default selector over every line the feed writes for a wait on a person, and a subscriber's own selectors", async (t) => {
  await t.test('the default selector takes each line the feed writes for a wait on a person, pinned against feedWords', () => {
    const waits: Array<[string, FeedLine[]]> = [
      ['a step at its gate', linesOf(listed('awaiting approval', { onYou: true }), { status: 'awaiting approval' })],
      ['a loop out of rounds', linesOf(listed('rounds exhausted', { onYou: true }), { status: 'running' })],
      ['a session on its prompt', linesOf(listed('needs-human', { waits: 'permission: Bash' }), { status: 'running' })],
      ['a blocked sign-off', linesOf(listed('succeeded · BLOCKED', { onYou: true }), { status: 'blocked' }, BLOCKED)],
      ['a check refused', linesOf(listed('failed ✗ check (exit 1)', { onYou: true }), { status: 'failed' })],
    ];
    for (const [what, lines] of waits)
      assert.ok(
        lines.some((l) => sorted(l) === 'wake'),
        `${what} wakes: ${JSON.stringify(lines)}`,
      );
  });
  await t.test('a tool denial is routine for the default selector, as it was for the wake words it replaces', () => {
    const shot = upgraded({
      at: AT,
      run: 'r-1',
      step: 'review',
      word: 'denied: Bash(git push)',
      note: 'try 2',
      call: 'Bash(git push)',
      try: 2,
    });
    assert.equal(shot.reason, 'ToolDenied');
    assert.equal(sorted(shot), 'routine', 'nobody woken by the default selector is woken by a denial, then or now');
    assert.equal(sorted(shot, parseSelectors(['reason=ToolDenied'])), 'wake', 'a subscription that names it is');
  });
  await t.test(
    "a run blocked, its note waiting on you: review, wakes on the run's own line, and a loop out of rounds on the step's",
    () => {
      const [run] = linesOf(listed('rounds exhausted', { onYou: true }), { status: 'blocked' });
      assert.deepEqual(run, upgraded({ at: AT, run: 'r-1', word: 'blocked', note: 'waiting on you: review' }));
      assert.deepEqual({ reason: run.reason, type: run.type, waits: run.waits }, { reason: 'Blocked', type: 'Warning', waits: 'person' });
      assert.equal(sorted(run), 'wake');
      assert.equal(
        sorted(upgraded({ at: AT, run: 'r-1', word: 'running', note: 'waiting on you: review' })),
        'wake',
        'by its note alone, which the tick reads into the line’s waits',
      );
      const [, step] = linesOf(listed('rounds exhausted', { onYou: true }), { status: 'running' });
      assert.equal(step.word, 'rounds exhausted');
      assert.equal(sorted(step), 'wake');
    },
  );
  await t.test("a blocked sign-off wakes by its note's needs: alone, whatever its word", () => {
    const [, step] = linesOf(listed('succeeded · BLOCKED'), { status: 'running' }, BLOCKED);
    assert.equal(step.note, 'needs: a decision on the schema');
    assert.equal(sorted(upgraded({ at: AT, run: 'r-1', step: 'review', word: 'succeeded', note: step.note })), 'wake');
  });
  await t.test('routine words do not wake: a step at work, verified, waiting, a run running or succeeded, a hold', () => {
    for (const status of ['running', 'verified ✓', 'waiting', 'pending', 'succeeded · done'])
      for (const line of linesOf(listed(status), { status: 'running' }))
        assert.equal(sorted(line), 'routine', `${JSON.stringify(line)} is routine`);
    assert.equal(sorted(upgraded({ at: AT, run: 'r-1', word: 'succeeded' })), 'routine');
    assert.equal(sorted(upgraded({ at: AT, run: 'r-1', word: 'running', note: 'held until r-2 lands' })), 'routine');
    assert.equal(
      sorted(upgraded({ at: AT, run: 'r-1', step: 'build', word: 'running', note: 'said to twice · the needs: of it' })),
      'routine',
      'a wake word inside a part of the note, not leading it, is no wait the tick stamps',
    );
  });
  await t.test("a subscriber's own selectors replace the default, over the keys a line names and never its message", () => {
    const line = linesOf(listed('verified ✓'), { status: 'running' })[1];
    assert.equal(sorted(line, parseSelectors(['reason=CheckPassed'])), 'wake');
    assert.equal(sorted(line, parseSelectors(['step=review'])), 'wake', 'a label of the line too');
    assert.equal(sorted(line, parseSelectors(['reason=AwaitingApproval'])), 'routine');
    assert.equal(sorted(line, parseSelectors(['reason=AwaitingApproval', 'type=Normal'])), 'wake', 'one selector of several must hold');
  });
});

test('messageOf and digestOf: a wake is told its lines in the order given, the digest riding it once; a digest alone is told with its count', async (t) => {
  await t.test('a wake is told its lines, then the digest riding it; a digest alone is told with its count', () => {
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
  await t.test('the wake lines of one read are told in one message, each in the order given, the digest once under them', () => {
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
});

test('readDelivered comes to one message for a read with a wake, and to none for a read without, its routine lines folded and the cursor moved', async (t) => {
  await t.test(
    'a read with a wake comes to one message: every wake line, then the digest and every routine line of the read, emptied after',
    () => {
      const now: Instant = { at: 2_000_000, mono: { boot: 'b', ms: 1 } };
      const since: Instant = { at: 1_000_000, mono: { boot: 'b', ms: 0 } };
      const folded: FeedLine = { at: '2026-10-05T11:50:00.000Z', run: 'r-2', step: 'build', word: 'running' };
      const before: FeedLine = { at: '2026-10-05T11:58:00.000Z', run: 'r-2', step: 'build', word: 'verified ✓' };
      const after: FeedLine = { at: '2026-10-05T12:01:00.000Z', run: 'r-3', step: 'build', word: 'running' };
      const read = readDelivered({ cursor: 10, digest: [folded], since }, [before, ...GATE, after], DEFAULT, 99, now);
      assert.equal(read.message, messageOf(GATE, [folded, before, after]));
      assert.equal(read.wakes, 2);
      assert.deepEqual(read.next, { cursor: 99, digest: [] });
    },
  );
  await t.test(
    'a read with no wake is told nothing: its routine lines folded, the digest begun now where it was empty, the cursor moved',
    () => {
      const now: Instant = { at: 2_000_000, mono: { boot: 'b', ms: 1 } };
      const since: Instant = { at: 1_000_000, mono: { boot: 'b', ms: 0 } };
      const r1: FeedLine = { at: AT, run: 'r-2', step: 'build', word: 'running' };
      const r2: FeedLine = { at: AT, run: 'r-2', step: 'build', word: 'verified ✓' };
      assert.deepEqual(readDelivered({ cursor: 10, digest: [] }, [r1, r2], DEFAULT, 50, now), {
        wakes: 0,
        next: { cursor: 50, digest: [r1, r2], since: now },
      });
      assert.deepEqual(readDelivered({ cursor: 10, digest: [r1], since }, [r2], DEFAULT, 50, now), {
        wakes: 0,
        next: { cursor: 50, digest: [r1, r2], since },
      });
      assert.deepEqual(readDelivered({ cursor: 10, digest: [r1], since }, [], DEFAULT, 50, now), {
        wakes: 0,
        next: { cursor: 50, digest: [r1], since },
      });
      assert.deepEqual(readDelivered({ cursor: 10, digest: [] }, [], DEFAULT, 50, now), { wakes: 0, next: { cursor: 50, digest: [] } });
      assert.deepEqual(
        readDelivered({ cursor: 10, digest: [] }, [r1, r2], parseSelectors(['reason=ToolDenied']), 50, now),
        { wakes: 0, next: { cursor: 50, digest: [r1, r2], since: now } },
        'a read whose lines no selector takes says nothing and leaves the cursor past them: the bookmark with no say',
      );
    },
  );
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

test("REFUSED: a subscription whose name is no file name, a selector the feed's grammar refuses, or minutes not above zero", () => {
  assert.equal(subscribeRefusalOf({ name: 'nemia', selectors: [...DEFAULT_SELECTORS], digestEvery: 60 }), undefined);
  for (const name of ['', '../x', 'a b', 'x.state', '-x'])
    assert.match(subscribeRefusalOf({ name, selectors: [] }) ?? '', /is no subscription's name/, JSON.stringify(name));
  assert.match(subscribeRefusalOf({ name: 'n', selectors: ['waits=person', 'message=boom'] }) ?? '', /is no key of a feed line/);
  assert.match(subscribeRefusalOf({ name: 'n', selectors: [' '] }) ?? '', /is no selector: it holds no clause/);
  for (const digestEvery of [0, -1, Number.NaN])
    assert.match(
      subscribeRefusalOf({ name: 'n', selectors: [...DEFAULT_SELECTORS], digestEvery }) ?? '',
      /^--digest-every takes the minutes/,
      String(digestEvery),
    );
});

test('a silent watch bookmarks its cursor under --json and prints nothing of it in words', () => {
  assert.equal(bookmarkLine(1834, { json: true }), '{"cursor":1834}');
  assert.deepEqual(JSON.parse(bookmarkLine(1834, { json: true })!), { cursor: 1834 });
  assert.equal(Object.hasOwn(JSON.parse(bookmarkLine(0, { json: true })!), 'word'), false, 'a reader that filters on the words skips it');
  assert.equal(bookmarkLine(1834, {}), undefined, 'in words, a person reading a still feed is told nothing');
  assert.equal(BOOKMARK_EVERY, '30 seconds', 'one cadence, every surface reading this constant');
});
