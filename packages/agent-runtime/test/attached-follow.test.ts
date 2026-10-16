/**
 * An attached Claude Code session followed live (`RunnerOps.follow`, `attached-follow.ts`), against the stand-in CLI the SDK spawns
 * as it would Claude Code: its state, the pieces of the text it writes as it writes them — the SDK asked for them with
 * `includePartialMessages`, which the stand-in only streams for when it sees the argument on its argv — the whole events of its
 * transcript with the cursor `transcript` takes back, a follower that joins late, one that leaves, a session taken up again here,
 * one this process has let go of, a turn cut mid-text, and the same session followed through the harness's own door, where a name
 * goes to the runner whose run file it has.
 *
 * Where Claude Code keeps its transcripts is read when `claude/transcript.ts` is loaded, so `CLAUDE_CONFIG_DIR` is set before `src`
 * is imported, and the helpers that import it are imported the same way. The stand-in is started for it by the holder the helpers
 * make (`attached-held.ts`), so this file names nothing that starts a process and takes no boundary name.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Exit, Fiber, Stream } from 'effect';
import type { Attached } from '../src/harness/claude/attached.ts';
import type { Followed } from '../src/harness/seam.ts';
import { scratch } from './scratch.ts';
import { bell, until, WAITED, type Waiter } from './waits.ts';

process.env.CLAUDE_CONFIG_DIR = scratch('ae-attached-follow-config-');
const { holder, kept, lines, NAME, run } = await import('./attached-held.ts');
const { filesOf, writeRun } = await import('../src/harness/claude/attached-file.ts');
const { isTranscriptCursor } = await import('../src/harness/transcript.ts');
const { claudeCodeOps } = await import('../src/harness/claude/code.ts');

/** The pieces the stand-in writes, and the whole its transcript keeps (`fixtures/stand-in-claude.ts`). */
const SAID = ['Half ', 'a thought'];

/** Rung on each moment a follower is handed. */
const rung = bell();

/** The session `name` followed, each moment pushed to `got` as it comes; the fiber, so a test can leave or await its end. */
const following = (attached: Attached, got: Followed[], name = NAME) =>
  Effect.runFork(
    Stream.runForEach(attached.ops.follow!(name), (m) =>
      Effect.sync(() => {
        got.push(m);
        rung.ring();
      }),
    ),
  );

/** The pieces of text a follower was handed, in order. */
const partials = (got: readonly Followed[]) => got.filter((m) => m.kind === 'partial');

/** The text of every event a follower was handed. */
const texts = (got: readonly Followed[]) =>
  got.flatMap((m) => (m.kind === 'events' ? m.events.map((e) => ('text' in e ? String(e.text) : '')) : []));

/** The id of every event a follower was handed: unique per transcript line, so two turns' lines are told apart. */
const ids = (got: readonly Followed[]) => got.flatMap((m) => (m.kind === 'events' ? m.events.map((e) => e.id) : []));

/** How many pieces of text whose text is `text` a follower was handed. */
const seen = (got: readonly Followed[], text: string) => partials(got).filter((m) => m.kind === 'partial' && m.text === text).length;

/** Waits until `got` holds a piece of text whose text is `text`. */
const said = (t: Waiter, got: readonly Followed[], text: string) =>
  until(t, () => partials(got).some((m) => m.kind === 'partial' && m.text === text), `the piece \`${text}\``, { bell: rung });

/** Whether the session's capture holds the turn's result: what "before the turn's end" is read against. */
const resulted = (root: string): boolean => {
  try {
    return fs.readFileSync(filesOf(root, NAME).out, 'utf8').includes('"type":"result"');
  } catch {
    return false;
  }
};

/** A long-lived session of the stand-in that streams its text, writes a transcript and holds its turn, spawned and held. */
const followable = async (id: string, plan: object = {}) => {
  const { root, dir, request } = kept({ id, stream: true, transcript: true, hold: true, ...plan });
  const h = await holder(root);
  await Effect.runPromise(h.attached.ops.spawn(request));
  return { root, dir, h: { ...h, root } };
};

