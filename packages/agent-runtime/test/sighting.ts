/** A `--bg` session's transcript as its runner has seen it, for a test that drives quiet through the engine. */
import { getSessionInfo } from '@anthropic-ai/claude-agent-sdk';
import { monoNow } from '../src/core/engine/now.ts';
import { quietFileOf, sightingOf } from '../src/harness/claude/quiet.ts';

/**
 * Records that the runner under `root` first saw the transcript of `sessionId`, listed under `name`, at its current mtime `ms` ago on
 * the monotonic clock of this boot: a session cold for `ms` that a runner has watched all along. Records nothing on a machine with no
 * boot id, where quiet is the wall clock's alone. Refuses a session with no transcript: write it first.
 */
export const seenFor = async (root: string, name: string, sessionId: string, ms: number): Promise<void> => {
  const mtimeMs = (await getSessionInfo(sessionId))?.lastModified;
  if (mtimeMs === undefined) throw new Error(`no transcript for ${sessionId}: write it before saying the runner saw it`);
  const now = monoNow();
  if (now) sightingOf(quietFileOf(root, name), mtimeMs, { boot: now.boot, ms: now.ms - ms });
};
