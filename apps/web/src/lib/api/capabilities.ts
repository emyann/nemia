/**
 * What the repository offers a step, and what each step gets (`GET /api/capabilities`, apps/api/src/capabilities/capabilities.ts and
 * reach.ts).
 */
import { queryOptions } from '@tanstack/react-query';
import { get } from './read.ts';

/** Mirrors `Described` in apps/api/src/capabilities/capabilities.ts: a skill or an agent, and the file it was read from. */
export type Described = { name: string; description: string | null; source: string };

/** Mirrors `McpServer` in apps/api/src/capabilities/capabilities.ts: a server as `.mcp.json` declares it, and what it answered. */
export type McpServer = {
  name: string;
  source: string;
  type: string;
  command: string | null;
  args: string[];
  url: string | null;
  enabled: boolean;
  /** `denied` is the rule in `permissions.deny` that refuses the tool, if one does. */
  tools: Array<{ name: string; description: string | null; denied: string | null }> | null;
  error: string | null;
  notAsked: string | null;
  checkedAt: string | null;
};

/** A permission rule, and where it was read: the settings' file, or a step's `disallowedTools:`. */
export type Rule = { rule: string; source: string };

/**
 * Mirrors `MEASURED_TOOLS` in apps/api/src/capabilities/capabilities.ts: what a Claude Code step with no `tools:` has, as measured on
 * `measuredAt` with `version` — data, never claimed current.
 */
export type MeasuredTools = {
  harness: string;
  version: string;
  measuredAt: string;
  source: string;
  /** What the measurement named. */
  tools: string[];
  /** What such a step is taken to have that no measurement named, each with why: inferred, never measured. */
  inferred: Array<{ name: string; why: string }>;
  lacks: string[];
};

/**
 * Mirrors `READ_ONLY_COMMANDS` in apps/api/src/capabilities/capabilities.ts: the Bash commands Claude Code runs without a rule in every
 * mode, unless a deny names them — `measured` running so on `measuredAt` with `version`, the rest only `documented` — data, never claimed
 * current.
 */
export type ReadOnlyCommands = {
  harness: string;
  version: string;
  measuredAt: string;
  source: string;
  measured: string[];
  /** Named by the docs, not measured; `git` is its read-only forms. */
  documented: string[];
  docs: string;
};

/**
 * Mirrors `StepReach` in apps/api/src/capabilities/reach.ts: what a step of a workflow gets — its fence as its file declares it, and, on
 * Claude Code, the built-in tools it has (`declared` or `measured`, less what a deny rule takes), the skills it can load, each enabled
 * server's tools; the deny rules that hold for it, and what the settings allow it, `bash` their commands and `dontAsk` whether the rest is
 * denied without a prompt.
 */
export type StepReach = {
  workflow: string;
  from: 'repo' | 'yours';
  step: string;
  harness: string;
  claudeCode: boolean;
  fence: {
    tools: string[] | null;
    disallowedTools: string[];
    allowedTools: string[];
    permissionMode: string | null;
    sandbox: string | null;
    effort: string | null;
    mcp: null;
  };
  tools: {
    from: 'declared' | 'measured';
    names: string[];
    inferred: string[];
    removed: Array<{ name: string; rule: string; source: string; of: string | null }>;
  } | null;
  skills: { names: string[]; why: string | null } | null;
  /** Each tool of each server: the deny over it, the ask rule over it when no deny is, and whether an allow reaches it with neither. */
  mcp: Array<{
    server: string;
    tools: Array<{ name: string; denied: Rule | null; asks: Rule | null; allowed: boolean }> | null;
    why: string | null;
  }> | null;
  denied: Rule[];
  /** The settings' ask rules: what asks whatever an allow says, and in dontAsk, or on a job, is denied. None off Claude Code. */
  asked: Rule[];
  /**
   * Mirrors `AllowedFor`: the allow rules that stand, those a deny takes back, those an ask rule takes back, and of a tool the step does not have;
   * the Bash rules that stand, each with the narrower denies that still refuse some of it and the narrower ask rules that make some of it ask;
   * and why there is no Bash command, for a step with no Bash.
   */
  allowed: {
    rules: string[];
    takenBack: Array<{ rule: string; by: Rule }>;
    asked: Array<{ rule: string; by: Rule }>;
    unused: string[];
    bash: Array<{ rule: string; command: string; except: string[]; asks: string[] }>;
    /** Every standing rule a narrower deny still refuses part of, or a narrower ask rule makes part of ask — a Bash command, one tool of a server. */
    exceptions: Array<{ rule: string; except: string[]; asks: string[] }>;
    dontAsk: boolean;
    /** Why what an ask rule makes ask is denied without a prompt: `dontAsk`, or `a job`, which asks nobody. Null where it prompts. */
    askDenier: 'dontAsk' | 'a job' | null;
    why: string | null;
  };
  /**
   * Mirrors `ReadOnlyCommand`: Claude Code's read-only commands, each measured or documented; the ask rule that makes it ask, when no deny refuses
   * it; and the rule that refuses it — a deny, or that ask rule where `askDenier` says what asks is denied. None without Bash, null off Claude Code.
   */
  readOnly: Array<{ command: string; measured: boolean; denied: Rule | null; asks: Rule | null }> | null;
};

/**
 * Mirrors `CapabilitiesWithSteps` in apps/api/src/capabilities/reach.ts: what the repository the api runs in offers a step, and what each
 * step gets.
 */
export type Capabilities = {
  repo: string;
  skills: Described[];
  agents: Described[];
  mcp: McpServer[];
  denied: Rule[];
  /** `permissions.ask` in the settings, in its order. */
  asked: Rule[];
  /** `permissions.allow` in the settings, in its order. */
  allowed: Rule[];
  warnings: string[];
  measured: MeasuredTools;
  readOnly: ReadOnlyCommands;
  steps: StepReach[];
};

/**
 * What the repository offers a step. Not polled: it changes when a person edits the checkout, and the api asks
 * each server for its tools once while it runs. Read again on each visit.
 */
export const capabilitiesQuery = queryOptions({
  queryKey: ['capabilities'],
  queryFn: () => get<Capabilities>('/api/capabilities'),
});
