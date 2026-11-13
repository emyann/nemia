/**
 * A session's scope, held by the host: its process tree run in a cgroup of its own, a transient scope of systemd's user manager
 * (`systemd-run --user --scope`), as a Pod's containers run in a cgroup the kubelet makes. Every process the session's commands start
 * sits in it, wherever they were started from, so the session's end ends it whole (`scopeToEnd`, `scopeLeftIn`, `endScopeIn`). Under a
 * memory limit the scope also carries `MemoryMax=`, which the kernel enforces with an OOM kill inside that cgroup alone, as the kubelet
 * holds a container's `resources.limits.memory`. Read by the detached runner's `startWorker`, whose worker sits in the scope beside its
 * harness, records the scope's folder and reads its files at the harness's exit, and by the attached holder's spawn.
 *
 * Imports nothing but node's own: `bin/ae-worker.ts` reads it, and stays dependency-free.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import type { ScopeToEnd } from '../../contracts/scope-end.contract.ts';

/** What a scope's files say of its memory: the limit it ran under, its peak where the kernel keeps one, and its OOM kills. */
export type CgroupMemory = { limitBytes: number; peakBytes?: number; oomKills: number; oom: number };

/**
 * The argv put before a command to run it in a scope of its own, in `parent` (a slice's name) where given, and under `limitBytes` where
 * given:
 *
 * - `--scope`: systemd-run runs the command itself, as its parent, so the pid, the process group and the stop path are the command's;
 * - `--collect`: the scope is unloaded once it ends, even failed;
 * - with a limit, `MemoryMax=` that limit, and `MemorySwapMax=0`: the limit does not spill into swap; and `OOMPolicy=continue`: the
 *   kernel's kill of the largest process (a runaway test) leaves the rest running, the worker that writes the attempt's end among them;
 *   systemd's default would stop the whole scope. With none, the scope only holds the session's processes together.
 */
export const scopeArgv = (limitBytes: number | undefined, parent?: string, program = 'systemd-run'): string[] => [
  program,
  '--user',
  '--scope',
  '--quiet',
  '--collect',
  ...(parent === undefined ? [] : [`--slice=${parent}`]),
  ...(limitBytes === undefined ? [] : ['-p', `MemoryMax=${limitBytes}`, '-p', 'MemorySwapMax=0', '-p', 'OOMPolicy=continue']),
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

/**
 * The cgroup v2 folder a process sits in, under the mount (`/sys/fs/cgroup/...`), read off `/proc/<pid>/cgroup`'s `0::` line;
 * `undefined` off cgroup v2, or for a process gone.
 */
export const cgroupNow = (pid: number | 'self'): string | undefined => {
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
 * What a cgroup's `memory.events` counts, read apart: `oom_kill`, the processes of the cgroup any OOM killer ended, the machine's own
 * included (`oomKills`), and `oom`, the times the cgroup's own limit was reached and its OOM killer ran (`oom`). Never `oom_group_kill`
 * for `oom`: each line is matched by its whole key. A line missing, or no number, reads 0.
 */
export const memoryEventsOf = (text: string): { oomKills: number; oom: number } => {
  const count = (key: string): number => {
    const line = text.split('\n').find((l) => l.startsWith(`${key} `));
    return line === undefined ? 0 : Number(line.slice(key.length + 1)) || 0;
  };
  return { oomKills: count('oom_kill'), oom: count('oom') };
};

/**
 * What the cgroup `pid` sits in says of its memory: its `memory.max`, its `memory.peak` (a kernel from 5.19), and `memory.events`'
 * `oom_kill`, the processes any OOM killer ended in it, and `oom`, the times its own limit was reached (`memoryEventsOf`). `undefined`
 * where the process is gone, the host is off cgroup v2, or the cgroup has no limit.
 */
export const cgroupMemoryOf = (pid: number | 'self'): CgroupMemory | undefined => {
  const folder = cgroupNow(pid);
  if (folder === undefined) return undefined;
  const limitBytes = numberIn(`${folder}/memory.max`);
  if (limitBytes === undefined) return undefined;
  let events: { oomKills: number; oom: number };
  try {
    events = memoryEventsOf(fs.readFileSync(`${folder}/memory.events`, 'utf8'));
  } catch {
    return undefined;
  }
  const peakBytes = numberIn(`${folder}/memory.peak`);
  return { limitBytes, ...events, ...(peakBytes === undefined ? {} : { peakBytes }) };
};

/**
 * Whether the scope a session's run file `recorded` may be ended whole by the runtime, which runs in `own` (`cgroupNow('self')`), each
 * read again where the end is written (`scope-end.contract.ts`): a transient scope's folder under the cgroup mount, with no `/..` out of
 * it, that is neither the runtime's own cgroup nor one it runs inside. A cgroup read before systemd-run moved the session into its
 * scope is the runtime's own, or no scope, and is never ended; nor is anything where either is unread. The path is joined with `+`, as
 * the contract's `holds` joins it: the verifier reads a template string as an unknown string, which no law can tie to another.
 */
export const scopeToEnd: ScopeToEnd = (recorded, own) =>
  recorded !== undefined &&
  own !== undefined &&
  recorded.startsWith('/sys/fs/cgroup/') &&
  !recorded.includes('/..') &&
  recorded.endsWith('.scope') &&
  own !== recorded &&
  !own.startsWith(recorded + '/');

/** The pids `cgroup.procs` of the cgroup `folder` lists: none where the folder is gone, or unreadable. */
export const scopeLeftIn = (folder: string): number[] => {
  try {
    return fs
      .readFileSync(`${folder}/cgroup.procs`, 'utf8')
      .split('\n')
      .map(Number)
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch {
    return [];
  }
};

/** A scope that still holds a process: its folder under the cgroup mount, and the pids its `cgroup.procs` lists. */
export type ScopeLeft = { folder: string; pids: number[] };

/**
 * The scope `recorded` names that still holds a process other than `spared`, to end; `undefined` where none is recorded, `scopeToEnd`
 * does not allow it (no scope, or the one this process runs in or inside, read again now), or it holds nothing else, or is gone.
 * `spared` is a detached run's worker that has written its end, which exits on its own within its stop grace: it holds nothing back.
 */
export const scopeLeft = (recorded: string | undefined, spared?: number): ScopeLeft | undefined => {
  if (recorded === undefined || !scopeToEnd(recorded, cgroupNow('self'))) return undefined;
  const pids = scopeLeftIn(recorded).filter((pid) => pid !== spared);
  return pids.length > 0 ? { folder: recorded, pids } : undefined;
};

/**
 * Ends what is left in the cgroup `folder`, and answers the pids it found there: `SIGTERM` to each of them but `spared`; `SIGKILL` by
 * writing `1` to its `cgroup.kill` (Linux 5.14 and later; the file opened, never made), which the kernel applies to every process of
 * the cgroup and its descendants at once, a process forked meanwhile included, or, where that file is missing or refuses the write,
 * `SIGKILL` to each. A pid gone between the read and the signal is no error. Only for a folder `scopeToEnd` allows.
 */
export const endScopeIn = (folder: string, signal: 'SIGTERM' | 'SIGKILL', spared?: number): number[] => {
  const pids = scopeLeftIn(folder);
  if (pids.length === 0) return pids;
  if (signal === 'SIGKILL') {
    try {
      fs.writeFileSync(`${folder}/cgroup.kill`, '1', { flag: 'r+' });
      return pids;
    } catch {}
  }
  for (const pid of pids) {
    if (signal === 'SIGTERM' && pid === spared) continue;
    try {
      process.kill(pid, signal);
    } catch {}
  }
  return pids;
};
