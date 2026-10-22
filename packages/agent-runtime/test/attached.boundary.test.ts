/**
 * Claude Code attached on the Agent SDK, against a stand-in CLI (`fixtures/stand-in-claude.ts`) the SDK spawns as it would Claude
 * Code: a holder's let-go waits for the call in flight and parks the session, the next holder resumes it under the same id, a session
 * whose holder died mid-call is told which call did not finish, a non-holder neither adopts nor spawns attached, a denial is journalled
 * while the attempt is at work, a call that would ask is denied in the holder, a drain holds new calls, a drain never holds a call
 * nested in one in flight nor a sub-agent's, a holder that cannot let go within its bound cuts the call and says which, the next
 * holder resumes a session told which call was cut, a stop and words from another engine reach the session, a call held at its hook as
 * the holder lets go is never written in flight, a holder whose pid another process has taken is gone, neither a drain nor a kill
 * reaches a process given a pid since, a let-go whose sessions never end still returns with its waits inside one budget, a resumed
 * session's cost leaves out what its parent spent, a session is started on Claude Code's own system prompt with the agent's appended
 * to it — as text on the `initialize` request, not as a flag naming a file — and its servers ride the child's argv as the inline JSON
 * the SDK compiles `Options.mcpServers` to, strict, with the context window a key of the one settings object, and a spawn whose
 * options are refused — a prompt file that cannot be read, a flag given two values, a checkout `.mcp.json` that is not JSON — leaves
 * no run file behind, so no later pass reads a held sighting of a session that never started.
 *
 * And, of a long-lived attached request (`restartPolicy: 'Always'`), which runs here by the runtime's own rule: a turn's end is not
 * the session's end, the session is written `idle` and heard again across turns, an interrupted turn's `error_during_execution` result
 * never fails it, a new holder resumes it under the same Claude Code session id — idle between turns as well as at work — an interrupt
 * asked by another process is honoured on the next look, and the claude.ai bridge is opened after its first turn where its request
 * asked for one and re-attached on a resume.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { Effect, Exit, Logger, Scope } from 'effect';
import { attachedSessions, letGoOf } from '../src/harness/claude/attached.ts';
import {
  alive,
  attachedDir,
  attachedStateOf,
  crashNote,
  CARRY_ON,
  filesOf,
  putDrain,
  thisHolder,
  writeRun,
  type AttachedRun,
} from '../src/harness/claude/attached-file.ts';
import { fold, idleOf, type Event, type Sighting } from '../src/core/index.ts';
import { respawning } from '../src/core/domain.ts';
import { processStart } from '../src/harness/claude/inbox.ts';
import { purseOf } from '../src/core/clock.ts';
import { instantNow } from '../src/core/engine/now.ts';
import type { Live } from '../src/harness/claude/attached-session.ts';
import { claudeCodeOps } from '../src/harness/claude/code.ts';
import type { SpawnRequest } from '../src/harness/seam.ts';
import { Engine } from '../src/index.ts';
import { scratch } from './scratch.ts';
import { sdkArgValue } from './sdk-argv.ts';
import { until, WAITED } from '../src/waits/index.ts';
import { holder, inCall, kept, lines, NAME, place, run, STAND_IN } from './attached-held.ts';

/**
 * How many results the session's capture holds, as its holder wrote them: each is written in the same take as the run file it leaves
 * behind, so a test that reads one reads the state it left.
 */
const resultsOf = (root: string): number => {
  const out = filesOf(root, NAME).out;
  if (!fs.existsSync(out)) return 0;
  return fs
    .readFileSync(out, 'utf8')
    .split('\n')
    .filter(Boolean)
    .filter((l) => (JSON.parse(l) as { type?: string }).type === 'result').length;
};

test('a holder let go waits for the call in flight, then parks the session, its Claude Code gone', WAITED, async (t) => {
  const { root, dir, request } = place({ call: 'Bash', hold: true, output: { ok: true } });
  const h = await holder(root);
  await Effect.runPromise(h.attached.ops.spawn(request));
  assert.equal((await inCall(t, root)).tool, 'Bash');
  let closed = false;
  const closing = h.close().then(() => (closed = true));
  await until(t, () => lines(dir, 'answers.jsonl').length >= 1, 'the call asked its hook', { everyMs: 50 });
  assert.equal(closed, false, 'the let-go waits for the call in flight');
  assert.equal(run(root)?.state, 'working');
  fs.writeFileSync(path.join(dir, 'release'), '');
  await closing;
  assert.deepEqual(
    lines(dir, 'asked.jsonl'),
    ['PreToolUse', 'PostToolUse'],
    "the call ran to its end, its end asked of the session's hook, before the let-go parked it",
  );
  assert.equal(run(root)?.state, 'parked');
  assert.equal(run(root)?.calling, undefined);
  assert.equal(run(root)?.childPid, undefined, 'a parked session names no Claude Code: the let-go ended it');
  assert.equal(alive(Number(fs.readFileSync(path.join(dir, 'pid'), 'utf8'))), false, "the session's Claude Code is gone");
});

