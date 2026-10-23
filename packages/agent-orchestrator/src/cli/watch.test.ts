/**
 * `nemia watch`'s own lines: the store's liveness said once as it falls and once as it comes back (`livenessLines`), read off a lease
 * the test scripts; what `-l waits=person` takes, in place of the retired `--wake`, and what `--json` prints of a line; every refusal of
 * what was typed, by name, before a line is read — the retired flags (`retiredWakeRefusal`), a malformed selector, a cursor beside a
 * cursor file, a cursor file in no directory or holding no number; `--json`, the feed's lines with their cursor on stdout and the
 * watch's own words on stderr (`watchPrinted`); the lines a `-l` selector takes, with the cursor file that reaches the feed's end
 * whatever it drops; and the bookmark a silent watch says at its cadence, the clock steered. `nemia watch` over a run's feed, `--once`,
 * its selectors, its cursor file and a feed cut under it, is `test/run-feed.test.ts`'s.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Fiber, Stream } from 'effect';
import { livenessWords, type DaemonFile, type DaemonStanding } from '../daemon/daemon.ts';
import { startedLine, upgraded, type FeedLine } from '../feed/index.ts';
import { watchedLine, type Watched } from '../subscription/index.ts';
import { parseSelectors, selects } from '../watch/selector.ts';
import { testPlace } from '../../place/memory/index.ts';
import { testEngine, bell, until, WAITED } from 'agent-runtime/testing';
import { steeredClock } from '../../test/steered.ts';
import { scratch } from '../../test/scratch.ts';
import { eachTest } from '../../test/placed.ts';
import { names } from '../../test/assessed.ts';
import { heldUnasked } from '../../test/unasked.ts';

const ROOT = scratch('wf-watch-');
process.env.WF_ROOT = ROOT;
const FEED = path.join(ROOT, 'feed.jsonl');
const { livenessLines, main, watching, watchPrinted } = await import('./main.ts');
const { RAN } = await import('../command/runs.verb.ts');
const { parseArgv } = await import('../command/command.ts');
const { engineOf } = await import('../runtime-client.ts');

const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
heldUnasked(engine);

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

test('livenessLines says the store down once as its daemon falls silent and up once as it ticks again, at once where it starts down', async (t) => {
  await t.test('the watch says the store down once when its daemon goes silent, and up once when it ticks again', async () => {
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
  await t.test('a watch started while the store is down says so at once', async () => {
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

/** `nemia watch`'s spec, where the retired flags are refused by name. */
const WATCH = RAN.find((r) => r.name === 'watch')!;

test('what a watch takes and prints of a line: `-l waits=person` in place of the retired wake words, and `--json` the line whole', async (t) => {
  await t.test('`-l waits=person` keeps the lines that wait on a person, and none of the routine; with no -l, every line', () => {
    const kept = (selectors: readonly string[]) => [...WAKES, ...ROUTINE].filter((l) => selects(parseSelectors(selectors), l));
    assert.deepEqual(kept(['waits=person']), WAKES);
    assert.deepEqual(kept(['kind=Daemon']), [ROUTINE[3]], 'another selector names other lines');
    assert.deepEqual(kept(['waits=person', 'kind=Daemon']), [...WAKES, ROUTINE[3]], 'or beside it, as -l given again');
    assert.equal(selects(parseSelectors(['waits=person']), ROUTINE[4]), false, 'a tool denial waits on nobody, as it is today');
    assert.deepEqual(kept([]), [...WAKES, ...ROUTINE], 'with none, every line');
  });
  await t.test('`--json` prints a line of the feed whole, with the cursor just after it; without, in words', () => {
    const daemon = ROUTINE[3];
    assert.deepEqual(JSON.parse(watchedLine(daemon, 412, { json: true })), { ...daemon, cursor: 412 });
    assert.deepEqual(JSON.parse(watchedLine(WAKES[0], 90, { json: true })), { ...WAKES[0], cursor: 90 });
    assert.equal(watchedLine(WAKES[0], 90, {}), '12:00:00  r-1  build  awaiting approval', 'and the words a person reads do not move');
    assert.equal(WAKES[0].reason, 'AwaitingApproval', 'the line printed whole is a signed one');
  });
});

