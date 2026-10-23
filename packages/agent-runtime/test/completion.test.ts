/**
 * What "done" means for Claude Code, tested without Claude Code: `claudeOps` translates what `claude agents` lists into A2A's
 * states, with an injected clock and an injected transcript, and leaves the judgement to the engine. `observe` shells out to
 * `claude`, so each test puts a fake one on PATH that prints the registry it is given.
 *
 * Facts about Claude Code these tests hold the runner to:
 * - a tool call that runs for minutes leaves the transcript untouched for as long, while the registry lists the session busy;
 * - a closeout read is a full read of a transcript that runs to tens of megabytes, where its mtime is cheap: the runner reads
 *   it once per write of the transcript, never once per pass;
 * - `--tools`, `--disallowedTools` and `--allowedTools` are variadic, and `--remote-control` and `--worktree` take an optional
 *   value: each would take the prompt after it, so a flag always follows them and the prompt comes last;
 * - a list of rules joined by commas is one rule per item: `--allowedTools "Write(**),Edit(**)"` allows both.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import { claudeOps, type ClaudeOptions, QUIESCENT_AFTER_MS, type Statement } from '../src/harness/claude/bg.ts';
import { quietFileOf, sightingOf } from '../src/harness/claude/quiet.ts';
import { lastStructuredOutput } from '../src/harness/claude/transcript.ts';
import { Engine } from '../src/index.ts';
import { Journal } from '../src/core/engine/journal.ts';
import type { Event } from '../src/core/domain.ts';
import type { SpawnRequest } from '../src/harness/seam.ts';

import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import { warned } from './warned.ts';
import { builtEngine } from './engine.ts';
import { story } from './checkpoints.ts';

/** The boot the runners these tests make read their monotonic clock under. */
const BOOT = 'boot-1';
const Q = QUIESCENT_AFTER_MS;

/** A row of a table: its name, and what it holds. */
type Row = { name: string; holds: () => Promise<void> | void };

/**
 * Claude Code's `--bg` runner over a scratch root, whose monotonic clock, when the test gives it a wall clock (`now`) and no
 * monotonic one (`mono`), reads the same as the wall clock: a machine whose two clocks agree.
 */
const bgOps = (o: Omit<ClaudeOptions, 'root'> & { root?: string } = {}) => {
  const now = o.now;
  return claudeOps({
    ...(now ? { mono: () => ({ boot: BOOT, ms: now() }) } : {}),
    sessionsDir: scratch('ae-bg-sessions-'),
    ...o,
    root: o.root ?? scratch('ae-bg-'),
  });
};

/** A runner under `root` that first saw the transcript of the session under `name` at `mtimeMs` when the monotonic clock read `ms`. */
const seenSince = (root: string, name: string, mtimeMs: number, ms: number) =>
  sightingOf(quietFileOf(root, name), mtimeMs, { boot: BOOT, ms });

/** Puts a fake `claude` on PATH whose `agents` prints `json`; answers what takes it off. */
const withFakeClaude = (json: string) => {
  const dir = scratch('fake-claude-');
  fs.writeFileSync(path.join(dir, 'claude'), `#!/bin/sh\ncat <<'JSON'\n${json}\nJSON\n`, { mode: 0o755 });
  const prev = process.env.PATH;
  process.env.PATH = `${dir}:${prev}`;
  return () => {
    process.env.PATH = prev;
  };
};

/** Runs `body` with a fake `claude` on PATH that prints `json`, and takes it off after. */
const listing = async <T>(json: string, body: () => Promise<T>): Promise<T> => {
  const restore = withFakeClaude(json);
  try {
    return await body();
  } finally {
    restore();
  }
};

/** The session `ae/t-1/1` (`s-1`), listed `state` and `status`, from `startedAt` where it is given. */
const rowStarted = (state: string, status: string, startedAt?: number) =>
  JSON.stringify([
    {
      name: 'ae/t-1/1',
      sessionId: 's-1',
      state,
      status,
      kind: 'background',
      ...(startedAt !== undefined ? { startedAt } : {}),
    },
  ]);

/** The session `ae/t-1/1`, listed `state` and `status`, with no start. */
const row = (state: string, status: string) => rowStarted(state, status);

const STARTED = 1_789_000_000_000;

/** What a look of `ops` reports of the session `ae/t-1/1`. */
const lookOf = async (ops: ReturnType<typeof bgOps>) => (await Effect.runPromise(ops.observe)).get('ae/t-1/1');

