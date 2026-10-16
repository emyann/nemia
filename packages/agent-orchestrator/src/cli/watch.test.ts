/**
 * `nemia watch`'s own lines: the store's liveness said once as it falls and once as it comes back (`livenessLines`), read off a lease
 * the test scripts; the lines kept by `--wake` and `--wake-word` (`wakeOf`, `watchedLine`); and `--json`, the feed's lines with their
 * cursor on stdout and the watch's own words on stderr (`watchPrinted`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Fiber, Stream } from 'effect';
import { livenessWords, type DaemonFile, type DaemonStanding } from '../daemon/daemon.ts';
import { startedLine, upgraded, type FeedLine } from '../feed/index.ts';
import { wakeOf, watchedLine, type Watched } from '../subscription/subscription.ts';
import { scratch } from '../../test/scratch.ts';
import { bell, until, WAITED } from '../../test/waits.ts';

const ROOT = scratch('wf-watch-');
process.env.WF_ROOT = ROOT;
const FEED = path.join(ROOT, 'feed.jsonl');
const { livenessLines, watching, watchPrinted } = await import('./main.ts');

const NOW = Date.parse('2026-10-07T12:00:00.000Z');
const AT = new Date(NOW).toISOString();

/** The lease of pid 4242 as `kind`, its pid confirmed. */
const standing = (kind: 'ticking' | 'stalled'): DaemonStanding => {
  const file: DaemonFile = { pid: 4242, by: 'api', startedAt: AT, cwd: '/srv/nemia', every: 4000, passedAt: AT };
  return { kind, file, last: NOW, quiet: kind === 'ticking' ? 1_000 : 3_600_000, identity: 'same' };
};

/** A lease read as `kinds` say, one a reading, then as the last of them; how many times it was read; and its end, four readings after. */
function scripted(kinds: readonly ('ticking' | 'stalled' | 'none')[]) {
  let read = 0;
  let spent = () => {};
  const end = new Promise<void>((resolve) => (spent = resolve));
  const lease = (): DaemonStanding => {
    if (++read >= kinds.length + 4) spent();
    const kind = kinds[Math.min(read - 1, kinds.length - 1)];
    return kind === 'none' ? { kind } : standing(kind);
  };
  return { lease, reads: () => read, end };
}

/** The first `n` lines `livenessLines` says of `lease`, polled as fast as the stream goes, or those it said before the lease's end. */
const said = (lease: ReturnType<typeof scripted>, n: number) =>
  Effect.runPromise(
    Stream.runCollect(
      Stream.take(
        livenessLines(lease.lease, '1 millis', () => NOW),
        n,
      ).pipe(Stream.interruptWhen(Effect.promise(() => lease.end))),
    ),
  );

test('the watch says the store down once when its daemon goes silent, and up once when it ticks again', async () => {
  const lease = scripted(['ticking', 'ticking', 'stalled', 'stalled', 'stalled', 'ticking', 'ticking']);
  const lines = await said(lease, 2);
  assert.deepEqual(
    lines.map((l) => l.state),
    ['down', 'up'],
  );
  assert.equal(lease.reads(), 6, 'the store read up twice, down three times, and up once more: the two up at the start say nothing');
  assert.match(lines[0].text, /^api: stalled, pid 4242/);
  assert.match(lines[1].text, /^api: ticking, pid 4242/);
  assert.equal(lines[0].at, AT);
  assert.equal(livenessWords(lines[0]), `12:00:00  daemon down  · ${lines[0].text}`);
  assert.deepEqual(JSON.parse(livenessWords(lines[1], true)), { liveness: 'up', at: AT, note: lines[1].text });
});

test('a watch started while the store is down says so at once', async () => {
  const lines = await said(scripted(['stalled', 'ticking']), 2);
  assert.deepEqual(
    lines.map((l) => l.state),
    ['down', 'up'],
  );
  const none = await said(scripted(['none']), 1);
  assert.deepEqual(
    none.map((l) => l.state),
    ['down'],
  );
  assert.match(none[0].text, /^daemon: none has held this store — nothing ticks it/);
});

/** A run's line of the feed, signed as the tick signs one (`upgraded`), its word and note as given. */
const line = (word: string, note?: string): FeedLine => upgraded({ at: AT, run: 'r-1', step: 'build', word, ...(note ? { note } : {}) });

const WAKES: FeedLine[] = [
  line('awaiting approval'),
  line('rounds exhausted'),
  line('needs-human'),
  line('blocked'),
  line('failed'),
  line('running', 'waiting on you: approve the plan'),
  line('done', 'needs: a key for the registry'),
];
const ROUTINE: FeedLine[] = [
  line('running'),
  line('done', 'landed on main'),
  line('running', 'cost $1.20 · landing'),
  startedLine(5151, { kind: 'none' }, AT, NOW),
  line('denied: Bash(git push)', 'try 1'),
];

