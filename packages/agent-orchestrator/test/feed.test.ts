/**
 * The feed on disk (`wf feed`, `wf watch`): what the tick judged of each run and each step, a line each time it changed, in a store of its own.
 *
 * A file of its own, since `tick` reads every run under `WF_ROOT` and writes the store's one feed: the runs of the other store tests would be
 * in it. The fold and the diff are pure, and are tested here beside the file, since what matters of them is what the file ends up saying.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import type { Engine } from 'agent-runtime';
import type { Run, TaskPhase } from '../src/run.ts';
import { feedPhase, feedWords, listing } from '../src/run.ts';
import { feedChanges, foldFeed, type FeedLine } from '../src/feed.ts';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-feed-');
const RUNS = path.join(ROOT, 'runs');
const FEED = path.join(ROOT, 'feed.jsonl');

// WF_ROOT is read as the module loads, so it is set before the import rather than after it.
process.env.WF_ROOT = ROOT;
// Every run a pass answers from its memo of runs at rest is judged in full as well, and a difference throws (`verifyRest` in tick.ts).
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
const { approve, cancel, feedCursorRefusal, feedFile, freshFeedMemo, readFeed, readRun, recordFeed, start, tick, watchFeed } = await import('../src/runner.ts');
const { main, watchPrinted } = await import('../src/cli.ts');

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };

/** Refused by name: exit 2, and the message — never `String(err)`, which starts with `Error: `. */
const refusedWith = (pattern: RegExp) => (err: Error & { exitCode?: number }) => err.exitCode === 2 && pattern.test(err.message);

/**
 * An engine board a test settles by hand, as queue-store.test.ts's: a task filed is `pending`, one given a live word (`running (working)`) is
 * running with it, and a settled one carries the closeout it is given. It counts its reads, so a test can say the feed asked for none.
 */
const board = () => {
  const tasks = new Map<string, { spec: { id: string; brief: string; closeoutSchema?: object }; phase: string; closeout?: unknown }>();
  const settledPhase = (p: string) => ['succeeded', 'failed', 'stopped'].includes(p);
  let views = 0;
  const e = {
    tick: async () => ({ tasks: 0, actions: [], running: {}, views: [] }),
    admit: async () => [],
    view: async (id: string) => {
      views++;
      const t = tasks.get(id);
      return {
        id, phase: t?.phase ?? 'pending', sessionId: t ? 's' : null,
        state: {
          brief: t?.spec.brief ?? '', closeoutSchema: t?.spec.closeoutSchema, settled: t && settledPhase(t.phase) ? t.phase : null, stopRequested: false, said: [],
          attempts: !t || t.phase === 'pending' ? [] : [{ n: 1, ended: null, nativeId: `native-${id}`, closeout: t.closeout, exitCode: null, usage: null, startedAt: '2026-09-22T10:00:00.000Z', spawnedAt: '2026-09-22T10:00:00.000Z', endedAt: null, reason: null }],
        },
      };
    },
    file: async (spec: { id: string; brief: string }) => { tasks.set(spec.id, { spec, phase: 'pending' }); return spec.id; },
    stop: async (id: string) => { const t = tasks.get(id); if (t && !settledPhase(t.phase)) t.phase = 'stopped'; },
    logs: async () => '(no output yet)',
    feed: async () => ({ entries: [], cursor: 0 }),
  } as unknown as Engine;
  const set = (id: string, phase: TaskPhase | string, closeout?: unknown) => Object.assign(tasks.get(id)!, { phase, closeout });
  return { e, set, views: () => views };
};

/** A store with no runs and no feed. */
const emptyStore = () => {
  for (const dir of [RUNS, FEED, path.join(ROOT, 'tick.json')]) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(RUNS, { recursive: true });
};

/** A repository with one commit, so a start has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, stdio: 'ignore' });
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'base');
  return repo;
};

/** A workflow of `plan → implement`, whose plan waits at its gate for a person. */
const gated = (() => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'plan.md'), '---\ngate: true\n---\nplan it\n');
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nafter: plan\n---\nimplement it\n');
  return dir;
})();

const started = (brief: string): Run => start({ brief, repo: aRepo(), workflowDir: gated, isolate: false });

/** Every line in the feed, read off the file as a reader with cursor 0 would. */
const lines = (): FeedLine[] => readFeed(0).lines;
const size = (): number => fs.statSync(FEED, { throwIfNoEntry: false })?.size ?? 0;
/** The lines about one run, or one step of it, and their words in order. */
const words = (run: string, step?: string): string[] => lines().filter((l) => l.run === run && l.step === step).map((l) => l.word);

