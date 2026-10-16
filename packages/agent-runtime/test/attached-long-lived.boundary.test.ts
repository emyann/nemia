/**
 * A long-lived Claude Code session attached on the Agent SDK, against the stand-in CLI (`fixtures/stand-in-claude.ts`): a turn's end
 * is not the session's end, the session is written `idle` and heard again across turns, an interrupted turn's `error_during_execution`
 * result never fails it, a new holder resumes it under the same Claude Code session id, an interrupt asked by another process is
 * honoured on the next look, and the claude.ai bridge is opened after its first turn where its request asked for one and re-attached
 * on a resume.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Effect, Exit, Scope } from 'effect';
import { attachedSessions } from '../src/harness/claude/attached.ts';
import { attachedStateOf, filesOf, readRun, writeRun, type AttachedRun } from '../src/harness/claude/attached-file.ts';
import { claudeCodeOps } from '../src/harness/claude/code.ts';
import { fold, idleOf, type Event, type Sighting } from '../src/core/index.ts';
import { respawning } from '../src/core/domain.ts';
import type { SpawnRequest } from '../src/harness/seam.ts';
import { scratch } from './scratch.ts';
import { until, WAITED } from './waits.ts';

const STAND_IN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'stand-in-claude.ts');
const NAME = 'ae/t1/1';

/** A store and the stand-in's folder, and a long-lived spawn of `plan` whose session works there. */
const place = (plan: object, config: Record<string, unknown> = {}) => {
  const root = scratch('ae-long-lived-');
  const dir = path.join(root, 'stand-in');
  fs.mkdirSync(dir, { recursive: true });
  const request: SpawnRequest = {
    name: NAME,
    brief: 'do the work',
    cwd: dir,
    restartPolicy: 'Always',
    config: { background: true, ...config, env: { STANDIN_DIR: dir, STANDIN_PLAN: JSON.stringify({ turns: 'many', ...plan }) } },
  };
  return { root, dir, request };
};

/** The lines of the stand-in's `file`, each parsed. */
const lines = (dir: string, file: string): unknown[] => {
  const at = path.join(dir, file);
  return fs.existsSync(at)
    ? fs
        .readFileSync(at, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as unknown)
    : [];
};

/** A holder of the sessions under `root`, for a scope the test closes. */
const holder = async (root: string) => {
  const attached = attachedSessions(root, STAND_IN);
  const scope = Scope.makeUnsafe();
  await Effect.runPromise(Scope.provide(attached.hold, scope));
  return { attached, close: () => Effect.runPromise(Scope.close(scope, Exit.void)) };
};

/** What the run file says of the session, read again. */
const run = (root: string) => readRun(filesOf(root, NAME).run);

/** A long-lived task filed and its one attempt in flight, as its journal folds: what `decide` reads a sighting against. */
const LONG_LIVED: readonly Event[] = [
  {
    kind: 'filed',
    at: '2026-01-01T00:00:00.000Z',
    brief: 'be there',
    cwd: '/r',
    harness: 'claude',
    restartPolicy: 'Always',
    config: { background: true },
  },
  { kind: 'starting', at: '2026-01-01T00:00:01.000Z', attempt: 1 },
  { kind: 'spawned', at: '2026-01-01T00:00:02.000Z', attempt: 1 },
];

/** What `decide` makes of the sighting `s` of a long-lived task: whether its session is idle, and whether its harness is taking it up. */
const read = (s: Sighting) => ({ idle: idleOf(fold('t1', LONG_LIVED), s), respawning: respawning(fold('t1', LONG_LIVED), s) });

/** Waits until the session's run file says it is idle between turns. */
const idle = (t: TestContext, root: string, why = 'the session idle between turns') =>
  until(t, () => run(root)?.state === 'idle' && run(root)!, why, { everyMs: 50 });

test("attachedStateOf translates the harness's words: idle is input-required, parked is working, every other state is itself", () => {
  const of = (state: AttachedRun['state']) =>
    attachedStateOf({ name: NAME, state, owner: 1, startedAt: '2026-01-01T00:00:00.000Z', request: {} });
  assert.equal(of('idle'), 'input-required', 'a long-lived session between turns waits on a person');
  assert.equal(of('parked'), 'working', 'a session let go is taken up on the next look');
  assert.deepEqual(
    (['working', 'completed', 'failed', 'canceled'] as const).map(of),
    ['working', 'completed', 'failed', 'canceled'],
  );
});