test(
  'an attached session is followed to its turn’s end: its state, its text as it is written, then its whole events',
  WAITED,
  async (t) => {
    const { root, dir, h } = await followable('sid-follow-1');
    const got: Followed[] = [];
    const fiber = following(h.attached, got);
    await until(t, () => lines(dir, 'argv.jsonl').length > 0, 'the stand-in started', { everyMs: 20 });
    assert.ok(
      (lines(dir, 'argv.jsonl')[0] as string[]).includes('--include-partial-messages'),
      'the SDK passes the option on to its CLI, which is what makes the pieces come at all',
    );
    await said(t, got, SAID[0]);
    assert.deepEqual(got[0], { kind: 'state', state: 'working' }, 'a follower is said the session’s state first');
    fs.writeFileSync(path.join(dir, 'more'), '');
    await said(t, got, SAID[1]);
    await until(t, () => partials(got).some((m) => m.kind === 'partial' && m.last), 'the block written whole', { bell: rung });
    const [first, second, last] = partials(got);
    assert.deepEqual(
      [first, second, last],
      [
        { kind: 'partial', key: 'msg_sid-follow-1:0', text: SAID[0], append: false, last: false },
        { kind: 'partial', key: 'msg_sid-follow-1:0', text: SAID[1], append: true, last: false },
        { kind: 'partial', key: 'msg_sid-follow-1:0', text: '', append: true, last: true },
      ],
      'each piece once, under the block’s key, the second added to the first',
    );
    await until(t, () => got.some((m) => m.kind === 'events'), 'the whole events of the transcript', { bell: rung });
    assert.ok(!resulted(root), 'the text and the events came while the turn was still running');
    const events = got.find((m) => m.kind === 'events');
    assert.ok(events?.kind === 'events' && isTranscriptCursor(events.cursor), 'the events come with a cursor a transcript read gave');
    assert.ok(texts(got).includes(SAID.join('')), 'the event carries the text the pieces spelled');
    fs.writeFileSync(path.join(dir, 'end'), '');
    await until(t, () => got.some((m) => m.kind === 'state' && m.state === 'input-required'), 'the turn’s end', { bell: rung });
    await Effect.runPromise(Fiber.interrupt(fiber));
    await h.close();
  },
);

test('the cursor a follow speaks is one `transcript` takes, and no cursor it did not give', WAITED, async (t) => {
  const { dir, h } = await followable('sid-follow-2');
  const got: Followed[] = [];
  const fiber = following(h.attached, got);
  await said(t, got, SAID[0]);
  fs.writeFileSync(path.join(dir, 'more'), '');
  const events = await until(t, () => got.find((m) => m.kind === 'events'), 'the whole events of the transcript', { bell: rung });
  assert.ok(events.kind === 'events');
  const again = await Effect.runPromise(h.attached.ops.transcript!(NAME, events.cursor));
  assert.deepEqual(again.events, [], 'the cursor a follow spoke is where `transcript` reads on from: nothing is served twice');
  const byHand = await Effect.runPromise(h.attached.ops.transcript!(NAME, `0.${'0'.repeat(16)}`));
  assert.ok(byHand.events.length > 0, 'a cursor nobody’s read gave reads the file again from the start, never on from the middle');
  fs.writeFileSync(path.join(dir, 'end'), '');
  await Effect.runPromise(Fiber.interrupt(fiber));
  await h.close();
});

test('a follower that joins late is said the open block whole, then what is said from then on', WAITED, async (t) => {
  const { root, dir, h } = await followable('sid-follow-3');
  const early: Followed[] = [];
  const first = following(h.attached, early);
  await said(t, early, SAID[0]);
  fs.writeFileSync(path.join(dir, 'more'), '');
  await until(t, () => early.some((m) => m.kind === 'events'), 'the first turn’s events', { bell: rung });
  fs.writeFileSync(path.join(dir, 'end'), '');
  await until(t, () => run(root)?.state === 'idle', 'the first turn ended', { everyMs: 50 });

  const before = ids(early);
  assert.equal(before.length, 1, 'the first turn left one event in the transcript, written before any late follower joins');

  await Effect.runPromise(h.attached.ops.say!({ name: NAME, sessionId: 'sid-follow-3' }, 'and again'));
  await until(t, () => seen(early, SAID[0]) === 2, 'the second turn’s first piece, to the follower already there', { bell: rung });
  const late: Followed[] = [];
  const second = following(h.attached, late);
  await until(t, () => late.some((m) => m.kind === 'partial'), 'the open block, whole, to the follower that joined late', { bell: rung });
  assert.deepEqual(
    [late[0], late[1]],
    [
      { kind: 'state', state: 'working' },
      { kind: 'partial', key: 'msg_sid-follow-3:0', text: SAID[0], append: false, last: false },
    ],
    'a late follower is said the state and the block open then, whole, as what came before',
  );
  fs.writeFileSync(path.join(dir, 'more'), '');
  await said(t, late, SAID[1]);
  await until(t, () => ids(late).length > 0, 'the second turn’s events, to the late follower', { bell: rung });
  assert.deepEqual(
    ids(late).filter((id) => before.includes(id)),
    [],
    'it replays no event written before it joined: its first read takes the transcript’s cursor without saying what is there',
  );
  assert.equal(ids(late).length, 1, 'and it is said the one event written after it joined, that alone');
  assert.ok(texts(late).includes(SAID.join('')), 'the second turn’s event carries the text its pieces spelled');
  fs.writeFileSync(path.join(dir, 'end'), '');
  await Effect.runPromise(Fiber.interrupt(first));
  await Effect.runPromise(Fiber.interrupt(second));
  await h.close();
});

