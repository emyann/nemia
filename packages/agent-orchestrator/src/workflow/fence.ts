/**
 * Fences only tighten: a step that names an agent, or is hired one, may narrow the agent's fence and never widen it. `fenceRefusal` judges
 * the fence keys a step writes itself — `tools:`, `allowedTools:`, `disallowedTools:`, `permissionMode:` and `sandbox:` — against its
 * agent's, a step that runs a fenced agent on the other harness, whose fence cannot be compared with the agent's, and a step's
 * `background: true` over an agent an allow rule would widen: a background session also reads the person's own settings.
 */
import { AGENTS_FOLDER, type StepKey, type Workflow } from '../step/step.ts';
import { DEFAULT_HARNESS, isRemoteHarness } from '../harness/harness.ts';
import { DEFAULT_PERMISSION_MODE, rulesOf, toolsOf } from '../keys/index.ts';
import type { Agent } from '../agents/agents.ts';

/**
 * How wide each permission mode is, for a job that nobody answers: `plan` changes nothing; `default`, `manual` and the mode a held session
 * runs in (`HELD_MODE`) run what the rules allow and deny the rest, since a job denies whatever they would ask; the next writes in its
 * directory unasked; `auto` lets a classifier allow what it judges safe; the widest asks about nothing.
 */
export const MODE_RANK: Readonly<Record<string, number>> = {
  plan: 0,
  dontAsk: 1,
  default: 1,
  manual: 1,
  acceptEdits: 2,
  auto: 3,
  bypassPermissions: 4,
};

/** The widest permission mode in `MODE_RANK`, which asks about nothing and so is widened by no allow rule. */
const WIDEST_MODE = Object.keys(MODE_RANK).reduce((wide, mode) => (MODE_RANK[mode] > MODE_RANK[wide] ? mode : wide));

/**
 * Whether a session in permission mode `mode` — the runtime's default when `undefined` — writes in its directory unasked: the narrowest
 * mode that does and every wider one. Such a mode grants what an `allowedTools:` rule `Edit(…)` on a path inside the directory would.
 */
export const editsUnasked = (mode: string | undefined): boolean =>
  (MODE_RANK[mode ?? DEFAULT_PERMISSION_MODE] ?? 0) >= MODE_RANK.acceptEdits;

/** The mode a session held to its directory runs in, which runs what its rules allow and denies the rest. */
const HELD_MODE = 'dontAsk';

/** The allow rules a session held to its directory keeps, as the path patterns covering every path inside it (`pathCovers`). */
const IN_DIRECTORY = ['Edit(**)', 'Read(**)'];

/**
 * The fence that holds a session of an agent to its directory, never wider than the agent's own (`fenceRefusal` lets it through):
 * `HELD_MODE`, or the agent's mode `mode` where that is narrower; and `Edit(**)` under a mode that edits unasked
 * (`editsUnasked`), else those of the agent's allow rules `allows`, as written, that a rule inside the directory covers. Undefined when
 * the agent has allow rules and none is inside its directory: a step's list replaces its agent's and cannot be empty, so the agent's own
 * would run.
 */
export function directoryFence(
  mode: string | undefined,
  allows: string | undefined,
): { permissionMode: string; allowedTools: string[] } | undefined {
  const own = mode ?? DEFAULT_PERMISSION_MODE;
  const permissionMode = (MODE_RANK[own] ?? 0) < MODE_RANK[HELD_MODE] ? own : HELD_MODE;
  if (editsUnasked(mode)) return { permissionMode, allowedTools: ['Edit(**)'] };
  const rules = (allows ?? '')
    .split(',')
    .map((rule) => rule.trim())
    .filter(Boolean);
  const allowedTools = rules.filter((rule) => IN_DIRECTORY.some((by) => covers(by, rule)));
  return rules.length && !allowedTools.length ? undefined : { permissionMode, allowedTools };
}

/**
 * How wide each of codex's sandboxes is, narrowest first: `read-only` writes nothing, `workspace-write` writes in the workspace,
 * `danger-full-access` anywhere. The runtime's own list, in its order, which `test/fence.test.ts` holds this ranking to.
 */
export const SANDBOX_RANK: readonly string[] = ['read-only', 'workspace-write', 'danger-full-access'];

/** Whether a harness fences a session with a sandbox (`SANDBOX_RANK`) rather than a permission mode and rule lists: codex alone. */
export const sandboxed = (harness: string): boolean => harness === 'codex';

