/**
 * The debt the two rules of `test-rules.test.ts` open, counted per file, each list only shrinking.
 *
 * `PINNED_WORDS`: every line of a test whose assertion over what the code said — a refusal's `message`, a process's `stderr`, the
 * reason a verb gives — expects a whole sentence, a string or a pattern of 60 characters or more. Root `CLAUDE.md`, *Rules the code
 * keeps*, has said all along that "its words are nobody's to check": such an assertion owns the sentence, so the day a message is
 * made clearer the test fails with nothing about the behaviour changed.
 *
 * 1,263 lines in 244 files, as the sweep reads them the day the rule was written, 801 of them in the orchestrator, which
 * the card that moved the repository's guards took to none: what is left is the runtime's, the api's and the web's. Two shapes
 * are counted: an assertion over what the code said whose subject, read with its literals blanked, names a message, a stderr or a
 * reason; and what an `assert.throws` or an `assert.rejects` expects of the error — its second argument, whose subject is the error
 * by construction, and the most common shape of the two. The card that opened this counted in tests — "at least 412 orchestrator
 * tests pin a whole sentence" — and in that unit this sweep finds 417: the same measure, read by a machine. An assertion over a
 * page's heading, a rendered line or a brief the test wrote itself is not counted for holding the word "refused" inside the
 * sentence it expects.
 *
 * `WAITED_OUT`: every line that floors a measured duration at a bound in milliseconds the shipped code owns, which no pass can run
 * in less than. It is empty, and the rule is what keeps it so: the sites the card named are each shortened at the seam the code
 * gives for them — `remoteOps`'s `requestMs`, `withFeedLock`'s bound, `ClaudeOptions.sayTimeoutMs` — and about 26 s came off every
 * pass of the runtime's suite with them. A later card that adds a bound adds a seam, never a line here.
 *
 * Both only shrink: an assertion unpinned takes its line away, a count cut is lowered here, and a file neither list names holds none
 * at all. The sweep refuses a new file by name, a count that has grown — a new assertion, or a number lowered while the lines are
 * still there — and a count that names more than are there, so a cut is the diff of both files and never of the number alone.
 */

