/**
 * An attached Claude Code session followed live (`RunnerOps.follow`, `attached-follow.ts`), against the stand-in CLI the SDK spawns
 * as it would Claude Code, as one story over one session's turns: its state, the pieces of the text it writes as it writes them —
 * the SDK asked for them with `includePartialMessages`, which the stand-in only streams for when it sees the argument on its argv —
 * the whole events of its transcript with the cursor `transcript` takes back, a follower that joins late, followers that leave, the
 * same session followed through the harness's own door, where a name goes to the runner whose run file it has, a turn cut mid-text,
 * and its holder letting it go. A session taken up again here is a test of its own, over a run file left parked.
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
import { story } from './checkpoints.ts';
import { bell, until, WAITED, type Waiter } from '../src/waits/index.ts';

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

/** The kind of each line the session's capture holds, in order: its `type`, with its `subtype` where it has one. */
const capturedKinds = (root: string): string[] => {
  const { out } = filesOf(root, NAME);
  return lines(path.dirname(out), path.basename(out)).map((l) => {
    const { type, subtype } = l as { type: string; subtype?: string };
    return subtype === undefined ? type : `${type} ${subtype}`;
  });
};

/** A long-lived session of the stand-in that streams its text, writes a transcript and holds its turn, spawned and held. */
const followable = async (id: string, plan: object = {}) => {
  const { root, dir, request } = kept({ id, stream: true, transcript: true, hold: true, ...plan });
  const h = await holder(root);
  await Effect.runPromise(h.attached.ops.spawn(request));
  return { root, dir, h: { ...h, root } };
};