test('a turn of a long-lived attached session ends without ending it: it is idle, held, and hears the next words', WAITED, async (t) => {
  const { root, dir, request } = place({ output: { ok: true } });
  const h = await holder(root);
  t.after(h.close);
  await Effect.runPromise(h.attached.ops.spawn(request));
  const first = await idle(t, root);
  assert.ok(first.sessionId, 'the idle run file keeps the session id a resume continues');
  const seen = (await Effect.runPromise(h.attached.ops.observe)).get(NAME)!;
  assert.deepEqual(
    [seen.state, seen.held, seen.pid],
    ['input-required', true, process.pid],
    'its sighting says a person is waited on and this process holds it',
  );
  assert.deepEqual(read(seen), { idle: true, respawning: false }, 'and `decide` reads it as a session open between turns');
  await Effect.runPromise(h.attached.ops.say!({ name: NAME, sessionId: NAME }, 'one more thing'));
  await until(t, () => (lines(dir, 'said.jsonl') as string[]).includes('one more thing'), 'the second turn heard', { everyMs: 50 });
  await idle(t, root, 'the second turn ended, the session still open');
  assert.deepEqual(lines(dir, 'said.jsonl'), ['do the work', 'one more thing'], 'one session, two turns');
  assert.equal(lines(dir, 'argv.jsonl').length, 1, 'and one Claude Code, never restarted between them');
});

test('an interrupt ends the turn and leaves the session answering under the same id, never failed', WAITED, async (t) => {
  const { root, dir, request } = place({ hold: true, output: {} });
  const h = await holder(root);
  t.after(() => {
    fs.writeFileSync(path.join(dir, 'end'), '');
    return h.close();
  });
  await Effect.runPromise(h.attached.ops.spawn(request));
  await until(t, () => run(root)?.sessionId, 'the session started its first turn', { everyMs: 50 });
  await Effect.runPromise(h.attached.ops.interrupt!({ name: NAME, sessionId: NAME }));
  const cut = await idle(t, root, 'the interrupted turn ended');
  assert.equal(cut.state, 'idle', 'an `error_during_execution` result ends the turn, not the session');
  assert.equal((await Effect.runPromise(h.attached.ops.observe)).get(NAME)?.state, 'input-required');
  fs.writeFileSync(path.join(dir, 'end'), '');
  await Effect.runPromise(h.attached.ops.say!({ name: NAME, sessionId: NAME }, 'carry on then'));
  await until(t, () => (lines(dir, 'said.jsonl') as string[]).includes('carry on then'), 'the next turn heard', { everyMs: 50 });
  const after = await idle(t, root, 'the next turn ended');
  assert.equal(after.sessionId, cut.sessionId, 'the same session answered after the interrupt');
  const taken = lines(dir, 'taken.jsonl') as { subtype: string | null }[];
  assert.equal(taken.filter((r) => r.subtype === 'interrupt').length, 1, 'one interrupt control request, and one only');
});

test("an interrupt asked by another process is honoured on the holder's next look, and its file goes", WAITED, async (t) => {
  const { root, dir, request } = place({ hold: true, output: {} });
  const h = await holder(root);
  t.after(() => {
    fs.writeFileSync(path.join(dir, 'end'), '');
    return h.close();
  });
  await Effect.runPromise(h.attached.ops.spawn(request));
  await until(t, () => run(root)?.sessionId, 'the session started its first turn', { everyMs: 50 });
  const other = claudeCodeOps({ root }, attachedSessions(root, STAND_IN));
  await Effect.runPromise(other.interrupt!({ name: NAME, sessionId: NAME }));
  assert.ok(fs.existsSync(filesOf(root, NAME).interrupt), 'a process that holds nothing leaves the ask on a file of its own');
  await until(
    t,
    async () => {
      await Effect.runPromise(h.attached.ops.observe);
      return run(root)?.state === 'idle';
    },
    "the holder's look honoured the ask",
    { everyMs: 50 },
  );
  assert.equal(fs.existsSync(filesOf(root, NAME).interrupt), false, 'the ask goes once the request was sent');
  const refused = await Effect.runPromise(Effect.flip(other.interrupt!({ name: NAME, sessionId: NAME })));
  assert.match(refused.message, /is idle, so it has no turn to end/, 'and an idle session has no turn to end');
});

