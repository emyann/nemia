/**
 * What a detached harness's command is told of the files its runner wrote and named for it (`HarnessIO`): read by its spec's
 * `command`, and handed whole to a spec that reads its spawn request (`needsRequest`).
 */
import type { McpServer } from '../seam.ts';

/**
 * Where a harness that can take a structured final answer should put it.
 *
 * Chosen by the runner, per run, OUTSIDE the workspace: anything written inside a task's worktree
 * travels down its git branch, and the next task would be cut a directory that already says it is
 * finished.
 */
export type HarnessIO = {
  /** Present when the task asked for a structured final answer: its JSON Schema, written to a file. */
  closeoutSchemaFile?: string;
  /** Where the harness should write the final answer that satisfies the schema. */
  closeoutFile?: string;
  /** Directories to treat as trusted for this run. Codex loads a project's rules only when trusted. */
  trustedDirs?: string[];
  /**
   * Present when the session has MCP servers of the task's: its `mcp` and the entries its `projectMcp` picks, written as an MCP
   * config (`{"mcpServers": …}`).
   */
  mcpConfigFile?: string;
  /** The checkout's own `.mcp.json`, when there is one. Found by a spec's `prepare`, which reads the disk. */
  projectMcpConfig?: string;
  /** The entries a task's `projectMcp` picked from its checkout's `.mcp.json`, for a harness that takes servers as arguments. */
  pickedMcp?: Record<string, McpServer>;
  /** `ionice -c3` runs on this machine, so a command can be put in the idle IO class. Found by a spec's `prepare`. */
  idleIo?: true;
  /**
   * Where the spawn request whole, and the `io` the runner computed for it, were written for the harness to read
   * (`HarnessSpec.needsRequest`). Present only for a spec that asks.
   */
  requestFile?: string;
  /**
   * Where a Claude Code job's own process writes what its claude.ai bridge came to (`AttachedBridge`, decoded by
   * `BridgeFactsSchema`), and each `bridge_state` its stream says after: named by its spec's `prepare` beside the run's own files
   * where the task asks for a bridge (`claude.remoteControl`), and read into the job's sighting by its runner. Absent: none was asked.
   */
  bridgeFile?: string;
  /**
   * Where a Claude Code job's own process writes what it is doing about the sessions' drain (`JobHold`, `harness/claude/job-hold.ts`): its
   * call in flight, the drain it read standing, a call it holds back, and its end under the drain. Named by its spec's `prepare` beside
   * the run's own files, cleared there at each spawn, and read into the job's sighting by its runner. Absent, with `drainFile`: the
   * job has no hold.
   */
  holdFile?: string;
  /**
   * Where a Claude Code job's own process keeps the newest `rate_limit_event` its session hears (`keepHeard`): one file of the store,
   * every session's (`claudeHeardFile`), named by its spec's `prepare` with the hold. Absent: nothing is kept.
   */
  heardFile?: string;
  /** The store's sessions' drain (`sessionDrainFile`), which a job's own process reads on every poll. Absent, with `holdFile`: no hold. */
  drainFile?: string;
  /** How long a job is held under a drain before it parks, in milliseconds: a test's shortening of `JOB_HOLD_MS`. Absent: that bound. */
  holdMs?: number;
  /** How often a job's own process reads the drain, in milliseconds: a test's shortening of `JOB_HOLD_POLL_MS`. Absent: that one. */
  holdPollMs?: number;
  /**
   * The program a spec's `prepare` found to run at this spawn, where it looks for one first in the engine's `harnessBin`
   * (`<harnessBin>/codex`, `<harnessBin>/claude`), read by its `command` in place of the name it runs by. Absent: that name.
   */
  program?: string;
};
