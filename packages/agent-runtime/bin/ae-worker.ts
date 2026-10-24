#!/usr/bin/env node
/**
 * The detached worker: one harness process, babysat, reported.
 *
 * This is what `claude --bg` does for Claude Code, done by us for a harness that has no such
 * thing. It is deliberately dependency-free and dull — it starts before the engine can help it
 * and outlives the engine that started it, so anything clever in here is a thing that breaks
 * while nobody is watching.
 *
 * Its whole contract is the run file: `{ state, pid, heartbeatAt, beat, nativeId, startRefused }`, rewritten as the
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
 * the heartbeat, within `BEAT_MS`, or sooner at a word or an id. Its parent going is not a stop: outliving the engine
 * is what it is for.
 *
 * The harness's own id for its session (`nativeId`) is read from its start event (`HarnessSpec.start`): the first whole line of its
 * stdout that is a JSON object whose own keys hold each of `start.event`'s values. Lines before it are passed over, so a key of the
 * same name on another line is never taken for it, and stderr is not read for it. Its `start.id` field must be an id, a string of hex
 * and dashes, 16 or more: otherwise the start is refused, `startRefused` naming the line, the field and what was there, and its session
 * is unread, never read as having no id. A stream that ends with no start event keeps no id and no refusal: its harness never started a
 * session.
 *
 * The harness's environment is the worker's, with the plan's `env` over it. Its stdout and stderr both go to the log, in the order
 * they arrive; with `streams`, each also goes whole to a file of its own, the one place a reader finds one apart from the other.
 *
 * argv: <runFile>  — JSON: { cmd, args, cwd, logFile, env?, streams?, stopFile?, start?, input?, inputAt?, stopGraceMs?, beatMs? }
 */
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { WORKER_BEAT_MS, WORKER_STOP_GRACE_MS } from '../src/harness/detached/worker-bounds.ts';

/** The run file the worker is started on, its one argument; a worker started without one says how to start it, and exits 2. */
const runFile = ((given: string | undefined): string => {
  if (given !== undefined) return given;
  process.stderr.write('ae-worker: give the run file to work from, as `node bin/ae-worker.ts <runFile>`\n');
  process.exit(2);
})(process.argv[2]);
const plan = JSON.parse(fs.readFileSync(runFile, 'utf8')) as {
  cmd: string;
  args: string[];
  cwd: string;
  logFile: string;
  env?: Record<string, string>;
  streams?: { stdout: string; stderr: string };
  stopFile?: string;
  start?: { event: Record<string, string>; id: string };
  pid?: number;
  input?: { first: string; inbox: string; from: number; closesOn: { key: string; value: string } };
  inputAt?: number;
  stopGraceMs?: number;
  beatMs?: number;
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
 * across this process and the one that reads it whatever the wall clock is set to; `undefined` with no boot id.
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
  startRefused: undefined as { line: number; field: string; found: string } | undefined,
  exitCode: undefined as number | undefined,
  /** A harness started here has closed nothing yet, whatever the one before it did. */
  inputClosed: undefined as true | undefined,
};
/**
 * How long a harness told to stop has to end on SIGTERM before what is left of its group is killed: the plan's, which the spawn
 * writes, or the shipped bound for a run file written before plans carried it.
 */
const STOP_GRACE_MS = plan.stopGraceMs ?? WORKER_STOP_GRACE_MS;
/** How often the run file is rewritten when nothing else moves it: the heartbeat, the plan's or the shipped one. */
const BEAT_MS = plan.beatMs ?? WORKER_BEAT_MS;
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
/**
 * Sends `signal` to the harness's process group, and whether it could: not for a group that has ended, nor for a harness that never
 * started, which has no pid and so no group.
 */
