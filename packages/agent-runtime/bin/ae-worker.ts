#!/usr/bin/env node
/**
 * The detached worker: one harness process, babysat, reported.
 *
 * This is what `claude --bg` does for Claude Code, done by us for a harness that has no such
 * thing. It is deliberately dependency-free and dull — it starts before the engine can help it
 * and outlives the engine that started it, so anything clever in here is a thing that breaks
 * while nobody is watching.
 *
 * Its whole contract is the run file: `{ state, pid, heartbeatAt, beat, nativeId }`, rewritten as the
 * session moves and on a timer. The heartbeat is what makes "the worker was killed" observable —
 * a stopped session and a stalled one are indistinguishable on disk without it. That is the cost
 * of owning a registry, and owning a registry is the cost of being harness-agnostic.
 *
 * A harness that reads its messages on its stdin (`HarnessSpec.input`) is given them here: the brief's line first, then
 * each line of the run's inbox as it is appended — the person's file, which this only reads — until a line of the
 * harness's output closes its input, when stdin is ended. How far into the inbox has been written on is on the run file
 * (`inputAt`), written before each line is, so a worker started again on the run file writes no word twice: at most once,
 * never twice. What it cannot give a harness it starts again is the words the one before heard.
 *
 * A stop sent before its pid is on disk has no process to signal, so the driver leaves it as a file (`stopFile`) and reads
 * the pid again. The worker's half, in this order, so that one of the two always sees the other and a stop is heard
 * whenever it lands:
 *
 * 1. It hears SIGTERM and SIGINT before it publishes its pid: a stop is sent to the pid on disk, and a worker that met
 *    SIGTERM before it had a handler would die of it, leaving its harness running under a run file that says `working`
 *    until the lease calls it dead. Node runs a signal handler on the event loop, never inside this synchronous start, so
 *    `child` is set by the time one runs.
 * 2. It publishes its pid, in its first write of the run file.
 * 3. It reads the stop file after the pid is published, never before: a stop that finds no pid leaves the file first, and
 *    one that leaves it after this read finds the pid. Asked already, it starts nothing, writes `stopped` and exits. Only a
 *    worker `spawn` launched reads it, whose run file has no pid: one started again on a run file its worker left is not
 *    the run a stop asked before was asked of.
 * 4. It starts the harness.
 *
 * A stop heard once the harness runs ends its process group, and kills what is left of it `STOP_GRACE_MS` later: the worker
 * exits only once the group is empty, since a child that ignored SIGTERM, left behind by a harness that did not, has
 * nothing to find it by after. A harness a stop ended is written with no exit code, -1, whatever it exited with: how a process
 * ends on SIGTERM is no answer of its own.
 *
 * The run file is the session. Removed — the file alone, or the store it is in — the session has been taken away, and
 * nobody is left who could stop its harness: `stop` finds a worker by its run file. So the worker takes a run file gone
 * from under it for a stop, writes nothing again, so the file is never made anew, and exits. It notices at its next write:
 * the heartbeat, within five seconds, or sooner at a word or an id. Its parent going is not a stop: outliving the engine
 * is what it is for.
 *
 * The harness's environment is the worker's, with the plan's `env` over it. Its stdout and stderr both go to the log, in the order
 * they arrive; with `streams`, each also goes whole to a file of its own, the one place a reader finds one apart from the other.
 *
 * argv: <runFile>  — JSON: { cmd, args, cwd, logFile, env?, streams?, stopFile?, nativeIdPattern?, input?, inputAt? }
 */
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const runFile = process.argv[2];
const plan = JSON.parse(fs.readFileSync(runFile, 'utf8')) as {
  cmd: string;
  args: string[];
  cwd: string;
  logFile: string;
  env?: Record<string, string>;
  streams?: { stdout: string; stderr: string };
  stopFile?: string;
  nativeIdPattern?: string;
  pid?: number;
  input?: { first: string; inbox: string; from: number; closesOn: { key: string; value: string } };
  inputAt?: number;
};

/** The running boot's id, read once from where Linux keeps it; `undefined` where the machine does not say. */
const boot = (() => {
  try {
    return fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim() || undefined;
  } catch {
    return undefined;
  }
})();
/**
 * The heartbeat on the monotonic clock, `{ boot, ms }` as the runtime's `instantNow` reads it, so that the lease is measured
 * across this process and the one that reads it whatever the wall clock steps; `undefined` with no boot id.
 */
const beatNow = () => (boot ? { boot, ms: Number(process.hrtime.bigint() / 1_000_000n) } : undefined);

