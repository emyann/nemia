/**
 * What Claude Code is spawned with for a shipped step, pinned whole: the client's `engine()` and `tick()` over runs started from the
 * shipped folders, and a fake `claude` first on PATH that writes down each argv it is started with. The argv is compared with
 * `fixtures/argv-shipped.json`, the run's id and every path of the test's made generic, so a harness argument moved from one place to
 * another — `remoteControl` into `config.claude` (2026-09-25) — is shown to hand Claude Code the same words, in the same order.
 *
 * Two steps: the supervisor, the one background session shipped (`--bg`, bridged, a window of its own), and dev's implement, a job.
 * To record the fixture again, run this file with `ARGV_RECORD=1` and read the diff line by line: only what you meant to move may move.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-argv-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
process.env.CLAUDE_CONFIG_DIR = scratch('wf-argv-config-');
const { engine, readRun, start, tick } = await import('../src/runner.ts');
const { freshRestMemo } = await import('../src/tick.ts');

const SHIPPED = fileURLToPath(new URL('../../../workflows/', import.meta.url));
const FIXTURE = fileURLToPath(new URL('./fixtures/argv-shipped.json', import.meta.url));

const git = (repo: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

const REPO = scratch('wf-argv-repo-');
git(REPO, 'init', '-q', '-b', 'main');
git(REPO, 'commit', '-q', '--allow-empty', '-m', 'base');

const bin = scratch('wf-argv-bin-');
const registry = path.join(bin, 'registry.json');
const spawned = path.join(bin, 'spawned.jsonl');
const ended = path.join(bin, 'ended');
fs.writeFileSync(registry, '[]');
fs.writeFileSync(spawned, '');
// Every start of a session is written down; `agents`, `stop` and `rm` are the registry's, and a job waits for the test to end it.
fs.writeFileSync(
  path.join(bin, 'claude'),
  `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const rows = () => JSON.parse(fs.readFileSync(${JSON.stringify(registry)}, 'utf8'));
const write = (r) => fs.writeFileSync(${JSON.stringify(registry)}, JSON.stringify(r));
if (args[0] === 'agents') {
  process.stdout.write(fs.readFileSync(${JSON.stringify(registry)}, 'utf8'));
} else if (args[0] === 'stop') {
  write(rows().map((r) => (r.sessionId.startsWith(args[1]) ? { ...r, state: 'stopped', status: 'idle' } : r)));
} else if (args[0] === 'rm') {
  write(rows().filter((r) => !r.sessionId.startsWith(args[1])));
} else {
  fs.appendFileSync(${JSON.stringify(spawned)}, JSON.stringify(args) + '\\n');
  if (args[0] === '--bg') {
    const name = args[args.indexOf('--name') + 1];
    const sessionId = '5e551011-0000-4000-8000-' + String(rows().length + 1).padStart(12, '0');
    write([...rows(), { name, sessionId, state: 'working', status: 'busy', kind: 'background', startedAt: Date.now() }]);
  } else {
    process.stdin.once('data', () => process.stdin.pause());
    const wait = () => (fs.existsSync(${JSON.stringify(ended)}) ? process.exit(0) : setTimeout(wait, 50));
    wait();
  }
}
`,
  { mode: 0o755 },
);
process.env.PATH = `${bin}:${process.env.PATH}`;

const e = engine();
const memo = freshRestMemo();

/** Each argv spawned so far. */
const argvs = (): string[][] =>
  fs
    .readFileSync(spawned, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as string[]);

/** Passes until a session was spawned for the run's step: a background session by its `--name`, a job by its rendered prompt's path. */
const spawnedFor = async (runId: string, step: string): Promise<string[]> => {
  const deadline = Date.now() + 20_000;
  for (;;) {
    await tick(e, { repo: ROOT, memo });
    const taskId = readRun(runId).steps[step]?.taskId;
    const argv =
      taskId && argvs().find((a) => a.some((x) => x.startsWith(`ae/${taskId}/`) || x.includes(`/runs/${runId}/agents/${step}/`)));
    if (argv) return argv;
    if (Date.now() > deadline) assert.fail(`${runId}'s ${step} was never spawned: ${JSON.stringify(argvs())}`);
    await new Promise((r) => setTimeout(r, 50));
  }
};

/** An argv with the test's own places and the run's id made generic, so it reads the same on every machine and every run. */
const generic = (argv: string[], runId: string) => {
  const places: Array<[string, string]> = [
    [ROOT, '<store>'],
    [REPO, '<repo>'],
    [process.env.CLAUDE_CONFIG_DIR!, '<claude-config>'],
    [SHIPPED.replace(/\/$/, ''), '<shipped>'],
    [runId, '<run>'],
  ];
  return argv.map((a) => places.reduce((s, [from, to]) => s.split(from).join(to), a));
};

test("the shipped supervisor and dev's implement are spawned with the argv pinned in fixtures/argv-shipped.json", async (t) => {
  t.after(() => fs.writeFileSync(ended, ''));
  const supervisor = start({ brief: 'supervise this repository', repo: REPO, workflowDir: path.join(SHIPPED, 'supervisor') });
  const dev = start({ brief: 'add a line to the readme', repo: REPO, workflowDir: path.join(SHIPPED, 'dev') });
  const got = {
    supervise: generic(await spawnedFor(supervisor.id, 'supervise'), supervisor.id),
    implement: generic(await spawnedFor(dev.id, 'implement'), dev.id),
  };
  // What the move must keep: the bridge directly before the mode, and the supervisor's window.
  const s = got.supervise;
  assert.equal(s[0], '--bg');
  assert.equal(s[s.indexOf('--remote-control') + 1], '--permission-mode', 'the bridge directly before the mode');
  assert.equal(s[s.indexOf('--autocompact') + 1], '200000');
  assert.equal(got.implement.includes('--remote-control'), false, 'a job is never bridged');
  if (process.env.ARGV_RECORD === '1') fs.writeFileSync(FIXTURE, `${JSON.stringify(got, null, 2)}\n`);
  assert.deepEqual(got, JSON.parse(fs.readFileSync(FIXTURE, 'utf8')));
});