/** The sandbox a sandboxed session runs in when its step names none, the runtime's (`sandboxOf`). */
export const DEFAULT_SANDBOX = 'workspace-write';

/** The keys of a step's fence, either harness's: a sandboxed step's `permissionMode:` is read as its `sandbox:` before this sees it. */
const FENCE_KEYS = ['tools', 'allowedTools', 'disallowedTools', 'permissionMode', 'sandbox'] as const;

/** One of a fence's keys. */
type FenceKey = (typeof FENCE_KEYS)[number];

/** The words of a refusal that names one key: the step's line and its agent's file. */
type Said = { step: string; line: string; agent: string; file: string };

/**
 * Why step `step` would widen its agent's fence, or `undefined` when it does not: `own` are the keys the step writes itself, the
 * sandbox under its own name (`codexSandboxNamed`), and `resolved` the step they were read into, with the agent's. A key the step
 * does not write is its agent's and widens nothing, and `background: true` widens it as an allow rule would (`backgroundRefusal`). A
 * remote step is left to `remoteRefusal` in harness.ts, which refuses every fence key there. The refusal names the step, the key, what it
 * would add, and the fix.
 */
export function fenceRefusal(step: string, agent: Agent, own: Partial<Record<StepKey, string>>, resolved: Workflow): string | undefined {
  const harness = resolved.harness ?? DEFAULT_HARNESS;
  if (isRemoteHarness(harness)) return undefined;
  const file = `${AGENTS_FOLDER}/${agent.name}.md`;
  const moved = movedRefusal(step, agent, file, harness);
  if (moved !== undefined) return moved;
  const judge: Record<FenceKey, (said: Said) => string | undefined> = {
    tools: (said) => toolsRefusal(said, resolved.tools ?? [], agentTools(agent, file)),
    allowedTools: (said) =>
      allowsRefusal(said, resolved.allowedTools ?? [], agentRules(agent, file, 'allowedTools'), agent.keys.permissionMode),
    disallowedTools: (said) => deniesRefusal(said, resolved.disallowedTools ?? [], agentRules(agent, file, 'disallowedTools')),
    permissionMode: (said) => modeRefusal(said, resolved.permissionMode ?? '', agent.keys.permissionMode),
    sandbox: (said) => sandboxRefusal(said, resolved.sandbox ?? '', agent.keys.sandbox),
  };
  for (const key of FENCE_KEYS) {
    const why = own[key] === undefined ? undefined : judge[key]({ step, line: `${key}: ${own[key]}`, agent: agent.name, file });
    if (why !== undefined) return why;
  }
  if (resolved.background !== true) return undefined;
  return backgroundRefusal({ step, line: 'background: true', agent: agent.name, file }, agent.keys.permissionMode);
}

/** The harness an agent runs on by its own file. */
const agentHarness = (agent: Agent): string => agent.keys.harness ?? DEFAULT_HARNESS;

/** The agent's `tools:` as a list, or `undefined` for none: every tool. */
const agentTools = (agent: Agent, file: string): string[] | undefined => toolsOf(file, agent.keys.tools, agentHarness(agent));

/** The agent's allow or deny rules, `[]` for none. */
const agentRules = (agent: Agent, file: string, key: 'allowedTools' | 'disallowedTools'): string[] =>
  rulesOf(file, key, agent.keys[key]) ?? [];

/** A list of names or rules, each in backticks. */
const listed = (names: readonly string[]): string => names.map((n) => `\`${n}\``).join(', ');

/** What every refusal says after its first sentence: the rule, and two of the three fixes it shares. */
const tighten = (said: Said, widen: string): string =>
  `— a step may only tighten its agent's fence. ${widen} in ${said.file} (every step of ${said.agent} gets it), or attach another agent.`;

/**
 * Refused: a step that runs an agent whose file sets a fence key on a harness fenced the other way — an agent fenced by a mode on a
 * harness fenced by a sandbox, or the other way round. A sandbox and a permission mode cannot be compared, so a move would let a step
 * widen the fence by its harness.
 */
function movedRefusal(step: string, agent: Agent, file: string, harness: string): string | undefined {
  const from = agentHarness(agent);
  if (isRemoteHarness(from) || sandboxed(from) === sandboxed(harness)) return undefined;
  const fence = FENCE_KEYS.filter((key) => agent.keys[key] !== undefined).map((key) => `${key}: ${agent.keys[key]}`);
  if (!fence.length) return undefined;
  return `${step}: \`harness: ${harness}\` runs its agent ${agent.name} on ${harness}, and ${file} fences it for ${from} (${listed(fence)}): the two harnesses' fences cannot be compared, and a step may only tighten its agent's fence. Delete the \`harness:\` line, or attach an agent written for ${harness}.`;
}