let status = {
  ...plan,
  state: 'working' as string,
  pid: process.pid,
  startedAt: new Date().toISOString(),
  heartbeatAt: new Date().toISOString(),
  beat: beatNow(),
  nativeId: undefined as string | undefined,
  exitCode: undefined as number | undefined,
  /** A harness started here has closed nothing yet, whatever the one before it did. */
  inputClosed: undefined as true | undefined,
};
/** How long a harness told to stop has to end on SIGTERM before what is left of its group is killed. */
const STOP_GRACE_MS = 5_000;
let spawned = false;
let gone = false;
let stopping = false;
/** When the harness was first told to stop, on `performance.now()`'s clock: what is left is killed `STOP_GRACE_MS` after. */
let stoppedAt: number | undefined;
/**
 * Writes `patch` on the run file, with a fresh heartbeat; nothing once the run file has gone. In this order:
 *
 * 1. The run file is looked for first: renamed into place, a write would make again the file that was taken away.
 * 2. The status is written to a temp file and renamed over the run file, so a reader never sees half a JSON object.
 *
 * A run file found gone, or a directory gone with it (the store removed, `ENOENT`), is `vanished`.
 */
const write = (patch: Partial<typeof status> = {}) => {
  if (gone) return;
  status = { ...status, ...patch, heartbeatAt: new Date().toISOString(), beat: beatNow() };
  if (!fs.existsSync(runFile)) return vanished();
  try {
    fs.writeFileSync(`${runFile}.tmp`, JSON.stringify(status));
    fs.renameSync(`${runFile}.tmp`, runFile);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return vanished();
    throw e;
  }
};
/**
 * The run file is gone: the session was taken away. Before the harness is started, nothing is; after, it is stopped. Every
 * write after the first is heard on the event loop, once this start has run to its end, so `beat`, `inbox` and `child`
 * below are set by then.
 */
