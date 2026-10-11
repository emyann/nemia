/**
 * What each step of each workflow gets: the fence its file declares, beside what of the repository's capabilities reaches it. Pure over
 * what the api read of the checkout (`capabilitiesOf`) and the workflows the package's loader read, as the Workflows page reads them
 * (`listWorkflows`); nothing here starts, asks or writes anything.
 *
 * What a Claude Code step has is read as the harness gives it, as far as it was measured: its `tools:` exactly, or the harness's own set
 * (`MEASURED_TOOLS`, what was inferred marked so); the Skill tool before any skill; every server of the checkout's `.mcp.json` that the
 * settings enable and its agent names (`mcp:`), whatever its tools; the settings' deny rules and its own `disallowedTools:`; the
 * settings' ask rules; Claude Code's
 * read-only commands, which ask for no rule in any mode (`READ_ONLY_COMMANDS`) unless an ask rule names one; and in `dontAsk`, only what
 * the settings allow of what asks. What asks is denied without a prompt in `dontAsk`, and on a job (`claude -p`, every step but one that
 * says `background: true`), which asks nobody in any mode measured (`askDenierOf`); on a background session in another mode it prompts.
 * Rules are matched as Claude Code's permissions docs say it matches them (code.claude.com/docs/en/permissions): deny, then ask, then
 * allow, whatever their specificity, so a deny takes back every allow whose calls it matches, and an ask rule every allow it matches, which
 * asks, and in `dontAsk` is denied; in a Bash rule `*` is any text, spaces included, and `:*` at the end is a trailing ` *`, which also
 * matches the bare command; a rule naming a tool whole — `Bash`, or `Bash(*)` — as a deny, removes the tool. A Codex step reads no
 * `.claude/settings.json`, and nothing of a Codex session was measured: its fence is its sandbox, and the page claims nothing else for it.
 */
import { HARNESSES } from 'agent-orchestrator';
import {
  type AskServer,
  capabilitiesOf,
  denyingRule,
  MEASURED_TOOLS,
  READ_ONLY_COMMANDS,
  SETTINGS,
  type Capabilities,
  type DeniedRule,
} from './capabilities.ts';
import type { Engine } from '../store.ts';
import { listWorkflows, type WorkflowListing, type WorkflowSource, type WorkflowStepSpec } from '../workflows/workflows.ts';

/** The harnesses that are Claude Code, as the engine names them: its jobs and background sessions (`claude`), and `claude -p` detached. */
const CLAUDE_CODE: ReadonlySet<string> = new Set(['claude', 'claude-detached']);

/**
 * The modes a job was measured in on Claude Code 2.1.280, each denying what would ask and carrying on (agent-runtime's docs/open-issues.md,
 * "Claude Code as a job") — none given being the engine's `auto`. `bypassPermissions` was not measured, so the page claims nothing of a job
 * in it.
 */
const JOB_MEASURED: ReadonlySet<string | null> = new Set([null, 'auto', 'dontAsk', 'default', 'acceptEdits']);

/**
 * Why what asks is denied without a prompt on a Claude Code step: `dontAsk`, which denies it in any session; or it runs as a job, which has
 * no one to ask — every `claude` step but a background session (`background: true`), and every `claude-detached` one. Null where it
 * prompts.
 */
export const askDenierOf = (harness: string, spec: Pick<WorkflowStepSpec, 'permissionMode' | 'background'>): 'dontAsk' | 'a job' | null => {
  if (spec.permissionMode === 'dontAsk') return 'dontAsk';
  const job = harness === 'claude-detached' || (harness === 'claude' && spec.background !== true);
  return job && JOB_MEASURED.has(spec.permissionMode) ? 'a job' : null;
};

/** Where a step's own deny rules are read from. */
export const DISALLOW = 'disallowedTools:';

/**
 * A tool taken from a step by a deny rule: the tool, the rule and where it was read — and the family the set names it in, for one taken
 * from `Cron*`.
 */
export type RemovedTool = { name: string; rule: string; source: string; of: string | null };

/**
 * A server's tool as it reaches a step: the rule that denies it; the ask rule that makes it ask, when no deny does; and whether a rule
 * allows it with neither over it — which, in `dontAsk`, is whether it runs at all.
 */