test('the next holder resumes a parked session under the same id, told to carry on', WAITED, async (t) => {
  const { root, dir, request } = place({ output: { done: 1 } });
  writeRun(root, {
    name: NAME,
    state: 'parked',
    owner: process.pid,
    startedAt: new Date().toISOString(),
    sessionId: 'the-same-session',
    request: { ...request, brief: undefined },
  });
  const h = await holder(root);
  t.after(h.close);
  const seen = await until(
    t,
    async () => {
      const s = (await Effect.runPromise(h.attached.ops.observe)).get(NAME);
      return s?.state === 'completed' && s;
    },
    'the resumed session completed',
    { everyMs: 50 },
  );
  assert.equal(seen.nativeId, 'the-same-session');
  const [argv] = lines(dir, 'argv.jsonl') as string[][];
  assert.ok(argv.includes('--resume=the-same-session'), 'the session is resumed by its own id');
  assert.ok(!argv.includes('--fork-session'), 'a resume continues the session, never forks it');
  assert.deepEqual(lines(dir, 'said.jsonl'), [CARRY_ON]);
  assert.deepEqual(seen.closeout, { payload: { done: 1 } });
});

test(
  'a session whose holder died mid-call is resumed told which call did not finish, its old Claude Code killed first',
  WAITED,
  async (t) => {
    const { root, dir, request } = place({ output: { done: 1 } });
    const dead = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
    await new Promise((r) => dead.once('exit', r));
    const left = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', detached: true });
    t.after(() => void (left.pid && alive(left.pid) && process.kill(-left.pid, 'SIGKILL')));
    writeRun(root, {
      name: NAME,
      state: 'working',
      owner: dead.pid!,
      startedAt: new Date().toISOString(),
      sessionId: 'crashed-session',
      childPid: left.pid!,
      childStart: processStart(left.pid!),
      calling: { tool: 'Bash', since: new Date().toISOString() },
      request: { ...request, brief: undefined },
    });
    const h = await holder(root);
    t.after(h.close);
    await Effect.runPromise(h.attached.ops.observe);
    await until(t, () => lines(dir, 'said.jsonl').length, 'the resumed session told something', { everyMs: 50 });
    assert.equal(alive(left.pid!), false, "the dead holder's Claude Code is killed before the resume");
    assert.deepEqual(lines(dir, 'said.jsonl'), [crashNote('Bash')]);
    assert.deepEqual(lines(dir, 'said.jsonl'), ['the daemon stopped during its call to Bash and the call did not finish']);
  },
);

test('a non-holder sees an orphaned session at work and adopts nothing', WAITED, async () => {
  const { root, dir, request } = place({});
  writeRun(root, {
    name: NAME,
    state: 'parked',
    owner: process.pid,
    startedAt: new Date().toISOString(),
    sessionId: 'left-alone',
    request: { ...request, brief: undefined },
  });
  const attached = attachedSessions(root, STAND_IN);
  const ops = claudeCodeOps({ root }, attached);
  assert.equal((await Effect.runPromise(ops.observe)).get(NAME)?.state, 'working');
  assert.deepEqual(lines(dir, 'argv.jsonl'), [], 'no session was started');
  assert.equal(run(root)?.state, 'parked');
  assert.equal(attached.holding(), false);
});

test('a denial is journalled while the attempt is at work, before its result', WAITED, async (t) => {
  const { root, dir, request } = place({ deny: 'WebFetch', hold: true, output: {} });
  const attached = attachedSessions(root, STAND_IN);
  const scope = Scope.makeUnsafe();
  await Effect.runPromise(Scope.provide(attached.hold, scope));
  const layer = Engine.layer({ root, harnesses: { claude: claudeCodeOps({ root }, attached) } });
  const go = <A>(f: (e: Engine['Service']) => Effect.Effect<A, unknown>) =>
    Effect.runPromise(Effect.flatMap(Engine, f).pipe(Effect.provide(layer)) as Effect.Effect<A>);
  const id = await go((e) => e.file({ brief: request.brief, cwd: dir, config: request.config }));
  t.after(async () => {
    fs.writeFileSync(path.join(dir, 'end'), '');
    await Effect.runPromise(Scope.close(scope, Exit.void));
  });
  const denied = await until(
    t,
    async () => {
      await go((e) => e.tick());
      const view = await go((e) => e.view(id));
      return view.state.attempts.at(-1)?.denials?.length ? view : undefined;
    },
    'the denial journalled',
    { everyMs: 100 },
  );
  assert.equal(denied.phase.startsWith('running'), true, 'the attempt is still at work');
  assert.deepEqual(
    denied.state.attempts.at(-1)?.denials?.map((d) => d.tool),
    ['WebFetch'],
  );
});

