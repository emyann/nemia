/**
 * The files store's feed across a rotation (`core/engine/feed.ts`): a cursor any read handed out keeps its place, the lines of a
 * task forgotten are gone from the files and counted to a reader past whose cursor they were, and every append and rotation take
 * `feed.lock` in turn — a holder stopped is waited for up to `FEED_LOCK_WAIT_MS` and named, a dead one broken, and a writer
 * stopped between its journal and its feed line keeps a rotation out until it has written both.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Effect } from 'effect';
import { Journal } from '../src/core/engine/journal.ts';
import { FEED_LOCK_WAIT_MS, HEADER_BYTES, rotateFeed } from '../src/core/engine/feed.ts';
import { instantNow } from '../src/core/engine/now.ts';
import { elapsedMs } from '../src/core/clock.ts';
import { ioCounts } from '../src/core/engine/tally.ts';
import { scratch } from './scratch.ts';
import { until, WAITED, type Waiter } from '../src/waits/index.ts';

const PACKAGE = path.join(import.meta.dirname, '..');

type Line = { taskId: string; event: { kind: string; at: string; text?: string } };

const filed = (n: number) => ({ kind: 'filed', at: `2026-10-05T00:00:${String(n).padStart(2, '0')}Z`, brief: 'b', cwd: '/r', config: {} });
const said = (n: number) => ({ kind: 'input', at: `2026-10-05T00:01:${String(n % 60).padStart(2, '0')}Z`, attempt: 1, text: `n${n}` });

/** Who wrote line `n` of the store's thirty: `a` filed first, then `b`, then `c`; after them, every third line `a`'s, every fifth `c`'s. */
const ownerOf = (n: number) => (n <= 3 ? ['a', 'b', 'c'][n - 1] : n % 3 === 0 ? 'a' : n % 5 === 0 ? 'c' : 'b');

/** A store of thirty feed lines over the tasks `a`, `b` and `c`, through the files store's own appends. */
const store = async () => {
  const root = scratch('ae-feed-rotation-');
  const ops = Journal.filesOps(root);
  for (let n = 1; n <= 30; n++) await Effect.runPromise(ops.append(ownerOf(n), (n <= 3 ? filed(n) : said(n)) as never));
  return { root, ops, head: path.join(root, 'feed.jsonl'), sealed: path.join(root, 'feed.sealed.jsonl') };
};

/** The cursor just past line `n` of a feed no rotation has written: the bytes of its first `n` lines. */
const cursorAfter = (head: string, n: number) =>
  fs
    .readFileSync(head, 'utf8')
    .split('\n')
    .slice(0, n)
    .reduce((sum, line) => sum + Buffer.byteLength(line) + 1, 0);

type Ops = ReturnType<typeof Journal.filesOps>;
const read = (ops: Ops, after: number) =>
  Effect.runPromise(ops.feed(after)) as Promise<{ entries: Line[]; cursor: number; forgotten?: number }>;
const forget = (ops: Ops, ids: string[]) => Effect.runPromise(ops.forget!(ids));
const texts = (entries: readonly Line[]) => entries.map((e) => `${e.taskId} ${e.event.text ?? e.event.kind}`);
const without = (entries: readonly Line[], ids: readonly string[]) => entries.filter((e) => !ids.includes(e.taskId));

/** What both files of the feed hold, as text. */
const onDisk = (root: string) =>
  ['feed.jsonl', 'feed.sealed.jsonl']
    .map((f) => (fs.existsSync(path.join(root, f)) ? fs.readFileSync(path.join(root, f), 'utf8') : ''))
    .join('');

