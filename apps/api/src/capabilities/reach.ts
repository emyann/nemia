/**
 * What each step of each workflow gets: the fence its file declares, beside what of the repository's capabilities reaches it. Pure over
 * what the api read of the checkout (`capabilitiesOf`) and the workflows the package's loader read, as the Workflows page reads them
 * (`listWorkflows`); nothing here starts, asks or writes anything.
 *
 * What a Claude Code step has is read as the harness gives it, as far as it was measured: its `tools:` exactly, or the harness's own set
 * (`measuredTools`, what was inferred marked so); the Skill tool before any skill; every server of the checkout's `.mcp.json` that the
 * settings enable and its agent or its own line names (`mcp:`), whatever its tools; the settings' deny rules and its own
 * `disallowedTools:`; the settings' ask rules; Claude Code's
 * read-only commands, which ask for no rule in any mode (`readOnlyCommands`) unless an ask rule names one; and in `dontAsk`, only what
 * the settings allow of what asks. What asks is denied without a prompt in `dontAsk`, and on a job — every Claude Code step, run on the
 * Agent SDK, whose session answers a call that would ask by denying it, as no person is there — in any mode measured (`askDenierOf`).
 * Rules are matched, and the measured sets read, as the harness's declaration carries them (`rulesOf`, the runtime's, through the
 * orchestrator): deny, then ask, then allow, whatever their specificity, so a deny takes back every allow whose calls it matches, and an
 * ask rule every allow it matches, which asks, and in `dontAsk` is denied. A step on a harness that declares no rules — a Codex step,
 * which reads no `.claude/settings.json`, and nothing of whose sessions was measured: its fence is its sandbox — has nothing else
 * claimed for it.
 */
import { DEFAULT_NAMESPACE } from 'objects';
import { FACTORY_SERVERS } from 'agent-orchestrator';
import { CLAUDE_RULES, DEFAULT_HARNESS, rulesOf, type ClaudeRules } from 'agent-orchestrator/workflow';
import { type AskServer, capabilitiesOf, SETTINGS, type Capabilities, type DeniedRule, type McpServer } from './capabilities.ts';
import { runPlaced, type Engine, type RunsOn } from '../store.ts';
import { listWorkflows, type InRequest, type WorkflowListing, type WorkflowSource, type WorkflowStepSpec } from '../workflows/workflows.ts';
import type { PlaceService } from 'agent-orchestrator';

/**
 * Why what asks is denied without a prompt on a Claude Code step: `dontAsk`, which denies it in any session; or it runs as a job, which has
 * no one to ask — every step on a harness whose rules say a job of it was measured denying what asks in its mode (`jobDeniesAsksIn`).
 * Null on another harness, and in a mode not measured.
 */
