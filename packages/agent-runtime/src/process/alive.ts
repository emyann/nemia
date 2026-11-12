import fs from 'node:fs';

/**
 * Whether the process `pid` is there, as signal 0 finds it: it reaches the process, or the process is another user's (`EPERM`), which
 * is there too. `ESRCH`, or any other refusal of the signal, reads as gone. The runtime's one reading: a leaf every folder may import.
 */
export const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
};

/**
 * When a process started, as `/proc/<pid>/stat` counts it (its 22nd field): what a run file names a process by, a holder, its Claude
 * Code, a detached run's worker and its harness, so a pid another process has taken since is not read as it. `undefined` where there
 * is no `/proc`. The second field is the command's name in parentheses, which may hold spaces and parentheses, so the fields are counted
 * from the last `)`. Imports nothing but node's own, as `alive` does: `bin/ae-worker.ts` reads it, and stays dependency-free.
 */
export const processStart = (pid: number): string | undefined => {
  let stat: string;
  try {
    stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  } catch {
    return undefined;
  }
  return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
};
