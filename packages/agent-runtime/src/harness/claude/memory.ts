/**
 * Auto-memory off for every Claude Code session the runtime starts. Claude Code resolves a session's auto-memory from the folder it
 * runs in, so a session in a worktree of a person's checkout is handed that person's `MEMORY.md` and told in its system prompt that
 * it may write there: consents, standing permissions and taste decisions that are the person's and none of the session's. The
 * setting that turns it off (`AUTO_MEMORY_OFF`), merged into the settings a task gives, as an object for the Agent SDK
 * (`memorylessSettings`).
 */
import { settingsObject } from './vocabulary.ts';

/**
 * Claude Code's setting that reads and writes no auto-memory: no `MEMORY.md` in the session's first request, and no `# Memory`
 * section in its system prompt.
 */
export const AUTO_MEMORY_OFF: Readonly<Record<string, boolean>> = { autoMemoryEnabled: false };

/**
 * `settings`, as JSON or absent, with auto-memory off laid over them, keeping every key they hold; `undefined` for settings given as
 * a file's path, which the runtime does not rewrite: such a session keeps its auto-memory.
 */
export const memorylessSettings = (settings: string | undefined): Record<string, unknown> | undefined => {
  const read = settingsObject(settings ?? '{}');
  return read === undefined ? undefined : { ...read, ...AUTO_MEMORY_OFF };
};
