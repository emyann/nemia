/**
 * What the repository offers a step, and what each step gets (`GET /api/capabilities`, apps/api/src/capabilities/capabilities.ts and
 * reach.ts).
 */
import { queryOptions } from '@tanstack/react-query';
import { Schema } from 'effect';
import { decodes } from './decodes.ts';
import { get } from './read.ts';

/** A list of strings, as a decoded answer holds it: mutable, as the plain types say. */
const Strings = Schema.mutable(Schema.Array(Schema.String));

/** A list of `item`, as a decoded answer holds it. */
const List = <S extends Schema.Top>(item: S) => Schema.mutable(Schema.Array(item));

/** Mirrors `Described` in apps/api/src/capabilities/capabilities.ts: a skill or an agent, and the file it was read from. */
export type Described = { name: string; description: string | null; source: string };

/** Decodes a `Described`. */
const DescribedSchema = decodes<Described>()(
  Schema.Struct({
    name: Schema.String,
    description: Schema.NullOr(Schema.String),
    source: Schema.String,
  }),
);

/** Mirrors `McpServer` in apps/api/src/capabilities/capabilities.ts: a server as `.mcp.json` declares it, and what it answered. */
export type McpServer = {
  name: string;
  source: string;
  /** The transport a harness loads it over, or `unknown` for any other word, which `notAsked` quotes as written. */
  type: 'stdio' | 'http' | 'sse' | 'unknown';
  command: string | null;
  args: string[];
  url: string | null;
  enabled: boolean;
  /** `denied` is the rule in `permissions.deny` that refuses the tool, if one does. */
  tools: Array<{ name: string; description: string | null; denied: string | null }> | null;
  error: string | null;
  notAsked: string | null;
  checkedAt: string | null;
  /**
   * The state the harness reports of the server of this name the **default factory** records — the harness's own word, carried — or
   * null: for a server the default factory does not record, and for one whose state could not be read, which is not an absence.
   */
  factoryState: string | null;
};

/** Decodes a `McpServer`. */
const McpServerSchema = decodes<McpServer>()(
  Schema.Struct({
    name: Schema.String,
    source: Schema.String,
    type: Schema.Literals(['stdio', 'http', 'sse', 'unknown']),
    command: Schema.NullOr(Schema.String),
    args: Strings,
    url: Schema.NullOr(Schema.String),
    enabled: Schema.Boolean,
    tools: Schema.NullOr(
      List(Schema.Struct({ name: Schema.String, description: Schema.NullOr(Schema.String), denied: Schema.NullOr(Schema.String) })),
    ),
    error: Schema.NullOr(Schema.String),
    notAsked: Schema.NullOr(Schema.String),
    checkedAt: Schema.NullOr(Schema.String),
    factoryState: Schema.NullOr(Schema.String),
  }),
);

/** A permission rule, and where it was read: the settings' file, or a step's `disallowedTools:`. */
export type Rule = { rule: string; source: string };

/** Decodes a `Rule`. */
const RuleSchema = decodes<Rule>()(Schema.Struct({ rule: Schema.String, source: Schema.String }));

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

/** Decodes `MeasuredTools`. */
const MeasuredToolsSchema = decodes<MeasuredTools>()(
  Schema.Struct({
    harness: Schema.String,
    version: Schema.String,
    measuredAt: Schema.String,
    source: Schema.String,
    tools: Strings,
    inferred: List(Schema.Struct({ name: Schema.String, why: Schema.String })),
    lacks: Strings,
  }),
);

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

/** Decodes `ReadOnlyCommands`. */
const ReadOnlyCommandsSchema = decodes<ReadOnlyCommands>()(
  Schema.Struct({
    harness: Schema.String,
    version: Schema.String,
    measuredAt: Schema.String,
    source: Schema.String,
    measured: Strings,
    documented: Strings,
    docs: Schema.String,
  }),
);

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
    mcp: string[];
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
   * Mirrors `AllowedFor`: the allow rules that stand, those a deny takes back, those an ask rule takes back, and of a tool the step does
   * not have; the Bash rules that stand, each with the narrower denies that still refuse some of it and the narrower ask rules that make
   * some of it ask; and why there is no Bash command, for a step with no Bash.
   */
  allowed: {
    rules: string[];
    takenBack: Array<{ rule: string; by: Rule }>;
    asked: Array<{ rule: string; by: Rule }>;
    unused: string[];
    bash: Array<{ rule: string; command: string; except: string[]; asks: string[] }>;
    /**
     * Every standing rule a narrower deny still refuses part of, or a narrower ask rule makes part of ask — a Bash command, one tool of a
     * server.
     */
    exceptions: Array<{ rule: string; except: string[]; asks: string[] }>;
    dontAsk: boolean;
    /** Why what an ask rule makes ask is denied without a prompt: `dontAsk`, or `a job`, which asks nobody. Null where it prompts. */
    askDenier: 'dontAsk' | 'a job' | null;
    why: string | null;
  };
  /**
   * Mirrors `ReadOnlyCommand`: Claude Code's read-only commands, each measured or documented; the ask rule that makes it ask, when no deny
   * refuses it; and the rule that refuses it — a deny, or that ask rule where `askDenier` says what asks is denied. None without Bash, null
   * off Claude Code.
   */
  readOnly: Array<{ command: string; measured: boolean; denied: Rule | null; asks: Rule | null }> | null;
};