test('a reader parked at line 7 and one at line 20 each read on across a rotation: the lines kept, in order, once, the forgotten counted', async () => {
  const { root, ops, head, sealed } = await store();
  const at7 = cursorAfter(head, 7);
  const at20 = cursorAfter(head, 20);
  const was7 = await read(ops, at7);
  const was20 = await read(ops, at20);
  const aLines = (from: number) => [...Array(30).keys()].map((i) => i + 1).filter((n) => n > from && ownerOf(n) === 'a').length;

  const rotated = await forget(ops, ['a']);
  assert.equal(rotated?.linesForgotten, aLines(0), "every line of a's");
  assert.ok(rotated && rotated.bytesAfter < rotated.bytesBefore, `the feed shrank: ${JSON.stringify(rotated)}`);
  assert.ok(fs.readFileSync(head, 'utf8').startsWith('{"feedBase":'), 'the head begins with its first cursor');
  assert.equal(fs.readFileSync(head, 'utf8').indexOf('\n'), HEADER_BYTES - 1);
  assert.ok(fs.existsSync(sealed), 'the lines before it are sealed');
  assert.ok(!onDisk(root).includes('"taskId":"a"'), "no line of a's is left on disk");
  assert.ok(!fs.existsSync(path.join(root, 'tasks', 'a.jsonl')), "and a's journal is gone");

  for (const [was, at, from] of [
    [was7, at7, 7],
    [was20, at20, 20],
  ] as const) {
    const now = await read(ops, at);
    assert.deepEqual(texts(now.entries), texts(without(was.entries, ['a'])), `the reader at line ${from} reads the lines kept after it`);
    assert.equal(now.cursor, was.cursor, `and stops where it stopped before, at the end`);
    assert.equal(now.forgotten, aLines(from), `told how many lines after line ${from} were forgotten`);
  }

  await Effect.runPromise(ops.append('b', said(31) as never));
  const next = await read(ops, was7.cursor);
  assert.deepEqual(texts(next.entries), ['b n31'], 'a line appended after the rotation comes after every cursor before it');
  assert.equal(next.forgotten, undefined);
  assert.ok(next.cursor > was7.cursor);
  const whole = await read(ops, 0);
  assert.equal(whole.entries.length, 30 - aLines(0) + 1, 'from 0, every line kept and the new one');
  assert.equal(whole.cursor, next.cursor);
  assert.equal(whole.forgotten, aLines(0));
});

test('a reader parked inside a run of forgotten lines is told of those after it alone', async () => {
  const { ops, head } = await store();
  const gone = (n: number) => ownerOf(n) !== 'b';
  assert.ok(gone(5) && gone(6) && gone(20) && gone(21), 'lines 5 and 6, and 20 and 21, are each one run of the forgotten');
  const parked = [5, 20].map((n) => ({ n, at: cursorAfter(head, n) }));
  await forget(ops, ['a', 'c']);
  for (const { n, at } of parked) {
    const now = await read(ops, at);
    const after = [...Array(30).keys()].map((i) => i + 1).filter((m) => m > n);
    assert.equal(now.forgotten, after.filter(gone).length, `the reader at line ${n} is told of the forgotten lines after it`);
    assert.equal(now.entries.length, after.filter((m) => !gone(m)).length, 'and reads the kept ones');
  }
});

test('a feed written before rotations, with no header and a line cut short at its end, is rotated without moving a cursor or losing the cut line', async () => {
  const root = scratch('ae-feed-legacy-');
  const head = path.join(root, 'feed.jsonl');
  const line = (taskId: string, n: number) => JSON.stringify({ taskId, event: said(n) }) + '\n';
  const whole = line('a', 1) + line('b', 2) + line('a', 3);
  const cut = JSON.stringify({ taskId: 'b', event: said(4) }) + '\n';
  fs.writeFileSync(head, whole + cut.slice(0, 20));
  const ops = Journal.filesOps(root);
  const before = await read(ops, 0);
  assert.equal(before.cursor, Buffer.byteLength(whole), 'the cursor is the byte past the last complete line');

  const rotated = await forget(ops, ['a']);
  assert.equal(rotated?.linesForgotten, 2);
  const after = await read(ops, 0);
  assert.deepEqual(texts(after.entries), ['b n2']);
  assert.deepEqual([after.cursor, after.forgotten], [before.cursor, 2]);

  fs.appendFileSync(head, cut.slice(20));
  const completed = await read(ops, after.cursor);
  assert.deepEqual(texts(completed.entries), ['b n4'], 'the cut line, completed, is read whole');
  assert.equal(completed.cursor, Buffer.byteLength(whole + cut), 'at the cursor it would have had with no rotation');
});

