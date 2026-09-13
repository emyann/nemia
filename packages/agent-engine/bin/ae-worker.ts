#!/usr/bin/env node
/**
 * The detached worker: one harness process, babysat, reported.
 *
 * This is what `claude --bg` does for Claude Code, done by us for a harness that has no such
 * thing. It is deliberately dependency-free and dull — it starts before the engine can help it
 * and outlives the engine that started it, so anything clever in here is a thing that breaks
 * while nobody is watching.
 *
 * Its whole contract is the run file: `{ state, pid, heartbeatAt, nativeId }`, rewritten as the
 * session moves and on a timer. The heartbeat is what makes "the worker was killed" observable —
 * a stopped session and a stalled one are indistinguishable on disk without it. That is the cost
 * of owning a registry, and owning a registry is the cost of being harness-agnostic.
 *
 * argv: <runFile>  — JSON: { cmd, args, cwd, logFile, nativeIdPattern? }
 */
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const runFile = process.argv[2]!;
const plan = JSON.parse(fs.readFileSync(runFile, 'utf8')) as {
  cmd: string; args: string[]; cwd: string; logFile: string; nativeIdPattern?: string;
};

let status = {
  ...plan, state: 'working' as string, pid: process.pid,
  startedAt: new Date().toISOString(), heartbeatAt: new Date().toISOString(),
  nativeId: undefined as string | undefined, exitCode: undefined as number | undefined,
};
const write = (patch: Partial<typeof status> = {}) => {
  status = { ...status, ...patch, heartbeatAt: new Date().toISOString() };
  // Written via a temp file and renamed, so a reader never sees half a JSON object.
  fs.writeFileSync(`${runFile}.tmp`, JSON.stringify(status));
  fs.renameSync(`${runFile}.tmp`, runFile);
};
write();

// `detached` here is not about outliving anything — it gives the harness its own PROCESS GROUP,
// so a stop can take its children with it. A harness that shells out (codex does) leaves orphans
// otherwise, and an orphaned build still holds the worktree the next attempt wants.
const child = spawn(plan.cmd, plan.args, { cwd: plan.cwd, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
const log = fs.createWriteStream(plan.logFile, { flags: 'a' });

// The harness's own id, if it prints one. Only needed to RESUME later; the name is still the key.
const nativeId = plan.nativeIdPattern ? new RegExp(plan.nativeIdPattern) : null;
const scan = (chunk: Buffer) => {
  log.write(chunk);
  if (nativeId && !status.nativeId) {
    const m = nativeId.exec(chunk.toString());
    if (m?.[1]) write({ nativeId: m[1] });
  }
};
child.stdout.on('data', scan);
child.stderr.on('data', scan);

const beat = setInterval(() => write(), 5_000);
beat.unref?.();

let stopping = false;
const killGroup = () => {
  try { process.kill(-child.pid!, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
};
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => { stopping = true; killGroup(); });
}

child.on('exit', (code) => {
  clearInterval(beat);
  write({ state: stopping ? 'stopped' : code === 0 ? 'done' : 'failed', exitCode: code ?? -1 });
  log.end();
  setTimeout(() => process.exit(0), 50);
});

child.on('error', (e) => {
  clearInterval(beat);
  write({ state: 'failed', exitCode: -1 });
  log.write(`\n[worker] spawn failed: ${String(e)}\n`);
  log.end();
  setTimeout(() => process.exit(1), 50);
});