/** What `nemia <argv>` was refused with, at exit 2. */
const refused = async (argv: string[]): Promise<string> => {
  try {
    await main(argv, engineOf(engine().layer), undefined, stand().place);
  } catch (err) {
    assert.equal((err as { exitCode?: number }).exitCode, 2, (err as Error).message);
    return (err as Error).message;
  }
  return assert.fail(`nemia ${argv.join(' ')} was taken`);
};

test('REFUSED: nemia watch refuses what was typed, by name, before a line is read', async (t) => {
  await t.test('REFUSED: each flag retired with the wake words, by name, naming the selector to type', () => {
    for (const argv of [['--wake'], ['--wake-word', 'failed'], ['--wake=1'], ['--wake-word=failed']]) {
      const said = (() => {
        try {
          parseArgv(WATCH.spec, argv);
        } catch (err) {
          assert.equal((err as { exitCode?: number }).exitCode, 2, String(err));
          return (err as Error).message;
        }
        return assert.fail(`${argv.join(' ')} was not refused`);
      })();
      assert.match(said, /^nemia watch no longer takes --wake/, argv.join(' '));
      assert.match(said, /-l waits=person/);
    }
    assert.ok(parseArgv(WATCH.spec, ['-l', 'waits=person']), 'and the selector it names reads');
  });
  await t.test(
    'a malformed selector, a cursor beside a cursor file, a cursor file in no directory, a flag it does not take',
    async (sub) => {
      fs.writeFileSync(FEED, `${JSON.stringify(line('running'))}\n`);
      const end = fs.statSync(FEED).size;
      const log = sub.mock.method(console, 'log', () => {});
      names(await refused(['watch', '--once', '-l', 'message=hi']), '"message" is no key of a feed line');
      names(await refused(['watch', '-l', 'factory==nemia']), '"factory==nemia"', '==');
      names(await refused(['watch', '--once', '-l', 'factory in nemia']), 'no (values) after in');
      names(await refused(['watch', '--once', '-l', '']), '"" is no selector');
      names(await refused(['watch', String(end), '--cursor-file', path.join(ROOT, 'x.cursor')]), 'a cursor or --cursor-file, not both');
      names(await refused(['watch', '--once', '--cursor-file', path.join(ROOT, 'nope', 'x.cursor')]), path.join(ROOT, 'nope'), 'make it');
      names(await refused(['watch', '--once', '-L']), 'nemia watch does not take -L', 'nemia watch [cursor]');
      assert.equal(log.mock.callCount(), 0, 'nothing was printed: each was refused before a line was read');
    },
  );
  await t.test('a cursor file that holds no whole number, named, and the feed never read from its start instead', async (sub) => {
    const file = path.join(ROOT, 'junk.cursor');
    fs.writeFileSync(file, 'nineteen\n');
    const log = sub.mock.method(console, 'log', () => {});
    names(await refused(['watch', '--once', '--cursor-file', file]), file, 'is no cursor file', '"nineteen"');
    assert.equal(log.mock.callCount(), 0);
  });
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
    const watch = watchPrinted(0, { json: true }, { selectors: parseSelectors(['waits=person']) });
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
  '`nemia watch` says the store’s liveness beside the feed, whatever its selectors: down after its banner, as JSON with --json (its selectors no matter)',
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
    const words = await lines({});
    assert.equal(words.out[0], 'watching from 0, ^C to stop');
    assert.match(words.out[1] ?? '', /^\d\d:\d\d:\d\d {2}daemon down {2}· daemon: /);
    assert.ok(words.out[1]?.includes('none has held this store'), words.out[1]);
    const json = await lines({ json: true });
    assert.deepEqual(json.err, ['watching from 0, ^C to stop']);
    assert.deepEqual(Object.keys(JSON.parse(json.out[0] ?? '{}')), ['liveness', 'at', 'note']);
    assert.equal(JSON.parse(json.out[0]).liveness, 'down');
  },
);