/** What `main` printed, line by line, for one verb. */
const printedBy = async (t: { mock: { method: (o: object, m: string, f: (...a: unknown[]) => void) => { mock: { restore: () => void } } } }, e: Engine, ...argv: string[]): Promise<string[]> => {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => { printed.push(args.join(' ')); });
  try { await main(argv, e); } finally { log.mock.restore(); }
  return printed.join('\n').split('\n');
};

/** The pass's words for every run, as `tick` hands them to the feed: what a restarted daemon's first pass would judge. */
const judged = (pass: Awaited<ReturnType<typeof tick>>) => new Map(pass.runs.map((a) => [a.run.id, a.feed]));

test('a transition is written once, not on every pass: the gate a step reaches, the approval that opens it, and the run done, each a line', async () => {
  emptyStore();
  const b = board();
  const run = started('the gate');

  await tick(b.e);
  assert.deepEqual(words(run.id), ['running'], 'the run says it is running, once');
  assert.equal(words(run.id, 'plan').length, 1, 'and each step says its first word, once');

  // Filed on that pass, it reads as filed on the next — the feed words what the pass read before it filed — and then says nothing more.
  for (let i = 0; i < 3; i++) await tick(b.e);
  assert.deepEqual(words(run.id, 'plan').slice(1), ['pending']);
  const quiet = size();
  await tick(b.e);
  assert.equal(size(), quiet, 'a pass that judged nothing new writes nothing');

  b.set(`${run.id}-plan`, 'succeeded', SIGNED);
  for (let i = 0; i < 4; i++) await tick(b.e);
  assert.deepEqual(words(run.id, 'plan').filter((w) => w === 'awaiting approval'), ['awaiting approval'], 'the gate reached is one line over four passes');
  const onYou = lines().filter((l) => l.run === run.id && l.step === undefined && l.note);
  assert.deepEqual(onYou.map((l) => l.note), ['waiting on you: approve plan'], 'and the run says, once, that it waits on a person');
  assert.deepEqual(onYou.map((l) => l.word), ['awaiting approval'], 'at its gate, in the word wf decide says it in: nothing failed');

  // A person's word: the approval is a file of its own, and the next pass's line is what it changed.
  await approve(b.e, run.id, 'plan');
  for (let i = 0; i < 3; i++) await tick(b.e);
  const plan = words(run.id, 'plan');
  assert.notEqual(plan.at(-1), 'awaiting approval', plan.join(' → '));
  assert.equal(new Set(plan).size, plan.length, `no word said twice in a row: ${plan.join(' → ')}`);
  const runLines = lines().filter((l) => l.run === run.id && l.step === undefined);
  assert.equal(runLines.at(-1)!.note, undefined, 'the run no longer waits on you');
  assert.deepEqual(words(run.id, 'implement').at(-1), 'pending');

  b.set(`${run.id}-implement`, 'succeeded', SIGNED);
  for (let i = 0; i < 3; i++) await tick(b.e);
  assert.deepEqual(words(run.id).filter((w) => w === 'succeeded'), ['succeeded']);

  // And every line carries its time, its run, and its word: the shape a reader parses.
  for (const l of lines()) assert.ok(typeof l.at === 'string' && l.run && l.word, JSON.stringify(l));
});

/** A workflow of `implement → ship`, whose ending waits at its gate for a person before it is filed: as the shipped `dev` ends. */
const ending = (() => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\n---\nimplement it\n');
  fs.writeFileSync(path.join(dir, 'ship.md'), '---\nafter: implement\nworkspace: main\ngate: true\n---\nship it\n');
  return dir;
})();

test("a run waiting at its ending's gate reads `awaiting approval` in the feed, as wf decide says it — never `failed`, since nothing failed", async (t) => {
  emptyStore();
  const b = board();
  const repo = aRepo();
  const run = start({ brief: 'the ship gate', repo, workflowDir: ending });
  await tick(b.e);
  // Work on the step's branch, as a session leaves it: a branch that never moved is read by git as merged already.
  const branch = readRun(run.id).steps.implement!.branch!;
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, encoding: 'utf8' }).trim();
  git('update-ref', `refs/heads/${branch}`, git('commit-tree', `${branch}^{tree}`, '-p', branch, '-m', 'the work'));
  b.set(`${run.id}-implement`, 'succeeded', SIGNED);
  for (let i = 0; i < 3; i++) await tick(b.e);

  assert.equal(words(run.id, 'ship').at(-1), 'awaiting approval', 'the ship step waits at its gate');
  const last = lines().filter((l) => l.run === run.id && l.step === undefined).at(-1)!;
  assert.deepEqual({ word: last.word, note: last.note }, { word: 'awaiting approval', note: 'waiting on you: approve ship' });
  assert.equal(words(run.id).includes('failed'), false, `no line of the run says failed: ${words(run.id).join(' → ')}`);
  // What wf decide says of the same run: awaiting approval, and nothing failed.
  const decided = (await printedBy(t, b.e, 'decide', run.id)).join('\n');
  assert.match(decided, /AWAITING APPROVAL, waiting on you: ship/);
  assert.doesNotMatch(decided, /FAILED/);

  // And a run in which a step did break says so: a word that fits a gate is not a word that hides a failure.
  const broke = start({ brief: 'the break', repo: aRepo(), workflowDir: ending });
  await tick(b.e);
  b.set(`${broke.id}-implement`, 'failed');
  for (let i = 0; i < 2; i++) await tick(b.e);
  assert.equal(words(broke.id).at(-1), 'failed');
});