test('a call that would ask a person is denied in the holder, and written as a denial', WAITED, async (t) => {
  const { root, dir, request } = place({ ask: 'Write', output: {} });
  const h = await holder(root);
  t.after(h.close);
  await Effect.runPromise(h.attached.ops.spawn(request));
  const seen = await until(
    t,
    async () => {
      const s = (await Effect.runPromise(h.attached.ops.observe)).get(NAME);
      return s?.state === 'completed' && s;
    },
    'the session completed',
    { everyMs: 50 },
  );
  const [asked] = lines(dir, 'answers.jsonl') as { answer: { behavior: string; message: string } }[];
  assert.equal(asked.answer.behavior, 'deny');
  assert.deepEqual(
    seen.denials?.map((d) => d.tool),
    ['Write'],
  );
});

test('a drain naming the holder holds its new call until lifted; one naming another process holds nothing', WAITED, async (t) => {
  const { root, dir, request } = place({ call: 'Read', output: {} });
  fs.writeFileSync(path.join(dir, 'release'), '');
  putDrain(root, process.pid);
  const h = await holder(root);
  t.after(h.close);
  await Effect.runPromise(h.attached.ops.spawn(request));
  assert.equal(await until(t, () => run(root)?.heldBack, 'the call held at its hook', { everyMs: 50 }), 1);
  assert.deepEqual(lines(dir, 'answers.jsonl'), [], 'the call waits at its hook while drained');
  assert.equal(run(root)?.calling, undefined, 'a call held is not in flight');
  putDrain(root, process.pid + 1_000_000);
  await until(t, () => run(root)?.state === 'completed', 'the call let through and the session completed', { everyMs: 50 });
  assert.equal(run(root)?.heldBack, undefined, 'no call waits once the drain names another process');
});

test('a stop from an engine that holds nothing cancels the session its holder runs', WAITED, async (t) => {
  const { root, dir, request } = place({ hold: true, output: {} });
  t.after(() => fs.writeFileSync(path.join(dir, 'end'), ''));
  const h = await holder(root);
  t.after(h.close);
  await Effect.runPromise(h.attached.ops.spawn(request));
  await until(t, () => run(root)?.sessionId, 'the session started', { everyMs: 50 });
  await Effect.runPromise(claudeCodeOps({ root }, attachedSessions(root, STAND_IN)).stop(NAME));
  await until(t, async () => (await Effect.runPromise(h.attached.ops.observe)).get(NAME)?.state === 'canceled', 'the session canceled', {
    everyMs: 50,
  });
});

test('a call held at its hook as the holder lets go is never written in flight: the session is parked with no call', WAITED, async (t) => {
  const { root, dir, request } = place({ call: 'Read', output: {} });
  fs.writeFileSync(path.join(dir, 'release'), '');
  putDrain(root, process.pid);
  const h = await holder(root);
  await Effect.runPromise(h.attached.ops.spawn(request));
  await until(t, () => lines(dir, 'asked.jsonl').length, 'the call asked its hook', { everyMs: 50 });
  await h.close();
  assert.equal(run(root)?.state, 'parked');
  assert.equal(run(root)?.calling, undefined, 'the next holder is told of no call that did not finish');
});

test('a session at work under a pid another process has taken since is adopted, its holder gone', WAITED, async (t) => {
  const { root, dir, request } = place({ output: { done: 1 } });
  const taken = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', detached: true });
  t.after(() => void (taken.pid && alive(taken.pid) && process.kill(-taken.pid, 'SIGKILL')));
  writeRun(root, {
    name: NAME,
    state: 'working',
    owner: taken.pid!,
    ownerStart: 'when its holder started, not this process',
    startedAt: new Date().toISOString(),
    sessionId: 'reused-pid',
    calling: { tool: 'Bash', since: new Date().toISOString() },
    request: { ...request, brief: undefined },
  });
  const h = await holder(root);
  t.after(h.close);
  await Effect.runPromise(h.attached.ops.observe);
  await until(t, () => lines(dir, 'said.jsonl').length, 'the adopted session told something', { everyMs: 50 });
  assert.deepEqual(lines(dir, 'said.jsonl'), [crashNote('Bash')]);
  assert.equal(alive(taken.pid!), true, "the process that took the pid is not the session's, and is left alone");
  assert.equal(run(root)?.owner, thisHolder().owner);
  assert.equal(run(root)?.ownerStart, thisHolder().ownerStart);
});