export type ReachedMcpTool = { name: string; denied: DeniedRule | null; asks: DeniedRule | null; allowed: boolean };

/**
 * What the settings' allow rules give a step. `rules` are those that stand: none a deny takes back (`takenBack`, with the deny), none an
 * ask rule takes back (`asked`, with the ask rule: it asks, and where `askDenier` names why, is denied), and none of a tool the step does
 * not have (`unused`) — known only for a step whose `tools:` names its set. `bash` are the Bash rules that stand, each with its command as
 * the rule writes it, the narrower deny rules that still refuse some of what it allows (`except`) and the narrower ask rules that still
 * make some of it ask (`asks`); none for a step with no Bash, which `why` says. `dontAsk` is whether the step runs in it, where anything
 * that asks and no rule allows is denied without a prompt. `askDenier` is why what an ask rule makes ask is denied without a prompt instead
 * — `dontAsk`, or `a job`, which asks nobody — and null where it prompts: a background session in another mode, or a job in a mode not
 * measured.
 */
export type AllowedFor = {
  rules: string[];
  takenBack: Array<{ rule: string; by: DeniedRule }>;
  asked: Array<{ rule: string; by: DeniedRule }>;
  unused: string[];
  bash: Array<{ rule: string; command: string; except: string[]; asks: string[] }>;
  /**
   * Every rule of `rules` that a narrower deny still refuses part of, or a narrower ask rule still makes part of ask — a Bash command, one
   * tool of a server — with those denies and those ask rules.
   */
  exceptions: Array<{ rule: string; except: string[]; asks: string[] }>;
  dontAsk: boolean;
  askDenier: 'dontAsk' | 'a job' | null;
  why: string | null;
};

/**
 * One of Claude Code's read-only commands as it reaches a step with Bash: whether it was measured running without a rule, or only
 * documented so (`READ_ONLY_COMMANDS`); the ask rule that makes all of it ask, when no deny refuses it — `Bash`, or a Bash rule covering
 * `<command> *` — which beats the harness's own leave as it beats an allow; and the rule that refuses all of it: a deny so covering it, or
 * that ask rule on a step that denies what asks (`askDenierOf`).
 */
export type ReadOnlyCommand = { command: string; measured: boolean; denied: DeniedRule | null; asks: DeniedRule | null };

export type StepReach = {
  workflow: string;
  from: WorkflowSource;
  step: string;
  /** The harness it runs on: the step's, or the engine's first when it names none. */
  harness: string;
  /** Whether it runs on Claude Code, whose set was measured. Every field below that says null says it is not. */
  claudeCode: boolean;
  /**
   * The fence as its file declares it, null where it declares none. `mcp` is the servers its sessions load, as its agent's `mcp:` line
   * names them: empty where the agent names none and for a step with no agent, whose sessions load no server.
   * `permissionMode` is Claude Code's, `sandbox` Codex's: a step has at most one of the two.
   */
  fence: {
    tools: string[] | null;
    disallowedTools: string[];
    allowedTools: string[];
    permissionMode: string | null;
    sandbox: string | null;
    effort: string | null;
    mcp: string[];
  };
  /**
   * The built-in tools it has: its `tools:` exactly (`declared`), or the harness's own set (`measured`), less what a deny rule removes.
   * `inferred` are those of the measured set no measurement named (`MEASURED_TOOLS.inferred`); none for a step that declares its tools.
   */
  tools: { from: 'declared' | 'measured'; names: string[]; inferred: string[]; removed: RemovedTool[] } | null;
  /** The repository's skills it can load — every one, with the Skill tool; none without it, and why. */
  skills: { names: string[]; why: string | null } | null;
  /**
   * Each server the step's agent names (`fence.mcp`): one the checkout enables with the tools it listed, or why there are none to show;
   * and one no `.mcp.json` of the checkout declares with no tools and why, since a session of the step is refused at its start.
   */
  mcp: Array<{ server: string; tools: ReachedMcpTool[] | null; why: string | null }> | null;
  /** Every deny rule that holds for it: the settings', then its own. None for a step whose harness reads no settings. */
  denied: DeniedRule[];
  /**
   * Every ask rule that holds for it: the settings' — a step has no key of its own for one. None for a step whose harness reads no
   * settings.
   */
  asked: DeniedRule[];
  allowed: AllowedFor;
  /**
   * Claude Code's read-only commands, the measured ones first: none for a step with no Bash, and null for a harness whose were not
   * measured.
   */
  readOnly: ReadOnlyCommand[] | null;
};