/** The cursor a watch's file holds, or undefined while it has written none. */
const kept = (file: string): number | undefined => (fs.existsSync(file) ? Number(fs.readFileSync(file, 'utf8').trim()) : undefined);

test(
  'a filtered watch prints the lines its selector takes alone, and its cursor file reaches the feed’s end all the same',
  WAITED,
  async (t) => {
    fs.writeFileSync(FEED, '');
    const file = path.join(ROOT, 'filtered.cursor');
    fs.rmSync(file, { force: true });
    const out: string[] = [];
    const wrote = bell();
    t.mock.method(console, 'log', (...a: unknown[]) => {
      out.push(a.join(' '));
      wrote.ring();
    });
    t.mock.method(console, 'error', () => {});
    const ada = upgraded({ at: AT, run: 'r-1', step: 'implement', word: 'running', labels: { run: 'r-1', agent: 'ada' } });
    const agora = upgraded({ at: AT, run: 'r-2', step: 'review', word: 'running', labels: { run: 'r-2', agent: 'agora' } });
    const watch = watchPrinted(0, {}, { selectors: parseSelectors(['agent=ada']), cursorFile: file });
    try {
      const text = [agora, ada, agora].map((l) => `${JSON.stringify(l)}\n`).join('');
      fs.appendFileSync(FEED, text);
      const end = Buffer.byteLength(text);
      await until(t, () => kept(file) === end, 'the cursor file at the feed’s end', { bell: wrote, everyMs: 20 });
      assert.deepEqual(out.slice(1), ['12:00:00  r-1  implement  running'], 'the lines its selector takes alone, after the banner');
      assert.equal(watch.at(), end, 'and the watch holds the feed’s end, not the last line it printed');
      fs.writeFileSync(FEED, '');
      await until(t, () => kept(file) === 0, 'the cursor file rewritten on the cut', { bell: wrote, everyMs: 20 });
    } finally {
      watch.stop();
    }
  },
);

test('a watch that has fallen silent bookmarks its cursor at its cadence, and writes it', WAITED, async (t) => {
  const text = `${JSON.stringify(upgraded({ at: AT, run: 'r-9', word: 'running' }))}\n`;
  fs.writeFileSync(FEED, text);
  const end = Buffer.byteLength(text);
  const file = path.join(ROOT, 'bookmark.cursor');
  fs.rmSync(file, { force: true });
  const out: string[] = [];
  const wrote = bell();
  t.mock.method(console, 'log', (...a: unknown[]) => {
    out.push(a.join(' '));
    wrote.ring();
  });
  t.mock.method(console, 'error', () => {});
  const steered = steeredClock();
  const fiber = Effect.runFork(
    watching(0, { json: true }, () => ({ kind: 'none' }), { selectors: parseSelectors(['reason=Failed']), cursorFile: file }).pipe(
      Effect.provide(steered.layer),
    ),
  );
  try {
    await until(t, () => steered.asked.includes(30_000), 'the bookmark’s rest asked', { bell: steered.bell });
    await steered.adjust('29999 millis');
    assert.equal(
      out.some((l) => l.includes('"cursor"')),
      false,
      'a millisecond before its cadence, no bookmark',
    );
    await steered.adjust('1 millis');
    await until(t, () => out.some((l) => l.includes('"cursor"')), 'the bookmark printed', { bell: wrote });
    assert.deepEqual(
      JSON.parse(out.find((l) => l.includes('"cursor"'))!),
      { cursor: end },
      'the cursor the watch read to, and nothing else',
    );
    assert.equal(kept(file), end, 'and written to its file');
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber));
  }
});