test('words said by an engine that holds nothing reach the session its holder runs; to no session, they are refused', WAITED, async (t) => {
  const { root, dir, request } = place({ hold: true, output: {} });
  t.after(() => fs.writeFileSync(path.join(dir, 'end'), ''));
  const h = await holder(root);
  t.after(h.close);
  await Effect.runPromise(h.attached.ops.spawn(request));
  await until(t, () => run(root)?.sessionId, 'the session started', { everyMs: 50 });
  const other = claudeCodeOps({ root }, attachedSessions(root, STAND_IN));
  await Effect.runPromise(other.say!({ name: NAME, sessionId: NAME }, 'one more thing'));
  await until(
    t,
    async () => {
      await Effect.runPromise(h.attached.ops.observe);
      return lines(dir, 'said.jsonl').includes('one more thing');
    },
    'the words heard',
    { everyMs: 50 },
  );
  await Effect.runPromise(h.attached.ops.observe);
  assert.deepEqual(lines(dir, 'said.jsonl'), ['do the work', 'one more thing'], 'each word heard once');
  const refused = await Effect.runPromise(Effect.flip(h.attached.ops.say!({ name: 'ae/none/1', sessionId: 'ae/none/1' }, 'hello')));
  assert.ok(refused.message.includes('not an attached session'));
});

test("a session resuming another reports its own cost, its parent's left out", WAITED, async (t) => {
  const { root, request } = place({ output: {}, cost: 0.4 });
  const parent = 'ae/t0/1';
  writeRun(root, {
    name: parent,
    state: 'completed',
    owner: process.pid,
    startedAt: new Date(Date.now() - 60_000).toISOString(),
    sessionId: 'parent-session',
    request: {},
  });
  const result = { type: 'result', subtype: 'success', is_error: false, session_id: 'parent-session', num_turns: 1, total_cost_usd: 0.25 };
  fs.writeFileSync(filesOf(root, parent).out, `${JSON.stringify(result)}\n`);
  const h = await holder(root);
  t.after(h.close);
  await Effect.runPromise(h.attached.ops.spawn({ ...request, resumeFrom: 'parent-session' }));
  const seen = await until(
    t,
    async () => {
      const s = (await Effect.runPromise(h.attached.ops.observe)).get(NAME);
      return s?.state === 'completed' && s;
    },
    'the resumed session completed',
    { everyMs: 50 },
  );
  assert.ok(Math.abs((seen.usage?.costUsd ?? 0) - 0.15) < 1e-9, `its own cost, not ${seen.usage?.costUsd}`);
});

test('a drain naming this pid with another start time holds nothing: it was put for a process gone since', WAITED, async (t) => {
  const { root, dir, request } = place({ call: 'Read', output: {} });
  fs.writeFileSync(path.join(dir, 'release'), '');
  putDrain(root, process.pid);
  assert.ok(JSON.parse(fs.readFileSync(path.join(attachedDir(root), 'drain.json'), 'utf8')).start, 'a drain says when its holder started');
  fs.writeFileSync(path.join(attachedDir(root), 'drain.json'), JSON.stringify({ pid: process.pid, start: 'an earlier process' }));
  const h = await holder(root);
  t.after(h.close);
  await Effect.runPromise(h.attached.ops.spawn(request));
  await until(t, () => run(root)?.state === 'completed', 'the call let through and the session completed', { everyMs: 50 });
});

test("adopting a session leaves alone a process that has taken its Claude Code's pid since", WAITED, async (t) => {
  const { root, dir, request } = place({ output: { done: 1 } });
  const taken = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', detached: true });
  t.after(() => void (taken.pid && alive(taken.pid) && process.kill(-taken.pid, 'SIGKILL')));
  writeRun(root, {
    name: NAME,
    state: 'parked',
    owner: process.pid,
    startedAt: new Date().toISOString(),
    sessionId: 'pid-taken',
    childPid: taken.pid!,
    childStart: "when the session's Claude Code started, not this process",
    request: { ...request, brief: undefined },
  });
  const h = await holder(root);
  t.after(h.close);
  await Effect.runPromise(h.attached.ops.observe);
  await until(t, () => run(root)?.state === 'completed', 'the session resumed and completed', { everyMs: 50 });
  assert.deepEqual(lines(dir, 'said.jsonl'), [CARRY_ON]);
  assert.equal(alive(taken.pid!), true, 'the process that took the pid is not killed');
});

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
  assert.deepEqual((['working', 'completed', 'failed', 'canceled'] as const).map(of), ['working', 'completed', 'failed', 'canceled']);
});