/** Decodes what the settings' allow rules give a step (`StepReach.allowed`). */
const AllowedForSchema = decodes<StepReach['allowed']>()(
  Schema.Struct({
    rules: Strings,
    takenBack: List(Schema.Struct({ rule: Schema.String, by: RuleSchema })),
    asked: List(Schema.Struct({ rule: Schema.String, by: RuleSchema })),
    unused: Strings,
    bash: List(Schema.Struct({ rule: Schema.String, command: Schema.String, except: Strings, asks: Strings })),
    exceptions: List(Schema.Struct({ rule: Schema.String, except: Strings, asks: Strings })),
    dontAsk: Schema.Boolean,
    askDenier: Schema.NullOr(Schema.Literals(['dontAsk', 'a job'])),
    why: Schema.NullOr(Schema.String),
  }),
);

/** Decodes a `StepReach`. */
const StepReachSchema = decodes<StepReach>()(
  Schema.Struct({
    workflow: Schema.String,
    from: Schema.Literals(['repo', 'yours']),
    step: Schema.String,
    harness: Schema.String,
    claudeCode: Schema.Boolean,
    fence: Schema.Struct({
      tools: Schema.NullOr(Strings),
      disallowedTools: Strings,
      allowedTools: Strings,
      permissionMode: Schema.NullOr(Schema.String),
      sandbox: Schema.NullOr(Schema.String),
      effort: Schema.NullOr(Schema.String),
      mcp: Strings,
    }),
    tools: Schema.NullOr(
      Schema.Struct({
        from: Schema.Literals(['declared', 'measured']),
        names: Strings,
        inferred: Strings,
        removed: List(Schema.Struct({ name: Schema.String, rule: Schema.String, source: Schema.String, of: Schema.NullOr(Schema.String) })),
      }),
    ),
    skills: Schema.NullOr(Schema.Struct({ names: Strings, why: Schema.NullOr(Schema.String) })),
    mcp: Schema.NullOr(
      List(
        Schema.Struct({
          server: Schema.String,
          tools: Schema.NullOr(
            List(
              Schema.Struct({
                name: Schema.String,
                denied: Schema.NullOr(RuleSchema),
                asks: Schema.NullOr(RuleSchema),
                allowed: Schema.Boolean,
              }),
            ),
          ),
          why: Schema.NullOr(Schema.String),
        }),
      ),
    ),
    denied: List(RuleSchema),
    asked: List(RuleSchema),
    allowed: AllowedForSchema,
    readOnly: Schema.NullOr(
      List(
        Schema.Struct({
          command: Schema.String,
          measured: Schema.Boolean,
          denied: Schema.NullOr(RuleSchema),
          asks: Schema.NullOr(RuleSchema),
        }),
      ),
    ),
  }),
);

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

/** Decodes `Capabilities`. */
const CapabilitiesSchema = decodes<Capabilities>()(
  Schema.Struct({
    repo: Schema.String,
    skills: List(DescribedSchema),
    agents: List(DescribedSchema),
    mcp: List(McpServerSchema),
    denied: List(RuleSchema),
    asked: List(RuleSchema),
    allowed: List(RuleSchema),
    warnings: Strings,
    measured: MeasuredToolsSchema,
    readOnly: ReadOnlyCommandsSchema,
    steps: List(StepReachSchema),
  }),
);

/**
 * What the repository offers a step. Not polled: it changes when a person edits the checkout, and the api asks
 * each server for its tools once while it runs. Read again on each visit.
 */
export const capabilitiesQuery = queryOptions({
  queryKey: ['capabilities'],
  queryFn: () => get('/api/capabilities', CapabilitiesSchema),
});