test('`--wake` keeps the lines that wait on a person, each default word among them, and none of the routine', () => {
  const kept = (wake: readonly string[] | undefined) => [...WAKES, ...ROUTINE].filter((l) => watchedLine(l, 0, { wake }) !== undefined);
  assert.deepEqual(kept(wakeOf({ wake: true })), WAKES);
  assert.deepEqual(kept(wakeOf({ wakeWord: ['landing'] })), [ROUTINE[2]], '--wake-word names the words instead');
  assert.deepEqual(kept(wakeOf({ wake: true, wakeWord: ['daemon started'] })), [...WAKES, ROUTINE[3]], 'or beside the default');
  assert.equal(watchedLine(ROUTINE[4], 0, { wake: wakeOf({ wake: true }) }), undefined, 'a tool denial is routine, as it is today');
  assert.equal(wakeOf({}), undefined);
  assert.deepEqual(kept(undefined), [...WAKES, ...ROUTINE], 'with neither, every line');
});

test('`--json` prints a line of the feed whole, with the cursor just after it; without, in words', () => {
  const daemon = ROUTINE[3];
  assert.deepEqual(JSON.parse(watchedLine(daemon, 412, { json: true })!), { ...daemon, cursor: 412 });
  assert.deepEqual(JSON.parse(watchedLine(WAKES[0], 90, { json: true })!), { ...WAKES[0], cursor: 90 });
  assert.equal(watchedLine(WAKES[0], 90, {}), '12:00:00  r-1  build  awaiting approval', 'and the words a person reads do not move');
  assert.equal(WAKES[0].reason, 'AwaitingApproval', 'the line printed whole is a signed one');
});

test(
  '`nemia watch --json` prints only JSON on stdout, the feed’s lines as they come with their cursors, and its banner on stderr',
  WAITED,
  async (t) => {
    fs.writeFileSync(FEED, '');
    const out: string[] = [];
    const err: string[] = [];
    const printed = bell();
    t.mock.method(console, 'log', (...a: unknown[]) => {
      out.push(a.join(' '));
      printed.ring();
    });
    t.mock.method(console, 'error', (...a: unknown[]) => err.push(a.join(' ')));
    const watch = watchPrinted(0, { json: true, wake: wakeOf({ wake: true }) });
    try {
      assert.deepEqual(err, ['watching from 0, ^C to stop']);
      const text = [ROUTINE[0], WAKES[0]].map((l) => `${JSON.stringify(l)}\n`).join('');
      fs.appendFileSync(FEED, text);
      await until(t, () => out.length > 0, 'the wake line printed', { bell: printed });
      assert.deepEqual(
        out.map((o) => JSON.parse(o)),
        [{ ...WAKES[0], cursor: Buffer.byteLength(text) }],
      );
    } finally {
      watch.stop();
    }
  },
);

test(
  '`nemia watch` says the store’s liveness beside the feed, whatever its wake words: down after its banner, as JSON with --json',
  WAITED,
  async (t) => {
    fs.writeFileSync(FEED, '');
    const out: string[] = [];
    const err: string[] = [];
    const printed = bell();
    for (const [method, to] of [
      ['log', out],
      ['error', err],
    ] as const)
      t.mock.method(console, method, (...a: unknown[]) => {
        to.push(a.join(' '));
        printed.ring();
      });
    const lines = async (how: Watched) => {
      out.length = 0;
      err.length = 0;
      const fiber = Effect.runFork(watching(0, how, () => ({ kind: 'none' })));
      try {
        await until(t, () => out.length + err.length === 2, 'the banner and the liveness', { bell: printed });
      } finally {
        await Effect.runPromise(Fiber.interrupt(fiber));
      }
      return { out: [...out], err: [...err] };
    };
    const words = await lines({ wake: ['failed'] });
    assert.equal(words.out[0], 'watching from 0, ^C to stop');
    assert.match(words.out[1] ?? '', /^\d\d:\d\d:\d\d {2}daemon down {2}· daemon: none has held this store/);
    const json = await lines({ json: true });
    assert.deepEqual(json.err, ['watching from 0, ^C to stop']);
    assert.deepEqual(Object.keys(JSON.parse(json.out[0] ?? '{}')), ['liveness', 'at', 'note']);
    assert.equal(JSON.parse(json.out[0]).liveness, 'down');
  },
);