test('a holder lets a long-lived session go between turns and the next resumes it under the same Claude Code id', WAITED, async (t) => {
  const { root, dir, request } = place({ output: {} });
  const first = await holder(root);
  await Effect.runPromise(first.attached.ops.spawn(request));
  const before = await idle(t, root);
  await first.close();
  assert.equal(run(root)?.state, 'parked', 'a session let go between turns is parked for the next holder');
  const second = await holder(root);
  t.after(second.close);
  await Effect.runPromise(second.attached.ops.observe);
  await until(t, () => lines(dir, 'argv.jsonl').length === 2, 'the next holder started its Claude Code', { everyMs: 50 });
  const after = await idle(t, root, 'the resumed session idle again');
  assert.equal(after.sessionId, before.sessionId, 'the same Claude Code session, resumed');
  const [, argv] = lines(dir, 'argv.jsonl') as string[][];
  assert.ok(argv.includes(`--resume=${before.sessionId!}`), 'resumed by its own id');
  assert.equal(after.carried?.costUsd ?? null, null, 'and a session resumed by its own holder carries nothing of a parent');
});

test("a long-lived session whose holder is gone says its process is not held, so decide reads it as one being taken up", WAITED, async () => {
  const { root, request } = place({ output: {} });
  writeRun(root, {
    name: NAME,
    state: 'idle',
    owner: 2_147_483_600,
    ownerStart: 'a holder long gone',
    startedAt: new Date().toISOString(),
    sessionId: 'left-idle',
    request: { ...request, brief: undefined },
  });
  const seen = (await Effect.runPromise(attachedSessions(root, STAND_IN).ops.observe)).get(NAME)!;
  assert.deepEqual([seen.state, seen.held, seen.pid], ['input-required', false, undefined]);
  assert.deepEqual(read(seen), { idle: false, respawning: true }, 'never idle, so no end of it is recorded under its feet');
});

test('the claude.ai bridge is opened after the first turn where the request asked for one, and its state kept', WAITED, async (t) => {
  const { root, dir, request } = place({ output: {} }, { claude: { remoteControl: true } });
  const h = await holder(root);
  t.after(h.close);
  await Effect.runPromise(h.attached.ops.spawn(request));
  const bridged = await until(t, () => run(root)?.bridge?.url && run(root)!, 'the bridge opened', { everyMs: 50 });
  assert.equal(bridged.bridge?.bridgeSessionId, 'cse_stand-in-session');
  assert.equal(bridged.bridge?.url, 'https://claude.ai/s/cse_stand-in-session');
  assert.equal(bridged.bridge?.environmentId, 'env-stand-in');
  assert.equal(bridged.bridge?.epoch, 1);
  await until(t, () => run(root)?.bridge?.state === 'connected', 'the bridge connected, as its stream said', { everyMs: 50 });
  const asked = (lines(dir, 'taken.jsonl') as { subtype: string | null }[]).filter((r) => r.subtype === 'remote_control');
  assert.equal(asked.length, 1, 'one bridge control request, after its first turn');
  const seen = (await Effect.runPromise(h.attached.ops.observe)).get(NAME)!;
  assert.deepEqual(seen.bridge, { url: 'https://claude.ai/s/cse_stand-in-session' }, 'and its sighting carries the link');
});

test('a long-lived request that asks for no bridge never sends the bridge control request', WAITED, async (t) => {
  const { root, dir, request } = place({ output: {} });
  const h = await holder(root);
  t.after(h.close);
  await Effect.runPromise(h.attached.ops.spawn(request));
  await idle(t, root);
  assert.deepEqual(
    (lines(dir, 'taken.jsonl') as { subtype: string | null }[]).map((r) => r.subtype),
    ['initialize'],
    'the SDK asked it to initialize and nothing else',
  );
  assert.equal(run(root)?.bridge, undefined, 'and its run file says nothing of a bridge');
});

test("a resumed session re-attaches the claude.ai session its run file kept", WAITED, async (t) => {
  const { root, dir, request } = place({ output: {} }, { claude: { remoteControl: true } });
  writeRun(root, {
    name: NAME,
    state: 'parked',
    owner: process.pid,
    startedAt: new Date().toISOString(),
    sessionId: 'kept-session',
    bridge: { url: 'https://claude.ai/s/cse_earlier', bridgeSessionId: 'cse_earlier' },
    request: { ...request, brief: undefined },
  });
  const h = await holder(root);
  t.after(h.close);
  await Effect.runPromise(h.attached.ops.observe);
  const again = await until(t, () => run(root)?.bridge?.epoch !== undefined && run(root)!, 'the bridge opened again', { everyMs: 50 });
  assert.equal(again.bridge?.bridgeSessionId, 'cse_earlier', 'the kept claude.ai session is re-attached, not a new one');
  const [asked] = (lines(dir, 'taken.jsonl') as { subtype: string | null; reattach_session_id?: string }[]).filter(
    (r) => r.subtype === 'remote_control',
  );
  assert.equal(asked?.reattach_session_id, 'cse_earlier', 'and the request names it');
});
