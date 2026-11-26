/**
 * A factory's radius for the decider's tests, as a team might set it: the lists `nemia decide` flags files by, which the core names none
 * of, and a run placed in a factory that sets them.
 */
import { createFactoryAt, rewriteRun, runRecord } from '../testing.ts';

/** The lists of a factory's `radius`: agent-facing, check-affecting and lesson globs. */
export const RADIUS = {
  agentFacing: ['**/CLAUDE.md', '**/AGENTS.md', '**/.claude/', '**/.codex/', '**/.mcp.json', '**/README.md'],
  checkAffecting: ['**/package.json', '**/package-lock.json', '**/tsconfig*.json', '**/.oxlintrc.json', '**/*.test.*', '**/test/'],
  lessons: ['**/CLAUDE.md', '**/AGENTS.md', 'docs/', 'packages/*/docs/', 'apps/*/docs/'],
};

/**
 * Run `id`, which the store at `root` holds, filed in a factory of its own that sets `RADIUS`: what its decision flags is that factory's.
 * @param root The store's root folder.
 * @param id The run's id.
 */
export const inRadiusFactory = (root: string, id: string) => {
  createFactoryAt(root, { name: `team-${id}`, volumes: [], workflows: [], hires: {}, schedules: {}, radius: RADIUS });
  const filed = { ...runRecord(root, id), factory: `team-${id}` };
  rewriteRun(root, filed);
  return filed;
};