/**
 * What the Capabilities page reads: the repository's capabilities, the measured set a step without `tools:` has, the read-only commands
 * Claude Code runs without a rule, and what each step gets.
 */
export type CapabilitiesWithSteps = Capabilities & {
  measured: typeof MEASURED_TOOLS;
  readOnly: typeof READ_ONLY_COMMANDS;
  steps: StepReach[];
};

/**
 * A permission rule as Claude Code reads one: the tool, and what its parentheses scope — null for a rule naming the tool whole, as `Bash`
 * and `Bash(*)` both do. Null for a rule that names no built-in tool so, an MCP server's (`mcp__<server>__<tool>`) among them.
 */
function ruleOf(rule: string): { tool: string; scope: string | null } | null {
  const m = /^([A-Za-z][A-Za-z0-9]*)(?:\(([\s\S]*)\))?$/.exec(rule);
  if (!m) return null;
  return { tool: m[1], scope: m[2] === undefined || m[2] === '*' ? null : m[2] };
}

/** A Bash rule's scope in one spelling: `:*` at its end is a trailing ` *`. Anywhere else a colon is a colon. */
const bashPattern = (scope: string): string => (scope.endsWith(':*') ? `${scope.slice(0, -2)} *` : scope);

/** The bare command a pattern whose only wildcard is a trailing ` *` matches too — `git log` for `git log *` — or null. */
const bareOf = (pattern: string): string | null =>
  pattern.endsWith(' *') && pattern.indexOf('*') === pattern.length - 1 ? pattern.slice(0, -2) : null;

/**
 * Whether a Bash pattern matches a command, as Claude Code matches one: `*` any text, spaces included; with no `*`, that command exactly.
 */
function bashMatches(pattern: string, command: string): boolean {
  const glob = new RegExp(
    `^${pattern
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('[\\s\\S]*')}$`,
  );
  return glob.test(command) || bareOf(pattern) === command;
}

/**
 * Whether the Bash rule scoped `outer` matches every command the rule scoped `inner` matches, each as its rule writes it (`git:*`,
 * `git diff:*`, `npm run build`). Read off `inner`'s text with each `*` of it taken as written: `outer`'s own characters are never a `*`,
 * so where `outer` matches that text, each `*` of `inner` falls inside a wildcard of `outer`, which matches whatever it stands for. And the
 * bare command a trailing ` *` of `inner` matches, `outer` must match too.
 */
export function bashCovers(outer: string, inner: string): boolean {
  const [o, i] = [bashPattern(outer), bashPattern(inner)];
  const bare = bareOf(i);
  return bashMatches(o, i) && (bare === null || bashMatches(o, bare));
}

/**
 * A rule naming an MCP server's tools: the server, and one tool — null for every tool of it, as `mcp__<server>` and `mcp__<server>__*` both
 * are.
 */
function mcpRuleOf(rule: string): { server: string; tool: string | null } | null {
  const m = /^mcp__(.+?)(?:__(.+))?$/.exec(rule);
  return m ? { server: m[1], tool: m[2] === undefined || m[2] === '*' ? null : m[2] } : null;
}

/**
 * The deny rule that takes an allow rule back whole, or undefined — and, given the ask rules, the ask rule that does, since ask too comes
 * before allow. Deny comes before allow whatever either's specificity, so a deny takes back the allow when it matches every call the allow
 * does: one of the same words; one naming the allow's tool whole; a Bash deny that covers the allow's commands (`bashCovers`); a deny of
 * the whole of an MCP server, over an allow of one of its tools or of all of them — a server's tool read as `denyingRule` reads it for the
 * tools row, so the row and the allow rules say the same.
 */
