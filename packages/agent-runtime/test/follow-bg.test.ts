/**
 * A background Claude Code session followed live (`bgFollowOf`), at a pace shorter than shipped — a fake `claude` on `PATH` whose `agents` prints
 * the rows a test writes, and transcripts where Claude Code writes them, grown by hand as a session would.
 *
 * - Each line appended to the transcript is said once, in order, as whole events, each byte of it read once from where the last read
 *   stopped, and with the cursor a read of the transcript gives there.
 * - The state comes from `claude agents`: a turn ended with the process held is `input-required`, the next turn `working`, and the
 *   follow goes on across both and across the gap in which Claude Code respawns the process; it ends once the session is over.
 * - An attempt resumed under a new session id is followed from its transcript's end: what it carries of its parent is not said again.
 * - Where Claude Code writes transcripts is read when its reader is loaded, so `CLAUDE_CONFIG_DIR` is set before the import.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Cause, Effect, Exit, Stream } from 'effect';
import { TestClock } from 'effect/testing';
import type { Followed, RunnerError, RunnerOps, TranscriptEvent } from '../src/harness/seam.ts';
import { scratch } from './scratch.ts';
import { bell, until, WAITED } from '../src/waits/index.ts';

const config = scratch('ae-follow-bg-config-');
process.env.CLAUDE_CONFIG_DIR = config;
const { claudeCodeOps } = await import('../src/harness/claude/code.ts');
const { FOLLOW_PACE_MS, followedStateOf, sharedListing } = await import('../src/harness/claude/bg-follow.ts');
const { claudeTranscriptEvents } = await import('../src/harness/claude/transcript.ts');
const { readTranscript } = await import('../src/harness/transcript.ts');
const { ioCounts } = await import('../src/core/engine/tally.ts');
const { a2aOps } = await import('../src/a2a/client.ts');
const { HarnessHandler } = await import('../src/a2a/handler.ts');

type Row = { name: string; sessionId: string; state: string; status?: string; waitingFor?: string; startedAt?: number; pid?: number };

const bin = scratch('ae-follow-bg-bin-');
const registry = path.join(bin, 'registry');
const calls = path.join(bin, 'agents-calls');
fs.writeFileSync(registry, '[]');
fs.writeFileSync(calls, '');
fs.writeFileSync(
  path.join(bin, 'claude'),
  `#!${process.execPath}
const fs = require('node:fs');
if (process.argv[2] !== 'agents') process.exit(1);
fs.appendFileSync(${JSON.stringify(calls)}, 'x');
const listed = fs.readFileSync(${JSON.stringify(registry)}, 'utf8');
if (listed === 'FAIL') { process.stderr.write('the listing failed\\n'); process.exit(1); }
process.stdout.write(listed);
`,
  { mode: 0o755 },
);
process.env.PATH = `${bin}:${process.env.PATH}`;

/** Lists `rows` as `claude agents` does; a string is printed as it is. */
const list = (rows: Row[] | string) => fs.writeFileSync(registry, typeof rows === 'string' ? rows : JSON.stringify(rows));

const projects = path.join(config, 'projects', '-work');
fs.mkdirSync(projects, { recursive: true });

/** The transcript of the session `sessionId`, where Claude Code writes it. */
const transcriptOf = (sessionId: string) => path.join(projects, `${sessionId}.jsonl`);

const line = (o: object) => `${JSON.stringify(o)}\n`;
const said = (uuid: string, text: string) =>
  line({
    type: 'assistant',
    uuid,
    timestamp: '2026-10-07T12:00:00.000Z',
    message: { id: `msg_${uuid}`, role: 'assistant', content: [{ type: 'text', text }] },
  });

/** A session of ours, `name`, in the row Claude Code lists for it: its id, and the row in `state`, with `pid` where it has one. */
const session = (name: string) => {
  const sessionId = randomUUID();
  const file = transcriptOf(sessionId);
  return {
    sessionId,
    file,
    row: (state: string, pid?: number): Row => ({ name, sessionId, state, status: 'busy', startedAt: 1, ...(pid ? { pid } : {}) }),
    append: (text: string) => fs.appendFileSync(file, text),
  };
};

/** Rung on each moment a follower is handed. */
const rung = bell();

/** What `name` is followed as through `ops`, pushed to `got` as it comes, ringing `rung`; resolves with the stream's exit once it ends. */
const follow = (ops: Pick<RunnerOps, 'follow'>, name: string, got: Followed[]) =>
  Effect.runPromiseExit(
    Stream.runForEach(ops.follow!(name), (m) =>
      Effect.sync(() => {
        got.push(m);
        rung.ring();
      }),
    ),
  );

/**
 * The follow's pace these tests give it (`ClaudeOptions.followPaceMs`): a pass waits for a listing that changed without a change of
 * the transcript, so at the shipped `FOLLOW_PACE_MS` each move of a row cost a second of every pass of this file.
 */
