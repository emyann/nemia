/**
 * What the runtime's own reads, writes and spawns have cost this process, as running totals: bytes read, read calls, and processes
 * started. A fact the runtime reports (`Engine.io()`), never one it decides on: nothing in `decide` or the loop reads it.
 *
 * Counted where the runtime reads a file or starts a process through its own code — a journal, the feed, a detached run's
 * files, a transcript, `sh`, a worker — and nowhere else: a thin wrapper, not a syscall tracer. What a child process reads
 * (`claude agents`, git) is not in it, nor a pipe's bytes. Per process, not per engine: two engines in one process count
 * into one tally, which a reader of the totals takes differences of. A caller that wants its own counts apart from another's in
 * the same process runs in a tally of its own (`tallied`): each count goes to the process's totals and to every tally open in the
 * async context that made it, never to one open beside it.
 */
import fs from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The running totals: bytes read and read calls through the runtime's readers, and processes it started; the store's writes to a
 * journal or the feed (`writes`, an append or a rename each), the times it took the feed's lock (`locks`) and the milliseconds it
 * waited for it (`lockWaitMs`).
 */
export type IoCounts = { bytesRead: number; reads: number; spawned: number; writes: number; locks: number; lockWaitMs: number };

/** Nothing counted yet. */
export const noCounts = (): IoCounts => ({ bytesRead: 0, reads: 0, spawned: 0, writes: 0, locks: 0, lockWaitMs: 0 });

const counts: IoCounts = noCounts();

/**
 * One harness's observes, counted: how many were made, their wall time in ms, the sessions or run files they listed, and the processes
 * started while they ran (`claude agents` for Claude Code's background sessions; none for a directory of run files). The harnesses of a
 * pass observe at once, so their `ms` can add up to more than the pass's, and a process another harness started in the same moment is
 * counted in both. `unread` is how many of the observes could not read all they were to: one that failed, or one that left an
 * expected name unread (`Observation`) — a harness that keeps failing shows there, where the pass waits on it rather than reading its
 * sessions gone.
 */
export type ObserveCount = { calls: number; ms: number; listed: number; spawned: number; unread: number };

/** A tally of one caller's, apart from the process's: the counts made in its async context, and each harness's observes made there. */
export type Tally = { counts: IoCounts; observed: Record<string, ObserveCount> };

const open = new AsyncLocalStorage<readonly Tally[]>();

/** The tallies open where this runs, the outermost first: none outside every `tallied`. */
export const talliesHere = (): readonly Tally[] => open.getStore() ?? [];

/** `f` run with `tally` open, inside every tally already open where it is called: what it and all it starts count goes to each. */
export const tallied = <T>(tally: Tally, f: () => T): T => open.run([...talliesHere(), tally], f);

/** The counts as they stand where this runs: the innermost tally's open here, else the process's; the live object, never a copy. */
export const countsHere = (): IoCounts => talliesHere().at(-1)?.counts ?? counts;

/** `add` applied to the process's totals and to each tally open here. */
const count = (add: (c: IoCounts) => void) => {
  add(counts);
  for (const t of talliesHere()) add(t.counts);
};

/** The totals as they stand: a copy, so a caller can take a difference. */
export const ioCounts = (): IoCounts => ({ ...counts });

/** One read of `bytes`, made by a reader of the runtime's that did not go through `readText`. */
export const countRead = (bytes: number): void =>
  count((c) => {
    c.reads++;
    c.bytesRead += bytes;
  });

/** One write of the store's to a journal or the feed: an append, or a rename into place. */
export const countWrite = (): void =>
  count((c) => {
    c.writes++;
  });

/** The feed's lock taken once, after `waitedMs` milliseconds of waiting for it. */
export const countLock = (waitedMs: number): void =>
  count((c) => {
    c.locks++;
    c.lockWaitMs += waitedMs;
  });

/** One process started. */
export const countSpawn = (): void =>
  count((c) => {
    c.spawned++;
  });

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