test('a step that signed off blocked says what it needs on its line in the feed, made one line, beside BLOCKED — and the run says blocked, not failed', async () => {
  emptyStore();
  const b = board();
  const run = started('the question');
  await tick(b.e);
  const needs = 'Which colour —\n  red, or\tblue?\n\nThe brief says both.';
  b.set(`${run.id}-plan`, 'succeeded', { outcome: 'blocked', summary: 'stopped', artifacts: [], needs });
  for (let i = 0; i < 3; i++) await tick(b.e);

  const plan = lines().filter((l) => l.run === run.id && l.step === 'plan').at(-1)!;
  assert.match(plan.word, /BLOCKED/);
  assert.equal(plan.note, 'needs: Which colour — red, or blue? The brief says both.');
  assert.equal(lines().filter((l) => l.run === run.id && l.step === 'plan' && l.note?.startsWith('needs:')).length, 1, 'said once, over three passes');
  const said = lines().filter((l) => l.run === run.id && l.step === undefined).at(-1)!;
  assert.deepEqual({ word: said.word, note: said.note }, { word: 'blocked', note: 'waiting on you: plan' });

  // Long, it is clipped, and wf decide has it whole; a step that signed off done says nothing it needs, whatever its closeout holds.
  const long = started('the long question');
  const other = started('the done');
  await tick(b.e);
  b.set(`${long.id}-plan`, 'succeeded', { outcome: 'blocked', summary: 'stopped', artifacts: [], needs: 'why '.repeat(100) });
  b.set(`${other.id}-plan`, 'succeeded', { ...SIGNED, needs: 'nothing, really' });
  for (let i = 0; i < 2; i++) await tick(b.e);
  const clipped = lines().filter((l) => l.run === long.id && l.step === 'plan').at(-1)!.note!;
  assert.ok(clipped.startsWith('needs: why why') && clipped.endsWith('…') && clipped.length <= 'needs: '.length + 200, clipped);
  assert.equal(lines().some((l) => l.run === other.id && l.note?.includes('needs:')), false);
});

test('nothing is written when nothing changed, across a restart: a daemon with no fold of its own reads the feed, and says nothing again', async () => {
  emptyStore();
  const b = board();
  const run = started('the restart');
  for (let i = 0; i < 3; i++) await tick(b.e);
  const pass = await tick(b.e);
  const before = fs.readFileSync(FEED, 'utf8');

  // A restarted daemon: nothing in memory, the same world. Its first pass folds the feed from the start, and owes it no line.
  assert.deepEqual(recordFeed(judged(pass), { memo: freshFeedMemo() }), []);
  assert.equal(fs.readFileSync(FEED, 'utf8'), before);

  // The same after the world did change, then was written: the new process says what changed, once, and a second new one nothing.
  b.set(`${run.id}-plan`, 'succeeded', SIGNED);
  const moved = await tick(b.e);
  const after = size();
  assert.ok(after > before.length, 'the pass wrote the gate');
  assert.deepEqual(recordFeed(judged(moved), { memo: freshFeedMemo() }), []);
  assert.equal(size(), after);

  // And a fold that is not the feed — a daemon that remembered nothing and read nothing — would say every word again: what makes the
  // restart quiet is reading the feed, not the memo.
  fs.rmSync(FEED);
  assert.ok(recordFeed(judged(moved), { memo: freshFeedMemo() }).length > 0);
});