const PACE_MS = 100;
const ops = () => claudeCodeOps({ root: scratch('ae-follow-bg-root-'), followPaceMs: PACE_MS });

test('the follows here are paced shorter than shipped, never longer', () => {
  assert.ok(PACE_MS < FOLLOW_PACE_MS);
});
const states = (got: readonly Followed[]) => got.flatMap((m) => (m.kind === 'state' ? [m.state] : []));
const events = (got: readonly Followed[]): TranscriptEvent[] => got.flatMap((m) => (m.kind === 'events' ? m.events : []));
const ids = (got: readonly Followed[]) => events(got).map((e) => e.id);
const PID = process.pid;

test(
  'a followed background session says its state, then each line appended to its transcript once and in order, every byte read once from where the last read stopped, and each cursor the one a read of the transcript gives there; it ends when the session is done',
  WAITED,
  async (t) => {
    const s = session('ae/b1/1');
    for (let i = 0; i < 40; i++) s.append(said(`seed-${i}`, 'x'.repeat(200)));
    assert.ok(fs.statSync(s.file).size > 8192, 'a transcript longer than two reads of its tail');
    list([s.row('working', PID)]);
    const got: Followed[] = [];
    const before = ioCounts().bytesRead;
    const ended = follow(ops(), 'ae/b1/1', got);
    await until(t, () => got.length > 0, 'the first moment', { bell: rung });
    assert.deepEqual(got, [{ kind: 'state', state: 'working' }], 'its state first, and nothing written before');
    assert.equal(ioCounts().bytesRead - before, 4096, 'the transcript read backwards from its end, one window, to its last line');

    const a = said('a-1', 'First.');
    s.append(a);
    await until(t, () => ids(got).includes('a-1:0'), 'the first line said', { bell: rung });
    const b = said('b-1', 'Second.');
    const half = Math.floor(b.length / 2);
    s.append(b.slice(0, half));
    const read = 4096 + Buffer.byteLength(a);
    await until(t, () => ioCounts().bytesRead - before === read + half, 'half a line read', { everyMs: 20 });
    assert.deepEqual(ids(got), ['a-1:0'], 'half a line is no event');
    s.append(b.slice(half));
    await until(t, () => ids(got).includes('b-1:0'), 'the second line said', { bell: rung });
    assert.equal(ioCounts().bytesRead - before, read + Buffer.byteLength(b), 'each byte read once');
    assert.deepEqual(ids(got), ['a-1:0', 'b-1:0'], 'each line once, in order');
    const last = [...(got as Followed[])].reverse().find((m) => m.kind === 'events');
    assert.equal(last?.kind === 'events' && last.cursor, (await readTranscript(s.file, undefined, claudeTranscriptEvents)).cursor);

    list([s.row('done')]);
    const exit = await ended;
    assert.ok(Exit.isSuccess(exit));
    assert.deepEqual(states(got), ['working', 'completed']);
  },
);

test(
  'a long-lived session is followed across its turns: a turn ended with its process held is input-required, the next turn working, each line said once, and its release after a turn ends it completed',
  WAITED,
  async (t) => {
    const s = session('ae/b2/1');
    s.append(said('p-1', 'Before.'));
    list([s.row('working', PID)]);
    const got: Followed[] = [];
    const ended = follow(ops(), 'ae/b2/1', got);
    await until(t, () => got.length > 0, 'the first moment', { bell: rung });
    s.append(said('t1-1', 'Turn one.'));
    list([s.row('done', PID)]);
    await until(t, () => states(got).includes('input-required'), 'the turn ended', { bell: rung });
    assert.deepEqual(ids(got), ['t1-1:0'], "the turn's line, said before its end");
    list([s.row('working', PID)]);
    await until(t, () => states(got).length === 3, 'the next turn', { bell: rung });
    s.append(said('t2-1', 'Turn two.'));
    await until(t, () => ids(got).includes('t2-1:0'), "the next turn's line", { bell: rung });
    list([s.row('done', PID)]);
    await until(t, () => states(got).length === 4, 'the next turn ended', { bell: rung });
    list([s.row('stopped')]);
    assert.ok(Exit.isSuccess(await ended));
    assert.deepEqual(states(got), ['working', 'input-required', 'working', 'input-required', 'completed']);
    assert.deepEqual(ids(got), ['t1-1:0', 't2-1:0']);
  },
);