const signalGroup = (signal: NodeJS.Signals | 0): boolean => {
  if (child.pid === undefined) return false;
  try {
    process.kill(-child.pid, signal);
    return true;
  } catch {
    return false;
  }
};
/** Sends SIGTERM to the harness's process group, or to the harness alone when the group cannot be signalled. */
const killGroup = () => {
  if (!signalGroup('SIGTERM')) child.kill('SIGTERM');
};
/** Kills what is left of the harness's process group; a group that has ended on SIGTERM is nothing to kill. */
const killLeft = () => {
  signalGroup('SIGKILL');
};
/** Whether anything is left in the harness's process group — the harness itself, or what it started. */
const groupAlive = () => signalGroup(0);
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
 * 3. The harness's stdout is read a whole line at a time (`readers`), each parsed as JSON for `closesOn` — its own `key` holding
 *    `value` — and never matched at its start. At the first such line `inputClosed` goes on the run file, so a word said from then on is
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
/** The harness's stdout and stderr, piped as the spawn above asks: Node gives both for a piped stream, started or not. */
const { stdout, stderr } = child;
if (stdout === null || stderr === null) throw new Error('ae-worker: the harness was spawned with stdout and stderr piped, and has none');
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

/**
 * What reads the harness's stdout a whole line at a time: each is handed every line in order, as text, with its number from 1, and
 * answers whether it reads on. Lines are cut on the newline byte, which is never part of another character in UTF-8, so the edge of a
 * chunk splits neither a line nor a character; the last line, when no newline follows it, is handed at the stream's end, which comes
 * before the drain that writes the run's end. Registered before the log is written, so what a line says is on the run file before the
 * line is in the log.
 */
let readers: Array<(line: string, at: number) => boolean> = [];
let held: Buffer[] = [];
let lineAt = 0;
const hand = (bytes: Buffer) => {
  const line = bytes.toString('utf8');
  lineAt++;
  readers = readers.filter((read) => read(line, lineAt));
};
stdout.on('data', (chunk: Buffer) => {
  if (!readers.length) return;
  let from = 0;
  for (let nl = chunk.indexOf(0x0a); nl !== -1; nl = chunk.indexOf(0x0a, from)) {
    hand(Buffer.concat([...held, chunk.subarray(from, nl)]));
    held = [];
    from = nl + 1;
  }
  if (from < chunk.length) held.push(chunk.subarray(from));
});
stdout.on('end', () => {
  if (held.length && readers.length) hand(Buffer.concat(held));
  held = [];
});
/** The JSON object `line` holds, or `undefined` for a line that holds none. */
const objectIn = (line: string): Record<string, unknown> | undefined => {
  try {
    const o = JSON.parse(line) as unknown;
    return typeof o === 'object' && o !== null && !Array.isArray(o) ? (o as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
};
/** What an id of a harness's own is: hex and dashes, 16 or more, the whole of the field. */
const ID = /^[0-9a-f-]{16,}$/;
const start = plan.start;
if (start) {
  readers.push((line, at) => {
    const o = objectIn(line);
    if (!o || !Object.entries(start.event).every(([k, v]) => Object.hasOwn(o, k) && o[k] === v)) return true;
    const id = Object.hasOwn(o, start.id) ? o[start.id] : undefined;
    if (typeof id === 'string' && ID.test(id)) write({ nativeId: id });
    else {
      const found = Object.hasOwn(o, start.id) ? JSON.stringify(id).slice(0, 200) : 'nothing';
      write({ startRefused: { line: at, field: start.id, found } });
    }
    return false;
  });
}
const toLog = (chunk: Buffer) => {
  if (!log.writableEnded) log.write(chunk);
};
const keep = (file: fs.WriteStream | undefined) => (chunk: Buffer) => {
  if (file && !file.writableEnded) file.write(chunk);
};
stdout.on('data', toLog);
stderr.on('data', toLog);
stdout.on('data', keep(whole?.stdout));
stderr.on('data', keep(whole?.stderr));

const beat = setInterval(() => write(), BEAT_MS);
beat.unref?.();

/** How often the inbox is looked at for words: the most a word waits before it is written on. */
const INBOX_MS = 500;
let inbox: NodeJS.Timeout | undefined;
if (input) {
  const stdin = child.stdin;
  if (stdin === null) throw new Error('ae-worker: the harness was spawned with its stdin piped for its input, and has none');
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
  readers.push((line) => {
    if (stdin.writableEnded) return false;
    const o = objectIn(line);
    if (!o || !Object.hasOwn(o, key) || o[key] !== value) return true;
    clearInterval(inbox);
    write({ inputClosed: true });
    stdin.end();
    return false;
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
  const drained = Promise.all([closed(stdout), closed(stderr)]);
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
