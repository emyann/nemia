import fs from 'node:fs';
import { processStart } from './alive.ts';

/** What the kernel appends to a link under `/proc` whose folder was removed while the process held it. */
const DELETED = ' (deleted)';

/**
 * One process of this user as `/proc` gave it: its pid and its start (`processStart`, what names it against a pid taken since), its
 * command's name, its working folder where it could be read (without the kernel's ` (deleted)`) and whether that folder was removed
 * under it, and the variables asked for that its environment holds, as it was started with them.
 */
export type ProcessNow = {
  readonly pid: number;
  readonly start: string;
  readonly name: string;
  readonly cwd: string | undefined;
  readonly cwdDeleted: boolean;
  readonly env: Readonly<Record<string, string>>;
};

/** The variables of `environ` (NUL-separated `NAME=value`) named in `wanted`, the first of each. */
const environOf = (environ: string, wanted: ReadonlySet<string>): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const entry of environ.split('\0')) {
    const at = entry.indexOf('=');
    if (at <= 0) continue;
    const name = entry.slice(0, at);
    if (wanted.has(name) && !Object.hasOwn(env, name)) env[name] = entry.slice(at + 1);
  }
  return env;
};

/** One pid's process as `/proc` reads it now, or `undefined` where it is gone, another user's or unreadable mid-read. */
const processOf = (pid: number, uid: number, wanted: ReadonlySet<string>): ProcessNow | undefined => {
  try {
    if (fs.statSync(`/proc/${pid}`).uid !== uid) return undefined;
    const start = processStart(pid);
    if (start === undefined) return undefined;
    const name = fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trimEnd();
    const env = environOf(fs.readFileSync(`/proc/${pid}/environ`, 'utf8'), wanted);
    let cwd: string | undefined;
    let cwdDeleted = false;
    try {
      const link = fs.readlinkSync(`/proc/${pid}/cwd`);
      cwdDeleted = link.endsWith(DELETED);
      cwd = cwdDeleted ? link.slice(0, -DELETED.length) : link;
    } catch {
      cwd = undefined;
    }
    return { pid, start, name, cwd, cwdDeleted, env };
  } catch {
    return undefined;
  }
};

/**
 * This user's processes as `/proc` reads them now, each with the variables of `variables` its environment holds. A process gone or
 * unreadable mid-read is skipped, never an error; where there is no `/proc` (off Linux) there is none. A kernel thread has no
 * environment and is another user's (root's), so it is never listed.
 */
export const processesNow = (variables: readonly string[]): ProcessNow[] => {
  const uid = process.getuid?.();
  if (uid === undefined) return [];
  let entries: string[];
  try {
    entries = fs.readdirSync('/proc');
  } catch {
    return [];
  }
  const wanted = new Set(variables);
  const found: ProcessNow[] = [];
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    const read = processOf(Number(entry), uid, wanted);
    if (read !== undefined) found.push(read);
  }
  return found;
};

/** A process named by its pid and its start, as `processesNow` read it. */
export type ProcessToEnd = { readonly pid: number; readonly start: string };

/**
 * Sends `signal` to each process whose start still matches what was read: a pid another process has taken since is left alone. Answers
 * the pids signalled; one gone in between, or refused the signal, is not among them.
 */
export const endProcesses = (processes: readonly ProcessToEnd[], signal: 'SIGTERM' | 'SIGKILL'): number[] => {
  const signalled: number[] = [];
  for (const p of processes) {
    if (processStart(p.pid) !== p.start) continue;
    try {
      process.kill(p.pid, signal);
      signalled.push(p.pid);
    } catch {}
  }
  return signalled;
};
