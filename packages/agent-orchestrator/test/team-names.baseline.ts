/**
 * The team's debt in the product, file by file, held by the team's two rules of `words.test.ts`: each product file that names an agent
 * of the nemia factory's team (the agents of `packages/templates/sdlc/agents/` and `FORMER_TEAM`) or the owner's factory today
 * (`TEAM_NAMES`), and each that names a path into one of the team's workflows (`TEAM_PATHS`), with its count and the move that clears it
 * (`TEAM_MOVES`). The counts only shrink: a change that takes a name or a path out of a file lowers its entry in the same commit, and the
 * entry goes once its file is clean.
 */
import type { Baseline } from './words.test.ts';

/**
 * The agents that left the team, whose names stay out of the product all the same: no file of sdlc names them, so they are held here,
 * in a file the team's rules do not read.
 */
export const FORMER_TEAM: readonly string[] = ['ada'];

/** The moves that clear the team's debt, each with where it goes: the later cards of decision 5. */
const TEAM_MOVES = {
  fixtures: {
    move: "a product test's fixture or comment that names the team's agent, factory or workflow",
    to: "the tests' team (test/fixtures/team): the agents implementer, reviewer and shipper, the workflow dev, the factory acme",
  },
  teamTests: {
    move: "a test of the team's own files: its agents' fences",
    to: 'packages/templates/test, beside sdlc, where the tests of its scripts and fences already are',
  },
} as const;

