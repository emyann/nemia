/**
 * The environment a Claude Code session the engine runs to its end is given, a job's or an attached one's, laid over the
 * engine's own. A job's turn ends with its result, and a command
 * left running in the background then reports to nothing, so background tasks are off: the Bash tool's run-in-background option is ignored and
 * a call runs in the foreground. A call given no timeout may then run as long as Claude Code lets any call run, 10 minutes,
 * where by default it is cut at 2.
 */
export const CLAUDE_JOB_ENV: Record<string, string> = {
  CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1',
  BASH_DEFAULT_TIMEOUT_MS: '600000',
};
