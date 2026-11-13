/**
 * The scope a spawn asks for (`cgroup.ts`): every local session runs in a scope of its own where the host makes one, so whatever its
 * commands start is ended with it, and under a memory limit that scope holds the limit too. Read off its request's memory limit: the
 * bytes its cgroup holds, where it has one, and the argv its process is put behind (`scopeArgv`), or the words that say what to set
 * where a limit cannot be held — a quantity unread, or a host that makes no scope (`scopeRefusal`). Asked by the detached runner's spawn
 * and the attached holder's, each before it writes a run file.
 */
import { scopeArgv, scopeRefusal } from './cgroup.ts';
import { memoryBytesOf, memoryQuantityRefusal } from '../core/memory.ts';
import type { SpawnRequest } from './seam.ts';

/**
 * Where a run's scope is made: the slice (`EngineOptions.cgroupParent`), the user manager's own when absent, and the program that
 * makes it, `systemd-run` when absent (a test stands one in that refuses, `false`).
 */
export type ScopeAt = { cgroupParent?: string | undefined; scopeProgram?: string | undefined };

/**
 * A spawn's scope: under a limit, its bytes and the argv before its command, or why it cannot be held; with none, the argv alone where
 * the host makes a scope (the probe, `scopeRefusal`, passes), and `undefined` where it does not, so the session runs bare as it did
 * before scopes, never refused for it.
 */
export const scopeFor = (r: SpawnRequest, at: ScopeAt): { memoryLimit?: number; argv: string[] } | { refused: string } | undefined => {
  const memory = r.resources?.limits?.memory;
  const refused = () => scopeRefusal(at.cgroupParent, at.scopeProgram);
  if (memory === undefined) return refused() === undefined ? { argv: scopeArgv(undefined, at.cgroupParent, at.scopeProgram) } : undefined;
  const bytes = memoryBytesOf(memory);
  if (bytes === undefined) return { refused: `\`resources.limits.memory\`: ${memoryQuantityRefusal(memory) ?? 'unread'}` };
  const words = refused();
  return words === undefined ? { memoryLimit: bytes, argv: scopeArgv(bytes, at.cgroupParent, at.scopeProgram) } : { refused: words };
};