test('a turn of a long-lived attached session ends without ending it: it is idle, held, and hears the next words', WAITED, async (t) => {
  const { root, dir, request } = kept({ output: { ok: true } });
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
  const { root, dir, request } = kept({ hold: true, output: {} });
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
  await Effect.runPromise(h.attached.ops.say!({ name: NAME, sessionId: NAME }, 'carry on then'));
  assert.equal(run(root)?.state, 'working', 'the words it heard began a turn of their own, written as they were pushed');
  assert.equal(
    (await Effect.runPromise(h.attached.ops.observe)).get(NAME)?.state,
    'working',
    'a session answering again is no session waiting on a person: its turn can be ended',
  );
  fs.writeFileSync(path.join(dir, 'end'), '');
  const after = await until(t, () => run(root)?.state === 'idle' && run(root)!, 'the next turn ended', { everyMs: 50 });
  assert.ok((lines(dir, 'said.jsonl') as string[]).includes('carry on then'), 'the next turn heard the words');
  assert.equal(after.sessionId, cut.sessionId, 'the same session answered after the interrupt');
  const taken = lines(dir, 'taken.jsonl') as { subtype: string | null }[];
  assert.equal(taken.filter((r) => r.subtype === 'interrupt').length, 1, 'one interrupt control request, and one only');
});

