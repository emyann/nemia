/**
 * The machine's one render slot: a file under the system's temp directory that names who holds it — the process, its container and,
 * for a stack held up for a browser, when it ends. A render is heavy, so a second one waits for the first, bounded, and is refused
 * with the holder's name when its wait ends.
 *
 * One writer at a time, the holder. A lock whose process is gone is stale: the next render removes the container it names, by that
 * name, and takes the slot. `NEMIA_RENDER_LOCK` names another file, for a test.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { NAME, refusal, remove, sleep } from './stack.ts';

/** Who holds the slot: a render in flight (`pid` the command's), or a held stack (`pid` its reaper's, `until` when it ends). */
export type Lock = { pid: number; name: string; held?: boolean; until?: string };

/** The command a person or a step stops a held stack with. */
export const stopCommand = (name: string): string => `node tools/observe/render/render.ts --stop ${name}`;

/** Where the lock is. */
export const lockFile = (): string => process.env.NEMIA_RENDER_LOCK || path.join(os.tmpdir(), 'nemia-render.lock');

/** The lock the file at `file` holds, or undefined when there is none or it does not read. */
function lockAt(file: string): Lock | undefined {
  try {
    const lock = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<Lock>;
    return typeof lock.pid === 'number' && typeof lock.name === 'string' ? (lock as Lock) : undefined;
  } catch {
    return undefined;
  }
}

/** The lock as it is on disk, or undefined when there is none or it does not read. */
export const locked = (): Lock | undefined => lockAt(lockFile());

/** Whether a process `pid` is there, one of another user's included. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Who holds the slot, said for a person: the container, the process, and for a held stack when it ends and how to stop it. */
const holderOf = (lock: Lock): string =>
  lock.held
    ? `${lock.name}, a stack held up until ${lock.until ?? 'its bound'} (stop it with \`${stopCommand(lock.name)}\`)`
    : `${lock.name}, a render in flight (pid ${lock.pid})`;

/**
 * Take a lock no live process holds out of the way: moved aside first, so two renders that both read it stale cannot both drop it,
 * then read where it was moved. One a live process holds, taken between the read and the move, is put back; any other is dropped,
 * and the container it records removed by that name.
 */
function dropStale(): void {
  const aside = `${lockFile()}.stale-${process.pid}`;
  try {
    fs.renameSync(lockFile(), aside);
  } catch {
    return;
  }
  const moved = lockAt(aside);
  try {
    if (moved !== undefined && alive(moved.pid)) fs.linkSync(aside, lockFile());
  } finally {
    fs.rmSync(aside, { force: true });
  }
  if (moved !== undefined && !alive(moved.pid) && NAME.test(moved.name)) remove(moved.name);
}

/**
 * Put the lock there with `text` in it, in one step: written to a file of this process's own and linked to the lock's path, so the
 * lock is never there without its content and another render never reads one half written. False when a lock is there already.
 */
function placed(text: string): boolean {
  const own = `${lockFile()}.own-${process.pid}`;
  fs.writeFileSync(own, text);
  try {
    fs.linkSync(own, lockFile());
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    return false;
  } finally {
    fs.rmSync(own, { force: true });
  }
}

/**
 * Take the slot for the container `name`, waiting up to `waitSeconds` on a monotonic clock for whoever holds it. Refuses, naming the
 * holder and how to wait longer, when the wait ends with the slot still held.
 */
export async function take(name: string, waitSeconds: number): Promise<void> {
  const began = performance.now();
  const mine = JSON.stringify({ pid: process.pid, name } satisfies Lock);
  for (;;) {
    if (placed(mine)) return;
    const lock = locked();
    if (lock === undefined || !alive(lock.pid)) {
      dropStale();
      continue;
    }
    if (performance.now() - began >= waitSeconds * 1000)
      throw refusal(
        `this machine's one render slot is held by ${holderOf(lock)}, and ${waitSeconds}s of waiting did not free it: ` +
          'run it again when that one has ended, or wait longer with --wait <seconds>',
      );
    await sleep(500);
  }
}

/** Hand the slot of the container `name` to the reaper `pid` of its held stack, which ends at `until`; nothing when another holds it. */
export function handTo(name: string, pid: number, until: Date): void {
  if (locked()?.name !== name) return;
  const next = `${lockFile()}.next-${process.pid}`;
  fs.writeFileSync(next, JSON.stringify({ pid, name, held: true, until: until.toISOString() } satisfies Lock));
  fs.renameSync(next, lockFile());
}

/** Let the slot go, only when it is the container `name` that holds it. */
export function release(name: string): void {
  if (locked()?.name === name) fs.rmSync(lockFile(), { force: true });
}