/** Refused: a `tools:` list naming a tool the agent's own list does not; an agent with no list has every tool. */
function toolsRefusal(said: Said, tools: readonly string[], agents: readonly string[] | undefined): string | undefined {
  const added = agents === undefined ? [] : tools.filter((tool) => !agents.includes(tool));
  if (!added.length) return undefined;
  return `${said.step}: \`${said.line}\` would give its agent ${said.agent} ${listed(added)}, which ${said.file} does not ${tighten(said, `Take ${added.length > 1 ? 'them' : 'it'} off the line, or add ${added.length > 1 ? 'them' : 'it'} to \`tools:\``)}`;
}

/**
 * Refused: an `allowedTools:` rule that neither one of the agent's allow rules covers (`covers`) nor the agent's mode grants
 * (`modeGrants`); an agent with no rules and a mode that asks allows nothing.
 */
function allowsRefusal(said: Said, rules: readonly string[], agents: readonly string[], mode: string | undefined): string | undefined {
  const added = rules.filter((rule) => !modeGrants(mode, rule) && !agents.some((by) => covers(by, rule)));
  if (!added.length) return undefined;
  return `${said.step}: \`${said.line}\` would allow its agent ${said.agent} ${listed(added)}, which ${said.file} does not allow ${tighten(said, `Take ${added.length > 1 ? 'them' : 'it'} off the line, or allow ${added.length > 1 ? 'them' : 'it'} in \`allowedTools:\``)}`;
}

/** Refused: a `disallowedTools:` list that leaves out a deny of the agent's, which it would lift: a step's list replaces its agent's. */
function deniesRefusal(said: Said, rules: readonly string[], agents: readonly string[]): string | undefined {
  const lifted = agents.filter((deny) => !rules.some((by) => covers(by, deny)));
  if (!lifted.length) return undefined;
  const whole = [...agents, ...rules.filter((rule) => !agents.includes(rule))].join(', ');
  return `${said.step}: \`${said.line}\` would lift ${listed(lifted)}, which ${said.file} denies its agent ${said.agent}: a step's \`disallowedTools:\` replaces its agent's, and a step may only tighten its agent's fence. Keep the agent's denies on the line and add yours — \`disallowedTools: ${whole}\` — or attach another agent.`;
}

/** Refused: a permission mode wider than the agent's, or than the runtime's default when its file names none (`MODE_RANK`). */
function modeRefusal(said: Said, mode: string, agents: string | undefined): string | undefined {
  const agentMode = agents ?? DEFAULT_PERMISSION_MODE;
  if ((MODE_RANK[mode] ?? 0) <= (MODE_RANK[agentMode] ?? 0)) return undefined;
  const narrower = Object.keys(MODE_RANK).filter((m) => MODE_RANK[m] <= MODE_RANK[agentMode]);
  const runs =
    agents === undefined
      ? `names no mode, so its agent runs in \`${agentMode}\`, the runtime's default`
      : `runs its agent in \`${agentMode}\``;
  return `${said.step}: \`${said.line}\` is wider than ${said.file}, which ${runs} ${tighten(said, `Name one as narrow or narrower — ${listed(narrower)} — or widen the mode`)}`;
}

/**
 * Refused: `background: true` over an agent in any mode but the widest (`WIDEST_MODE`), or over one whose file names no mode. A
 * background session also reads the person's own user and local settings, where each "don't ask again" writes an allow rule, and every
 * other mode runs more of what such a rule allows; `agents` is the agent's mode, never the step's, since the rule widens the agent's.
 */
function backgroundRefusal(said: Said, agents: string | undefined): string | undefined {
  const agentMode = agents ?? DEFAULT_PERMISSION_MODE;
  if (MODE_RANK[agentMode] === MODE_RANK[WIDEST_MODE]) return undefined;
  const runs =
    agents === undefined
      ? `names no mode, so its agent runs in \`${agentMode}\`, the runtime's default`
      : `runs its agent in \`${agentMode}\``;
  return `${said.step}: \`${said.line}\` runs the step's sessions as background sessions, which also read the person's own user and local settings, where each "don't ask again" writes an allow rule; ${said.file} ${runs}, which runs what such a rule allows — a step may only tighten its agent's fence. Delete the line and the step runs as a job, which reads only the checkout's settings, or attach an agent whose file runs it in \`${WIDEST_MODE}\`, which no allow rule widens, and which denies by name what it must never do.`;
}

