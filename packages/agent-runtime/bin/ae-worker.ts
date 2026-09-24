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
 * A harness that reads its messages on its stdin (`HarnessSpec.input`) is given them here: the brief's line first, then
 * each line of the run's inbox as it is appended — the person's file, which this only reads — until a line of the
 * harness's output closes its input, when stdin is ended. How far into the inbox has been written on is on the run file
 * (`inputAt`), written before each line is, so a worker started again on the run file writes no word twice: at most once,
 * never twice. What it cannot give a harness it starts again is the words the one before heard (open issue 29).
 *
 * A stop sent before its pid is on disk has no process to signal, so the driver leaves it as a file (`stopFile`) and reads
 * the pid again; this reads the file once the pid is published, before it starts the harness, and starts nothing if it is
 * there. One of the two always sees the other, so a stop is heard whenever it lands (open issue 30).
 *
 * argv: <runFile>  — JSON: { cmd, args, cwd, logFile, stopFile?, nativeIdPattern?, input?, inputAt? }
 */
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const runFile = process.argv[2]!;
const plan = JSON.parse(fs.readFileSync(runFile, 'utf8')) as {
  cmd: string; args: string[]; cwd: string; logFile: string; stopFile?: string; nativeIdPattern?: string; pid?: number;
  input?: { first: string; inbox: string; from: number; closesOn: { key: string; value: string } };
  inputAt?: number;
};

let status = {
  ...plan, state: 'working' as string, pid: process.pid,
  startedAt: new Date().toISOString(), heartbeatAt: new Date().toISOString(),
  nativeId: undefined as string | undefined, exitCode: undefined as number | undefined,
  // A harness started here has closed nothing yet, whatever the one before it did.
  inputClosed: undefined as true | undefined,
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
// Read after the pid is published, never before: a stop that finds no pid left this file first, and one that wrote it
// after this read finds the pid. Asked already, the harness is never started, and no process runs to be stopped. Only by
// the worker `spawn` launched, whose run file had no pid: one started again on a run file its worker left is not the
// run a stop asked before was asked of.
if (!plan.pid && plan.stopFile && fs.existsSync(plan.stopFile)) {
  write({ state: 'stopped', exitCode: -1 });
  process.exit(0);
}

// `detached` here is not about outliving anything — it gives the harness its own PROCESS GROUP,
// so a stop can take its children with it. A harness that shells out (codex does) leaves orphans
// otherwise, and an orphaned build still holds the worktree the next attempt wants.
const input = plan.input;
const child = spawn(plan.cmd, plan.args, { cwd: plan.cwd, stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'], detached: true });
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
child.stdout!.on('data', scan);
child.stderr!.on('data', scan);

const beat = setInterval(() => write(), 5_000);
beat.unref?.();

/** How often the inbox is looked at for words: the most a word waits before it is written on. */
const INBOX_MS = 500;
let inbox: NodeJS.Timeout | undefined;
if (input) {
  const stdin = child.stdin!;
  // Heard: a harness that has exited, or closed its stdin, makes a write fail (EPIPE), and that must not take down the
  // one process that says how the run ended.
  stdin.on('error', () => {});
  stdin.write(`${input.first}\n`);
  let at = plan.inputAt ?? input.from;
  /** Every whole line appended past `at`, each written on after `inputAt` says it has been. A line still being appended waits. */
  const take = () => {
    let fd: number;
    try { fd = fs.openSync(input.inbox, 'r'); } catch { return; } // nothing said yet
    try {
      const base = at;
      const size = fs.fstatSync(fd).size;
      if (size <= base) return;
      const buf = Buffer.alloc(size - base);
      const n = fs.readSync(fd, buf, 0, buf.length, base);
      // By bytes: a newline byte is never part of another character in UTF-8.
      let start = 0;
      for (let nl = buf.indexOf(0x0a); nl !== -1 && nl < n; nl = buf.indexOf(0x0a, start)) {
        if (stdin.writableEnded) return;
        const line = buf.subarray(start, nl).toString('utf8');
        start = nl + 1;
        at = base + start;
        write({ inputAt: at });
        if (line.trim()) stdin.write(`${line}\n`);
      }
    } finally {
      fs.closeSync(fd);
    }
  };
  inbox = setInterval(take, INBOX_MS);
  inbox.unref?.();

  // The harness's output, a line at a time, for the one that closes its input.
  const { key, value } = input.closesOn;
  let pending = '';
  const closes = (line: string) => {
    try { const o = JSON.parse(line) as Record<string, unknown> | null; return typeof o === 'object' && o !== null && o[key] === value; } catch { return false; }
  };
  child.stdout!.on('data', (chunk: Buffer) => {
    if (stdin.writableEnded) return;
    pending += chunk.toString('utf8');
    const lines = pending.split('\n');
    pending = lines.pop()!;
    if (!lines.some(closes)) return;
    clearInterval(inbox);
    // On the run file first: a word said from now on is refused, not appended for nobody.
    write({ inputClosed: true });
    stdin.end();
  });
}

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
  clearInterval(inbox);
  const drained = Promise.all([closed(child.stdout!), closed(child.stderr!)]);
  const bound = new Promise<void>((resolve) => setTimeout(resolve, DRAIN_MS).unref());
  void Promise.race([drained, bound]).then(() => log.end(() => {
    write({ state: stopping ? 'stopped' : code === 0 ? 'done' : 'failed', exitCode: code ?? -1 });
    setTimeout(() => process.exit(0), 50);
  }));
});

child.on('error', (e) => {
  clearInterval(beat);
  clearInterval(inbox);
  write({ state: 'failed', exitCode: -1 });
  log.write(`\n[worker] spawn failed: ${String(e)}\n`);
  log.end();
  setTimeout(() => process.exit(1), 50);
});
