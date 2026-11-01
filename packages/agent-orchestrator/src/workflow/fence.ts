/**
 * Fences only tighten: a step that names an agent, or is hired one, may narrow the agent's fence and never widen it. A step's
 * `disallowedTools:` adds to its agent's (`deniesWith`), so the session is refused the union and a step can never lift one of its agent's
 * denies. `fenceRefusal` judges the other fence keys a step writes itself, which replace its agent's — `tools:`, `allowedTools:`,
 * `permissionMode:` and `sandbox:` — against its agent's, a step that runs a fenced agent on the other harness, whose fence cannot be
 * compared with the agent's. `addedSkillsRefusal` judges a skill a step adds to its agent's, which the agent's fence must let the session
 * load.
 *
 * `writable:` is the one key that reaches past the fence's directory, and it widens where a step's writes reach, never what it may do:
 * `refuseUnwritable` refuses it over a fence that writes nothing.
 */
import { AGENTS_FOLDER, refuse, type StepAgent, type StepKey, type Workflow } from '../step/step.ts';
import { DEFAULT_HARNESS, isRemoteHarness } from '../harness/harness.ts';
import { bareSkillOf, rulesOf, toolsOf } from '../keys/index.ts';
import type { Agent } from '../agents/agents.ts';
import { fenceReach, type FenceReach } from 'agent-runtime/vocabulary';

/**
 * What harness `harness`'s fence words reach, the runtime's answer (`fenceReach`): the default harness's for one fenced by neither a mode
 * nor a sandbox, as every permission mode was judged before a step named its harness. Throws where the runtime has no answer for its own
 * default harness, an agent-runtime the orchestrator was not built with.
 */
const reachOf = (harness: string = DEFAULT_HARNESS): FenceReach => {
  const reach = fenceReach(harness) ?? fenceReach(DEFAULT_HARNESS);
  if (reach === undefined) {
    throw new Error(
      `agent-runtime names no fence words for its default harness ${DEFAULT_HARNESS}: install the agent-runtime this orchestrator was built with (npm install, from the repository's root).`,
    );
  }
  return reach;
};

/** How wide fence word `word` is on `reach`: 0 for a word the harness does not take, which `nemia start` refuses (`configRefused`). */
const rankOf = (reach: FenceReach, word: string): number => reach.rank[word] ?? 0;

/** The widest of a harness's fence words, the first of the top rank: on Claude Code the mode that asks about nothing. */
const widestOf = (reach: FenceReach): string =>
  Object.keys(reach.rank).reduce((wide, word) => (rankOf(reach, word) > rankOf(reach, wide) ? word : wide));

/**
 * Whether a session in permission mode `mode` — the runtime's default when `undefined` — writes in its directory unasked: the narrowest
 * mode that does and every wider one. Such a mode grants what an `allowedTools:` rule `Edit(…)` on a path inside the directory would.
 */
export const editsUnasked = (mode: string | undefined): boolean => {
  const modes = reachOf();
  return rankOf(modes, mode ?? modes.given) >= modes.writes;
};

/** The allow rules a session held to its directory keeps, as the path patterns covering every path inside it (`pathCovers`). */
const IN_DIRECTORY = ['Edit(**)', 'Read(**)'];

/**
 * The fence that holds a session of an agent to its directory, never wider than the agent's own (`fenceRefusal` lets it through):
 * the mode the runtime holds a session to its directory in, or the agent's mode `mode` where that is narrower; and `Edit(**)` under a
 * mode that edits unasked (`editsUnasked`), else those of the agent's allow rules `allows`, as written, that a rule inside the directory
 * covers. Undefined when the agent has allow rules and none is inside its directory: a step's allow list replaces its agent's and
 * cannot be empty, so the agent's own would run.
 */
export function directoryFence(
  mode: string | undefined,
  allows: string | undefined,
): { permissionMode: string; allowedTools: string[] } | undefined {
  const modes = reachOf();
  const own = mode ?? modes.given;
  const held = modes.held ?? own;
  const permissionMode = rankOf(modes, own) < rankOf(modes, held) ? own : held;
  if (editsUnasked(mode)) return { permissionMode, allowedTools: ['Edit(**)'] };
  const rules = (allows ?? '')
    .split(',')
    .map((rule) => rule.trim())
    .filter(Boolean);
  const allowedTools = rules.filter((rule) => IN_DIRECTORY.some((by) => covers(by, rule)));
  return rules.length && !allowedTools.length ? undefined : { permissionMode, allowedTools };
}