test(
  'a session Claude Code respawns, listed blocked with no process between, is followed on: its lines said once, and it ends when done',
  WAITED,
  async (t) => {
    const s = session('ae/b3/1');
    s.append(said('p-1', 'Before.'));
    list([s.row('working', PID)]);
    const got: Followed[] = [];
    const ended = follow(ops(), 'ae/b3/1', got);
    await until(t, () => got.length > 0, 'the first moment', { bell: rung });
    list([s.row('blocked')]);
    await until(t, () => states(got).length === 2, 'the gap', { bell: rung });
    s.append(said('r-1', 'Respawned.'));
    list([s.row('working', PID + 1)]);
    await until(t, () => states(got).length === 3 && ids(got).length === 1, 'the respawned process at work', { bell: rung });
    list([s.row('done')]);
    assert.ok(Exit.isSuccess(await ended));
    assert.deepEqual(states(got), ['working', 'input-required', 'working', 'completed']);
    assert.deepEqual(ids(got), ['r-1:0']);
  },
);

test(
  "an attempt resumed with `--resume` under a new session id is followed from its transcript's end: the lines it carries of its parent, under their uuids or new ones, are not said again, only those it writes",
  WAITED,
  async (t) => {
    const parent = session('ae/b4/1');
    parent.append(said('c-1', 'Asked.') + said('c-2', 'Answered.'));
    const child = session('ae/b4/2');
    child.append(said('c-1', 'Asked.') + said(randomUUID(), 'Answered.'));
    list([parent.row('stopped'), child.row('working', PID)]);
    const got: Followed[] = [];
    const ended = follow(ops(), 'ae/b4/2', got);
    await until(t, () => got.length > 0, 'the first moment', { bell: rung });
    child.append(said('n-1', 'Continued.'));
    await until(t, () => ids(got).length > 0, 'its own line', { bell: rung });
    list([parent.row('stopped'), child.row('done')]);
    assert.ok(Exit.isSuccess(await ended));
    assert.deepEqual(ids(got), ['n-1:0']);
  },
);

test('a session whose transcript is not there at its first state is read from the start of it once it is', WAITED, async (t) => {
  const s = session('ae/b5/1');
  list([s.row('working', PID)]);
  const got: Followed[] = [];
  const ended = follow(ops(), 'ae/b5/1', got);
  await until(t, () => got.length > 0, 'the first moment', { bell: rung });
  s.append(said('f-1', 'First.') + said('f-2', 'Second.'));
  await until(t, () => ids(got).length === 2, 'both lines', { bell: rung });
  list([s.row('done')]);
  assert.ok(Exit.isSuccess(await ended));
  assert.deepEqual(ids(got), ['f-1:0', 'f-2:0']);
});

test(
  'a listing that fails, or does not decode, neither ends the follow nor fails it: the transcript is said on, and the next listing read says the state',
  WAITED,
  async (t) => {
    const s = session('ae/b6/1');
    list([s.row('working', PID)]);
    const got: Followed[] = [];
    const ended = follow(ops(), 'ae/b6/1', got);
    await until(t, () => got.length > 0, 'the first moment', { bell: rung });
    for (const [broken, uuid] of [
      ['FAIL', 'l-1'],
      ['[{"name":"ae/b6/1","sessionId":"","state":"working"}]', 'l-2'],
    ] as const) {
      list(broken);
      const asked = fs.readFileSync(calls, 'utf8').length;
      await until(t, () => fs.readFileSync(calls, 'utf8').length > asked + 1, 'two listings read after it broke', { everyMs: 50 });
      s.append(said(uuid, 'Still here.'));
      await until(t, () => ids(got).includes(`${uuid}:0`), 'the line after it', { bell: rung });
    }
    assert.deepEqual(states(got), ['working'], 'no state said from a listing not read');
    list([s.row('done')]);
    assert.ok(Exit.isSuccess(await ended));
    assert.deepEqual(states(got), ['working', 'completed']);
  },
);

test('a session whose row is gone ends the follow: canceled in the middle of a turn, completed after one', WAITED, async (t) => {
  for (const [name, lastRow, end] of [
    ['ae/b7/1', 'working', 'canceled'],
    ['ae/b7/2', 'done', 'completed'],
  ] as const) {
    const s = session(name);
    list([s.row(lastRow, PID)]);
    const got: Followed[] = [];
    const ended = follow(ops(), name, got);
    await until(t, () => got.length > 0, 'the first moment', { bell: rung });
    list([]);
    assert.ok(Exit.isSuccess(await ended));
    assert.deepEqual(states(got).at(-1), end, name);
  }
});

