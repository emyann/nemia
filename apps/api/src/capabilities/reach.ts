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
import { type CapabilitiesWithSteps, type CapabilityRule, type CapabilityServer, DEFAULT_NAMESPACE, type StepReach } from 'objects';
import { FACTORY_SERVERS } from 'agent-orchestrator';
import { CLAUDE_RULES, DEFAULT_HARNESS, rulesOf, type ClaudeRules } from 'agent-orchestrator/workflow';
import { type AskServer, capabilitiesOf, SETTINGS, type Capabilities } from './capabilities.ts';
import { runPlaced, type Engine, type RunsOn } from '../store.ts';
import { listWorkflows, type InRequest, type WorkflowListing, type WorkflowStepSpec } from '../workflows/workflows.ts';
import type { PlaceService } from 'agent-orchestrator';

/**
 * Why what asks is denied without a prompt on a Claude Code step: `dontAsk`, which denies it in any session; or it runs as a job, which has
 * no one to ask — every step on a harness whose rules say a job of it was measured denying what asks in its mode (`jobDeniesAsksIn`).
 * Null on another harness, and in a mode not measured.
 * @param harness The step's harness, by its name.
 * @param spec The step's spec, read for its permission mode.
 */
export const askDenierOf = (harness: string, spec: Pick<WorkflowStepSpec, 'permissionMode'>): 'dontAsk' | 'a job' | null => {
  if (spec.permissionMode === 'dontAsk') return 'dontAsk';
  return rulesOf(harness)?.jobDeniesAsksIn(spec.permissionMode) === true ? 'a job' : null;
};

/** Where a step's own deny rules are read from. */
export const DISALLOW = 'disallowedTools:';

/** What the settings' allow rules give a step (objects' `StepReach`, its `allowed`). */
type StepReachAllowed = StepReach['allowed'];

/** A tool taken from a step by a deny rule (objects' `StepReach`, its `tools.removed`). */
type RemovedTool = NonNullable<StepReach['tools']>['removed'][number];

/** A server's tool as it reaches a step (objects' `StepReach`, its `mcp`'s `tools`). */
type ReachedMcpTool = NonNullable<NonNullable<StepReach['mcp']>[number]['tools']>[number];

/** One of Claude Code's read-only commands as it reaches a step with Bash (objects' `StepReach`, its `readOnly`). */
type ReadOnlyCommand = NonNullable<StepReach['readOnly']>[number];

/**
 * What each step of each workflow that reads gets. A folder the loader refuses has no step to give anything to.
 * @param capabilities What the repository offers and its rules deny, ask and allow.
 * @param workflows The workflows listed, each with its steps or why it does not read.
 */
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
  rules: {
    deny: readonly string[];
    ask: readonly string[];
    denied: readonly CapabilityRule[];
    asked: readonly CapabilityRule[];
    allow: readonly string[];
  },
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

  const narrowerAsks = (rule: string) => narrowerRules(rule, asked).filter((ask) => !takenBackBy(ask, denied));
  const allowed = allowedOf(rules, capabilities.allowed, { denied, asked, has, narrowerAsks }, names.includes('Bash'), {
    dontAsk,
    askDenier,
    bashTaken: removed.find((r) => r.name === 'Bash'),
  });

  const covering = (rules: readonly CapabilityRule[], command: string) =>
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
 * What the settings' allow rules give a Claude Code step (objects' `StepReachAllowed`): deny, then ask, then allow, each allow rule taken
 * back by the first deny or ask rule that matches the whole of it, or unused where its tool is not the step's.
 * @param rules The harness's rules, which match a rule against another.
 * @param allow The settings' allow rules, in their order.
 * @param over The deny and ask rules that hold for the step, whether it has a tool, and the narrower ask rules under a rule.
 * @param hasBash Whether the step has Bash, without which no Bash rule stands as a command.
 * @param mode Whether the step runs in `dontAsk`, why what asks is denied, and the deny that took Bash, if one did.
 */
