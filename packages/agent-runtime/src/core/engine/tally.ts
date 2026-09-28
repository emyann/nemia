/**
 * What the runtime's own reads and spawns have cost this process, as running totals: bytes read, read calls, and processes
 * started. A fact the runtime reports (`Engine.io()`), never one it decides on: nothing in `decide` or the loop reads it.
 *
 * Counted where the runtime reads a file or starts a process through its own code — a journal, the feed, a detached run's
 * files, a transcript, `sh`, a worker — and nowhere else: a thin wrapper, not a syscall tracer. What a child process reads
 * (`claude agents`, git) is not in it, nor a pipe's bytes. Per process, not per engine: two engines in one process count
 * into one tally, which a reader of the totals takes differences of.
 */
import fs from 'node:fs';

/** The running totals: bytes read and read calls through the runtime's readers, and processes it started. */
export type IoCounts = { bytesRead: number; reads: number; spawned: number };

const counts: IoCounts = { bytesRead: 0, reads: 0, spawned: 0 };

/** The totals as they stand: a copy, so a caller can take a difference. */
export const ioCounts = (): IoCounts => ({ ...counts });

/** One read of `bytes`, made by a reader of the runtime's that did not go through `readText`. */
export const countRead = (bytes: number): void => {
  counts.reads++;
  counts.bytesRead += bytes;
};

/** One process started. */
export const countSpawn = (): void => {
  counts.spawned++;
};

/** `fs.readFileSync(file, 'utf8')`, counted: throws as it does. */
export const readText = (file: string): string => {
  const buf = fs.readFileSync(file);
  countRead(buf.length);
  return buf.toString('utf8');
};

/** `fs.promises.readFile(file, 'utf8')`, counted: rejects as it does. */
export const readTextAsync = async (file: string): Promise<string> => {
  const buf = await fs.promises.readFile(file);
  countRead(buf.length);
  return buf.toString('utf8');
};
