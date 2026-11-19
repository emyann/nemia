/**
 * The lists of the Capabilities page's answer (`CapabilitiesWithSteps`, `server-api.ts`), each served with its shape: a skill or an agent
 * (`CapabilityDescribed`), a permission rule (`CapabilityRule`), a server of the repository's `.mcp.json` (`CapabilityServer`), the
 * measured set and the read-only commands of Claude Code (`MeasuredTools`, `ReadOnlyCommands`), and what a step gets (`StepReach`, what
 * the settings allow it in `StepReachAllowed`). The api builds them and the board draws them; none has an identifier, so each is inlined
 * into the answer's operation, its every field described there.
 */
import { Schema } from 'effect';
import { MCP_TRANSPORTS } from './words.ts';

/** A value that may be null, and what it says. */
const OrNull = <S extends Schema.Top>(s: S, description: string) => Schema.NullOr(s).annotate({ description });

/** A text and what it says. */
const Text = (description: string) => Schema.String.annotate({ description });

/** A list of texts and what it holds. */
const Texts = (description: string) => Schema.Array(Schema.String).annotate({ description });

/** A skill or an agent: what its frontmatter calls it, what it says it is for, and the file it was read from. */
export const CapabilityDescribed = Schema.Struct({
  name: Text("Its frontmatter's `name`, else its folder's or its file's name."),
  description: OrNull(Schema.String, "Its frontmatter's `description`; null where it gives none."),
  source: Text('The file it was read from, from the repository.'),
}).annotate({ description: 'A skill or an agent, and the file it was read from.' });
export type CapabilityDescribed = typeof CapabilityDescribed.Type;

/** A permission rule, and where it was read: the settings' file, or a step's `disallowedTools:`. */
export const CapabilityRule = Schema.Struct({
  rule: Text('The rule as written, such as `Bash(git push *)`.'),
  source: Text("Where it was read: the settings' file, or `disallowedTools:` for a step's own."),
}).annotate({ description: 'A permission rule, and where it was read.' });
export type CapabilityRule = typeof CapabilityRule.Type;

/** A tool a server listed, and the deny rule that refuses it. */
const ServerTool = Schema.Struct({
  name: Text('The tool, as the server lists it.'),
  description: OrNull(Schema.String, 'What the server says it does; null where it says nothing.'),
  denied: OrNull(Schema.String, 'The rule in `permissions.deny` that refuses it; null where none does.'),
});

/** The transports a harness loads a server over, and `unknown` for any other word. */
const SERVER_TYPES = ['stdio', ...MCP_TRANSPORTS, 'unknown'] as const;

/** A server as the repository's `.mcp.json` declares it, and what it answered when the api asked it for its tools. */
export const CapabilityServer = Schema.Struct({
  name: Text('Its name in `.mcp.json`.'),
  source: Text('The file it was declared in.'),
  type: Schema.Literals(SERVER_TYPES).annotate({
    description:
      'The transport a harness loads it over: `stdio` for a server with a command and no `type`, and `unknown` for any other word, or a url with none, the word as written quoted in `notAsked`.',
  }),
  command: OrNull(Schema.String, 'Its command as `.mcp.json` writes it, `${VAR}` unexpanded; null where it has none.'),
  args: Texts('Its arguments as `.mcp.json` writes them, `${VAR}` unexpanded.'),
  url: OrNull(Schema.String, 'Its url as `.mcp.json` writes it; null where it has none.'),
  enabled: Schema.Boolean.annotate({
    description:
      'Whether the settings enable it: `enabledMcpjsonServers` or `enableAllProjectMcpServers`, and not `disabledMcpjsonServers`.',
  }),
  tools: OrNull(Schema.Array(ServerTool), 'What it listed; null where it was not asked or did not answer.'),
  error: OrNull(Schema.String, 'Why it did not list its tools, and the end of what it printed on stderr; null where it did.'),
  notAsked: OrNull(Schema.String, 'Why the api did not ask it: not enabled, or not a stdio server; null where it was asked.'),
  factoryState: OrNull(
    Schema.String,
    "The state the harness reports of the server of this name the default factory records, the harness's own word; null where it records none or its state could not be read.",
  ),
  checkedAt: OrNull(Schema.String, 'When it was asked, as an ISO 8601 time: the api asks each server once while it runs.'),
}).annotate({ description: "A server of the repository's working folder, and what it answered when asked for its tools." });
export type CapabilityServer = typeof CapabilityServer.Type;