test('a follower that leaves frees its place, and the next is said everything all the same', WAITED, async (t) => {
  const { root, dir, h } = await followable('sid-follow-4');
  const got: Followed[] = [];
  const fiber = following(h.attached, got);
  await said(t, got, SAID[0]);
  assert.equal(h.attached.following(NAME), 1, 'a follow open is one follower of the session');
  await Effect.runPromise(Fiber.interrupt(fiber));
  await until(t, () => h.attached.following(NAME) === 0, 'the follower gone from the session’s place', { everyMs: 20 });

  const next: Followed[] = [];
  const after = following(h.attached, next);
  await until(t, () => next.length > 0, 'the next follower’s first moments', { bell: rung });
  assert.equal(h.attached.following(NAME), 1, 'the next follower takes a place of its own');
  fs.writeFileSync(path.join(dir, 'more'), '');
  await said(t, next, SAID[1]);
  fs.writeFileSync(path.join(dir, 'end'), '');
  await Effect.runPromise(Fiber.interrupt(after));
  await h.close();
  assert.equal(run(root)?.state, 'parked');
});

test(
  'a session this process takes up again is followed by a follower that joins once it is taken up: the fan-out is per name',
  WAITED,
  async (t) => {
    const { root, dir, request } = kept({ id: 'sid-follow-5', stream: true, transcript: true, hold: true });
    fs.mkdirSync(path.dirname(filesOf(root, NAME).run), { recursive: true });
    writeRun(root, {
      name: NAME,
      state: 'parked',
      owner: process.pid,
      startedAt: new Date().toISOString(),
      sessionId: 'sid-follow-5',
      request: { name: NAME, cwd: request.cwd, config: request.config, restartPolicy: 'Always' },
    });
    const h = await holder(root);
    await Effect.runPromise(h.attached.ops.observe);
    const got: Followed[] = [];
    const fiber = following(h.attached, got);
    await said(t, got, SAID[0]);
    assert.equal(run(root)?.sessionId, 'sid-follow-5', 'the session was taken up again under the same Claude Code id');
    fs.writeFileSync(path.join(dir, 'more'), '');
    await said(t, got, SAID[1]);
    fs.writeFileSync(path.join(dir, 'end'), '');
    await Effect.runPromise(Fiber.interrupt(fiber));
    await h.close();
  },
);

test('a session this process has let go of ends its follower, rather than leave it waiting', WAITED, async (t) => {
  const { dir, h } = await followable('sid-follow-6');
  const got: Followed[] = [];
  const fiber = following(h.attached, got);
  await said(t, got, SAID[0]);
  fs.writeFileSync(path.join(dir, 'end'), '');
  await h.close();
  const exit = await Effect.runPromise(Fiber.await(fiber));
  assert.ok(Exit.isSuccess(exit), 'the follow ends with the holder’s let-go, never failing and never hanging');
});

test('a turn cut mid-text closes the block it left open', WAITED, async (t) => {
  const { root, h } = await followable('sid-follow-7');
  const got: Followed[] = [];
  const fiber = following(h.attached, got);
  await said(t, got, SAID[0]);
  await Effect.runPromise(h.attached.ops.interrupt!({ name: NAME, sessionId: 'sid-follow-7' }));
  await until(t, () => partials(got).some((m) => m.kind === 'partial' && m.last), 'the open block closed by the turn’s result', {
    bell: rung,
  });
  assert.ok(
    !partials(got).some((m) => m.kind === 'partial' && m.text === SAID[1]),
    'the cut turn wrote no more text: what closes the block is the result, not a block stop',
  );
  assert.equal(run(root)?.state, 'idle', 'the cut turn ended the turn, never the session');
  await Effect.runPromise(Fiber.interrupt(fiber));
  await h.close();
});

test('a held session is followed through the harness its name is under, from the fan-out and not the job runner', WAITED, async () => {
  const { dir, h } = await followable('sid-follow-8');
  const got: Followed[] = [];
  const exit = await Effect.runPromiseExit(
    Stream.runForEach(Stream.take(claudeCodeOps({ root: h.root }, h.attached).follow!(NAME), 2), (m) =>
      Effect.sync(() => void got.push(m)),
    ),
  );
  assert.ok(Exit.isSuccess(exit), `the follow of a held session is served by the attached ops: ${JSON.stringify(exit)}`);
  assert.deepEqual(
    got,
    [
      { kind: 'state', state: 'working' },
      { kind: 'partial', key: 'msg_sid-follow-8:0', text: SAID[0], append: false, last: false },
    ],
    'the harness sends an attached name to the attached ops, whose follow says the session’s state and its text as it is written',
  );
  fs.writeFileSync(path.join(dir, 'more'), '');
  fs.writeFileSync(path.join(dir, 'end'), '');
  await h.close();
});