export const askDenierOf = (harness: string, spec: Pick<WorkflowStepSpec, 'permissionMode'>): 'dontAsk' | 'a job' | null => {
  if (spec.permissionMode === 'dontAsk') return 'dontAsk';
  return rulesOf(harness)?.jobDeniesAsksIn(spec.permissionMode) === true ? 'a job' : null;
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
 * — `dontAsk`, or `a job`, which asks nobody — and null where the page claims neither: a job in a mode not measured.
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
 * documented so (`readOnlyCommands`); the ask rule that makes all of it ask, when no deny refuses it — `Bash`, or a Bash rule covering
 * `<command> *` — which beats the harness's own leave as it beats an allow; and the rule that refuses all of it: a deny so covering it, or
 * that ask rule on a step that denies what asks (`askDenierOf`).
 */
export type ReadOnlyCommand = { command: string; measured: boolean; denied: DeniedRule | null; asks: DeniedRule | null };

export type StepReach = {
  workflow: string;
  from: WorkflowSource;
  step: string;
  /** The harness it runs on: the step's, or the default harness when it names none. */
  harness: string;
  /** Whether its harness declares rules — Claude Code's, whose set was measured. Every field below that says null says it is not. */
  claudeCode: boolean;
  /**
   * The fence as its file declares it, null where it declares none. `mcp` is the servers its sessions load, its agent's `mcp:` line
   * then its own: empty where neither names any and for a step with no agent, whose sessions load no server.
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
   * `inferred` are those of the measured set no measurement named (`measuredTools.inferred`); none for a step that declares its tools.
   */
  tools: { from: 'declared' | 'measured'; names: string[]; inferred: string[]; removed: RemovedTool[] } | null;
  /** The repository's skills it can load — every one, with the Skill tool; none without it, and why. */
  skills: { names: string[]; why: string | null } | null;
  /**
   * Each server the step or its agent names (`fence.mcp`): one the checkout enables with the tools it listed, or why there are none to
   * show; and one no `.mcp.json` of the checkout declares with no tools and why, since a session of the step is refused at its start.
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
  measured: ClaudeRules['measuredTools'];
  readOnly: ClaudeRules['readOnlyCommands'];
  steps: StepReach[];
};

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
      why: `The checkout's .mcp.json declares no server named ${server}: a session of this step is refused at its start. Declare the server there, or take the name off the \`mcp:\` line that names it, the step's or its agent's.`,
    }));

/** What follows why a named server's tools are not listed, where the settings do not enable it: a step's session loads it by its name. */
const LOADED_ANYWAY =
  " A session of this step loads it all the same: an `mcp:` line, its own or its agent's, names it, and the settings are not asked.";

/**
 * The servers a step's sessions load, each with the tools it listed as the step's rules leave them: those the checkout declares among the
 * ones its agent names (`named`), enabled by the settings or not — one the api did not ask says why, and that it is loaded — then a row
 * for each name the checkout does not declare (`undeclared`).
 */
function serversReached(
  servers: Capabilities['mcp'],
  named: readonly string[],
  { denyingRule }: ClaudeRules,
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
            denied: rule === null ? null : (rules.denied.find((d) => d.rule === rule) ?? null),
            asks: asking === null ? null : (rules.asked.find((a) => a.rule === asking) ?? null),
            allowed: rule === null && asking === null && denyingRule(rules.allow, server.name, tool.name) !== null,
          };
        }) ?? null,
      why: server.tools ? null : `${server.error ?? server.notAsked ?? 'It did not list its tools.'}${server.enabled ? '' : LOADED_ANYWAY}`,
    }));
  return [...loaded, ...undeclared(named, servers)];
}