test("a step's live word moving — `running (working)` to `running (idle)` and back — writes nothing: the feed says running, once", async () => {
  emptyStore();
  const b = board();
  const run = started('the flicker');
  await tick(b.e);
  await tick(b.e);
  b.set(`${run.id}-plan`, 'running (working)');
  await tick(b.e);
  const once = size();
  for (const live of ['running (idle)', 'working (quiescent)', 'running (working)', 'between attempts']) {
    b.set(`${run.id}-plan`, live);
    await tick(b.e);
  }
  assert.equal(size(), once, lines().slice(-3).map((l) => JSON.stringify(l)).join('\n'));
  assert.equal(words(run.id, 'plan').at(-1), 'running');

  // A word the tick decides on is not folded: a session its harness blocked is a person's to answer.
  b.set(`${run.id}-plan`, 'needs-human');
  await tick(b.e);
  assert.equal(words(run.id, 'plan').at(-1)!.startsWith('needs-human'), true, words(run.id, 'plan').join(' → '));
});

test('a person calling the run off writes one line, and a run gone from the store writes one `removed`, then nothing', async () => {
  emptyStore();
  const b = board();
  const stays = started('the one that stays');
  const goes = started('the one that goes');
  for (let i = 0; i < 2; i++) await tick(b.e);

  await cancel(b.e, stays.id);
  for (let i = 0; i < 3; i++) await tick(b.e);
  assert.deepEqual(words(stays.id).filter((w) => w === 'cancelled'), ['cancelled']);

  // `wf rm` removes the record, and the feed keeps the run's lines: the next pass says it is gone, once, with no line for its steps.
  fs.rmSync(path.join(RUNS, `${goes.id}.json`));
  const before = lines().length;
  for (let i = 0; i < 3; i++) await tick(b.e);
  const said = lines().slice(before);
  assert.deepEqual(said.map((l) => [l.run, l.step, l.word]), [[goes.id, undefined, 'removed']]);
  // And a restarted daemon reads it as gone: nothing said of it again.
  assert.deepEqual(recordFeed(judged(await tick(b.e)), { memo: freshFeedMemo() }), []);
});

test("a pruned run's word says so, once: `wf prune`'s marker is a person's fact, and the run's line gains it", async () => {
  emptyStore();
  const b = board();
  const run = started('the pruned');
  await tick(b.e);
  fs.writeFileSync(path.join(RUNS, `${run.id}.pruned`), JSON.stringify({ at: '2026-09-22T10:00:00.000Z', worktrees: [] }));
  for (let i = 0; i < 3; i++) await tick(b.e);
  assert.equal(readRun(run.id).pruned !== undefined, true);
  assert.deepEqual(words(run.id).filter((w) => w.endsWith('(pruned)')), ['running (pruned)']);
});

test('REFUSED: a cursor inside a line is refused by name, by the read, by `wf feed` and by `wf watch` — and one past the end, and one that is not a number', async (t) => {
  emptyStore();
  const b = board();
  started('the cursor');
  await tick(b.e);
  const { cursor } = readFeed(0);
  assert.equal(cursor, size());
  const inside = cursor - 2;

  assert.throws(() => readFeed(inside), refusedWith(new RegExp(`^cursor ${inside} falls inside a line of the feed, not after one`)));
  await assert.rejects(main(['feed', String(inside)], b.e), refusedWith(/^cursor \d+ falls inside a line/));
  const log = t.mock.method(console, 'log', () => {});
  try {
    await assert.rejects(main(['watch', String(inside)], b.e), refusedWith(/^cursor \d+ falls inside a line/));
    assert.equal(log.mock.callCount(), 0, 'refused before it says it is watching');
  } finally { log.mock.restore(); }
  assert.throws(() => watchFeed({ from: inside, onLine: () => {} }), refusedWith(/falls inside a line/));

  assert.throws(() => readFeed(cursor + 10), refusedWith(new RegExp(`^cursor ${cursor + 10} is past the end of the feed \\(${cursor} bytes, .*wf feed 0$`)));
  await assert.rejects(main(['feed', 'twelve'], b.e), refusedWith(/^wf feed takes one cursor at most, a whole number of bytes/));
  await assert.rejects(main(['feed', '0', '1'], b.e), refusedWith(/^wf feed takes one cursor at most/));
  assert.throws(() => readFeed(-1), refusedWith(/^a feed cursor is a whole number of bytes/));

  // Every cursor a read hands out is one the next read takes: 0, each line's end, and the end.
  let at = 0;
  for (const line of fs.readFileSync(FEED, 'utf8').split('\n').slice(0, -1)) {
    at += Buffer.byteLength(line) + 1;
    assert.doesNotThrow(() => readFeed(at));
  }
  assert.equal(at, cursor);
  // And a feed not written yet reads as nothing, at 0 — where every reader starts.
  emptyStore();
  assert.deepEqual(readFeed(0), { lines: [], cursor: 0 });
});

