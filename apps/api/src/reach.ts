/**
 * What each step of each workflow gets: the fence its file declares, beside what of the repository's capabilities reaches it — the second half of
 * B1 (docs/plan-hold-the-bar.md §6 item 14). Pure over what the api read of the checkout (`capabilitiesOf`) and the workflows the package's loader
 * read, as the Workflows page reads them (`listWorkflows`); nothing here starts, asks or writes anything.
 *
 * What a Claude Code step has is read as the harness gives it, as far as it was measured: its `tools:` exactly, or the harness's own set
 * (`MEASURED_TOOLS`); the Skill tool before any skill; every server of the checkout's `.mcp.json` that the settings enable, whatever its tools;
 * the settings' deny rules and its own `disallow:`, a deny beating an allow; and in `dontAsk`, only what the settings allow of what asks. Nothing
 * of a Codex step was measured, and its fence is its sandbox: the page says so, and does not guess.
 */
import { HARNESSES } from 'agent-workflows';
import { capabilitiesOf, denyingRule, MEASURED_TOOLS, type Capabilities, type DeniedRule } from './capabilities.ts';
import { listWorkflows, type WorkflowListing, type WorkflowSource, type WorkflowStepSpec } from './workflows.ts';

/** The harnesses that are Claude Code, as the engine names them: its `--bg` sessions, and `claude -p` detached. */
const CLAUDE_CODE: ReadonlySet<string> = new Set(['claude', 'claude-detached']);

/** Where a step's own deny rules are read from. */
export const DISALLOW = 'disallow:';

/** A tool taken from a step by a deny rule: the tool, the rule and where it was read — and the family the set names it in, for one taken from `Cron*`. */
export type RemovedTool = { name: string; rule: string; source: string; of: string | null };

/** A server's tool as it reaches a step: the rule that denies it, and whether a rule allows it — which, in `dontAsk`, is whether it runs at all. */
export type ReachedMcpTool = { name: string; denied: DeniedRule | null; allowed: boolean };

export type StepReach = {
  workflow: string;
  from: WorkflowSource;
  step: string;
  /** The harness it runs on: the step's, or the engine's first when it names none. */
  harness: string;
  /** Whether it runs on Claude Code, whose set was measured. Every field below that says null says it is not. */
  claudeCode: boolean;
  /** The fence as its file declares it, null where it declares none. A step names no MCP server: `mcp:` is not a key a step has. */
  fence: { tools: string[] | null; disallow: string[]; permissionMode: string | null; effort: string | null; mcp: null };
  /** The built-in tools it has: its `tools:` exactly (`declared`), or the harness's own set (`measured`), less what a deny rule names. */
  tools: { from: 'declared' | 'measured'; names: string[]; removed: RemovedTool[] } | null;
  /** The repository's skills it can load — every one, with the Skill tool; none without it, and why. */
  skills: { names: string[]; why: string | null } | null;
  /** Each server the checkout enables, with the tools it listed, or why there are none to show. */
  mcp: Array<{ server: string; tools: ReachedMcpTool[] | null; why: string | null }> | null;
  /** Every deny rule that holds for it: the settings', then its own. */
  denied: DeniedRule[];
  /**
   * The settings' allow rules, less each one a deny of the same words takes back — a deny beats an allow — and `bash` the commands of its Bash
   * rules. `dontAsk` is whether the step runs in it, where anything that asks and no rule allows is denied without a prompt.
   */
  allowed: { rules: string[]; bash: string[]; dontAsk: boolean };
};

/** What the Capabilities page reads: the repository's capabilities, the measured set a step without `tools:` has, and what each step gets. */
export type CapabilitiesWithSteps = Capabilities & { measured: typeof MEASURED_TOOLS; steps: StepReach[] };

/** A tool's name in a rule that names one whole tool: no parentheses, no server. */
const WHOLE_TOOL = /^[A-Za-z][A-Za-z0-9]*$/;

/** What each step of each workflow that reads gets. A folder the loader refuses has no step to give anything to. */
export function reachOf(capabilities: Pick<Capabilities, 'skills' | 'mcp' | 'denied' | 'allowed'>, workflows: readonly WorkflowListing[]): StepReach[] {
  return workflows.filter((w) => w.error === null).flatMap((w) => w.steps.map(({ name, spec }) => stepReach(capabilities, w, name, spec)));
}

