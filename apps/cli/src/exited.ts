/**
 * How a bin ends: with `code`, once what it printed has left the process. `process.exit` drops what still waits for a pipe on stdout
 * or stderr (a pipe holds 64 KiB, a file is written at once), so each stream is asked to call back once everything queued before it
 * is written, and the process exits on the last. A reader gone (`nemia ls | head -1`) ends the wait too, its broken pipe swallowed: there
 * is no one left to tell.
 */
export function exited(code: number): void {
  process.exitCode = code;
  const streams = [process.stdout, process.stderr];
  let left = streams.length;
  const done = () => {
    left -= 1;
    if (left === 0) process.exit(code);
  };
  for (const stream of streams) {
    stream.on('error', () => {});
    stream.write('', () => done());
  }
}