test('a background session works busy, falls quiet once its own closeout is its last word, reports what it said while idle or blocked, and is completed at its word — its transcript read once per write of it', async (t) => {
  const s = story(t);
  const dir = scratch('fake-claude-');
  const rows = path.join(dir, 'rows.json');
  fs.writeFileSync(path.join(dir, 'claude'), `#!/bin/sh\ncat '${rows}'\n`, { mode: 0o755 });
  const prev = process.env.PATH;
  process.env.PATH = `${dir}:${prev}`;
  t.after(() => {
    process.env.PATH = prev;
  });
  const list = (state: string, status: string, name = 'ae/t-1/1') =>
    fs.writeFileSync(rows, JSON.stringify([{ name, sessionId: 's-1', state, status, kind: 'background', startedAt: STARTED }]));
  const clock: { t: number; written: number; said: Statement | undefined; turns: number } = {
    t: STARTED,
    written: STARTED,
    said: { payload: { outcome: 'done' }, at: STARTED, lastWord: true },
    turns: 4,
  };
  const reads = { closeout: 0, usage: 0 };
  const ops = bgOps({
    now: () => clock.t,
    transcriptTime: async () => clock.written,
    closeoutFrom: async () => {
      reads.closeout++;
      return clock.said;
    },
    usageFrom: async () => {
      reads.usage++;
      return { turns: clock.turns };
    },
  });
  const look = (name = 'ae/t-1/1') => Effect.runPromise(ops.observe).then((seen) => seen.get(name));

  await s.test('busy and writing, it is working however long it lasts, never quiet, and costs its mtime and nothing more', async () => {
    list('working', 'busy');
    for (let i = 0; i < 3; i++) {
      const seen = await look();
      assert.equal(seen?.state, 'working');
      assert.equal(seen?.busy, true);
      assert.equal(seen?.quietMs, undefined, 'busy and writing is never quiet');
      assert.equal(seen?.closeout, undefined);
      assert.equal(seen?.usage, undefined);
      clock.t += 10 * Q;
      clock.written = clock.t;
    }
    assert.deepEqual(reads, { closeout: 0, usage: 0 }, 'a busy session that just wrote costs its mtime and nothing more');
  });

  await s.test(
    'busy over a cold transcript, it is read once for a statement that is not its last word, stays working, and is read again only once the transcript grows — never for its usage',
    async () => {
      clock.said = { payload: { outcome: 'done' }, at: clock.written, lastWord: false };
      await look();
      clock.t += Q;
      for (let i = 0; i < 3; i++) {
        const seen = await look();
        assert.equal(seen?.quietMs, undefined);
        assert.equal(seen?.closeout, undefined, 'nothing it has said is final while its process works');
        clock.t += 1_000;
      }
      assert.equal(reads.closeout, 1, 'three passes over a transcript nothing has written: one read');
      clock.written = clock.t;
      await look();
      assert.equal(reads.closeout, 1, 'written just now: working, and not read');
      clock.t += Q;
      await look();
      assert.equal(reads.closeout, 2, 'written since the read: read again');
      assert.equal(reads.usage, 0, 'a busy session is not read for usage — nothing it has consumed is final');
    },
  );

  await s.test(
    'busy, its own closeout its last word and its transcript cold for the floor, it is QUIET with its statement and its final usage, and still busy',
    async () => {
      clock.written = clock.t;
      clock.said = { payload: { outcome: 'done' }, at: clock.written, lastWord: true };
      await look();
      clock.t += Q;
      const seen = await look();
      assert.equal(seen?.quietMs, Q, 'quiet since its closeout');
      assert.deepEqual(seen?.closeout, { payload: { outcome: 'done' }, at: clock.written }, 'with the statement, for the engine to judge');
      assert.equal(seen?.state, 'working', 'reported, not concluded');
      assert.equal(seen?.busy, true, 'and still busy: that is a fact about its process, not about the work');
      assert.deepEqual(seen?.usage, { turns: 4 }, 'over, so what it consumed is final too');
    },
  );

  await s.test(
    "idle, it is reported quiet only once its transcript is cold for the floor — a write pushes it out — and stays working: what quiet means is the engine's",
    async () => {
      list('working', 'idle');
      clock.said = undefined;
      clock.written = clock.t;
      assert.equal((await look())?.quietMs, undefined, 'it just spoke');
      clock.t += Q - 1;
      assert.equal((await look())?.quietMs, undefined, 'one millisecond short');
      clock.written = clock.t;
      assert.equal((await look())?.quietMs, undefined, '`working` also means between steps of work it drives on its own: it wrote');
      clock.t += Q - 1;
      assert.equal((await look())?.quietMs, undefined, 'deadline moved with it');
      clock.t += 1;
      const seen = await look();
      assert.equal(seen?.quietMs, Q, 'quiet again, and now past it');
      assert.equal(seen?.state, 'working', 'reported, not concluded: a task that asked for a statement and got none has not finished');
    },
  );

  await s.test(
    'idle across many looks over an unchanged transcript it is read once, and a turn that writes it is seen on the next look — its statement and the usage that turn changed — reported, not acted on',
    async () => {
      const before = { ...reads };
      for (let i = 0; i < 10; i++) {
        const seen = await look();
        assert.deepEqual({ said: seen?.closeout, turns: seen?.usage?.turns }, { said: undefined, turns: 4 }, `look ${i + 1}`);
        clock.t += 1_000;
      }
      assert.deepEqual(reads, before, 'ten looks over a transcript nothing wrote: no read');
      clock.written = clock.t;
      clock.said = { payload: 7, at: clock.written };
      clock.turns = 5;
      clock.t += 5_000;
      const seen = await look();
      assert.deepEqual(seen?.closeout, { payload: 7, at: clock.written }, 'a turn wrote the transcript: read again');
      assert.deepEqual(seen?.usage, { turns: 5 }, 'and the usage with it');
      assert.equal(seen?.state, 'working', 'reported, not acted on — whose it is, the engine decides');
      assert.deepEqual(reads, { closeout: before.closeout + 1, usage: before.usage + 1 });
    },
  );

  await s.test(
    'blocked and idle, it reports what it said and stays blocked, read no more while unchanged, and never quiet however long',
    async () => {
      list('blocked', 'idle');
      const first = await look();
      assert.deepEqual(
        first?.closeout,
        { payload: 7, at: clock.written },
        'Claude Code lists a session that gave its closeout and ended its turn as blocked and idle: the engine ends that attempt only if it is handed the statement',
      );
      assert.equal(first?.state, 'input-required');
      assert.deepEqual(first?.usage, { turns: 5 }, 'a blocked session reports its usage too');
      const before = { ...reads };
      for (let i = 0; i < 10; i++) {
        clock.t += 1_000;
        const seen = await look();
        assert.deepEqual(
          { said: seen?.closeout, usage: seen?.usage },
          { said: { payload: 7, at: clock.written }, usage: { turns: 5 } },
          `look ${i + 1}`,
        );
      }
      assert.deepEqual(reads, before, 'ten looks over a transcript nothing wrote: no read');
      clock.t += 10 * Q;
      const seen = await look();
      assert.equal(seen?.state, 'input-required');
      assert.equal(seen?.quietMs, undefined, 'a session waiting on a person is never quiet');
    },
  );

  await s.test(
    'listed done, it is completed at its word, read once while its transcript is unchanged, and again once it is written',
    async () => {
      list('done', 'idle');
      assert.equal((await look())?.state, 'completed', 'taken at its word, immediately');
      const before = reads.closeout;
      await look();
      await look();
      assert.equal(reads.closeout, before, 'its transcript is older than the read');
      clock.t += 1_000;
      clock.written = clock.t;
      await look();
      assert.equal(reads.closeout, before + 1, 'written since the read: read again');
    },
  );

  await s.test('resumed under a new attempt’s name, the same session is read again, however old its transcript', async () => {
    const before = reads.closeout;
    clock.written = 0;
    list('done', 'idle', 'ae/t-1/2');
    assert.equal((await look('ae/t-1/2'))?.state, 'completed');
    assert.equal(reads.closeout, before + 1, "`--resume` keeps the session's id: under a new attempt's name it is read again");
  });
});

const busyRow = rowStarted('working', 'busy', STARTED);

/**
 * A busy session observed `after` its start, whose transcript was last written `written`, seen so by the runner since it was, and
 * holds `said`. A session that signed off with StructuredOutput and left a background shell running is listed busy for as long as
 * the shell runs; its own closeout as the last word in the conversation, and a transcript cold for the window, tell it from a
 * session in a long turn.
 */
const heldSession = (after: number, written: number, said: Statement | undefined, listed = busyRow) =>
  listing(listed, async () => {
    let asked = 0;
    const root = scratch('ae-bg-');
    seenSince(root, 'ae/t-1/1', written, written);
    const ops = bgOps({
      root,
      now: () => STARTED + after,
      transcriptTime: async () => written,
      closeoutFrom: async () => {
        asked++;
        return said;
      },
      usageFrom: async () => ({ turns: 4 }),
    });
    return { seen: await lookOf(ops), asked };
  });

const BUSY: Row[] = [
  {
    name: 'its own closeout the last word, its transcript cold for the window: QUIET, with its statement and its final usage, still busy',
    holds: async () => {
      const said = { payload: { outcome: 'done' }, at: STARTED + 10, lastWord: true };
      const { seen } = await heldSession(10 + Q, STARTED + 10, said);
      assert.equal(seen?.quietMs, Q, 'quiet since its closeout');
      assert.deepEqual(seen?.closeout, { payload: { outcome: 'done' }, at: STARTED + 10 }, 'with the statement, for the engine to judge');
      assert.equal(seen?.state, 'working', 'reported, not concluded');
      assert.equal(seen?.busy, true, 'and still busy: that is a fact about its process, not about the work');
      assert.deepEqual(seen?.usage, { turns: 4 }, 'over, so what it consumed is final too');
    },
  },
  {
    name: 'its transcript still advancing: left alone, and not even read for a statement',
    holds: async () => {
      const said = { payload: { outcome: 'done' }, at: STARTED + 10, lastWord: true };
      const { seen, asked } = await heldSession(Q, STARTED + 1, said);
      assert.equal(seen?.quietMs, undefined, 'one millisecond short of the floor: it is working');
      assert.equal(seen?.closeout, undefined);
      assert.equal(asked, 0, 'a busy session that just wrote costs its mtime and nothing more');
    },
  },
  {
    name: 'it has spoken since its closeout: still working — the statement is not its last word',
    holds: async () => {
      const { seen, asked } = await heldSession(10 * Q, STARTED + 10, { payload: { outcome: 'done' }, at: STARTED + 10, lastWord: false });
      assert.equal(seen?.quietMs, undefined);
      assert.equal(seen?.closeout, undefined, 'nothing it has said is final while its process works');
      assert.equal(asked, 1, 'read once the floor was reached, and read for nothing else');
    },
  },
  {
    name: 'no statement at all: left to the deadline, as it always was',
    holds: async () => {
      const { seen } = await heldSession(10 * Q, STARTED + 10, undefined);
      assert.equal(seen?.quietMs, undefined);
    },
  },
  {
    name: 'only the closeout of the session it continues: not quiet, it has said nothing of its own',
    holds: async () => {
      const { seen } = await heldSession(10 * Q, STARTED - 3_600_000, {
        payload: { outcome: 'done' },
        at: STARTED - 3_600_000,
        lastWord: true,
      });
      assert.equal(
        seen?.quietMs,
        undefined,
        "`--resume` keeps the parent's whole conversation, its closing turn last: a continuation's first turn that runs past the floor has just begun",
      );
      assert.equal(seen?.closeout, undefined);
    },
  },
  {
    name: 'no start in the registry: left alone, its conversation could not be told from the one it continues',
    holds: () =>
      listing(row('working', 'busy'), async () => {
        const ops = bgOps({
          now: () => 10 * Q,
          transcriptTime: async () => 0,
          closeoutFrom: async () => ({ payload: { outcome: 'done' }, at: 1, lastWord: true }),
        });
        assert.equal((await lookOf(ops))?.quietMs, undefined);
      }),
  },
  {
    name: 'no start in the registry, busy however long it lasts: running, never quiet, and not even asked for a statement',
    holds: () =>
      listing(row('working', 'busy'), async () => {
        let t = 0;
        let asked = 0;
        const ops = bgOps({
          now: () => t,
          transcriptTime: async () => 1,
          closeoutFrom: async () => {
            asked++;
            return { payload: { outcome: 'done' }, at: 5 };
          },
        });
        assert.equal((await lookOf(ops))?.quietMs, undefined);
        t += 10 * Q;
        const seen = await lookOf(ops);
        assert.equal(seen?.state, 'working');
        assert.equal(seen?.quietMs, undefined, 'busy is never quiet');
        assert.equal(seen?.closeout, undefined);
        assert.equal(asked, 0, 'mid-turn, nothing it has said is final');
      }),
  },
  {
    name: 'a cold transcript is NOT silence while it is busy',
    holds: () =>
      listing(row('working', 'busy'), async () => {
        const ops = bgOps({ now: () => 100 * Q, transcriptTime: async () => 0 });
        assert.equal(
          (await lookOf(ops))?.quietMs,
          undefined,
          'a tool call that runs for minutes writes nothing at all: only `busy` tells it from silence',
        );
      }),
  },
];

