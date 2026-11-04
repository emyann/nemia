/**
 * Every temporary root a test makes, and whatever is left running in it: taken away before the test file ends.
 *
 * A root a test leaves under the machine's temp directory, and a detached worker a failed test never stopped, both outlive
 * the suite: the folders pile up by the thousand, and the workers live on for hours, re-parented to init, holding the page
 * cache and slab that can freeze a machine. So a test makes its root here, `scratch(prefix)`, and never by calling
 * `os.tmpdir`; a test that asserts where the code under test runs a process names the directory with `machineTempDir()`,
 * which makes no root. Each package's `scratch.test.ts` refuses any other call of `os.tmpdir` under `test/`.
 *
 * Each package has this file, the same byte for byte (its `scratch.test.ts` holds the copy to the runtime's): a package
 * reaches another only through its exports, and a test helper is none. Importing it registers two hooks for the file:
 *
 * - after each test, what is still running in a root that test made is reaped: a worker is sent SIGTERM, the stop the
 *   runner sends, and waited out; then anything left naming the root — a harness, an orphan it left, a fake — is killed,
 *   with its process group where it leads one, and waited out;
 * - after the file, the same for every root it made, then each root is removed, and the hook fails the file if a
 *   process or a root is still there.
 *
 * A process is in a root when an argument of its command line is a path in it, its working directory is, or a variable of
 * its environment names one — a PATH, an AE_ROOT a harness inherited — read from `/proc`, so the last two on Linux only.
 * Waits are for a count, under a bound, never for a length of time.
 */
import { after, afterEach, beforeEach } from 'node:test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const roots: string[] = [];
/** The number of roots made before each test still running began: a test reaps the roots past its own mark. */
const marks: number[] = [];

/** A new directory under the temp directory, named from `prefix`, taken away with what runs in it before the file ends. */
export const scratch = (prefix: string): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
};

/**
 * The machine's temp directory itself, for a test that asserts where the code under test runs a process. Never a place to
 * make a root in: `scratch` makes one, and `scratch.test.ts` refuses a line that passes this to a `mkdtempSync`.
 */
export const machineTempDir = (): string => os.tmpdir();

export type Proc = { pid: number; pgid: number; state: string; args: string; cwd?: string; env?: string };

/**
 * Every process on the machine: from `/proc` where there is one, or else from `ps`, which says no working directory or environment.
 * A process that ends while it is read is left out; one of another user's is listed without its working directory and environment,
 * which only its owner may read. The command's name in `/proc/<pid>/stat` is in parentheses and may hold spaces, so the fields are
 * counted from its last `)`.
 */
const processes = (): Proc[] => {
  if (!fs.existsSync('/proc/self/stat')) {
    return execFileSync('ps', ['-eo', 'pid=,pgid=,stat=,args='], { encoding: 'utf8' })
      .split('\n')
      .flatMap((line) => {
        const m = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(line);
        return m ? [{ pid: Number(m[1]), pgid: Number(m[2]), state: m[3], args: m[4] }] : [];
      });
  }
  const found: Proc[] = [];
  for (const entry of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const stat = fs.readFileSync(`/proc/${entry}/stat`, 'utf8');
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      const args = fs.readFileSync(`/proc/${entry}/cmdline`, 'utf8').split('\0').join(' ').trim();
      let cwd: string | undefined;
      let env: string | undefined;
      try {
        cwd = fs.readlinkSync(`/proc/${entry}/cwd`).replace(/ \(deleted\)$/, '');
      } catch {}
      try {
        env = fs.readFileSync(`/proc/${entry}/environ`, 'utf8').split('\0').join(' ');
      } catch {}
      found.push({ pid: Number(entry), pgid: Number(fields[2]), state: fields[0], args, cwd, env });
    } catch {}
  }
  return found;
};

const realOf = (p: string) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
};
const pathIn = (text: string, dir: string) => {
  for (let at = text.indexOf(dir); at !== -1; at = text.indexOf(dir, at + 1)) {
    const next = text[at + dir.length];
    if (next === undefined || next === '/' || next === ' ' || next === path.delimiter) return true;
  }
  return false;
};

/** The processes still alive in any of `dirs` — a zombie is not alive, and this process and its parent are never counted. */
export const runningIn = (dirs: string[]): Proc[] => {
  const all = dirs.flatMap((d) => [d, realOf(d)]);
  return processes().filter(
    (p) =>
      p.pid !== process.pid &&
      p.pid !== process.ppid &&
      !p.state.startsWith('Z') &&
      all.some(
        (d) =>
          pathIn(p.args, d) ||
          (p.env !== undefined && pathIn(p.env, d)) ||
          (p.cwd !== undefined && (p.cwd === d || p.cwd.startsWith(`${d}/`))),
      ),
  );
};

/** What a test run left in `dir`: every entry still in it, and every process still alive in it. */
export const leftBehind = (dir: string) => ({ entries: fs.existsSync(dir) ? fs.readdirSync(dir) : [], processes: runningIn([dir]) });

const until = async (ok: () => boolean, ms: number) => {
  for (const bound = performance.now() + ms; !ok();) {
    if (performance.now() > bound) return false;
    await new Promise((r) => setTimeout(r, 50));
  }
  return true;
};
/** Sends `sig` to `pid`, or to a process group where `pid` is negative; one already gone is no error. */
const signal = (pid: number, sig: NodeJS.Signals) => {
  try {
    process.kill(pid, sig);
  } catch {}
};
const isWorker = (p: Proc) => /\bae-worker\.ts\b/.test(p.args);

/**
 * Stops what runs in `dirs` and waits it out: each worker by SIGTERM, as the runner stops one, and continued in case a
 * test froze it; then the rest killed, each with its process group where it leads one, for what it started, and never with
 * this process's own group. Answers what is still alive after both.
 */
export const reap = async (dirs: string[]): Promise<Proc[]> => {
  if (!dirs.length) return [];
  const workers = runningIn(dirs).filter(isWorker);
  for (const w of workers) {
    signal(w.pid, 'SIGTERM');
    signal(w.pid, 'SIGCONT');
  }
  if (workers.length) await until(() => !runningIn(dirs).some(isWorker), 10_000);
  const own = processes().find((p) => p.pid === process.pid)?.pgid;
  const rest = runningIn(dirs);
  for (const p of rest) {
    if (p.pgid === p.pid && p.pgid !== own) signal(-p.pgid, 'SIGKILL');
    signal(p.pid, 'SIGKILL');
  }
  if (rest.length) await until(() => runningIn(dirs).length === 0, 5_000);
  return runningIn(dirs);
};

beforeEach(() => {
  marks.push(roots.length);
});
afterEach(async () => {
  await reap(roots.slice(marks.pop() ?? roots.length));
});

after(async () => {
  const alive = await reap(roots);
  const kept: string[] = [];
  for (const root of roots) {
    try {
      fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      kept.push(root);
    }
  }
  if (alive.length || kept.length) {
    throw new Error(
      `scratch: the file left ${alive.length} process(es) and ${kept.length} root(s) behind:\n${[
        ...alive.map((p) => `  ${p.pid} ${p.args}`),
        ...kept.map((r) => `  ${r}`),
      ].join('\n')}`,
    );
  }
});