/** The fence a step's file declares (`StepReach['fence']`), with the servers its sessions load, `named`. */
const fenceOf = (spec: WorkflowStepSpec, named: readonly string[]): StepReach['fence'] => ({
  tools: spec.tools,
  disallowedTools: spec.disallowedTools,
  allowedTools: spec.allowedTools,
  permissionMode: spec.permissionMode,
  sandbox: spec.sandbox,
  effort: spec.effort,
  mcp: [...named],
});

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
  const harness = spec.harness ?? DEFAULT_HARNESS;
  const dontAsk = spec.permissionMode === 'dontAsk';
  const rules = rulesOf(harness);
  const askDenier = rules === undefined ? null : askDenierOf(harness, spec);
  const reach = {
    workflow: workflow.name,
    from: workflow.from,
    step,
    harness,
    fence: fenceOf(spec, named),
  };
  if (rules === undefined) {
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

  const { ruleOf, bashCovers, takenBackBy, narrowerRules, measuredTools } = rules;
  const denied = [...capabilities.denied, ...spec.disallowedTools.map((rule) => ({ rule, source: DISALLOW }))];
  const deny = denied.map((d) => d.rule);
  const { asked } = capabilities;
  const ask = asked.map((a) => a.rule);
  const inferred: readonly string[] = measuredTools.inferred.map((t) => t.name);
  const offered: readonly string[] = spec.tools ?? [...measuredTools.tools, ...inferred];
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
          : `Its tools have no \`Skill\`, so it cannot load a skill — its session still lists the repository's skills (measured, ${measuredTools.harness} ${measuredTools.version}).`,
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
  const narrowerAsks = (rule: string) => narrowerRules(rule, asked).filter((ask) => !takenBackBy(ask, denied));
  allowed.exceptions = allowed.rules
    .map((rule) => ({ rule, except: narrowerRules(rule, denied), asks: narrowerAsks(rule) }))
    .filter((e) => e.except.length > 0 || e.asks.length > 0);
  const bashTaken = removed.find((r) => r.name === 'Bash');
  if (names.includes('Bash')) {
    allowed.bash = allowed.rules.flatMap((rule) => {
      const r = ruleOf(rule);
      if (r?.tool !== 'Bash') return [];
      return [{ rule, command: r.scope ?? '*', except: narrowerRules(rule, denied), asks: narrowerAsks(rule) }];
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
        ...rules.readOnlyCommands.measured.map((command) => ({ command, measured: true })),
        ...rules.readOnlyCommands.documented.map((command) => ({ command, measured: false })),
      ].map(({ command, measured }) => {
        const by = covering(denied, command);
        const asks = by ? null : covering(asked, command);
        return { command, measured, denied: by ?? (askDenier ? asks : null), asks };
      });

  const mcp = serversReached(capabilities.mcp, named, rules, { deny, ask, denied, asked, allow: allowed.rules });

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
 * `servers` with the state the harness reports of each server the **default factory** records under the same name: the default factory
 * is the one every run and card that names none runs in, so a server it records is one the checkout's own steps are handed, and the
 * page shows the same chip the factory's settings page does.
 *
 * A server the default factory does not record keeps `factoryState: null` — a `.mcp.json` server has no sign-in of ours to show — and
 * so does one whose state could not be read, which is not an absence. The read is one short-lived harness session for the whole
 * record, and none at all for a default factory that records no server, which is the common case.
 */
const statedByFactory = async (servers: readonly McpServer[], e: Engine['Service'], on: RunsOn, home: string): Promise<McpServer[]> => {
  if (!servers.length) return [...servers];
  const listing = await runPlaced({ ...on, home }, e, FACTORY_SERVERS.handler({ factory: DEFAULT_NAMESPACE })).catch(() => undefined);
  const by = new Map((listing?.servers ?? []).map((s) => [s.name, s.state]));
  return servers.map((server) => ({ ...server, factoryState: by.get(server.name) ?? null }));
};

/**
 * Everything the Capabilities page reads, off the checkout at `repo`: what it offers (`capabilitiesOf`, its servers asked through `asker`
 * with `env`), and what each step of each workflow listed from it and from `home` gets. A workflows directory that cannot be listed is a
 * warning, and no step is shown; the rest is served.
 */
export async function capabilitiesWithSteps(
  repo: string,
  {
    e,
    placeService,
    trace,
    config,
    env,
    home,
    asker,
    inRequest,
  }: {
    e: Engine['Service'];
    placeService: PlaceService['Service'];
    trace: RunsOn['trace'];
    config: RunsOn['config'];
    env: NodeJS.ProcessEnv;
    home: string;
    asker: AskServer;
    inRequest: InRequest;
  },
): Promise<CapabilitiesWithSteps> {
  const capabilities = await capabilitiesOf(repo, { env, asker });
  capabilities.mcp = await statedByFactory(capabilities.mcp, e, { placeService, config, trace }, home);
  let workflows: WorkflowListing[] = [];
  try {
    workflows = await listWorkflows(e, { placeService, config, trace }, repo, home, inRequest);
  } catch (err) {
    capabilities.warnings.push(`${err instanceof Error ? err.message : String(err)} What each step gets is not shown for any workflow.`);
  }
  return {
    ...capabilities,
    measured: CLAUDE_RULES.measuredTools,
    readOnly: CLAUDE_RULES.readOnlyCommands,
    steps: reachOf(capabilities, workflows),
  };
}