test('the cursor never passes a partial line: a line being written is not read, nor stepped over, and is read once it ends', () => {
  emptyStore();
  const whole = JSON.stringify({ at: '2026-09-22T10:00:00.000Z', run: 'r-a', word: 'running' });
  const next = JSON.stringify({ at: '2026-09-22T10:00:04.000Z', run: 'r-a', step: 'plan', word: 'pending' });
  fs.writeFileSync(FEED, `${whole}\n${next.slice(0, 20)}`);

  const first = readFeed(0);
  assert.deepEqual(first.lines.map((l) => l.word), ['running']);
  assert.equal(first.cursor, Buffer.byteLength(whole) + 1, 'the cursor stops where the partial line starts');
  assert.deepEqual(readFeed(first.cursor), { lines: [], cursor: first.cursor }, 'and reading from there again reads nothing, and moves nothing');

  fs.appendFileSync(FEED, `${next.slice(20)}\n`);
  const second = readFeed(first.cursor);
  assert.deepEqual(second.lines.map((l) => l.word), ['pending'], 'the line is read once it ends');
  assert.equal(second.cursor, size());
});

test('a line a writer died in the middle of is ended by the next pass, and costs that line alone', async () => {
  emptyStore();
  const b = board();
  const run = started('the torn');
  await tick(b.e);
  const good = lines().length;
  fs.appendFileSync(FEED, '{"at":"2026-09-22T10:00:00.000Z","run":"r-torn","wo');

  b.set(`${run.id}-plan`, 'succeeded', SIGNED);
  await tick(b.e);
  await tick(b.e);
  const text = fs.readFileSync(FEED, 'utf8');
  assert.ok(text.endsWith('\n'));
  assert.ok(text.includes('"wo\n{'), 'the torn line is ended before the pass writes');
  const after = lines();
  assert.ok(after.length > good, 'the pass after it is read whole');
  assert.equal(after.some((l) => l.run === 'r-torn'), false, 'and the torn line is read by nobody');
  // And nothing after it is said twice.
  const plan = after.filter((l) => l.run === run.id && l.step === 'plan').map((l) => l.word);
  assert.equal(new Set(plan).size, plan.length, plan.join(' → '));
});

test('`wf feed` prints each line and the cursor to read on from; `wf watch` follows the lines as they are written, until stopped', async (t) => {
  emptyStore();
  const b = board();
  const run = started('the watch');
  await tick(b.e);
  const printed = await printedBy(t, b.e, 'feed');
  assert.equal(printed.at(-1), `cursor: ${size()}`);
  assert.ok(printed.some((l) => l.includes(run.id) && l.endsWith('running')), printed.join('\n'));
  assert.deepEqual(await printedBy(t, b.e, 'feed', String(size())), [`cursor: ${size()}`], 'from the end, nothing but the cursor');

  const got: FeedLine[] = [];
  let arrived: () => void = () => {};
  const from = size();
  const watch = watchFeed({ from, intervalMs: 20, onLine: (l) => { got.push(l); if (got.length >= 2) arrived(); } });
  try {
    const two = new Promise<void>((resolve) => { arrived = resolve; });
    b.set(`${run.id}-plan`, 'succeeded', SIGNED);
    await tick(b.e);
    // Waited for by what it counts, under a bound of seconds — never a length of time.
    await Promise.race([two, new Promise((_, reject) => setTimeout(() => reject(new Error(`the watch delivered ${got.length} lines in 5s`)), 5_000))]);
    assert.deepEqual(got, readFeed(from).lines.slice(0, got.length), 'the lines, in order, as the feed has them');
  } finally { watch.stop(); }
  const stopped = got.length;
  await tick(b.e);
  fs.appendFileSync(FEED, `${JSON.stringify({ at: '2026-09-22T10:00:00.000Z', run: 'r-after', word: 'running' })}\n`);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(got.length, stopped, 'a watch stopped delivers nothing more');
});

