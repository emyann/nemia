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
import { claudeResultOutput, detachedOps, STALE_MS, trustedProjects, type HarnessIO, type HarnessSpec } from '../src/runner-detached.ts';
import { createEngine } from '../src/facade.ts';
import { execFileSync } from 'node:child_process';
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

test('the composite sends a release only to the harness that reported the session — never to the fallback', async () => {
  const released: string[] = [];
  const a = new Map<string, Sighting>([['ae/x/1', { sessionId: 's-a', state: 'done' }]]);
  const b = new Map<string, Sighting>([['ae/y/1', { sessionId: 's-b', state: 'done' }]]);
  const alpha = { ...testOps({ sessions: a }), release: (s: Sighting) => Effect.sync(() => { released.push(s.sessionId); }) };
  const ops = composite({ alpha, beta: testOps({ sessions: b }) }, 'alpha');

  await Effect.runPromise(ops.release!({ sessionId: 's-b', state: 'done' }, {}));
  assert.deepEqual(released, [], 'no pass has said whose it is: nobody is asked, the fallback least of all');
  await Effect.runPromise(ops.observe);
  await Effect.runPromise(ops.release!({ sessionId: 's-b', state: 'done' }, {}));
  assert.deepEqual(released, [], 'beta has no release, so there is nothing to do');
  await Effect.runPromise(ops.release!({ sessionId: 's-a', state: 'done' }, {}));
  assert.deepEqual(released, ['s-a']);
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

test('codex runs read-only when the task says read-only — never widened to workspace-write', async () => {
  const { codex } = await import('../src/runner-detached.ts');
  const sandbox = (permissionMode?: string) => {
    const args = codex.command({ name: 'ae/t/1', brief: 'b', cwd: '/r', permissionMode }).args;
    return args[args.indexOf('-s') + 1];
  };
  assert.equal(sandbox('read-only'), 'read-only');
  assert.equal(sandbox(), 'workspace-write', 'the shipped default is unchanged');
  assert.equal(sandbox('bypassPermissions'), 'danger-full-access');
  // Codex's own words are its own sandboxes. `danger-full-access` used to become workspace-write.
  assert.equal(sandbox('danger-full-access'), 'danger-full-access');
  assert.equal(sandbox('workspace-write'), 'workspace-write');
});

test("codex refuses a permission mode that is not one of its sandboxes; Claude's harnesses refuse Codex's", async () => {
  const { codex, claudeDetached } = await import('../src/runner-detached.ts');
  const task = (permissionMode: string) => ({ brief: 'b', cwd: '/r', permissionMode });
  assert.match(codex.refuses!(task('acceptEdits')) ?? '', /not a sandbox Codex has.*read-only, workspace-write, danger-full-access/);
  assert.match(claudeDetached.refuses!(task('read-only')) ?? '', /not a mode Claude Code has/);
  assert.equal(codex.refuses!(task('read-only')), undefined);
  assert.equal(claudeDetached.refuses!(task('auto')), undefined);
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


test('a resumed codex task puts every flag before `resume`, then the id, then the prompt', async () => {
  // `codex exec resume <id> -C … -s …` fails to parse: the subcommand takes only `[SESSION_ID]
  // [PROMPT]`. Verified against 0.154.0. The spec emitted exactly that shape until this test.
  const { codex } = await import('../src/runner-detached.ts');
  const args = codex.command(
    { name: 'ae/t/2', brief: 'answer the review', cwd: '/wt', resumeFrom: 'abc-123', worktree: true, closeoutSchema: {} },
    { closeoutSchemaFile: '/b/s.json', closeoutFile: '/b/o.json' },
  ).args;
  const at = args.indexOf('resume');
  assert.notEqual(at, -1);
  assert.deepEqual(args.slice(at), ['resume', 'abc-123', 'answer the review'], 'nothing but the id and the prompt after it');
  for (const flag of ['-C', '-s', '--output-schema', '-o', '--worktree']) {
    assert.ok(args.indexOf(flag) !== -1 && args.indexOf(flag) < at, `${flag} before resume`);
  }
});

// ─── trust: extended from your own Codex config, never granted ──────────────

test('trusted projects are read the way Codex writes them, and only those', () => {
  const toml = [
    '[projects."/home/u/repo"]', 'trust_level = "trusted"', '',
    '[projects."/home/u/other"]', 'trust_level = "untrusted"', '',
    '[model_providers.x]', 'trust_level = "trusted"',
  ].join('\n');
  assert.deepEqual([...trustedProjects(toml)], ['/home/u/repo']);
});

/** A repository with one linked worktree, and a Codex home that does or does not trust it. */
const repoWithWorktree = (trust: boolean) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-trust-repo-'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'root'], { cwd: repo });
  const wt = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ae-trust-wt-')), 'step');
  execFileSync('git', ['worktree', 'add', '-q', wt], { cwd: repo, stdio: 'ignore' });
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-codex-home-'));
  if (trust) fs.writeFileSync(path.join(home, 'config.toml'), `[projects."${repo}"]\ntrust_level = "trusted"\n`);
  return { repo, wt, home };
};

const inCodexHome = <T>(home: string, f: () => T): T => {
  const prev = process.env.CODEX_HOME;
  process.env.CODEX_HOME = home;
  try { return f(); } finally { if (prev === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = prev; }
};

test('a worktree of a repository you trust in Codex is trusted for the run, repository included', async () => {
  const { codex } = await import('../src/runner-detached.ts');
  const { repo, wt, home } = repoWithWorktree(true);
  const io = inCodexHome(home, () => codex.prepare!({ name: 'ae/t/1', brief: 'b', cwd: wt }));
  assert.deepEqual(io.trustedDirs, [repo, wt]);
});

test('a repository you never trusted gets no trust from the engine', async () => {
  // Trusting it would also load whatever Codex settings it ships. Not the engine's call.
  const { codex } = await import('../src/runner-detached.ts');
  const { wt, home } = repoWithWorktree(false);
  const io = inCodexHome(home, () => codex.prepare!({ name: 'ae/t/1', brief: 'b', cwd: wt }));
  assert.equal(io.trustedDirs, undefined);
});

test('outside a repository there is nothing to extend', async () => {
  const { codex } = await import('../src/runner-detached.ts');
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-plain-'));
  assert.deepEqual(codex.prepare!({ name: 'ae/t/1', brief: 'b', cwd: plain }), {});
});

test('trust reaches codex as config overrides, every one before `resume`', async () => {
  const { codex } = await import('../src/runner-detached.ts');
  const args = codex.command({ name: 'ae/t/2', brief: 'the prompt', cwd: '/wt', resumeFrom: 'abc' }, { trustedDirs: ['/repo', '/wt'] }).args;
  const overrides = args.flatMap((a, i) => (a === '-c' ? [args[i + 1]] : []));
  assert.deepEqual(overrides, ['projects."/repo".trust_level="trusted"', 'projects."/wt".trust_level="trusted"']);
  assert.ok(args.lastIndexOf('-c') < args.indexOf('resume'));
  assert.equal(args.at(-1), 'the prompt');
});

test("the runner merges what a spec prepares into what its command is given", async () => {
  let given: HarnessIO | undefined;
  const spy: HarnessSpec = {
    name: 'sh',
    prepare: () => ({ trustedDirs: ['/somewhere'] }),
    command: (_r, io) => { given = io; return { cmd: 'sh', args: ['-c', 'exit 0'] }; },
  };
  await Effect.runPromise(detachedOps(spy, root()).spawn({ name: 'ae/t13/1', brief: 'x', cwd: root(), closeoutSchema: {} }));
  assert.deepEqual(given?.trustedDirs, ['/somewhere']);
  assert.ok(given?.closeoutFile, 'alongside what the runner chose itself');
});

// ─── the fence and the effort, per harness ──────────────────────────────────

test('at shipped defaults neither detached harness is given a tool list or an effort', async () => {
  const { codex, claudeDetached } = await import('../src/runner-detached.ts');
  const c = codex.command({ name: 'ae/t/1', brief: 'b', cwd: '/r' }).args;
  assert.equal(c.some((a) => a.startsWith('model_reasoning_effort')), false);
  assert.equal(c[c.indexOf('-s') + 1], 'workspace-write');
  const d = claudeDetached.command({ name: 'ae/t/1', brief: 'b', cwd: '/r' }).args;
  assert.equal(d.includes('--tools'), false);
  assert.equal(d.includes('--effort'), false);
});

test('codex runs read-only when its tools have none of Bash, Write or Edit — whatever sandbox it named', async () => {
  const { codex } = await import('../src/runner-detached.ts');
  const sandbox = (r: { tools?: string[]; permissionMode?: string }) => {
    const args = codex.command({ name: 'ae/t/1', brief: 'b', cwd: '/r', ...r }).args;
    return args[args.indexOf('-s') + 1];
  };
  assert.equal(sandbox({ tools: ['Read', 'Grep', 'Glob'] }), 'read-only');
  assert.equal(sandbox({ tools: ['Read', 'Grep', 'Glob'], permissionMode: 'danger-full-access' }), 'read-only', 'the narrower fence wins');
  assert.equal(sandbox({ tools: [] }), 'read-only', 'no tools at all');
  assert.equal(sandbox({ tools: ['Read', 'Bash'] }), 'workspace-write', 'a list with a shell does not narrow codex');
  assert.equal(sandbox({ tools: ['Read', 'Bash'], permissionMode: 'read-only' }), 'read-only', 'and the mode it named still holds');
});

test('effort reaches codex as a config override before `resume`, and claude-detached as --effort', async () => {
  const { codex, claudeDetached } = await import('../src/runner-detached.ts');
  const c = codex.command({ name: 'ae/t/2', brief: 'the prompt', cwd: '/wt', effort: 'high', resumeFrom: 'abc' }).args;
  const i = c.indexOf('model_reasoning_effort="high"');
  assert.ok(i > 0 && c[i - 1] === '-c', '-c model_reasoning_effort="high"');
  assert.ok(i < c.indexOf('resume'), 'before resume, which rejects flags after its id');
  assert.equal(c.at(-1), 'the prompt');

  const d = claudeDetached.command({ name: 'ae/t/1', brief: 'the prompt', cwd: '/r', effort: 'max', tools: ['Read', 'Grep'] }).args;
  assert.equal(d[d.indexOf('--effort') + 1], 'max');
  assert.equal(d[d.indexOf('--tools') + 1], 'Read,Grep');
  assert.equal(d[d.indexOf('--tools') + 2], '--permission-mode', 'a flag ends the variadic list');
});

test('an effort a harness does not have is refused by that harness, in its own words', async () => {
  const { codex, claudeDetached } = await import('../src/runner-detached.ts');
  const task = (effort: string) => ({ brief: 'b', cwd: '/r', effort });
  assert.match(codex.refuses!(task('extreme')) ?? '', /not a reasoning effort Codex has.*none, minimal, low, medium, high, xhigh, max/);
  // Claude Code would only warn and run at its default, so the engine refuses what the CLI ignores.
  assert.match(claudeDetached.refuses!(task('minimal')) ?? '', /not an effort Claude Code has.*low, medium, high, xhigh, max/);
  assert.equal(codex.refuses!(task('minimal')), undefined);
  assert.equal(claudeDetached.refuses!(task('xhigh')), undefined);
});

// ─── the exit code: a fact about the process ────────────────────────────────

test("a detached session's exit code is on its sighting, and no usage is invented beside it", async () => {
  const dir = root();
  const ops = detachedOps(sh('exit 3'), dir);
  await Effect.runPromise(ops.spawn(req('ae/t14/1', dir)));
  const seen = await settle(ops, 'ae/t14/1', 'failed');
  assert.equal(seen?.exitCode, 3);
  assert.equal(seen?.usage, undefined, 'a generic harness measures no usage, and reports none rather than 0');
});

test("no exit code yet, or the worker's -1 for none, is reported as no code at all", async () => {
  const dir = root();
  const ops = detachedOps(sh('true'), dir);
  const runs = path.join(dir, 'runs', 'sh');
  fs.mkdirSync(runs, { recursive: true });
  const write = (name: string, patch: object) => fs.writeFileSync(path.join(runs, `${name.replace(/\//g, '_')}.json`), JSON.stringify({
    name, pid: 999999, logFile: '/dev/null', heartbeatAt: new Date().toISOString(), ...patch,
  }));
  write('ae/t15/1', { state: 'working' });
  write('ae/t16/1', { state: 'stopped', exitCode: -1 });
  const seen = await Effect.runPromise(ops.observe);
  assert.equal('exitCode' in seen.get('ae/t15/1')!, false, 'still running: no code');
  assert.equal('exitCode' in seen.get('ae/t16/1')!, false, 'killed by a signal: no code, not -1');
});

test('a detached spawn that throws says nothing started — the worker is never launched', async () => {
  const broken: HarnessSpec = { name: 'sh', command: () => { throw new Error('no command for this'); } };
  const e = await Effect.runPromise(detachedOps(broken, root()).spawn(req('ae/t17/1', root())).pipe(
    Effect.as(undefined),
    Effect.catchTag('RunnerError', (err) => Effect.succeed(err)),
  ));
  assert.equal(e?.refused, true);
});

test('a detached worker aimed at a directory that is not there is refused, and cannot take the engine down', async () => {
  // Before, `spawn` returned, the child emitted ENOENT a moment later, and nobody heard it: the
  // process that launched the worker — the engine, and this test runner — died.
  const e = await Effect.runPromise(detachedOps(sh('true'), root()).spawn(req('ae/t18/1', path.join(root(), 'gone'))).pipe(
    Effect.as(undefined),
    Effect.catchTag('RunnerError', (err) => Effect.succeed(err)),
  ));
  assert.equal(e?.refused, true);
  assert.match(e?.message ?? '', /is not a directory/);
  await new Promise((r) => setTimeout(r, 300));
});

test('a relative cwd is resolved where the worker is launched — the harness runs in repo, not repo/repo', async () => {
  // Measured before: the worker was launched in `repo`, then launched the harness in `repo` again,
  // from inside it, and the attempt failed with `spawn sh ENOENT`. `file()` refuses a relative cwd;
  // this is a caller of the runner itself, the way `claude --bg` has always resolved one.
  const was = process.cwd();
  const parent = root();
  fs.mkdirSync(path.join(parent, 'repo'));
  let given: string | undefined;
  const where: HarnessSpec = { name: 'sh', command: (r) => { given = r.cwd; return { cmd: 'sh', args: ['-c', 'pwd > where.txt'] }; } };
  const ops = detachedOps(where, root());
  process.chdir(parent);
  try { await Effect.runPromise(ops.spawn(req('ae/t19/1', 'repo'))); } finally { process.chdir(was); }

  await settle(ops, 'ae/t19/1', 'done');
  const repo = fs.realpathSync(path.join(parent, 'repo'));
  assert.equal(given && fs.realpathSync(given), repo, 'the spec is handed the resolved directory, so a `-C` names it too');
  assert.equal(fs.realpathSync(fs.readFileSync(path.join(repo, 'where.txt'), 'utf8').trim()), repo);
});

// ─── claude -p: the answer it prints ────────────────────────────────────────

/** A `result` object as `claude -p --output-format json` prints it, on one line (2.1.270; keys trimmed). */
const SESSION = '5e551011-0000-4000-8000-000000000001';
const resultLine = (o: object) => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, num_turns: 2, result: 'ok', session_id: SESSION, ...o });

test('claude-detached is asked for JSON, and for the schema as --json-schema when the task gives one', async () => {
  const { claudeDetached } = await import('../src/runner-detached.ts');
  const schema = { type: 'object', properties: { outcome: { type: 'string' } }, required: ['outcome'] };
  const args = claudeDetached.command({ name: 'ae/t/1', brief: 'the prompt', cwd: '/r', closeoutSchema: schema, resumeFrom: 'abc', worktree: true }).args;
  assert.deepEqual(args.slice(0, 2), ['-p', 'the prompt'], "the prompt is -p's own value");
  assert.equal(args[args.indexOf('--output-format') + 1], 'json');
  assert.deepEqual(JSON.parse(args[args.indexOf('--json-schema') + 1]!), schema);
  assert.equal(args[args.indexOf('--worktree') + 1], 'ae-t-1', 'and the worktree is still named');

  const plain = claudeDetached.command({ name: 'ae/t/1', brief: 'b', cwd: '/r' }).args;
  assert.equal(plain.includes('--json-schema'), false, 'no schema, no flag');
  assert.equal(plain[plain.indexOf('--output-format') + 1], 'json', 'JSON either way: the session id is in it');
});

test("claude -p's answer is its result object's structured_output, and nothing else in its output is one", () => {
  // Measured on 2.1.270: `-p --output-format json --json-schema` printed one line, a `result` whose
  // `structured_output` held the answer.
  assert.deepEqual(
    claudeResultOutput(['a warning on stderr', resultLine({ structured_output: { outcome: 'done' } }), ''].join('\n')),
    { closeout: { payload: { outcome: 'done' } } },
  );
  assert.deepEqual(claudeResultOutput(resultLine({})), {}, 'a result without it: no schema was given, or none was answered');
  assert.deepEqual(claudeResultOutput(resultLine({ structured_output: null })), {}, 'null is no answer');
  assert.deepEqual(claudeResultOutput(JSON.stringify({ type: 'assistant', result: 'x', structured_output: { outcome: 'done' } })), {}, 'only a result answers');
  assert.deepEqual(claudeResultOutput(resultLine({ structured_output: { outcome: 'done' } }).slice(0, -8)), {}, 'half a line is not one');
  assert.deepEqual(claudeResultOutput('The result: {"outcome":"done"}'), {}, 'prose is not one');
  assert.deepEqual(claudeResultOutput(''), {});
});

test("a spec that reads its harness's output reports the answer found there, stamped with when it was written — nothing in the workspace", async () => {
  const dir = root();
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-ws-'));
  const prints: HarnessSpec = {
    name: 'sh', readOutput: claudeResultOutput,
    command: () => ({ cmd: 'sh', args: ['-c', `echo noise >&2; printf '%s\\n' '${resultLine({ structured_output: { outcome: 'done' } })}'`] }),
  };
  const ops = detachedOps(prints, dir);
  const before = Date.now();
  await Effect.runPromise(ops.spawn({ name: 'ae/t20/1', brief: 'x', cwd: workspace, closeoutSchema: { type: 'object' } }));

  const seen = await settle(ops, 'ae/t20/1', 'done');
  assert.deepEqual(seen.closeout?.payload, { outcome: 'done' });
  // A filesystem's clock, which some keep to the second: that much slack either side of the run.
  assert.ok(seen.closeout!.at >= before - 1_000 && seen.closeout!.at <= Date.now() + 1_000, `stamped ${seen.closeout!.at}, spawned ${before}`);
  assert.deepEqual(fs.readdirSync(workspace), []);
});

test("a run is not called over before the harness's last output is in its log — the answer read from it would be lost", async () => {
  // `exit` can come before the pipes drain, and the first pass that sees `done` is the one the engine
  // records the end on. A child still printing when the harness exits makes that deterministic.
  const dir = root();
  const late: HarnessSpec = {
    name: 'sh', readOutput: claudeResultOutput,
    command: () => ({ cmd: 'sh', args: ['-c', `(sleep 0.4; printf '%s\\n' '${resultLine({ structured_output: { outcome: 'done' } })}') & exit 0`] }),
  };
  const ops = detachedOps(late, dir);
  await Effect.runPromise(ops.spawn({ name: 'ae/t21/1', brief: 'x', cwd: dir, closeoutSchema: {} }));

  const until = Date.now() + 15_000;
  let seen: Sighting | undefined;
  while (Date.now() < until) {
    seen = (await Effect.runPromise(ops.observe)).get('ae/t21/1');
    if (seen && seen.state !== 'working') break;
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.equal(seen?.state, 'done');
  assert.deepEqual(seen?.closeout?.payload, { outcome: 'done' }, 'the first sighting that says done already has the answer');
});

test('...and a child that holds a pipe open for good does not keep the run working', async () => {
  const dir = root();
  const ops = detachedOps(sh('(sleep 30) & exit 0'), dir);
  const started = Date.now();
  await Effect.runPromise(ops.spawn(req('ae/t22/1', dir)));
  await settle(ops, 'ae/t22/1', 'done', 10_000);
  assert.ok(Date.now() - started < 10_000, 'ended within the drain bound, not when the child let go');
});

test('a re-spawn of the same attempt does not find the last answer in the output either', async () => {
  const dir = root();
  const quiet: HarnessSpec = { name: 'sh', readOutput: claudeResultOutput, command: () => ({ cmd: 'sh', args: ['-c', 'sleep 2'] }) };
  const ops = detachedOps(quiet, dir);
  const leftover = path.join(dir, 'runs', 'sh', 'ae_t23_1.log');
  fs.mkdirSync(path.dirname(leftover), { recursive: true });
  fs.writeFileSync(leftover, `${resultLine({ structured_output: { outcome: 'done' } })}\n`);

  await Effect.runPromise(ops.spawn({ name: 'ae/t23/1', brief: 'x', cwd: dir, closeoutSchema: {} }));
  assert.equal((await Effect.runPromise(ops.observe)).get('ae/t23/1')?.closeout, undefined);
});

test('claude-detached at shipped defaults: a task that asked for a closeout gets the one it printed, and its session id', async () => {
  // A fake `claude` on PATH that answers the way `claude -p --output-format json` does — and, asked for
  // the `claude` harness's registry, as `claude agents` does when nothing of its own is running.
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-fake-claude-'));
  fs.writeFileSync(path.join(bin, 'claude'), [
    '#!/bin/sh',
    `if [ "$1" = agents ]; then echo '[]'; exit 0; fi`,
    `printf '%s\\n' "$@" > '${bin}/argv'`,
    'echo "a warning" >&2',
    `printf '%s\\n' '${resultLine({ structured_output: { outcome: 'done' } })}'`,
  ].join('\n'), { mode: 0o755 });
  const prev = process.env.PATH;
  process.env.PATH = `${bin}:${prev}`;
  try {
    const cwd = root();
    const engine = createEngine({ root: root() });
    const schema = { type: 'object', properties: { outcome: { type: 'string' } } };
    const id = await engine.file({ brief: 'the prompt', cwd, harness: 'claude-detached', closeoutSchema: schema });
    const until = Date.now() + 15_000;
    while (!(await engine.view(id)).state.settled && Date.now() < until) {
      await engine.tick();
      await new Promise((r) => setTimeout(r, 100));
    }
    const { state } = await engine.view(id);
    assert.equal(state.settled, 'succeeded');
    assert.deepEqual(state.attempts[0]?.closeout, { outcome: 'done' }, 'the answer it printed, on the record');
    assert.equal(state.attempts[0]?.nativeId, SESSION, 'and the session id, from the same JSON');
    const argv = fs.readFileSync(path.join(bin, 'argv'), 'utf8').split('\n');
    assert.deepEqual(JSON.parse(argv[argv.indexOf('--json-schema') + 1]!), schema);
    assert.equal(argv[argv.indexOf('--output-format') + 1], 'json');
    assert.deepEqual(fs.readdirSync(cwd), [], 'nothing in the workspace');
  } finally { process.env.PATH = prev; }
});

// ─── codex: what it consumed, from its stream ───────────────────────────────

test('codex at shipped defaults: what the attempt consumed is read from its exec --json stream and recorded on it', async () => {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-fake-codex-'));
  const stream = [
    { type: 'thread.started', thread_id: '01a09996-d343-7932-8971-b2f209ba315b' },
    { type: 'turn.started' },
    { type: 'item.started', item: { id: 'item_1', type: 'command_execution', command: 'ls', status: 'in_progress' } },
    { type: 'item.completed', item: { id: 'item_1', type: 'command_execution', exit_code: 0, status: 'completed' } },
    { type: 'turn.completed', usage: { input_tokens: 1200, cached_input_tokens: 1000, cache_write_input_tokens: 0, output_tokens: 80, reasoning_output_tokens: 8 } },
  ];
  fs.writeFileSync(path.join(bin, 'codex'), [
    '#!/bin/sh',
    'echo "Reading additional input from stdin..." >&2',
    ...stream.map((e) => `printf '%s\\n' '${JSON.stringify(e)}'`),
  ].join('\n'), { mode: 0o755 });
  // The `claude` harness is observed on every tick too, and must not read this machine's registry.
  fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\nif [ "$1" = agents ]; then echo '[]'; fi\n`, { mode: 0o755 });
  const prev = { PATH: process.env.PATH, CODEX_HOME: process.env.CODEX_HOME };
  process.env.PATH = `${bin}:${prev.PATH}`;
  process.env.CODEX_HOME = root();
  try {
    const engine = createEngine({ root: root() });
    const id = await engine.file({ brief: 'the prompt', cwd: root(), harness: 'codex' });
    const until = Date.now() + 15_000;
    while (!(await engine.view(id)).state.settled && Date.now() < until) {
      await engine.tick();
      await new Promise((r) => setTimeout(r, 100));
    }
    const { state } = await engine.view(id);
    assert.equal(state.settled, 'succeeded');
    assert.deepEqual(state.attempts[0]?.usage, { toolCalls: 1, inputTokens: 1200, outputTokens: 80 }, 'measured, and nothing it did not measure');
    assert.equal(state.attempts[0]?.exitCode, 0);
    assert.equal(state.attempts[0]?.nativeId, '01a09996-d343-7932-8971-b2f209ba315b');
  } finally {
    process.env.PATH = prev.PATH;
    if (prev.CODEX_HOME === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = prev.CODEX_HOME;
  }
});