test('REFUSED: a transcript line that does not decode fails the follow, naming the file and the byte it starts at', WAITED, async (t) => {
  const s = session('ae/b8/1');
  s.append(said('p-1', 'Before.'));
  const at = fs.statSync(s.file).size;
  list([s.row('working', PID)]);
  const got: Followed[] = [];
  const ended = follow(ops(), 'ae/b8/1', got);
  await until(t, () => got.length > 0, 'the first moment', { bell: rung });
  s.append(line({ type: 'assistant', uuid: 'bad-1', timestamp: '2026-10-07T12:00:00.000Z', message: 5 }));
  const exit = await ended;
  assert.ok(Exit.isFailure(exit));
  const err = Cause.squash(exit.cause) as RunnerError;
  assert.deepEqual([err.verb, err.refused], ['follow', undefined]);
  assert.match(err.message, /^claude: `ae\/b8\/1`'s transcript cannot be followed: /);
  assert.ok(err.message.includes(`the line at byte ${at} of the transcript \`${s.file}\``), err.message);
});

test('REFUSED: a name `claude agents` does not list is not followed, and no refusal to stream: the name is wrong', async () => {
  list([]);
  const exit = await follow(ops(), 'ae/b9/1', []);
  assert.ok(Exit.isFailure(exit));
  const err = Cause.squash(exit.cause) as RunnerError;
  assert.deepEqual([err.verb, err.refused], ['follow', undefined]);
  assert.equal(err.message, "claude: no session `ae/b9/1` is there to follow: neither a job's run file nor `claude agents` lists it.");
});

test("Claude Code's card says it streams, and a background session is followed through A2A as the runner says it", WAITED, async (t) => {
  const claude = ops();
  assert.equal((await new HarnessHandler('claude', claude, async () => []).getAgentCard()).capabilities?.streaming, true);
  const s = session('ae/b10/1');
  list([s.row('working', PID)]);
  const got: Followed[] = [];
  const ended = follow(
    a2aOps('claude', claude, async () => []),
    'ae/b10/1',
    got,
  );
  await until(t, () => got.length > 0, 'the first moment', { bell: rung });
  s.append(said('a2a-1', 'Through.'));
  await until(t, () => ids(got).length > 0, 'the line', { bell: rung });
  list([s.row('done')]);
  assert.ok(Exit.isSuccess(await ended));
  assert.deepEqual(states(got), ['working', 'completed']);
  assert.deepEqual(ids(got), ['a2a-1:0']);
});

test('the listing is read once however many ask at a time, kept a second after a read that decoded, and read again after one that did not', async () => {
  let reads = 0;
  let out = '[]';
  const listing = sharedListing(Effect.sync(() => (reads++, out)));
  await Effect.runPromise(
    Effect.gen(function* () {
      yield* Effect.all([listing, listing, listing], { concurrency: 'unbounded' });
      assert.equal(reads, 1, 'one read for three asking together');
      yield* TestClock.adjust('999 millis');
      yield* listing;
      assert.equal(reads, 1, 'kept for a second');
      yield* TestClock.adjust('1 millis');
      yield* listing;
      assert.equal(reads, 2, 'read again once the second is past');
      out = 'not json';
      yield* TestClock.adjust('1 second');
      assert.ok(Exit.isFailure(yield* Effect.exit(listing)));
      out = '[]';
      yield* listing;
      assert.equal(reads, 4, 'a listing that did not decode is kept by none');
    }).pipe(Effect.provide(TestClock.layer())),
  );
});

test("a followed session's state from its row: a turn's end held is input-required, a respawn's gap live, and an end over", () => {
  const row = (state: string, pid?: number, waitingFor?: string) => ({
    name: 'ae/s/1',
    sessionId: 's-1',
    state,
    ...(pid ? { pid } : {}),
    ...(waitingFor ? { waitingFor } : {}),
  });
  const cases: [string, Parameters<typeof followedStateOf>, ReturnType<typeof followedStateOf>][] = [
    ['done, held', [row('done', 7), false], { state: 'input-required', over: false, turnEnded: true }],
    ['done, let go, after a turn', [row('done'), true], { state: 'completed', over: true, turnEnded: true }],
    ['done, let go', [row('done'), false], { state: 'completed', over: true, turnEnded: false }],
    ['blocked, held', [row('blocked', 7), false], { state: 'input-required', over: false, turnEnded: false }],
    ['blocked on a sign-in', [row('blocked', 7, 'log in'), false], { state: 'auth-required', over: false, turnEnded: false }],
    ['blocked, respawning', [row('blocked'), true], { state: 'input-required', over: false, turnEnded: true }],
    ['working, respawning', [row('working'), true], { state: 'working', over: false, turnEnded: false }],
    ['stopped mid-turn', [row('stopped'), false], { state: 'canceled', over: true, turnEnded: false }],
    ['stopped after a turn', [row('stopped'), true], { state: 'completed', over: true, turnEnded: true }],
    ['failed after a turn', [row('failed'), true], { state: 'failed', over: true, turnEnded: true }],
    ['gone after a turn', [undefined, true], { state: 'completed', over: true, turnEnded: true }],
    ['gone mid-turn', [undefined, false], { state: 'canceled', over: true, turnEnded: false }],
  ];
  for (const [what, args, want] of cases) assert.deepEqual(followedStateOf(...args), want, what);
});