function takenBackBy(allow: string, denied: readonly DeniedRule[]): DeniedRule | undefined {
  const server = mcpRuleOf(allow);
  const a = ruleOf(allow);
  return denied.find((d) => {
    if (d.rule === allow) return true;
    if (server) {
      if (server.tool !== null) return denyingRule([d.rule], server.server, server.tool) !== null;
      const x = mcpRuleOf(d.rule);
      return x !== null && x.server === server.server && x.tool === null;
    }
    const r = ruleOf(d.rule);
    if (!a || !r || r.tool !== a.tool) return false;
    return r.scope === null || (a.tool === 'Bash' && a.scope !== null && bashCovers(r.scope, a.scope));
  });
}

/**
 * The deny rules narrower than an allow that stands, which still refuse some of what it allows — or, given the ask rules, those that still
 * make some of it ask: a Bash deny among a Bash allow's commands (`bashCovers`), and a deny of one tool of a server an allow names whole.
 */
function narrowerDenies(allow: string, denied: readonly DeniedRule[]): string[] {
  const server = mcpRuleOf(allow);
  const a = ruleOf(allow);
  return denied
    .filter((d) => {
      if (server) {
        const x = mcpRuleOf(d.rule);
        return server.tool === null && x !== null && x.server === server.server && x.tool !== null;
      }
      const x = ruleOf(d.rule);
      return a?.tool === 'Bash' && x?.tool === 'Bash' && x.scope !== null && (a.scope === null || bashCovers(a.scope, x.scope));
    })
    .map((d) => d.rule);
}

/** What each step of each workflow that reads gets. A folder the loader refuses has no step to give anything to. */
export function reachOf(
  capabilities: Pick<Capabilities, 'skills' | 'mcp' | 'denied' | 'asked' | 'allowed'>,
  workflows: readonly WorkflowListing[],
): StepReach[] {
  return workflows
    .filter((w) => w.error === null)
    .flatMap((w) => w.steps.map(({ name, spec, mcp }) => stepReach(capabilities, w, name, spec, mcp)));
}

/** A row for each server `named` that the checkout's `.mcp.json` does not declare (`declared`): no tools, and why. */
const undeclared = (named: readonly string[], declared: Capabilities['mcp']): NonNullable<StepReach['mcp']> =>
  named
    .filter((name) => !declared.some((server) => server.name === name))
    .map((server) => ({
      server,
      tools: null,
      why: `The checkout's .mcp.json declares no server named ${server}: a session of this step is refused at its start. Declare the server there, or take the name off the agent's \`mcp:\` line.`,
    }));

/** What follows why a named server's tools are not listed, where the settings do not enable it: a step's session loads it by its name. */
const LOADED_ANYWAY = " A session of this step loads it all the same: its agent's `mcp:` line names it, and the settings are not asked.";

/**
 * The servers a step's sessions load, each with the tools it listed as the step's rules leave them: those the checkout declares among the
 * ones its agent names (`named`), enabled by the settings or not — one the api did not ask says why, and that it is loaded — then a row
 * for each name the checkout does not declare (`undeclared`).
 */
function serversReached(
  servers: Capabilities['mcp'],
  named: readonly string[],
  rules: { deny: string[]; ask: string[]; denied: DeniedRule[]; asked: DeniedRule[]; allow: string[] },
): NonNullable<StepReach['mcp']> {
  const loaded = servers
    .filter((server) => named.includes(server.name))
    .map((server) => ({
      server: server.name,
      tools:
        server.tools?.map((tool): ReachedMcpTool => {
          const rule = denyingRule(rules.deny, server.name, tool.name);
          const asking = rule === null ? denyingRule(rules.ask, server.name, tool.name) : null;
          return {
            name: tool.name,
            denied: rule === null ? null : rules.denied.find((d) => d.rule === rule)!,
            asks: asking === null ? null : rules.asked.find((a) => a.rule === asking)!,
            allowed: rule === null && asking === null && denyingRule(rules.allow, server.name, tool.name) !== null,
          };
        }) ?? null,
      why: server.tools ? null : `${server.error ?? server.notAsked ?? 'It did not list its tools.'}${server.enabled ? '' : LOADED_ANYWAY}`,
    }));
  return [...loaded, ...undeclared(named, servers)];
}