test('a busy session: quiet only when its own closeout is its last word and its transcript has been cold for the floor since its start', async (t) => {
  for (const r of BUSY) await t.test(r.name, r.holds);
});

const STARTS: Row[] = [
  {
    name: 'quiet is counted from the later of its last write and its own start: a session resumed over a cold transcript has just begun',
    holds: async () => {
      const started = 10 * Q;
      await listing(
        JSON.stringify([{ name: 'ae/t-1/2', sessionId: 's-1', state: 'working', status: 'idle', kind: 'background', startedAt: started }]),
        async () => {
          let t = started + 1_000;
          const root = scratch('ae-bg-');
          seenSince(root, 'ae/t-1/2', 0, 0);
          const ops = bgOps({
            root,
            now: () => t,
            transcriptTime: async () => 0,
            closeoutFrom: async () => undefined,
            usageFrom: async () => undefined,
          });
          const quiet = async () => (await Effect.runPromise(ops.observe)).get('ae/t-1/2')?.quietMs;
          assert.equal(await quiet(), undefined, 'its transcript is cold, and it started a second ago');
          t = started + Q;
          assert.equal(await quiet(), Q, 'quiet for the window since it started');
        },
      );
    },
  },
  {
    name: 'the verdict does not depend on WHO is asking: a runner that has never seen the session agrees, the sighting being on disk',
    holds: () =>
      listing(row('working', 'idle'), async () => {
        const root = scratch('ae-bg-');
        const at = (t: number) => bgOps({ root, now: () => t, transcriptTime: async () => 0 });
        await lookOf(at(0));
        const first = await lookOf(at(Q));
        const second = await lookOf(at(Q));
        assert.equal(
          first?.quietMs,
          Q,
          'runners are what processes that each tick once are: none keeps the clock between passes, and the sighting is on disk',
        );
        assert.equal(second?.quietMs, Q, 'a runner that has never seen this session agrees');
      }),
  },
  {
    name: 'no transcript, no verdict — no settling on one idle sample',
    holds: () =>
      listing(row('working', 'idle'), async () => {
        const ops = bgOps({ now: () => 100 * Q, transcriptTime: async () => undefined });
        assert.equal((await lookOf(ops))?.quietMs, undefined, 'the deadline handles this one');
      }),
  },
  {
    name: "usage is measured from the session's own start, as the registry records it",
    holds: () =>
      listing(rowStarted('done', 'idle', STARTED), async () => {
        let since: number | undefined;
        const ops = bgOps({
          transcriptTime: async () => 0,
          closeoutFrom: async () => undefined,
          usageFrom: async (_id, from) => {
            since = from;
            return { turns: 2, toolCalls: 1 };
          },
        });
        const seen = await lookOf(ops);
        assert.equal(since, STARTED);
        assert.deepEqual(seen?.usage, { turns: 2, toolCalls: 1 });
      }),
  },
  {
    name: 'no start in the registry, no usage — an inherited conversation could not be told apart, and is not even asked',
    holds: () =>
      listing(rowStarted('done', 'idle'), async () => {
        let asked = 0;
        const ops = bgOps({
          transcriptTime: async () => 0,
          closeoutFrom: async () => undefined,
          usageFrom: async () => {
            asked++;
            return { turns: 9, toolCalls: 9 };
          },
        });
        assert.equal((await lookOf(ops))?.usage, undefined);
        assert.equal(asked, 0, 'not even asked');
      }),
  },
  {
    name: 'a busy session over a cold transcript with a start is not read for usage — nothing it has consumed is final',
    holds: () =>
      listing(rowStarted('working', 'busy', 1), async () => {
        let asked = 0;
        const ops = bgOps({
          transcriptTime: async () => 0,
          usageFrom: async () => {
            asked++;
            return { turns: 1, toolCalls: 0 };
          },
        });
        assert.equal((await lookOf(ops))?.usage, undefined);
        assert.equal(asked, 0);
      }),
  },
];

test("a session's own start: quiet counted from the later of its last write and its start, usage from its start, and no verdict on what cannot be read", async (t) => {
  for (const r of STARTS) await t.test(r.name, r.holds);
});

/** A working, idle session whose runner reads the wall clock at `clock.wall` and the monotonic clock at `clock.mono`, over `root`. */
const quietUnder = (
  clock: { wall: number; mono: number },
  root = scratch('ae-bg-'),
  mono = (): { boot: string; ms: number } | undefined => ({ boot: BOOT, ms: clock.mono }),
) => {
  const ops = bgOps({ root, now: () => clock.wall, mono, transcriptTime: async () => 0 });
  return async () => (await lookOf(ops))?.quietMs;
};

/** A runner over a finished session whose clock is `clock.t`, whose transcript was written `clock.written`, and which says `clock.said`. */
const keptOver = (clock: { t: number; written: number; said: number }) => {
  const reads = { n: 0 };
  const ops = bgOps({
    now: () => clock.t,
    transcriptTime: async () => clock.written,
    closeoutFrom: async () => {
      reads.n++;
      return { payload: clock.said, at: 1 };
    },
  });
  return { reads, said: async () => (await lookOf(ops))?.closeout?.payload };
};

/** The records of a first sighting the floor is counted from anew: none, or one that is not this transcript's on this boot. */
const FIRST_SIGHTINGS: Array<[string, string | undefined]> = [
  ['none', undefined],
  ['another boot', JSON.stringify({ mtimeMs: 0, boot: 'boot-0', ms: 0 })],
  ['another mtime', JSON.stringify({ mtimeMs: 5, boot: BOOT, ms: 0 })],
  ['no decode', JSON.stringify({ mtimeMs: 0, boot: BOOT, ms: 'zero' })],
  ['no JSON', '{half'],
];

