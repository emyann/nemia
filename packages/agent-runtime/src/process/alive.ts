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