test("an interrupt asked by another process is honoured on the holder's next look, and its file goes", WAITED, async (t) => {
  const { root, dir, request } = kept({ hold: true, output: {} });
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

test('words said while a turn runs leave the session answering until the turn that answered them ends', WAITED, async (t) => {
  const { root, dir, request } = kept({ hold: true, output: {} });
  const h = await holder(root);
  t.after(() => {
    fs.writeFileSync(path.join(dir, 'end'), '');
    return h.close();
  });
  await Effect.runPromise(h.attached.ops.spawn(request));
  await until(t, () => run(root)?.sessionId, 'the session started its first turn', { everyMs: 50 });
  await Effect.runPromise(h.attached.ops.say!({ name: NAME, sessionId: NAME }, 'and this too'));
  await until(t, () => (lines(dir, 'said.jsonl') as string[]).length === 2, 'the words it heard are worked as a turn of their own', {
    everyMs: 50,
  });
  fs.writeFileSync(path.join(dir, 'end'), '');
  await until(t, () => resultsOf(root) === 1, 'the first turn ended, with a result that did not name the words', { everyMs: 50 });
  assert.equal(run(root)?.state, 'working', 'the first turn ended, and the words it did not answer leave the session answering');
  assert.equal(
    (await Effect.runPromise(h.attached.ops.observe)).get(NAME)?.state,
    'working',
    'so its sighting says a turn of it can still be ended, never that it waits on a person',
  );
  fs.writeFileSync(path.join(dir, 'end'), '');
  await idle(t, root, 'and it is idle once the turn that answered them ends');
});

test('words folded into the turn in flight are answered by its one result, which leaves the session idle', WAITED, async (t) => {
  const { root, dir, request } = kept({ hold: true, fold: true, output: {} });
  const h = await holder(root);
  t.after(h.close);
  await Effect.runPromise(h.attached.ops.spawn(request));
  await until(t, () => run(root)?.sessionId, 'the session started its first turn', { everyMs: 50 });
  await Effect.runPromise(h.attached.ops.say!({ name: NAME, sessionId: NAME }, 'and this too'));
  assert.equal(run(root)?.state, 'working', 'the words it heard are a turn of its own until a result says otherwise');
  assert.deepEqual(
    await until(t, () => lines(dir, 'said.jsonl').length === 2 && lines(dir, 'said.jsonl'), 'the turn in flight heard the words', {
      everyMs: 50,
    }),
    ['do the work', 'and this too'],
    'both were said, into the turn in flight',
  );
  fs.writeFileSync(path.join(dir, 'end'), '');
  const results = await until(t, () => resultsOf(root) || undefined, 'the turn ended, with a result', { everyMs: 50 });
  assert.equal(results, 1, 'the words it folded in ended in the turn it folded them into, so one result answers both');
  assert.equal(run(root)?.state, 'idle', 'one result named both messages, so nothing of it is left unanswered');
});

test(
  "REFUSED: an ask that reached the file after its turn ended is dropped on the holder's look, never kept for the next turn",
  WAITED,
  async (t) => {
    const { root, dir, request } = kept({ hold: true, output: {} });
    const h = await holder(root);
    t.after(h.close);
    await Effect.runPromise(h.attached.ops.spawn(request));
    await until(t, () => run(root)?.sessionId, 'the session started its first turn', { everyMs: 50 });
    fs.writeFileSync(path.join(dir, 'end'), '');
    await idle(t, root, 'and ended it');
    fs.writeFileSync(filesOf(root, NAME).interrupt, '4242');
    await Effect.runPromise(h.attached.ops.observe);
    assert.equal(fs.existsSync(filesOf(root, NAME).interrupt), false, 'the ask goes: there is no turn to end');
    const taken = lines(dir, 'taken.jsonl') as { subtype: string | null }[];
    assert.deepEqual(
      taken.filter((r) => r.subtype === 'interrupt'),
      [],
      'and nothing was asked of the session, so its next turn runs to its own end',
    );
  },
);

test('a holder lets a long-lived session go between turns and the next resumes it under the same Claude Code id', WAITED, async (t) => {
  const { root, dir, request } = kept({ output: {} });
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
  await Effect.runPromise(second.attached.ops.say!({ name: NAME, sessionId: NAME }, 'and now this'));
  await until(t, () => (lines(dir, 'said.jsonl') as string[]).includes('and now this'), 'and she answers the next words', {
    everyMs: 50,
  });
});

test(
  'a long-lived session whose holder is gone says its process is not held, so decide reads it as one being taken up',
  WAITED,
  async () => {
    const { root, request } = kept({ output: {} });
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
  },
);

test('the claude.ai bridge is opened after the first turn where the request asked for one, and its state kept', WAITED, async (t) => {
  const { root, dir, request } = kept({ output: {} }, { claude: { remoteControl: true } });
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
  const { root, dir, request } = kept({ output: {} });
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

test('a resumed session re-attaches the claude.ai session its run file kept', WAITED, async (t) => {
  const { root, dir, request } = kept({ output: {} }, { claude: { remoteControl: true } });
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

test('a drain answers a call nested in one in flight, so the call in flight can end and the holder can let go', WAITED, async (t) => {
  const { root, dir, request } = place({ call: 'Bash', nested: 'Grep', output: {} });
  const h = await holder(root);
  t.after(h.close);
  await Effect.runPromise(h.attached.ops.spawn(request));
  assert.equal((await inCall(t, root)).tool, 'Bash');
  putDrain(root, process.pid);
  fs.writeFileSync(path.join(dir, 'nest'), '');
  await until(t, () => lines(dir, 'answers.jsonl').length >= 2, "the nested call's hook answered", { everyMs: 50 });
  assert.deepEqual(
    (lines(dir, 'answers.jsonl') as { event: string }[]).map((a) => a.event),
    ['PreToolUse', 'PreToolUse'],
    'the nested call is answered while the drain names this holder',
  );
  assert.equal(run(root)?.calling?.tool, 'Bash', 'the call in flight is still the first of the two');
  fs.writeFileSync(path.join(dir, 'release'), '');
  await until(t, () => run(root)?.state === 'completed', 'the call in flight ran to its end', { everyMs: 50 });
});

test("a drain answers a sub-agent's call, which belongs to a call it cannot see in flight", WAITED, async (t) => {
  const { root, dir, request } = place({ nested: 'Grep', fromSubAgent: true, output: {} });
  fs.writeFileSync(path.join(dir, 'nest'), '');
  putDrain(root, process.pid);
  const h = await holder(root);
  t.after(h.close);
  await Effect.runPromise(h.attached.ops.spawn(request));
  await until(t, () => run(root)?.state === 'completed', "the sub-agent's call let through and the session completed", { everyMs: 50 });
  assert.deepEqual(
    (lines(dir, 'answers.jsonl') as { event: string }[]).map((a) => a.event),
    ['PreToolUse'],
    "the sub-agent's call never waited at its hook",
  );
  assert.equal(run(root)?.heldBack, undefined, "a call marked as a sub-agent's is never counted as held back");
});

test('a holder that cannot let go within its bound cuts the call, keeps it on the run file, and parks the session', WAITED, async (t) => {
  const { root, dir, request } = place({ call: 'Bash', output: {} });
  const h = await holder(root, 1_000);
  await Effect.runPromise(h.attached.ops.spawn(request));
  assert.equal((await inCall(t, root)).tool, 'Bash');
  await h.close();
  assert.equal(run(root)?.state, 'parked', 'the let-go returned rather than wait for a call that never ends');
  assert.equal(run(root)?.calling?.tool, 'Bash', 'the call it cut is kept, so the next holder knows which did not finish');
  assert.deepEqual(
    (lines(dir, 'answers.jsonl') as { event: string }[]).map((a) => a.event),
    ['PreToolUse'],
    'the call never ended: its PostToolUse was never asked',
  );
  const child = Number(fs.readFileSync(path.join(dir, 'pid'), 'utf8'));
  await until(t, () => !alive(child), "the session's Claude Code gone: the park ended it", { everyMs: 20 });
  assert.deepEqual(
    h.said,
    [
      'Info letting go of 1 session(s): waiting at most 1000 ms for 1 call(s) in flight (ae/t1/1 Bash)',
      'Warn ae/t1/1 is cut in its call to Bash: it did not end within 1000 ms, and the next holder resumes the session told the call ' +
        'did not finish',
    ],
    'it says it is letting go and how many calls it waits for, then names each session it cut and the call it cut it in',
  );
});

test("a session cut at its holder's bound is resumed told which call did not finish", WAITED, async (t) => {
  const { root, dir, request } = place({ output: { done: 1 } });
  writeRun(root, {
    name: NAME,
    state: 'parked',
    owner: process.pid,
    startedAt: new Date().toISOString(),
    sessionId: 'cut-session',
    calling: { tool: 'Agent', since: new Date().toISOString() },
    request: { ...request, brief: undefined },
  });
  const h = await holder(root);
  t.after(h.close);
  await Effect.runPromise(h.attached.ops.observe);
  await until(t, () => lines(dir, 'said.jsonl').length, 'the resumed session told something', { everyMs: 50 });
  assert.deepEqual(lines(dir, 'said.jsonl'), [crashNote('Agent')]);
  assert.notDeepEqual(lines(dir, 'said.jsonl'), [CARRY_ON], 'a session whose call was cut is never told to carry on');
});

/**
 * A session its holder can never wait out, as the let-go finds it in `live`: a call in flight that never ends, a `done` that never
 * settles and a call held at a hook that never lets go, so each of the let-go's three waits runs to whatever it was given. `facts`
 * are written on its run file. Nothing of the session's input is modelled: the let-go reads none of it.
 *
 * The budget is the purse's, and the purse spends it on the clock: a wait given 800 ms whose elapsed `monoNow` reads as 799 — it
 * keeps whole milliseconds — leaves 201 for the next, so what was given can stand one millisecond per take above the budget. The
 * sum is held to that, never to a wall-clock bound: the share is a ceiling on the long wait, never a floor on the short ones
 * (`letGoOf`, `harness/claude/attached.ts`), so a take debited its whole allowance would leave the last wait nothing.
 */
const stuck = (facts: Partial<Parameters<typeof writeRun>[1]> = {}): Live =>
  ({
    run: {
      name: NAME,
      state: 'working',
      owner: process.pid,
      startedAt: new Date().toISOString(),
      sessionId: 'never-ends',
      calling: { tool: 'Agent', since: new Date().toISOString() },
      request: {},
      ...facts,
    },
    abort: new AbortController(),
    calls: new Map([['call-1', { tool: 'Agent', since: new Date().toISOString() }]]),
    letGo: false,
    waiting: 1,
    done: new Promise<void>(() => undefined),
  }) as unknown as Live;

/** The let-go of `live` under a budget of `ms`, its lines dropped, and the purse its waits took from. */
const letGone = async (root: string, live: Map<string, Live>, ms: number) => {
  const purse = purseOf(ms, instantNow);
  const quiet = Logger.make(() => undefined);
  await Effect.runPromise(letGoOf(root, live, ms, purse).pipe(Effect.provide(Logger.layer([quiet]))));
  return purse;
};

test('a let-go whose session never ends returns all the same, its three waits inside one budget', WAITED, async () => {
  const { root } = place({});
  const purse = await letGone(root, new Map([[NAME, stuck()]]), 1_000);
  assert.equal(purse.given.length, 3, 'each of its three waits took from the one purse, so each of them is bounded');
  assert.ok(
    purse.given.reduce((a, b) => a + b, 0) <= 1_000 + purse.given.length,
    `the waits of one let-go add up to no more than its budget, not ${purse.given.join(' + ')}`,
  );
  assert.ok(purse.given[0] > 0 && purse.given[1] > 0, 'and the waits before the last each had something to wait with');
  assert.equal(run(root)?.state, 'parked', 'it parked the session it could not wait out');
  assert.equal(run(root)?.calling?.tool, 'Agent', 'keeping the call it cut');
});

test("the park leaves alone a process that has taken the session's Claude Code's pid since", WAITED, async (t) => {
  const { root } = place({});
  const taken = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', detached: true });
  t.after(() => void (taken.pid && alive(taken.pid) && process.kill(-taken.pid, 'SIGKILL')));
  const facts = { childPid: taken.pid!, childStart: "when the session's Claude Code started, not this process" };
  await letGone(root, new Map([[NAME, stuck(facts)]]), 1_000);
  assert.equal(alive(taken.pid!), true, "the process that took the pid is not the session's, and the park left it alone");
  assert.equal(run(root)?.state, 'parked');
  assert.equal(run(root)?.childPid, undefined, 'and the parked file names no Claude Code of its own');
});

test("a session is started on Claude Code's own system prompt, the agent's appended to it", WAITED, async (t) => {
  const prompt = path.join(scratch('ae-attached-prompt-'), 'agent.md');
  fs.writeFileSync(prompt, 'you are the agent');
  const { root, dir, request } = place({ output: {} }, { claude: { appendSystemPromptFile: prompt } });
  const h = await holder(root);
  t.after(h.close);
  await Effect.runPromise(h.attached.ops.spawn(request));
  await until(t, () => run(root)?.state === 'completed', 'the session completed', { everyMs: 50 });
  const [init] = lines(dir, 'initialize.jsonl') as { systemPrompt?: unknown; appendSystemPrompt?: unknown }[];
  assert.ok(init, 'the SDK sent an initialize request');
  assert.equal(
    init.systemPrompt,
    undefined,
    `the preset sends no prompt of ours, so Claude Code renders its own; it sent ${JSON.stringify(init.systemPrompt)}`,
  );
  assert.equal(
    init.appendSystemPrompt,
    'you are the agent',
    "the agent's own prompt is appended on the initialize request (`sdk.d.ts:4687`), as its text and not its file's path",
  );
  const [argv] = lines(dir, 'argv.jsonl') as string[][];
  assert.ok(!argv.includes('--append-system-prompt-file'), "the prompt is no longer a flag: the SDK carries it in the session's init");
  assert.ok(!argv.includes('--system-prompt'), "no prompt of ours is spawned: the preset is Claude Code's own");
});

test('a task’s servers ride the child’s argv as inline JSON, strict, and the window rides the settings', WAITED, async (t) => {
  const { root, dir, request } = place(
    { output: {} },
    { contextTokens: 150_000, mcp: { probe: { command: 'probe-server', args: ['--once'] } } },
  );
  const stale = filesOf(root, NAME).mcp;
  fs.mkdirSync(path.dirname(stale), { recursive: true });
  fs.writeFileSync(stale, JSON.stringify({ mcpServers: { gone: { command: 'a server it was not given' } } }));
  const h = await holder(root);
  t.after(h.close);
  await Effect.runPromise(h.attached.ops.spawn(request));
  await until(t, () => run(root)?.state === 'completed', 'the session completed', { everyMs: 50 });
  const [argv] = lines(dir, 'argv.jsonl') as string[][];
  assert.deepEqual(
    JSON.parse(sdkArgValue(argv, '--mcp-config')),
    { mcpServers: { probe: { command: 'probe-server', args: ['--once'] } } },
    'the servers themselves, inline, where the runtime used to name a file of its own',
  );
  assert.ok(argv.includes('--strict-mcp-config'), '`strictMcpConfig` is still the fence');
  assert.equal(fs.existsSync(stale), false, 'a config an older runtime left under this name is cleared at the spawn, never read');
  assert.ok(!argv.includes('--autocompact'), 'the window is no flag of ours any more');
  assert.deepEqual(
    JSON.parse(sdkArgValue(argv, '--settings')),
    { autoMemoryEnabled: false, autoCompactWindow: 150_000 },
    'it rides the one settings object, beside auto-memory off: `Settings.autoCompactWindow`, which the SDK spells as `--settings`',
  );
});

test("a long-lived session is started on that same prompt: one path builds an attached session's options", WAITED, async (t) => {
  const prompt = path.join(scratch('ae-attached-kept-prompt-'), 'agent.md');
  fs.writeFileSync(prompt, 'you are the agent');
  const { root, dir, request } = kept({ output: {} }, { claude: { appendSystemPromptFile: prompt } });
  const h = await holder(root);
  t.after(h.close);
  await Effect.runPromise(h.attached.ops.spawn(request));
  await idle(t, root, 'the long-lived session answered its first turn');
  const [init] = lines(dir, 'initialize.jsonl') as { systemPrompt?: unknown; appendSystemPrompt?: unknown }[];
  assert.ok(init, 'the SDK sent an initialize request');
  assert.equal(init.systemPrompt, undefined, 'the preset sends no prompt of ours here either');
  assert.equal(init.appendSystemPrompt, 'you are the agent', "the agent's own prompt is appended to a long-lived session too");
  const [argv] = lines(dir, 'argv.jsonl') as string[][];
  assert.ok(!argv.includes('--append-system-prompt-file'), 'and neither session has it as a flag');
  assert.ok(!argv.includes('--system-prompt'), 'and no prompt of ours is spawned: Claude Code renders its own');
});

test('a spawn whose options are refused leaves no run file behind: no held sighting of a session that never started', async (t) => {
  const bad = (what: string, config: SpawnRequest['config'], mcp?: string) => {
    const { root, dir, request } = place({ output: {} }, config);
    if (mcp !== undefined) fs.writeFileSync(path.join(dir, '.mcp.json'), mcp);
    return { what, root, request };
  };
  const cases = [
    bad('a prompt file that cannot be read', { claude: { appendSystemPromptFile: 'not-there.md' } }),
    bad('a `config.claude` flag given two values', { claude: { someFlag: ['one', 'two'] } }),
    bad('a checkout `.mcp.json` that is not JSON', {}, '{ not json'),
  ];
  for (const { what, root, request } of cases) {
    const h = await holder(root);
    t.after(h.close);
    const exit = await Effect.runPromiseExit(h.attached.ops.spawn(request));
    assert.ok(Exit.isFailure(exit), `${what}: the spawn is refused`);
    assert.equal(fs.existsSync(filesOf(root, NAME).run), false, `${what}: no run file is left for a session query() never started`);
    assert.deepEqual(
      [...(await Effect.runPromise(h.attached.ops.observe)).keys()],
      [],
      `${what}: and a later pass reads no sighting at all, held or otherwise`,
    );
  }
});
