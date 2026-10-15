/**
 * Claude Code attached on the Agent SDK, against a stand-in CLI (`fixtures/stand-in-claude.ts`) the SDK spawns as it would Claude
 * Code: a holder's let-go waits for the call in flight and parks the session, the next holder resumes it under the same id, a session
 * whose holder died mid-call is told which call did not finish, a non-holder neither adopts nor spawns attached, a denial is journalled
 * while the attempt is at work, a call that would ask is denied in the holder, a drain holds new calls, and a stop from another
 * engine cancels the session.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Effect, Exit, Scope } from 'effect';
import { attachedSessions } from '../src/harness/claude/attached.ts';
import { alive, crashNote, CARRY_ON, filesOf, putDrain, readRun, writeRun } from '../src/harness/claude/attached-file.ts';
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

/** A holder of the sessions under `root`, for a scope the test closes. */
const holder = async (root: string) => {
  const attached = attachedSessions(root, STAND_IN);
  const scope = Scope.makeUnsafe();
  await Effect.runPromise(Scope.provide(attached.hold, scope));
  return { attached, close: () => Effect.runPromise(Scope.close(scope, Exit.void)) };
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
  await until(t, () => lines(dir, 'asked.jsonl').length, 'the call asked its hook', { everyMs: 50 });
  await Effect.runPromise(h.attached.ops.observe);
  assert.deepEqual(lines(dir, 'answers.jsonl'), [], 'the call waits at its hook while drained');
  assert.equal(run(root)?.calling, undefined, 'a call held is not in flight');
  putDrain(root, process.pid + 1_000_000);
  await until(t, () => run(root)?.state === 'completed', 'the call let through and the session completed', { everyMs: 50 });
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
