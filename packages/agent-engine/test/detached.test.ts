/**
 * The detached runner, against the REAL worker — using `sh` as the harness, so it costs nothing.
 *
 * That substitution is the point of the design: the worker needs a command and an exit code, so
 * anything that runs and exits is a harness as far as this code is concerned.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detachedOps, STALE_MS, type HarnessSpec } from '../src/runner-detached.ts';
import { composite } from '../src/runner-composite.ts';
import { testOps } from '../src/runner.ts';
import type { Sighting } from '../src/domain.ts';

const root = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ae-detached-'));
const sh = (script: string): HarnessSpec => ({ name: 'sh', command: () => ({ cmd: 'sh', args: ['-c', script] }) });
const req = (name: string, cwd: string) => ({ name, brief: 'x', cwd });

const settle = async (ops: ReturnType<typeof detachedOps>, name: string, want: string, ms = 15_000) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const seen = (await Effect.runPromise(ops.observe)).get(name);
    if (seen?.state === want) return seen;
    await new Promise((r) => setTimeout(r, 150));
  }
  const seen = (await Effect.runPromise(ops.observe)).get(name);
  assert.fail(`never reached ${want}; last was ${seen?.state ?? 'nothing'}`);
};

test('a detached session runs, is observable while running, and reports success', async () => {
  const dir = root();
  const ops = detachedOps(sh('sleep 1; echo done > out.txt; exit 0'), dir);
  await Effect.runPromise(ops.spawn(req('ae/t1/1', dir)));

  const running = (await Effect.runPromise(ops.observe)).get('ae/t1/1');
  assert.equal(running?.state, 'working', 'visible immediately, before it finishes');

  await settle(ops, 'ae/t1/1', 'done');
  assert.equal(fs.readFileSync(path.join(dir, 'out.txt'), 'utf8').trim(), 'done');
});

test('a non-zero exit is a failure — the only signal a generic harness has to give', async () => {
  const dir = root();
  const ops = detachedOps(sh('exit 3'), dir);
  await Effect.runPromise(ops.spawn(req('ae/t2/1', dir)));
  await settle(ops, 'ae/t2/1', 'failed');
});

test('the worker outlives the process that spawned it', async () => {
  // `spawn` returns as soon as the child is unref'd; the session is still going. If the worker
  // were tied to this process it could not still be `working` after spawn resolved.
  const dir = root();
  const ops = detachedOps(sh('sleep 2; exit 0'), dir);
  await Effect.runPromise(ops.spawn(req('ae/t3/1', dir)));

  await new Promise((r) => setTimeout(r, 500));
  assert.equal((await Effect.runPromise(ops.observe)).get('ae/t3/1')?.state, 'working');
  await settle(ops, 'ae/t3/1', 'done');
});

test('stop reaches the detached worker, which kills the harness and says so', async () => {
  const dir = root();
  const ops = detachedOps(sh('sleep 30'), dir);
  await Effect.runPromise(ops.spawn(req('ae/t4/1', dir)));
  await settle(ops, 'ae/t4/1', 'working');

  // Re-issued every pass, exactly as the engine does: the first may land in the window before
  // the worker has published its pid, and a level-triggered loop simply asks again.
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    await Effect.runPromise(ops.stop('ae/t4/1'));
    if ((await Effect.runPromise(ops.observe)).get('ae/t4/1')?.state === 'stopped') break;
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.equal((await Effect.runPromise(ops.observe)).get('ae/t4/1')?.state, 'stopped');
});

test('THE LEASE: a run file whose heartbeat stopped is reported dead, not running', async () => {
  const dir = root();
  const ops = detachedOps(sh('true'), dir);
  const runs = path.join(dir, 'runs', 'sh');
  fs.mkdirSync(runs, { recursive: true });

  const write = (heartbeatAgoMs: number) =>
    fs.writeFileSync(path.join(runs, 'ae_t5_1.json'), JSON.stringify({
      name: 'ae/t5/1', state: 'working', pid: 999999, logFile: '/dev/null',
      heartbeatAt: new Date(Date.now() - heartbeatAgoMs).toISOString(),
    }));

  write(1_000);
  assert.equal((await Effect.runPromise(ops.observe)).get('ae/t5/1')?.state, 'working', 'a fresh beat is alive');

  write(STALE_MS + 5_000);
  assert.equal((await Effect.runPromise(ops.observe)).get('ae/t5/1')?.state, 'failed', 'a stopped beat is dead');
});

test('logs come back from the worker capture', async () => {
  const dir = root();
  const ops = detachedOps(sh('echo hello-from-the-harness; exit 0'), dir);
  await Effect.runPromise(ops.spawn(req('ae/t6/1', dir)));
  await settle(ops, 'ae/t6/1', 'done');
  assert.match(await Effect.runPromise(ops.logs('ae/t6/1')), /hello-from-the-harness/);
});

// ─── the composite ──────────────────────────────────────────────────────────

test('the composite sends each task to the harness it asked for', async () => {
  const a = new Map<string, Sighting>();
  const b = new Map<string, Sighting>();
  const ops = composite({ alpha: testOps({ sessions: a }), beta: testOps({ sessions: b }) }, 'alpha');

  await Effect.runPromise(ops.spawn({ name: 'ae/x/1', brief: '', cwd: '/', harness: 'beta' }));
  await Effect.runPromise(ops.spawn({ name: 'ae/y/1', brief: '', cwd: '/' })); // no harness -> fallback

  assert.deepEqual([...a.keys()], ['ae/y/1']);
  assert.deepEqual([...b.keys()], ['ae/x/1']);
});

test('the composite merges what every harness sees into one map', async () => {
  const a = new Map<string, Sighting>([['ae/x/1', { sessionId: 's-a', state: 'working' }]]);
  const b = new Map<string, Sighting>([['ae/y/1', { sessionId: 's-b', state: 'done' }]]);
  const ops = composite({ alpha: testOps({ sessions: a }), beta: testOps({ sessions: b }) }, 'alpha');

  const merged = await Effect.runPromise(ops.observe);
  assert.deepEqual([...merged.keys()].sort(), ['ae/x/1', 'ae/y/1']);
  assert.equal(merged.get('ae/y/1')?.state, 'done');
});

test('the composite routes stop to whichever harness owns that session', async () => {
  const a = new Map<string, Sighting>([['ae/x/1', { sessionId: 's-a', state: 'working' }]]);
  const b = new Map<string, Sighting>([['ae/y/1', { sessionId: 's-b', state: 'working' }]]);
  const ops = composite({ alpha: testOps({ sessions: a }), beta: testOps({ sessions: b }) }, 'alpha');

  await Effect.runPromise(ops.observe); // learn who owns what
  await Effect.runPromise(ops.stop('s-b'));

  assert.equal(b.get('ae/y/1')?.state, 'stopped', 'beta was told');
  assert.equal(a.get('ae/x/1')?.state, 'working', 'alpha was not');
});

test('one harness failing to answer does not blind the engine to the others', async () => {
  const good = new Map<string, Sighting>([['ae/x/1', { sessionId: 's-a', state: 'working' }]]);
  const broken = { ...testOps(), observe: Effect.die(new Error('harness is down')) };
  const ops = composite({ alpha: testOps({ sessions: good }), beta: broken }, 'alpha');

  const merged = await Effect.runPromise(ops.observe);
  assert.deepEqual([...merged.keys()], ['ae/x/1']);
});

// ─── isolation: the flag shapes differ per harness, which is what a spec is for ──

test('a worktree is always NAMED for Claude — a bare --worktree would eat the prompt', async () => {
  const { claudeDetached } = await import('../src/runner-detached.ts');
  const args = claudeDetached.command({ name: 'ae/t-abc/2', brief: 'the prompt', cwd: '/r', worktree: true }).args;
  const i = args.indexOf('--worktree');
  assert.notEqual(i, -1);
  assert.equal(args[i + 1], 'ae-t-abc-2', 'derived from the session name, never absent');
  assert.ok(args.includes('the prompt'), 'and the prompt survives');
});

test('a task may name its own worktree', async () => {
  const { claudeDetached } = await import('../src/runner-detached.ts');
  const args = claudeDetached.command({ name: 'ae/t-abc/2', brief: 'b', cwd: '/r', worktree: 'my-branch' }).args;
  assert.equal(args[args.indexOf('--worktree') + 1], 'my-branch');
});

test("codex's worktree flag takes no value, so the prompt still follows it safely", async () => {
  const { codex } = await import('../src/runner-detached.ts');
  const args = codex.command({ name: 'ae/t-abc/1', brief: 'the prompt', cwd: '/r', worktree: true }).args;
  assert.equal(args[args.indexOf('--worktree') + 1], 'the prompt', 'the prompt, not a name');
  assert.equal(args.at(-1), 'the prompt');
});

test('the default permission mode is `auto` — a fleet cannot wait for a person', async () => {
  // `acceptEdits` looks safer and is worse here: it approves edits but not `npm test`, so an
  // unattended session blocks the moment it wants to run its own tests.
  const { claudeDetached } = await import('../src/runner-detached.ts');
  const args = claudeDetached.command({ name: 'ae/t/1', brief: 'b', cwd: '/r' }).args;
  assert.equal(args[args.indexOf('--permission-mode') + 1], 'auto');

  const chosen = claudeDetached.command({ name: 'ae/t/1', brief: 'b', cwd: '/r', permissionMode: 'dontAsk' }).args;
  assert.equal(chosen[chosen.indexOf('--permission-mode') + 1], 'dontAsk', 'and a task may still choose');
});

// ─── the closing statement ──────────────────────────────────────────────────

test('codex is given the schema and an output file, and the prompt still comes last', async () => {
  const { codex } = await import('../src/runner-detached.ts');
  const args = codex.command(
    { name: 'ae/t/1', brief: 'the prompt', cwd: '/r', closeoutSchema: {} },
    { closeoutSchemaFile: '/board/s.schema.json', closeoutFile: '/board/s.closeout.json' },
  ).args;
  assert.equal(args[args.indexOf('--output-schema') + 1], '/board/s.schema.json');
  assert.equal(args[args.indexOf('-o') + 1], '/board/s.closeout.json');
  assert.equal(args.at(-1), 'the prompt');
  assert.ok(!codex.command({ name: 'ae/t/1', brief: 'b', cwd: '/r' }).args.includes('--output-schema'), 'no schema, no flag');
});

test("a detached harness's final answer is its closing statement — and nothing lands in the workspace", async () => {
  const dir = root();
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-ws-'));
  const answers: HarnessSpec = {
    name: 'sh',
    command: (_r, io) => ({ cmd: 'sh', args: ['-c', `printf '%s' '{"outcome":"done"}' > '${io?.closeoutFile}'`] }),
  };
  const ops = detachedOps(answers, dir);
  await Effect.runPromise(ops.spawn({ name: 'ae/t9/1', brief: 'x', cwd: workspace, closeoutSchema: { type: 'object' } }));

  const seen = await settle(ops, 'ae/t9/1', 'done');
  assert.deepEqual(seen.closeout?.payload, { outcome: 'done' });
  assert.equal(typeof seen.closeout?.at, 'number');
  assert.deepEqual(fs.readdirSync(workspace), [], 'the workspace is the one place it must not be');
});

test('a re-spawn of the same attempt does not find the last answer waiting for it', async () => {
  const dir = root();
  const quiet: HarnessSpec = { name: 'sh', command: () => ({ cmd: 'sh', args: ['-c', 'sleep 2'] }) };
  const ops = detachedOps(quiet, dir);
  const leftover = path.join(dir, 'runs', 'sh', 'ae_t10_1.closeout.json');
  fs.mkdirSync(path.dirname(leftover), { recursive: true });
  fs.writeFileSync(leftover, '{"outcome":"done"}');

  await Effect.runPromise(ops.spawn({ name: 'ae/t10/1', brief: 'x', cwd: dir, closeoutSchema: {} }));
  assert.equal((await Effect.runPromise(ops.observe)).get('ae/t10/1')?.closeout, undefined);
});
