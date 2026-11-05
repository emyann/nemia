/**
 * A command's termination message, read as the kubelet reads a container's `terminationMessagePath`: once, when its process exits.
 * Imports node's `fs` alone, as the worker (`bin/ae-worker.ts`) that reads it does.
 */
import fs from 'node:fs';

/** The most of a termination message kept: a longer file keeps its first this many bytes, as Kubernetes' 4096. */
export const TERMINATION_MESSAGE_BYTES = 4096;

/**
 * The text of the file at `file`, its first `TERMINATION_MESSAGE_BYTES` bytes — or `undefined` where it is missing or no regular
 * file. Opened without blocking, so a FIFO left there never holds the worker.
 */
export const terminationMessageAt = (file: string): string | undefined => {
  let fd: number;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
  } catch {
    return undefined;
  }
  try {
    if (!fs.fstatSync(fd).isFile()) return undefined;
    const buf = Buffer.alloc(TERMINATION_MESSAGE_BYTES);
    let got = 0;
    while (got < buf.length) {
      const n = fs.readSync(fd, buf, got, buf.length - got, got);
      if (n === 0) break;
      got += n;
    }
    return buf.subarray(0, got).toString('utf8');
  } catch {
    return undefined;
  } finally {
    fs.closeSync(fd);
  }
};