/** When a measurement was taken, on what, and where it is recorded: data of one day and one version, never claimed current. */
const Dated = {
  harness: Text('The harness measured.'),
  version: Text('The version of the harness it was measured on.'),
  measuredAt: Text('The day it was measured, written as 2026-09-15.'),
  source: Text('Where the measurement is recorded.'),
};

/** What a Claude Code step with no `tools:` has, as measured: data of one day and one version, never claimed current. */
export const MeasuredTools = Schema.Struct({
  ...Dated,
  tools: Texts('The tools the measurement named.'),
  inferred: Schema.Array(
    Schema.Struct({
      name: Text('The tool.'),
      why: Text('Why such a step is taken to have it.'),
    }),
  ).annotate({ description: 'The tools such a step is taken to have that no measurement named, each with why: inferred, never measured.' }),
  lacks: Texts('The tools the measurement found such a step does not have.'),
}).annotate({ description: 'What a Claude Code step with no `tools:` has, as measured.' });
export type MeasuredTools = typeof MeasuredTools.Type;

/** The Bash commands Claude Code runs without a rule in every mode, unless a rule names them: data, never claimed current. */
export const ReadOnlyCommands = Schema.Struct({
  ...Dated,
  measured: Texts('The commands measured running with no rule.'),
  documented: Texts("The commands the harness's docs name and no measurement ran; `git` is its read-only forms."),
  docs: Text('The page of the docs that names them.'),
}).annotate({ description: 'The Bash commands Claude Code runs without a rule, unless a rule names them.' });
export type ReadOnlyCommands = typeof ReadOnlyCommands.Type;

/** An allow rule a deny or an ask rule takes back, and that rule. */
const TakenBack = (description: string, by: string) =>
  Schema.Array(
    Schema.Struct({
      rule: Text('The allow rule.'),
      by: CapabilityRule.annotate({ description: by }),
    }),
  ).annotate({ description });

/**
 * What the settings' allow rules give a step: those that stand, those a deny or an ask rule takes back, those of a tool it does not have,
 * the Bash rules that stand with their commands, and why what asks is denied without a prompt.
 */
export const StepReachAllowed = Schema.Struct({
  rules: Texts('The allow rules that stand: none a deny or an ask rule takes back, none of a tool the step does not have.'),
  takenBack: TakenBack('The allow rules a deny takes back, each with the deny.', 'The deny that takes it back.'),
  asked: TakenBack(
    'The allow rules an ask rule takes back, each with the ask rule: it asks, and where `askDenier` names why, is denied.',
    'The ask rule that takes it back.',
  ),
  unused: Texts('The allow rules of a tool the step does not have: known only for a step whose `tools:` names its set.'),
  bash: Schema.Array(
    Schema.Struct({
      rule: Text('The Bash rule.'),
      command: Text('Its command as the rule writes it; `*` for Bash whole.'),
      except: Texts('The narrower deny rules that still refuse some of what it allows.'),
      asks: Texts('The narrower ask rules that still make some of it ask.'),
    }),
  ).annotate({ description: 'The Bash rules that stand, each with its command; none for a step with no Bash, which `why` says.' }),
  exceptions: Schema.Array(
    Schema.Struct({
      rule: Text('The allow rule that stands.'),
      except: Texts('The narrower deny rules that still refuse part of it.'),
      asks: Texts('The narrower ask rules that still make part of it ask.'),
    }),
  ).annotate({
    description:
      'Every standing rule a narrower deny still refuses part of, or a narrower ask rule makes part of ask: a Bash command, one tool of a server.',
  }),
  dontAsk: Schema.Boolean.annotate({
    description: 'Whether the step runs in `dontAsk`, where anything that asks and no rule allows is denied without a prompt.',
  }),
  askDenier: OrNull(
    Schema.Literals(['dontAsk', 'a job']),
    'Why what an ask rule makes ask is denied without a prompt: `dontAsk`, or `a job`, which asks nobody; null where neither is claimed.',
  ),
  why: OrNull(Schema.String, 'Why the step runs no Bash command, whatever the settings allow; null where it has Bash.'),
}).annotate({ description: "What the settings' allow rules give a step." });
export type StepReachAllowed = typeof StepReachAllowed.Type;

/** A server's tool as it reaches a step: the deny over it, the ask rule over it when no deny is, and whether an allow reaches it. */
const ReachedTool = Schema.Struct({
  name: Text('The tool, as the server lists it.'),
  denied: OrNull(CapabilityRule, 'The rule that denies it; null where none does.'),
  asks: OrNull(CapabilityRule, 'The ask rule that makes it ask, where no deny does; null otherwise.'),
  allowed: Schema.Boolean.annotate({
    description: 'Whether a rule allows it with neither a deny nor an ask over it: in `dontAsk`, whether it runs at all.',
  }),
});