/** Refused: a sandbox wider than the agent's, or than its harness's default when its file names none (`DEFAULT_SANDBOX`). */
function sandboxRefusal(said: Said, sandbox: string, agents: string | undefined): string | undefined {
  const order = SANDBOX_RANK;
  const agentSandbox = agents ?? DEFAULT_SANDBOX;
  if (order.indexOf(sandbox) <= order.indexOf(agentSandbox)) return undefined;
  const narrower = order.slice(0, order.indexOf(agentSandbox) + 1);
  const runs =
    agents === undefined
      ? `names no sandbox, so its agent runs in \`${agentSandbox}\`, its harness's default`
      : `runs its agent in \`${agentSandbox}\``;
  return `${said.step}: \`${said.line}\` is wider than ${said.file}, which ${runs} ${tighten(said, `Name one as narrow or narrower — ${listed(narrower)} — or widen the sandbox`)}`;
}

/**
 * Whether an agent in permission mode `mode` already does what allow rule `rule` grants: the widest mode everything, and a mode that
 * writes unasked (`editsUnasked`) an `Edit` of a path inside its directory, which a bare `**` covers (`pathCovers`).
 */
function modeGrants(mode: string | undefined, rule: string): boolean {
  if (mode === WIDEST_MODE) return true;
  const { tool, inner } = ruleParts(rule);
  return tool === 'Edit' && inner !== undefined && editsUnasked(mode) && pathCovers('**', inner);
}

/** A permission rule's tool and what it names in its parentheses, `undefined` for a bare tool. */
function ruleParts(rule: string): { tool: string; inner?: string } {
  const open = rule.indexOf('(');
  return open < 0 ? { tool: rule } : { tool: rule.slice(0, open), inner: rule.slice(open + 1, -1) };
}

/**
 * Whether rule `by` covers rule `rule`: the same rule; a bare tool covering every rule of it (`Bash` covers `Bash(npm test)`); a prefix
 * rule covering a command it begins (`Bash(npm:*)` covers `Bash(npm test)` and `Bash(npm run:*)`, never `Bash(npmx)`); or a path rule
 * ending in `**` covering a path under it (`pathCovers`). Nothing else is read as covered, so a narrower rule written another way is
 * refused rather than a wider one let through.
 */
export function covers(by: string, rule: string): boolean {
  if (by === rule) return true;
  const outer = ruleParts(by);
  const inner = ruleParts(rule);
  if (outer.tool !== inner.tool) return false;
  if (outer.inner === undefined) return true;
  if (inner.inner === undefined) return false;
  return PATH_RULE_TOOLS.includes(outer.tool) ? pathCovers(outer.inner, inner.inner) : commandCovers(outer.inner, inner.inner);
}

/** The tools whose rules name a path, as gitignore does: `Read` and `Edit`, which every file-editing tool is matched against. */
const PATH_RULE_TOOLS = ['Read', 'Edit'];

/** What makes a command more than one, or sends its output elsewhere: an operator, a substitution, a redirection or a new line. */
const SHELL_JOINS = /[;&|`<>\n]|\$\(/;

/**
 * Whether a command prefix `by` (`npm:*`) covers `command`, itself a command or a prefix: the same words, or more words after them. A
 * command joined to another (`npm test && git push`), substituting one or redirecting is never covered, as the harness's prefix rules
 * permit none of them.
 */
function commandCovers(by: string, command: string): boolean {
  if (!by.endsWith(':*') || SHELL_JOINS.test(command)) return false;
  const prefix = by.slice(0, -2);
  const words = command.endsWith(':*') ? command.slice(0, -2) : command;
  return words === prefix || words.startsWith(`${prefix} `);
}

/**
 * Whether a path pattern ending in `**` covers `path`: `**` every path relative to the session's directory, and `notes/**` every path
 * under `notes/`. A path that climbs with `..`, or one anchored elsewhere (`/`, `//`, `~/`) under a bare `**`, is not covered.
 */
function pathCovers(by: string, path: string): boolean {
  const under = by.endsWith('**') ? by.slice(0, -2) : undefined;
  if (under === undefined || (under !== '' && !under.endsWith('/'))) return false;
  if (path.split('/').includes('..')) return false;
  return under === '' ? !/^[/~]/.test(path) : path.startsWith(under);
}