const vanished = () => {
  gone = true;
  if (!spawned) process.exit(0);
  clearInterval(beat);
  clearInterval(inbox);
  stop();
};
/** Sends SIGTERM to the harness's process group, or to the harness alone when the group cannot be signalled. */
const killGroup = () => {
  try {
    process.kill(-child.pid!, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
};
/** Kills what is left of the harness's process group; a group that has ended on SIGTERM is nothing to kill. */
const killLeft = () => {
  try {
    process.kill(-child.pid!, 'SIGKILL');
  } catch {}
};
/** Whether anything is left in the harness's process group — the harness itself, or what it started. */
const groupAlive = () => {
  try {
    process.kill(-child.pid!, 0);
    return true;
  } catch {
    return false;
  }
};
/**
 * Asks the harness's group to end, and gives it `STOP_GRACE_MS` from the first time it was asked; then kills what is left, for
 * a harness that ignores SIGTERM itself, whose exit `leave` would otherwise wait on.
 */
const stop = () => {
  stopping = true;
  killGroup();
  if (stoppedAt !== undefined) return;
  stoppedAt = performance.now();
  setTimeout(killLeft, STOP_GRACE_MS).unref();
};
/**
 * Exits. A worker told to stop first sees its harness's whole group ended: the harness can die on SIGTERM and leave a
 * child that ignores it holding its output, and the drain gives up on that at `DRAIN_MS`. So it waits for the group to
 * empty until `STOP_GRACE_MS` after the stop, and kills what is left.
 */
const leave = async (code: number) => {
  if (stoppedAt !== undefined) {
    while (groupAlive() && performance.now() < stoppedAt + STOP_GRACE_MS) await new Promise((r) => setTimeout(r, 50));
    killLeft();
  }
  process.exit(code);
};
for (const sig of ['SIGTERM', 'SIGINT'] as const) process.on(sig, stop);
write();
if (!plan.pid && plan.stopFile && fs.existsSync(plan.stopFile)) {
  write({ state: 'stopped', exitCode: -1 });
  process.exit(0);
}

/**
 * How the harness is given its messages on its stdin, when its spec reads them there; absent, it has no stdin. In this order:
 *
 * 1. The brief's line is written first.
 * 2. Every `INBOX_MS`, each whole line appended to the inbox past `inputAt` is written on, once `inputAt` says it has been; a
 *    line still being appended waits, and no inbox yet is nothing said. The inbox is cut into lines by bytes: a newline byte
 *    is never part of another character in UTF-8.
 * 3. The harness's stdout is read a line at a time, each parsed as JSON for `closesOn` — its `key` holding `value` — and
 *    never matched at its start. At the first such line `inputClosed` goes on the run file, so a word said from then on is
 *    refused rather than appended for nobody, and then stdin is ended: a harness that reads its stdin for more, as a job
 *    reading `--input-format stream-json` does, exits only once it ends.
 *
 * A write that fails because the harness has exited or closed its stdin (EPIPE) is heard and dropped: it must not take down
 * the one process that says how the run ended.
 */
const input = plan.input;
/**
 * The harness, in a process group of its own (`detached`): not to outlive anything, but so a stop takes its children with it.
 * A harness that shells out, as Codex does, otherwise leaves orphans, and an orphaned build holds the worktree the next
 * attempt wants.
 */
const child = spawn(plan.cmd, plan.args, {
  cwd: plan.cwd,
  env: { ...process.env, ...plan.env },
  stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'],
  detached: true,
});
spawned = true;
/**
 * The run's log, which takes the harness's stdout and stderr. Its error — output that arrives after it is closed, from a child
 * still holding a pipe — is heard and dropped: it must not crash the one process that says how the run ended.
 */
const log = fs.createWriteStream(plan.logFile, { flags: 'a' });
log.on('error', () => {});
/** Each stream's own file, for a plan with `streams`: written as the log is, and its error heard and dropped as the log's. */
const whole = plan.streams && { stdout: fs.createWriteStream(plan.streams.stdout), stderr: fs.createWriteStream(plan.streams.stderr) };
for (const file of Object.values(whole ?? {})) file.on('error', () => {});
/** Ends the log and each stream's file, and calls `done` once every one of them is on disk. */
const endFiles = (done: () => void) => {
  const files = [log, ...Object.values(whole ?? {})];
  let left = files.length;
  for (const file of files) file.end(() => --left === 0 && done());
};

/** The harness's own id, found in its output when it prints one: needed only to resume its session; the run's name is the key. */
const nativeId = plan.nativeIdPattern ? new RegExp(plan.nativeIdPattern) : null;
const scan = (chunk: Buffer) => {
  if (!log.writableEnded) log.write(chunk);
  if (nativeId && !status.nativeId) {
    const m = nativeId.exec(chunk.toString());
    if (m?.[1]) write({ nativeId: m[1] });
  }
};
const keep = (file: fs.WriteStream | undefined) => (chunk: Buffer) => {
  if (file && !file.writableEnded) file.write(chunk);
};
child.stdout!.on('data', scan);
child.stderr!.on('data', scan);
child.stdout!.on('data', keep(whole?.stdout));
child.stderr!.on('data', keep(whole?.stderr));

const beat = setInterval(() => write(), 5_000);
beat.unref?.();

/** How often the inbox is looked at for words: the most a word waits before it is written on. */
const INBOX_MS = 500;
let inbox: NodeJS.Timeout | undefined;
if (input) {
  const stdin = child.stdin!;
  stdin.on('error', () => {});
  stdin.write(`${input.first}\n`);
  let at = plan.inputAt ?? input.from;
  const take = () => {
    let fd: number;
    try {
      fd = fs.openSync(input.inbox, 'r');
    } catch {
      return;
    }
    try {
      const base = at;
      const size = fs.fstatSync(fd).size;
      if (size <= base) return;
      const buf = Buffer.alloc(size - base);
      const n = fs.readSync(fd, buf, 0, buf.length, base);
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

  const { key, value } = input.closesOn;
  let pending = '';
  const closes = (line: string) => {
    try {
      const o = JSON.parse(line) as Record<string, unknown> | null;
      return typeof o === 'object' && o !== null && o[key] === value;
    } catch {
      return false;
    }
  };
  child.stdout!.on('data', (chunk: Buffer) => {
    if (stdin.writableEnded) return;
    pending += chunk.toString('utf8');
    const lines = pending.split('\n');
    pending = lines.pop()!;
    if (!lines.some(closes)) return;
    clearInterval(inbox);
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
  new Promise<void>((resolve) => {
    if (s.closed) resolve();
    else s.once('close', () => resolve());
  });

child.on('exit', (code) => {
  clearInterval(beat);
  clearInterval(inbox);
  const drained = Promise.all([closed(child.stdout!), closed(child.stderr!)]);
  const bound = new Promise<void>((resolve) => setTimeout(resolve, DRAIN_MS).unref());
  void Promise.race([drained, bound]).then(() =>
    endFiles(() => {
      write({ state: stopping ? 'stopped' : code === 0 ? 'done' : 'failed', exitCode: stopping ? -1 : (code ?? -1) });
      setTimeout(() => void leave(0), 50);
    }),
  );
});

child.on('error', (e) => {
  clearInterval(beat);
  clearInterval(inbox);
  write({ state: 'failed', exitCode: -1 });
  log.write(`\n[worker] spawn failed: ${String(e)}\n`);
  endFiles(() => {});
  setTimeout(() => process.exit(1), 50);
});
