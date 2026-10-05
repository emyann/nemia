/**
 * A `wf` child a test waits on by what it says or by its end, never by a length of time.
 *
 * A test that spawns `nemia watch` or `nemia up` waits for its banner or for a file it writes; the child first imports the CLI, which under
 * a machine's load can take longer than any bound a test would pick. So the wait is an event: the awaited thing, or the child's end, which
 * fails the wait at once with how it ended, its stdout and its stderr. A child that never returns is bound by its parent instead of a
 * clock: its stdin is a pipe from the test's process, and the end of that pipe, when the test kills it or dies, ends the child.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

/** Ends the child when its stdin ends, without holding it open: a program that returns still ends on its own. */
const PRELUDE = "process.stdin.once('end', () => process.exit(1)); process.stdin.resume(); process.stdin.unref();";

/** How a child ended: its exit code or the signal that killed it, or the error that kept it from starting. */
export type Ended = { code: number | null; signal: NodeJS.Signals | null; error?: Error };

/** A running node child, what it has said so far, how it ended once it has, and a wait on what it says. */
export type NodeChild = {
  child: ChildProcessWithoutNullStreams;
  out: () => string;
  err: () => string;
  closed: Promise<Ended>;
  until: (ok: () => boolean, what: string) => Promise<void>;
};

/** How a child ended, as a person reads it: "exited 3", "was killed by SIGTERM", or "could not start: …". */
function endOf(ended: Ended): string {
  if (ended.error) return `could not start: ${ended.error.message}`;
  return ended.signal ? `was killed by ${ended.signal}` : `exited ${ended.code}`;
}

/**
 * Spawns `node --input-type=module -e <program>` with `env`, its stdin a pipe that ends it when it ends.
 *
 * `until(ok, what)` asks `ok()` at once, on each chunk the child writes and every 20ms, so a condition on a file is read too; it resolves
 * when `ok()` holds and rejects when `ok()` throws. The child's close settles it: `ok()` is asked once more, and the wait rejects with
 * `what`, how the child ended, its stdout and its stderr. It has no deadline: the 20ms is how often it looks, not how long it waits, and
 * it holds no process open: a wait left pending is held only by the child it waits on.
 *
 * @param program the module's code, run after the line that ties the child to its stdin
 * @param env the child's whole environment
 * @returns the child, its output so far, its end, and the wait
 */
export function nodeChild(program: string, env: NodeJS.ProcessEnv): NodeChild {
  const child = spawn(process.execPath, ['--input-type=module', '-e', `${PRELUDE}\n${program}`], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.on('error', () => undefined);
  let out = '';
  let err = '';
  const lookers = new Set<() => void>();
  const heard = () => {
    for (const look of lookers) look();
  };
  child.stdout.on('data', (d) => {
    out += d;
    heard();
  });
  child.stderr.on('data', (d) => {
    err += d;
    heard();
  });
  const closed = new Promise<Ended>((resolve) => {
    child.once('close', (code, signal) => resolve({ code, signal }));
    child.once('error', (error) => resolve({ code: null, signal: null, error }));
  });
  const until = (ok: () => boolean, what: string) =>
    new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (how: () => void) => {
        if (settled) return;
        settled = true;
        clearInterval(timer);
        lookers.delete(look);
        how();
      };
      const holds = (): boolean | Error => {
        try {
          return ok();
        } catch (e) {
          return e instanceof Error ? e : new Error(String(e));
        }
      };
      const look = () => {
        const held = holds();
        if (held instanceof Error) settle(() => reject(held));
        else if (held) settle(resolve);
      };
      const timer = setInterval(look, 20).unref();
      lookers.add(look);
      void closed.then((ended) => {
        look();
        settle(() =>
          reject(new Error(`${what} — the child ${endOf(ended)} before it; stdout:\n${out || '(empty)'}\nstderr:\n${err || '(empty)'}`)),
        );
      });
      look();
    });
  return { child, out: () => out, err: () => err, closed, until };
}
