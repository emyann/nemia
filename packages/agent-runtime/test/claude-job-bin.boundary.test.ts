/**
 * `bin/ae-claude-job.ts` as the worker runs it: a process of its own, given a spawn request's path on its argv, its session's
 * input on its stdin and the Agent SDK's messages on its stdout. The real bin, the real `query()`, and a stand-in Claude Code the
 * SDK spawns through `AE_CLAUDE_EXECUTABLE`, which records the argv it was given and does what the test needs.
 *
 * What it holds, each a rule the bin states and nothing else proves:
 *
 * - a job's session is denied by Claude Code itself (`permissionPrompts: 'none'`, `sdk.d.ts:2054`) — the argv the SDK gives it
 *   carries `--permission-prompts=none` (the joined form from SDK 0.3.295; read through `sdkArgValue`, which takes either and
 *   refuses an absent flag), so no decision of this process is asked for, which is the point: a decision held here would die with
 *   this process, unanswered;
 * - a session that ends with no result line leaves 1 and says so, rather than being read as a session that said nothing;
 * - a request `attachedOptions` refuses never starts Claude Code: the bin leaves 1 with the refusal's own words, which the worker
 *   records as an attempt that could not start;
 * - a SIGTERM aborts the session: the bin ends, and the Claude Code it started is gone with it.
 *
 * A boundary test: real processes, the bin's and the Claude Code the SDK spawns for it, and nothing of either stood in for.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scratch } from './scratch.ts';
import { sdkArgValue } from './sdk-argv.ts';
import { until, WAITED } from '../src/waits/index.ts';

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'ae-claude-job.ts');

/**
 * A stand-in Claude Code in `dir` that writes the argv it was started with to `argv.json` and then runs `after`, a line of
 * JavaScript. The Agent SDK spawns it with node, so its shebang is this node, and its argv is read the same either way.
 */
const standIn = (dir: string, after: string): string => {
  const at = path.join(dir, 'claude.js');
  fs.writeFileSync(
    at,
    [
      `#!${process.execPath}`,
      `const fs = require('node:fs');`,
      `fs.writeFileSync(${JSON.stringify(path.join(dir, 'argv.json'))}, JSON.stringify(process.argv.slice(2)));`,
      after,
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  return at;
};

/** The spawn request `request` written where the bin reads one, as the runner writes it. */
const requestFile = (dir: string, request: object): string => {
  const at = path.join(dir, 'spawn.request.json');
  fs.writeFileSync(at, JSON.stringify({ request, io: {} }));
  return at;
};

/** The bin run on the request at `at`, its stdin closed at once; answers its exit code and what it printed. */
const ranBin = (at: string, env: Record<string, string>, onPid?: (pid: number) => void) =>
  new Promise<{ code: number | null; signal: NodeJS.Signals | null; err: string }>((done) => {
    const child = spawn(process.execPath, [BIN, at], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d: Buffer) => (err += d.toString()));
    child.stdout.resume();
    child.stdin.end();
    onPid?.(child.pid!);
    child.on('close', (code, signal) => done({ code, signal, err }));
  });

/** Whether the process `pid` is still there, as a signal of 0 answers. */
const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test('the job bin, run as the worker runs it: denied by Claude Code, refused before it starts, ended by a SIGTERM', WAITED, async (t) => {
  await t.test("a job's session is denied by Claude Code, and a session with no result leaves 1 saying so", async () => {
    const dir = scratch('ae-job-bin-');
    const claude = standIn(dir, 'process.exit(0);');
    const at = requestFile(dir, { name: 'ae/t/1', brief: 'say it', cwd: dir, config: { tools: ['Read'] } });

    const { code, err } = await ranBin(at, { AE_CLAUDE_EXECUTABLE: claude });

    const argv = JSON.parse(fs.readFileSync(path.join(dir, 'argv.json'), 'utf8')) as string[];
    assert.equal(
      sdkArgValue(argv, '--permission-prompts'),
      'none',
      `Claude Code answers its own prompts, so nothing is asked of a process that would die with its answer: ${argv.join(' ')}`,
    );
    assert.equal(code, 1, `a session that gave no result is no session that said nothing: ${err}`);
    assert.match(err, /no result line/, err);
  });

  await t.test('a request the options refuse starts no Claude Code, and the bin leaves 1 in the refusal’s words', async () => {
    const dir = scratch('ae-job-bin-');
    const claude = standIn(dir, 'process.exit(0);');
    const at = requestFile(dir, {
      name: 'ae/t/2',
      brief: 'b',
      cwd: dir,
      config: { claude: { appendSystemPromptFile: 'a.md', systemPromptFile: 'b.md' } },
    });

    const { code, err } = await ranBin(at, { AE_CLAUDE_EXECUTABLE: claude });

    assert.equal(code, 1, err);
    assert.match(err, /appendSystemPromptFile/, 'the refusal names the first flag');
    assert.match(err, /systemPromptFile/, 'and the second');
    assert.equal(fs.existsSync(path.join(dir, 'argv.json')), false, 'and no Claude Code was started');
  });

  await t.test('a SIGTERM ends the session: the bin leaves, and the Claude Code it started is gone with it', async (t) => {
    const dir = scratch('ae-job-bin-');
    const pidFile = path.join(dir, 'claude.pid');
    const claude = standIn(dir, `fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));\nsetInterval(() => {}, 1000);`);
    const at = requestFile(dir, { name: 'ae/t/3', brief: 'b', cwd: dir, config: {} });

    let bin = 0;
    const ending = ranBin(at, { AE_CLAUDE_EXECUTABLE: claude }, (pid) => (bin = pid));
    await until(t, () => fs.existsSync(pidFile), 'the session’s Claude Code started', { everyMs: 50 });
    const child = Number(fs.readFileSync(pidFile, 'utf8'));
    assert.ok(alive(child), 'it is running');

    process.kill(bin, 'SIGTERM');
    const { code, signal } = await ending;
    assert.ok(code !== 0, `the stop is no success: ${code} ${signal}`);
    await until(t, () => !alive(child), 'the Claude Code it started is gone with it', { everyMs: 50 });
  });
});
