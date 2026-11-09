/** Whether a process is there, asked of the process table. A bottom store: it imports no store file. */

/** Whether `pid` is a live process on this host: a signal 0 delivered, or refused for want of permission, which still means it is there. */
export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}
