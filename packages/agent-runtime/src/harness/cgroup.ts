/**
 * A task's memory limit, held by the host: its process tree run in a cgroup of its own, a transient scope of systemd's user manager
 * (`systemd-run --user --scope`), whose `MemoryMax=` the kernel enforces with an OOM kill inside that cgroup alone, as the kubelet
 * holds a container's `resources.limits.memory`. Read by the detached runner's `startWorker`, whose worker sits in the scope beside
 * its harness and reads the scope's files at the harness's exit, and by the attached holder's spawn.
 *
 * Imports nothing but node's own: `bin/ae-worker.ts` reads it, and stays dependency-free.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

/** What a scope's files say of its memory: the limit it ran under, its peak where the kernel keeps one, and its OOM kills. */
export type CgroupMemory = { limitBytes: number; peakBytes?: number; oomKills: number };

/**
 * The argv put before a command to run it in a scope of its own under `limitBytes`, in `parent` (a slice's name) where given:
 *
 * - `--scope`: systemd-run runs the command itself, as its parent, so the pid, the process group and the stop path are the command's;
 * - `--collect`: the scope is unloaded once it ends, even failed;
 * - `MemorySwapMax=0`: the limit does not spill into swap;
 * - `OOMPolicy=continue`: the kernel's kill of the largest process (a runaway test) leaves the rest running, the worker that writes
 *   the attempt's end among them; systemd's default would stop the whole scope.
 */
export const scopeArgv = (limitBytes: number, parent?: string, program = 'systemd-run'): string[] => [
  program,
  '--user',
  '--scope',
  '--quiet',
  '--collect',
  ...(parent === undefined ? [] : [`--slice=${parent}`]),
  '-p',
  `MemoryMax=${limitBytes}`,
  '-p',
  'MemorySwapMax=0',
  '-p',
  'OOMPolicy=continue',
  '--',
];

/** The limit the probe asks for: a scope under it is made, and reads it back as its own `memory.max`. */
const PROBE_BYTES = 268_435_456;

/** What each probe answered, by its program and slice: asked once a process. */
const probed = new Map<string, string | undefined>();

/**
 * Why a memory limit cannot be held on this host, in words that say what to set, or `undefined` where it can: `systemd-run` is run
 * once, with the properties a limited task is run under (`scopeArgv`), around `sh` reading its own cgroup's `memory.max`, which must
 * say the probe's limit. It refuses a host with no systemd user manager reachable (`XDG_RUNTIME_DIR` and the user bus unset), one
 * on cgroup v1, and a systemd older than 253, whose scopes take no `OOMPolicy=`. Asked once a process for each `program` and `parent`;
 * `program` is a parameter so that a test can stand another in.
 */
export const scopeRefusal = (parent?: string, program = 'systemd-run'): string | undefined => {
  const key = `${program}\u0000${parent ?? ''}`;
  if (probed.has(key)) return probed.get(key);
  const read = 'cat "/sys/fs/cgroup$(sed -n "s/^0:://p" /proc/self/cgroup)/memory.max"';
  const [, ...args] = scopeArgv(PROBE_BYTES, parent, program);
  const r = spawnSync(program, [...args, 'sh', '-c', read], { encoding: 'utf8', timeout: 20_000 });
  const said = (r.stderr ?? '').trim().split('\n').slice(-1)[0] ?? '';
  const words =
    r.status === 0 && r.stdout.trim() === String(PROBE_BYTES)
      ? undefined
      : `A memory limit (\`resources.limits.memory\`) runs a task in a scope of systemd's user manager, and this host cannot make one` +
        `${r.error ? ` (\`${program}\`: ${r.error.message})` : said ? ` (\`${program}\` said: ${said})` : ''}: it needs systemd 253 or later ` +
        `with a user manager on cgroup v2, reached through \`XDG_RUNTIME_DIR\` and \`DBUS_SESSION_BUS_ADDRESS\`` +
        `${parent === undefined ? '' : `, and a slice named \`${parent}\``}. Run the engine where those hold, or leave the limit off the task and the engine's default unset.`;
  probed.set(key, words);
  return words;
};

/** The cgroup v2 folder a process sits in, read off `/proc/<pid>/cgroup`'s `0::` line; `undefined` off cgroup v2. */
const cgroupFolderOf = (pid: number | 'self'): string | undefined => {
  try {
    const line = fs
      .readFileSync(`/proc/${pid}/cgroup`, 'utf8')
      .split('\n')
      .find((l) => l.startsWith('0::'));
    return line === undefined ? undefined : `/sys/fs/cgroup${line.slice(3)}`;
  } catch {
    return undefined;
  }
};

/** A file of a cgroup's as a whole number, or `undefined` where it is not there or holds no number (`max`). */
const numberIn = (file: string): number | undefined => {
  try {
    const n = Number(fs.readFileSync(file, 'utf8').trim());
    return Number.isSafeInteger(n) ? n : undefined;
  } catch {
    return undefined;
  }
};

/**
 * What the cgroup `pid` sits in says of its memory: its `memory.max`, its `memory.peak` (a kernel from 5.19), and `memory.events`'
 * `oom_kill`, the processes the OOM killer ended in it. `undefined` where the process is gone, the host is off cgroup v2, or the
 * cgroup has no limit.
 */
export const cgroupMemoryOf = (pid: number | 'self'): CgroupMemory | undefined => {
  const folder = cgroupFolderOf(pid);
  if (folder === undefined) return undefined;
  const limitBytes = numberIn(`${folder}/memory.max`);
  if (limitBytes === undefined) return undefined;
  let oomKills = 0;
  try {
    const line = fs
      .readFileSync(`${folder}/memory.events`, 'utf8')
      .split('\n')
      .find((l) => l.startsWith('oom_kill '));
    oomKills = line === undefined ? 0 : Number(line.slice('oom_kill '.length)) || 0;
  } catch {
    return undefined;
  }
  const peakBytes = numberIn(`${folder}/memory.peak`);
  return { limitBytes, oomKills, ...(peakBytes === undefined ? {} : { peakBytes }) };
};