/**
 * What a step of a workflow gets: its fence as its file declares it, and, on a harness that declares rules, the built-in tools it has, the
 * skills it can load, each server's tools, the deny and ask rules that hold for it, what the settings allow it and the read-only commands.
 */
export const StepReach = Schema.Struct({
  workflow: Text('The workflow.'),
  from: Schema.Literals(['repo', 'user']).annotate({
    description: "The workflow's origin: `repo`, the repository's; `user`, the person's library.",
  }),
  step: Text('The step.'),
  harness: Text("The harness it runs on: the step's, or the default harness where it names none."),
  claudeCode: Schema.Boolean.annotate({
    description: "Whether its harness declares rules, Claude Code's, whose set was measured. Each part below that is null says it is not.",
  }),
  fence: Schema.Struct({
    tools: OrNull(Texts('The tools it names.'), 'Its `tools:`; null where it names none.'),
    disallowedTools: Texts('Its `disallowedTools:`, its own deny rules.'),
    allowedTools: Texts('Its `allowedTools:`.'),
    permissionMode: OrNull(Schema.String, "Its `permissionMode:`, Claude Code's; null where it declares none."),
    sandbox: OrNull(Schema.String, "Its `sandbox:`, Codex's; null where it declares none."),
    effort: OrNull(Schema.String, 'Its `effort:`; null where it declares none.'),
    mcp: Texts(
      "The servers its sessions load, its agent's `mcp:` line then its own: empty where neither names any and for a step with no agent.",
    ),
  }).annotate({ description: 'The fence as its file declares it.' }),
  tools: OrNull(
    Schema.Struct({
      from: Schema.Literals(['declared', 'measured']).annotate({
        description: "Whether the set is its `tools:` exactly (`declared`) or the harness's own (`measured`).",
      }),
      names: Texts('The built-in tools it has, less what a deny rule removes.'),
      inferred: Texts('Those of the measured set no measurement named; none for a step that declares its tools.'),
      removed: Schema.Array(
        Schema.Struct({
          name: Text('The tool taken.'),
          rule: Text('The deny rule that takes it.'),
          source: Text('Where the rule was read.'),
          of: OrNull(Schema.String, 'The family the set names it in, such as `Cron*`; null for a tool the set names itself.'),
        }),
      ).annotate({ description: 'The tools a deny rule takes from it.' }),
    }),
    'The built-in tools it has; null off a harness that declares rules.',
  ),
  skills: OrNull(
    Schema.Struct({
      names: Texts("The repository's skills it can load: every one, with the Skill tool."),
      why: OrNull(Schema.String, 'Why it can load none; null where it can.'),
    }),
    'The skills it can load; null off a harness that declares rules.',
  ),
  mcp: OrNull(
    Schema.Array(
      Schema.Struct({
        server: Text('The server, by its name.'),
        tools: OrNull(Schema.Array(ReachedTool), "Its tools as the step's rules leave them; null where there are none to show."),
        why: OrNull(Schema.String, 'Why there are no tools to show; null where there are.'),
      }),
    ),
    'Each server the step or its agent names, with its tools or why there are none; null off a harness that declares rules.',
  ),
  denied: Schema.Array(CapabilityRule).annotate({
    description: "Every deny rule that holds for it: the settings', then its own. None for a step whose harness reads no settings.",
  }),
  asked: Schema.Array(CapabilityRule).annotate({
    description: "Every ask rule that holds for it: the settings'. None for a step whose harness reads no settings.",
  }),
  allowed: StepReachAllowed,
  readOnly: OrNull(
    Schema.Array(
      Schema.Struct({
        command: Text('The command.'),
        measured: Schema.Boolean.annotate({ description: 'Whether it was measured running without a rule, or only documented so.' }),
        denied: OrNull(
          CapabilityRule,
          'The rule that refuses all of it: a deny so covering it, or the ask rule on a step that denies what asks; null where none does.',
        ),
        asks: OrNull(CapabilityRule, 'The ask rule that makes all of it ask, when no deny refuses it; null otherwise.'),
      }),
    ),
    "Claude Code's read-only commands, the measured ones first: none for a step with no Bash, and null for a harness whose were not measured.",
  ),
}).annotate({ description: 'What a step of a workflow gets.' });
export type StepReach = typeof StepReach.Type;