/** Whether a harness fences a session with a sandbox rather than a permission mode and rule lists, as the runtime answers. */
export const sandboxed = (harness: string): boolean => fenceReach(harness)?.by === 'sandbox';

/** The keys of a step's fence, either harness's: a sandboxed step's `permissionMode:` is read as its `sandbox:` before this sees it. */
export const FENCE_KEYS = ['tools', 'allowedTools', 'disallowedTools', 'permissionMode', 'sandbox'] as const;

/**
 * The keys a step's own file sets as its overrides of its agent's fence and composition: the fence keys, which only tighten the agent's
 * (`fenceRefusal`), and `skills:` and `mcp:`, which add to the agent's (`addedSkillsRefusal`; a server loaded allows no tool). Every
 * other key is the step's wiring, or one of its agent's role keys it sets in the agent's place.
 */
export const OVERRIDE_KEYS = [...FENCE_KEYS, 'skills', 'mcp'] as const satisfies readonly StepKey[];

/**
 * What an agent may offer a step to override (`overridable:`): each role key a step takes from it but its fence, `fence` for every fence
 * key at once (it only narrows), and `skills` and `mcp` (each only adds). The words of the agent's `overridable:` line.
 */
export const OVERRIDABLE = ['model', 'effort', 'context', 'harness', 'remote', 'output', 'fence', 'skills', 'mcp'] as const;
export type Overridable = (typeof OVERRIDABLE)[number];

/** What a step's key `key` overrides of its agent (`OVERRIDABLE`), or `undefined` for a key that is the step's own wiring. */
const overriddenBy = (key: string): Overridable | undefined =>
  (FENCE_KEYS as readonly string[]).includes(key)
    ? 'fence'
    : (OVERRIDABLE as readonly string[]).includes(key)
      ? (key as Overridable)
      : undefined;

/**
 * What step `step`'s own keys `own` override of its agent (`overriddenBy`), each once, in `OVERRIDABLE`'s order: the step's side of the
 * agent on a step, whatever brought the agent — its `agent:` line or a hire.
 */
export const overridesOf = (own: Partial<Record<string, string>>): Overridable[] => {
  const keys = Object.keys(own).flatMap((key) => (own[key] === undefined ? [] : [overriddenBy(key)]));
  return OVERRIDABLE.filter((word) => keys.includes(word));
};

/**
 * Why step `step` may not override what its own keys `own` override of agent `agent` (`overridesOf`), or `undefined` when it may: the
 * first that the agent's `overridable:` leaves out. An agent with no line offers everything. Judged on every load, from the files, the
 * same for a step that names its agent and one a factory hires it into. The refusal names the step, the key, the agent and its file,
 * and both fixes.
 */
export function offerRefusal(step: string, agent: Agent, own: Partial<Record<string, string>>): string | undefined {
  if (agent.overridable === undefined) return undefined;
  const file = `${AGENTS_FOLDER}/${agent.name}.md`;
  const offered = agent.overridable;
  const key = Object.keys(own).find((written) => {
    const word = own[written] === undefined ? undefined : overriddenBy(written);
    return word !== undefined && !offered.includes(word);
  });
  const word = key === undefined ? undefined : overriddenBy(key);
  if (key === undefined || word === undefined) return undefined;
  const what = word === 'fence' ? `its fence (\`${key}\`)` : `\`${key}\``;
  const offers = offered.length ? `offers ${offered.map((o) => `\`${o}\``).join(', ')}` : 'offers nothing';
  return `${step}: sets ${what}, which its agent ${agent.name} does not offer to override — ${file} ${offers} on its \`overridable:\` line. Add \`${word}\` to that line (every step of ${agent.name} may then override it), or delete the line from this step.`;
}

/** One of a fence's keys. */
type FenceKey = (typeof FENCE_KEYS)[number];

/** The words of a refusal that names one key: the step's line and its agent's file. */
type Said = { step: string; line: string; agent: string; file: string };

/** The fence words of `reach` as narrow as `own` or narrower, or `undefined` when `asked` is no wider than `own`. */
function narrowerThan(reach: FenceReach, asked: string, own: string): string[] | undefined {
  if (rankOf(reach, asked) <= rankOf(reach, own)) return undefined;
  return Object.keys(reach.rank).filter((word) => rankOf(reach, word) <= rankOf(reach, own));
}

/**
 * Why step `step` would widen its agent's fence, or `undefined` when it does not: `own` are the keys the step writes itself, the sandbox
 * under its own name (`codexSandboxNamed`), and `resolved` the step they were read into, with the agent's. A key the step does not write is
 * its agent's and widens nothing, nor does its `disallowedTools:`, which adds to its agent's (`deniesWith`). A remote step is left to
 * `remoteRefusal` in harness.ts, which refuses every fence key there. The refusal names the step, the key, what it would add, and the fix.
 */
