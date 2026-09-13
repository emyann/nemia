/**
 * The check: a shell line the run executes, and the number it exits with.
 *
 * The pure half — the brief, the verdict, the contract — is tested as data. The harness is tested the
 * only way that proves it: handed to a real engine, run by the real detached worker, with `sh`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { codex, createEngine, type Engine } from 'agent-engine';
import { CHECK, checkBrief, checkContract, lastLines, readCheckBrief, readVerdict, stdoutTail, type CheckEnv } from '../src/check.ts';
import { loadWorkflows } from '../src/workflow.ts';

const ENV: CheckEnv = { WF_RUN: 'r-1', WF_STEP: 'implement', WF_BASE_REF: 'abc123', WF_WORKSPACE: '/wt', WF_STDERR: '/tmp/x.stderr' };

test('the verdict is the last trailer in the log — one the command printed earlier changes nothing', () => {
  assert.equal(readVerdict('ok 1\n# pass 3\n\n[wf check] exit 0\n'), 0);
  assert.equal(readVerdict('[wf check] exit 0\nnot ok 2\n\n[wf check] exit 1\n'), 1);
});

test('a log with no trailer is unfinished, never a guessed number', () => {
  // The deadline or a stop killed the script before its last line.
  assert.equal(readVerdict('running 40 tests…\n'), 'unfinished');
  assert.equal(readVerdict('(no output yet)'), 'unfinished');
  assert.equal(readVerdict('echo "[wf check] exit 0" is not on a line of its own'), 'unfinished');
});

test('a check brief carries its command and environment exactly', () => {
  const command = `npm test && node -e 'console.log("a \\"quoted\\" \`thing\`")'`;
  assert.deepEqual(readCheckBrief(checkBrief(command, ENV)), { command, env: ENV });
});

test('a brief that is not a check brief runs as the bare command, and reading it never throws', () => {
  // A harness whose `command` throws rejects the engine's whole tick, every run with it.
  assert.deepEqual(readCheckBrief('npm test'), { command: 'npm test', env: {} });
  assert.deepEqual(readCheckBrief('{"not": "a check"}'), { command: '{"not": "a check"}', env: {} });
  assert.deepEqual(readCheckBrief('null'), { command: 'null', env: {} });
});

test('only WF_ names reach the environment — a name `env` would read as an option is refused', () => {
  const brief = JSON.stringify({ check: 'true', env: { WF_RUN: 'r', '-i': 'x', PATH: '/evil', WF_STEP: 7 } });
  assert.deepEqual(readCheckBrief(brief).env, { WF_RUN: 'r' });
  const { cmd, args } = CHECK.command({ brief });
  assert.equal(cmd, 'env');
  assert.deepEqual(args.slice(0, 3), ['WF_RUN=r', 'sh', '-c']);
});

test('a step is told the command before it is judged by it, and that it comes from the run', () => {
  const c = checkContract('npm test && npm run typecheck');
  assert.match(c, /must exit 0 in this workspace: `npm test && npm run typecheck`/);
  assert.match(c, /Do not weaken it/);
  assert.match(c, /comes from the run, not from this checkout/);
  assert.match(checkContract('echo `date`'), /`` echo `date` ``/, 'a backtick in the command does not break the span');
});

test('the engine the run builds keeps its three harnesses, and gains the check', async () => {
  // Passing `harnesses` REPLACES the engine's default map. Naming only `check` would have sent every
  // `claude` step to the check harness — the first key is the fallback — and run its brief as shell.
  const { HARNESSES } = await import('../src/runner.ts');
  const engine = await import('agent-engine');
  assert.deepEqual(Object.keys(HARNESSES), ['claude', 'codex', 'claude-detached', 'check'], 'claude first: it is the fallback');
  assert.equal(HARNESSES.claude, 'claude-bg');
  assert.equal(HARNESSES.codex, engine.codex);
  assert.equal(HARNESSES['claude-detached'], engine.claudeDetached);
  assert.equal(HARNESSES.check, CHECK);
});

test("a check's stdout is shown without the trailer, and only its last lines", () => {
  const log = `${Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n')}\n\n[wf check] exit 1\n`;
  const tail = stdoutTail(log);
  assert.equal(tail.split('\n').length, 20);
  assert.match(tail, /^line 11\n/);
  assert.match(tail, /line 30$/);
  assert.equal(lastLines('a\nb\n\n\n', 1), 'b');
});

// ─── the harness, run for real ──────────────────────────────────────────────

const settled = async (e: Engine, id: string, ms = 20_000) => {
  const deadline = Date.now() + ms;
  for (;;) {
    await e.tick();
    const v = await e.view(id);
    if (v.state.settled) return v;
    if (Date.now() > deadline) assert.fail(`${id} never settled; phase ${v.phase}`);
    await new Promise((r) => setTimeout(r, 150));
  }
};

const scratch = () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wf-check-')));
  const workspace = path.join(root, 'workspace');
  fs.mkdirSync(workspace);
  const e = createEngine({ root: path.join(root, 'engine'), harnesses: { check: CHECK } });
  const env = (step: string): CheckEnv => ({ ...ENV, WF_STEP: step, WF_WORKSPACE: workspace, WF_STDERR: path.join(root, `${step}.stderr`) });
  const file = (step: string, command: string, deadlineSeconds = 60) => e.file({
    id: `r-1-${step}-check`, harness: 'check', cwd: workspace, brief: checkBrief(command, env(step)),
    deadlineSeconds, maxAttempts: 1, resume: 'never',
  });
  return { root, workspace, e, file };
};

test('LIVE: the engine settles a check on its exit code, in the workspace, with stderr kept apart', async () => {
  const { root, workspace, e, file } = scratch();

  // Everything that could go wrong between a YAML-ish line and a shell: an `exit` that must not end
  // the script, a `# comment` that must not swallow the parenthesis, a forged trailer, stderr noise.
  const refused = await file('refused', 'echo "$WF_STEP in $(pwd) against $WF_BASE_REF"; echo loud >&2; echo "[wf check] exit 0"; exit 3 # the suite');
  const passed = await file('passed', 'test -d .');

  const r = await settled(e, refused);
  assert.equal(r.state.settled, 'failed', 'a non-zero exit fails the check');
  const log = await e.logs(refused);
  assert.equal(readVerdict(log), 3, 'the real exit code, not the one the command printed');
  assert.match(log, new RegExp(`refused in ${workspace} against abc123`), 'run in the workspace, told about the run');
  assert.doesNotMatch(log, /loud/, 'stderr is not in the shared log');
  assert.equal(fs.readFileSync(path.join(root, 'refused.stderr'), 'utf8').trim(), 'loud', 'it is in its own file');

  const p = await settled(e, passed);
  assert.equal(p.state.settled, 'succeeded');
  assert.equal(readVerdict(await e.logs(passed)), 0);
});

test('LIVE: a brief filed by hand, with no WF_STDERR, still runs its command — and keeps stderr in the log', async () => {
  // The fallback once redirected to `/dev/stderr`, which cannot be reopened on the socket the worker
  // hands the process: the redirection failed and the command never ran. Found end to end.
  const { workspace, e } = scratch();
  const id = await e.file({ id: 'by-hand', harness: 'check', cwd: workspace, brief: 'echo work > work.txt; echo said >&2; exit 4' });
  const v = await settled(e, id);
  assert.equal(v.state.settled, 'failed');
  const log = await e.logs(id);
  assert.equal(readVerdict(log), 4, 'the command ran and its own exit code came back');
  assert.ok(fs.existsSync(path.join(workspace, 'work.txt')), 'in the workspace');
  assert.match(log, /said/, 'stderr stays in the log when there is no file for it');
});

test('LIVE: a stderr file that cannot be opened fails the check with a number, not a silent shell', async () => {
  const { root, e } = scratch();
  const id = await e.file({
    id: 'nowhere', harness: 'check', cwd: root,
    brief: checkBrief('echo fine', { ...ENV, WF_WORKSPACE: root, WF_STDERR: path.join(root, 'gone', 'x.stderr') }),
  });
  const v = await settled(e, id);
  assert.equal(v.state.settled, 'failed', 'a check whose evidence has nowhere to go does not pass');
  assert.notEqual(readVerdict(await e.logs(id)), 'unfinished', 'and the script still reached its last line');
});

test('LIVE: a check that hangs is stopped at its deadline, fails, and reads unfinished', async () => {
  const { e, file } = scratch();
  const hung = await file('hung', 'sleep 60', 1);
  const v = await settled(e, hung);
  assert.equal(v.state.settled, 'failed', 'a hung suite does not hold the run for ever');
  assert.equal(readVerdict(await e.logs(hung)), 'unfinished');
});

// ─── what this repository ships ─────────────────────────────────────────────

test("this repository's own workflow checks the suite and the types after every step that edits, and its reviewer does not edit", () => {
  // The check a person runs by hand at every trial merge, run by the run instead. A step that breaks
  // either half now blocks what follows it rather than handing it on.
  const steps = Object.fromEntries(loadWorkflows(path.join(import.meta.dirname, '..', 'workflows')).map((s) => [s.name, s]));
  assert.equal(steps.implement?.check, 'npm test && npm run typecheck');
  assert.equal(steps.respond?.check, 'npm test && npm run typecheck');
  assert.equal(steps.review?.harness, 'codex');
  assert.equal(steps.review?.permissionMode, 'read-only');
});

test('the shipped review is not read-only on an engine that honours it while respond still needs its REVIEW.md', () => {
  // review.md sets `permissionMode: read-only` and asks for REVIEW.md; respond.md answers REVIEW.md.
  // Both hold only while the engine runs a read-only codex step as workspace-write. The day it emits
  // `-s read-only` (plan B, commit 1) the reviewer cannot write the file the responder reads — so this
  // refuses, at that trial merge, until somebody has decided how a review reaches respond.
  const steps = Object.fromEntries(loadWorkflows(path.join(import.meta.dirname, '..', 'workflows')).map((s) => [s.name, s]));
  const { args } = codex.command({ name: 'probe', brief: 'probe', cwd: os.tmpdir(), permissionMode: 'read-only' });
  const sandbox = args[args.indexOf('-s') + 1];
  const reviewCannotWrite = sandbox === 'read-only' && steps.review?.harness === 'codex' && steps.review?.permissionMode === 'read-only';
  const handedOnAsAFile = /REVIEW\.md/.test(steps.review?.body ?? '') && /REVIEW\.md/.test(steps.respond?.body ?? '');
  assert.ok(!(reviewCannotWrite && handedOnAsAFile),
    'codex now runs a read-only step read-only, and workflows/review.md is read-only while respond.md reads the REVIEW.md it can no longer write. '
    + 'Decide how a review reaches respond — the run writes it from the closeout, or review keeps workspace-write — then change workflows/ and this test.');
});