test("a watch hands each line on with its own cursor: the byte after it, in bytes not characters, where a reader resumes with the lines after it and no other", async () => {
  emptyStore();
  const line = (run: string, word: string, note?: string) => JSON.stringify({ at: '2026-09-22T10:00:00.000Z', run, word, ...(note ? { note } : {}) });
  // A note of three-byte dashes, then a line a writer died in, ended by the next: its bytes move the cursor and it is handed on to nobody.
  fs.writeFileSync(FEED, [line('r-a', 'running'), line('r-a', 'awaiting approval', 'round 2 — asked — approve it'), '{"at":"2026-09-22T10:00:00.000Z","run":"r-torn","wo', line('r-b', 'running'), line('r-a', 'done')].map((l) => `${l}\n`).join(''));
  const whole = readFeed(0);
  assert.equal(whole.lines.length, 4);

  const got: { line: FeedLine; cursor: number }[] = [];
  let arrived: () => void = () => {};
  const all = new Promise<void>((resolve) => { arrived = resolve; });
  const watch = watchFeed({ intervalMs: 20, onLine: (l, cursor) => { got.push({ line: l, cursor }); if (got.length >= whole.lines.length) arrived(); } });
  try {
    await Promise.race([all, new Promise((_, reject) => setTimeout(() => reject(new Error(`the watch delivered ${got.length} lines in 5s`)), 5_000))]);
  } finally { watch.stop(); }

  assert.deepEqual(got.map((g) => g.line), whole.lines, 'every line, once, in order');
  for (const [i, { cursor }] of got.entries()) {
    assert.equal(feedCursorRefusal(cursor), undefined, `line ${i}'s cursor is one the feed takes`);
    assert.deepEqual(readFeed(cursor).lines, whole.lines.slice(i + 1), `from line ${i}'s cursor, the lines after it and no other`);
  }
  assert.equal(got.at(-1)!.cursor, whole.cursor, "the last line's cursor is the end a read hands out");
  assert.equal(got[2]!.cursor - got[1]!.cursor > Buffer.byteLength(line('r-b', 'running')) + 1, true, "the torn line's bytes are counted into the next line's cursor");
});

