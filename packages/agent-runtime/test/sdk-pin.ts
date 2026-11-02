/**
 * What the runtime's Agent SDK dependency is pinned to, and what that pin means for a session. Three constants, each a measurement
 * of one release and none of them a guess: `sdk-pin.test.ts` holds the tree to the first two, and `live-sdk.boundary.test.ts` — against the
 * real harness, `AE_LIVE=1` — to the third.
 *
 * **Each is re-measured at the next bump, never carried.** The spec is exact on purpose (`packages/agent-runtime/package.json`): the
 * dependency once stood as `^0.3.261` with the lock at 0.3.270, so the factory's sessions ran a Claude Code eleven versions behind
 * the owner's own and `opus` meant a different model in each. A range cannot say which Claude Code a session gets.
 */

/** The exact version of `@anthropic-ai/claude-agent-sdk` the runtime declares: npm's `latest` when it was chosen. */
export const SDK_VERSION = '0.3.316';

/** The Claude Code that SDK bundles, as its own `package.json` says (`claudeCodeVersion`). Read off the installed 0.3.316. */
export const CLAUDE_CODE_VERSION = '2.1.316';

/**
 * What that Claude Code resolves the model alias `opus` to, measured off a real session's `init` line (`live-sdk.boundary.test.ts`, which
 * needs `AE_LIVE=1`). An alias can move under a version that did not, so this is the one of the three a bump cannot infer: the
 * measurement is made again, and when it was made is in `docs/harness.md`.
 */
export const OPUS_TODAY = 'claude-opus-5-5';