function stepReach(capabilities: Pick<Capabilities, 'skills' | 'mcp' | 'denied' | 'allowed'>, workflow: WorkflowListing, step: string, spec: WorkflowStepSpec): StepReach {
  const harness = spec.harness ?? Object.keys(HARNESSES)[0]!;
  const denied = [...capabilities.denied, ...spec.disallow.map((rule) => ({ rule, source: DISALLOW }))];
  const deny = denied.map((d) => d.rule);
  // A deny beats an allow: an allow rule a deny of the same words names is taken back. Matched as words, as the settings match an allow.
  const rules = capabilities.allowed.map((a) => a.rule).filter((rule) => !deny.includes(rule));
  const allowed = { rules, bash: rules.flatMap((rule) => /^Bash\((.+)\)$/.exec(rule)?.[1] ?? []), dontAsk: spec.permissionMode === 'dontAsk' };
  const reach = {
    workflow: workflow.name, from: workflow.from, step, harness,
    fence: { tools: spec.tools, disallow: spec.disallow, permissionMode: spec.permissionMode, effort: spec.effort, mcp: null },
    denied, allowed,
  };
  if (!CLAUDE_CODE.has(harness)) return { ...reach, claudeCode: false, tools: null, skills: null, mcp: null };

  const offered: readonly string[] = spec.tools ?? MEASURED_TOOLS.tools;
  const removed: RemovedTool[] = [];
  const names = offered.filter((name) => {
    const by = denied.find((d) => d.rule === name);
    if (by) removed.push({ name, rule: by.rule, source: by.source, of: null });
    return !by;
  });
  // A rule naming one tool of a family the set names as one — `CronCreate` of `Cron*`: the family stays, and the tool is named as taken.
  for (const d of denied) {
    if (!WHOLE_TOOL.test(d.rule) || offered.includes(d.rule)) continue;
    const family = names.find((name) => name.endsWith('*') && d.rule.startsWith(name.slice(0, -1)));
    if (family) removed.push({ name: d.rule, rule: d.rule, source: d.source, of: family });
  }

  const skillTaken = removed.find((r) => r.name === 'Skill');
  const skills = names.includes('Skill')
    ? { names: capabilities.skills.map((s) => s.name), why: null }
    : {
        names: [],
        why: skillTaken
          ? `\`Skill\` is denied by ${skillTaken.rule} (${skillTaken.source}), so it cannot load a skill.`
          : `Its tools have no \`Skill\`, so it cannot load a skill — its session still lists the repository's skills (measured, ${MEASURED_TOOLS.harness} ${MEASURED_TOOLS.version}).`,
      };

  const mcp = capabilities.mcp.filter((server) => server.enabled).map((server) => ({
    server: server.name,
    tools: server.tools?.map((tool): ReachedMcpTool => {
      const rule = denyingRule(deny, server.name, tool.name);
      return { name: tool.name, denied: rule === null ? null : denied.find((d) => d.rule === rule)!, allowed: denyingRule(rules, server.name, tool.name) !== null };
    }) ?? null,
    why: server.tools ? null : server.error ?? server.notAsked ?? 'It did not list its tools.',
  }));

  return { ...reach, claudeCode: true, tools: { from: spec.tools ? 'declared' : 'measured', names, removed }, skills, mcp };
}

/**
 * Everything the Capabilities page reads, off the checkout at `repo`: what it offers (`capabilitiesOf`), and what each step of each workflow
 * gets. A workflows directory that cannot be listed is a warning, and no step is shown; the rest is served.
 */
export async function capabilitiesWithSteps(repo: string): Promise<CapabilitiesWithSteps> {
  const capabilities = await capabilitiesOf(repo);
  let workflows: WorkflowListing[] = [];
  try {
    workflows = listWorkflows(repo);
  } catch (err) {
    capabilities.warnings.push(`${err instanceof Error ? err.message : String(err)} What each step gets is not shown for any workflow.`);
  }
  return { ...capabilities, measured: MEASURED_TOOLS, steps: reachOf(capabilities, workflows) };
}