test('`wf watch` survives a feed cut under it: truncated, deleted or replaced, it says so once and delivers the next transition', async () => {
  emptyStore();
  const b = board();
  const run = started('the cut');
  await tick(b.e);
  // A real `wf watch`, since it never returns: its process is killed at the end. Its engine is never asked anything.
  const cli = new URL('../src/cli.ts', import.meta.url).href;
  const child = spawn(process.execPath, ['--input-type=module', '-e', `const { main } = await import(${JSON.stringify(cli)}); await main(['watch', '${size()}'], {});`], {
    env: { ...process.env, WF_ROOT: ROOT }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  let err = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { err += d; });
  /** Wait until `ok` holds of what the watch printed, under a bound of seconds: for what it counts, never a length of time. */
  const printed = async (ok: () => boolean, what: string) => {
    const bound = Date.now() + 10_000;
    while (!ok()) {
      if (Date.now() > bound) throw new Error(`${what} — stdout:\n${out}\nstderr:\n${err}`);
      await new Promise((r) => setTimeout(r, 20));
    }
  };
  const cuts = () => err.split('\n').filter((l) => l.includes('under this watch'));
  try {
    await printed(() => out.includes('watching from'), 'the watch starts');

    // Truncated to nothing: said once, and the watch reads the feed the tick writes again from its start — the transition among it.
    fs.truncateSync(FEED, 0);
    await printed(() => cuts().length === 1, 'the truncation is said');
    assert.match(cuts()[0]!, /^wf watch: the feed was truncated under this watch at cursor \d+, and is 0 bytes now .*from its start/);
    b.set(`${run.id}-plan`, 'succeeded', SIGNED);
    await tick(b.e);
    await tick(b.e);
    await printed(() => /\splan\s+awaiting approval/.test(out), 'the gate reached after the cut is delivered');

    // Deleted: the same.
    const before = out.length;
    fs.rmSync(FEED);
    await printed(() => cuts().length === 2, 'the deletion is said');
    assert.match(cuts()[1]!, /the feed was deleted under this watch/);
    await approve(b.e, run.id, 'plan');
    for (let i = 0; i < 2; i++) await tick(b.e);
    await printed(() => /\splan\s+(?!awaiting)/.test(out.slice(before)), 'the approval after the deletion is delivered');

    // Replaced by another file of the same bytes and more: nothing about its size tells, its inode does.
    const at = out.length;
    const next = `${FEED}.next`;
    fs.writeFileSync(next, `${fs.readFileSync(FEED, 'utf8')}${JSON.stringify({ at: '2026-09-22T10:00:00.000Z', run: 'r-new', word: 'running' })}\n`);
    fs.renameSync(next, FEED);
    await printed(() => out.slice(at).includes('r-new'), 'the replacement is read');
    assert.equal(cuts().length, 3);
    assert.match(cuts()[2]!, /the feed was replaced under this watch/);

    // Once each: every beat after reads on, and says nothing more — no `past the end`, ever.
    const quiet = err;
    fs.appendFileSync(FEED, `${JSON.stringify({ at: '2026-09-22T10:00:01.000Z', run: 'r-last', word: 'running' })}\n`);
    await printed(() => out.includes('r-last'), 'the line after is delivered');
    assert.equal(err, quiet, 'nothing more said');
    assert.doesNotMatch(err, /past the end|falls inside a line/);
  } finally {
    child.kill();
  }
});

test('`wf watch` says it is watching only once it holds its cursor: a feed cut the moment the banner is read is said, not refused', async (t) => {
  emptyStore();
  const line = JSON.stringify({ at: '2026-09-22T10:00:00.000Z', run: 'r-a', word: 'running' });
  fs.writeFileSync(FEED, `${line}\n${line}\n`);
  const from = size();
  // A reader acting on the banner at once, as fast as it can: in this process, before the next line of the watch's own start.
  const out: string[] = [];
  const err: string[] = [];
  t.mock.method(console, 'log', (...a: unknown[]) => {
    out.push(a.join(' '));
    if (a.join(' ').startsWith('watching from')) fs.truncateSync(FEED, 0);
  });
  t.mock.method(console, 'error', (...a: unknown[]) => { err.push(a.join(' ')); });
  const watch = watchPrinted(from);
  try {
    assert.deepEqual(out, [`watching from ${from}, ^C to stop`]);
    const bound = performance.now() + 10_000;
    while (!err.length) {
      assert.ok(performance.now() < bound, 'the truncation was not said in 10s');
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.match(err[0]!, /^wf watch: the feed was truncated under this watch at cursor \d+, and is 0 bytes now .*from its start/);
  } finally { watch.stop(); }
});

test('REFUSED: a watch not told what to do about a cut feed refuses to read it, on every beat — the api ends its stream on that', async () => {
  emptyStore();
  const line = JSON.stringify({ at: '2026-09-22T10:00:00.000Z', run: 'r-a', word: 'running' });
  fs.writeFileSync(FEED, `${line}\n${line}\n`);
  const errors: Error[] = [];
  const watch = watchFeed({ from: size(), intervalMs: 20, onLine: () => {}, onError: (e) => { errors.push(e as Error); } });
  try {
    fs.truncateSync(FEED, 0);
    const bound = Date.now() + 5_000;
    while (errors.length < 2) {
      assert.ok(Date.now() < bound, `refused ${errors.length} times in 5s`);
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.ok(errors.every(refusedWith(/is past the end of the feed/)), errors.map((e) => e.message).join('\n'));
  } finally { watch.stop(); }
});

test('a watch says each read that works, before the lines it found and whether or not it found any, and no read that fails', async (t) => {
  if (process.getuid?.() === 0) return t.skip('a mode of 000 does not keep root from reading');
  emptyStore();
  fs.writeFileSync(FEED, `${JSON.stringify({ at: '2026-09-22T10:00:00.000Z', run: 'r-a', word: 'running' })}\n`);
  const said: string[] = [];
  /** Wait until `ok` holds of what the watch said, under a bound of seconds: for the beats counted, never a length of time. */
  const heard = async (ok: () => boolean, what: string) => {
    const bound = Date.now() + 5_000;
    while (!ok()) {
      if (Date.now() > bound) throw new Error(`${what}: the watch said ${said.join(', ')}`);
      await new Promise((r) => setTimeout(r, 10));
    }
  };
  const count = (word: string) => said.filter((w) => w === word).length;
  const watch = watchFeed({ intervalMs: 20, onLine: () => { said.push('line'); }, onRead: () => { said.push('read'); }, onError: () => { said.push('error'); } });
  try {
    await heard(() => count('read') >= 4, 'reads that find nothing are said too');
    assert.deepEqual(said.slice(0, 2), ['read', 'line'], 'the read, then the line it found');
    assert.equal(count('line'), 1);

    fs.chmodSync(FEED, 0o000);
    try {
      await heard(() => count('error') >= 1, 'a read that fails goes to onError');
      const at = said.lastIndexOf('error');
      await heard(() => said.slice(at + 1).includes('error'), 'and so does the next');
      assert.deepEqual(said.slice(at).filter((w) => w !== 'error'), [], 'no read is said while reads fail');
    } finally {
      fs.chmodSync(FEED, 0o644);
    }
    const back = said.length;
    await heard(() => said.slice(back).includes('read'), 'the first read that works is said, with nothing new written');
    assert.equal(count('line'), 1);
  } finally { watch.stop(); }
});

test('`wf --help` names wf feed and wf watch, and says which feed is whose', async (t) => {
  const printed = (await printedBy(t, board().e, '--help')).join('\n');
  assert.match(printed, /^ {2}wf feed \[cursor\] /m);
  assert.match(printed, /^ {2}wf watch \[cursor\] /m);
  assert.match(printed, /wf watch follows what the workflow decides/);
  assert.match(printed, /ae watch/);
});

test('the feed asks the engine nothing of its own: a pass reads each task as many times with the feed as the judgement did', async () => {
  emptyStore();
  const b = board();
  started('the reads');
  await tick(b.e);
  await tick(b.e);
  const before = b.views();
  await tick(b.e);
  const perPass = b.views() - before;
  // One read per task filed — the plan's — per pass: what `advance` reads for its own judgement, and nothing for the feed.
  assert.equal(perPass, 1);
  assert.equal(feedFile(), FEED);
});

// ─── pure: the words, the fold, the diff ────────────────────────────────────

test("feedPhase folds the engine's live words into running, and keeps every word a decision reads", () => {
  for (const live of ['running (working)', 'running (idle)', 'working (quiescent)', 'starting', 'between attempts']) assert.equal(feedPhase(live), 'running', live);
  for (const kept of ['pending', 'needs-human', 'succeeded', 'failed', 'stopped', 'unknown']) assert.equal(feedPhase(kept), kept);
});

test('feedWords says the run with its prune, what waits on a person as a note, and a slot wait without its count', () => {
  const steps = [{ name: 'plan', after: [], brief: 'plan it' }] as unknown as Parameters<typeof listing>[0];
  const run = { id: 'r-1', brief: 'b', createdAt: '2026-09-22T10:00:00.000Z', steps: {}, repo: '/r', branch: 'wf/r-1', base: 'main' } as unknown as Run;
  const held = listing(steps, run, () => 'unknown', () => undefined, undefined, undefined, [], [], [], [], undefined, undefined, { inFlight: 2, cap: 2 });
  const a = feedWords(held, run, { status: 'running' });
  assert.deepEqual(a.run, { word: 'running' });
  assert.deepEqual(a.steps.map((s) => s.word), ['waiting for a run slot']);
  const other = listing(steps, run, () => 'unknown', () => undefined, undefined, undefined, [], [], [], [], undefined, undefined, { inFlight: 3, cap: 3 });
  assert.deepEqual(feedWords(other, run, { status: 'running' }), a, 'the count in flight moving is not a change');
  assert.deepEqual(feedWords(held, { pruned: { at: '', worktrees: [] } }, { status: 'succeeded' }).run, { word: 'succeeded (pruned)' });
  // A run stopped on a person's word, and not on anything that broke, says what it stopped on — pruned too — and one that broke says failed.
  assert.deepEqual(feedWords(held, run, { status: 'failed', stoppedOn: 'awaiting approval' }).run, { word: 'awaiting approval' });
  assert.deepEqual(feedWords(held, { pruned: { at: '', worktrees: [] } }, { status: 'failed', stoppedOn: 'blocked' }).run, { word: 'blocked (pruned)' });
  assert.deepEqual(feedWords(held, run, { status: 'failed' }).run, { word: 'failed' });
});

test('the fold keeps the last word of each run and step, forgets a removed run, and the diff owes a line only for what moved', () => {
  const at = '2026-09-22T10:00:00.000Z';
  const fold = foldFeed(new Map(), [
    { at, run: 'r-1', word: 'running' },
    { at, run: 'r-1', step: 'plan', word: 'pending' },
    { at, run: 'r-1', step: 'plan', word: 'running' },
    { at, run: 'r-2', word: 'running' },
    { at, run: 'r-2', word: 'removed' },
    { at, run: 'r-3', word: 'running', note: 'waiting on you: approve plan' },
  ]);
  assert.deepEqual([...fold.keys()], ['r-1', 'r-3']);
  const now = new Map([
    ['r-1', { run: { word: 'running' }, steps: [{ name: 'plan', word: 'running' }, { name: 'implement', word: 'waiting' }] }],
    ['r-3', { run: { word: 'running' }, steps: [] }],
    ['r-2', { run: { word: 'running' }, steps: [] }],
  ]);
  assert.deepEqual(feedChanges(fold, now, at), [
    { at, run: 'r-1', step: 'implement', word: 'waiting' },
    { at, run: 'r-3', word: 'running' },
    { at, run: 'r-2', word: 'running' },
  ], 'a new step, a note gone, and a run back under an id it had');
  assert.deepEqual(feedChanges(fold, new Map(), at), [{ at, run: 'r-1', word: 'removed' }, { at, run: 'r-3', word: 'removed' }]);
});
