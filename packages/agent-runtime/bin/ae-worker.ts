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
// Heard before the pid is published: a stop is sent to the pid on disk, and a worker that met SIGTERM before
// it had a handler would die of it, leaving its harness running under a run file that says `working` until the
// lease calls it dead. Node runs a signal handler on the event loop, never inside this synchronous start, so
// `child` below is set by the time one runs.
let stopping = false;
const killGroup = () => {
  try { process.kill(-child.pid!, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
};
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => { stopping = true; killGroup(); });
}
write();

// `detached` here is not about outliving anything — it gives the harness its own PROCESS GROUP,
// so a stop can take its children with it. A harness that shells out (codex does) leaves orphans
// otherwise, and an orphaned build still holds the worktree the next attempt wants.
const child = spawn(plan.cmd, plan.args, { cwd: plan.cwd, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
const log = fs.createWriteStream(plan.logFile, { flags: 'a' });
// Heard: output that arrives after the log is closed (a child still holding a pipe) must not crash
// the one process that says how the run ended.
log.on('error', () => {});

// The harness's own id, if it prints one. Only needed to RESUME later; the name is still the key.
const nativeId = plan.nativeIdPattern ? new RegExp(plan.nativeIdPattern) : null;
const scan = (chunk: Buffer) => {
  if (!log.writableEnded) log.write(chunk);
  if (nativeId && !status.nativeId) {
    const m = nativeId.exec(chunk.toString());
    if (m?.[1]) write({ nativeId: m[1] });
  }
};
child.stdout.on('data', scan);
child.stderr.on('data', scan);

const beat = setInterval(() => write(), 5_000);
beat.unref?.();

/**
 * How long, after the harness exits, its output may still be arriving. `exit` can come before its
 * pipes have drained, and a spec reads the final answer from that output — so the end is written
 * only once both pipes have closed and the log is on disk. Bounded, because a child the harness left
 * behind can hold a pipe open for as long as it likes.
 */
const DRAIN_MS = 2_000;
const closed = (s: NodeJS.ReadableStream & { closed?: boolean }) =>
  new Promise<void>((resolve) => { if (s.closed) resolve(); else s.once('close', () => resolve()); });

child.on('exit', (code) => {
  clearInterval(beat);
  const drained = Promise.all([closed(child.stdout), closed(child.stderr)]);
  const bound = new Promise<void>((resolve) => setTimeout(resolve, DRAIN_MS).unref());
  void Promise.race([drained, bound]).then(() => log.end(() => {
    write({ state: stopping ? 'stopped' : code === 0 ? 'done' : 'failed', exitCode: code ?? -1 });
    setTimeout(() => process.exit(0), 50);
  }));
});

child.on('error', (e) => {
  clearInterval(beat);
  write({ state: 'failed', exitCode: -1 });
  log.write(`\n[worker] spawn failed: ${String(e)}\n`);
  log.end();
  setTimeout(() => process.exit(1), 50);
});
