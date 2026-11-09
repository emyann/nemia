/**
 * What memory a Claude Code session the runtime starts is given, for every one of them. Auto-memory off: Claude Code resolves a
 * session's auto-memory from the folder it runs in, so a session in a worktree of a person's checkout is handed that person's
 * `MEMORY.md` and told in its system prompt that it may write there: consents, standing permissions and taste decisions that are the
 * person's and none of the session's. And no dependency's `CLAUDE.md`: Claude Code attaches the `CLAUDE.md` of each folder a session
 * reads into, `node_modules` included, and a package's own contributor guide (`node_modules/effect/CLAUDE.md`, 5.1k tokens) is
 * nobody's instruction to the session. The settings that say both (`AUTO_MEMORY_OFF`, `DEPENDENCY_CLAUDE_MD`), merged into the
 * settings a task gives, as an object for the Agent SDK (`memorylessSettings`).
 */
import { settingsObject } from './vocabulary.ts';

/**
 * Claude Code's setting that reads and writes no auto-memory: no `MEMORY.md` in the session's first request, and no `# Memory`
 * section in its system prompt.
 */
const AUTO_MEMORY_OFF: Readonly<Record<string, boolean>> = { autoMemoryEnabled: false };

/**
 * The `CLAUDE.md` files no session loads, as Claude Code's `claudeMdExcludes` takes them (`sdk.d.ts:9603`): picomatch globs matched
 * against a file's absolute path, here every `CLAUDE.md` under a `node_modules`, at any depth. Measured on Claude Code 2.1.308
 * (`test/live.test.ts`): a session that reads under `node_modules/<dep>/` gets no `nested_memory` attachment for its `CLAUDE.md`, while
 * one beside it outside `node_modules` is attached.
 */
const DEPENDENCY_CLAUDE_MD: readonly string[] = ['**/node_modules/**/CLAUDE.md'];

/**
 * The globs of `claudeMdExcludes` a task's own settings give, kept whole; refused, saying what to write, where they are not a list of
 * strings, since the runtime's own glob is added to that list and Claude Code takes nothing else there.
 */
const ownExcludes = (read: Record<string, unknown>): string[] => {
  const own = read.claudeMdExcludes;
  if (own === undefined) return [];
  if (Array.isArray(own) && own.every((g) => typeof g === 'string')) return own;
  throw new Error(
    `\`config.claude.settings\` gives \`claudeMdExcludes\` as ${JSON.stringify(own)}, and Claude Code takes a list of globs there, to which the runtime adds ${JSON.stringify(DEPENDENCY_CLAUDE_MD)}. Write it as a list of strings, such as ["**/vendor/**/CLAUDE.md"], or leave it out.`,
  );
};

/**
 * `settings`, as JSON or absent, with auto-memory off laid over them and every dependency's `CLAUDE.md` added to the excludes they
 * give, keeping every other key they hold (throws for excludes that are no list, `ownExcludes`); `undefined` for settings given as a
 * file's path, which the runtime does not rewrite: such a session keeps its auto-memory and its dependencies' `CLAUDE.md`.
 */
export const memorylessSettings = (settings: string | undefined): Record<string, unknown> | undefined => {
  const read = settingsObject(settings ?? '{}');
  if (read === undefined) return undefined;
  const own = ownExcludes(read);
  return {
    ...read,
    ...AUTO_MEMORY_OFF,
    claudeMdExcludes: [...own, ...DEPENDENCY_CLAUDE_MD.filter((g) => !own.includes(g))],
  };
};