test(
  'an attached session is followed through its turns, by followers that join late and leave, until its holder lets it go',
  WAITED,
  async (t) => {
    const s = story(t);
    const ID = 'sid-follow-1';
    const { root, dir, h } = await followable(ID);
    const say = (words: string) => Effect.runPromise(h.attached.ops.say!({ name: NAME, sessionId: ID }, words));
    const early: Followed[] = [];
    const first = following(h.attached, early);
    const late: Followed[] = [];
    let second = first;
    const next: Followed[] = [];
    let after = first;
    t.after(async () => {
      fs.writeFileSync(path.join(dir, 'end'), '');
      for (const f of [first, second, after]) await Effect.runPromise(Fiber.interrupt(f));
      await h.close();
    });
    let cursor = '';
    const lasts = (got: readonly Followed[]) => partials(got).filter((m) => m.kind === 'partial' && m.last).length;

    await s.test('it is followed to its turn’s end: its state, its text as it is written, then its whole events', async (st) => {
      await until(st, () => lines(dir, 'argv.jsonl').length > 0, 'the stand-in started', { everyMs: 20 });
      assert.ok(
        (lines(dir, 'argv.jsonl')[0] as string[]).includes('--include-partial-messages'),
        'the SDK passes the option on to its CLI, which is what makes the pieces come at all',
      );
      await said(st, early, SAID[0]);
      assert.deepEqual(early[0], { kind: 'state', state: 'working' }, 'a follower is said the session’s state first');
      fs.writeFileSync(path.join(dir, 'more'), '');
      await said(st, early, SAID[1]);
      await until(st, () => lasts(early) > 0, 'the block written whole', { bell: rung });
      const [one, two, last] = partials(early);
      assert.deepEqual(
        [one, two, last],
        [
          { kind: 'partial', key: `msg_${ID}:0`, text: SAID[0], append: false, last: false },
          { kind: 'partial', key: `msg_${ID}:0`, text: SAID[1], append: true, last: false },
          { kind: 'partial', key: `msg_${ID}:0`, text: '', append: true, last: true },
        ],
        'each piece once, under the block’s key, the second added to the first',
      );
      await until(st, () => early.some((m) => m.kind === 'events'), 'the whole events of the transcript', { bell: rung });
      assert.ok(!resulted(root), 'the text and the events came while the turn was still running');
      const events = early.find((m) => m.kind === 'events');
      assert.ok(events?.kind === 'events' && isTranscriptCursor(events.cursor), 'the events come with a cursor a transcript read gave');
      cursor = events.cursor;
      assert.ok(texts(early).includes(SAID.join('')), 'the event carries the text the pieces spelled');
    });

    await s.test('the cursor a follow speaks is one `transcript` takes, and no cursor it did not give', async () => {
      const again = await Effect.runPromise(h.attached.ops.transcript!(NAME, cursor));
      assert.deepEqual(again.events, [], 'the cursor a follow spoke is where `transcript` reads on from: nothing is served twice');
      const byHand = await Effect.runPromise(h.attached.ops.transcript!(NAME, `0.${'0'.repeat(16)}`));
      assert.ok(byHand.events.length > 0, 'a cursor nobody’s read gave reads the file again from the start, never on from the middle');
    });

    await s.test(
      'at the turn’s end the follower is said the session waits, and the capture kept none of the text in progress',
      async (st) => {
        fs.writeFileSync(path.join(dir, 'end'), '');
        await until(st, () => early.some((m) => m.kind === 'state' && m.state === 'input-required'), 'the turn’s end', { bell: rung });
        assert.deepEqual(
          capturedKinds(root),
          ['system init', 'result success'],
          'the capture keeps only the kinds its readers read: not one line of the text in progress the follower was handed above',
        );
        await until(st, () => run(root)?.state === 'idle', 'the first turn ended', { everyMs: 50 });
      },
    );

    await s.test('a follower that joins late is said the open block whole, then what is said from then on', async (st) => {
      const before = ids(early);
      assert.equal(before.length, 1, 'the first turn left one event in the transcript, written before any late follower joins');
      await say('and again');
      await until(st, () => seen(early, SAID[0]) === 2, 'the second turn’s first piece, to the follower already there', { bell: rung });
      second = following(h.attached, late);
      await until(st, () => late.some((m) => m.kind === 'partial'), 'the open block, whole, to the follower that joined late', {
        bell: rung,
      });
      assert.deepEqual(
        [late[0], late[1]],
        [
          { kind: 'state', state: 'working' },
          { kind: 'partial', key: `msg_${ID}:0`, text: SAID[0], append: false, last: false },
        ],
        'a late follower is said the state and the block open then, whole, as what came before',
      );
      fs.writeFileSync(path.join(dir, 'more'), '');
      await said(st, late, SAID[1]);
      await until(st, () => ids(late).length > 0, 'the second turn’s events, to the late follower', { bell: rung });
      assert.deepEqual(
        ids(late).filter((id) => before.includes(id)),
        [],
        'it replays no event written before it joined: its first read takes the transcript’s cursor without saying what is there',
      );
      assert.equal(ids(late).length, 1, 'and it is said the one event written after it joined, that alone');
      assert.ok(texts(late).includes(SAID.join('')), 'the second turn’s event carries the text its pieces spelled');
      fs.writeFileSync(path.join(dir, 'end'), '');
      await until(st, () => run(root)?.state === 'idle', 'the second turn ended', { everyMs: 50 });
    });

    await s.test('followers that leave free their places, and the next is said everything all the same', async (st) => {
      assert.equal(h.attached.following(NAME), 2, 'each follow open is one follower of the session');
      await Effect.runPromise(Fiber.interrupt(first));
      await Effect.runPromise(Fiber.interrupt(second));
      await until(st, () => h.attached.following(NAME) === 0, 'the followers gone from the session’s place', { everyMs: 20 });
      after = following(h.attached, next);
      await until(st, () => next.length > 0, 'the next follower’s first moments', { bell: rung });
      assert.equal(h.attached.following(NAME), 1, 'the next follower takes a place of its own');
      await say('a third time');
      await said(st, next, SAID[0]);
    });

    await s.test('a held session is followed through the harness its name is under, from the fan-out and not the job runner', async () => {
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
          { kind: 'partial', key: `msg_${ID}:0`, text: SAID[0], append: false, last: false },
        ],
        'the harness sends an attached name to the attached ops, whose follow says the session’s state and its text as it is written',
      );
    });

    await s.test('the follower that came after the others is said the rest of the turn', async (st) => {
      fs.writeFileSync(path.join(dir, 'more'), '');
      await said(st, next, SAID[1]);
      fs.writeFileSync(path.join(dir, 'end'), '');
      await until(st, () => run(root)?.state === 'idle', 'the third turn ended', { everyMs: 50 });
    });

    await s.test('a turn cut mid-text closes the block it left open', async (st) => {
      const closed = lasts(next);
      const rest = seen(next, SAID[1]);
      await say('and once more');
      await until(st, () => seen(next, SAID[0]) === 2, 'the fourth turn’s first piece', { bell: rung });
      await Effect.runPromise(h.attached.ops.interrupt!({ name: NAME, sessionId: ID }));
      await until(st, () => lasts(next) === closed + 1, 'the open block closed by the turn’s result', { bell: rung });
      assert.equal(seen(next, SAID[1]), rest, 'the cut turn wrote no more text: what closes the block is the result, not a block stop');
      assert.equal(run(root)?.state, 'idle', 'the cut turn ended the turn, never the session');
    });

    await s.test('a session this process has let go of ends its follower, rather than leave it waiting', async () => {
      await h.close();
      const exit = await Effect.runPromise(Fiber.await(after));
      assert.ok(Exit.isSuccess(exit), 'the follow ends with the holder’s let-go, never failing and never hanging');
      assert.equal(run(root)?.state, 'parked');
    });
  },
);

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
