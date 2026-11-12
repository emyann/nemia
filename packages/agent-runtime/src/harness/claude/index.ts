/**
 * The face of `harness/claude/`: Claude Code's runners and the words it takes, as the doors take them.
 */
export { claudeCodeOps, type ClaudeOptions } from './code.ts';
export {
  claudeQuota,
  EXECUTABLE_VARIABLE,
  quotaExecutable,
  quotaOfRefusal,
  quotaOfUsage,
  QUOTA_TIMEOUT_MS,
  TOKEN_VARIABLE,
  usageEnv,
  usageOptions,
} from './quota.ts';
export type { OpenUsage, UsageAsk } from './quota.ts';
export { claudeHeardFile, heardOf, keepHeard, readHeard } from './heard.ts';
export {
  CLAUDE_AUTO_DROPPED,
  CLAUDE_CONTEXT_TOKENS,
  CLAUDE_EFFORTS,
  CLAUDE_PERMISSION_MODES,
  bridgeAsked,
  claudeRefuses,
} from './vocabulary.ts';
export type { ClaudeFlags } from './vocabulary.ts';
export { attachedSessions, LET_GO_MS, type Attached } from './attached.ts';
export { putDrain } from './attached-file.ts';