const CLOCKS: Row[] = [
  {
    name: 'a wall clock stepped forward does not make a working session quiet: the monotonic clock since the transcript was seen bounds it',
    holds: () =>
      listing(row('working', 'idle'), async () => {
        const clock = { wall: 0, mono: 0 };
        const quiet = quietUnder(clock);
        assert.equal(await quiet(), undefined, 'seen as written');
        clock.wall = 10 * Q;
        clock.mono = 1_000;
        assert.equal(await quiet(), undefined, 'ten floors on the wall clock, one second on the monotonic one: still working');
        clock.mono = Q - 1;
        assert.equal(await quiet(), undefined, 'one millisecond short');
        clock.mono = Q;
        assert.equal(await quiet(), Q, 'quiet for the floor, as the clock that only goes forward tells it');
      }),
  },
  {
    name: 'a wall clock stepped back delays quiet, and never ends it early',
    holds: () =>
      listing(row('working', 'idle'), async () => {
        const clock = { wall: 0, mono: 0 };
        const quiet = quietUnder(clock);
        await quiet();
        clock.wall = Q - 60_000;
        clock.mono = Q;
        assert.equal(await quiet(), undefined, 'the floor on the monotonic clock, a minute short of it on the wall clock stepped back');
        clock.wall = Q;
        clock.mono = Q + 60_000;
        assert.equal(await quiet(), Q, 'quiet once the wall clock reaches the floor too');
      }),
  },
  ...FIRST_SIGHTINGS.map(([what, record]) => ({
    name: `a first sighting waits the floor, its record ${what}: recorded now, and quiet a floor later`,
    holds: () =>
      listing(row('working', 'idle'), async () => {
        const root = scratch('ae-bg-');
        const file = quietFileOf(root, 'ae/t-1/1');
        if (record !== undefined) {
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, record);
        }
        const clock = { wall: 10 * Q, mono: 10 * Q };
        const quiet = quietUnder(clock, root);
        assert.equal(await quiet(), undefined, `${what}: a transcript cold for ten floors, first seen now`);
        assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { mtimeMs: 0, boot: BOOT, ms: 10 * Q }, what);
        clock.wall += Q - 1;
        clock.mono += Q - 1;
        assert.equal(await quiet(), undefined, `${what}: one millisecond short of the floor since`);
        clock.wall += 1;
        clock.mono += 1;
        assert.equal(await quiet(), Q, `${what}: the floor since it was first seen`);
      }),
  })),
  {
    name: 'a machine that does not say its boot has the wall clock alone, and records no sighting',
    holds: () =>
      listing(row('working', 'idle'), async () => {
        const root = scratch('ae-bg-');
        const quiet = quietUnder({ wall: 10 * Q, mono: 0 }, root, () => undefined);
        assert.equal(await quiet(), 10 * Q);
        assert.equal(fs.existsSync(quietFileOf(root, 'ae/t-1/1')), false);
      }),
  },
  {
    name: 'a spawn under a name clears the sighting a former attempt under it left',
    holds: async () => {
      const dir = scratch('ae-claude-');
      fs.writeFileSync(path.join(dir, 'claude'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
      const prev = process.env.PATH;
      process.env.PATH = `${dir}:${prev}`;
      try {
        const root = scratch('ae-bg-');
        seenSince(root, 'ae/t/1', 0, 0);
        assert.equal(fs.existsSync(quietFileOf(root, 'ae/t/1')), true);
        await Effect.runPromise(bgOps({ root }).spawn({ name: 'ae/t/1', brief: 'the prompt', cwd: dir }));
        assert.equal(fs.existsSync(quietFileOf(root, 'ae/t/1')), false);
      } finally {
        process.env.PATH = prev;
      }
    },
  },
  {
    name: 'a transcript written after the wall clock stepped back is read again: a read is kept only while the mtime it was made over stands',
    holds: () =>
      listing(row('done', 'idle'), async () => {
        const clock = { t: STARTED, written: STARTED - 10_000, said: 1 };
        const { reads, said } = keptOver(clock);
        assert.equal(await said(), 1);
        assert.equal(await said(), 1);
        assert.equal(reads.n, 1, 'unchanged since the read: kept');
        clock.t = STARTED - 60_000;
        clock.written = STARTED - 50_000;
        clock.said = 2;
        assert.equal(await said(), 2, 'written after the read, stamped before it on a clock stepped back: read again');
        assert.equal(reads.n, 2);
      }),
  },
  {
    name: 'a forward step of the wall clock costs at most one more read, and an unchanged transcript is still read once',
    holds: () =>
      listing(row('done', 'idle'), async () => {
        const clock = { t: STARTED, written: STARTED - 10_000, said: 1 };
        const { reads, said } = keptOver(clock);
        await said();
        clock.t = STARTED + 3_600_000;
        await said();
        await said();
        assert.ok(reads.n <= 2, `${reads.n} reads over three passes`);
        clock.written = STARTED + 3_600_000;
        clock.said = 2;
        assert.equal(await said(), 2, 'written since: read again');
      }),
  },
];

test('the quiet floor and the kept read under a clock that steps: the monotonic clock since a sighting on this boot bounds quiet, and a read is kept only over the mtime it was made over', async (t) => {
  for (const r of CLOCKS) await t.test(r.name, r.holds);
});

const entry = (o: object) => JSON.stringify(o);
const structured = (timestamp: string, input: object) =>
  entry({
    type: 'assistant',
    timestamp,
    message: { content: [{ type: 'tool_use', name: 'StructuredOutput', input }] },
  });

/**
 * A closing turn as Claude Code writes it: the StructuredOutput call, an `attachment` line carrying the same payload, the call's
 * result, and a `system` line with the turn's duration.
 */
const closingTurn = (timestamp: string, id: string, input: object) => [
  entry({ type: 'assistant', timestamp, message: { content: [{ type: 'tool_use', id, name: 'StructuredOutput', input }] } }),
  entry({ parentUuid: 'u1', attachment: { type: 'structured_output', data: input } }),
  entry({
    type: 'user',
    timestamp,
    message: { content: [{ tool_use_id: id, type: 'tool_result', content: 'Structured output provided successfully' }] },
  }),
  entry({ type: 'system', subtype: 'turn_duration', timestamp, durationMs: 11_545 }),
];

const CLOSED_AT = '2026-09-17T02:53:00.160Z';
const CLOSED = closingTurn(CLOSED_AT, 'toolu_1', { outcome: 'done' }).join('\n');

/** A StructuredOutput call whose id is `id`, made at `timestamp`. */
const callOf = (id: unknown, timestamp = CLOSED_AT) =>
  entry({ type: 'assistant', timestamp, message: { content: [{ type: 'tool_use', id, name: 'StructuredOutput', input: {} }] } });

/** Asserts `read` is refused naming its line, its kind and its field with what is there, and naming the fix. */
const refusedAt = (read: () => unknown, where: string, kind: string, field: string, found: string) =>
  assert.throws(read, (e: Error) => {
    const a = kind.startsWith('a') ? 'an' : 'a';
    assert.ok(
      e.message.startsWith(`${where} is ${a} \`${kind}\` line whose \`${field}\` is ${found}, where Claude Code writes`),
      e.message,
    );
    assert.ok(e.message.includes('`harness/claude/lines.ts`'), e.message);
    return true;
  });

const STATEMENTS: Row[] = [
  {
    name: 'the LAST StructuredOutput call is the statement, stamped with when it was made, with no `id` where it has none',
    holds: () => {
      const jsonl = [
        entry({ type: 'system', tools: [{ name: 'StructuredOutput' }] }),
        structured('2026-09-12T08:00:00.000Z', { outcome: 'done', by: 'parent' }),
        entry({ type: 'user', timestamp: '2026-09-12T09:00:00.000Z', message: { content: 'carry on' } }),
        structured('2026-09-12T09:30:00.000Z', { outcome: 'blocked' }),
        '{half a line mentioning StructuredOutput',
      ].join('\n');
      assert.deepEqual(
        lastStructuredOutput(jsonl),
        { payload: { outcome: 'blocked' }, at: Date.parse('2026-09-12T09:30:00.000Z'), lastWord: false },
        "the last call, with its time and no `id` where it has none: a resumed transcript holds the parent's calls, and the tool's definition names it",
      );
    },
  },
  {
    name: 'a name said is not a call',
    holds: () => assert.equal(lastStructuredOutput(entry({ type: 'user', message: { content: 'say StructuredOutput' } })), undefined),
  },
  {
    name: 'a statement is the LAST WORD when the conversation ends with its result, a trailing newline being no line',
    holds: () => {
      assert.deepEqual(lastStructuredOutput(CLOSED), {
        payload: { outcome: 'done' },
        at: Date.parse(CLOSED_AT),
        lastWord: true,
        id: 'toolu_1',
      });
      assert.equal(lastStructuredOutput(`${CLOSED}\n`)?.lastWord, true, 'a trailing newline is not a line');
    },
  },
  {
    name: 'anything said after it, woken and spoken to, is not its last word',
    holds: () => {
      const woken = [CLOSED, entry({ type: 'user', timestamp: '2026-09-17T04:03:15.727Z', message: { content: 'carry on' } })].join('\n');
      assert.equal(lastStructuredOutput(woken)?.lastWord, false);
    },
  },
  {
    name: "another call's result after it is not this statement's",
    holds: () => {
      const other = [
        CLOSED,
        entry({
          type: 'user',
          timestamp: CLOSED_AT,
          message: { content: [{ tool_use_id: 'toolu_other', type: 'tool_result', content: 'ok' }] },
        }),
      ].join('\n');
      assert.equal(lastStructuredOutput(other)?.lastWord, false);
    },
  },
  {
    name: 'a line still being written after it is passed over, as the reader passes over any',
    holds: () => assert.equal(lastStructuredOutput([CLOSED, '{half a line still being writ'].join('\n'))?.lastWord, true),
  },
  {
    name: 'the call alone is not the result: the turn has not closed',
    holds: () => {
      const noResult = closingTurn(CLOSED_AT, 'toolu_1', { outcome: 'done' }).slice(0, 2).join('\n');
      assert.equal(lastStructuredOutput(noResult)?.lastWord, false);
    },
  },
  {
    name: 'REFUSED: the StructuredOutput call read as the statement whose id does not decode, by its line in the transcript named and its field',
    holds: () => {
      const said = entry({ type: 'user', timestamp: CLOSED_AT, message: { content: 'carry on' } });
      refusedAt(
        () => lastStructuredOutput([said, callOf(7)].join('\n'), '/t/s.jsonl'),
        'line 2 of the transcript `/t/s.jsonl`',
        'assistant',
        'message.content.0.id',
        '7',
      );
    },
  },
  {
    name: 'REFUSED: the statement whose time does not decode, by its line and field',
    holds: () => {
      const said = entry({ type: 'user', timestamp: CLOSED_AT, message: { content: 'carry on' } });
      refusedAt(
        () => lastStructuredOutput([said, callOf('toolu_1', 'yesterday')].join('\n')),
        'line 2 of the transcript',
        'assistant',
        'timestamp',
        '"yesterday"',
      );
    },
  },
  {
    name: "REFUSED: the line a call's result is looked for on is read, so it is decoded",
    holds: () => {
      const answered = entry({ type: 'user', timestamp: CLOSED_AT, message: { content: [{ type: 'tool_result', tool_use_id: 7 }] } });
      refusedAt(
        () => lastStructuredOutput([callOf('toolu_1'), answered].join('\n')),
        'line 2 of the transcript',
        'user',
        'message.content.0.tool_use_id',
        '7',
      );
    },
  },
  {
    name: "a call before the statement is never read, so never decoded: a resumed transcript's inherited call does not refuse the new one",
    holds: () => {
      const inherited = entry({
        type: 'assistant',
        timestamp: 'yesterday',
        message: { content: [{ type: 'tool_use', id: 7, name: 'StructuredOutput' }] },
      });
      assert.deepEqual(lastStructuredOutput([inherited, CLOSED].join('\n')), {
        payload: { outcome: 'done' },
        at: Date.parse(CLOSED_AT),
        lastWord: true,
        id: 'toolu_1',
      });
    },
  },
];

test('lastStructuredOutput: the last StructuredOutput call is the statement, its last word when its result closes the conversation, and the lines it reads are decoded', async (t) => {
  for (const r of STATEMENTS) await t.test(r.name, r.holds);
});

/** Rows for the sessions `ae/t-1/1` (`s-1`) and `ae/t-2/1` (`s-2`), listed `done` and idle. */
const twoDone = JSON.stringify(
  ['1', '2'].map((n) => ({ name: `ae/t-${n}/1`, sessionId: `s-${n}`, state: 'done', status: 'idle', kind: 'background' })),
);

/** The words the warning for `ae/t-1/1`'s refused transcript says, `cause` among them. */
const unreadWords = (cause: string) => [
  /`ae\/t-1\/1`'s\s+transcript\s+cannot\s+be\s+read/,
  new RegExp(cause.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  /other\s+background\s+sessions\s+are\s+read/,
  /`ae forget`/,
];

test('a background session whose statement stops decoding is unread alone while written within the floor — never a defect, no statement or a blind harness — not read again while unchanged, failed once cold, read again once written, and why is said by the look that left it unread alone', async (t) => {
  const s = story(t);
  const restore = withFakeClaude(twoDone);
  t.after(restore);
  let asked = 0;
  let t0 = 10 * Q;
  let written = t0 - 2_000;
  const said = { payload: { outcome: 'done' }, at: 5 };
  let cause: string | undefined = 'line 2 of the transcript is an `assistant` line whose `message.content.0.id` is 7';
  const ops = bgOps({
    now: () => t0,
    transcriptTime: async () => written,
    closeoutFrom: async (sessionId) => {
      if (sessionId !== 's-1' || cause === undefined) return said;
      asked++;
      throw new Error(cause);
    },
  });
  const expected = [{ name: 'ae/t-1/1' }, { name: 'ae/t-2/1' }];
  const unread = async (look: string) => {
    const listed = await warned(ops.observe);
    assert.deepEqual([...listed.value.keys()], ['ae/t-2/1'], `${look}: left out of observe, which reads the other session`);
    assert.deepEqual(listed.value.get('ae/t-2/1')?.closeout, said);
    const told = await warned(ops.observeFor!(expected));
    assert.deepEqual([...told.value.unread], ['ae/t-1/1'], `${look}: neither there nor gone`);
    assert.deepEqual([...told.value.seen.keys()], ['ae/t-2/1']);
    for (const { warnings } of [listed, told]) {
      assert.equal(warnings.length, 1, `${look}: ${warnings.join(' | ')}`);
      for (const w of [...unreadWords(cause!), /unread\s+until\s+it\s+has\s+ended/]) assert.match(warnings[0], w);
    }
    return told;
  };

  await s.test(
    'REFUSED: written within the floor, it alone is unread, on a first look and a second, and not read again while unchanged',
    async () => {
      await unread('first look');
      await unread('second look');
      assert.equal(asked, 1, 'a transcript nothing has written since it was refused is refused again, not read again');
    },
  );

  await s.test(
    'REFUSED: why it alone is unread is answered by the look that left it so, beside the session read, and still warned',
    async () => {
      const first = await warned(ops.observeFor!(expected));
      assert.deepEqual([...(first.value.unreadWhy?.keys() ?? [])], ['ae/t-1/1'], 'the session read beside it has no words');
      for (const w of unreadWords(cause!)) assert.match(first.value.unreadWhy!.get('ae/t-1/1')!, w);
      assert.equal(first.warnings.length, 1, 'and the warning is still said');
    },
  );

  await s.test('REFUSED: cold for the floor and unchanged, it reads failed, its why warned, and is not read again', async () => {
    t0 += Q;
    const failed = await warned(ops.observeFor!(expected));
    assert.deepEqual(failed.value.seen.get('ae/t-1/1'), { sessionId: 's-1', state: 'failed', busy: false, held: false, nativeId: 's-1' });
    assert.deepEqual([...failed.value.unread], []);
    assert.equal(failed.warnings.length, 1);
    for (const w of [...unreadWords(cause!), /reads\s+as\s+failed/]) assert.match(failed.warnings[0], w);
    assert.equal(asked, 1, 'cold and unchanged: refused again, not read again');
  });

  await s.test('REFUSED: written since the refusal, it is read again, and unread alone again', async () => {
    written = t0 - 2_000;
    await unread('written since the refusal');
    assert.equal(asked, 2, 'written since the refusal: read again');
  });

  await s.test('once it decodes, the look that reads it says no words of the last', async () => {
    cause = undefined;
    t0 += 1_000;
    written = t0 - 500;
    const read = await warned(ops.observeFor!(expected));
    assert.deepEqual([...read.value.unread], [], 'readable now');
    assert.equal(read.value.unreadWhy, undefined, 'the look that reads it says no words of the last');
  });
});

/** How a session whose transcript cannot be read is listed, when its transcript was last written, and what it reads as. */
const ENDED_OR_NOT: { listed: object; written: number | undefined; as: 'failed' | 'unread' }[] = [
  { listed: { state: 'done', status: 'idle' }, written: 0, as: 'failed' },
  { listed: { state: 'working', status: 'idle' }, written: 0, as: 'failed' },
  { listed: { state: 'done', status: 'idle' }, written: undefined, as: 'failed' },
  { listed: { state: 'working', status: 'busy' }, written: 0, as: 'unread' },
  { listed: { state: 'blocked', status: 'idle', waitingFor: 'permission prompt' }, written: 0, as: 'unread' },
  { listed: { state: 'done', status: 'idle' }, written: 10 * Q - 2_000, as: 'unread' },
];

test('REFUSED: a session whose transcript cannot be read reads as failed only once it has ended — listed finished, or working and idle, its transcript cold for the floor or a finished one with none — and is unread otherwise', async (t) => {
  const now = 10 * Q;
  for (const c of ENDED_OR_NOT) {
    const what = `${JSON.stringify(c.listed)}, written ${c.written}`;
    await t.test(`${c.as}: ${what}`, () =>
      listing(
        JSON.stringify([{ name: 'ae/t-1/1', sessionId: 's-1', kind: 'background', pid: 4242, startedAt: 0, ...c.listed }]),
        async () => {
          const root = scratch('ae-bg-');
          if (c.written !== undefined) seenSince(root, 'ae/t-1/1', c.written, 0);
          const refused = async () => {
            throw new Error('line 4 of the transcript is a `user` line whose `timestamp` is "yesterday"');
          };
          const ops = bgOps({ root, now: () => now, transcriptTime: async () => c.written, closeoutFrom: refused, usageFrom: refused });
          const { value, warnings } = await warned(ops.observeFor!([{ name: 'ae/t-1/1' }]));
          assert.equal(warnings.length, 1, what);
          if (c.as === 'unread') {
            assert.deepEqual([...value.unread], ['ae/t-1/1'], what);
            assert.equal(value.seen.size, 0, what);
            assert.deepEqual([...(value.unreadWhy ?? [])], [['ae/t-1/1', warnings[0]]], `${what}: why it is unread, by its name`);
            return;
          }
          assert.equal(value.unreadWhy, undefined, `${what}: read as failed, so not unread, and no words of why it is`);
          const seen = value.seen.get('ae/t-1/1');
          assert.equal(seen?.state, 'failed', what);
          assert.equal(seen?.pid, 4242, `${what}: its process kept, for release to stop`);
          assert.equal(seen?.held, true, what);
          for (const none of ['closeout', 'usage', 'quietMs'] as const) assert.equal(seen?.[none], undefined, `${what}: no ${none}`);
          assert.deepEqual([...value.unread], [], what);
        },
      ),
    );
  }
});

/** The argv `bgOps().spawn` hands to `claude`, recorded by a fake one on PATH; `cwd` holds the `.mcp.json` it is given. */
const argvOf = async (r: Partial<SpawnRequest>, o: { root?: string; checkoutMcp?: boolean } = {}) => {
  const dir = scratch('fake-claude-');
  const argsFile = path.join(dir, 'args');
  fs.writeFileSync(path.join(dir, 'claude'), `#!/bin/sh\nprintf '%s\\n' "$@" > '${argsFile}'\n`, { mode: 0o755 });
  if (o.checkoutMcp) fs.writeFileSync(path.join(dir, '.mcp.json'), '{"mcpServers":{}}');
  const prev = process.env.PATH;
  process.env.PATH = `${dir}:${prev}`;
  try {
    await Effect.runPromise(bgOps(o.root ? { root: o.root } : {}).spawn({ name: 'ae/t/1', brief: 'the prompt', cwd: dir, ...r }));
    return { dir, args: fs.readFileSync(argsFile, 'utf8').replace(/\n$/, '').split('\n') };
  } finally {
    process.env.PATH = prev;
  }
};

const SCHEMA = { type: 'object', properties: { outcome: { type: 'string' } } };

test("claude --bg's argv, pinned: its name, auto, the MCP flags and the prompt at shipped defaults; every option in its one order, each variadic list and optional value ended by a flag and the prompt last; an empty list as no list", async (t) => {
  await t.test('at shipped defaults: its name, the permission mode auto, the MCP flags and the prompt, and nothing else', async () => {
    assert.deepEqual((await argvOf({})).args, [
      '--bg',
      '--name',
      'ae/t/1',
      '--settings',
      '{"autoMemoryEnabled":false}',
      '--permission-mode',
      'auto',
      '--strict-mcp-config',
      '--no-chrome',
      'the prompt',
    ]);
  });

  await t.test(
    'with every option set: each flag in its one order, the MCP flags after the permission mode and the prompt last',
    async () => {
      const root = scratch('ae-root-');
      const { dir, args } = await argvOf(
        {
          resumeFrom: 's-0',
          closeoutSchema: SCHEMA,
          config: {
            tools: ['Read', 'Grep', 'Glob'],
            disallowedTools: ['SendMessage', 'Bash(npm run build)'],
            allowedTools: ['Edit(**)', 'Bash(npm test)'],
            claude: { remoteControl: true },
            permissionMode: 'dontAsk',
            mcp: { docs: { command: 'docs-server' } },
            model: 'opus',
            effort: 'high',
            contextTokens: 200000,
            worktree: true,
            budgetUsd: 0.5,
          },
        },
        { root, checkoutMcp: true },
      );
      assert.deepEqual(args, [
        '--bg',
        '--name',
        'ae/t/1',
        '--tools',
        'Read,Grep,Glob',
        '--disallowedTools',
        'SendMessage,Bash(npm run build)',
        '--allowedTools',
        'Edit(**),Bash(npm test)',
        '--remote-control',
        '--settings',
        '{"autoMemoryEnabled":false}',
        '--permission-mode',
        'dontAsk',
        '--mcp-config',
        path.join(dir, '.mcp.json'),
        path.join(root, 'mcp', 'ae_t_1.json'),
        '--strict-mcp-config',
        '--no-chrome',
        '--model',
        'opus',
        '--effort',
        'high',
        '--autocompact',
        '200000',
        '--resume',
        's-0',
        '--worktree',
        'ae-t-1',
        '--json-schema',
        JSON.stringify(SCHEMA),
        '--max-budget-usd',
        '0.5',
        'the prompt',
      ]);
    },
  );

  await t.test(
    'empty lists: no tools at all, never every tool, and no deny or allow list; a bag with no bridge gives no --remote-control',
    async () => {
      const { args } = await argvOf({ config: { tools: [], disallowedTools: [], allowedTools: [], claude: {} } });
      assert.deepEqual(args, [
        '--bg',
        '--name',
        'ae/t/1',
        '--tools',
        '',
        '--settings',
        '{"autoMemoryEnabled":false}',
        '--permission-mode',
        'auto',
        '--strict-mcp-config',
        '--no-chrome',
        'the prompt',
      ]);
    },
  );
});

test('at shipped defaults, a background task filed with claude.remoteControl is spawned with --remote-control, and so is one journalled with remoteControl before it moved; one filed without it never is', async () => {
  const dir = scratch('fake-claude-');
  const registry = path.join(dir, 'registry.json');
  const runs = path.join(dir, 'runs.jsonl');
  fs.writeFileSync(registry, '[]');
  fs.writeFileSync(
    path.join(dir, 'claude'),
    `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const rows = JSON.parse(fs.readFileSync(${JSON.stringify(registry)}, 'utf8'));
if (args[0] === 'agents') { process.stdout.write(JSON.stringify(rows)); process.exit(0); }
if (args[0] === '--bg') {
  fs.appendFileSync(${JSON.stringify(runs)}, JSON.stringify(args) + '\\n');
  rows.push({ name: args[args.indexOf('--name') + 1], sessionId: require('node:crypto').randomUUID(), state: 'working', status: 'busy', kind: 'background', startedAt: Date.now() });
  fs.writeFileSync(${JSON.stringify(registry)}, JSON.stringify(rows));
}
`,
    { mode: 0o755 },
  );
  const prev = process.env.PATH;
  process.env.PATH = `${dir}:${prev}`;
  try {
    const root = scratch('ae-remote-');
    const engine = builtEngine(Engine.layer({ root }));
    await Effect.runPromise(engine.file({ brief: 'bridged', cwd: dir, config: { background: true, claude: { remoteControl: true } } }));
    await Effect.runPromise(engine.file({ brief: 'plain', cwd: dir, config: { background: true } }));
    const at = new Date().toISOString();
    await Effect.runPromise(
      Journal.filesOps(root).append('t-before-the-move', {
        kind: 'filed',
        at,
        brief: 'bridged before',
        cwd: dir,
        queued: false,
        config: { background: true, remoteControl: true },
      } as unknown as Event),
    );
    await Effect.runPromise(engine.tick());

    const argvs = fs
      .readFileSync(runs, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as string[]);
    const of = (brief: string) => argvs.filter((a) => a.at(-1) === brief);
    assert.equal(of('bridged').length, 1, 'its attempt');
    for (const args of of('bridged')) assert.ok(args.includes('--remote-control'), args.join(' '));
    assert.equal(of('bridged before').length, 1, 'its attempt');
    for (const args of of('bridged before')) assert.equal(args[args.indexOf('--remote-control') + 1], '--settings', args.join(' '));
    assert.equal(of('plain').length, 1);
    for (const args of of('plain')) assert.equal(args.includes('--remote-control'), false, args.join(' '));
  } finally {
    process.env.PATH = prev;
  }
});

test('claude that could not even be launched says nothing started; one that ran and failed does not', async () => {
  const caught = (cwd: string) =>
    Effect.runPromise(
      bgOps()
        .spawn({ name: 'ae/t/1', brief: 'b', cwd })
        .pipe(
          Effect.as(undefined),
          Effect.catchTag('RunnerError', (e) => Effect.succeed(e)),
        ),
    );
  const missing = await caught(path.join(scratch('ae-nocwd-'), 'gone'));
  assert.equal(missing?.refused, true, 'the OS refused the process: no session can exist');

  const dir = scratch('fake-claude-');
  fs.writeFileSync(path.join(dir, 'claude'), '#!/bin/sh\necho "something went wrong" >&2\nexit 1\n', { mode: 0o755 });
  const prev = process.env.PATH;
  process.env.PATH = `${dir}:${prev}`;
  try {
    const ran = await caught(dir);
    assert.ok(ran, 'it failed');
    assert.notEqual(ran?.refused, true, 'claude ran and exited 1: whether it registered a session is not known');
  } finally {
    process.env.PATH = prev;
  }
});

/** What `observe` refuses `out` with, printed as `claude agents`' listing, or `undefined` where it reads it. */
const refusalOf = (out: string) =>
  listing(out, () => {
    const ops = bgOps({ now: () => 0, transcriptTime: async () => undefined, closeoutFrom: async () => undefined });
    return Effect.runPromise(
      ops.observe.pipe(
        Effect.as(undefined),
        Effect.catchTag('RunnerError', (e) => Effect.succeed(e)),
      ),
    );
  });

/** Asserts `err` refuses the whole listing on `observe`, leaving every background session unread, in a bounded message. */
const refusesListing = (err: Awaited<ReturnType<typeof refusalOf>>, what: string) => {
  assert.ok(err, `${what} is refused`);
  assert.equal(err.verb, 'observe');
  assert.match(err.message, /Every background session of ours stays unread/);
  assert.match(err.message, /neither there nor gone, until the listing decodes/);
  assert.ok(err.message.length < 600, `the message is bounded: ${err.message.length}`);
  return err.message;
};

/** A row of ours with a field Claude Code does not list so, the field, and the words the refusal says of it. */
const WRONG_ROWS: [Record<string, unknown>, string, RegExp][] = [
  [{ sessionId: undefined }, 'sessionId', /`sessionId` is missing, where Claude Code lists a non-empty string\./],
  [{ sessionId: '' }, 'sessionId', /`sessionId` is "", where/],
  [{ state: '' }, 'state', /`state` is "", where/],
  [{ state: 7 }, 'state', /`state` is 7, where Claude Code lists a non-empty string/],
  [{ status: 7 }, 'status', /`status` is 7, where/],
  [{ waitingFor: 7 }, 'waitingFor', /`waitingFor` is 7, where/],
  [{ startedAt: '5' }, 'startedAt', /`startedAt` is "5", where/],
  [{ pid: 0 }, 'pid', /`pid` is 0, where/],
  [{ pid: 1.5 }, 'pid', /`pid` is 1.5, where/],
  [{ pid: '7' }, 'pid', /`pid` is "7", where/],
  [{ pid: -3 }, 'pid', /`pid` is -3, where/],
  [{ pid: 'x'.repeat(5000) }, 'pid', /`pid` is "x{59}…, where Claude Code lists an integer greater than 0, or nothing/],
];

const LISTINGS: Row[] = [
  {
    name: "the registry's words are each A2A's name once, and a blocked session's wait says which, in the harness's own words",
    holds: async () => {
      const rows = [
        ['working', undefined, 'working'],
        ['done', undefined, 'completed'],
        ['failed', undefined, 'failed'],
        ['stopped', undefined, 'canceled'],
        ['blocked', 'permission prompt', 'input-required'],
        ['blocked', 'authentication', 'auth-required'],
        ['blocked', 'sign in to continue', 'auth-required'],
        ['vanished', undefined, 'failed'],
      ] as const;
      const listed = rows.map(([state, waitingFor], i) => ({
        name: `ae/t-${i}/1`,
        sessionId: `s-${i}`,
        state,
        status: 'idle',
        kind: 'background',
        ...(waitingFor ? { waitingFor } : {}),
      }));
      await listing(JSON.stringify(listed), async () => {
        const seen = await Effect.runPromise(bgOps({ now: () => 0, transcriptTime: async () => 1 }).observe);
        assert.deepEqual(
          rows.map((_, i) => seen.get(`ae/t-${i}/1`)?.state),
          rows.map(([, , name]) => name),
        );
        assert.equal(seen.get('ae/t-5/1')?.waitingFor, 'authentication', "the wait is carried in the harness's own words");
      });
    },
  },
  {
    name: "a row is ours only when named `ae/` with a `state` key: another's row, an interactive one and a non-object are skipped, a blank wait dropped and a padded one trimmed",
    holds: () =>
      listing(
        JSON.stringify([
          { name: 'other/a/1', sessionId: 's-a', state: 'working', status: 'idle', pid: 'not ours', startedAt: 'not ours' },
          { name: 'ae/b/1', sessionId: 's-b', status: 'idle', pid: -1 },
          { name: 'ae/e/1', sessionId: 's-e', state: 'blocked', status: 'waiting', waitingFor: '   ' },
          { name: 'ae/f/1', sessionId: 's-f', state: 'blocked', status: 'waiting', waitingFor: '  authentication  ' },
          { name: 'ae/g/1', sessionId: 's-g', state: 'working', status: 'busy', waitingFor: null, pid: null, startedAt: null },
          { sessionId: 's-h', state: 'working', status: 'idle' },
          { name: 7, sessionId: 's-i', state: 'working' },
          7,
          null,
          'ae/j/1',
        ]),
        async () => {
          const ops = bgOps({
            now: () => 0,
            transcriptTime: async () => undefined,
            closeoutFrom: async () => undefined,
            usageFrom: async () => undefined,
          });
          assert.deepEqual(
            [...(await Effect.runPromise(ops.observe))],
            [
              ['ae/e/1', { sessionId: 's-e', state: 'input-required', busy: false, held: false, nativeId: 's-e' }],
              [
                'ae/f/1',
                { sessionId: 's-f', state: 'auth-required', busy: false, held: false, nativeId: 's-f', waitingFor: 'authentication' },
              ],
              ['ae/g/1', { sessionId: 's-g', state: 'working', busy: true, held: false, nativeId: 's-g' }],
            ],
          );
        },
      ),
  },
  {
    name: 'a row is held while it lists a process, which it names with its bridge: an idle session open for its next words, a finished one still open, and a stopped one gone, whose bridge nobody reads',
    holds: () =>
      listing(
        JSON.stringify([
          { name: 'ae/a/1', sessionId: 's-a', state: 'blocked', status: 'idle', pid: 42 },
          { name: 'ae/b/1', sessionId: 's-b', state: 'done', status: 'idle', pid: 43 },
          { name: 'ae/c/1', sessionId: 's-c', state: 'stopped', status: 'idle' },
        ]),
        async () => {
          const ops = bgOps({
            now: () => 0,
            transcriptTime: async () => undefined,
            closeoutFrom: async () => undefined,
            usageFrom: async () => undefined,
            bridgeOf: async (pid, sessionId) =>
              pid === 42 ? { url: `https://example.test/${sessionId}` } : { url: null, why: `${pid} holds no bridge` },
          });
          assert.deepEqual(
            [...(await Effect.runPromise(ops.observe))],
            [
              [
                'ae/a/1',
                {
                  sessionId: 's-a',
                  state: 'input-required',
                  busy: false,
                  held: true,
                  nativeId: 's-a',
                  pid: 42,
                  bridge: { url: 'https://example.test/s-a' },
                },
              ],
              [
                'ae/b/1',
                {
                  sessionId: 's-b',
                  state: 'completed',
                  busy: false,
                  held: true,
                  nativeId: 's-b',
                  pid: 43,
                  bridge: { url: null, why: '43 holds no bridge' },
                },
              ],
              ['ae/c/1', { sessionId: 's-c', state: 'canceled', busy: false, held: false, nativeId: 's-c' }],
            ],
          );
        },
      ),
  },
  {
    name: 'every row a real `claude agents --all --json` printed decodes as ours — the finished rows and a live background row read on Claude Code 2.1.291 (done, busy, a pid, no waitingFor) — and one with no `state` is still no session of ours',
    holds: async () => {
      const rows: Record<string, unknown>[] = JSON.parse(
        fs.readFileSync(new URL('./fixtures/claude-agents-listing.json', import.meta.url), 'utf8'),
      );
      await listing(JSON.stringify(rows), async () => {
        const ops = bgOps({ now: () => 0, transcriptTime: async () => undefined, closeoutFrom: async () => undefined });
        const seen = await Effect.runPromise(ops.observe);
        assert.deepEqual(
          [...seen.keys()],
          rows.filter((r) => Object.hasOwn(r, 'state')).map((r) => r.name),
        );
        assert.ok(
          rows.some((r) => !Object.hasOwn(r, 'state')),
          'the fixture holds an interactive row',
        );
        const live = seen.get('ae/listed/6');
        assert.ok(live, 'the live background row is read');
        assert.equal(live.state, 'completed');
        assert.equal(live.busy, true);
        assert.equal(live.held, true);
        assert.equal(live.pid, 285997);
        assert.equal(live.waitingFor, undefined);
      });
    },
  },
  ...WRONG_ROWS.map(([fields, field, words]) => ({
    name: `REFUSED: a row of ours whose \`${field}\` is ${JSON.stringify(fields[field])?.slice(0, 20) ?? 'missing'} refuses the whole listing, naming the row, the field and the fix`,
    holds: async () => {
      const bad = { name: 'ae/bad/1', sessionId: 's-bad', state: 'working', status: 'idle', ...fields };
      const message = refusesListing(
        await refusalOf(JSON.stringify([{ name: 'ae/ok/1', sessionId: 's-ok', state: 'working' }, bad])),
        `${field}: ${JSON.stringify(fields).slice(0, 40)}`,
      );
      assert.match(message, /^`claude agents --all --json` lists `ae\/bad\/1`, /);
      assert.match(message, /, a session of ours, and its `/);
      assert.match(message, words);
      assert.match(message, /RegistryRowSchema/);
    },
  })),
  ...['not json', '{}', '"x"', JSON.stringify({ rows: 'y'.repeat(10_000) })].map((out) => ({
    name: `REFUSED: output that is no JSON array, ${out.slice(0, 20)}, is a RunnerError quoting at most 60 characters of it, never a defect`,
    holds: async () => {
      const message = refusesListing(await refusalOf(out), out.slice(0, 20));
      assert.match(message, /^`claude agents --all --json` printed no JSON list/);
      assert.match(message, / of sessions: it reads "/);
    },
  })),
  {
    name: "a row's process and start are kept when it lists them, and none is when it lists neither or null: `say` finds no process, `release` reads no usage",
    holds: async () => {
      const rows = [
        { name: 'ae/a/1', sessionId: 's-a' },
        { name: 'ae/b/1', sessionId: 's-b', pid: null, startedAt: null },
        { name: 'ae/e/1', sessionId: 's-e', pid: 999_999_999, startedAt: 5 },
        { name: 'ae/f/1', sessionId: 's-f', pid: 999_999_998 },
      ].map((r) => ({ ...r, state: 'done', status: 'idle' }));
      await listing(JSON.stringify(rows), async () => {
        const since: number[] = [];
        const ops = bgOps({
          sessionsDir: scratch('ae-sessions-'),
          transcriptTime: async () => 0,
          closeoutFrom: async () => undefined,
          usageFrom: async (_id, from) => {
            since.push(from);
            return { turns: 1, toolCalls: 0 };
          },
        });
        await Effect.runPromise(ops.observe);
        const said = await Promise.all(
          rows.map((r) =>
            Effect.runPromise(
              ops.say!(r, 'hello').pipe(
                Effect.as(''),
                Effect.catchTag('RunnerError', (e) => Effect.succeed(e.message)),
              ),
            ),
          ),
        );
        assert.deepEqual(
          said.map((m) => /`claude agents` lists no process for/.test(m)),
          [true, true, false, false],
          said.join('\n'),
        );
        since.length = 0;
        const released = [];
        for (const r of rows)
          released.push(await Effect.runPromise(ops.release!({ sessionId: r.sessionId, state: 'completed' }, { worktree: true })));
        assert.deepEqual(released, [undefined, undefined, { turns: 1, toolCalls: 0 }, undefined]);
        assert.deepEqual(since, [5], 'only the row with a start, and a process, is read again');
      });
    },
  },
];

test('`claude agents --all --json`, read by observe: what each row of ours is read as, what is skipped as not ours, and what refuses the whole listing', async (t) => {
  for (const r of LISTINGS) await t.test(r.name, r.holds);
});
