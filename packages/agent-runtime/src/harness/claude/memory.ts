/**
 * What memory a Claude Code session the runtime starts is given, for every one of them. Auto-memory off: Claude Code resolves a
 * session's auto-memory from the folder it runs in, so a session in a worktree of a person's checkout is handed that person's
 * `MEMORY.md` and told in its system prompt that it may write there: consents, standing permissions and taste decisions that are the
 * person's and none of the session's. The `CLAUDE.md` files a session reads are Claude Code's default, a dependency's under
 * `node_modules` included: the runtime adds no `claudeMdExcludes` of its own, and passes on whole those a task's settings give, refused
 * where they are no list of globs. The setting that says it (`AUTO_MEMORY_OFF`), merged into the settings a task gives, as an object
 * for the Agent SDK (`memorylessSettings`).
 */
import { settingsObject } from './vocabulary.ts';

/**
 * Claude Code's setting that reads and writes no auto-memory: no `MEMORY.md` in the session's first request, and no `# Memory`
 * section in its system prompt.
 */
const AUTO_MEMORY_OFF: Readonly<Record<string, boolean>> = { autoMemoryEnabled: false };

/**
 * Refuses, saying what to write, the `claudeMdExcludes` a task's own settings give where they are not a list of strings: Claude Code
 * takes picomatch globs there (`sdk.d.ts:9957`) and nothing else.
 * @param read The task's settings, as an object.
 */
const checkExcludes = (read: Record<string, unknown>): void => {
  const own = read.claudeMdExcludes;
  if (own === undefined || (Array.isArray(own) && own.every((g) => typeof g === 'string'))) return;
  throw new Error(
    `\`config.claude.settings\` gives \`claudeMdExcludes\` as ${JSON.stringify(own)}, and Claude Code takes a list of globs there. Write it as a list of strings, such as ["**/vendor/**/CLAUDE.md"], or leave it out.`,
  );
};

/**
 * `settings`, as JSON or absent, with auto-memory off laid over them, keeping every other key they hold, their `claudeMdExcludes`
 * whole (throws for excludes that are no list, `checkExcludes`); `undefined` for settings given as a file's path, which the runtime
 * does not rewrite: such a session keeps its auto-memory.
 * @param settings The task's Claude Code settings, as JSON or a file's path; absent, none of its own.
 */
export const memorylessSettings = (settings: string | undefined): Record<string, unknown> | undefined => {
  const read = settingsObject(settings ?? '{}');
  if (read === undefined) return undefined;
  checkExcludes(read);
  return { ...read, ...AUTO_MEMORY_OFF };
};