export function fenceRefusal(step: string, agent: Agent, own: Partial<Record<StepKey, string>>, resolved: Workflow): string | undefined {
  const harness = resolved.harness ?? DEFAULT_HARNESS;
  if (isRemoteHarness(harness)) return undefined;
  const file = `${AGENTS_FOLDER}/${agent.name}.md`;
  const moved = movedRefusal(step, agent, file, harness);
  if (moved !== undefined) return moved;
  const judge: Record<Exclude<FenceKey, 'disallowedTools'>, (said: Said) => string | undefined> = {
    tools: (said) => toolsRefusal(said, resolved.tools ?? [], agentTools(agent, file)),
    allowedTools: (said) =>
      allowsRefusal(said, resolved.allowedTools ?? [], agentRules(agent, file, 'allowedTools'), agent.keys.permissionMode),
    permissionMode: (said) => modeRefusal(said, reachOf(harness), resolved.permissionMode ?? '', agent.keys.permissionMode),
    sandbox: (said) => sandboxRefusal(said, reachOf(harness), resolved.sandbox ?? '', agent.keys.sandbox),
  };
  for (const key of FENCE_KEYS) {
    if (key === 'disallowedTools') continue;
    const why = own[key] === undefined ? undefined : judge[key]({ step, line: `${key}: ${own[key]}`, agent: agent.name, file });
    if (why !== undefined) return why;
  }
  return undefined;
}

/**
 * Why step `step` may not add the skills `added` to its agent's, its line written as `line`, or `undefined` when it may: the first one the
 * agent does not give whose load the agent's own fence refuses — a `tools:` list with no `Skill`, or a deny covering `Skill(<skill>)`,
 * the skill by its bare name (`bareSkillOf`), as a session calls it.
 * Loading a skill is a call of `Skill`, so adding one past the agent's fence would widen it. A step on a sandboxed harness or a remote
 * agent is left to `composedRefusal`, which refuses skills there. The refusal names the step, the skill, the agent's file and both fixes.
 */
export function addedSkillsRefusal(
  step: string,
  agent: Agent,
  line: string,
  added: readonly string[],
  resolved: Workflow,
): string | undefined {
  const harness = resolved.harness ?? DEFAULT_HARNESS;
  if (isRemoteHarness(harness) || sandboxed(harness)) return undefined;
  const file = `${AGENTS_FOLDER}/${agent.name}.md`;
  const tools = agentTools(agent, file);
  const denies = agentRules(agent, file, 'disallowedTools');
  const untooled = tools !== undefined && !tools.includes('Skill');
  for (const skill of added.filter((name) => !agent.skills?.includes(name))) {
    const deny = denies.find((rule) => covers(rule, `Skill(${bareSkillOf(skill)})`));
    if (!untooled && deny === undefined) continue;
    const why = untooled ? `gives it \`tools: ${(tools ?? []).join(', ')}\`, with no \`Skill\`` : `denies it \`${deny}\``;
    const fix = untooled ? `Give ${agent.name} \`Skill\` in its \`tools:\`` : `Take \`${deny}\` off its \`disallowedTools:\``;
    return `${step}: \`skills: ${line}\` adds \`${skill}\` to ${agent.name}'s skills, and ${file} ${why}: a session loads a skill with the \`Skill\` tool, and a step never widens its agent's fence. ${fix} in ${file} (every step of ${agent.name} gets it), or take \`${skill}\` off this step's \`skills:\`.`;
  }
  return undefined;
}

/** The rules agent `agent`'s own `disallowedTools:` denies, `[]` for none. */
export const agentDeniesOf = (agent: Agent): string[] => agentRules(agent, `${AGENTS_FOLDER}/${agent.name}.md`, 'disallowedTools');

/**
 * What a session of a step is refused: the step's own `disallowedTools:` rules `own`, in their written order, then each of its agent's
 * denies `agents` that no rule of its own already covers (`covers`). A step's line adds to its agent's, so a deny the team adds to an
 * agent reaches every step that hires it, and a line copied before it still reads; a line that repeats every one of its agent's denies,
 * as every step's had to before, resolves to itself.
 */
export const deniesWith = (own: readonly string[], agents: readonly string[]): string[] => [
  ...own,
  ...agents.filter((deny) => !own.some((by) => covers(by, deny))),
];

