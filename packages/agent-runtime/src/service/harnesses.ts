/** The harnesses an engine runs when its options name none. */
import { claudeDetached } from '../harness/claude/index.ts';
import { codex } from '../harness/codex/codex.ts';
import { commandHarness } from '../harness/command/command.ts';
import type { HarnessConfig } from '../facade/consumer.ts';

/** The harnesses of an engine given none: Claude Code, Codex, `claude -p` on the detached worker, and a process. */
export const DEFAULT_HARNESSES: Record<string, HarnessConfig> = {
  claude: 'claude',
  codex,
  'claude-detached': claudeDetached,
  command: commandHarness,
};