test('a reader that opened the head before an append and a rotation, and the sealed file after, resumes past what it read, once', async () => {
  const { root, ops, head } = await store();
  const end = cursorAfter(head, 30);
  const sealed = path.join(root, 'feed.sealed.jsonl');
  const open = fs.openSync;
  let between = true;
  fs.openSync = (...args: Parameters<typeof fs.openSync>) => {
    if (between && args[0] === sealed) {
      between = false;
      Effect.runSync(ops.append('b', said(31) as never));
      Effect.runSync(ops.forget!(['a']));
    }
    return open(...args);
  };
  let first: Awaited<ReturnType<typeof read>>;
  try {
    first = await read(ops, end);
  } finally {
    fs.openSync = open;
  }
  assert.equal(between, false, 'the rotation ran between the opens');
  assert.deepEqual(texts(first.entries), ['b n31'], 'the line appended before the rotation, from the sealed file');
  const again = await read(ops, first.cursor);
  assert.deepEqual(texts(again.entries), [], `resumed at ${first.cursor}, it reads nothing twice`);
  assert.equal(again.cursor, first.cursor);
});

test('a rotation stopped between its renames leaves every reader right, and the next forget finishes it', async () => {
  const { root, ops, head } = await store();
  const at7 = cursorAfter(head, 7);
  const was = await read(ops, at7);
  const rename = fs.renameSync;
  fs.renameSync = (from: fs.PathLike, to: fs.PathLike) => {
    if (String(to) === head) throw new Error('stopped before the head was renamed');
    rename(from, to);
  };
  let error: unknown;
  try {
    await forget(ops, ['a']);
  } catch (e) {
    error = e;
  } finally {
    fs.renameSync = rename;
  }
  assert.ok(String(error).includes('stopped before the head was renamed'), String(error));
  assert.ok(!fs.existsSync(path.join(root, 'feed.lock')), 'the lock was let go');
  assert.ok(fs.existsSync(path.join(root, 'tasks', 'a.jsonl')), "a's journal is still there: the forget did not finish");
  assert.deepEqual(
    fs.readdirSync(root).filter((f) => f.endsWith('.tmp')),
    [],
    'no file half written is left',
  );

  const between = await read(ops, at7);
  assert.deepEqual(texts(between.entries), texts(without(was.entries, ['a'])), 'a reader reads the sealed lines, then the head past them');
  assert.equal(between.cursor, was.cursor);
  await Effect.runPromise(ops.append('b', said(31) as never));
  assert.deepEqual(texts((await read(ops, was.cursor)).entries), ['b n31'], 'an append in between is read once');

  await forget(ops, ['a']);
  assert.ok(!onDisk(root).includes('"taskId":"a"'), "the forget again leaves no line of a's");
  assert.ok(!fs.existsSync(path.join(root, 'tasks', 'a.jsonl')), "and removes a's journal");
  const done = await read(ops, at7);
  assert.deepEqual(texts(done.entries), [...texts(without(was.entries, ['a'])), 'b n31']);
});

test('two rotations racing: the one that meets the other done starts again, and neither loses the other', async () => {
  const { root, ops, head } = await store();
  const at7 = cursorAfter(head, 7);
  const was = await read(ops, at7);
  const link = fs.linkSync;
  let other: { linesForgotten: number } | undefined;
  fs.linkSync = (from: fs.PathLike, to: fs.PathLike) => {
    fs.linkSync = link;
    other = rotateFeed(root, new Set(['c']), () => {});
    link(from, to);
  };
  let mine: Awaited<ReturnType<typeof forget>>;
  try {
    mine = await forget(ops, ['a']);
  } finally {
    fs.linkSync = link;
  }
  assert.ok(other && other.linesForgotten > 0, 'the other rotation ran first');
  assert.ok(mine && mine.linesForgotten > 0, 'and this one after it');
  const now = await read(ops, at7);
  assert.deepEqual(texts(now.entries), texts(without(was.entries, ['a', 'c'])));
  assert.equal(now.forgotten, was.entries.length - now.entries.length);
  assert.ok(!/"taskId":"[ac]"/.test(onDisk(root)), 'no line of either is left');
});

