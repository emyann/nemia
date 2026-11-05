/**
 * The scope a spawn asks for, read off its request's memory limit: the bytes its cgroup holds and the argv its process is put behind
 * (`scopeArgv`), or the words that say what to set where it cannot be held — a quantity unread, or a host that makes no scope
 * (`scopeRefusal`). Asked by the detached runner's spawn and the attached holder's, each before it writes a run file.
 */
import { scopeArgv, scopeRefusal } from './cgroup.ts';
import { memoryBytesOf, memoryQuantityRefusal } from '../core/memory.ts';
import type { SpawnRequest } from './seam.ts';

/**
 * Where a limited run's scope is made: the slice (`EngineOptions.cgroupParent`), the user manager's own when absent, and the program
 * that makes it, `systemd-run` when absent (a test stands one in that refuses, `false`).
 */
export type ScopeAt = { cgroupParent?: string | undefined; scopeProgram?: string | undefined };

/** A spawn's scope: its limit in bytes and the argv before its command, or why it cannot be held; `undefined` with no limit. */
export const scopeFor = (r: SpawnRequest, at: ScopeAt): { memoryLimit: number; argv: string[] } | { refused: string } | undefined => {
  const memory = r.resources?.limits?.memory;
  if (memory === undefined) return undefined;
  const bytes = memoryBytesOf(memory);
  if (bytes === undefined) return { refused: `\`resources.limits.memory\`: ${memoryQuantityRefusal(memory) ?? 'unread'}` };
  const refused = scopeRefusal(at.cgroupParent, at.scopeProgram);
  return refused === undefined ? { memoryLimit: bytes, argv: scopeArgv(bytes, at.cgroupParent, at.scopeProgram) } : { refused };
};