function allowedOf(
  { ruleOf, takenBackBy, narrowerRules }: ClaudeRules,
  allow: readonly CapabilityRule[],
  over: {
    denied: readonly CapabilityRule[];
    asked: readonly CapabilityRule[];
    has: (tool: string) => boolean;
    narrowerAsks: (rule: string) => string[];
  },
  hasBash: boolean,
  mode: { dontAsk: boolean; askDenier: StepReachAllowed['askDenier']; bashTaken: RemovedTool | undefined },
): StepReachAllowed {
  const { denied, asked, has, narrowerAsks } = over;
  const standing: string[] = [];
  const takenBack: Array<StepReachAllowed['takenBack'][number]> = [];
  const askedBack: Array<StepReachAllowed['asked'][number]> = [];
  const unused: string[] = [];
  for (const { rule } of allow) {
    const by = takenBackBy(rule, denied);
    const asks = by ? undefined : takenBackBy(rule, asked);
    const tool = ruleOf(rule)?.tool;
    if (by) takenBack.push({ rule, by });
    else if (asks) askedBack.push({ rule, by: asks });
    else if (tool !== undefined && !has(tool)) unused.push(rule);
    else standing.push(rule);
  }
  const { bashTaken } = mode;
  return {
    rules: standing,
    takenBack,
    asked: askedBack,
    unused,
    bash: hasBash
      ? standing.flatMap((rule) => {
          const r = ruleOf(rule);
          if (r?.tool !== 'Bash') return [];
          return [{ rule, command: r.scope ?? '*', except: narrowerRules(rule, denied), asks: narrowerAsks(rule) }];
        })
      : [],
    exceptions: standing
      .map((rule) => ({ rule, except: narrowerRules(rule, denied), asks: narrowerAsks(rule) }))
      .filter((e) => e.except.length > 0 || e.asks.length > 0),
    dontAsk: mode.dontAsk,
    askDenier: mode.askDenier,
    why: hasBash
      ? null
      : bashTaken
        ? `\`Bash\` is denied by ${bashTaken.rule} (${bashTaken.source}), so it runs no command, whatever the settings allow.`
        : 'Its tools have no `Bash`, so it runs no command, whatever the settings allow.',
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
const statedByFactory = async (
  servers: readonly CapabilityServer[],
  e: Engine['Service'],
  on: RunsOn,
  home: string,
): Promise<CapabilityServer[]> => {
  if (!servers.length) return [...servers];
  const listing = await runPlaced({ ...on, home }, e, FACTORY_SERVERS.handler({ factory: DEFAULT_NAMESPACE })).catch(() => undefined);
  const by = new Map((listing?.servers ?? []).map((s) => [s.name, s.state]));
  return servers.map((server) => ({ ...server, factoryState: by.get(server.name) ?? null }));
};

/**
 * Everything the Capabilities page reads, off the checkout at `repo`: what it offers (`capabilitiesOf`, its servers asked through `asker`
 * with `env`), and what each step of each workflow listed from it and from `home` gets. A workflows directory that cannot be listed is a
 * warning, and no step is shown; the rest is served.
 * @param repo The checkout's folder, whose offer and workflows are read.
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
  const read = await capabilitiesOf(repo, { env, asker });
  const mcp = await statedByFactory(read.mcp, e, { placeService, config, trace }, home);
  let workflows: WorkflowListing[] = [];
  let unlisted: string[] = [];
  try {
    workflows = await listWorkflows(e, { placeService, config, trace }, repo, home, inRequest);
  } catch (err) {
    unlisted = [`${err instanceof Error ? err.message : String(err)} What each step gets is not shown for any workflow.`];
  }
  const capabilities = { ...read, mcp, warnings: [...read.warnings, ...unlisted] };
  return {
    ...capabilities,
    measured: CLAUDE_RULES.measuredTools,
    readOnly: CLAUDE_RULES.readOnlyCommands,
    steps: reachOf(capabilities, workflows),
  };
}