/** Each test file by its path from the repository root, and the lines of it that expect a whole sentence of what the code said. */
export const PINNED_WORDS: Readonly<Record<string, number>> = {
  'apps/api/src/agents/agents.test.ts': 3,
  'apps/api/src/agents/skills.test.ts': 4,
  'apps/api/src/asks/answers.test.ts': 4,
  'apps/api/src/asks/asks.test.ts': 4,
  'apps/api/src/asks/gate.test.ts': 8,
  'apps/api/src/asks/say.test.ts': 2,
  'apps/api/src/capabilities/capabilities.test.ts': 15,
  'apps/api/src/commands/routes.test.ts': 3,
  'apps/api/src/decide/decision.test.ts': 3,
  'apps/api/src/decide/to-decide.test.ts': 1,
  'apps/api/src/factories/factories.test.ts': 1,
  'apps/api/src/factories/hires.test.ts': 4,
  'apps/api/src/factory/feed.test.ts': 5,
  'apps/api/src/factory/passes.test.ts': 1,
  'apps/api/src/factory/quota.test.ts': 1,
  'apps/api/src/factory/series.test.ts': 1,
  'apps/api/src/inbox/inbox.test.ts': 8,
  'apps/api/src/inbox/queue.test.ts': 5,
  'apps/api/src/runs/prune.test.ts': 2,
  'apps/api/src/servers/servers.test.ts': 2,
  'apps/api/src/stats/stats.test.ts': 2,
  'apps/api/src/step/step.test.ts': 1,
  'apps/api/src/steps/path.test.ts': 1,
  'apps/api/src/steps/transcript.test.ts': 7,
  'apps/api/src/workflows/builder.test.ts': 15,
  'apps/api/src/workflows/workflows.test.ts': 11,
  'apps/api/test/app.test.ts': 7,
  'apps/api/test/auto.test.ts': 2,
  'apps/api/test/budget.test.ts': 7,
  'apps/api/test/folder-run.test.ts': 3,
  'apps/api/test/harness.test.ts': 2,
  'apps/api/test/nemia-chat.test.ts': 2,
  'apps/api/test/nemia.test.ts': 1,
  'apps/api/test/pause.test.ts': 2,
  'apps/api/test/remote.test.ts': 2,
  'apps/api/test/scratch.test.ts': 1,
  'apps/api/test/subscriptions.test.ts': 7,
  'apps/api/test/waits.test.ts': 1,
  'apps/docs/test/scratch.test.ts': 1,
  'apps/docs/test/waits.test.ts': 1,
  'apps/web/test/api.test.ts': 6,
  'apps/web/test/asks.test.ts': 3,
  'apps/web/test/builder.test.ts': 1,
  'apps/web/test/chat.test.ts': 3,
  'apps/web/test/components.test.ts': 7,
  'apps/web/test/contrast.test.ts': 1,
  'apps/web/test/conversation.test.ts': 6,
  'apps/web/test/e2e-headline.test.ts': 4,
  'apps/web/test/e2e-instant.test.ts': 3,
  'apps/web/test/e2e-pages.test.ts': 15,
  'apps/web/test/e2e-print.test.ts': 1,
  'apps/web/test/e2e-runs-times.test.ts': 1,
  'apps/web/test/e2e-timing.test.ts': 3,
  'apps/web/test/e2e/checks.test.ts': 15,
  'apps/web/test/e2e/visit.test.ts': 4,
  'apps/web/test/factory.test.ts': 9,
  'apps/web/test/follow.test.ts': 1,
  'apps/web/test/following.test.ts': 4,
  'apps/web/test/inbox.test.ts': 16,
  'apps/web/test/nemia.test.ts': 1,
  'apps/web/test/outcome.test.ts': 3,
  'apps/web/test/pause.test.ts': 3,
  'apps/web/test/read-factory.test.ts': 1,
  'apps/web/test/read-library.test.ts': 1,
  'apps/web/test/read-run.test.ts': 2,
  'apps/web/test/read.test.ts': 2,
  'apps/web/test/run-words.test.ts': 1,
  'apps/web/test/say.test.ts': 4,
  'apps/web/test/scratch.test.ts': 1,
  'apps/web/test/skills.test.ts': 1,
  'apps/web/test/time-of-day.test.ts': 4,
  'apps/web/test/transcript.test.ts': 1,
  'apps/web/test/write.test.ts': 3,
  'packages/agent-runtime/src/a2a/remote-events.test.ts': 1,
  'packages/agent-runtime/src/core/decide.test.ts': 2,
  'packages/agent-runtime/src/core/engine/bodies.test.ts': 1,
  'packages/agent-runtime/src/core/engine/journal.test.ts': 5,
  'packages/agent-runtime/src/core/lifecycle.test.ts': 1,
  'packages/agent-runtime/src/core/long-lived.test.ts': 2,
  'packages/agent-runtime/src/harness/claude/attached-bridge.test.ts': 2,
  'packages/agent-runtime/src/harness/claude/lines.test.ts': 1,
  'packages/agent-runtime/src/harness/codex/stream.test.ts': 3,
  'packages/agent-runtime/src/harness/mcp-state.test.ts': 1,
  'packages/agent-runtime/src/harness/mounts.test.ts': 2,
  'packages/agent-runtime/src/harness/trust.test.ts': 2,
  'packages/agent-runtime/test/a2a-handler.test.ts': 5,
  'packages/agent-runtime/test/a2a.test.ts': 13,
  'packages/agent-runtime/test/admission.test.ts': 1,
  'packages/agent-runtime/test/attached-asks.boundary.test.ts': 2,
  'packages/agent-runtime/test/brief.test.ts': 3,
  'packages/agent-runtime/test/claude-code.test.ts': 4,
  'packages/agent-runtime/test/codex-agent.test.ts': 2,
  'packages/agent-runtime/test/codex-follow.test.ts': 1,
  'packages/agent-runtime/test/command.test.ts': 1,
  'packages/agent-runtime/test/compact-verb.test.ts': 1,
  'packages/agent-runtime/test/completion.test.ts': 8,
  'packages/agent-runtime/test/config-refusal.test.ts': 3,
  'packages/agent-runtime/test/contract.test.ts': 5,
  'packages/agent-runtime/test/detached.test.ts': 15,
  'packages/agent-runtime/test/engine-contract.test.ts': 2,
  'packages/agent-runtime/test/engine-root.test.ts': 1,
  'packages/agent-runtime/test/engine-verbs.test.ts': 3,
  'packages/agent-runtime/test/engine.test.ts': 3,
  'packages/agent-runtime/test/follow-bg.test.ts': 1,
  'packages/agent-runtime/test/follow.test.ts': 3,
  'packages/agent-runtime/test/forget.test.ts': 6,
  'packages/agent-runtime/test/harness-args.test.ts': 2,
  'packages/agent-runtime/test/hold-open.test.ts': 2,
  'packages/agent-runtime/test/journal-words.test.ts': 1,
  'packages/agent-runtime/test/list-some.test.ts': 1,
  'packages/agent-runtime/test/listener.test.ts': 1,
  'packages/agent-runtime/test/live.test.ts': 1,
  'packages/agent-runtime/test/mcp.test.ts': 7,
  'packages/agent-runtime/test/quota.test.ts': 4,
  'packages/agent-runtime/test/refusal.test.ts': 8,
  'packages/agent-runtime/test/remote-agent.test.ts': 14,
  'packages/agent-runtime/test/remote-follow.test.ts': 3,
  'packages/agent-runtime/test/remote-quotes.test.ts': 1,
  'packages/agent-runtime/test/say.test.ts': 3,
  'packages/agent-runtime/test/scratch.test.ts': 2,
  'packages/agent-runtime/test/served.test.ts': 1,
  'packages/agent-runtime/test/session-state.test.ts': 1,
  'packages/agent-runtime/test/sweep-cli.test.ts': 1,
  'packages/agent-runtime/test/telemetry.test.ts': 2,
  'packages/agent-runtime/test/transcript.test.ts': 8,
  'packages/agent-runtime/test/usage.test.ts': 2,
  'packages/agent-runtime/test/verb-refusals.test.ts': 4,
  'packages/agent-runtime/test/waits.test.ts': 3,
};

/** Each test file by its path from the repository root, and the lines of it that floor a duration at a bound the shipped code owns. */
export const WAITED_OUT: Readonly<Record<string, number>> = {};
