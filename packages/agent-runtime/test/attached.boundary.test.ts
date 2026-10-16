/**
 * Claude Code attached on the Agent SDK, against a stand-in CLI (`fixtures/stand-in-claude.ts`) the SDK spawns as it would Claude
 * Code: a holder's let-go waits for the call in flight and parks the session, the next holder resumes it under the same id, a session
 * whose holder died mid-call is told which call did not finish, a non-holder neither adopts nor spawns attached, a denial is journalled
 * while the attempt is at work, a call that would ask is denied in the holder, a drain holds new calls, a drain never holds a call
 * nested in one in flight nor a sub-agent's, a holder that cannot let go within its bound cuts the call and says which, the next
 * holder resumes a session told which call was cut, a stop and words from another engine reach the session, a call held at its hook as
 * the holder lets go is never written in flight, a holder whose pid another process has taken is gone, neither a drain nor a kill
 * reaches a process given a pid since, a let-go whose sessions never end still returns with its waits inside one budget, and a
 * resumed session's cost leaves out what its parent spent.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Effect, Exit, Logger, Scope } from 'effect';
import { attachedSessions, letGoOf } from '../src/harness/claude/attached.ts';
import {
  alive,
  attachedDir,
  crashNote,
  CARRY_ON,
  filesOf,
  putDrain,
  readRun,
  thisHolder,
  writeRun,
} from '../src/harness/claude/attached-file.ts';
import { processStart } from '../src/harness/claude/inbox.ts';
import { purseOf } from '../src/core/clock.ts';
import { instantNow } from '../src/core/engine/now.ts';
import type { Live } from '../src/harness/claude/attached-session.ts';
import { claudeCodeOps } from '../src/harness/claude/code.ts';
import { Engine } from '../src/index.ts';
import type { SpawnRequest } from '../src/harness/seam.ts';
import { scratch } from './scratch.ts';
import { until, WAITED } from './waits.ts';

const STAND_IN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'stand-in-claude.ts');
const NAME = 'ae/t1/1';

/** A store and the stand-in's folder, and a spawn of `plan` whose session works there. */
const place = (plan: object) => {
  const root = scratch('ae-attached-');
  const dir = path.join(root, 'stand-in');
  fs.mkdirSync(dir, { recursive: true });
  const request: SpawnRequest = {
    name: NAME,
    brief: 'do the work',
    cwd: dir,
    config: { env: { STANDIN_DIR: dir, STANDIN_PLAN: JSON.stringify(plan) } },
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

/**
 * A holder of the sessions under `root`, for a scope the test closes, its let-go bound `letGoMs` where one is given. `said` keeps every
 * line its let-go logged, at its level, so what the holder says as it lets go is read rather than printed.
 */
const holder = async (root: string, letGoMs?: number) => {
  const attached = attachedSessions(root, STAND_IN, letGoMs === undefined ? {} : { letGoMs });
  const scope = Scope.makeUnsafe();
  const said: string[] = [];
  const keeper = Logger.make(
    ({ message, logLevel }) => void said.push(`${logLevel} ${(Array.isArray(message) ? message : [message]).join(' ')}`),
  );
  await Effect.runPromise(Scope.provide(attached.hold, scope));
  return {
    attached,
    said,
    close: () => Effect.runPromise(Scope.close(scope, Exit.void).pipe(Effect.provide(Logger.layer([keeper])))),
  };
};

/** What the run file says of the session, read again. */
const run = (root: string) => readRun(filesOf(root, NAME).run);

/** Waits until the stand-in is in its call, held at `release`. */
const inCall = (t: TestContext, root: string) => until(t, () => run(root)?.calling, 'the session in its call', { everyMs: 50 });

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
    (lines(dir, 'answers.jsonl') as { event: string }[]).map((a) => a.event),
    ['PreToolUse', 'PostToolUse'],
    'the call ran to its end before the session was let go',
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
    purse.given.reduce((a, b) => a + b, 0) <= 1_000,
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