/** The state `ps` gives process `pid`, or '' once it is gone. */
const stateOf = (pid: number) => {
  try {
    return execFileSync('ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};

/** Until `ok` holds, in test `t`, looked at every 20ms. */
const holds = (t: Waiter, ok: () => boolean, what: string) => until(t, ok, what, { everyMs: 20 });

/** A child, continued and ended, whatever the test left it in. */
const reap = (child: ChildProcess) => {
  for (const sig of ['SIGCONT', 'SIGKILL'] as const)
    try {
      child.kill(sig);
    } catch {}
};

const exited = (child: ChildProcess) =>
  child.exitCode !== null ? Promise.resolve(child.exitCode) : new Promise<number | null>((r) => child.once('exit', (code) => r(code)));

test(
  "a holder of the feed's lock that is stopped keeps an append out for FEED_LOCK_WAIT_MS, which then fails naming it, and writes nothing",
  WAITED,
  async (t) => {
    const { root, ops, head } = await store();
    const feedUrl = pathToFileURL(path.join(PACKAGE, 'src', 'core', 'engine', 'feed.ts')).href;
    const code = `import { withFeedLock } from '${feedUrl}'; withFeedLock(process.env.FEED_ROOT, () => process.kill(process.pid, 'SIGSTOP'));`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], {
      env: { ...process.env, FEED_ROOT: root },
      stdio: 'ignore',
    });
    try {
      const pid = child.pid!;
      await holds(t, () => stateOf(pid).startsWith('T'), 'the holder stops holding the lock');
      const sizes = () => [fs.statSync(head).size, fs.statSync(path.join(root, 'tasks', 'b.jsonl')).size];
      const was = sizes();
      const t0 = instantNow();
      const error = await Effect.runPromise(Effect.flip(ops.append('b', said(31) as never)));
      const waited = elapsedMs(t0, instantNow());
      assert.ok(waited >= FEED_LOCK_WAIT_MS, `waited ${waited} ms on the clock the lock is bounded by, at least the bound`);
      assert.ok(error.message.includes(path.join(root, 'feed.lock')), error.message);
      assert.ok(error.message.includes(`process ${pid}`), error.message);
      assert.ok(error.message.includes('if it is stopped, continue it or end it'), error.message);
      assert.deepEqual(sizes(), was, 'nothing was written');

      child.kill('SIGCONT');
      assert.equal(await exited(child), 0);
      await Effect.runPromise(ops.append('b', said(31) as never));
      assert.deepEqual(texts((await read(ops, cursorAfter(head, 30))).entries), ['b n31'], 'once let go, the append goes through');
    } finally {
      reap(child);
    }
  },
);

test('a lock whose holder is dead is broken by the next append, which goes through and counts one lock', async () => {
  const { root, ops } = await store();
  const dead = spawnSync(process.execPath, ['-e', '']).pid;
  assert.equal(stateOf(dead), '', 'the holder is gone');
  const lock = path.join(root, 'feed.lock');
  fs.writeFileSync(lock, JSON.stringify({ pid: dead, token: 'dead', at: '2026-10-05T00:00:00Z' }));
  const before = ioCounts();
  await Effect.runPromise(ops.append('b', said(31) as never));
  const after = ioCounts();
  assert.equal(after.locks - before.locks, 1, 'one lock taken');
  assert.ok(!fs.existsSync(lock), 'and let go');
  assert.deepEqual(
    fs.readdirSync(root).filter((f) => f.startsWith('feed.lock')),
    [],
    'nothing of the dead one left',
  );
});

test(
  'a writer stopped between its journal and its feed line keeps a rotation out, and its line is in the feed the rotation then writes',
  WAITED,
  async (t) => {
    const { root, ops, head } = await store();
    const dir = scratch('ae-feed-hook-');
    const hook = path.join(dir, 'stop-after-journal.mjs');
    fs.writeFileSync(
      hook,
      [
        "import fs from 'node:fs';",
        'const append = fs.appendFileSync;',
        "fs.appendFileSync = (...a) => { fs.appendFileSync = append; append(...a); process.kill(process.pid, 'SIGSTOP'); };",
      ].join('\n'),
    );
    const code = [
      "import { Effect } from 'effect';",
      "import { Journal } from './src/core/engine/journal.ts';",
      `Effect.runSync(Journal.filesOps(process.env.FEED_ROOT).append('b', ${JSON.stringify(said(31))}));`,
    ].join('\n');
    const env = {
      ...process.env,
      FEED_ROOT: root,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${pathToFileURL(hook).href}`.trim(),
    };
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], { cwd: PACKAGE, env, stdio: 'ignore' });
    try {
      const pid = child.pid!;
      await holds(t, () => stateOf(pid).startsWith('T'), 'the writer stops after its journal line');
      assert.ok(fs.readFileSync(path.join(root, 'tasks', 'b.jsonl'), 'utf8').includes('"n31"'), 'its journal line is written');
      assert.ok(!fs.readFileSync(head, 'utf8').includes('"n31"'), 'its feed line is not');

      const error = await Effect.runPromise(Effect.flip(ops.forget!(['a'])));
      assert.ok(error.message.includes(`process ${pid}`), error.message);
      assert.ok(!fs.existsSync(path.join(root, 'feed.sealed.jsonl')), 'the rotation did nothing');
      assert.ok(fs.existsSync(path.join(root, 'tasks', 'a.jsonl')));

      const parked = await read(ops, 0);
      child.kill('SIGCONT');
      assert.equal(await exited(child), 0);
      await forget(ops, ['a']);
      const all = await read(ops, 0);
      assert.deepEqual(texts(all.entries).at(-1), 'b n31', "the writer's line is in the feed, last");
      const resumed = await read(ops, parked.cursor);
      assert.deepEqual(texts(resumed.entries), ['b n31'], 'a reader parked at the end before the rotation reads it, once');
      assert.deepEqual(texts((await read(ops, resumed.cursor)).entries), []);
    } finally {
      reap(child);
    }
  },
);

test('one append writes twice, the journal and the feed, and takes the lock once', async () => {
  const { ops } = await store();
  const before = ioCounts();
  await Effect.runPromise(ops.append('b', said(31) as never));
  const after = ioCounts();
  assert.deepEqual([after.writes - before.writes, after.locks - before.locks], [2, 1]);
  assert.ok(after.lockWaitMs >= before.lockWaitMs);
});

/** A store whose feed holds, in turn, `counts[id]` lines of each task, its first one filed. */
const storeOf = async (counts: Record<string, number>) => {
  const ops = Journal.filesOps(scratch('ae-feed-counts-'));
  let n = 0;
  for (const [id, lines] of Object.entries(counts))
    for (let i = 0; i < lines; i++) await Effect.runPromise(ops.append(id, (i === 0 ? filed(++n) : said(++n)) as never));
  return ops;
};

test('a rotation answers the lines it forgot of each task, and leaves out a task given that had none', async () => {
  const ops = await storeOf({ a: 3, c: 2, b: 5 });
  const rotated = await forget(ops, ['a', 'b', 'z']);
  assert.deepEqual(rotated?.linesByTask, { a: 3, b: 5 });
  assert.equal(rotated?.linesForgotten, 8);
});

test("the store's count of each task's feed lines is what a rotation then forgets of it, skips a line forgotten before, and is no prefix match", async () => {
  const ops = await storeOf({ a: 3, ab: 4, b: 5, c: 2 });
  const counted = (ids: string[]) => Effect.runPromise(ops.feedLines!(ids));
  assert.deepEqual(await counted(['a', 'b', 'z']), { a: 3, b: 5, z: 0 });
  assert.deepEqual(await counted(['ab']), { ab: 4 }, "an id another task's begins with counts its own lines alone");
  await forget(ops, ['c']);
  await Effect.runPromise(ops.append('d', filed(40) as never));
  assert.deepEqual(
    await counted(['a', 'c', 'd']),
    { a: 3, c: 0, d: 1 },
    'the lines a rotation forgot are not counted; those it sealed and those after it are',
  );
  const rotated = await forget(ops, ['a', 'b', 'c', 'd']);
  assert.deepEqual(rotated?.linesByTask, { a: 3, b: 5, d: 1 });
});