/**
 * What one step gets (`StepReach`). A step on a harness that is not Claude Code reads no settings, and nothing of them is claimed for it.
 * On Claude Code:
 *
 * - A deny naming a tool whole — `Bash`, or `Bash(*)` — removes it from the session. One naming one tool of a family the set names as
 *   one — `CronCreate` of `Cron*` — leaves the family, and names the tool as taken.
 * - Whether it has a tool is known for a set its `tools:` names; for the measured set, a tool the measurement did not name is not ruled
 *   out.
 * - Deny, then ask, then allow: an allow stands only where no deny, and no ask rule, matches the whole of it. The narrower ask rules that
 *   still make part of an allow ask leave out any a deny covers, since the deny comes first and that part never asks.
 * - Each read-only command asks for no rule, unless a Bash deny covers all of it, or an ask rule does — which makes it ask, and on a step
 *   that denies what asks (in `dontAsk`, or a job) denies it. A deny naming Bash whole has taken the tool, and an ask rule naming it whole
 *   makes every command ask. `git`'s read-only forms are not listed, so only a rule of every `git` command is known to take them.
 */
function stepReach(
  capabilities: Pick<Capabilities, 'skills' | 'mcp' | 'denied' | 'asked' | 'allowed'>,
  workflow: WorkflowListing,
  step: string,
  spec: WorkflowStepSpec,
  named: readonly string[],
): StepReach {
  const harness = spec.harness ?? Object.keys(HARNESSES)[0];
  const dontAsk = spec.permissionMode === 'dontAsk';
  const askDenier = CLAUDE_CODE.has(harness) ? askDenierOf(harness, spec) : null;
  const reach = {
    workflow: workflow.name,
    from: workflow.from,
    step,
    harness,
    fence: {
      tools: spec.tools,
      disallowedTools: spec.disallowedTools,
      allowedTools: spec.allowedTools,
      permissionMode: spec.permissionMode,
      sandbox: spec.sandbox,
      effort: spec.effort,
      mcp: [...named],
    },
  };
  if (!CLAUDE_CODE.has(harness)) {
    return {
      ...reach,
      claudeCode: false,
      tools: null,
      skills: null,
      mcp: null,
      denied: [],
      asked: [],
      readOnly: null,
      allowed: {
        rules: [],
        takenBack: [],
        asked: [],
        unused: [],
        bash: [],
        exceptions: [],
        dontAsk,
        askDenier,
        why: `${harness} reads no ${SETTINGS}, so none of its rules is claimed for this step.`,
      },
    };
  }

  const denied = [...capabilities.denied, ...spec.disallowedTools.map((rule) => ({ rule, source: DISALLOW }))];
  const deny = denied.map((d) => d.rule);
  const { asked } = capabilities;
  const ask = asked.map((a) => a.rule);
  const inferred: readonly string[] = MEASURED_TOOLS.inferred.map((t) => t.name);
  const offered: readonly string[] = spec.tools ?? [...MEASURED_TOOLS.tools, ...inferred];
  const wholly = (tool: string) => denied.find((d) => ruleOf(d.rule)?.tool === tool && ruleOf(d.rule)?.scope === null);
  const removed: RemovedTool[] = [];
  const names = offered.filter((name) => {
    const by = wholly(name);
    if (by) removed.push({ name, rule: by.rule, source: by.source, of: null });
    return !by;
  });
  for (const d of denied) {
    const r = ruleOf(d.rule);
    if (!r || r.scope !== null || offered.includes(r.tool) || removed.some((x) => x.name === r.tool)) continue;
    const family = names.find((name) => name.endsWith('*') && r.tool.startsWith(name.slice(0, -1)));
    if (family) removed.push({ name: r.tool, rule: d.rule, source: d.source, of: family });
  }
  const has = (tool: string) =>
    !spec.tools || names.includes(tool) || names.some((name) => name.endsWith('*') && tool.startsWith(name.slice(0, -1)));

  const skillTaken = removed.find((r) => r.name === 'Skill');
  const skills = names.includes('Skill')
    ? { names: capabilities.skills.map((s) => s.name), why: null }
    : {
        names: [],
        why: skillTaken
          ? `\`Skill\` is denied by ${skillTaken.rule} (${skillTaken.source}), so it cannot load a skill.`
          : `Its tools have no \`Skill\`, so it cannot load a skill — its session still lists the repository's skills (measured, ${MEASURED_TOOLS.harness} ${MEASURED_TOOLS.version}).`,
      };

  const allowed: AllowedFor = { rules: [], takenBack: [], asked: [], unused: [], bash: [], exceptions: [], dontAsk, askDenier, why: null };
  for (const { rule } of capabilities.allowed) {
    const by = takenBackBy(rule, denied);
    const asks = by ? undefined : takenBackBy(rule, asked);
    const tool = ruleOf(rule)?.tool;
    if (by) allowed.takenBack.push({ rule, by });
    else if (asks) allowed.asked.push({ rule, by: asks });
    else if (tool !== undefined && !has(tool)) allowed.unused.push(rule);
    else allowed.rules.push(rule);
  }
  const narrowerAsks = (rule: string) => narrowerDenies(rule, asked).filter((ask) => !takenBackBy(ask, denied));
  allowed.exceptions = allowed.rules
    .map((rule) => ({ rule, except: narrowerDenies(rule, denied), asks: narrowerAsks(rule) }))
    .filter((e) => e.except.length > 0 || e.asks.length > 0);
  const bashTaken = removed.find((r) => r.name === 'Bash');
  if (names.includes('Bash')) {
    allowed.bash = allowed.rules.flatMap((rule) => {
      const r = ruleOf(rule);
      if (r?.tool !== 'Bash') return [];
      return [{ rule, command: r.scope ?? '*', except: narrowerDenies(rule, denied), asks: narrowerAsks(rule) }];
    });
  } else {
    allowed.why = bashTaken
      ? `\`Bash\` is denied by ${bashTaken.rule} (${bashTaken.source}), so it runs no command, whatever the settings allow.`
      : 'Its tools have no `Bash`, so it runs no command, whatever the settings allow.';
  }

  const covering = (rules: readonly DeniedRule[], command: string) =>
    rules.find((d) => {
      const r = ruleOf(d.rule);
      return r?.tool === 'Bash' && (r.scope === null || bashCovers(r.scope, `${command}:*`));
    }) ?? null;
  const readOnly: ReadOnlyCommand[] = !names.includes('Bash')
    ? []
    : [
        ...READ_ONLY_COMMANDS.measured.map((command) => ({ command, measured: true })),
        ...READ_ONLY_COMMANDS.documented.map((command) => ({ command, measured: false })),
      ].map(({ command, measured }) => {
        const by = covering(denied, command);
        const asks = by ? null : covering(asked, command);
        return { command, measured, denied: by ?? (askDenier ? asks : null), asks };
      });

  const mcp = serversReached(capabilities.mcp, named, { deny, ask, denied, asked, allow: allowed.rules });

  return {
    ...reach,
    claudeCode: true,
    tools: {
      from: spec.tools ? 'declared' : 'measured',
      names,
      inferred: spec.tools ? [] : names.filter((name) => inferred.includes(name)),
      removed,
    },
    skills,
    mcp,
    denied,
    asked,
    allowed,
    readOnly,
  };
}

/**
 * Everything the Capabilities page reads, off the checkout at `repo`: what it offers (`capabilitiesOf`, its servers asked through `asker`
 * with `env`), and what each step of each workflow listed from it and from `home` gets. A workflows directory that cannot be listed is a
 * warning, and no step is shown; the rest is served.
 */
export async function capabilitiesWithSteps(
  repo: string,
  { e, env, home, asker }: { e: Engine['Service']; env: NodeJS.ProcessEnv; home: string; asker: AskServer },
): Promise<CapabilitiesWithSteps> {
  const capabilities = await capabilitiesOf(repo, { env, asker });
  let workflows: WorkflowListing[] = [];
  try {
    workflows = await listWorkflows(e, repo, home);
  } catch (err) {
    capabilities.warnings.push(`${err instanceof Error ? err.message : String(err)} What each step gets is not shown for any workflow.`);
  }
  return { ...capabilities, measured: MEASURED_TOOLS, readOnly: READ_ONLY_COMMANDS, steps: reachOf(capabilities, workflows) };
}