/** Each product file that names an agent of the team or the owner's factory today, with its count and the move that clears it. */
export const TEAM_NAMES: Baseline = {
  'apps/api/src/agents/fills.test.ts': { count: 28, ...TEAM_MOVES.fixtures },
  'apps/api/src/runs/hired-folder.test.ts': { count: 3, ...TEAM_MOVES.fixtures },
  'apps/api/src/factories/factories.test.ts': { count: 18, ...TEAM_MOVES.fixtures },
  'apps/api/src/factories/hires.test.ts': { count: 7, ...TEAM_MOVES.fixtures },
  'apps/api/src/runs/unreadable.test.ts': { count: 4, ...TEAM_MOVES.fixtures },
  'apps/api/src/stats/stats.test.ts': { count: 4, ...TEAM_MOVES.fixtures },
  'apps/api/src/step/step.test.ts': { count: 21, ...TEAM_MOVES.fixtures },
  'apps/api/test/subscriptions.test.ts': { count: 2, ...TEAM_MOVES.fixtures },
  'apps/web/test/bar.test.ts': { count: 3, ...TEAM_MOVES.fixtures },
  'apps/web/test/builder.test.ts': { count: 4, ...TEAM_MOVES.fixtures },
  'apps/web/test/components.test.ts': { count: 56, ...TEAM_MOVES.fixtures },
  'apps/web/test/e2e/pages/475-step-hire.ts': { count: 1, ...TEAM_MOVES.fixtures },
  'apps/web/test/e2e/seed.ts': { count: 1, ...TEAM_MOVES.fixtures },
  'apps/web/test/factories.test.ts': { count: 21, ...TEAM_MOVES.fixtures },
  'apps/web/test/factory-fixtures.ts': { count: 2, ...TEAM_MOVES.fixtures },
  'apps/web/test/library-fixtures.ts': { count: 7, ...TEAM_MOVES.fixtures },
  'apps/web/test/placed.test.ts': { count: 6, ...TEAM_MOVES.fixtures },
  'apps/web/test/read-library.test.ts': { count: 4, ...TEAM_MOVES.fixtures },
  'apps/web/test/step-card.test.ts': { count: 3, ...TEAM_MOVES.fixtures },
  'apps/web/test/strip.test.ts': { count: 20, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/admission/admission.test.ts': { count: 10, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/cli/watch.test.ts': { count: 8, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/command/command.test.ts': { count: 8, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/daemon/daemon.store.test.ts': { count: 1, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/disk/disk.test.ts': { count: 17, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/disk/disk.verb.test.ts': { count: 34, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/factory/factory.model.test.ts': { count: 16, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/factory/factory.store.test.ts': { count: 127, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/factory/factory.test.ts': { count: 80, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/factory/instruction.store.test.ts': { count: 29, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/feed/closeout-logged.test.ts': { count: 2, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/feed/feed.test.ts': { count: 5, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/filed/filed.test.ts': { count: 1, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/inbox/inbox.model.test.ts': { count: 1, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/inbox/inbox.store.test.ts': { count: 11, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/inbox/inbox.test.ts': { count: 27, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/level/level.store.test.ts': { count: 8, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/level/level.test.ts': { count: 13, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/meter/step.test.ts': { count: 8, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/nemia/nemia.test.ts': { count: 1, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/roster/fills.store.test.ts': { count: 23, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/rules/rules.store.test.ts': { count: 13, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/rules/rules.test.ts': { count: 7, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/runlist/runlist.test.ts': { count: 1, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/runlist/runlist.verb.test.ts': { count: 3, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/series/series.test.ts': { count: 1, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/servers/servers.test.ts': { count: 9, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/stats/marks.test.ts': { count: 5, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/subscription/subscription.store.test.ts': { count: 1, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/subscription/subscription.verb.test.ts': { count: 2, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/summary/reads.verb.test.ts': { count: 7, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/summary/summary.verb.test.ts': { count: 5, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/telemetry/telemetry.test.ts': { count: 1, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/trust/trust.test.ts': { count: 3, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/watch/selector.test.ts': { count: 26, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/workflow/unallowed.test.ts': { count: 23, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/test/agent-fences.test.ts': { count: 4, ...TEAM_MOVES.teamTests },
  'packages/agent-orchestrator/test/assess-endings.test.ts': { count: 7, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/test/auto-rules.test.ts': { count: 7, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/test/decide.test.ts': { count: 3, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/test/factory-rules.test.ts': { count: 53, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/test/factory-start.test.ts': { count: 129, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/test/fixtures/former-frontmatter/build-implement.md': { count: 1, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/test/fixtures/former-frontmatter/build-land.md': { count: 1, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/test/fixtures/former-frontmatter/janitor-argus.md': { count: 2, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/test/fixtures/former-frontmatter/quick-implement.md': { count: 1, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/test/fixtures/former-frontmatter/quick-land.md': { count: 1, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/test/nemia-keeper.test.ts': { count: 41, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/test/stats.test.ts': { count: 5, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/test/subscription-wakes.test.ts': { count: 5, ...TEAM_MOVES.fixtures },
  'packages/agent-runtime/src/harness/settings.test.ts': { count: 1, ...TEAM_MOVES.fixtures },
  'packages/agent-runtime/test/reader-streams.ts': { count: 2, ...TEAM_MOVES.fixtures },
};

/** Each product file that names a path into one of the team's workflows today, with its count and the move that clears it. */
export const TEAM_PATHS: Baseline = {
  'apps/api/src/runs/hired-folder.test.ts': { count: 1, ...TEAM_MOVES.fixtures },
  'apps/api/src/stats/stats.test.ts': { count: 1, ...TEAM_MOVES.fixtures },
  'apps/api/src/step/step.test.ts': { count: 7, ...TEAM_MOVES.fixtures },
  'apps/web/test/library-fixtures.ts': { count: 2, ...TEAM_MOVES.fixtures },
  'apps/web/test/read.test.ts': { count: 1, ...TEAM_MOVES.fixtures },
  'apps/web/test/run-fixtures.ts': { count: 1, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/factory/factory.store.test.ts': { count: 2, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/frontmatter/frontmatter.verb.test.ts': { count: 3, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/meter/step.test.ts': { count: 1, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/stats/stats-memo.test.ts': { count: 1, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/src/summary/reads.verb.test.ts': { count: 1, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/test/factory-start.test.ts': { count: 2, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/test/fixtures/former-frontmatter/build-implement.md': { count: 8, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/test/fixtures/former-frontmatter/build-land.md': { count: 2, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/test/fixtures/former-frontmatter/janitor-argus.md': { count: 2, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/test/fixtures/former-frontmatter/quick-implement.md': { count: 10, ...TEAM_MOVES.fixtures },
  'packages/agent-orchestrator/test/fixtures/former-frontmatter/quick-land.md': { count: 2, ...TEAM_MOVES.fixtures },
  'packages/agent-runtime/test/live-sdk.boundary.test.ts': { count: 1, ...TEAM_MOVES.fixtures },
};