/**
 * The denies step `step`'s own file writes, read back from the resolved step: its `disallowedTools` but those its agent gave it
 * (`StepAgent.agentDenies`), what `renderStep` writes and the brief tells as the step's own fence. The resolved list where the step's
 * provenance names none.
 */
export function ownDenies(step: { disallowedTools?: readonly string[] | null; agent?: string | StepAgent | null }): string[] {
  const given = typeof step.agent === 'object' && step.agent !== null ? step.agent.agentDenies : undefined;
  const denies = [...(step.disallowedTools ?? [])];
  return given === undefined ? denies : denies.filter((rule) => !given.includes(rule));
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

/** Refused: a permission mode wider than the agent's, or than the runtime's default when its file names none, as `modes` ranks them. */
function modeRefusal(said: Said, modes: FenceReach, mode: string, agents: string | undefined): string | undefined {
  const agentMode = agents ?? modes.given;
  const narrower = narrowerThan(modes, mode, agentMode);
  if (narrower === undefined) return undefined;
  const runs =
    agents === undefined
      ? `names no mode, so its agent runs in \`${agentMode}\`, the runtime's default`
      : `runs its agent in \`${agentMode}\``;
  return `${said.step}: \`${said.line}\` is wider than ${said.file}, which ${runs} ${tighten(said, `Name one as narrow or narrower — ${listed(narrower)} — or widen the mode`)}`;
}

/** Refused: a sandbox wider than the agent's, or than its harness's default when its file names none, as `sandboxes` ranks them. */
function sandboxRefusal(said: Said, sandboxes: FenceReach, sandbox: string, agents: string | undefined): string | undefined {
  const agentSandbox = agents ?? sandboxes.given;
  const narrower = narrowerThan(sandboxes, sandbox, agentSandbox);
  if (narrower === undefined) return undefined;
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
  if (mode === widestOf(reachOf())) return true;
  const { tool, inner } = ruleParts(rule);
  return tool === 'Edit' && inner !== undefined && editsUnasked(mode) && pathCovers('**', inner);
}

/**
 * The tool permission rule `rule` names, whether the rule is the bare tool or names what it reaches in parentheses: `Bash(git log:*)`
 * names `Bash`. Over `ruleParts`, so one parser reads a rule for what covers what (`covers`) and for whether any rule names a tool at
 * all (`unallowedRefusal`).
 */
export const toolOf = (rule: string): string => ruleParts(rule).tool;

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

/** The tools that write a file: the Edit tool's family, and Bash, whose redirection writes where an edit rule lets it. */
const WRITING_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash'];

/**
 * Why step `step`'s fence, as resolved with its agent's, writes nothing, or `undefined` when it writes: the narrowest word of its harness,
 * `plan` or `read-only`; a `tools:` list with no tool that writes a file (`WRITING_TOOLS`); or a permission mode narrower than the
 * narrowest that writes unasked (`editsUnasked`) with no `Edit` rule in `allowedTools:`, where the rule a writable mount is filed with
 * would be its first write.
 */
function unwrittenBy(step: Workflow): string | undefined {
  const reach = reachOf(step.harness);
  const word = step.sandbox ?? step.permissionMode ?? reach.given;
  if (Object.hasOwn(reach.rank, word) && rankOf(reach, word) === 0) return `runs in \`${word}\`, which writes nothing`;
  if (step.tools && !step.tools.some((tool) => WRITING_TOOLS.includes(tool)))
    return `has ${step.tools.length ? `only the tools ${listed(step.tools)}` : 'no tool'}, and none writes a file`;
  const edits = (step.allowedTools ?? []).some((rule) => ruleParts(rule).tool === 'Edit');
  if (reach.by === 'mode' && rankOf(reach, word) < reach.writes && !edits)
    return `runs in \`${word}\`, which asks before an edit, and allows no \`Edit\` rule, so it writes nothing`;
  return undefined;
}

/**
 * Refuses `writable:` on a step whose fence, as resolved with its agent's (`agent`, by name), writes nothing (`unwrittenBy`). The key
 * widens where a step's writes reach, and gives no write to a step that has none.
 */
export function refuseUnwritable(step: Workflow, agent: string | undefined): void {
  if (!step.writable) return;
  const why = unwrittenBy(step);
  if (!why) return;
  const whose = agent === undefined ? 'its fence' : `its fence, with ${AGENTS_FOLDER}/${agent}.md's`;
  refuse(
    `${step.name}: \`writable: ${step.writable.join(', ')}\` lets the step write those folders, and ${whose}, ${why}: \`writable:\` widens where a step's writes reach, never what it may do. Delete the line, or run the step on a fence that writes — an agent whose file allows \`Edit(**)\`, say.`,
  );
}
